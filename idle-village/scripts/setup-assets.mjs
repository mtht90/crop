// Tiny Swords (Free Pack) を public/assets/tiny-swords/ に展開するスクリプト。
// 素材のライセンスで再配布が禁止されているため、素材そのものはリポジトリに含めていません。
// 使い方:
//   1. https://pixelfrog-assets.itch.io/tiny-swords から「Tiny Swords (Free Pack).zip」をダウンロード
//   2. npm run setup-assets -- <zipファイル または 展開済みフォルダ のパス>
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const src = process.argv[2];
const dest = path.resolve('public/assets/tiny-swords');
if (!src) {
  console.error('使い方: npm run setup-assets -- "<Tiny Swords (Free Pack).zip へのパス>"');
  process.exit(1);
}

const keep = (rel) =>
  rel.endsWith('.png') &&
  !rel.includes('__MACOSX') &&
  !/\/(Red|Yellow|Purple) (Units|Buildings)\//.test('/' + rel) &&
  !rel.includes('aseprite in Blue only');

function strip(rel) {
  // 先頭の "Tiny Swords (Free Pack)/" を取り除く
  const parts = rel.split('/');
  const i = parts.findIndex((p) => p.startsWith('Tiny Swords'));
  return (i >= 0 ? parts.slice(i + 1) : parts).join('/');
}

let n = 0;
fs.rmSync(dest, { recursive: true, force: true });
if (fs.statSync(src).isDirectory()) {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const rel = path.relative(src, p).split(path.sep).join('/');
        if (!keep(rel)) continue;
        const out = path.join(dest, strip(rel));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.copyFileSync(p, out);
        n++;
      }
    }
  };
  walk(path.resolve(src));
} else {
  const zip = new AdmZip(src);
  for (const e of zip.getEntries()) {
    if (e.isDirectory || !keep(e.entryName)) continue;
    const out = path.join(dest, strip(e.entryName));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, e.getData());
    n++;
  }
}
if (!fs.existsSync(path.join(dest, 'Units/Blue Units/Pawn/Pawn_Idle.png'))) {
  console.error('必要なファイルが見つかりません。Tiny Swords (Free Pack) のzipを指定してください。');
  process.exit(1);
}
console.log(`${n} 個のファイルを ${dest} に展開しました。`);
