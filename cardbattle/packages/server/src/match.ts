import {
  createSimulation,
  hostStep,
  RECONNECT_GRACE_SECONDS,
  TICK_RATE,
  type BattleSimulation,
  type DeployCommand,
  type GameContent,
  type MatchSetup,
  type ServerMessage,
} from '@cardbattle/sim';

export interface Seat {
  name: string;
  deck: string[];
  token: string;
  send: ((msg: ServerMessage) => void) | null; // null = 切断中
  disconnectedAt: number | null;
}

const HASH_INTERVAL_TICKS = 40;

/**
 * サーバー上の1試合。サーバーがホストとしてコマンドを検証し、tick ごとに受理したコマンドを両者へ配る。
 */
export class Match {
  readonly sim: BattleSimulation;
  readonly setup: MatchSetup;
  private readonly inbox: DeployCommand[] = [];
  private timer: NodeJS.Timeout | null = null;
  ended = false;
  onEnded?: () => void;

  constructor(
    readonly id: string,
    readonly seats: [Seat, Seat],
    content: GameContent,
    seed: number,
    private readonly graceMs = RECONNECT_GRACE_SECONDS * 1000,
    /** テスト用：時間の進み方の倍率 */
    private readonly speed = 1,
  ) {
    this.setup = { seed, decks: [seats[0].deck, seats[1].deck], names: [seats[0].name, seats[1].name] };
    this.sim = createSimulation(this.setup, content.rules, content.cards);
  }

  start(): void {
    this.seats.forEach((s, i) => s.send?.({ t: 'start', setup: this.setup, you: i, token: s.token }));
    // setInterval のずれを吸収するため、経過時間から進める tick 数を決める
    const startAt = Date.now();
    this.timer = setInterval(() => {
      const due = Math.floor(((Date.now() - startAt) / 1000) * TICK_RATE * this.speed);
      while (this.sim.tick < due && !this.ended) this.step();
      this.checkDisconnects();
    }, 1000 / TICK_RATE / 2 / this.speed);
  }

  submit(player: number, cmd: { cardId: string; pos: { x: number; y: number }; issueTick: number }): void {
    if (this.ended) return;
    if (typeof cmd.cardId !== 'string' || !cmd.pos || !Number.isFinite(cmd.pos.x) || !Number.isFinite(cmd.pos.y)) return;
    this.inbox.push({ player, cardId: cmd.cardId, pos: { x: Math.round(cmd.pos.x), y: Math.round(cmd.pos.y) }, issueTick: cmd.issueTick | 0 });
  }

  private step(): void {
    const tick = this.sim.tick;
    const accepted: DeployCommand[] = [];
    const pending = this.inbox.splice(0);
    // 受理されたものだけをクライアントへ配る（クライアントも同じ順で tryAccept する）
    for (const cmd of pending) {
      const reason = this.sim.validate(cmd);
      if (reason === 'none') accepted.push(cmd);
      else this.seats[cmd.player].send?.({ t: 'reject', cmd, reason });
    }
    hostStep(this.sim, accepted.slice()); // hostStep は渡した配列を空にするので複製を渡す
    this.broadcast({ t: 'frame', tick, cmds: accepted });
    if (this.sim.tick % HASH_INTERVAL_TICKS === 0) this.broadcast({ t: 'hash', tick: this.sim.tick, hash: this.sim.stateHash() });
    if (this.sim.isOver) this.finish();
  }

  private broadcast(msg: ServerMessage): void {
    for (const s of this.seats) s.send?.(msg);
  }

  private checkDisconnects(): void {
    const now = Date.now();
    for (let i = 0; i < 2; i++) {
      const at = this.seats[i].disconnectedAt;
      if (at !== null && now - at >= this.graceMs && !this.ended) {
        this.sim.forfeit(i); // 10秒以内に戻れなければ負け
        this.finish();
      }
    }
  }

  disconnect(player: number): void {
    const seat = this.seats[player];
    seat.send = null;
    seat.disconnectedAt = Date.now();
    this.seats[1 - player].send?.({ t: 'opponentDisconnected', graceSeconds: this.graceMs / 1000 });
  }

  reconnect(player: number, send: (msg: ServerMessage) => void): void {
    const seat = this.seats[player];
    seat.send = send;
    seat.disconnectedAt = null;
    send({ t: 'resumeState', setup: this.setup, you: player, log: this.sim.acceptedLog, tick: this.sim.tick });
    this.seats[1 - player].send?.({ t: 'opponentReconnected' });
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    this.broadcast({ t: 'end', winner: this.sim.winner, reason: this.sim.endReason });
    this.onEnded?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.ended = true;
  }
}
