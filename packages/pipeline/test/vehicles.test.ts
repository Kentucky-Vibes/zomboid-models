import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { planVehicleAssets } from '../src/build/vehicles.js';
import { loadCatalog } from '../src/game/catalog.js';
import { ActiveFileMap } from '../src/game/fileMap.js';

const SCRIPTS = `module Base {
  model Vehicles_CarNormal { mesh = vehicles/Vehicles_CarNormal, shader = vehicle_multiuv, invertX = false, scale = 0.008, }
  model Vehicles_Wheel { mesh = Vehicles_Wheel, texture = Vehicles/vehicle_wheel, shader = vehiclewheel, }
  model CarDoor { mesh = vehicles/CarWithDoors|DoorFrontLeft_mesh, shader = vehicle, static = false, scale = 0.01, }
  template vehicle Tire {
    part TireFrontLeft { wheel = FrontLeft, }
    part Tire* { category = tire, model InflatedTirePlusWheel { file = Vehicles_Wheel, } }
  }
  vehicle CarNormal {
    template = Tire,
    textureMask = Vehicles/vehicle_carnormal_mask,
    textureLights = Vehicles/vehicle_carnormal_lights,
    textureDamage1Overlay = Vehicles/Veh_Blood_Mask,
    textureDamage2Overlay = Vehicles/Veh_Blood_Hvy,
    textureDamage1Shell = Vehicles/Veh_Damage1,
    textureDamage2Shell = Vehicles/Veh_Damage2,
    textureRust = Vehicles/Veh_Rust,
    skin { texture = Vehicles/vehicle_carnormalshell, }
    skin { texture = Vehicles/vehicle_carnormalshell2, textureRust = Vehicles/OtherRust, }
    extents = 0.89 0.65 2.6,
    forcedColor = 0.5 -1 -1,
    model { file = Vehicles_CarNormal, scale = 1.82, offset = 0.0 0.2692 0.0, }
    wheel FrontLeft { front = true, offset = 0.36 -0.3 0.85, radius = 0.15, width = 0.2, }
    part DoorFrontLeft { door { } model Default { file = CarDoor, } }
    part Windshield { window { openable = false, } }
    part TrunkDoor { hasLightsRear = true, }
    part Engine { }
    part HeadlightLeft { }
    lightbar { soundSiren = Police, }
  }
  vehicle Ghost { model { file = Nothing, } }
  vehicle Empty { extents = 1 1 1, }
}`;

describe('planVehicleAssets', () => {
  it('collects the models and textures of the vehicles and shapes the catalog entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'zm-vehicles-'));
    try {
      const scripts = join(root, 'media', 'scripts', 'vehicles');
      mkdirSync(scripts, { recursive: true });
      writeFileSync(join(scripts, 'vehicles.txt'), SCRIPTS);
      const files = new ActiveFileMap();
      files.addTree(root, 'game');
      const catalog = loadCatalog(files, []);
      expect(catalog.vehicles.size).toBe(3);
      const plan = planVehicleAssets(catalog);
      expect([...plan.models].sort()).toEqual([
        'vehicles/carwithdoors',
        'vehicles/vehicles_carnormal',
        'vehicles_wheel',
      ]);
      expect([...plan.textures].sort()).toEqual([
        'vehicles/otherrust',
        'vehicles/veh_blood_hvy',
        'vehicles/veh_blood_mask',
        'vehicles/veh_damage1',
        'vehicles/veh_damage2',
        'vehicles/veh_rust',
        'vehicles/vehicle_carnormal_lights',
        'vehicles/vehicle_carnormal_mask',
        'vehicles/vehicle_carnormalshell',
        'vehicles/vehicle_carnormalshell2',
        'vehicles/vehicle_wheel',
      ]);
      const car = plan.vehicles['Base.CarNormal'];
      expect(car).toBeDefined();
      expect(car?.models).toEqual([
        {
          model: 'vehicles/vehicles_carnormal',
          shader: 'vehicle_multiuv',
          modelScale: 0.008,
          scale: 1.82,
          offset: [0, 0.2692, 0],
          rotate: [0, 0, 0],
        },
      ]);
      expect(car?.modelScale).toBe(1.82);
      expect(car?.extents).toEqual([0.89, 0.65, 2.6]);
      expect(car?.forcedColor).toEqual({ hue: 0.5, saturation: -1, value: -1 });
      expect(car?.lightbar).toBe(true);
      expect(car?.skins).toEqual([
        {
          texture: 'vehicles/vehicle_carnormalshell',
          textureMask: 'vehicles/vehicle_carnormal_mask',
          textureLights: 'vehicles/vehicle_carnormal_lights',
          textureRust: 'vehicles/veh_rust',
          textureDamage1Overlay: 'vehicles/veh_blood_mask',
          textureDamage1Shell: 'vehicles/veh_damage1',
          textureDamage2Overlay: 'vehicles/veh_blood_hvy',
          textureDamage2Shell: 'vehicles/veh_damage2',
        },
        {
          texture: 'vehicles/vehicle_carnormalshell2',
          textureMask: 'vehicles/vehicle_carnormal_mask',
          textureLights: 'vehicles/vehicle_carnormal_lights',
          textureRust: 'vehicles/otherrust',
          textureDamage1Overlay: 'vehicles/veh_blood_mask',
          textureDamage1Shell: 'vehicles/veh_damage1',
          textureDamage2Overlay: 'vehicles/veh_blood_hvy',
          textureDamage2Shell: 'vehicles/veh_damage2',
        },
      ]);
      expect(car?.wheels).toEqual([
        { id: 'FrontLeft', front: true, offset: [0.36, -0.3, 0.85], radius: 0.15, width: 0.2 },
      ]);
      expect(Object.keys(car?.parts ?? {})).toEqual([
        'TireFrontLeft',
        'DoorFrontLeft',
        'Windshield',
        'TrunkDoor',
        'HeadlightLeft',
        'lightbar',
      ]);
      expect(car?.parts['TireFrontLeft']).toEqual({
        models: [
          {
            id: 'InflatedTirePlusWheel',
            model: 'vehicles_wheel',
            texture: 'vehicles/vehicle_wheel',
            shader: 'vehiclewheel',
            modelScale: 1,
            scale: 1,
            offset: [0, 0, 0],
            rotate: [0, 0, 0],
          },
        ],
        wheel: 'FrontLeft',
        category: 'tire',
      });
      expect(car?.parts['DoorFrontLeft']).toEqual({
        models: [
          {
            id: 'Default',
            model: 'vehicles/carwithdoors',
            mesh: 'DoorFrontLeft_mesh',
            shader: 'vehicle',
            modelScale: 0.01,
            scale: 1,
            offset: [0, 0, 0],
            rotate: [0, 0, 0],
          },
        ],
        door: true,
      });
      expect(car?.parts['Windshield']).toEqual({ models: [], window: true });
      expect(car?.parts['TrunkDoor']).toEqual({ models: [], hasLightsRear: true });
      expect(plan.vehicles['Base.Ghost']).toBeUndefined();
      expect(plan.vehicles['Base.Empty']).toBeUndefined();
      expect(plan.warnings).toEqual([
        'Base.Empty: no model block; skipped',
        'Base.Ghost: model script "Nothing" for the body is not defined',
        'Base.Ghost: the body model could not be resolved; skipped',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
