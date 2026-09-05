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

/** Poses a character or zombie can be shown in; each maps to a clip of the game's animation sets. */
export const STANCES = ['standing', 'crawling', 'onBack', 'sitting', 'corpse'] as const;

export type Stance = (typeof STANCES)[number];

/**
 * What a character is doing, as a looped clip from the game's animation sets. Players have all
 * of them but `lunge`; zombies have `walk`, `sprint`, `lunge`, `attack`, and `eat`. The held
 * item picks the variant (the weapon type for aiming and attacking).
 */
export const CHARACTER_ACTIONS = [
  'walk',
  'sneak',
  'run',
  'sprint',
  'aim',
  'attack',
  'sitChair',
  'sleep',
  'lieAwake',
  'eat',
  'drink',
  'drive',
  'lunge',
] as const;

export type CharacterAction = (typeof CHARACTER_ACTIONS)[number];

export type SkeletonKind = 'burned' | 'plain' | 'muscle';

/** Marks the body as a zombie: rotten skin, no body hair, the zombie animation set. */
export interface ZombieDescription {
  /** Decay stage of the skin texture, 1 to 3; rolled from the seed when absent. */
  rot?: 1 | 2 | 3;
  /** Renders the skeleton body instead of the skin; the value picks its texture. */
  skeleton?: SkeletonKind;
  /**
   * Seed for whatever the document leaves to chance: rot stage, skin, blood, and the idle
   * animation's speed and starting point. The same seed gives the same zombie.
   */
  seed?: number;
}

export interface BodyDescription {
  sex: Sex;
  zombie?: ZombieDescription;
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

/**
 * Dresses the character from one of the game's named outfits with the game's own randomiser,
 * so the same seed gives the same clothes, hair, and colours as in the game. Items listed in
 * `worn` are put on afterwards. For a zombie the game's extras apply too: underwear, an attached
 * weapon, wounds, and bandages.
 */
export interface OutfitReference {
  name: string;
  /** Seed of the game's outfit randomiser (`OutfitRNG`); 0 when absent. */
  seed?: number;
  /** Age of the world in days, which unlocks some hair styles and attached weapons; 0 when absent. */
  worldAge?: number;
}

export interface CharacterDescription {
  format: typeof CHARACTER_FORMAT;
  version: typeof CHARACTER_FORMAT_VERSION;
  body: BodyDescription;
  worn?: WornItemDescription[];
  outfit?: OutfitReference;
  /** Pose; `standing` when absent. Ignored when the viewer is told which clip to play. */
  stance?: Stance;
  /**
   * What the character is doing; the idle of the stance when absent. An action that needs its
   * own pose (sitting on a chair, lying on a bed) takes precedence over `stance`. Ignored when
   * the viewer is told which clip to play.
   */
  action?: CharacterAction;
  held?: {
    primary?: HeldItemDescription;
    secondary?: HeldItemDescription;
  };
  attached?: AttachedItemDescription[];
  damage?: Partial<Record<BodyPart, BodyPartDamageDescription>>;
  /** Free-form data for the producer of the document; the renderer ignores it. */
  meta?: Record<string, unknown>;
}
