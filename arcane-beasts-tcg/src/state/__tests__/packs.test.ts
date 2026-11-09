import { describe, expect, it } from 'vitest';
import { card } from '../../engine/cards';
import { CHAPTER_BOOSTERS, openPack, PREMIUM_BOOSTER, SPECIAL_BOOSTER, SURE3_BOOSTER, TYPE_BOOSTERS } from '../store';
import { battleCoins } from '../progress';

const base = (id: string) => card(id.replace(/-(SAR|SR|UR|M|FA)$/, ''));

describe('パックの種類', () => {
  it('a type pack holds only its own type of monster (and trainers)', () => {
    const fire = TYPE_BOOSTERS.find((b) => b.id === 'type-fire')!;
    for (let i = 0; i < 200; i++) {
      for (const c of openPack(fire).cards) {
        const b = card(c.baseId ?? c.id);
        if (b.kind === 'monster') expect(b.type).toBe('fire');
      }
    }
  });

  it('a chapter pack holds only that chapter; the ★3確定 pack always has a ★3 or better', () => {
    const ch = CHAPTER_BOOSTERS[1];
    for (let i = 0; i < 200; i++) {
      for (const c of openPack(ch).cards) expect(card(c.baseId ?? c.id).set).toBe('AB2');
      expect(Math.max(...openPack(SURE3_BOOSTER).cards.map((c) => c.rarity))).toBeGreaterThanOrEqual(3);
    }
  });

  it('スペシャルパック: two ★3-or-better cards every time, ★4 about twice the レアパック', () => {
    let sp4 = 0;
    let rare4 = 0;
    for (let i = 0; i < 6000; i++) {
      const c = openPack(SPECIAL_BOOSTER).cards;
      if (!c.some((x) => x.rarity === 5 || x.rarity === 4)) expect(c.filter((x) => x.rarity >= 3).length).toBeGreaterThanOrEqual(2);
      if (c.some((x) => x.rarity >= 4)) sp4++;
      if (openPack(PREMIUM_BOOSTER).cards.some((x) => x.rarity >= 4)) rare4++;
    }
    expect(sp4).toBeGreaterThan(rare4 * 1.5);
    expect(SPECIAL_BOOSTER.price).toBe(800);
    expect(SPECIAL_BOOSTER.tenPrice).toBe(7980);
  });

  it('a battle pays coins: more for a win', () => {
    expect(battleCoins(true, 'hard')).toBeGreaterThan(battleCoins(true, 'easy'));
    expect(battleCoins(false, 'hard')).toBeLessThan(battleCoins(true, 'easy'));
  });
});
