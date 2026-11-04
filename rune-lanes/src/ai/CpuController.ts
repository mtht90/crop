import type { CpuBalance, Team } from '../core/types';
import { Rng } from '../core/Rng';
import type { BattleWorld } from '../systems/BattleWorld';
import { affordableHand } from './helpers';
import { DEFAULT_RULES, type CpuAction, type CpuRule } from './rules';

/**
 * CPU の思考。プレイヤーと同じ BattleWorld.playCard を通して行動するので、
 * 山札・手札・捨て札・マナのルールは完全に同じ。
 */
export class CpuController {
  private thinkTimer: number;
  private pending: { action: CpuAction; delay: number } | null = null;
  lastAction: CpuAction | null = null;

  constructor(
    private readonly world: BattleWorld,
    readonly team: Team,
    private readonly cfg: CpuBalance,
    private readonly rng: Rng = new Rng(),
    private readonly rules: CpuRule[] = DEFAULT_RULES,
  ) {
    this.thinkTimer = cfg.thinkInterval;
  }

  update(dt: number): void {
    if (!this.world.isRunning) return;
    if (this.pending) {
      this.pending.delay -= dt;
      if (this.pending.delay <= 0) {
        const { action } = this.pending;
        this.pending = null;
        const res = this.world.playCard(this.team, action.uid, action.x, action.y, action.targetId);
        if (res.ok) this.lastAction = action;
      }
      return;
    }
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = this.cfg.thinkInterval * (1 + (this.rng.next() - 0.5) * this.cfg.randomness * 2);
    const action = this.decide();
    if (action) {
      const delay = this.cfg.reactionDelay * (0.5 + this.rng.next());
      this.pending = { action, delay };
    }
  }

  /** 全ルールの候補からスコア最大の行動を選ぶ（難易度に応じてランダム性を加える） */
  decide(): CpuAction | null {
    const hand = affordableHand(this.world, this.team);
    if (!hand.length) return null;
    const ctx = { world: this.world, team: this.team, rng: this.rng, cfg: this.cfg, hand };
    let best: CpuAction | null = null;
    for (const rule of this.rules) {
      const a = rule(ctx);
      if (!a) continue;
      const score = a.score + this.rng.next() * this.cfg.randomness * 8;
      if (!best || score > best.score) best = { ...a, score };
    }
    // やさしい：ときどき判断を見送る
    if (best && this.rng.next() < this.cfg.randomness * 0.5) return null;
    return best;
  }
}
