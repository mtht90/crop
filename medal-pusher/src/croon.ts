// 筐体上部の「クルーン」抽選ステージ（物理・ルーレット型）。
// ボールを外周の傾斜レーンに打ち出すと、壁沿いに何周も回りながら減速し、
// 内側へ転がり落ちて回転する皿の10個のポケットのどれかに収まる。
import RAPIER from '@dimforge/rapier3d-compat';
import { CROON, PHYSICS } from './config.ts';

export type CroonPrize = number | 'JP';

export type CroonState = 'idle' | 'spinning' | 'settled';

type Quat = { x: number; y: number; z: number; w: number };

/** 外周レーン（すり鉢状の傾斜）の高さ */
export function trackY(r: number): number {
  const t = (r - CROON.trackInner) / (CROON.radius - CROON.trackInner);
  return CROON.trackInnerY + (CROON.trackOuterY - CROON.trackInnerY) * Math.max(0, Math.min(1, t));
}

/** 外周レーンの減速用の突起（ディフレクター）の位置 */
export function deflectors(): { x: number; z: number; a: number }[] {
  const out = [];
  const r = CROON.trackInner + 0.06;
  for (let i = 0; i < CROON.deflectorCount; i++) {
    const a = (i / CROON.deflectorCount) * Math.PI * 2 + 0.2;
    out.push({ x: Math.cos(a) * r, z: -Math.sin(a) * r, a });
  }
  return out;
}

export class CroonPhysics {
  readonly world: RAPIER.World;
  state: CroonState = 'idle';
  angle = 0; // 皿の回転角
  result: { index: number; prize: CroonPrize } | null = null;
  onSettle?: (index: number, prize: CroonPrize) => void;
  onBounce?: (strength: number) => void;
  /** ボールが外周レーンを回っている間 true（効果音用） */
  rolling = false;

  private wheel: RAPIER.RigidBody;
  private ball: RAPIER.RigidBody | null = null;
  private spinTime = 0;
  private stillTime = 0;
  private accumulator = 0;
  private lastSpeed = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.dt;
    const W = CROON.wheelRadius;

    // 回転する皿（床・中央の円錐・仕切り）
    this.wheel = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = (d: RAPIER.ColliderDesc, friction = 0.4, rest = 0.35) =>
      this.world.createCollider(d.setFriction(friction).setRestitution(rest), this.wheel);
    col(RAPIER.ColliderDesc.cylinder(0.15, W).setTranslation(0, -0.15, 0), 0.6, 0.2);
    col(RAPIER.ColliderDesc.cone(CROON.coneHeight / 2, CROON.coneRadius).setTranslation(0, CROON.coneHeight / 2, 0), 0.0, 0.3);
    const n = CROON.pockets.length;
    const inner = CROON.coneRadius - 0.05;
    const len = W - 0.04 - inner;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const mid = inner + len / 2;
      col(
        RAPIER.ColliderDesc.cuboid(len / 2, CROON.dividerHeight / 2, 0.05)
          .setTranslation(Math.cos(a) * mid, CROON.dividerHeight / 2, -Math.sin(a) * mid)
          .setRotation(yRot(a)),
        0.1,
        0.5,
      );
    }

    // 外周レーン（回転しない、すり鉢状の傾斜面）。なめらかに回れるよう三角形メッシュで作る
    const segs = 256;
    const verts: number[] = [];
    const idx: number[] = [];
    const r0 = CROON.trackInner, r1 = CROON.radius + 0.05;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a), s = -Math.sin(a);
      verts.push(c * r0, trackY(r0), s * r0, c * r1, trackY(r1), s * r1);
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(0.02)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
    );
    // レーン上の突起（ボールを弾いて落ちる場所をばらけさせる）
    for (const d of deflectors()) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.14, 0.09, 0.14)
          .setTranslation(d.x, trackY(CROON.trackInner + 0.06) + 0.04, d.z)
          .setRotation(yRot(d.a + Math.PI / 4))
          .setFriction(0.1)
          .setRestitution(0.6),
      );
    }

    // 外周の壁（回転しない）。継ぎ目で減速しないよう、なめらかな円筒メッシュ
    const R = CROON.radius;
    const wv: number[] = [];
    const wi: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a) * R, s = -Math.sin(a) * R;
      wv.push(c, 0, s, c, 2.4, s);
      if (i < segs) {
        const k = i * 2;
        wi.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); // 法線が内向きになる巻き順
      }
    }
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(new Float32Array(wv), new Uint32Array(wi), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
    );
    // レーン内側の縁から下へのスカート（レーンの下にボールが潜り込まないように）
    const sv: number[] = [];
    const si: number[] = [];
    const rs = CROON.trackInner;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a) * rs, s = -Math.sin(a) * rs;
      sv.push(c, -0.3, s, c, CROON.trackInnerY, s);
      if (i < segs) {
        const k = i * 2;
        // 法線が内向き（皿の側）
        si.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(new Float32Array(sv), new Uint32Array(si), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(0.1)
        .setRestitution(0.4),
    );
    // 万一抜けても落ちきらない床
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.1, R + 0.2).setTranslation(0, -0.5, 0));

    // ガラスの天井（ボールが飛び出さないように）
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.05, R + 0.3).setTranslation(0, 2.4, 0));
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

  /** ボールを外周レーンに打ち出して抽選開始 */
  start(): void {
    if (this.ball) this.world.removeRigidBody(this.ball);
    this.state = 'spinning';
    this.result = null;
    this.spinTime = 0;
    this.stillTime = 0;
    const a = Math.random() * Math.PI * 2;
    const r = CROON.radius - CROON.ballRadius - 0.05;
    // 皿と逆向き（時計回り）に打ち出す。接線方向 = (sin a, 0, cos a)
    const speed = CROON.launchSpeed * (0.9 + Math.random() * 0.2);
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(Math.cos(a) * r, trackY(r) + CROON.ballRadius + 0.2, -Math.sin(a) * r)
        .setLinvel(Math.sin(a) * speed, 0, Math.cos(a) * speed)
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setLinearDamping(CROON.ballDamping)
        .setAngularDamping(0.8),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(CROON.ballRadius).setDensity(1).setFriction(0.3).setRestitution(0.35),
      this.ball,
    );
    this.rolling = true;
  }

  /** 結果表示が終わったら呼ぶ */
  finish(): void {
    if (this.ball) this.world.removeRigidBody(this.ball);
    this.ball = null;
    this.state = 'idle';
    this.rolling = false;
  }

  private omega(): number {
    // 最初は速く、だんだん遅く（止まりはしない）
    const t = this.state === 'idle' ? 99 : this.spinTime;
    return CROON.idleSpeed + (CROON.startSpeed - CROON.idleSpeed) * Math.exp(-t / CROON.spinDecay);
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
    if (this.state !== 'idle') this.spinTime += dt;
    const w = this.omega();
    this.angle = (this.angle + w * dt) % (Math.PI * 2);
    this.wheel.setNextKinematicRotation(yRot(this.angle));
    this.world.step();
    if (this.state !== 'spinning' || !this.ball) return;

    const p = this.ball.translation();
    const v = this.ball.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (this.lastSpeed - speed > 2.5) this.onBounce?.(Math.min(1, (this.lastSpeed - speed) / 8));
    this.lastSpeed = speed;
    const r = Math.hypot(p.x, p.z);
    // まれに高速で壁を抜けたら打ち直す
    if (r > CROON.radius + 0.3 || p.y < -0.3) {
      this.start();
      return;
    }
    this.rolling = r > CROON.trackInner;
    // 皿と一緒に回っている（相対速度が小さい）かどうか
    // y軸まわり角速度 w の回転で、点 (x, z) の速度は (w*z, -w*x)
    const rel = Math.hypot(v.x - w * p.z, v.z + w * p.x, v.y);
    // 円錐の上で止まりかけたら外へ押し出す
    if (r < CROON.coneRadius && speed < 0.5) {
      const k = 0.08 / Math.max(r, 0.01);
      this.ball.applyImpulse({ x: (p.x || 0.01) * k, y: 0, z: p.z * k }, true);
    }
    const inPocket = r > CROON.coneRadius + 0.05 && r < CROON.wheelRadius && p.y < CROON.ballRadius + 0.25;
    if (inPocket && rel < 0.6) this.stillTime += dt;
    else this.stillTime = 0;
    if (this.stillTime > 0.8 || this.spinTime > CROON.timeout) {
      const index = this.pocketAt(p.x, p.z);
      const prize = CROON.pockets[index];
      this.result = { index, prize };
      this.state = 'settled';
      this.rolling = false;
      this.onSettle?.(index, prize);
    }
  }

  /** 皿の上の (x, z) がどのポケットか */
  pocketAt(x: number, z: number): number {
    const n = CROON.pockets.length;
    // 皿のローカル角度（setRotation と同じ向き: atan2(-z, x)）
    let a = Math.atan2(-z, x) - this.angle;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(a / ((Math.PI * 2) / n)) % n;
  }
}

function yRot(a: number): Quat {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}
