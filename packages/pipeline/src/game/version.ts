import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** A game version as the game compares it: major and minor only, the suffix is informative. */
export interface GameVersion {
  major: number;
  minor: number;
  suffix: string;
}

/** The oldest version whose mod folders Build 42 loads. */
export const MIN_REQUIRED_VERSION: GameVersion = { major: 42, minor: 0, suffix: '' };

export function parseGameVersion(text: string): GameVersion | undefined {
  const match = /^\s*(\d+)\.(\d+)(.*)$/.exec(text);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    suffix: (match[3] ?? '').trim(),
  };
}

/** The integer the game uses for comparisons: `major * 1000 + minor`. */
export function versionInt(version: GameVersion): number {
  return version.major * 1000 + version.minor;
}

export function formatGameVersion(version: GameVersion): string {
  return `${version.major}.${version.minor}${version.suffix}`;
}

/**
 * The integer the game derives from a mod's version folder name: one component gives
 * `major * 1000`, two or more give `major * 1000 + min(minor, 999)`; anything that is not a
 * number gives 0.
 */
export function versionIntFromFolderName(name: string): number {
  const parts = name.split('.');
  const major = Number(parts[0]);
  if (!Number.isInteger(major)) return 0;
  if (parts.length === 1) return major * 1000;
  const minor = Number(parts[1]);
  if (!Number.isInteger(minor)) return 0;
  return major * 1000 + Math.min(minor, 999);
}

/** Reads the version of the game the user last ran from `Zomboid/version.txt`. */
export function readInstalledGameVersion(
  zomboidUserDir = defaultZomboidUserDir(),
): GameVersion | undefined {
  const file = join(zomboidUserDir, 'version.txt');
  if (!existsSync(file)) return undefined;
  const firstToken = readFileSync(file, 'utf8').split(/\s+/)[0] ?? '';
  return parseGameVersion(firstToken);
}

export function defaultZomboidUserDir(): string {
  return join(homedir(), 'Zomboid');
}
