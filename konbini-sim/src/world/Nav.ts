import * as THREE from 'three';
import type { Collision } from './Collision';

/**
 * Grid based A* path finding over the store floor plan.
 * Two masks are kept: one for customers (staff-only areas blocked) and one
 * for staff/delivery NPCs.
 */
export class Nav {
  readonly cell = 0.2;
  readonly minX = -16;
  readonly minZ = -9;
  readonly w: number;
  readonly h: number;
  private blockedCustomer: Uint8Array;
  private blockedStaff: Uint8Array;

  constructor(maxX = 16, maxZ = 24) {
    this.w = Math.ceil((maxX - this.minX) / this.cell);
    this.h = Math.ceil((maxZ - this.minZ) / this.cell);
    this.blockedCustomer = new Uint8Array(this.w * this.h);
    this.blockedStaff = new Uint8Array(this.w * this.h);
  }

  build(col: Collision, staffOnly: { minX: number; maxX: number; minZ: number; maxZ: number }[], radius = 0.28): void {
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.minX + (i + 0.5) * this.cell;
        const z = this.minZ + (j + 0.5) * this.cell;
        const b = col.pointBlocked(x, z, radius) ? 1 : 0;
        const k = j * this.w + i;
        this.blockedStaff[k] = b;
        let s = b;
        for (const r of staffOnly) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) s = 1;
        this.blockedCustomer[k] = s;
      }
    }
  }

  private idx(x: number, z: number): [number, number] {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }

  private free(grid: Uint8Array, i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.w && j < this.h && grid[j * this.w + i] === 0;
  }

  /** Nearest free cell to a point (spiral search). */
  private nearestFree(grid: Uint8Array, i: number, j: number): [number, number] | null {
    if (this.free(grid, i, j)) return [i, j];
    for (let r = 1; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.free(grid, i + di, j + dj)) return [i + di, j + dj];
        }
      }
    }
    return null;
  }

  findPath(from: THREE.Vector3, to: THREE.Vector3, staff = false): THREE.Vector3[] | null {
    const grid = staff ? this.blockedStaff : this.blockedCustomer;
    const s = this.nearestFree(grid, ...this.idx(from.x, from.z));
    const g = this.nearestFree(grid, ...this.idx(to.x, to.z));
    if (!s || !g) return null;
    const W = this.w;
    const start = s[1] * W + s[0];
    const goal = g[1] * W + g[0];
    const gScore = new Float32Array(W * this.h).fill(Infinity);
    const came = new Int32Array(W * this.h).fill(-1);
    const closed = new Uint8Array(W * this.h);
    // binary heap on f-score
    const heap: number[] = [];
    const f = new Float32Array(W * this.h);
    const push = (n: number) => {
      heap.push(n);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (f[heap[p]] <= f[heap[c]]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1;
          const r = l + 1;
          let m = c;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    const hfn = (n: number) => {
      const dx = Math.abs((n % W) - g[0]);
      const dz = Math.abs(Math.floor(n / W) - g[1]);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    gScore[start] = 0;
    f[start] = hfn(start);
    push(start);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let iter = 0;
    while (heap.length && iter++ < 250000) {
      const cur = pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % W;
      const cj = Math.floor(cur / W);
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di;
        const nj = cj + dj;
        if (!this.free(grid, ni, nj)) continue;
        if (di && dj && (!this.free(grid, ci + di, cj) || !this.free(grid, ci, cj + dj))) continue;
        const n = nj * W + ni;
        const t = gScore[cur] + cost;
        if (t < gScore[n]) {
          gScore[n] = t;
          came[n] = cur;
          f[n] = t + hfn(n);
          push(n);
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = came[c]) {
      cells.push(c);
      if (c === start) break;
    }
    cells.reverse();
    // string-pulling smoothing using grid line of sight
    const pts = cells.map((c) => new THREE.Vector3(this.minX + ((c % W) + 0.5) * this.cell, 0, this.minZ + (Math.floor(c / W) + 0.5) * this.cell));
    const out: THREE.Vector3[] = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.los(grid, pts[anchor], pts[i])) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(to.clone().setY(0));
    return out;
  }

  private los(grid: Uint8Array, a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = a.distanceTo(b);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const [i, j] = this.idx(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!this.free(grid, i, j)) return false;
    }
    return true;
  }
}
