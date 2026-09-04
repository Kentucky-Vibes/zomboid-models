import { describe, expect, it } from 'vitest';

import { parseX } from '../src/x/parser.js';
import { tokenize, XSyntaxError } from '../src/x/tokenizer.js';
import { HEADER, IDENTITY, SIMPLE_ANIMATION, SKINNED_QUAD, TEMPLATES } from './fixtures/x.js';

describe('tokenize', () => {
  it('rejects files without the xof header', () => {
    expect(() => tokenize('nope')).toThrow(XSyntaxError);
  });

  it('classifies identifiers, numbers, strings, and uuids, and drops separators', () => {
    const tokens = tokenize(
      `${HEADER}Frame _14_-_Default { -0.5;3, .25;; "a b" <3d82ab46-62da> } // c\n# d`,
    );
    expect(tokens.map((t) => `${t.type}:${t.text}`)).toEqual([
      'ident:Frame',
      'ident:_14_-_Default',
      'open:{',
      'number:-0.5',
      'number:3',
      'number:.25',
      'string:a b',
      'uuid:3d82ab46-62da',
      'close:}',
    ]);
  });

  it('reports the line of unexpected characters', () => {
    expect(() => tokenize(`${HEADER}\n\n@`)).toThrow('line 4');
  });

  it('tokenizes template declarations with brackets and ellipses', () => {
    const tokens = tokenize(
      `${HEADER}template Frame {\n <3d82ab46>\n [...]\n array DWORD a[n];\n}`,
    );
    expect(tokens.filter((t) => t.type === 'punct').map((t) => t.text)).toEqual([
      '[',
      '...',
      ']',
      '[',
      ']',
    ]);
  });
});

describe('parseX', () => {
  it('parses materials, frames, and a skinned mesh', () => {
    const file = parseX(SKINNED_QUAD);

    expect(file.materials).toHaveLength(1);
    expect(file.materials[0]).toMatchObject({
      name: '_01_-_Default',
      faceColor: [1, 1, 1, 1],
      textureFilename: 'cloth.png',
    });

    expect(file.frames.map((f) => f.name)).toEqual(['Dummy01', 'Quad']);
    const dummy = file.frames[0];
    expect(dummy?.transform?.slice(4, 8)).toEqual([0, -0, -1, 0]);
    expect(dummy?.frames[0]?.name).toBe('Bip01');
    expect(dummy?.frames[0]?.frames[0]?.name).toBe('Bip01_Head');
    expect(dummy?.frames[0]?.frames[0]?.transform?.[13]).toBe(0.5);

    const mesh = file.frames[1]?.meshes[0];
    expect(mesh?.name).toBe('Quad');
    expect(mesh?.positions).toHaveLength(12);
    expect(mesh?.faces).toEqual([
      [0, 1, 2],
      [0, 2, 3],
    ]);
    expect(mesh?.normals).toEqual({
      values: [0, 0, 1],
      faces: [
        [0, 0, 0],
        [0, 0, 0],
      ],
    });
    expect(mesh?.texCoords).toEqual([0, 1, 1, 1, 1, 0, 0, 0]);
    expect(mesh?.materialList).toEqual({
      materials: [{ kind: 'ref', name: '_01_-_Default' }],
      faceMaterials: [0, 0],
    });
    expect(mesh?.skinHeader).toEqual({
      maxWeightsPerVertex: 2,
      maxWeightsPerFace: 3,
      boneCount: 2,
    });
    expect(mesh?.skinWeights.map((s) => s.bone)).toEqual(['Bip01', 'Bip01_Head']);
    expect(mesh?.skinWeights[1]).toMatchObject({
      vertexIndices: [2, 3],
      weights: [0.75, 0.75],
    });
    expect(mesh?.skinWeights[1]?.offsetMatrix[13]).toBe(-0.5);
  });

  it('parses animation sets with quaternion, scale, and position keys', () => {
    const file = parseX(SIMPLE_ANIMATION);

    expect(file.ticksPerSecond).toBe(4800);
    expect(file.animationSets).toHaveLength(1);
    const set = file.animationSets[0];
    expect(set?.name).toBe('Bob_Test');
    const animation = set?.animations[0];
    expect(animation?.target).toBe('Bip01');
    expect(animation?.keys.map((k) => k.keyType)).toEqual([0, 1, 2]);
    expect(animation?.keys[0]?.keys).toEqual([
      { time: 0, values: [1, 0, 0, 0] },
      { time: 2400, values: [0.707107, 0.707107, 0, 0] },
    ]);
    expect(animation?.keys[2]?.keys[1]).toEqual({ time: 2400, values: [0, 0.1, 0] });
  });

  it('skips unknown objects and inline materials in material lists', () => {
    const text = `${HEADER}${TEMPLATES}
Mesh M {
 3;
 0;0;0;,
 1;0;0;,
 0;1;0;;
 1;
 3;0,1,2;;
 VertexDuplicationIndices {
  3;
  3;
  0,
  1,
  2;
 }
 MeshMaterialList {
  1;
  1;
  0;
  Material {
   1.0;0.0;0.0;1.0;;
   0.0;
   0.0;0.0;0.0;;
   0.0;0.0;0.0;;
  }
 }
}
AnimationSet {
 Animation {
  { M }
  AnimationOptions {
   1;
   0;
  }
  AnimationKey {
   4;
   1;
   0;16;${IDENTITY.slice(0, -2)};;;
  }
 }
}
`;
    const file = parseX(text);
    expect(file.meshes).toHaveLength(1);
    expect(file.meshes[0]?.materialList?.materials[0]).toEqual({
      kind: 'inline',
      material: {
        name: undefined,
        faceColor: [1, 0, 0, 1],
        power: 0,
        specular: [0, 0, 0],
        emissive: [0, 0, 0],
        textureFilename: undefined,
      },
    });
    expect(file.animationSets[0]?.animations[0]?.keys[0]).toMatchObject({ keyType: 4 });
    expect(file.animationSets[0]?.animations[0]?.keys[0]?.keys[0]?.values).toHaveLength(16);
  });

  it('reports structural errors with line numbers', () => {
    expect(() => parseX(`${HEADER}Mesh M {\n 1;\n 0;0;0;;\n 1;\n 2;0,1;;\n}`)).toThrow(
      'line 6: face with 2 indices',
    );
    expect(() => parseX(`${HEADER}Frame F {`)).toThrow('unexpected end of file');
    expect(() => parseX(`${HEADER}AnimationSet { Animation { AnimationKey { 3; 0; } } }`)).toThrow(
      'unknown animation key type 3',
    );
  });
});
