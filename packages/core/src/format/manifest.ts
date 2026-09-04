/**
 * The manifest that the pipeline writes next to the converted assets. The renderer loads it
 * from `assetBaseUrl` and resolves every model, texture, and animation through it.
 */

import type { BodyPart, Sex } from './types.js';

export const MANIFEST_FORMAT = 'zomboid-models/manifest';
export const MANIFEST_VERSION = 1;

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
  spawnWith?: string;
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
}

export interface ManifestBeardStyle {
  model?: string;
  texture: string;
}

export interface ManifestIdleClips {
  default: string;
  byWeaponType: Partial<Record<ManifestWeaponType, string>>;
}

/** A shirt decal: a texture drawn into a rectangle of the item texture's 256-unit space. */
export interface ManifestDecal {
  texture: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Manifest {
  format: typeof MANIFEST_FORMAT;
  version: typeof MANIFEST_VERSION;
  /** Game version the assets were converted from, for example `42.20.3`. */
  gameVersion: string;
  generatedAt: string;
  /** Mod ids that contributed assets, in load order. */
  mods: string[];
  bodies: Record<Sex, ManifestBody>;
  /** Attachment points of the body models, keyed by name, for held and attached items. */
  bodyAttachments: Record<string, ManifestAttachment>;
  models: Record<string, ManifestModel>;
  /** Texture files keyed by the game's texture path, lowercased, without extension. */
  textures: Record<string, string>;
  animations: Record<string, ManifestAnimation>;
  idle: ManifestIdleClips;
  clothingItems: Record<string, ManifestClothingItem>;
  wearables: Record<string, ManifestWearable>;
  heldItems: Record<string, ManifestHeldItem>;
  bodyLocations: Record<string, ManifestBodyLocation>;
  /** Attached location display names to attachment names, for example `Rifle On Back`. */
  attachedLocations: Record<string, string>;
  hair: Record<Sex, Record<string, ManifestHairStyle>>;
  beards: Record<string, ManifestBeardStyle>;
  /** Mask texture keys per body part for blood and holes. */
  bloodMasks: Partial<Record<BodyPart, string>>;
  /** Shirt decals by name. */
  decals: Record<string, ManifestDecal>;
  /** Decal names per decal group, as clothing items reference them. */
  decalGroups: Record<string, string[]>;
}
