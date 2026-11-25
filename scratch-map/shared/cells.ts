/**
 * 位置 → H3 セル変換の共通ロジック。
 * フロント（スクラッチ散歩）とサーバー（外部ロガー受信）の両方で同じ関数を使う。
 *
 * 方針:
 * - 生の緯度経度はこの関数の中だけで扱い、外に出すのはセル ID と時刻のみ。
 * - accuracy が maxAccuracyM を超える点は捨てる。
 * - 連続する点の間は gridPathCells で埋める（ただし距離・時間が離れすぎていたら埋めない）。
 * - exclude（自宅ゾーン等）に該当するセルは出力しない。
 */
import {
  cellToLatLng,
  getResolution,
  greatCircleDistance,
  gridDisk,
  gridDistance,
  gridPathCells,
  isValidCell,
  latLngToCell,
} from 'h3-js';

export const CELL_RES = 10;
export const MAX_ACCURACY_M = 50;
/** これより離れた連続点の間は塗り埋めしない（電車・ワープ・GPS飛び対策） */
export const MAX_GAP_M = 1000;
/** これより時間が空いた連続点の間は塗り埋めしない */
export const MAX_GAP_MS = 5 * 60 * 1000;

export interface GeoPoint {
  lat: number;
  lng: number;
  /** 水平方向の誤差（m）。不明なら undefined */
  accuracy?: number;
  /** epoch ms */
  t: number;
}

/** 直前の位置（セル単位）。サーバーでは生座標の代わりにこれだけを保持する */
export interface Anchor {
  h3: string;
  t: number;
}

export interface CellHit {
  h3: string;
  /** epoch ms */
  t: number;
}

export interface ConvertOptions {
  prev?: Anchor | null;
  res?: number;
  maxAccuracyM?: number;
  maxGapM?: number;
  maxGapMs?: number;
  /** true を返したセルは記録しない（自宅ゾーン） */
  exclude?: (h3: string) => boolean;
}

export interface ConvertResult {
  /** 時刻順。同じセルが複数回出ることはない（最初に入った時刻を採用） */
  hits: CellHit[];
  /** 次回呼び出しに渡すアンカー。最後の点が除外ゾーン内なら null */
  last: Anchor | null;
  /** accuracy 等で捨てた点の数 */
  dropped: number;
}

export function isValidPoint(p: GeoPoint): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    Number.isFinite(p.t)
  );
}

export function cellDistanceM(a: string, b: string): number {
  return greatCircleDistance(cellToLatLng(a), cellToLatLng(b), 'm');
}

/** a→b の間を埋めるセル列（a, b を含む）。埋められなければ null */
export function pathBetween(a: string, b: string): string[] | null {
  try {
    return gridPathCells(a, b);
  } catch {
    return null; // 五角形をまたぐ等で失敗することがある
  }
}

export function pointsToCells(points: GeoPoint[], opts: ConvertOptions = {}): ConvertResult {
  const res = opts.res ?? CELL_RES;
  const maxAcc = opts.maxAccuracyM ?? MAX_ACCURACY_M;
  const maxGapM = opts.maxGapM ?? MAX_GAP_M;
  const maxGapMs = opts.maxGapMs ?? MAX_GAP_MS;
  const exclude = opts.exclude;

  const sorted = points.filter(isValidPoint).sort((a, b) => a.t - b.t);
  let dropped = points.length - sorted.length;

  const seen = new Map<string, number>();
  const hits: CellHit[] = [];
  const emit = (h3: string, t: number) => {
    if (exclude?.(h3)) return;
    if (seen.has(h3)) return;
    seen.set(h3, t);
    hits.push({ h3, t });
  };

  let prev: Anchor | null = opts.prev && isValidCell(opts.prev.h3) ? opts.prev : null;
  for (const p of sorted) {
    if (p.accuracy !== undefined && p.accuracy !== null && (!(p.accuracy >= 0) || p.accuracy > maxAcc)) {
      dropped++;
      continue;
    }
    const cell = latLngToCell(p.lat, p.lng, res);
    if (prev && prev.h3 !== cell) {
      const dt = p.t - prev.t;
      const sameRes = getResolution(prev.h3) === res;
      if (sameRes && dt >= 0 && dt <= maxGapMs && cellDistanceM(prev.h3, cell) <= maxGapM) {
        const path = pathBetween(prev.h3, cell);
        if (path) {
          // 両端（prev と現在セル）は除き、間のセルの時刻は線形補間する
          const n = path.length - 1;
          const from = prev;
          path.slice(1, -1).forEach((h, i) => emit(h, Math.round(from.t + (dt * (i + 1)) / n)));
        }
      }
    }
    emit(cell, p.t);
    prev = { h3: cell, t: p.t };
  }

  const last = prev && exclude?.(prev.h3) ? null : prev;
  return { hits, last, dropped };
}

// ---------------------------------------------------------------- 自宅ゾーン

export interface HomeZone {
  /** 中心セル（解像度10）。生の座標は保持しない */
  h3: string;
  /** 半径（m） */
  radiusM: number;
}

/** 解像度10のセル中心間距離はおよそ 115m（= 平均辺長 65.9m × √3） */
const RES10_SPACING_M = 65.9 * Math.sqrt(3);

export function zoneRingK(radiusM: number): number {
  return Math.max(0, Math.ceil(radiusM / RES10_SPACING_M));
}

/** 自宅ゾーン群から exclude 関数を作る */
export function makeZoneExcluder(zones: HomeZone[]): ((h3: string) => boolean) | undefined {
  if (!zones.length) return undefined;
  const set = new Set<string>();
  for (const z of zones) {
    if (!isValidCell(z.h3)) continue;
    for (const c of gridDisk(z.h3, zoneRingK(z.radiusM))) set.add(c);
  }
  return (h3: string) => {
    if (set.has(h3)) return true;
    // 解像度が違うセルが来ても安全側に倒す
    if (getResolution(h3) !== CELL_RES) {
      return zones.some((z) => {
        try {
          return gridDistance(z.h3, h3) <= zoneRingK(z.radiusM);
        } catch {
          return false;
        }
      });
    }
    return false;
  };
}

export function isValidHit(h: unknown, res = CELL_RES): h is CellHit {
  if (!h || typeof h !== 'object') return false;
  const { h3, t } = h as CellHit;
  return typeof h3 === 'string' && isValidCell(h3) && getResolution(h3) === res && Number.isFinite(t);
}
