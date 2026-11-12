import * as THREE from 'three';
import { instancedProp, prop, type PropName } from './assets';

export const HALF_X = 32;
export const HALF_Z = 20;
export const TEAM_COLORS = [0x3d8bff, 0xff4a4a];
export const SPAWNS = [new THREE.Vector3(-28, 0, 0), new THREE.Vector3(28, 0, 0)];
export const SPAWN_RADIUS = 4.5;
export const BEACON_RADIUS = 3.4;
export const BEACON_POS = [
  new THREE.Vector3(-19, 0, -8), new THREE.Vector3(-8, 0, 10), new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(8, 0, -10), new THREE.Vector3(19, 0, 8),
];

export interface Obstacle { x: number; z: number; hx: number; hz: number }

interface Piece { prop: PropName; x: number; z: number; rot?: number; hx: number; hz: number }
// 片側だけ定義し、原点対称にコピーして公平なマップにする
const HALF_LAYOUT: Piece[] = [
  { prop: 'pillar', x: -4.5, z: -4.5, hx: 0.8, hz: 0.8 },
  { prop: 'pillar', x: -4.5, z: 4.5, hx: 0.8, hz: 0.8 },
  { prop: 'wall', x: -12, z: 1, rot: 1, hx: 0.5, hz: 2 },
  { prop: 'barrier', x: -13, z: -13, hx: 2, hz: 0.3 },
  { prop: 'barrier', x: -3, z: 14, hx: 2, hz: 0.3 },
  { prop: 'box_large', x: -15, z: 9, hx: 0.8, hz: 0.8 },
  { prop: 'crates_stacked', x: -24, z: 11, hx: 1.3, hz: 1.3 },
  { prop: 'barrel_large', x: -23.5, z: -13, hx: 0.8, hz: 0.8 },
  { prop: 'wall', x: -2, z: -15, hx: 2, hz: 0.5 },
  { prop: 'box_large', x: -9, z: -4, hx: 0.8, hz: 0.8 },
];

export class Stage {
  group = new THREE.Group();
  obstacles: Obstacle[] = [];
  private gw = HALF_X * 2; private gh = HALF_Z * 2;
  private blocked: Uint8Array;

  constructor() {
    const M = (x: number, z: number, rot = 0, s = 1) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));

    // 床タイル
    const tiles: THREE.Matrix4[] = [];
    for (let x = -HALF_X - 2; x <= HALF_X + 2; x += 4) for (let z = -HALF_Z - 2; z <= HALF_Z + 2; z += 4) tiles.push(M(x, z));
    this.group.add(instancedProp('floor_tile_large', tiles));
    const under = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x0d0f1a }));
    under.rotation.x = -Math.PI / 2; under.position.y = -0.2;
    this.group.add(under);

    // 外周の壁
    const walls: THREE.Matrix4[] = [];
    for (let x = -HALF_X + 2; x < HALF_X; x += 4) { walls.push(M(x, -HALF_Z - 0.5)); walls.push(M(x, HALF_Z + 0.5)); }
    for (let z = -HALF_Z + 2; z < HALF_Z; z += 4) { walls.push(M(-HALF_X - 0.5, z, Math.PI / 2)); walls.push(M(HALF_X + 0.5, z, Math.PI / 2)); }
    this.group.add(instancedProp('wall', walls));
    const corners: THREE.Matrix4[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push(M(sx * (HALF_X + 0.5), sz * (HALF_Z + 0.5), 0, 1.25));
    this.group.add(instancedProp('pillar_decorated', corners));

    // 陣営の旗
    for (const [i, name] of (['banner_shield_blue', 'banner_shield_red'] as const).entries()) {
      const sx = i === 0 ? -1 : 1;
      for (const z of [-10, -2, 6, 14]) {
        const b = prop(name);
        b.position.set(sx * (HALF_X + 0.5), 0.2, z);
        b.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.group.add(b);
      }
    }

    // 障害物
    for (const p of HALF_LAYOUT) for (const s of [1, -1]) {
      const o = prop(p.prop);
      o.position.set(p.x * s, 0, p.z * s);
      o.rotation.y = (p.rot ? Math.PI / 2 : 0) + (s < 0 ? Math.PI : 0);
      this.group.add(o);
      this.obstacles.push({ x: p.x * s, z: p.z * s, hx: p.hx, hz: p.hz });
    }

    // リスポーン地点
    SPAWNS.forEach((p, i) => {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(SPAWN_RADIUS, 40),
        new THREE.MeshBasicMaterial({ color: TEAM_COLORS[i], transparent: true, opacity: 0.22, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, 0.07, p.z);
      this.group.add(disc);
    });

    // 経路探索用グリッド
    this.blocked = new Uint8Array(this.gw * this.gh);
    const pad = 0.75;
    for (let gz = 0; gz < this.gh; gz++) for (let gx = 0; gx < this.gw; gx++) {
      const x = gx - HALF_X + 0.5, z = gz - HALF_Z + 0.5;
      for (const o of this.obstacles) {
        if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) { this.blocked[gz * this.gw + gx] = 1; break; }
      }
    }
  }

  /** 位置を場内に収め、障害物から押し出す */
  resolve(p: THREE.Vector3, r: number) {
    for (const o of this.obstacles) {
      const cx = Math.max(o.x - o.hx, Math.min(p.x, o.x + o.hx));
      const cz = Math.max(o.z - o.hz, Math.min(p.z, o.z + o.hz));
      let dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-6) { // 中に入り込んだ: 近い面から出す
        const px = o.hx - Math.abs(p.x - o.x), pz = o.hz - Math.abs(p.z - o.z);
        if (px < pz) p.x = o.x + Math.sign(p.x - o.x || 1) * (o.hx + r);
        else p.z = o.z + Math.sign(p.z - o.z || 1) * (o.hz + r);
        continue;
      }
      const d = Math.sqrt(d2);
      dx /= d; dz /= d;
      p.x = cx + dx * r; p.z = cz + dz * r;
    }
    p.x = Math.max(-HALF_X + r, Math.min(HALF_X - r, p.x));
    p.z = Math.max(-HALF_Z + r, Math.min(HALF_Z - r, p.z));
  }

  /** 点(半径r)が障害物に触れているか */
  hitsObstacle(x: number, z: number, r = 0.2) {
    if (Math.abs(x) > HALF_X || Math.abs(z) > HALF_Z) return true;
    for (const o of this.obstacles) if (Math.abs(x - o.x) < o.hx + r && Math.abs(z - o.z) < o.hz + r) return true;
    return false;
  }

  /** 線分 a-b が障害物で遮られているか（射線チェック） */
  blockedLine(a: THREE.Vector3, b: THREE.Vector3) {
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const o of this.obstacles) {
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, d, c, h] of [[a.x, dx, o.x, o.hx], [a.z, dz, o.z, o.hz]]) {
        if (Math.abs(d) < 1e-6) { if (Math.abs(p - c) > h) { ok = false; break; } continue; }
        let u0 = (c - h - p) / d, u1 = (c + h - p) / d;
        if (u0 > u1) [u0, u1] = [u1, u0];
        t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  private cell(x: number, z: number) {
    const gx = Math.max(0, Math.min(this.gw - 1, Math.floor(x + HALF_X)));
    const gz = Math.max(0, Math.min(this.gh - 1, Math.floor(z + HALF_Z)));
    return gz * this.gw + gx;
  }

  /** A* で from→to の経由点を返す（グリッド1m） */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const W = this.gw, N = W * this.gh;
    const start = this.cell(from.x, from.z), goal = this.cell(to.x, to.z);
    if (start === goal) return [to.clone()];
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [start];
    const f = new Float32Array(N).fill(Infinity);
    const gxOf = (c: number) => c % W, gzOf = (c: number) => (c / W) | 0;
    const h = (c: number) => Math.hypot(gxOf(c) - gxOf(goal), gzOf(c) - gzOf(goal));
    g[start] = 0; f[start] = h(start);
    let found = false;
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = gxOf(cur), cz = gzOf(cur);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.gh) continue;
        const n = nz * W + nx;
        if (closed[n] || (this.blocked[n] && n !== goal)) continue;
        if (dx && dz && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue; // 角抜け禁止
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[n]) { g[n] = ng; f[n] = ng + h(n); came[n] = cur; open.push(n); }
      }
    }
    if (!found) return [to.clone()];
    const path: THREE.Vector3[] = [to.clone()];
    for (let c = came[goal]; c !== -1 && c !== start; c = came[c]) {
      path.push(new THREE.Vector3(gxOf(c) - HALF_X + 0.5, 0, gzOf(c) - HALF_Z + 0.5));
    }
    return path.reverse();
  }

  /** 2点間に障害物がないか（経路の平滑化用） */
  clear(a: THREE.Vector3, b: THREE.Vector3) {
    const d = a.distanceTo(b), n = Math.ceil(d / 0.5);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.blocked[this.cell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)]) return false;
    }
    return true;
  }
}
