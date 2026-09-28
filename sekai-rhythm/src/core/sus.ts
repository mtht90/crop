import { BpmChange, ChartData, Difficulty, DIFFICULTIES, FlickDir, LANES, NoteData, SlideNoteData, SlidePointData, emptyChart } from './chart';

/**
 * SUS 形式（プロセカのファン譜面で使われている Ched / Sonolus 系）を読み込む。
 * - #mmm1x : タップ (1=通常, 2=クリティカル, 3=中継点を隠す/コンボなし, 5=なぞり, 6=クリティカルなぞり)
 * - #mmm5x : フリック/方向 (1=上, 3=左上, 4=右上, 2/5/6=カーブ指定 → 直線化するので無視)
 * - #mmm3xy: スライド (1=始点, 2=終点, 3=中継点, 5=不可視中継点)
 * - #mmm02 : 拍子,  #mmm08 : BPM 変化 (#BPMxx で定義)
 * レーン x は 2..13 がプロセカの 12 レーン。
 */

interface RawNote {
  beat: number;
  lane: number;
  width: number;
  type: number;
}

const EPS = 1e-6;

export function parseSus(text: string): ChartData {
  const meta: Record<string, string> = {};
  const bpmDefs = new Map<string, number>();
  const timeSigs = new Map<number, number>();
  interface Line {
    measure: number;
    channel: string;
    data: string;
  }
  const lines: Line[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('#')) continue;
    let m = line.match(/^#(\d{3})(\w{2,3}):\s*(.*)$/);
    if (m) {
      const measure = parseInt(m[1], 10);
      const channel = m[2].toLowerCase();
      const data = m[3].trim();
      if (channel === '02') timeSigs.set(measure, parseFloat(data));
      else lines.push({ measure, channel, data });
      continue;
    }
    m = line.match(/^#BPM(\w{2}):\s*([\d.]+)/i);
    if (m) {
      bpmDefs.set(m[1].toLowerCase(), parseFloat(m[2]));
      continue;
    }
    m = line.match(/^#(\w+)\s+(.*)$/);
    if (m) meta[m[1].toUpperCase()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }

  // 小節 → 拍
  const maxMeasure = Math.max(0, ...lines.map((l) => l.measure)) + 1;
  const measureStart: number[] = [];
  const measureLen: number[] = [];
  let beats = 0;
  let sig = 4;
  for (let i = 0; i <= maxMeasure; i++) {
    if (timeSigs.has(i)) sig = timeSigs.get(i)! || 4;
    measureStart.push(beats);
    measureLen.push(sig);
    beats += sig;
  }

  const bpms: BpmChange[] = [];
  const taps: RawNote[] = [];
  const dirs: RawNote[] = [];
  const slideEvents = new Map<string, RawNote[]>();

  const each = (l: Line, fn: (beat: number, a: string, b: string) => void) => {
    const d = l.data.replace(/\s+/g, '');
    const n = Math.floor(d.length / 2);
    for (let i = 0; i < n; i++) {
      const a = d[i * 2];
      const b = d[i * 2 + 1];
      if (a === '0' && b === '0') continue;
      fn(measureStart[l.measure] + (i / n) * measureLen[l.measure], a, b);
    }
  };

  for (const l of lines) {
    const ch = l.channel;
    if (ch === '08') {
      each(l, (beat, a, b) => {
        const bpm = bpmDefs.get((a + b).toLowerCase());
        if (bpm) bpms.push({ beat, bpm });
      });
      continue;
    }
    const kind = ch[0];
    const laneRaw = parseInt(ch[1], 36);
    const lane = laneRaw - 2;
    const push = (list: RawNote[]) =>
      each(l, (beat, a, b) => {
        const type = parseInt(a, 36);
        const width = parseInt(b, 36);
        if (!width) return;
        list.push({ beat, lane, width, type });
      });
    if (kind === '1' && ch.length === 2) push(taps);
    else if (kind === '5' && ch.length === 2) push(dirs);
    else if (kind === '3' && ch.length === 3) {
      const key = ch[2];
      if (!slideEvents.has(key)) slideEvents.set(key, []);
      push(slideEvents.get(key)!);
    }
  }

  const same = (a: RawNote, b: { beat: number; lane: number }) => Math.abs(a.beat - b.beat) < EPS && a.lane === b.lane;
  const used = new Set<RawNote>();
  const findTap = (p: { beat: number; lane: number }) => taps.find((t) => same(t, p));
  const findDir = (p: { beat: number; lane: number }) => dirs.find((t) => same(t, p));
  const dirOf = (type: number): FlickDir | null => (type === 1 ? 'up' : type === 3 ? 'left' : type === 4 ? 'right' : null);

  const notes: NoteData[] = [];
  const clampNote = <T extends { lane: number; width: number }>(n: T): T | null => {
    let l = n.lane;
    let w = n.width;
    if (l < 0) {
      w += l;
      l = 0;
    }
    if (l + w > LANES) w = LANES - l;
    if (w < 1) return null;
    return { ...n, lane: l, width: w };
  };

  // スライド
  for (const events of slideEvents.values()) {
    // 同じ拍では 終点 → 中継点 → 始点 の順（連続するスライドのため）
    const order = (t: number) => (t === 2 ? 0 : t === 1 ? 2 : 1);
    events.sort((a, b) => a.beat - b.beat || order(a.type) - order(b.type));
    let cur: RawNote[] = [];
    const flush = () => {
      if (cur.length < 2) {
        cur = [];
        return;
      }
      const startTap = findTap(cur[0]);
      const endTap = findTap(cur[cur.length - 1]);
      const endDir = findDir(cur[cur.length - 1]);
      const critical = startTap?.type === 2 || startTap?.type === 6;
      const points: SlidePointData[] = [];
      cur.forEach((e, i) => {
        const marker = findTap(e);
        if (marker) used.add(marker);
        const d = findDir(e);
        if (d) used.add(d);
        const pt = clampNote({ beat: e.beat, lane: e.lane, width: e.width, visible: true });
        if (!pt) return;
        if (i > 0 && i < cur.length - 1) pt.visible = e.type === 3 && marker?.type !== 3;
        points.push(pt);
      });
      if (points.length >= 2) {
        const slide: SlideNoteData = { type: 'slide', points };
        if (critical) slide.critical = true;
        const fd = endDir ? dirOf(endDir.type) : null;
        if (fd) slide.endFlick = fd;
        if (!critical && endTap?.type === 2 && fd) slide.critical = true;
        notes.push(slide);
      }
      cur = [];
    };
    for (const e of events) {
      if (e.type === 1) {
        flush();
        cur = [e];
      } else if (cur.length) {
        if (e.type === 2) {
          cur.push(e);
          flush();
        } else if (e.type === 3 || e.type === 5) {
          cur.push(e);
        }
      }
    }
  }

  // 単ノーツ
  for (const t of taps) {
    if (used.has(t)) continue;
    const d = findDir(t);
    const dir = d ? dirOf(d.type) : null;
    let note: NoteData | null = null;
    if (t.type === 1 || t.type === 2) {
      note = { type: 'single', kind: dir ? 'flick' : 'tap', beat: t.beat, lane: t.lane, width: t.width };
      if (t.type === 2) note.critical = true;
      if (dir) note.dir = dir;
    } else if (t.type === 5 || t.type === 6) {
      note = { type: 'single', kind: 'trace', beat: t.beat, lane: t.lane, width: t.width };
      if (t.type === 6) note.critical = true;
    }
    if (note) {
      const c = clampNote(note);
      if (c) notes.push(c);
    }
  }
  notes.sort((a, b) => (a.type === 'single' ? a.beat : a.points[0].beat) - (b.type === 'single' ? b.beat : b.points[0].beat));

  const diffNames: Record<string, Difficulty> = { '0': 'easy', '1': 'normal', '2': 'hard', '3': 'expert', '4': 'master', '5': 'append' };
  const rawDiff = (meta.DIFFICULTY ?? '').toLowerCase();
  const difficulty: Difficulty = diffNames[rawDiff] ?? (DIFFICULTIES.includes(rawDiff as Difficulty) ? (rawDiff as Difficulty) : 'master');
  const level = parseInt(meta.PLAYLEVEL ?? '', 10);
  const waveOffset = parseFloat(meta.WAVEOFFSET ?? '0') || 0;

  if (!notes.length) throw new Error('SUS からノーツを読み取れませんでした');
  return emptyChart({
    title: meta.TITLE || '無題の SUS 譜面',
    artist: meta.ARTIST || '',
    charter: meta.DESIGNER || '',
    difficulty,
    level: Number.isFinite(level) ? level : 30,
    // WAVEOFFSET は「音源開始を何秒遅らせるか」なので、拍0の音源位置は -WAVEOFFSET
    offset: -waveOffset,
    bpms: bpms.length ? bpms : [{ beat: 0, bpm: 120 }],
    notes,
  });
}
