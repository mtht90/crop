import * as THREE from 'three';
import { PHYS } from './level.js';

const HALF = 0.55, RADIUS = 0.35, FOOT = HALF + RADIUS; // カプセル中心→足元
const UP = new THREE.Vector3(0, 1, 0);
const RAY_OFFSETS = [[0, 0], [0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]];
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

// 空中・綱渡りの手続き的ポーズ（Mixamo リグのボーンに上乗せする回転）
const POSES = {
  rise: { LeftUpLeg: ['x', -1.1], LeftLeg: ['x', 1.5], RightUpLeg: ['x', 0.35], RightLeg: ['x', 0.7], LeftArm: ['x', -0.9], RightArm: ['x', 0.5], Spine: ['x', 0.12] },
  fall: { LeftUpLeg: ['x', -0.5], LeftLeg: ['x', 0.9], RightUpLeg: ['x', -0.2], RightLeg: ['x', 0.6], LeftArm: ['z', -1.6], RightArm: ['z', 1.6], Spine: ['x', -0.15] },
  balance: { LeftArm: ['z', -1.25], RightArm: ['z', 1.25], Spine: ['x', 0.05] },
};

export class Player {
  constructor({ RAPIER, world, scene, gltf, level, events }) {
    Object.assign(this, { RAPIER, world, level, events });

    // ---- Rapier キネマティック・キャラクターコントローラー ----
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF, RADIUS).setTranslation(0, 10, 0));
    this.ctrl = world.createCharacterController(0.02);
    this.ctrl.enableAutostep(0.35, 0.25, false);
    this.ctrl.enableSnapToGround(0.25);
    this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(52));
    this.ctrl.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(60));
    this.ctrl.setSlideEnabled(true);
    this.ctrl.setUp({ x: 0, y: 1, z: 0 });

    // ---- モデル（人間） ----
    this.root = new THREE.Group();
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 1.1; }
    });
    const box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar(1.8 / (box.max.y - box.min.y));
    box.setFromObject(model);
    model.position.y = -box.min.y - FOOT;
    model.rotation.y = Math.PI; // Soldier は -Z 向きなので +Z に揃える
    this.model = model;
    this.root.add(model);
    scene.add(this.root);

    this.bones = {};
    model.traverse((o) => { if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o; });

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.play('Idle', 0);
    this.pose = { rise: 0, fall: 0, balance: 0 };
    this._pq = new THREE.Quaternion();

    // ---- 状態 ----
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0; this.jumpBuf = 0;
    this.stun = 0;
    this.facing = 0;
    this.apexY = 0;
    this.stepDist = 0;
    this.lastSafe = new THREE.Vector3(0, 5, 0);
    this.safeTimer = 0;
    this.frozen = false;
    this.inFan = false;

    this._pos = new THREE.Vector3(); this._feet = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this._wind = new THREE.Vector3(); this._wish = new THREE.Vector3(); this._target = new THREE.Vector3();
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  get position() { const t = this.collider.translation(); return this._pos.set(t.x, t.y, t.z); }

  play(name, fade = 0.2, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }

  spawn(pos, facing = this.facing) {
    this.collider.setTranslation({ x: pos.x, y: pos.y, z: pos.z });
    this.vel.set(0, 0, 0); this.vy = 0; this.stun = 0;
    this.grounded = false; this.ground = null; this.apexY = pos.y;
    this.facing = facing;
    this.root.position.copy(pos);
    this.lastSafe.copy(pos);
  }

  /** 固定ステップ物理（level.update → world.step の後に呼ぶ） */
  step(dt, input, camYaw, time) {
    if (this.frozen) return;
    const c = this.collider;
    const t = c.translation();
    const pos = this._pos.set(t.x, t.y, t.z);
    const height = pos.y - FOOT - this.level.startTop;
    const G = PHYS.G * this.level.gravityAt(height);

    // --- 乗っている足場の移動分（運搬） ---
    let carryX = 0, carryY = 0, carryZ = 0;
    this.platformYaw = 0;
    if (this.grounded && this.ground?.kinematic) {
      const g = this.ground;
      this._m.copy(g.prevM).invert().premultiply(g.currM);
      this._feet.set(pos.x, pos.y - FOOT, pos.z);
      const moved = this._feet.clone().applyMatrix4(this._m);
      carryX = moved.x - this._feet.x; carryY = moved.y - this._feet.y; carryZ = moved.z - this._feet.z;
      if (g.behavior.type === 'rotator') this.platformYaw = g.behavior.speed * dt;
    }

    // --- 入力 → 目標速度（カメラ基準） ---
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const wish = this._wish.set(fx * input.move.y + rx * input.move.x, 0, fz * input.move.y + rz * input.move.x);
    const mag = Math.min(1, wish.length());
    if (mag > 1e-3) wish.multiplyScalar(1 / wish.length());
    const onRope = this.grounded && this.ground?.surface === 'rope';
    const speed = (input.sprint && !onRope ? PHYS.SPRINT : PHYS.RUN) * mag * (onRope ? 0.6 : 1);
    const target = this._target.copy(wish).multiplyScalar(speed);

    const ice = this.grounded && this.ground?.surface === 'ice';
    let accel = this.grounded ? (ice ? 4.5 : 42) : 16;
    if (this.stun > 0) { accel = this.grounded ? 6 : 0.5; this.stun -= dt; }
    const dvx = target.x - this.vel.x, dvz = target.z - this.vel.z;
    const dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
    if (dl <= maxDv) { this.vel.x = target.x; this.vel.z = target.z; }
    else { this.vel.x += (dvx / dl) * maxDv; this.vel.z += (dvz / dl) * maxDv; }

    // 綱渡り：ロープの中心線へ緩やかに引き寄せる
    if (onRope && this.ground.rope) {
      const { a, b } = this.ground.rope;
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      const k = THREE.MathUtils.clamp(((pos.x - a.x) * dx + (pos.z - a.z) * dz) / L2, 0, 1);
      const ox = a.x + dx * k - pos.x, oz = a.z + dz * k - pos.z;
      this.vel.x += ox * 30 * dt; this.vel.z += oz * 30 * dt;
    }

    // 突風
    this.level.windAt(pos, time, this._wind);
    this.inWind = this._wind.lengthSq() > 0;
    if (this.inWind) this.vel.addScaledVector(this._wind, dt);

    // 薙ぎ払いバー
    for (const hz of this.level.hazards) {
      const fy = pos.y - FOOT;
      if (fy > hz.top + 0.72 || fy < hz.top - 0.4) continue;
      const lx = pos.x - hz.p.base.x, lz = pos.z - hz.p.base.z;
      if (lx * lx + lz * lz > 30) continue;
      const ax = Math.cos(hz.angle), az = -Math.sin(hz.angle);
      const along = THREE.MathUtils.clamp(lx * ax + lz * az, -hz.len / 2, hz.len / 2);
      if (Math.hypot(lx - ax * along, lz - az * along) < 0.22 + RADIUS && this.stun <= 0) {
        const sgn = Math.sign(hz.speed);
        let kx = lz * sgn, kz = -lx * sgn;
        const kl = Math.hypot(kx, kz) || 1; kx /= kl; kz /= kl;
        const out = Math.hypot(lx, lz) || 1;
        this.vel.set(kx * 9 + (lx / out) * 4, 0, kz * 9 + (lz / out) * 4);
        this.vy = 7.5; this.grounded = false; this.stun = 0.6;
        this.events.onHit?.();
      }
    }

    // --- 縦方向 ---
    if (input.jumpPressed) this.jumpBuf = 0.14;
    this.jumpBuf -= dt;
    const lift = this.level.fanLift(this._feet.set(pos.x, pos.y - FOOT, pos.z));
    if (lift > 0 && !this.inFan) this.events.onFan?.();
    this.inFan = lift > 0;
    if (this.grounded) {
      this.coyote = 0.12;
      if (this.vy < 0) this.vy = -2;
      if (this.ground?.surface === 'bounce') {
        this.vy = this.ground.bounceV || 18;
        this.grounded = false; this.coyote = 0;
        if (this.ground.pad) this.ground.pad.material.uniforms.uKick.value = 1;
        this.events.onBounce?.(this.ground);
      }
    } else {
      this.coyote -= dt;
      const g = (!input.jumpHeld && this.vy > 0) ? G * 1.9 : G;
      this.vy = Math.max(this.vy - g * dt, -55);
    }
    if (lift > 0) {
      this.vy += (lift - this.vy) * Math.min(1, 5 * dt);
      if (this.vy > 0.5) { this.grounded = false; this.coyote = 0; }
    }
    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
      this.vy = PHYS.JUMP_V; this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
      if (this.ground?.kinematic) { this.vel.x += carryX / dt * 0.8; this.vel.z += carryZ / dt * 0.8; this.vy += Math.max(0, carryY / dt) * 0.8; }
      this.events.onJump?.();
    }

    // --- KCC ---
    const desired = { x: this.vel.x * dt + carryX, y: this.vy * dt + carryY, z: this.vel.z * dt + carryZ };
    this.ctrl.computeColliderMovement(c, desired, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv = this.ctrl.computedMovement();
    const nx = t.x + mv.x, ny = t.y + mv.y, nz = t.z + mv.z;
    c.setTranslation({ x: nx, y: ny, z: nz });

    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded() && this.vy <= 0.01;
    if (this.vy > 0 && mv.y - carryY < this.vy * dt * 0.4) this.vy = 0;
    if (Math.abs(mv.x - carryX) < Math.abs(this.vel.x * dt) * 0.5) this.vel.x *= 0.5;
    if (Math.abs(mv.z - carryZ) < Math.abs(this.vel.z * dt) * 0.5) this.vel.z *= 0.5;

    // --- 足元の足場 ---
    this.ground = null;
    if (this.grounded) {
      // 中心＋周囲4本のレイで足元を探す（細いロープやパイプの縁でも拾えるように）
      for (const [ox, oz] of RAY_OFFSETS) {
        this.ray.origin = { x: nx + ox, y: ny, z: nz + oz };
        const hit = this.world.castRay(this.ray, FOOT + 0.45, true, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, c);
        if (hit) { this.ground = this.level.byCollider.get(hit.collider.handle) || null; if (this.ground) break; }
      }
      if (!this.ground) {
        for (let i = 0; i < this.ctrl.numComputedCollisions(); i++) {
          const col = this.ctrl.computedCollision(i);
          if (col?.collider && (col.normal1.y < -0.3 || col.normal2.y > 0.3)) {
            this.ground = this.level.byCollider.get(col.collider.handle) || null;
            if (this.ground) break;
          }
        }
      }
      if (this.ground?.behavior.type === 'crumble') this.level.triggerCrumble(this.ground);
    }

    // --- 着地・落下 ---
    if (!this.grounded) this.apexY = Math.max(this.apexY, ny);
    if (this.grounded && !wasGrounded) {
      this.events.onLand?.(this.apexY - ny, this.ground);
      this.apexY = ny;
    }
    if (this.grounded) this.apexY = ny;
    this.fallDist = this.grounded ? 0 : Math.max(0, this.apexY - ny);

    // 安全地点（つづきから用）
    this.safeTimer -= dt;
    if (this.grounded && this.ground && !this.ground.kinematic && !['bounce', 'rope'].includes(this.ground.surface) && this.safeTimer <= 0) {
      this.lastSafe.set(nx, ny + 0.05, nz); this.safeTimer = 0.4;
    }

    if (this.grounded) {
      this.stepDist += Math.hypot(mv.x - carryX, mv.z - carryZ);
      if (this.stepDist > 2.1) { this.stepDist = 0; this.events.onStep?.(); }
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.facing += this.platformYaw;
    if (hs > 0.6 && this.stun <= 0) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 14);
    }
    this.hSpeed = hs;
    this.onRope = onRope;
  }

  /** 描画フレーム毎：アニメーション＋手続き的ポーズ */
  updateVisual(dt) {
    const t = this.collider.translation();
    this.root.position.set(t.x, t.y, t.z);
    this.root.quaternion.setFromAxisAngle(UP, this.facing);
    const air = !this.grounded;
    if (this.dancing) this.play('Idle', 0.3);
    else if (air) this.play('Run', 0.25, 0.25);
    else if (this.hSpeed < 0.4) this.play('Idle', 0.2);
    else if (this.hSpeed < 4.5) this.play('Walk', 0.2, Math.max(0.6, this.hSpeed / 2.6));
    else this.play('Run', 0.2, this.hSpeed / 7.5);
    this.mixer.update(dt);

    // ポーズの重み
    const k = Math.min(1, dt * 10);
    const wantRise = air && this.vy > -6 ? 1 : 0;
    const wantFall = air && this.vy <= -6 ? Math.min(1, (-this.vy - 6) / 10) : 0;
    const wantBal = this.onRope ? 1 : 0;
    this.pose.rise += (wantRise - this.pose.rise) * k;
    this.pose.fall += (wantFall - this.pose.fall) * k;
    this.pose.balance += (wantBal - this.pose.balance) * k;
    const flail = Math.sin(performance.now() / 90);
    for (const [name, w0] of Object.entries(this.pose)) {
      if (w0 < 0.01) continue;
      for (const [bone, [axis, ang]] of Object.entries(POSES[name])) {
        const b = this.bones[bone]; if (!b) continue;
        const wob = name === 'fall' && bone.endsWith('Arm') ? 1 + flail * 0.25 : name === 'balance' && bone.endsWith('Arm') ? 1 + Math.sin(performance.now() / 400) * 0.12 : 1;
        this._pq.setFromAxisAngle(AX[axis], ang * w0 * wob);
        b.quaternion.multiply(this._pq);
      }
    }
  }

  dance() { this.dancing = true; }
  stopDance() { this.dancing = false; }
}
