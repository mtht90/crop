import { CROP_IDS, CROPS, type CropId, START_PLOTS, MAX_FARM_RING } from './data';
import { spiral, type Hex } from './hex';

/** 買える畑の位置。plots[i] は FARM_HEXES[i] にある。 */
export const FARM_HEXES: Hex[] = spiral(MAX_FARM_RING);

export interface Plot {
  crop: CropId | null;
  /** 植えてから経過した成長秒数 */
  growth: number;
  /** 最後に植えた作物。農夫は同じ作物を植え直す */
  lastCrop: CropId | null;
}

type PerCrop<T> = Record<CropId, T>;

export interface GameState {
  version: 1;
  money: number;
  totalEarned: number;
  plots: Plot[];
  /** 作物ごとの在庫 [★1, ★2, ★3] */
  inventory: PerCrop<[number, number, number]>;
  unlocked: PerCrop<boolean>;
  breed: PerCrop<number>;
  farmers: number;
  farmerLv: number;
  warehouseLv: number;
  selectedCrop: CropId;
  stats: { manualHarvests: number; autoHarvests: number; playSec: number };
}

const perCrop = <T>(f: (id: CropId) => T): PerCrop<T> =>
  Object.fromEntries(CROP_IDS.map((id) => [id, f(id)])) as PerCrop<T>;

export const emptyPlot = (): Plot => ({ crop: null, growth: 0, lastCrop: null });

export function newGame(): GameState {
  return {
    version: 1,
    money: 0,
    totalEarned: 0,
    plots: Array.from({ length: START_PLOTS }, emptyPlot),
    inventory: perCrop(() => [0, 0, 0]),
    unlocked: perCrop((id) => CROPS[id].unlockCost === 0),
    breed: perCrop(() => 0),
    farmers: 0,
    farmerLv: 0,
    warehouseLv: 0,
    selectedCrop: 'lettuce',
    stats: { manualHarvests: 0, autoHarvests: 0, playSec: 0 },
  };
}

const SAVE_KEY = 'idle-farm-save-v1';

export function saveGame(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? restore(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 保存できない環境では何もしない */
  }
}

/** 古いセーブや欠けたフィールドを新規データで補う */
export function restore(data: unknown): GameState | null {
  if (!data || typeof data !== 'object' || (data as GameState).version !== 1) return null;
  const d = data as GameState;
  const base = newGame();
  return {
    ...base,
    ...d,
    inventory: { ...base.inventory, ...d.inventory },
    unlocked: { ...base.unlocked, ...d.unlocked },
    breed: { ...base.breed, ...d.breed },
    stats: { ...base.stats, ...d.stats },
    plots: (d.plots ?? base.plots).slice(0, FARM_HEXES.length),
  };
}
