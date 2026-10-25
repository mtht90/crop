import * as THREE from 'three';

interface Drop {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
}

interface Ripple {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size: number;
}

/** 水しぶきと波紋 */
export class WaterEffects {
  private drops: Drop[] = [];
  private points: THREE.Points;
  private posArr: Float32Array;
  private ripples: Ripple[] = [];
  private ringGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
  private readonly MAX = 600;

  constructor(private scene: THREE.Scene) {
    this.posArr = new Float32Array(this.MAX * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xe8f2f6, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  splash(x: number, z: number, size: number): void {
    const n = Math.min(160, Math.floor(12 + size * 60));
    for (let i = 0; i < n && this.drops.length < this.MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 1.8) * (0.6 + size * 0.8);
      const life = 0.5 + Math.random() * 0.6;
      this.drops.push({
        p: new THREE.Vector3(x + Math.cos(a) * 0.1 * size, 0.05, z + Math.sin(a) * 0.1 * size),
        v: new THREE.Vector3(Math.cos(a) * sp * 0.45, (2 + Math.random() * 3) * (0.5 + size * 0.6), Math.sin(a) * sp * 0.45),
        life,
        max: life,
      });
    }
    this.ripple(x, z, size);
  }

  /** 空中の物（釣り上げた魚など）から滴る水 */
  drip(p: THREE.Vector3, n: number, spread: number): void {
    for (let i = 0; i < n && this.drops.length < this.MAX; i++) {
      const life = 0.4 + Math.random() * 0.5;
      this.drops.push({
        p: new THREE.Vector3(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread * 0.5, p.z + (Math.random() - 0.5) * spread),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8),
        life,
        max: life,
      });
    }
  }

  ripple(x: number, z: number, size: number): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0xdfeef2, transparent: true, opacity: 0.6, depthWrite: false });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(x, 0.04, z);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.ripples.push({ mesh, life: 0, max: 1.6 + size, size: 0.4 + size * 1.5 });
  }

  update(dt: number): void {
    let k = 0;
    for (const d of this.drops) {
      d.life -= dt;
      if (d.life <= 0 || d.p.y < -0.05) continue;
      d.v.y -= 9.8 * dt;
      d.p.addScaledVector(d.v, dt);
      this.posArr[k * 3] = d.p.x;
      this.posArr[k * 3 + 1] = d.p.y;
      this.posArr[k * 3 + 2] = d.p.z;
      this.drops[k++] = d;
    }
    this.drops.length = k;
    this.points.geometry.setDrawRange(0, k);
    this.points.geometry.getAttribute('position').needsUpdate = true;

    this.ripples = this.ripples.filter((r) => {
      r.life += dt;
      const t = r.life / r.max;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      r.mesh.scale.setScalar(0.2 + r.size * Math.sqrt(t) * 2);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
      return true;
    });
  }
}
