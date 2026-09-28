import { fmt, fmtTime } from '../../core/format';
import type { Game } from '../../core/game';
import { DESTINATIONS, DEST_MAP, RARITY_CLASS, RARITY_NAMES, RELICS } from '../../data/relics';
import { destinationUnlocked, expeditionDuration, expeditionsUnlocked, launchExpedition, syncSlots } from '../../logic/expeditions';
import { h, setText, setWidth } from '../dom';
import type { Tab } from './tab';

let slotsEl: HTMLElement;
let relicsEl: HTMLElement;
let logEl: HTMLElement;
let infoEl: HTMLElement;
let destEl: HTMLElement;
let slotKey = '';
let relicKey = '';
let logKey = '';
let slotRefs: Array<{ bar: HTMLElement; time: HTMLElement } | null> = [];
let selected = 'e0';

function renderSlots(g: Game): void {
  slotsEl.innerHTML = '';
  slotRefs = [];
  const n = Math.floor(g.mods.expSlots);
  for (let i = 0; i < n; i++) {
    const sl = g.s.expeditions.slots[i];
    if (sl) {
      const d = DEST_MAP.get(sl.dest);
      const bar = h('div', { class: 'bar-fill' });
      const time = h('div', { class: 'muted' });
      slotRefs.push({ bar, time });
      slotsEl.append(h('div', { class: 'exp-slot busy' }, h('div', { class: 'exp-slot-title', text: `艦隊 ${i + 1}: ${d?.icon ?? ''} ${d?.name ?? ''} へ航行中` }), h('div', { class: 'bar' }, bar), time));
    } else {
      slotRefs.push(null);
      const btn = h('button', { class: 'btn btn-primary', text: '出発' });
      btn.type = 'button';
      btn.addEventListener('click', () => {
        launchExpedition(g, i, selected);
        slotKey = '';
      });
      slotsEl.append(h('div', { class: 'exp-slot' }, h('div', { class: 'exp-slot-title', text: `艦隊 ${i + 1}: 待機中` }), btn));
    }
  }
}

function renderDestinations(g: Game, root: HTMLElement): void {
  root.innerHTML = '';
  for (const d of DESTINATIONS) {
    const unlocked = destinationUnlocked(g, d);
    const card = h(
      'div',
      { class: `exp-dest${d.id === selected ? ' selected' : ''}${unlocked ? '' : ' locked'}` },
      h('div', { class: 'exp-dest-name', text: `${d.icon} ${unlocked ? d.name : '???'}` }),
      h('div', { class: 'muted', text: unlocked ? `${fmtTime(expeditionDuration(g, d))} / 遺物 ${d.rolls} 個` : `遠征 ${d.unlockAt} 回で解放` }),
    );
    if (unlocked) {
      card.addEventListener('click', () => {
        selected = d.id;
        slotKey = '';
      });
    }
    root.append(card);
  }
}

function renderRelics(g: Game): void {
  relicsEl.innerHTML = '';
  const power = g.mods.relicPower;
  for (const r of RELICS) {
    const count = g.s.expeditions.relics[r.id] ?? 0;
    if (count <= 0) {
      relicsEl.append(h('div', { class: `relic unknown ${RARITY_CLASS[r.rarity]}` }, h('div', { class: 'relic-icon', text: '？' }), h('div', { class: 'relic-name', text: `未発見の${RARITY_NAMES[r.rarity]}` })));
      continue;
    }
    relicsEl.append(
      h('div', { class: `relic ${RARITY_CLASS[r.rarity]}`, title: r.desc },
        h('div', { class: 'relic-icon', text: r.icon }),
        h('div', { class: 'relic-name', text: `${r.name} ×${count}` }),
        h('div', { class: 'relic-eff', text: r.effect(count * power) }),
      ),
    );
  }
}

export const expeditionsTab: Tab = {
  id: 'expeditions',
  label: '遠征',
  icon: '🚀',
  visible: (g) => expeditionsUnlocked(g),
  badge: (g) => g.s.expeditions.slots.slice(0, Math.floor(g.mods.expSlots)).some((s) => !s),
  mount(root, g) {
    slotKey = '';
    relicKey = '';
    logKey = '';
    selected = g.s.expeditions.lastDest;
    infoEl = h('div', { class: 'muted' });
    slotsEl = h('div', { class: 'exp-slots' });
    destEl = h('div', { class: 'exp-dests' });
    relicsEl = h('div', { class: 'relic-grid' });
    logEl = h('ul', { class: 'exp-log' });
    root.append(
      h('div', { class: 'panel' }, h('h3', { text: '行き先' }), destEl, h('h3', { text: '艦隊' }), slotsEl, infoEl),
      h('div', { class: 'panel' }, h('h3', { text: '遺物コレクション' }), h('p', { class: 'hint', text: '遺物は同じものを重ねるほど効果が強くなり、転生しても失われません。' }), relicsEl),
      h('div', { class: 'panel' }, h('h3', { text: '航海日誌' }), logEl),
    );
    renderDestinations(g, destEl);
  },
  update(gg) {
    syncSlots(gg);
    const sk = gg.s.expeditions.slots.map((s) => (s ? s.dest + s.end : '-')).join('|') + selected + gg.s.stats.expeditionsDone + Math.floor(gg.mods.expSlots);
    if (sk !== slotKey) {
      slotKey = sk;
      renderSlots(gg);
      renderDestinations(gg, destEl);
    }
    const now = gg.now();
    gg.s.expeditions.slots.forEach((sl, i) => {
      const ref = slotRefs[i];
      if (!sl || !ref) return;
      setWidth(ref.bar, (now - sl.start) / (sl.end - sl.start));
      setText(ref.time, `帰還まで ${fmtTime((sl.end - now) / 1000)}`);
    });
    const rk = JSON.stringify(gg.s.expeditions.relics) + gg.mods.relicPower;
    if (rk !== relicKey) {
      relicKey = rk;
      renderRelics(gg);
    }
    const lk = String(gg.s.stats.expeditionsDone);
    if (lk !== logKey) {
      logKey = lk;
      logEl.innerHTML = '';
      for (const line of gg.s.expeditions.log) logEl.append(h('li', { text: line }));
    }
    setText(infoEl, `遠征速度 ×${gg.mods.expSpeed.toFixed(2)} · 幸運 +${(gg.mods.expLuck * 100).toFixed(0)}% · 報酬の星屑は帰還時の毎秒生産 (${fmt(gg.sps)}/秒) に比例 · 完了 ${gg.s.stats.expeditionsDone} 回`);
  },
};
