import { describe, expect, it } from 'vitest';

import { validateDescription } from './document.js';

describe('validateDescription', () => {
  it('picks the validator by format', () => {
    expect(
      validateDescription({ format: 'zomboid-models/character', version: 1, body: { sex: 'male' } })
        .ok,
    ).toBe(true);
    expect(
      validateDescription({ format: 'zomboid-models/animal', version: 1, type: 'cow' }).ok,
    ).toBe(true);
    expect(
      validateDescription({ format: 'zomboid-models/item', version: 1, item: 'Base.Axe' }).ok,
    ).toBe(true);
    expect(
      validateDescription({ format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.Van' }).ok,
    ).toBe(true);
    expect(validateDescription({ format: 'zomboid-models/item', version: 1 }).ok).toBe(false);
  });

  it('names the accepted formats for an unknown one', () => {
    const result = validateDescription({ format: 'zomboid-models/tile', version: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('"zomboid-models/vehicle"');
    expect(validateDescription('nope')).toEqual({ ok: false, errors: ['$: must be an object'] });
  });
});
