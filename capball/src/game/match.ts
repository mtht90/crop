import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { audio } from '../core/audio';
import type { Engine } from '../render/engine';
import { Character, type ProcPose } from '../render/character';
import { makeCapBall, applyCapBrand, Trail, CAP_VIS_R } from '../render/cap';
import { DEFAULT_CAP, type CapBrand } from './caps';
import { pitchPose, PITCH_RELEASE_T, PITCH_TOTAL_T, stancePose, swingKeys, samplePose, mirrorPose, SWING_TOTAL_T } from '../render/motions';
import { Hud, PitchControl, BatControl, type ThrowInput } from '../ui/hud';
import { PITCHES, type Difficulty, type Player, type Team } from './data';
import { POSITIONS, ZONE, PASSBALL_Z } from './geom';
import { GameState, type Side } from './rules';
import { PitchPath } from './pitch';
import { cursorSize, inZone, resolveContact, SWING_LEAD, type SwingMode } from './batting';
import { BallSim } from './flight';
import { Judge, FIELDER_SPEED, HIT_BASES, type Fielder, type JudgeEvent, type JudgeKind } from './judge';
import { cpuChoosePitch, cpuPlanSwing } from './ai';

export interface MatchOptions {
  away: Team;
  home: Team;
  user: 'away' | 'home';
  innings: number;
  difficulty: Difficulty;
  /** CPU 同士で進める（デモ・確認用） */
  autoplay?: boolean;
  /** 打撃時の着弾予測マーカー */
  predict?: boolean;
  /** 各チームが使うキャップ。投げるのは守備側のキャップ */
  caps?: { away: CapBrand; home: CapBrand };
}

type PitchOutcome = 'ball' | 'strike' | 'foul' | 'inplay' | 'strikeout' | 'walk';

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
  private live: Judge | null = null;
  private camMode: 'pitch' | 'fps' | 'follow' | 'wide' = 'pitch';
  /** 投手目線で手に持っているキャップ */
  private handCap: THREE.Object3D;
  private handRot = new THREE.Euler();
  private throwAnimT = -1;
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
        if (assets.bat) c.attachBat(assets.bat.scene);
        c.root.visible = false;
        scene.add(c.root);
        this.chars.set(p, c);
      }
    }
    this.cap = makeCapBall();
    this.cap.visible = false;
    scene.add(this.cap);
    // 手元のキャップ（カメラに付ける）。天面をこちらに向ける
    this.handCap = new THREE.Group();
    const hc = makeCapBall();
    hc.rotation.x = Math.PI / 2;
    hc.scale.setScalar(1.9);
    this.handCap.add(hc);
    this.handCap.visible = false;
    if (!engine.camera.parent) scene.add(engine.camera);
    engine.camera.add(this.handCap);
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
    this.engine.camera.remove(this.handCap);
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
    // 守備は投手・捕手・内野手2人（指名打者は守らない）
    this.fielders = fteam.players.filter((pl) => pl.pos !== 'DH').map((pl) => {
      const p = pl.pos === 'P' ? s.fielding.pitcher : pl;
      const pos = pl.pos as keyof typeof POSITIONS;
      return { pos: pl.pos, player: p, char: this.char(p), home: POSITIONS[pos].clone(), target: null, busy: 0, speed: FIELDER_SPEED(p.speed) };
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
    // 打撃側：走者は仮想なので、打者だけを置く
    for (const p of [...s.batting.team.players, ...s.batting.team.bench]) this.char(p).root.visible = false;
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
    this.hud.showMitt(null);
    this.hud.showPredict(null);
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
    this.passBallT = -1;
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
    // 投げるのは守備側のキャップ
    applyCapBrand(this.cap, this.fieldingCap);
    applyCapBrand(this.handCap, this.fieldingCap);
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
      // CPU 投手。捕手が構えた位置（狙い）を見せる
      const cp = cpuChoosePitch(s, pitcher, this.opts.difficulty);
      if (this.opts.predict) this.sleep(0.35).then(() => {
        if (this.phase === 'aim') this.hud.showMitt(cp.aim);
      });
      this.sleep(1.1 + Math.random() * 0.7).then(() => {
        if (this.phase === 'aim') this.beginWindup(cp);
      });
    } else {
      this.camMode = 'fps';
      this.throwAnimT = -1;
      this.handRot.set(0, 0, 0);
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
    // 自分で投げたときは、はじいた直後にリリースが来るよう投球動作の途中から始める
    // 投手目線では払った瞬間に手元からキャップを放つ
    this.windT = this.pitchCtl ? PITCH_RELEASE_T : 0;
    // 投手操作のときは、リリースまで判定の輪を出すので操作を残す
    if (!this.pitchCtl) this.hud.showAim(null);
  }

  /** リリース：投球パラメータを確定してキャップを放つ */
  private release() {
    const s = this.state;
    if (this.pitchCtl) {
      this.pendingThrow = this.pitchCtl.finalize();
      this.pitchCtl.dispose();
      this.pitchCtl = null;
    }
    const t = this.pendingThrow!;
    const pitcher = s.fielding.pitcher;
    const def = PITCHES[t.kind];
    const side = s.fielding;
    const fatigue = side.stamina;
    // 変化を大きくするほど球は遅く、制球は乱れやすい（小さくすると速く・狙いやすい）
    const str = t.kind === 'straight' ? 1 : THREE.MathUtils.clamp(t.strength ?? 1, 0.5, 1.7);
    const capB = this.fieldingCap;
    const velo = capB.speed * (pitcher.velo ?? 135) * def.speedMul * (0.86 + 0.14 * t.speedNorm) * (0.93 + 0.07 * fatigue);
    // 制球：能力・リングのタイミング・疲れ
    const ctrl = pitcher.control ?? 60;
    const cpu = !this.pitchCtlUser;
    let sigma = 0.025 + (1 - ctrl / 100) * 0.09;
    sigma *= 1 + t.timingErr * 3.2;
    sigma *= 1 + (1 - fatigue) * 1.4;
    if (cpu) sigma *= 1.6 - this.opts.difficulty.cpuControl;
    // 投手目線で自分が投げたときは、払った向きがそのまま狙いなので、ぶれはごく小さく
    if (this.camMode === 'fps') sigma = 0.006 + (1 - ctrl / 100) * 0.012;
    sigma /= capB.control;
    const target = new THREE.Vector3(t.aim.x + gauss() * sigma, t.aim.y + gauss() * sigma, 0);
    if (this.camMode === 'fps' && t.screenAim) {
      // 払った線の先（画面の点）を通る視線が本塁上の面と交わる点を狙いにする
      const cam = this.engine.camera;
      cam.updateMatrixWorld();
      const ndc = new THREE.Vector3((t.screenAim.x / window.innerWidth) * 2 - 1, -(t.screenAim.y / window.innerHeight) * 2 + 1, 0.5);
      const ray = ndc.unproject(cam).sub(cam.position).normalize();
      const k = (0 - cam.position.z) / Math.max(1e-3, ray.z);
      const hit = cam.position.clone().addScaledVector(ray, k);
      target.set(THREE.MathUtils.clamp(hit.x, -1.6, 1.6) + gauss() * sigma, THREE.MathUtils.clamp(hit.y, 0.05, 2.2) + gauss() * sigma, 0);
    }
    // スワイプの曲げ：球種の横変化と同じ向きなら変化が大きく、逆なら小さく
    const lat = Math.sign(def.bx);
    void lat;
    // 自分で投げた変化球は大きめに曲げる（キャップらしく）
    const breakMul = THREE.MathUtils.clamp(str, 0.4, 1.7) * (t.timingErr > 0.45 ? 0.6 : 1) * (this.camMode === 'fps' ? 1.35 : 1) * capB.brk;
    const extraBx = 0;
    const release = new THREE.Vector3();
    if (this.camMode === 'fps') {
      // 手元のキャップの位置から放つ
      this.handCap.updateMatrixWorld(true);
      this.handCap.getWorldPosition(release);
      this.handCap.visible = false;
    } else {
      this.char(pitcher).handWorld('r', release);
      release.y = Math.max(release.y, 0.9);
    }
    this.path = new PitchPath({ kind: t.kind, level: t.level, speedKmh: velo, release, target, breakMul, extraBx, side: t.side ?? -1, seed: Math.random(), aimIsLine: this.camMode === 'fps', compensate: 0 });
    this.lastSpeed = Math.round(velo);
    this.lastPitchName = def.name;

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

  /** 守備側（投げる側）のキャップ */
  private get fieldingCap(): CapBrand {
    const c = this.opts.caps;
    if (!c) return DEFAULT_CAP;
    return this.state.half === 'top' ? c.home : c.away;
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
      if (this.windT > 0.15 && this.camMode !== 'fps') {
        this.cap.visible = true;
        pc.handWorld('r', this.cap.position);
      }
      this.pitchCtl?.windup(this.windT, PITCH_RELEASE_T);
      if (this.windT >= PITCH_RELEASE_T) this.release();
    } else if (this.phase === 'flight' && this.path) {
      this.windT += dt;
      pc.setPose(pitchPose(Math.min(this.windT, PITCH_TOTAL_T)), this.windT > PITCH_TOTAL_T + 0.2 ? 0 : 1);
      this.updateFlight(dt);
    } else if (this.passBallT >= 0) {
      // パスボール：キャップが捕手の後ろへ転がってパスボールラインを割る
      this.passBallT += dt;
      const k = Math.min(1, this.passBallT / 0.9);
      const e = 1 - (1 - k) * (1 - k);
      this.cap.position.set(this.passBallFrom.x * (1 + e * 0.6), Math.max(0.05, this.passBallFrom.y * (1 - e)), this.passBallFrom.z + (PASSBALL_Z + 1.2 - this.passBallFrom.z) * e);
      if (this.passBallT > 1.3) {
        this.passBallT = -1;
        this.cap.visible = false;
        this.capShadow.visible = false;
      }
    }
    if (this.phase === 'play' && this.live) {
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
      // 球種ごとの面の傾き（握りの説明どおり）。ナックルは立てて回転させない
      const kind = this.path?.params.kind;
      const tilt = kind ? PITCHES[kind].tilt : 0.3;
      this.cap.rotation.set(Math.PI / 2 - 0.25 + Math.sin(this.capSpin * 0.07) * 0.2, 0, tilt);
      if (kind !== 'knuckle' || this.phase !== 'flight') this.cap.rotateY(this.capSpin);
      else this.cap.rotateX(Math.sin(this.time * 17) * 0.25);
      // 遠くのキャップは大きめに描いて見失わないようにする（プロスピのボールの見え方に近づける）
      const far = this.phase === 'flight' || this.phase === 'windup' ? THREE.MathUtils.clamp(-this.cap.position.z / 9.22, 0, 1) : 0;
      // 投手目線では遠ざかるほど大きめに、打者側から見るときは遠いほど大きめに
      this.cap.scale.setScalar(this.camMode === 'fps' ? 1 + (1 - far) * 0.6 : 1 + far * 1.4);
      this.capShadow.position.set(this.cap.position.x, 0.012, this.cap.position.z);
      const hgt = Math.max(0, this.cap.position.y);
      this.capShadow.scale.setScalar(1 + hgt * 0.08);
      (this.capShadow.material as THREE.MeshBasicMaterial).opacity = 0.38 / (1 + hgt * 0.25);
      if (this.phase === 'flight' || (this.phase === 'play' && !this.live?.holder)) this.trail.push(this.cap.position);
      const camDir = this.engine.camera.getWorldDirection(new THREE.Vector3());
      this.trail.update(camDir, CAP_VIS_R * 0.8, dt);
    } else this.trail.update(new THREE.Vector3(0, 0, 1), 0.05, dt);

    for (const c of this.chars.values()) if (c.root.visible) c.update(dt);
    // 投球カメラでは捕手を半透明にしてゾーンを見やすくする
    const catcher = this.fielders.find((f) => f.pos === 'C');
    if (catcher) catcher.char.root.visible = !(this.camMode === 'pitch' && this.phase !== 'play');
    // 投手目線では自分（投手）は映さない
    if (this.camMode === 'fps') pc.root.visible = false;
    else if (this.fielders.some((f) => f.player === pitcher)) pc.root.visible = true;
    this.updateHandCap(dt);
    if (catcher && this.camMode === 'fps' && this.phase === 'aim') catcher.char.setPose(this.crouchPose(), 1);
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
    cc.setPose(this.crouchPose(local), 0.9);

    // 着弾予測：今の向きと速さのまま来たら本塁上のどこを通るか（変化は最後に効くので読み切れるとは限らない）
    if (this.userBatting && this.opts.predict && !this.opts.autoplay) {
      const k = this.flightT / path.duration;
      if (k > 0.2 && k < 1) {
        const prev = path.pos(Math.max(0, this.flightT - 0.03));
        const cur = this.cap.position;
        const vz = cur.z - prev.z;
        if (vz > 1e-4) {
          const tt = -cur.z / vz;
          this.hud.showPredict(new THREE.Vector2(cur.x + (cur.x - prev.x) * tt, cur.y + (cur.y - prev.y) * tt), (k - 0.2) * 2.5);
        }
      } else if (k >= 1) this.hud.showPredict(null);
    }
    if (this.flightT > 0.12 && this.flightT / path.duration <= 0.2) this.hud.showMitt(null);

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
      if (this.userBatting && !this.opts.autoplay) this.swingFeedback(timing, path.plate.y - this.swingCursor.y, path.plate.x - this.swingCursor.x);
      if (r.kind === 'hit') {
        if (r.quality > 0.86 && this.swingMode !== 'bunt') this.hud.telop('ジャストミート！', 'small good', '', 800);
        this.onContact(r.velocity, r.quality);
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
      this.hud.showChip(`${PITCHES[path.params.kind].name}  ${Math.round(path.params.speedKmh)}km/h ・ ${this.fieldingCap.name}`);
      this.sleep(1.6).then(() => this.hud.showChip(null));
      this.hud.showMark(new THREE.Vector2(path.plate.x, path.plate.y));
    }
    if (this.flightT >= path.duration + 0.08 && this.phase === 'flight') {
      const swung = this.swingAt >= 0;
      const px = path.plate.x, py = path.plate.y;
      // 首・頭に当たればデッドボール
      const L = s.batter.bats === 'L';
      const hbp = !swung && (L ? px > 0.55 : px < -0.55) && py > 1.0 && py < 1.7;
      // 捕手が届かない投球・ナックルのこぼれ → パスボールラインを割る
      // パスボールはなし（捕手は必ず捕る）
      const passBall = false;
      if (passBall) {
        this.passBallT = 0;
        this.passBallFrom = this.cap.position.clone();
        audio.play('bounce', { volume: 0.6 });
      } else {
        audio.play(path.params.speedKmh > 88 ? 'catch_fast' : 'catch', { volume: 0.8 });
        this.cap.visible = false;
        this.capShadow.visible = false;
      }
      const strike = swung || inZone(px, py, CAP_VIS_R * 0.5);
      this.endPitch(hbp ? 'hbp' : strike ? 'strike' : 'ball', swung, passBall);
    }
  }
  private markShown = false;

  /** 振り返り：タイミングとカーソルのずれ（プロスピの打撃結果表示のように） */
  private swingFeedback(timing: number, dy: number, dx: number) {
    const ms = Math.round(Math.abs(timing) * 1000);
    const t = Math.abs(timing) < 0.025 ? '<span class="just">ジャスト</span>' : `<span class="off">${timing < 0 ? '早い' : '遅い'} ${ms}ms</span>`;
    const v = Math.abs(dy) < 0.05 ? '' : `<span class="off">${dy > 0 ? 'キャップが上' : 'キャップが下'}</span>`;
    const hz = Math.abs(dx) < 0.07 ? '' : `<span class="off">${dx > 0 ? '一塁側' : '三塁側'}にずれ</span>`;
    this.hud.showSwingFeedback(t + v + hz);
    this.sleep(1.6).then(() => this.hud.showSwingFeedback(null));
  }

  private passBallT = -1;
  private passBallFrom = new THREE.Vector3();

  private async endPitch(kind: 'strike' | 'ball' | 'foul' | 'hbp', swung = false, passBall = false) {
    const s = this.state;
    this.phase = 'between';
    this.markShown = false;
    this.cleanupControls();
    let outcome: PitchOutcome = kind === 'hbp' ? 'walk' : kind;
    const runnersOn = s.bases.some(Boolean);
    if (kind === 'hbp') {
      this.hud.telop('デッドボール', 'bad');
      const runs = s.walk();
      s.line(s.batter).bb--;
      if (runs) this.hud.telop('押し出し！', 'big', `${runs}点`);
    } else if (kind === 'strike' && passBall && s.strikes === 2) {
      // 振り逃げ：パスボールラインを割ったので打者だけが一塁へ
      s.strikes++;
      s.line(s.batter).so++;
      s.line(s.batter).ab++;
      outcome = 'walk';
      const runs = s.droppedThird();
      this.hud.telop('振り逃げ！', 'big', runs ? `押し出し ${runs}点` : 'パスボールラインを割った');
    } else if (kind === 'strike') {
      s.strikes++;
      if (s.strikes >= 3) {
        s.outs++;
        s.line(s.batter).so++;
        s.line(s.batter).ab++;
        outcome = 'strikeout';
        this.hud.telop(swung ? '空振り三振！' : '見逃し三振！', 'out');
        audio.play(this.userBatting ? 'sad' : 'shakin', { volume: 0.7 });
      } else this.hud.telop(swung ? '空振り' : 'ストライク', '', '', 800);
      if (s.strikes < 3 && passBall && runnersOn) this.applyPassBall();
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
      } else {
        this.hud.telop('ボール', 'bad', '', 800);
        // 4球目以外のパスボールは塁上の走者が1つ進む（4球目はボールデッド）
        if (passBall && runnersOn) this.applyPassBall();
      }
    } else if (kind === 'foul') {
      if (s.strikes < 2) s.strikes++;
      this.hud.telop('ファウル', 'bad', '', 800);
    }
    this.hud.updateBoard(s, this.opts.user === 'away');
    await this.sleep(outcome === 'strikeout' || outcome === 'walk' ? 1.3 : 0.75);
    this.hud.showMark(null);
    this.resolvePitch(outcome);
  }

  private applyPassBall() {
    const runs = this.state.passBall();
    this.hud.telop('パスボール！', 'big', runs ? `走者が進んで ${runs}点` : '走者がひとつ進む', 1200);
    if (runs) audio.play('cheer', { volume: 0.5 });
  }

  private resolvePitch(o: PitchOutcome) {
    const r = this.pitchResolve;
    this.pitchResolve = null;
    r?.(o);
  }

  // ---------------------------------------------------------------------
  /** 打った！ */
  private onContact(vel: THREE.Vector3, quality: number) {
    const s = this.state;
    const big = quality > 0.75 && vel.length() > 14;
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
    // 重いキャップほど打球が飛ぶ・軽いほど失速して揺れる
    const w = this.fieldingCap.weight;
    vel.multiplyScalar(1 + (w - 1) * 0.7);
    const ball = new BallSim(start, vel, (0.5 + (1 - quality) * 0.8) * (1 + (1 - w) * 1.5), Math.random() * 6);
    const bc = this.char(s.batter);
    this.sleep(0.45).then(() => {
      bc.setPose(null);
      bc.play('Idle');
    });
    for (const f of this.fielders) f.char.setPose(null);
    this.live = new Judge(ball, this.fielders, (e) => this.onJudgeEvent(e));
    this.phase = 'play';
    this.camMode = 'follow';
    this.camPos.copy(this.engine.camera.position);
    this.cap.visible = true;
    this.watchPlay();
  }

  private onJudgeEvent(e: JudgeEvent) {
    switch (e.type) {
      case 'bounce':
        if (e.strong) audio.play('bounce', { volume: 0.4 });
        break;
      case 'fence':
        audio.play('bounce', { volume: 0.8, rate: 0.7 });
        break;
      case 'catch':
        audio.play('catch', { volume: 0.7 });
        break;
      case 'decided':
        if (e.kind === 'homerun') {
          audio.play('cheer_big', { volume: 0.9 });
          this.hud.flash();
          this.camMode = 'wide';
        }
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
    const kind = live.kind as JudgeKind;
    const batter = s.batter;
    const line = s.line(batter);
    if (kind === 'foul') {
      this.hud.fade(true);
      await this.sleep(0.3);
      this.live = null;
      this.resetPositions();
      this.hud.fade(false);
      this.phase = 'between';
      if (s.strikes < 2) s.strikes++;
      this.hud.telop('ファウル', 'bad', '', 800);
      this.hud.updateBoard(s, this.opts.user === 'away');
      this.cap.visible = false;
      this.capShadow.visible = false;
      this.trail.clear();
      this.camMode = 'pitch';
      this.hud.showZone(true);
      this.resolvePitch('foul');
      return;
    }
    line.ab++;
    let telop = '', cls = 'big', sub = '';
    const bases = HIT_BASES[kind];
    if (bases) {
      const runs = s.hit(bases);
      telop = { 1: 'ヒット！', 2: 'ツーベース！', 3: 'スリーベース！', 4: 'ホームラン！！' }[bases]!;
      sub = { 1: 'ヒットゾーン到達', 2: 'バウンドしてフェンスに到達', 3: 'ノーバウンドでフェンス直撃', 4: 'ノーバウンドでフェンス越え' }[bases]!;
      if (bases === 4) {
        cls = 'hr';
        sub = runs === 4 ? '満塁ホームラン' : runs > 1 ? `${runs}ラン` : 'ソロ';
      } else if (runs) sub = `タイムリー ${runs}点`;
      audio.play(bases === 4 ? 'cheer_big' : 'cheer', { volume: 0.6 });
    } else {
      s.outs++;
      cls = 'out';
      telop = kind === 'flyOut' ? 'フライアウト' : 'アウト';
      sub = kind === 'flyOut' ? 'ノーバウンドで捕球' : 'アウトゾーンで止まった';
    }
    this.hud.telop(telop, cls, sub, 1700);
    this.hud.updateBoard(s, this.opts.user === 'away');
    await this.sleep(1.4);
    if (!s.walkOff() && s.outs < 3) {
      this.hud.fade(true);
      await this.sleep(0.3);
    }
    this.live = null;
    this.phase = 'between';
    this.resolvePitch('inplay');
  }

  /** 捕手のしゃがんだ構え（glove: キャラ座標のミット位置） */
  private crouchPose(glove = V(0.05, 0.55, 0.35)): ProcPose {
    return {
      hips: V(0, -0.12, -0.02),
      torso: V(0, 14, 0),
      footL: V(0.2, 0.105, 0.06),
      footR: V(-0.2, 0.105, 0.06),
      kneeL: V(0.5, 0, 1),
      kneeR: V(-0.5, 0, 1),
      handL: glove.clone().add(V(0.02, 0, 0)),
      handR: V(-0.12, 0.42, 0.22),
      head: new THREE.Vector2(0, -6),
    };
  }

  /** 手元のキャップ：つまんだ位置に寄り、回した向きに回る。投げると前へ飛んでいく */
  private updateHandCap(dt: number) {
    const show = this.camMode === 'fps' && (this.phase === 'aim' || (this.phase === 'windup' && this.throwAnimT >= 0));
    this.handCap.visible = show;
    if (!show) return;
    const st = this.pitchCtl?.state;
    // 画面の下から 1/4 あたりに来るよう、視野角から置く位置を決める
    const dist = 0.72;
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.engine.camera.fov / 2)) * dist;
    const base = new THREE.Vector3(0, -halfH * 0.55, -dist);
    this.handCap.children[0].scale.setScalar(halfH * 1.7);
    if (this.throwAnimT >= 0) {
      this.throwAnimT += dt;
      const k = Math.min(1, this.throwAnimT / 0.16);
      base.lerp(new THREE.Vector3(0.05, -halfH * 0.2, -1.8), k);
      this.handCap.scale.setScalar(1 - k * 0.5);
    } else if (st) {
      base.x += st.ox * halfH * 0.25;
      base.y -= st.oy * halfH * 0.2;
      this.handCap.scale.setScalar(st.holding ? 1.06 : 1);
    }
    this.handCap.position.copy(base);
    // 回転：横回転は画面の奥行き軸まわり、縦回転は横軸まわり
    const zs = st?.spinZ ?? 0, vs = st?.spinV ?? 0;
    this.handRot.z -= zs * dt * 10;
    this.handRot.x -= vs * dt * 10;
    this.handCap.rotation.set(this.handRot.x, 0, this.handRot.z);
  }

  // ---------------------------------------------------------------------
  private updateCamera(dt: number) {
    const cam = this.engine.camera;
    this.hud.mirrorX = this.camMode === 'fps';
    if (this.camMode === 'fps') {
      // 投手の目線（マウンドから本塁を見る）
      this.engine.plateHalfWidth = 1.45;
      this.engine.plateDist = 9.6;
      this.engine.fixedVFov = null;
      this.engine.fitFov();
      const pos = V(0, 1.5, POSITIONS.P.z + 0.3);
      const look = V(0, 0.3, 0);
      cam.position.copy(pos);
      cam.lookAt(look);
      this.camPos.copy(pos);
      this.camLook.copy(look);
      cam.updateMatrixWorld();
      const p0 = V(ZONE.x0, ZONE.y1, 0).project(cam);
      const p1 = V(ZONE.x1, ZONE.y0, 0).project(cam);
      const w = window.innerWidth, h = window.innerHeight;
      // 投手側から見ると左右が逆になるので、画面上の左右で並べ直す
      const xa = ((p0.x + 1) / 2) * w, xb = ((p1.x + 1) / 2) * w;
      this.hud.setZone({ x0: Math.min(xa, xb), y0: ((1 - p0.y) / 2) * h, x1: Math.max(xa, xb), y1: ((1 - p1.y) / 2) * h });
    } else if (this.camMode === 'pitch') {
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
        pos = V(b.x * 0.2, 6, 9);
        look = V(b.x * 0.8, Math.min(b.y, 6) * 0.6 + 0.6, Math.max(b.z, -22));
        fov = portrait ? 58 : 40;
      } else {
        pos = V(b.x * 0.3, 3.8 + dist * 0.18, 8 - Math.min(dist, 16) * 0.12);
        look = V(b.x, Math.min(b.y, 5) * 0.75, b.z).lerp(V(0, 0, -8), 0.2);
        fov = THREE.MathUtils.clamp((portrait ? 64 : 44) - dist * (portrait ? 1.3 : 0.9), portrait ? 40 : 26, portrait ? 64 : 44);
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

