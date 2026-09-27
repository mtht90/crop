import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const hist = {};
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const wm = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL');
      for (let i = 0; i < pos.getCount(); i++) {
        const n = nor.getElement(i, []); const v = pos.getElement(i, []);
        const y = wm[1]*v[0]+wm[5]*v[1]+wm[9]*v[2]+wm[13];
        const ny = wm[1]*n[0]+wm[5]*n[1]+wm[9]*n[2];
        if (ny > 0.95) { const k = y.toFixed(2); hist[k] = (hist[k]||0)+1; }
      }
    }
  }
  console.log(f.split('/').pop(), Object.entries(hist).sort((a,b)=>a[0]-b[0]).filter(e=>e[1]>=4).map(e=>e.join(':')).join('  '));
}
