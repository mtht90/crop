import type { Structure } from '../../data/types';
import type { AreaShape } from '../shape';
import { fbm } from './lake';

/**
 * 汐見港・磯の地形。陸が +X、海が -X。海岸線は z に沿って南北に走る。
 * 北（+z）に磯と藻場、中央に港の堤防、南（-z）に河口と砂浜。
 */

export const COAST_MAX_DEPTH = 28;

/** 海岸線の x（z ごと） */
export function coastX(z: number): number {
  return 105 + 10 * Math.sin(z * 0.011 + 0.4) + 5 * Math.sin(z * 0.027 + 1.3);
}

/** 海岸からの符号付き距離（+ = 陸側） */
export function coastDistance(x: number, z: number): number {
  return x - coastX(z);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 区画の重み：z の範囲 [a, b] に入っているほど 1（端は w だけぼかす） */
function band(z: number, a: number, b: number, w = 25): number {
  return smoothstep(a - w, a + w, z) * (1 - smoothstep(b - w, b + w, z));
}

export const ZONES = {
  /** 磯（北） */
  rocks: [55, 230] as const,
  /** 港（中央） */
  harbor: [-35, 40] as const,
  /** 河口の川筋の z */
  river: -62,
  /** 砂浜（南） */
  beach: [-260, -90] as const,
};

const X0 = coastX(0);

export const COAST_DOCK = {
  xLand: X0 + 4,
  xEnd: X0 - 58,
  halfWidth: 2.6,
  deckY: 2.2,
};

export const COAST_HUT = { x: X0 + 19, z: -12, w: 6, d: 5, rot: Math.PI / 2 };
export const COAST_SPAWN = { x: X0 + 10, z: 5, yaw: Math.PI / 2 };

export const rockK = (z: number) => band(z, ZONES.rocks[0], ZONES.rocks[1]);
export const beachK = (z: number) => band(z, ZONES.beach[0], ZONES.beach[1], 35);
export const harborK = (z: number) => band(z, ZONES.harbor[0], ZONES.harbor[1], 20);

/** 磯の沖の藻場 */
function weedPatch(x: number, z: number): number {
  const dd = -coastDistance(x, z);
  if (dd < 10 || dd > 55) return 0;
  return rockK(z) * smoothstep(10, 18, dd) * (1 - smoothstep(42, 55, dd)) * smoothstep(0.42, 0.55, fbm(x * 0.04 + 7, z * 0.04));
}

function riverDistance(x: number, z: number): number {
  const wig = Math.sin(x * 0.04) * 6;
  return Math.abs(z - ZONES.river - wig);
}

export function coastHeight(x: number, z: number): number {
  const d = coastDistance(x, z);
  const rk = rockK(z);
  const bk = beachK(z);
  const hk = harborK(z);
  if (d < 0) {
    const dd = -d;
    // 海底：砂浜はゆるやかに、港は掘り下げてあり、磯は急に深い
    const gentle = 0.04 * dd + 0.00008 * dd * dd;
    const harbor = 6.5 * smoothstep(0, 10, dd) + 0.05 * dd;
    const rocky = 8 * smoothstep(0, 16, dd) + 0.07 * dd + (fbm(x * 0.06, z * 0.06) - 0.5) * 5;
    const normal = 3 * smoothstep(0, 14, dd) + 0.055 * dd;
    const wN = Math.max(0, 1 - rk - bk - hk);
    let depth = (gentle * bk + harbor * hk + rocky * rk + normal * wN) / Math.max(1e-3, bk + hk + rk + wN);
    depth += (fbm(x * 0.03 + 3, z * 0.03) - 0.5) * 1.2 * smoothstep(0, 20, dd);
    // 磯の岩礁：岸近くに岩が水面から顔を出す
    const reef = Math.max(0, fbm(x * 0.09, z * 0.09 + 11) - 0.5) * 22 * rk * (1 - smoothstep(10, 26, dd));
    depth -= reef;
    // 藻場は少し浅い
    depth -= weedPatch(x, z) * 2;
    // 河口は川の流れで掘れている
    const rv = riverDistance(x, z);
    if (rv < 26 && dd < 40) depth += (1 - smoothstep(8, 26, rv)) * (1 - smoothstep(10, 40, dd)) * 1.2;
    return -Math.min(COAST_MAX_DEPTH, Math.max(0.05, depth)) + (d > -2 ? (d + 2) * 0.12 : 0);
  }
  // 陸
  // 砂浜はゆるやかに上がって松林、磯は崖、港は岸壁と平らな広場
  const beachH = 0.12 + d * 0.035 + smoothstep(25, 60, d) * 2.5;
  const rockH = 1.6 + d * 0.32 * (1 - smoothstep(20, 60, d)) + (fbm(x * 0.07, z * 0.07) - 0.4) * 4 * smoothstep(0, 8, d);
  const quay = 2.2 + Math.max(0, d - 40) * 0.05;
  const normal = 1.2 + d * 0.06;
  const wN = Math.max(0, 1 - rk - bk - hk);
  let h = (beachH * bk + rockH * rk + quay * hk + normal * wN) / Math.max(1e-3, bk + hk + rk + wN);
  // 内陸は丘
  h += (fbm(x * 0.015, z * 0.015) - 0.35) * 12 * smoothstep(50, 140, d);
  h += smoothstep(140, 300, d) * (20 + fbm(x * 0.008 + 3, z * 0.008) * 50);
  // 店の前と堤防の付け根は平ら
  const flat = Math.exp(-((x - (COAST_HUT.x - 6)) ** 2 + (z + 3) ** 2) / 700);
  h = h * (1 - flat) + 2.2 * flat;
  // 川筋
  const rv = riverDistance(x, z);
  if (d > -2) {
    const w = 6 + d * 0.02;
    const carve = 1 - smoothstep(w, w + 22, rv);
    h = h * (1 - carve) + (-1.0 + Math.min(d, 200) * 0.006) * carve;
  }
  return h;
}

export function coastStructure(x: number, z: number): Structure {
  const D = COAST_DOCK;
  const dd = -coastDistance(x, z);
  if (x <= D.xLand + 2 && x >= D.xEnd - 10 && Math.abs(z) <= D.halfWidth + 12) return 'dock';
  if (riverDistance(x, z) < 22 && dd < 40) return 'inflow';
  if (weedPatch(x, z) > 0.3) return 'weeds';
  if (rockK(z) > 0.5 && dd < 45) return 'rocks';
  if (beachK(z) > 0.5 && dd < 130) return 'shallows';
  const depth = Math.max(0, -coastHeight(x, z));
  return depth > 9 ? 'open' : dd < 25 ? 'shallows' : 'open';
}

export const COAST: AreaShape = {
  id: 'coast',
  sea: true,
  terrainHeight: coastHeight,
  structureAt: coastStructure,
  isWeedArea: (x, z) => weedPatch(x, z) > 0.2,
  isRockArea: (x, z) => rockK(z) > 0.4 && -coastDistance(x, z) < 40,
  dock: COAST_DOCK,
  hut: COAST_HUT,
  spawn: COAST_SPAWN,
};
