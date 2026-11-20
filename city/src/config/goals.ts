// 画面上部に出す「次の目標」。上から順に、まだ達成していないものを1つ出す（報酬はない。遊び方の道しるべ）。
import type { GameState } from '../sim/types';

export interface Goal {
  text: string;
  /** [今の値, 目標の値] */
  progress: (s: GameState) => [number, number];
  /** タップしたときに開くタブ */
  tab: 'city' | 'business' | 'research' | 'market' | 'finance';
}

const mine = (s: GameState, ind?: string) => s.stores.filter((x) => x.company === 0 && (!ind || x.industry === ind) && x.buildUntil === null).length;
const ownedLots = (s: GameState) => s.lotOwner.filter((o, i) => o === 0 && i !== s.hqLot).length;

export const GOALS: Goal[] = [
  { text: '黄緑の区画をタップして買おう', progress: (s) => [Math.min(1, ownedLots(s) + mine(s)), 1], tab: 'city' },
  { text: '買った区画にカフェを建てよう', progress: (s) => [Math.min(1, mine(s, 'food')), 1], tab: 'city' },
  { text: 'カフェの従業員を増やして、客を逃さないようにしよう', progress: (s) => [s.stores.some((x) => x.company === 0 && x.yesterday && x.yesterday.lost < x.yesterday.customers * 0.1) ? 1 : 0, 1], tab: 'city' },
  { text: '本社で研究を始めよう', progress: (s) => [s.research.done.length + (s.research.current ? 1 : 0) > 0 ? 1 : 0, 1], tab: 'research' },
  { text: 'カフェを3店にしよう', progress: (s) => [mine(s, 'food'), 3], tab: 'city' },
  { text: '累計売上5,000万円で小売を解禁しよう', progress: (s) => [Math.min(s.companies[0].cumulativeSales, 5e7) / 1e6, 50], tab: 'business' },
  { text: 'コンビニを3店にしよう', progress: (s) => [mine(s, 'retail'), 3], tab: 'city' },
  { text: 'カフェをレベル2に建て替えよう', progress: (s) => [s.stores.some((x) => x.company === 0 && x.level >= 2) ? 1 : 0, 1], tab: 'city' },
  { text: '研究「店長制度」で店長を置こう', progress: (s) => [s.stores.some((x) => x.company === 0 && x.manager) ? 1 : 0, 1], tab: 'research' },
  { text: '累計売上5億円で工場を解禁しよう', progress: (s) => [Math.min(s.companies[0].cumulativeSales, 5e8) / 1e7, 50], tab: 'business' },
  { text: '工場を建てて、自社の店に卸そう', progress: (s) => [Math.min(1, mine(s, 'factory')), 1], tab: 'city' },
  { text: '創業融資を完済しよう', progress: (s) => [s.loans.some((l) => l.name === '創業融資') ? 0 : 1, 1], tab: 'finance' },
  { text: 'ライバルの店を1つ買収しよう', progress: (s) => [s.log.some((l) => l.text.includes('買収')) ? 1 : 0, 1], tab: 'market' },
  { text: '物流センターを建てよう', progress: (s) => [Math.min(1, mine(s, 'logistics')), 1], tab: 'city' },
  { text: 'ITオフィスを建てよう', progress: (s) => [Math.min(1, mine(s, 'it')), 1], tab: 'city' },
  { text: '時価総額1,000億円で上場しよう', progress: (s) => [s.ipo.done ? 1000 : Math.min(1000, s.companies[0].marketCap / 1e8), 1000], tab: 'finance' },
  { text: '飲食のシェア1位を取ろう', progress: (s) => [Math.round(((s.history.at(-1)?.share.food ?? 0) * 100)), 50], tab: 'market' },
];
