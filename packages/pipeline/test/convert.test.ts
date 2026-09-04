import { describe, expect, it } from 'vitest';

import { convertAnimationFile } from '../src/convert/animationToGltf.js';
import { convertMeshFile } from '../src/convert/meshToGltf.js';
import { parseX } from '../src/x/parser.js';
import { SIMPLE_ANIMATION, SKINNED_QUAD } from './fixtures/x.js';
import { validateGlb } from './helpers/validateGlb.js';

interface GltfJson {
  nodes: {
    name?: string;
    children?: number[];
    mesh?: number;
    skin?: number;
    rotation?: number[];
  }[];
  meshes: {
    name?: string;
    primitives: { attributes: Record<string, number>; material?: number }[];
  }[];
  skins: { joints: number[]; skeleton?: number; inverseBindMatrices?: number }[];
  materials: { name?: string; pbrMetallicRoughness: { baseColorTexture?: { index: number } } }[];
  images?: { uri: string }[];
  animations?: { name: string; channels: { target: { node: number; path: string } }[] }[];
  scenes: { nodes: number[] }[];
}

function jsonOf(glb: Uint8Array): GltfJson {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length))) as GltfJson;
}

describe('convertMeshFile', () => {
  it('writes the frame tree, the skinned mesh, and the texture reference', () => {
    const result = convertMeshFile(parseX(SKINNED_QUAD), {
      textureUri: (file) => `textures/${file.toLowerCase()}`,
    });
    expect(result.warnings).toEqual([]);
    expect(result.bones).toEqual(['Dummy01', 'Bip01', 'Bip01_Head', 'Quad']);
    expect(result.textures).toEqual(['cloth.png']);
    expect(result.meshes).toEqual([{ name: 'Quad', vertices: 4, triangles: 2, skinned: true }]);

    const json = jsonOf(result.glb);
    expect(json.scenes[0]?.nodes).toEqual([0, 3]);
    expect(json.nodes[0]?.children).toEqual([1]);
    expect(json.nodes[1]?.children).toEqual([2]);
    const s = Math.SQRT1_2;
    expect(json.nodes[0]?.rotation?.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([
      Math.round(s * 1e6) / 1e6,
      0,
      0,
      Math.round(s * 1e6) / 1e6,
    ]);
    const raw = jsonOf(convertMeshFile(parseX(SKINNED_QUAD), { mirror: false }).glb);
    expect(raw.nodes[0]?.rotation?.[0]).toBeLessThan(0);
    expect(json.nodes[3]).toMatchObject({ name: 'Quad', mesh: 0, skin: 0 });
    expect(json.skins[0]).toMatchObject({ joints: [1, 2], skeleton: 0, name: 'Quad' });
    expect(typeof json.skins[0]?.inverseBindMatrices).toBe('number');
    expect(Object.keys(json.meshes[0]?.primitives[0]?.attributes ?? {})).toEqual([
      'POSITION',
      'NORMAL',
      'TEXCOORD_0',
      'JOINTS_0',
      'WEIGHTS_0',
    ]);
    expect(json.images).toEqual([{ uri: 'textures/cloth.png', name: 'cloth.png' }]);
    expect(json.materials[0]?.pbrMetallicRoughness.baseColorTexture).toEqual({ index: 0 });
  });

  it('leaves materials untextured when no uri is provided', () => {
    const json = jsonOf(convertMeshFile(parseX(SKINNED_QUAD)).glb);
    expect(json.images).toBeUndefined();
    expect(json.materials[0]?.pbrMetallicRoughness.baseColorTexture).toBeUndefined();
  });

  it('produces GLBs that pass the Khronos validator', async () => {
    const textured = convertMeshFile(parseX(SKINNED_QUAD), { textureUri: (f) => f });
    expect(await validateGlb(textured.glb)).toEqual([]);
    expect(await validateGlb(convertAnimationFile(parseX(SIMPLE_ANIMATION)).glb)).toEqual([]);
  });
});

describe('convertAnimationFile', () => {
  it('writes one glTF animation per animation set', () => {
    const result = convertAnimationFile(parseX(SIMPLE_ANIMATION));
    expect(result.warnings).toEqual([]);
    expect(result.clips).toEqual([{ name: 'Bob_Test', duration: 0.5, tracks: 1 }]);
    const json = jsonOf(result.glb);
    expect(json.animations?.[0]?.name).toBe('Bob_Test');
    expect(json.animations?.[0]?.channels.map((c) => c.target)).toEqual([
      { node: 0, path: 'translation' },
      { node: 0, path: 'rotation' },
      { node: 0, path: 'scale' },
    ]);
  });

  it('drops tracks for unknown bones and renames clips', () => {
    const text = SIMPLE_ANIMATION.replace('{ Bip01 }', '{ Nope }');
    const result = convertAnimationFile(parseX(text), { clipName: () => 'Idle' });
    expect(result.clips).toEqual([{ name: 'Idle', duration: 0.5, tracks: 0 }]);
    expect(result.warnings).toEqual([
      'Idle: bone "Nope" is not in the skeleton; track dropped',
      'Idle: no track matched a skeleton bone; clip dropped',
    ]);
    expect(jsonOf(result.glb).animations).toBeUndefined();
  });
});
