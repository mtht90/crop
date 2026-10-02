import { describe, expect, it } from 'vitest';
import { openPack, SET_SERIES } from '../store';
import { ALL_CARDS } from '../../engine/cards';
import { lineupFor, THEMES, themeBooster, msToNextLineup } from '../themes';

describe('daily line-up', () => {
  it('always offers two different series, and every theme comes round within a few weeks', () => {
    const seen = new Set<string>();
    for (let d = 20000; d < 20040; d++) {
      const [a, b] = lineupFor(d, SET_SERIES);
      expect(a.id).not.toBe(b.id);
      seen.add(a.id).add(b.id);
    }
    for (const t of THEMES) expect(seen.has(t.id), t.id).toBe(true);
    for (const s of ['AB1', 'AB2', 'AB3']) expect(seen.has(s), s).toBe(true);
  });
  it('daily packs draw from every set and favour their types', () => {
    for (const t of THEMES) {
      const b = themeBooster(t);
      let fav = 0;
      let mons = 0;
      for (let i = 0; i < 200; i++) {
        const p = openPack(b);
        expect(p.cards.length).toBe(5);
        for (const c of p.cards) {
          expect(c, t.id).toBeTruthy();
          if (c.kind !== 'monster') continue;
          mons++;
          if (t.types.includes(c.type)) fav++;
        }
      }
      // a fair draw would give about 1/8 (one type) or 1/4 (two types)
      expect(fav / mons, t.id).toBeGreaterThan(t.types.length > 1 ? 0.45 : 0.33);
    }
  });
  it('every daily pack mascot is a real card', () => {
    for (const t of THEMES) expect(ALL_CARDS.some((c) => c.name === t.mascot), t.mascot).toBe(true);
  });
  it('changes at local midnight', () => {
    const t = new Date(2026, 9, 2, 23, 59, 30).getTime();
    expect(msToNextLineup(t)).toBe(30_000);
  });
});
