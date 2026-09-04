import { XMLParser } from 'fast-xml-parser';

import { modelKeyFromReference, textureKeyFromReference } from './clothingXml.js';

export interface HairStyleXml {
  name: string;
  /** Model key, or undefined for the bald style. */
  model: string | undefined;
  texture: string;
  level: number;
  /** Replacement style name per hat category; the game uses `default` for any hat. */
  alternates: Record<string, string>;
  noChoose: boolean;
}

export interface BeardStyleXml {
  name: string;
  model: string | undefined;
  texture: string;
  level: number;
  growReference: boolean;
  trimChoices: string[];
}

export interface HairStylesXml {
  male: HairStyleXml[];
  female: HairStyleXml[];
}

const DEFAULT_HAIR_TEXTURE = 'f_hair_white';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ['male', 'female', 'style', 'alternate', 'trimChoices'].includes(name),
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

function model(record: Record<string, XmlValue>): string | undefined {
  const value = text(record, 'model');
  return value === undefined ? undefined : modelKeyFromReference(value);
}

function texture(record: Record<string, XmlValue>): string {
  const value = text(record, 'texture');
  return value === undefined ? DEFAULT_HAIR_TEXTURE : textureKeyFromReference(value);
}

function level(record: Record<string, XmlValue>): number {
  const value = Number(text(record, 'level') ?? '0');
  return Number.isFinite(value) ? value : 0;
}

function readHairStyle(value: XmlValue): HairStyleXml {
  const record = asRecord(value);
  const name = text(record, 'name');
  if (name === undefined) throw new Error('hair style without a name');
  const alternates: Record<string, string> = {};
  for (const entry of asList(record['alternate'])) {
    const alt = asRecord(entry);
    const category = text(alt, '@_category');
    const style = text(alt, '@_style');
    if (category !== undefined && style !== undefined) alternates[category.toLowerCase()] = style;
  }
  return {
    name,
    model: model(record),
    texture: texture(record),
    level: level(record),
    alternates,
    noChoose: text(record, 'noChoose')?.toLowerCase() === 'true',
  };
}

/** Parses `media/hairStyles/hairStyles.xml`. */
export function parseHairStylesXml(xml: string): HairStylesXml {
  const document = parser.parse(xml) as Record<string, XmlValue>;
  const root = asRecord(document['hairStyles']);
  return {
    male: asList(root['male']).map(readHairStyle),
    female: asList(root['female']).map(readHairStyle),
  };
}

/** Parses `media/hairStyles/beardStyles.xml`. */
export function parseBeardStylesXml(xml: string): BeardStyleXml[] {
  const document = parser.parse(xml) as Record<string, XmlValue>;
  const root = asRecord(document['beardStyles']);
  return asList(root['style']).map((value) => {
    const record = asRecord(value);
    const name = text(record, 'name');
    if (name === undefined) throw new Error('beard style without a name');
    return {
      name,
      model: model(record),
      texture: texture(record),
      level: level(record),
      growReference: text(record, 'growReference')?.toLowerCase() === 'true',
      trimChoices: asList(record['trimChoices']).filter((v): v is string => typeof v === 'string'),
    };
  });
}
