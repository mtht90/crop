import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { assets } from './assets';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MonsterId } from './data';

(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface Collider { x: number; z: number; r: number; h: number }
interface Capsule { a: THREE.Vector2; b: THREE.Vector2; r: number }

/** 乱数（シード固定：毎回同じ地形） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface SpawnDef { id: MonsterId; x: number; z: number; group?: number }

export class World {
  scene: THREE.Scene;
  root = new THREE.Group();
  groundMeshes: THREE.Mesh[] = [];
  colliders: Collider[] = [];
  zones: Capsule[] = [];
  arena = { x: 0, z: -212, r: 26 };
  gate = { x: 0, z: -182 };
  start = new THREE.Vector3(0, 0, 14);
  // 高さマップ
  hmin = new THREE.Vector2(-70, -250);
  hres = 1;
  hw = 0;
  hh = 0;
  heights!: Float32Array;
  sun!: THREE.DirectionalLight;
  spawns: SpawnDef[] = [];
  lamps: THREE.PointLight[] = [];
  lockArena = false;
  forgeGlow!: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build() {
    const R = rng(1337);
    const sc = this.scene;
    sc.add(this.root);
    sc.background = assets.sky!;
    sc.fog = new THREE.FogExp2(0x5d6b66, 0.017);

    const hemi = new THREE.HemisphereLight(0xc8d8e0, 0x3a4030, 1.5);
    sc.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.sun.position.set(30, 60, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc2 = this.sun.shadow.camera;
    sc2.left = -45; sc2.right = 45; sc2.top = 45; sc2.bottom = -45; sc2.near = 1; sc2.far = 160;
    this.sun.shadow.bias = -0.0008;
    sc.add(this.sun, this.sun.target);

    // ── 歩ける範囲（カプセルの連結）
    const path: [number, number, number][] = [
      [0, 14, 15], [4, -20, 17], [-8, -55, 19], [6, -92, 18], [-6, -128, 19], [2, -160, 15], [0, -184, 8],
    ];
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, z0, r0] = path[i];
      const [x1, z1, r1] = path[i + 1];
      this.zones.push({ a: new THREE.Vector2(x0, z0), b: new THREE.Vector2(x1, z1), r: Math.min(r0, r1) });
    }
    this.zones.push({ a: new THREE.Vector2(0, -186), b: new THREE.Vector2(0, -205), r: 9 });
    this.zones.push({ a: new THREE.Vector2(0, -212), b: new THREE.Vector2(0, -212.01), r: this.arena.r });

    // ── 地面：泥と島のタイル（外部モデル）
    const ground = new THREE.Group();
    this.root.add(ground);
    const addGround = (name: string, x: number, z: number, s: number, yaw: number, y = 0, sy = 1) => {
      const o = assets.clonePart('swamp', name);
      o.position.set(x, y, z);
      o.rotation.y = yaw;
      o.scale.set(s, sy, s);
      ground.add(o);
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          const mm = m as THREE.Mesh;
          mm.castShadow = false;
          this.groundMeshes.push(mm);
        }
      });
      return o;
    };
    for (let z = 30; z > -195; z -= 9) {
      for (let x = -40; x <= 40; x += 9) {
        if (!this.inZones(x, z, 12)) continue;
        addGround('Mud_01a', x + (R() - 0.5) * 3, z + (R() - 0.5) * 3, 2.4 + R() * 0.6, R() * Math.PI * 2, -0.55, 0.7);
      }
    }
    // 盛り上がった草の島（遮蔽物＋段差）
    const islands: [number, number][] = [[-9, -8], [11, -38], [-15, -66], [12, -78], [-2, -105], [-14, -140], [13, -125], [10, -150]];
    for (const [x, z] of islands) addGround('Island_01a', x, z, 0.55 + R() * 0.2, R() * 6.28, -2.4);
    // ── ボス闘技場：崩れた炉の床
    const dk = 'dungeon';
    for (let x = -28; x <= 28; x += 4) {
      for (let z = -240; z <= -184; z += 4) {
        const dx = x - this.arena.x;
        const dz = z - this.arena.z;
        const d = Math.hypot(dx, dz);
        const inPath = Math.abs(x) <= 8 && z > -200;
        if (d > this.arena.r + 1.5 && !inPath) continue;
        if (R() < 0.06 && d > 8) continue; // 欠けたタイル
        const t = assets.clonePart(dk, 'floor_tile');
        t.scale.set(2, 1.5, 2);
        t.position.set(x, 0.05 + R() * 0.06, z);
        t.rotation.y = Math.floor(R() * 4) * (Math.PI / 2);
        ground.add(t);
        t.traverse((m) => {
          if ((m as THREE.Mesh).isMesh) {
            (m as THREE.Mesh).castShadow = false;
            this.groundMeshes.push(m as THREE.Mesh);
          }
        });
      }
    }
    for (const m of this.groundMeshes) {
      const g = m.geometry as any;
      if (!g.boundsTree) g.computeBoundsTree();
    }
    this.root.updateMatrixWorld(true);
    this.bakeHeights();

    // ── 崖と岩壁で外周を囲む
    const cliffNames = ['Clif_01a', 'Clif_02a', 'Clif_03a'];
    for (let i = 0; i < this.zones.length - 1; i++) {
      const z0 = this.zones[i];
      const dir = z0.b.clone().sub(z0.a);
      const len = dir.length();
      dir.normalize();
      const nrm = new THREE.Vector2(-dir.y, dir.x);
      const yaw = Math.atan2(dir.x, dir.y);
      for (const side of [-1, 1]) {
        for (let t = 0; t < len; t += 26) {
          const p = z0.a.clone().addScaledVector(dir, t + 13).addScaledVector(nrm, side * (z0.r + 9));
          if (this.inZones(p.x, p.y, 4)) continue;
          const c = assets.clonePart('swamp', cliffNames[Math.floor(R() * 3)]);
          c.scale.setScalar(0.17 + R() * 0.05);
          c.position.set(p.x, -1.5, p.y);
          c.rotation.y = yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (R() - 0.5) * 0.3;
          this.root.add(c);
        }
      }
    }
    // 闘技場の外壁（岩壁）
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) {
      const x = this.arena.x + Math.sin(a) * (this.arena.r + 10);
      const z = this.arena.z + Math.cos(a) * (this.arena.r + 10);
      if (z > this.arena.z + 20 && Math.abs(x) < 14) continue; // 入口
      const w = assets.clonePart('swamp', ['Wall_01a', 'Wall_02a', 'Wall_03a'][Math.floor(R() * 3)]);
      w.scale.setScalar(0.9 + R() * 0.3);
      w.position.set(x, -1, z);
      w.rotation.y = a + Math.PI / 2;
      this.root.add(w);
    }
    // 柱（崩れかけの炉の列柱）
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      const x = this.arena.x + Math.sin(a + 0.3) * (this.arena.r - 4);
      const z = this.arena.z + Math.cos(a + 0.3) * (this.arena.r - 4);
      if (z > this.arena.z + 16 && Math.abs(x) < 9) continue;
      const p = assets.clonePart(dk, 'pillar');
      const h = 1.2 + R() * 1.3;
      p.scale.set(1.8, h, 1.8);
      p.position.set(x, this.heightAt(x, z) - 0.2, z);
      this.root.add(p);
      this.colliders.push({ x, z, r: 0.75, h: 3 * h });
    }
    // 炉心のモノリス
    const mono = assets.clonePart('monolith', 'monolith');
    mono.scale.setScalar(2.4);
    mono.position.set(this.arena.x, this.heightAt(0, this.arena.z - 20), this.arena.z - 21);
    this.root.add(mono);
    this.colliders.push({ x: 0, z: this.arena.z - 21, r: 2.5, h: 8 });
    this.forgeGlow = new THREE.PointLight(0x70c0ff, 30, 30, 1.6);
    this.forgeGlow.position.set(0, 5, this.arena.z - 17);
    sc.add(this.forgeGlow);
    // 入口のアーチ（壁＋扉枠）
    for (const side of [-1, 1]) {
      const w = assets.clonePart(dk, 'wall_doorway');
      w.scale.set(2, 2.4, 2);
      w.position.set(side * 6.5, 0, -186);
      w.rotation.y = Math.PI / 2;
      this.root.add(w);
      const pl = assets.clonePart(dk, 'pillar');
      pl.scale.set(2, 2.6, 2);
      pl.position.set(side * 8.6, 0, -186);
      this.root.add(pl);
      this.colliders.push({ x: side * 8.6, z: -186, r: 0.9, h: 8 });
    }

    // ── 植生と岩（コリジョン付き）
    const trees = ['tree8', 'tree9', 'tree10', 'tree6', 'BrokenTree_02a', 'BrokenTree_02c', 'tree4', 'tree7', 'BrokenTree_02a', 'tree8'];
    const rocks = ['RockBig_01a', 'RockBig_02a', 'RockBig_Moss_01a', 'Stones_Mound_01a', 'Rock31_Big'];
    const smalls = ['Fungus_01a', 'Fungus_02a', 'Fungus_03a', 'Fungus_04a', 'Grass_01a', 'Grass_02a', 'Grass_03a', 'Grass_Dead_03a', 'Bush1c', 'Bush2d', 'Root_04a', 'Stones_03a', 'Stones_Moss_04a', 'LeafFruits_01a', 'Grass_Hill_01a'];
    const place = (name: string, x: number, z: number, s: number, collide: number) => {
      const o = assets.clonePart('swamp', name);
      o.scale.setScalar(s);
      o.position.set(x, this.heightAt(x, z) - 0.15, z);
      o.rotation.y = R() * Math.PI * 2;
      this.root.add(o);
      if (collide > 0) this.colliders.push({ x, z, r: collide * s, h: 8 * s });
    };
    // 縁沿いの木
    for (const zc of this.zones.slice(0, 6)) {
      const dir = zc.b.clone().sub(zc.a);
      const len = dir.length();
      dir.normalize();
      const nrm = new THREE.Vector2(-dir.y, dir.x);
      for (let t = 0; t < len; t += 7) {
        for (const side of [-1, 1]) {
          const p = zc.a.clone().addScaledVector(dir, t + R() * 5).addScaledVector(nrm, side * (zc.r - 2 - R() * 4));
          if (R() < 0.6) place(trees[Math.floor(R() * trees.length)], p.x, p.y, 0.8 + R() * 0.5, 0.7);
          else place(rocks[Math.floor(R() * rocks.length)], p.x, p.y, 0.7 + R() * 0.6, 1.6);
        }
      }
    }
    // 道中の障害物
    const mids: [number, number][] = [[6, -2], [-6, -30], [10, -50], [-12, -84], [3, -70], [-3, -118], [9, -108], [-8, -152], [7, -170]];
    for (const [x, z] of mids) {
      if (R() < 0.5) place(trees[Math.floor(R() * 7)], x, z, 0.9 + R() * 0.3, 0.7);
      else place(rocks[Math.floor(R() * 3)], x, z, 0.8 + R() * 0.3, 1.7);
    }
    // 小物
    for (let i = 0; i < 260; i++) {
      const x = (R() - 0.5) * 80;
      const z = 25 - R() * 260;
      if (!this.inZones(x, z, 0) || this.inArena(x, z, 2) || Math.hypot(x, z - 14) < 9) continue;
      place(smalls[Math.floor(R() * smalls.length)], x, z, 0.6 + R() * 0.8, 0);
    }
    // 闘技場の瓦礫
    for (let i = 0; i < 18; i++) {
      const a = R() * Math.PI * 2;
      const d = 8 + R() * 15;
      const x = Math.sin(a) * d;
      const z = this.arena.z + Math.cos(a) * d;
      const o = assets.clonePart('swamp', ['Stones_03a', 'Stones_01a', 'Rock32', 'Rock31_Big'][Math.floor(R() * 4)]);
      o.scale.setScalar(0.5 + R() * 0.4);
      o.position.set(x, this.heightAt(x, z), z);
      o.rotation.y = R() * 6.28;
      this.root.add(o);
    }
    // 野営地の柵と板
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.36;
      const f = assets.clonePart('swamp', i % 2 ? 'Fence_01a' : 'Fence_02a');
      f.position.set(Math.sin(a) * 11, this.heightAt(Math.sin(a) * 11, 22 + Math.cos(a) * 3), 22 + Math.cos(a) * 3);
      f.rotation.y = a + Math.PI / 2;
      f.scale.setScalar(1.3);
      this.root.add(f);
    }
    const planks = assets.clonePart('swamp', 'Planks_01a');
    planks.position.set(-3, this.heightAt(-3, 18) + 0.05, 18);
    planks.scale.setScalar(1.6);
    this.root.add(planks);

    // ── 魔導標（エーテルの石柱＋点光源）
    const lampPos: [number, number][] = [[5, 8], [-9, -45], [9, -100], [-8, -150], [-7, -178], [7, -178]];
    for (const [x, z] of lampPos) {
      const l = assets.clonePart('monolith', 'monolith');
      l.scale.setScalar(0.75);
      const y = this.heightAt(x, z);
      l.position.set(x, y - 0.1, z);
      l.rotation.y = R() * 6.28;
      this.root.add(l);
      this.colliders.push({ x, z, r: 0.8, h: 3 });
      const pl = new THREE.PointLight(0x80c8ff, 12, 18, 1.7);
      pl.position.set(x, y + 2.2, z);
      sc.add(pl);
      this.lamps.push(pl);
    }
    this.batchStatic();

    // ── 出現配置（エリアの奥ほど強い組み合わせ）
    this.spawns = [
      { id: 'rat', x: 2, z: -18, group: 4 },
      { id: 'wolf', x: -6, z: -42, group: 2 },
      { id: 'plant', x: 12, z: -60 },
      { id: 'crab', x: -8, z: -70 },
      { id: 'spider', x: 4, z: -88, group: 2 },
      { id: 'bat', x: -6, z: -98, group: 3 },
      { id: 'wasp', x: 6, z: -120, group: 2 },
      { id: 'crab', x: -10, z: -132 },
      { id: 'plant', x: -12, z: -112 },
      { id: 'skeleton', x: 4, z: -146, group: 2 },
      { id: 'wolf', x: -4, z: -158, group: 2 },
      { id: 'rat', x: 6, z: -172, group: 3 },
    ];
  }

  /** 静的な背景メッシュを材質×区画ごとに結合してドローコールを減らす */
  private batchStatic() {
    this.root.updateMatrixWorld(true);
    const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; shadow: boolean }>();
    const remove: THREE.Object3D[] = [];
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material)) return;
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      // 属性をそろえる（頂点カラーを使う材質は color を維持）
      const vc = !!(m.material as THREE.MeshStandardMaterial).vertexColors;
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', ...(vc ? ['color'] : [])].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (vc && g.attributes.color && g.attributes.color.itemSize === 4) {
        const c4 = g.attributes.color;
        const c3 = new Float32Array(c4.count * 3);
        for (let i = 0; i < c4.count; i++) { c3[i * 3] = c4.getX(i); c3[i * 3 + 1] = c4.getY(i); c3[i * 3 + 2] = c4.getZ(i); }
        g.setAttribute('color', new THREE.BufferAttribute(c3, 3));
      }
      if (vc && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      if (!g.attributes.normal) g.computeVertexNormals();
      const geo = g.index ? g.toNonIndexed() : g;
      g.dispose();
      const isGround = this.groundMeshes.includes(m);
      const chunk = Math.floor(m.getWorldPosition(new THREE.Vector3()).z / 45);
      const key = (m.material as THREE.Material).uuid + ':' + chunk + ':' + (isGround ? 'g' : 'p');
      let e = groups.get(key);
      if (!e) groups.set(key, (e = { mat: m.material as THREE.Material, geos: [], shadow: !isGround }));
      e.geos.push(geo);
      remove.push(m);
    });
    for (const m of remove) m.parent?.remove(m);
    for (const e of groups.values()) {
      const merged = mergeGeometries(e.geos, false);
      for (const g of e.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, e.mat);
      mesh.castShadow = e.shadow;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
  }

  inZones(x: number, z: number, margin: number) {
    const p = new THREE.Vector2(x, z);
    for (const c of this.zones) if (distToSeg(p, c.a, c.b) < c.r + margin) return true;
    return false;
  }
  inArena(x: number, z: number, margin = 0) {
    return Math.hypot(x - this.arena.x, z - this.arena.z) < this.arena.r + margin;
  }

  private bakeHeights() {
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const minX = this.hmin.x;
    const minZ = this.hmin.y;
    this.hw = Math.ceil(140 / this.hres) + 1;
    this.hh = Math.ceil(300 / this.hres) + 1;
    this.heights = new Float32Array(this.hw * this.hh);
    const down = new THREE.Vector3(0, -1, 0);
    const o = new THREE.Vector3();
    for (let j = 0; j < this.hh; j++) {
      for (let i = 0; i < this.hw; i++) {
        const x = minX + i * this.hres;
        const z = minZ + j * this.hres;
        let h = -0.6;
        if (this.inZones(x, z, 14)) {
          o.set(x, 30, z);
          ray.set(o, down);
          const hits = ray.intersectObjects(this.groundMeshes, false);
          if (hits.length) h = hits[0].point.y;
        }
        this.heights[j * this.hw + i] = h;
      }
    }
  }

  heightAt(x: number, z: number) {
    const fx = (x - this.hmin.x) / this.hres;
    const fz = (z - this.hmin.y) / this.hres;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.hw - 1 || j >= this.hh - 1) return -0.6;
    const tx = fx - i;
    const tz = fz - j;
    const H = this.heights;
    const w = this.hw;
    const a = H[j * w + i] * (1 - tx) + H[j * w + i + 1] * tx;
    const b = H[(j + 1) * w + i] * (1 - tx) + H[(j + 1) * w + i + 1] * tx;
    return a * (1 - tz) + b * tz;
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()) {
    const e = 0.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  /** 歩行範囲＋障害物で位置を補正 */
  constrain(pos: THREE.Vector3, radius: number, allowArena = true) {
    const p = new THREE.Vector2(pos.x, pos.z);
    let inside = false;
    let best = Infinity;
    const bestPt = new THREE.Vector2();
    const zones = this.lockArena ? this.zones.slice(-1) : allowArena ? this.zones : this.zones.slice(0, this.zones.length - 1);
    for (const c of zones) {
      const q = closestOnSeg(p, c.a, c.b);
      const d = p.distanceTo(q);
      if (d <= c.r - radius) {
        inside = true;
        break;
      }
      const edge = d - (c.r - radius);
      if (edge < best) {
        best = edge;
        bestPt.copy(q).add(p.clone().sub(q).normalize().multiplyScalar(c.r - radius));
      }
    }
    if (!inside && best < Infinity) {
      pos.x = bestPt.x;
      pos.z = bestPt.y;
    }
    for (const c of this.colliders) {
      if (pos.y > this.heightAt(c.x, c.z) + c.h) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  /** 弾と障害物（円柱）との交差 */
  segmentHitsCollider(a: THREE.Vector3, b: THREE.Vector3): { t: number; normal: THREE.Vector3 } | null {
    let best: { t: number; normal: THREE.Vector3 } | null = null;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const A = dx * dx + dz * dz;
    if (A < 1e-8) return null;
    for (const c of this.colliders) {
      const fx = a.x - c.x;
      const fz = a.z - c.z;
      const B = 2 * (fx * dx + fz * dz);
      const C = fx * fx + fz * fz - c.r * c.r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t < 0 || t > 1) continue;
      const y = a.y + (b.y - a.y) * t;
      if (y > this.heightAt(c.x, c.z) + c.h) continue;
      if (!best || t < best.t) {
        const hx = a.x + dx * t - c.x;
        const hz = a.z + dz * t - c.z;
        best = { t, normal: new THREE.Vector3(hx, 0, hz).normalize() };
      }
    }
    return best;
  }

  update(playerPos: THREE.Vector3, time: number) {
    this.sun.position.set(playerPos.x + 30, 60, playerPos.z + 20);
    this.sun.target.position.copy(playerPos);
    for (let i = 0; i < this.lamps.length; i++) this.lamps[i].intensity = 11 + Math.sin(time * 7 + i * 3) * 1.2 + Math.sin(time * 13.1 + i) * 0.8;
    this.forgeGlow.intensity = 26 + Math.sin(time * 2) * 6;
  }
}

function closestOnSeg(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
  return a.clone().addScaledVector(ab, t);
}
function distToSeg(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  return p.distanceTo(closestOnSeg(p, a, b));
}
