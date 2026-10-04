import { describe, expect, it } from 'vitest';
import { CROPS, EFFECT, START_PLOTS } from './data';
import { formatMoney } from './format';
import { hexToWorld, spiral, worldToHex } from './hex';
import { buyUpgrade, capacity, harvest, isRipe, plant, sell, tickGrowth, unlockCrop } from './logic';
import { FARM_HEXES, newGame, restore } from './state';

describe('畑の基本ループ', () => {
  it('植えて、育って、収穫して、売れる', () => {
    const s = newGame();
    expect(plant(s, 0)).toBe(true);
    expect(harvest(s, 0, true)).toEqual({ ok: false, reason: 'not-ripe' });
    tickGrowth(s, CROPS.lettuce.growSec);
    expect(isRipe(s.plots[0])).toBe(true);
    const r = harvest(s, 0, true, () => 0.99);
    expect(r).toEqual({ ok: true, crop: 'lettuce', quality: 1 });
    expect(s.plots[0].crop).toBeNull();
    expect(s.plots[0].lastCrop).toBe('lettuce');
    expect(sell(s)).toBe(CROPS.lettuce.basePrice * 1.5);
    expect(s.money).toBe(CROPS.lettuce.basePrice * 1.5);
  });

  it('農夫の収穫は★1、手収穫は★2以上', () => {
    const s = newGame();
    plant(s, 0);
    plant(s, 1);
    tickGrowth(s, 999);
    expect(harvest(s, 0, false)).toMatchObject({ quality: 0 });
    expect(harvest(s, 1, true, () => 0)).toMatchObject({ quality: 2 });
  });

  it('倉庫が満杯なら収穫できない', () => {
    const s = newGame();
    s.inventory.lettuce[0] = capacity(s);
    plant(s, 0);
    tickGrowth(s, 999);
    expect(harvest(s, 0, true)).toEqual({ ok: false, reason: 'full' });
  });

  it('未解放の作物は植えられない', () => {
    const s = newGame();
    expect(plant(s, 0, 'tomato')).toBe(false);
    s.money = CROPS.tomato.unlockCost;
    expect(unlockCrop(s, 'tomato')).toBe(true);
    expect(s.money).toBe(0);
    expect(plant(s, 0, 'tomato')).toBe(true);
  });
});

describe('アップグレード', () => {
  it('お金が足りないと買えない／足りれば効果が出る', () => {
    const s = newGame();
    expect(buyUpgrade(s, 'expand')).toBe(false);
    s.money = 1e9;
    expect(buyUpgrade(s, 'expand')).toBe(true);
    expect(s.plots.length).toBe(START_PLOTS + 1);
    expect(buyUpgrade(s, 'warehouse')).toBe(true);
    expect(capacity(s)).toBe(EFFECT.warehouseCap(1));
  });

  it('畑は用意した区画数までしか広がらない', () => {
    const s = newGame();
    s.money = Infinity;
    while (buyUpgrade(s, 'expand'));
    expect(s.plots.length).toBe(FARM_HEXES.length);
  });
});

describe('補助関数', () => {
  it('ヘックス座標とワールド座標が往復する', () => {
    for (const h of spiral(4)) {
      const w = hexToWorld(h);
      expect(worldToHex(w.x, w.z)).toEqual(h);
    }
    expect(new Set(spiral(3).map((h) => `${h.q},${h.r}`)).size).toBe(37);
  });

  it('お金の表示', () => {
    expect(formatMoney(1234)).toBe('1,234');
    expect(formatMoney(12345)).toBe('1.23万');
    expect(formatMoney(3e8)).toBe('3億');
  });

  it('壊れたセーブは読み込まない', () => {
    expect(restore({ version: 99 })).toBeNull();
    expect(restore({ version: 1, money: 5 })?.money).toBe(5);
  });
});
