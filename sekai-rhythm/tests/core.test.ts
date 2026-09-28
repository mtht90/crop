import { describe, expect, it } from 'vitest';
import { TimingMap, emptyChart, normalizeChart, parseYouTubeId } from '../src/core/chart';
import { parseSus } from '../src/core/sus';
import { builtinCharts } from '../src/charts/samples';
import { GameEngine, WINDOWS } from '../src/game/engine';
import { compileChart } from '../src/game/runtime';

describe('TimingMap', () => {
  it('converts beats and seconds across BPM changes', () => {
    const t = new TimingMap(
      [
        { beat: 0, bpm: 120 },
        { beat: 8, bpm: 60 },
      ],
      1.5,
    );
    expect(t.beatToTime(0)).toBeCloseTo(1.5);
    expect(t.beatToTime(8)).toBeCloseTo(5.5);
    expect(t.beatToTime(10)).toBeCloseTo(7.5);
    expect(t.timeToBeat(7.5)).toBeCloseTo(10);
    expect(t.timeToBeat(1.0)).toBeCloseTo(-1);
  });
});

describe('parseYouTubeId', () => {
  it('accepts common URL shapes', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});

describe('normalizeChart', () => {
  it('round-trips and clamps lanes', () => {
    const c = emptyChart({ notes: [{ type: 'single', kind: 'tap', beat: 1, lane: 11, width: 4 }] });
    const n = normalizeChart(JSON.parse(JSON.stringify(c)));
    expect(n.notes[0]).toMatchObject({ lane: 8, width: 4 });
  });
});

describe('parseSus', () => {
  const sus = `
#TITLE "Test Song"
#ARTIST "Someone"
#DIFFICULTY 3
#PLAYLEVEL 28
#WAVEOFFSET 0.5
#REQUEST "ticks_per_beat 480"
#BPM01: 150
#00002: 4
#00008: 01
#00012: 1400000000000000
#00016: 0000240000000000
#00056: 0000140000000000
#0011a: 2200000000000000
#00134a: 13000000
#00136a: 00330000
#00134a: 00002300
#00234b: 14000000
#00234b: 00000024
#00254: 00000014
`;
  it('reads taps, flicks, criticals and slides', () => {
    const c = parseSus(sus);
    expect(c.title).toBe('Test Song');
    expect(c.difficulty).toBe('expert');
    expect(c.level).toBe(28);
    expect(c.offset).toBeCloseTo(-0.5);
    expect(c.bpms[0].bpm).toBe(150);
    const singles = c.notes.filter((n) => n.type === 'single');
    const slides = c.notes.filter((n) => n.type === 'slide');
    // #00012: lane 0 width 4 at beat 0 (tap)
    expect(singles).toContainEqual({ type: 'single', kind: 'tap', beat: 0, lane: 0, width: 4 });
    // #00016: critical at beat 1 on lane 4, with flick up from #00056
    expect(singles).toContainEqual({ type: 'single', kind: 'flick', beat: 1, lane: 4, width: 4, critical: true, dir: 'up' });
    // #0011a: lane 'a' = 10 -> pjsk lane 8, width 2, critical
    expect(singles).toContainEqual({ type: 'single', kind: 'tap', beat: 4, lane: 8, width: 2, critical: true });
    expect(slides.length).toBe(2);
    const s1 = slides.find((s) => s.type === 'slide' && s.points[0].beat === 4)!;
    expect(s1.type === 'slide' && s1.points.map((p) => [p.beat, p.lane, p.width])).toEqual([
      [4, 2, 3],
      [5, 4, 3],
      [6, 2, 3],
    ]);
    const s2 = slides.find((s) => s.type === 'slide' && s.points[0].beat === 8)!;
    expect(s2.type === 'slide' && s2.endFlick).toBe('up');
  });
});

describe('GameEngine', () => {
  it('autoplay gets ALL PERFECT with max score on every built-in chart', () => {
    for (const chart of builtinCharts()) {
      const rt = compileChart(chart);
      const e = new GameEngine(rt, true);
      for (let t = -2; t <= rt.endTime + 1; t += 1 / 60) e.update(t);
      expect(e.finished).toBe(true);
      expect(e.allPerfect).toBe(true);
      expect(e.score).toBe(1_000_000);
      expect(e.stats.maxCombo).toBe(rt.totalCombo);
    }
  });

  const mk = (notes: any[]) => compileChart(emptyChart({ bpms: [{ beat: 0, bpm: 60 }], notes }));

  it('judges taps by timing and key lanes', () => {
    const rt = mk([
      { type: 'single', kind: 'tap', beat: 1, lane: 0, width: 2 },
      { type: 'single', kind: 'tap', beat: 2, lane: 4, width: 2 },
      { type: 'single', kind: 'tap', beat: 3, lane: 10, width: 2 },
    ]);
    const e = new GameEngine(rt, false);
    e.keyDown(0, 1.01);
    e.keyUp(0, 1.05);
    e.keyDown(1, 2.0); // 間違ったキー（レーン 2-3）
    e.keyUp(1, 2.05);
    e.keyDown(2, 2.07); // GREAT (70ms late)
    e.keyUp(2, 2.1);
    e.update(3.5); // 3拍目は見逃し
    expect(rt.objs.map((o) => o.judge)).toEqual(['perfect', 'great', 'miss']);
    expect(e.stats.late).toBe(1);
    expect(e.stats.combo).toBe(0);
    expect(e.stats.maxCombo).toBe(2);
  });

  it('requires a held lane key for flicks (Space either before or after)', () => {
    const rt = mk([
      { type: 'single', kind: 'flick', beat: 1, lane: 0, width: 2, dir: 'up' },
      { type: 'single', kind: 'flick', beat: 2, lane: 6, width: 2, dir: 'up' },
      { type: 'single', kind: 'flick', beat: 3, lane: 6, width: 2, dir: 'up' },
    ]);
    const e = new GameEngine(rt, false);
    // レーンキーを押さずに Space → 判定しない
    e.flickDown(1.0);
    e.flickUp();
    expect(rt.objs[0].judge).toBeNull();
    // キーを押しながら Space
    e.keyDown(0, 1.0);
    e.flickDown(1.02);
    e.flickUp();
    e.keyUp(0, 1.1);
    expect(rt.objs[0].judge).toBe('perfect');
    // Space を先に押してからキー（150ms 以内）
    e.flickDown(1.98);
    e.keyDown(3, 2.01);
    e.flickUp();
    e.keyUp(3, 2.1);
    expect(rt.objs[1].judge).toBe('perfect');
    // キーを押すだけではフリックにならない
    e.keyDown(3, 3.0);
    e.update(3.0 + WINDOWS.bad + 0.01);
    expect(rt.objs[2].judge).toBe('miss');
  });

  it('tracks slides: start tap, ticks while held, release judged at end', () => {
    const rt = mk([
      {
        type: 'slide',
        points: [
          { beat: 1, lane: 0, width: 2 },
          { beat: 2, lane: 4, width: 2, visible: true },
          { beat: 3, lane: 8, width: 2 },
        ],
      },
    ]);
    const e = new GameEngine(rt, false);
    e.keyDown(0, 1.0);
    // 追従: キー0 → キー1 → キー2 → キー3 → キー4
    const path: [number, number][] = [
      [1.3, 1],
      [1.8, 2],
      [2.3, 3],
      [2.8, 4],
    ];
    let t = 1.0;
    let cur = 0;
    for (const [at, key] of path) {
      for (; t < at; t += 1 / 120) e.update(t);
      e.keyDown(key, at);
      e.keyUp(cur, at + 0.01);
      cur = key;
    }
    for (; t <= 3.05; t += 1 / 120) e.update(t);
    e.keyUp(cur, 3.1);
    e.update(3.2);
    expect(rt.objs.every((o) => o.judge === 'perfect')).toBe(true);
    expect(e.allPerfect).toBe(true);
  });

  it('misses slide ticks when not held', () => {
    const rt = mk([
      {
        type: 'slide',
        points: [
          { beat: 1, lane: 0, width: 2 },
          { beat: 3, lane: 0, width: 2 },
        ],
      },
    ]);
    const e = new GameEngine(rt, false);
    e.keyDown(0, 1.0);
    e.keyUp(0, 1.2);
    for (let t = 1; t < 3.5; t += 1 / 60) e.update(t);
    const kinds = rt.objs.map((o) => `${o.kind}:${o.judge}`);
    expect(kinds[0]).toBe('slideStart:perfect');
    expect(kinds).toContain('tick:miss');
    expect(kinds[kinds.length - 1]).toBe('slideEnd:miss');
  });
});
