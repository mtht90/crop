import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RIVALS } from '../../engine/decks';
import { byName } from '../../engine/cards';
import { CAST, CHAPTERS, PROLOGUE } from '../index';
import type { Beat } from '../types';

function walk(beats: Beat[], f: (b: Beat) => void) {
  for (const b of beats) {
    f(b);
    if (b.t === 'choice') for (const o of b.options) walk(o.then, f);
  }
}

describe('story', () => {
  it('has 12 chapters, each against a different existing rival', () => {
    expect(CHAPTERS.length).toBe(12);
    expect(new Set(CHAPTERS.map((c) => c.rival)).size).toBe(12);
    for (const c of CHAPTERS) expect(RIVALS.some((r) => r.id === c.rival), c.rival).toBe(true);
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(12);
  });
  it('every card shown in a scene exists, and chapter art exists', () => {
    const scenes: Beat[][] = [PROLOGUE];
    for (const c of CHAPTERS) {
      scenes.push(c.before, c.after, ...(c.lose ? [c.lose] : []));
      expect(existsSync(`public/assets/${c.art}.webp`), c.art).toBe(true);
    }
    for (const sc of scenes) walk(sc, (b) => { if (b.t === 'card') expect(() => byName(b.name), b.name).not.toThrow(); if (b.t === 'cg' && b.key) expect(existsSync(`public/assets/${b.key}.webp`), b.key).toBe(true); });
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
