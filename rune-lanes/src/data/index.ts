import cardsJson from './cards.json';
import balanceJson from './balance.json';
import decksJson from './decks.json';
import manifestJson from './assets-manifest.json';
import type { Balance, CardDef } from '../core/types';

export const CARDS = cardsJson as CardDef[];
export const BALANCE = balanceJson as Balance;
export const DECKS = decksJson as { player: string[]; cpu: string[] };

export interface AssetSource {
  id: string;
  name: string;
  author: string;
  url: string;
  license: string;
  licenseUrl: string;
  category: 'A' | 'B';
}

export interface AssetEntry {
  key: string;
  path: string;
  source: string;
  original: string;
  license: string;
}

export interface Manifest {
  sources: AssetSource[];
  images: AssetEntry[];
  spritesheets: (AssetEntry & { frameWidth: number; frameHeight: number })[];
  audio: AssetEntry[];
  fonts: AssetEntry[];
}

export const MANIFEST = manifestJson as unknown as Manifest;

export function cardById(id: string): CardDef {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card: ${id}`);
  return c;
}
