/**
 * The rig of one vehicle: the body and part holders, the materials that share the shader's
 * per-zone switches, the hinged parts with their clips, and the light bar. A vehicle rig takes
 * a new description of the same vehicle and skin in place: switches, paint, rust, and missing
 * parts change without a rebuild, and a door that changes state swings at the script's rate.
 */
import {
  LoopOnce,
  Object3D,
  type AnimationAction,
  type AnimationClip,
  type ShaderMaterial,
} from 'three';

import { CharacterRig } from '../character/CharacterRig.js';
import type { ManifestVehicle, ManifestVehicleAnim, VehicleCatalog } from '../format/manifest.js';
import type { VehicleDescription } from '../format/vehicle.js';

import { resolveVehicleLook, type VehicleLook } from './VehicleBuilder.js';
import { applyVehicleMaterialState } from './VehicleMaterial.js';
import { vehicleShaderState } from './VehicleState.js';
import { lightbarSideAt, type LightbarMode, type LightbarLitSide } from './lightbar.js';
import { ZONE } from './zones.js';

/** The clips of one hinged part model and the script's anims that play them. */
interface PartMotion {
  actions: Map<string, AnimationAction>;
  anims: Record<string, ManifestVehicleAnim>;
}

/** Where a part's anim leaves the clip: the frame it holds, or the frame a transition ends on. */
export function animRestTime(anim: ManifestVehicleAnim, duration: number): number {
  const holds = anim.animate === false;
  // A held anim shows the clip's first frame in playback direction; a played one ends on the last.
  return holds === (anim.reverse !== true) ? 0 : duration;
}

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
  private readonly partMotions = new Map<string, PartMotion[]>();
  private lightbarMilliseconds = 0;
  private lightbarSide: LightbarLitSide = 0;

  constructor() {
    super(new Object3D());
  }

  /** Whether a description can be applied in place: same script and same skin. */
  matches(description: VehicleDescription, catalog: VehicleCatalog): boolean {
    if (description.vehicle !== this.description.vehicle) return false;
    return resolveVehicleLook(catalog, description).skinIndex === this.look.skinIndex;
  }

  /**
   * Applies a description of the same vehicle and skin: switches, paint, rust, missing parts,
   * and the hinged parts, which swing when their state changes.
   */
  applyDescription(description: VehicleDescription, catalog: VehicleCatalog): void {
    const previous = this.description;
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
    for (const part of this.partMotions.keys()) {
      const open = description.parts?.[part]?.open === true;
      if (open !== (previous.parts?.[part]?.open === true)) this.movePart(part, open);
    }
    this.lightbarSide =
      description.lightbar === 'left' ? 1 : description.lightbar === 'right' ? 2 : 0;
    this.lightbarMilliseconds = 0;
  }

  /**
   * Registers the clips of one hinged part model, rooted at the object that holds its bones,
   * and puts the part in the state the description gives. Returns the clips the anims name
   * that the model lacks.
   */
  addPartMotion(
    part: string,
    root: Object3D,
    clips: AnimationClip[],
    anims: Record<string, ManifestVehicleAnim>,
  ): string[] {
    const actions = new Map<string, AnimationAction>();
    const missing: string[] = [];
    for (const anim of Object.values(anims)) {
      if (actions.has(anim.anim) || missing.includes(anim.anim)) continue;
      const clip = clips.find((c) => c.name.toLowerCase() === anim.anim.toLowerCase());
      if (!clip) {
        missing.push(anim.anim);
        continue;
      }
      const action = this.mixer.clipAction(clip, root);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      actions.set(anim.anim, action);
    }
    if (actions.size === 0) return missing;
    const motion: PartMotion = { actions, anims };
    this.partMotions.set(part, [...(this.partMotions.get(part) ?? []), motion]);
    this.holdPart(motion, this.description.parts?.[part]?.open === true);
    this.mixer.update(0);
    return missing;
  }

  /** Whether any hinged part is still swinging. */
  get partsMoving(): boolean {
    for (const motions of this.partMotions.values()) {
      for (const motion of motions) {
        for (const action of motion.actions.values()) {
          if (action.isRunning()) return true;
        }
      }
    }
    return false;
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
    return super.animated || this.lightbarAnimating || this.partsMoving;
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
  setLightbar(side: LightbarLitSide): void {
    this.lightbarSide = side;
    for (const material of this.vehicleMaterials) {
      const lights = material.uniforms['TextureLightsEnables2']?.value as
        { elements: Float32Array | number[] } | undefined;
      if (!lights) continue;
      lights.elements[ZONE.lightBarLeft - 17] = side === 1 ? 1 : 0;
      lights.elements[ZONE.lightBarRight - 17] = side === 2 ? 1 : 0;
    }
  }

  /** Swings a part open or closed with its `Open` or `Close` anim, or jumps when it has none. */
  private movePart(part: string, open: boolean): void {
    for (const motion of this.partMotions.get(part) ?? []) {
      const anim = motion.anims[open ? 'Open' : 'Close'];
      const action = anim === undefined ? undefined : motion.actions.get(anim.anim);
      if (!anim || !action || anim.animate === false) {
        this.holdPart(motion, open);
        continue;
      }
      this.startAction(motion, action);
      const duration = action.getClip().duration;
      action.timeScale = (anim.reverse === true ? -1 : 1) * (anim.rate ?? 1);
      action.time = anim.reverse === true ? duration : 0;
    }
  }

  /** Holds a part still in one state: its `Opened` or `Closed` anim, else the end of the swing. */
  private holdPart(motion: PartMotion, open: boolean): void {
    const anim = motion.anims[open ? 'Opened' : 'Closed'] ?? motion.anims[open ? 'Open' : 'Close'];
    const action = anim === undefined ? undefined : motion.actions.get(anim.anim);
    if (!anim || !action) return;
    this.startAction(motion, action);
    action.time = animRestTime(anim, action.getClip().duration);
    action.paused = true;
  }

  /** Makes one action the only one playing on a part model. */
  private startAction(motion: PartMotion, action: AnimationAction): void {
    for (const other of motion.actions.values()) {
      if (other !== action) other.stop();
    }
    action.reset();
    action.timeScale = 1;
    action.play();
  }
}
