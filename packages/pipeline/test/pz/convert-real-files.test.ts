/**
 * Runs only against a real Project Zomboid install: set PZ_DIR to the game or dedicated server
 * folder. Set PZ_OUT to a folder to also write the converted GLB files there for inspection.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { convertAnimationFile } from '../../src/convert/animationToGltf.js';
import { convertMeshFile } from '../../src/convert/meshToGltf.js';
import { approxEqual, compose, decompose } from '../../src/math/matrix.js';
import { convertRotationKey } from '../../src/x/anim.js';
import { parseX } from '../../src/x/parser.js';
import { validateGlb } from '../helpers/validateGlb.js';

const PZ_DIR = process.env['PZ_DIR'];
const PZ_OUT = process.env['PZ_OUT'];

function write(name: string, glb: Uint8Array): void {
  if (!PZ_OUT) return;
  mkdirSync(PZ_OUT, { recursive: true });
  writeFileSync(join(PZ_OUT, name), glb);
}

describe.skipIf(!PZ_DIR)('conversion of game files', () => {
  const media = join(PZ_DIR ?? '', 'media');

  it('converts the male body to a skinned GLB', async () => {
    const file = parseX(readFileSync(join(media, 'models_X/Skinned/MaleBody.x'), 'utf8'));
    const result = convertMeshFile(file, { textureUri: (f) => `../textures/${f}` });
    write('MaleBody.glb', result.glb);
    expect(await validateGlb(result.glb)).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.bones).toContain('Bip01_Head');
    expect(result.bones).toContain('Translation_Data');
    expect(result.meshes.filter((m) => m.skinned).length).toBeGreaterThanOrEqual(1);
    expect(result.glb.byteLength).toBeGreaterThan(10_000);
  });

  it('converts a garment whose skeleton bones match the body', () => {
    const body = convertMeshFile(
      parseX(readFileSync(join(media, 'models_X/Skinned/MaleBody.x'), 'utf8')),
    );
    const trousers = convertMeshFile(
      parseX(readFileSync(join(media, 'models_X/Skinned/Clothes/Bob_Trousers.x'), 'utf8')),
    );
    write('Bob_Trousers.glb', trousers.glb);
    const bodyBones = new Set(body.bones);
    const garmentBones = trousers.bones.filter((b) => !b.startsWith('Bob_'));
    expect(garmentBones.every((b) => bodyBones.has(b))).toBe(true);
  });

  it('converts the idle animation and keeps the root rotation consistent with its frame', async () => {
    const file = parseX(readFileSync(join(media, 'anims_X/Bob/Bob_Idle.x'), 'utf8'));
    const result = convertAnimationFile(file);
    write('Bob_Idle.glb', result.glb);
    expect(await validateGlb(result.glb)).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]?.duration).toBeCloseTo(3200 / 4800, 5);
    expect(result.clips[0]?.tracks).toBeGreaterThan(30);

    const dummy = file.frames[0];
    const animation = file.animationSets[0]?.animations.find((a) => a.target === 'Dummy01');
    const rotationKey = animation?.keys.find((k) => k.keyType === 0)?.keys[0];
    if (!dummy?.transform || !rotationKey) throw new Error('fixture assumptions failed');
    const fromKey = compose({
      translation: [0, 0, 0],
      rotation: convertRotationKey(rotationKey.values),
      scale: [1, 1, 1],
    });
    const fromFrame = compose({
      ...decompose(dummy.transform),
      translation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    expect(approxEqual(fromKey, fromFrame, 1e-4)).toBe(true);
  });
});
