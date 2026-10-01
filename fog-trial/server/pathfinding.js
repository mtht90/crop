// ボット用の A* 経路探索。窓や倒れた板は「通れるが時間がかかる」マスとして扱う。

class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(node, prio) {
    const a = this.items;
    a.push({ node, prio });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].prio <= a[i].prio) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].prio < a[m].prio) m = l;
        if (r < a.length && a[r].prio < a[m].prio) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.node;
  }
}

/**
 * @param game Game インスタンス
 * @param role 'killer' | 'survivor'
 * @returns (tx,ty) => コスト (Infinity なら通れない) と特殊マスの種類
 */
export function makeCostFn(game, role) {
  const w = game.map.w;
  const special = new Map();
  for (const win of game.windows) special.set(win.y * w + win.x, { kind: 'window', obj: win });
  for (const p of game.pallets) special.set(p.y * w + p.x, { kind: 'pallet', obj: p });
  const cost = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= game.map.h) return Infinity;
    const sp = special.get(ty * w + tx);
    if (sp) {
      if (sp.kind === 'window') return role === 'killer' ? 7 : 2.5;
      if (sp.obj.state === 'down') return role === 'killer' ? 6 : 2.5;
      return 1;
    }
    return game.grid.isSolid(tx, ty) ? Infinity : 1;
  };
  cost.special = (tx, ty) => special.get(ty * w + tx) || null;
  return cost;
}

export function findPath(game, cost, sx, sy, gx, gy, maxNodes = 4000) {
  const w = game.map.w;
  const h = game.map.h;
  const start = sy * w + sx;
  const goal = gy * w + gx;
  if (start === goal) return [{ x: gx, y: gy }];
  const g = new Float32Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(start, 0);
  const hfn = (i) => {
    const x = i % w;
    const y = (i / w) | 0;
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  let expanded = 0;
  // ゴール自体が固体 (発電機等) でも隣までは行けるようにする
  const goalCost = (x, y) => (y * w + x === goal ? 1 : cost(x, y));
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    if (++expanded > maxNodes) return null;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        const c = goalCost(nx, ny);
        if (c === Infinity) continue;
        let step = c;
        if (dx && dy) {
          // 斜め移動は角を削らないよう、両隣が普通の床のときだけ
          if (cost(cx + dx, cy) !== 1 || cost(cx, cy + dy) !== 1 || c !== 1) continue;
          step = Math.SQRT2;
        }
        const ni = ny * w + nx;
        const ng = g[cur] + step;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + hfn(ni));
        }
      }
    }
  }
  if (came[goal] === -1) return null;
  const path = [];
  for (let i = goal; i !== start; i = came[i]) path.push({ x: i % w, y: (i / w) | 0 });
  path.reverse();
  return path;
}
