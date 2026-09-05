import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { characterShadowParams, SHADOW_FALLBACK } from './shadow.js';

function rigWithBones(positions: Record<string, [number, number, number]>): {
  rig: Object3D;
  bones: Map<string, Object3D>;
} {
  const rig = new Object3D();
  const bones = new Map<string, Object3D>();
  for (const [name, position] of Object.entries(positions)) {
    const bone = new Object3D();
    bone.position.set(...position);
    rig.add(bone);
    bones.set(name, bone);
  }
  rig.updateMatrixWorld(true);
  return { rig, bones };
}

describe('characterShadowParams', () => {
  it('pads and stretches the farthest reach of the head and feet along the facing axis', () => {
    const { rig, bones } = rigWithBones({
      Bip01_Head: [0, 1.6, 0.1],
      Bip01_L_Foot: [-0.1, 0, -0.05],
      Bip01_R_Foot: [0.1, 0, 0.02],
    });
    const params = characterShadowParams(bones, rig, 1.5);
    expect(params.w).toBe(0.45);
    expect(params.fm).toBeCloseTo((0.15 + 0.35) * 1.35, 5);
    expect(params.bm).toBeCloseTo((0.075 + 0.35) * 1.35, 5);
  });

  it('stretches along the body of a lying character', () => {
    const { rig, bones } = rigWithBones({
      Bip01_Head: [0, 0.2, 0.9],
      Bip01_L_Foot: [0, 0.1, -0.6],
      Bip01_R_Foot: [0, 0.1, -0.55],
    });
    const params = characterShadowParams(bones, rig, 1);
    expect(params.fm).toBeCloseTo((0.9 + 0.35) * 1.35, 5);
    expect(params.bm).toBeCloseTo((0.6 + 0.35) * 1.35, 5);
  });

  it('falls back to the game defaults without the bones', () => {
    const { rig, bones } = rigWithBones({ Bip01_Pelvis: [0, 1, 0] });
    expect(characterShadowParams(bones, rig, 1.5)).toEqual(SHADOW_FALLBACK);
  });
});
