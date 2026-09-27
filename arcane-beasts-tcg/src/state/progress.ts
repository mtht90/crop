// ============================================================================
// Player progression & economy: level/EXP, login bonus, missions, battle
// rewards, and the irregular pick-up schedule for the premium pack.
// Everything is computed locally from the save + the viewer's clock.
// ============================================================================
import { ALL_CARDS } from '../engine/cards';
import type { CardDef } from '../engine/types';
import type { Difficulty } from '../engine/ai';

export interface Stats {
  battles: number;
  wins: number;
  hardWins: number;
  perfectWins: number;
  kos: number;
  damage: number;
  prizes: number;
  evolves: number;
  trainers: number;
  packs: number;
  premiumPacks: number;
}
export type StatKey = keyof Stats;

export const EMPTY_STATS: Stats = { battles: 0, wins: 0, hardWins: 0, perfectWins: 0, kos: 0, damage: 0, prizes: 0, evolves: 0, trainers: 0, packs: 0, premiumPacks: 0 };

export interface Period {
  key: string;
  counters: Partial<Stats>;
  claimed: string[];
}

export interface Progress {
  level: number;
  exp: number;
  streak: number;
  lastWinDay: string;
  stats: Stats;
  daily: Period;
  weekly: Period;
  achvClaimed: string[];
  loginCount: number;
  loginDay: string;
}

export function freshProgress(): Progress {
  return {
    level: 1,
    exp: 0,
    streak: 0,
    lastWinDay: '',
    stats: { ...EMPTY_STATS },
    daily: { key: '', counters: {}, claimed: [] },
    weekly: { key: '', counters: {}, claimed: [] },
    achvClaimed: [],
    loginCount: 0,
    loginDay: '',
  };
}

// ---------------------------------------------------------------------------
// Calendar helpers (viewer's local time)
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function weekKey(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); // Monday
  return `W${dayKey(m)}`;
}
export function msUntilTomorrow(d = new Date()) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return t.getTime() - d.getTime();
}
export function msUntilNextWeek(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7) + 7);
  return m.getTime() - d.getTime();
}
export function fmtRemain(ms: number) {
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}日${h % 24}時間`;
  return `${h}時間${Math.floor((ms % 3600000) / 60000)}分`;
}

function seeded(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roll daily/weekly periods over when the calendar moves on. Mutates. */
export function ensurePeriods(p: Progress) {
  const d = dayKey();
  const w = weekKey();
  if (p.daily.key !== d) p.daily = { key: d, counters: {}, claimed: [] };
  if (p.weekly.key !== w) p.weekly = { key: w, counters: {}, claimed: [] };
}

export function bump(p: Progress, add: Partial<Stats>) {
  ensurePeriods(p);
  for (const [k, v] of Object.entries(add) as [StatKey, number][]) {
    if (!v) continue;
    p.stats[k] = (p.stats[k] ?? 0) + v;
    p.daily.counters[k] = (p.daily.counters[k] ?? 0) + v;
    p.weekly.counters[k] = (p.weekly.counters[k] ?? 0) + v;
  }
}

// ---------------------------------------------------------------------------
// Level / EXP
// ---------------------------------------------------------------------------
export const expToNext = (level: number) => 200 + (level - 1) * 100;
export const levelReward = (level: number) => 100 + level * 25 + (level % 5 === 0 ? 300 : 0);

/** Adds EXP; returns the levels reached (each grants levelReward coins). */
export function addExp(p: Progress, amount: number): number[] {
  const ups: number[] = [];
  p.exp += amount;
  while (p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level++;
    ups.push(p.level);
  }
  return ups;
}

// ---------------------------------------------------------------------------
// Login bonus (7-day cycle; the cycle advances on each day you log in)
// ---------------------------------------------------------------------------
export const LOGIN_REWARDS = [60, 80, 100, 120, 150, 200, 450];
export const canClaimLogin = (p: Progress) => p.loginDay !== dayKey();
export const loginSlot = (p: Progress) => p.loginCount % 7;

// ---------------------------------------------------------------------------
// Battle rewards
// ---------------------------------------------------------------------------
export interface BattleOutcome {
  win: boolean;
  level: Difficulty;
  baseReward: number; // rival reward or free-battle base
  prizesTaken: number;
  prizesLost: number;
  firstClear: boolean;
}

export interface RewardLine {
  label: string;
  coins: number;
}

export function battleReward(p: Progress, o: BattleOutcome): { lines: RewardLine[]; total: number; exp: number } {
  const lines: RewardLine[] = [];
  if (o.win) {
    lines.push({ label: '勝利報酬', coins: o.baseReward });
    if (o.prizesTaken) lines.push({ label: `サイド獲得 ×${o.prizesTaken}`, coins: o.prizesTaken * 5 });
    if (o.prizesLost === 0) lines.push({ label: 'パーフェクト勝利', coins: Math.round(o.baseReward * 0.3) });
    if (p.streak >= 1) lines.push({ label: `${p.streak + 1}連勝ボーナス`, coins: Math.round(o.baseReward * Math.min(0.5, p.streak * 0.1)) });
    if (p.lastWinDay !== dayKey()) lines.push({ label: '本日の初勝利', coins: 100 });
    if (o.firstClear) lines.push({ label: '強敵 初撃破', coins: 200 });
  } else {
    lines.push({ label: '参加報酬', coins: Math.round(o.baseReward * 0.2) });
    if (o.prizesTaken) lines.push({ label: `サイド獲得 ×${o.prizesTaken}`, coins: o.prizesTaken * 5 });
  }
  const mult = o.level === 'hard' ? 2 : o.level === 'normal' ? 1.5 : 1;
  const exp = Math.round((o.win ? 100 : 40) * mult + o.prizesTaken * 5);
  return { lines, total: lines.reduce((n, l) => n + l.coins, 0), exp };
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------
export interface Mission {
  id: string;
  label: string;
  stat: StatKey | 'level' | 'collection' | 'rivals';
  target: number;
  reward: number;
}

const DAILY_POOL: Mission[] = [
  { id: 'd-battle3', label: 'バトルを3回する', stat: 'battles', target: 3, reward: 80 },
  { id: 'd-win1', label: 'バトルに1回勝利する', stat: 'wins', target: 1, reward: 80 },
  { id: 'd-win2', label: 'バトルに2回勝利する', stat: 'wins', target: 2, reward: 120 },
  { id: 'd-ko5', label: '相手のモンスターを5匹きぜつさせる', stat: 'kos', target: 5, reward: 90 },
  { id: 'd-dmg600', label: 'ワザで合計600ダメージを与える', stat: 'damage', target: 600, reward: 90 },
  { id: 'd-prize6', label: 'サイドを合計6枚とる', stat: 'prizes', target: 6, reward: 90 },
  { id: 'd-evolve3', label: 'モンスターを3回進化させる', stat: 'evolves', target: 3, reward: 70 },
  { id: 'd-trainer8', label: 'トレーナーズを8枚使う', stat: 'trainers', target: 8, reward: 70 },
  { id: 'd-pack2', label: 'パックを2回開ける', stat: 'packs', target: 2, reward: 60 },
];

const WEEKLY_POOL: Mission[] = [
  { id: 'w-win10', label: 'バトルに10回勝利する', stat: 'wins', target: 10, reward: 500 },
  { id: 'w-battle15', label: 'バトルを15回する', stat: 'battles', target: 15, reward: 400 },
  { id: 'w-ko30', label: '相手のモンスターを30匹きぜつさせる', stat: 'kos', target: 30, reward: 450 },
  { id: 'w-hard3', label: '「むずかしい」相手に3回勝利する', stat: 'hardWins', target: 3, reward: 500 },
  { id: 'w-dmg5000', label: 'ワザで合計5000ダメージを与える', stat: 'damage', target: 5000, reward: 450 },
  { id: 'w-pack10', label: 'パックを10回開ける', stat: 'packs', target: 10, reward: 350 },
  { id: 'w-perfect2', label: 'パーフェクト勝利を2回達成する', stat: 'perfectWins', target: 2, reward: 500 },
];

function tiered(id: string, label: (n: number) => string, stat: Mission['stat'], tiers: [number, number][]): Mission[] {
  return tiers.map(([target, reward]) => ({ id: `a-${id}-${target}`, label: label(target), stat, target, reward }));
}

export const ACHIEVEMENTS: Mission[] = [
  ...tiered('win', (n) => `バトルに通算${n}回勝利`, 'wins', [[1, 100], [10, 300], [50, 800], [100, 1500], [300, 3000]]),
  ...tiered('ko', (n) => `通算${n}匹きぜつさせる`, 'kos', [[10, 150], [100, 500], [500, 1500]]),
  ...tiered('pack', (n) => `パックを通算${n}回開ける`, 'packs', [[5, 150], [30, 500], [100, 1200]]),
  ...tiered('premium', (n) => `プレミアムパックを通算${n}回開ける`, 'premiumPacks', [[1, 100], [10, 500], [50, 1500]]),
  ...tiered('lv', (n) => `プレイヤーレベル${n}に到達`, 'level', [[5, 300], [10, 600], [20, 1200], [30, 2000]]),
  ...tiered('col', (n) => `コレクション収集率${n}%`, 'collection', [[25, 300], [50, 700], [75, 1500], [100, 5000]]),
  ...tiered('rival', (n) => (n === 8 ? '8人の強敵をすべて撃破' : `強敵を${n}人撃破`), 'rivals', [[1, 150], [4, 400], [8, 1500]]),
  ...tiered('perfect', (n) => `パーフェクト勝利を通算${n}回`, 'perfectWins', [[1, 200], [10, 800]]),
];

export function dailyMissions(p: Progress): Mission[] {
  const r = seeded(`daily-${p.daily.key || dayKey()}`);
  return [...DAILY_POOL].sort(() => r() - 0.5).slice(0, 3);
}
export function weeklyMissions(p: Progress): Mission[] {
  const r = seeded(`weekly-${p.weekly.key || weekKey()}`);
  return [...WEEKLY_POOL].sort(() => r() - 0.5).slice(0, 3);
}

export interface ExtCtx {
  collectionPct: number;
  rivals: number;
}

export function missionValue(p: Progress, m: Mission, period: 'daily' | 'weekly' | 'achv', ext: ExtCtx): number {
  if (m.stat === 'level') return p.level;
  if (m.stat === 'collection') return Math.floor(ext.collectionPct);
  if (m.stat === 'rivals') return ext.rivals;
  if (period === 'daily') return p.daily.counters[m.stat] ?? 0;
  if (period === 'weekly') return p.weekly.counters[m.stat] ?? 0;
  return p.stats[m.stat] ?? 0;
}

export function claimableCount(p: Progress, ext: ExtCtx): number {
  let n = canClaimLogin(p) ? 1 : 0;
  for (const m of dailyMissions(p)) if (!p.daily.claimed.includes(m.id) && missionValue(p, m, 'daily', ext) >= m.target) n++;
  for (const m of weeklyMissions(p)) if (!p.weekly.claimed.includes(m.id) && missionValue(p, m, 'weekly', ext) >= m.target) n++;
  for (const m of ACHIEVEMENTS) if (!p.achvClaimed.includes(m.id) && missionValue(p, m, 'achv', ext) >= m.target) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Irregular pick-up schedule for the premium pack
// ---------------------------------------------------------------------------
export interface Pickup {
  card: CardDef;
  start: Date;
  end: Date;
}

const PICKUP_POOL = ALL_CARDS.filter((c) => (c.rarity === 'SR' || c.rarity === 'UR') && c.kind === 'monster');
const ANCHOR = new Date(2026, 0, 1);

/** Pick-ups run for 2–4 days with irregular 1–5 day breaks in between. */
export function currentPickup(now = new Date()): Pickup | null {
  if (typeof location !== 'undefined' && /[?&]pickup/.test(location.search)) {
    return { card: PICKUP_POOL[0], start: new Date(now.getTime() - 86400000), end: new Date(now.getTime() + 2.4 * 86400000) };
  }
  const r = seeded('arcane-pickup');
  const day = 86400000;
  let t = ANCHOR.getTime();
  const limit = now.getTime() + 120 * day;
  let prev = -1;
  while (t < limit) {
    const gap = 1 + Math.floor(r() * 5);
    const dur = 2 + Math.floor(r() * 3);
    let pick = Math.floor(r() * PICKUP_POOL.length);
    if (pick === prev) pick = (pick + 1) % PICKUP_POOL.length;
    prev = pick;
    const start = new Date(t + gap * day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + dur * day);
    end.setHours(0, 0, 0, 0);
    if (now >= start && now < end) return { card: PICKUP_POOL[pick], start, end };
    if (start > now) return null;
    t = end.getTime();
  }
  return null;
}
