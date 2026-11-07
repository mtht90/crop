/**
 * ビルド結果（packages/client/dist）を、GLB を配信できないホスティング（claude.ai のアーティファクト等）向けに変換する。
 * 各 .glb を「.json の glTF ＋ 別ファイルのバッファ（.bin.txt）＋ 別ファイルのテクスチャ（.webp/.png）」に分ける。
 * data: / blob: URL を使わないので、厳しい CSP（connect-src 'self'）の下でも読み込める。
 * 使い方：node tools/assets/package-static.mjs <distフォルダ>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2];
const models = join(dist, 'assets/game/models');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const f of await readdir(models)) {
  if (!f.endsWith('.glb')) continue;
  const name = f.replace(/\.glb$/, '');
  const doc = await io.read(join(models, f));
  doc.getRoot().listBuffers().forEach((b, i) => b.setURI(`${name}_${i}.bin`));
  doc.getRoot().listTextures().forEach((t, i) => {
    const ext = t.getMimeType() === 'image/png' ? 'png' : t.getMimeType() === 'image/jpeg' ? 'jpg' : 'webp';
    t.setURI(`${name}_tex${i}.${ext}`);
  });
  const { json, resources } = await io.writeJSON(doc, { format: 'json' });
  for (const b of json.buffers ?? []) {
    const data = resources[b.uri];
    b.uri = `${b.uri}.wasm`; // .bin は配信できないので、バイナリを配信できる拡張子にする（fetch で ArrayBuffer として読むだけで、WebAssembly としては使わない）
    await writeFile(join(models, b.uri), data);
  }
  for (const img of json.images ?? []) if (img.uri && resources[img.uri]) await writeFile(join(models, img.uri), resources[img.uri]);
  await writeFile(join(models, `${name}.json`), JSON.stringify(json));
  await rm(join(models, f));
}
const manifestPath = join(dist, 'assets/game/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await writeFile(manifestPath, JSON.stringify({ ...manifest, modelExt: 'json' }));
console.log('packaged models as glTF JSON + external files');
