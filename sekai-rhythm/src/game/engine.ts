import { HitObj, Judge, RSlide, RuntimeChart, WINDOWS, Windows, slideRangeAt } from './runtime';

export { WINDOWS };

/** Space → レーンキー の順に押した場合に許す時間差 */
const FLICK_COMBINE = 0.15;
/** スライド追従の許容（レーン）。Sonolus 版の中継点判定の leniency = 1 */
const SLIDE_MARGIN = 1;

export const KEY_COUNT = 6;
export const LANES_PER_KEY = 2;

/** スコア倍率（Sonolus 版 pjsekai: perfect 1 / great 0.7 / good 0.5） */
export const JUDGE_SCORE: Record<Judge, number> = { perfect: 1, great: 0.7, good: 0.5, bad: 0, miss: 0 };
/** ライフ減少（ノーツのミス -80、中継点のミス -40） */
const LIFE_DAMAGE: Record<Judge, number> = { perfect: 0, great: 0, good: 0, bad: 50, miss: 80 };
const TICK_MISS_DAMAGE = 40;

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

export function judgeByDiff(diff: number, w: Windows): Judge | null {
  const within = (r: [number, number]) => diff >= r[0] - 1e-9 && diff <= r[1] + 1e-9;
  if (within(w.perfect)) return 'perfect';
  if (within(w.great)) return 'great';
  if (within(w.good)) return 'good';
  if (within(w.bad)) return 'bad';
  return null;
}

const keyLo = (k: number) => k * LANES_PER_KEY;
const keyHi = (k: number) => (k + 1) * LANES_PER_KEY;
/** 最大の判定幅（候補探索用） */
const MAX_WIN = 0.16;

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
    const dmg = obj.kind === 'tick' ? (judge === 'miss' ? TICK_MISS_DAMAGE : 0) : LIFE_DAMAGE[judge];
    s.life = Math.max(0, s.life - dmg);
    if (s.life <= 0) s.failed = true;
    this.onJudge({ obj, judge, diff });
  }

  /** 時刻 t で判定幅に入っている、条件を満たす最も早い未判定ノーツ */
  private findCandidate(t: number, pred: (o: HitObj) => boolean): HitObj | null {
    const objs = this.chart.objs;
    for (let i = this.head; i < objs.length; i++) {
      const o = objs[i];
      if (o.time > t + MAX_WIN) break;
      if (o.judge !== null) continue;
      const d = t - o.time;
      if (d < o.win.bad[0] || d > o.win.bad[1]) continue;
      if (pred(o)) return o;
    }
    return null;
  }

  private overlapsKey(o: { lane: number; width: number }, k: number): boolean {
    return keyLo(k) < o.lane + o.width && keyHi(k) > o.lane;
  }

  private overlapsHeld(o: { lane: number; width: number }): boolean {
    for (let k = 0; k < KEY_COUNT; k++) if (this.held[k] && this.overlapsKey(o, k)) return true;
    return false;
  }

  private slideCovered(s: RSlide, t: number): boolean {
    const [l, r] = slideRangeAt(s, t);
    for (let k = 0; k < KEY_COUNT; k++) {
      if (this.held[k] && keyLo(k) < r + SLIDE_MARGIN && keyHi(k) > l - SLIDE_MARGIN) return true;
    }
    return false;
  }

  /** キーを新しく押して取るノーツ */
  private isTapTarget(o: HitObj): boolean {
    return (o.kind === 'tap' || o.kind === 'slideStart') && !o.trace;
  }

  /** フリックキーで取るノーツ */
  private isFlickTarget(o: HitObj): boolean {
    return !!o.dir && (o.kind === 'flick' || o.kind === 'trace' || o.kind === 'slideEnd');
  }

  /** 押さえているだけで取れるノーツ（なぞり系・フリックでないもの） */
  private isHoldTarget(o: HitObj): boolean {
    return o.trace && !o.dir;
  }

  keyDown(k: number, t: number) {
    if (this.autoplay || this.held[k]) return;
    this.held[k] = true;
    this.keyDownAt[k] = t;
    const tap = this.findCandidate(t, (o) => this.isTapTarget(o) && this.overlapsKey(o, k));
    let flick: HitObj | null = null;
    if (this.flickHeld && t - this.flickDownAt <= FLICK_COMBINE) {
      flick = this.findCandidate(t, (o) => this.isFlickTarget(o) && this.overlapsKey(o, k));
    }
    const target = tap && flick ? (flick.time < tap.time ? flick : tap) : tap ?? flick;
    if (!target) return;
    const diff = t - target.time;
    const j = judgeByDiff(diff, target.win);
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
    const target = this.findCandidate(t, (o) => this.isFlickTarget(o) && (!this.flickNeedsLane || this.overlapsHeld(o)));
    if (!target) return;
    const diff = t - target.time;
    const j = judgeByDiff(diff, target.win);
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
      if (now < s.startTime - MAX_WIN || now > s.endTime + MAX_WIN) {
        s.covered = false;
        continue;
      }
      s.covered = this.slideCovered(s, Math.min(Math.max(now, s.startTime), s.endTime));
      if (s.covered) s.lastCovered = now;
    }

    for (let i = this.head; i < objs.length; i++) {
      const o = objs[i];
      if (o.time > now + MAX_WIN) break;
      if (o.judge !== null) continue;
      const late = now - o.time;
      if (this.isHoldTarget(o)) {
        // なぞり: 判定幅の中でキーを押さえていれば PERFECT
        const covered = o.slide && o.kind !== 'trace' ? this.slideCovered(o.slide, o.time) : this.overlapsHeld(o);
        if (late >= o.win.perfect[0] && covered) this.apply(o, 'perfect', 0);
        else if (late > o.win.bad[1]) this.apply(o, 'miss', 0);
        continue;
      }
      switch (o.kind) {
        case 'tap':
        case 'flick':
        case 'trace':
        case 'slideStart':
          if (late > o.win.bad[1]) this.apply(o, 'miss', o.win.bad[1]);
          break;
        case 'tick': {
          if (late < 0) break;
          const s = o.slide!;
          this.apply(o, s.covered || s.lastCovered >= o.time - 0.05 ? 'perfect' : 'miss', 0);
          break;
        }
        case 'slideEnd': {
          const s = o.slide!;
          if (o.dir) {
            if (late > o.win.bad[1]) this.apply(o, 'miss', o.win.bad[1]);
            break;
          }
          if (late < 0) break;
          if (s.covered) {
            this.apply(o, 'perfect', 0);
          } else {
            // 早めに離した場合は離した時刻で判定
            const diff = s.lastCovered - o.time;
            this.apply(o, judgeByDiff(diff, o.win) ?? 'miss', diff);
          }
          break;
        }
      }
    }
    this.advanceHead();
  }
}
