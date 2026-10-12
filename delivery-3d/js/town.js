// あおば町のワールド：実在する地方都市（OpenStreetMap の地図データ）をもとに、
// 広い範囲の道路網・建物を「近くは細かく、遠くは簡単に」作りながら走れるようにする。
// 地図データ © OpenStreetMap contributors（ODbL）。町名・住所・人や店の名前は架空。
import * as THREE from 'three';
import { A, box, Batch, Instancer, model, textTexture, JP_FONT } from './assets.js';
import { RESIDENTS, EXTRA_SURNAMES } from './data.js';
import { initHouseKit, houseLampMats, buildDetachedHouse, buildApartment, buildMansion, buildShop, buildWarehouse, buildLOD, acUnit, seeded } from './house.js';

export const T = {
  data: null, tiles: new Map(), lots: {}, lotList: [], signals: [], depot: null,
  nodes: [], edges: [], lampMats: [], bounds: null, plans: [], areas: [], water: [], buildingsMap: [], root: null,
  stats: { near: 0, far: 0, queue: 0 },
};
const NEAR = 260, FAR = 1300, UNLOAD_NEAR = 380, UNLOAD_FAR = 1500;

// ---------------- 読み込み ----------------
export async function loadTownData(onProgress) {
  const r = await fetch('assets/world/world.json');
  if (!r.ok) throw new Error('world.json: ' + r.status);
  const w = await r.json();
  T.data = w;
  const list = w.tiles;
  let done = 0;
  const tileData = {};
  const one = async (key) => {
    const res = await fetch(`assets/world/tiles/t_${key}.json`);
    tileData[key] = res.ok ? await res.json() : { b: [], a: [], w: [], p: [] };
    onProgress && onProgress(++done / list.length);
  };
  for (let i = 0; i < list.length; i += 12) await Promise.all(list.slice(i, i + 12).map(one));
  T.tileData = tileData;
}

// ---------------- 乱数 ----------------
let rngState = 12345;
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

// ---------------- 2次元の小道具（[x, z]） ----------------
const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]], add: (a, b) => [a[0] + b[0], a[1] + b[1]], mul: (a, k) => [a[0] * k, a[1] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1], len: (a) => Math.hypot(a[0], a[1]),
  norm: (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }, left: (d) => [d[1], -d[0]],
};
function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function centroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }
function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside; }
  return inside;
}
function closestOnSeg(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2));
  return { x: a[0] + dx * t, z: a[1] + dz * t, t };
}
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
  if (!best) { const c = centroid(pts); return { cx: c[0], cz: c[1], u: [1, 0], v: [0, 1], L: 1, W: 1, area: 1 }; }
  const { u, v, u0, u1, v0, v1 } = best;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { cx: u[0] * cu + v[0] * cv, cz: u[1] * cu + v[1] * cv, u, v, L: u1 - u0, W: v1 - v0, area: best.area };
}
function edgeNormal(pts, i) {
  const a = pts[i], b = pts[(i + 1) % pts.length], d = V.norm(V.sub(b, a));
  let n = [d[1], -d[0]];
  const m = [(a[0] + b[0]) / 2 + n[0] * 0.05, (a[1] + b[1]) / 2 + n[1] * 0.05];
  if (pointInPoly(m[0], m[1], pts)) n = [-n[0], -n[1]];
  return n;
}
function M(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) { const m = new THREE.Matrix4().makeRotationY(ry); m.scale(new THREE.Vector3(sx, sy, sz)); m.setPosition(x, y, z); return m; }
const rotOf = (d) => Math.atan2(d[0], d[1]);
function localToWorld(base, x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(base); }
function polysOverlap(a, b) { for (const p of a) if (pointInPoly(p[0], p[1], b)) return true; for (const p of b) if (pointInPoly(p[0], p[1], a)) return true; return false; }
function rectPts(o, u, v, x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [o[0] + u[0] * x + v[0] * z, o[1] + u[1] * x + v[1] * z]); }

// ---------------- 空間の索引（追加と削除ができる） ----------------
class Grid {
  constructor(cell) { this.c = cell; this.m = new Map(); }
  key(i, j) { return (i + 4096) * 8192 + (j + 4096); }
  insert(item, x0, z0, x1, z1) {
    const c = this.c; item._cells = [];
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
      const k = this.key(i, j); let a = this.m.get(k); if (!a) { a = []; this.m.set(k, a); } a.push(item); item._cells.push(k);
    }
  }
  remove(item) { for (const k of item._cells || []) { const a = this.m.get(k); if (!a) continue; const i = a.indexOf(item); if (i >= 0) a.splice(i, 1); } item._cells = null; }
  query(x, z, r) {
    const c = this.c, out = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) { const a = this.m.get(this.key(i, j)); if (a) for (const it of a) out.add(it); }
    return out;
  }
}
let CG = null, EG = null; // 当たり判定・道路
let CUR = null; // いま作っているタイル（当たり判定をタイルに記録して、破棄のときに外す）
function track(item) { if (CUR) CUR.colliders.push(item); }
function addPoly(pts, h = 3) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
  const c = { pts, h, x0, z0, x1, z1 }; CG.insert(c, x0, z0, x1, z1); track(c); return c;
}
function addWallCollider(a, b, t, h) { const d = V.norm(V.sub(b, a)), n = [d[1] * t / 2, -d[0] * t / 2]; addPoly([V.add(a, n), V.add(b, n), V.sub(b, n), V.sub(a, n)], h); }
function addBox(x0, x1, z0, z1, h = 3) { addPoly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h); }
function addLocalBox(base, x0, x1, z0, z1, h = 3) { addPoly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => { const v = localToWorld(base, x, 0, z); return [v.x, v.z]; }), h); }
function addCircle(x, z, r) { const c = { x, z, r, circle: true }; CG.insert(c, x - r, z - r, x + r, z + r); track(c); }

export function queryColliders(x, z, r) {
  const out = [];
  for (const c of CG.query(x, z, r)) if (!c.circle && x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) out.push(c);
  return out;
}
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
    for (let i = 0; i < pts.length; i++) { const q = closestOnSeg(p.x, p.z, pts[i], pts[(i + 1) % pts.length]); const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < best) { best = d; bx = q.x; bz = q.z; } }
    if (pointInPoly(p.x, p.z, pts)) { const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz) || 1e-6; p.x = bx + dx / d * r; p.z = bz + dz / d * r; hit = Math.max(hit, best + r); }
    else if (best < r && best > 1e-6) { const dx = p.x - bx, dz = p.z - bz; p.x = bx + dx / best * r; p.z = bz + dz / best * r; hit = Math.max(hit, r - best); }
  }
  return hit;
}

// ---------------- 形の部品 ----------------
function offsetLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const d0 = i > 0 ? V.norm(V.sub(p, pts[i - 1])) : null, d1 = i < pts.length - 1 ? V.norm(V.sub(pts[i + 1], p)) : null;
    let n;
    if (d0 && d1) { const l0 = V.left(d0), l1 = V.left(d1); n = V.norm(V.add(l0, l1)); const k = Math.max(0.5, V.dot(n, l1)); n = V.mul(n, 1 / k); }
    else n = V.left(d0 || d1);
    out.push([p[0] + n[0] * off, p[1] + n[1] * off]);
  }
  return out;
}
function ribbon(pts, w, y = 0, off = 0) {
  const L = offsetLine(pts, off - w / 2), R = offsetLine(pts, off + w / 2);
  const pos = [], uv = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = L[i], b = L[i + 1], c = R[i + 1], d = R[i];
    const tri = (p, q, r) => { const cr = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); for (const v of (cr < 0 ? [p, q, r] : [p, r, q])) { pos.push(v[0], y, v[1]); uv.push(v[0], -v[1]); } };
    tri(a, b, c); tri(a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  return g;
}
function polyFill(pts, y) { const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1]))); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; }
// 輪郭をそのまま立ち上げた壁（大きなビル用）
function wallsGeo(pts, y0, y1) {
  const pos = [], uv = [], nor = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = edgeNormal(pts, i), L = V.len(V.sub(b, a));
    const quad = [[a, y0, s], [b, y0, s + L], [b, y1, s + L], [a, y1, s]];
    const e1 = [b[0] - a[0], 0, b[1] - a[1]], cx = -e1[2] * (y1 - y0), cz = e1[0] * (y1 - y0);
    const order = cx * n[0] + cz * n[1] < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const k of order) { const [p, y, u] = quad[k]; pos.push(p[0], y, p[1]); uv.push(u, y); nor.push(n[0], 0, n[1]); }
    s += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// ---------------- 表札などの小さな板（タイルごとに画像をまとめる） ----------------
class Plates {
  constructor() { this.pages = []; this.cw = 128; this.ch = 64; this.size = 1024; }
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
    p.ctx.save(); p.ctx.translate(x, y); p.ctx.beginPath(); p.ctx.rect(0, 0, this.cw, this.ch); p.ctx.clip(); draw(p.ctx, this.cw, this.ch); p.ctx.restore();
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    const u0 = x / this.size, u1 = (x + this.cw) / this.size, v1 = 1 - y / this.size, v0 = 1 - (y + this.ch) / this.size;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    p.tex.needsUpdate = true;
    return { g, m: p.mat };
  }
  dispose() { for (const p of this.pages) { p.tex.dispose(); p.mat.dispose(); } this.pages = []; }
}
const nameDraw = (text) => (c, w, h) => { c.fillStyle = '#ece6d8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8c8270'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4); c.fillStyle = '#1f1f1f'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${text.length > 3 ? 26 : 34}px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 1); };
const addrDraw = (text) => (c, w, h) => { c.fillStyle = '#20508a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold 20px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 1); };
const signCache = new Map();
function signMaterial(text, bg, fg = '#fff', w = 1024, h = 160) {
  const key = text + bg;
  if (signCache.has(key)) return signCache.get(key);
  const mat = new THREE.MeshStandardMaterial({
    map: textTexture(w, h, (c) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = `bold ${Math.round(h * 0.55)}px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2); }),
    roughness: 0.45, emissive: 0xffffff, emissiveIntensity: 0,
  });
  mat.emissiveMap = mat.map; T.lampMats.push({ mat, on: 0.55 }); signCache.set(key, mat);
  return mat;
}
function signMaterialStatic(text) {
  if (signCache.has('s:' + text)) return signCache.get('s:' + text);
  const m = new THREE.MeshStandardMaterial({ map: textTexture(256, 64, (c, w, h) => { c.fillStyle = '#e9e4d8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8c8270'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4); c.fillStyle = '#222'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold 36px ${JP_FONT}`; c.fillText(text, w / 2, h / 2 + 2); }), roughness: 0.5 });
  signCache.set('s:' + text, m); return m;
}

// =========================================================
// 道路網（ワールド全体）
// =========================================================
const RANK = { motorway: 5, trunk: 4, primary: 4, secondary: 4, tertiary: 3, unclassified: 2, residential: 1, living_street: 1, service: 0 };
const tileKeyOf = (x, z) => { const [x0, z0] = T.bounds, t = T.data.meta.tile; return `${Math.min(T.data.meta.ni - 1, Math.max(0, Math.floor((x - x0) / t)))}_${Math.min(T.data.meta.nj - 1, Math.max(0, Math.floor((z - z0) / t)))}`; };
export { tileKeyOf };
function buildGraph() {
  const d = T.data;
  T.nodes = d.nodes.map(([x, z, sig], id) => ({ id, x, z, sig: !!sig, ends: [], R: 3 }));
  T.edges = d.edges.map((e, id) => {
    const pts = e.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + V.len(V.sub(pts[i], pts[i - 1])));
    const rank = RANK[e.cls] ?? 1, ms = parseInt(e.ms, 10);
    // タイルごとの区間（線の各部分を、中点のタイルに割り当てる）
    const runs = new Map();
    let curKey = null, s0 = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const k = tileKeyOf((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      if (k !== curKey) { if (curKey !== null) { if (!runs.has(curKey)) runs.set(curKey, []); runs.get(curKey).push([s0, cum[i]]); } curKey = k; s0 = cum[i]; }
    }
    if (!runs.has(curKey)) runs.set(curKey, []); runs.get(curKey).push([s0, cum[cum.length - 1]]);
    return { id, a: e.a, b: e.b, pts, cum, len: cum[cum.length - 1], cls: e.cls, rank, w: e.w, ow: e.ow, name: e.name || '', br: !!e.br, tn: !!e.tn, layer: e.layer || 0,
      limit: isFinite(ms) ? ms : rank >= 4 ? 50 : rank >= 3 ? 40 : 30, sigPts: e.sig || [], runs };
  });
  for (const e of T.edges) {
    T.nodes[e.a].ends.push({ e, end: 'a' }); T.nodes[e.b].ends.push({ e, end: 'b' });
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of e.pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    const pad = e.w / 2 + 4; EG.insert(e, x0 - pad, z0 - pad, x1 + pad, z1 + pad);
  }
  for (const n of T.nodes) {
    const ws = n.ends.map(x => x.e.w);
    n.R = n.ends.length >= 3 ? Math.max(...ws) / 2 + 1.2 : n.ends.length === 2 ? 0 : 0.5;
    n.maxRank = Math.max(...n.ends.map(x => x.e.rank));
    n.tile = tileKeyOf(n.x, n.z);
  }
}
function atS(e, s) {
  s = Math.max(0, Math.min(e.len, s));
  let lo = 1, hi = e.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (e.cum[mid] < s) lo = mid + 1; else hi = mid; }
  const i = lo, a = e.pts[i - 1], b = e.pts[i], L = e.cum[i] - e.cum[i - 1] || 1e-6, t = (s - e.cum[i - 1]) / L;
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: V.norm(V.sub(b, a)) };
}
export function edgeAt(e, s) { return atS(e, s); }
function subLine(e, s0, s1) {
  if (s1 - s0 < 0.05) return null;
  const out = [atS(e, s0).p];
  for (let i = 1; i < e.pts.length - 1; i++) if (e.cum[i] > s0 && e.cum[i] < s1) out.push(e.pts[i]);
  out.push(atS(e, s1).p);
  return out;
}
function clearRange(e, padA = 0, padB = 0) { return [T.nodes[e.a].R + padA, e.len - T.nodes[e.b].R - padB]; }
// 区間 [a,b] のうち、タイル key に属する部分ごとに fn(s0, s1)
function eachRun(e, key, a, b, fn) { const runs = e.runs.get(key); if (!runs) return; for (const [r0, r1] of runs) { const s0 = Math.max(a, r0), s1 = Math.min(b, r1); if (s1 - s0 > 0.05) fn(s0, s1); } }
export function nearestEdge(x, z, filter, R = 30) {
  let best = null;
  for (const e of EG.query(x, z, R)) {
    if (filter && !filter(e)) continue;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const q = closestOnSeg(x, z, e.pts[i], e.pts[i + 1]), d = Math.hypot(x - q.x, z - q.z);
      if (!best || d < best.d) { const dir = V.norm(V.sub(e.pts[i + 1], e.pts[i])); best = { e, s: e.cum[i] + (e.cum[i + 1] - e.cum[i]) * q.t, d, x: q.x, z: q.z, dir, side: V.dot(V.sub([x, z], [q.x, q.z]), V.left(dir)) >= 0 ? 1 : -1 }; }
    }
  }
  if (!best && R < 400) return nearestEdge(x, z, filter, R * 4);
  return best;
}
export function edgesNear(x, z, r) { return [...EG.query(x, z, r)]; }
export function nearestOnRoads(x, z) { const n = nearestEdge(x, z); return n ? { x: n.x, z: n.z, d: n.d, e: n.e } : null; }
// 道路網の経路（一方通行を守る、A*）
class Heap {
  constructor() { this.a = []; }
  push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; }
  get size() { return this.a.length; }
}
export function routePath(from, to) {
  const A0 = nearestEdge(from.x, from.z), B0 = nearestEdge(to.x, to.z);
  if (!A0 || !B0) return { points: [], length: Infinity };
  const start = { id: 'S', x: A0.x, z: A0.z }, goal = { id: 'G', x: B0.x, z: B0.z };
  const dist = new Map([[start, 0]]), prev = new Map(), via = new Map();
  const open = new Heap();
  const h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z) * 0.92;
  const relax = (u, v, d, line) => { const nd = dist.get(u) + d; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); via.set(v, line); open.push(v, nd + h(v)); } };
  const ea = A0.e, eb = B0.e;
  if (!ea.ow) relax(start, T.nodes[ea.a], A0.s, () => subLine(ea, 0, A0.s)?.slice().reverse());
  relax(start, T.nodes[ea.b], ea.len - A0.s, () => subLine(ea, A0.s, ea.len));
  if (ea === eb && (!ea.ow || B0.s >= A0.s)) relax(start, goal, Math.abs(B0.s - A0.s), () => B0.s >= A0.s ? subLine(ea, A0.s, B0.s) : subLine(ea, B0.s, A0.s)?.slice().reverse());
  const seen = new Set();
  let iter = 0;
  while (open.size && iter++ < 60000) {
    const u = open.pop();
    if (u === goal) break;
    if (seen.has(u)) continue; seen.add(u);
    if (u === start) continue;
    if (u.id === eb.a) relax(u, goal, B0.s, () => subLine(eb, 0, B0.s));
    if (u.id === eb.b && !eb.ow) relax(u, goal, eb.len - B0.s, () => subLine(eb, B0.s, eb.len)?.slice().reverse());
    for (const { e, end } of u.ends) {
      if (e.ow && end === 'b') continue;
      const v = T.nodes[end === 'a' ? e.b : e.a];
      relax(u, v, e.len * (e.rank <= 1 ? 1.15 : e.rank >= 3 ? 0.92 : 1), end === 'a' ? () => e.pts : () => e.pts.slice().reverse());
    }
  }
  if (!dist.has(goal)) return { points: [], length: Infinity };
  const chain = []; let n = goal;
  while (n !== start) { chain.push(via.get(n)); n = prev.get(n); }
  const pts = [{ x: A0.x, z: A0.z }];
  for (const fn of chain.reverse()) { const line = fn && fn(); if (line) for (const p of line) pts.push({ x: p[0], z: p[1] }); }
  pts.push({ x: B0.x, z: B0.z });
  let length = 0; for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { points: pts, length };
}
export function speedLimitAt(x, z) { const n = nearestEdge(x, z); if (n && n.d < n.e.w / 2 + 2) return n.e.limit; return 30; }
const hasSidewalk = (e) => e.rank >= 3;
const frontOffset = (e) => e.w / 2 + (hasSidewalk(e) ? 2.3 : 0.6);

// =========================================================
// 準備（起動時に一度）：道路網・信号・建物の役割・住民・営業所
// =========================================================
let MATS = null;
export function buildTown(scene) {
  rngState = 12345;
  CG = new Grid(16); EG = new Grid(40);
  T.bounds = T.data.bounds;
  const root = new THREE.Group(); scene.add(root); T.root = root;
  MATS = makeTownMats(A.mats);
  initHouseKit(); for (const l of houseLampMats()) T.lampMats.push(l);
  buildGraph();
  markSignals();
  buildGround(root);
  const depot = placeDepot();
  T.depot = depotInfo(depot);
  planBuildings(depot);
  planLots();
  stopInfo();
  // 地図（タブレット・ナビ）用の面
  for (const td of Object.values(T.tileData)) { for (const a of td.a) T.areas.push({ k: a.k, pts: a.p }); for (const w of td.w) T.water.push({ w: w.w, pts: w.p }); }
  for (const a of T.data.bigAreas) T.areas.push({ k: a.k, pts: a.p });
  T.buildingsMap = T.plans.map(it => it.pts);
  return root;
}
function makeTownMats(m) {
  const layer = (mat, f, u) => { mat.polygonOffset = true; mat.polygonOffsetFactor = f; mat.polygonOffsetUnits = u; return mat; };
  const grass = layer(m.grass.clone(), -0.3, -2); grass.color.multiplyScalar(0.92);
  const yard = layer(m.gravel.clone(), 0, -1); yard.color.multiplyScalar(1.08);
  const field = layer(m.soil.clone(), -0.3, -2);
  const lot = layer(m.soil.clone(), 0, -1); lot.color.lerp(new THREE.Color(0xb59a7a), 0.35);
  const paddy = layer(m.grass.clone(), -0.3, -2); paddy.color.setRGB(0.42, 0.55, 0.25);
  const pave = layer(m.asphalt.clone(), -0.5, -3);
  const roadMat = layer(m.asphalt.clone(), -1, -5);
  const roadFar = layer(new THREE.MeshStandardMaterial({ color: 0x4d4f51, roughness: 0.95 }), -1, -5);
  const concretePad = layer(m.concrete.clone(), -1.2, -7);
  m.lineWhite.polygonOffsetFactor = -2; m.lineWhite.polygonOffsetUnits = -9;
  m.lineYellow.polygonOffsetFactor = -2; m.lineYellow.polygonOffsetUnits = -9;
  layer(m.curb, -1.5, -8);
  const slatTex = textTexture(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#ffffff'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 9, h); c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5); });
  slatTex.wrapS = slatTex.wrapT = THREE.RepeatWrapping;
  const slats = new THREE.MeshStandardMaterial({ color: 0x6f6c66, map: slatTex, alphaTest: 0.5, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  const fence = new THREE.MeshStandardMaterial({ color: 0x5f7a5a, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const fenceAlu = new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.45, metalness: 0.6 });
  const water = new THREE.MeshPhysicalMaterial({ color: 0x3d4e4a, roughness: 0.05, envMapIntensity: 1.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const flatRoof = new THREE.MeshStandardMaterial({ color: 0x7d7f80, roughness: 0.9, map: m.concrete.map, normalMap: m.concrete.normalMap });
  const office = officeMaterials();
  const ballast = layer(new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1, map: m.gravel.map }), -1.1, -6);
  const rail = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.35, metalness: 0.8 });
  const sleeper = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9 });
  const leaf = m.leaf.clone(); leaf.color.multiplyScalar(0.85);
  return { m, grass, yard, field, lot, paddy, pave, roadMat, roadFar, concretePad, slats, fence, fenceAlu, water, flatRoof, office, ballast, rail, sleeper, leaf,
    stripe: new THREE.MeshStandardMaterial({ map: textTexture(128, 32, (c, w, h) => { for (let k = -2; k < 8; k++) { c.fillStyle = k % 2 ? '#1c1c1c' : '#e8c02c'; c.beginPath(); c.moveTo(k * 20, h); c.lineTo(k * 20 + 20, h); c.lineTo(k * 20 + 36, 0); c.lineTo(k * 20 + 16, 0); c.fill(); } }), roughness: 0.6 }) };
}
// 事務所ビルの外壁（窓の並び）
function officeMaterials() {
  const mk = (base, glass, band, litCol) => {
    const t = textTexture(256, 256, (c, w, h) => {
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, glass[0]); g.addColorStop(1, glass[1]);
      c.fillStyle = g;
      if (band) c.fillRect(0, h * 0.28, w, h * 0.5); else { c.fillRect(w * 0.12, h * 0.25, w * 0.76, h * 0.52); c.fillStyle = base; c.fillRect(w * 0.48, h * 0.25, w * 0.04, h * 0.52); }
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, h * 0.26, w, 3);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3.6, 1 / 3.4);
    const lit = textTexture(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = litCol; if (band) c.fillRect(0, h * 0.28, w, h * 0.5); else c.fillRect(w * 0.12, h * 0.25, w * 0.76, h * 0.52); });
    lit.wrapS = lit.wrapT = THREE.RepeatWrapping; lit.repeat.copy(t.repeat);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.2, emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 0 });
    T.lampMats.push({ mat, on: 0.5 });
    return mat;
  };
  return [mk('#d9d4ca', ['#8ea5b3', '#2e3c46'], false, '#f2e2bc'), mk('#bdb6ab', ['#6f8796', '#26313a'], true, '#d8e4f0'), mk('#e8e5df', ['#a4b8c4', '#3b4a55'], false, '#d8e4f0'), mk('#9c8f80', ['#7d939f', '#28333b'], true, '#f2e2bc'), mk('#c9c3b6', ['#5f7380', '#1f2930'], true, '#e8e4dc')];
}

// ---------------- 地面（ワールド全体の下地と、遠くの山並み） ----------------
function buildGround(root) {
  const [x0, z0, x1, z1] = T.bounds;
  const g = new THREE.PlaneGeometry(14000, 14000); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
  const gm = MATS.m.grass.clone(); gm.polygonOffset = true; gm.polygonOffsetFactor = 2; gm.polygonOffsetUnits = 4;
  const ground = new THREE.Mesh(g, gm); ground.position.set((x0 + x1) / 2, -0.04, (z0 + z1) / 2); ground.receiveShadow = true; root.add(ground);
  // 遠くの山並み（カメラについてくる。霧でかすんだ影絵）
  const mtn = new THREE.MeshBasicMaterial({ color: 0x74858c });
  const B = new Batch(100000);
  for (let k = 0; k < 64; k++) {
    const a = k / 64 * Math.PI * 2, R = 2050 + (k % 3) * 90;
    const north = Math.max(0, -Math.sin(a)); // 北（日光・那須の方）は高い山
    const h = 25 + ((k * 37) % 7) * 8 + north * north * 110 + ((k * 13) % 5) * 5;
    const g = new THREE.ConeGeometry(320 + (k % 4) * 80, h, 7, 1, true);
    B.add(g, mtn, M(Math.cos(a) * R, h / 2 - 8, Math.sin(a) * R, k * 1.7, 1, 1, 0.6 + (k % 3) * 0.2), { noShadow: true });
  }
  const far = new THREE.Group(); B.build(far); far.traverse(o => { o.castShadow = false; o.receiveShadow = false; }); root.add(far);
  T.mountains = far;
}

// ---------------- 信号（ワールド全体） ----------------
function markSignals() {
  const pts = T.data.signals.slice();
  for (const e of T.edges) for (const p of e.sigPts) pts.push(p);
  for (const n of T.nodes) if (n.sig) pts.push([n.x, n.z]);
  const marked = new Set();
  for (const p of pts) {
    let best = null, bd = 32;
    for (const e of EG.query(p[0], p[1], 40)) for (const id of [e.a, e.b]) { const n = T.nodes[id]; if (n.ends.length < 3) continue; const d = Math.hypot(n.x - p[0], n.z - p[1]); if (d < bd) { bd = d; best = n; } }
    if (best) marked.add(best);
  }
  const clusters = [];
  for (const n of marked) {
    let c = clusters.find(cl => cl.nodes.some(o => Math.hypot(o.x - n.x, o.z - n.z) < 30));
    if (!c) { c = { nodes: [] }; clusters.push(c); }
    c.nodes.push(n);
  }
  clusters.forEach((cl, idx) => {
    const set = new Set(cl.nodes);
    for (const n of cl.nodes) n.signal = true;
    const cx = cl.nodes.reduce((a, n) => a + n.x, 0) / cl.nodes.length, cz = cl.nodes.reduce((a, n) => a + n.z, 0) / cl.nodes.length;
    const approaches = []; let main = null;
    for (const n of cl.nodes) for (const { e, end } of n.ends) {
      const other = T.nodes[end === 'a' ? e.b : e.a];
      if (set.has(other) || (e.ow && end === 'a')) continue;
      const s = end === 'a' ? n.R + 1.6 : e.len - n.R - 1.6;
      if (s < 1 || s > e.len - 1) continue;
      const at = atS(e, s), d = end === 'a' ? [-at.d[0], -at.d[1]] : at.d;
      const ap = { e, end, node: n, d, stop: { x: at.p[0], z: at.p[1] }, half: e.w / 2, group: 'A' };
      approaches.push(ap);
      if (!main || e.rank > main.e.rank || (e.rank === main.e.rank && e.w > main.e.w)) main = ap;
    }
    if (!approaches.length) return;
    for (const ap of approaches) ap.group = Math.abs(V.dot(ap.d, main.d)) > 0.6 ? 'A' : 'B';
    const mk = (c) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0, roughness: 0.3 });
    const mats = { A: { g: mk(0x30d0b0), y: mk(0xffb020), r: mk(0xff3020) }, B: { g: mk(0x30d0b0), y: mk(0xffb020), r: mk(0xff3020) } };
    T.signals.push({ x: cx, z: cz, nodes: cl.nodes, approaches, mats, offset: idx * 7, state: { A: 'g', B: 'r' }, tile: tileKeyOf(cx, cz) });
  });
}

// =========================================================
// 営業所：配達の担当区域（郊外の住宅地）の、大きめの道に面した空き地
// =========================================================
const DEPOT = { W: 52, D: 46 };
const HOME = { x: 440, z: 600 }; // 担当区域の中心
function placeDepot() {
  let best = null;
  const near = (o) => { const out = []; for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const t2 = T.tileData[tileKeyOf(o[0] + dx * 120, o[1] + dz * 120)]; if (t2 && !out.includes(t2)) out.push(t2); } return out; };
  for (const e of EG.query(HOME.x, HOME.z, 1100)) {
    if (e.rank < 2 || e.len < 70 || e.br) continue;
    for (let s = 30; s < e.len - 30; s += 6) {
      const at = atS(e, s);
      if (Math.hypot(at.p[0] - HOME.x, at.p[1] - HOME.z) > 1000) continue;
      for (const side of [1, -1]) {
        const n = V.mul(V.left(at.d), side), o = V.add(at.p, V.mul(n, frontOffset(e))), u = [n[1], -n[0]];
        const poly = rectPts(o, u, n, -DEPOT.W / 2, DEPOT.W / 2, 0, DEPOT.D);
        const big = rectPts(o, u, n, -DEPOT.W / 2 - 1, DEPOT.W / 2 + 1, 0.5, DEPOT.D + 1);
        let bad = false;
        const tiles = near(o);
        for (const t2 of tiles) { for (const b of t2.b) { if (b.g) continue; const c = b.p[0]; if (Math.abs(c[0] - o[0]) > 90 || Math.abs(c[1] - o[1]) > 90) continue; if (polysOverlap(poly, b.p)) { bad = true; break; } } if (bad) break; }
        if (bad) continue;
        for (const e2 of EG.query(o[0], o[1], 80)) { if (e2 === e) continue; for (const p of e2.pts) if (pointInPoly(p[0], p[1], big)) { bad = true; break; } if (bad) break; }
        if (bad) continue;
        for (const t2 of tiles) { for (const w of t2.w) { for (const p of w.p) if (pointInPoly(p[0], p[1], big)) { bad = true; break; } if (bad) break; } if (bad) break; for (const a of t2.a) { if (['farmland', 'residential', 'grass', 'construction', 'meadow', 'commercial', 'retail', 'industrial', 'brownfield', 'greenfield'].includes(a.k)) continue; if (polysOverlap(poly, a.p)) { bad = true; break; } } if (bad) break; }
        if (bad) continue;
        const score = -Math.hypot(o[0] - HOME.x, o[1] - HOME.z) + (e.rank >= 3 ? 220 : 0);
        if (!best || score > best.score) best = { score, o, u, n, e, s, side, poly };
      }
    }
  }
  if (!best) throw new Error('営業所を置く場所が見つかりません');
  return best;
}
function depotInfo(dp) {
  const rot = rotOf(dp.n);
  const base = new THREE.Matrix4().makeRotationY(rot).setPosition(dp.o[0], 0, dp.o[1]);
  const W2 = (x, z, y = 0) => localToWorld(base, x, y, z);
  const tables = [];
  for (let k = 0; k < 3; k++) { const w = W2(-22 + k * 3.4, 30, 0.88); tables.push({ x: w.x, z: w.z, y: 0.88, rot }); }
  for (let k = 0; k < 2; k++) { const w = W2(-22 + k * 3.4, 35, 0.88); tables.push({ x: w.x, z: w.z, y: 0.88, rot }); }
  const vs = W2(-1.5, 11), ps = W2(-21, 27.5), boss = W2(0, 45.2), front = W2(0, -frontOffset(dp.e) + dp.e.w / 4), c = W2(0, DEPOT.D / 2);
  return {
    dp, rot, base, tables, whiteboard: null, crate: W2(-11.05, 34.5, 0.9), desk: W2(5, 41.3, 1.0),
    vanSpawn: { x: vs.x, z: vs.z, heading: rot + Math.PI }, playerSpawn: { x: ps.x, z: ps.z, yaw: rot + Math.PI },
    boss: { x: boss.x, z: boss.z, rotY: rot + Math.PI }, front: { x: front.x, z: front.z }, center: { x: c.x, z: c.z },
    poly: dp.poly, edge: dp.e, tile: tileKeyOf(c.x, c.z), contains(x, z) { return pointInPoly(x, z, dp.poly); },
  };
}

// =========================================================
// 建物の役割（家・アパート・マンション・店・ビル・倉庫…）と、配達先の住民
// =========================================================
const SHOP_NAMES = ['あおばマート', 'ハッピーマート', 'デイリーみね'];
function planBuildings(depot) {
  let ci = 0;
  const all = [];
  for (const [key, td] of Object.entries(T.tileData)) {
    td.plans = [];
    for (const b of td.b) {
      const pts = b.p;
      if (pts.length < 3) continue;
      const area = Math.abs(polyArea(pts));
      if (area < 6 || polysOverlap(pts, depot.poly)) continue;
      const o = obb(pts), rect = area / o.area, c = centroid(pts), nm = b.nm || '';
      let kind = 'house';
      const lv = b.lv;
      if (b.k === 'apartments') kind = (lv && lv >= 4) || area > 600 ? 'mansion' : 'apart';
      else if (/神社|宮$|寺|院$/.test(nm) || b.k === 'temple' || b.k === 'shrine') kind = 'temple';
      else if (/セブン|ローソン|ファミリーマート|ミニストップ|デイリー/.test(nm)) kind = 'conbini';
      else if (['retail', 'commercial', 'supermarket'].includes(b.k)) kind = area > 800 ? 'office' : 'store';
      else if (['warehouse', 'industrial', 'factory'].includes(b.k)) kind = 'warehouse';
      else if (['university', 'school', 'hospital', 'office', 'public', 'civic', 'government', 'college', 'train_station', 'hotel', 'parking', 'kindergarten'].includes(b.k)) kind = 'office';
      else if (['garage', 'garages', 'shed', 'roof', 'carport', 'hut'].includes(b.k)) kind = 'shed';
      else if (b.k === 'house' || b.k === 'detached') kind = area > 260 ? 'apart' : 'house';
      else {
        if (area < 22) kind = 'shed';
        else if (area < 170) kind = 'house';
        else if (area > 1500) kind = rect > 0.85 ? 'warehouse' : 'office';
        else kind = lv && lv >= 4 ? 'office' : area > 500 ? 'office' : 'apart';
      }
      if (kind === 'house' && area > 240) kind = 'apart';
      if (lv && lv >= 3 && kind === 'house') kind = 'apart';
      const ne = nearestEdge(c[0], c[1], null, 30);
      const it = { b, key, pts, area, o, rect, c, kind, ne, floors: 2, id: null, gen: !!b.g, seed: (Math.floor(c[0] * 7919 + c[1] * 104729) >>> 0) || 7 };
      const rr = seeded(it.seed);
      if (kind === 'house') it.floors = area > 140 ? (rr() < 0.35 ? 1 : 2) : (rr() < 0.1 ? 1 : area < 55 && rr() < 0.3 ? 3 : 2);
      if (kind === 'apart') it.floors = lv || (area > 300 ? 3 : 2);
      if (kind === 'mansion') it.floors = Math.max(4, lv || Math.round(4 + rr() * 6));
      if (kind === 'office') it.floors = lv || Math.max(2, Math.min(9, Math.round(area / 260) + 1));
      if (kind === 'store') it.floors = lv || 2;
      if (kind === 'conbini') it.shopName = SHOP_NAMES[ci++ % 3];
      if (ne) {
        const n = V.mul(V.left(ne.dir), ne.side);
        let dFront = Infinity; for (const p of pts) dFront = Math.min(dFront, V.dot(V.sub(p, [ne.x, ne.z]), n));
        it.n = n; it.dFront = dFront; it.gapWall = dFront - frontOffset(ne.e);
      }
      td.plans.push(it); all.push(it);
    }
  }
  T.plans = all;
  // ---- 住民：営業所のまわり（担当区域）から選ぶ ----
  const dc = [depot.o[0], depot.o[1]];
  const dist = (it) => Math.hypot(it.c[0] - dc[0], it.c[1] - dc[1]);
  const used = new Set();
  const pickFrom = (list, score) => { let best = null, bs = -Infinity; for (const it of list) { if (used.has(it)) continue; const s = score(it); if (s > bs) { bs = s; best = it; } } if (best) used.add(best); return best; };
  const assign = (id, it, kind) => { if (!it) return null; it.id = id; if (kind) it.kind = kind; return it; };
  const pool = all.filter(it => dist(it) < 900 && it.ne);
  const good = (it) => it.gapWall >= 1.6 && it.gapWall < 14 && it.ne.e.rank >= 1 && it.ne.e.rank <= 2 && it.rect > 0.72 && it.area > 45;
  const ms = pickFrom(pool.filter(it => (it.kind === 'mansion' || (it.kind === 'apart' && it.area > 300)) && it.rect > 0.75 && it.gapWall > 1), it => it.area * 0.5 - dist(it) * 2);
  if (ms) { assign('1-C2-0', ms, 'mansion'); ms.floors = Math.max(5, ms.floors); }
  const ap = pickFrom(pool.filter(it => (it.kind === 'apart' || it.kind === 'house') && it.rect > 0.82 && it.area > 110 && it.area < 400 && it.gapWall > 2.5 && Math.abs(V.dot(it.o.u, it.ne.dir)) > 0.85 && it.o.L > it.o.W * 1.3), it => -dist(it));
  if (ap) { assign('2-B2-1', ap, 'apart'); ap.floors = 2; }
  const shopCand = pool.filter(it => it.kind === 'house' && it.ne.e.rank >= 3 && it.gapWall < 8 && it.gapWall > -0.5 && it.area > 50 && it.area < 220 && it.rect > 0.75);
  for (const [id, name, color] of [['1-S-2', '喫茶こもれび', 0x5b4632], ['1-S-3', 'ベーカリー松本', 0x9a5a2c], ['2-S-0', '花屋はなまる', 0x4f7a45], ['2-S-2', '中島書店', 0x2f4a6e], ['3-S-0', 'クリーニング白鳥', 0x3d6c8c]]) {
    const it = pickFrom(shopCand, (x) => -dist(x) + rnd() * 250);
    if (it) { assign(id, it, 'shop'); it.shopName = name; it.shopColor = color; }
  }
  const cv = pickFrom(pool.filter(it => it.kind === 'conbini'), (x) => -dist(x))
    || pickFrom(pool.filter(it => it.kind === 'house' && it.ne.e.rank >= 3 && it.area > 90 && it.gapWall > 4 && it.rect > 0.8), (x) => -dist(x));
  if (cv) { assign('1-S-0', cv, 'conbini'); cv.shopName = 'あおばマート'; }
  const houses = pool.filter(it => it.kind === 'house' && good(it));
  const spots = { tanaka: [-300, 120], suzuki: [250, -280], yoshida: [-420, -240], watanabe: [420, 260], kato: [120, 420], nakamura: [-140, 520], ogawa: [560, -60], ito: [-560, 300] };
  const lotIdOf = Object.fromEntries(RESIDENTS.map(r => [r.id, r.lot]));
  for (const [rid, [dx, dz]] of Object.entries(spots)) if (lotIdOf[rid]) assign(lotIdOf[rid], pickFrom(houses, it => -Math.hypot(it.c[0] - dc[0] - dx, it.c[1] - dc[1] - dz) + it.area * 0.05));
  // 佐藤さん：同じ道の同じ側に並ぶ2軒
  let pair = null, pbest = -Infinity;
  const byEdge = new Map();
  for (const it of houses) { if (used.has(it)) continue; const k = it.ne.e.id + ':' + it.ne.side; if (!byEdge.has(k)) byEdge.set(k, []); byEdge.get(k).push(it); }
  for (const list of byEdge.values()) for (const a of list) for (const b of list) {
    if (a === b) continue; const gap = b.ne.s - a.ne.s;
    if (gap < 9 || gap > 18) continue;
    const sc = -Math.hypot(a.c[0] - dc[0] - 60, a.c[1] - dc[1] + 220);
    if (sc > pbest) { pbest = sc; pair = [a, b]; }
  }
  if (pair) { used.add(pair[0]); used.add(pair[1]); assign('1-C1-2', pair[0]); assign('1-C1-3', pair[1]); }
  const farmAreas = Object.values(T.tileData).flatMap(td => td.a.filter(a => a.k === 'farmland')).concat(T.data.bigAreas.filter(a => a.k === 'farmland'));
  const farmH = pickFrom(houses.filter(it => it.area > 80), it => { let d = 1e9; for (const a of farmAreas) { const p = a.p[0]; if (Math.abs(p[0] - it.c[0]) > 400 || Math.abs(p[1] - it.c[1]) > 400) continue; for (const q of a.p) d = Math.min(d, Math.hypot(q[0] - it.c[0], q[1] - it.c[1])); } return -d - dist(it) * 0.2; });
  assign('3-D-3', farmH, 'farmhouse');
  for (const r of RESIDENTS) if (!all.some(it => it.id === r.lot)) assign(r.lot, pickFrom(houses, () => rnd()));
  T.residentPlans = all.filter(it => it.id);
}
// ---- 敷地（門・塀の範囲）と住所：ワールド全体で決めておく ----
function planLots() {
  const groups = new Map(), lots = [];
  const usedNames = new Set(RESIDENTS.map(r => r.name.split(' ')[0]));
  const extra = EXTRA_SURNAMES.filter(n => !usedNames.has(n));
  const resByLot = {};
  for (const r of RESIDENTS) (resByLot[r.lot] = resByLot[r.lot] || []).push(r);
  for (const it of T.plans) {
    if (!it.ne || !['house', 'farmhouse', 'shop', 'apart', 'mansion', 'conbini', 'store'].includes(it.kind)) continue;
    if (it.gapWall > 30 || it.gapWall < -1.5) continue;
    const e = it.ne.e, t = it.ne.dir;
    let s0 = Infinity, s1 = -Infinity;
    for (const p of it.pts) { const k = V.dot(V.sub(p, [it.ne.x, it.ne.z]), t); s0 = Math.min(s0, k); s1 = Math.max(s1, k); }
    const [ra, rb] = clearRange(e, 1.5, 1.5);
    const L = { it, e, side: it.ne.side, s0: Math.max(ra, it.ne.s + s0 - 1.2), s1: Math.min(rb, it.ne.s + s1 + 1.2) };
    if (L.s1 - L.s0 < 3) { L.s0 = Math.max(0.5, it.ne.s - 2); L.s1 = Math.min(e.len - 0.5, it.ne.s + 2); }
    const k = e.id + ':' + L.side;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(L); lots.push(L);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.s0 + a.s1) - (b.s0 + b.s1));
    for (let i = 1; i < list.length; i++) { const a = list[i - 1], b = list[i]; if (a.s1 > b.s0) { const mid = (a.s1 + b.s0) / 2; a.s1 = mid - 0.1; b.s0 = mid + 0.1; } }
  }
  // 住所：600m 四方ごとに丁目、道の片側ごとに番、並び順に号
  const banOf = new Map(), banN = {};
  let gi = 0, ei = 0;
  for (const L of lots) {
    const c = L.it.c, [bx0, bz0] = T.bounds;
    const zone = Math.floor((c[0] - bx0) / 600) + Math.floor((c[1] - bz0) / 600) * 8;
    const chome = (zone % 9) + 1;
    const key = L.e.id + ':' + L.side;
    if (!banOf.has(key)) { banN[chome] = (banN[chome] || 0) + 1; banOf.set(key, { ban: (banN[chome] - 1) % 40 + 1, go: 0 }); }
    const bo = banOf.get(key); bo.go++;
    const it = L.it, id = it.id || `L${gi++}`;
    const residents = resByLot[id] || [];
    const kind = it.kind;
    const surname = residents.length && !['apart', 'mansion'].includes(kind) ? residents[0].name.split(' ')[0] : extra[ei++ % extra.length];
    const sMid = Math.max(L.s0 + 2.3, Math.min(L.s1 - 1.6, it.ne.s));
    const at = atS(L.e, sMid), n = V.mul(V.left(at.d), L.side);
    const gate = V.add(at.p, V.mul(n, frontOffset(L.e)));
    const fp = V.add(at.p, V.mul(V.left(at.d), L.side * (L.e.ow ? 0 : L.e.w / 4)));
    const lot = {
      id, kind, name: it.shopName || (kind === 'mansion' ? 'グランあおば' : it.id === '2-B2-1' ? 'メゾンあおば' : null), address: `あおば町${chome}-${bo.ban}-${bo.go}`, residents, surname,
      points: { front: new THREE.Vector3(fp[0], 0, fp[1]) }, doors: [], cx: gate[0], cz: gate[1], rot: rotOf(n), poly: it.pts, L, tile: it.key, built: false,
    };
    lot.base = new THREE.Matrix4().makeRotationY(lot.rot).setPosition(gate[0], 0, gate[1]);
    L.lot = lot; it.lot = lot;
    T.lots[id] = lot;
  }
}

// =========================================================
// ストリーミング：タイルの作成と破棄
// =========================================================
const queue = [];
let current = null;
export function updateWorld(fx, fz, budgetMs = 6) {
  const [x0, z0] = T.bounds, ts = T.data.meta.tile;
  if (T.mountains) { T.mountains.position.set(fx, 0, fz); T.mountains.updateMatrixWorld(true); }
  for (const key of T.data.tiles) {
    let t = T.tiles.get(key);
    if (!t) { const [i, j] = key.split('_').map(Number); t = { key, i, j, cx: x0 + (i + 0.5) * ts, cz: z0 + (j + 0.5) * ts, near: null, far: null, colliders: [], lots: [], plates: null }; T.tiles.set(key, t); }
    // タイルの四角までの距離
    const dx = Math.max(0, Math.abs(fx - t.cx) - ts / 2), dz = Math.max(0, Math.abs(fz - t.cz) - ts / 2);
    const d = Math.hypot(dx, dz);
    t.dist = d;
    if (d < NEAR && !t.near && !t.nearQueued) { t.nearQueued = true; queue.push({ t, kind: 'near' }); }
    if (d < FAR && !t.far && !t.farQueued) { t.farQueued = true; queue.push({ t, kind: 'far' }); }
    if (d > UNLOAD_NEAR && t.near && !(current && current.job.t === t)) unloadNear(t);
    if (d > UNLOAD_FAR && t.far && !(current && current.job.t === t)) unloadFar(t);
  }
  // 遠景を先に（見た目の穴を埋める）、次に近い順の細部
  const pri = (j) => (j.kind === 'far' ? (j.t.dist < 50 ? -1000 : 0) : 300) + j.t.dist;
  queue.sort((a, b) => pri(a) - pri(b));
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    if (!current) {
      const job = queue.shift();
      if (!job) break;
      const tooFar = job.kind === 'near' ? job.t.dist > UNLOAD_NEAR : job.t.dist > UNLOAD_FAR;
      if (tooFar) { if (job.kind === 'near') job.t.nearQueued = false; else job.t.farQueued = false; continue; }
      current = { job, gen: job.kind === 'near' ? buildNearTile(job.t) : buildFarTile(job.t) };
    }
    const r = current.gen.next();
    if (r.done) current = null;
  }
  T.stats.queue = queue.length + (current ? 1 : 0);
  let nn = 0, nf = 0; for (const t of T.tiles.values()) { if (t.near) nn++; if (t.far) nf++; }
  T.stats.near = nn; T.stats.far = nf;
}
// 起動時：まわりのタイルを作り終えるまで回す
export async function preloadAround(fx, fz, onProgress) {
  updateWorld(fx, fz, 0);
  const total = queue.length + 1;
  while (queue.length || current) {
    updateWorld(fx, fz, 60);
    onProgress && onProgress(1 - (queue.length + (current ? 1 : 0)) / total);
    await new Promise(r => setTimeout(r, 0));
  }
}
export function worldBusy() { return queue.length > 0 || !!current; }
function unloadNear(t) {
  if (t.near) { disposeGroup(t.near); t.near = null; }
  for (const c of t.colliders) CG.remove(c);
  t.colliders = [];
  for (const lot of t.lots) { lot.built = false; lot.doors = []; lot.rooms = null; const i = T.lotList.indexOf(lot); if (i >= 0) T.lotList.splice(i, 1); }
  t.lots = [];
  if (t.plates) { t.plates.dispose(); t.plates = null; }
  t.nearQueued = false;
  if (t.far) t.far.visible = true;
}
function unloadFar(t) { if (t.far) { disposeGroup(t.far); t.far = null; } t.farQueued = false; }
function disposeGroup(g) {
  g.removeFromParent();
  g.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
}

// ---------------- 遠くのタイル：道路と簡単な建物 ----------------
function* buildFarTile(t) {
  const group = new THREE.Group(); group.name = 'far ' + t.key;
  const B = new Batch(100000);
  const td = T.tileData[t.key] || { a: [], w: [], plans: [] };
  for (const a of td.a) { const mt = areaMat(a.k); if (mt && a.p.length >= 3) B.add(polyFill(a.p, areaY(a.k)), mt, new THREE.Matrix4(), { noShadow: true }); }
  for (const a of T.data.bigAreas) if (centroidKey(a) === t.key) { const mt = areaMat(a.k); if (mt) B.add(polyFill(a.p, areaY(a.k)), mt, new THREE.Matrix4(), { noShadow: true }); }
  for (const w of td.w) if (w.p.length >= 2) B.add(ribbon(w.p, w.w, 0.012), MATS.water, new THREE.Matrix4(), { noShadow: true });
  for (const e of T.edges) eachRun(e, t.key, 0, e.len, (s0, s1) => { const l = subLine(e, s0, s1); if (l) B.add(ribbon(l, e.w, 0.02), MATS.roadFar, new THREE.Matrix4(), { noShadow: true }); });
  for (const r of T.data.rails) {
    const high = r.br || r.layer > 0 || r.hs;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      if (tileKeyOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) !== t.key) continue;
      const L = V.len(V.sub(b, a)); if (L < 0.2) continue;
      const mid = V.mul(V.add(a, b), 0.5), rot = rotOf(V.norm(V.sub(b, a)));
      if (high) B.add(box(5.2, 1.6, L + 0.05), MATS.m.concrete, M(mid[0], 8.6, mid[1], rot), { noShadow: true });
      else B.add(box(3, 0.12, L + 0.05), MATS.ballast, M(mid[0], 0.06, mid[1], rot), { noShadow: true });
    }
  }
  yield;
  const out = { B };
  let n = 0;
  for (const it of td.plans || []) {
    buildLOD(out, lodSpec(it));
    if (++n % 80 === 0) yield;
  }
  yield* B.steps(group, 10);
  group.traverse(o => { if (o.isMesh) o.castShadow = false; });
  T.root.add(group);
  t.far = group;
  if (t.near) group.visible = false;
}
function centroidKey(a) { const c = centroid(a.p); return tileKeyOf(c[0], c[1]); }
function lodSpec(it) {
  const { o } = it;
  const k = it.kind;
  const H = k === 'house' || k === 'farmhouse' || k === 'shop' ? 0.45 + it.floors * 2.85 : k === 'shed' ? 2.4 : k === 'warehouse' ? 7 : k === 'temple' ? 5 : 0.3 + it.floors * 3.1;
  const pitched = ['house', 'farmhouse', 'shop', 'temple'].includes(k) || (k === 'apart' && it.floors <= 3);
  const base = new THREE.Matrix4().makeRotationY(Math.atan2(-o.u[1], o.u[0])).setPosition(o.cx, 0, o.cz);
  return { base, W: o.L, D: Math.min(o.W, Math.max(3, it.area / Math.max(1, o.L))), H, pitched, seed: it.seed };
}
const AREA_Y = { residential: 0.004, construction: 0.007, brownfield: 0.007, greenfield: 0.008, grass: 0.009, meadow: 0.009, heath: 0.009, scrub: 0.009, recreation_ground: 0.009, farmland: 0.011, orchard: 0.011, allotments: 0.011, park: 0.012, garden: 0.012, playground: 0.012, pitch: 0.012, cemetery: 0.012, retail: 0.013, commercial: 0.013, industrial: 0.013, parking: 0.014, school: 0.012, university: 0.012, hospital: 0.012, religious: 0.012, water: 0.016, wood: 0.01, forest: 0.01 };
const areaY = (k) => AREA_Y[k] ?? 0.005;
function areaMat(k) {
  return { residential: MATS.yard, construction: MATS.lot, brownfield: MATS.lot, greenfield: MATS.grass, grass: MATS.grass, meadow: MATS.grass, heath: MATS.grass, scrub: MATS.grass, recreation_ground: MATS.grass, farmland: MATS.paddy, orchard: MATS.grass, allotments: MATS.field, park: MATS.grass, garden: MATS.grass, playground: MATS.lot, pitch: MATS.grass, cemetery: MATS.yard, retail: MATS.pave, commercial: MATS.pave, industrial: MATS.pave, parking: MATS.pave, school: MATS.lot, university: MATS.grass, hospital: MATS.pave, religious: MATS.yard, water: MATS.water, wood: MATS.grass, forest: MATS.grass }[k];
}

// ---------------- 近くのタイル：細かい道路・建物・敷地 ----------------
let BB = null, I = null, PL = null;
function* buildNearTile(t) {
  const group = new THREE.Group(); group.name = 'near ' + t.key;
  t.colliders = []; t.lots = [];
  const dyn = [];
  const td = T.tileData[t.key] || { a: [], w: [], plans: [] };
  const B = new Batch(200), Ins = new Instancer(400), Pl = new Plates(); t.plates = Pl;
  // ジェネレーターの途中で他のタイルに切り替わらないので、作業中はこのタイルの道具を使う
  const use = () => { BB = B; I = Ins; PL = Pl; CUR = t; };
  const done = () => { CUR = null; };
  use();
  for (const a of td.a.concat(T.data.bigAreas.filter(a => centroidKey(a) === t.key))) {
    if (a.p.length < 3) continue;
    if (a.k === 'farmland') farmRows(a.p);
    else if (['park', 'wood', 'forest', 'scrub', 'grass'].includes(a.k)) greenery(a);
    else if (a.k === 'parking') parkingLines(a.p);
  }
  done(); yield; use();
  buildRoadsTile(t.key);
  done(); yield; use();
  buildRailsTile(t.key);
  buildWaterTile(td.w);
  done(); yield; use();
  buildPolesTile(t.key);
  buildSignalsTile(t.key, dyn);
  if (T.depot.tile === t.key) buildDepot(dyn);
  done(); yield; use();
  let n = 0;
  for (const it of td.plans || []) {
    try { buildBuilding(it, dyn, t); } catch (err) { console.warn('building', it.kind, err); }
    if (++n % 5 === 0) { done(); yield; use(); }
  }
  buildBoundaryTile(t.key);
  done(); yield;
  yield* B.steps(group, 6);
  Ins.build(group);
  for (const d of dyn) group.add(d);
  T.root.add(group);
  t.near = group;
  if (t.far) t.far.visible = false;
}

// ---------------- 土地利用の細部 ----------------
function clipLine(pts, a, b) {
  const ts = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], r = V.sub(b, a), s = V.sub(q, p), den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) continue;
    const tt = ((p[0] - a[0]) * s[1] - (p[1] - a[1]) * s[0]) / den, u = ((p[0] - a[0]) * r[1] - (p[1] - a[1]) * r[0]) / den;
    if (u >= 0 && u <= 1) ts.push(tt);
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([V.add(a, V.mul(V.sub(b, a), ts[i])), V.add(a, V.mul(V.sub(b, a), ts[i + 1]))]);
  return out;
}
function farmRows(pts) {
  const o = obb(pts);
  if (o.area > 40000) return;
  for (let k = -o.W / 2 + 0.8; k < o.W / 2 - 0.5; k += 1.3) {
    const c = [o.cx + o.v[0] * k, o.cz + o.v[1] * k];
    const a = V.sub(c, V.mul(o.u, o.L)), b = V.add(c, V.mul(o.u, o.L));
    for (const [p, q] of clipLine(pts, a, b)) { const L = V.len(V.sub(q, p)) - 1.2; if (L < 1) continue; const mid = V.mul(V.add(p, q), 0.5); BB.add(box(0.45, 0.16, L), MATS.field, M(mid[0], 0.07, mid[1], rotOf(o.u)), { noShadow: true }); }
  }
}
function greenery(a) {
  const o = obb(a.p), wood = a.k === 'wood' || a.k === 'forest';
  const n = Math.min(wood ? 60 : 24, Math.floor(o.area / (wood ? 50 : 300)));
  for (let i = 0; i < n; i++) {
    const x = o.cx + o.u[0] * (rnd() - 0.5) * o.L + o.v[0] * (rnd() - 0.5) * o.W, z = o.cz + o.u[1] * (rnd() - 0.5) * o.L + o.v[1] * (rnd() - 0.5) * o.W;
    if (!pointInPoly(x, z, a.p) || nearRoad(x, z, 3)) continue;
    if (a.k !== 'grass' || rnd() < 0.3) tree(x, z, 0.9 + rnd() * 0.7); else bush(x, z, 1.4);
  }
}
function parkingLines(pts) {
  const o = obb(pts);
  if (o.W < 10 || o.area > 20000) return;
  const rowZ = -o.W / 2 + 3;
  for (let k = -o.L / 2 + 1.5; k < o.L / 2 - 1.5; k += 2.6) {
    const c = [o.cx + o.u[0] * k + o.v[0] * rowZ, o.cz + o.u[1] * k + o.v[1] * rowZ];
    if (!pointInPoly(c[0], c[1], pts)) continue;
    BB.add(box(0.12, 0.01, 5), MATS.m.lineWhite, M(c[0], 0.03, c[1], rotOf(o.v)), { noShadow: true });
    if (rnd() < 0.3) { const cc = [c[0] + o.u[0] * 1.3, c[1] + o.u[1] * 1.3]; I.add('covered_car', M(cc[0], 0, cc[1], rotOf(o.v) + (rnd() < 0.5 ? 0 : Math.PI))); addPoly([[-0.9, -2.2], [0.9, -2.2], [0.9, 2.2], [-0.9, 2.2]].map(([x, z]) => [cc[0] + o.u[0] * x + o.v[0] * z, cc[1] + o.u[1] * x + o.v[1] * z]), 1.6); }
  }
}
function nearRoad(x, z, pad) { const n = nearestEdge(x, z, null, 20); return n && n.d < n.e.w / 2 + pad; }
const _trunk = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 7), _crown = new THREE.IcosahedronGeometry(1.4, 1), _blob = new THREE.IcosahedronGeometry(0.5, 1);
function tree(x, z, s = 1, collide = true) {
  BB.add(_trunk, A.mats.trunk, M(x, 1.2 * s, z, 0, s, s, s));
  for (let k = 0; k < 4; k++) { const k2 = (0.7 + rnd() * 0.5) * s; BB.add(_crown, MATS.leaf, M(x + (rnd() - 0.5) * 1.4 * s, (2.8 + rnd() * 1.2) * s, z + (rnd() - 0.5) * 1.4 * s, rnd() * 6, k2, k2, k2)); }
  if (collide) addCircle(x, z, 0.3 * s);
}
function bush(x, z, s = 1) { for (let k = 0; k < 3; k++) { const k2 = (0.7 + rnd() * 0.5) * s; BB.add(_blob, MATS.leaf, M(x + (rnd() - 0.5) * 0.6 * s, (0.35 + rnd() * 0.25) * s, z + (rnd() - 0.5) * 0.6 * s, rnd() * 6, k2, k2 * 0.85, k2)); } }

// ---------------- 道路（タイルの分だけ） ----------------
let stopMat = null;
function stopText(p, d) {
  if (!stopMat) {
    stopMat = new THREE.MeshStandardMaterial({ map: textTexture(256, 512, (c, w, h) => { c.fillStyle = '#fff'; c.font = `bold 200px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.scale(1, 1.2); c.fillText('止', w / 2, h * 0.27 / 1.2 + 20); c.fillText('まれ', w / 2, h * 0.75 / 1.2 + 10); c.restore(); }), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -10, depthWrite: false });
    stopMat.map.anisotropy = 8;
  }
  const g = new THREE.PlaneGeometry(1.3, 2.6); g.rotateX(-Math.PI / 2);
  BB.add(g, stopMat, M(p[0], 0.045, p[1], Math.atan2(-d[0], -d[1])), { noShadow: true });
}
const signMats = {};
const _signPole = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8);
function roadSign(kind, p, d, size = 0.6) {
  if (!signMats[kind]) {
    signMats[kind] = new THREE.MeshStandardMaterial({
      map: textTexture(256, 256, (c) => {
        if (kind === 'stop') { c.fillStyle = '#c8281e'; c.beginPath(); c.moveTo(8, 20); c.lineTo(248, 20); c.lineTo(128, 236); c.closePath(); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 8; c.stroke(); c.fillStyle = '#fff'; c.font = `bold 58px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('止まれ', 128, 84); }
        else if (kind === 'bus') { c.fillStyle = '#1d4fa0'; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = `bold 64px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('バス', 128, 118); c.font = `bold 30px ${JP_FONT}`; c.fillText('停留所', 128, 172); }
        else { c.fillStyle = '#fff'; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill(); c.strokeStyle = '#c8281e'; c.lineWidth = 30; c.beginPath(); c.arc(128, 128, 104, 0, 7); c.stroke(); c.fillStyle = '#1d4fa0'; c.font = `bold 120px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(kind, 128, 136); }
      }), transparent: true, roughness: 0.4, alphaTest: 0.1,
    });
  }
  BB.add(_signPole, MATS.m.frame, M(p[0], 1.3, p[1]));
  BB.add(new THREE.PlaneGeometry(size, size), signMats[kind], M(p[0] - d[0] * 0.03, 2.35, p[1] - d[1] * 0.03, Math.atan2(-d[0], -d[1])), { noShadow: true });
  addCircle(p[0], p[1], 0.1);
}
// 大通りの青い案内標識（道の名前）
function guideSign(e, at, key) {
  if (!e.name || tileKeyOf(at.p[0], at.p[1]) !== key) return;
  const mat = signMaterial(e.name.length > 10 ? e.name.slice(0, 10) : e.name, '#1d4fa0', '#fff', 1024, 200);
  const side = V.left(at.d), p = V.add(at.p, V.mul(side, e.w / 2 + 1.6));
  BB.add(new THREE.CylinderGeometry(0.12, 0.14, 6.2, 10), MATS.m.frame, M(p[0], 3.1, p[1]));
  const reach = Math.min(e.w / 2, 5), am = V.sub(p, V.mul(side, reach / 2));
  BB.add(box(0.1, 0.1, reach), MATS.m.frame, M(am[0], 5.9, am[1], rotOf(side)));
  const sp = V.sub(p, V.mul(side, reach));
  BB.add(new THREE.PlaneGeometry(4.2, 0.82), mat, M(sp[0] - at.d[0] * 0.05, 5.5, sp[1] - at.d[1] * 0.05, Math.atan2(-at.d[0], -at.d[1])), { noShadow: true });
  BB.add(box(4.3, 0.9, 0.06), MATS.m.frame, M(sp[0] + at.d[0] * 0.01, 5.5, sp[1] + at.d[1] * 0.01, rotOf(at.d)));
  addCircle(p[0], p[1], 0.2);
}
function lineAlong(e, key, s0, s1, off, w, mat, dash = 0) {
  if (s1 - s0 < 0.5) return;
  const piece = (a, b) => { const l = subLine(e, a, b); if (l) BB.add(ribbon(l, w, 0.034, off), mat, new THREE.Matrix4(), { noShadow: true }); };
  if (!dash) { eachRun(e, key, s0, s1, piece); return; }
  for (let s = s0; s < s1; s += dash * 2) eachRun(e, key, s, Math.min(s1, s + dash), piece);
}
function buildRoadsTile(key) {
  const m = MATS.m;
  for (const e of T.edges) {
    if (!e.runs.has(key)) continue;
    eachRun(e, key, 0, e.len, (s0, s1) => { const l = subLine(e, s0, s1); if (l) BB.add(ribbon(l, e.w, 0.02), MATS.roadMat, new THREE.Matrix4(), { noShadow: true }); });
    const [ra, rb] = clearRange(e, 0.6, 0.6);
    if (e.rank >= 3) {
      lineAlong(e, key, ra, rb, e.w / 2 - 0.35, 0.15, m.lineWhite); lineAlong(e, key, ra, rb, -(e.w / 2 - 0.35), 0.15, m.lineWhite);
      if (!e.ow) { if (e.rank >= 4 || e.w >= 9) lineAlong(e, key, ra + 2, rb - 2, 0, 0.15, m.lineYellow); else lineAlong(e, key, ra + 2, rb - 2, 0, 0.15, m.lineWhite, 5); }
      else if (e.w > 7.5) lineAlong(e, key, ra + 2, rb - 2, 0, 0.13, m.lineWhite, 5);
      if (!e.ow && e.w >= 12) for (const sd of [1, -1]) lineAlong(e, key, ra + 2, rb - 2, sd * e.w / 4, 0.13, m.lineWhite, 5);
    } else if (e.rank === 2 && e.w >= 5) { lineAlong(e, key, ra, rb, e.w / 2 - 0.3, 0.13, m.lineWhite); lineAlong(e, key, ra, rb, -(e.w / 2 - 0.3), 0.13, m.lineWhite); }
    if (e.rank <= 2) { for (const sd of [1, -1]) lineAlong(e, key, ra, rb, sd * (e.w / 2 + 0.2), 0.42, m.curb); }
    else {
      for (const sd of [1, -1]) eachRun(e, key, ra + 0.5, rb - 0.5, (s0, s1) => {
        const l = subLine(e, s0, s1); if (!l) return;
        BB.add(ribbon(l, 2.3, 0.15, sd * (e.w / 2 + 1.15)), m.sidewalk, new THREE.Matrix4(), { noShadow: true });
        const edge = offsetLine(l, sd * (e.w / 2 + 0.02));
        for (let i = 0; i < edge.length - 1; i++) { const a = edge[i], b = edge[i + 1], L = V.len(V.sub(b, a)); if (L < 0.05) continue; const mid = V.mul(V.add(a, b), 0.5); BB.add(box(0.12, 0.16, L), m.curb, M(mid[0], 0.08, mid[1], rotOf(V.norm(V.sub(b, a)))), { noShadow: true }); }
        // 街路樹
        if (e.rank >= 4 && e.w >= 10) for (let s = s0 + 6; s < s1 - 3; s += 14) { const at = atS(e, s), p = V.add(at.p, V.mul(V.left(at.d), sd * (e.w / 2 + 1.8))); if (tileKeyOf(p[0], p[1]) === key) tree(p[0], p[1], 0.8); }
      });
    }
    if (e.br) for (const sd of [1, -1]) eachRun(e, key, 0, e.len, (s0, s1) => {
      const l = subLine(e, s0, s1); if (!l) return;
      const off = offsetLine(l, sd * (e.w / 2 + (hasSidewalk(e) ? 2.4 : 0.3)));
      for (let i = 0; i < off.length - 1; i++) { const a = off[i], b = off[i + 1], L = V.len(V.sub(b, a)); if (L < 0.1) continue; const mid = V.mul(V.add(a, b), 0.5); BB.add(box(0.25, 0.9, L), m.concrete, M(mid[0], 0.45, mid[1], rotOf(V.norm(V.sub(b, a))))); addWallCollider(a, b, 0.3, 0.9); }
    });
    if (e.rank >= 3 && e.len > 80) {
      const s = T.nodes[e.a].R + 8, at = atS(e, s);
      if (tileKeyOf(at.p[0], at.p[1]) === key) roadSign(String(e.limit), V.add(at.p, V.mul(V.left(at.d), e.w / 2 + 1.8)), at.d);
      if (e.rank >= 4 && e.len > 160) guideSign(e, atS(e, Math.min(e.len - 30, T.nodes[e.a].R + 40)), key);
    }
  }
  // 交差点の面・一時停止
  for (const n of T.nodes) {
    if (n.tile !== key || n.ends.length < 2) continue;
    const r = Math.max(...n.ends.map(x => x.e.w)) / 2 + (n.ends.length >= 3 ? 1.0 : 0);
    const g = new THREE.CircleGeometry(r, 20); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + n.x, -(p.getZ(i) + n.z));
    BB.add(g, MATS.roadMat, M(n.x, 0.02, n.z), { noShadow: true });
    for (const st of n.stops || []) {
      const { e, d } = st, left = V.left(d), half = e.w / 2;
      const c = V.add(st.p, V.mul(left, e.ow ? 0 : half / 2));
      BB.add(box(e.ow ? e.w - 0.6 : half - 0.3, 0.01, 0.45), MATS.m.lineWhite, M(c[0], 0.036, c[1], rotOf(d) + Math.PI / 2), { noShadow: true });
      if (st.long) stopText(V.sub(c, V.mul(d, 3.4)), d);
      roadSign('stop', V.add(st.p, V.mul(left, e.w / 2 + 0.45)), d, 0.7);
    }
  }
  for (const c of T.data.crossings) {
    if (tileKeyOf(c[0], c[1]) !== key) continue;
    const ne = nearestEdge(c[0], c[1], null, 6); if (!ne || ne.d > 3 || ne.e.rank < 2) continue;
    const e = ne.e, d = ne.dir, left = V.left(d);
    for (let k = -e.w / 2 + 0.5; k < e.w / 2 - 0.3; k += 0.9) { const p = V.add([ne.x, ne.z], V.mul(left, k + 0.22)); BB.add(box(0.45, 0.01, 3.5), MATS.m.lineWhite, M(p[0], 0.037, p[1], rotOf(d)), { noShadow: true }); }
  }
  for (const b of T.data.bus) {
    if (tileKeyOf(b[0], b[1]) !== key) continue;
    const ne = nearestEdge(b[0], b[1], null, 10); if (!ne) continue;
    roadSign('bus', V.add([ne.x, ne.z], V.mul(V.left(ne.dir), ne.side * (ne.e.w / 2 + 1.0))), ne.side > 0 ? ne.dir : V.mul(ne.dir, -1), 0.5);
  }
}
// 一時停止の場所（他の車も使うので、起動時にワールド全体で決める）
function stopInfo() {
  for (const n of T.nodes) {
    if (n.ends.length < 3 || n.signal) continue;
    n.stops = [];
    for (const { e, end } of n.ends) {
      const into = end === 'a' ? atS(e, 0) : atS(e, e.len), d = end === 'a' ? [-into.d[0], -into.d[1]] : into.d;
      const minor = e.rank < n.maxRank || (n.ends.every(x => x.e.rank === e.rank) && Math.abs(d[1]) > Math.abs(d[0]));
      if (!minor || e.rank >= 3 || (e.ow && end === 'a')) continue;
      const s = end === 'a' ? n.R + 0.9 : e.len - n.R - 0.9;
      if (s < 2 || s > e.len - 2) continue;
      n.stops.push({ e, d, p: atS(e, s).p, long: e.len > 8 });
    }
  }
}

// ---------------- 鉄道（地上の線路と、新幹線などの高架） ----------------
const _pier = new THREE.CylinderGeometry(0.12, 0.15, 7, 8);
function buildRailsTile(key) {
  for (const r of T.data.rails) {
    const pts = r.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (tileKeyOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) !== key) continue;
      const L = V.len(V.sub(b, a)); if (L < 0.2) continue;
      const d = V.norm(V.sub(b, a)), mid = V.mul(V.add(a, b), 0.5), rot = rotOf(d);
      const high = r.br || r.layer > 0 || r.hs;
      const y = high ? 9 : 0;
      if (high) {
        BB.add(box(5.2, 1.2, L + 0.05), MATS.m.concrete, M(mid[0], y - 0.6, mid[1], rot));
        for (const sd of [-1, 1]) BB.add(box(0.25, 1.1, L + 0.05), MATS.m.concrete, M(mid[0] + d[1] * sd * 2.5, y + 0.55, mid[1] - d[0] * sd * 2.5, rot));
        const nP = Math.max(1, Math.round(L / 20));
        for (let k = 0; k < nP; k++) { const p = V.add(a, V.mul(V.sub(b, a), (k + 0.5) / nP)); BB.add(box(1.6, y - 1.2, 1.6), MATS.m.concrete, M(p[0], (y - 1.2) / 2, p[1], rot)); addPoly(rectPts(p, [d[1], -d[0]], d, -0.8, 0.8, -0.8, 0.8), 9); }
      } else {
        BB.add(box(3.0, 0.12, L + 0.05), MATS.ballast, M(mid[0], 0.06, mid[1], rot), { noShadow: true });
      }
      if (r.k !== 'tram' || high) for (let k = 0; k < L; k += 0.6) { const p = V.add(a, V.mul(d, k + 0.3)); BB.add(box(2.2, 0.1, 0.22), MATS.sleeper, M(p[0], y + 0.12, p[1], rot), { noShadow: true }); }
      for (const sd of [-0.535, 0.535]) BB.add(box(0.08, 0.14, L + 0.05), MATS.rail, M(mid[0] + d[1] * sd, y + 0.2, mid[1] - d[0] * sd, rot));
      if (r.el && !high && i % 2 === 0) { const p = V.add(a, V.mul([d[1], -d[0]], 2.4)); BB.add(_pier, MATS.m.frame, M(p[0], 3.5, p[1])); BB.add(box(0.1, 0.1, 3.0), MATS.m.frame, M(mid[0] + d[1] * 1.0, 6.6, mid[1] - d[0] * 1.0, rot + Math.PI / 2)); addCircle(p[0], p[1], 0.2); }
    }
  }
}

// ---------------- 川（コンクリートの護岸と緑のフェンス） ----------------
function buildWaterTile(list) {
  const m = MATS.m;
  for (const w of list) {
    const pts = w.p; if (pts.length < 2) continue;
    BB.add(ribbon(pts, w.w, 0.012), MATS.water, new THREE.Matrix4(), { noShadow: true });
    for (const sd of [1, -1]) {
      BB.add(ribbon(pts, 0.5, 0.05, sd * (w.w / 2 + 0.25)), m.concrete, new THREE.Matrix4(), { noShadow: true });
      if (w.w < 1.8) continue;
      const fx = offsetLine(pts, sd * (w.w / 2 + 0.45));
      for (let i = 0; i < fx.length - 1; i++) {
        const a = fx[i], b = fx[i + 1], L = V.len(V.sub(b, a)), steps = Math.max(1, Math.ceil(L / 3));
        for (let k = 0; k < steps; k++) {
          const p = V.add(a, V.mul(V.sub(b, a), k / steps)), q = V.add(a, V.mul(V.sub(b, a), (k + 1) / steps)), mid = V.mul(V.add(p, q), 0.5);
          if (nearRoad(mid[0], mid[1], 1.5)) continue;
          BB.add(new THREE.PlaneGeometry(V.len(V.sub(q, p)), 1.1), MATS.fence, M(mid[0], 0.6, mid[1], rotOf(V.norm(V.sub(q, p))) + Math.PI / 2), { noShadow: true });
          BB.add(box(0.05, 1.15, 0.05), MATS.fenceAlu, M(p[0], 0.58, p[1]));
          addWallCollider(p, q, 0.12, 1.1);
        }
      }
    }
  }
}

// ---------------- 電柱・電線・街灯 ----------------
let lampHead = null;
const _poleGeo = new THREE.CylinderGeometry(0.13, 0.2, 11, 8), _trans = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10), _lampPole = new THREE.CylinderGeometry(0.08, 0.12, 8, 8);
function buildPolesTile(key) {
  const m = MATS.m, lines = [];
  if (!lampHead) { lampHead = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, emissive: 0xfff1d0, emissiveIntensity: 0 }); T.lampMats.push({ mat: lampHead, on: 2.5 }); }
  for (const e of T.edges) {
    if (!e.runs.has(key)) continue;
    const [ra, rb] = clearRange(e, 2, 2);
    if (rb - ra < 12) continue;
    if (e.rank <= 2) {
      let prev = null, k = 0;
      for (let s = ra; s <= rb; s += 27) {
        const at = atS(e, s);
        if (tileKeyOf(at.p[0], at.p[1]) !== key) { prev = null; continue; }
        const n = V.left(at.d), p = V.add(at.p, V.mul(n, e.w / 2 + 0.22));
        BB.add(_poleGeo, m.poleConcrete, M(p[0], 5.5, p[1]));
        const r = rotOf(at.d);
        BB.add(box(1.8, 0.1, 0.1), m.frameDark, M(p[0], 9.8, p[1], r + Math.PI / 2));
        BB.add(box(1.2, 0.08, 0.08), m.frameDark, M(p[0], 8.6, p[1], r + Math.PI / 2));
        if (k++ % 3 === 1) BB.add(_trans, m.frame, M(p[0] - n[0] * 0.45, 7.6, p[1] - n[1] * 0.45));
        // 防犯灯（小さな街灯）
        if (k % 2 === 0) { const q = V.sub(p, V.mul(n, 0.6)); BB.add(box(0.06, 0.06, 0.7), m.frame, M(q[0] + n[0] * 0.3, 5.0, q[1] + n[1] * 0.3, rotOf(n))); BB.add(box(0.36, 0.08, 0.16), lampHead, M(q[0], 4.95, q[1], rotOf(n)), { noShadow: true }); }
        addCircle(p[0], p[1], 0.25);
        if (prev) for (const [h, dx] of [[9.85, -0.8], [9.85, 0.8], [8.65, -0.5], [8.65, 0.5]]) {
          const a = [prev[0] + n[0] * dx, prev[1] + n[1] * dx], b = [p[0] + n[0] * dx, p[1] + n[1] * dx];
          for (let i = 0; i < 6; i++) { const t0 = i / 6, t1 = (i + 1) / 6, sag = (t) => 0.45 * Math.sin(Math.PI * t); lines.push(a[0] + (b[0] - a[0]) * t0, h - sag(t0), a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, h - sag(t1), a[1] + (b[1] - a[1]) * t1); }
        }
        prev = p;
      }
    } else {
      let side = 1;
      for (let s = ra + 6; s <= rb - 4; s += 32) {
        const at = atS(e, s);
        if (tileKeyOf(at.p[0], at.p[1]) === key) {
          const n = V.mul(V.left(at.d), side), p = V.add(at.p, V.mul(n, e.w / 2 + 1.6));
          BB.add(_lampPole, m.frame, M(p[0], 4, p[1]));
          const arm = V.sub(p, V.mul(n, 0.8)); BB.add(box(0.08, 0.08, 1.6), m.frame, M(arm[0], 7.95, arm[1], rotOf(n)));
          const hp = V.sub(p, V.mul(n, 1.55)); BB.add(box(0.5, 0.14, 0.28), lampHead, M(hp[0], 7.85, hp[1], rotOf(n)), { noShadow: true });
          addCircle(p[0], p[1], 0.2);
        }
        side = -side;
      }
    }
  }
  if (lines.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)); if (!MATS.wire) MATS.wire = new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55 }); BB.extra(new THREE.LineSegments(g, MATS.wire)); }
}

// ---------------- 信号機（タイルの分だけ見た目を作る） ----------------
const lampGeo = new THREE.CircleGeometry(0.13, 20); lampGeo.userData.shared = true;
function buildSignalsTile(key, dyn) {
  for (const s of T.signals) {
    if (s.tile !== key) continue;
    for (const ap of s.approaches) {
      const { d, e } = ap, left = V.left(d), half = e.ow ? e.w : e.w / 2;
      const c = V.add([ap.stop.x, ap.stop.z], V.mul(left, e.ow ? 0 : half / 2));
      BB.add(box(half - 0.3, 0.01, 0.45), MATS.m.lineWhite, M(c[0], 0.036, c[1], rotOf(d) + Math.PI / 2), { noShadow: true });
      for (let k = -e.w / 2 + 0.5; k < e.w / 2 - 0.3; k += 0.9) { const p = V.add(V.add([ap.stop.x, ap.stop.z], V.mul(d, 2.6)), V.mul(left, k + 0.22)); BB.add(box(0.45, 0.01, 3.2), MATS.m.lineWhite, M(p[0], 0.037, p[1], rotOf(d)), { noShadow: true }); }
      const far = V.add([s.x, s.z], V.mul(d, Math.max(8, Math.hypot(s.x - ap.stop.x, s.z - ap.stop.z) * 0.9)));
      const pole = V.add(far, V.mul(left, e.w / 2 + 1.0 + (hasSidewalk(e) ? 1.2 : 0)));
      BB.add(new THREE.CylinderGeometry(0.11, 0.13, 5.6, 10), A.mats.frame, M(pole[0], 2.8, pole[1]));
      addCircle(pole[0], pole[1], 0.2);
      const reach = e.w / 2 + 0.6, armMid = V.sub(pole, V.mul(left, reach / 2));
      BB.add(box(0.1, 0.1, reach), A.mats.frame, M(armMid[0], 5.5, armMid[1], rotOf(left)));
      const hp = V.sub(pole, V.mul(left, reach - 0.2));
      const g = new THREE.Group();
      const bx = new THREE.Mesh(box(1.25, 0.42, 0.25), A.mats.frame); g.add(bx); bx.castShadow = true;
      ['g', 'y', 'r'].forEach((k, i) => { const l = new THREE.Mesh(lampGeo, s.mats[ap.group][k]); l.position.set(-0.4 + i * 0.4, 0, 0.13); g.add(l); const hood = new THREE.Mesh(box(0.34, 0.04, 0.16), A.mats.frame); hood.position.set(-0.4 + i * 0.4, 0.16, 0.2); g.add(hood); });
      g.position.set(hp[0], 5.3, hp[1]); g.rotation.y = Math.atan2(-d[0], -d[1]); dyn.push(g);
    }
  }
}

// ---------------- 地図の端 ----------------
function buildBoundaryTile(key) {
  const [x0, z0, x1, z1] = T.bounds, p = 4;
  const [i, j] = key.split('_').map(Number), ni = T.data.meta.ni, nj = T.data.meta.nj;
  if (i === 0) addBox(x0 - p - 2, x0 - p, z0 - p, z1 + p, 3);
  if (i === ni - 1) addBox(x1 + p, x1 + p + 2, z0 - p, z1 + p, 3);
  if (j === 0) addBox(x0 - p, x1 + p, z0 - p - 2, z0 - p, 3);
  if (j === nj - 1) addBox(x0 - p, x1 + p, z1 + p, z1 + p + 2, 3);
  for (const n of T.nodes) {
    if (n.tile !== key || n.ends.length !== 1) continue;
    if (n.x > x0 + 8 && n.x < x1 - 8 && n.z > z0 + 8 && n.z < z1 - 8) continue;
    const { e, end } = n.ends[0], at = end === 'a' ? atS(e, 2) : atS(e, e.len - 2), l = V.left(at.d), r = rotOf(at.d) + Math.PI / 2;
    BB.add(box(e.w + 0.6, 0.25, 0.08), MATS.stripe, M(at.p[0], 0.85, at.p[1], r));
    for (const k of [-e.w / 2, e.w / 2]) { const q = V.add(at.p, V.mul(l, k)); BB.add(box(0.1, 1.0, 0.1), MATS.m.frame, M(q[0], 0.5, q[1], r)); }
    addWallCollider(V.add(at.p, V.mul(l, -e.w / 2 - 0.5)), V.add(at.p, V.mul(l, e.w / 2 + 0.5)), 0.6, 1);
  }
}

// =========================================================
// 営業所の見た目
// =========================================================
function buildDepot(dyn) {
  const m = MATS.m, D0 = T.depot, base = D0.base, rot = D0.rot;
  const L = (geo, mat, x, y, z, ry = 0, opts) => BB.add(geo, mat, base.clone().multiply(M(x, y, z, ry)), opts);
  const box2 = (x0, x1, z0, z1, h) => addLocalBox(base, x0, x1, z0, z1, h);
  const HW = DEPOT.W / 2, D = DEPOT.D;
  const yard = new THREE.PlaneGeometry(DEPOT.W, D); yard.rotateX(-Math.PI / 2);
  L(yard, MATS.concretePad, 0, 0.022, D / 2, 0, { noShadow: true });
  L(box(12, 0.02, frontOffset(D0.edge) - D0.edge.w / 2 + 0.2), m.asphalt, 0, 0.021, -(frontOffset(D0.edge) - D0.edge.w / 2) / 2, 0, { noShadow: true });
  const wallH = 1.6;
  const seg = (x0, x1, z) => { L(box(x1 - x0, wallH, 0.2), m.block, (x0 + x1) / 2, wallH / 2, z); box2(x0, x1, z - 0.15, z + 0.15, wallH); };
  const segZ = (x, z0, z1) => { L(box(0.2, wallH, z1 - z0), m.block, x, wallH / 2, (z0 + z1) / 2); box2(x - 0.15, x + 0.15, z0, z1, wallH); };
  seg(-HW, -6.5, 0.1); seg(6.5, HW, 0.1); segZ(-HW, 0, D); segZ(HW, 0, D); seg(-HW, HW, D);
  const wx0 = -26, wx1 = 14, wz0 = 18, wz1 = 46, wh = 7.5;
  const shell = (a, b, c, d, h, mat) => { L(box(b - a, h, d - c), mat, (a + b) / 2, h / 2, (c + d) / 2); box2(a, b, c, d, h); };
  shell(wx0, wx1, wz1 - 0.3, wz1, wh, m.metal); shell(wx0, wx0 + 0.3, wz0, wz1, wh, m.metal); shell(wx1 - 0.3, wx1, wz0, wz1, wh, m.metal);
  for (const [a, b] of [[wx0, -18], [-10, -4], [4, wx1]]) shell(a, b, wz0, wz0 + 0.3, wh, m.metal);
  for (const [a, b] of [[-18, -10], [-4, 4]]) { L(box(b - a, wh - 4.2, 0.3), m.metal, (a + b) / 2, 4.2 + (wh - 4.2) / 2, wz0 + 0.15); L(box(b - a, 0.6, 0.6), m.shutter, (a + b) / 2, 4.0, wz0 + 0.3); }
  L(box(wx1 - wx0 + 1, 0.3, wz1 - wz0 + 1), m.metalBlue, (wx0 + wx1) / 2, wh + 0.15, (wz0 + wz1) / 2);
  const fl = new THREE.PlaneGeometry(wx1 - wx0 - 0.6, wz1 - wz0 - 0.6); fl.rotateX(-Math.PI / 2);
  L(fl, MATS.concretePad, (wx0 + wx1) / 2, 0.03, (wz0 + wz1) / 2, 0, { noShadow: true });
  const signMat = new THREE.MeshStandardMaterial({ map: textTexture(1024, 128, (c, w, h) => { c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, w, h); c.fillStyle = '#2f7d4f'; c.fillRect(0, 0, 120, h); c.fillStyle = '#fff'; c.font = `bold 70px ${JP_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('あ', 60, h / 2 + 4); c.fillStyle = '#2b3440'; c.font = `bold 60px ${JP_FONT}`; c.fillText('あおば運輸　あおば町営業所', 570, h / 2 + 4); }), roughness: 0.5 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), signMat); sign.position.copy(localToWorld(base, -6, 5.9, wz0 - 0.02)); sign.rotation.y = rot + Math.PI; dyn.push(sign);
  const pole = new THREE.Mesh(box(0.25, 4, 0.25), m.frame); pole.position.copy(localToWorld(base, 9, 2, 0.6)); pole.rotation.y = rot; dyn.push(pole);
  const ps = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), signMat); ps.position.copy(localToWorld(base, 9, 3.6, 0.45)); ps.rotation.y = rot + Math.PI; dyn.push(ps);
  const table = (tx, tz) => { L(box(3.0, 0.06, 1.2), m.frame, tx, 0.85, tz); for (const [dx, dz] of [[-1.4, -0.5], [1.4, -0.5], [-1.4, 0.5], [1.4, 0.5]]) L(box(0.06, 0.85, 0.06), m.frame, tx + dx, 0.425, tz + dz); L(box(3.0, 0.04, 1.2), m.frame, tx, 0.25, tz); box2(tx - 1.5, tx + 1.5, tz - 0.6, tz + 0.6, 0.9); };
  for (let k = 0; k < 3; k++) table(-22 + k * 3.4, 30);
  for (let k = 0; k < 2; k++) table(-22 + k * 3.4, 35);
  const crate = new THREE.Group();
  for (let k = 0; k < 2; k++) { const c = model('plastic_crate_01'); c.scale.setScalar(2.2); c.position.set(k * 0.7, 0, 0); crate.add(c); }
  crate.position.copy(localToWorld(base, -11.4, 0, 34.5)); crate.rotation.y = rot; dyn.push(crate);
  box2(-11.8, -10.3, 34, 35, 0.6);
  const crateSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), signMaterialStatic('仕分け戻し')); crateSign.position.copy(localToWorld(base, -11.05, 1.15, 34.0)); crateSign.rotation.y = rot + Math.PI; dyn.push(crateSign);
  L(box(0.04, 1.2, 0.04), m.frame, -11.05, 0.6, 34.05);
  if (!D0.whiteboard) D0.whiteboard = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  D0.whiteboard.position.copy(localToWorld(base, 0, 1.7, wz1 - 0.35)); D0.whiteboard.rotation.y = rot + Math.PI; dyn.push(D0.whiteboard);
  L(box(3.4, 1.8, 0.05), m.frame, 0, 1.7, wz1 - 0.32);
  L(box(1.6, 0.05, 0.8), m.cedar, 5, 0.74, 42);
  for (const [dx, dz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) L(box(0.05, 0.74, 0.05), m.frame, 5 + dx, 0.37, 42 + dz);
  box2(4.2, 5.8, 41.6, 42.4, 0.8);
  const clip = model('cardboard_box_01'); clip.scale.set(0.8, 0.25, 0.6); clip.position.copy(localToWorld(base, 5, 0.77, 42)); clip.rotation.y = rot; dyn.push(clip);
  const hand = model('hand_truck'); hand.position.copy(localToWorld(base, 10, 0, 40)); hand.rotation.y = rot - 0.6; dyn.push(hand);
  for (const x of [-18, -2]) { const pl = new THREE.PointLight(0xfff2dd, 30, 22, 1.6); pl.position.copy(localToWorld(base, x, 6.5, 32)); dyn.push(pl); L(box(1.2, 0.08, 0.3), m.white, x, 7.1, 32, 0, { noShadow: true }); }
  for (let k = 0; k < 3; k++) L(box(1.1, 0.14, 1.1), m.cedar, 18 + k * 1.4, 0.07, 30);
}

// =========================================================
// 建物1棟と、その敷地
// =========================================================
function houseFrame(it) {
  // 建物を長方形とみなし、道路に向いた辺を正面（ローカル -z）にする
  if (it.frame) return it.frame;
  const { o } = it;
  const toRoad = it.n ? V.mul(it.n, -1) : [0, -1];
  let best = null;
  for (const [ax, along, depth] of [[o.v, o.L, o.W], [V.mul(o.v, -1), o.L, o.W], [o.u, o.W, o.L], [V.mul(o.u, -1), o.W, o.L]]) {
    const sc = V.dot(ax, toRoad);
    if (!best || sc > best.sc) best = { sc, nrm: ax, W: along, D: depth };
  }
  const f = best.nrm; // 正面の外向き
  const rot = Math.atan2(-f[0], -f[1]); // ローカル -z を f に向ける
  const W = Math.max(3, best.W), D = Math.max(3.5, Math.min(best.D, it.area / Math.max(1, best.W) * (it.rect < 0.85 ? 1.05 : 1)));
  // 奥行きを縮めたぶん、正面側に寄せる
  const shift = (best.D - D) / 2;
  const cx = o.cx + f[0] * shift, cz = o.cz + f[1] * shift;
  const base = new THREE.Matrix4().makeRotationY(rot).setPosition(cx, 0, cz);
  const ux = [Math.cos(rot), -Math.sin(rot)], uz = [Math.sin(rot), Math.cos(rot)];
  const rect = rectPts([cx, cz], ux, uz, -W / 2, W / 2, -D / 2, D / 2);
  it.frame = { base, rot, W, D, f, rect, cx, cz, ux };
  return it.frame;
}
function buildBuilding(it, dyn, tile) {
  const out = { B: BB };
  const k = it.kind;
  const rectish = it.rect > 0.62 || it.area < 200;
  if ((k === 'house' || k === 'farmhouse' || k === 'shop' || k === 'temple') && rectish) {
    const fr = houseFrame(it);
    const resident = !!it.id && (k === 'house' || k === 'farmhouse');
    if (k === 'shop') {
      it.H = buildShop(out, { base: fr.base, W: fr.W, D: fr.D, seed: it.seed, kind: 'shop', floors: 2, color: it.shopColor }).H;
    } else {
      // 玄関は門の近く：門の位置が正面のどこにあたるか
      let doorT = null;
      if (it.lot) { const lx = (it.lot.cx - fr.cx) * fr.ux[0] + (it.lot.cz - fr.cz) * fr.ux[1]; doorT = Math.max(1.0, Math.min(fr.W - 1.0, lx + fr.W / 2)); }
      const res = buildDetachedHouse(out, { base: fr.base, W: fr.W, D: fr.D, floors: k === 'temple' ? 1 : it.floors, seed: it.seed, doorT, wantDoor: resident, style: k === 'temple' || k === 'farmhouse' ? 'wa' : null });
      it.H = res.H; it.doorInfo = res.door;
    }
    addPoly(fr.rect, it.H || 6);
  } else if (k === 'apart' && rectish && it.area < 700) {
    const fr = houseFrame(it);
    const res = buildApartment(out, { base: fr.base, W: fr.W, D: fr.D, floors: Math.min(3, it.floors), seed: it.seed });
    it.H = res.H; it.apt = res;
    addPoly(fr.rect, res.H);
  } else if ((k === 'mansion' || (k === 'apart' && rectish)) && it.rect > 0.75) {
    const fr = houseFrame(it);
    it.H = buildMansion(out, { base: fr.base, W: fr.W, D: fr.D, floors: Math.max(3, it.floors), seed: it.seed }).H;
    addPoly(fr.rect, it.H);
  } else if ((k === 'conbini' || k === 'store') && rectish && it.area < 900) {
    const fr = houseFrame(it);
    it.H = buildShop(out, { base: fr.base, W: fr.W, D: fr.D, seed: it.seed, kind: k === 'conbini' ? 'conbini' : 'shop', floors: Math.min(3, it.floors || 2) }).H;
    addPoly(fr.rect, it.H);
    if (k === 'conbini') {
      const sw = Math.min(fr.W, 9);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.156), signMaterial(it.shopName || 'あおばマート', '#2f7d4f'));
      sign.position.copy(localToWorld(fr.base, 0, 3.62, -fr.D / 2 - 0.16)); sign.rotation.y = fr.rot + Math.PI; dyn.push(sign);
    }
  } else if (k === 'warehouse' && rectish) {
    const fr = houseFrame(it);
    it.H = buildWarehouse(out, { base: fr.base, W: fr.W, D: fr.D, seed: it.seed }).H;
    addPoly(fr.rect, it.H);
  } else if (k === 'shed') {
    const fr = houseFrame(it), r = seeded(it.seed);
    const L2 = (geo, mat, x, y, z) => BB.add(geo, mat, fr.base.clone().multiply(M(x, y, z)));
    const garage = it.area > 14 && r() < 0.5;
    L2(box(fr.W, 2.3, fr.D), garage ? MATS.m.metal : r() < 0.5 ? MATS.m.sidingDark : MATS.m.metalBlue, 0, 1.15, 0);
    L2(box(fr.W + 0.2, 0.08, fr.D + 0.2), MATS.m.frameDark, 0, 2.34, 0);
    if (garage) L2(box(Math.min(fr.W - 0.4, 2.6), 2.0, 0.04), MATS.m.shutter, 0, 1.0, -fr.D / 2 - 0.02);
    addPoly(fr.rect, 2.3);
  } else {
    // 形の複雑な建物・ビル：輪郭どおりに立ち上げ、窓の並んだ外壁と平らな屋根
    const H = 0.3 + Math.max(1, it.floors) * 3.4;
    const mat = MATS.office[it.seed % MATS.office.length];
    BB.add(wallsGeo(it.pts, 0, H), mat, new THREE.Matrix4());
    BB.add(wallsGeo(it.pts, H, H + 0.9), MATS.m.concrete, new THREE.Matrix4());
    BB.add(polyFill(it.pts, H + 0.05), MATS.flatRoof, new THREE.Matrix4());
    const r = seeded(it.seed);
    for (let i = 0; i < Math.min(6, Math.floor(it.area / 200)); i++) {
      const x = it.o.cx + it.o.u[0] * (r() - 0.5) * it.o.L * 0.6 + it.o.v[0] * (r() - 0.5) * it.o.W * 0.6, z = it.o.cz + it.o.u[1] * (r() - 0.5) * it.o.L * 0.6 + it.o.v[1] * (r() - 0.5) * it.o.W * 0.6;
      if (pointInPoly(x, z, it.pts)) BB.add(box(2 + r() * 2, 1.2 + r(), 1.2 + r()), MATS.m.metal, M(x, H + 0.6, z, rotOf(it.o.u)));
    }
    it.H = H;
    addPoly(it.pts, H);
  }
  // 敷地（門・塀・表札・配達の目印）
  if (it.lot && !it.lot.built) {
    const lot = it.lot;
    try {
      if (lot.kind === 'mansion') makeMansionLot(lot, it, dyn);
      else if (lot.kind === 'apart' && it.id === '2-B2-1' && it.apt) makeApartLot(lot, it, dyn);
      else if (lot.kind === 'shop' || lot.kind === 'conbini' || lot.kind === 'store') makeShopLot(lot, it, dyn);
      else if (lot.kind === 'apart') makeOpenLot(lot, it);
      else makeHouseLot(lot, it, dyn);
      lot.built = true;
      tile.lots.push(lot); T.lotList.push(lot);
    } catch (err) { console.warn('lot', lot.id, err); }
  }
}

// ---------------- 敷地の部品 ----------------
function lotFrame(L, s) {
  const e = L.e, at = atS(e, s), n = V.mul(V.left(at.d), L.side), off = frontOffset(e), o = V.add(at.p, V.mul(n, off)), rot = rotOf(n);
  return { base: new THREE.Matrix4().makeRotationY(rot).setPosition(o[0], 0, o[1]), rot, n, t: at.d, o };
}
function wallRun(L, sa, sb, style, h) {
  if (sb - sa < 0.3) return;
  const e = L.e, off = frontOffset(e), m = MATS.m, line = subLine(e, sa, sb); if (!line) return;
  const pts = offsetLine(line, L.side * off);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = V.len(V.sub(b, a)); if (len < 0.1) continue;
    const mid = V.mul(V.add(a, b), 0.5), r = rotOf(V.norm(V.sub(b, a)));
    if (style === 'block') { BB.add(box(0.15, h, len), m.block, M(mid[0], h / 2, mid[1], r)); BB.add(box(0.2, 0.06, len), m.concrete, M(mid[0], h + 0.03, mid[1], r)); }
    else if (style === 'fence') { BB.add(box(0.15, 0.45, len), m.block, M(mid[0], 0.225, mid[1], r)); const fg = new THREE.PlaneGeometry(len, h - 0.45); const uv = fg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len * 4); BB.add(fg, MATS.slats, M(mid[0], 0.45 + (h - 0.45) / 2, mid[1], r + Math.PI / 2)); }
    else if (style === 'hedge') { BB.add(box(0.6, 1.0, len), MATS.leaf, M(mid[0], 0.5, mid[1], r)); BB.add(box(0.2, 0.25, len), m.block, M(mid[0], 0.12, mid[1], r)); }
    else if (style === 'wood') { BB.add(box(0.15, 0.4, len), m.block, M(mid[0], 0.2, mid[1], r)); BB.add(box(0.06, h - 0.4, len), m.cedarDark, M(mid[0], 0.4 + (h - 0.4) / 2, mid[1], r)); }
    if (style !== 'none') addWallCollider(a, b, 0.2, style === 'hedge' ? 1.0 : h);
  }
}
function postAt(L, s, h = 1.35) {
  const e = L.e, at = atS(e, s), n = V.mul(V.left(at.d), L.side), p = V.add(at.p, V.mul(n, frontOffset(e)));
  BB.add(box(0.34, h, 0.34), MATS.m.stucco, M(p[0], h / 2, p[1], rotOf(n)));
  BB.add(box(0.4, 0.06, 0.4), MATS.m.concrete, M(p[0], h + 0.03, p[1], rotOf(n)));
  addCircle(p[0], p[1], 0.22);
  return { p, n };
}
let btnMat = null;
function intercomOn(post, plate, addr) {
  const m = MATS.m, o = V.mul(post.n, -1);
  const at = (k) => [post.p[0] + o[0] * k, post.p[1] + o[1] * k];
  if (!btnMat) btnMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0x88aaff, emissiveIntensity: 0.4 });
  const face = Math.atan2(o[0], o[1]);
  let q = at(0.175); BB.add(plate.g, plate.m, M(q[0], 1.18, q[1], face), { noShadow: true });
  q = at(0.19); BB.add(box(0.11, 0.16, 0.04), m.frameDark, M(q[0], 0.98, q[1], face));
  q = at(0.215); BB.add(new THREE.CircleGeometry(0.018, 12), btnMat, M(q[0], 0.96, q[1], face), { noShadow: true });
  if (addr) { q = at(0.175); BB.add(addr.g, addr.m, M(q[0], 1.42, q[1], face), { noShadow: true }); }
  const ip = at(0.5);
  return new THREE.Vector3(ip[0], 1.0, ip[1]);
}
function mailboxNear(L, s) {
  const e = L.e, at = atS(e, s), n = V.mul(V.left(at.d), L.side), p = V.add(at.p, V.mul(n, frontOffset(e) - 0.05));
  BB.add(box(0.34, 0.3, 0.14), MATS.m.frameDark, M(p[0], 1.0, p[1], rotOf(n)));
  const q = V.sub(p, V.mul(n, 0.45));
  return new THREE.Vector3(q[0], 1.0, q[1]);
}
function frontPoint(L, s) { const at = atS(L.e, s); const p = V.add(at.p, V.mul(V.left(at.d), L.side * (L.e.ow ? 0 : L.e.w / 4))); return new THREE.Vector3(p[0], 0, p[1]); }
// 玄関（家の正面の扉）：動く扉は配達先の家だけ
function doorPoints(lot, it, dyn, dynamic) {
  const fr = it.frame, di = it.doorInfo;
  if (!fr) return null;
  const nf = fr.f, d = fr.ux;
  const doorT = di ? di.t : fr.W / 2;
  const lx = doorT - fr.W / 2;
  const dp = [fr.cx + d[0] * lx + nf[0] * (fr.D / 2), fr.cz + d[1] * lx + nf[1] * (fr.D / 2)];
  const base = di ? di.y : 0.45;
  if (dynamic) {
    const door = new THREE.Group();
    const old = di && di.old;
    const leaf = new THREE.Mesh(box(0.92, 2.08, 0.06), old ? MATS.m.cedarDark : MATS.m.frameDark); leaf.position.set(0.46, 1.04, 0); leaf.castShadow = true;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.7), MATS.m.glass); glass.position.set(0.68, 1.05, 0.032);
    const glass2 = glass.clone(); glass2.position.z = -0.032; glass2.rotation.y = Math.PI;
    const knob = new THREE.Mesh(box(0.04, 0.3, 0.05), MATS.m.chrome); knob.position.set(0.12, 1.0, 0.05);
    door.add(leaf, glass, glass2, knob);
    // 蝶番は玄関の右端。扉は正面の外側に向けて開く
    const hinge = V.add(dp, V.mul(d, 0.46));
    door.position.set(hinge[0] + nf[0] * 0.05, base, hinge[1] + nf[1] * 0.05);
    door.rotation.y = Math.atan2(d[1], -d[0]);
    dyn.push(door);
    const sign = -1;
    lot.doors.push({ obj: door, open: 0, target: 0, sign, base: door.rotation.y });
  }
  lot.doorN = nf; lot.doorD = d;
  lot.points.door = new THREE.Vector3(dp[0] + nf[0] * 1.3, 1.2, dp[1] + nf[1] * 1.3);
  lot.points.porch = new THREE.Vector3(dp[0] + nf[0] * 0.9 + d[0] * 0.7, base, dp[1] + nf[1] * 0.9 + d[1] * 0.7);
  return { dp, nf, d };
}
function makeHouseLot(lot, it, dyn) {
  const L = lot.L, m = MATS.m, r = seeded(it.seed + 99);
  const farm = lot.kind === 'farmhouse', res = lot.residents[0], special = !!res;
  const sMid = Math.max(L.s0 + 2.3, Math.min(L.s1 - 1.6, it.ne.s));
  const F = lotFrame(L, sMid);
  const sx = (s) => -L.side * (s - sMid);
  lot.base = F.base; lot.rot = F.rot;
  const open = it.gapWall < 1.0;
  const style = farm ? 'wood' : open ? 'none' : special ? (r() < 0.7 ? 'block' : 'fence') : ['block', 'block', 'block', 'fence', 'hedge', 'none', 'fence', 'wood'][Math.floor(r() * 8)];
  const h = 1.0 + r() * 0.35, g0 = sMid - 2.0, g1 = sMid + 0.9;
  const plate = PL.plane(0.26, 0.13, nameDraw(lot.surname)), addr = PL.plane(0.3, 0.12, addrDraw(lot.address.replace('あおば町', '')));
  if (farm) {
    wallRun(L, L.s0, sMid - 1.6, 'wood', 1.5); wallRun(L, sMid + 1.6, L.s1 - 2.6, 'wood', 1.5);
    // 瓦屋根の門（冠木門）
    const K = initHouseKit();
    for (const x of [-1.6, 1.6]) { const p = localToWorld(F.base, x, 0, 0); BB.add(box(0.22, 2.2, 0.22), m.cedarDark, M(p.x, 1.1, p.z, F.rot)); addCircle(p.x, p.z, 0.15); }
    const beam = localToWorld(F.base, 0, 0, 0); BB.add(box(3.6, 0.2, 0.25), m.cedarDark, M(beam.x, 2.1, beam.z, F.rot));
    BB.add(box(4.2, 0.12, 1.1), K.roofMat('kawara', 0x5e6266), M(beam.x, 2.35, beam.z, F.rot));
    lot.points.frontGate = localToWorld(F.base, 0, 1.2, -0.5);
    lot.points.intercom = intercomOn(postAt(L, L.s1 - 2.4), plate, addr);
    lot.points.mailbox = mailboxNear(L, L.s1 - 1.8);
  } else {
    if (style !== 'none') { wallRun(L, L.s0, g0, style, h); wallRun(L, g1 + 0.35, L.s1, style, h); }
    lot.points.intercom = intercomOn(postAt(L, g1 + 0.17), plate, addr);
    lot.points.mailbox = mailboxNear(L, g1 + 0.65);
  }
  const door = doorPoints(lot, it, dyn, special);
  const depth = Math.max(0.5, Math.min(it.gapWall, 6.5));
  if (!open && !farm) {
    const c = localToWorld(F.base, sx((g0 + g1) / 2), 0, depth / 2);
    BB.add(box(g1 - g0 + 0.4, 0.04, depth), MATS.concretePad, M(c.x, 0.03, c.z, F.rot), { noShadow: true });
    if (door) {
      const fromP = F.o, toP = [door.dp[0] + door.nf[0] * 0.5, door.dp[1] + door.nf[1] * 0.5], len = V.len(V.sub(toP, fromP));
      if (len > 1) { const mid = V.mul(V.add(fromP, toP), 0.5); BB.add(box(1.1, 0.035, len), MATS.concretePad, M(mid[0], 0.025, mid[1], rotOf(V.norm(V.sub(toP, fromP)))), { noShadow: true }); }
    }
    // カーポートと車・自転車
    if (it.gapWall > 4.8 && r() < 0.65) {
      const cxl = sx(g0 - 1.6), K = initHouseKit();
      const ok = [[cxl - 1, 0.5], [cxl + 1, 0.5], [cxl + 1, 4.8], [cxl - 1, 4.8]].every(([x, z]) => { const w = localToWorld(F.base, x, 0, z); return !pointInPoly(w.x, w.z, it.frame.rect); });
      if (ok) {
        const cc = localToWorld(F.base, cxl, 0, 2.6);
        if (r() < 0.5) {
          for (const pz of [0.6, 4.7]) { const p = localToWorld(F.base, cxl + 1.45, 0, pz); BB.add(box(0.1, 2.3, 0.1), K.alu, M(p.x, 1.15, p.z, F.rot)); addCircle(p.x, p.z, 0.1); }
          const rp = localToWorld(F.base, cxl, 0, 2.65); BB.add(box(3.0, 0.05, 5.0), K.polycarb, M(rp.x, 2.35, rp.z, F.rot), { noShadow: true });
          for (const dz of [-2.5, 2.5]) { const q = localToWorld(F.base, cxl, 0, 2.65 + dz); BB.add(box(3.1, 0.12, 0.12), K.alu, M(q.x, 2.3, q.z, F.rot)); }
        }
        I.add('covered_car', M(cc.x, 0, cc.z, F.rot + (r() < 0.5 ? 0 : Math.PI)));
        addLocalBox(F.base, cxl - 0.9, cxl + 0.9, 0.4, 4.8, 1.6);
        const pad = localToWorld(F.base, cxl, 0, Math.min(depth, 5.4) / 2); BB.add(box(2.8, 0.04, Math.min(depth, 5.4)), MATS.concretePad, M(pad.x, 0.03, pad.z, F.rot), { noShadow: true });
      }
    }
    if (r() < 0.45) { const p = localToWorld(F.base, sx(g1 + 1.2), 0, 1.1); bicycle([p.x, p.z], F.rot + Math.PI / 2 + (r() - 0.5) * 0.4); }
  }
  if ((res && res.okihai === '宅配ボックス') || (!res && r() < 0.22)) {
    const bx = sx(g1 - 0.4), b = localToWorld(F.base, bx, 0, 0.45);
    BB.add(box(0.5, 0.95, 0.45), m.metalBlue, M(b.x, 0.475, b.z, F.rot));
    addLocalBox(F.base, bx - 0.25, bx + 0.25, 0.22, 0.68, 1);
    lot.points.box = localToWorld(F.base, bx, 0.9, -0.1);
  }
  if (farm || (res && res.okihai === '物置') || (!res && r() < 0.2)) {
    for (const shX of [sx(g0 - 1.5), sx(g1 + 1.6)]) {
      const corners = [[-1, 0.9], [1, 0.9], [1, 1.9], [-1, 1.9]].map(([x, z]) => { const w = localToWorld(F.base, shX + x, 0, z); return [w.x, w.z]; });
      if (corners.some(p => pointInPoly(p[0], p[1], it.frame ? it.frame.rect : it.pts)) || it.gapWall < 2.2) continue;
      const c = localToWorld(F.base, shX, 0, 1.4);
      BB.add(box(1.8, 1.9, 0.95), m.metal, M(c.x, 0.95, c.z, F.rot)); BB.add(box(1.9, 0.06, 1.05), m.frameDark, M(c.x, 1.93, c.z, F.rot));
      addLocalBox(F.base, shX - 0.9, shX + 0.9, 0.92, 1.88, 1.9);
      lot.points.shed = localToWorld(F.base, shX, 0.9, 0.55);
      break;
    }
    if (!lot.points.shed && res && res.okihai === '物置' && door) {
      const p = [door.dp[0] + door.nf[0] * 0.9 - door.d[0] * 1.6, door.dp[1] + door.nf[1] * 0.9 - door.d[1] * 1.6];
      BB.add(box(1.2, 1.5, 0.7), m.metal, M(p[0], 0.75, p[1], rotOf(door.nf)));
      lot.points.shed = new THREE.Vector3(p[0] + door.nf[0] * 0.7, 0.9, p[1] + door.nf[1] * 0.7);
    }
  }
  // 植木と植木鉢
  if (r() < 0.6 && !open) { const p = localToWorld(F.base, sx(g1 + 1.4), 0, 0.9); bush(p.x, p.z, 1); }
  if (door) for (let i = 0; i < Math.floor(r() * 4); i++) { const p = [door.dp[0] + door.nf[0] * (0.5 + r() * 0.3) + door.d[0] * (1.0 + i * 0.35), door.dp[1] + door.nf[1] * (0.5 + r() * 0.3) + door.d[1] * (1.0 + i * 0.35)]; pot(p, r); }
  lot.points.front = frontPoint(L, sMid);
  lot.cx = F.o[0]; lot.cz = F.o[1];
}
const _potGeo = new THREE.CylinderGeometry(0.16, 0.12, 0.28, 10);
function pot(p, r) {
  BB.add(_potGeo, r() < 0.5 ? MATS.m.cedar : MATS.m.white, M(p[0], 0.14, p[1]));
  BB.add(_blob, MATS.leaf, M(p[0], 0.42, p[1], r() * 6, 0.55, 0.5, 0.55));
}
// 自転車（ママチャリ風）
const _wheel = new THREE.TorusGeometry(0.31, 0.025, 6, 20);
function bicycle(p, rot) {
  const K = initHouseKit(), base = M(p[0], 0, p[1], rot);
  const P = (geo, mat, x, y, z, rx = 0, ry = 0) => BB.add(geo, mat, base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1))));
  P(_wheel, K.black, 0, 0.33, -0.52, 0, Math.PI / 2); P(_wheel, K.black, 0, 0.33, 0.52, 0, Math.PI / 2);
  P(box(0.03, 0.03, 0.9), K.steel, 0, 0.55, 0, 0.3); P(box(0.03, 0.55, 0.03), K.steel, 0, 0.62, 0.25, -0.3);
  P(box(0.12, 0.05, 0.25), K.black, 0, 0.88, 0.3); P(box(0.55, 0.03, 0.03), K.alu, 0, 0.98, -0.45);
  P(box(0.35, 0.22, 0.28), K.alu, 0, 0.85, -0.68);
}
function makeOpenLot(lot, it) {
  const L = lot.L, sMid = Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s)), F = lotFrame(L, sMid);
  lot.base = F.base; lot.rot = F.rot;
  const fr = it.frame;
  if (fr) {
    const nf = fr.f, dp = [fr.cx + nf[0] * fr.D / 2, fr.cz + nf[1] * fr.D / 2];
    lot.doorN = nf;
    lot.points.door = new THREE.Vector3(dp[0] + nf[0] * 1.6, 1.2, dp[1] + nf[1] * 1.6);
    lot.points.porch = new THREE.Vector3(dp[0] + nf[0] * 1.0, 0.05, dp[1] + nf[1] * 1.0);
  } else { lot.points.door = new THREE.Vector3(F.o[0], 1.2, F.o[1]); lot.points.porch = new THREE.Vector3(F.o[0], 0.05, F.o[1]); }
  lot.points.intercom = lot.points.door;
  lot.points.front = frontPoint(L, sMid);
  lot.cx = F.o[0]; lot.cz = F.o[1];
}
function makeShopLot(lot, it, dyn) {
  const L = lot.L, sMid = Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s)), F = lotFrame(L, sMid);
  lot.base = F.base; lot.rot = F.rot;
  const fr = it.frame;
  if (fr) {
    const nf = fr.f, dp = [fr.cx + nf[0] * fr.D / 2, fr.cz + nf[1] * fr.D / 2];
    lot.doorN = nf;
    lot.points.door = new THREE.Vector3(dp[0] + nf[0] * 1.2, 1.2, dp[1] + nf[1] * 1.2);
    lot.points.porch = new THREE.Vector3(dp[0] + nf[0] * 0.8 + fr.ux[0] * 1.4, 0.05, dp[1] + nf[1] * 0.8 + fr.ux[1] * 1.4);
    lot.cx = dp[0]; lot.cz = dp[1];
    if (lot.kind === 'shop' && it.shopName) {
      const w = Math.min(fr.W - 0.4, 6);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.156), signMaterial(it.shopName, '#' + (it.shopColor || 0x5b4632).toString(16).padStart(6, '0')));
      sign.position.set(dp[0] + nf[0] * 0.1, 3.25, dp[1] + nf[1] * 0.1); sign.rotation.y = rotOf(nf); dyn.push(sign);
    }
    if (lot.kind === 'conbini') for (let k = -3; k <= 3; k++) { const p = localToWorld(fr.base, k * 2.6, 0, -fr.D / 2 - 3.5); BB.add(box(0.12, 0.01, 5), MATS.m.lineWhite, M(p.x, 0.04, p.z, fr.rot), { noShadow: true }); }
  } else { lot.points.door = new THREE.Vector3(F.o[0], 1.2, F.o[1]); lot.points.porch = new THREE.Vector3(F.o[0], 0.05, F.o[1]); lot.cx = F.o[0]; lot.cz = F.o[1]; }
  lot.points.intercom = lot.points.door;
  lot.points.front = frontPoint(L, sMid);
}
function makeMansionLot(lot, it, dyn) {
  const L = lot.L, m = MATS.m, fr = houseFrame(it), sMid = Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s)), F = lotFrame(L, sMid);
  lot.base = F.base; lot.rot = F.rot; lot.name = 'グランあおば';
  const nf = fr.f, dp = [fr.cx + nf[0] * fr.D / 2, fr.cz + nf[1] * fr.D / 2];
  const base = new THREE.Matrix4().makeRotationY(fr.rot).setPosition(dp[0], 0, dp[1]);
  // base のローカル -z が道路側
  const Lc = (geo, mat, x, y, z) => BB.add(geo, mat, base.clone().multiply(M(x, y, z)));
  Lc(box(5, 0.25, 2.6), m.concrete, 0, 3.0, -1.3);
  for (const x of [-2.4, 2.4]) Lc(box(0.3, 3.0, 0.3), m.concrete, x, 1.5, -2.5);
  Lc(box(0.35, 1.25, 0.25), m.frameDark, -2.0, 0.62, -1.4); addLocalBox(base, -2.2, -1.8, -1.55, -1.25, 1.3);
  lot.points.intercom = localToWorld(base, -2.0, 1.1, -2.0);
  Lc(box(2.4, 1.9, 0.5), m.metalBlue, -4.4, 0.95, -0.3);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) Lc(box(0.52, 0.55, 0.02), m.frame, -5.25 + c * 0.57, 0.4 + r * 0.6, -0.56);
  lot.points.box = localToWorld(base, -4.4, 1.0, -1.1);
  Lc(box(2.0, 1.2, 0.4), m.frame, 3.8, 0.9, -0.25);
  lot.points.mailbox = localToWorld(base, 3.8, 1.0, -1.0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), signMaterialStatic('グランあおば')); sign.position.copy(localToWorld(base, 0, 3.4, -2.62)); sign.rotation.y = fr.rot + Math.PI; dyn.push(sign);
  lot.points.door = lot.points.intercom;
  lot.points.porch = localToWorld(base, -1.0, 0.05, -1.6);
  lot.points.front = frontPoint(L, sMid);
  lot.cx = dp[0]; lot.cz = dp[1];
}
function makeApartLot(lot, it, dyn) {
  const L = lot.L, fr = it.frame, apt = it.apt, m = MATS.m;
  lot.name = 'メゾンあおば';
  lot.base = fr.base; lot.rot = fr.rot;
  const Wl = (x, y, z) => localToWorld(fr.base, x, y, z);
  const Z = fr.D / 2;
  lot.rooms = apt.rooms.map(r => ({
    room: r.room, floor: r.floor,
    door: Wl(r.x, (r.floor ? 3.1 : 0) + 1.2, -Z - (r.floor ? 0.8 : 1.0)),
    intercom: Wl(r.x - 0.65, (r.floor ? 3.1 : 0) + 1.2, -Z - (r.floor ? 0.8 : 1.0)),
    meter: Wl(r.meterX, (r.floor ? 3.1 : 0) + 0.9, -Z - (r.floor ? 0.8 : 0.9)),
    porch: Wl(r.x + 0.4, (r.floor ? 3.1 : 0) + 0.05, -Z - 0.5),
  }));
  lot.points.stairs = Wl(apt.stairs.x, 0.5, apt.stairs.zBottom + 0.6);
  lot.points.stairsTop = Wl(fr.W / 2 - 0.8, 3.0, -Z - 0.7);
  lot.corridorZone = { cx: fr.cx, cz: fr.cz, rot: fr.rot, x0: -fr.W / 2 + 0.15, x1: fr.W / 2 - 0.3, z0: -Z - 1.25, z1: -Z - 0.15 };
  const sMid = Math.max(L.s0 + 1, Math.min(L.s1 - 1, it.ne.s)), F = lotFrame(L, sMid);
  const mp = localToWorld(F.base, -2, 0, 0.6);
  BB.add(box(1.6, 1.1, 0.35), m.frame, M(mp.x, 0.75, mp.z, F.rot)); addLocalBox(F.base, -2.8, -1.2, 0.4, 0.8, 1.3);
  lot.points.mailbox = localToWorld(F.base, -2, 1.0, -0.1);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), signMaterialStatic('メゾンあおば')); sign.position.copy(localToWorld(F.base, -2, 1.6, 0.42)); sign.rotation.y = F.rot + Math.PI; dyn.push(sign);
  // 自転車置き場（屋根つき）
  const K = initHouseKit(), bp = localToWorld(F.base, 3, 0, 1.5);
  BB.add(box(4, 0.06, 1.8), K.polycarb, M(bp.x, 2.0, bp.z, F.rot), { noShadow: true });
  for (let i = 0; i < 3; i++) { const p = localToWorld(F.base, 1.8 + i * 0.7, 0, 1.6); bicycle([p.x, p.z], F.rot + Math.PI / 2); }
  lot.points.front = frontPoint(L, sMid);
  lot.cx = fr.cx; lot.cz = fr.cz;
}

// 時刻による明かり（窓・看板・街灯）
export function updateLights(hour) {
  const dark = Math.max(0, Math.min(1, (hour - 17.3) / 1.4));
  for (const l of T.lampMats) l.mat.emissiveIntensity = l.on * dark;
  return dark;
}
export { acUnit };
