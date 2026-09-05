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

  it('writes the hinged parts of a skinned vehicle closed, with their bones and clips', async () => {
    const result = convertFbxFile(
      readFileSync(join(media, 'models_X/vehicles/ModernCarWithDoors_Martin.fbx')),
    );
    expect(await validateGlb(result.glb)).toEqual([]);
    console.log(result.meshes.map((m) => `${m.name}${m.skinned ? ' (skinned)' : ''}`).join(', '));
    console.log('bones:', result.bones.join(', '));
    console.log('warnings:', result.warnings.join('; '));
    expect(result.meshes.map((m) => m.name)).toContain('Hood_mesh');
    expect(result.meshes.find((m) => m.name === 'Hood_mesh')?.skinned).toBe(true);
    expect(result.bones).toContain('Hood_bone');
    // The hood lies flat when closed: longer along the car than tall.
    const json = JSON.parse(
      new TextDecoder().decode(
        result.glb.subarray(
          20,
          20 + new DataView(result.glb.buffer, result.glb.byteOffset + 12).getUint32(0, true),
        ),
      ),
    ) as {
      meshes: { name: string; primitives: { attributes: { POSITION: number } }[] }[];
      accessors: { min: number[]; max: number[] }[];
    };
    const hood = json.meshes.find((m) => m.name === 'Hood_mesh');
    const accessor = json.accessors[hood?.primitives[0]?.attributes.POSITION ?? -1];
    expect(accessor).toBeDefined();
    const size = accessor!.max.map((v, i) => v - (accessor!.min[i] ?? 0));
    expect(size[2]).toBeGreaterThan(size[1]! * 2);
    const names = (json as { animations?: { name: string }[] }).animations?.map((a) => a.name);
    expect(names).toContain('Hood_closing');
    expect(names).toContain('DoorFrontLeft_closing');
    // The file repeats a bone's name down a short chain; the clip must drive the node a player
    // finds first by that name, which sits above the joint the hood is skinned to.
    const doc = json as unknown as {
      nodes: { name: string; children?: number[]; skin?: number }[];
      skins: { joints: number[]; name?: string }[];
      animations: { name: string; channels: { target: { node: number; path: string } }[] }[];
    };
    const first = doc.nodes.findIndex((n) => n.name === 'Hood_bone');
    const hoodClip = doc.animations.find((a) => a.name === 'Hood_closing');
    const rotation = hoodClip?.channels.find(
      (c) => c.target.path === 'rotation' && doc.nodes[c.target.node]?.name === 'Hood_bone',
    );
    expect(rotation?.target.node).toBe(first);
    const joint = doc.skins.find((s) => s.name === 'Hood_mesh')?.joints[0];
    const descendants = (id: number): number[] => [
      id,
      ...(doc.nodes[id]?.children ?? []).flatMap(descendants),
    ];
    expect(descendants(first)).toContain(joint);
  });
});
