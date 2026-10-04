import { Vector3 } from 'three';
import { ARENA_RADIUS, EYE_HEIGHT, ULT_MAX } from '../config';
import { clamp, wrapAngle } from '../core/math';
import type { Fighter } from '../combat/fighter';
import { emptyIntent, type Intent } from '../combat/types';
import type { CombatWorld } from '../combat/world';

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
    const lead = self.def.weapon === 'guns' ? dist / 62 : 0;
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
      if (r < this.p.dodgeChance && self.stamina >= 1 && edgeRoom > 3.5) {
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
    if (self.def.weapon === 'fists') {
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
      const ok = self.def.weapon === 'fists' ? dist < 3.5 : dist < 14 && aimed;
      if (ok && Math.random() < 0.05 + this.p.aggression * 0.05) i.ultPressed = true;
    }
    if (self.skillCd === 0 && Math.random() < this.p.skillUse * 0.03) {
      // The shooter's skill jumps backwards: never use it with the edge behind.
      const ok = self.def.weapon === 'fists' ? dist > 2.5 && dist < 8 && aimed : dist < 5 && edgeRoom > 6;
      if (ok) i.skillPressed = true;
    }

    if (self.def.weapon === 'fists') {
      if (dist < 2.3 && aimed && this.attackCooldown === 0) {
        i.attackPressed = Math.random() < 0.3 + this.p.aggression * 0.5;
        if (self.action?.def.id === 'hook') this.attackCooldown = Math.floor(30 * (1.2 - this.p.aggression));
      }
      if (dist < 6 && dist > 3 && Math.random() < 0.004 * this.p.aggression) this.wantJump = 1;
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
