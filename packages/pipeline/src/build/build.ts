import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  BODY_PARTS,
  MANIFEST_FORMAT,
  MANIFEST_VERSION,
  type BodyPart,
  type Manifest,
} from 'zomboid-models/format';

import type { PipelineConfig } from '../config.js';
import { convertAnimationFile } from '../convert/animationToGltf.js';
import { convertMeshFile } from '../convert/meshToGltf.js';
import { loadCatalog, type GameCatalog } from '../game/catalog.js';
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
import { BODY_MODELS, planAssets, SKIN_TEXTURES, type AssetPlan } from './select.js';

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

function hashOf(data: Uint8Array): string {
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
  models: Map<string, Manifest['models'][string]>;
  textures: Map<string, string>;
  animations: Map<string, Manifest['animations'][string]>;
}

function findModelFile(
  files: ActiveFileMap,
  key: string,
): { path: string; extension: string } | undefined {
  for (const extension of MODEL_EXTENSIONS) {
    const file = files.get(`media/models_x/${key}${extension}`);
    if (file) return { path: file.path, extension };
  }
  return undefined;
}

function convertModels(
  plan: AssetPlan,
  files: ActiveFileMap,
  outDir: string,
  writer: Writer,
  warnings: string[],
): void {
  mkdirSync(join(outDir, 'models'), { recursive: true });
  for (const key of [...plan.models].sort()) {
    const source = findModelFile(files, key);
    if (!source) {
      warnings.push(`model "${key}" has no file under media/models_X`);
      continue;
    }
    if (source.extension !== '.x') {
      warnings.push(`model "${key}" is ${source.extension}; only .x is converted for now`);
      continue;
    }
    try {
      const result = convertMeshFile(parseX(readFileSync(source.path, 'utf8')));
      for (const warning of result.warnings) warnings.push(`model "${key}": ${warning}`);
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
  plan: AssetPlan,
  files: ActiveFileMap,
  outDir: string,
  writer: Writer,
  warnings: string[],
): void {
  mkdirSync(join(outDir, 'textures'), { recursive: true });
  for (const key of [...plan.textures].sort()) {
    const source = files.get(`media/textures/${key}.png`);
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

function convertAnimations(
  plan: AssetPlan,
  files: ActiveFileMap,
  outDir: string,
  writer: Writer,
  warnings: string[],
): void {
  mkdirSync(join(outDir, 'anims'), { recursive: true });
  for (const clip of [...plan.animations].sort()) {
    const source = files.get(`media/anims_x/bob/${clip.toLowerCase()}.x`);
    if (!source) {
      warnings.push(`animation "${clip}" has no file under media/anims_X/Bob`);
      continue;
    }
    try {
      const result = convertAnimationFile(parseX(readFileSync(source.path, 'utf8')), {
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

function assembleManifest(
  catalog: GameCatalog,
  plan: AssetPlan,
  writer: Writer,
  version: GameVersion,
  mods: readonly DiscoveredMod[],
): Manifest {
  const bodyLocations: Manifest['bodyLocations'] = {};
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

  const hair: Manifest['hair'] = { male: {}, female: {} };
  for (const sex of ['male', 'female'] as const) {
    for (const style of catalog.hair[sex]) {
      hair[sex][style.name] = {
        ...(style.model ? { model: style.model } : {}),
        texture: style.texture,
        alternates: style.alternates,
      };
    }
  }
  const beards: Manifest['beards'] = {};
  for (const style of catalog.beards) {
    beards[style.name] = { ...(style.model ? { model: style.model } : {}), texture: style.texture };
  }

  const bloodMasks: Manifest['bloodMasks'] = {};
  for (const part of BODY_PARTS) {
    const key = `bloodtextures/bloodmask${BLOOD_MASK_NAMES[part]}`;
    if (writer.textures.has(key)) bloodMasks[part] = key;
  }

  const skins = (sex: 'male' | 'female'): string[] =>
    SKIN_TEXTURES[sex].filter((key) => writer.textures.has(key));

  return {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    gameVersion: formatGameVersion(version),
    generatedAt: new Date().toISOString(),
    mods: mods.map((mod) => mod.id),
    bodies: {
      male: {
        model: BODY_MODELS.male,
        skins: skins('male'),
        bodyHair: writer.textures.has('body/malebody01a'),
      },
      female: { model: BODY_MODELS.female, skins: skins('female'), bodyHair: false },
    },
    bodyAttachments: plan.bodyAttachments,
    models: Object.fromEntries([...writer.models].sort()),
    textures: Object.fromEntries([...writer.textures].sort()),
    animations: Object.fromEntries([...writer.animations].sort()),
    idle: catalog.idle,
    clothingItems: plan.clothingItems,
    wearables: plan.wearables,
    heldItems: plan.heldItems,
    bodyLocations,
    attachedLocations: catalog.attachedLocations,
    hair,
    beards,
    bloodMasks,
  };
}

/** Runs a complete build: mods, catalog, conversion, and the manifest. */
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
  const plan = planAssets(catalog, files, config.animations);
  warnings.push(...plan.warnings);
  log.info(
    `${plan.models.size} models, ${plan.textures.size} textures, ${plan.animations.size} animations to convert`,
  );

  mkdirSync(config.outDir, { recursive: true });
  const writer: Writer = { models: new Map(), textures: new Map(), animations: new Map() };
  convertModels(plan, files, config.outDir, writer, warnings);
  log.info(`${writer.models.size} models converted`);
  copyTextures(plan, files, config.outDir, writer, warnings);
  log.info(`${writer.textures.size} textures copied`);
  convertAnimations(plan, files, config.outDir, writer, warnings);
  log.info(`${writer.animations.size} animations converted`);

  const manifest = assembleManifest(catalog, plan, writer, version, mods);
  writeFileSync(join(config.outDir, 'manifest.json'), JSON.stringify(manifest));
  for (const warning of warnings) log.warn(warning);

  return {
    gameVersion: manifest.gameVersion,
    mods: manifest.mods,
    models: writer.models.size,
    textures: writer.textures.size,
    animations: writer.animations.size,
    wearables: Object.keys(plan.wearables).length,
    heldItems: Object.keys(plan.heldItems).length,
    warnings,
    seconds: (performance.now() - started) / 1000,
    outDir: config.outDir,
  };
}
