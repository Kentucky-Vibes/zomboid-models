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

import { autoAnimalClip, buildAnimal } from '../animal/AnimalBuilder.js';
import { getAssetCache, type AssetCache } from '../assets/AssetCache.js';
import { ATTRIBUTION_TEXT } from '../attribution.js';
import { autoClip, buildCharacter, loadClip } from '../character/CharacterBuilder.js';
import type { CharacterRig, RigWarning } from '../character/CharacterRig.js';
import { ANIMAL_FORMAT, type AnimalDescription } from '../format/animal.js';
import { ITEM_FORMAT, type ItemDescription } from '../format/item.js';
import type { AnimalCatalog, CharacterCatalog, ItemCatalog } from '../format/manifest.js';
import type { CharacterDescription } from '../format/types.js';
import { buildItem } from '../item/ItemBuilder.js';
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

/** Any document the viewer can show. */
export type ViewerDocument = CharacterDescription | AnimalDescription | ItemDescription;

function isAnimal(document: ViewerDocument): document is AnimalDescription {
  return document.format === ANIMAL_FORMAT;
}

function isItem(document: ViewerDocument): document is ItemDescription {
  return document.format === ITEM_FORMAT;
}

export interface ViewerOptions {
  /** URL of the folder that holds `manifest.json`, with or without a trailing slash. */
  assetBaseUrl: string;
  mode?: ViewerMode;
  /** The document to show. */
  document?: ViewerDocument;
  /** The same as `document`; kept for the first releases. */
  character?: CharacterDescription;
  /**
   * Clip name from the catalog, or null for the bind pose. When omitted, the clip the game
   * would play for the document's stance and held item is used, at the game's speed.
   */
  animation?: string | null;
  /** Multiplies the playback speed; 1 when absent. */
  animationSpeed?: number;
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

/** Camera yaw for the compass direction an animal faces in the game's own avatar pictures. */
const AVATAR_DIRECTION_YAW: Record<string, number> = {
  S: 0,
  SE: 45,
  E: 90,
  NE: 135,
  N: 180,
  NW: -135,
  W: -90,
  SW: -45,
};

/**
 * One document on one canvas. The viewer owns its scene, camera, and rig, and draws through
 * the renderer shared by every viewer on the page.
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
  /** The catalog of the document being shown; each kind of subject has its own. */
  private catalog: CharacterCatalog | AnimalCatalog | ItemCatalog | undefined;
  private rig: CharacterRig | undefined;
  private clip: AnimationClip | null = null;
  private visible = false;
  private playing = true;
  private needsRender = true;
  private generation = 0;
  private disposed = false;
  private characterHeight = 1;
  private characterExtent = 1;

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

  /** The document being shown, whichever option it came through. */
  get document(): ViewerDocument | undefined {
    return this.options.document ?? this.options.character;
  }

  /** Replaces the document and rebuilds the rig. */
  async setDocument(document: ViewerDocument): Promise<void> {
    const options = { ...this.options, document };
    delete options.character;
    this.options = options;
    await this.load();
  }

  /** The same as `setDocument`; kept for the first releases. */
  setCharacter(character: CharacterDescription): Promise<void> {
    return this.setDocument(character);
  }

  /**
   * Switches the animation: a clip name, null for the bind pose, or undefined for the clip the
   * game would play for the document.
   */
  async setAnimation(animation: string | null | undefined): Promise<void> {
    const options = { ...this.options };
    delete options.animation;
    this.options = animation === undefined ? options : { ...options, animation };
    if (!this.catalog || !this.rig) return;
    await this.applyAnimation(this.catalog, this.rig, this.generation);
  }

  /** Changes the playback speed multiplier without rebuilding. */
  setAnimationSpeed(speed: number): void {
    this.options = { ...this.options, animationSpeed: speed };
    if (this.catalog && this.rig) void this.applyAnimation(this.catalog, this.rig, this.generation);
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
      const document = this.document;
      const catalog =
        document && isAnimal(document)
          ? await this.cache.loadAnimalCatalog()
          : document && isItem(document)
            ? await this.cache.loadItemCatalog()
            : await this.cache.loadCharacterCatalog();
      if (generation !== this.generation) return;
      this.catalog = catalog;
      if (!document) return;
      const built = isAnimal(document)
        ? await buildAnimal(
            {
              cache: this.cache,
              catalog: catalog as AnimalCatalog,
              composer: this.shared.composer,
            },
            document,
          )
        : isItem(document)
          ? await buildItem({ cache: this.cache, catalog: catalog as ItemCatalog }, document)
          : await buildCharacter(
              {
                cache: this.cache,
                manifest: catalog as CharacterCatalog,
                composer: this.shared.composer,
              },
              document,
            );
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
      await this.applyAnimation(catalog, this.rig, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async applyAnimation(
    catalog: CharacterCatalog | AnimalCatalog | ItemCatalog,
    rig: CharacterRig,
    generation: number,
  ): Promise<void> {
    const document = this.document;
    const speed = this.options.animationSpeed ?? 1;
    let name: string | null | undefined = this.options.animation;
    let timeScale = speed;
    let startFraction = 0;
    if (document && isItem(document)) {
      name = null;
    } else if (name === undefined && document) {
      if (isAnimal(document)) {
        const auto = autoAnimalClip(catalog as AnimalCatalog, document);
        name = auto?.clip ?? null;
        timeScale = (auto?.speed ?? 1) * speed;
      } else {
        const auto = autoClip(catalog as CharacterCatalog, document);
        name = auto.clip;
        timeScale = auto.timeScale * speed;
        startFraction = auto.startFraction;
      }
    }
    const clip =
      name === null || name === undefined || !('animations' in catalog)
        ? null
        : await loadClip(this.cache, catalog, name, rig.warnings);
    if (generation !== this.generation) return;
    this.clip = clip;
    rig.playClip(clip, { timeScale, startFraction });
    if (this.options.poseTime !== undefined) rig.freezeAt(this.options.poseTime);
    // Pose the skeleton once so the framing sees a lying or sitting body as it is, not the bind pose.
    rig.mixer.update(0);
    rig.updateMatrixWorld(true);
    this.frameCharacter();
    this.needsRender = true;
    this.syncLoop();
  }

  private frameCharacter(): void {
    if (!this.rig) return;
    const box = this.rig.bounds();
    if (box.isEmpty()) return;
    const size = box.getSize(new Vector3());
    this.characterHeight = Math.max(size.y, 0.001);
    // A lying or crawling character is wider than tall; the camera backs off for the larger side.
    this.characterExtent = Math.max(size.x, size.y, size.z, 0.001);
    const center = box.getCenter(new Vector3());
    // Put the character's feet on the origin so the camera framing is stable across outfits.
    this.rig.position.set(-center.x, -box.min.y, -center.z);
    this.placeCamera();
  }

  /** The camera defaults for the document: animals face the way the game's avatars face. */
  private defaultCamera(): Required<CameraOptions> {
    const document = this.document;
    if (document && isAnimal(document) && this.catalog && 'animals' in this.catalog) {
      const direction = this.catalog.animals[document.type]?.avatar?.direction;
      const yaw = direction === undefined ? undefined : AVATAR_DIRECTION_YAW[direction];
      if (yaw !== undefined) return { ...DEFAULT_CAMERA, yaw, pitch: 12 };
    }
    return DEFAULT_CAMERA;
  }

  private placeCamera(): void {
    const camera = { ...this.defaultCamera(), ...this.options.camera };
    const target = new Vector3(0, this.characterHeight * camera.targetHeight, 0);
    const distance = this.characterExtent * camera.distance;
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
