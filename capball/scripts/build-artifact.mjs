// dist/ を、Claude のアーティファクトとして公開できる形（1枚の HTML＋素材ファイル）にまとめる
import fs from 'node:fs';
import path from 'node:path';

const [, , outDir] = process.argv;
if (!outDir) throw new Error('usage: node scripts/build-artifact.mjs <outDir>');
const dist = path.resolve('dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const cssFile = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
const js = fs.readFileSync(path.join(dist, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
const page = `<title>キャップ・スタジアム</title>
<meta name="theme-color" content="#0f2a44">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@700;800;900&display=swap">
<style>${css}</style>
<div id="app"></div>
<script type="module">${js}</script>
`;
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), page);
const files = {};
const walk = (rel) => {
  for (const e of fs.readdirSync(path.join(dist, rel), { withFileTypes: true })) {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) walk(r);
    else if (r.endsWith('.glb')) {
      // GLB → バイナリを base64 で埋め込んだ glTF（.json）
      const b = fs.readFileSync(path.join(dist, r));
      const jl = b.readUInt32LE(12);
      const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
      const bl = b.readUInt32LE(20 + jl);
      const bin = b.subarray(28 + jl, 28 + jl + bl);
      // 画像はバッファから取り出して PNG/JPEG ファイルとして配る（blob: の読み込みもアーティファクトでは禁止）
      const base = path.posix.basename(r, '.glb');
      (json.images || []).forEach((img, i) => {
        if (img.bufferView === undefined) return;
        const bv = json.bufferViews[img.bufferView];
        const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
        const name = `${base}_tex${i}.${ext}`;
        const rel = path.posix.join(path.posix.dirname(r), name);
        fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
        fs.writeFileSync(path.join(outDir, rel), bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
        files[rel] = rel;
        delete img.bufferView;
        delete img.mimeType;
        img.uri = name;
      });
      json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
      const rj = r.replace(/\.glb$/, '.json');
      fs.mkdirSync(path.dirname(path.join(outDir, rj)), { recursive: true });
      fs.writeFileSync(path.join(outDir, rj), JSON.stringify(json));
      files[rj] = rj;
    } else if (!r.endsWith('.js') && !r.endsWith('.css') && r !== 'index.html') {
      fs.mkdirSync(path.dirname(path.join(outDir, r)), { recursive: true });
      fs.copyFileSync(path.join(dist, r), path.join(outDir, r));
      files[r] = r;
    }
  }
};
walk('assets');
console.log(JSON.stringify(files, null, 1));
console.log('page KB', (page.length / 1024).toFixed(0));
