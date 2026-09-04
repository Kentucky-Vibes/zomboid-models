import { describe, expect, it } from 'vitest';

import { approxEqual, compose, decompose, multiply } from '../src/math/matrix.js';
import { buildAnimationClips } from '../src/x/anim.js';
import { buildMeshData } from '../src/x/mesh.js';
import {
  mirrorAttachmentZ,
  mirrorClipsZ,
  mirrorMatrixZ,
  mirrorMeshDataZ,
  mirrorSkeletonZ,
} from '../src/x/mirror.js';
import { parseX } from '../src/x/parser.js';
import { collectMeshes, collectSkeleton, worldTransforms } from '../src/x/skeleton.js';
import { SIMPLE_ANIMATION, SKINNED_QUAD } from './fixtures/x.js';

const DUMMY01 = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

describe('mirrorMatrixZ', () => {
  it('turns a rotation into its mirror image and flips the Z translation', () => {
    const mirrored = mirrorMatrixZ([...DUMMY01.slice(0, 12), 1, 2, 3, 1]);
    expect(mirrored).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 1, 2, -3, 1]);
    const q = decompose(mirrored).rotation;
    const s = Math.SQRT1_2;
    expect(approxEqual(q, [s, 0, 0, s])).toBe(true);
  });

  it('is an involution and respects products', () => {
    const a = [...DUMMY01.slice(0, 12), 1, 2, 3, 1];
    const b = compose({ translation: [0, 1, 0], rotation: [0, 0.383, 0, 0.924], scale: [1, 1, 1] });
    expect(mirrorMatrixZ(mirrorMatrixZ(a))).toEqual(a);
    expect(
      approxEqual(mirrorMatrixZ(multiply(a, b)), multiply(mirrorMatrixZ(a), mirrorMatrixZ(b))),
    ).toBe(true);
  });
});

describe('mirrorMeshDataZ', () => {
  it('flips z of positions and normals, reverses winding, and mirrors inverse binds', () => {
    const file = parseX(SKINNED_QUAD);
    const mesh = collectMeshes(file.frames)[0]?.mesh;
    if (!mesh) throw new Error('fixture has no mesh');
    const data = mirrorMeshDataZ(buildMeshData(mesh, file.materials));
    expect(Array.from(data.positions.slice(0, 6))).toEqual([0, 0, 0, 1, 0, 0]);
    expect(Array.from(data.normals?.slice(0, 3) ?? [])).toEqual([0, 0, -1]);
    expect(Array.from(data.indices)).toEqual([0, 2, 1, 0, 3, 2]);
    expect(data.skin?.bones[1]?.inverseBind[13]).toBe(-0.5);
  });
});

describe('mirrorSkeletonZ', () => {
  it('keeps the hierarchy consistent under the mirror', () => {
    const file = parseX(SKINNED_QUAD);
    const original = worldTransforms(collectSkeleton(file.frames));
    const mirrored = worldTransforms(mirrorSkeletonZ(collectSkeleton(file.frames)));
    original.forEach((world, i) => {
      expect(approxEqual(mirrored[i] as number[], mirrorMatrixZ(world))).toBe(true);
    });
  });
});

describe('mirrorClipsZ', () => {
  it('conjugates rotations and flips translation z', () => {
    const [clip] = mirrorClipsZ(buildAnimationClips(parseX(SIMPLE_ANIMATION)));
    const track = clip?.tracks[0];
    const rotation = Array.from(track?.rotation?.values.slice(4, 8) ?? []);
    const s = Math.SQRT1_2;
    expect(rotation.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([
      Math.round(s * 1e6) / 1e6,
      0,
      0,
      Math.round(s * 1e6) / 1e6,
    ]);
    expect(Array.from(track?.translation?.values.slice(3, 6) ?? [])).toEqual([
      0,
      expect.closeTo(0.1, 5),
      0,
    ]);
    expect(Array.from(track?.scale?.values ?? [])).toEqual([1, 1, 1]);
  });
});

describe('mirrorAttachmentZ', () => {
  it('flips the offset z and the x and y angles', () => {
    expect(
      mirrorAttachmentZ({ bone: 'B', offset: [1, 2, 3], rotate: [10, 20, 30], scale: 2 }),
    ).toEqual({
      bone: 'B',
      offset: [1, 2, -3],
      rotate: [-10, -20, 30],
      scale: 2,
    });
  });
});
