import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Service Worker をビルド時に生成する。ビルドで出力されたファイル一覧を埋め込んで
 * プリキャッシュするので、一度開けばオフラインでも起動できる。
 */
function serviceWorker(): Plugin {
  return {
    name: 'scratch-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const template = readFileSync(fileURLToPath(new URL('./src/sw-template.js', import.meta.url)), 'utf8');
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const precache = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg', '/textures/clouds.jpg', ...files.map((f) => `/${f}`)];
      const version = Date.now().toString(36);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify([...new Set(precache)])),
      });
    },
  };
}

const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  // VITE_HTTPS=1 で自己署名証明書の HTTPS 開発サーバー（スマホ実機の位置情報テスト用）
  plugins: [...(process.env.VITE_HTTPS ? [basicSsl()] : []), serviceWorker()],
  server: {
    port: 5173,
    // スマホ実機確認でトンネル（cloudflared / ngrok）経由のアクセスを許可
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'],
    // 開発時は API を同一オリジンにプロキシ（スマホからも1つの URL で済む）
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/ingest': { target: API_TARGET, changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: API_TARGET },
      '/ingest': { target: API_TARGET },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // MapLibre のワーカー（.mjs）を .js で出力（静的ホスティングでも確実に JS の MIME で配信されるように）
        assetFileNames: (info) =>
          (info.names?.[0] ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
