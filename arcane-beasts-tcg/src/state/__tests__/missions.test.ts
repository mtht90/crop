import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, freshProgress, missionValue, NORMAL_MISSIONS, type ExtCtx } from '../progress';

describe('通常ミッション', () => {
  it('has lots of missions with unique ids', () => {
    expect(NORMAL_MISSIONS.length).toBeGreaterThan(80);
    const ids = [...NORMAL_MISSIONS, ...ACHIEVEMENTS].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of NORMAL_MISSIONS) expect(m.reward, m.id).toBeGreaterThan(0);
  });
  it('reads lifetime stats and the save', () => {
    const p = freshProgress();
    p.stats.wins = 4;
    const ext: ExtCtx = { collectionPct: 0, rivals: 2, story: 3, rank: 10, uniques: 60, stars: 1, decks: 2 };
    const get = (id: string) => missionValue(p, NORMAL_MISSIONS.find((m) => m.id === id)!, 'normal', ext);
    expect(get('n-win-3')).toBe(4);
    expect(get('n-story-3')).toBe(3);
    expect(get('n-rank-10')).toBe(10);
    expect(get('n-uniq-50')).toBe(60);
  });
});
