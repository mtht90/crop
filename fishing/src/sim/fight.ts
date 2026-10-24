import type { Line, Reel, Rod } from '../data/tackle';
import { LB_TO_KG } from '../data/tackle';
import type { Species } from '../data/types';
import type { IVs } from './individual';
import { IV_MAX } from './individual';
import type { Rng } from './rng';

export type FishBehavior = 'run' | 'hold' | 'approach' | 'jump';
export type FightOutcome = 'landed' | 'lineBreak' | 'spoolEmpty' | 'hookOut';
export type FightEvent = 'run' | 'jump' | 'headshake' | 'bolt' | 'slack' | 'surge' | 'tug';

export interface FightSetup {
  species: Species;
  weightKg: number;
  iv: IVs;
  rod: Rod;
  reel: Reel;
  line: Line;
  /** 初期ドラグ (kg) */
  drag: number;
  /** 掛けた時の距離 (m) */
  distance: number;
  /** 掛けた地点の水深 (m) */
  waterDepth: number;
  /** 掛けた時のルアー水深 (m) */
  depth: number;
}

export interface FightInput {
  reeling: boolean;
  /** 竿を倒す向き -1(左)..1(右) */
  rodSide: number;
}

/** 魚が十分寄ったら取り込める距離 (m) */
export const LAND_DISTANCE = 2.5;
/** 取り込みに必要なスタミナ残量の上限 */
export const LAND_STAMINA = 0.3;

export class Fight {
  readonly pullMax: number;
  readonly staminaMax: number;
  readonly vmax: number;
  readonly lineTest: number;
  readonly capacity: number;
  readonly cushion: number;
  /** 大物ほど長く走る */
  private readonly runScale: number;

  drag: number;
  distance: number;
  lineOut: number;
  /** 横方向の角度 (rad)。正 = 右 */
  lateral = 0;
  depth: number;
  tension = 0;
  stamina: number;
  behavior: FishBehavior = 'run';
  /** 現在の泳ぐ向き：away = 沖方向成分 (-1..1)、side = 横成分 (-1..1) */
  away = 1;
  side = 0;
  dragSlipping = false;
  /** 根ズレによるラインの摩耗 0..1（強度がその分落ちる） */
  wear = 0;
  /** 首振りによる「ググッ」という引きの脈動 0..1（演出・振動用） */
  tug = 0;
  /** 巻いている時のリールの重さ 0..1 */
  reelLoad = 0;
  elapsed = 0;
  outcome: FightOutcome | null = null;
  events: FightEvent[] = [];

  private behaviorLeft = 0;
  private spike = 0;
  private slackTime = 0;
  private shakeTimer = 0;
  private tugPhase = 0;
  private readonly tugFreq: number;
  private lastTugPeak = false;

  constructor(
    private setup: FightSetup,
    private rng: Rng,
  ) {
    const { species, weightKg, iv, rod, reel, line } = setup;
    const f = species.fight;
    this.pullMax = weightKg * f.pull * (0.8 + (0.4 * iv.power) / IV_MAX);
    this.staminaMax = (6 + 10 * Math.pow(weightKg, 0.85)) * f.stamina * (0.7 + (0.6 * iv.stamina) / IV_MAX);
    this.vmax = f.speed * (1 + 0.8 * Math.log10(1 + weightKg)) * (0.8 + (0.4 * iv.speed) / IV_MAX);
    this.runScale = 1 + 0.5 * Math.log10(1 + weightKg);
    this.lineTest = line.lb * LB_TO_KG;
    this.capacity = reel.capacity * line.capMult;
    this.cushion = Math.min(0.9, rod.cushion + line.stretch);
    this.drag = Math.min(setup.drag, reel.dragMax);
    this.distance = setup.distance;
    this.lineOut = setup.distance;
    this.depth = setup.depth;
    this.stamina = this.staminaMax;
    // 小さく速い魚ほど細かく、大物ほどゆっくり重く首を振る
    this.tugFreq = (2.2 + f.speed * 1.2) / (1 + 0.35 * Math.log10(1 + weightKg)) * rng.range(0.85, 1.15);
    this.startBehavior('run');
  }

  get staminaFraction(): number {
    return this.stamina / this.staminaMax;
  }

  get effectiveLineTest(): number {
    return this.lineTest * (1 - this.wear);
  }

  get slack(): number {
    return this.lineOut - this.distance;
  }

  setDrag(kg: number): void {
    this.drag = Math.max(0.2, Math.min(this.setup.reel.dragMax, kg));
  }

  private intensity(): number {
    const base = { run: 1, hold: 0.45, approach: 0.25, jump: 0.7 }[this.behavior];
    return base * (0.3 + 0.7 * this.staminaFraction);
  }

  private startBehavior(b: FishBehavior): void {
    const r = this.rng;
    this.behavior = b;
    switch (b) {
      case 'run': {
        this.behaviorLeft = r.range(1.5, 4) * this.runScale;
        this.away = r.range(0.35, 1);
        this.side = (r.chance(0.5) ? -1 : 1) * (1 - this.away) * r.range(0.8, 1.6);
        this.spike += this.pullMax * 0.7 * this.intensity() * (1 - this.cushion);
        this.events.push('run');
        break;
      }
      case 'hold':
        this.behaviorLeft = r.range(1, 3);
        this.away = r.range(0.05, 0.3);
        this.side = r.range(-0.3, 0.3);
        break;
      case 'approach':
        this.behaviorLeft = r.range(1, 2.5);
        this.away = -r.range(0.4, 0.8);
        this.side = r.range(-0.5, 0.5);
        break;
      case 'jump':
        this.behaviorLeft = 0.9;
        this.shakeTimer = 0;
        this.events.push('jump');
        break;
    }
  }

  private nextBehavior(): void {
    const f = this.setup.species.fight;
    const sf = this.staminaFraction;
    const r = this.rng;
    if (f.jump > 0 && this.depth < 2.5 && r.chance(f.jump * 0.45 * (0.3 + 0.7 * sf))) {
      this.startBehavior('jump');
      return;
    }
    const pick = r.weighted<FishBehavior>(['run', 'hold', 'approach'], (b) =>
      b === 'run' ? f.run * (0.3 + 0.9 * sf) : b === 'hold' ? 0.5 : 0.25 + 0.4 * (1 - sf),
    );
    this.startBehavior(pick ?? 'hold');
  }

  step(input: FightInput, dt: number): void {
    if (this.outcome) return;
    this.events.length = 0;
    this.elapsed += dt;
    const { reel, rod, species, weightKg, waterDepth } = this.setup;

    this.behaviorLeft -= dt;
    if (this.behaviorLeft <= 0) this.nextBehavior();

    const inten = this.intensity();
    // 首振りの脈動：鋭いピークを持つ周期的な引き
    const sf = this.staminaFraction;
    this.tugPhase += dt * this.tugFreq * Math.PI * 2 * (0.7 + 0.5 * sf);
    const tugGain = { run: 1, hold: 0.7, approach: 0.25, jump: 0 }[this.behavior] * (0.35 + 0.65 * sf);
    this.tug = Math.pow(Math.max(0, Math.sin(this.tugPhase)), 5) * tugGain;
    const peak = this.tug > 0.6;
    if (peak && !this.lastTugPeak) this.events.push('tug');
    this.lastTugPeak = peak;
    // 走っている最中の急な突っ込み
    if (this.behavior === 'run' && this.rng.chance(dt * 0.35 * species.fight.run * sf)) {
      this.spike += this.pullMax * 0.45 * (1 - this.cushion);
      this.events.push('surge');
    }
    const pull = this.pullMax * inten * (1 + 0.35 * this.tug);
    // 竿を魚の走る向きと逆に倒すと横走りを抑えられ、スタミナも削れる
    const sideSign = Math.sign(this.side);
    const oppose = Math.max(0, -input.rodSide * sideSign) * Math.min(1, Math.abs(this.side) * 2);
    const vr = this.away * this.vmax * inten;
    const vl = this.side * this.vmax * inten * (1 - 0.6 * oppose);

    this.spike *= Math.exp(-dt * 4);
    this.dragSlipping = false;

    if (vr < 0) this.distance = Math.max(0.5, this.distance + vr * dt);

    if (this.slack > 0.05) {
      // 糸がたるんでいる
      this.tension = Math.max(0, 0.05 - this.slack * 0.05);
      if (vr > 0) this.distance = Math.min(this.lineOut, this.distance + vr * dt);
      if (input.reeling) this.lineOut = Math.max(this.distance, this.lineOut - reel.speed * dt);
    } else {
      this.lineOut = this.distance;
      const fishForce = pull * Math.max(this.away, 0.1) + 0.06 * weightKg;
      const load = input.reeling ? Math.min(reel.power, 0.3 + 0.1 * weightKg) : 0;
      this.reelLoad = input.reeling ? Math.min(1, (fishForce + load) / reel.power) : 0;
      const raw = fishForce + load + this.spike;
      if (raw > this.drag) {
        // ドラグが滑って糸が出る
        const excess = raw - this.drag;
        const slip = Math.max(vr, 0.2 * this.vmax) * Math.min(1, excess / Math.max(0.2, fishForce));
        this.lineOut += slip * dt;
        this.distance = this.lineOut;
        this.tension = this.drag + this.spike * 0.35;
        this.dragSlipping = true;
      } else {
        this.tension = raw;
        if (input.reeling) {
          const gain =
            reel.speed *
            Math.min(1, Math.max(0.15, 1 - fishForce / reel.power)) *
            Math.min(1, Math.max(0.35, (rod.power * 1.3) / Math.max(this.tension, 0.01)));
          this.lineOut = Math.max(0.5, this.lineOut - gain * dt);
          this.distance = this.lineOut;
        }
      }
    }

    // ジャンプ中の首振り：たるんでいるとフックが外れやすい
    if (this.behavior === 'jump') {
      this.depth = Math.max(0, this.depth - 6 * dt);
      this.shakeTimer -= dt;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0.25;
        this.events.push('headshake');
        if (this.slack > 0.3 && this.rng.chance(0.3)) this.outcome = 'hookOut';
        else this.spike += this.pullMax * 0.5 * (1 - this.cushion);
      }
    } else {
      const targetDepth =
        this.behavior === 'hold' && species.fight.bottom
          ? waterDepth
          : this.behavior === 'approach'
            ? waterDepth * 0.3
            : waterDepth * 0.6;
      const dz = targetDepth - this.depth;
      this.depth += Math.sign(dz) * Math.min(Math.abs(dz), 0.8 * dt);
    }

    this.lateral = Math.max(-1.3, Math.min(1.3, this.lateral + (vl * dt) / Math.max(this.distance, 4)));

    // 底に張り付いた魚に糸が擦れて摩耗する（根ズレ）
    if (species.fight.bottom && this.behavior === 'hold' && this.depth > waterDepth - 0.5 && this.slack < 0.05) {
      this.wear = Math.min(1, this.wear + dt * 0.012 * this.setup.line.abrasion);
    }

    // スタミナ
    const drain = this.tension * (1 + 0.6 * oppose) * 0.9 + pull * 0.12;
    this.stamina -= drain * dt;
    if (this.tension < 0.15 * this.pullMax) this.stamina += 0.025 * this.staminaMax * dt;
    this.stamina = Math.max(0, Math.min(this.staminaMax, this.stamina));

    // 判定
    if (this.tension > this.effectiveLineTest) {
      this.outcome = 'lineBreak';
      return;
    }
    if (this.lineOut > this.capacity) {
      this.outcome = 'spoolEmpty';
      return;
    }
    if (this.slack > 0.8) {
      this.slackTime += dt;
      if (this.slackTime > 0.1 && this.slackTime - dt <= 0.1) this.events.push('slack');
      if (this.slackTime > 2.2) {
        this.outcome = 'hookOut';
        return;
      }
    } else {
      this.slackTime = Math.max(0, this.slackTime - dt * 2);
    }
    if (this.distance <= LAND_DISTANCE) {
      if (this.staminaFraction <= LAND_STAMINA) {
        this.outcome = 'landed';
      } else if (this.behavior !== 'run') {
        // まだ元気なので足元で突っ込む
        this.startBehavior('run');
        this.away = 1;
        this.side = 0;
        this.events.push('bolt');
      }
    }
  }
}
