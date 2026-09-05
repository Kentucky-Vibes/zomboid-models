import { describe, expect, it } from 'vitest';

import type { ManifestVehicle, ManifestVehicleModel } from '../format/manifest.js';
import type { VehicleDescription } from '../format/vehicle.js';

import { vehicleShaderState } from './VehicleState.js';
import { ZONE, ZONE_COUNT, zoneOfIndex1, zoneOfIndex2 } from './zones.js';

const MODEL: ManifestVehicleModel = {
  model: 'vehicles/car',
  modelScale: 0.01,
  scale: 1.8,
  offset: [0, 0, 0],
  rotate: [0, 0, 0],
};

function vehicle(overrides: Partial<ManifestVehicle> = {}): ManifestVehicle {
  const part = (extra: object = {}): ManifestVehicle['parts'][string] => ({ models: [], ...extra });
  return {
    models: [MODEL],
    modelScale: 1.8,
    extents: [1, 1, 3],
    skins: [{ texture: 'vehicles/shell' }],
    wheels: [{ id: 'FrontLeft', front: true, offset: [0.4, -0.3, 0.8], radius: 0.15, width: 0.2 }],
    parts: {
      DoorFrontLeft: part({ door: true }),
      DoorFrontRight: part({ door: true }),
      DoorRearLeft: part({ door: true }),
      DoorRearRight: part({ door: true }),
      WindowFrontLeft: part({ window: true }),
      WindowFrontRight: part({ window: true }),
      WindowRearLeft: part({ window: true }),
      WindowRearRight: part({ window: true }),
      Windshield: part({ window: true }),
      WindshieldRear: part({ window: true }),
      EngineDoor: part(),
      TrunkDoor: part({ hasLightsRear: true }),
      HeadlightLeft: part(),
      HeadlightRight: part(),
      HeadlightRearLeft: part(),
      HeadlightRearRight: part(),
    },
    lightbar: true,
    ...overrides,
  };
}

function describe_(extra: Partial<VehicleDescription> = {}): VehicleDescription {
  return { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarNormal', ...extra };
}

function onZones(values: Float32Array): number[] {
  const zones: number[] = [];
  for (let zone = 1; zone <= ZONE_COUNT; zone++) if ((values[zone] ?? 0) > 0) zones.push(zone);
  return zones;
}

describe('zone indices', () => {
  it('maps the game array indices to the zones the shader names', () => {
    // `doDoorDamage` uses 1, 8, 5, 12 for the four doors.
    expect([1, 8, 5, 12].map(zoneOfIndex1)).toEqual([
      ZONE.doorLeftHead,
      ZONE.doorRightHead,
      ZONE.doorLeftTail,
      ZONE.doorRightTail,
    ]);
    // `updateLights` uses 4, 8, 12, 1 of the second array for the four headlights.
    expect([4, 8, 12, 1].map(zoneOfIndex2)).toEqual([
      ZONE.lightsRightHead,
      ZONE.lightsLeftHead,
      ZONE.lightsRightTail,
      ZONE.lightsLeftTail,
    ]);
    expect(zoneOfIndex2(10)).toBe(ZONE.boot);
    expect(zoneOfIndex2(6)).toBe(ZONE.hood);
  });
});

describe('vehicleShaderState', () => {
  it('shows nothing on an intact vehicle with its lights off', () => {
    const state = vehicleShaderState(vehicle(), describe_(), 0);
    expect(onZones(state.damage1)).toEqual([]);
    expect(onZones(state.damage2)).toEqual([]);
    expect(onZones(state.uninstall)).toEqual([]);
    expect(onZones(state.lights)).toEqual([]);
    expect(onZones(state.blood)).toEqual([]);
    expect(state.rust).toBe(0);
    expect(state.refBody).toBe(0.3);
  });

  it('grades damage by condition like checkDamage', () => {
    const state = vehicleShaderState(
      vehicle(),
      describe_({
        parts: { DoorFrontLeft: { condition: 59 }, DoorFrontRight: { condition: 39 } },
      }),
      0,
    );
    expect(onZones(state.damage1)).toEqual([ZONE.doorLeftHead]);
    expect(onZones(state.damage2)).toEqual([ZONE.doorRightHead]);
    expect(onZones(state.uninstall)).toEqual([]);
  });

  it('blacks out missing doors and open or missing windows', () => {
    const state = vehicleShaderState(
      vehicle(),
      describe_({
        parts: {
          DoorRearLeft: { missing: true },
          WindowFrontLeft: { open: true },
          Windshield: { missing: true },
        },
      }),
      0,
    );
    expect(onZones(state.uninstall)).toEqual([
      ZONE.doorLeftTail,
      ZONE.windowLeftHead,
      ZONE.windshield,
    ]);
  });

  it('keeps windows with their own mesh out of the black', () => {
    const doorCar = vehicle();
    doorCar.parts['WindowFrontLeft'] = {
      models: [{ ...MODEL, id: 'Default' }],
      window: true,
    };
    const state = vehicleShaderState(
      doorCar,
      describe_({ parts: { WindowFrontLeft: { open: true } } }),
      0,
    );
    expect(onZones(state.uninstall)).toEqual([]);
  });

  it('spreads hood damage over the front zones and blacks only the hood itself', () => {
    const damaged = vehicleShaderState(
      vehicle(),
      describe_({ parts: { EngineDoor: { condition: 50 } } }),
      0,
    );
    expect(onZones(damaged.damage1)).toEqual([
      ZONE.head,
      ZONE.guardRightHead,
      ZONE.guardLeftHead,
      ZONE.hood,
    ]);
    const missing = vehicleShaderState(
      vehicle(),
      describe_({ parts: { EngineDoor: { missing: true } } }),
      0,
    );
    expect(onZones(missing.uninstall)).toEqual([ZONE.hood]);
  });

  it('blacks the rear lights with a missing trunk that carries them', () => {
    const state = vehicleShaderState(
      vehicle(),
      describe_({ parts: { TrunkDoor: { missing: true } } }),
      0,
    );
    expect(onZones(state.uninstall)).toEqual([
      ZONE.lightsRightTail,
      ZONE.lightsLeftTail,
      ZONE.stopLightsRight,
      ZONE.stopLightsLeft,
      ZONE.boot,
    ]);
  });

  it('lights the zones updateLights lights', () => {
    const state = vehicleShaderState(
      vehicle(),
      describe_({
        headlights: true,
        stoplights: true,
        interiorLight: true,
        lightbar: 'left',
        parts: { HeadlightRearRight: { missing: true }, WindowRearLeft: { missing: true } },
      }),
      0,
    );
    expect(onZones(state.lights)).toEqual([
      ZONE.windowRightHead,
      ZONE.windowRightTail,
      ZONE.windowLeftHead,
      ZONE.windshield,
      ZONE.windshieldRear,
      ZONE.lightsRightHead,
      ZONE.lightsLeftHead,
      ZONE.lightsLeftTail,
      ZONE.stopLightsRight,
      ZONE.stopLightsLeft,
      ZONE.lightBarLeft,
    ]);
  });

  it('ignores the light bar of vehicles without one', () => {
    const plain = vehicle();
    delete plain.lightbar;
    const state = vehicleShaderState(plain, describe_({ lightbar: 'right' }), 0);
    expect(onZones(state.lights)).toEqual([]);
  });

  it('puts blood on the zones of each side and enables the mask everywhere but the light bar', () => {
    const state = vehicleShaderState(vehicle(), describe_({ blood: { front: 0.5, right: 1 } }), 0);
    expect(state.blood[ZONE.head]).toBe(0.5);
    expect(state.blood[ZONE.hood]).toBe(0.5);
    expect(state.blood[ZONE.windshield]).toBe(0.5);
    expect(state.blood[ZONE.lightsLeftHead]).toBe(0.5);
    expect(state.blood[ZONE.doorRightHead]).toBe(1);
    expect(state.blood[ZONE.guardRightTail]).toBe(1);
    expect(state.blood[ZONE.doorLeftHead]).toBe(0);
    expect(onZones(state.bloodMask)).toHaveLength(ZONE_COUNT - 2);
    expect(state.bloodMask[ZONE.lightBarLeft]).toBe(0);
    expect(state.bloodMask[ZONE.lightBarRight]).toBe(0);
    expect(state.bloodMask[ZONE.roof]).toBe(1);
  });

  it('applies rust only to vehicles with wheels and weakens reflections on rusty ones', () => {
    const rusty = vehicleShaderState(vehicle(), describe_(), 1);
    expect(rusty.rust).toBe(1);
    expect(rusty.refBody).toBe(0.1);
    expect(rusty.refWindows).toBe(0.2);
    const trailer = vehicleShaderState(vehicle({ wheels: [] }), describe_(), 1);
    expect(trailer.rust).toBe(0);
  });
});
