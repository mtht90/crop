// 商品。店（飲食・小売）は、解禁した商品を売る。価格は店ごと・商品ごとに決める。
// refPrice: 品質50のときの「ふつうの値段」。weight: 来た客がこれを買う割合の目安。
import type { IndustryId } from './buildings';

export interface ProductConfig {
  id: string;
  name: string;
  industry: IndustryId;
  refPrice: number;
  baseCost: number;
  weight: number;
  /** 研究で解禁する場合の研究ID（無ければ最初から売れる） */
  research?: string;
  /** 価格の刻み */
  priceStep: number;
}

export const PRODUCTS: ProductConfig[] = [
  // 飲食
  { id: 'coffee', name: 'コーヒー', industry: 'food', refPrice: 420, baseCost: 90, weight: 0.85, priceStep: 10 },
  { id: 'tea', name: '紅茶', industry: 'food', refPrice: 450, baseCost: 80, weight: 0.3, priceStep: 10 },
  { id: 'sandwich', name: 'サンドイッチ', industry: 'food', refPrice: 580, baseCost: 210, weight: 0.4, research: 'food_menu1', priceStep: 10 },
  { id: 'cake', name: 'ケーキ', industry: 'food', refPrice: 520, baseCost: 170, weight: 0.35, research: 'food_menu2', priceStep: 10 },
  { id: 'lunch', name: 'ランチセット', industry: 'food', refPrice: 1100, baseCost: 420, weight: 0.3, research: 'food_menu3', priceStep: 50 },
  // 小売
  { id: 'snacks', name: 'お菓子', industry: 'retail', refPrice: 180, baseCost: 95, weight: 0.7, priceStep: 10 },
  { id: 'drinks', name: '飲み物', industry: 'retail', refPrice: 150, baseCost: 70, weight: 0.8, priceStep: 10 },
  { id: 'bento', name: 'お弁当', industry: 'retail', refPrice: 550, baseCost: 330, weight: 0.45, priceStep: 10 },
  { id: 'daily', name: '日用品', industry: 'retail', refPrice: 400, baseCost: 230, weight: 0.3, research: 'retail_menu1', priceStep: 10 },
  { id: 'cosme', name: '化粧品', industry: 'retail', refPrice: 1500, baseCost: 800, weight: 0.12, research: 'retail_menu2', priceStep: 50 },
];

export const productById = new Map(PRODUCTS.map((p) => [p.id, p]));
