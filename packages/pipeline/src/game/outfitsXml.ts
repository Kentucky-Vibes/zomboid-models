import { XMLParser } from 'fast-xml-parser';

/** One item reference of an outfit, as `clothing.xml` nests them, with the raw GUID. */
export interface OutfitItemXml {
  guid: string;
  probability: number;
  subItems: OutfitItemXml[];
}

/** One outfit of `media/clothing/clothing.xml`. */
export interface OutfitXml {
  name: string;
  guid: string | undefined;
  top: boolean;
  pants: boolean;
  allowPantsHue: boolean;
  allowPantsTint: boolean;
  allowTopTint: boolean;
  allowTshirtDecal: boolean;
  items: OutfitItemXml[];
}

export interface OutfitsXml {
  male: OutfitXml[];
  female: OutfitXml[];
}

const LIST_ELEMENTS = new Set(['m_MaleOutfits', 'm_FemaleOutfits', 'm_items', 'subItems']);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => LIST_ELEMENTS.has(name),
});

type XmlValue = string | XmlValue[] | { [key: string]: XmlValue } | undefined;

function asRecord(value: XmlValue): Record<string, XmlValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

function asList(value: XmlValue): XmlValue[] {
  return Array.isArray(value) ? value : [];
}

function text(record: Record<string, XmlValue>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function boolean(record: Record<string, XmlValue>, key: string, fallback: boolean): boolean {
  const value = text(record, key)?.toLowerCase();
  if (value === undefined) return fallback;
  return value === 'true';
}

function readItem(value: XmlValue): OutfitItemXml | undefined {
  const record = asRecord(value);
  const guid = text(record, 'itemGUID');
  if (guid === undefined) return undefined;
  const probability = Number(text(record, 'probability') ?? '1');
  return {
    guid,
    probability: Number.isFinite(probability) ? probability : 1,
    subItems: asList(record['subItems'])
      .map(readItem)
      .filter((item): item is OutfitItemXml => item !== undefined),
  };
}

function readOutfit(value: XmlValue): OutfitXml | undefined {
  const record = asRecord(value);
  const name = text(record, 'm_Name');
  if (name === undefined) return undefined;
  return {
    name,
    guid: text(record, 'm_Guid'),
    top: boolean(record, 'm_Top', true),
    pants: boolean(record, 'm_Pants', true),
    allowPantsHue: boolean(record, 'm_AllowPantsHue', true),
    allowPantsTint: boolean(record, 'm_AllowPantsTint', false),
    allowTopTint: boolean(record, 'm_AllowTopTint', true),
    allowTshirtDecal: boolean(record, 'm_AllowTShirtDecal', true),
    items: asList(record['m_items'])
      .map(readItem)
      .filter((item): item is OutfitItemXml => item !== undefined),
  };
}

/** Parses `media/clothing/clothing.xml`, the game's outfit list. */
export function parseOutfitsXml(xml: string): OutfitsXml {
  const document = parser.parse(xml) as Record<string, XmlValue>;
  const root = asRecord(document['outfitManager']);
  return {
    male: asList(root['m_MaleOutfits'])
      .map(readOutfit)
      .filter((outfit): outfit is OutfitXml => outfit !== undefined),
    female: asList(root['m_FemaleOutfits'])
      .map(readOutfit)
      .filter((outfit): outfit is OutfitXml => outfit !== undefined),
  };
}
