import type { CategoryId } from './items';

export interface NewsDef {
  text: string;
  cat: CategoryId;
  /** 相場への影響 (乗算の増分) */
  effect: number;
  /** 何日続くか */
  days: number;
}

export const NEWS: NewsDef[] = [
  { text: '昭和レトロブーム到来！ラジカセや冷蔵庫に熱視線', cat: 'appliance', effect: 0.3, days: 4 },
  { text: '新型家電の値下げラッシュで中古家電の相場が軟調', cat: 'appliance', effect: -0.2, days: 3 },
  { text: '猛暑で冷蔵庫の買い替え需要が急増', cat: 'appliance', effect: 0.2, days: 3 },
  { text: '北欧インテリア特集がテレビで放送、家具に注目', cat: 'furniture', effect: 0.25, days: 4 },
  { text: '引っ越しシーズン終了、家具の中古在庫がだぶつく', cat: 'furniture', effect: -0.18, days: 3 },
  { text: '「おうちカフェ」がSNSで流行、キッチン雑貨が人気', cat: 'kitchen', effect: 0.22, days: 3 },
  { text: '100円ショップの新商品ラッシュで日用品が値崩れ', cat: 'kitchen', effect: -0.15, days: 3 },
  { text: '海外セレブの来日で高級ブランド需要が急上昇', cat: 'brand', effect: 0.35, days: 3 },
  { text: '偽ブランド品の大量摘発！ブランド中古市場が冷え込む', cat: 'brand', effect: -0.28, days: 4 },
  { text: '人気アニメ映画の公開でコスプレ小道具が品薄に', cat: 'hobby', effect: 0.35, days: 3 },
  { text: 'ホビーイベント閉幕、転売品が市場に大量流入', cat: 'hobby', effect: -0.22, days: 3 },
  { text: '人気鑑定番組で骨董特集！古美術品の相場が上昇', cat: 'antique', effect: 0.3, days: 4 },
  { text: '大手オークションで高額落札相次ぐ、骨董ブーム', cat: 'antique', effect: 0.22, days: 3 },
  { text: '骨董市の出品過多で相場がやや下落', cat: 'antique', effect: -0.15, days: 3 },
];

export const QUIET_NEWS = [
  '今日は穏やかな一日になりそうです。',
  '商店街で夏祭りの準備が始まりました。',
  '近所に新しいカフェがオープン。',
  '週末は晴れの予報。人出が期待できそう。',
];
