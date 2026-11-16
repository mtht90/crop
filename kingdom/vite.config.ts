import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// ARTIFACT=1 のときは claude.ai アーティファクト用に、1つのJSにまとめ相対パスで出力する
const artifact = !!process.env.ARTIFACT;

export default defineConfig({
  base: artifact ? './' : (process.env.BASE_PATH ?? '/'),
  resolve: artifact ? { alias: { './fonts': fileURLToPath(new URL('./src/fonts.artifact.ts', import.meta.url)) } } : {},
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    outDir: artifact ? 'dist-artifact' : 'dist',
    copyPublicDir: !artifact,
    rollupOptions: artifact ? { output: { inlineDynamicImports: true } } : {},
  },
  server: { host: true },
});
