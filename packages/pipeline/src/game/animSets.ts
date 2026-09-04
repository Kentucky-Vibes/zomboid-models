import { XMLParser } from 'fast-xml-parser';

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
  default: string;
  byWeaponType: Partial<Record<WeaponType, string>>;
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

export interface IdleAnimNode {
  name: string;
  animName: string | undefined;
  /** Value of the `Weapon` string condition, when the node has one. */
  weapon: string | undefined;
}

/** Reads the fields of an `animNode` XML that matter for picking an idle clip. */
export function parseAnimNode(xml: string): IdleAnimNode | undefined {
  const document = parser.parse(xml) as Record<string, XmlValue>;
  const node = asRecord(document['animNode']);
  const name = text(node, 'm_Name');
  if (name === undefined) return undefined;
  let weapon: string | undefined;
  const conditions = node['m_Conditions'];
  for (const entry of Array.isArray(conditions) ? conditions : []) {
    const condition = asRecord(entry);
    if (text(condition, 'm_Name') === 'Weapon' && text(condition, 'm_Type') === 'STRING') {
      weapon = text(condition, 'm_Value')?.toLowerCase();
    }
  }
  return { name, animName: text(node, 'm_AnimName'), weapon };
}

/**
 * Builds the idle clip table from the nodes of `media/AnimSets/player/idle`. Sneaking variants
 * are skipped; the node named `Idle` is the default.
 */
export function buildIdleClipTable(nodes: readonly IdleAnimNode[]): IdleClipTable {
  const table: IdleClipTable = { default: 'Bob_Idle', byWeaponType: {} };
  for (const node of nodes) {
    if (!node.animName || node.name.toLowerCase().startsWith('sneak')) continue;
    if (node.weapon === undefined) {
      if (node.name.toLowerCase() === 'idle') table.default = node.animName;
      continue;
    }
    table.byWeaponType[node.weapon as WeaponType] = node.animName;
  }
  return table;
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
