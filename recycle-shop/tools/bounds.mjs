import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs'; import path from 'path';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith('.glb')) continue;
  const doc = await io.read(path.join(dir,f));
  const sc = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  try { const b = getBounds(sc); const s=b.max.map((v,i)=>(v-b.min[i]).toFixed(2)); console.log(f.padEnd(34), 'size', s.join(' x '), ' min', b.min.map(v=>v.toFixed(2)).join(',')); } catch(e){ console.log(f,'err',e.message) }
}
