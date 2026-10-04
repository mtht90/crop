import * as THREE from 'three';
import type { CharacterDef } from '../combat/types';
import { part, toon } from './toon';

export const JOINTS = [
  'body',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shL',
  'elL',
  'haL',
  'shR',
  'elR',
  'haR',
  'thL',
  'knL',
  'anL',
  'thR',
  'knR',
  'anR',
] as const;
export type Joint = (typeof JOINTS)[number];

export type Vec3 = [number, number, number];

/** A full pose: joint euler offsets plus root translations. */
export interface Pose {
  rot: Partial<Record<Joint, Vec3>>;
  /** Hips translation offset (crouch / bob). */
  hips?: Vec3;
  /** Whole-body translation (flips, lunges). */
  body?: Vec3;
}

const UPPER: Joint[] = ['spine', 'chest', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR'];
export const isUpper = (j: Joint) => UPPER.includes(j);

const HIPS_Y = 0.95;

export class Rig {
  readonly root = new THREE.Group();
  readonly joints = {} as Record<Joint, THREE.Group>;
  /** Tips used for weapon trails and muzzle flashes. */
  readonly tipL = new THREE.Object3D();
  readonly tipR = new THREE.Object3D();
  readonly ponytail: THREE.Group[] = [];
  readonly hairTufts: THREE.Group[] = [];
  readonly coatTails: THREE.Group[] = [];
  private brows: THREE.Mesh[] = [];
  private mouth: THREE.Mesh;

  constructor(readonly def: CharacterDef) {
    const L = def.look;
    const J = this.joints;
    const mk = (name: Joint, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      J[name] = g;
      return g;
    };
    const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12);

    const body = mk('body', this.root, 0, 0, 0);
    const hips = mk('hips', body, 0, HIPS_Y, 0);
    const spine = mk('spine', hips, 0, 0.1, 0);
    const chest = mk('chest', spine, 0, 0.2, 0);
    const neck = mk('neck', chest, 0, 0.26, 0);
    const head = mk('head', neck, 0, 0.08, 0);

    // --- Torso ---
    const pelvis = part(cap(0.16, 0.08), L.pants, 0.018);
    pelvis.scale.set(1.15, 1, 0.85);
    pelvis.position.y = -0.02;
    hips.add(pelvis);
    const belt = part(new THREE.TorusGeometry(0.17, 0.03, 6, 20), 0x2b2b3d, 0.01);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.12, 0.85, 1);
    belt.position.y = 0.07;
    hips.add(belt);
    const buckle = part(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), 0xffc93c, 0.008);
    buckle.rotation.x = Math.PI / 2;
    buckle.position.set(0, 0.07, 0.165);
    hips.add(buckle);
    const tank = part(cap(0.14, 0.12), 0x26263a, 0.018);
    tank.scale.set(1.05, 1, 0.8);
    tank.position.y = 0.08;
    spine.add(tank);
    // Open jacket: two side panels + shoulders.
    for (const s of [-1, 1]) {
      const panel = part(new THREE.BoxGeometry(0.11, 0.34, 0.26), L.top, 0.016);
      panel.position.set(s * 0.13, 0.06, -0.01);
      panel.rotation.z = s * 0.08;
      chest.add(panel);
      const stripe = part(new THREE.BoxGeometry(0.03, 0.34, 0.03), L.topAccent, 0.008);
      stripe.position.set(s * 0.075, 0.06, 0.13);
      chest.add(stripe);
    }
    const back = part(new THREE.BoxGeometry(0.34, 0.34, 0.08), L.top, 0.016);
    back.position.set(0, 0.06, -0.12);
    chest.add(back);
    const collar = part(new THREE.TorusGeometry(0.14, 0.055, 8, 18), L.topAccent, 0.014);
    collar.rotation.x = Math.PI / 2 - 0.3;
    collar.position.set(0, 0.22, -0.02);
    chest.add(collar);
    // Coat tails (spring driven).
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.12, -0.12, -0.08);
      const tail = part(new THREE.BoxGeometry(0.13, 0.22, 0.03), L.top, 0.012);
      tail.position.y = -0.11;
      pivot.add(tail);
      chest.add(pivot);
      this.coatTails.push(pivot);
    }

    // --- Head ---
    const skull = part(new THREE.SphereGeometry(0.2, 20, 16), L.skin, 0.02);
    skull.scale.set(1, 1.05, 1);
    skull.position.y = 0.14;
    head.add(skull);
    const neckMesh = part(cap(0.055, 0.08), L.skin, 0.012);
    neckMesh.position.y = 0.0;
    neck.add(neckMesh);
    // Eyes: large anime eyes with highlight.
    for (const s of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), toon(0xffffff, { rim: 0 }));
      white.scale.set(0.85, 1.15, 0.35);
      white.position.set(s * 0.075, 0.14, 0.175);
      white.rotation.y = s * 0.35;
      head.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), toon(L.eyes, { rim: 0 }));
      iris.scale.set(0.8, 1.15, 0.3);
      iris.position.set(s * 0.072, 0.135, 0.19);
      iris.rotation.y = s * 0.35;
      head.add(iris);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(s * 0.065 + 0.01, 0.155, 0.205);
      head.add(hl);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.02), toon(0x3a2418, { rim: 0 }));
      brow.position.set(s * 0.078, 0.215, 0.18);
      brow.rotation.z = -s * 0.32;
      brow.rotation.y = s * 0.3;
      head.add(brow);
      this.brows.push(brow);
    }
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), toon(0x7a2a2a, { rim: 0 }));
    this.mouth.scale.set(1.3, 0.5, 0.4);
    this.mouth.position.set(0, 0.055, 0.19);
    head.add(this.mouth);
    this.buildHair(head, L.hair, L.hairStyle);

    // --- Arms ---
    const arm = (s: 1 | -1) => {
      const side = s === 1 ? 'L' : 'R';
      const sh = mk(`sh${side}` as Joint, chest, s * 0.25, 0.17, 0);
      const shoulderPad = part(new THREE.SphereGeometry(0.09, 12, 10), L.top, 0.016);
      sh.add(shoulderPad);
      const upper = part(cap(0.065, 0.18), L.top, 0.016);
      upper.position.y = -0.14;
      sh.add(upper);
      const el = mk(`el${side}` as Joint, sh, 0, -0.29, 0);
      const cuff = part(new THREE.CylinderGeometry(0.075, 0.07, 0.07, 12), L.topAccent, 0.012);
      cuff.position.y = -0.01;
      el.add(cuff);
      const fore = part(cap(0.055, 0.16), L.skin, 0.014);
      fore.position.y = -0.12;
      el.add(fore);
      const ha = mk(`ha${side}` as Joint, el, 0, -0.27, 0);
      if (this.def.weapon === 'fists') {
        // Big chunky gauntlet.
        const glove = part(new THREE.SphereGeometry(0.1, 14, 12), L.glove, 0.016);
        glove.scale.set(1, 1.05, 1.05);
        glove.position.y = -0.04;
        ha.add(glove);
        const plate = part(new THREE.BoxGeometry(0.13, 0.1, 0.06), 0xe8463c, 0.012);
        plate.position.set(0, -0.06, -0.08);
        ha.add(plate);
        const wrist = part(new THREE.CylinderGeometry(0.085, 0.08, 0.07, 12), 0xe8463c, 0.012);
        wrist.position.y = 0.06;
        ha.add(wrist);
      } else {
        const glove = part(new THREE.SphereGeometry(0.075, 12, 10), L.glove, 0.014);
        ha.add(glove);
        const gun = buildBlaster();
        gun.rotation.x = Math.PI / 2;
        gun.position.set(0, -0.04, 0.03);
        ha.add(gun);
      }
      const tip = side === 'L' ? this.tipL : this.tipR;
      tip.position.set(0, this.def.weapon === 'guns' ? -0.38 : -0.1, 0);
      ha.add(tip);
    };
    arm(1);
    arm(-1);

    // --- Legs ---
    const leg = (s: 1 | -1) => {
      const side = s === 1 ? 'L' : 'R';
      const th = mk(`th${side}` as Joint, hips, s * 0.11, -0.04, 0);
      const thigh = part(cap(0.1, 0.24), L.pants, 0.018);
      thigh.position.y = -0.2;
      th.add(thigh);
      const kn = mk(`kn${side}` as Joint, th, 0, -0.42, 0);
      const shin = part(cap(0.09, 0.22), L.pants, 0.018);
      shin.scale.set(1.1, 1, 1.1);
      shin.position.y = -0.17;
      kn.add(shin);
      const sock = part(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10), 0x2b2b3d, 0.01);
      sock.position.y = -0.33;
      kn.add(sock);
      const an = mk(`an${side}` as Joint, kn, 0, -0.39, 0);
      const shoe = part(new THREE.BoxGeometry(0.15, 0.11, 0.28), L.shoes, 0.016);
      shoe.position.set(0, -0.04, 0.05);
      an.add(shoe);
      const sole = part(new THREE.BoxGeometry(0.16, 0.04, 0.3), 0xd8473c, 0.01);
      sole.position.set(0, -0.1, 0.05);
      an.add(sole);
    };
    leg(1);
    leg(-1);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name !== 'outline') o.castShadow = true;
    });
  }

  private buildHair(head: THREE.Group, color: number, style: 'ponytail' | 'spiky') {
    const cap = part(new THREE.SphereGeometry(0.215, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), color, 0.02);
    cap.position.y = 0.16;
    cap.rotation.x = -0.25;
    head.add(cap);
    const back = part(new THREE.SphereGeometry(0.2, 16, 12), color, 0.02);
    back.scale.set(1.05, 1, 0.8);
    back.position.set(0, 0.13, -0.06);
    head.add(back);
    // Bangs: spiky tufts over the forehead (spring driven).
    const bangs = style === 'spiky' ? 7 : 5;
    for (let i = 0; i < bangs; i++) {
      const a = (i / (bangs - 1) - 0.5) * 1.6;
      const pivot = new THREE.Group();
      pivot.position.set(Math.sin(a) * 0.17, 0.3, Math.cos(a) * 0.12);
      pivot.rotation.set(0.9 + Math.abs(a) * 0.2, a * 0.4, -a * 0.6);
      const spike = part(new THREE.ConeGeometry(0.06, 0.2, 6), color, 0.012);
      spike.position.y = 0.08;
      pivot.add(spike);
      head.add(pivot);
      this.hairTufts.push(pivot);
    }
    // Wild spikes on top/back.
    const spikes = style === 'spiky' ? 9 : 6;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.sin(a) * 0.12, 0.3, Math.cos(a) * 0.1 - 0.05);
      pivot.rotation.set(Math.cos(a) * 0.9 - 0.3, 0, -Math.sin(a) * 0.9);
      const spike = part(new THREE.ConeGeometry(0.075, style === 'spiky' ? 0.28 : 0.22, 6), color, 0.012);
      spike.position.y = 0.1;
      pivot.add(spike);
      head.add(pivot);
      this.hairTufts.push(pivot);
    }
    if (style === 'ponytail') {
      const tie = part(new THREE.TorusGeometry(0.045, 0.02, 6, 12), 0xffc93c, 0.008);
      tie.position.set(0, 0.36, -0.12);
      tie.rotation.x = 0.6;
      head.add(tie);
      let parent: THREE.Object3D = head;
      let y = 0;
      const sizes = [0.09, 0.08, 0.065, 0.045];
      sizes.forEach((r, i) => {
        const seg = new THREE.Group();
        if (i === 0) seg.position.set(0, 0.37, -0.14);
        else seg.position.set(0, y, 0);
        const m = part(new THREE.ConeGeometry(r, 0.22, 7), color, 0.012);
        m.rotation.x = Math.PI;
        m.position.y = -0.09;
        seg.add(m);
        parent.add(seg);
        this.ponytail.push(seg);
        parent = seg;
        y = -0.17;
      });
    }
  }

  /** Sets the facial expression: 0 = neutral grin, 1 = pain, 2 = shout. */
  setExpression(e: 0 | 1 | 2) {
    this.brows.forEach((b, i) => {
      const s = i === 0 ? -1 : 1;
      b.rotation.z = e === 1 ? s * 0.35 : -s * 0.32;
      b.position.y = e === 1 ? 0.225 : 0.215;
    });
    this.mouth.scale.set(e === 2 ? 1.4 : e === 1 ? 1.1 : 1.3, e === 2 ? 1.2 : e === 1 ? 0.8 : 0.5, 0.4);
  }

  applyPose(p: Pose) {
    const J = this.joints;
    for (const name of JOINTS) {
      const r = p.rot[name];
      if (r) J[name].rotation.set(r[0], r[1], r[2]);
      else J[name].rotation.set(0, 0, 0);
    }
    const h = p.hips ?? [0, 0, 0];
    J.hips.position.set(h[0], HIPS_Y + h[1], h[2]);
    const b = p.body ?? [0, 0, 0];
    J.body.position.set(b[0], b[1], b[2]);
  }
}

/** Chunky toy-like blaster matching the reference image (white/blue/orange with a star). */
export function buildBlaster(scale = 1) {
  const g = new THREE.Group();
  const body = part(new THREE.BoxGeometry(0.1, 0.12, 0.3), 0xf4f6fb, 0.012);
  body.position.z = 0.08;
  g.add(body);
  const top = part(new THREE.BoxGeometry(0.11, 0.05, 0.24), 0x3f6fe0, 0.01);
  top.position.set(0, 0.075, 0.08);
  g.add(top);
  const side = part(new THREE.BoxGeometry(0.12, 0.08, 0.12), 0xf2a516, 0.01);
  side.position.set(0, 0.0, -0.02);
  g.add(side);
  const barrel = part(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 10), 0x2b2b3d, 0.01);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.27;
  g.add(barrel);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: 0x6fe8ff }));
  lens.position.set(0, 0.105, 0.0);
  g.add(lens);
  const grip = part(new THREE.BoxGeometry(0.07, 0.15, 0.08), 0x2b2b3d, 0.01);
  grip.position.set(0, -0.11, -0.02);
  grip.rotation.x = -0.25;
  g.add(grip);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.045 : 0.02;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (const s of [-1, 1]) {
    const emblem = new THREE.Mesh(new THREE.ShapeGeometry(starShape), toon(0xffd22e, { rim: 0, emissive: 0x442200 }));
    emblem.position.set(s * 0.062, 0.0, 0.1);
    emblem.rotation.y = (s * Math.PI) / 2;
    emblem.rotation.z = Math.PI;
    g.add(emblem);
  }
  g.scale.setScalar(scale);
  return g;
}
