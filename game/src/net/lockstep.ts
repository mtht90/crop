import { emptyIntent, type Intent } from '../combat/types';
import { packIntent, unpackIntent, type NetMessage } from './protocol';
import type { Transport } from './transport';

/**
 * Delay-based lockstep: every tick the local input is scheduled `delay` frames
 * ahead and sent to the peer; a frame is simulated only when both players'
 * inputs for it are present, so both machines run the exact same simulation
 * (the world is deterministic given the seed). Both sides use the decoded
 * (quantized) inputs so they stay bit-identical.
 *
 * A later upgrade to rollback netcode can keep this interface: predict the
 * missing remote input instead of waiting, and resimulate on mismatch.
 */
export class LockstepSession {
  /** Next frame to simulate. */
  frame = 0;
  /** Round-trip time in ms (from ping/pong). */
  rtt = 0;
  /** Consecutive ticks spent waiting for the peer. */
  stall = 0;
  peerLeft = false;
  private local = new Map<number, Intent>();
  private remote = new Map<number, Intent>();
  private pingId = 0;
  private pingT = 0;
  onOther: (msg: NetMessage) => void = () => {};

  constructor(
    private transport: Transport,
    /** Which fighter this machine controls (0 = host). */
    readonly localSide: 0 | 1,
    readonly delay = 4,
  ) {
    transport.onMessage((m) => this.handle(m));
    this.reset();
  }

  /** Back to frame 0 (new match / rematch). The first `delay` frames are empty. */
  reset() {
    this.frame = 0;
    this.stall = 0;
    this.local.clear();
    this.remote.clear();
    for (let f = 0; f < this.delay; f++) {
      this.local.set(f, emptyIntent());
      this.remote.set(f, emptyIntent());
    }
  }

  /** Call once per tick: schedule and send this tick's input (ignored while stalled). */
  pushLocal(i: Intent) {
    const f = this.frame + this.delay;
    if (this.local.has(f)) return;
    const data = packIntent(i);
    this.local.set(f, unpackIntent(data));
    this.transport.send({ t: 'input', frame: f, data });
  }

  /** Lets simulated peers act and keeps the ping fresh. */
  tick() {
    this.transport.tick?.(this.frame);
    if (++this.pingT >= 60) {
      this.pingT = 0;
      this.transport.send({ t: 'ping', id: ++this.pingId, sent: performance.now() });
    }
  }

  ready() {
    return this.local.has(this.frame) && this.remote.has(this.frame);
  }

  /** Inputs for the current frame in fighter order, then moves to the next frame. */
  advance(): [Intent, Intent] {
    const l = this.local.get(this.frame)!;
    const r = this.remote.get(this.frame)!;
    this.local.delete(this.frame);
    this.remote.delete(this.frame);
    this.frame++;
    this.stall = 0;
    return this.localSide === 0 ? [l, r] : [r, l];
  }

  private handle(m: NetMessage) {
    switch (m.t) {
      case 'input':
        if (m.frame >= this.frame) this.remote.set(m.frame, unpackIntent(m.data));
        break;
      case 'ping':
        this.transport.send({ t: 'pong', id: m.id, sent: m.sent });
        break;
      case 'pong':
        this.rtt = this.rtt ? this.rtt * 0.7 + (performance.now() - m.sent) * 0.3 : performance.now() - m.sent;
        break;
      case 'leave':
        this.peerLeft = true;
        this.onOther(m);
        break;
      default:
        this.onOther(m);
    }
  }

  /** Non-input messages (rematch requests and the like). */
  send(msg: NetMessage) {
    this.transport.send(msg);
  }

  close() {
    this.transport.send({ t: 'leave' });
    this.transport.close();
  }
}
