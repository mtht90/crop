// ============================================================================
// ワードローブ: looks only, never strength. Bought with gems.
//   sleeve  the back of the cards (everywhere a card back is drawn)
//   mat     the battle background (default: it follows the terrain / the rival)
//   title   a line under your name in battle
// ============================================================================
export type CosmeticKind = 'sleeve' | 'mat' | 'title';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  /** gems; 0 = everyone has it */
  price: number;
  /** sleeve: a CSS filter put over the card-back picture */
  filter?: string;
  /** mat: the picture (story/ asset key) */
  art?: string;
  /** one line shown in the shop */
  note?: string;
}

export const SLEEVES: Cosmetic[] = [
  { id: 'sleeve-default', kind: 'sleeve', name: '銀の羅針', price: 0, filter: 'none', note: 'はじめから持っている裏面' },
  { id: 'sleeve-night', kind: 'sleeve', name: '夜闇', price: 20000, filter: 'brightness(0.5) contrast(1.25)' },
  { id: 'sleeve-gold', kind: 'sleeve', name: '黄金', price: 30000, filter: 'sepia(1) saturate(2.4) brightness(1.15)' },
  { id: 'sleeve-azure', kind: 'sleeve', name: '蒼穹', price: 30000, filter: 'sepia(1) hue-rotate(160deg) saturate(3) brightness(1.1)' },
  { id: 'sleeve-crimson', kind: 'sleeve', name: '紅蓮', price: 30000, filter: 'sepia(1) hue-rotate(-35deg) saturate(4) brightness(1.05)' },
  { id: 'sleeve-forest', kind: 'sleeve', name: '深緑', price: 30000, filter: 'sepia(1) hue-rotate(60deg) saturate(2.6)' },
  { id: 'sleeve-violet', kind: 'sleeve', name: '紫紺', price: 40000, filter: 'sepia(1) hue-rotate(225deg) saturate(3) brightness(1.1)' },
  { id: 'sleeve-rose', kind: 'sleeve', name: '薔薇', price: 40000, filter: 'sepia(1) hue-rotate(-70deg) saturate(3.2) brightness(1.2)' },
  { id: 'sleeve-ice', kind: 'sleeve', name: '氷晶', price: 60000, filter: 'sepia(0.7) hue-rotate(165deg) saturate(2) brightness(1.55) contrast(0.95)', note: '凍てつく白青' },
];

export const MATS: Cosmetic[] = [
  { id: 'mat-auto', kind: 'mat', name: 'おまかせ', price: 0, note: 'スタジアムや対戦相手に合わせて変わる' },
  { id: 'mat-farm', kind: 'mat', name: '麦畑', price: 30000, art: 'story/p-farmer' },
  { id: 'mat-coast', kind: 'mat', name: '潮騒の浜', price: 30000, art: 'story/landscape-coast' },
  { id: 'mat-desert', kind: 'mat', name: '赤砂の砂漠', price: 30000, art: 'story/landscape-desert' },
  { id: 'mat-snow', kind: 'mat', name: '雪原', price: 40000, art: 'story/p-snowfield' },
  { id: 'mat-forest', kind: 'mat', name: '黒い森', price: 40000, art: 'story/p-black-forest' },
  { id: 'mat-tree', kind: 'mat', name: '大樹の丘', price: 50000, art: 'story/p-great-tree' },
  { id: 'mat-castle', kind: 'mat', name: '王城', price: 60000, art: 'story/landscape-castle' },
  { id: 'mat-storm', kind: 'mat', name: '嵐の海', price: 80000, art: 'story/p-storm-sea' },
  { id: 'mat-shrine', kind: 'mat', name: '始まりの庭', price: 100000, art: 'story/p-shrine' },
];

export const TITLES: Cosmetic[] = [
  { id: 'title-none', kind: 'title', name: '称号なし', price: 0 },
  { id: 'title-rookie', kind: 'title', name: '新米トレーナー', price: 20000 },
  { id: 'title-swordsman', kind: 'title', name: '旅の剣士', price: 30000 },
  { id: 'title-quiet', kind: 'title', name: '静かな勝負師', price: 40000 },
  { id: 'title-collector', kind: 'title', name: 'カード蒐集家', price: 60000 },
  { id: 'title-pilgrim', kind: 'title', name: '灰の巡礼者', price: 80000 },
  { id: 'title-star', kind: 'title', name: '星を集める者', price: 120000 },
  { id: 'title-heir', kind: 'title', name: '十二枚の継承者', price: 160000 },
  { id: 'title-legend', kind: 'title', name: '伝説の目撃者', price: 200000 },
];

export const COSMETICS: Cosmetic[] = [...SLEEVES, ...MATS, ...TITLES];
export const cosmeticById = (id: string) => COSMETICS.find((c) => c.id === id);
export const DEFAULT_LOOK = { sleeve: 'sleeve-default', mat: 'mat-auto', title: 'title-none' } as const;

export interface Wardrobe {
  owned: string[];
  sleeve: string;
  mat: string;
  title: string;
}
export const freshWardrobe = (): Wardrobe => ({ owned: [...Object.values(DEFAULT_LOOK)], ...DEFAULT_LOOK });

/** a save's wardrobe, repaired (anything unknown falls back to the default) */
export function cleanWardrobe(w: Partial<Wardrobe> | undefined): Wardrobe {
  const base = freshWardrobe();
  const owned = new Set([...base.owned, ...(w?.owned ?? []).filter((id) => cosmeticById(id))]);
  const pick = (kind: CosmeticKind, id: string | undefined, fallback: string) => (id && owned.has(id) && cosmeticById(id)?.kind === kind ? id : fallback);
  return { owned: [...owned], sleeve: pick('sleeve', w?.sleeve, DEFAULT_LOOK.sleeve), mat: pick('mat', w?.mat, DEFAULT_LOOK.mat), title: pick('title', w?.title, DEFAULT_LOOK.title) };
}
