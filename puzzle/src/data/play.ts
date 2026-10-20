import { Save } from '../core/Save';

// ------------------------------------------------------------------ lives
export const MAX_LIVES = 5;
/** One life comes back every 10 minutes. */
export const LIFE_MS = 10 * 60 * 1000;

/** Applies refills that happened while away. */
export function refreshLives(now = Date.now()): void {
  const d = Save.data;
  if (d.lives >= MAX_LIVES) {
    d.lifeAt = 0;
    return;
  }
  if (!d.lifeAt) d.lifeAt = now;
  const n = Math.floor((now - d.lifeAt) / LIFE_MS);
  if (n <= 0) return;
  d.lives = Math.min(MAX_LIVES, d.lives + n);
  d.lifeAt = d.lives >= MAX_LIVES ? 0 : d.lifeAt + n * LIFE_MS;
  Save.write();
}

export function lives(): number {
  refreshLives();
  return Save.data.lives;
}

/** Milliseconds until the next life (0 when full). */
export function nextLifeIn(now = Date.now()): number {
  refreshLives(now);
  const d = Save.data;
  return d.lives >= MAX_LIVES ? 0 : Math.max(0, d.lifeAt + LIFE_MS - now);
}

export function spendLife(): boolean {
  refreshLives();
  const d = Save.data;
  if (d.lives <= 0) return false;
  if (d.lives >= MAX_LIVES) d.lifeAt = Date.now();
  d.lives--;
  Save.write();
  return true;
}

export function fmtTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ items
export type ItemId = 'score' | 'coin' | 'time';

export interface PlayItem {
  id: ItemId;
  name: string;
  desc: string;
  price: number;
}

/** Bought before a round (Tsum Tsum-style boosts). */
export const ITEMS: PlayItem[] = [
  { id: 'score', name: 'スコアアップ', desc: 'スコア +10%', price: 500 },
  { id: 'coin', name: 'コインアップ', desc: 'もらえるコイン +30%', price: 500 },
  { id: 'time', name: 'じかんえんちょう', desc: 'じかん +5びょう', price: 1000 },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<ItemId, PlayItem>;
