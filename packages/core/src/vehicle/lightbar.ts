/**
 * The light bar patterns of `LightbarLightsMode`: each mode is a cycle in milliseconds during
 * which one side or none is lit, never both. Side 1 is the left half, side 2 the right.
 */

export type LightbarMode = 1 | 2 | 3;

/** Which side is lit: 0 none, 1 left, 2 right. */
export type LightbarSide = 0 | 1 | 2;

interface Step {
  /** The step holds until this many milliseconds into the cycle. */
  until: number;
  side: LightbarSide;
}

const PATTERNS: Record<LightbarMode, { period: number; steps: Step[] }> = {
  // Slow alternation, one full cycle per second with short dark gaps.
  1: {
    period: 1000,
    steps: [
      { until: 50, side: 0 },
      { until: 450, side: 1 },
      { until: 550, side: 0 },
      { until: 950, side: 2 },
      { until: 1000, side: 0 },
    ],
  },
  // Each side flashes twice.
  2: {
    period: 1000,
    steps: [
      { until: 50, side: 0 },
      { until: 250, side: 1 },
      { until: 300, side: 0 },
      { until: 500, side: 1 },
      { until: 550, side: 0 },
      { until: 750, side: 2 },
      { until: 800, side: 0 },
      { until: 1000, side: 2 },
    ],
  },
  // Fast alternation.
  3: {
    period: 300,
    steps: [
      { until: 25, side: 0 },
      { until: 125, side: 1 },
      { until: 175, side: 0 },
      { until: 275, side: 2 },
      { until: 300, side: 0 },
    ],
  },
};

/** The side lit at a time since the light bar was switched on, as `LightbarLightsMode.update`. */
export function lightbarSideAt(mode: LightbarMode, milliseconds: number): LightbarSide {
  const pattern = PATTERNS[mode];
  const t = ((milliseconds % pattern.period) + pattern.period) % pattern.period;
  for (const step of pattern.steps) if (t < step.until) return step.side;
  return 0;
}
