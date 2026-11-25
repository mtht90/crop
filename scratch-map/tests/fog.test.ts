import { describe, expect, it } from 'vitest';
import { gridDisk, latLngToCell } from 'h3-js';
import { fogFeature, visitedFeature } from '../web/src/fog';

const area = (r: number[][]) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return s / 2;
};

describe('霧ポリゴン', () => {
  it('セルが無ければ世界全体を覆う', () => {
    const f = fogFeature([]);
    const coords = (f.geometry as GeoJSON.MultiPolygon).coordinates;
    expect(coords).toHaveLength(1);
    expect(coords[0]).toHaveLength(1);
  });

  it('塗ったセルを穴としてくり抜く（外周は反時計回り・穴は時計回り）', () => {
    const c = latLngToCell(35.68, 139.76, 10);
    const cells = gridDisk(c, 2);
    const coords = (fogFeature(cells).geometry as GeoJSON.MultiPolygon).coordinates;
    expect(coords[0]).toHaveLength(2); // 世界 + 穴1つ（隣接セルは1つの領域にまとまる）
    expect(area(coords[0][0])).toBeGreaterThan(0);
    expect(area(coords[0][1])).toBeLessThan(0);
  });

  it('ドーナツ状に塗った内側の未踏エリアは霧の島になる', () => {
    const c = latLngToCell(35.68, 139.76, 10);
    const ring = gridDisk(c, 2).filter((h) => h !== c);
    const coords = (fogFeature(ring).geometry as GeoJSON.MultiPolygon).coordinates;
    expect(coords).toHaveLength(2); // [世界+穴], [島]
    expect(area(coords[1][0])).toBeGreaterThan(0);
  });

  it('離れた2か所は別々の穴になる', () => {
    const a = latLngToCell(35.68, 139.76, 10);
    const b = latLngToCell(35.70, 139.80, 10);
    const coords = (fogFeature([a, b]).geometry as GeoJSON.MultiPolygon).coordinates;
    expect(coords[0]).toHaveLength(3);
    expect((visitedFeature([a, b]).geometry as GeoJSON.MultiPolygon).coordinates).toHaveLength(2);
  });
});
