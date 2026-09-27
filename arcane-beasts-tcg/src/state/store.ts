import { create } from 'zustand';
import { ALL_CARDS, card } from '../engine/cards';
import { expand, RIVALS, STARTER_DECKS, type Rival } from '../engine/decks';
import type { Difficulty } from '../engine/ai';
import type { CardDef, EType, Rarity } from '../engine/types';

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
// Booster packs (5 cards, the last slot is the rare slot)
// ----------------------------------------------------------------------------
export const PACK_PRICE = 75;
export const PACK_SIZE = 5;

export interface Booster {
  id: string;
  name: string;
  mascot: string; // card name shown on the pack
  types: EType[]; // featured types (drawn twice as often)
  hue: string; // accent colour for the pack art
  hue2: string;
}

export const BOOSTERS: Booster[] = [
  { id: 'blaze', name: '紅蓮パック', mascot: 'ヴォルカリオン', types: ['fire', 'fighting'], hue: '#ff6a2b', hue2: '#7a1405' },
  { id: 'abyss', name: '深淵パック', mascot: 'リヴァイアサーペント', types: ['water', 'lightning'], hue: '#39a8ff', hue2: '#0a2a6e' },
  { id: 'grove', name: '古樹パック', mascot: 'エンシェントウッド', types: ['grass', 'psychic', 'dark'], hue: '#7fdc5a', hue2: '#123f1a' },
];

const pool = (r: Rarity) => ALL_CARDS.filter((c) => c.rarity === r && !(c.kind === 'energy' && c.basic));

function featured(c: CardDef, b: Booster) {
  return (c.kind === 'monster' && b.types.includes(c.type)) || (c.kind === 'energy' && b.types.includes(c.energyType));
}

function pickWeighted(arr: CardDef[], b: Booster): CardDef {
  const w = arr.map((c) => (featured(c, b) ? 2 : 1));
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

export interface PackResult {
  cards: CardDef[];
  god: boolean;
}

export function openPack(b: Booster = BOOSTERS[0]): PackResult {
  const god = Math.random() < 0.005 || (typeof location !== 'undefined' && location.search.includes('godpack'));
  const slots: [Rarity, number][][] = god
    ? [
        [['RR', 0.6], ['SR', 1]],
        [['RR', 0.6], ['SR', 1]],
        [['RR', 0.5], ['SR', 1]],
        [['SR', 0.7], ['UR', 1]],
        [['SR', 0.4], ['UR', 1]],
      ]
    : [
        [['C', 0.9], ['U', 1]],
        [['C', 0.85], ['U', 1]],
        [['C', 0.75], ['U', 1]],
        [['U', 0.72], ['R', 0.94], ['RR', 1]],
        [['R', 0.64], ['RR', 0.89], ['SR', 0.97], ['UR', 1]],
      ];
  const cards = slots.map((t) => pickWeighted(pool(roll(t)), b));
  cards.sort((x, y) => RARITY_ORDER[x.rarity] - RARITY_ORDER[y.rarity]);
  return { cards, god };
}

export const RARITY_ORDER: Record<Rarity, number> = { C: 0, U: 1, R: 2, RR: 3, SR: 4, UR: 5 };

export { RIVALS };
