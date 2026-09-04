import { describe, expect, it } from 'vitest';

import { buildAnimationClips, convertRotationKey } from '../src/x/anim.js';
import { buildMeshData } from '../src/x/mesh.js';
import { parseX } from '../src/x/parser.js';
import { collectMeshes, collectSkeleton, worldTransforms } from '../src/x/skeleton.js';
import { HEADER, SIMPLE_ANIMATION, SKINNED_QUAD, TEMPLATES } from './fixtures/x.js';

describe('collectSkeleton', () => {
  it('flattens frames depth first with parent links', () => {
    const file = parseX(SKINNED_QUAD);
    const skeleton = collectSkeleton(file.frames);
    expect(skeleton.bones.map((b) => `${b.name}<${b.parent}`)).toEqual([
      'Dummy01<-1',
      'Bip01<0',
      'Bip01_Head<1',
      'Quad<-1',
    ]);
    const world = worldTransforms(skeleton);
    // Bip01_Head is 0.5 up in Bip01 space; Dummy01 turns Z-up into Y-up, so it lands on -Z.
    expect(world[2]?.slice(12, 15).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0, -0.5]);
  });

  it('rejects duplicate frame names', () => {
    const file = parseX(`${HEADER}Frame A { } Frame A { }`);
    expect(() => collectSkeleton(file.frames)).toThrow('duplicate frame name "A"');
  });
});

describe('collectMeshes', () => {
  it('finds meshes with the transform of their frame', () => {
    const file = parseX(SKINNED_QUAD);
    const placed = collectMeshes(file.frames, file.meshes);
    expect(placed).toHaveLength(1);
    expect(placed[0]?.frame).toBe('Quad');
    expect(placed[0]?.mesh.name).toBe('Quad');
  });
});

describe('buildMeshData', () => {
  it('builds indexed triangles with normals, uvs, materials, and skin', () => {
    const file = parseX(SKINNED_QUAD);
    const mesh = collectMeshes(file.frames)[0]?.mesh;
    if (!mesh) throw new Error('fixture has no mesh');
    const data = buildMeshData(mesh, file.materials);

    expect(data.name).toBe('Quad');
    expect(data.vertexCount).toBe(4);
    expect(Array.from(data.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(data.groups).toEqual([{ material: 0, start: 0, count: 6 }]);
    expect(data.materials).toEqual([
      { name: '_01_-_Default', texture: 'cloth.png', color: [1, 1, 1, 1] },
    ]);
    expect(Array.from(data.normals ?? [])).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(Array.from(data.uvs ?? [])).toEqual([0, 1, 1, 1, 1, 0, 0, 0]);

    const skin = data.skin;
    expect(skin?.bones.map((b) => b.name)).toEqual(['Bip01', 'Bip01_Head']);
    expect(skin?.bones[1]?.inverseBind[13]).toBe(-0.5);
    expect(Array.from(skin?.joints.slice(8, 12) ?? [])).toEqual([0, 1, 0, 0]);
    expect(Array.from(skin?.weights.slice(8, 12) ?? [])).toEqual([0.25, 0.75, 0, 0]);
    expect(Array.from(skin?.weights.slice(0, 4) ?? [])).toEqual([1, 0, 0, 0]);
    expect(data.warnings).toEqual([]);
  });

  it('splits vertices that use different normals, fans quads, and groups by material', () => {
    const text = `${HEADER}${TEMPLATES}
Material Red { 1;0;0;1;; 0; 0;0;0;; 0;0;0;; }
Material Blue { 0;0;1;1;; 0; 0;0;0;; 0;0;0;; }
Mesh M {
 4;
 0;0;0;, 1;0;0;, 1;1;0;, 0;1;0;;
 2;
 4;0,1,2,3;,
 3;0,2,1;;
 MeshNormals {
  2;
  0;0;1;, 0;0;-1;;
  2;
  4;0,0,0,0;,
  3;1,1,1;;
 }
 MeshMaterialList {
  2;
  2;
  1, 0;
  { Red }
  { Blue }
 }
}`;
    const file = parseX(text);
    const data = buildMeshData(
      file.meshes[0] as NonNullable<(typeof file.meshes)[0]>,
      file.materials,
    );
    expect(data.vertexCount).toBe(7);
    expect(data.groups).toEqual([
      { material: 0, start: 0, count: 3 },
      { material: 1, start: 3, count: 6 },
    ]);
    expect(Array.from(data.indices)).toEqual([4, 5, 6, 0, 1, 2, 0, 2, 3]);
    expect(Array.from(data.normals?.slice(0, 3) ?? [])).toEqual([0, 0, 1]);
    expect(Array.from(data.normals?.slice(12, 15) ?? [])).toEqual([0, 0, -1]);
    expect(data.skin).toBeNull();
  });

  it('binds unweighted vertices to the first bone and trims extra influences', () => {
    const text = `${HEADER}${TEMPLATES}
Mesh M {
 3;
 0;0;0;, 1;0;0;, 0;1;0;;
 1;
 3;0,1,2;;
 SkinWeights { "A"; 1; 0; 0.5; 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1;; }
 SkinWeights { "B"; 1; 0; 0.3; 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1;; }
 SkinWeights { "C"; 1; 0; 0.1; 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1;; }
 SkinWeights { "D"; 1; 0; 0.06; 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1;; }
 SkinWeights { "E"; 1; 0; 0.04; 1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1;; }
}`;
    const file = parseX(text);
    const data = buildMeshData(
      file.meshes[0] as NonNullable<(typeof file.meshes)[0]>,
      file.materials,
    );
    const weights = Array.from(data.skin?.weights.slice(0, 4) ?? []);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Array.from(data.skin?.joints.slice(0, 4) ?? [])).toEqual([0, 1, 2, 3]);
    expect(Array.from(data.skin?.weights.slice(4, 8) ?? [])).toEqual([1, 0, 0, 0]);
    expect(data.warnings).toEqual([
      '2 vertices have no skin weights and were bound to "A"',
      '1 vertices had more than 4 bone influences; the smallest were dropped',
    ]);
  });

  it('rejects references to unknown materials', () => {
    const text = `${HEADER}Mesh M { 3; 0;0;0;, 1;0;0;, 0;1;0;; 1; 3;0,1,2;; MeshMaterialList { 1; 1; 0; { Missing } } }`;
    const file = parseX(text);
    expect(() => buildMeshData(file.meshes[0] as NonNullable<(typeof file.meshes)[0]>, [])).toThrow(
      'unknown material "Missing"',
    );
  });
});

describe('animations', () => {
  it('inverts rotation keys into glTF quaternions', () => {
    const s = Math.SQRT1_2;
    const q = convertRotationKey([s, s, 0, 0]);
    expect(q.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-0.707107, -0, -0, 0.707107]);
  });

  it('builds clips with per-bone tracks in seconds', () => {
    const clips = buildAnimationClips(parseX(SIMPLE_ANIMATION));
    expect(clips).toHaveLength(1);
    const clip = clips[0];
    expect(clip?.name).toBe('Bob_Test');
    expect(clip?.duration).toBeCloseTo(0.5);
    const track = clip?.tracks[0];
    expect(track?.bone).toBe('Bip01');
    expect(Array.from(track?.rotation?.times ?? [])).toEqual([0, 0.5]);
    expect(Array.from(track?.rotation?.values.slice(0, 4) ?? [])).toEqual([-0, -0, -0, 1]);
    expect(Array.from(track?.translation?.values ?? [])).toEqual([
      0,
      0,
      0,
      0,
      expect.closeTo(0.1, 5),
      0,
    ]);
    expect(Array.from(track?.scale?.times ?? [])).toEqual([0]);
  });
});
