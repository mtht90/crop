import { describe, expect, test } from 'vitest';
import { applyResult, emblemKey, newRank, rankName, rollSeason, seasonKey, START_RATING, tierOf, viewOf, MASTER_AT } from '../rank';

const NOV = Date.UTC(2026, 10, 7, 3);

describe('ranked', () => {
  test('a new player starts in bronze I and the view hides the rating', () => {
    const v = viewOf(newRank(NOV));
    expect(rankName(v)).toBe('ブロンズ I');
    expect(Object.keys(v)).not.toContain('rating');
    expect(emblemKey(v)).toBe('bronze-2');
  });

  test('wins climb, losses fall, and a tier once reached is kept for the season', () => {
    let r = newRank(NOV);
    for (let i = 0; i < 4; i++) r = applyResult(r, START_RATING, true);
    expect(tierOf(r.rating)).toBeGreaterThanOrEqual(1);
    const tier = tierOf(r.rating);
    for (let i = 0; i < 30; i++) r = applyResult(r, START_RATING + 300, false);
    expect(tierOf(r.rating)).toBe(tier);
    expect(r.wins).toBe(4);
    expect(r.losses).toBe(30);
  });

  test('beating a stronger player is worth more; a win is always worth something', () => {
    const r = { ...newRank(NOV), rating: 1000, games: 40 };
    const up = applyResult(r, 1300, true).rating - r.rating;
    const even = applyResult(r, 1000, true).rating - r.rating;
    const down = applyResult(r, 600, true).rating - r.rating;
    expect(up).toBeGreaterThan(even);
    expect(down).toBeGreaterThanOrEqual(8);
  });

  test('master sits on top and has no division', () => {
    const v = viewOf({ ...newRank(NOV), rating: MASTER_AT + 50 });
    expect(v.tier).toBe(5);
    expect(rankName(v)).toBe('マスター');
    expect(emblemKey(v)).toBe('master');
  });

  test('a new month starts a new season: halfway back, and last season is remembered', () => {
    expect(seasonKey(NOV)).toBe('2026-11');
    // late on the 30th in UTC is already December in Japan
    expect(seasonKey(Date.UTC(2026, 10, 30, 16))).toBe('2026-12');
    const r = { ...applyResult(newRank(NOV), 1000, true), rating: 1400 };
    const next = rollSeason(r, Date.UTC(2026, 11, 2));
    expect(next.season).toBe('2026-12');
    expect(next.rating).toBe(Math.round(START_RATING + (1400 - START_RATING) / 2));
    expect(next.games).toBe(0);
    expect(next.last).toEqual({ season: '2026-11', tier: tierOf(1400) });
    expect(rollSeason(next, Date.UTC(2026, 11, 20))).toBe(next);
  });
});
