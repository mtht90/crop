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
import { weekKey } from './progress';

export const RAID_TRY_GEMS = 10;

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
export const raidLapReward = (lap: number) => (lap <= 1 ? 300 : lap === 2 ? 500 : 200);
/** gems for any battle, by the damage it did (never more than a try costs) */
export const raidBattleGems = (dealt: number) => Math.min(RAID_TRY_GEMS, Math.floor(dealt / 100));

/** this week's boss (by the viewer's calendar) */
export function currentBoss(key = weekKey()): MonsterCard {
  const monday = new Date(key.slice(1) + 'T00:00:00');
  const week = Math.floor(monday.getTime() / (7 * 86400000));
  return BOSSES[((week % BOSSES.length) + BOSSES.length) % BOSSES.length];
}

/** the raid as it stands this week (a fresh one when the week has moved on) */
export function raidNow(r: RaidSave | undefined): RaidSave {
  const key = weekKey();
  const bossId = currentBoss(key).id;
  if (r && r.key === key && r.bossId === bossId && typeof (r as Partial<RaidSave>).laps === 'number') return r;
  // an older save from this week keeps its tries (so the free one is not given twice)
  const tries = r && r.key === key ? r.tries : 0;
  return { key, bossId, tries, laps: 0, damage: 0, best: 0 };
}

export const raidCost = (r: RaidSave) => (r.tries === 0 ? 0 : RAID_TRY_GEMS);

/** roll for the raid card after a cleared lap */
export const rollRaidDrop = (bossId: string, rand = Math.random) => (rand() < RAID_DROP ? raidCardOf(bossId) : null);
