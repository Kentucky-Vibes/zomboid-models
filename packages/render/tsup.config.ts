import { defineConfig } from 'tsup';

// Two builds: the Node library and command line, which load Playwright, and the page script
// that runs inside the browser with three.js and the renderer bundled in.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['playwright', 'zomboid-models'],
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    sourcemap: true,
    external: ['playwright', 'zomboid-models'],
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { page: 'src/page.ts' },
    format: ['iife'],
    platform: 'browser',
    target: 'es2022',
    globalName: 'zomboidModelsRenderPage',
    noExternal: ['zomboid-models', 'three'],
    treeshake: true,
    minify: false,
  },
]);
