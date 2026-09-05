/**
 * The files the pipeline writes next to the converted assets. `manifest.json` is a small index;
 * the data for each kind of subject lives in a catalog file the index names, so a page only
 * downloads what it renders. The renderer resolves every model, texture, and animation through
 * the catalog of the document it is showing.
 */

import type { BodyPart, Sex, Stance } from './types.js';

export const MANIFEST_FORMAT = 'zomboid-models/manifest';
export const MANIFEST_VERSION = 2;

/** Kinds of subject a build can contain, each with its own catalog file. */
export type SubjectKind = 'characters' | 'vehicles' | 'animals' | 'items';

export const SUBJECT_KINDS: readonly SubjectKind[] = ['characters', 'vehicles', 'animals', 'items'];

export interface ManifestIndex {
  format: typeof MANIFEST_FORMAT;
  version: typeof MANIFEST_VERSION;
  /** Game version the assets were converted from, for example `42.20.3`. */
  gameVersion: string;
  generatedAt: string;
  /** Mod ids that contributed assets, in load order. */
  mods: string[];
  /** Catalog files relative to the manifest, by subject kind; absent kinds were not built. */
  catalogs: Partial<Record<SubjectKind, string>>;
}

/** A converted mesh file; keyed by the game's model path, lowercased with forward slashes. */
export interface ManifestModel {
  /** Path of the GLB relative to the manifest. */
  file: string;
  skinned: boolean;
  /** Names of the meshes inside the file, in file order. */
  meshes: string[];
}

/** A converted animation file; keyed by the clip name. */
export interface ManifestAnimation {
  /** Path of the GLB relative to the manifest. */
  file: string;
  /** Length in seconds. */
  duration: number;
}

export interface ManifestBody {
  /** Model key of the body mesh. */
  model: string;
  /** Texture keys of the skin choices, in the game's order. */
  skins: string[];
  /** Whether a body-hair variant (`a` suffix) exists for each skin. */
  bodyHair: boolean;
}

/** One clothing item definition from the game's clothing XML, keyed by its lowercased name. */
export interface ManifestClothingItem {
  /** Model keys per sex; absent when the item has no mesh (texture-only layers). */
  model?: Partial<Record<Sex, string>>;
  altModel?: Partial<Record<Sex, string>>;
  /** True for meshes that are placed on a bone instead of skinned. */
  static: boolean;
  attachBone?: string;
  /** Texture keys of `textureChoices` and `m_BaseTextures`. */
  textures: string[];
  baseTextures: string[];
  /** Mask part indices as in the XML (`m_Masks`). */
  masks: number[];
  /** Texture key prefix of the mask folder, when it is not the default body mask folder. */
  masksFolder?: string;
  underlayMasksFolder?: string;
  allowRandomTint: boolean;
  allowRandomHue: boolean;
  hatCategory?: string;
  decalGroup?: string;
  /** Clothing item names (lowercased) the game adds along with this one, in XML order. */
  spawnWith?: string[];
  /** The game's GUID of the definition, as outfits reference it. */
  guid?: string;
}

/** One inventory item that can be worn, keyed by its full type such as `Base.Trousers_Denim`. */
export interface ManifestWearable {
  /** Lowercased clothing item name, a key of `clothingItems`. */
  clothingItem: string;
  /** Body location id such as `base:pants`. */
  bodyLocation: string;
  /** Names from the item script's `BloodLocation`, mapped by the renderer to body parts. */
  bloodLocation: string[];
  fabric?: string;
  displayName?: string;
  /** `CanHaveHoles = false` in the item script; absent means holes are allowed. */
  canHaveHoles?: false;
}

export type ManifestWeaponType =
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

export interface ManifestAttachment {
  bone?: string;
  offset: [number, number, number];
  /** Degrees, applied as X then Y then Z. */
  rotate: [number, number, number];
  scale: number;
}

/** One item that can be held or attached, keyed by its full type. */
export interface ManifestHeldItem {
  /** Model key of the item's mesh. */
  model: string;
  /** Texture key of the item's texture. */
  texture?: string;
  weaponType: ManifestWeaponType;
  /** Uniform scale from the model script. */
  scale: number;
  /** Attachment points declared on the item's model, keyed by name. */
  attachments: Record<string, ManifestAttachment>;
  displayName?: string;
  /** `ConditionMax` from the item script; the game rolls a zombie's weapon condition from it. */
  conditionMax?: number;
}

export interface ManifestBodyLocation {
  /** Render order as declared in the game data; lower draws first. */
  order: number;
  /** Locations that cannot be worn together with this one. */
  exclusive: string[];
  /** Locations hidden while this one is worn. */
  hides: string[];
  multiItem: boolean;
}

export interface ManifestHairStyle {
  /** Model key, or absent for a bald style. */
  model?: string;
  texture: string;
  /** Replacement style per lowercased hat category, `default` for any hat. */
  alternates: Record<string, string>;
  /** `noChoose` in the XML: the game never picks the style at random. */
  noChoose?: boolean;
}

export interface ManifestBeardStyle {
  model?: string;
  texture: string;
}

/**
 * A clip the game plays in some state, with the speed multiplier of its animation node. The
 * random multiplier and the random start fraction are rolled once per character, as in the game.
 */
export interface ManifestClip {
  clip: string;
  /** `m_SpeedScale` of the node, 1 when absent. */
  speed: number;
  /** `m_SpeedScaleRandomMultiplierMin` and `Max`, when the node has them. */
  speedRandom?: [number, number];
  /** `m_randomAdvanceFraction`: the clip may start anywhere in this leading fraction. */
  randomStart?: number;
}

export interface ManifestIdleClips {
  default: ManifestClip;
  byWeaponType: Partial<Record<ManifestWeaponType, ManifestClip>>;
}

/** A shirt decal: a texture drawn into a rectangle of the item texture's 256-unit space. */
export interface ManifestDecal {
  texture: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A colour with channels from 0 to 1. */
export interface ManifestColor {
  r: number;
  g: number;
  b: number;
}

/** One entry of an outfit's item list, as `clothing.xml` nests them. */
export interface ManifestOutfitItem {
  /** Lowercased clothing item name, or absent when the GUID resolves to nothing. */
  clothingItem?: string;
  /** `probability`, 1 when absent. */
  probability: number;
  subItems: ManifestOutfitItem[];
}

/** One of the game's named outfits, from `clothing.xml`. */
export interface ManifestOutfit {
  name: string;
  top: boolean;
  pants: boolean;
  allowPantsHue: boolean;
  allowPantsTint: boolean;
  allowTopTint: boolean;
  allowTshirtDecal: boolean;
  items: ManifestOutfitItem[];
  /** Mod id when the outfit comes from a mod; the game prefixes item GUIDs with it. */
  modId?: string;
}

/** A name with a percentage chance, as the hair and beard definitions list them. */
export interface ManifestChance {
  value: string;
  chance: number;
}

/** `HairOutfitDefinitions.lua`: which styles and colours each outfit may get. */
export interface ManifestHairDefinitions {
  /** Styles restricted to some outfits, with the world age that unlocks them. */
  restricted: { style: string; minWorldAge: number; onlyFor: string[] }[];
  /** Per-outfit chances for a haircut, a beard, or a colour; the remainder is random. */
  byOutfit: {
    outfit: string;
    haircut?: ManifestChance[];
    femaleHaircut?: ManifestChance[];
    maleHaircut?: ManifestChance[];
    beard?: ManifestChance[];
    haircutColor?: ManifestChance[];
  }[];
  /** The common hair colours, in the game's order. */
  colors: ManifestColor[];
}

/** `DefaultClothing.lua`: the clothing item names the game uses for default pants and tops. */
export interface ManifestDefaultClothing {
  pants: { hue: string[]; texture: string[]; tint: string[] };
  tShirt: { texture: string[]; tint: string[] };
  tShirtDecal: { texture: string[]; tint: string[] };
  vest: { texture: string[]; tint: string[] };
}

/** `UnderwearDefinition.lua`, in file order. */
export interface ManifestUnderwear {
  baseChance: number;
  definitions: {
    female: boolean;
    chanceToSpawn: number;
    /** Item name without module (the game resolves it with `FindItem`). */
    bottom: string;
    top?: ManifestChance[];
  }[];
}

/** One entry of `AttachedWeaponDefinitions.lua`. */
export interface ManifestAttachedWeapon {
  id: string;
  chance: number;
  /** Outfits the entry is limited to; empty for any. */
  outfit: string[];
  /** Attached location names, sorted as the game sorts them. */
  weaponLocation: string[];
  bloodLocations: BodyPart[];
  addHoles: boolean;
  daySurvived: number;
  ensureItem?: string;
  /** Full item types, sorted. */
  weapons: string[];
}

export interface ManifestAttachedWeapons {
  /** Entries sorted by id, as the game keeps them. */
  definitions: ManifestAttachedWeapon[];
  /** Per-outfit overrides, in file order. */
  byOutfit: {
    outfit: string;
    chance: number;
    maxItems: number;
    weapons: ManifestAttachedWeapon[];
  }[];
}

/** Everything needed to render characters and zombies. */
export interface CharacterCatalog {
  bodies: Record<Sex, ManifestBody>;
  /** Skeleton bodies for skeleton zombies; `skins` lists burned, plain, and muscle in that order. */
  skeletons?: Record<Sex, ManifestBody>;
  /** Zombie skin texture keys per sex, by rot stage (index 0 is stage 1). */
  zombieSkins?: Record<Sex, string[][]>;
  /** Attachment points of the body models, keyed by name, for held and attached items. */
  bodyAttachments: Record<string, ManifestAttachment>;
  models: Record<string, ManifestModel>;
  /** Texture files keyed by the game's texture path, lowercased, without extension. */
  textures: Record<string, string>;
  animations: Record<string, ManifestAnimation>;
  idle: ManifestIdleClips;
  /** Clips per stance for players and zombies. */
  stances: {
    player: Partial<Record<Stance, ManifestClip>>;
    zombie: Partial<Record<Stance, ManifestClip>>;
  };
  clothingItems: Record<string, ManifestClothingItem>;
  wearables: Record<string, ManifestWearable>;
  /** Item type for each lowercased clothing item name, the way the game maps them. */
  clothingItemToItem: Record<string, string>;
  heldItems: Record<string, ManifestHeldItem>;
  bodyLocations: Record<string, ManifestBodyLocation>;
  /** Attached location display names to attachment names, for example `Rifle On Back`. */
  attachedLocations: Record<string, string>;
  hair: Record<Sex, Record<string, ManifestHairStyle>>;
  /** Hair style names per sex in the game's list order, which the outfit randomiser indexes. */
  hairOrder: Record<Sex, string[]>;
  beards: Record<string, ManifestBeardStyle>;
  /** Beard style names in the game's list order; the first entry is the empty style. */
  beardOrder: string[];
  /** Mask texture keys per body part for blood and holes. */
  bloodMasks: Partial<Record<BodyPart, string>>;
  /** Shirt decals by name. */
  decals: Record<string, ManifestDecal>;
  /** Decal names per decal group, as clothing items reference them. */
  decalGroups: Record<string, string[]>;
  outfits: Record<Sex, Record<string, ManifestOutfit>>;
  hairDefinitions: ManifestHairDefinitions;
  defaultClothing: ManifestDefaultClothing;
  underwear: ManifestUnderwear;
  attachedWeapons: ManifestAttachedWeapons;
  /** Item names the game may add as zombie wounds, in its iteration order (empty in vanilla). */
  zombieDamageItems: string[];
  /** Bandage item type per body part, the way the game names them (`Base.Bandage_Head`). */
  bandageItems: Partial<Record<BodyPart, string>>;
}

/** @deprecated The name from manifest version 1; the character catalog carries the same data. */
export type Manifest = CharacterCatalog;

/** The textures of one animal breed, as texture keys, in the definition's order. */
export interface ManifestAnimalBreed {
  /** Textures of females; the game picks one at random. */
  textures: string[];
  /** Textures of males. */
  texturesMale: string[];
  /** Textures of young animals; empty when the young use the adult textures. */
  texturesBaby: string[];
  rottenTexture?: string;
}

/** Camera framing the game uses for the animal's picture in its interface. */
export interface ManifestAnimalAvatar {
  zoom: number;
  xoffset: number;
  yoffset: number;
  width: number;
  /** Compass direction the animal faces, for example `SE`. */
  direction: string;
}

/** One animal type from the game's definitions, keyed by the type name. */
export interface ManifestAnimal {
  /** The species group, for example `cow` for `cow`, `bull`, and `cowcalf`. */
  group: string;
  female: boolean;
  /** True for a growth stage that still has a next stage. */
  baby: boolean;
  /** Model keys per body variant; `body` is the live animal (the sheared body for sheep). */
  models: {
    body: string;
    skeleton?: string;
    skeletonHeadless?: string;
    headless?: string;
    fleece?: string;
  };
  /** Texture keys of the type's own variants. */
  textures: {
    skeleton?: string;
    skeletonBloody?: string;
    skinned?: string;
  };
  animSet: string;
  /** Clips per stance from the type's animation set. */
  stances: Partial<Record<'standing' | 'sitting' | 'corpse', ManifestClip>>;
  minSize: number;
  maxSize: number;
  breeds: Record<string, ManifestAnimalBreed>;
  /** Breed names in the definition's order. */
  breedOrder: string[];
  avatar?: ManifestAnimalAvatar;
}

/** Everything needed to render animals. */
export interface AnimalCatalog {
  models: Record<string, ManifestModel>;
  textures: Record<string, string>;
  animations: Record<string, ManifestAnimation>;
  animals: Record<string, ManifestAnimal>;
}
