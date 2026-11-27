import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // 画像を data: URL にしない（公開先の CSP で読み込めないため）
  build: { chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
});
