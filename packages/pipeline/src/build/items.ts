import type {
  ItemCatalog,
  ManifestAttachment,
  ManifestItem,
  ManifestItemModel,
} from 'zomboid-models/format';

import { resolveModel, type GameCatalog, type ModelDefinition } from '../game/catalog.js';
import { WEAPON_BLOOD_TEXTURES } from './select.js';
import { textureKeyFromReference } from '../game/clothingXml.js';
import { entryValue } from '../game/scripts.js';
import { mirrorAttachmentZ } from '../x/mirror.js';

/** What the item catalog needs converted, and the entries that reference it. */
export interface ItemPlan {
  models: Set<string>;
  textures: Set<string>;
  items: Record<string, ManifestItem>;
  warnings: string[];
}

/**
 * Attachments in the renderer's space. Model scripts give them in the game's left-handed frame,
 * which the converted meshes mirror, whether they came from `.x` or FBX files.
 */
function attachmentsOf(model: ModelDefinition): Record<string, ManifestAttachment> {
  const out: Record<string, ManifestAttachment> = {};
  for (const [name, attachment] of Object.entries(model.attachments)) {
    const placed = mirrorAttachmentZ(attachment);
    out[name] = {
      ...(placed.bone === undefined ? {} : { bone: placed.bone }),
      offset: placed.offset,
      rotate: placed.rotate,
      scale: placed.scale,
    };
  }
  return out;
}

/**
 * Decides which models and textures the items need and shapes the catalog entries: the ground
 * model from `WorldStaticModel` and the held model from `WeaponSprite` or `StaticModel`.
 */
export function planItemAssets(catalog: GameCatalog): ItemPlan {
  const plan: ItemPlan = {
    models: new Set(),
    textures: new Set([WEAPON_BLOOD_TEXTURES.overlay, WEAPON_BLOOD_TEXTURES.mask]),
    items: {},
    warnings: [],
  };

  const entryFor = (
    reference: string,
    module: string,
    itemType: string,
  ): ManifestItemModel | undefined => {
    const model = resolveModel(catalog.models, reference, module);
    if (!model?.mesh) {
      plan.warnings.push(`${itemType}: model "${reference}" is not defined`);
      return undefined;
    }
    plan.models.add(model.mesh);
    const entry: ManifestItemModel = {
      model: model.mesh,
      scale: model.scale,
      attachments: attachmentsOf(model),
    };
    const texture = model.texture ?? model.mesh;
    const key = textureKeyFromReference(texture);
    entry.texture = key;
    plan.textures.add(key);
    return entry;
  };

  for (const item of catalog.items.values()) {
    const world = entryValue(item.block, 'WorldStaticModel')?.trim();
    const held =
      entryValue(item.block, 'WeaponSprite')?.trim() ??
      entryValue(item.block, 'StaticModel')?.trim();
    if (!world && !held) continue;
    const entry: ManifestItem = {};
    const displayName = entryValue(item.block, 'DisplayName')?.trim();
    if (displayName) entry.displayName = displayName;
    if (world) {
      const model = entryFor(world, item.module, item.fullType);
      if (model) entry.world = model;
    }
    if (held) {
      const model = entryFor(held, item.module, item.fullType);
      if (model) entry.held = model;
    }
    if (entry.world || entry.held) plan.items[item.fullType] = entry;
  }
  return plan;
}

/** Assembles the item catalog from the plan and the converted files. */
export function assembleItemCatalog(
  plan: ItemPlan,
  models: ReadonlyMap<string, ItemCatalog['models'][string]>,
  textures: ReadonlyMap<string, string>,
): ItemCatalog {
  const pick = <T>(map: ReadonlyMap<string, T>, keys: Iterable<string>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const key of [...keys].sort()) {
      const value = map.get(key);
      if (value !== undefined) out[key] = value;
    }
    return out;
  };
  const weaponBlood =
    textures.has(WEAPON_BLOOD_TEXTURES.overlay) && textures.has(WEAPON_BLOOD_TEXTURES.mask)
      ? { weaponBlood: { ...WEAPON_BLOOD_TEXTURES } }
      : {};
  return {
    models: pick(models, plan.models),
    textures: pick(textures, plan.textures),
    items: plan.items,
    ...weaponBlood,
  };
}
