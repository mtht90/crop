import * as THREE from 'three';
import { audio as sfx } from '../audio/audio';
import type { Fighter } from '../combat/fighter';
import { phaseOf } from '../combat/phase';
import type { CombatEvent, CombatWorld } from '../combat/world';
import { ARENA_RADIUS, EYE_HEIGHT } from '../config';
import { clamp, damp, Spring } from '../core/math';
import { Arena } from './arena';
import { STAGES } from './stages';
import { raycastTerrain } from '../combat/terrain';
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
  /** Sniper scope overlay 0..1. */
  scope: number;
  /** Own cloak (decoy trick) 0..1. */
  cloak: number;
}

interface RigBundle {
  fighter: Fighter;
  rig: ModelRig;
  anim: ModelAnimator;
  trails: { L: Trail; R: Trail };
  ghostT: number;
  twirlT: number;
  aura: THREE.Sprite[];
  /** Grappling cords (Zip; two for the double hook): tubes between the launcher and the cups. */
  ropes: THREE.Mesh[];
  /** Suction cups stuck where the grapple latched. */
  cups: THREE.Object3D[];
  /** Action serial that already got its swing streak. */
  swingSerial: number;
}

/** Owns the Three.js renderer: world scene, first-person camera and viewmodel. */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.05, 1200);
  arena = new Arena();
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
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
  readonly feedback: ViewFeedback = { edgeWarn: 0, hurt: 0, speed: 0, flash: { color: '#fff', a: 0 }, scope: 0, cloak: 0 };
  /** Rendered copies for the decoy trick, keyed by decoy id. */
  private decoyRigs = new Map<number, { rig: ModelRig; anim: ModelAnimator }>();
  /** Laser sights of scoped rifles, one per fighter. */
  private lasers = new Map<Fighter, THREE.Mesh>();
  /** Cinematic shot (ult activation or the finishing blow), timed in real seconds. */
  private cine: { kind: 'ult' | 'ko'; fighter: Fighter; t: number; dur: number; side: number } | null = null;
  private cineRealDt = 0;

  /** Starts a cinematic camera shot on `fighter`. */
  startCinematic(kind: 'ult' | 'ko', fighter: Fighter) {
    this.cine = { kind, fighter, t: 0, dur: kind === 'ult' ? 1.25 : 2.3, side: Math.random() < 0.5 ? -1 : 1 };
  }

  /** Extra slow motion while an ult shot plays (1 = normal speed). */
  cinematicTimeScale() {
    const c = this.cine;
    if (!c || c.kind !== 'ult') return 1;
    const u = c.t / c.dur;
    return u < 0.55 ? 0.22 : 0.22 + 0.78 * Math.min(1, (u - 0.55) / 0.35);
  }

  get cinematicActive() {
    return !!this.cine;
  }

  /** Feeds real (unscaled) frame time so cinematics keep their pace during slow motion. */
  setRealDt(dt: number) {
    this.cineRealDt = dt;
  }

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
    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0xb3a58c, 1.5);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    this.sun = sun;
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

  /** Swap the stage look (same layout): arena decor, sky, fog and light colours. */
  setStage(id: string) {
    const theme = STAGES[id] ?? STAGES.sky;
    if (this.arena.theme.id === theme.id) return;
    this.scene.remove(this.arena.group);
    this.arena = new Arena(theme);
    this.scene.add(this.arena.group);
    (this.scene.fog as THREE.Fog).color.setHex(theme.fog);
    this.hemi.color.setHex(theme.hemi[0]);
    this.hemi.groundColor.setHex(theme.hemi[1]);
    this.hemi.intensity = theme.hemi[2];
    this.sun.color.setHex(theme.sun[0]);
    this.sun.intensity = theme.sun[1];
  }

  /** Attach a combat world. `pov` is the first-person fighter (its rig is hidden). */
  bind(world: CombatWorld, pov: Fighter | null) {
    for (const r of this.rigs) {
      this.scene.remove(r.rig.root, r.trails.L.mesh, r.trails.R.mesh, ...r.ropes, ...r.cups);
      r.aura.forEach((s) => this.scene.remove(s));
    }
    this.effects.clear();
    for (const d of this.decoyRigs.values()) this.scene.remove(d.rig.root);
    this.decoyRigs.clear();
    for (const l of this.lasers.values()) this.scene.remove(l);
    this.lasers.clear();
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
      const ropeMat = new THREE.MeshBasicMaterial({ color: 0x23233a });
      const ropes: THREE.Mesh[] = [];
      const cups: THREE.Object3D[] = [];
      for (let k = 0; k < 2; k++) {
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        rope.frustumCulled = false;
        rope.visible = false;
        const cup = buildHookHead(1.3);
        cup.visible = false;
        this.scene.add(rope, cup);
        ropes.push(rope);
        cups.push(cup);
      }
      return { fighter: f, rig, anim: new ModelAnimator(rig, f), trails, ghostT: 0, twirlT: 0, aura, ropes, cups, swingSerial: -1 };
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
        case 'explosion': {
          const el = e.attacker.def.element;
          this.effects.explosion(e.pos.clone(), e.radius, el.color, el.color2);
          audio.play('heavy', 0.5 + Math.min(0.5, e.radius * 0.15));
          if (pov) {
            const d = pov.pos.distanceTo(e.pos);
            if (d < 10) this.addTrauma((0.35 + e.radius * 0.05) * (1 - d / 10));
          }
          break;
        }
        case 'decoySpawn': {
          const p = e.owner.pos.clone().setY(e.owner.pos.y + 1);
          this.effects.dust(p, 8, 1.2);
          this.effects.twirl(p, e.owner.def.element.color);
          audio.play('dash', 0.8);
          break;
        }
        case 'decoyPop': {
          const el = e.decoy.owner.def.element;
          this.effects.explosion(e.pos.clone(), e.decoy.burst.radius * 0.7, el.color, el.color2);
          this.effects.twirl(e.pos.clone(), el.color2);
          audio.play('heavy', 0.6);
          break;
        }
        case 'projectileBounce':
          // The thrown umbrella bounces off and heads home.
          this.effects.stick(e.pos.clone(), e.projectile.owner.def.element.color2);
          audio.play('guard', 0.5);
          break;
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

  /** 0..1 how far the camera is pulled out of first person by the current shot. */
  private cineWeight() {
    const c = this.cine;
    if (!c) return 0;
    const u = c.t / c.dur;
    const ease = (x: number) => x * x * (3 - 2 * x);
    return u < 0.12 ? ease(u / 0.12) : u > 0.82 ? ease(Math.max(0, (1 - u) / 0.18)) : 1;
  }

  /**
   * Third-person shots: an ult gets a low orbiting close-up of its user, the
   * finishing blow a trailing camera on the fighter flying away. Blends from and
   * back to the first-person camera.
   */
  private applyCinematic(alpha: number) {
    const c = this.cine;
    if (!c) return;
    c.t += this.cineRealDt;
    if (c.t >= c.dur) {
      this.cine = null;
      return;
    }
    const f = c.fighter;
    const u = c.t / c.dur;
    const p = new THREE.Vector3().lerpVectors(f.prevPos, f.pos, alpha);
    const fw = f.forward();
    const right = f.right();
    const target = p.clone().setY(p.y + (c.kind === 'ult' ? 1.15 : 0.9));
    const camPos = new THREE.Vector3();
    if (c.kind === 'ult') {
      // Low 3/4 front shot that slowly swings round and pushes in.
      const ang = c.side * (0.55 + u * 0.5);
      const dist = 3.1 - u * 0.8;
      camPos.copy(target).addScaledVector(fw, Math.cos(ang) * dist).addScaledVector(right, Math.sin(ang) * dist);
      camPos.y = p.y + 0.75 + u * 0.25;
    } else {
      // Trail the launched fighter from the side, a little above.
      const flight = f.vel.clone().setY(0);
      const dir = flight.lengthSq() > 0.5 ? flight.normalize() : fw.clone().multiplyScalar(-1);
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(c.side);
      camPos.copy(target).addScaledVector(side, 5.5).addScaledVector(dir, -2.5);
      camPos.y = target.y + 1.6;
    }
    const w = this.cineWeight();
    const fromPos = this.camera.position.clone();
    const fromQ = this.camera.quaternion.clone();
    const look = new THREE.Matrix4().lookAt(camPos, target, new THREE.Vector3(0, 1, 0));
    const toQ = new THREE.Quaternion().setFromRotationMatrix(look);
    this.camera.position.lerpVectors(fromPos, camPos, w);
    this.camera.quaternion.copy(fromQ).slerp(toQ, w);
    this.camera.fov += ((c.kind === 'ult' ? 52 : 55) - this.camera.fov) * w;
    this.camera.updateProjectionMatrix();
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
        // Cloaked: gone from sight, flickering back in at the end.
        const f = b.fighter;
        if (f !== this.pov) b.rig.root.visible = f.cloak <= 0 || (f.cloak < 24 && Math.floor(f.cloak / 3) % 2 === 0);
        this.updateLaser(f);
      }
      this.syncDecoys(dt, alpha, frozen);
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
      // Rifle scope: zoom in while loading a shot.
      const a = pov.action;
      const scoped = pov.def.weapon === 'rifle' && pov.state === 'action' && a?.def.charge && a.frame >= a.def.charge.at && a.frame <= a.def.charge.at + 1 ? 0.35 + 0.65 * a.chargeLevel : 0;
      fb.scope = damp(fb.scope, scoped, 14, dt);
      fb.cloak = damp(fb.cloak, pov.cloak > 0 ? 1 : 0, 10, dt);
      this.camera.fov = (78 + this.fovKick.value * 0.25 + fb.speed * 6) * (1 - fb.scope * 0.55);
      this.camera.updateProjectionMatrix();

      this.applyCinematic(alpha);

      const horiz = Math.hypot(pov.pos.x, pov.pos.z);
      edge = clamp((horiz - (ARENA_RADIUS - 4)) / 4, 0, 1);
      if (pov.pos.y < -0.5) edge = 1;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    fb.edgeWarn = damp(fb.edgeWarn, edge, 10, dt);
    this.arena.update(dt, fb.edgeWarn);

    const lyingOrFlying = !!pov && ['ringout', 'tumble', 'knockdown', 'ko', 'getup'].includes(pov.state);
    const cineOut = !!this.cine && this.cineWeight() > 0.5;
    // In a cinematic the first-person body is shown and the arms are hidden.
    for (const b of this.rigs) if (b.fighter === pov) b.rig.root.visible = cineOut;
    this.viewmodel.update(dt, sway, showViewmodel && !!pov && !lyingOrFlying && !cineOut && fb.scope < 0.5);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (showViewmodel && pov && !this.freeCamera && !cineOut) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewmodel.scene, this.viewmodel.camera);
    }
  }

  /** Decoys are drawn as full copies of their owner (same model and animation). */
  private syncDecoys(dt: number, alpha: number, frozen: boolean) {
    const world = this.world!;
    const live = new Set<number>();
    for (const d of world.decoys) {
      live.add(d.id);
      let r = this.decoyRigs.get(d.id);
      if (!r) {
        const rig = new ModelRig(d.owner.def);
        this.scene.add(rig.root);
        r = { rig, anim: new ModelAnimator(rig, d.body) };
        this.decoyRigs.set(d.id, r);
      }
      const opp = world.fighters[0] === d.owner ? world.fighters[1] : world.fighters[0];
      r.anim.update(dt, alpha, opp, frozen);
    }
    for (const [id, r] of this.decoyRigs) {
      if (live.has(id)) continue;
      this.scene.remove(r.rig.root);
      this.decoyRigs.delete(id);
    }
  }

  /** Red laser from a scoped rifle to whatever it points at (both players see it). */
  private updateLaser(f: Fighter) {
    const a = f.action;
    const on = f.def.weapon === 'rifle' && f.state === 'action' && !!a?.def.charge && a.frame >= a.def.charge.at && a.frame <= a.def.charge.at + 1;
    let beam = this.lasers.get(f);
    if (!on) {
      if (beam) beam.visible = false;
      return;
    }
    if (!beam) {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
      geo.translate(0, 0.5, 0);
      beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3048, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.frustumCulled = false;
      this.scene.add(beam);
      this.lasers.set(f, beam);
    }
    const dir = f.aimDir();
    const start = f.eye.addScaledVector(f.right(), 0.22).addScaledVector(dir, 0.7);
    start.y -= 0.18;
    let len = 60;
    const hit = raycastTerrain(start, dir, len);
    if (hit) len = hit.dist;
    const opp = this.world!.fighters.find((o) => o !== f)!;
    const to = opp.pos.clone().setY(opp.pos.y + 1).sub(start);
    const along = to.dot(dir);
    if (along > 0 && along < len && to.addScaledVector(dir, -along).length() < 0.5) len = along;
    beam.visible = true;
    beam.position.copy(start);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const thick = f === this.pov ? 0.006 : 0.014;
    beam.scale.set(thick, len, thick);
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * (a?.chargeLevel ?? 0);
  }

  /** Cords from Zip's launcher to the flying hooks, the latched point or the opponent caught by the tether. */
  private updateRope(b: RigBundle) {
    const f = b.fighter;
    if (f.def.weapon !== 'grapple' || !this.world) return;
    const ends: { pos: THREE.Vector3; cup: boolean }[] = [];
    for (const p of this.world.projectiles) if (p.owner === f && p.visual === 'hook') ends.push({ pos: p.pos.clone(), cup: false });
    const g = f.grapple;
    if (g) ends.push({ pos: g.target ? g.target.pos.clone().setY(g.target.pos.y + 0.9) : g.point.clone(), cup: true });
    // A yank hook keeps the rope taut while the opponent is reeled in.
    const other = this.world.fighters.find((o) => o !== f);
    if (!ends.length && other?.grapple?.forced && other.grapple.target === f) ends.push({ pos: other.pos.clone().setY(other.pos.y + 0.9), cup: false });
    // Tether throw: the cord stays on the opponent through the swing.
    if (f.tether) ends.push({ pos: f.tether.target.pos.clone().setY(f.tether.target.pos.y + 0.9), cup: true });
    const out = ends.length > 0;
    b.anim.hookOut = out;
    if (f === this.pov) this.viewmodel.hookOut = out;
    let start: THREE.Vector3 | null = null;
    if (out) {
      if (f === this.pov) {
        const right = f.right();
        start = f.eye.addScaledVector(right, 0.3).addScaledVector(f.aimDir(), 0.6);
        start.y -= 0.3;
      } else start = b.rig.tipR.getWorldPosition(new THREE.Vector3());
    }
    for (let k = 0; k < b.ropes.length; k++) {
      const rope = b.ropes[k];
      const cup = b.cups[k];
      const e = ends[k];
      rope.visible = !!e;
      cup.visible = !!e && e.cup;
      if (!e || !start) continue;
      const dir = e.pos.clone().sub(start);
      const len = Math.max(0.01, dir.length());
      dir.divideScalar(len);
      const thick = f === this.pov ? 0.03 : 0.05;
      rope.position.copy(start);
      rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      rope.scale.set(thick, len, thick);
      if (cup.visible) {
        // Mouth against the surface, stem pointing back along the cord.
        cup.position.copy(e.pos).addScaledVector(dir, -0.05);
        cup.lookAt(e.pos.clone().add(dir));
      }
    }
  }

  private updateRigFx(b: RigBundle, dt: number) {
    const f = b.fighter;
    const rig = b.rig;
    const visible = rig.root.visible;
    const act = f.action;
    this.updateRope(b);
    const w = f.def.weapon;
    const strike = !!act && f.state === 'action' && phaseOf(act.def, act.frame).stage === 'strike' && (w === 'fists' || w === 'hammer' || w === 'katana' || w === 'umbrella' || ((w === 'grapple' || w === 'cannon') && !act.def.spawns));
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
