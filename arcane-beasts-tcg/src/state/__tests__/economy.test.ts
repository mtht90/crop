import { describe, expect, it } from 'vitest';
import { battleReward, dayKey, freshProgress, GEM_DAILY_WIN, GEM_FIRST_CLEAR, LOGIN_GEMS, LOGIN_REWARDS, levelGems, missionGems, NORMAL_MISSIONS, ACHIEVEMENTS } from '../progress';
import { cleanWardrobe, COSMETICS, DEFAULT_LOOK, freshWardrobe } from '../cosmetics';

const win = { win: true, level: 'normal' as const, baseReward: 300, prizesTaken: 6, prizesLost: 2, firstClear: false };

describe('gems (ジェム)', () => {
  it('a first clear pays gems by difficulty on top of coins', () => {
    const p = freshProgress();
    p.lastWinDay = dayKey();
    const again = battleReward(p, win);
    expect(again.gems).toBe(0);
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const r = battleReward(p, { ...win, level, firstClear: true });
      expect(r.gems, level).toBe(GEM_FIRST_CLEAR[level]);
      expect(r.lines.find((l) => l.label === '初回クリアボーナス')?.coins).toBe(200);
    }
  });
  it('the first win of the day adds a few gems; losing pays none', () => {
    const p = freshProgress();
    p.lastWinDay = '';
    expect(battleReward(p, win).gems).toBe(GEM_DAILY_WIN);
    expect(battleReward(p, { ...win, win: false }).gems).toBe(0);
  });
  it('login, missions and level-ups all have gems, and the total stays modest', () => {
    expect(LOGIN_GEMS.length).toBe(LOGIN_REWARDS.length);
    expect(LOGIN_GEMS[6]).toBeGreaterThan(LOGIN_GEMS[0]);
    for (const m of [...NORMAL_MISSIONS, ...ACHIEVEMENTS]) expect(missionGems(m.reward), m.id).toBeGreaterThanOrEqual(5);
    expect(levelGems(5)).toBeGreaterThan(levelGems(4));
    // a week of logins is about one pack (150), not a dozen
    expect(LOGIN_GEMS.reduce((a, b) => a + b, 0)).toBeLessThan(250);
  });
});

describe('ワードローブ', () => {
  it('has unique ids, free defaults and a price on everything else', () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    for (const id of Object.values(DEFAULT_LOOK)) expect(COSMETICS.find((c) => c.id === id)?.price).toBe(0);
    for (const c of COSMETICS) if (!Object.values(DEFAULT_LOOK).includes(c.id as never)) expect(c.price, c.id).toBeGreaterThan(0);
  });
  it('repairs a broken or foreign wardrobe', () => {
    expect(cleanWardrobe(undefined)).toEqual(freshWardrobe());
    const w = cleanWardrobe({ owned: ['sleeve-gold', 'nope'], sleeve: 'sleeve-gold', mat: 'mat-castle', title: 'sleeve-gold' });
    expect(w.owned).toContain('sleeve-gold');
    expect(w.owned).not.toContain('nope');
    expect(w.sleeve).toBe('sleeve-gold');
    expect(w.mat).toBe(DEFAULT_LOOK.mat); // not owned
    expect(w.title).toBe(DEFAULT_LOOK.title); // wrong kind
  });
});
