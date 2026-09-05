import { describe, expect, it } from 'vitest';

import { convertTextMeshFile, parseTextMesh, textMeshData } from '../src/convert/textMeshToGltf.js';

import { validateGlb } from './helpers/validateGlb.js';

/** A single triangle in the game's text mesh format. */
export const TRIANGLE_TXT = `# Project Zomboid Mesh
# File Version:
1.00000000
# Model Name:
Tri
# Vertex Stride Element Count:
3
# Vertex Stride Size (in bytes):
32
# Vertex Stride Data:
# (Int)    Offset
# (String) Type
0
VertexArray
12
NormalArray
24
TextureCoordArray
# Vertex Count:
3
# Vertex Buffer:
0.00000000, 0.00000000, 0.00000000
0.00000000, 0.00000000, 1.00000000
0.00000000, 0.00000000
1.00000000, 0.00000000, 0.00000000
0.00000000, 0.00000000, 1.00000000
1.00000000, 0.00000000
0.00000000, 1.00000000, 0.50000000
0.00000000, 0.00000000, 1.00000000
0.00000000, 1.00000000
# Number of Faces:
1
# Face Data:
0, 1, 2
`;

describe('parseTextMesh', () => {
  it('reads the layout, the vertices, and the faces', () => {
    const mesh = parseTextMesh(TRIANGLE_TXT);
    expect(mesh.name).toBe('Tri');
    expect(mesh.elements).toEqual([
      { offset: 0, type: 'VertexArray' },
      { offset: 12, type: 'NormalArray' },
      { offset: 24, type: 'TextureCoordArray' },
    ]);
    expect(mesh.vertexCount).toBe(3);
    expect(mesh.buffers[0]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0.5]);
    expect(mesh.buffers[2]).toEqual([0, 0, 1, 0, 0, 1]);
    expect(mesh.faces).toEqual([0, 1, 2]);
  });

  it('rejects files that are not text meshes or refer to missing vertices', () => {
    expect(() => parseTextMesh('xof 0303txt')).toThrow('not a text mesh');
    expect(() => parseTextMesh(TRIANGLE_TXT.replace('0, 1, 2', '0, 1, 7'))).toThrow(
      'refers to vertex 7',
    );
    expect(() =>
      textMeshData(parseTextMesh(TRIANGLE_TXT.replace('TextureCoordArray', 'BlendWeightArray'))),
    ).toThrow('skinned');
  });
});

describe('convertTextMeshFile', () => {
  it('writes a valid GLB with the mesh mirrored into the right-handed frame', async () => {
    const result = convertTextMeshFile(TRIANGLE_TXT);
    expect(await validateGlb(result.glb)).toEqual([]);
    expect(result.meshes).toEqual([{ name: 'Tri', vertices: 3, triangles: 1, skinned: false }]);
    const data = textMeshData(parseTextMesh(TRIANGLE_TXT));
    expect(data.positions[8]).toBe(0.5);
    const raw = convertTextMeshFile(TRIANGLE_TXT, { mirror: false });
    expect(raw.glb.length).toBe(result.glb.length);
  });
});
