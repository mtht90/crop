import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RIVALS } from '../../engine/decks';
import { CAST, CHAPTERS, PROLOGUE } from '../index';
import type { Beat } from '../types';

function walk(beats: Beat[], f: (b: Beat) => void) {
  for (const b of beats) {
    f(b);
    if (b.t === 'choice') for (const o of b.options) walk(o.then, f);
  }
}

describe('story', () => {
  it('has 21 chapters, exactly one per rival', () => {
    expect(CHAPTERS.length).toBe(21);
    expect(CHAPTERS.map((c) => c.rival).sort()).toEqual(RIVALS.map((r) => r.id).sort());
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(21);
  });
  it('every scene only uses known characters, moods and backgrounds', () => {
    const scenes: Beat[][] = [PROLOGUE];
    for (const c of CHAPTERS) scenes.push(c.before, c.after, ...(c.lose ? [c.lose] : []));
    for (const sc of scenes)
      walk(sc, (b) => {
        if (b.t === 'show' || b.t === 'hide' || b.t === 'mood' || b.t === 'move') {
          expect(CAST[b.id], `cast ${b.id}`).toBeTruthy();
          if (b.t === 'show' && b.mood) expect(CAST[b.id].look[b.mood], `${b.id}:${b.mood}`).toBeTruthy();
          if (b.t === 'mood') expect(CAST[b.id].look[b.mood], `${b.id}:${b.mood}`).toBeTruthy();
        }
        if (b.t === 'say' && b.who) {
          expect(CAST[b.who], `speaker ${b.who}`).toBeTruthy();
          if (b.mood) expect(CAST[b.who].look[b.mood], `${b.who}:${b.mood}`).toBeTruthy();
        }
        if (b.t === 'bg') expect(existsSync(`public/assets/${b.key}.webp`), b.key).toBe(true);
      });
  });
  it('every rival portrait and scene image exists', () => {
    for (const r of RIVALS) {
      expect(existsSync(`public/assets/art/${r.portrait}.webp`), r.portrait).toBe(true);
      expect(existsSync(`public/assets/${r.scene}.webp`), r.scene).toBe(true);
    }
  });
});
