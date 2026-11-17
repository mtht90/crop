// Converts every .glb in a folder into a self-contained glTF JSON (.json) with data-URI buffers/images.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs'; import path from 'path';
const dir = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(dir, f));
  const { json, resources } = await io.writeJSON(doc, { format: 'json' });
  const mime = (u) => u.endsWith('.webp') ? 'image/webp' : u.endsWith('.png') ? 'image/png' : u.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
  for (const b of json.buffers || []) if (b.uri) b.uri = 'data:application/octet-stream;base64,' + Buffer.from(resources[b.uri]).toString('base64');
  for (const im of json.images || []) if (im.uri) im.uri = `data:${mime(im.uri)};base64,` + Buffer.from(resources[im.uri]).toString('base64');
  const out = path.join(dir, f.replace('.glb', '.json'));
  fs.writeFileSync(out, JSON.stringify(json));
  fs.unlinkSync(path.join(dir, f));
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(1) + 'MB');
}
