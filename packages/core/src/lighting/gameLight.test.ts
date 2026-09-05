import { describe, expect, it } from 'vitest';

import { climateAt, dayHours, lightingLinear, resolveLighting, squareLight } from './gameLight.js';

describe('dayHours', () => {
  it('matches ErosionSeason at latitude 38', () => {
    const winter = dayHours('winter');
    expect(winter.daylight).toBeCloseTo(9.36, 2);
    expect(winter.dawn).toBeCloseTo(7.82, 2);
    expect(winter.dusk).toBeCloseTo(17.18, 2);
    const spring = dayHours('spring');
    expect(spring.daylight).toBeCloseTo(12, 5);
    expect(spring.dawn).toBeCloseTo(7.5, 5);
    expect(spring.dusk).toBeCloseTo(19.5, 5);
    const summer = dayHours('summer');
    expect(summer.daylight).toBeCloseTo(14.64, 2);
    expect(summer.dawn).toBeCloseTo(7.18, 2);
    expect(summer.dusk).toBeCloseTo(21.82, 2);
  });
});

describe('climateAt', () => {
  it('has no night at noon and most of it at midnight', () => {
    expect(climateAt(14.5, 'summer', 0).nightStrength).toBe(0);
    expect(climateAt(0, 'summer', 0).nightStrength).toBeCloseTo(0.893, 2);
    expect(climateAt(2.5, 'summer', 0).nightStrength).toBe(1);
  });

  it('blends the day colour on a summer afternoon', () => {
    const { globalLight, dayLightStrength } = climateAt(14.5, 'summer', 0);
    expect(dayLightStrength).toBeCloseTo(0.85, 5);
    expect(globalLight[0]).toBeCloseTo(0.798, 2);
    expect(globalLight[1]).toBeCloseTo(0.792, 2);
    expect(globalLight[2]).toBeCloseTo(0.742, 2);
    expect(globalLight[3]).toBeCloseTo(0.781, 2);
  });
});

describe('squareLight', () => {
  it('reproduces the game at a summer noon and at midnight', () => {
    const noon = squareLight(14.5, 'summer', 0);
    expect(noon[0]).toBeCloseTo(0.735, 2);
    expect(noon[1]).toBeCloseTo(0.731, 2);
    expect(noon[2]).toBeCloseTo(0.697, 2);
    const midnight = squareLight(0, 'summer', 0);
    expect(midnight[0]).toBeCloseTo(0.102, 2);
    expect(midnight[1]).toBeCloseTo(0.096, 2);
    expect(midnight[2]).toBeCloseTo(0.093, 2);
  });

  it('is orange at dusk and dimmer in winter', () => {
    const dusk = squareLight(dayHours('autumn').dusk, 'autumn');
    expect(dusk[0]).toBeGreaterThan(dusk[1] * 1.5);
    expect(dusk[1]).toBeGreaterThan(dusk[2]);
    const winter = squareLight(12.5, 'winter');
    const summer = squareLight(14.5, 'summer');
    expect(winter[0]).toBeLessThan(summer[0]);
  });
});

describe('resolveLighting', () => {
  it('leaves the studio light alone and anchors the day preset at one', () => {
    expect(resolveLighting('studio').factor).toEqual([1, 1, 1]);
    const day = resolveLighting('day').factor;
    expect(Math.max(...day)).toBeCloseTo(1, 5);
    expect(day[2]).toBeLessThan(day[0]);
    expect(resolveLighting().factor).toEqual(day);
  });

  it('darkens towards night and takes an hour with defaults', () => {
    const night = resolveLighting('night').factor;
    expect(Math.max(...night)).toBeLessThan(0.2);
    const evening = resolveLighting({ hour: 23 }).factor;
    expect(evening[0]).toBeLessThan(1);
    expect(evening[0]).toBeGreaterThan(night[0]);
  });

  it('converts the factors to linear light', () => {
    expect(lightingLinear({ factor: [1, 0.5, 0] })).toEqual([1, Math.pow(0.5, 2.2), 0]);
  });
});
