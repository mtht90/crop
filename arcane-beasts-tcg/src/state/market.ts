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

export type ItemId = string;

/** what an item gives */
export interface Give {
  /** オートバトルチケット */
  tickets?: number;
  recipes?: number;
  shards?: number;
  /** レアパックチケット */
  premium?: number;
  /** ★3確定チケット */
  sure3?: number;
  coins?: number;
  /** デッキ枠 */
  slots?: number;
}

export interface ShopItem {
  id: ItemId;
  name: string;
  price: number;
  /** paid in gems (default) or coins (交換所) */
  currency?: 'gem' | 'coin';
  give: Give;
  icon: string;
  /** where it is listed */
  section: 'set' | 'item' | 'exchange';
  /** how many can be bought: ever, a week or a day */
  limit?: { per: 'once' | 'week' | 'day'; n: number };
  /** the gems its parts would cost on their own */
  worth?: number;
  /** a short line under the name */
  note?: string;
}

export const PREMIUM_TICKET_WORTH = 500;
export const SURE3_PRICE = 350;
export const SLOT_COINS = 3000;
export const DEFAULT_DECK_SLOTS = 10;
export const MAX_DECK_SLOTS = 40;

export const SHOP_ITEMS: ShopItem[] = [
  // お得なセット
  { id: 'starter', section: 'set', name: 'スタートダッシュセット', price: 980, give: { premium: 3, tickets: 5, coins: 10000 }, icon: 'crown', limit: { per: 'once', n: 1 }, worth: 3 * PREMIUM_TICKET_WORTH + 700 + 500, note: 'レアパックチケット×3・オートチケット×5・コイン×10,000' },
  { id: 'weekly', section: 'set', name: '週替わりセット', price: 450, give: { tickets: 3, shards: 20 }, icon: 'chest', limit: { per: 'week', n: 1 }, worth: 3 * AUTO_PRICE + 200, note: 'オートチケット×3・イベントのかけら×20' },
  { id: 'sure3-set', section: 'set', name: '★3確定セット', price: 900, give: { sure3: 3 }, icon: 'stars', limit: { per: 'week', n: 1 }, worth: 3 * SURE3_PRICE, note: '★3確定チケット×3' },
  // アイテム (gems)
  { id: 'premium1', section: 'item', name: 'レアパックチケット', price: PREMIUM_TICKET_WORTH, give: { premium: 1 }, icon: 'ticket', note: 'レアパックを1回引ける' },
  { id: 'sure3', section: 'item', name: '★3確定チケット', price: SURE3_PRICE, give: { sure3: 1 }, icon: 'stars', note: '5枚目が★3以上の通常パックを1回引ける' },
  { id: 'auto1', section: 'item', name: 'オートバトルチケット', price: AUTO_PRICE, give: { tickets: 1 }, icon: 'robot' },
  { id: 'auto5', section: 'item', name: 'オートバトルチケット ×5', price: 700, give: { tickets: 5 }, icon: 'robot', worth: 5 * AUTO_PRICE },
  { id: 'auto10', section: 'item', name: 'オートバトルチケット ×10', price: 1350, give: { tickets: 10 }, icon: 'robot', worth: 10 * AUTO_PRICE },
  { id: 'recipe', section: 'item', name: 'デッキレシピ', price: RECIPE_PRICE, give: { recipes: 1 }, icon: 'scroll-unfurled', note: '持っていないレシピから1つ' },
  { id: 'shards10', section: 'item', name: 'イベントのかけら ×10', price: 100, give: { shards: 10 }, icon: 'shard', note: '開催中のイベントの交換所で使えます' },
  { id: 'slot-gem', section: 'item', name: 'デッキ枠 +1', price: 200, give: { slots: 1 }, icon: 'deck', note: `デッキを保存できる数が増えます（最大${MAX_DECK_SLOTS}）` },
  // 交換所 (coins)
  { id: 'x-slot', section: 'exchange', currency: 'coin', name: 'デッキ枠 +1', price: SLOT_COINS, give: { slots: 1 }, icon: 'deck', note: `最大${MAX_DECK_SLOTS}まで` },
  { id: 'x-auto', section: 'exchange', currency: 'coin', name: 'オートバトルチケット', price: 1500, give: { tickets: 1 }, icon: 'robot', limit: { per: 'day', n: 3 } },
  { id: 'x-sure3', section: 'exchange', currency: 'coin', name: '★3確定チケット', price: 6000, give: { sure3: 1 }, icon: 'stars', limit: { per: 'week', n: 3 } },
  { id: 'x-premium', section: 'exchange', currency: 'coin', name: 'レアパックチケット', price: 10000, give: { premium: 1 }, icon: 'ticket', limit: { per: 'week', n: 2 } },
  { id: 'x-shards', section: 'exchange', currency: 'coin', name: 'イベントのかけら ×5', price: 800, give: { shards: 5 }, icon: 'shard', limit: { per: 'day', n: 5 } },
];

/** the key a limited item is counted under right now ('' = no limit) */
export const limitKey = (it: ShopItem, now = new Date()) => (!it.limit ? '' : it.limit.per === 'once' ? 'once' : it.limit.per === 'week' ? weekKey(now) : dayKey(now));
/** how many more can be bought now (Infinity without a limit) */
export function leftOf(it: ShopItem, bought: Record<string, { key: string; n: number } | string> | undefined, now = new Date()) {
  if (!it.limit) return Infinity;
  const b = bought?.[it.id];
  const key = limitKey(it, now);
  const n = typeof b === 'string' ? (b === key ? 1 : 0) : b && b.key === key ? b.n : 0;
  return Math.max(0, it.limit.n - n);
}

/** ジェム購入 (the buy screen only: payment is not open yet) */
export const GEM_PRODUCTS = [
  { yen: 160, gems: 400 },
  { yen: 480, gems: 1250 },
  { yen: 980, gems: 2600 },
  { yen: 1960, gems: 5400 },
  { yen: 2940, gems: 8200 },
  { yen: 4900, gems: 14000 },
];

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
  /** coins paid (交換所) */
  coins?: number;
}
