export type MatchPhase = 'regular' | 'overtime' | 'ended';

export interface MatchConfig {
  duration: number;
  doubleManaAt: number;
  overtime: number;
}

export interface TeamStatus {
  crowns: [number, number];
  /** 各チームの塔の残り HP 割合（0〜1） */
  hpRatio: [number, number];
}

export type MatchOutcome = { winner: 0 | 1 | null; reason: 'king' | 'crowns' | 'overtime' | 'hp' | 'draw' };

/** 試合時間・延長・勝敗判定。Phaser 非依存。 */
export class MatchTimer {
  phase: MatchPhase = 'regular';
  /** 現フェーズの残り秒数 */
  remaining: number;
  outcome: MatchOutcome | null = null;

  constructor(readonly config: MatchConfig) {
    this.remaining = config.duration;
  }

  get isDoubleMana(): boolean {
    return this.phase === 'overtime' || (this.phase === 'regular' && this.remaining <= this.config.doubleManaAt);
  }

  /** 時間を進めて勝敗を判定する。決着したら outcome を返す。 */
  update(dt: number, status: TeamStatus): MatchOutcome | null {
    if (this.phase === 'ended') return this.outcome;
    const [c0, c1] = status.crowns;
    if (c0 >= 3 || c1 >= 3) return this.finish({ winner: c0 >= 3 ? 0 : 1, reason: 'king' });
    if (this.phase === 'overtime' && c0 !== c1) {
      return this.finish({ winner: c0 > c1 ? 0 : 1, reason: 'overtime' });
    }
    this.remaining -= dt;
    if (this.remaining > 0) return null;
    if (this.phase === 'regular') {
      if (c0 !== c1) return this.finish({ winner: c0 > c1 ? 0 : 1, reason: 'crowns' });
      this.phase = 'overtime';
      this.remaining = this.config.overtime;
      return null;
    }
    // 延長でも同数：塔の残り HP 割合で判定
    const [h0, h1] = status.hpRatio;
    if (Math.abs(h0 - h1) < 1e-6) return this.finish({ winner: null, reason: 'draw' });
    return this.finish({ winner: h0 > h1 ? 0 : 1, reason: 'hp' });
  }

  private finish(outcome: MatchOutcome): MatchOutcome {
    this.phase = 'ended';
    this.remaining = Math.max(0, this.remaining);
    this.outcome = outcome;
    return outcome;
  }
}
