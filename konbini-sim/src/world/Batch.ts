import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge static meshes that share a material into single meshes.
 * Interactive objects (anything under a node with userData.interact /
 * noMerge) and slot helpers are left alone so picking keeps working.
 * Returns the number of meshes removed.
 */
export function batchStatic(root: THREE.Object3D, target: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  const skip = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) {
      const ud = p.userData;
      if (ud.interact || ud.noMerge || ud.slot || ud.panel || ud.box || ud.npc) return true;
    }
    return false;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if (!mat.visible || mat.transparent) return;
    if (skip(m)) return;
    const g = m.geometry;
    if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) return;
    // quantised glTF attributes (meshopt) can't be merged with float ones
    for (const n of ['position', 'normal', 'uv']) {
      const a = g.attributes[n] as THREE.BufferAttribute;
      if (!(a.array instanceof Float32Array) || a.normalized || (a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return;
    }
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return;
    const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let entry = groups.get(key);
    if (!entry) groups.set(key, (entry = { mat, cast: m.castShadow, receive: m.receiveShadow, geos: [], meshes: [] }));
    let geo = g.index ? g.toNonIndexed() : g.clone();
    // keep only the attributes every mesh has
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    geo.clearGroups();
    geo = geo.applyMatrix4(m.matrixWorld);
    entry.geos.push(geo);
    entry.meshes.push(m);
  });
  let removed = 0;
  const inv = new THREE.Matrix4().copy(target.matrixWorld).invert();
  for (const e of groups.values()) {
    if (e.meshes.length < 2) continue;
    const merged = mergeGeometries(e.geos, false);
    if (!merged) continue;
    merged.applyMatrix4(inv);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, e.mat);
    mesh.castShadow = e.cast;
    mesh.receiveShadow = e.receive;
    mesh.name = 'batched';
    target.add(mesh);
    for (const m of e.meshes) {
      m.removeFromParent();
      removed++;
    }
    removed--;
  }
  return removed;
}
