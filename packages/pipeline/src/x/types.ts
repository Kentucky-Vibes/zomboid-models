/**
 * Object model of a parsed .x file. Values are kept as they appear in the file: matrices are
 * the 16 numbers in file order (row-major, row-vector convention), coordinates are untouched.
 */

export interface XMaterial {
  name: string | undefined;
  /** Diffuse colour and alpha. */
  faceColor: [number, number, number, number];
  power: number;
  specular: [number, number, number];
  emissive: [number, number, number];
  textureFilename: string | undefined;
}

/** A material list entry is either an inline material or a reference to a named one. */
export type XMaterialEntry =
  { kind: 'inline'; material: XMaterial } | { kind: 'ref'; name: string };

export interface XMaterialList {
  materials: XMaterialEntry[];
  /** Material index per face, or a single entry that applies to every face. */
  faceMaterials: number[];
}

export interface XSkinWeights {
  bone: string;
  vertexIndices: number[];
  weights: number[];
  /** Inverse bind matrix of the bone, 16 numbers in file order. */
  offsetMatrix: number[];
}

export interface XSkinHeader {
  maxWeightsPerVertex: number;
  maxWeightsPerFace: number;
  boneCount: number;
}

export interface XMesh {
  name: string | undefined;
  /** Flat xyz triples. */
  positions: number[];
  /** Vertex indices per face; three or more per face. */
  faces: number[][];
  normals: { values: number[]; faces: number[][] } | undefined;
  /** Flat uv pairs, one per vertex. */
  texCoords: number[] | undefined;
  materialList: XMaterialList | undefined;
  skinHeader: XSkinHeader | undefined;
  skinWeights: XSkinWeights[];
}

export interface XFrame {
  name: string | undefined;
  /** 16 numbers in file order, or undefined when the frame has no FrameTransformMatrix. */
  transform: number[] | undefined;
  frames: XFrame[];
  meshes: XMesh[];
}

/** Key types as numbered in the file: 0 rotation, 1 scale, 2 position, 4 matrix. */
export type XKeyType = 0 | 1 | 2 | 4;

export interface XAnimationKeyframe {
  /** Time in ticks; see `XFile.ticksPerSecond`. */
  time: number;
  values: number[];
}

export interface XAnimationKey {
  keyType: XKeyType;
  keys: XAnimationKeyframe[];
}

export interface XAnimation {
  /** Name of the frame the animation drives, from the `{ Name }` reference. */
  target: string | undefined;
  keys: XAnimationKey[];
}

export interface XAnimationSet {
  name: string | undefined;
  animations: XAnimation[];
}

export interface XFile {
  materials: XMaterial[];
  frames: XFrame[];
  /** Meshes declared outside of any frame. */
  meshes: XMesh[];
  animationSets: XAnimationSet[];
  ticksPerSecond: number | undefined;
}
