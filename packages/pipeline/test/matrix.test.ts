import { describe, expect, it } from 'vitest';

import {
  approxEqual,
  compose,
  decompose,
  IDENTITY,
  invert,
  multiply,
  quaternionFromRows,
  transpose,
} from '../src/math/matrix.js';

/** The Dummy01 root frame of the game's exports: a -90 degree rotation about X for row vectors. */
const DUMMY01 = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

describe('matrix', () => {
  it('multiplies in row-vector order', () => {
    const translate = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1];
    const scale = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
    // scale first, then translate: (1,0,0) -> (2,0,0) -> (7,0,0)
    const m = multiply(scale, translate);
    expect(m.slice(12, 15)).toEqual([5, 0, 0]);
    expect(m[0]).toBe(2);
    // translate first, then scale: (1,0,0) -> (6,0,0) -> (12,0,0)
    expect(multiply(translate, scale).slice(12, 15)).toEqual([10, 0, 0]);
  });

  it('inverts and transposes', () => {
    const inverse = invert(DUMMY01);
    expect(approxEqual(multiply(DUMMY01, inverse), IDENTITY)).toBe(true);
    expect(transpose(DUMMY01)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]);
    expect(() => invert(new Array<number>(16).fill(0))).toThrow('singular');
  });

  it('extracts the quaternion of a row-vector rotation', () => {
    const q = quaternionFromRows([
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ]);
    const s = Math.SQRT1_2;
    expect(approxEqual(q, [-s, 0, 0, s])).toBe(true);
    expect(
      quaternionFromRows([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]),
    ).toEqual([0, 0, 0, 1]);
  });

  it('decomposes and recomposes transforms', () => {
    const trs = decompose(DUMMY01);
    expect(trs.translation).toEqual([0, 0, 0]);
    expect(approxEqual(trs.scale, [1, 1, 1])).toBe(true);
    expect(approxEqual(compose(trs), DUMMY01)).toBe(true);

    const scaled = multiply([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1], DUMMY01);
    const withTranslation = [...scaled.slice(0, 12), 1, 2, 3, 1];
    const parts = decompose(withTranslation);
    expect(approxEqual(parts.scale, [2, 3, 4])).toBe(true);
    expect(parts.translation).toEqual([1, 2, 3]);
    expect(approxEqual(compose(parts), withTranslation)).toBe(true);
  });

  it('keeps mirrored transforms recomposable', () => {
    const mirrored = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const parts = decompose(mirrored);
    expect(parts.scale[0]).toBe(-1);
    expect(approxEqual(compose(parts), mirrored)).toBe(true);
  });
});
