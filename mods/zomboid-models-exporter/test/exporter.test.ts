/**
 * Runs the mod's Lua under fengari (Lua 5.3 in JavaScript) with mock game objects. Kahlua, the
 * game's runtime, is closer to Lua 5.1; the mod only uses features both have.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lauxlib, lua, lualib, to_luastring, type LuaState } from 'fengari';
import { describe, expect, it } from 'vitest';
import { validateCharacterDescription, type CharacterDescription } from 'zomboid-models';

const here = dirname(fileURLToPath(import.meta.url));
const luaRoot = join(here, '..', '42', 'media', 'lua');

/** Game globals and objects the exporter touches, as Lua tables with colon-call methods. */
const GAME_MOCK = `
local parts = { 'Hand_L', 'Hand_R', 'ForeArm_L', 'ForeArm_R', 'UpperArm_L', 'UpperArm_R',
  'Torso_Upper', 'Torso_Lower', 'Head', 'Neck', 'Groin', 'UpperLeg_L', 'UpperLeg_R',
  'LowerLeg_L', 'LowerLeg_R', 'Foot_L', 'Foot_R', 'Back' }
BloodBodyPartType = {}
BodyPartType = {}
for i, name in ipairs(parts) do
  BloodBodyPartType[name] = { name = name, index = function() return i - 1 end }
  BodyPartType[name] = { name = name }
end

written = {}
function getFileWriter(relPath, createIfNull, append)
  local buffer = {}
  return {
    write = function(self, text) table.insert(buffer, text) end,
    close = function(self) written[relPath] = table.concat(buffer) end,
  }
end

local function color(r, g, b)
  return { getRedFloat = function() return r end, getGreenFloat = function() return g end, getBlueFloat = function() return b end }
end

local function visual(fields)
  local v = {
    getClothingItem = function() return {} end,
    getClothingItemName = function() return fields.clothingItem end,
    getAlternateModelName = function() return fields.alternate end,
    getTextureChoice = function() return fields.textureChoice or -1 end,
    getBaseTexture = function() return fields.baseTexture or -1 end,
    getTint = function() return fields.tint end,
    getHue = function() return fields.hue or math.huge end,
    getDecal = function(self, clothingItem) return fields.decal end,
    getBlood = function(self, part) return (fields.blood or {})[part.name] or 0 end,
    getDirt = function(self, part) return (fields.dirt or {})[part.name] or 0 end,
    getHole = function(self, part) return (fields.holes or {})[part.name] and 1 or 0 end,
    getBasicPatch = function(self, part) return (fields.patches or {})[part.name] == 'basic' and 1 or 0 end,
    getDenimPatch = function(self, part) return (fields.patches or {})[part.name] == 'denim' and 1 or 0 end,
    getLeatherPatch = function(self, part) return (fields.patches or {})[part.name] == 'leather' and 1 or 0 end,
  }
  return v
end

local function item(fullType, fields)
  local it = { getFullType = function() return fullType end }
  if fields then it.getVisual = function() return visual(fields) end end
  if fields and fields.bloodLevel then it.getBloodLevel = function() return fields.bloodLevel end end
  return it
end

local function list(entries)
  return { size = function() return #entries end, get = function(self, i) return entries[i + 1] end }
end

local function bodyPart(state)
  state = state or {}
  return {
    bandaged = function() return state.bandaged or false end,
    isBandageDirty = function() return state.dirty or false end,
    bitten = function() return state.bitten or false end,
    scratched = function() return state.scratched or false end,
    isCut = function() return state.cut or false end,
    isDeepWounded = function() return state.deep or false end,
    isBurnt = function() return false end,
    stitched = function() return state.stitched or false end,
    isSplint = function() return false end,
    bleeding = function() return state.bleeding or false end,
  }
end

function makePlayer(female)
  local damageByPart = {
    Torso_Upper = bodyPart({ bitten = true, bandaged = true, dirty = true }),
    Hand_L = bodyPart({ scratched = true, bleeding = true }),
  }
  return {
    isFemale = function() return female end,
    getUsername = function() return 'tlagx' end,
    getDisplayName = function() return 'Grey' end,
    getHumanVisual = function()
      return {
        getSkinTextureIndex = function() return 2 end,
        getSkinTexture = function() return female and 'FemaleBody03' or 'MaleBody03a' end,
        getBodyHairIndex = function() return female and -1 or 0 end,
        getHairModel = function() return 'CrewCut' end,
        getBeardModel = function() return female and '' or 'Full' end,
        getHairColor = function() return color(0.3, 0.2, 0.1) end,
        getBeardColor = function() return color(0.3, 0.2, 0.1) end,
        getBlood = function(self, part) return part.name == 'Head' and 0.5 or 0 end,
        getDirt = function(self, part) return 0 end,
      }
    end,
    getWornItems = function()
      return {
        size = function() return 3 end,
        get = function(self, i)
          local items = {
            { getItem = function() return item('Base.Trousers_Denim', { textureChoice = 1, blood = { Groin = 0.25 }, holes = { UpperLeg_L = true }, patches = { LowerLeg_R = 'denim' } }) end },
            { getItem = function() return item('Base.Tshirt_DefaultDECAL', { tint = color(0.9, 0.9, 0.6), hue = 0.25, decal = 'TShirtSpiffo1' }) end },
            { getItem = function() return item('Base.Hat_BaseballCap_Police') end },
          }
          return items[i + 1]
        end,
      }
    end,
    getPrimaryHandItem = function() return item('Base.Axe', { bloodLevel = 0.4 }) end,
    getSecondaryHandItem = function() return nil end,
    getAttachedItems = function() return list({ { getLocation = function() return 'Rifle On Back' end, getItem = function() return item('Base.VarmintRifle') end } }) end,
    getBodyDamage = function()
      return { getBodyPart = function(self, partType) return damageByPart[partType.name] or bodyPart() end }
    end,
  }
end
`;

function run(L: LuaState, code: string): void {
  const status = lauxlib.luaL_dostring(L, to_luastring(code));
  if (status !== lua.LUA_OK) {
    throw new Error(lua.lua_tojsstring(L, -1));
  }
}

function newState(): LuaState {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  run(L, GAME_MOCK);
  // `require 'ZomboidModels/JSON'` in the mod resolves through the game's loader; here the
  // files are loaded by hand in dependency order and `require` becomes a no-op.
  run(L, 'function require(name) end');
  run(L, readFileSync(join(luaRoot, 'shared', 'ZomboidModels', 'JSON.lua'), 'utf8'));
  run(L, readFileSync(join(luaRoot, 'shared', 'ZomboidModels', 'Exporter.lua'), 'utf8'));
  return L;
}

function evalString(L: LuaState, expression: string): string {
  run(L, `__result = ${expression}`);
  run(L, 'return __result');
  const value = lua.lua_tojsstring(L, -1);
  lua.lua_pop(L, 1);
  return value;
}

describe('ZomboidModelsJSON', () => {
  it('encodes objects with sorted keys, arrays, strings with escapes, and rounded numbers', () => {
    const L = newState();
    const json = evalString(
      L,
      `ZomboidModelsJSON.encode({ b = 'q"\\n', a = ZomboidModelsJSON.array({ 1, 2.5, true }), c = { n = 0 }, d = 0.123456789, e = math.huge })`,
    );
    expect(JSON.parse(json)).toEqual({ a: [1, 2.5, true], b: 'q"\n', c: [], d: 0.1235, e: null });
  });
});

describe('ZomboidModels.export', () => {
  it('writes a valid character document for the mock player', () => {
    const L = newState();
    const relPath = evalString(L, 'ZomboidModels.export(makePlayer(false))');
    expect(relPath).toBe('zomboid-models/tlagx.json');
    const text = evalString(L, `written['${relPath}']`);
    const parsed = JSON.parse(text) as unknown;
    const result = validateCharacterDescription(parsed);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const doc = (result as { value: CharacterDescription }).value;

    expect(doc.body).toEqual({
      sex: 'male',
      skin: 2,
      skinTexture: 'MaleBody03a',
      bodyHair: true,
      hair: 'CrewCut',
      beard: 'Full',
      hairColor: { r: 0.3, g: 0.2, b: 0.1 },
      beardColor: { r: 0.3, g: 0.2, b: 0.1 },
      blood: { Head: 0.5 },
    });
    expect(doc.worn).toEqual([
      {
        item: 'Base.Trousers_Denim',
        textureChoice: 1,
        blood: { Groin: 0.25 },
        holes: { UpperLeg_L: true },
        patches: { LowerLeg_R: 'denim' },
      },
      {
        item: 'Base.Tshirt_DefaultDECAL',
        tint: { r: 0.9, g: 0.9, b: 0.6 },
        hue: 0.25,
        decal: 'TShirtSpiffo1',
      },
      { item: 'Base.Hat_BaseballCap_Police' },
    ]);
    expect(doc.held).toEqual({ primary: { item: 'Base.Axe', blood: 0.4 } });
    expect(doc.attached).toEqual([{ location: 'Rifle On Back', item: 'Base.VarmintRifle' }]);
    expect(doc.damage).toEqual({
      Hand_L: { scratched: true, bleeding: true },
      Torso_Upper: { bandage: 'dirty', bitten: true },
    });
    expect(doc.meta).toMatchObject({ exporter: 'ZomboidModelsExporter', username: 'tlagx' });
  });

  it('handles a female player without a beard and survives missing methods', () => {
    const L = newState();
    run(L, 'ZomboidModels.export(makePlayer(true))');
    const doc = JSON.parse(
      evalString(L, "written['zomboid-models/tlagx.json']"),
    ) as CharacterDescription;
    expect(doc.body.sex).toBe('female');
    expect(doc.body.beard).toBeUndefined();
    expect(doc.body.bodyHair).toBeUndefined();

    run(L, 'ZomboidModels.export({ getUsername = function() return "a/b c" end })');
    const minimal = JSON.parse(evalString(L, "written['zomboid-models/a_b_c.json']")) as unknown;
    expect(validateCharacterDescription(minimal).ok).toBe(true);
  });
});
