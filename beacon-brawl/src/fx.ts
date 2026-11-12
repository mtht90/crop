import * as THREE from 'three';
import type { Unit } from './game';

interface Item { obj: THREE.Object3D; t: number; dur: number; tick(k: number, dt: number): void; dispose?: boolean }

const mat = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const flat = <T extends THREE.BufferGeometry>(g: T) => { g.rotateX(-Math.PI / 2); return g; };
const RING = flat(new THREE.RingGeometry(0.82, 1, 56));
const DISC = flat(new THREE.CircleGeometry(1, 48));
const ARC = flat(new THREE.RingGeometry(0.55, 1, 24, 1, -Math.PI / 2 - 1.0, 2.0));
const BALL = new THREE.SphereGeometry(1, 10, 8);
const BEAM = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);

/** 使い捨ての演出エフェクト */
export class Fx {
  group = new THREE.Group();
  private items: Item[] = [];

  private add(obj: THREE.Object3D, dur: number, tick: Item['tick']) {
    this.group.add(obj);
    this.items.push({ obj, t: 0, dur, tick });
    tick(0, 0);
    return obj;
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.tick(k, dt);
      if (k >= 1) {
        this.group.remove(it.obj);
        it.obj.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; m?.dispose(); });
        this.items.splice(i, 1);
      }
    }
  }

  clear() { for (const it of this.items) this.group.remove(it.obj); this.items = []; }

  ring(pos: THREE.Vector3, r: number, color: number, dur = 0.45) {
    const m = new THREE.Mesh(RING, mat(color));
    m.position.set(pos.x, 0.12, pos.z);
    this.add(m, dur, (k) => { const s = r * (0.25 + 0.75 * (1 - (1 - k) ** 3)); m.scale.set(s, 1, s); m.material.opacity = 1 - k; });
  }

  flash(pos: THREE.Vector3, r: number, color: number, dur = 0.25) {
    const m = new THREE.Mesh(BALL, mat(color, 0.9));
    m.position.copy(pos);
    this.add(m, dur, (k) => { m.scale.setScalar(r * (0.3 + 0.7 * k)); m.material.opacity = 0.9 * (1 - k); });
  }

  slash(pos: THREE.Vector3, yaw: number, r: number, color: number) {
    const m = new THREE.Mesh(ARC, mat(color));
    m.position.set(pos.x, 1.1, pos.z);
    this.add(m, 0.22, (k) => { m.rotation.y = yaw - 0.9 + k * 1.8; m.scale.set(r, 1, r); m.material.opacity = 1 - k * k; });
  }

  burst(pos: THREE.Vector3, color: number, n = 10, speed = 6) {
    const g = new THREE.Group();
    const material = mat(color);
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(BALL, material);
      s.scale.setScalar(0.1 + Math.random() * 0.12);
      s.position.set(pos.x, Math.max(0.3, pos.y), pos.z);
      const a = Math.random() * Math.PI * 2;
      vel.push(new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 1.2, Math.sin(a)).multiplyScalar(speed * (0.4 + Math.random() * 0.6)));
      g.add(s);
    }
    this.add(g, 0.6, (k, dt) => {
      g.children.forEach((c, i) => { vel[i].y -= 18 * dt; c.position.addScaledVector(vel[i], dt); if (c.position.y < 0.1) c.position.y = 0.1; });
      material.opacity = 1 - k;
    });
  }

  /** 攻撃予告の円 */
  telegraph(pos: THREE.Vector3, r: number, dur: number, color: number) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(DISC, mat(color, 0.18)); a.scale.set(r, 1, r);
    const b = new THREE.Mesh(DISC, mat(color, 0.3));
    const c = new THREE.Mesh(RING, mat(color, 0.9)); c.scale.set(r, 1, r);
    g.add(a, b, c);
    g.position.set(pos.x, 0.1, pos.z);
    this.add(g, dur, (k) => { const s = Math.max(0.01, r * k); b.scale.set(s, 1, s); });
  }

  pillar(pos: THREE.Vector3, color: number, width: number) {
    const m = new THREE.Mesh(BEAM, mat(color, 0.8));
    m.position.set(pos.x, 9, pos.z);
    this.add(m, 0.5, (k) => { const w = width * (1 - k * 0.8); m.scale.set(w, 18, w); m.material.opacity = 0.8 * (1 - k); });
  }

  trail(a: THREE.Vector3, b: THREE.Vector3, color: number) {
    const len = a.distanceTo(b);
    if (len < 0.1) return;
    const m = new THREE.Mesh(BEAM, mat(color, 0.9));
    m.position.copy(a).add(b).multiplyScalar(0.5); m.position.y = 1.1;
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize());
    this.add(m, 0.3, (k) => { const w = 0.35 * (1 - k); m.scale.set(w, len, w); m.material.opacity = 0.9 * (1 - k); });
  }

  /** ユニットに追従するオーラ（バフ表示） */
  aura(u: Unit, color: number, dur: number) {
    const m = new THREE.Mesh(RING, mat(color, 0.8));
    this.add(m, dur, (k) => {
      m.visible = u.alive;
      m.position.set(u.pos.x, 0.15 + ((k * dur * 1.4) % 1) * 2.2, u.pos.z);
      const s = 1.1 - ((k * dur * 1.4) % 1) * 0.3; m.scale.set(s, 1, s);
      m.material.opacity = 0.8 * (1 - ((k * dur * 1.4) % 1));
    });
  }

  /** 持続する地面の領域 */
  zone(pos: THREE.Vector3, r: number, dur: number, color: number) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(DISC, mat(color, 0.22)); a.scale.set(r, 1, r);
    const c = new THREE.Mesh(RING, mat(color, 0.8)); c.scale.set(r, 1, r);
    g.add(a, c);
    g.position.set(pos.x, 0.1, pos.z);
    this.add(g, dur, (k) => { a.material.opacity = (0.16 + 0.08 * Math.sin(k * dur * 9)) * Math.min(1, (1 - k) * 5); c.material.opacity = 0.8 * Math.min(1, (1 - k) * 5); });
  }
}
