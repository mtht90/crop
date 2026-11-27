import type { CardDef, CardId, GroupDef, HeroDef, HeroId, StageDef, StageId, TileDef } from '../game/types.ts';

export const GROUPS: GroupDef[] = [
  { name: '若葉の野', color: '#6fcf5a' },
  { name: '妖精の森', color: '#2fb59a' },
  { name: '蒼の海岸', color: '#3c8ee8' },
  { name: '鉄の山脈', color: '#f08a3c' },
  { name: '魔導の地', color: '#a05ce8' },
  { name: '黄金の都', color: '#f2c230' },
];

// 1周30マスの六角形の輪。index 0 がスタート。5の倍数が角マス。
export const TILES: TileDef[] = [
  { kind: 'start', name: '王都の門', icon: 'crown' },
  { kind: 'prop', name: '麦畑の村', icon: 'wheat', group: 0, price: 60 },
  { kind: 'prop', name: '風車の丘', icon: 'windmill', group: 0, price: 70 },
  { kind: 'shrine', name: '精霊の祠', icon: 'card-pickup' },
  { kind: 'prop', name: '水車の里', icon: 'water-mill', group: 0, price: 80 },
  { kind: 'tavern', name: '酒場', icon: 'beer-stein' },
  { kind: 'prop', name: '古樹の森', icon: 'forest', group: 1, price: 100 },
  { kind: 'event', name: '運命の巻物', icon: 'scroll-unfurled' },
  { kind: 'prop', name: 'キノコの谷', icon: 'mushroom-house', group: 1, price: 110 },
  { kind: 'prop', name: 'フクロウの塔', icon: 'owl', group: 1, price: 120 },
  { kind: 'dungeon', name: '地下牢', icon: 'dungeon-gate' },
  { kind: 'prop', name: '錨の港町', icon: 'anchor', group: 2, price: 140 },
  { kind: 'prop', name: '灯台の岬', icon: 'lighthouse', group: 2, price: 150 },
  { kind: 'shrine', name: '精霊の祠', icon: 'card-pickup' },
  { kind: 'prop', name: '海竜の入江', icon: 'sea-dragon', group: 2, price: 160 },
  { kind: 'jackpot', name: '黄金の泉', icon: 'fountain' },
  { kind: 'prop', name: '鍛冶の街', icon: 'anvil', group: 3, price: 180 },
  { kind: 'tax', name: '竜の関所', icon: 'spiked-dragon-head' },
  { kind: 'prop', name: '黄金鉱山', icon: 'gold-mine', group: 3, price: 190 },
  { kind: 'prop', name: '巨人の砦', icon: 'stone-tower', group: 3, price: 200 },
  { kind: 'cathedral', name: '大聖堂', icon: 'church' },
  { kind: 'prop', name: '魔術学院', icon: 'spell-book', group: 4, price: 220 },
  { kind: 'shrine', name: '精霊の祠', icon: 'card-pickup' },
  { kind: 'prop', name: '水晶の塔', icon: 'crystal-cluster', group: 4, price: 240 },
  { kind: 'prop', name: '星詠みの館', icon: 'crystal-ball', group: 4, price: 260 },
  { kind: 'portal', name: '転移の魔法陣', icon: 'magic-portal' },
  { kind: 'prop', name: '天空神殿', icon: 'ancient-columns', group: 5, price: 280 },
  { kind: 'event', name: '運命の巻物', icon: 'scroll-unfurled' },
  { kind: 'prop', name: '王立宝物庫', icon: 'open-treasure-chest', group: 5, price: 310 },
  { kind: 'prop', name: '白亜の王城', icon: 'castle', group: 5, price: 350 },
];

export const LEVEL_NAMES = ['空き地', '村', '町', '城塞', '王国の象徴'];
/** 通行料 = 価格 × 係数（レベル別） */
export const TOLL_MUL = [0.25, 0.8, 1.7, 3.0, 4.8];
/** 建設費 = 価格 × 係数 */
export const BUILD_MUL = 0.55;
export const MAX_LEVEL = 4;
export const SET_BONUS = 2;
export const FESTIVAL_MUL = 2;
export const TAKEOVER_MUL = 1.4;

export const CARDS: Record<CardId, CardDef> = {
  boots: { id: 'boots', name: '疾風のブーツ', icon: 'boots', rarity: 'common', target: 'none', active: true, unlockLevel: 1, desc: 'このターン、出目に +3 する。' },
  twin: { id: 'twin', name: '三つ子のダイス', icon: 'rolling-dices', rarity: 'common', target: 'none', active: true, unlockLevel: 1, desc: 'このターン、サイコロを3個振る。' },
  purse: { id: 'purse', name: '金貨の袋', icon: 'two-coins', rarity: 'common', target: 'none', active: true, unlockLevel: 1, desc: 'すぐに 150G を得る。' },
  shield: { id: 'shield', name: '鉄壁の盾', icon: 'magic-shield', rarity: 'common', target: 'none', active: false, unlockLevel: 1, desc: '通行料を払うときに使える。支払いを0にする。' },
  precise: { id: 'precise', name: '精密ダイス', icon: 'perspective-dice-six-faces-random', rarity: 'rare', target: 'number', active: true, unlockLevel: 1, desc: '出目の合計を 2〜12 から好きに選ぶ。' },
  quake: { id: 'quake', name: '大地震', icon: 'earth-crack', rarity: 'rare', target: 'enemyTile', active: true, unlockLevel: 1, desc: '相手の土地を1つ選び、建物を1段階こわす。' },
  thieves: { id: 'thieves', name: '盗賊団', icon: 'robber', rarity: 'rare', target: 'none', active: true, unlockLevel: 2, desc: '一番お金持ちの相手から 15% を奪う（最大400G）。' },
  festival: { id: 'festival', name: '収穫祭', icon: 'party-popper', rarity: 'rare', target: 'ownTile', active: true, unlockLevel: 3, desc: '自分の土地を1つ選ぶ。3ラウンドの間、通行料が2倍。' },
  teleport: { id: 'teleport', name: '転移の書', icon: 'teleport', rarity: 'rare', target: 'anyTile', active: true, unlockLevel: 4, desc: 'サイコロを振らずに好きなマスへ移動する。' },
  dragon: { id: 'dragon', name: '竜の召喚', icon: 'fire-breath', rarity: 'epic', target: 'enemyTile', active: true, unlockLevel: 5, desc: '相手の土地に竜を放つ。3ラウンドの間、通行料が入らない。' },
  edict: { id: 'edict', name: '王の勅命', icon: 'gavel', rarity: 'epic', target: 'enemyTile', active: true, unlockLevel: 7, desc: '相手の土地を価格の1.3倍で強制的に買い取る（象徴は不可）。' },
  goldrain: { id: 'goldrain', name: '黄金の雨', icon: 'gold-bar', rarity: 'epic', target: 'none', active: true, unlockLevel: 9, desc: '3ラウンドの間、受け取る通行料が1.5倍。' },
};

export const RARITY_WEIGHT = { common: 60, rare: 30, epic: 10 };
export const RARITY_NAME = { common: 'コモン', rare: 'レア', epic: 'エピック' };

export const HEROES: Record<HeroId, HeroDef> = {
  knight: { id: 'knight', name: 'レオン', title: '誓いの騎士', icon: 'visored-helm', model: 'Knight', cost: 0, passive: '支払う通行料が 20% 安い。' },
  merchant: { id: 'merchant', name: 'ミラ', title: '旅の商人', icon: 'swap-bag', model: 'Rogue', cost: 0, passive: '土地の購入と建設が 10% 安い。' },
  mage: { id: 'mage', name: 'ルナ', title: '夜空の魔女', icon: 'pointy-hat', model: 'Mage', cost: 300, passive: '手札4枚。最初からカード2枚。祠でときどき2枚引く。' },
  ranger: { id: 'ranger', name: 'カイ', title: '風読みの狩人', icon: 'bow-arrow', model: 'Ranger', cost: 500, passive: 'ゾロ目が出やすく、祠でレアカードを引きやすい。' },
  assassin: { id: 'assassin', name: 'ジン', title: '影の暗殺者', icon: 'hooded-figure', model: 'Rogue_Hooded', cost: 800, passive: '相手を追い越すたびに 40G を奪う。' },
  barbarian: { id: 'barbarian', name: 'ボルグ', title: '略奪王', icon: 'barbarian', model: 'Barbarian', cost: 1200, passive: '買収が土地の価値ちょうどで済み（通常1.4倍）、奪った土地が1段階育つ。' },
};
export const HERO_ORDER: HeroId[] = ['knight', 'merchant', 'mage', 'ranger', 'assassin', 'barbarian'];

export const STAGES: Record<StageId, StageDef> = {
  meadow: {
    id: 'meadow', name: '翠緑の王国', desc: '穏やかな草原の島。まずはここで王を目指そう。', unlockLevel: 1,
    tollMul: 1, startCash: 1300, salary: 200, jackpotMul: 1, aiSkill: 0.35,
    palette: { skyTop: '#5fa8f0', skyBottom: '#d8f0ff', fog: '#cfe8fb', grass: '#7cc95a', grassDark: '#4f9a3c', rock: '#8a7462', plaza: '#e8dcc0', sun: '#fff1d6', ambient: '#bfe0ff', particle: 'pollen' },
  },
  snow: {
    id: 'snow', name: '白銀の王国', desc: '雪に閉ざされた島。CPUが少し賢くなる。通行料 1.2倍。', unlockLevel: 3,
    tollMul: 1.2, startCash: 1500, salary: 220, jackpotMul: 1.2, aiSkill: 0.6,
    palette: { skyTop: '#7f9fc4', skyBottom: '#e9f2fb', fog: '#e2ecf7', grass: '#eef4fa', grassDark: '#c3d3e4', rock: '#6e7b8c', plaza: '#d6e2ef', sun: '#e8f1ff', ambient: '#c9dcf5', particle: 'snow' },
  },
  volcano: {
    id: 'volcano', name: '灼熱の王国', desc: '溶岩が流れる島。通行料 1.5倍、ジャックポット 1.5倍。CPUは手強い。', unlockLevel: 6,
    tollMul: 1.5, startCash: 1600, salary: 240, jackpotMul: 1.5, aiSkill: 0.8,
    palette: { skyTop: '#2a1420', skyBottom: '#c2502e', fog: '#5a2a26', grass: '#5d4a40', grassDark: '#3a2c27', rock: '#2d2321', plaza: '#a58a72', sun: '#ffb27a', ambient: '#a04a3a', particle: 'ember' },
  },
  sky: {
    id: 'sky', name: '天空の王国', desc: '雲の上の伝説の島。所持金 2000G、ジャックポット 2倍。CPUは最強。', unlockLevel: 10,
    tollMul: 1.6, startCash: 2000, salary: 260, jackpotMul: 2, aiSkill: 1,
    palette: { skyTop: '#1a1f5c', skyBottom: '#f3a8c8', fog: '#c9a8d8', grass: '#b8e3d0', grassDark: '#86c2ae', rock: '#e8e0f0', plaza: '#fff4dc', sun: '#ffe7f2', ambient: '#b7a6ff', particle: 'stars' },
  },
};
export const STAGE_ORDER: StageId[] = ['meadow', 'snow', 'volcano', 'sky'];

export const PLAYER_COLORS = ['#e8483f', '#3b8eea', '#47c26b', '#f2b630'];
/** KayKit の建物・駒台の色名（PLAYER_COLORS と同じ順） */
export const PLAYER_KEYS = ['red', 'blue', 'green', 'yellow'] as const;
export const CPU_NAMES = ['CPU 赤', 'CPU 青', 'CPU 緑', 'CPU 金'];
