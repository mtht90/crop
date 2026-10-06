import { CpuController, type Difficulty } from '../ai/cpu';
import { Fighter } from '../combat/fighter';
import type { CharacterDef, Intent } from '../combat/types';
import { CombatWorld } from '../combat/world';
import { ROUND_SECONDS, ROUNDS_TO_WIN } from '../config';

export type MatchPhase = 'intro' | 'countdown' | 'fight' | 'roundEnd' | 'matchEnd';
export type RoundResult = 'ko' | 'ringout' | 'time' | 'draw';

export interface Banner {
  text: string;
  sub?: string;
  style: 'round' | 'count' | 'fight' | 'ko' | 'win' | 'lose' | 'info';
}

/** Round flow, timer and win conditions for one CPU match. */
export class Match {
  readonly player: Fighter;
  readonly cpu: Fighter;
  readonly world: CombatWorld;
  readonly ai: CpuController;
  wins: [number, number] = [0, 0];
  round = 1;
  timer = ROUND_SECONDS * 60;
  phase: MatchPhase = 'intro';
  phaseT = 0;
  timeScale = 1;
  /** Winner of the last round: 0 = player, 1 = cpu, -1 = draw. */
  lastWinner = -1;
  lastResult: RoundResult = 'ko';
  finished = false;

  onBanner: (b: Banner | null) => void = () => {};
  onPhase: (p: MatchPhase) => void = () => {};
  onRoundStart: () => void = () => {};

  constructor(
    playerDef: CharacterDef,
    cpuDef: CharacterDef,
    readonly difficulty: Difficulty,
  ) {
    this.player = new Fighter(playerDef, 0);
    this.cpu = new Fighter(cpuDef, 1);
    this.world = new CombatWorld(this.player, this.cpu);
    this.ai = new CpuController(this.cpu, this.player, this.world, difficulty);
  }

  start() {
    this.startRound();
  }

  private setPhase(p: MatchPhase) {
    this.phase = p;
    this.phaseT = 0;
    this.onPhase(p);
  }

  private startRound() {
    this.player.reset(0, 9, 0);
    this.cpu.reset(0, -9, Math.PI);
    this.ai.resetView(Math.PI);
    this.world.projectiles = [];
    this.world.decoys = [];
    this.world.hitstop = 0;
    this.timer = ROUND_SECONDS * 60;
    this.timeScale = 1;
    this.lastWinner = -1;
    this.setPhase('intro');
    this.onRoundStart();
    this.onBanner({ text: `ROUND ${this.round}`, sub: this.round === 1 ? `${this.wins[0]} - ${this.wins[1]}` : `${this.wins[0]} - ${this.wins[1]}`, style: 'round' });
  }

  get outcome(): ['none' | 'win' | 'lose', 'none' | 'win' | 'lose'] {
    if ((this.phase !== 'roundEnd' && this.phase !== 'matchEnd') || this.phaseT < 50 || this.lastWinner < 0) return ['none', 'none'];
    return this.lastWinner === 0 ? ['win', 'lose'] : ['lose', 'win'];
  }

  step(playerIntent: Intent) {
    this.phaseT++;
    const fighting = this.phase === 'fight';
    const cpuIntent = this.ai.think(fighting);
    this.world.step([playerIntent, cpuIntent]);

    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= 80) {
          this.setPhase('countdown');
          this.onBanner({ text: '3', style: 'count' });
        }
        break;
      case 'countdown': {
        if (this.phaseT === 36) this.onBanner({ text: '2', style: 'count' });
        if (this.phaseT === 72) this.onBanner({ text: '1', style: 'count' });
        if (this.phaseT >= 108) {
          this.onBanner({ text: 'FIGHT!', style: 'fight' });
          this.player.setState('free');
          this.cpu.setState('free');
          this.setPhase('fight');
        }
        break;
      }
      case 'fight':
        if (this.phaseT === 40) this.onBanner(null);
        this.timer--;
        this.checkRoundEnd();
        break;
      case 'roundEnd':
        // Dramatic slow motion right after the finishing blow.
        this.timeScale = this.phaseT < 45 && this.lastResult === 'ko' ? 0.28 : 1;
        if (this.phaseT > 20) for (const f of [this.player, this.cpu]) if (f.state === 'free') f.setState('locked');
        if (this.phaseT === 50) {
          const banner: Banner =
            this.lastWinner === -1
              ? { text: 'DRAW', style: 'info' }
              : { text: this.lastWinner === 0 ? 'ROUND WIN!' : 'ROUND LOSE', style: this.lastWinner === 0 ? 'win' : 'lose' };
          this.onBanner(banner);
        }
        if (this.phaseT >= 170) {
          if (this.wins[0] >= ROUNDS_TO_WIN || this.wins[1] >= ROUNDS_TO_WIN) {
            this.setPhase('matchEnd');
            const won = this.wins[0] >= ROUNDS_TO_WIN;
            this.onBanner({ text: won ? 'YOU WIN!' : 'YOU LOSE...', sub: `${this.wins[0]} - ${this.wins[1]}`, style: won ? 'win' : 'lose' });
          } else {
            if (this.lastWinner !== -1) this.round++;
            this.startRound();
          }
        }
        break;
      case 'matchEnd':
        if (this.phaseT >= 200) this.finished = true;
        break;
    }
  }

  private checkRoundEnd() {
    const p = this.player;
    const c = this.cpu;
    const pOut = p.state === 'ringout';
    const cOut = c.state === 'ringout';
    const pKo = p.dead || p.hp <= 0;
    const cKo = c.dead || c.hp <= 0;
    let winner = -2;
    let result: RoundResult = 'ko';
    if (pOut || cOut) {
      result = 'ringout';
      winner = pOut && cOut ? -1 : pOut ? 1 : 0;
    } else if (pKo || cKo) {
      result = 'ko';
      winner = pKo && cKo ? -1 : pKo ? 1 : 0;
    } else if (this.timer <= 0) {
      result = 'time';
      const pr = p.hp / p.def.maxHp;
      const cr = c.hp / c.def.maxHp;
      winner = Math.abs(pr - cr) < 1e-6 ? -1 : pr > cr ? 0 : 1;
    }
    if (winner === -2) return;
    this.lastWinner = winner;
    this.lastResult = winner === -1 && result !== 'time' ? 'draw' : result;
    if (winner >= 0) this.wins[winner]++;
    // Freeze the loser's input; the winner keeps standing.
    this.setPhase('roundEnd');
    this.onBanner({
      text: result === 'ringout' ? 'RING OUT!' : result === 'time' ? 'TIME UP!' : 'K.O.!',
      style: 'ko',
    });
    for (const f of [p, c]) if (f.state === 'free' || f.state === 'action' || f.state === 'dash' || f.state === 'hitstun') {
      if (f.isAlive()) {
        f.vel.x *= 0.3;
        f.vel.z *= 0.3;
      }
    }
  }
}
