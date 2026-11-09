// ============================================================================
// ショップ: everything bought with gems, and the record of every payment.
//   • オートバトル: 150 gems a battle (a ticket, or the gems on the spot).
//     The best place to farm (the event's last stage, 270 a win, about half
//     won on auto) comes out just under the price, so auto never prints gems.
//   • 日替わり: four cards a day (★3, ★2, ★2, ★1), one of each, the same for
//     everyone on that day
//   • セット: a starter set (once) and a weekly set, cheaper than their parts
//   • アイテム: tickets, a デッキレシピ, イベントのかけら
// ============================================================================
import { MAIN_SET } from '../engine/cards';
import type { CardDef, Rarity } from '../engine/types';
import { dayKey, weekKey } from './progress';

export const AUTO_PRICE = 150;
export const RECIPE_PRICE = 300;

export type ItemId = 'auto1' | 'auto5' | 'auto10' | 'recipe' | 'shards10' | 'starter' | 'weekly';

export interface ShopItem {
  id: ItemId;
  name: string;
  price: number;
  /** what it holds */
  tickets?: number;
  recipes?: number;
  shards?: number;
  icon: string;
  /** how often it can be bought: once ever, once a week (else without limit) */
  limit?: 'once' | 'weekly';
  /** the gems its parts would cost on their own */
  worth?: number;
  /** a short line under the name */
  note?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'starter', name: 'スタートダッシュセット', price: 900, tickets: 5, recipes: 2, icon: 'crown', limit: 'once', worth: 700 + 2 * RECIPE_PRICE, note: 'チケット×5・デッキレシピ×2' },
  { id: 'weekly', name: '週替わりセット', price: 450, tickets: 3, shards: 20, icon: 'chest', limit: 'weekly', worth: 3 * AUTO_PRICE + 200, note: 'チケット×3・イベントのかけら×20' },
  { id: 'auto1', name: 'オートバトルチケット', price: AUTO_PRICE, tickets: 1, icon: 'ticket' },
  { id: 'auto5', name: 'オートバトルチケット ×5', price: 700, tickets: 5, icon: 'ticket', worth: 5 * AUTO_PRICE },
  { id: 'auto10', name: 'オートバトルチケット ×10', price: 1350, tickets: 10, icon: 'ticket', worth: 10 * AUTO_PRICE },
  { id: 'recipe', name: 'デッキレシピ', price: RECIPE_PRICE, recipes: 1, icon: 'scroll-unfurled', note: '持っていないレシピから1つ' },
  { id: 'shards10', name: 'イベントのかけら ×10', price: 100, shards: 10, icon: 'shard', note: '開催中のイベントの交換所で使えます' },
];

/** the key a limited item is counted under right now ('' = no limit) */
export const limitKey = (it: ShopItem, now = new Date()) => (it.limit === 'once' ? 'once' : it.limit === 'weekly' ? weekKey(now) : '');

/** the price of a card in the 日替わり, by ★ */
export const DEAL_PRICE: Record<number, number> = { 1: 40, 2: 80, 3: 250 };

export interface Deal {
  cid: string;
  price: number;
}

/** today's four cards: the same for everyone on that day */
export function dailyDeals(day = dayKey()): Deal[] {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = (r: Rarity) => MAIN_SET.filter((c: CardDef) => c.rarity === r && !(c.kind === 'energy' && c.basic));
  const out: Deal[] = [];
  for (const r of [3, 2, 2, 1] as Rarity[]) {
    const p = pool(r).filter((c) => !out.some((d) => d.cid === c.id));
    const c = p[Math.floor(rnd() * p.length)];
    if (c) out.push({ cid: c.id, price: DEAL_PRICE[r] });
  }
  return out;
}

/** one payment, kept in the save (the newest first, the last 100) */
export interface Purchase {
  at: number;
  label: string;
  /** gems paid (0: a ticket or developer mode) */
  gems: number;
  /** tickets used */
  tickets?: number;
}
