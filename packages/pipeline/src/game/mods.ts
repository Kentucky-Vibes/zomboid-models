import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  formatGameVersion,
  MIN_REQUIRED_VERSION,
  parseGameVersion,
  versionInt,
  versionIntFromFolderName,
  type GameVersion,
} from './version.js';

export interface ModInfo {
  id: string;
  name: string | undefined;
  /** Ids of mods that must load before this one. */
  require: string[];
  versionMin: GameVersion | undefined;
  versionMax: GameVersion | undefined;
  modVersion: string | undefined;
  author: string | undefined;
}

export interface DiscoveredMod {
  id: string;
  info: ModInfo;
  /** The mod's root folder (the one holding `common` and the version folders). */
  dir: string;
  /** Present when the folder exists. */
  commonDir: string | undefined;
  versionDir: string | undefined;
  versionDirName: string;
}

const EXAMPLE_MOD = 'examplemod';

/** Parses the text of a `mod.info` file the way the game does: `key=value` lines. */
export function parseModInfo(text: string): ModInfo | undefined {
  const info: ModInfo = {
    id: '',
    name: undefined,
    require: [],
    versionMin: undefined,
    versionMax: undefined,
    modVersion: undefined,
    author: undefined,
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^FEFF/, '');
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    switch (key) {
      case 'id':
        info.id = value.trim();
        break;
      case 'name':
        info.name = value.trim();
        break;
      case 'require':
        info.require = value
          .split(',')
          .map((v) => v.replace(/\\/g, '').trim())
          .filter((v) => v.length > 0);
        break;
      case 'versionMin':
        info.versionMin = parseGameVersion(value.trim());
        break;
      case 'versionMax':
        info.versionMax = parseGameVersion(value.trim());
        break;
      case 'modversion':
        info.modVersion = value.trim();
        break;
      case 'author':
        info.author = value.trim();
        break;
      default:
        break;
    }
  }
  return info.id.length > 0 ? info : undefined;
}

/**
 * Picks the version folder of a mod: the highest folder name that parses to a version between
 * the minimum required one and the game version. Falls back to the minimum required name.
 */
export function chooseVersionDirName(
  folderNames: readonly string[],
  gameVersion: GameVersion,
): string {
  const game = versionInt(gameVersion);
  let best = versionInt(MIN_REQUIRED_VERSION);
  let chosen = formatGameVersion(MIN_REQUIRED_VERSION);
  for (const name of folderNames) {
    const value = versionIntFromFolderName(name);
    if (value >= best && value <= game) {
      chosen = name;
      best = value;
    }
  }
  return chosen;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function subdirectories(dir: string): string[] {
  if (!isDirectory(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter(isDirectory);
}

/** Reads a mod folder; returns undefined when it does not qualify as a Build 42 mod. */
export function readMod(dir: string, gameVersion: GameVersion): DiscoveredMod | undefined {
  if (basename(dir).toLowerCase() === EXAMPLE_MOD) return undefined;
  const versionDirName = chooseVersionDirName(
    subdirectories(dir).map((d) => basename(d)),
    gameVersion,
  );
  const commonDir = join(dir, 'common');
  const versionDir = join(dir, versionDirName);
  const infoFile = [join(versionDir, 'mod.info'), join(commonDir, 'mod.info')].find(existsSync);
  if (!infoFile) return undefined;
  const info = parseModInfo(readFileSync(infoFile, 'utf8'));
  if (!info) return undefined;
  return {
    id: info.id,
    info,
    dir,
    commonDir: isDirectory(commonDir) ? commonDir : undefined,
    versionDir: isDirectory(versionDir) ? versionDir : undefined,
    versionDirName,
  };
}

/**
 * Finds mods under the given folders. A folder can be a mod itself, a folder of mods (the user's
 * `Zomboid/mods`), a Workshop content folder (`<id>/mods/<mod>`), or a Workshop staging folder
 * (`<name>/Contents/mods/<mod>`). When two mods share an id, the first one found wins.
 */
export function discoverMods(roots: readonly string[], gameVersion: GameVersion): DiscoveredMod[] {
  const found: DiscoveredMod[] = [];
  const seen = new Set<string>();
  const add = (mod: DiscoveredMod | undefined): void => {
    if (mod && !seen.has(mod.id)) {
      seen.add(mod.id);
      found.push(mod);
    }
  };
  for (const root of roots) {
    const self = readMod(root, gameVersion);
    if (self) {
      add(self);
      continue;
    }
    for (const candidate of subdirectories(root)) {
      const mod = readMod(candidate, gameVersion);
      if (mod) {
        add(mod);
        continue;
      }
      for (const nested of [join(candidate, 'mods'), join(candidate, 'Contents', 'mods')]) {
        for (const inner of subdirectories(nested)) add(readMod(inner, gameVersion));
      }
    }
  }
  return found;
}

export function isModAvailable(mod: DiscoveredMod, gameVersion: GameVersion): boolean {
  const game = versionInt(gameVersion);
  if (mod.info.versionMin && versionInt(mod.info.versionMin) > game) return false;
  if (mod.info.versionMax && versionInt(mod.info.versionMax) < game) return false;
  return true;
}

export interface LoadOrderResult {
  mods: DiscoveredMod[];
  /** Ids that were requested or required but not found. */
  missing: string[];
}

/**
 * Orders mods the way the game does: for each enabled id in order, its `require` entries are
 * inserted before it (recursively), and every id is loaded once. When `enabledIds` is
 * undefined, every discovered mod is enabled in discovery order.
 */
export function resolveLoadOrder(
  discovered: readonly DiscoveredMod[],
  enabledIds: readonly string[] | undefined,
): LoadOrderResult {
  const byId = new Map(discovered.map((mod) => [mod.id, mod]));
  const ordered: DiscoveredMod[] = [];
  const done = new Set<string>();
  const missing: string[] = [];
  const visit = (id: string, stack: string[]): void => {
    if (done.has(id) || id.toLowerCase() === EXAMPLE_MOD) return;
    if (stack.includes(id)) return;
    const mod = byId.get(id);
    if (!mod) {
      if (!missing.includes(id)) missing.push(id);
      return;
    }
    for (const required of mod.info.require) visit(required, [...stack, id]);
    if (!done.has(id)) {
      done.add(id);
      ordered.push(mod);
    }
  };
  for (const id of enabledIds ?? discovered.map((mod) => mod.id)) visit(id, []);
  return { mods: ordered, missing };
}

/** Reads the `Mods=` line of a server ini file into an ordered id list. */
export function readServerIniMods(iniText: string): string[] {
  for (const line of iniText.split(/\r?\n/)) {
    const match = /^\s*Mods\s*=(.*)$/.exec(line);
    if (match) {
      return (match[1] ?? '')
        .split(';')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    }
  }
  return [];
}
