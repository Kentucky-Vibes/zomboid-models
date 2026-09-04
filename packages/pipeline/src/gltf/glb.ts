/**
 * Minimal glTF 2.0 document builder with a GLB serializer. It covers what the converter
 * needs: one binary buffer, accessors, images referenced by relative URI, materials, meshes,
 * nodes, skins, animations, and one scene.
 */

export const GL_ARRAY_BUFFER = 34962;
export const GL_ELEMENT_ARRAY_BUFFER = 34963;
export const GL_NEAREST = 9728;
export const GL_LINEAR = 9729;
export const GL_LINEAR_MIPMAP_LINEAR = 9987;
export const GL_REPEAT = 10497;
export const GL_CLAMP_TO_EDGE = 33071;

const GL_FLOAT = 5126;
const GL_UNSIGNED_BYTE = 5121;
const GL_UNSIGNED_SHORT = 5123;
const GL_UNSIGNED_INT = 5125;

export type AccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4';
export type AccessorData = Float32Array | Uint8Array | Uint16Array | Uint32Array;

const COMPONENTS: Record<AccessorType, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
}

export interface GltfNode {
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

export interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    baseColorTexture?: { index: number; texCoord?: number };
    metallicFactor?: number;
    roughnessFactor?: number;
  };
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided?: boolean;
  extensions?: Record<string, unknown>;
}

export interface GltfAnimationSampler {
  input: number;
  output: number;
  interpolation?: 'LINEAR' | 'STEP';
}

export interface GltfAnimationChannel {
  sampler: number;
  target: { node: number; path: 'translation' | 'rotation' | 'scale' };
}

export interface GltfSampler {
  magFilter?: number;
  minFilter?: number;
  wrapS?: number;
  wrapT?: number;
}

interface GltfAccessor {
  bufferView: number;
  componentType: number;
  count: number;
  type: AccessorType;
  normalized?: boolean;
  min?: number[];
  max?: number[];
}

interface GltfBufferView {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  target?: number;
}

export interface GltfDocument {
  asset: { version: '2.0'; generator: string };
  extensionsUsed?: string[];
  buffers: { byteLength: number }[];
  bufferViews: GltfBufferView[];
  accessors: GltfAccessor[];
  images: { uri: string; name?: string }[];
  samplers: GltfSampler[];
  textures: { source: number; sampler?: number }[];
  materials: GltfMaterial[];
  meshes: { name?: string; primitives: GltfPrimitive[] }[];
  nodes: GltfNode[];
  skins: { name?: string; joints: number[]; inverseBindMatrices?: number; skeleton?: number }[];
  animations: {
    name?: string;
    samplers: GltfAnimationSampler[];
    channels: GltfAnimationChannel[];
  }[];
  scenes: { nodes: number[] }[];
  scene: number;
}

function componentType(data: AccessorData): number {
  if (data instanceof Float32Array) return GL_FLOAT;
  if (data instanceof Uint8Array) return GL_UNSIGNED_BYTE;
  if (data instanceof Uint16Array) return GL_UNSIGNED_SHORT;
  return GL_UNSIGNED_INT;
}

function pad4(length: number): number {
  return (length + 3) & ~3;
}

export class GltfBuilder {
  readonly document: GltfDocument;
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;

  constructor(generator = 'zomboid-models-pipeline') {
    this.document = {
      asset: { version: '2.0', generator },
      buffers: [{ byteLength: 0 }],
      bufferViews: [],
      accessors: [],
      images: [],
      samplers: [],
      textures: [],
      materials: [],
      meshes: [],
      nodes: [],
      skins: [],
      animations: [],
      scenes: [{ nodes: [] }],
      scene: 0,
    };
  }

  addBufferView(data: AccessorData, target?: number): number {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const view: GltfBufferView = {
      buffer: 0,
      byteOffset: this.byteLength,
      byteLength: bytes.byteLength,
    };
    if (target !== undefined) view.target = target;
    this.chunks.push(bytes);
    const padded = pad4(bytes.byteLength);
    if (padded !== bytes.byteLength) this.chunks.push(new Uint8Array(padded - bytes.byteLength));
    this.byteLength += padded;
    this.document.bufferViews.push(view);
    return this.document.bufferViews.length - 1;
  }

  addAccessor(
    data: AccessorData,
    type: AccessorType,
    options: { target?: number; minMax?: boolean; normalized?: boolean } = {},
  ): number {
    const components = COMPONENTS[type];
    if (data.length % components !== 0) {
      throw new Error(`accessor data length ${data.length} is not a multiple of ${components}`);
    }
    const accessor: GltfAccessor = {
      bufferView: this.addBufferView(data, options.target),
      componentType: componentType(data),
      count: data.length / components,
      type,
    };
    if (options.normalized) accessor.normalized = true;
    if (options.minMax) {
      const min = new Array<number>(components).fill(Number.POSITIVE_INFINITY);
      const max = new Array<number>(components).fill(Number.NEGATIVE_INFINITY);
      for (let i = 0; i < data.length; i++) {
        const c = i % components;
        const value = data[i] as number;
        if (value < (min[c] as number)) min[c] = value;
        if (value > (max[c] as number)) max[c] = value;
      }
      accessor.min = min;
      accessor.max = max;
    }
    this.document.accessors.push(accessor);
    return this.document.accessors.length - 1;
  }

  addImage(uri: string, name?: string): number {
    this.document.images.push(name === undefined ? { uri } : { uri, name });
    return this.document.images.length - 1;
  }

  addSampler(sampler: GltfSampler): number {
    this.document.samplers.push(sampler);
    return this.document.samplers.length - 1;
  }

  addTexture(source: number, sampler?: number): number {
    this.document.textures.push(sampler === undefined ? { source } : { source, sampler });
    return this.document.textures.length - 1;
  }

  addMaterial(material: GltfMaterial): number {
    this.document.materials.push(material);
    return this.document.materials.length - 1;
  }

  addMesh(primitives: GltfPrimitive[], name?: string): number {
    this.document.meshes.push(name === undefined ? { primitives } : { name, primitives });
    return this.document.meshes.length - 1;
  }

  addNode(node: GltfNode): number {
    this.document.nodes.push(node);
    return this.document.nodes.length - 1;
  }

  addSkin(
    joints: number[],
    inverseBindMatrices: Float32Array,
    skeleton?: number,
    name?: string,
  ): number {
    const skin: GltfDocument['skins'][number] = {
      joints,
      inverseBindMatrices: this.addAccessor(inverseBindMatrices, 'MAT4'),
    };
    if (skeleton !== undefined) skin.skeleton = skeleton;
    if (name !== undefined) skin.name = name;
    this.document.skins.push(skin);
    return this.document.skins.length - 1;
  }

  addAnimation(
    name: string,
    samplers: GltfAnimationSampler[],
    channels: GltfAnimationChannel[],
  ): number {
    this.document.animations.push({ name, samplers, channels });
    return this.document.animations.length - 1;
  }

  addSceneNode(node: number): void {
    (this.document.scenes[0] as { nodes: number[] }).nodes.push(node);
  }

  useExtension(name: string): void {
    const list = (this.document.extensionsUsed ??= []);
    if (!list.includes(name)) list.push(name);
  }

  /** Serializes the document and its binary buffer as a GLB container. */
  toGlb(): Uint8Array {
    const document = this.finalizeDocument();
    const jsonBytes = new TextEncoder().encode(JSON.stringify(document));
    const jsonPadded = pad4(jsonBytes.byteLength);
    const binLength = this.byteLength;
    const totalLength = 12 + 8 + jsonPadded + (binLength > 0 ? 8 + binLength : 0);

    const out = new Uint8Array(totalLength);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x46546c67, true); // glTF
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);

    view.setUint32(12, jsonPadded, true);
    view.setUint32(16, 0x4e4f534a, true); // JSON
    out.set(jsonBytes, 20);
    out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);

    if (binLength > 0) {
      const binStart = 20 + jsonPadded;
      view.setUint32(binStart, binLength, true);
      view.setUint32(binStart + 4, 0x004e4942, true); // BIN
      let offset = binStart + 8;
      for (const chunk of this.chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    return out;
  }

  private finalizeDocument(): GltfDocument {
    const document: GltfDocument = { ...this.document, buffers: [{ byteLength: this.byteLength }] };
    if (this.byteLength === 0) document.buffers = [];
    for (const key of Object.keys(document) as (keyof GltfDocument)[]) {
      const value = document[key];
      if (Array.isArray(value) && value.length === 0 && key !== 'scenes') {
        delete document[key];
      }
    }
    return document;
  }
}
