import * as THREE from 'three/webgpu';
import { assets } from '../assets/assets';

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size0: number;
  size1: number;
  gravity: number;
  spin: number;
  alpha: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  from: number;
  to: number;
  opacity: number;
}

export interface BurstOptions {
  texture?: string;
  count?: number;
  speed?: number;
  size?: number;
  endSize?: number;
  life?: number;
  gravity?: number;
  up?: number;
  spread?: number;
  additive?: boolean;
  alpha?: number;
}

/**
 * エフェクト。Kenney Particle Pack のテクスチャをスプライトで飛ばす。
 * テクスチャが無い場合（素材の加工前）は白い四角のスプライトになる。
 */
export class Fx {
  private readonly particles: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly materials = new Map<string, THREE.SpriteMaterial>();
  private readonly ringGeo = new THREE.RingGeometry(0.8, 1, 48);
  private readonly discGeo = new THREE.CircleGeometry(1, 48);

  constructor(private readonly scene: THREE.Scene) {}

  private material(texture: string, color: THREE.ColorRepresentation, additive: boolean): THREE.SpriteMaterial {
    const c = new THREE.Color(color);
    const key = `${texture}|${c.getHexString()}|${additive}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({
        map: assets.texture(texture) ?? null,
        color: c,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.materials.set(key, m);
    }
    return m;
  }

  /** 粒を飛び散らせる */
  burst(at: THREE.Vector3, color: THREE.ColorRepresentation, o: BurstOptions = {}): void {
    const count = o.count ?? 10;
    const tex = o.texture ?? 'star';
    const additive = o.additive ?? true;
    for (let i = 0; i < count; i++) {
      // 個々の粒は同じマテリアルを共有し、透明度は scale で表現する（マテリアル数を増やさない）
      const sprite = new THREE.Sprite(this.material(tex, color, additive));
      sprite.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const spread = o.spread ?? 1;
      const s = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
      const vel = new THREE.Vector3(Math.cos(a) * s * spread, (o.up ?? 0.8) * s * (0.5 + Math.random()), Math.sin(a) * s * spread);
      const size = (o.size ?? 0.5) * (0.7 + Math.random() * 0.6);
      sprite.scale.setScalar(size);
      sprite.material.rotation = 0;
      sprite.renderOrder = 6;
      this.scene.add(sprite);
      const life = (o.life ?? 0.6) * (0.7 + Math.random() * 0.5);
      this.particles.push({
        sprite,
        vel,
        life,
        maxLife: life,
        size0: size,
        size1: (o.endSize ?? 0.2) * size,
        gravity: o.gravity ?? 6,
        spin: (Math.random() - 0.5) * 4,
        alpha: o.alpha ?? 1,
      });
    }
  }

  /** 1枚だけ大きく出す（閃光・爆発の芯など） */
  flash(at: THREE.Vector3, texture: string, color: THREE.ColorRepresentation, size: number, life = 0.25, endSize = 1.4): void {
    this.burst(at, color, { texture, count: 1, speed: 0, size, endSize, life, gravity: 0, up: 0 });
  }

  /** 地面に広がるリング（着地・範囲攻撃の衝撃） */
  ring(at: THREE.Vector3, color: THREE.ColorRepresentation, from: number, to: number, life = 0.35, filled = false, opacity = 0.8): void {
    const tex = filled ? undefined : assets.texture('circle');
    const mat = new THREE.MeshBasicMaterial({
      color,
      map: tex ?? null,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const geo = tex ? new THREE.PlaneGeometry(2.4, 2.4) : filled ? this.discGeo : this.ringGeo;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, at.y + 0.08, at.z);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    this.rings.push({ mesh, life, maxLife: life, from, to, opacity });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      const t = 1 - Math.max(0, p.life / p.maxLife);
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-dt * 1.5));
      p.sprite.position.addScaledVector(p.vel, dt);
      if (p.sprite.position.y < 0.05) {
        p.sprite.position.y = 0.05;
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      // フェードアウトは大きさで表現（最後は小さくなって消える）
      const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      p.sprite.scale.setScalar(Math.max(0.001, (p.size0 + (p.size1 - p.size0) * t) * (0.3 + 0.7 * fade) * p.alpha));
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - Math.max(0, r.life / r.maxLife);
      const eased = 1 - (1 - t) * (1 - t);
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * eased);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.opacity * (1 - t);
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.particles) this.scene.remove(p.sprite);
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.particles.length = 0;
    this.rings.length = 0;
  }
}
