import {
  COST,
  CROP_IDS,
  CROPS,
  type CropId,
  EFFECT,
  MANUAL_STAR3_CHANCE,
  MAX_FARMERS,
  QUALITY_MULT,
} from './data';
import { emptyPlot, FARM_HEXES, type GameState, type Plot } from './state';

export const isRipe = (p: Plot) => p.crop !== null && p.growth >= CROPS[p.crop].growSec;

export const growthRatio = (p: Plot) =>
  p.crop === null ? 0 : Math.min(1, p.growth / CROPS[p.crop].growSec);

export function tickGrowth(s: GameState, dt: number): void {
  for (const p of s.plots) if (p.crop) p.growth += dt;
  s.stats.playSec += dt;
}

export const capacity = (s: GameState) => EFFECT.warehouseCap(s.warehouseLv);

export const stock = (s: GameState) =>
  CROP_IDS.reduce((n, id) => n + s.inventory[id][0] + s.inventory[id][1] + s.inventory[id][2], 0);

export const isFull = (s: GameState) => stock(s) >= capacity(s);

export function plant(s: GameState, idx: number, crop: CropId = s.selectedCrop): boolean {
  const p = s.plots[idx];
  if (!p || p.crop || !s.unlocked[crop]) return false;
  p.crop = crop;
  p.growth = 0;
  p.lastCrop = crop;
  return true;
}

export type HarvestResult =
  | { ok: true; crop: CropId; quality: 0 | 1 | 2 }
  | { ok: false; reason: 'not-ripe' | 'full' };

/** 手で収穫すると★2以上、農夫の収穫は★1 */
export function harvest(
  s: GameState,
  idx: number,
  manual: boolean,
  rand: () => number = Math.random,
): HarvestResult {
  const p = s.plots[idx];
  if (!p || !isRipe(p)) return { ok: false, reason: 'not-ripe' };
  if (isFull(s)) return { ok: false, reason: 'full' };
  const crop = p.crop as CropId;
  const quality: 0 | 1 | 2 = manual ? (rand() < MANUAL_STAR3_CHANCE ? 2 : 1) : 0;
  s.inventory[crop][quality] += 1;
  p.crop = null;
  p.growth = 0;
  if (manual) s.stats.manualHarvests++;
  else s.stats.autoHarvests++;
  return { ok: true, crop, quality };
}

export const price = (s: GameState, crop: CropId, quality: number) =>
  CROPS[crop].basePrice * QUALITY_MULT[quality] * EFFECT.breedMult(s.breed[crop]);

export const stockValue = (s: GameState, crop: CropId) =>
  s.inventory[crop].reduce((sum, n, q) => sum + n * price(s, crop, q), 0);

/** 在庫を売ってお金にする。crop を省略するとすべて売る。 */
export function sell(s: GameState, crop?: CropId): number {
  let earned = 0;
  for (const id of crop ? [crop] : CROP_IDS) {
    earned += stockValue(s, id);
    s.inventory[id] = [0, 0, 0];
  }
  s.money += earned;
  s.totalEarned += earned;
  return earned;
}

// ---- アップグレード ----------------------------------------------------

export type UpgradeId = 'expand' | 'hire' | 'train' | 'warehouse';

export function upgradeCost(s: GameState, id: UpgradeId): number | null {
  switch (id) {
    case 'expand':
      return s.plots.length >= FARM_HEXES.length ? null : COST.expand(s.plots.length);
    case 'hire':
      return s.farmers >= MAX_FARMERS ? null : COST.hire(s.farmers);
    case 'train':
      return COST.train(s.farmerLv);
    case 'warehouse':
      return COST.warehouse(s.warehouseLv);
  }
}

function pay(s: GameState, cost: number | null): boolean {
  if (cost === null || s.money < cost) return false;
  s.money -= cost;
  return true;
}

export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  if (!pay(s, upgradeCost(s, id))) return false;
  switch (id) {
    case 'expand':
      s.plots.push(emptyPlot());
      break;
    case 'hire':
      s.farmers++;
      break;
    case 'train':
      s.farmerLv++;
      break;
    case 'warehouse':
      s.warehouseLv++;
      break;
  }
  return true;
}

export function unlockCrop(s: GameState, crop: CropId): boolean {
  if (s.unlocked[crop] || !pay(s, CROPS[crop].unlockCost)) return false;
  s.unlocked[crop] = true;
  return true;
}

export function breedCrop(s: GameState, crop: CropId): boolean {
  if (!s.unlocked[crop] || !pay(s, COST.breed(crop, s.breed[crop]))) return false;
  s.breed[crop]++;
  return true;
}
