import './styles.css';
import { audioCtx } from './audio/context';
import { Sfx } from './audio/sfx';
import { builtinCharts } from './charts/samples';
import { ChartData, DIFFICULTIES, Difficulty, cloneChart, emptyChart, newChartId, normalizeChart, parseYouTubeId } from './core/chart';
import { Settings } from './core/settings';
import { storage } from './core/storage';
import { parseSus } from './core/sus';
import { Convert6Options, ThinLevel, convertTo6 } from './core/convert6';
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
        convert6: (c) => void this.convert6(c),
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

  /** 6レーン変換の設定を聞く。キャンセルなら null */
  private askConvert6(title: string, allowKeep12: boolean): Promise<{ keep12: boolean; make6: boolean; opts: Convert6Options } | null> {
    return new Promise((resolve) => {
      let result: { keep12: boolean; make6: boolean; opts: Convert6Options } | null = null;
      const m = modal(title, { onClose: () => resolve(result) });
      const chord = h(
        'select',
        {},
        h('option', { value: '2', selected: true }, '2（両手1本ずつ・おすすめ）'),
        h('option', { value: '3' }, '3'),
        h('option', { value: '0' }, '制限なし（元の譜面のまま）'),
      );
      const thin = h(
        'select',
        {},
        h('option', { value: 'none', selected: true }, 'なし（元の密度のまま）'),
        h('option', { value: 'light' }, 'やさしめ（8分より細かいノーツを省く）'),
        h('option', { value: 'easy' }, 'かんたん（4分より細かいノーツを省く）'),
      );
      const field = (label: string, input: HTMLElement) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
      const done = (keep12: boolean, make6: boolean) => {
        result = { keep12, make6, opts: { maxChord: Number(chord.value), thin: thin.value as ThinLevel } };
        m.close();
      };
      m.body.append(
        h('p', { class: 'convert-report' }, '12レーンの譜面を 6 キー用に変換します。幅の広いノーツは中心に近い 1 キーに、動くスライドはキー単位の階段に、スライドで押さえているキーと重なるノーツは隣のキーに移します。'),
        field('同時押しの上限（押しっぱなしのスライドも 1 と数える）', chord),
        field('間引き', thin),
        h(
          'div',
          { class: 'choice-list' },
          h('button', { class: 'btn primary', onclick: () => done(false, true) }, allowKeep12 ? '6レーンに変換して読み込む' : '6レーン版を作成'),
          allowKeep12 ? h('button', { class: 'btn', onclick: () => done(true, true) }, '12レーン版と6レーン版の両方を読み込む') : null,
          allowKeep12 ? h('button', { class: 'btn', onclick: () => done(true, false) }, '12レーンのまま読み込む') : null,
        ),
      );
    });
  }

  private async saveConverted(src: ChartData, opts: Convert6Options): Promise<ChartData> {
    const { chart, report } = convertTo6(src, opts);
    chart.title = src.title.replace(/［6レーン］$/, '') + '［6レーン］';
    await storage.saveChart(chart);
    toast(`6レーン版を作成: ${report.input} → ${report.output} ノーツ（省略 ${report.dropped} / 位置調整 ${report.moved}）`, 'ok', 5000);
    return chart;
  }

  private async convert6(c: ChartData) {
    const ans = await this.askConvert6('6レーン版を作成', false);
    if (!ans) return;
    const made = await this.saveConverted(c, ans.opts);
    await this.showSelect(made.id);
  }

  private async importFile() {
    const file = await pickFile('.sus,.json,.txt');
    if (!file) return;
    let chart: ChartData;
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name) || text.trimStart().startsWith('{')) {
        chart = normalizeChart(JSON.parse(text));
      } else {
        chart = parseSus(text);
      }
    } catch (e) {
      toast('読み込みに失敗しました: ' + (e as Error).message, 'error', 5000);
      return;
    }
    const existing = await this.allCharts();
    if (existing.some((c) => c.id === chart.id)) chart.id = newChartId();
    delete chart.builtin;
    let selectId = chart.id;
    if (chart.keyMode === 6) {
      await storage.saveChart(chart);
    } else {
      const ans = await this.askConvert6(`「${chart.title}」を読み込み（${chart.notes.length} ノーツ）`, true);
      if (!ans) return;
      if (ans.keep12) await storage.saveChart(chart);
      if (ans.make6) selectId = (await this.saveConverted(chart, ans.opts)).id;
    }
    if (chart.audio.type === 'youtube' && !chart.audio.videoId) {
      toast('音源が未設定です。「✎ 編集」の右側で YouTube の URL とオフセットを設定してください', 'info', 6000);
    }
    await this.showSelect(selectId);
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
