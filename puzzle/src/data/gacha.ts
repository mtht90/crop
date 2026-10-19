import { Save } from '../core/Save';
import { CHARACTERS, MAX_LV, RARITY_INFO, levelFromCount, type CharDef, type Rarity } from './characters';

export const COST_SINGLE = 100;
export const COST_TEN = 1000;
/** Pulls without an SSR before one is guaranteed. */
export const PITY = 80;

export interface PullResult {
  def: CharDef;
  isNew: boolean;
  lvUp: boolean;
  lv: number;
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

/** Performs the pulls, applies them to the save and returns what was obtained. */
export function pull(n: number): PullResult[] {
  const out: PullResult[] = [];
  for (let i = 0; i < n; i++) {
    const guarantee = n === 10 && i === n - 1 && !out.some((o) => rarityRank(o.def.rarity) >= 2);
    const rarity = rollRarity(guarantee);
    const pool = CHARACTERS.filter((c) => c.rarity === rarity);
    const def = pool[Math.floor(Math.random() * pool.length)];
    const owned = Save.data.owned[def.id];
    const isNew = !owned;
    const before = owned?.lv ?? 0;
    const count = (owned?.count ?? 0) + 1;
    const lv = levelFromCount(count);
    Save.data.owned[def.id] = { lv, count };
    Save.data.pity = rarity === 'SSR' ? 0 : Save.data.pity + 1;
    Save.data.totalPulls++;
    out.push({ def, isNew, lvUp: !isNew && lv > before, lv, maxed: before >= MAX_LV });
  }
  Save.write();
  return out;
}
