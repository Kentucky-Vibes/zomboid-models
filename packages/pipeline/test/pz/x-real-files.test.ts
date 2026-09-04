/**
 * Runs only against a real Project Zomboid install: set PZ_DIR to the game or dedicated server
 * folder. Set PZ_SWEEP=1 as well to parse every .x file under media (slow).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseX } from '../../src/x/parser.js';

const PZ_DIR = process.env['PZ_DIR'];
const SWEEP = process.env['PZ_SWEEP'] === '1';

function listXFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      listXFiles(path, out);
    } else if (entry.toLowerCase().endsWith('.x')) {
      out.push(path);
    }
  }
  return out;
}

describe.skipIf(!PZ_DIR)('parseX on game files', () => {
  const media = join(PZ_DIR ?? '', 'media');

  it('parses the male body mesh', () => {
    const file = parseX(readFileSync(join(media, 'models_X/Skinned/MaleBody.x'), 'utf8'));
    const meshes = file.frames.flatMap(function collect(frame): typeof frame.meshes {
      return [...frame.meshes, ...frame.frames.flatMap(collect)];
    });
    expect(meshes.length).toBeGreaterThanOrEqual(1);
    const body = meshes.find((m) => m.skinWeights.length > 0);
    expect(body).toBeDefined();
    expect(body?.skinHeader?.boneCount).toBe(body?.skinWeights.length);
    expect(body?.skinWeights.length).toBeGreaterThan(20);
    expect(body?.texCoords?.length).toBe(((body?.positions.length ?? 0) / 3) * 2);
    expect(body?.faces.every((f) => f.length === 3)).toBe(true);
    expect(file.materials[0]?.textureFilename).toMatch(/\.png$/i);
  });

  it('parses the idle animation', () => {
    const file = parseX(readFileSync(join(media, 'anims_X/Bob/Bob_Idle.x'), 'utf8'));
    expect(file.ticksPerSecond).toBe(4800);
    expect(file.animationSets).toHaveLength(1);
    const animations = file.animationSets[0]?.animations ?? [];
    expect(animations.length).toBeGreaterThan(30);
    expect(animations.every((a) => a.target !== undefined)).toBe(true);
    const keyTypes = new Set(animations.flatMap((a) => a.keys.map((k) => k.keyType)));
    expect([...keyTypes].sort()).toEqual([0, 1, 2]);
  });

  it.skipIf(!SWEEP)('parses every .x file under media', { timeout: 600_000 }, () => {
    const files = [...listXFiles(join(media, 'models_X')), ...listXFiles(join(media, 'anims_X'))];
    const failures: string[] = [];
    for (const path of files) {
      try {
        parseX(readFileSync(path, 'utf8'));
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(files.length).toBeGreaterThan(1000);
    expect(failures).toEqual([]);
  });
});
