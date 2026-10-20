import { Save } from './Save';
import { giveReward, type Reward } from '../data/missions';
import { botsFor, weekStartMs } from '../data/rankBots';

/**
 * Weekly online ranking on Supabase (REST, no SDK). Configure with the build-time env
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see supabase/ranking.sql and README).
 * The anon key is meant to be public; the database only accepts writes through submit_score().
 */
const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface RankRow {
  player_id: string;
  name: string;
  score: number;
  char_id: string | null;
}

export const Ranking = {
  get enabled(): boolean {
    return !!URL && !!KEY;
  },
  get registered(): boolean {
    return !!Save.data.rank.name;
  },
};

function headers(): Record<string, string> {
  return { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
}

/** Monday 00:00 JST of the week `offset` weeks back, as YYYY-MM-DD. */
export function weekKey(offset = 0, now = Date.now()): string {
  const jst = new Date(now + 9 * 3600_000);
  const dow = (jst.getUTCDay() + 6) % 7; // 0 = Monday
  jst.setUTCDate(jst.getUTCDate() - dow - offset * 7);
  return jst.toISOString().slice(0, 10);
}

export function weekLabel(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  const end = new Date(`${key}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${m}/${d}〜${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
}

export function playerId(): string {
  const r = Save.data.rank;
  if (!r.id) {
    r.id = crypto.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
    Save.write();
  }
  return r.id;
}

export function setName(name: string): string | null {
  const n = name.trim().slice(0, 12);
  if (!n) return 'ニックネームを入れてね';
  Save.data.rank.name = n;
  Save.write();
  return null;
}

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

/** Sends a round's score (keeps the week's best on the server). Never throws. */
export async function submitScore(score: number, charId: string): Promise<boolean> {
  const r = Save.data.rank;
  // remember the local weekly best even when offline
  const wk = weekKey();
  if (score > (r.best[wk] ?? 0)) {
    r.best = { [wk]: score };
    Save.write();
  }
  if (!Ranking.enabled || !Ranking.registered) return false;
  try {
    await rpc('submit_score', { p_player: playerId(), p_name: r.name, p_score: Math.round(score), p_char: charId });
    return true;
  } catch {
    return false;
  }
}

export async function topScores(week: string, limit = 100): Promise<RankRow[]> {
  if (!Ranking.enabled) return [];
  const q = `${URL}/rest/v1/weekly_scores?week=eq.${week}&select=player_id,name,score,char_id&order=score.desc&limit=${limit}`;
  const r = await fetch(q, { headers: headers() });
  if (!r.ok) throw new Error(`top: ${r.status}`);
  return (await r.json()) as RankRow[];
}

/** Players who have ever played (bots fill the board until there are enough). Cached per session. */
let playersCache: number | null = null;
export async function totalPlayers(): Promise<number> {
  if (playersCache !== null) return playersCache;
  try {
    playersCache = await rpc<number>('total_players', {});
  } catch {
    // older database without total_players(): count rows instead (close enough)
    const r = await fetch(`${URL}/rest/v1/weekly_scores?select=player_id`, { headers: { ...headers(), Prefer: 'count=exact', Range: '0-0' } });
    const range = r.headers.get('content-range') ?? '';
    playersCache = Number(range.split('/')[1]) || 0;
  }
  return playersCache;
}

/** The full board for a week: real players plus filler players, best first. */
export async function board(week: string, now = Date.now()): Promise<RankRow[]> {
  const [rows, players] = await Promise.all([topScores(week, 200), totalPlayers()]);
  const end = Math.min(now, weekStartMs(week) + 7 * 86400_000 - 1);
  return [...rows, ...botsFor(week, weekStartMs(week), players, end)].sort((a, z) => z.score - a.score);
}

/** Rank of `score` on a board (ties share a rank). */
export function rankIn(rows: RankRow[], score: number): number {
  return rows.filter((r) => r.score > score).length + 1;
}

export async function myRank(week: string): Promise<{ rank: number; total: number; score: number } | null> {
  if (!Ranking.enabled) return null;
  return rpc('my_rank', { p_player: playerId(), p_week: week });
}

/** Weekly reward tiers, best first: a tier applies within the top `top` places or the top `pct` of players. */
export const WEEKLY_TIERS: { label: string; top?: number; pct?: number; reward: Reward }[] = [
  { label: '1位', top: 1, reward: { tickets: 5, coins: 100000 } },
  { label: '2〜3位', top: 3, reward: { tickets: 3, coins: 50000 } },
  { label: '上位10%', pct: 0.1, reward: { tickets: 2, coins: 30000 } },
  { label: '上位30%', pct: 0.3, reward: { tickets: 1, coins: 20000 } },
  { label: '上位50%', pct: 0.5, reward: { coins: 10000 } },
  { label: 'さんか賞', reward: { coins: 5000 } },
];

/** Index into WEEKLY_TIERS for a placing. */
export function weeklyTier(rank: number, total: number): number {
  const pct = rank / Math.max(1, total);
  const i = WEEKLY_TIERS.findIndex((t) => (t.top !== undefined && rank <= t.top) || (t.pct !== undefined && pct <= t.pct));
  return i < 0 ? WEEKLY_TIERS.length - 1 : i;
}

/** Rewards for last week's placing (top N or top %). */
export function weeklyReward(rank: number, total: number): Reward {
  return WEEKLY_TIERS[weeklyTier(rank, total)].reward;
}

/** Once per week: looks up last week's rank and pays the reward. */
export async function claimWeekly(): Promise<{ rank: number; total: number; got: string[] } | null> {
  if (!Ranking.enabled || !Ranking.registered) return null;
  const last = weekKey(1);
  const r = Save.data.rank;
  if (r.claimed.includes(last)) return null;
  try {
    const res = await myRank(last);
    r.claimed = [...r.claimed, last].slice(-12);
    if (!res) {
      Save.write();
      return null;
    }
    // rank on the board as players saw it (including filler players)
    const rows = await board(last);
    const rank = rankIn(rows.filter((x) => x.player_id !== playerId()), res.score);
    const got = giveReward(weeklyReward(rank, rows.length));
    Save.write();
    return { rank, total: rows.length, got };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ life gifts
/** One life per player per hour, like Tsum Tsum hearts. */
export const GIFT_COOLDOWN = 60 * 60 * 1000;

/** Milliseconds until `playerId` can get another life from us (0 = now). */
export function giftWait(to: string, now = Date.now()): number {
  const at = Save.data.rank.sent[to] ?? 0;
  return Math.max(0, at + GIFT_COOLDOWN - now);
}

/** Sends a life. Returns null when sent, otherwise a message to show. */
export async function sendLife(to: string): Promise<string | null> {
  const r = Save.data.rank;
  if (!Ranking.registered) return 'なまえをとうろくしてね';
  if (giftWait(to) > 0) return 'もうすこし待ってね';
  // filler players can't receive anything, but sending looks the same
  if (!to.startsWith('bot-')) {
    if (!Ranking.enabled) return 'つうしんできません';
    try {
      const res = await rpc<string>('send_life', { p_from: playerId(), p_to: to });
      if (res === 'limit') return '今はこれ以上おくれません';
      if (res === 'full') return 'あいてのプレゼントがいっぱいです';
      if (res !== 'ok' && res !== 'wait') return 'おくれませんでした';
    } catch {
      return 'つうしんできませんでした';
    }
  }
  const now = Date.now();
  // forget cooldowns that are long over
  r.sent = Object.fromEntries(Object.entries(r.sent).filter(([, t]) => now - t < GIFT_COOLDOWN));
  r.sent[to] = now;
  Save.write();
  return null;
}

/** Unopened lives in the present box. */
export async function giftCount(): Promise<number> {
  if (!Ranking.enabled || !Ranking.registered) return 0;
  try {
    return await rpc<number>('gift_count', { p_player: playerId() });
  } catch {
    return 0;
  }
}

/** Opens the present box: adds the lives and returns who sent them. */
export async function claimLives(): Promise<string[]> {
  if (!Ranking.enabled || !Ranking.registered) return [];
  try {
    const rows = await rpc<{ from_name: string }[]>('claim_lives', { p_player: playerId() });
    if (rows.length) {
      Save.data.lives += rows.length;
      Save.write();
    }
    return rows.map((x) => x.from_name);
  } catch {
    return [];
  }
}
