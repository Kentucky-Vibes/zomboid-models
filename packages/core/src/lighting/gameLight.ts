/**
 * Daylight by the hour, the way the game computes it. `ClimateManager` blends a colour and a
 * strength for the time of day from a table per season (`ClimateMain.lua`), `ErosionSeason`
 * gives the dawn and dusk hours of the map's latitude, and `RenderSettings` turns the two into
 * the light of an outdoor square. Weather is left clear and the wind still.
 *
 * The result is relative: the light of a clear summer afternoon, the brightest the game gets,
 * counts as 1, and the viewer scales its own daylight by the ratio. That keeps the game's
 * curve and colours (blue dawns, orange dusks, grey-blue nights, short winter days) while the
 * viewer's usual brightness stays where it is.
 */

export type Season = 'summer' | 'autumn' | 'winter' | 'spring';

/** A named time of day, or the viewer's neutral white light. */
export type LightingPreset = 'day' | 'dusk' | 'night' | 'studio';

export interface LightingTime {
  /** Hour of the day, 0 to 24. */
  hour: number;
  /** Summer by default. */
  season?: Season;
  /** How full the moon is, 0 to 1; half by default. It brightens nights a little. */
  moon?: number;
}

export type LightingOption = LightingPreset | LightingTime;

/** Per-channel factors on the viewer's daylight, in the game's own (display) terms. */
export interface SceneLighting {
  factor: [number, number, number];
}

/** A colour with its alpha, as the game's `ColorInfo` holds it. */
export type Rgba = [number, number, number, number];

const SEASON_ROW: Record<Season, number> = { summer: 0, autumn: 1, winter: 2, spring: 3 };

/** Exterior colours of clear weather from `ClimateMain.lua`, one row per season. */
const DAWN: Rgba[] = [
  [0.57, 0.69, 0.75, 0.75],
  [0.61, 0.5, 0.72, 0.75],
  [0.48, 0.57, 0.63, 0.75],
  [0.57, 0.66, 0.64, 0.75],
];
const DAY: Rgba[] = [
  [0.86, 0.82, 0.74, 0.79],
  [0.84, 0.7, 0.54, 0.8],
  [0.71, 0.59, 0.46, 0.75],
  [0.7, 0.75, 0.65, 0.7],
];
const DUSK: Rgba[] = [
  [0.9, 0.45, 0.2, 0.8],
  [0.8, 0.39, 0.28, 0.85],
  [0.52, 0.4, 0.32, 0.93],
  [0.64, 0.4, 0.3, 0.88],
];
const NIGHT_NO_MOON: Rgba = [0.25, 0.25, 0.25, 0.8];
const NIGHT_MOON: Rgba = [0.33, 0.33, 0.33, 0.8];

/** `ErosionSeason`: the map's latitude and the axial tilt give the daylight of the solstices. */
const LATITUDE = 38;
const AXIAL_TILT = 23.44;
const HIGH_NOON = 12.5;
const SUMMER_TILT = 2;
/** How far the year is from the winter solstice (0) towards the summer one (1). */
const DAY_PERCENT: Record<Season, number> = { winter: 0, spring: 0.5, summer: 1, autumn: 0.5 };
/** `RenderSettings`: the floor of the ambient light at the default night darkness. */
const AMBIENT_MIN = 0.15;
const MOON_AMBIENT = 0.075;
/** `ClimateValues`: how much the season and the wind take off the daylight. */
const SEASON_DIM = 0.15;

const RAD = Math.PI / 180;

function clerp(t: number, a: number, b: number): number {
  return a + (b - a) * ((1 - Math.cos(t * Math.PI)) / 2);
}

function lerp(t: number, a: number, b: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function interp(a: Rgba, b: Rgba, t: number): Rgba {
  return [lerp(t, a[0], b[0]), lerp(t, a[1], b[1]), lerp(t, a[2], b[2]), lerp(t, a[3], b[3])];
}

function solsticeDaylight(sign: 1 | -1): number {
  const product = Math.tan(LATITUDE * RAD) * Math.tan(AXIAL_TILT * RAD);
  return (2 * (Math.acos(sign * product) / RAD)) / 15;
}

const SUMMER_DAYLIGHT = solsticeDaylight(-1);
const WINTER_DAYLIGHT = solsticeDaylight(1);

export interface DayHours {
  dawn: number;
  noon: number;
  dusk: number;
  daylight: number;
}

/** Dawn, solar noon, and dusk of a season at the map's latitude, as `ErosionSeason` sets them. */
export function dayHours(season: Season): DayHours {
  const percent = DAY_PERCENT[season];
  const daylight = clerp(percent, WINTER_DAYLIGHT, SUMMER_DAYLIGHT);
  const noon = HIGH_NOON + SUMMER_TILT * percent;
  return { dawn: noon - daylight / 2, noon, dusk: noon + daylight / 2, daylight };
}

/**
 * `ClimateManager.getTimeLerp` with the curve on: rises from 0 at `from` to 1 in the middle of
 * the window and falls back to 0 at `to`, the window wrapping past midnight.
 */
function timeLerp(hour: number, from: number, to: number): number {
  const span = (((to - from) % 24) + 24) % 24;
  const position = (((hour - from) % 24) + 24) % 24;
  if (span <= 0 || position > span) return 0;
  const fraction = position / span;
  return clerp(fraction < 0.5 ? fraction * 2 : (1 - fraction) * 2, 0, 1);
}

export interface Climate {
  /** 0 by day, 1 deep in the night. */
  nightStrength: number;
  /** The daylight left after the night and the season: the game's ambient. */
  dayLightStrength: number;
  /** The colour the game blends every square with, and its alpha as the blend's strength. */
  globalLight: Rgba;
}

/** The state of `ClimateManager` at an hour of a season, in clear and still weather. */
export function climateAt(hour: number, season: Season, moon: number): Climate {
  const time = ((hour % 24) + 24) % 24;
  const { dawn, noon, dusk } = dayHours(season);
  const percent = DAY_PERCENT[season];
  const nightStrength = clamp01(2 * timeLerp(time, dusk, dawn));
  const dayLightStrength = (1 - nightStrength) * (1 - SEASON_DIM * percent);
  const row = SEASON_ROW[season];
  const colDawn = DAWN[row] as Rgba;
  const colDay = DAY[row] as Rgba;
  const colDusk = DUSK[row] as Rgba;
  let light: Rgba;
  if (time < dawn || time > dusk) {
    const span = 24 - dusk + dawn;
    const d = time > dusk ? (time - dusk) / span : (24 - dusk + time) / span;
    light = interp(colDusk, colDawn, d);
  } else if (time < noon + 2) {
    light = interp(colDawn, colDay, (time - dawn) / (noon + 2 - dawn));
  } else {
    light = interp(colDay, colDusk, (time - (noon + 2)) / (dusk - (noon + 2)));
  }
  const night = interp(NIGHT_NO_MOON, NIGHT_MOON, clamp01(moon));
  return { nightStrength, dayLightStrength, globalLight: interp(light, night, nightStrength) };
}

/** `ColorInfo.desaturate`: towards the game's grey, weighted 0.3086, 0.6094, 0.082. */
function desaturate(color: Rgba, amount: number): [number, number, number] {
  const grey = 0.3086 * color[0] + 0.6094 * color[1] + 0.082 * color[2];
  return [lerp(amount, color[0], grey), lerp(amount, color[1], grey), lerp(amount, color[2], grey)];
}

/**
 * `RenderSettings.updateRenderSettings`: the light on a lit outdoor square, as the ambient
 * strength times the tint the global light leaves after its desaturation.
 */
export function squareLight(hour: number, season: Season, moon = 0.5): [number, number, number] {
  const climate = climateAt(hour, season, moon);
  const ambientMin = AMBIENT_MIN + MOON_AMBIENT * clamp01(moon) * climate.nightStrength;
  const ambient = ambientMin + (1 - ambientMin) * climate.dayLightStrength;
  const percent = DAY_PERCENT[season];
  const desaturation = (1 - percent) * 0.4 * climate.dayLightStrength;
  const tint = desaturate(climate.globalLight, desaturation);
  const strength = climate.globalLight[3];
  return [
    ambient * lerp(strength, 1, tint[0]),
    ambient * lerp(strength, 1, tint[1]),
    ambient * lerp(strength, 1, tint[2]),
  ];
}

/** The hours the presets stand for. */
export const LIGHTING_PRESETS: Record<Exclude<LightingPreset, 'studio'>, Required<LightingTime>> = {
  day: { hour: 16.5, season: 'summer', moon: 0 },
  dusk: { hour: dayHours('autumn').dusk, season: 'autumn', moon: 0.5 },
  night: { hour: 0, season: 'autumn', moon: 1 },
};

/** The brightest square light of the year: a clear summer afternoon, once the dawn has faded. */
const REFERENCE = Math.max(...squareLight(16.5, 'summer', 0));

/** The factors a lighting option puts on the viewer's daylight; `day` when none is given. */
export function resolveLighting(option: LightingOption = 'day'): SceneLighting {
  if (option === 'studio') return { factor: [1, 1, 1] };
  const time = typeof option === 'string' ? LIGHTING_PRESETS[option] : option;
  const light = squareLight(time.hour, time.season ?? 'summer', time.moon ?? 0.5);
  return {
    factor: [light[0] / REFERENCE, light[1] / REFERENCE, light[2] / REFERENCE],
  };
}

/**
 * The factors as light intensities for a renderer that works in linear light: the game
 * multiplies its textures as they are, so a factor of one half looks like the sRGB half.
 */
export function lightingLinear(lighting: SceneLighting): [number, number, number] {
  const to = (value: number): number => Math.pow(Math.max(0, value), 2.2);
  return [to(lighting.factor[0]), to(lighting.factor[1]), to(lighting.factor[2])];
}
