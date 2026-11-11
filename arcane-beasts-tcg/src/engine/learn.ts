// ============================================================================
// Learning from players: every move a person makes is written down as a small
// record (what the board looked like from their side, and what they chose), so
// the CPU can later be taught to play like the players who win.
// No names or ids: only the cards on the table and the move.
// ============================================================================
import { energyCount, hpLeft, other, topCard } from './game';
import type { Action, GameState, Slot } from './types';

export interface SlotRec {
  /** the card on top */
  c: string;
  /** HP left */
  hp: number;
  /** energy attached */
  e: number;
  /** special conditions */
  k?: string[];
}
export interface SideRec {
  /** prize cards still to take */
  pz: number;
  hand: number;
  deck: number;
  a: SlotRec | null;
  b: SlotRec[];
}
export interface MoveRec {
  turn: number;
  me: SideRec;
  opp: SideRec;
  /** the card ids in hand (your own side only) */
  hand: string[];
  /** what was chosen */
  act: Action;
  /** how many moves were possible */
  n: number;
}

const slotRec = (s: GameState, slot: Slot): SlotRec => ({
  c: topCard(slot).id,
  hp: hpLeft(s, slot),
  e: energyCount(slot),
  ...(slot.conditions.length ? { k: [...slot.conditions] } : {}),
});

function side(s: GameState, p: 0 | 1): SideRec {
  const pl = s.players[p];
  return { pz: pl.prizes.length, hand: pl.hand.length, deck: pl.deck.length, a: pl.active ? slotRec(s, pl.active) : null, b: pl.bench.map((b) => slotRec(s, b)) };
}

/** one move as a record */
export function moveRecord(s: GameState, p: 0 | 1, act: Action, legalCount: number): MoveRec {
  return { turn: s.turn, me: side(s, p), opp: side(s, other(p)), hand: s.players[p].hand.map((c) => c.cid), act, n: legalCount };
}

/** a finished game, as it is sent and stored */
export interface GameRec {
  v: 1;
  /** where it was played: 'cpu5', 'story', 'online', 'ranked'… */
  mode: string;
  win: boolean;
  moves: MoveRec[];
}
