export interface BossDef {
  id: string;
  name: string;
  /** Fairy-Tale background set (1..4). */
  bg: number;
  /** Primary tint used by UI and effects. */
  color: number;
}

export const BOSS_POSES = ['idle', 'hit', 'cheer', 'death'] as const;
export type BossPose = (typeof BOSS_POSES)[number];

export const BOSSES: BossDef[] = [
  { id: 'skeleton_minion', name: 'ホネホネ', bg: 4, color: 0xf2e0c0 },
  { id: 'skeleton_rogue', name: 'ずきんホネ', bg: 1, color: 0xc0304a },
  { id: 'skeleton_mage', name: 'まどうホネ', bg: 2, color: 0x9a3a5a },
  { id: 'skeleton_warrior', name: 'ホネだいしょう', bg: 3, color: 0x8a96a8 },
];

export function bossForLevel(lv: number): BossDef {
  return BOSSES[(lv - 1) % BOSSES.length];
}

/** Score needed to defeat the boss (討伐ライン). */
export function bossHp(lv: number): number {
  // tuned for a 90s round where fever stops the clock: steep up to Lv15, gentler after
  const steep = Math.min(lv, 15) - 1;
  const gentle = Math.max(0, lv - 15);
  return Math.round((120000 * Math.pow(1.24, steep) * Math.pow(1.08, gentle)) / 5000) * 5000;
}

/** Seconds between obstruction attacks; 0 = boss does not attack. */
export function bossAttackInterval(lv: number): number {
  if (lv < 2) return 0;
  return Math.max(8, 15 - lv * 0.6);
}

export function bossAttackCount(lv: number): number {
  return Math.min(2 + Math.floor(lv / 2), 7);
}

export function bossAlias(id: string, pose: BossPose): string {
  return `boss:${id}:${pose}`;
}
