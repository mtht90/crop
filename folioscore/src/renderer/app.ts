import {
  addPart, allStaves, appendMeasures, changeTimeSignature, cloneEvent, comparePos, createScore, deleteMeasure, DUR_TICKS,
  eventStarts, eventTickInMeasure, getEvent, indexAtTick, insertMeasure, measureCount, measureTicks, midiOf, normalizeMeasure, pitchForLetter,
  pitchFromMidi, pitchName, positionsBetween, stepPos, staffOwner, transposePitch, validateScore, writeEvent,
  type DurType, type NoteEvent, type Pitch, type Pos, type Score, type Step, keyAlter,
} from './model.ts';
import { INSTRUMENTS, instrumentById } from './instruments.ts';
import { pitchAtY, posKey, renderScore, xForTick, PAGE_W, type Layout } from './render.ts';
import { AudioEngine } from './audio.ts';
import { scoreToMidi } from './midi.ts';
import { scoreToMusicXML } from './musicxml.ts';
import type { FolioApi } from '../main/preload.ts';

declare global { interface Window { folio: FolioApi; folioTest: unknown } }

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

// MuseScore と同じ音価キー割り当て
const DUR_KEYS: Record<string, DurType> = { '1': '64', '2': '32', '3': '16', '4': '8', '5': 'q', '6': 'h', '7': 'w' };
const DUR_GLYPH: Record<DurType, string> = { w: '𝅝', h: '𝅗𝅥', q: '𝅘𝅥', '8': '𝅘𝅥𝅮', '16': '𝅘𝅥𝅯', '32': '𝅘𝅥𝅰', '64': '𝅘𝅥𝅱' };
const DUR_NAME: Record<DurType, string> = { w: '全音符', h: '2分音符', q: '4分音符', '8': '8分音符', '16': '16分音符', '32': '32分音符', '64': '64分音符' };
const KEY_NAMES = ['C♭ / a♭', 'G♭ / e♭', 'D♭ / b♭', 'A♭ / f', 'E♭ / c', 'B♭ / g', 'F / d', 'C / a', 'G / e', 'D / b', 'A / f♯', 'E / c♯', 'B / g♯', 'F♯ / d♯', 'C♯ / a♯'];

interface InputCursor { staff: number; measure: number; tick: number }
interface Snapshot { score: string; sel: Sel | null; input: InputCursor }
interface Sel { anchor: Pos; head: Pos }

class App {
  score: Score = createScore();
  filePath: string | null = null;
  dirty = false;
  inputMode = false;
  sel: Sel | null = null;
  input: InputCursor = { staff: 0, measure: 0, tick: 0 };
  lastEntered: { first: Pos; last: Pos } | null = null;
  dur: DurType = 'q';
  dots = 0;
  zoom = 1;
  layout: Layout | null = null;
  undoStack: Snapshot[] = [];
  redoStack: Snapshot[] = [];
  clipboard: NoteEvent[] = [];
  audio = new AudioEngine();
  playhead: HTMLElement | null = null;
  heldMidi = new Set<number>();
  midiChordPos: Pos | null = null;

  // ------------------------------------------------------------ setup
  async start() {
    this.buildToolbar();
    this.buildPiano();
    this.buildAddPart();
    this.bindKeys();
    this.bindScoreClicks();
    window.folio.onMenu((c) => this.command(c));
    window.folio.onOpenFile((f) => this.loadFile(f.path, f.content));
    $('#tempo').addEventListener('change', (e) => {
      const v = Math.max(20, Math.min(300, Number((e.target as HTMLInputElement).value) || 100));
      this.mutate(() => { this.score.tempo = v; });
    });
    this.newScoreFromTemplate('piano', { title: '無題の楽譜', composer: '', tempo: 100, num: 4, den: 4, key: 0, measures: 16 });
    this.dirty = false;
    this.select({ staff: 0, measure: 0, index: 0 });
    this.refresh();
    void this.initAudio();
    void this.initMidiInput();
    const info = await window.folio.info();
    $('#version').textContent = `v${info.version}`;
  }

  async initAudio() {
    const status = $('#audioStatus');
    status.textContent = '音源を読み込み中…';
    try {
      const [proc, sf] = await Promise.all([window.folio.readResource('processor'), window.folio.readResource('soundfont')]);
      const bytes = sf as Uint8Array;
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      await this.audio.init(proc as string, ab);
      status.textContent = '🔊 ' + this.audio.status;
    } catch (e) {
      console.error(e);
      status.textContent = '⚠ 音源を読み込めませんでした: ' + (e as Error).message;
    }
  }

  async initMidiInput() {
    if (!navigator.requestMIDIAccess) return;
    try {
      const access = await navigator.requestMIDIAccess();
      const attach = () => access.inputs.forEach((inp) => { inp.onmidimessage = (m) => this.onMidiMessage(m.data!); });
      attach();
      access.onstatechange = attach;
    } catch { /* MIDI 非対応環境 */ }
  }

  onMidiMessage(data: Uint8Array) {
    const [st, note, vel] = data;
    const type = st & 0xf0;
    if (type === 0x90 && vel > 0) {
      const chord = this.heldMidi.size > 0 && this.lastEntered !== null;
      this.heldMidi.add(note);
      this.enterMidi(note, chord);
    } else if (type === 0x80 || (type === 0x90 && vel === 0)) {
      this.heldMidi.delete(note);
    }
  }

  // ------------------------------------------------------------ UI build
  buildToolbar() {
    const durs = $('#durations');
    (['64', '32', '16', '8', 'q', 'h', 'w'] as DurType[]).forEach((d) => {
      const key = Object.entries(DUR_KEYS).find(([, v]) => v === d)![0];
      const b = document.createElement('button');
      b.dataset.dur = d;
      b.title = `${DUR_NAME[d]} (${key})`;
      b.innerHTML = `${DUR_GLYPH[d]}<kbd>${key}</kbd>`;
      b.addEventListener('click', () => this.setDuration(d));
      durs.appendChild(b);
    });
    document.querySelectorAll<HTMLButtonElement>('#toolbar button[data-cmd], #sidebar button[data-cmd]').forEach((b) => {
      b.addEventListener('click', () => { this.command(b.dataset.cmd!); b.blur(); });
    });
    const keySel = document.querySelector<HTMLSelectElement>('#settingsDialog select[name=key]')!;
    KEY_NAMES.forEach((n, i) => {
      const o = document.createElement('option');
      o.value = String(i - 7);
      o.textContent = `${n}  (${i - 7 > 0 ? '♯' + (i - 7) : i - 7 < 0 ? '♭' + (7 - i) : '調号なし'})`;
      keySel.appendChild(o);
    });
  }

  buildPiano() {
    const piano = $('#piano');
    const low = 36; // C2
    const high = 96; // C7
    const whiteW = 24;
    let x = 0;
    const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
    for (let m = low; m <= high; m++) {
      const k = document.createElement('div');
      k.dataset.midi = String(m);
      if (isBlack(m)) {
        k.className = 'key black';
        k.style.left = `${x - 8}px`;
        k.style.width = '16px';
      } else {
        k.className = 'key white';
        k.style.left = `${x}px`;
        k.style.width = `${whiteW}px`;
        if (m % 12 === 0) k.innerHTML = `<span class="label">C${m / 12 - 1}</span>`;
        x += whiteW;
      }
      k.addEventListener('mousedown', (e) => { e.preventDefault(); this.enterMidi(m, e.shiftKey); });
      piano.appendChild(k);
    }
    piano.style.width = `${x}px`;
    requestAnimationFrame(() => {
      const wrap = $('#pianoWrap');
      wrap.scrollLeft = (piano.scrollWidth - wrap.clientWidth) / 2;
    });
  }

  buildAddPart() {
    const sel = $<HTMLSelectElement>('#addPartSelect');
    let group = '';
    let og: HTMLOptGroupElement | null = null;
    for (const inst of INSTRUMENTS) {
      if (inst.group !== group) {
        og = document.createElement('optgroup');
        og.label = group = inst.group;
        sel.appendChild(og);
      }
      const o = document.createElement('option');
      o.value = inst.id;
      o.textContent = inst.name;
      og!.appendChild(o);
    }
    $('#addPartBtn').addEventListener('click', () => {
      const inst = instrumentById(sel.value);
      this.mutate(() => { addPart(this.score, inst.name, inst.id, inst.clefs); });
      this.toast(`${inst.name} を追加しました`);
    });
  }

  renderParts() {
    const ul = $('#partList');
    ul.innerHTML = '';
    const curPart = staffOwner(this.score, this.currentStaff()).partIdx;
    this.score.parts.forEach((part, pi) => {
      const li = document.createElement('li');
      if (pi === curPart) li.className = 'current';
      li.innerHTML = `
        <div class="name"><input value="" title="パート名"><button class="icon audition" title="この楽器を試聴">▶</button><button class="icon remove" title="パートを削除">✕</button></div>
        <div class="row"><select title="楽器（音色）"></select></div>
        <div class="row"><span title="音量">🔈</span><input type="range" min="0" max="127" title="音量"></div>`;
      const name = li.querySelector('input')!;
      name.value = part.name;
      name.addEventListener('change', () => this.mutate(() => { part.name = name.value || instrumentById(part.instrument).name; }));
      const sel = li.querySelector('select')!;
      for (const inst of INSTRUMENTS) {
        const o = document.createElement('option');
        o.value = inst.id;
        o.textContent = `${inst.name}（${inst.group}）`;
        sel.appendChild(o);
      }
      sel.value = part.instrument;
      sel.addEventListener('change', () => {
        const inst = instrumentById(sel.value);
        this.mutate(() => {
          const wasDefault = INSTRUMENTS.some((i) => i.name === part.name);
          part.instrument = inst.id;
          if (wasDefault) part.name = inst.name;
        });
        void this.audio.auditionInstrument(inst.id);
      });
      const vol = li.querySelector<HTMLInputElement>('input[type=range]')!;
      vol.value = String(Math.round((part.volume / 100) * 127));
      vol.addEventListener('change', () => this.mutate(() => { part.volume = Math.round((Number(vol.value) / 127) * 100); }));
      li.querySelector('.audition')!.addEventListener('click', () => void this.audio.auditionInstrument(part.instrument));
      li.querySelector('.remove')!.addEventListener('click', () => {
        if (this.score.parts.length <= 1) { this.toast('最後のパートは削除できません'); return; }
        if (!confirm(`パート「${part.name}」を削除しますか？`)) return;
        this.mutate(() => { this.score.parts.splice(pi, 1); });
        this.select({ staff: 0, measure: 0, index: 0 });
      });
      li.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).closest('input,select,button')) return;
        let s = 0;
        for (let i = 0; i < pi; i++) s += this.score.parts[i].staves.length;
        this.select({ staff: s, measure: this.currentMeasure(), index: 0 });
      });
      ul.appendChild(li);
    });
  }

  // ------------------------------------------------------------ state helpers
  currentStaff(): number { return this.inputMode ? this.input.staff : (this.sel?.head.staff ?? 0); }
  currentMeasure(): number { return this.inputMode ? this.input.measure : (this.sel?.head.measure ?? 0); }

  snapshot(): Snapshot {
    return { score: JSON.stringify(this.score), sel: this.sel && structuredClone(this.sel), input: { ...this.input } };
  }

  restore(s: Snapshot) {
    this.score = JSON.parse(s.score);
    this.sel = s.sel;
    this.input = s.input;
    this.lastEntered = null;
    this.clampPositions();
  }

  /** 楽譜を変更する操作は必ずここを通す（元に戻す対応） */
  mutate(fn: () => void, opts: { render?: boolean } = {}) {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    fn();
    this.setDirty(true);
    this.clampPositions();
    if (opts.render !== false) this.refresh();
  }

  setDirty(d: boolean) {
    this.dirty = d;
    window.folio.setDirty(d);
    this.updateTitle();
  }

  updateTitle() {
    const name = this.filePath ? this.filePath.split(/[\\/]/).pop() : this.score.title;
    window.folio.setTitle(`${this.dirty ? '● ' : ''}${name} - FolioScore`);
  }

  clampPositions() {
    const staves = allStaves(this.score);
    const fix = (p: Pos): Pos => {
      const staff = Math.min(p.staff, staves.length - 1);
      const measure = Math.min(p.measure, staves[staff].measures.length - 1);
      const index = Math.min(p.index, staves[staff].measures[measure].events.length - 1);
      return { staff, measure, index };
    };
    if (this.sel) this.sel = { anchor: fix(this.sel.anchor), head: fix(this.sel.head) };
    this.input.staff = Math.min(this.input.staff, staves.length - 1);
    this.input.measure = Math.min(this.input.measure, staves[this.input.staff].measures.length - 1);
  }

  selectedPositions(): Pos[] {
    if (!this.sel) return [];
    if (this.sel.anchor.staff !== this.sel.head.staff) return [this.sel.head];
    return positionsBetween(this.score, this.sel.anchor, this.sel.head);
  }

  select(p: Pos, extend = false) {
    if (extend && this.sel && this.sel.anchor.staff === p.staff) this.sel = { anchor: this.sel.anchor, head: p };
    else this.sel = { anchor: p, head: p };
    this.lastEntered = null;
    this.refresh();
    this.scrollTo(p.measure);
    const ev = getEvent(this.score, p);
    if (ev && !ev.rest && !extend) void this.audio.previewNotes(this.score, staffOwner(this.score, p.staff).partIdx, ev.pitches.map(midiOf), 350);
  }

  // ------------------------------------------------------------ rendering
  refresh() {
    const view = $('#scoreView');
    const st = view.scrollTop;
    const sl = view.scrollLeft;
    const selected = new Set(this.inputMode ? [] : this.selectedPositions().map(posKey));
    if (this.inputMode && this.lastEntered) for (const p of positionsBetween(this.score, this.lastEntered.first, this.lastEntered.last)) selected.add(posKey(p));
    const pages = $('#pages');
    try {
      this.layout = renderScore(pages, this.score, { selected });
    } catch (e) {
      console.error(e);
      this.toast('描画エラー: ' + (e as Error).message);
    }
    (pages.style as CSSStyleDeclaration & { zoom: string }).zoom = String(this.zoom);
    pages.querySelectorAll('.page').forEach((p) => p.classList.toggle('input-mode', this.inputMode));
    view.scrollTop = st;
    view.scrollLeft = sl;
    this.drawCursor();
    this.updatePanels();
  }

  drawCursor() {
    if (!this.layout || !this.inputMode) return;
    const { staff, measure, tick } = this.input;
    const geo = this.layout.measures[measure];
    if (!geo) return;
    const sys = this.layout.systems[geo.system];
    const sg = sys.staves[staff];
    const mt = measureTicks(this.score);
    const pts = geo.staffNoteX[staff];
    const found = pts.find((p) => p.tick === tick);
    const x = found ? found.x : xForTick(geo, tick, mt);
    const div = document.createElement('div');
    div.className = 'cursor';
    div.style.left = `${x - 6}px`;
    div.style.top = `${sg.topLineY - 22}px`;
    div.style.width = `${Math.max(18, (DUR_TICKS[this.dur] / mt) * (geo.x1 - geo.x0) * 0.5)}px`;
    div.style.height = '84px';
    this.layout.pages[geo.page].appendChild(div);
  }

  updatePanels() {
    document.querySelectorAll<HTMLButtonElement>('#durations button').forEach((b) => b.classList.toggle('on', b.dataset.dur === this.dur));
    $('#btnDot').classList.toggle('on', this.dots > 0);
    $('#btnInput').classList.toggle('on', this.inputMode);
    $<HTMLInputElement>('#tempo').value = String(this.score.tempo);
    $('#zoomLabel').textContent = `${Math.round(this.zoom * 100)}%`;
    const s = this.score;
    $('#scoreInfo').innerHTML = '';
    const info = document.createElement('div');
    info.innerHTML = `<b></b><br><span></span>拍子 ${s.timeSig.num}/${s.timeSig.den}・調 ${KEY_NAMES[s.keySig + 7]}<br>${measureCount(s)} 小節・♩=${s.tempo}`;
    info.querySelector('b')!.textContent = s.title;
    info.querySelector('span')!.textContent = s.composer ? `${s.composer}\n` : '';
    $('#scoreInfo').appendChild(info);
    this.renderParts();

    const mode = $('#modeStatus');
    mode.className = this.inputMode ? 'input' : '';
    mode.textContent = this.inputMode ? `✎ 音符入力: ${DUR_NAME[this.dur]}${this.dots ? '（付点）' : ''}` : '通常モード';
    $('#hint').textContent = this.inputMode
      ? 'A〜G: 音名 / Shift+音名: 和音 / 1〜7: 音価 / 0: 休符 / ↑↓: 半音 / Ctrl+↑↓: オクターブ / Esc: 終了'
      : 'クリックで選択・A〜G で入力開始・N: 入力モード・Space: 再生・F1: ショートカット一覧';

    // 選択情報と鍵盤ハイライト
    const pos = this.inputMode ? this.lastEntered?.first : this.sel?.head;
    const selInfo = $('#selInfo');
    let selMidis: number[] = [];
    if (pos) {
      const ev = getEvent(this.score, pos);
      const { part } = staffOwner(this.score, pos.staff);
      if (ev) {
        selMidis = ev.rest ? [] : ev.pitches.map(midiOf);
        const n = this.selectedPositions().length;
        selInfo.textContent = `${part.name}・第${pos.measure + 1}小節\n${ev.rest ? '休符' : ev.pitches.map(pitchName).join(' + ')}・${DUR_NAME[ev.dur]}${ev.dots ? '（付点）' : ''}${ev.tie ? '・タイ' : ''}${!this.inputMode && n > 1 ? `\n${n} 個選択中` : ''}`;
        selInfo.style.whiteSpace = 'pre-line';
      }
    } else if (this.inputMode) {
      selInfo.textContent = `入力位置: 第${this.input.measure + 1}小節`;
    } else selInfo.textContent = '—';
    document.querySelectorAll<HTMLElement>('.key').forEach((k) => k.classList.toggle('sel', selMidis.includes(Number(k.dataset.midi))));
  }

  scrollTo(measure: number) {
    if (!this.layout) return;
    const geo = this.layout.measures[measure];
    if (!geo) return;
    const page = this.layout.pages[geo.page];
    const view = $('#scoreView');
    const vr = view.getBoundingClientRect();
    const pr = page.getBoundingClientRect();
    const scale = pr.width / PAGE_W;
    const top = pr.top - vr.top + view.scrollTop + geo.top * scale;
    const bottom = pr.top - vr.top + view.scrollTop + geo.bottom * scale;
    if (top < view.scrollTop + 10) view.scrollTop = top - 40;
    else if (bottom > view.scrollTop + view.clientHeight - 10) view.scrollTop = bottom - view.clientHeight + 40;
  }

  toast(msg: string) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout((t as HTMLElement & { _t?: number })._t);
    (t as HTMLElement & { _t?: number })._t = window.setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ------------------------------------------------------------ input
  setInputMode(on: boolean) {
    if (on === this.inputMode) return;
    if (on) {
      const p = this.sel?.head ?? { staff: 0, measure: 0, index: 0 };
      this.input = { staff: p.staff, measure: p.measure, tick: eventTickInMeasure(this.score, p) };
      this.lastEntered = null;
    } else {
      // 入力終了時は最後に入力した音を選択状態にする
      const m = allStaves(this.score)[this.input.staff].measures[this.input.measure];
      const p = this.lastEntered?.first ?? { staff: this.input.staff, measure: this.input.measure, index: indexAtTick(m, this.input.tick) };
      this.sel = { anchor: p, head: p };
      this.lastEntered = null;
    }
    this.inputMode = on;
    this.refresh();
  }

  setDuration(d: DurType) {
    if (!this.inputMode && this.sel) {
      // 通常モードでは選択中の音符の音価を変更
      const p = this.sel.head;
      const ev = getEvent(this.score, p);
      if (ev) {
        const nev = { ...cloneEvent(ev), dur: d, dots: this.dots };
        const start = eventTickInMeasure(this.score, p);
        this.mutate(() => {
          const r = writeEvent(this.score, p.staff, p.measure, start, nev);
          this.sel = { anchor: r.first, head: r.first };
        });
      }
    }
    this.dur = d;
    this.updatePanels();
    if (this.inputMode) this.refresh();
  }

  toggleDot() {
    this.dots = this.dots ? 0 : 1;
    if (this.dur === '64') this.dots = 0;
    if (!this.inputMode && this.sel) {
      const ev = getEvent(this.score, this.sel.head);
      if (ev) {
        const p = this.sel.head;
        const nev = { ...cloneEvent(ev), dots: ev.dots ? 0 : 1 };
        this.mutate(() => {
          const r = writeEvent(this.score, p.staff, p.measure, eventTickInMeasure(this.score, p), nev);
          this.sel = { anchor: r.first, head: r.first };
        });
        return;
      }
    }
    this.updatePanels();
    if (this.inputMode) this.refresh();
  }

  prevMidi(): number | null {
    // 入力位置の直前の音（同じ譜表）を探す
    if (this.lastEntered) {
      const ev = getEvent(this.score, this.lastEntered.first);
      if (ev && !ev.rest) return midiOf(ev.pitches[0]);
    }
    const staff = allStaves(this.score)[this.input.staff];
    let p: Pos | null = { staff: this.input.staff, measure: this.input.measure, index: indexAtTick(staff.measures[this.input.measure], this.input.tick) };
    let guard = 0;
    while (p && guard++ < 400) {
      const prev: Pos | null = stepPos(this.score, p, -1);
      if (!prev) break;
      const ev = getEvent(this.score, prev);
      if (ev && !ev.rest) return midiOf(ev.pitches[0]);
      p = prev;
    }
    const clef = staff.clef;
    return clef === 'bass' ? 48 : clef === 'alto' ? 60 : clef === 'tenor' ? 55 : 67;
  }

  ensureInput() {
    if (!this.inputMode) this.setInputMode(true);
  }

  writeAtCursor(ev: NoteEvent) {
    this.mutate(() => {
      const r = writeEvent(this.score, this.input.staff, this.input.measure, this.input.tick, ev);
      this.input = { staff: this.input.staff, measure: r.measure, tick: r.tick };
      this.lastEntered = ev.rest ? null : { first: r.first, last: r.last };
    });
    this.scrollTo(this.input.measure);
    if (!ev.rest) void this.audio.previewNotes(this.score, staffOwner(this.score, this.input.staff).partIdx, ev.pitches.map(midiOf));
  }

  enterPitch(p: Pitch, chord: boolean) {
    this.ensureInput();
    if (chord && this.lastEntered) {
      const range = positionsBetween(this.score, this.lastEntered.first, this.lastEntered.last);
      const midi = midiOf(p);
      this.mutate(() => {
        for (const pos of range) {
          const ev = getEvent(this.score, pos)!;
          if (!ev.rest && !ev.pitches.some((q) => midiOf(q) === midi)) ev.pitches.push({ ...p });
        }
      });
      const ev = getEvent(this.score, this.lastEntered.first);
      if (ev) void this.audio.previewNotes(this.score, staffOwner(this.score, this.input.staff).partIdx, ev.pitches.map(midiOf));
      return;
    }
    this.writeAtCursor({ dur: this.dur, dots: this.dots, rest: false, pitches: [{ ...p }] });
  }

  enterLetter(step: Step, chord: boolean) {
    if (chord && this.inputMode && this.lastEntered) {
      // 和音: 直前の音の上に重ねる（MuseScore の Shift+音名 と同じ）
      const ev = getEvent(this.score, this.lastEntered.first)!;
      const top = Math.max(...ev.pitches.map(midiOf));
      let p = pitchForLetter(step, this.score.keySig, top);
      while (midiOf(p) <= top) p = { ...p, octave: p.octave + 1 };
      this.enterPitch(p, true);
      return;
    }
    this.ensureInput();
    this.enterPitch(pitchForLetter(step, this.score.keySig, this.prevMidi()), false);
  }

  enterMidi(midi: number, chord: boolean) {
    const preferFlat = this.score.keySig < 0;
    let p = pitchFromMidi(midi, preferFlat);
    // 調号に合う綴りがあればそちらを使う
    for (const cand of [pitchFromMidi(midi, false), pitchFromMidi(midi, true)]) {
      if (cand.alter === keyAlter(this.score.keySig, cand.step)) p = cand;
    }
    this.flashKey(midi);
    this.enterPitch(p, chord);
  }

  flashKey(midi: number) {
    const k = document.querySelector(`.key[data-midi="${midi}"]`);
    if (!k) return;
    k.classList.add('on');
    setTimeout(() => k.classList.remove('on'), 220);
  }

  enterRest() {
    if (!this.inputMode && this.sel) { this.deleteSelection(); return; }
    this.ensureInput();
    this.writeAtCursor({ dur: this.dur, dots: this.dots, rest: true, pitches: [] });
  }

  /** 入力中なら直前の音、通常モードなら選択範囲を移調 */
  transpose(semis: number) {
    const targets = this.inputMode && this.lastEntered
      ? positionsBetween(this.score, this.lastEntered.first, this.lastEntered.last)
      : this.inputMode ? [] : this.selectedPositions();
    const notes = targets.map((p) => getEvent(this.score, p)!).filter((e) => e && !e.rest);
    if (!notes.length) return;
    this.mutate(() => {
      for (const ev of notes) ev.pitches = ev.pitches.map((p) => transposePitch(p, semis, this.score.keySig));
    });
    void this.audio.previewNotes(this.score, staffOwner(this.score, targets[0].staff).partIdx, notes[0].pitches.map(midiOf), 350);
  }

  setAccidental(alter: number) {
    const targets = this.inputMode && this.lastEntered ? positionsBetween(this.score, this.lastEntered.first, this.lastEntered.last) : this.selectedPositions();
    const notes = targets.map((p) => getEvent(this.score, p)!).filter((e) => e && !e.rest);
    if (!notes.length) { this.toast('音符を選択してください'); return; }
    this.mutate(() => { for (const ev of notes) ev.pitches = ev.pitches.map((p) => ({ ...p, alter })); });
    void this.audio.previewNotes(this.score, staffOwner(this.score, targets[0].staff).partIdx, notes[0].pitches.map(midiOf), 350);
  }

  toggleTie() {
    if (this.inputMode) {
      if (!this.lastEntered) return;
      const ev = getEvent(this.score, this.lastEntered.last);
      if (!ev || ev.rest) return;
      const pitches = ev.pitches.map((p) => ({ ...p }));
      this.mutate(() => { getEvent(this.score, this.lastEntered!.last)!.tie = true; }, { render: false });
      const first = this.lastEntered.first;
      this.writeAtCursor({ dur: this.dur, dots: this.dots, rest: false, pitches });
      if (this.lastEntered) this.lastEntered = { first, last: this.lastEntered.last };
      this.refresh();
      return;
    }
    const notes = this.selectedPositions().map((p) => getEvent(this.score, p)!).filter((e) => e && !e.rest);
    if (!notes.length) return;
    const on = !notes[0].tie;
    this.mutate(() => { for (const ev of notes) { if (on) ev.tie = true; else delete ev.tie; } });
  }

  deleteSelection() {
    const targets = this.selectedPositions();
    if (!targets.length) return;
    this.mutate(() => {
      for (const p of targets) {
        const ev = getEvent(this.score, p);
        if (ev) { ev.rest = true; ev.pitches = []; delete ev.tie; }
      }
      this.normalizeMeasures(targets);
    });
  }

  normalizeMeasures(positions: Pos[]) {
    const mt = measureTicks(this.score);
    const staves = allStaves(this.score);
    for (const k of new Set(positions.map((p) => `${p.staff}:${p.measure}`))) {
      const [s, m] = k.split(':').map(Number);
      normalizeMeasure(staves[s].measures[m], mt);
    }
  }

  backspace() {
    if (!this.inputMode) { this.deleteSelection(); return; }
    // 入力位置の直前のイベントを休符にして、カーソルを戻す
    const m = allStaves(this.score)[this.input.staff].measures[this.input.measure];
    const cur: Pos = { staff: this.input.staff, measure: this.input.measure, index: this.input.tick === 0 ? 0 : indexAtTick(m, this.input.tick - 1) + 1 };
    let prev: Pos | null = this.input.tick === 0 ? stepPos(this.score, { ...cur, index: 0 }, -1) : { ...cur, index: cur.index - 1 };
    if (!prev) return;
    this.mutate(() => {
      const ev = getEvent(this.score, prev!)!;
      ev.rest = true; ev.pitches = []; delete ev.tie;
      const tick = eventTickInMeasure(this.score, prev!);
      this.normalizeMeasures([prev!]);
      this.input = { staff: prev!.staff, measure: prev!.measure, tick };
      this.lastEntered = null;
      prev = null;
    });
  }

  copy(cut = false) {
    const targets = this.selectedPositions();
    if (!targets.length) return;
    this.clipboard = targets.map((p) => cloneEvent(getEvent(this.score, p)!));
    if (cut) this.deleteSelection();
    this.toast(`${targets.length} 個のイベントを${cut ? '切り取り' : 'コピー'}しました`);
  }

  paste() {
    if (!this.clipboard.length) return;
    const p = this.inputMode ? null : this.sel?.head;
    const staff = p ? p.staff : this.input.staff;
    let measure = p ? p.measure : this.input.measure;
    let tick = p ? eventTickInMeasure(this.score, p) : this.input.tick;
    this.mutate(() => {
      let first: Pos | null = null;
      let last: Pos | null = null;
      for (const ev of this.clipboard) {
        const r = writeEvent(this.score, staff, measure, tick, cloneEvent(ev));
        first ??= r.first;
        last = r.last;
        measure = r.measure; tick = r.tick;
      }
      if (this.inputMode) this.input = { staff, measure, tick };
      else if (first && last) this.sel = { anchor: first, head: last };
    });
  }

  // ------------------------------------------------------------ navigation
  move(dir: 1 | -1, extend: boolean) {
    if (this.inputMode) {
      const staff = allStaves(this.score)[this.input.staff];
      const m = staff.measures[this.input.measure];
      const idx = indexAtTick(m, this.input.tick);
      const starts = eventStarts(m);
      const exact = starts[idx] === this.input.tick;
      let target: Pos | null;
      if (dir < 0) target = exact ? stepPos(this.score, { staff: this.input.staff, measure: this.input.measure, index: idx }, -1) : { staff: this.input.staff, measure: this.input.measure, index: idx };
      else target = stepPos(this.score, { staff: this.input.staff, measure: this.input.measure, index: idx }, 1);
      if (dir > 0 && !target) {
        // 末尾では小節を追加
        this.mutate(() => appendMeasures(this.score, 1), { render: false });
        target = { staff: this.input.staff, measure: this.input.measure + 1, index: 0 };
      }
      if (!target) return;
      this.input = { staff: target.staff, measure: target.measure, tick: eventTickInMeasure(this.score, target) };
      this.lastEntered = null;
      this.refresh();
      this.scrollTo(target.measure);
      return;
    }
    const cur = this.sel?.head ?? { staff: 0, measure: 0, index: 0 };
    const next = this.sel ? stepPos(this.score, cur, dir) : cur;
    if (next) this.select(next, extend);
  }

  moveMeasure(dir: 1 | -1) {
    const staff = this.currentStaff();
    const m = Math.max(0, Math.min(measureCount(this.score) - 1, this.currentMeasure() + dir));
    if (this.inputMode) { this.input = { staff, measure: m, tick: 0 }; this.lastEntered = null; this.refresh(); this.scrollTo(m); }
    else this.select({ staff, measure: m, index: 0 });
  }

  moveStaff(dir: 1 | -1) {
    const n = allStaves(this.score).length;
    const s = this.currentStaff() + dir;
    if (s < 0 || s >= n) return;
    if (this.inputMode) {
      this.input = { ...this.input, staff: s };
      const m = allStaves(this.score)[s].measures[this.input.measure];
      this.input.tick = eventStarts(m)[indexAtTick(m, this.input.tick)];
      this.lastEntered = null;
      this.refresh();
    } else {
      const cur = this.sel?.head ?? { staff: 0, measure: 0, index: 0 };
      const tick = eventTickInMeasure(this.score, cur);
      const m = allStaves(this.score)[s].measures[cur.measure];
      this.select({ staff: s, measure: cur.measure, index: indexAtTick(m, tick) });
    }
  }

  // ------------------------------------------------------------ mouse
  bindScoreClicks() {
    $('#pages').addEventListener('mousedown', (e) => {
      const page = (e.target as HTMLElement).closest('.page') as HTMLElement | null;
      if (!page || !this.layout) return;
      e.preventDefault();
      $('#scoreView').focus();
      const pageIdx = Number(page.dataset.page);
      const r = page.getBoundingClientRect();
      const scale = r.width / PAGE_W;
      const x = (e.clientX - r.left) / scale;
      const y = (e.clientY - r.top) / scale;
      const hit = this.hitTest(pageIdx, x, y);
      if (!hit) { if (!this.inputMode) { this.sel = null; this.refresh(); } return; }
      if (this.inputMode) {
        // 入力モード: クリック位置の高さの音を、そのイベント位置に入力
        const staff = allStaves(this.score)[hit.staff];
        this.input = { staff: hit.staff, measure: hit.pos.measure, tick: eventTickInMeasure(this.score, hit.pos) };
        const p = pitchAtY(staff.clef, hit.topLineY, y, this.score.keySig);
        this.enterPitch(p, e.shiftKey && !!this.lastEntered);
        return;
      }
      this.select(hit.pos, e.shiftKey);
    });
  }

  hitTest(page: number, x: number, y: number): { pos: Pos; staff: number; topLineY: number } | null {
    const L = this.layout!;
    const sys = L.systems.find((s) => s.page === page && y >= s.top - 10 && y <= s.bottom + 10);
    if (!sys) return null;
    // 一番近い譜表
    let best = sys.staves[0];
    for (const sg of sys.staves) if (Math.abs(y - (sg.topLineY + 20)) < Math.abs(y - (best.topLineY + 20))) best = sg;
    if (x < best.x0 - 5 || x > best.x1 + 5) return null;
    // 小節
    let mi = sys.first;
    for (let m = sys.first; m <= sys.last; m++) if (x >= L.measures[m].x0) mi = m;
    const pts = L.measures[mi].staffNoteX[best.staff];
    let idx = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.x + 5 - x); if (d < bestD) { bestD = d; idx = i; } });
    return { pos: { staff: best.staff, measure: mi, index: idx }, staff: best.staff, topLineY: best.topLineY };
  }

  // ------------------------------------------------------------ keyboard
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      if (document.querySelector('dialog[open]')) return;
      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl) {
        const k = key.toLowerCase();
        const map: Record<string, string> = {
          n: 'new', o: 'open', s: e.shiftKey ? 'saveAs' : 'save', z: e.shiftKey ? 'redo' : 'undo', y: 'redo',
          b: 'appendMeasure', p: 'exportPdf', t: 'scoreSettings', '=': 'zoomIn', '+': 'zoomIn', ';': 'zoomIn', '-': 'zoomOut', '0': 'zoomReset',
          insert: 'insertMeasure', delete: 'deleteMeasure',
        };
        if (!inField) Object.assign(map, { c: 'copy', x: 'cut', v: 'paste' });
        const c = map[k];
        if (c) { e.preventDefault(); this.command(c); return; }
        if (inField) return;
        if (key === 'ArrowUp') { e.preventDefault(); this.transpose(12); return; }
        if (key === 'ArrowDown') { e.preventDefault(); this.transpose(-12); return; }
        if (key === 'ArrowLeft') { e.preventDefault(); this.moveMeasure(-1); return; }
        if (key === 'ArrowRight') { e.preventDefault(); this.moveMeasure(1); return; }
        return;
      }
      if (inField) {
        if (key === 'Escape') (t as HTMLInputElement).blur();
        return;
      }
      if (key === 'F1') { e.preventDefault(); this.command('help'); return; }
      if (key === 'F9') { e.preventDefault(); this.command('togglePiano'); return; }
      if (e.altKey) {
        if (key === 'ArrowUp') { e.preventDefault(); this.moveStaff(-1); }
        if (key === 'ArrowDown') { e.preventDefault(); this.moveStaff(1); }
        return;
      }
      const upper = key.length === 1 ? key.toUpperCase() : '';
      if ('ABCDEFG'.includes(upper) && upper) {
        e.preventDefault();
        this.enterLetter(upper as Step, e.shiftKey);
        return;
      }
      if (DUR_KEYS[key]) { e.preventDefault(); this.setDuration(DUR_KEYS[key]); return; }
      switch (key) {
        case 'n': case 'N': this.setInputMode(!this.inputMode); break;
        case 'Escape':
          if (this.audio.playing) this.togglePlay();
          else if (this.inputMode) this.setInputMode(false);
          else { this.sel = null; this.refresh(); }
          break;
        case '0': this.enterRest(); break;
        case '.': this.toggleDot(); break;
        case '+': case 't': case 'T': this.toggleTie(); break;
        case 'ArrowUp': this.transpose(1); break;
        case 'ArrowDown': this.transpose(-1); break;
        case 'ArrowLeft': this.move(-1, e.shiftKey); break;
        case 'ArrowRight': this.move(1, e.shiftKey); break;
        case 'Delete': this.deleteSelection(); break;
        case 'Backspace': this.backspace(); break;
        case ' ': this.togglePlay(); break;
        case 'Home': this.command('rewind'); break;
        case 'End': this.select({ staff: this.currentStaff(), measure: measureCount(this.score) - 1, index: 0 }); break;
        default: return;
      }
      e.preventDefault();
    });
  }

  // ------------------------------------------------------------ playback
  togglePlay() {
    if (this.audio.playing) {
      this.audio.stop();
      this.onPlayEnd();
      return;
    }
    if (!this.audio.ready) { this.toast('音源を読み込み中です…'); return; }
    const mt = measureTicks(this.score);
    const startMeasure = this.inputMode ? this.input.measure : (this.sel?.head.measure ?? 0);
    const startTick = startMeasure * mt + (this.inputMode ? this.input.tick : (this.sel ? eventTickInMeasure(this.score, this.sel.head) : 0));
    $('#btnPlay').classList.add('on');
    $('#btnPlay').textContent = '■ 停止';
    void this.audio.play(this.score, startTick, (tick) => this.drawPlayhead(tick), () => this.onPlayEnd());
  }

  onPlayEnd() {
    $('#btnPlay').classList.remove('on');
    $('#btnPlay').textContent = '▶ 再生';
    this.playhead?.remove();
    this.playhead = null;
  }

  drawPlayhead(tick: number) {
    if (!this.layout) return;
    const mt = measureTicks(this.score);
    const mi = Math.floor(tick / mt);
    const geo = this.layout.measures[mi];
    if (!geo) return;
    const x = xForTick(geo, tick - mi * mt, mt);
    const page = this.layout.pages[geo.page];
    if (!this.playhead || this.playhead.parentElement !== page) {
      this.playhead?.remove();
      this.playhead = document.createElement('div');
      this.playhead.className = 'playhead';
      page.appendChild(this.playhead);
    }
    this.playhead.style.left = `${x}px`;
    this.playhead.style.top = `${geo.top}px`;
    this.playhead.style.height = `${geo.bottom - geo.top}px`;
    if (this.playhead.dataset.m !== String(mi)) {
      this.playhead.dataset.m = String(mi);
      this.scrollTo(mi);
    }
  }

  // ------------------------------------------------------------ files
  serialize(): string { return JSON.stringify(this.score, null, 1); }

  safeName(): string { return (this.score.title || 'score').replace(/[\\/:*?"<>|]/g, '_'); }

  async save(as = false): Promise<boolean> {
    const p = await window.folio.saveFile(as ? null : this.filePath, this.serialize(), this.safeName());
    if (!p) return false;
    this.filePath = p;
    this.setDirty(false);
    this.toast('保存しました: ' + p.split(/[\\/]/).pop());
    return true;
  }

  async open() {
    if (this.dirty && !confirm('保存されていない変更があります。破棄して開きますか？')) return;
    const f = await window.folio.openFile();
    if (f) this.loadFile(f.path, f.content);
  }

  loadFile(path: string, content: string) {
    try {
      this.audio.stop();
      this.score = validateScore(JSON.parse(content));
      this.filePath = path;
      this.undoStack = [];
      this.redoStack = [];
      this.inputMode = false;
      this.sel = { anchor: { staff: 0, measure: 0, index: 0 }, head: { staff: 0, measure: 0, index: 0 } };
      this.setDirty(false);
      this.refresh();
      this.toast('開きました: ' + path.split(/[\\/]/).pop());
    } catch (e) {
      alert('ファイルを開けませんでした: ' + (e as Error).message);
    }
  }

  async exportAs(kind: 'musicxml' | 'mid' | 'wav' | 'pdf') {
    try {
      let p: string | null = null;
      if (kind === 'musicxml') p = await window.folio.exportFile('musicxml', scoreToMusicXML(this.score), this.safeName());
      else if (kind === 'mid') p = await window.folio.exportFile('mid', scoreToMidi(this.score), this.safeName());
      else if (kind === 'wav') {
        this.toast('音声を書き出し中…');
        const wav = await this.audio.renderWav(this.score);
        p = await window.folio.exportFile('wav', wav, this.safeName());
      } else {
        // 選択色やカーソルを消して印刷
        const keepSel = this.sel;
        const keepInput = this.inputMode;
        this.sel = null;
        this.inputMode = false;
        this.refresh();
        try { p = await window.folio.exportPdf(this.safeName()); } finally {
          this.sel = keepSel;
          this.inputMode = keepInput;
          this.refresh();
        }
      }
      if (p) this.toast('書き出しました: ' + p.split(/[\\/]/).pop());
    } catch (e) {
      alert('書き出しに失敗しました: ' + (e as Error).message);
    }
  }

  // ------------------------------------------------------------ dialogs
  openSettings(isNew: boolean) {
    const dlg = $<HTMLDialogElement>('#settingsDialog');
    const f = dlg.querySelector('form')!;
    const el = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
    $('#settingsTitle').textContent = isNew ? '新しい楽譜' : '楽譜の設定';
    $('#newOnly').style.display = isNew ? '' : 'none';
    const s = isNew ? createScore() : this.score;
    el('title').value = isNew ? '無題の楽譜' : s.title;
    el('composer').value = s.composer;
    el('num').value = String(s.timeSig.num);
    el('den').value = String(s.timeSig.den);
    el('tempo').value = String(s.tempo);
    el('key').value = String(s.keySig);
    dlg.returnValue = '';
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return;
      const v = {
        title: el('title').value.trim() || '無題の楽譜', composer: el('composer').value.trim(),
        tempo: Math.max(20, Math.min(300, Number(el('tempo').value) || 100)),
        num: Math.max(1, Math.min(16, Number(el('num').value) || 4)), den: Number(el('den').value) || 4,
        key: Number(el('key').value) || 0, measures: Math.max(1, Math.min(500, Number(el('measures').value) || 16)),
      };
      if (isNew) {
        if (this.dirty && !confirm('保存されていない変更があります。破棄して新規作成しますか？')) return;
        this.newScoreFromTemplate(el('template').value, v);
      } else {
        this.mutate(() => {
          this.score.title = v.title;
          this.score.composer = v.composer;
          this.score.tempo = v.tempo;
          this.score.keySig = v.key;
          if (v.num !== this.score.timeSig.num || v.den !== this.score.timeSig.den) changeTimeSignature(this.score, v.num, v.den);
        });
      }
    };
    dlg.showModal();
  }

  newScoreFromTemplate(template: string, v: { title: string; composer: string; tempo: number; num: number; den: number; key: number; measures: number }) {
    this.audio.stop();
    const s = createScore({ title: v.title, composer: v.composer, tempo: v.tempo, timeSig: { num: v.num, den: v.den }, keySig: v.key });
    const add = (id: string) => { const i = instrumentById(id); addPart(s, i.name, i.id, i.clefs, v.measures); };
    const templates: Record<string, string[]> = {
      piano: ['piano'], 'solo-piano': ['violin', 'piano'], quartet: ['violin', 'violin', 'viola', 'cello'],
      woodwind: ['flute', 'clarinet', 'bassoon'], 'choir-piano': ['choir', 'piano'], empty: ['piano'],
    };
    for (const id of templates[template] ?? ['piano']) add(id);
    if (template === 'quartet') { s.parts[0].name = 'ヴァイオリン I'; s.parts[1].name = 'ヴァイオリン II'; }
    this.score = s;
    this.filePath = null;
    this.undoStack = [];
    this.redoStack = [];
    this.inputMode = false;
    this.sel = { anchor: { staff: 0, measure: 0, index: 0 }, head: { staff: 0, measure: 0, index: 0 } };
    this.setDirty(true);
    this.refresh();
  }

  // ------------------------------------------------------------ commands
  command(c: string) {
    switch (c) {
      case 'new': this.openSettings(true); break;
      case 'open': void this.open(); break;
      case 'save': void this.save(); break;
      case 'saveAs': void this.save(true); break;
      case 'saveAndClose': void this.save().then((ok) => { if (ok) window.folio.closeNow(); }); break;
      case 'exportPdf': void this.exportAs('pdf'); break;
      case 'exportMusicXML': void this.exportAs('musicxml'); break;
      case 'exportMidi': void this.exportAs('mid'); break;
      case 'exportWav': void this.exportAs('wav'); break;
      case 'undo': {
        const s = this.undoStack.pop();
        if (s) { this.redoStack.push(this.snapshot()); this.restore(s); this.setDirty(true); this.refresh(); }
        break;
      }
      case 'redo': {
        const s = this.redoStack.pop();
        if (s) { this.undoStack.push(this.snapshot()); this.restore(s); this.setDirty(true); this.refresh(); }
        break;
      }
      case 'copy': this.copy(); break;
      case 'cut': this.copy(true); break;
      case 'paste': this.paste(); break;
      case 'delete': this.deleteSelection(); break;
      case 'scoreSettings': this.openSettings(false); break;
      case 'toggleInput': this.setInputMode(!this.inputMode); break;
      case 'dot': this.toggleDot(); break;
      case 'tie': this.toggleTie(); break;
      case 'rest': this.enterRest(); break;
      case 'up': this.transpose(1); break;
      case 'down': this.transpose(-1); break;
      case 'octUp': this.transpose(12); break;
      case 'octDown': this.transpose(-12); break;
      case 'sharp': this.setAccidental(1); break;
      case 'flat': this.setAccidental(-1); break;
      case 'natural': this.setAccidental(0); break;
      case 'appendMeasure': this.mutate(() => appendMeasures(this.score, 1)); this.toast('小節を追加しました'); break;
      case 'insertMeasure': { const m = this.currentMeasure(); this.mutate(() => insertMeasure(this.score, m)); break; }
      case 'deleteMeasure': { const m = this.currentMeasure(); this.mutate(() => deleteMeasure(this.score, m)); break; }
      case 'play': this.togglePlay(); break;
      case 'rewind':
        if (this.audio.playing) this.togglePlay();
        if (this.inputMode) { this.input = { staff: this.input.staff, measure: 0, tick: 0 }; this.refresh(); }
        else this.select({ staff: this.currentStaff(), measure: 0, index: 0 });
        $('#scoreView').scrollTop = 0;
        break;
      case 'zoomIn': this.zoom = Math.min(3, Math.round((this.zoom + 0.1) * 10) / 10); this.refresh(); break;
      case 'zoomOut': this.zoom = Math.max(0.4, Math.round((this.zoom - 0.1) * 10) / 10); this.refresh(); break;
      case 'zoomReset': this.zoom = 1; this.refresh(); break;
      case 'togglePiano': $('#pianoWrap').classList.toggle('hidden'); break;
      case 'help': $<HTMLDialogElement>('#helpDialog').showModal(); break;
      case 'about': $<HTMLDialogElement>('#aboutDialog').showModal(); break;
    }
  }
}

async function boot() {
  // 楽譜フォント (Bravura) の読み込みを待ってから描画する
  try { await document.fonts.load('30px Bravura'); await document.fonts.ready; } catch { /* ignore */ }
  const app = new App();
  window.folioTest = app;
  await app.start();
}

void boot();
