// ============================================================================
// ボスレイド: one giant boss a week (Monday to Sunday). Its HP carries over
// from battle to battle: whatever you knock off stays off. Bring it to 0 and
// that lap is cleared; it rises again, tougher, for the next lap.
//   • the first try of the week is free; each one after costs RAID_TRY_GEMS
//   • a cleared lap pays well (more than the tries it took)
//   • every battle pays a little for the damage it did
//   • a cleared lap has a RAID_DROP chance of the boss's raid card
// Sized so that a player who keeps at it clears about two laps a week.
// ============================================================================
import { BOSSES, RAID_DROP, raidCardOf } from '../engine/cards/bosses';
import type { MonsterCard } from '../engine/types';

export const RAID_TRY_GEMS = 50;

export interface RaidSave {
  key: string;
  bossId: string;
  tries: number;
  /** laps cleared this week */
  laps: number;
  /** damage on the boss in the current lap */
  damage: number;
  /** the most damage done in one battle */
  best: number;
}

/** the boss's HP on lap n (from 1) */
export const raidLapHp = (lap: number) => (lap <= 1 ? 1500 : 2200);
/** extra damage on each boss attack on lap n */
export const raidLapBonus = (lap: number) => (lap <= 1 ? 0 : 10);
/** what clearing lap n pays */
export const raidLapReward = (lap: number) => (lap <= 1 ? 30000 : lap === 2 ? 50000 : 25000);
/** gems for any battle, by the damage it did (never more than a try costs) */
export const raidBattleGems = (_dealt: number) => 0; // the boss keeps the damage; gems come when it falls

// ---------------------------------------------------------------------------
// When raids run: at random. The calendar is drawn from a fixed seed, so every
// player sees the same sessions without a server: after each session comes a
// random gap (6–20 days), then a session of random length (3–8 days) with a
// boss picked at random (never the same one twice in a row).
// ---------------------------------------------------------------------------
export interface RaidSession {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (the first day it is over)
  boss: string;
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function drawSessions(): RaidSession[] {
  let seed = 0x5eed1234;
  const rnd = () => {
    // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // the first one is the session already running when raids went random
  const out: RaidSession[] = [{ start: '2026-11-02', end: '2026-11-09', boss: 'BOSS-emperor' }];
  let day = new Date(2026, 10, 9);
  let last = 'BOSS-emperor';
  while (out.length < 120) {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 6 + Math.floor(rnd() * 15));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 3 + Math.floor(rnd() * 6));
    const pool = BOSSES.filter((b) => b.id !== last);
    const boss = pool[Math.floor(rnd() * pool.length)].id;
    out.push({ start: ymd(start), end: ymd(end), boss });
    last = boss;
    day = end;
  }
  return out;
}
export const RAID_SESSIONS: RaidSession[] = drawSessions();
const at = (d: string) => new Date(d + 'T00:00:00').getTime();
/** the session running now, or null */
export function raidSession(now = Date.now()): RaidSession | null {
  return RAID_SESSIONS.find((x) => now >= at(x.start) && now < at(x.end)) ?? null;
}
/** the next session to come (null: none announced) */
export function nextRaidSession(now = Date.now()): RaidSession | null {
  return RAID_SESSIONS.filter((x) => at(x.start) > now).sort((a, b) => at(a.start) - at(b.start))[0] ?? null;
}
/** ms until the running session ends */
export const raidEndsIn = (now = Date.now()) => {
  const s = raidSession(now);
  return s ? at(s.end) - now : 0;
};
/** "11/23" */
export const fmtDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
/** the session's last day, "11/29" (its end is the first day it is over) */
export function lastDay(s: RaidSession) {
  const d = new Date(at(s.end) - 12 * 3600000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** the boss of the running session (or of the next one, when none runs) */
export function currentBoss(): MonsterCard {
  const s = raidSession() ?? nextRaidSession() ?? RAID_SESSIONS[RAID_SESSIONS.length - 1];
  return BOSSES.find((b) => b.id === s.boss) ?? BOSSES[0];
}

/** the raid as it stands in this session (a fresh one when a new session has begun) */
export function raidNow(r: RaidSave | undefined): RaidSave {
  const s = raidSession() ?? nextRaidSession();
  // older saves used the Monday of the week as the key: the same thing for a session starting on it
  const key = s ? `W${s.start}` : 'none';
  const bossId = currentBoss().id;
  if (r && r.key === key && r.bossId === bossId && typeof (r as Partial<RaidSave>).laps === 'number') return r;
  // an older save from this session keeps its tries (so the free one is not given twice)
  const tries = r && r.key === key ? r.tries : 0;
  return { key, bossId, tries, laps: 0, damage: 0, best: 0 };
}

export const raidCost = (r: RaidSave) => (r.tries === 0 ? 0 : RAID_TRY_GEMS);

/** roll for the raid card after a cleared lap */
export const rollRaidDrop = (bossId: string, rand = Math.random) => (rand() < RAID_DROP ? raidCardOf(bossId) : null);
