import { DIFFICULTY_COLORS } from '../core/chart';
import { GameResult } from '../game/game';
import { h } from './dom';

export function resultScreen(r: GameResult, newRecord: boolean, onRetry: () => void, onBack: () => void, backLabel: string): HTMLElement {
  const s = r.stats;
  const scoreEl = h('div', { class: 'result-score' }, '0');
  const start = performance.now();
  const anim = () => {
    const k = Math.min(1, (performance.now() - start) / 900);
    scoreEl.textContent = Math.round(r.score * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US');
    if (k < 1 && scoreEl.isConnected) requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);
  const badge = r.allPerfect ? 'ALL PERFECT' : r.fullCombo ? 'FULL COMBO' : r.failed ? 'LIVE FAILED' : 'LIVE CLEAR';
  const row = (label: string, n: number, cls: string) => h('div', { class: 'judge-row ' + cls }, h('span', {}, label), h('span', {}, String(n)));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      window.removeEventListener('keydown', onKey);
      onBack();
    } else if (e.key.toLowerCase() === 'r') {
      window.removeEventListener('keydown', onKey);
      onRetry();
    }
  };
  window.addEventListener('keydown', onKey);

  return h(
    'div',
    { class: 'screen result-screen' },
    h(
      'div',
      { class: 'result-card' },
      h('div', { class: 'result-head' }, h('div', { class: 'result-title' }, r.chart.title), h('span', { class: 'diff-badge', style: { background: DIFFICULTY_COLORS[r.chart.difficulty] } }, `${r.chart.difficulty.toUpperCase()} ${r.chart.level}`)),
      h('div', { class: 'result-badge ' + badge.toLowerCase().replace(' ', '-') }, badge),
      h(
        'div',
        { class: 'result-main' },
        h('div', { class: 'result-rank rank-' + r.rank }, r.rank),
        h(
          'div',
          {},
          h('div', { class: 'result-label' }, 'SCORE'),
          scoreEl,
          newRecord ? h('div', { class: 'new-record' }, 'NEW RECORD!') : null,
          r.autoplay ? h('div', { class: 'note-small' }, 'オートプレイのため記録されません') : null,
          r.partial ? h('div', { class: 'note-small' }, '途中からのテストプレイのため記録されません') : null,
        ),
      ),
      h(
        'div',
        { class: 'judge-table' },
        row('PERFECT', s.perfect, 'perfect'),
        row('GREAT', s.great, 'great'),
        row('GOOD', s.good, 'good'),
        row('BAD', s.bad, 'bad'),
        row('MISS', s.miss, 'miss'),
        h('div', { class: 'judge-row combo' }, h('span', {}, 'MAX COMBO'), h('span', {}, `${s.maxCombo} / ${r.totalCombo}`)),
        h('div', { class: 'judge-row fl' }, h('span', {}, 'FAST / LATE'), h('span', {}, `${s.fast} / ${s.late}`)),
      ),
      h(
        'div',
        { class: 'row center' },
        h('button', { class: 'btn', onclick: () => { window.removeEventListener('keydown', onKey); onRetry(); } }, 'リトライ (R)'),
        h('button', { class: 'btn primary', onclick: () => { window.removeEventListener('keydown', onKey); onBack(); } }, `${backLabel} (Enter)`),
      ),
    ),
  );
}
