/**
 * リーグ戦（競馬の重賞のように「〇〇杯」と格付けがある）。
 * 6チームの総当たり（1チーム5試合）で、勝ち点（勝ち3・引き分け1）がいちばん多いチームが優勝。
 * 優勝すると次の杯に挑戦できる。
 */
import { LEAGUE_TEAMS, teamById, teamPower } from './teams';

export interface Cup {
  id: string;
  name: string;
  grade: 'G3' | 'G2' | 'G1';
  /** 相手の強さ（DIFFICULTIES の番号） */
  diff: number;
  innings: number;
  /** 出てくる相手の強さ（rank） */
  ranks: number[];
  /** 順位ごとの賞金（1位〜6位） */
  prize: number[];
  /** この杯を優勝すると挑戦できる */
  unlock: string | null;
  desc: string;
}

export const CUPS: Cup[] = [
  { id: 'akichi', name: '空き地ステークス', grade: 'G3', diff: 0, innings: 3, ranks: [1, 1, 2, 2, 3], prize: [500, 300, 200, 120, 80, 50], unlock: null, desc: '近所の空き地で開かれる、はじめての大会' },
  { id: 'ramune', name: 'ラムネカップ', grade: 'G3', diff: 0, innings: 3, ranks: [1, 2, 2, 3, 3], prize: [600, 350, 220, 140, 90, 60], unlock: 'akichi', desc: '夏祭りの名物大会。ラムネを賭けて戦う' },
  { id: 'cider', name: 'サイダー記念', grade: 'G2', diff: 1, innings: 3, ranks: [2, 3, 3, 4, 4], prize: [900, 500, 320, 200, 120, 80], unlock: 'ramune', desc: '強豪がそろう伝統の一戦' },
  { id: 'petbottle', name: 'ペットボトル賞典', grade: 'G2', diff: 1, innings: 4, ranks: [3, 3, 4, 4, 5], prize: [1200, 650, 400, 250, 150, 100], unlock: 'cider', desc: '地区の頂点を決める大会' },
  { id: 'grand', name: 'キャップ大賞典', grade: 'G1', diff: 2, innings: 4, ranks: [4, 4, 5, 5, 5], prize: [2500, 1200, 700, 400, 250, 150], unlock: 'petbottle', desc: 'キャップ野球の最高峰。最強のチームが集まる' },
];

export const cupById = (id: string) => CUPS.find((c) => c.id === id)!;

export interface GameResult {
  a: number; // チームの番号（teams の添字）
  b: number;
  ra: number;
  rb: number;
}

export interface LeagueState {
  cupId: string;
  /** 参加チームの id（0 番が自分） */
  teams: string[];
  /** 各節の対戦（チーム番号の組） */
  schedule: [number, number][][];
  round: number;
  results: GameResult[];
  done: boolean;
}

/** 杯が挑戦できるか（最初の杯か、前の杯を優勝済み） */
export function cupOpen(cup: Cup, won: Record<string, number>) {
  if (!cup.unlock) return true;
  return (won[cup.unlock] ?? 0) > 0;
}

/** 新しいリーグを始める：杯の強さに合う相手を5チーム選び、総当たりの日程を組む */
export function newLeague(cup: Cup, userTeamId: string): LeagueState {
  const pool = LEAGUE_TEAMS.filter((t) => t.id !== userTeamId);
  const picked: string[] = [];
  for (const r of cup.ranks) {
    const cands = pool.filter((t) => !picked.includes(t.id)).sort((x, y) => Math.abs(x.rank - r) - Math.abs(y.rank - r) || Math.random() - 0.5);
    picked.push(cands[0].id);
  }
  const teams = [userTeamId, ...picked];
  // 総当たり（円の方式）：6チーム → 5節 × 3試合
  const n = teams.length;
  const idx = teams.map((_, i) => i);
  const schedule: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const games: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = idx[i], b = idx[n - 1 - i];
      games.push(r % 2 ? [b, a] : [a, b]);
    }
    schedule.push(games);
    idx.splice(1, 0, idx.pop()!);
  }
  return { cupId: cup.id, teams, schedule, round: 0, results: [], done: false };
}

/** 自分の今節の対戦（自分が先攻か後攻か） */
export function userGame(l: LeagueState) {
  const g = l.schedule[l.round]?.find(([a, b]) => a === 0 || b === 0);
  if (!g) return null;
  const [away, home] = g;
  return { away, home, oppIndex: away === 0 ? home : away, user: (away === 0 ? 'away' : 'home') as 'away' | 'home' };
}

function poisson(mu: number) {
  const L = Math.exp(-mu);
  let k = 0, p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/** CPU 同士の試合は結果だけを決める（強さの差で点の入りやすさが変わる） */
function simulate(l: LeagueState, a: number, b: number, innings: number): GameResult {
  const ta = teamById(l.teams[a]), tb = teamById(l.teams[b]);
  const pa = teamPower(ta), pb = teamPower(tb);
  const base = 0.75 * innings;
  let ra = poisson(base * Math.pow(pa / pb, 2));
  let rb = poisson(base * Math.pow(pb / pa, 2));
  if (ra === rb && Math.random() < 0.6) (Math.random() < pa / (pa + pb) ? (ra += 1) : (rb += 1));
  return { a, b, ra, rb };
}

/** 自分の試合結果を記録し、同じ節の CPU 同士の試合を進める */
export function recordRound(l: LeagueState, userRuns: number, oppRuns: number) {
  const g = userGame(l);
  if (!g) return;
  const cup = cupById(l.cupId);
  l.results.push({ a: g.away, b: g.home, ra: g.user === 'away' ? userRuns : oppRuns, rb: g.user === 'home' ? userRuns : oppRuns });
  for (const [a, b] of l.schedule[l.round]) if (a !== 0 && b !== 0) l.results.push(simulate(l, a, b, cup.innings));
  l.round++;
  if (l.round >= l.schedule.length) l.done = true;
}

export interface Row {
  i: number;
  id: string;
  w: number;
  l: number;
  d: number;
  pts: number;
  rs: number;
  ra: number;
}

export function standings(l: LeagueState): Row[] {
  const rows: Row[] = l.teams.map((id, i) => ({ i, id, w: 0, l: 0, d: 0, pts: 0, rs: 0, ra: 0 }));
  for (const r of l.results) {
    const A = rows[r.a], B = rows[r.b];
    A.rs += r.ra; A.ra += r.rb; B.rs += r.rb; B.ra += r.ra;
    if (r.ra > r.rb) { A.w++; B.l++; }
    else if (r.ra < r.rb) { B.w++; A.l++; }
    else { A.d++; B.d++; }
  }
  for (const r of rows) r.pts = r.w * 3 + r.d;
  return rows.sort((x, y) => y.pts - x.pts || (y.rs - y.ra) - (x.rs - x.ra) || y.rs - x.rs || (x.i === 0 ? -1 : y.i === 0 ? 1 : 0));
}
