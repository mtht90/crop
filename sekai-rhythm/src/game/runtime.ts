import { ChartData, FlickDir, TimingMap } from '../core/chart';

export type Judge = 'perfect' | 'great' | 'good' | 'bad' | 'miss';
export type ObjKind = 'tap' | 'flick' | 'trace' | 'slideStart' | 'slideEnd' | 'tick';

/** 判定幅（秒, [早い側(負), 遅い側]） */
export interface Windows {
  perfect: [number, number];
  great: [number, number];
  good: [number, number];
  bad: [number, number];
}

const F = 1 / 60;
type Frames = number | [number, number];
const rng = (f: Frames): [number, number] => (typeof f === 'number' ? [-f * F, f * F] : [-f[0] * F, f[1] * F]);
/**
 * 本家の判定幅（60fps フレーム）。Sonolus 版 pjsekai エンジン shared/src/engine/data/windows.ts に準拠。
 * Sonolus 版は GOOD と BAD をまとめているので、外側 1 フレームを BAD とする。
 */
function win(perfect: Frames, great: Frames, good: Frames): Windows {
  const p = rng(perfect);
  const g = rng(great);
  const b = rng(good);
  const gd: [number, number] = [Math.min(g[0], b[0] + F), Math.max(g[1], b[1] - F)];
  return { perfect: p, great: g, good: gd, bad: b };
}
export const WINDOWS = {
  tap: win(2.5, 5, 7.5),
  tapCritical: win(3.3, 4.5, 7.5),
  flick: win(2.5, [6.5, 7.5], [7.5, 8.5]),
  flickCritical: win(3.5, [6.5, 7.5], [7.5, 8.5]),
  trace: win(3.5, 3.5, 3.5),
  traceFlick: win([6.5, 7.5], [6.5, 7.5], [6.5, 7.5]),
  slideEnd: win([3.5, 4], [6.5, 8], [7.5, 8.5]),
  slideEndTrace: win([6, 8.5], [6, 8.5], [6, 8.5]),
  tick: win(3.5, 3.5, 3.5),
};

export interface HitObj {
  id: number;
  kind: ObjKind;
  time: number;
  beat: number;
  lane: number;
  width: number;
  critical: boolean;
  /** なぞり判定（押さえているだけで取れる） */
  trace: boolean;
  /** フリック方向（フリック / トレースフリック / フリック終点） */
  dir?: FlickDir;
  slide?: RSlide;
  /** 不可視の中継判定（半拍ごとのコンボ） */
  hidden: boolean;
  win: Windows;
  weight: number;
  judge: Judge | null;
  /** 入力 - ノーツ時刻 (秒) */
  diff: number;
}

/** スライドの経路を決める点（attach 中継点は含まない） */
export interface RSlidePoint {
  time: number;
  beat: number;
  lane: number;
  width: number;
}

export interface RSlide {
  id: number;
  points: RSlidePoint[];
  critical: boolean;
  guide: boolean;
  start: HitObj | null;
  end: HitObj | null;
  ticks: HitObj[];
  startTime: number;
  endTime: number;
  /** 最後にキーで押さえられていた時刻 */
  lastCovered: number;
  covered: boolean;
}

export interface SimLine {
  time: number;
  /** 左右のノーツ中心（レーン単位, 0..12） */
  left: number;
  right: number;
}

export interface RuntimeChart {
  timing: TimingMap;
  objs: HitObj[];
  /** 判定のあるスライド（ガイドは含まない） */
  slides: RSlide[];
  guides: RSlide[];
  simLines: SimLine[];
  totalCombo: number;
  totalWeight: number;
  firstTime: number;
  endTime: number;
}

const WEIGHTS: Record<ObjKind, [number, number]> = {
  tap: [1, 2],
  flick: [1, 2.5],
  trace: [0.1, 0.2],
  slideStart: [1, 2],
  slideEnd: [1, 2],
  tick: [0.1, 0.2],
};

export function slideRangeAt(s: RSlide, t: number): [number, number] {
  const pts = s.points;
  if (t <= pts[0].time) return [pts[0].lane, pts[0].lane + pts[0].width];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (t <= b.time) {
      const u = b.time > a.time ? (t - a.time) / (b.time - a.time) : 1;
      const l = a.lane + (b.lane - a.lane) * u;
      const r = a.lane + a.width + (b.lane + b.width - a.lane - a.width) * u;
      return [l, r];
    }
  }
  const e = pts[pts.length - 1];
  return [e.lane, e.lane + e.width];
}

export function compileChart(chart: ChartData): RuntimeChart {
  const timing = new TimingMap(chart.bpms, chart.offset);
  const objs: HitObj[] = [];
  const slides: RSlide[] = [];
  const guides: RSlide[] = [];
  let id = 0;

  const mk = (kind: ObjKind, beat: number, lane: number, width: number, critical: boolean, w: Windows, extra: Partial<HitObj> = {}): HitObj => ({
    id: id++,
    kind,
    time: timing.beatToTime(beat),
    beat,
    lane,
    width,
    critical,
    trace: false,
    hidden: false,
    win: w,
    weight: WEIGHTS[kind][critical ? 1 : 0],
    judge: null,
    diff: 0,
    ...extra,
  });

  for (const n of chart.notes) {
    if (n.type === 'single') {
      const crit = !!n.critical;
      if (n.kind === 'trace') {
        const o = mk('trace', n.beat, n.lane, n.width, crit, n.dir ? WINDOWS.traceFlick : WINDOWS.trace, { trace: true, dir: n.dir });
        if (n.dir) o.weight = WEIGHTS.flick[crit ? 1 : 0];
        objs.push(o);
      } else if (n.kind === 'flick') {
        objs.push(mk('flick', n.beat, n.lane, n.width, crit, crit ? WINDOWS.flickCritical : WINDOWS.flick, { dir: n.dir ?? 'up' }));
      } else {
        objs.push(mk('tap', n.beat, n.lane, n.width, crit, crit ? WINDOWS.tapCritical : WINDOWS.tap));
      }
      continue;
    }

    const sorted = [...n.points].sort((a, b) => a.beat - b.beat);
    if (sorted.length < 2) continue;
    const critical = !!n.critical;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const joints = sorted.filter((p, i) => i === 0 || i === sorted.length - 1 || !p.attach);
    const slide: RSlide = {
      id: slides.length + guides.length,
      points: joints.map((p) => ({ time: timing.beatToTime(p.beat), beat: p.beat, lane: p.lane, width: p.width })),
      critical,
      guide: !!n.guide,
      start: null,
      end: null,
      ticks: [],
      startTime: timing.beatToTime(first.beat),
      endTime: timing.beatToTime(last.beat),
      lastCovered: -Infinity,
      covered: false,
    };
    if (n.guide) {
      guides.push(slide);
      continue;
    }

    if (!n.startHidden) {
      const tr = !!first.trace;
      const crit = critical || !!first.critical;
      slide.start = mk(tr ? 'trace' : 'slideStart', first.beat, first.lane, first.width, crit, tr ? WINDOWS.trace : crit ? WINDOWS.tapCritical : WINDOWS.tap, { slide, trace: tr });
      if (tr) slide.start.kind = 'slideStart';
      objs.push(slide.start);
    }
    if (!n.endHidden) {
      const tr = !!last.trace;
      const crit = critical || !!last.critical;
      const w = n.endFlick ? (tr ? WINDOWS.traceFlick : WINDOWS.slideEnd) : tr ? WINDOWS.slideEndTrace : WINDOWS.slideEnd;
      slide.end = mk('slideEnd', last.beat, last.lane, last.width, crit, w, { slide, dir: n.endFlick, trace: tr });
      if (n.endFlick) slide.end.weight = WEIGHTS.flick[crit ? 1 : 0];
      objs.push(slide.end);
    }

    for (let i = 1; i < sorted.length - 1; i++) {
      const p = sorted[i];
      if (p.visible === false) continue;
      const crit = critical || !!p.critical;
      const t = mk('tick', p.beat, p.lane, p.width, crit, WINDOWS.tick, { slide, trace: !!p.trace });
      if (p.attach) {
        const [l, r] = slideRangeAt(slide, t.time);
        t.lane = l;
        t.width = r - l;
      }
      slide.ticks.push(t);
    }
    // 半拍ごとの不可視コンボ判定（始点より後・終点より前の半拍すべて）
    const min = first.beat;
    const max = last.beat;
    const startBeat = Math.max(Math.ceil(min / 0.5) * 0.5, Math.floor(min / 0.5 + 1) * 0.5);
    for (let b = startBeat; b < max - 1e-9; b += 0.5) {
      const tt = timing.beatToTime(b);
      const [l, r] = slideRangeAt(slide, tt);
      slide.ticks.push(mk('tick', b, l, r - l, critical, WINDOWS.tick, { slide, hidden: true }));
    }
    slide.ticks.sort((a, b) => a.time - b.time);
    objs.push(...slide.ticks);
    slides.push(slide);
  }

  objs.sort((a, b) => a.time - b.time || a.id - b.id);
  slides.sort((a, b) => a.startTime - b.startTime);
  guides.sort((a, b) => a.startTime - b.startTime);

  // 同時押しライン（単ノーツ・なぞり・スライド始点/終点。中継点は除く）
  const heads = objs.filter((o) => o.kind !== 'tick');
  const simLines: SimLine[] = [];
  for (let i = 0; i < heads.length; ) {
    let j = i + 1;
    while (j < heads.length && Math.abs(heads[j].time - heads[i].time) < 1e-4) j++;
    if (j - i >= 2) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = i; k < j; k++) {
        const c = heads[k].lane + heads[k].width / 2;
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
      }
      if (hi > lo) simLines.push({ time: heads[i].time, left: lo, right: hi });
    }
    i = j;
  }

  const totalWeight = objs.reduce((s, o) => s + o.weight, 0);
  const times = [...objs.map((o) => o.time), ...guides.map((g) => g.endTime)];
  const firstTime = objs.length ? objs[0].time : guides.length ? guides[0].startTime : 0;
  const endTime = times.length ? Math.max(...times) : 0;
  return { timing, objs, slides, guides, simLines, totalCombo: objs.length, totalWeight, firstTime, endTime };
}
