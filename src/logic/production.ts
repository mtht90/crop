import { Decimal, D0 } from '../core/decimal';
import { baseMods, type Mods } from '../core/mods';
import type { Game } from '../core/game';
import { BUILDINGS } from '../data/buildings';
import { UPGRADE_MAP } from '../data/upgrades';
import { SHOP_ITEMS } from '../data/shops';
import { RESEARCH } from '../data/research';
import { RELIC_MAP } from '../data/relics';
import { CHALLENGES, CHALLENGE_MAP } from '../data/challenges';
import { BALANCE } from '../data/balance';

/** 全ての強化要素を集計する */
export function computeMods(g: Game): Mods {
  const s = g.s;
  const m = baseMods();

  // 挑戦中のチャレンジの制約は別オブジェクトで評価し、フラグは先に・数値は最後に反映する
  const restrict = baseMods();
  const active = s.challenges.active ? CHALLENGE_MAP.get(s.challenges.active) : undefined;
  active?.restrict(restrict);

  // 転生ショップ
  for (const item of SHOP_ITEMS) {
    if (item.layer === 'sn' && restrict.noSnShop) continue;
    const layerShop = item.layer === 'sn' ? s.sn.shop : item.layer === 'galaxy' ? s.galaxy.shop : item.layer === 'crunch' ? s.crunch.shop : s.mv.shop;
    const lvl = layerShop[item.id] ?? 0;
    if (lvl > 0) item.apply(m, lvl);
  }

  // 研究
  for (const r of RESEARCH) {
    const lvl = s.research.levels[r.id] ?? 0;
    if (lvl > 0) r.apply(m, lvl);
  }

  // 遺物 (遺物パワーは上のショップで確定済み)
  for (const [id, count] of Object.entries(s.expeditions.relics)) {
    const def = RELIC_MAP.get(id);
    if (def && count > 0) def.apply(m, count * m.relicPower);
  }

  // チャレンジ報酬
  for (const c of CHALLENGES) {
    const comp = s.challenges.completions[c.id] ?? 0;
    if (comp > 0) c.reward(m, comp * m.challengeReward);
  }

  // アップグレード (施設強化倍率 tierMult はここまでで確定している)
  if (!restrict.noUpgrades) {
    for (const id of s.upgrades) {
      const u = UPGRADE_MAP.get(id);
      if (u) u.apply(m, g);
    }
  }

  // 実績
  if (!restrict.noAch && s.achievements.length > 0) {
    m.global = m.global.mul(Decimal.pow(1 + m.achPer, s.achievements.length));
  }

  // 星核
  if (!restrict.noCore && s.sn.coresGalaxy.gt(0)) {
    m.global = m.global.mul(s.sn.coresGalaxy.mul(m.corePer).add(1));
  }

  // ダークマター
  if (s.galaxy.dmCrunch.gt(0)) {
    m.global = m.global.mul(Decimal.pow(s.galaxy.dmCrunch.add(1), BALANCE.dmExp));
  }

  // エントロピー
  if (s.crunch.entMV.gt(0)) {
    m.global = m.global.mul(Decimal.pow(s.crunch.entMV.add(1), BALANCE.entExp));
    m.exponent += 0.01 * s.crunch.entMV.add(1).log10();
  }

  // 次元の欠片
  if (s.mv.shardsTotal.gt(0)) {
    const sh = s.mv.shardsTotal.add(1);
    m.global = m.global.mul(Decimal.pow(sh, BALANCE.shardExp));
    const gainBoost = Decimal.sqrt(sh);
    m.snGain = m.snGain.mul(gainBoost);
    m.dmGain = m.dmGain.mul(gainBoost);
    m.entGain = m.entGain.mul(gainBoost);
  }

  // チャレンジの数値制約
  if (active) {
    m.noClick = restrict.noClick;
    m.noUpgrades = restrict.noUpgrades;
    m.noAch = restrict.noAch;
    m.noCore = restrict.noCore;
    m.noSnShop = restrict.noSnShop;
    m.maxBuildingIndex = restrict.maxBuildingIndex;
    m.exponent *= restrict.exponent;
    if (restrict.costScale !== 1.15) m.costScale = restrict.costScale;
  }
  m.costScale = Math.max(1.01, m.costScale);
  return m;
}

/** 毎秒生産量を施設別に計算する (バフは含まない) */
export function computeProduction(g: Game): void {
  const s = g.s;
  const m = g.mods;
  const synergy = new Array<number>(BUILDINGS.length).fill(1);
  for (const [target, source, pct] of m.synergy) {
    synergy[target] *= 1 + pct * s.buildings[source];
  }
  const bld: Decimal[] = [];
  let raw = D0;
  for (const b of BUILDINGS) {
    const owned = s.buildings[b.index];
    if (owned <= 0 || b.index > m.maxBuildingIndex) {
      bld.push(D0);
      continue;
    }
    const p = b.baseProd.mul(owned).mul(m.building[b.index]).mul(synergy[b.index]).mul(m.global);
    bld.push(p);
    raw = raw.add(p);
  }
  let sps = raw;
  if (m.exponent !== 1 && raw.gt(1)) {
    sps = Decimal.pow(raw, m.exponent);
    const factor = sps.div(raw);
    for (let i = 0; i < bld.length; i++) bld[i] = bld[i].mul(factor);
  }
  g.bldSps = bld;
  g.sps = sps;
}
