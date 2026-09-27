import * as THREE from 'three';
import { input } from '../core/input';
import { audio } from '../core/audio';
import { clamp, damp } from '../core/util';
import type { Collider } from '../world/shop';

const EYE = 1.62;
const RADIUS = 0.28;

/** 一人称プレイヤー。カメラ操作と壁・什器との当たり判定 */
export class Player {
  readonly pos = new THREE.Vector3();
  yaw = Math.PI;
  pitch = -0.08;
  private vel = new THREE.Vector3();
  private bobT = 0;
  private stepAcc = 0;
  /** カメラ演出中 (査定のクローズアップなど) は操作を止める */
  frozen = false;
  private camOverride: { pos: THREE.Vector3; look: THREE.Vector3; t: number } | null = null;

  constructor(private camera: THREE.PerspectiveCamera, private colliders: () => Collider[]) {}

  spawn(p: THREE.Vector3, yaw: number) {
    this.pos.copy(p);
    this.yaw = yaw;
    this.pitch = -0.08;
  }

  /** カメラを一時的に別の場所へ (null で戻す) */
  focus(pos: THREE.Vector3 | null, look?: THREE.Vector3) {
    this.camOverride = pos && look ? { pos: pos.clone(), look: look.clone(), t: 0 } : null;
  }

  update(dt: number) {
    if (!this.frozen && input.active) {
      const sens = 0.0022 * input.sensitivity;
      this.yaw -= input.mouseDX * sens;
      this.pitch -= input.mouseDY * sens * (input.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }
    const move = new THREE.Vector3();
    if (!this.frozen) {
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) move.z -= 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) move.z += 1;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) move.x -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) move.x += 1;
    }
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = running ? 5.2 : 3.3;
    if (move.lengthSq() > 0) move.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiplyScalar(speed);
    this.vel.x = damp(this.vel.x, move.x, 14, dt);
    this.vel.z = damp(this.vel.z, move.z, 14, dt);
    const step = this.vel.clone().multiplyScalar(dt);
    // 軸ごとに移動して押し戻し
    this.pos.x += step.x;
    this.resolve();
    this.pos.z += step.z;
    this.resolve();

    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bobT += dt * moving * 2.4;
    this.stepAcc += moving * dt;
    if (this.stepAcc > (running ? 0.85 : 0.7)) {
      this.stepAcc = 0;
      audio.play('thud', { volume: 0.12, rate: 1.6 });
    }

    const eye = new THREE.Vector3(this.pos.x, EYE + Math.sin(this.bobT * 2) * 0.025 * Math.min(1, moving / 3), this.pos.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    if (this.camOverride) {
      const o = this.camOverride;
      o.t = Math.min(1, o.t + dt * 2.5);
      const k = o.t * o.t * (3 - 2 * o.t);
      this.camera.position.lerpVectors(eye, o.pos, k);
      const m = new THREE.Matrix4().lookAt(o.pos, o.look, new THREE.Vector3(0, 1, 0));
      const q2 = new THREE.Quaternion().setFromRotationMatrix(m);
      this.camera.quaternion.slerpQuaternions(q, q2, k);
    } else {
      this.camera.position.copy(eye);
      this.camera.quaternion.copy(q);
    }
  }

  private resolve() {
    for (const c of this.colliders()) {
      const cx = clamp(this.pos.x, c.x0, c.x1);
      const cz = clamp(this.pos.z, c.z0, c.z1);
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          this.pos.x = cx + (dx / d) * RADIUS;
          this.pos.z = cz + (dz / d) * RADIUS;
        } else {
          // 中心が箱の中: 最短の辺へ押し出す
          const pen = [this.pos.x - c.x0, c.x1 - this.pos.x, this.pos.z - c.z0, c.z1 - this.pos.z];
          const i = pen.indexOf(Math.min(...pen));
          if (i === 0) this.pos.x = c.x0 - RADIUS;
          else if (i === 1) this.pos.x = c.x1 + RADIUS;
          else if (i === 2) this.pos.z = c.z0 - RADIUS;
          else this.pos.z = c.z1 + RADIUS;
        }
      }
    }
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
}
