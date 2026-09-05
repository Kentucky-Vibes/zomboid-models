import { readFileSync } from 'node:fs';

import { defineConfig } from 'tsup';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

const shared = {
  format: ['esm' as const],
  platform: 'node' as const,
  target: 'node20',
  sourcemap: true,
  external: ['fast-xml-parser', 'zomboid-models'],
  define: { __ZOMBOID_MODELS_PIPELINE_VERSION__: JSON.stringify(version) },
};

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    dts: true,
    clean: true,
  },
  {
    ...shared,
    entry: { cli: 'src/cli.ts' },
    banner: { js: '#!/usr/bin/env node' },
  },
]);
