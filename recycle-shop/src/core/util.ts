import * as THREE from 'three';

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 角度差を -PI..PI に正規化 */
export const angleDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const yen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`;
export const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;

/** 端数を気持ちよく丸める (店頭価格らしい値) */
export function nicePrice(v: number): number {
  if (v <= 0) return 0;
  if (v < 100) return Math.max(10, Math.round(v / 10) * 10);
  if (v < 1000) return Math.round(v / 50) * 50;
  if (v < 10000) return Math.round(v / 100) * 100;
  if (v < 100000) return Math.round(v / 500) * 500;
  return Math.round(v / 1000) * 1000;
}

/** 決定論的乱数 (mulberry32)。セーブデータから再現できるよう seed を持つ */
export class Rng {
  constructor(public seed: number = (Math.random() * 2 ** 32) >>> 0) {}
  next(): number {
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number) { return lo + (hi - lo) * this.next(); }
  int(lo: number, hi: number) { return Math.floor(this.range(lo, hi + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  weighted<T>(arr: readonly T[], w: (t: T) => number): T {
    const total = arr.reduce((s, x) => s + w(x), 0);
    let r = this.next() * total;
    for (const x of arr) { r -= w(x); if (r <= 0) return x; }
    return arr[arr.length - 1];
  }
  /** おおよそ正規分布 */
  gauss(mean = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}

export const rng = new Rng();

let uidCounter = 0;
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(uidCounter++).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;

/** オブジェクト以下のマテリアル・ジオメトリを破棄 (共有テクスチャは破棄しない) */
export function disposeObject(obj: THREE.Object3D, disposeGeometry = false) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      if (disposeGeometry) m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (mat && (mat as any).userData?.owned) mat.dispose();
    }
  });
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
