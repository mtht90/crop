import * as THREE from 'three';

/** 客の経路探索用グリッド。0: 通行可, 1: 壁・什器, 2: スタッフ専用 (客は通れない) */
export class NavGrid {
  readonly cell = 0.25;
  readonly minX: number;
  readonly minZ: number;
  readonly w: number;
  readonly h: number;
  private grid: Uint8Array;
  private base: Uint8Array;

  constructor(minX: number, minZ: number, maxX: number, maxZ: number) {
    this.minX = minX;
    this.minZ = minZ;
    this.w = Math.ceil((maxX - minX) / this.cell);
    this.h = Math.ceil((maxZ - minZ) / this.cell);
    this.grid = new Uint8Array(this.w * this.h);
    this.base = new Uint8Array(this.w * this.h);
  }

  toCell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }

  toWorld(cx: number, cz: number): [number, number] {
    return [this.minX + (cx + 0.5) * this.cell, this.minZ + (cz + 0.5) * this.cell];
  }

  private inside(cx: number, cz: number) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }

  /** 静的な障害物 (壁など) を焼き込む */
  markRect(x0: number, z0: number, x1: number, z1: number, v: number, target: 'base' | 'dyn' = 'base') {
    const g = target === 'base' ? this.base : this.grid;
    const [a, b] = this.toCell(Math.min(x0, x1), Math.min(z0, z1));
    const [c, d] = this.toCell(Math.max(x0, x1) - 1e-4, Math.max(z0, z1) - 1e-4);
    for (let z = Math.max(0, b); z <= Math.min(this.h - 1, d); z++)
      for (let x = Math.max(0, a); x <= Math.min(this.w - 1, c); x++) {
        // 壁 (1) はスタッフ専用 (2) で上書きしない
        if (v === 2 && g[z * this.w + x] === 1) continue;
        g[z * this.w + x] = v;
      }
  }

  /** 動的障害物 (什器) をリセットして再構築する前に呼ぶ */
  resetDynamic() { this.grid.set(this.base); }

  blocked(cx: number, cz: number) {
    if (!this.inside(cx, cz)) return true;
    return this.grid[cz * this.w + cx] !== 0;
  }

  blockedAt(x: number, z: number) { const [cx, cz] = this.toCell(x, z); return this.blocked(cx, cz); }

  /** 最寄りの通行可能セル */
  nearestFree(x: number, z: number): [number, number] {
    const [cx, cz] = this.toCell(x, z);
    if (!this.blocked(cx, cz)) return [cx, cz];
    for (let r = 1; r < 24; r++) {
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (!this.blocked(cx + dx, cz + dz)) return [cx + dx, cz + dz];
        }
    }
    return [cx, cz];
  }

  /** A* (8 近傍) + 視線による経路の間引き */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const [sx, sz] = this.nearestFree(from.x, from.z);
    const [gx, gz] = this.nearestFree(to.x, to.z);
    const W = this.w;
    const start = sz * W + sx;
    const goal = gz * W + gx;
    if (start === goal) return [to.clone()];
    const g = new Float32Array(W * this.h).fill(Infinity);
    const came = new Int32Array(W * this.h).fill(-1);
    const closed = new Uint8Array(W * this.h);
    const heap = new MinHeap();
    g[start] = 0;
    heap.push(start, this.heur(sx, sz, gx, gz));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let iter = 0;
    while (heap.size && iter++ < 60000) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W;
      const cz = (cur / W) | 0;
      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (this.blocked(nx, nz)) continue;
        // 斜め移動で角をすり抜けない
        if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue;
        const ni = nz * W + nx;
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + this.heur(nx, nz, gx, gz));
        }
      }
    }
    if (came[goal] === -1) return null;
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    // 視線チェックで間引き
    const pts: [number, number][] = [];
    let anchor = 0;
    pts.push([cells[0] % W, (cells[0] / W) | 0]);
    for (let i = 2; i < cells.length; i++) {
      const a = cells[anchor];
      const b = cells[i];
      if (!this.lineFree(a % W, (a / W) | 0, b % W, (b / W) | 0)) {
        anchor = i - 1;
        pts.push([cells[anchor] % W, (cells[anchor] / W) | 0]);
      }
    }
    const out = pts.slice(1).map(([x, z]) => { const [wx, wz] = this.toWorld(x, z); return new THREE.Vector3(wx, 0, wz); });
    out.push(new THREE.Vector3(to.x, 0, to.z));
    return out;
  }

  private heur(ax: number, az: number, bx: number, bz: number) {
    const dx = Math.abs(ax - bx);
    const dz = Math.abs(az - bz);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  }

  /** 太さを考慮したセル単位の直線判定 */
  private lineFree(x0: number, z0: number, x1: number, z1: number) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      for (const [ox, oz] of [[0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) {
        if (this.blocked(Math.round(x + ox), Math.round(z + oz))) return false;
      }
    }
    return true;
  }

  /** デバッグ表示用 */
  debugMesh(): THREE.Object3D {
    const geo = new THREE.PlaneGeometry(this.cell * 0.9, this.cell * 0.9).rotateX(-Math.PI / 2);
    const count = this.grid.reduce((s, v) => s + (v ? 1 : 0), 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#f00', transparent: true, opacity: 0.35 }), count);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const v = this.grid[z * this.w + x];
      if (!v) continue;
      const [wx, wz] = this.toWorld(x, z);
      m.makeTranslation(wx, 0.02, wz);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(v === 2 ? '#00f' : '#f00'));
      i++;
    }
    return mesh;
  }
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() { return this.items.length; }
  push(item: number, p: number) {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
