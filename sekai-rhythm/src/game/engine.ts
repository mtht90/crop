import { HitObj, Judge, RSlide, RuntimeChart, slideRangeAt } from './runtime';

/** 判定幅（秒）。本家の 60fps フレーム基準: PERFECT 2.5F / GREAT 5F / GOOD 6.5F / BAD 7.5F */
export const WINDOWS = {
  perfect: 0.0417,
  great: 0.0833,
  good: 0.1083,
  bad: 0.125,
};
/** スライド終点は少し甘め */
const END_WINDOWS = { perfect: 0.06, great: 0.1, good: 0.125, bad: 0.15 };
/** Space → レーンキー の順に押した場合に許す時間差 */
const FLICK_COMBINE = 0.15;
/** スライド追従の許容（レーン） */
const SLIDE_MARGIN = 0.35;

export const KEY_COUNT = 6;
export const LANES_PER_KEY = 2;

export const JUDGE_SCORE: Record<Judge, number> = { perfect: 1, great: 0.8, good: 0.5, bad: 0, miss: 0 };
const LIFE_DAMAGE: Record<Judge, number> = { perfect: 0, great: 0, good: 0, bad: 50, miss: 80 };

export interface JudgeEvent {
  obj: HitObj;
  judge: Judge;
  diff: number;
}

export interface Stats {
  perfect: number;
  great: number;
  good: number;
  bad: number;
  miss: number;
  fast: number;
  late: number;
  combo: number;
  maxCombo: number;
  weightSum: number;
  life: number;
  failed: boolean;
}

export function rankOf(score: number): string {
  if (score >= 950000) return 'S';
  if (score >= 850000) return 'A';
  if (score >= 700000) return 'B';
  if (score >= 500000) return 'C';
  return 'D';
}
export const RANK_BORDERS: [string, number][] = [
  ['C', 500000],
  ['B', 700000],
  ['A', 850000],
  ['S', 950000],
];

function judgeByDiff(diff: number, w = WINDOWS): Judge | null {
  const a = Math.abs(diff);
  if (a <= w.perfect) return 'perfect';
  if (a <= w.great) return 'great';
  if (a <= w.good) return 'good';
  if (a <= w.bad) return 'bad';
  return null;
}

const keyLo = (k: number) => k * LANES_PER_KEY;
const keyHi = (k: number) => (k + 1) * LANES_PER_KEY;

export class GameEngine {
  readonly chart: RuntimeChart;
  readonly autoplay: boolean;
  flickNeedsLane = true;
  readonly held: boolean[] = new Array(KEY_COUNT).fill(false);
  readonly keyDownAt: number[] = new Array(KEY_COUNT).fill(-Infinity);
  readonly keyUpAt: number[] = new Array(KEY_COUNT).fill(-Infinity);
  flickHeld = false;
  flickDownAt = -Infinity;
  stats: Stats = {
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
    fast: 0,
    late: 0,
    combo: 0,
    maxCombo: 0,
    weightSum: 0,
    life: 1000,
    failed: false,
  };
  onJudge: (e: JudgeEvent) => void = () => {};

  /** まだ判定されていない最初のオブジェクト */
  private head = 0;

  constructor(chart: RuntimeChart, autoplay: boolean, startTime = -Infinity) {
    this.chart = chart;
    this.autoplay = autoplay;
    // 途中から開始する場合、それ以前のノーツは対象外にする（テストプレイ用）
    if (startTime > -Infinity) {
      for (const o of chart.objs) if (o.time < startTime) o.judge = 'perfect';
      this.advanceHead();
    }
  }

  get score(): number {
    return this.chart.totalWeight > 0 ? Math.round((this.stats.weightSum / this.chart.totalWeight) * 1_000_000) : 0;
  }

  get fullCombo(): boolean {
    return this.stats.good + this.stats.bad + this.stats.miss === 0;
  }

  get allPerfect(): boolean {
    return this.fullCombo && this.stats.great === 0;
  }

  get finished(): boolean {
    return this.head >= this.chart.objs.length;
  }

  private advanceHead() {
    const objs = this.chart.objs;
    while (this.head < objs.length && objs[this.head].judge !== null) this.head++;
  }

  private apply(obj: HitObj, judge: Judge, diff: number) {
    if (obj.judge !== null) return;
    obj.judge = judge;
    obj.diff = diff;
    const s = this.stats;
    s[judge]++;
    if (judge === 'perfect' || judge === 'great') {
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
    } else {
      s.combo = 0;
    }
    if (judge !== 'perfect' && judge !== 'miss') {
      if (diff < 0) s.fast++;
      else s.late++;
    }
    s.weightSum += obj.weight * JUDGE_SCORE[judge];
    const dmg = obj.kind === 'tick' || obj.kind === 'trace' ? (judge === 'miss' ? 20 : 0) : LIFE_DAMAGE[judge];
    s.life = Math.max(0, s.life - dmg);
    if (s.life <= 0) s.failed = true;
    this.onJudge({ obj, judge, diff });
  }

  /** 時刻 t 付近の、条件を満たす最も早い未判定ノーツ */
  private findCandidate(t: number, win: number, pred: (o: HitObj) => boolean): HitObj | null {
    const objs = this.chart.objs;
    for (let i = this.head; i < objs.length; i++) {
      const o = objs[i];
      if (o.time > t + win) break;
      if (o.judge !== null || o.time < t - win) continue;
      if (pred(o)) return o;
    }
    return null;
  }

  private overlapsKey(o: { lane: number; width: number }, k: number): boolean {
    return keyLo(k) < o.lane + o.width && keyHi(k) > o.lane;
  }

  private overlapsHeld(o: { lane: number; width: number }, extra = -1): boolean {
    for (let k = 0; k < KEY_COUNT; k++) if ((this.held[k] || k === extra) && this.overlapsKey(o, k)) return true;
    return false;
  }

  private slideCovered(s: RSlide, t: number): boolean {
    const [l, r] = slideRangeAt(s, t);
    for (let k = 0; k < KEY_COUNT; k++) {
      if (this.held[k] && keyLo(k) < r + SLIDE_MARGIN && keyHi(k) > l - SLIDE_MARGIN) return true;
    }
    return false;
  }

  private isFlickTarget(o: HitObj): boolean {
    return o.kind === 'flick' || (o.kind === 'slideEnd' && !!o.dir);
  }

  keyDown(k: number, t: number) {
    if (this.autoplay || this.held[k]) return;
    this.held[k] = true;
    this.keyDownAt[k] = t;
    const tap = this.findCandidate(t, WINDOWS.bad, (o) => (o.kind === 'tap' || o.kind === 'slideStart') && this.overlapsKey(o, k));
    let flick: HitObj | null = null;
    if (this.flickHeld && t - this.flickDownAt <= FLICK_COMBINE) {
      flick = this.findCandidate(t, WINDOWS.bad, (o) => this.isFlickTarget(o) && this.overlapsKey(o, k));
    }
    const target = tap && flick ? (flick.time < tap.time ? flick : tap) : tap ?? flick;
    if (!target) return;
    const diff = t - target.time;
    const j = judgeByDiff(diff);
    if (j) this.apply(target, j, diff);
    this.advanceHead();
  }

  keyUp(k: number, t: number) {
    if (this.autoplay) return;
    this.held[k] = false;
    this.keyUpAt[k] = t;
  }

  flickDown(t: number) {
    if (this.autoplay || this.flickHeld) return;
    this.flickHeld = true;
    this.flickDownAt = t;
    const target = this.findCandidate(t, WINDOWS.bad, (o) => this.isFlickTarget(o) && (!this.flickNeedsLane || this.overlapsHeld(o)));
    if (!target) return;
    const diff = t - target.time;
    const j = judgeByDiff(diff, target.kind === 'slideEnd' ? END_WINDOWS : WINDOWS);
    if (j) this.apply(target, j, diff);
    this.advanceHead();
  }

  flickUp() {
    this.flickHeld = false;
  }

  /** 毎フレーム呼ぶ。時間経過による判定（見逃し、スライド、なぞり） */
  update(now: number) {
    const objs = this.chart.objs;
    if (this.autoplay) {
      for (let i = this.head; i < objs.length && objs[i].time <= now; i++) {
        if (objs[i].judge === null) this.apply(objs[i], 'perfect', 0);
      }
      for (const s of this.chart.slides) s.covered = now >= s.startTime && now <= s.endTime;
      this.advanceHead();
      return;
    }

    for (const s of this.chart.slides) {
      if (s.startTime > now + 1) break;
      if (now < s.startTime - WINDOWS.bad || s.end.judge !== null) {
        s.covered = false;
        continue;
      }
      s.covered = this.slideCovered(s, Math.min(now, s.endTime));
      if (s.covered) s.lastCovered = now;
    }

    for (let i = this.head; i < objs.length; i++) {
      const o = objs[i];
      if (o.time > now + WINDOWS.great) break;
      if (o.judge !== null) continue;
      switch (o.kind) {
        case 'tap':
        case 'flick':
        case 'slideStart':
          if (now > o.time + WINDOWS.bad) this.apply(o, 'miss', WINDOWS.bad);
          break;
        case 'trace':
          if (now >= o.time - WINDOWS.great && this.overlapsHeld(o)) this.apply(o, 'perfect', 0);
          else if (now > o.time + WINDOWS.good) this.apply(o, 'miss', 0);
          break;
        case 'tick': {
          if (now < o.time) break;
          const s = o.slide!;
          this.apply(o, s.covered || s.lastCovered >= o.time - 0.05 ? 'perfect' : 'miss', 0);
          break;
        }
        case 'slideEnd': {
          const s = o.slide!;
          if (o.dir) {
            if (now > o.time + END_WINDOWS.bad) this.apply(o, 'miss', END_WINDOWS.bad);
            break;
          }
          if (now < o.time) break;
          if (s.covered) {
            this.apply(o, 'perfect', 0);
          } else {
            const diff = s.lastCovered - o.time;
            const j = judgeByDiff(diff, END_WINDOWS);
            this.apply(o, j ?? 'miss', diff);
          }
          break;
        }
      }
    }
    this.advanceHead();
  }
}
