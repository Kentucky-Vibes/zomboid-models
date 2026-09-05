import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ManifestIndex, VehicleCatalog } from 'zomboid-models/format';

import { runBuild } from '../src/build/build.js';
import { SKINNED_QUAD } from './fixtures/x.js';
import { TRIANGLE_TXT } from './fixtures/textMesh.js';

/** A 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function file(path: string, content: string | Buffer): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

describe('runBuild with the vehicles subject', () => {
  let root: string;
  let game: string;
  let outDir: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'zm-build-vehicles-'));
    game = join(root, 'game');
    outDir = join(root, 'out');
    file(
      join(game, 'media', 'scripts', 'generated', 'vehicles', 'models_vehicles.txt'),
      `module Base {
        model Vehicles_CarNormal { mesh = vehicles/Vehicles_CarNormal, shader = vehicle_multiuv, scale = 0.008, }
        model Vehicles_Wheel { mesh = Vehicles_Wheel, texture = Vehicles/vehicle_wheel, shader = vehiclewheel, }
      }`,
    );
    file(
      join(game, 'media', 'scripts', 'generated', 'vehicles', 'template_tire.txt'),
      `module Base {
        template vehicle Tire {
          part TireFrontLeft { wheel = FrontLeft, }
          part Tire* { category = tire, model InflatedTirePlusWheel { file = Vehicles_Wheel, } }
        }
      }`,
    );
    file(
      join(game, 'media', 'scripts', 'generated', 'vehicles', 'vehicle_car_normal.txt'),
      `module Base {
        vehicle CarNormal {
          template = Tire,
          textureMask = Vehicles/vehicle_carnormal_mask,
          textureRust = Vehicles/Veh_Rust,
          skin { texture = Vehicles/vehicle_carnormalshell, }
          extents = 0.89 0.65 2.6,
          model { file = Vehicles_CarNormal, scale = 1.82, offset = 0.0 0.2692 0.0, }
          wheel FrontLeft { front = true, offset = 0.36 -0.3 0.85, radius = 0.15, width = 0.2, }
          part DoorFrontLeft { door { } }
        }
      }`,
    );
    file(join(game, 'media', 'models_x', 'vehicles', 'vehicles_carnormal.x'), SKINNED_QUAD);
    file(join(game, 'media', 'models', 'Vehicles_Wheel.txt'), TRIANGLE_TXT);
    for (const texture of [
      'vehicles/vehicle_carnormalshell',
      'vehicles/vehicle_carnormal_mask',
      'vehicles/vehicle_wheel',
    ]) {
      file(join(game, 'media', 'textures', `${texture}.png`), PNG);
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes a vehicle catalog with the body, the wheel text mesh, and the textures', () => {
    const report = runBuild(
      {
        gameDir: game,
        gameVersion: '42.20.3',
        modDirs: [],
        mods: undefined,
        serverIni: undefined,
        outDir,
        animations: [],
        subjects: ['vehicles'],
        languages: [],
        baseDir: root,
      },
      { info: () => undefined, warn: () => undefined },
    );
    expect(report.vehicles).toBe(1);
    const index = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as ManifestIndex;
    expect(index.catalogs.vehicles).toMatch(/^catalog-vehicles-[0-9a-f]{10}\.json$/);
    expect(index.catalogs.characters).toBeUndefined();
    const catalog = JSON.parse(
      readFileSync(join(outDir, index.catalogs.vehicles ?? ''), 'utf8'),
    ) as VehicleCatalog;
    expect(Object.keys(catalog.models).sort()).toEqual([
      'vehicles/vehicles_carnormal',
      'vehicles_wheel',
    ]);
    expect(catalog.models['vehicles_wheel']?.meshes).toEqual(['Tri']);
    expect(existsSync(join(outDir, catalog.models['vehicles_wheel']?.file ?? ''))).toBe(true);
    expect(Object.keys(catalog.textures).sort()).toEqual([
      'vehicles/vehicle_carnormal_mask',
      'vehicles/vehicle_carnormalshell',
      'vehicles/vehicle_wheel',
    ]);
    const car = catalog.vehicles['Base.CarNormal'];
    expect(car?.skins).toEqual([
      {
        texture: 'vehicles/vehicle_carnormalshell',
        textureMask: 'vehicles/vehicle_carnormal_mask',
        textureRust: 'vehicles/veh_rust',
      },
    ]);
    expect(car?.parts['TireFrontLeft']?.models[0]?.model).toBe('vehicles_wheel');
    expect(report.warnings).toContain(
      'texture "vehicles/veh_rust" has no file under media/textures',
    );
  });
});
