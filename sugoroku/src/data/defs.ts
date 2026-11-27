import type { CardRef, UpgradeDef, CardDef, CardId, GroupDef, HeroDef, HeroId, StageDef, StageId, TileDef } from '../game/types.ts';

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

export const LEVEL_NAMES = ['旗', '砦', '城塞', '王城'];
export const MAX_LEVEL = 3;

/** 経済の数値（すべて陣の値段 price × ステージ倍率が基準） */
export const ECON = {
  income: 0.07, // 毎ターンの税収：price × income × (1 + 砦の段階)
  toll: 0.12, // 相手の陣に止まったときの通行税：price × toll × (1 + 砦の段階)
  steal: 1.7, // 奪う値段：price × (steal + stealPerLevel × 段階)
  stealPerLevel: 1.0,
  fort: 0.5, // 砦を1段階築く値段：price × fort
  setIncome: 2, // 同じ色の陣を全部持つと税収が2倍
  energy: 3, // 毎ターンの行動力
  hand: 5, // 毎ターンの最初に引く枚数（使わなかったカードはターン終了時に捨て札へ）
  trap: 100, // 罠を踏んだときに払う額
};

export const CARDS: Record<CardId, CardDef> = {
  // 移動（1ターン1枚まで）
  walk: { id: 'walk', name: '歩く', icon: 'boots', rarity: 'common', cost: 0, move: true, target: 'none', price: 20, unlockLevel: 1, desc: '1マス進む。' },
  dice: { id: 'dice', name: 'サイコロ', icon: 'perspective-dice-six-faces-random', rarity: 'common', cost: 1, move: true, target: 'none', price: 60, unlockLevel: 1, desc: 'サイコロ1個を振って進む。' },
  twin: { id: 'twin', name: '双子のサイコロ', icon: 'rolling-dices', rarity: 'rare', cost: 2, move: true, target: 'none', price: 130, unlockLevel: 1, desc: 'サイコロ2個を振って進む。ゾロ目ならカードを1枚引く。' },
  aim: { id: 'aim', name: '狙い撃ち', icon: 'flag-objective', rarity: 'common', cost: 1, move: true, target: 'steps', steps: [2, 3, 4], price: 80, unlockLevel: 1, desc: '2〜4マスから選んで進む。' },
  gale: { id: 'gale', name: '疾風', icon: 'fast-forward-button', rarity: 'rare', cost: 2, move: true, target: 'steps', steps: [5, 6, 7, 8], price: 140, unlockLevel: 1, desc: '5〜8マスから選んで進む。' },
  retreat: { id: 'retreat', name: '引き返す', icon: 'exit-door', rarity: 'common', cost: 1, move: true, target: 'steps', steps: [-1, -2, -3], price: 70, unlockLevel: 2, desc: '1〜3マス戻る。' },
  teleport: { id: 'teleport', exhaust: true, name: '転移の書', icon: 'teleport', rarity: 'epic', cost: 3, move: true, target: 'anyTile', price: 220, unlockLevel: 4, desc: '好きなマスへ移動する。' },
  // 陣
  banner: { id: 'banner', name: '旗手', icon: 'tower-flag', rarity: 'rare', cost: 1, move: false, target: 'emptyTile', price: 120, unlockLevel: 1, desc: '前後3マス以内の空いた陣に、値段を払って旗を立てる。' },
  march: { id: 'march', name: '進軍', icon: 'barbarian', rarity: 'rare', cost: 2, move: false, target: 'enemyTile', price: 150, unlockLevel: 2, desc: '今いるマスか隣の、相手の陣を半額で奪う。' },
  fortify: { id: 'fortify', name: '築城', icon: 'hammer-drop', rarity: 'common', cost: 1, move: false, target: 'ownTile', price: 90, unlockLevel: 1, desc: '自分の陣を1つ選び、値段を払って砦を1段階築く（どこからでも）。' },
  guard: { id: 'guard', name: '守りの結界', icon: 'magic-shield', rarity: 'common', cost: 1, move: false, target: 'ownTile', price: 80, unlockLevel: 1, desc: '自分の陣を1つ選ぶ。3ラウンドの間、誰にも奪われない。' },
  edict: { id: 'edict', exhaust: true, name: '王の勅命', icon: 'gavel', rarity: 'epic', cost: 3, move: false, target: 'enemyTile', price: 240, unlockLevel: 6, desc: 'どこにある相手の陣でも、奪う値段を払って奪う。' },
  // お金・手札
  purse: { id: 'purse', name: '金貨の袋', icon: 'two-coins', rarity: 'common', cost: 0, move: false, target: 'none', price: 50, unlockLevel: 1, desc: 'すぐに 80G を得る。' },
  levy: { id: 'levy', name: '徴税', icon: 'receive-money', rarity: 'rare', cost: 1, move: false, target: 'none', price: 130, unlockLevel: 3, desc: '自分の陣の税収を、もう1回受け取る。' },
  scheme: { id: 'scheme', name: '作戦会議', icon: 'scroll-unfurled', rarity: 'common', cost: 1, move: false, target: 'none', price: 70, unlockLevel: 1, desc: 'カードを2枚引く。' },
  thieves: { id: 'thieves', name: '盗賊団', icon: 'robber', rarity: 'rare', cost: 2, move: false, target: 'none', price: 140, unlockLevel: 2, desc: '一番お金持ちの相手から 20% を奪う（最大300G）。' },
  // 攻撃・妨害
  trap: { id: 'trap', name: '落とし穴', icon: 'skull-crossed-bones', rarity: 'common', cost: 1, move: false, target: 'anyTile', price: 70, unlockLevel: 1, desc: '好きなマスに罠を仕掛ける。踏んだ相手は 100G をあなたに払う。' },
  quake: { id: 'quake', name: '大地震', icon: 'earth-crack', rarity: 'rare', cost: 2, move: false, target: 'enemyTile', price: 130, unlockLevel: 3, desc: '相手の陣の砦を1段階壊す。旗だけなら旗を倒して空き地にする。' },
  dragon: { id: 'dragon', exhaust: true, name: '竜の召喚', icon: 'fire-breath', rarity: 'epic', cost: 3, move: false, target: 'enemyTile', price: 260, unlockLevel: 5, desc: '相手の陣を焼き払い、空き地に戻す（結界があっても）。' },
};

/** 強化（+）の効果。カード屋や王の贈り物で強化できる */
export const UPGRADES: Record<CardId, UpgradeDef> = {
  walk: { desc: '2マス進む。' },
  dice: { desc: 'サイコロ1個を振り、出目 +1 だけ進む。' },
  twin: { cost: 1, desc: 'サイコロ2個を振って進む。ゾロ目ならカードを1枚引く。' },
  aim: { steps: [1, 2, 3, 4, 5], desc: '1〜5マスから選んで進む。' },
  gale: { steps: [4, 5, 6, 7, 8, 9], desc: '4〜9マスから選んで進む。' },
  retreat: { cost: 0, steps: [-1, -2, -3, -4], desc: '1〜4マス戻る。' },
  teleport: { cost: 2, desc: '好きなマスへ移動する。' },
  banner: { desc: '前後5マス以内の空いた陣に、2割引で旗を立てる。' },
  march: { desc: '2マス以内の相手の陣を半額で奪う。' },
  fortify: { desc: '自分の陣を1つ選び、値段を払って砦を2段階築く（どこからでも）。' },
  guard: { desc: '自分の陣を1つ選ぶ。5ラウンドの間、誰にも奪われない。' },
  edict: { desc: 'どこにある相手の陣でも、奪う値段の2割引で奪う。' },
  purse: { desc: 'すぐに 140G を得る。' },
  levy: { desc: '自分の陣の税収の1.5倍を、もう1回受け取る。' },
  scheme: { desc: 'カードを3枚引く。' },
  thieves: { desc: '一番お金持ちの相手から 30% を奪う（最大450G）。' },
  trap: { desc: '好きなマスに罠を仕掛ける。踏んだ相手は 200G をあなたに払う。' },
  quake: { desc: '相手の陣の砦を2段階壊す（砦が足りなければ旗も倒す）。' },
  dragon: { cost: 2, desc: '相手の陣を焼き払い、空き地に戻す（結界があっても）。' },
};

export const baseId = (r: CardRef): CardId => (r.endsWith('+') ? r.slice(0, -1) : r) as CardId;
export const isUp = (r: CardRef) => r.endsWith('+');
export const upRef = (id: CardId): CardRef => `${id}+`;

export interface CardView extends CardDef {
  ref: CardRef;
  up: boolean;
}
const cardCache = new Map<CardRef, CardView>();
/** デッキの1枚（強化済みも含む）の実際の性能 */
export function card(r: CardRef): CardView {
  let v = cardCache.get(r);
  if (!v) {
    const b = CARDS[baseId(r)];
    const up = isUp(r);
    const u = UPGRADES[b.id];
    v = { ...b, ref: r, up, name: up ? `${b.name}+` : b.name, cost: up && u.cost !== undefined ? u.cost : b.cost, steps: up && u.steps ? u.steps : b.steps, desc: up ? u.desc : b.desc };
    cardCache.set(r, v);
  }
  return v;
}

/** カードの種類（カード下の札に表示） */
export type CardKind = 'move' | 'land' | 'gold' | 'plan' | 'harm';
export const KIND_NAME: Record<CardKind, string> = { move: '移動', land: '陣', gold: '資金', plan: '策略', harm: '妨害' };
export const CARD_KIND: Record<CardId, CardKind> = {
  walk: 'move', dice: 'move', twin: 'move', aim: 'move', gale: 'move', retreat: 'move', teleport: 'move',
  banner: 'land', march: 'land', fortify: 'land', guard: 'land', edict: 'land',
  purse: 'gold', levy: 'gold', thieves: 'gold', scheme: 'plan',
  trap: 'harm', quake: 'harm', dragon: 'harm',
};

export const RARITY_WEIGHT = { common: 60, rare: 30, epic: 10 };
export const RARITY_NAME = { common: 'コモン', rare: 'レア', epic: 'エピック' };

const BASE_DECK: CardRef[] = ['walk', 'walk', 'dice', 'dice', 'dice', 'dice', 'aim', 'purse', 'fortify'];
export const HEROES: Record<HeroId, HeroDef> = {
  knight: { id: 'knight', name: 'レオン', title: '誓いの騎士', icon: 'visored-helm', model: 'Knight', cost: 0, passive: '自分の陣を奪う値段が 30% 高い。通行税が半額。', deck: [...BASE_DECK, 'guard'] },
  merchant: { id: 'merchant', name: 'ミラ', title: '旅の商人', icon: 'swap-bag', model: 'Rogue', cost: 0, passive: '旗を立てる値段とカードの値段が 10% 安い。', deck: [...BASE_DECK, 'purse'] },
  mage: { id: 'mage', name: 'ルナ', title: '夜空の魔女', icon: 'pointy-hat', model: 'Mage', cost: 300, passive: '手札が6枚まで。毎ターンの行動力が⚡4。', deck: [...BASE_DECK, 'twin'] },
  ranger: { id: 'ranger', name: 'カイ', title: '風読みの狩人', icon: 'bow-arrow', model: 'Ranger', cost: 500, passive: 'サイコロを振ったあと、出目を ±1 できる。', deck: [...BASE_DECK, 'gale'] },
  assassin: { id: 'assassin', name: 'ジン', title: '影の暗殺者', icon: 'hooded-figure', model: 'Rogue_Hooded', cost: 800, passive: '罠の威力が2倍。初期デッキに「落とし穴」2枚。', deck: [...BASE_DECK.filter((c) => c !== 'fortify'), 'trap', 'trap'] },
  barbarian: { id: 'barbarian', name: 'ボルグ', title: '略奪王', icon: 'barbarian', model: 'Barbarian', cost: 1200, passive: '最終決戦では陣を奪う値段が4割引（ふつうは3割引）。初期デッキに「進軍」。', deck: [...BASE_DECK, 'march'] },
};
export const HERO_ORDER: HeroId[] = ['knight', 'merchant', 'mage', 'ranger', 'assassin', 'barbarian'];

export const STAGES: Record<StageId, StageDef> = {
  meadow: {
    id: 'meadow', name: '翠緑の王国', desc: '穏やかな草原の島。まずはここで王を目指そう。', unlockLevel: 1,
    tollMul: 1, startCash: 500, salary: 150, jackpotMul: 1, aiSkill: 0.35,
    palette: { skyTop: '#5fa8f0', skyBottom: '#d8f0ff', fog: '#cfe8fb', grass: '#7cc95a', grassDark: '#4f9a3c', rock: '#8a7462', plaza: '#e8dcc0', sun: '#fff1d6', ambient: '#bfe0ff', particle: 'pollen' },
  },
  snow: {
    id: 'snow', name: '白銀の王国', desc: '雪に閉ざされた島。CPUが少し賢くなる。値段 1.2倍。', unlockLevel: 3,
    tollMul: 1.2, startCash: 550, salary: 170, jackpotMul: 1.2, aiSkill: 0.6,
    palette: { skyTop: '#7f9fc4', skyBottom: '#e9f2fb', fog: '#e2ecf7', grass: '#eef4fa', grassDark: '#c3d3e4', rock: '#6e7b8c', plaza: '#d6e2ef', sun: '#e8f1ff', ambient: '#c9dcf5', particle: 'snow' },
  },
  volcano: {
    id: 'volcano', name: '灼熱の王国', desc: '溶岩が流れる島。値段 1.5倍、ジャックポット 1.5倍。CPUは手強い。', unlockLevel: 6,
    tollMul: 1.5, startCash: 650, salary: 200, jackpotMul: 1.5, aiSkill: 0.8,
    palette: { skyTop: '#2a1420', skyBottom: '#c2502e', fog: '#5a2a26', grass: '#5d4a40', grassDark: '#3a2c27', rock: '#2d2321', plaza: '#a58a72', sun: '#ffb27a', ambient: '#a04a3a', particle: 'ember' },
  },
  sky: {
    id: 'sky', name: '天空の王国', desc: '雲の上の伝説の島。値段 1.6倍、ジャックポット 2倍。CPUは最強。', unlockLevel: 10,
    tollMul: 1.6, startCash: 800, salary: 220, jackpotMul: 2, aiSkill: 1,
    palette: { skyTop: '#1a1f5c', skyBottom: '#f3a8c8', fog: '#c9a8d8', grass: '#b8e3d0', grassDark: '#86c2ae', rock: '#e8e0f0', plaza: '#fff4dc', sun: '#ffe7f2', ambient: '#b7a6ff', particle: 'stars' },
  },
};
export const STAGE_ORDER: StageId[] = ['meadow', 'snow', 'volcano', 'sky'];

export const PLAYER_COLORS = ['#e8483f', '#3b8eea', '#47c26b', '#f2b630'];
/** KayKit の建物・駒台の色名（PLAYER_COLORS と同じ順） */
export const PLAYER_KEYS = ['red', 'blue', 'green', 'yellow'] as const;
export const CPU_NAMES = ['CPU 赤', 'CPU 青', 'CPU 緑', 'CPU 金'];
