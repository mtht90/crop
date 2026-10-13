// 背景モデルの取り込み（Quaternius Stylized Nature MegaKit / CC0）。テクスチャを 512px に縮小して GLB 化する。
// 使い方: node tools/build_env.mjs "<stylized-nature-megakit/glTF>"
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import path from 'node:path';

const SRC = process.argv[2];
const OUT = process.env.OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'env');
const PICK = [
  'CherryBlossom_1', 'CherryBlossom_3', 'DeadTree_1', 'DeadTree_3', 'TwistedTree_2', 'Pine_2', 'Pine_4',
  'Bush_Common', 'Bush_Large', 'Fern_1', 'Rock_Big_1', 'Rock_Medium_1', 'Rock_Medium_3', 'Pebble_Round_2',
  'Grass_Wispy_Tall', 'Grass_Common_Short', 'Mushroom_RedCap', 'Flower_3_Group', 'Plant_1',
];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const n of PICK) {
  const doc = await io.read(path.join(SRC, n + '.gltf'));
  await doc.transform(dedup(), textureCompress({ encoder: sharp, targetFormat: 'png', resize: [256, 256] }), prune());
  await io.write(path.join(OUT, n + '.glb'), doc);
  console.log(n);
}
