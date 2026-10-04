import { Vector3 } from 'three';
import { ARENA_RADIUS, BODY_HEIGHT, BODY_RADIUS, EYE_HEIGHT, GUARD_MAX } from '../config';
import { Fighter } from './fighter';
import { TICK, type ActionDef, type HitProps, type Intent, type Spawn } from './types';

/** Applies the hold-to-charge multipliers to a hit or projectile. */
function charged<T extends HitProps>(props: T, def: ActionDef, level: number): T {
  const c = def.charge;
  if (!c || level <= 0) return props;
  const k = (m = 1) => 1 + (m - 1) * level;
  return { ...props, damage: props.damage * k(c.damage), knockback: props.knockback * k(c.knockback), knockUp: props.knockUp * k(c.knockback), hitstop: Math.round(props.hitstop * k(1.6)), heavy: props.heavy || level > 0.8 };
}

export interface Projectile {
  owner: Fighter;
  pos: Vector3;
  prev: Vector3;
  vel: Vector3;
  radius: number;
  life: number;
  size: number;
  props: HitProps;
  id: number;
  gravity: number;
  visual: 'star' | 'arrow';
}

export type CombatEvent =
  | { type: 'hit'; attacker: Fighter; target: Fighter; pos: Vector3; dir: Vector3; props: HitProps; ko: boolean; projectile: boolean }
  | { type: 'guard'; attacker: Fighter; target: Fighter; pos: Vector3; props: HitProps; broke: boolean }
  | { type: 'whiff'; attacker: Fighter; hand: 'L' | 'R' | 'B'; heavy: boolean }
  | { type: 'shoot'; attacker: Fighter; hand: 'L' | 'R'; pos: Vector3; big: boolean }
  | { type: 'projectileEnd'; projectile: Projectile }
  | { type: 'action'; fighter: Fighter; id: string; kind: string }
  | { type: 'dash'; fighter: Fighter }
  | { type: 'jump'; fighter: Fighter }
  | { type: 'land'; fighter: Fighter; strength: number }
  | { type: 'shockwave'; attacker: Fighter; pos: Vector3; radius: number }
  | { type: 'ringout'; fighter: Fighter };

let projectileId = 0;

export class CombatWorld {
  readonly fighters: [Fighter, Fighter];
  projectiles: Projectile[] = [];
  events: CombatEvent[] = [];
  hitstop = 0;
  frame = 0;
  /** Debug: positions of active melee hit spheres this frame. */
  debugHitSpheres: { pos: Vector3; radius: number }[] = [];

  private seen = new Map<Fighter, { action: unknown; dash: number; jump: number; land: number; state: string }>();

  constructor(a: Fighter, b: Fighter) {
    this.fighters = [a, b];
  }

  step(intents: [Intent, Intent]) {
    this.frame++;
    this.debugHitSpheres = [];
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    const [a, b] = this.fighters;
    a.update(intents[0], b);
    b.update(intents[1], a);
    this.separate(a, b);
    this.processAttacks(a, b);
    this.processAttacks(b, a);
    this.updateProjectiles();
    this.emitStateEvents(a);
    this.emitStateEvents(b);
  }

  private separate(a: Fighter, b: Fighter) {
    if (!a.isAlive() || !b.isAlive()) return;
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const dy = Math.abs(b.pos.y - a.pos.y);
    const d = Math.hypot(dx, dz);
    const min = BODY_RADIUS * 2;
    if (d < min && dy < BODY_HEIGHT * 0.8) {
      const push = (min - d) / 2;
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
    }
  }

  private emitStateEvents(f: Fighter) {
    const s = this.seen.get(f) ?? { action: null, dash: f.dashCounter, jump: f.jumpCounter, land: f.landCounter, state: f.state };
    if (f.action && f.action.def !== s.action) {
      this.events.push({ type: 'action', fighter: f, id: f.action.def.id, kind: f.action.def.kind });
    }
    if (f.dashCounter !== s.dash) this.events.push({ type: 'dash', fighter: f });
    if (f.jumpCounter !== s.jump) this.events.push({ type: 'jump', fighter: f });
    if (f.landCounter !== s.land) this.events.push({ type: 'land', fighter: f, strength: f.landStrength });
    if (f.state === 'ringout' && s.state !== 'ringout') this.events.push({ type: 'ringout', fighter: f });
    this.seen.set(f, { action: f.action?.def ?? null, dash: f.dashCounter, jump: f.jumpCounter, land: f.landCounter, state: f.state });
  }

  private processAttacks(att: Fighter, tgt: Fighter) {
    const a = att.action;
    if (!a || att.state !== 'action') return;
    const def = a.def;

    def.hits?.forEach((w, i) => {
      if (a.hitDone[i]) return;
      if (a.frame < w.start) return;
      if (a.frame >= w.end) {
        a.hitDone[i] = true;
        this.events.push({ type: 'whiff', attacker: att, hand: w.hand ?? 'R', heavy: !!w.heavy });
        return;
      }
      let center: Vector3;
      if (w.area) {
        center = att.pos.clone().addScaledVector(att.forward(), w.range);
        center.y += 0.6;
        if (a.frame === w.start) this.events.push({ type: 'shockwave', attacker: att, pos: center.clone(), radius: w.radius });
      } else {
        center = att.eye.addScaledVector(att.aimDir(), w.range);
        center.y = Math.min(center.y, att.pos.y + EYE_HEIGHT);
      }
      this.debugHitSpheres.push({ pos: center.clone(), radius: w.radius });
      if (!tgt.isAlive() || tgt.isInvulnerable()) return;
      if (sphereCapsule(center, w.radius, tgt.pos)) {
        a.hitDone[i] = true;
        a.connected = true;
        att.vel.x *= 0.2;
        att.vel.z *= 0.2;
        const dir = tgt.pos.clone().sub(att.pos).setY(0);
        if (dir.lengthSq() < 1e-6) att.forward(dir);
        dir.normalize();
        const point = closestOnCapsule(center, tgt.pos);
        this.applyHit(att, tgt, charged(w, def, a.chargeLevel), dir, point, false);
      }
    });

    def.spawns?.forEach((s, i) => {
      if (a.spawnDone[i] || a.frame < s.frame) return;
      a.spawnDone[i] = true;
      if (def.usesAmmo) {
        if (att.ammo <= 0) return;
        att.ammo--;
      }
      this.spawnProjectile(att, charged(s, def, a.chargeLevel), tgt, def.charge ? 1 + ((def.charge.speed ?? 1) - 1) * a.chargeLevel : 1, def.charge ? 1 + ((def.charge.size ?? 1) - 1) * a.chargeLevel : 1);
    });
  }

  private spawnProjectile(att: Fighter, s: Spawn, tgt: Fighter, speedK = 1, sizeK = 1) {
    const base = { owner: att, radius: s.radius * sizeK, life: s.life, size: (s.size ?? 1) * sizeK, props: s, gravity: s.gravity ?? 0, visual: s.visual ?? 'star' } as const;
    if (s.from === 'sky') {
      // Rain: drop from above the opponent with a little scatter.
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.4;
      const p = new Vector3(tgt.pos.x + Math.cos(a) * r + tgt.vel.x * 0.3, 13 + Math.random() * 3, tgt.pos.z + Math.sin(a) * r + tgt.vel.z * 0.3);
      this.projectiles.push({ ...base, pos: p.clone(), prev: p.clone(), vel: new Vector3((Math.random() - 0.5) * 2, -s.speed, (Math.random() - 0.5) * 2), id: projectileId++ });
      return;
    }
    const fwd = att.aimDir();
    const right = att.right();
    const side = s.hand === 'L' ? -0.3 : 0.3;
    const origin = att.eye.addScaledVector(right, side).addScaledVector(fwd, 0.6);
    origin.y -= 0.22;
    const count = s.count ?? 1;
    for (let k = 0; k < count; k++) {
      const dir = fwd.clone();
      if (s.fan) dir.applyAxisAngle(new Vector3(0, 1, 0), (k - (count - 1) / 2) * s.fan);
      if (s.spread) {
        dir.x += (Math.random() - 0.5) * s.spread * 2;
        dir.y += (Math.random() - 0.5) * s.spread * 2;
        dir.z += (Math.random() - 0.5) * s.spread * 2;
        dir.normalize();
      }
      // Converge bullets from the gun barrels onto the crosshair at ~20m.
      const aimPoint = att.eye.addScaledVector(dir, 20);
      const v = aimPoint.sub(origin).normalize().multiplyScalar(s.speed * speedK);
      // Arcing shots aim slightly up to compensate for gravity over ~20m.
      if (base.gravity) v.y += (base.gravity * 20) / (2 * s.speed * speedK);
      this.projectiles.push({ ...base, pos: origin.clone(), prev: origin.clone(), vel: v, id: projectileId++ });
    }
    att.shotCounter[s.hand]++;
    this.events.push({ type: 'shoot', attacker: att, hand: s.hand, pos: origin, big: (s.size ?? 1) > 1.2 });
  }

  private updateProjectiles() {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.prev.copy(p.pos);
      if (p.gravity) p.vel.y -= p.gravity * TICK;
      p.pos.addScaledVector(p.vel, TICK);
      p.life--;
      // Projectiles stop when they hit the arena floor.
      if (p.pos.y < 0 && Math.hypot(p.pos.x, p.pos.z) < ARENA_RADIUS) p.life = 0;
      const tgt = this.fighters[0] === p.owner ? this.fighters[1] : this.fighters[0];
      let alive = p.life > 0 && p.pos.y > -20;
      if (alive && tgt.isAlive() && !tgt.isInvulnerable() && segmentCapsule(p.prev, p.pos, p.radius, tgt.pos)) {
        const dir = p.vel.clone().setY(0).normalize();
        this.applyHit(p.owner, tgt, p.props, dir, closestOnCapsule(p.pos, tgt.pos), true);
        alive = false;
      }
      if (alive) keep.push(p);
      else this.events.push({ type: 'projectileEnd', projectile: p });
    }
    this.projectiles = keep;
  }

  applyHit(att: Fighter, tgt: Fighter, props: HitProps, dir: Vector3, point: Vector3, projectile: boolean) {
    const toAttacker = dir.clone().multiplyScalar(-1);
    const facing = tgt.forward().dot(toAttacker) > 0.1;
    const guarded = tgt.guarding && tgt.state === 'free' && facing;
    // Lower HP -> bigger launches, so ring-outs become a threat late in the round.
    const hpScale = 1 + (1 - tgt.hp / tgt.def.maxHp) * 1.2;

    if (guarded) {
      tgt.hp = Math.max(1, tgt.hp - props.damage * 0.15);
      tgt.guardHp -= props.guardDamage ?? props.damage * 0.3;
      tgt.vel.x += dir.x * props.knockback * 0.3;
      tgt.vel.z += dir.z * props.knockback * 0.3;
      const broke = tgt.guardHp <= 0;
      if (broke) {
        tgt.guardHp = 0;
        tgt.setState('guardbreak', 70);
      }
      tgt.lastHitDir.copy(dir);
      tgt.lastHitStrength = 0.3;
      tgt.hitCounter++;
      att.gainUlt(props.damage * 0.05);
      this.hitstop = Math.max(this.hitstop, Math.ceil(props.hitstop * 0.6));
      this.events.push({ type: 'guard', attacker: att, target: tgt, pos: point, props, broke });
      return;
    }

    tgt.hp = Math.max(0, tgt.hp - props.damage);
    att.gainUlt(props.damage * 0.11);
    tgt.gainUlt(props.damage * 0.07);
    const ko = tgt.hp <= 0;
    const strength = Math.min(1, (props.knockback + props.knockUp) / 26 + (props.heavy ? 0.3 : 0));

    const armored = tgt.action?.def.armor && tgt.state === 'action' && !ko;
    if (armored) {
      tgt.lastHitDir.copy(dir);
      tgt.lastHitStrength = strength * 0.5;
      tgt.hitCounter++;
    } else if (props.pull && !ko) {
      // Rush hits keep the target glued in front of the attacker.
      const front = att.forward();
      tgt.pos.x = att.pos.x + front.x * 1.25;
      tgt.pos.z = att.pos.z + front.z * 1.25;
      tgt.receiveHit(dir, 0, props.knockUp, props.hitstun, strength);
      tgt.vel.x = att.vel.x;
      tgt.vel.z = att.vel.z;
    } else {
      const kb = ko ? Math.max(props.knockback * hpScale, 14) : props.knockback * hpScale;
      const up = ko ? Math.max(props.knockUp * hpScale, 9) : props.knockUp * hpScale;
      tgt.receiveHit(dir, kb, up, props.hitstun, strength);
    }
    this.hitstop = Math.max(this.hitstop, ko ? props.hitstop + 10 : props.hitstop);
    this.events.push({ type: 'hit', attacker: att, target: tgt, pos: point, dir, props, ko, projectile });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  get guardMax() {
    return GUARD_MAX;
  }
}

/** Fighter capsule: vertical segment from y+R to y+H-R. */
function capsuleSegment(base: Vector3): [Vector3, Vector3] {
  return [
    new Vector3(base.x, base.y + BODY_RADIUS, base.z),
    new Vector3(base.x, base.y + BODY_HEIGHT - BODY_RADIUS, base.z),
  ];
}

function closestOnCapsule(p: Vector3, base: Vector3) {
  const [a, b] = capsuleSegment(base);
  const y = Math.min(Math.max(p.y, a.y), b.y);
  const c = new Vector3(base.x, y, base.z);
  const toP = p.clone().sub(c);
  const len = toP.length();
  if (len > BODY_RADIUS) toP.multiplyScalar(BODY_RADIUS / len);
  return c.add(toP);
}

function sphereCapsule(center: Vector3, r: number, base: Vector3) {
  const [a, b] = capsuleSegment(base);
  const y = Math.min(Math.max(center.y, a.y), b.y);
  const dx = center.x - base.x;
  const dy = center.y - y;
  const dz = center.z - base.z;
  const rr = r + BODY_RADIUS;
  return dx * dx + dy * dy + dz * dz <= rr * rr;
}

/** Swept projectile test (avoids tunnelling at high speed). */
function segmentCapsule(p0: Vector3, p1: Vector3, r: number, base: Vector3) {
  const steps = Math.max(1, Math.ceil(p0.distanceTo(p1) / (r + BODY_RADIUS * 0.5)));
  const tmp = new Vector3();
  for (let i = 1; i <= steps; i++) {
    tmp.lerpVectors(p0, p1, i / steps);
    if (sphereCapsule(tmp, r, base)) return true;
  }
  return false;
}
