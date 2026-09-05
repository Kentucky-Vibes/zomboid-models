/**
 * The scene description format: several subjects (characters, animals, items, vehicles) placed
 * together on one ground plane, with characters optionally seated in a vehicle.
 */
import { ANIMAL_FORMAT, validateAnimalDescription, type AnimalDescription } from './animal.js';
import { ITEM_FORMAT, validateItemDescription, type ItemDescription } from './item.js';
import { CHARACTER_FORMAT, type CharacterDescription } from './types.js';
import { validateCharacterDescription } from './validate.js';
import { VEHICLE_FORMAT, validateVehicleDescription, type VehicleDescription } from './vehicle.js';

export const SCENE_FORMAT = 'zomboid-models/scene';
export const SCENE_FORMAT_VERSION = 1;

/** A subject a scene can hold: every document kind but a scene. */
export type SceneSubjectDescription =
  CharacterDescription | AnimalDescription | ItemDescription | VehicleDescription;

export interface SceneSubject {
  document: SceneSubjectDescription;
  /**
   * Where the subject stands on the ground, in the game's units (one tile is one unit): `x`
   * runs to the right as seen from the default camera and `z` toward it. Subjects without a
   * position line up in a row.
   */
  position?: [number, number];
  /** Turn in degrees; 0 faces the default camera for every kind, positive turns to the subject's left. */
  yaw?: number;
  /** A clip name for this subject, `null` for the bind pose; the game's clip when absent. */
  animation?: string | null;
  /** For a character: the seat id of the vehicle at index `in` (`FrontLeft`, `FrontRight`, `RearLeft`, and so on). */
  seat?: string;
  /** Index into `subjects` of the vehicle the character sits in. */
  in?: number;
}

export interface SceneDescription {
  format: typeof SCENE_FORMAT;
  version: typeof SCENE_FORMAT_VERSION;
  subjects: SceneSubject[];
  /** A CSS colour for a disc of ground under the subjects; no ground when absent. */
  ground?: string;
  /** Free-form data for the producer of the document; the renderer ignores it. */
  meta?: Record<string, unknown>;
}

export type SceneValidationResult =
  { ok: true; value: SceneDescription } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSubjectDocument(value: unknown, path: string): string[] {
  if (!isRecord(value)) return [`${path}: must be an object`];
  const format = value['format'];
  let result: { ok: boolean; errors?: string[] };
  switch (format) {
    case CHARACTER_FORMAT:
      result = validateCharacterDescription(value);
      break;
    case ANIMAL_FORMAT:
      result = validateAnimalDescription(value);
      break;
    case ITEM_FORMAT:
      result = validateItemDescription(value);
      break;
    case VEHICLE_FORMAT:
      result = validateVehicleDescription(value);
      break;
    default:
      return [`${path}.format: must be a character, animal, item, or vehicle document`];
  }
  return result.ok ? [] : (result.errors ?? []).map((error) => `${path}.${error}`);
}

function checkSubject(errors: string[], value: unknown, index: number, count: number): void {
  const path = `subjects[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  errors.push(...validateSubjectDocument(value['document'], `${path}.document`));
  const position = value['position'];
  if (
    position !== undefined &&
    !(
      Array.isArray(position) &&
      position.length === 2 &&
      position.every((n) => typeof n === 'number' && Number.isFinite(n))
    )
  ) {
    errors.push(`${path}.position: must be two finite numbers`);
  }
  const yaw = value['yaw'];
  if (yaw !== undefined && (typeof yaw !== 'number' || !Number.isFinite(yaw))) {
    errors.push(`${path}.yaw: must be a finite number`);
  }
  const animation = value['animation'];
  if (animation !== undefined && animation !== null && typeof animation !== 'string') {
    errors.push(`${path}.animation: must be a string or null`);
  }
  const seat = value['seat'];
  const inIndex = value['in'];
  if (seat !== undefined && (typeof seat !== 'string' || seat.length === 0)) {
    errors.push(`${path}.seat: must be a non-empty string`);
  }
  if (
    inIndex !== undefined &&
    !(Number.isInteger(inIndex) && (inIndex as number) >= 0 && (inIndex as number) < count)
  ) {
    errors.push(`${path}.in: must be the index of another subject`);
  }
  if ((seat === undefined) !== (inIndex === undefined)) {
    errors.push(`${path}: seat and in go together`);
  }
  if (inIndex === index) errors.push(`${path}.in: a subject cannot sit in itself`);
}

/** Checks that a parsed JSON value is a scene description and narrows its type. */
export function validateSceneDescription(value: unknown): SceneValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['$: must be an object'] };
  if (value['format'] !== SCENE_FORMAT) errors.push(`format: must be "${SCENE_FORMAT}"`);
  if (value['version'] !== SCENE_FORMAT_VERSION) {
    errors.push(`version: must be ${SCENE_FORMAT_VERSION}`);
  }
  const subjects = value['subjects'];
  if (!Array.isArray(subjects)) {
    errors.push('subjects: must be an array');
  } else {
    if (subjects.length === 0) errors.push('subjects: must hold at least one subject');
    subjects.forEach((subject, index) => checkSubject(errors, subject, index, subjects.length));
  }
  const ground = value['ground'];
  if (ground !== undefined && (typeof ground !== 'string' || ground.length === 0)) {
    errors.push('ground: must be a CSS colour');
  }
  if (value['meta'] !== undefined && !isRecord(value['meta'])) {
    errors.push('meta: must be an object');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: value as unknown as SceneDescription };
}
