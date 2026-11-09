// ============================================================================
// Player progression & economy: level/EXP, login bonus, missions, battle
// rewards.
// Everything is computed locally from the save + the viewer's clock.
// ============================================================================
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
  onlineWins: number;
  exchanges: number;
  /** the longest win streak so far (kept with max, not added) */
  bestStreak: number;
}
export type StatKey = keyof Stats;

export const EMPTY_STATS: Stats = { battles: 0, wins: 0, hardWins: 0, perfectWins: 0, kos: 0, damage: 0, prizes: 0, evolves: 0, trainers: 0, packs: 0, premiumPacks: 0, onlineWins: 0, exchanges: 0, bestStreak: 0 };

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
  /** this week's 期間限定イベント (optional: older saves start it fresh) */
  event?: Period;
  achvClaimed: string[];
  /** 通常ミッション already claimed */
  normalClaimed: string[];
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
    event: { key: '', counters: {}, claimed: [] },
    achvClaimed: [],
    normalClaimed: [],
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
  if (p.event?.key !== w) p.event = { key: w, counters: {}, claimed: [] };
}

export function bump(p: Progress, add: Partial<Stats>) {
  ensurePeriods(p);
  for (const [k, v] of Object.entries(add) as [StatKey, number][]) {
    if (!v) continue;
    p.stats[k] = (p.stats[k] ?? 0) + v;
    p.daily.counters[k] = (p.daily.counters[k] ?? 0) + v;
    p.weekly.counters[k] = (p.weekly.counters[k] ?? 0) + v;
    p.event!.counters[k] = (p.event!.counters[k] ?? 0) + v;
  }
}

// ---------------------------------------------------------------------------
// Level / EXP
// ---------------------------------------------------------------------------
export const expToNext = (level: number) => 200 + (level - 1) * 100;

// ---------------------------------------------------------------------------
// Economy — one currency, ジェム. Everyday play (battles, missions, login,
//   level-ups, story, duplicates) pays gems at what coins paid before gems
//   existed; gems buy packs and looks (ワードローブ). コイン were abolished:
//   old saves move their coins into gems at the pre-gem value.
// ---------------------------------------------------------------------------
/** coins are gone: everything is paid in gems at the old coin values (scale 1) */
export const COIN_SCALE = 1;
/** what the coin scale was while coins existed (old saves convert at this) */
export const OLD_COIN_SCALE = 5;
/** coins a battle's base reward pays out (rivals and CPU levels list the base) */
export const coinsFor = (base: number) => base * COIN_SCALE;
/** level-ups pay only levelGems now (kept for old callers) */
export const levelReward = (_level: number) => 0;

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
export const LOGIN_REWARDS = [30, 30, 50, 50, 70, 70, 200];
/** (folded into LOGIN_REWARDS: one 7-day cycle pays 500 = one pack) */
export const LOGIN_GEMS = [0, 0, 0, 0, 0, 0, 0];

// ---------------------------------------------------------------------------
// Gems (ジェム) buy packs and looks. Gems are earned, never sold:
//   first clear of a rival / story episode, first win of the day, missions,
//   the login cycle and level-ups. Tune the numbers here.
// ---------------------------------------------------------------------------
export const GEM_FIRST_CLEAR: Record<Difficulty, number> = { easy: 150, normal: 200, hard: 300 };
export const GEM_DAILY_WIN = 30;
/** a won battle that can be played again pays a little: 5–30 by its base reward (ぷにぷにの通常ステージ) */
export const winGems = (base: number) => Math.min(30, Math.max(5, Math.round(base / 16)));
/** gems a mission pays (its old coin reward, plus any gems it carried) */
export const missionGems = (m: Mission) => m.reward + (m.gems ?? 0);
export const levelGems = (level: number) => (level % 5 === 0 ? 150 : 30);
/**
 * the first clear of a story episode: it grows along the chapter, and each
 * chapter's last episode pays the most (episode 1: 500 coins · 30 gems …
 * episode 11: 1,500 · 180; the finale 3,000 · 300, from 第二章 on 5,000 · 500)
 */
export function storyFirstClear(episode: number, last: boolean, part: number): { coins: number; gems: number } {
  if (last) return part <= 1 ? { coins: 0, gems: 1000 } : { coins: 0, gems: 1500 };
  return { coins: 0, gems: 100 + (episode - 1) * 50 };
}
/** 通常ミッション also carry a few gems (about 1 per 50 coins, in fives, 5–100) */
export const normalMissionGems = (coins: number) => Math.min(100, Math.max(5, Math.round(coins / 50 / 5) * 5));

// ---------------------------------------------------------------------------
// CPU対戦 (levels 1–9)
// ---------------------------------------------------------------------------
/** coins for a win, by level */
export const CPU_REWARD = [60, 80, 100, 130, 170, 220, 280, 360, 480];
/** gems for the first win at each level */
export const CPU_FIRST_GEMS = [60, 60, 100, 100, 150, 150, 200, 300, 500];
/** the difficulty tier a level counts as (rewards, missions) */
export const cpuTier = (level: number): Difficulty => (level <= 3 ? 'easy' : level <= 6 ? 'normal' : 'hard');
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
  /** gems and name of a first clear that is not a rival's (CPU対戦 levels) */
  firstClearGems?: number;
  firstClearLabel?: string;
  /** coins of that first clear, as paid (story episodes) */
  firstClearCoins?: number;
}

export interface RewardLine {
  label: string;
  coins: number;
  gems?: number;
}

/** a lost battle pays nothing */
export const LOSS_PART_MAX = 0;

/** coins a battle pays: a win 100–200 by difficulty, a loss 20 */
export const battleCoins = (win: boolean, level: Difficulty) => (win ? (level === 'hard' ? 200 : level === 'normal' ? 150 : 100) : 20);

export function battleReward(p: Progress, o: BattleOutcome): { lines: RewardLine[]; total: number; gems: number; exp: number } {
  // ぷにぷに準拠: a loss pays nothing; a win pays a little (more on the day's first),
  // and the big amounts come once (first clears) or from events and raids
  const lines: RewardLine[] = [];
  if (o.win) {
    lines.push({ label: '勝利報酬', coins: 0, gems: winGems(o.baseReward) });
    if (p.lastWinDay !== dayKey()) lines.push({ label: '本日の初勝利', coins: 0, gems: GEM_DAILY_WIN });
    if (o.firstClear) lines.push({ label: o.firstClearLabel ?? '初回クリアボーナス', coins: 0, gems: o.firstClearGems ?? GEM_FIRST_CLEAR[o.level] });
  }
  const mult = o.level === 'hard' ? 2 : o.level === 'normal' ? 1.5 : 1;
  const exp = o.win ? Math.round(100 * mult + o.prizesTaken * 5) : Math.round(25 * mult);
  // コイン: every finished battle pays some (a win more), for the 交換所
  lines.push({ label: 'コイン', coins: battleCoins(o.win, o.level), gems: 0 });
  return { lines, total: lines.reduce((n, l) => n + l.coins, 0), gems: lines.reduce((n, l) => n + (l.gems ?? 0), 0), exp };
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------
export interface Mission {
  id: string;
  label: string;
  stat: StatKey | 'level' | 'collection' | 'rivals' | 'story' | 'uniques' | 'stars' | 'decks' | 'eventTasks';
  target: number;
  /** coins */
  reward: number;
  /** gems (event tasks) */
  gems?: number;
}

const DAILY_POOL: Mission[] = [
  { id: 'd-battle3', label: 'バトルを3回する', stat: 'battles', target: 3, reward: 30 },
  { id: 'd-win1', label: 'バトルに1回勝利する', stat: 'wins', target: 1, reward: 30 },
  { id: 'd-win2', label: 'バトルに2回勝利する', stat: 'wins', target: 2, reward: 30 },
  { id: 'd-ko5', label: '相手のモンスターを5匹きぜつさせる', stat: 'kos', target: 5, reward: 30 },
  { id: 'd-dmg600', label: 'ワザで合計600ダメージを与える', stat: 'damage', target: 600, reward: 30 },
  { id: 'd-prize6', label: 'サイドを合計6枚とる', stat: 'prizes', target: 6, reward: 30 },
  { id: 'd-evolve3', label: 'モンスターを3回進化させる', stat: 'evolves', target: 3, reward: 30 },
  { id: 'd-trainer8', label: 'トレーナーズを8枚使う', stat: 'trainers', target: 8, reward: 30 },
  { id: 'd-pack2', label: 'パックを2回開ける', stat: 'packs', target: 2, reward: 30 },
];

const WEEKLY_POOL: Mission[] = [
  { id: 'w-win10', label: 'バトルに10回勝利する', stat: 'wins', target: 10, reward: 150 },
  { id: 'w-battle15', label: 'バトルを15回する', stat: 'battles', target: 15, reward: 150 },
  { id: 'w-ko30', label: '相手のモンスターを30匹きぜつさせる', stat: 'kos', target: 30, reward: 150 },
  { id: 'w-hard3', label: '「むずかしい」相手に3回勝利する', stat: 'hardWins', target: 3, reward: 150 },
  { id: 'w-dmg5000', label: 'ワザで合計5000ダメージを与える', stat: 'damage', target: 5000, reward: 150 },
  { id: 'w-pack10', label: 'パックを10回開ける', stat: 'packs', target: 10, reward: 150 },
  { id: 'w-perfect2', label: 'パーフェクト勝利を2回達成する', stat: 'perfectWins', target: 2, reward: 150 },
];

function tiered(id: string, label: (n: number) => string, stat: Mission['stat'], tiers: [number, number][]): Mission[] {
  return tiers.map(([target, reward]) => ({ id: `a-${id}-${target}`, label: label(target), stat, target, reward }));
}

export const ACHIEVEMENTS: Mission[] = [
  ...tiered('win', (n) => `バトルに通算${n}回勝利`, 'wins', [[1, 100], [10, 300], [50, 800], [100, 1500], [300, 3000]]),
  ...tiered('ko', (n) => `通算${n}匹きぜつさせる`, 'kos', [[10, 150], [100, 500], [500, 1500]]),
  ...tiered('pack', (n) => `パックを通算${n}回開ける`, 'packs', [[5, 150], [30, 500], [100, 1200]]),
  ...tiered('premium', (n) => `レアパックを通算${n}回開ける`, 'premiumPacks', [[1, 100], [10, 500], [50, 1500]]),
  ...tiered('lv', (n) => `プレイヤーレベル${n}に到達`, 'level', [[5, 300], [10, 600], [20, 1200], [30, 2000]]),
  ...tiered('col', (n) => `コレクション収集率${n}%`, 'collection', [[25, 300], [50, 700], [75, 1500], [100, 5000]]),
  ...tiered('rival', (n) => (n === 8 ? '8人の強敵をすべて撃破' : `強敵を${n}人撃破`), 'rivals', [[1, 150], [4, 400], [8, 1500]]),
  ...tiered('perfect', (n) => `パーフェクト勝利を通算${n}回`, 'perfectWins', [[1, 200], [10, 800]]),
];

// 通常ミッション: one-off goals, all shown at once
const n = (id: string, label: string, stat: Mission['stat'], target: number, reward: number): Mission => ({ id: `n-${id}-${target}`, label, stat, target, reward });
const many = (id: string, stat: Mission['stat'], label: (t: number) => string, tiers: [number, number][]) => tiers.map(([t, r]) => n(id, label(t), stat, t, r));

export const NORMAL_MISSIONS: Mission[] = [
  // はじめの一歩
  n('first', 'はじめてのバトルをする', 'battles', 1, 50),
  n('firstwin', 'はじめてバトルに勝つ', 'wins', 1, 50),
  n('firstpack', 'はじめてパックを開ける', 'packs', 1, 50),
  n('firstevo', 'はじめてモンスターを進化させる', 'evolves', 1, 50),
  n('firstko', 'はじめて相手のモンスターをきぜつさせる', 'kos', 1, 50),
  n('firsttr', 'はじめてトレーナーズを使う', 'trainers', 1, 30),
  n('firstdeck', 'デッキを2つ作る', 'decks', 2, 100),
  // ストーリー
  ...Array.from({ length: 12 }, (_, i) => n('story', `ストーリー第一章 第${i + 1}話をクリア`, 'story', i + 1, i === 11 ? 1500 : 100 + i * 30)),
  ...Array.from({ length: 12 }, (_, i) => n('story', `ストーリー第二章 第${i + 1}話をクリア`, 'story', i + 13, i === 11 ? 2000 : 200 + i * 30)),
  // バトル
  ...many('battle', 'battles', (t) => `バトルを通算${t}回する`, [[3, 60], [5, 80], [20, 150], [30, 200], [75, 400], [150, 700], [200, 900], [500, 2000]]),
  ...many('win', 'wins', (t) => `バトルに通算${t}回勝つ`, [[3, 80], [5, 100], [20, 200], [30, 300], [75, 600], [150, 1000], [200, 1400]]),
  ...many('hard', 'hardWins', (t) => `「むずかしい」相手に通算${t}回勝つ`, [[1, 150], [5, 300], [10, 500], [25, 900], [50, 1500]]),
  ...many('perfect', 'perfectWins', (t) => `パーフェクト勝利を通算${t}回`, [[3, 200], [5, 300], [20, 700], [30, 1000]]),
  ...many('streak', 'bestStreak', (t) => `${t}連勝する`, [[2, 100], [3, 150], [5, 300], [7, 500], [10, 1000]]),
  ...many('ko', 'kos', (t) => `通算${t}匹きぜつさせる`, [[5, 60], [30, 150], [50, 200], [200, 600], [300, 800], [1000, 2500]]),
  ...many('dmg', 'damage', (t) => `ワザで通算${t.toLocaleString()}ダメージを与える`, [[1000, 80], [3000, 150], [10000, 300], [30000, 700], [100000, 2000]]),
  ...many('prize', 'prizes', (t) => `サイドを通算${t}枚とる`, [[10, 100], [30, 200], [100, 500], [300, 1200]]),
  ...many('evo', 'evolves', (t) => `通算${t}回進化させる`, [[5, 60], [20, 150], [50, 300], [100, 500], [300, 1200]]),
  ...many('tr', 'trainers', (t) => `トレーナーズを通算${t}枚使う`, [[10, 60], [30, 120], [100, 300], [300, 700], [1000, 1800]]),
  // オンライン
  ...many('owin', 'onlineWins', (t) => `オンライン対戦で通算${t}回勝つ`, [[1, 100], [3, 150], [10, 400], [30, 900], [100, 2500]]),
  // 強敵
  ...many('rival', 'rivals', (t) => `強敵を${t}人撃破`, [[2, 120], [3, 150], [6, 300], [10, 500], [15, 800], [22, 2000]]),
  // パック・コレクション
  ...many('pack', 'packs', (t) => `パックを通算${t}回開ける`, [[3, 60], [10, 150], [20, 250], [50, 500], [200, 1500]]),
  ...many('prem', 'premiumPacks', (t) => `レアパックを通算${t}回開ける`, [[3, 150], [5, 250], [20, 700]]),
  ...many('uniq', 'uniques', (t) => `ちがうカードを${t}種類集める`, [[30, 100], [50, 150], [100, 300], [150, 450], [200, 600], [300, 1000], [400, 1600], [500, 2500]]),
  ...many('star', 'stars', (t) => `★4以上のカードを${t}種類集める`, [[1, 150], [3, 300], [8, 600], [20, 1200], [40, 2500]]),
  ...many('deck', 'decks', (t) => `デッキを${t}つ作る`, [[3, 120], [5, 250], [10, 500]]),
  ...many('lv', 'level', (t) => `プレイヤーレベル${t}に到達`, [[2, 60], [3, 80], [4, 100], [6, 150], [8, 200], [15, 500], [25, 900], [40, 1500], [50, 2500]]),
];

// everyday missions pay coins in the hundreds to thousands
for (const list of [DAILY_POOL, WEEKLY_POOL, ACHIEVEMENTS, NORMAL_MISSIONS]) for (const m of list) m.reward *= COIN_SCALE;

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
  story: number;
  uniques: number;
  stars: number;
  decks: number;
}

export type MissionPeriod = 'daily' | 'weekly' | 'achv' | 'normal' | 'event';

export function missionValue(p: Progress, m: Mission, period: MissionPeriod, ext: ExtCtx): number {
  if (m.stat === 'eventTasks') return (p.event?.claimed ?? []).filter((id) => id !== m.id).length;
  if (m.stat === 'level') return p.level;
  if (m.stat === 'collection') return Math.floor(ext.collectionPct);
  if (m.stat === 'rivals' || m.stat === 'story' || m.stat === 'uniques' || m.stat === 'stars' || m.stat === 'decks') return ext[m.stat];
  if (period === 'daily') return p.daily.counters[m.stat] ?? 0;
  if (period === 'weekly') return p.weekly.counters[m.stat] ?? 0;
  if (period === 'event') return p.event?.counters[m.stat] ?? 0;
  return p.stats[m.stat] ?? 0;
}

export function claimableCount(p: Progress, ext: ExtCtx): number {
  let n = canClaimLogin(p) ? 1 : 0;
  for (const m of dailyMissions(p)) if (!p.daily.claimed.includes(m.id) && missionValue(p, m, 'daily', ext) >= m.target) n++;
  for (const m of weeklyMissions(p)) if (!p.weekly.claimed.includes(m.id) && missionValue(p, m, 'weekly', ext) >= m.target) n++;
  for (const m of ACHIEVEMENTS) if (!p.achvClaimed.includes(m.id) && missionValue(p, m, 'achv', ext) >= m.target) n++;
  for (const m of NORMAL_MISSIONS) if (!(p.normalClaimed ?? []).includes(m.id) && missionValue(p, m, 'normal', ext) >= m.target) n++;
  const ev = currentEvent(p);
  if (p.event?.key === ev.key) for (const m of ev.tasks) if (!p.event.claimed.includes(m.id) && missionValue(p, m, 'event', ext) >= m.target) n++;
  return n;
}

// ---------------------------------------------------------------------------
// 期間限定イベント: one themed event a week (Monday to Sunday), rotating.
// Tasks pay gems: 50–250 each, the hard ones the most, and clearing every
// other task of the week adds a bonus.
// ---------------------------------------------------------------------------
export interface GameEvent {
  id: string;
  name: string;
  blurb: string;
  art: string;
  tasks: Mission[];
}
const ev = (id: string, label: string, stat: Mission['stat'], target: number, gems: number): Mission => ({ id: `e-${id}`, label, stat, target, reward: 0, gems });
const ALL_CLEAR = (n: number, gems: number) => ev('all', `このイベントのほかの課題を${n}つ達成する`, 'eventTasks', n, gems);

export const EVENTS: Omit<GameEvent, 'key'>[] = [
  {
    id: 'dawn',
    name: '十二枚の夜明け祭',
    blurb: '十二枚の伝説が始まった日を祝う一週間。たくさん戦って、たくさん勝とう。',
    art: 'story/p-summer',
    tasks: [
      ev('battle5', 'バトルを5回する', 'battles', 5, 50),
      ev('win3', 'バトルに3回勝つ', 'wins', 3, 80),
      ev('ko25', '相手のモンスターを25匹きぜつさせる', 'kos', 25, 100),
      ev('evo10', 'モンスターを10回進化させる', 'evolves', 10, 100),
      ev('hard3', '「むずかしい」相手に3回勝つ', 'hardWins', 3, 200),
      ALL_CLEAR(5, 300),
    ],
  },
  {
    id: 'ash',
    name: '灰の巡礼週間',
    blurb: '灰の道を歩く巡礼者たちに倣い、一戦ずつ確かに積み上げる週。',
    art: 'story/p-pilgrims',
    tasks: [
      ev('battle8', 'バトルを8回する', 'battles', 8, 60),
      ev('prize20', 'サイドを合計20枚とる', 'prizes', 20, 100),
      ev('tr30', 'トレーナーズを30枚使う', 'trainers', 30, 100),
      ev('pack5', 'パックを5回開ける', 'packs', 5, 80),
      ev('perfect2', 'パーフェクト勝利を2回達成する', 'perfectWins', 2, 250),
      ALL_CLEAR(5, 300),
    ],
  },
  {
    id: 'dragon',
    name: '竜骨の闘技会',
    blurb: '古竜の骨で組まれた闘技場に、腕自慢が集まる。大きなダメージで観客を沸かせよう。',
    art: 'story/p-mountains',
    tasks: [
      ev('win4', 'バトルに4回勝つ', 'wins', 4, 80),
      ev('dmg5000', 'ワザで合計5000ダメージを与える', 'damage', 5000, 120),
      ev('ko40', '相手のモンスターを40匹きぜつさせる', 'kos', 40, 150),
      ev('hard5', '「むずかしい」相手に5回勝つ', 'hardWins', 5, 250),
      ev('online2', 'オンライン対戦で2回勝つ', 'onlineWins', 2, 150),
      ALL_CLEAR(4, 300),
    ],
  },
  {
    id: 'stars',
    name: '星降る蒐集祭',
    blurb: '夜空から星が降る季節。カードを集め、デッキを磨く週。',
    art: 'story/p-lake-castle',
    tasks: [
      ev('pack6', 'パックを6回開ける', 'packs', 6, 80),
      ev('battle6', 'バトルを6回する', 'battles', 6, 50),
      ev('evo15', 'モンスターを15回進化させる', 'evolves', 15, 120),
      ev('win5', 'バトルに5回勝つ', 'wins', 5, 120),
      ev('perfect3', 'パーフェクト勝利を3回達成する', 'perfectWins', 3, 250),
      ALL_CLEAR(5, 300),
    ],
  },
];

/** the event running this week (by the viewer's calendar) */
export function currentEvent(p?: Progress): GameEvent & { key: string } {
  const key = p?.event?.key || weekKey();
  const monday = new Date(key.slice(1) + 'T00:00:00');
  const week = Math.floor(monday.getTime() / (7 * 86400000));
  const e = EVENTS[((week % EVENTS.length) + EVENTS.length) % EVENTS.length];
  return { ...e, key, tasks: e.tasks.map((t) => ({ ...t, id: `${t.id}-${e.id}` })) };
}
