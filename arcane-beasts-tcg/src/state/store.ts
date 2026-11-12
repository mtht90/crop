import type { FxLevel } from '../lib/fx';
import type { MatchInfo } from '../online/client';
import type { Beat } from '../story/types';
import { create } from 'zustand';
import { ALL_CARDS, card, CARDS, MAIN_SET, SET_INFO, SETS } from '../engine/cards';
import { RAID_CARDS } from '../engine/cards/bosses';
import { EVENT_CARDS } from '../engine/cards/events';
import { cpuPrintTier, deckById, expand, upgradeDeck, RIVALS, STARTER_DECKS, type Rival } from '../engine/decks';
import type { Difficulty } from '../engine/ai';
import { allRecipes, pickRecipe } from './recipes';
import { AUTO_PRICE, dailyDeals, DEFAULT_DECK_SLOTS, leftOf, limitKey, MAX_DECK_SLOTS, SHOP_ITEMS, type ItemId, type Purchase } from './market';
import { cleanWardrobe, COSMETICS, cosmeticById, freshWardrobe, type Wardrobe } from './cosmetics';
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
  missionCoins,
  LOGIN_COINS,
  levelCoins,
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
  OLD_COIN_SCALE,
} from './progress';
import { currentStageEvent, EVENT_CARD_DROP, rollShards, shopOf, STAGE_COUNT, stageNow, stagesOf, type StageSave } from './stages';
import { blessMods, currentTower, floorsOf, TOWER_TITLE, towerNow, type TowerSave } from './tower';
import { raidBattleGems, raidCost, raidLapBonus, raidLapHp, raidLapReward, raidNow, raidSession, rollRaidDrop, type RaidSave } from './raid';

// ----------------------------------------------------------------------------
// Copies beyond MAX_COPIES are sold for coins on the spot (by ★).
// ----------------------------------------------------------------------------
export const ECON_VERSION = 4;
export const MAX_COPIES = 10;
export const DUPE_COINS: Record<Rarity, number> = { 1: 5, 2: 10, 3: 30, 4: 100, 5: 300 };
/** what the old かけら (shards) are worth now that they are gone, per shard */
const SHARD_COINS: Record<string, number> = { C: 10, U: 10, R: 15, RR: 30, RRR: 30, ST: 50, ST2: 60, CR: 80, AR: 50, CHR: 50, S: 50, SR: 50, SAR: 80, UR: 80 };
const CARDS_OK = (cid: string) => cid in CARDS;
const isBasicEnergy = (cid: string) => {
  const c = card(cid);
  return c.kind === 'energy' && c.basic;
};

export type Screen = 'arena' | 'story' | 'scene' | 'lobby' | 'title' | 'starter' | 'home' | 'rivals' | 'battle' | 'deck' | 'collection' | 'shop' | 'missions' | 'more' | 'settings' | 'credits' | 'rules' | 'gallery' | 'wardrobe' | 'raid' | 'stage' | 'store' | 'dex' | 'tower';

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
  /** play alongside other apps' sound (a YouTube picture-in-picture keeps going); on unless turned off */
  mixAudio?: boolean;
  /** send the moves of your games (no name) to improve the CPU; on unless turned off */
  shareMoves?: boolean;
}

export interface Save {
  v: 1;
  /** economy version (2: the coin scale-up) */
  econ?: number;
  /** ランクマッチ: the last season whose reward was taken */
  rankPaid?: string;
  /** the player's icon (battles, online profile) */
  avatar?: string;
  /** オートバトル tickets */
  autoTickets?: number;
  /** the battle (its battleSeq) whose オートバトル is paid for: never twice for one battle */
  autoPaidSeq?: number;
  /** every payment, newest first */
  purchases?: Purchase[];
  /** limited shop items bought: item → the period and how many */
  shopBought?: Record<string, { key: string; n: number } | string>;
  /** パックチケット: プレミアム and ★3確定 */
  packTickets?: { premium?: number; sure3?: number };
  /** 交換P of the pickup on sale (reset when the pickup changes) */
  pickupPts?: { key: string; n: number };
  /** decks that can be saved (DEFAULT_DECK_SLOTS when unset) */
  deckSlots?: number;
  /** 日替わり cards bought today: the day and the cards */
  dealsBought?: { day: string; cids: string[] };
  /** デッキレシピ owned, and the ones not yet shown to the player */
  recipes?: string[];
  recipeInbox?: string[];
  /** コイン: abolished — always 0 (old saves moved theirs into gems) */
  coins: number;
  /** ジェム: the one currency — packs and looks; earned by all play */
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
  /** today's free 通常パック (2 a day, a few hours apart) */
  freePacks?: { day: string; used: number; last: number };
  newCards: string[];
  settings: Settings;
  started: boolean;
  guideSeen?: boolean;
  /** お知らせ: the newest entry opened, and the day the start-up popup was turned off */
  newsSeen?: string;
  /** this week's boss raid */
  raid?: RaidSave;
  /** this fortnight's stage event */
  stages?: StageSave;
  /** 覇王の塔: the highest floor cleared this period */
  tower?: TowerSave;
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
  raid?: { bossId: string; startDamage: number; hp: number; bonus: number; lap: number };
  /** ランクマッチの認定戦 (against a bot; the result goes to the server) */
  placement?: boolean;
  /** a stage of the stage event (its rule is in mods) */
  stage?: { key: string; index: number; mods: import('../engine/types').BattleMods };
  /** a floor of 覇王の塔 */
  tower?: { key: string; floor: number; mods: import('../engine/types').BattleMods };
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
export { DEV_CODE } from '../online/protocol';
const DEV_COINS = 9_999_999;
const DEV_GEMS = 999_999;

/** developer mode tops coins and gems back up once they run low (spending still shows) */
function refill(s: Save) {
  if ((s.coins ?? 0) < 100_000) s.coins = DEV_COINS;
  if ((s.gems ?? 0) < 50_000) s.gems = DEV_GEMS;
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
  // every CPU level beaten, this event's stages all cleared, the whole wardrobe, every card
  s.cpuBeaten = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  s.stages = { ...stageNow(s.stages), cleared: STAGE_COUNT };
  s.wardrobe = { ...s.wardrobe, owned: [...new Set([...s.wardrobe.owned, ...COSMETICS.map((c) => c.id)])] };
  grantAllCards(s);
  s.recipes = allRecipes().map((r) => r.id);
  refill(s);
}

/** every printing, up to the copy limit */
/** cards outside the chapters (raid and event cards): その他 in the collection */
export const OTHER_CARDS = [...RAID_CARDS, ...EVENT_CARDS];

/** how many decks can be saved */
export const deckSlotsOf = (s: Pick<Save, 'deckSlots' | 'decks'>) => Math.max(s.deckSlots ?? DEFAULT_DECK_SLOTS, s.decks.length);

/** give a デッキレシピ the player does not have yet (`prefer` when it is new to them) */
export function grantRecipe(s: Save, prefer?: string): string | null {
  const r = pickRecipe(s.recipes ?? [], prefer);
  if (!r) return null;
  s.recipes = [...(s.recipes ?? []), r.id];
  s.recipeInbox = [...(s.recipeInbox ?? []), r.id];
  return r.id;
}

export function grantAllCards(s: Save) {
  for (const c of [...ALL_CARDS, ...OTHER_CARDS]) {
    if (c.kind === 'energy' && c.basic) continue;
    if (!s.collection[c.id]) s.newCards.push(c.id);
    s.collection[c.id] = Math.max(s.collection[c.id] ?? 0, 4);
  }
}

function freshSave(): Save {
  return {
    v: 1,
    econ: ECON_VERSION,
    coins: 0,
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
      // cards that no longer exist (a chapter renumbered while it was new) leave the save
      for (const cid of Object.keys(s.collection)) if (!CARDS_OK(cid)) delete s.collection[cid];
      for (const d of s.decks) {
        d.cards = d.cards.filter(CARDS_OK);
        if (!CARDS_OK(d.cover)) d.cover = d.cards[0] ?? 'AB1-001';
      }
      // gems arrived later: what a player had in coins (which bought packs until now) carries over 1:1
      if (typeof parsed.gems !== 'number') s.gems = Math.max(0, parsed.coins ?? 0);
      // the economy redesign: everyday coins pay out 5× what they did, so do the coins already saved
      // coins are gone: what is saved turns into gems at the old (pre-gem) value
      if ((parsed.econ ?? 1) < 3) {
        const was = (parsed.econ ?? 1) >= 2 ? Math.floor(s.coins / OLD_COIN_SCALE) : s.coins;
        s.gems += Math.max(0, was);
        s.coins = 0;
      }
      // ぷにぷに準拠: a pack went from 150 to 500 gems, so saved gems buy as many packs as before
      if ((parsed.econ ?? 1) < 4) s.gems = Math.round((s.gems * 10) / 3);
      s.econ = ECON_VERSION;
      s.wardrobe = cleanWardrobe(s.wardrobe);
      // anything over the cap is sold
      for (const [cid, n] of Object.entries(s.collection)) {
        if (n > MAX_COPIES && CARDS_OK(cid) && !isBasicEnergy(cid)) {
          s.gems += DUPE_COINS[card(cid).rarity] * (n - MAX_COPIES);
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
  /** a battle's own id (when it started): what an オートバトル payment is tied to */
  battleId: number;
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
  /** buy from the ショップ: false when the gems are short or it is sold out */
  buyItem: (id: ItemId) => { ok: boolean; recipe?: string };
  /** buy one of today's 日替わり cards */
  buyDeal: (cid: string) => boolean;
  /**
   * pay for this battle's オートバトル: a ticket if there is one, else the gems.
   * Paying twice for one battle is impossible ('already').
   */
  payAuto: (seq: number) => 'paid' | 'ticket' | 'already' | 'short';
  equipCosmetic: (id: string) => void;
  recordPack: (premium: boolean) => void;
  recordBattle: (o: BattleOutcome, st: Partial<Stats>) => BattleRewardResult;
  /** a surrender: a loss, and nothing else (no gems, EXP or mission progress) */
  recordSurrender: () => void;
  /** pay for a raid try and start it (false = not enough gems) */
  startRaid: (playerDeck: string[]) => boolean;
  /** pay out a raid battle; returns what it paid */
  recordRaid: (o: { win: boolean; dealt: number }) => RaidResult;
  /** start stage i of the stage event (false = not open yet) */
  startStage: (i: number, playerDeck: string[]) => boolean;
  /** climb to a floor of 覇王の塔 (1…30; false = not open yet) */
  startTower: (floor: number, playerDeck: string[]) => boolean;
  /** pay out a tower floor */
  recordTower: (o: { win: boolean; floor: number; key: string }) => TowerResult;
  /** pay out a stage battle */
  recordStage: (o: { win: boolean; index: number; key: string }) => StageResult;
  /** trade shards at the exchange (false = not enough / sold out) */
  tradeStage: (itemId: string) => boolean;
}

export interface TowerResult {
  win: boolean;
  /** the first clear of this floor */
  first: boolean;
  gems: number;
  coins: number;
  tickets?: { premium?: number; sure3?: number };
  /** the tower's card (the top floor) */
  card?: string;
}

export interface StageResult {
  /** coins of a first clear */
  coins?: number;
  win: boolean;
  /** gems for clearing this stage the first time */
  gems: number;
  /** gems every win pays */
  winGems: number;
  shards: number;
  /** the event card, if the great boss dropped it */
  drop: string | null;
  /** this was the first clear (a new stage opened) */
  first: boolean;
}

export interface RaidResult {
  /** coins of a cleared lap */
  coins?: number;
  /** the lap was cleared */
  win: boolean;
  /** damage done in this battle */
  dealt: number;
  /** gems for the damage */
  gems: number;
  /** gems for clearing the lap */
  lapGems: number;
  /** the lap fought */
  lap: number;
  /** the boss's damage after the battle, and its HP on that lap */
  damage: number;
  hp: number;
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
  battleId: 0,
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
          s.gems += coins;
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
  startBattle: (cfg) => set((st) => ({ battle: cfg, screen: 'battle', battleSeq: st.battleSeq + 1, battleId: Date.now() })),
  reset: () => {
    const s = freshSave();
    persist(s);
    set({ save: s, screen: 'title' });
  },
  startStage: (i, playerDeck) => {
    const st = get();
    const sv = stageNow(st.save.stages);
    if (i > sv.cleared) return false;
    const { ev, key } = currentStageEvent();
    const stage = stagesOf(ev)[i];
    st.update((s) => {
      s.stages = sv;
    });
    st.startBattle({
      rival: null,
      playerDeck,
      oppDeck: upgradeDeck(expand(deckById(stage.deck)!.cards), cpuPrintTier(stage.cpu)),
      oppName: `${stage.label} ${stage.name}`,
      oppPortrait: stage.portrait,
      level: stage.cpu >= 7 ? 'hard' : stage.cpu >= 4 ? 'normal' : 'easy',
      cpuLevel: stage.cpu,
      scene: ev.bg,
      reward: 0,
      stage: { key, index: i, mods: stage.mods },
    });
    return true;
  },
  startTower: (floor, playerDeck) => {
    const st = get();
    const sv = towerNow(st.save.tower);
    const { t, key, open } = currentTower();
    if (!open || floor < 1 || floor > sv.cleared + 1) return false;
    const f = floorsOf(t)[floor - 1];
    st.update((s) => {
      s.tower = sv;
    });
    st.startBattle({
      rival: null,
      playerDeck,
      oppDeck: upgradeDeck(expand(deckById(f.deck)!.cards), f.tier),
      oppName: `${f.n}階 ${f.name}`,
      oppPortrait: f.portrait,
      level: 'hard',
      cpuLevel: f.cpu,
      scene: t.bg,
      reward: 0,
      tower: { key, floor, mods: blessMods(t, f.mods) },
    });
    return true;
  },
  recordTower: ({ win, floor, key }) => {
    const res: TowerResult = { win, first: false, gems: 0, coins: 0 };
    if (!win) return res;
    get().update((s) => {
      const sv = towerNow(s.tower);
      // the tower changed while this battle ran: nothing to pay into
      if (sv.key !== key || floor !== sv.cleared + 1) return;
      const f = floorsOf(currentTower().t)[floor - 1];
      res.first = true;
      res.gems = f.gems;
      res.coins = f.coins;
      res.tickets = f.tickets;
      s.gems += f.gems;
      s.coins += f.coins;
      if (f.tickets) s.packTickets = { premium: (s.packTickets?.premium ?? 0) + (f.tickets.premium ?? 0), sure3: (s.packTickets?.sure3 ?? 0) + (f.tickets.sure3 ?? 0) };
      if (f.card) {
        res.card = f.card;
        if (!s.collection[f.card]) s.newCards.push(f.card);
        s.collection[f.card] = Math.min(MAX_COPIES, (s.collection[f.card] ?? 0) + 1);
        if (!s.wardrobe.owned.includes(TOWER_TITLE)) s.wardrobe = { ...s.wardrobe, owned: [...s.wardrobe.owned, TOWER_TITLE] };
      }
      s.tower = { key: sv.key, cleared: floor };
    });
    return res;
  },
  recordStage: ({ win, index, key }) => {
    const res: StageResult = { win, gems: 0, winGems: 0, shards: 0, drop: null, first: false };
    if (!win) return res;
    get().update((s) => {
      const sv = stageNow(s.stages);
      // the event changed while this battle ran: nothing to pay into
      if (sv.key !== key) return;
      const { ev } = currentStageEvent();
      const stage = stagesOf(ev)[index];
      if (index === sv.cleared) {
        res.first = true;
        res.gems = stage.gems;
        res.coins = 300 + index * 50;
        s.coins += res.coins;
        sv.cleared = index + 1;
        if (index % 5 === 4) grantRecipe(s);
      }
      res.winGems = stage.winGems;
      res.shards = rollShards(index);
      sv.shards += res.shards;
      if (index === stagesOf(ev).length - 1 && Math.random() < EVENT_CARD_DROP) {
        res.drop = ev.card;
        if (!s.collection[ev.card]) s.newCards.push(ev.card);
        s.collection[ev.card] = Math.min(MAX_COPIES, (s.collection[ev.card] ?? 0) + 1);
      }
      s.gems += res.gems + res.winGems;
      s.stages = { ...sv };
    });
    return res;
  },
  tradeStage: (itemId) => {
    let ok = false;
    get().update((s) => {
      const sv = stageNow(s.stages);
      const item = shopOf(currentStageEvent().ev).find((x) => x.id === itemId);
      if (!item) return;
      const n = sv.bought[item.id] ?? 0;
      if (n >= item.limit || sv.shards < item.cost) return;
      sv.shards -= item.cost;
      sv.bought = { ...sv.bought, [item.id]: n + 1 };
      if (item.card) {
        if (!s.collection[item.card]) s.newCards.push(item.card);
        s.collection[item.card] = Math.min(MAX_COPIES, (s.collection[item.card] ?? 0) + 1);
      }
      if (item.gems) s.gems += item.gems;
      s.stages = { ...sv };
      ok = true;
    });
    return ok;
  },
  startRaid: (playerDeck) => {
    const st = get();
    // no session running: nothing to fight
    if (!raidSession()) return false;
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
      raid: { bossId: boss.id, startDamage: r.damage, hp: raidLapHp(r.laps + 1), bonus: raidLapBonus(r.laps + 1), lap: r.laps + 1 },
    });
    return true;
  },
  recordRaid: ({ win, dealt }) => {
    const res: RaidResult = { win, dealt, gems: 0, lapGems: 0, lap: 0, damage: 0, hp: 0, drop: null };
    get().update((s) => {
      const r = raidNow(s.raid);
      const lap = r.laps + 1;
      const hp = raidLapHp(lap);
      res.lap = lap;
      res.hp = hp;
      res.gems = raidBattleGems(dealt);
      if (win) {
        res.lapGems = raidLapReward(lap);
        res.coins = 1000;
        s.coins += res.coins;
        res.damage = hp;
        grantRecipe(s);
        const drop = rollRaidDrop(r.bossId);
        if (drop) {
          res.drop = drop.id;
          if (!s.collection[drop.id]) s.newCards.push(drop.id);
          s.collection[drop.id] = Math.min(MAX_COPIES, (s.collection[drop.id] ?? 0) + 1);
        }
        s.raid = { ...r, laps: lap, damage: 0, best: Math.max(r.best, dealt) };
      } else {
        // whatever was knocked off stays off (the boss keeps at least 10 HP)
        res.damage = Math.min(hp - 10, r.damage + dealt);
        s.raid = { ...r, damage: res.damage, best: Math.max(r.best, dealt) };
      }
      s.gems += res.gems + res.lapGems;
    });
    return res;
  },
  claimLogin: () => {
    const got: Wallet = { coins: 0, gems: 0 };
    get().update((s) => {
      const p = s.progress;
      if (!canClaimLogin(p)) return;
      got.coins = LOGIN_COINS[loginSlot(p)];
      got.gems = LOGIN_REWARDS[loginSlot(p)] + LOGIN_GEMS[loginSlot(p)];
      // the 7th day also brings a デッキレシピ
      if (loginSlot(p) === 6) grantRecipe(s);
      p.loginCount++;
      p.loginDay = dayKey();
      s.gems += got.gems;
      s.coins += got.coins;
    });
    return got;
  },
  buyItem: (id) => {
    const item = SHOP_ITEMS.find((x) => x.id === id);
    let res: { ok: boolean; recipe?: string } = { ok: false };
    get().update((s) => {
      if (!item) return;
      const coin = item.currency === 'coin';
      if ((coin ? s.coins : s.gems) < item.price) return;
      if (leftOf(item, s.shopBought) <= 0) return;
      const g = item.give;
      if (g.slots && deckSlotsOf(s) >= MAX_DECK_SLOTS) return;
      // the price, what it holds and the record change together
      const paid = s.dev ? 0 : item.price;
      if (coin) s.coins -= paid;
      else s.gems -= paid;
      if (g.tickets) s.autoTickets = (s.autoTickets ?? 0) + g.tickets;
      if (g.premium || g.sure3) s.packTickets = { premium: (s.packTickets?.premium ?? 0) + (g.premium ?? 0), sure3: (s.packTickets?.sure3 ?? 0) + (g.sure3 ?? 0) };
      if (g.coins) s.coins += g.coins;
      if (g.slots) s.deckSlots = Math.min(MAX_DECK_SLOTS, deckSlotsOf(s) + g.slots);
      let recipe: string | undefined;
      for (let i = 0; i < (g.recipes ?? 0); i++) recipe = grantRecipe(s) ?? recipe;
      if (g.shards) s.stages = { ...stageNow(s.stages), shards: stageNow(s.stages).shards + g.shards };
      const lk = limitKey(item);
      if (lk) {
        const prev = s.shopBought?.[item.id];
        const n = typeof prev === 'object' && prev.key === lk ? prev.n : prev === lk ? 1 : 0;
        s.shopBought = { ...(s.shopBought ?? {}), [item.id]: { key: lk, n: n + 1 } };
      }
      s.purchases = [{ at: Date.now(), label: item.name, gems: coin ? 0 : paid, coins: coin ? paid : undefined }, ...(s.purchases ?? [])].slice(0, 100);
      res = { ok: true, recipe };
    });
    return res;
  },
  buyDeal: (cid) => {
    let ok = false;
    get().update((s) => {
      const day = dayKey();
      const deal = dailyDeals(day).find((d) => d.cid === cid);
      const bought = s.dealsBought?.day === day ? s.dealsBought.cids : [];
      if (!deal || bought.includes(cid) || s.gems < deal.price) return;
      const paid = s.dev ? 0 : deal.price;
      s.gems -= paid;
      if (!s.collection[cid]) s.newCards.push(cid);
      const n = (s.collection[cid] ?? 0) + 1;
      // past the copy limit the card is sold back at once, like a pack's
      if (n > MAX_COPIES) {
        s.gems += DUPE_COINS[card(cid).rarity];
        s.collection[cid] = MAX_COPIES;
      } else s.collection[cid] = n;
      s.dealsBought = { day, cids: [...bought, cid] };
      s.purchases = [{ at: Date.now(), label: `日替わり：${card(cid).name}`, gems: paid }, ...(s.purchases ?? [])].slice(0, 100);
      ok = true;
    });
    return ok;
  },
  payAuto: (seq) => {
    let res: 'paid' | 'ticket' | 'already' | 'short' = 'short';
    get().update((s) => {
      if (s.autoPaidSeq === seq) return void (res = 'already');
      if ((s.autoTickets ?? 0) > 0) {
        s.autoTickets = (s.autoTickets ?? 0) - 1;
        s.autoPaidSeq = seq;
        s.purchases = [{ at: Date.now(), label: 'オートバトル', gems: 0, tickets: 1 }, ...(s.purchases ?? [])].slice(0, 100);
        return void (res = 'ticket');
      }
      if (s.gems < AUTO_PRICE && !s.dev) return void (res = 'short');
      const paid = s.dev ? 0 : AUTO_PRICE;
      s.gems -= paid;
      s.autoPaidSeq = seq;
      s.purchases = [{ at: Date.now(), label: 'オートバトル', gems: paid }, ...(s.purchases ?? [])].slice(0, 100);
      res = 'paid';
    });
    return res;
  },
  buyCosmetic: (id) => {
    const c = cosmeticById(id);
    let ok = false;
    get().update((s) => {
      if (!c || s.wardrobe.owned.includes(id) || s.gems < c.price) return;
      s.gems -= c.price;
      s.wardrobe.owned.push(id);
      s.wardrobe[c.kind] = id;
      s.purchases = [{ at: Date.now(), label: `見た目：${c.name}`, gems: c.price }, ...(s.purchases ?? [])].slice(0, 100);
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
      got.coins = missionCoins(m);
      got.gems = missionGems(m);
      s.gems += got.gems;
      s.coins += got.coins;
      // weekly missions and achievements also bring a デッキレシピ
      if (period === 'weekly' || period === 'achv') grantRecipe(s);
    });
    return got;
  },
  recordPack: (premium) =>
    get().update((s) => {
      bump(s.progress, { packs: 1, premiumPacks: premium ? 1 : 0 });
    }),
  recordSurrender: () =>
    get().update((s) => {
      s.progress.streak = 0;
      s.losses++;
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
      // level-ups pay their old coin bonus as gems too
      res.levelCoins = ups.reduce((n, l) => n + levelCoins(l), 0);
      res.levelGems = ups.reduce((n, l) => n + levelReward(l) + levelGems(l), 0);
      for (const l of ups) if (l % 5 === 0) grantRecipe(s);
      s.gems += r.gems + res.levelGems;
      s.coins += r.total + res.levelCoins;
    });
    return res;
  },
}));

/** Collection progress over every printing (mirrors included) */
export function collectionPct(s: Save, set?: SetCode) {
  // the whole collection counts the その他 cards (raid and event cards) too
  const list = set ? ALL_CARDS.filter((c) => c.set === set) : [...ALL_CARDS, ...OTHER_CARDS];
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
//   レアパック 450 coins — the last card is ★3 or better, ★4/★5 come far more often
// A drawn card may come as one of its special printings (mirror, full art,
// special art, gold): same card, same ★, only the look is rarer.
// ----------------------------------------------------------------------------
export const PACK_PRICE = 500;
export const PREMIUM_PRICE = 500;
/** 10連 costs 9 packs (ぷにぷに: 1回500・10連4,500) */
export const TEN_PACKS = 9;

// ----------------------------------------------------------------------------
// Free packs: 2 通常パック a day. The second one opens a few hours after the
// first; both come back at the start of the next day.
// ----------------------------------------------------------------------------
export const FREE_PACKS_PER_DAY = 2;
export const FREE_PACK_GAP_MS = 4 * 60 * 60 * 1000;
export interface FreePackState {
  /** free packs left today */
  left: number;
  /** one can be opened right now */
  ready: boolean;
  /** when the next one opens (ms), if one is left but waiting */
  readyAt: number | null;
}
export function freePackState(s: Pick<Save, 'freePacks'>, now = Date.now()): FreePackState {
  const f = s.freePacks;
  const used = f && f.day === dayKey(new Date(now)) ? f.used : 0;
  const left = Math.max(0, FREE_PACKS_PER_DAY - used);
  if (left === 0) return { left, ready: false, readyAt: null };
  const at = used > 0 && f ? f.last + FREE_PACK_GAP_MS : 0;
  return at > now ? { left, ready: false, readyAt: at } : { left, ready: true, readyAt: null };
}
export const PACK_SIZE = 5;

export interface Booster {
  id: string;
  name: string;
  /** card name shown on the pack */
  mascot: string;
  hue: string;
  hue2: string;
  /** the premium odds (the last card ★3 or better) */
  premium?: boolean;
  /** the daily free pack (never bought) */
  free?: boolean;
  /** gems for one pack */
  price: number;
  /** gems for ten (when not the usual 9 packs' worth) */
  tenPrice?: number;
  /** its own odds table */
  table?: 'special';
  /** which cards it can hold (all when unset) */
  only?: (c: CardDef) => boolean;
  /** cards that come more often within their ★ */
  pickup?: string[];
  /** the last card is ★3 or better (★3確定チケット) */
  sure3?: boolean;
  /** the word on the pack */
  label?: string;
  /** what it is, a line each */
  lines?: string[];
}

export const NORMAL_BOOSTER: Booster = { id: 'normal', name: '通常パック', mascot: 'ヴォルカリオン', hue: '#5ab0ff', hue2: '#0a2a6e', price: PACK_PRICE, free: true, label: 'STANDARD' };
export const PREMIUM_BOOSTER: Booster = { id: 'premium', name: 'レアパック', mascot: 'ドラグーン', hue: '#e9c46a', hue2: '#1c1206', premium: true, price: PREMIUM_PRICE, label: 'RARE' };
/** スペシャルパック: the last two cards ★3 or better, ★4 and ★5 about twice the レアパック's */
export const SPECIAL_PRICE = 800;
export const SPECIAL_BOOSTER: Booster = { id: 'special', name: 'スペシャルパック', mascot: 'ドラグーン', hue: '#b98cff', hue2: '#12052a', premium: true, table: 'special', price: SPECIAL_PRICE, tenPrice: 7980, label: 'SPECIAL' };
/** opened with a ★3確定チケット: a 通常パック whose last card is ★3 or better */
export const SURE3_BOOSTER: Booster = { ...NORMAL_BOOSTER, id: 'sure3', name: '★3確定パック', free: false, sure3: true, price: 0, hue: '#c890ff', hue2: '#2a0e4a', label: '★3 GUARANTEED' };

/** タイプ別パック: one type's monsters and every trainer, at the 通常パック's odds */
const TYPE_PACKS: [EType, string, string, string][] = [
  ['fire', '炎', '#ff7a45', '#3a0c02'],
  ['water', '水', '#4fb4ff', '#04223f'],
  ['grass', '草', '#6fd16a', '#0b2a0a'],
  ['lightning', '雷', '#ffd84a', '#2e2400'],
  ['psychic', '超', '#d07bff', '#24073a'],
  ['fighting', '闘', '#d6935a', '#2b1305'],
  ['dark', '悪', '#8f9bb8', '#0b0e18'],
  ['colorless', '無色', '#e8e8f0', '#1c1c26'],
];
export const TYPE_PACK_PRICE = 300;
const mascotOf = (only: (c: CardDef) => boolean) =>
  (MAIN_SET.filter((c): c is MonsterCard => c.kind === 'monster' && only(c)).sort((a, b) => (b.ace ? 1 : 0) - (a.ace ? 1 : 0) || b.hp - a.hp)[0]?.name) ?? 'ヴォルカリオン';
export const TYPE_BOOSTERS: Booster[] = TYPE_PACKS.map(([t, jp, hue, hue2]) => {
  const only = (c: CardDef) => c.kind !== 'monster' || c.type === t;
  return { id: `type-${t}`, name: `${jp}のパック`, mascot: mascotOf((c) => c.kind === 'monster' && c.type === t), hue, hue2, price: TYPE_PACK_PRICE, only, label: `${jp.toUpperCase()} PACK`, lines: [`${jp}タイプのモンスターとトレーナーズだけが出る`, '★の出やすさは通常パックと同じ', '5枚入り'] };
});

/** 章パック: one chapter's cards, at the レアパック's odds */
export const CHAPTER_BOOSTERS: Booster[] = SETS.map((code, i) => {
  const only = (c: CardDef) => c.set === code;
  const hues = [['#e9c46a', '#1c1206'], ['#9ad0ff', '#0a1a33'], ['#d58bff', '#1d0730'], ['#ff8a5a', '#2a0c06']][i] ?? ['#e9c46a', '#1c1206'];
  return { id: `ch-${code}`, name: `${SET_INFO[code].short}パック`, mascot: mascotOf((c) => c.kind === 'monster' && c.set === code), hue: hues[0], hue2: hues[1], premium: true, price: PREMIUM_PRICE, only, label: SET_INFO[code].code, lines: [`${SET_INFO[code].short}「${SET_INFO[code].name}」のカードだけが出る`, '5枚目は★3以上確定', '★の出やすさはレアパックと同じ'] };
});

/** the packs the shop lists first */
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
/** a special printing → the card it is a printing of (for a pack's card filter) */
const MIRROR_BASE = new Map<string, CardDef>();
for (const c of ALL_CARDS) if (c.baseId) MIRROR_BASE.set(c.id, ALL_CARDS.find((x) => x.id === c.baseId) ?? c);
/** share of ★3 draws that come as a full art */
const FULLART_SHARE = 0.25;

/** odds per slot: cumulative thresholds, e.g. [[1, 0.8], [2, 1]] */
type Slot = [Rarity, number][];
export const PACK_TABLE: Slot[] = [
  [[1, 0.8], [2, 1]],
  [[1, 0.8], [2, 1]],
  [[1, 0.75], [2, 1]],
  [[1, 0.4], [2, 1]],
  // ★3 about 1 pack in 3, ★4 about 1 in 100, ★5 about 1 in 2000 (with the god pack)
  [[2, 0.7], [3, 0.9896], [4, 0.9996], [5, 1]],
];
export const PREMIUM_TABLE: Slot[] = [
  [[1, 0.5], [2, 1]],
  [[1, 0.45], [2, 1]],
  [[1, 0.2], [2, 1]],
  // the last card is always ★3 or better; ★4 ~3%, ★5 ~0.15% per pack
  [[2, 0.6], [3, 0.9895], [4, 0.9995], [5, 1]],
  [[3, 0.979], [4, 0.9992], [5, 1]],
];
export const SPECIAL_TABLE: Slot[] = [
  [[1, 0.35], [2, 1]],
  [[2, 0.8], [3, 1]],
  [[2, 0.5], [3, 1]],
  // ★4 ~6%, ★5 ~0.35% a pack
  [[3, 0.97], [4, 0.998], [5, 1]],
  [[3, 0.9685], [4, 0.9985], [5, 1]],
];
/** the ★3確定チケット's pack: the 通常パック, but the last card is ★3 or better */
export const SURE3_TABLE: Slot[] = [...PACK_TABLE.slice(0, 4), [[3, 0.9896], [4, 0.9996], [5, 1]]];
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

/** a pickup card of the drawn ★ comes this often */
const PICKUP_SHARE = 0.5;

function draw(r: Rarity, printing: number, only?: (c: CardDef) => boolean, pickup?: string[]): CardDef {
  const pick = (a: CardDef[]) => a[Math.floor(Math.random() * a.length)];
  const fits = (c: CardDef) => !only || only(MIRROR_BASE.get(c.id) ?? c);
  const fa = FULLART_POOL.filter(fits);
  if (r === 3 && fa.length && Math.random() < FULLART_SHARE) return pick(fa);
  const ups = (pickup ?? []).map((id) => BASE_POOL[r].find((c) => c.id === id)).filter((c): c is CardDef => !!c);
  if (ups.length && Math.random() < PICKUP_SHARE) return pick(ups);
  let pool = BASE_POOL[r].filter(fits);
  if (!pool.length) pool = BASE_POOL[r].length ? BASE_POOL[r] : BASE_POOL[1];
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
  const table = god ? GOD_TABLE : b.table === 'special' ? SPECIAL_TABLE : premium ? PREMIUM_TABLE : b.sure3 ? SURE3_TABLE : PACK_TABLE;
  const cards = table.map((t) => draw(roll(t), premium || god ? PREMIUM_PRINTING_CHANCE : PRINTING_CHANCE, b.only, b.pickup));
  cards.sort((x, y) => x.rarity - y.rarity || (x.variant ? 1 : 0) - (y.variant ? 1 : 0));
  return { cards, god };
}

export { RIVALS };
