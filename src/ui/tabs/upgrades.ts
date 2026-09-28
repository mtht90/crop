import { fmt } from '../../core/format';
import type { Game } from '../../core/game';
import { UPGRADES, UPGRADE_MAP, type UpgradeDef } from '../../data/upgrades';
import { availableUpgrades, buyAllUpgrades, buyUpgrade, upgradeCost } from '../../logic/economy';
import { button, h, setClass, setDisabled, setText } from '../dom';
import type { Tab } from './tab';

const SHOW_MAX = 60;
let listEl: HTMLElement;
let summary: HTMLElement;
let ownedEl: HTMLElement;
let buyAllBtn: HTMLButtonElement;
let key = '';
let cards: Array<{ u: UpgradeDef; el: HTMLElement; btn: HTMLButtonElement }> = [];
let ownedKey = -1;

const KIND_LABEL: Record<string, string> = { tier: '施設強化', click: 'クリック', global: '全体', synergy: 'シナジー' };

function render(g: Game, list: UpgradeDef[]): void {
  listEl.innerHTML = '';
  cards = [];
  for (const u of list) {
    const btn = h('button', { class: 'btn btn-buy' });
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (buyUpgrade(g, u.id)) g.recalcIfDirty();
    });
    const el = h(
      'div',
      { class: `upg-card kind-${u.kind}` },
      h('div', { class: 'upg-icon', text: u.icon }),
      h('div', { class: 'upg-info' }, h('div', { class: 'upg-name' }, h('span', { text: u.name }), h('span', { class: 'tag', text: KIND_LABEL[u.kind] })), h('div', { class: 'upg-desc', text: u.desc(g) })),
      btn,
    );
    cards.push({ u, el, btn });
    listEl.append(el);
  }
  if (list.length === 0) listEl.append(h('p', { class: 'empty', text: '購入できるアップグレードはまだありません。施設を増やしたり星屑を集めると解放されます。' }));
}

export const upgradesTab: Tab = {
  id: 'upgrades',
  label: 'アップグレード',
  icon: '🔧',
  visible: (g) => g.s.run.earned.gte(50) || g.s.stats.snTotal > 0,
  badge: (g) => availableUpgrades(g).some((u) => upgradeCost(g, u).lte(g.s.stardust)),
  mount(root, g) {
    key = '';
    ownedKey = -1;
    summary = h('span', { class: 'muted' });
    buyAllBtn = button('買えるだけ買う', () => {
      buyAllUpgrades(g);
      g.recalcIfDirty();
    }, 'btn btn-primary');
    listEl = h('div', { class: 'upg-list' });
    ownedEl = h('div', { class: 'owned-icons' });
    const details = h('details', { class: 'owned-box' }, h('summary', { text: '購入済みのアップグレード' }), ownedEl);
    root.append(h('div', { class: 'toolbar' }, buyAllBtn, summary), listEl, details);
  },
  update(g) {
    const avail = availableUpgrades(g).slice(0, SHOW_MAX);
    const k = avail.map((u) => u.id).join(',');
    if (k !== key) {
      key = k;
      render(g, avail);
    }
    let affordable = 0;
    for (const c of cards) {
      const cost = upgradeCost(g, c.u);
      const ok = cost.lte(g.s.stardust);
      if (ok) affordable++;
      setText(c.btn, fmt(cost));
      setDisabled(c.btn, !ok);
      setClass(c.btn, 'afford', ok);
    }
    setDisabled(buyAllBtn, affordable === 0);
    setText(summary, `購入済み ${g.s.upgrades.length} / ${UPGRADES.length}${g.mods.noUpgrades ? '(チャレンジにより効果無効)' : ''}`);
    if (ownedKey !== g.s.upgrades.length) {
      ownedKey = g.s.upgrades.length;
      ownedEl.innerHTML = '';
      for (const id of g.s.upgrades) {
        const u = UPGRADE_MAP.get(id);
        if (u) ownedEl.append(h('span', { class: 'owned-icon', text: u.icon, title: `${u.name}\n${u.desc(g)}` }));
      }
    }
  },
};
