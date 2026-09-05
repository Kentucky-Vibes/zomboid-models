/**
 * Screenshot tests of the viewer. The `synthetic` project renders documents from a small asset
 * folder built out of the test fixtures, and its screenshots are committed. The `real` project
 * runs only with `ZM_VISUAL_REAL=1` against `apps/playground/public/dev-assets` (a folder built
 * from a game install) and keeps its screenshots in a local, ignored folder.
 */
import { defineConfig, type Project } from '@playwright/test';

const PORT = 4173;
const real = process.env['ZM_VISUAL_REAL'] === '1';

const projects: Project[] = [
  {
    name: 'synthetic',
    testMatch: /subjects\.spec\.ts/,
    snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  },
];
if (real) {
  projects.push({
    name: 'real',
    testMatch: /real\.spec\.ts/,
    snapshotPathTemplate: '{testDir}/../local-snapshots/{arg}{ext}',
  });
}

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 30_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 400, height: 400 },
    deviceScaleFactor: 1,
    // Software rendering everywhere, so that a laptop and the CI runner draw the same pixels.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -w playground',
    url: `http://localhost:${PORT}/visual.html`,
    reuseExistingServer: !process.env['CI'],
    env: { PORT: String(PORT) },
    timeout: 120_000,
  },
  projects,
});
