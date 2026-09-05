import { describe, expect, it } from 'vitest';

import { parseScript } from '../src/game/scripts.js';
import { globMatch, VehicleScriptLoader } from '../src/game/vehicleScripts.js';

const TEMPLATES = `module Base {
  template vehicle Tire {
    part TireFrontLeft { wheel = FrontLeft, }
    part TireRearLeft { wheel = RearLeft, }
    part Tire* {
      category = tire,
      model InflatedTirePlusWheel { file = Vehicles_Wheel, }
    }
  }
  template vehicle Windshield {
    part Windshield { window { openable = false, } }
    part WindshieldRear { window { openable = false, } }
  }
  template vehicle PassengerSeat2 {
    passenger FrontLeft { position inside { offset = 0.17 -0.13 0.08, } position outside { offset = 0.6 -0.4 0.1, } }
    passenger FrontRight { position inside { offset = -0.17 -0.13 0.08, } }
  }
  template vehicle CarNormal {
    textureMask = Vehicles/vehicle_carnormal_mask,
    textureRust = Vehicles/Veh_Rust,
    skin { texture = Vehicles/vehicle_carnormalshell, }
    skin { texture = Vehicles/vehicle_carnormalshell2, textureMask = Vehicles/other_mask, }
    skin { textureMask = Vehicles/no_texture_here, }
    wheel FrontLeft { front = true, offset = 0.36 -0.3 0.85, radius = 0.15, width = 0.2, }
    wheel RearLeft { front = false, offset = 0.36 -0.3 -0.6, }
    extents = 0.89 0.65 2.6,
    part DoorFrontLeft { door { } }
    part TrunkDoor { hasLightsRear = true, }
  }
}`;

const VEHICLES = `module Base {
  vehicle CarNormal {
    template! = CarNormal,
    template = Tire,
    template = PassengerSeat2,
    template = Windshield/part/Windshield,
    passenger Rear* { position inside { offset = 0 0 -1, } }
    passenger RearLeft { position inside { offset = 0.17 -0.13 -0.3, } }
    template = Windshield/part/Nope,
    forcedColor = 0.5 -1 0.7,
    model { file = Vehicles_CarNormal, scale = 1.82, offset = 0.0 0.2692 0.0, }
    part DoorFrontLeft {
      model Default { file = CarDoor, offset = 0.1 0 0, rotate = 0 20 0, }
    }
    part TireFrontLeft { model InflatedTirePlusWheel { scale = 1.2, } }
    lightbar { soundSiren = Police, }
  }
  vehicle CarNormal { extents = 1 1 3, }
  vehicle Ghost { template! = Nope, model { file = Nothing, } }
}`;

function load(): VehicleScriptLoader {
  const loader = new VehicleScriptLoader();
  const files = [parseScript(TEMPLATES), parseScript(VEHICLES)];
  for (const file of files) {
    for (const module of file) {
      for (const block of module.blocks) {
        if (block.type === 'template') loader.addTemplate(block);
      }
    }
  }
  for (const file of files) {
    for (const module of file) {
      for (const block of module.blocks) {
        if (block.type === 'vehicle') loader.addVehicle(module.name, block, 'game');
      }
    }
  }
  return loader;
}

describe('globMatch', () => {
  it('matches whole ids with * as a wildcard', () => {
    expect(globMatch('Tire*', 'TireFrontLeft')).toBe(true);
    expect(globMatch('Tire*', 'FlatTire')).toBe(false);
    expect(globMatch('*Left', 'TireFrontLeft')).toBe(true);
    expect(globMatch('Seat', 'SeatFrontLeft')).toBe(false);
  });
});

describe('VehicleScriptLoader', () => {
  const loader = load();
  const car = loader.vehicles.get('Base.CarNormal');

  it('loads the template body in place with template! and merges later blocks', () => {
    expect(car).toBeDefined();
    expect(car?.textures).toEqual({
      textureMask: 'Vehicles/vehicle_carnormal_mask',
      textureRust: 'Vehicles/Veh_Rust',
    });
    expect(car?.extents).toEqual([1, 1, 3]);
    expect(car?.forcedColor).toEqual({ hue: 0.5, saturation: -1, value: 0.7 });
    expect(car?.models).toEqual([
      {
        id: undefined,
        file: 'Vehicles_CarNormal',
        scale: 1.82,
        offset: [0, 0.2692, 0],
        rotate: [0, 0, 0],
        attachmentParent: undefined,
        attachmentSelf: undefined,
        ignoreVehicleScale: false,
      },
    ]);
  });

  it('keeps skins with a texture and the vehicle-level fallbacks apart', () => {
    expect(car?.skins).toEqual([
      { texture: 'Vehicles/vehicle_carnormalshell' },
      { texture: 'Vehicles/vehicle_carnormalshell2', textureMask: 'Vehicles/other_mask' },
    ]);
  });

  it('copies parts and wheels from templates and applies glob parts to the copies', () => {
    expect(car?.wheels.map((w) => [w.id, w.front, w.offset, w.radius, w.width])).toEqual([
      ['FrontLeft', true, [0.36, -0.3, 0.85], 0.15, 0.2],
      ['RearLeft', false, [0.36, -0.3, -0.6], 0.5, 0.4],
    ]);
    const front = car?.parts.find((p) => p.id === 'TireFrontLeft');
    expect(front?.wheel).toBe('FrontLeft');
    expect(front?.category).toBe('tire');
    expect(front?.models.map((m) => [m.id, m.file, m.scale])).toEqual([
      ['InflatedTirePlusWheel', 'Vehicles_Wheel', 1.2],
    ]);
    const rear = car?.parts.find((p) => p.id === 'TireRearLeft');
    expect(rear?.models.map((m) => [m.id, m.file, m.scale])).toEqual([
      ['InflatedTirePlusWheel', 'Vehicles_Wheel', 1],
    ]);
  });

  it('copies passengers from templates and reads their inside positions', () => {
    expect(car?.passengers.map((p) => [p.id, p.inside])).toEqual([
      ['FrontLeft', [0.17, -0.13, 0.08]],
      ['FrontRight', [-0.17, -0.13, 0.08]],
      ['RearLeft', [0.17, -0.13, -0.3]],
    ]);
  });

  it('copies one part with template = X/part/Y and warns about unknown ones', () => {
    expect(car?.parts.find((p) => p.id === 'Windshield')?.window).toBe(true);
    expect(car?.parts.some((p) => p.id === 'WindshieldRear')).toBe(false);
    expect(loader.warnings).toContain(
      'Base.CarNormal: part "Nope" not found in template "Windshield"',
    );
  });

  it('reads doors, windows, rear lights, part models, and the light bar', () => {
    const door = car?.parts.find((p) => p.id === 'DoorFrontLeft');
    expect(door?.door).toBe(true);
    expect(door?.models).toEqual([
      {
        id: 'Default',
        file: 'CarDoor',
        scale: 1,
        offset: [0.1, 0, 0],
        rotate: [0, 20, 0],
        attachmentParent: undefined,
        attachmentSelf: undefined,
        ignoreVehicleScale: false,
      },
    ]);
    expect(car?.parts.find((p) => p.id === 'TrunkDoor')?.hasLightsRear).toBe(true);
    expect(car?.lightbar).toBe(true);
    expect(car?.parts.some((p) => p.id === 'lightbar')).toBe(true);
  });

  it('warns about a missing template! and still keeps the vehicle', () => {
    expect(loader.warnings).toContain('Base.Ghost: template "Nope" not found');
    expect(loader.vehicles.get('Base.Ghost')?.models[0]?.file).toBe('Nothing');
  });
});
