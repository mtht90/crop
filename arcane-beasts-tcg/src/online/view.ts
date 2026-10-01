// ============================================================================
// Per-viewer views of a game. The server keeps one authoritative GameState;
// each client gets a copy where
//   • players are swapped so the viewer is always player 0,
//   • everything the viewer must not know is masked (the opponent's hand, both
//     decks and both prize piles; spectators don't see hands either),
//   • the random seed is hidden.
// Answers coming back are translated into the real player numbering.
// ============================================================================
import { MAIN_SET } from '../engine/cards';
import type { Action, Answer, CardInst, GameEvent, GameState, PlayerState, Pos, Prompt, Slot } from '../engine/types';

export type Viewer = 0 | 1 | 'spectator';

/** stands in for a card the viewer may not see (any valid card id; the UI shows card backs) */
export const HIDDEN_CID = MAIN_SET.find((c) => c.kind === 'energy' && c.basic)!.id;

const flip = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);
/** the engine player shown as "me" (player 0) for this viewer */
export const perspectiveOf = (v: Viewer): 0 | 1 => (v === 'spectator' ? 0 : v);

function mapPos(pos: Pos, swap: boolean): Pos;
function mapPos(pos: Pos | null, swap: boolean): Pos | null;
function mapPos(pos: Pos | null, swap: boolean): Pos | null {
  if (!pos || !swap) return pos;
  return { ...pos, p: flip(pos.p) };
}

const maskInst = (c: CardInst): CardInst => ({ ...c, cid: HIDDEN_CID });

export function viewState(s: GameState, viewer: Viewer): GameState {
  const me = perspectiveOf(viewer);
  const swap = me === 1;
  const inst = (c: CardInst): CardInst => (swap ? { ...c, owner: flip(c.owner) } : { ...c });
  const slot = (sl: Slot | null): Slot | null =>
    sl && {
      ...sl,
      stack: sl.stack.map(inst),
      energy: sl.energy.map(inst),
      tool: sl.tool ? inst(sl.tool) : null,
      conditions: [...sl.conditions],
      flags: sl.flags.map((f) => ({ ...f })),
    };
  const player = (idx: 0 | 1): PlayerState => {
    const pl = s.players[idx];
    const handVisible = viewer !== 'spectator' && idx === me;
    return {
      ...pl,
      deck: pl.deck.map((c) => maskInst(inst(c))),
      prizes: pl.prizes.map((c) => maskInst(inst(c))),
      hand: pl.hand.map((c) => (handVisible ? inst(c) : maskInst(inst(c)))),
      discard: pl.discard.map(inst),
      active: slot(pl.active),
      bench: pl.bench.map((b) => slot(b)!),
    };
  };
  const players: [PlayerState, PlayerState] = swap ? [player(1), player(0)] : [player(0), player(1)];
  return {
    ...s,
    players,
    current: swap ? flip(s.current) : s.current,
    first: swap ? flip(s.first) : s.first,
    winner: swap && (s.winner === 0 || s.winner === 1) ? flip(s.winner) : s.winner,
    stadium: s.stadium ? inst(s.stadium) : null,
    stadiumOwner: s.stadiumOwner === null || !swap ? s.stadiumOwner : flip(s.stadiumOwner),
    playing: s.playing ? inst(s.playing) : null,
    rng: 0,
    log: s.log.map((l) => (swap && l.player !== null ? { ...l, player: flip(l.player) } : { ...l })),
  };
}

export function viewEvent(ev: GameEvent, viewer: Viewer): GameEvent {
  if (perspectiveOf(viewer) === 0) return ev;
  const o = { ...ev } as Record<string, unknown>;
  if ('p' in ev) o.p = flip(ev.p);
  if ('pos' in ev) o.pos = mapPos(ev.pos, true);
  if (ev.e === 'gameover' && (ev.winner === 0 || ev.winner === 1)) o.winner = flip(ev.winner);
  return o as unknown as GameEvent;
}

/** a prompt is only ever sent to the player it is for, so nothing is masked */
export function viewPrompt(pr: Prompt, viewer: Viewer): Prompt {
  if (perspectiveOf(viewer) === 0) return pr;
  const o = { ...pr, player: flip(pr.player) } as Prompt;
  if (o.type === 'slot') o.options = o.options.map((p) => mapPos(p, true));
  if (o.type === 'cards') o.cards = o.cards.map((c) => ({ ...c, owner: flip(c.owner) }));
  return o;
}

function mapAction(a: Action, swap: boolean): Action {
  if (!swap) return a;
  switch (a.t) {
    case 'evolve':
    case 'attachEnergy':
      return { ...a, target: mapPos(a.target, true) };
    case 'playTrainer':
      return a.target ? { ...a, target: mapPos(a.target, true) } : a;
    case 'ability':
      return { ...a, pos: mapPos(a.pos, true) };
    default:
      return a;
  }
}

/** translate an answer from the viewer's numbering into the engine's */
export function unviewAnswer(a: Answer, viewer: Viewer): Answer {
  const swap = perspectiveOf(viewer) === 1;
  if (!swap) return a;
  if (a.type === 'action') return { type: 'action', action: mapAction(a.action, true) };
  if (a.type === 'slot') return { type: 'slot', pos: mapPos(a.pos, true) };
  return a;
}

/** legal-action list in the viewer's numbering (used by the client UI) */
export const viewAction = (a: Action, viewer: Viewer): Action => mapAction(a, perspectiveOf(viewer) === 1);
