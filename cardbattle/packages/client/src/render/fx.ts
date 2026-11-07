import * as THREE from 'three/webgpu';

interface Burst {
  mesh: THREE.InstancedMesh;
  velocities: THREE.Vector3[];
  positions: THREE.Vector3[];
  life: number;
  maxLife: number;
  gravity: number;
  size: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  from: number;
  to: number;
}

/**
 * 仮のエフェクト（Kenney Particle Pack が届くまでの代用）。
 * 形は単純な板・リング・破片だけで、テクスチャは使わない。
 */
export class Fx {
  private readonly bursts: Burst[] = [];
  private readonly rings: Ring[] = [];
  private readonly cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly ringGeo = new THREE.RingGeometry(0.8, 1, 48);
  private readonly discGeo = new THREE.CircleGeometry(1, 48);
  private readonly dummy = new THREE.Object3D();

  constructor(private readonly scene: THREE.Scene) {}

  /** 破片が飛び散る */
  burst(at: THREE.Vector3, color: THREE.ColorRepresentation, count = 12, speed = 4, size = 0.18, life = 0.6, gravity = 12): void {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: color, emissiveIntensity: 0.25 });
    const mesh = new THREE.InstancedMesh(this.cubeGeo, mat, count);
    mesh.castShadow = true;
    const velocities: THREE.Vector3[] = [];
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const s = speed * (0.5 + Math.random() * 0.7);
      velocities.push(new THREE.Vector3(Math.cos(a) * s, up * s, Math.sin(a) * s));
      positions.push(at.clone());
    }
    this.scene.add(mesh);
    this.bursts.push({ mesh, velocities, positions, life: life, maxLife: life, gravity, size });
  }

  /** 地面に広がるリング（着地・範囲攻撃の衝撃） */
  ring(at: THREE.Vector3, color: THREE.ColorRepresentation, from: number, to: number, life = 0.35, filled = false): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(filled ? this.discGeo : this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, at.y + 0.08, at.z);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    this.rings.push({ mesh, life, maxLife: life, from, to });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const k = Math.max(0, b.life / b.maxLife);
      for (let j = 0; j < b.positions.length; j++) {
        const v = b.velocities[j];
        const p = b.positions[j];
        v.y -= b.gravity * dt;
        p.addScaledVector(v, dt);
        if (p.y < 0.05) {
          p.y = 0.05;
          v.multiplyScalar(0.4);
          v.y = Math.abs(v.y) * 0.3;
        }
        this.dummy.position.copy(p);
        this.dummy.rotation.set(p.x * 3, p.z * 2, j);
        this.dummy.scale.setScalar(b.size * (0.4 + 0.6 * k));
        this.dummy.updateMatrix();
        b.mesh.setMatrixAt(j, this.dummy.matrix);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        b.mesh.dispose();
        this.bursts.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - Math.max(0, r.life / r.maxLife);
      const eased = 1 - (1 - t) * (1 - t);
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * eased);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const b of this.bursts) this.scene.remove(b.mesh);
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.bursts.length = 0;
    this.rings.length = 0;
  }
}
