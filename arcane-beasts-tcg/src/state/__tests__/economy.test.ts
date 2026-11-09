import { describe, expect, it } from 'vitest';
import { battleReward, bump, currentEvent, winGems, dayKey, ensurePeriods, EVENTS, freshProgress, GEM_DAILY_WIN, GEM_FIRST_CLEAR, LOGIN_GEMS, LOGIN_REWARDS, levelGems, levelReward, missionGems, missionValue, NORMAL_MISSIONS, storyFirstClear, ACHIEVEMENTS, weekKey } from '../progress';
import { cleanWardrobe, COSMETICS, DEFAULT_LOOK, freshWardrobe } from '../cosmetics';
import { PACK_PRICE, PREMIUM_PRICE, TEN_PACKS } from '../store';

const win = { win: true, level: 'normal' as const, baseReward: 300, prizesTaken: 6, prizesLost: 2, firstClear: false };

describe('gems (ジェム) — ぷにぷに準拠', () => {
  it('a win pays a little (5-30), a first clear a lot; coins come only on their own line', () => {
    const p = freshProgress();
    p.lastWinDay = dayKey();
    const again = battleReward(p, win);
    // コイン (for the 交換所): one line of their own, never mixed into the gem lines
    expect(again.total).toBe(again.lines.find((l) => l.label === 'コイン')!.coins);
    for (const l of again.lines) if (l.label !== 'コイン') expect(l.coins, l.label).toBe(0);
    expect(again.gems).toBe(winGems(300));
    expect(winGems(0)).toBe(10);
    expect(winGems(99999)).toBe(60);
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const r = battleReward(p, { ...win, level, firstClear: true });
      expect(r.gems - again.gems, level).toBe(GEM_FIRST_CLEAR[level]);
    }
  });
  it('the first win of the day adds a bonus; a loss pays nothing', () => {
    const p = freshProgress();
    p.lastWinDay = dayKey();
    const plain = battleReward(p, win).gems;
    p.lastWinDay = '';
    expect(battleReward(p, win).gems - plain).toBe(GEM_DAILY_WIN);
    const lose = battleReward(p, { ...win, win: false });
    expect(lose.gems).toBe(0);
    expect(lose.exp).toBeGreaterThan(0);
  });
  it('a pack is 500, a 10連 4,500; a login week pays about two packs', () => {
    expect(PACK_PRICE).toBe(500);
    expect(PACK_PRICE * TEN_PACKS).toBe(4500);
    expect(PREMIUM_PRICE).toBe(500);
    expect(PREMIUM_PRICE * TEN_PACKS).toBe(4500);
    expect(LOGIN_REWARDS.reduce((a, b) => a + b, 0) + LOGIN_GEMS.reduce((a, b) => a + b, 0)).toBe(1020);
    for (const m of [...NORMAL_MISSIONS, ...ACHIEVEMENTS]) expect(missionGems(m), m.id).toBe(m.reward * 2 + (m.gems ?? 0));
    expect(storyFirstClear(1, false, 1).gems).toBe(100);
    expect(storyFirstClear(12, true, 2).gems).toBe(1500);
    expect(storyFirstClear(11, false, 1).gems).toBeGreaterThan(storyFirstClear(1, false, 1).gems);
    expect(levelReward(2)).toBe(0);
    expect(levelGems(5)).toBeGreaterThan(levelGems(4));
  });
});

describe('ワードローブ', () => {
  it('has unique ids, free defaults and a gem price on everything else', () => {
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

describe('負けたときの報酬', () => {
  it('a lost battle pays only a little, even a big story duel', async () => {
    const { battleReward, freshProgress, LOSS_PART_MAX } = await import('../progress');
    const r = battleReward(freshProgress(), { win: false, level: 'hard', baseReward: 1500, prizesTaken: 5, prizesLost: 6, firstClear: false });
    expect(r.gems).toBeLessThanOrEqual(LOSS_PART_MAX + 10);
    const w = battleReward(freshProgress(), { win: true, level: 'hard', baseReward: 1500, prizesTaken: 6, prizesLost: 2, firstClear: false });
    expect(w.gems).toBeGreaterThan(r.gems * 20);
  });
});
