// Converts dist/assets/models/*.glb into self-contained glTF JSON (*.json) for
// hosts that only serve common web file types. Usage: node tools/embed-gltf.mjs dist
import fs from 'fs';
import path from 'path';

const dir = path.join(process.argv[2] ?? 'dist', 'assets/models');
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const buf = fs.readFileSync(path.join(dir, f));
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binStart);
  const bin = buf.subarray(binStart + 8, binStart + 8 + binLen);
  json.buffers = [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` }];
  fs.writeFileSync(path.join(dir, f.replace(/\.glb$/, '.json')), JSON.stringify(json));
  fs.unlinkSync(path.join(dir, f));
  console.log(f, '->', f.replace(/\.glb$/, '.json'));
}
