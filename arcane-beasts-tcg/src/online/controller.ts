// ============================================================================
// Online battle controller: the same job as BattleController, but the rules
// run on the server. Frames arrive over the network and are replayed with the
// usual timing and effects; your answers go back over the socket.
// ============================================================================
import type { Action, Answer, GameState, Prompt } from '../engine/types';
import { BattleDriver, FramePlayer, useBattle } from '../battle/controller';
import { online, type MatchInfo } from './client';
import type { ServerMsg } from './protocol';

type Msg = Extract<ServerMsg, { t: 'snapshot' | 'batch' | 'over' | 'peer' | 'stamp' }>;

const EMPTY_STATS = { kos: 0, damage: 0, prizes: 0, prizesLost: 0, evolves: 0, trainers: 0 };

export class OnlineController extends FramePlayer implements BattleDriver {
  autoHuman = false;
  private queue: Msg[] = [];
  private pumping = false;
  private seq = 0;
  private prompt: Prompt | null = null;
  private legalNow: Action[] = [];
  private unsub: (() => void) | null = null;
  private stampKey = 0;

  constructor(readonly match: MatchInfo) {
    super();
    this.spectator = match.you === 'spectator';
    useBattle.setState({ view: null, prompt: null, result: null, thinking: false, lastEvent: null, hover: null, stats: { ...EMPTY_STATS }, timer: null, peerOffline: null, incomingStamp: null, onlineResult: null });
  }

  get spectating() {
    return this.match.you === 'spectator';
  }

  start() {
    if (this.unsub) return;
    this.unsub = online.listen((m) => this.receive(m));
  }

  dispose() {
    this.disposed = true;
    this.unsub?.();
    this.unsub = null;
  }

  surrender() {
    online.send({ t: 'surrender' });
  }

  legal(): Action[] {
    return this.prompt?.type === 'action' ? this.legalNow : [];
  }

  answer(a: Answer) {
    if (!this.prompt || this.spectating) return;
    this.prompt = null;
    useBattle.setState({ prompt: null });
    online.send({ t: 'answer', seq: this.seq, answer: a });
  }

  act(action: Action) {
    this.answer({ type: 'action', action });
  }

  stamp(id: string) {
    online.send({ t: 'stamp', id });
  }

  // --------------------------------------------------------------------------
  private receive(m: Msg) {
    if (this.disposed) return;
    if (m.t === 'peer') {
      useBattle.setState({ peerOffline: m.connected ? null : Date.now() + (m.until ?? 0) });
      return;
    }
    if (m.t === 'stamp') {
      useBattle.setState({ incomingStamp: { key: ++this.stampKey, id: m.id, from: m.from } });
      return;
    }
    this.queue.push(m);
    void this.pump();
  }

  private clock(actor: 0 | 1 | null, deadline: number | null) {
    useBattle.setState({ timer: actor !== null && deadline !== null ? { actor, until: Date.now() + deadline } : null });
  }

  private show(state: GameState, prompt: Prompt | null, legal: Action[], seq: number, actor: 0 | 1 | null, deadline: number | null) {
    this.seq = seq;
    this.prompt = prompt;
    this.legalNow = legal;
    this.clock(actor, deadline);
    useBattle.setState({ view: state, prompt, thinking: !prompt && actor === 1 && !this.spectating });
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length && !this.disposed) {
        const m = this.queue.shift()!;
        if (m.t === 'snapshot') {
          this.show(m.state, m.prompt, m.legal, m.seq, m.actor, m.deadline);
        } else if (m.t === 'batch') {
          // catch up quickly when frames pile up (a background tab, a slow link)
          for (let i = 0; i < m.frames.length; i++) {
            if (this.disposed) return;
            const behind = this.queue.length > 0 || m.frames.length - i > 8 || document.hidden;
            this.boost = document.hidden ? 40 : behind ? 5 : 1;
            await this.play(m.frames[i]);
          }
          this.boost = 1;
          const last = m.frames.length ? m.frames[m.frames.length - 1].state : useBattle.getState().view;
          if (last) this.show(last, m.prompt, m.legal, m.seq, m.actor, m.deadline);
        } else if (m.t === 'over') {
          this.prompt = null;
          this.clock(null, null);
          useBattle.setState({ result: { winner: m.winner, reason: reasonText(m.reason) }, onlineResult: m, prompt: null, thinking: false });
        }
      }
    } finally {
      this.pumping = false;
    }
  }
}

/** the server sends short codes for forfeits; the engine's own text is passed through */
function reasonText(r: string): string {
  switch (r) {
    case 'surrender':
      return '降参';
    case 'timeout':
      return '時間切れ';
    case 'disconnect':
      return '通信が切れた';
    default:
      return r;
  }
}
