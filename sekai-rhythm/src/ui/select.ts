import { ChartData, DIFFICULTY_COLORS, TimingMap, chartLastBeat } from '../core/chart';
import { BestScore } from '../core/storage';
import { h } from './dom';

export interface SelectActions {
  play(c: ChartData, autoplay: boolean): void;
  edit(c: ChartData): void;
  duplicate(c: ChartData): void;
  exportJson(c: ChartData): void;
  remove(c: ChartData): void;
  create(): void;
  importFile(): void;
  settings(): void;
}

function fmtTime(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function countNotes(c: ChartData) {
  let n = 0;
  for (const x of c.notes) n += x.type === 'single' ? 1 : x.points.length;
  return n;
}

function jacket(c: ChartData, size: 'sm' | 'lg') {
  const hue = [...c.title].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
  const style = { background: `linear-gradient(135deg, hsl(${hue},80%,62%), hsl(${(hue + 60) % 360},85%,45%))` };
  if (c.audio.type === 'youtube' && c.audio.videoId) {
    return h('div', { class: `jacket ${size}`, style }, h('img', { src: `https://i.ytimg.com/vi/${c.audio.videoId}/mqdefault.jpg`, alt: '', loading: 'lazy', onerror: (e: Event) => ((e.target as HTMLElement).style.display = 'none') }));
  }
  return h('div', { class: `jacket ${size}`, style }, h('span', {}, [...c.title][0] ?? '♪'));
}

export class SelectScreen {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private detail: HTMLElement;
  private selectedId: string | null;
  private charts: ChartData[] = [];

  constructor(
    private actions: SelectActions,
    private scores: Record<string, BestScore>,
    selectedId: string | null,
  ) {
    this.selectedId = selectedId;
    this.list = h('div', { class: 'song-list' });
    this.detail = h('div', { class: 'song-detail' });
    this.el = h(
      'div',
      { class: 'screen select-screen' },
      h(
        'header',
        { class: 'topbar' },
        h('div', { class: 'logo' }, h('span', { class: 'logo-a' }, 'SEKAI'), h('span', { class: 'logo-b' }, 'RHYTHM')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => actions.create() }, '＋ 新しい譜面'),
          h('button', { class: 'btn', onclick: () => actions.importFile() }, '読み込み (.sus / .json)'),
          h('button', { class: 'btn', onclick: () => actions.settings() }, '⚙ 設定'),
        ),
      ),
      h('div', { class: 'select-body' }, this.list, this.detail),
    );
    window.addEventListener('keydown', this.onKey);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }

  setCharts(charts: ChartData[]) {
    this.charts = charts;
    if (!this.charts.some((c) => c.id === this.selectedId)) this.selectedId = this.charts[0]?.id ?? null;
    this.renderList();
    this.renderDetail();
  }

  private onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-back')) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const i = this.charts.findIndex((c) => c.id === this.selectedId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = Math.max(0, Math.min(this.charts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      this.select(this.charts[n]?.id ?? null);
      this.list.children[n]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && i >= 0) {
      e.preventDefault();
      this.actions.play(this.charts[i], false);
    }
  };

  private select(id: string | null) {
    this.selectedId = id;
    for (const el of this.list.querySelectorAll<HTMLElement>('.song-card')) el.classList.toggle('active', el.dataset.id === id);
    this.renderDetail();
  }

  private renderList() {
    this.list.replaceChildren(
      ...this.charts.map((c) => {
        const best = this.scores[c.id];
        return h(
          'div',
          {
            class: 'song-card' + (c.id === this.selectedId ? ' active' : ''),
            'data-id': c.id,
            onclick: () => this.select(c.id),
            ondblclick: () => this.actions.play(c, false),
          },
          jacket(c, 'sm'),
          h('div', { class: 'song-meta' }, h('div', { class: 'song-title' }, c.title), h('div', { class: 'song-artist' }, c.artist || '—')),
          h(
            'div',
            { class: 'song-right' },
            h('span', { class: 'diff-badge', style: { background: DIFFICULTY_COLORS[c.difficulty] } }, `${c.difficulty.toUpperCase()} ${c.level}`),
            best ? h('span', { class: 'best-mini' }, best.allPerfect ? 'AP' : best.fullCombo ? 'FC' : best.rank) : null,
          ),
        );
      }),
    );
    if (!this.charts.length) this.list.append(h('div', { class: 'empty' }, '譜面がありません。「＋ 新しい譜面」から作成できます。'));
  }

  private renderDetail() {
    const c = this.charts.find((x) => x.id === this.selectedId);
    if (!c) {
      this.detail.replaceChildren();
      return;
    }
    const timing = new TimingMap(c.bpms, c.offset);
    const length = timing.beatToTime(chartLastBeat(c));
    const bpmsSorted = c.bpms.map((b) => b.bpm);
    const bpmText = Math.min(...bpmsSorted) === Math.max(...bpmsSorted) ? String(bpmsSorted[0]) : `${Math.min(...bpmsSorted)}–${Math.max(...bpmsSorted)}`;
    const best = this.scores[c.id];
    const a = this.actions;
    this.detail.replaceChildren(
      jacket(c, 'lg'),
      h('div', { class: 'detail-title' }, c.title),
      h('div', { class: 'detail-artist' }, c.artist || '—'),
      h(
        'div',
        { class: 'detail-grid' },
        h('span', {}, '難易度'),
        h('span', { class: 'diff-badge', style: { background: DIFFICULTY_COLORS[c.difficulty] } }, `${c.difficulty.toUpperCase()} ${c.level}`),
        h('span', {}, '音源'),
        h('span', {}, c.audio.type === 'youtube' ? (c.audio.videoId ? `YouTube (${c.audio.videoId})` : 'YouTube（未設定）') : '内蔵シンセ（オフライン）'),
        h('span', {}, 'BPM'),
        h('span', {}, bpmText),
        h('span', {}, 'ノーツ数'),
        h('span', {}, `${countNotes(c)}（${fmtTime(length)}）`),
        h('span', {}, '譜面作者'),
        h('span', {}, c.charter || '—'),
        h('span', {}, 'ベスト'),
        h('span', {}, best ? `${best.score.toLocaleString()}  ${best.rank}${best.allPerfect ? '  ALL PERFECT' : best.fullCombo ? '  FULL COMBO' : ''}` : '—'),
      ),
      h(
        'div',
        { class: 'detail-actions' },
        h('button', { class: 'btn big primary', onclick: () => a.play(c, false) }, '▶ プレイ'),
        h('button', { class: 'btn', onclick: () => a.play(c, true) }, 'オートプレイ'),
        c.builtin
          ? h('button', { class: 'btn', onclick: () => a.duplicate(c) }, '複製して編集')
          : h('button', { class: 'btn', onclick: () => a.edit(c) }, '✎ 編集'),
        h('button', { class: 'btn', onclick: () => a.exportJson(c) }, '書き出し'),
        c.builtin ? null : h('button', { class: 'btn danger', onclick: () => a.remove(c) }, '削除'),
      ),
      h('div', { class: 'hint' }, '↑↓ で選択 / Enter でプレイ / プレイ中 Esc でポーズ・F11 で全画面'),
    );
  }
}
