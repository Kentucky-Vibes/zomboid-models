/**
 * The blob shadows the game draws under characters, animals, and vehicles: a soft dark texture
 * on the ground, sized from the pose (`IsoGameCharacter.calculateShadowParams`) or from the
 * vehicle script (`BaseVehicle.initShadowPoly`).
 */
import {
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';

/** Half the width of a character's shadow, in world units; the game uses one width for all. */
export const SHADOW_HALF_WIDTH = 0.45;

/** The shadow the game draws when it has no animation player to measure. */
export const SHADOW_FALLBACK: ShadowParams = { w: 0.45, fm: 1.4, bm: 1.125 };

/** The alpha of a vehicle's shadow in full light: `0.6 * 0.8`. */
export const VEHICLE_SHADOW_OPACITY = 0.48;

/** Half width, and the reach in front of and behind the origin, in world units. */
export interface ShadowParams {
  w: number;
  fm: number;
  bm: number;
}

const SHADOW_BONES = ['Bip01_Head', 'Bip01_L_Foot', 'Bip01_R_Foot'];
const SHADOW_MARGIN = 0.35;
const SHADOW_STRETCH = 1.35;

/**
 * `calculateShadowParams`: the head and both feet, in world units around the character's
 * origin, projected onto the facing axis; the farthest forward and backward reach, padded and
 * stretched. `forward` is the facing direction in the rig's own space.
 */
export function characterShadowParams(
  bones: ReadonlyMap<string, Object3D>,
  rig: Object3D,
  worldScale: number,
  forward = new Vector3(0, 0, 1),
): ShadowParams {
  const axis = forward.clone().setY(0).normalize();
  let fLen = 0;
  let bLen = 0;
  let found = 0;
  const point = new Vector3();
  for (const name of SHADOW_BONES) {
    const bone = bones.get(name);
    if (!bone) continue;
    found++;
    bone.getWorldPosition(point);
    rig.worldToLocal(point);
    point.y = 0;
    point.multiplyScalar(worldScale);
    // The closest point on the facing line through the origin; its distance and side.
    const along = point.dot(axis);
    const cLen = Math.abs(along);
    if (cLen <= 0.001) continue;
    if (along > 0) fLen = Math.max(fLen, cLen);
    else bLen = Math.max(bLen, cLen);
  }
  if (found === 0) return { ...SHADOW_FALLBACK };
  return {
    w: SHADOW_HALF_WIDTH,
    fm: (fLen + SHADOW_MARGIN) * SHADOW_STRETCH,
    bm: (bLen + SHADOW_MARGIN) * SHADOW_STRETCH,
  };
}

function shadowMaterial(texture: Texture, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function flatQuad(material: MeshBasicMaterial, name: string): Mesh {
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  mesh.name = name;
  mesh.userData['excludeFromBounds'] = true;
  return mesh;
}

/**
 * A character's shadow quad in the rig's own units: `w` wide to each side, from `bm` behind the
 * origin to `fm` in front along the facing axis, lying on the ground height given.
 */
export function createCharacterShadow(
  texture: Texture,
  params: ShadowParams,
  worldScale: number,
  groundY: number,
): Mesh {
  const mesh = flatQuad(shadowMaterial(texture, 1), 'shadow');
  mesh.scale.set((2 * params.w) / worldScale, (params.fm + params.bm) / worldScale, 1);
  mesh.position.set(0, groundY + 0.002 / worldScale, (params.fm - params.bm) / 2 / worldScale);
  return mesh;
}

/**
 * A vehicle's shadow quad from the script's shadow extents and offset (script units, scaled by
 * the model scale), in the vehicle rig's frame, where the front lies along -Z.
 */
export function createVehicleShadow(
  texture: Texture,
  extents: readonly [number, number],
  offset: readonly [number, number],
  modelScale: number,
  groundY: number,
): Mesh {
  const mesh = flatQuad(shadowMaterial(texture, VEHICLE_SHADOW_OPACITY), 'shadow');
  mesh.scale.set(extents[0] * modelScale, extents[1] * modelScale, 1);
  mesh.position.set(-offset[0] * modelScale, groundY + 0.002, -offset[1] * modelScale);
  return mesh;
}
