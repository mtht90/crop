// Optimise a third-party glTF for the web: drop named nodes, resize + webp textures, meshopt.
// usage: node opt.mjs in.glb out.glb maxTex [dropNodeName,...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, weld, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [inp, out, maxTex = '1024', drop = '', ratio = '1'] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const dropSet = new Set(drop.split(',').filter(Boolean));
for (const n of doc.getRoot().listNodes()) if (dropSet.has(n.getName())) n.dispose();
const steps = [dedup(), prune(), resample()];
if (+ratio < 1) steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.001 }));
steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+maxTex, +maxTex], quality: 82 }));
steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await doc.transform(...steps);
await io.write(out, doc);
console.log(out, (await import('fs')).statSync(out).size);
