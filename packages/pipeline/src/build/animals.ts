import type {
  AnimalAction,
  AnimalCatalog,
  ManifestAnimal,
  ManifestClip,
} from 'zomboid-models/format';

import { clipOf, pickNode, pickStanceNode, type AnimNode } from '../game/animSets.js';
import type { AnimalDefinition } from '../game/animals.js';
import { resolveModel, type GameCatalog } from '../game/catalog.js';
import type { ActiveFileMap } from '../game/fileMap.js';

/** What the animal catalog needs converted, and the entries that reference it. */
export interface AnimalPlan {
  models: Set<string>;
  textures: Set<string>;
  animations: Set<string>;
  animals: Record<string, ManifestAnimal>;
  warnings: string[];
}

/** Texture keys are the game's texture paths, lowercased, under `media/textures`. */
export function animalTextureKey(name: string): string {
  return `body/${name.toLowerCase()}`;
}

/** The stances of an animal and the state folder and node of its animation set they come from. */
const ANIMAL_STANCE_SOURCES: Record<
  'standing' | 'sitting' | 'corpse',
  { state: string; node: string }
> = {
  standing: { state: 'idle', node: 'idle1' },
  sitting: { state: 'idle', node: 'idleSit' },
  corpse: { state: 'deadbody', node: 'deadbody' },
};

/**
 * The actions of an animal: the state folder and the variables the game holds while it walks
 * (`animalRunning` off), runs, or eats (`idleAction` set to `eat`, no eating variant).
 */
const ANIMAL_ACTION_SOURCES: Record<
  AnimalAction,
  { state: string; variables: Record<string, string> }
> = {
  walk: { state: 'walk', variables: { animalRunning: 'false' } },
  run: { state: 'walk', variables: { animalRunning: 'true' } },
  eat: { state: 'eating', variables: { idleAction: 'eat' } },
};

/**
 * Decides which models, textures, and animations the animals need and shapes the catalog
 * entries. Model script names resolve through the merged scripts like the game does.
 */
/** The blob shadow under animals, the same texture as under characters. */
export const ANIMAL_SHADOW_TEXTURE = 'newshadow';

export function planAnimalAssets(
  catalog: GameCatalog,
  definitions: readonly AnimalDefinition[],
  files: ActiveFileMap,
  loadStateNodes: (animSet: string, state: string) => { fileName: string; node: AnimNode }[],
): AnimalPlan {
  const plan: AnimalPlan = {
    models: new Set(),
    textures: new Set([ANIMAL_SHADOW_TEXTURE]),
    animations: new Set(),
    animals: {},
    warnings: [],
  };

  const modelKey = (scriptName: string | undefined, type: string): string | undefined => {
    if (scriptName === undefined) return undefined;
    const model = resolveModel(catalog.models, scriptName, 'Base');
    if (!model?.mesh) {
      plan.warnings.push(`animal ${type}: model script "${scriptName}" is not defined`);
      return undefined;
    }
    plan.models.add(model.mesh);
    return model.mesh;
  };
  const textureKey = (name: string | undefined): string | undefined => {
    if (name === undefined) return undefined;
    const key = animalTextureKey(name);
    if (!files.has(`media/textures/${key}.png`)) return undefined;
    plan.textures.add(key);
    return key;
  };
  const textureKeys = (names: readonly string[]): string[] =>
    names.map(textureKey).filter((key): key is string => key !== undefined);

  for (const definition of definitions) {
    const body = modelKey(definition.bodyModel, definition.type);
    if (body === undefined) continue;
    const models: ManifestAnimal['models'] = { body };
    const skeleton = modelKey(definition.bodyModelSkel, definition.type);
    const skeletonHeadless = modelKey(definition.bodyModelSkelNoHead, definition.type);
    const headless = modelKey(definition.bodyModelHeadless, definition.type);
    const fleece = modelKey(definition.bodyModelFleece, definition.type);
    if (skeleton) models.skeleton = skeleton;
    if (skeletonHeadless) models.skeletonHeadless = skeletonHeadless;
    if (headless) models.headless = headless;
    if (fleece) models.fleece = fleece;

    const textures: ManifestAnimal['textures'] = {};
    const skeletonTexture = textureKey(definition.textureSkeleton);
    const skeletonBloody = textureKey(definition.textureSkeletonBloody);
    const skinned = textureKey(definition.textureSkinned);
    if (skeletonTexture) textures.skeleton = skeletonTexture;
    if (skeletonBloody) textures.skeletonBloody = skeletonBloody;
    if (skinned) textures.skinned = skinned;

    const breeds: ManifestAnimal['breeds'] = {};
    for (const name of definition.breedOrder) {
      const breed = definition.breeds[name];
      if (!breed) continue;
      const rotten = textureKey(breed.rottenTexture);
      breeds[name] = {
        textures: textureKeys(breed.textures),
        texturesMale: textureKeys(breed.texturesMale),
        texturesBaby: textureKeys(breed.texturesBaby),
        ...(rotten !== undefined ? { rottenTexture: rotten } : {}),
      };
    }

    const stances: ManifestAnimal['stances'] = {};
    for (const [stance, source] of Object.entries(ANIMAL_STANCE_SOURCES) as [
      keyof typeof ANIMAL_STANCE_SOURCES,
      { state: string; node: string },
    ][]) {
      const nodes = loadStateNodes(definition.animSet, source.state);
      const wanted = source.node.toLowerCase();
      const named = nodes.find(
        (entry) =>
          entry.fileName.toLowerCase() === wanted || entry.node.name.toLowerCase() === wanted,
      )?.node;
      // Only the idle loop may fall back to the state's first plain node; a missing sitting or
      // corpse node means the animal has no such pose.
      const node =
        named ??
        (stance === 'standing'
          ? pickStanceNode(nodes, { animSet: definition.animSet, state: source.state })
          : undefined);
      if (node?.animName === undefined) continue;
      const clip: ManifestClip = clipOf(node, node.animName);
      stances[stance] = clip;
      plan.animations.add(clip.clip);
    }
    if (stances.standing === undefined) {
      plan.warnings.push(
        `animal ${definition.type}: no idle clip in AnimSets/${definition.animSet}/idle`,
      );
    }
    const actions: NonNullable<ManifestAnimal['actions']> = {};
    for (const [action, source] of Object.entries(ANIMAL_ACTION_SOURCES) as [
      AnimalAction,
      { state: string; variables: Record<string, string> },
    ][]) {
      const node = pickNode(loadStateNodes(definition.animSet, source.state), source.variables);
      if (node?.animName === undefined) continue;
      const clip = clipOf(node, node.animName);
      actions[action] = clip;
      plan.animations.add(clip.clip);
    }

    plan.animals[definition.type] = {
      group: definition.group,
      female: definition.female,
      baby: definition.baby,
      models,
      textures,
      animSet: definition.animSet,
      stances,
      ...(Object.keys(actions).length > 0 ? { actions } : {}),
      minSize: definition.minSize,
      maxSize: definition.maxSize,
      breeds,
      breedOrder: definition.breedOrder.filter((name) => breeds[name] !== undefined),
      ...(definition.avatar ? { avatar: definition.avatar } : {}),
    };
  }
  return plan;
}

/** Assembles the animal catalog from the plan and the converted files. */
export function assembleAnimalCatalog(
  plan: AnimalPlan,
  models: ReadonlyMap<string, AnimalCatalog['models'][string]>,
  textures: ReadonlyMap<string, string>,
  animations: ReadonlyMap<string, AnimalCatalog['animations'][string]>,
): AnimalCatalog {
  const pick = <T>(map: ReadonlyMap<string, T>, keys: Iterable<string>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const key of [...keys].sort()) {
      const value = map.get(key);
      if (value !== undefined) out[key] = value;
    }
    return out;
  };
  return {
    models: pick(models, plan.models),
    textures: pick(textures, plan.textures),
    animations: pick(animations, plan.animations),
    animals: plan.animals,
    ...(textures.has(ANIMAL_SHADOW_TEXTURE) ? { shadowTexture: ANIMAL_SHADOW_TEXTURE } : {}),
  };
}
