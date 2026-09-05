import type {
  ManifestVehicle,
  ManifestVehicleModel,
  ManifestVehicleAnim,
  ManifestVehiclePart,
  ManifestVehicleSkin,
  VehicleCatalog,
} from 'zomboid-models/format';

import { resolveModel, type GameCatalog } from '../game/catalog.js';
import { textureKeyFromReference } from '../game/clothingXml.js';
import type {
  VehicleScript,
  VehicleScriptModel,
  VehicleScriptSkin,
} from '../game/vehicleScripts.js';

/** What the vehicle catalog needs converted, and the entries that reference it. */
export interface VehiclePlan {
  models: Set<string>;
  textures: Set<string>;
  vehicles: Record<string, ManifestVehicle>;
  warnings: string[];
}

/** Parts the shader state reads, kept in the catalog even without a model of their own. */
const STATE_PART_IDS = /^(Door|Window|Windshield|EngineDoor|TruckBed|TrunkDoor|Headlight|lightbar)/;

const SKIN_TEXTURE_KEYS: readonly Exclude<keyof VehicleScriptSkin, 'texture'>[] = [
  'textureMask',
  'textureLights',
  'textureRust',
  'textureDamage1Overlay',
  'textureDamage1Shell',
  'textureDamage2Overlay',
  'textureDamage2Shell',
];

/**
 * Decides which models and textures the vehicles need and shapes the catalog entries. Model
 * script names resolve through the merged scripts like the game does; a skin takes the
 * vehicle-level textures for the ones it lacks, as `Skin.copyMissingFrom` does.
 */
/** The shadow the game draws under every vehicle, from `media/vehicleShadow.png`. */
export const VEHICLE_SHADOW_TEXTURE = 'vehicleshadow';

export function planVehicleAssets(catalog: GameCatalog): VehiclePlan {
  const plan: VehiclePlan = { models: new Set(), textures: new Set(), vehicles: {}, warnings: [] };
  plan.textures.add(VEHICLE_SHADOW_TEXTURE);

  const texture = (reference: string): string => {
    const key = textureKeyFromReference(reference);
    plan.textures.add(key);
    return key;
  };

  const modelEntry = (
    script: VehicleScript,
    model: VehicleScriptModel,
    what: string,
  ): ManifestVehicleModel | undefined => {
    if (model.file === undefined) {
      plan.warnings.push(`${script.fullName}: ${what} names no model file`);
      return undefined;
    }
    const definition = resolveModel(catalog.models, model.file, script.module);
    if (!definition?.mesh) {
      plan.warnings.push(
        `${script.fullName}: model script "${model.file}" for ${what} is not defined`,
      );
      return undefined;
    }
    plan.models.add(definition.mesh);
    const entry: ManifestVehicleModel = {
      model: definition.mesh,
      modelScale: definition.scale,
      scale: model.scale,
      offset: [...model.offset],
      rotate: [...model.rotate],
    };
    if (model.id !== undefined) entry.id = model.id;
    if (definition.subMesh !== undefined) entry.mesh = definition.subMesh;
    if (definition.texture !== undefined) entry.texture = texture(definition.texture);
    if (definition.shader !== undefined) entry.shader = definition.shader;
    if (definition.invertX) entry.invertX = true;
    if (model.ignoreVehicleScale) entry.ignoreVehicleScale = true;
    if (model.attachmentParent !== undefined) entry.attachmentParent = model.attachmentParent;
    if (model.attachmentSelf !== undefined) entry.attachmentSelf = model.attachmentSelf;
    return entry;
  };

  const skinEntry = (script: VehicleScript, skin: VehicleScriptSkin): ManifestVehicleSkin => {
    const entry: ManifestVehicleSkin = { texture: texture(skin.texture ?? '') };
    for (const key of SKIN_TEXTURE_KEYS) {
      const reference = skin[key] ?? script.textures[key];
      if (reference !== undefined) entry[key] = texture(reference);
    }
    return entry;
  };

  const names = [...catalog.vehicles.keys()].sort();
  for (const name of names) {
    const script = catalog.vehicles.get(name) as VehicleScript;
    const body = script.models[0];
    if (!body) {
      plan.warnings.push(`${script.fullName}: no model block; skipped`);
      continue;
    }
    const models: ManifestVehicleModel[] = [];
    for (const model of script.models) {
      const entry = modelEntry(
        script,
        model,
        model === body ? 'the body' : `model "${model.id ?? ''}"`,
      );
      if (entry) models.push(entry);
    }
    if (
      models.length === 0 ||
      script.models[0]?.file === undefined ||
      models[0]?.model !==
        resolveModel(catalog.models, script.models[0]?.file ?? '', script.module)?.mesh
    ) {
      plan.warnings.push(`${script.fullName}: the body model could not be resolved; skipped`);
      continue;
    }
    if (script.skins.length === 0) {
      plan.warnings.push(`${script.fullName}: no skin; the vehicle will render without textures`);
    }
    const parts: Record<string, ManifestVehiclePart> = {};
    for (const part of script.parts) {
      const wanted =
        part.models.length > 0 ||
        part.wheel !== undefined ||
        part.door ||
        part.window ||
        part.hasLightsRear ||
        STATE_PART_IDS.test(part.id);
      if (!wanted) continue;
      const entry: ManifestVehiclePart = { models: [] };
      for (const model of part.models) {
        const converted = modelEntry(script, model, `part "${part.id}"`);
        if (converted) entry.models.push(converted);
      }
      if (part.wheel !== undefined) entry.wheel = part.wheel;
      if (part.parent !== undefined) entry.parent = part.parent;
      if (part.door) entry.door = true;
      if (part.window) entry.window = true;
      if (part.hasLightsRear) entry.hasLightsRear = true;
      if (part.category !== undefined) entry.category = part.category;
      const anims = animEntries(part.anims);
      if (anims) entry.anims = anims;
      parts[part.id] = entry;
    }
    const vehicle: ManifestVehicle = {
      models,
      modelScale: body.scale,
      extents: [...script.extents],
      skins: script.skins.map((skin) => skinEntry(script, skin)),
      wheels: script.wheels.map((wheel) => ({
        id: wheel.id,
        front: wheel.front,
        offset: [...wheel.offset],
        radius: wheel.radius,
        width: wheel.width,
      })),
      parts,
    };
    if (script.lightbar) vehicle.lightbar = true;
    const seats: Record<string, [number, number, number]> = {};
    for (const passenger of script.passengers) {
      if (passenger.inside) seats[passenger.id] = [...passenger.inside];
    }
    if (Object.keys(seats).length > 0) vehicle.seats = seats;
    // `VehicleScript.Loaded`: the shadow defaults to the extents and the centre of mass.
    vehicle.shadow = {
      extents: script.shadowExtents ?? [script.extents[0], script.extents[2]],
      offset: script.shadowOffset ?? [script.centerOfMassOffset[0], script.centerOfMassOffset[2]],
    };
    if (script.forcedColor) vehicle.forcedColor = { ...script.forcedColor };
    plan.vehicles[script.fullName] = vehicle;
  }
  return plan;
}

/** Assembles the vehicle catalog from the plan and the converted files. */
export function assembleVehicleCatalog(
  plan: VehiclePlan,
  models: ReadonlyMap<string, VehicleCatalog['models'][string]>,
  textures: ReadonlyMap<string, string>,
): VehicleCatalog {
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
    vehicles: plan.vehicles,
    ...(textures.has(VEHICLE_SHADOW_TEXTURE) ? { shadowTexture: VEHICLE_SHADOW_TEXTURE } : {}),
  };
}

/**
 * The part's anims that name a clip, as the catalog stores them. Sound-only anims are dropped,
 * and so are the `Actor*` ones, which are the character's own animations.
 */
function animEntries(
  anims: Record<
    string,
    { anim: string | undefined; rate: number; reverse: boolean; animate: boolean }
  >,
): Record<string, ManifestVehicleAnim> | undefined {
  const entries: Record<string, ManifestVehicleAnim> = {};
  let any = false;
  for (const [name, anim] of Object.entries(anims)) {
    if (anim.anim === undefined || name.startsWith('Actor')) continue;
    const entry: ManifestVehicleAnim = { anim: anim.anim };
    if (anim.rate !== 1) entry.rate = anim.rate;
    if (anim.reverse) entry.reverse = true;
    if (!anim.animate) entry.animate = false;
    entries[name] = entry;
    any = true;
  }
  return any ? entries : undefined;
}
