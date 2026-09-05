import { XMLParser } from 'fast-xml-parser';

/** One `media/clothing/clothingItems/<name>.xml`, with paths normalised. */
export interface ClothingItemXml {
  guid: string | undefined;
  /** Model keys per sex: lowercased path under models_X without extension, or undefined. */
  maleModel: string | undefined;
  femaleModel: string | undefined;
  altMaleModel: string | undefined;
  altFemaleModel: string | undefined;
  static: boolean;
  attachBone: string | undefined;
  allowRandomHue: boolean;
  allowRandomTint: boolean;
  /** Mask part indices as written. */
  masks: number[];
  /** Texture folder path keys, lowercased, without the `media/textures/` prefix. */
  masksFolder: string | undefined;
  underlayMasksFolder: string | undefined;
  /** Texture keys, lowercased with forward slashes, without extension. */
  textureChoices: string[];
  baseTextures: string[];
  hatCategory: string | undefined;
  decalGroup: string | undefined;
  /** GUIDs of clothing items the game puts on together with this one. */
  spawnWith: string[];
}

const LIST_ELEMENTS = new Set(['m_Masks', 'textureChoices', 'm_BaseTextures', 'm_SpawnWith']);

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

function text(record: Record<string, XmlValue>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.toLowerCase() === 'null' ? undefined : trimmed;
}

function list(record: Record<string, XmlValue>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
}

function flag(record: Record<string, XmlValue>, key: string, fallback: boolean): boolean {
  const value = text(record, key);
  return value === undefined ? fallback : value.toLowerCase() === 'true';
}

/** Lowercases a game path and turns backslashes into forward slashes. */
export function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

/**
 * Turns a model reference from the XML into a model key: the path under `media/models_X`,
 * lowercased, without extension. Both `skinned\clothes\bob_trousers` and
 * `media\models_X\Skinned\Clothes\Bob_Trousers.x` become `skinned/clothes/bob_trousers`.
 */
export function modelKeyFromReference(reference: string): string {
  let key = normalizePath(reference);
  key = key.replace(/^x:/, '');
  key = key.replace(/^media\/models_x\//, '').replace(/^media\/models\//, '');
  key = key.replace(/\.(x|fbx|glb|gltf)$/, '');
  return key;
}

/** Turns a texture reference into a texture key: the path under `media/textures`, lowercased. */
export function textureKeyFromReference(reference: string): string {
  let key = normalizePath(reference);
  key = key.replace(/^media\/textures\//, '');
  key = key.replace(/\.png$/, '');
  return key;
}

function textureFolderKey(reference: string | undefined): string | undefined {
  if (reference === undefined) return undefined;
  return normalizePath(reference)
    .replace(/^media\/textures\//, '')
    .replace(/\/+$/, '');
}

function optionalModel(record: Record<string, XmlValue>, key: string): string | undefined {
  const value = text(record, key);
  return value === undefined ? undefined : modelKeyFromReference(value);
}

/** Parses the text of a clothing item XML file. */
export function parseClothingItemXml(xml: string): ClothingItemXml {
  const document = parser.parse(xml) as Record<string, XmlValue>;
  const root = asRecord(document['clothingItem']);
  if (Object.keys(root).length === 0) {
    throw new Error('missing <clothingItem> root element');
  }
  const masks = list(root, 'm_Masks').map((value) => {
    const index = Number(value);
    if (!Number.isInteger(index)) throw new Error(`mask index "${value}" is not an integer`);
    return index;
  });
  return {
    guid: text(root, 'm_GUID'),
    maleModel: optionalModel(root, 'm_MaleModel'),
    femaleModel: optionalModel(root, 'm_FemaleModel'),
    altMaleModel: optionalModel(root, 'm_AltMaleModel'),
    altFemaleModel: optionalModel(root, 'm_AltFemaleModel'),
    static: flag(root, 'm_Static', false),
    attachBone: text(root, 'm_AttachBone'),
    allowRandomHue: flag(root, 'm_AllowRandomHue', false),
    allowRandomTint: flag(root, 'm_AllowRandomTint', false),
    masks,
    masksFolder: textureFolderKey(text(root, 'm_MasksFolder')),
    underlayMasksFolder: textureFolderKey(text(root, 'm_UnderlayMasksFolder')),
    textureChoices: list(root, 'textureChoices').map(textureKeyFromReference),
    baseTextures: list(root, 'm_BaseTextures').map(textureKeyFromReference),
    hatCategory: text(root, 'm_HatCategory'),
    decalGroup: text(root, 'm_DecalGroup'),
    spawnWith: list(root, 'm_SpawnWith').filter((guid) => guid.toLowerCase() !== 'null'),
  };
}
