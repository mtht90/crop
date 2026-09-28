import { fmt, fmtRate } from '../../core/format';
import type { Game } from '../../core/game';
import { BUILDINGS } from '../../data/buildings';
import { buildingCost, buildingVisible, buyBuilding, maxAffordable } from '../../logic/economy';
import { h, setClass, setDisabled, setShown, setText } from '../dom';
import type { Tab } from './tab';

interface Row {
  el: HTMLElement;
  owned: HTMLElement;
  prod: HTMLElement;
  btn: HTMLButtonElement;
  btnCount: HTMLElement;
  btnCost: HTMLElement;
}

let rows: Row[] = [];
let teaser: HTMLElement;
let amountBtns: HTMLButtonElement[] = [];

const AMOUNTS: Array<[number, string]> = [[1, '×1'], [10, '×10'], [100, '×100'], [-1, '最大']];

function purchaseCount(g: Game, i: number): number {
  const a = g.s.settings.buyAmount;
  return a < 0 ? Math.max(1, maxAffordable(g, i)) : a;
}

export const buildingsTab: Tab = {
  id: 'buildings',
  label: '施設',
  icon: '🏗️',
  visible: () => true,
  mount(root, g) {
    rows = [];
    amountBtns = AMOUNTS.map(([n, label]) => {
      const b = h('button', { class: 'chip', text: label });
      b.type = 'button';
      b.addEventListener('click', () => {
        g.s.settings.buyAmount = n;
      });
      return b;
    });
    root.append(h('div', { class: 'toolbar' }, h('span', { class: 'muted', text: '購入数' }), ...amountBtns));
    const list = h('div', { class: 'bld-list' });
    for (const b of BUILDINGS) {
      const owned = h('div', { class: 'bld-owned' });
      const prod = h('div', { class: 'bld-prod' });
      const btnCount = h('span', { class: 'buy-count' });
      const btnCost = h('span', { class: 'buy-cost' });
      const btn = h('button', { class: 'btn btn-buy' }, btnCount, btnCost);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        buyBuilding(g, b.index, g.s.settings.buyAmount);
        g.recalcIfDirty();
      });
      const el = h(
        'div',
        { class: 'bld-row' },
        h('div', { class: 'bld-icon', text: b.icon }),
        h('div', { class: 'bld-info' }, h('div', { class: 'bld-name', text: b.name }), h('div', { class: 'bld-desc', text: b.desc }), prod),
        owned,
        btn,
      );
      rows.push({ el, owned, prod, btn, btnCount, btnCost });
      list.append(el);
    }
    teaser = h('div', { class: 'bld-row bld-teaser' }, h('div', { class: 'bld-icon', text: '❓' }), h('div', { class: 'bld-info' }, h('div', { class: 'bld-name', text: '??? — 未知の施設' }), h('div', { class: 'bld-desc', text: 'もっと星屑を集めると姿を現す。' })));
    list.append(teaser);
    root.append(list);
  },
  update(g) {
    AMOUNTS.forEach(([n], k) => setClass(amountBtns[k], 'active', g.s.settings.buyAmount === n));
    let lastVisible = -1;
    const total = g.sps;
    for (const b of BUILDINGS) {
      const r = rows[b.index];
      const vis = buildingVisible(g, b.index);
      setShown(r.el, vis);
      if (!vis) continue;
      lastVisible = b.index;
      const owned = g.s.buildings[b.index];
      setText(r.owned, owned.toLocaleString('en-US'));
      const disabledByChallenge = b.index > g.mods.maxBuildingIndex;
      setClass(r.el, 'bld-disabled', disabledByChallenge);
      if (owned > 0) {
        const p = g.bldSps[b.index];
        const share = total.gt(0) ? p.div(total).toNumber() : 0;
        setText(r.prod, disabledByChallenge ? 'チャレンジの制約で停止中' : `1基 ${fmtRate(p.div(owned))}/秒 · 合計 ${fmtRate(p)}/秒 (${(share * 100).toFixed(1)}%)`);
      } else {
        setText(r.prod, `1基 ${fmtRate(b.baseProd.mul(g.mods.building[b.index]).mul(g.mods.global))}/秒 (目安)`);
      }
      const n = purchaseCount(g, b.index);
      const cost = buildingCost(g, b.index, n);
      const afford = cost.lte(g.s.stardust);
      setText(r.btnCount, `+${n.toLocaleString('en-US')}`);
      setText(r.btnCost, fmt(cost));
      setDisabled(r.btn, !afford);
      setClass(r.btn, 'afford', afford);
    }
    setShown(teaser, lastVisible >= 0 && lastVisible < BUILDINGS.length - 1);
  },
};
