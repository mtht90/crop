import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const THIRDPARTY = resolve(__dirname, '../../thirdparty');
const TYPES: Record<string, string> = {
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf',
};

/** 開発時だけ、未加工の素材（cardbattle/thirdparty）を /thirdparty/ で見られるようにする（プレビュー・撮影ツール用） */
function serveThirdparty(): Plugin {
  return {
    name: 'serve-thirdparty',
    configureServer(server) {
      server.middlewares.use('/thirdparty', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
        const file = join(THIRDPARTY, rel);
        if (!file.startsWith(THIRDPARTY) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serveThirdparty()],
  // three/addons（GLTFLoader など）も WebGPU 版の three を使うようにそろえる
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  server: { port: 5173 },
});
