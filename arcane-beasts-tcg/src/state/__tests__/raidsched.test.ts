import { describe, expect, it } from 'vitest';
import { lastDay, nextRaidSession, RAID_SESSIONS, raidSession } from '../raid';
import { card } from '../../engine/cards';

describe('レイドの開催日程', () => {
  it('sessions are in order, do not overlap, and name real bosses', () => {
    for (let i = 0; i < RAID_SESSIONS.length; i++) {
      const s = RAID_SESSIONS[i];
      expect(card(s.boss).name, s.boss).toBeTruthy();
      expect(s.end > s.start).toBe(true);
      if (i) expect(s.start >= RAID_SESSIONS[i - 1].end).toBe(true);
    }
  });
  it('knows when a raid runs and when the next one is', () => {
    expect(raidSession(new Date('2026-11-05T12:00:00').getTime())?.boss).toBe('BOSS-emperor');
    expect(raidSession(new Date('2026-11-12T12:00:00').getTime())).toBeNull();
    expect(nextRaidSession(new Date('2026-11-12T12:00:00').getTime())?.start).toBe('2026-11-23');
    expect(lastDay(RAID_SESSIONS[1])).toBe('11/29');
  });
});
