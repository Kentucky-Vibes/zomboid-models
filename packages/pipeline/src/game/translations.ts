/**
 * Reader for the game's translation files, `media/lua/shared/Translate/<LANG>/<Name>.json`:
 * flat JSON objects of key to text, UTF-8 without a byte order mark. The game's file is read
 * first and every mod's file of the same name after it, so a mod adds or replaces keys.
 */
import { readFileSync } from 'node:fs';

import type { ActiveFileMap } from './fileMap.js';
import { stripBom } from './scripts.js';

const TRANSLATE_PREFIX = 'media/lua/shared/Translate/';

/** The translation files the names catalog reads. */
export const TRANSLATION_FILES = ['ItemName', 'IG_UI', 'UI'] as const;

export type TranslationFile = (typeof TRANSLATION_FILES)[number];

/** The keys of each file of one language, merged across the game and the mods. */
export type TranslationSet = Record<TranslationFile, Map<string, string>>;

/** Languages that have a folder under `Translate`, sorted, as the game names them. */
export function availableLanguages(files: ActiveFileMap): string[] {
  const languages = new Set<string>();
  for (const { relPath } of files.under(TRANSLATE_PREFIX)) {
    const rest = relPath.slice(TRANSLATE_PREFIX.length);
    const slash = rest.indexOf('/');
    if (slash > 0) languages.add(rest.slice(0, slash).toUpperCase());
  }
  return [...languages].sort();
}

function parseTranslationJson(
  text: string,
  relPath: string,
  warnings: string[],
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(text));
  } catch (error) {
    warnings.push(`${relPath}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    warnings.push(`${relPath}: expected an object of keys to texts`);
    return {};
  }
  return parsed as Record<string, unknown>;
}

/**
 * Reads one language: the game's files and then each mod's, in load order. Returns undefined
 * when the language has none of the files.
 */
export function readTranslations(
  files: ActiveFileMap,
  language: string,
  warnings: string[],
): TranslationSet | undefined {
  const set: TranslationSet = { ItemName: new Map(), IG_UI: new Map(), UI: new Map() };
  let found = false;
  for (const name of TRANSLATION_FILES) {
    const relPath = `${TRANSLATE_PREFIX}${language}/${name}.json`;
    for (const file of files.versions(relPath)) {
      found = true;
      const parsed = parseTranslationJson(readFileSync(file.path, 'utf8'), relPath, warnings);
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') set[name].set(key, value);
      }
    }
  }
  return found ? set : undefined;
}
