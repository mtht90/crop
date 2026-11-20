import { CITY } from '../config/city';

export interface Lot {
  id: number;
  gx: number;
  gz: number;
  /** 区画の中心（ワールド座標） */
  x: number;
  z: number;
  /** 道路に面しているか */
  roadside: boolean;
  /** 中心からの近さ 0（端）〜1（中心） */
  centrality: number;
  landPrice: number;
  traffic: number;
}

export interface RoadStrip {
  /** 中心 */
  x: number;
  z: number;
  /** 長さ方向が x 軸なら 'x' */
  axis: 'x' | 'z';
  length: number;
}

export interface CityLayout {
  lots: Lot[];
  roads: RoadStrip[];
  crossings: { x: number; z: number }[];
  width: number;
  depth: number;
}

/** 列 index → その列の左端座標。道路の位置ぶんずらす */
function axisStarts(roads: readonly number[]): { lotStart: number[]; roadStart: Map<number, number>; total: number } {
  const lotStart: number[] = [];
  const roadStart = new Map<number, number>();
  let p = 0;
  for (let i = 0; i <= CITY.size; i++) {
    if (roads.includes(i)) {
      roadStart.set(i, p);
      p += CITY.roadWidth;
    }
    if (i < CITY.size) {
      lotStart.push(p);
      p += CITY.lotSize;
    }
  }
  return { lotStart, roadStart, total: p };
}

export function buildLayout(): CityLayout {
  const ax = axisStarts(CITY.roadsX);
  const az = axisStarts(CITY.roadsZ);
  const ox = ax.total / 2;
  const oz = az.total / 2;
  const half = (CITY.size - 1) / 2;
  const lots: Lot[] = [];
  for (let gz = 0; gz < CITY.size; gz++) {
    for (let gx = 0; gx < CITY.size; gx++) {
      const roadside =
        CITY.roadsX.includes(gx) || CITY.roadsX.includes(gx + 1) ||
        CITY.roadsZ.includes(gz) || CITY.roadsZ.includes(gz + 1);
      const d = Math.max(Math.abs(gx - half), Math.abs(gz - half)) / half; // 0..1
      const centrality = 1 - d;
      const lp = CITY.landPrice;
      const tr = CITY.traffic;
      lots.push({
        id: gz * CITY.size + gx,
        gx, gz,
        x: ax.lotStart[gx] + CITY.lotSize / 2 - ox,
        z: az.lotStart[gz] + CITY.lotSize / 2 - oz,
        roadside,
        centrality,
        landPrice: Math.round(lp.base * (lp.edgeMultiplier + (1 - lp.edgeMultiplier) * centrality)),
        traffic: (tr.edge + (tr.center - tr.edge) * centrality) * (roadside ? tr.roadsideBonus : 1),
      });
    }
  }
  const roads: RoadStrip[] = [];
  const crossings: { x: number; z: number }[] = [];
  const w = CITY.roadWidth;
  for (const [i, sx] of ax.roadStart) {
    // z 方向に伸びる道路（x = sx）。交差点の間を区画ごとに分割
    for (let gz = 0; gz < CITY.size; gz++) {
      roads.push({ x: sx + w / 2 - ox, z: az.lotStart[gz] + CITY.lotSize / 2 - oz, axis: 'z', length: CITY.lotSize });
    }
    for (const [, sz] of az.roadStart) crossings.push({ x: sx + w / 2 - ox, z: sz + w / 2 - oz });
    void i;
  }
  for (const [, sz] of az.roadStart) {
    for (let gx = 0; gx < CITY.size; gx++) {
      roads.push({ x: ax.lotStart[gx] + CITY.lotSize / 2 - ox, z: sz + w / 2 - oz, axis: 'x', length: CITY.lotSize });
    }
  }
  return { lots, roads, crossings, width: ax.total, depth: az.total };
}
