import { Decimal } from '../../core/decimal';
import { fmtMult } from '../../core/format';
import type { Game } from '../../core/game';
import { ACHIEVEMENTS, type AchCategory } from '../../data/achievements';
import { h, setClass, setText } from '../dom';
import type { Tab } from './tab';

let gridEl: HTMLElement;
let summary: HTMLElement;
let filter: AchCategory | 'all' = 'all';
let key = '';
let chips: Array<{ cat: AchCategory | 'all'; el: HTMLButtonElement }> = [];

const CATEGORIES: AchCategory[] = ['星屑', '生産', '施設', 'クリック', '彗星', 'アップグレード', '転生', '研究', 'チャレンジ', '遠征', '時間', '秘密'];

function render(g: Game): void {
  gridEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const a of ACHIEVEMENTS) {
    if (filter !== 'all' && a.category !== filter) continue;
    const got = g.achSet.has(a.id);
    const hidden = a.secret && !got;
    frag.append(h('div', {
      class: `ach${got ? ' got' : ''}`,
      text: hidden ? '？' : a.icon,
      title: hidden ? '秘密の実績' : `${a.name}\n${a.desc}${got ? '\n✓ 達成' : ''}`,
    }));
  }
  gridEl.append(frag);
}

export const achievementsTab: Tab = {
  id: 'achievements',
  label: '実績',
  icon: '🏅',
  visible: () => true,
  mount(root, g) {
    key = '';
    summary = h('div', { class: 'muted' });
    chips = [];
    const bar = h('div', { class: 'toolbar wrap' });
    for (const cat of ['all', ...CATEGORIES] as const) {
      const c = h('button', { class: 'chip', text: cat === 'all' ? 'すべて' : cat });
      c.type = 'button';
      c.addEventListener('click', () => {
        filter = cat;
        key = '';
      });
      chips.push({ cat, el: c });
      bar.append(c);
    }
    gridEl = h('div', { class: 'ach-grid' });
    root.append(summary, bar, gridEl, h('p', { class: 'hint', text: 'アイコンにカーソルを合わせる (長押しする) と詳細が表示されます。' }));
    void g;
  },
  update(g) {
    const n = g.s.achievements.length;
    const bonus = g.mods.noAch ? '(チャレンジにより無効)' : fmtMult(Decimal.pow(1 + g.mods.achPer, n));
    setText(summary, `達成 ${n} / ${ACHIEVEMENTS.length} · 1個あたり +${(g.mods.achPer * 100).toFixed(1)}% (複利) → 全ての生産 ${bonus}`);
    for (const c of chips) setClass(c.el, 'active', c.cat === filter);
    const k = `${filter}|${n}`;
    if (k !== key) {
      key = k;
      render(g);
    }
  },
};
