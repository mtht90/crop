// ゲーム全体で共有する型。描画やUIに依存しない純粋なデータだけを置く。
// v2：カードで動く陣取りすごろく（行動力⚡制・デッキ構築）

export type TileKind = 'start' | 'prop' | 'shrine' | 'event' | 'tax' | 'dungeon' | 'jackpot' | 'portal' | 'tavern' | 'cathedral';

export interface TileDef {
  kind: TileKind;
  name: string;
  icon: string;
  group?: number; // prop（陣）のみ
  price?: number; // prop（陣）のみ：旗を立てる値段
}

export interface GroupDef {
  name: string;
  color: string;
}

export type CardId =
  // 移動
  | 'walk' | 'dice' | 'twin' | 'aim' | 'gale' | 'retreat' | 'teleport'
  // 陣
  | 'banner' | 'march' | 'fortify' | 'guard' | 'edict'
  // お金・手札
  | 'purse' | 'levy' | 'scheme' | 'thieves'
  // 攻撃・妨害
  | 'trap' | 'quake' | 'dragon';

export type Rarity = 'common' | 'rare' | 'epic';

/** カードを使う対象 */
export type CardTarget = 'none' | 'ownTile' | 'enemyTile' | 'anyTile' | 'emptyTile' | 'steps';

export interface CardDef {
  id: CardId;
  name: string;
  icon: string;
  rarity: Rarity;
  cost: number; // 行動力⚡
  move: boolean; // 移動カード（1ターン1枚まで）
  desc: string;
  target: CardTarget;
  /** target が steps のとき、選べる歩数 */
  steps?: number[];
  price: number; // カード屋での値段
  unlockLevel: number;
}

export type HeroId = 'knight' | 'merchant' | 'mage' | 'ranger' | 'assassin' | 'barbarian';

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  icon: string;
  model: string; // public/models/adv/ のファイル名（拡張子なし）
  passive: string;
  cost: number; // 0 = 最初から使える
  deck: CardId[]; // 初期デッキ
}

export type StageId = 'meadow' | 'snow' | 'volcano' | 'sky';

export interface StageDef {
  id: StageId;
  name: string;
  desc: string;
  unlockLevel: number;
  tollMul: number; // 陣の値段・通行税・奪う値段の倍率
  startCash: number;
  salary: number;
  jackpotMul: number;
  aiSkill: number; // 0..1
  palette: {
    skyTop: string; skyBottom: string; fog: string;
    grass: string; grassDark: string; rock: string; plaza: string;
    sun: string; ambient: string; particle: 'pollen' | 'snow' | 'ember' | 'stars';
  };
}

export type Personality = 'careful' | 'greedy' | 'gambler';

export interface PlayerStats {
  claims: number; // 旗を立てた数
  takeovers: number; // 奪った数
  lost: number; // 奪われた数
  maxTerritories: number;
  jackpots: number;
  maxJackpot: number;
  forts: number; // 城塞まで築いた数
  cardsUsed: number;
  cardsBought: number;
  tollsEarned: number;
  maxToll: number;
  lowestRankSeen: number;
}

export interface Player {
  id: number;
  name: string;
  hero: HeroId;
  color: string;
  human: boolean;
  personality: Personality;
  cash: number;
  pos: number;
  deck: CardId[]; // 山札（末尾から引く）
  hand: CardId[];
  discard: CardId[];
  energy: number; // 今のターンの残り行動力
  moved: boolean; // このターンに移動カードを使ったか
  jail: number; // 0 = 自由、>0 = 地下牢にいる残りターン
  bankrupt: boolean;
  stats: PlayerStats;
}

export interface TileState {
  owner: number | null;
  level: number; // 砦の段階 0 = 旗のみ、1 = 砦、2 = 城塞、3 = 王城
  guard: number; // 守りの結界が残るラウンド数（奪えない）
  trap: number | null; // 罠を仕掛けたプレイヤー
}

export interface GameConfig {
  stage: StageId;
  rounds: number;
  heroes: HeroId[]; // index 0 = 人間
  names: string[];
  humanIndex: number; // -1 なら全員CPU（シミュレーション用）
  cardPool: CardId[]; // カード屋に並ぶカード
  seed: number;
}

export interface GameState {
  cfg: GameConfig;
  players: Player[];
  tiles: TileState[];
  round: number;
  turn: number; // players の index
  jackpot: number;
  over: boolean;
  winner: number | null;
  winReason: 'rounds' | 'conquest' | 'bankrupt' | null;
}
