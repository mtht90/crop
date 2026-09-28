import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { UPGRADES } from '../src/data/upgrades';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { RESEARCH, RESEARCH_MAP } from '../src/data/research';
import { SHOP_ITEMS } from '../src/data/shops';
import { RELICS, DESTINATIONS } from '../src/data/relics';
import { CHALLENGES } from '../src/data/challenges';

function unique(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

describe('ゲームデータ', () => {
  it('規模', () => {
    expect(BUILDINGS.length).toBe(40);
    expect(UPGRADES.length).toBeGreaterThanOrEqual(700);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(800);
    expect(RESEARCH.length).toBeGreaterThanOrEqual(45);
    expect(CHALLENGES.length).toBe(8);
  });
  it('ID が重複しない', () => {
    expect(unique(UPGRADES.map((u) => u.id))).toBe(true);
    expect(unique(ACHIEVEMENTS.map((a) => a.id))).toBe(true);
    expect(unique(RESEARCH.map((r) => r.id))).toBe(true);
    expect(unique(SHOP_ITEMS.map((s) => s.id))).toBe(true);
    expect(unique(RELICS.map((r) => r.id))).toBe(true);
    expect(unique(DESTINATIONS.map((d) => d.id))).toBe(true);
  });
  it('研究の前提が存在する', () => {
    for (const r of RESEARCH) for (const req of r.requires) expect(RESEARCH_MAP.has(req), `${r.id} -> ${req}`).toBe(true);
  });
  it('施設の価格と生産は上位ほど大きい', () => {
    for (let i = 1; i < BUILDINGS.length; i++) {
      expect(BUILDINGS[i].baseCost.gt(BUILDINGS[i - 1].baseCost)).toBe(true);
      expect(BUILDINGS[i].baseProd.gt(BUILDINGS[i - 1].baseProd)).toBe(true);
    }
  });
  it('全レア度に遺物がある', () => {
    for (let r = 0; r < 5; r++) expect(RELICS.some((x) => x.rarity === r)).toBe(true);
  });
});
