// ============================================================================
// Online play: messages between the client and the home server (JSON over a
// WebSocket). The server runs the rules engine; clients only see what they
// are allowed to see, always from their own point of view (you = player 0).
// ============================================================================
import type { Action, Answer, GameEvent, GameState, Prompt } from '../engine/types';
import type { RankView } from './rank';

export type { RankView };

export const PROTOCOL = 1;

/** 開発者モードのコード (also gives the online account the top rank) */
export const DEV_CODE = 'ARCANE-DEV';

/** portraits a player can pick */
export const PORTRAITS = ['humans/lieutenant', 'humans/knight', 'humans/mage', 'humans/swordsman', 'humans/ranger', 'humans/mage-light+female', 'elves/hero', 'elves/ranger+female', 'dwarves/lord', 'merfolk/hunter'];

/** how a match was made */
export type MatchKind = 'friend' | 'random' | 'ranked';
/** the queues a player can join */
export type QueueKind = 'random' | 'ranked';

export interface FrameMsg {
  ev: GameEvent;
  state: GameState;
}

export interface OppInfo {
  name: string;
  portrait: string;
  /** their tier (ranked matches only) */
  rank?: { tier: number; div: number; mr?: number };
}

export interface RankEntry {
  name: string;
  portrait: string;
  rank: { tier: number; div: number; mr?: number };
}

export interface TowerEntry {
  name: string;
  portrait: string;
  floor: number;
}

export interface RoomInfo {
  code: string;
  kind: MatchKind;
  state: 'waiting' | 'playing' | 'over';
  players: { name: string; connected: boolean }[];
}

export interface OnlineProfile {
  id: string;
  name: string;
  portrait: string;
  /** online-only record */
  games: number;
  wins: number;
  losses: number;
  /** ranked: the tier shown (the rating itself stays on the server) */
  rank?: RankView;
}

// ---------------------------------------------------------------------------
// client → server
// ---------------------------------------------------------------------------
export type ClientMsg =
  | { t: 'hello'; v: number; id?: string; secret?: string; name?: string; portrait?: string }
  | { t: 'rename'; name: string; portrait?: string }
  | { t: 'transfer' } // ask for a transfer code
  | { t: 'link'; code: string } // take over another identity with a transfer code
  | { t: 'create'; deck: string[] } // friend room
  | { t: 'join'; code: string; deck: string[] }
  | { t: 'queue'; kind: QueueKind; deck: string[] }
  | { t: 'cancel' }
  /** ランクマッチのランキング (top 10) */
  | { t: 'ranking' }
  /** 覇王の塔: report the highest floor cleared (0 = only ask) and ask for the ranking */
  | { t: 'tower'; key: string; floor: number }
  /** 開発者モード: the account goes to master */
  | { t: 'dev'; code: string }
  /** the ranked placement match (played against a bot on the device) is over */
  | { t: 'placement'; win: boolean; prizes: number; prizesLost: number; turns: number }
  | { t: 'answer'; seq: number; answer: Answer }
  /** ask for the table as it stands (after a lost answer or a doubtful link) */
  | { t: 'sync' }
  | { t: 'surrender' }
  | { t: 'stamp'; id: string }
  | { t: 'leave' }
  | { t: 'ping'; n: number };

// ---------------------------------------------------------------------------
// server → client
// ---------------------------------------------------------------------------
export type ServerMsg =
  | { t: 'welcome'; v: number; profile: OnlineProfile; secret: string; online: number; waiting: number; resume?: string }
  | { t: 'renamed'; profile: OnlineProfile }
  | { t: 'transferCode'; code: string; expires: number }
  | { t: 'linked'; profile: OnlineProfile; secret: string }
  | { t: 'room'; room: RoomInfo; you?: 0 | 1 }
  | { t: 'queued'; kind: QueueKind; waiting: number }
  /** a game has started: the first full snapshot follows */
  | { t: 'start'; you: 0 | 1; kind: MatchKind; code: string; opp: OppInfo; me: OppInfo }
  /**
   * a state to show immediately (start, reconnect).
   * `actor` (0 = you) is who the game waits for and `deadline` the milliseconds
   * they have left; `prompt` is only set when the actor is you.
   */
  | { t: 'snapshot'; state: GameState; prompt: Prompt | null; legal: Action[]; seq: number; actor: 0 | 1 | null; deadline: number | null }
  /** new frames to play in order, then (maybe) a prompt for you */
  | { t: 'batch'; frames: FrameMsg[]; prompt: Prompt | null; legal: Action[]; seq: number; actor: 0 | 1 | null; deadline: number | null }
  | { t: 'over'; winner: 0 | 1 | -1; reason: string }
  /** ランクマッチのランキング: this season's top players (ranks only, never ratings) */
  | { t: 'ranking'; season: string; top: RankEntry[] }
  /** 覇王の塔のランキング: the top climbers and your own place */
  | { t: 'tower'; key: string; top: TowerEntry[]; me: { pos: number; floor: number } | null; total: number }
  /** after a ranked game: the tier before and after */
  | { t: 'rank'; before: RankView; after: RankView; placement?: boolean }
  | { t: 'peer'; connected: boolean; until: number | null }
  | { t: 'stamp'; from: 0 | 1; id: string }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; n: number; online: number; waiting: number };

export type ErrorCode = 'version' | 'bad_name' | 'bad_request' | 'bad_deck' | 'no_room' | 'room_full' | 'busy' | 'bad_answer' | 'bad_code' | 'not_in_game' | 'rate';

export type ActionLike = Action;
