import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { audio } from '../core/audio';
import type { Engine } from '../render/engine';
import { Character, type ProcPose } from '../render/character';
import { makeCapBall, Trail, CAP_VIS_R } from '../render/cap';
import { pitchPose, PITCH_RELEASE_T, PITCH_TOTAL_T, stancePose, swingKeys, samplePose, mirrorPose, SWING_TOTAL_T } from '../render/motions';
import { Hud, PitchControl, BatControl, type ThrowInput } from '../ui/hud';
import { PITCHES, type Difficulty, type Player, type Pos, type Team } from './data';
import { BASES, POSITIONS, ZONE } from './geom';
import { GameState, type Side } from './rules';
import { PitchPath } from './pitch';
import { cursorSize, inZone, resolveContact, SWING_LEAD, type SwingMode } from './batting';
import { BallSim } from './flight';
import { LivePlay, FIELDER_SPEED, RUNNER_SPEED, type Fielder, type PlayEvent, type Runner } from './play';
import { cpuChoosePitch, cpuPlanSwing } from './ai';

export interface MatchOptions {
  away: Team;
  home: Team;
  user: 'away' | 'home';
  innings: number;
  difficulty: Difficulty;
  /** CPU 同士で進める（デモ・確認用） */
  autoplay?: boolean;
}

type PitchOutcome = 'ball' | 'strike' | 'foul' | 'inplay' | 'strikeout' | 'walk';

const CATCHER_POS = new THREE.Vector3(0, 0, 1.9);
/** 投球時のカメラ（捕手の後方・望遠）: 位置xyz, 注視点xyz, 本塁上で見せる横幅の半分 */
const PITCH_CAM = (new URLSearchParams(location.search).get('pc') || '0,2.15,8.8,0,0.25,-4,0.95').split(',').map(Number);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export class Match {
  state: GameState;
  private chars = new Map<Player, Character>();
  private fielders: Fielder[] = [];
  private cap: THREE.Object3D;
  private capShadow: THREE.Mesh;
  private trail = new Trail(26);
  private time = 0;
  private waits: { t: number; r: () => void }[] = [];
  private phase: 'idle' | 'aim' | 'windup' | 'flight' | 'play' | 'between' = 'idle';
  private pitchCtl: PitchControl | null = null;
  private batCtl: BatControl | null = null;
  private path: PitchPath | null = null;
  private flightT = 0;
  private windT = 0;
  private swingT = -1;
  private swingKeysCur: ReturnType<typeof swingKeys> | null = null;
  private swingAt = -1; // flightT でのスイング開始
  private swingMode: SwingMode = 'meet';
  private swingCursor = new THREE.Vector2();
  private contactDone = false;
  private pitchResolve: ((o: PitchOutcome) => void) | null = null;
  private pendingThrow: ThrowInput | null = null;
  private cpuSwing: ReturnType<typeof cpuPlanSwing> | null = null;
  private live: LivePlay | null = null;
  private camMode: 'pitch' | 'follow' | 'wide' = 'pitch';
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private lastSpeed: number | null = null;
  private lastPitchName = '';
  private capSpin = 0;
  private stopUpdate: () => void;
  private quit = false;
  private hitStop = 0;

  constructor(private engine: Engine, assets: Assets, private hud: Hud, private opts: MatchOptions) {
    this.state = new GameState(opts.away, opts.home, opts.innings);
    const scene = engine.scene;
    for (const [team, uni] of [[opts.away, opts.away.awayUniform], [opts.home, opts.home.uniform]] as const) {
      for (const p of [...team.players, ...team.bench]) {
        const c = new Character(assets.models[p.model], p.model, uni, assets.anims);
        c.attachBat(assets.bat.scene);
        c.root.visible = false;
        scene.add(c.root);
        this.chars.set(p, c);
      }
    }
    this.cap = makeCapBall();
    this.cap.visible = false;
    scene.add(this.cap);
    this.capShadow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    this.capShadow.rotation.x = -Math.PI / 2;
    this.capShadow.visible = false;
    scene.add(this.capShadow);
    scene.add(this.trail.mesh);
    this.stopUpdate = engine.onUpdate((dt) => this.update(dt));
  }

  dispose() {
    this.quit = true;
    this.stopUpdate();
    this.pitchCtl?.dispose();
    this.batCtl?.dispose();
    for (const c of this.chars.values()) this.engine.scene.remove(c.root);
    this.engine.scene.remove(this.cap, this.capShadow, this.trail.mesh);
    for (const w of this.waits) w.r();
  }

  get userBatting() {
    return (this.state.half === 'top') === (this.opts.user === 'away');
  }

  private sleep(s: number) {
    return new Promise<void>((r) => this.waits.push({ t: this.time + s, r }));
  }

  private char(p: Player) {
    return this.chars.get(p)!;
  }

  // =====================================================================
  async run(): Promise<GameState> {
    const s = this.state;
    this.setupHalf();
    this.hud.updateBoard(s, this.opts.user === 'away');
    this.hud.updateCards(s, null);
    await this.sleep(0.4);
    audio.play('whistle', { volume: 0.7 });
    this.hud.telop('プレイボール！', 'big');
    await this.sleep(1.4);
    while (!s.over && !this.quit) {
      await this.atBat();
      if (this.quit) break;
      if (s.walkOff()) {
        s.over = true;
        break;
      }
      if (s.outs >= 3) {
        const over = s.endHalf();
        this.hud.updateBoard(s, this.opts.user === 'away');
        if (over) break;
        this.hud.telop('チェンジ', '');
        audio.play('chime', { volume: 0.5 });
        await this.sleep(1.2);
        this.hud.fade(true);
        await this.sleep(0.3);
        this.setupHalf();
        this.hud.updateBoard(s, this.opts.user === 'away');
        this.hud.fade(false);
        await this.sleep(0.5);
        this.hud.telop(`${s.inning}回${s.half === 'top' ? '表' : '裏'}`, '', `${s.batting.team.name}の攻撃`);
        await this.sleep(1.3);
      }
    }
    if (!this.quit) {
      audio.play('whistle', { volume: 0.7 });
      const win = Math.sign(s.score(s.home) - s.score(s.away)) * (this.opts.user === 'home' ? 1 : -1);
      this.hud.telop(s.walkOff() ? 'サヨナラ！！' : 'ゲームセット', s.walkOff() ? 'hr' : 'big');
      audio.play(win > 0 ? 'cheer_big' : 'clap', { volume: 0.7 });
      this.celebrate(win > 0 ? (this.opts.user === 'home' ? s.home : s.away) : this.opts.user === 'home' ? s.away : s.home);
      await this.sleep(3);
    }
    this.cleanupControls();
    return s;
  }

  private celebrate(side: Side) {
    for (const p of side.team.players) {
      const c = this.char(p);
      if (c.root.visible) {
        c.setPose(null);
        c.play('Cheer');
      }
    }
  }

  // ---------------------------------------------------------------------
  /** 攻守の配置 */
  private setupHalf() {
    const s = this.state;
    for (const c of this.chars.values()) {
      c.root.visible = false;
      c.setPose(null);
      c.poseWeight = 0;
    }
    const fteam = s.fielding.team;
    this.fielders = fteam.players.map((pl) => {
      const p = pl.pos === 'P' ? s.fielding.pitcher : pl;
      const pos = pl.pos;
      const home = (pos === 'C' ? CATCHER_POS : POSITIONS[pos]).clone();
      return { pos: pos as Pos, player: p, char: this.char(p), home, target: null, role: 'idle', coverBase: 0, hasBall: false, busy: 0, speed: FIELDER_SPEED(p.speed) } as Fielder;
    });
    this.resetPositions();
  }

  private resetPositions() {
    const s = this.state;
    for (const f of this.fielders) {
      const c = f.char;
      c.root.visible = true;
      c.root.position.copy(f.home);
      c.setPose(null);
      c.poseWeight = 0;
      if (f.pos === 'C') {
        c.root.rotation.y = Math.PI;
        c.play('Crouching', { fade: 0 });
      } else if (f.pos === 'P') {
        c.root.rotation.y = 0;
        c.play('Idle', { fade: 0 });
      } else {
        c.faceTowards(0, 0);
        c.play('Idle', { fade: 0, offset: Math.random() });
      }
    }
    // 打撃側：全員隠してから打者と走者を置く
    for (const p of s.batting.team.players) this.char(p).root.visible = false;
    s.bases.forEach((p, i) => {
      if (!p) return;
      const c = this.char(p);
      c.root.visible = true;
      c.setPose(null);
      c.poseWeight = 0;
      const b = BASES[i + 1];
      const next = BASES[(i + 2) % 4];
      c.root.position.copy(b).lerp(next, 0.08);
      c.faceTowards(next.x, next.z);
      c.play('Idle', { fade: 0 });
    });
    this.placeBatter();
  }

  private placeBatter() {
    const b = this.state.batter;
    const c = this.char(b);
    c.root.visible = true;
    const L = b.bats === 'L';
    c.root.position.set(L ? 0.8 : -0.8, 0, 0.05);
    c.root.rotation.y = L ? -Math.PI / 2 : Math.PI / 2;
    c.play('Idle', { fade: 0 });
    c.setPose(this.stance(b, 0), 1);
    c.poseWeight = 1;
  }

  private stance(b: Player, t: number): ProcPose {
    const p = stancePose(t);
    return b.bats === 'L' ? mirrorPose(p) : p;
  }

  // ---------------------------------------------------------------------
  /** 疲れた投手を控えと交代する */
  private async maybeRelief() {
    const s = this.state;
    const side = s.fielding;
    if (side.stamina > 0.12) return;
    const next = side.team.bench.find((p) => p.pos === 'P' && p !== side.pitcher && !this.usedPitchers.has(p));
    if (!next) return;
    this.usedPitchers.add(side.pitcher);
    const old = this.char(side.pitcher);
    old.root.visible = false;
    side.pitcher = next;
    side.stamina = 1;
    side.pitchCount = 0;
    const f = this.fielders.find((x) => x.pos === 'P')!;
    f.player = next;
    f.char = this.char(next);
    f.speed = FIELDER_SPEED(next.speed);
    this.resetPositions();
    this.hud.telop('ピッチャー交代', 'small', next.name, 1500);
    audio.play('chime', { volume: 0.4 });
    await this.sleep(1.5);
  }
  private usedPitchers = new Set<Player>();

  private async atBat() {
    const s = this.state;
    await this.maybeRelief();
    this.placeBatter();
    this.hud.updateBoard(s, this.opts.user === 'away');
    this.hud.updateCards(s, this.lastSpeed, this.lastPitchName);
    let last: PitchOutcome = 'ball';
    while (!this.quit) {
      last = await this.pitchOnce();
      this.hud.updateBoard(s, this.opts.user === 'away');
      this.hud.updateCards(s, this.lastSpeed, this.lastPitchName);
      if (last === 'inplay' || last === 'strikeout' || last === 'walk') break;
      if (s.outs >= 3) break;
      await this.sleep(0.55);
    }
    if (this.quit) return;
    s.nextBatter();
    if (s.walkOff() || s.outs >= 3) return;
    // 次の打者へ（打球後はすでに暗転している）
    if (last !== 'inplay') {
      this.hud.fade(true);
      await this.sleep(0.28);
    }
    this.resetPositions();
    this.cap.visible = false;
    this.capShadow.visible = false;
    this.trail.clear();
    this.camMode = 'pitch';
    this.hud.fade(false);
    this.hud.showZone(true);
  }

  private cleanupControls() {
    this.pitchCtl?.dispose();
    this.pitchCtl = null;
    this.batCtl?.dispose();
    this.batCtl = null;
    this.hud.showMark(null);
  }

  private pitchOnce(): Promise<PitchOutcome> {
    const s = this.state;
    this.cleanupControls();
    this.path = null;
    this.flightT = 0;
    this.windT = 0;
    this.swingT = -1;
    this.swingAt = -1;
    this.swingKeysCur = null;
    this.contactDone = false;
    this.pendingThrow = null;
    this.cpuSwing = null;
    this.cap.visible = false;
    this.capShadow.visible = false;
    this.trail.clear();
    this.camMode = 'pitch';
    this.hud.showZone(true);
    const batter = s.batter;
    const pitcher = s.fielding.pitcher;
    const bc = this.char(batter);
    bc.setPose(this.stance(batter, 0), 1);
    this.char(pitcher).setPose(null);
    this.char(pitcher).play('Idle');

    if (this.opts.autoplay) {
      const cp = cpuChoosePitch(s, pitcher, this.opts.difficulty);
      this.sleep(0.8 + Math.random() * 0.5).then(() => {
        if (this.phase === 'aim') this.beginWindup(cp);
      });
    } else if (this.userBatting) {
      this.batCtl = new BatControl(this.hud, (m) => cursorSize(batter, m, this.opts.difficulty.assist));
      this.batCtl.onRelease = () => this.userSwing();
      // CPU 投手
      const cp = cpuChoosePitch(s, pitcher, this.opts.difficulty);
      this.sleep(0.9 + Math.random() * 0.7).then(() => {
        if (this.phase === 'aim') this.beginWindup(cp);
      });
    } else {
      this.pitchCtl = new PitchControl(this.hud, pitcher.pitches ?? [], (t) => {
        if (this.phase === 'aim') this.beginWindup(t);
      });
    }
    this.phase = 'aim';
    return new Promise<PitchOutcome>((r) => (this.pitchResolve = r));
  }

  private beginWindup(t: ThrowInput) {
    this.pendingThrow = t;
    this.phase = 'windup';
    this.windT = 0;
    if (this.pitchCtl) {
      this.pitchCtl.dispose();
      this.pitchCtl = null;
    }
    this.hud.showAim(null);
  }

  /** リリース：投球パラメータを確定してキャップを放つ */
  private release() {
    const s = this.state;
    const t = this.pendingThrow!;
    const pitcher = s.fielding.pitcher;
    const def = PITCHES[t.kind];
    const side = s.fielding;
    const fatigue = side.stamina;
    const velo = (pitcher.velo ?? 135) * def.speedMul * (0.86 + 0.14 * t.speedNorm) * (0.93 + 0.07 * fatigue);
    // 制球：能力・リングのタイミング・疲れ
    const ctrl = pitcher.control ?? 60;
    const cpu = !this.pitchCtlUser;
    let sigma = 0.025 + (1 - ctrl / 100) * 0.09;
    sigma *= 1 + t.timingErr * 3.2;
    sigma *= 1 + (1 - fatigue) * 1.4;
    if (cpu) sigma *= 1.6 - this.opts.difficulty.cpuControl;
    const target = new THREE.Vector3(t.aim.x + gauss() * sigma, t.aim.y + gauss() * sigma, 0);
    // スワイプの曲げ：球種の横変化と同じ向きなら変化が大きく、逆なら小さく
    const lat = Math.sign(def.bx);
    const breakMul = THREE.MathUtils.clamp(1 + (lat !== 0 ? lat * t.bend * 0.45 : 0) + (t.speedNorm - 0.6) * 0.2, 0.55, 1.5) * (t.timingErr > 0.45 ? 0.6 : 1);
    const extraBx = lat === 0 ? t.bend * 0.12 : 0;
    const release = new THREE.Vector3();
    this.char(pitcher).handWorld('r', release);
    release.y = Math.max(release.y, 0.9);
    this.path = new PitchPath({ kind: t.kind, level: t.level, speedKmh: velo, release, target, breakMul, extraBx, seed: Math.random() });
    this.lastSpeed = Math.round(velo);
    this.lastPitchName = def.name;
    if (this.pitchCtlUser && !this.opts.autoplay) {
      if (t.timingErr < 0.1) this.hud.telop('ナイスリリース！', 'small good', '', 700);
      else if (t.timingErr > 0.45) this.hud.telop('すっぽ抜け…', 'small bad', '', 700);
    }
    side.pitchCount++;
    side.stamina = Math.max(0, side.stamina - 1 / (30 + (pitcher.stamina ?? 60) * 0.9));
    this.phase = 'flight';
    this.flightT = 0;
    this.cap.visible = true;
    this.capShadow.visible = true;
    audio.play('throw', { volume: 0.45, rate: 1.1 });
    if (!this.userBatting || this.opts.autoplay) {
      this.cpuSwing = cpuPlanSwing(s, s.batter, this.path, this.opts.difficulty, SWING_LEAD);
    }
  }

  private get pitchCtlUser() {
    return !this.userBatting;
  }

  private userSwing() {
    if (this.phase !== 'flight' || this.swingAt >= 0 || !this.batCtl) return;
    this.startSwing(this.batCtl.cursor.clone(), this.batCtl.mode);
  }

  private startSwing(cursor: THREE.Vector2, mode: SwingMode) {
    this.swingAt = this.flightT;
    this.swingT = 0;
    this.swingMode = mode;
    this.swingCursor.copy(cursor);
    const b = this.state.batter;
    const c = this.char(b);
    const world = new THREE.Vector3(cursor.x, cursor.y, 0.02);
    const local = c.root.worldToLocal(world.clone());
    if (b.bats === 'L') local.x = -local.x;
    this.swingKeysCur = swingKeys(local, mode === 'bunt');
    if (mode !== 'bunt') audio.play('swing', { volume: 0.55, delay: 0.05 });
  }

  // ---------------------------------------------------------------------
  private update(dt: number) {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.08;
    }
    this.time += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) {
      if (this.waits[i].t <= this.time) {
        const w = this.waits[i];
        this.waits.splice(i, 1);
        w.r();
      }
    }
    const s = this.state;
    this.pitchCtl?.update(dt);
    this.batCtl?.update(dt);

    const batter = s.batter;
    const bc = this.char(batter);
    const pitcher = s.fielding.pitcher;
    const pc = this.char(pitcher);

    // 打者
    if (this.phase === 'aim' || this.phase === 'windup' || this.phase === 'flight') {
      if (this.swingKeysCur) {
        this.swingT += dt;
        let pose = samplePose(this.swingKeysCur, this.swingT);
        if (batter.bats === 'L') pose = mirrorPose(pose);
        bc.setPose(pose, 1);
      } else bc.setPose(this.stance(batter, this.time), 1);
    }

    if (this.phase === 'windup') {
      this.windT += dt;
      pc.setPose(pitchPose(this.windT), 1);
      // キャップを手に持たせる
      if (this.windT > 0.15) {
        this.cap.visible = true;
        pc.handWorld('r', this.cap.position);
      }
      if (this.windT >= PITCH_RELEASE_T) this.release();
    } else if (this.phase === 'flight' && this.path) {
      this.windT += dt;
      pc.setPose(pitchPose(Math.min(this.windT, PITCH_TOTAL_T)), this.windT > PITCH_TOTAL_T + 0.2 ? 0 : 1);
      this.updateFlight(dt);
    } else if (this.phase === 'play' && this.live) {
      this.live.update(dt);
      this.cap.position.copy(this.live.ball.pos);
      if (this.windT < PITCH_TOTAL_T + 0.3) {
        this.windT += dt;
        if (!this.live.fielders.find((f) => f.player === pitcher)?.target) pc.setPose(pitchPose(Math.min(this.windT, PITCH_TOTAL_T)), this.windT > PITCH_TOTAL_T ? 0 : 1);
      }
      // バットを置いて走る
      if (this.swingKeysCur && this.swingT < SWING_TOTAL_T + 0.1) {
        this.swingT += dt;
      }
    }

    // キャップの回転・影・軌跡
    if (this.cap.visible) {
      this.capSpin += dt * 38;
      const kind = this.path?.params.kind;
      const tilt = kind === 'curve' || kind === 'slider' ? 0.9 : kind === 'shoot' || kind === 'sinker' ? -0.9 : kind === 'fork' ? 1.3 : kind === 'rise' ? -1.3 : 0.3;
      this.cap.rotation.set(Math.PI / 2 - 0.25 + Math.sin(this.capSpin * 0.07) * 0.2, 0, tilt * 0.5);
      this.cap.rotateY(this.capSpin);
      this.capShadow.position.set(this.cap.position.x, 0.012, this.cap.position.z);
      const hgt = Math.max(0, this.cap.position.y);
      this.capShadow.scale.setScalar(1 + hgt * 0.08);
      (this.capShadow.material as THREE.MeshBasicMaterial).opacity = 0.38 / (1 + hgt * 0.25);
      if (this.phase === 'flight' || (this.phase === 'play' && this.live?.mode !== 'held')) this.trail.push(this.cap.position);
      const camDir = this.engine.camera.getWorldDirection(new THREE.Vector3());
      this.trail.update(camDir, CAP_VIS_R * 0.8, dt);
    } else this.trail.update(new THREE.Vector3(0, 0, 1), 0.05, dt);

    for (const c of this.chars.values()) if (c.root.visible) c.update(dt);
    // 投球カメラでは捕手を半透明にしてゾーンを見やすくする
    const catcher = this.fielders.find((f) => f.pos === 'C');
    if (catcher) catcher.char.root.visible = !(this.camMode === 'pitch' && this.phase !== 'play');
    this.updateCamera(dt);
  }

  private updateFlight(dt: number) {
    const s = this.state;
    const path = this.path!;
    this.flightT += dt;
    path.pos(this.flightT, this.cap.position);
    // 捕手のミットを投球の到達点へ
    const cc = this.fielders.find((f) => f.pos === 'C')!.char;
    const end = path.pos(path.duration + 0.08);
    const local = cc.root.worldToLocal(end.clone());
    cc.setPose({ handL: local.clone().add(V(0.02, 0, 0)), handR: local.clone().add(V(-0.12, -0.06, -0.05)) }, 0.85);

    // CPU のスイング
    if (this.cpuSwing && this.swingAt < 0 && this.cpuSwing.swing && this.flightT >= this.cpuSwing.at) {
      this.startSwing(this.cpuSwing.cursor, this.cpuSwing.mode);
    }
    // ミートの瞬間
    if (this.swingAt >= 0 && !this.contactDone && this.flightT >= this.swingAt + SWING_LEAD) {
      this.contactDone = true;
      const timing = this.swingAt + SWING_LEAD - path.duration;
      const r = resolveContact({
        batter: s.batter,
        mode: this.swingMode,
        cursor: this.swingCursor,
        timing,
        ball: new THREE.Vector2(path.plate.x, path.plate.y),
        speedKmh: path.params.speedKmh,
        assist: this.userBatting ? this.opts.difficulty.assist : 1,
      });
      if (r.kind === 'hit') {
        if (r.quality > 0.86 && this.swingMode !== 'bunt') this.hud.telop('ジャストミート！', 'small good', '', 800);
        this.onContact(r.velocity, r.quality, r.launchDeg);
        return;
      }
      if (r.kind === 'foulTip') {
        audio.play('hit_light', { volume: 0.5, rate: 1.4 });
        this.endPitch(s.strikes < 2 ? 'foul' : 'foul');
        return;
      }
    }
    // 本塁通過
    if (this.flightT >= path.duration && !this.markShown) {
      this.markShown = true;
      this.hud.showMark(new THREE.Vector2(path.plate.x, path.plate.y));
    }
    if (this.flightT >= path.duration + 0.08 && this.phase === 'flight') {
      // 捕球
      audio.play(path.params.speedKmh > 140 ? 'catch_fast' : 'catch', { volume: 0.8 });
      this.cap.visible = false;
      this.capShadow.visible = false;
      const swung = this.swingAt >= 0;
      const strike = swung || inZone(path.plate.x, path.plate.y, CAP_VIS_R * 0.5);
      this.endPitch(strike ? 'strike' : 'ball', swung);
    }
  }
  private markShown = false;

  private async endPitch(kind: 'strike' | 'ball' | 'foul', swung = false) {
    const s = this.state;
    this.phase = 'between';
    this.markShown = false;
    this.cleanupControls();
    let outcome: PitchOutcome = kind;
    if (kind === 'strike') {
      s.strikes++;
      if (s.strikes >= 3) {
        s.outs++;
        s.line(s.batter).so++;
        s.line(s.batter).ab++;
        outcome = 'strikeout';
        this.hud.telop(swung ? '空振り三振！' : '見逃し三振！', 'out');
        audio.play(this.userBatting ? 'sad' : 'shakin', { volume: 0.7 });
      } else this.hud.telop(swung ? '空振り' : 'ストライク', '', '', 800);
    } else if (kind === 'ball') {
      s.balls++;
      if (s.balls >= 4) {
        outcome = 'walk';
        this.hud.telop('フォアボール', 'bad');
        const runs = s.walk();
        if (runs) {
          this.hud.telop('押し出し！', 'big', `${runs}点`);
          audio.play('cheer', { volume: 0.5 });
        }
      } else this.hud.telop('ボール', 'bad', '', 800);
    } else if (kind === 'foul') {
      if (s.strikes < 2) s.strikes++;
      this.hud.telop('ファウル', 'bad', '', 800);
    }
    this.hud.updateBoard(s, this.opts.user === 'away');
    await this.sleep(outcome === 'strikeout' || outcome === 'walk' ? 1.3 : 0.75);
    this.hud.showMark(null);
    this.resolvePitch(outcome);
  }

  private resolvePitch(o: PitchOutcome) {
    const r = this.pitchResolve;
    this.pitchResolve = null;
    r?.(o);
  }

  // ---------------------------------------------------------------------
  /** 打った！ */
  private onContact(vel: THREE.Vector3, quality: number, launch: number) {
    const s = this.state;
    const big = quality > 0.75 && vel.length() > 20;
    audio.play(big ? 'hit_hard' : 'hit_light', { volume: 0.9 });
    if (big) {
      this.hud.flash();
      this.hitStop = 0.09;
    }
    this.hud.showZone(false);
    this.hud.showMark(null);
    this.cleanupControls();
    const start = this.path!.pos(this.flightT).clone();
    start.z = Math.min(start.z, 0.2);
    start.y = Math.max(start.y, 0.25);
    const ball = new BallSim(start, vel, 0.5 + (1 - quality) * 0.8, Math.random() * 6);
    // 打者走者と塁上の走者
    const batter = s.batter;
    const runners: Runner[] = [];
    const sp = (p: Player) => RUNNER_SPEED(p.speed);
    runners.push({ player: batter, char: this.char(batter), from: 0, to: 1, d: 0, state: 'run', isBatter: true, speed: sp(batter), forced: true, startDelay: 0.3 });
    s.bases.forEach((p, i) => {
      if (!p) return;
      const c = this.char(p);
      c.setPose(null);
      runners.push({ player: p, char: c, from: i + 1, to: i + 2, d: 0.6, state: 'hold', isBatter: false, speed: sp(p), forced: false, startDelay: 0 });
    });
    const bc = this.char(batter);
    this.sleep(0.25).then(() => {
      bc.setPose(null);
      bc.batHolder.visible = false;
    });
    s.line(batter).ab++;
    this.live = new LivePlay(s, this.fielders, runners, ball, (e) => this.onPlayEvent(e));
    for (const f of this.fielders) f.char.setPose(null);
    this.phase = 'play';
    this.camMode = 'follow';
    this.camPos.copy(this.engine.camera.position);
    this.cap.visible = true;
    void launch;
    this.watchPlay();
  }

  private onPlayEvent(e: PlayEvent) {
    switch (e.type) {
      case 'bounce':
        if (e.strong) audio.play('bounce', { volume: 0.4 });
        break;
      case 'fence':
        audio.play('bounce', { volume: 0.8, rate: 0.7 });
        break;
      case 'flyCatch':
      case 'field':
        audio.play('catch', { volume: 0.7 });
        break;
      case 'throw':
        audio.play('throw', { volume: 0.5 });
        break;
      case 'out':
        this.hud.telop('アウト', 'out', e.how === 'fly' ? '' : '', 900);
        this.hud.updateBoard(this.state, this.opts.user === 'away');
        break;
      case 'score':
        audio.play('cheer', { volume: 0.5 });
        break;
      case 'homerun':
        audio.play('cheer_big', { volume: 0.9 });
        this.hud.flash();
        break;
      case 'error':
        this.hud.telop('エラー！', 'bad', '', 900);
        break;
      default:
        break;
    }
  }

  private async watchPlay() {
    const s = this.state;
    const live = this.live!;
    while (!live.done && !this.quit) await this.sleep(0.05);
    if (this.quit) return;
    const r = live.result;
    const batter = s.batter;
    const line = s.line(batter);
    let telop = '', cls = '', sub = '';
    // 塁と得点の反映
    if (r.kind === 'foul') {
      line.ab--;
      await this.sleep(0.5);
      this.hud.fade(true);
      await this.sleep(0.3);
      this.live = null;
      this.resetPositions();
      this.hud.fade(false);
      this.phase = 'between';
      this.endPitchFoulAfterPlay();
      return;
    }
    if (r.kind === 'homerun') {
      const runs = 1 + s.bases.filter(Boolean).length;
      s.addRuns(runs);
      line.h++;
      line.hr++;
      line.rbi += runs;
      s.batting.hits++;
      s.bases = [null, null, null];
      telop = 'ホームラン！！';
      cls = 'hr';
      sub = runs === 4 ? '満塁ホームラン' : runs > 1 ? `${runs}ラン` : 'ソロ';
      this.camMode = 'wide';
      await this.sleep(2.6);
    } else if (r.kind === 'groundRuleDouble') {
      let runs = 0;
      const nb: (Player | null)[] = [null, batter, null];
      if (s.bases[2]) runs++;
      if (s.bases[1]) runs++;
      if (s.bases[0]) nb[2] = s.bases[0];
      s.addRuns(runs);
      s.bases = nb;
      line.h++;
      line.rbi += runs;
      s.batting.hits++;
      telop = 'エンタイトル';
      cls = 'big';
      sub = 'ツーベース';
      await this.sleep(1.2);
    } else {
      const nb: (Player | null)[] = [null, null, null];
      for (const rn of live.runners) if (rn.state === 'safe' && rn.from >= 1 && rn.from <= 3) nb[rn.from - 1] = rn.player;
      s.bases = nb;
      s.addRuns(r.runs);
      if (r.hitType) {
        line.h++;
        s.batting.hits++;
        line.rbi += r.runs;
        telop = { single: 'ヒット！', double: 'ツーベース！', triple: 'スリーベース！', homerun: 'ランニングホームラン！！' }[r.hitType];
        cls = r.hitType === 'single' ? 'big' : 'big';
        if (r.hitType === 'homerun') { cls = 'hr'; line.hr++; }
        if (r.runs) sub = `タイムリー ${r.runs}点`;
        audio.play('cheer', { volume: 0.6 });
      } else if (r.error) {
        telop = 'エラー';
        cls = 'bad';
        s.fielding.errors++;
      } else if (r.outs >= 2) {
        telop = 'ゲッツー！';
        cls = 'out';
      } else if (r.outs === 1) {
        if (r.flyOut && r.runs) { telop = '犠牲フライ'; cls = 'big'; line.ab--; line.rbi += r.runs; }
        else if (!r.flyOut) telop = '';
      } else if (r.runs) {
        telop = '';
        sub = `${r.runs}点`;
      }
      await this.sleep(0.7);
    }
    if (telop || sub) this.hud.telop(telop || '得点！', cls, sub, 1600);
    this.hud.updateBoard(s, this.opts.user === 'away');
    if (s.walkOff()) {
      await this.sleep(0.4);
      this.live = null;
      this.resolvePitch('inplay');
      return;
    }
    await this.sleep(1.3);
    if (s.outs < 3) {
      this.hud.fade(true);
      await this.sleep(0.3);
    }
    this.live = null;
    this.phase = 'between';
    this.resolvePitch('inplay');
  }

  private endPitchFoulAfterPlay() {
    const s = this.state;
    if (s.strikes < 2) s.strikes++;
    this.hud.telop('ファウル', 'bad', '', 800);
    this.hud.updateBoard(s, this.opts.user === 'away');
    this.cap.visible = false;
    this.capShadow.visible = false;
    this.trail.clear();
    this.camMode = 'pitch';
    this.hud.showZone(true);
    // ファウルフライ捕球でアウトになっていたら
    this.resolvePitch(s.outs >= 3 ? 'inplay' : 'foul');
  }

  // ---------------------------------------------------------------------
  private updateCamera(dt: number) {
    const cam = this.engine.camera;
    if (this.camMode === 'pitch') {
      const q = PITCH_CAM;
      this.engine.plateHalfWidth = q[6];
      this.engine.plateDist = q[2];
      this.engine.fixedVFov = null;
      this.engine.fitFov();
      const pos = V(q[0], q[1], q[2]);
      const look = V(q[3], q[4], q[5]);
      cam.position.copy(pos);
      cam.lookAt(look);
      this.camPos.copy(pos);
      this.camLook.copy(look);
      // ゾーンを画面へ投影
      const p0 = V(ZONE.x0, ZONE.y1, 0).project(cam);
      const p1 = V(ZONE.x1, ZONE.y0, 0).project(cam);
      const w = window.innerWidth, h = window.innerHeight;
      this.hud.setZone({ x0: ((p0.x + 1) / 2) * w, y0: ((1 - p0.y) / 2) * h, x1: ((p1.x + 1) / 2) * w, y1: ((1 - p1.y) / 2) * h });
    } else {
      // 打球を追う中継カメラ：本塁後方の高い位置から、遠くへ飛ぶほど望遠にする
      const b = this.cap.position;
      const dist = Math.hypot(b.x, b.z);
      const portrait = this.engine.camera.aspect < 1;
      let pos: THREE.Vector3, look: THREE.Vector3, fov: number;
      if (this.camMode === 'wide') {
        pos = V(b.x * 0.2, 9, 14);
        look = V(b.x * 0.8, Math.min(b.y, 8) * 0.6 + 1, Math.max(b.z, -45));
        fov = portrait ? 58 : 40;
      } else {
        pos = V(b.x * 0.25, 5.5 + dist * 0.12, 11 - Math.min(dist, 30) * 0.08);
        look = V(b.x, Math.min(b.y, 7) * 0.75, b.z).lerp(V(0, 0, -14), 0.18);
        fov = THREE.MathUtils.clamp((portrait ? 66 : 46) - dist * (portrait ? 0.7 : 0.5), portrait ? 36 : 24, portrait ? 66 : 46);
      }
      this.engine.fixedVFov = THREE.MathUtils.lerp(this.engine.camera.fov, fov, 1 - Math.exp(-dt * 3));
      this.engine.fitFov();
      const k = 1 - Math.exp(-dt * 2.6);
      this.camPos.lerp(pos, k);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 6));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
    }
  }
}

export { BASES };
