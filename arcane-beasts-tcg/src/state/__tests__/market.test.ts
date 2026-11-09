import { beforeEach, describe, expect, it } from 'vitest';
import { AUTO_PRICE, SHOP_ITEMS } from '../market';
import { useStore } from '../store';

const st = () => useStore.getState();
const set = (gems: number, tickets = 0) =>
  st().update((s) => {
    s.gems = gems;
    s.autoTickets = tickets;
    s.autoPaidSeq = undefined;
    s.purchases = [];
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
});
