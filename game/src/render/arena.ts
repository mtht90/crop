import * as THREE from 'three';
import { ARENA_RADIUS } from '../config';
import { PADS, ROCKS } from '../combat/terrain';
import { part, toon } from './toon';
import { tex } from './textures';

/** Circular arena plus decorative background (no collision outside the floor). */
export class Arena {
  readonly group = new THREE.Group();
  private edgeRing: THREE.Mesh;
  private crowd: THREE.InstancedMesh;
  private crowdBase: { x: number; y: number; z: number; phase: number; s: number }[] = [];
  private waterfalls: THREE.Texture[] = [];
  private clouds: THREE.Group[] = [];
  private flags: THREE.Mesh[] = [];
  private rocks: THREE.Group[] = [];
  private blimp: THREE.Group;
  private t = 0;

  constructor() {
    const g = this.group;

    // Sky dome.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex.sky(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.renderOrder = -10;
    g.add(sky);

    // Floor.
    const floorMat = new THREE.MeshToonMaterial({ map: tex.floor(), gradientMap: (toon(0xffffff) as THREE.MeshToonMaterial).gradientMap });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS, 96), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // Rim band (yellow / blue like the reference).
    const rim = part(new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS - 0.2, 0.6, 96, 1, true), 0xffc93c, 0.04);
    rim.position.y = -0.3;
    g.add(rim);
    const rim2 = part(new THREE.CylinderGeometry(ARENA_RADIUS - 0.2, ARENA_RADIUS - 1.5, 1.6, 96, 1, true), 0x4a5fc8, 0.04);
    rim2.position.y = -1.4;
    g.add(rim2);
    // Rocky underside.
    const rock = part(new THREE.ConeGeometry(ARENA_RADIUS - 1.5, 14, 12, 3), 0x9a7f66, 0.06);
    rock.rotation.x = Math.PI;
    rock.position.y = -2.2 - 7;
    g.add(rock);

    // Glowing edge boundary line (pulses when the player is near).
    this.edgeRing = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_RADIUS - 0.35, ARENA_RADIUS - 0.05, 128),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.edgeRing.rotation.x = -Math.PI / 2;
    this.edgeRing.position.y = 0.02;
    g.add(this.edgeRing);

    // Floating hover pads (decor, outside the arena).
    for (const [x, y, z, r] of PADS) {
      const pad = part(new THREE.CylinderGeometry(r, r * 0.9, 0.9, 32), 0xffc93c, 0.05);
      pad.position.set(x, y, z);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.92, 32), toon(0x5a6fd8));
      pad.add(top);
      g.add(pad);
    }

    this.buildRocks();
    this.buildIslands();
    this.crowd = this.buildCrowd();
    this.buildClouds();
    this.blimp = this.buildBlimp();
  }

  /** Small floating rocks near the edge (also collision: shoot them to recoil back). */
  private buildRocks() {
    for (const [x, y, z, r] of ROCKS) {
      const rock = new THREE.Group();
      rock.position.set(x, y, z);
      const top = part(new THREE.CylinderGeometry(r * 1.02, r, 0.5, 10), 0x7bc950, 0.05);
      top.position.y = -0.25;
      rock.add(top);
      const mid = part(new THREE.ConeGeometry(r * 0.95, r * 1.5, 9, 2), 0xb08c6a, 0.06);
      mid.rotation.x = Math.PI;
      mid.position.y = -0.5 - r * 0.75;
      rock.add(mid);
      const tuft = part(new THREE.ConeGeometry(r * 0.18, r * 0.5, 6), 0x3f8f4a, 0.03);
      tuft.position.set(r * 0.3, r * 0.25, -r * 0.2);
      rock.add(tuft);
      this.rocks.push(rock);
      this.group.add(rock);
    }
  }

  private buildIslands() {
    const g = this.group;
    const rng = mulberry(7);
    const spots: [number, number, number, number][] = [
      [-70, 18, -60, 14],
      [80, 26, -70, 16],
      [-95, 8, 10, 12],
      [90, 4, 30, 10],
      [10, 30, -120, 18],
      [-40, -6, 90, 12],
      [55, 12, 85, 11],
      [-130, 30, -40, 16],
      [140, 20, -10, 14],
    ];
    for (const [x, y, z, r] of spots) {
      const island = new THREE.Group();
      island.position.set(x, y, z);
      const rockMesh = part(new THREE.ConeGeometry(r, r * 1.6, 9, 2), 0xb08c6a, 0.12);
      rockMesh.rotation.x = Math.PI;
      rockMesh.position.y = -r * 0.8;
      island.add(rockMesh);
      const grass = part(new THREE.CylinderGeometry(r * 1.02, r, r * 0.25, 9), 0x7bc950, 0.12);
      island.add(grass);
      const trees = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < trees; i++) {
        const a = rng() * Math.PI * 2;
        const d = rng() * r * 0.7;
        const tree = part(new THREE.ConeGeometry(r * 0.13, r * 0.6, 7), 0x3f8f4a, 0.06);
        tree.position.set(Math.cos(a) * d, r * 0.4, Math.sin(a) * d);
        island.add(tree);
      }
      if (rng() < 0.6) {
        // Castle-ish tower like the reference background.
        const tower = part(new THREE.CylinderGeometry(r * 0.12, r * 0.14, r * 0.8, 8), 0xf2efe6, 0.06);
        tower.position.set(r * 0.2, r * 0.45, -r * 0.2);
        const roof = part(new THREE.ConeGeometry(r * 0.17, r * 0.35, 8), 0x3e6fd8, 0.06);
        roof.position.y = r * 0.55;
        tower.add(roof);
        island.add(tower);
      }
      if (rng() < 0.7) {
        // Waterfall.
        const wtex = makeWaterTex();
        this.waterfalls.push(wtex);
        const fall = new THREE.Mesh(
          new THREE.PlaneGeometry(r * 0.35, r * 2.2),
          new THREE.MeshBasicMaterial({ map: wtex, transparent: true, opacity: 0.85, depthWrite: false }),
        );
        fall.position.set(0, -r * 1.1, r * 0.92);
        island.add(fall);
      }
      g.add(island);
    }

    // Banners on poles around the arena.
    const colors = ['#3e6fd8', '#e8463c'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const R = ARENA_RADIUS + 9;
      const pole = part(new THREE.CylinderGeometry(0.12, 0.12, 9, 6), 0xdddddd, 0.03);
      pole.position.set(Math.cos(a) * R, 2, Math.sin(a) * R);
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 3.2, 1, 6),
        new THREE.MeshToonMaterial({ map: tex.banner(colors[i % 2]), side: THREE.DoubleSide }),
      );
      banner.position.set(0.85, 2.6, 0);
      pole.add(banner);
      pole.lookAt(0, 2, 0);
      pole.rotateY(Math.PI / 2);
      this.flags.push(banner);
      this.group.add(pole);
    }
  }

  private buildCrowd() {
    // Stands on two sides, filled with bouncing mascot blobs.
    const g = this.group;
    const standMat = toon(0xd9dce8);
    const blob = new THREE.SphereGeometry(0.55, 12, 10);
    const count = 220;
    const crowd = new THREE.InstancedMesh(blob, toon(0xffffff, { rim: 0.2 }), count);
    const palette = [0xff8fb1, 0xffd166, 0x7fd4ff, 0x9be37a, 0xc49bff, 0xffa36c, 0xffffff];
    let n = 0;
    for (const side of [0, 1]) {
      const baseA = side === 0 ? Math.PI * 0.85 : -Math.PI * 0.15;
      for (let row = 0; row < 4; row++) {
        const R = ARENA_RADIUS + 14 + row * 2.2;
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(R + 1, R + 1, 1.2, 40, 1, true, baseA - 0.55, 1.1), standMat);
        stand.position.y = -1 + row * 1.6;
        g.add(stand);
        for (let k = 0; k < 27 && n < count; k++, n++) {
          const a = baseA - 0.5 + (k / 26) * 1.0;
          const x = Math.sin(a) * R;
          const z = Math.cos(a) * R;
          const y = -0.1 + row * 1.6;
          this.crowdBase.push({ x, y, z, phase: Math.random() * 6, s: 0.8 + Math.random() * 0.4 });
          crowd.setColorAt(n, new THREE.Color(palette[Math.floor(Math.random() * palette.length)]));
        }
      }
    }
    crowd.count = n;
    g.add(crowd);
    return crowd;
  }

  private buildClouds() {
    const rng = mulberry(3);
    const mat = toon(0xffffff, { rim: 0.15 });
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      const parts = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < parts; k++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(4 + rng() * 5, 12, 10), mat);
        s.position.set(k * 5 - parts * 2.5, rng() * 2, rng() * 4);
        c.add(s);
      }
      const a = rng() * Math.PI * 2;
      const R = 120 + rng() * 120;
      c.position.set(Math.cos(a) * R, -30 + rng() * 70, Math.sin(a) * R);
      c.lookAt(0, c.position.y, 0);
      this.clouds.push(c);
      this.group.add(c);
    }
  }

  private buildBlimp() {
    const b = new THREE.Group();
    const body = part(new THREE.SphereGeometry(5, 20, 14), 0xe9eef8, 0.12);
    body.scale.set(1.6, 1, 1);
    b.add(body);
    const band = part(new THREE.CylinderGeometry(5.1, 5.1, 2, 20), 0x3e6fd8, 0.08);
    band.rotation.z = Math.PI / 2;
    band.scale.set(1, 1.6, 1);
    b.add(band);
    const gondola = part(new THREE.BoxGeometry(3, 1.4, 1.6), 0xb7bfd6, 0.06);
    gondola.position.y = -5.5;
    b.add(gondola);
    b.position.set(60, 40, -60);
    this.group.add(b);
    return b;
  }

  update(dt: number, edgeWarn: number) {
    this.t += dt;
    for (const w of this.waterfalls) w.offset.y -= dt * 0.8;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    this.crowdBase.forEach((c, i) => {
      const bounce = Math.max(0, Math.sin(this.t * 6 + c.phase)) * 0.35;
      p.set(c.x, c.y + bounce, c.z);
      s.set(c.s, c.s * (1 - bounce * 0.3), c.s);
      m.compose(p, q, s);
      this.crowd.setMatrixAt(i, m);
    });
    this.crowd.instanceMatrix.needsUpdate = true;
    this.clouds.forEach((c, i) => (c.position.y += Math.sin(this.t * 0.2 + i) * dt * 0.3));
    // Rocks bob very slightly (visual only; collision stays put).
    this.rocks.forEach((r, i) => (r.rotation.y = Math.sin(this.t * 0.3 + i) * 0.05));
    this.flags.forEach((f, i) => (f.rotation.y = Math.sin(this.t * 2.2 + i) * 0.25));
    const ba = this.t * 0.03;
    this.blimp.position.set(Math.cos(ba) * 90, 42 + Math.sin(this.t * 0.5) * 1.5, Math.sin(ba) * 90);
    this.blimp.rotation.y = -ba;
    const mat = this.edgeRing.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.25 + edgeWarn * (0.45 + Math.sin(this.t * 14) * 0.25);
  }
}

function makeWaterTex() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(120,200,255,0.85)';
  g.fillRect(0, 0, 32, 128);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 18; i++) g.fillRect(Math.random() * 28, Math.random() * 128, 2 + Math.random() * 3, 10 + Math.random() * 20);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
