import * as THREE from 'three';
import { heroModel, type HeroModel } from './assets';
import { HEROES, type Aim, type HeroDef, type SkillDef } from './heroes';
import { Stage, BEACON_POS, BEACON_RADIUS, SPAWNS, SPAWN_RADIUS, TEAM_COLORS } from './stage';
import { Fx } from './fx';
import { sfx } from './audio';
import type { Input } from './input';
import type { Hud } from './hud';

export const MATCH_TIME = 180;
const RESPAWN_TIME = 7;
const UNIT_RADIUS = 0.6;
const NEUTRAL = 0xd8dde8;

export type ModeId = 'dom' | 'tdm' | 'control' | 'clash';
export interface ModeDef { id: ModeId; name: string; desc: string; time: number; unit: string }
export const MODES: ModeDef[] = [
  { id: 'dom', name: 'ドミネーション', desc: '5つの拠点を奪い合う。3分後に多く持っていたチームの勝ち。', time: 180, unit: '拠点' },
  { id: 'tdm', name: 'デスマッチ', desc: '先に12回倒したチームの勝ち。3分で決着しなければ撃破数で判定。', time: 180, unit: 'KO' },
  { id: 'control', name: 'コントロール', desc: '中央の拠点を確保し続け、先に100%に達したチームの勝ち。', time: 240, unit: '%' },
  { id: 'clash', name: 'クラッシュ', desc: '復帰なしのラウンド戦。相手を全滅させると1本、3本先取。', time: 75, unit: 'ラウンド' },
];
const TDM_GOAL = 12;
const CLASH_GOAL = 3;
const CONTROL_SECONDS = 70; // 確保し続けて100%になるまでの秒数
export interface MatchOptions { mode: ModeDef; difficulty: Difficulty; ult: number }

export interface Difficulty { name: string; enemyMul: number; skillDelay: number }
export const DIFFICULTIES: Difficulty[] = [
  { name: 'やさしい', enemyMul: 0.8, skillDelay: 2.6 },
  { name: 'ふつう', enemyMul: 1.0, skillDelay: 1.4 },
  { name: 'つよい', enemyMul: 1.18, skillDelay: 0.7 },
];

const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
};
const dist2D = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

export class Unit {
  pos = new THREE.Vector3();
  yaw = 0;
  hp: number; maxHp: number;
  alive = true; respawn = 0;
  atkCd = 0; cds = [0, 0]; ult = 0;
  stun = 0; slow = 0; stealth = 0; invuln = 0; lock = 0; swing = 0;
  lastHit = 99;
  kills = 0; deaths = 0;
  moveDir = new THREE.Vector3();
  push = new THREE.Vector3();
  dashing: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number } | null = null;
  target: Unit | null = null;
  flash = 0;
  group = new THREE.Group();
  model: HeroModel;
  private buffs: { kind: 'atk' | 'speed' | 'def'; amount: number; t: number }[] = [];
  private loopName = ''; private loop: THREE.AnimationAction | null = null;
  private shot: THREE.AnimationAction | null = null; private shotT = 0;
  private attackIdx = 0;
  ultIdx = 0; // 選んだ必殺技
  ai = { goal: -1, path: [] as THREE.Vector3[], repath: 0, think: Math.random() * 0.5, retreat: false, skillDelay: 2 + Math.random() * 2, dest: new THREE.Vector3() };

  constructor(public def: HeroDef, public team: number, public isPlayer: boolean, public slot: number, public statMul: number) {
    this.maxHp = this.hp = Math.round(def.hp * 1.25 * statMul);
    this.model = heroModel(def);
    this.group.add(this.model.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team], transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
    this.group.add(ring);
    if (isPlayer) {
      const mark = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mark.rotation.x = Math.PI; mark.position.y = 3.5;
      this.group.add(mark);
    }
    this.setLoop(def.idle);
  }

  get name() { return this.def.name; }
  power() { return this.def.atk * this.statMul * (1 + this.buffSum('atk')); }
  speed() { return this.def.speed * (1 + this.buffSum('speed')) * (this.slow > 0 ? 0.55 : 1); }
  defense() { return Math.min(0.8, this.buffSum('def')); }
  private buffSum(kind: string) { let s = 0; for (const b of this.buffs) if (b.kind === kind) s += b.amount; return s; }
  buff(kind: 'atk' | 'speed' | 'def', amount: number, t: number) {
    this.buffs = this.buffs.filter((b) => b.kind !== kind);
    this.buffs.push({ kind, amount, t });
  }
  tickBuffs(dt: number) { this.buffs = this.buffs.filter((b) => (b.t -= dt) > 0); }
  clearStatus() { this.buffs = []; this.stun = this.slow = this.stealth = this.lock = this.swing = 0; this.dashing = null; this.push.set(0, 0, 0); }
  nextAttackAnim() { const a = this.def.attacks; return a[this.attackIdx++ % a.length]; }

  setLoop(name: string) {
    if (this.loopName === name) return;
    const clip = this.model.clips.get(name);
    if (!clip) return;
    const next = this.model.mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).play();
    if (this.loop) this.shot ? this.loop.stop() : next.crossFadeFrom(this.loop, 0.15, false);
    if (this.shot) next.setEffectiveWeight(0);
    this.loop = next; this.loopName = name;
  }

  /** 単発アニメを再生。fit を渡すとその秒数に収まるよう早回しする */
  playOnce(name: string, fit?: number, hold = false) {
    const clip = this.model.clips.get(name);
    if (!clip) return;
    const a = this.model.mixer.clipAction(clip);
    const scale = fit && clip.duration > fit ? clip.duration / fit : 1;
    if (this.shot && this.shot !== a) this.shot.stop();
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.timeScale = scale; a.setEffectiveWeight(1); a.play();
    this.loop?.setEffectiveWeight(0);
    this.shot = a; this.shotT = hold ? Infinity : clip.duration / scale - 0.12;
  }
  stopOnce() {
    if (!this.shot) return;
    this.shot.fadeOut(0.12);
    this.loop?.reset().setEffectiveWeight(1).fadeIn(0.12).play();
    this.shot = null;
  }

  updateVisual(dt: number, viewerTeam: number) {
    if (this.shot) { this.shotT -= dt; if (this.shotT <= 0) this.stopOnce(); }
    this.model.update(dt);
    this.group.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    // 敵の透明化は見えなくする（味方と自分はそのまま見える）
    if (this.alive) this.model.root.visible = !(this.stealth > 0 && this.team !== viewerTeam);
    const f = Math.max(0, this.flash - dt * 5);
    if (f !== this.flash || f > 0) {
      this.flash = f;
      for (const m of this.model.materials) (m as unknown as { emissive?: THREE.Color }).emissive?.setScalar(f * 0.6);
    }
  }
}

interface Beacon {
  label: string; pos: THREE.Vector3; value: number; owner: number; // value: +1=青が完全確保, -1=赤
  disc: THREE.Mesh; fill: THREE.Mesh; crystal: THREE.Mesh; beam: THREE.Mesh; light: THREE.PointLight;
}
interface Projectile {
  mesh: THREE.Mesh; pos: THREE.Vector3; dir: THREE.Vector3; owner: Unit; left: number; hit: Set<Unit>;
  speed: number; radius: number; dmg: number; pierce?: boolean; homing?: Unit;
  explode?: { radius: number; dmg: number }; color: number;
}
export interface ShootOpts {
  speed: number; range: number; radius: number; dmg: number; color: number;
  pierce?: boolean; homing?: Unit; explode?: { radius: number; dmg: number };
}
export interface MatchResult { winner: number; scores: [number, number]; unit: string; units: Unit[] }

export class Match {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.5, 200);
  stage = new Stage();
  fx = new Fx();
  units: Unit[] = [];
  beacons: Beacon[] = [];
  player: Unit;
  timeLeft = MATCH_TIME;
  overtime = false;
  state: 'intro' | 'play' | 'over' = 'intro';
  intro = 3.6;
  camYaw = Math.PI / 2;
  camPitch = 0.6;  // 見下ろし角(rad)。上下ドラッグで調整できる
  camZoom = 1;     // ホイールで調整
  result: MatchResult | null = null;
  private projectiles: Projectile[] = [];
  private timers: { t: number; fn: () => void; owner: Unit | null }[] = [];
  private caster: Unit | null = null;
  private shakeAmt = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private lastTick = 99;
  private endT = 0;
  mode: ModeDef;
  difficulty: Difficulty;
  teamKills: [number, number] = [0, 0];
  controlPct: [number, number] = [0, 0];
  rounds: [number, number] = [0, 0];
  round = 1;
  private pendingRound = false;
  /** プレイヤーが照準を合わせている敵（いなければ null） */
  aimLock: Unit | null = null;
  private aimLine: THREE.Mesh;

  constructor(playerHero: HeroDef, opts: MatchOptions, private input: Input, private hud: Hud, private onEnd: (r: MatchResult) => void) {
    const s = this.scene;
    const difficulty = this.difficulty = opts.difficulty;
    this.mode = opts.mode;
    this.timeLeft = opts.mode.time;
    s.background = new THREE.Color(0x070a1c);
    s.fog = new THREE.Fog(0x070a1c, 60, 140);
    s.add(new THREE.HemisphereLight(0xcfdcff, 0x3a3048, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
    sun.position.set(-18, 34, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 28, bottom: -28, near: 1, far: 90 });
    sun.shadow.bias = -0.0015;
    s.add(sun, this.stage.group, this.fx.group);

    // チーム編成: プレイヤー以外は重複なしでランダム
    const pool = HEROES.filter((h) => h !== playerHero).sort(() => Math.random() - 0.5);
    const blue = [playerHero, pool[0], pool[1]];
    const red = pool.slice(2); // 各ヒーローは1体ずつ。残りの3人が敵チームになる
    [blue, red].forEach((list, team) => list.forEach((def, i) => {
      const u = new Unit(def, team, team === 0 && i === 0, i, team === 1 ? difficulty.enemyMul : 1);
      u.ultIdx = u.isPlayer ? opts.ult : Math.floor(Math.random() * 2);
      this.placeAtSpawn(u);
      u.model.settle();
      this.units.push(u);
      s.add(u.group);
    }));
    this.player = this.units[0];

    // 照準の補助線（足元から前方へ）
    this.aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.aimLine.position.y = 0.11;
    s.add(this.aimLine);

    const beaconIdx = this.mode.id === 'dom' ? [0, 1, 2, 3, 4] : this.mode.id === 'control' ? [2] : [];
    beaconIdx.forEach((bi) => {
      const pos = BEACON_POS[bi];
      const flatMat = (o: number) => new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: o, depthWrite: false });
      const disc = new THREE.Mesh(new THREE.RingGeometry(BEACON_RADIUS - 0.18, BEACON_RADIUS, 56), flatMat(0.9));
      const fill = new THREE.Mesh(new THREE.CircleGeometry(BEACON_RADIUS - 0.18, 56), flatMat(0.35));
      for (const m of [disc, fill]) { m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.09, pos.z); s.add(m); }
      fill.position.y = 0.08;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), new THREE.MeshToonMaterial({ color: NEUTRAL, emissive: NEUTRAL, emissiveIntensity: 0.5 }));
      crystal.position.set(pos.x, 3.6, pos.z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 26, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.set(pos.x, 13, pos.z);
      const light = new THREE.PointLight(NEUTRAL, 14, 13, 1.6);
      light.position.set(pos.x, 2.6, pos.z);
      s.add(crystal, beam, light);
      this.beacons.push({ label: 'ABCDE'[bi], pos, value: 0, owner: -1, disc, fill, crystal, beam, light });
    });

    this.updateCamera(1, true);
    hud.setup(this);
  }

  // ---------- スキル用ヘルパー ----------
  enemiesOf(u: Unit) { return this.units.filter((o) => o.team !== u.team); }
  alliesOf(u: Unit) { return this.units.filter((o) => o.team === u.team); }
  after(t: number, fn: () => void) { this.timers.push({ t, fn, owner: this.caster }); }
  shake(a: number) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  /** 範囲内の敵を中心へ引き寄せる */
  pull(src: Unit, center: THREE.Vector3, r: number, strength: number) {
    for (const e of this.enemiesOf(src)) {
      if (!e.alive || e.invuln > 0) continue;
      const d = center.clone().sub(e.pos).setY(0), len = d.length();
      if (len > r || len < 0.6) continue;
      e.push.addScaledVector(d.normalize(), Math.min(strength, len) * 5);
    }
  }

  damage(target: Unit, amount: number, src: Unit) {
    if (!target.alive || target.invuln > 0 || this.state === 'over') return;
    // クラッシュは復帰がないぶん、1ラウンドが一瞬で終わらないようダメージを抑える
    const dmg = Math.max(1, Math.round(amount * (1 - target.defense()) * (this.mode.id === 'clash' ? 0.5 : 1)));
    target.hp -= dmg;
    target.lastHit = 0; target.flash = 1;
    src.lastHit = Math.min(src.lastHit, 3);
    src.ult = Math.min(1, src.ult + dmg / 3000);
    target.ult = Math.min(1, target.ult + dmg / 6000);
    this.hud.floatText(target.pos, `${dmg}`, target.isPlayer ? 'hurt' : src.isPlayer ? 'deal' : 'other');
    if (target.isPlayer || src.isPlayer) sfx.hit();
    if (target.isPlayer) this.shake(0.2);
    if (target.hp <= 0) this.kill(target, src);
  }

  private kill(u: Unit, by: Unit) {
    u.hp = 0; u.alive = false; u.respawn = RESPAWN_TIME; u.deaths++; by.kills++; this.teamKills[by.team]++;
    u.clearStatus(); u.target = null;
    u.playOnce('Death01', undefined, true);
    this.fx.burst(u.pos.clone().setY(1), TEAM_COLORS[u.team], 14, 6);
    this.hud.feed(by, u);
    if (u.isPlayer || by.isPlayer) sfx.down();
    by.ult = Math.min(1, by.ult + 0.12);
  }

  heal(u: Unit, amount: number) {
    if (!u.alive || u.hp >= u.maxHp) return;
    const v = Math.round(Math.min(amount, u.maxHp - u.hp));
    u.hp += v;
    if (v >= 20) this.hud.floatText(u.pos, `+${v}`, 'heal');
  }
  healAllies(src: Unit, center: THREE.Vector3, r: number, frac: number) {
    for (const a of this.alliesOf(src)) if (a.alive && dist2D(a.pos, center) <= r) { this.heal(a, a.maxHp * frac); this.fx.ring(a.pos, 1.4, 0x7dffb0, 0.5); }
  }

  aoe(src: Unit, center: THREE.Vector3, r: number, dmg: number, o: { stun?: number; slow?: number; knock?: number }) {
    let n = 0;
    for (const e of this.enemiesOf(src)) {
      if (!e.alive || e.invuln > 0 || dist2D(e.pos, center) > r + UNIT_RADIUS) continue;
      n++;
      if (o.stun) e.stun = Math.max(e.stun, o.stun);
      if (o.slow) e.slow = Math.max(e.slow, o.slow);
      if (o.knock) {
        const d = e.pos.clone().sub(center).setY(0);
        if (d.lengthSq() < 0.01) d.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        e.push.addScaledVector(d.normalize(), o.knock * 5);
      }
      this.damage(e, dmg, src);
    }
    if (dmg > 150 && dist2D(center, this.player.pos) < 22) sfx.boom();
    return n;
  }

  lineHit(src: Unit, a: THREE.Vector3, b: THREE.Vector3, width: number, dmg: number) {
    const ab = b.clone().sub(a), len2 = Math.max(1e-4, ab.lengthSq());
    for (const e of this.enemiesOf(src)) {
      if (!e.alive) continue;
      const t = Math.max(0, Math.min(1, e.pos.clone().sub(a).dot(ab) / len2));
      if (dist2D(e.pos, a.clone().addScaledVector(ab, t)) < width) { this.fx.slash(e.pos, src.yaw, 2, 0xffffff); this.damage(e, dmg, src); }
    }
  }

  dash(u: Unit, to: THREE.Vector3, dur: number) {
    const dir = to.clone().sub(u.pos).setY(0);
    const len = dir.length();
    if (len < 0.05) return;
    dir.normalize();
    let ok = 0;
    for (let d = 0.5; d <= len; d += 0.5) {
      if (this.stage.hitsObstacle(u.pos.x + dir.x * d, u.pos.z + dir.z * d, UNIT_RADIUS)) break;
      ok = d;
    }
    u.dashing = { from: u.pos.clone(), to: u.pos.clone().addScaledVector(dir, ok), t: 0, dur };
  }

  shoot(u: Unit, dir: THREE.Vector3, o: ShootOpts) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.22, o.radius * 0.6), 10, 8),
      new THREE.MeshBasicMaterial({ color: o.color }));
    const pos = u.pos.clone().addScaledVector(dir, 0.8); pos.y = 1.3;
    mesh.position.copy(pos);
    const glow = new THREE.PointLight(o.color, 6, 6);
    mesh.add(glow);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, pos, dir: dir.clone().setY(0).normalize(), owner: u, left: o.range, hit: new Set(), ...o });
    if (dist2D(u.pos, this.player.pos) < 20) sfx.shoot();
  }

  zone(p: THREE.Vector3, r: number, dur: number, color: number, interval: number, tick: () => void) {
    this.fx.zone(p, r, dur, color);
    for (let t = interval; t <= dur; t += interval) this.after(t, tick);
  }

  // ---------- 進行 ----------
  private placeAtSpawn(u: Unit) {
    const sp = SPAWNS[u.team];
    u.pos.set(sp.x, 0, sp.z + (u.slot - 1) * 2.4);
    u.yaw = u.team === 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  /** 視点の向き（照準）に一番近い敵。近いほど判定は甘く、近接は広い扇形で拾う */
  private aimedTarget(u: Unit, range: number, cone: number): Unit | null {
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    let best: Unit | null = null, bestScore = Infinity;
    for (const e of this.enemiesOf(u)) {
      if (!e.alive || e.stealth > 0) continue;
      const dx = e.pos.x - u.pos.x, dz = e.pos.z - u.pos.z, d = Math.hypot(dx, dz);
      if (d > range + UNIT_RADIUS) continue;
      const ang = d < 0.01 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (ang > cone + 1.3 / Math.max(1, d) && d > 2.2) continue;
      if (u.def.ranged && this.stage.blockedLine(u.pos, e.pos)) continue;
      const score = ang + d * 0.01;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  private aimFor(u: Unit): Aim {
    let target: Unit | null = null;
    if (u.isPlayer) {
      target = this.aimedTarget(u, 17, 0.3);
    } else {
      let best = 17;
      for (const e of this.enemiesOf(u)) {
        if (!e.alive || e.stealth > 0) continue;
        const d = dist2D(e.pos, u.pos);
        if (d < best) { best = d; target = e; }
      }
    }
    const fwd = u.isPlayer ? new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)) : new THREE.Vector3(Math.sin(u.yaw), 0, Math.cos(u.yaw));
    const dir = target ? target.pos.clone().sub(u.pos).setY(0).normalize() : fwd;
    if (dir.lengthSq() < 0.5) dir.copy(fwd);
    return { dir, target, point: target ? target.pos.clone() : u.pos.clone().addScaledVector(dir, 6) };
  }

  skillOf(u: Unit, i: number): SkillDef { return i < 2 ? u.def.skills[i] : u.def.ults[u.ultIdx]; }
  skillReady(u: Unit, i: number) { return i < 2 ? u.cds[i] <= 0 : u.ult >= 1; }

  cast(u: Unit, i: number) {
    if (this.state !== 'play' || !u.alive || u.stun > 0 || u.lock > 0 || u.dashing || !this.skillReady(u, i)) return false;
    const s = this.skillOf(u, i);
    const aim = this.aimFor(u);
    if (i < 2) u.cds[i] = s.cd; else u.ult = 0;
    u.lock = s.lock; u.swing = 0; u.stealth = 0;
    u.yaw = Math.atan2(aim.dir.x, aim.dir.z);
    u.playOnce(s.anim, Math.max(0.5, s.lock + 0.25));
    const near = dist2D(u.pos, this.player.pos) < 24;
    if (i === 2) { this.hud.ultBanner(u, s.name); this.fx.pillar(u.pos, u.def.color, 1.2); if (near) sfx.ult(); }
    else if (near) sfx.skill();
    this.caster = u;
    s.cast(this, u, aim);
    this.caster = null;
    return true;
  }

  update(rawDt: number) {
    const dt = Math.min(0.05, rawDt);
    this.camYaw -= this.input.takeCamDelta() * 0.006;
    this.camPitch = Math.max(0.3, Math.min(1.15, this.camPitch + this.input.takeCamDeltaY() * 0.004));
    this.camZoom = Math.max(0.7, Math.min(1.6, this.camZoom * Math.exp(this.input.takeZoom() * 0.001)));

    if (this.intro > -1) {
      this.intro -= dt;
      if (this.pendingRound && this.intro <= 3.6) this.beginRound();
      this.hud.countdown(this.intro);
      if (this.intro <= 0.6 && this.state === 'intro') this.state = 'play';
    }
    if (this.state === 'play') this.step(dt);
    if (this.state === 'over') { this.endT -= dt; if (this.endT <= 0 && this.result) { const r = this.result; this.result = null; this.onEnd(r); } }

    for (const u of this.units) u.updateVisual(dt, this.player.team);
    this.fx.update(dt);
    this.stage.update(dt);
    this.updateBeaconVisuals(dt);
    this.updateCamera(dt, false);
    this.hud.update(this);
  }

  private step(dt: number) {
    // タイマー
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t > 0) continue;
      this.timers.splice(i, 1);
      if (t.owner && !t.owner.alive) continue;
      this.caster = t.owner; t.fn(); this.caster = null;
    }

    // 操作
    const p = this.player;
    const [ix, iy] = this.input.move();
    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    p.moveDir.copy(f).multiplyScalar(iy).addScaledVector(r, ix);
    for (let i = 0; i < 3; i++) if (this.input.takeSkill(i)) this.cast(p, i);
    for (const u of this.units) if (!u.isPlayer && u.alive) this.think(u, dt);

    for (const u of this.units) this.stepUnit(u, dt);

    // ユニット同士の押し合い
    for (let i = 0; i < this.units.length; i++) for (let j = i + 1; j < this.units.length; j++) {
      const a = this.units[i], b = this.units[j];
      if (!a.alive || !b.alive || a.dashing || b.dashing) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d >= 1.15 || d < 1e-4) continue;
      const k = (1.15 - d) / 2 / d;
      a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k;
    }

    this.stepProjectiles(dt);
    this.stepBeacons(dt);

    // 時間と勝敗
    this.timeLeft -= dt;
    if (!this.overtime && this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== this.lastTick) { this.lastTick = Math.ceil(this.timeLeft); if (this.lastTick > 0) sfx.tick(); }
    const sc = this.scores();
    const id = this.mode.id;
    if (id === 'clash') { this.stepClash(); return; }
    if (id === 'tdm' && Math.max(sc[0], sc[1]) >= TDM_GOAL || id === 'control' && Math.max(sc[0], sc[1]) >= 100) { this.finish(sc); return; }
    if (this.timeLeft <= 0) {
      if (sc[0] !== sc[1] || this.overtime && this.timeLeft <= -45) this.finish(sc);
      else if (!this.overtime) {
        this.overtime = true;
        this.hud.announce(id === 'tdm' ? '延長戦！ 次に倒した方の勝ち' : '延長戦！ 先にリードした方の勝ち', 'neutral');
      }
    }
  }

  /** 画面上部に出すスコア（モードごとに意味が違う） */
  scores(): [number, number] {
    switch (this.mode.id) {
      case 'tdm': return [...this.teamKills];
      case 'control': return [Math.min(100, Math.floor(this.controlPct[0])), Math.min(100, Math.floor(this.controlPct[1]))];
      case 'clash': return [...this.rounds];
      default: return [this.beacons.filter((b) => b.owner === 0).length, this.beacons.filter((b) => b.owner === 1).length];
    }
  }
  goalText() {
    switch (this.mode.id) {
      case 'tdm': return `${TDM_GOAL} KO 先取`;
      case 'control': return '100% で勝利';
      case 'clash': return `ROUND ${this.round}　${CLASH_GOAL}本先取`;
      default: return '';
    }
  }

  // クラッシュ: 復帰なし。全滅させるか、時間切れ時に残り体力が多い方が1本
  private stepClash() {
    const alive = [0, 1].map((t) => this.units.filter((u) => u.team === t && u.alive).length);
    let won = -1;
    if (!alive[0] || !alive[1]) won = alive[0] ? 0 : alive[1] ? 1 : -2;
    else if (this.timeLeft <= 0) {
      const hp = [0, 1].map((t) => this.units.filter((u) => u.team === t && u.alive).reduce((a, u) => a + u.hp / u.maxHp, 0));
      won = hp[0] > hp[1] ? 0 : hp[1] > hp[0] ? 1 : -2;
    }
    if (won === -1) return;
    if (won >= 0) this.rounds[won]++;
    if (Math.max(...this.rounds) >= CLASH_GOAL) { this.finish([...this.rounds]); return; }
    this.hud.announce(won === 0 ? 'ラウンド取得！' : won === 1 ? 'ラウンドを取られた…' : '引き分け', won === 0 ? 'blue' : won === 1 ? 'red' : 'neutral');
    won === 0 ? sfx.capture() : sfx.lost();
    this.state = 'intro'; this.intro = 3.6 + 2.2; this.pendingRound = true;
  }

  private beginRound() {
    this.pendingRound = false;
    this.round++;
    this.timeLeft = this.mode.time; this.lastTick = 99;
    this.timers = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    this.fx.clear();
    for (const u of this.units) {
      u.alive = true; u.hp = u.maxHp; u.respawn = 0; u.group.visible = true; u.invuln = 0;
      u.clearStatus(); u.cds = [0, 0]; u.atkCd = 0;
      this.placeAtSpawn(u);
      u.group.position.copy(u.pos); u.model.settle();
      u.stopOnce(); u.setLoop(u.def.idle);
      u.ai.path = []; u.ai.retreat = false;
    }
    this.camYaw = Math.PI / 2;
  }

  private finish(scores: [number, number]) {
    this.state = 'over';
    const winner = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : -1;
    this.result = { winner, scores, unit: this.mode.unit, units: this.units };
    this.endT = 3.2;
    this.hud.announce(winner === 0 ? 'VICTORY' : winner === 1 ? 'DEFEAT' : 'DRAW', winner === 0 ? 'blue big' : winner === 1 ? 'red big' : 'neutral big');
    winner === 0 ? sfx.win() : sfx.lose();
    for (const u of this.units) {
      if (!u.alive) continue;
      u.moveDir.set(0, 0, 0); u.setLoop(u.def.idle);
      if (u.team === winner) { u.setLoop('Dance_Loop'); u.stopOnce(); }
    }
  }

  private stepUnit(u: Unit, dt: number) {
    if (!u.alive) {
      u.respawn -= dt;
      u.group.visible = u.respawn > RESPAWN_TIME - 2.5;
      if (this.mode.id === 'clash') { u.respawn = Math.max(0.01, u.respawn); return; }
      if (u.respawn <= 0) {
        u.alive = true; u.hp = u.maxHp; u.invuln = 2.5; u.group.visible = true;
        this.placeAtSpawn(u);
        u.group.position.copy(u.pos); u.model.settle();
        u.stopOnce(); u.setLoop(u.def.idle);
        u.ai.path = []; u.ai.retreat = false;
        this.fx.ring(u.pos, 2.5, TEAM_COLORS[u.team], 0.6);
      }
      return;
    }
    u.atkCd -= dt; u.cds[0] -= dt; u.cds[1] -= dt;
    u.stun -= dt; u.slow -= dt; u.stealth -= dt; u.invuln -= dt; u.lock -= dt; u.swing -= dt;
    u.lastHit += dt;
    u.ult = Math.min(1, u.ult + dt / 55);
    u.tickBuffs(dt);

    // 自陣で回復 / 敵陣でダメージ / 非戦闘時の自然回復
    const home = dist2D(u.pos, SPAWNS[u.team]) < SPAWN_RADIUS;
    if (home && this.mode.id !== 'clash') u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.2 * dt);
    else if (u.lastHit > 6) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.025 * dt);
    if (this.mode.id !== 'clash' && dist2D(u.pos, SPAWNS[1 - u.team]) < SPAWN_RADIUS) {
      u.hp -= u.maxHp * 0.15 * dt; u.lastHit = 0;
      if (u.hp <= 0) { this.kill(u, this.units.find((o) => o.team !== u.team)!); return; }
    }

    // 移動
    if (u.dashing) {
      const d = u.dashing;
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      u.pos.lerpVectors(d.from, d.to, k);
      u.pos.y = 0;
      if (k >= 1) u.dashing = null;
    } else {
      const canMove = u.stun <= 0 && u.lock <= 0;
      const len = u.moveDir.length();
      if (canMove && len > 0.12) {
        const sp = u.speed() * (u.swing > 0 ? 0.45 : 1) * Math.min(1, len);
        u.pos.addScaledVector(u.moveDir, (sp / len) * dt);
        if (u.swing <= 0) u.yaw = angleLerp(u.yaw, Math.atan2(u.moveDir.x, u.moveDir.z), dt * 14);
        u.setLoop(u.def.run);
      } else {
        if (u.isPlayer && canMove && u.swing <= 0) u.yaw = angleLerp(u.yaw, this.camYaw, dt * 10);
        u.setLoop(u.def.idle);
      }
      if (u.push.lengthSq() > 0.01) { u.pos.addScaledVector(u.push, dt); u.push.multiplyScalar(Math.exp(-dt * 9)); }
    }
    this.stage.resolve(u.pos, UNIT_RADIUS);

    // 通常攻撃（射程内の一番近い敵を自動で攻撃）
    let target: Unit | null = null, best = u.def.range + UNIT_RADIUS;
    if (u.isPlayer) target = this.aimLock = this.aimedTarget(u, u.def.range, u.def.ranged ? 0.2 : 1.0);
    else for (const e of this.enemiesOf(u)) {
      if (!e.alive || e.stealth > 0) continue;
      const d = dist2D(e.pos, u.pos);
      if (d < best && !(u.def.ranged && this.stage.blockedLine(u.pos, e.pos))) { best = d; target = e; }
    }
    u.target = target;
    if (target && u.swing > 0) u.yaw = angleLerp(u.yaw, Math.atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z), dt * 18);
    if (target && u.atkCd <= 0 && u.stun <= 0 && u.lock <= 0 && !u.dashing) {
      u.atkCd = u.def.interval; u.swing = Math.min(0.5, u.def.interval * 0.6); u.stealth = 0;
      u.playOnce(u.nextAttackAnim(), u.def.interval * 0.95);
      const t = target;
      this.caster = u;
      this.after(u.def.ranged ? 0.22 : 0.26, () => {
        if (!t.alive) return;
        if (u.def.ranged) {
          const dir = t.pos.clone().sub(u.pos).setY(0).normalize();
          this.shoot(u, dir, { speed: 30, range: u.def.range + 6, radius: 0.5, dmg: u.power(), color: u.def.color, homing: t });
        } else if (dist2D(t.pos, u.pos) < u.def.range + 1.6) {
          this.fx.slash(u.pos, u.yaw, u.def.range + 0.4, u.def.color);
          this.damage(t, u.power(), u);
        }
      });
      this.caster = null;
    }
  }

  private stepProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.homing?.alive) p.dir.copy(p.homing.pos).sub(p.pos).setY(0).normalize();
      const stepLen = p.speed * dt;
      p.pos.addScaledVector(p.dir, stepLen);
      p.left -= stepLen;
      p.mesh.position.copy(p.pos);
      let dead = p.left <= 0 || this.stage.hitsObstacle(p.pos.x, p.pos.z, 0.1);
      if (!dead) for (const e of this.enemiesOf(p.owner)) {
        if (!e.alive || p.hit.has(e) || dist2D(e.pos, p.pos) > p.radius + UNIT_RADIUS) continue;
        p.hit.add(e);
        this.damage(e, p.dmg, p.owner);
        this.fx.flash(p.pos, 1.0, p.color);
        if (!p.pierce) { dead = true; break; }
      }
      if (!dead) continue;
      if (p.explode) {
        this.fx.ring(p.pos, p.explode.radius, p.color, 0.45); this.fx.flash(p.pos, p.explode.radius * 0.7, p.color, 0.3);
        this.fx.burst(p.pos, p.color, 12, 7);
        this.aoe(p.owner, p.pos, p.explode.radius, p.explode.dmg, { knock: 1 });
      }
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      this.projectiles.splice(i, 1);
    }
  }

  private stepBeacons(dt: number) {
    this.beacons.forEach((b) => {
      const n = [0, 0];
      for (const u of this.units) if (u.alive && dist2D(u.pos, b.pos) < BEACON_RADIUS) n[u.team]++;
      const before = b.owner;
      if (n[0] && !n[1] || n[1] && !n[0]) {
        const team = n[0] ? 0 : 1, cnt = n[team];
        const dir = team === 0 ? 1 : -1;
        const full = b.value * dir >= 1;
        b.value = Math.max(-1, Math.min(1, b.value + dir * dt * (0.26 + 0.09 * (cnt - 1))));
        if (!full) for (const u of this.units) if (u.alive && u.team === team && dist2D(u.pos, b.pos) < BEACON_RADIUS) u.ult = Math.min(1, u.ult + dt / 22);
      } else if (!n[0] && !n[1]) {
        // 誰もいなければ、持ち主の色に戻っていく（中立なら0へ）
        const rest = b.owner === 0 ? 1 : b.owner === 1 ? -1 : 0;
        const d = rest - b.value;
        b.value += Math.sign(d) * Math.min(Math.abs(d), dt * 0.08);
      }
      if (b.value >= 1) b.owner = 0;
      else if (b.value <= -1) b.owner = 1;
      else if (b.owner === 0 && b.value <= 0 || b.owner === 1 && b.value >= 0) b.owner = -1;
      if (b.owner !== before && b.owner !== -1) {
        const mine = b.owner === this.player.team;
        this.hud.announce(`${mine ? '味方' : '敵'}が拠点 ${b.label} を確保！`, b.owner === 0 ? 'blue' : 'red');
        this.fx.ring(b.pos, BEACON_RADIUS * 1.8, TEAM_COLORS[b.owner], 0.8);
        this.fx.pillar(b.pos, TEAM_COLORS[b.owner], 1.6);
        mine ? sfx.capture() : sfx.lost();
      }
      // コントロール: 確保している間だけ進む。敵が乗っている間は止まる
      if (this.mode.id === 'control' && b.owner !== -1 && !n[1 - b.owner]) this.controlPct[b.owner] += dt * 100 / CONTROL_SECONDS;
    });
  }

  private updateBeaconVisuals(dt: number) {
    const c = new THREE.Color();
    for (const b of this.beacons) {
      c.set(b.owner === -1 ? NEUTRAL : TEAM_COLORS[b.owner]);
      (b.disc.material as THREE.MeshBasicMaterial).color.copy(c);
      const cm = b.crystal.material as THREE.MeshToonMaterial;
      cm.color.copy(c); cm.emissive.copy(c);
      (b.beam.material as THREE.MeshBasicMaterial).color.copy(c);
      b.light.color.copy(c);
      const fm = b.fill.material as THREE.MeshBasicMaterial;
      fm.color.set(b.value > 0 ? TEAM_COLORS[0] : b.value < 0 ? TEAM_COLORS[1] : NEUTRAL);
      const s = Math.max(0.001, Math.abs(b.value));
      b.fill.scale.set(s, s, 1);
      b.crystal.rotation.y += dt * 1.4;
      b.crystal.position.y = 3.6 + Math.sin(performance.now() / 500 + b.pos.x) * 0.25;
    }
  }

  private updateCamera(dt: number, snap: boolean) {
    const p = this.player, cam = this.camera;
    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const portrait = cam.aspect < 1;
    // 縦画面は横の視野が狭くなるので、横方向の視野角を保つように縦の画角を広げる
    const fov = portrait ? Math.min(78, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(27)) / cam.aspect))) : 50;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // キャラの背後・斜め上から。注視点を前方に置き、キャラを画面の下寄りに映して前を広く見せる
    const dist = (portrait ? 9.5 : 10.5) * this.camZoom;
    const lead = portrait ? 4.2 : 3.6;
    const wantLook = p.pos.clone().addScaledVector(f, lead).setY(1.5);
    const wantPos = p.pos.clone().addScaledVector(f, -dist * Math.cos(this.camPitch)).setY(1.5 + dist * Math.sin(this.camPitch));
    const k = snap ? 1 : 1 - Math.exp(-dt * 10);
    this.camLook.lerp(wantLook, k); this.camPos.lerp(wantPos, k);
    cam.position.copy(this.camPos);
    if (this.shakeAmt > 0.01) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 8);
    }
    cam.lookAt(this.camLook);
    // 照準線: 射程ぶんだけ前方へ。敵を捉えると黄色くなる
    const line = this.aimLine, lock = p.alive ? this.aimLock : null;
    line.visible = p.alive && this.state === 'play';
    line.position.set(p.pos.x, 0.11, p.pos.z);
    line.rotation.y = lock ? Math.atan2(lock.pos.x - p.pos.x, lock.pos.z - p.pos.z) : this.camYaw;
    line.scale.z = lock ? Math.max(1, dist2D(lock.pos, p.pos)) : Math.min(p.def.range, 12);
    (line.material as THREE.MeshBasicMaterial).color.set(lock ? 0xffd60a : 0xffffff);
    (line.material as THREE.MeshBasicMaterial).opacity = lock ? 0.8 : 0.3;
  }

  // ---------- AI ----------
  private think(u: Unit, dt: number) {
    const ai = u.ai;
    u.moveDir.set(0, 0, 0);
    if (u.stun > 0) return;
    const sign = u.team === 0 ? 1 : -1;

    ai.think -= dt;
    if (ai.think <= 0 || ai.goal < 0) {
      ai.think = 0.6 + Math.random() * 0.4;
      let bestScore = -1;
      this.beacons.forEach((b, i) => {
        const mine = b.owner === u.team;
        const threatened = this.enemiesOf(u).some((e) => e.alive && dist2D(e.pos, b.pos) < BEACON_RADIUS + 1.5) || b.value * sign < 0.98;
        const need = mine ? (threatened ? 1.5 : 0.1) : b.owner === -1 ? 1.0 : 1.2;
        let crowd = 0;
        for (const a of this.alliesOf(u)) {
          if (a === u || !a.alive) continue;
          if (a.isPlayer ? dist2D(a.pos, b.pos) < 7 : a.ai.goal === i) crowd++;
        }
        const score = need / (dist2D(u.pos, b.pos) + 12) / (1 + 0.9 * crowd) * (i === ai.goal ? 1.2 : 1);
        if (score > bestScore) { bestScore = score; ai.goal = i; }
      });
    }
    if (this.mode.id === 'clash') ai.retreat = false;
    else if (u.hp < u.maxHp * 0.25) ai.retreat = true;
    else if (u.hp > u.maxHp * 0.8) ai.retreat = false;

    // 一番近い見えている敵
    let enemy: Unit | null = null, dE = 99;
    for (const e of this.enemiesOf(u)) {
      if (!e.alive || e.stealth > 0) continue;
      const d = dist2D(e.pos, u.pos);
      if (d < dE) { dE = d; enemy = e; }
    }

    const beacon: Beacon | undefined = this.beacons[ai.goal];
    const dest = ai.dest;
    let stay = false;
    if (ai.retreat) {
      dest.copy(SPAWNS[u.team]);
    } else {
      const range = u.def.range;
      let holding = false, aggro = 999;
      if (beacon) {
        const a = u.slot * 2.1 + ai.goal;
        dest.set(beacon.pos.x + Math.cos(a) * 1.6, 0, beacon.pos.z + Math.sin(a) * 1.6);
        holding = dist2D(u.pos, beacon.pos) < BEACON_RADIUS - 0.5;
        aggro = Math.max(range + 2.5, 8);
      } else if (enemy) dest.copy(enemy.pos); // 拠点のないモードは一番近い敵を追う
      else stay = true;
      // 拠点に乗っている間は、拠点から離れすぎない範囲の敵だけ追う
      if (enemy && dE < aggro && (!holding || !beacon || dist2D(enemy.pos, beacon.pos) < BEACON_RADIUS + (u.def.ranged ? range : 3))) {
        if (u.def.ranged) {
          if (dE > range * 0.9 || this.stage.blockedLine(u.pos, enemy.pos)) dest.copy(enemy.pos);
          else if (dE < range * 0.35 && !holding) dest.copy(u.pos).addScaledVector(u.pos.clone().sub(enemy.pos).setY(0).normalize(), 4);
          else stay = !holding ? true : dist2D(u.pos, dest) < 1;
        } else if (dE > range * 0.75) dest.copy(enemy.pos);
        else stay = true;
      }
    }

    if (!stay) {
      ai.repath -= dt;
      const last = ai.path[ai.path.length - 1];
      if (ai.repath <= 0 || !last || dist2D(last, dest) > 2) {
        ai.repath = 0.5 + Math.random() * 0.2;
        ai.path = this.stage.findPath(u.pos, dest);
      }
      while (ai.path.length > 1 && (dist2D(ai.path[0], u.pos) < 0.9 || this.stage.clear(u.pos, ai.path[1]))) ai.path.shift();
      const wp = ai.path[0] ?? dest;
      const d = wp.clone().sub(u.pos).setY(0);
      if (d.length() > 0.35) u.moveDir.copy(d.normalize());
    }

    // スキル
    ai.skillDelay -= dt;
    if (ai.skillDelay > 0 || !enemy) return;
    const base = u.team === 1 ? this.difficulty.skillDelay : 1.4;
    for (const i of [2, 0, 1]) {
      if (!this.skillReady(u, i)) continue;
      const s = this.skillOf(u, i);
      let ok = dE <= s.aiRange;
      if (s.aiWhen === 'hurt') ok = ok && u.hp < u.maxHp * 0.65;
      if (s.aiWhen === 'allyHurt') ok = this.alliesOf(u).some((a) => a.alive && a.hp < a.maxHp * 0.6 && dist2D(a.pos, u.pos) < 6);
      if (ok && this.cast(u, i)) { ai.skillDelay = base * (0.7 + Math.random() * 0.8); break; }
    }
  }

  dispose() {
    this.fx.clear();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && m.geometry.type !== 'BufferGeometry') m.geometry.dispose();
    });
  }
}
