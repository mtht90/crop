// ============================================================================
// Online play: messages between the client and the home server (JSON over a
// WebSocket). The server runs the rules engine; clients only see what they
// are allowed to see, always from their own point of view (you = player 0).
// ============================================================================
import type { Action, Answer, GameEvent, GameState, Prompt } from '../engine/types';
import type { RankChange, RankState } from '../state/ranked';

export const PROTOCOL = 1;

/** portraits a player can pick */
export const PORTRAITS = ['humans/lieutenant', 'humans/knight', 'humans/mage', 'humans/swordsman', 'humans/ranger', 'humans/mage-light+female', 'elves/hero', 'elves/ranger+female', 'dwarves/lord', 'merfolk/hunter'];

/** how a match was made */
export type MatchKind = 'friend' | 'random' | 'ranked';

export interface FrameMsg {
  ev: GameEvent;
  state: GameState;
}

export interface OppInfo {
  name: string;
  /** rank label (e.g. 三段) when known */
  rank?: string;
  portrait: string;
}

export interface RoomInfo {
  code: string;
  kind: MatchKind;
  state: 'waiting' | 'playing' | 'over';
  players: { name: string; rank?: string; connected: boolean }[];
  spectators: number;
}

export interface LiveGame {
  code: string;
  kind: MatchKind;
  players: [string, string];
  ranks: [string | undefined, string | undefined];
  turn: number;
  spectators: number;
}

export interface OnlineProfile {
  id: string;
  name: string;
  portrait: string;
  rank: RankState;
  /** online-only record */
  games: number;
  /** the linked Google account, masked (a***@gmail.com) */
  google?: string;
  /** how many passkeys can log in to this player */
  passkeys?: number;
}

/** signed up (Google or a passkey), so the player can be recovered on another device */
export const isRegistered = (p: OnlineProfile | null | undefined) => !!p && (!!p.google || (p.passkeys ?? 0) > 0);

// ---------------------------------------------------------------------------
// client → server
// ---------------------------------------------------------------------------
export type ClientMsg =
  | { t: 'hello'; v: number; id?: string; secret?: string; name?: string; portrait?: string }
  /** `portrait` is a built-in key or an uploaded picture (see avatar.ts) */
  | { t: 'rename'; name: string; portrait?: string }
  /** sign in / sign up with Google: the ID token from Google Identity Services */
  | { t: 'google'; credential: string }
  /** passkeys: ask for a challenge, then send what the browser made from it */
  | { t: 'passkeyBegin'; mode: 'register' | 'login' }
  | { t: 'passkeyFinish'; mode: 'register' | 'login'; response: unknown }
  | { t: 'transfer' } // ask for a transfer code
  | { t: 'link'; code: string } // take over another identity with a transfer code
  | { t: 'create'; deck: string[] } // friend room
  | { t: 'join'; code: string; deck: string[] }
  | { t: 'queue'; kind: 'random' | 'ranked'; deck: string[] }
  | { t: 'cancel' }
  | { t: 'spectate'; code: string }
  | { t: 'live' } // list of games that can be watched
  | { t: 'answer'; seq: number; answer: Answer }
  | { t: 'surrender' }
  | { t: 'stamp'; id: string }
  | { t: 'leave' }
  | { t: 'ping'; n: number };

// ---------------------------------------------------------------------------
// server → client
// ---------------------------------------------------------------------------
export type ServerMsg =
  | { t: 'welcome'; v: number; profile: OnlineProfile; secret: string; online: number; waiting: number; resume?: string; googleClientId?: string }
  | { t: 'renamed'; profile: OnlineProfile }
  | { t: 'transferCode'; code: string; expires: number }
  | { t: 'linked'; profile: OnlineProfile; secret: string }
  /** Google sign-in worked: `new` joined this player to the account, `login` switched to an existing one (a new secret comes with it) */
  | { t: 'passkeyOptions'; mode: 'register' | 'login'; options: unknown }
  | { t: 'account'; mode: 'new' | 'same' | 'login'; profile: OnlineProfile; secret?: string }
  | { t: 'room'; room: RoomInfo; you?: 0 | 1 | 'spectator' }
  | { t: 'queued'; kind: 'random' | 'ranked'; waiting: number }
  | { t: 'live'; games: LiveGame[] }
  /** a game has started (or a spectator joined): the first full snapshot follows */
  | { t: 'start'; you: 0 | 1 | 'spectator'; kind: MatchKind; code: string; opp: OppInfo; me: OppInfo }
  /**
   * a state to show immediately (start, reconnect, spectator join).
   * `actor` (0 = you) is who the game waits for and `deadline` the milliseconds
   * they have left; `prompt` is only set when the actor is you.
   */
  | { t: 'snapshot'; state: GameState; prompt: Prompt | null; legal: Action[]; seq: number; actor: 0 | 1 | null; deadline: number | null }
  /** new frames to play in order, then (maybe) a prompt for you */
  | { t: 'batch'; frames: FrameMsg[]; prompt: Prompt | null; legal: Action[]; seq: number; actor: 0 | 1 | null; deadline: number | null }
  | { t: 'over'; winner: 0 | 1 | -1; reason: string; rank?: RankChange; rankNow?: RankState }
  | { t: 'peer'; connected: boolean; until: number | null }
  | { t: 'stamp'; from: 0 | 1 | 'spectator'; id: string }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; n: number; online: number; waiting: number };

export type ErrorCode = 'version' | 'bad_name' | 'bad_image' | 'bad_request' | 'bad_deck' | 'no_room' | 'room_full' | 'busy' | 'bad_answer' | 'bad_code' | 'not_in_game' | 'rate';

export type ActionLike = Action;
