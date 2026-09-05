import type { RgbColor } from '../format/types.js';

/**
 * The game's outfit random number generator, ported bit for bit so that a seed produces the
 * same choices as in the game: `zombie.util.LocationRNG` (xoroshiro128+ seeded through
 * SplitMix64) behind `zombie.core.skinnedmodel.population.OutfitRNG`. Java's `float` arithmetic
 * is reproduced with `Math.fround` wherever the game computes in single precision.
 */

const MASK64 = (1n << 64n) - 1n;
const SPLITMIX_INCREMENT = 0x9e3779b97f4a7c15n;
const SPLITMIX_MULTIPLIER_1 = 0xbf58476d1ce4e5b9n;
const SPLITMIX_MULTIPLIER_2 = 0x94d049bb133111ebn;
/** `Float.intBitsToFloat(864026624)`: 2^-24. */
const INT_TO_FLOAT = 5.960464477539063e-8;

function rotateLeft(value: bigint, bits: bigint): bigint {
  return ((value << bits) | (value >> (64n - bits))) & MASK64;
}

/** Interprets the low 32 bits of a 64-bit value as a signed Java `int`. */
function toInt32(value: bigint): number {
  return Number(BigInt.asIntN(32, value));
}

export class LocationRng {
  private s0 = 0n;
  private s1 = 0n;
  private state = 0n;

  constructor(seed = 0) {
    this.setSeed(seed);
  }

  /** Seeds the generator the way `LocationRNG.setSeed(long)` does; `seed` may be a bigint. */
  setSeed(seed: number | bigint): void {
    this.state = BigInt.asUintN(64, typeof seed === 'bigint' ? seed : BigInt(Math.trunc(seed)));
    this.s0 = this.nextSplitMix64();
    this.s1 = this.nextSplitMix64();
  }

  private nextSplitMix64(): bigint {
    this.state = (this.state + SPLITMIX_INCREMENT) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * SPLITMIX_MULTIPLIER_1) & MASK64;
    z = ((z ^ (z >> 27n)) * SPLITMIX_MULTIPLIER_2) & MASK64;
    return z ^ (z >> 31n);
  }

  /** The raw signed 32-bit output of xoroshiro128+ (`LocationRNG.nextInt()`). */
  nextRawInt(): number {
    const s0 = this.s0;
    let s1 = this.s1;
    const result = (s0 + s1) & MASK64;
    s1 ^= s0;
    this.s0 = rotateLeft(s0, 55n) ^ s1 ^ ((s1 << 14n) & MASK64);
    this.s1 = rotateLeft(s1, 36n);
    return toInt32(result);
  }

  /** A float in [0, 1) with 24 random bits, as `LocationRNG.nextFloat()`. */
  nextFloat(): number {
    return Math.fround((this.nextRawInt() >>> 8) * INT_TO_FLOAT);
  }

  /** An int in [0, n), as `LocationRNG.nextInt(int)`: `((raw >>> 1) * n) >> 31`. */
  nextInt(n: number): number {
    const r = BigInt(this.nextRawInt() >>> 1);
    return Number((r * BigInt(n)) >> 31n);
  }
}

/** A colour with channels in [0, 1], as the game's `ImmutableColor`. */

/**
 * `zombie.core.Color.HSBtoRGB`: hue, saturation, and brightness in [0, 1] to a colour quantised
 * to 8 bits per channel, in single precision like the game.
 */
export function hsbToRgb(hue: number, saturation: number, brightness: number): RgbColor {
  const f = Math.fround;
  const q255 = (value: number): number => Math.trunc(f(f(value * 255) + 0.5));
  let r = 0;
  let g = 0;
  let b = 0;
  if (saturation === 0) {
    r = g = b = q255(brightness);
  } else {
    const h = f(f(hue - Math.floor(hue)) * 6);
    const frac = f(h - Math.floor(h));
    const p = f(brightness * f(1 - saturation));
    const q = f(brightness * f(1 - f(saturation * frac)));
    const t = f(brightness * f(1 - f(saturation * f(1 - frac))));
    switch (Math.trunc(h)) {
      case 0:
        r = q255(brightness);
        g = q255(t);
        b = q255(p);
        break;
      case 1:
        r = q255(q);
        g = q255(brightness);
        b = q255(p);
        break;
      case 2:
        r = q255(p);
        g = q255(brightness);
        b = q255(t);
        break;
      case 3:
        r = q255(p);
        g = q255(q);
        b = q255(brightness);
        break;
      case 4:
        r = q255(t);
        g = q255(p);
        b = q255(brightness);
        break;
      case 5:
        r = q255(brightness);
        g = q255(p);
        b = q255(q);
        break;
      default:
        break;
    }
  }
  return { r: f(r / 255), g: f(g / 255), b: f(b / 255) };
}

/** The static helpers of `OutfitRNG`, bound to one generator. */
export class OutfitRng {
  readonly rng: LocationRng;

  constructor(seed: number | bigint = 0) {
    this.rng = new LocationRng();
    this.rng.setSeed(seed);
  }

  setSeed(seed: number | bigint): void {
    this.rng.setSeed(seed);
  }

  /** `OutfitRNG.Next(int max)`: an int in [0, max). */
  next(max: number): number {
    return this.rng.nextInt(max);
  }

  /** `OutfitRNG.Next(int min, int max)`: an int in [min, max), the bounds swapped when reversed. */
  nextInt(min: number, max: number): number {
    if (max === min) return min;
    if (min > max) [min, max] = [max, min];
    return this.rng.nextInt(max - min) + min;
  }

  /** `OutfitRNG.Next(float min, float max)`: `min + nextFloat() * (max - min)` in single precision. */
  nextFloat(min: number, max: number): number {
    const f = Math.fround;
    if (max === min) return min;
    if (min > max) [min, max] = [max, min];
    return f(f(min) + f(this.rng.nextFloat() * f(f(max) - f(min))));
  }

  /** `OutfitRNG.NextBool(int invProbability)`: true once in `invProbability` draws. */
  nextBool(invProbability: number): boolean {
    return this.next(invProbability) === 0;
  }

  /** `OutfitRNG.pickRandom(List)`: no draw for lists of one, undefined for empty lists. */
  pickRandom<T>(list: readonly T[]): T | undefined {
    if (list.length === 0) return undefined;
    if (list.length === 1) return list[0];
    return list[this.next(list.length)];
  }

  /**
   * `OutfitRNG.randomImmutableColor(noBlack)`: hue in [0, 1), saturation in [0, 0.6),
   * brightness from 0.1 (0.2 when black clothes are disallowed) to 0.9.
   */
  randomColor(noBlack = false): RgbColor {
    const hue = this.nextFloat(0, 1);
    const saturation = this.nextFloat(0, 0.6);
    const brightness = this.nextFloat(noBlack ? 0.2 : 0.1, 0.9);
    return hsbToRgb(hue, saturation, brightness);
  }
}
