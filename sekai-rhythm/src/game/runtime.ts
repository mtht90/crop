import { ChartData, FlickDir, TimingMap } from '../core/chart';

export type Judge = 'perfect' | 'great' | 'good' | 'bad' | 'miss';
export type ObjKind = 'tap' | 'flick' | 'trace' | 'slideStart' | 'slideEnd' | 'tick';

export interface HitObj {
  id: number;
  kind: ObjKind;
  time: number;
  beat: number;
  lane: number;
  width: number;
  critical: boolean;
  /** フリック方向（flick / フリック終点） */
  dir?: FlickDir;
  slide?: RSlide;
  /** 不可視の中継判定（半拍ごとのコンボ） */
  hidden: boolean;
  weight: number;
  judge: Judge | null;
  /** 入力 - ノーツ時刻 (秒) */
  diff: number;
}

export interface RSlidePoint {
  time: number;
  beat: number;
  lane: number;
  width: number;
  visible: boolean;
}

export interface RSlide {
  id: number;
  points: RSlidePoint[];
  critical: boolean;
  start: HitObj;
  end: HitObj;
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
  slides: RSlide[];
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
  let id = 0;

  const mk = (kind: ObjKind, beat: number, lane: number, width: number, critical: boolean, extra: Partial<HitObj> = {}): HitObj => ({
    id: id++,
    kind,
    time: timing.beatToTime(beat),
    beat,
    lane,
    width,
    critical,
    hidden: false,
    weight: WEIGHTS[kind][critical ? 1 : 0],
    judge: null,
    diff: 0,
    ...extra,
  });

  for (const n of chart.notes) {
    if (n.type === 'single') {
      const o = mk(n.kind, n.beat, n.lane, n.width, !!n.critical);
      if (n.kind === 'flick') o.dir = n.dir ?? 'up';
      objs.push(o);
      continue;
    }
    const sorted = [...n.points].sort((a, b) => a.beat - b.beat);
    if (sorted.length < 2) continue;
    const critical = !!n.critical;
    const points: RSlidePoint[] = sorted.map((p, i) => ({
      time: timing.beatToTime(p.beat),
      beat: p.beat,
      lane: p.lane,
      width: p.width,
      visible: i === 0 || i === sorted.length - 1 ? true : p.visible !== false,
    }));
    const first = points[0];
    const last = points[points.length - 1];
    const slide: RSlide = {
      id: slides.length,
      points,
      critical,
      start: null as unknown as HitObj,
      end: null as unknown as HitObj,
      ticks: [],
      startTime: first.time,
      endTime: last.time,
      lastCovered: -Infinity,
      covered: false,
    };
    slide.start = mk('slideStart', first.beat, first.lane, first.width, critical, { slide });
    slide.end = mk('slideEnd', last.beat, last.lane, last.width, critical, { slide, dir: n.endFlick });
    if (n.endFlick) slide.end.weight = WEIGHTS.flick[critical ? 1 : 0];
    objs.push(slide.start, slide.end);

    const visibleBeats: number[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      if (!p.visible) continue;
      visibleBeats.push(p.beat);
      const t = mk('tick', p.beat, p.lane, p.width, critical, { slide });
      slide.ticks.push(t);
    }
    // 半拍ごとの不可視コンボ判定
    for (let b = Math.floor(first.beat * 2 + 1e-6) / 2 + 0.5; b < last.beat - 1e-6; b += 0.5) {
      if (b <= first.beat + 1e-6) continue;
      if (visibleBeats.some((v) => Math.abs(v - b) < 1e-4)) continue;
      const tt = timing.beatToTime(b);
      const [l, r] = slideRangeAt(slide, tt);
      slide.ticks.push(mk('tick', b, l, r - l, critical, { slide, hidden: true }));
    }
    slide.ticks.sort((a, b) => a.time - b.time);
    objs.push(...slide.ticks);
    slides.push(slide);
  }

  objs.sort((a, b) => a.time - b.time || a.id - b.id);
  slides.sort((a, b) => a.startTime - b.startTime);

  // 同時押しライン
  const heads = objs.filter((o) => o.kind !== 'tick' && o.kind !== 'trace');
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
  const firstTime = objs.length ? objs[0].time : 0;
  const endTime = objs.length ? Math.max(...objs.map((o) => o.time)) : 0;
  return { timing, objs, slides, simLines, totalCombo: objs.length, totalWeight, firstTime, endTime };
}
