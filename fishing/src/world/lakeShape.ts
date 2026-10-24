import type { Structure } from '../data/types';

/**
 * 翠ヶ湖の形と地形（描画に依存しない純粋な関数）。
 * 湖の中心が原点、水面は y = 0。θ = atan2(z, x)。
 */

export const MAX_DEPTH = 12;
export const DOCK = {
  /** 桟橋の付け根（陸側）と先端の x */
  xLand: 0,
  xEnd: 0,
  halfWidth: 1.4,
  deckY: 0.9,
};

// 各ポイントの方角
const ANGLE = { dock: 0, weeds: 0.95, inflow: 2.15, rocks: Math.PI, shallows: -1.65 };

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix + iz * 57);
  const b = hash(ix + 1 + iz * 57);
  const c = hash(ix + (iz + 1) * 57);
  const d = hash(ix + 1 + (iz + 1) * 57);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * noise2(x * f, z * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

function angDist(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** 方角 θ における中心から岸までの距離 */
export function shoreRadius(theta: number): number {
  return 112 + 22 * Math.sin(2 * theta + 0.5) + 13 * Math.sin(3 * theta + 1.3) + 6 * Math.sin(5 * theta + 0.2);
}

/** 岸からの符号付き距離（+ = 陸側） */
export function shoreDistance(x: number, z: number): number {
  const r = Math.hypot(x, z);
  return r - shoreRadius(Math.atan2(z, x));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function gauss(theta: number, center: number, width: number): number {
  const d = angDist(theta, center);
  return Math.exp(-(d * d) / (width * width));
}

/** 流れ込み（川）の中心線からの距離 */
function inflowDistance(x: number, z: number): { lateral: number; along: number } {
  const dirX = Math.cos(ANGLE.inflow);
  const dirZ = Math.sin(ANGLE.inflow);
  const along = x * dirX + z * dirZ;
  const wiggle = Math.sin(along * 0.05) * 8;
  const lateral = Math.abs(-x * dirZ + z * dirX - wiggle);
  return { lateral, along };
}

export function terrainHeight(x: number, z: number): number {
  const theta = Math.atan2(z, x);
  const d = shoreDistance(x, z);
  if (d < 0) {
    // 湖底：ポイントごとに駆け上がりの幅を変える
    const steep = gauss(theta, ANGLE.rocks, 0.35);
    const gentle = Math.max(gauss(theta, ANGLE.shallows, 0.45), gauss(theta, ANGLE.weeds, 0.35) * 0.8);
    const width = 70 - steep * 50 + gentle * 45;
    let depth = MAX_DEPTH * smoothstep(0, width, -d);
    // 中央やや西寄りの深み
    const hole = Math.exp(-((x + 25) ** 2 + (z - 10) ** 2) / 1800);
    depth += hole * 3;
    // 水草帯は浅く平らに
    depth *= 1 - gauss(theta, ANGLE.weeds, 0.3) * 0.55 * smoothstep(0, 40, -d + 10) * (1 - smoothstep(30, 55, -d));
    depth += (fbm(x * 0.05, z * 0.05) - 0.5) * 1.2 * smoothstep(0, 10, -d);
    return -Math.max(0.05, depth) + (d > -2 ? (d + 2) * 0.1 : 0);
  }
  // 陸
  let h = 0.15 + d * 0.06 * (1 - smoothstep(10, 40, d)) + smoothstep(10, 40, d) * 1.5;
  h += (fbm(x * 0.02, z * 0.02) - 0.4) * 10 * smoothstep(15, 90, d);
  h += smoothstep(120, 280, d) * (25 + fbm(x * 0.008 + 3, z * 0.008) * 60);
  // 岩場は崖っぽく
  h += gauss(theta, ANGLE.rocks, 0.3) * smoothstep(0, 12, d) * 4;
  // 桟橋〜小屋の周りは平らに
  const flat = Math.exp(-((x - (DOCK.xLand + 14)) ** 2 + z ** 2) / 500);
  h = h * (1 - flat) + (0.4 + d * 0.03) * flat;
  // 流れ込みの川筋
  const inf = inflowDistance(x, z);
  if (inf.along > 0) {
    const w = 5 + d * 0.02;
    const carve = 1 - smoothstep(w, w + 6, inf.lateral);
    h = h * (1 - carve) + (-0.9 + Math.min(d, 200) * 0.004) * carve;
  }
  return h;
}

export function waterDepth(x: number, z: number): number {
  return Math.max(0, -terrainHeight(x, z));
}

export function onDock(x: number, z: number): boolean {
  return x <= DOCK.xLand && x >= DOCK.xEnd && Math.abs(z) <= DOCK.halfWidth;
}

/** ルアー位置のポイント判定 */
export function structureAt(x: number, z: number): Structure {
  const theta = Math.atan2(z, x);
  const d = shoreDistance(x, z);
  if (x <= DOCK.xLand + 2 && x >= DOCK.xEnd - 6 && Math.abs(z) <= 7) return 'dock';
  const inf = inflowDistance(x, z);
  if (inf.along > 0 && d > -30 && inf.lateral < 22) return 'inflow';
  if (angDist(theta, ANGLE.weeds) < 0.42 && d > -45) return 'weeds';
  if (angDist(theta, ANGLE.rocks) < 0.38 && d > -30) return 'rocks';
  if (angDist(theta, ANGLE.shallows) < 0.5 && d > -45) return 'shallows';
  return waterDepth(x, z) > 4 ? 'open' : 'shallows';
}

export function isWeedArea(x: number, z: number): boolean {
  const theta = Math.atan2(z, x);
  return angDist(theta, ANGLE.weeds) < 0.38;
}

export function isRockArea(x: number, z: number): boolean {
  return angDist(Math.atan2(z, x), ANGLE.rocks) < 0.36;
}

export function isSandArea(x: number, z: number): boolean {
  return angDist(Math.atan2(z, x), ANGLE.shallows) < 0.5;
}

export const SHORE_EAST = shoreRadius(0);
DOCK.xLand = SHORE_EAST + 3;
DOCK.xEnd = SHORE_EAST - 26;

export const HUT = { x: SHORE_EAST + 17, z: -9, w: 6, d: 5, rot: Math.PI / 2 };
export const SPAWN = { x: SHORE_EAST + 9, z: 4, yaw: Math.PI / 2 };

export const ANGLES = ANGLE;
