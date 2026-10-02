import { describe, expect, it } from 'vitest';
import { openPack, SET_SERIES } from '../store';
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
  it('every theme pack has enough cards and always yields five cards of its theme', () => {
    for (const t of THEMES) {
      const b = themeBooster(t);
      for (let i = 0; i < 60; i++) {
        const p = openPack(b);
        expect(p.cards.length).toBe(5);
        for (const c of p.cards) expect(c && c.kind === 'monster' && t.test(c), `${t.id}: ${c?.name}`).toBe(true);
      }
    }
  });
  it('changes at local midnight', () => {
    const t = new Date(2026, 9, 2, 23, 59, 30).getTime();
    expect(msToNextLineup(t)).toBe(30_000);
  });
});
