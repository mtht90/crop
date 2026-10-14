// 「よく戻るページ」を見つけるためのスコア計算とティア分け (Electron に依存しない純粋な関数)
import type { Tier } from '../shared/types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** スコアの半減期。古い行動ほど影響が小さくなる */
export const HALF_LIFE_MS = 3 * DAY;

/** 行動ごとの加点 */
export const WEIGHTS = {
  /** ページを開いた */
  visit: 1,
  /** 別のタブ・ページから戻ってきた (このブラウザで一番重視する行動) */
  return: 2.5,
};

/** タブに戻ったとみなすまでに、そのタブを離れていた最短時間 */
export const RETURN_MIN_AWAY_MS = 2000;
/** 同じページを再び開いたとき「戻ってきた」とみなすまでの間隔 */
export const REVISIT_GAP_MS = 10 * MINUTE;

export interface Score {
  value: number;
  at: number;
}

export function decay(score: Score | undefined, now: number): number {
  if (!score) return 0;
  const elapsed = Math.max(0, now - score.at);
  return score.value * Math.pow(0.5, elapsed / HALF_LIFE_MS);
}

export function bump(score: Score | undefined, amount: number, now: number): Score {
  return { value: decay(score, now) + amount, at: now };
}

/** ページの同一性を判定するキー (フラグメントを除いた URL)。対象外なら null */
export function pageKey(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!['http:', 'https:', 'file:'].includes(u.protocol)) return null;
  u.hash = '';
  let key = u.toString();
  if (key.endsWith('/') && u.pathname !== '/') key = key.slice(0, -1);
  return key;
}

// ----------------------------------------------------------------------
// ティア分け
// ----------------------------------------------------------------------

export interface TierInput {
  id: number;
  score: number;
  pinned: boolean;
  active: boolean;
  /** タブを開いた時刻 */
  openedAt: number;
  /** 直前のティア (ヒステリシスのため) */
  prevTier: Tier | null;
}

export interface TierOptions {
  /** この値以上で hero に昇格 */
  heroEnter: number;
  /** hero はこの値を下回ると降格 */
  heroExit: number;
  /** この値未満で compact (あまり見ないページ) に */
  compactEnter: number;
  /** compact はこの値以上で通常に戻る */
  compactExit: number;
  /** タブがこの数未満なら、まとめる必要はない */
  compactMinTabs: number;
  /** 開いてからこの時間は compact にしない */
  compactGraceMs: number;
  /** hero にできるタブの割合と最大数 */
  heroRatio: number;
  maxHero: number;
}

export const DEFAULT_TIER_OPTIONS: TierOptions = {
  heroEnter: 6,
  heroExit: 4.5,
  compactEnter: 1.5,
  compactExit: 2.5,
  compactMinTabs: 5,
  compactGraceMs: 3 * MINUTE,
  heroRatio: 1 / 3,
  maxHero: 4,
};

/**
 * 開いているタブを hero / regular / compact に分ける。
 * 境界付近で行ったり来たりしないよう、昇格と降格のしきい値をずらしている。
 */
export function assignTiers(
  tabs: TierInput[],
  now: number,
  opts: TierOptions = DEFAULT_TIER_OPTIONS,
): Map<number, Tier> {
  const result = new Map<number, Tier>();
  const n = tabs.length;

  const pinned = tabs.filter((t) => t.pinned);
  pinned.forEach((t) => result.set(t.id, 'hero'));

  const heroCap = Math.max(0, Math.max(1, Math.min(opts.maxHero, Math.floor(n * opts.heroRatio))) - pinned.length);
  const heroes = tabs
    .filter((t) => !t.pinned && t.score >= (t.prevTier === 'hero' ? opts.heroExit : opts.heroEnter))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, heroCap);
  heroes.forEach((t) => result.set(t.id, 'hero'));

  for (const t of tabs) {
    if (result.has(t.id)) continue;
    const threshold = t.prevTier === 'compact' ? opts.compactExit : opts.compactEnter;
    const compact =
      n >= opts.compactMinTabs &&
      !t.active &&
      now - t.openedAt >= opts.compactGraceMs &&
      t.score < threshold;
    result.set(t.id, compact ? 'compact' : 'regular');
  }
  return result;
}
