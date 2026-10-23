import { Save } from '../core/Save';
import { CHARACTERS, MAX_PLUS, MAX_SKILL_LV, RARITY_INFO, inGacha, type CharDef, type Rarity } from './characters';

export const COST_SINGLE = 30000;
export const COST_TEN = 300000;
/** Pulls without an SSR before one is guaranteed. */
/** Coins for a duplicate of a character already at +99. */
export const MAXED_COINS = 2000;
export const PITY = 150;

export interface PullResult {
  def: CharDef;
  isNew: boolean;
  /** Duplicate: skill level went up (to `skill`), like a skill ticket. */
  skillUp: boolean;
  skill: number;
  /** Duplicate of a character at max skill level: limit break went up (to `plus`). */
  plusUp: boolean;
  plus: number;
  /** Already at +99: the copy turns into coins. */
  maxed: boolean;
}

const ORDER: Rarity[] = ['N', 'R', 'SR', 'SSR'];
export const rarityRank = (r: Rarity): number => ORDER.indexOf(r);

function rollRarity(minSR: boolean): Rarity {
  if (Save.data.pity >= PITY - 1) return 'SSR';
  let x = Math.random();
  for (const r of ['SSR', 'SR', 'R', 'N'] as Rarity[]) {
    x -= RARITY_INFO[r].rate;
    if (x < 0) return minSR && rarityRank(r) < 2 ? 'SR' : r;
  }
  return minSR ? 'SR' : 'N';
}

/** Chance of each character per pull (before the 10-pull guarantee and the hidden pity). */
export function charRates(): { def: CharDef; rate: number }[] {
  const pool = gachaPool();
  const out: { def: CharDef; rate: number }[] = [];
  for (const r of ['SSR', 'SR', 'R', 'N'] as Rarity[]) {
    const tier = pool.filter((c) => c.rarity === r);
    const limited = tier.filter((c) => c.limitedUntil);
    const regular = tier.filter((c) => !c.limitedUntil);
    for (const c of tier) {
      const share = limited.length && regular.length ? 0.5 / (c.limitedUntil ? limited.length : regular.length) : 1 / tier.length;
      out.push({ def: c, rate: RARITY_INFO[r].rate * share });
    }
  }
  return out.sort((a, b) => b.rate - a.rate);
}

/** Characters that can come out right now. */
export function gachaPool(): CharDef[] {
  return CHARACTERS.filter((c) => inGacha(c));
}

/** Limited characters in the gacha right now (pick-up). */
export function limitedNow(): CharDef[] {
  return gachaPool().filter((c) => c.limitedUntil);
}

/** One character of a rarity; a limited one gets half of that rarity's pulls while it's out. */
function pickFrom(rarity: Rarity): CharDef {
  const pool = gachaPool().filter((c) => c.rarity === rarity);
  const limited = pool.filter((c) => c.limitedUntil);
  const regular = pool.filter((c) => !c.limitedUntil);
  const from = limited.length && (!regular.length || Math.random() < 0.5) ? limited : regular;
  return from[Math.floor(Math.random() * from.length)];
}

/** Performs the pulls, applies them to the save and returns what was obtained. */
export function pull(n: number): PullResult[] {
  const out: PullResult[] = [];
  for (let i = 0; i < n; i++) {
    const guarantee = n === 10 && i === n - 1 && !out.some((o) => rarityRank(o.def.rarity) >= 2);
    const rarity = rollRarity(guarantee);
    const def = pickFrom(rarity);
    const owned = Save.data.owned[def.id];
    const isNew = !owned;
    // duplicates level the skill first; past max skill level they limit-break, then turn into coins
    const skillUp = !!owned && owned.skill < MAX_SKILL_LV;
    const plusUp = !!owned && !skillUp && owned.plus < MAX_PLUS;
    const maxed = !!owned && !skillUp && !plusUp;
    if (!owned) Save.data.owned[def.id] = { lv: 1, exp: 0, skill: 1, plus: 0, count: 1 };
    else {
      owned.count++;
      if (skillUp) owned.skill++;
      else if (plusUp) owned.plus++;
    }
    const { plus, skill } = Save.data.owned[def.id];
    Save.data.pity = rarity === 'SSR' ? 0 : Save.data.pity + 1;
    Save.data.totalPulls++;
    out.push({ def, isNew, skillUp, skill, plusUp, plus, maxed });
  }
  Save.write();
  return out;
}
