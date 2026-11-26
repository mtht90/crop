// FBX を glTF バイナリ（.glb）に変換する（three.js の FBXLoader と GLTFExporter をそのまま使う）
// 使い方: node scripts/fbx-to-glb.mjs in.fbx out.glb
import fs from 'node:fs';
import path from 'node:path';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter が使う FileReader を Node の Blob で用意する
globalThis.FileReader ??= class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); }); }
};
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).includes('GLTFExporter')) warn(...a); };

const [src, dst] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const glb = await new GLTFExporter().parseAsync(obj, { binary: true });
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, Buffer.from(glb));
console.log('  ✓', path.basename(dst), `${(glb.byteLength / 1024).toFixed(0)}KB`);
