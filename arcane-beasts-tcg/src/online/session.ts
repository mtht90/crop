// ============================================================================
// One online game on the server: the authoritative rules engine plus the
// translation of its frames into per-viewer batches. No sockets or timers
// here — the room feeds it answers and sends out what it returns, so it is
// easy to test.
// ============================================================================
import { Game } from '../engine/game';
import type { Answer, Prompt } from '../engine/types';
import type { FrameMsg, ServerMsg } from './protocol';
import { perspectiveOf, unviewAnswer, viewAction, viewEvent, viewPrompt, viewState, type Viewer } from './view';

export interface Outgoing {
  to: Viewer; // 0 / 1 seat, or every spectator
  msg: ServerMsg;
}

/** time a player has to answer a prompt (ms) */
export const ANSWER_MS = { action: 90_000, setup: 150_000, other: 60_000 };
export const promptMs = (p: Prompt) => (p.type === 'action' ? ANSWER_MS.action : p.type === 'setup' ? ANSWER_MS.setup : ANSWER_MS.other);

export class GameSession {
  readonly game: Game;
  /** increments with every new prompt; answers must carry the current number */
  seq = 0;
  /** the prompt currently waiting for a player */
  private waiting: Prompt | null = null;
  started = false;

  constructor(decks: [string[], string[]], names: [string, string], seed = (Math.random() * 2 ** 31) | 0) {
    this.game = Game.create(decks, names, seed, { record: true });
  }

  get over() {
    return this.game.over;
  }
  get pending(): Prompt | null {
    return this.waiting;
  }
  /** the seat that has to act, if any */
  get actor(): 0 | 1 | null {
    return this.waiting ? this.waiting.player : null;
  }

  /** the table as it stands (no frames): sent when somebody joins or reconnects */
  snapshot(viewer: Viewer): ServerMsg {
    const seat = viewer === 'spectator' ? null : viewer;
    const pr = seat !== null && this.waiting && this.waiting.player === seat ? this.waiting : null;
    return {
      t: 'snapshot',
      state: viewState(this.game.s, viewer),
      prompt: pr ? viewPrompt(pr, viewer) : null,
      legal: pr && pr.type === 'action' ? this.game.legalActions(seat!).map((a) => viewAction(a, viewer)) : [],
      seq: this.seq,
      ...this.clock(viewer),
    };
  }

  /** who the game is waiting for (in the viewer's numbering) and how long they have */
  private clock(viewer: Viewer): { actor: 0 | 1 | null; deadline: number | null } {
    const w = this.waiting;
    if (!w || this.game.over) return { actor: null, deadline: null };
    const me = perspectiveOf(viewer);
    return { actor: w.player === me ? 0 : 1, deadline: promptMs(w) };
  }

  /** deal the cards and run to the first decision */
  begin(): Outgoing[] {
    this.started = true;
    this.game.start();
    return this.flush();
  }

  /** a player's answer, already in that player's own numbering */
  answer(seat: 0 | 1, seq: number, ans: Answer): { out: Outgoing[]; error?: string } {
    if (this.game.over) return { out: [], error: 'game over' };
    const pr = this.waiting;
    if (!pr || pr.player !== seat) return { out: [], error: 'not your turn' };
    if (seq !== this.seq) return { out: [], error: 'stale answer' };
    try {
      this.game.answer(unviewAnswer(ans, seat));
    } catch (e) {
      return { out: [], error: e instanceof Error ? e.message : 'bad answer' };
    }
    this.waiting = null;
    return { out: this.flush() };
  }

  /** end the game now (surrender, timeout, disconnect): `loser` loses */
  forfeit(loser: 0 | 1, reason: string): Outgoing[] {
    if (this.game.over) return [];
    this.game.forfeit(loser === 0 ? 1 : 0, reason);
    this.waiting = null;
    return this.flush();
  }

  /** frames produced since the last flush, as one batch per viewer */
  flush(): Outgoing[] {
    const frames = this.game.drainFrames();
    const pr = this.game.over ? null : this.game.pending;
    if (pr && pr !== this.waiting) {
      this.waiting = pr;
      this.seq++;
    }
    if (!frames.length && !pr) return [];
    const out: Outgoing[] = [];
    for (const viewer of [0, 1, 'spectator'] as Viewer[]) {
      const f: FrameMsg[] = frames.map((fr) => ({ ev: viewEvent(fr.ev, viewer), state: viewState(fr.state, viewer) }));
      const mine = viewer !== 'spectator' && pr && pr.player === viewer ? pr : null;
      out.push({
        to: viewer,
        msg: {
          t: 'batch',
          frames: f,
          prompt: mine ? viewPrompt(mine, viewer) : null,
          legal: mine && mine.type === 'action' ? this.game.legalActions(mine.player).map((a) => viewAction(a, viewer)) : [],
          seq: this.seq,
          ...this.clock(viewer),
        },
      });
    }
    return out;
  }

  /** the result in the viewer's numbering */
  result(viewer: Viewer): { winner: 0 | 1 | -1; reason: string } {
    const w = this.game.s.winner ?? -1;
    const me = perspectiveOf(viewer);
    return { winner: w === 0 || w === 1 ? (me === 1 ? (w === 0 ? 1 : 0) : w) : -1, reason: this.game.s.winReason };
  }
}
