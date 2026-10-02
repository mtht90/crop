// サーバー不要のオフライン版 (ボット戦) を静的ファイル一式として書き出す。
// three.js は CDN から読み込み、サーバーのゲームロジックはブラウザ内で動かす。
//   node scripts/build-artifact.mjs <出力先ディレクトリ>
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { NodeIO, Format } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

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

// 静的ホスティングによっては .glb を配信できず、data: URI の fetch も CSP で禁止されることがある。
// そこで GLB を base64 にして .json に入れ (クライアントが自前でデコード)、テクスチャは PNG として別に置く。
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const modelDir = join(OUT, 'assets', 'models');
const texDir = join(OUT, 'assets', 'textures');
await mkdir(texDir, { recursive: true });
const pad4 = (buf, fill) => {
  const n = (4 - (buf.length % 4)) % 4;
  return n ? Buffer.concat([buf, Buffer.alloc(n, fill)]) : buf;
};
for (const f of await readdir(modelDir)) {
  if (!f.endsWith('.glb')) continue;
  const doc = await io.read(join(modelDir, f));
  const { json, resources } = await io.writeJSON(doc, { format: Format.GLTF });
  if ((json.buffers || []).length > 1) throw new Error(`${f}: バッファが複数あります`);
  for (const im of json.images || []) {
    const data = Buffer.from(resources[im.uri]);
    const name = createHash('sha1').update(data).digest('hex').slice(0, 16) + '.png';
    await writeFile(join(texDir, name), data);
    im.uri = `../textures/${name}`;
    delete im.mimeType;
  }
  let bin = Buffer.alloc(0);
  if (json.buffers && json.buffers.length) {
    bin = pad4(Buffer.from(resources[json.buffers[0].uri]), 0);
    json.buffers[0] = { byteLength: bin.length };
  }
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonChunk.length + (bin.length ? 8 + bin.length : 0);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const chunk = (data, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  const parts = [header, chunk(jsonChunk, 0x4e4f534a)];
  if (bin.length) parts.push(chunk(bin, 0x004e4942));
  const glb = Buffer.concat(parts);
  await writeFile(join(modelDir, f.replace(/\.glb$/, '.json')), JSON.stringify({ glb: glb.toString('base64') }));
  await rm(join(modelDir, f));
}

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
<script>window.FOG_OFFLINE = true; window.FOG_ASSET_FORMAT = 'b64';</script>
${body.trim()}
`;
await writeFile(join(OUT, 'index.html'), html);
console.log('built', OUT, 'three', THREE_VERSION);
