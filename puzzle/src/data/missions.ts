import { Save, type Stats } from '../core/Save';
import { CHARACTERS } from './characters';
import { FRAME_BY_ID, WALLPAPER_BY_ID } from './cosmetics';

export interface Reward {
  coins?: number;
  tickets?: number;
  /** Skill-up tickets (rare). */
  skillTickets?: number;
  wallpaper?: string;
  frame?: string;
}

export interface Mission {
  id: string;
  text: string;
  /** Which number is counted, and how much of it is needed. */
  stat: StatKey;
  goal: number;
  reward: Reward;
}

/** Counted per round (summed or maxed into the daily and lifetime stats). */
export type StatKey = keyof Stats | 'bossLv' | 'owned' | 'pulls' | 'best' | 'charLv';

// ------------------------------------------------------------------ daily
const DAILY_POOL: Mission[] = [
  { id: 'd_play', text: 'バトルを3回あそぶ', stat: 'plays', goal: 3, reward: { coins: 40 } },
  { id: 'd_pops', text: 'ぷにを300こ消す', stat: 'pops', goal: 300, reward: { coins: 50 } },
  { id: 'd_fever', text: 'フィーバーを3回する', stat: 'fevers', goal: 3, reward: { coins: 50 } },
  { id: 'd_skill', text: '必殺技を3回つかう', stat: 'skills', goal: 3, reward: { coins: 40 } },
  { id: 'd_bomb', text: 'ボムを5こつかう', stat: 'bombs', goal: 5, reward: { coins: 40 } },
  { id: 'd_chain7', text: '7こ以上つなぐのを10回', stat: 'chains7', goal: 10, reward: { coins: 50 } },
  { id: 'd_broken', text: 'ボスの妨害を15こ消す', stat: 'broken', goal: 15, reward: { coins: 50 } },
  { id: 'd_defeat', text: 'ボスを1回たおす', stat: 'defeats', goal: 1, reward: { coins: 60 } },
  { id: 'd_combo', text: '1回のバトルで30コンボ', stat: 'maxCombo', goal: 30, reward: { coins: 60 } },
];
export const DAILY_COUNT = 3;
/** Clearing every daily mission adds this. */
export const DAILY_BONUS: Reward = { tickets: 1 };

// ----------------------------------------------------------- achievements
export const ACHIEVEMENTS: Mission[] = [
  { id: 'a_lv3', text: 'ボスLv.3をたおす', stat: 'bossLv', goal: 4, reward: { frame: 'candy', coins: 100 } },
  { id: 'a_lv5', text: 'ボスLv.5をたおす', stat: 'bossLv', goal: 6, reward: { wallpaper: 'meadow', tickets: 2 } },
  { id: 'a_lv8', text: 'ボスLv.8をたおす', stat: 'bossLv', goal: 9, reward: { wallpaper: 'desert', coins: 500 } },
  { id: 'a_lv10', text: 'ボスLv.10をたおす', stat: 'bossLv', goal: 11, reward: { frame: 'stone', tickets: 3, skillTickets: 1 } },
  { id: 'a_lv15', text: 'ボスLv.15をたおす', stat: 'bossLv', goal: 16, reward: { wallpaper: 'grave', frame: 'bone' } },
  { id: 'a_lv20', text: 'ボスLv.20をたおす', stat: 'bossLv', goal: 21, reward: { wallpaper: 'treasure', tickets: 5, skillTickets: 2 } },
  { id: 'a_lv30', text: 'ボスLv.30をたおす', stat: 'bossLv', goal: 31, reward: { frame: 'rainbow', tickets: 10, skillTickets: 3 } },
  { id: 'a_pops1', text: 'ぷにをあわせて1,000こ消す', stat: 'pops', goal: 1000, reward: { coins: 200 } },
  { id: 'a_pops2', text: 'ぷにをあわせて5,000こ消す', stat: 'pops', goal: 5000, reward: { wallpaper: 'stone' } },
  { id: 'a_pops3', text: 'ぷにをあわせて20,000こ消す', stat: 'pops', goal: 20000, reward: { frame: 'royal', tickets: 2, skillTickets: 1 } },
  { id: 'a_pops4', text: 'ぷにをあわせて50,000こ消す', stat: 'pops', goal: 50000, reward: { coins: 3000 } },
  { id: 'a_chain15', text: '1回で15こつなぐ', stat: 'maxChain', goal: 15, reward: { wallpaper: 'wood' } },
  { id: 'a_chain25', text: '1回で25こつなぐ', stat: 'maxChain', goal: 25, reward: { frame: 'desert' } },
  { id: 'a_chain40', text: '1回で40こつなぐ', stat: 'maxChain', goal: 40, reward: { tickets: 3, skillTickets: 1 } },
  { id: 'a_score1', text: 'スコア30万点をとる', stat: 'best', goal: 300000, reward: { coins: 300 } },
  { id: 'a_score2', text: 'スコア100万点をとる', stat: 'best', goal: 1000000, reward: { wallpaper: 'cave' } },
  { id: 'a_score3', text: 'スコア300万点をとる', stat: 'best', goal: 3000000, reward: { frame: 'meadow', tickets: 3 } },
  { id: 'a_fever1', text: 'フィーバーをあわせて10回', stat: 'fevers', goal: 10, reward: { coins: 300 } },
  { id: 'a_fever2', text: 'フィーバーをあわせて50回', stat: 'fevers', goal: 50, reward: { tickets: 2, skillTickets: 1 } },
  { id: 'a_broken1', text: '妨害をあわせて50こ消す', stat: 'broken', goal: 50, reward: { coins: 300 } },
  { id: 'a_broken2', text: '妨害をあわせて300こ消す', stat: 'broken', goal: 300, reward: { tickets: 2 } },
  { id: 'a_skill', text: '必殺技をあわせて30回', stat: 'skills', goal: 30, reward: { coins: 300 } },
  { id: 'a_own5', text: 'キャラを5体あつめる', stat: 'owned', goal: 5, reward: { coins: 300 } },
  { id: 'a_own10', text: 'キャラを10体あつめる', stat: 'owned', goal: 10, reward: { tickets: 2 } },
  { id: 'a_own15', text: 'キャラを15体あつめる', stat: 'owned', goal: 15, reward: { coins: 1500 } },
  { id: 'a_ownAll', text: 'キャラをぜんぶあつめる', stat: 'owned', goal: CHARACTERS.length, reward: { frame: 'gold', tickets: 5 } },
  { id: 'a_clv10', text: 'キャラをLv.10にする', stat: 'charLv', goal: 10, reward: { coins: 300 } },
  { id: 'a_clv30', text: 'キャラをLv.30にする', stat: 'charLv', goal: 30, reward: { skillTickets: 1 } },
  { id: 'a_clv50', text: 'キャラをLv.50にする', stat: 'charLv', goal: 50, reward: { skillTickets: 2 } },
  { id: 'a_clv90', text: 'キャラをLv.90にする', stat: 'charLv', goal: 90, reward: { skillTickets: 3 } },
  { id: 'a_play10', text: 'バトルを10回あそぶ', stat: 'plays', goal: 10, reward: { coins: 200 } },
  { id: 'a_play50', text: 'バトルを50回あそぶ', stat: 'plays', goal: 50, reward: { tickets: 3 } },
  { id: 'a_pull10', text: 'ガチャを10回まわす', stat: 'pulls', goal: 10, reward: { coins: 300 } },
];

const ALL = Object.fromEntries([...DAILY_POOL, ...ACHIEVEMENTS].map((m) => [m.id, m])) as Record<string, Mission>;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Rolls today's daily missions when the date changes. */
export function ensureDaily(): void {
  const d = Save.data.daily;
  if (d.date === today() && d.ids.length) return;
  const pool = [...DAILY_POOL];
  const ids: string[] = [];
  while (ids.length < DAILY_COUNT && pool.length) ids.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
  Save.data.daily = { date: today(), ids, stats: {}, claimed: [], bonus: false };
  Save.write();
}

export function dailyMissions(): Mission[] {
  ensureDaily();
  return Save.data.daily.ids.map((id) => ALL[id]).filter(Boolean);
}

/** Current value of a mission's counter. */
export function progress(m: Mission, daily: boolean): number {
  const d = Save.data;
  if (daily) return (d.daily.stats as Record<string, number>)[m.stat] ?? 0;
  switch (m.stat) {
    case 'bossLv':
      return d.bossLv;
    case 'owned':
      return Object.keys(d.owned).length;
    case 'charLv':
      return Math.max(0, ...Object.values(d.owned).map((o) => o.lv));
    case 'pulls':
      return d.totalPulls;
    case 'best':
      return d.best;
    case 'plays':
      return d.plays;
    case 'defeats':
      return d.defeats;
    default:
      return (d.stats as Record<string, number>)[m.stat] ?? 0;
  }
}

export function isClaimed(m: Mission, daily: boolean): boolean {
  return daily ? Save.data.daily.claimed.includes(m.id) : Save.data.claimed.includes(m.id);
}

export function canClaim(m: Mission, daily: boolean): boolean {
  return !isClaimed(m, daily) && progress(m, daily) >= m.goal;
}

export function dailyBonusReady(): boolean {
  const list = dailyMissions();
  return !Save.data.daily.bonus && list.every((m) => isClaimed(m, true));
}

/** Anything waiting to be collected (home badge). */
export function claimableCount(): number {
  return dailyMissions().filter((m) => canClaim(m, true)).length + ACHIEVEMENTS.filter((m) => canClaim(m, false)).length + (dailyBonusReady() ? 1 : 0);
}

export function giveReward(r: Reward): string[] {
  const d = Save.data;
  const got: string[] = [];
  if (r.coins) {
    d.coins += r.coins;
    got.push(`${r.coins}コイン`);
  }
  if (r.tickets) {
    d.tickets += r.tickets;
    got.push(`ガチャチケット×${r.tickets}`);
  }
  if (r.skillTickets) {
    d.skillTickets += r.skillTickets;
    got.push(`スキルチケット×${r.skillTickets}`);
  }
  if (r.wallpaper && !d.look.wallpapers.includes(r.wallpaper)) {
    d.look.wallpapers.push(r.wallpaper);
    got.push(`かべがみ「${WALLPAPER_BY_ID[r.wallpaper]?.name}」`);
  }
  if (r.frame && !d.look.frames.includes(r.frame)) {
    d.look.frames.push(r.frame);
    got.push(`きせかえ「${FRAME_BY_ID[r.frame]?.name}」`);
  }
  return got;
}

export function claim(m: Mission, daily: boolean): string[] {
  if (!canClaim(m, daily)) return [];
  if (daily) Save.data.daily.claimed.push(m.id);
  else Save.data.claimed.push(m.id);
  const got = giveReward(m.reward);
  Save.write();
  return got;
}

export function claimDailyBonus(): string[] {
  if (!dailyBonusReady()) return [];
  Save.data.daily.bonus = true;
  const got = giveReward(DAILY_BONUS);
  Save.write();
  return got;
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`コイン${r.coins}`);
  if (r.tickets) parts.push(`チケット×${r.tickets}`);
  if (r.skillTickets) parts.push(`スキルチケット×${r.skillTickets}`);
  if (r.wallpaper) parts.push(`かべがみ「${WALLPAPER_BY_ID[r.wallpaper]?.name}」`);
  if (r.frame) parts.push(`きせかえ「${FRAME_BY_ID[r.frame]?.name}」`);
  return parts.join(' ＋ ');
}

/** How a cosmetic is unlocked (for locked tiles). */
export function unlockHint(kind: 'wallpaper' | 'frame', id: string): string {
  const m = ACHIEVEMENTS.find((a) => a.reward[kind] === id);
  return m ? m.text : '';
}

/** Adds a finished round to the daily and lifetime counters. */
export function recordRound(round: Stats): void {
  const d = Save.data;
  ensureDaily();
  const add = (into: Partial<Stats>) => {
    for (const [k, v] of Object.entries(round) as [keyof Stats, number][]) {
      if (k === 'maxChain' || k === 'maxCombo') into[k] = Math.max(into[k] ?? 0, v);
      else into[k] = (into[k] ?? 0) + v;
    }
  };
  add(d.daily.stats);
  add(d.stats);
}
