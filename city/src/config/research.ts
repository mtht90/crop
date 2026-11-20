// 研究ツリー。本社で1つずつ進める。minutes は現実の分。
import type { IndustryId } from './buildings';

export type ResearchEffect =
  | { type: 'qualityCap'; industry: IndustryId; amount: number }
  | { type: 'costReduction'; industry: IndustryId | 'all'; pct: number }
  | { type: 'capacity'; industry: IndustryId | 'all'; pct: number }
  | { type: 'adEfficiency'; pct: number }
  | { type: 'manager' }
  | { type: 'managerSkill'; amount: number }
  | { type: 'researchSpeed'; pct: number }
  | { type: 'factoryOutput'; pct: number }
  | { type: 'logisticsRange'; pct: number }
  | { type: 'appBusiness' }
  | { type: 'appRevenue'; pct: number }
  | { type: 'product' }; // 商品の解禁（products.ts の research で参照）

export interface ResearchConfig {
  id: string;
  name: string;
  desc: string;
  category: 'quality' | 'product' | 'cost' | 'automation' | 'industry';
  cost: number;
  minutes: number;
  requires: string[];
  /** この業種が解禁されていないと研究できない */
  industry?: IndustryId;
  effects: ResearchEffect[];
}

export const RESEARCH: ResearchConfig[] = [
  // 飲食
  { id: 'food_q1', name: '焙煎の工夫', desc: '飲食の品質上限 +15', category: 'quality', cost: 5_000_000, minutes: 30, requires: [], effects: [{ type: 'qualityCap', industry: 'food', amount: 15 }] },
  { id: 'food_menu1', name: 'サンドイッチ', desc: '新商品：サンドイッチ', category: 'product', cost: 8_000_000, minutes: 45, requires: [], effects: [{ type: 'product' }] },
  { id: 'food_menu2', name: 'ケーキ', desc: '新商品：ケーキ', category: 'product', cost: 20_000_000, minutes: 90, requires: ['food_menu1'], effects: [{ type: 'product' }] },
  { id: 'food_q2', name: 'バリスタ育成', desc: '飲食の品質上限 +15、さばける客 +10%', category: 'quality', cost: 30_000_000, minutes: 120, requires: ['food_q1'], effects: [{ type: 'qualityCap', industry: 'food', amount: 15 }, { type: 'capacity', industry: 'food', pct: 0.1 }] },
  { id: 'food_menu3', name: 'ランチセット', desc: '新商品：ランチセット', category: 'product', cost: 60_000_000, minutes: 180, requires: ['food_menu2', 'food_q2'], effects: [{ type: 'product' }] },
  { id: 'food_q3', name: '自家農園', desc: '飲食の品質上限 +20', category: 'quality', cost: 250_000_000, minutes: 300, requires: ['food_q2'], effects: [{ type: 'qualityCap', industry: 'food', amount: 20 }] },
  // 共通
  { id: 'cost1', name: '仕入れの見直し', desc: '全業種の原価 -5%', category: 'cost', cost: 15_000_000, minutes: 60, requires: [], effects: [{ type: 'costReduction', industry: 'all', pct: 0.05 }] },
  { id: 'ads1', name: 'マーケティング部', desc: '広告の効果 +25%', category: 'cost', cost: 12_000_000, minutes: 60, requires: [], effects: [{ type: 'adEfficiency', pct: 0.25 }] },
  { id: 'manager1', name: '店長制度', desc: '店に店長を置けるようになる。店長は価格と従業員を自動で調整する', category: 'automation', cost: 25_000_000, minutes: 90, requires: [], effects: [{ type: 'manager' }] },
  { id: 'manager2', name: '店長研修', desc: '店長の腕が上がる', category: 'automation', cost: 150_000_000, minutes: 240, requires: ['manager1'], effects: [{ type: 'managerSkill', amount: 0.05 }] },
  { id: 'lab1', name: '研究所の拡張', desc: '研究の速さ +25%', category: 'automation', cost: 40_000_000, minutes: 120, requires: [], effects: [{ type: 'researchSpeed', pct: 0.25 }] },
  { id: 'cost2', name: '共同購買', desc: '全業種の原価 -7%', category: 'cost', cost: 200_000_000, minutes: 240, requires: ['cost1'], effects: [{ type: 'costReduction', industry: 'all', pct: 0.07 }] },
  { id: 'ads2', name: 'ブランド戦略', desc: '広告の効果 +40%', category: 'cost', cost: 300_000_000, minutes: 300, requires: ['ads1'], effects: [{ type: 'adEfficiency', pct: 0.4 }] },
  // 小売
  { id: 'retail_q1', name: '品ぞろえの改善', desc: '小売の品質上限 +15', category: 'quality', cost: 40_000_000, minutes: 90, requires: [], industry: 'retail', effects: [{ type: 'qualityCap', industry: 'retail', amount: 15 }] },
  { id: 'retail_menu1', name: '日用品コーナー', desc: '新商品：日用品', category: 'product', cost: 60_000_000, minutes: 120, requires: [], industry: 'retail', effects: [{ type: 'product' }] },
  { id: 'retail_menu2', name: '化粧品コーナー', desc: '新商品：化粧品', category: 'product', cost: 200_000_000, minutes: 240, requires: ['retail_menu1', 'retail_q1'], industry: 'retail', effects: [{ type: 'product' }] },
  { id: 'retail_q2', name: 'POSシステム', desc: '小売の品質上限 +20、さばける客 +15%', category: 'quality', cost: 300_000_000, minutes: 300, requires: ['retail_q1'], industry: 'retail', effects: [{ type: 'qualityCap', industry: 'retail', amount: 20 }, { type: 'capacity', industry: 'retail', pct: 0.15 }] },
  // 製造
  { id: 'factory1', name: '生産ラインの自動化', desc: '工場の生産量 +30%', category: 'industry', cost: 600_000_000, minutes: 300, requires: [], industry: 'factory', effects: [{ type: 'factoryOutput', pct: 0.3 }] },
  { id: 'factory2', name: '品質管理', desc: '飲食・小売の品質上限 +10', category: 'industry', cost: 900_000_000, minutes: 360, requires: ['factory1'], industry: 'factory', effects: [{ type: 'qualityCap', industry: 'food', amount: 10 }, { type: 'qualityCap', industry: 'retail', amount: 10 }] },
  // 物流
  { id: 'logi1', name: '配送網の最適化', desc: '物流センターが受け持てる店 +50%', category: 'industry', cost: 2_000_000_000, minutes: 360, requires: [], industry: 'logistics', effects: [{ type: 'logisticsRange', pct: 0.5 }] },
  { id: 'logi2', name: '在庫の一元管理', desc: '全業種の原価 -8%', category: 'industry', cost: 3_000_000_000, minutes: 480, requires: ['logi1'], industry: 'logistics', effects: [{ type: 'costReduction', industry: 'all', pct: 0.08 }] },
  // IT
  { id: 'it_app', name: 'スマホアプリ事業', desc: '店を持たずに稼げるアプリ事業を始める', category: 'industry', cost: 8_000_000_000, minutes: 480, requires: [], industry: 'it', effects: [{ type: 'appBusiness' }] },
  { id: 'it_app2', name: 'アプリの会員制度', desc: 'アプリ事業の売上 +60%', category: 'industry', cost: 20_000_000_000, minutes: 720, requires: ['it_app'], industry: 'it', effects: [{ type: 'appRevenue', pct: 0.6 }] },
  { id: 'it_ai', name: '需要予測AI', desc: '全業種のさばける客 +10%、原価 -5%', category: 'industry', cost: 30_000_000_000, minutes: 900, requires: ['it_app'], industry: 'it', effects: [{ type: 'capacity', industry: 'all', pct: 0.1 }, { type: 'costReduction', industry: 'all', pct: 0.05 }] },
];

export const researchById = new Map(RESEARCH.map((r) => [r.id, r]));
