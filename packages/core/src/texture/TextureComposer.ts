import {
  CustomBlending,
  DstAlphaFactor,
  DstColorFactor,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoBlending,
  NoColorSpace,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  SrcAlphaFactor,
  WebGLRenderTarget,
  ZeroFactor,
  type BlendingDstFactor,
  type BlendingSrcFactor,
  type Texture,
  type WebGLRenderer,
} from 'three';

import type { CompositePass, CompositePlan, PassShader, TextureRef } from './plan.js';
import { FRAGMENT_SHADERS, VERTEX_SHADER } from './shaders.js';

/** The game's rectangle coordinates are always in a 256-unit space. */
const RECT_SPACE = 256;

interface BlendFactors {
  src: BlendingSrcFactor;
  dst: BlendingDstFactor;
  srcAlpha: BlendingSrcFactor;
  dstAlpha: BlendingDstFactor;
}

const NORMAL: BlendFactors = {
  src: SrcAlphaFactor,
  dst: OneMinusSrcAlphaFactor,
  srcAlpha: OneFactor,
  dstAlpha: OneMinusSrcAlphaFactor,
};
const OVERLAY: BlendFactors = {
  src: DstColorFactor,
  dst: OneMinusSrcAlphaFactor,
  srcAlpha: DstAlphaFactor,
  dstAlpha: OneMinusSrcAlphaFactor,
};
const HOLE: BlendFactors = {
  src: SrcAlphaFactor,
  dst: ZeroFactor,
  srcAlpha: OneFactor,
  dstAlpha: OneMinusSrcAlphaFactor,
};

const BLENDING: Record<PassShader, BlendFactors> = {
  blit: NORMAL,
  bodyMask: NORMAL,
  hueChange: NORMAL,
  removeHole: NORMAL,
  overlayMask: OVERLAY,
  dirtMask: OVERLAY,
  addHole: HOLE,
};

/** Looks up a source texture by manifest key; sources must be loaded without colour conversion. */
export type TextureLookup = (key: string) => Texture | undefined;

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(value, 1)));
}

function rawTarget(size: number): WebGLRenderTarget {
  return new WebGLRenderTarget(size, size, {
    format: RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    colorSpace: NoColorSpace,
  });
}

/**
 * Replays composite plans on the GPU. Passes draw full-screen (or rectangle) quads into a raw
 * 8-bit target with the game's blend functions; the finished texture is then written into an
 * sRGB target so that materials sample it like an ordinary image.
 */
export class TextureComposer {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, RECT_SPACE, RECT_SPACE, 0, 0, 1);
  private readonly quad: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly materials = new Map<PassShader | 'encode', ShaderMaterial>();
  private readonly spareTargets: WebGLRenderTarget[] = [];
  private readonly nearestMasks = new WeakSet<Texture>();

  constructor(private readonly renderer: WebGLRenderer) {
    this.quad = new Mesh(new PlaneGeometry(1, 1), this.material('blit'));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /**
   * Executes a plan and returns a texture the caller owns. The size is that of the largest
   * source texture, rounded up to a power of two.
   */
  compose(plan: CompositePlan, lookup: TextureLookup): Texture {
    const size = this.targetSize(plan, lookup);
    const current = this.acquire(size);
    const snapshot = this.acquire(size);
    this.clear(current);
    for (const pass of plan.passes) {
      if (pass.resolve) {
        this.copy(current, snapshot);
        this.clear(current);
      }
      this.draw(pass, current, snapshot, lookup);
    }
    const output = new WebGLRenderTarget(size, size, {
      format: RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      colorSpace: SRGBColorSpace,
    });
    this.blitWith('encode', current.texture, output);
    this.release(current);
    this.release(snapshot);
    return output.texture;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    for (const target of this.spareTargets) target.dispose();
    this.spareTargets.length = 0;
    this.quad.geometry.dispose();
  }

  private targetSize(plan: CompositePlan, lookup: TextureLookup): number {
    let size = 1;
    for (const pass of plan.passes) {
      for (const ref of [pass.diffuse, pass.mask]) {
        if (!ref || !('key' in ref)) continue;
        const image = lookup(ref.key)?.image as { width?: number; height?: number } | undefined;
        size = Math.max(size, image?.width ?? 0, image?.height ?? 0);
      }
    }
    return nextPowerOfTwo(size);
  }

  private draw(
    pass: CompositePass,
    current: WebGLRenderTarget,
    snapshot: WebGLRenderTarget,
    lookup: TextureLookup,
  ): void {
    const diffuse = this.resolveRef(pass.diffuse, snapshot, lookup);
    const mask = pass.mask ? this.resolveRef(pass.mask, snapshot, lookup) : undefined;
    if (!diffuse || (pass.mask && !mask)) return;
    if (mask && !this.nearestMasks.has(mask)) {
      mask.minFilter = NearestFilter;
      mask.magFilter = NearestFilter;
      mask.needsUpdate = true;
      this.nearestMasks.add(mask);
    }

    const material = this.material(pass.shader);
    const blend = BLENDING[pass.shader];
    material.blending = CustomBlending;
    material.blendSrc = blend.src;
    material.blendDst = blend.dst;
    material.blendSrcAlpha = blend.srcAlpha;
    material.blendDstAlpha = blend.dstAlpha;
    const u = material.uniforms;
    (u['diffuse'] as { value: Texture | null }).value = diffuse;
    (u['mask'] as { value: Texture | null }).value = mask ?? null;
    (u['intensity'] as { value: number }).value = pass.intensity ?? 1;
    (u['bloodDark'] as { value: number }).value = pass.bloodDark ?? 0.73;
    (u['cutoffMin'] as { value: number }).value = pass.cutoffMin ?? 0;
    (u['cutoffMax'] as { value: number }).value = pass.cutoffMax ?? 0.00001;
    (u['maskPaddingRadius'] as { value: number }).value = pass.maskPaddingRadius ?? 0;
    (u['hue'] as { value: number }).value = pass.hue ?? 0;
    (u['tint'] as { value: number[] }).value = pass.tint ?? [1, 1, 1];

    const rect = pass.rect ?? { x: 0, y: 0, width: RECT_SPACE, height: RECT_SPACE };
    this.quad.material = material;
    this.quad.position.set(rect.x + rect.width / 2, rect.y + rect.height / 2, 0);
    this.quad.scale.set(rect.width, rect.height, 1);
    this.render(current, false);
  }

  /** Draws `source` over the whole of `target` with the given shader and no blending. */
  private blitWith(
    shader: PassShader | 'encode',
    source: Texture,
    target: WebGLRenderTarget,
  ): void {
    const material = this.material(shader);
    material.blending = NoBlending;
    (material.uniforms['diffuse'] as { value: Texture | null }).value = source;
    this.quad.material = material;
    this.quad.position.set(RECT_SPACE / 2, RECT_SPACE / 2, 0);
    this.quad.scale.set(RECT_SPACE, RECT_SPACE, 1);
    this.render(target, true);
  }

  private copy(from: WebGLRenderTarget, into: WebGLRenderTarget): void {
    this.blitWith('blit', from.texture, into);
  }

  private render(target: WebGLRenderTarget, clear: boolean): void {
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    renderer.setRenderTarget(target);
    renderer.autoClear = clear;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = previousAutoClear;
    renderer.setRenderTarget(previousTarget);
  }

  private clear(target: WebGLRenderTarget): void {
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(previousTarget);
  }

  private resolveRef(
    ref: TextureRef,
    snapshot: WebGLRenderTarget,
    lookup: TextureLookup,
  ): Texture | undefined {
    return 'key' in ref ? lookup(ref.key) : snapshot.texture;
  }

  private material(shader: PassShader | 'encode'): ShaderMaterial {
    let material = this.materials.get(shader);
    if (!material) {
      material = new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADERS[shader],
        uniforms: {
          diffuse: { value: null },
          mask: { value: null },
          intensity: { value: 1 },
          bloodDark: { value: 0.73 },
          cutoffMin: { value: 0 },
          cutoffMax: { value: 0.00001 },
          maskPaddingRadius: { value: 0 },
          hue: { value: 0 },
          tint: { value: [1, 1, 1] },
        },
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      this.materials.set(shader, material);
    }
    return material;
  }

  private acquire(size: number): WebGLRenderTarget {
    const index = this.spareTargets.findIndex((t) => t.width === size);
    if (index >= 0) return this.spareTargets.splice(index, 1)[0] as WebGLRenderTarget;
    return rawTarget(size);
  }

  private release(target: WebGLRenderTarget): void {
    if (this.spareTargets.length < 4) this.spareTargets.push(target);
    else target.dispose();
  }
}
