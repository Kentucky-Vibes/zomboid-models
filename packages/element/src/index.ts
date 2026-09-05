import {
  createViewer,
  validateDescription,
  type CameraOptions,
  type LightingOption,
  type RigWarning,
  type SnapshotOptions,
  type SubjectDescription,
  type Viewer,
  type ViewerMode,
  type ViewerOptions,
} from 'zomboid-models';

export type {
  CameraOptions,
  LightingOption,
  RigWarning,
  SnapshotOptions,
  SubjectDescription,
  Viewer,
  ViewerMode,
  ViewerOptions,
};

const OBSERVED = [
  'asset-base-url',
  'mode',
  'animation',
  'animation-speed',
  'src',
  'background',
  'auto-rotate',
  'attribution',
  'shadow',
  'animate-lightbar',
  'max-pixel-ratio',
  'pose-time',
  'camera',
  'lighting',
] as const;

/**
 * `<zomboid-view>` shows one document: a character, an animal, an item, a vehicle, or a scene.
 * Attributes:
 *
 * - `asset-base-url` (required): folder that holds `manifest.json`.
 * - `src`: URL of a JSON document of any kind; or assign the `document` property.
 * - `mode`: `viewer` (default), `showcase`, or `image`.
 * - `animation`: clip name, `none` for the bind pose; omit for the clip the game would play.
 * - `animation-speed`: playback speed multiplier, 1 by default.
 * - `pose-time`: seconds into the clip to hold at.
 * - `background`: CSS colour or `transparent` (default).
 * - `auto-rotate`, `attribution`, `shadow`, `animate-lightbar`: boolean attributes; present
 *   means on, and the value `false` means off (`shadow="false"`).
 * - `max-pixel-ratio`: upper bound for the device pixel ratio.
 * - `camera`: JSON with `fov`, `distance`, `yaw`, `pitch`, `targetHeight`.
 * - `lighting`: a preset name, or JSON with `hour`, `season`, `moon`.
 *
 * Events: `warning` (detail: RigWarning), `error` (detail: Error), `ready` (detail: Viewer).
 */
export class ZomboidViewElement extends HTMLElement {
  static readonly tagName: string = 'zomboid-view';

  static get observedAttributes(): readonly string[] {
    return OBSERVED;
  }

  /** Registers the element under its tag name unless it is already defined. */
  static define(tagName = ZomboidViewElement.tagName): void {
    if (!customElements.get(tagName)) customElements.define(tagName, ZomboidViewElement);
  }

  private viewer: Viewer | undefined;
  private documentValue: SubjectDescription | undefined;
  private readonly host: HTMLDivElement;
  private loadGeneration = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent =
      ':host{display:block;width:100%;height:100%;contain:content}div{width:100%;height:100%}';
    this.host = document.createElement('div');
    root.append(style, this.host);
  }

  /** The document to show; takes precedence over `src` once assigned. */
  get document(): SubjectDescription | undefined {
    return this.documentValue;
  }

  set document(value: SubjectDescription | undefined) {
    this.documentValue = value;
    if (value && this.viewer) void this.viewer.setDocument(value);
    else if (this.isConnected) this.mount();
  }

  /** The underlying viewer, available after the element is connected. */
  get viewerInstance(): Viewer | undefined {
    return this.viewer;
  }

  connectedCallback(): void {
    this.mount();
  }

  disconnectedCallback(): void {
    this.unmount();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === 'src') {
      void this.loadFromSrc();
      return;
    }
    if (this.viewer) {
      if (name === 'animation') {
        void this.viewer.setAnimation(this.animationOption());
        return;
      }
      if (name === 'animation-speed') {
        this.viewer.setAnimationSpeed(this.animationSpeedOption() ?? 1);
        return;
      }
      if (name === 'pose-time') {
        this.viewer.setPoseTime(this.poseTimeOption());
        return;
      }
      if (name === 'animate-lightbar') {
        this.viewer.setAnimateLightbar(this.flag('animate-lightbar', true));
        return;
      }
    }
    this.mount();
  }

  /** Renders the current frame to a data URL, PNG unless `type` says otherwise. */
  toImage(options?: SnapshotOptions): string | undefined {
    return this.viewer?.toImage(options);
  }

  play(): void {
    this.viewer?.play();
  }

  pause(): void {
    this.viewer?.pause();
  }

  /** A boolean attribute: absent gives the default, present is on unless the value is `false`. */
  private flag(name: string, fallback: boolean): boolean {
    const value = this.getAttribute(name);
    if (value === null) return fallback;
    return value.trim().toLowerCase() !== 'false';
  }

  private numberAttribute(name: string): number | undefined {
    const value = Number(this.getAttribute(name));
    return this.hasAttribute(name) && Number.isFinite(value) ? value : undefined;
  }

  private animationOption(): string | null | undefined {
    const value = this.getAttribute('animation');
    if (value === null) return undefined;
    return value === 'none' ? null : value;
  }

  private animationSpeedOption(): number | undefined {
    const value = this.numberAttribute('animation-speed');
    return value !== undefined && value > 0 ? value : undefined;
  }

  private poseTimeOption(): number | undefined {
    return this.numberAttribute('pose-time');
  }

  private json<T>(name: string): T | undefined {
    const value = this.getAttribute(name);
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      this.dispatchEvent(
        new CustomEvent('error', { detail: new Error(`${name} is not valid JSON`) }),
      );
      return undefined;
    }
  }

  private options(): ViewerOptions | undefined {
    const assetBaseUrl = this.getAttribute('asset-base-url');
    if (!assetBaseUrl) return undefined;
    const options: ViewerOptions = {
      assetBaseUrl,
      mode: (this.getAttribute('mode') as ViewerMode | null) ?? 'viewer',
      background: this.getAttribute('background') ?? 'transparent',
      autoRotate: this.flag('auto-rotate', false),
      attribution: this.flag('attribution', true),
      shadow: this.flag('shadow', true),
      animateLightbar: this.flag('animate-lightbar', true),
      onWarning: (warning) => this.dispatchEvent(new CustomEvent('warning', { detail: warning })),
      onError: (error) => this.dispatchEvent(new CustomEvent('error', { detail: error })),
    };
    const animation = this.animationOption();
    if (animation !== undefined) options.animation = animation;
    const animationSpeed = this.animationSpeedOption();
    if (animationSpeed !== undefined) options.animationSpeed = animationSpeed;
    const poseTime = this.poseTimeOption();
    if (poseTime !== undefined) options.poseTime = poseTime;
    const maxPixelRatio = this.numberAttribute('max-pixel-ratio');
    if (maxPixelRatio !== undefined && maxPixelRatio > 0) options.maxPixelRatio = maxPixelRatio;
    const camera = this.json<CameraOptions>('camera');
    if (camera) options.camera = camera;
    const lighting = this.getAttribute('lighting');
    if (lighting) {
      const parsed = lighting.startsWith('{')
        ? this.json<LightingOption>('lighting')
        : (lighting as LightingOption);
      if (parsed !== undefined) options.lighting = parsed;
    }
    if (this.documentValue) options.document = this.documentValue;
    return options;
  }

  private mount(): void {
    this.unmount();
    const options = this.options();
    if (!options) return;
    this.viewer = createViewer(this.host, options);
    this.dispatchEvent(new CustomEvent('ready', { detail: this.viewer }));
    if (!this.documentValue && this.getAttribute('src')) void this.loadFromSrc();
  }

  private unmount(): void {
    this.viewer?.dispose();
    this.viewer = undefined;
  }

  private async loadFromSrc(): Promise<void> {
    const src = this.getAttribute('src');
    if (!src) return;
    const generation = ++this.loadGeneration;
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`could not load ${src}: ${response.status}`);
      const result = validateDescription(await response.json());
      if (!result.ok) throw new Error(`invalid document: ${result.errors.join('; ')}`);
      if (generation !== this.loadGeneration) return;
      this.documentValue = result.value;
      if (this.viewer) await this.viewer.setDocument(result.value);
      else this.mount();
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: error instanceof Error ? error : new Error(String(error)),
        }),
      );
    }
  }
}

ZomboidViewElement.define();

declare global {
  interface HTMLElementTagNameMap {
    'zomboid-view': ZomboidViewElement;
  }
}
