import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: { dedupe: ['three'] },
  build: { chunkSizeWarningLimit: 1200 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
