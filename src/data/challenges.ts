import { Decimal } from '../core/decimal';
import { fmtMult, fmtPct } from '../core/format';
import type { Mods } from '../core/mods';

export const CHALLENGE_TIERS = 5;

export interface ChallengeDef {
  id: string;
  name: string;
  icon: string;
  rule: string;
  /** 周回獲得量の目標 (log10)。comp は現在のクリア数 */
  goalLog: (comp: number) => number;
  restrict: (m: Mods) => void;
  rewardDesc: string;
  reward: (m: Mods, comp: number) => void;
  rewardEffect: (comp: number) => string;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'c1', name: 'クリック封印', icon: '🚫',
    rule: 'クリック (手動・自動) で星屑を得られない',
    goalLog: (c) => 15 + 5 * c,
    restrict: (m) => { m.noClick = true; },
    rewardDesc: 'クリック ×10 / 自動クリック効果 ×2 (1段階ごと)',
    reward: (m, c) => { m.click = m.click.mul(Decimal.pow(10, c)); m.autoClickMult *= 2 ** c; },
    rewardEffect: (c) => `${fmtMult(Decimal.pow(10, c))} / ${fmtMult(2 ** c)}`,
  },
  {
    id: 'c2', name: '減衰する宇宙', icon: '📉',
    rule: '生産量の指数 ×0.85',
    goalLog: (c) => 13 + 5 * c,
    restrict: (m) => { m.exponent *= 0.85; },
    rewardDesc: '生産量の指数 +0.01 (1段階ごと)',
    reward: (m, c) => { m.exponent += 0.01 * c; },
    rewardEffect: (c) => `+${(0.01 * c).toFixed(2)}`,
  },
  {
    id: 'c3', name: 'ハイパーインフレ', icon: '💸',
    rule: '施設価格の上昇率が 1.25 になる',
    goalLog: (c) => 13 + 5 * c,
    restrict: (m) => { m.costScale = 1.25; },
    rewardDesc: '施設価格の上昇率 -0.002 (1段階ごと)',
    reward: (m, c) => { m.costScale -= 0.002 * c; },
    rewardEffect: (c) => `-${(0.002 * c).toFixed(3)}`,
  },
  {
    id: 'c4', name: '孤立した星系', icon: '🏝️',
    rule: '施設 11 番以降が生産しない',
    goalLog: (c) => 13 + 4 * c,
    restrict: (m) => { m.maxBuildingIndex = 9; },
    rewardDesc: '施設 1〜10 番の生産 ×1000 (1段階ごと)',
    reward: (m, c) => {
      const f = Decimal.pow(1000, c);
      for (let i = 0; i < 10; i++) m.building[i] = m.building[i].mul(f);
    },
    rewardEffect: (c) => fmtMult(Decimal.pow(1000, c)),
  },
  {
    id: 'c5', name: '技術の喪失', icon: '🔧',
    rule: 'アップグレードの効果が全て無効',
    goalLog: (c) => 12 + 4 * c,
    restrict: (m) => { m.noUpgrades = true; },
    rewardDesc: '施設強化アップグレードの倍率 +0.1 (1段階ごと)',
    reward: (m, c) => { m.tierMult += 0.1 * c; },
    rewardEffect: (c) => `+${(0.1 * c).toFixed(1)}`,
  },
  {
    id: 'c6', name: '名もなき者', icon: '🎭',
    rule: '実績ボーナスが無効',
    goalLog: (c) => 15 + 5 * c,
    restrict: (m) => { m.noAch = true; },
    rewardDesc: `実績1個あたりのボーナス +${fmtPct(0.002, 1)} (1段階ごと)`,
    reward: (m, c) => { m.achPer += 0.002 * c; },
    rewardEffect: (c) => `+${fmtPct(0.002 * c, 1)}`,
  },
  {
    id: 'c7', name: '星核の沈黙', icon: '🌚',
    rule: '星核の生産ボーナスが無効',
    goalLog: (c) => 13 + 5 * c,
    restrict: (m) => { m.noCore = true; },
    rewardDesc: `星核1個あたりのボーナス +${fmtPct(0.005, 1)} (1段階ごと)`,
    reward: (m, c) => { m.corePer += 0.005 * c; },
    rewardEffect: (c) => `+${fmtPct(0.005 * c, 1)}`,
  },
  {
    id: 'c8', name: '虚空の試練', icon: '🕳️',
    rule: '超新星ショップの効果が全て無効',
    goalLog: (c) => 14 + 6 * c,
    restrict: (m) => { m.noSnShop = true; },
    rewardDesc: '星核の獲得量 ×2 / ダークマターの獲得量 ×1.5 (1段階ごと)',
    reward: (m, c) => {
      m.snGain = m.snGain.mul(Decimal.pow(2, c));
      m.dmGain = m.dmGain.mul(Decimal.pow(1.5, c));
    },
    rewardEffect: (c) => `${fmtMult(Decimal.pow(2, c))} / ${fmtMult(Decimal.pow(1.5, c))}`,
  },
];

export const CHALLENGE_MAP: Map<string, ChallengeDef> = new Map(CHALLENGES.map((c) => [c.id, c]));
