// ============================================================================
// ボスレイド: one giant boss a week (Monday to Sunday), fought in one battle:
// knock it out and you win. You can fight it as often as you like.
//   • the first try of the week is free; each one after costs RAID_TRY_GEMS
//   • each win this week pays more than the last (up to a cap)
//   • a win has a RAID_DROP chance of the boss's raid card (never in packs)
//   • a loss still pays coins for the damage done
// ============================================================================
import { BOSSES, RAID_DROP, raidCardOf } from '../engine/cards/bosses';
import type { MonsterCard } from '../engine/types';
import { weekKey } from './progress';

export const RAID_TRY_GEMS = 10;

export interface RaidSave {
  key: string;
  bossId: string;
  tries: number;
  wins: number;
  /** the most damage done in one battle */
  best: number;
  /** fewest of your turns to win (0 = not yet) */
  fastest: number;
}

/** what the n-th win of the week pays (n from 1) */
export function raidWinReward(n: number): { gems: number; coins: number } {
  return { gems: Math.min(150, 30 + 10 * (n - 1)), coins: Math.min(20000, 3000 + 1000 * (n - 1)) };
}
/** coins for a lost battle, by the damage it did */
export const raidLossCoins = (dealt: number) => Math.min(5000, Math.floor((dealt * 5) / 50) * 50);

/** this week's boss (by the viewer's calendar) */
export function currentBoss(key = weekKey()): MonsterCard {
  const monday = new Date(key.slice(1) + 'T00:00:00');
  const week = Math.floor(monday.getTime() / (7 * 86400000));
  return BOSSES[((week % BOSSES.length) + BOSSES.length) % BOSSES.length];
}

/** the raid as it stands this week (a fresh one when the week has moved on) */
export function raidNow(r: RaidSave | undefined): RaidSave {
  const key = weekKey();
  if (r && r.key === key && typeof (r as Partial<RaidSave>).wins === 'number') return r;
  return { key, bossId: currentBoss(key).id, tries: 0, wins: 0, best: 0, fastest: 0 };
}

export const raidCost = (r: RaidSave) => (r.tries === 0 ? 0 : RAID_TRY_GEMS);

/** roll for the raid card after a win */
export const rollRaidDrop = (bossId: string, rand = Math.random) => (rand() < RAID_DROP ? raidCardOf(bossId) : null);
