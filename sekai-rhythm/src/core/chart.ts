// 譜面データ（保存形式）とテンポ計算

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'master' | 'append';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'expert', 'master', 'append'];
export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: '#6fdc2e',
  normal: '#39b7f0',
  hard: '#ffaa00',
  expert: '#f04a6a',
  master: '#b34bf0',
  append: '#ff7fd6',
};

export const LANES = 12;

export type FlickDir = 'up' | 'left' | 'right';
export const FLICK_DIRS: FlickDir[] = ['left', 'up', 'right'];

export interface BpmChange {
  beat: number;
  bpm: number;
}

export interface SingleNoteData {
  type: 'single';
  kind: 'tap' | 'flick' | 'trace';
  beat: number;
  /** 左端レーン 0..11 */
  lane: number;
  /** 幅 1..12 */
  width: number;
  critical?: boolean;
  dir?: FlickDir;
}

export interface SlidePointData {
  beat: number;
  lane: number;
  width: number;
  /** 中継点のみ有効: true = 表示される中継点（コンボあり）、false = 不可視の折れ点 */
  visible?: boolean;
}

export interface SlideNoteData {
  type: 'slide';
  critical?: boolean;
  /** 終点をフリックにする */
  endFlick?: FlickDir;
  points: SlidePointData[];
}

export type NoteData = SingleNoteData | SlideNoteData;

export type AudioData =
  | { type: 'youtube'; videoId: string }
  | { type: 'synth'; lengthBeats: number; seed?: number };

export interface ChartData {
  format: 'sekai-rhythm';
  version: 1;
  id: string;
  title: string;
  artist: string;
  charter: string;
  difficulty: Difficulty;
  level: number;
  audio: AudioData;
  /** 拍0が音源の何秒目にあたるか */
  offset: number;
  bpms: BpmChange[];
  notes: NoteData[];
  beatsPerMeasure?: number;
  builtin?: boolean;
}

export function newChartId(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyChart(partial: Partial<ChartData> = {}): ChartData {
  return {
    format: 'sekai-rhythm',
    version: 1,
    id: newChartId(),
    title: '新しい譜面',
    artist: '',
    charter: '',
    difficulty: 'expert',
    level: 25,
    audio: { type: 'youtube', videoId: '' },
    offset: 0,
    bpms: [{ beat: 0, bpm: 120 }],
    notes: [],
    ...partial,
  };
}

interface TimingSeg {
  beat: number;
  time: number;
  bpm: number;
}

/** 拍 <-> 秒 の変換。BPM変化に対応 */
export class TimingMap {
  private segs: TimingSeg[] = [];

  constructor(bpms: BpmChange[], offset: number) {
    const valid = bpms.filter((b) => b.bpm > 0 && Number.isFinite(b.bpm) && Number.isFinite(b.beat));
    const sorted = [...valid].sort((a, b) => a.beat - b.beat);
    const dedup: BpmChange[] = [];
    for (const b of sorted) {
      if (dedup.length && Math.abs(dedup[dedup.length - 1].beat - b.beat) < 1e-9) dedup[dedup.length - 1] = b;
      else dedup.push(b);
    }
    if (!dedup.length) dedup.push({ beat: 0, bpm: 120 });
    if (dedup[0].beat > 0) dedup.unshift({ beat: 0, bpm: dedup[0].bpm });
    let time = offset;
    for (let i = 0; i < dedup.length; i++) {
      if (i > 0) time += ((dedup[i].beat - dedup[i - 1].beat) * 60) / dedup[i - 1].bpm;
      this.segs.push({ beat: dedup[i].beat, time, bpm: dedup[i].bpm });
    }
  }

  private segByBeat(beat: number): TimingSeg {
    let lo = 0;
    let hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segs[mid].beat <= beat) lo = mid;
      else hi = mid - 1;
    }
    return this.segs[lo];
  }

  private segByTime(time: number): TimingSeg {
    let lo = 0;
    let hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segs[mid].time <= time) lo = mid;
      else hi = mid - 1;
    }
    return this.segs[lo];
  }

  beatToTime(beat: number): number {
    const s = this.segByBeat(beat);
    return s.time + ((beat - s.beat) * 60) / s.bpm;
  }

  timeToBeat(time: number): number {
    const s = this.segByTime(time);
    return s.beat + ((time - s.time) * s.bpm) / 60;
  }

  bpmAt(beat: number): number {
    return this.segByBeat(beat).bpm;
  }
}

export function noteEndBeat(n: NoteData): number {
  return n.type === 'single' ? n.beat : n.points[n.points.length - 1].beat;
}

export function noteStartBeat(n: NoteData): number {
  return n.type === 'single' ? n.beat : n.points[0].beat;
}

export function chartLastBeat(chart: ChartData): number {
  let m = 0;
  for (const n of chart.notes) m = Math.max(m, noteEndBeat(n));
  return m;
}

/** YouTube の URL / ID から動画IDを取り出す */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (host === 'youtu.be') return valid(u.pathname.slice(1).split('/')[0]);
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v) return valid(v);
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (m) return valid(m[1]);
    }
  } catch {
    /* not a URL */
  }
  return null;

  function valid(id: string): string | null {
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }
}

const clampInt = (v: unknown, lo: number, hi: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const num = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

function normLaneWidth(lane: unknown, width: unknown): { lane: number; width: number } {
  const w = clampInt(width, 1, LANES, 2);
  const l = clampInt(lane, 0, LANES - w, 0);
  return { lane: l, width: w };
}

/** 読み込んだJSONを検証・正規化する。不正なら例外 */
export function normalizeChart(raw: unknown): ChartData {
  if (!raw || typeof raw !== 'object') throw new Error('譜面データが不正です');
  const r = raw as Record<string, any>;
  if (r.format !== 'sekai-rhythm') throw new Error('sekai-rhythm 形式の譜面ではありません');
  const base = emptyChart();
  const difficulty: Difficulty = DIFFICULTIES.includes(r.difficulty) ? r.difficulty : 'expert';
  let audio: AudioData;
  if (r.audio?.type === 'synth') audio = { type: 'synth', lengthBeats: num(r.audio.lengthBeats, 128), seed: num(r.audio.seed, 1) };
  else audio = { type: 'youtube', videoId: typeof r.audio?.videoId === 'string' ? r.audio.videoId : '' };
  const bpms: BpmChange[] = Array.isArray(r.bpms)
    ? r.bpms.map((b: any) => ({ beat: num(b?.beat, 0), bpm: num(b?.bpm, 120) })).filter((b: BpmChange) => b.bpm > 0)
    : [];
  const notes: NoteData[] = [];
  for (const n of Array.isArray(r.notes) ? r.notes : []) {
    if (n?.type === 'single') {
      const kind = ['tap', 'flick', 'trace'].includes(n.kind) ? n.kind : 'tap';
      const note: SingleNoteData = { type: 'single', kind, beat: num(n.beat, 0), ...normLaneWidth(n.lane, n.width) };
      if (n.critical) note.critical = true;
      if (kind === 'flick') note.dir = FLICK_DIRS.includes(n.dir) ? n.dir : 'up';
      notes.push(note);
    } else if (n?.type === 'slide' && Array.isArray(n.points)) {
      const points: SlidePointData[] = n.points
        .map((p: any) => ({ beat: num(p?.beat, 0), ...normLaneWidth(p?.lane, p?.width), visible: p?.visible !== false }))
        .sort((a: SlidePointData, b: SlidePointData) => a.beat - b.beat);
      if (points.length < 2) continue;
      const slide: SlideNoteData = { type: 'slide', points };
      if (n.critical) slide.critical = true;
      if (FLICK_DIRS.includes(n.endFlick)) slide.endFlick = n.endFlick;
      notes.push(slide);
    }
  }
  return {
    ...base,
    id: typeof r.id === 'string' && r.id ? r.id : base.id,
    title: String(r.title ?? base.title),
    artist: String(r.artist ?? ''),
    charter: String(r.charter ?? ''),
    difficulty,
    level: clampInt(r.level, 1, 99, 25),
    audio,
    offset: num(r.offset, 0),
    bpms: bpms.length ? bpms : base.bpms,
    notes,
    beatsPerMeasure: r.beatsPerMeasure ? clampInt(r.beatsPerMeasure, 1, 16, 4) : undefined,
  };
}

export function cloneChart(c: ChartData): ChartData {
  return JSON.parse(JSON.stringify(c));
}
