import type { Manifest, ManifestClothingItem } from '../format/manifest.js';
import type { CharacterDescription, Sex, WornItemDescription } from '../format/types.js';

/** A worn item after the game's slot rules have been applied. */
export interface ResolvedWornItem {
  description: WornItemDescription;
  clothingItemName: string;
  clothingItem: ManifestClothingItem;
  bodyLocation: string;
  /** Render order of the body location; lower draws first. */
  order: number;
  /** Model key to draw, after the alternate-model rule; undefined for texture-only items. */
  model: string | undefined;
  /** True when another worn item's location hides this one. */
  hidden: boolean;
}

export interface ResolvedOutfit {
  worn: ResolvedWornItem[];
  /** Hat category of the first worn hat, if any. */
  hatCategory: string | undefined;
  warnings: string[];
}

function locationOf(manifest: Manifest, id: string): Manifest['bodyLocations'][string] | undefined {
  return manifest.bodyLocations[id];
}

/**
 * Applies the game's wearing rules to the described items, in the order they are listed: an
 * item replaces what is worn at its location (unless the location holds several), removes items
 * at exclusive locations, and the result stays sorted by render order. Then the hide and
 * alternate-model rules are evaluated across the final list.
 */
export function resolveOutfit(
  manifest: Manifest,
  description: CharacterDescription,
): ResolvedOutfit {
  const sex: Sex = description.body.sex;
  const warnings: string[] = [];
  const worn: ResolvedWornItem[] = [];

  for (const item of description.worn ?? []) {
    const wearable = manifest.wearables[item.item];
    const clothingItemName = (item.clothingItem ?? wearable?.clothingItem)?.toLowerCase();
    const clothingItem =
      clothingItemName === undefined ? undefined : manifest.clothingItems[clothingItemName];
    if (clothingItemName === undefined || !clothingItem) {
      warnings.push(`worn item "${item.item}" is not in the manifest`);
      continue;
    }
    const bodyLocation = wearable?.bodyLocation;
    if (bodyLocation === undefined) {
      warnings.push(`worn item "${item.item}" has no body location`);
      continue;
    }
    const location = locationOf(manifest, bodyLocation);
    if (!location) {
      warnings.push(`worn item "${item.item}" uses unknown body location "${bodyLocation}"`);
      continue;
    }
    for (let i = worn.length - 1; i >= 0; i--) {
      const existing = worn[i] as ResolvedWornItem;
      const sameSlot = existing.bodyLocation === bodyLocation && !location.multiItem;
      const exclusive = location.exclusive.includes(existing.bodyLocation);
      if (sameSlot || exclusive) worn.splice(i, 1);
    }
    const resolved: ResolvedWornItem = {
      description: item,
      clothingItemName,
      clothingItem,
      bodyLocation,
      order: location.order,
      model: clothingItem.model?.[sex],
      hidden: false,
    };
    const index = worn.findIndex((w) => w.order > location.order);
    worn.splice(index < 0 ? worn.length : index, 0, resolved);
  }

  for (const item of worn) {
    const wornLocations = worn.filter((w) => w !== item).map((w) => w.bodyLocation);
    item.hidden = wornLocations.some((other) =>
      locationOf(manifest, other)?.hides.includes(item.bodyLocation),
    );
    const alt = item.description.alternateModel ?? item.clothingItem.altModel?.[sex];
    if (alt !== undefined && item.description.alternateModel !== undefined) item.model = alt;
  }

  const hat = worn.find(
    (w) => w.clothingItem.hatCategory && w.clothingItem.hatCategory.toLowerCase() !== 'nobeard',
  );
  return { worn, hatCategory: hat?.clothingItem.hatCategory, warnings };
}

export interface ResolvedHair {
  /** Model key, or undefined when nothing should be drawn. */
  model: string | undefined;
  texture: string | undefined;
  warnings: string[];
}

/** Picks the hair style to draw, replacing it by the hat's alternate when a hat is worn. */
export function resolveHair(
  manifest: Manifest,
  sex: Sex,
  styleName: string | undefined,
  hatCategory: string | undefined,
): ResolvedHair {
  const warnings: string[] = [];
  if (styleName === undefined) return { model: undefined, texture: undefined, warnings };
  const styles = manifest.hair[sex];
  let style = styles[styleName];
  if (!style) {
    warnings.push(`hair style "${styleName}" is not in the manifest`);
    return { model: undefined, texture: undefined, warnings };
  }
  if (hatCategory !== undefined) {
    const category = hatCategory.toLowerCase();
    if (category === 'nohair' || category === 'nohairnobeard') {
      return { model: undefined, texture: undefined, warnings };
    }
    const alternateName = style.alternates[category] ?? style.alternates['default'];
    if (alternateName !== undefined) {
      const alternate = styles[alternateName];
      if (alternate) style = alternate;
      else warnings.push(`hair style "${styleName}" names unknown alternate "${alternateName}"`);
    }
  }
  return { model: style.model, texture: style.texture, warnings };
}

/** Picks the beard style to draw, unless the hat removes beards. */
export function resolveBeard(
  manifest: Manifest,
  styleName: string | undefined,
  hatCategory: string | undefined,
): ResolvedHair {
  const warnings: string[] = [];
  if (styleName === undefined) return { model: undefined, texture: undefined, warnings };
  if (hatCategory !== undefined && hatCategory.toLowerCase().includes('nobeard')) {
    return { model: undefined, texture: undefined, warnings };
  }
  const style = manifest.beards[styleName];
  if (!style) {
    warnings.push(`beard style "${styleName}" is not in the manifest`);
    return { model: undefined, texture: undefined, warnings };
  }
  return { model: style.model, texture: style.texture, warnings };
}
