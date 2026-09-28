import { ChartData, NoteData, SingleNoteData, SlideNoteData, SlidePointData, cloneChart, newChartId } from './chart';

/**
 * 12レーン譜面（プロセカ / SUS）を 6 キー用の 6 レーン譜面に変換する。
 *
 * - 各ノーツは中心位置から 1 キー（2 レーン幅）に割り当てる
 * - 同時押しは左右の並びを保ったまま別々のキーへ。上限を超えたら重要度の低いものを省く
 *   （押しっぱなしのスライドも指 1 本として数える）
 * - 元譜面で位置が動いているのに同じキーに潰れる連打は、動いた方向の隣のキーへ逃がす
 * - スライドは元の経路がキーの境目をまたぐ瞬間に 1 キーずつ階段状に移動させる
 * - スライドが押さえているキーに他のノーツが重なる場合は別のキーへ移す（無理なら省く）
 */

export type ThinLevel = 'none' | 'light' | 'easy';

export interface Convert6Options {
  /** 同時に押すキーの上限（スライドの押しっぱなしを含む）。0 = 制限なし */
  maxChord: number;
  /** 間引き: none=そのまま / light=8分より細かいものを省く / easy=4分より細かいものを省く */
  thin: ThinLevel;
}

export interface Convert6Report {
  input: number;
  output: number;
  dropped: number;
  moved: number;
}

export const KEYS = 6;
const EPS = 1e-6;

const keyCenter = (k: number) => k * 2 + 1;
const clampKey = (k: number) => Math.max(0, Math.min(KEYS - 1, k));
const centerOf = (p: { lane: number; width: number }) => p.lane + p.width / 2;

/** 中心位置 c に近い順のキー候補（境目ちょうどは両隣が同点） */
function keyCandidates(c: number): number[] {
  return [0, 1, 2, 3, 4, 5].sort((a, b) => Math.abs(keyCenter(a) - c) - Math.abs(keyCenter(b) - c) || a - b);
}
function baseKey(c: number) {
  return clampKey(Math.floor(Math.min(11.999, Math.max(0, c)) / 2));
}

interface KeySpan {
  from: number;
  to: number;
  key: number;
}

interface Item {
  beat: number;
  center: number;
  priority: number;
  single?: SingleNoteData;
  slide?: SlideNoteData;
}

const onGrid = (beat: number, g: number) => Math.abs(beat / g - Math.round(beat / g)) < 1e-4;

function priorityOf(n: NoteData): number {
  if (n.type === 'slide') return 50 + Math.min(40, n.points[n.points.length - 1].beat - n.points[0].beat);
  if (n.critical) return 30;
  if (n.kind === 'flick' || n.dir) return 20;
  if (n.kind === 'tap') return 10;
  return 5;
}

/** 変換後のスライドの点列と、キーごとの占有区間を作る */
function buildSlide(src: SlideNoteData, shift: number): { slide: SlideNoteData; spans: KeySpan[] } {
  const pts = [...src.points].sort((a, b) => a.beat - b.beat);
  const joints = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !p.attach);
  const cs = joints.map((p) => centerOf(p) + shift * 2);
  const keyAtJoint = cs.map(baseKey);
  const out: SlidePointData[] = [];
  const spans: KeySpan[] = [];
  const key6 = (k: number) => ({ lane: k * 2, width: 2 });

  // 経路上の各時点のキー
  const keyAt = (beat: number): number => {
    for (let i = 0; i < joints.length - 1; i++) {
      const a = joints[i];
      const b = joints[i + 1];
      if (beat <= b.beat + EPS) {
        const u = b.beat > a.beat ? Math.max(0, Math.min(1, (beat - a.beat) / (b.beat - a.beat))) : 1;
        return baseKey(cs[i] + (cs[i + 1] - cs[i]) * u);
      }
    }
    return keyAtJoint[keyAtJoint.length - 1];
  };

  const first = pts[0];
  const last = pts[pts.length - 1];
  const start: SlidePointData = { beat: first.beat, ...key6(keyAtJoint[0]) };
  if (first.trace) start.trace = true;
  if (first.critical) start.critical = true;
  out.push(start);
  let spanFrom = first.beat;
  let curKey = keyAtJoint[0];

  // 階段の段差（元の中心が境目をまたぐ時刻）
  for (let i = 0; i < joints.length - 1; i++) {
    const a = joints[i];
    const b = joints[i + 1];
    const ca = cs[i];
    const cb = cs[i + 1];
    const ka = baseKey(ca);
    const kb = baseKey(cb);
    if (ka === kb || b.beat - a.beat < EPS) {
      if (ka !== curKey || kb !== curKey) {
        // 同じ拍での瞬間移動
        if (kb !== curKey) {
          spans.push({ from: spanFrom, to: b.beat, key: curKey });
          out.push({ beat: b.beat, ...key6(curKey), visible: false }, { beat: b.beat, ...key6(kb), visible: false });
          spanFrom = b.beat;
          curKey = kb;
        }
      }
      continue;
    }
    const dir = kb > ka ? 1 : -1;
    for (let k = ka; k !== kb; k += dir) {
      const boundary = dir > 0 ? (k + 1) * 2 : k * 2;
      const u = (boundary - ca) / (cb - ca);
      const beat = a.beat + (b.beat - a.beat) * Math.max(0, Math.min(1, u));
      const next = k + dir;
      spans.push({ from: spanFrom, to: beat, key: curKey });
      out.push({ beat, ...key6(curKey), visible: false }, { beat, ...key6(next), visible: false });
      spanFrom = beat;
      curKey = next;
    }
  }

  // 見える中継点
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (p.visible === false) continue;
    const pt: SlidePointData = { beat: p.beat, ...key6(keyAt(p.beat)), visible: true, attach: true };
    if (p.trace) pt.trace = true;
    if (p.critical) pt.critical = true;
    out.push(pt);
  }

  const end: SlidePointData = { beat: last.beat, ...key6(curKey) };
  if (last.trace) end.trace = true;
  if (last.critical) end.critical = true;
  out.push(end);
  spans.push({ from: spanFrom, to: last.beat, key: curKey });

  // 同じ拍の点の順序を保ったまま並べる（段差の2点は挿入順を維持）
  const indexed = out.map((p, i) => ({ p, i }));
  indexed.sort((x, y) => x.p.beat - y.p.beat || rank(x.p, out) - rank(y.p, out) || x.i - y.i);
  const points = indexed.map((x) => x.p);
  // 始点・終点は両端
  const s0 = points.indexOf(start);
  points.splice(s0, 1);
  points.unshift(start);
  const e0 = points.indexOf(end);
  points.splice(e0, 1);
  points.push(end);

  const slide: SlideNoteData = { type: 'slide', points };
  if (src.critical) slide.critical = true;
  if (src.endFlick) slide.endFlick = src.endFlick;
  if (src.startHidden) slide.startHidden = true;
  if (src.endHidden) slide.endHidden = true;
  if (src.guide) slide.guide = true;
  return { slide, spans };

  function rank(p: SlidePointData, all: SlidePointData[]) {
    return p === all[0] ? -1 : 0;
  }
}

export function convertTo6(chart: ChartData, opts: Convert6Options): { chart: ChartData; report: Convert6Report } {
  const src = cloneChart(chart);
  const grid = opts.thin === 'easy' ? 1 : opts.thin === 'light' ? 0.5 : 0;
  const maxChord = opts.maxChord > 0 ? opts.maxChord : Infinity;
  const report: Convert6Report = { input: src.notes.length, output: 0, dropped: 0, moved: 0 };

  const guides: SlideNoteData[] = [];
  const items: Item[] = [];
  for (const n of src.notes) {
    if (n.type === 'slide') n.points.sort((a, b) => a.beat - b.beat);
    if (n.type === 'slide' && n.guide) {
      guides.push(n);
      continue;
    }
    const beat = n.type === 'single' ? n.beat : n.points[0].beat;
    if (grid && n.type === 'single' && !n.critical && !onGrid(beat, grid)) {
      report.dropped++;
      continue;
    }
    if (grid && n.type === 'slide') {
      for (let i = 1; i < n.points.length - 1; i++) if (!onGrid(n.points[i].beat, grid)) n.points[i].visible = false;
    }
    items.push({
      beat,
      center: n.type === 'single' ? centerOf(n) : centerOf(n.points[0]),
      priority: priorityOf(n),
      single: n.type === 'single' ? n : undefined,
      slide: n.type === 'slide' ? n : undefined,
    });
  }
  items.sort((a, b) => a.beat - b.beat || a.center - b.center);

  const out: NoteData[] = [];
  const active: { spans: KeySpan[]; start: number; end: number }[] = [];
  const keyOfActive = (a: { spans: KeySpan[] }, beat: number): number | null => {
    for (const s of a.spans) if (beat >= s.from - EPS && beat <= s.to + EPS) return s.key;
    return null;
  };
  let prev: { beat: number; center: number; key: number } | null = null;

  for (let i = 0; i < items.length; ) {
    let j = i + 1;
    while (j < items.length && Math.abs(items[j].beat - items[i].beat) < EPS) j++;
    const group = items.slice(i, j);
    const beat = group[0].beat;
    i = j;

    // この時刻に押さえ続けているスライド
    const holding = active.filter((a) => a.start < beat - EPS && a.end > beat - EPS);
    const busy = new Set<number>();
    for (const a of holding) {
      const k = keyOfActive(a, beat);
      if (k !== null) busy.add(k);
    }
    // 指の数の上限
    const budget = Math.max(0, maxChord - holding.length);
    let keep = group;
    if (group.length > budget) {
      const mean = group.reduce((s, g) => s + g.center, 0) / group.length;
      keep = [...group].sort((a, b) => b.priority - a.priority || Math.abs(b.center - mean) - Math.abs(a.center - mean)).slice(0, budget);
      report.dropped += group.length - keep.length;
      keep.sort((a, b) => a.center - b.center);
    }

    // 左から順にキーを割り当てる（左右の並びを保つ）
    let lastKey = -1;
    const placed: { item: Item; key: number }[] = [];
    for (const it of keep) {
      let cands = keyCandidates(it.center).filter((k) => !busy.has(k) && !placed.some((p) => p.key === k));
      const ordered = cands.filter((k) => k > lastKey);
      if (ordered.length) cands = ordered;
      if (!cands.length) {
        report.dropped++;
        continue;
      }
      let key = cands[0];
      const tie = cands.length > 1 && Math.abs(keyCenter(cands[0]) - it.center) === Math.abs(keyCenter(cands[1]) - it.center);
      if (keep.length === 1 && prev && beat - prev.beat <= 1 + EPS) {
        if (tie) {
          // 境目ちょうど: 直前と同じキーを避ける / 近い方
          const pair = [cands[0], cands[1]];
          key = pair.includes(prev.key) ? pair.find((k) => k !== prev!.key)! : pair.sort((a, b) => Math.abs(a - prev!.key) - Math.abs(b - prev!.key))[0];
        } else if (key === prev.key && Math.abs(it.center - prev.center) > EPS) {
          // 元は動いているのに同じキーに潰れる → 動いた方向へ
          const alt = key + Math.sign(it.center - prev.center);
          if (alt >= 0 && alt < KEYS && cands.includes(alt) && Math.abs(keyCenter(alt) - it.center) <= 2.5) {
            key = alt;
            report.moved++;
          }
        }
      }
      if (it.slide) {
        // スライド全体が他のスライドとぶつからない位置を探す
        const shiftBase = key - baseKey(it.center);
        let built: ReturnType<typeof buildSlide> | null = null;
        for (const d of [0, 1, -1, 2, -2, 3, -3]) {
          const b = buildSlide(it.slide, shiftBase + d);
          const startKey = b.spans[0].key;
          if (busy.has(startKey) || placed.some((p) => p.key === startKey) || startKey <= lastKey) continue;
          const clash = active.some((a) =>
            a.end > beat + EPS &&
            b.spans.some((s) => a.spans.some((t) => t.key === s.key && t.from < s.to - EPS && s.from < t.to - EPS)),
          );
          if (!clash) {
            built = b;
            if (d !== 0) report.moved++;
            break;
          }
        }
        if (!built) {
          report.dropped++;
          continue;
        }
        key = built.spans[0].key;
        out.push(built.slide);
        const endBeat = it.slide.points[it.slide.points.length - 1].beat;
        active.push({ spans: built.spans, start: beat, end: endBeat });
      } else {
        const n = { ...it.single!, lane: key * 2, width: 2 };
        out.push(n);
      }
      placed.push({ item: it, key });
      lastKey = key;
    }
    if (placed.length === 1) prev = { beat, center: placed[0].item.center, key: placed[0].key };
    else if (placed.length > 1) prev = null;
    // 終わったスライドを外す
    for (let a = active.length - 1; a >= 0; a--) if (active[a].end < beat - EPS) active.splice(a, 1);
  }

  for (const g of guides) out.push(buildSlide(g, 0).slide);
  out.sort((a, b) => (a.type === 'single' ? a.beat : a.points[0].beat) - (b.type === 'single' ? b.beat : b.points[0].beat));
  report.output = out.length;

  const result: ChartData = {
    ...src,
    id: newChartId(),
    notes: out,
    keyMode: 6,
  };
  delete result.builtin;
  return { chart: result, report };
}

/** 6キーで物理的に押せるかを検査する（テスト・デバッグ用）。問題点の説明を返す */
export function checkSixKey(chart: ChartData, maxChord: number): string[] {
  const problems: string[] = [];
  interface Ev {
    beat: number;
    key: number;
    what: string;
  }
  const events: Ev[] = [];
  const holds: { from: number; to: number; spans: KeySpan[] }[] = [];
  for (const n of chart.notes) {
    if (n.type === 'single') {
      if (n.width !== 2 || n.lane % 2) problems.push(`幅/位置が1キーでない: ${n.beat}`);
      events.push({ beat: n.beat, key: n.lane / 2, what: n.kind });
    } else if (!n.guide) {
      const pts = n.points;
      const spans: KeySpan[] = [];
      const joints = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !p.attach);
      for (let i = 0; i < joints.length - 1; i++) {
        const a = joints[i];
        const b = joints[i + 1];
        if (a.lane !== b.lane && b.beat - a.beat > EPS) problems.push(`スライドが斜めに動いている: ${a.beat}`);
        spans.push({ from: a.beat, to: b.beat, key: a.lane / 2 });
      }
      holds.push({ from: pts[0].beat, to: pts[pts.length - 1].beat, spans });
      events.push({ beat: pts[0].beat, key: pts[0].lane / 2, what: 'slideStart' });
    }
  }
  const byBeat = new Map<string, Ev[]>();
  for (const e of events) {
    const k = e.beat.toFixed(5);
    byBeat.set(k, [...(byBeat.get(k) ?? []), e]);
  }
  for (const [k, evs] of byBeat) {
    const beat = Number(k);
    const keys = evs.map((e) => e.key);
    if (new Set(keys).size !== keys.length) problems.push(`同じキーに同時のノーツ: ${beat}`);
    const holding = holds.filter((h) => h.from < beat - EPS && h.to > beat - EPS);
    for (const h of holding) {
      const span = h.spans.find((s) => beat >= s.from - EPS && beat <= s.to + EPS);
      if (span && keys.includes(span.key)) problems.push(`スライドが押さえているキーにノーツ: ${beat}`);
    }
    if (maxChord > 0 && evs.length + holding.length > maxChord) problems.push(`同時押し上限超過(${evs.length + holding.length}): ${beat}`);
  }
  for (let a = 0; a < holds.length; a++)
    for (let b = a + 1; b < holds.length; b++)
      for (const s of holds[a].spans)
        for (const t of holds[b].spans)
          if (s.key === t.key && s.from < t.to - EPS && t.from < s.to - EPS) problems.push(`スライド同士が重なる: ${Math.max(s.from, t.from)}`);
  return problems;
}
