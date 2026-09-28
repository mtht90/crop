import { Decimal } from './decimal';
import { BUILDING_COUNT } from '../data/buildings';
import type { Notation } from './format';

export const SAVE_VERSION = 1;

export type LayerId = 'sn' | 'galaxy' | 'crunch' | 'mv';

export interface ExpeditionSlot {
  dest: string;
  start: number; // ms
  end: number; // ms
}

export interface Buff {
  id: string;
  end: number; // ms
  mult: number;
}

export interface GameState {
  version: number;
  created: number;
  lastTick: number;
  stardust: Decimal;
  /** 現在の周回 (超新星でリセット) */
  run: {
    earned: Decimal;
    clickEarned: Decimal;
    clicks: number;
    start: number;
  };
  buildings: number[];
  upgrades: string[];
  achievements: string[];
  stats: {
    totalEarned: Decimal;
    clicks: number;
    autoClicks: number;
    clickEarned: Decimal;
    comets: number;
    playTime: number;
    offlineTime: number;
    offlineReturns: number;
    buildingsBought: number;
    upgradesBought: number;
    maxSps: Decimal;
    bestRunEarned: Decimal;
    snTotal: number;
    galaxyTotal: number;
    crunchTotal: number;
    mvTotal: number;
    researchDone: number;
    expeditionsDone: number;
    challengesDone: number;
  };
  sn: {
    count: number;
    cores: Decimal;
    /** この銀河で得た星核 (生産ボーナスの基準) */
    coresGalaxy: Decimal;
    coresTotal: Decimal;
    shop: Record<string, number>;
    bestTime: number;
    lastGain: Decimal;
  };
  galaxy: {
    count: number;
    dm: Decimal;
    dmCrunch: Decimal;
    dmTotal: Decimal;
    shop: Record<string, number>;
    start: number;
    bestTime: number;
  };
  crunch: {
    count: number;
    ent: Decimal;
    entMV: Decimal;
    entTotal: Decimal;
    shop: Record<string, number>;
    start: number;
    bestTime: number;
  };
  mv: {
    count: number;
    shards: Decimal;
    shardsTotal: Decimal;
    shop: Record<string, number>;
    start: number;
    bestTime: number;
  };
  research: {
    levels: Record<string, number>;
    current: string | null;
    progress: number; // 秒
    queue: string[];
  };
  challenges: {
    active: string | null;
    completions: Record<string, number>;
  };
  expeditions: {
    slots: Array<ExpeditionSlot | null>;
    relics: Record<string, number>;
    lastDest: string;
    log: string[];
  };
  auto: {
    click: boolean;
    buildings: boolean;
    upgrades: boolean;
    sn: boolean;
    snMode: 'gain' | 'time';
    snValue: number;
    galaxy: boolean;
    galaxyValue: number;
    crunch: boolean;
    crunchValue: number;
    research: boolean;
    expeditions: boolean;
  };
  buffs: Buff[];
  nextComet: number; // ms
  settings: {
    notation: Notation;
    autosaveSec: number;
    floatingText: boolean;
    confirmPrestige: boolean;
    buyAmount: number; // -1 = 最大
    lowFx: boolean;
    offlinePopup: boolean;
  };
}

export function defaultState(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    created: now,
    lastTick: now,
    stardust: new Decimal(0),
    run: { earned: new Decimal(0), clickEarned: new Decimal(0), clicks: 0, start: now },
    buildings: new Array(BUILDING_COUNT).fill(0),
    upgrades: [],
    achievements: [],
    stats: {
      totalEarned: new Decimal(0),
      clicks: 0,
      autoClicks: 0,
      clickEarned: new Decimal(0),
      comets: 0,
      playTime: 0,
      offlineTime: 0,
      offlineReturns: 0,
      buildingsBought: 0,
      upgradesBought: 0,
      maxSps: new Decimal(0),
      bestRunEarned: new Decimal(0),
      snTotal: 0,
      galaxyTotal: 0,
      crunchTotal: 0,
      mvTotal: 0,
      researchDone: 0,
      expeditionsDone: 0,
      challengesDone: 0,
    },
    sn: {
      count: 0,
      cores: new Decimal(0),
      coresGalaxy: new Decimal(0),
      coresTotal: new Decimal(0),
      shop: {},
      bestTime: Infinity,
      lastGain: new Decimal(0),
    },
    galaxy: {
      count: 0,
      dm: new Decimal(0),
      dmCrunch: new Decimal(0),
      dmTotal: new Decimal(0),
      shop: {},
      start: now,
      bestTime: Infinity,
    },
    crunch: {
      count: 0,
      ent: new Decimal(0),
      entMV: new Decimal(0),
      entTotal: new Decimal(0),
      shop: {},
      start: now,
      bestTime: Infinity,
    },
    mv: {
      count: 0,
      shards: new Decimal(0),
      shardsTotal: new Decimal(0),
      shop: {},
      start: now,
      bestTime: Infinity,
    },
    research: { levels: {}, current: null, progress: 0, queue: [] },
    challenges: { active: null, completions: {} },
    expeditions: { slots: [null], relics: {}, lastDest: 'e0', log: [] },
    auto: {
      click: true,
      buildings: false,
      upgrades: false,
      sn: false,
      snMode: 'gain',
      snValue: 1,
      galaxy: false,
      galaxyValue: 1,
      crunch: false,
      crunchValue: 1,
      research: false,
      expeditions: false,
    },
    buffs: [],
    nextComet: now + 90_000,
    settings: {
      notation: 'jp',
      autosaveSec: 30,
      floatingText: true,
      confirmPrestige: true,
      buyAmount: 1,
      lowFx: false,
      offlinePopup: true,
    },
  };
}
