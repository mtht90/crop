import type { CpuBalance, Team } from '../core/types';
import { enemyOf } from '../core/types';
import type { Rng } from '../core/Rng';
import type { BattleWorld } from '../systems/BattleWorld';
import {
  bridgeX,
  canHitAir,
  clusterAround,
  densestPoint,
  depthOf,
  enemyUnits,
  findDeployPoint,
  ownUnits,
  threats,
  yFromDepth,
  type HandOption,
} from './helpers';

export interface CpuAction {
  uid: number;
  x: number;
  y: number;
  targetId: number | null;
  score: number;
  rule: string;
}

export interface CpuContext {
  world: BattleWorld;
  team: Team;
  rng: Rng;
  cfg: CpuBalance;
  hand: HandOption[];
}

/** 思考ルール：候補行動（スコア付き）を返す。ルールは配列に追加するだけで増やせる。 */
export type CpuRule = (ctx: CpuContext) => CpuAction | null;

function place(ctx: CpuContext, o: HandOption, x: number, y: number, score: number, rule: string): CpuAction | null {
  const pt = findDeployPoint(ctx.world, ctx.team, x, y);
  if (!pt) return null;
  return { uid: o.inst.uid, x: pt.x, y: pt.y, targetId: null, score, rule };
}

/** 1. 迎撃：自陣に来た敵へ有効なカードで対処する */
export const defendRule: CpuRule = (ctx) => {
  const list = threats(ctx.world, ctx.team);
  if (!list.length) return null;
  const main = list[0];
  const near = clusterAround(list, main.x, main.y, 2.2);
  const flying = near.some((u) => u.isFlying);
  const swarm = near.length >= 3;
  const tank = near.some((u) => u.maxHp >= 1500);
  const urgency = Math.max(0, 18.5 - depthOf(ctx.team, main.y));

  let best: CpuAction | null = null;
  for (const o of ctx.hand) {
    const c = o.card;
    if (c.type === 'support') continue;
    if (c.type === 'unit' && c.targetType === 'buildings') continue;
    if (flying && !canHitAir(c)) continue;
    let s = 6 + urgency * 0.4 - c.cost * 0.3;
    if (swarm && c.splashRadius > 0) s += 3;
    if (tank && (c.id === 'swordsman' || c.id === 'goblin' || c.type === 'building')) s += 2;
    if (flying && canHitAir(c)) s += 1.5;
    let action: CpuAction | null;
    if (c.type === 'spell') {
      if (near.length < 2 && !swarm) continue;
      const pt = densestPoint(near, c.splashRadius);
      if (!pt) continue;
      action = { uid: o.inst.uid, x: pt.x, y: pt.y, targetId: null, score: s + pt.units.length, rule: 'defend-spell' };
    } else if (c.type === 'building') {
      action = place(ctx, o, 9 + (main.x < 9 ? -1.5 : 1.5), yFromDepth(ctx.team, 8.5), s, 'defend-building');
    } else {
      const ranged = c.range >= 3;
      const d = Math.min(14, Math.max(2, depthOf(ctx.team, main.y) - (ranged ? 4 : 2)));
      action = place(ctx, o, main.x, yFromDepth(ctx.team, d), s, 'defend-unit');
    }
    if (action && (!best || action.score > best.score)) best = action;
  }
  return best;
};

/** 2. サポート：場面に応じて味方を強化・回復する */
export const supportRule: CpuRule = (ctx) => {
  const allies = ownUnits(ctx.world, ctx.team);
  if (!allies.length) return null;
  let best: CpuAction | null = null;
  for (const o of ctx.hand) {
    const eff = o.card.supportEffect;
    if (o.card.type !== 'support' || !eff) continue;
    for (const a of allies) {
      const attacking = depthOf(ctx.team, a.y) > 16;
      const fighting = a.targetId !== null && a.attackedAt > ctx.world.time - 2;
      let s = -1;
      switch (eff.kind) {
        case 'heal':
          if (a.hp / a.maxHp < 0.5 && a.maxHp >= 500) s = 7 + (1 - a.hp / a.maxHp) * 3;
          break;
        case 'shield':
          if (!a.buffs.has('shield') && attacking && a.maxHp >= 700) s = 6 + (a.cardId === 'heavy_knight' ? 2 : 0);
          break;
        case 'attack':
          if (!a.buffs.has('attack') && fighting && a.base.damage >= 90) s = 5 + a.base.damage / 100;
          break;
        case 'haste':
          if (!a.buffs.has('haste') && (fighting || (attacking && a.cardId === 'heavy_knight'))) s = 4.5;
          break;
      }
      if (s > 0 && (!best || s > best.score)) {
        best = { uid: o.inst.uid, x: a.x, y: a.y, targetId: a.id, score: s, rule: `support-${eff.kind}` };
      }
    }
  }
  return best;
};

/** 3. 呪文：密集した敵や、とどめを刺せる塔に火球 */
export const spellRule: CpuRule = (ctx) => {
  const spell = ctx.hand.find((o) => o.card.type === 'spell');
  if (!spell) return null;
  const c = spell.card;
  const enemies = enemyUnits(ctx.world, ctx.team);
  const pt = densestPoint(enemies, c.splashRadius);
  if (pt && (pt.units.length >= 3 || (pt.units.length >= 2 && pt.units.reduce((s, u) => s + u.hp, 0) >= 700))) {
    return { uid: spell.inst.uid, x: pt.x, y: pt.y, targetId: null, score: 7 + pt.units.length, rule: 'spell-cluster' };
  }
  const towerHit = c.damage * ctx.world.balance.spell.towerDamageRatio;
  const weak = ctx.world.towers(enemyOf(ctx.team)).find((t) => t.alive && t.hp <= towerHit);
  if (weak) return { uid: spell.inst.uid, x: weak.x, y: weak.y, targetId: null, score: 9, rule: 'spell-finish' };
  return null;
};

/** 4. 攻撃：マナに余裕があれば手薄なレーンへ攻める */
export const attackRule: CpuRule = (ctx) => {
  const mana = ctx.world.players[ctx.team].mana.value;
  const threshold = ctx.cfg.attackManaThreshold + (ctx.rng.next() - 0.5) * ctx.cfg.randomness * 4;
  const allies = ownUnits(ctx.world, ctx.team);
  const tankAlive = allies.find((a) => a.cardId === 'heavy_knight');
  if (mana < threshold && !tankAlive) return null;

  const enemyGuards = ctx.world.towers(enemyOf(ctx.team)).filter((t) => t.towerType === 'guard');
  const opened = ctx.world.destroyedEnemyLanes(ctx.team);
  // 手薄なレーン＝守護塔の HP が低い方（壊れていれば最優先）
  let lane: 0 | 1 = 0;
  const hp = (l: number) => enemyGuards.find((g) => g.lane === l)?.hp ?? 0;
  lane = hp(0) <= hp(1) ? 0 : 1;
  if (ctx.rng.next() < ctx.cfg.randomness) lane = lane === 0 ? 1 : 0;

  let best: CpuAction | null = null;
  for (const o of ctx.hand) {
    const c = o.card;
    if (c.type !== 'unit') continue;
    let s = 3 + c.cost * 0.2;
    let x = bridgeX(lane);
    let depth = 13.5;
    if (tankAlive) {
      // 盾役の後ろに遠距離を付ける
      if (c.range < 3) continue;
      s = 5.5;
      x = tankAlive.x;
      depth = Math.min(14, depthOf(ctx.team, tankAlive.y) - 1.5);
      if (depth < 2) continue;
    } else if (c.id === 'heavy_knight') {
      s += 1.5;
      depth = 2.5; // 最奥から送り出してマナを貯める時間を作る
      x = lane === 0 ? 5.5 : 12.5;
    } else if (opened.includes(lane)) {
      depth = 19.5;
      s += 1;
    }
    const action = place(ctx, o, x, yFromDepth(ctx.team, depth), s, 'attack');
    if (action && (!best || action.score > best.score)) best = action;
  }
  return best;
};

/** 5. 回転：手札が上限で止まっているときは安いカードを使って回す */
export const cycleRule: CpuRule = (ctx) => {
  if (!ctx.world.players[ctx.team].deck.isHandFull) return null;
  const sorted = [...ctx.hand].filter((o) => o.card.type === 'unit' || o.card.type === 'building').sort((a, b) => a.card.cost - b.card.cost);
  const o = sorted[0];
  if (!o) return null;
  const x = 9 + (ctx.rng.next() < 0.5 ? -3 : 3);
  return place(ctx, o, x, yFromDepth(ctx.team, o.card.type === 'building' ? 9 : 4), 2.5, 'cycle');
};

export const DEFAULT_RULES: CpuRule[] = [defendRule, supportRule, spellRule, attackRule, cycleRule];
