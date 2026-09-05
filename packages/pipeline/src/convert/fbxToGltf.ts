/**
 * Converts the game's FBX meshes (binary and ASCII) to GLB through the three.js FBX loader,
 * running in Node with the few browser globals the loader touches stubbed out.
 *
 * The game imports FBX through Assimp and then flips the scene to its left-handed space. FBX
 * files are right-handed to begin with, so, unlike the `.x` files, they are written to glTF as
 * they are: what the game shows in its left-handed frame is what the raw data shows in a
 * right-handed one. Node transforms are baked into the vertices, so the GLB is a flat list of
 * named meshes, which is what the game's `mesh = file|MeshName` references select from.
 */
import { Box3, Matrix4, Vector3, type BufferGeometry, type Mesh, type Object3D } from 'three';
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

interface FlatMesh {
  name: string;
  positions: Float32Array;
  normals: Float32Array | undefined;
  uvs: Float32Array | undefined;
  uvs2: Float32Array | undefined;
  indices: Uint32Array;
  materialName: string;
}

/** Bakes the node's world transform into the geometry and flips V to glTF's top-left origin. */
function flatten(mesh: Mesh, warnings: string[]): FlatMesh | undefined {
  const geometry = mesh.geometry;
  const positionsIn = attribute(geometry, 'position');
  if (!positionsIn) return undefined;
  const count = positionsIn.length / 3;
  const matrix = mesh.matrixWorld;
  const normalMatrix = new Matrix4().copy(matrix).invert().transpose();
  const positions = new Float32Array(count * 3);
  const point = new Vector3();
  for (let i = 0; i < count; i++) {
    point.set(positionsIn[i * 3] ?? 0, positionsIn[i * 3 + 1] ?? 0, positionsIn[i * 3 + 2] ?? 0);
    point.applyMatrix4(matrix);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
  }
  const normalsIn = attribute(geometry, 'normal');
  let normals: Float32Array | undefined;
  if (normalsIn && normalsIn.length === count * 3) {
    normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      point.set(normalsIn[i * 3] ?? 0, normalsIn[i * 3 + 1] ?? 0, normalsIn[i * 3 + 2] ?? 0);
      point.applyMatrix4(normalMatrix).normalize();
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
  if (matrix.determinant() < 0) {
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

function isMeshObject(object: Object3D): object is Mesh {
  return (object as { isMesh?: boolean }).isMesh === true;
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

/** Converts every static mesh of an FBX file to one GLB; skinned meshes are skipped. */
export function convertFbxFile(data: Uint8Array, generator?: string): MeshConversionResult {
  const warnings: string[] = [];
  const group = parseFbx(data);
  const builder = new GltfBuilder(generator);
  const meshes: MeshConversionResult['meshes'] = [];
  const materials = new Map<string, number>();
  const bounds = new Box3();

  let skinned = 0;
  group.traverse((object) => {
    if (!isMeshObject(object)) return;
    // Skinned FBX meshes (the vehicles with doors on hinges) are written in their bind pose.
    if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned++;
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
  if (skinned > 0) warnings.push(`${skinned} skinned meshes written in their bind pose`);
  return { glb: builder.toGlb(), meshes, bones: [], textures: [], warnings };
}
