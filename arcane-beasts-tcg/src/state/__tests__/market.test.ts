import { beforeEach, describe, expect, it } from 'vitest';
import { AUTO_PRICE, dailyDeals, SHOP_ITEMS } from '../market';
import { card } from '../../engine/cards';
import { useStore } from '../store';

const st = () => useStore.getState();
const set = (gems: number, tickets = 0) =>
  st().update((s) => {
    s.gems = gems;
    s.autoTickets = tickets;
    s.autoPaidSeq = undefined;
    s.purchases = [];
    s.shopBought = {};
    s.dealsBought = undefined;
    s.dev = false;
  });

describe('ショップと支払い', () => {
  beforeEach(() => set(1000));

  it('オートバトル: paid once per battle, the gems and the record together', () => {
    expect(st().payAuto(111)).toBe('paid');
    expect(st().save.gems).toBe(1000 - AUTO_PRICE);
    // the same battle again: nothing more is taken
    expect(st().payAuto(111)).toBe('already');
    expect(st().save.gems).toBe(1000 - AUTO_PRICE);
    expect(st().save.purchases).toHaveLength(1);
    expect(st().save.purchases![0]).toMatchObject({ label: 'オートバトル', gems: AUTO_PRICE });
    // the next battle is paid again
    expect(st().payAuto(222)).toBe('paid');
    expect(st().save.gems).toBe(1000 - 2 * AUTO_PRICE);
  });

  it('a ticket pays first; short of gems, nothing is taken', () => {
    set(1000, 1);
    expect(st().payAuto(1)).toBe('ticket');
    expect(st().save.autoTickets).toBe(0);
    expect(st().save.gems).toBe(1000);
    set(AUTO_PRICE - 1);
    expect(st().payAuto(2)).toBe('short');
    expect(st().save.gems).toBe(AUTO_PRICE - 1);
    expect(st().save.purchases).toHaveLength(0);
  });

  it('shop: tickets cheaper in bulk, a recipe is new to the player, short buys fail', () => {
    const one = SHOP_ITEMS.find((i) => i.id === 'auto1')!;
    const ten = SHOP_ITEMS.find((i) => i.id === 'auto10')!;
    expect(ten.price / ten.tickets!).toBeLessThan(one.price);
    set(5000);
    expect(st().buyItem('auto5').ok).toBe(true);
    expect(st().save.autoTickets).toBe(5);
    const r = st().buyItem('recipe');
    expect(r.ok).toBe(true);
    expect(st().save.recipes).toContain(r.recipe);
    set(10);
    expect(st().buyItem('auto1').ok).toBe(false);
    expect(st().save.gems).toBe(10);
  });

  it('the price sits just above what auto can earn at the best place to farm', () => {
    // the event's last stage pays 270 a win; on auto about half are won
    expect(AUTO_PRICE).toBeGreaterThan(270 * 0.5);
    expect(AUTO_PRICE).toBeLessThan(270);
  });

  it('sets: the starter set once ever, the weekly set once a week, both cheaper than their parts', () => {
    set(10000);
    for (const id of ['starter', 'weekly'] as const) {
      const it = SHOP_ITEMS.find((i) => i.id === id)!;
      expect(it.price).toBeLessThan(it.worth!);
      expect(st().buyItem(id).ok).toBe(true);
      expect(st().buyItem(id).ok).toBe(false);
    }
    expect(st().save.autoTickets).toBe(8);
    expect((st().save.recipes ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('日替わり: four cards (★3, ★2, ★2, ★1), the same all day, one of each', () => {
    const d = dailyDeals('2026-11-09');
    expect(d.map((x) => card(x.cid).rarity)).toEqual([3, 2, 2, 1]);
    expect(dailyDeals('2026-11-09')).toEqual(d);
    expect(dailyDeals('2026-11-10')).not.toEqual(d);
    set(1000);
    const today = dailyDeals();
    const before = st().save.collection[today[0].cid] ?? 0;
    expect(st().buyDeal(today[0].cid)).toBe(true);
    expect(st().save.collection[today[0].cid]).toBe(before + 1);
    expect(st().save.gems).toBe(1000 - today[0].price);
    expect(st().buyDeal(today[0].cid)).toBe(false);
    expect(st().buyDeal('not-a-deal')).toBe(false);
  });
});
