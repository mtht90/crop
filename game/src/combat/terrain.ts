import { Vector3 } from 'three';
import { ARENA_RADIUS } from '../config';

/**
 * Static collision used by projectiles and shot recoil: the arena (top, rim,
 * rocky underside), the hover pads and a ring of small floating rocks close to
 * the edge. Everything is a vertical cylinder band, which keeps raycasts cheap.
 * The renderer builds its decor from the same data.
 */

/** Small floating rocks just outside the arena: [x, topY, z, radius]. */
export const ROCKS: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  const heights = [-3, -6, 0.5, -4.5, -2, -7, -1, -5];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const d = ARENA_RADIUS + 6.5 + (i % 3) * 1.4;
    out.push([Math.cos(a) * d, heights[i], Math.sin(a) * d, 2.2 + (i % 2) * 0.8]);
  }
  return out;
})();

/** Hover pads: [x, centerY, z, radius]. */
export const PADS: [number, number, number, number][] = [
  [-24, 3, -12, 4],
  [26, 2, -8, 4.5],
  [-20, 1, 18, 3.5],
];

interface Band {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
}

const BANDS: Band[] = (() => {
  const b: Band[] = [];
  const R = ARENA_RADIUS;
  // Arena: top slab + rim, then the cone underneath as shrinking bands.
  b.push({ x: 0, z: 0, r: R, y0: -2.2, y1: 0 });
  for (let i = 0; i < 4; i++) {
    const y1 = -2.2 - i * 3.5;
    b.push({ x: 0, z: 0, r: (R - 1.5) * (1 - (i + 0.5) / 4), y0: y1 - 3.5, y1 });
  }
  for (const [x, y, z, r] of ROCKS) {
    b.push({ x, z, r, y0: y - 0.5, y1: y });
    b.push({ x, z, r: r * 0.65, y0: y - r * 0.8, y1: y - 0.5 });
    b.push({ x, z, r: r * 0.3, y0: y - r * 1.5, y1: y - r * 0.8 });
  }
  for (const [x, y, z, r] of PADS) b.push({ x, z, r, y0: y - 0.45, y1: y + 0.45 });
  return b;
})();

export interface TerrainHit {
  dist: number;
  point: Vector3;
}

/** Ray vs one vertical cylinder band (side + caps); returns the entry distance. */
function rayBand(o: Vector3, d: Vector3, b: Band): number {
  let best = Infinity;
  const ox = o.x - b.x;
  const oz = o.z - b.z;
  // Side.
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-9) {
    const bb = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - b.r * b.r;
    const disc = bb * bb - 4 * a * c;
    if (disc >= 0) {
      const t = (-bb - Math.sqrt(disc)) / (2 * a);
      if (t > 0) {
        const y = o.y + d.y * t;
        if (y >= b.y0 && y <= b.y1) best = t;
      }
    }
  }
  // Caps.
  if (Math.abs(d.y) > 1e-9) {
    for (const cy of [b.y1, b.y0]) {
      const t = (cy - o.y) / d.y;
      if (t > 0 && t < best) {
        const x = ox + d.x * t;
        const z = oz + d.z * t;
        if (x * x + z * z <= b.r * b.r) best = t;
      }
    }
  }
  return best;
}

/** First terrain hit along a normalized ray within maxDist. */
export function raycastTerrain(origin: Vector3, dir: Vector3, maxDist: number): TerrainHit | null {
  let best = maxDist;
  for (const b of BANDS) {
    const t = rayBand(origin, dir, b);
    if (t < best) best = t;
  }
  if (best >= maxDist) return null;
  return { dist: best, point: origin.clone().addScaledVector(dir, best) };
}

/** Segment test for projectiles (prev -> next). */
export function segmentHitsTerrain(a: Vector3, b: Vector3): Vector3 | null {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-6) return null;
  const hit = raycastTerrain(a, d.divideScalar(len), len);
  return hit?.point ?? null;
}
