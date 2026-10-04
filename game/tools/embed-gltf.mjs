// Wraps dist/assets/models/*.glb as JSON ({ "glb": "<base64>" }) for hosts that
// only serve common web file types and block data: URLs. The game decodes the
// bytes itself and parses them as GLB. Usage: node tools/embed-gltf.mjs dist
import fs from 'fs';
import path from 'path';

const dir = path.join(process.argv[2] ?? 'dist', 'assets/models');
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const out = f.replace(/\.glb$/, '.json');
  fs.writeFileSync(path.join(dir, out), JSON.stringify({ glb: fs.readFileSync(path.join(dir, f)).toString('base64') }));
  fs.unlinkSync(path.join(dir, f));
  console.log(f, '->', out);
}
