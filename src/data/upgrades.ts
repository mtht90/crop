import { Decimal } from '../core/decimal';
import { fmt, fmtPct } from '../core/format';
import type { Mods } from '../core/mods';
import type { Game } from '../core/game';
import { BUILDINGS } from './buildings';

export type UpgradeKind = 'tier' | 'click' | 'global' | 'synergy';

export interface UpgradeDef {
  id: string;
  kind: UpgradeKind;
  name: string;
  icon: string;
  desc: (g: Game) => string;
  cost: Decimal;
  unlocked: (g: Game) => boolean;
  apply: (m: Mods, g: Game) => void;
}

export const TIER_THRESHOLDS = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600];
const TIER_COST_MULT = [10, 50, 500, 5e4, 5e6, 5e8, 5e11, 5e14, 5e17, 5e20, 5e23, 5e26, 5e29, 5e32, 5e35];
const TIER_NAMES = [
  '改良型', '強化型', '高効率', '量子化', '超伝導', '次元拡張', '自己複製', '超越',
  '神話級', '星霜の', '永劫の', '無窮の', '天元の', '全知の', '終焉の',
];

const CLICK_NAMES = [
  '強化グローブ', '重力の指先', 'プラズマ・タップ', '光子の爪', '中性子ナックル',
  '超新星の拳', '事象の指', '銀河の掌', '宇宙の鼓動', '創造主の一撃',
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

const GLOBAL_TITLES = [
  '星図', '航法理論', '重力工学', '恒星物理', '銀河地図', '宇宙論',
];

function buildUpgrades(): UpgradeDef[] {
  const list: UpgradeDef[] = [];

  // --- 施設強化 (40 施設 × 15 段階) ---
  for (const b of BUILDINGS) {
    TIER_THRESHOLDS.forEach((th, t) => {
      list.push({
        id: `t${b.index}_${t}`,
        kind: 'tier',
        name: `${TIER_NAMES[t]}${b.name}`,
        icon: b.icon,
        desc: (g) => `${b.name}の生産 ×${g.mods.tierMult.toFixed(2).replace(/\.?0+$/, '')}(${th}基所持で解放)`,
        cost: b.baseCost.mul(TIER_COST_MULT[t]),
        unlocked: (g) => g.s.buildings[b.index] >= th,
        apply: (m) => {
          m.building[b.index] = m.building[b.index].mul(m.tierMult);
        },
      });
    });
  }

  // --- クリック倍率 ---
  CLICK_NAMES.forEach((name, k) => {
    const cost = new Decimal(100).mul(Decimal.pow(10, k * 1.6));
    list.push({
      id: `c${k}`,
      kind: 'click',
      name,
      icon: '👆',
      desc: () => 'クリックで得る星屑 ×2',
      cost,
      unlocked: (g) => g.s.run.clicks >= 10 * (k + 1) || g.s.run.earned.gte(cost.div(20)),
      apply: (m) => {
        m.click = m.click.mul(2);
      },
    });
  });

  // --- クリックに毎秒生産の一部を加算 ---
  for (let k = 0; k < 15; k++) {
    const cost = new Decimal(5e4).mul(Decimal.pow(100, k));
    list.push({
      id: `cs${k}`,
      kind: 'click',
      name: `共鳴タップ ${ROMAN[k]}`,
      icon: '🎯',
      desc: () => 'クリックごとに毎秒生産量の 1% を追加で獲得',
      cost,
      unlocked: (g) => g.s.run.earned.gte(cost.div(10)),
      apply: (m) => {
        m.clickSps += 0.01;
      },
    });
  }

  // --- 全体倍率 ---
  for (let k = 0; k < 60; k++) {
    const mult = k < 20 ? 1.2 : k < 40 ? 1.3 : 1.5;
    const cost = new Decimal(1e3).mul(Decimal.pow(10, k * 1.1));
    const title = GLOBAL_TITLES[Math.floor(k / 10)];
    list.push({
      id: `g${k}`,
      kind: 'global',
      name: `${title} 第${(k % 10) + 1}章`,
      icon: '📜',
      desc: () => `全ての生産 ×${mult}`,
      cost,
      unlocked: (g) => g.s.run.earned.gte(cost.div(10)),
      apply: (m) => {
        m.global = m.global.mul(mult);
      },
    });
  }

  // --- シナジー: 下位施設が 5 段上の施設の所持数に応じて強化される ---
  for (let i = 0; i + 5 < BUILDINGS.length; i++) {
    const lo = BUILDINGS[i];
    const hi = BUILDINGS[i + 5];
    list.push({
      id: `s${i}`,
      kind: 'synergy',
      name: `${lo.name}×${hi.name} 連携`,
      icon: '🔗',
      desc: () => `${lo.name}の生産が${hi.name}1基ごとに +${fmtPct(0.01)}、${hi.name}の生産が${lo.name}1基ごとに +${fmtPct(0.001, 1)}`,
      cost: hi.baseCost.mul(50),
      unlocked: (g) => g.s.buildings[i] >= 25 && g.s.buildings[i + 5] >= 5,
      apply: (m) => {
        m.synergy.push([i, i + 5, 0.01]);
        m.synergy.push([i + 5, i, 0.001]);
      },
    });
  }

  return list;
}

export const UPGRADES: UpgradeDef[] = buildUpgrades();
export const UPGRADE_MAP: Map<string, UpgradeDef> = new Map(UPGRADES.map((u) => [u.id, u]));

export function upgradeCostLabel(u: UpgradeDef, g: Game): string {
  return fmt(u.cost.mul(g.mods.upgradeCostMult));
}
