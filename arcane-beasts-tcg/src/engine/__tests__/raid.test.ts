import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { deckById, expand } from '../decks';
import { Game, maxHp } from '../game';
import { RAID_TRY_GEMS, raidBattleGems, raidLapBonus, raidLapHp, raidLapReward, raidNow } from '../../state/raid';
import { weekKey } from '../../state/progress';
import { BOSSES, RAID_CARDS, RAID_MULT } from '../cards/bosses';
import { ALL_CARDS } from '../cards';
import { validateDeck } from '../decks';

function playRaid(bossId: string, start: number, seed: number) {
  const g = Game.createRaid(expand(deckById('fire').cards), bossId, start, ['あなた', 'ボス'], seed);
  g.start();
  let steps = 0;
  let acts = 0;
  let last = 0;
  while (g.pending && steps++ < 8000) {
    if (g.s.turn !== last) {
      last = g.s.turn;
      acts = 0;
    }
    if (g.pending.type === 'action') acts++;
    g.answer(aiAnswer(g, 5, acts));
  }
  return g;
}

describe('ボスレイド', () => {
  it('the boss stands alone with the damage of the week, you need one prize', () => {
    const b = BOSSES[1];
    const g = Game.createRaid(expand(deckById('fire').cards), b.id, 1234, ['あなた', 'ボス'], 3);
    g.start();
    let n = 0;
    while (g.pending && g.pending.type !== 'action' && n++ < 30) g.answer(aiAnswer(g, 5, 0));
    expect(g.s.players[1].active?.damage).toBe(1234);
    expect(g.s.players[1].bench.length).toBe(0);
    expect(g.s.players[1].deck.length).toBe(0);
    expect(g.s.players[0].prizes.length).toBe(1);
    expect(g.s.players[1].prizes.length).toBe(6);
  });
  it('plays out to the end: the boss attacks in turn and takes multiplied damage', () => {
    for (const [i, b] of BOSSES.entries()) {
      const g = playRaid(b.id, 0, 10 + i);
      expect(g.over, b.name).toBe(true);
      const dealt = g.s.players[1].active?.damage ?? b.hp;
      expect(dealt % RAID_MULT, b.name).toBe(0);
      expect(g.s.raid!.moves, b.name).toBeGreaterThan(0);
    }
  });
  it('an almost beaten boss can be finished: one prize wins', () => {
    const b = BOSSES[0];
    const g = playRaid(b.id, b.hp - 10, 7);
    expect(g.s.winner).toBe(0);
  });
  it('a lap sets the boss HP and makes its attacks hit harder; damage carries over', () => {
    const b = BOSSES[0];
    const g = Game.createRaid(expand(deckById('fire').cards), b.id, 700, ['あなた', 'ボス'], 5, {}, { hp: 1800, bonus: 10 });
    g.start();
    let n = 0;
    while (g.pending && g.pending.type !== 'action' && n++ < 30) g.answer(aiAnswer(g, 5, 0));
    const boss = g.s.players[1].active!;
    expect(boss.damage).toBe(700);
    expect(maxHp(g.s, boss)).toBe(1800);
    expect(g.s.raid!.bonus).toBe(10);
  });
  it('raid laps: clearing pays more than the tries it takes; lap 2 is tougher', () => {
    expect(raidLapHp(2)).toBeGreaterThan(raidLapHp(1));
    expect(raidLapBonus(2)).toBeGreaterThan(raidLapBonus(1));
    expect(raidLapReward(1)).toBeGreaterThan(RAID_TRY_GEMS * 10);
    expect(raidLapReward(2)).toBeGreaterThan(raidLapReward(1));
    // a raid pays when the boss falls (a big lump, like ぷにぷに's campaigns), not per battle
    expect(raidBattleGems(99999)).toBe(0);
    expect(raidLapReward(1)).toBeGreaterThanOrEqual(3000);
    // a save from before laps keeps this week's tries (no second free try)
    const old = { key: weekKey(), bossId: BOSSES[0].id, tries: 3, wins: 1, best: 0, fastest: 0 } as unknown as Parameters<typeof raidNow>[0];
    const r = raidNow(old);
    expect(r.tries).toBe(3);
    expect(r.laps).toBe(0);
    expect(r.damage).toBe(0);
  });
  it('raid cards: never in the regular card list, one per deck', () => {
    for (const c of RAID_CARDS) expect(ALL_CARDS.some((x) => x.id === c.id), c.id).toBe(false);
    const base = expand(deckById('fire').cards);
    const two = [...base.slice(0, 58), RAID_CARDS[0].id, RAID_CARDS[1].id];
    expect(validateDeck(two).some((e) => e.includes('レイドカード'))).toBe(true);
    const one = [...base.slice(0, 59), RAID_CARDS[0].id];
    expect(validateDeck(one).some((e) => e.includes('レイドカード'))).toBe(false);
  });
});
