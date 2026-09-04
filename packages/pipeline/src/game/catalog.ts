import { readFileSync } from 'node:fs';

import { buildIdleClipTable, parseAnimNode, type IdleClipTable } from './animSets.js';
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
import { entryValue, parseScript, type ScriptBlock, type ScriptEntry } from './scripts.js';

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
  /** Model key: lowercased mesh path under `models_X` without extension. */
  mesh: string | undefined;
  texture: string | undefined;
  scale: number;
  static: boolean;
  shader: string | undefined;
  animationsMesh: string | undefined;
  attachments: Record<string, ModelAttachment>;
}

export interface GameCatalog {
  items: Map<string, ItemDefinition>;
  models: Map<string, ModelDefinition>;
  /** Clothing item definitions keyed by lowercased name. */
  clothingItems: Map<string, ClothingItemXml>;
  hair: HairStylesXml;
  beards: BeardStyleXml[];
  bodyLocations: BodyLocationsData;
  attachedLocations: Record<string, string>;
  idle: IdleClipTable;
  decals: Record<string, DecalXml>;
  decalGroups: Record<string, string[]>;
  warnings: string[];
}

const SCRIPTS_PREFIX = 'media/scripts/';
const CLOTHING_PREFIX = 'media/clothing/clothingitems/';

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
  const model: ModelDefinition = {
    fullName: `${module}.${block.name}`,
    module,
    name: block.name,
    mesh: mesh === undefined ? undefined : normalizeModelPath(mesh),
    texture: entryValue(block, 'texture'),
    scale: number(entryValue(block, 'scale'), 1),
    static: (entryValue(block, 'static') ?? 'true').trim().toLowerCase() !== 'false',
    shader: entryValue(block, 'shader'),
    animationsMesh: entryValue(block, 'animationsMesh'),
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

/** Reads every script file into item and model definitions with the game's merge rules. */
export function loadScripts(
  files: ActiveFileMap,
  modOrder: readonly string[],
  warnings: string[],
): { items: Map<string, ItemDefinition>; models: Map<string, ModelDefinition> } {
  const items = new Map<string, ItemDefinition>();
  const models = new Map<string, ModelDefinition>();
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
        }
      }
    }
  }
  return { items, models };
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

function loadClothingItems(
  files: ActiveFileMap,
  items: ReadonlyMap<string, ItemDefinition>,
  warnings: string[],
): Map<string, ClothingItemXml> {
  const clothing = new Map<string, ClothingItemXml>();
  const names = new Set<string>();
  for (const item of items.values()) {
    const name = entryValue(item.block, 'ClothingItem');
    if (name !== undefined && name.trim().length > 0) names.add(name.trim());
  }
  for (const name of names) {
    const key = name.toLowerCase();
    const file = files.get(`${CLOTHING_PREFIX}${key}.xml`);
    if (!file) {
      warnings.push(`clothing item "${name}" has no XML file`);
      continue;
    }
    try {
      clothing.set(key, parseClothingItemXml(readFileSync(file.path, 'utf8')));
    } catch (error) {
      warnings.push(`${name}.xml: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return clothing;
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

function loadIdleTable(files: ActiveFileMap): IdleClipTable {
  const nodes = files
    .under('media/animsets/player/idle/')
    .filter(({ relPath }) => relPath.endsWith('.xml'))
    .map(({ file }) => parseAnimNode(readFileSync(file.path, 'utf8')))
    .filter((node): node is NonNullable<typeof node> => node !== undefined);
  return buildIdleClipTable(nodes);
}

/** Reads everything the build needs from the active file map. */
export function loadCatalog(files: ActiveFileMap, modOrder: readonly string[]): GameCatalog {
  const warnings: string[] = [];
  const { items, models } = loadScripts(files, modOrder, warnings);
  const clothingItems = loadClothingItems(files, items, warnings);

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
    hair: hairXml ? parseHairStylesXml(hairXml) : { male: [], female: [] },
    beards: beardXml ? parseBeardStylesXml(beardXml) : [],
    bodyLocations: bodyLua
      ? parseBodyLocationsLua(bodyLua)
      : { order: [], exclusive: [], hides: [], alt: [], multiItem: [] },
    attachedLocations: attachedLua ? parseAttachedLocationsLua(attachedLua) : {},
    idle: loadIdleTable(files),
    warnings,
  };
}
