/**
 * The per-zone switches of the vehicle shader, derived from a vehicle description the way
 * `BaseVehicle` derives them from its parts: `doDamageOverlay` (doors, windows, bodywork),
 * `updateLights`, and `doBloodOverlay`. Written in zone numbers; the game's array indices are
 * named in comments next to each line.
 */
import type { ManifestVehicle, ManifestVehiclePart } from '../format/manifest.js';
import type { VehicleDescription, VehiclePartState } from '../format/vehicle.js';

import { ZONE, zoneOfIndex1, zoneOfIndex2, zoneValues, type ZoneValues } from './zones.js';

export interface VehicleShaderState {
  /** Zones drawn with the lights texture: headlights, brake lights, lit windows, the light bar. */
  lights: ZoneValues;
  /** Zones with the first damage texture (condition from 40 to 59). */
  damage1: ZoneValues;
  /** Zones with the second damage texture (condition below 40). */
  damage2: ZoneValues;
  /** Zones drawn in the uninstalled shade: a missing door, an open window, a missing trunk. */
  uninstall: ZoneValues;
  /** Blood intensity per zone. */
  blood: ZoneValues;
  /** Zones where blood is drawn at all. */
  bloodMask: ZoneValues;
  /** Rust texture opacity, `textureRustA`. */
  rust: number;
  /** Reflection strength of the body and the windows, as the game sets them from the rust. */
  refBody: number;
  refWindows: number;
}

/** Whether a part is installed: parts the document does not mention are installed and intact. */
function installed(state: VehiclePartState | undefined): boolean {
  return state?.missing !== true;
}

class StateBuilder {
  readonly state: VehicleShaderState = {
    lights: zoneValues(),
    damage1: zoneValues(),
    damage2: zoneValues(),
    uninstall: zoneValues(),
    blood: zoneValues(),
    bloodMask: zoneValues(),
    rust: 0,
    refBody: 0.3,
    refWindows: 0.4,
  };

  constructor(
    private readonly vehicle: ManifestVehicle,
    private readonly description: VehicleDescription,
  ) {}

  private part(id: string): ManifestVehiclePart | undefined {
    return this.vehicle.parts[id];
  }

  private partState(id: string): VehiclePartState | undefined {
    return this.description.parts?.[id];
  }

  private hasInstalled(id: string): boolean {
    return this.part(id) !== undefined && installed(this.partState(id));
  }

  /** `BaseVehicle.checkDamage`, for a zone of either matrix. */
  private checkDamage(id: string, zone: number, doBlack: boolean): void {
    const part = this.part(id);
    // Windows with their own mesh (the door cars) are never blacked out.
    if (doBlack && part && id.startsWith('Window') && part.models.some((m) => m.id === 'Default'))
      doBlack = false;
    const { damage1, damage2, uninstall } = this.state;
    damage1[zone] = 0;
    damage2[zone] = 0;
    uninstall[zone] = 0;
    if (!part) return;
    const state = this.partState(id);
    if (installed(state)) {
      const condition = state?.condition ?? 100;
      if (condition < 60 && condition >= 40) damage1[zone] = 1;
      if (condition < 40) damage2[zone] = 1;
      if (part.window && state?.open === true && doBlack) uninstall[zone] = 1;
    } else if (doBlack) {
      uninstall[zone] = 1;
    }
  }

  /** `BaseVehicle.checkUninstall2`. */
  private checkUninstall(id: string, zone: number): void {
    this.state.uninstall[zone] = 0;
    if (this.part(id) && !installed(this.partState(id))) this.state.uninstall[zone] = 1;
  }

  /** `doDoorDamage`: the rear doors fall back to the middle doors of vans. */
  doors(): void {
    this.checkDamage('DoorFrontLeft', zoneOfIndex1(1), true);
    this.checkDamage('DoorFrontRight', zoneOfIndex1(8), true);
    const rearLeft = this.part('DoorRearLeft') ? 'DoorRearLeft' : 'DoorMiddleLeft';
    if (this.part(rearLeft)) this.checkDamage(rearLeft, zoneOfIndex1(5), true);
    const rearRight = this.part('DoorRearRight') ? 'DoorRearRight' : 'DoorMiddleRight';
    if (this.part(rearRight)) this.checkDamage(rearRight, zoneOfIndex1(12), true);
  }

  /** `doWindowDamage`. */
  windows(): void {
    this.checkDamage('WindowFrontLeft', zoneOfIndex1(2), true);
    this.checkDamage('WindowFrontRight', zoneOfIndex1(9), true);
    const rearLeft = this.part('WindowRearLeft') ? 'WindowRearLeft' : 'WindowMiddleLeft';
    if (this.part(rearLeft)) this.checkDamage(rearLeft, zoneOfIndex1(6), true);
    const rearRight = this.part('WindowRearRight') ? 'WindowRearRight' : 'WindowMiddleRight';
    if (this.part(rearRight)) this.checkDamage(rearRight, zoneOfIndex1(13), true);
    this.checkDamage('Windshield', zoneOfIndex1(10), true);
    this.checkDamage('WindshieldRear', zoneOfIndex1(14), true);
  }

  /** `doOtherBodyWorkDamage`: the hood, the truck bed, and the trunk with its rear lights. */
  bodywork(): void {
    this.checkDamage('EngineDoor', zoneOfIndex1(0), false);
    this.checkDamage('EngineDoor', zoneOfIndex1(3), false);
    this.checkDamage('EngineDoor', zoneOfIndex1(11), false);
    this.checkDamage('EngineDoor', zoneOfIndex2(6), true);
    this.checkDamage('TruckBed', zoneOfIndex1(4), false);
    this.checkDamage('TruckBed', zoneOfIndex1(7), false);
    this.checkDamage('TruckBed', zoneOfIndex1(15), false);
    const trunk = this.part('TrunkDoor') ? 'TrunkDoor' : 'DoorRear';
    const part = this.part(trunk);
    if (!part) return;
    this.checkDamage(trunk, zoneOfIndex2(10), true);
    if (part.hasLightsRear) {
      this.checkUninstall(trunk, zoneOfIndex2(12));
      this.checkUninstall(trunk, zoneOfIndex2(1));
      this.checkUninstall(trunk, zoneOfIndex2(5));
      this.checkUninstall(trunk, zoneOfIndex2(9));
    }
  }

  /** `updateLights`: the interior light on the windows, the headlights, the brake lights, the light bar. */
  lights(): void {
    const { lights } = this.state;
    const interior = this.description.interiorLight === true;
    const lit = (id: string): number => (interior && this.hasInstalled(id) ? 1 : 0);
    lights[zoneOfIndex1(10)] = lit('Windshield');
    lights[zoneOfIndex1(14)] = lit('WindshieldRear');
    lights[zoneOfIndex1(2)] = lit('WindowFrontLeft');
    lights[zoneOfIndex1(6)] = Math.max(lit('WindowMiddleLeft'), lit('WindowRearLeft'));
    lights[zoneOfIndex1(9)] = lit('WindowFrontRight');
    lights[zoneOfIndex1(13)] = Math.max(lit('WindowMiddleRight'), lit('WindowRearRight'));

    const headlights = this.description.headlights === true;
    const head = (id: string): number => (headlights && this.hasInstalled(id) ? 1 : 0);
    lights[zoneOfIndex2(4)] = head('HeadlightRight');
    lights[zoneOfIndex2(8)] = head('HeadlightLeft');
    lights[zoneOfIndex2(12)] = head('HeadlightRearRight');
    lights[zoneOfIndex2(1)] = head('HeadlightRearLeft');

    const stop = this.description.stoplights === true ? 1 : 0;
    lights[zoneOfIndex2(5)] = stop;
    lights[zoneOfIndex2(9)] = stop;

    if (this.vehicle.lightbar) {
      lights[zoneOfIndex2(13)] = this.description.lightbar === 'right' ? 1 : 0;
      lights[zoneOfIndex2(2)] = this.description.lightbar === 'left' ? 1 : 0;
    }
  }

  /** `doBloodOverlay`: the intensity of each side on its zones, and the mask on every bloody zone. */
  blood(): void {
    const { blood, bloodMask } = this.state;
    const sides = this.description.blood ?? {};
    const front = sides.front ?? 0;
    const rear = sides.rear ?? 0;
    const left = sides.left ?? 0;
    const right = sides.right ?? 0;
    blood[zoneOfIndex1(0)] = front;
    blood[zoneOfIndex2(6)] = front;
    blood[zoneOfIndex2(4)] = front;
    blood[zoneOfIndex2(8)] = front;
    blood[zoneOfIndex1(10)] = front;
    blood[zoneOfIndex1(4)] = rear;
    blood[zoneOfIndex2(10)] = rear;
    blood[zoneOfIndex2(12)] = rear;
    blood[zoneOfIndex2(1)] = rear;
    blood[zoneOfIndex2(5)] = rear;
    blood[zoneOfIndex2(9)] = rear;
    blood[zoneOfIndex1(14)] = rear;
    blood[zoneOfIndex1(11)] = left;
    blood[zoneOfIndex1(1)] = left;
    blood[zoneOfIndex1(5)] = left;
    blood[zoneOfIndex1(15)] = left;
    blood[zoneOfIndex1(2)] = left;
    blood[zoneOfIndex1(6)] = left;
    blood[zoneOfIndex1(3)] = right;
    blood[zoneOfIndex1(8)] = right;
    blood[zoneOfIndex1(12)] = right;
    blood[zoneOfIndex1(7)] = right;
    blood[zoneOfIndex1(9)] = right;
    blood[zoneOfIndex1(13)] = right;
    // doBloodOverlayAux(matrixBlood2..., 1): every zone but the light bar.
    for (const k of [0, 4, 7, 15, 3, 8, 12, 11, 1, 5, 10, 14, 9, 13, 2, 6]) {
      bloodMask[zoneOfIndex1(k)] = 1;
    }
    for (const k of [6, 4, 8, 10, 12, 1, 5, 9, 0]) bloodMask[zoneOfIndex2(k)] = 1;
  }

  /** The rust opacity and the reflection strengths from `updateLights` and `update`. */
  rust(rust: number): void {
    this.state.rust = this.vehicle.wheels.length === 0 ? 0 : rust;
    this.state.refBody = 0.3;
    this.state.refWindows = 0.4;
    if (rust > 0.8) {
      this.state.refBody = 0.1;
      this.state.refWindows = 0.2;
    }
  }
}

/** Derives the shader switches of a vehicle from its description. */
export function vehicleShaderState(
  vehicle: ManifestVehicle,
  description: VehicleDescription,
  rust: number,
): VehicleShaderState {
  const builder = new StateBuilder(vehicle, description);
  builder.doors();
  builder.windows();
  builder.bodywork();
  builder.lights();
  builder.blood();
  builder.rust(rust);
  return builder.state;
}

/** The zones the state names, for tests and tools. */
export { ZONE };
