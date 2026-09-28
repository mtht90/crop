import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Audio } from '../core/Audio';
import type { Collision } from '../world/Collision';
import type { Box } from '../game/Boxes';

export type Held = { kind: 'box'; box: Box } | { kind: 'mop'; mesh: THREE.Object3D } | null;

/**
 * First-person controller: WASD + mouse look with pointer lock, head bob,
 * footsteps, collision against the floor plan and a "hands" anchor that
 * shows whatever the player carries.
 */
export class Player {
  readonly position = new THREE.Vector3(5.2, 0, -6.4);
  yaw = Math.PI;
  pitch = -0.05;
  readonly eye = 1.62;
  private bob = 0;
  private stepAcc = 0;
  private vel = new THREE.Vector3();
  held: Held = null;
  readonly hands = new THREE.Group();
  /** When set, the camera is animated to this pose (register / PC). */
  focus: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private focusT = 0;
  private focusFrom = new THREE.Vector3();
  private focusQuatFrom = new THREE.Quaternion();
  frozen = false;
  private raycaster = new THREE.Raycaster();

  constructor(private camera: THREE.PerspectiveCamera, private input: Input, private audio: Audio, private col: Collision) {
    camera.add(this.hands);
    this.hands.position.set(0.26, -0.3, -0.55);
  }

  setHeld(h: Held): void {
    this.hands.clear();
    this.held = h;
    if (!h) return;
    if (h.kind === 'box') {
      const m = h.box.mesh;
      m.position.set(-0.1, -0.08, -0.05);
      m.rotation.set(0.15, 0.25, 0);
      this.hands.add(m);
    } else {
      h.mesh.position.set(0.05, -0.2, -0.1);
      h.mesh.rotation.set(-0.5, 0.2, 0.25);
      this.hands.add(h.mesh);
    }
  }

  setFocus(pos: THREE.Vector3 | null, look?: THREE.Vector3): void {
    if (pos && look) {
      this.focus = { pos: pos.clone(), look: look.clone() };
      this.focusT = 0;
      this.focusFrom.copy(this.camera.position);
      this.focusQuatFrom.copy(this.camera.quaternion);
    } else {
      this.focus = null;
    }
  }

  update(dt: number): void {
    const cam = this.camera;
    if (this.focus) {
      this.focusT = Math.min(1, this.focusT + dt * 3);
      const t = 1 - Math.pow(1 - this.focusT, 3);
      cam.position.lerpVectors(this.focusFrom, this.focus.pos, t);
      const m = new THREE.Matrix4().lookAt(this.focus.pos, this.focus.look, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerpQuaternions(this.focusQuatFrom, q, t);
      return;
    }
    if (!this.frozen) {
      const sens = 0.0022 * this.input.sensitivity;
      this.yaw -= this.input.mouseDX * sens;
      this.pitch -= this.input.mouseDY * sens;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
      const fwd = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
      const strafe = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
      const run = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
      const speed = run ? 4.4 : 2.6;
      const dir = new THREE.Vector3(strafe, 0, -fwd);
      if (dir.lengthSq() > 0) dir.normalize();
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const target = dir.multiplyScalar(speed);
      this.vel.lerp(target, Math.min(1, dt * 12));
    } else {
      this.vel.multiplyScalar(0.8);
    }
    this.position.addScaledVector(this.vel, dt);
    this.col.resolve(this.position, 0.3);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.3) {
      this.bob += dt * sp * 3.1;
      this.stepAcc += sp * dt;
      if (this.stepAcc > 0.75) {
        this.stepAcc = 0;
        const outside = this.position.z > 5.1;
        this.audio.play((['step0', 'step1', 'step2', 'step3'] as const)[Math.floor(Math.random() * 4)], { volume: outside ? 0.5 : 0.35, rate: outside ? 0.9 : 1.05 });
      }
    } else {
      this.bob *= 0.9;
    }
    const bobY = Math.sin(this.bob * 2) * 0.025 * Math.min(1, sp / 2);
    const bobX = Math.cos(this.bob) * 0.015 * Math.min(1, sp / 2);
    cam.position.set(this.position.x, this.eye + bobY, this.position.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    this.hands.position.set(0.26 + bobX, -0.3 + bobY * 0.6, -0.55);
  }

  /** Camera-centre ray (or cursor ray when unlocked). */
  ray(useCursor: boolean): THREE.Raycaster {
    if (useCursor) this.raycaster.setFromCamera(new THREE.Vector2(this.input.ndcX, this.input.ndcY), this.camera);
    else this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    return this.raycaster;
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  lookAtPoint(p: THREE.Vector3): void {
    const d = p.clone().sub(new THREE.Vector3(this.position.x, this.eye, this.position.z));
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
}
