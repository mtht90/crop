import type { FxLevel } from '../lib/fx';
import type { MatchInfo } from '../online/client';
import type { Beat } from '../story/types';
import { create } from 'zustand';
import { ALL_CARDS, card, CARDS, SET_INFO } from '../engine/cards';
import { expand, RIVALS, STARTER_DECKS, type Rival } from '../engine/decks';
import type { Difficulty } from '../engine/ai';
import { cleanWardrobe, cosmeticById, freshWardrobe, type Wardrobe } from './cosmetics';
import type { CardDef, EType, MonsterCard, Rarity, SetCode } from '../engine/types';
import {
  ACHIEVEMENTS,
  addExp,
  battleReward,
  bump,
  canClaimLogin,
  dailyMissions,
  dayKey,
  ensurePeriods,
  freshProgress,
  levelReward,
  LOGIN_REWARDS,
  LOGIN_GEMS,
  levelGems,
  missionGems,
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
  COIN_SCALE,
} from './progress';
import { raidCost, raidLossCoins, raidNow, raidWinReward, rollRaidDrop, type RaidSave } from './raid';

// ----------------------------------------------------------------------------
// Copies beyond MAX_COPIES are sold for coins on the spot (by ★).
// ----------------------------------------------------------------------------
export const ECON_VERSION = 2;
export const MAX_COPIES = 10;
export const DUPE_COINS: Record<Rarity, number> = { 1: 25, 2: 50, 3: 125, 4: 400, 5: 1000 };
/** what the old かけら (shards) are worth now that they are gone, per shard */
const SHARD_COINS: Record<string, number> = { C: 10, U: 10, R: 15, RR: 30, RRR: 30, ST: 50, ST2: 60, CR: 80, AR: 50, CHR: 50, S: 50, SR: 50, SAR: 80, UR: 80 };
const CARDS_OK = (cid: string) => cid in CARDS;
const isBasicEnergy = (cid: string) => {
  const c = card(cid);
  return c.kind === 'energy' && c.basic;
};

export type Screen = 'arena' | 'story' | 'scene' | 'lobby' | 'title' | 'starter' | 'home' | 'rivals' | 'battle' | 'deck' | 'collection' | 'shop' | 'missions' | 'more' | 'settings' | 'credits' | 'rules' | 'gallery' | 'wardrobe' | 'raid';

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
  /** keep the hand sorted (monsters, trainers, energy) */
  handSort?: boolean;
}

export interface Save {
  v: 1;
  /** economy version (2: the coin scale-up) */
  econ?: number;
  /** コイン: bought looks in the ワードローブ; earned by battles, missions, duplicates */
  coins: number;
  /** ジェム: buy packs; earned by first clears, missions, the login cycle, level-ups */
  gems: number;
  wardrobe: Wardrobe;
  collection: Record<string, number>;
  decks: SavedDeck[];
  activeDeck: string;
  beaten: string[];
  /** CPU対戦 levels already beaten once (first wins pay gems) */
  cpuBeaten?: number[];
  wins: number;
  losses: number;
  packsOpened: number;
  newCards: string[];
  settings: Settings;
  started: boolean;
  guideSeen?: boolean;
  /** お知らせ: the newest entry opened, and the day the start-up popup was turned off */
  newsSeen?: string;
  /** this week's boss raid */
  raid?: RaidSave;
  newsHideDay?: string;
  progress: Progress;
  /** story mode progress */
  story: StorySave;
  /** developer mode (entered with a code in 設定): everything cleared, coins never run out */
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
  /** decisions made in scenes (choice key → what was chosen) */
  flags?: Record<string, string>;
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
  /** CPU対戦: the CPU's strength, 1–9 (the thinking uses it; `level` is only the tier for rewards) */
  cpuLevel?: number;
  scene: string;
  reward: number;
  spectate?: boolean;
  /** an online match (the rules run on the server) */
  online?: MatchInfo;
  /** a story chapter's duel */
  story?: { chapterId: string };
  /** this week's boss raid */
  raid?: { bossId: string; startDamage: number };
}

const KEY = 'arcane-beasts-save-v1';

/** the save as it is stored (for 引き継ぎ) */
export function exportSave(): string {
  return JSON.stringify(useStore.getState().save);
}

/**
 * replace this device's save with one brought from another device; the usual
 * load path runs on it, so older saves are brought up to date the same way
 */
export function importSave(raw: string): boolean {
  try {
    const v = JSON.parse(raw) as Partial<Save>;
    if (!v || typeof v !== 'object' || typeof v.coins !== 'number' || typeof v.collection !== 'object' || !Array.isArray(v.decks)) return false;
    localStorage.setItem(KEY, raw);
  } catch {
    return false;
  }
  useStore.setState({ save: load(), screen: 'home', battle: null, scene: null });
  return true;
}

// ----------------------------------------------------------------------------
// Developer mode
// ----------------------------------------------------------------------------
export const DEV_CODE = 'ARCANE-DEV';
const DEV_COINS = 9_999_999;
const DEV_GEMS = 999_999;

/** developer mode keeps the coins topped up */
function refill(s: Save) {
  s.coins = Math.max(s.coins, DEV_COINS);
  s.gems = Math.max(s.gems ?? 0, DEV_GEMS);
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
    econ: ECON_VERSION,
    coins: 1500,
    gems: 600,
    wardrobe: freshWardrobe(),
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
    story: freshStory(),
  };
}

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Save>;
      const s = { ...freshSave(), ...parsed } as Save;
      s.settings = { ...freshSave().settings, ...(s.settings ?? {}) };
      s.progress = { ...freshProgress(), ...(s.progress ?? {}) };
      s.progress.stats = { ...freshProgress().stats, ...s.progress.stats };
      if ((s.story?.v ?? 1) < STORY_VERSION) s.story = { ...freshStory(), scenes: s.story?.scenes ?? true, hero: s.story?.hero };
      s.story = { ...freshStory(), ...(s.story ?? {}) };
      // the renewal: かけら are gone — each one is paid out in coins
      const old = s as Omit<Save, never> & { shards?: Record<string, number>; ranked?: unknown };
      if (old.shards) {
        for (const [k, n] of Object.entries(old.shards)) s.coins += (SHARD_COINS[k] ?? 10) * Math.max(0, n || 0);
        delete old.shards;
      }
      delete old.ranked;
      // retired printings (illustration, character, shiny) become the card itself
      const retired = (cid: string) => (CARDS_OK(cid) ? cid : cid.replace(/-(AR|CHR|S)$/, ''));
      for (const [cid, n] of Object.entries(s.collection)) {
        const to = retired(cid);
        if (to === cid || !CARDS_OK(to)) continue;
        s.collection[to] = (s.collection[to] ?? 0) + n;
        delete s.collection[cid];
      }
      for (const d of s.decks) {
        d.cards = d.cards.map(retired);
        d.cover = retired(d.cover);
      }
      s.newCards = s.newCards.map(retired).filter(CARDS_OK);
      // gems arrived later: what a player had in coins (which bought packs until now) carries over 1:1
      if (typeof parsed.gems !== 'number') s.gems = Math.max(0, parsed.coins ?? 0);
      // the economy redesign: everyday coins pay out 5× what they did, so do the coins already saved
      if ((parsed.econ ?? 1) < ECON_VERSION) {
        s.coins = Math.max(0, Math.round(s.coins * COIN_SCALE));
        s.econ = ECON_VERSION;
      }
      s.wardrobe = cleanWardrobe(s.wardrobe);
      // anything over the cap is sold
      for (const [cid, n] of Object.entries(s.collection)) {
        if (n > MAX_COPIES && CARDS_OK(cid) && !isBasicEnergy(cid)) {
          s.coins += DUPE_COINS[card(cid).rarity] * (n - MAX_COPIES);
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
  /** adds cards; returns, per card, the coins it was sold for when already at the copy limit (0 = kept) */
  addCards: (cids: string[]) => number[];
  /** play a scene full-screen, then call `then` */
  playScene: (id: string, beats: Beat[], then: () => void) => void;
  markScene: (id: string) => void;
  clearChapter: (chapterId: string) => void;
  startBattle: (cfg: BattleConfig) => void;
  reset: () => void;
  claimLogin: () => Wallet;
  claimMission: (m: Mission, period: MissionPeriod) => Wallet;
  /** buy a look with coins (false = not enough / already owned) */
  buyCosmetic: (id: string) => boolean;
  equipCosmetic: (id: string) => void;
  recordPack: (premium: boolean) => void;
  recordBattle: (o: BattleOutcome, st: Partial<Stats>) => BattleRewardResult;
  /** pay for a raid try and start it (false = not enough gems) */
  startRaid: (playerDeck: string[]) => boolean;
  /** pay out a raid battle; returns what it paid */
  recordRaid: (o: { win: boolean; dealt: number; turns: number }) => RaidResult;
}

export interface RaidResult {
  win: boolean;
  dealt: number;
  coins: number;
  gems: number;
  /** this week's wins, this one included */
  wins: number;
  /** the raid card, if it dropped */
  drop: string | null;
}

/** what a claim paid out */
export interface Wallet {
  coins: number;
  gems: number;
}

export interface BattleRewardResult {
  lines: RewardLine[];
  total: number;
  /** gems from the lines above */
  gems: number;
  /** gems from level-ups */
  levelGems: number;
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
  go: (screen) => {
    // each screen change is a history step, so the browser's back returns here
    if (screen !== get().screen && typeof history !== 'undefined')
      try {
        history.pushState({ ab: screen }, '');
      } catch {
        /* no history */
      }
    set({ screen });
  },
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
    const out: number[] = [];
    get().update((s) => {
      for (const cid of cids) {
        const have = s.collection[cid] ?? 0;
        if (have >= MAX_COPIES && !isBasicEnergy(cid)) {
          const coins = DUPE_COINS[card(cid).rarity];
          s.coins += coins;
          out.push(coins);
          continue;
        }
        if (!have) s.newCards.push(cid);
        s.collection[cid] = have + 1;
        out.push(0);
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
  startBattle: (cfg) => set((st) => ({ battle: cfg, screen: 'battle', battleSeq: st.battleSeq + 1 })),
  reset: () => {
    const s = freshSave();
    persist(s);
    set({ save: s, screen: 'title' });
  },
  startRaid: (playerDeck) => {
    const st = get();
    const r = raidNow(st.save.raid);
    const cost = raidCost(r);
    const boss = card(r.bossId) as MonsterCard;
    if (st.save.gems < cost) return false;
    st.update((s) => {
      s.gems -= cost;
      s.raid = { ...r, tries: r.tries + 1 };
    });
    st.startBattle({
      rival: null,
      playerDeck,
      oppDeck: [boss.id],
      oppName: boss.name,
      oppPortrait: boss.art,
      level: 'hard',
      cpuLevel: 7,
      scene: boss.scene ?? 'story/p-the-fall',
      reward: 0,
      raid: { bossId: boss.id, startDamage: 0 },
    });
    return true;
  },
  recordRaid: ({ win, dealt, turns }) => {
    const res: RaidResult = { win, dealt, coins: 0, gems: 0, wins: 0, drop: null };
    get().update((s) => {
      const r = raidNow(s.raid);
      if (win) {
        const n = r.wins + 1;
        const pay = raidWinReward(n);
        res.coins = pay.coins;
        res.gems = pay.gems;
        res.wins = n;
        const drop = rollRaidDrop(r.bossId);
        if (drop) {
          res.drop = drop.id;
          if (!s.collection[drop.id]) s.newCards.push(drop.id);
          s.collection[drop.id] = Math.min(MAX_COPIES, (s.collection[drop.id] ?? 0) + 1);
        }
        s.raid = { ...r, wins: n, best: Math.max(r.best, dealt), fastest: r.fastest ? Math.min(r.fastest, turns) : turns };
      } else {
        res.coins = raidLossCoins(dealt);
        res.wins = r.wins;
        s.raid = { ...r, best: Math.max(r.best, dealt) };
      }
      s.coins += res.coins;
      s.gems += res.gems;
    });
    return res;
  },
  claimLogin: () => {
    const got: Wallet = { coins: 0, gems: 0 };
    get().update((s) => {
      const p = s.progress;
      if (!canClaimLogin(p)) return;
      got.coins = LOGIN_REWARDS[loginSlot(p)];
      got.gems = LOGIN_GEMS[loginSlot(p)];
      p.loginCount++;
      p.loginDay = dayKey();
      s.coins += got.coins;
      s.gems += got.gems;
    });
    return got;
  },
  buyCosmetic: (id) => {
    const c = cosmeticById(id);
    let ok = false;
    get().update((s) => {
      if (!c || s.wardrobe.owned.includes(id) || s.coins < c.price) return;
      s.coins -= c.price;
      s.wardrobe.owned.push(id);
      s.wardrobe[c.kind] = id;
      ok = true;
    });
    return ok;
  },
  equipCosmetic: (id) =>
    get().update((s) => {
      const c = cosmeticById(id);
      if (c && s.wardrobe.owned.includes(id)) s.wardrobe[c.kind] = id;
    }),
  claimMission: (m, period) => {
    const got: Wallet = { coins: 0, gems: 0 };
    get().update((s) => {
      const p = s.progress;
      ensurePeriods(p);
      const ext = extCtx(s);
      p.normalClaimed ??= [];
      p.event ??= { key: '', counters: {}, claimed: [] };
      const list =
        period === 'daily' ? p.daily.claimed : period === 'weekly' ? p.weekly.claimed : period === 'normal' ? p.normalClaimed : period === 'event' ? p.event.claimed : p.achvClaimed;
      if (list.includes(m.id) || missionValue(p, m, period, ext) < m.target) return;
      list.push(m.id);
      got.coins = m.reward;
      got.gems = missionGems(m);
      s.coins += got.coins;
      s.gems += got.gems;
    });
    return got;
  },
  recordPack: (premium) =>
    get().update((s) => {
      bump(s.progress, { packs: 1, premiumPacks: premium ? 1 : 0 });
    }),
  recordBattle: (o, st) => {
    let res: BattleRewardResult = { lines: [], total: 0, gems: 0, levelGems: 0, exp: 0, levelBefore: 1, expBefore: 0, levelUps: [], levelCoins: 0 };
    get().update((s) => {
      const p = s.progress;
      ensurePeriods(p);
      const r = battleReward(p, o);
      res = { ...r, levelGems: 0, levelBefore: p.level, expBefore: p.exp, levelUps: [], levelCoins: 0 };
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
      res.levelGems = ups.reduce((n, l) => n + levelGems(l), 0);
      s.coins += r.total + res.levelCoins;
      s.gems += r.gems + res.levelGems;
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
    if (c.rarity >= 4) stars++;
  }
  return { collectionPct: collectionPct(s), rivals: s.beaten.length, story: s.story.cleared.length, uniques, stars, decks: s.decks.length };
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
// Booster packs: two kinds, both drawing from every chapter (5 cards each)
//   通常パック     150 coins
//   プレミアムパック 450 coins — the last card is ★3 or better, ★4/★5 come far more often
// A drawn card may come as one of its special printings (mirror, full art,
// special art, gold): same card, same ★, only the look is rarer.
// ----------------------------------------------------------------------------
export const PACK_PRICE = 150;
export const PREMIUM_PRICE = 450;
export const PACK_SIZE = 5;

export interface Booster {
  id: 'normal' | 'premium';
  name: string;
  /** card name shown on the pack */
  mascot: string;
  hue: string;
  hue2: string;
  premium?: boolean;
  price: number;
}

export const NORMAL_BOOSTER: Booster = { id: 'normal', name: '通常パック', mascot: 'ヴォルカリオン', hue: '#5ab0ff', hue2: '#0a2a6e', price: PACK_PRICE };
export const PREMIUM_BOOSTER: Booster = { id: 'premium', name: 'プレミアムパック', mascot: 'ドラグーン', hue: '#e9c46a', hue2: '#1c1206', premium: true, price: PREMIUM_PRICE };
export const BOOSTERS: Booster[] = [NORMAL_BOOSTER, PREMIUM_BOOSTER];

export const setName = (set: SetCode) => SET_INFO[set].name;

/**
 * what a pack can give, by ★: the regular cards (★1–★3) with their mirrors,
 * the full-art printings (★3), the special art (★4) and the gold printings (★5)
 */
const BASE_POOL: Record<Rarity, CardDef[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
/** full-art ★3 printings: a ★3 draw becomes one of these now and then */
const FULLART_POOL: CardDef[] = [];
/** each regular card's mirror */
const MIRROR = new Map<string, CardDef>();
for (const c of ALL_CARDS) {
  if (c.kind === 'energy' && c.basic) continue;
  if (c.variant === 'mirror') MIRROR.set(c.baseId!, c);
  else if (c.variant && c.rarity === 3) FULLART_POOL.push(c);
  else BASE_POOL[c.rarity].push(c);
}
/** share of ★3 draws that come as a full art */
const FULLART_SHARE = 0.25;

/** odds per slot: cumulative thresholds, e.g. [[1, 0.8], [2, 1]] */
type Slot = [Rarity, number][];
export const PACK_TABLE: Slot[] = [
  [[1, 0.8], [2, 1]],
  [[1, 0.8], [2, 1]],
  [[1, 0.75], [2, 1]],
  [[2, 0.75], [3, 1]],
  // ★4 about 1 pack in 100, ★5 about 1 in 2000 (with the god pack)
  [[2, 0.4], [3, 0.9896], [4, 0.9996], [5, 1]],
];
export const PREMIUM_TABLE: Slot[] = [
  [[1, 0.5], [2, 0.95], [3, 1]],
  [[1, 0.45], [2, 0.93], [3, 1]],
  [[2, 0.7], [3, 1]],
  // about three times the normal pack: ★4 ~3%, ★5 ~0.15% per pack
  [[3, 0.9895], [4, 0.9995], [5, 1]],
  [[3, 0.979], [4, 0.9992], [5, 1]],
];
/** a very rare pack where every card is ★3 or better */
const GOD_TABLE: Slot[] = [[[3, 1]], [[3, 1]], [[4, 1]], [[4, 1]], [[5, 1]]];
/** chance that a drawn card comes as one of its special printings */
export const PRINTING_CHANCE = 0.08;
export const PREMIUM_PRINTING_CHANCE = 0.16;

function roll(table: Slot): Rarity {
  const r = Math.random();
  for (const [k, p] of table) if (r < p) return k;
  return table[table.length - 1][0];
}

function draw(r: Rarity, printing: number): CardDef {
  const pick = (a: CardDef[]) => a[Math.floor(Math.random() * a.length)];
  if (r === 3 && FULLART_POOL.length && Math.random() < FULLART_SHARE) return pick(FULLART_POOL);
  const pool = BASE_POOL[r].length ? BASE_POOL[r] : BASE_POOL[1];
  const c = pick(pool);
  // a regular card sometimes comes as its mirror (same ★)
  const m = r <= 3 ? MIRROR.get(c.id) : undefined;
  return m && Math.random() < printing ? m : c;
}

export interface PackResult {
  cards: CardDef[];
  god: boolean;
}

export function openPack(b: Booster = NORMAL_BOOSTER): PackResult {
  const premium = !!b.premium;
  const god = Math.random() < (premium ? 0.0003 : 0.0001) || (typeof location !== 'undefined' && location.search.includes('godpack'));
  const table = god ? GOD_TABLE : premium ? PREMIUM_TABLE : PACK_TABLE;
  const cards = table.map((t) => draw(roll(t), premium || god ? PREMIUM_PRINTING_CHANCE : PRINTING_CHANCE));
  cards.sort((x, y) => x.rarity - y.rarity || (x.variant ? 1 : 0) - (y.variant ? 1 : 0));
  return { cards, god };
}

export { RIVALS };
