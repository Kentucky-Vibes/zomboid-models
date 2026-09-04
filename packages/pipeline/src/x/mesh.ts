import type { Mat4 } from '../math/matrix.js';
import type { XMaterial, XMesh } from './types.js';

export const MAX_INFLUENCES = 4;

export interface MeshMaterial {
  name: string;
  /** Texture file name as written in the .x file, without a directory. */
  texture: string | undefined;
  color: [number, number, number, number];
}

export interface MeshGroup {
  material: number;
  /** First index in `indices`. */
  start: number;
  /** Number of indices; always a multiple of three. */
  count: number;
}

export interface MeshBone {
  name: string;
  /** Inverse bind matrix, 16 numbers in file order. */
  inverseBind: Mat4;
}

export interface MeshSkin {
  /** Four bone indices per vertex, into `bones`. */
  joints: Uint16Array;
  /** Four weights per vertex, normalised to sum to one. */
  weights: Float32Array;
  bones: MeshBone[];
}

export interface MeshData {
  name: string;
  vertexCount: number;
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  indices: Uint32Array;
  /** One group per material, in material order; together they cover all of `indices`. */
  groups: MeshGroup[];
  materials: MeshMaterial[];
  skin: MeshSkin | null;
  warnings: string[];
}

interface Influence {
  bone: number;
  weight: number;
}

function resolveMaterials(mesh: XMesh, fileMaterials: readonly XMaterial[]): MeshMaterial[] {
  const entries = mesh.materialList?.materials ?? [];
  if (entries.length === 0) {
    return [{ name: 'default', texture: undefined, color: [1, 1, 1, 1] }];
  }
  return entries.map((entry, i) => {
    const material =
      entry.kind === 'inline' ? entry.material : fileMaterials.find((m) => m.name === entry.name);
    if (!material) {
      throw new Error(
        `mesh "${mesh.name ?? ''}" references unknown material "${entry.kind === 'ref' ? entry.name : ''}"`,
      );
    }
    return {
      name: material.name ?? `material_${i}`,
      texture: material.textureFilename,
      color: material.faceColor,
    };
  });
}

function faceMaterial(mesh: XMesh, faceIndex: number): number {
  const list = mesh.materialList;
  if (!list) return 0;
  if (list.faceMaterials.length === 1) return list.faceMaterials[0] as number;
  return list.faceMaterials[faceIndex] ?? 0;
}

function collectInfluences(mesh: XMesh, vertexCount: number, warnings: string[]): Influence[][] {
  const influences: Influence[][] = Array.from({ length: vertexCount }, () => []);
  mesh.skinWeights.forEach((skin, bone) => {
    skin.vertexIndices.forEach((vertex, i) => {
      const weight = skin.weights[i] ?? 0;
      if (vertex < 0 || vertex >= vertexCount) {
        throw new Error(`bone "${skin.bone}" weights vertex ${vertex} outside of the mesh`);
      }
      if (weight > 0) (influences[vertex] as Influence[]).push({ bone, weight });
    });
  });

  let unweighted = 0;
  let trimmed = 0;
  for (let v = 0; v < vertexCount; v++) {
    const list = influences[v] as Influence[];
    if (list.length === 0) {
      unweighted++;
      list.push({ bone: 0, weight: 1 });
      continue;
    }
    if (list.length > MAX_INFLUENCES) {
      trimmed++;
      list.sort((a, b) => b.weight - a.weight);
      list.length = MAX_INFLUENCES;
    }
    const total = list.reduce((sum, inf) => sum + inf.weight, 0);
    for (const inf of list) inf.weight /= total;
  }
  if (unweighted > 0) {
    warnings.push(
      `${unweighted} vertices have no skin weights and were bound to "${mesh.skinWeights[0]?.bone ?? ''}"`,
    );
  }
  if (trimmed > 0) {
    warnings.push(
      `${trimmed} vertices had more than ${MAX_INFLUENCES} bone influences; the smallest were dropped`,
    );
  }
  return influences;
}

/**
 * Turns a parsed mesh into flat, indexed, triangle-only buffers. A vertex is split when the
 * same position is used with different normals. Faces are grouped by material.
 */
export function buildMeshData(mesh: XMesh, fileMaterials: readonly XMaterial[]): MeshData {
  const warnings: string[] = [];
  const name = mesh.name ?? 'mesh';
  const sourceVertexCount = mesh.positions.length / 3;
  const materials = resolveMaterials(mesh, fileMaterials);
  const hasNormals = mesh.normals !== undefined && mesh.normals.faces.length === mesh.faces.length;
  if (mesh.normals && !hasNormals) {
    warnings.push('normal face list does not match the position face list; normals dropped');
  }
  const hasUvs = mesh.texCoords !== undefined && mesh.texCoords.length === sourceVertexCount * 2;
  if (mesh.texCoords && !hasUvs) {
    warnings.push('texture coordinate count does not match the vertex count; uvs dropped');
  }
  const influences =
    mesh.skinWeights.length > 0 ? collectInfluences(mesh, sourceVertexCount, warnings) : null;

  const vertexKeys = new Map<string, number>();
  const sourceOf: number[] = [];
  const normalOf: number[] = [];
  const outputVertex = (position: number, normal: number): number => {
    if (position < 0 || position >= sourceVertexCount) {
      throw new Error(`face references vertex ${position} outside of mesh "${name}"`);
    }
    const key = `${position}:${normal}`;
    let id = vertexKeys.get(key);
    if (id === undefined) {
      id = sourceOf.length;
      vertexKeys.set(key, id);
      sourceOf.push(position);
      normalOf.push(normal);
    }
    return id;
  };

  const trianglesByMaterial: number[][] = materials.map(() => []);
  mesh.faces.forEach((face, faceIndex) => {
    const normalFace = hasNormals
      ? (mesh.normals as { faces: number[][] }).faces[faceIndex]
      : undefined;
    const corners = face.map((position, k) => outputVertex(position, normalFace?.[k] ?? -1));
    const target = trianglesByMaterial[faceMaterial(mesh, faceIndex)];
    if (!target) {
      throw new Error(
        `face ${faceIndex} of mesh "${name}" uses a material index outside of the material list`,
      );
    }
    for (let k = 1; k + 1 < corners.length; k++) {
      target.push(corners[0] as number, corners[k] as number, corners[k + 1] as number);
    }
  });

  const vertexCount = sourceOf.length;
  const positions = new Float32Array(vertexCount * 3);
  const normals = hasNormals ? new Float32Array(vertexCount * 3) : null;
  const uvs = hasUvs ? new Float32Array(vertexCount * 2) : null;
  const joints = influences ? new Uint16Array(vertexCount * MAX_INFLUENCES) : null;
  const weights = influences ? new Float32Array(vertexCount * MAX_INFLUENCES) : null;
  for (let v = 0; v < vertexCount; v++) {
    const source = sourceOf[v] as number;
    positions.set(mesh.positions.slice(source * 3, source * 3 + 3), v * 3);
    if (normals && mesh.normals) {
      const n = normalOf[v] as number;
      normals.set(mesh.normals.values.slice(n * 3, n * 3 + 3), v * 3);
    }
    if (uvs && mesh.texCoords) {
      uvs.set(mesh.texCoords.slice(source * 2, source * 2 + 2), v * 2);
    }
    if (influences && joints && weights) {
      (influences[source] as Influence[]).forEach((inf, i) => {
        joints[v * MAX_INFLUENCES + i] = inf.bone;
        weights[v * MAX_INFLUENCES + i] = inf.weight;
      });
    }
  }

  const totalIndices = trianglesByMaterial.reduce((sum, list) => sum + list.length, 0);
  const indices = new Uint32Array(totalIndices);
  const groups: MeshGroup[] = [];
  let offset = 0;
  trianglesByMaterial.forEach((list, material) => {
    if (list.length === 0) return;
    indices.set(list, offset);
    groups.push({ material, start: offset, count: list.length });
    offset += list.length;
  });

  const skin: MeshSkin | null =
    joints && weights
      ? {
          joints,
          weights,
          bones: mesh.skinWeights.map((s) => ({ name: s.bone, inverseBind: [...s.offsetMatrix] })),
        }
      : null;

  return { name, vertexCount, positions, normals, uvs, indices, groups, materials, skin, warnings };
}
