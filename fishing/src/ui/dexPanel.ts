import { completion } from '../core/progress';
import type { SaveData } from '../core/save';
import { SPECIES } from '../data/species';
import { LINE_BY_ID, LURE_BY_ID, ROD_BY_ID } from '../data/tackle';
import { SPOTS } from '../data/spots';
import {
  LAYER_LABEL,
  LAYERS,
  RARITY_LABEL,
  SEASON_LABEL,
  SEASONS,
  structureLabels,
  STRUCTURES,
  TIME_BANDS,
  TIME_LABEL,
  WEATHERS,
  WEATHER_LABEL,
  type Mult,
  type Species,
} from '../data/types';
import { lookOf } from '../render/fishMesh';
import type { FishPreview } from '../render/preview';
import { formatWeight } from '../sim/individual';
import { h } from './dom';
import type { Modals } from './modal';
import { fishModelsReady, modelIdsFor, preloadFishModels } from '../render/fishMesh';

const LURE_CAT_LABEL: Record<string, string> = {
  topwater: 'トップウォーター',
  frog: 'フロッグ',
  minnow: 'ミノー',
  crank: 'クランク',
  spinner: 'スピナー',
  worm: 'ワーム',
  jig: 'メタルジグ',
  baitWorm: 'ミミズ',
  baitDough: '練りエサ',
  baitLive: '活き餌',
};

function topKeys<K extends string>(table: Mult<K>, keys: K[], labels: Record<K, string>, fallback = 1): string[] {
  const vals = keys.map((k) => [k, table[k] ?? fallback] as const);
  const max = Math.max(...vals.map((v) => v[1]));
  return vals.filter((v) => v[1] >= Math.max(1.25, max * 0.8)).map((v) => labels[v[0]]);
}

export function openDex(modals: Modals, preview: FishPreview, save: SaveData): void {
  let spot = save.area ?? 'lake';
  let selected: Species | null = null;
  const tabs = h('div', { class: 'tabs' });
  const summary = h('div', { class: 'dex-summary' });
  const m = modals.open('釣魚図鑑', { headerExtra: [summary], onClose: () => preview.unmount(), closeKey: 'Tab' });
  const grid = h('div', { class: 'dex-grid' });
  const detail = h('div', { class: 'dex-detail' });
  m.body.append(tabs, h('div', { style: 'height:12px' }), h('div', { class: 'dex' }, grid, detail));

  const renderTabs = () => {
    tabs.replaceChildren(
      ...SPOTS.filter((s) => !s.expansion).map((s) =>
        h('button', {
          class: s.id === spot ? 'on' : '',
          text: s.implemented ? s.name : `${s.name}（未開拓）`,
          onclick: () => {
            spot = s.id;
            selected = null;
            render();
          },
        }),
      ),
    );
  };

  const render = () => {
    renderTabs();
    const c = completion(save, spot);
    const all = completion(save);
    summary.replaceChildren(
      h('span', null, '種 ', h('b', { text: `${c.species}/${c.speciesTotal}` })),
      h('span', null, '色・模様 ', h('b', { text: `${c.variants}/${c.variantsTotal}` })),
      h('span', { class: 'muted', text: `全体 ${all.species} 種登録` }),
    );
    const list = SPECIES.filter((s) => s.spot === spot);
    if (!list.length) {
      grid.replaceChildren(h('div', { class: 'muted', text: 'この釣り場はまだ開拓されていません。' }));
      detail.replaceChildren(h('div', { class: 'muted', text: '今後のアップデートで追加予定です。' }));
      preview.unmount();
      return;
    }
    // 別の釣り場の魚はモデルを読み込んでから描く
    const ids = modelIdsFor(list);
    if (!fishModelsReady(ids)) {
      grid.replaceChildren(h('div', { class: 'muted', text: '読み込み中…' }));
      const want = spot;
      void preloadFishModels(ids).then(() => {
        if (spot === want && modals.isOpen) render();
      });
      return;
    }
    grid.replaceChildren(
      ...list.map((s) => {
        const e = save.dex[s.id];
        const img = h('img');
        img.src = preview.thumbnail(s, null, null, !e);
        const total = s.colors.length + s.patterns.length;
        const found = e ? e.colors.filter((x) => x !== 'normal').length + e.patterns.filter((x) => x !== 'normal').length : 0;
        const dots = h('div', { class: 'dots' }, ...Array.from({ length: total }, (_, i) => h('i', { class: i < found ? 'on' : '' })));
        return h(
          'div',
          {
            class: `dex-card${selected?.id === s.id ? ' on' : ''}`,
            onclick: () => {
              selected = s;
              render();
            },
          },
          h('span', { class: 'no', text: `No.${String(s.no).padStart(3, '0')}` }),
          dots,
          img,
          h('div', { text: e ? s.name : '？？？' }),
        );
      }),
    );
    renderDetail(selected ?? list.find((s) => save.dex[s.id]) ?? list[0]);
  };

  const renderDetail = (s: Species) => {
    const e = save.dex[s.id];
    preview.unmount();
    const pv = h('div', { class: 'preview' });
    if (!e) {
      detail.replaceChildren(
        h('div', { class: 'muted', text: `No.${String(s.no).padStart(3, '0')}` }),
        h('h3', { text: '？？？' }),
        h('span', { class: `rarity ${s.rarity}`, text: RARITY_LABEL[s.rarity] }),
        h('p', { class: 'desc muted', text: 'まだ釣り上げていない魚。どんな条件で釣れるのだろう…' }),
        h('h4', { text: '手がかり' }),
        h('div', { class: 'hints' }, h('span', { class: 'hint', text: `よく釣れるポイント：${topKeys(s.structures, STRUCTURES, structureLabels(s.spot))[0] ?? '？'}` })),
      );
      return;
    }
    const swatch = (name: string, hex: string, known: boolean) => {
      const i = h('i');
      i.style.background = hex;
      return h('span', { class: `swatch${known ? '' : ' unknown'}` }, i, known ? name : '？？？');
    };
    const colors = [swatch('ノーマル', s.palette.flank, e.colors.includes('normal')), ...s.colors.map((c) => swatch(c.name, lookOf(s, c.id, null).palette.flank, e.colors.includes(c.id)))];
    const patterns = [swatch('基本', s.palette.pattern, e.patterns.includes('normal')), ...s.patterns.map((p) => swatch(p.name, lookOf(s, null, p.id).palette.pattern, e.patterns.includes(p.id)))];
    const lures = Object.entries(s.lures)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .filter(([, v]) => (v ?? 0) >= 1)
      .map(([k]) => LURE_CAT_LABEL[k]);
    const hint = (label: string, items: string[]) => (items.length ? h('span', { class: 'hint', text: `${label}：${items.join('・')}` }) : null);
    const f = e.first;
    detail.replaceChildren(
      pv,
      h('div', { class: 'muted small', text: `No.${String(s.no).padStart(3, '0')}` }),
      h('h3', { text: s.name }),
      h('div', { class: 'sci', text: s.sci }),
      h('span', { class: `rarity ${s.rarity}`, text: RARITY_LABEL[s.rarity] }),
      h('p', { class: 'desc', text: s.desc }),
      h(
        'div',
        { class: 'records' },
        h('div', null, '釣った数', h('b', { text: `${e.count}` })),
        h('div', null, '最大体長', h('b', { text: `${e.bestLength.toFixed(1)}cm` })),
        h('div', null, '最大重量', h('b', { text: formatWeight(e.bestWeight) })),
        h('div', null, '最高グレード', h('b', { text: e.bestGrade })),
      ),
      h('h4', { text: '色のコンプリート' }),
      h('div', { class: 'swatches' }, ...colors),
      h('h4', { text: '模様のコンプリート' }),
      h('div', { class: 'swatches' }, ...patterns),
      h('h4', { text: '生息のヒント' }),
      h(
        'div',
        { class: 'hints' },
        hint('時間帯', topKeys(s.times, TIME_BANDS, TIME_LABEL)),
        hint('天候', topKeys(s.weathers, WEATHERS, WEATHER_LABEL)),
        hint('季節', topKeys(s.seasons, SEASONS, SEASON_LABEL)),
        hint('タナ', topKeys(s.layers, LAYERS, LAYER_LABEL)),
        hint('ポイント', topKeys(s.structures, STRUCTURES, structureLabels(s.spot))),
        hint('好むエサ・ルアー', lures),
      ),
      h('h4', { text: '初めて釣った日' }),
      h(
        'div',
        { class: 'small muted' },
        `${f.day}日目 ${f.clock}（${SEASON_LABEL[f.season]}・${WEATHER_LABEL[f.weather]}）${structureLabels(s.spot)[f.structure]}／${LAYER_LABEL[f.layer]}　`,
        `${ROD_BY_ID[f.rod]?.name ?? f.rod}・${LINE_BY_ID[f.line]?.name ?? f.line}・${LURE_BY_ID[f.lure]?.name ?? f.lure}`,
      ),
    );
    const best = e.best;
    requestAnimationFrame(() => preview.mount(pv, s, best.colorId, best.patternId));
  };

  render();
}
