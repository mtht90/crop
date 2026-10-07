import { DIFFICULTIES, type Difficulty } from '../ai/cpu';
import { roster } from '../characters';
import { STAGE_IDS } from '../render/stages';
import type { PlayerProfile } from './protocol';

/** Local player's online record (kept in the browser). */
export interface OnlineRecord {
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

const KEY = 'star-arena-online';

export function loadRecord(): OnlineRecord {
  const d: OnlineRecord = { name: 'プレイヤー', rating: 1000, wins: 0, losses: 0 };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return d;
  }
}

export function saveRecord(r: OnlineRecord) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* storage unavailable */
  }
}

/** Elo change for the local player (K = 32). */
export function ratingDelta(mine: number, theirs: number, won: boolean) {
  const expected = 1 / (1 + 10 ** ((theirs - mine) / 400));
  return Math.round(32 * ((won ? 1 : 0) - expected));
}

const NAMES = ['たこやき', 'Kaze', 'ShadowFox', 'みかん大使', 'NeoBlade', 'ぽてと', 'Ryu_99', 'さくら餅', 'Tsubasa', 'Mochi', 'night_owl', 'ゆず', 'こたつ', 'Hayate', 'ぴよ吉', 'Blitz', 'おにぎり', 'Raiden', 'もふもふ', 'Zero'];
const REGIONS = ['日本(東京)', '日本(大阪)', '日本(福岡)', '韓国', '台湾'];

/** The CPU level that plays like someone at this rating. */
export function levelForRating(r: number): Difficulty {
  const i = r < 850 ? 0 : r < 1000 ? 1 : r < 1150 ? 2 : r < 1300 ? 3 : 4;
  return DIFFICULTIES[i];
}

/** Matchmaking stand-in: an opponent near the player's rating. */
export function findOpponent(rating: number): PlayerProfile {
  return {
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    rating: Math.max(600, Math.round(rating + (Math.random() - 0.5) * 240)),
    character: roster[Math.floor(Math.random() * roster.length)].id,
    region: REGIONS[Math.floor(Math.random() * REGIONS.length)],
  };
}

export function randomStage() {
  return STAGE_IDS[Math.floor(Math.random() * STAGE_IDS.length)];
}

/** Signal bars for a round-trip time. */
export function pingBars(ms: number) {
  const n = ms < 60 ? 4 : ms < 100 ? 3 : ms < 160 ? 2 : 1;
  return '▮'.repeat(n) + '▯'.repeat(4 - n);
}
