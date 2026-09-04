import { defineConfig } from 'tsup';

// The element bundles three.js and the renderer so that a single <script type="module"> works.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  noExternal: ['zomboid-models', 'three'],
  treeshake: true,
});
