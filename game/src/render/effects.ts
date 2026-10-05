import * as THREE from 'three';
import type { Projectile } from '../combat/world';
import { rand } from '../core/math';
import { fx, tex } from './textures';
import { buildHookHead } from './weapons';

interface Particle {
  obj: THREE.Object3D;
  mat: THREE.Material & { opacity: number };
  age: number;
  life: number;
  vel: THREE.Vector3;
  gravity: number;
  scale0: number;
  scale1: number;
  spin: number;
  fade: 'linear' | 'late';
  scaleEase: 'out' | 'pop';
  drag: number;
}

function spriteMat(map: THREE.Texture, color: number, additive = true) {
  return new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** Camera-facing ribbon that follows a moving point (weapon trails, bullets). */
export class Trail {
  readonly mesh: THREE.Mesh;
  private points: { p: THREE.Vector3; age: number }[] = [];
  private geo = new THREE.BufferGeometry();
  private positions: Float32Array;
  private alphas: Float32Array;
  emitting = false;

  constructor(
    color: number,
    private width = 0.18,
    private maxAge = 0.12,
    private maxPoints = 24,
  ) {
    this.positions = new Float32Array(maxPoints * 2 * 3);
    this.alphas = new Float32Array(maxPoints * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    const idx: number[] = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(mix(color, vec3(1.0), vA*vA*0.6), vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }

  setColor(c: number) {
    ((this.mesh.material as THREE.ShaderMaterial).uniforms.color.value as THREE.Color).set(c);
  }

  update(dt: number, head: THREE.Vector3, camPos: THREE.Vector3) {
    for (const p of this.points) p.age += dt;
    this.points = this.points.filter((p) => p.age < this.maxAge);
    if (this.emitting) {
      this.points.unshift({ p: head.clone(), age: 0 });
      if (this.points.length > this.maxPoints) this.points.length = this.maxPoints;
    }
    const n = this.points.length;
    this.geo.setDrawRange(0, n > 1 ? (n - 1) * 6 : 0);
    const side = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.points[i].p;
      const q = this.points[Math.min(n - 1, i + 1)].p;
      const r = this.points[Math.max(0, i - 1)].p;
      tan.subVectors(r, q);
      if (tan.lengthSq() < 1e-8) tan.set(0, 1, 0);
      toCam.subVectors(camPos, p);
      side.crossVectors(tan, toCam).normalize();
      const life = 1 - this.points[i].age / this.maxAge;
      const w = this.width * life * (1 - i / this.maxPoints);
      this.positions.set([p.x + side.x * w, p.y + side.y * w, p.z + side.z * w, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w], i * 6);
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = life;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  clear() {
    this.points = [];
  }
}

interface ProjectileVis {
  core: THREE.Object3D;
  glow: THREE.Sprite;
  trail: Trail;
  spin: number;
  arrow: boolean;
  wave?: boolean;
}

function buildArrow(color: number, size: number) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0x8a5a32 }));
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6), new THREE.MeshBasicMaterial({ color: 0xe8eef8 }));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.5;
  g.add(tip);
  for (const r of [0, Math.PI / 2]) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.18), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    fl.rotation.set(Math.PI / 2, r, 0);
    fl.rotation.order = 'YXZ';
    fl.position.z = -0.4;
    g.add(fl);
  }
  g.scale.setScalar(size);
  return g;
}

/** World-space VFX: comic hit sparks, guard barriers, dust, projectiles, afterimages. */
export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private projectiles = new Map<number, ProjectileVis>();
  private ghosts: { obj: THREE.Object3D; mat: THREE.MeshBasicMaterial; age: number }[] = [];
  private spinners: { obj: THREE.Object3D; speed: number }[] = [];

  constructor(private camera: THREE.Camera) {}

  private add(obj: THREE.Object3D, mat: Particle['mat'], o: Partial<Particle> & { life: number }) {
    obj.renderOrder = 5;
    this.group.add(obj);
    this.particles.push({
      obj,
      mat,
      age: 0,
      vel: new THREE.Vector3(),
      gravity: 0,
      scale0: 1,
      scale1: 1,
      spin: 0,
      fade: 'linear',
      scaleEase: 'out',
      drag: 0,
      ...o,
    });
  }

  private sprite(map: THREE.Texture, color: number, pos: THREE.Vector3, additive = true) {
    const mat = spriteMat(map, color, additive);
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    return { s, mat };
  }

  /** Comic-style impact: flash burst, radial speed lines, shock ring, slash arc and star debris. */
  hit(pos: THREE.Vector3, dir: THREE.Vector3, color: number, color2: number, power: number, heavy: boolean, scale = 1, slash = false) {
    const k = (0.7 + power * 0.9 + (heavy ? 0.6 : 0)) * scale;
    {
      const { s, mat } = this.sprite(fx('flash'), 0xffffff, pos);
      mat.rotation = Math.random() * Math.PI;
      this.add(s, mat, { life: 0.1 + power * 0.04, scale0: 0.4 * k, scale1: 1.5 * k, scaleEase: 'pop', fade: 'linear' });
    }
    {
      const { s, mat } = this.sprite(fx('burst'), color, pos);
      mat.rotation = Math.random() * Math.PI;
      this.add(s, mat, { life: 0.22 + power * 0.08, scale0: 0.6 * k, scale1: 2.3 * k, scaleEase: 'pop', spin: rand(-4, 4) });
    }
    {
      const { s, mat } = this.sprite(tex.lines(), color2, pos);
      mat.rotation = Math.random() * Math.PI;
      this.add(s, mat, { life: 0.2 + power * 0.1, scale0: 1.2 * k, scale1: 3.6 * k });
    }
    {
      const { s, mat } = this.sprite(fx('ring'), color2, pos);
      this.add(s, mat, { life: 0.25 + power * 0.1, scale0: 0.3 * k, scale1: 3.2 * k });
    }
    if (slash) {
      // Melee: a swipe arc across the impact, angled along the blow.
      const { s, mat } = this.sprite(fx('slash'), color2, pos);
      mat.rotation = Math.atan2(dir.y, Math.abs(dir.x) + Math.abs(dir.z)) + rand(-0.9, 0.9) + (Math.random() < 0.5 ? 0 : Math.PI);
      this.add(s, mat, { life: 0.18 + power * 0.06, scale0: 1.4 * k, scale1: 2.6 * k, scaleEase: 'pop', fade: 'late' });
    }
    const n = Math.floor(5 + power * 10 + (heavy ? 6 : 0));
    for (let i = 0; i < n; i++) {
      const map = i % 3 === 0 ? tex.star() : i % 3 === 1 ? fx('spark') : fx('glint');
      const { s, mat } = this.sprite(map, i % 3 ? color2 : color, pos);
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(4, 11) * (0.6 + power));
      v.addScaledVector(dir, 4);
      mat.rotation = Math.random() * 6;
      const sz = rand(0.18, 0.4) * (0.8 + power * 0.5) * (i % 3 ? 1.6 : 1);
      this.add(s, mat, { life: rand(0.3, 0.55), vel: v, gravity: 14, scale0: sz, scale1: sz * 0.2, spin: rand(-10, 10), drag: 2.5 });
    }
    if (heavy) {
      this.groundRing(new THREE.Vector3(pos.x, Math.max(0.05, pos.y - 1.0), pos.z), color2, 0.4, 5);
      this.debris(new THREE.Vector3(pos.x, 0.05, pos.z), 5);
      this.dust(new THREE.Vector3(pos.x, 0.05, pos.z), 6, 1.3);
    }
  }

  /** Flat textured ring expanding along the ground. */
  private groundRing(pos: THREE.Vector3, color: number, life: number, size: number, map = fx('ring'), additive = true) {
    const mat = new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.add(ring, mat, { life, scale0: size * 0.1, scale1: size, spin: 0 });
  }

  /** Chunks of floor kicked up by heavy blows and slams. */
  private debris(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      const { s, mat } = this.sprite(fx('dirt'), 0xd9c6a5, pos, false);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), rand(1.2, 2.2), Math.sin(a)).multiplyScalar(rand(2.5, 5));
      mat.rotation = Math.random() * 6;
      const sz = rand(0.3, 0.6);
      this.add(s, mat, { life: rand(0.45, 0.7), vel: v, gravity: 18, scale0: sz, scale1: sz * 0.6, spin: rand(-6, 6), drag: 1, fade: 'late' });
    }
  }

  /** Just guard: a crisp magic seal plus a halo. */
  justGuard(pos: THREE.Vector3) {
    {
      const { s, mat } = this.sprite(fx('magic'), 0x9ff4ff, pos);
      this.add(s, mat, { life: 0.35, scale0: 0.8, scale1: 2.6, scaleEase: 'pop', fade: 'late', spin: 3 });
    }
    {
      const { s, mat } = this.sprite(fx('halo'), 0x6fe8ff, pos);
      this.add(s, mat, { life: 0.4, scale0: 1, scale1: 3.4 });
    }
  }

  /** Swirl around a spinning attacker (helicopter hammer etc.). */
  twirl(pos: THREE.Vector3, color: number) {
    const mat = new THREE.MeshBasicMaterial({ map: fx('twirl'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    m.position.copy(pos);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6;
    this.add(m, mat, { life: 0.22, scale0: 1.1, scale1: 1.6, fade: 'linear' });
    this.spinners.push({ obj: m, speed: -14 });
  }

  /** Hexagonal barrier flashing in front of the guarding fighter. */
  guard(targetPos: THREE.Vector3, facing: THREE.Vector3, broke: boolean) {
    const mat = new THREE.MeshBasicMaterial({ map: tex.hex(), color: broke ? 0xff5a5a : 0x6fe8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
    plane.position.copy(targetPos).addScaledVector(facing, 0.75);
    plane.position.y += 1.15;
    plane.lookAt(plane.position.clone().add(facing));
    this.add(plane, mat, { life: broke ? 0.35 : 0.22, scale0: broke ? 1.2 : 0.85, scale1: broke ? 1.8 : 1.15, fade: 'late' });
    const center = plane.position.clone();
    const n = broke ? 16 : 5;
    for (let i = 0; i < n; i++) {
      const { s, mat: m } = this.sprite(broke ? tex.hex() : fx('spark'), broke ? 0xff8a8a : 0xbff6ff, center);
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 8)).addScaledVector(facing, 3);
      this.add(s, m, { life: rand(0.25, 0.5), vel: v, gravity: broke ? 12 : 0, scale0: rand(0.15, 0.3), scale1: 0.05, spin: rand(-8, 8), drag: 2 });
    }
  }

  dust(pos: THREE.Vector3, count = 4, size = 1) {
    for (let i = 0; i < count; i++) {
      const { s, mat } = this.sprite(fx('puff'), 0xfff6e6, pos, false);
      mat.rotation = Math.random() * 6;
      mat.opacity = 0.85;
      const a = (i / count) * Math.PI * 2 + Math.random();
      const v = new THREE.Vector3(Math.cos(a), rand(0.2, 0.8), Math.sin(a)).multiplyScalar(rand(1.5, 3.5) * size);
      s.position.y += 0.15;
      this.add(s, mat, { life: rand(0.35, 0.6), vel: v, scale0: 0.35 * size, scale1: 1.1 * size, drag: 4, fade: 'linear' });
    }
  }

  muzzle(pos: THREE.Vector3, color: number, big: boolean) {
    const k = big ? 2.2 : 1;
    const { s, mat } = this.sprite(fx('flash'), color, pos);
    mat.rotation = Math.random() * 6;
    this.add(s, mat, { life: 0.08 * k, scale0: 0.7 * k, scale1: 1.2 * k });
    const g = this.sprite(fx('glint'), 0xffffff, pos);
    g.mat.rotation = Math.random() * 6;
    this.add(g.s, g.mat, { life: 0.06 * k, scale0: 0.5 * k, scale1: 0.8 * k });
  }

  /** Sparkle ring used for ult activation. */
  ultBurst(pos: THREE.Vector3, color: number, color2: number) {
    for (let i = 0; i < 3; i++) {
      const { s, mat } = this.sprite(fx('ring'), i === 1 ? color2 : color, pos);
      this.add(s, mat, { life: 0.5 + i * 0.12, scale0: 0.5, scale1: 6 + i * 2 });
    }
    {
      const { s, mat } = this.sprite(fx('halo'), color2, pos);
      this.add(s, mat, { life: 0.6, scale0: 1, scale1: 7, spin: 2 });
    }
    for (let i = 0; i < 24; i++) {
      const { s, mat } = this.sprite(i % 2 ? tex.star() : fx('glint'), i % 2 ? color : color2, pos);
      const a = (i / 24) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), rand(-0.3, 0.6), Math.sin(a)).multiplyScalar(rand(6, 10));
      this.add(s, mat, { life: 0.6, vel: v, scale0: 0.4, scale1: 0.05, spin: rand(-6, 6), drag: 3 });
    }
  }

  /** Short-lived translucent copy of a rig (dash afterimages). */
  afterimage(source: THREE.Object3D, color: number) {
    const ghost = source.clone(true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    ghost.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (m.name === 'outline') m.visible = false;
        m.material = mat;
        m.castShadow = false;
      }
    });
    source.updateWorldMatrix(true, false);
    source.matrixWorld.decompose(ghost.position, ghost.quaternion, ghost.scale);
    this.group.add(ghost);
    this.ghosts.push({ obj: ghost, mat, age: 0 });
  }

  /** Keeps projectile visuals in sync with simulation projectiles. */
  syncProjectiles(list: Projectile[], colorOf: (p: Projectile) => [number, number], alpha: number) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let v = this.projectiles.get(p.id);
      if (!v) {
        const [c1, c2] = colorOf(p);
        const hookVis = p.visual === 'hook';
        const wave = p.visual === 'wave';
        // Arrows and hooks are oriented meshes; everything else is a spinning star sprite.
        const arrow = p.visual === 'arrow' || hookVis;
        const core: THREE.Object3D = hookVis ? buildHookHead(2.4 * p.size) : arrow ? buildArrow(c1, p.size) : new THREE.Sprite(spriteMat(wave ? fx('burst') : tex.star(), wave ? c2 : 0xffffff));
        const glow = new THREE.Sprite(spriteMat(fx('soft'), c1));
        core.renderOrder = glow.renderOrder = 6;
        const trail = new Trail(c2, (arrow ? 0.06 : 0.12) * p.size, arrow ? 0.12 : 0.09, 10);
        trail.emitting = true;
        this.group.add(glow, core, trail.mesh);
        v = { core, glow, trail, spin: rand(-12, 12), arrow, wave };
        this.projectiles.set(p.id, v);
      }
      const pos = new THREE.Vector3().lerpVectors(p.prev, p.pos, alpha);
      v.core.position.copy(pos);
      v.glow.position.copy(pos);
      v.glow.scale.setScalar((v.arrow ? 0.5 : v.wave ? 2.2 : 1.0) * p.size);
      if (v.wave) {
        // Shockwave running along the floor: a flickering burst kicking up dust.
        v.core.scale.setScalar(1.3 + Math.random() * 0.4);
        if (Math.random() < 0.5) this.dust(new THREE.Vector3(pos.x, pos.y - 0.4, pos.z), 1, 0.7);
      }
      if (v.arrow) v.core.lookAt(pos.clone().add(p.vel));
      else if (!v.wave) {
        v.core.scale.setScalar(0.42 * p.size);
        ((v.core as THREE.Sprite).material as THREE.SpriteMaterial).rotation += v.spin * 0.016;
      }
      v.trail.update(1 / 60, pos, this.camera.position);
    }
    for (const [id, v] of this.projectiles) {
      if (seen.has(id)) continue;
      this.group.remove(v.core, v.glow, v.trail.mesh);
      v.glow.material.dispose();
      this.projectiles.delete(id);
    }
  }

  /** Ground shockwave ring + smoke ring + debris for area attacks. */
  shockwave(pos: THREE.Vector3, radius: number, color: number, color2: number) {
    const ground = new THREE.Vector3(pos.x, 0.06, pos.z);
    this.groundRing(ground, color2, 0.35, radius * 1.1);
    this.groundRing(ground.clone().setY(0.08), color, 0.5, radius * 1.4);
    this.groundRing(ground.clone().setY(0.1), 0xfff6e6, 0.6, radius * 1.3, fx('smokeRing'), false);
    if (radius > 2.5) this.debris(ground, Math.round(radius * 1.5));
    this.dust(ground, Math.round(4 + radius * 2), 0.6 + radius * 0.25);
  }

  /** Suction cup sticking: a quick ring and a flash at the contact point. */
  stick(pos: THREE.Vector3, color: number) {
    {
      const { s, mat } = this.sprite(fx('ring'), color, pos);
      this.add(s, mat, { life: 0.3, scale0: 0.3, scale1: 2.2 });
    }
    {
      const { s, mat } = this.sprite(fx('flash'), 0xffffff, pos);
      this.add(s, mat, { life: 0.14, scale0: 0.5, scale1: 1.4, scaleEase: 'pop' });
    }
  }

  /** Small pop where a projectile expired. */
  fizzle(pos: THREE.Vector3, color: number) {
    const { s, mat } = this.sprite(fx('spark'), color, pos);
    mat.rotation = Math.random() * 6;
    this.add(s, mat, { life: 0.14, scale0: 0.4, scale1: 0.9 });
  }

  update(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) {
        this.group.remove(p.obj);
        p.mat.dispose();
        continue;
      }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.obj.position.addScaledVector(p.vel, dt);
      const su = p.scaleEase === 'pop' ? 1 - Math.pow(1 - Math.min(1, u * 2.2), 3) : 1 - (1 - u) * (1 - u);
      const sc = p.scale0 + (p.scale1 - p.scale0) * su;
      p.obj.scale.set(sc, sc, sc);
      if ((p.obj as THREE.Sprite).isSprite) (p.mat as THREE.SpriteMaterial).rotation += p.spin * dt;
      p.mat.opacity = p.fade === 'late' ? (u < 0.5 ? 1 : 1 - (u - 0.5) * 2) : 1 - u;
      keep.push(p);
    }
    this.particles = keep;
    this.spinners = this.spinners.filter((sp) => {
      sp.obj.rotation.z += sp.speed * dt;
      return !!sp.obj.parent;
    });
    this.ghosts = this.ghosts.filter((g) => {
      g.age += dt;
      g.mat.opacity = 0.45 * (1 - g.age / 0.28);
      if (g.age >= 0.28) {
        this.group.remove(g.obj);
        g.mat.dispose();
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const p of this.particles) this.group.remove(p.obj);
    this.particles = [];
    this.spinners = [];
    for (const g of this.ghosts) this.group.remove(g.obj);
    this.ghosts = [];
    this.syncProjectiles([], () => [0, 0], 1);
  }
}
