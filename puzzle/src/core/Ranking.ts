import { Save } from './Save';
import { giveReward, type Reward } from '../data/missions';

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

export async function myRank(week: string): Promise<{ rank: number; total: number; score: number } | null> {
  if (!Ranking.enabled) return null;
  return rpc('my_rank', { p_player: playerId(), p_week: week });
}

/** Rewards for last week's placing (top N or top %). */
export function weeklyReward(rank: number, total: number): Reward {
  const pct = rank / Math.max(1, total);
  if (rank === 1) return { tickets: 5, coins: 100000 };
  if (rank <= 3) return { tickets: 3, coins: 50000 };
  if (pct <= 0.1) return { tickets: 2, coins: 30000 };
  if (pct <= 0.3) return { tickets: 1, coins: 20000 };
  if (pct <= 0.5) return { coins: 10000 };
  return { coins: 5000 };
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
    const got = giveReward(weeklyReward(res.rank, res.total));
    Save.write();
    return { rank: res.rank, total: res.total, got };
  } catch {
    return null;
  }
}
