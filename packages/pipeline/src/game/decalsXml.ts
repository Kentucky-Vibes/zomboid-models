import { XMLParser } from 'fast-xml-parser';

import { textureKeyFromReference } from './clothingXml.js';

export interface DecalXml {
  /** Texture key under `media/textures`. */
  texture: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'group' || name === 'decal',
});

type XmlValue = string | XmlValue[] | { [key: string]: XmlValue } | undefined;

function asRecord(value: XmlValue): Record<string, XmlValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function number(record: Record<string, XmlValue>, key: string): number {
  const value = Number(record[key]);
  if (!Number.isFinite(value)) throw new Error(`decal field "${key}" is not a number`);
  return value;
}

/** Parses `media/clothing/clothingDecals.xml` into group name to decal names. */
export function parseDecalGroupsXml(xml: string): Record<string, string[]> {
  const document = parser.parse(xml) as Record<string, XmlValue>;
  const root = asRecord(document['clothingDecals']);
  const groups: Record<string, string[]> = {};
  for (const entry of Array.isArray(root['group']) ? root['group'] : []) {
    const group = asRecord(entry);
    const name = typeof group['name'] === 'string' ? group['name'] : undefined;
    if (!name) continue;
    groups[name] = (Array.isArray(group['decal']) ? group['decal'] : []).filter(
      (d): d is string => typeof d === 'string' && d.length > 0,
    );
  }
  return groups;
}

/** Parses one `media/clothing/clothingDecals/<name>.xml`. */
export function parseDecalXml(xml: string): DecalXml {
  const document = parser.parse(xml) as Record<string, XmlValue>;
  const root = asRecord(document['clothingDecal']);
  const texture = root['texture'];
  if (typeof texture !== 'string' || texture.length === 0) {
    throw new Error('decal has no texture');
  }
  return {
    texture: textureKeyFromReference(texture),
    x: number(root, 'x'),
    y: number(root, 'y'),
    width: number(root, 'width'),
    height: number(root, 'height'),
  };
}
