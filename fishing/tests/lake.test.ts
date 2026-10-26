import { describe, expect, it } from 'vitest';
import { DOCK, HUT, SPAWN, structureAt, terrainHeight, waterDepth } from '../src/world/shape';

describe('湖の地形', () => {
  it('スポーン地点と小屋は陸上', () => {
    expect(terrainHeight(SPAWN.x, SPAWN.z)).toBeGreaterThan(0);
    expect(terrainHeight(HUT.x, HUT.z)).toBeGreaterThan(0);
  });
  it('桟橋の先は十分な水深があり、桟橋ポイントになる', () => {
    expect(waterDepth(DOCK.xEnd, 0)).toBeGreaterThan(2);
    expect(structureAt(DOCK.xEnd - 3, 0)).toBe('dock');
  });
  it('中央は深い', () => {
    expect(waterDepth(-20, 10)).toBeGreaterThan(10);
    expect(structureAt(-20, 10)).toBe('open');
  });
  it('全ポイントが湖内に存在する', () => {
    const found = new Set<string>();
    for (let x = -160; x <= 160; x += 4)
      for (let z = -160; z <= 160; z += 4) if (waterDepth(x, z) > 0.3) found.add(structureAt(x, z));
    expect([...found].sort()).toEqual(['dock', 'inflow', 'open', 'rocks', 'shallows', 'weeds']);
  });
});
