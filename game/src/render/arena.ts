import * as THREE from 'three';
import { ARENA_RADIUS } from '../config';
import { PADS, ROCKS } from '../combat/terrain';
import { part, toon } from './toon';
import { STAGES, type StageTheme } from './stages';
import { tex } from './textures';
import { pirateModel } from './weapons';

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
  private blimp: THREE.Group | null = null;
  private petals: THREE.Points | null = null;
  private ships: { obj: THREE.Object3D; r: number; a: number; speed: number; phase: number }[] = [];
  private sea: THREE.Texture | null = null;
  private t = 0;

  constructor(readonly theme: StageTheme = STAGES.sky) {
    const g = this.group;
    const T = theme;

    // Sky dome.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex.sky(T.id, T.sky), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.renderOrder = -10;
    g.add(sky);

    // Floor.
    const floorMat = new THREE.MeshToonMaterial({ map: T.floor === 'sakura' ? tex.floorSakura() : T.floor === 'deck' ? tex.floorDeck() : tex.floor(), gradientMap: (toon(0xffffff) as THREE.MeshToonMaterial).gradientMap });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS, 96), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // Rim band (yellow / blue like the reference).
    const rim = part(new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS - 0.2, 0.6, 96, 1, true), T.rim[0], 0.04);
    rim.position.y = -0.3;
    g.add(rim);
    const rim2 = part(new THREE.CylinderGeometry(ARENA_RADIUS - 0.2, ARENA_RADIUS - 1.5, 1.6, 96, 1, true), T.rim[1], 0.04);
    rim2.position.y = -1.4;
    g.add(rim2);
    // Rocky underside.
    const rock = part(new THREE.ConeGeometry(ARENA_RADIUS - 1.5, 14, 12, 3), T.rockSide, 0.06);
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
      const pad = part(new THREE.CylinderGeometry(r, r * 0.9, 0.9, 32), T.pads[0], 0.05);
      pad.position.set(x, y, z);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.92, 32), toon(T.pads[1]));
      pad.add(top);
      g.add(pad);
    }

    this.buildRocks();
    this.buildIslands();
    this.crowd = this.buildCrowd();
    this.buildClouds();
    if (T.blimp) this.blimp = this.buildBlimp();
    if (T.moon) this.buildMoon();
    if (T.petals) this.petals = this.buildPetals();
    if (T.sea) this.buildSea();
  }

  /** Ocean far below with pirate ships sailing slow circles (Kenney Pirate Kit, CC0). */
  private buildSea() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1f8fd0';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      g.beginPath();
      g.arc(x, y, 6 + Math.random() * 10, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(40, 40);
    t.colorSpace = THREE.SRGBColorSpace;
    this.sea = t;
    const sea = new THREE.Mesh(new THREE.CircleGeometry(700, 64), new THREE.MeshBasicMaterial({ map: t }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -34;
    this.group.add(sea);
    const fleet: [string, number, number][] = [
      ['ship-pirate-large', 90, 2.2],
      ['ship-pirate-medium', 120, 2.4],
      ['ship-large', 150, 2.6],
      ['ship-pirate-medium', 75, 2.0],
      ['ship-wreck', 110, 2.2],
      ['boat-row-small', 60, 2.4],
      ['ship-pirate-large', 170, 2.8],
    ];
    fleet.forEach(([name, r, s], i) => {
      const m = pirateModel(name, 0.05);
      if (!m) return;
      m.scale.setScalar(s);
      const holder = new THREE.Group();
      holder.add(m);
      this.group.add(holder);
      this.ships.push({ obj: holder, r, a: (i / fleet.length) * Math.PI * 2, speed: (i % 2 ? 1 : -1) * (0.015 + (i % 3) * 0.006), phase: i });
    });
    // Sandbars and rocks poking out of the water.
    for (let i = 0; i < 10; i++) {
      const m = pirateModel(['rocks-sand-a', 'rocks-sand-b', 'rocks-b'][i % 3], 0.05);
      if (!m) continue;
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const r = 80 + (i % 4) * 25;
      m.scale.setScalar(4 + (i % 3));
      m.position.set(Math.cos(a) * r, -34, Math.sin(a) * r);
      m.rotation.y = a * 3;
      this.group.add(m);
    }
  }

  private buildMoon() {
    const moon = new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshBasicMaterial({ color: 0xfff1d0, fog: false }));
    moon.position.set(-150, 70, -260);
    moon.lookAt(0, 20, 0);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.soft(), color: 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    halo.scale.setScalar(150);
    halo.position.copy(moon.position).multiplyScalar(1.01);
    moon.renderOrder = halo.renderOrder = -9;
    this.group.add(halo, moon);
  }

  /** Cherry petals drifting down over the ring. */
  private buildPetals() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc2d1, size: 0.22, map: tex.soft(), transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    this.group.add(pts);
    return pts;
  }

  /** Small floating rocks near the edge (also collision: shoot them to recoil back). */
  private buildRocks() {
    for (const [x, y, z, r] of ROCKS) {
      const rock = new THREE.Group();
      rock.position.set(x, y, z);
      const top = part(new THREE.CylinderGeometry(r * 1.02, r, 0.5, 10), this.theme.grass, 0.05);
      top.position.y = -0.25;
      rock.add(top);
      const mid = part(new THREE.ConeGeometry(r * 0.95, r * 1.5, 9, 2), this.theme.rockSide, 0.06);
      mid.rotation.x = Math.PI;
      mid.position.y = -0.5 - r * 0.75;
      rock.add(mid);
      const tuft = part(new THREE.ConeGeometry(r * 0.18, r * 0.5, 6), this.theme.foliage === 'sakura' ? 0xffb7c5 : this.theme.tree, 0.03);
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
      const rockMesh = part(new THREE.ConeGeometry(r, r * 1.6, 9, 2), this.theme.rockSide, 0.12);
      rockMesh.rotation.x = Math.PI;
      rockMesh.position.y = -r * 0.8;
      island.add(rockMesh);
      const grass = part(new THREE.CylinderGeometry(r * 1.02, r, r * 0.25, 9), this.theme.grass, 0.12);
      island.add(grass);
      const trees = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < trees; i++) {
        const a = rng() * Math.PI * 2;
        const d = rng() * r * 0.7;
        const palm = this.theme.foliage === 'palm' ? pirateModel(rng() < 0.5 ? 'palm-detailed-bend' : 'palm-detailed-straight', 0.03) : null;
        if (palm) palm.scale.setScalar(r * 0.13);
        const tree = palm ?? (this.theme.foliage === 'sakura' ? sakuraTree(r * 0.5, rng) : part(new THREE.ConeGeometry(r * 0.13, r * 0.6, 7), this.theme.tree, 0.06));
        if (palm) palm.rotation.y = rng() * Math.PI * 2;
        tree.position.set(Math.cos(a) * d, palm || this.theme.foliage === 'sakura' ? r * 0.12 : r * 0.4, Math.sin(a) * d);
        island.add(tree);
      }
      const towerRoll = rng() < 0.6;
      const fort = towerRoll && this.theme.tower === 'fort' ? pirateModel(rng() < 0.5 ? 'tower-complete-large' : 'tower-watch', 0.04) : null;
      if (fort) {
        fort.scale.setScalar(r * 0.07);
        fort.position.set(r * 0.25, r * 0.12, -r * 0.2);
        island.add(fort);
      } else if (towerRoll && this.theme.tower === 'pagoda') {
        const pg = pagoda(r * 0.5);
        pg.position.set(r * 0.2, r * 0.12, -r * 0.2);
        island.add(pg);
      } else if (towerRoll) {
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
        const wtex = makeWaterTex(this.theme.waterfall);
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

    if (this.theme.gates === 'torii') {
      this.buildTorii();
      return;
    }
    if (this.theme.gates === 'pirate') {
      this.buildPirateRing();
      return;
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

  /** Pirate flags on masts, cannons aimed at the ring, and piles of barrels, crates and chests. */
  private buildPirateRing() {
    const place = (name: string, a: number, R: number, y: number, s: number, face = true) => {
      const m = pirateModel(name, 0.03);
      if (!m) return null;
      m.scale.setScalar(s);
      m.position.set(Math.cos(a) * R, y, Math.sin(a) * R);
      if (face) m.lookAt(0, y, 0);
      this.group.add(m);
      return m;
    };
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      place('mast-ropes', a, ARENA_RADIUS + 10, -1, 1.4);
      place('flag-pirate-high', a + 0.08, ARENA_RADIUS + 10, -1, 1.6);
      place('cannon', a + Math.PI / 4, ARENA_RADIUS + 6, -0.6, 1.6);
    }
    const props = ['barrel', 'crate', 'chest', 'barrel'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + 0.2;
      place(props[i % 4], a, ARENA_RADIUS + 7.5, -0.8, 1.2, false);
      place('barrel', a + 0.06, ARENA_RADIUS + 8.6, -0.8, 1.0, false);
    }
  }

  /** Vermilion torii gates on the diagonals with stone lanterns between them. */
  private buildTorii() {
    const red = 0xd23a2e;
    const black = 0x2a2230;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const R = ARENA_RADIUS + 10;
      const gate = new THREE.Group();
      for (const sx of [-1, 1]) {
        const post = part(new THREE.CylinderGeometry(0.32, 0.38, 8, 10), red, 0.04);
        post.position.set(sx * 2.6, 1, 0);
        gate.add(post);
        const foot = part(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 10), black, 0.03);
        foot.position.set(sx * 2.6, -2.7, 0);
        gate.add(foot);
      }
      const kasagi = part(new THREE.BoxGeometry(7.6, 0.55, 0.8), black, 0.04);
      kasagi.position.y = 5.2;
      gate.add(kasagi);
      const shimaki = part(new THREE.BoxGeometry(7, 0.4, 0.65), red, 0.04);
      shimaki.position.y = 4.75;
      gate.add(shimaki);
      const nuki = part(new THREE.BoxGeometry(6.4, 0.35, 0.45), red, 0.04);
      nuki.position.y = 3.6;
      gate.add(nuki);
      const plaque = part(new THREE.BoxGeometry(0.8, 1, 0.2), black, 0.02);
      plaque.position.y = 4.15;
      gate.add(plaque);
      gate.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      gate.lookAt(0, 0, 0);
      this.group.add(gate);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const R = ARENA_RADIUS + 7;
      const l = stoneLantern();
      l.position.set(Math.cos(a) * R, -0.8, Math.sin(a) * R);
      this.group.add(l);
    }
  }

  private buildCrowd() {
    // Stands on two sides, filled with bouncing mascot blobs.
    const g = this.group;
    const standMat = toon(0xd9dce8);
    const blob = new THREE.SphereGeometry(0.55, 12, 10);
    const count = 220;
    const crowd = new THREE.InstancedMesh(blob, toon(0xffffff, { rim: 0.2 }), count);
    const palette = this.theme.crowd;
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
    const mat = toon(this.theme.cloud, { rim: 0.15 });
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
    if (this.blimp) {
      const ba = this.t * 0.03;
      this.blimp.position.set(Math.cos(ba) * 90, 42 + Math.sin(this.t * 0.5) * 1.5, Math.sin(ba) * 90);
      this.blimp.rotation.y = -ba;
    }
    if (this.sea) this.sea.offset.x += dt * 0.004;
    for (const s of this.ships) {
      s.a += s.speed * dt;
      s.obj.position.set(Math.cos(s.a) * s.r, -34 + Math.sin(this.t * 0.8 + s.phase) * 0.3, Math.sin(s.a) * s.r);
      // Bow along the direction of travel, rocking a little.
      s.obj.rotation.set(Math.sin(this.t * 0.9 + s.phase) * 0.04, -s.a + (s.speed > 0 ? Math.PI : 0), Math.sin(this.t * 0.7 + s.phase) * 0.05);
    }
    if (this.petals) {
      const a = this.petals.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * (1.2 + (i % 5) * 0.25);
        let x = a.getX(i) + Math.sin(this.t * 1.3 + i) * dt * 0.8 + dt * 0.6;
        if (y < -2) {
          y = 28;
          x = (Math.random() - 0.5) * 80;
        }
        if (x > 40) x -= 80;
        a.setXY(i, x, y);
      }
      a.needsUpdate = true;
    }
    const mat = this.edgeRing.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.25 + edgeWarn * (0.45 + Math.sin(this.t * 14) * 0.25);
  }
}

function sakuraTree(h: number, rng: () => number) {
  const t = new THREE.Group();
  const trunk = part(new THREE.CylinderGeometry(h * 0.06, h * 0.1, h * 0.7, 6), 0x5a3a2e, 0.04);
  trunk.position.y = h * 0.35;
  trunk.rotation.z = (rng() - 0.5) * 0.3;
  t.add(trunk);
  const pinks = [0xffb7c5, 0xffc9d6, 0xff9fb6];
  for (let i = 0; i < 4; i++) {
    const b = part(new THREE.IcosahedronGeometry(h * (0.28 + rng() * 0.12), 1), pinks[i % 3], 0.05);
    b.position.set((rng() - 0.5) * h * 0.5, h * (0.75 + rng() * 0.25), (rng() - 0.5) * h * 0.5);
    t.add(b);
  }
  return t;
}

/** Three-tier pagoda for the islands. */
function pagoda(h: number) {
  const g = new THREE.Group();
  let y = 0;
  for (let i = 0; i < 3; i++) {
    const w = h * (0.42 - i * 0.08);
    const body = part(new THREE.BoxGeometry(w, h * 0.22, w), 0xf2e6d6, 0.04);
    body.position.y = y + h * 0.11;
    g.add(body);
    const roof = part(new THREE.ConeGeometry(w * 1.05, h * 0.16, 4), 0x2d2a3a, 0.04);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = y + h * 0.3;
    g.add(roof);
    y += h * 0.3;
  }
  const spire = part(new THREE.CylinderGeometry(h * 0.015, h * 0.015, h * 0.25, 6), 0xe8c46a, 0.02);
  spire.position.y = y + h * 0.12;
  g.add(spire);
  return g;
}

function stoneLantern() {
  const g = new THREE.Group();
  const stone = 0xb8b0a8;
  const base = part(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 6), stone, 0.03);
  g.add(base);
  const post = part(new THREE.CylinderGeometry(0.18, 0.22, 1.4, 6), stone, 0.03);
  post.position.y = 0.9;
  g.add(post);
  const box = part(new THREE.BoxGeometry(0.75, 0.6, 0.75), stone, 0.03);
  box.position.y = 1.9;
  g.add(box);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.78), new THREE.MeshBasicMaterial({ color: 0xffc46a }));
  light.position.y = 1.9;
  g.add(light);
  const roof = part(new THREE.ConeGeometry(0.75, 0.55, 6), stone, 0.03);
  roof.position.y = 2.45;
  g.add(roof);
  return g;
}

function makeWaterTex(color = 'rgba(120,200,255,0.85)') {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
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
