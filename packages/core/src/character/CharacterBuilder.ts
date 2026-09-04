import type { AnimationClip } from 'three';

import type { AssetCache } from '../assets/AssetCache.js';
import type { Manifest } from '../format/manifest.js';
import type { CharacterDescription } from '../format/types.js';
import { CharacterRig, type RigWarning } from './CharacterRig.js';

export interface BuiltCharacter {
  rig: CharacterRig;
  warnings: RigWarning[];
}

/** Picks the texture key for the body skin from the description. */
export function bodyTextureKey(
  manifest: Manifest,
  description: CharacterDescription,
): string | undefined {
  const body = manifest.bodies[description.body.sex];
  if (description.body.skinTexture) {
    return `body/${description.body.skinTexture.toLowerCase()}`;
  }
  const index = description.body.skin ?? 0;
  const skin = body.skins[Math.min(Math.max(index, 0), body.skins.length - 1)];
  if (!skin) return undefined;
  return description.body.bodyHair && body.bodyHair ? `${skin}a` : skin;
}

async function applyTexture(
  cache: AssetCache,
  manifest: Manifest,
  rig: CharacterRig,
  key: string,
  textureKey: string | undefined,
): Promise<void> {
  const file = textureKey === undefined ? undefined : manifest.textures[textureKey];
  if (file === undefined) {
    rig.warnings.push({
      code: 'missing-texture',
      message: `${key}: texture "${textureKey ?? ''}" is not in the manifest`,
    });
    return;
  }
  rig.setTexture(key, await cache.loadTexture(file));
}

/**
 * Builds a rig from a character description: the body with its skin, then every worn item
 * that has a mesh for the body's sex, with the texture its description selects.
 */
export async function buildCharacter(
  cache: AssetCache,
  manifest: Manifest,
  description: CharacterDescription,
): Promise<BuiltCharacter> {
  const rig = await CharacterRig.load(cache, manifest, description);
  await applyTexture(cache, manifest, rig, 'body', bodyTextureKey(manifest, description));

  for (const worn of description.worn ?? []) {
    const wearable = manifest.wearables[worn.item];
    const clothingItemName = worn.clothingItem ?? wearable?.clothingItem;
    const clothingItem =
      clothingItemName === undefined ? undefined : manifest.clothingItems[clothingItemName];
    if (!clothingItem) {
      rig.warnings.push({
        code: 'missing-item',
        message: `worn item "${worn.item}" is not in the manifest`,
      });
      continue;
    }
    const modelKey = clothingItem.model?.[description.body.sex];
    if (modelKey === undefined) continue;
    await rig.addWornModel(cache, manifest, worn.item, modelKey);
    const choices =
      clothingItem.textures.length > 0 ? clothingItem.textures : clothingItem.baseTextures;
    const choice = choices[Math.min(Math.max(worn.textureChoice ?? 0, 0), choices.length - 1)];
    await applyTexture(cache, manifest, rig, worn.item, choice);
  }

  return { rig, warnings: rig.warnings };
}

/** Loads a clip by manifest name; resolves to null and records a warning when it is unknown. */
export async function loadClip(
  cache: AssetCache,
  manifest: Manifest,
  name: string,
  warnings: RigWarning[],
): Promise<AnimationClip | null> {
  const animation = manifest.animations[name];
  if (!animation) {
    warnings.push({
      code: 'missing-animation',
      message: `animation "${name}" is not in the manifest`,
    });
    return null;
  }
  const gltf = await cache.loadGltf(animation.file);
  const clip = gltf.animations.find((c) => c.name === name) ?? gltf.animations[0];
  if (!clip) {
    warnings.push({
      code: 'missing-animation',
      message: `animation file for "${name}" has no clips`,
    });
    return null;
  }
  return clip;
}
