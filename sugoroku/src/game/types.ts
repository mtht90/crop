// ゲーム全体で共有する型。描画やUIに依存しない純粋なデータだけを置く。

export type TileKind = 'start' | 'prop' | 'shrine' | 'event' | 'tax' | 'dungeon' | 'jackpot' | 'portal';

export interface TileDef {
  kind: TileKind;
  name: string;
  icon: string;
  group?: number; // prop のみ
  price?: number; // prop のみ
}

export interface GroupDef {
  name: string;
  color: string;
}

export type CardId =
  | 'boots' | 'twin' | 'purse' | 'shield'
  | 'precise' | 'quake' | 'thieves' | 'festival' | 'teleport'
  | 'dragon' | 'edict' | 'goldrain';

export type Rarity = 'common' | 'rare' | 'epic';

/** カードを使う対象の種類 */
export type CardTarget = 'none' | 'ownTile' | 'enemyTile' | 'anyTile' | 'number';

export interface CardDef {
  id: CardId;
  name: string;
  icon: string;
  rarity: Rarity;
  desc: string;
  target: CardTarget;
  /** 手番の最初に使うカードか（false は自動/反応で使う） */
  active: boolean;
  unlockLevel: number;
}

export type HeroId = 'knight' | 'merchant' | 'witch' | 'rogue' | 'princess' | 'dwarf' | 'dragoon' | 'fairy';

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  icon: string;
  color: string;
  passive: string;
  cost: number; // 0 = 最初から使える
}

export type StageId = 'meadow' | 'snow' | 'volcano' | 'sky';

export interface StageDef {
  id: StageId;
  name: string;
  desc: string;
  unlockLevel: number;
  tollMul: number;
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
  tollsPaid: number;
  tollsEarned: number;
  maxToll: number;
  takeovers: number;
  jackpots: number;
  landmarks: number;
  cardsUsed: number;
  monopoliesMax: number;
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
  hand: CardId[];
  jail: number; // 0 = 自由, >0 = 地下牢に閉じ込められている残りターン
  bankrupt: boolean;
  boots: number; // このターンの移動ボーナス
  goldRain: number; // 残りラウンド
  stats: PlayerStats;
}

export interface TileState {
  owner: number | null;
  level: number; // 0 = 土地のみ, 1..4
  festival: number; // 残りラウンド
  dragon: number; // 残りラウンド
}

export interface GameConfig {
  stage: StageId;
  rounds: number;
  heroes: HeroId[]; // index 0 = 人間
  names: string[];
  humanIndex: number; // -1 なら全員CPU（シミュレーション用）
  cardPool: CardId[];
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
  winReason: 'rounds' | 'unify' | 'bankrupt' | null;
}
