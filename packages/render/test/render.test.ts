/**
 * Renders the synthetic asset folder through the bundled Chromium. Runs when the page script
 * is built and Playwright's Chromium is installed (`npx playwright install chromium`, or
 * `PLAYWRIGHT_BROWSERS_PATH` pointing at an install); skipped otherwise.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnimalDescription, CharacterDescription } from 'zomboid-models/format';
import { resolveConfig, runBuild } from 'zomboid-models-pipeline';

import { writeSyntheticGame } from '../../../visual/synthetic-game.js';
import { Renderer, renderDocument } from '../src/renderer.js';

const here = dirname(fileURLToPath(import.meta.url));
const pageScript = join(here, '..', 'dist', 'page.global.js');
const chromiumInstalled = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const CHARACTER: CharacterDescription = {
  format: 'zomboid-models/character',
  version: 1,
  body: { sex: 'male', skin: 0 },
  worn: [{ item: 'Base.Trousers' }],
};

const COW: AnimalDescription = { format: 'zomboid-models/animal', version: 1, type: 'cow' };

/** Width and height from a PNG's header. */
function pngSize(image: Buffer): { width: number; height: number } {
  expect(image.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

describe.skipIf(!existsSync(pageScript) || !chromiumInstalled)('rendering documents', () => {
  let scratch: string;
  let assets: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'zm-render-'));
    const gameDir = writeSyntheticGame(scratch);
    assets = join(scratch, 'assets');
    const config = resolveConfig(
      { gameDir, gameVersion: '42.20.3', outDir: assets, languages: ['EN'] },
      scratch,
    );
    runBuild(config, { info: () => undefined, warn: () => undefined });
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('renders a character to a PNG of the asked size with no warnings', async () => {
    const result = await renderDocument(CHARACTER, { assets, width: 160, height: 120 });
    expect(result.format).toBe('png');
    expect(pngSize(result.image)).toEqual({ width: 160, height: 120 });
    // The synthetic game has no body mask textures; nothing else may be missing.
    expect(result.warnings.filter((w) => !w.includes('body/masks/'))).toEqual([]);
  }, 120_000);

  it('keeps one browser for many pictures and writes WebP too', async () => {
    const renderer = await Renderer.launch({ assets });
    try {
      const first = await renderer.render(CHARACTER, { width: 64, height: 64 });
      const second = await renderer.render(COW, { format: 'webp', quality: 0.8 });
      expect(pngSize(first.image).width).toBe(64);
      expect(second.format).toBe('webp');
      expect(second.image.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(second.image.subarray(8, 12).toString('ascii')).toBe('WEBP');
      // A blank picture would be a few hundred bytes; a drawn one is many more.
      expect(first.image.length).toBeGreaterThan(500);
    } finally {
      await renderer.close();
    }
  }, 120_000);

  it('reports a document the assets cannot show', async () => {
    const result = await renderDocument(
      { ...CHARACTER, worn: [{ item: 'Base.NoSuchItem' }] },
      { assets, width: 32, height: 32 },
    );
    expect(result.warnings.some((w) => w.includes('NoSuchItem'))).toBe(true);
  }, 120_000);
});
