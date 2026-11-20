import { defineConfig } from 'vite';

// base: './' so dist/ works from any sub-path (e.g. GitHub Pages /crop/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
