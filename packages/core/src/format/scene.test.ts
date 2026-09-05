import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { validateDescription } from './document.js';
import { validateSceneDescription } from './scene.js';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '../../schema/scene.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const CAR = { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarLightsPolice' };
const OFFICER = {
  format: 'zomboid-models/character',
  version: 1,
  body: { sex: 'male' },
  worn: [{ item: 'Base.Jacket_Police' }],
};
const COW = { format: 'zomboid-models/animal', version: 1, type: 'cow' };

const SCENE = {
  format: 'zomboid-models/scene',
  version: 1,
  subjects: [
    { document: CAR, position: [0, 0], yaw: 20 },
    { document: OFFICER, seat: 'FrontLeft', in: 0 },
    { document: COW, position: [3, 1], animation: null },
    { document: { format: 'zomboid-models/item', version: 1, item: 'Base.Axe' } },
  ],
  ground: '#334',
  meta: { note: 'test' },
};

describe('validateSceneDescription', () => {
  it('accepts a scene with every kind of subject and a seated character', () => {
    expect(validateSceneDescription(SCENE).ok).toBe(true);
    expect(validateDescription(SCENE).ok).toBe(true);
    expect(validate(SCENE), JSON.stringify(validate.errors)).toBe(true);
  });

  it('reports the errors of the subjects with their paths', () => {
    const result = validateSceneDescription({
      format: 'zomboid-models/scene',
      version: 1,
      subjects: [
        { document: { format: 'zomboid-models/vehicle', version: 1 } },
        { document: OFFICER, seat: 'FrontLeft' },
        { document: COW, in: 9, seat: 'Rear', position: [1], yaw: 'left' },
        { document: { format: 'zomboid-models/scene', version: 1, subjects: [] } },
        'nope',
      ],
      ground: '',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'subjects[0].document.vehicle: must be a non-empty string',
      'subjects[1]: seat and in go together',
      'subjects[2].position: must be two finite numbers',
      'subjects[2].yaw: must be a finite number',
      'subjects[2].in: must be the index of another subject',
      'subjects[3].document.format: must be a character, animal, item, or vehicle document',
      'subjects[4]: must be an object',
      'ground: must be a CSS colour',
    ]);
  });

  it('rejects empty scenes, self-seating, and the wrong format', () => {
    expect(
      validateSceneDescription({ format: 'zomboid-models/scene', version: 1, subjects: [] }).ok,
    ).toBe(false);
    const self = validateSceneDescription({
      format: 'zomboid-models/scene',
      version: 1,
      subjects: [{ document: OFFICER, seat: 'FrontLeft', in: 0 }],
    });
    expect(self.ok).toBe(false);
    expect(
      validateSceneDescription({ format: 'zomboid-models/character', version: 1, subjects: [] }).ok,
    ).toBe(false);
    expect(
      validate({
        format: 'zomboid-models/scene',
        version: 1,
        subjects: [{ document: CAR, extra: 1 }],
      }),
    ).toBe(false);
  });
});
