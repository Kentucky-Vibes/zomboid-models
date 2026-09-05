import { WebGLRenderer, type Camera, type Scene } from 'three';

import { TextureComposer } from '../texture/TextureComposer.js';

/**
 * One WebGL renderer per page. Each viewer owns an ordinary 2D canvas; the shared renderer
 * draws the viewer's scene into its own hidden canvas and copies the pixels over. Browsers cap
 * the number of live WebGL contexts, and this keeps the count at one however many viewers a
 * page shows.
 */
export class SharedRenderer {
  readonly renderer: WebGLRenderer;
  private users = 0;
  private textureComposer: TextureComposer | undefined;

  /** The texture compositor bound to this renderer, created on first use. */
  get composer(): TextureComposer {
    this.textureComposer ??= new TextureComposer(this.renderer);
    return this.textureComposer;
  }

  constructor() {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = true;
  }

  /** Renders `scene` at the target's size and copies the result onto the target canvas. */
  renderTo(target: HTMLCanvasElement, scene: Scene, camera: Camera): void {
    const width = target.width;
    const height = target.height;
    if (width === 0 || height === 0) return;
    const source = this.renderer.domElement;
    if (source.width !== width || source.height !== height) {
      this.renderer.setSize(width, height, false);
    }
    this.renderer.render(scene, camera);
    const context = target.getContext('2d');
    if (!context) {
      throw new Error('viewer canvas does not provide a 2D context');
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height, 0, 0, width, height);
  }

  /** Renders `scene` at the given size and returns the pixels as a PNG data URL. */
  snapshot(
    scene: Scene,
    camera: Camera,
    width: number,
    height: number,
    type = 'image/png',
    quality?: number,
  ): string {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.renderTo(canvas, scene, camera);
    return canvas.toDataURL(type, quality);
  }

  acquire(): void {
    this.users++;
  }

  release(): void {
    this.users = Math.max(0, this.users - 1);
    if (this.users === 0 && shared === this) {
      shared = undefined;
      this.textureComposer?.dispose();
      this.renderer.dispose();
    }
  }
}

let shared: SharedRenderer | undefined;

/** Returns the page's renderer, creating it when the first viewer asks for it. */
export function acquireSharedRenderer(): SharedRenderer {
  shared ??= new SharedRenderer();
  shared.acquire();
  return shared;
}
