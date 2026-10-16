import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

// 何百個も並べる小物は、読み込み時に meshoptimizer (WASM) で間引いた形状を使う
const LOD_TRIS = 3000;
async function simplifyGeometry(geo, target = LOD_TRIS) {
  const pos = geo.attributes.position;
  if (!geo.index || !(pos.array instanceof Float32Array) || pos.isInterleavedBufferAttribute) return geo;
  const tris = geo.index.count / 3;
  if (tris <= target * 1.2) return geo;
  await MeshoptSimplifier.ready;
  const idx = new Uint32Array(geo.index.array);
  let [out] = MeshoptSimplifier.simplify(idx, pos.array, 3, Math.floor(target) * 3, 0.012, ['LockBorder']);
  if (out.length > target * 4.5) [out] = MeshoptSimplifier.simplify(idx, pos.array, 3, Math.floor(target) * 3, 0.02, []); // 継ぎ目が多いモデル
  if (out.length < 3) return geo;
  const g = geo.clone();
  g.setIndex(new THREE.BufferAttribute(out, 1));
  return g;
}
import { PROPS, PROP_DIMS } from './assets.js';

export const CHUNK = 60; // 描画をまとめる縦方向の区間(m)

/**
 * Poly Haven のガラクタを巨大化して配置する。
 * 物理コライダーは計測済み寸法から即座に作り、見た目は読み込み完了後に InstancedMesh でまとめて描画する。
 */
export class PropManager {
  constructor({ loader, scene, world, RAPIER }) {
    Object.assign(this, { loader, scene, world, RAPIER });
    this.instances = new Map(); // id -> [{ matrix, chunk, body }]
    this.dynamic = new Map();   // id -> [Group]
    this.chunks = new Map();    // chunk -> [InstancedMesh]
    this.hullTargets = new Map(); // id -> [{ body, placeholder, matrix }]
    this.loadedIds = new Set();
    this.local = new Map();
    for (const id of Object.keys(PROPS)) this.local.set(id, this.computeLocal(id));
  }

  /** モデル原点 → 「上面中心が原点」になる変換と、変換後の寸法 */
  computeLocal(id) {
    const def = PROPS[id], d = PROP_DIMS[id];
    const rs = new THREE.Matrix4().makeScale(def.scale, def.scale, def.scale);
    if (def.lieFlat) rs.premultiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    const box = new THREE.Box3(new THREE.Vector3(...d.min), new THREE.Vector3(d.min[0] + d.size[0], d.min[1] + d.size[1], d.min[2] + d.size[2]));
    box.applyMatrix4(rs);
    const c = box.getCenter(new THREE.Vector3());
    const off = new THREE.Matrix4().makeTranslation(-c.x, -box.max.y, -c.z).multiply(rs);
    const size = box.getSize(new THREE.Vector3());
    return { off, size, hw: size.x / 2, hd: size.z / 2, h: size.y };
  }

  dims(id) { return this.local.get(id); }

  footprint(id) {
    const L = this.local.get(id), def = PROPS[id];
    if (def.collider === 'cyl') return { type: 'circle', r: Math.min(L.hw, L.hd) * 0.95 };
    if (def.collider === 'hull') return { type: 'rect', hw: L.hw * 0.7, hd: L.hd * 0.7 };
    return { type: 'rect', hw: L.hw, hd: L.hd };
  }

  /** 上面中心が pos、向き yaw で配置。コライダーを body に追加して instance を登録 */
  colliderDescs(id) {
    const R = this.RAPIER, L = this.local.get(id), def = PROPS[id];
    const out = [];
    if (def.collider === 'cyl') out.push(R.ColliderDesc.cylinder(L.h / 2, Math.min(L.hw, L.hd)).setTranslation(0, -L.h / 2, 0));
    else if (def.collider === 'car') {
      out.push(R.ColliderDesc.cuboid(L.hw, L.h * 0.33, L.hd).setTranslation(0, -L.h * 0.67, 0));
      out.push(R.ColliderDesc.cuboid(L.hw * 0.9, L.h * 0.18, L.hd * 0.42).setTranslation(0, -L.h * 0.18, -L.hd * 0.05));
    } else if (def.collider !== 'none') out.push(R.ColliderDesc.cuboid(L.hw, L.h / 2, L.hd).setTranslation(0, -L.h / 2, 0));
    return out;
  }

  addStatic(id, pos, yaw, body) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)).multiply(this.local.get(id).off);
    const chunk = Math.floor(pos.y / CHUNK);
    if (!this.instances.has(id)) this.instances.set(id, []);
    this.instances.get(id).push({ matrix: m, chunk });
    if (PROPS[id].collider === 'hull' && body) {
      if (!this.hullTargets.has(id)) this.hullTargets.set(id, []);
      this.hullTargets.get(id).push({ body, placeholder: null });
    }
  }

  /** 動く足場用：Group を返し、モデルは読み込み後に子として追加 */
  addDynamic(id) {
    const g = new THREE.Group();
    if (!this.dynamic.has(id)) this.dynamic.set(id, []);
    this.dynamic.get(id).push(g);
    return g;
  }

  registerHullPlaceholder(id, body, collider) {
    const t = this.hullTargets.get(id)?.find((h) => h.body === body && !h.placeholder);
    if (t) t.placeholder = collider;
  }

  /** zone の若い順にモデルを読み込み、届いたものから描画に加える */
  async loadAll(onEach) {
    const ids = Object.keys(PROPS).filter((id) => this.instances.has(id) || this.dynamic.has(id))
      .sort((a, b) => PROPS[a].zone - PROPS[b].zone);
    const queue = [...ids];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        try { await this.build(id, await this.loader.phModel(id)); onEach?.(id); } catch (e) { console.warn('model', id, e.message); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  /** 指定ゾーンまでのモデルだけ先に読み込む */
  async loadZones(maxZone, onEach) {
    const ids = Object.keys(PROPS).filter((id) => PROPS[id].zone <= maxZone && (this.instances.has(id) || this.dynamic.has(id)));
    await Promise.all(ids.map(async (id) => {
      try { await this.build(id, await this.loader.phModel(id)); onEach?.(id); } catch (e) { console.warn('model', id, e.message); }
    }));
  }

  async build(id, gltf) {
    if (this.loadedIds.has(id)) return;
    this.loadedIds.add(id);
    gltf.scene.updateMatrixWorld(true);
    const node = PROPS[id].node ? gltf.scene.getObjectByName(PROPS[id].node) : null;
    const scene = node || gltf.scene; // キット内の1パーツだけ使う場合
    const meshes = [];
    scene.traverse((o) => {
      if (o.isMesh) {
        o.material.envMapIntensity = 1.1;
        meshes.push(o);
      }
    });
    // 静的インスタンス用の間引き形状（1モデル全体で LOD_TRIS 程度に）
    const total = meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
    const lodGeo = new Map();
    if (total > LOD_TRIS * 1.2) {
      for (const m of meshes) {
        const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        lodGeo.set(m, await simplifyGeometry(m.geometry, Math.max(60, (t / total) * LOD_TRIS)));
      }
    }
    // 静的インスタンス：チャンクごとに InstancedMesh
    const list = this.instances.get(id) || [];
    const byChunk = new Map();
    for (const inst of list) {
      if (!byChunk.has(inst.chunk)) byChunk.set(inst.chunk, []);
      byChunk.get(inst.chunk).push(inst);
    }
    const tmp = new THREE.Matrix4();
    for (const [chunk, insts] of byChunk) {
      for (const mesh of meshes) {
        let geo = lodGeo.get(mesh) || mesh.geometry;
        if (Object.keys(geo.morphAttributes).length) { geo = geo.clone(); geo.morphAttributes = {}; } // インスタンス描画はモーフ非対応
        const im = new THREE.InstancedMesh(geo, mesh.material, insts.length);
        insts.forEach((inst, i) => im.setMatrixAt(i, tmp.multiplyMatrices(inst.matrix, mesh.matrixWorld)));
        im.castShadow = true; im.receiveShadow = true;
        im.layers.set(1); // 水面の反射カメラ(layer0)には映さない＝描画負荷を半減
        im.userData.chunk = chunk; im.userData.propId = id;
        im.computeBoundingSphere();
        im.visible = this.visibleChunk ? this.visibleChunk(chunk) : true;
        this.scene.add(im);
        if (!this.chunks.has(chunk)) this.chunks.set(chunk, []);
        this.chunks.get(chunk).push(im);
      }
    }
    // 動的
    for (const g of this.dynamic.get(id) || []) {
      const c = scene.clone(true);
      if (node) { c.matrixAutoUpdate = false; c.matrix.copy(node.matrixWorld); }
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(this.local.get(id).off);
      holder.add(c);
      c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(holder);
    }
    // 凸包コライダーへ差し替え（月の岩など凹凸のある足場）
    const targets = this.hullTargets.get(id);
    if (targets?.length) {
      const pts = [];
      const v = new THREE.Vector3();
      const off = this.local.get(id).off;
      for (const mesh of meshes) {
        const pos = mesh.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pos.count / 1500));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(off);
          pts.push(v.x, v.y, v.z);
        }
      }
      const arr = new Float32Array(pts);
      for (const t of targets) {
        const desc = this.RAPIER.ColliderDesc.convexHull(arr);
        if (!desc) continue;
        desc.setFriction(0);
        const c = this.world.createCollider(desc, t.body);
        this.onCollider?.(c, t.body);
        if (t.placeholder) this.world.removeCollider(t.placeholder, false);
      }
    }
  }

  /** プレイヤー付近のチャンクだけ描画 */
  updateVisibility(y, range = this.range ?? 100) {
    const lo = Math.floor((y - range) / CHUNK), hi = Math.floor((y + range) / CHUNK);
    const me = Math.floor(y / CHUNK);
    this.visibleChunk = (c) => c >= lo && c <= hi;
    for (const [c, list] of this.chunks) {
      const vis = c >= lo && c <= hi;
      const shadow = this.shadows !== false && Math.abs(c - me) <= 1;
      for (const m of list) { m.visible = vis; m.castShadow = shadow; }
    }
  }
}
