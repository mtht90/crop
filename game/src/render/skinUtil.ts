import * as THREE from 'three';

/** Keeps only the triangles whose three vertices are driven mostly by bones accepted by `keep`. */
export function keepTriangles(mesh: THREE.SkinnedMesh, keep: (boneName: string) => boolean) {
  const g = mesh.geometry;
  const idx = g.index;
  if (!idx) return;
  const si = g.attributes.skinIndex as THREE.BufferAttribute;
  const sw = g.attributes.skinWeight as THREE.BufferAttribute;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const ok = new Uint8Array(si.count);
  for (let v = 0; v < si.count; v++) {
    let best = -1;
    let bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(v, k);
      if (w > best) {
        best = w;
        bi = si.getComponent(v, k);
      }
    }
    ok[v] = keep(names[bi]) ? 1 : 0;
  }
  const out: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (ok[a] && ok[b] && ok[c]) out.push(a, b, c);
  }
  const ng = new THREE.BufferGeometry();
  for (const [k, v] of Object.entries(g.attributes)) ng.setAttribute(k, v);
  ng.setIndex(out);
  mesh.geometry = ng;
}

/** Re-binds a skinned mesh from another file onto `bones` (same skeleton layout, matched by name). */
export function rebindToBones(mesh: THREE.SkinnedMesh, bones: Map<string, THREE.Bone>) {
  const src = mesh.skeleton;
  const mapped = src.bones.map((b) => bones.get(b.name) ?? b);
  mesh.bind(new THREE.Skeleton(mapped, src.boneInverses), mesh.bindMatrix);
}
