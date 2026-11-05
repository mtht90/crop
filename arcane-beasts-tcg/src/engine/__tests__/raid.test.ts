import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { deckById, expand } from '../decks';
import { Game } from '../game';
import { BOSSES, RAID_MULT } from '../cards/bosses';

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
});
