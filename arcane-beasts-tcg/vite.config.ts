import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  resolve:
    mode === 'artifact'
      ? { alias: [{ find: /^\.\/fonts$/, replacement: fileURLToPath(new URL('./src/fonts.artifact.ts', import.meta.url)) }] }
      : undefined,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    ...(mode === 'artifact' ? { assetsInlineLimit: 0, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } } : {}),
  },
  test: { environment: 'node' },
}) as any);
