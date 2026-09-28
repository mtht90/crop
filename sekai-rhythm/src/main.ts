import './styles.css';
import { audioCtx } from './audio/context';
import { Sfx } from './audio/sfx';
import { builtinCharts } from './charts/samples';
import { ChartData, DIFFICULTIES, Difficulty, cloneChart, emptyChart, newChartId, normalizeChart, parseYouTubeId } from './core/chart';
import { Settings } from './core/settings';
import { storage } from './core/storage';
import { parseSus } from './core/sus';
import { EditorScreen } from './editor/editor';
import { GameExit, GameResult, GameScreen } from './game/game';
import { resultScreen } from './ui/result';
import { SelectScreen } from './ui/select';
import { openSettings } from './ui/settings';
import { confirmDialog, downloadText, h, modal, pickFile, safeFileName, toast, toggleFullscreen } from './ui/dom';

class App {
  private root = document.getElementById('app')!;
  private settings!: Settings;
  private sfx!: Sfx;
  private select: SelectScreen | null = null;
  private editor: EditorScreen | null = null;
  private lastSelected: string | null = null;

  async init() {
    this.settings = await storage.getSettings();
    this.sfx = new Sfx(this.settings.sfxVolume);
    await this.sfx.init();
    // ブラウザの自動再生制限対策：最初の操作で AudioContext を起こす
    const wake = () => void audioCtx().resume();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F11' && !document.querySelector('.game-screen')) {
        e.preventDefault();
        toggleFullscreen();
      }
    });
    await this.showSelect();
  }

  private async allCharts(): Promise<ChartData[]> {
    return [...builtinCharts(), ...(await storage.getCharts())];
  }

  private clearRoot() {
    this.select?.destroy();
    this.select = null;
    this.root.replaceChildren();
  }

  async showSelect(selectId?: string) {
    if (selectId) this.lastSelected = selectId;
    this.clearRoot();
    const scores = await storage.getScores();
    this.select = new SelectScreen(
      {
        play: (c, auto) => {
          this.lastSelected = c.id;
          this.play(c, auto);
        },
        edit: (c) => this.openEditor(cloneChart(c)),
        duplicate: (c) => void this.duplicate(c),
        exportJson: (c) => downloadText(`${safeFileName(c.title)}_${c.difficulty}.json`, JSON.stringify(c, null, 1)),
        remove: (c) => void this.remove(c),
        create: () => this.create(),
        importFile: () => void this.importFile(),
        settings: () =>
          openSettings(this.settings, (s) => {
            this.settings = s;
            this.sfx.volume = s.sfxVolume;
            void storage.saveSettings(s);
          }),
      },
      scores,
      this.lastSelected,
    );
    this.root.append(this.select.el);
    this.select.setCharts(await this.allCharts());
  }

  /** from: 'select' ならリザルト後に選曲へ、'editor' ならエディタへ戻る */
  private play(chart: ChartData, autoplay: boolean, from: 'select' | 'editor' = 'select', startBeat?: number) {
    if (from === 'select') this.clearRoot();
    const game = new GameScreen({
      chart,
      autoplay,
      startBeat,
      settings: this.settings,
      sfx: this.sfx,
      onExit: (e: GameExit) => {
        if (e.type === 'retry') this.play(chart, autoplay, from, startBeat);
        else if (e.type === 'quit') this.back(from, chart);
        else void this.showResult(e.result, from, startBeat);
      },
    });
    this.root.append(game.el);
    void game.start();
  }

  private back(from: 'select' | 'editor', chart: ChartData) {
    if (from === 'editor' && this.editor) this.editor.resume();
    else void this.showSelect(chart.id);
  }

  private async showResult(r: GameResult, from: 'select' | 'editor', startBeat?: number) {
    let newRecord = false;
    if (!r.autoplay && !r.partial && from === 'select') {
      newRecord = await storage.submitScore(r.chart.id, {
        score: r.score,
        rank: r.rank,
        fullCombo: r.fullCombo,
        allPerfect: r.allPerfect,
        maxCombo: r.stats.maxCombo,
        playedAt: Date.now(),
      });
    }
    if (from === 'select') this.clearRoot();
    const el = resultScreen(
      r,
      newRecord,
      () => {
        el.remove();
        this.play(r.chart, r.autoplay, from, startBeat);
      },
      () => {
        el.remove();
        this.back(from, r.chart);
      },
      from === 'editor' ? 'エディタへ' : '選曲へ',
    );
    this.root.append(el);
  }

  private openEditor(chart: ChartData) {
    this.clearRoot();
    this.editor?.destroy();
    this.editor = new EditorScreen({
      chart,
      settings: this.settings,
      sfx: this.sfx,
      onSave: async (c) => {
        await storage.saveChart(c);
      },
      onTest: (c, startBeat) => {
        this.editor?.suspend();
        this.play(cloneChart(c), false, 'editor', startBeat);
      },
      onExit: () => {
        this.editor = null;
        void this.showSelect(chart.id);
      },
    });
    this.root.append(this.editor.el);
  }

  private create() {
    const m = modal('新しい譜面');
    const title = h('input', { type: 'text', placeholder: '曲名' });
    const artist = h('input', { type: 'text', placeholder: 'アーティスト' });
    const url = h('input', { type: 'text', placeholder: 'https://www.youtube.com/watch?v=...' });
    const bpm = h('input', { type: 'number', value: '120', min: 1, step: 0.01 });
    const diff = h('select', {}, ...DIFFICULTIES.map((d) => h('option', { value: d, selected: d === 'expert' }, d.toUpperCase())));
    const level = h('input', { type: 'number', value: '25', min: 1, max: 99 });
    const field = (label: string, input: HTMLElement) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
    m.body.append(
      field('曲名', title),
      field('アーティスト', artist),
      field('YouTube URL（あとからでも設定できます）', url),
      h('div', { class: 'row' }, field('BPM', bpm), field('難易度', diff), field('レベル', level)),
      h(
        'div',
        { class: 'row end' },
        h('button', { class: 'btn', onclick: () => m.close() }, 'キャンセル'),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: async () => {
              const id = url.value.trim() ? parseYouTubeId(url.value) : '';
              if (id === null) {
                toast('YouTube の URL を認識できませんでした', 'error');
                return;
              }
              const c = emptyChart({
                title: title.value.trim() || '新しい譜面',
                artist: artist.value.trim(),
                audio: { type: 'youtube', videoId: id },
                bpms: [{ beat: 0, bpm: Math.max(1, Number(bpm.value) || 120) }],
                difficulty: diff.value as Difficulty,
                level: Math.max(1, Math.min(99, Number(level.value) || 25)),
              });
              await storage.saveChart(c);
              m.close();
              this.openEditor(c);
            },
          },
          '作成してエディタを開く',
        ),
      ),
    );
    title.focus();
  }

  private async importFile() {
    const file = await pickFile('.sus,.json,.txt');
    if (!file) return;
    try {
      const text = await file.text();
      let chart: ChartData;
      if (/\.json$/i.test(file.name) || text.trimStart().startsWith('{')) {
        chart = normalizeChart(JSON.parse(text));
      } else {
        chart = parseSus(text);
      }
      const existing = await this.allCharts();
      if (existing.some((c) => c.id === chart.id)) chart.id = newChartId();
      delete chart.builtin;
      await storage.saveChart(chart);
      toast(`「${chart.title}」を読み込みました（${chart.notes.length} ノーツ）`, 'ok');
      if (chart.audio.type === 'youtube' && !chart.audio.videoId) {
        toast('エディタ右側で YouTube の URL を設定してください', 'info', 5000);
        this.openEditor(chart);
      } else {
        await this.showSelect(chart.id);
      }
    } catch (e) {
      toast('読み込みに失敗しました: ' + (e as Error).message, 'error', 5000);
    }
  }

  private async duplicate(c: ChartData) {
    const copy = cloneChart(c);
    copy.id = newChartId();
    delete copy.builtin;
    copy.title = c.title.replace(/（デモ）$/, '') + '（コピー）';
    await storage.saveChart(copy);
    this.openEditor(copy);
  }

  private async remove(c: ChartData) {
    if (!(await confirmDialog(`「${c.title}」(${c.difficulty.toUpperCase()}) を削除しますか？`, '削除'))) return;
    await storage.deleteChart(c.id);
    await this.showSelect();
  }
}

void new App().init().catch((e) => {
  console.error(e);
  document.body.append(h('pre', { class: 'fatal' }, String(e?.stack ?? e)));
});
