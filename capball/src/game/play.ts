// 打球が飛んでからプレーが止まるまで（自動守備・自動走塁）
import * as THREE from 'three';
import type { Character } from '../render/character';
import type { Player, Pos } from './data';
import { BallSim, CAP_R } from './flight';
import { BASES, BASE_DIST, isFairAngle, sprayAngle } from './geom';
import type { GameState } from './rules';

export interface Fielder {
  pos: Pos;
  player: Player;
  char: Character;
  home: THREE.Vector3;
  target: THREE.Vector3 | null;
  role: 'idle' | 'chase' | 'cover' | 'backup';
  coverBase: number;
  hasBall: boolean;
  busy: number; // 捕球・送球の硬直
  speed: number;
}

export interface Runner {
  player: Player;
  char: Character;
  from: number;
  to: number;
  d: number; // from→to の進んだ距離
  state: 'hold' | 'lead' | 'run' | 'back' | 'safe' | 'out' | 'scored';
  isBatter: boolean;
  speed: number;
  forced: boolean;
  startDelay: number;
  groundStart?: number;
  /** 次の塁まで回るか（塁の手前で判断する） */
  goOn?: boolean;
  decided?: boolean;
}

export type PlayEvent =
  | { type: 'flyCatch'; fielder: Fielder; foul: boolean }
  | { type: 'field'; fielder: Fielder }
  | { type: 'throw'; from: Fielder; base: number }
  | { type: 'out'; runner: Runner; base: number; how: 'force' | 'tag' | 'fly' }
  | { type: 'score'; runner: Runner }
  | { type: 'homerun' }
  | { type: 'groundRuleDouble' }
  | { type: 'foul' }
  | { type: 'bounce'; strong: boolean }
  | { type: 'fence' }
  | { type: 'error'; fielder: Fielder };

export interface PlayResult {
  kind: 'foul' | 'homerun' | 'groundRuleDouble' | 'inPlay';
  batterBase: number; // 打者走者の到達塁（0=アウト）
  hitType: 'single' | 'double' | 'triple' | 'homerun' | null;
  outs: number;
  runs: number;
  flyOut: boolean;
  error: boolean;
}

const segLen = BASE_DIST;
/** 守備の走る速さ（m/s） */
export const FIELDER_SPEED = (speedStat: number) => 4.0 + (speedStat / 100) * 2.0;
/** 走者の速さ（m/s） */
export const RUNNER_SPEED = (speedStat: number) => 5.8 + (speedStat / 100) * 2.6;
const runnerPos = (r: Runner, out = new THREE.Vector3()) => {
  const a = BASES[r.from % 4], b = BASES[r.to % 4];
  return out.lerpVectors(a, b, THREE.MathUtils.clamp(r.d / segLen, 0, 1));
};

export class LivePlay {
  ball: BallSim;
  mode: 'live' | 'held' | 'thrown' | 'dead' = 'live';
  holder: Fielder | null = null;
  throwInfo: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; receiver: Fielder; base: number } | null = null;
  time = 0;
  done = false;
  result: PlayResult;
  private fair: boolean | null = null;
  private chaser: Fielder | null = null;
  private reassignT = 0;
  private quietT = 0;
  private scoredThisPlay: { runner: Runner; t: number }[] = [];
  private caughtFly = false;
  private batterOutEarly = false;
  private lastOutForced = false;
  private nextThinkT = 0;

  constructor(
    public state: GameState,
    public fielders: Fielder[],
    public runners: Runner[],
    ball: BallSim,
    public emit: (e: PlayEvent) => void,
  ) {
    this.ball = ball;
    this.result = { kind: 'inPlay', batterBase: 0, hitType: null, outs: 0, runs: 0, flyOut: false, error: false };
    // 打球への反応時間（この間は動けない）。投手は投げ終わりで遅れる
    const air = ball.vel.y > 3;
    for (const f of fielders) {
      f.role = 'idle';
      f.target = null;
      f.hasBall = false;
      f.busy = this.reaction(f, air);
    }
    this.assignChaser(true);
    this.assignCovers();
    // 走者の初動
    const twoOuts = state.outs === 2;
    const flyLikely = this.ball.vel.y > 6;
    for (const r of runners) {
      if (r.isBatter) {
        r.state = 'run';
        r.startDelay = 0.35;
        continue;
      }
      r.forced = this.isForced(r.from);
      if (twoOuts) r.state = 'run';
      else if (flyLikely) r.state = 'lead';
      else if (r.forced) r.state = 'run';
      else r.state = 'lead';
      r.startDelay = 0.1;
    }
  }

  private reaction(f: Fielder, air: boolean) {
    return 0.34 - f.player.field / 1000 + (air ? 0.18 : 0) + (f.pos === 'P' ? 0.4 : 0) + (f.pos === 'C' ? 0.2 : 0);
  }

  private isForced(base: number): boolean {
    // base(1..3) の走者が押し出されるか：打者走者から連続して塁が埋まっていれば強制
    for (let b = 1; b < base; b++) if (!this.runners.some((r) => !r.isBatter && r.from === b)) return false;
    return true;
  }

  private fielderByPos(p: Pos) {
    return this.fielders.find((f) => f.pos === p)!;
  }

  private throwSpeed(f: Fielder) {
    return 13 + (f.player.arm / 100) * 9;
  }

  private assignChaser(initial = false) {
    if (this.mode !== 'live') return;
    const pred = this.ball.predict(7);
    let best: Fielder | null = null, bestT = Infinity, bestP: THREE.Vector3 | null = null;
    for (const f of this.fielders) {
      if (!initial && f.busy > 0.5) continue;
      const react = initial ? f.busy : 0;
      const fp = f.char.root.position;
      for (const pt of pred.pts) {
        if (pt.p.y > (pt.air ? 2.3 : 1.2)) continue;
        if (f.pos === 'P' && Math.hypot(pt.p.x - f.home.x, pt.p.z - f.home.z) > 3) continue;
        if (f.pos === 'C' && pt.p.z < -6) continue;
        const dist = Math.hypot(pt.p.x - fp.x, pt.p.z - fp.z) - 0.4;
        const t = react + Math.max(0, dist) / f.speed;
        if (t <= pt.t) {
          if (pt.t < bestT) { bestT = pt.t; best = f; bestP = pt.p.clone().setY(0); }
          break;
        }
      }
    }
    if (!best) {
      // 誰も間に合わない → 止まる地点へ一番早く着く人
      const end = pred.end.pos.clone().setY(0);
      for (const f of this.fielders) {
        const t = f.char.root.position.distanceTo(end) / f.speed;
        if (t < bestT) { bestT = t; best = f; bestP = end; }
      }
    }
    if (best && bestP) {
      if (this.chaser && this.chaser !== best) {
        this.chaser.role = 'idle';
        this.chaser.target = null;
      }
      this.chaser = best;
      best.role = 'chase';
      best.target = bestP;
    }
  }

  /** 各塁のベースカバー */
  coverer(base: number): Fielder {
    const busy = (f: Fielder) => f === this.chaser || f === this.holder;
    const order: Record<number, Pos[]> = {
      0: ['C', 'P'],
      1: ['1B', '2B', 'P'],
      2: this.ball.pos.x < 0 ? ['2B', 'SS', 'CF'] : ['SS', '2B', 'CF'],
      3: ['3B', 'SS', 'LF'],
    };
    for (const p of order[base % 4]) {
      const f = this.fielderByPos(p);
      if (!busy(f)) return f;
    }
    return this.fielderByPos(order[base % 4][order[base % 4].length - 1]);
  }

  private assignCovers() {
    for (const f of this.fielders) if (f.role === 'cover') f.role = 'idle';
    for (const b of [1, 2, 3, 0]) {
      const f = this.coverer(b);
      if (f.role === 'chase' || f.hasBall) continue;
      f.role = 'cover';
      f.coverBase = b;
      const bp = BASES[b];
      f.target = bp.clone().add(b === 0 ? new THREE.Vector3(0, 0, 0.6) : new THREE.Vector3(0, 0, 0));
    }
    // 外野の残りはカバーリング
    for (const f of this.fielders) {
      if (f.role === 'idle' && ['LF', 'CF', 'RF'].includes(f.pos) && this.chaser) {
        f.role = 'backup';
        const cp = this.chaser.target ?? this.ball.pos;
        f.target = cp.clone().lerp(f.home, 0.55).setY(0);
      }
    }
  }

  private emitOut(r: Runner, base: number, how: 'force' | 'tag' | 'fly') {
    if (this.state.outs >= 3) return;
    r.state = 'out';
    this.state.outs++;
    this.result.outs++;
    this.lastOutForced = how === 'force';
    if (r.isBatter && how !== 'fly' && r.to === 1) this.batterOutEarly = true;
    this.emit({ type: 'out', runner: r, base, how });
  }

  private startThrow(from: Fielder, base: number) {
    const receiver = this.coverer(base);
    from.hasBall = false;
    this.holder = null;
    from.busy = 0.5;
    from.char.play('Throw', { loop: false, fade: 0.1, speed: 1.6 });
    from.char.faceTowards(BASES[base % 4].x, BASES[base % 4].z);
    const start = from.char.root.position.clone().setY(1.2);
    const to = receiver.role === 'cover' && receiver.target ? receiver.target.clone().setY(1.1) : receiver.char.root.position.clone().setY(1.1);
    const dist = start.distanceTo(to);
    this.throwInfo = { from: start, to, t: -0.16, dur: dist / this.throwSpeed(from), receiver, base };
    this.mode = 'thrown';
    this.emit({ type: 'throw', from, base });
  }

  private holderGotBall(f: Fielder) {
    this.mode = 'held';
    this.holder = f;
    f.hasBall = true;
    f.busy = 0.25;
    this.ball.stopped = true;
    this.nextThinkT = this.time + 0.08;
    this.decideFair(true);
  }

  private decideFair(force = false) {
    if (this.fair !== null) return;
    const p = this.ball.firstLand ?? this.ball.pos;
    const r = Math.hypot(p.x, p.z);
    const cur = this.ball.pos;
    const rc = Math.hypot(cur.x, cur.z);
    if (this.ball.firstLand && r > BASE_DIST * 0.95) this.fair = isFairAngle(sprayAngle(p.x, p.z));
    else if (rc > BASE_DIST * 0.95 && this.ball.bounced) this.fair = isFairAngle(sprayAngle(cur.x, cur.z));
    else if (force) this.fair = cur.z <= 0.3 && isFairAngle(sprayAngle(cur.x, cur.z));
    if (this.fair === false) {
      this.mode = 'dead';
      this.result.kind = 'foul';
      this.emit({ type: 'foul' });
      this.finish();
    }
  }

  /** 送球・進塁の判断（ボールを持った守備） */
  private think(f: Fielder) {
    const fp = f.char.root.position;
    const ts = this.throwSpeed(f);
    let best: { base: number; value: number; self: boolean } | null = null;
    for (const r of this.runners) {
      if (r.state !== 'run' && r.state !== 'back' && r.state !== 'lead') continue;
      if (r.state === 'lead') continue;
      const base = r.state === 'back' ? r.from : r.to;
      const remain = r.state === 'back' ? r.d : segLen - r.d;
      const tRunner = remain / r.speed + Math.max(0, r.startDelay);
      const bp = BASES[base % 4];
      const selfDist = Math.hypot(bp.x - fp.x, bp.z - fp.z);
      const selfT = selfDist / f.speed;
      const throwT = 0.2 + selfDist / ts;
      const useSelf = selfDist < 4 && selfT < throwT + 0.2;
      const t = useSelf ? selfT : throwT;
      if (t + 0.08 < tRunner) {
        const value = (base === 4 || base === 0 ? 10 : base) + (r.isBatter ? 0.5 : 0);
        if (!best || value > best.value) best = { base: base % 4, value, self: useSelf };
      }
    }
    if (best) {
      if (best.self) {
        f.role = 'cover';
        f.coverBase = best.base;
        f.target = BASES[best.base].clone();
      } else this.startThrow(f, best.base);
      return;
    }
    // アウトにできない → 先頭走者の次の塁へ返して進塁を止める
    const moving = this.runners.filter((r) => r.state === 'run');
    if (moving.length) {
      const lead = moving.reduce((a, b) => (a.to > b.to ? a : b));
      const tb = Math.min(4, lead.to + (lead.d > segLen * 0.6 ? 1 : 0)) % 4;
      const bp = BASES[tb];
      if (Math.hypot(bp.x - fp.x, bp.z - fp.z) > 3) this.startThrow(f, tb);
      return;
    }
    // 走者がすべて止まった → 投手へ返球して終了
    if (f.pos !== 'P' && fp.length() > 8) {
      this.startThrowToPitcher(f);
      return;
    }
    this.finishSoon();
  }

  private startThrowToPitcher(f: Fielder) {
    const p = this.fielderByPos('P');
    f.hasBall = false;
    this.holder = null;
    f.char.play('Throw', { loop: false, fade: 0.1, speed: 1.6 });
    const start = f.char.root.position.clone().setY(1.2);
    const to = p.char.root.position.clone().setY(1.1);
    this.throwInfo = { from: start, to, t: -0.2, dur: start.distanceTo(to) / this.throwSpeed(f), receiver: p, base: -1 };
    this.mode = 'thrown';
  }

  private finishSoon() {
    this.quietT = Math.max(this.quietT, 0.01);
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    // 3つ目のアウトが封殺・打者走者のアウトなら、そのプレーの得点は無効
    if (this.state.outs >= 3 && (this.lastOutForced || this.batterOutEarly)) {
      for (const s of this.scoredThisPlay) s.runner.state = 'safe';
      this.scoredThisPlay = [];
    }
    this.result.runs = this.scoredThisPlay.length;
    const b = this.runners.find((r) => r.isBatter)!;
    if (this.result.kind === 'inPlay') {
      this.result.batterBase = b.state === 'out' ? 0 : b.state === 'scored' ? 4 : b.from;
      const othersOut = this.runners.some((r) => !r.isBatter && r.state === 'out');
      if (b.state !== 'out' && !this.result.error && !othersOut) {
        this.result.hitType = (['single', 'single', 'double', 'triple', 'homerun'] as const)[this.result.batterBase] ?? 'single';
      }
      this.result.flyOut = this.caughtFly;
    }
  }

  private catchChance(f: Fielder, airborne: boolean) {
    // 捕球ミス（エラー）の確率
    const base = airborne ? 0.02 : 0.035;
    return Math.random() > base * (1.4 - f.player.field / 100);
  }

  update(dt: number) {
    if (this.done) return;
    this.time += dt;

    // ---- ボール ----
    if (this.mode === 'live') {
      const ev = this.ball.step(dt);
      if (ev === 'bounce') this.emit({ type: 'bounce', strong: Math.abs(this.ball.vel.y) > 2 });
      if (ev === 'fence') this.emit({ type: 'fence' });
      if (ev === 'homerun' || ev === 'groundRuleDouble') {
        this.mode = 'dead';
        this.result.kind = ev;
        if (ev === 'homerun') {
          this.emit({ type: 'homerun' });
          for (const r of this.runners) { r.state = 'run'; r.startDelay = 0; }
          this.homerunTrot = true;
          this.trotEnd = this.time + 3.4;
        } else {
          this.emit({ type: 'groundRuleDouble' });
          this.finish();
          return;
        }
      }
      if (ev === 'outOfPlay') {
        this.mode = 'dead';
        this.result.kind = 'foul';
        this.emit({ type: 'foul' });
        this.finish();
        return;
      }
      if (this.mode === 'live') this.decideFair();
      if (this.done) return;
      // 打球が落ちたら走者は走り出す
      if (this.ball.bounced) for (const r of this.runners) if (r.state === 'lead' && (r.forced || this.ball.pos.z < -18 || this.state.outs === 2)) r.state = 'run';
      if (this.ball.bounced) for (const r of this.runners) if (r.state === 'lead' && r.from === 2 && this.ball.pos.x > 0) r.state = 'run';
      this.reassignT -= dt;
      if (this.reassignT <= 0) {
        this.reassignT = 0.3;
        this.assignChaser();
        this.assignCovers();
      }
    } else if (this.mode === 'thrown' && this.throwInfo) {
      const th = this.throwInfo;
      th.t += dt;
      if (th.t >= 0) {
        const k = Math.min(1, th.t / th.dur);
        this.ball.pos.lerpVectors(th.from, th.to, k);
        this.ball.pos.y += Math.sin(k * Math.PI) * Math.min(2.5, th.dur * 1.6);
        if (k >= 1) {
          this.throwInfo = null;
          const rcv = th.receiver;
          if (th.base === -1) {
            this.mode = 'held';
            this.holder = rcv;
            rcv.hasBall = true;
            this.finishSoon();
          } else {
            this.holderGotBall(rcv);
            rcv.busy = 0.15;
          }
        }
      } else {
        // 振りかぶり中はリリース位置にキャップを持つ
        this.ball.pos.copy(th.from);
      }
    } else if (this.mode === 'held' && this.holder) {
      this.holder.char.handWorld('r', this.ball.pos);
    }

    // ---- 守備の移動 ----
    for (const f of this.fielders) {
      f.busy = Math.max(0, f.busy - dt);
      const c = f.char;
      const p = c.root.position;
      let tgt = f.target;
      if (f.role === 'chase' && this.mode === 'live') {
        // 近づいたら実際のキャップへ寄る
        const bp = this.ball.pos;
        if (Math.hypot(bp.x - p.x, bp.z - p.z) < 3 && bp.y < 2.4) tgt = bp.clone().setY(0);
      }
      let moving = false;
      if (tgt && f.busy <= 0) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.12) {
          const step = Math.min(dist, f.speed * dt);
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          c.faceTowards(tgt.x, tgt.z, 0.25);
          moving = dist > 0.35;
        }
      }
      if (f.busy <= 0) {
        if (moving) c.play('Running_A', { speed: f.speed / 6.5 });
        else {
          c.play('Idle', { fade: 0.25 });
          if (this.mode === 'live' || this.mode === 'thrown') c.faceTowards(this.ball.pos.x, this.ball.pos.z, 0.15);
        }
      }
      // 捕球（打球）
      if (this.mode === 'live' && f.busy <= 0) {
        const bp = this.ball.pos;
        const hd = Math.hypot(bp.x - p.x, bp.z - p.z);
        const airborne = !this.ball.bounced;
        const reachH = airborne ? 2.0 : 0.9;
        // 手を伸ばす
        if (hd < 2.2 && bp.y < 3) {
          const local = c.root.worldToLocal(bp.clone());
          c.setPose({ handR: local.clone().add(new THREE.Vector3(-0.08, 0, 0)), handL: local.clone().add(new THREE.Vector3(0.08, 0, 0)) }, 0.9);
        }
        if (hd < 0.6 && bp.y < reachH) {
          c.setPose(null);
          if (!this.catchChance(f, airborne)) {
            // はじく
            this.ball.vel.set((Math.random() - 0.5) * 4, 1.5, (Math.random() - 0.5) * 4);
            this.ball.rolling = false;
            this.ball.bounced = true;
            f.busy = 0.6;
            this.result.error = true;
            this.emit({ type: 'error', fielder: f });
          } else if (airborne) {
            this.decideFairOnCatch();
            this.caughtFly = true;
            this.emit({ type: 'flyCatch', fielder: f, foul: false });
            const batter = this.runners.find((r) => r.isBatter)!;
            this.emitOut(batter, 0, 'fly');
            this.holderGotBall(f);
            f.busy = 0.45;
            c.play('Idle', { fade: 0.1 });
            // 走者は帰塁、三塁走者はタッチアップ
            for (const r of this.runners) {
              if (r.isBatter || r.state === 'out') continue;
              const deep = Math.hypot(p.x, p.z) > 24;
              if (r.from === 3 && deep && this.state.outs < 3) {
                r.d = 0;
                r.to = 4;
                r.state = 'run';
                r.startDelay = 0.15;
              } else if (r.d > 0.05) r.state = 'back';
              else { r.state = 'safe'; r.d = 0; }
            }
            if (this.state.outs >= 3) this.finish();
          } else {
            this.emit({ type: 'field', fielder: f });
            this.holderGotBall(f);
            c.play('PickUp', { loop: false, fade: 0.08, speed: 2.4 });
            f.busy = 0.25;
          }
        }
      } else if (!(this.mode === 'live')) {
        if (f.char.poseTarget > 0 && !f.char.pose?.bat) f.char.setPose(null);
      }
    }

    // ---- 走者 ----
    for (const r of this.runners) {
      if (r.state === 'out' || r.state === 'scored' || r.state === 'safe' && !this.homerunTrot && !this.groundRule) {
        if (r.state === 'out') r.char.root.visible = false;
        continue;
      }
      if (this.groundRule && r.state !== 'run') {
        r.state = 'run';
      }
      r.startDelay -= dt;
      if (r.startDelay > 0) continue;
      const c = r.char;
      if (r.state === 'hold') {
        c.play('Idle');
        continue;
      }
      if (r.state === 'lead' && (this.mode === 'held' || this.mode === 'thrown')) {
        // 打球が処理されたら帰塁（押し出しの走者は進む）
        r.state = r.forced ? 'run' : 'back';
      }
      if (r.state === 'lead') {
        // ハーフウェイで待つ
        const lim = r.forced ? segLen * 0.35 : segLen * 0.25;
        if (r.d < lim) r.d = Math.min(lim, r.d + r.speed * 0.5 * dt);
        c.play(r.d < lim ? 'Running_A' : 'Idle', { speed: 0.7 });
      } else if (r.state === 'back') {
        r.d -= r.speed * dt;
        c.play('Running_A', { speed: r.speed / 6.5 });
        if (r.d <= 0) {
          r.d = 0;
          r.state = 'safe';
          c.play('Idle');
        }
      } else if (r.state === 'run' || (r.state === 'safe' && (this.homerunTrot || this.groundRule))) {
        if (r.state === 'safe') r.state = 'run';
        // 前の走者を追い越さない（塁が埋まっていて動かないなら戻る）
        const ahead = this.runners.find((o) => o !== r && o.state !== 'out' && o.state !== 'scored' && o.from === r.to && o.state !== 'run' && r.to < 4);
        const sp = this.homerunTrot ? 6.2 : r.speed;
        if (ahead && !this.homerunTrot && r.d >= segLen - 1.2) {
          if (ahead.state === 'safe' || ahead.state === 'hold') {
            r.state = 'back';
            r.goOn = false;
          }
        } else r.d += sp * dt;
        // 塁の手前で、もう一つ先の塁を狙うか決める
        if (!this.homerunTrot && !r.decided && r.d >= segLen * 0.55 && r.to < 4) {
          r.decided = true;
          r.goOn = this.shouldAdvance(r, (segLen - r.d) / r.speed);
        }
        c.play('Running_A', { speed: sp / 6.5 });
        if (r.d >= segLen) {
          r.d = 0;
          r.from = r.to;
          if (r.from >= 4) {
            r.from = 4;
            r.state = 'scored';
            this.scoredThisPlay.push({ runner: r, t: this.time });
            this.emit({ type: 'score', runner: r });
            c.play('Cheer', { loop: true });
            c.root.visible = false;
          } else {
            const limit = this.groundRule ? (r.isBatter ? 2 : Math.min(4, (r.groundStart ?? r.from) + 2)) : 4;
            if (this.groundRule && r.groundStart === undefined) r.groundStart = r.from - 1;
            const go = this.homerunTrot || (this.groundRule ? r.from < limit : !!r.goOn && this.shouldAdvance(r, 0, 0.15));
            r.decided = false;
            r.goOn = false;
            if (go) {
              r.to = r.from + 1;
            } else {
              r.state = 'safe';
              r.to = r.from + 1;
              c.play('Idle');
            }
          }
        }
      }
      if (r.state === 'scored') continue;
      runnerPos(r, c.root.position);
      const tb = BASES[(r.state === 'back' ? r.from : r.to) % 4];
      if (r.state !== 'safe') c.faceTowards(tb.x, tb.z, 0.3);
    }

    // ---- アウト判定（ボールを持った守備が塁上 / 走者に触れる） ----
    if (this.holder && this.mode === 'held') {
      const hp = this.holder.char.root.position;
      for (const r of this.runners) {
        if (r.state !== 'run' && r.state !== 'back' && r.state !== 'lead') continue;
        const base = r.state === 'back' ? r.from : r.to % 4;
        const bp = BASES[base];
        const onBase = Math.hypot(hp.x - bp.x, hp.z - bp.z) < 0.9;
        const forced = r.isBatter ? r.to === 1 : r.forced && r.state === 'run' && r.to === r.from + 1 && this.isForcedNow(r);
        if (onBase && (r.state === 'run' || r.state === 'back')) {
          this.emitOut(r, base, forced && r.state === 'run' ? 'force' : 'tag');
          this.nextThinkT = this.time + 0.25;
          if (this.state.outs >= 3) { this.finish(); return; }
          continue;
        }
        const rp = runnerPos(r);
        if (rp.distanceTo(new THREE.Vector3(hp.x, 0, hp.z)) < 0.7 && r.d > 0.5 && r.d < segLen - 0.5) {
          this.emitOut(r, base, 'tag');
          this.nextThinkT = this.time + 0.25;
          if (this.state.outs >= 3) { this.finish(); return; }
        }
      }
      if (this.time >= this.nextThinkT && this.holder.busy <= 0) {
        this.nextThinkT = this.time + 0.3;
        this.think(this.holder);
      }
    }

    // ---- 終了判定 ----
    const active = this.runners.some((r) => r.state === 'run' || r.state === 'back' || (r.state === 'lead' && this.mode !== 'held'));
    if (this.mode === 'dead' && (this.homerunTrot || this.groundRule)) {
      // ダイヤモンド一周は途中まで見せて切り上げる（得点の計算は試合側で行う）
      if (!active || this.time > this.trotEnd) this.finish();
    } else if ((this.mode === 'held' && !active) || this.state.outs >= 3) {
      this.quietT += dt;
      if (this.quietT > 0.6 || this.state.outs >= 3) {
        for (const r of this.runners) if (r.state === 'lead') { r.state = 'safe'; r.d = 0; }
        this.finish();
      }
    } else this.quietT = 0;
    if (this.time > 22) this.finish();
  }

  homerunTrot = false;
  groundRule = false;
  private trotEnd = Infinity;

  private decideFairOnCatch() {
    // ノーバウンド捕球はフェア・ファウル問わずアウト
    this.fair = true;
  }

  private isForcedNow(r: Runner) {
    // r.from の塁より後ろが全部埋まっている（＝押し出し）かを、プレー開始時の判断で代用
    return r.forced;
  }

  /** 次の塁を狙うか。toBase: 今向かっている塁までの残り時間 */
  private shouldAdvance(r: Runner, toBase = 0, relax = 0): boolean {
    const cur = toBase > 0 ? r.to : r.from;
    if (cur >= 4 || cur + 1 > 4) return false;
    // 先の塁が埋まっていて、その走者が動かないなら行かない
    const blocked = this.runners.some((o) => o !== r && (o.state === 'safe' || o.state === 'hold' || o.state === 'lead') && o.from === cur + 1);
    if (blocked) return false;
    const next = BASES[(cur + 1) % 4];
    const runT = toBase + segLen / r.speed;
    let ballT: number;
    // 送球までの硬直（拾う・持ち替える・振りかぶる）
    const handle = 0.62;
    if (this.mode === 'live') {
      if (!this.ball.bounced && !this.ball.stopped) return false;
      const ch = this.chaser;
      if (!ch) return false;
      const at = ch.target ?? this.ball.pos.clone().setY(0);
      const reach = Math.max(ch.busy, ch.char.root.position.distanceTo(at) / ch.speed);
      ballT = reach + handle + at.distanceTo(next) / this.throwSpeed(ch);
    } else if (this.mode === 'held' && this.holder) {
      ballT = Math.max(0.3, this.holder.busy + 0.3) + this.holder.char.root.position.distanceTo(next) / this.throwSpeed(this.holder);
    } else if (this.mode === 'thrown' && this.throwInfo) {
      // 中継中: 今の送球先が次の塁でなければ、受けてから投げ直す
      const th = this.throwInfo;
      const toNext = th.to.distanceTo(next.clone().setY(1.1)) < 1.5;
      ballT = th.dur - th.t + (toNext ? 0 : 0.5 + th.to.distanceTo(next) / 24);
    } else return false;
    const margin = (cur + 1 === 4 ? 0.55 : 0.35) - relax;
    return runT + margin < ballT;
  }
}

export { CAP_R };
