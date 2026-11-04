import { describe, expect, it } from 'vitest';
import { battleReward, bump, COIN_SCALE, currentEvent, dayKey, ensurePeriods, EVENTS, freshProgress, GEM_DAILY_WIN, GEM_FIRST_CLEAR, LOGIN_GEMS, LOGIN_REWARDS, levelGems, levelReward, missionGems, missionValue, NORMAL_MISSIONS, ACHIEVEMENTS, weekKey } from '../progress';
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
      expect(r.lines.find((l) => l.label === '初回クリアボーナス')?.coins).toBe(200 * COIN_SCALE);
    }
  });
  it('the first win of the day adds a few gems; losing pays none', () => {
    const p = freshProgress();
    p.lastWinDay = '';
    expect(battleReward(p, win).gems).toBe(GEM_DAILY_WIN);
    expect(battleReward(p, { ...win, win: false }).gems).toBe(0);
  });
  it('everyday missions pay coins in the hundreds to thousands; only event tasks pay gems', () => {
    expect(LOGIN_GEMS.length).toBe(LOGIN_REWARDS.length);
    expect(LOGIN_GEMS[6]).toBeGreaterThan(LOGIN_GEMS[0]);
    for (const m of [...NORMAL_MISSIONS, ...ACHIEVEMENTS]) {
      expect(missionGems(m), m.id).toBe(0);
      expect(m.reward, m.id).toBeGreaterThanOrEqual(150);
    }
    expect(levelReward(2)).toBeGreaterThanOrEqual(500);
    for (const e of EVENTS) {
      const tasks = e.tasks.filter((t) => t.stat !== 'eventTasks');
      for (const t of tasks) {
        expect(t.gems!, t.id).toBeGreaterThanOrEqual(50);
        expect(t.gems!, t.id).toBeLessThanOrEqual(250);
      }
      // clearing several tasks pays more than any single one
      const bonus = e.tasks.find((t) => t.stat === 'eventTasks')!;
      expect(bonus.gems!).toBeGreaterThan(Math.max(...tasks.map((t) => t.gems!)));
      expect(bonus.target).toBeLessThanOrEqual(tasks.length);
    }
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

describe('期間限定イベント', () => {
  it('runs one event a week and counts only this week', () => {
    const p = freshProgress();
    ensurePeriods(p);
    expect(p.event?.key).toBe(weekKey());
    const ev = currentEvent(p);
    expect(ev.tasks.length).toBeGreaterThan(3);
    bump(p, { wins: 2, battles: 3 });
    const ext = { collectionPct: 0, rivals: 0, story: 0, uniques: 0, stars: 0, decks: 0 };
    const t = ev.tasks.find((x) => x.stat === 'battles' || x.stat === 'wins')!;
    expect(missionValue(p, t, 'event', ext)).toBeGreaterThan(0);
    // the all-clear bonus counts the other tasks claimed
    const bonus = ev.tasks.find((x) => x.stat === 'eventTasks')!;
    p.event!.claimed.push(ev.tasks[0].id, ev.tasks[1].id);
    expect(missionValue(p, bonus, 'event', ext)).toBe(2);
    // a new week starts the event over
    p.event!.key = 'W2000-01-03';
    ensurePeriods(p);
    expect(p.event!.claimed).toEqual([]);
  });
});
