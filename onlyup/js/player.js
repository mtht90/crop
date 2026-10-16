import * as THREE from 'three';
import { PHYS } from './level.js';

const HALF = 0.55, RADIUS = 0.35, FOOT = HALF + RADIUS; // カプセル中心→足元
const UP = new THREE.Vector3(0, 1, 0);

export class Player {
  constructor({ RAPIER, world, scene, gltf, level, events }) {
    Object.assign(this, { RAPIER, world, level, events });
    this.difficulty = 'normal';

    // ---- Rapier キネマティック・キャラクターコントローラー ----
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF, RADIUS).setTranslation(0, 10, 0));
    this.ctrl = world.createCharacterController(0.02);
    this.ctrl.enableAutostep(0.35, 0.25, false);
    this.ctrl.enableSnapToGround(0.25);
    this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(52));
    this.ctrl.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(60));
    this.ctrl.setSlideEnabled(true);
    this.ctrl.setUp({ x: 0, y: 1, z: 0 });

    // ---- モデル ----
    this.root = new THREE.Group();
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (o.material) o.material.envMapIntensity = 1.2;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const s = 1.8 / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    box.setFromObject(model);
    model.position.y = -box.min.y - FOOT;
    this.model = model;
    this.root.add(model);
    scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const n of ['Jump', 'Death', 'Wave', 'ThumbsUp']) {
      if (this.actions[n]) { this.actions[n].setLoop(THREE.LoopOnce, 1); this.actions[n].clampWhenFinished = true; }
    }
    this.current = null;
    this.play('Idle', 0);

    // ---- 状態 ----
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0; this.jumpBuf = 0; this.airJumps = 0;
    this.stun = 0;
    this.facing = 0;
    this.apexY = 0;
    this.stepDist = 0;
    this.lastSafe = new THREE.Vector3(0, 5, 0);
    this.safeTimer = 0;
    this.frozen = false;
    this.platformYaw = 0;

    this._pos = new THREE.Vector3(); this._feet = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this._wind = new THREE.Vector3(); this._wish = new THREE.Vector3(); this._target = new THREE.Vector3();
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  get position() { const t = this.collider.translation(); return this._pos.set(t.x, t.y, t.z); }
  get feetY() { return this.collider.translation().y - FOOT; }

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
    const speed = (input.sprint ? PHYS.SPRINT : PHYS.RUN) * mag;
    const target = this._target.copy(wish).multiplyScalar(speed);

    const ice = this.grounded && this.ground?.surface === 'ice';
    let accel = this.grounded ? (ice ? 4.5 : 42) : 16;
    if (this.stun > 0) { accel = this.grounded ? 6 : 0.5; this.stun -= dt; }
    const dvx = target.x - this.vel.x, dvz = target.z - this.vel.z;
    const dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
    if (dl <= maxDv) { this.vel.x = target.x; this.vel.z = target.z; }
    else { this.vel.x += (dvx / dl) * maxDv; this.vel.z += (dvz / dl) * maxDv; }

    // 突風
    this.level.windAt(pos, time, this._wind);
    if (this._wind.lengthSq() > 0) {
      this.vel.addScaledVector(this._wind, dt);
      this.inWind = true;
    } else this.inWind = false;

    // 薙ぎ払いバー
    for (const hz of this.level.hazards) {
      const fy = pos.y - FOOT;
      if (fy > hz.top + 0.72 || fy < hz.top - 0.4) continue;
      const lx = pos.x - hz.p.base.x, lz = pos.z - hz.p.base.z;
      const ax = Math.cos(hz.angle), az = -Math.sin(hz.angle);
      const along = THREE.MathUtils.clamp(lx * ax + lz * az, -hz.len / 2, hz.len / 2);
      const px = lx - ax * along, pz = lz - az * along;
      if (Math.hypot(px, pz) < 0.22 + RADIUS && this.stun <= 0) {
        // 接線方向へ吹き飛ばす
        const sgn = Math.sign(hz.speed);
        let kx = lz * sgn, kz = -lx * sgn;
        const kl = Math.hypot(kx, kz) || 1;
        kx /= kl; kz /= kl;
        const out = Math.hypot(lx, lz) || 1;
        this.vel.set(kx * 9 + (lx / out) * 4, 0, kz * 9 + (lz / out) * 4);
        this.vy = 7.5; this.grounded = false; this.stun = 0.6;
        this.events.onHit?.();
      }
    }

    // --- 縦方向 ---
    if (input.jumpPressed) this.jumpBuf = 0.14;
    this.jumpBuf -= dt;
    if (this.grounded) {
      this.coyote = 0.12;
      this.airJumps = this.difficulty === 'easy' ? 1 : 0;
      if (this.vy < 0) this.vy = -2;
      if (this.ground?.surface === 'bounce') {
        this.vy = this.ground.bounceV || 18;
        this.grounded = false; this.coyote = 0;
        this.ground.pad && (this.ground.pad.material.uniforms.uKick.value = 1);
        this.events.onBounce?.(this.ground);
      }
    } else {
      this.coyote -= dt;
      const g = (!input.jumpHeld && this.vy > 0) ? PHYS.G * 1.9 : PHYS.G;
      this.vy = Math.max(this.vy - g * dt, -55);
    }
    if (this.jumpBuf > 0) {
      if (this.grounded || this.coyote > 0) {
        this.vy = PHYS.JUMP_V; this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
        // 足場の速度を少し引き継ぐ
        if (this.ground?.kinematic) { this.vel.x += carryX / dt * 0.8; this.vel.z += carryZ / dt * 0.8; this.vy += Math.max(0, carryY / dt) * 0.8; }
        this.events.onJump?.(false);
      } else if (this.airJumps > 0) {
        this.vy = PHYS.JUMP_V * 0.92; this.airJumps--; this.jumpBuf = 0;
        this.events.onJump?.(true);
      }
    }

    // --- KCC ---
    const desired = { x: this.vel.x * dt + carryX, y: this.vy * dt + carryY, z: this.vel.z * dt + carryZ };
    this.ctrl.computeColliderMovement(c, desired, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv = this.ctrl.computedMovement();
    const nx = t.x + mv.x, ny = t.y + mv.y, nz = t.z + mv.z;
    c.setTranslation({ x: nx, y: ny, z: nz });

    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded() && this.vy <= 0.01;
    if (this.vy > 0 && mv.y - carryY < this.vy * dt * 0.4) this.vy = 0; // 頭ぶつけ
    // 壁に当たったら横速度を削る
    if (Math.abs(mv.x - carryX) < Math.abs(this.vel.x * dt) * 0.5) this.vel.x *= 0.5;
    if (Math.abs(mv.z - carryZ) < Math.abs(this.vel.z * dt) * 0.5) this.vel.z *= 0.5;

    // --- 地面の足場判定 ---
    this.ground = null;
    if (this.grounded) {
      this.ray.origin = { x: nx, y: ny, z: nz };
      const hit = this.world.castRay(this.ray, FOOT + 0.45, true, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, c);
      if (hit) this.ground = this.level.byCollider.get(hit.collider.handle) || null;
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

    // --- 着地・落下イベント ---
    if (!this.grounded) this.apexY = Math.max(this.apexY, ny);
    if (this.grounded && !wasGrounded) {
      const drop = this.apexY - ny;
      this.events.onLand?.(drop, this.ground);
      this.apexY = ny;
    }
    if (this.grounded) this.apexY = ny;

    // 安全地点（かんたんの自動救助・つづきから用）
    this.safeTimer -= dt;
    if (this.grounded && this.ground && !this.ground.kinematic && this.ground.surface !== 'bounce' && this.safeTimer <= 0) {
      this.lastSafe.set(nx, ny + 0.05, nz); this.safeTimer = 0.4;
    }

    // 足音
    if (this.grounded) {
      this.stepDist += Math.hypot(mv.x - carryX, mv.z - carryZ);
      if (this.stepDist > 2.1) { this.stepDist = 0; this.events.onStep?.(); }
    }

    // 向き
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.facing += this.platformYaw;
    if (hs > 0.6 && this.stun <= 0) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 14);
    }
    this.hSpeed = hs;
  }

  /** 描画フレーム毎：補間とアニメーション */
  updateVisual(dt) {
    const t = this.collider.translation();
    this.root.position.set(t.x, t.y, t.z);
    this.root.quaternion.setFromAxisAngle(UP, this.facing);
    if (!this.frozen && !this.dancing) {
      if (!this.grounded) this.play('Jump', 0.12, 1.1);
      else if (this.hSpeed < 0.4) this.play('Idle', 0.2);
      else if (this.hSpeed < 4.5) this.play('Walking', 0.2, Math.max(0.6, this.hSpeed / 3));
      else this.play('Running', 0.2, this.hSpeed / 7.5);
    }
    this.mixer.update(dt);
  }

  dance() { this.dancing = true; this.play('Dance', 0.3); }
  stopDance() { this.dancing = false; }
}
