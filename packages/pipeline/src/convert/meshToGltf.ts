import {
  GL_ARRAY_BUFFER,
  GL_CLAMP_TO_EDGE,
  GL_ELEMENT_ARRAY_BUFFER,
  GL_LINEAR,
  GltfBuilder,
  type GltfNode,
  type GltfPrimitive,
} from '../gltf/glb.js';
import { decompose } from '../math/matrix.js';
import { buildMeshData, type MeshData } from '../x/mesh.js';
import { mirrorMeshDataZ, mirrorSkeletonZ } from '../x/mirror.js';
import { collectMeshes, collectSkeleton, type XSkeleton } from '../x/skeleton.js';
import type { XFile } from '../x/types.js';

export interface MeshConversionOptions {
  /** Maps a texture file name from the .x file to the URI written into the GLB. */
  textureUri?: (fileName: string) => string | undefined;
  generator?: string;
  /**
   * Mirrors the left-handed game space into glTF's right-handed space (Z negated). Defaults to
   * true; turn it off only to inspect the raw file coordinates.
   */
  mirror?: boolean;
}

export interface MeshConversionResult {
  glb: Uint8Array;
  meshes: { name: string; vertices: number; triangles: number; skinned: boolean }[];
  bones: string[];
  textures: string[];
  warnings: string[];
}

/** Adds every skeleton bone as a glTF node with TRS and returns the node index per bone. */
export function addSkeletonNodes(builder: GltfBuilder, skeleton: XSkeleton): number[] {
  const nodeIds = skeleton.bones.map((bone) => {
    const trs = decompose(bone.local);
    const node: GltfNode = {
      name: bone.name,
      translation: trs.translation,
      rotation: trs.rotation,
      scale: trs.scale,
    };
    return builder.addNode(node);
  });
  skeleton.bones.forEach((bone, i) => {
    const id = nodeIds[i] as number;
    if (bone.parent < 0) {
      builder.addSceneNode(id);
    } else {
      const parent = builder.document.nodes[nodeIds[bone.parent] as number] as GltfNode;
      (parent.children ??= []).push(id);
    }
  });
  return nodeIds;
}

function addMaterials(
  builder: GltfBuilder,
  data: MeshData,
  options: MeshConversionOptions,
  textures: Map<string, number>,
): number[] {
  return data.materials.map((material) => {
    let textureIndex: number | undefined;
    if (material.texture) {
      const uri = options.textureUri?.(material.texture);
      if (uri !== undefined) {
        textureIndex = textures.get(material.texture);
        if (textureIndex === undefined) {
          const sampler = builder.addSampler({
            magFilter: GL_LINEAR,
            minFilter: GL_LINEAR,
            wrapS: GL_CLAMP_TO_EDGE,
            wrapT: GL_CLAMP_TO_EDGE,
          });
          textureIndex = builder.addTexture(builder.addImage(uri, material.texture), sampler);
          textures.set(material.texture, textureIndex);
        }
      }
    }
    return builder.addMaterial({
      name: material.name,
      pbrMetallicRoughness: {
        baseColorFactor: material.color,
        ...(textureIndex === undefined ? {} : { baseColorTexture: { index: textureIndex } }),
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      alphaMode: 'MASK',
      alphaCutoff: 0.5,
    });
  });
}

function addPrimitives(
  builder: GltfBuilder,
  data: MeshData,
  materialIds: number[],
): GltfPrimitive[] {
  const attributes: Record<string, number> = {
    POSITION: builder.addAccessor(data.positions, 'VEC3', {
      target: GL_ARRAY_BUFFER,
      minMax: true,
    }),
  };
  if (data.normals) {
    attributes['NORMAL'] = builder.addAccessor(data.normals, 'VEC3', { target: GL_ARRAY_BUFFER });
  }
  if (data.uvs) {
    attributes['TEXCOORD_0'] = builder.addAccessor(data.uvs, 'VEC2', { target: GL_ARRAY_BUFFER });
  }
  if (data.skin) {
    attributes['JOINTS_0'] = builder.addAccessor(data.skin.joints, 'VEC4', {
      target: GL_ARRAY_BUFFER,
    });
    attributes['WEIGHTS_0'] = builder.addAccessor(data.skin.weights, 'VEC4', {
      target: GL_ARRAY_BUFFER,
    });
  }
  const useShortIndices = data.vertexCount <= 0xffff;
  return data.groups.map((group) => {
    const slice = data.indices.subarray(group.start, group.start + group.count);
    const indexData = useShortIndices ? Uint16Array.from(slice) : Uint32Array.from(slice);
    const primitive: GltfPrimitive = {
      attributes,
      indices: builder.addAccessor(indexData, 'SCALAR', { target: GL_ELEMENT_ARRAY_BUFFER }),
    };
    const material = materialIds[group.material];
    if (material !== undefined) primitive.material = material;
    return primitive;
  });
}

/**
 * Converts every mesh in a .x file to one GLB. The frame tree becomes the node hierarchy,
 * skinned meshes get a skin whose joints are looked up by bone name.
 */
export function convertMeshFile(
  file: XFile,
  options: MeshConversionOptions = {},
): MeshConversionResult {
  const builder = new GltfBuilder(options.generator);
  const mirror = options.mirror ?? true;
  const skeleton = collectSkeleton(file.frames);
  if (mirror) mirrorSkeletonZ(skeleton);
  const nodeIds = addSkeletonNodes(builder, skeleton);
  const textures = new Map<string, number>();
  const warnings: string[] = [];
  const meshes: MeshConversionResult['meshes'] = [];

  const rootNode = skeleton.index.get('Dummy01') ?? (skeleton.bones.length > 0 ? 0 : undefined);

  for (const placed of collectMeshes(file.frames, file.meshes)) {
    const data = buildMeshData(placed.mesh, file.materials);
    if (mirror) mirrorMeshDataZ(data);
    warnings.push(...data.warnings.map((w) => `${data.name}: ${w}`));
    const materialIds = addMaterials(builder, data, options, textures);
    const meshId = builder.addMesh(addPrimitives(builder, data, materialIds), data.name);

    let skinId: number | undefined;
    if (data.skin) {
      const joints = data.skin.bones.map((bone) => {
        const boneIndex = skeleton.index.get(bone.name);
        if (boneIndex === undefined) {
          throw new Error(`mesh "${data.name}" is skinned to unknown bone "${bone.name}"`);
        }
        return nodeIds[boneIndex] as number;
      });
      const inverseBind = new Float32Array(data.skin.bones.flatMap((bone) => bone.inverseBind));
      skinId = builder.addSkin(
        joints,
        inverseBind,
        rootNode === undefined ? undefined : nodeIds[rootNode],
        data.name,
      );
    }

    const frameIndex = placed.frame === undefined ? undefined : skeleton.index.get(placed.frame);
    const node: GltfNode = { name: data.name, mesh: meshId };
    if (skinId !== undefined) node.skin = skinId;
    if (frameIndex !== undefined) {
      const frameNode = builder.document.nodes[nodeIds[frameIndex] as number] as GltfNode;
      if (frameNode.mesh === undefined) {
        frameNode.mesh = meshId;
        if (skinId !== undefined) frameNode.skin = skinId;
      } else {
        (frameNode.children ??= []).push(builder.addNode(node));
      }
    } else {
      builder.addSceneNode(builder.addNode(node));
    }

    meshes.push({
      name: data.name,
      vertices: data.vertexCount,
      triangles: data.indices.length / 3,
      skinned: data.skin !== null,
    });
  }

  return {
    glb: builder.toGlb(),
    meshes,
    bones: skeleton.bones.map((b) => b.name),
    textures: [...textures.keys()],
    warnings,
  };
}
