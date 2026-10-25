import { coolerCapacity, sellFromCooler } from '../core/progress';
import type { SaveData } from '../core/save';
import { SPECIES_BY_ID } from '../data/species';
import { SPOTS } from '../data/spots';
import { COOLER_LEVELS, GEAR, LINES, LURES, REELS, RODS, LB_TO_KG } from '../data/tackle';
import { formatWeight, priceOf } from '../sim/individual';
import { h, yen } from './dom';
import type { Modals } from './modal';

export interface ShopCallbacks {
  onChange(): void;
  rest(hours: number | 'morning'): void;
  coin(): void;
}

type Tab = 'sell' | 'rods' | 'reels' | 'lines' | 'lures' | 'gear' | 'cooler' | 'spots' | 'rest';

const TAB_LABEL: Record<Tab, string> = {
  sell: '売却',
  rods: '竿',
  reels: 'リール',
  lines: 'ライン',
  lures: 'ルアー・エサ',
  gear: '小物',
  cooler: 'クーラー',
  spots: '入漁券',
  rest: '休憩',
};

export function openShop(modals: Modals, save: SaveData, cb: ShopCallbacks): void {
  let tab: Tab = save.cooler.length ? 'sell' : 'rods';
  const money = h('span', { class: 'price', style: 'font-size:18px' });
  const m = modals.open('釣り小屋', { headerExtra: [money] });
  const tabs = h('div', { class: 'tabs' });
  const content = h('div', { style: 'margin-top:14px' });
  m.body.append(tabs, content);

  const buy = (price: number, apply: () => void) => {
    if (save.money < price) return;
    save.money -= price;
    apply();
    cb.coin();
    cb.onChange();
    render();
  };

  const item = (name: string, spec: string, right: Node, action: Node, on = false) =>
    h('div', { class: `item${on ? ' on' : ''}` }, h('div', null, h('div', { class: 'name', text: name }), h('div', { class: 'spec', text: spec })), right, action);

  const render = () => {
    money.textContent = yen(save.money);
    tabs.replaceChildren(
      ...(Object.keys(TAB_LABEL) as Tab[]).map((t) =>
        h('button', {
          class: t === tab ? 'on' : '',
          text: t === 'sell' ? `${TAB_LABEL[t]}（${save.cooler.length}）` : TAB_LABEL[t],
          onclick: () => {
            tab = t;
            render();
          },
        }),
      ),
    );
    const list = h('div', { class: 'list' });
    switch (tab) {
      case 'sell': {
        if (!save.cooler.length) {
          list.append(h('div', { class: 'muted', text: 'クーラーは空です。' }));
          break;
        }
        const total = save.cooler.reduce((a, f) => a + priceOf(SPECIES_BY_ID[f.speciesId], f), 0);
        list.append(
          h(
            'div',
            { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px' },
            h('span', { class: 'muted', text: `クーラー ${save.cooler.length}/${coolerCapacity(save)}` }),
            h('button', {
              class: 'primary',
              text: `すべて売る ${yen(total)}`,
              onclick: () => {
                sellFromCooler(save, save.cooler.map((f) => f.uid));
                cb.coin();
                cb.onChange();
                render();
              },
            }),
          ),
        );
        for (const f of save.cooler) {
          const s = SPECIES_BY_ID[f.speciesId];
          const variant = [s.colors.find((c) => c.id === f.colorId)?.name, s.patterns.find((p) => p.id === f.patternId)?.name].filter(Boolean).join('・');
          list.append(
            item(
              `${s.name}${variant ? `【${variant}】` : ''}`,
              `${f.length.toFixed(1)}cm / ${formatWeight(f.weight)} / グレード${f.grade}`,
              h('span', { class: 'price', text: yen(priceOf(s, f)) }),
              h('button', {
                text: '売る',
                onclick: () => {
                  sellFromCooler(save, [f.uid]);
                  cb.coin();
                  cb.onChange();
                  render();
                },
              }),
            ),
          );
        }
        break;
      }
      case 'rods':
        for (const r of RODS) {
          const owned = save.owned.rods.includes(r.id);
          list.append(
            item(r.name, `${r.desc}　飛距離${r.cast}m・パワー${r.power}kg・クッション${Math.round(r.cushion * 100)}・感度${r.sensitivity}`, h('span', { class: 'price', text: owned ? '所持' : yen(r.price) }), owned ? h('span') : h('button', { text: '買う', disabled: save.money < r.price, onclick: () => buy(r.price, () => save.owned.rods.push(r.id)) })),
          );
        }
        break;
      case 'reels':
        for (const r of REELS) {
          const owned = save.owned.reels.includes(r.id);
          list.append(
            item(r.name, `${r.desc}　最大ドラグ${r.dragMax}kg・巻取${r.speed}m/s・糸巻量${r.capacity}m`, h('span', { class: 'price', text: owned ? '所持' : yen(r.price) }), owned ? h('span') : h('button', { text: '買う', disabled: save.money < r.price, onclick: () => buy(r.price, () => save.owned.reels.push(r.id)) })),
          );
        }
        break;
      case 'lines':
        for (const l of LINES) {
          const owned = save.owned.lines.includes(l.id);
          list.append(
            item(l.name, `${l.desc}　強度${(l.lb * LB_TO_KG).toFixed(1)}kg・見えにくさ${Math.round((2 - l.visibility) * 50)}・耐摩耗${Math.round(100 / l.abrasion)}`, h('span', { class: 'price', text: owned ? '所持' : yen(l.price) }), owned ? h('span') : h('button', { text: '買う', disabled: save.money < l.price, onclick: () => buy(l.price, () => save.owned.lines.push(l.id)) })),
          );
        }
        break;
      case 'gear':
        for (const g of GEAR) {
          const owned = save.gear.includes(g.id);
          list.append(item(g.name, g.desc, h('span', { class: 'price', text: owned ? '所持' : yen(g.price) }), owned ? h('span') : h('button', { text: '買う', disabled: save.money < g.price, onclick: () => buy(g.price, () => save.gear.push(g.id)) })));
        }
        break;
      case 'lures':
        for (const l of LURES) {
          const n = save.owned.lures[l.id] ?? 0;
          list.append(
            item(
              l.pack ? `${l.name}（${l.pack}個入り）` : l.name,
              l.desc,
              h('span', { class: 'price', text: `${yen(l.price)}　所持 ${n}` }),
              h('button', { text: '買う', disabled: save.money < l.price, onclick: () => buy(l.price, () => (save.owned.lures[l.id] = n + (l.pack ?? 1))) }),
            ),
          );
        }
        break;
      case 'cooler':
        COOLER_LEVELS.forEach((c, i) => {
          const owned = save.coolerLevel >= i;
          const next = i === save.coolerLevel + 1;
          list.append(
            item(`クーラーボックス Lv.${i + 1}`, `${c.capacity}匹まで保管できる`, h('span', { class: 'price', text: owned ? '所持' : yen(c.price) }), next ? h('button', { text: '買う', disabled: save.money < c.price, onclick: () => buy(c.price, () => (save.coolerLevel = i)) }) : h('span')),
          );
        });
        break;
      case 'spots':
        for (const s of SPOTS.filter((x) => !x.expansion)) {
          const owned = save.spots.includes(s.id);
          list.append(
            item(
              s.name,
              s.desc,
              h('span', { class: 'price', text: owned ? '入漁券あり' : s.implemented ? yen(s.price) : '準備中' }),
              owned || !s.implemented ? h('span') : h('button', { text: '買う', disabled: save.money < s.price, onclick: () => buy(s.price, () => save.spots.push(s.id)) }),
            ),
          );
        }
        list.append(h('div', { class: 'muted small', style: 'margin-top:8px', text: '渓流・港/磯・沖合は今後のアップデートで開放予定。マップ(M)ではさらに先の未開拓エリアも確認できます。' }));
        break;
      case 'rest':
        list.append(
          item('ひと休み', 'ゲーム内で1時間進める', h('span'), h('button', { text: '1時間', onclick: () => cb.rest(1) })),
          item('仮眠', 'ゲーム内で3時間進める', h('span'), h('button', { text: '3時間', onclick: () => cb.rest(3) })),
          item('眠る', '翌朝5時（朝マヅメ）まで眠る', h('span'), h('button', { text: '朝まで', onclick: () => cb.rest('morning') })),
        );
        break;
    }
    content.replaceChildren(list);
  };
  render();
}
