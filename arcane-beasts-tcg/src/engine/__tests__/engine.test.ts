import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { ALL_DECKS, deckById, expand, validateDeck } from '../decks';
import { canPay, Game, maxHp } from '../game';
import { ALL_CARDS, byName } from '../cards';

function playOut(d0: string, d1: string, seed: number) {
  const a = ALL_DECKS.find((d) => d.id === d0)!;
  const b = ALL_DECKS.find((d) => d.id === d1)!;
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
    for (const d of ALL_DECKS) expect(validateDeck(expand(d.cards)), d.name).toEqual([]);
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
  const ids = ALL_DECKS.map((d) => d.id);
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

describe('第2弾 rules', () => {
  function started(seed = 7) {
    const g = Game.create([expand(deckById('dragoon').cards), expand(deckById('lich').cards)], ['A', 'B'], seed);
    g.start();
    // answer setup/mulligan prompts until the first main-phase decision
    let n = 0;
    while (g.pending && g.pending.type !== 'action' && n++ < 50) g.answer(aiAnswer(g, 'normal', 0));
    return g;
  }
  const inst = (g: Game, cid: string, owner: 0 | 1) => ({ uid: 90000 + Math.floor(Math.random() * 9999), cid, owner });

  it('EX knocked out gives 3 prizes, Ω gives 2', () => {
    for (const [name, want] of [['ドラグーン', 3], ['トリトン', 2], ['ドレイクファイター', 1]] as const) {
      const g = started();
      const victim = g.s.players[1];
      const slot = g.newSlot(inst(g, byName(name).id, 1));
      slot.damage = 999;
      victim.bench.push(slot);
      const before = g.s.players[0].prizes.length;
      const it = g.resolveKOs();
      it.next();
      expect(before - g.s.players[0].prizes.length, name).toBe(want);
    }
  });

  it('亡者の港 raises HP only for monsters without a rule box', () => {
    const g = started();
    const plain = g.newSlot(inst(g, byName('ドレイクファイター').id, 0));
    const ex = g.newSlot(inst(g, byName('ドラグーン').id, 0));
    g.s.stadium = inst(g, byName('亡者の港').id, 0);
    expect(maxHp(g.s, plain)).toBe(120);
    expect(maxHp(g.s, ex)).toBe(300);
  });

  it('EX cards carry their flag and rarity', () => {
    const exs = ALL_CARDS.filter((c) => c.kind === 'monster' && c.ex && !c.variant);
    expect(exs.length).toBe(5);
    for (const c of exs) expect(c.rarity).toBe('RR');
  });
});
