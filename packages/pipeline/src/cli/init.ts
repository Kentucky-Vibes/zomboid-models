import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PipelineConfigFile } from '../config.js';
import { findSteamInstalls } from '../game/steam.js';
import {
  defaultZomboidUserDir,
  formatGameVersion,
  readInstalledGameVersion,
} from '../game/version.js';
import type { CliIo } from './run.js';

export interface InitOptions {
  configPath: string;
  force: boolean;
}

/** Detects the game and mod folders on this machine and writes a configuration file. */
export function runInit(options: InitOptions, io: CliIo): number {
  if (existsSync(options.configPath) && !options.force) {
    io.err(`${options.configPath} already exists; pass --force to overwrite it`);
    return 1;
  }
  const installs = findSteamInstalls();
  const gameDir = installs.clients[0] ?? installs.servers[0];
  if (gameDir === undefined) {
    io.err(
      'no Project Zomboid install was found in the Steam libraries; write the configuration by hand',
    );
    io.err('it needs at least "gameDir" (the folder that holds "media") and "outDir"');
    return 1;
  }
  const modDirs = [...installs.workshop];
  const userMods = join(defaultZomboidUserDir(), 'mods');
  if (existsSync(userMods)) modDirs.push(userMods);

  const config: PipelineConfigFile = { gameDir, outDir: 'assets-out' };
  const version = readInstalledGameVersion();
  if (version) config.gameVersion = formatGameVersion(version);
  if (modDirs.length > 0) config.modDirs = modDirs;

  writeFileSync(options.configPath, `${JSON.stringify(config, null, 2)}\n`);
  io.out(`wrote ${options.configPath}`);
  io.out(`  gameDir: ${gameDir}`);
  io.out(`  gameVersion: ${config.gameVersion ?? '(not detected; set it by hand)'}`);
  io.out(`  modDirs: ${modDirs.length > 0 ? modDirs.join(', ') : '(none found)'}`);
  io.out('  outDir: assets-out');
  io.out(
    'Edit the file to pick the mods to include, then run "zomboid-models doctor" and "zomboid-models build".',
  );
  return 0;
}
