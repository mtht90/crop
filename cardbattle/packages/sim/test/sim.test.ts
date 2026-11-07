import { describe, expect, it } from 'vitest';
import {
  BattleSimulation,
  parseReplay,
  ReplaySession,
  serializeReplay,
  TICK_RATE,
  UNIT,
  type CardStats,
} from '../src/index';
import { botMatch, content, runToEnd } from './helpers';

const deck = (): CardStats[] => content.starterDeck.map((id) => content.cards.require(id));
const newSim = (seed = 1) => new BattleSimulation(content.rules, deck(), deck(), seed);
const stepSeconds = (sim: BattleSimulation, s: number) => {
  for (let i = 0; i < s * TICK_RATE; i++) {
    sim.clearEvents();
    sim.step();
  }
};
const tiles = (x: number, y: number) => ({ x: x * UNIT, y: y * UNIT });

describe('マナ', () => {
  it('開始5、2.8秒で1回復、最大10', () => {
    const sim = newSim();
    expect(sim.mana(0)).toBe(5);
    stepSeconds(sim, 2.8);
    expect(sim.mana(0)).toBe(6);
    stepSeconds(sim, 30);
    expect(sim.mana(0)).toBe(10);
  });

  it('残り60秒から2倍、延長戦の最後60秒は3倍', () => {
    const sim = newSim();
    stepSeconds(sim, 119);
    expect(sim.manaMultiplier).toBe(1);
    stepSeconds(sim, 1);
    expect(sim.manaMultiplier).toBe(2);
    stepSeconds(sim, 60);
    expect(sim.phase).toBe('overtime');
    expect(sim.manaMultiplier).toBe(2);
    stepSeconds(sim, 60);
    expect(sim.manaMultiplier).toBe(3);
  });
});

describe('手札と配置', () => {
  it('使ったカードはデッキの一番後ろに回り、次のカードが入る', () => {
    const sim = newSim();
    const p = sim.players[0];
    const used = p.hand[0];
    const next = p.queue[0];
    expect(sim.tryAccept({ player: 0, cardId: used.id, pos: tiles(9, 10), issueTick: 0 })).toBe('none');
    expect(p.hand[0]).toBe(next);
    expect(p.queue[p.queue.length - 1]).toBe(used);
    expect(p.hand.length).toBe(4);
    expect(p.queue.length).toBe(4);
  });

  it('ユニットは自陣のみ、呪文はどこでも', () => {
    const sim = newSim();
    const knight = content.cards.require('iron_knight');
    const fire = content.cards.require('fire_orb');
    expect(sim.isValidPlacement(0, knight, tiles(9, 10))).toBe(true);
    expect(sim.isValidPlacement(0, knight, tiles(9, 20))).toBe(false);
    expect(sim.isValidPlacement(1, knight, tiles(9, 20))).toBe(true);
    expect(sim.isValidPlacement(0, knight, tiles(3.5, 6.5))).toBe(false); // タワーの上
    expect(sim.isValidPlacement(0, fire, tiles(9, 28))).toBe(true);
  });

  it('相手のサイドタワーを壊すとそのレーンの配置範囲が広がる', () => {
    const sim = newSim();
    const knight = content.cards.require('iron_knight');
    expect(sim.isValidPlacement(0, knight, tiles(3, 19))).toBe(false);
    sim.getTower(1, 'left')!.hp = 1;
    (sim as any).applyDamage(sim.getTower(1, 'left')!, 10, -1);
    expect(sim.isValidPlacement(0, knight, tiles(3, 19))).toBe(true);
    expect(sim.isValidPlacement(0, knight, tiles(14, 19))).toBe(false);
    expect(sim.players[0].crowns).toBe(1);
  });

  it('マナが足りないと拒否される', () => {
    const sim = newSim();
    sim.players[0].manaUnits = 0;
    const c = sim.players[0].hand[0];
    expect(sim.tryAccept({ player: 0, cardId: c.id, pos: tiles(9, 10), issueTick: 0 })).toBe('notEnoughMana');
  });

  it('配置は0.3秒後に実行され、さらに1秒の出撃待ちがある', () => {
    const sim = newSim();
    sim.players[0].hand[0] = content.cards.require('iron_knight');
    sim.tryAccept({ player: 0, cardId: 'iron_knight', pos: tiles(9, 10), issueTick: 0 });
    stepSeconds(sim, 0.25);
    expect(sim.entities.filter((e) => e.kind === 'troop').length).toBe(0);
    stepSeconds(sim, 0.1);
    const k = sim.entities.find((e) => e.kind === 'troop')!;
    expect(k).toBeDefined();
    const start = { ...k.pos };
    stepSeconds(sim, 0.9);
    expect(k.pos).toEqual(start);
    stepSeconds(sim, 0.5);
    expect(k.pos).not.toEqual(start);
  });
});

describe('タワー', () => {
  it('キングタワーはダメージを受けるまで休止している', () => {
    const sim = newSim();
    const king = sim.getTower(1, 'king')!;
    expect(king.active).toBe(false);
    (sim as any).applyDamage(king, 1, -1);
    expect(king.active).toBe(true);
  });

  it('キングタワーを壊すと即勝利（3クラウン）', () => {
    const sim = newSim();
    (sim as any).applyDamage(sim.getTower(1, 'king')!, 99999, -1);
    expect(sim.isOver).toBe(true);
    expect(sim.winner).toBe(0);
    expect(sim.players[0].crowns).toBe(3);
  });

  it('延長戦はサドンデス', () => {
    const sim = newSim();
    stepSeconds(sim, 180);
    expect(sim.phase).toBe('overtime');
    (sim as any).applyDamage(sim.getTower(0, 'right')!, 99999, -1);
    expect(sim.isOver).toBe(true);
    expect(sim.winner).toBe(1);
    expect(sim.endReason).toBe('suddenDeath');
  });

  it('延長でも決まらなければ一番低いタワーのHPで比べる', () => {
    const sim = newSim();
    sim.getTower(0, 'left')!.hp = 1000;
    sim.getTower(1, 'right')!.hp = 900;
    stepSeconds(sim, 300);
    expect(sim.isOver).toBe(true);
    expect(sim.endReason).toBe('towerHp');
    expect(sim.winner).toBe(0);
  });

  it('何もしなければ引き分け', () => {
    const sim = newSim();
    stepSeconds(sim, 300);
    expect(sim.endReason).toBe('draw');
    expect(sim.winner).toBe(-1);
  });
});

describe('ユニット', () => {
  it('騎士は橋を渡って相手のサイドタワーを攻撃する', () => {
    const sim = newSim();
    sim.players[0].hand[0] = content.cards.require('iron_knight');
    sim.tryAccept({ player: 0, cardId: 'iron_knight', pos: tiles(3, 12), issueTick: 0 });
    stepSeconds(sim, 30);
    expect(sim.getTower(1, 'left')!.hp).toBeLessThan(3052);
  });

  it('岩の巨兵は建物だけを狙う（騎士を無視してタワーへ）', () => {
    const sim = newSim();
    sim.players[0].hand[0] = content.cards.require('rock_giant');
    sim.players[1].hand[0] = content.cards.require('iron_knight');
    sim.tryAccept({ player: 0, cardId: 'rock_giant', pos: tiles(14, 13), issueTick: 0 });
    sim.tryAccept({ player: 1, cardId: 'iron_knight', pos: tiles(14, 19), issueTick: 0 });
    stepSeconds(sim, 40);
    const giant = sim.entities.find((e) => e.card?.id === 'rock_giant');
    expect(sim.getTower(1, 'right')!.hp).toBeLessThan(3052);
    if (giant) expect(sim.getEntity(giant.targetId)?.kind).not.toBe('troop');
  });

  it('雷撃は骨の軍団を一掃する', () => {
    const sim = newSim();
    sim.players[0].hand[0] = content.cards.require('bone_legion');
    sim.players[1].hand[0] = content.cards.require('thunder_strike');
    sim.tryAccept({ player: 0, cardId: 'bone_legion', pos: tiles(9, 10), issueTick: 0 });
    stepSeconds(sim, 0.5);
    sim.tryAccept({ player: 1, cardId: 'thunder_strike', pos: tiles(9.5, 10.5), issueTick: sim.tick });
    stepSeconds(sim, 0.5);
    expect(sim.entities.filter((e) => e.card?.id === 'bone_legion').length).toBe(0);
  });

  it('地上専用の砲台は翼竜を攻撃できない', () => {
    const sim = newSim();
    sim.players[0].hand[0] = content.cards.require('guard_cannon');
    sim.players[1].hand[0] = content.cards.require('wyvern');
    sim.tryAccept({ player: 0, cardId: 'guard_cannon', pos: tiles(9, 12), issueTick: 0 });
    sim.tryAccept({ player: 1, cardId: 'wyvern', pos: tiles(9, 18), issueTick: 0 });
    stepSeconds(sim, 8);
    const w = sim.entities.find((e) => e.card?.id === 'wyvern')!;
    expect(w.hp).toBe(w.maxHp);
  });
});

describe('BOT対戦とリプレイ', () => {
  it.each([1, 2, 3, 42])('BOT同士の試合が最後まで進む (seed=%i)', (seed) => {
    const s = botMatch(seed);
    runToEnd(s);
    expect(s.simulation.isOver).toBe(true);
    expect(s.simulation.acceptedLog.length).toBeGreaterThan(10);
  });

  it('同じコマンド列を再生すると同じ結果になる', () => {
    for (const seed of [7, 99, 1234]) {
      const s = botMatch(seed, 'hard', 'easy');
      runToEnd(s);
      const replay = parseReplay(serializeReplay(s.createReplay()));
      const r = new ReplaySession(replay, content.rules, content.cards);
      r.runToEnd();
      expect(r.simulation.tick).toBe(replay.finalTick);
      expect(r.simulation.winner).toBe(replay.winner);
      expect(r.simulation.stateHash()).toBe(replay.finalHash);
    }
  });

  it('むずかしいBOTはかんたんBOTに勝ち越す', () => {
    let hardWins = 0;
    let easyWins = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = botMatch(seed, 'hard', 'easy');
      runToEnd(s);
      if (s.simulation.winner === 0) hardWins++;
      if (s.simulation.winner === 1) easyWins++;
    }
    expect(hardWins).toBeGreaterThan(easyWins);
  });
});
