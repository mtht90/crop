import { describe, expect, test } from 'vitest';
import { applyResult, canMeet, emblemKey, newRank, rankName, rollSeason, seasonKey, SEASON_DROP, START_RATING, SWING, tierOf, viewOf, MASTER_AT, WIDEN_MS } from '../rank';

const NOV = Date.UTC(2026, 10, 7, 3);

describe('ranked', () => {
  test('a new player starts in bronze I and the view hides the rating', () => {
    const v = viewOf(newRank(NOV));
    expect(rankName(v)).toBe('ブロンズ I');
    expect(Object.keys(v)).not.toContain('rating');
    expect(emblemKey(v)).toBe('bronze-2');
  });

  test('wins climb and losses fall, with no protection: a tier can be lost again', () => {
    let r = newRank(NOV);
    for (let i = 0; i < 4; i++) r = applyResult(r, r.rating, true);
    expect(tierOf(r.rating)).toBe(1);
    for (let i = 0; i < 4; i++) r = applyResult(r, r.rating, false);
    expect(tierOf(r.rating)).toBe(0);
    expect(r.wins).toBe(4);
    expect(r.losses).toBe(4);
  });

  test('every game moves the rating within a set range', () => {
    const r = { ...newRank(NOV), rating: 1200 };
    for (const opp of [500, 900, 1200, 1500, 2500]) {
      for (const win of [true, false]) {
        const d = applyResult(r, opp, win).rating - r.rating;
        expect(Math.abs(d)).toBeGreaterThanOrEqual(SWING.min);
        expect(Math.abs(d)).toBeLessThanOrEqual(SWING.max);
        expect(Math.sign(d)).toBe(win ? 1 : -1);
      }
    }
    expect(applyResult(r, 1200, true).rating - r.rating).toBe(SWING.mid);
    // beating someone stronger is worth more than beating someone weaker
    expect(applyResult(r, 1400, true).rating).toBeGreaterThan(applyResult(r, 1000, true).rating);
  });

  test('matching: any division of the same tier; the next tier only after a minute; never two apart', () => {
    const bronze1 = 1040;
    const bronze3 = 905;
    const silver3 = 1060;
    const gold = 1220;
    expect(canMeet(bronze1, bronze3, 0)).toBe(true);
    expect(canMeet(bronze1, silver3, 0)).toBe(false);
    expect(canMeet(bronze1, silver3, WIDEN_MS)).toBe(true);
    expect(canMeet(bronze1, gold, WIDEN_MS * 10)).toBe(false);
  });

  test('master sits on top and has no division', () => {
    const v = viewOf({ ...newRank(NOV), rating: MASTER_AT + 50 });
    expect(v.tier).toBe(5);
    expect(rankName(v)).toBe('マスター');
    expect(emblemKey(v)).toBe('master');
  });

  test('a new month starts a new season a little lower, and last season is remembered', () => {
    expect(seasonKey(NOV)).toBe('2026-11');
    // late on the 30th in UTC is already December in Japan
    expect(seasonKey(Date.UTC(2026, 10, 30, 16))).toBe('2026-12');
    const r = { ...applyResult(newRank(NOV), 1000, true), rating: 1400 };
    const next = rollSeason(r, Date.UTC(2026, 11, 2));
    expect(next.season).toBe('2026-12');
    expect(next.rating).toBe(1400 - SEASON_DROP);
    expect(viewOf(next).tier).toBeLessThanOrEqual(viewOf(r).tier);
    expect(next.games).toBe(0);
    expect(next.last).toEqual({ season: '2026-11', tier: tierOf(1400) });
    expect(rollSeason(next, Date.UTC(2026, 11, 20))).toBe(next);
  });
});
