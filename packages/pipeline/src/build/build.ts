import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  BODY_PARTS,
  MANIFEST_FORMAT,
  MANIFEST_VERSION,
  type BodyPart,
  type CharacterCatalog,
  type ManifestIndex,
  type Sex,
} from 'zomboid-models/format';

import type { PipelineConfig } from '../config.js';
import { convertAnimationFile } from '../convert/animationToGltf.js';
import { convertFbxFile } from '../convert/fbxToGltf.js';
import { convertMeshFile } from '../convert/meshToGltf.js';
import { convertTextMeshFile } from '../convert/textMeshToGltf.js';
import { entryValue } from '../game/scripts.js';
import { loadCatalog, type GameCatalog } from '../game/catalog.js';
import { availableLanguages, readTranslations } from '../game/translations.js';
import { buildActiveFileMap, type ActiveFileMap } from '../game/fileMap.js';
import {
  discoverMods,
  isModAvailable,
  readServerIniMods,
  resolveLoadOrder,
  type DiscoveredMod,
} from '../game/mods.js';
import {
  formatGameVersion,
  parseGameVersion,
  readInstalledGameVersion,
  type GameVersion,
} from '../game/version.js';
import { parseX } from '../x/parser.js';
import { assembleAnimalCatalog, planAnimalAssets, type AnimalPlan } from './animals.js';
import { assembleItemCatalog, planItemAssets, type ItemPlan } from './items.js';
import { assembleNames, type NameKeys } from './names.js';
import { assembleVehicleCatalog, planVehicleAssets, type VehiclePlan } from './vehicles.js';
import {
  BANDAGE_ITEMS,
  BODY_MODELS,
  planAssets,
  SHADOW_TEXTURE,
  SKELETON_MODELS,
  SKELETON_TEXTURES,
  SKIN_TEXTURES,
  WEAPON_BLOOD_TEXTURES,
  zombieSkinTextures,
  type AssetPlan,
} from './select.js';

export interface BuildLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface BuildReport {
  gameVersion: string;
  mods: string[];
  models: number;
  textures: number;
  animations: number;
  wearables: number;
  heldItems: number;
  outfits: number;
  animals: number;
  items: number;
  vehicles: number;
  /** Languages that got a name file. */
  languages: string[];
  warnings: string[];
  seconds: number;
  outDir: string;
}

/** Blood mask file names per body part, in the game's naming. */
const BLOOD_MASK_NAMES: Record<BodyPart, string> = {
  Hand_L: 'handl',
  Hand_R: 'handr',
  ForeArm_L: 'larml',
  ForeArm_R: 'larmr',
  UpperArm_L: 'uarml',
  UpperArm_R: 'uarmr',
  Torso_Upper: 'chest',
  Torso_Lower: 'stomach',
  Head: 'head',
  Neck: 'neck',
  Groin: 'groin',
  UpperLeg_L: 'ulegl',
  UpperLeg_R: 'ulegr',
  LowerLeg_L: 'llegl',
  LowerLeg_R: 'llegr',
  Foot_L: 'footl',
  Foot_R: 'footr',
  Back: 'back',
};

const MODEL_EXTENSIONS = ['.x', '.fbx', '.glb'];

/** Textures that do not live under `media/textures`, by key. */
const TEXTURE_PATHS: Record<string, string> = {
  vehicleshadow: 'media/vehicleShadow.png',
};
const ANIMS_PREFIX = 'media/anims_x/';

function hashOf(data: Uint8Array | string): string {
  return createHash('sha1').update(data).digest('hex').slice(0, 10);
}

function slug(key: string): string {
  return key.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
}

/** Resolves the version to build for: configuration first, then the user's `version.txt`. */
export function resolveGameVersion(config: PipelineConfig): GameVersion {
  if (config.gameVersion !== undefined) {
    const parsed = parseGameVersion(config.gameVersion);
    if (!parsed) throw new Error(`"${config.gameVersion}" is not a valid game version`);
    return parsed;
  }
  const installed = readInstalledGameVersion();
  if (!installed) {
    throw new Error(
      'no gameVersion in the configuration and no Zomboid/version.txt to read it from',
    );
  }
  return installed;
}

/** Discovers and orders the enabled mods according to the configuration. */
export function resolveMods(
  config: PipelineConfig,
  version: GameVersion,
  warnings: string[],
): DiscoveredMod[] {
  const discovered = discoverMods(config.modDirs, version);
  let enabled: string[] | undefined = config.mods;
  if (enabled === undefined && config.serverIni !== undefined) {
    enabled = readServerIniMods(readFileSync(config.serverIni, 'utf8'));
  }
  const order = resolveLoadOrder(discovered, enabled);
  for (const id of order.missing) warnings.push(`mod "${id}" was not found in the mod folders`);
  return order.mods.filter((mod) => {
    if (isModAvailable(mod, version)) return true;
    warnings.push(
      `mod "${mod.id}" does not support game version ${formatGameVersion(version)}; skipped`,
    );
    return false;
  });
}

interface Writer {
  models: Map<string, CharacterCatalog['models'][string]>;
  textures: Map<string, string>;
  animations: Map<string, CharacterCatalog['animations'][string]>;
}

function findModelFile(
  files: ActiveFileMap,
  key: string,
): { path: string; extension: string } | undefined {
  for (const extension of MODEL_EXTENSIONS) {
    const file = files.get(`media/models_x/${key}${extension}`);
    if (file) return { path: file.path, extension };
  }
  // The game's text meshes (the vehicle wheels) live under `media/models`.
  const text = files.get(`media/models/${key}.txt`);
  if (text) return { path: text.path, extension: '.txt' };
  return undefined;
}

function convertModels(
  keys: ReadonlySet<string>,
  files: ActiveFileMap,
  outDir: string,
  writer: Writer,
  warnings: string[],
): void {
  mkdirSync(join(outDir, 'models'), { recursive: true });
  for (const key of [...keys].sort()) {
    const source = findModelFile(files, key);
    if (!source) {
      warnings.push(`model "${key}" has no file under media/models_X`);
      continue;
    }
    if (source.extension === '.glb') {
      warnings.push(`model "${key}" is already glTF; copying is not supported yet`);
      continue;
    }
    try {
      const result =
        source.extension === '.fbx'
          ? convertFbxFile(readFileSync(source.path))
          : source.extension === '.txt'
            ? convertTextMeshFile(readFileSync(source.path, 'utf8'))
            : convertMeshFile(parseX(readFileSync(source.path, 'utf8')));
      for (const warning of result.warnings) warnings.push(`model "${key}": ${warning}`);
      if (result.meshes.length === 0) continue;
      const file = `models/${slug(key)}-${hashOf(result.glb)}.glb`;
      writeFileSync(join(outDir, file), result.glb);
      writer.models.set(key, {
        file,
        skinned: result.meshes.some((m) => m.skinned),
        meshes: result.meshes.map((m) => m.name),
      });
    } catch (error) {
      warnings.push(`model "${key}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function copyTextures(
  keys: ReadonlySet<string>,
  files: ActiveFileMap,
  outDir: string,
  writer: Writer,
  warnings: string[],
): void {
  mkdirSync(join(outDir, 'textures'), { recursive: true });
  for (const key of [...keys].sort()) {
    const source = files.get(TEXTURE_PATHS[key] ?? `media/textures/${key}.png`);
    if (!source) {
      warnings.push(`texture "${key}" has no file under media/textures`);
      continue;
    }
    const data = readFileSync(source.path);
    const file = `textures/${slug(key)}-${hashOf(data)}.png`;
    copyFileSync(source.path, join(outDir, file));
    writer.textures.set(key, file);
  }
}

/** Clip file paths by lowercased clip name, across every folder under `anims_X`. */
function indexAnimationFiles(files: ActiveFileMap): Map<string, string> {
  const index = new Map<string, string>();
  for (const { relPath, file } of files.under(ANIMS_PREFIX)) {
    if (!relPath.endsWith('.x')) continue;
    const name = relPath.slice(relPath.lastIndexOf('/') + 1, -'.x'.length);
    if (!index.has(name)) index.set(name, file.path);
  }
  return index;
}

function convertAnimations(
  clips: ReadonlySet<string>,
  files: ActiveFileMap,
  outDir: string,
  writer: Writer,
  warnings: string[],
): void {
  mkdirSync(join(outDir, 'anims'), { recursive: true });
  const index = indexAnimationFiles(files);
  for (const clip of [...clips].sort()) {
    const path = index.get(clip.toLowerCase());
    if (!path) {
      warnings.push(`animation "${clip}" has no file under media/anims_X`);
      continue;
    }
    try {
      const result = convertAnimationFile(parseX(readFileSync(path, 'utf8')), {
        clipName: () => clip,
      });
      for (const warning of result.warnings) warnings.push(`animation "${clip}": ${warning}`);
      const converted = result.clips[0];
      if (!converted || converted.tracks === 0) continue;
      const file = `anims/${slug(clip)}-${hashOf(result.glb)}.glb`;
      writeFileSync(join(outDir, file), result.glb);
      writer.animations.set(clip, { file, duration: converted.duration });
    } catch (error) {
      warnings.push(
        `animation "${clip}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function bodyEntry(
  writer: Writer,
  model: string,
  skins: readonly string[],
  bodyHair: boolean,
): CharacterCatalog['bodies'][Sex] {
  return {
    model,
    skins: skins.filter((key) => writer.textures.has(key)),
    bodyHair,
  };
}

/** The converted entries of one plan's keys, sorted, skipping what failed to convert. */
function pickConverted<T>(map: ReadonlyMap<string, T>, keys: Iterable<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of [...keys].sort()) {
    const value = map.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function assembleCharacterCatalog(
  catalog: GameCatalog,
  plan: AssetPlan,
  writer: Writer,
): CharacterCatalog {
  const bodyLocations: CharacterCatalog['bodyLocations'] = {};
  catalog.bodyLocations.order.forEach((id, order) => {
    bodyLocations[id] = {
      order,
      exclusive: catalog.bodyLocations.exclusive
        .filter(([a, b]) => a === id || b === id)
        .map(([a, b]) => (a === id ? b : a)),
      hides: catalog.bodyLocations.hides.filter(([a]) => a === id).map(([, b]) => b),
      multiItem: catalog.bodyLocations.multiItem.includes(id),
    };
  });

  const hair: CharacterCatalog['hair'] = { male: {}, female: {} };
  const hairOrder: CharacterCatalog['hairOrder'] = { male: [], female: [] };
  for (const sex of ['male', 'female'] as const) {
    for (const style of catalog.hair[sex]) {
      hair[sex][style.name] = {
        ...(style.model ? { model: style.model } : {}),
        texture: style.texture,
        alternates: style.alternates,
        ...(style.noChoose ? { noChoose: true } : {}),
      };
      hairOrder[sex].push(style.name);
    }
  }
  // The game inserts an empty beard style at the head of its list.
  const beards: CharacterCatalog['beards'] = { '': { texture: 'f_hair_white' } };
  const beardOrder = [''];
  for (const style of catalog.beards) {
    beards[style.name] = { ...(style.model ? { model: style.model } : {}), texture: style.texture };
    beardOrder.push(style.name);
  }

  const bloodMasks: CharacterCatalog['bloodMasks'] = {};
  for (const part of BODY_PARTS) {
    const key = `bloodtextures/bloodmask${BLOOD_MASK_NAMES[part]}`;
    if (writer.textures.has(key)) bloodMasks[part] = key;
  }

  const zombieSkins: CharacterCatalog['zombieSkins'] = {
    male: zombieSkinTextures('male').map((stage) =>
      stage.filter((key) => writer.textures.has(key)),
    ),
    female: zombieSkinTextures('female').map((stage) =>
      stage.filter((key) => writer.textures.has(key)),
    ),
  };
  const skeletons: CharacterCatalog['skeletons'] = {
    male: bodyEntry(writer, SKELETON_MODELS.male, SKELETON_TEXTURES, false),
    female: bodyEntry(writer, SKELETON_MODELS.female, SKELETON_TEXTURES, false),
  };

  const bandageItems: CharacterCatalog['bandageItems'] = {};
  for (const part of BODY_PARTS) {
    if (plan.wearables[BANDAGE_ITEMS[part]]) bandageItems[part] = BANDAGE_ITEMS[part];
  }

  return {
    bodies: {
      male: bodyEntry(
        writer,
        BODY_MODELS.male,
        SKIN_TEXTURES.male,
        writer.textures.has('body/malebody01a'),
      ),
      female: bodyEntry(writer, BODY_MODELS.female, SKIN_TEXTURES.female, false),
    },
    ...(writer.models.has(SKELETON_MODELS.male) ? { skeletons } : {}),
    zombieSkins,
    bodyAttachments: plan.bodyAttachments,
    models: pickConverted(writer.models, plan.models),
    textures: pickConverted(writer.textures, plan.textures),
    animations: pickConverted(writer.animations, plan.animations),
    idle: catalog.idle,
    stances: catalog.stances,
    ...(catalog.vehicleIdle && writer.animations.has(catalog.vehicleIdle.clip)
      ? { vehicleIdle: catalog.vehicleIdle }
      : {}),
    ...(writer.textures.has(SHADOW_TEXTURE) ? { shadowTexture: SHADOW_TEXTURE } : {}),
    ...(writer.textures.has(WEAPON_BLOOD_TEXTURES.overlay) &&
    writer.textures.has(WEAPON_BLOOD_TEXTURES.mask)
      ? { weaponBlood: { ...WEAPON_BLOOD_TEXTURES } }
      : {}),
    clothingItems: plan.clothingItems,
    wearables: plan.wearables,
    clothingItemToItem: plan.clothingItemToItem,
    heldItems: plan.heldItems,
    bodyLocations,
    attachedLocations: catalog.attachedLocations,
    hair,
    hairOrder,
    beards,
    beardOrder,
    bloodMasks,
    decals: Object.fromEntries(
      Object.entries(catalog.decals).filter(([, decal]) => writer.textures.has(decal.texture)),
    ),
    decalGroups: catalog.decalGroups,
    outfits: catalog.outfits,
    hairDefinitions: catalog.hairDefinitions,
    defaultClothing: catalog.defaultClothing,
    underwear: catalog.underwear,
    attachedWeapons: catalog.attachedWeapons,
    zombieDamageItems: plan.zombieDamageItems,
    bandageItems,
  };
}

/** The keys the built catalogs reference, for the name files. */
function nameKeys(
  catalog: GameCatalog,
  plans: {
    characters: AssetPlan | undefined;
    animals: AnimalPlan | undefined;
    items: ItemPlan | undefined;
    vehicles: VehiclePlan | undefined;
  },
): NameKeys {
  const items = new Map<string, string | undefined>();
  const itemName = (fullType: string): void => {
    const definition = catalog.items.get(fullType);
    items.set(
      fullType,
      definition ? entryValue(definition.block, 'DisplayName')?.trim() : undefined,
    );
  };
  for (const key of Object.keys(plans.characters?.wearables ?? {})) itemName(key);
  for (const key of Object.keys(plans.characters?.heldItems ?? {})) itemName(key);
  for (const key of Object.keys(plans.items?.items ?? {})) itemName(key);
  const vehicles = new Map<string, string | undefined>();
  for (const key of Object.keys(plans.vehicles?.vehicles ?? {})) {
    vehicles.set(key, catalog.vehicles.get(key)?.carModelName);
  }
  const breeds = new Set<string>();
  for (const animal of Object.values(plans.animals?.animals ?? {})) {
    for (const breed of animal.breedOrder) breeds.add(breed);
  }
  return {
    items,
    vehicles,
    hair: plans.characters
      ? [...catalog.hair.male.map((s) => s.name), ...catalog.hair.female.map((s) => s.name)]
      : [],
    beards: plans.characters ? catalog.beards.map((s) => s.name) : [],
    animals: Object.keys(plans.animals?.animals ?? {}),
    breeds,
    bodyLocations: plans.characters ? catalog.bodyLocations.order : [],
  };
}

/** Writes one name file per configured language and returns their paths by language. */
function writeNames(
  config: PipelineConfig,
  files: ActiveFileMap,
  catalog: GameCatalog,
  plans: Parameters<typeof nameKeys>[1],
  warnings: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (config.languages.length === 0) return out;
  const keys = nameKeys(catalog, plans);
  const english = readTranslations(files, 'EN', warnings);
  if (!english) warnings.push('no English translation files under media/lua/shared/Translate/EN');
  for (const entry of readdirSync(config.outDir)) {
    if (/^catalog-names-[a-z_]+-[0-9a-f]+.json$/.test(entry)) rmSync(join(config.outDir, entry));
  }
  for (const language of config.languages) {
    const translations = language === 'EN' ? english : readTranslations(files, language, warnings);
    if (!translations) {
      warnings.push(
        `no translation files for ${language}; available: ${availableLanguages(files).join(', ')}`,
      );
    }
    const names = JSON.stringify(assembleNames(language, translations, english, keys));
    const file = `catalog-names-${language.toLowerCase()}-${hashOf(names)}.json`;
    writeFileSync(join(config.outDir, file), names);
    out[language] = file;
  }
  return out;
}

/** Runs a complete build: mods, catalog, conversion, the catalogs, and the manifest index. */
export function runBuild(config: PipelineConfig, log: BuildLogger): BuildReport {
  const started = performance.now();
  const warnings: string[] = [];

  const version = resolveGameVersion(config);
  log.info(`game version ${formatGameVersion(version)}`);
  const mods = resolveMods(config, version, warnings);
  log.info(
    `${mods.length} mods enabled${mods.length > 0 ? `: ${mods.map((m) => m.id).join(', ')}` : ''}`,
  );

  const files = buildActiveFileMap(config.gameDir, mods);
  log.info(`${files.size} files in the game and mod folders`);
  const catalog = loadCatalog(
    files,
    mods.map((m) => m.id),
  );
  warnings.push(...catalog.warnings);
  const buildCharacters = config.subjects.includes('characters');
  const buildAnimals = config.subjects.includes('animals');
  const plan = planAssets(catalog, files, config.animations);
  if (buildCharacters) warnings.push(...plan.warnings);
  let animalPlan: AnimalPlan | undefined;
  if (buildAnimals) {
    animalPlan = planAnimalAssets(catalog, catalog.animals, files, catalog.stateNodes);
    warnings.push(...animalPlan.warnings);
    log.info(`${Object.keys(animalPlan.animals).length} animal types`);
  }
  let itemPlan: ItemPlan | undefined;
  if (config.subjects.includes('items')) {
    itemPlan = planItemAssets(catalog);
    warnings.push(...itemPlan.warnings);
    log.info(`${Object.keys(itemPlan.items).length} items with models`);
  }
  let vehiclePlan: VehiclePlan | undefined;
  if (config.subjects.includes('vehicles')) {
    vehiclePlan = planVehicleAssets(catalog);
    warnings.push(...vehiclePlan.warnings);
    log.info(`${Object.keys(vehiclePlan.vehicles).length} vehicles`);
  }
  const models = new Set<string>([
    ...(buildCharacters ? plan.models : []),
    ...(animalPlan?.models ?? []),
    ...(itemPlan?.models ?? []),
    ...(vehiclePlan?.models ?? []),
  ]);
  const textures = new Set<string>([
    ...(buildCharacters ? plan.textures : []),
    ...(animalPlan?.textures ?? []),
    ...(itemPlan?.textures ?? []),
    ...(vehiclePlan?.textures ?? []),
  ]);
  const animations = new Set<string>([
    ...(buildCharacters ? plan.animations : []),
    ...(animalPlan?.animations ?? []),
  ]);
  log.info(
    `${models.size} models, ${textures.size} textures, ${animations.size} animations to convert`,
  );

  mkdirSync(config.outDir, { recursive: true });
  const writer: Writer = { models: new Map(), textures: new Map(), animations: new Map() };
  convertModels(models, files, config.outDir, writer, warnings);
  log.info(`${writer.models.size} models converted`);
  copyTextures(textures, files, config.outDir, writer, warnings);
  log.info(`${writer.textures.size} textures copied`);
  convertAnimations(animations, files, config.outDir, writer, warnings);
  log.info(`${writer.animations.size} animations converted`);

  const index: ManifestIndex = {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    gameVersion: formatGameVersion(version),
    generatedAt: new Date().toISOString(),
    mods: mods.map((mod) => mod.id),
    catalogs: {},
  };
  // Catalog names carry a content hash; stale ones from earlier builds would only confuse.
  for (const entry of readdirSync(config.outDir)) {
    if (/^catalog-[a-z]+-[0-9a-f]+.json$/.test(entry)) rmSync(join(config.outDir, entry));
  }
  const outfits = catalog.outfits;
  if (buildCharacters) {
    const characters = JSON.stringify(assembleCharacterCatalog(catalog, plan, writer));
    const file = `catalog-characters-${hashOf(characters)}.json`;
    writeFileSync(join(config.outDir, file), characters);
    index.catalogs.characters = file;
  }
  if (animalPlan) {
    const animals = JSON.stringify(
      assembleAnimalCatalog(animalPlan, writer.models, writer.textures, writer.animations),
    );
    const file = `catalog-animals-${hashOf(animals)}.json`;
    writeFileSync(join(config.outDir, file), animals);
    index.catalogs.animals = file;
  }
  if (itemPlan) {
    const items = JSON.stringify(assembleItemCatalog(itemPlan, writer.models, writer.textures));
    const file = `catalog-items-${hashOf(items)}.json`;
    writeFileSync(join(config.outDir, file), items);
    index.catalogs.items = file;
  }
  if (vehiclePlan) {
    const vehicles = JSON.stringify(
      assembleVehicleCatalog(vehiclePlan, writer.models, writer.textures),
    );
    const file = `catalog-vehicles-${hashOf(vehicles)}.json`;
    writeFileSync(join(config.outDir, file), vehicles);
    index.catalogs.vehicles = file;
  }
  const languages = writeNames(
    config,
    files,
    catalog,
    {
      characters: buildCharacters ? plan : undefined,
      animals: animalPlan,
      items: itemPlan,
      vehicles: vehiclePlan,
    },
    warnings,
  );
  if (Object.keys(languages).length > 0) index.names = languages;
  writeFileSync(join(config.outDir, 'manifest.json'), JSON.stringify(index));
  for (const warning of warnings) log.warn(warning);

  return {
    gameVersion: index.gameVersion,
    mods: index.mods,
    models: writer.models.size,
    textures: writer.textures.size,
    animations: writer.animations.size,
    wearables: Object.keys(plan.wearables).length,
    heldItems: Object.keys(plan.heldItems).length,
    outfits: Object.keys(outfits.male).length + Object.keys(outfits.female).length,
    animals: animalPlan ? Object.keys(animalPlan.animals).length : 0,
    items: itemPlan ? Object.keys(itemPlan.items).length : 0,
    vehicles: vehiclePlan ? Object.keys(vehiclePlan.vehicles).length : 0,
    languages: Object.keys(languages),
    warnings,
    seconds: (performance.now() - started) / 1000,
    outDir: config.outDir,
  };
}
