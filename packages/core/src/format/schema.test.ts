import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { CHARACTER_FORMAT, CHARACTER_FORMAT_VERSION, type CharacterDescription } from './types.js';
import { validateCharacterDescription } from './validate.js';

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../schema/character.schema.json',
);
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

const FULL: CharacterDescription = {
  format: CHARACTER_FORMAT,
  version: CHARACTER_FORMAT_VERSION,
  body: {
    sex: 'female',
    skin: 2,
    bodyHair: false,
    hair: 'Bob',
    beard: 'Full',
    hairColor: { r: 0.2, g: 0.1, b: 0.05 },
    beardColor: { r: 0.2, g: 0.1, b: 0.05 },
    blood: { Head: 0.5 },
    dirt: { Neck: 0.1 },
  },
  worn: [
    {
      item: 'Base.Trousers_Denim',
      textureChoice: 1,
      tint: { r: 1, g: 1, b: 1 },
      hue: -0.1,
      decal: 'TShirtSpiffo1',
      holes: { UpperLeg_L: true },
      patches: { LowerLeg_R: 'denim' },
      blood: { Groin: 0.25 },
      dirt: { Groin: 0.25 },
    },
  ],
  outfit: { name: 'Police', seed: 4 },
  held: { primary: { item: 'Base.Axe', blood: 0.5 }, secondary: { item: 'Base.Torch' } },
  attached: [{ location: 'Rifle On Back', item: 'Base.VarmintRifle' }],
  damage: { ForeArm_L: { bandage: 'dirty', scratched: true, bitten: false } },
  meta: { source: 'test' },
};

describe('character.schema.json', () => {
  it('accepts a document that the runtime validator accepts', () => {
    expect(validate(FULL), JSON.stringify(validate.errors)).toBe(true);
    expect(validateCharacterDescription(FULL).ok).toBe(true);
  });

  it('rejects what the runtime validator rejects', () => {
    const bad = [
      { ...FULL, format: 'x' },
      { ...FULL, body: { sex: 'other' } },
      { ...FULL, worn: [{ item: '', blood: { Elbow: 1 } }] },
      { ...FULL, damage: { Head: { bandage: 'wet' } } },
      { ...FULL, held: { primary: { item: 'Base.Axe', blood: 2 } } },
    ];
    for (const doc of bad) {
      expect(validate(doc), JSON.stringify(doc)).toBe(false);
      expect(validateCharacterDescription(doc).ok, JSON.stringify(doc)).toBe(false);
    }
  });
});
