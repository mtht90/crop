import { describe, expect, it } from 'vitest';
import { printingsOf } from '../autodeck';
import { card } from '../cards';
import { buildFromCode, decodeDeck, encodeDeck } from '../deckcode';
import { ALL_DECKS, expand } from '../decks';

const names = (ids: string[]) => ids.map((id) => card(id).name).sort();

describe('デッキコード', () => {
  it('every ready-made deck survives a round trip, by card name', () => {
    for (const d of ALL_DECKS) {
      const ids = expand(d.cards);
      const back = decodeDeck(encodeDeck(ids))!;
      expect(back.total, d.name).toBe(60);
      expect(back.cards.flatMap((e) => Array(e.n).fill(e.name)).sort(), d.name).toEqual(names(ids));
    }
  });
  it('reads codes typed loosely (lower case, spaces, O for 0) and refuses junk', () => {
    const code = encodeDeck(expand(ALL_DECKS[0].cards));
    expect(decodeDeck(code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o'))!.total).toBe(60);
    expect(decodeDeck('hello')).toBeNull();
    expect(decodeDeck('AB1-')).toBeNull();
  });
  it('builds from your own cards and reports what is missing', () => {
    const ids = expand(ALL_DECKS[0].cards);
    const d = decodeDeck(encodeDeck(ids))!;
    // nothing owned: only the basic energy can be used
    const none = buildFromCode(d, () => 0, printingsOf);
    expect(none.have).toBe(none.cards.length);
    expect(none.lines.filter((l) => !card(l.id).name.startsWith('基本')).every((l) => l.have === 0)).toBe(true);
    // everything owned: the whole deck
    const all = buildFromCode(d, () => 4, printingsOf);
    expect(all.have).toBe(60);
    expect(names(all.cards)).toEqual(names(ids));
  });
});
