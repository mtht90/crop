import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// JS/CSS は index.html に埋め込み、3Dモデルは public/assets から相対パスで読み込む。
// ゲームポータルにも claude.ai のプレビューにもそのまま置ける構成。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { chunkSizeWarningLimit: 2000 },
});
