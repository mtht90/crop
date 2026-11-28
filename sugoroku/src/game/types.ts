// ゲーム全体で共有する型。描画やUIに依存しない純粋なデータだけを置く。
// v4：カードバトルで領地を奪い合う陣取り（王国カードバトル）

export type HeroId = 'knight' | 'merchant' | 'mage' | 'ranger' | 'assassin' | 'barbarian';
export type StageId = 'meadow' | 'snow' | 'volcano' | 'sky';
export type Rarity = 'common' | 'rare' | 'epic';

/** 能力（キーワード） */
export type Keyword = 'guard' | 'rush' | 'ranged' | 'shield';

/** 召喚時・呪文の効果 */
export type Effect =
  | { kind: 'damage'; n: number; target: 'enemyAny' | 'enemyUnit' | 'enemyFace' } // 敵1体か城に n
  | { kind: 'aoe'; n: number } // 敵の兵全員に n
  | { kind: 'heal'; n: number } // 自分の城を n 回復
  | { kind: 'buff'; atk: number; hp: number; shield?: boolean } // 味方1体を強化
  | { kind: 'buffAll'; atk: number; hp: number } // 味方全員を強化
  | { kind: 'draw'; n: number }
  | { kind: 'summon'; card: string; count: number }
  | { kind: 'siege'; n: number }; // 自分のターン終了時、敵の城に n（兵の能力）

export interface CardDef {
  id: string;
  name: string;
  icon: string;
  type: 'unit' | 'spell';
  cost: number;
  atk?: number;
  hp?: number;
  kw?: Keyword[];
  /** 兵：召喚時の効果（siege はターン終了時）。呪文：使ったときの効果 */
  fx?: Effect[];
  rarity: Rarity;
  /** トークン（デッキには入らない） */
  token?: boolean;
  /** 開放されるプレイヤーレベル（報酬の候補に入る） */
  unlockLevel: number;
  /** 魔物のカード（中立の領地の守り手） */
  monster?: boolean;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  icon: string;
  model: string; // public/models/adv/ のファイル名（拡張子なし）
  passive: string;
  cost: number; // 0 = 最初から使える
  signature: string; // 初期デッキに入る得意カード
}

export interface StageDef {
  id: StageId;
  name: string;
  desc: string;
  unlockLevel: number;
  aiSkill: number; // 0..1
  neutralBonus: number; // 中立の守り手の強さ（城の体力に足す）
  palette: {
    skyTop: string; skyBottom: string; fog: string;
    grass: string; grassDark: string; rock: string; plaza: string;
    sun: string; ambient: string; particle: 'pollen' | 'snow' | 'ember' | 'stars';
  };
}

export type Personality = 'careful' | 'greedy' | 'gambler';

export type RegionKind = 'capital' | 'forest' | 'mine' | 'goblin' | 'grave' | 'tower' | 'harbor' | 'fort' | 'spider' | 'dragon';

export interface RegionDef {
  id: number;
  name: string;
  kind: RegionKind;
  icon: string;
  /** 中立の守りの城の体力 */
  hp: number;
  /** 勝つと選べる報酬カードの候補 */
  pool: string[];
  /** 中立の守り手のデッキ */
  defenders: string[];
  /** 六角座標の種（この点に一番近い陸のマスがこの領地になる） */
  seed: [number, number];
  /** 開始時の持ち主（プレイヤー番号）。null は中立 */
  start: number | null;
}

export interface LordStats {
  battlesWon: number;
  battlesLost: number;
  regionsTaken: number;
  maxRegions: number;
  capitalsTaken: number;
  dragonSlain: boolean;
  cardsGained: number;
  bestDamage: number; // 1ターンで城に与えた最大ダメージ
  lowestRankSeen: number;
  flawless: number; // 城に傷を負わずに勝った回数
}

export interface Lord {
  id: number;
  name: string;
  hero: HeroId;
  human: boolean;
  personality: Personality;
  deck: string[]; // 遠征のデッキ（カードIDの並び）
  alive: boolean;
  stats: LordStats;
}

export interface CampaignConfig {
  stage: StageId;
  rounds: number;
  heroes: HeroId[]; // index 0 = 人間
  names: string[];
  humanIndex: number; // -1 なら全員CPU（シミュレーション用）
  cardPool: string[]; // 報酬に出てよいカード（開放済み）
  seed: number;
}
