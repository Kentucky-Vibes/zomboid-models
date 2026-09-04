import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  type AnimationClip,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { getAssetCache, type AssetCache } from '../assets/AssetCache.js';
import { ATTRIBUTION_TEXT } from '../attribution.js';
import { autoIdleClip, buildCharacter, loadClip } from '../character/CharacterBuilder.js';
import type { CharacterRig, RigWarning } from '../character/CharacterRig.js';
import type { Manifest } from '../format/manifest.js';
import type { CharacterDescription } from '../format/types.js';
import { getRenderLoop, type FrameListener } from '../render/RenderLoop.js';
import { acquireSharedRenderer, type SharedRenderer } from '../render/SharedRenderer.js';

export type ViewerMode = 'viewer' | 'showcase';

export interface CameraOptions {
  /** Vertical field of view in degrees. */
  fov?: number;
  /** Distance from the target as a multiple of the character's height. */
  distance?: number;
  /** Rotation around the character in degrees; 0 faces the front. */
  yaw?: number;
  /** Elevation in degrees; 0 is level with the target. */
  pitch?: number;
  /** Where the camera looks, as a fraction of the character's height (0.5 is the middle). */
  targetHeight?: number;
}

export interface ViewerOptions {
  /** URL of the folder that holds `manifest.json`, with or without a trailing slash. */
  assetBaseUrl: string;
  mode?: ViewerMode;
  character?: CharacterDescription;
  /**
   * Clip name from the manifest, or null for the bind pose. When omitted, the idle clip the game
   * would play for the held item is used.
   */
  animation?: string | null;
  /** Freezes the animation at this time in seconds instead of playing it. */
  poseTime?: number;
  /** CSS colour, or `transparent`. */
  background?: string;
  autoRotate?: boolean;
  /** Upper bound for the device pixel ratio used for rendering. */
  maxPixelRatio?: number;
  /** Shows the wording required by The Indie Stone's terms. Defaults to true. */
  attribution?: boolean;
  camera?: CameraOptions;
  onWarning?: (warning: RigWarning) => void;
  onError?: (error: Error) => void;
}

export interface SnapshotOptions {
  width?: number;
  height?: number;
}

const DEFAULT_CAMERA: Required<CameraOptions> = {
  fov: 30,
  distance: 2.6,
  yaw: 20,
  pitch: 8,
  targetHeight: 0.5,
};

/**
 * One character on one canvas. The viewer owns its scene, camera, and character, and draws
 * through the renderer shared by every viewer on the page.
 */
export class Viewer implements FrameListener {
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.01, 100);
  private readonly cache: AssetCache;
  private readonly shared: SharedRenderer;
  private readonly controls: OrbitControls | undefined;
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private readonly reducedMotion: MediaQueryList;
  private readonly attribution: HTMLElement | undefined;
  private options: ViewerOptions;
  private manifest: Manifest | undefined;
  private rig: CharacterRig | undefined;
  private clip: AnimationClip | null = null;
  private visible = false;
  private playing = true;
  private needsRender = true;
  private generation = 0;
  private disposed = false;
  private characterHeight = 1;

  constructor(host: HTMLElement, options: ViewerOptions) {
    this.options = options;
    this.cache = getAssetCache(options.assetBaseUrl);
    this.shared = acquireSharedRenderer();

    this.element = document.createElement('div');
    this.element.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this.element.append(this.canvas);
    if (options.attribution !== false) {
      this.attribution = document.createElement('div');
      this.attribution.textContent = ATTRIBUTION_TEXT;
      this.attribution.style.cssText =
        'position:absolute;right:4px;bottom:4px;max-width:60%;font:10px/1.2 sans-serif;' +
        'color:rgba(255,255,255,0.7);text-shadow:0 0 2px #000;pointer-events:none;text-align:right;';
      this.element.append(this.attribution);
    }
    host.append(this.element);

    this.scene.add(new HemisphereLight(0xffffff, 0x666666, 1.6));
    const key = new DirectionalLight(0xffffff, 1.2);
    key.position.set(1, 2, 2);
    this.scene.add(key);
    this.applyBackground();

    const mode = options.mode ?? 'viewer';
    if (mode === 'viewer') {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enablePan = false;
      this.controls.enableDamping = true;
      this.controls.autoRotate = options.autoRotate ?? false;
      this.controls.addEventListener('change', () => {
        this.needsRender = true;
      });
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
      this.syncLoop();
    });
    this.intersectionObserver.observe(this.element);
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion.addEventListener('change', this.syncLoop);

    this.resize();
    this.placeCamera();
    void this.load();
  }

  /** Replaces the character and rebuilds the rig. */
  async setCharacter(character: CharacterDescription): Promise<void> {
    this.options = { ...this.options, character };
    await this.load();
  }

  /** Switches the animation; null shows the bind pose. */
  async setAnimation(animation: string | null): Promise<void> {
    this.options = { ...this.options, animation };
    if (!this.manifest || !this.rig) return;
    await this.applyAnimation(this.manifest, this.rig, this.generation);
  }

  play(): void {
    this.playing = true;
    this.rig?.resume();
    this.syncLoop();
  }

  pause(): void {
    this.playing = false;
    this.syncLoop();
  }

  /** Renders the current frame to a PNG data URL, at the canvas size unless a size is given. */
  toImage(options: SnapshotOptions = {}): string {
    const width = options.width ?? this.canvas.width;
    const height = options.height ?? this.canvas.height;
    const aspect = this.camera.aspect;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const url = this.shared.snapshot(this.scene, this.camera, width, height);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    return url;
  }

  onFrame(delta: number): void {
    if (this.rig && this.playing && this.clip && this.options.poseTime === undefined) {
      this.rig.mixer.update(delta);
      this.needsRender = true;
    }
    if (this.controls) {
      this.controls.update(delta);
      if (this.controls.autoRotate) this.needsRender = true;
    }
    if (this.needsRender) {
      this.needsRender = false;
      this.shared.renderTo(this.canvas, this.scene, this.camera);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    getRenderLoop().remove(this);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener('change', this.syncLoop);
    this.controls?.dispose();
    this.rig?.dispose();
    this.rig = undefined;
    this.element.remove();
    this.shared.release();
  }

  private async load(): Promise<void> {
    const generation = ++this.generation;
    try {
      const manifest = await this.cache.loadManifest();
      if (generation !== this.generation) return;
      this.manifest = manifest;
      const character = this.options.character;
      if (!character) return;
      const built = await buildCharacter(this.cache, manifest, character);
      if (generation !== this.generation) {
        built.rig.dispose();
        return;
      }
      for (const warning of built.warnings) this.options.onWarning?.(warning);
      this.rig?.dispose();
      this.rig?.removeFromParent();
      this.rig = built.rig;
      this.scene.add(this.rig);
      this.frameCharacter();
      await this.applyAnimation(manifest, this.rig, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async applyAnimation(
    manifest: Manifest,
    rig: CharacterRig,
    generation: number,
  ): Promise<void> {
    const character = this.options.character;
    const name =
      this.options.animation === undefined && character
        ? autoIdleClip(manifest, character)
        : this.options.animation;
    const clip =
      name === null || name === undefined
        ? null
        : await loadClip(this.cache, manifest, name, rig.warnings);
    if (generation !== this.generation) return;
    this.clip = clip;
    rig.playClip(clip);
    if (this.options.poseTime !== undefined) rig.freezeAt(this.options.poseTime);
    this.needsRender = true;
    this.syncLoop();
  }

  private frameCharacter(): void {
    if (!this.rig) return;
    const box = this.rig.bounds();
    if (box.isEmpty()) return;
    const size = box.getSize(new Vector3());
    this.characterHeight = Math.max(size.y, 0.001);
    const center = box.getCenter(new Vector3());
    // Put the character's feet on the origin so the camera framing is stable across outfits.
    this.rig.position.set(-center.x, -box.min.y, -center.z);
    this.placeCamera();
  }

  private placeCamera(): void {
    const camera = { ...DEFAULT_CAMERA, ...this.options.camera };
    const target = new Vector3(0, this.characterHeight * camera.targetHeight, 0);
    const distance = this.characterHeight * camera.distance;
    const yaw = (camera.yaw * Math.PI) / 180;
    const pitch = (camera.pitch * Math.PI) / 180;
    this.camera.fov = camera.fov;
    this.camera.position.set(
      target.x + distance * Math.cos(pitch) * Math.sin(yaw),
      target.y + distance * Math.sin(pitch),
      target.z + distance * Math.cos(pitch) * Math.cos(yaw),
    );
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.copy(target);
      this.controls.minDistance = distance / 4;
      this.controls.maxDistance = distance * 4;
      this.controls.update();
    }
    this.needsRender = true;
  }

  private applyBackground(): void {
    const background = this.options.background ?? 'transparent';
    this.scene.background = background === 'transparent' ? null : new Color(background);
  }

  private resize(): void {
    const ratio = Math.min(devicePixelRatio || 1, this.options.maxPixelRatio ?? 2);
    const width = Math.max(1, Math.round(this.element.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.element.clientHeight * ratio));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
    this.syncLoop();
  }

  private readonly syncLoop = (): void => {
    if (this.disposed) return;
    const showcase = (this.options.mode ?? 'viewer') === 'showcase';
    const motionAllowed = !(showcase && this.reducedMotion.matches);
    const animating =
      this.playing && this.clip !== null && this.options.poseTime === undefined && motionAllowed;
    const interactive = this.controls !== undefined;
    if (this.visible && (animating || interactive || this.needsRender)) {
      getRenderLoop().add(this);
    } else {
      getRenderLoop().remove(this);
    }
  };
}
