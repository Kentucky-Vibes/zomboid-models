import { IDENTITY, multiply, type Mat4 } from '../math/matrix.js';
import type { XFrame, XMesh } from './types.js';

export interface XBone {
  name: string;
  /** Index of the parent bone, or -1 for a root. */
  parent: number;
  /** Transform relative to the parent, 16 numbers in file order. */
  local: Mat4;
}

export interface XSkeleton {
  bones: XBone[];
  index: ReadonlyMap<string, number>;
}

export interface PlacedMesh {
  mesh: XMesh;
  /** Name of the frame that holds the mesh, when it has one. */
  frame: string | undefined;
  /** Transform of the frame relative to the file root, 16 numbers in file order. */
  world: Mat4;
}

/**
 * Flattens the frame tree into a bone list in depth-first order, so that every parent comes
 * before its children. Frames without a name get a generated one.
 */
export function collectSkeleton(frames: readonly XFrame[]): XSkeleton {
  const bones: XBone[] = [];
  const index = new Map<string, number>();
  let unnamed = 0;

  const visit = (frame: XFrame, parent: number): void => {
    const name = frame.name ?? `frame_${unnamed++}`;
    if (index.has(name)) {
      throw new Error(`duplicate frame name "${name}"`);
    }
    const id = bones.length;
    index.set(name, id);
    bones.push({ name, parent, local: frame.transform ? [...frame.transform] : [...IDENTITY] });
    for (const child of frame.frames) visit(child, id);
  };
  for (const frame of frames) visit(frame, -1);

  return { bones, index };
}

/** Returns bone transforms relative to the file root, in bone order. */
export function worldTransforms(skeleton: XSkeleton): Mat4[] {
  const world: Mat4[] = [];
  for (const bone of skeleton.bones) {
    const parentWorld = bone.parent >= 0 ? (world[bone.parent] as Mat4) : [...IDENTITY];
    world.push(multiply(bone.local, parentWorld));
  }
  return world;
}

/** Lists every mesh in the frame tree together with the world transform of its frame. */
export function collectMeshes(
  frames: readonly XFrame[],
  looseMeshes: readonly XMesh[] = [],
): PlacedMesh[] {
  const placed: PlacedMesh[] = looseMeshes.map((mesh) => ({
    mesh,
    frame: undefined,
    world: [...IDENTITY],
  }));

  const visit = (frame: XFrame, parentWorld: Mat4): void => {
    const world = frame.transform ? multiply(frame.transform, parentWorld) : parentWorld;
    for (const mesh of frame.meshes) placed.push({ mesh, frame: frame.name, world });
    for (const child of frame.frames) visit(child, world);
  };
  for (const frame of frames) visit(frame, [...IDENTITY]);

  return placed;
}
