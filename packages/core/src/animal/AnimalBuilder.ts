import { Color, type Texture } from 'three';

import type { AssetCache } from '../assets/AssetCache.js';
import { CharacterRig, type RigWarning } from '../character/CharacterRig.js';
import { GAME_MODEL_SCALE } from '../character/scale.js';
import { characterShadowParams, createCharacterShadow } from '../character/shadow.js';
import type { AnimalDescription, AnimalStance } from '../format/animal.js';
import type { AnimalCatalog, ManifestAnimal, ManifestClip } from '../format/manifest.js';
import { OutfitRng } from '../outfit/rng.js';
import { planTextureKeys, type CompositePlan } from '../texture/plan.js';
import type { TextureComposer } from '../texture/TextureComposer.js';

export const ANIMAL_BODY_KEY = 'body';

/** Everything a build needs besides the description. */
export interface AnimalBuildContext {
  cache: AssetCache;
  catalog: AnimalCatalog;
  /** When absent, the hue shift is skipped and the texture is used as it is. */
  composer?: TextureComposer;
  /** Draws the game's blob shadow under the animal; on by default. */
  shadow?: boolean;
}

export interface BuiltAnimal {
  rig: CharacterRig;
  warnings: RigWarning[];
}

/** The model, texture, and scale an animal description resolves to. */
export interface AnimalLook {
  animal: ManifestAnimal | undefined;
  /** Model key from the catalog. */
  model: string | undefined;
  /** Texture key from the catalog. */
  texture: string | undefined;
  /** Uniform scale relative to a human, as the game scales animals by their size. */
  scale: number;
  warnings: string[];
}

/** Texture keys are the game's texture paths, lowercased, under `media/textures`. */
export function animalTextureKey(name: string): string {
  return `body/${name.toLowerCase()}`;
}

/**
 * Picks the model and texture the game would draw: the body variant from the description, the
 * breed's texture for the animal's sex and age (`IsoAnimal.initTexture`), and the size.
 */
export function resolveAnimalLook(
  catalog: AnimalCatalog,
  description: AnimalDescription,
): AnimalLook {
  const warnings: string[] = [];
  const animal = catalog.animals[description.type];
  if (!animal) {
    return {
      animal: undefined,
      model: undefined,
      texture: undefined,
      scale: 1,
      warnings: [`animal type "${description.type}" is not in the catalog`],
    };
  }
  const variant = description.variant ?? 'normal';
  const breedName = description.breed ?? animal.breedOrder[0];
  const breed = breedName === undefined ? undefined : animal.breeds[breedName];
  if (description.breed !== undefined && breed === undefined) {
    warnings.push(`breed "${description.breed}" is not defined for ${description.type}`);
  }

  let model: string | undefined = animal.models.body;
  let texture: string | undefined;
  switch (variant) {
    case 'skeleton':
    case 'skeletonBloody':
    case 'skeletonHeadless': {
      model =
        variant === 'skeletonHeadless'
          ? (animal.models.skeletonHeadless ?? animal.models.skeleton)
          : animal.models.skeleton;
      const name =
        variant === 'skeletonBloody'
          ? (animal.textures.skeletonBloody ?? animal.textures.skeleton)
          : animal.textures.skeleton;
      texture = name;
      break;
    }
    case 'headless':
      model = animal.models.headless ?? animal.models.body;
      break;
    case 'fleece':
      model = animal.models.fleece ?? animal.models.body;
      break;
    case 'sheared':
    case 'normal':
    case 'rotten':
    case 'skinned':
    default:
      break;
  }
  if (model === undefined) {
    warnings.push(`${description.type} has no model for the "${variant}" variant`);
    model = animal.models.body;
  }

  if (texture === undefined) {
    if (variant === 'skinned' && animal.textures.skinned !== undefined) {
      texture = animal.textures.skinned;
    } else if (variant === 'rotten' && breed?.rottenTexture !== undefined) {
      texture = breed.rottenTexture;
    } else if (breed !== undefined) {
      const list =
        animal.baby && breed.texturesBaby.length > 0
          ? breed.texturesBaby
          : animal.female
            ? breed.textures
            : breed.texturesMale.length > 0
              ? breed.texturesMale
              : breed.textures;
      if (typeof description.texture === 'string') {
        texture = animalTextureKey(description.texture);
      } else if (list.length > 0) {
        const index = description.texture ?? new OutfitRng(description.seed ?? 0).next(list.length);
        texture = list[Math.min(Math.max(index, 0), list.length - 1)];
      }
      if (variant === 'rotten') {
        warnings.push(`${breedName ?? description.type} has no rotten texture; using the live one`);
      }
    }
  }
  if (texture !== undefined && !catalog.textures[texture]) {
    warnings.push(`texture "${texture}" is not in the catalog`);
    texture = undefined;
  }

  const size = description.size ?? animal.maxSize;
  return { animal, model, texture, scale: Math.max(size, 0.01), warnings };
}

/** The clip for the animal's stance, from its animation set. */
export function autoAnimalClip(
  catalog: AnimalCatalog,
  description: AnimalDescription,
): ManifestClip | undefined {
  const animal = catalog.animals[description.type];
  if (!animal) return undefined;
  const stance: AnimalStance = description.stance ?? 'standing';
  return animal.stances[stance] ?? animal.stances.standing;
}

async function composeHue(
  context: AnimalBuildContext,
  rig: CharacterRig,
  plan: CompositePlan,
  composer: TextureComposer,
): Promise<Texture | undefined> {
  const sources = new Map<string, Texture>();
  for (const key of planTextureKeys(plan)) {
    const file = context.catalog.textures[key];
    if (file === undefined) continue;
    sources.set(key, await context.cache.loadTexture(file, true));
  }
  const first = plan.passes[0];
  if (!first || !('key' in first.diffuse) || !sources.has(first.diffuse.key)) return undefined;
  const texture = composer.compose(plan, (key) => sources.get(key));
  rig.ownTexture(texture);
  return texture;
}

/**
 * Builds a rig for an animal: the body variant's mesh with the breed texture, the hue shift
 * and tint of the game's animal shader, and the size as a uniform scale.
 */
export async function buildAnimal(
  context: AnimalBuildContext,
  description: AnimalDescription,
): Promise<BuiltAnimal> {
  const { cache, catalog } = context;
  const look = resolveAnimalLook(catalog, description);
  if (look.model === undefined) {
    throw new Error(look.warnings[0] ?? `cannot render animal "${description.type}"`);
  }
  const rig = await CharacterRig.load(cache, catalog, look.model);
  for (const warning of look.warnings)
    rig.warnings.push({ code: 'missing-item', message: warning });
  rig.scale.setScalar(look.scale * GAME_MODEL_SCALE);
  const shadowKey = catalog.shadowTexture;
  const shadowFile = shadowKey === undefined ? undefined : catalog.textures[shadowKey];
  if (context.shadow !== false && shadowFile !== undefined) {
    const texture = await cache.loadTexture(shadowFile);
    rig.shadowUpdater = () => {
      const box = rig.bounds();
      if (box.isEmpty()) return;
      const scale = rig.scale.x;
      rig.setShadow(
        createCharacterShadow(
          texture,
          characterShadowParams(rig.bones, rig, scale),
          scale,
          box.min.y,
        ),
      );
    };
  }

  if (look.texture !== undefined) {
    const file = catalog.textures[look.texture] as string;
    const hue = description.hue ?? 0;
    let texture: Texture | undefined;
    if (hue !== 0 && context.composer) {
      const plan: CompositePlan = {
        passes: [{ shader: 'hueChange', diffuse: { key: look.texture }, hue }],
      };
      texture = await composeHue(context, rig, plan, context.composer);
    }
    rig.setTexture(ANIMAL_BODY_KEY, texture ?? (await cache.loadTexture(file)));
  } else {
    rig.warnings.push({ code: 'missing-texture', message: 'no texture for the animal' });
  }
  if (description.tint) {
    rig.setTint(
      ANIMAL_BODY_KEY,
      new Color(description.tint.r, description.tint.g, description.tint.b),
    );
  }
  return { rig, warnings: rig.warnings };
}
