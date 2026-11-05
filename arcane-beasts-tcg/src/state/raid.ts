// ============================================================================
// ボスレイド: one giant boss a week (Monday to Sunday). Damage carries over
// between tries, so a boss of 10,000–100,000 HP is worn down over the week.
//   • the first try of the week is free; each one after costs RAID_TRY_GEMS
//   • every battle pays coins for the damage it did
//   • 25 / 50 / 75 % of the boss's HP and the final blow pay gems and coins
// ============================================================================
import { BOSSES } from '../engine/cards/bosses';
import type { MonsterCard } from '../engine/types';
import { weekKey } from './progress';

export const RAID_TRY_GEMS = 10;

export interface RaidSave {
  key: string;
  bossId: string;
  /** damage the boss has taken this week */
  damage: number;
  tries: number;
  /** the most damage done in one battle */
  best: number;
  /** milestones already paid (25, 50, 75, 100) */
  paid: number[];
}

export const RAID_MILESTONES: { pct: number; gems: number; coins: number; label: string }[] = [
  { pct: 25, gems: 40, coins: 5000, label: 'HPを25%削った' },
  { pct: 50, gems: 60, coins: 10000, label: 'HPを半分削った' },
  { pct: 75, gems: 100, coins: 20000, label: 'HPを75%削った' },
  { pct: 100, gems: 300, coins: 50000, label: '討伐！' },
];

/** coins for the damage of one battle */
export const raidBattleCoins = (dealt: number) => Math.min(20000, Math.floor(dealt / 10 / 50) * 50);

/** this week's boss (by the viewer's calendar) */
export function currentBoss(key = weekKey()): MonsterCard {
  const monday = new Date(key.slice(1) + 'T00:00:00');
  const week = Math.floor(monday.getTime() / (7 * 86400000));
  return BOSSES[((week % BOSSES.length) + BOSSES.length) % BOSSES.length];
}

/** the raid as it stands this week (a fresh one when the week has moved on) */
export function raidNow(r: RaidSave | undefined): RaidSave {
  const key = weekKey();
  if (r && r.key === key) return r;
  return { key, bossId: currentBoss(key).id, damage: 0, tries: 0, best: 0, paid: [] };
}

export const raidCost = (r: RaidSave) => (r.tries === 0 ? 0 : RAID_TRY_GEMS);
