// Kenney Mini Characters (CC0) の GLB を、ゲームの読み込み方式（バッファ・画像を埋め込んだ glTF JSON）に変換する
// node scripts/npc-json.mjs <in.glb> <out.json>
import fs from 'node:fs';
const [inp, out] = process.argv.slice(2);
const b = fs.readFileSync(inp);
const jsonLen = b.readUInt32LE(12);
const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const binLen = b.readUInt32LE(20 + jsonLen);
const bin = b.subarray(binStart, binStart + binLen);
for (const img of json.images ?? []) {
  if (img.uri && !img.uri.startsWith('data:')) {
    // 外部ファイル参照（Textures/colormap.png）も埋め込む
    const file = inp.slice(0, inp.lastIndexOf('/') + 1) + decodeURIComponent(img.uri);
    img.uri = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    continue;
  }
  if (img.bufferView === undefined) continue;
  const bv = json.bufferViews[img.bufferView];
  const data = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  img.uri = `data:${img.mimeType ?? 'image/png'};base64,${data.toString('base64')}`;
  delete img.bufferView;
  delete img.mimeType;
}
json.buffers = [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` }];
fs.mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
fs.writeFileSync(out, JSON.stringify(json));
console.log(out, Math.round(fs.statSync(out).size / 1024) + 'KB');
