import { coolerCapacity } from '../core/progress';
import type { SaveData } from '../core/save';
import { SPECIES_BY_ID } from '../data/species';
import type { FishPreview } from '../render/preview';
import { formatWeight, priceOf } from '../sim/individual';
import { openDex } from './dexPanel';
import { h, yen } from './dom';
import { openMap, openPause, openTackle, type PauseCallbacks } from './menus';
import type { ModalHandle, Modals } from './modal';

export type MenuTab = 'dex' | 'tackle' | 'cooler' | 'map' | 'settings';

const TABS: { id: MenuTab; label: string; key: string }[] = [
  { id: 'dex', label: '図鑑', key: 'Tab' },
  { id: 'tackle', label: 'タックル', key: 'KeyI' },
  { id: 'cooler', label: 'クーラー', key: '' },
  { id: 'map', label: '地図', key: 'KeyM' },
  { id: 'settings', label: '設定', key: '' },
];

export interface MenuContext {
  save: SaveData;
  preview: FishPreview;
  onTackle(): void;
  onTravel(id: string): void;
  pause: PauseCallbacks;
}

/** クーラーの中身：釣った魚を大きく並べる */
function renderCooler(m: ModalHandle, save: SaveData, preview: FishPreview): void {
  const fish = save.cooler;
  const total = fish.reduce((a, f) => a + priceOf(SPECIES_BY_ID[f.speciesId], f), 0);
  m.body.append(
    h('div', { class: 'cooler-top' }, h('b', { text: `${fish.length} / ${coolerCapacity(save)}` }), h('span', { class: 'muted', text: '匹' }), h('span', { class: 'cooler-sum' }, '売ると ', h('b', { text: yen(total) }))),
    fish.length
      ? h(
          'div',
          { class: 'cooler-grid' },
          ...fish.map((f) => {
            const s = SPECIES_BY_ID[f.speciesId];
            const img = h('img');
            img.src = preview.thumbnail(s, f.colorId, f.patternId, false);
            return h(
              'div',
              { class: 'cooler-card' },
              img,
              h('div', { class: 'cn' }, h('b', { text: s.name }), h('i', { text: `${f.length.toFixed(1)}cm` })),
              h('div', { class: 'cm muted small' }, `${formatWeight(f.weight)}・${f.grade}`, h('span', { text: yen(priceOf(s, f)) })),
            );
          }),
        )
      : h('div', { class: 'muted empty', text: 'クーラーは空です。釣った魚をキープするとここに入ります。' }),
  );
}

/** 図鑑・タックル・クーラー・地図・設定をまとめた全画面のメニュー */
export function openMenu(modals: Modals, ctx: MenuContext, tab: MenuTab): void {
  const money = h('span', { class: 'menu-money', text: yen(ctx.save.money) });
  let current = tab;
  let m: ModalHandle;
  const show = (t: MenuTab) => {
    current = t;
    ctx.preview.unmount();
    m.body.replaceChildren();
    m.footer.replaceChildren();
    m.body.className = `body tab-${t}`;
    money.textContent = yen(ctx.save.money);
    if (t === 'dex') openDex(modals, ctx.preview, ctx.save, m);
    else if (t === 'tackle') openTackle(modals, ctx.save, ctx.onTackle, m);
    else if (t === 'cooler') renderCooler(m, ctx.save, ctx.preview);
    else if (t === 'map') openMap(modals, ctx.save, ctx.onTravel, m);
    else openPause(modals, ctx.save, ctx.pause, m);
  };
  m = modals.open('メニュー', {
    tabs: TABS,
    tab,
    onTab: (id) => show(id as MenuTab),
    headerExtra: [money],
    closeKey: TABS.find((t) => t.id === tab)?.key || undefined,
    onClose: () => ctx.preview.unmount(),
  });
  show(current);
}
