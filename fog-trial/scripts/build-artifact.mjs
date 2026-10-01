// サーバー不要のオフライン版 (ボット戦) を静的ファイル一式として書き出す。
// three.js は CDN から読み込み、サーバーのゲームロジックはブラウザ内で動かす。
//   node scripts/build-artifact.mjs <出力先ディレクトリ>
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { NodeIO, Format } from '@gltf-transform/core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) throw new Error('出力先を指定してください');
const THREE_VERSION = JSON.parse(await readFile(join(ROOT, 'node_modules/three/package.json'), 'utf8')).version;
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'server'), { recursive: true });
await cp(join(ROOT, 'public/js'), join(OUT, 'js'), { recursive: true });
await cp(join(ROOT, 'public/assets'), join(OUT, 'assets'), { recursive: true });
await cp(join(ROOT, 'shared'), join(OUT, 'shared'), { recursive: true });
for (const f of ['room.js', 'game.js', 'bots.js', 'pathfinding.js']) await cp(join(ROOT, 'server', f), join(OUT, 'server', f));

// 静的ホスティングによっては .glb を配信できないので、バイナリを埋め込んだ glTF (JSON) に変換して .json で置く
const io = new NodeIO();
const modelDir = join(OUT, 'assets', 'models');
for (const f of await readdir(modelDir)) {
  if (!f.endsWith('.glb')) continue;
  const doc = await io.read(join(modelDir, f));
  const { json, resources } = await io.writeJSON(doc, { format: Format.GLTF });
  const embed = (uri, mime) => `data:${mime};base64,${Buffer.from(resources[uri]).toString('base64')}`;
  for (const b of json.buffers || []) if (b.uri && resources[b.uri]) b.uri = embed(b.uri, 'application/octet-stream');
  for (const im of json.images || []) if (im.uri && resources[im.uri]) im.uri = embed(im.uri, im.mimeType || 'image/png');
  await writeFile(join(modelDir, f.replace(/\.glb$/, '.json')), JSON.stringify(json));
  await rm(join(modelDir, f));
}
const worldJs = join(OUT, 'js', 'world3d.js');
const src = await readFile(worldJs, 'utf8');
if (!src.includes('.glb`')) throw new Error('world3d.js のモデルパスが見つかりません');
await writeFile(worldJs, src.replace('.glb`', '.json`'));

// index.html は <html>/<head>/<body> を外し、CSS をインライン化した単一ページにする
let html = await readFile(join(ROOT, 'public/index.html'), 'utf8');
const css = (await readFile(join(ROOT, 'public/style.css'), 'utf8')).replace(':root {', ':root {\n  color-scheme: dark;');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const viewport = head.match(/<meta name="viewport"[^>]*>/)[0];
const title = head.match(/<title>[^<]*<\/title>/)[0];
html = `${title}
${viewport}
<style>
${css}
</style>
<script type="importmap">
{ "imports": { "three": "${CDN}/build/three.module.js", "three/addons/": "${CDN}/examples/jsm/" } }
</script>
<script>window.FOG_OFFLINE = true;</script>
${body.trim()}
`;
await writeFile(join(OUT, 'index.html'), html);
console.log('built', OUT, 'three', THREE_VERSION);
