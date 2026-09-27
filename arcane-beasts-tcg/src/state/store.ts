import { create } from 'zustand';
import { ALL_CARDS, card } from '../engine/cards';
import { expand, RIVALS, STARTER_DECKS, type Rival } from '../engine/decks';
import type { Difficulty } from '../engine/ai';
import type { CardDef, Rarity } from '../engine/types';

export type Screen = 'title' | 'starter' | 'home' | 'rivals' | 'battle' | 'deck' | 'collection' | 'shop' | 'settings' | 'credits' | 'rules' | 'gallery';

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
}

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
}

const KEY = 'arcane-beasts-save-v1';

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
    settings: { music: 0.5, sfx: 0.8, speed: 1 },
    started: false,
  };
}

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...freshSave(), ...JSON.parse(raw) };
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
  battleSeq: number;
  go: (s: Screen) => void;
  update: (f: (s: Save) => void) => void;
  chooseStarter: (deckId: string) => void;
  addCards: (cids: string[]) => void;
  startBattle: (cfg: BattleConfig) => void;
  reset: () => void;
}

export const useStore = create<Store>((set, get) => ({
  screen: 'title',
  save: load(),
  battle: null,
  battleSeq: 0,
  go: (screen) => set({ screen }),
  update: (f) => {
    const s = structuredClone(get().save);
    f(s);
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
  addCards: (cids) =>
    get().update((s) => {
      for (const cid of cids) {
        if (!s.collection[cid]) s.newCards.push(cid);
        s.collection[cid] = (s.collection[cid] ?? 0) + 1;
      }
    }),
  startBattle: (cfg) => set((st) => ({ battle: cfg, screen: 'battle', battleSeq: st.battleSeq + 1 })),
  reset: () => {
    const s = freshSave();
    persist(s);
    set({ save: s, screen: 'title' });
  },
}));

export function activeDeck(s: Save): SavedDeck | undefined {
  return s.decks.find((d) => d.id === s.activeDeck) ?? s.decks[0];
}

export function owned(s: Save, cid: string) {
  const c = card(cid);
  if (c.kind === 'energy' && c.basic) return 99;
  return s.collection[cid] ?? 0;
}

// ----------------------------------------------------------------------------
// Booster packs
// ----------------------------------------------------------------------------
export const PACK_PRICE = 150;
export const PACK_SIZE = 10;

const pool = (r: Rarity) => ALL_CARDS.filter((c) => c.rarity === r && !(c.kind === 'energy' && c.basic));

export function openPack(): CardDef[] {
  const pickFrom = (arr: CardDef[]) => arr[Math.floor(Math.random() * arr.length)];
  const C = pool('C');
  const U = pool('U');
  const out: CardDef[] = [];
  for (let i = 0; i < 6; i++) out.push(pickFrom(C));
  for (let i = 0; i < 3; i++) out.push(pickFrom(U));
  const r = Math.random();
  const rareR: Rarity = r < 0.03 ? 'UR' : r < 0.1 ? 'SR' : r < 0.32 ? 'RR' : 'R';
  out.push(pickFrom(pool(rareR)));
  // small chance of a second hit replacing an uncommon
  if (Math.random() < 0.12) out[8] = pickFrom(pool(Math.random() < 0.8 ? 'R' : 'RR'));
  return out;
}

export const RARITY_ORDER: Record<Rarity, number> = { C: 0, U: 1, R: 2, RR: 3, SR: 4, UR: 5 };

export { RIVALS };
