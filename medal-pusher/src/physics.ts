import RAPIER from '@dimforge/rapier3d-compat';
import { BALL, BOARD, COIN, FIELD, PHYSICS, PUSHER, TRAY } from './config.ts';

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export type CoinOutcome = 'win' | 'lost';

export interface Coin {
  id: number;
  body: RAPIER.RigidBody;
  inBoard: boolean; // ピンボード内を落下中
  checked: boolean; // チェッカー通過済み
  outcome: CoinOutcome | null;
  countedAt: number; // 受け皿で獲得カウントした時刻（-1=未カウント）
  stillTime: number; // ボード内で止まっている時間
  gold: boolean; // 黄金メダル
}

export interface Ball {
  body: RAPIER.RigidBody;
  outcome: CoinOutcome | null;
}

export interface PhysicsEvents {
  onChecker?: (coin: Coin) => void;
  onCoinGone?: (coin: Coin, outcome: CoinOutcome) => void;
  onBallGone?: (outcome: CoinOutcome) => void;
  onCoinLanded?: (coin: Coin) => void;
}

/** サイドウォールの中心の高さ（下げたとき / 上げたとき） */
export const WALL_DOWN_Y = -8;
export const WALL_UP_Y = 2.5;

const HALF_PI_X: Quat = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

export class PusherPhysics {
  readonly world: RAPIER.World;
  readonly coins = new Map<number, Coin>();
  ball: Ball | null = null;
  trayCoins: Coin[] = [];
  events: PhysicsEvents = {};
  time = 0;

  private pusher: RAPIER.RigidBody;
  private nextId = 1;
  private accumulator = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.dt;
    this.world.integrationParameters.numSolverIterations = 6;
    this.buildStatic();
    this.pusher = this.buildPusher();
    this.walls = [-1, 1].map((sx) => {
      const len = FIELD.front - FIELD.sideWallEnd + 0.4;
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(sx * (FIELD.halfWidth + 0.2), WALL_DOWN_Y, FIELD.sideWallEnd + len / 2 - 0.2),
      );
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 3, len / 2).setFriction(0.1).setRestitution(0.1), body);
      return body;
    });
  }

  /** サイドウォール（0=下がっている, 1=上がりきり） */
  wallLevel = 0;
  wallTarget = 0;
  private walls: RAPIER.RigidBody[];

  /** サイドウォールが上がっていて、手前の全幅が獲得口になっているか */
  get wallActive(): boolean {
    return this.wallLevel > 0.5;
  }

  /** 前面 z を返す（0..1 の位相から） */
  static pusherFrontAt(t: number): number {
    const phase = (1 - Math.cos((t / PUSHER.period) * Math.PI * 2)) / 2;
    return PUSHER.frontMin + (PUSHER.frontMax - PUSHER.frontMin) * phase;
  }

  get pusherFront(): number {
    return this.pusher.translation().z + PUSHER.depth / 2;
  }

  private fixed(desc: RAPIER.ColliderDesc, friction = 0.3, restitution = 0.1): void {
    this.world.createCollider(desc.setFriction(friction).setRestitution(restitution));
  }

  private buildStatic(): void {
    const hw = FIELD.halfWidth;
    // フィールド床
    const floorLen = FIELD.front - FIELD.back;
    this.fixed(
      RAPIER.ColliderDesc.cuboid(hw, 0.25, floorLen / 2).setTranslation(0, -0.25, (FIELD.front + FIELD.back) / 2),
      0.28,
    );
    // サイド壁（奥からsideWallEndまで）
    const wallLen = FIELD.sideWallEnd - FIELD.back;
    for (const s of [-1, 1]) {
      this.fixed(
        RAPIER.ColliderDesc.cuboid(0.2, 6, wallLen / 2).setTranslation(s * (hw + 0.2), 6, (FIELD.sideWallEnd + FIELD.back) / 2),
        0.1,
      );
    }
    // 奥板（プッシャー上面のすぐ上から上へ）。プッシャー上のメダルをかき落とす
    const backBottom = PUSHER.height + 0.04;
    const backTop = BOARD.top + 2;
    this.fixed(
      RAPIER.ColliderDesc.cuboid(hw, (backTop - backBottom) / 2, 0.15).setTranslation(
        0,
        (backTop + backBottom) / 2,
        BOARD.backZ - 0.15,
      ),
      0.05,
    );
    // ピンボード手前ガラス
    this.fixed(
      RAPIER.ColliderDesc.cuboid(hw, (backTop - BOARD.bottom) / 2, 0.1).setTranslation(
        0,
        (backTop + BOARD.bottom) / 2,
        BOARD.frontZ + 0.1,
      ),
      0.02,
    );
    // ピン（z軸方向の円柱）
    for (const pin of boardPins()) {
      this.fixed(
        RAPIER.ColliderDesc.cylinder((BOARD.frontZ - BOARD.backZ) / 2, BOARD.pinRadius)
          .setRotation(HALF_PI_X)
          .setTranslation(pin.x, pin.y, (BOARD.frontZ + BOARD.backZ) / 2)
          // よく跳ねるようにして、左右どちらへ転がるかをランダムにする
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
        0.02,
        0.55,
      );
    }
    // 下段のレーン仕切り
    for (const x of laneDividers()) {
      const h = (BOARD.laneDividerTop - BOARD.bottom) / 2;
      this.fixed(
        RAPIER.ColliderDesc.cuboid(0.06, h, (BOARD.frontZ - BOARD.backZ) / 2).setTranslation(
          x,
          BOARD.bottom + h,
          (BOARD.frontZ + BOARD.backZ) / 2,
        ),
        0.05,
      );
    }
    // 外側パネル（左右に落ちたメダルを外へ飛ばさない）
    for (const s of [-1, 1]) {
      this.fixed(RAPIER.ColliderDesc.cuboid(0.2, 8, 9).setTranslation(s * (TRAY.halfWidth + 0.2), 0, 0), 0.1);
    }
    // 筐体前面（フィールド手前の下）と前面アクリル。獲得メダルはこの間を落ちて受け皿へ
    this.fixed(RAPIER.ColliderDesc.cuboid(TRAY.halfWidth, 3.2, 0.1).setTranslation(0, -3.5, FIELD.front - 0.12), 0.1);
    this.fixed(RAPIER.ColliderDesc.cuboid(TRAY.halfWidth, 3.5, 0.1).setTranslation(0, -3.2, TRAY.shieldZ + 0.1), 0.1);
    // 受け皿
    this.fixed(RAPIER.ColliderDesc.cuboid(TRAY.halfWidth, 0.25, 2).setTranslation(0, TRAY.y - 0.25, FIELD.front + 1.5), 0.7);
  }

  private buildPusher(): RAPIER.RigidBody {
    const front = PusherPhysics.pusherFrontAt(0);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PUSHER.height / 2 + 0.01, front - PUSHER.depth / 2),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(FIELD.halfWidth - 0.02, PUSHER.height / 2 - 0.01, PUSHER.depth / 2)
        .setFriction(0.45)
        .setRestitution(0.05),
      body,
    );
    return body;
  }

  addCoin(pos: Vec3, rot: Quat | null = null, vel: Vec3 | null = null, inBoard = false): Coin {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.15)
      .setAngularDamping(0.4)
      .setCcdEnabled(inBoard)
      .setCanSleep(!inBoard);
    // ボード内は2Dの面内運動に制限（ガラスとの噛み込み防止）
    if (inBoard) desc.enabledTranslations(true, true, false).enabledRotations(false, false, true);
    if (rot) desc.setRotation(rot);
    if (vel) desc.setLinvel(vel.x, vel.y, vel.z);
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(COIN.halfThickness, COIN.radius)
        .setFriction(COIN.friction)
        .setRestitution(COIN.restitution)
        .setDensity(COIN.density),
      body,
    );
    const coin: Coin = { id: this.nextId++, body, inBoard, checked: false, outcome: null, countedAt: -1, stillTime: 0, gold: false };
    this.coins.set(coin.id, coin);
    return coin;
  }

  /** 投入口付近が空いているか */
  canLaunch(x: number): boolean {
    for (const c of this.coins.values()) {
      if (!c.inBoard) continue;
      const p = c.body.translation();
      if (Math.abs(p.y - BOARD.launchY) < 1.1 && Math.abs(p.x - x) < 1.1) return false;
    }
    return true;
  }

  /** ピンボード上部からメダルを投入 */
  launchCoin(x: number): Coin {
    const z = (BOARD.frontZ + BOARD.backZ) / 2;
    const vx = (Math.random() - 0.5) * 0.6;
    return this.addCoin({ x, y: BOARD.launchY, z }, HALF_PI_X, { x: vx, y: -2, z: 0 }, true);
  }

  /** 払い出し（プッシャー上へ降らせる） */
  dropPayoutCoin(x: number, y: number, z: number, gold = false): Coin {
    const a = Math.random() * Math.PI;
    const tilt = (Math.random() - 0.5) * 0.6;
    const rot = quatFromEuler(tilt, a, tilt * 0.5);
    const coin = this.addCoin({ x, y, z }, rot, { x: 0, y: -1, z: 0.5 });
    coin.gold = gold;
    return coin;
  }

  spawnBall(x: number, y: number, z: number): Ball {
    if (this.ball) this.removeBall();
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.3).setAngularDamping(0.6).setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL.radius).setDensity(BALL.density).setFriction(0.5).setRestitution(0.2),
      body,
    );
    this.ball = { body, outcome: null };
    return this.ball;
  }

  removeBall(): void {
    if (!this.ball) return;
    this.world.removeRigidBody(this.ball.body);
    this.ball = null;
  }

  removeCoin(coin: Coin): void {
    this.world.removeRigidBody(coin.body);
    this.coins.delete(coin.id);
  }

  clearAll(): void {
    for (const c of [...this.coins.values()]) this.removeCoin(c);
    this.trayCoins = [];
    this.removeBall();
  }

  /** 経過時間ぶんだけ固定ステップで進める */
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
    this.time += PHYSICS.dt;
    const front = PusherPhysics.pusherFrontAt(this.time);
    this.pusher.setNextKinematicTranslation({ x: 0, y: PUSHER.height / 2 + 0.01, z: front - PUSHER.depth / 2 });
    if (this.wallLevel !== this.wallTarget) {
      const d = PHYSICS.dt * 1.2;
      this.wallLevel = this.wallTarget > this.wallLevel ? Math.min(this.wallTarget, this.wallLevel + d) : Math.max(this.wallTarget, this.wallLevel - d);
      const y = WALL_DOWN_Y + (WALL_UP_Y - WALL_DOWN_Y) * this.wallLevel;
      for (const w of this.walls) {
        const t = w.translation();
        w.setNextKinematicTranslation({ x: t.x, y, z: t.z });
      }
    }
    this.world.step();
    this.checkZones();
  }

  private releaseFromBoard(coin: Coin): void {
    coin.inBoard = false;
    const b = coin.body;
    b.enableCcd(false);
    b.setEnabledTranslations(true, true, true, true);
    b.setEnabledRotations(true, true, true, true);
    const v = b.linvel();
    b.setLinvel({ x: v.x * 0.5, y: v.y, z: 1.6 }, true);
    b.setAngvel({ x: 3 + Math.random() * 1.5, y: 0, z: 0 }, true);
    this.events.onCoinLanded?.(coin);
  }

  /** 縦に立ったまま静止したメダルを軽く倒す（物理エンジンでは立ったまま安定しやすいため） */
  private tipStandingCoins(): void {
    for (const coin of this.coins.values()) {
      if (coin.inBoard || coin.outcome === 'lost') continue;
      const b = coin.body;
      const r = b.rotation();
      const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
      if (Math.abs(upY) > 0.35) continue;
      const w = b.angvel();
      if (w.x * w.x + w.y * w.y + w.z * w.z > 4) continue;
      // コインの軸（ローカルy）の水平成分方向へ倒す
      const ax = 2 * (r.x * r.y - r.w * r.z);
      const az = 2 * (r.y * r.z + r.w * r.x);
      const len = Math.hypot(ax, az) || 1;
      const sign = upY >= 0 ? 1 : -1;
      // 軸を水平→垂直へ回す回転軸は (軸の水平成分) × y
      b.setAngvel({ x: (-az / len) * 2.5 * sign, y: 0, z: (ax / len) * 2.5 * sign }, true);
    }
  }

  private checkZones(): void {
    if (Math.round(this.time / PHYSICS.dt) % 30 === 0) this.tipStandingCoins();
    const hw = FIELD.halfWidth;
    const checker = BOARD.checkerHalfWidth;
    for (const coin of this.coins.values()) {
      const p = coin.body.translation();
      if (Math.abs(p.x) > 30 || p.y > 30 || Math.abs(p.z) > 40) {
        // 万一の飛び出し
        this.removeCoin(coin);
        this.events.onCoinGone?.(coin, 'lost');
        continue;
      }
      if (coin.inBoard) {
        if (!coin.checked && p.y < BOARD.laneDividerTop && p.y > BOARD.bottom && Math.abs(p.x) < checker) {
          coin.checked = true;
          this.events.onChecker?.(coin);
        }
        // ボード下端を抜けたら拘束を解除して手前へ倒す。
        // 下にメダルが溜まって抜けきれない場合も、止まっていれば解除する
        const v = coin.body.linvel();
        coin.stillTime = Math.abs(v.y) < 0.3 ? coin.stillTime + PHYSICS.dt : 0;
        if (p.y < BOARD.bottom - 0.5 || (p.y < BOARD.bottom + 0.2 && coin.stillTime > 0.25)) {
          this.releaseFromBoard(coin);
        }
        continue;
      }
      if (coin.outcome === null && p.y < -0.6) {
        // 手前の中央だけが獲得口。手前の両端と左右はロスト
        const winHalf = this.wallActive ? hw + 0.5 : FIELD.winHalfWidth;
        coin.outcome = p.z > FIELD.front - 0.1 && Math.abs(p.x) < winHalf ? 'win' : 'lost';
      }
      if (coin.outcome === 'win') {
        if (coin.countedAt < 0 && p.y < TRAY.countY) {
          coin.countedAt = this.time;
          this.trayCoins.push(coin);
          this.events.onCoinGone?.(coin, 'win');
        }
      } else if (coin.outcome === 'lost' && p.y < -2.5) {
        this.removeCoin(coin);
        this.events.onCoinGone?.(coin, 'lost');
      }
    }
    // 受け皿のメダルは一定時間 or 一定枚数で片付ける（見た目用）
    while (
      this.trayCoins.length > TRAY.maxCoins ||
      (this.trayCoins.length > 0 && this.time - this.trayCoins[0].countedAt > TRAY.keepSeconds)
    ) {
      const c = this.trayCoins.shift()!;
      if (this.coins.has(c.id)) this.removeCoin(c);
    }
    if (this.ball) {
      const p = this.ball.body.translation();
      if (this.ball.outcome === null && p.y < -0.8) {
        this.ball.outcome = p.z > FIELD.front - 0.1 && Math.abs(p.x) < hw + 0.5 ? 'win' : 'lost';
      }
      if (p.y < -4) {
        const outcome = this.ball.outcome ?? 'lost';
        this.removeBall();
        this.events.onBallGone?.(outcome);
      }
    }
  }

  /** ゲーム開始時に盤面へメダルを敷き詰める */
  fillField(count: number): void {
    const hw = FIELD.halfWidth - COIN.radius - 0.05;
    let placed = 0;
    // フィールド上（プッシャー前方〜手前ギリギリ手前）
    const fieldFront = FIELD.front - 1.3;
    const pusherTopFront = PUSHER.frontMin;
    for (let layer = 0; placed < count && layer < 6; layer++) {
      const y = 0.1 + layer * 0.22;
      for (let z = fieldFront; z > pusherTopFront + 0.6 && placed < count; z -= 0.92) {
        for (let x = -hw; x <= hw && placed < count; x += 0.98) {
          const jx = x + (Math.random() - 0.5) * 0.3 + (layer % 2) * 0.45;
          const jz = z + (Math.random() - 0.5) * 0.3;
          if (Math.abs(jx) > hw) continue;
          if (layer > 0 && Math.random() < 0.35 + layer * 0.1) continue;
          this.dropPayoutCoinAt(jx, y + 0.4, jz);
          placed++;
        }
      }
      // プッシャー上面
      for (let z = BOARD.backZ + 0.6; z < pusherTopFront - 0.3 && placed < count; z += 0.95) {
        for (let x = -hw; x <= hw && placed < count; x += 1.0) {
          if (layer > 1) break;
          this.dropPayoutCoinAt(x + (Math.random() - 0.5) * 0.3, PUSHER.height + 0.2 + layer * 0.2, z);
          placed++;
        }
      }
    }
  }

  private dropPayoutCoinAt(x: number, y: number, z: number): void {
    const tilt = (Math.random() - 0.5) * 0.15;
    this.addCoin({ x, y, z }, quatFromEuler(tilt, Math.random() * Math.PI, tilt));
  }

  /** 物理を進めて落ち着かせる（獲得判定は無効） */
  settle(seconds: number): void {
    const saved = this.events;
    this.events = {};
    const steps = Math.round(seconds / PHYSICS.dt);
    for (let i = 0; i < steps; i++) this.step();
    // 落ち着かせる間に落ちたメダルは破棄
    for (const c of [...this.coins.values()]) if (c.outcome) this.removeCoin(c);
    this.trayCoins = [];
    this.events = saved;
  }

  serialize(): SavedField {
    const coins: number[] = [];
    const gold: number[] = [];
    for (const c of this.coins.values()) {
      if (c.inBoard || c.outcome) continue;
      if (c.gold) gold.push(coins.length / 7);
      const p = c.body.translation();
      const r = c.body.rotation();
      coins.push(...[p.x, p.y, p.z, r.x, r.y, r.z, r.w].map((v) => Math.round(v * 1000) / 1000));
    }
    let ball: number[] | null = null;
    if (this.ball && !this.ball.outcome) {
      const p = this.ball.body.translation();
      ball = [p.x, p.y, p.z];
    }
    return { time: this.time % PUSHER.period, coins, ball, gold };
  }

  restore(data: SavedField): void {
    this.clearAll();
    this.time = data.time;
    // プッシャーを保存時の位置へ瞬間移動
    this.pusher.setTranslation(
      { x: 0, y: PUSHER.height / 2 + 0.01, z: PusherPhysics.pusherFrontAt(this.time) - PUSHER.depth / 2 },
      true,
    );
    const goldSet = new Set(data.gold ?? []);
    for (let i = 0; i + 6 < data.coins.length; i += 7) {
      const d = data.coins;
      const c = this.addCoin({ x: d[i], y: d[i + 1] + 0.005, z: d[i + 2] }, { x: d[i + 3], y: d[i + 4], z: d[i + 5], w: d[i + 6] });
      if (goldSet.has(i / 7)) c.gold = true;
    }
    if (data.ball) this.spawnBall(data.ball[0], data.ball[1] + 0.01, data.ball[2]);
  }

  get pusherTranslation(): Vec3 {
    return this.pusher.translation();
  }
}

export interface SavedField {
  time: number;
  coins: number[];
  ball: number[] | null;
  gold?: number[]; // coins の中で黄金メダルの番号
}

export function boardPins(): { x: number; y: number }[] {
  const pins: { x: number; y: number }[] = [];
  const hw = FIELD.halfWidth;
  BOARD.pinRows.forEach((y, row) => {
    const offset = row % 2 === 0 ? 0 : BOARD.pinSpacing / 2;
    for (let x = -hw + 0.75 + offset; x < hw - 0.5; x += BOARD.pinSpacing) {
      // 壁との隙間がメダル径より狭くなるピンは置かない（噛み込み防止）
      if (Math.abs(x) > hw - 1.2) continue;
      pins.push({ x, y });
    }
  });
  return pins;
}

export function laneDividers(): number[] {
  // 最下段のピンの真下に仕切りを置き、ピンと仕切りの間に挟まらないようにする
  const c = BOARD.pinSpacing / 2;
  return [-c, c, -c - BOARD.pinSpacing, c + BOARD.pinSpacing];
}

export function quatFromEuler(x: number, y: number, z: number): Quat {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}
