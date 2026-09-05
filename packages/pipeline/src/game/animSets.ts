import { XMLParser } from 'fast-xml-parser';

import type { ManifestClip, ManifestClipBlend, Stance } from 'zomboid-models/format';

import { entryValue, type ScriptBlock } from './scripts.js';

/** Weapon types as the game's animation variable `Weapon` names them. */
export type WeaponType =
  | 'unarmed'
  | '1handed'
  | '2handed'
  | 'heavy'
  | 'knife'
  | 'spear'
  | 'handgun'
  | 'firearm'
  | 'throwing'
  | 'chainsaw';

export interface IdleClipTable {
  /** Clip for an unarmed character, or for weapon types without their own idle. */
  default: ManifestClip;
  byWeaponType: Partial<Record<WeaponType, ManifestClip>>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'm_Conditions' || name === 'm_2DBlends' || name === 'm_2DBlendTri',
});

type XmlValue = string | XmlValue[] | { [key: string]: XmlValue } | undefined;
type XmlRecord = Record<string, XmlValue>;

function asRecord(value: XmlValue): XmlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function text(record: XmlRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(record: XmlRecord, key: string): number | undefined {
  const value = text(record, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface AnimNodeCondition {
  name: string;
  /** `BOOL`, `STRING`, `STRNEQ`, `EQU`, `NEQ`, `LESS`, `GTR`, or `OR`, which starts a new group. */
  type: string;
  value: string;
}

/** One entry of a node's 2D blend: a clip at a point of the blend space. */
export interface AnimBlendEntry {
  animName: string;
  x: number;
  y: number;
}

/** The fields of an `animNode` XML that matter for picking and playing a clip. */
export interface AnimNode {
  name: string;
  animName: string | undefined;
  /** The variables on the two axes of the 2D blend (`m_Scalar`, `m_Scalar2`). */
  scalarX: string | undefined;
  scalarY: string | undefined;
  /** The clips of the 2D blend, in file order (the file's reference ids, from 1). */
  blends: AnimBlendEntry[];
  /** The triangles the blend space is cut into, as indices into `blends`. */
  triangles: [number, number, number][];
  /** `m_SpeedScale` when it is a literal number; a variable name gives 1 like the game's default. */
  speed: number;
  /** The variable `m_SpeedScale` names when it is not a number. */
  speedVariable: string | undefined;
  speedRandom: [number, number] | undefined;
  randomStart: number | undefined;
  looped: boolean;
  conditions: AnimNodeCondition[];
  /** `m_ConditionPriority`: breaks ties between nodes whose conditions all hold. */
  priority: number;
  /** Value of the `Weapon` string condition, when the node has one. */
  weapon: string | undefined;
}

/** Loads the XML of the file a node extends, by the name the `x_extends` attribute gives. */
export type ParentLoader = (fileName: string) => string | undefined;

/**
 * The `animNode` record of an XML file, with the parent named by `x_extends` merged under it.
 * The game's loader applies a child over its parent field by field: a scalar replaces the
 * parent's; in a repeated block (conditions, blends, events) an entry with an `x_name` replaces
 * the parent's entry of that name, one without replaces the entry at the same position, and
 * entries past the parent's list are appended.
 */
function animNodeRecord(xml: string, loadParent?: ParentLoader, depth = 0): XmlRecord | undefined {
  const document = parser.parse(xml) as XmlRecord;
  const node = asRecord(document['animNode']);
  if (Object.keys(node).length === 0) return undefined;
  const parentName = text(node, '@_x_extends');
  if (parentName === undefined || !loadParent || depth > 8) return node;
  const parentXml = loadParent(parentName);
  if (parentXml === undefined) return node;
  const parent = animNodeRecord(parentXml, loadParent, depth + 1);
  return parent ? mergeAnimNodeRecords(parent, node) : node;
}

function isRecord(value: XmlValue): value is XmlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeAnimNodeRecords(parent: XmlRecord, child: XmlRecord): XmlRecord {
  const merged: XmlRecord = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    if (key === '@_x_extends') continue;
    const base = merged[key];
    const isList = Array.isArray(value) || Array.isArray(base);
    if (!isList || value === undefined) {
      // A matched entry is merged field by field, so a child may override one field of it.
      merged[key] = isRecord(value) && isRecord(base) ? mergeAnimNodeRecords(base, value) : value;
      continue;
    }
    const list = [...(Array.isArray(base) ? base : base === undefined ? [] : [base])];
    const entries = Array.isArray(value) ? value : [value];
    let unnamed = 0;
    for (const entry of entries) {
      const name = text(asRecord(entry), '@_x_name');
      let index: number;
      if (name !== undefined) {
        index = list.findIndex((e) => text(asRecord(e), '@_x_name') === name);
      } else {
        index = unnamed < list.length ? unnamed : -1;
        unnamed++;
      }
      const existing = index >= 0 ? list[index] : undefined;
      if (index >= 0 && isRecord(existing) && isRecord(entry)) {
        list[index] = mergeAnimNodeRecords(existing, entry);
      } else if (index >= 0) {
        list[index] = entry;
      } else {
        list.push(entry);
      }
    }
    merged[key] = list;
  }
  return merged;
}

/** Reads an `animNode` XML, following `x_extends` when a loader for the parent files is given. */
export function parseAnimNode(xml: string, loadParent?: ParentLoader): AnimNode | undefined {
  const node = animNodeRecord(xml, loadParent);
  if (!node) return undefined;
  const name = text(node, 'm_Name');
  if (name === undefined) return undefined;
  const conditions: AnimNodeCondition[] = [];
  let weapon: string | undefined;
  for (const entry of Array.isArray(node['m_Conditions']) ? node['m_Conditions'] : []) {
    const condition = asRecord(entry);
    const conditionType = (text(condition, 'm_Type') ?? '').toUpperCase();
    // An OR entry carries no variable of its own; it only separates the groups.
    const conditionName = text(condition, 'm_Name') ?? (conditionType === 'OR' ? '' : undefined);
    if (conditionName === undefined) continue;
    const value = text(condition, 'm_Value') ?? '';
    conditions.push({ name: conditionName, type: conditionType, value });
    if (conditionName.toLowerCase() === 'weapon' && conditionType === 'STRING') {
      weapon = value.toLowerCase();
    }
  }
  const min = number(node, 'm_SpeedScaleRandomMultiplierMin');
  const max = number(node, 'm_SpeedScaleRandomMultiplierMax');
  const randomStart = number(node, 'm_randomAdvanceFraction');
  const blends: AnimBlendEntry[] = [];
  for (const entry of Array.isArray(node['m_2DBlends']) ? node['m_2DBlends'] : []) {
    const blend = asRecord(entry);
    const animName = text(blend, 'm_AnimName');
    if (animName === undefined) continue;
    blends.push({ animName, x: number(blend, 'm_XPos') ?? 0, y: number(blend, 'm_YPos') ?? 0 });
  }
  const triangles: [number, number, number][] = [];
  for (const entry of Array.isArray(node['m_2DBlendTri']) ? node['m_2DBlendTri'] : []) {
    const tri = asRecord(entry);
    const corners = [number(tri, 'node1'), number(tri, 'node2'), number(tri, 'node3')];
    if (corners.every((c) => c !== undefined && c >= 1 && c <= blends.length)) {
      triangles.push(corners.map((c) => (c as number) - 1) as [number, number, number]);
    }
  }
  const speedText = text(node, 'm_SpeedScale');
  const speed = number(node, 'm_SpeedScale');
  return {
    name,
    animName: text(node, 'm_AnimName'),
    scalarX: text(node, 'm_Scalar'),
    scalarY: text(node, 'm_Scalar2'),
    blends,
    triangles,
    speed: speed ?? 1,
    speedVariable: speed === undefined && speedText !== undefined ? speedText : undefined,
    speedRandom:
      min !== undefined && max !== undefined && (min !== 1 || max !== 1) ? [min, max] : undefined,
    randomStart: randomStart !== undefined && randomStart > 0 ? randomStart : undefined,
    looped: text(node, 'm_Looped')?.toLowerCase() !== 'false',
    conditions,
    priority: number(node, 'm_ConditionPriority') ?? 0,
    weapon,
  };
}

/** The clip and playback parameters of a node, without undefined fields. */
export function clipOf(node: AnimNode, animName: string): ManifestClip {
  return {
    clip: animName,
    speed: node.speed,
    ...(node.speedVariable !== undefined ? { speedVariable: node.speedVariable } : {}),
    ...(node.speedRandom ? { speedRandom: node.speedRandom } : {}),
    ...(node.randomStart !== undefined ? { randomStart: node.randomStart } : {}),
  };
}

/**
 * The clips a 2D blend plays at a point, with their shares: the barycentric weights of the
 * triangle that holds the point, as `Anim2DBlend` mixes them. A point outside every triangle
 * takes the nearest entry whole. Entries with no weight are dropped.
 */
export function blendWeights(node: AnimNode, x: number, y: number): ManifestClipBlend[] {
  if (node.blends.length === 0) return [];
  for (const [a, b, c] of node.triangles) {
    const pa = node.blends[a] as AnimBlendEntry;
    const pb = node.blends[b] as AnimBlendEntry;
    const pc = node.blends[c] as AnimBlendEntry;
    const area = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
    if (Math.abs(area) < 1e-9) continue;
    const wb = ((x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (y - pa.y)) / area;
    const wc = ((pb.x - pa.x) * (y - pa.y) - (x - pa.x) * (pb.y - pa.y)) / area;
    const wa = 1 - wb - wc;
    const epsilon = 1e-6;
    if (wa < -epsilon || wb < -epsilon || wc < -epsilon) continue;
    return mergeWeights([
      [pa.animName, wa],
      [pb.animName, wb],
      [pc.animName, wc],
    ]);
  }
  let nearest = node.blends[0] as AnimBlendEntry;
  for (const entry of node.blends) {
    if (Math.hypot(entry.x - x, entry.y - y) < Math.hypot(nearest.x - x, nearest.y - y)) {
      nearest = entry;
    }
  }
  return [{ clip: nearest.animName, weight: 1 }];
}

function mergeWeights(pairs: [string, number][]): ManifestClipBlend[] {
  const weights = new Map<string, number>();
  for (const [clip, weight] of pairs) {
    if (weight <= 1e-6) continue;
    weights.set(clip, (weights.get(clip) ?? 0) + weight);
  }
  return [...weights]
    .map(([clip, weight]) => ({ clip, weight }))
    .sort((a, b) => b.weight - a.weight);
}

/** A blended node's clip entry at a point: the heaviest clip named, the blend listed when mixed. */
export function blendedClipOf(node: AnimNode, x: number, y: number): ManifestClip | undefined {
  const blend = blendWeights(node, x, y);
  const heaviest = blend[0]?.clip ?? node.animName;
  if (heaviest === undefined) return undefined;
  const clip = clipOf(node, heaviest);
  return blend.length > 1 ? { ...clip, blend } : clip;
}

/**
 * Builds the idle clip table from the nodes of `media/AnimSets/player/idle`. Sneaking variants
 * are skipped; the node named `Idle` is the default.
 */
export function buildIdleClipTable(nodes: readonly AnimNode[]): IdleClipTable {
  const table: IdleClipTable = { default: { clip: 'Bob_Idle', speed: 1 }, byWeaponType: {} };
  for (const node of nodes) {
    if (!node.animName || node.name.toLowerCase().startsWith('sneak')) continue;
    if (node.weapon === undefined) {
      if (node.name.toLowerCase() === 'idle') table.default = clipOf(node, node.animName);
      continue;
    }
    table.byWeaponType[node.weapon as WeaponType] = clipOf(node, node.animName);
  }
  return table;
}

/**
 * Where each stance's clip comes from: the animation set, the state folder, and how to pick the
 * node in it (the first node whose conditions match the given variables, in file order).
 */
export interface StanceSource {
  animSet: string;
  state: string;
  /** Boolean variables the node's conditions are evaluated against. */
  variables?: Record<string, string>;
  /** A node name to prefer, when the state has several. */
  node?: string;
}

export const STANCE_SOURCES: Record<'player' | 'zombie', Partial<Record<Stance, StanceSource>>> = {
  player: {
    corpse: { animSet: 'player', state: 'deadbody', node: 'deadbody_default' },
    sitting: { animSet: 'player', state: 'sitonground', node: 'sitonground' },
  },
  zombie: {
    standing: { animSet: 'zombie', state: 'idle' },
    crawling: { animSet: 'zombie-crawler', state: 'idle', variables: { FallOnFront: 'true' } },
    onBack: { animSet: 'zombie-crawler', state: 'idle', variables: { FallOnFront: 'false' } },
    sitting: { animSet: 'zombie', state: 'sitting' },
    corpse: { animSet: 'zombie', state: 'onground', variables: { FallOnFront: 'false' } },
  },
};

/** Variable names are matched without regard to case, as the game's variable registry does. */
function lookup(variables: Record<string, string>, name: string): string | undefined {
  if (variables[name] !== undefined) return variables[name];
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(variables)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

/**
 * `AnimCondition.pass` for one condition. A variable the character never set counts as the
 * empty string for string tests and as false for boolean ones, and fails every numeric test.
 */
function conditionHolds(condition: AnimNodeCondition, variables: Record<string, string>): boolean {
  const value = lookup(variables, condition.name);
  const expected = condition.value;
  switch (condition.type) {
    case 'STRING':
      return (value ?? '').toLowerCase() === expected.toLowerCase();
    case 'STRNEQ':
      return (value ?? '').toLowerCase() !== expected.toLowerCase();
    case 'BOOL':
      return (value ?? 'false').toLowerCase() === expected.toLowerCase();
    case 'EQU':
    case 'NEQ':
    case 'LESS':
    case 'GTR':
    case 'ABSLESS':
    case 'ABSGTR': {
      if (value === undefined) return false;
      const actual = Number(value);
      const threshold = Number(expected);
      if (!Number.isFinite(actual) || !Number.isFinite(threshold)) return false;
      if (condition.type === 'EQU') return actual === threshold;
      if (condition.type === 'NEQ') return actual !== threshold;
      if (condition.type === 'LESS') return actual < threshold;
      if (condition.type === 'GTR') return actual > threshold;
      if (condition.type === 'ABSLESS') return Math.abs(actual) < threshold;
      return Math.abs(actual) > threshold;
    }
    default:
      return (value ?? '').toLowerCase() === expected.toLowerCase();
  }
}

/**
 * Whether a node's conditions hold for the given variables, as `AnimCondition.pass` reads
 * them: conditions are joined with AND, and an `OR` entry ends a group, so the list holds when
 * any group does.
 */
export function conditionsHold(node: AnimNode, variables: Record<string, string>): boolean {
  let groupHolds = true;
  for (const condition of node.conditions) {
    if (condition.type === 'OR') {
      if (groupHolds) return true;
      groupHolds = true;
      continue;
    }
    if (groupHolds && !conditionHolds(condition, variables)) groupHolds = false;
  }
  return groupHolds;
}

/**
 * The node the game would select among those of a state for the given variables: every
 * condition must hold, and of the nodes that qualify the highest `m_ConditionPriority` wins,
 * then the one with the most conditions, then the first in file order, as
 * `AnimNode.compareSelectionConditions` orders them.
 */
export function pickNode(
  nodes: readonly { fileName: string; node: AnimNode }[],
  variables: Record<string, string>,
): AnimNode | undefined {
  let best: AnimNode | undefined;
  for (const { node } of nodes) {
    if (node.animName === undefined && node.blends.length === 0) continue;
    if (!conditionsHold(node, variables)) continue;
    if (
      best === undefined ||
      node.priority > best.priority ||
      (node.priority === best.priority && node.conditions.length > best.conditions.length)
    ) {
      best = node;
    }
  }
  return best;
}

/** Picks the node of a state for a stance: by name first, then by conditions, then the first. */
export function pickStanceNode(
  nodes: readonly { fileName: string; node: AnimNode }[],
  source: StanceSource,
): AnimNode | undefined {
  const withClip = nodes.filter(({ node }) => node.animName !== undefined);
  if (source.node !== undefined) {
    const named = withClip.find(
      ({ fileName, node }) =>
        fileName.toLowerCase() === source.node?.toLowerCase() ||
        node.name.toLowerCase() === source.node?.toLowerCase(),
    );
    if (named) return named.node;
  }
  if (source.variables !== undefined) {
    const variables = source.variables;
    const matching = withClip.find(
      ({ node }) => node.conditions.length > 0 && conditionsHold(node, variables),
    );
    if (matching) return matching.node;
  }
  const unconditional = withClip.find(({ node }) => node.conditions.length === 0);
  return (unconditional ?? withClip[0])?.node;
}

function flag(item: ScriptBlock, key: string): boolean {
  return (entryValue(item, key) ?? '').trim().toLowerCase() === 'true';
}

/**
 * The weapon type the game assigns to a held item, derived from its script the way
 * `WeaponType.getWeaponType` does: the swing animation first, then the hand flags.
 */
export function weaponTypeOf(item: ScriptBlock): WeaponType {
  const swing = (entryValue(item, 'SwingAnim') ?? '').trim().toLowerCase();
  const type = (entryValue(item, 'Type') ?? '').trim().toLowerCase();
  const twoHanded = flag(item, 'TwoHandWeapon') || flag(item, 'RequiresEquippedBothHands');
  if (type === 'chainsaw') return 'chainsaw';
  switch (swing) {
    case 'stab':
      return 'knife';
    case 'heavy':
      return 'heavy';
    case 'throw':
    case 'stone':
      return 'throwing';
    case 'spear':
      return 'spear';
    case 'rifle':
      return 'firearm';
    case 'handgun':
      return 'handgun';
    default:
      break;
  }
  if (flag(item, 'Ranged') || flag(item, 'IsAimedFirearm')) {
    return twoHanded ? 'firearm' : 'handgun';
  }
  if (swing.length === 0 && entryValue(item, 'WeaponSprite') === undefined) return 'unarmed';
  return twoHanded ? '2handed' : '1handed';
}
