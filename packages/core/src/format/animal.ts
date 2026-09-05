/**
 * The animal description format: one of the Build 42 animals as the game draws it, with the
 * breed texture, the body variant, and the size the game keeps for each animal.
 */

import type { RgbColor } from './types.js';

export const ANIMAL_FORMAT = 'zomboid-models/animal';
export const ANIMAL_FORMAT_VERSION = 1;

/**
 * Body variants the game switches between: the live animal, a rotting corpse, a skinned or
 * butchered carcass, the bare or bloody skeleton, both with or without the head, and for
 * sheep the fleece and the sheared body.
 */
export const ANIMAL_VARIANTS = [
  'normal',
  'rotten',
  'skinned',
  'skeleton',
  'skeletonBloody',
  'headless',
  'skeletonHeadless',
  'fleece',
  'sheared',
] as const;

export type AnimalVariant = (typeof ANIMAL_VARIANTS)[number];

export const ANIMAL_STANCES = ['standing', 'sitting', 'corpse'] as const;

export type AnimalStance = (typeof ANIMAL_STANCES)[number];

/** What an animal is doing, as a looped clip from its animation set; idle when absent. */
export const ANIMAL_ACTIONS = ['walk', 'run', 'eat'] as const;

export type AnimalAction = (typeof ANIMAL_ACTIONS)[number];

export interface AnimalDescription {
  format: typeof ANIMAL_FORMAT;
  version: typeof ANIMAL_FORMAT_VERSION;
  /** Animal type as the game's definitions name it, for example `cow`, `bull`, `cowcalf`, `hen`. */
  type: string;
  /** Breed name from the type's definitions; the first breed when absent. */
  breed?: string;
  /**
   * Which of the breed's textures to use: an index into the list for the animal's sex and
   * age, or a texture name. The seed picks one when absent, like the game does.
   */
  texture?: number | string;
  variant?: AnimalVariant;
  /** Size factor between the type's `minSize` and `maxSize`; the grown size when absent. */
  size?: number;
  /** Multiplied into the texture, as the game's `TintColour`. */
  tint?: RgbColor;
  /** Hue shift from -1 to 1, as the game's `HueChange`. */
  hue?: number;
  stance?: AnimalStance;
  /** What the animal is doing; the idle of the stance when absent. */
  action?: AnimalAction;
  /** Seed for the texture choice when `texture` is absent. */
  seed?: number;
  /** Free-form data for the producer of the document; the renderer ignores it. */
  meta?: Record<string, unknown>;
}

export type AnimalValidationResult =
  { ok: true; value: AnimalDescription } | { ok: false; errors: string[] };

const VARIANT_SET: ReadonlySet<string> = new Set(ANIMAL_VARIANTS);
const STANCE_SET: ReadonlySet<string> = new Set(ANIMAL_STANCES);
const ACTION_SET: ReadonlySet<string> = new Set(ANIMAL_ACTIONS);

function unit(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Checks that a parsed JSON value is an animal description and narrows its type. */
export function validateAnimalDescription(value: unknown): AnimalValidationResult {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['$: must be an object'] };
  }
  const doc = value as Record<string, unknown>;
  if (doc['format'] !== ANIMAL_FORMAT) errors.push(`format: must be "${ANIMAL_FORMAT}"`);
  if (doc['version'] !== ANIMAL_FORMAT_VERSION) {
    errors.push(`version: must be ${ANIMAL_FORMAT_VERSION}`);
  }
  if (typeof doc['type'] !== 'string' || doc['type'].length === 0) {
    errors.push('type: must be a non-empty string');
  }
  if (doc['breed'] !== undefined && (typeof doc['breed'] !== 'string' || doc['breed'] === '')) {
    errors.push('breed: must be a non-empty string');
  }
  const texture = doc['texture'];
  if (
    texture !== undefined &&
    !(Number.isInteger(texture) && (texture as number) >= 0) &&
    !(typeof texture === 'string' && texture.length > 0)
  ) {
    errors.push('texture: must be a non-negative integer or a texture name');
  }
  const variant = doc['variant'];
  if (variant !== undefined && (typeof variant !== 'string' || !VARIANT_SET.has(variant))) {
    errors.push(`variant: must be one of ${ANIMAL_VARIANTS.join(', ')}`);
  }
  const size = doc['size'];
  if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size <= 0)) {
    errors.push('size: must be a positive number');
  }
  const tint = doc['tint'];
  if (tint !== undefined) {
    if (typeof tint !== 'object' || tint === null || Array.isArray(tint)) {
      errors.push('tint: must be an object');
    } else {
      for (const channel of ['r', 'g', 'b']) {
        if (!unit((tint as Record<string, unknown>)[channel])) {
          errors.push(`tint.${channel}: must be a number between 0 and 1`);
        }
      }
    }
  }
  const hue = doc['hue'];
  if (
    hue !== undefined &&
    (typeof hue !== 'number' || !Number.isFinite(hue) || hue < -1 || hue > 1)
  ) {
    errors.push('hue: must be a number between -1 and 1');
  }
  const stance = doc['stance'];
  if (stance !== undefined && (typeof stance !== 'string' || !STANCE_SET.has(stance))) {
    errors.push(`stance: must be one of ${ANIMAL_STANCES.join(', ')}`);
  }
  const action = doc['action'];
  if (action !== undefined && (typeof action !== 'string' || !ACTION_SET.has(action))) {
    errors.push(`action: must be one of ${ANIMAL_ACTIONS.join(', ')}`);
  }
  if (doc['seed'] !== undefined && !Number.isInteger(doc['seed'])) {
    errors.push('seed: must be an integer');
  }
  const meta = doc['meta'];
  if (meta !== undefined && (typeof meta !== 'object' || meta === null || Array.isArray(meta))) {
    errors.push('meta: must be an object');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: doc as unknown as AnimalDescription };
}
