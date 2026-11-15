/**
 * ソシャゲ部分のルールと計算（純粋な関数のみ。ブラウザでもサーバーでも同じ結果になる）
 * - 通貨: コイン（強化に使う）とジェム（ガチャに使う）。どちらもゲーム内で稼ぐだけで、課金はない
 * - ガチャ・強化・デイリーミッション・ログインボーナス・トロフィーロード
 */
import { ROSTER, rarityOf, type Rarity } from './roster';

export const SAVE_VERSION = 1;

export interface HeroState { level: number; shards: number }
export interface MissionState { id: MissionId; progress: number; claimed: boolean }
export interface Profile {
  v: number;
  name: string;
  coins: number; gems: number;
  trophies: number; bestTrophies: number;
  heroes: Record<string, HeroState>;   // 持っているヒーローだけ入る
  selected: string;
  ults: Record<string, 0 | 1>;
  daily: { day: string; missions: MissionState[] };
  login: { lastDay: string; count: number };  // count = これまでに受け取った日数
  road: number[];                              // 受け取ったロード報酬の番号
  pity: number;                                // 最後に SSR が出てから引いた回数
  stats: { matches: number; wins: number; kos: number };
}

export type Reward = { coins?: number; gems?: number; hero?: string; shards?: { hero: string; n: number } };

// ---------- 定数 ----------
export const START_HEROES = ['gald', 'lumina', 'ren'];
export const MAX_LEVEL = 10;
/** レベル L → L+1 に上げる費用（index = 現在のレベル） */
export const UPGRADE_COINS = [0, 100, 200, 350, 550, 800, 1100, 1500, 2000, 2600];
export const UPGRADE_SHARDS = [0, 10, 20, 30, 40, 60, 80, 100, 130, 160];
/** レベル1つにつき体力・攻撃 +5% */
export const levelMul = (level: number) => 1 + 0.05 * (level - 1);

export const GACHA_COST = { single: 100, ten: 900 };
/**
 * ガチャの中身。主に強化素材（かけら・コイン）で、たまにキャラが出る。
 * かけらは「持っているキャラ（最大レベル以外）」のどれかに入る。
 */
export type GachaKind = 'hero' | 'shardL' | 'shardM' | 'shardS' | 'coinL' | 'coinS';
export const GACHA_TABLE: { kind: GachaKind; rate: number; label: string; n?: number }[] = [
  { kind: 'hero', rate: 0.05, label: 'キャラ' },
  { kind: 'shardL', rate: 0.10, label: 'かけら大', n: 40 },
  { kind: 'shardM', rate: 0.25, label: 'かけら中', n: 20 },
  { kind: 'shardS', rate: 0.30, label: 'かけら小', n: 8 },
  { kind: 'coinL', rate: 0.10, label: 'コイン大', n: 300 },
  { kind: 'coinS', rate: 0.20, label: 'コイン小', n: 80 },
];
/** キャラが出たときのレア度の内訳 */
export const GACHA_HERO_RATES: Record<Rarity, number> = { SSR: 0.1, SR: 0.3, R: 0.6 };
export const PITY = 30; // 30回引いてキャラが出なければ確定
export type GachaPull =
  | { kind: 'hero'; hero: string; rarity: Rarity; isNew: boolean; shards: number }
  | { kind: 'shardL' | 'shardM' | 'shardS'; hero: string; n: number }
  | { kind: 'coinL' | 'coinS'; n: number };
/** 被ったときにもらえるかけら（強化に使う） */
export const DUP_SHARDS: Record<Rarity, number> = { R: 10, SR: 25, SSR: 60 };

export type MissionId = 'win1' | 'play3' | 'ko8' | 'ult3' | 'capture4' | 'win3';
export const MISSIONS: Record<MissionId, { label: string; goal: number; reward: Reward }> = {
  win1: { label: '1回勝利する', goal: 1, reward: { gems: 50 } },
  play3: { label: '3回バトルする', goal: 3, reward: { coins: 150 } },
  ko8: { label: '敵を8回倒す', goal: 8, reward: { gems: 40 } },
  ult3: { label: '必殺技を3回使う', goal: 3, reward: { coins: 120 } },
  capture4: { label: '拠点を4回確保する', goal: 4, reward: { gems: 40 } },
  win3: { label: '3回勝利する', goal: 3, reward: { gems: 100 } },
};

export const LOGIN_REWARDS: Reward[] = [
  { coins: 200 }, { gems: 50 }, { coins: 300 }, { gems: 80 }, { coins: 500 }, { gems: 120 }, { gems: 300 },
];

export const ROAD: { at: number; reward: Reward }[] = [
  { at: 10, reward: { coins: 100 } },
  { at: 30, reward: { gems: 60 } },
  { at: 60, reward: { hero: 'volga' } },
  { at: 100, reward: { coins: 300 } },
  { at: 150, reward: { gems: 100 } },
  { at: 200, reward: { hero: 'nox' } },
  { at: 260, reward: { coins: 500 } },
  { at: 330, reward: { gems: 150 } },
  { at: 400, reward: { hero: 'kai' } },
  { at: 500, reward: { gems: 300 } },
  { at: 650, reward: { coins: 1000 } },
  { at: 800, reward: { hero: 'shirone' } },
];

export class GameError extends Error {}

// ---------- 日付（午前4時に日付が変わる。日本時間） ----------
export const dayKey = (now: number) => new Date(now + (9 - 4) * 3600_000).toISOString().slice(0, 10);

/** 日付から決まる乱数（その日のミッションの組み合わせを全員で同じにする） */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

export function newProfile(now: number, name = 'プレイヤー'): Profile {
  const p: Profile = {
    v: SAVE_VERSION, name, coins: 500, gems: 300, trophies: 0, bestTrophies: 0,
    heroes: {}, selected: START_HEROES[0], ults: {},
    daily: { day: '', missions: [] }, login: { lastDay: '', count: 0 }, road: [], pity: 0,
    stats: { matches: 0, wins: 0, kos: 0 },
  };
  for (const id of START_HEROES) p.heroes[id] = { level: 1, shards: 0 };
  refreshDaily(p, now);
  return p;
}

function give(p: Profile, r: Reward) {
  if (r.coins) p.coins += r.coins;
  if (r.gems) p.gems += r.gems;
  if (r.hero) {
    if (p.heroes[r.hero]) { const n = DUP_SHARDS[rarityOf(r.hero)]; p.heroes[r.hero].shards += n; r.shards = { hero: r.hero, n }; delete r.hero; }
    else p.heroes[r.hero] = { level: 1, shards: 0 };
  }
}

/** 日付が変わっていたらデイリーミッションを入れ替える */
export function refreshDaily(p: Profile, now: number) {
  const day = dayKey(now);
  if (p.daily.day === day) return;
  const rnd = seeded(day), ids = Object.keys(MISSIONS) as MissionId[];
  const picks: MissionId[] = [];
  while (picks.length < 3) { const id = ids[Math.floor(rnd() * ids.length)]; if (!picks.includes(id)) picks.push(id); }
  p.daily = { day, missions: picks.map((id) => ({ id, progress: 0, claimed: false })) };
}

// ---------- 操作（すべて Profile を書き換え、結果を返す） ----------
export type Action =
  | { type: 'login' }
  | { type: 'match'; hero: string; outcome: 'win' | 'lose' | 'draw'; kos: number; ults: number; captures: number }
  | { type: 'claimMission'; index: number }
  | { type: 'claimRoad'; index: number }
  | { type: 'gacha'; count: 1 | 10 }
  | { type: 'upgrade'; hero: string }
  | { type: 'select'; hero: string }
  | { type: 'setUlt'; hero: string; ult: 0 | 1 }
  | { type: 'rename'; name: string };

export interface MatchRewards { coins: number; trophies: number; missionsDone: string[] }
export type ActionResult =
  | { type: 'login'; reward: Reward | null; day: number }
  | { type: 'match'; rewards: MatchRewards }
  | { type: 'reward'; reward: Reward }
  | { type: 'gacha'; pulls: GachaPull[] }
  | { type: 'ok' };

export function canLoginToday(p: Profile, now: number) { return p.login.lastDay !== dayKey(now); }

export function apply(p: Profile, a: Action, now: number, rand: () => number = Math.random): ActionResult {
  refreshDaily(p, now);
  switch (a.type) {
    case 'login': {
      const day = dayKey(now);
      if (p.login.lastDay === day) return { type: 'login', reward: null, day: p.login.count };
      const reward = { ...LOGIN_REWARDS[p.login.count % LOGIN_REWARDS.length] };
      give(p, reward);
      p.login = { lastDay: day, count: p.login.count + 1 };
      return { type: 'login', reward, day: p.login.count };
    }
    case 'match': {
      if (!p.heroes[a.hero]) throw new GameError('持っていないヒーローです');
      const win = a.outcome === 'win', lose = a.outcome === 'lose';
      const kos = clampInt(a.kos, 0, 60), ults = clampInt(a.ults, 0, 30), caps = clampInt(a.captures, 0, 60);
      const coins = (win ? 60 : lose ? 25 : 40) + Math.min(20, kos * 2);
      // トロフィー: 勝てば +8、負けると -4（100未満では減らない）
      let trophies = win ? 8 + Math.min(2, Math.floor(kos / 4)) : lose ? (p.trophies < 100 ? 0 : -4) : 0;
      trophies = Math.max(-p.trophies, trophies);
      p.coins += coins; p.trophies += trophies; p.bestTrophies = Math.max(p.bestTrophies, p.trophies);
      p.stats.matches++; if (win) p.stats.wins++; p.stats.kos += kos;
      const missionsDone: string[] = [];
      for (const m of p.daily.missions) {
        const def = MISSIONS[m.id], before = m.progress;
        const add = { win1: win ? 1 : 0, win3: win ? 1 : 0, play3: 1, ko8: kos, ult3: ults, capture4: caps }[m.id];
        m.progress = Math.min(def.goal, m.progress + add);
        if (before < def.goal && m.progress >= def.goal) missionsDone.push(def.label);
      }
      return { type: 'match', rewards: { coins, trophies, missionsDone } };
    }
    case 'claimMission': {
      const m = p.daily.missions[a.index];
      if (!m || m.claimed || m.progress < MISSIONS[m.id].goal) throw new GameError('まだ受け取れません');
      m.claimed = true;
      const reward = { ...MISSIONS[m.id].reward }; give(p, reward);
      return { type: 'reward', reward };
    }
    case 'claimRoad': {
      const r = ROAD[a.index];
      if (!r || p.road.includes(a.index) || p.bestTrophies < r.at) throw new GameError('まだ受け取れません');
      p.road.push(a.index);
      const reward = { ...r.reward }; give(p, reward);
      return { type: 'reward', reward };
    }
    case 'gacha': {
      const cost = a.count === 10 ? GACHA_COST.ten : GACHA_COST.single;
      if (p.gems < cost) throw new GameError('ジェムが足りません');
      p.gems -= cost;
      const pulls: GachaPull[] = [];
      for (let i = 0; i < a.count; i++) {
        p.pity++;
        let kind = p.pity >= PITY ? 'hero' : pickKind(rand());
        // 10連の最後は「かけら大」以上を確定
        if (a.count === 10 && i === 9 && !pulls.some((x) => x.kind === 'hero' || x.kind === 'shardL') && kind !== 'hero') kind = 'shardL';
        pulls.push(gachaItem(p, kind, rand));
      }
      return { type: 'gacha', pulls };
    }
    case 'upgrade': {
      const h = p.heroes[a.hero];
      if (!h) throw new GameError('持っていないヒーローです');
      if (h.level >= MAX_LEVEL) throw new GameError('最大レベルです');
      const c = UPGRADE_COINS[h.level], s = UPGRADE_SHARDS[h.level];
      if (p.coins < c) throw new GameError('コインが足りません');
      if (h.shards < s) throw new GameError('かけらが足りません');
      p.coins -= c; h.shards -= s; h.level++;
      return { type: 'ok' };
    }
    case 'select': {
      if (!p.heroes[a.hero]) throw new GameError('持っていないヒーローです');
      p.selected = a.hero; return { type: 'ok' };
    }
    case 'setUlt': {
      if (!p.heroes[a.hero]) throw new GameError('持っていないヒーローです');
      p.ults[a.hero] = a.ult ? 1 : 0; return { type: 'ok' };
    }
    case 'rename': {
      const name = String(a.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
      if (!name) throw new GameError('名前を入力してください');
      p.name = name; return { type: 'ok' };
    }
  }
}

function pickKind(x: number): GachaKind {
  for (const t of GACHA_TABLE) { if (x < t.rate) return t.kind; x -= t.rate; }
  return 'coinS';
}

/** ガチャ1回ぶんの中身を決めて、プロフィールに反映する */
function gachaItem(p: Profile, kind: GachaKind, rand: () => number): GachaPull {
  if (kind === 'hero') {
    p.pity = 0;
    const x = rand();
    const rarity: Rarity = x < GACHA_HERO_RATES.SSR ? 'SSR' : x < GACHA_HERO_RATES.SSR + GACHA_HERO_RATES.SR ? 'SR' : 'R';
    // まだ持っていないキャラを優先（そのレア度を全部持っていれば、ほかのレア度の未所持から）
    const unowned = ROSTER.filter((h) => !p.heroes[h.id]);
    const pool = unowned.filter((h) => h.rarity === rarity).length ? unowned.filter((h) => h.rarity === rarity) : unowned.length ? unowned : ROSTER.filter((h) => h.rarity === rarity);
    const pick = pool[Math.floor(rand() * pool.length)];
    const reward: Reward = { hero: pick.id }; give(p, reward);
    return { kind: 'hero', hero: pick.id, rarity: pick.rarity, isNew: !reward.shards, shards: reward.shards?.n ?? 0 };
  }
  const t = GACHA_TABLE.find((x) => x.kind === kind)!;
  if (kind === 'coinL' || kind === 'coinS') { p.coins += t.n!; return { kind, n: t.n! }; }
  // かけら: 最大レベルでない所持キャラから。使用中のキャラには少し出やすく
  const owned = Object.keys(p.heroes).filter((id) => p.heroes[id].level < MAX_LEVEL);
  if (!owned.length) { const n = t.n! * 10; p.coins += n; return { kind: 'coinL', n }; }
  const hero = owned.includes(p.selected) && rand() < 0.3 ? p.selected : owned[Math.floor(rand() * owned.length)];
  p.heroes[hero].shards += t.n!;
  return { kind: kind as 'shardL' | 'shardM' | 'shardS', hero, n: t.n! };
}
function clampInt(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, Math.floor(Number(n) || 0))); }

/** 古い/壊れたセーブを読み込めるように補う */
export function migrate(raw: unknown, now: number): Profile {
  const base = newProfile(now);
  if (!raw || typeof raw !== 'object') return base;
  const p = { ...base, ...(raw as Partial<Profile>) } as Profile;
  if (!p.heroes || !Object.keys(p.heroes).length) p.heroes = base.heroes;
  if (!p.heroes[p.selected]) p.selected = Object.keys(p.heroes)[0];
  p.stats = { ...base.stats, ...(p.stats ?? {}) };
  p.login = { ...base.login, ...(p.login ?? {}) };
  if (!Array.isArray(p.road)) p.road = [];
  refreshDaily(p, now);
  return p;
}

/** トロフィーから決まる敵の強さ */
export function enemyTier(trophies: number) {
  const level = Math.min(MAX_LEVEL, 1 + Math.floor(trophies / 80));
  const skillDelay = trophies < 100 ? 2.4 : trophies < 400 ? 1.4 : 0.8;
  return { level, skillDelay };
}
