import type { Texture } from 'three';

import type { AssetCache } from '../assets/AssetCache.js';
import { CharacterRig, type RigWarning } from '../character/CharacterRig.js';
import { GAME_MODEL_SCALE } from '../character/scale.js';
import type { ItemDescription } from '../format/item.js';
import type { ItemCatalog, ManifestItemModel } from '../format/manifest.js';
import { BLOOD_DARK, planTextureKeys, type CompositePlan } from '../texture/plan.js';
import type { TextureComposer } from '../texture/TextureComposer.js';

export const ITEM_KEY = 'item';

export interface ItemBuildContext {
  cache: AssetCache;
  catalog: ItemCatalog;
  /** When absent, blood on weapons is skipped. */
  composer?: TextureComposer;
}

export interface BuiltItem {
  rig: CharacterRig;
  warnings: RigWarning[];
}

/** The model an item description resolves to. */
export interface ItemLook {
  model: ManifestItemModel | undefined;
  kind: 'world' | 'held' | undefined;
  warnings: string[];
}

/** Picks the ground model by default, or the held one when asked or when the item has no ground model. */
export function resolveItemLook(catalog: ItemCatalog, description: ItemDescription): ItemLook {
  const item = catalog.items[description.item];
  if (!item) {
    return {
      model: undefined,
      kind: undefined,
      warnings: [`item "${description.item}" is not in the catalog`],
    };
  }
  const warnings: string[] = [];
  const wanted = description.model ?? 'world';
  let kind: 'world' | 'held' | undefined = wanted;
  let model = item[wanted];
  if (!model) {
    const other = wanted === 'world' ? 'held' : 'world';
    model = item[other];
    kind = model ? other : undefined;
    if (description.model !== undefined) {
      warnings.push(`item "${description.item}" has no ${wanted} model; showing the ${other} one`);
    }
  }
  if (!model) warnings.push(`item "${description.item}" has no model`);
  return { model, kind, warnings };
}

/** The weapon's texture with the game's blood overlay composited in, when the catalog has it. */
async function composeWeaponBlood(
  context: ItemBuildContext,
  rig: CharacterRig,
  textureKey: string,
  blood: number,
): Promise<Texture | undefined> {
  const weaponBlood = context.catalog.weaponBlood;
  if (!weaponBlood || !context.composer) return undefined;
  const plan: CompositePlan = {
    passes: [
      { shader: 'blit', diffuse: { key: textureKey } },
      {
        shader: 'overlayMask',
        diffuse: { key: weaponBlood.overlay },
        mask: { key: weaponBlood.mask },
        intensity: Math.min(blood, 1),
        bloodDark: BLOOD_DARK,
      },
    ],
  };
  const sources = new Map<string, Texture>();
  for (const key of planTextureKeys(plan)) {
    const file = context.catalog.textures[key];
    if (file === undefined) return undefined;
    sources.set(key, await context.cache.loadTexture(file, true));
  }
  const texture = context.composer.compose(plan, (key) => sources.get(key));
  rig.ownTexture(texture);
  return texture;
}

/**
 * Builds a rig for one item: the mesh scaled by its script, with its texture. The rig has no
 * skeleton to animate; it exists so that items share the viewer's framing and export.
 */
export async function buildItem(
  context: ItemBuildContext,
  description: ItemDescription,
): Promise<BuiltItem> {
  const { cache, catalog } = context;
  const look = resolveItemLook(catalog, description);
  if (!look.model) throw new Error(look.warnings[0] ?? `cannot render item "${description.item}"`);
  if (!catalog.models[look.model.model]) {
    throw new Error(`catalog has no model "${look.model.model}" for ${description.item}`);
  }
  const rig = CharacterRig.empty();
  for (const warning of look.warnings)
    rig.warnings.push({ code: 'missing-item', message: warning });
  await rig.addStaticModel(cache, catalog, ITEM_KEY, look.model.model, undefined);
  rig.scale.setScalar(look.model.scale * GAME_MODEL_SCALE);
  const textureKey = look.model.texture;
  const file = textureKey === undefined ? undefined : catalog.textures[textureKey];
  if (file === undefined) {
    rig.warnings.push({
      code: 'missing-texture',
      message: `${description.item}: texture "${textureKey ?? ''}" is not in the catalog`,
    });
  } else {
    const blood = description.blood ?? 0;
    const composed =
      blood > 0 && textureKey !== undefined
        ? await composeWeaponBlood(context, rig, textureKey, blood)
        : undefined;
    rig.setTexture(ITEM_KEY, composed ?? (await cache.loadTexture(file)));
  }
  return { rig, warnings: rig.warnings };
}
