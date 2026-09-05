import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { validateVehicleDescription } from './vehicle.js';

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../schema/vehicle.schema.json',
);
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const DOCUMENTS: unknown[] = [
  { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarNormal' },
  {
    format: 'zomboid-models/vehicle',
    version: 1,
    vehicle: 'Base.PickUpTruck',
    skin: 2,
    paint: { hue: 0.1, saturation: 0.2, value: 0.3 },
    rust: 0.5,
    parts: { DoorFrontLeft: { condition: 50, missing: false, open: false } },
    headlights: true,
    stoplights: true,
    interiorLight: false,
    lightbar: 'right',
    blood: { front: 1, rear: 0, left: 0.5, right: 0.25 },
    seed: 3,
    meta: {},
  },
  { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarNormal', rust: 2 },
  { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarNormal', lightbar: 'both' },
  { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarNormal', paint: { hue: 0.5 } },
  { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarNormal', extra: true },
  { format: 'zomboid-models/item', version: 1, vehicle: 'Base.CarNormal' },
];

describe('vehicle.schema.json', () => {
  it.each(DOCUMENTS)('agrees with the runtime validator for %j', (document) => {
    const runtime = validateVehicleDescription(document).ok;
    const bySchema = validate(document) === true;
    // The schema also rejects unknown properties, which the runtime validator tolerates.
    const doc = document as Record<string, unknown>;
    if (doc['extra'] !== undefined) {
      expect(bySchema).toBe(false);
      return;
    }
    expect(bySchema).toBe(runtime);
  });
});
