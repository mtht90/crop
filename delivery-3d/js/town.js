// あおば町の生成：実在する地方都市の郊外（OpenStreetMap の地図データ）をもとに、
// 道路・家・アパート・店・川・電柱・信号・営業所を組み立てる。
// 地図データ © OpenStreetMap contributors（ODbL）。店や施設の名前は架空のものに置き換えている。
import * as THREE from 'three';
import { A, box, gableRoof, gableWall, Batch, Instancer, model, textTexture, JP_FONT } from './assets.js';
import { RESIDENTS, EXTRA_SURNAMES } from './data.js';

export const T = {
  data: null, colliders: [], circles: [], lots: {}, lotList: [], signals: [], depot: null,
  nodes: [], edges: [], lampMats: [], dynamic: [], bounds: null, buildings: [], areas: [], water: [],
};
export async function loadTownData() {
  const r = await fetch('assets/town/town.json');
  if (!r.ok) throw new Error('town.json: ' + r.status);
  T.data = await r.json();
}

// ---------------- 乱数（毎回同じ町になるように固定） ----------------
let rngState = 12345;
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };
const rpick = (a) => a[Math.floor(rnd() * a.length)];

// ---------------- 2次元の小道具（[x, z]） ----------------
const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  mul: (a, k) => [a[0] * k, a[1] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  len: (a) => Math.hypot(a[0], a[1]),
  norm: (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  left: (d) => [d[1], -d[0]], // 進行方向 d に対して左（運転席から見て左）
};
function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function centroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }
function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function closestOnSeg(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2));
  return { x: a[0] + dx * t, z: a[1] + dz * t, t };
}
// 最小面積の外接長方形（凸包の辺の向きを試す）
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function obb(pts) {
  const h = convexHull(pts);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const u = V.norm(V.sub(h[(i + 1) % h.length], h[i])), v = [-u[1], u[0]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of h) { const a = V.dot(q, u), b = V.dot(q, v); u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, u, v, u0, u1, v0, v1 };
  }
  let { u, v, u0, u1, v0, v1 } = best;
  if (u1 - u0 < v1 - v0) { [u, v] = [v, [-u[0], -u[1]]]; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { cx: u[0] * cu + v[0] * cv, cz: u[1] * cu + v[1] * cv, u, v, L: u1 - u0, W: v1 - v0, area: (u1 - u0) * (v1 - v0) };
}
// 外向きの法線（多角形の辺 i）
function edgeNormal(pts, i) {
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const d = V.norm(V.sub(b, a));
  let n = [d[1], -d[0]];
  const m = [(a[0] + b[0]) / 2 + n[0] * 0.05, (a[1] + b[1]) / 2 + n[1] * 0.05];
  if (pointInPoly(m[0], m[1], pts)) n = [-n[0], -n[1]];
  return n;
}

// ---------------- 行列 ----------------
function M(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().makeRotationY(ry);
  m.scale(new THREE.Vector3(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}
const rotOf = (d) => Math.atan2(d[0], d[1]);          // 板の表（+z）を d に向ける回転
function localToWorld(base, x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(base); }

// ---------------- 空間の索引（当たり判定と道路検索） ----------------
class Grid {
  constructor(cell) { this.c = cell; this.m = new Map(); }
  insert(item, x0, z0, x1, z1) {
    const c = this.c;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
      const k = i * 73856093 ^ j * 19349663;
      if (!this.m.has(k)) this.m.set(k, []);
      this.m.get(k).push(item);
    }
  }
  query(x, z, r) {
    const c = this.c, out = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
      const a = this.m.get(i * 73856093 ^ j * 19349663);
      if (a) for (const it of a) out.add(it);
    }
    return out;
  }
}
let CG = null, EG = null; // 当たり判定・道路の索引

// 当たり判定：多角形（建物の輪郭・塀）と円（電柱・木）
function addPoly(pts, h = 3) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
  const c = { pts, h, x0, z0, x1, z1 };
  T.colliders.push(c); CG.insert(c, x0, z0, x1, z1);
  return c;
}
// 向きのある細長い箱（塀など）：a から b へ、厚み t
function addWallCollider(a, b, t, h) {
  const d = V.norm(V.sub(b, a)), n = [d[1] * t / 2, -d[0] * t / 2];
  addPoly([V.add(a, n), V.add(b, n), V.sub(b, n), V.sub(a, n)], h);
}
function addBox(x0, x1, z0, z1, h = 3) { addPoly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h); }
function addLocalBox(base, x0, x1, z0, z1, h = 3) {
  const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => { const v = localToWorld(base, x, 0, z); return [v.x, v.z]; });
  addPoly(c, h);
}
function addCircle(x, z, r) { const c = { x, z, r, circle: true }; T.circles.push(c); CG.insert(c, x - r, z - r, x + r, z + r); }

export function queryColliders(x, z, r) {
  const out = [];
  for (const c of CG.query(x, z, r)) if (!c.circle && x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) out.push(c);
  return out;
}
// 円を当たり判定から押し出す。戻り値は押し出した量
export function resolveCircle(p, r, maxH = 99) {
  let hit = 0;
  for (const c of CG.query(p.x, p.z, r + 0.5)) {
    if (c.circle) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), R = r + c.r;
      if (d < R && d > 0.0001) { const k = (R - d) / d; p.x += dx * k; p.z += dz * k; hit = Math.max(hit, R - d); }
      continue;
    }
    if (c.h < 0.3 && maxH < 99) continue;
    if (p.x + r <= c.x0 || p.x - r >= c.x1 || p.z + r <= c.z0 || p.z - r >= c.z1) continue;
    const pts = c.pts;
    let best = Infinity, bx = 0, bz = 0;
    for (let i = 0; i < pts.length; i++) {
      const q = closestOnSeg(p.x, p.z, pts[i], pts[(i + 1) % pts.length]);
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < best) { best = d; bx = q.x; bz = q.z; }
    }
    if (pointInPoly(p.x, p.z, pts)) {
      const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz) || 1e-6;
      p.x = bx + dx / d * r; p.z = bz + dz / d * r; hit = Math.max(hit, best + r);
    } else if (best < r && best > 1e-6) {
      const dx = p.x - bx, dz = p.z - bz;
      p.x = bx + dx / best * r; p.z = bz + dz / best * r; hit = Math.max(hit, r - best);
    }
  }
  return hit;
}

// ---------------- 形の部品 ----------------
// 折れ線に沿った帯（上向き）。UV は世界座標
function ribbon(pts, w, y = 0, off = 0) {
  const L = offsetLine(pts, off - w / 2), R = offsetLine(pts, off + w / 2);
  const pos = [], uv = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = L[i], b = L[i + 1], c = R[i + 1], d = R[i];
    // 左右の向きに関係なく上向きになるよう、三角形の向きを決める
    const tri = (p, q, r) => {
      const cr = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const list = cr < 0 ? [p, q, r] : [p, r, q];
      for (const v of list) { pos.push(v[0], y, v[1]); uv.push(v[0], -v[1]); }
    };
    tri(a, b, c); tri(a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// 折れ線を横にずらす（左が正）
function offsetLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const d0 = i > 0 ? V.norm(V.sub(p, pts[i - 1])) : null, d1 = i < pts.length - 1 ? V.norm(V.sub(pts[i + 1], p)) : null;
    let n;
    if (d0 && d1) {
      const l0 = V.left(d0), l1 = V.left(d1);
      n = V.norm(V.add(l0, l1));
      const k = Math.max(0.5, V.dot(n, l1));
      n = V.mul(n, 1 / k);
    } else n = V.left(d0 || d1);
    out.push([p[0] + n[0] * off, p[1] + n[1] * off]);
  }
  return out;
}
// 多角形の面（上向き）
function polyFill(pts, y) {
  const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
// 建物の外壁（輪郭に沿って立ち上げる）。UV はメートル
function wallsGeo(pts, y0, y1, out = 0) {
  const pos = [], uv = [], nor = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a0 = pts[i], b0 = pts[(i + 1) % pts.length];
    const n = edgeNormal(pts, i);
    const a = [a0[0] + n[0] * out, a0[1] + n[1] * out], b = [b0[0] + n[0] * out, b0[1] + n[1] * out];
    const L = V.len(V.sub(b, a));
    const quad = [[a, y0, s], [b, y0, s + L], [b, y1, s + L], [a, y1, s]];
    // 外向きになる三角形の向き
    const e1 = [b[0] - a[0], 0, b[1] - a[1]], e2 = [0, y1 - y0, 0];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * n[0] + cz * n[1] < 0;
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const k of order) { const [p, y, u] = quad[k]; pos.push(p[0], y, p[1]); uv.push(u, y); nor.push(n[0], 0, n[1]); }
    s += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
// 寄棟屋根：長さ L（x方向）× 幅 W、高さ h、軒の出 o
function hipRoof(L, W, h, o = 0.5) {
  const X = L / 2 + o, Z = W / 2 + o, r = Math.max(0, (L - W) / 2);
  const y0 = -(o * h) / (W / 2);
  const pos = [], uv = [];
  const tri = (a, b, c) => { pos.push(...a, ...b, ...c); uv.push(a[0], a[2], b[0], b[2], c[0], c[2]); };
  const A0 = [-X, y0, Z], B0 = [X, y0, Z], C0 = [X, y0, -Z], D0 = [-X, y0, -Z], R0 = [-r, h, 0], R1 = [r, h, 0];
  // 南（+z）と北（-z）の台形、東西の三角形（上から見て反時計回り＝上向き）
  tri(A0, B0, R1); tri(A0, R1, R0);
  tri(C0, D0, R0); tri(C0, R0, R1);
  tri(B0, C0, R1); tri(D0, A0, R0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------- テクスチャ ----------------
// 窓・玄関ドアの絵（1枚の大きな画像に並べる）。夜は別の画像で明かりを足す
const WIN = { cols: 4, rows: 2 };
function windowSheet(lit) {
  const S = 256, W = S * WIN.cols, H = S * WIN.rows;
  return textTexture(W, H, (c) => {
    c.fillStyle = lit ? '#000' : '#888'; c.fillRect(0, 0, W, H);
    const cell = (i, draw) => { c.save(); c.translate((i % WIN.cols) * S, Math.floor(i / WIN.cols) * S); draw(); c.restore(); };
    const frame = (x, y, w, h, col = '#b9bdc0') => { if (lit) return; c.fillStyle = col; c.fillRect(x, y, w, h); };
    const glass = (x, y, w, h, base, curtain) => {
      if (lit) { c.fillStyle = curtain ? '#c99a5a' : '#e8c48a'; c.fillRect(x, y, w, h); return; }
      const g = c.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, base[0]); g.addColorStop(1, base[1]); c.fillStyle = g; c.fillRect(x, y, w, h);
      if (curtain) { c.fillStyle = curtain; c.globalAlpha = 0.85; c.fillRect(x + 2, y + 2, w * 0.38, h - 4); c.fillRect(x + w * 0.62 - 2, y + 2, w * 0.38, h - 4); c.globalAlpha = 1; }
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.moveTo(x + w * 0.1, y); c.lineTo(x + w * 0.35, y); c.lineTo(x + w * 0.05, y + h); c.lineTo(x, y + h); c.fill();
    };
    const sky = ['#9fb4c4', '#4f6372'], dark = ['#3e4a52', '#1e262c'];
    // 0: 引き違い窓（レースのカーテン）
    cell(0, () => { frame(0, 0, S, S); glass(12, 12, 112, 232, sky, '#e9e6dc'); glass(132, 12, 112, 232, sky, '#e9e6dc'); frame(124, 0, 8, S, '#a9adb0'); });
    // 1: 引き違い窓（色つきカーテン）
    cell(1, () => { frame(0, 0, S, S); glass(12, 12, 112, 232, dark, '#7d8f74'); glass(132, 12, 112, 232, dark, '#7d8f74'); frame(124, 0, 8, S, '#a9adb0'); });
    // 2: すりガラス（浴室・トイレ）
    cell(2, () => { frame(0, 0, S, S); if (lit) { c.fillStyle = '#d8c7a0'; c.fillRect(14, 14, 228, 228); } else { c.fillStyle = '#d9dde0'; c.fillRect(14, 14, 228, 228); c.fillStyle = 'rgba(0,0,0,0.06)'; for (let k = 0; k < 228; k += 6) c.fillRect(14, 14 + k, 228, 2); } });
    // 3: 雨戸を閉めた窓
    cell(3, () => { if (lit) return; c.fillStyle = '#c9c4b8'; c.fillRect(0, 0, S, S); c.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 0; k < S; k += 16) c.fillRect(0, k, S, 3); });
    // 4: 掃き出し窓（シャッターボックスつき）
    cell(4, () => { frame(0, 0, S, S); if (!lit) { c.fillStyle = '#8f9396'; c.fillRect(0, 0, S, 34); } glass(12, 40, 112, 210, sky, '#efe9da'); glass(132, 40, 112, 210, sky, '#efe9da'); frame(124, 34, 8, S, '#a9adb0'); });
    // 5: 格子つきの小窓
    cell(5, () => { frame(0, 0, S, S); glass(14, 14, 228, 228, sky, null); if (!lit) { c.fillStyle = '#c8ccce'; for (let k = 30; k < S; k += 30) c.fillRect(k, 0, 6, S); } });
    // 6: 玄関ドア（木目調・袖のガラス）
    cell(6, () => {
      if (lit) { c.fillStyle = '#000'; c.fillRect(0, 0, S, S); c.fillStyle = '#e8c48a'; c.fillRect(196, 20, 40, 230); return; }
      c.fillStyle = '#4a3a2c'; c.fillRect(0, 0, S, S);
      c.fillStyle = '#6b5440'; c.fillRect(20, 10, 160, 246);
      c.strokeStyle = 'rgba(0,0,0,0.25)'; for (let k = 20; k < 180; k += 10) { c.beginPath(); c.moveTo(k, 10); c.lineTo(k, 256); c.stroke(); }
      c.fillStyle = '#c0c4c6'; c.fillRect(150, 120, 14, 50);
      c.fillStyle = '#9fb0b9'; c.fillRect(196, 20, 40, 230);
    });
    // 7: 店のガラス（陳列が見える）
    cell(7, () => {
      if (lit) { c.fillStyle = '#f2e6c8'; c.fillRect(0, 0, S, S); return; }
      glass(0, 0, S, S, ['#c9d6dc', '#7f939d'], null);
      const cols = ['#d35400', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#c0392b'];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) { c.fillStyle = cols[(r + k) % 6]; c.globalAlpha = 0.55; c.fillRect(10 + k * 30, 90 + r * 50, 22, 30); }
      c.globalAlpha = 1; c.fillStyle = '#8e9599'; c.fillRect(0, 0, S, 8); c.fillRect(0, 248, S, 8);
    });
  });
}
function winUV(g, i) {
  const u0 = (i % WIN.cols) / WIN.cols, v1 = 1 - Math.floor(i / WIN.cols) / WIN.rows;
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / WIN.cols, v1 - (1 - uv.getY(k)) / WIN.rows);
  return g;
}

// 表札・住所の小さな板（大きな画像に詰める）
class Plates {
  constructor() { this.pages = []; this.cw = 128; this.ch = 64; this.size = 2048; }
  page() {
    const per = (this.size / this.cw) * (this.size / this.ch);
    let p = this.pages[this.pages.length - 1];
    if (!p || p.n >= per) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = this.size;
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      p = { canvas, ctx: canvas.getContext('2d'), tex, n: 0, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }) };
      this.pages.push(p);
    }
    return p;
  }
  plane(w, h, draw) {
    const p = this.page(), per = this.size / this.cw;
    const col = p.n % per, row = Math.floor(p.n / per); p.n++;
    const x = col * this.cw, y = row * this.ch;
    p.ctx.save(); p.ctx.translate(x, y); p.ctx.beginPath(); p.ctx.rect(0, 0, this.cw, this.ch); p.ctx.clip();
    draw(p.ctx, this.cw, this.ch); p.ctx.restore();
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    const u0 = x / this.size, u1 = (x + this.cw) / this.size, v1 = 1 - y / this.size, v0 = 1 - (y + this.ch) / this.size;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    p.tex.needsUpdate = true;
    return { g, m: p.mat };
  }
}
const nameDraw = (text) => (c, w, h) => {
  c.fillStyle = '#ece6d8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8c8270'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
  c.fillStyle = '#1f1f1f'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${text.length > 3 ? 26 : 34}px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 1);
};
const addrDraw = (text) => (c, w, h) => {
  c.fillStyle = '#20508a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `bold 20px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 1);
};
function signMaterial(text, bg, fg = '#fff', w = 1024, h = 160, sub) {
  const mat = new THREE.MeshStandardMaterial({
    map: textTexture(w, h, (c) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.fillStyle = fg; c.font = `bold ${Math.round(h * 0.55)}px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + (sub ? -h * 0.1 : 2));
      if (sub) { c.font = `${Math.round(h * 0.18)}px ${JP_FONT}`; c.fillText(sub, w / 2, h * 0.84); }
    }), roughness: 0.45, emissive: 0xffffff, emissiveIntensity: 0,
  });
  mat.emissiveMap = mat.map;
  T.lampMats.push({ mat, on: 0.55 });
  return mat;
}

// =========================================================
// 道路網
// =========================================================
const RANK = { primary: 4, secondary: 4, trunk: 4, tertiary: 3, unclassified: 2, residential: 1, living_street: 1, service: 0 };
function buildGraph() {
  const d = T.data;
  T.nodes = d.nodes.map(([x, z, sig], id) => ({ id, x, z, sig: !!sig, ends: [], R: 3 }));
  T.edges = d.edges.map((e, id) => {
    const pts = e.pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.len(V.sub(pts[i], pts[i - 1])));
    const rank = RANK[e.cls] ?? 1;
    const ms = parseInt(e.ms, 10);
    const edge = { id, a: e.a, b: e.b, pts, cum, len: cum[cum.length - 1], cls: e.cls, rank, w: e.w, ow: e.ow, name: e.name, br: e.br,
      limit: isFinite(ms) ? ms : rank >= 3 ? 40 : 30, sigPts: e.sig || [] };
    return edge;
  });
  for (const e of T.edges) {
    T.nodes[e.a].ends.push({ e, end: 'a' }); T.nodes[e.b].ends.push({ e, end: 'b' });
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of e.pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    const pad = e.w / 2 + 4;
    EG.insert(e, x0 - pad, z0 - pad, x1 + pad, z1 + pad);
  }
  // 交差点の大きさ（ここまでは白線や塀を引かない）
  for (const n of T.nodes) {
    const ws = n.ends.map(x => x.e.w);
    n.R = n.ends.length >= 3 ? Math.max(...ws) / 2 + 1.2 : n.ends.length === 2 ? 0 : 0.5;
    n.maxRank = Math.max(...n.ends.map(x => x.e.rank));
  }
}
// 辺の上の点（弧長 s）と向き
function atS(e, s) {
  s = Math.max(0, Math.min(e.len, s));
  let i = 1; while (i < e.cum.length - 1 && e.cum[i] < s) i++;
  const a = e.pts[i - 1], b = e.pts[i], L = e.cum[i] - e.cum[i - 1] || 1e-6, t = (s - e.cum[i - 1]) / L;
  const d = V.norm(V.sub(b, a));
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d };
}
function subLine(e, s0, s1) {
  if (s1 - s0 < 0.05) return null;
  const out = [atS(e, s0).p];
  for (let i = 1; i < e.pts.length - 1; i++) if (e.cum[i] > s0 && e.cum[i] < s1) out.push(e.pts[i]);
  out.push(atS(e, s1).p);
  return out;
}
// 交差点のぶんだけ両端を空けた範囲
function clearRange(e, padA = 0, padB = 0) {
  const ra = T.nodes[e.a].R + padA, rb = T.nodes[e.b].R + padB;
  return [ra, e.len - rb];
}
// 一番近い道路（辺・弧長・距離・どちら側か）
export function nearestEdge(x, z, filter) {
  let best = null;
  for (const e of EG.query(x, z, 30)) {
    if (filter && !filter(e)) continue;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const q = closestOnSeg(x, z, e.pts[i], e.pts[i + 1]);
      const d = Math.hypot(x - q.x, z - q.z);
      if (!best || d < best.d) {
        const s = e.cum[i] + (e.cum[i + 1] - e.cum[i]) * q.t;
        const dir = V.norm(V.sub(e.pts[i + 1], e.pts[i]));
        const side = V.dot(V.sub([x, z], [q.x, q.z]), V.left(dir)) >= 0 ? 1 : -1;
        best = { e, s, d, x: q.x, z: q.z, dir, side };
      }
    }
  }
  if (!best) {
    // 索引の外（遠い）なら全探索
    for (const e of T.edges) for (let i = 0; i < e.pts.length - 1; i++) {
      const q = closestOnSeg(x, z, e.pts[i], e.pts[i + 1]);
      const d = Math.hypot(x - q.x, z - q.z);
      if ((!filter || filter(e)) && (!best || d < best.d)) { const dir = V.norm(V.sub(e.pts[i + 1], e.pts[i])); best = { e, s: e.cum[i] + (e.cum[i + 1] - e.cum[i]) * q.t, d, x: q.x, z: q.z, dir, side: V.dot(V.sub([x, z], [q.x, q.z]), V.left(dir)) >= 0 ? 1 : -1 }; }
    }
  }
  return best;
}
export function nearestOnRoads(x, z) { const n = nearestEdge(x, z); return n ? { x: n.x, z: n.z, d: n.d, e: n.e } : null; }

// 道路網上の経路（一方通行を守る）
export function routePath(from, to) {
  const A0 = nearestEdge(from.x, from.z), B0 = nearestEdge(to.x, to.z);
  if (!A0 || !B0) return { points: [], length: Infinity };
  const start = { id: 'S' }, goal = { id: 'G' };
  const dist = new Map(), prev = new Map(), via = new Map();
  const open = [];
  const relax = (u, v, d, line) => { const nd = (dist.get(u) ?? 0) + d; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); via.set(v, line); open.push(v); } };
  dist.set(start, 0);
  const ea = A0.e, eb = B0.e;
  // 出発点から辺の両端へ
  if (!ea.ow) relax(start, T.nodes[ea.a], A0.s, () => subLine(ea, 0, A0.s)?.slice().reverse());
  relax(start, T.nodes[ea.b], ea.len - A0.s, () => subLine(ea, A0.s, ea.len));
  if (ea === eb && (!ea.ow || B0.s >= A0.s)) relax(start, goal, Math.abs(B0.s - A0.s), () => B0.s >= A0.s ? subLine(ea, A0.s, B0.s) : subLine(ea, B0.s, A0.s)?.slice().reverse());
  const goalEdges = new Map([[eb.a, { d: B0.s, line: () => subLine(eb, 0, B0.s) }], [eb.b, { d: eb.len - B0.s, line: () => subLine(eb, B0.s, eb.len)?.slice().reverse() }]]);
  const seen = new Set();
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
    const u = open.splice(bi, 1)[0];
    if (u === goal) break;
    if (seen.has(u)) continue; seen.add(u);
    if (u === start) continue;
    if (goalEdges.has(u.id) && !(eb.ow && u.id === eb.b)) relax(u, goal, goalEdges.get(u.id).d, goalEdges.get(u.id).line);
    for (const { e, end } of u.ends) {
      if (e.ow && end === 'b') continue; // 一方通行の逆走はしない
      const v = T.nodes[end === 'a' ? e.b : e.a];
      relax(u, v, e.len + (e.rank <= 1 ? e.len * 0.15 : 0), end === 'a' ? () => e.pts : () => e.pts.slice().reverse());
    }
  }
  if (!dist.has(goal)) return { points: [], length: Infinity };
  const chain = [];
  let n = goal;
  while (n !== start) { chain.push(via.get(n)); n = prev.get(n); }
  const pts = [{ x: A0.x, z: A0.z }];
  for (const f of chain.reverse()) { const line = f && f(); if (line) for (const p of line) pts.push({ x: p[0], z: p[1] }); }
  pts.push({ x: B0.x, z: B0.z });
  // 実際の距離（表示用は辺の長さの合計）
  let length = 0; for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { points: pts, length };
}

export function speedLimitAt(x, z) {
  const n = nearestEdge(x, z);
  if (n && n.d < n.e.w / 2 + 2) return n.e.limit;
  return 30;
}

// =========================================================
// 組み立て
// =========================================================
let BB = null, I = null, PL = null, MATS = null;
export function buildTown(scene) {
  rngState = 12345;
  T.colliders = []; T.circles = []; T.lots = {}; T.lotList = []; T.signals = []; T.lampMats = []; T.dynamic = []; T.buildingsMap = [];
  CG = new Grid(16); EG = new Grid(24);
  T.bounds = T.data.bounds;
  const root = new THREE.Group(); scene.add(root);
  BB = new Batch(140); I = new Instancer(); PL = new Plates();
  const m = A.mats;
  MATS = makeTownMats(m);
  buildGraph();
  markSignals();
  buildGround(root);
  buildAreas(root);
  buildRoads(root);
  buildWater(root);
  const depot = placeDepot();
  const plan = planBuildings(depot);
  buildDepot(root, depot);
  buildBuildings(root, plan);
  buildLots(root, plan);
  buildPoles(root);
  buildSignals(root);
  buildBoundary(root);
  BB.build(root);
  I.build(root);
  for (const d of T.dynamic) root.add(d);
  return root;
}

function makeTownMats(m) {
  const roofs = [m.roof, m.roof, m.roofBrown, m.roofBlue];
  for (const r of roofs) r.side = THREE.DoubleSide;
  const winMat = new THREE.MeshStandardMaterial({ map: windowSheet(false), roughness: 0.25, metalness: 0.15, envMapIntensity: 1.3 });
  const winLit = new THREE.MeshStandardMaterial({ map: winMat.map, roughness: 0.25, metalness: 0.15, emissive: 0xffffff, emissiveMap: windowSheet(true), emissiveIntensity: 0 });
  T.lampMats.push({ mat: winLit, on: 0.9 });
  const grass = m.grass.clone(); grass.color.multiplyScalar(0.92);
  const yard = m.gravel.clone(); yard.color.multiplyScalar(1.08);
  const field = m.soil.clone();
  const lot = m.soil.clone(); lot.color.lerp(new THREE.Color(0xb59a7a), 0.35);
  // 平らな面の重なり順（地面 < 庭 < 草地・畑 < 駐車場 < 道路 < 舗装 < 白線）
  const layer = (mat, f, u) => { mat.polygonOffset = true; mat.polygonOffsetFactor = f; mat.polygonOffsetUnits = u; return mat; };
  layer(yard, 0, -1); layer(lot, 0, -1); layer(grass, -0.3, -2); layer(field, -0.3, -2);
  const pave = layer(m.asphalt.clone(), -0.5, -3);
  const roadMat = layer(m.asphalt.clone(), -1, -5);
  const concretePad = layer(m.concrete.clone(), -1.2, -7);
  m.lineWhite.polygonOffsetFactor = -2; m.lineWhite.polygonOffsetUnits = -9;
  layer(m.curb, -1.5, -8);
  const fence = new THREE.MeshStandardMaterial({ color: 0x5f7a5a, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const fenceAlu = new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.45, metalness: 0.6 });
  // アルミの縦格子フェンス（すき間が抜けて見える）
  const slatTex = textTexture(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#ffffff'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 9, h); c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5); });
  slatTex.wrapS = slatTex.wrapT = THREE.RepeatWrapping;
  const slats = new THREE.MeshStandardMaterial({ color: 0x6f6c66, map: slatTex, alphaTest: 0.5, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  const water = new THREE.MeshPhysicalMaterial({ color: 0x3d4e4a, roughness: 0.05, metalness: 0, envMapIntensity: 1.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const flatRoof = new THREE.MeshStandardMaterial({ color: 0x7d7f80, roughness: 0.9, map: m.concrete.map, normalMap: m.concrete.normalMap });
  const vermilion = new THREE.MeshStandardMaterial({ color: 0xb8402c, roughness: 0.6 });
  return { m, pave, concretePad, roofs, winMat, winLit, grass, yard, field, lot, roadMat, fence, fenceAlu, slats, water, flatRoof, vermilion,
    walls: [m.plaster, m.plasterCream, m.beige, m.siding, m.stucco, m.plasterGray, m.sidingDark, m.siding, m.plaster] };
}

// ---------------- 地面・土地利用 ----------------
function buildGround(root) {
  const [x0, z0, x1, z1] = T.bounds;
  const g = new THREE.PlaneGeometry(2400, 2400); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
  const gm = MATS.m.grass.clone(); gm.polygonOffset = true; gm.polygonOffsetFactor = 2; gm.polygonOffsetUnits = 4;
  const ground = new THREE.Mesh(g, gm); ground.position.y = -0.04; ground.receiveShadow = true; root.add(ground);
  // 範囲の外側は畑と林にして、地図の端を目立たせない
  for (let k = 0; k < 160; k++) {
    const side = k % 4, t = rnd();
    const x = side === 0 ? x0 - 30 - rnd() * 60 : side === 1 ? x1 + 30 + rnd() * 60 : x0 + (x1 - x0) * t;
    const z = side === 2 ? z0 - 30 - rnd() * 60 : side === 3 ? z1 + 30 + rnd() * 60 : z0 + (z1 - z0) * t;
    tree(new THREE.Vector3(x, 0, z), 1.6 + rnd() * 1.6, false);
  }
}
function buildAreas(root) {
  const Y = { residential: 0.004, construction: 0.007, grass: 0.009, meadow: 0.009, heath: 0.009, farmland: 0.011, park: 0.012, retail: 0.013, commercial: 0.013, parking: 0.014, school: 0.012, water: 0.016 };
  const mats = { residential: MATS.yard, construction: MATS.lot, grass: MATS.grass, meadow: MATS.grass, heath: MATS.grass, farmland: MATS.field, park: MATS.grass, retail: MATS.pave, commercial: MATS.pave, parking: MATS.pave, school: MATS.lot, water: MATS.water };
  for (const a of T.data.areas) {
    const mat = mats[a.k]; if (!mat || a.pts.length < 3) continue;
    BB.add(polyFill(a.pts, Y[a.k] ?? 0.005), mat, new THREE.Matrix4(), { noShadow: true });
    T.areas.push(a);
    if (a.k === 'farmland') farmRows(a.pts);
    if (a.k === 'park' || a.k === 'grass' || a.k === 'heath') {
      const o = obb(a.pts), n = Math.min(10, Math.floor(o.area / 250));
      for (let i = 0; i < n; i++) {
        const x = o.cx + o.u[0] * (rnd() - 0.5) * o.L + o.v[0] * (rnd() - 0.5) * o.W, z = o.cz + o.u[1] * (rnd() - 0.5) * o.L + o.v[1] * (rnd() - 0.5) * o.W;
        if (!pointInPoly(x, z, a.pts) || nearRoad(x, z, 3)) continue;
        if (a.k === 'park' && rnd() < 0.6) tree(new THREE.Vector3(x, 0, z), 0.9 + rnd() * 0.6);
        else bush(x, z, 1.4);
      }
    }
    if (a.k === 'parking') parkingLines(a.pts);
  }
}
function nearRoad(x, z, pad) { const n = nearestEdge(x, z); return n && n.d < n.e.w / 2 + pad; }
// 多角形の中を通る平行線の区間
function clipLine(pts, a, b) {
  const ts = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const r = V.sub(b, a), s = V.sub(q, p), den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - a[0]) * s[1] - (p[1] - a[1]) * s[0]) / den, u = ((p[0] - a[0]) * r[1] - (p[1] - a[1]) * r[0]) / den;
    if (u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([V.add(a, V.mul(V.sub(b, a), ts[i])), V.add(a, V.mul(V.sub(b, a), ts[i + 1]))]);
  return out;
}
function farmRows(pts) {
  const o = obb(pts);
  const ridge = MATS.field;
  for (let k = -o.W / 2 + 0.8; k < o.W / 2 - 0.5; k += 1.3) {
    const c = [o.cx + o.v[0] * k, o.cz + o.v[1] * k];
    const a = V.sub(c, V.mul(o.u, o.L)), b = V.add(c, V.mul(o.u, o.L));
    for (const [p, q] of clipLine(pts, a, b)) {
      const L = V.len(V.sub(q, p)) - 1.2; if (L < 1) continue;
      const mid = V.mul(V.add(p, q), 0.5);
      BB.add(box(0.55, 0.2, L), ridge, M(mid[0], 0.08, mid[1], rotOf(o.u)));
    }
  }
}
function parkingLines(pts) {
  const o = obb(pts);
  if (o.W < 10) return;
  const rowZ = -o.W / 2 + 3;
  for (let k = -o.L / 2 + 1.5; k < o.L / 2 - 1.5; k += 2.6) {
    const c = [o.cx + o.u[0] * k + o.v[0] * rowZ, o.cz + o.u[1] * k + o.v[1] * rowZ];
    BB.add(box(0.12, 0.01, 5), MATS.m.lineWhite, M(c[0], 0.03, c[1], rotOf(o.v)), { noShadow: true });
    if (rnd() < 0.15 && k < o.L / 2 - 3) {
      const cc = [c[0] + o.u[0] * 1.3, c[1] + o.u[1] * 1.3];
      I.add('covered_car', M(cc[0], 0, cc[1], rotOf(o.v) + (rnd() < 0.5 ? 0 : Math.PI)));
      addPoly([[-0.9, -2.2], [0.9, -2.2], [0.9, 2.2], [-0.9, 2.2]].map(([x, z]) => [cc[0] + o.u[0] * x + o.v[0] * z, cc[1] + o.u[1] * x + o.v[1] * z]), 1.6);
    }
  }
}

// ---------------- 道路・白線・側溝・歩道 ----------------
let stopMat = null;
function stopText(p, d) {
  if (!stopMat) {
    stopMat = new THREE.MeshStandardMaterial({
      map: textTexture(256, 512, (c, w, h) => {
        c.fillStyle = '#fff'; c.font = `bold 200px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.save(); c.scale(1, 1.2); c.fillText('止', w / 2, h * 0.27 / 1.2 + 20); c.fillText('まれ', w / 2, h * 0.75 / 1.2 + 10); c.restore();
      }), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -10, depthWrite: false,
    });
    stopMat.map.anisotropy = 8;
  }
  const g = new THREE.PlaneGeometry(1.3, 2.6); g.rotateX(-Math.PI / 2);
  BB.add(g, stopMat, M(p[0], 0.045, p[1], Math.atan2(-d[0], -d[1])), { noShadow: true });
}
const signMats = {};
function roadSign(kind, p, d, size = 0.6) {
  if (!signMats[kind]) {
    signMats[kind] = new THREE.MeshStandardMaterial({
      map: textTexture(256, 256, (c) => {
        if (kind === 'stop') {
          c.fillStyle = '#c8281e'; c.beginPath(); c.moveTo(8, 20); c.lineTo(248, 20); c.lineTo(128, 236); c.closePath(); c.fill();
          c.strokeStyle = '#fff'; c.lineWidth = 8; c.stroke();
          c.fillStyle = '#fff'; c.font = `bold 58px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('止まれ', 128, 84);
        } else if (kind === 'bus') {
          c.fillStyle = '#1d4fa0'; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill();
          c.fillStyle = '#fff'; c.font = `bold 64px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('バス', 128, 118);
          c.font = `bold 30px ${JP_FONT}`; c.fillText('停留所', 128, 172);
        } else {
          c.fillStyle = '#fff'; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill();
          c.strokeStyle = '#c8281e'; c.lineWidth = 30; c.beginPath(); c.arc(128, 128, 104, 0, 7); c.stroke();
          c.fillStyle = '#1d4fa0'; c.font = `bold 120px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(kind, 128, 136);
        }
      }), transparent: true, roughness: 0.4, alphaTest: 0.1,
    });
  }
  // d は標識を見る車の進行方向。標識の表は車のほうへ向ける
  BB.add(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), MATS.m.frame, M(p[0], 1.3, p[1]));
  const g = new THREE.PlaneGeometry(size, size);
  BB.add(g, signMats[kind], M(p[0] - d[0] * 0.03, 2.35, p[1] - d[1] * 0.03, Math.atan2(-d[0], -d[1])), { noShadow: true });
  addCircle(p[0], p[1], 0.1);
}
function lineAlong(e, s0, s1, off, w, mat, dash = 0) {
  if (s1 - s0 < 0.5) return;
  if (!dash) { const l = subLine(e, s0, s1); if (l) BB.add(ribbon(l, w, 0.034, off), mat, new THREE.Matrix4(), { noShadow: true }); return; }
  for (let s = s0; s < s1; s += dash * 2) { const l = subLine(e, s, Math.min(s1, s + dash)); if (l) BB.add(ribbon(l, w, 0.034, off), mat, new THREE.Matrix4(), { noShadow: true }); }
}
function hasSidewalk(e) { return e.rank >= 3; }
function frontOffset(e) { return e.w / 2 + (hasSidewalk(e) ? 2.3 : 0.6); }

function buildRoads(root) {
  const m = MATS.m;
  for (const e of T.edges) {
    BB.add(ribbon(e.pts, e.w, 0.02), MATS.roadMat, new THREE.Matrix4(), { noShadow: true });
    const [ra, rb] = clearRange(e, 0.6, 0.6);
    // 白線
    if (e.rank >= 3) {
      lineAlong(e, ra, rb, e.w / 2 - 0.35, 0.15, m.lineWhite);
      lineAlong(e, ra, rb, -(e.w / 2 - 0.35), 0.15, m.lineWhite);
      if (!e.ow) lineAlong(e, ra + 2, rb - 2, 0, 0.15, m.lineWhite, 5);
    } else if (e.rank === 2 && e.w >= 5) {
      lineAlong(e, ra, rb, e.w / 2 - 0.3, 0.13, m.lineWhite);
      lineAlong(e, ra, rb, -(e.w / 2 - 0.3), 0.13, m.lineWhite);
    }
    // 側溝（生活道路）と歩道（大きな道）
    if (e.rank <= 2) {
      for (const sd of [1, -1]) lineAlong(e, ra, rb, sd * (e.w / 2 + 0.2), 0.42, m.curb);
    } else {
      for (const sd of [1, -1]) {
        const l = subLine(e, ra + 0.5, rb - 0.5); if (!l) continue;
        const off = sd * (e.w / 2 + 1.15);
        BB.add(ribbon(l, 2.3, 0.15, off), m.sidewalk, new THREE.Matrix4(), { noShadow: true });
        // 縁石の立ち上がり
        const edge = offsetLine(l, sd * (e.w / 2 + 0.02));
        for (let i = 0; i < edge.length - 1; i++) {
          const a = edge[i], b = edge[i + 1], L = V.len(V.sub(b, a)); if (L < 0.05) continue;
          const mid = V.mul(V.add(a, b), 0.5);
          BB.add(box(0.12, 0.16, L), m.curb, M(mid[0], 0.08, mid[1], rotOf(V.norm(V.sub(b, a)))), { noShadow: true });
        }
      }
    }
    // 橋の欄干
    if (e.br) for (const sd of [1, -1]) {
      const l = offsetLine(e.pts, sd * (e.w / 2 + (hasSidewalk(e) ? 2.4 : 0.3)));
      for (let i = 0; i < l.length - 1; i++) {
        const a = l[i], b = l[i + 1], L = V.len(V.sub(b, a)); if (L < 0.1) continue;
        const mid = V.mul(V.add(a, b), 0.5);
        BB.add(box(0.25, 0.9, L), m.concrete, M(mid[0], 0.45, mid[1], rotOf(V.norm(V.sub(b, a)))));
        addWallCollider(a, b, 0.3, 0.9);
      }
    }
  }
  // 交差点の面（角を丸く埋める）
  for (const n of T.nodes) {
    if (n.ends.length < 2) continue;
    const r = Math.max(...n.ends.map(x => x.e.w)) / 2 + (n.ends.length >= 3 ? 1.0 : 0);
    const g = new THREE.CircleGeometry(r, 20); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + n.x, -(p.getZ(i) + n.z));
    BB.add(g, MATS.roadMat, M(n.x, 0.02, n.z), { noShadow: true });
  }
  // 一時停止：格下の道から格上の道に出る所（同じ格なら南北方向の道に）
  for (const n of T.nodes) {
    if (n.ends.length < 3 || n.signal) continue;
    for (const { e, end } of n.ends) {
      const into = end === 'a' ? atS(e, 0) : atS(e, e.len);
      const d = end === 'a' ? [-into.d[0], -into.d[1]] : into.d; // 交差点に向かう向き
      const minor = e.rank < n.maxRank || (n.ends.every(x => x.e.rank === e.rank) && Math.abs(d[1]) > Math.abs(d[0]));
      if (!minor || e.rank >= 3) continue;
      if (e.ow && end === 'a') continue; // 一方通行の出口側には付けない
      const s = end === 'a' ? n.R + 0.9 : e.len - n.R - 0.9;
      if (s < 2 || s > e.len - 2) continue;
      const at = atS(e, s), left = V.left(d);
      const half = e.ow ? e.w / 2 : e.w / 2;
      const c = V.add(at.p, V.mul(left, e.ow ? 0 : half / 2));
      BB.add(box(e.ow ? e.w - 0.6 : half - 0.3, 0.01, 0.45), MATS.m.lineWhite, M(c[0], 0.036, c[1], rotOf(d) + Math.PI / 2), { noShadow: true });
      const tp = V.sub(V.add(at.p, V.mul(left, e.ow ? 0 : half / 2)), V.mul(d, 3.4));
      if (s > 5 && e.len - s > 0) stopText(tp, d);
      roadSign('stop', V.add(at.p, V.mul(left, e.w / 2 + 0.45)), d, 0.7);
      (n.stops = n.stops || []).push({ e, d, p: at.p });
    }
  }
  // 横断歩道（地図の横断歩道の位置）
  for (const c of T.data.crossings) {
    const ne = nearestEdge(c[0], c[1]);
    if (!ne || ne.d > 3 || ne.e.rank < 2) continue;
    const e = ne.e, d = ne.dir, left = V.left(d);
    for (let k = -e.w / 2 + 0.5; k < e.w / 2 - 0.3; k += 0.9) {
      const p = V.add([ne.x, ne.z], V.mul(left, k + 0.22));
      BB.add(box(0.45, 0.01, 3.5), MATS.m.lineWhite, M(p[0], 0.037, p[1], rotOf(d)), { noShadow: true });
    }
  }
  // 速度の標識（大きな道の両端近く）
  for (const e of T.edges) {
    if (e.rank < 3 || e.len < 60) continue;
    const s = T.nodes[e.a].R + 8, at = atS(e, s);
    roadSign(String(e.limit), V.add(at.p, V.mul(V.left(at.d), e.w / 2 + 1.8)), at.d);
    if (!e.ow) { const bt = atS(e, e.len - T.nodes[e.b].R - 8); const d = [-bt.d[0], -bt.d[1]]; roadSign(String(e.limit), V.add(bt.p, V.mul(V.left(d), e.w / 2 + 1.8)), d); }
  }
  // バス停
  for (const b of T.data.bus) {
    const ne = nearestEdge(b[0], b[1]); if (!ne) continue;
    const p = V.add([ne.x, ne.z], V.mul(V.left(ne.dir), ne.side * (ne.e.w / 2 + 1.0)));
    roadSign('bus', p, ne.side > 0 ? ne.dir : V.mul(ne.dir, -1), 0.5);
  }
}

// ---------------- 川・用水路 ----------------
function buildWater(root) {
  const m = MATS.m;
  for (const w of T.data.water) {
    const pts = w.pts;
    if (pts.length < 2) continue;
    BB.add(ribbon(pts, w.w, 0.012), MATS.water, new THREE.Matrix4(), { noShadow: true });
    for (const sd of [1, -1]) {
      const bank = offsetLine(pts, sd * (w.w / 2 + 0.25));
      BB.add(ribbon(pts, 0.5, 0.05, sd * (w.w / 2 + 0.25)), m.concrete, new THREE.Matrix4(), { noShadow: true });
      // 緑のフェンス（道路と交わる所は切る）
      const fx = offsetLine(pts, sd * (w.w / 2 + 0.45));
      for (let i = 0; i < fx.length - 1; i++) {
        const a = fx[i], b = fx[i + 1], L = V.len(V.sub(b, a));
        const steps = Math.max(1, Math.ceil(L / 3));
        for (let k = 0; k < steps; k++) {
          const p = V.add(a, V.mul(V.sub(b, a), k / steps)), q = V.add(a, V.mul(V.sub(b, a), (k + 1) / steps));
          const mid = V.mul(V.add(p, q), 0.5);
          if (nearRoad(mid[0], mid[1], 1.5)) continue;
          const SL = V.len(V.sub(q, p));
          BB.add(new THREE.PlaneGeometry(SL, 1.1), MATS.fence, M(mid[0], 0.6, mid[1], rotOf(V.norm(V.sub(q, p))) + Math.PI / 2), { noShadow: true });
          BB.add(box(0.05, 1.15, 0.05), MATS.fenceAlu, M(p[0], 0.58, p[1]));
          addWallCollider(p, q, 0.12, 1.1);
        }
      }
      void bank;
    }
    T.water.push(w);
  }
}

// ---------------- 軽い小物（たくさん置くもの） ----------------
let PROP = null;
function props() {
  if (PROP) return PROP;
  const leaf = A.mats.leaf.clone(); leaf.color.multiplyScalar(0.85);
  const ac = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.6 });
  const fan = new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.7 });
  const stripe = new THREE.MeshStandardMaterial({ map: textTexture(128, 32, (c, w, h) => { for (let k = -2; k < 8; k++) { c.fillStyle = k % 2 ? '#1c1c1c' : '#e8c02c'; c.beginPath(); c.moveTo(k * 20, h); c.lineTo(k * 20 + 20, h); c.lineTo(k * 20 + 36, 0); c.lineTo(k * 20 + 16, 0); c.fill(); } }), roughness: 0.6 });
  PROP = { leaf, ac, fan, stripe, blob: new THREE.IcosahedronGeometry(0.5, 1) };
  return PROP;
}
// 植え込み（葉のかたまりを数個）
function bush(x, z, s = 1) {
  const P = props();
  for (let k = 0; k < 3; k++) { const k2 = (0.7 + rnd() * 0.5) * s; BB.add(P.blob, P.leaf, M(x + (rnd() - 0.5) * 0.6 * s, (0.35 + rnd() * 0.25) * s, z + (rnd() - 0.5) * 0.6 * s, rnd() * 6, k2, k2 * 0.85, k2)); }
}
// 室外機（箱と換気口）
function acUnit(x, z, r) {
  const P = props(), base = M(x, 0, z, r);
  BB.add(box(0.8, 0.6, 0.3), P.ac, new THREE.Matrix4().copy(base).multiply(M(0, 0.32, 0)));
  BB.add(new THREE.CircleGeometry(0.2, 16), P.fan, new THREE.Matrix4().copy(base).multiply(M(-0.12, 0.33, 0.152)), { noShadow: true });
  BB.add(box(0.85, 0.04, 0.35), P.fan, new THREE.Matrix4().copy(base).multiply(M(0, 0.02, 0)));
}

// ---------------- 木 ----------------
const _treeGeo = { trunk: null, leaf: null };
function tree(pos, s = 1, collide = true) {
  if (!_treeGeo.trunk) { _treeGeo.trunk = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 8); _treeGeo.leaf = new THREE.IcosahedronGeometry(1.4, 1); }
  BB.add(_treeGeo.trunk, A.mats.trunk, M(pos.x, 1.2 * s, pos.z, 0, s, s, s));
  for (let k = 0; k < 4; k++) {
    const k2 = (0.7 + rnd() * 0.5) * s;
    BB.add(_treeGeo.leaf, A.mats.leaf, M(pos.x + (rnd() - 0.5) * 1.4 * s, (2.8 + rnd() * 1.2) * s, pos.z + (rnd() - 0.5) * 1.4 * s, rnd() * 6, k2, k2, k2));
  }
  if (collide) addCircle(pos.x, pos.z, 0.3 * s);
}

// =========================================================
// 営業所：大きな道に面した空き地を探して置く
// =========================================================
const DEPOT = { W: 52, D: 46 };
function rectPts(o, u, v, x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [o[0] + u[0] * x + v[0] * z, o[1] + u[1] * x + v[1] * z]); }
function polysOverlap(a, b) {
  for (const p of a) if (pointInPoly(p[0], p[1], b)) return true;
  for (const p of b) if (pointInPoly(p[0], p[1], a)) return true;
  return false;
}
function placeDepot() {
  const [bx0, bz0, bx1, bz1] = T.bounds;
  let best = null;
  for (const e of T.edges) {
    if (e.rank < 2 || e.len < 60) continue;
    for (let s = 30; s < e.len - 30; s += 5) {
      const at = atS(e, s);
      for (const side of [1, -1]) {
        const n = V.mul(V.left(at.d), side);
        const o = V.add(at.p, V.mul(n, frontOffset(e)));
        const u = [n[1], -n[0]]; // 道路に沿った向き
        const poly = rectPts(o, u, n, -DEPOT.W / 2, DEPOT.W / 2, 0, DEPOT.D);
        if (poly.some(p => p[0] < bx0 + 20 || p[0] > bx1 - 20 || p[1] < bz0 + 20 || p[1] > bz1 - 20)) continue;
        let bad = false;
        for (const b of T.data.buildings) { const c = b.pts[0]; if (Math.abs(c[0] - o[0]) > 90 || Math.abs(c[1] - o[1]) > 90) continue; if (polysOverlap(poly, b.pts)) { bad = true; break; } }
        if (bad) continue;
        // ほかの道路や川が敷地を通っていないか
        for (const e2 of T.edges) { if (e2 === e) continue; for (const p of e2.pts) if (pointInPoly(p[0], p[1], rectPts(o, u, n, -DEPOT.W / 2 - 1, DEPOT.W / 2 + 1, 0.5, DEPOT.D + 1))) { bad = true; break; } if (bad) break; }
        for (const w of T.data.water) { for (const p of w.pts) if (pointInPoly(p[0], p[1], rectPts(o, u, n, -DEPOT.W / 2 - 1, DEPOT.W / 2 + 1, -1, DEPOT.D + 1))) { bad = true; break; } if (bad) break; }
        if (bad) continue;
        const score = -Math.hypot(o[0], o[1]) + (e.rank >= 3 ? 250 : 0);
        if (!best || score > best.score) best = { score, o, u, n, e, s, side, poly };
      }
    }
  }
  if (!best) throw new Error('営業所を置く場所が見つかりません');
  return best;
}
function buildDepot(root, dp) {
  const m = MATS.m;
  const rot = rotOf(dp.n); // ローカル +z が敷地の奥
  const base = new THREE.Matrix4().makeRotationY(rot).setPosition(dp.o[0], 0, dp.o[1]);
  const W2 = (x, z) => localToWorld(base, x, 0, z);
  const L = (geo, mat, x, y, z, ry = 0, opts) => BB.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  const box2 = (x0, x1, z0, z1, h) => addLocalBox(base, x0, x1, z0, z1, h);
  const HW = DEPOT.W / 2, D = DEPOT.D;
  const yard = new THREE.PlaneGeometry(DEPOT.W, D); yard.rotateX(-Math.PI / 2);
  L(yard, MATS.concretePad, 0, 0.022, D / 2, 0, { noShadow: true });
  // 入口の切り下げ（道路から敷地へ）
  L(box(12, 0.02, frontOffset(dp.e) - dp.e.w / 2 + 0.2), m.asphalt, 0, 0.021, -(frontOffset(dp.e) - dp.e.w / 2) / 2, 0, { noShadow: true });
  // 外周の塀
  const wallH = 1.6;
  const seg = (x0, x1, z) => { L(box(x1 - x0, wallH, 0.2), m.block, (x0 + x1) / 2, wallH / 2, z); box2(x0, x1, z - 0.15, z + 0.15, wallH); };
  const segZ = (x, z0, z1) => { L(box(0.2, wallH, z1 - z0), m.block, x, wallH / 2, (z0 + z1) / 2); box2(x - 0.15, x + 0.15, z0, z1, wallH); };
  seg(-HW, -6.5, 0.1); seg(6.5, HW, 0.1); segZ(-HW, 0, D); segZ(HW, 0, D); seg(-HW, HW, D);
  // 倉庫
  const wx0 = -26, wx1 = 14, wz0 = 18, wz1 = 46, wh = 7.5;
  const shell = (a, b, c, d, h, mat) => { L(box(b - a, h, d - c), mat, (a + b) / 2, h / 2, (c + d) / 2); box2(a, b, c, d, h); };
  shell(wx0, wx1, wz1 - 0.3, wz1, wh, m.metal);
  shell(wx0, wx0 + 0.3, wz0, wz1, wh, m.metal);
  shell(wx1 - 0.3, wx1, wz0, wz1, wh, m.metal);
  for (const [a, b] of [[wx0, -18], [-10, -4], [4, wx1]]) shell(a, b, wz0, wz0 + 0.3, wh, m.metal);
  for (const [a, b] of [[-18, -10], [-4, 4]]) {
    L(box(b - a, wh - 4.2, 0.3), m.metal, (a + b) / 2, 4.2 + (wh - 4.2) / 2, wz0 + 0.15);
    L(box(b - a, 0.6, 0.6), m.shutter, (a + b) / 2, 4.0, wz0 + 0.3);
  }
  L(box(wx1 - wx0 + 1, 0.3, wz1 - wz0 + 1), m.metalBlue, (wx0 + wx1) / 2, wh + 0.15, (wz0 + wz1) / 2);
  const fl = new THREE.PlaneGeometry(wx1 - wx0 - 0.6, wz1 - wz0 - 0.6); fl.rotateX(-Math.PI / 2);
  L(fl, MATS.concretePad, (wx0 + wx1) / 2, 0.03, (wz0 + wz1) / 2, 0, { noShadow: true });
  // 看板
  const signMat = new THREE.MeshStandardMaterial({
    map: textTexture(1024, 128, (c, w, h) => {
      c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2f7d4f'; c.fillRect(0, 0, 120, h);
      c.fillStyle = '#fff'; c.font = `bold 70px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('あ', 60, h / 2 + 4);
      c.fillStyle = '#2b3440'; c.font = `bold 60px ${JP_FONT}`; c.fillText('あおば運輸　あおば町営業所', 570, h / 2 + 4);
    }), roughness: 0.5,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), signMat);
  sign.position.copy(localToWorld(base, -6, 5.9, wz0 - 0.02)); sign.rotation.y = rot + Math.PI; root.add(sign);
  // 道路際の袖看板
  const pole = new THREE.Mesh(box(0.25, 4, 0.25), m.frame); pole.position.copy(localToWorld(base, 9, 2, 0.6)); pole.rotation.y = rot; root.add(pole);
  const ps = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), signMat); ps.position.copy(localToWorld(base, 9, 3.6, 0.45)); ps.rotation.y = rot + Math.PI; root.add(ps);
  // 作業台
  const tables = [];
  const table = (tx, tz) => {
    L(box(3.0, 0.06, 1.2), m.frame, tx, 0.85, tz);
    for (const [dx, dz] of [[-1.4, -0.5], [1.4, -0.5], [-1.4, 0.5], [1.4, 0.5]]) L(box(0.06, 0.85, 0.06), m.frame, tx + dx, 0.425, tz + dz);
    L(box(3.0, 0.04, 1.2), m.frame, tx, 0.25, tz);
    box2(tx - 1.5, tx + 1.5, tz - 0.6, tz + 0.6, 0.9);
    const w = localToWorld(base, tx, 0.88, tz);
    tables.push({ x: w.x, z: w.z, y: 0.88, rot });
  };
  for (let k = 0; k < 3; k++) table(-22 + k * 3.4, 30);
  for (let k = 0; k < 2; k++) table(-22 + k * 3.4, 35);
  // 仕分け戻しのカゴ
  const crate = new THREE.Group();
  for (let k = 0; k < 2; k++) { const c = model('plastic_crate_01'); c.scale.setScalar(2.2); c.position.set(k * 0.7, 0, 0); crate.add(c); }
  crate.position.copy(localToWorld(base, -11.4, 0, 34.5)); crate.rotation.y = rot; root.add(crate);
  box2(-11.8, -10.3, 34, 35, 0.6);
  const crateSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), signMaterialStatic('仕分け戻し'));
  crateSign.position.copy(localToWorld(base, -11.05, 1.15, 34.0)); crateSign.rotation.y = rot + Math.PI; root.add(crateSign);
  L(box(0.04, 1.2, 0.04), m.frame, -11.05, 0.6, 34.05);
  // ホワイトボードと事務机
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  wb.position.copy(localToWorld(base, 0, 1.7, wz1 - 0.35)); wb.rotation.y = rot + Math.PI; root.add(wb);
  L(box(3.4, 1.8, 0.05), m.frame, 0, 1.7, wz1 - 0.32);
  L(box(1.6, 0.05, 0.8), m.cedar, 5, 0.74, 42);
  for (const [dx, dz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) L(box(0.05, 0.74, 0.05), m.frame, 5 + dx, 0.37, 42 + dz);
  box2(4.2, 5.8, 41.6, 42.4, 0.8);
  const clip = model('cardboard_box_01'); clip.scale.set(0.8, 0.25, 0.6); clip.position.copy(localToWorld(base, 5, 0.77, 42)); clip.rotation.y = rot; root.add(clip);
  const hand = model('hand_truck'); hand.position.copy(localToWorld(base, 10, 0, 40)); hand.rotation.y = rot - 0.6; root.add(hand);
  for (const x of [-18, -2]) {
    const pl = new THREE.PointLight(0xfff2dd, 30, 22, 1.6); pl.position.copy(localToWorld(base, x, 6.5, 32)); root.add(pl);
    L(box(1.2, 0.08, 0.3), m.white, x, 7.1, 32, 0, { noShadow: true });
  }
  // 停めてある別の配送車の代わりのパレット
  for (let k = 0; k < 3; k++) L(box(1.1, 0.14, 1.1), m.cedar, 18 + k * 1.4, 0.07, 30);
  const vs = W2(-1.5, 11), ps2 = W2(-21, 27.5), boss = W2(0, 45.2), desk = localToWorld(base, 5, 1.0, 41.3), cr = localToWorld(base, -11.05, 0.9, 34.5), front = W2(0, -frontOffset(dp.e) + dp.e.w / 4);
  T.depot = {
    tables, whiteboard: wb, crate: cr, desk, rot, base,
    vanSpawn: { x: vs.x, z: vs.z, heading: rot + Math.PI }, playerSpawn: { x: ps2.x, z: ps2.z, yaw: rot + Math.PI },
    boss: { x: boss.x, z: boss.z, rotY: rot + Math.PI }, front: { x: front.x, z: front.z },
    poly: dp.poly, edge: dp.e, center: (() => { const c = W2(0, D / 2); return { x: c.x, z: c.z }; })(),
    contains(x, z) { return pointInPoly(x, z, dp.poly); },
  };
}
function signMaterialStatic(text) {
  return new THREE.MeshStandardMaterial({
    map: textTexture(256, 64, (c, w, h) => {
      c.fillStyle = '#e9e4d8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8c8270'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
      c.fillStyle = '#222'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold 36px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 2);
    }), roughness: 0.5,
  });
}

// =========================================================
// 建物の分類と、配達先（住民）の割り当て
// =========================================================
const SHOP_NAMES = {
  convenience: ['あおばマート', 'ハッピーマート', 'デイリーみね'], chemist: ['ドラッグひがし'], restaurant: ['パスタの店 ルーチェ'], fast_food: ['牛めし さくら'],
  laundry: ['ふとん丸洗い 白鳥'], prep_school: ['あおば個別塾'], dentist: ['みね歯科'],
};
function planBuildings(depot) {
  const out = [];
  let ci = 0;
  for (const b of T.data.buildings) {
    if (polysOverlap(b.pts, depot.poly)) continue;
    const pts = b.pts;
    const area = Math.abs(polyArea(pts));
    if (area < 6) continue;
    const o = obb(pts);
    const rect = area / o.area;
    const c = centroid(pts);
    const nm = b.nm || '';
    let kind = 'house';
    if (b.k === 'apartments') kind = 'apart';
    else if (b.k === 'hospital') kind = 'clinic';
    else if (/神社/.test(nm)) kind = 'shrine';
    else if (/セブン|ローソン|ファミリーマート|ミニストップ/.test(nm)) kind = 'conbini';
    else if (/ドラッグ|薬品|ショールーム|歯科|保育/.test(nm) || ['retail', 'commercial'].includes(b.k)) kind = 'store';
    else if (b.k === 'yes' || b.k === 'residential') {
      if (area < 22) kind = 'shed';
      else if (area < 170) kind = 'house';
      else if (area > 700) kind = 'factory';
      else kind = T.data.areas.some(a => (a.k === 'retail' || a.k === 'commercial') && pointInPoly(c[0], c[1], a.pts)) ? 'store' : 'apart';
    } else if (['garage', 'shed', 'roof'].includes(b.k)) kind = 'shed';
    if (kind === 'house' && area < 22) kind = 'shed';
    if (kind === 'house' && area > 260) kind = 'apart';
    const ne = nearestEdge(c[0], c[1], (e) => e.rank >= 1 || kind !== 'house');
    const item = { b, pts, area, o, rect, c, kind, ne, floors: 2, id: null, res: [], shopName: null };
    if (kind === 'apart') item.floors = b.lv || (area > 380 ? 3 : 2);
    if (kind === 'house') item.floors = area > 150 && rnd() < 0.4 ? 1 : (rnd() < 0.12 ? 1 : 2);
    if (kind === 'store' || kind === 'conbini') item.floors = b.lv || 1;
    if (kind === 'clinic') item.floors = b.lv || 3;
    if (kind === 'conbini') item.shopName = SHOP_NAMES.convenience[ci++ % 3];
    else if (kind === 'store') item.shopName = /ドラッグ|薬/.test(nm) ? 'ドラッグひがし' : /歯科/.test(nm) ? 'みね歯科' : /保育/.test(nm) ? 'みね保育園' : /ショールーム/.test(nm) ? '住まいのショールーム' : null;
    // 道路との位置関係（玄関の向き・門の位置）
    if (ne) {
      const n = V.mul(V.left(ne.dir), ne.side); // 道路から建物へ向かう向き
      let dFront = Infinity;
      for (const p of pts) dFront = Math.min(dFront, V.dot(V.sub(p, [ne.x, ne.z]), n));
      item.n = n; item.dFront = dFront; item.gapWall = dFront - frontOffset(ne.e);
    }
    out.push(item);
  }
  // ---- 住民の家を選ぶ（毎回同じ結果） ----
  const used = new Set();
  const good = (it) => it.ne && it.gapWall >= 1.6 && it.gapWall < 14 && it.ne.e.rank <= 2 && it.ne.e.rank >= 1 && it.rect > 0.75;
  const pickFrom = (list, score) => { let best = null, bs = -Infinity; for (const it of list) { if (used.has(it)) continue; const s = score(it); if (s > bs) { bs = s; best = it; } } if (best) used.add(best); return best; };
  const assign = (id, it, kind) => { if (!it) return; it.id = id; if (kind) it.kind = kind; };
  const zone = (it, zx, zz) => -Math.hypot(it.c[0] - zx, it.c[1] - zz);
  const dpo = depot.o;
  // マンション：一番大きな集合住宅
  assign('1-C2-0', pickFrom(out.filter(it => it.kind === 'apart' && it.ne && it.gapWall > 0.5 && it.rect > 0.7), it => it.area * (it.b.lv || 3)), 'mansion');
  // アパート：2階建て、長い辺が道路に面している
  const ap2 = pickFrom(out.filter(it => it.kind === 'apart' && it.ne && it.rect > 0.85 && it.area > 120 && it.area < 450 && it.gapWall > 2 && Math.abs(V.dot(it.o.u, it.ne.dir)) > 0.85), it => -Math.hypot(it.c[0] - dpo[0], it.c[1] - dpo[1]) * 0.3);
  if (ap2) { assign('2-B2-1', ap2, 'apart'); ap2.floors = 2; }
  // 店：大きな道沿いの家を店舗併用住宅に
  const shopCand = out.filter(it => it.kind === 'house' && it.ne && it.ne.e.rank >= 3 && it.gapWall < 8 && it.area > 50 && it.area < 220);
  const shops = [['1-S-2', '喫茶こもれび', '#5b4632'], ['1-S-3', 'ベーカリー松本', '#9a5a2c'], ['2-S-0', '花屋はなまる', '#4f7a45'], ['2-S-2', '中島書店', '#2f4a6e'], ['3-S-0', 'クリーニング白鳥', '#3d6c8c']];
  for (const [id, name, color] of shops) {
    const it = pickFrom(shopCand, (x) => -Math.hypot(x.c[0] - dpo[0], x.c[1] - dpo[1]) + rnd() * 120);
    if (it) { assign(id, it, 'shop'); it.shopName = name; it.shopColor = color; }
  }
  // コンビニ
  const cv = pickFrom(out.filter(it => it.kind === 'conbini'), (x) => -Math.hypot(x.c[0] - dpo[0], x.c[1] - dpo[1]));
  if (cv) { assign('1-S-0', cv, 'conbini'); cv.shopName = 'あおばマート'; }
  // 一戸建ての住民：町のあちこちに散らす
  const houses = out.filter(it => it.kind === 'house' && good(it));
  const B = T.bounds, W = B[2] - B[0], H = B[3] - B[1];
  const spots = {
    tanaka: [0.35, 0.55], suzuki: [0.62, 0.30], yoshida: [0.25, 0.30], watanabe: [0.72, 0.62], kato: [0.55, 0.72],
    nakamura: [0.40, 0.80], ogawa: [0.80, 0.42], ito: [0.20, 0.68],
  };
  const lotIdOf = Object.fromEntries(RESIDENTS.map(r => [r.id, r.lot]));
  for (const [rid, [fx, fz]] of Object.entries(spots)) {
    const zx = B[0] + W * fx, zz = B[1] + H * fz;
    assign(lotIdOf[rid], pickFrom(houses, it => zone(it, zx, zz) + it.area * 0.05));
  }
  // 佐藤さん（同じ苗字のお隣どうし）：同じ道の同じ側に並ぶ2軒
  let pair = null, pbest = -Infinity;
  for (const a of houses) {
    if (used.has(a)) continue;
    for (const b2 of houses) {
      if (b2 === a || used.has(b2) || b2.ne.e !== a.ne.e || b2.ne.side !== a.ne.side) continue;
      const gap = Math.abs(b2.ne.s - a.ne.s);
      if (gap < 9 || gap > 18) continue;
      const sc = zone(a, B[0] + W * 0.5, B[1] + H * 0.45);
      if (sc > pbest) { pbest = sc; pair = [a, b2]; }
    }
  }
  if (pair) { used.add(pair[0]); used.add(pair[1]); assign('1-C1-2', pair[0]); assign('1-C1-3', pair[1]); }
  // 畑のそばの農家（小林さん）
  const farmH = pickFrom(houses.filter(it => it.area > 80), it => {
    let d = 1e9; for (const a of T.data.areas) if (a.k === 'farmland') for (const p of a.pts) d = Math.min(d, Math.hypot(p[0] - it.c[0], p[1] - it.c[1]));
    return -d;
  });
  assign('3-D-3', farmH, 'farmhouse');
  // 足りなければ近い家で埋める
  for (const r of RESIDENTS) if (!out.some(it => it.id === r.lot)) assign(r.lot, pickFrom(houses, () => rnd()));
  return out;
}

// =========================================================
// 建物の見た目
// =========================================================
function windowsOn(pts, floors, fh, base, opts = {}) {
  const lit = opts.lit ?? 0.45;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = V.len(V.sub(b, a)); if (L < 1.6) continue;
    const d = V.norm(V.sub(b, a)), n = edgeNormal(pts, i);
    const nWin = Math.max(1, Math.floor((L - 0.6) / 2.7));
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < nWin; k++) {
        if (rnd() < 0.28) continue;
        const t = (k + 0.5) / nWin * L + (rnd() - 0.5) * 0.4;
        if (opts.skip && opts.skip(i, f, t)) continue;
        let type = rpick([0, 0, 1, 2, 3, 5]);
        let w = 1.1 + rnd() * 0.8, h = 1.0 + rnd() * 0.3, y = base + f * fh + 1.55;
        if (type === 2 || type === 5) { w = 0.6 + rnd() * 0.3; h = 0.6; y = base + f * fh + 1.75; }
        if (f === 0 && rnd() < 0.3 && type !== 2) { type = 4; w = 1.7; h = 1.95; y = base + 1.1; }
        if (opts.type != null) { type = opts.type; w = opts.w || w; h = opts.h || h; y = base + f * fh + (opts.y ?? 1.55); }
        w = Math.min(w, L - 0.5);
        const p = V.add(a, V.mul(d, t));
        const g = winUV(new THREE.PlaneGeometry(w, h), type);
        BB.add(g, rnd() < lit && type !== 3 ? MATS.winLit : MATS.winMat, M(p[0] + n[0] * 0.025, y, p[1] + n[1] * 0.025, rotOf(n)), { noShadow: true });
        if (type !== 3 && type !== 4) BB.add(box(w + 0.1, 0.05, 0.1), MATS.m.frame, M(p[0] + n[0] * 0.05, y - h / 2 - 0.02, p[1] + n[1] * 0.05, rotOf(n)));
      }
    }
  }
}
function buildBuildings(root, plan) {
  const m = MATS.m;
  for (const it of plan) {
    const { pts, o, kind } = it;
    let H, wallMat, roofKind;
    if (kind === 'shed') { H = 2.3; wallMat = rpick([m.metal, m.sidingDark]); roofKind = 'flat'; }
    else if (kind === 'house' || kind === 'farmhouse' || kind === 'shop') { H = it.floors === 1 ? 3.2 : 6.0; wallMat = kind === 'farmhouse' ? m.cedarDark : rpick(MATS.walls); roofKind = it.rect > 0.82 ? (rnd() < 0.5 ? 'hip' : 'gable') : 'flat'; }
    else if (kind === 'apart' || kind === 'mansion') { if (kind === 'mansion') it.floors = Math.max(5, it.floors); H = it.floors * 2.9 + 0.6; wallMat = rpick([m.siding, m.stucco, m.plasterCream, m.beige]); roofKind = 'flat'; }
    else if (kind === 'factory') { H = 7; wallMat = m.metal; roofKind = 'flat'; }
    else if (kind === 'shrine') { H = 3.4; wallMat = m.cedarDark; roofKind = 'gable'; }
    else { H = it.floors * 3.5 + 0.5; wallMat = kind === 'conbini' ? m.white : rpick([m.plaster, m.stucco, m.siding]); roofKind = 'flat'; }
    it.H = H; it.wallMat = wallMat;
    const ptsUse = (kind === 'apart' && it.id) ? rectPts([o.cx, o.cz], o.u, o.v, -o.L / 2, o.L / 2, -o.W / 2, o.W / 2) : pts;
    it.ptsUse = ptsUse;
    T.buildingsMap.push(ptsUse);
    const foundation = kind === 'house' || kind === 'farmhouse' || kind === 'shop' ? 0.4 : 0.1;
    BB.add(wallsGeo(ptsUse, 0, foundation, 0.03), m.concrete, new THREE.Matrix4());
    BB.add(wallsGeo(ptsUse, foundation, H + (roofKind === 'flat' ? 0.35 : 0)), wallMat, new THREE.Matrix4());
    addPoly(ptsUse, H);
    // 屋根
    if (roofKind === 'flat') {
      BB.add(polyFill(ptsUse, H + 0.05), kind === 'shed' ? m.metalBlue : MATS.flatRoof, new THREE.Matrix4());
    } else {
      const rh = Math.min(2.6, o.W * (kind === 'shrine' ? 0.42 : 0.24));
      const roofMat = kind === 'farmhouse' || kind === 'shrine' ? m.roof : rpick(MATS.roofs);
      const ry = Math.atan2(-o.u[1], o.u[0]);
      const g = roofKind === 'hip' ? hipRoof(o.L, o.W, rh, 0.5) : gableRoof(o.L, o.W, rh, 0.5);
      BB.add(g, roofMat, M(o.cx, H, o.cz, ry));
      if (roofKind === 'gable') {
        const mat = new THREE.Matrix4();
        BB.add(gableWall(o.W, rh), wallMat, mat.copy(M(o.cx, H, o.cz, ry)).multiply(M(-o.L / 2, 0, 0)));
        BB.add(gableWall(o.W, rh), wallMat, new THREE.Matrix4().copy(M(o.cx, H, o.cz, ry)).multiply(M(o.L / 2, 0, 0, Math.PI)));
      }
      BB.add(box(o.L + 1.1, 0.16, 0.22), m.roof, new THREE.Matrix4().copy(M(o.cx, H, o.cz, ry)).multiply(M(0, rh + 0.02, 0)));
    }
    // 窓
    if (kind === 'house' || kind === 'farmhouse') windowsOn(ptsUse, it.floors, 2.85, foundation, { skip: it.doorSkip });
    else if (kind === 'apart' || kind === 'mansion') {
      windowsOn(ptsUse, it.floors, 2.9, 0.3, { lit: 0.5 });
      if (!it.id && it.rect > 0.8) apartmentBalconies(it);
    } else if (kind === 'clinic' || kind === 'store') windowsOn(ptsUse, it.floors, 3.5, 0.4, { type: 0, w: 2.2, h: 1.4, y: 1.7 });
    else if (kind === 'factory') windowsOn(ptsUse, 1, 3, 3.5, { type: 5, w: 1.6, h: 0.8, y: 1.2 });
    else if (kind === 'shrine') shrineExtras(it);
    // 室外機（家の横）
    if ((kind === 'house' || kind === 'apart') && rnd() < 0.7) {
      const i = Math.floor(rnd() * ptsUse.length), a = ptsUse[i], b = ptsUse[(i + 1) % ptsUse.length], n = edgeNormal(ptsUse, i);
      if (V.len(V.sub(b, a)) > 2.5) {
        const p = V.add(V.mul(V.add(a, b), 0.5), V.mul(n, 0.35));
        if (!nearRoad(p[0], p[1], 0.8)) acUnit(p[0], p[1], rotOf(n));
      }
    }
  }
}
function apartmentBalconies(it) {
  const { o } = it, m = MATS.m;
  // 長い辺の片側にベランダ
  const side = rnd() < 0.5 ? 1 : -1;
  for (let f = 1; f < it.floors; f++) {
    const c = [o.cx + o.v[0] * side * (o.W / 2 + 0.5), o.cz + o.v[1] * side * (o.W / 2 + 0.5)];
    const y = f * 2.9 + 0.3;
    BB.add(box(o.L - 0.6, 0.15, 1.0), m.concrete, M(c[0], y, c[1], rotOf(o.v) + Math.PI / 2));
    const r = [o.cx + o.v[0] * side * (o.W / 2 + 0.98), o.cz + o.v[1] * side * (o.W / 2 + 0.98)];
    BB.add(box(o.L - 0.6, 1.0, 0.06), m.sidingDark, M(r[0], y + 0.58, r[1], rotOf(o.v) + Math.PI / 2));
  }
}
function shrineExtras(it) {
  const ne = it.ne; if (!ne) return;
  const p = V.add([ne.x, ne.z], V.mul(it.n, frontOffset(ne.e) + 1.2));
  const r = rotOf(it.n);
  const mat = MATS.vermilion;
  for (const sx of [-1.4, 1.4]) BB.add(new THREE.CylinderGeometry(0.16, 0.18, 3.6, 12), mat, new THREE.Matrix4().copy(M(p[0], 0, p[1], r)).multiply(M(sx, 1.8, 0)));
  BB.add(box(4.0, 0.25, 0.35), mat, new THREE.Matrix4().copy(M(p[0], 0, p[1], r)).multiply(M(0, 3.7, 0)));
  BB.add(box(3.4, 0.18, 0.25), mat, new THREE.Matrix4().copy(M(p[0], 0, p[1], r)).multiply(M(0, 3.15, 0)));
  for (const sx of [-1.4, 1.4]) { const w = localToWorld(new THREE.Matrix4().copy(M(p[0], 0, p[1], r)), sx, 0, 0); addCircle(w.x, w.z, 0.2); }
}

// =========================================================
// 敷地：塀・門・表札・インターホン・郵便受け・配達の目印
// =========================================================
function buildLots(root, plan) {
  const m = MATS.m;
  const resByLot = {};
  for (const r of RESIDENTS) (resByLot[r.lot] = resByLot[r.lot] || []).push(r);
  const usedNames = new Set(RESIDENTS.map(r => r.name.split(' ')[0]));
  const extra = EXTRA_SURNAMES.filter(n => !usedNames.has(n));
  let ei = 0;
  // 同じ道の同じ側に並ぶ家の、塀の範囲が重ならないように分ける
  const groups = new Map();
  const lots = [];
  for (const it of plan) {
    if (!it.ne || !['house', 'farmhouse', 'shop', 'apart', 'mansion', 'conbini', 'store', 'clinic'].includes(it.kind)) continue;
    if (it.gapWall > 30 || it.gapWall < -1) continue;
    const e = it.ne.e;
    const t = it.ne.dir;
    let s0 = Infinity, s1 = -Infinity;
    for (const p of it.ptsUse) { const k = V.dot(V.sub(p, [it.ne.x, it.ne.z]), t); s0 = Math.min(s0, k); s1 = Math.max(s1, k); }
    const [ra, rb] = clearRange(e, 1.5, 1.5);
    const lot = { it, e, side: it.ne.side, s0: Math.max(ra, it.ne.s + s0 - 1.2), s1: Math.min(rb, it.ne.s + s1 + 1.2) };
    if (lot.s1 - lot.s0 < 3) { lot.s0 = Math.max(0.5, it.ne.s - 2); lot.s1 = Math.min(e.len - 0.5, it.ne.s + 2); }
    const key = e.id + ':' + lot.side;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lot);
    lots.push(lot);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.s0 + a.s1) - (b.s0 + b.s1));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (a.s1 > b.s0) { const mid = (a.s1 + b.s0) / 2; a.s1 = mid - 0.1; b.s0 = mid + 0.1; }
    }
  }
  // 住所（丁目は町の4区画、番は道ごと、号は並び順）
  const banOf = new Map(); let banN = {};
  for (const lot of lots) {
    const c = lot.it.c;
    const chome = 1 + (c[0] > 0 ? 1 : 0) + (c[1] > 0 ? 2 : 0);
    const key = lot.e.id + ':' + lot.side;
    if (!banOf.has(key)) { banN[chome] = (banN[chome] || 0) + 1; banOf.set(key, { chome, ban: banN[chome], go: 0 }); }
    const bo = banOf.get(key); bo.go++;
    lot.address = `あおば町${chome}-${bo.ban}-${bo.go}`;
  }
  let gi = 0;
  for (const L of lots) {
    const it = L.it;
    const id = it.id || `L${gi++}`;
    const residents = resByLot[id] || [];
    const kind = it.kind === 'store' || it.kind === 'clinic' ? 'store' : it.kind;
    const surname = residents.length && !['apart', 'mansion'].includes(kind) ? residents[0].name.split(' ')[0] : extra[ei++ % extra.length];
    const lot = {
      id, kind, name: it.shopName || null, address: L.address, residents, surname, points: {}, doors: [],
      w: 10, d: 10, cx: it.c[0], cz: it.c[1], rot: 0, poly: it.ptsUse,
    };
    try {
      if (kind === 'mansion') makeMansionLot(root, lot, L);
      else if (kind === 'apart' && it.id) makeApartLot(root, lot, L);
      else if (kind === 'shop' || kind === 'conbini') makeShopLot(root, lot, L);
      else if (kind === 'apart' || kind === 'store') makeOpenLot(root, lot, L);
      else makeHouseLot(root, lot, L);
    } catch (err) { console.warn('lot', id, err); continue; }
    T.lots[id] = lot; T.lotList.push(lot);
  }
}
// 敷地の向き：原点は門（塀の線上）、ローカル -z が道路側
function lotFrame(L, s) {
  const e = L.e, at = atS(e, s);
  const n = V.mul(V.left(at.d), L.side);
  const off = frontOffset(e);
  const o = V.add(at.p, V.mul(n, off));
  const rot = rotOf(n);
  const base = new THREE.Matrix4().makeRotationY(rot).setPosition(o[0], 0, o[1]);
  return { base, rot, n, t: at.d, o, road: at.p };
}
// 塀（s0〜s1 を、門のすき間をあけて）
function wallRun(L, sa, sb, style, h) {
  if (sb - sa < 0.3) return;
  const e = L.e, off = frontOffset(e), m = MATS.m;
  const line = subLine(e, sa, sb); if (!line) return;
  const pts = offsetLine(line, L.side * off);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = V.len(V.sub(b, a)); if (len < 0.1) continue;
    const mid = V.mul(V.add(a, b), 0.5), r = rotOf(V.norm(V.sub(b, a)));
    if (style === 'block') { BB.add(box(0.15, h, len), m.block, M(mid[0], h / 2, mid[1], r)); BB.add(box(0.2, 0.06, len), m.concrete, M(mid[0], h + 0.03, mid[1], r)); }
    else if (style === 'fence') { BB.add(box(0.15, 0.45, len), m.block, M(mid[0], 0.225, mid[1], r)); const fg = new THREE.PlaneGeometry(len, h - 0.45); const uv = fg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len * 4); BB.add(fg, MATS.slats, M(mid[0], 0.45 + (h - 0.45) / 2, mid[1], r + Math.PI / 2)); }
    else if (style === 'hedge') { BB.add(box(0.6, 1.0, len), props().leaf, M(mid[0], 0.5, mid[1], r)); BB.add(box(0.2, 0.25, len), m.block, M(mid[0], 0.12, mid[1], r)); }
    if (style !== 'none') addWallCollider(a, b, 0.2, style === 'hedge' ? 1.0 : h);
  }
}
function postAt(L, s, h = 1.35) {
  const e = L.e, at = atS(e, s), n = V.mul(V.left(at.d), L.side);
  const p = V.add(at.p, V.mul(n, frontOffset(e)));
  BB.add(box(0.34, h, 0.34), MATS.m.stucco, M(p[0], h / 2, p[1], rotOf(n)));
  addCircle(p[0], p[1], 0.22);
  return { p, n, r: rotOf(n) };
}
const icGeo = () => box(0.11, 0.16, 0.04);
let btnMat = null;
function intercomOn(post, plate, addr) {
  const m = MATS.m, o = V.mul(post.n, -1); // 道路側の面
  const at = (k, side = 0) => [post.p[0] + o[0] * k + post.n[1] * side, post.p[1] + o[1] * k - post.n[0] * side];
  if (!btnMat) btnMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0x88aaff, emissiveIntensity: 0.4 });
  const face = Math.atan2(o[0], o[1]);
  let q = at(0.175); BB.add(plate.g, plate.m, M(q[0], 1.18, q[1], face), { noShadow: true });
  q = at(0.19); BB.add(icGeo(), m.frameDark, M(q[0], 0.98, q[1], face));
  q = at(0.215); BB.add(new THREE.CircleGeometry(0.018, 12), btnMat, M(q[0], 0.96, q[1], face), { noShadow: true });
  if (addr) { q = at(0.175, 0); BB.add(addr.g, addr.m, M(q[0], 1.42, q[1], face), { noShadow: true }); }
  const ip = at(0.5);
  return new THREE.Vector3(ip[0], 1.0, ip[1]);
}
function mailboxNear(L, s) {
  const e = L.e, at = atS(e, s), n = V.mul(V.left(at.d), L.side);
  const p = V.add(at.p, V.mul(n, frontOffset(e) - 0.05));
  BB.add(box(0.34, 0.3, 0.14), MATS.m.frameDark, M(p[0], 1.0, p[1], rotOf(n)));
  const q = V.sub(p, V.mul(n, 0.45));
  return new THREE.Vector3(q[0], 1.0, q[1]);
}
// 玄関（建物の、道路に一番向いた辺）
function frontDoor(lot, L, gateP, dynamic) {
  const pts = L.it.ptsUse;
  let best = -Infinity, bi = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], len = V.len(V.sub(b, a));
    const sc = len * Math.max(0.05, -V.dot(edgeNormal(pts, i), L.it.n)) - 0.05 * Math.hypot((a[0] + b[0]) / 2 - gateP[0], (a[1] + b[1]) / 2 - gateP[1]);
    if (len > 1.4 && sc > best) { best = sc; bi = i; }
  }
  const a = pts[bi], b = pts[(bi + 1) % pts.length], d = V.norm(V.sub(b, a)), len = V.len(V.sub(b, a)), nf = edgeNormal(pts, bi);
  const t = Math.max(0.7, Math.min(len - 0.7, V.dot(V.sub(gateP, a), d)));
  const dp = V.add(a, V.mul(d, t));
  const m = MATS.m, rot = rotOf(nf);
  const base = 0.4;
  if (dynamic) {
    const door = new THREE.Group();
    const leaf = new THREE.Mesh(box(0.92, 2.05, 0.06), m.cedarDark); leaf.position.set(0.46, 1.025, 0); leaf.castShadow = true;
    const knob = new THREE.Mesh(box(0.04, 0.2, 0.05), m.chrome); knob.position.set(0.82, 1.0, 0.05);
    door.add(leaf, knob);
    const hinge = V.sub(dp, V.mul(d, 0.46));
    // 扉の向きを壁に合わせる（ローカル x が壁の向き）。外側へ開く向きを選ぶ
    door.position.set(hinge[0] + nf[0] * 0.03, base, hinge[1] + nf[1] * 0.03);
    door.rotation.y = Math.atan2(-d[1], d[0]);
    T.dynamic.push(door);
    const sign = V.dot([d[1], -d[0]], nf) > 0 ? 1 : -1;
    lot.doors.push({ obj: door, open: 0, target: 0, sign, base: door.rotation.y });
    BB.add(box(1.15, 2.25, 0.08), m.frameDark, M(dp[0] + nf[0] * 0.01, base + 1.12, dp[1] + nf[1] * 0.01, rot));
  } else {
    BB.add(winUV(new THREE.PlaneGeometry(1.2, 2.1), 6), MATS.winMat, M(dp[0] + nf[0] * 0.03, base + 1.05, dp[1] + nf[1] * 0.03, rot), { noShadow: true });
  }
  // 庇とポーチ
  BB.add(box(1.7, 0.08, 0.9), m.concrete, M(dp[0] + nf[0] * 0.45, base + 2.35, dp[1] + nf[1] * 0.45, rot));
  BB.add(box(1.8, 0.18, 1.1), m.concrete, M(dp[0] + nf[0] * 0.55, 0.09 + base * 0.5, dp[1] + nf[1] * 0.55, rot));
  lot.doorN = nf; lot.doorD = d;
  return { dp, nf, d };
}
function makeHouseLot(root, lot, L) {
  const it = L.it, e = L.e, m = MATS.m;
  const farm = lot.kind === 'farmhouse';
  const res = lot.residents[0];
  const special = !!res;
  // 門の位置：建物の正面の中ほど
  const sMid = Math.max(L.s0 + 2.3, Math.min(L.s1 - 1.6, it.ne.s));
  const F = lotFrame(L, sMid);
  const sx = (s) => -L.side * (s - sMid); // 弧長 s → 敷地のローカル x
  lot.base = F.base; lot.rot = F.rot; lot.w = L.s1 - L.s0; lot.d = Math.max(4, it.gapWall + 8);
  const open = it.gapWall < 1.0;
  const style = farm ? 'block' : open ? 'none' : special ? rpick(['block', 'block', 'fence']) : rpick(['block', 'block', 'block', 'fence', 'hedge', 'none']);
  const h = 1.0 + rnd() * 0.35;
  const g0 = sMid - 2.0, g1 = sMid + 0.9; // 門のすき間
  // 塀と門柱
  if (farm) {
    // 正面は閉じた木戸。本当の入口は塀の端の勝手口
    wallRun(L, L.s0, sMid - 1.6, 'block', 1.4); wallRun(L, sMid + 1.6, L.s1 - 2.6, 'block', 1.4);
    const gate = new THREE.Mesh(box(3.2, 1.6, 0.08), m.cedarDark);
    gate.position.copy(localToWorld(F.base, 0, 0.8, 0)); gate.rotation.y = F.rot; gate.castShadow = true; T.dynamic.push(gate);
    addLocalBox(F.base, -1.6, 1.6, -0.1, 0.1, 1.6);
    lot.points.frontGate = localToWorld(F.base, 0, 1.2, -0.5);
    const post = postAt(L, L.s1 - 2.4);
    const plate = PL.plane(0.26, 0.13, nameDraw(lot.surname)), addr = PL.plane(0.3, 0.12, addrDraw(lot.address.replace('あおば町', '')));
    lot.points.intercom = intercomOn(post, plate, addr);
    lot.points.mailbox = mailboxNear(L, L.s1 - 1.8);
    lot.gateS = L.s1 - 1.0;
  } else {
    if (style !== 'none') { wallRun(L, L.s0, g0, style, h); wallRun(L, g1 + 0.35, L.s1, style, h); }
    const post = postAt(L, g1 + 0.17);
    const plate = PL.plane(0.26, 0.13, nameDraw(lot.surname)), addr = PL.plane(0.3, 0.12, addrDraw(lot.address.replace('あおば町', '')));
    lot.points.intercom = intercomOn(post, plate, addr);
    lot.points.mailbox = mailboxNear(L, g1 + 0.65);
    lot.gateS = sMid - 0.6;
  }
  // 玄関
  const gp = atS(e, lot.gateS);
  const gateP = V.add(gp.p, V.mul(F.n, frontOffset(e)));
  const door = frontDoor(lot, L, gateP, special);
  lot.points.door = new THREE.Vector3(door.dp[0] + door.nf[0] * 1.1, 1.2, door.dp[1] + door.nf[1] * 1.1);
  lot.points.porch = new THREE.Vector3(door.dp[0] + door.nf[0] * 0.65 + door.d[0] * 0.6, 0.3, door.dp[1] + door.nf[1] * 0.65 + door.d[1] * 0.6);
  // 駐車スペースとアプローチ（コンクリート）
  const depth = Math.max(0.5, Math.min(it.gapWall, 6.5));
  if (!open) {
    const c = localToWorld(F.base, sx((g0 + g1) / 2), 0, depth / 2);
    BB.add(box(g1 - g0 + 0.4, 0.04, depth), MATS.concretePad, M(c.x, 0.03, c.z, F.rot), { noShadow: true });
    // 門から玄関までの通路
    const fromP = gateP, toP = [door.dp[0] + door.nf[0] * 0.5, door.dp[1] + door.nf[1] * 0.5];
    const len = V.len(V.sub(toP, fromP));
    if (len > 1) { const mid = V.mul(V.add(fromP, toP), 0.5); BB.add(box(1.1, 0.035, len), MATS.concretePad, M(mid[0], 0.025, mid[1], rotOf(V.norm(V.sub(toP, fromP)))), { noShadow: true }); }
    // 車
    if (!farm && rnd() < 0.3 && it.gapWall > 4.8) {
      const cxl = sx(g0 + 1.1);
      const cc = localToWorld(F.base, cxl, 0, 2.6);
      I.add('covered_car', M(cc.x, 0, cc.z, F.rot + (rnd() < 0.5 ? 0 : Math.PI)));
      addLocalBox(F.base, cxl - 0.9, cxl + 0.9, 0.4, 4.8, 1.6);
    }
  }
  // 宅配ボックス
  if ((res && res.okihai === '宅配ボックス') || (!res && rnd() < 0.25)) {
    const bx = sx(g1 - 0.4);
    const b = localToWorld(F.base, bx, 0, 0.45);
    BB.add(box(0.5, 0.95, 0.45), m.metalBlue, M(b.x, 0.475, b.z, F.rot));
    addLocalBox(F.base, bx - 0.25, bx + 0.25, 0.22, 0.68, 1);
    lot.points.box = localToWorld(F.base, bx, 0.9, -0.1);
  }
  // 物置
  if (farm || (res && res.okihai === '物置') || (!res && rnd() < 0.2)) {
    for (const shX of [sx(g0 - 1.5), sx(g1 + 1.6)]) {
      const c = localToWorld(F.base, shX, 0, 1.4);
      const corners = [[-1, 0.9], [1, 0.9], [1, 1.9], [-1, 1.9]].map(([x, z]) => { const w = localToWorld(F.base, shX + x, 0, z); return [w.x, w.z]; });
      if (corners.some(p => pointInPoly(p[0], p[1], it.ptsUse)) || it.gapWall < 2.2) continue;
      BB.add(box(1.8, 1.9, 0.95), m.metal, M(c.x, 0.95, c.z, F.rot));
      BB.add(box(1.9, 0.06, 1.05), m.frameDark, M(c.x, 1.93, c.z, F.rot));
      addLocalBox(F.base, shX - 0.9, shX + 0.9, 0.92, 1.88, 1.9);
      lot.points.shed = localToWorld(F.base, shX, 0.9, 0.55);
      break;
    }
    if (!lot.points.shed && res && res.okihai === '物置') {
      // 置き場がなければ玄関の横に小さな物置
      const p = [door.dp[0] + door.nf[0] * 0.9 - door.d[0] * 1.6, door.dp[1] + door.nf[1] * 0.9 - door.d[1] * 1.6];
      BB.add(box(1.2, 1.5, 0.7), m.metal, M(p[0], 0.75, p[1], rotOf(door.nf)));
      lot.points.shed = new THREE.Vector3(p[0] + door.nf[0] * 0.7, 0.9, p[1] + door.nf[1] * 0.7);
    }
  }
  // 植木
  if (rnd() < 0.6 && !open) { const p = localToWorld(F.base, sx(g1 + 1.4), 0, 0.9); if (special) I.add('shrub_02', M(p.x, 0, p.z, rnd() * 6, 1, 1, 1), 'shrub_02_b'); else bush(p.x, p.z, 1); }
  if (special && rnd() < 0.7) I.add('planter_box_01', M(door.dp[0] + door.nf[0] * 0.4 + door.d[0] * 1.1, 0, door.dp[1] + door.nf[1] * 0.4 + door.d[1] * 1.1, rotOf(door.nf)));
  lot.points.front = frontPoint(L, sMid);
  lot.cx = F.o[0]; lot.cz = F.o[1];
}
// 車を停める場所（道路の、その家の側の車線）
function frontPoint(L, s) {
  const at = atS(L.e, s);
  const p = V.add(at.p, V.mul(V.left(at.d), L.side * (L.e.ow ? 0 : L.e.w / 4)));
  return new THREE.Vector3(p[0], 0, p[1]);
}
// 塀のない敷地（一般のアパート・店）：入口の目印だけ
function makeOpenLot(root, lot, L) {
  const it = L.it;
  const sMid = Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s));
  const F = lotFrame(L, sMid);
  lot.base = F.base; lot.rot = F.rot;
  const gateP = F.o;
  const door = frontDoor(lot, L, gateP, false);
  lot.points.door = new THREE.Vector3(door.dp[0] + door.nf[0] * 1.1, 1.2, door.dp[1] + door.nf[1] * 1.1);
  lot.points.intercom = lot.points.door;
  lot.points.porch = new THREE.Vector3(door.dp[0] + door.nf[0] * 0.65 + door.d[0] * 0.6, 0.3, door.dp[1] + door.nf[1] * 0.65 + door.d[1] * 0.6);
  lot.points.front = frontPoint(L, sMid);
  lot.cx = F.o[0]; lot.cz = F.o[1];
  if (it.shopName && lot.kind === 'store') storeSign(lot, door, it.shopName, '#3b5a7a');
}
function storeSign(lot, door, name, color) {
  const mat = signMaterial(name, color);
  const w = 4.2;
  const p = [door.dp[0] + door.nf[0] * 0.08, door.dp[1] + door.nf[1] * 0.08];
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.156), mat);
  s.position.set(p[0], 3.0, p[1]); s.rotation.y = rotOf(door.nf); T.dynamic.push(s);
}
// 店舗併用住宅（1階が店）
function makeShopLot(root, lot, L) {
  const it = L.it, m = MATS.m;
  const sMid = Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s));
  const F = lotFrame(L, sMid);
  lot.base = F.base; lot.rot = F.rot;
  const door = frontDoor(lot, L, F.o, false);
  const conbini = lot.kind === 'conbini';
  // 店先のガラスと日よけ・看板
  const pts = it.ptsUse;
  let bi = 0, best = -1;
  for (let i = 0; i < pts.length; i++) { const sc = V.len(V.sub(pts[(i + 1) % pts.length], pts[i])) * Math.max(0, -V.dot(edgeNormal(pts, i), it.n)); if (sc > best) { best = sc; bi = i; } }
  const a = pts[bi], b = pts[(bi + 1) % pts.length], nf = edgeNormal(pts, bi), len = V.len(V.sub(b, a)), mid = V.mul(V.add(a, b), 0.5);
  const gw = Math.max(2, len - 1.2), r = rotOf(nf);
  BB.add(winUV(new THREE.PlaneGeometry(gw, 2.3), 7), MATS.winLit, M(mid[0] + nf[0] * 0.04, 1.55, mid[1] + nf[1] * 0.04, r), { noShadow: true });
  const color = conbini ? '#2f7d4f' : it.shopColor || '#5b4632';
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(gw, 8), Math.min(gw, 8) * 0.156), signMaterial(it.shopName || 'お店', color));
  sign.position.set(mid[0] + nf[0] * 0.1, conbini ? 3.4 : 3.05, mid[1] + nf[1] * 0.1); sign.rotation.y = r; T.dynamic.push(sign);
  if (!conbini) {
    const aw = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25), roughness: 0.9, side: THREE.DoubleSide });
    const g = new THREE.PlaneGeometry(gw, 1.1); g.rotateX(-Math.PI / 2 + 0.45);
    BB.add(g, aw, M(mid[0] + nf[0] * 0.5, 2.7, mid[1] + nf[1] * 0.5, r));
  }
  // 自販機
  const vp = [a[0] + (b[0] - a[0]) * 0.08 + nf[0] * 0.6, a[1] + (b[1] - a[1]) * 0.08 + nf[1] * 0.6];
  vending(vp, r);
  lot.points.door = new THREE.Vector3(mid[0] + nf[0] * 1.0, 1.2, mid[1] + nf[1] * 1.0);
  lot.points.intercom = lot.points.door;
  lot.points.porch = new THREE.Vector3(mid[0] + nf[0] * 0.7 + (b[0] - a[0]) / len * 1.2, 0.05, mid[1] + nf[1] * 0.7 + (b[1] - a[1]) / len * 1.2);
  lot.points.front = frontPoint(L, sMid);
  lot.doorN = nf;
  lot.cx = mid[0]; lot.cz = mid[1];
  void door; void m;
}
let vendMat = null;
function vending(p, r) {
  const m = MATS.m;
  if (!vendMat) {
    vendMat = new THREE.MeshStandardMaterial({
      map: textTexture(256, 300, (c, w, h) => {
        c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h);
        const cols = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#e67e22', '#8e44ad', '#34495e', '#d35400'];
        for (let rr = 0; rr < 3; rr++) for (let k = 0; k < 6; k++) { c.fillStyle = cols[(rr * 3 + k) % cols.length]; c.fillRect(12 + k * 40, 20 + rr * 92, 28, 60); c.fillStyle = '#333'; c.fillRect(12 + k * 40, 84 + rr * 92, 28, 6); }
      }), emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.3,
    });
    vendMat.emissiveMap = vendMat.map;
  }
  BB.add(box(1.0, 1.83, 0.7), m.white, M(p[0], 0.915, p[1], r));
  const fr = new THREE.Matrix4().copy(M(p[0], 0, p[1], r)).multiply(M(0, 1.25, 0.351));
  BB.add(new THREE.PlaneGeometry(0.86, 1.0), vendMat, fr, { noShadow: true });
  addPoly([[-0.5, -0.35], [0.5, -0.35], [0.5, 0.35], [-0.5, 0.35]].map(([x, z]) => { const w = localToWorld(M(p[0], 0, p[1], r), x, 0, z); return [w.x, w.z]; }), 1.8);
}
// マンション（オートロック・宅配ロッカー・集合ポスト）
function makeMansionLot(root, lot, L) {
  const it = L.it, m = MATS.m;
  const sMid = Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s));
  const F = lotFrame(L, sMid);
  lot.base = F.base; lot.rot = F.rot; lot.name = 'グランあおば';
  const door = frontDoor(lot, L, F.o, false);
  const { dp, nf, d } = door;
  const base = new THREE.Matrix4().makeRotationY(Math.atan2(-nf[0], -nf[1])).setPosition(dp[0], 0, dp[1]); // ローカル -z が外
  const Lc = (geo, mat, x, y, z, opts, ry = 0) => BB.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  // エントランスの庇とガラス
  Lc(box(5, 0.25, 2.6), m.concrete, 0, 3.0, -1.3);
  Lc(winUV(new THREE.PlaneGeometry(3.2, 2.4), 7), MATS.winMat, 0, 1.25, -0.03, { noShadow: true }, Math.PI);
  // 操作盤
  Lc(box(0.35, 1.25, 0.25), m.frameDark, -2.2, 0.62, -1.4);
  addLocalBox(base, -2.4, -2.0, -1.55, -1.25, 1.3);
  lot.points.intercom = localToWorld(base, -2.2, 1.1, -2.0);
  // 宅配ロッカーと集合ポスト（建物の壁ぞい）
  Lc(box(2.4, 1.9, 0.5), m.metalBlue, -4.4, 0.95, -0.3);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) Lc(box(0.52, 0.55, 0.02), m.frame, -5.25 + c * 0.57, 0.4 + r * 0.6, -0.56);
  lot.points.box = localToWorld(base, -4.4, 1.0, -1.1);
  Lc(box(2.0, 1.2, 0.4), m.frame, 3.8, 0.9, -0.25);
  lot.points.mailbox = localToWorld(base, 3.8, 1.0, -1.0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), signMaterialStatic('グランあおば'));
  sign.position.copy(localToWorld(base, 0, 3.4, -0.02)); sign.rotation.y = Math.atan2(nf[0], nf[1]); T.dynamic.push(sign);
  lot.points.door = lot.points.intercom;
  lot.points.porch = localToWorld(base, -1.0, 0.05, -1.6);
  lot.points.front = frontPoint(L, sMid);
  lot.cx = dp[0]; lot.cz = dp[1];
  void d;
}
// アパート（2階建て・外廊下・外階段）：建物を道路に向けた長方形として作り直す
function makeApartLot(root, lot, L) {
  const it = L.it, m = MATS.m, o = it.o;
  lot.name = 'メゾンあおば';
  // ローカル：x が長辺、-z が道路側
  const toRoad = V.mul(it.n, -1);
  let vx = o.u; if (V.dot([vx[1], -vx[0]], toRoad) < 0) vx = [-vx[0], -vx[1]];
  // ローカル -z = toRoad になる回転
  const rot = Math.atan2(-toRoad[0], -toRoad[1]);
  const base = new THREE.Matrix4().makeRotationY(rot).setPosition(o.cx, 0, o.cz);
  const LX = o.L, WZ = o.W, z0 = -WZ / 2;
  const Lc = (geo, mat, x, y, z, ry = 0, opts) => BB.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  lot.base = base; lot.rot = rot;
  // 2階の外廊下と柱
  Lc(box(LX, 0.2, 1.4), m.concrete, 0, 2.9, z0 - 0.7);
  Lc(box(LX, 1.0, 0.08), m.siding, 0, 3.5, z0 - 1.38);
  for (let k = 0; k <= 3; k++) { const x = -LX / 2 + 0.2 + k * (LX - 0.4) / 3; Lc(box(0.2, 2.9, 0.2), m.concrete, x, 1.45, z0 - 1.3); addLocalBox(base, x - 0.1, x + 0.1, z0 - 1.4, z0 - 1.2, 3); }
  // 外階段（右端、道路と平行に下りる）
  for (let k = 0; k < 14; k++) Lc(box(1.0, 0.18, 0.28), m.concrete, LX / 2 + 0.6, 0.1 + k * 0.205, z0 + 5.4 - k * 0.42);
  Lc(box(0.05, 1.0, 6.2), m.frame, LX / 2 + 1.15, 2.0, z0 + 2.4);
  // 部屋（1フロア4戸）
  const rooms = [];
  const per = 4, sp = (LX - 2) / per;
  for (let f = 0; f < 2; f++) for (let r = 0; r < per; r++) {
    const room = `${f + 1}0${r + 1}`, x = -LX / 2 + 1 + sp * (r + 0.35), y = f * 3;
    Lc(box(0.9, 2.0, 0.06), m.metalBlue, x, y + 1.0 + (f ? 0.2 : 0), z0 - 0.03);
    Lc(box(0.6, 1.3, 0.08), m.frameDark, x + 1.2, y + 0.85 + (f ? 0.2 : 0), z0 - 0.04);
    const pg = PL.plane(0.22, 0.11, nameDraw(room));
    BB.add(pg.g, pg.m, base.clone().multiply(M(x - 0.65, y + 1.6 + (f ? 0.2 : 0), z0 - 0.05, Math.PI)), { noShadow: true });
    const yy = f ? 3.0 : 0;
    rooms.push({
      room, floor: f,
      door: localToWorld(base, x, yy + 1.2, z0 - (f ? 0.8 : 1.0)),
      intercom: localToWorld(base, x - 0.65, yy + 1.2, z0 - (f ? 0.8 : 1.0)),
      meter: localToWorld(base, x + 1.2, yy + 0.9, z0 - (f ? 0.8 : 0.9)),
      porch: localToWorld(base, x + 0.4, yy + 0.05, z0 - 0.5),
    });
  }
  lot.rooms = rooms;
  lot.points.stairs = localToWorld(base, LX / 2 + 0.6, 0.5, z0 + 6.1);
  lot.points.stairsTop = localToWorld(base, LX / 2 - 0.8, 3.0, z0 - 0.7);
  lot.corridorZone = { cx: o.cx, cz: o.cz, rot, x0: -LX / 2 + 0.15, x1: LX / 2 - 0.3, z0: z0 - 1.25, z1: z0 - 0.15 };
  // 集合ポストと看板（道路側）
  const F = lotFrame(L, Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s)));
  const mp = localToWorld(F.base, -2, 0, 0.6);
  BB.add(box(1.6, 1.1, 0.35), m.frame, M(mp.x, 0.75, mp.z, F.rot));
  addLocalBox(F.base, -2.8, -1.2, 0.4, 0.8, 1.3);
  lot.points.mailbox = localToWorld(F.base, -2, 1.0, -0.1);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), signMaterialStatic('メゾンあおば'));
  sign.position.copy(localToWorld(F.base, -2, 1.6, 0.42)); sign.rotation.y = F.rot + Math.PI; T.dynamic.push(sign);
  lot.points.front = frontPoint(L, Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s)));
  lot.cx = o.cx; lot.cz = o.cz;
  void vx; void root;
}

// ---------------- 電柱・電線・街灯 ----------------
function buildPoles(root) {
  const m = MATS.m;
  const poleGeo = new THREE.CylinderGeometry(0.13, 0.2, 11, 10);
  const lines = [];
  const lampHead = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, emissive: 0xfff1d0, emissiveIntensity: 0 });
  T.lampMats.push({ mat: lampHead, on: 2.5 });
  for (const e of T.edges) {
    const [ra, rb] = clearRange(e, 2, 2);
    if (rb - ra < 12) continue;
    if (e.rank <= 2) {
      let prev = null, k = 0;
      for (let s = ra; s <= rb; s += 27) {
        const at = atS(e, s), n = V.left(at.d);
        const p = V.add(at.p, V.mul(n, e.w / 2 + 0.22));
        if (T.colliders.length && queryColliders(p[0], p[1], 0.3).some(c => c.h > 2 && pointInPoly(p[0], p[1], c.pts))) { prev = null; continue; }
        BB.add(poleGeo, m.poleConcrete, M(p[0], 5.5, p[1]));
        const r = rotOf(at.d);
        BB.add(box(1.8, 0.1, 0.1), m.frameDark, M(p[0], 9.8, p[1], r + Math.PI / 2));
        BB.add(box(1.2, 0.08, 0.08), m.frameDark, M(p[0], 8.6, p[1], r + Math.PI / 2));
        if (k++ % 3 === 1) BB.add(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10), m.frame, M(p[0] - n[0] * 0.45, 7.6, p[1] - n[1] * 0.45));
        addCircle(p[0], p[1], 0.25);
        if (prev) for (const [h, dx] of [[9.85, -0.8], [9.85, 0.8], [8.65, -0.5], [8.65, 0.5]]) {
          const off = (q) => [q[0] + n[0] * dx, q[1] + n[1] * dx];
          const a = off(prev), b = off(p);
          for (let i = 0; i < 8; i++) {
            const t0 = i / 8, t1 = (i + 1) / 8, sag = (t) => 0.45 * Math.sin(Math.PI * t);
            lines.push(a[0] + (b[0] - a[0]) * t0, h - sag(t0), a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, h - sag(t1), a[1] + (b[1] - a[1]) * t1);
          }
        }
        prev = p;
      }
    } else {
      let side = 1;
      for (let s = ra + 6; s <= rb - 4; s += 32) {
        const at = atS(e, s), n = V.mul(V.left(at.d), side);
        const p = V.add(at.p, V.mul(n, e.w / 2 + 1.6));
        BB.add(new THREE.CylinderGeometry(0.08, 0.12, 8, 8), m.frame, M(p[0], 4, p[1]));
        const arm = V.sub(p, V.mul(n, 0.8));
        BB.add(box(0.08, 0.08, 1.6), m.frame, M(arm[0], 7.95, arm[1], rotOf(n)));
        const hp = V.sub(p, V.mul(n, 1.55));
        BB.add(box(0.5, 0.14, 0.28), lampHead, M(hp[0], 7.85, hp[1], rotOf(n)), { noShadow: true });
        addCircle(p[0], p[1], 0.2);
        side = -side;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  root.add(new THREE.LineSegments(g, m.wire));
}

// ---------------- 信号機 ----------------
// 地図の信号の位置を近くの交差点に寄せ、近い交差点どうしは1つの信号群にする
let CLUSTERS = [];
function markSignals() {
  const sigPts = T.data.signals.slice();
  for (const e of T.edges) for (const p of e.sigPts) sigPts.push(p);
  for (const n of T.nodes) if (n.sig) sigPts.push([n.x, n.z]);
  const marked = new Set();
  for (const p of sigPts) {
    let best = null, bd = 35;
    for (const n of T.nodes) { if (n.ends.length < 3) continue; const d = Math.hypot(n.x - p[0], n.z - p[1]); if (d < bd) { bd = d; best = n; } }
    if (best) marked.add(best);
  }
  // 近い交差点（中央分離帯で分かれた道）をまとめる
  const clusters = [];
  for (const n of marked) {
    let c = clusters.find(cl => cl.nodes.some(o => Math.hypot(o.x - n.x, o.z - n.z) < 28));
    if (!c) { c = { nodes: [] }; clusters.push(c); }
    c.nodes.push(n);
  }
  for (const c of clusters) for (const n of c.nodes) n.signal = true;
  CLUSTERS = clusters;
}
function buildSignals(root) {
  const clusters = CLUSTERS;
  const lampGeo = new THREE.CircleGeometry(0.13, 20);
  const mk = (c) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0, roughness: 0.3 });
  clusters.forEach((cl, idx) => {
    const set = new Set(cl.nodes);
    for (const n of cl.nodes) n.signal = true;
    const cx = cl.nodes.reduce((a, n) => a + n.x, 0) / cl.nodes.length, cz = cl.nodes.reduce((a, n) => a + n.z, 0) / cl.nodes.length;
    // 外から入ってくる道（中の辺は除く）
    const approaches = [];
    let main = null;
    for (const n of cl.nodes) for (const { e, end } of n.ends) {
      const other = T.nodes[end === 'a' ? e.b : e.a];
      if (set.has(other)) continue;
      if (e.ow && end === 'a') continue; // 一方通行で出ていく道
      const s = end === 'a' ? n.R + 1.6 : e.len - n.R - 1.6;
      if (s < 1 || s > e.len - 1) continue;
      const at = atS(e, s), d = end === 'a' ? [-at.d[0], -at.d[1]] : at.d;
      const ap = { e, end, node: n, d, stop: { x: at.p[0], z: at.p[1] }, half: e.w / 2, group: 'A' };
      approaches.push(ap);
      if (!main || e.rank > main.e.rank || (e.rank === main.e.rank && e.w > main.e.w)) main = ap;
    }
    if (!approaches.length) return;
    for (const ap of approaches) ap.group = Math.abs(V.dot(ap.d, main.d)) > 0.6 ? 'A' : 'B';
    const mats = { A: { g: mk(0x30d0b0), y: mk(0xffb020), r: mk(0xff3020) }, B: { g: mk(0x30d0b0), y: mk(0xffb020), r: mk(0xff3020) } };
    for (const ap of approaches) {
      const { d, e } = ap, left = V.left(d);
      // 停止線（左側の車線だけ）
      const half = e.ow ? e.w : e.w / 2;
      const c = V.add([ap.stop.x, ap.stop.z], V.mul(left, e.ow ? 0 : half / 2));
      BB.add(box(half - 0.3, 0.01, 0.45), MATS.m.lineWhite, M(c[0], 0.036, c[1], rotOf(d) + Math.PI / 2), { noShadow: true });
      // 横断歩道（停止線の先）
      for (let k = -e.w / 2 + 0.5; k < e.w / 2 - 0.3; k += 0.9) {
        const p = V.add(V.add([ap.stop.x, ap.stop.z], V.mul(d, 2.6)), V.mul(left, k + 0.22));
        BB.add(box(0.45, 0.01, 3.2), MATS.m.lineWhite, M(p[0], 0.037, p[1], rotOf(d)), { noShadow: true });
      }
      ap.stopLine = [V.add([ap.stop.x, ap.stop.z], V.mul(left, e.ow ? -e.w / 2 : 0)), V.add([ap.stop.x, ap.stop.z], V.mul(left, half))];
      // 信号機：交差点の向こう側の左に柱、腕を車線の上へ
      const far = V.add([cx, cz], V.mul(d, Math.max(8, Math.hypot(cx - ap.stop.x, cz - ap.stop.z) * 0.9)));
      const pole = V.add(far, V.mul(left, e.w / 2 + 1.0 + (hasSidewalk(e) ? 1.2 : 0)));
      const ph = 5.6;
      const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, ph, 10), A.mats.frame); pm.position.set(pole[0], ph / 2, pole[1]); pm.castShadow = true; root.add(pm);
      addCircle(pole[0], pole[1], 0.2);
      const reach = e.w / 2 + 0.6;
      const armMid = V.sub(pole, V.mul(left, reach / 2));
      const arm = new THREE.Mesh(box(0.1, 0.1, reach), A.mats.frame); arm.position.set(armMid[0], 5.5, armMid[1]); arm.rotation.y = rotOf(left); root.add(arm);
      const hp = V.sub(pole, V.mul(left, reach - 0.2));
      const g = new THREE.Group();
      const b = new THREE.Mesh(box(1.25, 0.42, 0.25), A.mats.frame); g.add(b); b.castShadow = true;
      ['g', 'y', 'r'].forEach((k, i) => {
        const l = new THREE.Mesh(lampGeo, mats[ap.group][k]); l.position.set(-0.4 + i * 0.4, 0, 0.13); g.add(l);
        const hood = new THREE.Mesh(box(0.34, 0.04, 0.16), A.mats.frame); hood.position.set(-0.4 + i * 0.4, 0.16, 0.2); g.add(hood);
      });
      // 表（+z）を向かってくる車へ。左から青・黄・赤（運転手から見て）
      g.position.set(hp[0], 5.3, hp[1]); g.rotation.y = Math.atan2(-d[0], -d[1]);
      root.add(g);
    }
    T.signals.push({ x: cx, z: cz, nodes: cl.nodes, approaches, mats, offset: idx * 7, state: { A: 'g', B: 'r' } });
  });
}

// ---------------- 地図の端 ----------------
function buildBoundary(root) {
  const [x0, z0, x1, z1] = T.bounds, p = 4;
  addBox(x0 - p - 2, x0 - p, z0 - p, z1 + p, 3); addBox(x1 + p, x1 + p + 2, z0 - p, z1 + p, 3);
  addBox(x0 - p, x1 + p, z0 - p - 2, z0 - p, 3); addBox(x0 - p, x1 + p, z1 + p, z1 + p + 2, 3);
  // 道路が地図の外へ出る所に通行止めの柵
  for (const e of T.edges) for (const end of ['a', 'b']) {
    const n = T.nodes[end === 'a' ? e.a : e.b];
    if (n.ends.length !== 1) continue;
    if (n.x > x0 + 8 && n.x < x1 - 8 && n.z > z0 + 8 && n.z < z1 - 8) continue;
    const at = end === 'a' ? atS(e, 2) : atS(e, e.len - 2);
    const l = V.left(at.d);
    // 黄色と黒の通行止めの柵
    const P = props(), c0 = at.p, r = rotOf(at.d) + Math.PI / 2;
    BB.add(box(e.w + 0.6, 0.25, 0.08), P.stripe, M(c0[0], 0.85, c0[1], r));
    for (const k of [-e.w / 2, e.w / 2]) { const q = V.add(c0, V.mul(l, k)); BB.add(box(0.1, 1.0, 0.1), MATS.m.frame, M(q[0], 0.5, q[1], r)); }
    addWallCollider(V.add(at.p, V.mul(l, -e.w / 2 - 0.5)), V.add(at.p, V.mul(l, e.w / 2 + 0.5)), 0.6, 1);
  }
}

// 時刻による明かり（窓・看板・街灯）
export function updateLights(hour) {
  const dark = Math.max(0, Math.min(1, (hour - 17.3) / 1.4));
  for (const l of T.lampMats) l.mat.emissiveIntensity = l.on * dark;
  return dark;
}

// ほかのモジュール用：辺の上の点と向き
export function edgeAt(e, s) { return atS(e, s); }
