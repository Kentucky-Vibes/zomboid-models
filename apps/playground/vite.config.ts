import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The playground is deployed to GitHub Pages under the repository name, hence the base option.
// The port comes from the environment so that tooling can assign a free one.
export default defineConfig({
  base: process.env['PLAYGROUND_BASE'] ?? '/',
  plugins: [react()],
  server: {
    port: Number(process.env['PORT']) || 5173,
    strictPort: Boolean(process.env['PORT']),
  },
});
