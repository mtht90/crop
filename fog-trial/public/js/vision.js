// 視界ポリゴン (サーバーの視界判定と同じ castRay を使う)
import { castRay } from '../shared/physics.js';
import { VISION } from '../shared/constants.js';

// 光線を壁の中まで少し伸ばして、見えている壁の表面を明るくする
const WALL_LIT = 0.6;

export function visibilityPolygons(px, py, angle, isKiller, blocksSight, hiddenRadius = 0) {
  const polys = [];
  if (isKiller) {
    const fov = VISION.killerFov;
    const n = 90;
    const cone = [{ x: px, y: py }];
    for (let i = 0; i <= n; i++) {
      const a = angle - fov / 2 + (fov * i) / n;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const d = Math.min(VISION.killerRadius, castRay(px, py, dx, dy, VISION.killerRadius, blocksSight) + WALL_LIT);
      cone.push({ x: px + dx * d, y: py + dy * d });
    }
    polys.push({ pts: cone, eye: { x: px, y: py }, radius: VISION.killerRadius, strength: 1 });
    polys.push({ pts: circle(px, py, VISION.killerNear, blocksSight, 40), eye: { x: px, y: py }, radius: VISION.killerNear, strength: 0.85 });
    return polys;
  }
  const r = hiddenRadius || VISION.survivorRadius;
  polys.push({ pts: circle(px, py, r, blocksSight, 160), eye: { x: px, y: py }, radius: r, strength: 1 });
  return polys;
}

function circle(px, py, r, blocksSight, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const d = Math.min(r, castRay(px, py, dx, dy, r, blocksSight) + WALL_LIT);
    pts.push({ x: px + dx * d, y: py + dy * d });
  }
  return pts;
}
