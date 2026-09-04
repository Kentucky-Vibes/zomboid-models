import { Color, type AnimationClip, type Texture } from 'three';

import type { AssetCache } from '../assets/AssetCache.js';
import type { Manifest } from '../format/manifest.js';
import {
  BODY_PARTS,
  type BodyPart,
  type CharacterDescription,
  type RgbColor,
} from '../format/types.js';
import {
  isPlainItemTexture,
  planBodyTexture,
  planItemTexture,
  type BodyLayerInput,
} from '../texture/characterTextures.js';
import { planTextureKeys, type CompositePlan } from '../texture/plan.js';
import type { TextureComposer } from '../texture/TextureComposer.js';
import { CharacterRig, type RigWarning } from './CharacterRig.js';
import { damageWornItems } from './damage.js';
import { resolveBeard, resolveHair, resolveOutfit, type ResolvedWornItem } from './outfit.js';

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

/** Everything a build needs besides the description. */
export interface BuildContext {
  cache: AssetCache;
  manifest: Manifest;
  /** When absent, textures are used as they are and blood, masks, and holes are skipped. */
  composer?: TextureComposer;
}

function textureFile(context: BuildContext, key: string | undefined): string | undefined {
  return key === undefined ? undefined : context.manifest.textures[key];
}

async function applyPlainTexture(
  context: BuildContext,
  rig: CharacterRig,
  key: string,
  textureKey: string | undefined,
): Promise<void> {
  const file = textureFile(context, textureKey);
  if (file === undefined) {
    rig.warnings.push({
      code: 'missing-texture',
      message: `${key}: texture "${textureKey ?? ''}" is not in the manifest`,
    });
    return;
  }
  rig.setTexture(key, await context.cache.loadTexture(file));
}

/** Loads every source of a plan without colour conversion and composes it on the GPU. */
async function composePlan(
  context: BuildContext,
  rig: CharacterRig,
  key: string,
  plan: CompositePlan,
  composer: TextureComposer,
): Promise<Texture | undefined> {
  const sources = new Map<string, Texture>();
  for (const textureKey of planTextureKeys(plan)) {
    const file = textureFile(context, textureKey);
    if (file === undefined) {
      rig.warnings.push({
        code: 'missing-texture',
        message: `${key}: texture "${textureKey}" is not in the manifest`,
      });
      continue;
    }
    sources.set(textureKey, await context.cache.loadTexture(file, true));
  }
  const first = plan.passes[0];
  if (!first || !('key' in first.diffuse) || !sources.has(first.diffuse.key)) return undefined;
  const texture = composer.compose(plan, (textureKey) => sources.get(textureKey));
  rig.ownTexture(texture);
  return texture;
}

async function applyPlan(
  context: BuildContext,
  rig: CharacterRig,
  key: string,
  plan: CompositePlan,
): Promise<void> {
  const first = plan.passes[0];
  const baseKey = first && 'key' in first.diffuse ? first.diffuse.key : undefined;
  if (!context.composer || plan.passes.length === 1) {
    await applyPlainTexture(context, rig, key, baseKey);
    return;
  }
  const texture = await composePlan(context, rig, key, plan, context.composer);
  if (texture) rig.setTexture(key, texture);
  else await applyPlainTexture(context, rig, key, baseKey);
}

function toColor(color: RgbColor | undefined): Color | undefined {
  return color === undefined ? undefined : new Color(color.r, color.g, color.b);
}

function holesOf(worn: ResolvedWornItem): BodyPart[] {
  const holes = worn.description.holes;
  return holes ? BODY_PARTS.filter((part) => holes[part]) : [];
}

function textureChoice(worn: ResolvedWornItem): string | undefined {
  const item = worn.clothingItem;
  const choices = item.textures.length > 0 ? item.textures : item.baseTextures;
  const index = Math.min(Math.max(worn.description.textureChoice ?? 0, 0), choices.length - 1);
  return choices[index];
}

async function addHairPart(
  context: BuildContext,
  rig: CharacterRig,
  key: string,
  model: string | undefined,
  texture: string | undefined,
  color: RgbColor | undefined,
): Promise<void> {
  if (model === undefined) return;
  await rig.addWornModel(context.cache, context.manifest, key, model);
  await applyPlainTexture(context, rig, key, texture);
  const tint = toColor(color);
  if (tint) rig.setTint(key, tint);
}

/**
 * Builds a rig from a character description: the body with its composed skin, every worn item
 * the game's slot rules keep, held items, hair, and beard. Skinned items bind to the body
 * skeleton; static ones sit on their bone.
 */
export async function buildCharacter(
  context: BuildContext,
  description: CharacterDescription,
): Promise<BuiltCharacter> {
  const { cache, manifest } = context;
  const rig = await CharacterRig.load(cache, manifest, description);
  const sex = description.body.sex;

  const damageWarnings: string[] = [];
  const damageItems = damageWornItems(manifest, sex, description.damage, damageWarnings);
  const outfit = resolveOutfit(manifest, {
    ...description,
    worn: [...damageItems, ...(description.worn ?? [])],
  });
  for (const warning of [...damageWarnings, ...outfit.warnings]) {
    rig.warnings.push({ code: 'missing-item', message: warning });
  }
  const shown = outfit.worn.filter((worn) => !worn.hidden);
  const visible = shown.filter((worn) => worn.model !== undefined);
  const overlays = shown
    .filter((worn) => worn.model === undefined)
    .map((worn) => textureChoice(worn))
    .filter((key): key is string => key !== undefined);

  const skin = bodyTextureKey(manifest, description);
  if (skin === undefined) {
    rig.warnings.push({ code: 'missing-texture', message: 'no skin texture for the body' });
  } else {
    const layers: BodyLayerInput[] = visible.map((worn) => ({
      masks: worn.clothingItem.masks,
      masksFolder: worn.clothingItem.masksFolder,
      underlayMasksFolder: worn.clothingItem.underlayMasksFolder,
      holes: holesOf(worn),
    }));
    const plan = planBodyTexture(manifest, {
      skinTexture: skin,
      blood: description.body.blood,
      dirt: description.body.dirt,
      layers,
      overlays,
    });
    await applyPlan(context, rig, BODY_KEY, plan);
  }

  for (const worn of visible) {
    const key = worn.description.item;
    const model = worn.model as string;
    if (worn.clothingItem.static) {
      await rig.addStaticModel(cache, manifest, key, model, worn.clothingItem.attachBone);
    } else {
      await rig.addWornModel(cache, manifest, key, model);
    }
    const base = textureChoice(worn);
    if (base === undefined) {
      rig.warnings.push({ code: 'missing-texture', message: `${key}: no texture choice` });
      continue;
    }
    const input = {
      baseTexture: base,
      tint: worn.description.tint,
      hue: worn.description.hue,
      description: worn.description,
    };
    if (isPlainItemTexture(input)) {
      await applyPlainTexture(context, rig, key, base);
    } else {
      await applyPlan(context, rig, key, planItemTexture(manifest, input));
    }
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
    if (held.texture) await applyPlainTexture(context, rig, key, held.texture);
  }

  for (const [index, attached] of (description.attached ?? []).entries()) {
    const attachmentName = manifest.attachedLocations[attached.location];
    const held = manifest.heldItems[attached.item];
    if (attachmentName === undefined) {
      rig.warnings.push({
        code: 'missing-item',
        message: `attached location "${attached.location}" is not in the manifest`,
      });
      continue;
    }
    if (!held) {
      rig.warnings.push({
        code: 'missing-item',
        message: `attached item "${attached.item}" is not in the manifest`,
      });
      continue;
    }
    const bodyAttachment = manifest.bodyAttachments[attachmentName];
    if (!bodyAttachment?.bone) {
      rig.warnings.push({
        code: 'missing-bone',
        message: `attachment "${attachmentName}" has no bone on the body model`,
      });
      continue;
    }
    const key = `attached:${index}`;
    await rig.addAttachedModel(cache, manifest, key, held, attachmentName, bodyAttachment.bone);
    if (held.texture) await applyPlainTexture(context, rig, key, held.texture);
  }

  const hair = resolveHair(manifest, sex, description.body.hair, outfit.hatCategory);
  const beard = resolveBeard(manifest, description.body.beard, outfit.hatCategory);
  for (const warning of [...hair.warnings, ...beard.warnings]) {
    rig.warnings.push({ code: 'missing-item', message: warning });
  }
  await addHairPart(context, rig, HAIR_KEY, hair.model, hair.texture, description.body.hairColor);
  await addHairPart(
    context,
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
