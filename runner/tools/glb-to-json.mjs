// deps: @gltf-transform/* meshoptimizer
// Converts every .glb in a folder into a self-contained glTF JSON (.json) with data-URI buffers/images.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, dedup, prune, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs'; import path from 'path';
await MeshoptEncoder.ready;
const dir = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(dir, f));
  // drop redundant animation keys + quantize vertices (KHR_mesh_quantization: no WASM decoder needed)
  await doc.transform(resample({ tolerance: 1e-4 }), dedup(), prune({ keepLeaves: true }), quantize());
  const { json, resources } = await io.writeJSON(doc, { format: 'json' });
  const mime = (u) => u.endsWith('.webp') ? 'image/webp' : u.endsWith('.png') ? 'image/png' : u.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
  for (const b of json.buffers || []) if (b.uri) b.uri = 'data:application/octet-stream;base64,' + Buffer.from(resources[b.uri]).toString('base64');
  // images become separate files next to the model (artifact CSP blocks data:/blob: fetches)
  (json.images || []).forEach((im, i) => {
    if (!im.uri) return;
    const ext = im.uri.split('.').pop();
    const name = f.replace('.glb', '') + '_img' + i + '.' + ext;
    fs.writeFileSync(path.join(dir, name), Buffer.from(resources[im.uri]));
    im.uri = name;
  });
  const out = path.join(dir, f.replace('.glb', '.json'));
  fs.writeFileSync(out, JSON.stringify(json));
  fs.unlinkSync(path.join(dir, f));
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(1) + 'MB');
}
