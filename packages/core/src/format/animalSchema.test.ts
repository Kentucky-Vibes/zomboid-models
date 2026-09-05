import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { validateAnimalDescription } from './animal.js';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '../../schema/animal.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const DOCUMENTS: unknown[] = [
  { format: 'zomboid-models/animal', version: 1, type: 'cow' },
  {
    format: 'zomboid-models/animal',
    version: 1,
    type: 'ewe',
    breed: 'suffolk',
    texture: 'Sheep_White',
    variant: 'fleece',
    size: 1.2,
    tint: { r: 0.9, g: 0.9, b: 1 },
    hue: 0.1,
    stance: 'corpse',
    seed: 1,
    meta: {},
  },
  { format: 'zomboid-models/animal', version: 1, type: 'cow', variant: 'wet' },
  { format: 'zomboid-models/animal', version: 1, type: 'cow', size: -1 },
  { format: 'zomboid-models/animal', version: 1, type: 'cow', extra: true },
  { format: 'zomboid-models/character', version: 1, type: 'cow' },
];

describe('animal.schema.json', () => {
  it.each(DOCUMENTS)('agrees with the runtime validator for %j', (document) => {
    const runtime = validateAnimalDescription(document).ok;
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
