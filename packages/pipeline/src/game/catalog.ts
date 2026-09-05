import { readFileSync } from 'node:fs';

import type {
  ManifestAttachedWeapons,
  ManifestClip,
  ManifestDefaultClothing,
  ManifestHairDefinitions,
  ManifestOutfit,
  ManifestOutfitItem,
  ManifestUnderwear,
  Stance,
} from 'zomboid-models/format';

import {
  buildIdleClipTable,
  parseAnimNode,
  pickStanceNode,
  clipOf,
  STANCE_SOURCES,
  type AnimNode,
  type IdleClipTable,
} from './animSets.js';
import { parseClothingItemXml, type ClothingItemXml } from './clothingXml.js';
import { parseDecalGroupsXml, parseDecalXml, type DecalXml } from './decalsXml.js';
import type { ActiveFileMap } from './fileMap.js';
import {
  parseBeardStylesXml,
  parseHairStylesXml,
  type BeardStyleXml,
  type HairStylesXml,
} from './hairXml.js';
import { parseAttachedLocationsLua, parseBodyLocationsLua, type BodyLocationsData } from './lua.js';
import {
  evaluateLua,
  hairColorCalls,
  readAttachedWeapons,
  readDefaultClothing,
  readHairDefinitions,
  readUnderwear,
} from './luaDefinitions.js';
import { readAnimalDefinitions, type AnimalDefinition } from './animals.js';
import { parseOutfitsXml, type OutfitItemXml } from './outfitsXml.js';
import { entryValue, parseScript, type ScriptBlock, type ScriptEntry } from './scripts.js';
import { VehicleScriptLoader, type VehicleScript } from './vehicleScripts.js';

export interface ItemDefinition {
  /** `Module.Name`, for example `Base.Trousers_Denim`. */
  fullType: string;
  module: string;
  name: string;
  /** Merged entries: a later definition replaces every entry of a key it sets. */
  block: ScriptBlock;
  /** `game` or the id of the mod whose file defined the item last. */
  source: string;
}

export interface ModelAttachment {
  bone: string | undefined;
  offset: [number, number, number];
  rotate: [number, number, number];
  scale: number;
}

export interface ModelDefinition {
  /** `Module.Name`. */
  fullName: string;
  module: string;
  name: string;
  /** Model key: lowercased mesh path under `models_X` (or `models` for text meshes) without extension. */
  mesh: string | undefined;
  /** Mesh name inside the file when the script picks one with `file|mesh`. */
  subMesh: string | undefined;
  texture: string | undefined;
  scale: number;
  static: boolean;
  shader: string | undefined;
  animationsMesh: string | undefined;
  /** `invertX = true`: the game mirrors the mesh on X. */
  invertX: boolean;
  attachments: Record<string, ModelAttachment>;
}

/** Clips per stance, as read from the animation sets. */
export type StanceTable = {
  player: Partial<Record<Stance, ManifestClip>>;
  zombie: Partial<Record<Stance, ManifestClip>>;
};

export interface GameCatalog {
  items: Map<string, ItemDefinition>;
  models: Map<string, ModelDefinition>;
  /** Clothing item definitions keyed by lowercased name. */
  clothingItems: Map<string, ClothingItemXml>;
  /** Lowercased clothing item name per GUID, from every clothing item XML. */
  clothingItemsByGuid: Map<string, string>;
  hair: HairStylesXml;
  beards: BeardStyleXml[];
  bodyLocations: BodyLocationsData;
  attachedLocations: Record<string, string>;
  idle: IdleClipTable;
  stances: StanceTable;
  decals: Record<string, DecalXml>;
  decalGroups: Record<string, string[]>;
  outfits: { male: Record<string, ManifestOutfit>; female: Record<string, ManifestOutfit> };
  hairDefinitions: ManifestHairDefinitions;
  defaultClothing: ManifestDefaultClothing;
  underwear: ManifestUnderwear;
  attachedWeapons: ManifestAttachedWeapons;
  /** Animal types from the Build 42 definitions, sorted by type name. */
  animals: AnimalDefinition[];
  /** Vehicle scripts by full name, with their templates applied. */
  vehicles: Map<string, VehicleScript>;
  /** The nodes of one animation state folder, for callers that pick clips. */
  stateNodes: (animSet: string, state: string) => { fileName: string; node: AnimNode }[];
  warnings: string[];
}

const SCRIPTS_PREFIX = 'media/scripts/';
const CLOTHING_PREFIX = 'media/clothing/clothingitems/';
const DEFINITIONS_PREFIX = 'media/lua/shared/definitions/';

function sourceRank(source: string, modOrder: readonly string[]): number {
  if (source === 'game') return -1;
  const index = modOrder.indexOf(source);
  return index < 0 ? modOrder.length : index;
}

/** Script files in the order the game loads them: game first, then mods, `template_` files first. */
export function orderedScriptFiles(
  files: ActiveFileMap,
  modOrder: readonly string[],
): { relPath: string; path: string; source: string }[] {
  return files
    .under(SCRIPTS_PREFIX)
    .filter(({ relPath }) => relPath.endsWith('.txt') && !relPath.includes('tempnotworking'))
    .map(({ relPath, file }) => ({ relPath, path: file.path, source: file.source }))
    .sort((a, b) => {
      const rank = sourceRank(a.source, modOrder) - sourceRank(b.source, modOrder);
      if (rank !== 0) return rank;
      const aTemplate = a.relPath.split('/').pop()?.startsWith('template_') ? 0 : 1;
      const bTemplate = b.relPath.split('/').pop()?.startsWith('template_') ? 0 : 1;
      if (aTemplate !== bTemplate) return aTemplate - bTemplate;
      return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;
    });
}

/** Per-key merge: entries of keys the later block sets replace the earlier ones. */
export function mergeItemBlock(existing: ScriptBlock, later: ScriptBlock): ScriptBlock {
  const replaced = new Set(later.entries.map((e) => e.key.toLowerCase()));
  const entries: ScriptEntry[] = existing.entries.filter((e) => !replaced.has(e.key.toLowerCase()));
  entries.push(...later.entries);
  const blocks = [
    ...existing.blocks.filter(
      (b) => !later.blocks.some((l) => l.type === b.type && l.name === b.name),
    ),
    ...later.blocks,
  ];
  return { ...existing, entries, blocks };
}

function vector(
  value: string | undefined,
  fallback: [number, number, number],
): [number, number, number] {
  if (value === undefined) return fallback;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

function number(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readModel(
  block: ScriptBlock,
  module: string,
  previous: ModelDefinition | undefined,
): ModelDefinition {
  const mesh = entryValue(block, 'mesh');
  const pipe = mesh === undefined ? -1 : mesh.indexOf('|');
  const meshFile = mesh === undefined ? undefined : pipe < 0 ? mesh : mesh.slice(0, pipe);
  const subMesh = mesh === undefined || pipe < 0 ? undefined : mesh.slice(pipe + 1).trim();
  const model: ModelDefinition = {
    fullName: `${module}.${block.name}`,
    module,
    name: block.name,
    mesh: meshFile === undefined ? undefined : normalizeModelPath(meshFile),
    subMesh: subMesh === undefined || subMesh.length === 0 ? undefined : subMesh,
    texture: entryValue(block, 'texture'),
    scale: number(entryValue(block, 'scale'), 1),
    static: (entryValue(block, 'static') ?? 'true').trim().toLowerCase() !== 'false',
    shader: entryValue(block, 'shader'),
    animationsMesh: entryValue(block, 'animationsMesh'),
    invertX: (entryValue(block, 'invertX') ?? '').trim().toLowerCase() === 'true',
    attachments: { ...previous?.attachments },
  };
  if ((entryValue(block, 'undoCoreScale') ?? '').trim().toLowerCase() === 'true') {
    model.scale *= 0.6666667;
  }
  for (const child of block.blocks) {
    if (child.type !== 'attachment') continue;
    const existing = model.attachments[child.name];
    model.attachments[child.name] = {
      bone: entryValue(child, 'bone') ?? existing?.bone,
      offset: vector(entryValue(child, 'offset'), existing?.offset ?? [0, 0, 0]),
      rotate: vector(entryValue(child, 'rotate'), existing?.rotate ?? [0, 0, 0]),
      scale: Math.max(number(entryValue(child, 'scale'), existing?.scale ?? 1), 0.01),
    };
  }
  return model;
}

/** Lowercases a mesh path from a model script and strips the extension and media prefix. */
export function normalizeModelPath(mesh: string): string {
  let key = mesh.trim().replace(/\\/g, '/').toLowerCase();
  key = key
    .replace(/^x:/, '')
    .replace(/^media\/models_x\//, '')
    .replace(/^media\/models\//, '');
  return key.replace(/\.(x|fbx|glb|gltf|txt)$/, '');
}

/**
 * Reads every script file into item, model, and vehicle definitions with the game's merge
 * rules. Vehicle templates are collected from every file before the vehicles are loaded.
 */
export function loadScripts(
  files: ActiveFileMap,
  modOrder: readonly string[],
  warnings: string[],
): {
  items: Map<string, ItemDefinition>;
  models: Map<string, ModelDefinition>;
  vehicles: Map<string, VehicleScript>;
} {
  const items = new Map<string, ItemDefinition>();
  const models = new Map<string, ModelDefinition>();
  const loader = new VehicleScriptLoader();
  const vehicleBlocks: { module: string; block: ScriptBlock; source: string }[] = [];
  for (const script of orderedScriptFiles(files, modOrder)) {
    let modules: ScriptBlock[];
    try {
      modules = parseScript(readFileSync(script.path, 'utf8'));
    } catch (error) {
      warnings.push(`${script.relPath}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const module of modules) {
      if (module.type !== 'module') continue;
      for (const block of module.blocks) {
        if (block.type === 'item') {
          const fullType = `${module.name}.${block.name}`;
          const existing = items.get(fullType);
          items.set(fullType, {
            fullType,
            module: module.name,
            name: block.name,
            block: existing ? mergeItemBlock(existing.block, block) : block,
            source: script.source,
          });
        } else if (block.type === 'model') {
          const fullName = `${module.name}.${block.name}`;
          models.set(fullName, readModel(block, module.name, models.get(fullName)));
        } else if (block.type === 'vehicle') {
          vehicleBlocks.push({ module: module.name, block, source: script.source });
        } else if (block.type === 'template' && /^vehicle\s/.test(block.name)) {
          loader.addTemplate(block);
        }
      }
    }
  }
  for (const { module, block, source } of vehicleBlocks) loader.addVehicle(module, block, source);
  for (const warning of loader.warnings) warnings.push(`vehicle scripts: ${warning}`);
  return { items, models, vehicles: loader.vehicles };
}

/** Resolves a model reference from an item (`Foo` or `Module.Foo`) the way the game does. */
export function resolveModel(
  models: ReadonlyMap<string, ModelDefinition>,
  reference: string,
  module: string,
): ModelDefinition | undefined {
  const name = reference.trim();
  if (name.includes('.')) return models.get(name);
  const own = models.get(`${module}.${name}`);
  if (own) return own;
  for (const model of models.values()) {
    if (model.name === name) return model;
  }
  return undefined;
}

/**
 * Reads every clothing item XML the file map has. Items referenced from scripts are what the
 * renderer needs; the rest still contribute their GUIDs, which outfits refer to.
 */
function loadClothingItems(
  files: ActiveFileMap,
  warnings: string[],
): { clothingItems: Map<string, ClothingItemXml>; byGuid: Map<string, string> } {
  const clothingItems = new Map<string, ClothingItemXml>();
  const byGuid = new Map<string, string>();
  for (const { relPath, file } of files.under(CLOTHING_PREFIX)) {
    if (!relPath.endsWith('.xml')) continue;
    const key = relPath.slice(CLOTHING_PREFIX.length, -'.xml'.length);
    if (key.includes('/')) continue;
    try {
      const parsed = parseClothingItemXml(readFileSync(file.path, 'utf8'));
      clothingItems.set(key, parsed);
      if (parsed.guid) byGuid.set(parsed.guid.toLowerCase(), key);
    } catch (error) {
      warnings.push(`${relPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { clothingItems, byGuid };
}

function readText(files: ActiveFileMap, relPath: string): string | undefined {
  const file = files.get(relPath);
  return file ? readFileSync(file.path, 'utf8') : undefined;
}

function loadDecals(
  files: ActiveFileMap,
  warnings: string[],
): { decals: Record<string, DecalXml>; decalGroups: Record<string, string[]> } {
  const groupsXml = readText(files, 'media/clothing/clothingDecals.xml');
  const decalGroups = groupsXml ? parseDecalGroupsXml(groupsXml) : {};
  const decals: Record<string, DecalXml> = {};
  for (const { relPath, file } of files.under('media/clothing/clothingdecals/')) {
    if (!relPath.endsWith('.xml')) continue;
    const name = relPath.slice('media/clothing/clothingdecals/'.length, -'.xml'.length);
    try {
      decals[name] = parseDecalXml(readFileSync(file.path, 'utf8'));
    } catch (error) {
      warnings.push(`${relPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { decals, decalGroups };
}

/** The nodes of one animation state folder, in file order. */
function loadStateNodes(
  files: ActiveFileMap,
  animSet: string,
  state: string,
  warnings: string[],
): { fileName: string; node: AnimNode }[] {
  const prefix = `media/animsets/${animSet}/${state}/`;
  const out: { fileName: string; node: AnimNode }[] = [];
  for (const { relPath, file } of files.under(prefix)) {
    if (!relPath.endsWith('.xml') || relPath.slice(prefix.length).includes('/')) continue;
    try {
      const node = parseAnimNode(readFileSync(file.path, 'utf8'));
      if (node) out.push({ fileName: relPath.slice(prefix.length, -'.xml'.length), node });
    } catch (error) {
      warnings.push(`${relPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return out.sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
}

function loadIdleTable(files: ActiveFileMap, warnings: string[]): IdleClipTable {
  return buildIdleClipTable(loadStateNodes(files, 'player', 'idle', warnings).map((n) => n.node));
}

function loadStances(files: ActiveFileMap, warnings: string[]): StanceTable {
  const table: StanceTable = { player: {}, zombie: {} };
  for (const subject of ['player', 'zombie'] as const) {
    const sources = STANCE_SOURCES[subject];
    for (const stance of Object.keys(sources) as Stance[]) {
      const source = sources[stance];
      if (source === undefined) continue;
      const nodes = loadStateNodes(files, source.animSet, source.state, warnings);
      const node = pickStanceNode(nodes, source);
      if (node?.animName === undefined) {
        warnings.push(
          `no clip for the ${subject} stance "${stance}" in AnimSets/${source.animSet}/${source.state}`,
        );
        continue;
      }
      table[subject][stance] = clipOf(node, node.animName);
    }
  }
  return table;
}

function toOutfitItems(
  items: readonly OutfitItemXml[],
  byGuid: ReadonlyMap<string, string>,
  modId: string | undefined,
): ManifestOutfitItem[] {
  return items.map((item) => {
    const guid = item.guid.toLowerCase();
    const bare =
      modId !== undefined && guid.startsWith(`${modId.toLowerCase()}-`)
        ? guid.slice(modId.length + 1)
        : guid;
    const clothingItem = byGuid.get(bare) ?? byGuid.get(guid);
    return {
      ...(clothingItem !== undefined ? { clothingItem } : {}),
      probability: item.probability,
      subItems: toOutfitItems(item.subItems, byGuid, modId),
    };
  });
}

/**
 * Reads the game's `clothing.xml` and then every mod's, later files adding or replacing outfits
 * by name the way `OutfitManager` merges them.
 */
function loadOutfits(
  files: ActiveFileMap,
  byGuid: ReadonlyMap<string, string>,
  warnings: string[],
): GameCatalog['outfits'] {
  const outfits: GameCatalog['outfits'] = { male: {}, female: {} };
  const file = files.get('media/clothing/clothing.xml');
  if (!file) {
    warnings.push('clothing.xml not found; outfits by name will not be available');
    return outfits;
  }
  try {
    const parsed = parseOutfitsXml(readFileSync(file.path, 'utf8'));
    const modId = file.source === 'game' ? undefined : file.source;
    for (const sex of ['male', 'female'] as const) {
      for (const outfit of parsed[sex]) {
        outfits[sex][outfit.name] = {
          name: outfit.name,
          top: outfit.top,
          pants: outfit.pants,
          allowPantsHue: outfit.allowPantsHue,
          allowPantsTint: outfit.allowPantsTint,
          allowTopTint: outfit.allowTopTint,
          allowTshirtDecal: outfit.allowTshirtDecal,
          items: toOutfitItems(outfit.items, byGuid, modId),
          ...(modId !== undefined ? { modId } : {}),
        };
      }
    }
  } catch (error) {
    warnings.push(`clothing.xml: ${error instanceof Error ? error.message : String(error)}`);
  }
  return outfits;
}

function loadDefinitions(
  files: ActiveFileMap,
  warnings: string[],
): Pick<GameCatalog, 'hairDefinitions' | 'defaultClothing' | 'underwear' | 'attachedWeapons'> {
  const empty = {
    hairDefinitions: { restricted: [], byOutfit: [], colors: [] },
    defaultClothing: {
      pants: { hue: [], texture: [], tint: [] },
      tShirt: { texture: [], tint: [] },
      tShirtDecal: { texture: [], tint: [] },
      vest: { texture: [], tint: [] },
    },
    underwear: { baseChance: 50, definitions: [] },
    attachedWeapons: { definitions: [], byOutfit: [] },
  };
  const sources: string[] = [];
  const names = [
    'DefaultClothing.lua',
    'HairOutfitDefinitions.lua',
    'UnderwearDefinition.lua',
    'AttachedWeaponDefinitions.lua',
  ];
  for (const name of names) {
    const text = readText(files, `${DEFINITIONS_PREFIX}${name}`);
    if (text === undefined) warnings.push(`${name} not found under media/lua/shared/Definitions`);
    else sources.push(text);
  }
  const creation = readText(files, 'media/lua/shared/NPCs/MainCreationMethods.lua');
  if (creation === undefined) warnings.push('MainCreationMethods.lua not found; no hair colours');
  else sources.push(hairColorCalls(creation));
  try {
    const globals = evaluateLua(sources, [
      'DefaultClothing',
      'HairOutfitDefinitions',
      'UnderwearDefinition',
      'AttachedWeaponDefinitions',
      'SurvivorDesc',
    ]);
    const survivorDesc = globals.get('SurvivorDesc');
    const hairColors = survivorDesc instanceof Map ? survivorDesc.get('hairColors') : undefined;
    return {
      hairDefinitions: readHairDefinitions(globals.get('HairOutfitDefinitions'), hairColors),
      defaultClothing: readDefaultClothing(globals.get('DefaultClothing')),
      underwear: readUnderwear(globals.get('UnderwearDefinition')),
      attachedWeapons: readAttachedWeapons(globals.get('AttachedWeaponDefinitions')),
    };
  } catch (error) {
    warnings.push(`Lua definitions: ${error instanceof Error ? error.message : String(error)}`);
    return empty;
  }
}

const ANIMAL_DEFINITIONS_PREFIX = 'media/lua/shared/definitions/animal/';

/** Runs the animal definition files, in name order, and reads the types they declare. */
function loadAnimals(files: ActiveFileMap, warnings: string[]): AnimalDefinition[] {
  const sources = files
    .under(ANIMAL_DEFINITIONS_PREFIX)
    .filter(
      ({ relPath }) => relPath.endsWith('definitions.lua') || relPath.endsWith('definition.lua'),
    )
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
    .map(({ file }) => readFileSync(file.path, 'utf8'));
  if (sources.length === 0) return [];
  try {
    const errors: string[] = [];
    const animals = readAnimalDefinitions(sources, errors);
    for (const error of errors) warnings.push(`animal definitions: ${error}`);
    return animals;
  } catch (error) {
    warnings.push(`animal definitions: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/** Reads everything the build needs from the active file map. */
export function loadCatalog(files: ActiveFileMap, modOrder: readonly string[]): GameCatalog {
  const warnings: string[] = [];
  const { items, models, vehicles } = loadScripts(files, modOrder, warnings);
  const { clothingItems, byGuid } = loadClothingItems(files, warnings);
  for (const item of items.values()) {
    const name = entryValue(item.block, 'ClothingItem')?.trim();
    if (name && !clothingItems.has(name.toLowerCase())) {
      warnings.push(`clothing item "${name}" has no XML file`);
    }
  }

  const hairXml = readText(files, 'media/hairStyles/hairStyles.xml');
  const beardXml = readText(files, 'media/hairStyles/beardStyles.xml');
  const bodyLua = readText(files, 'media/lua/shared/NPCs/BodyLocations.lua');
  const attachedLua = readText(files, 'media/lua/shared/NPCs/AttachedLocations.lua');
  if (!hairXml) warnings.push('hairStyles.xml not found');
  if (!bodyLua) warnings.push('BodyLocations.lua not found');
  const { decals, decalGroups } = loadDecals(files, warnings);

  return {
    decals,
    decalGroups,
    items,
    models,
    clothingItems,
    clothingItemsByGuid: byGuid,
    hair: hairXml ? parseHairStylesXml(hairXml) : { male: [], female: [] },
    beards: beardXml ? parseBeardStylesXml(beardXml) : [],
    bodyLocations: bodyLua
      ? parseBodyLocationsLua(bodyLua)
      : { order: [], exclusive: [], hides: [], alt: [], multiItem: [] },
    attachedLocations: attachedLua ? parseAttachedLocationsLua(attachedLua) : {},
    idle: loadIdleTable(files, warnings),
    stances: loadStances(files, warnings),
    outfits: loadOutfits(files, byGuid, warnings),
    ...loadDefinitions(files, warnings),
    animals: loadAnimals(files, warnings),
    vehicles,
    stateNodes: (animSet, state) => loadStateNodes(files, animSet, state, warnings),
    warnings,
  };
}
