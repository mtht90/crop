/**
 * ビルド結果（packages/client/dist）を、GLB を配信できないホスティング向けに変換する。
 * 各 .glb を、バッファを埋め込んだ .json 形式の glTF に変換し、manifest.json の modelExt を 'json' にする。
 * 使い方：node tools/assets/package-static.mjs <distフォルダ>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2];
const models = join(dist, 'assets/game/models');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream' };

for (const f of await readdir(models)) {
  if (!f.endsWith('.glb')) continue;
  const doc = await io.read(join(models, f));
  const { json, resources } = await io.writeJSON(doc, { format: 'json' });
  const toDataUri = (uri) => {
    const ext = uri.slice(uri.lastIndexOf('.'));
    return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${Buffer.from(resources[uri]).toString('base64')}`;
  };
  for (const b of json.buffers ?? []) if (b.uri && resources[b.uri]) b.uri = toDataUri(b.uri);
  for (const i of json.images ?? []) if (i.uri && resources[i.uri]) i.uri = toDataUri(i.uri);
  await writeFile(join(models, f.replace(/\.glb$/, '.json')), JSON.stringify(json));
  await rm(join(models, f));
}
const manifestPath = join(dist, 'assets/game/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await writeFile(manifestPath, JSON.stringify({ ...manifest, modelExt: 'json' }));
console.log('packaged models as embedded glTF JSON');
