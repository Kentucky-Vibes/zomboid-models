/**
 * The rig of one vehicle: the body and part holders, the materials that share the shader's
 * per-zone switches, and the light bar. A vehicle rig takes a new description of the same
 * vehicle and skin in place: switches, paint, rust, and missing parts change without a rebuild.
 */
import { Object3D, type ShaderMaterial } from 'three';

import { CharacterRig } from '../character/CharacterRig.js';
import type { ManifestVehicle, VehicleCatalog } from '../format/manifest.js';
import type { VehicleDescription } from '../format/vehicle.js';

import { resolveVehicleLook, type VehicleLook } from './VehicleBuilder.js';
import { applyVehicleMaterialState } from './VehicleMaterial.js';
import { vehicleShaderState } from './VehicleState.js';
import { lightbarSideAt, type LightbarMode, type LightbarSide } from './lightbar.js';
import { ZONE } from './zones.js';

export class VehicleRig extends CharacterRig {
  /** The holders of the part models by part id, to hide missing parts. */
  readonly partHolders = new Map<string, Object3D[]>();
  /** Every material that carries the shader's switches: the body's and the `norandom` one. */
  readonly vehicleMaterials: ShaderMaterial[] = [];
  vehicle!: ManifestVehicle;
  description!: VehicleDescription;
  look!: VehicleLook;
  /** Whether the light bar flashes with the game's pattern instead of holding the recorded side. */
  animateLightbar = true;
  private lightbarMilliseconds = 0;
  private lightbarSide: LightbarSide = 0;

  constructor() {
    super(new Object3D());
  }

  /** Whether a description can be applied in place: same script and same skin. */
  matches(description: VehicleDescription, catalog: VehicleCatalog): boolean {
    if (description.vehicle !== this.description.vehicle) return false;
    return resolveVehicleLook(catalog, description).skinIndex === this.look.skinIndex;
  }

  /** Applies a description of the same vehicle and skin: switches, paint, rust, missing parts. */
  applyDescription(description: VehicleDescription, catalog: VehicleCatalog): void {
    this.description = description;
    this.look = resolveVehicleLook(catalog, description);
    const state = vehicleShaderState(this.vehicle, description, this.look.rust);
    for (const material of this.vehicleMaterials) {
      applyVehicleMaterialState(material, this.look.paint, state);
    }
    for (const [part, holders] of this.partHolders) {
      const visible = description.parts?.[part]?.missing !== true;
      for (const holder of holders) holder.visible = visible;
    }
    this.lightbarSide =
      description.lightbar === 'left' ? 1 : description.lightbar === 'right' ? 2 : 0;
    this.lightbarMilliseconds = 0;
  }

  /** Whether the light bar runs its pattern: the vehicle has one and the document turns it on. */
  get lightbarAnimating(): boolean {
    return (
      this.animateLightbar &&
      this.vehicle.lightbar === true &&
      (this.description.lightbar !== undefined || this.description.lightbarMode !== undefined)
    );
  }

  override get animated(): boolean {
    return super.animated || this.lightbarAnimating;
  }

  override update(delta: number): void {
    super.update(delta);
    if (!this.lightbarAnimating) return;
    this.lightbarMilliseconds += delta * 1000;
    const mode: LightbarMode = this.description.lightbarMode ?? 1;
    const side = lightbarSideAt(mode, this.lightbarMilliseconds);
    if (side !== this.lightbarSide) this.setLightbar(side);
  }

  /** Lights one half of the light bar, as `updateLights` does from `getLightTexIndex`. */
  setLightbar(side: LightbarSide): void {
    this.lightbarSide = side;
    for (const material of this.vehicleMaterials) {
      const lights = material.uniforms['TextureLightsEnables2']?.value as
        { elements: Float32Array | number[] } | undefined;
      if (!lights) continue;
      lights.elements[ZONE.lightBarLeft - 17] = side === 1 ? 1 : 0;
      lights.elements[ZONE.lightBarRight - 17] = side === 2 ? 1 : 0;
    }
  }
}
