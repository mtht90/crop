import type { SpotId, Structure } from '../data/types';
import { LAKE } from './shapes/lake';

/**
 * 釣り場の地形（描画に依存しない純粋な関数）。水面は y = 0。
 * 現在の釣り場の実装に委譲するので、釣り・魚・歩行のコードは釣り場を意識しなくてよい。
 * 釣り場はどれも「陸が +X 側、水が -X 側、桟橋（堤防）は z = 0 に沿って -X へ伸びる」向きで作る。
 */
export interface Dock {
  /** 桟橋の付け根（陸側）と先端の x */
  xLand: number;
  xEnd: number;
  halfWidth: number;
  deckY: number;
}

export interface Hut {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
}

export interface AreaShape {
  id: SpotId;
  /** 海（波が高く、水の色が青い） */
  sea: boolean;
  terrainHeight(x: number, z: number): number;
  structureAt(x: number, z: number): Structure;
  isWeedArea(x: number, z: number): boolean;
  isRockArea(x: number, z: number): boolean;
  dock: Dock;
  hut: Hut;
  spawn: { x: number; z: number; yaw: number };
}

let cur: AreaShape = LAKE;

/** 現在の釣り場の桟橋・小屋・出発点（釣り場を切り替えると中身が入れ替わる） */
export const DOCK: Dock = { ...LAKE.dock };
export const HUT: Hut = { ...LAKE.hut };
export const SPAWN = { ...LAKE.spawn };

export function setArea(a: AreaShape): void {
  cur = a;
  Object.assign(DOCK, a.dock);
  Object.assign(HUT, a.hut);
  Object.assign(SPAWN, a.spawn);
}

export function currentArea(): AreaShape {
  return cur;
}

export function terrainHeight(x: number, z: number): number {
  return cur.terrainHeight(x, z);
}

export function waterDepth(x: number, z: number): number {
  return Math.max(0, -cur.terrainHeight(x, z));
}

export function onDock(x: number, z: number): boolean {
  return x <= DOCK.xLand && x >= DOCK.xEnd && Math.abs(z) <= DOCK.halfWidth;
}

/** ルアー位置のポイント判定 */
export function structureAt(x: number, z: number): Structure {
  return cur.structureAt(x, z);
}

export function isWeedArea(x: number, z: number): boolean {
  return cur.isWeedArea(x, z);
}

export function isRockArea(x: number, z: number): boolean {
  return cur.isRockArea(x, z);
}
