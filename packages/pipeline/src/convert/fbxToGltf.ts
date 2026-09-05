/**
 * Converts the game's FBX meshes (binary and ASCII) to GLB through the three.js FBX loader,
 * running in Node with the few browser globals the loader touches stubbed out.
 *
 * The game imports FBX through Assimp and then flips the scene to its left-handed space. FBX
 * files are right-handed to begin with, so, unlike the `.x` files, they are written to glTF as
 * they are: what the game shows in its left-handed frame is what the raw data shows in a
 * right-handed one. Node transforms are baked into the vertices, so the GLB is a flat list of
 * named meshes, which is what the game's `mesh = file|MeshName` references select from.
 *
 * Skinned meshes (the three cars whose doors, hood, and trunk hang on bones) keep their skins:
 * the bones become nodes at rest in the closed state, the game's `<part>_closing` clips become
 * glTF animations, and the mesh vertices are baked into the bind space so that the bones' inverse
 * bind matrices apply as they are.
 */
import {
  Box3,
  Matrix3,
  type Matrix4,
  Vector3,
  type AnimationClip,
  type BufferGeometry,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

import {
  GL_ARRAY_BUFFER,
  GL_ELEMENT_ARRAY_BUFFER,
  GltfBuilder,
  type GltfAnimationChannel,
  type GltfAnimationSampler,
  type GltfNode,
  type GltfPrimitive,
} from '../gltf/glb.js';
import { decompose } from '../math/matrix.js';
import type { MeshConversionResult } from './meshToGltf.js';

/** The browser globals the FBX loader reaches for while parsing; images are never loaded. */
function installBrowserStubs(): void {
  const g = globalThis as Record<string, unknown>;
  if (g['window'] === undefined) g['window'] = globalThis;
  if (g['self'] === undefined) g['self'] = globalThis;
  if (g['document'] === undefined) {
    const element = (): Record<string, unknown> => ({
      style: {},
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      getContext: () => null,
    });
    g['document'] = { createElementNS: element, createElement: element };
  }
}

function attribute(geometry: BufferGeometry, name: string): Float32Array | undefined {
  const attr = geometry.getAttribute(name);
  if (!attr) return undefined;
  return attr.array instanceof Float32Array
    ? attr.array
    : Float32Array.from(attr.array as ArrayLike<number>);
}

function isMeshObject(object: Object3D): object is Mesh {
  return (object as { isMesh?: boolean }).isMesh === true;
}

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return (object as { isSkinnedMesh?: boolean }).isSkinnedMesh === true;
}

interface FlatMesh {
  name: string;
  positions: Float32Array;
  normals: Float32Array | undefined;
  uvs: Float32Array | undefined;
  uvs2: Float32Array | undefined;
  indices: Uint32Array;
  materialName: string;
  /** Joint indices and weights, for skinned meshes. */
  joints: Uint16Array | undefined;
  weights: Float32Array | undefined;
}

/**
 * Bakes a transform into the geometry and flips V to glTF's top-left origin. Static meshes
 * take their world matrix; skinned meshes take the bind matrix, so that the bones' inverse bind
 * matrices, which are relative to the bind world, apply as they are.
 */
function flatten(mesh: Mesh, warnings: string[]): FlatMesh | undefined {
  const geometry = mesh.geometry;
  const positionsIn = attribute(geometry, 'position');
  if (!positionsIn) return undefined;
  const count = positionsIn.length / 3;
  const skinned = isSkinnedMesh(mesh);
  const matrix = skinned ? mesh.bindMatrix : mesh.matrixWorld;
  const normalMatrix = new Matrix3().getNormalMatrix(matrix);
  const positions = new Float32Array(count * 3);
  const normalsIn = attribute(geometry, 'normal');
  const normals =
    normalsIn && normalsIn.length === count * 3 ? new Float32Array(count * 3) : undefined;
  const point = new Vector3();
  for (let i = 0; i < count; i++) {
    point.set(positionsIn[i * 3] ?? 0, positionsIn[i * 3 + 1] ?? 0, positionsIn[i * 3 + 2] ?? 0);
    point.applyMatrix4(matrix);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
    if (normals && normalsIn) {
      point.set(normalsIn[i * 3] ?? 0, normalsIn[i * 3 + 1] ?? 0, normalsIn[i * 3 + 2] ?? 0);
      point.applyNormalMatrix(normalMatrix);
      normals[i * 3] = point.x;
      normals[i * 3 + 1] = point.y;
      normals[i * 3 + 2] = point.z;
    }
  }
  const flipUvs = (input: Float32Array | undefined): Float32Array | undefined => {
    if (!input || input.length !== count * 2) return undefined;
    const out = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      out[i * 2] = input[i * 2] ?? 0;
      out[i * 2 + 1] = 1 - (input[i * 2 + 1] ?? 0);
    }
    return out;
  };
  const uvs = flipUvs(attribute(geometry, 'uv'));
  // Vehicles carry a second set for the rust and damage atlases.
  const uvs2 = flipUvs(attribute(geometry, 'uv1'));
  const index = geometry.getIndex();
  const indices = index
    ? Uint32Array.from(index.array as ArrayLike<number>)
    : Uint32Array.from({ length: count }, (_, i) => i);
  // A mirrored transform reverses the winding; keep front faces facing out.
  if (matrix.determinant() < 0) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i] as number;
      indices[i] = indices[i + 2] as number;
      indices[i + 2] = a;
    }
  }
  let joints: Uint16Array | undefined;
  let weights: Float32Array | undefined;
  if (skinned) {
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');
    if (skinIndex && skinWeight && skinIndex.itemSize === 4 && skinWeight.itemSize === 4) {
      joints = Uint16Array.from(skinIndex.array as ArrayLike<number>);
      weights = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        let total = 0;
        for (let j = 0; j < 4; j++) total += skinWeight.getComponent(i, j);
        for (let j = 0; j < 4; j++) {
          weights[i * 4 + j] = total > 0 ? skinWeight.getComponent(i, j) / total : j === 0 ? 1 : 0;
        }
      }
    } else {
      warnings.push(`${mesh.name}: skinned without four influences per vertex; written static`);
    }
  }
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (Array.isArray(mesh.material) && mesh.material.length > 1) {
    warnings.push(`${mesh.name}: ${mesh.material.length} materials merged into one`);
  }
  return {
    name: mesh.name,
    positions,
    normals,
    uvs,
    uvs2,
    indices,
    materialName: material?.name ?? 'default',
    joints,
    weights,
  };
}

/**
 * Puts hinged parts in their closed state: for every `<part>_closing` clip, the bone
 * `<part>_bone` takes the clip's last frame, which is how the game holds a closed door, hood,
 * or trunk. Returns the parts posed.
 */
export function applyClosedPose(group: Object3D): string[] {
  const posed: string[] = [];
  for (const clip of group.animations) {
    const match = /^(.+)_closing$/i.exec(clip.name);
    if (!match) continue;
    const part = match[1] as string;
    const bone = group.getObjectByName(`${part}_bone`) ?? group.getObjectByName(part);
    if (!bone) continue;
    let applied = false;
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      if (track.name.slice(0, dot) !== bone.name) continue;
      const size = track.getValueSize();
      const last = track.values.length - size;
      if (last < 0) continue;
      switch (track.name.slice(dot + 1)) {
        case 'position':
          bone.position.fromArray(track.values, last);
          break;
        case 'quaternion':
          bone.quaternion.fromArray(track.values, last);
          break;
        case 'scale':
          bone.scale.fromArray(track.values, last);
          break;
        default:
          continue;
      }
      applied = true;
    }
    if (applied) posed.push(part);
  }
  if (posed.length > 0) group.updateMatrixWorld(true);
  return posed;
}

/** Parses an FBX file with the three.js loader; the buffer may hold the binary or ASCII form. */
export function parseFbx(data: Uint8Array): Object3D {
  installBrowserStubs();
  const array = new ArrayBuffer(data.byteLength);
  new Uint8Array(array).set(data);
  const group = new FBXLoader().parse(array, '');
  group.updateMatrixWorld(true);
  return group;
}

/** The clips a vehicle needs: the closing animation of each hinged part, by the game's name. */
function partClips(group: Object3D): AnimationClip[] {
  return group.animations.filter((clip) => /_closing$/i.test(clip.name));
}

/**
 * Writes every node of the hierarchy that a skin or a clip refers to, with its rest transform,
 * and returns the node index by object. Nodes are written whole subtrees from their roots so
 * that a bone's parents carry their transforms.
 */
function addBoneNodes(
  builder: GltfBuilder,
  group: Object3D,
  roots: Object3D[],
): Map<Object3D, number> {
  const ids = new Map<Object3D, number>();
  const visit = (object: Object3D): number => {
    const known = ids.get(object);
    if (known !== undefined) return known;
    const trs = decompose(object.matrix.toArray());
    const node: GltfNode = {
      name: object.name,
      translation: trs.translation,
      rotation: trs.rotation,
      scale: trs.scale,
    };
    const id = builder.addNode(node);
    ids.set(object, id);
    for (const child of object.children) {
      if (isMeshObject(child)) continue;
      const childId = visit(child);
      (node.children ??= []).push(childId);
    }
    return id;
  };
  for (const root of roots) {
    let top = root;
    while (top.parent && top.parent !== group) top = top.parent;
    const id = visit(top);
    if (top.parent === group && !ids.has(group)) builder.addSceneNode(id);
  }
  return ids;
}

/** The bone roots a skinned mesh's skeleton hangs from: the ancestors of its bones under the group. */
function skeletonRoots(group: Object3D, meshes: SkinnedMesh[]): Object3D[] {
  const roots = new Set<Object3D>();
  for (const mesh of meshes) {
    for (const bone of mesh.skeleton.bones) {
      let top: Object3D = bone;
      while (top.parent && top.parent !== group) top = top.parent;
      roots.add(top);
    }
  }
  return [...roots];
}

function addClips(
  builder: GltfBuilder,
  clips: AnimationClip[],
  nodeOf: (name: string) => number | undefined,
  warnings: string[],
): number {
  let written = 0;
  for (const clip of clips) {
    const samplers: GltfAnimationSampler[] = [];
    const channels: GltfAnimationChannel[] = [];
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const node = nodeOf(track.name.slice(0, dot));
      const property = track.name.slice(dot + 1);
      const path =
        property === 'position'
          ? 'translation'
          : property === 'quaternion'
            ? 'rotation'
            : property === 'scale'
              ? 'scale'
              : undefined;
      if (node === undefined || path === undefined) continue;
      const type = path === 'rotation' ? 'VEC4' : 'VEC3';
      const input = builder.addAccessor(Float32Array.from(track.times), 'SCALAR', {
        minMax: true,
      });
      const output = builder.addAccessor(Float32Array.from(track.values), type);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node, path } });
    }
    if (channels.length === 0) {
      warnings.push(`clip "${clip.name}" targets no exported node; dropped`);
      continue;
    }
    builder.addAnimation(clip.name, samplers, channels);
    written++;
  }
  return written;
}

/**
 * Converts every mesh of an FBX file to one GLB: static meshes baked, skinned meshes with their
 * bones at rest in the closed state and the closing clips as animations.
 */
export function convertFbxFile(data: Uint8Array, generator?: string): MeshConversionResult {
  const warnings: string[] = [];
  const group = parseFbx(data);
  applyClosedPose(group);
  const builder = new GltfBuilder(generator);
  const meshes: MeshConversionResult['meshes'] = [];
  const materials = new Map<string, number>();
  const bounds = new Box3();

  const skinnedMeshes: SkinnedMesh[] = [];
  group.traverse((object) => {
    if (isSkinnedMesh(object)) skinnedMeshes.push(object);
  });
  const nodeIds =
    skinnedMeshes.length > 0
      ? addBoneNodes(builder, group, skeletonRoots(group, skinnedMeshes))
      : new Map<Object3D, number>();
  // A name can repeat down a chain of nodes (a bone, its pivot, its tip). The clips address
  // nodes by name, and a player binds a name to the first node in traversal order, the way
  // three.js did when it posed the file here; the channels must point at that same node.
  const nodeByName = new Map<string, number>();
  for (const [object, id] of nodeIds) {
    if (!nodeByName.has(object.name)) nodeByName.set(object.name, id);
  }

  group.traverse((object) => {
    if (!isMeshObject(object)) return;
    const flat = flatten(object, warnings);
    if (!flat) return;
    let material = materials.get(flat.materialName);
    if (material === undefined) {
      material = builder.addMaterial({
        name: flat.materialName,
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        alphaMode: 'MASK',
        alphaCutoff: 0.5,
      });
      materials.set(flat.materialName, material);
    }
    const attributes: Record<string, number> = {
      POSITION: builder.addAccessor(flat.positions, 'VEC3', {
        target: GL_ARRAY_BUFFER,
        minMax: true,
      }),
    };
    if (flat.normals) {
      attributes['NORMAL'] = builder.addAccessor(flat.normals, 'VEC3', { target: GL_ARRAY_BUFFER });
    }
    if (flat.uvs) {
      attributes['TEXCOORD_0'] = builder.addAccessor(flat.uvs, 'VEC2', { target: GL_ARRAY_BUFFER });
    }
    if (flat.uvs2) {
      attributes['TEXCOORD_1'] = builder.addAccessor(flat.uvs2, 'VEC2', {
        target: GL_ARRAY_BUFFER,
      });
    }
    let skinId: number | undefined;
    if (flat.joints && flat.weights && isSkinnedMesh(object)) {
      const joints = object.skeleton.bones.map((bone) => nodeIds.get(bone));
      if (joints.every((id) => id !== undefined)) {
        attributes['JOINTS_0'] = builder.addAccessor(flat.joints, 'VEC4', {
          target: GL_ARRAY_BUFFER,
        });
        attributes['WEIGHTS_0'] = builder.addAccessor(flat.weights, 'VEC4', {
          target: GL_ARRAY_BUFFER,
        });
        const inverseBind = new Float32Array(object.skeleton.bones.length * 16);
        object.skeleton.boneInverses.forEach((matrix: Matrix4, i) => {
          inverseBind.set(matrix.elements, i * 16);
        });
        skinId = builder.addSkin(joints, inverseBind, undefined, flat.name);
      } else {
        warnings.push(`${flat.name}: a bone is missing from the hierarchy; written static`);
      }
    }
    const vertexCount = flat.positions.length / 3;
    const indexData = vertexCount <= 0xffff ? Uint16Array.from(flat.indices) : flat.indices;
    const primitive: GltfPrimitive = {
      attributes,
      indices: builder.addAccessor(indexData, 'SCALAR', { target: GL_ELEMENT_ARRAY_BUFFER }),
      material,
    };
    const meshId = builder.addMesh([primitive], flat.name);
    const node: GltfNode = { name: flat.name, mesh: meshId };
    if (skinId !== undefined) node.skin = skinId;
    builder.addSceneNode(builder.addNode(node));
    meshes.push({
      name: flat.name,
      vertices: vertexCount,
      triangles: flat.indices.length / 3,
      skinned: skinId !== undefined,
    });
    bounds.expandByObject(object);
  });

  if (skinnedMeshes.length > 0) {
    addClips(builder, partClips(group), (name) => nodeByName.get(name), warnings);
  }
  if (meshes.length === 0) warnings.push('the FBX file has no meshes');
  return {
    glb: builder.toGlb(),
    meshes,
    bones: [...nodeByName.keys()],
    textures: [],
    warnings,
  };
}
