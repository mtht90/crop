// ============================================================================
// ピックアップパック: every two weeks two ★4 monsters come more often (the レア
// パック's odds). Each pack pulled gives one 交換P; PICKUP_POINT_COST of them
// buy one of the two cards. The points belong to that pickup only.
// ============================================================================
import { card } from '../engine/cards';
import type { Booster } from './store';

export interface Pickup {
  title: string;
  cards: [string, string];
  scene: string;
  hue: string;
  hue2: string;
}

export const PICKUPS: Pickup[] = [
  { title: '紅蓮と星詠み', cards: ['AB1-011-SAR', 'AB3-051-SAR'], scene: 'story/p-fire-sky', hue: '#ff6a4a', hue2: '#3a0a2a' },
  { title: '深淵の潮', cards: ['AB1-014-SAR', 'AB2-009-SAR'], scene: 'story/landscape-coast', hue: '#4ab0ff', hue2: '#06203a' },
  { title: '夜の王たち', cards: ['AB2-034-SAR', 'AB2-055-SAR'], scene: 'story/swamp-01', hue: '#b06aff', hue2: '#1a0630' },
  { title: '竜騎の誓い', cards: ['AB2-004-SAR', 'AB3-043-SAR'], scene: 'story/p-drake-fleet', hue: '#ffb44a', hue2: '#2a1404' },
  { title: '森の守り手', cards: ['AB3-036-SAR', 'AB2-046-SAR'], scene: 'story/p-great-tree', hue: '#6ad08a', hue2: '#06240f' },
  { title: '荒野の覇者', cards: ['AB3-064-SAR', 'AB2-030-SAR'], scene: 'story/landscape-mountains-03', hue: '#e08a4a', hue2: '#2a1206' },
];

/** 2026-11-09 00:00 in Japan: the first pickup starts here */
const ANCHOR = Date.UTC(2026, 10, 8, 15, 0, 0);
export const PICKUP_SPAN_MS = 14 * 24 * 3600_000;
/** 交換P for one card */
export const PICKUP_POINT_COST = 200;

export function pickupNow(now = Date.now()): Pickup & { key: string; ends: number } {
  const k = Math.floor((now - ANCHOR) / PICKUP_SPAN_MS);
  const p = PICKUPS[((k % PICKUPS.length) + PICKUPS.length) % PICKUPS.length];
  return { ...p, key: `pu-${k}`, ends: ANCHOR + (k + 1) * PICKUP_SPAN_MS };
}

export const isPickup = (b: Booster) => b.id.startsWith('pickup');

/** the pickup pack on sale now */
export function pickupBooster(price: number, now = Date.now()): Booster {
  const p = pickupNow(now);
  return { id: `pickup-${p.key}`, name: `ピックアップ「${p.title}」`, mascot: card(p.cards[0]).name, hue: p.hue, hue2: p.hue2, premium: true, price, pickup: [...p.cards], label: 'PICKUP' };
}

/** the points held for the pickup on sale now */
export function pickupPoints(saved: { key: string; n: number } | undefined, now = Date.now()) {
  return saved && saved.key === pickupNow(now).key ? saved.n : 0;
}
