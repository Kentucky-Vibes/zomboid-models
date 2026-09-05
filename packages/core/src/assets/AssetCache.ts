import { LinearFilter, NoColorSpace, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

import {
  MANIFEST_FORMAT,
  MANIFEST_VERSION,
  type AnimalCatalog,
  type CharacterCatalog,
  type ItemCatalog,
  type ManifestIndex,
  type SubjectKind,
  type VehicleCatalog,
} from '../format/manifest.js';
import type { NamesCatalog } from '../format/names.js';

/** How long one request may take before it counts as failed. */
const REQUEST_TIMEOUT_MS = 30_000;
/** The pauses before the second and the third attempt at a request that failed. */
const RETRY_DELAYS_MS = [500, 1500];

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A request is worth repeating when the network or the server failed, not when the file is absent. */
function retryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status >= 500 || error.status === 429;
  return true;
}

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what} took longer than ${REQUEST_TIMEOUT_MS / 1000} seconds`));
    }, REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Runs a request, and again after a pause when it fails in a way that may pass next time. */
async function attempt<T>(what: string, run: () => Promise<T>): Promise<T> {
  let failure: unknown;
  for (let index = 0; index <= RETRY_DELAYS_MS.length; index++) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[index - 1]));
    }
    try {
      return await withTimeout(run(), what);
    } catch (error) {
      failure = error;
      if (!retryable(error)) break;
    }
  }
  throw failure instanceof Error ? failure : new Error(String(failure));
}

/**
 * Loads and caches the manifest index, the catalogs, the names, the GLB files, and the
 * textures of one asset folder. Every viewer on a page that uses the same `assetBaseUrl`
 * shares one cache. A request that fails is tried three times over a few seconds when the
 * failure looks temporary; a file that does not exist fails at once. A failed load leaves no
 * entry behind, so the next call asks again.
 */
export class AssetCache {
  private readonly gltfLoader = new GLTFLoader();
  private readonly textureLoader = new TextureLoader();
  private readonly gltfs = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<Texture>>();
  private readonly catalogs = new Map<SubjectKind, Promise<unknown>>();
  private readonly names = new Map<string, Promise<NamesCatalog>>();
  private manifest: Promise<ManifestIndex> | undefined;

  constructor(readonly baseUrl: string) {}

  /** Resolves a path from the manifest against the asset folder. */
  url(relativePath: string): string {
    return new URL(relativePath, this.baseUrl).href;
  }

  private fetchJson(relativePath: string): Promise<unknown> {
    const url = this.url(relativePath);
    return attempt(`loading ${relativePath}`, async () => {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        throw new HttpError(
          `could not load ${relativePath} from ${response.url}: ${response.status}`,
          response.status,
        );
      }
      return (await response.json()) as unknown;
    });
  }

  /** Loads `manifest.json`, the index that names the catalog files. */
  loadManifest(): Promise<ManifestIndex> {
    this.manifest ??= this.fetchJson('manifest.json')
      .then((value) => {
        const manifest = value as ManifestIndex;
        if (manifest.format !== MANIFEST_FORMAT) {
          throw new Error(`unexpected manifest format "${String(manifest.format)}"`);
        }
        if (manifest.version !== MANIFEST_VERSION) {
          throw new Error(
            `manifest version ${String(manifest.version)} is not supported; rebuild the assets with a matching pipeline`,
          );
        }
        return manifest;
      })
      .catch((error: unknown) => {
        this.manifest = undefined;
        throw error;
      });
    return this.manifest;
  }

  /** Loads the catalog of one subject kind, once. */
  private loadCatalog<T>(kind: SubjectKind): Promise<T> {
    let promise = this.catalogs.get(kind);
    if (!promise) {
      promise = this.loadManifest()
        .then((manifest) => {
          const file = manifest.catalogs[kind];
          if (file === undefined) {
            throw new Error(`the asset folder has no ${kind} catalog; build it with the pipeline`);
          }
          return this.fetchJson(file);
        })
        .catch((error: unknown) => {
          this.catalogs.delete(kind);
          throw error;
        });
      this.catalogs.set(kind, promise);
    }
    return promise as Promise<T>;
  }

  loadCharacterCatalog(): Promise<CharacterCatalog> {
    return this.loadCatalog<CharacterCatalog>('characters');
  }

  loadAnimalCatalog(): Promise<AnimalCatalog> {
    return this.loadCatalog<AnimalCatalog>('animals');
  }

  loadItemCatalog(): Promise<ItemCatalog> {
    return this.loadCatalog<ItemCatalog>('items');
  }

  loadVehicleCatalog(): Promise<VehicleCatalog> {
    return this.loadCatalog<VehicleCatalog>('vehicles');
  }

  /** Loads the display names of one language (`EN`, `RU`), once. */
  loadNames(language: string): Promise<NamesCatalog> {
    const code = language.toUpperCase();
    let promise = this.names.get(code);
    if (!promise) {
      promise = this.loadManifest()
        .then((manifest) => {
          const file = manifest.names?.[code];
          if (file === undefined) {
            throw new Error(
              `the asset folder has no names for ${code}; add the language to the pipeline configuration`,
            );
          }
          return this.fetchJson(file) as Promise<NamesCatalog>;
        })
        .catch((error: unknown) => {
          this.names.delete(code);
          throw error;
        });
      this.names.set(code, promise);
    }
    return promise;
  }

  loadGltf(relativePath: string): Promise<GLTF> {
    let promise = this.gltfs.get(relativePath);
    if (!promise) {
      const url = this.url(relativePath);
      promise = attempt(`loading ${relativePath}`, () => this.gltfLoader.loadAsync(url)).catch(
        (error: unknown) => {
          this.gltfs.delete(relativePath);
          throw error;
        },
      );
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
      const url = this.url(relativePath);
      promise = attempt(`loading ${relativePath}`, () => this.textureLoader.loadAsync(url))
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
    this.catalogs.clear();
    this.names.clear();
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
