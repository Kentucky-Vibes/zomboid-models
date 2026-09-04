import { Color, type AnimationClip } from 'three';

import type { AssetCache } from '../assets/AssetCache.js';
import type { Manifest } from '../format/manifest.js';
import type { CharacterDescription, RgbColor } from '../format/types.js';
import { CharacterRig, type RigWarning } from './CharacterRig.js';
import { resolveBeard, resolveHair, resolveOutfit } from './outfit.js';

export interface BuiltCharacter {
  rig: CharacterRig;
  warnings: RigWarning[];
}

export const HAIR_KEY = 'hair';
export const BEARD_KEY = 'beard';
export const BODY_KEY = 'body';
/** Prop bones the game uses for the primary (right) and secondary (left) hand. */
export const PRIMARY_PROP = 'Bip01_Prop1';
export const SECONDARY_PROP = 'Bip01_Prop2';

/** The idle clip the game would play: by the primary item's weapon type, else the default. */
export function autoIdleClip(manifest: Manifest, description: CharacterDescription): string {
  const primary = description.held?.primary?.item;
  const weaponType = primary === undefined ? undefined : manifest.heldItems[primary]?.weaponType;
  const byType = weaponType === undefined ? undefined : manifest.idle.byWeaponType[weaponType];
  return byType ?? manifest.idle.default;
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
  const hairy = `${skin}a`;
  return description.body.bodyHair && body.bodyHair && manifest.textures[hairy] ? hairy : skin;
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

function toColor(color: RgbColor | undefined): Color | undefined {
  return color === undefined ? undefined : new Color(color.r, color.g, color.b);
}

async function addHairPart(
  cache: AssetCache,
  manifest: Manifest,
  rig: CharacterRig,
  key: string,
  model: string | undefined,
  texture: string | undefined,
  color: RgbColor | undefined,
): Promise<void> {
  if (model === undefined) return;
  await rig.addWornModel(cache, manifest, key, model);
  await applyTexture(cache, manifest, rig, key, texture);
  const tint = toColor(color);
  if (tint) rig.setTint(key, tint);
}

/**
 * Builds a rig from a character description: the body with its skin, hair and beard, and
 * every worn item that the game's slot rules keep, each with the texture its description
 * selects. Skinned items bind to the body skeleton; static ones sit on their bone.
 */
export async function buildCharacter(
  cache: AssetCache,
  manifest: Manifest,
  description: CharacterDescription,
): Promise<BuiltCharacter> {
  const rig = await CharacterRig.load(cache, manifest, description);
  const sex = description.body.sex;
  await applyTexture(cache, manifest, rig, BODY_KEY, bodyTextureKey(manifest, description));

  const outfit = resolveOutfit(manifest, description);
  for (const warning of outfit.warnings)
    rig.warnings.push({ code: 'missing-item', message: warning });

  for (const worn of outfit.worn) {
    if (worn.hidden || worn.model === undefined) continue;
    const key = worn.description.item;
    if (worn.clothingItem.static) {
      await rig.addStaticModel(cache, manifest, key, worn.model, worn.clothingItem.attachBone);
    } else {
      await rig.addWornModel(cache, manifest, key, worn.model);
    }
    const choices =
      worn.clothingItem.textures.length > 0
        ? worn.clothingItem.textures
        : worn.clothingItem.baseTextures;
    const choice =
      choices[Math.min(Math.max(worn.description.textureChoice ?? 0, 0), choices.length - 1)];
    await applyTexture(cache, manifest, rig, key, choice);
    const tint = toColor(worn.description.tint);
    if (tint) rig.setTint(key, tint);
  }

  const hands = [
    ['primary', description.held?.primary, PRIMARY_PROP],
    ['secondary', description.held?.secondary, SECONDARY_PROP],
  ] as const;
  for (const [hand, item, prop] of hands) {
    if (!item) continue;
    const held = manifest.heldItems[item.item];
    if (!held) {
      rig.warnings.push({
        code: 'missing-item',
        message: `held item "${item.item}" is not in the manifest`,
      });
      continue;
    }
    const key = `held:${hand}`;
    await rig.addHeldModel(cache, manifest, key, held, prop);
    if (held.texture) await applyTexture(cache, manifest, rig, key, held.texture);
  }

  const hair = resolveHair(manifest, sex, description.body.hair, outfit.hatCategory);
  const beard = resolveBeard(manifest, description.body.beard, outfit.hatCategory);
  for (const warning of [...hair.warnings, ...beard.warnings]) {
    rig.warnings.push({ code: 'missing-item', message: warning });
  }
  await addHairPart(
    cache,
    manifest,
    rig,
    HAIR_KEY,
    hair.model,
    hair.texture,
    description.body.hairColor,
  );
  await addHairPart(
    cache,
    manifest,
    rig,
    BEARD_KEY,
    beard.model,
    beard.texture,
    description.body.beardColor ?? description.body.hairColor,
  );

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
