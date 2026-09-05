import {
  createViewer,
  validateDescription,
  type CameraOptions,
  type CharacterDescription,
  type RigWarning,
  type Viewer,
  type ViewerDocument,
  type ViewerMode,
  type ViewerOptions,
} from 'zomboid-models';

export type { CameraOptions, CharacterDescription, RigWarning, Viewer, ViewerDocument, ViewerMode };

const OBSERVED = [
  'asset-base-url',
  'mode',
  'animation',
  'animation-speed',
  'src',
  'background',
  'auto-rotate',
  'attribution',
  'pose-time',
  'camera',
] as const;

/**
 * `<zomboid-character>` shows one document: a character, an animal, an item, or a vehicle.
 * Attributes:
 *
 * - `asset-base-url` (required): folder that holds `manifest.json`.
 * - `src`: URL of a JSON document of any kind; or assign the `document` property.
 * - `mode`: `viewer` (default) or `showcase`.
 * - `animation`: clip name, `none` for the bind pose; omit for the clip the game would play.
 * - `animation-speed`: playback speed multiplier, 1 by default.
 * - `pose-time`: seconds into the clip to freeze at.
 * - `background`: CSS colour or `transparent` (default).
 * - `auto-rotate`, `attribution`: boolean attributes (`attribution="false"` hides the wording).
 * - `camera`: JSON with `fov`, `distance`, `yaw`, `pitch`, `targetHeight`.
 *
 * Events: `warning` (detail: RigWarning), `error` (detail: Error), `ready` (detail: Viewer).
 */
export class ZomboidCharacterElement extends HTMLElement {
  static readonly tagName = 'zomboid-character';

  static get observedAttributes(): readonly string[] {
    return OBSERVED;
  }

  /** Registers the element under its tag name unless it is already defined. */
  static define(tagName = ZomboidCharacterElement.tagName): void {
    if (!customElements.get(tagName)) customElements.define(tagName, ZomboidCharacterElement);
  }

  private viewer: Viewer | undefined;
  private characterValue: ViewerDocument | undefined;
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
  get document(): ViewerDocument | undefined {
    return this.characterValue;
  }

  set document(value: ViewerDocument | undefined) {
    this.characterValue = value;
    if (value && this.viewer) void this.viewer.setDocument(value);
    else if (this.isConnected) this.mount();
  }

  /** The same as `document`; kept for the first releases. */
  get character(): ViewerDocument | undefined {
    return this.characterValue;
  }

  set character(value: ViewerDocument | undefined) {
    this.document = value;
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
    if (name === 'animation' && this.viewer) {
      void this.viewer.setAnimation(this.animationOption());
      return;
    }
    if (name === 'animation-speed' && this.viewer) {
      this.viewer.setAnimationSpeed(this.animationSpeedOption() ?? 1);
      return;
    }
    this.mount();
  }

  /** Renders the current frame to a PNG data URL. */
  toImage(options?: { width?: number; height?: number }): string | undefined {
    return this.viewer?.toImage(options);
  }

  play(): void {
    this.viewer?.play();
  }

  pause(): void {
    this.viewer?.pause();
  }

  private animationOption(): string | null | undefined {
    const value = this.getAttribute('animation');
    if (value === null) return undefined;
    return value === 'none' ? null : value;
  }

  private animationSpeedOption(): number | undefined {
    const value = Number(this.getAttribute('animation-speed'));
    return this.hasAttribute('animation-speed') && Number.isFinite(value) && value > 0
      ? value
      : undefined;
  }

  private options(): ViewerOptions | undefined {
    const assetBaseUrl = this.getAttribute('asset-base-url');
    if (!assetBaseUrl) return undefined;
    const options: ViewerOptions = {
      assetBaseUrl,
      mode: (this.getAttribute('mode') as ViewerMode | null) ?? 'viewer',
      background: this.getAttribute('background') ?? 'transparent',
      autoRotate: this.hasAttribute('auto-rotate'),
      attribution: this.getAttribute('attribution') !== 'false',
      onWarning: (warning) => this.dispatchEvent(new CustomEvent('warning', { detail: warning })),
      onError: (error) => this.dispatchEvent(new CustomEvent('error', { detail: error })),
    };
    const animation = this.animationOption();
    if (animation !== undefined) options.animation = animation;
    const animationSpeed = this.animationSpeedOption();
    if (animationSpeed !== undefined) options.animationSpeed = animationSpeed;
    const poseTime = Number(this.getAttribute('pose-time'));
    if (this.hasAttribute('pose-time') && Number.isFinite(poseTime)) options.poseTime = poseTime;
    const camera = this.getAttribute('camera');
    if (camera) {
      try {
        options.camera = JSON.parse(camera) as CameraOptions;
      } catch {
        this.dispatchEvent(
          new CustomEvent('error', { detail: new Error('camera is not valid JSON') }),
        );
      }
    }
    if (this.characterValue) options.document = this.characterValue;
    return options;
  }

  private mount(): void {
    this.unmount();
    const options = this.options();
    if (!options) return;
    this.viewer = createViewer(this.host, options);
    this.dispatchEvent(new CustomEvent('ready', { detail: this.viewer }));
    if (!this.characterValue && this.getAttribute('src')) void this.loadFromSrc();
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
      this.characterValue = result.value;
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

ZomboidCharacterElement.define();

declare global {
  interface HTMLElementTagNameMap {
    'zomboid-character': ZomboidCharacterElement;
  }
}
