import * as THREE from 'three';
import type { Input } from '../core/input';
import type { Collider } from './common';
import { DOCK, onDock, terrainHeight, waterDepth } from './shape';

const EYE = 1.62;

/** 一人称の徒歩移動 */
export class Player {
  x: number;
  z: number;
  y = 0;
  yaw: number;
  pitch = -0.05;
  private bob = 0;

  constructor(
    x: number,
    z: number,
    yaw: number,
    private colliders: Collider[],
  ) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.y = this.groundAt(x, z);
  }

  groundAt(x: number, z: number): number {
    return onDock(x, z) ? DOCK.deckY : terrainHeight(x, z);
  }

  canStand(x: number, z: number): boolean {
    if (Math.hypot(x, z) > 330) return false;
    for (const c of this.colliders) {
      if (Math.abs(c.x - x) < c.r + 0.4 && Math.abs(c.z - z) < c.r + 0.4 && Math.hypot(c.x - x, c.z - z) < c.r + 0.35) return false;
    }
    if (onDock(x, z)) return true;
    return waterDepth(x, z) <= 0.35;
  }

  /** 釣り場を移った時に障害物を差し替える */
  setColliders(c: Collider[]): void {
    this.colliders = c;
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  look(input: Input, sensitivity: number, yawLimit?: { center: number; range: number }): void {
    this.yaw -= input.mouseDX * 0.0022 * sensitivity;
    this.pitch -= input.mouseDY * 0.0022 * sensitivity;
    this.pitch = Math.max(-1.3, Math.min(1.2, this.pitch));
    if (yawLimit) {
      let d = this.yaw - yawLimit.center;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      d = Math.max(-yawLimit.range, Math.min(yawLimit.range, d));
      this.yaw = yawLimit.center + d;
    }
  }

  move(input: Input, dt: number): void {
    const f = this.forward();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const ax = input.moveAxes();
    const v = new THREE.Vector3().addScaledVector(f, ax.y).addScaledVector(r, ax.x);
    const amount = Math.min(1, v.length());
    if (amount > 0.05) {
      const speed = (ax.run ? 6.2 : 3.2) * amount;
      v.normalize().multiplyScalar(speed * dt);
      // 軸ごとに判定して壁に沿って滑らせる
      if (this.canStand(this.x + v.x, this.z)) this.x += v.x;
      if (this.canStand(this.x, this.z + v.z)) this.z += v.z;
      this.bob += dt * (speed > 4 ? 13 : 9);
    }
    const g = this.groundAt(this.x, this.z);
    this.y += (g - this.y) * Math.min(1, dt * 12);
  }

  applyTo(camera: THREE.PerspectiveCamera, bobAmount = 1): void {
    const bob = Math.sin(this.bob) * 0.035 * bobAmount;
    camera.position.set(this.x, this.y + EYE + bob, this.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y + EYE, this.z);
  }
}
