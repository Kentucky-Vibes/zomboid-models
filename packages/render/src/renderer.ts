/**
 * Renders documents to pictures in a headless Chromium that Playwright ships: one browser page
 * holds the viewer's page script, every request for assets is answered from a folder or a
 * remote base URL, and each document becomes one PNG or WebP through the viewer's own image
 * export. The wording The Indie Stone's terms require is not in the picture; show it next to
 * the pictures on the page that uses them.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page, type Route } from 'playwright';
import type { CameraOptions, LightingOption } from 'zomboid-models';
import type { SubjectDescription } from 'zomboid-models/format';

import {
  ASSET_BASE_URL,
  ASSET_ORIGIN,
  assetPathOf,
  assetSource,
  readFolderAsset,
  remoteAssetUrl,
  type AssetSource,
} from './assets.js';
import type { PageRenderRequest, PageRenderResult } from './page.js';

export type ImageFormat = 'png' | 'webp';

/** What one picture looks like: its size, its format, and the viewer options that shape it. */
export interface RenderOptions {
  /** Width in pixels; 400 by default. */
  width?: number;
  /** Height in pixels; 400 by default. */
  height?: number;
  /** `png` (the default, with transparency) or `webp`. */
  format?: ImageFormat;
  /** WebP quality from 0 to 1; the browser's default when absent. */
  quality?: number;
  camera?: CameraOptions;
  lighting?: LightingOption;
  /** A CSS colour, or `transparent`, the default. */
  background?: string;
  /** A clip name, `null` for the bind pose, or absent for the clip the game would play. */
  animation?: string | null;
  animationSpeed?: number;
  /** The time of the clip to draw, in seconds; the first frame when absent. */
  poseTime?: number;
}

/** How the browser starts and where the assets are. */
export interface RendererOptions {
  /** A folder of built assets, or the `http(s)` base URL they are hosted at. */
  assets: string;
  /** A Chromium to run instead of the one Playwright installed. */
  executablePath?: string;
  /** Command line arguments for Chromium; software rendering by default, for the same pixels everywhere. */
  args?: string[];
}

export interface RenderResult {
  image: Buffer;
  format: ImageFormat;
  width: number;
  height: number;
  /** What the viewer could not show, if anything: a missing item, a missing texture. */
  warnings: string[];
}

/** Software rendering: a server without a GPU and a laptop draw the same picture. */
export const DEFAULT_BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const DEFAULT_SIZE = 400;

/** The page script, next to this file once built; in the source tree it sits in `dist`. */
function pageScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'page.global.js'), join(here, '..', 'dist', 'page.global.js')];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('the page script is missing; build zomboid-models-render first');
  }
  return found;
}

async function answerAssetRequest(route: Route, source: AssetSource): Promise<void> {
  const path = assetPathOf(route.request().url());
  if (path === undefined) {
    await route.fulfill({ status: 404, body: 'outside the asset folder' });
    return;
  }
  const cors = { 'access-control-allow-origin': '*' };
  if (source.kind === 'folder') {
    const asset = await readFolderAsset(source.base, path);
    await route.fulfill({
      status: asset.status,
      contentType: asset.contentType,
      body: Buffer.from(asset.body),
      headers: cors,
    });
    return;
  }
  const response = await route.fetch({ url: remoteAssetUrl(source.base, path) });
  await route.fulfill({ response, headers: { ...response.headers(), ...cors } });
}

/** A browser kept open to render many documents; `close()` it when done. */
export class Renderer {
  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  /** Starts the browser, routes the assets, and loads the page script. */
  static async launch(options: RendererOptions): Promise<Renderer> {
    const source = assetSource(options.assets);
    const browser = await chromium.launch({
      headless: true,
      args: options.args ?? DEFAULT_BROWSER_ARGS,
      ...(options.executablePath === undefined ? {} : { executablePath: options.executablePath }),
    });
    try {
      const page = await browser.newPage({
        viewport: { width: DEFAULT_SIZE, height: DEFAULT_SIZE },
      });
      await page.route(`${ASSET_ORIGIN}/**`, (route) => answerAssetRequest(route, source));
      await page.setContent(
        '<!doctype html><html><head><meta charset="utf-8"><title>zomboid-models-render</title></head><body></body></html>',
      );
      await page.addScriptTag({ path: pageScriptPath() });
      return new Renderer(browser, page);
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /** Renders one document. */
  async render(document: SubjectDescription, options: RenderOptions = {}): Promise<RenderResult> {
    const width = Math.max(1, Math.round(options.width ?? DEFAULT_SIZE));
    const height = Math.max(1, Math.round(options.height ?? DEFAULT_SIZE));
    const format = options.format ?? 'png';
    const request: PageRenderRequest = {
      document,
      assetBaseUrl: ASSET_BASE_URL,
      width,
      height,
      type: format === 'webp' ? 'image/webp' : 'image/png',
      ...(options.quality === undefined ? {} : { quality: options.quality }),
      ...(options.camera === undefined ? {} : { camera: options.camera }),
      ...(options.lighting === undefined ? {} : { lighting: options.lighting }),
      ...(options.background === undefined ? {} : { background: options.background }),
      ...(options.animation === undefined ? {} : { animation: options.animation }),
      ...(options.animationSpeed === undefined ? {} : { animationSpeed: options.animationSpeed }),
      ...(options.poseTime === undefined ? {} : { poseTime: options.poseTime }),
    };
    const result: PageRenderResult = await this.page.evaluate(
      (pageRequest) => window.zomboidModelsRender.render(pageRequest),
      request,
    );
    const comma = result.image.indexOf(',');
    const image = Buffer.from(result.image.slice(comma + 1), 'base64');
    return { image, format, width, height, warnings: result.warnings };
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

/** Renders one document in a browser started for it alone; use `Renderer` for many. */
export async function renderDocument(
  document: SubjectDescription,
  options: RendererOptions & RenderOptions,
): Promise<RenderResult> {
  const renderer = await Renderer.launch(options);
  try {
    return await renderer.render(document, options);
  } finally {
    await renderer.close();
  }
}
