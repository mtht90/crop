/* 麺屋インク — ゲームデータ定義 */
(function (root) {
  const D = {};

  D.DAY_SEC = 3; // 1日 = 実時間3秒（1倍速）

  D.ITEMS = [
    { id: 'ramen', name: 'ラーメン', icon: 'bowl-steam', hue: '#e5484d', cost: 240, ref: 820, attach: 1 },
    { id: 'egg', name: '味玉', icon: 'egg', hue: '#f08c00', cost: 45, ref: 160, attach: 0.5 },
    { id: 'don', name: 'チャーシュー丼', icon: 'bowl-food', hue: '#a8612a', cost: 120, ref: 450, attach: 0.32 },
    { id: 'beer', name: 'ビール', icon: 'beer-stein', hue: '#d99a00', cost: 150, ref: 560, attach: 0.3 },
    { id: 'soft', name: 'ソフトクリーム', icon: 'ice-cream', hue: '#e2619f', cost: 60, ref: 300, attach: 0.25 },
    { id: 'ebi', name: 'えび天', icon: 'shrimp', hue: '#f76b15', cost: 85, ref: 480, attach: 0.26 },
  ];
  D.ITEM = Object.fromEntries(D.ITEMS.map((i) => [i.id, i]));

  // T: 人通り/日  w: 所得水準  rent: 家賃/日  rival: 競合の強さ  x,y: マップ座標
  D.DISTRICTS = [
    { id: 'jutaku', name: '住宅街', icon: 'house-line', T: 900, w: 0.95, rent: 14000, rival: 1.0, unlock: 0,
      pref: { egg: 1.35, don: 1.0, beer: 0.7, soft: 1.4, ebi: 0.9 }, x: 150, y: 470, hue: '#c9e7a0' },
    { id: 'gaku', name: '学生街', icon: 'student', T: 1120, w: 0.74, rent: 16000, rival: 1.3, unlock: 1.5e6,
      pref: { egg: 1.2, don: 1.5, beer: 0.5, soft: 1.0, ebi: 1.6 }, x: 165, y: 180, hue: '#ffd98a' },
    { id: 'minato', name: '港町', icon: 'anchor', T: 1020, w: 0.86, rent: 12000, rival: 0.9, unlock: 5e6,
      pref: { egg: 1.0, don: 1.6, beer: 1.4, soft: 0.6, ebi: 0.6 }, x: 875, y: 515, hue: '#a9dcef' },
    { id: 'eki', name: '駅前', icon: 'train', T: 1760, w: 1.0, rent: 42000, rival: 2.3, unlock: 1.4e7,
      pref: { egg: 1.1, don: 1.0, beer: 1.0, soft: 0.8, ebi: 1.1 }, x: 430, y: 172, hue: '#ffc9a8' },
    { id: 'office', name: 'オフィス街', icon: 'building-office', T: 1520, w: 1.3, rent: 56000, rival: 2.6, unlock: 4e7,
      pref: { egg: 0.9, don: 1.3, beer: 1.2, soft: 0.5, ebi: 0.8 }, x: 680, y: 165, hue: '#c8d3f5' },
    { id: 'kanko', name: '城下町', icon: 'castle-turret', T: 1360, w: 1.5, rent: 50000, rival: 1.9, unlock: 1e8,
      pref: { egg: 1.0, don: 0.8, beer: 1.0, soft: 2.0, ebi: 1.2 }, x: 665, y: 425, hue: '#f7c6d9' },
    { id: 'hanka', name: '繁華街', icon: 'moon-stars', T: 2000, w: 1.15, rent: 64000, rival: 3.0, unlock: 2.5e8,
      pref: { egg: 1.4, don: 0.9, beer: 2.0, soft: 0.7, ebi: 1.3 }, x: 395, y: 445, hue: '#e3c4f5' },
    { id: 'tower', name: 'タワー街', icon: 'buildings', T: 1280, w: 2.0, rent: 120000, rival: 3.4, unlock: 6e8,
      pref: { egg: 0.8, don: 0.7, beer: 1.3, soft: 1.2, ebi: 1.0 }, x: 890, y: 195, hue: '#ffe07a' },
  ];
  D.DISTRICT = Object.fromEntries(D.DISTRICTS.map((d) => [d.id, d]));

  D.SEATS = [16, 24, 36, 52, 72, 100];

  // 都市（転生レイヤー）
  D.CITIES = [
    { name: '東京', icon: 'cell-tower', mult: 1, w: 1, rival: 1, pref: {} },
    { name: '大阪', icon: 'castle-turret', mult: 8, w: 0.95, rival: 1.15, pref: { egg: 1.3, beer: 1.2 } },
    { name: '台北', icon: 'flower-lotus', mult: 64, w: 0.9, rival: 1.3, pref: { ebi: 1.8, soft: 1.2 } },
    { name: 'ニューヨーク', icon: 'city', mult: 512, w: 1.5, rival: 1.5, pref: { beer: 1.3, don: 1.2 } },
    { name: 'パリ', icon: 'wine', mult: 4096, w: 1.4, rival: 1.7, pref: { soft: 1.6 } },
    { name: '月面', icon: 'rocket-launch', mult: 32768, w: 2, rival: 2, pref: {} },
  ];

  D.MARKETING = [
    { id: 'flyer', name: 'チラシ', icon: 'newspaper', brand: 12, cost: 12000 },
    { id: 'sns', name: 'SNS', icon: 'device-mobile', brand: 20, cost: 55000 },
    { id: 'tv', name: 'テレビCM', icon: 'television', brand: 30, cost: 280000 },
    { id: 'mascot', name: 'マスコット', icon: 'smiley-sticker', brand: 16, cost: 110000, tech: 'mascot' },
  ];

  D.LAB = [
    { rp: 0, cost: 0 }, { rp: 1, cost: 18000 }, { rp: 2.5, cost: 60000 }, { rp: 5, cost: 160000 },
    { rp: 9, cost: 420000 }, { rp: 15, cost: 1000000 },
  ];

  // 研究ツリー（req: 前提）
  D.TECH = [
    { id: 'egg', name: '味玉', icon: 'egg', rp: 4, fx: 'サイドメニュー解禁' },
    { id: 'kiosk', name: '食券機', icon: 'ticket', rp: 8, fx: 'スタッフ処理 +25%' },
    { id: 'pos', name: 'POS分析', icon: 'chart-bar', rp: 10, fx: '最適価格のヒント表示' },
    { id: 'don', name: 'チャーシュー丼', icon: 'bowl-food', rp: 14, req: 'egg', fx: 'サイドメニュー解禁' },
    { id: 'delivery', name: 'デリバリー', icon: 'moped', rp: 30, req: 'kiosk', fx: '集客 +15%' },
    { id: 'mascot', name: 'マスコット', icon: 'smiley-sticker', rp: 30, req: 'pos', fx: '宣伝チャネル解禁' },
    { id: 'beer', name: 'ビール', icon: 'beer-stein', rp: 30, req: 'don', fx: 'サイドメニュー解禁' },
    { id: 'kitchen', name: 'セントラルキッチン', icon: 'factory', rp: 70, req: 'delivery', fx: '原価 −15%' },
    { id: 'tare', name: '秘伝のタレ', icon: 'pepper', rp: 60, req: 'mascot', fx: 'ラーメン品質 +15%' },
    { id: 'soft', name: 'ソフトクリーム', icon: 'ice-cream', rp: 60, req: 'beer', fx: 'サイドメニュー解禁' },
    { id: 'h24', name: '24時間営業', icon: 'clock-countdown', rp: 140, req: 'kitchen', fx: '座席回転 +30%' },
    { id: 'train', name: '研修制度', icon: 'graduation-cap', rp: 110, req: 'tare', fx: '全店の評判 +0.3' },
    { id: 'ebi', name: 'えび天', icon: 'shrimp', rp: 110, req: 'soft', fx: 'サイドメニュー解禁' },
    { id: 'robot', name: '配膳ロボ', icon: 'robot', rp: 240, req: 'h24', fx: '人件費 −25%' },
    { id: 'ai', name: '経営AI', icon: 'brain', rp: 320, req: 'train', fx: '放置収益 25% → 60%' },
  ];
  D.TECHS = Object.fromEntries(D.TECH.map((t) => [t.id, t]));

  // のれん（転生通貨）で買う永続パーク
  D.PERKS = [
    { id: 'sales', name: '売上', icon: 'chart-line-up', fx: '+10%', base: 2, max: 20 },
    { id: 'cost', name: '経費', icon: 'receipt', fx: '−4%', base: 3, max: 10 },
    { id: 'seed', name: '開業資金', icon: 'coins', fx: '×2', base: 2, max: 8 },
    { id: 'lab', name: '研究', icon: 'microscope', fx: '+30%', base: 3, max: 10 },
    { id: 'idle', name: '放置', icon: 'moon', fx: '+2時間', base: 2, max: 10 },
    { id: 'brand', name: '知名度', icon: 'megaphone', fx: '+5', base: 3, max: 8 },
  ];

  D.MGR_STATS = [
    { id: 'svc', name: '接客', icon: 'heart' },
    { id: 'eff', name: '効率', icon: 'lightning' },
    { id: 'frugal', name: '節約', icon: 'hand-coins' },
    { id: 'sales', name: '集客', icon: 'megaphone' },
  ];
  D.FACE_COUNT = 18; // assets/avatars/m{n}.svg
  D.MGR_NAMES = ['ハル', 'ソラ', 'リク', 'ミオ', 'レン', 'ユイ', 'カイ', 'アオイ', 'ナギ', 'ヒナ', 'トワ', 'メイ', 'ジン', 'サキ', 'ユウ', 'リン', 'シュン', 'ココ'];

  D.EVENTS = [
    { id: 'boom', name: 'ラーメンブーム', icon: 'fire', days: 8, good: true, traffic: 1.35 },
    { id: 'typhoon', name: '台風', icon: 'tornado', days: 4, good: false, traffic: 0.55 },
    { id: 'tv', name: 'テレビ取材', icon: 'television', days: 6, good: true, brand: 12 },
    { id: 'price', name: '食材高騰', icon: 'chart-line-up', days: 10, good: false, cogs: 1.25 },
    { id: 'fest', name: 'お祭り', icon: 'confetti', days: 5, good: true, traffic: 1.25, local: 2 },
    { id: 'war', name: 'ライバル値下げ', icon: 'sword', days: 8, good: false, rival: 1.6, local: 1 },
    { id: 'rain', name: '長雨', icon: 'cloud-rain', days: 6, good: false, traffic: 0.8 },
    { id: 'harvest', name: '豊作', icon: 'grains', days: 10, good: true, cogs: 0.8 },
  ];
  D.EVENT = Object.fromEntries(D.EVENTS.map((e) => [e.id, e]));

  // ミッション（アイコン + 進捗バーで導く）
  // kind: stores | profit | rep | brand | lab | tech | mgr | districts | share | value | items
  D.MISSIONS = [
    { kind: 'stores', n: 1, icon: 'storefront', cash: 3e5 },
    { kind: 'profit', n: 2e4, icon: 'hand-coins', cash: 5e5 },
    { kind: 'brand', n: 20, icon: 'megaphone', cash: 6e5 },
    { kind: 'lab', n: 1, icon: 'microscope', rp: 4 },
    { kind: 'items', n: 2, icon: 'egg', cash: 8e5 },
    { kind: 'rep', n: 3.8, icon: 'star', cash: 1e6 },
    { kind: 'stores', n: 3, icon: 'storefront', cash: 2e6 },
    { kind: 'mgr', n: 1, icon: 'identification-badge', cash: 1.5e6 },
    { kind: 'profit', n: 3e5, icon: 'coins', cash: 4e6 },
    { kind: 'districts', n: 4, icon: 'map-trifold', cash: 8e6 },
    { kind: 'tech', n: 6, icon: 'flask', rp: 20 },
    { kind: 'stores', n: 8, icon: 'buildings', cash: 2e7 },
    { kind: 'share', n: 50, icon: 'trophy', cash: 4e7 },
    { kind: 'profit', n: 3e6, icon: 'crown', cash: 8e7 },
    { kind: 'value', n: 3e8, icon: 'bank', cash: 1e8 },
    { kind: 'stores', n: 16, icon: 'city', cash: 2e8 },
    { kind: 'value', n: 1e9, icon: 'airplane-takeoff', cash: 0 },
  ];
  D.MISSION_LABEL = {
    stores: '店舗数', profit: '日次利益', rep: '評判', brand: '知名度', lab: '研究所', tech: '研究',
    mgr: '店長', districts: 'エリア', share: 'シェア', value: '企業価値', items: 'メニュー',
  };

  D.IPO_VALUE = 3e8;
  D.EXIT_VALUE = 1e9;

  root.MENYA_DATA = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
