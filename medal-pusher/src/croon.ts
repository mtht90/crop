// 筐体上部の「クルーン」抽選ステージ（物理）。
// 回転する皿を仕切りで10のポケットに分け、中央の円錐に落としたボールがどこに収まるかで配当が決まる。
import RAPIER from '@dimforge/rapier3d-compat';
import { CROON, PHYSICS } from './config.ts';

export type CroonPrize = number | 'JP';

export type CroonState = 'idle' | 'spinning' | 'settled';

export class CroonPhysics {
  readonly world: RAPIER.World;
  state: CroonState = 'idle';
  angle = 0; // 皿の回転角
  result: { index: number; prize: CroonPrize } | null = null;
  onSettle?: (index: number, prize: CroonPrize) => void;
  onBounce?: (strength: number) => void;

  private wheel: RAPIER.RigidBody;
  private ball: RAPIER.RigidBody | null = null;
  private time = 0;
  private spinTime = 0;
  private stillTime = 0;
  private accumulator = 0;
  private lastSpeed = 0;
  debug: { r: number; y: number; rel: number } | null = null;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.dt;
    const R = CROON.radius;
    // 回転する皿（床・中央の円錐・仕切り）
    this.wheel = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = (d: RAPIER.ColliderDesc, friction = 0.4, rest = 0.35) =>
      this.world.createCollider(d.setFriction(friction).setRestitution(rest), this.wheel);
    col(RAPIER.ColliderDesc.cylinder(0.15, R).setTranslation(0, -0.15, 0), 0.6, 0.2);
    col(RAPIER.ColliderDesc.cone(CROON.coneHeight / 2, CROON.coneRadius).setTranslation(0, CROON.coneHeight / 2, 0), 0.0, 0.3);
    const n = CROON.pockets.length;
    const inner = CROON.coneRadius - 0.05;
    const len = R - inner;
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
    // 外周の壁（回転しない）
    const segs = 36;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const w = (2 * Math.PI * (R + 0.15)) / segs;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.15, 1.25, w / 2 + 0.02)
          .setTranslation(Math.cos(a) * (R + 0.15), 1.25, -Math.sin(a) * (R + 0.15))
          .setRotation(yRot(a))
          .setFriction(0.2)
          .setRestitution(0.5),
      );
    }
    // ガラスの天井（ボールが飛び出さないように）
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.05, R + 0.3).setTranslation(0, 2.6, 0));
  }

  get busy(): boolean {
    return this.state !== 'idle';
  }

  get ballPosition(): { x: number; y: number; z: number } | null {
    return this.ball ? this.ball.translation() : null;
  }

  get ballRotation(): { x: number; y: number; z: number; w: number } | null {
    return this.ball ? this.ball.rotation() : null;
  }

  /** ボールを落として抽選開始 */
  start(): void {
    if (this.ball) this.world.removeRigidBody(this.ball);
    this.state = 'spinning';
    this.result = null;
    this.spinTime = 0;
    this.stillTime = 0;
    const a = Math.random() * Math.PI * 2;
    const off = 0.45 + Math.random() * 0.35;
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(Math.cos(a) * off, CROON.coneHeight + 0.8, Math.sin(a) * off)
        .setLinvel((Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2)
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setLinearDamping(0.15)
        .setAngularDamping(1.2),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(CROON.ballRadius).setDensity(1).setFriction(0.35).setRestitution(0.4),
      this.ball,
    );
  }

  /** 結果表示が終わったら呼ぶ */
  finish(): void {
    if (this.ball) this.world.removeRigidBody(this.ball);
    this.ball = null;
    this.state = 'idle';
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
    this.time += dt;
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
    // 皿と一緒に回っている（相対速度が小さい）かどうか
    const r = Math.hypot(p.x, p.z);
    // y軸まわり角速度 w の回転で、点 (x, z) の速度は (w*z, -w*x)
    const rel = Math.hypot(v.x - w * p.z, v.z + w * p.x, v.y);
    // 円錐の上で止まりかけたら外へ押し出す
    if (r < CROON.coneRadius && speed < 0.5) {
      const k = 1.5 / Math.max(r, 0.01);
      this.ball.applyImpulse({ x: (p.x || 0.01) * k * 0.05, y: 0, z: p.z * k * 0.05 }, true);
    }
    if (r > CROON.coneRadius + 0.1 && rel < 0.6 && p.y < CROON.ballRadius + 0.3) this.stillTime += dt;
    else this.stillTime = 0;
    if (this.stillTime > 0.8 || this.spinTime > 18) {
      if (this.spinTime > 18) this.debug = { r, y: p.y, rel };
      const index = this.pocketAt(p.x, p.z);
      const prize = CROON.pockets[index];
      this.result = { index, prize };
      this.state = 'settled';
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

function yRot(a: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}
