// Shop packs. The server side is the source of truth for prices and contents;
// src/data/shop.ts mirrors this list for display only.
export interface Pack {
  id: string;
  name: string;
  jpy: number;
  coins: number;
  lives: number;
}

export const PACKS: Pack[] = [
  { id: 'coin_s', name: 'コイン 30,000', jpy: 120, coins: 30000, lives: 0 },
  { id: 'coin_m', name: 'コイン 130,000', jpy: 480, coins: 130000, lives: 0 },
  { id: 'coin_l', name: 'コイン 280,000', jpy: 980, coins: 280000, lives: 0 },
  { id: 'coin_xl', name: 'コイン 600,000', jpy: 1960, coins: 600000, lives: 0 },
  { id: 'coin_xxl', name: 'コイン 1,600,000', jpy: 4900, coins: 1600000, lives: 0 },
  { id: 'life_s', name: 'ライフ ×5', jpy: 120, coins: 0, lives: 5 },
  { id: 'life_l', name: 'ライフ ×25', jpy: 480, coins: 0, lives: 25 },
];

export const PACK_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p]));
