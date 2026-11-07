import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  const anims = r.listAnimations().map((a) => a.getName());
  const skins = r.listSkins().map((s) => s.listJoints().length);
  const bones = r.listSkins()[0]?.listJoints().slice(0, 8).map((j) => j.getName());
  const tex = r.listTextures().map((t) => `${t.getURI() || t.getName()}:${t.getSize()?.join('x')}`);
  const tris = r.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  console.log(f.split('/').slice(-1)[0], { tris, skins, anims: anims.length, animNames: anims.slice(0, 40).join(','), bones: bones?.join(','), tex: tex.join(' ') });
}
