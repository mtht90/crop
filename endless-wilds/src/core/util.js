// 共通ユーティリティ:乱数・ノイズ・数学
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

// 32bit ハッシュ(決定的なワールド生成に使う)
export function hash2(x, y, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

// mulberry32
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a0, b0) => a0 + (b0 - a0) * r();
  r.int = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function weightedPick(items, wfn) {
  let total = 0;
  for (const it of items) total += wfn(it);
  let r = Math.random() * total;
  for (const it of items) {
    r -= wfn(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// 値ノイズ(fbm)
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, y * f, seed + i * 17) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.floor(n));
}

// 空間ハッシュ(敵の近傍探索・当たり判定)
export class SpatialGrid {
  constructor(cell = 4) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.map = new Map();
    this.pool = [];
  }
  clear() {
    for (const arr of this.map.values()) { arr.length = 0; this.pool.push(arr); }
    this.map.clear();
  }
  key(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }
  insert(obj, x, z) {
    const k = this.key(Math.floor(x * this.inv), Math.floor(z * this.inv));
    let arr = this.map.get(k);
    if (!arr) { arr = this.pool.pop() || []; this.map.set(k, arr); }
    arr.push(obj);
  }
  // 半径 r 内の候補を out に詰める
  query(x, z, r, out) {
    out.length = 0;
    const x0 = Math.floor((x - r) * this.inv), x1 = Math.floor((x + r) * this.inv);
    const z0 = Math.floor((z - r) * this.inv), z1 = Math.floor((z + r) * this.inv);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.map.get(this.key(cx, cz));
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    return out;
  }
}
