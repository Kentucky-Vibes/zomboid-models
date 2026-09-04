import { defineConfig } from 'tsup';

const shared = {
  format: ['esm' as const],
  platform: 'node' as const,
  target: 'node20',
  sourcemap: true,
  external: ['fast-xml-parser', 'zomboid-models'],
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
