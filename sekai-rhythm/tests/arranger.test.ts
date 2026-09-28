import { describe, expect, it } from 'vitest';
import { ChartData } from '../src/core/chart';
import { builtinCharts } from '../src/charts/samples';
import { SONGS } from '../src/music/song';
import { GameEngine } from '../src/game/engine';
import { compileChart, slideRangeAt } from '../src/game/runtime';

const EPS = 1e-6;
const keysOf = (lane: number, width: number) => [0, 1, 2, 3, 4, 5].filter((k) => k * 2 < lane + width - EPS && k * 2 + 2 > lane + EPS);

/** 12レーン譜面を 6 キーで押せるか（同じキーの同時押し・スライド中のキー・指の本数） */
function playabilityProblems(chart: ChartData, maxFingers = 2): string[] {
  const rt = compileChart(chart);
  const problems: string[] = [];
  const heads = rt.objs.filter((o) => o.kind !== 'tick' && !(o.kind === 'slideEnd'));
  const byTime = new Map<number, typeof heads>();
  for (const o of heads) byTime.set(Math.round(o.time * 1e4), [...(byTime.get(Math.round(o.time * 1e4)) ?? []), o]);
  for (const [, objs] of byTime) {
    const t = objs[0].time;
    const used = new Set<number>();
    for (const o of objs) {
      const ks = keysOf(o.lane, o.width);
      if (ks.every((k) => used.has(k))) problems.push(`同じキーの同時押し @${o.beat}`);
      ks.forEach((k) => used.add(k));
    }
    const holding = rt.slides.filter((s) => s.startTime < t - 1e-4 && s.endTime > t - 1e-4);
    const held = new Set<number>();
    for (const s of holding) {
      const [l, r] = slideRangeAt(s, t);
      keysOf(l, r - l).forEach((k) => held.add(k));
    }
    for (const o of objs) if (keysOf(o.lane, o.width).every((k) => held.has(k))) problems.push(`スライド中のキーにノーツ @${o.beat}`);
    if (objs.length + holding.length > maxFingers) problems.push(`指が${objs.length + holding.length}本必要 @${objs[0].beat}`);
  }
  return problems;
}

describe('built-in charts', () => {
  const charts = builtinCharts();

  it('builds all difficulties for both songs', () => {
    expect(charts.map((c) => c.id)).toEqual([
      'demo-starlight-normal',
      'demo-starlight-hard',
      'demo-starlight-expert',
      'demo-starlight-master',
      'demo-neon-hard',
      'demo-neon-expert',
      'demo-neon-master',
    ]);
  });

  for (const c of charts) {
    it(`${c.id}: every note starts on a sound in the score`, () => {
      const song = SONGS[(c.audio as { song: string }).song];
      const sounds = new Set<number>();
      for (const s of song.sections) {
        sounds.add(Math.round(s.start * 1000));
        for (const n of s.notes) sounds.add(Math.round(n.beat * 1000));
      }
      for (const d of song.drums) if (d.type !== 'hat') sounds.add(Math.round(d.beat * 1000));
      sounds.add(Math.round(song.endBeat * 1000));
      const off: number[] = [];
      for (const n of c.notes) {
        const b = n.type === 'single' ? n.beat : n.points[0].beat;
        if (!sounds.has(Math.round(b * 1000))) off.push(b);
      }
      expect(off).toEqual([]);
    });

    it(`${c.id}: is playable with 6 keys and two hands`, () => {
      expect(playabilityProblems(c)).toEqual([]);
    });

    it(`${c.id}: autoplay reaches ALL PERFECT`, () => {
      const rt = compileChart(c);
      const e = new GameEngine(rt, true);
      for (let t = -1; t <= rt.endTime + 1; t += 1 / 60) e.update(t);
      expect(e.allPerfect).toBe(true);
    });
  }

  it('difficulty increases note density', () => {
    const count = (id: string) => compileChart(charts.find((c) => c.id === id)!).objs.filter((o) => !o.hidden).length;
    expect(count('demo-starlight-normal')).toBeLessThan(count('demo-starlight-hard'));
    expect(count('demo-starlight-hard')).toBeLessThan(count('demo-starlight-expert'));
    expect(count('demo-starlight-expert')).toBeLessThan(count('demo-starlight-master'));
    expect(count('demo-neon-hard')).toBeLessThan(count('demo-neon-expert'));
    expect(count('demo-neon-expert')).toBeLessThan(count('demo-neon-master'));
  });
});
