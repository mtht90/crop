import { describe, expect, it } from 'vitest';
import { ChartData, NoteData, emptyChart } from '../src/core/chart';
import { checkSixKey, convertTo6 } from '../src/core/convert6';
import { builtinCharts } from '../src/charts/samples';
import { GameEngine } from '../src/game/engine';
import { compileChart } from '../src/game/runtime';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** わざと意地悪な12レーン譜面（重なり・3〜4同時押し・斜めスライド・スライド中の連打） */
function nastyChart(seed: number): ChartData {
  const r = rng(seed);
  const notes: NoteData[] = [];
  for (let b = 0; b < 200; b += 0.25) {
    if (r() < 0.45) continue;
    const n = r() < 0.2 ? 3 : r() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const w = 1 + Math.floor(r() * 5);
      const lane = Math.floor(r() * (13 - w));
      const kind = r() < 0.7 ? 'tap' : r() < 0.5 ? 'flick' : 'trace';
      notes.push({ type: 'single', kind, beat: b, lane, width: w, ...(kind === 'flick' ? { dir: 'up' as const } : {}), ...(r() < 0.1 ? { critical: true } : {}) });
    }
    if (r() < 0.06) {
      const len = 1 + Math.floor(r() * 4);
      const pts = [];
      for (let k = 0; k <= len; k++) pts.push({ beat: b + k * (0.5 + r()), lane: Math.floor(r() * 9), width: 2 + Math.floor(r() * 3), visible: r() < 0.6 });
      notes.push({ type: 'slide', points: pts, ...(r() < 0.3 ? { endFlick: 'right' as const } : {}) });
    }
  }
  return emptyChart({ notes, bpms: [{ beat: 0, bpm: 150 }] });
}

describe('convertTo6', () => {
  const sources = [...builtinCharts(), nastyChart(1), nastyChart(2), nastyChart(3)];
  for (const maxChord of [2, 3, 0]) {
    for (const thin of ['none', 'light', 'easy'] as const) {
      it(`produces physically playable 6-key charts (maxChord=${maxChord}, thin=${thin})`, () => {
        for (const src of sources) {
          const { chart, report } = convertTo6(src, { maxChord, thin });
          expect(chart.keyMode).toBe(6);
          expect(checkSixKey(chart, maxChord)).toEqual([]);
          expect(report.output).toBeGreaterThan(0);
          const rt = compileChart(chart);
          const e = new GameEngine(rt, true);
          for (let t = -1; t <= rt.endTime + 1; t += 1 / 60) e.update(t);
          expect(e.allPerfect).toBe(true);
        }
      });
    }
  }

  it('keeps simple charts intact and preserves left/right order of chords', () => {
    const src = emptyChart({
      notes: [
        { type: 'single', kind: 'tap', beat: 0, lane: 0, width: 3 },
        { type: 'single', kind: 'tap', beat: 0, lane: 9, width: 3 },
        { type: 'single', kind: 'flick', beat: 1, lane: 4, width: 4, dir: 'up', critical: true },
      ],
    });
    const { chart, report } = convertTo6(src, { maxChord: 2, thin: 'none' });
    expect(report.dropped).toBe(0);
    const s = chart.notes.filter((n) => n.type === 'single');
    expect(s.map((n) => n.type === 'single' && [n.beat, n.lane, n.width])).toEqual([
      [0, 0, 2],
      [0, 10, 2],
      [1, 4, 2],
    ]);
    expect(s[2]).toMatchObject({ kind: 'flick', dir: 'up', critical: true });
  });

  it('turns a moving slide into key steps at the original crossing points', () => {
    const src = emptyChart({
      notes: [{ type: 'slide', points: [{ beat: 0, lane: 0, width: 2 }, { beat: 3, lane: 6, width: 2 }] }],
    });
    const { chart } = convertTo6(src, { maxChord: 2, thin: 'none' });
    const s = chart.notes[0];
    expect(s.type).toBe('slide');
    if (s.type !== 'slide') return;
    // 中心 1 → 7 を 3 拍で移動: 境目 2,4,6 を 0.5, 1.5, 2.5 拍でまたぐ
    const steps = s.points.filter((p) => p.visible === false).map((p) => [p.beat, p.lane]);
    expect(steps).toEqual([
      [0.5, 0],
      [0.5, 2],
      [1.5, 2],
      [1.5, 4],
      [2.5, 4],
      [2.5, 6],
    ]);
    expect(s.points[s.points.length - 1]).toMatchObject({ beat: 3, lane: 6, width: 2 });
  });

  it('moves a tap off the key held by a slide, and drops notes beyond the finger limit', () => {
    const src = emptyChart({
      notes: [
        { type: 'slide', points: [{ beat: 0, lane: 4, width: 2 }, { beat: 4, lane: 4, width: 2 }] },
        { type: 'single', kind: 'tap', beat: 1, lane: 4, width: 2 },
        { type: 'single', kind: 'tap', beat: 2, lane: 0, width: 2 },
        { type: 'single', kind: 'tap', beat: 2, lane: 10, width: 2 },
      ],
    });
    const { chart, report } = convertTo6(src, { maxChord: 2, thin: 'none' });
    expect(checkSixKey(chart, 2)).toEqual([]);
    const taps = chart.notes.filter((n) => n.type === 'single');
    expect(taps.find((n) => n.type === 'single' && n.beat === 1)?.type === 'single' && (taps.find((n) => n.type === 'single' && n.beat === 1) as any).lane).not.toBe(4);
    expect(taps.filter((n) => n.type === 'single' && n.beat === 2).length).toBe(1);
    expect(report.dropped).toBe(1);
  });

  it('breaks up fake jacks when the source pattern moves', () => {
    // 1レーン幅で隣同士のトリル（中心 4.5 / 5.5 はどちらもキー2）
    const notes: NoteData[] = [];
    for (let i = 0; i < 8; i++) notes.push({ type: 'single', kind: 'tap', beat: i * 0.25, lane: i % 2 ? 5 : 4, width: 1 });
    const { chart } = convertTo6(emptyChart({ notes }), { maxChord: 2, thin: 'none' });
    const lanes = chart.notes.map((n) => (n.type === 'single' ? n.lane : -1));
    for (let i = 1; i < lanes.length; i++) expect(lanes[i]).not.toBe(lanes[i - 1]);
  });
});
