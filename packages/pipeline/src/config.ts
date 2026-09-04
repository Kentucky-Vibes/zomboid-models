import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/** The configuration file as written on disk. Paths are relative to the file's folder. */
export interface PipelineConfigFile {
  /** Folder of the game client or dedicated server, the one that holds `media`. */
  gameDir: string;
  /** Game version such as `42.20.3`; read from the user's `Zomboid/version.txt` when absent. */
  gameVersion?: string;
  /** Folders to scan for mods: a mod, a folder of mods, or a Workshop content folder. */
  modDirs?: string[];
  /** Ordered mod ids to enable; every discovered mod when absent and `serverIni` is not set. */
  mods?: string[];
  /** Server ini whose `Mods=` line gives the enabled mods and their order. */
  serverIni?: string;
  /** Output folder for the converted assets and the manifest. */
  outDir: string;
  /** Extra animation clip names to convert on top of the idle set. */
  animations?: string[];
}

export interface PipelineConfig {
  gameDir: string;
  gameVersion: string | undefined;
  modDirs: string[];
  mods: string[] | undefined;
  serverIni: string | undefined;
  outDir: string;
  animations: string[];
  /** Folder the paths were resolved against. */
  baseDir: string;
}

export const DEFAULT_CONFIG_FILE = 'zomboid-models.config.json';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function stringField(
  record: Record<string, unknown>,
  key: string,
  required: boolean,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    if (required) throw new ConfigError(`"${key}" is required`);
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigError(`"${key}" must be a non-empty string`);
  }
  return value;
}

function stringList(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ConfigError(`"${key}" must be an array of strings`);
  }
  return value as string[];
}

/** Validates a parsed JSON value and resolves its paths against `baseDir`. */
export function resolveConfig(value: unknown, baseDir: string): PipelineConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError('the configuration must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  const abs = (path: string): string => (isAbsolute(path) ? path : resolve(baseDir, path));
  const serverIni = stringField(record, 'serverIni', false);
  return {
    gameDir: abs(stringField(record, 'gameDir', true) as string),
    gameVersion: stringField(record, 'gameVersion', false),
    modDirs: (stringList(record, 'modDirs') ?? []).map(abs),
    mods: stringList(record, 'mods'),
    serverIni: serverIni === undefined ? undefined : abs(serverIni),
    outDir: abs(stringField(record, 'outDir', true) as string),
    animations: stringList(record, 'animations') ?? [],
    baseDir,
  };
}

/** Reads and validates a configuration file. */
export function loadConfig(path: string): PipelineConfig {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`cannot read configuration file ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return resolveConfig(parsed, dirname(resolve(path)));
}
