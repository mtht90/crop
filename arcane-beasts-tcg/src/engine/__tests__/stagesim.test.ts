import { describe, expect, it } from 'vitest';
import { aiAnswer } from '../ai';
import { deckById, expand } from '../decks';
import { Game } from '../game';
import { STAGE_EVENTS, stagesOf } from '../../state/stages';

describe('ステージイベントのバトル', () => {
  it('every stage rule plays out to the end', () => {
    const ev = STAGE_EVENTS[0];
    for (const st of stagesOf(ev)) {
      const g = Game.create([expand(deckById('fire')!.cards), expand(deckById(st.deck)!.cards)], ['あなた', st.name], 100 + st.index);
      g.s.mods = st.mods;
      g.start();
      let n = 0;
      let acts = 0;
      let last = 0;
      while (g.pending && n++ < 6000) {
        if (g.s.turn !== last) {
          last = g.s.turn;
          acts = 0;
        }
        if (g.pending.type === 'action') acts++;
        g.answer(aiAnswer(g, 4, acts));
      }
      expect(g.over, st.label).toBe(true);
      expect(g.s.players[0].prizes.length + g.s.players[1].prizes.length).toBeLessThanOrEqual((st.mods.prizes ?? 6) * 2);
    }
  });
});
