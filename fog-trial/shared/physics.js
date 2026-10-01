// タイルグリッド上の円の当たり判定と視線判定。
// クライアント予測でも同じ関数を使うため、副作用のない純粋関数にしている。

import { TILE } from './map.js';
import { BTN } from './constants.js';

// 動的な状態 (倒れた板・開いたゲート) を含めた当たり判定グリッド
export class CollisionGrid {
  constructor(map) {
    this.w = map.w;
    this.h = map.h;
    this.solid = new Uint8Array(map.w * map.h);
    this.sight = new Uint8Array(map.w * map.h);
    for (let i = 0; i < map.tiles.length; i++) {
      const t = map.tiles[i];
      if (t === TILE.WALL || t === TILE.TREE || t === TILE.GATE || t === TILE.WINDOW) this.solid[i] = 1;
      if (t === TILE.WALL || t === TILE.TREE || t === TILE.GATE) this.sight[i] = 1;
    }
    for (const list of [map.gens, map.cages, map.lockers]) {
      for (const p of list) this.solid[p.y * map.w + p.x] = 1;
    }
    this.isSolid = (tx, ty) => tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || this.solid[ty * this.w + tx] === 1;
    this.blocksSight = (tx, ty) => tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || this.sight[ty * this.w + tx] === 1;
  }

  setSolid(tx, ty, v) {
    this.solid[ty * this.w + tx] = v ? 1 : 0;
  }

  setSight(tx, ty, v) {
    this.sight[ty * this.w + tx] = v ? 1 : 0;
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// 円をタイルから押し出す。押し出し量を返す。
export function resolveCircle(pos, r, isSolid) {
  let px = 0;
  let py = 0;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const minX = Math.floor(pos.x - r);
    const maxX = Math.floor(pos.x + r);
    const minY = Math.floor(pos.y - r);
    const maxY = Math.floor(pos.y + r);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!isSolid(tx, ty)) continue;
        const cx = clamp(pos.x, tx, tx + 1);
        const cy = clamp(pos.y, ty, ty + 1);
        let dx = pos.x - cx;
        let dy = pos.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        let ox;
        let oy;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          ox = (dx / d) * (r - d);
          oy = (dy / d) * (r - d);
        } else {
          // 中心がタイル内に入り込んでいる: 一番浅い方向へ押し出す
          const left = pos.x - tx;
          const right = tx + 1 - pos.x;
          const up = pos.y - ty;
          const down = ty + 1 - pos.y;
          const m = Math.min(left, right, up, down);
          ox = m === left ? -(left + r) : m === right ? right + r : 0;
          oy = m === up ? -(up + r) : m === down ? down + r : 0;
        }
        pos.x += ox;
        pos.y += oy;
        px += ox;
        py += oy;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x: px, y: py };
}

export function moveCircle(pos, vx, vy, dt, r, isSolid) {
  pos.x += vx * dt;
  pos.y += vy * dt;
  return resolveCircle(pos, r, isSolid);
}

// 入力ビットから移動方向 (正規化済み) を作る
export function inputDir(buttons) {
  let x = 0;
  let y = 0;
  if (buttons & BTN.LEFT) x -= 1;
  if (buttons & BTN.RIGHT) x += 1;
  if (buttons & BTN.UP) y -= 1;
  if (buttons & BTN.DOWN) y += 1;
  const l = Math.hypot(x, y);
  return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

// DDA で視線が通るか
export function lineOfSight(x0, y0, x1, y1, blocksSight) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return true;
  return castRay(x0, y0, dx / dist, dy / dist, dist, blocksSight) >= dist - 1e-6;
}

// 方向 (dx,dy) に光線を飛ばし、遮蔽物までの距離を返す (最大 maxDist)
export function castRay(x0, y0, dx, dy, maxDist, blocksSight) {
  let tx = Math.floor(x0);
  let ty = Math.floor(y0);
  if (blocksSight(tx, ty)) return 0;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? tx + 1 - x0 : x0 - tx) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? ty + 1 - y0 : y0 - ty) * tDeltaY : Infinity;
  let t = 0;
  while (t < maxDist) {
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if (t >= maxDist) break;
    if (blocksSight(tx, ty)) return t;
  }
  return maxDist;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// viewer から target が見えるか。キラーは視野角が狭い代わりに遠くまで見える。
export function canSee(viewer, target, vision, blocksSight) {
  const dx = target.x - viewer.x;
  const dy = target.y - viewer.y;
  const d = Math.hypot(dx, dy);
  if (vision.cone) {
    if (d > vision.radius) return false;
    if (d > vision.near) {
      const a = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(a, viewer.angle)) > vision.fov / 2) return false;
    }
  } else if (d > vision.radius) {
    return false;
  }
  return lineOfSight(viewer.x, viewer.y, target.x, target.y, blocksSight);
}
