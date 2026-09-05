import { describe, expect, it } from 'vitest';

import { validateVehicleDescription } from './vehicle.js';

const FULL = {
  format: 'zomboid-models/vehicle',
  version: 1,
  vehicle: 'Base.CarNormal',
  skin: 1,
  paint: { hue: 0.6, saturation: 0.9, value: 0.7 },
  rust: 1,
  parts: {
    DoorFrontLeft: { condition: 45 },
    WindowFrontLeft: { open: true },
    TireRearRight: { missing: true },
  },
  headlights: true,
  stoplights: false,
  interiorLight: true,
  lightbar: 'left',
  blood: { front: 0.5, left: 1 },
  seed: 7,
  meta: { note: 'test' },
};

describe('validateVehicleDescription', () => {
  it('accepts a complete document and the minimal one', () => {
    expect(validateVehicleDescription(FULL).ok).toBe(true);
    expect(
      validateVehicleDescription({
        format: 'zomboid-models/vehicle',
        version: 1,
        vehicle: 'Base.Van',
      }).ok,
    ).toBe(true);
  });

  it('reports every malformed field with its path', () => {
    const result = validateVehicleDescription({
      format: 'zomboid-models/character',
      version: 2,
      vehicle: '',
      skin: -1,
      paint: { hue: 2, saturation: 0.5 },
      rust: 1.5,
      parts: { DoorFrontLeft: { condition: 101, missing: 'yes' }, Hood: 3 },
      headlights: 'on',
      lightbar: 'both',
      blood: { front: -1, back: 0.5 },
      seed: 1.5,
      meta: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'format: must be "zomboid-models/vehicle"',
      'version: must be 1',
      'vehicle: must be a non-empty string',
      'skin: must be a non-negative integer',
      'paint.hue: must be a number between 0 and 1',
      'paint.value: must be a number between 0 and 1',
      'rust: must be a number between 0 and 1',
      'parts.DoorFrontLeft.condition: must be a number between 0 and 100',
      'parts.DoorFrontLeft.missing: must be a boolean',
      'parts.Hood: must be an object',
      'headlights: must be a boolean',
      'lightbar: must be "left" or "right"',
      'blood.front: must be a number between 0 and 1',
      'seed: must be an integer',
      'meta: must be an object',
    ]);
  });

  it('rejects values that are not objects', () => {
    expect(validateVehicleDescription(null)).toEqual({
      ok: false,
      errors: ['$: must be an object'],
    });
    expect(validateVehicleDescription([]).ok).toBe(false);
  });
});
