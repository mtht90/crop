import { describe, expect, it } from 'vitest';
import { areNeighborCells, cellToLatLng, getResolution, latLngToCell } from 'h3-js';
import { CELL_RES, isValidHit, makeZoneExcluder, pointsToCells, zoneRingK, type GeoPoint } from '../shared/cells';

// 東京駅付近
const LAT = 35.681236;
const LNG = 139.767125;
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

/** 東へ meters m 移動した点 */
function east(meters: number, t: number, accuracy = 10): GeoPoint {
  const dLng = meters / (111_320 * Math.cos((LAT * Math.PI) / 180));
  return { lat: LAT, lng: LNG + dLng, t, accuracy };
}

function isContiguous(cells: string[]): boolean {
  for (let i = 1; i < cells.length; i++) {
    if (cells[i] !== cells[i - 1] && !areNeighborCells(cells[i - 1], cells[i])) return false;
  }
  return true;
}

describe('pointsToCells', () => {
  it('1点を解像度10のセルに変換する', () => {
    const { hits, last } = pointsToCells([{ lat: LAT, lng: LNG, t: T0, accuracy: 5 }]);
    expect(hits).toHaveLength(1);
    expect(hits[0].h3).toBe(latLngToCell(LAT, LNG, 10));
    expect(getResolution(hits[0].h3)).toBe(CELL_RES);
    expect(hits[0].t).toBe(T0);
    expect(last).toEqual({ h3: hits[0].h3, t: T0 });
  });

  it('accuracy が 50m を超える点は捨てる（50m ちょうどは採用）', () => {
    const { hits, dropped } = pointsToCells([
      { lat: LAT, lng: LNG, t: T0, accuracy: 51 },
      { lat: LAT + 0.01, lng: LNG, t: T0 + 1000, accuracy: 50 },
    ]);
    expect(dropped).toBe(1);
    expect(hits.map((h) => h.h3)).toEqual([latLngToCell(LAT + 0.01, LNG, 10)]);
  });

  it('accuracy が不明な点は採用し、負値や NaN は捨てる', () => {
    const r = pointsToCells([
      { lat: LAT, lng: LNG, t: T0 },
      { lat: LAT, lng: LNG + 0.01, t: T0 + 1, accuracy: -1 },
      { lat: LAT, lng: LNG + 0.02, t: T0 + 2, accuracy: Number.NaN },
    ]);
    expect(r.hits).toHaveLength(1);
    expect(r.dropped).toBe(2);
  });

  it('不正な座標は捨てる', () => {
    const r = pointsToCells([
      { lat: 120, lng: LNG, t: T0 },
      { lat: LAT, lng: Number.NaN, t: T0 },
      { lat: LAT, lng: LNG, t: Number.NaN },
    ]);
    expect(r.hits).toHaveLength(0);
    expect(r.dropped).toBe(3);
  });

  it('離れた2点の間を gridPathCells で埋めて途切れないようにする', () => {
    const { hits } = pointsToCells([east(0, T0), east(800, T0 + 60_000)]);
    const cells = hits.map((h) => h.h3);
    expect(cells.length).toBeGreaterThan(3);
    expect(cells[0]).toBe(latLngToCell(LAT, LNG, 10));
    expect(cells.at(-1)).toBe(latLngToCell(east(800, 0).lat, east(800, 0).lng, 10));
    expect(isContiguous(cells)).toBe(true);
    expect(new Set(cells).size).toBe(cells.length);
    // 補間された時刻は単調増加で、両端の時刻の範囲内
    for (let i = 1; i < hits.length; i++) expect(hits[i].t).toBeGreaterThanOrEqual(hits[i - 1].t);
    expect(hits[0].t).toBe(T0);
    expect(hits.at(-1)!.t).toBe(T0 + 60_000);
  });

  it('距離が離れすぎた点の間は埋めない', () => {
    const { hits } = pointsToCells([east(0, T0), east(3000, T0 + 60_000)]);
    expect(hits).toHaveLength(2);
  });

  it('時間が空きすぎた点の間は埋めない', () => {
    const { hits } = pointsToCells([east(0, T0), east(800, T0 + 10 * 60_000)]);
    expect(hits).toHaveLength(2);
  });

  it('入力が時刻順でなくても並べ替えて処理する', () => {
    const a = pointsToCells([east(800, T0 + 60_000), east(0, T0)]);
    const b = pointsToCells([east(0, T0), east(800, T0 + 60_000)]);
    expect(a.hits).toEqual(b.hits);
  });

  it('前回のアンカーから続けて埋める（バッチをまたいでも途切れない）', () => {
    const first = pointsToCells([east(0, T0)]);
    const second = pointsToCells([east(600, T0 + 30_000)], { prev: first.last });
    const cells = [...first.hits, ...second.hits].map((h) => h.h3);
    expect(isContiguous(cells)).toBe(true);
    // アンカーのセル自体は再出力しない
    expect(second.hits.map((h) => h.h3)).not.toContain(first.last!.h3);
  });

  it('同じセルに留まっても1回だけ出力する', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ lat: LAT, lng: LNG, t: T0 + i * 1000, accuracy: 5 }));
    const { hits } = pointsToCells(pts);
    expect(hits).toHaveLength(1);
    expect(hits[0].t).toBe(T0);
  });

  it('自宅ゾーン内のセルは出力せず、アンカーも残さない', () => {
    const home = latLngToCell(LAT, LNG, 10);
    const exclude = makeZoneExcluder([{ h3: home, radiusM: 200 }]);
    const { hits, last } = pointsToCells([east(0, T0), east(100, T0 + 10_000)], { exclude });
    expect(hits).toHaveLength(0);
    expect(last).toBeNull();
  });

  it('自宅ゾーンから出ていく経路ではゾーン外のセルだけ出力する', () => {
    const home = latLngToCell(LAT, LNG, 10);
    const exclude = makeZoneExcluder([{ h3: home, radiusM: 200 }])!;
    const { hits } = pointsToCells([east(0, T0), east(900, T0 + 60_000)], { exclude });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(exclude(h.h3)).toBe(false);
    // 中心から 200m 以内の点のセルは含まれない
    expect(hits.map((h) => h.h3)).not.toContain(latLngToCell(east(150, 0).lat, east(150, 0).lng, 10));
  });
});

describe('自宅ゾーン', () => {
  it('半径からリング数を求める', () => {
    expect(zoneRingK(0)).toBe(0);
    expect(zoneRingK(100)).toBe(1);
    expect(zoneRingK(300)).toBe(3);
  });

  it('ゾーンが無ければ exclude は undefined', () => {
    expect(makeZoneExcluder([])).toBeUndefined();
  });

  it('ゾーンの外側は除外しない', () => {
    const home = latLngToCell(LAT, LNG, 10);
    const exclude = makeZoneExcluder([{ h3: home, radiusM: 200 }])!;
    expect(exclude(home)).toBe(true);
    const far = latLngToCell(LAT + 0.05, LNG, 10);
    expect(exclude(far)).toBe(false);
    const [la, ln] = cellToLatLng(home);
    expect(exclude(latLngToCell(la, ln, 10))).toBe(true);
  });
});

describe('isValidHit', () => {
  it('解像度10の正しいセルだけ受け付ける', () => {
    expect(isValidHit({ h3: latLngToCell(LAT, LNG, 10), t: T0 })).toBe(true);
    expect(isValidHit({ h3: latLngToCell(LAT, LNG, 9), t: T0 })).toBe(false);
    expect(isValidHit({ h3: 'zzz', t: T0 })).toBe(false);
    expect(isValidHit({ h3: latLngToCell(LAT, LNG, 10), t: 'x' })).toBe(false);
    expect(isValidHit(null)).toBe(false);
  });
});
