import { loadContent, type ReplayData } from '@cardbattle/sim';

export interface SavedReplay {
  id: string;
  date: number;
  names: [string, string];
  crowns: [number, number];
  /** この端末のプレイヤーが何番だったか */
  me: number;
  winner: number;
  data: ReplayData;
}

/** 端末に保存するプレイヤー情報（名前・トロフィー・デッキ・リプレイ） */
export interface Profile {
  name: string;
  trophies: number;
  deck: string[];
  replays: SavedReplay[];
}

const KEY = 'rune-arena-profile-v1';
const MAX_REPLAYS = 5;
const content = loadContent();

function load(): Profile {
  const fallback: Profile = { name: 'あなた', trophies: 0, deck: content.starterDeck.slice(), replays: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = { ...fallback, ...(JSON.parse(raw) as Partial<Profile>) };
    // 存在しないカードや重複が入っていたら初期デッキに戻す
    const ok = p.deck.length === content.rules.deckSize && new Set(p.deck).size === p.deck.length && p.deck.every((id) => content.cards.get(id));
    if (!ok) p.deck = fallback.deck;
    if (!Array.isArray(p.replays)) p.replays = [];
    return p;
  } catch {
    return fallback;
  }
}

export const profile = load();

export function saveProfile(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* プライベートモードなどで保存できない場合は無視 */
  }
}

export function addReplay(r: Omit<SavedReplay, 'id' | 'date'>): void {
  profile.replays.unshift({ ...r, id: Math.random().toString(36).slice(2), date: Date.now() });
  profile.replays.length = Math.min(profile.replays.length, MAX_REPLAYS);
  saveProfile();
}
