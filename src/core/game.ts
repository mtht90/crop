import { Decimal, D0 } from './decimal';
import { Emitter } from './events';
import { baseMods, type Mods } from './mods';
import { defaultState, type GameState } from './state';
import { computeMods, computeProduction } from '../logic/production';
import { tickResearch } from '../logic/research';
import { tickExpeditions } from '../logic/expeditions';
import { checkChallenge } from '../logic/challenges';
import { tickBuffs, tickComets } from '../logic/comets';
import { tickAutoClick, tickAutomation } from '../logic/automation';
import { checkAchievements } from '../logic/achievements';
import { gain } from '../logic/economy';
import { BUFF_INFO } from '../logic/comets';

/** これ以上の間隔が空いたら (スリープ等) オンライン扱いせず放置報酬で処理する */
export const MAX_ONLINE_DT = 300;

export class Game {
  s: GameState;
  mods: Mods = baseMods();
  sps: Decimal = D0;
  bldSps: Decimal[] = [];
  upgradeSet = new Set<string>();
  achSet = new Set<string>();
  events = new Emitter();
  /** 保存しない一時フラグ (秘密実績など) */
  flags = new Set<string>();
  newsCount = 0;
  visible = true;
  private dirty = true;
  private slowAccum = 0;
  private autoAccum = 0;
  /** テストで差し替えられるように時刻と乱数を注入可能にする */
  clock: () => number;
  rnd: () => number;

  constructor(state?: GameState, clock: () => number = Date.now, rnd: () => number = Math.random) {
    this.clock = clock;
    this.rnd = rnd;
    this.s = state ?? defaultState(clock());
    this.syncSets();
    this.recalc();
  }

  now(): number {
    return this.clock();
  }

  load(state: GameState): void {
    this.s = state;
    this.syncSets();
    this.recalc();
    this.events.emit({ type: 'reset' });
  }

  syncSets(): void {
    this.upgradeSet = new Set(this.s.upgrades);
    this.achSet = new Set(this.s.achievements);
  }

  markDirty(): void {
    this.dirty = true;
  }

  recalc(): void {
    this.mods = computeMods(this);
    computeProduction(this);
    this.dirty = false;
  }

  recalcIfDirty(): void {
    if (this.dirty) this.recalc();
  }

  // ---- バフ ----
  private buffMult(kind: 'prod' | 'click' | 'cost'): number {
    let m = 1;
    const now = this.now();
    for (const b of this.s.buffs) {
      if (b.end > now && BUFF_INFO[b.id]?.kind === kind) m *= b.mult;
    }
    return m;
  }

  prodBuffMult(): number {
    return this.buffMult('prod');
  }

  clickBuffMult(): number {
    return this.buffMult('click');
  }

  costBuffMult(): number {
    return this.buffMult('cost');
  }

  /** バフ込みの実際の毎秒獲得量 */
  effectiveSps(): Decimal {
    return this.sps.mul(this.prodBuffMult());
  }

  // ---- 集計 ----
  totalBuildings(): number {
    let n = 0;
    for (const b of this.s.buildings) n += b;
    return n;
  }

  totalChallengeCompletions(): number {
    let n = 0;
    for (const v of Object.values(this.s.challenges.completions)) n += v;
    return n;
  }

  // ---- メインループ ----
  /** 前回から経過した秒数を処理する。大きすぎる場合は false を返し、呼び出し側で放置報酬を処理する */
  tick(): boolean {
    const now = this.now();
    const dt = (now - this.s.lastTick) / 1000;
    if (dt > MAX_ONLINE_DT) return false;
    this.s.lastTick = now;
    if (dt <= 0) return true;
    this.step(dt);
    return true;
  }

  step(dt: number): void {
    this.recalcIfDirty();
    const s = this.s;
    gain(this, this.effectiveSps().mul(dt));
    s.stats.playTime += dt;
    tickAutoClick(this, dt);

    this.autoAccum += dt;
    if (this.autoAccum >= 0.25) {
      this.autoAccum = 0;
      tickAutomation(this);
      this.recalcIfDirty();
    }

    this.slowAccum += dt;
    if (this.slowAccum >= 1) {
      const slowDt = this.slowAccum;
      this.slowAccum = 0;
      tickBuffs(this);
      tickResearch(this, slowDt);
      tickExpeditions(this);
      tickComets(this);
      checkChallenge(this);
      this.recalc();
      checkAchievements(this);
      if (this.sps.gt(s.stats.maxSps)) s.stats.maxSps = this.sps;
    }
  }
}
