import { Vector3 } from 'three';
import { ARENA_RADIUS, EYE_HEIGHT, ULT_MAX } from '../config';
import { clamp, wrapAngle } from '../core/math';
import type { Fighter } from '../combat/fighter';
import { emptyIntent, type Intent } from '../combat/types';
import type { CombatWorld } from '../combat/world';
import { PADS, ROCKS } from '../combat/terrain';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Params {
  reaction: number; // frames of perception delay
  turnRate: number; // rad per frame
  aimError: number; // rad
  guardChance: number;
  dodgeChance: number;
  aggression: number; // 0..1
  edgeAware: number; // 0..1
  skillUse: number;
  techChance: number;
  pushToEdge: boolean;
}

export const difficultyParams: Record<Difficulty, Params> = {
  easy: { reaction: 26, turnRate: 0.07, aimError: 0.16, guardChance: 0.15, dodgeChance: 0.08, aggression: 0.35, edgeAware: 0.35, skillUse: 0.15, techChance: 0.1, pushToEdge: false },
  normal: { reaction: 15, turnRate: 0.14, aimError: 0.07, guardChance: 0.38, dodgeChance: 0.25, aggression: 0.6, edgeAware: 0.75, skillUse: 0.4, techChance: 0.4, pushToEdge: false },
  hard: { reaction: 8, turnRate: 0.24, aimError: 0.025, guardChance: 0.6, dodgeChance: 0.5, aggression: 0.85, edgeAware: 1, skillUse: 0.75, techChance: 0.8, pushToEdge: true },
};

interface Snapshot {
  actionId: string | null;
  actionFrame: number;
  state: string;
}

export class CpuController {
  private p: Params;
  private yaw = 0;
  private pitch = 0;
  private history: Snapshot[] = [];
  private strafeDir = 1;
  private strafeT = 0;
  private guardHold = 0;
  private reactedTo: unknown = null;
  private attackCooldown = 0;
  private burst = 0;
  private noise = { yaw: 0, pitch: 0, t: 0 };
  private techRolled = false;
  private wantJump = 0;
  private chargeHold = 0;
  private dashAttackIn = 0;

  constructor(
    private self: Fighter,
    private foe: Fighter,
    private world: CombatWorld,
    difficulty: Difficulty,
  ) {
    this.p = difficultyParams[difficulty];
    this.yaw = self.yaw;
  }

  resetView(yaw: number) {
    this.yaw = yaw;
    this.pitch = 0;
    this.history = [];
    this.guardHold = 0;
  }

  think(active: boolean): Intent {
    const i = emptyIntent();
    const self = this.self;
    const foe = this.foe;
    if (self.yawOverride !== null) {
      this.yaw = self.yawOverride;
      self.yawOverride = null;
    }

    this.history.push({ actionId: foe.action?.def.id ?? null, actionFrame: foe.action?.frame ?? 0, state: foe.state });
    if (this.history.length > 60) this.history.shift();
    const seen = this.history[Math.max(0, this.history.length - 1 - this.p.reaction)];

    // --- Aim -------------------------------------------------------------
    const to = foe.pos.clone().sub(self.pos);
    const dist = Math.hypot(to.x, to.z);
    this.noise.t--;
    if (this.noise.t <= 0) {
      this.noise.t = 20 + Math.random() * 30;
      this.noise.yaw = (Math.random() - 0.5) * 2 * this.p.aimError;
      this.noise.pitch = (Math.random() - 0.5) * 2 * this.p.aimError * 0.6;
    }
    // Lead moving targets a little for projectiles.
    const lead = self.def.archetype === 'ranged' ? dist / 55 : 0;
    const aimAt = foe.pos.clone().addScaledVector(foe.vel, lead * (1 - this.p.aimError * 3));
    const ax = aimAt.x - self.pos.x;
    const az = aimAt.z - self.pos.z;
    const desiredYaw = Math.atan2(-ax, -az) + this.noise.yaw;
    const dy = wrapAngle(desiredYaw - this.yaw);
    this.yaw += clamp(dy, -this.p.turnRate, this.p.turnRate);
    const chestY = aimAt.y + 1.1 - (self.pos.y + EYE_HEIGHT);
    const desiredPitch = Math.atan2(chestY, Math.max(0.5, Math.hypot(ax, az))) + this.noise.pitch;
    this.pitch += clamp(desiredPitch - this.pitch, -this.p.turnRate, this.p.turnRate);
    i.yaw = this.yaw;
    i.pitch = this.pitch;
    const aimed = Math.abs(dy) < 0.18;

    if (!active) return i;

    // --- Edge recovery: off the stage and falling -> head home, use the rising move.
    const horiz = Math.hypot(self.pos.x, self.pos.z);
    if (!self.grounded && (horiz > ARENA_RADIUS - 0.5 || self.pos.y < -0.2) && (self.state === 'free' || self.state === 'action' || self.state === 'dash')) {
      const home = Math.atan2(self.pos.x, self.pos.z); // yaw that faces the center
      i.jump = true; // umbrella: keep gliding
      if (self.def.recoil && this.recoilAim(i)) return i;
      const rec = self.def.recovery ? self.def.actions[self.def.recovery] : null;
      if (rec?.spawns?.some((s) => s.hook) && !self.grapple) {
        // Grappler: aim the hook at the lip of the arena.
        const eye = self.eye;
        const rimR = ARENA_RADIUS - 0.4;
        const out = new Vector3(self.pos.x, 0, self.pos.z).normalize();
        const lip = out.multiplyScalar(rimR).setY(-0.15);
        const d = lip.sub(eye);
        i.yaw = this.yaw = Math.atan2(-d.x, -d.z);
        i.pitch = this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
        i.moveZ = 1;
        if (!self.airMoveUsed && self.vel.y < 4) i.jumpPressed = true;
        else if (self.def.actions[self.def.basic].spawns?.some((s) => s.hook)) i.attackPressed = true;
        return i;
      }
      i.yaw = home;
      i.pitch = 0;
      this.yaw = home;
      i.moveZ = 1;
      if (self.def.recovery && !self.airMoveUsed && self.vel.y < 2 && Math.random() < 0.3 + this.p.edgeAware * 0.6) i.jumpPressed = true;
      else if (self.stamina >= 1 && self.vel.y < -2 && Math.random() < this.p.edgeAware * 0.3) i.dashPressed = true;
      return i;
    }

    // --- Recovery --------------------------------------------------------
    if (self.state === 'tumble') {
      if (!this.techRolled && self.vel.y < 0 && self.pos.y < 1.2) {
        this.techRolled = true;
        if (Math.random() < this.p.techChance) i.dashPressed = true;
      }
      return i;
    }
    this.techRolled = false;
    if (self.state !== 'free' && self.state !== 'action' && self.state !== 'dash') return i;

    const forward = self.forward();
    const right = self.right();
    const move = new Vector3();

    // --- Defense ---------------------------------------------------------
    if (this.guardHold > 0) {
      this.guardHold--;
      i.guard = true;
    }
    const edgeRoom = ARENA_RADIUS - Math.hypot(self.pos.x, self.pos.z);
    const threat = this.detectThreat(seen, dist);
    if (threat && this.reactedTo !== threat) {
      this.reactedTo = threat;
      const r = Math.random();
      const sk = self.def.actions[self.def.skill];
      // An umbrella can't stop melee: dodge those instead of raising it.
      const melee = typeof threat === 'object' && !!(threat as { hits?: unknown[] }).hits?.length;
      const canopyUseless = !!self.def.canopy && (melee || self.canopyBroken > 0);
      const dodge = canopyUseless ? this.p.dodgeChance + this.p.guardChance : this.p.dodgeChance;
      if ((sk.counter || (sk.reflect && !canopyUseless)) && self.skillCd === 0 && Math.random() < this.p.guardChance + 0.15) {
        // Iai counter / umbrella parry instead of guarding.
        i.skillPressed = true;
      } else if (canopyUseless && melee && sk.float && self.skillCd === 0 && Math.random() < 0.6) {
        // Umbrella: hop up out of reach and float down.
        i.skillPressed = true;
      } else if (canopyUseless && r >= dodge) {
        // Nothing to do but take it.
      } else if (r < dodge && self.stamina >= 1 && edgeRoom > 3.5) {
        i.dashPressed = true;
        move.addScaledVector(right, this.strafeDir);
        this.strafeDir *= -1;
      } else if (r < this.p.dodgeChance + this.p.guardChance) {
        this.guardHold = 24 + Math.floor(Math.random() * 16);
        i.guard = true;
      }
    }

    // --- Positioning -----------------------------------------------------
    const [near, far] = self.def.preferredRange;
    const toDir = new Vector3(to.x, 0, to.z).normalize();
    this.strafeT--;
    if (this.strafeT <= 0) {
      this.strafeT = 40 + Math.random() * 80;
      if (Math.random() < 0.5) this.strafeDir *= -1;
    }
    const strafe = new Vector3(-toDir.z, 0, toDir.x).multiplyScalar(this.strafeDir);
    const melee = self.def.archetype === 'melee';
    if (melee) {
      if (dist > far) {
        move.add(toDir).addScaledVector(strafe, dist > 6 ? 0.45 : 0.15);
        if (this.p.pushToEdge) {
          // Approach from the center side so hits knock the foe outward.
          const foeOut = new Vector3(foe.pos.x, 0, foe.pos.z);
          if (foeOut.length() > 4) {
            const ideal = foe.pos.clone().sub(foeOut.normalize().multiplyScalar(2.2));
            move.addScaledVector(ideal.sub(self.pos).setY(0).normalize(), 0.6);
          }
        }
      } else {
        move.addScaledVector(strafe, 0.3);
      }
    } else {
      if (dist < near) move.addScaledVector(toDir, -1);
      else if (dist > far) move.add(toDir);
      move.addScaledVector(strafe, 0.85);
    }

    // Stay away from the edge.
    const fromCenter = new Vector3(self.pos.x, 0, self.pos.z);
    const edgeDist = ARENA_RADIUS - fromCenter.length();
    if (edgeDist < 4 * this.p.edgeAware + 0.5) {
      move.addScaledVector(fromCenter.normalize(), -2.2 * this.p.edgeAware);
    }

    if (move.lengthSq() > 0.001) {
      move.normalize();
      i.moveX = move.dot(right);
      i.moveZ = move.dot(forward);
    }

    // --- Offense ---------------------------------------------------------
    if (this.attackCooldown > 0) this.attackCooldown--;
    const foeVulnerable = foe.isAlive() && foe.state !== 'getup';
    if (i.guard || !foeVulnerable) return i;

    if (self.ult >= ULT_MAX) {
      const ud = self.def.actions[self.def.ult];
      const uReach = Math.max(0, ...(ud.hits ?? []).filter((h) => h.reach).map((h) => h.range));
      const ok = ud.spawns?.some((sp) => sp.hook) ? dist < 18 && aimed : uReach ? dist < uReach && aimed : melee ? dist < 3.8 : dist < 16 && aimed;
      if (ok && Math.random() < 0.05 + this.p.aggression * 0.05) i.ultPressed = true;
    }
    const hookSkill = self.def.actions[self.def.skill].spawns?.some((sp) => sp.hook === 'self' || sp.hook === 'anchor');
    if (hookSkill && self.skillCd === 0 && aimed && dist > 5 && dist < 16 && Math.random() < 0.02 + this.p.skillUse * 0.05) {
      // Grappler: close the gap by hooking onto the opponent.
      i.skillPressed = true;
    } else if (self.skillCd === 0 && Math.random() < this.p.skillUse * 0.03) {
      const sk = self.def.actions[self.def.skill];
      const area = sk.hits?.find((h) => h.area);
      const reach = sk.hits?.find((h) => h.reach);
      let ok: boolean;
      if (sk.counter || sk.reflect) ok = false; // reactive only (see threat handling)
      else if (area) ok = dist < area.radius * 0.9;
      else if (reach) ok = aimed && dist < reach.range + 0.4 && dist > 3;
      // Close-range strike skills (Zip's punches).
      else if (sk.hits?.length && Math.max(...sk.hits.map((h) => h.range)) < 2 && !sk.motion?.some((m) => m.forward > 10)) ok = aimed && dist < 2.4;
      else if (sk.motion?.some((m) => m.forward > 10)) ok = dist > 2.5 && dist < 8 && aimed;
      // Skills that jump backwards: never with the edge behind.
      else if (sk.motion?.some((m) => m.forward < 0)) ok = dist < 5 && edgeRoom > 6;
      else ok = aimed && dist < 18;
      if (ok) i.skillPressed = true;
    }

    if (this.dashAttackIn > 0) {
      this.dashAttackIn--;
      if (this.dashAttackIn === 0) i.attackPressed = true;
    }
    if (melee) {
      const reach = Math.max(...(self.def.actions[self.def.basic].hits ?? []).map((h) => h.range + h.radius * 0.6), 2);
      if (dist < reach && aimed && this.attackCooldown === 0) {
        i.attackPressed = Math.random() < 0.3 + this.p.aggression * 0.5;
        const def = self.action?.def;
        if (def && !def.comboNext && def.kind === 'attack') this.attackCooldown = Math.floor(30 * (1.2 - this.p.aggression));
      }
      if (dist < 6 && dist > 3 && Math.random() < 0.004 * this.p.aggression) this.wantJump = 1;
      if (self.def.dashAttack && dist > 3.2 && dist < 6.5 && aimed && self.stamina >= 1 && edgeRoom > 3 && Math.random() < 0.012 * this.p.aggression) {
        i.dashPressed = true;
        i.moveZ = 1;
        i.moveX = 0;
        this.dashAttackIn = 4;
      }
    } else if (self.def.actions[self.def.basic].charge) {
      // Bow: draw for a while, then release.
      if (this.chargeHold > 0) {
        this.chargeHold--;
        i.attack = true;
        if (this.chargeHold === 0) {
          i.attack = false;
          this.attackCooldown = Math.floor(10 + 40 * (1 - this.p.aggression));
        }
      } else if (this.attackCooldown === 0 && aimed && dist < 26) {
        this.chargeHold = 8 + Math.floor(Math.random() * (20 + 40 * this.p.aggression));
        i.attack = true;
        i.attackPressed = true;
      }
      if (Math.random() < 0.004) this.wantJump = 1;
    } else {
      if (this.burst > 0) {
        this.burst--;
        i.attack = aimed;
        if (this.burst === 0) this.attackCooldown = Math.floor(20 + 50 * (1 - this.p.aggression));
      } else if (this.attackCooldown === 0 && aimed && dist < 22) {
        this.burst = 20 + Math.floor(Math.random() * 30);
      }
      if (Math.random() < 0.006) this.wantJump = 1;
    }
    if (this.wantJump > 0) {
      this.wantJump = 0;
      i.jumpPressed = true;
    }
    return i;
  }

  /**
   * Ranged recovery: aim at a floating rock (or pad) that lies outward/below and
   * shoot it so the recoil pushes back toward the stage. Returns false if none fits.
   */
  private recoilAim(i: Intent) {
    const self = this.self;
    const eye = self.eye;
    const out = new Vector3(self.pos.x, 0, self.pos.z).normalize();
    let best: Vector3 | null = null;
    let bestScore = -Infinity;
    for (const [x, y, z, r] of [...ROCKS, ...PADS]) {
      const top = new Vector3(x, y + (PADS.some((p) => p[0] === x && p[2] === z) ? 0.45 : 0), z);
      const d = top.clone().sub(eye);
      const dist = d.length();
      if (dist > 15) continue;
      d.normalize();
      const outward = d.x * out.x + d.z * out.z;
      // Recoil goes opposite to the shot: want the shot outward and/or downward.
      const score = outward * 1.2 - d.y * 1.5 - dist * 0.05 + r * 0.05;
      if ((outward > 0.1 || d.y < -0.6) && score > bestScore) {
        bestScore = score;
        best = top;
      }
    }
    if (!best) return false;
    const d = best.clone().sub(eye);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    i.yaw = yaw;
    i.pitch = pitch;
    this.yaw = yaw;
    this.pitch = pitch;
    // Drift toward the stage while shooting away from it.
    const toCenter = out.clone().multiplyScalar(-1);
    const f = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    i.moveX = toCenter.dot(r);
    i.moveZ = toCenter.dot(f);
    i.attackPressed = Math.random() < 0.5 + this.p.edgeAware * 0.4;
    i.attack = self.def.autoFire === true;
    return true;
  }

  private detectThreat(seen: Snapshot, dist: number): unknown {
    const foe = this.foe;
    if (seen.actionId) {
      const def = foe.def.actions[seen.actionId];
      const reach = def.hits?.length ? Math.max(...def.hits.map((h) => h.range + h.radius)) + 1.5 : 0;
      const firstHit = def.hits?.[0]?.start ?? 0;
      const dashReach = def.motion?.some((m) => m.forward > 10) ? 7 : 0;
      if (def.hits && seen.actionFrame < firstHit && dist < Math.max(reach, dashReach)) return foe.action?.def ?? seen.actionId;
      if (def.kind !== 'attack' && def.spawns && dist < 18) return foe.action?.def ?? seen.actionId;
    }
    // Incoming projectiles close by.
    for (const p of this.world.projectiles) {
      if (p.owner === this.self) continue;
      const d = p.pos.distanceTo(this.self.pos);
      if (d < 7) {
        const toSelf = this.self.pos.clone().sub(p.pos).normalize();
        if (toSelf.dot(p.vel.clone().normalize()) > 0.9) return p.id < 0 ? null : Math.floor(p.id / 6);
      }
    }
    return null;
  }
}
