import {
  BpmChange,
  ChartData,
  DIFFICULTIES,
  Difficulty,
  FlickDir,
  LANES,
  NoteData,
  SingleNoteData,
  SlideNoteData,
  SlidePointData,
  emptyChart,
} from './chart';

/**
 * SUS 形式（プロセカの譜面で使われる Ched 系フォーマット）の読み込み。
 * Sonolus 版 pjsekai エンジン（NonSpicyBurrito/sonolus-pjsekai-engine, MIT）の
 * lib/src/sus/analyze.ts・convert.ts と同じ解釈になるように移植している。
 *
 * - #mmm1x  : タップ  1=通常 2=クリティカル 3=中継点を経路に沿わせる/不可視中継点を消す
 *             5=なぞり 6=クリティカルなぞり 7=スライド始終点を消す 8=クリティカル+始終点を消す
 * - #mmm5x  : 方向    1=上フリック 3=左上 4=右上 2/5/6=カーブ（本作は直線なので無視）
 * - #mmm3xy : スライド 1=始点 2=終点 3=中継点 5=不可視中継点
 * - #mmm9xy : ガイド（判定なし）
 * - #mmm02 拍子, #mmm08 BPM変化（#BPMxx 定義）, #MEASUREBS 小節オフセット, #WAVEOFFSET
 * - #TILxx（ハイスピード変化）は本作では未対応のため無視
 * レーン x は 2..13 がプロセカの 12 レーン。
 */

type Line = [header: string, data: string];

interface SusNote {
  tick: number;
  lane: number;
  width: number;
  type: number;
}

interface Stream {
  type: number;
  notes: SusNote[];
}

export interface SusScore {
  meta: Map<string, string>;
  offset: number;
  ticksPerBeat: number;
  bpmChanges: { tick: number; bpm: number }[];
  tapNotes: SusNote[];
  directionalNotes: SusNote[];
  slides: Stream[];
}

export function analyzeSus(sus: string): SusScore {
  const lines: Line[] = [];
  const measureChanges: [number, number][] = [];
  const meta = new Map<string, string>();

  for (const raw of sus.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('#')) continue;
    const isLine = line.includes(':');
    const index = line.indexOf(isLine ? ':' : ' ');
    if (index === -1) continue;
    const left = line.substring(1, index).trim();
    const right = line.substring(index + 1).trim();
    if (isLine) lines.push([left, right]);
    else if (left === 'MEASUREBS') measureChanges.unshift([lines.length, +right]);
    else meta.set(left, right);
  }

  const offset = -+(meta.get('WAVEOFFSET') || '0');
  const request = meta.get('REQUEST') ?? '';
  const m = request.match(/^"ticks_per_beat (\d+)"$/);
  const ticksPerBeat = m ? +m[1] : 480;
  const measureOffsetAt = (index: number) => measureChanges.find(([i]) => i <= index)?.[1] ?? 0;

  // 小節の長さ
  const barLengths: { measure: number; length: number }[] = [];
  lines.forEach(([header, data], index) => {
    if (header.length !== 5 || !header.endsWith('02')) return;
    const measure = +header.substring(0, 3) + measureOffsetAt(index);
    if (!Number.isNaN(measure)) barLengths.push({ measure, length: +data });
  });
  if (!barLengths.some((b) => b.measure === 0)) barLengths.push({ measure: 0, length: 4 });
  let ticks = 0;
  const bars = barLengths
    .sort((a, b) => a.measure - b.measure)
    .map(({ measure, length }, i, values) => {
      if (i) ticks += (measure - values[i - 1].measure) * values[i - 1].length * ticksPerBeat;
      return { measure, ticksPerMeasure: length * ticksPerBeat, ticks };
    })
    .reverse();
  const toTick = (measure: number, p: number, q: number) => {
    const bar = bars.find((b) => measure >= b.measure) ?? bars[bars.length - 1];
    return bar.ticks + (measure - bar.measure) * bar.ticksPerMeasure + (p * bar.ticksPerMeasure) / q;
  };
  const toRaws = ([header, data]: Line, measureOffset: number) => {
    const measure = +header.substring(0, 3) + measureOffset;
    const values = data.replace(/\s+/g, '').match(/.{2}/g) ?? [];
    const out: { tick: number; value: string }[] = [];
    values.forEach((value, i) => {
      if (value !== '00') out.push({ tick: toTick(measure, i, values.length), value });
    });
    return out;
  };
  const toNotes = (line: Line, measureOffset: number): SusNote[] => {
    const lane = parseInt(line[0][4], 36);
    return toRaws(line, measureOffset).map(({ tick, value }) => ({
      tick,
      lane,
      width: parseInt(value[1], 36),
      type: parseInt(value[0], 36),
    }));
  };

  const bpms = new Map<string, number>();
  const bpmRefs: { index: number; line: Line }[] = [];
  const tapNotes: SusNote[] = [];
  const directionalNotes: SusNote[] = [];
  const streams = new Map<string, Stream>();

  lines.forEach((line, index) => {
    const [header, data] = line;
    const mo = measureOffsetAt(index);
    if (header.length === 5 && header.startsWith('TIL')) return;
    if (header.length === 5 && header.startsWith('BPM')) {
      bpms.set(header.substring(3), +data);
      return;
    }
    if (header.length === 5 && header.endsWith('08')) {
      bpmRefs.push({ index, line });
      return;
    }
    if (header.length === 5 && header[3] === '1') {
      tapNotes.push(...toNotes(line, mo));
      return;
    }
    if (header.length === 6 && (header[3] === '3' || header[3] === '9')) {
      const key = `${header[5]}-${header[3]}`;
      const stream = streams.get(key);
      if (stream) stream.notes.push(...toNotes(line, mo));
      else streams.set(key, { type: +header[3], notes: toNotes(line, mo) });
      return;
    }
    if (header.length === 5 && header[3] === '5') directionalNotes.push(...toNotes(line, mo));
  });

  // BPM 定義はファイル内のどこにあってもよい
  const bpmChanges = bpmRefs.flatMap(({ index, line }) =>
    toRaws(line, measureOffsetAt(index)).map(({ tick, value }) => ({ tick, bpm: bpms.get(value) ?? 0 })),
  );

  const slides: Stream[] = [];
  for (const stream of streams.values()) {
    let notes: SusNote[] | undefined;
    for (const note of stream.notes.sort((a, b) => a.tick - b.tick)) {
      if (!notes) {
        notes = [];
        slides.push({ type: stream.type, notes });
      }
      notes.push(note);
      if (note.type === 2) notes = undefined;
    }
  }

  return { meta, offset, ticksPerBeat, bpmChanges, tapNotes, directionalNotes, slides };
}

const keyOf = (n: SusNote) => `${n.lane}-${n.tick}`;
const unquote = (s: string | undefined) => (s ?? '').replace(/^"(.*)"$/, '$1');

function laneWidth(susLane: number, width: number): { lane: number; width: number } | null {
  let l = susLane - 2;
  let w = width;
  if (l < 0) {
    w += l;
    l = 0;
  }
  if (l + w > LANES) w = LANES - l;
  if (w < 1) return null;
  return { lane: l, width: w };
}

export function parseSus(text: string): ChartData {
  const score = analyzeSus(text);
  const tpb = score.ticksPerBeat;

  const flickMods = new Map<string, FlickDir>();
  const traceMods = new Set<string>();
  const criticalMods = new Set<string>();
  const tickRemoveMods = new Set<string>();
  const startEndRemoveMods = new Set<string>();
  const preventSingles = new Set<string>();

  for (const slide of score.slides) {
    if (slide.type !== 3) continue;
    for (const n of slide.notes) if ([1, 2, 3, 5].includes(n.type)) preventSingles.add(keyOf(n));
  }
  for (const n of score.directionalNotes) {
    const d: FlickDir | null = n.type === 1 ? 'up' : n.type === 3 ? 'left' : n.type === 4 ? 'right' : null;
    if (d) flickMods.set(keyOf(n), d);
  }
  for (const n of score.tapNotes) {
    const k = keyOf(n);
    if (n.type === 2) criticalMods.add(k);
    else if (n.type === 5) traceMods.add(k);
    else if (n.type === 6) {
      traceMods.add(k);
      criticalMods.add(k);
    } else if (n.type === 3) tickRemoveMods.add(k);
    else if (n.type === 7) startEndRemoveMods.add(k);
    else if (n.type === 8) {
      criticalMods.add(k);
      startEndRemoveMods.add(k);
    }
  }

  const notes: NoteData[] = [];
  const singleKeys = new Set<string>();
  for (const n of score.tapNotes) {
    if (n.lane <= 1 || n.lane >= 14) continue;
    if (![1, 2, 5, 6].includes(n.type)) continue;
    const k = keyOf(n);
    if (preventSingles.has(k) || singleKeys.has(k)) continue;
    singleKeys.add(k);
    const lw = laneWidth(n.lane, n.width);
    if (!lw) continue;
    const trace = n.type === 5 || n.type === 6;
    const dir = flickMods.get(k);
    const note: SingleNoteData = { type: 'single', kind: trace ? 'trace' : dir ? 'flick' : 'tap', beat: n.tick / tpb, ...lw };
    if (n.type === 2 || n.type === 6) note.critical = true;
    if (dir) note.dir = dir;
    notes.push(note);
  }

  const slideByStart = new Map<string, SlideNoteData>();
  for (const s of score.slides) {
    const startNote = s.notes.find((n) => n.type === 1 || n.type === 2);
    if (!startNote) continue;
    const active = s.type === 3;
    const slide: SlideNoteData = { type: 'slide', points: [] };
    if (!active) slide.guide = true;
    if (criticalMods.has(keyOf(startNote))) slide.critical = true;
    for (const n of s.notes) {
      const k = keyOf(n);
      const lw = laneWidth(n.lane, n.width) ?? { lane: 0, width: 1 };
      const pt: SlidePointData = { beat: n.tick / tpb, ...lw };
      if (traceMods.has(k)) pt.trace = true;
      if (!slide.critical && criticalMods.has(k)) pt.critical = true;
      if (n.type === 1 || n.type === 2) {
        const isStart = slide.points.length === 0;
        if (!active || startEndRemoveMods.has(k)) {
          if (isStart) slide.startHidden = true;
          else slide.endHidden = true;
        } else if (!isStart) {
          const dir = flickMods.get(k);
          if (dir) slide.endFlick = dir;
        }
        slide.points.push(pt);
      } else if (n.type === 3) {
        pt.visible = true;
        if (tickRemoveMods.has(k)) pt.attach = true;
        slide.points.push(pt);
      } else if (n.type === 5) {
        if (tickRemoveMods.has(k)) continue;
        pt.visible = false;
        slide.points.push(pt);
      }
    }
    if (slide.points.length < 2) continue;
    // 始点・終点は経路の端なので attach にはしない
    delete slide.points[0].attach;
    delete slide.points[slide.points.length - 1].attach;
    if (active) {
      const key = keyOf(startNote);
      const dupe = slideByStart.get(key);
      if (dupe) notes.splice(notes.indexOf(dupe), 1);
      slideByStart.set(key, slide);
    }
    notes.push(slide);
  }
  notes.sort((a, b) => (a.type === 'single' ? a.beat : a.points[0].beat) - (b.type === 'single' ? b.beat : b.points[0].beat));
  if (!notes.some((n) => n.type === 'single' || !n.guide)) throw new Error('SUS からノーツを読み取れませんでした');

  const bpms: BpmChange[] = score.bpmChanges.filter((b) => b.bpm > 0).map((b) => ({ beat: b.tick / tpb, bpm: b.bpm }));
  const meta = score.meta;
  const diffNames: Record<string, Difficulty> = { '0': 'easy', '1': 'normal', '2': 'hard', '3': 'expert', '4': 'master', '5': 'append' };
  const rawDiff = unquote(meta.get('DIFFICULTY')).toLowerCase();
  const difficulty: Difficulty = diffNames[rawDiff] ?? (DIFFICULTIES.includes(rawDiff as Difficulty) ? (rawDiff as Difficulty) : 'master');
  const level = parseInt(unquote(meta.get('PLAYLEVEL')), 10);

  return emptyChart({
    title: unquote(meta.get('TITLE')) || '無題の SUS 譜面',
    artist: unquote(meta.get('ARTIST')),
    charter: unquote(meta.get('DESIGNER')),
    difficulty,
    level: Number.isFinite(level) ? level : 30,
    offset: score.offset,
    bpms: bpms.length ? bpms : [{ beat: 0, bpm: 120 }],
    notes,
  });
}
