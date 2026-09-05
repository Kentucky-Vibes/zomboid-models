import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import type { ManifestVehicle, VehicleCatalog } from '../format/manifest.js';
import type { VehicleDescription } from '../format/vehicle.js';
import { OutfitRng } from '../outfit/rng.js';

import { placeVehicleModels, resolveVehicleLook, rollVehiclePaint } from './VehicleBuilder.js';

const CAR: ManifestVehicle = {
  models: [
    {
      model: 'vehicles/vehicles_carnormal',
      shader: 'vehicle_multiuv',
      modelScale: 0.01,
      scale: 2,
      offset: [0, 0.25, 0],
      rotate: [0, 0, 0],
    },
  ],
  modelScale: 2,
  extents: [0.9, 0.65, 2.6],
  skins: [{ texture: 'vehicles/shell_a' }, { texture: 'vehicles/shell_b' }],
  wheels: [{ id: 'FrontLeft', front: true, offset: [0.4, -0.3, 0.85], radius: 0.15, width: 0.2 }],
  parts: {
    TireFrontLeft: {
      models: [
        {
          id: 'InflatedTirePlusWheel',
          model: 'vehicles_wheel',
          shader: 'vehiclewheel',
          texture: 'vehicles/vehicle_wheel',
          modelScale: 1,
          scale: 1,
          offset: [0, 0, 0],
          rotate: [0, 0, 0],
        },
      ],
      wheel: 'FrontLeft',
      category: 'tire',
    },
    Seat: {
      models: [
        {
          model: 'vehicles/seats',
          modelScale: 0.01,
          scale: 1,
          offset: [0.1, 0.2, -0.3],
          rotate: [0, 20, 0],
        },
      ],
    },
    TireRearLeft: {
      models: [
        { model: 'vehicles_wheel', modelScale: 1, scale: 1, offset: [0, 0, 0], rotate: [0, 0, 0] },
      ],
      wheel: 'RearLeft',
    },
  },
};

const CATALOG: VehicleCatalog = {
  models: {},
  textures: {},
  vehicles: { 'Base.CarNormal': CAR },
};

function doc(extra: Partial<VehicleDescription> = {}): VehicleDescription {
  return { format: 'zomboid-models/vehicle', version: 1, vehicle: 'Base.CarNormal', ...extra };
}

function decompose(matrix: { decompose: (p: Vector3, q: Quaternion, s: Vector3) => unknown }) {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, euler: new Euler().setFromQuaternion(quaternion, 'XYZ'), scale };
}

describe('placeVehicleModels', () => {
  const { placed, warnings } = placeVehicleModels(CAR, doc());

  it('scales the body by the script and model scales and lifts it by the offset', () => {
    const body = placed.find((p) => p.key === 'body');
    expect(body).toBeDefined();
    const { position, scale } = decompose(body!.matrix);
    expect(position.toArray().map((v) => +v.toFixed(6))).toEqual([0, 0.5, 0]);
    expect(scale.toArray().map((v) => +v.toFixed(6))).toEqual([0.02, 0.02, 0.02]);
  });

  it('puts a wheel at its wheel offset, mirrored into the renderer frame', () => {
    const wheel = placed.find((p) => p.key === 'TireFrontLeft');
    expect(wheel).toBeDefined();
    const { position, scale } = decompose(wheel!.matrix);
    expect(position.toArray().map((v) => +v.toFixed(6))).toEqual([-0.8, -0.1, -1.7]);
    expect(scale.toArray().map((v) => +v.toFixed(6))).toEqual([2, 2, 2]);
  });

  it('rotates part models with the sign the game applies and mirrors the result', () => {
    const seat = placed.find((p) => p.key === 'Seat');
    expect(seat).toBeDefined();
    const { position, euler, scale } = decompose(seat!.matrix);
    expect(position.toArray().map((v) => +v.toFixed(6))).toEqual([-0.2, 0.9, 0.6]);
    expect(+euler.y.toFixed(4)).toBe(+((20 * Math.PI) / 180).toFixed(4));
    expect(scale.toArray().map((v) => +v.toFixed(6))).toEqual([0.02, 0.02, 0.02]);
  });

  it('warns about a part on a wheel the script does not define', () => {
    expect(placed.some((p) => p.key === 'TireRearLeft')).toBe(false);
    expect(warnings).toEqual([
      'part "TireRearLeft" sits on wheel "RearLeft", which the script does not define',
    ]);
  });

  it('marks the models of missing parts hidden instead of leaving them out', () => {
    const without = placeVehicleModels(CAR, doc({ parts: { TireFrontLeft: { missing: true } } }));
    expect(without.placed.map((p) => [p.key, p.hidden])).toEqual([
      ['body', false],
      ['TireFrontLeft', true],
      ['Seat', false],
    ]);
  });
});

describe('resolveVehicleLook', () => {
  it('rolls the rust, the paint, and the skin from the seed', () => {
    const a = resolveVehicleLook(CATALOG, doc({ seed: 5 }));
    const b = resolveVehicleLook(CATALOG, doc({ seed: 5 }));
    expect(a.paint).toEqual(b.paint);
    expect(a.skinIndex).toBe(b.skinIndex);
    expect([0, 1]).toContain(a.rust);
    expect(a.skin).toBe(CAR.skins[a.skinIndex]);
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
      resolveVehicleLook(CATALOG, doc({ seed })),
    );
    expect(new Set(seeds.map((look) => look.paint.hue)).size).toBeGreaterThan(1);
    expect(seeds.map((look) => look.warnings)).toEqual(seeds.map(() => []));
  });

  it('keeps the values the document sets', () => {
    const look = resolveVehicleLook(
      CATALOG,
      doc({ skin: 1, rust: 0.5, paint: { hue: 0.1, saturation: 0.2, value: 0.3 } }),
    );
    expect(look.skinIndex).toBe(1);
    expect(look.rust).toBe(0.5);
    expect(look.paint).toEqual({ hue: 0.1, saturation: 0.2, value: 0.3 });
  });

  it('falls back to the first skin with a warning when the index is out of range', () => {
    const look = resolveVehicleLook(CATALOG, doc({ skin: 4 }));
    expect(look.skinIndex).toBe(0);
    expect(look.warnings).toEqual([
      'vehicle "Base.CarNormal" has 2 skins; skin 4 is not one of them',
    ]);
  });

  it('reports an unknown vehicle', () => {
    const look = resolveVehicleLook(CATALOG, doc({ vehicle: 'Base.Nope' }));
    expect(look.vehicle).toBeUndefined();
    expect(look.warnings).toEqual(['vehicle "Base.Nope" is not in the catalog']);
  });
});

describe('rollVehiclePaint', () => {
  it('draws every family the game draws and honours forced components', () => {
    const hues = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const paint = rollVehiclePaint(new OutfitRng(seed));
      expect(paint.hue).toBeGreaterThanOrEqual(0);
      expect(paint.hue).toBeLessThanOrEqual(1);
      expect(paint.saturation).toBeLessThanOrEqual(1);
      expect(paint.value).toBeLessThanOrEqual(0.85);
      hues.add(+paint.hue.toFixed(2));
    }
    expect(hues.has(0.15)).toBe(true);
    const forced = rollVehiclePaint(new OutfitRng(1), { hue: 0.33, saturation: -1, value: 0.9 });
    expect(forced.hue).toBe(0.33);
    expect(forced.value).toBe(0.9);
    expect(forced.saturation).toBeLessThanOrEqual(1);
  });
});
