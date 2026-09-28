import { Decimal, D0 } from '../core/decimal';
import type { Game } from '../core/game';
import { BUILDINGS } from '../data/buildings';
import { UPGRADES, UPGRADE_MAP, type UpgradeDef } from '../data/upgrades';

export function gain(g: Game, amount: Decimal): void {
  if (amount.lte(0)) return;
  const s = g.s;
  s.stardust = s.stardust.add(amount);
  s.run.earned = s.run.earned.add(amount);
  s.stats.totalEarned = s.stats.totalEarned.add(amount);
}

// ---------------- 施設 ----------------

function priceStart(g: Game, i: number): Decimal {
  return BUILDINGS[i].baseCost.mul(g.mods.costMult * g.costBuffMult());
}

export function buildingCost(g: Game, i: number, n = 1): Decimal {
  if (n <= 0) return D0;
  return Decimal.sumGeometricSeries(n, priceStart(g, i), g.mods.costScale, g.s.buildings[i]);
}

export function maxAffordable(g: Game, i: number): number {
  const n = Decimal.affordGeometricSeries(g.s.stardust, priceStart(g, i), g.mods.costScale, g.s.buildings[i]);
  const v = n.toNumber();
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

export function buildingVisible(g: Game, i: number): boolean {
  const s = g.s;
  if (i === 0 || s.buildings[i] > 0) return true;
  return s.buildings[i - 1] > 0 || s.run.earned.gte(BUILDINGS[i].baseCost.mul(0.5));
}

/** amount: 購入数。-1 で買えるだけ買う。戻り値は実際に買った数 */
export function buyBuilding(g: Game, i: number, amount: number): number {
  if (!buildingVisible(g, i)) return 0;
  let n = amount;
  if (amount < 0) n = maxAffordable(g, i);
  if (n <= 0) return 0;
  const cost = buildingCost(g, i, n);
  if (cost.gt(g.s.stardust)) return 0;
  g.s.stardust = g.s.stardust.sub(cost);
  g.s.buildings[i] += n;
  g.s.stats.buildingsBought += n;
  g.markDirty();
  return n;
}

// ---------------- アップグレード ----------------

export function upgradeCost(g: Game, u: UpgradeDef): Decimal {
  return u.cost.mul(g.mods.upgradeCostMult);
}

export function availableUpgrades(g: Game): UpgradeDef[] {
  const out: UpgradeDef[] = [];
  for (const u of UPGRADES) {
    if (!g.upgradeSet.has(u.id) && u.unlocked(g)) out.push(u);
  }
  out.sort((a, b) => a.cost.cmp(b.cost));
  return out;
}

export function buyUpgrade(g: Game, id: string): boolean {
  const u = UPGRADE_MAP.get(id);
  if (!u || g.upgradeSet.has(id) || !u.unlocked(g)) return false;
  const cost = upgradeCost(g, u);
  if (cost.gt(g.s.stardust)) return false;
  g.s.stardust = g.s.stardust.sub(cost);
  g.s.upgrades.push(id);
  g.upgradeSet.add(id);
  g.s.stats.upgradesBought++;
  g.markDirty();
  return true;
}

/** 安い順に買えるだけ買う */
export function buyAllUpgrades(g: Game): number {
  let bought = 0;
  for (const u of availableUpgrades(g)) {
    if (upgradeCost(g, u).gt(g.s.stardust)) break;
    if (buyUpgrade(g, u.id)) bought++;
  }
  return bought;
}

// ---------------- クリック ----------------

export function clickValue(g: Game): Decimal {
  const m = g.mods;
  if (m.noClick) return D0;
  return g.sps.mul(m.clickSps).add(m.clickBase).mul(m.click).mul(g.clickBuffMult());
}

export function doClick(g: Game): Decimal {
  const v = clickValue(g);
  gain(g, v);
  g.s.run.clicks++;
  g.s.run.clickEarned = g.s.run.clickEarned.add(v);
  g.s.stats.clicks++;
  g.s.stats.clickEarned = g.s.stats.clickEarned.add(v);
  return v;
}

/** 自動クリック 1 回あたりの価値 (手動の 10%) */
export function autoClickValue(g: Game): Decimal {
  return clickValue(g).mul(0.1 * g.mods.autoClickMult);
}
