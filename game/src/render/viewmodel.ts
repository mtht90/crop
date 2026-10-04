import * as THREE from 'three';
import type { Fighter } from '../combat/fighter';
import { phaseOf } from '../combat/phase';
import { clamp, damp, ease, lerp, rand, Spring } from '../core/math';
import { Trail } from './effects';
import { buildBlaster } from './blaster';
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
      const s = side === 'L' ? -1 : 1;
      a.trail.setColor(f.def.element.color);
      const sleeve = part(new THREE.CylinderGeometry(0.075, 0.09, 0.42, 14), L.top, 0.008);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.set(0, -0.02, 0.3);
      a.root.add(sleeve);
      const cuff = part(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14), L.topAccent, 0.006);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(0, -0.02, 0.1);
      a.root.add(cuff);
      if (f.def.weapon === 'fists') {
        const fore = part(new THREE.CylinderGeometry(0.058, 0.065, 0.16, 12), L.skin, 0.006);
        fore.rotation.x = Math.PI / 2;
        fore.position.set(0, -0.02, 0.02);
        a.root.add(fore);
        const glove = part(new THREE.SphereGeometry(0.095, 16, 12), L.glove, 0.008);
        glove.scale.set(1, 0.95, 1.15);
        glove.position.set(0, -0.01, -0.09);
        a.root.add(glove);
        const plate = part(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8463c, 0.006);
        plate.scale.set(1.1, 0.5, 1.3);
        plate.position.set(0, 0.055, -0.085);
        a.root.add(plate);
        const band = part(new THREE.CylinderGeometry(0.085, 0.08, 0.06, 14), 0xe8463c, 0.006);
        band.rotation.x = Math.PI / 2;
        band.position.set(0, -0.02, -0.01);
        a.root.add(band);
        // Knuckle studs.
        for (let i = -1; i <= 1; i++) {
          const stud = part(new THREE.SphereGeometry(0.018, 8, 6), 0xffc93c, 0);
          stud.position.set(i * 0.035, 0.05, -0.17);
          a.root.add(stud);
        }
        a.tip.position.set(0, 0, -0.18);
      } else {
        const glove = part(new THREE.SphereGeometry(0.07, 12, 10), L.glove, 0.006);
        glove.position.set(0, -0.03, 0.0);
        a.root.add(glove);
        const gun = buildBlaster(0.85);
        gun.rotation.y = Math.PI;
        gun.position.set(0, 0.02, -0.04);
        a.root.add(gun);
        a.tip.position.set(0, 0.02, -0.3);
      }
      a.root.add(a.tip);
      a.flash.position.copy(a.tip.position);
      a.flash.scale.setScalar(0.25);
      a.root.add(a.flash);
      a.root.position.copy(a.base);
      a.base.x = (f.def.weapon === 'fists' ? 0.3 : 0.27) * s;
      a.base.y = f.def.weapon === 'fists' ? -0.3 : -0.29;
      a.base.z = f.def.weapon === 'fists' ? -0.62 : -0.66;
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

      // Guard: cross the arms in front of the face.
      if (this.guardW > 0.001) {
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
      a.root.rotation.set(o.r.x + this.swayY.value * 2, o.r.y + this.swayX.value * 2 + (f.def.weapon === 'guns' ? 0.07 * s : 0.12 * s), o.r.z);

      a.flashT -= dt;
      a.flash.visible = a.flashT > 0;
      if (a.flash.visible) a.flash.scale.setScalar(0.22 + Math.random() * 0.12);

      // Trail from the fist tip while striking.
      const strike = f.action && phaseOf(f.action.def, f.action.frame).stage === 'strike' && f.def.weapon === 'fists';
      a.trail.emitting = !!strike;
      const tipPos = a.tip.getWorldPosition(new THREE.Vector3());
      this.camera.worldToLocal(tipPos);
      a.trail.update(dt, tipPos, new THREE.Vector3(0, 0, 0));
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

    switch (id) {
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
