import type { Game } from '../../core/game';
import { autoUnlocked } from '../../logic/automation';
import { h, setClass, setText } from '../dom';
import type { Tab } from './tab';

type AutoKey = 'click' | 'buildings' | 'upgrades' | 'sn' | 'galaxy' | 'crunch' | 'research' | 'expeditions';

interface Row {
  key: AutoKey;
  el: HTMLElement;
  box: HTMLInputElement;
  status: HTMLElement;
}

const DEFS: Array<{ key: AutoKey; name: string; how: string }> = [
  { key: 'click', name: '自動クリック', how: '超新星ショップ「自動タッパー」で解放' },
  { key: 'buildings', name: '施設の自動購入', how: '超新星ショップ「自動建設ユニット」で解放' },
  { key: 'upgrades', name: 'アップグレードの自動購入', how: '超新星ショップ「自動技術者」で解放' },
  { key: 'research', name: '研究の自動選択', how: '研究「自律研究AI」で解放' },
  { key: 'expeditions', name: '遠征の自動再出発', how: '研究「自動航行」で解放' },
  { key: 'sn', name: '超新星の自動実行', how: '銀河ショップ「超新星オートメーション」で解放' },
  { key: 'galaxy', name: '銀河崩壊の自動実行', how: 'クランチショップ「銀河オートメーション」で解放' },
  { key: 'crunch', name: 'ビッグクランチの自動実行', how: '多元宇宙ショップ「クランチ・オートメーション」で解放' },
];

let rows: Row[] = [];
let clickInfo: HTMLElement;

function numberInput(value: number, onChange: (v: number) => void): HTMLInputElement {
  const inp = h('input', { class: 'num', attrs: { type: 'number', min: '0', step: 'any' } });
  inp.value = String(value);
  inp.addEventListener('change', () => {
    const v = Number(inp.value);
    if (Number.isFinite(v) && v >= 0) onChange(v);
  });
  return inp;
}

export const automationTab: Tab = {
  id: 'automation',
  label: '自動化',
  icon: '⚙️',
  visible: (g) => g.s.stats.snTotal > 0,
  mount(root, g) {
    rows = [];
    const list = h('div', { class: 'auto-list' });
    for (const d of DEFS) {
      const box = h('input', { attrs: { type: 'checkbox' } });
      box.checked = g.s.auto[d.key];
      box.addEventListener('change', () => {
        g.s.auto[d.key] = box.checked;
      });
      const status = h('span', { class: 'small muted' });
      const extra = h('div', { class: 'auto-extra' });
      if (d.key === 'sn') {
        const mode = h('select');
        mode.append(h('option', { text: '獲得星核が次の値以上', attrs: { value: 'gain' } }), h('option', { text: '周回時間 (秒) が次の値以上', attrs: { value: 'time' } }));
        mode.value = g.s.auto.snMode;
        mode.addEventListener('change', () => {
          g.s.auto.snMode = mode.value === 'time' ? 'time' : 'gain';
        });
        extra.append(mode, numberInput(g.s.auto.snValue, (v) => { g.s.auto.snValue = v; }));
      } else if (d.key === 'galaxy') {
        extra.append(h('span', { class: 'small', text: '獲得ダークマターが' }), numberInput(g.s.auto.galaxyValue, (v) => { g.s.auto.galaxyValue = v; }), h('span', { class: 'small', text: '以上で実行' }));
      } else if (d.key === 'crunch') {
        extra.append(h('span', { class: 'small', text: '獲得エントロピーが' }), numberInput(g.s.auto.crunchValue, (v) => { g.s.auto.crunchValue = v; }), h('span', { class: 'small', text: '以上で実行' }));
      }
      const el = h('div', { class: 'auto-row' },
        h('label', { class: 'check' }, box, h('span', { class: 'auto-name', text: d.name })),
        status,
        extra,
      );
      rows.push({ key: d.key, el, box, status });
      list.append(el);
    }
    clickInfo = h('p', { class: 'hint' });
    root.append(h('p', { class: 'hint', text: '自動化は解放後にオン/オフを切り替えられます。超新星の自動実行はチャレンジ中は動作しません。' }), list, clickInfo);
  },
  update(g: Game) {
    for (const r of rows) {
      const ok = autoUnlocked(g, r.key);
      r.box.disabled = !ok;
      if (r.box.checked !== g.s.auto[r.key]) r.box.checked = g.s.auto[r.key];
      setText(r.status, ok ? (g.s.auto[r.key] ? '稼働中' : '停止中') : DEFS.find((d) => d.key === r.key)!.how);
      setClass(r.el, 'locked', !ok);
    }
    setText(clickInfo, `自動クリック: ${g.mods.autoClick.toFixed(0)} 回/秒 · 1回あたり手動クリックの ${(10 * g.mods.autoClickMult).toFixed(0)}%`);
  },
};
