import {
  AnimationClip,
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Object3D,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three';
import { describe, expect, it } from 'vitest';

import type { ManifestVehicle, ManifestVehicleAnim, VehicleCatalog } from '../format/manifest.js';
import type { VehicleDescription } from '../format/vehicle.js';

import { VehicleRig, animRestTime } from './VehicleRig.js';

const HOOD_ANIMS: Record<string, ManifestVehicleAnim> = {
  Close: { anim: 'Hood_closing', rate: 2.5 },
  Open: { anim: 'Hood_closing', reverse: true, rate: 2 },
  Closed: { anim: 'Hood_closing', reverse: true, animate: false },
  Opened: { anim: 'Hood_closing', animate: false },
};

const CAR: ManifestVehicle = {
  models: [{ model: 'car', modelScale: 0.01, scale: 1, offset: [0, 0, 0], rotate: [0, 0, 0] }],
  modelScale: 1,
  extents: [1, 1, 2],
  skins: [{ texture: 'shell' }],
  wheels: [],
  parts: {
    EngineDoor: {
      models: [{ model: 'car', modelScale: 0.01, scale: 1, offset: [0, 0, 0], rotate: [0, 0, 0] }],
      door: true,
      anims: HOOD_ANIMS,
    },
  },
};

const CATALOG: VehicleCatalog = { models: {}, textures: {}, vehicles: { 'Base.Car': CAR } };

function doc(open?: boolean): VehicleDescription {
  return {
    format: 'zomboid-models/vehicle',
    version: 1,
    vehicle: 'Base.Car',
    ...(open === undefined ? {} : { parts: { EngineDoor: { open } } }),
  };
}

/** A hood on one bone: the closing clip turns the bone from 90 degrees about X to none in one second. */
function hoodModel(): { root: Object3D; bone: Bone; clip: AnimationClip } {
  const root = new Object3D();
  const bone = new Bone();
  bone.name = 'Hood_bone';
  root.add(bone);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(12).fill(0), 4));
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const mesh = new SkinnedMesh(geometry);
  mesh.name = 'Hood_mesh';
  root.add(mesh);
  mesh.bind(new Skeleton([bone]));
  const half = Math.SQRT1_2;
  const clip = new AnimationClip('Hood_closing', 1, [
    new QuaternionKeyframeTrack('Hood_bone.quaternion', [0, 1], [half, 0, 0, half, 0, 0, 0, 1]),
  ]);
  return { root, bone, clip };
}

function rigWith(description: VehicleDescription): { rig: VehicleRig; bone: Bone } {
  const rig = new VehicleRig();
  rig.vehicle = CAR;
  rig.description = description;
  rig.look = {
    vehicle: CAR,
    skinIndex: 0,
    skin: CAR.skins[0],
    paint: { hue: 0, saturation: 0, value: 0.5 },
    rust: 0,
    warnings: [],
  };
  const { root, bone, clip } = hoodModel();
  rig.addObject(root);
  expect(rig.addPartMotion('EngineDoor', root, [clip], HOOD_ANIMS)).toEqual([]);
  return { rig, bone };
}

describe('animRestTime', () => {
  it('holds the first frame in playback direction for a still anim', () => {
    expect(animRestTime({ anim: 'x', animate: false }, 2)).toBe(0);
    expect(animRestTime({ anim: 'x', reverse: true, animate: false }, 2)).toBe(2);
  });

  it('ends on the last frame in playback direction for a played anim', () => {
    expect(animRestTime({ anim: 'x' }, 2)).toBe(2);
    expect(animRestTime({ anim: 'x', reverse: true }, 2)).toBe(0);
  });
});

describe('VehicleRig hinged parts', () => {
  it('holds a part closed by default and open when the description says so', () => {
    const closed = rigWith(doc());
    expect(closed.bone.quaternion.w).toBeCloseTo(1);
    expect(closed.rig.partsMoving).toBe(false);
    expect(closed.rig.animated).toBe(false);
    const open = rigWith(doc(true));
    expect(open.bone.quaternion.x).toBeCloseTo(Math.SQRT1_2);
  });

  it('swings a part when its state changes, at the script rate and direction', () => {
    const { rig, bone } = rigWith(doc(false));
    rig.applyDescription(doc(true), CATALOG);
    expect(rig.partsMoving).toBe(true);
    expect(rig.animated).toBe(true);
    // Opening runs the closing clip backwards at rate 2: a quarter second covers half the clip.
    rig.update(0.25);
    expect(bone.quaternion.x).toBeGreaterThan(0.1);
    expect(bone.quaternion.x).toBeLessThan(Math.SQRT1_2 - 0.05);
    rig.update(1);
    expect(bone.quaternion.x).toBeCloseTo(Math.SQRT1_2);
    expect(rig.partsMoving).toBe(false);
    rig.applyDescription(doc(false), CATALOG);
    rig.update(0.2);
    expect(bone.quaternion.x).toBeGreaterThan(0.05);
    rig.update(1);
    expect(bone.quaternion.w).toBeCloseTo(1);
    expect(rig.partsMoving).toBe(false);
  });

  it('reports the clips a model lacks', () => {
    const rig = new VehicleRig();
    rig.vehicle = CAR;
    rig.description = doc();
    const { root } = hoodModel();
    expect(rig.addPartMotion('EngineDoor', root, [], HOOD_ANIMS)).toEqual(['Hood_closing']);
    expect(rig.partsMoving).toBe(false);
  });
});
