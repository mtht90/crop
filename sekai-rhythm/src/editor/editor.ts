import { MusicSource } from '../audio/music';
import { Sfx, SfxName } from '../audio/sfx';
import { SynthMusic } from '../audio/synth';
import { YouTubeMusic } from '../audio/youtube';
import {
  ChartData,
  DIFFICULTIES,
  Difficulty,
  FLICK_DIRS,
  FlickDir,
  LANES,
  NoteData,
  SingleNoteData,
  SlideNoteData,
  SlidePointData,
  TimingMap,
  chartLastBeat,
  parseYouTubeId,
} from '../core/chart';
import { Settings } from '../core/settings';
import { GameClock } from '../game/clock';
import { compileChart } from '../game/runtime';
import { FONT, roundRect } from '../game/renderer';
import { confirmDialog, h, modal, toast } from '../ui/dom';

type Tool = 'tap' | 'flick' | 'trace' | 'slide' | 'select' | 'erase';
const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'tap', label: 'タップ', key: '1' },
  { id: 'flick', label: 'フリック', key: '2' },
  { id: 'trace', label: 'なぞり', key: '3' },
  { id: 'slide', label: 'スライド', key: '4' },
  { id: 'select', label: '選択・移動', key: '5' },
  { id: 'erase', label: '消しゴム', key: '6' },
];
const SNAPS = [4, 8, 12, 16, 24, 32, 48, 64];
const DIR_LABEL: Record<FlickDir, string> = { left: '↖ 左上', up: '↑ 上', right: '↗ 右上' };

/** point: -1 = 単ノーツ, 0.. = スライドの点 */
interface Sel {
  note: NoteData;
  point: number;
}

type Drag =
  | { kind: 'place'; x0: number; beat: number }
  | { kind: 'slidePoint'; x0: number; beat: number; hidden: boolean }
  | { kind: 'move'; sel: Sel; lane0: number; beat0: number; orig: string; whole: boolean; moved: boolean }
  | { kind: 'scroll'; y0: number; beat0: number };

interface Snapshot {
  notes: NoteData[];
  bpms: ChartData['bpms'];
  offset: number;
}

export interface EditorOptions {
  chart: ChartData;
  settings: Settings;
  sfx: Sfx;
  onSave(c: ChartData): Promise<void>;
  onTest(c: ChartData, startBeat: number | undefined): void;
  onExit(): void;
}

const COLORS = {
  tap: '#3cc8ff',
  critical: '#ffc933',
  flick: '#ff4f9f',
  slide: '#3de48b',
  trace: '#aee84a',
};

export class EditorScreen {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private chart: ChartData;
  private timing!: TimingMap;
  private curBeat = 0;
  private pxPerBeat = 140;
  private snap = 16;
  private tool: Tool = 'tap';
  private critical = false;
  private flickDir: FlickDir = 'up';
  private slideEndFlick = false;
  private width = 2;
  private sel: Sel | null = null;
  private pending: SlidePointData[] | null = null;
  private hover: { x: number; y: number } | null = null;
  private drag: Drag | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private dirty = false;
  private raf = 0;
  private active = true;

  // 再生
  private yt: YouTubeMusic | null = null;
  private ytState: 'none' | 'loading' | 'ready' | 'error' = 'none';
  private music: MusicSource | null = null;
  private playing = false;
  private musicStarted = false;
  private clock = new GameClock();
  private lastPlayT = 0;
  private hitsounds: { time: number; sfx: SfxName }[] = [];
  private hitsoundsDirty = true;

  // DOM
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private propsEl = h('div', { class: 'props' });
  private infoEl = h('div', { class: 'info-panel' });
  private ytBox = h('div', { class: 'yt-preview' });
  private ytStatus = h('div', { class: 'yt-status' });
  private timeLabel = h('span', { class: 'time-label' });
  private playBtn = h('button', { class: 'btn primary', title: 'Space' }, '▶ 再生');
  private statusEl = h('div', { class: 'editor-status' });
  private optsEl = h('div', { class: 'tool-opts' });

  constructor(private opts: EditorOptions) {
    this.chart = opts.chart;
    this.rebuildTiming();
    this.canvas = h('canvas', { class: 'editor-canvas' });
    this.ctx = this.canvas.getContext('2d')!;

    const snapSel = h('select', {}, ...SNAPS.map((s) => h('option', { value: String(s), selected: s === this.snap }, `1/${s}`)));
    snapSel.addEventListener('change', () => (this.snap = Number(snapSel.value)));

    const toolbar = h(
      'div',
      { class: 'editor-toolbar' },
      h('button', { class: 'btn', onclick: () => void this.exit() }, '← 戻る'),
      this.playBtn,
      this.timeLabel,
      h('label', { class: 'inline' }, 'スナップ', snapSel),
      h('button', { class: 'btn small', title: 'Ctrl+ホイール', onclick: () => this.zoom(1 / 1.25) }, '－'),
      h('button', { class: 'btn small', title: 'Ctrl+ホイール', onclick: () => this.zoom(1.25) }, '＋'),
      h('button', { class: 'btn small', title: 'Ctrl+Z', onclick: () => this.undo() }, '↶ 元に戻す'),
      h('button', { class: 'btn small', title: 'Ctrl+Y', onclick: () => this.redo() }, '↷ やり直し'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', title: 'Ctrl+S', onclick: () => void this.save() }, '保存'),
      h('button', { class: 'btn accent', title: 'P', onclick: () => this.test(true) }, '▶ ここからテスト'),
      h('button', { class: 'btn accent', onclick: () => this.test(false) }, '▶ 最初からテスト'),
      h('button', { class: 'btn small', onclick: () => this.help() }, '？'),
    );
    this.playBtn.addEventListener('click', () => this.togglePlay());

    const toolGrid = h(
      'div',
      { class: 'tool-grid' },
      ...TOOLS.map((t) => {
        const b = h('button', { class: 'tool-btn', onclick: () => this.setTool(t.id) }, h('span', { class: 'tool-key' }, t.key), t.label);
        this.toolButtons.set(t.id, b);
        return b;
      }),
    );

    const left = h('aside', { class: 'editor-left' }, h('h3', {}, 'ツール'), toolGrid, this.optsEl, h('h3', {}, '選択中のノーツ'), this.propsEl);
    const center = h('div', { class: 'editor-center' }, this.canvas, this.statusEl);
    const right = h('aside', { class: 'editor-right' }, this.infoEl);
    this.el = h('div', { class: 'screen editor-screen' }, toolbar, h('div', { class: 'editor-body' }, left, center, right));

    this.bindCanvas();
    this.setTool('tap');
    this.renderInfo();
    this.renderProps();
    this.resume();
    this.loadYouTube();
  }

  // ------------------------------------------------------------ lifecycle

  /** テストプレイ中などに一時的に止める */
  suspend() {
    this.active = false;
    this.stop();
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.el.style.display = 'none';
  }

  resume() {
    this.active = true;
    this.el.style.display = '';
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    const loop = () => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.suspend();
    this.yt?.destroy();
    this.music?.destroy();
    this.el.remove();
  }

  private async exit() {
    if (this.dirty && !(await confirmDialog('保存されていない変更があります。破棄して戻りますか？', '破棄して戻る'))) return;
    this.destroy();
    this.opts.onExit();
  }

  private async save() {
    this.finalizeSlide();
    try {
      await this.opts.onSave(this.chart);
      this.dirty = false;
      toast('保存しました', 'ok', 1500);
    } catch (e) {
      toast('保存に失敗しました: ' + (e as Error).message, 'error');
    }
  }

  private test(fromHere: boolean) {
    this.finalizeSlide();
    this.stop();
    if (!this.chart.notes.length) {
      toast('ノーツがありません', 'error');
      return;
    }
    if (this.chart.audio.type === 'youtube' && !this.chart.audio.videoId) {
      toast('YouTube の動画が設定されていません', 'error');
      return;
    }
    this.opts.onTest(this.chart, fromHere ? Math.max(0, this.curBeat) : undefined);
  }

  // ------------------------------------------------------------ state

  private rebuildTiming() {
    this.timing = new TimingMap(this.chart.bpms, this.chart.offset);
    this.hitsoundsDirty = true;
  }

  private snapshot(): string {
    const s: Snapshot = { notes: this.chart.notes, bpms: this.chart.bpms, offset: this.chart.offset };
    return JSON.stringify(s);
  }

  private pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.hitsoundsDirty = true;
  }

  private restore(json: string) {
    const s = JSON.parse(json) as Snapshot;
    this.chart.notes = s.notes;
    this.chart.bpms = s.bpms;
    this.chart.offset = s.offset;
    this.sel = null;
    this.pending = null;
    this.rebuildTiming();
    this.renderInfo();
    this.renderProps();
    this.dirty = true;
  }

  private undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.snapshot());
    this.restore(s);
  }

  private redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.restore(s);
  }

  private setTool(t: Tool) {
    if (t !== 'slide') this.finalizeSlide();
    this.tool = t;
    for (const [id, b] of this.toolButtons) b.classList.toggle('active', id === t);
    this.renderToolOpts();
  }

  private renderToolOpts() {
    const crit = h('input', { type: 'checkbox', checked: this.critical });
    crit.addEventListener('change', () => (this.critical = crit.checked));
    const dirSel = h('div', { class: 'seg' }, ...FLICK_DIRS.map((d) => h('button', { class: 'seg-btn' + (d === this.flickDir ? ' active' : ''), onclick: () => { this.flickDir = d; this.renderToolOpts(); } }, DIR_LABEL[d])));
    const endFlick = h('input', { type: 'checkbox', checked: this.slideEndFlick });
    endFlick.addEventListener('change', () => (this.slideEndFlick = endFlick.checked));
    const widthOut = h('span', { class: 'slider-val' }, String(this.width));
    const widthIn = h('input', { type: 'range', min: 1, max: 12, step: 1, value: String(this.width) });
    widthIn.addEventListener('input', () => {
      this.width = Number(widthIn.value);
      widthOut.textContent = String(this.width);
    });
    this.optsEl.replaceChildren(
      h('label', { class: 'field check' }, crit, h('span', {}, 'クリティカル (C)')),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'フリック方向 (Q / W / E)'), dirSel),
      h('label', { class: 'field check' }, endFlick, h('span', {}, 'スライド終点をフリックにする')),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'ノーツ幅 ( [ / ] ) ※ドラッグでも指定可'), h('div', { class: 'row' }, widthIn, widthOut)),
      this.tool === 'slide'
        ? h('div', { class: 'tip' }, 'クリックで点を追加（Shift+クリックで見えない折れ点）。右クリック or Enter で終点を置いて確定、Esc で取り消し。')
        : this.tool === 'select'
          ? h('div', { class: 'tip' }, 'ドラッグで移動。スライドの点を Shift+ドラッグでスライド全体を移動。Delete で削除。')
          : h('div', { class: 'tip' }, '左クリックで配置、横にドラッグで幅を指定。右クリックでノーツ削除。'),
    );
  }

  // ------------------------------------------------------------ geometry

  private get cw() {
    return this.canvas.clientWidth;
  }
  private get ch() {
    return this.canvas.clientHeight;
  }
  private get laneW() {
    return Math.max(22, Math.min(54, (this.cw - 170) / LANES));
  }
  private get lanesX() {
    return (this.cw - this.laneW * LANES) / 2;
  }
  private get playY() {
    return this.ch * 0.82;
  }
  private yOf(beat: number) {
    return this.playY - (beat - this.curBeat) * this.pxPerBeat;
  }
  private beatOf(y: number) {
    return this.curBeat + (this.playY - y) / this.pxPerBeat;
  }
  private laneF(x: number) {
    return (x - this.lanesX) / this.laneW;
  }
  private get step() {
    return 4 / this.snap;
  }
  private snapBeat(b: number) {
    return Math.max(0, Math.round(b / this.step) * this.step);
  }
  private xOf(lane: number) {
    return this.lanesX + lane * this.laneW;
  }

  /** カーソル位置からノーツのレーン範囲を求める（クリック = 中央寄せ / ドラッグ = 範囲） */
  private get sixLane() {
    return this.chart.keyMode === 6;
  }

  private rangeFrom(x0: number, x1: number): { lane: number; width: number } {
    const a = this.laneF(x0);
    const b = this.laneF(x1);
    if (this.sixLane) {
      const k = Math.max(0, Math.min(5, Math.floor(a / 2)));
      return { lane: k * 2, width: 2 };
    }
    if (Math.abs(a - b) * this.laneW < 6 || Math.floor(a) === Math.floor(b)) {
      const w = this.width;
      const lane = Math.max(0, Math.min(LANES - w, Math.round(a - w / 2)));
      return { lane, width: w };
    }
    const l = Math.max(0, Math.floor(Math.min(a, b)));
    const r = Math.min(LANES, Math.ceil(Math.max(a, b)));
    return { lane: l, width: Math.max(1, r - l) };
  }

  private hitTest(x: number, y: number): Sel | null {
    const lf = this.laneF(x);
    const near = (beat: number, lane: number, width: number) => Math.abs(this.yOf(beat) - y) <= 9 && lf >= lane && lf <= lane + width;
    const notes = this.chart.notes;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.type === 'single') {
        if (near(n.beat, n.lane, n.width)) return { note: n, point: -1 };
      } else {
        for (let p = n.points.length - 1; p >= 0; p--) {
          const pt = n.points[p];
          if (near(pt.beat, pt.lane, pt.width)) return { note: n, point: p };
        }
      }
    }
    // スライド本体
    const beat = this.beatOf(y);
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.type !== 'slide') continue;
      for (let p = 0; p < n.points.length - 1; p++) {
        const a = n.points[p];
        const b = n.points[p + 1];
        if (beat < a.beat || beat > b.beat || b.beat <= a.beat) continue;
        const u = (beat - a.beat) / (b.beat - a.beat);
        const l = a.lane + (b.lane - a.lane) * u;
        const r = a.lane + a.width + (b.lane + b.width - a.lane - a.width) * u;
        if (lf >= l && lf <= r) return { note: n, point: beat - a.beat < b.beat - beat ? p : p + 1 };
      }
    }
    return null;
  }

  // ------------------------------------------------------------ editing

  private removeNote(n: NoteData) {
    this.chart.notes = this.chart.notes.filter((x) => x !== n);
    if (this.sel?.note === n) this.sel = null;
  }

  private placeSingle(kind: SingleNoteData['kind'], beat: number, lane: number, width: number) {
    this.pushUndo();
    // 同じ位置のノーツは置き換える
    this.chart.notes = this.chart.notes.filter(
      (n) => !(n.type === 'single' && Math.abs(n.beat - beat) < 1e-6 && n.lane < lane + width && n.lane + n.width > lane),
    );
    const note: SingleNoteData = { type: 'single', kind, beat, lane, width };
    if (this.critical) note.critical = true;
    if (kind === 'flick') note.dir = this.flickDir;
    this.chart.notes.push(note);
    this.sel = { note, point: -1 };
    this.renderProps();
  }

  private addSlidePoint(beat: number, lane: number, width: number, hidden: boolean, finish: boolean) {
    if (!this.pending) {
      if (finish) return;
      this.pending = [{ beat, lane, width, visible: true }];
      return;
    }
    const last = this.pending[this.pending.length - 1];
    if (beat <= last.beat) {
      toast('前の点より後ろ（上）に置いてください', 'error', 1800);
      return;
    }
    this.pending.push({ beat, lane, width, visible: !hidden });
    if (finish) this.finalizeSlide();
  }

  private finalizeSlide() {
    const p = this.pending;
    this.pending = null;
    if (!p || p.length < 2) return;
    this.pushUndo();
    const slide: SlideNoteData = { type: 'slide', points: p.map((x, i) => (i === 0 || i === p.length - 1 ? { beat: x.beat, lane: x.lane, width: x.width } : x)) };
    if (this.critical) slide.critical = true;
    if (this.slideEndFlick) slide.endFlick = this.flickDir;
    this.chart.notes.push(slide);
    this.sel = { note: slide, point: p.length - 1 };
    this.renderProps();
  }

  private deleteSelection() {
    const s = this.sel;
    if (!s) return;
    this.pushUndo();
    if (s.note.type === 'slide' && s.point >= 0 && s.note.points.length > 2) {
      s.note.points.splice(s.point, 1);
      this.sel = null;
    } else {
      this.removeNote(s.note);
    }
    this.renderProps();
  }

  private applyMove(d: Extract<Drag, { kind: 'move' }>, x: number, y: number) {
    const dl = this.sixLane ? Math.round((this.laneF(x) - d.lane0) / 2) * 2 : Math.round(this.laneF(x) - d.lane0);
    const db = this.snapBeat(this.beatOf(y)) - this.snapBeat(d.beat0);
    const orig = JSON.parse(d.orig) as NoteData;
    const n = d.sel.note;
    const clampLane = (lane: number, w: number) => Math.max(0, Math.min(LANES - w, lane));
    if (n.type === 'single' && orig.type === 'single') {
      n.lane = clampLane(orig.lane + dl, orig.width);
      n.beat = Math.max(0, orig.beat + db);
    } else if (n.type === 'slide' && orig.type === 'slide') {
      if (d.whole) {
        const minBeat = orig.points[0].beat;
        const shift = Math.max(-minBeat, db);
        n.points.forEach((p, i) => {
          p.lane = clampLane(orig.points[i].lane + dl, p.width);
          p.beat = orig.points[i].beat + shift;
        });
      } else {
        const i = d.sel.point;
        const p = n.points[i];
        const o = orig.points[i];
        p.lane = clampLane(o.lane + dl, o.width);
        const lo = i > 0 ? n.points[i - 1].beat + this.step * 0.5 : 0;
        const hi = i < n.points.length - 1 ? n.points[i + 1].beat - this.step * 0.5 : Infinity;
        p.beat = Math.min(hi, Math.max(lo, o.beat + db));
      }
    }
    d.moved = d.moved || dl !== 0 || db !== 0;
    this.hitsoundsDirty = true;
  }

  // ------------------------------------------------------------ input

  private bindCanvas() {
    const c = this.canvas;
    const pos = (e: MouseEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      const { x, y } = pos(e);
      if (this.playing) this.stop();
      if (e.button === 1) {
        this.drag = { kind: 'scroll', y0: y, beat0: this.curBeat };
        e.preventDefault();
        return;
      }
      const beat = this.snapBeat(this.beatOf(y));
      if (e.button === 2) {
        if (this.tool === 'slide' && this.pending) {
          const r = this.rangeFrom(x, x);
          this.addSlidePoint(beat, r.lane, r.width, false, true);
          return;
        }
        const hit = this.hitTest(x, y);
        if (hit) {
          this.pushUndo();
          this.removeNote(hit.note);
          this.renderProps();
        }
        return;
      }
      if (e.button !== 0) return;
      switch (this.tool) {
        case 'select': {
          const hit = this.hitTest(x, y);
          this.sel = hit;
          this.renderProps();
          if (hit) {
            this.undoStack.push(this.snapshot());
            this.drag = { kind: 'move', sel: hit, lane0: this.laneF(x), beat0: this.beatOf(y), orig: JSON.stringify(hit.note), whole: e.shiftKey || hit.point === -1, moved: false };
          }
          break;
        }
        case 'erase': {
          const hit = this.hitTest(x, y);
          if (hit) {
            this.pushUndo();
            this.removeNote(hit.note);
            this.renderProps();
          }
          break;
        }
        case 'slide':
          this.drag = { kind: 'slidePoint', x0: x, beat, hidden: e.shiftKey };
          break;
        default:
          this.drag = { kind: 'place', x0: x, beat };
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      const { x, y } = pos(e);
      this.hover = x >= 0 && y >= 0 && x <= this.cw && y <= this.ch ? { x, y } : null;
      const d = this.drag;
      if (d?.kind === 'move') {
        this.applyMove(d, x, y);
        this.renderProps();
      } else if (d?.kind === 'scroll') {
        this.curBeat = Math.max(-4, d.beat0 + (y - d.y0) / this.pxPerBeat);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.active) return;
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      const { x } = pos(e);
      if (d.kind === 'place') {
        const r = this.rangeFrom(d.x0, x);
        this.placeSingle(this.tool as SingleNoteData['kind'], d.beat, r.lane, r.width);
      } else if (d.kind === 'slidePoint') {
        const r = this.rangeFrom(d.x0, x);
        this.addSlidePoint(d.beat, r.lane, r.width, d.hidden, false);
      } else if (d.kind === 'move') {
        if (!d.moved) this.undoStack.pop();
        else {
          this.redoStack = [];
          this.dirty = true;
        }
      }
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey) {
          this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
          return;
        }
        if (this.playing) this.stop();
        const dir = e.deltaY < 0 ? 1 : -1;
        const mult = e.shiftKey ? 4 : 1;
        this.curBeat = Math.max(-4, this.snapBeat(this.curBeat) + dir * this.step * mult);
      },
      { passive: false },
    );
  }

  private zoom(f: number) {
    this.pxPerBeat = Math.max(30, Math.min(900, this.pxPerBeat * f));
  }

  private onResize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  };

  private onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-back')) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (ctrl && k === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl && k === 's') {
      e.preventDefault();
      void this.save();
      return;
    }
    if (ctrl) return;
    const tool = TOOLS.find((t) => t.key === e.key);
    if (tool) {
      this.setTool(tool.id);
      return;
    }
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.togglePlay();
        break;
      case 'KeyC':
        this.critical = !this.critical;
        this.renderToolOpts();
        break;
      case 'KeyQ':
      case 'KeyW':
      case 'KeyE':
        this.flickDir = e.code === 'KeyQ' ? 'left' : e.code === 'KeyW' ? 'up' : 'right';
        this.renderToolOpts();
        break;
      case 'BracketLeft':
      case 'BracketRight':
        this.width = Math.max(1, Math.min(12, this.width + (e.code === 'BracketLeft' ? -1 : 1)));
        this.renderToolOpts();
        break;
      case 'KeyP':
        this.test(true);
        break;
      case 'Enter':
        this.finalizeSlide();
        break;
      case 'Escape':
        if (this.pending) this.pending = null;
        else {
          this.sel = null;
          this.renderProps();
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        this.deleteSelection();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        if (this.playing) this.stop();
        this.curBeat = Math.max(-4, this.snapBeat(this.curBeat) + (e.code === 'ArrowUp' ? 1 : -1) * this.step * (e.shiftKey ? 4 : 1));
        break;
      case 'PageUp':
      case 'PageDown':
        e.preventDefault();
        if (this.playing) this.stop();
        this.curBeat = Math.max(0, this.snapBeat(this.curBeat) + (e.code === 'PageUp' ? 4 : -4));
        break;
      case 'Home':
        this.stop();
        this.curBeat = 0;
        break;
      case 'End':
        this.stop();
        this.curBeat = chartLastBeat(this.chart);
        break;
    }
  };

  // ------------------------------------------------------------ playback

  private loadYouTube() {
    this.yt?.destroy();
    this.yt = null;
    this.ytBox.replaceChildren();
    const a = this.chart.audio;
    if (a.type !== 'youtube' || !a.videoId) {
      this.ytState = 'none';
      this.ytStatus.textContent = a.type === 'youtube' ? 'YouTube の URL を入力してください' : '内蔵シンセで再生します';
      return;
    }
    this.ytState = 'loading';
    this.ytStatus.textContent = '動画を読み込み中…';
    const yt = new YouTubeMusic(this.ytBox, a.videoId, this.opts.settings.musicVolume);
    yt.onError = (msg) => {
      this.ytStatus.textContent = msg;
      this.ytState = 'error';
    };
    this.yt = yt;
    yt.prepare(0).then(
      () => {
        if (this.yt !== yt) return;
        this.ytState = 'ready';
        const d = yt.duration();
        this.ytStatus.textContent = `${yt.title() || '読み込み完了'}（${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, '0')}）`;
      },
      (e: Error) => {
        if (this.yt !== yt) return;
        this.ytState = 'error';
        this.ytStatus.textContent = e.message;
      },
    );
  }

  private togglePlay() {
    if (this.playing) this.stop();
    else this.play();
  }

  private play() {
    this.finalizeSlide();
    const a = this.chart.audio;
    if (a.type === 'youtube') {
      if (this.ytState !== 'ready' || !this.yt) {
        toast(this.ytState === 'loading' ? '動画を読み込み中です' : '再生できる動画がありません', 'error', 1800);
        return;
      }
      this.music = this.yt;
    } else {
      this.music?.destroy();
      this.music = new SynthMusic(this.timing, a.lengthBeats, a.seed ?? 1, this.opts.settings.musicVolume, a.song);
    }
    const t = this.timing.beatToTime(this.curBeat);
    this.playing = true;
    this.musicStarted = false;
    this.lastPlayT = t;
    this.clock.set(t);
    this.clock.start();
    if (t >= 0) {
      this.music.seek(t);
      this.music.play();
      this.musicStarted = true;
    }
    this.playBtn.textContent = '❚❚ 停止';
  }

  private stop() {
    if (!this.playing) return;
    this.playing = false;
    this.music?.pause();
    this.clock.pause();
    this.curBeat = this.snapBeat(this.curBeat);
    this.playBtn.textContent = '▶ 再生';
  }

  private rebuildHitsounds() {
    if (!this.hitsoundsDirty) return;
    this.hitsoundsDirty = false;
    const rt = compileChart(this.chart);
    this.hitsounds = [];
    for (const o of rt.objs) {
      if (o.kind === 'tick' && o.hidden) continue;
      const sfx: SfxName =
        o.kind === 'tick' ? 'tick' : o.kind === 'trace' ? 'trace' : o.kind === 'flick' || (o.kind === 'slideEnd' && o.dir) ? 'flick' : o.critical ? 'critical' : 'tap';
      this.hitsounds.push({ time: o.time, sfx });
    }
  }

  private frame() {
    if (this.playing && this.music) {
      if (!this.musicStarted && this.clock.now() >= 0) {
        this.musicStarted = true;
        this.clock.set(0);
        this.music.seek(0);
        this.music.play();
      }
      if (this.musicStarted) {
        const mt = this.music.mediaTime();
        if (mt !== null) this.clock.sync(mt);
        else if (this.music.stalled()) this.clock.pause();
      }
      const t = this.clock.now();
      this.curBeat = this.timing.timeToBeat(t);
      this.rebuildHitsounds();
      if (t > this.lastPlayT) {
        const lat = 0;
        for (const hs of this.hitsounds) if (hs.time > this.lastPlayT + lat && hs.time <= t + lat) this.opts.sfx.play(hs.sfx);
      }
      this.lastPlayT = t;
    }
    this.draw();
    const bpm = this.timing.bpmAt(this.curBeat);
    const t = this.timing.beatToTime(this.curBeat);
    const m = Math.floor(this.curBeat / 4);
    const b = this.curBeat - m * 4;
    const tt = Math.max(0, t);
    this.timeLabel.textContent = `${Math.floor(tt / 60)}:${(tt % 60).toFixed(2).padStart(5, '0')}  |  小節 ${m + 1} : ${(b + 1).toFixed(2)}  |  BPM ${bpm}`;
  }

  // ------------------------------------------------------------ drawing

  private draw() {
    const c = this.ctx;
    const wantDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.max(1, Math.round(this.cw * wantDpr)) || this.canvas.height !== Math.max(1, Math.round(this.ch * wantDpr))) this.onResize();
    const dpr = this.canvas.width / Math.max(1, this.cw);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.cw;
    const H = this.ch;
    c.fillStyle = '#0c0f1f';
    c.fillRect(0, 0, W, H);
    const lx = this.lanesX;
    const lw = this.laneW;
    c.fillStyle = '#141a33';
    c.fillRect(lx, 0, lw * LANES, H);
    for (let k = 1; k < 6; k += 2) {
      c.fillStyle = 'rgba(255,255,255,0.03)';
      c.fillRect(lx + k * 2 * lw, 0, lw * 2, H);
    }
    for (let i = 0; i <= LANES; i++) {
      c.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.22)' : this.sixLane ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.07)';
      c.fillRect(lx + i * lw - 0.5, 0, 1, H);
    }

    // グリッド
    const bTop = this.beatOf(0);
    const bBot = this.beatOf(H);
    const step = this.step;
    c.font = `600 12px ${FONT}`;
    c.textBaseline = 'middle';
    for (let b = Math.max(0, Math.floor(bBot / step) * step); b <= bTop; b += step) {
      const y = Math.round(this.yOf(b)) + 0.5;
      const isMeasure = Math.abs(b / 4 - Math.round(b / 4)) < 1e-6;
      const isBeat = Math.abs(b - Math.round(b)) < 1e-6;
      c.fillStyle = isMeasure ? 'rgba(255,255,255,0.55)' : isBeat ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)';
      c.fillRect(lx, y, lw * LANES, isMeasure ? 2 : 1);
      if (isMeasure) {
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.textAlign = 'right';
        c.fillText(`#${Math.round(b / 4) + 1}`, lx - 10, y);
      } else if (isBeat) {
        c.fillStyle = 'rgba(255,255,255,0.3)';
        c.textAlign = 'right';
        c.fillText(String(Math.round(b) % 4 + 1), lx - 10, y);
      }
    }
    // BPM
    c.textAlign = 'left';
    for (const bp of this.chart.bpms) {
      const y = this.yOf(bp.beat);
      if (y < -20 || y > H + 20) continue;
      c.fillStyle = '#ff9f43';
      c.fillRect(lx + lw * LANES, y - 1, 14, 2);
      c.fillText(`BPM ${bp.bpm}`, lx + lw * LANES + 18, y);
    }

    // スライド
    for (const n of this.chart.notes) if (n.type === 'slide') this.drawSlide(n.points, !!n.critical, n.endFlick, n, false);
    if (this.pending) {
      const p = [...this.pending];
      if (this.hover && !this.drag) {
        const beat = this.snapBeat(this.beatOf(this.hover.y));
        if (beat > p[p.length - 1].beat) p.push({ ...this.rangeFrom(this.hover.x, this.hover.x), beat, visible: true });
      }
      this.drawSlide(p, this.critical, this.slideEndFlick ? this.flickDir : undefined, null, true);
    }
    // 単ノーツ
    for (const n of this.chart.notes) {
      if (n.type !== 'single') continue;
      const y = this.yOf(n.beat);
      if (y < -20 || y > H + 20) continue;
      const col = n.critical ? COLORS.critical : COLORS[n.kind];
      this.noteRect(n.lane, n.width, y, col, n.kind === 'trace', this.sel?.note === n);
      if (n.kind === 'trace') this.diamond(this.xOf(n.lane + n.width / 2), y, col, 6);
      if (n.kind === 'flick') this.arrow(n.lane, n.width, y, n.dir ?? 'up', n.critical ? COLORS.critical : COLORS.flick);
    }

    // ゴースト
    if (this.hover && !this.drag && (this.tool === 'tap' || this.tool === 'flick' || this.tool === 'trace' || this.tool === 'slide')) {
      const beat = this.snapBeat(this.beatOf(this.hover.y));
      const r = this.rangeFrom(this.hover.x, this.hover.x);
      c.globalAlpha = 0.45;
      const col = this.critical ? COLORS.critical : this.tool === 'slide' ? COLORS.slide : COLORS[this.tool];
      this.noteRect(r.lane, r.width, this.yOf(beat), col, this.tool === 'trace', false);
      c.globalAlpha = 1;
    }
    if (this.drag && (this.drag.kind === 'place' || this.drag.kind === 'slidePoint') && this.hover) {
      const r = this.rangeFrom(this.drag.x0, this.hover.x);
      c.globalAlpha = 0.6;
      this.noteRect(r.lane, r.width, this.yOf(this.drag.beat), '#ffffff', false, false);
      c.globalAlpha = 1;
    }

    // 再生ライン
    c.fillStyle = '#6ff0ff';
    c.shadowColor = '#6ff0ff';
    c.shadowBlur = 10;
    c.fillRect(lx - 20, this.playY - 1.5, lw * LANES + 40, 3);
    c.shadowBlur = 0;

    const counts = this.countNotes();
    this.statusEl.textContent = `ノーツ ${counts.total}（タップ ${counts.tap} / フリック ${counts.flick} / なぞり ${counts.trace} / スライド ${counts.slide}）  ${this.dirty ? '● 未保存' : ''}`;
  }

  private countNotes() {
    const r = { total: 0, tap: 0, flick: 0, trace: 0, slide: 0 };
    for (const n of this.chart.notes) {
      if (n.type === 'single') r[n.kind]++;
      else r.slide++;
    }
    r.total = this.chart.notes.length;
    return r;
  }

  private noteRect(lane: number, width: number, y: number, color: string, thin: boolean, selected: boolean) {
    const c = this.ctx;
    const x = this.xOf(lane) + 2;
    const w = width * this.laneW - 4;
    const hh = thin ? 7 : 12;
    c.fillStyle = color;
    roundRect(c, x, y - hh / 2, w, hh, 4);
    c.fill();
    c.lineWidth = selected ? 3 : 1.5;
    c.strokeStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.85)';
    if (selected) {
      c.shadowColor = '#ffffff';
      c.shadowBlur = 12;
    }
    c.stroke();
    c.shadowBlur = 0;
  }

  private diamond(x: number, y: number, color: string, s: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x, y - s);
    c.lineTo(x + s, y);
    c.lineTo(x, y + s);
    c.lineTo(x - s, y);
    c.closePath();
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.stroke();
  }

  private arrow(lane: number, width: number, y: number, dir: FlickDir, color: string) {
    const c = this.ctx;
    const x = this.xOf(lane + width / 2);
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    c.save();
    c.translate(x, y - 14);
    c.rotate(dx * 0.6);
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(9, 3);
    c.lineTo(-9, 3);
    c.closePath();
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.stroke();
    c.restore();
  }

  private drawSlide(points: SlidePointData[], critical: boolean, endFlick: FlickDir | undefined, note: SlideNoteData | null, pending: boolean) {
    const c = this.ctx;
    if (!points.length) return;
    const H = this.ch;
    const y0 = this.yOf(points[0].beat);
    const y1 = this.yOf(points[points.length - 1].beat);
    if (y1 > H + 20 || y0 < -20) return;
    const guide = !!note?.guide;
    const base = critical ? '255,201,51' : '61,228,139';
    // 経路（attach 中継点は経路を曲げない）
    const joints = points.filter((p, i) => i === 0 || i === points.length - 1 || !p.attach);
    const pathAt = (beat: number): [number, number] => {
      for (let i = 0; i < joints.length - 1; i++) {
        const a = joints[i];
        const b = joints[i + 1];
        if (beat <= b.beat) {
          const u = b.beat > a.beat ? Math.max(0, (beat - a.beat) / (b.beat - a.beat)) : 1;
          return [a.lane + (b.lane - a.lane) * u, a.lane + a.width + (b.lane + b.width - a.lane - a.width) * u];
        }
      }
      const e = joints[joints.length - 1];
      return [e.lane, e.lane + e.width];
    };
    c.fillStyle = `rgba(${base},${guide ? 0.14 : pending ? 0.2 : 0.3})`;
    for (let i = 0; i < joints.length - 1; i++) {
      const a = joints[i];
      const b = joints[i + 1];
      c.beginPath();
      c.moveTo(this.xOf(a.lane) + 4, this.yOf(a.beat));
      c.lineTo(this.xOf(a.lane + a.width) - 4, this.yOf(a.beat));
      c.lineTo(this.xOf(b.lane + b.width) - 4, this.yOf(b.beat));
      c.lineTo(this.xOf(b.lane) + 4, this.yOf(b.beat));
      c.closePath();
      c.fill();
    }
    c.strokeStyle = `rgba(${base},${guide ? 0.35 : 0.8})`;
    c.lineWidth = 1.5;
    if (pending || guide) c.setLineDash([6, 4]);
    for (const side of [0, 1]) {
      c.beginPath();
      joints.forEach((p, i) => {
        const x = side ? this.xOf(p.lane + p.width) - 4 : this.xOf(p.lane) + 4;
        if (i) c.lineTo(x, this.yOf(p.beat));
        else c.moveTo(x, this.yOf(p.beat));
      });
      c.stroke();
    }
    c.setLineDash([]);
    const col = critical ? COLORS.critical : COLORS.slide;
    points.forEach((p, i) => {
      const y = this.yOf(p.beat);
      const selected = !!note && this.sel?.note === note && (this.sel.point === i || this.sel.point === -1);
      const isStart = i === 0;
      const isEnd = i === points.length - 1;
      const pcol = p.critical ? COLORS.critical : p.trace ? COLORS.trace : col;
      if (isStart || isEnd) {
        const hiddenHead = guide || (isStart ? note?.startHidden : note?.endHidden);
        if (hiddenHead) {
          c.strokeStyle = selected ? '#fff' : `rgba(${base},0.7)`;
          c.lineWidth = 1.5;
          c.setLineDash([3, 3]);
          c.strokeRect(this.xOf(p.lane) + 2, y - 5, p.width * this.laneW - 4, 10);
          c.setLineDash([]);
          return;
        }
        const isFlickEnd = isEnd && i > 0 && !!endFlick;
        this.noteRect(p.lane, p.width, y, isFlickEnd && !critical ? COLORS.flick : pcol, !!p.trace, selected);
        if (p.trace) this.diamond(this.xOf(p.lane + p.width / 2), y, pcol, 5);
        if (isFlickEnd) this.arrow(p.lane, p.width, y, endFlick!, critical ? COLORS.critical : COLORS.flick);
      } else if (p.visible !== false) {
        const [l, r] = p.attach ? pathAt(p.beat) : [p.lane, p.lane + p.width];
        this.diamond(this.xOf((l + r) / 2), y, pcol, selected ? 9 : 7);
        if (selected) this.noteRect(l, r - l, y, 'rgba(255,255,255,0.15)', true, true);
      } else {
        c.beginPath();
        c.arc(this.xOf(p.lane + p.width / 2), y, selected ? 6 : 4, 0, Math.PI * 2);
        c.strokeStyle = selected ? '#fff' : `rgba(${base},0.9)`;
        c.lineWidth = 2;
        c.stroke();
      }
    });
  }

  // ------------------------------------------------------------ panels

  private renderProps() {
    const s = this.sel;
    if (!s || !this.chart.notes.includes(s.note)) {
      this.sel = null;
      this.propsEl.replaceChildren(h('div', { class: 'tip' }, '「選択・移動」ツールでノーツをクリックすると、ここで編集できます。'));
      return;
    }
    const n = s.note;
    const numField = (label: string, value: number, min: number, max: number, set: (v: number) => void, stepv = 1) => {
      const i = h('input', { type: 'number', min, max, step: stepv, value: String(value) });
      i.addEventListener('change', () => {
        const v = Number(i.value);
        if (!Number.isFinite(v)) return;
        this.pushUndo();
        set(Math.max(min, Math.min(max, v)));
        this.renderProps();
      });
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), i);
    };
    const checkField = (label: string, value: boolean, set: (v: boolean) => void) => {
      const i = h('input', { type: 'checkbox', checked: value });
      i.addEventListener('change', () => {
        this.pushUndo();
        set(i.checked);
        this.renderProps();
      });
      return h('label', { class: 'field check' }, i, h('span', {}, label));
    };
    const selectField = <T extends string>(label: string, value: T, options: [T, string][], set: (v: T) => void) => {
      const i = h('select', {}, ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
      i.addEventListener('change', () => {
        this.pushUndo();
        set(i.value as T);
        this.renderProps();
      });
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), i);
    };
    const pos = (beat: number) => `小節 ${Math.floor(beat / 4) + 1} / 拍 ${((beat % 4) + 1).toFixed(3)}`;
    const items: HTMLElement[] = [];
    if (n.type === 'single') {
      items.push(
        h('div', { class: 'prop-pos' }, pos(n.beat)),
        selectField('種類', n.kind, [['tap', 'タップ'], ['flick', 'フリック'], ['trace', 'なぞり']], (v) => {
          n.kind = v;
          if (v === 'flick') n.dir = n.dir ?? 'up';
          else delete n.dir;
        }),
        checkField('クリティカル', !!n.critical, (v) => (v ? (n.critical = true) : delete n.critical)),
      );
      if (n.kind === 'flick') items.push(selectField('方向', n.dir ?? 'up', FLICK_DIRS.map((d) => [d, DIR_LABEL[d]]), (v) => (n.dir = v)));
      items.push(
        numField('レーン (0-11)', n.lane, 0, LANES - n.width, (v) => (n.lane = Math.round(v))),
        numField('幅', n.width, 1, LANES - n.lane, (v) => (n.width = Math.round(v))),
        numField('拍', +n.beat.toFixed(4), 0, 100000, (v) => (n.beat = v), 0.25),
      );
    } else {
      const p = n.points[Math.max(0, s.point)];
      const i = Math.max(0, s.point);
      const role = i === 0 ? '始点' : i === n.points.length - 1 ? '終点' : '中継点';
      items.push(
        h('div', { class: 'prop-pos' }, `スライド ${role}（${i + 1}/${n.points.length}）  ${pos(p.beat)}`),
        numField('レーン (0-11)', p.lane, 0, LANES - p.width, (v) => (p.lane = Math.round(v))),
        numField('幅', p.width, 1, LANES - p.lane, (v) => (p.width = Math.round(v))),
      );
      if (role === '中継点') {
        items.push(checkField('表示する（コンボあり）', p.visible !== false, (v) => (p.visible = v)));
        if (p.visible !== false) items.push(checkField('経路に沿わせる（経路を曲げない）', !!p.attach, (v) => (v ? (p.attach = true) : delete p.attach)));
      }
      if (role === '始点') items.push(checkField('始点ノーツなし', !!n.startHidden, (v) => (v ? (n.startHidden = true) : delete n.startHidden)));
      if (role === '終点') items.push(checkField('終点ノーツなし', !!n.endHidden, (v) => (v ? (n.endHidden = true) : delete n.endHidden)));
      if (p.visible !== false) items.push(checkField('なぞり判定にする', !!p.trace, (v) => (v ? (p.trace = true) : delete p.trace)));
      items.push(
        h('h4', {}, 'スライド全体'),
        checkField('クリティカル', !!n.critical, (v) => (v ? (n.critical = true) : delete n.critical)),
        checkField('ガイド（判定なしの見た目だけ）', !!n.guide, (v) => (v ? (n.guide = true) : delete n.guide)),
        selectField<'none' | FlickDir>('終点フリック', n.endFlick ?? 'none', [['none', 'なし'], ...FLICK_DIRS.map((d) => [d, DIR_LABEL[d]] as [FlickDir, string])], (v) =>
          v === 'none' ? delete n.endFlick : (n.endFlick = v),
        ),
      );
    }
    items.push(h('button', { class: 'btn danger small', onclick: () => this.deleteSelection() }, n.type === 'slide' && s.point >= 0 && n.points.length > 2 ? 'この点を削除' : '削除'));
    if (n.type === 'slide')
      items.push(
        h(
          'button',
          {
            class: 'btn danger small',
            onclick: () => {
              this.pushUndo();
              this.removeNote(n);
              this.renderProps();
            },
          },
          'スライドごと削除',
        ),
      );
    this.propsEl.replaceChildren(...items);
  }

  private renderInfo() {
    const ch = this.chart;
    const text = (label: string, value: string, set: (v: string) => void) => {
      const i = h('input', { type: 'text', value });
      i.addEventListener('input', () => {
        set(i.value);
        this.dirty = true;
      });
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), i);
    };
    const diffSel = h('select', {}, ...DIFFICULTIES.map((d) => h('option', { value: d, selected: d === ch.difficulty }, d.toUpperCase())));
    diffSel.addEventListener('change', () => {
      ch.difficulty = diffSel.value as Difficulty;
      this.dirty = true;
    });
    const level = h('input', { type: 'number', min: 1, max: 99, value: String(ch.level) });
    level.addEventListener('change', () => {
      ch.level = Math.max(1, Math.min(99, Math.round(Number(level.value)) || 1));
      this.dirty = true;
    });

    // 音源
    const srcSel = h('select', {}, h('option', { value: 'youtube', selected: ch.audio.type === 'youtube' }, 'YouTube'), h('option', { value: 'synth', selected: ch.audio.type === 'synth' }, '内蔵シンセ（デモ用）'));
    srcSel.addEventListener('change', () => {
      this.stop();
      ch.audio = srcSel.value === 'synth' ? { type: 'synth', lengthBeats: Math.max(64, Math.ceil(chartLastBeat(ch)) + 8), seed: 1 } : { type: 'youtube', videoId: '' };
      this.dirty = true;
      this.renderInfo();
      this.loadYouTube();
    });
    const audioFields: HTMLElement[] = [];
    if (ch.audio.type === 'youtube') {
      const url = h('input', { type: 'text', placeholder: 'https://www.youtube.com/watch?v=...', value: ch.audio.videoId ? `https://youtu.be/${ch.audio.videoId}` : '' });
      const load = () => {
        const id = parseYouTubeId(url.value);
        if (!id) {
          toast('YouTube の URL を認識できませんでした', 'error');
          return;
        }
        this.stop();
        ch.audio = { type: 'youtube', videoId: id };
        this.dirty = true;
        this.loadYouTube();
      };
      url.addEventListener('keydown', (e) => e.key === 'Enter' && load());
      audioFields.push(h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'YouTube URL'), h('div', { class: 'row' }, url, h('button', { class: 'btn small', onclick: load }, '読込'))));
    } else {
      const len = h('input', { type: 'number', min: 16, max: 2000, value: String(ch.audio.lengthBeats) });
      len.addEventListener('change', () => {
        if (ch.audio.type === 'synth') ch.audio.lengthBeats = Math.max(16, Math.round(Number(len.value)) || 64);
        this.dirty = true;
      });
      audioFields.push(h('label', { class: 'field' }, h('span', { class: 'field-label' }, '曲の長さ（拍）'), len));
    }

    // タイミング
    const offset = h('input', { type: 'number', step: 0.001, value: ch.offset.toFixed(3) });
    const setOffset = (v: number) => {
      this.pushUndo();
      ch.offset = Math.round(v * 1000) / 1000;
      offset.value = ch.offset.toFixed(3);
      this.rebuildTiming();
    };
    offset.addEventListener('change', () => setOffset(Number(offset.value) || 0));
    const bpmRows = h('div', { class: 'bpm-list' });
    const renderBpms = () => {
      bpmRows.replaceChildren(
        ...ch.bpms
          .map((b, i) => ({ b, i }))
          .sort((x, y) => x.b.beat - y.b.beat)
          .map(({ b }) => {
            const beat = h('input', { type: 'number', step: 0.25, min: 0, value: String(b.beat), title: '拍' });
            const bpm = h('input', { type: 'number', step: 0.01, min: 1, value: String(b.bpm), title: 'BPM' });
            const upd = () => {
              this.pushUndo();
              b.beat = Math.max(0, Number(beat.value) || 0);
              b.bpm = Math.max(1, Number(bpm.value) || 120);
              this.rebuildTiming();
            };
            beat.addEventListener('change', upd);
            bpm.addEventListener('change', upd);
            return h(
              'div',
              { class: 'bpm-row' },
              h('span', {}, '拍'),
              beat,
              h('span', {}, 'BPM'),
              bpm,
              ch.bpms.length > 1
                ? h(
                    'button',
                    {
                      class: 'btn small danger',
                      onclick: () => {
                        this.pushUndo();
                        ch.bpms = ch.bpms.filter((x) => x !== b);
                        this.rebuildTiming();
                        renderBpms();
                      },
                    },
                    '×',
                  )
                : null,
            );
          }),
      );
    };
    renderBpms();

    // BPM タップ計測
    const taps: number[] = [];
    const tapOut = h('span', { class: 'slider-val' }, '—');
    const tapBtn = h('button', { class: 'btn small' }, 'ここをリズムに合わせてクリック');
    tapBtn.addEventListener('mousedown', () => {
      const t = performance.now();
      if (taps.length && t - taps[taps.length - 1] > 2000) taps.length = 0;
      taps.push(t);
      if (taps.length >= 4) {
        const span = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
        tapOut.textContent = (60000 / span).toFixed(1);
      } else tapOut.textContent = `${taps.length}…`;
    });

    this.infoEl.replaceChildren(
      h('h3', {}, '楽曲・譜面情報'),
      text('曲名', ch.title, (v) => (ch.title = v)),
      text('アーティスト', ch.artist, (v) => (ch.artist = v)),
      text('譜面作者', ch.charter, (v) => (ch.charter = v)),
      h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, '難易度'), diffSel), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'レベル'), level)),
      h('h3', {}, '音源'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, '種類'), srcSel),
      ...audioFields,
      this.ytBox,
      this.ytStatus,
      h('h3', {}, 'タイミング'),
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, 'オフセット（拍0の位置・秒）'),
        h(
          'div',
          { class: 'row' },
          offset,
          h('button', { class: 'btn small', onclick: () => setOffset(ch.offset - 0.01) }, '-10ms'),
          h('button', { class: 'btn small', onclick: () => setOffset(ch.offset + 0.01) }, '+10ms'),
        ),
      ),
      h(
        'button',
        {
          class: 'btn small',
          title: '再生して最初の拍の頭で止め、このボタンを押す',
          onclick: () => {
            const t = this.timing.beatToTime(this.curBeat);
            setOffset(t);
            this.curBeat = 0;
          },
        },
        '現在の位置を「拍0」にする',
      ),
      h('div', { class: 'field-label' }, 'BPM 変化'),
      bpmRows,
      h(
        'button',
        {
          class: 'btn small',
          onclick: () => {
            this.pushUndo();
            const beat = this.snapBeat(this.curBeat);
            ch.bpms = ch.bpms.filter((b) => Math.abs(b.beat - beat) > 1e-6);
            ch.bpms.push({ beat, bpm: this.timing.bpmAt(beat) });
            this.rebuildTiming();
            renderBpms();
          },
        },
        '＋ 現在位置に BPM 変化を追加',
      ),
      h('div', { class: 'field-label' }, 'BPM 計測'),
      tapBtn,
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'field-label' }, '計測結果'),
        tapOut,
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              const v = parseFloat(tapOut.textContent ?? '');
              if (!Number.isFinite(v)) return;
              this.pushUndo();
              ch.bpms[0].bpm = Math.round(v);
              this.rebuildTiming();
              renderBpms();
            },
          },
          '適用',
        ),
      ),
    );
    this.rebuildTiming();
  }

  private help() {
    const m = modal('エディタの操作', { wide: true });
    const rows: [string, string][] = [
      ['1〜6', 'ツール切替（タップ / フリック / なぞり / スライド / 選択 / 消しゴム）'],
      ['左クリック', '配置（横ドラッグで幅指定）'],
      ['右クリック', 'ノーツを削除 / スライド作成中は終点を置いて確定'],
      ['Shift+クリック', 'スライド: 見えない折れ点を追加 / 選択: スライド全体を移動'],
      ['Enter / Esc', 'スライド確定 / 取り消し・選択解除'],
      ['C', 'クリティカル切替'],
      ['Q W E', 'フリック方向 左上 / 上 / 右上'],
      ['[ ]', 'ノーツ幅 -1 / +1'],
      ['ホイール / ↑↓', 'スクロール（Shift で4倍）。PageUp/Down で1小節'],
      ['Ctrl+ホイール', 'ズーム'],
      ['中ボタンドラッグ', 'スクロール'],
      ['Space', '再生 / 停止（ヒット音つき）'],
      ['P', '現在位置からテストプレイ'],
      ['Ctrl+Z / Ctrl+Y', '元に戻す / やり直し'],
      ['Ctrl+S', '保存'],
      ['Delete', '選択中のノーツ（点）を削除'],
    ];
    m.body.append(
      h('table', { class: 'help-table' }, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v)))),
      h(
        'p',
        { class: 'tip' },
        'YouTube 曲の合わせ方: 1) URL を読み込む 2) BPM を入力（計測ボタンも使えます） 3) 再生して曲の最初の強拍で停止し「現在の位置を拍0にする」 4) ±10ms で微調整。',
      ),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => m.close() }, '閉じる')),
    );
  }
}

