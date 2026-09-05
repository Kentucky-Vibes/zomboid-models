import { describe, expect, it } from 'vitest';

import { lightbarSideAt } from './lightbar.js';

describe('lightbarSideAt', () => {
  it('alternates slowly in mode 1 with dark gaps', () => {
    expect(
      [0, 49, 50, 449, 450, 549, 550, 949, 950, 999, 1000, 1200].map((t) => lightbarSideAt(1, t)),
    ).toEqual([0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 0, 1]);
  });

  it('double-flashes each side in mode 2', () => {
    expect([100, 275, 400, 525, 600, 775, 900].map((t) => lightbarSideAt(2, t))).toEqual([
      1, 0, 1, 0, 2, 0, 2,
    ]);
  });

  it('cycles every 300 milliseconds in mode 3', () => {
    expect([10, 100, 150, 200, 290, 400].map((t) => lightbarSideAt(3, t))).toEqual([
      0, 1, 0, 2, 0, 1,
    ]);
  });
});
