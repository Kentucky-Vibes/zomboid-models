import { XMLParser } from 'fast-xml-parser';

import type { ManifestClip, Stance } from 'zomboid-models/format';

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
  isArray: (name) => name === 'm_Conditions',
});

type XmlValue = string | XmlValue[] | { [key: string]: XmlValue } | undefined;

function asRecord(value: XmlValue): Record<string, XmlValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function text(record: Record<string, XmlValue>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(record: Record<string, XmlValue>, key: string): number | undefined {
  const value = text(record, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface AnimNodeCondition {
  name: string;
  type: string;
  value: string;
}

/** The fields of an `animNode` XML that matter for picking and playing a clip. */
export interface AnimNode {
  name: string;
  animName: string | undefined;
  /** `m_SpeedScale` when it is a literal number; a variable name gives 1 like the game's default. */
  speed: number;
  speedRandom: [number, number] | undefined;
  randomStart: number | undefined;
  looped: boolean;
  conditions: AnimNodeCondition[];
  /** Value of the `Weapon` string condition, when the node has one. */
  weapon: string | undefined;
}

/** Reads an `animNode` XML. */
export function parseAnimNode(xml: string): AnimNode | undefined {
  const document = parser.parse(xml) as Record<string, XmlValue>;
  const node = asRecord(document['animNode']);
  const name = text(node, 'm_Name');
  if (name === undefined) return undefined;
  const conditions: AnimNodeCondition[] = [];
  let weapon: string | undefined;
  for (const entry of Array.isArray(node['m_Conditions']) ? node['m_Conditions'] : []) {
    const condition = asRecord(entry);
    const conditionName = text(condition, 'm_Name');
    if (conditionName === undefined) continue;
    const conditionType = text(condition, 'm_Type') ?? '';
    const value = text(condition, 'm_Value') ?? '';
    conditions.push({ name: conditionName, type: conditionType, value });
    if (conditionName === 'Weapon' && conditionType === 'STRING') weapon = value.toLowerCase();
  }
  const min = number(node, 'm_SpeedScaleRandomMultiplierMin');
  const max = number(node, 'm_SpeedScaleRandomMultiplierMax');
  const randomStart = number(node, 'm_randomAdvanceFraction');
  return {
    name,
    animName: text(node, 'm_AnimName'),
    speed: number(node, 'm_SpeedScale') ?? 1,
    speedRandom:
      min !== undefined && max !== undefined && (min !== 1 || max !== 1) ? [min, max] : undefined,
    randomStart: randomStart !== undefined && randomStart > 0 ? randomStart : undefined,
    looped: text(node, 'm_Looped')?.toLowerCase() !== 'false',
    conditions,
    weapon,
  };
}

/** The clip and playback parameters of a node, without undefined fields. */
export function clipOf(node: AnimNode, animName: string): ManifestClip {
  return {
    clip: animName,
    speed: node.speed,
    ...(node.speedRandom ? { speedRandom: node.speedRandom } : {}),
    ...(node.randomStart !== undefined ? { randomStart: node.randomStart } : {}),
  };
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

/** Whether a node's boolean conditions hold for the given variables; unknown variables fail. */
export function conditionsHold(node: AnimNode, variables: Record<string, string>): boolean {
  return node.conditions.every((condition) => {
    const value = variables[condition.name];
    if (value === undefined) return false;
    return value.toLowerCase() === condition.value.toLowerCase();
  });
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
