import type { Grade, FishInstance } from '../sim/individual';
import type { ClockState } from '../sim/environment';
import type { Layer, Season, Structure, TimeBand, Weather } from '../data/types';

export interface CatchRecord {
  day: number;
  clock: string;
  time: TimeBand;
  weather: Weather;
  season: Season;
  structure: Structure;
  layer: Layer;
  rod: string;
  reel: string;
  line: string;
  lure: string;
  length: number;
  weight: number;
  grade: Grade;
  colorId: string | null;
  patternId: string | null;
}

export interface DexEntry {
  count: number;
  bestLength: number;
  bestWeight: number;
  bestGrade: Grade;
  first: CatchRecord;
  best: CatchRecord;
  /** 発見した色（'normal' を含む） */
  colors: string[];
  patterns: string[];
}

export interface Settings {
  master: number;
  bgm: number;
  sfx: number;
  sensitivity: number;
  showStamina: boolean;
}

export interface SaveData {
  version: 1;
  money: number;
  clock: ClockState;
  owned: { rods: string[]; reels: string[]; lines: string[]; lures: Record<string, number> };
  equip: { rod: string; reel: string; line: string; lure: string };
  drag: number;
  /** エサ釣りのウキ下 (m)。0 = ウキなし（底まで沈める） */
  floatDepth: number;
  coolerLevel: number;
  cooler: (FishInstance & { record: CatchRecord })[];
  dex: Record<string, DexEntry>;
  spots: string[];
  rewards: string[];
  stats: { caught: number; released: number; earned: number; lost: number };
  settings: Settings;
}

const KEY = 'anglers-atlas-save-v1';

export function newSave(): SaveData {
  return {
    version: 1,
    money: 1500,
    clock: { day: 1, minutes: 5 * 60 + 30, weather: 'cloudy' },
    owned: {
      rods: ['rod_beginner'],
      reels: ['reel_small'],
      lines: ['nylon6'],
      lures: { bait_worm: 20, lure_spinner: 1, lure_worm: 1 },
    },
    equip: { rod: 'rod_beginner', reel: 'reel_small', line: 'nylon6', lure: 'bait_worm' },
    drag: 1.6,
    floatDepth: 0,
    coolerLevel: 0,
    cooler: [],
    dex: {},
    spots: ['lake'],
    rewards: [],
    stats: { caught: 0, released: 0, earned: 0, lost: 0 },
    settings: { master: 0.8, bgm: 0.5, sfx: 0.8, sensitivity: 1, showStamina: true },
  };
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1) return null;
    const base = newSave();
    return { ...base, ...data, settings: { ...base.settings, ...data.settings }, stats: { ...base.stats, ...data.stats } };
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できない環境（プライベートモード等）では黙って続行
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
