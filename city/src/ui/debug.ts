// 調整用のデバッグ画面：時間の早送り、資金の追加など
import { INDUSTRIES } from '../config/economy';
import type { IndustryId } from '../config/buildings';
import { formatYen } from '../core/format';
import { checkUnlocks } from '../sim/engine';
import { addLog } from '../sim/world';
import type { Game } from '../game';
import { h } from './dom';

export function debugPanel(g: Game, refresh: () => void): Node[] {
  const s = g.s;
  const b = (label: string, fn: () => void, on = false) => h('button', { class: `btn ${on ? 'on' : 'ghost'}`, onclick: () => { fn(); g.onUpdate(); refresh(); } }, label);
  const busy = (fn: () => void) => () => {
    document.body.style.cursor = 'wait';
    setTimeout(() => { fn(); document.body.style.cursor = ''; g.onUpdate(); refresh(); }, 10);
  };
  return [
    h('div', { class: 'small muted' }, '動作確認とバランス調整のための画面です。'),
    h('div', { class: 'card' }, h('h3', null, '時間の速さ'),
      h('div', { class: 'row' }, ...[1, 10, 60, 600, 3600].map((v) => b(`×${v}`, () => (s.debug.speed = v), s.debug.speed === v))),
      h('div', { class: 'small muted' }, '×60 で現実1分 = ゲーム内1日。')),
    h('div', { class: 'card' }, h('h3', null, '時間を飛ばす'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: busy(() => g.skip(1 / 24)) }, '+1時間'),
        h('button', { class: 'btn ghost', onclick: busy(() => g.skip(1)) }, '+1日'),
        h('button', { class: 'btn ghost', onclick: busy(() => g.skip(10)) }, '+10日'),
        h('button', { class: 'btn ghost', onclick: busy(() => g.skip(90)) }, '+1四半期'))),
    h('div', { class: 'card' }, h('h3', null, '資金'),
      h('div', { class: 'row' }, ...[1e8, 1e10, 1e12].map((v) => b(`+${formatYen(v)}`, () => { s.companies[0].cash += v; addLog(s, `デバッグ：資金 +${formatYen(v)}`); })))),
    h('div', { class: 'card' }, h('h3', null, 'すぐに終わらせる'),
      h('div', { class: 'row' },
        b('工事を完了', () => { for (const st of s.stores) if (st.company === 0 && st.buildUntil !== null) st.buildUntil = s.day; }),
        b('研究を完了', () => { if (s.research.current) s.research.current.progressDays = 1e6; }),
        b('全業種を解禁', () => { for (const id of Object.keys(INDUSTRIES) as IndustryId[]) if (!s.unlocked.includes(id)) s.unlocked.push(id); checkUnlocks(s); }),
        b('出来事を起こす', () => { s.nextEventDay = s.day; }))),
  ];
}
