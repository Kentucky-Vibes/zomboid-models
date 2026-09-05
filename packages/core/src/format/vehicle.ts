/**
 * The vehicle description format: one vehicle as the game keeps it in `BaseVehicle`. The
 * shader state (which paint zones show damage, blood, lights, or nothing) is not stored; it is
 * derived from the parts the way the game derives it, so an exporter copies plain fields.
 */

export const VEHICLE_FORMAT = 'zomboid-models/vehicle';
export const VEHICLE_FORMAT_VERSION = 1;

/** The paint as the game stores it: hue, saturation, and value from 0 to 1. */
export interface VehiclePaint {
  hue: number;
  saturation: number;
  value: number;
}

/** The state of one part, keyed by the part id of the vehicle script (`DoorFrontLeft`). */
export interface VehiclePartState {
  /**
   * Condition of the installed item from 0 to 100. Bodywork and windows show the first damage
   * texture from 59 down to 40 and the second one below 40, as `BaseVehicle.checkDamage` does.
   */
  condition?: number;
  /**
   * No item installed. Doors, windows, and the trunk show the game's uninstalled shade; a tire
   * or a door with its own mesh is not drawn.
   */
  missing?: boolean;
  /** An open window shows the uninstalled shade, as in the game. Doors are drawn closed. */
  open?: boolean;
}

/** Blood on the four sides, from 0 to 1, as `BaseVehicle.getBloodIntensity` reports it. */
export interface VehicleBlood {
  front?: number;
  rear?: number;
  left?: number;
  right?: number;
}

export type LightbarSide = 'left' | 'right';

export interface VehicleDescription {
  format: typeof VEHICLE_FORMAT;
  version: typeof VEHICLE_FORMAT_VERSION;
  /** Full script name, for example `Base.CarNormal`. */
  vehicle: string;
  /** Index into the script's skins, as `getSkinIndex()`; the seed picks one when absent. */
  skin?: number;
  /** The paint; rolled from the seed the way the game rolls it at spawn when absent. */
  paint?: VehiclePaint;
  /** Rust from 0 to 1, as `getRust()`; rolled from the seed when absent. */
  rust?: number;
  /** Parts that differ from a complete vehicle in full condition, by part id. */
  parts?: Record<string, VehiclePartState>;
  /** Headlights and rear lights on, as when `getHeadlightsOn()` and the battery has charge. */
  headlights?: boolean;
  /** Brake lights on. */
  stoplights?: boolean;
  /** The interior light, which lights the windows from inside. */
  interiorLight?: boolean;
  /** Which half of a light bar is lit, for vehicles that have one. */
  lightbar?: LightbarSide;
  /** The light bar's flashing pattern (1 slow, 2 double flash, 3 fast), as the game's mode. */
  lightbarMode?: 1 | 2 | 3;
  blood?: VehicleBlood;
  /** Decides the skin, paint, and rust the document leaves open. */
  seed?: number;
  /** Free-form data for the producer of the document; the renderer ignores it. */
  meta?: Record<string, unknown>;
}

export type VehicleValidationResult =
  { ok: true; value: VehicleDescription } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unit(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function checkPart(errors: string[], id: string, value: unknown): void {
  if (!isRecord(value)) {
    errors.push(`parts.${id}: must be an object`);
    return;
  }
  const condition = value['condition'];
  if (
    condition !== undefined &&
    (typeof condition !== 'number' ||
      !Number.isFinite(condition) ||
      condition < 0 ||
      condition > 100)
  ) {
    errors.push(`parts.${id}.condition: must be a number between 0 and 100`);
  }
  for (const flag of ['missing', 'open']) {
    if (value[flag] !== undefined && typeof value[flag] !== 'boolean') {
      errors.push(`parts.${id}.${flag}: must be a boolean`);
    }
  }
}

/** Checks that a parsed JSON value is a vehicle description and narrows its type. */
export function validateVehicleDescription(value: unknown): VehicleValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['$: must be an object'] };
  const doc = value;
  if (doc['format'] !== VEHICLE_FORMAT) errors.push(`format: must be "${VEHICLE_FORMAT}"`);
  if (doc['version'] !== VEHICLE_FORMAT_VERSION) {
    errors.push(`version: must be ${VEHICLE_FORMAT_VERSION}`);
  }
  if (typeof doc['vehicle'] !== 'string' || doc['vehicle'].length === 0) {
    errors.push('vehicle: must be a non-empty string');
  }
  const skin = doc['skin'];
  if (skin !== undefined && !(Number.isInteger(skin) && (skin as number) >= 0)) {
    errors.push('skin: must be a non-negative integer');
  }
  const paint = doc['paint'];
  if (paint !== undefined) {
    if (!isRecord(paint)) {
      errors.push('paint: must be an object');
    } else {
      for (const channel of ['hue', 'saturation', 'value']) {
        if (!unit(paint[channel])) {
          errors.push(`paint.${channel}: must be a number between 0 and 1`);
        }
      }
    }
  }
  if (doc['rust'] !== undefined && !unit(doc['rust'])) {
    errors.push('rust: must be a number between 0 and 1');
  }
  const parts = doc['parts'];
  if (parts !== undefined) {
    if (!isRecord(parts)) errors.push('parts: must be an object');
    else for (const [id, part] of Object.entries(parts)) checkPart(errors, id, part);
  }
  for (const flag of ['headlights', 'stoplights', 'interiorLight']) {
    if (doc[flag] !== undefined && typeof doc[flag] !== 'boolean') {
      errors.push(`${flag}: must be a boolean`);
    }
  }
  const lightbar = doc['lightbar'];
  if (lightbar !== undefined && lightbar !== 'left' && lightbar !== 'right') {
    errors.push('lightbar: must be "left" or "right"');
  }
  const mode = doc['lightbarMode'];
  if (mode !== undefined && mode !== 1 && mode !== 2 && mode !== 3) {
    errors.push('lightbarMode: must be 1, 2, or 3');
  }
  const blood = doc['blood'];
  if (blood !== undefined) {
    if (!isRecord(blood)) {
      errors.push('blood: must be an object');
    } else {
      for (const side of ['front', 'rear', 'left', 'right']) {
        if (blood[side] !== undefined && !unit(blood[side])) {
          errors.push(`blood.${side}: must be a number between 0 and 1`);
        }
      }
    }
  }
  if (doc['seed'] !== undefined && !Number.isInteger(doc['seed'])) {
    errors.push('seed: must be an integer');
  }
  if (doc['meta'] !== undefined && !isRecord(doc['meta'])) errors.push('meta: must be an object');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: doc as unknown as VehicleDescription };
}
