/**
 * 霧（未踏エリア）の GeoJSON を作る。
 * 全世界を覆うポリゴンから、塗ったセルの和集合（cellsToMultiPolygon）をくり抜く。
 */
import { cellsToMultiPolygon, cellToBoundary } from 'h3-js';

type Ring = number[][];
type Feature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;

const WORLD: Ring = [
  [-180, -85.0511],
  [180, -85.0511],
  [180, 85.0511],
  [-180, 85.0511],
  [-180, -85.0511],
];

/** 符号付き面積（正 = 反時計回り） */
function signedArea(r: Ring): number {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return s / 2;
}

const ccw = (r: Ring) => (signedArea(r) >= 0 ? r : [...r].reverse());
const cw = (r: Ring) => (signedArea(r) < 0 ? r : [...r].reverse());

/** 塗ったセルの和集合（MultiPolygon の座標） */
export function unionPolygons(cells: string[]): Ring[][] {
  if (!cells.length) return [];
  return cellsToMultiPolygon(cells, true) as Ring[][];
}

/** 霧のフィーチャ: 世界（外周）＋塗った領域の外周（穴）、塗った領域の中の未踏の穴は霧の島として別ポリゴンに */
export function fogFeature(cells: string[]): Feature {
  const polys = unionPolygons(cells);
  const holes = polys.map((p) => cw(p[0]));
  const islands = polys.flatMap((p) => p.slice(1).map((r) => [ccw(r)]));
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiPolygon', coordinates: [[ccw(WORLD), ...holes], ...islands] },
  };
}

/** 塗った領域（色付け・縁取り用） */
export function visitedFeature(cells: string[], properties: Record<string, unknown> = {}): Feature {
  const polys = unionPolygons(cells).map((p) => [ccw(p[0]), ...p.slice(1).map(cw)]);
  return { type: 'Feature', properties, geometry: { type: 'MultiPolygon', coordinates: polys } };
}

/** 個々のセルの六角形（演出用） */
export function cellPolygons(cells: string[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cells.map((h) => ({
      type: 'Feature',
      properties: { h3: h },
      geometry: { type: 'Polygon', coordinates: [ccw(cellToBoundary(h, true))] },
    })),
  };
}
