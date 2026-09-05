/**
 * Runs only against a real Project Zomboid install: set PZ_DIR to the game or dedicated server
 * folder. Converts one binary FBX (an item on the ground) and one ASCII FBX (a vehicle body).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { convertFbxFile } from '../../src/convert/fbxToGltf.js';
import { validateGlb } from '../helpers/validateGlb.js';

const PZ_DIR = process.env['PZ_DIR'];

describe.skipIf(!PZ_DIR)('FBX conversion of game files', () => {
  const media = join(PZ_DIR ?? '', 'media');

  it('converts a binary FBX item model', async () => {
    const result = convertFbxFile(readFileSync(join(media, 'models_X/WorldItems/AlarmClock.fbx')));
    expect(await validateGlb(result.glb)).toEqual([]);
    expect(result.meshes.length).toBeGreaterThanOrEqual(1);
    expect(result.meshes[0]?.vertices).toBeGreaterThan(100);
    expect(result.warnings).toEqual([]);
  });

  it('converts an ASCII FBX vehicle body with its second UV set', async () => {
    const result = convertFbxFile(
      readFileSync(join(media, 'models_X/vehicles/Vehicles_CarNormal.fbx')),
    );
    expect(await validateGlb(result.glb)).toEqual([]);
    expect(result.meshes.map((m) => m.name)).toEqual(['Vehicles_CarNormal']);
    const json = new TextDecoder().decode(result.glb.subarray(20, 20 + 200000));
    expect(json).toContain('TEXCOORD_1');
  });

  it('writes the door meshes of a skinned vehicle in their bind pose', () => {
    const result = convertFbxFile(
      readFileSync(join(media, 'models_X/vehicles/ModernCarWithDoors_Martin.fbx')),
    );
    expect(result.meshes.map((m) => m.name)).toContain('DoorFrontLeft_mesh');
    expect(result.warnings.some((w) => w.includes('bind pose'))).toBe(true);
  });
});
