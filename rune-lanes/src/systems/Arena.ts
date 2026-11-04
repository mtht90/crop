import type { Team } from '../core/types';

/**
 * アリーナの形状（タイル単位）。幅 18 × 高さ 32。
 * y が小さいほど画面上（CPU 側）。川は y∈[15,17)。
 */
export const ARENA_W = 18;
export const ARENA_H = 32;
export const RIVER_TOP = 15;
export const RIVER_BOTTOM = 17;
export const MID_Y = 16;

export interface Bridge {
  x: number;
  halfWidth: number;
}

/** 左右の橋（3タイル幅） */
export const BRIDGES: readonly Bridge[] = [
  { x: 3.5, halfWidth: 1.5 },
  { x: 14.5, halfWidth: 1.5 },
];

export type Lane = 0 | 1; // 0 = 左, 1 = 右

export function laneOf(x: number): Lane {
  return x < ARENA_W / 2 ? 0 : 1;
}

export interface TowerSlot {
  team: Team;
  type: 'king' | 'guard';
  lane: Lane | null;
  x: number;
  y: number;
  /** 見た目と配置不可領域のサイズ（タイル） */
  size: number;
}

export const TOWER_SLOTS: readonly TowerSlot[] = [
  { team: 0, type: 'guard', lane: 0, x: 3.5, y: 25.5, size: 3 },
  { team: 0, type: 'guard', lane: 1, x: 14.5, y: 25.5, size: 3 },
  { team: 0, type: 'king', lane: null, x: 9, y: 29, size: 4 },
  { team: 1, type: 'guard', lane: 0, x: 3.5, y: 6.5, size: 3 },
  { team: 1, type: 'guard', lane: 1, x: 14.5, y: 6.5, size: 3 },
  { team: 1, type: 'king', lane: null, x: 9, y: 3, size: 4 },
];

/** 相手の守護塔を壊したレーンで、川を越えて配置できる奥行き（タイル） */
export const EXTENDED_DEPLOY_DEPTH = 6;

export function inRiver(y: number): boolean {
  return y > RIVER_TOP && y < RIVER_BOTTOM;
}

export function onBridge(x: number): Bridge | null {
  for (const b of BRIDGES) if (Math.abs(x - b.x) <= b.halfWidth) return b;
  return null;
}

/** そのチームの陣地側か（川そのものは含まない） */
export function isOwnSide(team: Team, y: number): boolean {
  return team === 0 ? y >= RIVER_BOTTOM : y <= RIVER_TOP;
}

/**
 * ユニット・建物の配置可否。
 * @param destroyedEnemyLanes 相手の守護塔を壊したレーン
 */
export function isDeployable(
  team: Team,
  x: number,
  y: number,
  destroyedEnemyLanes: readonly Lane[],
  margin = 0.3,
): boolean {
  if (x < margin || x > ARENA_W - margin || y < margin || y > ARENA_H - margin) return false;
  if (y > RIVER_TOP - 0.1 && y < RIVER_BOTTOM + 0.1) return false;
  let ok = isOwnSide(team, y);
  if (!ok && destroyedEnemyLanes.includes(laneOf(x))) {
    ok = team === 0 ? y >= RIVER_TOP - EXTENDED_DEPLOY_DEPTH : y <= RIVER_BOTTOM + EXTENDED_DEPLOY_DEPTH;
  }
  if (!ok) return false;
  for (const t of TOWER_SLOTS) {
    const h = t.size / 2 + 0.2;
    if (Math.abs(x - t.x) < h && Math.abs(y - t.y) < h) return false;
  }
  return true;
}

export function isInsideArena(x: number, y: number): boolean {
  return x >= 0 && x <= ARENA_W && y >= 0 && y <= ARENA_H;
}

/**
 * 地上ユニットの経由点。川の向こうへ行くときは最寄りの橋を経由する。
 */
export function nextWaypoint(x: number, y: number, tx: number, ty: number, flying: boolean): { x: number; y: number } {
  if (flying) return { x: tx, y: ty };
  const selfTop = y < MID_Y;
  const targetTop = ty < MID_Y;
  const inBand = y > RIVER_TOP - 0.05 && y < RIVER_BOTTOM + 0.05;
  if (selfTop === targetTop && !inBand) return { x: tx, y: ty };
  // 渡る必要がある（または橋の上にいる）
  let best = BRIDGES[0];
  let bestCost = Infinity;
  for (const b of BRIDGES) {
    const cost = Math.abs(x - b.x) + Math.abs(tx - b.x);
    if (cost < bestCost) {
      bestCost = cost;
      best = b;
    }
  }
  const onThisBridge = Math.abs(x - best.x) <= best.halfWidth - 0.3;
  const nearEdge = selfTop ? y > RIVER_TOP - 0.8 : y < RIVER_BOTTOM + 0.8;
  if (inBand || (onThisBridge && nearEdge)) {
    // 橋を渡って向こう岸へ
    const exitY = targetTop ? RIVER_TOP - 0.6 : RIVER_BOTTOM + 0.6;
    const bx = Math.max(best.x - best.halfWidth + 0.4, Math.min(best.x + best.halfWidth - 0.4, x));
    return { x: bx, y: exitY };
  }
  // 橋のたもとへ向かう
  const entryY = selfTop ? RIVER_TOP - 0.4 : RIVER_BOTTOM + 0.4;
  return { x: best.x, y: entryY };
}
