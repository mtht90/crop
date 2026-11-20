// 選択肢のある出来事。safe は答えないまま時間が過ぎたときに自動で選ばれる選択肢。
import type { IndustryId } from './buildings';

export type EventEffect =
  | { type: 'cash'; amount: number }
  | { type: 'cashPctOfDailySales'; days: number }
  | { type: 'costMul'; industry: IndustryId | 'all'; mul: number; days: number }
  | { type: 'demandMul'; industry: IndustryId | 'all'; mul: number; days: number }
  | { type: 'awareness'; amount: number }
  | { type: 'satisfaction'; amount: number }
  | { type: 'wageMul'; mul: number; days: number }
  | { type: 'priceAll'; mul: number }
  | { type: 'rivalPriceCut'; mul: number; days: number }
  | { type: 'capacityMul'; mul: number; days: number };

export interface EventChoice {
  label: string;
  desc: string;
  effects: EventEffect[];
}

export interface EventConfig {
  id: string;
  title: string;
  text: string;
  /** この業種を持っているときだけ起きる */
  needs?: IndustryId;
  weight: number;
  choices: EventChoice[];
  safe: number;
}

export const GAME_EVENTS: EventConfig[] = [
  {
    id: 'material_up', title: '原材料の値上がり', text: 'コーヒー豆や小麦の値段が上がっています。原価が上がりそうです。', weight: 3,
    choices: [
      { label: '値上げする', desc: '全商品 +8%。客は少し減る', effects: [{ type: 'priceAll', mul: 1.08 }, { type: 'costMul', industry: 'all', mul: 1.15, days: 14 }] },
      { label: '据え置く', desc: '原価 +15%（14日間）。客は減らない', effects: [{ type: 'costMul', industry: 'all', mul: 1.15, days: 14 }] },
      { label: '仕入先を変える', desc: '手数料 300万円。原価 +5%、満足度が少し下がる', effects: [{ type: 'cash', amount: -3_000_000 }, { type: 'costMul', industry: 'all', mul: 1.05, days: 14 }, { type: 'satisfaction', amount: -0.05 }] },
    ],
    safe: 1,
  },
  {
    id: 'sns_buzz', title: 'SNSでバズった', text: 'お客さんの投稿が話題になっています。', weight: 2,
    choices: [
      { label: '人を増やして迎える', desc: '人件費 +20%、客 +30%（5日間）', effects: [{ type: 'wageMul', mul: 1.2, days: 5 }, { type: 'demandMul', industry: 'all', mul: 1.3, days: 5 }, { type: 'awareness', amount: 0.05 }] },
      { label: 'そのままにする', desc: '客 +15%（5日間）', effects: [{ type: 'demandMul', industry: 'all', mul: 1.15, days: 5 }, { type: 'awareness', amount: 0.03 }] },
    ],
    safe: 1,
  },
  {
    id: 'rival_cut', title: 'ライバルの値下げ攻勢', text: 'ライバル各社が一斉に値下げを始めました。', weight: 2,
    choices: [
      { label: '対抗して値下げ', desc: '全商品 -10%', effects: [{ type: 'rivalPriceCut', mul: 0.88, days: 10 }, { type: 'priceAll', mul: 0.9 }] },
      { label: '品質で勝負', desc: '広告に 500万円。知名度アップ', effects: [{ type: 'rivalPriceCut', mul: 0.88, days: 10 }, { type: 'cash', amount: -5_000_000 }, { type: 'awareness', amount: 0.06 }] },
      { label: '様子を見る', desc: '何もしない', effects: [{ type: 'rivalPriceCut', mul: 0.88, days: 10 }] },
    ],
    safe: 2,
  },
  {
    id: 'labor_shortage', title: '人手不足', text: '街全体で働き手が足りなくなっています。', weight: 2,
    choices: [
      { label: '時給を上げる', desc: '人件費 +15%（20日間）', effects: [{ type: 'wageMul', mul: 1.15, days: 20 }] },
      { label: 'このまま', desc: 'さばける客 -20%（10日間）', effects: [{ type: 'capacityMul', mul: 0.8, days: 10 }] },
    ],
    safe: 0,
  },
  {
    id: 'boom', title: '景気がよくなってきた', text: '街の景気が上向いています。', weight: 1.5,
    choices: [
      { label: '広告を強化', desc: '広告に 1,000万円。客 +20%（14日間）', effects: [{ type: 'cash', amount: -10_000_000 }, { type: 'demandMul', industry: 'all', mul: 1.2, days: 14 }, { type: 'awareness', amount: 0.04 }] },
      { label: '波に乗る', desc: '客 +10%（14日間）', effects: [{ type: 'demandMul', industry: 'all', mul: 1.1, days: 14 }] },
    ],
    safe: 1,
  },
  {
    id: 'recession', title: '景気の冷え込み', text: '街の景気が悪くなってきました。', weight: 1.5,
    choices: [
      { label: '値下げで客をつなぐ', desc: '全商品 -8%', effects: [{ type: 'priceAll', mul: 0.92 }, { type: 'demandMul', industry: 'all', mul: 0.9, days: 14 }] },
      { label: '我慢する', desc: '客 -15%（14日間）', effects: [{ type: 'demandMul', industry: 'all', mul: 0.85, days: 14 }] },
    ],
    safe: 1,
  },
  {
    id: 'festival', title: '街のお祭り', text: '週末にお祭りが開かれます。出店しませんか。', needs: 'food', weight: 1.5,
    choices: [
      { label: '屋台を出す', desc: '費用 200万円。飲食の客 +40%（3日間）', effects: [{ type: 'cash', amount: -2_000_000 }, { type: 'demandMul', industry: 'food', mul: 1.4, days: 3 }, { type: 'awareness', amount: 0.03 }] },
      { label: '見送る', desc: '何もしない', effects: [] },
    ],
    safe: 1,
  },
  {
    id: 'inspection', title: '保健所の立ち入り検査', text: '抜き打ちの検査が来ました。', needs: 'food', weight: 1,
    choices: [
      { label: '設備を新しくする', desc: '費用 800万円。満足度アップ', effects: [{ type: 'cash', amount: -8_000_000 }, { type: 'satisfaction', amount: 0.08 }] },
      { label: '最低限の対応', desc: '満足度が少し下がる', effects: [{ type: 'satisfaction', amount: -0.04 }] },
    ],
    safe: 0,
  },
  {
    id: 'tv', title: 'テレビの取材', text: '地元テレビ局から取材の申し込みがありました。', weight: 1,
    choices: [
      { label: '受ける', desc: '知名度アップ。準備で 100万円', effects: [{ type: 'cash', amount: -1_000_000 }, { type: 'awareness', amount: 0.08 }] },
      { label: '断る', desc: '何もしない', effects: [] },
    ],
    safe: 0,
  },
];
