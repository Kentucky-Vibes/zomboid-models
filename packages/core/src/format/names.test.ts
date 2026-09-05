import { describe, expect, it } from 'vitest';

import { displayName, NAMES_FORMAT, type NamesCatalog } from './names.js';

const NAMES: NamesCatalog = {
  format: NAMES_FORMAT,
  language: 'RU',
  items: { 'Base.Axe': 'Топор пожарного' },
  vehicles: {},
  hair: {},
  beards: {},
  animals: { cow: 'Корова' },
  breeds: {},
  bodyLocations: {},
};

describe('displayName', () => {
  it('returns the name when known and the key otherwise', () => {
    expect(displayName(NAMES, 'items', 'Base.Axe')).toBe('Топор пожарного');
    expect(displayName(NAMES, 'animals', 'cow')).toBe('Корова');
    expect(displayName(NAMES, 'vehicles', 'Base.CarNormal')).toBe('Base.CarNormal');
    expect(displayName(undefined, 'items', 'Base.Axe')).toBe('Base.Axe');
  });
});
