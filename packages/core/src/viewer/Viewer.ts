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
import { autoClip, buildCharacter, loadClipSet } from '../character/CharacterBuilder.js';
import type { CharacterRig, RigWarning } from '../character/CharacterRig.js';
import { ANIMAL_FORMAT, type AnimalDescription } from '../format/animal.js';
import type { SubjectDescription } from '../format/document.js';
import { ITEM_FORMAT, type ItemDescription } from '../format/item.js';
import { SCENE_FORMAT, type SceneDescription } from '../format/scene.js';
import type {
  AnimalCatalog,
  CharacterCatalog,
  ItemCatalog,
  ManifestClip,
  ManifestIndex,
  VehicleCatalog,
} from '../format/manifest.js';
import type { CharacterDescription } from '../format/types.js';
import { VEHICLE_FORMAT, type VehicleDescription } from '../format/vehicle.js';
import { buildItem } from '../item/ItemBuilder.js';
import { buildScene } from '../scene/SceneBuilder.js';
import { lightingLinear, resolveLighting, type LightingOption } from '../lighting/gameLight.js';
import { buildVehicle } from '../vehicle/VehicleBuilder.js';
import { scaledVehicleLighting, type VehicleLighting } from '../vehicle/VehicleMaterial.js';
import { VehicleRig } from '../vehicle/VehicleRig.js';
import { PACKAGE_VERSION, majorVersion } from '../version.js';
import { getRenderLoop } from '../render/RenderLoop.js';
import { acquireSharedRenderer, type SharedRenderer } from '../render/SharedRenderer.js';

/**
 * `viewer` orbits and zooms; `showcase` plays without controls and pauses off screen; `image`
 * draws nothing on its own and exists to be asked for a picture through `toImage()`, with the
 * animation held at `poseTime` (0 when absent).
 */
export type ViewerMode = 'viewer' | 'showcase' | 'image';

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
function isAnimal(document: SubjectDescription): document is AnimalDescription {
  return document.format === ANIMAL_FORMAT;
}

function isItem(document: SubjectDescription): document is ItemDescription {
  return document.format === ITEM_FORMAT;
}

function isVehicle(document: SubjectDescription): document is VehicleDescription {
  return document.format === VEHICLE_FORMAT;
}

function isScene(document: SubjectDescription): document is SceneDescription {
  return document.format === SCENE_FORMAT;
}

export interface ViewerOptions {
  /** URL of the folder that holds `manifest.json`, with or without a trailing slash. */
  assetBaseUrl: string;
  mode?: ViewerMode;
  /** The document to show. */
  document?: SubjectDescription;
  /** The same as `document`; kept for the first releases. */
  character?: CharacterDescription;
  /**
   * Clip name from the catalog, or null for the bind pose. When omitted, the clip the game
   * would play for the document's stance and held item is used, at the game's speed.
   */
  animation?: string | null;
  /** Multiplies the playback speed; 1 when absent. */
  animationSpeed?: number;
  /** Draws the game's shadows under characters, animals, and vehicles; on by default. */
  shadow?: boolean;
  /** Flashes a vehicle's light bar with the game's pattern; on by default. */
  animateLightbar?: boolean;
  /**
   * The light of a time of day, as the game computes it: a preset (`day`, `dusk`, `night`,
   * or the neutral `studio`) or an hour with a season and a moon. Defaults to `day`.
   */
  lighting?: LightingOption;
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
  /** `image/png` (the default) or `image/webp`. */
  type?: 'image/png' | 'image/webp';
  /** Compression quality from 0 to 1 for WebP. */
  quality?: number;
}

const DEFAULT_CAMERA: Required<CameraOptions> = {
  fov: 30,
  distance: 2.6,
  yaw: 20,
  pitch: 8,
  targetHeight: 0.5,
};

/** Vehicles are long and low: a three-quarter view from the front left, from a little above. */
const VEHICLE_CAMERA: Required<CameraOptions> = {
  fov: 30,
  distance: 2,
  yaw: -145,
  pitch: 18,
  targetHeight: 0.5,
};

/** Scenes are wide and low: a three-quarter view from a little above, aimed low. */
const SCENE_CAMERA: Required<CameraOptions> = {
  fov: 30,
  distance: 1.7,
  yaw: 30,
  pitch: 16,
  targetHeight: 0.35,
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
export class Viewer {
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.01, 100);
  private readonly vehicleLighting: VehicleLighting;
  private readonly cache: AssetCache;
  private readonly shared: SharedRenderer;
  private readonly controls: OrbitControls | undefined;
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private readonly reducedMotion: MediaQueryList;
  private readonly attribution: HTMLElement | undefined;
  private options: ViewerOptions;
  /** The catalog of the document being shown; each kind of subject has its own. */
  private catalog: CharacterCatalog | AnimalCatalog | ItemCatalog | VehicleCatalog | undefined;
  private rig: CharacterRig | undefined;
  private clip: AnimationClip | null = null;
  private visible = false;
  private playing = true;
  private needsRender = true;
  private generation = 0;
  private disposed = false;
  private versionWarned = false;
  private readonly releaseContext: () => void;
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

    const lighting = resolveLighting(options.lighting);
    this.vehicleLighting = scaledVehicleLighting(lighting.factor);
    const light = new Color(...lightingLinear(lighting));
    this.scene.add(new HemisphereLight(light, new Color(0x666666).multiply(light), 1.6));
    const key = new DirectionalLight(light, 1.2);
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
    this.releaseContext = this.shared.onContext({
      lost: () =>
        this.options.onWarning?.({
          code: 'context-lost',
          message:
            'the browser dropped the WebGL context; the picture returns when the browser restores it',
        }),
      restored: () => {
        this.needsRender = true;
        this.syncLoop();
      },
    });

    this.resize();
    this.placeCamera();
    void this.load();
  }

  /** The document being shown. */
  get document(): SubjectDescription | undefined {
    return this.options.document;
  }

  /** Replaces the document; a vehicle of the same script and skin updates in place. */
  async setDocument(document: SubjectDescription): Promise<void> {
    this.options = { ...this.options, document };
    const rig = this.rig;
    if (
      rig instanceof VehicleRig &&
      isVehicle(document) &&
      this.catalog &&
      'vehicles' in this.catalog &&
      rig.matches(document, this.catalog)
    ) {
      rig.applyDescription(document, this.catalog);
      rig.refreshShadow();
      this.needsRender = true;
      this.syncLoop();
      return;
    }
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

  /** Holds the animation at a time in seconds, or lets it play again with `undefined`. */
  setPoseTime(seconds: number | undefined): void {
    const options = { ...this.options };
    delete options.poseTime;
    this.options = seconds === undefined ? options : { ...options, poseTime: seconds };
    const poseTime = this.poseTime();
    if (this.rig) {
      if (poseTime === undefined) this.rig.resume();
      else this.rig.freezeAt(poseTime);
      this.rig.refreshShadow();
    }
    this.needsRender = true;
    this.syncLoop();
  }

  /** Turns the light bar pattern of a vehicle on or off without rebuilding. */
  setAnimateLightbar(animate: boolean): void {
    this.options = { ...this.options, animateLightbar: animate };
    if (this.rig instanceof VehicleRig) this.rig.animateLightbar = animate;
    this.needsRender = true;
    this.syncLoop();
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
    const url = this.shared.snapshot(
      this.scene,
      this.camera,
      width,
      height,
      options.type,
      options.quality,
    );
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    return url;
  }

  /** The time the animation is held at: the option, or the first frame in image mode. */
  private poseTime(): number | undefined {
    return this.options.poseTime ?? (this.options.mode === 'image' ? 0 : undefined);
  }

  private readonly frame = (delta: number): void => {
    if (this.rig && this.playing && this.rig.animated && this.poseTime() === undefined) {
      this.rig.update(delta);
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
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    getRenderLoop().remove(this.frame);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener('change', this.syncLoop);
    this.releaseContext();
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
      const catalog = await this.loadCatalogFor(document);
      if (generation !== this.generation) return;
      this.catalog = catalog;
      this.checkCatalogVersion(await this.cache.loadManifest());
      if (!document) return;
      const built = isAnimal(document)
        ? await buildAnimal(
            {
              cache: this.cache,
              catalog: catalog as AnimalCatalog,
              composer: this.shared.composer,
              shadow: this.options.shadow ?? true,
            },
            document,
          )
        : isItem(document)
          ? await buildItem(
              {
                cache: this.cache,
                catalog: catalog as ItemCatalog,
                composer: this.shared.composer,
              },
              document,
            )
          : isVehicle(document)
            ? await buildVehicle(
                {
                  cache: this.cache,
                  catalog: catalog as VehicleCatalog,
                  shadow: this.options.shadow ?? true,
                  lighting: this.vehicleLighting,
                },
                document,
              )
            : isScene(document)
              ? await buildScene(
                  {
                    cache: this.cache,
                    composer: this.shared.composer,
                    shadow: this.options.shadow ?? true,
                    lighting: this.vehicleLighting,
                  },
                  document,
                )
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
      if (this.rig instanceof VehicleRig) {
        this.rig.animateLightbar = this.options.animateLightbar ?? true;
      }
      this.scene.add(this.rig);
      this.frameCharacter();
      await this.applyAnimation(catalog, this.rig, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** The catalog of the document's kind; characters when there is no document yet. */
  /** Warns once when the assets come from a pipeline of another major version. */
  private checkCatalogVersion(manifest: ManifestIndex): void {
    if (this.versionWarned || manifest.pipeline === undefined) return;
    const built = majorVersion(manifest.pipeline);
    const mine = majorVersion(PACKAGE_VERSION);
    if (built < 0 || mine < 0 || built === mine) return;
    this.versionWarned = true;
    this.options.onWarning?.({
      code: 'catalog-version',
      message: `the assets were built with zomboid-models-pipeline ${manifest.pipeline} and this viewer is zomboid-models ${PACKAGE_VERSION}; rebuild the assets with a pipeline of the same major version`,
    });
  }

  private loadCatalogFor(
    document: SubjectDescription | undefined,
  ): Promise<CharacterCatalog | AnimalCatalog | ItemCatalog | VehicleCatalog> {
    if (document && isAnimal(document)) return this.cache.loadAnimalCatalog();
    if (document && isItem(document)) return this.cache.loadItemCatalog();
    if (document && isVehicle(document)) return this.cache.loadVehicleCatalog();
    // A scene loads the catalogs of its subjects itself; the character one stands in here.
    return this.cache.loadCharacterCatalog();
  }

  private async applyAnimation(
    catalog: CharacterCatalog | AnimalCatalog | ItemCatalog | VehicleCatalog,
    rig: CharacterRig,
    generation: number,
  ): Promise<void> {
    const document = this.document;
    const speed = this.options.animationSpeed ?? 1;
    const name: string | null | undefined = this.options.animation;
    let entry: Pick<ManifestClip, 'clip' | 'blend'> | null = name ? { clip: name } : null;
    let timeScale = speed;
    let startFraction = 0;
    if (document && (isItem(document) || isVehicle(document) || isScene(document))) {
      entry = null;
    } else if (name === undefined && document) {
      if (isAnimal(document)) {
        const auto = autoAnimalClip(catalog as AnimalCatalog, document);
        entry = auto ?? null;
        timeScale = (auto?.speed ?? 1) * speed;
      } else {
        const auto = autoClip(catalog as CharacterCatalog, document);
        entry = auto;
        timeScale = auto.timeScale * speed;
        startFraction = auto.startFraction;
      }
    }
    const clips =
      entry === null || !('animations' in catalog)
        ? []
        : await loadClipSet(this.cache, catalog, entry, rig.warnings);
    if (generation !== this.generation) return;
    this.clip = clips[0]?.clip ?? null;
    rig.playClips(clips, { timeScale, startFraction });
    const poseTime = this.poseTime();
    if (poseTime !== undefined) rig.freezeAt(poseTime);
    // Pose the skeleton once so the framing sees a lying or sitting body as it is, not the bind pose.
    rig.update(0);
    rig.updateMatrixWorld(true);
    rig.refreshShadow();
    this.frameCharacter();
    this.needsRender = true;
    this.syncLoop();
  }

  private frameCharacter(): void {
    if (!this.rig) return;
    const box = this.rig.bounds();
    if (box.isEmpty()) return;
    // The bounds are in the rig's own units; the rig may carry the game's world scale.
    const scale = this.rig.scale.x;
    const size = box.getSize(new Vector3()).multiplyScalar(scale);
    this.characterHeight = Math.max(size.y, 0.001);
    // A lying or crawling character is wider than tall; the camera backs off for the larger side.
    this.characterExtent = Math.max(size.x, size.y, size.z, 0.001);
    const center = box.getCenter(new Vector3()).multiplyScalar(scale);
    // Put the character's feet on the origin so the camera framing is stable across outfits.
    this.rig.position.set(-center.x, -box.min.y * scale, -center.z);
    this.placeCamera();
  }

  /** The camera defaults for the document: animals face the way the game's avatars face. */
  private defaultCamera(): Required<CameraOptions> {
    const document = this.document;
    if (document && isVehicle(document)) return VEHICLE_CAMERA;
    if (document && isScene(document)) return SCENE_CAMERA;
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
    const mode = this.options.mode ?? 'viewer';
    if (mode === 'image') {
      // A picture is drawn when asked for; the page's loop has nothing to do.
      getRenderLoop().remove(this.frame);
      return;
    }
    const motionAllowed = !(mode === 'showcase' && this.reducedMotion.matches);
    const animating =
      this.playing && this.rig?.animated === true && this.poseTime() === undefined && motionAllowed;
    const interactive = this.controls !== undefined;
    if (this.visible && (animating || interactive || this.needsRender)) {
      getRenderLoop().add(this.frame);
    } else {
      getRenderLoop().remove(this.frame);
    }
  };
}
