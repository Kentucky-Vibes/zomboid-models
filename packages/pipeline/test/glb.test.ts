import { describe, expect, it } from 'vitest';

import { GL_ARRAY_BUFFER, GltfBuilder } from '../src/gltf/glb.js';

function readGlb(bytes: Uint8Array): { json: Record<string, unknown>; bin: Uint8Array | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Record<
    string,
    unknown
  >;
  const binStart = 20 + jsonLength;
  if (binStart >= bytes.byteLength) return { json, bin: null };
  const binLength = view.getUint32(binStart, true);
  expect(view.getUint32(binStart + 4, true)).toBe(0x004e4942);
  return { json, bin: bytes.subarray(binStart + 8, binStart + 8 + binLength) };
}

describe('GltfBuilder', () => {
  it('writes a valid GLB with padded chunks', () => {
    const builder = new GltfBuilder('test');
    const positions = builder.addAccessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 'VEC3', {
      target: GL_ARRAY_BUFFER,
      minMax: true,
    });
    const indices = builder.addAccessor(new Uint16Array([0, 1, 2]), 'SCALAR');
    const material = builder.addMaterial({ name: 'm', doubleSided: true });
    const mesh = builder.addMesh(
      [{ attributes: { POSITION: positions }, indices, material }],
      'tri',
    );
    const node = builder.addNode({ name: 'root', mesh });
    builder.addSceneNode(node);

    const { json, bin } = readGlb(builder.toGlb());
    expect(json['asset']).toEqual({ version: '2.0', generator: 'test' });
    expect(json['accessors']).toEqual([
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ]);
    expect(json['bufferViews']).toEqual([
      { buffer: 0, byteOffset: 0, byteLength: 36, target: GL_ARRAY_BUFFER },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ]);
    expect(json['buffers']).toEqual([{ byteLength: 44 }]);
    expect(bin?.byteLength).toBe(44);
    expect(json['scenes']).toEqual([{ nodes: [0] }]);
    expect(json).not.toHaveProperty('skins');
    expect(json).not.toHaveProperty('animations');
  });

  it('omits the binary chunk and empty lists when there is no data', () => {
    const builder = new GltfBuilder();
    builder.addSceneNode(builder.addNode({ name: 'empty' }));
    const { json, bin } = readGlb(builder.toGlb());
    expect(bin).toBeNull();
    expect(json).not.toHaveProperty('buffers');
    expect(json['nodes']).toEqual([{ name: 'empty' }]);
  });

  it('rejects accessor data that does not fit the type', () => {
    const builder = new GltfBuilder();
    expect(() => builder.addAccessor(new Float32Array(5), 'VEC3')).toThrow('multiple of 3');
  });
});
