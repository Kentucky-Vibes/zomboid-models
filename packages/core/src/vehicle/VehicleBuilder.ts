/**
 * Builds the three.js object of one vehicle: the body and the models of its parts placed the
 * way `BaseVehicle.updateTransform` places them, with the game's vehicle shader on the body and
 * the wheel shader on the wheels.
 */
import {
  Euler,
  Group,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  type Mesh,
  type ShaderMaterial,
  type Texture,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

import type { AssetCache } from '../assets/AssetCache.js';
import { CharacterRig, type RigWarning } from '../character/CharacterRig.js';
import type {
  ManifestVehicle,
  ManifestVehicleModel,
  ManifestVehicleSkin,
  ScriptVector,
  VehicleCatalog,
} from '../format/manifest.js';
import type { VehicleDescription, VehiclePaint } from '../format/vehicle.js';
import { OutfitRng } from '../outfit/rng.js';

import {
  createVehicleMaterial,
  createWheelMaterial,
  emptyVehicleTexture,
  gradientSkyTexture,
  type VehicleLighting,
  type VehicleTextures,
} from './VehicleMaterial.js';
import { vehicleShaderState } from './VehicleState.js';

export const VEHICLE_KEY = 'vehicle';

export interface VehicleBuildContext {
  cache: AssetCache;
  catalog: VehicleCatalog;
  lighting?: VehicleLighting;
}

export interface BuiltVehicle {
  rig: CharacterRig;
  warnings: RigWarning[];
}

/** The script, skin, paint, and rust a vehicle description resolves to. */
export interface VehicleLook {
  vehicle: ManifestVehicle | undefined;
  skinIndex: number;
  skin: ManifestVehicleSkin | undefined;
  paint: VehiclePaint;
  rust: number;
  warnings: string[];
}

/**
 * `BaseVehicle.doVehicleColor`: five families of colours by weight (red, blue, pale yellow,
 * dark, and any hue), then the script's forced components.
 */
export function rollVehiclePaint(
  rng: OutfitRng,
  forced?: ManifestVehicle['forcedColor'],
): VehiclePaint {
  // The game draws a default colour first and then always replaces it; the two draws are kept
  // so the sequence of draws stays the same.
  rng.nextFloat(0, 0);
  rng.nextFloat(0.3, 0.6);
  let hue: number;
  let saturation: number;
  let value: number;
  const pick = rng.next(100);
  if (pick < 20) {
    hue = rng.nextFloat(0, 0.03);
    saturation = rng.nextFloat(0.85, 1);
    value = rng.nextFloat(0.55, 0.85);
  } else if (pick < 32) {
    hue = rng.nextFloat(0.55, 0.61);
    saturation = rng.nextFloat(0.85, 1);
    value = rng.nextFloat(0.65, 0.75);
  } else if (pick < 67) {
    hue = 0.15;
    saturation = rng.nextFloat(0, 0.1);
    value = rng.nextFloat(0.7, 0.8);
  } else if (pick < 89) {
    hue = rng.nextFloat(0, 1);
    saturation = rng.nextFloat(0, 0.1);
    value = rng.nextFloat(0.1, 0.25);
  } else {
    hue = rng.nextFloat(0, 1);
    saturation = rng.nextFloat(0.6, 0.75);
    value = rng.nextFloat(0.3, 0.7);
  }
  if (forced) {
    if (forced.hue > -1) hue = forced.hue;
    if (forced.saturation > -1) saturation = forced.saturation;
    if (forced.value > -1) value = forced.value;
  }
  return { hue, saturation, value };
}

/**
 * Picks what the document leaves open the way the game picks at spawn: the rust (none or full),
 * the paint, and the skin, all from the seed, in that order, so a seed stays stable whichever
 * of the three the document sets.
 */
export function resolveVehicleLook(
  catalog: VehicleCatalog,
  description: VehicleDescription,
): VehicleLook {
  const vehicle = catalog.vehicles[description.vehicle];
  const rng = new OutfitRng(description.seed ?? 0);
  const rolledRust = rng.next(2);
  const rolledPaint = rollVehiclePaint(rng, vehicle?.forcedColor);
  const skinCount = vehicle?.skins.length ?? 0;
  const rolledSkin = skinCount > 0 ? rng.next(skinCount) : 0;
  if (!vehicle) {
    return {
      vehicle: undefined,
      skinIndex: 0,
      skin: undefined,
      paint: description.paint ?? rolledPaint,
      rust: description.rust ?? rolledRust,
      warnings: [`vehicle "${description.vehicle}" is not in the catalog`],
    };
  }
  const warnings: string[] = [];
  let skinIndex = description.skin ?? rolledSkin;
  if (skinIndex >= skinCount) {
    warnings.push(
      `vehicle "${description.vehicle}" has ${skinCount} skins; skin ${skinIndex} is not one of them`,
    );
    skinIndex = 0;
  }
  const skin = vehicle.skins[skinIndex];
  if (!skin) warnings.push(`vehicle "${description.vehicle}" has no skin`);
  return {
    vehicle,
    skinIndex,
    skin,
    paint: description.paint ?? rolledPaint,
    rust: description.rust ?? rolledRust,
    warnings,
  };
}

/** One model of the vehicle with its transform in the renderer's frame. */
export interface PlacedVehicleModel {
  /** `body` for the vehicle's own model, else the part id. */
  key: string;
  part: string | undefined;
  model: ManifestVehicleModel;
  matrix: Matrix4;
}

const RAD = Math.PI / 180;

/** The Z mirror between the game's frame and the renderer's. */
const MIRROR = new Matrix4().makeScale(1, 1, -1);

function transform(
  translation: ScriptVector,
  rotateDegrees: ScriptVector,
  scale: ScriptVector,
  yzSign: 1 | -1,
): Matrix4 {
  const euler = new Euler(
    rotateDegrees[0] * RAD,
    rotateDegrees[1] * RAD * yzSign,
    rotateDegrees[2] * RAD * yzSign,
    'XYZ',
  );
  return new Matrix4().compose(
    new Vector3(...translation),
    new Quaternion().setFromEuler(euler),
    new Vector3(...scale),
  );
}

/** Conjugates a transform in the game's frame by the mirror, giving the renderer's transform. */
function toRendererFrame(gameMatrix: Matrix4): Matrix4 {
  return new Matrix4().copy(MIRROR).multiply(gameMatrix).multiply(MIRROR);
}

/** The scale of a model: the vehicle script's value times the model script's, mirrored on X when asked. */
function modelScale(model: ManifestVehicleModel): ScriptVector {
  const s = model.scale * model.modelScale;
  return [model.invertX ? -s : s, s, s];
}

/**
 * Places the body and the part models as `BaseVehicle.updateTransform` does: the body at the
 * script's offset with the vehicle and model scales, every part model relative to the vehicle
 * transform, and wheels at their wheel's offset. Parts the document marks missing are left out.
 */
export function placeVehicleModels(
  vehicle: ManifestVehicle,
  description: VehicleDescription,
): { placed: PlacedVehicleModel[]; warnings: string[] } {
  const placed: PlacedVehicleModel[] = [];
  const warnings: string[] = [];
  const body = vehicle.models[0];
  if (!body) return { placed, warnings: ['the vehicle script has no model'] };
  const scale = vehicle.modelScale;
  const offset: ScriptVector = [
    -body.offset[0] * scale,
    body.offset[1] * scale,
    body.offset[2] * scale,
  ];
  placed.push({
    key: 'body',
    part: undefined,
    model: body,
    matrix: toRendererFrame(transform(offset, body.rotate, modelScale(body), 1)),
  });
  const vehicleTransform = new Matrix4()
    .makeTranslation(...offset)
    .multiply(new Matrix4().makeScale(scale, scale, scale));

  for (const [id, part] of Object.entries(vehicle.parts)) {
    if (description.parts?.[id]?.missing === true) continue;
    const wheel =
      part.wheel === undefined ? undefined : vehicle.wheels.find((w) => w.id === part.wheel);
    if (part.wheel !== undefined && !wheel) {
      warnings.push(`part "${id}" sits on wheel "${part.wheel}", which the script does not define`);
      continue;
    }
    for (const model of part.models) {
      if (model.attachmentParent !== undefined && part.parent !== undefined) {
        warnings.push(`part "${id}": models placed on attachments are not drawn yet`);
        continue;
      }
      const local: ScriptVector = [-model.offset[0], model.offset[1], model.offset[2]];
      const scales = modelScale(model);
      let matrix: Matrix4;
      if (wheel) {
        matrix = new Matrix4()
          .copy(vehicleTransform)
          .multiply(
            new Matrix4().makeTranslation(-wheel.offset[0], wheel.offset[1], wheel.offset[2]),
          )
          .multiply(transform(local, model.rotate, scales, 1));
      } else {
        matrix = new Matrix4()
          .copy(vehicleTransform)
          .multiply(transform(local, model.rotate, scales, -1));
      }
      placed.push({ key: id, part: id, model, matrix: toRendererFrame(matrix) });
    }
  }
  return { placed, warnings };
}

async function loadTexture(
  context: VehicleBuildContext,
  key: string | undefined,
  what: string,
  rig: CharacterRig,
  fallback: () => Texture,
): Promise<Texture> {
  const file = key === undefined ? undefined : context.catalog.textures[key];
  if (file === undefined) {
    if (key !== undefined) {
      rig.warnings.push({
        code: 'missing-texture',
        message: `${what}: texture "${key}" is not in the catalog`,
      });
    }
    const texture = fallback();
    rig.ownTexture(texture);
    return texture;
  }
  return context.cache.loadTexture(file, true);
}

async function loadSkinTextures(
  context: VehicleBuildContext,
  skin: ManifestVehicleSkin | undefined,
  rig: CharacterRig,
): Promise<VehicleTextures> {
  const load = (key: string | undefined, what: string): Promise<Texture> =>
    loadTexture(context, key, what, rig, emptyVehicleTexture);
  return {
    shell: await load(skin?.texture, 'skin'),
    mask: await load(skin?.textureMask, 'mask'),
    lights: await load(skin?.textureLights, 'lights'),
    rust: await load(skin?.textureRust, 'rust'),
    damage1Overlay: await load(skin?.textureDamage1Overlay, 'blood mask'),
    damage1Shell: await load(skin?.textureDamage1Shell, 'damage 1'),
    damage2Overlay: await load(skin?.textureDamage2Overlay, 'blood'),
    damage2Shell: await load(skin?.textureDamage2Shell, 'damage 2'),
  };
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Partial<Mesh>).isMesh === true;
}

/** The meshes of a model file, or only the one the script names. */
function selectMeshes(root: Object3D, meshName: string | undefined): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (!isMesh(object)) return;
    if (meshName === undefined || object.name.toLowerCase() === meshName.toLowerCase()) {
      meshes.push(object);
    }
  });
  return meshes;
}

/** Builds the rig of one vehicle. */
export async function buildVehicle(
  context: VehicleBuildContext,
  description: VehicleDescription,
): Promise<BuiltVehicle> {
  const { cache, catalog } = context;
  const look = resolveVehicleLook(catalog, description);
  if (!look.vehicle) {
    throw new Error(look.warnings[0] ?? `cannot render vehicle "${description.vehicle}"`);
  }
  const rig = CharacterRig.empty();
  for (const warning of look.warnings) {
    rig.warnings.push({ code: 'missing-item', message: warning });
  }
  const state = vehicleShaderState(look.vehicle, description, look.rust);
  const textures = await loadSkinTextures(context, look.skin, rig);
  const reflection = gradientSkyTexture();
  rig.ownTexture(reflection);
  const materialOptions = context.lighting ? { lighting: context.lighting } : {};
  const bodyMaterial = createVehicleMaterial(
    textures,
    reflection,
    look.paint,
    state,
    materialOptions,
  );
  let noRandomMaterial: ShaderMaterial | undefined;
  const wheelMaterials = new Map<string, ShaderMaterial>();

  const { placed, warnings } = placeVehicleModels(look.vehicle, description);
  for (const warning of warnings) rig.warnings.push({ code: 'missing-model', message: warning });
  const group = new Group();
  group.name = VEHICLE_KEY;
  for (const item of placed) {
    const entry = catalog.models[item.model.model];
    if (!entry) {
      rig.warnings.push({
        code: 'missing-model',
        message: `catalog has no model "${item.model.model}" for ${item.key}`,
      });
      continue;
    }
    const gltf = await cache.loadGltf(entry.file);
    const scene = cloneSkeleton(gltf.scene);
    scene.updateMatrixWorld(true);
    const meshes = selectMeshes(scene, item.model.mesh);
    if (meshes.length === 0) {
      rig.warnings.push({
        code: 'missing-model',
        message: `model "${item.model.model}" has no mesh "${item.model.mesh ?? ''}" for ${item.key}`,
      });
      continue;
    }
    const shader = item.model.shader?.toLowerCase() ?? 'vehicle';
    let material: ShaderMaterial;
    if (shader.startsWith('vehicle') && shader !== 'vehiclewheel') {
      if (shader.includes('norandom')) {
        noRandomMaterial ??= createVehicleMaterial(textures, reflection, look.paint, state, {
          ...materialOptions,
          noRandom: true,
        });
        material = noRandomMaterial;
      } else {
        material = bodyMaterial;
      }
    } else {
      const key = item.model.texture ?? '';
      let wheel = wheelMaterials.get(key);
      if (!wheel) {
        const texture = await loadTexture(
          context,
          item.model.texture,
          item.key,
          rig,
          emptyVehicleTexture,
        );
        wheel = createWheelMaterial(texture, context.lighting);
        wheelMaterials.set(key, wheel);
      }
      material = wheel;
    }
    const holder = new Object3D();
    holder.name = item.key;
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(item.matrix);
    for (const mesh of meshes) {
      const local = mesh.matrixWorld.clone();
      mesh.removeFromParent();
      holder.add(mesh);
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.material = material;
      mesh.frustumCulled = false;
    }
    group.add(holder);
  }
  rig.addObject(group);
  return { rig, warnings: rig.warnings };
}
