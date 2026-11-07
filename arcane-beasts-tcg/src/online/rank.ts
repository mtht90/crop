// ============================================================================
// Ranked matches: a hidden rating (never shown) decides the tier the player
// sees — ブロンズ III … ダイヤ I, then マスター.
//   • the rating moves Elo-style (bigger swings for the first games)
//   • once a tier is reached you never fall out of it for the rest of the season
//   • seasons are calendar months (Japan time); a new season pulls everyone
//     halfway back toward the start
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

export const START_RATING = 1025;
/** the rating where bronze III ends and each division's width */
const BASE = 900;
const STEP = 50;
/** 5 tiers × 3 divisions below master */
const DIVS = 15;
export const MASTER_AT = BASE + STEP * DIVS; // 1650

export interface RankState {
  rating: number;
  /** the lowest rating allowed this season (the start of the best tier reached) */
  floor: number;
  season: string;
  games: number;
  wins: number;
  losses: number;
  /** the best tier index reached this season (for the season reward) */
  best: number;
  /** last season's final tier, kept until the next season starts */
  last?: { season: string; tier: number };
}

/** what the player sees: never the rating itself */
export interface RankView {
  /** 0 bronze … 5 master */
  tier: number;
  /** 3, 2, 1 (I is the top of a tier); 0 for master */
  div: number;
  /** how far through the division (0…1) */
  progress: number;
  season: string;
  games: number;
  wins: number;
  losses: number;
  /** last season's final tier (shown once for its reward) */
  last?: { season: string; tier: number };
}

/** "2026-11" in Japan time */
export function seasonKey(now = Date.now()) {
  const d = new Date(now + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** division index 0 (bronze III) … 14 (diamond I), 15 = master */
export function divIndex(rating: number) {
  if (rating >= MASTER_AT) return DIVS;
  return Math.max(0, Math.min(DIVS - 1, Math.floor((rating - BASE) / STEP)));
}

export function tierOf(rating: number) {
  return Math.floor(divIndex(rating) / 3);
}

/** the rating where a tier starts (bronze has no bottom) */
export function tierStart(tier: number) {
  return tier <= 0 ? 0 : tier >= 5 ? MASTER_AT : BASE + STEP * 3 * tier;
}

export function newRank(now = Date.now()): RankState {
  return { rating: START_RATING, floor: 0, season: seasonKey(now), games: 0, wins: 0, losses: 0, best: tierOf(START_RATING) };
}

/** carry a record into the current season (a new month pulls the rating halfway back) */
export function rollSeason(r: RankState, now = Date.now()): RankState {
  const season = seasonKey(now);
  if (r.season === season) return r;
  const final = tierOf(r.rating);
  const rating = Math.round(START_RATING + (r.rating - START_RATING) / 2);
  return { rating, floor: 0, season, games: 0, wins: 0, losses: 0, best: tierOf(rating), last: r.games > 0 ? { season: r.season, tier: final } : undefined };
}

/** how much a game moves the rating: big for the first games, then steadier */
const kFactor = (games: number) => (games < 10 ? 48 : games < 30 ? 32 : 24);

/** the record after a game against `opp` (rating) */
export function applyResult(r: RankState, opp: number, win: boolean): RankState {
  const expect = 1 / (1 + 10 ** ((opp - r.rating) / 400));
  let delta = Math.round(kFactor(r.games) * ((win ? 1 : 0) - expect));
  // a win always moves you up and a loss down, at least a little
  if (win) delta = Math.max(8, delta);
  else delta = Math.min(-6, delta);
  const rating = Math.max(r.floor, r.rating + delta);
  const tier = tierOf(rating);
  return {
    ...r,
    rating,
    floor: Math.max(r.floor, tierStart(tier)),
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
  return { tier, div: master ? 0 : 3 - (i % 3), progress, season: r.season, games: r.games, wins: r.wins, losses: r.losses, last: r.last };
}

const ROMAN = ['', 'I', 'II', 'III'];
export const rankName = (v: { tier: number; div: number }) => `${TIERS[v.tier].name}${v.div ? ` ${ROMAN[v.div]}` : ''}`;

/** the emblem picture: each division one step grander (1…12), master the grandest */
export function emblemKey(v: { tier: number; div: number } | null | undefined) {
  if (!v) return 'unranked';
  if (v.tier >= 5) return 'master';
  return `${TIERS[v.tier].id}-${3 - v.div}`;
}

/** a ranking step: 'up' (new tier), 'div-up', 'div-down', 'same' */
export function stepOf(a: RankView, b: RankView) {
  if (b.tier > a.tier) return 'tier-up';
  if (b.tier < a.tier) return 'tier-down';
  if (b.div < a.div) return 'div-up';
  if (b.div > a.div) return 'div-down';
  return 'same';
}

/** gems for last season's final tier */
export const SEASON_GEMS = [100, 200, 400, 700, 1100, 1600];

/** the matchmaking window: how far apart two ratings may be after waiting `ms` */
export const matchWindow = (ms: number) => (ms > 25_000 ? Infinity : 120 + ms / 40);
