import { ChartData } from '../core/chart';
import { Settings, keyLabel, noteDuration } from '../core/settings';
import { MusicSource } from '../audio/music';
import { Sfx } from '../audio/sfx';
import { SynthMusic } from '../audio/synth';
import { YouTubeMusic } from '../audio/youtube';
import { h, toggleFullscreen } from '../ui/dom';
import { GameClock } from './clock';
import { GameEngine, JudgeEvent, Stats, rankOf } from './engine';
import { GameRenderer } from './renderer';
import { RuntimeChart, compileChart } from './runtime';

export interface GameResult {
  chart: ChartData;
  stats: Stats;
  score: number;
  rank: string;
  fullCombo: boolean;
  allPerfect: boolean;
  autoplay: boolean;
  failed: boolean;
  totalCombo: number;
  partial: boolean;
}

export type GameExit = { type: 'finish'; result: GameResult } | { type: 'retry' } | { type: 'quit' };

export interface GameOptions {
  chart: ChartData;
  autoplay: boolean;
  /** 途中から開始（エディタのテストプレイ） */
  startBeat?: number;
  settings: Settings;
  sfx: Sfx;
  onExit: (e: GameExit) => void;
}

export class GameScreen {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private overlay: HTMLElement;
  private ytLayer: HTMLElement;
  private renderer: GameRenderer;
  private runtime: RuntimeChart;
  private engine: GameEngine;
  private clock = new GameClock();
  private music: MusicSource | null = null;
  private musicStart = 0;
  private musicStarted = false;
  private paused = false;
  private resuming = false;
  private raf = 0;
  private destroyed = false;
  private ended = false;
  private offset: number;
  private duration: number;
  private startTime: number | null;

  constructor(private opts: GameOptions) {
    const s = opts.settings;
    this.offset = s.offsetMs / 1000;
    this.duration = noteDuration(s.noteSpeed);
    this.ytLayer = h('div', { class: 'yt-layer' + (s.showVideo ? '' : ' hidden') });
    this.canvas = h('canvas', { class: 'game-canvas' });
    this.overlay = h('div', { class: 'game-overlay' });
    this.el = h('div', { class: 'screen game-screen' }, this.ytLayer, this.canvas, this.overlay);
    this.runtime = compileChart(opts.chart);
    this.startTime = opts.startBeat !== undefined ? this.runtime.timing.beatToTime(opts.startBeat) : null;
    this.engine = new GameEngine(this.runtime, opts.autoplay, this.startTime ?? -Infinity);
    this.engine.flickNeedsLane = s.flickNeedsLane;
    this.engine.onJudge = (e) => this.onJudge(e);
    this.renderer = new GameRenderer(this.canvas);
  }

  async start() {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    this.onResize();

    const chart = this.opts.chart;
    const t0 = this.startTime !== null ? this.startTime - 2 : Math.min(0, this.runtime.firstTime - 2.5);
    this.musicStart = Math.max(0, t0);
    this.clock.set(t0);
    this.showMessage('読み込み中…', chart.audio.type === 'youtube' ? 'YouTube から楽曲を準備しています' : '');
    this.loop();

    try {
      if (chart.audio.type === 'youtube') {
        const yt = new YouTubeMusic(this.ytLayer, chart.audio.videoId, this.opts.settings.musicVolume);
        yt.onError = (msg) => this.fatal(msg);
        this.music = yt;
      } else {
        this.music = new SynthMusic(this.runtime.timing, chart.audio.lengthBeats, chart.audio.seed ?? 1, this.opts.settings.musicVolume, chart.audio.song);
      }
      await this.music.prepare(this.musicStart);
    } catch (e) {
      this.fatal((e as Error).message);
      return;
    }
    if (this.destroyed) return;
    await this.countdown();
    if (this.destroyed || this.paused) return;
    this.clock.start();
  }

  private showMessage(title: string, sub = '', buttons: HTMLElement[] = []) {
    this.overlay.replaceChildren(
      h('div', { class: 'overlay-box' }, h('div', { class: 'overlay-title' }, title), sub ? h('div', { class: 'overlay-sub' }, sub) : null, buttons.length ? h('div', { class: 'overlay-buttons' }, buttons) : null),
    );
    this.overlay.classList.add('show');
  }

  private hideMessage() {
    this.overlay.classList.remove('show');
    this.overlay.replaceChildren();
  }

  private fatal(msg: string) {
    this.clock.pause();
    this.music?.pause();
    this.showMessage('再生できませんでした', msg, [
      h('button', { class: 'btn', onclick: () => this.exit({ type: 'retry' }) }, 'リトライ'),
      h('button', { class: 'btn primary', onclick: () => this.exit({ type: 'quit' }) }, '戻る'),
    ]);
  }

  private async countdown() {
    this.resuming = true;
    for (const n of ['3', '2', '1']) {
      if (this.destroyed) return;
      this.overlay.replaceChildren(h('div', { class: 'countdown' }, n));
      this.overlay.classList.add('show');
      await new Promise((r) => setTimeout(r, 450));
    }
    this.hideMessage();
    this.resuming = false;
  }

  private onJudge(e: JudgeEvent) {
    this.renderer.onJudge(e.obj, e.judge, e.diff);
    if (e.judge === 'miss') return;
    const o = e.obj;
    const sfx = this.opts.sfx;
    if (o.kind === 'tick') {
      if (!o.hidden) sfx.play('tick');
    } else if (o.kind === 'trace') sfx.play('trace');
    else if (o.kind === 'flick' || (o.kind === 'slideEnd' && o.dir)) sfx.play('flick');
    else if (e.judge === 'bad') sfx.play('good');
    else sfx.play(o.critical ? 'critical' : 'tap');
  }

  private gameNow(): number {
    return this.clock.now() - this.offset;
  }

  private eventTime(e: KeyboardEvent): number {
    const ts = e.timeStamp > 0 && e.timeStamp <= performance.now() ? e.timeStamp : performance.now();
    return this.clock.at(ts) - this.offset;
  }

  private loop = () => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.tick();
  };

  private tick() {
    const m = this.music;
    if (m && !this.paused && !this.resuming && this.clock.isRunning && !this.musicStarted && this.clock.now() >= this.musicStart) {
      this.musicStarted = true;
      this.clock.set(this.musicStart);
      m.play();
    }
    if (m && this.musicStarted && !this.paused && !this.resuming) {
      const mt = m.mediaTime();
      if (mt !== null) this.clock.sync(mt);
      else if (m.stalled()) this.clock.pause();
    }
    const now = this.gameNow();
    if (!this.paused) this.engine.update(now);

    const s = this.opts.settings;
    const chart = this.opts.chart;
    const span = Math.max(1, this.runtime.endTime - (this.startTime ?? 0));
    this.renderer.render(
      now,
      this.duration,
      this.runtime,
      this.engine,
      {
        title: chart.title,
        difficulty: chart.difficulty,
        level: chart.level,
        autoplay: this.opts.autoplay,
        showFastLate: s.showFastLate,
        keyLabels: s.showKeyHints ? s.keys.map(keyLabel) : null,
        flickLabel: s.flickKeys.map(keyLabel).join(' / '),
        videoBg: chart.audio.type === 'youtube' && s.showVideo,
        dim: s.bgDim,
        sixLane: chart.keyMode === 6,
      },
      (now - (this.startTime ?? 0)) / span,
    );

    if (!this.ended && !this.paused) {
      const failStop = s.failOnZeroLife && this.engine.stats.failed && !this.opts.autoplay;
      if ((this.engine.finished && now > this.runtime.endTime + 1.2) || failStop) this.finish();
    }
  }

  private finish() {
    this.ended = true;
    const e = this.engine;
    const result: GameResult = {
      chart: this.opts.chart,
      stats: { ...e.stats },
      score: e.score,
      rank: rankOf(e.score),
      fullCombo: e.fullCombo && !e.stats.failed,
      allPerfect: e.allPerfect && !e.stats.failed,
      autoplay: this.opts.autoplay,
      failed: e.stats.failed,
      totalCombo: this.runtime.totalCombo,
      partial: this.startTime !== null,
    };
    const banner = result.allPerfect ? 'ALL PERFECT' : result.fullCombo ? 'FULL COMBO' : result.failed ? 'LIVE FAILED' : 'LIVE CLEAR';
    this.overlay.replaceChildren(h('div', { class: 'clear-banner ' + banner.toLowerCase().replace(' ', '-') }, banner));
    this.overlay.classList.add('show');
    setTimeout(() => {
      this.music?.pause();
      this.exit({ type: 'finish', result });
    }, 2200);
  }

  private pause() {
    if (this.paused || this.ended) return;
    this.paused = true;
    this.clock.pause();
    this.music?.pause();
    for (let k = 0; k < 6; k++) if (this.engine.held[k]) this.engine.keyUp(k, this.gameNow());
    this.engine.flickUp();
    this.showMessage('一時停止', 'Esc で再開', [
      h('button', { class: 'btn primary', onclick: () => void this.resume() }, '再開'),
      h('button', { class: 'btn', onclick: () => this.exit({ type: 'retry' }) }, 'リトライ'),
      h('button', { class: 'btn', onclick: () => this.exit({ type: 'quit' }) }, 'やめる'),
    ]);
  }

  private async resume() {
    if (!this.paused || this.resuming) return;
    this.hideMessage();
    await this.countdown();
    if (this.destroyed) return;
    this.paused = false;
    if (this.musicStarted) this.music?.play();
    else this.clock.start();
  }

  private exit(e: GameExit) {
    if (this.destroyed) return;
    this.destroy();
    this.opts.onExit(e);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    this.music?.destroy();
    this.music = null;
    this.el.remove();
  }

  private onResize = () => {
    requestAnimationFrame(() => this.renderer.resize());
  };

  private onBlur = () => {
    if (!this.opts.autoplay && this.clock.isRunning) this.pause();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-back')) return;
    const s = this.opts.settings;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.ended) return;
      if (this.paused) void this.resume();
      else this.pause();
      return;
    }
    if (e.code === 'F11') {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    const k = s.keys.indexOf(e.code);
    const isFlick = s.flickKeys.includes(e.code);
    if (k < 0 && !isFlick) return;
    e.preventDefault();
    if (e.repeat || this.paused || this.ended) return;
    const t = this.eventTime(e);
    if (k >= 0) this.engine.keyDown(k, t);
    if (isFlick) this.engine.flickDown(t);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const s = this.opts.settings;
    const k = s.keys.indexOf(e.code);
    if (k >= 0) {
      e.preventDefault();
      this.engine.keyUp(k, this.eventTime(e));
      this.renderer.keyReleased(k);
    }
    if (s.flickKeys.includes(e.code)) {
      e.preventDefault();
      this.engine.flickUp();
    }
  };
}
