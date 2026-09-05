/**
 * Builds the synthetic asset folder the screenshot tests use, into the playground's public
 * folder so that the dev server serves it as `/visual-assets/`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig, runBuild } from 'zomboid-models-pipeline';

import { writeSyntheticGame } from './synthetic-game.js';

const here = dirname(fileURLToPath(import.meta.url));

export default function globalSetup(): void {
  const scratch = mkdtempSync(join(tmpdir(), 'zm-visual-'));
  try {
    const gameDir = writeSyntheticGame(scratch);
    const outDir = join(here, '..', 'apps', 'playground', 'public', 'visual-assets');
    rmSync(outDir, { recursive: true, force: true });
    const config = resolveConfig(
      { gameDir, gameVersion: '42.20.3', outDir, languages: ['EN'] },
      scratch,
    );
    const report = runBuild(config, { info: () => undefined, warn: () => undefined });
    if (report.models === 0) throw new Error('the synthetic build produced no models');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
