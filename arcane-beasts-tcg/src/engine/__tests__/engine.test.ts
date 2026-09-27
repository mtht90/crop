import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { expand, STARTER_DECKS, validateDeck } from '../decks';
import { canPay, Game } from '../game';
import { ALL_CARDS } from '../cards';

function playOut(d0: string, d1: string, seed: number) {
  const a = STARTER_DECKS.find((d) => d.id === d0)!;
  const b = STARTER_DECKS.find((d) => d.id === d1)!;
  const g = Game.create([expand(a.cards), expand(b.cards)], ['A', 'B'], seed);
  g.start();
  let steps = 0;
  let actions = 0;
  let lastTurn = 0;
  while (g.pending && steps++ < 5000) {
    if (g.s.turn !== lastTurn) {
      lastTurn = g.s.turn;
      actions = 0;
    }
    const pr = g.pending;
    if (pr.type === 'action') actions++;
    g.answer(aiAnswer(g, 'normal', actions));
  }
  return g;
}

describe('cards', () => {
  it('all starter decks are legal', () => {
    for (const d of STARTER_DECKS) expect(validateDeck(expand(d.cards)), d.name).toEqual([]);
  });
  it('card ids unique', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('evolution chains resolve', () => {
    const names = new Set(ALL_CARDS.map((c) => c.name));
    for (const c of ALL_CARDS) if (c.kind === 'monster' && c.evolvesFrom) expect(names.has(c.evolvesFrom), c.name).toBe(true);
  });
});

describe('cost payment', () => {
  it('handles colored + colorless', () => {
    expect(canPay([['fire'], ['fire']], ['fire', 'colorless'])).toBe(true);
    expect(canPay([['water'], ['fire']], ['fire', 'fire'])).toBe(false);
    expect(canPay([['colorless'], ['colorless'], ['fire']], ['fire', 'colorless', 'colorless'])).toBe(true);
    expect(canPay([['fire', 'water'], ['water']], ['water', 'fire'])).toBe(true);
  });
});

describe('AI vs AI', () => {
  const ids = STARTER_DECKS.map((d) => d.id);
  let seed = 1;
  for (const a of ids) {
    for (const b of ids) {
      if (a > b) continue;
      it(`${a} vs ${b}`, () => {
        for (let k = 0; k < 2; k++) {
          const g = playOut(a, b, seed++);
          expect(g.over, `game did not finish (turn ${g.s.turn})`).toBe(true);
        }
      }, 60000);
    }
  }
});
