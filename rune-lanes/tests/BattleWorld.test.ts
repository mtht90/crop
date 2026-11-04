import { describe, expect, it } from 'vitest';
import cards from '../src/data/cards.json';
import balance from '../src/data/balance.json';
import decks from '../src/data/decks.json';
import { BattleWorld } from '../src/systems/BattleWorld';
import { CpuController } from '../src/ai/CpuController';
import { Rng } from '../src/core/Rng';
import type { Balance, CardDef, Team } from '../src/core/types';

const B = balance as Balance;
const C = cards as CardDef[];

function world(seed = 1, deck0 = decks.player, deck1 = decks.cpu) {
  const w = new BattleWorld({ cards: C, balance: B, decks: [deck0, deck1], seed });
  w.start();
  return w;
}

function step(w: BattleWorld, seconds: number) {
  const dt = 1 / B.sim.tickRate;
  for (let t = 0; t < seconds; t += dt) w.update(dt);
}

/** 手札に指定カードを強制的に用意する（テスト用） */
function giveCard(w: BattleWorld, team: Team, cardId: string): number {
  const deck = w.players[team].deck;
  let inst = deck.hand.find((c) => c.cardId === cardId);
  if (!inst) {
    const pools = [deck.drawPile, deck.discard];
    for (const pool of pools) {
      const i = pool.findIndex((c) => c.cardId === cardId);
      if (i >= 0) {
        inst = pool.splice(i, 1)[0];
        break;
      }
    }
    if (!inst) throw new Error('card not found');
    if (deck.hand.length >= deck.config.handLimit) deck.discard.push(deck.hand.shift()!);
    deck.hand.push(inst);
  }
  return inst.uid;
}

describe('BattleWorld', () => {
  it('開始時に塔6本と初期手札', () => {
    const w = world();
    expect(w.combatants.filter((c) => c.kind === 'tower')).toHaveLength(6);
    expect(w.players[0].deck.hand).toHaveLength(4);
    expect(w.players[1].deck.hand).toHaveLength(4);
    expect(w.towers(0).find((t) => t.towerType === 'king')!.active).toBe(false);
  });

  it('マナが足りないカードは使えない', () => {
    const w = world();
    w.players[0].mana.value = 2;
    const uid = giveCard(w, 0, 'heavy_knight');
    expect(w.playCard(0, uid, 9, 22)).toEqual({ ok: false, reason: 'mana' });
    w.players[0].mana.value = 5;
    expect(w.playCard(0, uid, 9, 22)).toEqual({ ok: true });
    expect(w.players[0].mana.value).toBeCloseTo(0);
    expect(w.players[0].deck.discard.map((c) => c.uid)).toContain(uid);
  });

  it('配置は自陣のみ', () => {
    const w = world();
    w.players[0].mana.value = 10;
    const uid = giveCard(w, 0, 'swordsman');
    expect(w.playCard(0, uid, 9, 10)).toEqual({ ok: false, reason: 'position' });
    expect(w.players[0].mana.value).toBe(10);
    expect(w.players[0].deck.findInHand(uid)).toBeTruthy();
  });

  it('群れユニットは複数体出現する', () => {
    const w = world();
    w.players[0].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'goblin'), 9, 22);
    expect(w.combatants.filter((c) => c.cardId === 'goblin')).toHaveLength(3);
  });

  it('サポートは味方ユニット以外を対象にするとキャンセル（マナ・手札そのまま）', () => {
    const w = world();
    w.players[0].mana.value = 10;
    const uid = giveCard(w, 0, 'heal_light');
    const enemyTower = w.towers(1)[0];
    expect(w.playCard(0, uid, 0, 0, enemyTower.id)).toEqual({ ok: false, reason: 'target' });
    expect(w.playCard(0, uid, 0, 0, null)).toEqual({ ok: false, reason: 'target' });
    expect(w.players[0].mana.value).toBe(10);
    expect(w.players[0].deck.findInHand(uid)).toBeTruthy();
  });

  it('サポートで回復・シールド・攻撃強化がかかる', () => {
    const w = world();
    w.players[0].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'swordsman'), 9, 22);
    const u = w.combatants.find((c) => c.cardId === 'swordsman')!;
    u.hp = 100;
    expect(w.playCard(0, giveCard(w, 0, 'heal_light'), 0, 0, u.id).ok).toBe(true);
    expect(u.hp).toBeCloseTo(100 + u.maxHp * 0.4);
    w.players[0].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'ward'), 0, 0, u.id);
    expect(u.shield).toBeCloseTo(u.maxHp * 0.3);
    w.playCard(0, giveCard(w, 0, 'horn'), 0, 0, u.id);
    expect(u.buffs.has('attack')).toBe(true);
  });

  it('王の塔は直接攻撃されると起動する', () => {
    const w = world();
    const king = w.towers(1).find((t) => t.towerType === 'king')!;
    w.players[0].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'fireball'), king.x, king.y);
    step(w, 3);
    expect(king.hp).toBeLessThan(king.maxHp);
    expect(king.hp).toBeCloseTo(king.maxHp - 420 * B.spell.towerDamageRatio);
    expect(king.active).toBe(true);
  });

  it('守護塔が壊れると撃破数+1、王の塔が起動し、配置範囲が広がる', () => {
    const w = world();
    const guard = w.towers(1).find((t) => t.towerType === 'guard' && t.lane === 0)!;
    expect(w.canDeployAt(0, 3, 12)).toBe(false);
    guard.hp = 1;
    w.players[0].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'fireball'), guard.x, guard.y);
    step(w, 3);
    expect(guard.alive).toBe(false);
    expect(w.players[0].crowns).toBe(1);
    expect(w.towers(1).find((t) => t.towerType === 'king')!.active).toBe(true);
    expect(w.canDeployAt(0, 3, 12)).toBe(true);
    expect(w.canDeployAt(0, 14, 12)).toBe(false);
  });

  it('王の塔を壊したら即勝利', () => {
    const w = world();
    const king = w.towers(1).find((t) => t.towerType === 'king')!;
    king.hp = 1;
    w.players[0].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'fireball'), king.x, king.y);
    step(w, 3);
    expect(w.players[0].crowns).toBe(3);
    expect(w.timer.outcome).toEqual({ winner: 0, reason: 'king' });
  });

  it('重装騎士は建物だけを狙う', () => {
    const w = world();
    w.players[0].mana.value = 10;
    w.players[1].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'heavy_knight'), 3.5, 18);
    w.playCard(1, giveCard(w, 1, 'swordsman'), 3.5, 13);
    step(w, 6);
    const hk = w.combatants.find((c) => c.cardId === 'heavy_knight')!;
    const target = w.byId(hk.targetId)!;
    expect(target.kind === 'tower' || target.kind === 'building').toBe(true);
  });

  it('地上専用ユニットは飛竜を狙わない', () => {
    const w = world();
    w.players[0].mana.value = 10;
    w.players[1].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'swordsman'), 9, 18);
    w.playCard(1, giveCard(w, 1, 'wyvern'), 9, 14);
    step(w, 2);
    const sw = w.combatants.find((c) => c.cardId === 'swordsman')!;
    const wy = w.combatants.find((c) => c.cardId === 'wyvern')!;
    expect(sw.targetId).not.toBe(wy.id);
  });

  it('防衛砲台は寿命で自壊する', () => {
    const w = world();
    w.players[0].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'cannon'), 9, 21);
    expect(w.combatants.some((c) => c.cardId === 'cannon')).toBe(true);
    step(w, 32);
    expect(w.combatants.some((c) => c.cardId === 'cannon')).toBe(false);
  });

  it('地上ユニットは橋を渡って敵の塔を攻撃する', () => {
    const w = world();
    w.players[0].mana.value = 10;
    w.playCard(0, giveCard(w, 0, 'heavy_knight'), 8, 20);
    const guard = w.towers(1).filter((t) => t.towerType === 'guard');
    step(w, 40);
    expect(guard.some((g) => g.hp < g.maxHp)).toBe(true);
  });

  it('CPU 同士で試合が最後まで進み、勝敗が決まる', () => {
    for (const seed of [1, 2, 3]) {
      const w = world(seed);
      const a = new CpuController(w, 0, B.cpu.normal, new Rng(seed * 10));
      const b = new CpuController(w, 1, B.cpu.easy, new Rng(seed * 20));
      const dt = 1 / B.sim.tickRate;
      let played = 0;
      for (let i = 0; i < 300 * B.sim.tickRate && w.isRunning; i++) {
        a.update(dt);
        b.update(dt);
        w.update(dt);
        played += w.drainEvents().filter((e) => e.type === 'deploy').length;
        for (const p of w.players) {
          const d = p.deck;
          expect(d.hand.length + d.drawPile.length + d.discard.length).toBe(12);
          expect(d.hand.length).toBeLessThanOrEqual(B.deck.handLimit);
          expect(p.mana.value).toBeLessThanOrEqual(B.mana.max);
        }
      }
      expect(w.timer.phase).toBe('ended');
      expect(played).toBeGreaterThan(20);
    }
  });
});
