import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Models } from '../assets';
import { Chunk, Collider, Kind, Ramp } from './types';
import type { BiomeKit } from './biomes';

// ---------------------------------------------------------------------------
// Physics constants shared with the player (needed to design fair gaps)
// ---------------------------------------------------------------------------
export const GRAVITY = 32;
export const JUMP_V = 10.5;
export const SPEED_FLOOR = 0.72; // player can never be slower than this * baseline
export const BIOME_LEN = 1400;

export function baseSpeed(dist: number) {
  return 15 + 29 * (1 - Math.exp(-Math.max(0, dist) / 3200));
}
function airTime(vy0: number, drop: number) {
  const disc = vy0 * vy0 + 2 * GRAVITY * drop;
  if (disc < 0) return 0;
  return (vy0 + Math.sqrt(disc)) / GRAVITY;
}

export class Rng {
  constructor(private s: number) {}
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
  weighted<T extends string>(w: Partial<Record<T, number>>): T {
    const entries = Object.entries(w) as [T, number][];
    const tot = entries.reduce((s, [, v]) => s + Math.max(0, v), 0);
    let r = this.next() * tot;
    for (const [k, v] of entries) { r -= Math.max(0, v); if (r <= 0) return k; }
    return entries[0][0];
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Shared visuals for gameplay items (orbs, rings) */
export class Shared {
  orbGeo = new THREE.IcosahedronGeometry(0.28, 1);
  orbMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x66f6ff), emissiveIntensity: 4, roughness: 0.2 });
  orbHaloGeo = new THREE.SphereGeometry(0.5, 12, 8);
  orbHaloMat = new THREE.MeshBasicMaterial({ color: 0x36f1ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
  ringGeo = new THREE.TorusGeometry(2.2, 0.12, 8, 40);
  ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xffc23d), emissiveIntensity: 5 });
  padMat = new THREE.MeshBasicMaterial({ color: 0x36f1ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
}

// ---------------------------------------------------------------------------
// Builder – handed to biome kits to emit visuals and colliders into a chunk
// ---------------------------------------------------------------------------
export class Builder {
  target: THREE.Object3D;
  constructor(public chunk: Chunk, public models: Models, public rng: Rng, public shared: Shared, public kit: BiomeKit) { this.target = chunk.group; }
  add<T extends THREE.Object3D>(o: T): T { this.target.add(o); return o; }
  /** Run `f` collecting everything it adds into a kept (non-merged) group, e.g. smashable obstacles. */
  keep(f: () => void): THREE.Group {
    const g = new THREE.Group(); g.userData.keep = true;
    this.chunk.group.add(g);
    const prev = this.target; this.target = g; f(); this.target = prev;
    return g;
  }
  collider(min: THREE.Vector3, max: THREE.Vector3, kind: Kind = 'solid', opts: Partial<Collider> = {}): Collider {
    const c: Collider = { min: min.clone(), max: max.clone(), kind, ...opts };
    this.chunk.colliders.push(c);
    return c;
  }
  ramp(r: Ramp) { this.chunk.ramps.push(r); }
  own<T extends { dispose(): void }>(d: T): T { this.chunk.disposables.push(d); return d; }
  animate(f: (t: number, dt: number) => void) { this.chunk.animators.push(f); }
  /** Place a model fitted into a box. */
  fit(name: string, min: THREE.Vector3, max: THREE.Vector3, opts: { uniform?: boolean; rotY?: number; shadow?: boolean } = {}) {
    const o = this.models.fit(name, min, max, opts);
    if (opts.shadow === false) o.traverse((m: any) => { if (m.isMesh) m.castShadow = false; });
    return this.add(o);
  }
  /** Place model at position with uniform scale and rotation. */
  put(name: string, x: number, y: number, z: number, scale = 1, rotY = 0, shadow = true) {
    const o = this.models.clone(name);
    o.position.set(x, y, z); o.scale.setScalar(scale); o.rotation.y = rotY;
    if (!shadow) o.traverse((m: any) => { if (m.isMesh) m.castShadow = false; });
    return this.add(o);
  }
  orb(x: number, y: number, z: number) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.shared.orbGeo, this.shared.orbMat);
    const h = new THREE.Mesh(this.shared.orbHaloGeo, this.shared.orbHaloMat);
    g.add(m, h); g.position.set(x, y, z); g.userData.keep = true;
    this.add(g);
    this.collider(V(x - 0.7, y - 0.9, z - 0.7), V(x + 0.7, y + 0.9, z + 0.7), 'orb', { obj: g });
    const ph = this.rng.next() * 6;
    this.animate((t) => { m.rotation.y = t * 3 + ph; g.position.y = y + Math.sin(t * 4 + ph) * 0.12; });
  }
  ring(x: number, y: number, z: number) {
    const m = new THREE.Mesh(this.shared.ringGeo, this.shared.ringMat);
    m.position.set(x, y, z); m.userData.keep = true;
    this.add(m);
    this.collider(V(x - 2.1, y - 2.1, z - 0.6), V(x + 2.1, y + 2.1, z + 0.6), 'ring', { obj: m });
    this.animate((t) => { m.rotation.z = t; });
  }
}

// ---------------------------------------------------------------------------
// Track generator
// ---------------------------------------------------------------------------
type Exit = 'gap' | 'drop' | 'up' | 'ramp' | 'wallrun' | 'wallrun2' | 'bridge' | 'flat';
type Feature = 'clear' | 'vault' | 'slide' | 'dodge' | 'mixed' | 'boost' | 'pillars';

export interface BiomeMark { z: number; biome: number; }

export class Track {
  chunks: Chunk[] = [];
  marks: BiomeMark[] = [];
  /** near edge (z) of the next platform to generate */
  private z = 0;
  private y = 0;
  private cx = 0;
  private w = 12;
  private biome = -1;
  private segCount = 0;
  private prevExit = '';
  rng: Rng;
  root = new THREE.Group();

  constructor(public models: Models, public kits: BiomeKit[], public shared: Shared, seed = (Math.random() * 1e9) | 0) {
    this.rng = new Rng(seed);
  }

  biomeIndexAt(dist: number) { return Math.floor(Math.max(0, dist) / BIOME_LEN); }
  kitFor(index: number) { return this.kits[index % this.kits.length]; }

  reset() {
    for (const c of this.chunks) this.disposeChunk(c);
    this.chunks = []; this.marks = [];
    this.z = 30; this.y = 0; this.cx = 0; this.w = 12; this.biome = -1; this.segCount = 0; this.prevExit = '';
  }

  /** Ensure track exists until `aheadZ`, and remove chunks behind `behindZ`. */
  update(playerZ: number, ahead = 700, behind = 80) {
    while (this.z > playerZ - ahead) this.genSegment();
    while (this.chunks.length && this.chunks[0].zFar > playerZ + behind) {
      this.disposeChunk(this.chunks.shift()!);
    }
  }

  /** Shift all content by dz (floating origin). */
  shift(dz: number) {
    this.z += dz;
    for (const c of this.chunks) {
      c.zNear += dz; c.zFar += dz;
      c.group.position.z += dz;
      for (const col of c.colliders) { col.min.z += dz; col.max.z += dz; }
      for (const r of c.ramps) { r.zNear += dz; r.zFar += dz; }
    }
    for (const m of this.marks) m.z += dz;
  }

  private disposeChunk(c: Chunk) {
    this.root.remove(c.group);
    for (const d of c.disposables) d.dispose();
  }

  /** world distance offset (set by game when shifting origin) */
  originDist = 0; // distance represented by z=0
  private distAt(z: number) { return this.originDist - z; }

  private newChunk(zNear: number, biome: number): { chunk: Chunk; b: Builder } {
    const chunk: Chunk = { zNear, zFar: zNear, group: new THREE.Group(), colliders: [], ramps: [], biome, disposables: [], animators: [] };
    this.root.add(chunk.group);
    this.chunks.push(chunk);
    return { chunk, b: new Builder(chunk, this.models, this.rng, this.shared, this.kitFor(biome)) };
  }

  // ---------------------------------------------------------------------------
  private platform(b: Builder, zNear: number, zFar: number, y: number, x0: number, x1: number, kind: 'roof' | 'bridge' | 'start' = 'roof') {
    b.collider(V(x0, y - 80, zFar), V(x1, y, zNear), 'solid', { tag: 'platform' });
    b.kit.platform(b, { x0, x1, zNear, zFar, y, kind });
  }

  private genSegment() {
    const rng = this.rng;
    const dist = this.distAt(this.z);
    const vb = baseSpeed(dist);
    const vmin = vb * SPEED_FLOOR * 0.97;
    const diff = Math.min(1, dist / 7000);
    let biome = this.biomeIndexAt(dist);
    // a biome whose assets are still streaming in: keep running through the last ready one
    while (biome > 0 && !this.kits[biome % this.kits.length]) biome--;
    if (biome < this.biome) biome = this.biome;
    const { chunk, b } = this.newChunk(this.z, biome);
    const kit = b.kit;
    const zN = this.z;
    let y = this.y;
    const cx = this.cx;
    const first = this.segCount === 0;
    const newBiome = biome !== this.biome;
    this.biome = biome;
    this.segCount++;

    // ---------------- platform ----------------
    let L = first ? 110 : newBiome ? vb * 3.2 : vb * rng.range(1.6, 2.8) + 8;
    let w = first || newBiome ? 14 : rng.range(9, 14);
    let exit: Exit;
    if (first) exit = 'gap';
    else {
      const wts: Partial<Record<Exit, number>> = {
        gap: 4, drop: 1.4, up: 1.2, ramp: 1.4, wallrun: 1.6 + diff, wallrun2: diff * 1.6, bridge: kit.hasBridges ? 1.2 : 0, flat: 1.2,
      };
      if (y < -25) { wts.drop = 0; wts.up = 4; wts.ramp = 3; }
      if (y > 25) { wts.up = 0; wts.ramp = 0.3; wts.drop = 4; }
      exit = rng.weighted(wts);
      if (newBiome) exit = 'gap';
    }
    if (exit === 'wallrun' || exit === 'wallrun2') w = rng.range(8, 9.5);
    const x0 = cx - w / 2, x1 = cx + w / 2;
    let zF = zN - L;
    const rampLen = 10, rampRise = 2.6;
    let platEnd = zF;
    if (exit === 'ramp') platEnd = zF + rampLen; // flat part ends where ramp begins
    this.platform(b, zN, platEnd, y, x0, x1, first ? 'start' : 'roof');
    if (exit === 'ramp') {
      const r: Ramp = { x0, x1, zNear: platEnd, zFar: zF, yNear: y, yFar: y + rampRise };
      b.ramp(r);
      kit.ramp(b, r);
      // fill under the ramp to avoid falling through the sides
    }

    // ---------------- features ----------------
    const longAir = this.prevExit === 'ramp' || this.prevExit === 'drop' || this.prevExit === 'wallrun' || this.prevExit === 'wallrun2';
    const fStart = zN - (first ? 50 : Math.max(10, vb * (longAir ? 1.5 : 0.7))), fEnd = (exit === 'ramp' ? platEnd : zF) + Math.max(10, vb * 0.8);
    if (fStart - fEnd > 8) {
      let feat: Feature = 'clear';
      if (!first) {
        feat = rng.weighted<Feature>({ clear: newBiome ? 6 : 1, vault: 2, slide: 2, dodge: 1.5 + diff * 2, mixed: 1 + diff * 2, boost: 1.2, pillars: kit.hasPillars ? 1 : 0 });
      }
      this.features(b, feat, fStart, fEnd, y, cx, w, vb);
    }

    // ---------------- exit (gap) ----------------
    let nextY = y, gap = 0, nextCx = cx + rng.range(-3, 3);
    nextCx = THREE.MathUtils.clamp(nextCx, -10, 10);
    const takeoffY = exit === 'ramp' ? y + rampRise : y;
    switch (exit) {
      case 'gap': {
        nextY = y + rng.range(-4, 1.0);
        const T = airTime(JUMP_V, takeoffY - nextY);
        gap = THREE.MathUtils.clamp(vmin * T * rng.range(0.4, 0.82), 3, 40);
        break;
      }
      case 'drop': {
        nextY = y - rng.range(7, 13);
        const T = airTime(JUMP_V, takeoffY - nextY);
        gap = THREE.MathUtils.clamp(vmin * T * rng.range(0.35, 0.6), 5, 45);
        break;
      }
      case 'up': {
        nextY = y + rng.range(0.8, 1.3);
        const T = airTime(JUMP_V, takeoffY - nextY);
        gap = THREE.MathUtils.clamp(vmin * T * rng.range(0.35, 0.65), 2.5, 20);
        break;
      }
      case 'ramp': {
        nextY = y + rng.range(-5, 1.5);
        const slope = rampRise / rampLen;
        const T = airTime(vmin * slope, takeoffY - nextY);
        gap = THREE.MathUtils.clamp(vmin * T * rng.range(0.55, 0.8), 8, 60);
        nextCx = cx;
        break;
      }
      case 'wallrun':
      case 'wallrun2': {
        nextY = y - rng.range(0, 1.2);
        gap = exit === 'wallrun' ? THREE.MathUtils.clamp(vmin * 1.45, 16, 55) : THREE.MathUtils.clamp(vmin * 2.1, 26, 80);
        nextCx = cx;
        break;
      }
      case 'bridge': {
        nextY = y;
        gap = 0;
        break;
      }
      case 'flat': {
        nextY = y + rng.range(-0.4, 0.4);
        gap = 0;
        nextCx = cx + rng.range(-2, 2);
        break;
      }
    }

    // wall-run walls
    if (exit === 'wallrun') {
      const side = rng.chance(0.5) ? -1 : 1;
      this.wallrunWall(b, side, zF + 4, zF - gap - 3, y, cx, w);
      this.orbArc(b, cx + side * (w / 2 - 0.8), zF - 2, zF - gap + 2, y + 1.6, y + 1.6, 6);
    } else if (exit === 'wallrun2') {
      const side = rng.chance(0.5) ? -1 : 1;
      const split = zF - gap * 0.45;
      this.wallrunWall(b, side, zF + 4, split - 4, y, cx, w);
      this.wallrunWall(b, -side, split + 2, zF - gap - 3, y, cx, w);
      this.orbArc(b, cx + side * (w / 2 - 0.8), zF - 2, split + 3, y + 1.6, y + 1.8, 4);
      this.orbArc(b, cx - side * (w / 2 - 0.8), split - 3, zF - gap + 2, y + 1.8, y + 1.4, 4);
    } else if (exit === 'bridge') {
      const bl = THREE.MathUtils.clamp(vb * rng.range(1.0, 1.6), 18, 60);
      const bw = 3;
      this.platform(b, zF, zF - bl, y, cx - bw / 2, cx + bw / 2, 'bridge');
      for (let k = 0; k < 5; k++) b.orb(cx, y + 1.0, zF - (bl * (k + 1)) / 6);
      gap = bl;
      // bridges are walkable; next platform directly after
    } else if (gap > 0) {
      // jump arc guidance orbs
      this.orbArc(b, (cx + nextCx) / 2, zF - 1, zF - gap + 1, takeoffY + 1.2, nextY + 1.2, Math.min(7, Math.floor(gap / 3)), exit === 'ramp' ? 3.5 : 1.8);
      if (exit === 'ramp' || (exit === 'drop' && rng.chance(0.6))) b.ring((cx + nextCx) / 2, Math.max(takeoffY, nextY) + (exit === 'ramp' ? 5 : 2.5), zF - gap * 0.45);
    }

    const zNext = zF - gap;
    chunk.zFar = zNext;
    (chunk as any).exit = exit;
    // scenery covers platform + gap
    kit.scenery(b, { zNear: zN, zFar: zNext, y, nextY, cx, w, gapStart: exit === 'bridge' ? zF : zF, gapEnd: zNext, dist });
    if (newBiome) this.marks.push({ z: zN, biome });
    mergeStatic(chunk);

    this.z = zNext;
    this.y = nextY;
    this.cx = exit === 'bridge' ? cx : nextCx;
    this.w = w;
    this.prevExit = exit;
  }

  private wallrunWall(b: Builder, side: number, zNear: number, zFar: number, y: number, cx: number, w: number) {
    const face = cx + side * (w / 2 + 0.15);
    const thick = 1.2;
    const xa = side < 0 ? face - thick : face;
    const xb = side < 0 ? face : face + thick;
    const min = V(xa, y - 14, zFar), max = V(xb, y + 6.5, zNear);
    b.collider(min, max, 'solid', { wallrun: true, tag: 'wall' });
    b.kit.wall(b, min, max, side);
  }

  private orbArc(b: Builder, x: number, zA: number, zB: number, yA: number, yB: number, n: number, lift = 1.8) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const yy = THREE.MathUtils.lerp(yA, yB, t) + Math.sin(t * Math.PI) * lift;
      b.orb(x, yy, THREE.MathUtils.lerp(zA, zB, t));
    }
  }

  private features(b: Builder, feat: Feature, zA: number, zB: number, y: number, cx: number, w: number, vb: number) {
    const rng = this.rng;
    const kit = b.kit;
    const span = zA - zB;
    const spacing = Math.max(14, vb * rng.range(0.85, 1.2));
    const slots: number[] = [];
    for (let z = zA - rng.range(4, 10); z > zB + 2; z -= spacing) slots.push(z);
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const lane = w / 3;

    const vault = (z: number) => {
      const h = rng.range(0.85, 1.15), d = rng.range(0.5, 1.4);
      const min = V(x0, y, z - d), max = V(x1, y + h, z);
      const c = b.collider(min, max, 'solid', { tag: 'vault', breakable: true });
      c.obj = b.keep(() => kit.vault(b, min, max));
    };
    const slide = (z: number) => {
      const d = rng.chance(0.3) ? rng.range(4, 9) : rng.range(0.6, 1.6);
      const min = V(x0 - 0.5, y + 1.15, z - d), max = V(x1 + 0.5, y + 1.15 + rng.range(1.2, 4), z);
      const c = b.collider(min, max, 'solid', { tag: 'slide', breakable: d < 2 });
      if (d < 2) c.obj = b.keep(() => kit.slide(b, min, max)); else kit.slide(b, min, max);
    };
    const dodge = (z: number) => {
      const free = rng.int(0, 2);
      const free2 = rng.chance(0.35) ? rng.int(0, 2) : -1;
      for (let l = 0; l < 3; l++) {
        if (l === free || l === free2) continue;
        const d = rng.range(1.2, 3);
        const lx0 = x0 + l * lane + 0.15, lx1 = x0 + (l + 1) * lane - 0.15;
        const min = V(lx0, y, z - d), max = V(lx1, y + rng.range(2.4, 4.5), z);
        const c = b.collider(min, max, 'solid', { tag: 'blocker', breakable: true });
        c.obj = b.keep(() => kit.blocker(b, min, max));
      }
      // orbs to guide through free lane
      b.orb(x0 + (free + 0.5) * lane, y + 1.0, z + 3);
    };
    const boost = (z: number) => {
      const len = 6;
      const min = V(cx - 1.6, y, z - len), max = V(cx + 1.6, y + 0.6, z);
      b.collider(min, max, 'boost');
      b.keep(() => kit.boostPad(b, min, max));
    };

    switch (feat) {
      case 'clear':
        for (let z = zA - 6; z > zB + 4; z -= 5) if (rng.chance(0.4)) b.orb(cx + Math.sin(z * 0.1) * w * 0.3, y + 1.0, z);
        if (span > 40 && rng.chance(0.5)) boost(zB + span * 0.5);
        break;
      case 'vault': slots.forEach((z) => (rng.chance(0.8) ? vault(z) : boost(z))); break;
      case 'slide': slots.forEach((z) => slide(z)); break;
      case 'dodge': slots.forEach((z) => dodge(z)); break;
      case 'mixed': slots.forEach((z) => rng.pick([vault, slide, dodge, dodge])(z)); break;
      case 'boost': slots.forEach((z, i) => (i % 2 === 0 ? boost(z) : vault(z))); break;
      case 'pillars': slots.forEach((z) => (rng.chance(0.5) ? dodge(z) : slide(z))); break;
    }
  }

  // ---------------------------------------------------------------------------
  // queries
  forEachCollider(zMin: number, zMax: number, f: (c: Collider) => void) {
    for (const ch of this.chunks) {
      if (ch.zFar > zMax || ch.zNear < zMin) continue;
      for (const c of ch.colliders) if (!c.dead && c.max.z >= zMin && c.min.z <= zMax) f(c);
    }
  }
  forEachRamp(z: number, f: (r: Ramp) => void) {
    for (const ch of this.chunks) {
      if (ch.zFar > z + 1 || ch.zNear < z - 1) continue;
      for (const r of ch.ramps) f(r);
    }
  }
  chunkAt(z: number) {
    for (const ch of this.chunks) if (z <= ch.zNear && z >= ch.zFar) return ch;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Static batching: merge all non-kept meshes of a chunk by material
// ---------------------------------------------------------------------------
function mergeStatic(chunk: Chunk) {
  const root = chunk.group;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const remove: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o.userData.keep) return;
    const m = o as THREE.Mesh;
    if ((m as any).isMesh && !(m as any).isSkinnedMesh && !(m as any).isInstancedMesh && !Array.isArray(m.material)) {
      const g = m.geometry;
      const sig = Object.keys(g.attributes).sort().join(',') + (g.index ? ':i' : ':n') + (m.castShadow ? ':c' : '');
      const key = (m.material as THREE.Material).uuid + '|' + sig;
      let bk = buckets.get(key);
      if (!bk) { bk = { mat: m.material as THREE.Material, cast: m.castShadow, geos: [] }; buckets.set(key, bk); }
      const cg = g.clone();
      for (const name of Object.keys(cg.morphAttributes)) delete cg.morphAttributes[name];
      cg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      bk.geos.push(cg);
      remove.push(m);
    }
    for (const c of [...o.children]) visit(c);
  };
  for (const c of [...root.children]) visit(c);
  for (const r of remove) r.parent?.remove(r);
  for (const bk of buckets.values()) {
    const merged = bk.geos.length === 1 ? bk.geos[0] : mergeGeometries(bk.geos, false);
    if (!merged) { continue; }
    if (bk.geos.length > 1) for (const g of bk.geos) g.dispose();
    const mesh = new THREE.Mesh(merged, bk.mat);
    mesh.castShadow = bk.cast; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = true;
    root.add(mesh);
    chunk.disposables.push(merged);
  }
  // prune empty groups
  const prune = (o: THREE.Object3D) => { for (const c of [...o.children]) { prune(c); if (!c.userData.keep && c.children.length === 0 && !(c as any).isMesh && !(c as any).isPoints) o.remove(c); } };
  prune(root);
}
