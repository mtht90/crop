// Bundles the Kenney Pirate Kit (CC0) models used by the game into one file:
//   public/assets/models/Pirate.glb  (one top-level node per model, shared colormap)
// Usage: ASSET_SRC=<dir with kenney_pirate-kit unzipped to ./pirate> node tools/build-pirate.mjs
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, unpartition } from '@gltf-transform/functions';

const SRC = process.env.ASSET_SRC ?? './asset-src';
const ROOT = process.env.ASSET_OUT ?? new URL('../public/assets/', import.meta.url).pathname;
const MODELS = [
  // Don's arm cannon and its shell.
  'cannon', 'cannon-ball',
  // Pirate cove stage decor.
  'ship-pirate-large', 'ship-pirate-medium', 'ship-large', 'ship-wreck', 'boat-row-small',
  'palm-detailed-bend', 'palm-detailed-straight', 'palm-bend',
  'tower-complete-large', 'tower-watch', 'structure-platform-dock', 'structure',
  'barrel', 'crate', 'chest', 'flag-pirate-high', 'mast-ropes',
  'rocks-sand-a', 'rocks-sand-b', 'rocks-b', 'patch-sand-foliage',
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const target = new Document();
for (const name of MODELS) {
  const src = await io.read(`${SRC}/pirate/Models/GLB format/${name}.glb`);
  const scene = src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0];
  const wrap = src.createNode(name);
  for (const n of scene.listChildren()) {
    scene.removeChild(n);
    wrap.addChild(n);
  }
  scene.addChild(wrap);
  mergeDocuments(target, src);
}
// One scene holding every model.
const [main, ...rest] = target.getRoot().listScenes();
for (const s of rest) {
  for (const n of s.listChildren()) {
    s.removeChild(n);
    main.addChild(n);
  }
  s.dispose();
}
main.setName('PirateKit');
target.getRoot().setDefaultScene(main);
await target.transform(unpartition(), dedup(), prune());
await io.write(`${ROOT}models/Pirate.glb`, target);
console.log('Pirate.glb', fs.statSync(`${ROOT}models/Pirate.glb`).size, 'nodes', main.listChildren().map((n) => n.getName()).join(','));
