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
 * Skinned meshes (the three cars whose doors, hood, and trunk hang on bones) are baked too, in
 * their closed state: the game shows them closed by holding the last frame of the part's
 * `<part>_closing` clip, and the bind pose in the file has them open.
 */
import {
  Box3,
  Matrix3,
  Matrix4,
  Vector3,
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
  type GltfPrimitive,
} from '../gltf/glb.js';
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
}

/**
 * The transform of each vertex into world space: the node's world matrix, or, for a skinned
 * mesh, the weighted bone matrices the way the three.js skinning shader composes them.
 */
function vertexMatrices(mesh: Mesh): (index: number, out: Matrix4) => Matrix4 {
  const world = (_index: number, out: Matrix4): Matrix4 => out.copy(mesh.matrixWorld);
  if (!isSkinnedMesh(mesh)) return world;
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  if (!skinIndex || !skinWeight) return world;
  mesh.skeleton.update();
  const boneMatrices = mesh.skeleton.boneMatrices;
  if (!boneMatrices) return world;
  const sum = new Float32Array(16);
  return (index, out) => {
    sum.fill(0);
    let total = 0;
    for (let j = 0; j < 4; j++) {
      const weight = skinWeight.getComponent(index, j);
      if (weight === 0) continue;
      const bone = skinIndex.getComponent(index, j) * 16;
      for (let k = 0; k < 16; k++) {
        sum[k] = (sum[k] ?? 0) + weight * (boneMatrices[bone + k] ?? 0);
      }
      total += weight;
    }
    if (total === 0) return world(index, out);
    out.fromArray(sum).multiplyScalar(1 / total);
    out.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
    return out.premultiply(mesh.matrixWorld);
  };
}

/** Bakes the vertex transforms into the geometry and flips V to glTF's top-left origin. */
function flatten(mesh: Mesh, warnings: string[]): FlatMesh | undefined {
  const geometry = mesh.geometry;
  const positionsIn = attribute(geometry, 'position');
  if (!positionsIn) return undefined;
  const count = positionsIn.length / 3;
  const matrixAt = vertexMatrices(mesh);
  const matrix = new Matrix4();
  const normalMatrix = new Matrix3();
  const positions = new Float32Array(count * 3);
  const normalsIn = attribute(geometry, 'normal');
  const normals =
    normalsIn && normalsIn.length === count * 3 ? new Float32Array(count * 3) : undefined;
  const point = new Vector3();
  for (let i = 0; i < count; i++) {
    matrixAt(i, matrix);
    point.set(positionsIn[i * 3] ?? 0, positionsIn[i * 3 + 1] ?? 0, positionsIn[i * 3 + 2] ?? 0);
    point.applyMatrix4(matrix);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
    if (normals && normalsIn) {
      normalMatrix.getNormalMatrix(matrix);
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
  // A mirrored node transform reverses the winding; keep front faces facing out.
  if (mesh.matrixWorld.determinant() < 0) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i] as number;
      indices[i] = indices[i + 2] as number;
      indices[i + 2] = a;
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

/** Converts every mesh of an FBX file to one GLB of static meshes, hinged parts closed. */
export function convertFbxFile(data: Uint8Array, generator?: string): MeshConversionResult {
  const warnings: string[] = [];
  const group = parseFbx(data);
  applyClosedPose(group);
  const builder = new GltfBuilder(generator);
  const meshes: MeshConversionResult['meshes'] = [];
  const materials = new Map<string, number>();
  const bounds = new Box3();

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
    const vertexCount = flat.positions.length / 3;
    const indexData = vertexCount <= 0xffff ? Uint16Array.from(flat.indices) : flat.indices;
    const primitive: GltfPrimitive = {
      attributes,
      indices: builder.addAccessor(indexData, 'SCALAR', { target: GL_ELEMENT_ARRAY_BUFFER }),
      material,
    };
    const meshId = builder.addMesh([primitive], flat.name);
    builder.addSceneNode(builder.addNode({ name: flat.name, mesh: meshId }));
    meshes.push({
      name: flat.name,
      vertices: vertexCount,
      triangles: flat.indices.length / 3,
      skinned: false,
    });
    bounds.expandByObject(object);
  });

  if (meshes.length === 0) warnings.push('the FBX file has no meshes');
  return { glb: builder.toGlb(), meshes, bones: [], textures: [], warnings };
}
