import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The playground is deployed to GitHub Pages under the repository name.
export default defineConfig({
  base: process.env['PLAYGROUND_BASE'] ?? '/',
  plugins: [react()],
});
