import { LinearFilter, NoColorSpace, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

import { MANIFEST_FORMAT, type Manifest } from '../format/manifest.js';

/**
 * Loads and caches the manifest, GLB files, and textures of one asset folder. Every viewer on
 * a page that uses the same `assetBaseUrl` shares one cache.
 */
export class AssetCache {
  private readonly gltfLoader = new GLTFLoader();
  private readonly textureLoader = new TextureLoader();
  private readonly gltfs = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<Texture>>();
  private manifest: Promise<Manifest> | undefined;

  constructor(readonly baseUrl: string) {}

  /** Resolves a path from the manifest against the asset folder. */
  url(relativePath: string): string {
    return new URL(relativePath, this.baseUrl).href;
  }

  loadManifest(): Promise<Manifest> {
    this.manifest ??= fetch(this.url('manifest.json'), { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`could not load manifest from ${response.url}: ${response.status}`);
        }
        const manifest = (await response.json()) as Manifest;
        if (manifest.format !== MANIFEST_FORMAT) {
          throw new Error(`unexpected manifest format "${String(manifest.format)}"`);
        }
        return manifest;
      })
      .catch((error: unknown) => {
        this.manifest = undefined;
        throw error;
      });
    return this.manifest;
  }

  loadGltf(relativePath: string): Promise<GLTF> {
    let promise = this.gltfs.get(relativePath);
    if (!promise) {
      promise = this.gltfLoader.loadAsync(this.url(relativePath)).catch((error: unknown) => {
        this.gltfs.delete(relativePath);
        throw error;
      });
      this.gltfs.set(relativePath, promise);
    }
    return promise;
  }

  /**
   * Loads a texture for direct use on a material (sampled as sRGB), or, with `raw`, for the
   * texture compositor, which works on the stored 8-bit values like the game does.
   */
  loadTexture(relativePath: string, raw = false): Promise<Texture> {
    const cacheKey = raw ? `raw:${relativePath}` : relativePath;
    let promise = this.textures.get(cacheKey);
    if (!promise) {
      promise = this.textureLoader
        .loadAsync(this.url(relativePath))
        .then((texture) => {
          texture.colorSpace = raw ? NoColorSpace : SRGBColorSpace;
          texture.magFilter = LinearFilter;
          texture.minFilter = LinearFilter;
          texture.generateMipmaps = false;
          texture.flipY = false;
          return texture;
        })
        .catch((error: unknown) => {
          this.textures.delete(cacheKey);
          throw error;
        });
      this.textures.set(cacheKey, promise);
    }
    return promise;
  }

  /** Releases GPU resources of cached textures. Loaded GLB scenes are owned by their rigs. */
  dispose(): void {
    for (const promise of this.textures.values()) {
      promise.then((texture) => texture.dispose()).catch(() => undefined);
    }
    this.textures.clear();
    this.gltfs.clear();
    this.manifest = undefined;
  }
}

const caches = new Map<string, AssetCache>();

/** Returns the shared cache for an asset folder, creating it on first use. */
export function getAssetCache(baseUrl: string): AssetCache {
  const key = new URL(baseUrl, globalThis.location?.href ?? 'http://localhost/').href;
  let cache = caches.get(key);
  if (!cache) {
    cache = new AssetCache(key.endsWith('/') ? key : `${key}/`);
    caches.set(key, cache);
  }
  return cache;
}
