import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { ALL_CARDS } from '../cards';
import { deckById, expand } from '../decks';
import { Game } from '../game';

describe('回復の特性', () => {
  it('can be used only once a turn, however many healers are out', () => {
    const g = Game.create([expand(deckById('water').cards), expand(deckById('fire').cards)], ['あなた', 'CPU'], 3);
    g.start();
    let n = 0;
    while (g.pending && g.pending.type !== 'action' && n++ < 40) g.answer(aiAnswer(g, 5, 0));
    const p = g.s.current;
    const pl = g.s.players[p];
    const naiad = ALL_CARDS.find((c) => c.name === 'ナイアド')!;
    // two healers on the bench, and everybody hurt
    pl.bench = [0, 1].map((i) => g.newSlot({ uid: 9000 + i, cid: naiad.id, owner: p } as never));
    for (const x of [pl.active!, ...pl.bench]) x.damage = 60;
    const heals = () => g.legalActions(p).filter((a) => a.t === 'ability');
    expect(heals().length).toBe(2);
    g.answer({ type: 'action', action: heals()[0] });
    while (g.pending && g.pending.type === 'slot') g.answer({ type: 'slot', pos: g.pending.options[0] });
    expect(heals().length).toBe(0);
  });
});
