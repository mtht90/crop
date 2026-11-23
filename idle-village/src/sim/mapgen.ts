// 島の自動生成
import { MAP_H, MAP_W } from './config';
import type { Deco } from './types';
import { mulberry32 } from './util';

export interface GenResult {
  land: Uint8Array;
  center: { x: number; y: number };
  trees: { tx: number; ty: number; variant: number }[];
  golds: { tx: number; ty: number; variant: number }[];
  decos: Deco[];
  sheep: { tx: number; ty: number }[];
}

function valueNoise(r: () => number, w: number, h: number, cell: number) {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh).map(() => r());
  const out = new Float32Array(w * h);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = sm(fx - ix);
      const ty = sm(fy - iy);
      const a = g[iy * gw + ix];
      const b = g[iy * gw + ix + 1];
      const c = g[(iy + 1) * gw + ix];
      const d = g[(iy + 1) * gw + ix + 1];
      out[y * w + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  return out;
}

export function generateIsland(seed: number): GenResult {
  const r = mulberry32(seed);
  const w = MAP_W;
  const h = MAP_H;
  const n1 = valueNoise(r, w, h, 7);
  const n2 = valueNoise(r, w, h, 3);
  const elev = new Float32Array(w * h);
  const cx = w / 2 + (r() - 0.5) * 4;
  const cy = h / 2 + (r() - 0.5) * 3;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / (w * 0.42);
      const dy = (y - cy) / (h * 0.42);
      const d = Math.sqrt(dx * dx + dy * dy);
      elev[y * w + x] = n1[y * w + x] * 0.65 + n2[y * w + x] * 0.35 - d * d * 1.25;
    }
  // 陸の割合が狙いに近づくように閾値を決める
  const sorted = Array.from(elev).sort((a, b) => b - a);
  const th = sorted[Math.floor(w * h * 0.4)];
  let land = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) land[i] = elev[i] > th ? 1 : 0;

  const at = (l: Uint8Array, x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : l[y * w + x]);
  // 外周2マスは海
  const border = (x: number, y: number) => x < 2 || y < 2 || x >= w - 2 || y >= h - 3;
  // セルオートマトンで滑らかに
  for (let pass = 0; pass < 3; pass++) {
    const nl = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (border(x, y)) continue;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c += at(land, x + dx, y + dy);
        nl[y * w + x] = c >= 5 ? 1 : c <= 3 ? 0 : land[y * w + x];
      }
    land = nl;
  }
  // 細い部分(縦横どちらにも1マス幅)を削り、斜めだけで繋がる部分を埋める
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (land[i]) {
          const ns = at(land, x, y - 1) + at(land, x, y + 1);
          const we = at(land, x - 1, y) + at(land, x + 1, y);
          if (ns === 0 || we === 0) land[i] = 0;
        }
      }
  }
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w - 1; x++) {
      const a = at(land, x, y);
      const b = at(land, x + 1, y);
      const c = at(land, x, y + 1);
      const d = at(land, x + 1, y + 1);
      if (a && d && !b && !c) land[y * w + x + 1] = 1;
      if (b && c && !a && !d) land[y * w + x] = 1;
    }
  // 最大の陸塊だけ残す
  const comp = new Int32Array(w * h).fill(-1);
  let best = -1;
  let bestSize = 0;
  let cid = 0;
  for (let i = 0; i < w * h; i++) {
    if (!land[i] || comp[i] >= 0) continue;
    const stack = [i];
    comp[i] = cid;
    let size = 0;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % w;
      const y = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (land[ni] && comp[ni] < 0) {
          comp[ni] = cid;
          stack.push(ni);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = cid;
    }
    cid++;
  }
  for (let i = 0; i < w * h; i++) if (comp[i] !== best) land[i] = 0;
  // 内側の湖を埋める
  const sea = new Uint8Array(w * h);
  const q: number[] = [0];
  sea[0] = 1;
  while (q.length) {
    const c = q.pop()!;
    const x = c % w;
    const y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!land[ni] && !sea[ni]) {
        sea[ni] = 1;
        q.push(ni);
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (!land[i] && !sea[i]) land[i] = 1;

  // 村の中心:海から離れた陸地で、島の重心に近い場所
  const distSea = new Int32Array(w * h).fill(999);
  const bq: number[] = [];
  for (let i = 0; i < w * h; i++)
    if (!land[i]) {
      distSea[i] = 0;
      bq.push(i);
    }
  for (let qi = 0; qi < bq.length; qi++) {
    const c = bq[qi];
    const x = c % w;
    const y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (distSea[ni] > distSea[c] + 1) {
        distSea[ni] = distSea[c] + 1;
        bq.push(ni);
      }
    }
  }
  let sx = 0;
  let sy = 0;
  let cnt = 0;
  for (let i = 0; i < w * h; i++)
    if (land[i]) {
      sx += i % w;
      sy += (i / w) | 0;
      cnt++;
    }
  const gx = sx / cnt;
  const gy = sy / cnt;
  let center = { x: Math.round(gx), y: Math.round(gy) };
  let bestScore = -Infinity;
  for (let i = 0; i < w * h; i++) {
    if (!land[i]) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const s = Math.min(distSea[i], 6) * 3 - Math.hypot(x - gx, y - gy);
    if (s > bestScore) {
      bestScore = s;
      center = { x, y };
    }
  }

  // 森:中心から離れた場所にノイズで配置
  const forest = valueNoise(r, w, h, 5);
  const used = new Uint8Array(w * h);
  const trees: GenResult['trees'] = [];
  const golds: GenResult['golds'] = [];
  const decos: Deco[] = [];
  const sheep: GenResult['sheep'] = [];
  const nearCenter = (x: number, y: number, rad: number) => Math.abs(x - center.x) <= rad && Math.abs(y - center.y) <= rad;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!land[i] || distSea[i] < 1 || nearCenter(x, y, 4)) continue;
      let crowded = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && used[(y + dy) * w + x + dx]) crowded = true;
      if (!crowded && forest[i] > 0.5 && r() < 0.8) {
        trees.push({ tx: x, ty: y, variant: 1 + Math.floor(r() * 4) });
        used[i] = 1;
      }
    }
  // 金鉱石:岩場をひとつ決めて固める
  const landTiles: number[] = [];
  for (let i = 0; i < w * h; i++) if (land[i] && !used[i] && distSea[i] >= 1 && !nearCenter(i % w, (i / w) | 0, 5)) landTiles.push(i);
  const goldCenter = landTiles[Math.floor(r() * landTiles.length)];
  const gcx = goldCenter % w;
  const gcy = (goldCenter / w) | 0;
  for (let k = 0; k < 40 && golds.length < 5; k++) {
    const x = gcx + Math.floor(r() * 5) - 2;
    const y = gcy + Math.floor(r() * 5) - 2;
    const i = y * w + x;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1 || !land[i] || used[i] || distSea[i] < 2) continue;
    let crowded = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && used[(y + dy) * w + x + dx]) crowded = true;
    if (crowded) continue;
    used[i] = 1;
    golds.push({ tx: x, ty: y, variant: 1 + Math.floor(r() * 6) });
  }
  // 羊
  for (let k = 0; k < 200 && sheep.length < 5; k++) {
    const i = landTiles[Math.floor(r() * landTiles.length)];
    if (used[i]) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (Math.hypot(x - center.x, y - center.y) > 10) continue;
    sheep.push({ tx: x, ty: y });
  }
  // 装飾(歩行を邪魔しない)
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i / w) | 0;
    if (land[i]) {
      if (used[i] || nearCenter(x, y, 3)) continue;
      const v = r();
      if (v < 0.035) decos.push({ kind: 'bush', x: x * 64 + 32 + (r() - 0.5) * 30, y: y * 64 + 40, variant: 1 + Math.floor(r() * 4) });
      else if (v < 0.055) decos.push({ kind: 'rock', x: x * 64 + 32 + (r() - 0.5) * 30, y: y * 64 + 32 + (r() - 0.5) * 20, variant: 1 + Math.floor(r() * 4) });
    } else {
      // 岸から1〜2マスの海に岩
      if (distSea[i] === 0) {
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++)
          for (let dx = -2; dx <= 2; dx++) if (at(land, x + dx, y + dy)) near = true;
        if (near && !at(land, x, y - 1) && !at(land, x, y + 1) && !at(land, x - 1, y) && !at(land, x + 1, y) && r() < 0.05)
          decos.push({ kind: 'waterRock', x: x * 64 + 32, y: y * 64 + 32, variant: 1 + Math.floor(r() * 4) });
      }
    }
  }
  // アヒル(1羽だけ)
  for (let k = 0; k < 100; k++) {
    const x = 1 + Math.floor(r() * (w - 2));
    const y = 1 + Math.floor(r() * (h - 2));
    if (land[y * w + x]) continue;
    let near = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (at(land, x + dx, y + dy)) near = true;
    if (!near) continue;
    decos.push({ kind: 'duck', x: x * 64 + 32, y: y * 64 + 32, variant: 1 });
    break;
  }
  return { land, center, trees, golds, decos, sheep };
}
