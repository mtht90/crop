// 筐体上部の多段「クルーン抽選機」（物理）。
// すり鉢状の皿に穴が開いていて、ボールは縁を回りながら内側へ転がり、穴の縁で粘って落ちる。
// 周りの穴＝メダル配当、中央の穴＝次の段へ（最終段の中央は JACKPOT）。
import RAPIER from '@dimforge/rapier3d-compat';
import { CROON, PHYSICS, type CroonLabel, type CroonStageDef } from './config.ts';


export type CroonPrize = number | 'JP';
export type CroonState = 'idle' | 'transfer' | 'rolling' | 'sinking' | 'settled';

type Quat = { x: number; y: number; z: number; w: number };

/** 皿の高さ（中心が一番低い、ゆるいすり鉢） */
export function plateY(stage: CroonStageDef, r: number): number {
  // 縁は急（バンク）で、中ほどはほぼ平ら → 縁を何周も回ってから内側へ降りてくる
  const t = Math.min(1, r / stage.radius);
  // 縁だけ急なバンク（t^4）で、内側はほぼ平ら＋中心へわずかに下る。
  // 内側では周回を保てないので、ボールは穴の並ぶ輪を素早く横切る
  return -stage.depth * (1 - t ** 4) - (stage.cone ?? CROON.coneDepth) * (1 - t);
}

/** 皿のローカル座標での穴の位置（0〜5: 周り、6: 中央） */
export function holeCenters(stage: CroonStageDef): { x: number; z: number; r: number; label: CroonLabel }[] {
  const out = stage.holes.map((label, i) => {
    const a = (i / stage.holes.length) * Math.PI * 2;
    const rr = stage.radius * stage.holeRing;
    return { x: Math.cos(a) * rr, z: -Math.sin(a) * rr, r: stage.holeRadius, label };
  });
  out.push({ x: 0, z: 0, r: stage.centerRadius, label: stage.center });
  return out;
}

/** 穴を開けた皿の三角形メッシュ（物理と描画で共用） */
export function plateMesh(
  stage: CroonStageDef,
  part: 'all' | 'bank' | 'inner' = 'all',
): { vertices: Float32Array; indices: Uint32Array; uvs: Float32Array } {
  const nr = 56, na = 160;
  const R = stage.radius;
  const holes = holeCenters(stage);
  const verts: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= nr; i++) {
    const r = (i / nr) * R;
    for (let j = 0; j <= na; j++) {
      const a = (j / na) * Math.PI * 2;
      const x = Math.cos(a) * r, z = -Math.sin(a) * r;
      verts.push(x, plateY(stage, r), z);
      uvs.push(0.5 + x / (2 * R), 0.5 - z / (2 * R));
    }
  }
  const idx: number[] = [];
  const v = (i: number, j: number) => i * (na + 1) + j;
  const inHole = (x: number, z: number) => holes.some((h) => (x - h.x) ** 2 + (z - h.z) ** 2 < h.r * h.r);
  const split = Math.round(nr * CROON.bankStart);
  for (let i = 0; i < nr; i++) {
    if (part === 'bank' && i < split) continue;
    if (part === 'inner' && i >= split) continue;
    for (let j = 0; j < na; j++) {
      const r = ((i + 0.5) / nr) * R;
      const a = ((j + 0.5) / na) * Math.PI * 2;
      if (inHole(Math.cos(a) * r, -Math.sin(a) * r)) continue;
      // 上向きの法線になる巻き順
      idx.push(v(i, j), v(i + 1, j), v(i, j + 1), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
    }
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx), uvs: new Float32Array(uvs) };
}

interface Stage {
  def: CroonStageDef;
  body: RAPIER.RigidBody;
  angle: number;
}

export class CroonPhysics {
  readonly world: RAPIER.World;
  state: CroonState = 'idle';
  stageIndex = 0;
  result: { stage: number; hole: number; prize: CroonPrize } | null = null;
  /** 直前に落ちた穴（演出用） */
  lastHole: { stage: number; hole: number } | null = null;
  onSettle?: (prize: CroonPrize) => void;
  onNext?: (toStage: number) => void;
  onBounce?: (strength: number) => void;
  onRim?: () => void;

  private stages: Stage[] = [];
  private ball: RAPIER.RigidBody | null = null;
  private accumulator = 0;
  private stageTime = 0;
  private transferTime = 0;
  private lastSpeed = 0;
  private stillTime = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: CROON.gravity, z: 0 });
    this.world.timestep = PHYSICS.dt;
    for (const def of CROON.stages) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(def.x, def.y, def.z),
      );
      // 外周のバンクはよく滑り（何周も回る）、内側は摩擦で周回が止まって穴へ向かう
      for (const [part, friction] of [['bank', CROON.bankFriction], ['inner', CROON.plateFriction]] as const) {
        const m = plateMesh(def, part);
        this.world.createCollider(
          RAPIER.ColliderDesc.trimesh(m.vertices, m.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
            .setFriction(friction)
            .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
            .setRestitution(0.15),
          body,
        );
      }
      this.addWall(def);
      this.stages.push({ def, body, angle: 0 });
    }
  }

  /** 外周の壁（なめらかな円筒、法線は内向き）と天井 */
  private addWall(def: CroonStageDef): void {
    const segs = 160;
    const R = def.radius + 0.02;
    const v: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = def.x + Math.cos(a) * R, z = def.z - Math.sin(a) * R;
      v.push(x, def.y - 0.3, z, x, def.y + 1.2, z);
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(idx), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0.1),
    );
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.05, R + 0.2).setTranslation(def.x, def.y + 1.25, def.z));
  }

  get busy(): boolean {
    return this.state !== 'idle';
  }

  get ballPosition(): { x: number; y: number; z: number } | null {
    return this.ball ? this.ball.translation() : null;
  }

  get ballRotation(): Quat | null {
    return this.ball ? this.ball.rotation() : null;
  }

  /** シュートの中を移動中の進み具合（0→1）と行き先の段 */
  get transferProgress(): number {
    return 1 - Math.max(0, this.transferTime) / this.transferDuration;
  }
  transferTo = 0;
  private transferDuration = 1;

  /** 穴に吸い込まれている途中のボール位置（グループ内座標） */
  sinkPosition: { x: number; y: number; z: number } | null = null;
  private sink: { stage: number; hole: number; from: { x: number; y: number; z: number }; t: number; label: CroonLabel } | null = null;

  private beginTransfer(to: number, seconds: number): void {
    this.state = 'transfer';
    this.transferTo = to;
    this.transferDuration = seconds;
    this.transferTime = seconds;
    this.stageIndex = to;
  }

  /** 穴の中心のいまの位置（皿の回転込み、グループ内座標） */
  holeWorld(stage: number, hole: number): { x: number; y: number; z: number } {
    const def = CROON.stages[stage];
    const h = holeCenters(def)[hole];
    const a = this.stages[stage].angle;
    const c = Math.cos(a), s = Math.sin(a);
    return { x: def.x + h.x * c + h.z * s, y: def.y + plateY(def, Math.hypot(h.x, h.z)), z: def.z - h.x * s + h.z * c };
  }

  stageAngle(i: number): number {
    return this.stages[i].angle;
  }

  /** 抽選開始：ボールは投入シュートを転がって1段目に入る */
  start(): void {
    this.result = null;
    this.lastHole = null;
    this.sink = null;
    this.sinkPosition = null;
    this.beginTransfer(0, CROON.intakeSeconds);
  }

  private launch(stageIndex: number): void {
    if (this.ball) this.world.removeRigidBody(this.ball);
    this.stageIndex = stageIndex;
    this.state = 'rolling';
    this.stageTime = 0;
    this.stillTime = 0;
    const def = CROON.stages[stageIndex];
    // シュートの出口（固定位置）から打ち出す。皿は回っているので穴との位置関係は毎回変わる
    const a = def.launchAngle + (Math.random() - 0.5) * 0.3;
    const r = def.radius - CROON.ballRadius - 0.04;
    // 皿の縁に沿って（時計回りに）打ち出す。接線方向 = (sin a, 0, cos a)
    const speed = def.launchSpeed * (0.85 + Math.random() * 0.3);
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(def.x + Math.cos(a) * r, def.y + plateY(def, r) + CROON.ballRadius + 0.08, def.z - Math.sin(a) * r)
        .setLinvel(Math.sin(a) * speed, 0, Math.cos(a) * speed)
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setLinearDamping(CROON.ballDamping)
        .setAngularDamping(CROON.ballSpinDamping),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(CROON.ballRadius).setDensity(1).setFriction(0.4).setRestitution(0.3),
      this.ball,
    );
  }

  /** 結果表示が終わったら呼ぶ */
  finish(): void {
    if (this.ball) this.world.removeRigidBody(this.ball);
    this.ball = null;
    this.state = 'idle';
    this.stageIndex = 0;
    this.sink = null;
    this.sinkPosition = null;
  }

  update(frameDt: number): void {
    this.accumulator += Math.min(frameDt, 0.1);
    let steps = 0;
    while (this.accumulator >= PHYSICS.dt && steps < PHYSICS.maxSubSteps) {
      this.step();
      this.accumulator -= PHYSICS.dt;
      steps++;
    }
    if (steps === PHYSICS.maxSubSteps) this.accumulator = 0;
  }

  step(): void {
    const dt = PHYSICS.dt;
    for (const s of this.stages) {
      s.angle = (s.angle + s.def.spin * dt) % (Math.PI * 2);
      s.body.setNextKinematicRotation(yRot(s.angle));
    }
    this.world.step();

    if (this.state === 'transfer') {
      this.transferTime -= dt;
      if (this.transferTime <= 0) this.launch(this.transferTo);
      return;
    }
    if (this.state === 'sinking' && this.sink) {
      // 穴の縁からすっと吸い込まれて沈む（皿と一緒に回る）
      const k = this.sink;
      k.t += dt;
      const hole = this.holeWorld(k.stage, k.hole);
      const u = Math.min(1, k.t / 0.18);
      const down = Math.max(0, k.t - 0.12) * 2.2;
      this.sinkPosition = {
        x: k.from.x + (hole.x - k.from.x) * u,
        y: k.from.y + (hole.y - CROON.ballRadius * 0.6 - k.from.y) * u - down,
        z: k.from.z + (hole.z - k.from.z) * u,
      };
      if (k.t >= CROON.sinkSeconds) {
        this.sinkPosition = null;
        if (k.label === 'NEXT' && k.stage < CROON.stages.length - 1) {
          this.beginTransfer(k.stage + 1, CROON.transferSeconds);
        } else {
          const prize: CroonPrize = k.label === 'NEXT' ? 'JP' : k.label;
          this.result = { stage: k.stage, hole: k.hole, prize };
          this.state = 'settled';
          this.onSettle?.(prize);
        }
      }
      return;
    }
    if (this.state !== 'rolling' || !this.ball) return;
    this.stageTime += dt;
    const def = CROON.stages[this.stageIndex];
    const stage = this.stages[this.stageIndex];
    const p = this.ball.translation();
    const v = this.ball.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (this.lastSpeed - speed > 2) this.onBounce?.(Math.min(1, (this.lastSpeed - speed) / 6));
    this.lastSpeed = speed;

    // 皿のローカル座標（皿は y 軸まわりに angle だけ回っている）
    const dx = p.x - def.x, dz = p.z - def.z;
    const c = Math.cos(stage.angle), s = Math.sin(stage.angle);
    // ワールド→ローカル: 角度を -angle 回す（ローカル角 = atan2(-z, x)）
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const r = Math.hypot(lx, lz);
    const below = p.y - def.y - plateY(def, Math.min(r, def.radius));

    // 穴に落ちた（皿面よりボール1個ぶん以上下がった）
    if (below < -CROON.ballRadius * 1.2 || p.y < def.y - 1.5) {
      const holes = holeCenters(def);
      let best = 0, bestD = Infinity;
      holes.forEach((h, i) => {
        const d = (lx - h.x) ** 2 + (lz - h.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      this.lastHole = { stage: this.stageIndex, hole: best };
      const label = holes[best].label;
      this.sink = { stage: this.stageIndex, hole: best, from: { x: p.x, y: p.y, z: p.z }, t: 0, label };
      this.state = 'sinking';
      this.world.removeRigidBody(this.ball);
      this.ball = null;
      if (label === 'NEXT' && this.stageIndex < CROON.stages.length - 1) this.onNext?.(this.stageIndex + 1);
      return;
    }
    // 穴の縁で粘っている（ゆっくり）ときの音
    if (speed < 1.2 && speed > 0.2 && Math.random() < 0.02) this.onRim?.();

    // 皿の上で完全に止まってしまったら軽く揺らす（皿が回っているので通常は起きない）
    // 皿上の点の速度は (spin*dz, -spin*dx)
    const rel = Math.hypot(v.x - stage.def.spin * dz, v.z + stage.def.spin * dx);
    this.stillTime = rel < 0.15 ? this.stillTime + dt : 0;
    if (this.stillTime > 1.5) {
      this.stillTime = 0;
      this.ball.applyImpulse({ x: (Math.random() - 0.5) * 0.4, y: 0.05, z: (Math.random() - 0.5) * 0.4 }, true);
    }
    // 万一の飛び出し
    if (r > def.radius + 0.5 || p.y > def.y + 2) this.launch(this.stageIndex);
  }
}

function yRot(a: number): Quat {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}
