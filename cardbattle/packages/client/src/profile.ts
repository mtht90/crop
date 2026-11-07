import { loadContent, type ReplayData } from '@cardbattle/sim';

/** 端末に保存するプレイヤー情報（トロフィー・デッキ・直近のリプレイ） */
export interface Profile {
  name: string;
  trophies: number;
  deck: string[];
  lastReplay: ReplayData | null;
}

const KEY = 'rune-arena-profile-v1';
const content = loadContent();

function load(): Profile {
  const fallback: Profile = { name: 'あなた', trophies: 0, deck: content.starterDeck.slice(), lastReplay: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = { ...fallback, ...(JSON.parse(raw) as Partial<Profile>) };
    // 存在しないカードが入っていたら初期デッキに戻す
    if (p.deck.length !== content.rules.deckSize || p.deck.some((id) => !content.cards.get(id))) p.deck = fallback.deck;
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
