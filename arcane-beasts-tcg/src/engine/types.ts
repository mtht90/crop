// ============================================================================
// ARCANE BEASTS — core type definitions
// ============================================================================

export type EType =
  | 'fire'
  | 'water'
  | 'grass'
  | 'lightning'
  | 'psychic'
  | 'fighting'
  | 'dark'
  | 'colorless';

export const ENERGY_TYPES: EType[] = ['fire', 'water', 'grass', 'lightning', 'psychic', 'fighting', 'dark'];
export const ALL_TYPES: EType[] = [...ENERGY_TYPES, 'colorless'];

export type Stage = 'basic' | 'stage1' | 'stage2';
/** ◇ ◇◇ ◇◇◇ ◇◇◇◇ ☆ ♛ */
export type Rarity = 'C' | 'U' | 'R' | 'RR' | 'ST' | 'CR';
export type SetCode = 'AB1' | 'AB2';
/** Alternate printings of a base card */
export type Variant = 'mirror' | 'AR' | 'CHR' | 'S' | 'SR' | 'SAR' | 'UR';
export type Condition = 'poisoned' | 'burned' | 'asleep' | 'paralyzed' | 'confused';

// ---------------------------------------------------------------------------
// Effect specs (data-driven attack effects)
// ---------------------------------------------------------------------------
export type Target = 'self' | 'opp';

export type AttackEffect =
  | { k: 'flipMulti'; flips: number; per: number } // flip N coins, per heads damage (replaces base)
  | { k: 'flipUntilTails'; per: number }
  | { k: 'flipBonus'; bonus: number } // heads: +bonus
  | { k: 'flipFail' } // tails: attack does nothing
  | { k: 'condition'; cond: Condition; flip?: boolean }
  | { k: 'selfCondition'; cond: Condition }
  | { k: 'selfDamage'; n: number }
  | { k: 'healSelf'; n: number }
  | { k: 'benchSnipe'; n: number; count?: number } // choose opponent's benched monster(s)
  | { k: 'anySnipe'; n: number } // choose any opponent monster (no W/R)
  | { k: 'spread'; n: number } // each opponent benched monster
  | { k: 'discardSelfEnergy'; n: number | 'all'; type?: EType }
  | { k: 'discardOppEnergy'; n: number; flip?: boolean }
  | { k: 'draw'; n: number }
  | { k: 'searchEnergyAttach'; n: number; type: EType; from: 'deck' | 'discard'; to: 'any' | 'bench' | 'self' }
  | { k: 'callForFamily'; n: number; name?: string }
  | { k: 'bonusPerEnergy'; per: number; on: 'self' | 'opp' | 'both' }
  | { k: 'bonusPerSelfDamage'; per: number }
  | { k: 'bonusIfOppDamaged'; bonus: number }
  | { k: 'bonusIfSelfDamaged'; bonus: number }
  | { k: 'bonusIfOppCondition'; cond: Condition; bonus: number }
  | { k: 'bonusPerBench'; per: number; whose: 'self' | 'opp' | 'both'; nameIncludes?: string }
  | { k: 'bonusPerDiscardMonster'; per: number; max?: number }
  | { k: 'bonusIfOmega'; bonus: number }
  | { k: 'cantAttackNext' }
  | { k: 'reduceNext'; n: number } // damage to this monster reduced next opp turn
  | { k: 'preventNext'; flip?: boolean }
  | { k: 'switchSelf' }
  | { k: 'gustBefore' } // switch opp bench to active before damage
  | { k: 'oppCantRetreat' }
  | { k: 'hitBench'; n: number }; // also damage to own bench (recoil)

export type AbilitySpec =
  | { k: 'drawOnce'; n: number; activeOnly?: boolean }
  | { k: 'energyFromHand'; type: EType } // once per turn attach a basic energy from hand (extra)
  | { k: 'energyFromDiscard'; type: EType; selfDamage?: number }
  | { k: 'healOnce'; n: number }
  | { k: 'searchBasicOnce'; nameIncludes?: string }
  | { k: 'switchInOnce' } // if on bench, switch with active
  | { k: 'damageReduce'; n: number }
  | { k: 'freeRetreat' }
  | { k: 'benchBarrier' }
  | { k: 'typeBoost'; type?: EType; nameIncludes?: string; n: number }
  | { k: 'counterDamage'; n: number }
  | { k: 'regen'; n: number }
  | { k: 'nightmare'; n: number }
  | { k: 'onEvolveDraw'; n: number }
  | { k: 'hpAura'; type: EType; n: number };

export interface Attack {
  name: string;
  cost: EType[];
  damage?: number;
  suffix?: '+' | '×' | '-';
  text?: string;
  effects?: AttackEffect[];
}

export interface Ability {
  name: string;
  text: string;
  spec: AbilitySpec;
}

interface CardBase {
  id: string; // e.g. AB1-001
  no: number;
  name: string;
  rarity: Rarity;
  art: string; // asset key e.g. 'monsters/fire-dragon'
  flavor?: string;
  fullArt?: boolean;
  gold?: boolean;
  baseId?: string; // for alternate-art variants
  set: SetCode;
  variant?: Variant;
  /** CHR: portrait of the trainer drawn with the monster */
  partner?: string;
  /** S (shiny): hue rotation applied to the portrait */
  hue?: number;
  /** AR/SAR/CHR art framing: portrait scale / horizontal anchor (%) / bottom offset (%) */
  crop?: { scale?: number; x?: number; y?: number };
  /** illustration printed as a painting only (no portrait on top) */
  paint?: boolean;
}

export interface MonsterCard extends CardBase {
  kind: 'monster';
  stage: Stage;
  evolvesFrom?: string; // card name
  hp: number;
  type: EType;
  weakness?: EType;
  resistance?: EType;
  retreat: number;
  attacks: Attack[];
  ability?: Ability;
  omega?: boolean;
  /** EX: knocked out → opponent takes 3 prize cards */
  ex?: boolean;
  species: string;
  scene?: string; // override background landscape
}

export type TrainerSub = 'item' | 'supporter' | 'stadium' | 'tool';

export interface TrainerCard extends CardBase {
  kind: 'trainer';
  key: string;
  sub: TrainerSub;
  text: string;
  icon?: string; // game-icons name for item/tool art
  scene?: string;
}

export interface EnergyCard extends CardBase {
  kind: 'energy';
  basic: boolean;
  provides: EType[]; // for rainbow: all types (provides 1 of any)
  any?: boolean;
  count?: number; // double colorless provides 2
  text?: string;
  energyType: EType; // display type
}

export type CardDef = MonsterCard | TrainerCard | EnergyCard;

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
export interface CardInst {
  uid: number;
  cid: string; // card id
  owner: 0 | 1;
}

export interface Slot {
  stack: CardInst[]; // evolution stack, top = last
  energy: CardInst[];
  tool: CardInst | null;
  damage: number;
  conditions: Condition[];
  playedTurn: number;
  evolvedTurn: number;
  abilityUsedTurn: number;
  flags: SlotFlag[];
}

export interface SlotFlag {
  k: 'cantAttack' | 'reduce' | 'prevent' | 'cantRetreat';
  n?: number;
  untilTurn: number; // flag expires when state.turn > untilTurn
}

export interface PlayerState {
  deck: CardInst[];
  hand: CardInst[];
  discard: CardInst[];
  prizes: CardInst[];
  active: Slot | null;
  bench: Slot[];
  name: string;
  mulligans: number;
}

export interface TurnFlags {
  energyAttached: boolean;
  supporterPlayed: boolean;
  stadiumPlayed: boolean;
  retreated: boolean;
  stadiumUsed: boolean;
  attackBonus: number; // from supporters like 騎士団長の激励
}

export interface GameState {
  players: [PlayerState, PlayerState];
  turn: number; // 1-based global turn counter
  current: 0 | 1;
  first: 0 | 1;
  phase: 'setup' | 'main' | 'over';
  flags: TurnFlags;
  stadium: CardInst | null;
  stadiumOwner: 0 | 1 | null;
  playing: CardInst | null; // trainer card currently resolving
  winner: 0 | 1 | -1 | null; // -1 = draw
  winReason: string;
  rng: number;
  nextUid: number;
  log: LogEntry[];
}

export interface LogEntry {
  turn: number;
  player: 0 | 1 | null;
  text: string;
}

// ---------------------------------------------------------------------------
// Positions / actions / prompts / events
// ---------------------------------------------------------------------------
export type Pos = { p: 0 | 1; z: 'active' } | { p: 0 | 1; z: 'bench'; i: number };

export type Action =
  | { t: 'playBasic'; uid: number }
  | { t: 'evolve'; uid: number; target: Pos }
  | { t: 'attachEnergy'; uid: number; target: Pos }
  | { t: 'playTrainer'; uid: number; target?: Pos }
  | { t: 'retreat'; to: number; discard: number[] }
  | { t: 'ability'; pos: Pos }
  | { t: 'stadium' }
  | { t: 'attack'; index: number }
  | { t: 'endTurn' };

export type Prompt =
  | {
      type: 'action';
      player: 0 | 1;
    }
  | {
      type: 'cards';
      player: 0 | 1;
      title: string;
      cards: CardInst[]; // cards shown
      selectable: number[]; // uids selectable
      min: number;
      max: number;
      reveal?: boolean;
    }
  | {
      type: 'slot';
      player: 0 | 1;
      title: string;
      options: Pos[];
      optional?: boolean;
    }
  | {
      type: 'choice';
      player: 0 | 1;
      title: string;
      options: string[];
    }
  | {
      type: 'setup';
      player: 0 | 1;
    };

export type Answer =
  | { type: 'action'; action: Action }
  | { type: 'cards'; uids: number[] }
  | { type: 'slot'; pos: Pos | null }
  | { type: 'choice'; index: number }
  | { type: 'setup'; active: number; bench: number[] };

export type GameEvent =
  | { e: 'start' }
  | { e: 'shuffle'; p: 0 | 1 }
  | { e: 'draw'; p: 0 | 1; uids: number[] }
  | { e: 'mulligan'; p: 0 | 1; uids: number[] }
  | { e: 'coin'; p: 0 | 1; heads: boolean; label?: string }
  | { e: 'first'; p: 0 | 1 }
  | { e: 'setupDone' }
  | { e: 'turn'; p: 0 | 1; turn: number }
  | { e: 'play'; p: 0 | 1; uid: number; to: Pos }
  | { e: 'evolve'; p: 0 | 1; uid: number; pos: Pos }
  | { e: 'attach'; p: 0 | 1; uid: number; pos: Pos }
  | { e: 'trainer'; p: 0 | 1; uid: number }
  | { e: 'stadium'; p: 0 | 1; uid: number }
  | { e: 'retreat'; p: 0 | 1 }
  | { e: 'switch'; p: 0 | 1 }
  | { e: 'ability'; p: 0 | 1; pos: Pos; name: string }
  | { e: 'attack'; p: 0 | 1; name: string; type: EType; attacker: number }
  | { e: 'damage'; pos: Pos; amount: number; weak?: boolean; resist?: boolean; type: EType; source?: 'attack' | 'effect' | 'checkup' }
  | { e: 'heal'; pos: Pos; amount: number }
  | { e: 'condition'; pos: Pos; cond: Condition }
  | { e: 'cure'; pos: Pos }
  | { e: 'ko'; pos: Pos; uid: number }
  | { e: 'prize'; p: 0 | 1; uids: number[] }
  | { e: 'promote'; p: 0 | 1 }
  | { e: 'discard'; p: 0 | 1; uids: number[] }
  | { e: 'search'; p: 0 | 1; uids: number[] }
  | { e: 'fail'; p: 0 | 1; text: string }
  | { e: 'checkup' }
  | { e: 'message'; text: string }
  | { e: 'gameover'; winner: 0 | 1 | -1; reason: string };

export interface Frame {
  ev: GameEvent;
  state: GameState;
}
