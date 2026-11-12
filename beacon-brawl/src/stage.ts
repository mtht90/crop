import * as THREE from 'three';

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

interface Piece { kind: 'pillar' | 'block' | 'wall'; x: number; z: number; hx: number; hz: number; h: number }
// 片側だけ定義し、原点対称にコピーして公平なマップにする
const HALF_LAYOUT: Piece[] = [
  { kind: 'pillar', x: -4.5, z: -4.5, hx: 0.8, hz: 0.8, h: 4.2 },
  { kind: 'pillar', x: -4.5, z: 4.5, hx: 0.8, hz: 0.8, h: 4.2 },
  { kind: 'wall', x: -12, z: 1, hx: 0.5, hz: 2, h: 2.6 },
  { kind: 'wall', x: -13, z: -13, hx: 2, hz: 0.3, h: 1.2 },
  { kind: 'wall', x: -3, z: 14, hx: 2, hz: 0.3, h: 1.2 },
  { kind: 'block', x: -15, z: 9, hx: 0.8, hz: 0.8, h: 1.5 },
  { kind: 'block', x: -24, z: 11, hx: 1.3, hz: 1.3, h: 2.2 },
  { kind: 'block', x: -23.5, z: -13, hx: 0.8, hz: 0.8, h: 1.5 },
  { kind: 'wall', x: -2, z: -15, hx: 2, hz: 0.5, h: 2.6 },
  { kind: 'block', x: -9, z: -4, hx: 0.8, hz: 0.8, h: 1.5 },
];

const CYAN = 0x49e6ff;
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1b2242, metalness: 0.6, roughness: 0.42 });
const glowMat = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });

/** 床の模様（六角グリッド）をキャンバスに描く。base=地の色, emissive=光る線 */
function floorTextures() {
  const W = 1024, H = 640; // 64m x 40m → 16px/m
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const base = mk(), emi = mk();
  const b = base.getContext('2d')!, e = emi.getContext('2d')!;
  const grad = b.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#1d2f66'); grad.addColorStop(0.5, '#23274c'); grad.addColorStop(1, '#4d2140');
  b.fillStyle = grad; b.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const R = 32, dx = R * 1.5, dy = R * Math.sqrt(3);
  for (let i = -1; i * dx < W + R; i++) for (let j = -1; j * dy < H + dy; j++) {
    const cx = i * dx, cy = j * dy + (i & 1 ? dy / 2 : 0);
    const path = (ctx: CanvasRenderingContext2D, r: number) => {
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath();
    };
    path(b, R - 1.5); b.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.035})`; b.fill();
    b.strokeStyle = 'rgba(6,8,20,.9)'; b.lineWidth = 3; b.stroke();
    path(e, R - 1.5);
    const t = cx / W; // 左=青陣営, 右=赤陣営に向かって線の色が変わる
    e.strokeStyle = `rgba(${Math.round(60 + 195 * t)},${Math.round(150 - 80 * t)},${Math.round(255 - 150 * t)},${Math.random() < 0.08 ? 0.9 : 0.22})`;
    e.lineWidth = 1.5; e.stroke();
  }
  return [base, emi].map((c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
}

export class Stage {
  group = new THREE.Group();
  obstacles: Obstacle[] = [];
  private gw = HALF_X * 2; private gh = HALF_Z * 2;
  private blocked: Uint8Array;
  private spin: THREE.Object3D[] = [];

  constructor() {
    const g = this.group;
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow; g.add(m); return m;
    };

    // 床: 宙に浮かぶ光るプレート
    const [map, emissiveMap] = floorTextures();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, HALF_Z * 2),
      new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.9, metalness: 0.35, roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    g.add(floor);
    box(HALF_X * 2 + 3, 1.2, HALF_Z * 2 + 3, bodyMat, 0, -0.62, 0, false);
    box(HALF_X * 2 + 3.2, 0.12, HALF_Z * 2 + 3.2, glowMat(CYAN, 0.55), 0, -1.26, 0, false);

    // 外周: 低い壁の上を光のラインが走る。両端は陣営色
    const rail = (w: number, d: number, x: number, z: number, color: number) => {
      box(w, 1.1, d, bodyMat, x, 0.55, z);
      box(w + 0.02, 0.09, d + 0.02, glowMat(color), x, 1.14, z, false);
      box(d > w ? 0.14 : w, 2.4, d > w ? d : 0.14, glowMat(color, 0.07), x, 2.4, z, false);
    };
    rail(HALF_X * 2 + 1.8, 0.9, 0, -HALF_Z - 0.45, CYAN); rail(HALF_X * 2 + 1.8, 0.9, 0, HALF_Z + 0.45, CYAN);
    rail(0.9, HALF_Z * 2, -HALF_X - 0.45, 0, TEAM_COLORS[0]); rail(0.9, HALF_Z * 2, HALF_X + 0.45, 0, TEAM_COLORS[1]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = sx < 0 ? TEAM_COLORS[0] : TEAM_COLORS[1];
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 5, 6), bodyMat);
      m.position.set(sx * (HALF_X + 0.45), 2.5, sz * (HALF_Z + 0.45)); m.castShadow = true; g.add(m);
      const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), glowMat(c));
      top.position.set(m.position.x, 6.2, m.position.z); g.add(top); this.spin.push(top);
    }

    // 陣営のゲート（リスポーン地点の後ろ）
    SPAWNS.forEach((p, i) => {
      const sx = i === 0 ? -1 : 1;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.16, 8, 48), glowMat(TEAM_COLORS[i]));
      ring.position.set(sx * (HALF_X + 0.6), 3.6, p.z); ring.rotation.y = Math.PI / 2; g.add(ring);
      const film = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48), glowMat(TEAM_COLORS[i], 0.16));
      film.material.side = THREE.DoubleSide;
      film.position.copy(ring.position); film.rotation.y = Math.PI / 2; g.add(film);
    });

    // 障害物
    for (const p of HALF_LAYOUT) for (const s of [1, -1]) {
      const x = p.x * s, z = p.z * s;
      const color = x < -6 ? TEAM_COLORS[0] : x > 6 ? TEAM_COLORS[1] : CYAN;
      if (p.kind === 'pillar') {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(p.hx * 0.95, p.hx * 1.1, p.h, 6), bodyMat);
        m.position.set(x, p.h / 2, z); m.castShadow = m.receiveShadow = true; g.add(m);
        for (const y of [0.5, p.h - 0.5]) {
          const band = new THREE.Mesh(new THREE.CylinderGeometry(p.hx * 1.08, p.hx * 1.08, 0.1, 6), glowMat(color));
          band.position.set(x, y, z); g.add(band);
        }
        const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), glowMat(color));
        top.position.set(x, p.h + 0.9, z); g.add(top); this.spin.push(top);
      } else {
        const m = box(p.hx * 2, p.h, p.hz * 2, bodyMat, x, p.h / 2, z);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color, toneMapped: false }));
        edges.position.copy(m.position); g.add(edges);
        box(p.hx * 2 - 0.3, 0.06, p.hz * 2 - 0.3, glowMat(color, p.kind === 'block' ? 0.9 : 0.6), x, p.h + 0.03, z, false);
        if (p.kind === 'block') box(p.hx * 2 + 0.04, 0.12, p.hz * 2 + 0.04, glowMat(color), x, p.h * 0.5, z, false);
      }
      this.obstacles.push({ x, z, hx: p.hx, hz: p.hz });
    }

    // 遠景: 星と、ゆっくり回る巨大なリング
    const stars = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 60;
      stars.set([Math.cos(a) * r, -30 + Math.random() * 90, Math.sin(a) * r], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.5, sizeAttenuation: true, fog: false })));
    for (const [r, y, tilt, c] of [[58, 6, 0.25, CYAN], [74, 18, -0.18, 0x8a6bff]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 6, 120), glowMat(c, 0.5));
      (ring.material as THREE.MeshBasicMaterial).fog = false;
      ring.rotation.x = Math.PI / 2 + tilt; ring.position.y = y; g.add(ring); this.spin.push(ring);
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

  update(dt: number) { for (const o of this.spin) o.rotation[o.type === 'Mesh' && (o as THREE.Mesh).geometry.type === 'TorusGeometry' ? 'z' : 'y'] += dt * ((o as THREE.Mesh).geometry.type === 'TorusGeometry' ? 0.02 : 0.9); }

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
