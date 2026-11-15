import * as THREE from 'three';
import { assets, type TexKey } from './assets';

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size0: number;
  size1: number;
  grav: number;
  alpha: number;
  sheet?: { cols: number; rows: number; frames: number };
  spin: number;
}

interface Decal {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size0: number;
  size1: number;
  alpha: number;
}

/** 外部テクスチャ（フレア・マズルフラッシュ・着弾シート）を使ったスプライト演出 */
export class FX {
  scene: THREE.Scene;
  parts: Particle[] = [];
  decals: Decal[] = [];
  mats = new Map<string, THREE.SpriteMaterial>();
  impactTex!: THREE.Texture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private mat(tex: TexKey, additive = true) {
    const key = tex + additive;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({
        map: assets.texture(tex),
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
        transparent: true,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  spawn(
    tex: TexKey,
    pos: THREE.Vector3,
    o: { vel?: THREE.Vector3; life?: number; size?: number; size1?: number; color?: THREE.ColorRepresentation; grav?: number; alpha?: number; additive?: boolean; sheet?: boolean },
  ) {
    let mat = this.mat(tex, o.additive ?? true).clone();
    if (o.sheet) {
      const t = assets.texture('impact').clone();
      t.repeat.set(1 / 5, 1 / 3);
      t.needsUpdate = true;
      mat.map = t;
    }
    mat.color.set(o.color ?? 0xffffff);
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    const size = o.size ?? 0.5;
    s.scale.setScalar(size);
    s.renderOrder = 10;
    this.scene.add(s);
    this.parts.push({
      sprite: s,
      vel: o.vel?.clone() ?? new THREE.Vector3(),
      life: 0,
      max: o.life ?? 0.4,
      size0: size,
      size1: o.size1 ?? size,
      grav: o.grav ?? 0,
      alpha: o.alpha ?? 1,
      sheet: o.sheet ? { cols: 5, rows: 3, frames: 15 } : undefined,
      spin: (Math.random() - 0.5) * 4,
    });
    return s;
  }

  /** 地面に寝かせた衝撃波リング */
  ring(pos: THREE.Vector3, radius: number, life: number, color: THREE.ColorRepresentation = 0xffc080) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: assets.texture('ring'),
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).add(new THREE.Vector3(0, 0.15, 0));
    this.scene.add(m);
    this.decals.push({ mesh: m, life: 0, max: life, size0: 0.5, size1: radius * 2.2, alpha: 1 });
    return m;
  }

  muzzle(pos: THREE.Vector3, color: THREE.ColorRepresentation = 0xffd090, big = false) {
    this.spawn('muzzle', pos, { life: 0.06, size: big ? 0.9 : 0.55, size1: big ? 1.1 : 0.7, color });
  }

  impact(pos: THREE.Vector3, normal: THREE.Vector3, kind: 'flesh' | 'weak' | 'armor' | 'ground', color?: number) {
    if (kind === 'ground') {
      this.spawn('impact', pos, { life: 0.35, size: 0.6, size1: 1.0, additive: false, sheet: true, color: 0xb0a090 });
      return;
    }
    const c = color ?? (kind === 'weak' ? 0xffe060 : kind === 'armor' ? 0x9fd0ff : 0xff6040);
    this.spawn('star', pos, { life: 0.12, size: kind === 'weak' ? 1.1 : 0.6, size1: 0.2, color: c });
    const n = kind === 'weak' ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const v = normal.clone().multiplyScalar(2).add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6));
      this.spawn('sparkle', pos, { vel: v, life: 0.35 + Math.random() * 0.2, size: 0.18, size1: 0.02, color: c, grav: 12 });
    }
  }

  explosion(pos: THREE.Vector3, radius: number, color = 0xff9040) {
    this.spawn('nova', pos, { life: 0.35, size: radius * 0.6, size1: radius * 2.4, color });
    this.spawn('corona', pos, { life: 0.5, size: radius, size1: radius * 2, color: 0xffd0a0 });
    for (let i = 0; i < 16; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 8);
      this.spawn('x1', pos, { vel: v, life: 0.5 + Math.random() * 0.3, size: 0.5, size1: 0.1, color, grav: 9 });
    }
    this.spawn('impact', pos, { life: 0.5, size: radius * 1.2, size1: radius * 2.2, additive: false, sheet: true, color: 0x605040 });
    this.ring(pos, radius, 0.45, color);
  }

  coreBurst(pos: THREE.Vector3, color: number) {
    this.spawn('flarefour', pos, { life: 0.5, size: 0.4, size1: 2.5, color });
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(3);
      this.spawn('sparkle', pos, { vel: v, life: 0.6, size: 0.25, size1: 0.02, color });
    }
  }

  update(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        this.scene.remove(p.sprite);
        p.sprite.material.map !== this.mat('star').map && p.sprite.material.map?.dispose?.();
        p.sprite.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.setScalar(THREE.MathUtils.lerp(p.size0, p.size1, t));
      p.sprite.material.opacity = p.alpha * (1 - t * t);
      p.sprite.material.rotation += p.spin * dt;
      if (p.sheet) {
        const f = Math.min(p.sheet.frames - 1, Math.floor(t * p.sheet.frames));
        const cx = f % p.sheet.cols;
        const cy = Math.floor(f / p.sheet.cols);
        p.sprite.material.map!.offset.set(cx / p.sheet.cols, 1 - (cy + 1) / p.sheet.rows);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life += dt;
      const t = d.life / d.max;
      if (t >= 1) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.decals.splice(i, 1);
        continue;
      }
      d.mesh.scale.setScalar(THREE.MathUtils.lerp(d.size0, d.size1, Math.sqrt(t)));
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = d.alpha * (1 - t);
    }
  }

  clear() {
    for (const p of this.parts) this.scene.remove(p.sprite);
    for (const d of this.decals) this.scene.remove(d.mesh);
    this.parts = [];
    this.decals = [];
  }
}
