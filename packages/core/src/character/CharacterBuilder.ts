import { Color, type AnimationClip, type Texture } from 'three';

import type { AssetCache } from '../assets/AssetCache.js';
import type { CharacterCatalog, ManifestClip } from '../format/manifest.js';
import {
  BODY_PARTS,
  type BodyPart,
  type CharacterDescription,
  type PartAmounts,
  type RgbColor,
  type Sex,
  type SkeletonKind,
  type Stance,
  type WornItemDescription,
} from '../format/types.js';
import { generateOutfit, randomBodyBlood, rollRotStage } from '../outfit/generate.js';
import { OutfitRng } from '../outfit/rng.js';
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

const SKELETON_INDEX: Record<SkeletonKind, number> = { burned: 0, plain: 1, muscle: 2 };
/** Separates the animation draws from the outfit stream when both come from one seed. */
const ANIMATION_SEED_SALT = 0x2a11c1d5n;

/**
 * The document with everything the game leaves to chance filled in: the outfit's items, hair,
 * and colours, and for zombies the rot stage, skin, and blood.
 */
export interface PreparedCharacter {
  description: CharacterDescription;
  zombie: boolean;
  skeleton: SkeletonKind | undefined;
  /** Rot stage of a zombie's skin, 1 to 3. */
  rot: 1 | 2 | 3;
  /** Blood on the attached weapon the outfit generator added, when it added one. */
  attachedBlood: number | undefined;
  warnings: string[];
}

function seedOf(description: CharacterDescription): bigint {
  const seed = description.body.zombie?.seed ?? description.outfit?.seed ?? 0;
  return BigInt(Math.trunc(seed));
}

/**
 * Resolves a named outfit and the zombie rolls into an explicit description. Items listed in
 * `worn` are put on after the outfit, like clothes a player picked up later.
 */
export function prepareCharacter(
  catalog: CharacterCatalog,
  description: CharacterDescription,
): PreparedCharacter {
  const zombie = description.body.zombie !== undefined;
  const skeleton = description.body.zombie?.skeleton;
  const sex = description.body.sex;
  const warnings: string[] = [];
  const body = { ...description.body };
  let worn: WornItemDescription[] = [...(description.worn ?? [])];
  let attached = [...(description.attached ?? [])];
  let rot: 1 | 2 | 3 | undefined = description.body.zombie?.rot;
  let attachedBlood: number | undefined;
  let bodyBlood: PartAmounts | undefined;

  if (description.outfit) {
    const outfitSeed = BigInt(Math.trunc(description.outfit.seed ?? 0));
    const generated = generateOutfit({
      catalog,
      sex,
      name: description.outfit.name,
      seed: outfitSeed,
      ...(description.outfit.worldAge !== undefined
        ? { worldAge: description.outfit.worldAge }
        : {}),
      zombie,
      skeleton: skeleton !== undefined,
    });
    warnings.push(...generated.warnings);
    worn = [...generated.bodyVisuals, ...generated.worn, ...worn];
    attached = [...generated.attached, ...attached];
    if (body.hair === undefined && generated.hair !== undefined) body.hair = generated.hair;
    if (body.beard === undefined && generated.beard !== undefined) body.beard = generated.beard;
    if (body.hairColor === undefined && generated.hairColor !== undefined) {
      body.hairColor = generated.hairColor;
    }
    if (body.skin === undefined && generated.skin !== undefined) body.skin = generated.skin;
    rot ??= generated.rot;
    attachedBlood = generated.attachedBlood;
    bodyBlood = generated.bodyBlood;
  }

  if (zombie) {
    const rng = new OutfitRng(seedOf(description));
    if (rot === undefined) rot = skeleton === undefined ? rollRotStage(rng, 0) : 1;
    if (body.skin === undefined) {
      const skins =
        skeleton === undefined
          ? (catalog.zombieSkins?.[sex][rot - 1] ?? [])
          : (catalog.skeletons?.[sex].skins ?? []);
      body.skin = skins.length > 0 ? rng.next(skins.length) : 0;
    }
    if (body.blood === undefined) {
      const random = randomBodyBlood(seedOf(description));
      const merged: PartAmounts = { ...random };
      for (const part of BODY_PARTS) {
        const extra = bodyBlood?.[part];
        if (extra !== undefined) merged[part] = Math.min((merged[part] ?? 0) + extra, 1);
      }
      body.blood = merged;
    }
    delete body.bodyHair;
    if (skeleton !== undefined) {
      delete body.hair;
      delete body.beard;
      body.skin = SKELETON_INDEX[skeleton];
    }
  }

  return {
    description: { ...description, body, worn, attached },
    zombie,
    skeleton,
    rot: rot ?? 1,
    attachedBlood,
    warnings,
  };
}

/** The clip the game would play, with its speed and starting point for this character. */
export interface AutoClip {
  clip: string;
  timeScale: number;
  startFraction: number;
}

function clipParameters(clip: ManifestClip, seed: bigint): AutoClip {
  const rng = new OutfitRng(seed ^ ANIMATION_SEED_SALT);
  let timeScale = clip.speed;
  if (clip.speedRandom) timeScale *= rng.nextFloat(clip.speedRandom[0], clip.speedRandom[1]);
  const startFraction = clip.randomStart === undefined ? 0 : rng.nextFloat(0, clip.randomStart);
  return { clip: clip.clip, timeScale, startFraction };
}

/**
 * The clip the game plays for the document: the stance's clip for zombies and for posed
 * players, else the idle for the primary item's weapon type.
 */
export function autoClip(catalog: CharacterCatalog, description: CharacterDescription): AutoClip {
  const stance: Stance = description.stance ?? 'standing';
  const zombie = description.body.zombie !== undefined;
  const seed = seedOf(description);
  if (zombie) {
    const clip = catalog.stances.zombie[stance] ?? catalog.stances.zombie.standing;
    if (clip) return clipParameters(clip, seed);
  } else if (stance !== 'standing') {
    const clip = catalog.stances.player[stance];
    if (clip) return clipParameters(clip, seed);
  }
  const primary = description.held?.primary?.item;
  const weaponType = primary === undefined ? undefined : catalog.heldItems[primary]?.weaponType;
  const byType = weaponType === undefined ? undefined : catalog.idle.byWeaponType[weaponType];
  return clipParameters(byType ?? catalog.idle.default, seed);
}

/** The idle clip name the game would play; kept from the first releases. */
export function autoIdleClip(catalog: CharacterCatalog, description: CharacterDescription): string {
  return autoClip(catalog, description).clip;
}

/** The body model and skin texture key for a prepared character. */
export function bodyModelAndSkin(
  catalog: CharacterCatalog,
  prepared: PreparedCharacter,
): { model: string; skin: string | undefined } {
  const { description, zombie, skeleton, rot } = prepared;
  const sex = description.body.sex;
  if (description.body.skinTexture) {
    const model =
      skeleton !== undefined ? catalog.skeletons?.[sex].model : catalog.bodies[sex].model;
    return {
      model: model ?? catalog.bodies[sex].model,
      skin: `body/${description.body.skinTexture.toLowerCase()}`,
    };
  }
  const index = description.body.skin ?? 0;
  const pick = (skins: readonly string[]): string | undefined =>
    skins[Math.min(Math.max(index, 0), skins.length - 1)];
  if (skeleton !== undefined && catalog.skeletons) {
    return { model: catalog.skeletons[sex].model, skin: pick(catalog.skeletons[sex].skins) };
  }
  const body = catalog.bodies[sex];
  if (zombie) {
    const skins = catalog.zombieSkins?.[sex][rot - 1] ?? [];
    return { model: body.model, skin: pick(skins) ?? pick(body.skins) };
  }
  const skin = pick(body.skins);
  if (skin === undefined) return { model: body.model, skin: undefined };
  const hairy = `${skin}a`;
  const useHairy = description.body.bodyHair && body.bodyHair && catalog.textures[hairy];
  return { model: body.model, skin: useHairy ? hairy : skin };
}

/** Picks the texture key for the body skin from the description; kept from the first releases. */
export function bodyTextureKey(
  catalog: CharacterCatalog,
  description: CharacterDescription,
): string | undefined {
  return bodyModelAndSkin(catalog, prepareCharacter(catalog, description)).skin;
}

/** Everything a build needs besides the description. */
export interface BuildContext {
  cache: AssetCache;
  manifest: CharacterCatalog;
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
 * the game's slot rules keep, held and attached items, hair, and beard. Skinned items bind to
 * the body skeleton; static ones sit on their bone.
 */
export async function buildCharacter(
  context: BuildContext,
  original: CharacterDescription,
): Promise<BuiltCharacter> {
  const { cache, manifest } = context;
  const prepared = prepareCharacter(manifest, original);
  const description = prepared.description;
  const sex: Sex = description.body.sex;
  const bodyChoice = bodyModelAndSkin(manifest, prepared);
  const rig = await CharacterRig.load(cache, manifest, bodyChoice.model);
  for (const warning of prepared.warnings)
    rig.warnings.push({ code: 'missing-item', message: warning });

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

  const skin = bodyChoice.skin;
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

  if (prepared.skeleton === undefined) {
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
  }

  return { rig, warnings: rig.warnings };
}

/** Loads a clip by catalog name; resolves to null and records a warning when it is unknown. */
export async function loadClip(
  cache: AssetCache,
  manifest: CharacterCatalog,
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
