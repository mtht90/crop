import { Decimal } from '../../core/decimal';
import { fmt, fmtMult, fmtTime } from '../../core/format';
import type { Game } from '../../core/game';
import type { LayerId } from '../../core/state';
import { BALANCE } from '../../data/balance';
import { shopItemsFor, type ShopItem } from '../../data/shops';
import { LAYER_INFO, buyShopItem, layerCurrency, layerGain, layerShop, layerUnlocked, nextGainAt } from '../../logic/prestige';
import { prestigeWithConfirm, RESET_TEXT } from '../actions';
import { h, setClass, setDisabled, setText, setWidth } from '../dom';
import type { Tab } from './tab';

function bonusText(g: Game, layer: LayerId): string {
  const s = g.s;
  switch (layer) {
    case 'sn':
      return g.mods.noCore
        ? '星核ボーナス: チャレンジにより無効'
        : `この銀河で得た星核 ${fmt(s.sn.coresGalaxy)} 個 → 全ての生産 ${fmtMult(s.sn.coresGalaxy.mul(g.mods.corePer).add(1))} (1個あたり +${(g.mods.corePer * 100).toFixed(1)}%)`;
    case 'galaxy':
      return `この宇宙で得たダークマター ${fmt(s.galaxy.dmCrunch)} → 全ての生産 ${fmtMult(Decimal.pow(s.galaxy.dmCrunch.add(1), BALANCE.dmExp))}`;
    case 'crunch':
      return `この多元宇宙で得たエントロピー ${fmt(s.crunch.entMV)} → 全ての生産 ${fmtMult(Decimal.pow(s.crunch.entMV.add(1), BALANCE.entExp))} / 生産の指数 +${(0.01 * s.crunch.entMV.add(1).log10()).toFixed(3)}`;
    case 'mv':
      return `累計の次元の欠片 ${fmt(s.mv.shardsTotal)} → 全ての生産 ${fmtMult(Decimal.pow(s.mv.shardsTotal.add(1), BALANCE.shardExp))} / 下位の転生通貨の獲得量 ${fmtMult(Decimal.sqrt(s.mv.shardsTotal.add(1)))}`;
  }
}

function statsText(g: Game, layer: LayerId): string {
  const s = g.s;
  switch (layer) {
    case 'sn': return `超新星 ${s.stats.snTotal} 回 · この周回 ${fmtTime((g.now() - s.run.start) / 1000)} · 最速 ${fmtTime(s.sn.bestTime)}`;
    case 'galaxy': return `銀河崩壊 ${s.stats.galaxyTotal} 回 · この銀河 ${fmtTime((g.now() - s.galaxy.start) / 1000)} · 最速 ${fmtTime(s.galaxy.bestTime)}`;
    case 'crunch': return `ビッグクランチ ${s.stats.crunchTotal} 回 · この宇宙 ${fmtTime((g.now() - s.crunch.start) / 1000)} · 最速 ${fmtTime(s.crunch.bestTime)}`;
    case 'mv': return `多元宇宙転生 ${s.stats.mvTotal} 回 · この多元宇宙 ${fmtTime((g.now() - s.mv.start) / 1000)}`;
  }
}

const LAYER_TAB_LABEL: Record<LayerId, string> = { sn: '超新星', galaxy: '銀河', crunch: 'クランチ', mv: '多元宇宙' };

export function prestigeTab(layer: LayerId): Tab {
  const info = LAYER_INFO[layer];
  let curEl: HTMLElement;
  let bonusEl: HTMLElement;
  let statsEl: HTMLElement;
  let gainEl: HTMLElement;
  let nextEl: HTMLElement;
  let bar: HTMLElement;
  let btn: HTMLButtonElement;
  let cards: Array<{ item: ShopItem; lvl: HTMLElement; eff: HTMLElement; btn: HTMLButtonElement; el: HTMLElement }> = [];

  return {
    id: `layer-${layer}`,
    label: LAYER_TAB_LABEL[layer],
    icon: info.icon,
    visible: (g) => layerUnlocked(g, layer),
    badge: (g) => layerGain(g, layer).gte(1) && layerGain(g, layer).gte(layerCurrency(g, layer).max(1)),
    mount(root, g) {
      curEl = h('div', { class: 'big-num' });
      bonusEl = h('div', { class: 'muted' });
      statsEl = h('div', { class: 'muted small' });
      gainEl = h('div', { class: 'gain' });
      nextEl = h('div', { class: 'muted small' });
      bar = h('div', { class: 'bar-fill' });
      btn = h('button', { class: 'btn btn-prestige', text: info.verb });
      btn.type = 'button';
      btn.addEventListener('click', () => void prestigeWithConfirm(g, layer));
      root.append(
        h('div', { class: `panel layer-panel layer-${layer}` },
          h('h2', { text: `${info.icon} ${info.name}` }),
          h('p', { class: 'hint', text: RESET_TEXT[layer] }),
          h('div', { class: 'layer-grid' },
            h('div', {}, h('div', { class: 'label', text: `所持${info.currency}` }), curEl, bonusEl, statsEl),
            h('div', {}, gainEl, h('div', { class: 'bar' }, bar), nextEl, btn),
          ),
        ),
      );
      const grid = h('div', { class: 'shop-grid' });
      cards = [];
      for (const item of shopItemsFor(layer)) {
        const lvl = h('span', { class: 'shop-lvl' });
        const eff = h('div', { class: 'shop-eff' });
        const b = h('button', { class: 'btn btn-buy' });
        b.type = 'button';
        b.addEventListener('click', () => {
          const l = layerShop(g, layer)[item.id] ?? 0;
          if (buyShopItem(g, layer, item.id, item.cost(l), item.max)) g.recalcIfDirty();
        });
        const el = h('div', { class: 'shop-card' },
          h('div', { class: 'shop-head' }, h('span', { class: 'shop-icon', text: item.icon }), h('span', { class: 'shop-name', text: item.name }), lvl),
          h('div', { class: 'shop-desc', text: item.desc }),
          eff,
          b,
        );
        cards.push({ item, lvl, eff, btn: b, el });
        grid.append(el);
      }
      root.append(h('h3', { text: `${info.currency}ショップ` }), grid);
    },
    update(g) {
      const cur = layerCurrency(g, layer);
      setText(curEl, fmt(cur));
      setText(bonusEl, bonusText(g, layer));
      setText(statsEl, statsText(g, layer));
      const gainAmt = layerGain(g, layer);
      const nx = nextGainAt(g, layer);
      setText(gainEl, gainAmt.gte(1) ? `今${info.name}すると ${info.currency} +${fmt(gainAmt)}` : `${info.name}にはまだ届かない`);
      setText(nextEl, `${nx.label}: ${fmt(nx.have)} / 次の1個まで ${fmt(nx.need)}`);
      const frac = nx.need.gt(0) ? Math.max(0, Math.min(1, (nx.have.max(1).log10()) / nx.need.max(1).log10())) : 0;
      setWidth(bar, frac);
      setDisabled(btn, gainAmt.lt(1));
      const shop = layerShop(g, layer);
      const disabled = layer === 'sn' && g.mods.noSnShop;
      for (const c of cards) {
        const l = shop[c.item.id] ?? 0;
        const maxed = l >= c.item.max;
        setText(c.lvl, c.item.max === Infinity ? `Lv.${l}` : `${l}/${c.item.max}`);
        setText(c.eff, `現在: ${c.item.effect(l)}${disabled ? ' (チャレンジで無効)' : ''}`);
        if (maxed) {
          setText(c.btn, '最大');
          setDisabled(c.btn, true);
          setClass(c.btn, 'afford', false);
        } else {
          const cost = c.item.cost(l);
          const ok = cur.gte(cost);
          setText(c.btn, `${fmt(cost)} ${info.currency}`);
          setDisabled(c.btn, !ok);
          setClass(c.btn, 'afford', ok);
        }
        setClass(c.el, 'maxed', maxed);
      }
    },
  };
}
