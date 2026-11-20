// ライバル企業。性格ごとの動き方と、出てくる会社の一覧。
import type { IndustryId } from './buildings';

export type Personality = 'discount' | 'premium' | 'aggressive' | 'steady';

export interface PersonalityConfig {
  name: string;
  /** 価格（ふつうの値段に対する倍率） */
  priceMul: number;
  /** 品質（0〜100） */
  quality: number;
  /** 1日の広告費（1店あたり） */
  adsPerStore: number;
  /** 1日に新しい店を出す確率（資金があれば） */
  expandChance: number;
  /** 出店に使ってよい資金の割合 */
  spendRatio: number;
  /** 赤字の店を閉じるまでの日数 */
  closeAfterLossDays: number;
  /** ライバルの値下げに反応して値下げするか */
  reactsToPriceCut: boolean;
}

export const PERSONALITIES: Record<Personality, PersonalityConfig> = {
  discount: { name: '安売り型', priceMul: 0.82, quality: 30, adsPerStore: 15_000, expandChance: 0.25, spendRatio: 0.6, closeAfterLossDays: 20, reactsToPriceCut: true },
  premium: { name: '高級型', priceMul: 1.3, quality: 70, adsPerStore: 40_000, expandChance: 0.12, spendRatio: 0.5, closeAfterLossDays: 30, reactsToPriceCut: false },
  aggressive: { name: '急拡大型', priceMul: 0.95, quality: 45, adsPerStore: 50_000, expandChance: 0.45, spendRatio: 0.85, closeAfterLossDays: 12, reactsToPriceCut: true },
  steady: { name: '堅実型', priceMul: 1.05, quality: 50, adsPerStore: 25_000, expandChance: 0.15, spendRatio: 0.4, closeAfterLossDays: 25, reactsToPriceCut: false },
};

export interface RivalTemplate {
  name: string;
  color: string;
  personality: Personality;
  industries: IndustryId[];
}

/** 出てくる順。最初に startCount 社、その後ときどき新しい会社が出てくる */
export const RIVALS: RivalTemplate[] = [
  { name: 'まるやす珈琲', color: '#e84a5f', personality: 'discount', industries: ['food', 'retail'] },
  { name: 'ルミエール', color: '#8e6fd8', personality: 'premium', industries: ['food'] },
  { name: 'ハヤテ商事', color: '#2bb3c0', personality: 'aggressive', industries: ['food', 'retail'] },
  { name: 'こもれび堂', color: '#5aa85a', personality: 'steady', industries: ['food', 'retail'] },
  { name: 'サンライズマート', color: '#f2b134', personality: 'discount', industries: ['retail'] },
  { name: 'ほしぞら食堂', color: '#3b6fd8', personality: 'steady', industries: ['food'] },
  { name: 'ミドリヤ', color: '#2e8b57', personality: 'aggressive', industries: ['retail'] },
  { name: 'カフェ・ノワール', color: '#5b4636', personality: 'premium', industries: ['food'] },
  { name: 'やまと屋', color: '#c0392b', personality: 'steady', industries: ['retail', 'food'] },
  { name: 'ポラリス', color: '#16a085', personality: 'aggressive', industries: ['food', 'retail'] },
  { name: 'あおば商店', color: '#7f8c8d', personality: 'discount', industries: ['retail'] },
  { name: 'グランメゾン', color: '#b8860b', personality: 'premium', industries: ['food', 'retail'] },
  { name: 'つばめマート', color: '#d35400', personality: 'aggressive', industries: ['retail'] },
  { name: 'しろくま喫茶', color: '#5dade2', personality: 'steady', industries: ['food'] },
  { name: 'ネオン堂', color: '#e91e63', personality: 'discount', industries: ['food', 'retail'] },
];

export const RIVAL_RULES = {
  startCount: 5,
  maxCount: 15,
  /** 新しい会社が出てくる間隔（ゲーム内の日数） */
  newRivalEveryDays: 20,
  /** 新しく出てくる会社の資金 */
  startCash: 60_000_000,
  /** 倒産：資金がこの額を下回る */
  bankruptBelow: -20_000_000,
  /** ライバルの開始時の店の数 */
  startStores: 1,
  /** 1社が持てる店の数：base + 経過日数 / perDays */
  maxStoresBase: 3,
  maxStoresPerDays: 60,
  /** 街のライバル店の合計の上限（区画の割合） */
  maxRivalLotShare: 0.45,
} as const;
