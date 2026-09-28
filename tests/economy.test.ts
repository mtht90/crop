import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/core/decimal';
import { buildingCost, buyBuilding, buyUpgrade, clickValue, doClick, maxAffordable } from '../src/logic/economy';
import { makeGame } from './helpers';

describe('経済', () => {
  it('クリックで星屑が増える', () => {
    const { g } = makeGame();
    const v = doClick(g);
    expect(v.toNumber()).toBe(1);
    expect(g.s.stardust.toNumber()).toBe(1);
    expect(g.s.run.clicks).toBe(1);
  });
  it('施設を買うと価格分減り、次の価格が上がる', () => {
    const { g } = makeGame();
    g.s.stardust = new Decimal(100);
    const c1 = buildingCost(g, 0);
    expect(buyBuilding(g, 0, 1)).toBe(1);
    expect(g.s.stardust.toNumber()).toBeCloseTo(100 - c1.toNumber());
    expect(buildingCost(g, 0).gt(c1)).toBe(true);
    g.recalc();
    expect(g.sps.gt(0)).toBe(true);
  });
  it('お金が足りないと買えない', () => {
    const { g } = makeGame();
    expect(buyBuilding(g, 0, 1)).toBe(0);
    expect(g.s.buildings[0]).toBe(0);
  });
  it('最大購入数の計算が価格と一致する', () => {
    const { g } = makeGame();
    g.s.stardust = new Decimal(1e6);
    const n = maxAffordable(g, 0);
    expect(buildingCost(g, 0, n).lte(g.s.stardust)).toBe(true);
    expect(buildingCost(g, 0, n + 1).gt(g.s.stardust)).toBe(true);
    expect(buyBuilding(g, 0, -1)).toBe(n);
  });
  it('施設強化アップグレードで生産が倍になる', () => {
    const { g } = makeGame();
    g.s.buildings[0] = 1;
    g.recalc();
    const before = g.sps;
    g.s.stardust = new Decimal(1e6);
    expect(buyUpgrade(g, 't0_0')).toBe(true);
    g.recalc();
    expect(g.sps.div(before).toNumber()).toBeCloseTo(2);
    expect(buyUpgrade(g, 't0_0')).toBe(false);
  });
  it('クリック封印チャレンジ中はクリック価値 0', () => {
    const { g } = makeGame();
    g.s.challenges.active = 'c1';
    g.recalc();
    expect(clickValue(g).eq(0)).toBe(true);
  });
});
