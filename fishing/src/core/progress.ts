import { SPECIES, SPECIES_BY_ID } from '../data/species';
import { COOLER_LEVELS } from '../data/tackle';
import type { Species } from '../data/types';
import { GRADE_RANK, priceOf, type FishInstance } from '../sim/individual';
import type { CatchRecord, SaveData } from './save';

export interface CatchResult {
  newSpecies: boolean;
  newColor: boolean;
  newPattern: boolean;
  bestLength: boolean;
  bestWeight: boolean;
  bestGrade: boolean;
  rewards: { label: string; money: number }[];
  price: number;
}

const SPECIES_MILESTONES = [5, 10, 15, 20, 21];
const VARIANT_MILESTONES = [1, 3, 5, 10, 20];

export function variantKey(id: string | null): string {
  return id ?? 'normal';
}

/** 図鑑に登録する（釣り上げた時点で呼ぶ） */
export function registerCatch(save: SaveData, fish: FishInstance, s: Species, record: CatchRecord): CatchResult {
  const prev = save.dex[s.id];
  const res: CatchResult = {
    newSpecies: !prev,
    newColor: false,
    newPattern: false,
    bestLength: false,
    bestWeight: false,
    bestGrade: false,
    rewards: [],
    price: priceOf(s, fish),
  };
  const colorKey = variantKey(fish.colorId);
  const patternKey = variantKey(fish.patternId);
  if (!prev) {
    save.dex[s.id] = {
      count: 1,
      bestLength: fish.length,
      bestWeight: fish.weight,
      bestGrade: fish.grade,
      first: record,
      best: record,
      colors: [colorKey],
      patterns: [patternKey],
    };
    res.newColor = fish.colorId !== null;
    res.newPattern = fish.patternId !== null;
  } else {
    prev.count++;
    if (fish.length > prev.bestLength) {
      prev.bestLength = fish.length;
      prev.best = record;
      res.bestLength = true;
    }
    if (fish.weight > prev.bestWeight) {
      prev.bestWeight = fish.weight;
      res.bestWeight = true;
    }
    if (GRADE_RANK[fish.grade] > GRADE_RANK[prev.bestGrade]) {
      prev.bestGrade = fish.grade;
      res.bestGrade = true;
    }
    if (!prev.colors.includes(colorKey)) {
      prev.colors.push(colorKey);
      res.newColor = fish.colorId !== null;
    }
    if (!prev.patterns.includes(patternKey)) {
      prev.patterns.push(patternKey);
      res.newPattern = fish.patternId !== null;
    }
  }
  save.stats.caught++;
  res.rewards = claimRewards(save);
  return res;
}

export interface Completion {
  species: number;
  speciesTotal: number;
  variants: number;
  variantsTotal: number;
}

export function completion(save: SaveData, spot?: string): Completion {
  const list = spot ? SPECIES.filter((s) => s.spot === spot) : SPECIES;
  let species = 0;
  let variants = 0;
  let variantsTotal = 0;
  for (const s of list) {
    variantsTotal += s.colors.length + s.patterns.length;
    const e = save.dex[s.id];
    if (!e) continue;
    species++;
    variants += e.colors.filter((c) => c !== 'normal').length + e.patterns.filter((p) => p !== 'normal').length;
  }
  return { species, speciesTotal: list.length, variants, variantsTotal };
}

function claimRewards(save: SaveData): { label: string; money: number }[] {
  const out: { label: string; money: number }[] = [];
  const c = completion(save);
  for (const n of SPECIES_MILESTONES) {
    const id = `species-${n}`;
    if (c.species >= n && !save.rewards.includes(id)) {
      save.rewards.push(id);
      const money = n * 400;
      save.money += money;
      out.push({ label: `図鑑登録 ${n} 種達成`, money });
    }
  }
  for (const n of VARIANT_MILESTONES) {
    const id = `variant-${n}`;
    if (c.variants >= n && !save.rewards.includes(id)) {
      save.rewards.push(id);
      const money = n * 1000;
      save.money += money;
      out.push({ label: `色違い・模様違い ${n} 種発見`, money });
    }
  }
  return out;
}

export function coolerCapacity(save: SaveData): number {
  return COOLER_LEVELS[save.coolerLevel].capacity;
}

export function addToCooler(save: SaveData, fish: FishInstance, record: CatchRecord): boolean {
  if (save.cooler.length >= coolerCapacity(save)) return false;
  save.cooler.push({ ...fish, record });
  return true;
}

/** リリース：売値の2割を放流協力金として受け取る */
export function releaseValue(fish: FishInstance): number {
  const s = SPECIES_BY_ID[fish.speciesId];
  return Math.max(1, Math.round(priceOf(s, fish) * 0.2));
}

export function release(save: SaveData, fish: FishInstance): number {
  const v = releaseValue(fish);
  save.money += v;
  save.stats.released++;
  save.stats.earned += v;
  return v;
}

export function sellFromCooler(save: SaveData, uids: string[]): number {
  let total = 0;
  save.cooler = save.cooler.filter((f) => {
    if (!uids.includes(f.uid)) return true;
    total += priceOf(SPECIES_BY_ID[f.speciesId], f);
    return false;
  });
  save.money += total;
  save.stats.earned += total;
  return total;
}
