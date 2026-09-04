import { describe, expect, it } from 'vitest';

import { CHARACTER_FORMAT, CHARACTER_FORMAT_VERSION, type CharacterDescription } from './types.js';
import { validateCharacterDescription } from './validate.js';

function minimal(): CharacterDescription {
  return {
    format: CHARACTER_FORMAT,
    version: CHARACTER_FORMAT_VERSION,
    body: { sex: 'male' },
  };
}

describe('validateCharacterDescription', () => {
  it('accepts a minimal document', () => {
    expect(validateCharacterDescription(minimal())).toEqual({ ok: true, value: minimal() });
  });

  it('accepts a full document', () => {
    const doc: CharacterDescription = {
      ...minimal(),
      body: {
        sex: 'female',
        skin: 2,
        bodyHair: false,
        hair: 'Bob',
        hairColor: { r: 0.2, g: 0.1, b: 0.05 },
        blood: { Head: 0.5, Neck: 1 },
      },
      worn: [
        {
          item: 'Base.Trousers_Denim',
          textureChoice: 1,
          tint: { r: 1, g: 1, b: 1 },
          hue: -0.1,
          holes: { UpperLeg_L: true },
          patches: { LowerLeg_R: 'denim' },
          blood: { Groin: 0.25 },
        },
      ],
      held: { primary: { item: 'Base.Axe', blood: 0.5 } },
      attached: [{ location: 'Rifle On Back', item: 'Base.VarmintRifle' }],
      damage: { ForeArm_L: { bandage: 'dirty', scratched: true } },
      meta: { source: 'test' },
    };
    expect(validateCharacterDescription(doc)).toEqual({ ok: true, value: doc });
  });

  it('rejects non-objects', () => {
    const result = validateCharacterDescription('nope');
    expect(result.ok).toBe(false);
  });

  it('reports the wrong format and version', () => {
    const result = validateCharacterDescription({
      format: 'x',
      version: 99,
      body: { sex: 'male' },
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        `format: must be "${CHARACTER_FORMAT}"`,
        `version: must be ${CHARACTER_FORMAT_VERSION}`,
      ],
    });
  });

  it('reports bad body parts and out-of-range amounts', () => {
    const result = validateCharacterDescription({
      ...minimal(),
      body: { sex: 'male', blood: { Elbow: 0.5, Head: 2 } },
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        'body.blood.Elbow: is not a body part name',
        'body.blood.Head: must be a number between 0 and 1',
      ],
    });
  });

  it('reports bad worn items', () => {
    const result = validateCharacterDescription({
      ...minimal(),
      worn: [{ textureChoice: 1.5, patches: { Head: 'silk' } }],
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        'worn[0].item: must be a non-empty string',
        'worn[0].textureChoice: must be an integer',
        'worn[0].patches.Head: must be one of basic, denim, leather',
      ],
    });
  });

  it('reports bad damage entries', () => {
    const result = validateCharacterDescription({
      ...minimal(),
      damage: { Head: { bandage: 'wet', bitten: 'yes' } },
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        'damage.Head.bandage: must be "clean" or "dirty"',
        'damage.Head.bitten: must be a boolean',
      ],
    });
  });
});
