import type {
  BodyPart,
  ManifestAttachment,
  ManifestClothingItem,
  ManifestHeldItem,
  ManifestWearable,
  Sex,
} from 'zomboid-models/format';

import { weaponTypeOf } from '../game/animSets.js';
import { resolveModel, type GameCatalog, type ModelDefinition } from '../game/catalog.js';
import type { ClothingItemXml } from '../game/clothingXml.js';
import { textureKeyFromReference } from '../game/clothingXml.js';
import type { ActiveFileMap } from '../game/fileMap.js';
import { javaHashMapOrder } from '../game/javaOrder.js';
import { entryValue, entryValues } from '../game/scripts.js';
import { mirrorAttachmentZ } from '../x/mirror.js';

export const BODY_MODELS = { male: 'skinned/malebody', female: 'skinned/femalebody' } as const;
export const SKELETON_MODELS = {
  male: 'skinned/male_skeleton',
  female: 'skinned/female_skeleton',
} as const;
export const SKIN_TEXTURES = {
  male: [
    'body/malebody01',
    'body/malebody02',
    'body/malebody03',
    'body/malebody04',
    'body/malebody05',
  ],
  female: [
    'body/femalebody01',
    'body/femalebody02',
    'body/femalebody03',
    'body/femalebody04',
    'body/femalebody05',
  ],
} as const;
/** Skeleton skins in the game's list order (`PopTemplateManager`). */
export const SKELETON_TEXTURES = ['body/skeletonburned', 'body/skeleton', 'body/skeletonmuscle'];
export const DEFAULT_MASKS_FOLDER = 'body/masks';
export const BLOOD_MASK_FOLDERS = ['bloodtextures', 'holetextures', 'patches'] as const;

/** Zombie skins per rot stage, as `PopTemplateManager` lists them: four bodies per stage. */
export function zombieSkinTextures(sex: Sex): string[][] {
  const prefix = sex === 'male' ? 'body/m_zedbody0' : 'body/f_zedbody0';
  return [1, 2, 3].map((stage) => [1, 2, 3, 4].map((body) => `${prefix}${body}_level${stage}`));
}

/** Bandage item per body part, as `BodyPartType` names them. */
export const BANDAGE_ITEMS: Record<BodyPart, string> = {
  Hand_L: 'Base.Bandage_LeftHand',
  Hand_R: 'Base.Bandage_RightHand',
  ForeArm_L: 'Base.Bandage_LeftLowerArm',
  ForeArm_R: 'Base.Bandage_RightLowerArm',
  UpperArm_L: 'Base.Bandage_LeftUpperArm',
  UpperArm_R: 'Base.Bandage_RightUpperArm',
  Torso_Upper: 'Base.Bandage_Chest',
  Torso_Lower: 'Base.Bandage_Abdomen',
  Head: 'Base.Bandage_Head',
  Neck: 'Base.Bandage_Neck',
  Groin: 'Base.Bandage_Groin',
  UpperLeg_L: 'Base.Bandage_LeftUpperLeg',
  UpperLeg_R: 'Base.Bandage_RightUpperLeg',
  LowerLeg_L: 'Base.Bandage_LeftLowerLeg',
  LowerLeg_R: 'Base.Bandage_RightLowerLeg',
  Foot_L: 'Base.Bandage_LeftFoot',
  Foot_R: 'Base.Bandage_RightFoot',
  Back: 'Base.Bandage_Back',
};

/** Everything the build has to convert or copy, with the catalog entries that reference it. */
export interface AssetPlan {
  /** Model keys (lowercased paths under models_X, no extension). */
  models: Set<string>;
  /** Texture keys (lowercased paths under textures, no extension). */
  textures: Set<string>;
  /** Clip names to convert from the animation folders. */
  animations: Set<string>;
  clothingItems: Record<string, ManifestClothingItem>;
  wearables: Record<string, ManifestWearable>;
  /** Item type per lowercased clothing item name; the last script definition wins. */
  clothingItemToItem: Record<string, string>;
  heldItems: Record<string, ManifestHeldItem>;
  bodyAttachments: Record<string, ManifestAttachment>;
  /** Items the game may add as zombie wounds, in its iteration order. */
  zombieDamageItems: string[];
  warnings: string[];
}

function clothingToManifest(
  item: ClothingItemXml,
  byGuid: ReadonlyMap<string, string>,
): ManifestClothingItem {
  const entry: ManifestClothingItem = {
    static: item.static,
    textures: item.textureChoices,
    baseTextures: item.baseTextures,
    masks: item.masks,
    allowRandomTint: item.allowRandomTint,
    allowRandomHue: item.allowRandomHue,
  };
  if (item.maleModel || item.femaleModel) {
    entry.model = {};
    if (item.maleModel) entry.model.male = item.maleModel;
    if (item.femaleModel) entry.model.female = item.femaleModel;
  }
  if (item.altMaleModel || item.altFemaleModel) {
    entry.altModel = {};
    if (item.altMaleModel) entry.altModel.male = item.altMaleModel;
    if (item.altFemaleModel) entry.altModel.female = item.altFemaleModel;
  }
  if (item.attachBone) entry.attachBone = item.attachBone;
  if (item.masksFolder && item.masksFolder !== DEFAULT_MASKS_FOLDER)
    entry.masksFolder = item.masksFolder;
  if (item.underlayMasksFolder && item.underlayMasksFolder !== DEFAULT_MASKS_FOLDER) {
    entry.underlayMasksFolder = item.underlayMasksFolder;
  }
  if (item.hatCategory) entry.hatCategory = item.hatCategory;
  if (item.decalGroup) entry.decalGroup = item.decalGroup;
  const spawnWith = item.spawnWith
    .map((guid) => byGuid.get(guid.toLowerCase()))
    .filter((name): name is string => name !== undefined);
  if (spawnWith.length > 0) entry.spawnWith = spawnWith;
  if (item.guid) entry.guid = item.guid;
  return entry;
}

/** Every texture key directly under a folder, from the file map. */
export function texturesInFolder(files: ActiveFileMap, folder: string): string[] {
  const prefix = `media/textures/${folder}/`;
  return files
    .under(prefix)
    .filter(
      ({ relPath }) => relPath.endsWith('.png') && !relPath.slice(prefix.length).includes('/'),
    )
    .map(({ relPath }) => relPath.slice('media/textures/'.length, -'.png'.length));
}

function modelTextureKey(model: ModelDefinition): string | undefined {
  const texture = model.texture ?? model.mesh;
  return texture === undefined ? undefined : textureKeyFromReference(texture);
}

/** Attachments in the mirrored space of the converted meshes, without undefined fields. */
function manifestAttachments(model: ModelDefinition): Record<string, ManifestAttachment> {
  const out: Record<string, ManifestAttachment> = {};
  for (const [name, attachment] of Object.entries(model.attachments)) {
    const mirrored = mirrorAttachmentZ(attachment);
    out[name] = {
      ...(mirrored.bone === undefined ? {} : { bone: mirrored.bone }),
      offset: mirrored.offset,
      rotate: mirrored.rotate,
      scale: mirrored.scale,
    };
  }
  return out;
}

function addTexturesIfPresent(
  plan: AssetPlan,
  files: ActiveFileMap,
  keys: readonly string[],
): number {
  let found = 0;
  for (const key of keys) {
    if (!files.has(`media/textures/${key}.png`)) continue;
    plan.textures.add(key);
    found++;
  }
  return found;
}

/** Decides which models, textures, and animations a build needs and shapes the catalog data. */
export function planAssets(
  catalog: GameCatalog,
  files: ActiveFileMap,
  extraAnimations: readonly string[],
): AssetPlan {
  const stanceClips = [
    ...Object.values(catalog.stances.player),
    ...Object.values(catalog.stances.zombie),
  ].map((clip) => clip.clip);
  const plan: AssetPlan = {
    models: new Set([
      BODY_MODELS.male,
      BODY_MODELS.female,
      SKELETON_MODELS.male,
      SKELETON_MODELS.female,
    ]),
    textures: new Set(),
    animations: new Set([
      catalog.idle.default.clip,
      ...Object.values(catalog.idle.byWeaponType).map((clip) => clip.clip),
      ...stanceClips,
      ...extraAnimations,
    ]),
    clothingItems: {},
    wearables: {},
    clothingItemToItem: {},
    heldItems: {},
    bodyAttachments: {},
    zombieDamageItems: [],
    warnings: [],
  };

  for (const sex of ['male', 'female'] as const) {
    let found = 0;
    for (const skin of SKIN_TEXTURES[sex]) {
      if (!files.has(`media/textures/${skin}.png`)) continue;
      found++;
      plan.textures.add(skin);
      if (files.has(`media/textures/${skin}a.png`)) plan.textures.add(`${skin}a`);
    }
    if (found === 0)
      plan.warnings.push(`no ${sex} skin textures were found under media/textures/Body`);
    for (const stage of zombieSkinTextures(sex)) addTexturesIfPresent(plan, files, stage);
  }
  addTexturesIfPresent(plan, files, SKELETON_TEXTURES);
  for (const folder of [DEFAULT_MASKS_FOLDER, ...BLOOD_MASK_FOLDERS]) {
    for (const key of texturesInFolder(files, folder)) plan.textures.add(key);
  }

  const body = resolveModel(catalog.models, 'MaleBody', 'Base');
  if (body) plan.bodyAttachments = manifestAttachments(body);

  const baseItemNames: string[] = [];
  const zombieDamageNames: string[] = [];
  for (const item of catalog.items.values()) {
    if (item.module === 'Base') baseItemNames.push(item.name);
    const clothingName = entryValue(item.block, 'ClothingItem')?.trim();
    const bodyLocation = entryValue(item.block, 'BodyLocation')?.trim().toLowerCase();
    if (bodyLocation === 'zeddmg' && item.module === 'Base') zombieDamageNames.push(item.name);
    if (clothingName && bodyLocation) {
      const key = clothingName.toLowerCase();
      const clothing = catalog.clothingItems.get(key);
      if (!clothing) continue;
      plan.clothingItemToItem[key] = item.fullType;
      if (!plan.clothingItems[key]) {
        plan.clothingItems[key] = clothingToManifest(clothing, catalog.clothingItemsByGuid);
        for (const model of [
          clothing.maleModel,
          clothing.femaleModel,
          clothing.altMaleModel,
          clothing.altFemaleModel,
        ]) {
          if (model) plan.models.add(model);
        }
        for (const texture of [...clothing.textureChoices, ...clothing.baseTextures])
          plan.textures.add(texture);
        for (const folder of [clothing.masksFolder, clothing.underlayMasksFolder]) {
          if (folder && folder !== 'none')
            for (const key of texturesInFolder(files, folder)) plan.textures.add(key);
        }
      }
      const wearable: ManifestWearable = {
        clothingItem: key,
        bodyLocation,
        bloodLocation: entryValues(item.block, 'BloodLocation')
          .flatMap((v) => v.split(';'))
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      };
      const fabric = entryValue(item.block, 'FabricType')?.trim().toLowerCase();
      if (fabric) wearable.fabric = fabric;
      const displayName = entryValue(item.block, 'DisplayName')?.trim();
      if (displayName) wearable.displayName = displayName;
      if (entryValue(item.block, 'CanHaveHoles')?.trim().toLowerCase() === 'false') {
        wearable.canHaveHoles = false;
      }
      plan.wearables[item.fullType] = wearable;
    }

    const sprite = entryValue(item.block, 'WeaponSprite') ?? entryValue(item.block, 'StaticModel');
    if (sprite) {
      const model = resolveModel(catalog.models, sprite, item.module);
      if (!model?.mesh) {
        plan.warnings.push(`${item.fullType}: model "${sprite}" is not defined`);
        continue;
      }
      plan.models.add(model.mesh);
      const held: ManifestHeldItem = {
        model: model.mesh,
        weaponType: weaponTypeOf(item.block),
        scale: model.scale,
        attachments: manifestAttachments(model),
      };
      const texture = modelTextureKey(model);
      if (texture) {
        held.texture = texture;
        plan.textures.add(texture);
      }
      const displayName = entryValue(item.block, 'DisplayName')?.trim();
      if (displayName) held.displayName = displayName;
      const conditionMax = Number(entryValue(item.block, 'ConditionMax')?.trim());
      if (Number.isInteger(conditionMax) && conditionMax > 0) held.conditionMax = conditionMax;
      plan.heldItems[item.fullType] = held;
    }
  }
  // The game keeps the Base module's items in a HashMap and lists the wound items from it.
  plan.zombieDamageItems = javaHashMapOrder(zombieDamageNames, baseItemNames.length);

  for (const style of [...catalog.hair.male, ...catalog.hair.female, ...catalog.beards]) {
    if (style.model) plan.models.add(style.model);
    plan.textures.add(style.texture);
  }
  for (const decal of Object.values(catalog.decals)) plan.textures.add(decal.texture);

  return plan;
}
