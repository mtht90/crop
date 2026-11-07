import type { BotProfile, CardRegistry, Rules } from './data';
import { TICK_RATE } from './math';
import { BotBrain } from './bot';
import { BattleSimulation, type AcceptedCommand, type DeployCommand, type RejectReason, type SimEvent } from './sim';

/** 試合を再現するのに必要な情報（リプレイの先頭に入る） */
export interface MatchSetup {
  seed: number;
  decks: [string[], string[]];
  names: [string, string];
}

export function createSimulation(setup: MatchSetup, rules: Rules, registry: CardRegistry): BattleSimulation {
  return new BattleSimulation(
    rules,
    setup.decks[0].map((id) => registry.require(id)),
    setup.decks[1].map((id) => registry.require(id)),
    setup.seed,
    setup.names,
  );
}

/**
 * ネットワーク層との境界。描画・入力側はこのインターフェースだけを見る。
 * オフライン（BOT）／オンライン（WebSocketホスト）／リプレイ再生で実装を差し替える。
 */
export interface MatchSession {
  readonly simulation: BattleSimulation;
  readonly localPlayer: number;
  /** 次の tick までの割合（0..1）。描画の補間に使う */
  readonly interpolation: number;
  /** ローカルプレイヤーのコマンドをホストへ送る */
  submit(cmd: Omit<DeployCommand, 'issueTick' | 'player'>): void;
  /** 経過時間ぶん tick を進める。進めた各 tick のイベントを onTick に渡す */
  advance(deltaSeconds: number, onTick: (events: readonly SimEvent[]) => void): void;
  onReject?: (cmd: DeployCommand, reason: RejectReason) => void;
}

/** ホストの 1tick：受信済みコマンドを検証・受理してから進める。オフライン・オンライン・リプレイ共通。 */
export function hostStep(
  sim: BattleSimulation,
  inbox: DeployCommand[],
  onReject?: (cmd: DeployCommand, reason: RejectReason) => void,
): void {
  sim.clearEvents();
  for (const cmd of inbox) {
    const reason = sim.tryAccept(cmd);
    if (reason !== 'none') onReject?.(cmd, reason);
  }
  inbox.length = 0;
  sim.step();
}

const TICK_SECONDS = 1 / TICK_RATE;
const MAX_TICKS_PER_FRAME = 40;

/** オフライン対戦：この端末がホストになり、相手を BOT が操作する */
export class LocalMatchSession implements MatchSession {
  readonly simulation: BattleSimulation;
  onReject?: (cmd: DeployCommand, reason: RejectReason) => void;
  private readonly inbox: DeployCommand[] = [];
  private readonly bots: (BotBrain | null)[] = [null, null];
  private acc = 0;

  constructor(
    readonly setup: MatchSetup,
    rules: Rules,
    registry: CardRegistry,
    readonly localPlayer = 0,
  ) {
    this.simulation = createSimulation(setup, rules, registry);
  }

  get interpolation(): number {
    return Math.min(1, this.acc / TICK_SECONDS);
  }

  setBot(player: number, profile: BotProfile | null): void {
    this.bots[player] = profile ? new BotBrain(player, profile, this.setup.seed) : null;
  }

  submit(cmd: Omit<DeployCommand, 'issueTick' | 'player'>): void {
    this.inbox.push({ ...cmd, player: this.localPlayer, issueTick: this.simulation.tick });
  }

  advance(deltaSeconds: number, onTick: (events: readonly SimEvent[]) => void): void {
    if (this.simulation.isOver) return;
    this.acc += Math.min(deltaSeconds, 2);
    let steps = 0;
    while (this.acc >= TICK_SECONDS && steps < MAX_TICKS_PER_FRAME && !this.simulation.isOver) {
      this.acc -= TICK_SECONDS;
      this.stepOnce();
      onTick(this.simulation.events);
      steps++;
    }
  }

  /** 描画なしで 1tick 進める（テスト・早送り用） */
  stepOnce(): void {
    const sim = this.simulation;
    for (const bot of this.bots) {
      const cmd = bot?.think(sim);
      if (cmd) this.inbox.push(cmd);
    }
    hostStep(sim, this.inbox, this.onReject);
  }

  createReplay(): ReplayData {
    return replayFromSimulation(this.setup, this.simulation);
  }
}

// ---------------------------------------------------------------- リプレイ

/** リプレイ = 試合設定 + 受理されたコマンド列。同じ列を再生すれば同じ試合になる */
export interface ReplayData {
  version: 1;
  setup: MatchSetup;
  commands: AcceptedCommand[];
  finalTick: number;
  winner: number;
  finalHash: string;
}

export const replayFromSimulation = (setup: MatchSetup, sim: BattleSimulation): ReplayData => ({
  version: 1,
  setup: structuredClone(setup),
  commands: structuredClone(sim.acceptedLog),
  finalTick: sim.tick,
  winner: sim.winner,
  finalHash: sim.stateHash(),
});

export const serializeReplay = (r: ReplayData): string => JSON.stringify(r);

export function parseReplay(text: string): ReplayData {
  const r = JSON.parse(text) as ReplayData;
  if (r.version !== 1) throw new Error('unsupported replay version');
  return r;
}

/** リプレイを tick 単位で再生する。描画側からは MatchSession として扱える */
export class ReplaySession implements MatchSession {
  readonly simulation: BattleSimulation;
  speed = 1;
  onReject?: (cmd: DeployCommand, reason: RejectReason) => void;
  private cursor = 0;
  private acc = 0;
  private readonly inbox: DeployCommand[] = [];

  constructor(
    private readonly replay: ReplayData,
    rules: Rules,
    registry: CardRegistry,
    readonly localPlayer = 0,
  ) {
    this.simulation = createSimulation(replay.setup, rules, registry);
  }

  get interpolation(): number {
    return Math.min(1, this.acc / TICK_SECONDS);
  }

  submit(): void {
    /* 再生中は入力を受け付けない */
  }

  advance(deltaSeconds: number, onTick: (events: readonly SimEvent[]) => void): void {
    this.acc += Math.min(deltaSeconds, 0.25) * this.speed;
    while (this.acc >= TICK_SECONDS && !this.simulation.isOver) {
      this.acc -= TICK_SECONDS;
      this.stepOnce();
      onTick(this.simulation.events);
    }
  }

  stepOnce(): void {
    const cmds = this.replay.commands;
    while (this.cursor < cmds.length && cmds[this.cursor].acceptTick <= this.simulation.tick) {
      this.inbox.push(cmds[this.cursor].command);
      this.cursor++;
    }
    hostStep(this.simulation, this.inbox, this.onReject);
  }

  runToEnd(maxTicks = 100_000): void {
    while (!this.simulation.isOver && this.simulation.tick < maxTicks) this.stepOnce();
  }
}
