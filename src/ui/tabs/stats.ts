import { fmt, fmtInt, fmtTime } from '../../core/format';
import type { Game } from '../../core/game';
import { h, setText } from '../dom';
import type { Tab } from './tab';

type Stat = [string, (g: Game) => string];

const STATS: Array<[string, Stat[]]> = [
  ['この周回', [
    ['獲得した星屑', (g) => fmt(g.s.run.earned)],
    ['経過時間', (g) => fmtTime((g.now() - g.s.run.start) / 1000)],
    ['クリック回数', (g) => fmtInt(g.s.run.clicks)],
    ['施設の合計', (g) => fmtInt(g.totalBuildings())],
    ['アップグレード', (g) => fmtInt(g.s.upgrades.length)],
  ]],
  ['累計', [
    ['獲得した星屑', (g) => fmt(g.s.stats.totalEarned)],
    ['最高毎秒生産', (g) => fmt(g.s.stats.maxSps)],
    ['最高の周回獲得量', (g) => fmt(g.s.stats.bestRunEarned)],
    ['クリック回数 (手動)', (g) => fmtInt(g.s.stats.clicks)],
    ['クリック回数 (自動)', (g) => fmtInt(g.s.stats.autoClicks)],
    ['クリックで得た星屑', (g) => fmt(g.s.stats.clickEarned)],
    ['つかまえた彗星', (g) => fmtInt(g.s.stats.comets)],
    ['購入した施設', (g) => fmtInt(g.s.stats.buildingsBought)],
    ['購入したアップグレード', (g) => fmtInt(g.s.stats.upgradesBought)],
    ['完了した研究', (g) => fmtInt(g.s.stats.researchDone)],
    ['完了した遠征', (g) => fmtInt(g.s.stats.expeditionsDone)],
    ['チャレンジ達成', (g) => fmtInt(g.s.stats.challengesDone)],
  ]],
  ['転生', [
    ['超新星', (g) => `${fmtInt(g.s.stats.snTotal)} 回`],
    ['銀河崩壊', (g) => `${fmtInt(g.s.stats.galaxyTotal)} 回`],
    ['ビッグクランチ', (g) => `${fmtInt(g.s.stats.crunchTotal)} 回`],
    ['多元宇宙転生', (g) => `${fmtInt(g.s.stats.mvTotal)} 回`],
    ['累計の星核', (g) => fmt(g.s.sn.coresTotal)],
    ['累計のダークマター', (g) => fmt(g.s.galaxy.dmTotal)],
    ['累計のエントロピー', (g) => fmt(g.s.crunch.entTotal)],
    ['累計の次元の欠片', (g) => fmt(g.s.mv.shardsTotal)],
  ]],
  ['時間', [
    ['プレイ時間', (g) => fmtTime(g.s.stats.playTime)],
    ['放置時間', (g) => fmtTime(g.s.stats.offlineTime)],
    ['はじめた日', (g) => new Date(g.s.created).toLocaleString('ja-JP')],
  ]],
  ['現在の倍率', [
    ['全体倍率', (g) => fmt(g.mods.global)],
    ['生産の指数', (g) => `^${g.mods.exponent.toFixed(3)}`],
    ['施設価格の上昇率', (g) => g.mods.costScale.toFixed(3)],
    ['施設価格の倍率', (g) => `×${g.mods.costMult.toFixed(3)}`],
    ['クリック倍率', (g) => fmt(g.mods.click)],
    ['放置効率 / 上限', (g) => `${(Math.min(1, g.mods.offlineEff) * 100).toFixed(0)}% / ${g.mods.offlineCapH.toFixed(0)}時間`],
    ['彗星 頻度 / 効果', (g) => `×${g.mods.cometFreq.toFixed(2)} / ×${g.mods.cometPower.toFixed(2)}`],
  ]],
];

let cells: Array<[HTMLElement, (g: Game) => string]> = [];

export const statsTab: Tab = {
  id: 'stats',
  label: '統計',
  icon: '📊',
  visible: () => true,
  mount(root) {
    cells = [];
    for (const [title, stats] of STATS) {
      const table = h('table', { class: 'stats' });
      for (const [label, fn] of stats) {
        const td = h('td');
        cells.push([td, fn]);
        table.append(h('tr', {}, h('th', { text: label }), td));
      }
      root.append(h('div', { class: 'panel' }, h('h3', { text: title }), table));
    }
  },
  update(g) {
    for (const [td, fn] of cells) setText(td, fn(g));
  },
};
