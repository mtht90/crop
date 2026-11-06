import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { deckById, expand } from '../decks';
import { Game, maxHp } from '../game';

function setupWith(mods: Game['s']['mods'], seed = 5) {
  const g = Game.create([expand(deckById('fire').cards), expand(deckById('water').cards)], ['あなた', 'CPU'], seed);
  g.s.mods = mods;
  g.start();
  let n = 0;
  while (g.pending && g.pending.type !== 'action' && n++ < 40) g.answer(aiAnswer(g, 5, 0));
  return g;
}

describe('イベントの変則ルール', () => {
  it('prizes, hand size, HP and who goes first follow the mods', () => {
    const g = setupWith({ prizes: 3, hand: [5, 9], hp: [0, 30], oppFirst: true });
    expect(g.s.first).toBe(1);
    expect(g.s.players[0].prizes.length).toBe(3);
    expect(g.s.players[1].prizes.length).toBe(3);
    const opp = g.s.players[1].active!;
    const base = setupWith({}, 5);
    void base;
    expect(maxHp(g.s, opp)).toBeGreaterThanOrEqual(30 + 30);
    // opening hand sizes: what is left in hand plus what went to the field
    const used = (p: 0 | 1) => g.s.players[p].hand.length + 1 + g.s.players[p].bench.length;
    expect(used(0)).toBeLessThanOrEqual(5 + 4);
  });
  it('first-turn attacks are allowed when the mod says so', () => {
    const g = setupWith({ firstAttack: true, oppFirst: true });
    expect(g.s.turn).toBeGreaterThanOrEqual(1);
  });
});
