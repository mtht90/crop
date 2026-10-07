import type { Intent } from '../combat/types';
import type { NetMessage, PlayerProfile } from './protocol';
import { packIntent } from './protocol';
import type { Transport } from './transport';

/**
 * A pretend remote player. It speaks the same protocol as a real peer: it
 * answers hello/ping/rematch and streams one input per frame, delivered after
 * a simulated network delay (with jitter and the odd late packet). The inputs
 * come from the CPU AI via `think`, so the game code can't tell it from a
 * network opponent.
 */
export class BotTransport implements Transport {
  private handler: (m: NetMessage) => void = () => {};
  private queue: { at: number; msg: NetMessage }[] = [];
  private sentUpTo = -1;
  /** One-way latency in ms. */
  readonly latency: number;

  constructor(
    readonly profile: PlayerProfile,
    private think: () => Intent,
    private delay: number,
    latency = 18 + Math.random() * 40,
  ) {
    this.latency = latency;
  }

  onMessage(handler: (m: NetMessage) => void) {
    this.handler = handler;
  }

  /** Message from the local game to the "remote" bot. */
  send(msg: NetMessage) {
    switch (msg.t) {
      case 'hello':
        this.reply({ t: 'hello', profile: this.profile });
        break;
      case 'ping':
        // Arrives after one leg, comes back after another.
        this.reply({ t: 'pong', id: msg.id, sent: msg.sent }, 2);
        break;
      case 'rematch':
        this.reply({ t: 'rematch' }, 2);
        break;
      default:
        break;
    }
  }

  /**
   * The bot runs on the same clock as us: each tick it produces its input for
   * frame + delay (like a real peer would) and puts it on the wire.
   */
  tick(frame: number) {
    // Frames before `delay` are empty on both sides; then one input per frame.
    const target = frame + this.delay;
    for (let f = Math.max(this.sentUpTo + 1, this.delay); f <= target; f++) {
      this.reply({ t: 'input', frame: f, data: packIntent(this.think()) });
      this.sentUpTo = f;
    }
    const now = performance.now();
    while (this.queue.length && this.queue[0].at <= now) this.handler(this.queue.shift()!.msg);
  }

  /** Back to frame 0 for a rematch. */
  resetClock() {
    this.sentUpTo = -1;
    this.queue = this.queue.filter((q) => q.msg.t !== 'input');
  }

  private reply(msg: NetMessage, legs = 1) {
    // Jitter, with an occasional spike like a real connection.
    const spike = Math.random() < 0.01 ? 40 + Math.random() * 60 : 0;
    const at = performance.now() + (this.latency + Math.random() * 8 + spike) * legs;
    // Keep delivery order (a reliable, ordered data channel).
    const last = this.queue.length ? this.queue[this.queue.length - 1].at : 0;
    this.queue.push({ at: Math.max(at, last), msg });
  }

  close() {
    this.queue = [];
  }
}
