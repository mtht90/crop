export interface UpgradeDef {
  id: string;
  name: string;
  price: number;
  level: number;
  icon: string;
  desc: string;
  /** 前提アップグレード */
  requires?: string;
  /** 1 日あたりの維持費 */
  upkeep?: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'cleaner', name: '洗浄キット', price: 9000, level: 1, icon: 'spray', desc: '清掃のスピードが 2 倍になる。' },
  { id: 'scale', name: '精密はかり', price: 15000, level: 2, icon: 'scales', desc: '査定時に重量の誤差 (%) が表示される。' },
  { id: 'tools', name: '修理工具セット', price: 22000, level: 2, icon: 'screwdriver', desc: '修理の成功率 +25%、部品代 -30%。' },
  { id: 'sign', name: '目立つ看板', price: 30000, level: 2, icon: 'wooden-sign', desc: '来店客が 25% 増える。' },
  { id: 'price_gun', name: '値付けガン', price: 18000, level: 2, icon: 'price-tag', desc: '値札のない陳列品に、相場の指定 % で一括値付けできる。' },
  { id: 'flyer', name: '買取チラシ', price: 20000, level: 3, icon: 'newspaper', desc: '売りに来る客が増え、良い品が集まりやすくなる。' },
  { id: 'loupe', name: '鑑定ルーペ Pro', price: 48000, level: 3, icon: 'magnifying-glass', desc: '刻印の怪しい文字がハイライトされる。' },
  { id: 'aircon', name: 'エアコン', price: 38000, level: 3, icon: 'sun', desc: '店内が快適になり、客の我慢強さ +20%。', upkeep: 800 },
  { id: 'cashier', name: 'レジ係を雇う', price: 30000, level: 4, icon: 'person', desc: 'レジ会計を自動で行う (日給 ¥9,000)。', upkeep: 9000 },
  { id: 'stocker', name: '品出しスタッフを雇う', price: 35000, level: 4, icon: 'cardboard-box', desc: '在庫のきれいな商品を空いた棚へ並べ、相場どおりに値札をつけてくれる (日給 ¥8,000)。', upkeep: 8000 },
  { id: 'hours', name: '営業時間延長', price: 45000, level: 5, icon: 'alarm-clock', desc: '閉店が 21:00 になる。', upkeep: 1500 },
  { id: 'expand', name: '店舗拡張', price: 220000, level: 5, icon: 'upgrade', desc: '隣の区画を借りて売り場を広げる (家賃 +¥6,000/日)。', upkeep: 6000 },
];

export const upgradeDef = (id: string) => UPGRADES.find((u) => u.id === id)!;
