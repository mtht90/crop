import { Decimal } from './decimal';
import { BUILDING_COUNT } from '../data/buildings';
import { BALANCE } from '../data/balance';

/**
 * 全ての強化要素 (アップグレード・研究・遺物・ショップ・チャレンジ…) を集約した修正値。
 * computeMods() で毎回ゼロから組み立てる。
 */
export interface Mods {
  global: Decimal;
  building: Decimal[];
  /** [対象, 参照元, 参照元1基あたりの倍率加算] */
  synergy: Array<[number, number, number]>;
  click: Decimal;
  clickBase: number;
  clickSps: number;
  costMult: number;
  costScale: number;
  upgradeCostMult: number;
  exponent: number;
  tierMult: number;
  achPer: number;
  corePer: number;
  offlineEff: number;
  offlineCapH: number;
  cometFreq: number;
  cometDur: number;
  cometPower: number;
  researchSpeed: number;
  researchQueue: number;
  expSpeed: number;
  expLuck: number;
  expSlots: number;
  expReward: number;
  relicPower: number;
  challengeReward: number;
  snGain: Decimal;
  dmGain: Decimal;
  entGain: Decimal;
  shardGain: Decimal;
  autoClick: number;
  autoClickMult: number;
  startStardust: Decimal;
  startBuildings: number;
  startCores: Decimal;
  startDm: Decimal;
  startEnt: Decimal;
  // チャレンジによる制約
  noClick: boolean;
  noUpgrades: boolean;
  noAch: boolean;
  noCore: boolean;
  noSnShop: boolean;
  maxBuildingIndex: number;
}

export function baseMods(): Mods {
  return {
    global: new Decimal(1),
    building: Array.from({ length: BUILDING_COUNT }, () => new Decimal(1)),
    synergy: [],
    click: new Decimal(1),
    clickBase: 1,
    clickSps: 0,
    costMult: 1,
    costScale: 1.15,
    upgradeCostMult: 1,
    exponent: 1,
    tierMult: 2,
    achPer: 0.01,
    corePer: BALANCE.corePer,
    offlineEff: 0.25,
    offlineCapH: 8,
    cometFreq: 1,
    cometDur: 1,
    cometPower: 1,
    researchSpeed: 1,
    researchQueue: 1,
    expSpeed: 1,
    expLuck: 0,
    expSlots: 1,
    expReward: 1,
    relicPower: 1,
    challengeReward: 1,
    snGain: new Decimal(1),
    dmGain: new Decimal(1),
    entGain: new Decimal(1),
    shardGain: new Decimal(1),
    autoClick: 0,
    autoClickMult: 1,
    startStardust: new Decimal(0),
    startBuildings: 0,
    startCores: new Decimal(0),
    startDm: new Decimal(0),
    startEnt: new Decimal(0),
    noClick: false,
    noUpgrades: false,
    noAch: false,
    noCore: false,
    noSnShop: false,
    maxBuildingIndex: BUILDING_COUNT - 1,
  };
}

/** 施設の範囲にまとめて倍率を掛ける */
export function mulBuildings(m: Mods, from: number, to: number, mult: Decimal | number): void {
  for (let i = from; i <= to && i < m.building.length; i++) {
    m.building[i] = m.building[i].mul(mult);
  }
}
