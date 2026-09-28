// Strip animation channels the runtime never uses (scale everywhere, translation
// except the pelvis, helper "Nub" bones), resample and meshopt-compress.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample, meshopt, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
const [inp, out] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
let removed = 0;
for (const anim of doc.getRoot().listAnimations()) {
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(); const path = ch.getTargetPath(); const name = node?.getName() ?? '';
    const keep = path === 'rotation' ? !/Nub$|Footsteps/.test(name) : (path === 'translation' && name === 'Bip01 Pelvis');
    if (!keep) { const s = ch.getSampler(); ch.dispose(); s?.dispose(); removed++; }
  }
}
await doc.transform(resample({ tolerance: 0.0008 }), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log(out, 'removed', removed, (await import('fs')).statSync(out).size);
