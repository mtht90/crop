// グリッド上のA*経路探索(8方向・角抜け禁止)
import type { Pt } from './types';

export class Grid {
  w: number;
  h: number;
  walk: Uint8Array; // 1なら歩ける
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.walk = new Uint8Array(w * h);
  }
  ok(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.walk[y * this.w + x] === 1;
  }
}

// 二分ヒープ
class Heap {
  items: number[] = [];
  keys: Float64Array;
  constructor(n: number) {
    this.keys = new Float64Array(n);
  }
  push(i: number, k: number) {
    this.keys[i] = k;
    const a = this.items;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.keys[a[p]] <= this.keys[a[c]]) break;
      [a[p], a[c]] = [a[c], a[p]];
      c = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < a.length && this.keys[a[l]] < this.keys[a[m]]) m = l;
        if (r < a.length && this.keys[a[r]] < this.keys[a[m]]) m = r;
        if (m === c) break;
        [a[m], a[c]] = [a[c], a[m]];
        c = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

let gScore: Float64Array | null = null;
let came: Int32Array | null = null;
let stamp: Uint32Array | null = null;
let curStamp = 1;

/**
 * from から goals のどれかへの経路を返す(from は含まない)。見つからなければ null。
 * from が歩けないタイルでも探索は始められる(建物から出るときなど)。
 */
export function findPath(grid: Grid, from: Pt, goals: Pt[], maxNodes = 4000): Pt[] | null {
  const { w, h } = grid;
  const n = w * h;
  if (!gScore || gScore.length !== n) {
    gScore = new Float64Array(n);
    came = new Int32Array(n);
    stamp = new Uint32Array(n);
  }
  curStamp++;
  const goalSet = new Set<number>();
  for (const g of goals) if (grid.ok(g.x, g.y) || (g.x === from.x && g.y === from.y)) goalSet.add(g.y * w + g.x);
  if (!goalSet.size) return null;
  const start = from.y * w + from.x;
  if (goalSet.has(start)) return [];
  const hfn = (i: number) => {
    const x = i % w;
    const y = (i / w) | 0;
    let best = Infinity;
    for (const g of goals) {
      const dx = Math.abs(g.x - x);
      const dy = Math.abs(g.y - y);
      const d = Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
      if (d < best) best = d;
    }
    return best;
  };
  const heap = new Heap(n);
  stamp![start] = curStamp;
  gScore![start] = 0;
  came![start] = -1;
  heap.push(start, hfn(start));
  let visited = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (goalSet.has(cur)) {
      const out: Pt[] = [];
      let c = cur;
      while (c !== start && c !== -1) {
        out.push({ x: c % w, y: (c / w) | 0 });
        c = came![c];
      }
      return out.reverse();
    }
    if (++visited > maxNodes) return null;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.ok(nx, ny)) continue;
      if (dx && dy && (!grid.ok(cx + dx, cy) || !grid.ok(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      const g = gScore![cur] + cost;
      if (stamp![ni] === curStamp && g >= gScore![ni]) continue;
      stamp![ni] = curStamp;
      gScore![ni] = g;
      came![ni] = cur;
      heap.push(ni, g + hfn(ni));
    }
  }
  return null;
}
