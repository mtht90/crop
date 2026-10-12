// 一人称で歩くプレイヤー
import * as THREE from 'three';
import { resolveCircle } from './town.js';

export class Player {
  constructor(camera) {
    this.cam = camera;
    this.x = 0; this.z = 0; this.y = 0; // y は床の高さ（アパート2階なら 3）
    this.yaw = 0; this.pitch = 0;
    this.bob = 0; this.step = 0;
    this.zone = null; // 2階の廊下など、動ける範囲の制限 {x0,x1,z0,z1}
    this.onStep = null;
  }
  look(dx, dy, sens = 1) {
    this.yaw -= dx * 0.0022 * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022 * sens, -1.45, 1.45);
  }
  get dir() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  get eye() { return new THREE.Vector3(this.x, this.y + 1.62 + Math.sin(this.bob) * 0.025, this.z); }

  update(dt, keys, van, speedMul = 1) {
    let fx = 0, fz = 0;
    if (keys.KeyW || keys.ArrowUp) fz -= 1;
    if (keys.KeyS || keys.ArrowDown) fz += 1;
    if (keys.KeyA || keys.ArrowLeft) fx -= 1;
    if (keys.KeyD || keys.ArrowRight) fx += 1;
    // タッチのスティック（倒した量で速さが変わる）
    let analog = 1;
    if (!fx && !fz && (keys._mx || keys._my)) { fx = keys._mx; fz = keys._my; analog = Math.min(1, Math.hypot(fx, fz)); }
    const len = Math.hypot(fx, fz);
    const run = keys.ShiftLeft || keys.ShiftRight;
    const sp = (run ? 3.8 : 1.7) * speedMul * analog;
    if (len > 0.08) {
      fx /= len; fz /= len;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const mx = (fx * c + fz * s) * sp * dt, mz = (-fx * s + fz * c) * sp * dt;
      const p = { x: this.x + mx, z: this.z + mz };
      if (this.y < 0.5) {
        resolveCircle(p, 0.28);
        if (van) for (const c2 of van.circles()) {
          const dx = p.x - c2.x, dz = p.z - c2.z, d = Math.hypot(dx, dz), R = 0.28 + c2.r - 0.06;
          if (d < R && d > 0.001) { p.x += dx / d * (R - d); p.z += dz / d * (R - d); }
        }
      }
      if (this.zone) {
        // 動ける範囲は建物の向きに合わせた長方形（ローカル座標で制限する）
        const z = this.zone, c = Math.cos(z.rot || 0), s = Math.sin(z.rot || 0);
        const dx = p.x - (z.cx || 0), dz = p.z - (z.cz || 0);
        let lx = dx * c - dz * s, lz = dx * s + dz * c;
        lx = THREE.MathUtils.clamp(lx, z.x0, z.x1); lz = THREE.MathUtils.clamp(lz, z.z0, z.z1);
        p.x = (z.cx || 0) + lx * c + lz * s; p.z = (z.cz || 0) - lx * s + lz * c;
      }
      const moved = Math.hypot(p.x - this.x, p.z - this.z);
      this.x = p.x; this.z = p.z;
      this.bob += moved * (run ? 4.2 : 5.5);
      this.step += moved;
      if (this.step > (run ? 1.6 : 1.25)) { this.step = 0; this.onStep && this.onStep(); }
    }
    this.apply();
  }
  apply() {
    this.cam.position.copy(this.eye);
    this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
