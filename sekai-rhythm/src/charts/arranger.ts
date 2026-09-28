import { ChartData, Difficulty, FlickDir, LANES, NoteData, SlidePointData, emptyChart } from '../core/chart';
import { DrumHit, MelodyNote, Section, Song } from '../music/song';

/**
 * 楽譜（メロディ・ドラム・セクション構成）から譜面を作る。乱数は使わない。
 *
 * 人が作る譜面の定石をルールにしている:
 * - 基本はメロディ（ボーカル）の音の頭に置き、音程の高低で左右に動かす
 * - 同じ音の連打は左右交互、速い動きは大きく飛ばない
 * - 伸ばす音はスライド。次の音の位置へ流れるように動かし、フレーズの終わりはフリックで締める
 * - サビ頭（クラッシュ）はクリティカル、上位難易度は外向きのフリック
 * - サビではメロディと反対の手でキック・スネアを取る（片手メロディ＋片手リズム）
 * - ドラムのフィルは階段・交互・なぞりで次のセクションへつなぐ
 * - 最後のキメは全幅のクリティカルフリック
 * 物理的に 6 キーで押せること（同じキーの同時押しなし・スライド中のキーと重ならない・同時押し 2 まで）を常に守る。
 */

type Diff = 'normal' | 'hard' | 'expert' | 'master';

interface Profile {
  /** メロディを拾う最小の拍グリッド */
  grid: number;
  /** 連続するノーツの最小間隔（拍） */
  minGap: number;
  /** 16分の連続上限 */
  max16Run: number;
  /** この長さ以上の音をスライドにする（拍） */
  slideLen: number;
  /** スライドを次の音の位置へ動かす */
  moveSlides: boolean;
  /** 長いスライドをジグザグ（中継点つき）にする */
  zigzag: boolean;
  /** フレーズの終わりをフリックにする */
  phraseFlick: boolean;
  /** 反対の手で取るドラム */
  drums: 'none' | 'snare' | 'kickSnare' | 'full';
  fill: 'quarter' | 'stairs' | 'alt' | 'trace';
  /** リフ（イントロ等）の拾い方 */
  riffGrid: number;
  /** 強拍を2キー幅にする */
  wideDownbeats: boolean;
  /** サビ頭を外向きフリックの同時押しにする */
  crashFlicks: boolean;
  /** 全体のノーツ幅（normal は 2 キー幅で取りやすく） */
  width: 2 | 4;
}

const PROFILES: Record<Diff, Profile> = {
  normal: { grid: 1, minGap: 1, max16Run: 0, slideLen: 2, moveSlides: false, zigzag: false, phraseFlick: false, drums: 'none', fill: 'quarter', riffGrid: 1, wideDownbeats: false, crashFlicks: false, width: 4 },
  hard: { grid: 0.5, minGap: 0.5, max16Run: 0, slideLen: 1.5, moveSlides: true, zigzag: false, phraseFlick: true, drums: 'snare', fill: 'stairs', riffGrid: 0.5, wideDownbeats: true, crashFlicks: false, width: 2 },
  expert: { grid: 0.25, minGap: 0.25, max16Run: 2, slideLen: 1.5, moveSlides: true, zigzag: false, phraseFlick: true, drums: 'kickSnare', fill: 'alt', riffGrid: 0.5, wideDownbeats: true, crashFlicks: true, width: 2 },
  master: { grid: 0.25, minGap: 0.25, max16Run: 8, slideLen: 1, moveSlides: true, zigzag: true, phraseFlick: true, drums: 'full', fill: 'trace', riffGrid: 0.25, wideDownbeats: true, crashFlicks: true, width: 2 },
};

const EPS = 1e-6;
const KEYS = 6;
const keysOf = (lane: number, width: number) => {
  const out: number[] = [];
  for (let k = 0; k < KEYS; k++) if (k * 2 < lane + width - EPS && k * 2 + 2 > lane + EPS) out.push(k);
  return out;
};
const bk = (b: number) => Math.round(b * 1000);

interface Hold {
  from: number;
  to: number;
  pts: SlidePointData[];
}

/** 6キーで押せるかを見ながらノーツを置く */
class Builder {
  notes: NoteData[] = [];
  private at = new Map<number, { keys: Set<number>; count: number }>();
  holds: Hold[] = [];
  constructor(private maxFingers = 2) {}

  private heldKeys(beat: number, except?: Hold): Set<number> {
    const s = new Set<number>();
    for (const h of this.holds) {
      if (h === except || beat < h.from - EPS || beat > h.to + EPS) continue;
      const [l, r] = rangeAt(h.pts, beat);
      for (const k of keysOf(l, r - l)) s.add(k);
    }
    return s;
  }

  private holdCount(beat: number): number {
    return this.holds.filter((h) => beat > h.from + EPS && beat < h.to + EPS).length;
  }

  used(beat: number): boolean {
    return this.at.has(bk(beat));
  }

  canPlace(beat: number, lane: number, width: number): boolean {
    const keys = keysOf(lane, width);
    const slot = this.at.get(bk(beat));
    if (slot && keys.some((k) => slot.keys.has(k))) return false;
    const held = this.heldKeys(beat);
    if (keys.some((k) => held.has(k))) return false;
    return (slot?.count ?? 0) + this.holdCount(beat) + 1 <= this.maxFingers;
  }

  private mark(beat: number, lane: number, width: number) {
    const slot = this.at.get(bk(beat)) ?? { keys: new Set<number>(), count: 0 };
    for (const k of keysOf(lane, width)) slot.keys.add(k);
    slot.count++;
    this.at.set(bk(beat), slot);
  }

  /** 置けなければ近くのキーへずらして置く。置けたレーンを返す */
  tap(beat: number, lane: number, width: number, extra: Partial<NoteData> & { kind?: 'tap' | 'flick' | 'trace' } = {}, tryShift = true): number | null {
    const tries = tryShift ? [0, 2, -2, 4, -4] : [0];
    for (const d of tries) {
      const l = Math.max(0, Math.min(LANES - width, lane + d));
      if (!this.canPlace(beat, l, width)) continue;
      this.mark(beat, l, width);
      const { kind = 'tap', ...rest } = extra as { kind?: 'tap' | 'flick' | 'trace' };
      this.notes.push({ type: 'single', kind, beat, lane: l, width, ...(rest as object) } as NoteData);
      return l;
    }
    return null;
  }

  slide(points: SlidePointData[], extra: { critical?: boolean; endFlick?: FlickDir } = {}): boolean {
    for (const shift of [0, 2, -2]) {
      const pts = points.map((p) => ({ ...p, lane: Math.max(0, Math.min(LANES - p.width, p.lane + shift)) }));
      const from = pts[0].beat;
      const to = pts[pts.length - 1].beat;
      const hold: Hold = { from, to, pts };
      // 他のスライドと重ならない
      let ok = true;
      for (const h of this.holds) {
        if (h.to < from - EPS || h.from > to + EPS) continue;
        for (let b = Math.max(from, h.from); b <= Math.min(to, h.to) + EPS; b += 0.125) {
          const mine = keysOf(...lw(rangeAt(pts, b)));
          const theirs = keysOf(...lw(rangeAt(h.pts, b)));
          if (mine.some((k) => theirs.includes(k))) ok = false;
        }
      }
      for (let b = from; b <= to + EPS; b += 0.125) if (this.holdCount(b) + 1 > this.maxFingers) ok = false;
      if (!ok) continue;
      // 始点
      if (!this.canPlace(from, pts[0].lane, pts[0].width)) continue;
      // 途中にある既存ノーツ
      for (const [key, slot] of this.at) {
        const b = key / 1000;
        if (b <= from + EPS || b > to + EPS) continue;
        const mine = keysOf(...lw(rangeAt(pts, b)));
        if (mine.some((k) => slot.keys.has(k)) || slot.count + this.holdCount(b) + 1 > this.maxFingers) ok = false;
      }
      if (!ok) continue;
      this.mark(from, pts[0].lane, pts[0].width);
      this.holds.push(hold);
      this.notes.push({ type: 'slide', points: pts, ...(extra.critical ? { critical: true } : {}), ...(extra.endFlick ? { endFlick: extra.endFlick } : {}) });
      return true;
    }
    return false;
  }
}

function lw([l, r]: [number, number]): [number, number] {
  return [l, r - l];
}

function rangeAt(pts: SlidePointData[], beat: number): [number, number] {
  const joints = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !p.attach);
  if (beat <= joints[0].beat) return [joints[0].lane, joints[0].lane + joints[0].width];
  for (let i = 0; i < joints.length - 1; i++) {
    const a = joints[i];
    const b = joints[i + 1];
    if (beat <= b.beat) {
      const u = b.beat > a.beat ? (beat - a.beat) / (b.beat - a.beat) : 1;
      return [a.lane + (b.lane - a.lane) * u, a.lane + a.width + (b.lane + b.width - a.lane - a.width) * u];
    }
  }
  const e = joints[joints.length - 1];
  return [e.lane, e.lane + e.width];
}

const onGrid = (b: number, g: number) => Math.abs(b / g - Math.round(b / g)) < 1e-6;

/** キー番号（0..5）とノーツ幅からレーン（常にキーの境目にそろえる） */
function laneForKey(k: number, width: number): number {
  const slots = KEYS - width / 2;
  return 2 * Math.round((k * slots) / (KEYS - 1));
}

export function arrange(song: Song, diff: Diff, level: number, id: string): ChartData {
  const P = PROFILES[diff];
  const B = new Builder(2);
  const riffGrid = diff === 'hard' && song.bpm > 150 ? 1 : P.riffGrid;
  const W = P.width;

  // ---------------------------------------------------------------- 1. サビ頭などのキメ
  for (const s of song.sections) {
    if (s.index === 0 || s.kind === 'verse' || s.kind === 'pre') continue;
    if (P.crashFlicks && (s.kind === 'chorus' || s.kind === 'outro')) {
      B.tap(s.start, 0, 4, { kind: 'flick', dir: 'left', critical: true }, false);
      B.tap(s.start, 8, 4, { kind: 'flick', dir: 'right', critical: true }, false);
    } else {
      B.tap(s.start, 3, 6, { critical: true }, false);
    }
  }
  // 最後のキメ
  B.tap(song.endBeat, 0, 12, { kind: 'flick', dir: 'up', critical: true }, false);

  // ---------------------------------------------------------------- 2. フィル
  let fillCount = 0;
  for (const s of song.sections) {
    if (!s.fill) continue;
    const f0 = s.end - 2; // 最後の2拍
    const flip = fillCount++ % 2 === 1;
    const K = (k: number) => (flip ? 5 - k : k);
    switch (P.fill) {
      case 'quarter':
        B.tap(f0, laneForKey(K(1), 4), 4);
        B.tap(f0 + 1, laneForKey(K(3), 4), 4);
        break;
      case 'stairs':
        [0, 1, 2, 3].forEach((k, i) => B.tap(f0 + i * 0.5, K(k) * 2, 2));
        break;
      case 'alt':
        [2, 3, 1, 4].forEach((k, i) => B.tap(f0 + i * 0.5, K(k) * 2, 2));
        [0, 1, 2, 3].forEach((k, i) => B.tap(f0 + 1 + i * 0.25, K(k) * 2, 2));
        break;
      case 'trace':
        // 16分の交互 → なぞりで流す
        [2, 3, 2, 3].forEach((k, i) => B.tap(f0 + i * 0.25, K(k) * 2, 2));
        [0, 1, 2, 3].forEach((k, i) => B.tap(f0 + 1 + i * 0.25, K(k) * 2, 2, { kind: 'trace' }));
        break;
    }
  }
  const inFill = (beat: number) => song.sections.some((s) => s.fill && beat >= s.end - 2 - EPS && beat < s.end - EPS);

  // ---------------------------------------------------------------- 3. メロディ
  for (const s of song.sections) arrangeMelody(s);

  // ---------------------------------------------------------------- 4. 反対の手のドラム
  if (P.drums !== 'none') {
    const order: Record<string, number> = { snare: 0, kick: 1, open: 2 };
    const hits = song.drums
      .filter((d) => !d.fill && (d.type === 'kick' || d.type === 'snare' || d.type === 'open'))
      .sort((a, b) => a.beat - b.beat || order[a.type] - order[b.type]);
    for (const d of hits) {
      const s = song.sections.find((x) => d.beat >= x.start - EPS && d.beat < x.end - EPS);
      if (!s || inFill(d.beat) || !drumsActive(s, d)) continue;
      if (!chordAllowed(s) && B.used(d.beat)) continue;
      const side = drumSide(s, d.beat);
      const k = d.type === 'kick' ? (side === 'left' ? 0 : 5) : side === 'left' ? 1 : 4;
      const inBar = (d.beat - s.start) % 4;
      const bar = Math.floor((d.beat - s.start) / 4);
      const accent = P.phraseFlick && d.type === 'snare' && s.kind === 'chorus' && Math.abs(inBar - 3) < EPS && bar % 2 === 1;
      B.tap(d.beat, k * 2, 2, accent ? { kind: 'flick', dir: side } : {}, false);
    }
  }

  const notes = B.notes.sort((a, b) => (a.type === 'single' ? a.beat : a.points[0].beat) - (b.type === 'single' ? b.beat : b.points[0].beat));
  const lastBeat = song.endBeat;
  return emptyChart({
    id,
    title: song.title + '（デモ）',
    artist: 'Sekai Rhythm（内蔵シンセ）',
    charter: 'Sekai Rhythm',
    difficulty: diff as Difficulty,
    level,
    audio: { type: 'synth', lengthBeats: lastBeat, seed: 1, song: song.id },
    offset: 0,
    bpms: [{ beat: 0, bpm: song.bpm }],
    notes,
    builtin: true,
  });

  // ================================================================ helpers

  function drumsActive(s: Section, d: DrumHit): boolean {
    const riffy = s.kind === 'intro' || s.kind === 'inter' || s.kind === 'outro';
    switch (P.drums) {
      case 'snare':
        return s.kind === 'chorus' && d.type === 'snare';
      case 'kickSnare':
        if (d.type === 'open') return false;
        if (s.kind === 'chorus' || s.kind === 'break') return true;
        return (s.kind === 'pre' || s.kind === 'verse') && d.type === 'snare';
      case 'full':
        if (riffy) return d.type === 'kick' && onGrid(d.beat - s.start, 4);
        if (d.type === 'open') return s.kind === 'chorus';
        return true;
      default:
        return false;
    }
  }

  /** メロディと同時押しにしてよいか */
  function chordAllowed(s: Section): boolean {
    if (P.drums === 'snare') return s.kind === 'chorus';
    if (P.drums === 'kickSnare') return s.kind !== 'verse';
    return P.drums === 'full';
  }

  function splitSection(s: Section): boolean {
    if (P.drums === 'none') return false;
    if (P.drums === 'snare') return s.kind === 'chorus';
    if (P.drums === 'kickSnare') return s.kind === 'chorus' || s.kind === 'break' || s.kind === 'pre';
    return s.kind !== 'intro' && s.kind !== 'inter' && s.kind !== 'outro';
  }

  /** 2小節ごとにメロディの手を決める（高い音域なら右手、低ければ左手）。ドラムはその反対 */
  function melodySide(s: Section, beat: number): 'left' | 'right' {
    const phrase = Math.floor((beat - s.start) / 8);
    const ns = s.notes.filter((n) => Math.floor((n.beat - s.start) / 8) === phrase);
    const all = s.notes.map((n) => n.pitch).sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)] ?? 72;
    const avg = ns.length ? ns.reduce((a, n) => a + n.pitch, 0) / ns.length : median;
    if (Math.abs(avg - median) < 1) return phrase % 2 === 0 ? 'right' : 'left';
    return avg >= median ? 'right' : 'left';
  }
  function drumSide(s: Section, beat: number): 'left' | 'right' {
    return melodySide(s, beat) === 'right' ? 'left' : 'right';
  }

  function arrangeMelody(s: Section) {
    const isRiff = s.voice === 'riff';
    const grid = isRiff ? Math.max(riffGrid, P.grid) : P.grid;
    const minGap = isRiff ? Math.max(riffGrid, P.minGap) : P.minGap;
    const split = splitSection(s);
    const pitches = s.notes.map((n) => n.pitch);
    const lo = Math.min(...pitches);
    const hi = Math.max(...pitches);

    // 拾う音を選ぶ
    const picked: MelodyNote[] = [];
    let run16 = 0;
    for (const n of s.notes) {
      if (!onGrid(n.beat - s.start, grid)) continue;
      if (inFill(n.beat)) continue;
      const prev = picked[picked.length - 1];
      if (prev && n.beat - prev.beat < minGap - EPS) continue;
      if (prev && n.beat - prev.beat < 0.5 - EPS) {
        if (run16 >= P.max16Run) continue;
        run16++;
      } else run16 = 0;
      picked.push(n);
    }

    let prevKey = -1;
    let prevPitch = -1;
    let prevBeat = -Infinity;
    let altToggle = false;
    picked.forEach((n, i) => {
      const next = picked[i + 1];
      const nextBeat = next ? next.beat : s.end;
      const gap = n.beat - prevBeat;
      // 使えるキーの範囲
      let kMin = 0;
      let kMax = KEYS - 1;
      if (split) {
        const side = melodySide(s, n.beat);
        [kMin, kMax] = side === 'left' ? [0, 2] : [3, 5];
      } else if (isRiff && P.width === 2 && diff !== 'hard') {
        // リフは左右交互
        altToggle = !altToggle;
        [kMin, kMax] = altToggle ? [0, 2] : [3, 5];
      }
      // normal は 2キー幅なので位置は 0..4（レーン = 位置 x 2）
      if (W === 4) kMax = Math.min(kMax, KEYS - 2);
      const span = kMax - kMin;
      let key = kMin + (hi > lo ? Math.round(((n.pitch - lo) / (hi - lo)) * span) : Math.floor(span / 2));
      // 速い動きの整形
      if (prevKey >= 0 && gap <= Math.max(0.5, P.minGap) + EPS) {
        if (n.pitch === prevPitch) key = prevKey + (prevKey - kMin < kMax - prevKey ? 1 : -1);
        else if (key === prevKey) key = prevKey + (n.pitch > prevPitch ? 1 : -1);
        if (gap <= 0.25 + EPS && Math.abs(key - prevKey) > 2) key = prevKey + Math.sign(key - prevKey) * 2;
      }
      key = Math.max(kMin, Math.min(kMax, key));

      const strong = onGrid(n.beat - s.start, 4) && (s.kind === 'chorus' || s.kind === 'pre');
      const width = W === 4 ? 4 : P.wideDownbeats && strong && !split ? 4 : 2;
      const lane = W === 4 ? key * 2 : laneForKey(key, width);
      if (B.used(n.beat)) return;
      // 実際の楽譜で次の音までの休み（拾わなかった音も含めて判断する）
      const nextActual = s.notes.find((x) => x.beat > n.beat + EPS);
      const restAfter = (nextActual ? nextActual.beat : s.end) - (n.beat + n.dur);
      const phraseEnd = restAfter >= (P.phraseFlick ? 0.5 : 1) - EPS || (!next && s.kind !== 'outro');

      // 長い音 → スライド
      const len = Math.min(n.dur, nextBeat - n.beat - (P.minGap >= 1 ? 1 : 0.5));
      if (n.dur >= P.slideLen - EPS && len >= 0.75 - EPS && !B.used(n.beat)) {
        const end = n.beat + Math.floor(len / 0.25) * 0.25;
        const pts: SlidePointData[] = [{ beat: n.beat, lane, width }];
        let endKey = key;
        if (P.moveSlides && next) {
          const nk = kMin + (hi > lo ? Math.round(((next.pitch - lo) / (hi - lo)) * span) : key - kMin);
          endKey = Math.max(kMin, Math.min(kMax, key + Math.max(-2, Math.min(2, nk - key))));
          if (endKey === key && span > 0) endKey = key + (key < kMax ? 1 : -1);
        }
        if (P.zigzag && end - n.beat >= 2 - EPS) {
          let k = key;
          for (let b = n.beat + 1; b < end - EPS; b += 1) {
            k = k === key ? Math.max(kMin, Math.min(kMax, key + (key < kMax ? 2 : -2))) : key;
            pts.push({ beat: b, lane: laneForKey(k, width), width, visible: true });
          }
        } else if (end - n.beat >= 2 - EPS && diff !== 'normal') {
          pts.push({ beat: n.beat + 1, lane: laneForKey(key, width), width, visible: true, attach: true });
        }
        pts.push({ beat: end, lane: W === 4 ? endKey * 2 : laneForKey(endKey, width), width });
        const dir: FlickDir | undefined = P.phraseFlick && phraseEnd ? (endKey > key ? 'right' : endKey < key ? 'left' : 'up') : undefined;
        if (B.slide(pts, { endFlick: dir })) {
          prevKey = endKey;
          prevPitch = n.pitch;
          prevBeat = end;
          return;
        }
      }

      const flick = phraseEnd && (P.phraseFlick || !next) && n.dur <= 2;
      const dir: FlickDir = prevKey < 0 || key === prevKey ? 'up' : key > prevKey ? 'right' : 'left';
      const placed = B.tap(n.beat, lane, width, flick ? { kind: 'flick', dir } : {});
      if (placed !== null) {
        prevKey = W === 4 ? placed / 2 : Math.min(KEYS - 1, Math.round((placed + width / 2 - 1) / 2));
        prevPitch = n.pitch;
        prevBeat = n.beat;
      }
    });
  }
}

export function densityLevel(chart: ChartData, bpm: number, diff: Diff): number {
  let count = 0;
  let last = 0;
  for (const n of chart.notes) {
    count += n.type === 'single' ? 1 : n.points.filter((p) => p.visible !== false).length;
    last = Math.max(last, n.type === 'single' ? n.beat : n.points[n.points.length - 1].beat);
  }
  const seconds = (last * 60) / bpm;
  const nps = count / Math.max(1, seconds);
  const range: Record<Diff, [number, number]> = { normal: [5, 15], hard: [12, 22], expert: [20, 29], master: [26, 33] };
  const [lo, hi] = range[diff];
  return Math.max(lo, Math.min(hi, Math.round(4 + nps * 3.3)));
}

export type { Diff };
