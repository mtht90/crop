import type { CardRegistry, Rules } from './data';
import { TICK_RATE } from './math';
import { createSimulation, hostStep, type MatchSession, type MatchSetup } from './session';
import type { AcceptedCommand, BattleSimulation, DeployCommand, RejectReason, SimEvent } from './sim';

const TICK_SECONDS = 1 / TICK_RATE;

/**
 * オンライン対戦のクライアント側。サーバーから届いた frame（tick ごとの受理済みコマンド）を順に再生する。
 * 通信の手段（WebSocket など）は send / onFrame の外側に任せ、ここではシミュレーションの進め方だけを扱う。
 */
export class OnlineMatchSession implements MatchSession {
  simulation: BattleSimulation;
  onReject?: (cmd: DeployCommand, reason: RejectReason) => void;
  /** サーバーと状態がずれたとき（バグの検出用） */
  onDesync?: (tick: number) => void;
  private readonly frames: { tick: number; cmds: DeployCommand[] }[] = [];
  private readonly hashes = new Map<number, string>();
  private readonly inbox: DeployCommand[] = [];
  private acc = 0;

  constructor(
    readonly setup: MatchSetup,
    private readonly rules: Rules,
    private readonly registry: CardRegistry,
    readonly localPlayer: number,
    private readonly send: (cmd: { cardId: string; pos: { x: number; y: number }; issueTick: number }) => void,
  ) {
    this.simulation = createSimulation(setup, rules, registry);
  }

  get interpolation(): number {
    return Math.min(1, this.acc / TICK_SECONDS);
  }

  /** 届いているがまだ再生していない tick の数 */
  get buffered(): number {
    return this.frames.length;
  }

  submit(cmd: Omit<DeployCommand, 'issueTick' | 'player'>): void {
    this.send({ cardId: cmd.cardId, pos: cmd.pos, issueTick: this.simulation.tick });
  }

  pushFrame(tick: number, cmds: DeployCommand[]): void {
    this.frames.push({ tick, cmds });
  }

  pushHash(tick: number, hash: string): void {
    this.hashes.set(tick, hash);
  }

  /** 再接続したとき：最初から作り直し、受理済みコマンドを入れながら現在の tick まで一気に進める */
  restore(log: AcceptedCommand[], tick: number): void {
    this.simulation = createSimulation(this.setup, this.rules, this.registry);
    this.frames.length = 0;
    let cursor = 0;
    while (this.simulation.tick < tick && !this.simulation.isOver) {
      while (cursor < log.length && log[cursor].acceptTick === this.simulation.tick) this.inbox.push(log[cursor++].command);
      hostStep(this.simulation, this.inbox);
    }
  }

  /** サーバー側で試合が終わった（切断負けなど） */
  forceEnd(winner: number): void {
    if (!this.simulation.isOver && winner >= 0) this.simulation.forfeit(1 - winner);
  }

  advance(deltaSeconds: number, onTick: (events: readonly SimEvent[]) => void): void {
    this.acc += Math.min(deltaSeconds, 0.5);
    let steps = 0;
    while (this.frames.length > 0 && steps < 40) {
      // 届いた分を実時間どおりに再生する。4 tick 以上たまったら（回線が揺れたあと）待たずに追いつく
      const behind = this.frames.length > 4;
      if (this.acc < TICK_SECONDS && !behind) break;
      this.acc = Math.max(0, this.acc - TICK_SECONDS);
      const f = this.frames.shift()!;
      if (f.tick < this.simulation.tick) continue; // 再接続時の重複
      this.inbox.push(...f.cmds);
      hostStep(this.simulation, this.inbox);
      onTick(this.simulation.events);
      const h = this.hashes.get(this.simulation.tick);
      if (h !== undefined) {
        if (h !== this.simulation.stateHash()) this.onDesync?.(this.simulation.tick);
        this.hashes.delete(this.simulation.tick);
      }
      steps++;
    }
    // フレームが届いていないあいだは時間をためすぎない（届いた瞬間に一気に進まないように）
    if (this.frames.length === 0) this.acc = Math.min(this.acc, TICK_SECONDS);
  }
}
