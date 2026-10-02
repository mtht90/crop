import type { FxLevel } from '../lib/fx';
import type { MatchInfo } from '../online/client';
import type { Beat } from '../story/types';
import { create } from 'zustand';
import { ALL_CARDS, card, CARDS, SET_INFO } from '../engine/cards';
import { applyRanked, ensureSeason, freshRank, type RankChange, type RankState } from './ranked';
import { expand, RIVALS, STARTER_DECKS, type Rival } from '../engine/decks';
import type { Difficulty } from '../engine/ai';
import type { CardDef, EType, Rarity, SetCode } from '../engine/types';
import { dayNumber, lineupFor, type Series } from './themes';
import {
  ACHIEVEMENTS,
  addExp,
  battleReward,
  bump,
  canClaimLogin,
  currentPickup,
  dailyMissions,
  dayKey,
  ensurePeriods,
  freshProgress,
  levelReward,
  LOGIN_REWARDS,
  loginSlot,
  missionValue,
  weeklyMissions,
  type BattleOutcome,
  type ExtCtx,
  type Mission,
  type MissionPeriod,
  NORMAL_MISSIONS,
  type Progress,
  type RewardLine,
  type Stats,
} from './progress';

// ----------------------------------------------------------------------------
// Shards (かけら): copies beyond MAX_COPIES turn into shards of that rarity,
// and shards of a rarity can be exchanged for any card of the same rarity.
// ----------------------------------------------------------------------------
export const MAX_COPIES = 10;
export const SHARD_COST: Record<Rarity, number> = { C: 10, U: 10, R: 12, RR: 18, ST: 25, ST2: 28, CR: 30 };
export const SHARD_RARITIES: Rarity[] = ['C', 'U', 'R', 'RR', 'ST', 'ST2', 'CR'];
/** shard keys from the 11-rarity era */
const OLD_RARITY: Record<string, Rarity> = { RRR: 'RR', AR: 'ST', CHR: 'ST', S: 'ST', SR: 'ST', SAR: 'CR', UR: 'CR' };
const CARDS_OK = (cid: string) => cid in CARDS;
const isBasicEnergy = (cid: string) => {
  const c = card(cid);
  return c.kind === 'energy' && c.basic;
};

export type Screen = 'arena' | 'story' | 'scene' | 'lobby' | 'title' | 'starter' | 'home' | 'rivals' | 'battle' | 'deck' | 'collection' | 'shop' | 'missions' | 'exchange' | 'ranked' | 'settings' | 'credits' | 'rules' | 'gallery';

export interface SavedDeck {
  id: string;
  name: string;
  cards: string[];
  cover: string;
}

export interface Settings {
  music: number;
  sfx: number;
  speed: number; // animation speed multiplier
  fx: FxLevel;
  vibrate: boolean;
  /** tilt cards (holo shine) with the device's motion sensor */
  gyro: boolean;
}

export interface Save {
  v: 1;
  coins: number;
  collection: Record<string, number>;
  decks: SavedDeck[];
  activeDeck: string;
  beaten: string[];
  wins: number;
  losses: number;
  packsOpened: number;
  newCards: string[];
  settings: Settings;
  started: boolean;
  guideSeen?: boolean;
  progress: Progress;
  /** かけら: duplicates beyond MAX_COPIES, per rarity */
  shards: Partial<Record<Rarity, number>>;
  ranked: RankState;
  /** story mode progress */
  story: StorySave;
  /** developer mode (entered with a code in 設定): everything cleared, coins and shards never run out */
  dev?: boolean;
}

export interface StorySave {
  /** the prologue has been played */
  started: boolean;
  /** chapters won through the story */
  cleared: string[];
  /** scenes that have been watched (ids like "c03:before") */
  seen: string[];
  /** read the conversations automatically (false = skip straight to battles) */
  scenes: boolean;
  /** the player's character: name and portrait (chosen before the prologue) */
  hero?: { name: string; look: string };
  /** story edition; saves from an older story start the new one from the beginning */
  v?: number;
}
export const STORY_VERSION = 2;
export const freshStory = (): StorySave => ({ started: false, cleared: [], seen: [], scenes: true, v: STORY_VERSION });

export interface BattleConfig {
  rival: Rival | null;
  playerDeck: string[];
  oppDeck: string[];
  oppName: string;
  oppPortrait: string;
  level: Difficulty;
  scene: string;
  reward: number;
  spectate?: boolean;
  /** ranked match: the opponent's rank index */
  ranked?: { oppRank: number };
  /** an online match (the rules run on the server) */
  online?: MatchInfo;
  /** a story chapter's duel */
  story?: { chapterId: string };
}

const KEY = 'arcane-beasts-save-v1';

// ----------------------------------------------------------------------------
// Developer mode
// ----------------------------------------------------------------------------
export const DEV_CODE = 'ARCANE-DEV';
const DEV_COINS = 9_999_999;
const DEV_SHARDS = 9_999;

/** developer mode keeps coins and shards topped up */
function refill(s: Save) {
  s.coins = Math.max(s.coins, DEV_COINS);
  for (const r of SHARD_RARITIES) s.shards[r] = Math.max(s.shards[r] ?? 0, DEV_SHARDS);
}

/** turn developer mode on: the story and every rival cleared, resources without limit */
export function enterDevMode(s: Save, chapterIds: string[]) {
  s.dev = true;
  s.started = true;
  s.story.started = true;
  s.story.hero ??= { name: 'ユウ', look: 'konrad' };
  s.story.cleared = [...chapterIds];
  s.story.seen = ['prologue', ...chapterIds.flatMap((id) => [`${id}:before`, `${id}:after`])];
  s.beaten = RIVALS.map((r) => r.id);
  refill(s);
}

/** every printing, up to the copy limit */
export function grantAllCards(s: Save) {
  for (const c of ALL_CARDS) {
    if (c.kind === 'energy' && c.basic) continue;
    if (!s.collection[c.id]) s.newCards.push(c.id);
    s.collection[c.id] = Math.max(s.collection[c.id] ?? 0, 4);
  }
}

function freshSave(): Save {
  return {
    v: 1,
    coins: 600,
    collection: {},
    decks: [],
    activeDeck: '',
    beaten: [],
    wins: 0,
    losses: 0,
    packsOpened: 0,
    newCards: [],
    settings: { music: 0.5, sfx: 0.8, speed: 1, fx: 'auto', vibrate: true, gyro: true },
    started: false,
    progress: freshProgress(),
    shards: {},
    ranked: freshRank(),
    story: freshStory(),
  };
}

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...freshSave(), ...JSON.parse(raw) } as Save;
      s.settings = { ...freshSave().settings, ...(s.settings ?? {}) };
      s.progress = { ...freshProgress(), ...(s.progress ?? {}) };
      s.progress.stats = { ...freshProgress().stats, ...s.progress.stats };
      if ((s.story?.v ?? 1) < STORY_VERSION) s.story = { ...freshStory(), scenes: s.story?.scenes ?? true, hero: s.story?.hero };
      s.shards = s.shards ?? {};
      s.ranked = { ...freshRank(), ...(s.ranked ?? {}) };
      s.story = { ...freshStory(), ...(s.story ?? {}) };
      ensureSeason(s.ranked);
      for (const [k, n] of Object.entries(s.shards) as [string, number][]) {
        const to = OLD_RARITY[k];
        if (!to) continue;
        s.shards[to] = (s.shards[to] ?? 0) + n;
        delete (s.shards as Record<string, number>)[k];
      }
      // migrate: anything already over the cap becomes shards
      for (const [cid, n] of Object.entries(s.collection)) {
        if (n > MAX_COPIES && CARDS_OK(cid) && !isBasicEnergy(cid)) {
          const r = card(cid).rarity;
          s.shards[r] = (s.shards[r] ?? 0) + n - MAX_COPIES;
          s.collection[cid] = MAX_COPIES;
        }
      }
      return s;
    }
  } catch {
    /* ignore */
  }
  return freshSave();
}

function persist(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

interface Store {
  screen: Screen;
  save: Save;
  battle: BattleConfig | null;
  scene: { id: string; beats: Beat[]; then: () => void } | null;
  battleSeq: number;
  go: (s: Screen) => void;
  update: (f: (s: Save) => void) => void;
  chooseStarter: (deckId: string) => void;
  /** adds cards; returns, per card, whether it became a shard instead */
  addCards: (cids: string[]) => boolean[];
  exchange: (cid: string) => boolean;
  recordRanked: (win: boolean) => RankChange;
  /** play a scene full-screen, then call `then` */
  playScene: (id: string, beats: Beat[], then: () => void) => void;
  markScene: (id: string) => void;
  clearChapter: (chapterId: string) => void;
  /** pay rank rewards decided by the server (online ranked) */
  grantRankRewards: (rewards: RankChange['rewards']) => void;
  startBattle: (cfg: BattleConfig) => void;
  reset: () => void;
  claimLogin: () => number;
  claimMission: (m: Mission, period: MissionPeriod) => number;
  recordPack: (premium: boolean) => void;
  recordBattle: (o: BattleOutcome, st: Partial<Stats>) => BattleRewardResult;
}

export interface BattleRewardResult {
  lines: RewardLine[];
  total: number;
  exp: number;
  levelBefore: number;
  expBefore: number;
  levelUps: number[];
  levelCoins: number;
}

export const useStore = create<Store>((set, get) => ({
  screen: 'title',
  save: load(),
  battle: null,
  scene: null,
  battleSeq: 0,
  go: (screen) => set({ screen }),
  update: (f) => {
    const s = structuredClone(get().save);
    f(s);
    if (s.dev) refill(s);
    persist(s);
    set({ save: s });
  },
  chooseStarter: (deckId) => {
    const d = STARTER_DECKS.find((x) => x.id === deckId)!;
    const cards = expand(d.cards);
    get().update((s) => {
      for (const cid of cards) s.collection[cid] = (s.collection[cid] ?? 0) + 1;
      const deck: SavedDeck = { id: `deck-${Date.now()}`, name: d.name, cards, cover: cards[0] };
      const coverDef = ALL_CARDS.find((c) => c.name === d.cover);
      if (coverDef) deck.cover = coverDef.id;
      s.decks.push(deck);
      s.activeDeck = deck.id;
      s.started = true;
    });
  },
  addCards: (cids) => {
    const out: boolean[] = [];
    get().update((s) => {
      for (const cid of cids) {
        const have = s.collection[cid] ?? 0;
        const c = card(cid);
        if (have >= MAX_COPIES && !isBasicEnergy(cid)) {
          s.shards[c.rarity] = (s.shards[c.rarity] ?? 0) + 1;
          out.push(true);
          continue;
        }
        if (!have) s.newCards.push(cid);
        s.collection[cid] = have + 1;
        out.push(false);
      }
    });
    return out;
  },
  playScene: (id, beats, then) => set((st) => ({ scene: { id, beats, then }, screen: 'scene', battleSeq: st.battleSeq })),
  markScene: (id) =>
    get().update((s) => {
      if (!s.story.seen.includes(id)) s.story.seen.push(id);
    }),
  clearChapter: (chapterId) =>
    get().update((s) => {
      if (!s.story.cleared.includes(chapterId)) s.story.cleared.push(chapterId);
    }),
  recordRanked: (win) => {
    let res!: RankChange;
    get().update((s) => {
      res = applyRanked(s.ranked, win);
      if (win) bump(s.progress, { rankedWins: 1 });
      for (const { reward } of res.rewards) {
        s.coins += reward.coins;
        for (const [r, n] of Object.entries(reward.shards ?? {}) as [Rarity, number][]) s.shards[r] = (s.shards[r] ?? 0) + n;
      }
    });
    return res;
  },
  grantRankRewards: (rewards) =>
    get().update((s) => {
      for (const { reward } of rewards) {
        s.coins += reward.coins;
        for (const [r, n] of Object.entries(reward.shards ?? {}) as [Rarity, number][]) s.shards[r] = (s.shards[r] ?? 0) + n;
      }
    }),
  exchange: (cid) => {
    let ok = false;
    get().update((s) => {
      const c = card(cid);
      const cost = SHARD_COST[c.rarity];
      if ((s.shards[c.rarity] ?? 0) < cost || (s.collection[cid] ?? 0) >= MAX_COPIES) return;
      s.shards[c.rarity] = (s.shards[c.rarity] ?? 0) - cost;
      if (!s.collection[cid]) s.newCards.push(cid);
      s.collection[cid] = (s.collection[cid] ?? 0) + 1;
      bump(s.progress, { exchanges: 1 });
      ok = true;
    });
    return ok;
  },
  startBattle: (cfg) => set((st) => ({ battle: cfg, screen: 'battle', battleSeq: st.battleSeq + 1 })),
  reset: () => {
    const s = freshSave();
    persist(s);
    set({ save: s, screen: 'title' });
  },
  claimLogin: () => {
    let got = 0;
    get().update((s) => {
      const p = s.progress;
      if (!canClaimLogin(p)) return;
      got = LOGIN_REWARDS[loginSlot(p)];
      p.loginCount++;
      p.loginDay = dayKey();
      s.coins += got;
    });
    return got;
  },
  claimMission: (m, period) => {
    let got = 0;
    get().update((s) => {
      const p = s.progress;
      ensurePeriods(p);
      const ext = extCtx(s);
      p.normalClaimed ??= [];
      const list = period === 'daily' ? p.daily.claimed : period === 'weekly' ? p.weekly.claimed : period === 'normal' ? p.normalClaimed : p.achvClaimed;
      if (list.includes(m.id) || missionValue(p, m, period, ext) < m.target) return;
      list.push(m.id);
      s.coins += m.reward;
      got = m.reward;
    });
    return got;
  },
  recordPack: (premium) =>
    get().update((s) => {
      bump(s.progress, { packs: 1, premiumPacks: premium ? 1 : 0 });
    }),
  recordBattle: (o, st) => {
    let res: BattleRewardResult = { lines: [], total: 0, exp: 0, levelBefore: 1, expBefore: 0, levelUps: [], levelCoins: 0 };
    get().update((s) => {
      const p = s.progress;
      ensurePeriods(p);
      const r = battleReward(p, o);
      res = { ...r, levelBefore: p.level, expBefore: p.exp, levelUps: [], levelCoins: 0 };
      bump(p, {
        ...st,
        battles: 1,
        wins: o.win ? 1 : 0,
        hardWins: o.win && o.level === 'hard' ? 1 : 0,
        perfectWins: o.win && o.prizesLost === 0 ? 1 : 0,
      });
      if (o.win) {
        p.streak++;
        p.stats.bestStreak = Math.max(p.stats.bestStreak ?? 0, p.streak);
        p.lastWinDay = dayKey();
        s.wins++;
      } else {
        p.streak = 0;
        s.losses++;
      }
      const ups = addExp(p, r.exp);
      res.levelUps = ups;
      res.levelCoins = ups.reduce((n, l) => n + levelReward(l), 0);
      s.coins += r.total + res.levelCoins;
    });
    return res;
  },
}));

/** Collection progress over every printing (mirrors included) */
export function collectionPct(s: Save, set?: SetCode) {
  const list = ALL_CARDS.filter((c) => !set || c.set === set);
  const have = list.filter((c) => (c.kind === 'energy' && c.basic) || (s.collection[c.id] ?? 0) > 0).length;
  return (have / list.length) * 100;
}



export function extCtx(s: Save): ExtCtx {
  let uniques = 0;
  let stars = 0;
  for (const [cid, k] of Object.entries(s.collection)) {
    if (!k || !(cid in CARDS)) continue;
    const c = card(cid);
    if (c.kind === 'energy' && c.basic) continue;
    uniques++;
    if (RARITY_ORDER[c.rarity] >= RARITY_ORDER.ST) stars++;
  }
  return { collectionPct: collectionPct(s), rivals: s.beaten.length, story: s.story.cleared.length, rank: s.ranked.rank, uniques, stars, decks: s.decks.length };
}

export { dailyMissions, weeklyMissions, ACHIEVEMENTS, NORMAL_MISSIONS };

export function activeDeck(s: Save): SavedDeck | undefined {
  return s.decks.find((d) => d.id === s.activeDeck) ?? s.decks[0];
}

export function owned(s: Save, cid: string) {
  const c = card(cid);
  if (c.kind === 'energy' && c.basic) return 99;
  return s.collection[cid] ?? 0;
}

// ----------------------------------------------------------------------------
// Booster packs (5 cards, the last slot is the rare slot)
// ----------------------------------------------------------------------------
/** every normal pack costs the same */
export const PACK_PRICE = 150;
export const PACK_SIZE = 5;

export interface Booster {
  id: string;
  name: string;
  set: SetCode;
  mascot: string; // card name shown on the pack
  types: EType[]; // featured types (drawn twice as often)
  hue: string; // accent colour for the pack art
  hue2: string;
  premium?: boolean;
  /** daily pack: draws from every set (see themes.ts) */
  theme?: string;
  /** name printed on the pack instead of the set name */
  title?: string;
  /** daily packs: the share of draws that should be of the featured types (set packs just double them) */
  share?: number;
}

export const PREMIUM_PRICE = 300;

export function premiumBooster(): Booster {
  const pu = currentPickup();
  const mascot = pu ? (pu.card.baseId ? card(pu.card.baseId).name : pu.card.name) : 'ドラグーン';
  return { id: 'premium', name: 'プレミアムパック', set: 'AB2', mascot, types: [], hue: '#e9c46a', hue2: '#1c1206', premium: true };
}

export const BOOSTERS: Booster[] = [
  { id: 'blaze', name: 'ヴォルカリオンパック', set: 'AB1', mascot: 'ヴォルカリオン', types: ['fire', 'fighting'], hue: '#ff6a2b', hue2: '#7a1405' },
  { id: 'abyss', name: 'リヴァイアサーペントパック', set: 'AB1', mascot: 'リヴァイアサーペント', types: ['water', 'lightning'], hue: '#39a8ff', hue2: '#0a2a6e' },
  { id: 'grove', name: 'エンシェントウッドパック', set: 'AB1', mascot: 'エンシェントウッド', types: ['grass', 'psychic', 'dark'], hue: '#7fdc5a', hue2: '#123f1a' },
  { id: 'dragon', name: 'ドラグーンパック', set: 'AB2', mascot: 'ドラグーン', types: ['fire', 'fighting', 'colorless'], hue: '#ffb03a', hue2: '#4a1a02' },
  { id: 'deep', name: 'ナーガクイーンパック', set: 'AB2', mascot: 'ナーガクイーン', types: ['water', 'psychic'], hue: '#3fd6c8', hue2: '#062a3a' },
  { id: 'undead', name: 'リッチロードパック', set: 'AB2', mascot: 'リッチロード', types: ['dark', 'grass', 'lightning'], hue: '#9d7bff', hue2: '#150a33' },
  { id: 'horde', name: 'オークソブリンパック', set: 'AB3', mascot: 'オークソブリン', types: ['fighting', 'fire', 'colorless'], hue: '#d8742c', hue2: '#3a1606' },
  { id: 'stone', name: 'ドラゴンガードパック', set: 'AB3', mascot: 'ドラゴンガード', types: ['lightning', 'water', 'grass'], hue: '#79b8ff', hue2: '#0c1f3d' },
  { id: 'plague', name: 'ドラウグロードパック', set: 'AB3', mascot: 'ドラウグロード', types: ['dark', 'psychic', 'colorless'], hue: '#c36bff', hue2: '#1c0b2e' },
];

export const setName = (set: SetCode) => SET_INFO[set].name;

const SET_BLURB: Record<SetCode, string> = {
  AB1: 'はじまりの弾。基本の魔獣とトレーナーがそろう。',
  AB2: 'EXが初登場した弾。覇竜・冥海・死霊の3パック。',
  AB3: '最新弾。辺境の軍勢と、新しいEXたち。',
};
export const SET_SERIES = Object.fromEntries(
  (['AB1', 'AB2', 'AB3'] as SetCode[]).map((set) => [set, { id: set, kind: 'set', set, name: `${SET_INFO[set].short} ${SET_INFO[set].name}`, blurb: SET_BLURB[set], boosters: BOOSTERS.filter((x) => x.set === set) }]),
) as Record<SetCode, Series>;

/** the two series on sale today (?lineup=N looks N days ahead) */
export function todaysLineup(now = Date.now()): [Series, Series] {
  const off = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('lineup') ?? 0) || 0 : 0;
  return lineupFor(dayNumber(now) + off, SET_SERIES);
}

/** which cards a pack draws from: one set, or every set (daily and premium packs) */
type Scope = SetCode | undefined;
const scopeOf = (b: Booster): Scope => (b.theme || b.premium ? undefined : b.set);
const scopeKey = (s: Scope) => s ?? '*';
const inScope = (c: CardDef, s: Scope) => s === undefined || c.set === s;

/** cards that can appear for a rarity (mirrors come from their own slot) */
const POOLS = new Map<string, CardDef[]>();
function pool(r: Rarity, scope?: Scope, mirror = false): CardDef[] {
  const key = `${r}|${scopeKey(scope)}|${mirror}`;
  let p = POOLS.get(key);
  if (!p) {
    p = ALL_CARDS.filter((c) => c.rarity === r && (c.variant === 'mirror') === mirror && !(c.kind === 'energy' && c.basic) && inScope(c, scope));
    POOLS.set(key, p);
  }
  return p;
}

function featured(c: CardDef, b: Booster) {
  return (c.kind === 'monster' && b.types.includes(c.type)) || (c.kind === 'energy' && b.types.includes(c.energyType));
}

function pickWeighted(arr: CardDef[], b: Booster): CardDef {
  const isF = arr.map((c) => featured(c, b));
  const nF = isF.filter(Boolean).length;
  // weight the featured cards so they make up `share` of the draws, whatever the pool looks like
  const fw = b.share && nF && nF < arr.length ? (b.share * (arr.length - nF)) / ((1 - b.share) * nF) : 2;
  const w = isF.map((f) => (f ? Math.max(1, fw) : 1));
  let r = Math.random() * w.reduce((x, y) => x + y, 0);
  for (let i = 0; i < arr.length; i++) if ((r -= w[i]) <= 0) return arr[i];
  return arr[arr.length - 1];
}

/** table entries are cumulative thresholds, e.g. [['C', 0.9], ['U', 1]] */
function roll(table: [Rarity, number][]): Rarity {
  const r = Math.random();
  for (const [k, p] of table) if (r < p) return k;
  return table[table.length - 1][0];
}

/** roll a rarity; if the pool has no card of that rarity, take the nearest lower one (or the nearest higher) */
function rollCard(table: [Rarity, number][], b: Booster, scope?: Scope): CardDef {
  let r = roll(table);
  const order = Object.keys(RARITY_ORDER) as Rarity[];
  if (!pool(r, scope).length) {
    const lower = order.filter((k) => RARITY_ORDER[k] < RARITY_ORDER[r] && pool(k, scope).length);
    const higher = order.filter((k) => RARITY_ORDER[k] > RARITY_ORDER[r] && pool(k, scope).length);
    r = lower.length ? lower[lower.length - 1] : higher[0];
  }
  return pickWeighted(pool(r, scope), b);
}

export interface PackResult {
  cards: CardDef[];
  god: boolean;
}

/** Normal pack odds, per slot. Slot 3 may be a mirror; slot 5 is the rare slot. */
export const PACK_TABLE: [Rarity, number][][] = [
  [['C', 0.9], ['U', 1]],
  [['C', 0.85], ['U', 1]],
  [['C', 0.75], ['U', 1]],
  [['U', 0.66], ['R', 0.9], ['RR', 1]],
  [['R', 0.52], ['RR', 0.78], ['ST', 0.95], ['ST2', 0.98], ['CR', 1]],
];
export const MIRROR_CHANCE = 0.3;
const GOD_TABLE: [Rarity, number][][] = [
  [['RR', 1]],
  [['RR', 0.5], ['ST', 1]],
  [['ST', 1]],
  [['ST', 0.5], ['ST2', 0.8], ['CR', 1]],
  [['ST', 0.3], ['ST2', 0.6], ['CR', 1]],
];

export function openPack(b: Booster = BOOSTERS[0]): PackResult {
  const god = Math.random() < 0.005 || (typeof location !== 'undefined' && location.search.includes('godpack'));
  const cards = (god ? GOD_TABLE : PACK_TABLE).map((t, i) => {
    const scope = scopeOf(b);
    if (!god && i === 2 && Math.random() < MIRROR_CHANCE) {
      const r = roll([['C', 0.6], ['U', 0.9], ['R', 1]]);
      const m = pool(r, scope, true);
      if (m.length) return pickWeighted(m, b);
    }
    return rollCard(t, b, scope);
  });
  cards.sort((x, y) => RARITY_ORDER[x.rarity] - RARITY_ORDER[y.rarity]);
  return { cards, god };
}

/** Premium pack: slots roll a little higher; the last slot is RR or better. Cards from every set. */
export const PREMIUM_TABLE: [Rarity, number][][] = [
  [['U', 0.7], ['R', 0.95], ['RR', 1]],
  [['U', 0.65], ['R', 0.93], ['RR', 1]],
  [['R', 0.7], ['RR', 0.96], ['ST', 1]],
  [['R', 0.45], ['RR', 0.88], ['ST', 0.97], ['ST2', 0.995], ['CR', 1]],
  [['RR', 0.72], ['ST', 0.92], ['ST2', 0.98], ['CR', 1]],
];

export function openPremium(): PackResult {
  const pu = currentPickup();
  const b = premiumBooster();
  const cards = PREMIUM_TABLE.map((t) => {
    const c = rollCard(t, b);
    // pick-up: half of the draws at the pick-up card's rarity become that card
    if (pu && pu.card.rarity === c.rarity && Math.random() < 0.5) return pu.card;
    return c;
  });
  cards.sort((x, y) => RARITY_ORDER[x.rarity] - RARITY_ORDER[y.rarity]);
  return { cards, god: false };
}

export const RARITY_ORDER: Record<Rarity, number> = { C: 0, U: 1, R: 2, RR: 3, ST: 4, ST2: 5, CR: 6 };

export { RIVALS };
