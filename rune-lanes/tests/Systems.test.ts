import { describe, expect, it } from 'vitest';
import { ManaSystem } from '../src/systems/ManaSystem';
import { BuffSet, applySupport, computeStats, updateBuffs } from '../src/systems/BuffSystem';
import { dealDamage } from '../src/systems/Combat';
import { MatchTimer } from '../src/systems/MatchTimer';
import { canTarget, findNearestTarget } from '../src/systems/Targeting';
import { makeCombatant, type Combatant } from '../src/entities/Combatant';
import { isDeployable, nextWaypoint, RIVER_TOP, RIVER_BOTTOM } from '../src/systems/Arena';
import { Rng } from '../src/core/Rng';

const baseProfile = {
  damage: 100,
  attackInterval: 1,
  range: 1,
  sightRange: 5,
  moveSpeed: 1,
  targetType: 'both' as const,
  splashRadius: 0,
  projectile: null,
  projectileSpeed: 0,
};

function unit(p: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: 1, team: 0, kind: 'unit', x: 0, y: 0, base: { ...baseProfile }, hp: 1000, maxHp: 1000, ...p });
}

describe('ManaSystem', () => {
  it('連続的に回復し、最大値で止まる', () => {
    const m = new ManaSystem({ max: 10, start: 5, regenSeconds: 2.8 });
    m.update(1.4);
    expect(m.value).toBeCloseTo(5.5);
    m.update(100);
    expect(m.value).toBe(10);
  });

  it('倍速で回復する', () => {
    const m = new ManaSystem({ max: 10, start: 0, regenSeconds: 2.8 });
    m.multiplier = 2;
    m.update(2.8);
    expect(m.value).toBeCloseTo(2);
  });

  it('足りなければ使えず、不足量を返す', () => {
    const m = new ManaSystem({ max: 10, start: 3, regenSeconds: 2.8 });
    expect(m.canAfford(4)).toBe(false);
    expect(m.shortfall(4)).toBeCloseTo(1);
    expect(m.spend(4)).toBe(false);
    expect(m.value).toBe(3);
    expect(m.spend(3)).toBe(true);
    expect(m.value).toBe(0);
  });
});

describe('BuffSystem', () => {
  it('攻撃・速度バフが能力値に反映され、切れると元に戻る', () => {
    const u = unit();
    applySupport(u, { kind: 'attack', value: 0.5, duration: 8 }, 'refresh');
    applySupport(u, { kind: 'haste', value: 0.4, duration: 8 }, 'refresh');
    let s = computeStats(u.base, u.buffs);
    expect(s.damage).toBeCloseTo(150);
    expect(s.moveSpeed).toBeCloseTo(1.4);
    expect(s.attackInterval).toBeCloseTo(1 / 1.4);
    updateBuffs(u, 8.01);
    s = computeStats(u.base, u.buffs);
    expect(s.damage).toBe(100);
    expect(s.moveSpeed).toBe(1);
  });

  it('同じ効果の重ねがけは時間の更新で、効果量は重ならない', () => {
    const b = new BuffSet();
    b.add('attack', 0.5, 8, 'refresh');
    b.update(5);
    b.add('attack', 0.5, 8, 'refresh');
    expect(b.buffs).toHaveLength(1);
    expect(b.total('attack')).toBe(0.5);
    expect(b.buffs[0].remaining).toBe(8);
  });

  it('stack ルールなら効果量が加算される', () => {
    const b = new BuffSet();
    b.add('attack', 0.5, 8, 'stack');
    b.add('attack', 0.5, 8, 'stack');
    expect(b.total('attack')).toBe(1);
  });

  it('回復は最大HPを超えない', () => {
    const u = unit({ hp: 900 });
    const healed = applySupport(u, { kind: 'heal', value: 0.4, duration: 0 }, 'refresh');
    expect(u.hp).toBe(1000);
    expect(healed).toBe(100);
  });

  it('シールドはダメージを先に吸収し、時間切れで消える', () => {
    const u = unit();
    applySupport(u, { kind: 'shield', value: 0.3, duration: 10 }, 'refresh');
    expect(u.shield).toBe(300);
    const r = dealDamage(u, 200);
    expect(r.toShield).toBe(200);
    expect(u.hp).toBe(1000);
    dealDamage(u, 200);
    expect(u.shield).toBe(0);
    expect(u.hp).toBe(900);
    applySupport(u, { kind: 'shield', value: 0.3, duration: 10 }, 'refresh');
    updateBuffs(u, 10.1);
    expect(u.shield).toBe(0);
  });
});

describe('Combat', () => {
  it('出現待機中は無敵', () => {
    const u = unit({ deployTimer: 1 });
    expect(dealDamage(u, 500).total).toBe(0);
    expect(u.hp).toBe(1000);
  });

  it('HP が 0 になると倒れる', () => {
    const u = unit({ hp: 50 });
    dealDamage(u, 80);
    expect(u.hp).toBe(0);
    expect(u.alive).toBe(false);
  });
});

describe('Targeting', () => {
  const ground = unit({ id: 2, team: 1 });
  const flyer = unit({ id: 3, team: 1, isFlying: true });
  const tower = makeCombatant({ id: 4, team: 1, kind: 'tower', x: 0, y: 0, base: { ...baseProfile } });

  it('対象タイプごとに狙える相手が決まる', () => {
    expect(canTarget('ground', ground)).toBe(true);
    expect(canTarget('ground', flyer)).toBe(false);
    expect(canTarget('both', flyer)).toBe(true);
    expect(canTarget('buildings', ground)).toBe(false);
    expect(canTarget('buildings', tower)).toBe(true);
    expect(canTarget('air', flyer)).toBe(true);
  });

  it('視界内で最も近い敵を選ぶ', () => {
    const self = unit({ x: 0, y: 0 });
    const far = unit({ id: 10, team: 1, x: 4, y: 0 });
    const near = unit({ id: 11, team: 1, x: 2, y: 0 });
    const out = unit({ id: 12, team: 1, x: 20, y: 0 });
    const ally = unit({ id: 13, team: 0, x: 1, y: 0 });
    expect(findNearestTarget(self, [far, near, out, ally], 5)?.id).toBe(11);
    expect(findNearestTarget(self, [out], 5)).toBeNull();
  });
});

describe('Arena', () => {
  it('自陣のみ配置可能、壊したレーンは相手陣地の手前まで広がる', () => {
    expect(isDeployable(0, 9, 20, [])).toBe(true);
    expect(isDeployable(0, 9, 12, [])).toBe(false);
    expect(isDeployable(0, 3, 12, [0])).toBe(true);
    expect(isDeployable(0, 14, 12, [0])).toBe(false);
    expect(isDeployable(0, 3, 16, [0])).toBe(false); // 川の上
    expect(isDeployable(1, 9, 10, [])).toBe(true);
    expect(isDeployable(1, 9, 20, [])).toBe(false);
    expect(isDeployable(0, 9, 29, [])).toBe(false); // 王の塔の上
  });

  it('地上ユニットは橋を経由して川を渡る', () => {
    const wp = nextWaypoint(8, 22, 8, 6, false);
    expect([3.5, 14.5]).toContain(wp.x);
    expect(wp.y).toBeGreaterThan(RIVER_BOTTOM);
    const onBridge = nextWaypoint(3.5, 16, 3.5, 6, false);
    expect(onBridge.y).toBeLessThan(RIVER_TOP);
    expect(nextWaypoint(8, 22, 8, 6, true)).toEqual({ x: 8, y: 6 });
  });
});

describe('MatchTimer', () => {
  const cfg = { duration: 180, doubleManaAt: 60, overtime: 60 };
  const st = (c0: number, c1: number, h0 = 1, h1 = 1) => ({ crowns: [c0, c1] as [number, number], hpRatio: [h0, h1] as [number, number] });

  it('残り1分からマナ2倍', () => {
    const t = new MatchTimer(cfg);
    t.update(119, st(0, 0));
    expect(t.isDoubleMana).toBe(false);
    t.update(2, st(0, 0));
    expect(t.isDoubleMana).toBe(true);
  });

  it('時間切れで撃破数が多い方の勝ち', () => {
    const t = new MatchTimer(cfg);
    expect(t.update(181, st(1, 0))).toEqual({ winner: 0, reason: 'crowns' });
  });

  it('同数なら延長、延長で先に塔を壊した方が勝ち', () => {
    const t = new MatchTimer(cfg);
    expect(t.update(181, st(1, 1))).toBeNull();
    expect(t.phase).toBe('overtime');
    expect(t.update(1, st(1, 1))).toBeNull();
    expect(t.update(1, st(1, 2))).toEqual({ winner: 1, reason: 'overtime' });
  });

  it('延長でも同数なら残り HP 割合で判定', () => {
    const t = new MatchTimer(cfg);
    t.update(181, st(0, 0));
    expect(t.update(61, st(0, 0, 0.8, 0.9))).toEqual({ winner: 1, reason: 'hp' });
  });

  it('王の塔を壊したら即勝利', () => {
    const t = new MatchTimer(cfg);
    expect(t.update(1, st(3, 0))).toEqual({ winner: 0, reason: 'king' });
  });
});

describe('Rng', () => {
  it('シードで再現できる', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });
});
