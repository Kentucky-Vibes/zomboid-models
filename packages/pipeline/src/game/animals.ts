/**
 * Readers for the Build 42 animal definitions: `media/lua/shared/Definitions/animal/*.lua`
 * fills the `AnimalDefinitions` and `AnimalAvatarDefinition` tables, which are executed in the
 * same Lua sandbox as the outfit definitions and read back.
 */
import type { ManifestAnimalAvatar, ManifestAnimalBreed } from 'zomboid-models/format';

import { evaluateLua, type LuaTable, type LuaValue } from './luaDefinitions.js';

/** One animal type as the definitions declare it, before models and textures are resolved. */
export interface AnimalDefinition {
  type: string;
  group: string;
  female: boolean;
  /** True when the growth stage of the type has a next stage. */
  baby: boolean;
  /** Model script names. */
  bodyModel: string;
  bodyModelSkel: string | undefined;
  bodyModelSkelNoHead: string | undefined;
  bodyModelHeadless: string | undefined;
  bodyModelFleece: string | undefined;
  /** Texture names under `media/textures/Body`. */
  textureSkeleton: string | undefined;
  textureSkeletonBloody: string | undefined;
  textureSkinned: string | undefined;
  animSet: string;
  minSize: number;
  maxSize: number;
  breeds: Record<string, ManifestAnimalBreed>;
  breedOrder: string[];
  avatar: ManifestAnimalAvatar | undefined;
}

const ANIMAL_PRELUDE = `
IsoDirections = { N = "N", NE = "NE", E = "E", SE = "SE", S = "S", SW = "SW", W = "W", NW = "NW" }
AnimalDefinitions = AnimalDefinitions or {}
AnimalAvatarDefinition = AnimalAvatarDefinition or {}
`;

function tableOf(value: LuaValue): LuaTable {
  return value instanceof Map ? value : new Map<string | number, LuaValue>();
}

function stringOf(value: LuaValue): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function numberOf(value: LuaValue, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A comma-separated texture list from a breed definition. */
function textureList(value: LuaValue): string[] {
  const text = stringOf(value);
  if (text === undefined) return [];
  return text
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function readBreeds(value: LuaValue): {
  breeds: Record<string, ManifestAnimalBreed>;
  order: string[];
} {
  const breeds: Record<string, ManifestAnimalBreed> = {};
  const order: string[] = [];
  for (const [key, entry] of tableOf(value)) {
    if (typeof key !== 'string' || !(entry instanceof Map)) continue;
    const rotten = stringOf(entry.get('rottenTexture'));
    breeds[key] = {
      textures: textureList(entry.get('texture')),
      texturesMale: textureList(entry.get('textureMale')),
      texturesBaby: textureList(entry.get('textureBaby')),
      ...(rotten !== undefined ? { rottenTexture: rotten } : {}),
    };
    order.push(key);
  }
  return { breeds, order };
}

function readAvatar(value: LuaValue): ManifestAnimalAvatar | undefined {
  const table = tableOf(value);
  if (table.size === 0) return undefined;
  return {
    zoom: numberOf(table.get('zoom'), 0),
    xoffset: numberOf(table.get('xoffset'), 0),
    yoffset: numberOf(table.get('yoffset'), 0),
    width: numberOf(table.get('avatarWidth'), 200),
    direction: stringOf(table.get('avatarDir')) ?? 'SE',
  };
}

/** Whether a type's growth stage has a next stage (`IsoAnimal.isBaby`). */
function isBaby(stages: LuaValue, group: string, type: string): boolean {
  const groupStages = tableOf(tableOf(tableOf(stages).get(group)).get('stages'));
  const stage = tableOf(groupStages.get(type));
  return stringOf(stage.get('nextStage')) !== undefined;
}

/**
 * Runs the animal definition files and returns every animal type they declare. A file that
 * fails (some in the folder are game code, not data) is reported in `errors` and skipped.
 */
export function readAnimalDefinitions(
  luaSources: readonly string[],
  errors: string[] = [],
): AnimalDefinition[] {
  const globals = evaluateLua(
    [ANIMAL_PRELUDE, ...luaSources],
    ['AnimalDefinitions', 'AnimalAvatarDefinition'],
    { errors },
  );
  const definitions = tableOf(globals.get('AnimalDefinitions'));
  const avatars = tableOf(globals.get('AnimalAvatarDefinition'));
  const stages = definitions.get('stages');
  const out: AnimalDefinition[] = [];
  for (const [type, entry] of tableOf(definitions.get('animals'))) {
    if (typeof type !== 'string' || !(entry instanceof Map)) continue;
    const bodyModel = stringOf(entry.get('bodyModel'));
    if (bodyModel === undefined) continue;
    const group = stringOf(entry.get('group')) ?? type;
    const { breeds, order } = readBreeds(entry.get('breeds'));
    out.push({
      type,
      group,
      female: entry.get('female') === true,
      baby: isBaby(stages, group, type),
      bodyModel,
      bodyModelSkel: stringOf(entry.get('bodyModelSkel')),
      bodyModelSkelNoHead: stringOf(entry.get('bodyModelSkelNoHead')),
      bodyModelHeadless: stringOf(entry.get('bodyModelHeadless')),
      bodyModelFleece: stringOf(entry.get('bodyModelFleece')),
      textureSkeleton: stringOf(entry.get('textureSkeleton')),
      textureSkeletonBloody: stringOf(entry.get('textureSkeletonBloody')),
      textureSkinned: stringOf(entry.get('textureSkinned')),
      animSet: stringOf(entry.get('animset')) ?? type,
      minSize: numberOf(entry.get('minSize'), 1),
      maxSize: numberOf(entry.get('maxSize'), 1),
      breeds,
      breedOrder: order,
      avatar: readAvatar(avatars.get(type)),
    });
  }
  return out.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
}
