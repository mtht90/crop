/** ヒーローの一覧とレア度。ゲーム本体（heroes.ts）とサーバーの両方から使う、描画に依存しないデータ */
export type Rarity = 'R' | 'SR' | 'SSR';
export interface RosterEntry { id: string; name: string; rarity: Rarity }

export const ROSTER: RosterEntry[] = [
  { id: 'gald', name: 'ガルド', rarity: 'R' },
  { id: 'volga', name: 'ボルガ', rarity: 'R' },
  { id: 'lumina', name: 'ルミナ', rarity: 'R' },
  { id: 'ren', name: 'レン', rarity: 'R' },
  { id: 'shade', name: 'シェイド', rarity: 'SR' },
  { id: 'veil', name: 'ヴェイル', rarity: 'SR' },
  { id: 'mio', name: 'ミオ', rarity: 'SR' },
  { id: 'nox', name: 'ノクス', rarity: 'SR' },
  { id: 'pipi', name: 'ピピ', rarity: 'SR' },
  { id: 'mors', name: 'モルス', rarity: 'SSR' },
  { id: 'shirone', name: 'シロネ', rarity: 'SSR' },
  { id: 'kai', name: 'カイ', rarity: 'SSR' },
];
export const rarityOf = (id: string): Rarity => ROSTER.find((r) => r.id === id)?.rarity ?? 'R';
export const nameOf = (id: string) => ROSTER.find((r) => r.id === id)?.name ?? id;
