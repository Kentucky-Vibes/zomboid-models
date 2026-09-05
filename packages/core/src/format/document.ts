/**
 * The union of every document the renderer shows, and a validator that picks the right check
 * from the document's `format` field.
 */
import { ANIMAL_FORMAT, validateAnimalDescription, type AnimalDescription } from './animal.js';
import { ITEM_FORMAT, validateItemDescription, type ItemDescription } from './item.js';
import { SCENE_FORMAT, validateSceneDescription, type SceneDescription } from './scene.js';
import { CHARACTER_FORMAT, type CharacterDescription } from './types.js';
import { validateCharacterDescription } from './validate.js';
import { VEHICLE_FORMAT, validateVehicleDescription, type VehicleDescription } from './vehicle.js';

/** Every document the viewer takes: one subject, or a scene of several. */
export type SubjectDescription =
  | CharacterDescription
  | AnimalDescription
  | ItemDescription
  | VehicleDescription
  | SceneDescription;

export type DescriptionValidationResult =
  { ok: true; value: SubjectDescription } | { ok: false; errors: string[] };

/** Every `format` value a document may carry. */
export const DOCUMENT_FORMATS: readonly string[] = [
  CHARACTER_FORMAT,
  ANIMAL_FORMAT,
  ITEM_FORMAT,
  VEHICLE_FORMAT,
  SCENE_FORMAT,
];

/** Validates a document of any kind by its `format` field. */
export function validateDescription(value: unknown): DescriptionValidationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['$: must be an object'] };
  }
  const format = (value as { format?: unknown }).format;
  switch (format) {
    case ANIMAL_FORMAT:
      return validateAnimalDescription(value);
    case ITEM_FORMAT:
      return validateItemDescription(value);
    case VEHICLE_FORMAT:
      return validateVehicleDescription(value);
    case SCENE_FORMAT:
      return validateSceneDescription(value);
    case CHARACTER_FORMAT:
      return validateCharacterDescription(value);
    default:
      return {
        ok: false,
        errors: [`format: must be one of ${DOCUMENT_FORMATS.map((f) => `"${f}"`).join(', ')}`],
      };
  }
}
