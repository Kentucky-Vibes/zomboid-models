/**
 * Readers for the Lua definition tables behind outfit randomisation: default clothing, hair
 * pools per outfit, underwear, and attached weapons. The files are plain Lua that fills global
 * tables, so they are executed with a Lua interpreter (fengari) in a sandbox that provides the
 * few game globals they touch, and the resulting tables are read back in the order Lua keeps
 * them (the game backs its tables with insertion-ordered maps).
 */
import { lauxlib, lua, lualib, to_luastring, type LuaState } from 'fengari';

import type {
  BodyPart,
  ManifestAttachedWeapon,
  ManifestAttachedWeapons,
  ManifestChance,
  ManifestColor,
  ManifestDefaultClothing,
  ManifestHairDefinitions,
  ManifestUnderwear,
} from 'zomboid-models/format';

/** A Lua value read back into JavaScript; tables keep their key order. */
export type LuaValue = string | number | boolean | LuaTable | undefined;
export type LuaTable = Map<string | number, LuaValue>;

const PRELUDE = `
ColorInfo = { new = function(r, g, b, a) return { r = r, g = g, b = b, a = a } end }
SurvivorDesc = { hairColors = {}, trouserColors = {} }
function SurvivorDesc.addHairColor(c) table.insert(SurvivorDesc.hairColors, c) end
function SurvivorDesc.addTrouserColor(c) table.insert(SurvivorDesc.trouserColors, c) end
function getActivatedMods() return { size = function() return 0 end, get = function() return nil end } end
function isServer() return false end
function isClient() return false end
function copyTable(t) local r = {} for k, v in pairs(t) do r[k] = v end return r end
function getTexture(name) return { getName = function() return name end } end
function ZombRand(a, b) return (b and a or 0) end
function ZombRandFloat(a, b) return a end
`;

/** The error message on top of the stack when a Lua call failed, popped. */
function failure(L: LuaState, status: number, what: string): string | undefined {
  if (status === lua.LUA_OK) return undefined;
  const message = lua.lua_tojsstring(L, -1);
  lua.lua_pop(L, 1);
  return `${what}: ${message}`;
}

function check(L: LuaState, status: number, what: string): void {
  const message = failure(L, status, what);
  if (message !== undefined) throw new Error(message);
}

export interface EvaluateLuaOptions {
  /**
   * Keeps going after a source fails, recording the message here. The game's definition
   * folders mix data files with code that needs the running game; the data still loads.
   */
  errors?: string[];
}

function readValue(L: LuaState, index: number, depth: number): LuaValue {
  const type = lua.lua_type(L, index);
  if (type === lua.LUA_TSTRING) return lua.lua_tojsstring(L, index);
  if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(L, index);
  if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, index);
  if (type === lua.LUA_TTABLE && depth < 12) {
    const table: LuaTable = new Map();
    const absolute = lua.lua_absindex(L, index);
    lua.lua_pushnil(L);
    while (lua.lua_next(L, absolute) !== 0) {
      const keyType = lua.lua_type(L, -2);
      const key: string | number | undefined =
        keyType === lua.LUA_TSTRING
          ? lua.lua_tojsstring(L, -2)
          : keyType === lua.LUA_TNUMBER
            ? lua.lua_tonumber(L, -2)
            : undefined;
      if (key !== undefined) table.set(key, readValue(L, -1, depth + 1));
      lua.lua_pop(L, 1);
    }
    return table;
  }
  return undefined;
}

/** Runs Lua sources in a fresh sandbox and returns the named globals as ordered tables. */
export function evaluateLua(
  sources: readonly string[],
  globals: readonly string[],
  options: EvaluateLuaOptions = {},
): Map<string, LuaValue> {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  check(L, lauxlib.luaL_dostring(L, to_luastring(PRELUDE)), 'prelude');
  for (const [index, source] of sources.entries()) {
    const status = lauxlib.luaL_dostring(L, to_luastring(source));
    if (options.errors) {
      const message = failure(L, status, `lua source ${index + 1}`);
      if (message !== undefined) options.errors.push(message);
    } else {
      check(L, status, `lua source ${index + 1}`);
    }
  }
  const out = new Map<string, LuaValue>();
  for (const name of globals) {
    lua.lua_getglobal(L, to_luastring(name));
    out.set(name, readValue(L, -1, 0));
    lua.lua_pop(L, 1);
  }
  lua.lua_close(L);
  return out;
}

function tableOf(value: LuaValue): LuaTable {
  return value instanceof Map ? value : new Map<string | number, LuaValue>();
}

function stringOf(value: LuaValue): string | undefined {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
}

function numberOf(value: LuaValue, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

/** Values of a Lua array (1-based integer keys) in index order. */
function arrayOf(value: LuaValue): LuaValue[] {
  const table = tableOf(value);
  const out: LuaValue[] = [];
  for (let i = 1; table.has(i); i++) out.push(table.get(i));
  return out;
}

function stringsOf(value: LuaValue): string[] {
  return arrayOf(value)
    .map(stringOf)
    .filter((s): s is string => s !== undefined);
}

/** Entries with string keys, in insertion order. */
function namedEntries(value: LuaValue): [string, LuaValue][] {
  return [...tableOf(value)].filter(
    (entry): entry is [string, LuaValue] => typeof entry[0] === 'string',
  );
}

/** `name:chance;name:chance`, the format of `HairOutfitDefinitions` chance strings. */
export function parseChanceList(text: string | undefined): ManifestChance[] | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  const out: ManifestChance[] = [];
  for (const part of text.split(';')) {
    const separator = part.lastIndexOf(':');
    if (separator < 0) continue;
    const chance = Number(part.slice(separator + 1));
    if (!Number.isFinite(chance)) continue;
    out.push({ value: part.slice(0, separator).trim(), chance });
  }
  return out;
}

export function readDefaultClothing(value: LuaValue): ManifestDefaultClothing {
  const root = tableOf(value);
  const group = (key: string): { hue: string[]; texture: string[]; tint: string[] } => {
    const table = tableOf(root.get(key));
    return {
      hue: stringsOf(table.get('hue')),
      texture: stringsOf(table.get('texture')),
      tint: stringsOf(table.get('tint')),
    };
  };
  const pants = group('Pants');
  const tShirt = group('TShirt');
  const tShirtDecal = group('TShirtDecal');
  const vest = group('Vest');
  return {
    pants,
    tShirt: { texture: tShirt.texture, tint: tShirt.tint },
    tShirtDecal: { texture: tShirtDecal.texture, tint: tShirtDecal.tint },
    vest: { texture: vest.texture, tint: vest.tint },
  };
}

function colorOf(value: LuaValue): ManifestColor | undefined {
  const table = tableOf(value);
  const r = numberOf(table.get('r'), Number.NaN);
  const g = numberOf(table.get('g'), Number.NaN);
  const b = numberOf(table.get('b'), Number.NaN);
  if ([r, g, b].some((c) => !Number.isFinite(c))) return undefined;
  return { r, g, b };
}

export function readHairDefinitions(
  definitions: LuaValue,
  hairColors: LuaValue,
): ManifestHairDefinitions {
  const root = tableOf(definitions);
  const restricted: ManifestHairDefinitions['restricted'] = [];
  for (const entry of arrayOf(root.get('haircutDefinition'))) {
    const table = tableOf(entry);
    const style = stringOf(table.get('name'));
    if (style === undefined) continue;
    restricted.push({
      style,
      minWorldAge: numberOf(table.get('minWorldAge'), 0),
      onlyFor: (stringOf(table.get('onlyFor')) ?? '').split(','),
    });
  }
  const byOutfit: ManifestHairDefinitions['byOutfit'] = [];
  for (const entry of arrayOf(root.get('haircutOutfitDefinition'))) {
    const table = tableOf(entry);
    const outfit = stringOf(table.get('outfit'));
    if (outfit === undefined) continue;
    const item: ManifestHairDefinitions['byOutfit'][number] = { outfit };
    const haircut = parseChanceList(stringOf(table.get('haircut')));
    const femaleHaircut = parseChanceList(stringOf(table.get('femaleHaircut')));
    const maleHaircut = parseChanceList(stringOf(table.get('maleHaircut')));
    const beard = parseChanceList(stringOf(table.get('beard')));
    const haircutColor = parseChanceList(stringOf(table.get('haircutColor')));
    if (haircut) item.haircut = haircut;
    if (femaleHaircut) item.femaleHaircut = femaleHaircut;
    if (maleHaircut) item.maleHaircut = maleHaircut;
    if (beard) item.beard = beard;
    if (haircutColor) item.haircutColor = haircutColor;
    byOutfit.push(item);
  }
  const colors = arrayOf(hairColors)
    .map(colorOf)
    .filter((c): c is ManifestColor => c !== undefined);
  return { restricted, byOutfit, colors };
}

export function readUnderwear(value: LuaValue): ManifestUnderwear {
  const root = tableOf(value);
  const definitions: ManifestUnderwear['definitions'] = [];
  for (const [, entry] of namedEntries(root)) {
    if (!(entry instanceof Map)) continue;
    const bottom = stringOf(entry.get('bottom'));
    if (bottom === undefined) continue;
    const tops: ManifestChance[] = [];
    for (const top of arrayOf(entry.get('top'))) {
      const table = tableOf(top);
      const name = stringOf(table.get('name'));
      if (name === undefined) continue;
      tops.push({ value: name, chance: numberOf(table.get('chance'), 0) });
    }
    definitions.push({
      female: stringOf(entry.get('gender')) === 'female',
      chanceToSpawn: numberOf(entry.get('chanceToSpawn'), 0),
      bottom,
      ...(entry.has('top') ? { top: tops } : {}),
    });
  }
  return { baseChance: numberOf(root.get('baseChance'), 50), definitions };
}

const BODY_PART_NAMES = new Set([
  'Hand_L',
  'Hand_R',
  'ForeArm_L',
  'ForeArm_R',
  'UpperArm_L',
  'UpperArm_R',
  'Torso_Upper',
  'Torso_Lower',
  'Head',
  'Neck',
  'Groin',
  'UpperLeg_L',
  'UpperLeg_R',
  'LowerLeg_L',
  'LowerLeg_R',
  'Foot_L',
  'Foot_R',
  'Back',
]);

function readAttachedWeapon(id: string, value: LuaValue): ManifestAttachedWeapon | undefined {
  const table = tableOf(value);
  const bloodLocations = stringsOf(table.get('bloodLocations')).filter((part) =>
    BODY_PART_NAMES.has(part),
  ) as BodyPart[];
  const ensureItem = stringOf(table.get('ensureItem'));
  return {
    id,
    chance: numberOf(table.get('chance'), 0),
    outfit: stringsOf(table.get('outfit')),
    weaponLocation: stringsOf(table.get('weaponLocation')).sort(),
    bloodLocations: [...bloodLocations].sort(),
    addHoles: table.get('addHoles') === true,
    daySurvived: numberOf(table.get('daySurvived'), 0),
    ...(ensureItem !== undefined ? { ensureItem } : {}),
    weapons: stringsOf(table.get('weapons')).sort(),
  };
}

export function readAttachedWeapons(value: LuaValue): ManifestAttachedWeapons {
  const root = tableOf(value);
  const definitions: ManifestAttachedWeapon[] = [];
  const byOutfit: ManifestAttachedWeapons['byOutfit'] = [];
  for (const [key, entry] of namedEntries(root)) {
    if (!(entry instanceof Map)) continue;
    if (key === 'attachedWeaponCustomOutfit') {
      for (const [outfit, custom] of namedEntries(entry)) {
        if (!(custom instanceof Map)) continue;
        const weapons: ManifestAttachedWeapon[] = [];
        for (const [, weapon] of tableOf(custom.get('weapons'))) {
          const table = tableOf(weapon);
          const id = stringOf(table.get('id'));
          const definition = id === undefined ? undefined : readAttachedWeapon(id, weapon);
          if (definition) weapons.push(definition);
        }
        byOutfit.push({
          outfit,
          chance: numberOf(custom.get('chance'), 0),
          maxItems: numberOf(custom.get('maxitem'), -1),
          weapons,
        });
      }
      continue;
    }
    const definition = readAttachedWeapon(key, entry);
    if (definition) definitions.push(definition);
  }
  definitions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { definitions, byOutfit };
}

/**
 * Extracts the `SurvivorDesc.addHairColor(...)` calls of `MainCreationMethods.lua` as a Lua
 * snippet, so the colour table can be evaluated without the rest of that file.
 */
export function hairColorCalls(mainCreationMethods: string): string {
  const calls = mainCreationMethods.match(/SurvivorDesc\.addHairColor\([^\n]*\)/g) ?? [];
  return calls.map((call) => call.replace(/;\s*$/, '')).join('\n');
}
