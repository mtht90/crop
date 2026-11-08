// ============================================================================
// Ranked matches: a hidden rating (never shown) decides the tier the player
// sees — ブロンズ I … ダイヤ III, then マスター.
//   • the rating moves Elo-style within that range
//   • each game moves it by a set range (12…28); there is no demotion protection
//   • seasons are calendar months (Japan time); a new season starts everyone
//     two divisions lower
// Shared by the server (which owns the rating) and the client (which only
// gets the RankView).
// ============================================================================

export const TIERS = [
  { id: 'bronze', name: 'ブロンズ', color: '#d08a5a' },
  { id: 'silver', name: 'シルバー', color: '#cfd8e6' },
  { id: 'gold', name: 'ゴールド', color: '#ffcf4a' },
  { id: 'platinum', name: 'プラチナ', color: '#8ff0e4' },
  { id: 'diamond', name: 'ダイヤ', color: '#6fa8ff' },
  { id: 'master', name: 'マスター', color: '#ff6b7a' },
] as const;

export const START_RATING = 1050;
/** where bronze I starts, and each division's width (a division is about 5 even wins) */
const BASE = 800;
export const STEP = 100;
/** 5 tiers × 3 divisions below master */
const DIVS = 15;
export const MASTER_AT = BASE + STEP * DIVS; // 2300

export interface RankState {
  rating: number;
  /** (no longer used: there is no demotion protection) */
  floor?: number;
  season: string;
  games: number;
  wins: number;
  losses: number;
  /** the best tier index reached this season (for the season reward) */
  best: number;
  /** last season's final tier, kept until the next season starts */
  last?: { season: string; tier: number };
  /** the placement match is done (a new player's first rank comes from it) */
  placed?: boolean;
}

/** what the player sees: never the rating itself */
export interface RankView {
  /** 0 bronze … 5 master */
  tier: number;
  /** 1, 2, 3 (III is the top of a tier); 0 for master */
  div: number;
  /** how far through the division (0…1) */
  progress: number;
  season: string;
  games: number;
  wins: number;
  losses: number;
  /** last season's final tier (shown once for its reward) */
  last?: { season: string; tier: number };
  /** false until the placement match is played */
  placed: boolean;
}

/** "2026-11" in Japan time */
export function seasonKey(now = Date.now()) {
  const d = new Date(now + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** division index 0 (bronze I) … 14 (diamond III), 15 = master */
export function divIndex(rating: number) {
  if (rating >= MASTER_AT) return DIVS;
  return Math.max(0, Math.min(DIVS - 1, Math.floor((rating - BASE) / STEP)));
}

export function tierOf(rating: number) {
  return Math.floor(divIndex(rating) / 3);
}

export function newRank(now = Date.now()): RankState {
  return { rating: START_RATING, season: seasonKey(now), games: 0, wins: 0, losses: 0, best: tierOf(START_RATING), placed: false };
}

/** a new month: everyone starts the season a little lower (two divisions down) */
export const SEASON_DROP = STEP * 2;
/** the bottom of the ladder (a little below bronze I's start) */
const LOWEST = BASE - STEP * 2;

/** carry a record into the current season */
export function rollSeason(r: RankState, now = Date.now()): RankState {
  const season = seasonKey(now);
  if (r.season === season) return r;
  const final = tierOf(r.rating);
  const rating = Math.max(Math.min(r.rating, BASE), r.rating - SEASON_DROP);
  return { rating, season, games: 0, wins: 0, losses: 0, best: tierOf(rating), last: r.games > 0 ? { season: r.season, tier: final } : undefined, placed: r.placed };
}

/** a game moves the rating by 12…28 (20 between equals; more for beating someone stronger) */
export const SWING = { min: 12, mid: 20, max: 28 };

/** the record after a game against `opp` (rating) */
export function applyResult(r: RankState, opp: number, win: boolean): RankState {
  const expect = 1 / (1 + 10 ** ((opp - r.rating) / 400));
  const size = Math.round(SWING.mid * 2 * (win ? 1 - expect : expect));
  const delta = (win ? 1 : -1) * Math.max(SWING.min, Math.min(SWING.max, size));
  const rating = Math.max(LOWEST, r.rating + delta);
  const tier = tierOf(rating);
  return {
    ...r,
    rating,
    games: r.games + 1,
    wins: r.wins + (win ? 1 : 0),
    losses: r.losses + (win ? 0 : 1),
    best: Math.max(r.best, tier),
  };
}

export function viewOf(r: RankState): RankView {
  const i = divIndex(r.rating);
  const tier = Math.floor(i / 3);
  const master = i >= DIVS;
  const lo = master ? MASTER_AT : BASE + STEP * i;
  const progress = master ? Math.min(1, (r.rating - MASTER_AT) / 300) : i === 0 && r.rating < BASE ? 0 : Math.max(0, Math.min(1, (r.rating - lo) / STEP));
  return { tier, div: master ? 0 : (i % 3) + 1, progress, season: r.season, games: r.games, wins: r.wins, losses: r.losses, last: r.last, placed: !!r.placed };
}

const ROMAN = ['', 'I', 'II', 'III'];
export const rankName = (v: { tier: number; div: number }) => `${TIERS[v.tier].name}${v.div ? ` ${ROMAN[v.div]}` : ''}`;

/** the emblem picture: each division one step grander (1…12), master the grandest */
export function emblemKey(v: { tier: number; div: number } | null | undefined) {
  if (!v) return 'unranked';
  if (v.tier >= 5) return 'master';
  return `${TIERS[v.tier].id}-${v.div - 1}`;
}

/** a ranking step: 'up' (new tier), 'div-up', 'div-down', 'same' */
export function stepOf(a: RankView, b: RankView) {
  if (b.tier > a.tier) return 'tier-up';
  if (b.tier < a.tier) return 'tier-down';
  if (b.div > a.div) return 'div-up';
  if (b.div < a.div) return 'div-down';
  return 'same';
}

/** gems for last season's final tier */
export const SEASON_GEMS = [100, 200, 400, 700, 1100, 1600];

/** after this long in the queue, the tiers just above and below are allowed too */
export const WIDEN_MS = 60_000;
/**
 * may two waiting players meet? Same tier (any of I/II/III): yes. One tier apart:
 * once either has waited a minute. Two or more apart: never.
 */
export function canMeet(ratingA: number, ratingB: number, waitedMs: number) {
  const d = Math.abs(tierOf(ratingA) - tierOf(ratingB));
  return d === 0 || (d === 1 && waitedMs >= WIDEN_MS);
}

// ---------------------------------------------------------------------------
// placement: one game against a bot decides where a new player starts.
// Bronze and silver are the usual places; gold I is as high as it goes.
// ---------------------------------------------------------------------------
export interface PlacementResult {
  win: boolean;
  /** prizes the player took / lost */
  prizes: number;
  prizesLost: number;
  /** the game's turn count (both players) */
  turns: number;
}

/** the starting rating (the middle of a division) */
export function placementRating(r: PlacementResult): number {
  const mid = (div: number) => BASE + STEP * div + STEP / 2;
  const prizes = Math.max(0, Math.min(6, Math.floor(r.prizes)));
  const lost = Math.max(0, Math.min(6, Math.floor(r.prizesLost)));
  if (!r.win) return mid(prizes >= 4 ? 2 : prizes >= 2 ? 1 : 0); // bronze III / II / I
  if (lost <= 1 && r.turns <= 16) return mid(6); // gold I: a clean, quick win
  return mid(lost <= 1 ? 5 : lost <= 3 ? 4 : 3); // silver III / II / I
}

/** the bot of the placement match: a CPU level a little above the middle */
export const PLACEMENT_CPU = 5;
