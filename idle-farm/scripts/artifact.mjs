// claude.ai の Artifact として公開するためのビルド後処理。
// - Artifact 側が <html><head><body> の骨組みを付けるので、index.html の中身だけを取り出す
// - Artifact は .gltf / .bin / .glb を配信できないので、モデルを「.json（glTF + base64のバイナリ）」と
//   「.png（テクスチャ）」に変換する。読み込み側は src/scene/assets.ts の artifact モード。
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const SRC = 'dist';
const OUT = 'dist-artifact';

// ---- index.html ----
const html = readFileSync(join(SRC, 'index.html'), 'utf8');
const pick = (tag) => html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}>`))[1];
const head = pick('head').replace(/<meta [^>]*>\s*/g, '');
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const rest = head.replace(title, '');
const scripts = rest.match(/<script[\s\S]*?<\/script>/g) ?? [];
const headNoScripts = scripts.reduce((s, sc) => s.replace(sc, ''), rest);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
writeFileSync(join(OUT, 'index.html'), [title, headNoScripts.trim(), pick('body').trim(), ...scripts].join('\n'));

// ---- モデル ----
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

function readGlb(buf) {
  let offset = 12;
  let json;
  let bin;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + len;
  }
  return { json, bin };
}

let count = 0;
for (const file of walk(join(SRC, 'assets'))) {
  const rel = relative(SRC, file);
  const outBase = join(OUT, rel).replace(/\.(gltf|glb)$/, '');
  if (file.endsWith('.png')) {
    copyFileSync(file, (mkdirSync(dirname(join(OUT, rel)), { recursive: true }), join(OUT, rel)));
    continue;
  }
  let json;
  let bin;
  if (file.endsWith('.gltf')) {
    json = JSON.parse(readFileSync(file, 'utf8'));
    if (json.buffers.length !== 1) throw new Error(`バッファが1つではありません: ${file}`);
    bin = readFileSync(join(dirname(file), json.buffers[0].uri));
    delete json.buffers[0].uri;
  } else if (file.endsWith('.glb')) {
    ({ json, bin } = readGlb(readFileSync(file)));
    // 埋め込みテクスチャは blob: 経由の読み込みを避けるため png ファイルとして書き出す
    (json.images ?? []).forEach((img, i) => {
      if (img.bufferView === undefined) return;
      const view = json.bufferViews[img.bufferView];
      const name = `${outBase.split('/').pop()}_${i}.png`;
      write(join(dirname(outBase), name), bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      delete img.bufferView;
      delete img.mimeType;
      img.uri = name;
    });
  } else {
    continue; // .bin は .gltf と一緒に処理済み
  }
  json['x-bin'] = bin.toString('base64');
  write(outBase + '.json', JSON.stringify(json));
  count++;
}
console.log(`dist-artifact/ を作成しました（モデル ${count} 個を変換）`);
