/**
 * Converts the game's text mesh format (`media/models/*.txt`, header `# Project Zomboid Mesh`)
 * to GLB. The format lists the vertex layout, then one line per layout element per vertex, then
 * the faces. The wheels of every vehicle are stored this way. The meshes are in the game's
 * left-handed frame, so they are mirrored like the `.x` files.
 */
import { GltfBuilder } from '../gltf/glb.js';
import type { MeshData } from '../x/mesh.js';
import { stripBom } from '../game/scripts.js';
import { mirrorMeshDataZ } from '../x/mirror.js';

import { addMaterials, addPrimitives, type MeshConversionResult } from './meshToGltf.js';

export interface TextMeshElement {
  offset: number;
  type: string;
}

export interface TextMesh {
  name: string;
  elements: TextMeshElement[];
  vertexCount: number;
  /** Per element, the values of every vertex, flattened. */
  buffers: number[][];
  /** Vertex indices, three per face. */
  faces: number[];
}

const HEADER = '# Project Zomboid Mesh';

class Lines {
  private index = 0;
  private readonly lines: string[];

  constructor(text: string) {
    this.lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /** Skips to the line after the section header that starts with `prefix`. */
  section(prefix: string): void {
    while (this.index < this.lines.length && !this.lines[this.index]?.startsWith(prefix)) {
      this.index++;
    }
    if (this.index >= this.lines.length) throw new Error(`missing section "${prefix}"`);
    this.index++;
  }

  /** The next line that is not a comment. */
  value(): string {
    while (this.lines[this.index]?.startsWith('#')) this.index++;
    const line = this.lines[this.index];
    if (line === undefined) throw new Error('unexpected end of file');
    this.index++;
    return line;
  }

  integer(): number {
    const line = this.value();
    const parsed = Number(line);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`expected a count, got "${line}"`);
    return parsed;
  }

  numbers(): number[] {
    const line = this.value();
    const values = line.split(',').map((s) => Number(s.trim()));
    if (values.some((v) => !Number.isFinite(v))) throw new Error(`expected numbers, got "${line}"`);
    return values;
  }

  get first(): string | undefined {
    return this.lines[0];
  }
}

/** Parses a text mesh file. */
export function parseTextMesh(text: string): TextMesh {
  const lines = new Lines(stripBom(text));
  if (lines.first !== HEADER)
    throw new Error(`not a text mesh: first line is "${lines.first ?? ''}"`);
  lines.section('# Model Name');
  const name = lines.value();
  lines.section('# Vertex Stride Element Count');
  const elementCount = lines.integer();
  lines.section('# Vertex Stride Data');
  const elements: TextMeshElement[] = [];
  for (let i = 0; i < elementCount; i++) {
    elements.push({ offset: lines.integer(), type: lines.value() });
  }
  lines.section('# Vertex Count');
  const vertexCount = lines.integer();
  lines.section('# Vertex Buffer');
  const buffers: number[][] = elements.map(() => []);
  for (let v = 0; v < vertexCount; v++) {
    for (let e = 0; e < elements.length; e++) (buffers[e] as number[]).push(...lines.numbers());
  }
  lines.section('# Number of Faces');
  const faceCount = lines.integer();
  lines.section('# Face Data');
  const faces: number[] = [];
  for (let f = 0; f < faceCount; f++) {
    const face = lines.numbers();
    if (face.length !== 3) throw new Error(`face ${f} has ${face.length} indices`);
    for (const index of face) {
      if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
        throw new Error(`face ${f} refers to vertex ${index} of ${vertexCount}`);
      }
    }
    faces.push(...face);
  }
  return { name, elements, vertexCount, buffers, faces };
}

function buffer(mesh: TextMesh, type: string, size: number): Float32Array | undefined {
  const index = mesh.elements.findIndex((e) => e.type === type);
  if (index < 0) return undefined;
  const values = mesh.buffers[index] as number[];
  if (values.length !== mesh.vertexCount * size) {
    throw new Error(
      `${type} has ${values.length} values for ${mesh.vertexCount} vertices of ${size} each`,
    );
  }
  return Float32Array.from(values);
}

/** Turns a parsed text mesh into the flat buffers the GLB writer takes. */
export function textMeshData(mesh: TextMesh): MeshData {
  if (mesh.elements.some((e) => e.type === 'BlendWeightArray' || e.type === 'BlendIndexArray')) {
    throw new Error('skinned text meshes are not supported');
  }
  const positions = buffer(mesh, 'VertexArray', 3);
  if (!positions) throw new Error('the mesh has no VertexArray');
  return {
    name: mesh.name,
    vertexCount: mesh.vertexCount,
    positions,
    normals: buffer(mesh, 'NormalArray', 3) ?? null,
    uvs: buffer(mesh, 'TextureCoordArray', 2) ?? null,
    indices: Uint32Array.from(mesh.faces),
    groups: [{ material: 0, start: 0, count: mesh.faces.length }],
    materials: [{ name: 'default', texture: undefined, color: [1, 1, 1, 1] }],
    skin: null,
    warnings: [],
  };
}

export interface TextMeshConversionOptions {
  generator?: string;
  /** Mirrors the game's left-handed frame into glTF's right-handed one; on by default. */
  mirror?: boolean;
}

/** Converts one text mesh file to a GLB with a single static mesh. */
export function convertTextMeshFile(
  text: string,
  options: TextMeshConversionOptions = {},
): MeshConversionResult {
  const parsed = parseTextMesh(text);
  const data = textMeshData(parsed);
  if (options.mirror ?? true) mirrorMeshDataZ(data);
  const builder = new GltfBuilder(options.generator);
  const materialIds = addMaterials(builder, data, {}, new Map());
  const meshId = builder.addMesh(addPrimitives(builder, data, materialIds), data.name);
  builder.addSceneNode(builder.addNode({ name: data.name, mesh: meshId }));
  return {
    glb: builder.toGlb(),
    meshes: [
      {
        name: data.name,
        vertices: data.vertexCount,
        triangles: data.indices.length / 3,
        skinned: false,
      },
    ],
    bones: [],
    textures: [],
    warnings: [],
  };
}
