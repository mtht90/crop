// claude.ai Artifact 用のビルド。
// JS / CSS を 1 枚の HTML に埋め込み、実際に使う素材ファイルだけを一覧にする。
//   node tools/build-artifact.mjs  → dist-artifact/index.html と dist-artifact/files.json
import { build } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-artifact');
await fs.rm(OUT, { recursive: true, force: true });

// 1) ゲーム本体を 1 つの JS にまとめる
await build({
  root: ROOT,
  configFile: false,
  base: './',
  publicDir: false,
  logLevel: 'warn',
  define: { 'import.meta.env.VITE_ASSET_B64': JSON.stringify('1') },
  build: {
    outDir: path.join(OUT, 'bundle'),
    target: 'es2022',
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } },
  },
});

// 2) 使う素材の一覧 (ALL_MODELS) を取り出す
await build({
  root: ROOT,
  configFile: false,
  logLevel: 'warn',
  build: { ssr: path.join(ROOT, 'src/data/assetList.ts'), outDir: path.join(OUT, 'ssr'), rollupOptions: { output: { entryFileNames: 'assetList.mjs' } } },
});
const { ALL_MODELS } = await import(pathToFileURL(path.join(OUT, 'ssr/assetList.mjs')).href);

const bundleDir = path.join(OUT, 'bundle');
const files = await fs.readdir(bundleDir);
const js = await fs.readFile(path.join(bundleDir, 'app.js'), 'utf8');
const css = (await Promise.all(files.filter((f) => f.endsWith('.css')).map((f) => fs.readFile(path.join(bundleDir, f), 'utf8')))).join('\n');

const page = `<title>リサイクルショップ・シミュレーター</title>
<meta name="description" content="客の持ち込み品を査定・買取し、値付けして売る 3D リサイクルショップ経営シミュレーション">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap">
<style>
:root { color-scheme: dark; }
html, body { height: 100%; background: #0d0f14; color: #f4f1ea; }
${css}
</style>
<div id="app"></div>
<div id="ui"></div>
<script type="module">
${js.replaceAll('</script', '<\\/script')}
</script>
`;
await fs.writeFile(path.join(OUT, 'index.html'), page);

// 3) 公開する素材 (public/ からの相対パス)
const pub = path.join(ROOT, 'public');
const list = [
  ...ALL_MODELS.map((m) => `assets/models/${m}`),
  ...(await fs.readdir(path.join(pub, 'assets/audio'))).map((f) => `assets/audio/${f}`),
  'assets/hdri/potsdamer_platz_1k.hdr',
  'assets/hdri/studio_small_03_1k.hdr',
];
// バイナリ (.glb/.hdr) は base64 テキストにして dist-artifact/ に置く。音声 (.ogg) はそのまま
let bytes = 0;
const published = [];
for (const f of list) {
  const src = path.join(pub, f);
  const binary = /\.(glb|hdr)$/.test(f);
  const rel = binary ? `${f}.txt` : f;
  const dest = path.join(OUT, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (binary) await fs.writeFile(dest, (await fs.readFile(src)).toString('base64'));
  else await fs.copyFile(src, dest);
  bytes += (await fs.stat(dest)).size;
  published.push(rel);
}
await fs.writeFile(path.join(OUT, 'files.json'), JSON.stringify(published));
await fs.rm(path.join(OUT, 'ssr'), { recursive: true, force: true });
console.log(`page ${(page.length / 1024).toFixed(0)} KB, assets ${list.length} files ${(bytes / 1024 / 1024).toFixed(1)} MB`);
