// FolioScore の楽譜データモデルと編集アルゴリズム。
// DOM に依存しないので Node のテストからも直接読み込める。

export const TPQ = 480; // 4分音符あたりのティック数

export type DurType = 'w' | 'h' | 'q' | '8' | '16' | '32' | '64';
export const DUR_ORDER: DurType[] = ['w', 'h', 'q', '8', '16', '32', '64'];
export const DUR_TICKS: Record<DurType, number> = {
  w: TPQ * 4, h: TPQ * 2, q: TPQ, '8': TPQ / 2, '16': TPQ / 4, '32': TPQ / 8, '64': TPQ / 16,
};

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export const STEPS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_SEMI: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export type Clef = 'treble' | 'bass' | 'alto' | 'tenor';

export interface Pitch { step: Step; alter: number; octave: number }

export interface NoteEvent {
  dur: DurType;
  dots: number;
  rest: boolean;
  pitches: Pitch[]; // 休符なら空
  tie?: boolean; // 次の音へタイでつなぐ
}

export interface Measure { events: NoteEvent[] }
export interface Staff { clef: Clef; measures: Measure[] }
export interface Part { id: string; name: string; instrument: string; staves: Staff[]; volume: number }

export interface Score {
  version: 1;
  title: string;
  composer: string;
  tempo: number; // 4分音符 = BPM
  timeSig: { num: number; den: number };
  keySig: number; // -7..7 (♭の数は負)
  parts: Part[];
}

export interface Pos { staff: number; measure: number; index: number }

// ---------------------------------------------------------------- pitch utils

export function midiOf(p: Pitch): number {
  return (p.octave + 1) * 12 + STEP_SEMI[p.step] + p.alter;
}

const SHARP_NAMES: [Step, number][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];
const FLAT_NAMES: [Step, number][] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
];

/** MIDI 番号から音名を作る。preferFlat が未指定なら調号に従う。 */
export function pitchFromMidi(midi: number, preferFlat: boolean): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const [step, alter] = (preferFlat ? FLAT_NAMES : SHARP_NAMES)[pc];
  const octave = Math.floor((midi - STEP_SEMI[step] - alter) / 12) - 1;
  return { step, alter, octave };
}

const SHARP_ORDER: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

/** 調号でその音名に付く変化（例: ト長調の F は +1） */
export function keyAlter(keySig: number, step: Step): number {
  if (keySig > 0) return SHARP_ORDER.indexOf(step) < keySig ? 1 : 0;
  if (keySig < 0) return [...SHARP_ORDER].reverse().indexOf(step) < -keySig ? -1 : 0;
  return 0;
}

/**
 * 音名入力（A〜G）: 直前の音に最も近いオクターブを選ぶ（MuseScore と同じ挙動）。
 */
export function pitchForLetter(step: Step, keySig: number, prevMidi: number | null): Pitch {
  const alter = keyAlter(keySig, step);
  const ref = prevMidi ?? 60;
  let best: Pitch = { step, alter, octave: 4 };
  let bestDist = Infinity;
  for (let oct = 0; oct <= 8; oct++) {
    const p = { step, alter, octave: oct };
    const d = Math.abs(midiOf(p) - ref);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

export function transposePitch(p: Pitch, semis: number, keySig: number): Pitch {
  const midi = midiOf(p) + semis;
  if (semis === 0) return { ...p };
  // オクターブ移動は綴りを保つ
  if (semis % 12 === 0) return { ...p, octave: p.octave + semis / 12 };
  // 上行はシャープ、下行はフラット。ただし調号上の音名に一致するならそれを優先
  for (const cand of [pitchFromMidi(midi, false), pitchFromMidi(midi, true)]) {
    if (cand.alter === keyAlter(keySig, cand.step)) return cand;
  }
  return pitchFromMidi(midi, semis < 0);
}

export function pitchName(p: Pitch): string {
  const acc = p.alter > 0 ? '♯'.repeat(p.alter) : '♭'.repeat(-p.alter);
  return `${p.step}${acc}${p.octave}`;
}

// --------------------------------------------------------------- durations

export function eventTicks(ev: { dur: DurType; dots: number }): number {
  const base = DUR_TICKS[ev.dur];
  let t = base;
  let add = base;
  for (let i = 0; i < ev.dots; i++) { add /= 2; t += add; }
  return t;
}

export function measureTicks(score: Score): number {
  return (TPQ * 4 * score.timeSig.num) / score.timeSig.den;
}

/** 長さ ticks を標準的な音価（付点を含む）の並びに分解する。 */
export function decompose(ticks: number): { dur: DurType; dots: number }[] {
  const out: { dur: DurType; dots: number }[] = [];
  let rest = ticks;
  while (rest > 0) {
    let found = false;
    for (const dur of DUR_ORDER) {
      for (const dots of [1, 0]) {
        const t = eventTicks({ dur, dots });
        if (t <= rest && !(dur === '64' && dots === 1)) {
          out.push({ dur, dots });
          rest -= t;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) break; // 64分音符未満は切り捨て
  }
  return out;
}

export function restEvents(ticks: number): NoteEvent[] {
  return decompose(ticks).map((d) => ({ ...d, rest: true, pitches: [] }));
}

/** 拍の位置に揃えた休符列（start は小節頭からのティック） */
export function alignedRests(start: number, len: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  while (len > 0) {
    const dur = DUR_ORDER.find((d) => DUR_TICKS[d] <= len && start % DUR_TICKS[d] === 0);
    if (!dur) break;
    out.push({ dur, dots: 0, rest: true, pitches: [] });
    start += DUR_TICKS[dur];
    len -= DUR_TICKS[dur];
  }
  return out;
}

/** 連続する休符をまとめ直す。小節全体が休符なら 1 つの小節休符にする。 */
export function normalizeMeasure(m: Measure, mt: number): void {
  if (m.events.every((e) => e.rest)) {
    const d = decompose(mt);
    m.events = d.length === 1 ? [{ ...d[0], rest: true, pitches: [] }] : alignedRests(0, mt);
    return;
  }
  const out: NoteEvent[] = [];
  let t = 0;
  let runStart = -1;
  let runLen = 0;
  const flush = () => {
    if (runLen > 0) out.push(...alignedRests(runStart, runLen));
    runLen = 0;
    runStart = -1;
  };
  for (const ev of m.events) {
    const len = eventTicks(ev);
    if (ev.rest) {
      if (runStart < 0) runStart = t;
      runLen += len;
    } else {
      flush();
      out.push(ev);
    }
    t += len;
  }
  flush();
  m.events = out;
}

// ---------------------------------------------------------- score building

let idCounter = 0;
export function newId(): string {
  idCounter++;
  return `p${Date.now().toString(36)}${idCounter}`;
}

export function emptyMeasure(score: Score): Measure {
  const m: Measure = { events: [] };
  normalizeMeasure(m, measureTicks(score));
  return m;
}

export function measureCount(score: Score): number {
  return score.parts[0]?.staves[0]?.measures.length ?? 0;
}

export function allStaves(score: Score): Staff[] {
  return score.parts.flatMap((p) => p.staves);
}

/** フラットな譜表番号からパートと譜表を求める */
export function staffOwner(score: Score, staffIdx: number): { part: Part; partIdx: number; local: number } {
  let i = staffIdx;
  for (let p = 0; p < score.parts.length; p++) {
    const part = score.parts[p];
    if (i < part.staves.length) return { part, partIdx: p, local: i };
    i -= part.staves.length;
  }
  throw new Error(`staff ${staffIdx} out of range`);
}

export function createScore(opts: Partial<Pick<Score, 'title' | 'composer' | 'tempo' | 'timeSig' | 'keySig'>> = {}): Score {
  return {
    version: 1,
    title: opts.title ?? '無題の楽譜',
    composer: opts.composer ?? '',
    tempo: opts.tempo ?? 100,
    timeSig: opts.timeSig ?? { num: 4, den: 4 },
    keySig: opts.keySig ?? 0,
    parts: [],
  };
}

export function addPart(score: Score, name: string, instrument: string, clefs: Clef[], measures?: number): Part {
  const n = measures ?? (measureCount(score) || 8);
  const part: Part = {
    id: newId(), name, instrument, volume: 100,
    staves: clefs.map((clef) => ({ clef, measures: Array.from({ length: n }, () => emptyMeasure(score)) })),
  };
  score.parts.push(part);
  return part;
}

export function appendMeasures(score: Score, count = 1): void {
  for (const st of allStaves(score)) for (let i = 0; i < count; i++) st.measures.push(emptyMeasure(score));
}

export function insertMeasure(score: Score, at: number): void {
  for (const st of allStaves(score)) st.measures.splice(at, 0, emptyMeasure(score));
}

export function deleteMeasure(score: Score, at: number): void {
  if (measureCount(score) <= 1) {
    for (const st of allStaves(score)) st.measures[0] = emptyMeasure(score);
    return;
  }
  for (const st of allStaves(score)) st.measures.splice(at, 1);
}

export function eventStarts(m: Measure): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const ev of m.events) { starts.push(t); t += eventTicks(ev); }
  return starts;
}

export function indexAtTick(m: Measure, tick: number): number {
  const starts = eventStarts(m);
  for (let i = starts.length - 1; i >= 0; i--) if (starts[i] <= tick) return i;
  return 0;
}

export function cloneEvent(ev: NoteEvent): NoteEvent {
  return { dur: ev.dur, dots: ev.dots, rest: ev.rest, pitches: ev.pitches.map((p) => ({ ...p })), ...(ev.tie ? { tie: true } : {}) };
}

/**
 * 小節内の [start, end) を newEvents で置き換える。
 * はみ出した既存イベントの前半は（タイで）保持し、後半は休符で埋める。
 */
function replaceRange(m: Measure, start: number, end: number, newEvents: NoteEvent[]): void {
  const out: NoteEvent[] = [];
  let t = 0;
  let inserted = false;
  for (const ev of m.events) {
    const evStart = t;
    const evEnd = t + eventTicks(ev);
    t = evEnd;
    if (evEnd <= start || evStart >= end) {
      if (evStart >= end && !inserted) { out.push(...newEvents); inserted = true; }
      out.push(ev);
      continue;
    }
    if (evStart < start) {
      // 前半を残す
      const head = decompose(start - evStart).map((d, i, arr) => ({
        ...cloneEvent(ev), ...d, tie: ev.rest ? undefined : (i < arr.length - 1 ? true : false),
      }));
      for (const h of head) if (!h.tie) delete h.tie;
      out.push(...head);
    }
    if (!inserted) { out.push(...newEvents); inserted = true; }
    if (evEnd > end) out.push(...restEvents(evEnd - end));
  }
  if (!inserted) out.push(...newEvents);
  m.events = out;
}

export interface WriteResult { measure: number; tick: number; first: Pos; last: Pos }

/**
 * 指定位置にイベントを書き込む（上書き）。小節をまたぐ場合は自動でタイ分割し、
 * 必要なら小節を追加する。戻り値は書き込み後のカーソル位置。
 */
export function writeEvent(score: Score, staffIdx: number, measureIdx: number, tick: number, ev: NoteEvent): WriteResult {
  const mt = measureTicks(score);
  let remaining = eventTicks(ev);
  let mi = measureIdx;
  let tk = tick;
  let first: Pos | null = null;
  let last: Pos = { staff: staffIdx, measure: mi, index: 0 };
  const staff = allStaves(score)[staffIdx];
  while (remaining > 0) {
    while (mi >= staff.measures.length) appendMeasures(score, 1);
    const room = mt - tk;
    const chunk = Math.min(room, remaining);
    const isLastChunk = chunk === remaining;
    const pieces = chunk === eventTicks(ev) ? [{ dur: ev.dur, dots: ev.dots }] : decompose(chunk);
    const evs: NoteEvent[] = pieces.map((d, i) => {
      const e = cloneEvent(ev);
      e.dur = d.dur; e.dots = d.dots;
      const lastPiece = isLastChunk && i === pieces.length - 1;
      if (ev.rest) delete e.tie;
      else if (!lastPiece) e.tie = true;
      else if (!ev.tie) delete e.tie;
      return e;
    });
    const m = staff.measures[mi];
    replaceRange(m, tk, tk + chunk, evs);
    normalizeMeasure(m, mt);
    const idx = indexAtTick(m, tk);
    if (!first) first = { staff: staffIdx, measure: mi, index: idx };
    last = { staff: staffIdx, measure: mi, index: idx + evs.length - 1 };
    remaining -= chunk;
    tk += chunk;
    if (tk >= mt) { mi++; tk = 0; }
  }
  while (mi >= staff.measures.length) appendMeasures(score, 1);
  return { measure: mi, tick: tk, first: first!, last };
}

export function getEvent(score: Score, pos: Pos): NoteEvent | undefined {
  return allStaves(score)[pos.staff]?.measures[pos.measure]?.events[pos.index];
}

export function eventTickInMeasure(score: Score, pos: Pos): number {
  const m = allStaves(score)[pos.staff].measures[pos.measure];
  return eventStarts(m)[pos.index] ?? 0;
}

/** 同じ譜表で次／前のイベント位置 */
export function stepPos(score: Score, pos: Pos, dir: 1 | -1): Pos | null {
  const staff = allStaves(score)[pos.staff];
  let { measure, index } = pos;
  index += dir;
  while (measure >= 0 && measure < staff.measures.length) {
    const evs = staff.measures[measure].events;
    if (index >= 0 && index < evs.length) return { staff: pos.staff, measure, index };
    measure += dir;
    if (measure < 0 || measure >= staff.measures.length) return null;
    index = dir > 0 ? 0 : staff.measures[measure].events.length - 1;
  }
  return null;
}

export function comparePos(a: Pos, b: Pos): number {
  return a.measure !== b.measure ? a.measure - b.measure : a.index - b.index;
}

/** 選択範囲（同一譜表）内の位置を列挙 */
export function positionsBetween(score: Score, a: Pos, b: Pos): Pos[] {
  const [s, e] = comparePos(a, b) <= 0 ? [a, b] : [b, a];
  const out: Pos[] = [];
  let p: Pos | null = { ...s };
  while (p && comparePos(p, e) <= 0) {
    out.push(p);
    p = stepPos(score, p, 1);
  }
  return out;
}

/** 拍子変更: 各譜表の内容を時間軸に並べ直して小節を組み直す */
export function changeTimeSignature(score: Score, num: number, den: number): void {
  const oldMt = measureTicks(score);
  const staves = allStaves(score);
  const flat = staves.map((st) => st.measures.flatMap((m) => m.events.map(cloneEvent)));
  const totalTicks = measureCount(score) * oldMt;
  score.timeSig = { num, den };
  const mt = measureTicks(score);
  const newCount = Math.max(1, Math.ceil(totalTicks / mt));
  staves.forEach((st, si) => {
    st.measures = Array.from({ length: newCount }, () => emptyMeasure(score));
    let mi = 0;
    let tk = 0;
    for (const ev of flat[si]) {
      const r = writeEvent(score, si, mi, tk, ev);
      mi = r.measure; tk = r.tick;
    }
  });
  // 書き込み時に自動追加された末尾の空小節を取り除く
  for (const st of staves) st.measures.length = newCount;
}

export function validateScore(data: unknown): Score {
  const s = data as Score;
  if (!s || typeof s !== 'object' || !Array.isArray(s.parts) || !s.timeSig) throw new Error('FolioScore 形式のファイルではありません');
  for (const p of s.parts) {
    p.id ??= newId();
    p.volume ??= 100;
    for (const st of p.staves) for (const m of st.measures) for (const ev of m.events) {
      ev.pitches ??= [];
      ev.dots ??= 0;
    }
  }
  return s;
}

// ----------------------------------------------------------- playback list

export interface PlayNote { part: number; staff: number; midi: number; startTick: number; ticks: number; measure: number }

/** タイを結合した発音リストを作る */
export function buildPlayList(score: Score): PlayNote[] {
  const mt = measureTicks(score);
  const out: PlayNote[] = [];
  let staffIdx = 0;
  score.parts.forEach((part, pi) => {
    for (const st of part.staves) {
      const pending = new Map<number, PlayNote>(); // タイ継続中の音
      st.measures.forEach((m, mi) => {
        let t = mi * mt;
        for (const ev of m.events) {
          const len = eventTicks(ev);
          if (!ev.rest) {
            const next = new Map<number, PlayNote>();
            for (const p of ev.pitches) {
              const midi = midiOf(p);
              let pn = pending.get(midi);
              if (pn && pn.startTick + pn.ticks === t) pn.ticks += len;
              else { pn = { part: pi, staff: staffIdx, midi, startTick: t, ticks: len, measure: mi }; out.push(pn); }
              if (ev.tie) next.set(midi, pn);
            }
            pending.clear();
            next.forEach((v, k) => pending.set(k, v));
          } else pending.clear();
          t += len;
        }
      });
      staffIdx++;
    }
  });
  out.sort((a, b) => a.startTick - b.startTick);
  return out;
}
