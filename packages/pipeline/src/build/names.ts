import { NAMES_FORMAT, type NamesCatalog } from 'zomboid-models/format';

import type { TranslationSet } from '../game/translations.js';

/**
 * The keys the names catalog covers, with the fallback text to use when no translation exists:
 * the script's `DisplayName` for items, `carModelName` for vehicles, the identifier otherwise.
 */
export interface NameKeys {
  /** Item full types with their script display names. */
  items: ReadonlyMap<string, string | undefined>;
  /** Vehicle script full names with their `carModelName`. */
  vehicles: ReadonlyMap<string, string | undefined>;
  hair: Iterable<string>;
  beards: Iterable<string>;
  animals: Iterable<string>;
  breeds: Iterable<string>;
  /** Body location ids as the catalog keys them (`base:hat`). */
  bodyLocations: Iterable<string>;
}

/** Looks a key up in the language, then in English, then returns undefined. */
function lookup(
  file: keyof TranslationSet,
  key: string,
  language: TranslationSet | undefined,
  english: TranslationSet | undefined,
): string | undefined {
  return language?.[file].get(key) ?? english?.[file].get(key);
}

/** The `UI_ClothingType_*` keys by lowercased location name, for the catalog's `base:hat` ids. */
function clothingTypeKeys(set: TranslationSet | undefined): Map<string, string> {
  const keys = new Map<string, string>();
  if (!set) return keys;
  for (const key of set.UI.keys()) {
    if (key.startsWith('UI_ClothingType_')) {
      keys.set(key.slice('UI_ClothingType_'.length).toLowerCase(), key);
    }
  }
  return keys;
}

/** The location name without its module prefix: `base:hat` gives `hat`. */
function locationName(id: string): string {
  const colon = id.indexOf(':');
  return colon < 0 ? id : id.slice(colon + 1);
}

/**
 * Builds the names of one language. Every key the catalogs reference gets a text: the
 * language's, else English, else the fallback the keys carry, else the identifier. Item names
 * also include every item the language's `ItemName` file knows, so a page can label items the
 * catalogs do not reference.
 */
export function assembleNames(
  language: string,
  translations: TranslationSet | undefined,
  english: TranslationSet | undefined,
  keys: NameKeys,
): NamesCatalog {
  const names: NamesCatalog = {
    format: NAMES_FORMAT,
    language,
    items: {},
    vehicles: {},
    hair: {},
    beards: {},
    animals: {},
    breeds: {},
    bodyLocations: {},
  };
  const itemKeys = new Set<string>(keys.items.keys());
  for (const key of translations?.ItemName.keys() ?? []) itemKeys.add(key);
  for (const key of [...itemKeys].sort()) {
    names.items[key] = lookup('ItemName', key, translations, english) ?? keys.items.get(key) ?? key;
  }
  for (const [fullName, carModelName] of [...keys.vehicles].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const scriptName = fullName.slice(fullName.indexOf('.') + 1);
    const key = `IGUI_VehicleName${carModelName ?? scriptName}`;
    names.vehicles[fullName] =
      lookup('IG_UI', key, translations, english) ?? carModelName ?? scriptName;
  }
  const simple = (
    target: Record<string, string>,
    prefix: string,
    values: Iterable<string>,
  ): void => {
    for (const value of [...values].sort()) {
      if (value.length === 0) continue;
      target[value] = lookup('IG_UI', `${prefix}${value}`, translations, english) ?? value;
    }
  };
  simple(names.hair, 'IGUI_Hair_', keys.hair);
  simple(names.beards, 'IGUI_Beard_', keys.beards);
  simple(names.animals, 'IGUI_AnimalType_', keys.animals);
  simple(names.breeds, 'IGUI_Breed_', keys.breeds);
  const clothingTypes = clothingTypeKeys(translations);
  const englishClothingTypes = clothingTypeKeys(english);
  for (const id of [...keys.bodyLocations].sort()) {
    const name = locationName(id);
    const key =
      clothingTypes.get(name.toLowerCase()) ?? englishClothingTypes.get(name.toLowerCase());
    names.bodyLocations[id] =
      (key === undefined ? undefined : lookup('UI', key, translations, english)) ?? name;
  }
  return names;
}
