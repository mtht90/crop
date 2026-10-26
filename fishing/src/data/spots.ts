import type { SpotId } from './types';

export interface SpotInfo {
  id: SpotId | string;
  name: string;
  desc: string;
  /** 入漁券の価格（0 = 最初から） */
  price: number;
  implemented: boolean;
  /** 拡張候補（マップに未開拓エリアとして表示） */
  expansion?: boolean;
  /** マップ上の位置 (0..1) */
  map: [number, number];
}

export const SPOTS: SpotInfo[] = [
  { id: 'lake', name: '翠ヶ湖', desc: '森に囲まれた静かな湖。流れ込み・水草帯・岩場・沖の深場と多彩なポイントがある。', price: 0, implemented: true, map: [0.36, 0.42] },
  { id: 'stream', name: '霧沢渓流', desc: '冷たく澄んだ山の渓流。ヤマメやイワナが岩陰に潜む。', price: 15000, implemented: false, map: [0.2, 0.22] },
  { id: 'coast', name: '汐見港・磯', desc: '赤灯台の堤防、北の磯と藻場、南の河口と砂浜。アジやクロダイから磯の王者イシダイまで。', price: 0, implemented: true, map: [0.58, 0.62] },
  { id: 'offshore', name: '黒潮の沖合', desc: '船で出る外洋。マグロやカジキが回遊する。', price: 80000, implemented: false, map: [0.8, 0.76] },
  { id: 'reef', name: 'サンゴ礁', desc: '色とりどりの熱帯魚が群れる南の海。', price: 0, implemented: false, expansion: true, map: [0.86, 0.36] },
  { id: 'deepsea', name: '深海', desc: '光の届かない海の底。奇怪な姿の魚たち。', price: 0, implemented: false, expansion: true, map: [0.9, 0.68] },
  { id: 'tropical', name: '熱帯河川', desc: '大河のジャングル。古代魚や怪魚の宝庫。', price: 0, implemented: false, expansion: true, map: [0.64, 0.18] },
  { id: 'glacier', name: '氷河湖', desc: '氷に閉ざされた北の湖。', price: 0, implemented: false, expansion: true, map: [0.08, 0.08] },
];
