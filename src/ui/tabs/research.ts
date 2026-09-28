import { fmtTime } from '../../core/format';
import type { Game } from '../../core/game';
import { RESEARCH, RESEARCH_BRANCHES, RESEARCH_MAP, type ResearchDef } from '../../data/research';
import { cancelResearch, queueCapacity, researchLevel, researchStatus, researchTime, researchUnlocked, startResearch, prereqsMet } from '../../logic/research';
import { h, setShown, setText, setWidth } from '../dom';
import type { Tab } from './tab';

let curName: HTMLElement;
let curTime: HTMLElement;
let curBar: HTMLElement;
let queueEl: HTMLElement;
let speedEl: HTMLElement;
let treeEl: HTMLElement;
let key = '';
let hideDone = false;

function levelLabel(r: ResearchDef, lvl: number): string {
  if (r.max === 1) return '';
  return r.max === Infinity ? ` Lv.${lvl}` : ` Lv.${lvl}/${r.max}`;
}

function renderTree(g: Game): void {
  treeEl.innerHTML = '';
  for (const branch of RESEARCH_BRANCHES) {
    const nodes = RESEARCH.filter((r) => r.branch === branch);
    const col = h('div', { class: 'res-branch' }, h('h3', { text: branch }));
    for (const r of nodes) {
      const st = researchStatus(g, r);
      if (hideDone && st === 'done') continue;
      const lvl = researchLevel(g, r.id);
      const reqNames = r.requires.map((id) => RESEARCH_MAP.get(id)?.name ?? id);
      const lockText = st === 'locked'
        ? `前提: ${[...reqNames, ...(r.cond && !r.cond(g) && r.condDesc ? [r.condDesc] : [])].join('、')}`
        : '';
      const card = h(
        'div',
        { class: `res-node st-${st}` },
        h('div', { class: 'res-head' }, h('span', { class: 'res-icon', text: r.icon }), h('span', { class: 'res-name', text: r.name + levelLabel(r, lvl) })),
        h('div', { class: 'res-desc', text: r.desc }),
        lvl > 0 && r.max !== 1 ? h('div', { class: 'res-effect', text: `現在: ${r.effect(lvl)}` }) : null,
        st === 'locked' ? h('div', { class: 'res-lock', text: lockText }) : null,
        st === 'available' ? h('div', { class: 'res-time', text: `所要 ${fmtTime(researchTime(g, r))}` }) : null,
        st === 'done' ? h('div', { class: 'res-done', text: '✓ 研究完了' }) : null,
        st === 'active' ? h('div', { class: 'res-time', text: '研究中…' }) : null,
        st === 'queued' ? h('div', { class: 'res-time', text: '待機中' }) : null,
      );
      if (st === 'available') {
        card.addEventListener('click', () => {
          startResearch(g, r.id);
          key = '';
        });
        card.title = 'クリックで研究開始 / キューに追加';
      } else if (st === 'queued' || st === 'active') {
        card.addEventListener('click', () => {
          cancelResearch(g, r.id);
          key = '';
        });
        card.title = 'クリックで取り消し';
      }
      col.append(card);
    }
    treeEl.append(col);
  }
}

export const researchTab: Tab = {
  id: 'research',
  label: '研究',
  icon: '🔬',
  visible: (g) => researchUnlocked(g),
  badge: (g) => !g.s.research.current && RESEARCH.some((r) => researchStatus(g, r) === 'available'),
  mount(root, g) {
    key = '';
    curName = h('div', { class: 'res-cur-name' });
    curTime = h('div', { class: 'muted' });
    curBar = h('div', { class: 'bar-fill' });
    queueEl = h('div', { class: 'res-queue' });
    speedEl = h('div', { class: 'muted' });
    const hideBox = h('input', { attrs: { type: 'checkbox' } });
    hideBox.checked = hideDone;
    hideBox.addEventListener('change', () => {
      hideDone = hideBox.checked;
      key = '';
    });
    treeEl = h('div', { class: 'res-tree' });
    root.append(
      h('div', { class: 'panel' },
        h('div', { class: 'res-cur' }, curName, curTime),
        h('div', { class: 'bar' }, curBar),
        queueEl,
        h('div', { class: 'toolbar' }, speedEl, h('label', { class: 'check' }, hideBox, h('span', { text: '完了済みを隠す' }))),
      ),
      h('p', { class: 'hint', text: '研究は現実の時間で進み、放置中も止まりません。研究の成果は転生してもずっと残ります。' }),
      treeEl,
    );
    void g;
  },
  update(g) {
    const s = g.s.research;
    const cur = s.current ? RESEARCH_MAP.get(s.current) : undefined;
    if (cur) {
      const need = cur.time(researchLevel(g, cur.id));
      setText(curName, `${cur.icon} ${cur.name}${levelLabel(cur, researchLevel(g, cur.id) + 1)}`);
      setText(curTime, `残り ${fmtTime((need - s.progress) / g.mods.researchSpeed)}`);
      setWidth(curBar, s.progress / need);
    } else {
      setText(curName, '研究していません');
      setText(curTime, '下のツリーから研究を選んでください');
      setWidth(curBar, 0);
    }
    const qText = s.queue.map((id) => RESEARCH_MAP.get(id)?.name ?? id).join(' → ');
    setText(queueEl, `キュー (${s.queue.length}/${queueCapacity(g)}): ${qText || 'なし'}`);
    setShown(queueEl, queueCapacity(g) > 0);
    setText(speedEl, `研究速度 ×${g.mods.researchSpeed.toFixed(2)}`);
    const k = RESEARCH.map((r) => researchStatus(g, r)[0] + researchLevel(g, r.id) + (prereqsMet(g, r) ? 'y' : 'n')).join('') + (hideDone ? 'h' : '') + Math.round(g.mods.researchSpeed * 100);
    if (k !== key) {
      key = k;
      renderTree(g);
    }
  },
};
