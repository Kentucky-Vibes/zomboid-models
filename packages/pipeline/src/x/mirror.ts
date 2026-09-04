/**
 * The game's .x files use DirectX's left-handed space. glTF is right-handed, so every converted
 * asset is mirrored across the XY plane (Z negated). After that a character faces +Z and text on
 * textures reads the way it does in the game.
 */

import type { Mat4 } from '../math/matrix.js';
import type { AnimationClipData } from './anim.js';
import type { MeshData } from './mesh.js';
import type { XSkeleton } from './skeleton.js';

const Z = 2;

/** Negates a number without producing negative zero. */
function neg(value: number): number {
  return value === 0 ? 0 : -value;
}

/** Conjugates a row-vector matrix by the Z mirror: entries with exactly one Z index flip sign. */
export function mirrorMatrixZ(m: readonly number[]): Mat4 {
  const out = new Array<number>(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const value = m[row * 4 + col] as number;
      out[row * 4 + col] = (row === Z) !== (col === Z) ? neg(value) : value;
    }
  }
  return out;
}

/** Mirrors positions, normals, and inverse bind matrices, and reverses triangle winding. */
export function mirrorMeshDataZ(data: MeshData): MeshData {
  for (let i = Z; i < data.positions.length; i += 3) {
    data.positions[i] = neg(data.positions[i] as number);
  }
  if (data.normals) {
    for (let i = Z; i < data.normals.length; i += 3) {
      data.normals[i] = neg(data.normals[i] as number);
    }
  }
  for (let i = 0; i + 2 < data.indices.length; i += 3) {
    const b = data.indices[i + 1] as number;
    data.indices[i + 1] = data.indices[i + 2] as number;
    data.indices[i + 2] = b;
  }
  if (data.skin) {
    for (const bone of data.skin.bones) bone.inverseBind = mirrorMatrixZ(bone.inverseBind);
  }
  return data;
}

/** Mirrors every bone's local transform. */
export function mirrorSkeletonZ(skeleton: XSkeleton): XSkeleton {
  for (const bone of skeleton.bones) bone.local = mirrorMatrixZ(bone.local);
  return skeleton;
}

/** Mirrors translation keys and conjugates rotation keys; scale keys are unchanged. */
export function mirrorClipsZ(clips: AnimationClipData[]): AnimationClipData[] {
  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (track.translation) {
        const values = track.translation.values;
        for (let i = Z; i < values.length; i += 3) values[i] = neg(values[i] as number);
      }
      if (track.rotation) {
        const values = track.rotation.values;
        for (let i = 0; i + 3 < values.length; i += 4) {
          values[i] = neg(values[i] as number);
          values[i + 1] = neg(values[i + 1] as number);
        }
      }
    }
  }
  return clips;
}

/**
 * Mirrors an attachment declared in game space: the offset's Z flips, and of the X-Y-Z Euler
 * angles the X and Y ones flip sign.
 */
export function mirrorAttachmentZ<
  T extends { offset: [number, number, number]; rotate: [number, number, number] },
>(attachment: T): T {
  return {
    ...attachment,
    offset: [attachment.offset[0], attachment.offset[1], neg(attachment.offset[2])],
    rotate: [neg(attachment.rotate[0]), neg(attachment.rotate[1]), attachment.rotate[2]],
  };
}
