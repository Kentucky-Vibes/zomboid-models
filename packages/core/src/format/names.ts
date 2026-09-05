/**
 * Display names in one language for the keys the catalogs use: item types, vehicle scripts,
 * hair and beard styles, animal types and breeds, body locations. The pipeline writes one file
 * per language from the game's translation files, English filling in what a language lacks.
 */

export const NAMES_FORMAT = 'zomboid-models/names';

export interface NamesCatalog {
  format: typeof NAMES_FORMAT;
  /** The language code as the game's `Translate` folder names it: `EN`, `RU`, `FR`. */
  language: string;
  /** By item full type, every item the game's `ItemName` file knows plus the catalogs' items. */
  items: Record<string, string>;
  /** By vehicle script full name. */
  vehicles: Record<string, string>;
  /** By hair style name. */
  hair: Record<string, string>;
  /** By beard style name. */
  beards: Record<string, string>;
  /** By animal type. */
  animals: Record<string, string>;
  /** By breed name. */
  breeds: Record<string, string>;
  /** By body location id as the character catalog keys it (`base:hat`). */
  bodyLocations: Record<string, string>;
}

export type NameKind = Exclude<keyof NamesCatalog, 'format' | 'language'>;

/** The name of a key, or the key itself when the catalog has no entry for it. */
export function displayName(names: NamesCatalog | undefined, kind: NameKind, key: string): string {
  return names?.[kind][key] ?? key;
}
