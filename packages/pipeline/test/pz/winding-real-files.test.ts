/**
 * Runs only against a real Project Zomboid install (PZ_DIR). Checks that the converted
 * triangles are wound counter-clockwise with respect to the file's own vertex normals, which
 * is what glTF front faces require.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildMeshData, type MeshData } from '../../src/x/mesh.js';
import { mirrorMeshDataZ } from '../../src/x/mirror.js';
import { parseX } from '../../src/x/parser.js';
import { collectMeshes } from '../../src/x/skeleton.js';

const PZ_DIR = process.env['PZ_DIR'];

/** Fraction of triangles whose geometric normal points the same way as the vertex normals. */
export function windingAgreement(data: MeshData): number {
  if (!data.normals) throw new Error('mesh has no normals');
  let agree = 0;
  let total = 0;
  const p = data.positions;
  const n = data.normals;
  for (let i = 0; i + 2 < data.indices.length; i += 3) {
    const [a, b, c] = [data.indices[i], data.indices[i + 1], data.indices[i + 2]] as [
      number,
      number,
      number,
    ];
    const ux = (p[b * 3] as number) - (p[a * 3] as number);
    const uy = (p[b * 3 + 1] as number) - (p[a * 3 + 1] as number);
    const uz = (p[b * 3 + 2] as number) - (p[a * 3 + 2] as number);
    const vx = (p[c * 3] as number) - (p[a * 3] as number);
    const vy = (p[c * 3 + 1] as number) - (p[a * 3 + 1] as number);
    const vz = (p[c * 3 + 2] as number) - (p[a * 3 + 2] as number);
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const nx = (n[a * 3] as number) + (n[b * 3] as number) + (n[c * 3] as number);
    const ny = (n[a * 3 + 1] as number) + (n[b * 3 + 1] as number) + (n[c * 3 + 1] as number);
    const nz = (n[a * 3 + 2] as number) + (n[b * 3 + 2] as number) + (n[c * 3 + 2] as number);
    const dot = cx * nx + cy * ny + cz * nz;
    if (dot !== 0) {
      total++;
      if (dot > 0) agree++;
    }
  }
  return total === 0 ? 0 : agree / total;
}

describe.skipIf(!PZ_DIR)('triangle winding of converted meshes', () => {
  it('agrees with the vertex normals after mirroring', () => {
    const media = join(PZ_DIR ?? '', 'media');
    for (const relPath of [
      'models_X/Skinned/MaleBody.x',
      'models_X/Skinned/Clothes/Bob_Trousers.x',
    ]) {
      const file = parseX(readFileSync(join(media, relPath), 'utf8'));
      const mesh = collectMeshes(file.frames)[0]?.mesh;
      if (!mesh) throw new Error(`${relPath} has no mesh`);
      const raw = windingAgreement(buildMeshData(mesh, file.materials));
      const mirrored = windingAgreement(mirrorMeshDataZ(buildMeshData(mesh, file.materials)));
      expect(
        mirrored,
        `${relPath}: raw ${raw.toFixed(2)}, mirrored ${mirrored.toFixed(2)}`,
      ).toBeGreaterThan(0.9);
    }
  });
});
