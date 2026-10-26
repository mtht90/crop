import type { Line, Reel, Rod } from '../data/tackle';
import { LB_TO_KG } from '../data/tackle';
import type { FightStyle, Species } from '../data/types';
import type { IVs } from './individual';
import { IV_MAX } from './individual';
import type { Rng } from './rng';

export type FishBehavior = 'run' | 'hold' | 'approach' | 'jump' | 'cover' | 'snagged';
export type FightOutcome = 'landed' | 'lineBreak' | 'spoolEmpty' | 'hookOut';
export type FightEvent = 'run' | 'jump' | 'headshake' | 'bolt' | 'slack' | 'surge' | 'tug' | 'turn' | 'weeds' | 'cover' | 'snag' | 'unsnag';

/** 針の掛かり具合。solid = 上顎にがっちり / thin = 皮一枚 / foul = 体の外に掛かった（スレ掛かり） */
export type HookHold = 'solid' | 'thin' | 'foul';
export const HOOK_HOLD_LABEL: Record<HookHold, string> = { solid: '口にがっちり', thin: '皮一枚', foul: 'スレ掛かり（体に掛かっていた）' };

/** 魚が逃げ込もうとする障害物（掛けた所から見た向きと距離） */
export interface Obstacle {
  /** 竿を出した向きからの角度 (rad)。正 = 右 */
  lateral: number;
  /** 釣り人からの距離 (m) */
  distance: number;
  /** この範囲に入ったら潜られる (m) */
  radius: number;
  kind: 'weeds' | 'post' | 'rock' | 'log';
}

interface StyleParams {
  /** 走る時間の倍率 */
  runDur: number;
  /** 走りながら切り返す頻度の倍率 */
  turn: number;
  /** ジャンプのしやすさの倍率 */
  jump: number;
  /** 底でじっと耐える行動の重み */
  hold: number;
  /** 首振りの強さ・速さ */
  tug: number;
  tugFreq: number;
  /** 走り出しで障害物を目指す確率 */
  cover: number;
  /** 突っ込みの強さ */
  surge: number;
  /** 泳ぐ深さ（水深に対する割合） */
  depth: number;
}

const STYLES: Record<FightStyle, StyleParams> = {
  bulldog: { runDur: 1.7, turn: 0.45, jump: 0, hold: 1.1, tug: 0.75, tugFreq: 0.7, cover: 0.3, surge: 1.3, depth: 0.85 },
  jumper: { runDur: 0.8, turn: 1.2, jump: 1.8, hold: 0.4, tug: 1, tugFreq: 1, cover: 0.45, surge: 1, depth: 0.45 },
  headshaker: { runDur: 0.9, turn: 0.6, jump: 0, hold: 1.4, tug: 1.7, tugFreq: 0.6, cover: 0.25, surge: 1.1, depth: 0.95 },
  sprinter: { runDur: 1.25, turn: 1.9, jump: 1.2, hold: 0.2, tug: 1.1, tugFreq: 1.4, cover: 0.08, surge: 0.8, depth: 0.3 },
  diver: { runDur: 1, turn: 0.8, jump: 0.3, hold: 0.8, tug: 1.3, tugFreq: 0.8, cover: 0.75, surge: 1.5, depth: 0.7 },
};

function styleOf(s: Species): FightStyle {
  const f = s.fight;
  if (f.style) return f.style;
  if (f.jump > 0.4) return 'jumper';
  if (f.bottom) return 'bulldog';
  return 'sprinter';
}

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
  /** アワセの決まり具合 0..1（弱いとバレやすい） */
  hookQuality?: number;
  /** 周りの障害物（無ければ潜られない） */
  obstacles?: Obstacle[];
  /** 掛かり具合を決めずに指定する（テスト用） */
  hookHold?: HookHold;
}

export interface FightInput {
  reeling: boolean;
  /** 竿を倒す向き -1(左)..1(右) */
  rodSide: number;
  /** 竿の角度 0 = 寝かせる（魚の方へ倒す）.. 1 = 立てる */
  rodLift: number;
}

/** 竿を寝かせた状態から立てきるまでに手前へ引ける糸の長さ (m) */
export const PUMP_LENGTH = 2.2;

/** 魚が十分寄ったら取り込める距離 (m) */
export const LAND_DISTANCE = 2.5;
/** 取り込みに必要なスタミナ残量の上限 */
export const LAND_STAMINA = 0.3;
/** 横へこれ以上走られると藻や障害物に糸が擦れる (rad) */
export const WEED_ANGLE = 0.85;

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
  /** 竿を魚と逆へ倒せている度合い 0..1 */
  oppose = 0;
  /** 藻や障害物に糸が擦れている */
  inWeeds = false;
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
  /** 現在の竿の角度 */
  rodLift = 0.4;
  /** 竿を立てすぎている（ジャンプ・突っ込みで危険） */
  rodHigh = false;
  readonly style: FightStyle;
  private readonly sp: StyleParams;
  /** 掛かり具合と、やり取りで広がった針穴 0..1（広がるほど外れやすい） */
  readonly hookHold: HookHold;
  hole = 0;
  /** 目指している／潜っている障害物 */
  target: Obstacle | null = null;
  private snagTime = 0;
  private lowTensionTime = 0;
  private lastTension = 0;

  constructor(
    private setup: FightSetup,
    private rng: Rng,
  ) {
    const { species, weightKg, iv, rod, reel, line } = setup;
    const f = species.fight;
    this.style = styleOf(species);
    this.sp = STYLES[this.style];
    // 掛かり具合：アワセが良いほどがっちり。稀に体に掛かる（スレ掛かり）
    const q = setup.hookQuality ?? 1;
    this.hookHold = setup.hookHold ?? (rng.chance(0.05) ? 'foul' : rng.chance(0.25 + 0.6 * q) ? 'solid' : 'thin');
    this.pullMax = weightKg * f.pull * (0.8 + (0.4 * iv.power) / IV_MAX);
    this.staminaMax = (1.5 + 12 * Math.pow(weightKg, 0.95)) * f.stamina * (0.7 + (0.6 * iv.stamina) / IV_MAX);
    this.vmax = f.speed * (1 + 0.8 * Math.log10(1 + weightKg)) * (0.8 + (0.4 * iv.speed) / IV_MAX);
    this.runScale = 1 + 0.5 * Math.log10(1 + weightKg);
    this.lineTest = line.lb * LB_TO_KG;
    this.capacity = reel.capacity * line.capMult;
    this.cushion = Math.min(0.9, rod.cushion + line.stretch);
    this.drag = Math.min(setup.drag, reel.dragMax);
    this.distance = setup.distance;
    this.lineOut = setup.distance + 0.4 * PUMP_LENGTH;
    this.depth = setup.depth;
    this.stamina = this.staminaMax;
    // 小さく速い魚ほど細かく、大物ほどゆっくり重く首を振る
    this.tugFreq = ((2.2 + f.speed * 1.2) / (1 + 0.35 * Math.log10(1 + weightKg))) * rng.range(0.85, 1.15) * this.sp.tugFreq;
    this.startBehavior('run');
    // 掛かった直後は近くの障害物へ一気に突っ込むことが多い
    const obs = this.nearestObstacle();
    if (obs && rng.chance(Math.min(0.95, this.sp.cover * 1.3))) {
      this.target = obs;
      this.startBehavior('cover');
    }
  }

  get staminaFraction(): number {
    return this.stamina / this.staminaMax;
  }

  get effectiveLineTest(): number {
    return this.lineTest * (1 - this.wear);
  }

  /** 糸のたるみ (m)。竿を立てるほど糸が必要になる */
  get slack(): number {
    return this.lineOut - (this.distance + this.rodLift * PUMP_LENGTH);
  }

  get hookQuality(): number {
    return this.setup.hookQuality ?? 1;
  }

  /** 針の保持力（外れにくさ）0..1 */
  get hookHoldStrength(): number {
    const base = { solid: 1, thin: 0.45, foul: 0.7 }[this.hookHold];
    return base * (1 - 0.6 * this.hole);
  }

  /** 針穴が広がる */
  private widenHole(amount: number): void {
    this.hole = Math.min(1, this.hole + amount / Math.max(0.3, { solid: 1, thin: 0.5, foul: 0.8 }[this.hookHold]));
  }

  /** タモ入れに失敗して魚が再び走り出す */
  resumeAfterNetMiss(): void {
    this.outcome = null;
    this.stamina = Math.min(this.staminaMax, this.stamina + this.staminaMax * 0.3);
    this.distance += 3;
    this.lineOut = this.distance + this.rodLift * PUMP_LENGTH;
    this.startBehavior('run');
    this.away = 1;
    this.events.push('bolt');
  }

  setDrag(kg: number): void {
    this.drag = Math.max(0.2, Math.min(this.setup.reel.dragMax, kg));
  }

  private intensity(): number {
    const base = { run: 1, hold: 0.45, approach: 0.25, jump: 0.7, cover: 1.1, snagged: 0.3 }[this.behavior];
    return base * (0.3 + 0.7 * this.staminaFraction);
  }

  private startBehavior(b: FishBehavior): void {
    const r = this.rng;
    this.behavior = b;
    switch (b) {
      case 'run': {
        this.behaviorLeft = r.range(1.5, 4) * this.runScale * this.sp.runDur;
        this.away = r.range(0.25, 0.9);
        // 走りは横成分が主体。前の走りと逆へ切り返すことが多い
        const dir = this.side !== 0 && r.chance(0.65) ? -Math.sign(this.side) : r.chance(0.5) ? -1 : 1;
        this.side = dir * r.range(0.6, 1.1);
        this.spike += this.pullMax * 0.7 * this.intensity() * (1 - this.cushion) * this.sp.surge;
        this.events.push('run');
        // 掛かりが浅いと走り出しで外れることがある
        if (r.chance(0.05 * (1 - this.hookQuality) + 0.04 * (1 - this.hookHoldStrength))) this.outcome = 'hookOut';
        break;
      }
      case 'cover':
        // 障害物へ一直線に突っ込む
        this.behaviorLeft = r.range(3, 6);
        this.spike = Math.max(this.spike, this.pullMax * 0.6 * (1 - this.cushion) * this.sp.surge);
        this.events.push('cover');
        break;
      case 'snagged':
        this.behaviorLeft = 1e9;
        this.snagTime = 0;
        this.lowTensionTime = 0;
        this.events.push('snag');
        break;
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
        this.behaviorLeft = 1.0;
        // 跳ねてから最初の首振りまでに竿を寝かせる猶予
        this.shakeTimer = 0.4;
        this.events.push('jump');
        break;
    }
  }

  private nextBehavior(): void {
    const f = this.setup.species.fight;
    const sf = this.staminaFraction;
    const r = this.rng;
    if (f.jump > 0 && this.depth < 2.5 && r.chance(Math.min(0.9, f.jump * 0.45 * this.sp.jump * (0.3 + 0.7 * sf)))) {
      this.startBehavior('jump');
      return;
    }
    // 元気なうちは近くの障害物へ逃げ込もうとする
    const obs = this.nearestObstacle();
    if (obs && r.chance(this.sp.cover * (0.2 + 0.8 * sf))) {
      this.target = obs;
      this.startBehavior('cover');
      return;
    }
    const pick = r.weighted<FishBehavior>(['run', 'hold', 'approach'], (b) =>
      b === 'run' ? f.run * (0.3 + 0.9 * sf) : b === 'hold' ? 0.5 * this.sp.hold : 0.25 + 0.4 * (1 - sf),
    );
    this.startBehavior(pick ?? 'hold');
  }

  /** 今の位置から近い障害物（遠すぎるものは目指さない） */
  private nearestObstacle(): Obstacle | null {
    let best: Obstacle | null = null;
    let bd = Infinity;
    for (const o of this.setup.obstacles ?? []) {
      const d = Math.hypot((o.lateral - this.lateral) * Math.max(this.distance, 4), o.distance - this.distance);
      if (d < bd && d < 18) {
        bd = d;
        best = o;
      }
    }
    return best;
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
    const tugGain = { run: 1, hold: 0.7, approach: 0.25, jump: 0, cover: 1, snagged: 0.5 }[this.behavior] * (0.35 + 0.65 * sf) * Math.min(1.4, this.sp.tug);
    this.tug = Math.pow(Math.max(0, Math.sin(this.tugPhase)), 5) * tugGain;
    const peak = this.tug > 0.6;
    if (peak && !this.lastTugPeak) this.events.push('tug');
    this.lastTugPeak = peak;
    // 走っている最中の急な突っ込み
    if ((this.behavior === 'run' || this.behavior === 'cover') && this.rng.chance(dt * 0.35 * species.fight.run * sf * this.sp.surge)) {
      this.spike += this.pullMax * 0.45 * (1 - this.cushion) * this.sp.surge;
      this.events.push('surge');
    }
    // 体に掛かった魚は横向きに水を受けるので重い
    const pull = this.pullMax * inten * (1 + 0.35 * this.tug * this.sp.tug) * (this.hookHold === 'foul' ? 1.25 : 1);
    // 走っている途中で向きを切り返す
    if (this.behavior === 'run' && this.rng.chance(dt * 0.25 * species.fight.speed * this.sp.turn)) {
      this.side = -this.side;
      this.events.push('turn');
    }
    // 竿を魚の走る向きと逆に倒すと横走りを抑えられ、スタミナを大きく削れる。同じ向きに倒すと魚が楽になる
    const sideSign = Math.sign(this.side);
    const sideAmt = Math.min(1, Math.abs(this.side) * 2);
    const oppose = Math.max(0, -input.rodSide * sideSign) * sideAmt;
    const assist = Math.max(0, input.rodSide * sideSign) * sideAmt;
    this.oppose = oppose;
    // 障害物へ向かう時は、向きと距離をその方へ（竿を逆へ倒す・立てて浮かせると進みが鈍る）
    if (this.behavior === 'cover' && this.target) {
      const dl = this.target.lateral - this.lateral;
      this.side = Math.max(-1.2, Math.min(1.2, (dl * Math.max(this.distance, 4)) / 3));
      this.away = Math.max(-1, Math.min(1, (this.target.distance - this.distance) / 3));
    }
    // 障害物へは全力で泳ぐ。糸の張力と竿の角度で進みを鈍らせることしかできない
    const coverBrake = this.behavior === 'cover' ? Math.max(0.15, 1 - 0.35 * Math.max(0, input.rodLift - 0.4) - (0.6 * this.tension) / Math.max(0.1, this.pullMax * 1.5)) : 1;
    const vr = this.behavior === 'snagged' ? 0 : this.away * this.vmax * inten * coverBrake;
    const vl = this.behavior === 'snagged' ? 0 : this.side * this.vmax * inten * (1 - 0.6 * oppose) * coverBrake;

    this.spike *= Math.exp(-dt * 4);
    this.dragSlipping = false;

    // 竿の角度：立てるほど糸が必要になる（ポンピング）。立てたまま突っ込まれると衝撃が大きい
    const lift = Math.max(0, Math.min(1, input.rodLift));
    this.rodLift = lift;
    this.rodHigh = lift > 0.62;

    // 魚が抵抗する力と、引き寄せられにくさ（重さ）
    const fishForce = pull * Math.max(this.away, 0.1) + 0.06 * weightKg;
    const mass = 0.3 + weightKg * 0.25;

    // リールは重い引きには負ける（竿で寄せてから巻く必要がある）
    const reelLimit = reel.power * 0.55;
    this.reelLoad = input.reeling ? Math.min(1, this.tension / reelLimit) : 0;
    if (input.reeling) {
      const gain = reel.speed * 2.2 * Math.max(0, Math.min(1, 1 - this.tension / reelLimit));
      this.lineOut = Math.max(0.5, this.lineOut - gain * dt);
    }

    // 魚の移動：張力より引く力が強ければ離れ、張力が勝てば寄ってくる
    if (this.behavior === 'cover') this.distance += vr * dt;
    else {
      if (vr < 0) this.distance += vr * dt;
      else this.distance += vr * Math.max(0, Math.min(1, 1 - this.tension / Math.max(0.05, fishForce))) * dt;
      if (this.tension > fishForce) this.distance -= Math.min(4, (this.tension - fishForce) / mass) * dt;
    }
    this.distance = Math.max(0.5, this.distance);

    // 糸をばねとして張力を求める（竿の弾力・糸の伸びが大きいほど柔らかい）
    const k = 7 * (1 - 0.7 * this.cushion) + 0.5;
    const short = this.distance + lift * PUMP_LENGTH - this.lineOut;
    let t = short > 0 ? k * short : 0;
    if (short > -0.05) t += this.spike * (1 + 1.2 * Math.max(0, lift - 0.6));
    if (t > this.drag) {
      // ドラグが滑って糸が出る。ただし滑り出しには引っかかりがあり、急な突っ込みの衝撃は糸に乗る
      this.lineOut += (t - this.drag) / k;
      t = this.drag + this.spike * 0.55;
      this.dragSlipping = true;
    }
    // 針穴：たるみから急に張る・強く引き続けると広がる
    const jerk = (t - this.lastTension) / Math.max(dt, 1e-4);
    if (jerk > this.pullMax * 6 && this.lastTension < 0.2 * this.pullMax) this.widenHole(0.04);
    if (t > this.effectiveLineTest * 0.7) this.widenHole(dt * 0.02);
    this.lastTension = t;
    this.tension = t;
    // 竿の力を超えて立てようとすると竿が負ける（それ以上は寄らない）
    if (lift > 0.3 && t > rod.power * 1.6) this.spike += (t - rod.power * 1.6) * 0.2;

    // ジャンプ中の首振り：たるんでいるとフックが外れやすい
    if (this.behavior === 'jump') {
      this.depth = Math.max(0, this.depth - 6 * dt);
      this.shakeTimer -= dt;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0.25;
        this.events.push('headshake');
        // エラ洗い：竿を立てていると外れやすい（寝かせて耐える）
        const risk = ((this.rodHigh ? 0.3 : 0.02) * (1.3 - 0.5 * this.hookQuality) + (this.slack > 1.2 ? 0.2 : 0)) * (1.6 - this.hookHoldStrength);
        if (this.rng.chance(risk)) this.outcome = 'hookOut';
        else {
          this.spike += this.pullMax * 0.5 * (1 - this.cushion);
          if (this.rodHigh) this.widenHole(0.05);
        }
      }
    } else {
      const targetDepth =
        (this.behavior === 'hold' && species.fight.bottom) || this.behavior === 'cover' || this.behavior === 'snagged'
          ? waterDepth
          : this.behavior === 'approach'
            ? waterDepth * 0.3
            : waterDepth * this.sp.depth;
      const dz = targetDepth - this.depth;
      this.depth += Math.sign(dz) * Math.min(Math.abs(dz), 0.8 * dt);
    }

    this.lateral = Math.max(-1.3, Math.min(1.3, this.lateral + (vl * dt) / Math.max(this.distance, 4)));

    // 障害物に着いたら潜られる
    if (this.behavior === 'cover' && this.target) {
      const d = Math.hypot((this.target.lateral - this.lateral) * Math.max(this.distance, 4), this.target.distance - this.distance);
      if (d < this.target.radius) this.startBehavior('snagged');
    }
    // 潜られている：引けば引くほど糸が擦れる。糸を緩めて待てば自分から出てくる。強引に引きずり出すこともできる
    if (this.behavior === 'snagged' && this.target) {
      this.snagTime += dt;
      const rub = { weeds: 0.5, post: 1.4, rock: 1.8, log: 1.1 }[this.target.kind];
      this.wear = Math.min(1, this.wear + dt * 0.05 * rub * this.setup.line.abrasion * (0.15 + 1.8 * this.tension / this.lineTest));
      this.inWeeds = true;
      this.lowTensionTime = this.tension < 0.25 * this.pullMax ? this.lowTensionTime + dt : 0;
      const outByWait = this.lowTensionTime > 1.2 && this.rng.chance(dt * 0.5);
      const outByForce = this.tension > 0.6 * this.lineTest && this.rng.chance(dt * 0.1 * (1 - sf * 0.5));
      if (outByWait || outByForce) {
        this.events.push('unsnag');
        this.inWeeds = false;
        const away = Math.sign(this.lateral - this.target.lateral) || 1;
        this.target = null;
        this.startBehavior('run');
        this.side = away * 0.8;
      } else if (this.snagTime > 8 && this.rng.chance(dt * 0.04)) {
        // 長く潜られていると針が外れる
        this.outcome = 'hookOut';
        return;
      }
    }

    // 底に張り付いた魚に糸が擦れて摩耗する（根ズレ）
    if (species.fight.bottom && this.behavior === 'hold' && this.depth > waterDepth - 0.5 && this.slack < 0.05) {
      this.wear = Math.min(1, this.wear + dt * 0.012 * this.setup.line.abrasion);
    }
    // 横へ走られすぎると岸寄りの藻や杭に糸が擦れる
    const weeds = (Math.abs(this.lateral) > WEED_ANGLE && this.slack < 0.3) || this.behavior === 'snagged';
    if (weeds && !this.inWeeds) this.events.push('weeds');
    this.inWeeds = weeds;
    if (weeds) this.wear = Math.min(1, this.wear + dt * 0.03 * this.setup.line.abrasion * (Math.abs(this.lateral) - WEED_ANGLE + 0.3));

    // スタミナ：主に「魚と逆へ竿を倒して耐える」ことで削れる
    const drain = this.tension * (0.3 + 1.6 * oppose - 0.2 * assist) * 0.9 + pull * 0.05;
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
      // 糸がたるむと針が外れる（浅い掛かり・広がった穴ほど早い）。潜られている間は外れにくい
      if (this.slackTime > (this.behavior === 'snagged' ? 6 : 2.2 * this.hookHoldStrength + 0.3)) {
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
