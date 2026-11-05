// The kinds a card list can be narrowed to (collection and deck builder).
import type { CardDef } from '../engine/types';

export type KindKey = 'monster' | 'supporter' | 'item' | 'tool' | 'stadium' | 'energy';

export const CARD_KINDS: { key: KindKey; label: string; match: (c: CardDef) => boolean }[] = [
  { key: 'monster', label: 'モンスター', match: (c) => c.kind === 'monster' },
  { key: 'supporter', label: 'サポーター', match: (c) => c.kind === 'trainer' && c.sub === 'supporter' },
  { key: 'item', label: 'アイテム', match: (c) => c.kind === 'trainer' && c.sub === 'item' },
  { key: 'tool', label: 'どうぐ', match: (c) => c.kind === 'trainer' && c.sub === 'tool' },
  { key: 'stadium', label: 'スタジアム', match: (c) => c.kind === 'trainer' && c.sub === 'stadium' },
  { key: 'energy', label: 'エネルギー', match: (c) => c.kind === 'energy' },
];

/** no kinds picked = everything */
export const matchKinds = (c: CardDef, kinds: KindKey[]) => !kinds.length || CARD_KINDS.some((k) => kinds.includes(k.key) && k.match(c));
