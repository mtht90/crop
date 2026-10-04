import { Vector3 } from 'three';
import {
  ARENA_RADIUS,
  DASH_FRAMES,
  DASH_INVULN,
  DASH_SPEED,
  EYE_HEIGHT,
  GRAVITY,
  GUARD_MAX,
  RINGOUT_Y,
  STAMINA_MAX,
  STAMINA_REGEN,
  ULT_MAX,
} from '../config';
import { clamp } from '../core/math';
import { TICK, type ActionDef, type CharacterDef, type Intent } from './types';

export type FighterState =
  | 'free'
  | 'action'
  | 'dash'
  | 'hitstun'
  | 'tumble'
  | 'knockdown'
  | 'getup'
  | 'guardbreak'
  | 'ko'
  | 'ringout'
  | 'locked';

export interface ActionInstance {
  def: ActionDef;
  frame: number;
  hitDone: boolean[];
  /** Set when a melee hit connects so lunges stop on contact. */
  connected?: boolean;
  spawnDone: boolean[];
}

const BUFFER_FRAMES = 8;

export class Fighter {
  readonly pos = new Vector3();
  readonly prevPos = new Vector3();
  readonly vel = new Vector3();
  yaw = 0;
  pitch = 0;

  hp: number;
  ult = 0;
  guardHp = GUARD_MAX;
  stamina = STAMINA_MAX;
  staminaRegen = 0;
  skillCd = 0;
  ammo: number;
  reloadT = 0;

  grounded = true;
  guarding = false;
  guardT = 0;
  state: FighterState = 'locked';
  stateT = 0;
  stateDur = 0;
  action: ActionInstance | null = null;
  /** Increments on every action start (lets renderers detect re-triggers). */
  actionSerial = 0;
  dashDir = new Vector3();
  invuln = 0;
  /** Set on the frame the tumble ended in a KO. */
  dead = false;

  /** Animation feedback (read by the renderer). */
  lastHitDir = new Vector3(0, 0, 1);
  lastHitStrength = 0;
  hitCounter = 0;
  landCounter = 0;
  landStrength = 0;
  dashCounter = 0;
  jumpCounter = 0;
  /** Accumulated distance on the ground (drives the run cycle). */
  stride = 0;
  /** Local-space move direction used for locomotion blending. */
  localMove = { x: 0, z: 0 };
  shotCounter = { L: 0, R: 0 };

  private buffer = { attack: 0, dash: 0, jump: 0, skill: 0, ult: 0 };
  private comboChain: string | null = null;

  constructor(
    readonly def: CharacterDef,
    readonly index: 0 | 1,
  ) {
    this.hp = def.maxHp;
    this.ammo = def.ammo ?? 0;
  }

  get eye() {
    return new Vector3(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
  }

  forward(out = new Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out = new Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  aimDir(out = new Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  isInvulnerable() {
    if (this.invuln > 0) return true;
    if (this.state === 'getup' || this.state === 'knockdown' || this.state === 'ko' || this.state === 'ringout') return true;
    const inv = this.action?.def.invuln;
    return !!(inv && this.action && this.action.frame >= inv[0] && this.action.frame < inv[1]);
  }

  isAlive() {
    return this.state !== 'ko' && this.state !== 'ringout' && !this.dead;
  }

  reset(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = this.def.maxHp;
    this.guardHp = GUARD_MAX;
    this.stamina = STAMINA_MAX;
    this.skillCd = 0;
    this.ammo = this.def.ammo ?? 0;
    this.reloadT = 0;
    this.grounded = true;
    this.guarding = false;
    this.action = null;
    this.invuln = 0;
    this.dead = false;
    this.setState('locked');
    this.buffer = { attack: 0, dash: 0, jump: 0, skill: 0, ult: 0 };
  }

  setState(s: FighterState, dur = 0) {
    this.state = s;
    this.stateT = 0;
    this.stateDur = dur;
    if (s !== 'action') this.action = null;
    if (s !== 'free') this.guarding = false;
  }

  startAction(id: string) {
    const def = this.def.actions[id];
    this.action = {
      def,
      frame: 0,
      hitDone: (def.hits ?? []).map(() => false),
      spawnDone: (def.spawns ?? []).map(() => false),
    };
    this.actionSerial++;
    this.state = 'action';
    this.stateT = 0;
    this.guarding = false;
    this.comboChain = def.comboNext ?? null;
    if (def.kind === 'skill') this.skillCd = this.def.skillCooldown;
    if (def.kind === 'ult') this.ult = 0;
  }

  /** Called for hits that land or are guarded so meters fill up. */
  gainUlt(v: number) {
    if (this.action?.def.kind === 'ult') return;
    this.ult = clamp(this.ult + v, 0, ULT_MAX);
  }

  update(intent: Intent, opponent: Fighter) {
    this.prevPos.copy(this.pos);
    this.stateT++;
    if (this.invuln > 0) this.invuln--;
    if (this.skillCd > 0) this.skillCd--;
    this.tickMeters();

    const canTurn = this.state === 'free' || this.state === 'action' || this.state === 'dash' || this.state === 'locked';
    if (canTurn && !(this.action?.def.committed && this.action.def.moveScale === 0)) {
      this.yaw = intent.yaw;
      this.pitch = clamp(intent.pitch, -1.2, 1.2);
    }

    if (this.state !== 'locked') this.readBuffers(intent);

    const desired = this.desiredVelocity(intent);

    switch (this.state) {
      case 'locked':
        this.applyGroundControl(new Vector3(), 40);
        break;
      case 'free':
        this.updateFree(intent, desired);
        break;
      case 'action':
        this.updateAction(desired, opponent);
        break;
      case 'dash': {
        const t = this.stateT / DASH_FRAMES;
        const speed = DASH_SPEED * (1 - t * t * 0.7);
        this.vel.x = this.dashDir.x * speed;
        this.vel.z = this.dashDir.z * speed;
        if (this.stateT >= DASH_FRAMES) {
          this.vel.x *= 0.4;
          this.vel.z *= 0.4;
          this.setState('free');
        }
        break;
      }
      case 'hitstun':
        this.applyFriction(5);
        if (this.stateT >= this.stateDur) this.setState('free');
        break;
      case 'tumble':
        if (!this.grounded) {
          const drag = Math.exp(-1.2 * TICK);
          this.vel.x *= drag;
          this.vel.z *= drag;
        }
        if (this.grounded && this.stateT > 3) {
          this.landCounter++;
          this.landStrength = 1;
          if (this.dead) {
            this.setState('ko');
          } else if (this.buffer.dash > 0) {
            // Tech roll: recover instantly with a short invulnerable roll.
            this.buffer.dash = 0;
            this.setState('getup', 12);
            this.invuln = 16;
          } else {
            this.setState('knockdown', 34);
          }
          this.vel.x *= 0.35;
          this.vel.z *= 0.35;
        }
        break;
      case 'knockdown':
        this.applyFriction(6);
        if (this.stateT >= this.stateDur) this.setState('getup', 22);
        break;
      case 'getup':
        this.applyFriction(10);
        if (this.stateT >= this.stateDur) {
          this.invuln = Math.max(this.invuln, 8);
          this.setState('free');
        }
        break;
      case 'guardbreak':
        this.applyFriction(6);
        if (this.stateT >= this.stateDur) {
          this.guardHp = GUARD_MAX * 0.5;
          this.setState('free');
        }
        break;
      case 'ko':
        this.applyFriction(6);
        break;
      case 'ringout':
        break;
    }

    this.integrate();
  }

  private tickMeters() {
    if (this.stamina < STAMINA_MAX) {
      this.staminaRegen++;
      if (this.staminaRegen >= STAMINA_REGEN) {
        this.staminaRegen = 0;
        this.stamina++;
      }
    }
    if (this.guarding) this.guardT++;
    else {
      this.guardT = 0;
      if (this.state !== 'guardbreak') this.guardHp = Math.min(GUARD_MAX, this.guardHp + 0.35);
    }
    if (this.reloadT > 0) {
      this.reloadT--;
      if (this.reloadT === 0) this.ammo = this.def.ammo ?? 0;
    }
  }

  private readBuffers(intent: Intent) {
    const b = this.buffer;
    for (const k of Object.keys(b) as (keyof typeof b)[]) if (b[k] > 0) b[k]--;
    if (intent.attackPressed) b.attack = BUFFER_FRAMES;
    // Shooters auto-fire while held.
    if (intent.attack && this.def.weapon === 'guns') b.attack = Math.max(b.attack, 1);
    if (intent.dashPressed) b.dash = BUFFER_FRAMES;
    if (intent.jumpPressed) b.jump = BUFFER_FRAMES;
    if (intent.skillPressed) b.skill = BUFFER_FRAMES;
    if (intent.ultPressed) b.ult = BUFFER_FRAMES;
    if (intent.reloadPressed) this.startReload();
  }

  private startReload() {
    if (this.def.ammo && this.reloadT === 0 && this.ammo < this.def.ammo) this.reloadT = this.def.reloadFrames ?? 60;
  }

  private desiredVelocity(intent: Intent) {
    const f = this.forward();
    const r = this.right();
    const len = Math.hypot(intent.moveX, intent.moveZ);
    const mx = len > 1 ? intent.moveX / len : intent.moveX;
    const mz = len > 1 ? intent.moveZ / len : intent.moveZ;
    this.localMove.x = mx;
    this.localMove.z = mz;
    return new Vector3(r.x * mx + f.x * mz, 0, r.z * mx + f.z * mz).multiplyScalar(this.def.walkSpeed);
  }

  /** Tries special moves that are allowed from free state or as cancels. */
  private tryStartSpecial(canDash = true): boolean {
    const b = this.buffer;
    if (b.ult > 0 && this.ult >= ULT_MAX) {
      b.ult = 0;
      this.startAction(this.def.ult);
      return true;
    }
    if (b.skill > 0 && this.skillCd === 0) {
      b.skill = 0;
      this.startAction(this.def.skill);
      return true;
    }
    if (canDash && b.dash > 0 && this.stamina >= 1) {
      b.dash = 0;
      this.startDash();
      return true;
    }
    return false;
  }

  private startDash() {
    this.stamina--;
    this.staminaRegen = 0;
    const lm = this.localMove;
    const f = this.forward();
    const r = this.right();
    if (Math.hypot(lm.x, lm.z) < 0.1) this.dashDir.copy(f).multiplyScalar(-1);
    else this.dashDir.set(r.x * lm.x + f.x * lm.z, 0, r.z * lm.x + f.z * lm.z).normalize();
    this.setState('dash', DASH_FRAMES);
    this.invuln = DASH_INVULN;
    this.dashCounter++;
    if (!this.grounded) this.vel.y = Math.max(this.vel.y, 2);
  }

  private updateFree(intent: Intent, desired: Vector3) {
    const b = this.buffer;
    this.guarding = intent.guard && this.grounded && this.guardHp > 0;

    if (this.tryStartSpecial()) return;
    if (b.jump > 0 && this.grounded) {
      b.jump = 0;
      this.vel.y = this.def.jumpSpeed;
      this.grounded = false;
      this.guarding = false;
      this.jumpCounter++;
    }
    if (b.attack > 0 && !this.guarding) {
      const usesAmmo = this.def.ammo !== undefined;
      if (usesAmmo && (this.ammo <= 0 || this.reloadT > 0)) {
        if (this.ammo <= 0) this.startReload();
      } else {
        b.attack = 0;
        const id = !this.grounded && this.def.airBasic ? this.def.airBasic : this.def.basic;
        // Keep alternating hands for shooters.
        const next = this.def.weapon === 'guns' && this.comboChain ? this.comboChain : id;
        this.startAction(next);
        return;
      }
    }
    const scale = this.guarding ? 0.35 : 1;
    if (this.grounded) this.applyGroundControl(desired.multiplyScalar(scale), 70);
    else this.applyAirControl(desired, 22);
  }

  private updateAction(desired: Vector3, opponent: Fighter) {
    const a = this.action!;
    const def = a.def;
    a.frame++;

    // Cancels: almost anything can be cancelled into dash/skill/ult.
    if (!def.committed) {
      if (def.kind === 'attack' && this.tryStartSpecial()) return;
      if (def.kind === 'skill' && this.tryStartSpecial(true)) return;
      if (def.kind === 'attack' && this.buffer.jump > 0 && this.grounded && this.def.weapon === 'guns') {
        // Shooters can jump mid-fire.
        this.buffer.jump = 0;
        this.vel.y = this.def.jumpSpeed;
        this.grounded = false;
        this.jumpCounter++;
      }
    }
    if (def.comboNext && def.comboFrom !== undefined && a.frame >= def.comboFrom && this.buffer.attack > 0) {
      const usesAmmo = def.usesAmmo;
      if (!usesAmmo || (this.ammo > 0 && this.reloadT === 0)) {
        this.buffer.attack = 0;
        this.startAction(def.comboNext);
        return;
      }
    }

    const scale = def.moveScale ?? 0.3;
    const motion = a.connected && !def.hits?.some((h) => h.pull) ? undefined : def.motion?.find((m) => a.frame >= m.start && a.frame < m.end);
    if (motion) {
      const dir = this.forward();
      if (motion.magnet) {
        const to = opponent.pos.clone().sub(this.pos).setY(0);
        const dist = to.length();
        if (dist < 6 && dist > 0.01 && to.normalize().dot(dir) > Math.cos(0.75)) {
          dir.copy(to);
          if (dist < 1.15) {
            // Stop short instead of running through the target.
            this.vel.x = 0;
            this.vel.z = 0;
          } else {
            this.vel.x = dir.x * motion.forward;
            this.vel.z = dir.z * motion.forward;
          }
        } else {
          this.vel.x = dir.x * motion.forward;
          this.vel.z = dir.z * motion.forward;
        }
      } else {
        this.vel.x = dir.x * motion.forward;
        this.vel.z = dir.z * motion.forward;
      }
      if (motion.up !== undefined && a.frame === motion.start) {
        this.vel.y = motion.up;
        this.grounded = false;
      }
    } else if (this.grounded) {
      this.applyGroundControl(desired.multiplyScalar(scale), 50);
    } else {
      this.applyAirControl(desired.multiplyScalar(Math.max(scale, 0.4)), 12);
    }

    if (a.frame >= def.total) {
      this.setState('free');
    }
  }

  private applyGroundControl(target: Vector3, accel: number) {
    const dx = target.x - this.vel.x;
    const dz = target.z - this.vel.z;
    const d = Math.hypot(dx, dz);
    const step = accel * TICK;
    if (d <= step) {
      this.vel.x = target.x;
      this.vel.z = target.z;
    } else {
      this.vel.x += (dx / d) * step;
      this.vel.z += (dz / d) * step;
    }
  }

  private applyAirControl(target: Vector3, accel: number) {
    // Only accelerate toward input; never brake air momentum (keeps knockback arcs).
    const len = target.length();
    if (len < 0.01) return;
    const dir = target.clone().divideScalar(len);
    const along = this.vel.x * dir.x + this.vel.z * dir.z;
    if (along < len) {
      const add = Math.min(accel * TICK, len - along);
      this.vel.x += dir.x * add;
      this.vel.z += dir.z * add;
    }
  }

  private applyFriction(k: number) {
    if (!this.grounded) return;
    const f = Math.exp(-k * TICK);
    this.vel.x *= f;
    this.vel.z *= f;
  }

  private integrate() {
    if (this.state === 'ringout') return;
    const wasGrounded = this.grounded;
    if (!this.grounded) this.vel.y -= GRAVITY * TICK;
    // Hang time at the apex of the backflip / air attacks feels better.
    if (this.state === 'action' && !this.grounded && Math.abs(this.vel.y) < 2) this.vel.y += GRAVITY * TICK * 0.45;

    this.pos.addScaledVector(this.vel, TICK);

    const horiz = Math.hypot(this.pos.x, this.pos.z);
    const onFloor = horiz <= ARENA_RADIUS;
    if (onFloor && this.pos.y <= 0 && this.prevPos.y >= -0.3) {
      if (!wasGrounded && this.vel.y < -4) {
        this.landCounter++;
        this.landStrength = clamp(-this.vel.y / 20, 0.2, 1);
      }
      this.pos.y = 0;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y > 0.001 || !onFloor) {
      this.grounded = false;
    }

    if (this.grounded) this.stride += Math.hypot(this.vel.x, this.vel.z) * TICK;

    if (this.pos.y < RINGOUT_Y) {
      this.setState('ringout');
      this.vel.set(0, 0, 0);
    }
  }

  /** Called by the world when this fighter is hit (not guarded). */
  receiveHit(dir: Vector3, kb: number, up: number, hitstun: number, strength: number) {
    this.lastHitDir.copy(dir);
    this.lastHitStrength = strength;
    this.hitCounter++;
    this.guarding = false;
    const launch = kb >= 9 || up >= 6 || this.hp <= 0;
    this.vel.set(dir.x * kb, up, dir.z * kb);
    if (launch) {
      this.vel.y = Math.max(up, 6);
      this.grounded = false;
      this.pos.y = Math.max(this.pos.y, 0.05);
      this.setState('tumble');
      if (this.hp <= 0) this.dead = true;
    } else {
      this.setState('hitstun', hitstun);
      if (!this.grounded) this.vel.y = Math.max(this.vel.y, 3);
    }
  }
}
