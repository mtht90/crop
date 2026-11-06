import { describe, expect, it } from 'vitest';
import { lastDay, nextRaidSession, RAID_SESSIONS, raidSession } from '../raid';
import { card } from '../../engine/cards';

describe('レイドの開催日程', () => {
  it('sessions are random but the same for everyone: in order, no overlap, real bosses, never the same boss twice running', () => {
    for (let i = 0; i < RAID_SESSIONS.length; i++) {
      const s = RAID_SESSIONS[i];
      expect(card(s.boss).name, s.boss).toBeTruthy();
      expect(s.end > s.start).toBe(true);
      if (i) {
        expect(s.start > RAID_SESSIONS[i - 1].end).toBe(true);
        expect(s.boss).not.toBe(RAID_SESSIONS[i - 1].boss);
      }
    }
  });
  it('knows when a raid runs and when the next one is', () => {
    expect(raidSession(new Date('2026-11-05T12:00:00').getTime())?.boss).toBe('BOSS-emperor');
    expect(raidSession(new Date('2026-11-12T12:00:00').getTime())).toBeNull();
    const nx = nextRaidSession(new Date('2026-11-12T12:00:00').getTime())!;
    expect(nx.start > '2026-11-12').toBe(true);
    expect(lastDay(RAID_SESSIONS[0])).toBe('11/8');
  });
});
