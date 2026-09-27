import { itemDef } from '../data/items';
import type { Archetype } from '../data/customers';
import { rng } from '../core/util';
import type { GameModel } from './model';
import type { ItemState } from './state';
import { claimedValue, trueValue } from './valuation';

/** 買い手から見た商品の価値 */
export function perceivedValue(m: GameModel, it: ItemState, arch: Archetype, prestige = 0): number {
  const def = itemDef(it.defId);
  const trend = m.trend(def.category);
  const real = trueValue(it, trend);
  const claimed = claimedValue(it, trend);
  const k = arch.knowledge;
  let v = real * k + claimed * (1 - k);
  if (arch.fav.includes(def.category)) v *= 1.15;
  if (prestige && (def.category === 'brand' || def.category === 'antique')) v *= 1 + prestige;
  v *= 0.9 + m.state.reputation / 500;
  // 客は少し高めでも「欲しい」と思う (リサイクル品はお得感が大事)
  v *= rng.range(0.98, 1.25);
  return v;
}

/** 値札を見て買う確率 */
export function buyChance(m: GameModel, it: ItemState, arch: Archetype, price: number, prestige = 0): number {
  const def = itemDef(it.defId);
  if (arch.id === 'reseller') {
    const real = trueValue(it, m.trend(def.category));
    return price < real * 0.62 ? 0.9 : 0.02;
  }
  const v = perceivedValue(m, it, arch, prestige);
  const ratio = price / v;
  return 1 / (1 + Math.exp((ratio - 1.02) * 4.5 * arch.priceSensitivity));
}

/** 売り手の希望額・最低ライン */
export function sellerTerms(m: GameModel, it: ItemState, arch: Archetype) {
  const def = itemDef(it.defId);
  const trend = m.trend(def.category);
  // 売り手は本物・動作品として主張する (知識があれば壊れていることは自覚)
  const claimed = claimedValue(it, trend);
  const real = trueValue(it, trend);
  const knowsBroken = def.electronic && !it.working && rng.chance(arch.knowledge);
  const base = knowsBroken ? real * 1.4 : claimed;
  const noise = 1 + rng.gauss(0, (1 - arch.knowledge) * 0.35);
  const est = Math.max(50, base * noise);
  const ask = Math.max(100, est * 0.62 * arch.greed);
  const reserve = Math.max(50, est * (arch.id === 'mover' ? 0.25 : arch.id === 'elder' ? 0.28 : 0.37) * arch.greed);
  return { ask, reserve, knowsBroken };
}
