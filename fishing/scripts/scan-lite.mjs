// 実写スキャンを軽くする（開発用）。
// 使い方: SNAP=0.003 node scripts/scan-lite.mjs <元.glb> <出力.glb> [三角形数=9000]
// 必要なパッケージ: npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//
// 1. 比較用の立方体を除く
// 2. テクスチャごとに分かれた部品を、テクスチャを横に並べた1枚のアトラスにまとめて1つのメッシュにする
// 3. 頂点を結合し、UV の継ぎ目をまたいで縮約できる設定で簡略化する
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out, target = '9000', texSize = '1024'] = process.argv.slice(2);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
await doc.transform(dequantize());
const root = doc.getRoot();
const scene = root.listScenes()[0];
const T = Number(texSize);

// 部品（立方体以外）を集める
const parts = [];
for (const node of root.listNodes()) {
  const m = node.getMesh();
  if (!m) continue;
  for (const p of m.listPrimitives()) {
    if (p.getAttribute('POSITION').getCount() < 100) continue;
    parts.push({ node, prim: p });
  }
}

// テクスチャを横に並べる
const tiles = [];
for (const { prim } of parts) {
  const tex = prim.getMaterial()?.getBaseColorTexture();
  tiles.push(await sharp(Buffer.from(tex.getImage())).resize(T, T, { fit: 'fill' }).toBuffer());
}
const atlas = await sharp({ create: { width: T * parts.length, height: T, channels: 3, background: '#808080' } })
  .composite(tiles.map((input, i) => ({ input, left: i * T, top: 0 })))
  .jpeg({ quality: 85 })
  .toBuffer();

// 1つのメッシュにまとめる（部品の変換は焼き込む）
const pos = [];
const uv = [];
const idx = [];
let base = 0;
parts.forEach(({ node, prim }, k) => {
  const m = node.getWorldMatrix();
  const P = prim.getAttribute('POSITION').getArray();
  const U = prim.getAttribute('TEXCOORD_0').getArray();
  const n = P.length / 3;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
    const u = Math.min(1, Math.max(0, U[i * 2]));
    uv.push((k + u) / parts.length, U[i * 2 + 1]);
  }
  const I = prim.getIndices() ? prim.getIndices().getArray() : Uint32Array.from({ length: n }, (_, i) => i);
  for (const v of I) idx.push(v + base);
  base += n;
});
// 部品の境目などでわずかにずれた頂点を、格子に丸めて同じ位置にそろえる（簡略化で継ぎ目として扱われるように）
{
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], pos[i + j]); mx[j] = Math.max(mx[j], pos[i + j]); }
  const cell = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * Number(process.env.SNAP ?? 0.002);
  for (let i = 0; i < pos.length; i++) pos[i] = Math.round(pos[i] / cell) * cell;
}
const buffer = root.listBuffers()[0];
const texture = doc.createTexture('atlas').setImage(new Uint8Array(atlas)).setMimeType('image/jpeg');
const material = doc.createMaterial('scan').setBaseColorTexture(texture).setRoughnessFactor(0.6).setMetallicFactor(0);
const prim = doc
  .createPrimitive()
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
  .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))
  .setMaterial(material);
const mesh = doc.createMesh('fish').addPrimitive(prim);
for (const n of root.listNodes()) n.dispose();
scene.addChild(doc.createNode('fish').setMesh(mesh));
await doc.transform(prune(), weld());

// 簡略化
const p = root.listMeshes()[0].listPrimitives()[0];
const P = Float32Array.from(p.getAttribute('POSITION').getArray());
const I = Uint32Array.from(p.getIndices().getArray());
const want = Math.min(I.length / 3, Number(target)) * 3;
const [res, err] = MeshoptSimplifier.simplify(I, P, 3, want, 0.1, ['Permissive']);
const map = new Map();
const newIdx = new Uint32Array(res.length);
for (let i = 0; i < res.length; i++) {
  let v = map.get(res[i]);
  if (v === undefined) {
    v = map.size;
    map.set(res[i], v);
  }
  newIdx[i] = v;
}
for (const sem of p.listSemantics()) {
  const acc = p.getAttribute(sem);
  const src = acc.getArray();
  const k = acc.getElementSize();
  const dst = new Float32Array(map.size * k);
  for (const [o, nIdx] of map) for (let j = 0; j < k; j++) dst[nIdx * k + j] = src[o * k + j];
  acc.setArray(dst);
}
p.getIndices().setArray(newIdx);
console.log(`  ${parts.length} parts, ${I.length / 3} -> ${newIdx.length / 3} tris, ${map.size} verts, err ${err.toFixed(4)}`);
await doc.transform(prune());
await io.write(out, doc);
