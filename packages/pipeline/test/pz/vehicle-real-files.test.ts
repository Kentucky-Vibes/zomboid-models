/**
 * Runs only against a real Project Zomboid install: set PZ_DIR to the game folder. Loads every
 * vehicle script with its templates, plans the vehicle catalog, and converts the wheel mesh.
 * Set PZ_REPORT to a file path to get the counts and the warnings written there.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { planVehicleAssets } from '../../src/build/vehicles.js';
import { convertTextMeshFile } from '../../src/convert/textMeshToGltf.js';
import { loadCatalog } from '../../src/game/catalog.js';
import { buildActiveFileMap } from '../../src/game/fileMap.js';
import { validateGlb } from '../helpers/validateGlb.js';

const PZ_DIR = process.env['PZ_DIR'];

describe.skipIf(!PZ_DIR)('vehicles of the game', () => {
  it('loads the vehicle scripts with their templates and plans the catalog', () => {
    const files = buildActiveFileMap(PZ_DIR ?? '', []);
    const catalog = loadCatalog(files, []);
    expect(catalog.vehicles.size).toBeGreaterThan(200);

    const car = catalog.vehicles.get('Base.CarNormal');
    expect(car?.models[0]?.file).toBe('Vehicles_CarNormal');
    expect(car?.wheels.map((w) => w.id)).toEqual([
      'FrontLeft',
      'FrontRight',
      'RearLeft',
      'RearRight',
    ]);
    expect(car?.parts.find((p) => p.id === 'TireFrontLeft')?.models[0]?.file).toBe(
      'Vehicles_Wheel',
    );
    expect(car?.parts.find((p) => p.id === 'Windshield')?.window).toBe(true);
    expect(car?.skins.length).toBeGreaterThan(0);

    const plan = planVehicleAssets(catalog);
    const vehicles = Object.keys(plan.vehicles);
    expect(vehicles.length).toBeGreaterThan(200);
    const martin = Object.entries(plan.vehicles).find(([, v]) => v.models[0]?.mesh !== undefined);
    expect(martin).toBeDefined();
    expect(martin?.[1].parts['DoorFrontLeft']?.models[0]?.mesh).toBe('DoorFrontLeft_mesh');
    const report = process.env['PZ_REPORT'];
    if (report) {
      const lines = [
        `${vehicles.length} vehicles, ${plan.models.size} models, ${plan.textures.size} textures`,
        ...plan.warnings,
        ...catalog.warnings.filter((w) => w.startsWith('vehicle')),
      ];
      writeFileSync(report, lines.join('\n'));
    }
    expect(plan.warnings.length).toBeLessThan(40);
  });

  it('converts the wheel text mesh', async () => {
    const text = readFileSync(join(PZ_DIR ?? '', 'media/models/Vehicles_Wheel.txt'), 'utf8');
    const result = convertTextMeshFile(text);
    expect(await validateGlb(result.glb)).toEqual([]);
    expect(result.meshes[0]?.vertices).toBe(52);
    expect(result.meshes[0]?.triangles).toBe(48);
  });
});
