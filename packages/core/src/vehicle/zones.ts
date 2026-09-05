/**
 * The 27 paint zones of the game's vehicle shader. The mask texture colours each zone with an
 * exact colour; the shader turns the colour into one entry of two 4x4 matrices and reads the
 * per-zone switches (lights, damage, uninstalled, blood) from matrices of the same shape.
 *
 * `BaseVehicle` fills those matrices as flat arrays of sixteen floats and uploads them
 * transposed, so array index `k` lands on zone `(k mod 4) * 4 + floor(k / 4) + 1` of the first
 * matrix and on zone `17 + (k mod 4) * 4 + floor(k / 4)` of the second. The game's own code is
 * written in array indices; the functions below turn them into zone numbers so the port can be
 * checked against the shader's zone table.
 */

export const ZONE_COUNT = 27;

/** Zone numbers by the names the shader source gives them. */
export const ZONE = {
  head: 1,
  tail: 2,
  doorRightHead: 3,
  doorRightTail: 4,
  doorLeftHead: 5,
  doorLeftTail: 6,
  windowRightHead: 7,
  windowRightTail: 8,
  windowLeftHead: 9,
  windowLeftTail: 10,
  windshield: 11,
  windshieldRear: 12,
  guardRightHead: 13,
  guardRightTail: 14,
  guardLeftHead: 15,
  guardLeftTail: 16,
  roof: 17,
  lightsRightHead: 18,
  lightsLeftHead: 19,
  lightsRightTail: 20,
  lightsLeftTail: 21,
  stopLightsRight: 22,
  stopLightsLeft: 23,
  lightBarRight: 24,
  lightBarLeft: 25,
  hood: 26,
  boot: 27,
} as const;

/** The mask colour of each zone, zone 1 first, as `vehicle_common.frag.h` lists them. */
export const ZONE_COLORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 1, 1],
  [1, 1, 0],
  [1, 0, 1],
  [0, 0, 1],
  [0, 0.5, 0.5],
  [0.5, 0.5, 0],
  [0.5, 0, 0.5],
  [0, 0, 0.5],
  [0.5, 0, 0],
  [0, 0.5, 0],
  [0, 0.75, 0.75],
  [0.75, 0.75, 0],
  [0.75, 0, 0.75],
  [0, 0, 0.75],
  [0, 0, 0],
  [0.25, 0, 0],
  [0.75, 0, 0],
  [0, 0.75, 0],
  [0, 0.25, 0],
  [0.5, 0.25, 0],
  [0.5, 0.75, 0],
  [0.75, 0.75, 0.75],
  [0.25, 0.25, 0.25],
  [1, 0, 0.5],
  [0, 1, 0.5],
];

/** Zone of index `k` of the first array (`textureUninstall1`, `textureLightsEnables1`, ...). */
export function zoneOfIndex1(k: number): number {
  return (k % 4) * 4 + Math.floor(k / 4) + 1;
}

/** Zone of index `k` of the second array (`textureUninstall2`, `textureLightsEnables2`, ...). */
export function zoneOfIndex2(k: number): number {
  return 17 + (k % 4) * 4 + Math.floor(k / 4);
}

/** A value per zone, indexed by zone number; index 0 is unused. */
export type ZoneValues = Float32Array;

export function zoneValues(): ZoneValues {
  return new Float32Array(ZONE_COUNT + 1);
}

/**
 * The two 4x4 matrices the shader expects for a set of zone values, as column-major element
 * arrays: zone `n` is element `n - 1` of the first matrix for zones 1 to 16 and element `n - 17`
 * of the second for the rest.
 */
export function zoneMatrices(values: ZoneValues): [Float32Array, Float32Array] {
  const first = new Float32Array(16);
  const second = new Float32Array(16);
  for (let zone = 1; zone <= 16; zone++) first[zone - 1] = values[zone] ?? 0;
  for (let zone = 17; zone <= ZONE_COUNT; zone++) second[zone - 17] = values[zone] ?? 0;
  return [first, second];
}
