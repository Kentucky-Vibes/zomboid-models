/**
 * The character description format: a JSON document that mirrors the state the game keeps
 * for a player's appearance (HumanVisual, ItemVisual, held and attached items, BodyDamage).
 */

export const CHARACTER_FORMAT = 'zomboid-models/character';
export const CHARACTER_FORMAT_VERSION = 1;

export type Sex = 'male' | 'female';

/**
 * Body parts as the game names them (BloodBodyPartType / BodyPartType), in the game's enum
 * order. Blood, dirt, holes, patches, and wounds are all keyed by these names.
 */
export const BODY_PARTS = [
  'Hand_L',
  'Hand_R',
  'ForeArm_L',
  'ForeArm_R',
  'UpperArm_L',
  'UpperArm_R',
  'Torso_Upper',
  'Torso_Lower',
  'Head',
  'Neck',
  'Groin',
  'UpperLeg_L',
  'UpperLeg_R',
  'LowerLeg_L',
  'LowerLeg_R',
  'Foot_L',
  'Foot_R',
  'Back',
] as const;

export type BodyPart = (typeof BODY_PARTS)[number];

/** Amounts in the range 0..1 per body part; missing parts are 0. */
export type PartAmounts = Partial<Record<BodyPart, number>>;

/** Flags per body part; missing parts are false. */
export type PartFlags = Partial<Record<BodyPart, boolean>>;

export type PatchType = 'basic' | 'denim' | 'leather';

/** One patch at most per body part; missing parts have no patch. */
export type PartPatches = Partial<Record<BodyPart, PatchType>>;

/** Colour channels in the range 0..1. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface BodyDescription {
  sex: Sex;
  /** Index into the skin textures of the sex (0-based), as the game's HumanVisual stores it. */
  skin?: number;
  /** Explicit skin texture name such as `MaleBody03`; takes precedence over `skin`. */
  skinTexture?: string;
  /** Uses the body-hair variant of the skin texture (the `a` suffix in the game). */
  bodyHair?: boolean;
  /** Hair style name from the game's hair style data, for example `CrewCut`. Omit for no hair. */
  hair?: string;
  /** Beard style name from the game's beard style data. Omit for no beard. */
  beard?: string;
  hairColor?: RgbColor;
  /** Defaults to `hairColor`. */
  beardColor?: RgbColor;
  blood?: PartAmounts;
  dirt?: PartAmounts;
}

export interface WornItemDescription {
  /** Full item type, for example `Base.Trousers_Denim`. */
  item: string;
  /** Overrides the clothing item definition named by the item script. */
  clothingItem?: string;
  /** Alternate model name, as set by the game for some items (ItemVisual.alternateModelName). */
  alternateModel?: string;
  /** Index into the clothing item's `textureChoices`. */
  textureChoice?: number;
  /** Index into the clothing item's `m_BaseTextures`. */
  baseTexture?: number;
  tint?: RgbColor;
  /** Hue shift as the game stores it; omit for none. */
  hue?: number;
  /** Decal name from the game's clothing decal data. */
  decal?: string;
  blood?: PartAmounts;
  dirt?: PartAmounts;
  holes?: PartFlags;
  patches?: PartPatches;
}

export interface HeldItemDescription {
  /** Full item type of the item in the hand. */
  item: string;
  /** Blood on the item in the range 0..1. */
  blood?: number;
}

export interface AttachedItemDescription {
  /** Attachment location name from the game's attached location data, for example `Rifle On Back`. */
  location: string;
  /** Full item type of the attached item. */
  item: string;
}

export interface BodyPartDamageDescription {
  bandage?: 'clean' | 'dirty';
  bitten?: boolean;
  scratched?: boolean;
  cut?: boolean;
  deepWound?: boolean;
  bulletWound?: boolean;
  burnt?: boolean;
  stitched?: boolean;
  splint?: boolean;
  bleeding?: boolean;
}

/** Picks worn items from one of the game's named outfits instead of listing them. */
export interface OutfitReference {
  name: string;
  /** Seed for the game's outfit randomiser; the same seed gives the same items. */
  seed?: number;
}

export interface CharacterDescription {
  format: typeof CHARACTER_FORMAT;
  version: typeof CHARACTER_FORMAT_VERSION;
  body: BodyDescription;
  worn?: WornItemDescription[];
  outfit?: OutfitReference;
  held?: {
    primary?: HeldItemDescription;
    secondary?: HeldItemDescription;
  };
  attached?: AttachedItemDescription[];
  damage?: Partial<Record<BodyPart, BodyPartDamageDescription>>;
  /** Free-form data for the producer of the document; the renderer ignores it. */
  meta?: Record<string, unknown>;
}
