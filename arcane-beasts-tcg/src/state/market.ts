// ============================================================================
// ショップ: things bought with gems, and the record of every payment.
//   • オートバトル: 150 gems a battle (a ticket, or the gems on the spot).
//     The best place to farm (the event's last stage, 270 a win, about half
//     won on auto) comes out just under the price, so auto never prints gems.
//   • デッキレシピ: one the player does not have, at random
// ============================================================================

export const AUTO_PRICE = 150;

export type ItemId = 'auto1' | 'auto5' | 'auto10' | 'recipe';

export interface ShopItem {
  id: ItemId;
  name: string;
  price: number;
  /** auto tickets it gives */
  tickets?: number;
  recipe?: boolean;
  icon: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'auto1', name: 'オートバトルチケット', price: AUTO_PRICE, tickets: 1, icon: 'ticket' },
  { id: 'auto5', name: 'オートバトルチケット ×5', price: 700, tickets: 5, icon: 'ticket' },
  { id: 'auto10', name: 'オートバトルチケット ×10', price: 1350, tickets: 10, icon: 'ticket' },
  { id: 'recipe', name: 'デッキレシピ', price: 300, recipe: true, icon: 'scroll-unfurled' },
];

/** one payment, kept in the save (the newest first, the last 100) */
export interface Purchase {
  at: number;
  label: string;
  /** gems paid (0: a ticket or developer mode) */
  gems: number;
  /** tickets used */
  tickets?: number;
}
