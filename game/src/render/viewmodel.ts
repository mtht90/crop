import * as THREE from 'three';
import type { Fighter } from '../combat/fighter';
import { phaseOf } from '../combat/phase';
import { clamp, damp, ease, lerp, rand, Spring } from '../core/math';
import { Trail } from './effects';
import { buildArmCannon, buildBlaster, buildCardFan, buildRifle, buildBowMesh, buildBoxingGlove, buildHookGun, buildKatana, buildToyHammer, buildUmbrella, buildYoyo, KATANA_TIP_Y } from './weapons';
import { yoyoPose, yoyoScale } from './yoyo';
import { buildFpHand } from './fpHand';
import { tex } from './textures';
import { part } from './toon';

interface ArmState {
  root: THREE.Group;
  tip: THREE.Object3D;
  base: THREE.Vector3;
  recoilZ: Spring;
  recoilX: Spring;
  trail: Trail;
  flash: THREE.Sprite;
  flashT: number;
}

type Offset = { p: THREE.Vector3; r: THREE.Euler };
const off = (): Offset => ({ p: new THREE.Vector3(), r: new THREE.Euler() });

/** Rest positions of the first-person hands per weapon (camera space). */
const BASE: Record<string, { L: [number, number, number]; R: [number, number, number] }> = {
  fists: { L: [-0.3, -0.3, -0.62], R: [0.3, -0.3, -0.62] },
  guns: { L: [-0.27, -0.29, -0.66], R: [0.27, -0.29, -0.66] },
  bow: { L: [-0.2, -0.24, -0.7], R: [0.2, -0.3, -0.5] },
  hammer: { L: [0.22, -0.48, -0.56], R: [0.4, -0.44, -0.62] },
  katana: { L: [-0.3, -0.42, -0.5], R: [0.3, -0.36, -0.58] },
  yoyo: { L: [-0.3, -0.32, -0.6], R: [0.28, -0.3, -0.6] },
  grapple: { L: [-0.3, -0.3, -0.62], R: [0.27, -0.29, -0.66] },
  umbrella: { L: [-0.3, -0.42, -0.5], R: [0.3, -0.4, -0.6] },
  cannon: { L: [-0.32, -0.32, -0.6], R: [0.3, -0.36, -0.58] },
  cards: { L: [-0.3, -0.33, -0.6], R: [0.28, -0.3, -0.58] },
  rifle: { L: [0.02, -0.29, -0.72], R: [0.17, -0.26, -0.46] },
};
const YAW_BIAS: Record<string, number> = { fists: 0.12, guns: 0.07, bow: 0.05, hammer: 0, katana: 0.04, yoyo: 0.08, grapple: 0.09, umbrella: 0.04, cannon: 0.08, cards: 0.08, rifle: 0.03 };

/**
 * First-person arms/weapons rendered in their own scene on top of the world.
 * All motion is procedural: idle sway, run bob, mouse-lag, per-move curves
 * driven by the same anticipation/strike/recovery timeline as the hitboxes.
 */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  private arms: { L: ArmState; R: ArmState };
  private t = 0;
  private swayX = new Spring(90, 12);
  private swayY = new Spring(90, 12);
  private landDip = new Spring(160, 12);
  private hitShake = new Spring(300, 10);
  private guardW = 0;
  private dashW = 0;
  private reloadSpin = 0;
  private lastShots = { L: 0, R: 0 };
  private lastLand = 0;
  private lastHit = 0;
  private aura: THREE.Sprite[] = [];
  private fighter: Fighter | null = null;
  private auraColor = new THREE.Color();
  private bow: ReturnType<typeof buildBowMesh> | null = null;
  private nocked: THREE.Group | null = null;
  private hammer: THREE.Group | null = null;
  private umbrella: ReturnType<typeof buildUmbrella> | null = null;
  private umbrellaOpen = 0;
  private umbrellaShield = 0;
  private yoyo: THREE.Group | null = null;
  private yoyoString: THREE.Line | null = null;
  private yoyoSpin = 0;
  private hookClaw: THREE.Object3D | null = null;
  /** Set by the view while the hook is out. */
  hookOut = false;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899cc, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(0.6, 1, 0.4);
    this.scene.add(sun);
    this.scene.add(this.camera);
    this.arms = { L: this.emptyArm(-1), R: this.emptyArm(1) };
  }

  private emptyArm(s: number): ArmState {
    const root = new THREE.Group();
    this.camera.add(root);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.burst(), color: 0xffe26b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.visible = false;
    const trail = new Trail(0xffffff, 0.05, 0.1, 16);
    this.camera.add(trail.mesh);
    return {
      root,
      tip: new THREE.Object3D(),
      base: new THREE.Vector3(0.27 * s, -0.27, -0.5),
      recoilZ: new Spring(260, 14),
      recoilX: new Spring(220, 12),
      trail,
      flash,
      flashT: 0,
    };
  }

  /** Builds arms for the given character (fists or blasters). */
  setFighter(f: Fighter) {
    this.fighter = f;
    const L = f.def.look;
    this.auraColor.set(f.def.element.color);
    for (const side of ['L', 'R'] as const) {
      const a = this.arms[side];
      a.root.clear();
      a.trail.setColor(f.def.element.color);
      // Rolled-up sleeve behind the bare forearm (the hand and forearm come from the body model).
      const sleeve = part(new THREE.CylinderGeometry(0.058, 0.066, 0.34, 14), L.top, 0.006);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.set(0, -0.025, 0.47);
      a.root.add(sleeve);
      const cuff = part(new THREE.TorusGeometry(0.058, 0.014, 8, 18), L.topAccent, 0.004);
      cuff.position.set(0, -0.025, 0.3);
      a.root.add(cuff);
      const w = f.def.weapon;
      // Real hands cut from the character model; fingers curled to fit the weapon.
      const addHand = (grip: number, z = 0.06, y = -0.02) => {
        const h = buildFpHand(f.def, side, grip);
        h.position.set(0, y, z);
        a.root.add(h);
        return h;
      };
      if (w === 'katana' || w === 'umbrella' || w === 'yoyo' || (w === 'grapple' && side === 'R')) {
        addHand(w === 'yoyo' ? 0.45 : side === 'R' ? 0.9 : 0.5);
        if (w === 'katana' && side === 'R') {
          const k = buildKatana(0.85);
          k.position.set(0, -0.03, -0.02);
          a.root.add(k);
          a.tip.position.set(0, KATANA_TIP_Y, -0.03);
          k.add(a.tip);
        } else if (w === 'umbrella' && side === 'R') {
          const u = buildUmbrella(L.top, L.topAccent, 0.75);
          u.group.position.set(0, -0.03, -0.02);
          a.root.add(u.group);
          this.umbrella = u;
          a.tip.position.set(0, u.tipY / 0.75, 0);
          u.group.add(a.tip);
        } else if (w === 'grapple') {
          const g = buildHookGun(0.85);
          g.group.rotation.y = Math.PI;
          g.group.position.set(0, 0.02, -0.04);
          a.root.add(g.group);
          this.hookClaw = g.claw;
          a.tip.position.set(0, 0.02, -0.3);
        } else {
          a.tip.position.set(0, 0, -0.08);
        }
      } else if (w === 'rifle') {
        addHand(side === 'R' ? 0.95 : 0.7, -0.01);
        if (side === 'R') {
          // Rifle shouldered: stock back by the cheek, barrel reaching past the left hand.
          const r = buildRifle(0.72);
          r.group.position.set(-0.03, 0.05, 0.02);
          a.root.add(r.group);
          a.tip.position.set(-0.03, 0.08, -r.muzzleZ * 0.9);
        } else a.tip.position.set(0, 0, -0.18);
      } else if (w === 'cards') {
        addHand(side === 'R' ? 0.55 : 0.4, -0.01);
        if (side === 'R') {
          const fan = buildCardFan(L.topAccent, 1.2);
          fan.rotation.set(-0.4, 0, 0.3);
          fan.position.set(0, 0.05, -0.08);
          a.root.add(fan);
        }
        a.tip.position.set(0, 0.04, -0.14);
      } else if (w === 'cannon') {
        addHand(1, -0.01);
        if (side === 'R') {
          // Arm cannon over the forearm, muzzle forward (-Z).
          const c = buildArmCannon(0.5);
          c.position.set(0, 0.05, 0.04);
          a.root.add(c);
          a.tip.position.set(0, 0.06, -0.3);
        } else a.tip.position.set(0, 0, -0.18);
      } else if (w === 'grapple') {
        addHand(1, -0.01);
        a.tip.position.set(0, 0, -0.18);
      } else if (w === 'bow' || w === 'hammer') {
        addHand(w === 'bow' ? (side === 'L' ? 0.85 : 0.35) : side === 'R' ? 0.9 : 0.6);
        if (w === 'bow' && side === 'L') {
          const bow = buildBowMesh(0.7);
          // Back of the bow faces away from the camera, limbs vertical with a slight cant.
          bow.group.rotation.set(0, Math.PI / 2, 0.18);
          bow.group.position.set(0, 0, -0.04);
          a.root.add(bow.group);
          this.bow = bow;
          a.tip.position.set(0, 0, -0.1);
        } else if (w === 'hammer' && side === 'R') {
          const h = buildToyHammer(L.topAccent);
          h.position.set(0, -0.06, 0);
          // Show the bellows in profile rather than the cap face.
          h.rotation.y = -1.25;
          h.scale.setScalar(0.62);
          a.root.add(h);
          this.hammer = h;
          a.tip.position.set(0, 0.72, 0);
          h.add(a.tip);
        } else {
          a.tip.position.set(0, 0, -0.08);
        }
      } else if (f.def.weapon === 'fists') {
        // Boxing gloves, knuckles forward.
        const glove = buildBoxingGlove(f.def.element.color, 0xffffff, 1.15);
        glove.rotation.y = Math.PI;
        if (side === 'L') glove.scale.x *= -1;
        glove.position.set(0, -0.02, 0.02);
        a.root.add(glove);
        a.tip.position.set(0, 0, -0.18);
      } else {
        addHand(0.9, 0.07, -0.03);
        const gun = buildBlaster(0.85);
        gun.rotation.y = Math.PI;
        gun.position.set(0, 0.02, -0.04);
        a.root.add(gun);
        a.tip.position.set(0, 0.02, -0.3);
      }
      if (!a.tip.parent) a.root.add(a.tip);
      a.flash.position.copy(a.tip.position);
      a.flash.scale.setScalar(0.25);
      a.root.add(a.flash);
      const b = BASE[f.def.weapon][side];
      a.base.set(b[0], b[1], b[2]);
      a.root.position.copy(a.base);
    }
    if (f.def.weapon !== 'bow') this.bow = null;
    if (f.def.weapon !== 'hammer') this.hammer = null;
    if (f.def.weapon !== 'umbrella') this.umbrella = null;
    if (f.def.weapon !== 'grapple') this.hookClaw = null;
    if (this.yoyo) this.camera.remove(this.yoyo);
    if (this.yoyoString) this.camera.remove(this.yoyoString);
    this.yoyo = this.yoyoString = null;
    if (f.def.weapon === 'yoyo') {
      this.yoyo = buildYoyo(f.def.element.color, f.def.element.color2, 0.8);
      this.camera.add(this.yoyo);
      this.yoyoString = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
      this.yoyoString.frustumCulled = false;
      this.camera.add(this.yoyoString);
    }
    if (this.nocked) this.camera.remove(this.nocked);
    this.nocked = null;
    if (f.def.weapon === 'bow') {
      // Arrow shown on the string while drawing.
      const g = new THREE.Group();
      const shaft = part(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), 0x8a5a32, 0);
      shaft.rotation.x = Math.PI / 2;
      g.add(shaft);
      const tipM = part(new THREE.ConeGeometry(0.02, 0.07, 6), 0xe8eef8, 0.004);
      tipM.rotation.x = -Math.PI / 2;
      tipM.position.z = -0.52;
      g.add(tipM);
      g.visible = false;
      this.camera.add(g);
      this.nocked = g;
    }
    this.aura.forEach((s) => this.camera.remove(s));
    this.aura = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: i % 2 ? tex.star() : tex.soft(), color: f.def.element.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      this.camera.add(s);
      this.aura.push(s);
    }
    this.lastShots = { ...f.shotCounter };
    this.lastLand = f.landCounter;
    this.lastHit = f.hitCounter;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, sway: { x: number; y: number }, visible: boolean) {
    const f = this.fighter;
    this.scene.visible = visible && !!f;
    if (!f) return;
    this.t += dt;

    // Mouse lag sway.
    this.swayX.target = clamp(-sway.x * 0.0009, -0.06, 0.06);
    this.swayY.target = clamp(sway.y * 0.0009, -0.05, 0.05);
    this.swayX.update(dt);
    this.swayY.update(dt);

    if (f.landCounter !== this.lastLand) {
      this.lastLand = f.landCounter;
      this.landDip.impulse(-1.2 * (0.4 + f.landStrength));
    }
    if (f.hitCounter !== this.lastHit) {
      this.lastHit = f.hitCounter;
      this.hitShake.impulse(6 + f.lastHitStrength * 10);
    }
    this.landDip.update(dt);
    this.hitShake.update(dt);

    for (const side of ['L', 'R'] as const) {
      if (f.shotCounter[side] !== this.lastShots[side]) {
        const big = f.action?.def.kind !== 'attack';
        this.lastShots[side] = f.shotCounter[side];
        const a = this.arms[side];
        a.recoilZ.impulse(big ? 4.5 : 2.4);
        a.recoilX.impulse(big ? 9 : 5);
        a.flashT = big ? 0.08 : 0.045;
        (a.flash.material as THREE.SpriteMaterial).rotation = Math.random() * 6;
        (a.flash.material as THREE.SpriteMaterial).color.set(f.def.element.color);
      }
    }

    const speed = Math.hypot(f.vel.x, f.vel.z);
    const run = f.grounded ? clamp(speed / f.def.walkSpeed, 0, 1) : 0;
    const phase = (f.stride / 2.0) * Math.PI * 2;
    this.guardW = damp(this.guardW, f.guarding ? 1 : 0, 22, dt);
    this.dashW = damp(this.dashW, f.state === 'dash' ? 1 : 0, f.state === 'dash' ? 30 : 10, dt);
    this.reloadSpin = f.reloadT > 0 ? 1 - f.reloadT / (f.def.reloadFrames ?? 60) : 0;

    const dashLocal = { x: f.dashDir.dot(f.right()), z: f.dashDir.dot(f.forward()) };

    for (const side of ['L', 'R'] as const) {
      const a = this.arms[side];
      const s = side === 'L' ? -1 : 1;
      const o = off();

      // Idle breathing + run bob (figure-eight).
      const breath = Math.sin(this.t * 2.2 + (s > 0 ? 0 : 0.6)) * 0.006;
      o.p.y += breath;
      o.p.x += Math.cos(phase) * 0.018 * run;
      o.p.y += -Math.abs(Math.sin(phase)) * 0.025 * run;
      o.r.z += Math.cos(phase) * 0.05 * run * s;

      // Air pose: arms drift up/out.
      if (!f.grounded && f.state !== 'action') {
        o.p.y += clamp(-f.vel.y * 0.004, -0.04, 0.05);
        o.p.x += 0.02 * s;
      }

      this.actionOffset(f, side, o);
      if (f.gliding && f.def.weapon === 'umbrella' && f.state === 'free' && side === 'R') {
        // Umbrella overhead while floating down.
        o.r.x += 0.3;
        o.r.z += -0.35;
        o.p.x -= 0.22;
        o.p.y += 0.1;
      }
      if (f.grapple && !f.grapple.forced) {
        // Reeling in: launcher thrust forward, the free hand braced.
        if (side === 'R') {
          o.p.z -= 0.14;
          o.p.x -= 0.06;
          o.p.y += 0.06;
          o.r.x += 0.12;
        } else {
          o.p.y -= 0.04;
          o.p.z += 0.04;
        }
      }

      if (this.guardW > 0.001) {
      // Guard: cross the arms in front of the face.
        const g = this.guardW;
        o.p.x += lerp(0, -0.17 * s, g);
        o.p.y += lerp(0, 0.12, g);
        o.p.z += lerp(0, 0.06, g);
        o.r.z += -0.9 * s * g;
        o.r.y += 0.35 * s * g;
        o.r.x += 0.25 * g;
      }

      // Dash: arms swept opposite the dash direction.
      if (this.dashW > 0.001) {
        o.p.x += -dashLocal.x * 0.12 * this.dashW;
        o.p.z += dashLocal.z * 0.1 * this.dashW;
        o.p.y += -0.04 * this.dashW;
        o.r.z += dashLocal.x * 0.4 * this.dashW;
      }

      // Hitstun / knockdown: arms flung.
      if (f.state === 'hitstun' || f.state === 'tumble' || f.state === 'guardbreak') {
        o.p.y -= 0.08;
        o.p.x += 0.05 * s;
        o.r.x += -0.4;
      }
      if (f.state === 'knockdown' || f.state === 'getup' || f.state === 'ko' || f.state === 'ringout') {
        o.p.y -= 0.25;
      }

      // Reload: dip and spin the blasters.
      if (this.reloadSpin > 0) {
        const r = this.reloadSpin;
        const dip = Math.sin(r * Math.PI);
        o.p.y -= 0.12 * dip;
        o.r.x += -r * Math.PI * 2;
        o.r.z += 0.4 * dip * s;
      }

      a.recoilZ.update(dt);
      a.recoilX.update(dt);
      o.p.z += a.recoilZ.value * 0.025;
      o.r.x += a.recoilX.value * 0.03;
      o.p.y += a.recoilX.value * 0.004;

      const shake = this.hitShake.value * 0.004;
      a.root.position.set(
        a.base.x + o.p.x + this.swayX.value + (Math.random() - 0.5) * shake,
        a.base.y + o.p.y + this.swayY.value + this.landDip.value * 0.03,
        a.base.z + o.p.z,
      );
      const yawBias = (YAW_BIAS[f.def.weapon] ?? 0) * s;
      // Hammer held at the lower right, head leaning forward and inward.
      const blade = (f.def.weapon === 'katana' || f.def.weapon === 'umbrella') && side === 'R';
      const restX = f.def.weapon === 'hammer' && side === 'R' ? -0.2 : blade ? -0.55 : 0;
      const restZ = f.def.weapon === 'hammer' && side === 'R' ? 0.22 : blade ? 0.35 : 0;
      a.root.rotation.set(o.r.x + restX + this.swayY.value * 2, o.r.y + this.swayX.value * 2 + yawBias, o.r.z + restZ);

      a.flashT -= dt;
      a.flash.visible = a.flashT > 0;
      if (a.flash.visible) a.flash.scale.setScalar(0.22 + Math.random() * 0.12);

      // Trail from the fist tip while striking.
      const w = f.def.weapon;
      const strike = f.action && phaseOf(f.action.def, f.action.frame).stage === 'strike' && (w === 'fists' || (w === 'grapple' && !f.action.def.spawns) || ((w === 'hammer' || w === 'katana' || w === 'umbrella') && side === 'R'));
      a.trail.emitting = !!strike;
      const tipPos = a.tip.getWorldPosition(new THREE.Vector3());
      this.camera.worldToLocal(tipPos);
      a.trail.update(dt, tipPos, new THREE.Vector3(0, 0, 0));
    }

    this.updateBow(f);
    this.updateExtras(f, dt);
    if (this.hammer) {
      // Giant hammer for the ult.
      const act = f.action;
      let k = 1;
      if (act?.def.anim === 'gigaPiko') {
        const fr = act.frame;
        k = fr < 10 ? 1 : fr < 32 ? 1 + 1.6 * ease.outBack((fr - 10) / 22) : fr < 70 ? 2.6 : 2.6 - 1.6 * ease.inOutQuad(Math.min(1, (fr - 70) / 15));
      }
      this.hammer.scale.setScalar(k * 0.62);
    }

    // Ult ready aura swirling around both hands.
    const ready = f.ult >= 100 || f.action?.def.kind === 'ult';
    this.aura.forEach((sp, i) => {
      sp.visible = ready;
      if (!ready) return;
      const arm = i % 2 ? this.arms.R : this.arms.L;
      const a = this.t * 4 + i * 1.7;
      const r = 0.09 + (i % 3) * 0.02;
      sp.position.set(arm.root.position.x + Math.cos(a) * r, arm.root.position.y + Math.sin(a * 1.3) * r, arm.root.position.z - 0.08 + Math.sin(a) * r);
      sp.scale.setScalar(0.04 + Math.abs(Math.sin(a * 2)) * 0.05);
    });
  }

  /** Umbrella canopy, yo-yo flight and the hook launcher's claw. */
  private updateExtras(f: Fighter, dt: number) {
    const anim = f.state === 'action' ? f.action?.def.anim : undefined;
    if (this.umbrella) {
      const open = f.canopyBroken === 0 && (f.gliding || anim === 'umbrellaOpen' || anim === 'umbrellaRush' || anim === 'updraft' || anim === 'shieldFire');
      this.umbrellaOpen = damp(this.umbrellaOpen, open ? 1 : 0, open ? 30 : 12, dt);
      this.umbrella.setOpen(this.umbrellaOpen);
      this.umbrella.group.visible = !f.umbrellaOut;
      // Shield: swing the canopy round to face forward like a round shield.
      const shield = f.canopyBroken === 0 && (anim === 'umbrellaOpen' || anim === 'shieldFire' || anim === 'umbrellaRush');
      this.umbrellaShield = damp(this.umbrellaShield, shield ? 1 : 0, 25, dt);
      this.umbrella.group.rotation.set(-1.2 * this.umbrellaShield, 0, -0.45 * this.umbrellaShield);
    }
    if (this.hookClaw) this.hookClaw.visible = !this.hookOut;
    const yo = this.yoyo;
    if (yo && this.yoyoString) {
      this.camera.updateMatrixWorld(true);
      const hand = this.arms.R.root.position.clone().add(new THREE.Vector3(0, 0, -0.08));
      const pose = yoyoPose(f);
      if (pose.mode === 'line') {
        const u = clamp(pose.dist / 2, 0, 1);
        yo.position.set(hand.x * (1 - u), hand.y * (1 - u) + 0.02 * u, -0.1 - pose.dist);
      } else if (pose.mode === 'orbit') {
        yo.position.set(Math.sin(pose.angle) * 1.4, -0.25 + (pose.height - 0.9) * 0.3, -Math.cos(pose.angle) * 1.4 - 0.2);
      } else {
        yo.position.copy(hand).add(new THREE.Vector3(-0.04, -0.13 + Math.sin(this.t * 4) * 0.02, -0.05));
      }
      this.yoyoSpin += pose.mode === 'hand' ? 0.1 : 0.6;
      yo.rotation.set(this.yoyoSpin, 0, 0);
      yo.scale.setScalar(0.8 * yoyoScale(f));
      const pos = this.yoyoString.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, hand.x, hand.y, hand.z);
      pos.setXYZ(1, yo.position.x, yo.position.y, yo.position.z);
      pos.needsUpdate = true;
    }
  }

  /** Bow string follows the right hand while drawing; the arrow sits on the string. */
  private updateBow(f: Fighter) {
    const bow = this.bow;
    if (!bow) return;
    const act = f.action;
    let drawing = false;
    if (act && f.state === 'action' && (act.def.anim === 'drawShot' || act.def.anim === 'triShot' || act.def.anim === 'arrowRain')) {
      const ph = phaseOf(act.def, act.frame);
      drawing = ph.stage === 'windup' || (act.def.anim === 'arrowRain' && act.frame < 90 && act.frame % 5 < 3);
    }
    this.camera.updateMatrixWorld(true);
    const hand = this.arms.R.root.getWorldPosition(new THREE.Vector3());
    if (drawing) {
      const local = bow.group.worldToLocal(hand.clone());
      bow.setNock(local);
    } else bow.setNock(null);
    if (this.nocked) {
      this.nocked.visible = drawing;
      if (drawing) {
        const grip = bow.group.getWorldPosition(new THREE.Vector3());
        const a = this.camera.worldToLocal(hand.clone());
        const b = this.camera.worldToLocal(grip);
        this.nocked.position.copy(a);
        this.nocked.lookAt(a.clone().multiplyScalar(2).sub(b));
        this.nocked.translateZ(-0.45);
      }
    }
  }

  /** Per-move procedural curves, keyed by animation id. */
  private actionOffset(f: Fighter, side: 'L' | 'R', o: Offset) {
    const act = f.action;
    if (!act || f.state !== 'action') return;
    const id = act.def.anim;
    const ph = phaseOf(act.def, act.frame);
    const s = side === 'L' ? -1 : 1;

    // Generic punch curve: pull back (anticipation) -> snap out -> ease back.
    const punch = (amt: number) => {
      if (ph.stage === 'windup') return -0.35 * ease.outCubic(ph.t) * amt;
      if (ph.stage === 'strike') return lerp(-0.35, 1, ease.outExpo(Math.min(1, ph.t * 1.6))) * amt;
      return lerp(1, 0, ease.inOutQuad(ph.t)) * amt;
    };

    // Hammer swing helper: rotates the arm from a windup angle to a strike angle.
    const swing = (wind: [number, number, number], hit: [number, number, number], push = 0) => {
      let k: [number, number, number];
      let fwd = 0;
      if (ph.stage === 'windup') {
        const t = ease.outCubic(ph.t);
        k = [wind[0] * t, wind[1] * t, wind[2] * t];
      } else if (ph.stage === 'strike') {
        const t = ease.outExpo(Math.min(1, ph.t * 1.5));
        k = [lerp(wind[0], hit[0], t), lerp(wind[1], hit[1], t), lerp(wind[2], hit[2], t)];
        fwd = push * t;
      } else {
        const t = ease.inOutQuad(ph.t);
        k = [lerp(hit[0], 0, t), lerp(hit[1], 0, t), lerp(hit[2], 0, t)];
        fwd = push * (1 - t);
      }
      o.r.x += k[0];
      o.r.y += k[1];
      o.r.z += k[2];
      o.p.z -= fwd;
      o.p.y += Math.max(0, k[0]) * 0.08;
    };

    switch (id) {
      case 'swingA':
        swing([0.2, 0.9, -0.4], [-0.9, -1.1, -0.5], 0.15);
        if (side === 'L') o.p.x += o.r.y * 0.1;
        break;
      case 'swingB':
        swing([0.2, -0.8, 0.3], [-0.9, 1.0, 0.2], 0.15);
        break;
      case 'smash':
      case 'airSmash':
      case 'groundPound':
      case 'gigaPiko':
        swing([1.1, -0.2, -0.3], [-1.5, -0.1, -0.35], 0.18);
        o.p.x += side === 'R' ? -0.08 : 0.04;
        break;
      case 'pikoDash':
        swing([0.5, 0.3, 0], [-1.2, -0.2, -0.3], 0.3);
        break;
      // --- Katana -------------------------------------------------------
      case 'slashA':
      case 'iaiStrike':
        if (side === 'R') swing([0.5, 0.6, 0.6], [-1.0, -1.2, -0.9], 0.18);
        break;
      case 'slashB':
        if (side === 'R') swing([0.3, -1.0, -0.6], [-0.7, 1.1, 0.8], 0.18);
        break;
      case 'slashC':
      case 'passSlash':
        if (side === 'R') swing([0.4, 0.3, 0], [-1.3, 0.1, -0.2], 0.32);
        break;
      case 'airSlash':
        if (side === 'R') swing([0.9, 0.2, 0.2], [-1.4, -0.3, -0.3], 0.15);
        break;
      case 'tsubame':
        if (side === 'R') swing([-0.6, 0.2, 0], [1.2, -0.2, 0.3], 0.1);
        break;
      case 'iai':
        // Low ready stance, blade drawn back to the hip.
        o.p.y -= 0.08;
        o.p.x += side === 'R' ? -0.1 : 0.1;
        if (side === 'R') o.r.x += -0.6;
        break;
      case 'getsuei': {
        const fr = act.frame;
        if (side !== 'R') break;
        if (fr < 26) o.p.z += 0.08;
        else if (fr < 62) {
          const p = ((fr - 26) % 5) / 5;
          const dir = Math.floor((fr - 26) / 5) % 2 ? 1 : -1;
          o.r.y += dir * lerp(1.0, -1.0, p);
          o.r.x += -0.6;
          o.p.z -= 0.15;
        } else swing([0.6, 0.4, 0], [-1.5, -0.2, -0.3], 0.3);
        break;
      }
      // --- Yo-yo --------------------------------------------------------
      case 'yoyoShot':
      case 'yoyoShot2':
      case 'airYoyo':
      case 'snare':
      case 'walkDog':
      case 'giantYoyo':
        if (side === 'R') {
          const k = punch(1);
          o.p.z -= 0.25 * k;
          o.p.x -= 0.08 * Math.max(0, k);
          o.r.x += id === 'walkDog' ? -0.5 * Math.max(0, k) : 0;
        }
        break;
      case 'aroundWorld':
      case 'loopUp':
        if (side === 'R') {
          o.p.y += 0.1;
          o.r.z += -0.5;
        }
        break;
      // --- Grappler -----------------------------------------------------
      case 'cardThrow':
      case 'mirrorHouse':
        if (side === 'R') swing([0.2, 0.5, 0], [-0.2, -0.6, 0], 0.15);
        break;
      case 'mirage':
        o.p.z += 0.1;
        o.r.z += side === 'R' ? -0.5 : 0.5;
        break;
      case 'doveLift':
        o.p.y += 0.15;
        o.r.x += 0.6;
        break;
      case 'caneDash':
      case 'buttStrike':
        if (side === 'R') swing([0.4, 0, 0], [-0.6, 0, 0], 0.25);
        break;
      case 'snipe':
      case 'markDart':
      case 'deadEye': {
        const k = ph.stage === 'strike' ? 1 - ph.t : 0;
        o.p.z += 0.1 * k;
        o.r.x += 0.18 * k;
        break;
      }
      case 'cannonShot':
      case 'fullBurst':
        if (side === 'R') {
          // Brace and kick back with each shot.
          const k = ph.stage === 'strike' ? 1 - ph.t : ph.stage === 'windup' ? ph.t * 0.3 : 0;
          o.p.z += 0.12 * k;
          o.r.x += 0.25 * k;
          o.p.x -= 0.06;
        }
        break;
      case 'groundSlam':
        if (side === 'R') swing([-1.0, 0, 0], [1.1, 0, 0], 0.1);
        break;
      case 'cannonJump':
        if (side === 'R') {
          o.r.x += 1.2;
          o.p.y -= 0.12;
        }
        break;
      case 'shoulderTackle':
        o.p.x += side === 'L' ? 0.12 : 0.04;
        o.p.y -= 0.06;
        break;
      case 'hookShot':
      case 'tetherShot':
      case 'reelIn':
        if (side === 'R') {
          o.p.x -= 0.1;
          o.p.y += 0.03;
        }
        break;
      case 'reelFinisher':
        if (side === 'L') {
          if (act.connected) swing([-0.3, 0, 0], [1.4, 0, 0], 0.15);
          else o.p.y -= 0.08;
        }
        break;
      case 'dropKick':
      case 'kneeStrike':
        // Arms flung wide for balance.
        o.p.y += 0.08;
        o.p.x += 0.08 * s;
        break;
      // --- Umbrella -----------------------------------------------------
      case 'pokeA':
      case 'pokeB':
      case 'umbrellaRush':
        if (side === 'R') {
          const k = punch(1);
          // Point the tip forward, then thrust.
          o.r.x += -0.95;
          o.r.z += -0.35;
          o.p.x -= 0.12;
          o.p.z -= 0.35 * k;
        }
        break;
      case 'sweep':
        if (side === 'R') swing([0.3, 0.9, 0.5], [-0.8, -1.2, -0.7], 0.15);
        break;
      case 'flingThrow':
        // Both arms haul the cord back over the shoulder, then whip it forward.
        swing([0.9, 0, -0.3], [-1.1, 0, 0.2], 0.25);
        o.p.y += side === 'L' ? 0.05 : 0;
        break;
      case 'umbrellaToss':
        // Overhand fling: wind back over the shoulder, then whip forward.
        if (side === 'R') swing([0.9, 0, -0.2], [-0.9, 0, 0.1], 0.2);
        break;
      case 'umbrellaOpen':
      case 'shieldFire':
      case 'hopFloat':
      case 'updraft':
        if (side === 'R') {
          // Canopy straight ahead like a shield (or overhead for the updraft).
          // The umbrella itself turns to face forward (see updateExtras); the arm only shifts.
          const up = id === 'updraft' || id === 'hopFloat';
          o.r.x += up ? 0.3 : 0;
          o.r.z += up ? -0.35 : 0;
          o.p.x -= up ? 0.22 : 0.1;
          o.p.y += up ? 0.1 : -0.06;
        }
        break;

      case 'heliSpin': {
        const a = (act.frame / 60) * Math.PI * 2 * 2.5;
        o.r.z += -1.3;
        o.p.x += Math.sin(a) * 0.12 - 0.05;
        o.p.y += 0.12 + Math.cos(a) * 0.05;
        break;
      }
      case 'drawShot':
      case 'triShot': {
        if (side === 'R') {
          let k = 0;
          if (ph.stage === 'windup') k = ease.outCubic(ph.t);
          else if (ph.stage === 'strike') k = 1 - ease.outExpo(ph.t);
          // Full draw toward the cheek, trembling a little while held.
          o.p.z += 0.2 * k;
          o.p.x += -0.22 * k;
          o.p.y += 0.12 * k;
          if (act.chargeT > 0 && ph.stage === 'windup') o.p.x += (Math.random() - 0.5) * 0.004 * act.chargeLevel;
          if (ph.stage !== 'windup') o.p.z += 0.05 * Math.sin(Math.min(1, ph.t * 2) * Math.PI);
        } else if (ph.stage === 'strike') {
          o.r.x += 0.08 * (1 - ph.t);
        }
        break;
      }
      case 'arrowRain': {
        const up = act.frame < 12 ? act.frame / 12 : act.frame < 86 ? 1 : Math.max(0, 1 - (act.frame - 86) / 8);
        o.r.x += 0.9 * up;
        o.p.y += 0.18 * up;
        if (side === 'R') {
          const k = act.frame < 90 ? ((act.frame % 5) / 5) : 0;
          o.p.z += 0.15 * (1 - k) * up;
          o.p.x += -0.18 * up;
        }
        break;
      }
      case 'rollShot':
        o.p.y -= 0.1 * Math.sin(Math.min(1, act.frame / 14) * Math.PI);
        o.r.x += -0.6 * Math.sin(Math.min(1, act.frame / 14) * Math.PI);
        break;
      case 'risingUpper':
        if (side === 'R') swing([-0.3, 0, 0], [1.2, 0, 0], 0.1);
        break;
      case 'dashStraight':
        if (side === 'R') {
          o.p.z -= 0.3 * Math.max(0, punch(1));
          o.p.x -= 0.12 * Math.max(0, punch(1));
        }
        break;
      case 'slideShot':
        o.p.y -= 0.06;
        break;
      case 'jabL':
      case 'jabR': {
        const lead = id === 'jabL' ? 'L' : 'R';
        if (side === lead) {
          const k = punch(1);
          o.p.z -= 0.36 * k;
          o.p.x += -s * 0.16 * Math.max(0, k);
          o.p.y += 0.07 * Math.max(0, k);
          o.r.z += 0.25 * s * Math.max(0, k);
        } else {
          const k = Math.max(0, punch(1));
          o.p.z += 0.06 * k;
          o.p.y -= 0.03 * k;
        }
        break;
      }
      case 'hook': {
        if (side === 'L') {
          let x = 0;
          let z = 0;
          let ry = 0;
          if (ph.stage === 'windup') {
            const t = ease.outCubic(ph.t);
            x = -0.18 * t;
            z = 0.06 * t;
            ry = 0.7 * t;
          } else if (ph.stage === 'strike') {
            const t = ease.outExpo(Math.min(1, ph.t * 1.4));
            x = lerp(-0.18, 0.36, t);
            z = lerp(0.06, -0.3, t);
            ry = lerp(0.7, -0.9, t);
          } else {
            const t = ease.inOutQuad(ph.t);
            x = lerp(0.36, 0, t);
            z = lerp(-0.3, 0, t);
            ry = lerp(-0.9, 0, t);
          }
          o.p.x += x;
          o.p.z += z;
          o.p.y += 0.08 * Math.sin(Math.min(1, Math.abs(x) * 3) * Math.PI * 0.5);
          o.r.y += ry;
          o.r.z += -ry * 0.4;
        } else {
          o.p.z += 0.06;
          o.p.y -= 0.04;
        }
        break;
      }
      case 'airPunch': {
        if (side === 'R') {
          const k = punch(1);
          o.p.z -= 0.36 * k;
          o.p.y -= 0.12 * Math.max(0, k);
          o.p.x -= 0.12 * Math.max(0, k);
          o.r.x -= 0.5 * Math.max(0, k);
        }
        break;
      }
      case 'rocketStraight': {
        if (side === 'R') {
          let k: number;
          if (ph.stage === 'windup') k = -0.6 * ease.outCubic(ph.t);
          else if (ph.stage === 'strike') k = lerp(-0.6, 1.1, ease.outExpo(Math.min(1, ph.t * 5)));
          else k = lerp(1.1, 0, ease.inOutQuad(ph.t));
          o.p.z -= 0.36 * k;
          o.p.x -= 0.2 * Math.max(0, k);
          o.p.y += 0.06 * Math.max(0, k) + (ph.stage === 'windup' ? -0.05 * ph.t : 0);
          if (ph.stage === 'strike') o.p.x += (Math.random() - 0.5) * 0.01;
        } else {
          o.p.z += ph.stage === 'strike' ? 0.15 : 0.05;
          o.p.y -= 0.05;
        }
        break;
      }
      case 'burstRush': {
        const fr = act.frame;
        if (fr < 12) {
          o.p.y -= 0.05 * (fr / 12);
          o.p.z += 0.06 * (fr / 12);
        } else if (fr < 64) {
          const leftTurn = Math.floor((fr - 12) / 5) % 2 === 0;
          const mine = (side === 'L') === leftTurn;
          const p = ((fr - 12) % 5) / 5;
          const ext = p < 0.4 ? ease.outExpo(p / 0.4) : 1 - ease.inOutQuad((p - 0.4) / 0.6);
          if (mine) {
            o.p.z -= 0.38 * ext;
            o.p.x += -s * (0.14 + rand(-0.04, 0.04)) * ext;
            o.p.y += (0.05 + rand(-0.04, 0.06)) * ext;
          } else o.p.z += 0.05;
        } else if (side === 'R') {
          if (fr < 70) {
            o.p.y -= 0.18 * ((fr - 64) / 6);
            o.p.z += 0.05;
          } else if (fr < 86) {
            const t = ease.outExpo(Math.min(1, (fr - 70) / 5));
            o.p.y += lerp(-0.18, 0.35, t);
            o.p.z -= 0.25 * t;
            o.p.x -= 0.15 * t;
            o.r.x += 1.2 * t;
          }
        } else o.p.y -= 0.1;
        break;
      }
      case 'backflipShot': {
        // Arms swing up with the jump; recoil comes from shot events.
        const t = clamp(act.frame / 12, 0, 1);
        o.p.y += 0.06 * Math.sin(t * Math.PI);
        o.r.x += 0.2 * Math.sin(t * Math.PI);
        break;
      }
      case 'starStorm': {
        const fr = act.frame;
        if (fr < 84) {
          const sway = Math.sin(fr * 0.35);
          o.p.x += sway * 0.06;
          o.r.y += -sway * 0.25;
        } else {
          // Bring both blasters together for the finisher.
          const t = ease.outCubic(clamp((fr - 84) / 10, 0, 1));
          o.p.x += -s * 0.14 * t;
          o.p.y += 0.04 * t;
          o.r.z += -s * 0.25 * t;
        }
        break;
      }
      default:
        break;
    }
  }
}
