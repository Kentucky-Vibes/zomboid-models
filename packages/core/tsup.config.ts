import { readFileSync } from 'node:fs';

import { defineConfig } from 'tsup';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'format/index': 'src/format/index.ts',
    'rules/index': 'src/rules/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['three'],
  treeshake: true,
  define: { __ZOMBOID_MODELS_VERSION__: JSON.stringify(version) },
});
