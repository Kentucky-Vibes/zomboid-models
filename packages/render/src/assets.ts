/**
 * How the page reaches the assets. The viewer fetches everything under one made-up origin,
 * and the browser's request routing answers from a folder on disk or from a remote base URL,
 * so that no HTTP server is needed for a folder and no CORS setup for a URL.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';

/** The origin the page asks for assets at; every request under it is routed. */
export const ASSET_ORIGIN = 'https://zomboid-models.assets';

export const ASSET_BASE_URL = `${ASSET_ORIGIN}/`;

/** Where the assets come from: a folder on disk or an `http(s)` base URL. */
export interface AssetSource {
  kind: 'folder' | 'url';
  /** The absolute folder path, or the base URL ending in a slash. */
  base: string;
}

/** Reads a source from what the caller gave: a URL when it parses as `http` or `https`. */
export function assetSource(assets: string): AssetSource {
  if (/^https?:\/\//i.test(assets)) {
    return { kind: 'url', base: assets.endsWith('/') ? assets : `${assets}/` };
  }
  return { kind: 'folder', base: resolve(assets) };
}

/** The content type the viewer expects for an asset, by file extension. */
export function contentTypeOf(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  switch (extension) {
    case 'json':
      return 'application/json';
    case 'glb':
      return 'model/gltf-binary';
    case 'gltf':
      return 'model/gltf+json';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'bin':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

/**
 * The path under the asset base that a routed request asks for, decoded, with no way out of
 * the base folder. Returns undefined for a request outside the origin.
 */
export function assetPathOf(url: string): string | undefined {
  if (!url.startsWith(ASSET_BASE_URL)) return undefined;
  const rest = url.slice(ASSET_BASE_URL.length).split(/[?#]/)[0] ?? '';
  const decoded = decodeURIComponent(rest);
  const normalized = normalize(decoded).split(sep).join('/');
  if (normalized.startsWith('..') || isAbsolute(normalized)) return undefined;
  return normalized;
}

export interface AssetResponse {
  status: number;
  contentType: string;
  body: Uint8Array;
}

/** Answers a routed request from a folder. */
export async function readFolderAsset(base: string, path: string): Promise<AssetResponse> {
  try {
    const body = await readFile(join(base, path));
    return { status: 200, contentType: contentTypeOf(path), body };
  } catch {
    return { status: 404, contentType: 'text/plain', body: new TextEncoder().encode('not found') };
  }
}

/** The remote URL a routed request maps to. */
export function remoteAssetUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}
