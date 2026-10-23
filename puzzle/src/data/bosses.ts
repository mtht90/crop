import type { CharDef, Rarity } from './characters';
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

/** Floor enemies of the dungeon (Quaternius "Ultimate Monsters", CC0); art under assets/enemy. */
export const ENEMIES: BossDef[] = [
  ['alien', 'ツノスライム'], ['armabee', 'ハチボール'], ['bluedemon', 'あおオニ'], ['bunny', 'いじわるウサギ'],
  ['cactoro', 'サボテンくん'], ['demon', 'こあくま'], ['dino', 'トサカザウルス'], ['frog', 'まだらガエル'],
  ['ghost', 'おばけコウモリ'], ['greenblob', 'みどりモチ'], ['monkroose', 'ヤンチャザル'], ['mushnub', 'キノコまる'],
  ['mushroomking', 'キノコだいおう'], ['pinkblob', 'ピンクモチ'], ['squidle', 'イカトンボ'], ['wizard', 'とんがりボウシ'],
].map(([id, name]) => ({ id: `e_${id}`, name, bg: 1, color: 0xffffff }));

/** Share of the defeat line each floor holds: three floor enemies, then the boss. */
export const FLOOR_SHARE = [0.14, 0.18, 0.22, 0.46];

/** The three floor enemies of a level (always the same for a level). */
export function floorEnemies(lv: number): BossDef[] {
  return [0, 1, 2].map((i) => ENEMIES[(lv * 5 + i * 7) % ENEMIES.length]);
}

/** Damage one enemy hit does to the player (out of 1000 HP). */
export function enemyHit(lv: number, boss: boolean): number {
  return Math.round((boss ? 70 : 45) * (1 + Math.min(lv, 60) * 0.006));
}

/** Seconds between enemy hits. */
export function enemyAtkInterval(lv: number, boss: boolean): number {
  return Math.max(3.2, (boss ? 6 : 7) - Math.min(lv, 40) * 0.05);
}

/** Score needed to defeat the boss (討伐ライン). */
export function bossHp(lv: number): number {
  // tuned for a 90s round where fever stops the clock: steep up to Lv15, gentler after
  const steep = Math.min(lv, 15) - 1;
  const gentle = Math.max(0, lv - 15);
  return Math.round((120000 * Math.pow(1.24, steep) * Math.pow(1.15, gentle)) / 5000) * 5000;
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

/**
 * Stage rule from Lv.5 on: some stages only let in characters up to a rarity (the UR counts above SSR).
 * Lv.5, 9, 13, ... are R and below; Lv.7, 11, 15, ... are SR and below; Lv.10, 20, ... are N only.
 */
export function stageCap(lv: number): Rarity | null {
  if (lv < 5) return null;
  if (lv % 10 === 0) return 'N';
  if (lv % 4 === 1) return 'R';
  if (lv % 4 === 3) return 'SR';
  return null;
}

/** Whether a character may enter a stage with this cap. */
export function fitsCap(def: CharDef, cap: Rarity | null): boolean {
  if (!cap) return true;
  const order: Rarity[] = ['N', 'R', 'SR', 'SSR'];
  return !def.ur && order.indexOf(def.rarity) <= order.indexOf(cap);
}
