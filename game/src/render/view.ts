import * as THREE from 'three';
import { audio as sfx } from '../audio/audio';
import type { Fighter } from '../combat/fighter';
import { phaseOf } from '../combat/phase';
import type { CombatEvent, CombatWorld } from '../combat/world';
import { ARENA_RADIUS, EYE_HEIGHT } from '../config';
import { clamp, damp, Spring } from '../core/math';
import { Arena } from './arena';
import { Effects, Trail } from './effects';
import { ModelRig } from './charModel';
import { ModelAnimator } from './modelAnimator';
import { tex } from './textures';
import { buildHookHead } from './weapons';
import { ViewModel } from './viewmodel';

export interface ViewFeedback {
  /** 0..1 red edge vignette intensity. */
  edgeWarn: number;
  /** Damage flash 0..1. */
  hurt: number;
  /** Speed lines 0..1. */
  speed: number;
  /** Full-screen color flash. */
  flash: { color: string; a: number };
}

interface RigBundle {
  fighter: Fighter;
  rig: ModelRig;
  anim: ModelAnimator;
  trails: { L: Trail; R: Trail };
  ghostT: number;
  twirlT: number;
  aura: THREE.Sprite[];
  /** Grappling cord (Zip): a thick tube between the launcher and the cup. */
  rope: THREE.Mesh;
  /** Suction cup stuck where the grapple latched. */
  cup: THREE.Object3D;
  /** Action serial that already got its swing streak. */
  swingSerial: number;
}

/** Owns the Three.js renderer: world scene, first-person camera and viewmodel. */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.05, 1200);
  readonly arena = new Arena();
  readonly effects: Effects;
  readonly viewmodel = new ViewModel();
  private rigs: RigBundle[] = [];
  private world: CombatWorld | null = null;
  private pov: Fighter | null = null;
  private trauma = 0;
  private fovKick = new Spring(120, 14);
  private roll = new Spring(140, 14);
  private pitchKick = new Spring(200, 16);
  private landDip = new Spring(160, 12);
  private lastLand = 0;
  private time = 0;
  /** Settings. */
  shakeEnabled = true;
  /** Third-person orbit for the animation viewer. */
  freeCamera = false;
  readonly feedback: ViewFeedback = { edgeWarn: 0, hurt: 0, speed: 0, flash: { color: '#fff', a: 0 } };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Phones/tablets: cap the resolution to keep the frame rate up.
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(0xcde8ff, 120, 420);
    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0xb3a58c, 1.5));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.position.set(18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -ARENA_RADIUS - 2;
    sc.right = sc.top = ARENA_RADIUS + 2;
    sc.near = 1;
    sc.far = 80;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(this.arena.group);
    this.effects = new Effects(this.camera);
    this.scene.add(this.effects.group);
    this.scene.add(this.camera);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.resize(w / h);
  }

  /** Attach a combat world. `pov` is the first-person fighter (its rig is hidden). */
  bind(world: CombatWorld, pov: Fighter | null) {
    for (const r of this.rigs) {
      this.scene.remove(r.rig.root, r.trails.L.mesh, r.trails.R.mesh, r.rope, r.cup);
      r.aura.forEach((s) => this.scene.remove(s));
    }
    this.effects.clear();
    this.world = world;
    this.pov = pov;
    this.rigs = world.fighters.map((f) => {
      const rig = new ModelRig(f.def);
      rig.root.visible = f !== pov;
      this.scene.add(rig.root);
      const trails = { L: new Trail(f.def.element.color, 0.22, 0.12), R: new Trail(f.def.element.color, 0.22, 0.12) };
      this.scene.add(trails.L.mesh, trails.R.mesh);
      const aura: THREE.Sprite[] = [];
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: i % 3 === 0 ? tex.star() : tex.soft(), color: i % 2 ? f.def.element.color : f.def.element.color2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
        s.visible = false;
        this.scene.add(s);
        aura.push(s);
      }
      const ropeGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
      ropeGeo.translate(0, 0.5, 0);
      const rope = new THREE.Mesh(ropeGeo, new THREE.MeshBasicMaterial({ color: 0x23233a }));
      rope.frustumCulled = false;
      rope.visible = false;
      this.scene.add(rope);
      const cup = buildHookHead(1.3);
      cup.visible = false;
      this.scene.add(cup);
      return { fighter: f, rig, anim: new ModelAnimator(rig, f), trails, ghostT: 0, twirlT: 0, aura, rope, cup, swingSerial: -1 };
    });
    if (pov) {
      this.viewmodel.setFighter(pov);
      this.lastLand = pov.landCounter;
    }
  }

  setOutcome(o: ['none' | 'win' | 'lose', 'none' | 'win' | 'lose']) {
    this.rigs.forEach((r, i) => (r.anim.outcome = o[i]));
  }

  rigOf(f: Fighter) {
    return this.rigs.find((r) => r.fighter === f)?.rig ?? null;
  }

  /** Converts simulation events into VFX, SFX and camera feedback. */
  handleEvents(events: CombatEvent[], silent = false) {
    const pov = this.pov;
    const audio = silent ? { play: (..._a: unknown[]) => {} } : sfx;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const el = e.attacker.def.element;
          const power = clamp((e.props.knockback + e.props.knockUp) / 30 + e.props.damage / 200, 0.1, 1);
          if (e.target === pov) {
            // Keep the burst out of the player's face: show it small, toward the attacker.
            const eye = pov.eye;
            const toward = e.attacker.pos.clone().sub(pov.pos).setY(0).normalize();
            this.effects.hit(eye.addScaledVector(toward, 1.4).setY(eye.y - 0.35), e.dir, el.color, el.color2, power * 0.4, false, 0.35);
          } else this.effects.hit(e.pos, e.dir, el.color, el.color2, power, !!e.props.heavy || e.ko, 1, !e.projectile);
          audio.play(e.props.heavy || e.ko ? 'heavy' : 'punch', 0.6 + power * 0.5);
          if (e.attacker.def.weapon === 'hammer' && !e.projectile) audio.play('squeak', 0.8 + power * 0.4);
          if (e.target === pov) {
            this.addTrauma(0.25 + power * 0.6);
            this.feedback.hurt = Math.min(1, 0.4 + power);
            this.pitchKick.impulse(3 + power * 6);
          } else if (e.attacker === pov) {
            this.addTrauma(0.08 + power * 0.25);
            if (e.props.heavy) this.fovKick.impulse(-25);
          }
          if (e.ko) {
            audio.play('ko');
            this.feedback.flash = { color: '#ffffff', a: 0.9 };
            this.addTrauma(0.8);
          }
          break;
        }
        case 'guard': {
          const facing = e.target.forward();
          this.effects.guard(e.target.pos, facing, e.broke);
          audio.play(e.broke ? 'guardbreak' : 'guard');
          if (e.target === pov) this.addTrauma(e.broke ? 0.5 : 0.12);
          break;
        }
        case 'whiff':
          audio.play('whoosh', e.heavy ? 1.3 : 0.8);
          break;
        case 'shoot': {
          audio.play(e.big ? 'bigshot' : 'shot');
          if (e.attacker !== pov) {
            const rig = this.rigOf(e.attacker);
            const tip = (e.hand === 'L' ? rig?.tipL : rig?.tipR)?.getWorldPosition(new THREE.Vector3()) ?? e.pos;
            this.effects.muzzle(tip, e.attacker.def.element.color, e.big);
          } else {
            this.pitchKick.impulse(e.big ? 6 : 0.8);
            if (e.big) this.addTrauma(0.3);
          }
          break;
        }
        case 'projectileEnd':
          this.effects.fizzle(e.projectile.pos, e.projectile.owner.def.element.color2);
          break;
        case 'action':
          if (e.kind === 'ult') {
            audio.play('ult');
            const el = e.fighter.def.element;
            this.effects.ultBurst(e.fighter.pos.clone().setY(e.fighter.pos.y + 1), el.color, el.color2);
            if (e.fighter === pov) {
              this.feedback.flash = { color: `#${el.color.toString(16).padStart(6, '0')}`, a: 0.55 };
              this.fovKick.impulse(40);
            }
          } else if (e.kind === 'skill' && e.fighter === pov) {
            this.fovKick.impulse(18);
          }
          break;
        case 'dash':
          audio.play('dash');
          this.effects.dust(e.fighter.pos.clone(), 4, 0.8);
          if (e.fighter === pov) {
            this.fovKick.impulse(30);
            const local = e.fighter.dashDir.dot(e.fighter.right());
            this.roll.impulse(-local * 1.6);
          }
          break;
        case 'jump':
          audio.play('jump');
          this.effects.dust(e.fighter.pos.clone(), 3, 0.6);
          break;
        case 'land':
          audio.play('land', e.strength);
          this.effects.dust(e.fighter.pos.clone(), Math.round(3 + e.strength * 5), 0.6 + e.strength * 0.6);
          break;
        case 'ringout':
          audio.play('ringout');
          break;
        case 'justGuard': {
          const facing = e.target.forward();
          this.effects.guard(e.target.pos, facing, false);
          this.effects.hit(e.pos, facing, 0x6fe8ff, 0xffffff, 0.8, true, 0.8);
          this.effects.justGuard(e.pos);
          audio.play('guard');
          audio.play('go');
          if (e.target === pov) {
            this.feedback.flash = { color: '#6fe8ff', a: 0.45 };
            this.fovKick.impulse(-18);
          } else if (e.attacker === pov) this.addTrauma(0.4);
          break;
        }
        case 'counter': {
          const el = e.target.def.element;
          this.effects.hit(e.pos, e.target.forward(), el.color, el.color2, 0.9, true, 0.9, true);
          audio.play('heavy', 1.1);
          audio.play('whoosh', 1.4);
          if (e.target === pov) {
            this.feedback.flash = { color: '#dfe8ff', a: 0.5 };
            this.fovKick.impulse(-20);
          } else if (e.attacker === pov) this.addTrauma(0.4);
          break;
        }
        case 'parry': {
          this.effects.justGuard(e.pos);
          audio.play('guard');
          if (e.reflected) audio.play('shot');
          if (e.target === pov) this.fovKick.impulse(-10);
          break;
        }
        case 'canopyBreak': {
          this.effects.guard(e.fighter.pos, e.fighter.forward(), true);
          audio.play('guardbreak');
          if (e.fighter === pov) this.addTrauma(0.3);
          break;
        }
        case 'grapple': {
          // "Thwock": the cup sticks.
          this.effects.stick(e.pos.clone(), e.fighter.def.element.color2);
          this.effects.dust(e.pos.clone(), 3, 0.5);
          audio.play(e.onFighter ? 'punch' : 'land', 0.6);
          if (e.fighter === pov) this.fovKick.impulse(22);
          break;
        }
        case 'recoil': {
          this.effects.dust(e.pos.clone(), 5, 0.5 + e.strength * 0.06);
          this.effects.fizzle(e.pos.clone(), e.fighter.def.element.color2);
          if (e.fighter === pov) {
            audio.play('dash');
            this.fovKick.impulse(8 + e.strength * 2);
          }
          break;
        }
        case 'shockwave': {
          const el = e.attacker.def.element;
          this.effects.shockwave(e.pos, e.radius, el.color, el.color2);
          if (e.radius > 2.5) {
            audio.play('heavy', 0.8);
            if (e.attacker === pov || pov && pov.pos.distanceTo(e.pos) < e.radius + 3) this.addTrauma(0.35);
          }
          break;
        }
      }
    }
  }

  addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  render(dt: number, alpha: number, look: { yaw: number; pitch: number }, sway: { x: number; y: number }, showViewmodel: boolean) {
    this.time += dt;
    const world = this.world;
    const fb = this.feedback;
    fb.hurt = Math.max(0, fb.hurt - dt * 2.2);
    fb.flash.a = Math.max(0, fb.flash.a - dt * 2.5);

    if (world) {
      const frozen = world.hitstop > 0;
      for (const b of this.rigs) {
        const opp = world.fighters[0] === b.fighter ? world.fighters[1] : world.fighters[0];
        b.anim.update(dt, alpha, opp, frozen);
        this.updateRigFx(b, dt);
      }
      this.effects.syncProjectiles(
        world.projectiles,
        (p) => [p.owner.def.element.color, p.owner.def.element.color2],
        alpha,
      );
    }
    this.effects.update(dt);

    // --- Camera ---------------------------------------------------------------
    const pov = this.pov;
    let edge = 0;
    if (pov && !this.freeCamera) {
      const pos = new THREE.Vector3().lerpVectors(pov.prevPos, pov.pos, alpha);
      if (pov.landCounter !== this.lastLand) {
        this.lastLand = pov.landCounter;
        this.landDip.impulse(-1.5 * (0.3 + pov.landStrength));
      }
      this.landDip.update(dt);
      let eye = EYE_HEIGHT;
      if (pov.state === 'knockdown' || pov.state === 'ko') eye = 0.45;
      else if (pov.state === 'getup') eye = 0.45 + (EYE_HEIGHT - 0.45) * clamp(pov.stateT / pov.stateDur, 0, 1);
      else if (pov.guarding) eye -= 0.12;
      this.camera.position.set(pos.x, pos.y + eye + this.landDip.value * 0.05, pos.z);

      this.fovKick.update(dt);
      this.roll.update(dt);
      this.pitchKick.update(dt);
      let extraPitch = this.pitchKick.value * 0.01;
      let extraRoll = this.roll.value * 0.05;
      if (pov.state === 'tumble' && this.shakeEnabled) {
        extraRoll += Math.sin(pov.stateT * 0.25) * 0.15;
        extraPitch += 0.25;
      }
      if (pov.state === 'knockdown' || pov.state === 'ko') extraPitch += 0.6;
      // Backflip: a gentle nod instead of a full flip (motion sickness).
      if (pov.action?.def.id === 'backflipShot') {
        const ph = pov.action.frame / pov.action.def.total;
        extraPitch += Math.sin(Math.min(1, ph * 1.6) * Math.PI) * 0.35;
      }

      const shake = this.shakeEnabled ? this.trauma * this.trauma : 0;
      const n = (o: number) => Math.sin(this.time * 47 + o) * Math.sin(this.time * 31 + o * 2);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(look.pitch + extraPitch + n(1) * 0.05 * shake, look.yaw + n(2) * 0.05 * shake, extraRoll + n(3) * 0.06 * shake);
      const speedK = pov.state === 'dash' || (pov.grapple && !pov.grapple.forced) ? 1 : pov.action?.def.motion?.some((m) => m.forward > 10 && pov.action!.frame >= m.start && pov.action!.frame < m.end) ? 0.8 : 0;
      fb.speed = damp(fb.speed, speedK, speedK > fb.speed ? 30 : 6, dt);
      this.camera.fov = 78 + this.fovKick.value * 0.25 + fb.speed * 6;
      this.camera.updateProjectionMatrix();

      const horiz = Math.hypot(pov.pos.x, pov.pos.z);
      edge = clamp((horiz - (ARENA_RADIUS - 4)) / 4, 0, 1);
      if (pov.pos.y < -0.5) edge = 1;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    fb.edgeWarn = damp(fb.edgeWarn, edge, 10, dt);
    this.arena.update(dt, fb.edgeWarn);

    const lyingOrFlying = !!pov && ['ringout', 'tumble', 'knockdown', 'ko', 'getup'].includes(pov.state);
    this.viewmodel.update(dt, sway, showViewmodel && !!pov && !lyingOrFlying);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (showViewmodel && pov && !this.freeCamera) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewmodel.scene, this.viewmodel.camera);
    }
  }

  /** Rope from Zip's launcher to the flying hook or the latched point. */
  private updateRope(b: RigBundle) {
    const f = b.fighter;
    if (f.def.weapon !== 'grapple' || !this.world) return;
    const proj = this.world.projectiles.find((p) => p.owner === f && p.visual === 'hook');
    const g = f.grapple;
    const end = proj ? proj.pos.clone() : g ? (g.target ? g.target.pos.clone().setY(g.target.pos.y + 0.9) : g.point.clone()) : null;
    // A yank hook keeps the rope taut while the opponent is reeled in.
    const other = this.world.fighters.find((o) => o !== f);
    const yank = !end && other?.grapple?.forced && other.grapple.target === f ? other.pos.clone().setY(other.pos.y + 0.9) : null;
    const target = end ?? yank;
    b.rope.visible = !!target;
    b.anim.hookOut = !!target;
    if (f === this.pov) this.viewmodel.hookOut = !!target;
    // The cup stays stuck on the surface (or the opponent) while reeling in.
    b.cup.visible = !proj && !!target;
    if (!target) return;
    let start: THREE.Vector3;
    if (f === this.pov) {
      const right = f.right();
      start = f.eye.addScaledVector(right, 0.3).addScaledVector(f.aimDir(), 0.6);
      start.y -= 0.3;
    } else start = b.rig.tipR.getWorldPosition(new THREE.Vector3());
    const dir = target.clone().sub(start);
    const len = Math.max(0.01, dir.length());
    dir.divideScalar(len);
    const thick = f === this.pov ? 0.03 : 0.05;
    b.rope.position.copy(start);
    b.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.rope.scale.set(thick, len, thick);
    if (b.cup.visible) {
      // Mouth against the surface, stem pointing back along the cord.
      b.cup.position.copy(target).addScaledVector(dir, -0.05);
      b.cup.lookAt(target.clone().add(dir));
    }
  }

  private updateRigFx(b: RigBundle, dt: number) {
    const f = b.fighter;
    const rig = b.rig;
    const visible = rig.root.visible;
    const act = f.action;
    this.updateRope(b);
    const w = f.def.weapon;
    const strike = !!act && f.state === 'action' && phaseOf(act.def, act.frame).stage === 'strike' && (w === 'fists' || w === 'hammer' || w === 'katana' || w === 'umbrella' || (w === 'grapple' && !act.def.spawns));
    const hitHand = act?.def.hits?.find((h) => act.frame >= h.start - 1 && act.frame < h.end + 1)?.hand ?? 'R';
    // Animated swing streak once per melee action, at the start of its strike.
    if (strike && act && b.swingSerial !== f.actionSerial && !act.def.hits?.every((h) => h.area)) {
      b.swingSerial = f.actionSerial;
      const anim = act.def.anim;
      const kind = w === 'katana' ? 'blade' : w === 'hammer' ? 'blunt' : w === 'umbrella' ? (anim === 'sweep' ? 'blunt' : 'thrust') : 'punch';
      const pov = f === this.pov;
      const pos = pov ? f.eye.addScaledVector(f.aimDir(), 1.7).add(new THREE.Vector3(0, -0.25, 0)) : f.pos.clone().addScaledVector(f.forward(), 0.9).setY(f.pos.y + 1.2);
      this.effects.swing(pos, f.def.element.color, kind, hitHand === 'L', pov ? 0.75 : 1);
    }
    b.trails.L.emitting = visible && strike && (hitHand === 'L' || hitHand === 'B');
    b.trails.R.emitting = visible && strike && (hitHand === 'R' || hitHand === 'B');
    const cam = this.camera.position;
    b.trails.L.update(dt, rig.tipL.getWorldPosition(new THREE.Vector3()), cam);
    b.trails.R.update(dt, rig.tipR.getWorldPosition(new THREE.Vector3()), cam);

    // Dash / lunge afterimages.
    const lunging = !!f.grapple || !!act?.def.motion?.some((m) => m.forward > 10 && act.frame >= m.start && act.frame < m.end);
    if (visible && (f.state === 'dash' || lunging)) {
      b.ghostT -= dt;
      if (b.ghostT <= 0) {
        b.ghostT = 0.035;
        this.effects.afterimage(rig.body, f.def.element.color);
      }
    } else b.ghostT = 0;

    // Swirl rings around spinning attacks.
    if (visible && (act?.def.anim === 'heliSpin' || act?.def.anim === 'aroundWorld')) {
      b.twirlT -= dt;
      if (b.twirlT <= 0) {
        b.twirlT = 0.07;
        this.effects.twirl(f.pos.clone().setY(f.pos.y + 1.1), f.def.element.color2);
      }
    } else b.twirlT = 0;

    // Element aura when the ult is ready or active.
    const ready = f.ult >= 100 || act?.def.kind === 'ult';
    b.aura.forEach((s, i) => {
      s.visible = visible && ready;
      if (!s.visible) return;
      const a = this.time * 3 + i * 0.63;
      const hand = i % 2 ? rig.tipL : rig.tipR;
      const p = hand.getWorldPosition(new THREE.Vector3());
      s.position.set(p.x + Math.cos(a) * 0.18, p.y + Math.sin(a * 1.7) * 0.18, p.z + Math.sin(a) * 0.18);
      s.scale.setScalar(0.1 + Math.abs(Math.sin(a * 2)) * 0.12);
    });
  }
}
