import {
  Accidental, Beam, BarlineType, Dot, Formatter, Fraction, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Voice,
} from 'vexflow/bravura';
import {
  allStaves, eventStarts, eventTicks, measureCount, measureTicks, midiOf, STEPS,
  type Clef, type NoteEvent, type Pitch, type Pos, type Score, type Step, keyAlter,
} from './model.ts';

export const PAGE_W = 900;
export const PAGE_H = Math.round(900 * 1.4142);
const MARGIN_X = 56;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 50;
const TITLE_SPACE = 110;
const STAFF_GAP = 95; // 譜表間（上端線どうし）
const SYSTEM_GAP = 50;
const STAVE_TOP_PAD = 30; // Stave の y から第5線までの距離 (VexFlow 既定: 3 スペース)

const KEY_SPECS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
export const keySpec = (fifths: number) => KEY_SPECS[fifths + 7];

const TOP_LINE: Record<Clef, { step: Step; octave: number }> = {
  treble: { step: 'F', octave: 5 }, bass: { step: 'A', octave: 3 }, alto: { step: 'G', octave: 4 }, tenor: { step: 'E', octave: 4 },
};
const REST_KEY: Record<Clef, string> = { treble: 'b/4', bass: 'd/3', alto: 'c/4', tenor: 'a/3' };

const DUR_WIDTH: Record<NoteEvent['dur'], number> = { w: 52, h: 42, q: 34, '8': 29, '16': 25, '32': 23, '64': 22 };

export const SEL_COLOR = '#1d6fe0';
export const INPUT_COLOR = '#e0761d';

export interface EventGeo { pos: Pos; page: number; x: number; y: number; w: number; h: number; noteX: number }
export interface StaffGeo { staff: number; topLineY: number; x0: number; x1: number }
export interface MeasureGeo {
  measure: number; system: number; page: number; x0: number; x1: number; top: number; bottom: number;
  points: { tick: number; x: number }[]; // 小節内ティック → x 座標
  staffNoteX: { tick: number; x: number }[][]; // 譜表ごと
}
export interface SystemGeo { page: number; top: number; bottom: number; first: number; last: number; staves: StaffGeo[] }
export interface Layout {
  pages: HTMLElement[];
  events: EventGeo[];
  measures: MeasureGeo[];
  systems: SystemGeo[];
}

export interface RenderOptions {
  selected: Set<string>; // "staff:measure:index"
  inputPos?: Pos | null;
}

export const posKey = (p: Pos) => `${p.staff}:${p.measure}:${p.index}`;

function vfKey(p: Pitch): string {
  const acc = p.alter > 0 ? '#'.repeat(p.alter) : 'b'.repeat(-p.alter);
  return `${p.step.toLowerCase()}${acc}/${p.octave}`;
}

function measureMinWidth(score: Score, mi: number): number {
  let w = 0;
  for (const st of allStaves(score)) {
    let sw = 24;
    const m = st.measures[mi];
    if (m.events.length === 1 && m.events[0].rest) sw = 80;
    else for (const ev of m.events) {
      sw += DUR_WIDTH[ev.dur] + ev.dots * 8;
      if (ev.pitches.some((p) => p.alter !== keyAlter(score.keySig, p.step))) sw += 12;
    }
    w = Math.max(w, sw);
  }
  return w;
}

function headerWidth(score: Score, firstSystem: boolean): number {
  return 42 + Math.abs(score.keySig) * 11 + (firstSystem ? 32 : 0);
}

/** 譜表上の y 座標から音高を求める（クリックでの入力用） */
export function pitchAtY(clef: Clef, topLineY: number, y: number, keySig: number): Pitch {
  const top = TOP_LINE[clef];
  const topIdx = top.octave * 7 + STEPS.indexOf(top.step);
  const steps = Math.round((y - topLineY) / 5);
  const idx = topIdx - steps;
  const step = STEPS[((idx % 7) + 7) % 7];
  const octave = Math.floor(idx / 7);
  return { step, alter: keyAlter(keySig, step), octave };
}

interface SysPlan { first: number; last: number; widths: number[]; indent: number; offsets: number[]; extraTop: number; height: number }

/** 譜表ごとの上下のはみ出し量（加線・符幹）を見積もる */
function staffExtents(score: Score, s: number, first: number, last: number): { above: number; below: number } {
  const st = allStaves(score)[s];
  const top = TOP_LINE[st.clef];
  const topIdx = top.octave * 7 + STEPS.indexOf(top.step);
  let above = 0;
  let below = 0;
  for (let mi = first; mi <= last; mi++) {
    for (const ev of st.measures[mi].events) {
      if (ev.rest || !ev.pitches.length) continue;
      const ys = ev.pitches.map((p) => (topIdx - (p.octave * 7 + STEPS.indexOf(p.step))) * 5);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const stemUp = (minY + maxY) / 2 > 20;
      const hasStem = ev.dur !== 'w';
      const extTop = stemUp && hasStem ? Math.min(minY, maxY - 35) : minY - 6;
      const extBottom = !stemUp && hasStem ? Math.max(maxY, minY + 35) : maxY + 6;
      above = Math.max(above, -extTop);
      below = Math.max(below, extBottom - 40);
    }
  }
  return { above, below };
}

function planSystems(score: Score): SysPlan[] {
  const n = measureCount(score);
  const usable = PAGE_W - MARGIN_X * 2;
  const plans: SysPlan[] = [];
  let mi = 0;
  while (mi < n) {
    const firstSystem = plans.length === 0;
    const indent = firstSystem ? 70 : 20;
    const avail = usable - indent;
    const widths: number[] = [];
    let total = 0;
    const start = mi;
    while (mi < n) {
      let w = measureMinWidth(score, mi);
      if (mi === start) w += headerWidth(score, firstSystem);
      if (widths.length > 0 && total + w > avail) break;
      widths.push(w);
      total += w;
      mi++;
    }
    // 両端揃え（最終段で余白が大きい場合は伸ばしすぎない）
    const isLast = mi >= n;
    const fill = isLast && total < avail * 0.6 ? 1 : avail / total;
    const ext = allStaves(score).map((_, si) => staffExtents(score, si, start, mi - 1));
    const offsets = [0];
    for (let si = 1; si < ext.length; si++) {
      offsets.push(offsets[si - 1] + Math.max(STAFF_GAP, 40 + ext[si - 1].below + ext[si].above + 24));
    }
    const extraTop = Math.max(0, ext[0].above - 22);
    const height = extraTop + offsets[offsets.length - 1] + 40 + Math.max(0, ext[ext.length - 1].below - 10);
    plans.push({ first: start, last: mi - 1, widths: widths.map((w) => w * Math.max(1, fill)), indent, offsets, extraTop, height });
  }
  return plans;
}

export function renderScore(container: HTMLElement, score: Score, opts: RenderOptions): Layout {
  container.innerHTML = '';
  const staves = allStaves(score);
  const nStaves = staves.length;
  const plans = planSystems(score);
  const layout: Layout = { pages: [], events: [], measures: [], systems: [] };
  const timeSpec = `${score.timeSig.num}/${score.timeSig.den}`;
  const kSpec = keySpec(score.keySig);
  const mt = measureTicks(score);

  // ページ割り
  const pageOf: number[] = [];
  const topOf: number[] = [];
  let page = 0;
  let y = MARGIN_TOP + TITLE_SPACE;
  for (let si = 0; si < plans.length; si++) {
    const h = plans[si].height;
    if (y + h + STAVE_TOP_PAD > PAGE_H - MARGIN_BOTTOM && si > 0 && y > MARGIN_TOP + 1) {
      page++;
      y = MARGIN_TOP;
    }
    pageOf.push(page);
    topOf.push(y);
    y += h + SYSTEM_GAP + 30;
  }
  const nPages = page + 1;
  const ctxs = Array.from({ length: nPages }, (_, p) => {
    const div = document.createElement('div');
    div.className = 'page';
    div.dataset.page = String(p);
    container.appendChild(div);
    layout.pages.push(div);
    const r = new Renderer(div, Renderer.Backends.SVG);
    r.resize(PAGE_W, PAGE_H);
    const ctx = r.getContext();
    const svg = div.querySelector('svg')!;
    svg.setAttribute('viewBox', `0 0 ${PAGE_W} ${PAGE_H}`);
    return ctx;
  });

  // タイトル
  {
    const svg = layout.pages[0].querySelector('svg')!;
    const mk = (text: string, x: number, yy: number, size: number, anchor: string, weight = 'normal') => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(yy));
      t.setAttribute('font-size', String(size));
      t.setAttribute('text-anchor', anchor);
      t.setAttribute('font-weight', weight);
      t.setAttribute('font-family', '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif');
      t.textContent = text;
      svg.appendChild(t);
    };
    mk(score.title, PAGE_W / 2, MARGIN_TOP + 40, 28, 'middle', 'bold');
    if (score.composer) mk(score.composer, PAGE_W - MARGIN_X, MARGIN_TOP + 80, 15, 'end');
    mk(`♩ = ${score.tempo}`, MARGIN_X + 70, MARGIN_TOP + 95, 14, 'start');
  }

  const noteMap = new Map<string, { note: StaveNote; system: number }>();

  plans.forEach((plan, sysIdx) => {
    const ctx = ctxs[pageOf[sysIdx]];
    const top = topOf[sysIdx];
    const staffY = (s: number) => top + plan.extraTop + plan.offsets[s];
    const sysGeo: SystemGeo = { page: pageOf[sysIdx], top, bottom: top + plan.height + STAVE_TOP_PAD + 10, first: plan.first, last: plan.last, staves: [] };
    const firstStaves: Stave[] = [];
    const lastStaves: Stave[] = [];
    let x = MARGIN_X + plan.indent;

    for (let mi = plan.first; mi <= plan.last; mi++) {
      const w = plan.widths[mi - plan.first];
      const isFirstInSys = mi === plan.first;
      const mStaves: Stave[] = staves.map((st, s) => {
        const stave = new Stave(x, staffY(s), w);
        if (isFirstInSys) {
          stave.addClef(st.clef);
          if (score.keySig !== 0) stave.addKeySignature(kSpec);
          if (sysIdx === 0) stave.addTimeSignature(timeSpec);
        }
        if (mi === measureCount(score) - 1) stave.setEndBarType(BarlineType.END);
        stave.setContext(ctx);
        return stave;
      });
      const noteStart = Math.max(...mStaves.map((s) => s.getNoteStartX()));
      mStaves.forEach((s) => s.setNoteStartX(noteStart));
      if (isFirstInSys) firstStaves.push(...mStaves);
      if (mi === plan.last) lastStaves.push(...mStaves);

      const voices: Voice[] = [];
      const beams: Beam[] = [];
      const notesPerStaff: StaveNote[][] = [];
      staves.forEach((st, s) => {
        const m = st.measures[mi];
        const fullRest = m.events.length === 1 && m.events[0].rest && eventTicks(m.events[0]) === mt;
        const notes = m.events.map((ev, idx) => {
          const pos = { staff: s, measure: mi, index: idx };
          let note: StaveNote;
          if (ev.rest) {
            note = new StaveNote({
              keys: [REST_KEY[st.clef]], duration: fullRest ? 'w' : ev.dur, type: 'r', dots: fullRest ? 0 : ev.dots, clef: st.clef,
              alignCenter: fullRest, ...(fullRest ? { durationOverride: new Fraction(score.timeSig.num, score.timeSig.den) } : {}),
            });
          } else {
            const sorted = [...ev.pitches].sort((a, b) => midiOf(a) - midiOf(b));
            note = new StaveNote({ keys: sorted.map(vfKey), duration: ev.dur, dots: ev.dots, clef: st.clef, autoStem: true });
          }
          if (ev.dots && !fullRest) Dot.buildAndAttach([note], { all: true });
          const key = posKey(pos);
          const isInput = opts.inputPos && posKey(opts.inputPos) === key;
          if (opts.selected.has(key)) note.setStyle({ fillStyle: SEL_COLOR, strokeStyle: SEL_COLOR });
          else if (isInput) note.setStyle({ fillStyle: INPUT_COLOR, strokeStyle: INPUT_COLOR });
          note.setStave(mStaves[s]);
          noteMap.set(key, { note, system: sysIdx });
          return note;
        });
        const voice = new Voice({ numBeats: score.timeSig.num, beatValue: score.timeSig.den }).setMode(Voice.Mode.SOFT);
        voice.addTickables(notes);
        Accidental.applyAccidentals([voice], kSpec);
        voices.push(voice);
        notesPerStaff.push(notes);
        const beamable = notes.filter((n) => !n.isRest());
        if (beamable.length > 1) {
          try {
            beams.push(...Beam.generateBeams(notes, { groups: Beam.getDefaultBeamGroups(timeSpec), beamRests: false }));
          } catch { /* 連桁生成に失敗しても描画は続ける */ }
        }
      });
      const fmt = new Formatter();
      voices.forEach((v) => fmt.joinVoices([v]));
      fmt.format(voices, Math.max(10, mStaves[0].getNoteEndX() - noteStart - 14));
      mStaves.forEach((s) => s.draw());
      voices.forEach((v, s) => v.draw(ctx, mStaves[s]));
      beams.forEach((b) => b.setContext(ctx).draw());

      // ジオメトリの記録
      const pointMap = new Map<number, number>();
      const staffNoteX: { tick: number; x: number }[][] = [];
      notesPerStaff.forEach((notes, s) => {
        const starts = eventStarts(staves[s].measures[mi]);
        const list: { tick: number; x: number }[] = [];
        notes.forEach((n, idx) => {
          const bb = n.getBoundingBox();
          const nx = n.getAbsoluteX();
          layout.events.push({
            pos: { staff: s, measure: mi, index: idx }, page: pageOf[sysIdx],
            x: bb.getX(), y: bb.getY(), w: bb.getW(), h: bb.getH(), noteX: nx,
          });
          list.push({ tick: starts[idx], x: nx });
          if (!pointMap.has(starts[idx]) || pointMap.get(starts[idx])! > nx) pointMap.set(starts[idx], nx);
        });
        staffNoteX.push(list);
      });
      const points = [...pointMap.entries()].sort((a, b) => a[0] - b[0]).map(([tick, px]) => ({ tick, x: px }));
      layout.measures[mi] = {
        measure: mi, system: sysIdx, page: pageOf[sysIdx], x0: x, x1: x + w, top: staffY(0) + STAVE_TOP_PAD - 20, bottom: staffY(nStaves - 1) + STAVE_TOP_PAD + 60,
        points, staffNoteX,
      };
      // パート内の小節線（大譜表）
      let s0 = 0;
      for (const part of score.parts) {
        if (part.staves.length > 1) {
          new StaveConnector(mStaves[s0], mStaves[s0 + part.staves.length - 1]).setType('singleRight').setContext(ctx).draw();
        }
        s0 += part.staves.length;
      }
      x += w;
    }

    // 段の左端の接続線・括弧・パート名
    if (nStaves > 1) new StaveConnector(firstStaves[0], firstStaves[nStaves - 1]).setType('singleLeft').setContext(ctx).draw();
    let s0 = 0;
    const svg = layout.pages[pageOf[sysIdx]].querySelector('svg')!;
    for (const part of score.parts) {
      const n = part.staves.length;
      if (n > 1) new StaveConnector(firstStaves[s0], firstStaves[s0 + n - 1]).setType('brace').setContext(ctx).draw();
      if (sysIdx === 0) {
        const yMid = (firstStaves[s0].getYForLine(0) + firstStaves[s0 + n - 1].getYForLine(4)) / 2;
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String(MARGIN_X + plan.indent - (n > 1 ? 18 : 8)));
        t.setAttribute('y', String(yMid + 5));
        t.setAttribute('font-size', '13');
        t.setAttribute('text-anchor', 'end');
        t.setAttribute('font-family', '"Yu Gothic UI", "Meiryo", sans-serif');
        t.textContent = part.name;
        svg.appendChild(t);
      }
      s0 += n;
    }
    if (score.parts.length > 1) new StaveConnector(firstStaves[0], firstStaves[nStaves - 1]).setType('bracket').setContext(ctx).draw();
    // 小節番号
    {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(MARGIN_X + plan.indent));
      t.setAttribute('y', String(staffY(0) + 18));
      t.setAttribute('font-size', '11');
      t.setAttribute('font-style', 'italic');
      t.setAttribute('fill', '#555');
      t.textContent = String(plan.first + 1);
      if (sysIdx > 0) svg.appendChild(t);
    }
    sysGeo.staves = firstStaves.map((st, s) => ({ staff: s, topLineY: st.getYForLine(0), x0: st.getX(), x1: lastStaves[s].getX() + lastStaves[s].getWidth() }));
    layout.systems.push(sysGeo);
  });

  // タイ
  staves.forEach((st, s) => {
    let prev: { ev: NoteEvent; key: string } | null = null;
    st.measures.forEach((m, mi) => {
      m.events.forEach((ev, idx) => {
        const key = posKey({ staff: s, measure: mi, index: idx });
        if (prev && prev.ev.tie && !ev.rest) {
          const a = noteMap.get(prev.key)!;
          const b = noteMap.get(key)!;
          const aSorted = [...prev.ev.pitches].sort((p, q) => midiOf(p) - midiOf(q)).map(midiOf);
          const bSorted = [...ev.pitches].sort((p, q) => midiOf(p) - midiOf(q)).map(midiOf);
          const fi: number[] = [];
          const li: number[] = [];
          aSorted.forEach((midi, i) => { const j = bSorted.indexOf(midi); if (j >= 0) { fi.push(i); li.push(j); } });
          if (fi.length) {
            if (a.system === b.system) {
              new StaveTie({ firstNote: a.note, lastNote: b.note, firstIndexes: fi, lastIndexes: li }).setContext(ctxs[pageOf[a.system]]).draw();
            } else {
              new StaveTie({ firstNote: a.note, lastNote: null, firstIndexes: fi, lastIndexes: fi }).setContext(ctxs[pageOf[a.system]]).draw();
              new StaveTie({ firstNote: null, lastNote: b.note, firstIndexes: li, lastIndexes: li }).setContext(ctxs[pageOf[b.system]]).draw();
            }
          }
        }
        prev = { ev, key };
      });
    });
  });

  // ページ番号
  layout.pages.forEach((div, p) => {
    if (p === 0) return;
    const svg = div.querySelector('svg')!;
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(PAGE_W / 2));
    t.setAttribute('y', String(PAGE_H - 24));
    t.setAttribute('font-size', '12');
    t.setAttribute('text-anchor', 'middle');
    t.textContent = String(p + 1);
    svg.appendChild(t);
  });

  return layout;
}

/** 小節 mi 内のティック tick に対応する x 座標（線形補間） */
export function xForTick(geo: MeasureGeo, tick: number, mt: number): number {
  const pts = geo.points;
  if (!pts.length) return geo.x0;
  if (tick <= pts[0].tick) return pts[0].x;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1] ?? { tick: mt, x: geo.x1 - 10 };
    if (tick >= a.tick && tick < b.tick) return a.x + ((tick - a.tick) / (b.tick - a.tick)) * (b.x - a.x);
  }
  return geo.x1 - 10;
}
