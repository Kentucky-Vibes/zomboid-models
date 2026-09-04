import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { resolveGameVersion, resolveMods } from '../build/build.js';
import { loadConfig } from '../config.js';
import { discoverMods } from '../game/mods.js';
import { formatGameVersion } from '../game/version.js';
import type { CliIo } from './run.js';

const REQUIRED_MEDIA = [
  'models_X/Skinned/MaleBody.x',
  'models_X/Skinned/FemaleBody.x',
  'textures/Body',
  'scripts',
  'clothing/clothingItems',
  'anims_X/Bob',
  'hairStyles/hairStyles.xml',
  'lua/shared/NPCs/BodyLocations.lua',
  'AnimSets/player/idle',
];

/** Checks the configuration, the install, and the mod folders, and reports what it finds. */
export function runDoctor(configPath: string, io: CliIo): number {
  let problems = 0;
  const fail = (message: string): void => {
    problems++;
    io.err(`FAIL ${message}`);
  };
  const ok = (message: string): void => io.out(`ok   ${message}`);

  let config;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return 1;
  }
  ok(`configuration ${configPath}`);

  if (!existsSync(join(config.gameDir, 'media'))) {
    fail(`gameDir ${config.gameDir} has no "media" folder`);
  } else {
    ok(`gameDir ${config.gameDir}`);
    for (const relPath of REQUIRED_MEDIA) {
      const path = join(config.gameDir, 'media', relPath);
      if (existsSync(path)) ok(`media/${relPath}`);
      else fail(`media/${relPath} is missing`);
    }
  }

  try {
    const version = resolveGameVersion(config);
    ok(`game version ${formatGameVersion(version)}`);
    for (const dir of config.modDirs) {
      if (existsSync(dir)) ok(`mod folder ${dir}`);
      else fail(`mod folder ${dir} does not exist`);
    }
    const discovered = discoverMods(config.modDirs, version);
    ok(
      `${discovered.length} mods discovered${discovered.length > 0 ? `: ${discovered.map((m) => `${m.id} (${m.versionDirName})`).join(', ')}` : ''}`,
    );
    const warnings: string[] = [];
    const enabled = resolveMods(config, version, warnings);
    for (const warning of warnings) fail(warning);
    ok(`${enabled.length} mods enabled`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (config.serverIni !== undefined && !existsSync(config.serverIni)) {
    fail(`serverIni ${config.serverIni} does not exist`);
  }

  try {
    mkdirSync(config.outDir, { recursive: true });
    accessSync(config.outDir, constants.W_OK);
    ok(`outDir ${config.outDir} is writable`);
  } catch {
    fail(
      `outDir ${config.outDir} cannot be created or written (parent: ${dirname(config.outDir)})`,
    );
  }

  io.out(
    problems === 0
      ? 'everything looks fine'
      : `${problems} problem${problems === 1 ? '' : 's'} found`,
  );
  return problems === 0 ? 0 : 1;
}
