// ============================================================================
// Online play: messages between the client and the home server (JSON over a
// WebSocket). The server runs the rules engine; clients only see what they
// are allowed to see, always from their own point of view (you = player 0).
// ============================================================================
import type { Action, Answer, GameEvent, GameState, Prompt } from '../engine/types';

export const PROTOCOL = 1;

/** portraits a player can pick */
export const PORTRAITS = ['humans/lieutenant', 'humans/knight', 'humans/mage', 'humans/swordsman', 'humans/ranger', 'humans/mage-light+female', 'elves/hero', 'elves/ranger+female', 'dwarves/lord', 'merfolk/hunter'];

/** how a match was made */
export type MatchKind = 'friend' | 'random';

export interface FrameMsg {
  ev: GameEvent;
  state: GameState;
}

export interface OppInfo {
  name: string;
  portrait: string;
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
  | { t: 'queue'; kind: 'random'; deck: string[] }
  | { t: 'cancel' }
  | { t: 'answer'; seq: number; answer: Answer }
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
  | { t: 'queued'; kind: 'random'; waiting: number }
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
  | { t: 'peer'; connected: boolean; until: number | null }
  | { t: 'stamp'; from: 0 | 1; id: string }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; n: number; online: number; waiting: number };

export type ErrorCode = 'version' | 'bad_name' | 'bad_request' | 'bad_deck' | 'no_room' | 'room_full' | 'busy' | 'bad_answer' | 'bad_code' | 'not_in_game' | 'rate';

export type ActionLike = Action;
