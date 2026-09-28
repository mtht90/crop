// ============================================================================
// ランクマッチ: 10級 → 1級 → 初段 → 十段 → 名人, monthly seasons
//
//   級   win +50, loss ±0 (no demotion)
//   段   win +35 (+5 per win streak, up to +15), loss −25; below 0 → demoted
//   名人 points keep counting (win +30, loss −20, never below 0)
// 100 points promote. Each rank pays a reward the first time it is reached in
// a season. A new season lowers 段 ranks by three (never below 初段).
// ============================================================================
import type { Difficulty } from '../engine/ai';
import type { Rarity } from '../engine/types';

const KANJI = ['初', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export const RANKS: string[] = [
  ...Array.from({ length: 10 }, (_, i) => `${10 - i}級`),
  ...KANJI.map((k) => `${k}段`),
  '名人',
];
export const DAN = 10; // index of 初段
export const MEIJIN = 20;
export const PROMOTE_AT = 100;

export type RankTier = 'bronze' | 'silver' | 'gold' | 'meijin';
export const rankTier = (r: number): RankTier => (r >= MEIJIN ? 'meijin' : r >= DAN ? 'gold' : r >= 5 ? 'silver' : 'bronze');

export interface RankState {
  season: string;
  rank: number;
  pts: number;
  best: number;
  wins: number;
  losses: number;
  streak: number;
  /** ranks whose reward has been paid this season */
  claimed: number[];
}

export const seasonKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const seasonLabel = (key: string) => {
  const [y, m] = key.split('-');
  return `${y}年${Number(m)}月シーズン`;
};
export function msUntilSeasonEnd(d = new Date()) {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return end.getTime() - d.getTime();
}

export const freshRank = (): RankState => ({ season: seasonKey(), rank: 0, pts: 0, best: 0, wins: 0, losses: 0, streak: 0, claimed: [] });

/** roll over to the current season; returns true if a new season started */
export function ensureSeason(r: RankState): boolean {
  const now = seasonKey();
  if (r.season === now) return false;
  r.season = now;
  if (r.rank >= DAN) r.rank = Math.max(DAN, r.rank - 3);
  r.pts = 0;
  r.best = r.rank;
  r.wins = r.losses = r.streak = 0;
  r.claimed = [];
  return true;
}

export interface RankReward {
  coins: number;
  shards?: Partial<Record<Rarity, number>>;
}
export function rankReward(rank: number): RankReward {
  if (rank >= MEIJIN) return { coins: 3000, shards: { CR: 10 } };
  if (rank >= DAN) return { coins: 400 + (rank - DAN) * 100, shards: rank % 3 === 0 ? { ST: 5 } : { RR: 5 } };
  return { coins: 100 + rank * 10 };
}

export interface RankChange {
  before: { rank: number; pts: number };
  after: { rank: number; pts: number };
  delta: number;
  promoted: number[]; // ranks newly reached
  demoted: boolean;
  rewards: { rank: number; reward: RankReward }[];
}

/** apply a ranked result (mutates r) */
export function applyRanked(r: RankState, win: boolean): RankChange {
  ensureSeason(r);
  const before = { rank: r.rank, pts: r.pts };
  let delta: number;
  if (win) {
    r.wins++;
    r.streak++;
    delta = r.rank >= MEIJIN ? 30 : r.rank >= DAN ? 35 + Math.min(3, r.streak - 1) * 5 : 50;
  } else {
    r.losses++;
    r.streak = 0;
    delta = r.rank >= MEIJIN ? -20 : r.rank >= DAN ? -25 : 0;
  }
  r.pts += delta;
  const promoted: number[] = [];
  let demoted = false;
  while (r.rank < MEIJIN && r.pts >= PROMOTE_AT) {
    r.pts -= PROMOTE_AT;
    r.rank++;
    promoted.push(r.rank);
  }
  if (r.rank >= MEIJIN) r.pts = Math.max(0, r.pts);
  if (r.pts < 0) {
    if (r.rank > DAN && r.rank < MEIJIN) {
      r.rank--;
      r.pts = 75;
      demoted = true;
    } else r.pts = 0;
  }
  r.best = Math.max(r.best, r.rank);
  const rewards: RankChange['rewards'] = [];
  for (const k of promoted) {
    if (r.claimed.includes(k)) continue;
    r.claimed.push(k);
    rewards.push({ rank: k, reward: rankReward(k) });
  }
  return { before, after: { rank: r.rank, pts: r.pts }, delta, promoted, demoted, rewards };
}

// ---------------------------------------------------------------------------
// Opponents
// ---------------------------------------------------------------------------
const NAMES = ['アレン', 'ミレイ', 'カイト', 'ソフィア', 'レオ', 'ユウナ', 'ガレス', 'リン', 'ハヤテ', 'エリス', 'ノア', 'シオン', 'ルカ', 'セレス', 'ジン', 'アイリ', 'ダリウス', 'ミナ', 'トウマ', 'フレイ'];
const PORTRAITS = [
  'humans/knight', 'humans/mage', 'humans/swordsman', 'humans/fencer', 'humans/ranger', 'humans/mage-light+female', 'humans/outlaw+female',
  'humans/bowman', 'humans/paladin', 'elves/ranger+female', 'elves/hero', 'elves/marksman+female', 'dwarves/lord', 'humans/duelist', 'merfolk/hunter',
];

export interface RankOpponent {
  name: string;
  portrait: string;
  rank: number;
  level: Difficulty;
  reward: number;
}

export function rankOpponent(rank: number, seed = Math.random()): RankOpponent {
  const pick = <T,>(a: T[], k: number) => a[Math.floor(((seed * 9301 + k * 49297) % 1) * a.length) % a.length];
  const offset = Math.round((seed - 0.5) * 2); // −1 … +1
  const oppRank = Math.max(0, Math.min(MEIJIN, rank + offset));
  return {
    name: pick(NAMES, 1),
    portrait: pick(PORTRAITS, 2),
    rank: oppRank,
    level: rank < 5 ? 'easy' : rank < DAN ? 'normal' : 'hard',
    reward: 90 + rank * 8,
  };
}
