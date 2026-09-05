/**
 * Compares the port with reference values dumped from the game's own classes
 * (`zombie.util.LocationRNG`, `OutfitRNG`, `zombie.core.Color`) with a small Java program; the
 * fixture holds Java's `Float.toString` output, so the comparison is exact.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LocationRng, OutfitRng, hsbToRgb } from './rng.js';

interface SeedReference {
  seed: string;
  floats: number[];
  ints: number[];
  outfit: (number | boolean)[];
  color: [number, number, number] | null;
}

interface Reference {
  seeds: SeedReference[];
  hsb: { hsb: [number, number, number]; rgb: [number, number, number] }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const reference = JSON.parse(
  readFileSync(join(here, '../../test/fixtures/outfit-rng-reference.json'), 'utf8'),
) as Reference;

const INT_BOUNDS = [2, 3, 5, 16, 100, 200, 409, 65536, 2147483647];

describe('LocationRng', () => {
  it.each(reference.seeds)('matches the game for seed $seed', ({ seed, floats, ints }) => {
    const rng = new LocationRng();
    rng.setSeed(BigInt(seed));
    expect(floats.map(() => rng.nextFloat())).toEqual(floats.map(Math.fround));
    expect(INT_BOUNDS.map((n) => rng.nextInt(n))).toEqual(ints);
  });
});

describe('OutfitRng', () => {
  it.each(reference.seeds)('draws like OutfitRNG for seed $seed', ({ seed, outfit, color }) => {
    const rng = new OutfitRng(BigInt(seed));
    const draws = [
      rng.next(100),
      rng.nextInt(5, 20),
      rng.nextInt(20, 5),
      rng.nextFloat(0, 1),
      rng.nextFloat(0, 0.6),
      rng.nextFloat(0.1, 0.9),
      rng.nextFloat(0, 100),
      rng.nextBool(4),
      rng.next(200),
    ];
    expect(draws).toEqual(outfit.map((v) => (typeof v === 'number' ? Math.fround(v) : v)));
    if (color) {
      const c = rng.randomColor();
      expect([c.r, c.g, c.b]).toEqual(color.map(Math.fround));
    }
  });

  it('pickRandom does not draw for lists of one and returns undefined for empty lists', () => {
    const rng = new OutfitRng(7);
    const before = rng.rng.nextFloat();
    const again = new OutfitRng(7);
    expect(again.pickRandom(['only'])).toBe('only');
    expect(again.pickRandom([])).toBeUndefined();
    expect(again.rng.nextFloat()).toBe(before);
  });
});

describe('hsbToRgb', () => {
  it.each(reference.hsb)('matches Color.HSBtoRGB for $hsb', ({ hsb, rgb }) => {
    const c = hsbToRgb(hsb[0], hsb[1], hsb[2]);
    expect([c.r, c.g, c.b]).toEqual(rgb.map(Math.fround));
  });
});
