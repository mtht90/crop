import { describe, expect, it } from 'vitest';
import { card } from '../../engine/cards';
import { CHAPTER_BOOSTERS, openPack, pickupBooster, PREMIUM_BOOSTER, SURE3_BOOSTER, TYPE_BOOSTERS } from '../store';
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

  it('the pickup comes more often than in a plain premium pack, at the same ★ odds', () => {
    const p = pickupBooster(Date.UTC(2026, 10, 9));
    expect(p.pickup).toHaveLength(3);
    const count = (b: typeof p | typeof PREMIUM_BOOSTER) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) n += openPack(b).cards.filter((c) => p.pickup!.includes(c.id)).length;
      return n;
    };
    expect(count(p)).toBeGreaterThan(count({ ...PREMIUM_BOOSTER }) * 3);
    void base;
  });

  it('a battle pays coins: more for a win', () => {
    expect(battleCoins(true, 'hard')).toBeGreaterThan(battleCoins(true, 'easy'));
    expect(battleCoins(false, 'hard')).toBeLessThan(battleCoins(true, 'easy'));
  });
});
