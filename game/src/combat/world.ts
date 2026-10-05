import { Vector3 } from 'three';
import { ARENA_RADIUS, BODY_HEIGHT, BODY_RADIUS, EYE_HEIGHT, GUARD_MAX } from '../config';
import { Fighter } from './fighter';
import { raycastTerrain, segmentHitsTerrain } from './terrain';
import { TICK, type ActionDef, type HitProps, type Intent, type Spawn } from './types';

/** Applies the hold-to-charge multipliers to a hit or projectile. */
function charged<T extends HitProps>(props: T, def: ActionDef, level: number): T {
  const c = def.charge;
  if (!c || level <= 0) return props;
  const k = (m = 1) => 1 + (m - 1) * level;
  return { ...props, damage: props.damage * k(c.damage), knockback: props.knockback * k(c.knockback), knockUp: props.knockUp * k(c.knockback), hitstop: Math.round(props.hitstop * k(1.6)), heavy: props.heavy || level > 0.8, guardDamage: props.guardDamage === undefined ? undefined : props.guardDamage * k(c.guard) };
}

export interface Projectile {
  owner: Fighter;
  pos: Vector3;
  prev: Vector3;
  vel: Vector3;
  radius: number;
  life: number;
  size: number;
  props: Spawn;
  id: number;
  gravity: number;
  visual: 'star' | 'arrow' | 'hook' | 'wave' | 'umbrella';
  /** Flying back to the owner after a returning shot (no hits, no terrain). */
  returning?: boolean;
  /** Runs along the floor and dies off the arena edge. */
  ground?: boolean;
  hook?: 'self' | 'yank' | 'anchor';
  onHit?: string;
}

/** Outcome of an attack reaching a fighter. */
export type HitResult = 'hit' | 'guard' | 'justGuard' | 'counter' | 'parry';

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
  | { type: 'recoil'; fighter: Fighter; pos: Vector3; strength: number }
  | { type: 'justGuard'; attacker: Fighter; target: Fighter; pos: Vector3; pushed: boolean }
  | { type: 'counter'; attacker: Fighter; target: Fighter; pos: Vector3 }
  | { type: 'parry'; attacker: Fighter; target: Fighter; pos: Vector3; reflected: boolean }
  | { type: 'grapple'; fighter: Fighter; pos: Vector3; onFighter: boolean }
  | { type: 'projectileBounce'; projectile: Projectile; pos: Vector3 }
  | { type: 'canopyBreak'; fighter: Fighter; attacker: Fighter; pos: Vector3 }
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
    if (!a.action?.def.passThrough && !b.action?.def.passThrough) this.separate(a, b);
    this.processAttacks(a, b);
    this.processAttacks(b, a);
    this.updateProjectiles();
    for (const f of this.fighters) f.umbrellaOut = this.projectiles.some((p) => p.owner === f && p.visual === 'umbrella');
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
        const range = w.reach ? w.reach[0] + (w.reach[1] - w.reach[0]) * ((a.frame - w.start) / Math.max(1, w.end - w.start - 1)) : w.range;
        center = att.eye.addScaledVector(att.aimDir(), range);
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
    const base = { owner: att, radius: s.radius * sizeK, life: s.life, size: (s.size ?? 1) * sizeK, props: s, gravity: s.gravity ?? 0, visual: s.visual ?? 'star', hook: s.hook, onHit: s.onHit } as const;
    if (s.from === 'ground') {
      // Shockwaves racing along the floor from the feet, fanned around the facing.
      const f = att.forward();
      const count = s.count ?? 1;
      for (let k = 0; k < count; k++) {
        const dir = f.clone().applyAxisAngle(new Vector3(0, 1, 0), (k - (count - 1) / 2) * (s.fan ?? 0));
        const p = att.pos.clone().addScaledVector(dir, 0.8).setY(att.pos.y + 0.45);
        this.projectiles.push({ ...base, pos: p.clone(), prev: p.clone(), vel: dir.multiplyScalar(s.speed), id: projectileId++, ground: true });
      }
      return;
    }
    if (s.from === 'sky') {
      // Rain: drop from above the opponent with a little scatter.
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.4;
      const p = new Vector3(tgt.pos.x + Math.cos(a) * r + tgt.vel.x * 0.3, 13 + Math.random() * 3, tgt.pos.z + Math.sin(a) * r + tgt.vel.z * 0.3);
      this.projectiles.push({ ...base, pos: p.clone(), prev: p.clone(), vel: new Vector3((Math.random() - 0.5) * 2, -s.speed, (Math.random() - 0.5) * 2), id: projectileId++ });
      return;
    }
    // Double hook: the shooter waits for both anchors, then slingshots between them.
    if (s.hook === 'anchor') att.sling = { anchors: [], t: 0, launched: -1 };
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
    this.applyRecoil(att, tgt, (s.size ?? 1) * sizeK, speedK);
    att.shotCounter[s.hand]++;
    this.events.push({ type: 'shoot', attacker: att, hand: s.hand, pos: origin, big: (s.size ?? 1) > 1.2 });
  }

  /**
   * Shooting the floor or a floating rock (not the opponent) pushes the shooter
   * away from the impact, stronger when close: lets ranged fighters "rocket
   * jump" back to the stage.
   */
  private applyRecoil(att: Fighter, tgt: Fighter, size: number, speedK: number) {
    const base = att.def.recoil;
    if (!base) return;
    const RANGE = 16;
    const eye = att.eye;
    const dir = att.aimDir();
    const hit = raycastTerrain(eye, dir, RANGE);
    if (!hit) return;
    // The opponent in the way absorbs the shot instead.
    const toT = tgt.pos.clone().setY(tgt.pos.y + 1).sub(eye);
    const along = toT.dot(dir);
    if (along > 0 && along < hit.dist && toT.addScaledVector(dir, -along).length() < 0.8) return;
    // Shooting the ground while airborne kicks harder (a real rocket jump).
    const airK = att.grounded ? 1 : 1.7;
    const strength = base * airK * Math.sqrt(size) * speedK * (1 - (hit.dist / RANGE) * 0.6);
    // Upward kicks cancel the current fall first (rocket-jump feel), then add.
    const imp = dir.clone().multiplyScalar(-strength);
    att.vel.x += imp.x;
    att.vel.z += imp.z;
    att.vel.y = imp.y > 0 ? Math.max(att.vel.y, 0) + imp.y : att.vel.y + imp.y;
    if (att.vel.y > 0.5) {
      att.grounded = false;
      att.pos.y = Math.max(att.pos.y, 0.02);
    }
    const sp = att.vel.length();
    if (sp > 20) att.vel.multiplyScalar(20 / sp);
    this.events.push({ type: 'recoil', fighter: att, pos: hit.point, strength });
  }

  private updateProjectiles() {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.prev.copy(p.pos);
      if (p.returning) {
        // Harmless flight home; caught when it reaches the owner.
        const home = p.owner.pos.clone().setY(p.owner.pos.y + 1.2).sub(p.pos);
        const d = home.length();
        p.life--;
        if (d < 0.9 || p.life <= 0 || !p.owner.isAlive()) {
          this.events.push({ type: 'projectileEnd', projectile: p });
          continue;
        }
        p.vel.copy(home.multiplyScalar(Math.min(52, d / TICK) / d));
        p.pos.addScaledVector(p.vel, TICK);
        keep.push(p);
        continue;
      }
      const foe = this.fighters[0] === p.owner ? this.fighters[1] : this.fighters[0];
      if (p.props.homing && foe.isAlive()) {
        // Turn toward the opponent's chest at a limited rate.
        const want = foe.pos.clone().setY(foe.pos.y + 1).sub(p.pos).normalize();
        const sp = p.vel.length();
        const cur = p.vel.clone().divideScalar(sp);
        const ang = Math.acos(Math.min(1, Math.max(-1, cur.dot(want))));
        const max = p.props.homing * TICK;
        if (ang > 1e-4) cur.lerp(want, Math.min(1, max / ang)).normalize();
        p.vel.copy(cur.multiplyScalar(sp));
      }
      if (p.gravity) p.vel.y -= p.gravity * TICK;
      p.pos.addScaledVector(p.vel, TICK);
      p.life--;
      if (p.ground && Math.hypot(p.pos.x, p.pos.z) > ARENA_RADIUS + 0.3) p.life = 0;
      // Projectiles stop on the arena and floating rocks.
      const ground = segmentHitsTerrain(p.prev, p.pos);
      if (ground) {
        p.pos.copy(ground);
        p.life = 0;
        // A hook that bites into terrain reels its owner in.
        if (p.hook && p.hook !== 'anchor' && canGrapple(p.owner)) {
          p.owner.startGrapple(ground);
          this.events.push({ type: 'grapple', fighter: p.owner, pos: ground.clone(), onFighter: false });
        }
      }
      const tgt = this.fighters[0] === p.owner ? this.fighters[1] : this.fighters[0];
      let alive = p.life > 0 && p.pos.y > -20;
      if (alive && tgt.isAlive() && !tgt.isInvulnerable() && segmentCapsule(p.prev, p.pos, p.radius, tgt.pos)) {
        const dir = p.vel.clone().setY(0).normalize();
        if (tgt.reflectActive() && !p.hook && tgt.forward().dot(dir) < -0.2) {
          // Parried: the shot flies back at its owner, a little faster.
          const back = p.owner.pos.clone().setY(p.owner.pos.y + 1.1).sub(p.pos).normalize();
          p.vel.copy(back.multiplyScalar(p.vel.length() * 1.2));
          p.gravity = 0;
          p.life = Math.max(p.life, 50);
          this.events.push({ type: 'parry', attacker: p.owner, target: tgt, pos: p.pos.clone(), reflected: true });
          tgt.gainUlt(6);
          // Each deflected shot wears an umbrella down.
          if (tgt.damageCanopy(Math.max(p.props.guardDamage ?? 0, p.props.damage * 0.5))) this.events.push({ type: 'canopyBreak', fighter: tgt, attacker: p.owner, pos: p.pos.clone() });
          p.owner = tgt;
          keep.push(p);
          continue;
        }
        const res = this.applyHit(p.owner, tgt, p.props, dir, closestOnCapsule(p.pos, tgt.pos), true);
        alive = false;
        if (res === 'hit' && tgt.isAlive()) {
          if (p.hook === 'self' && canGrapple(p.owner)) {
            p.owner.startGrapple(tgt.pos, tgt);
            this.events.push({ type: 'grapple', fighter: p.owner, pos: p.pos.clone(), onFighter: true });
          } else if (p.hook === 'yank') {
            // Reel the target in toward the shooter.
            tgt.setState('hitstun', 50);
            tgt.startGrapple(p.owner.pos, p.owner, true);
            this.events.push({ type: 'grapple', fighter: p.owner, pos: p.pos.clone(), onFighter: true });
          }
          if (p.onHit && canGrapple(p.owner)) p.owner.startAction(p.onHit);
        }
      }
      if (alive) keep.push(p);
      else if (p.props.returns && p.owner.isAlive()) {
        p.returning = true;
        p.life = 90;
        this.events.push({ type: 'projectileBounce', projectile: p, pos: p.pos.clone() });
        keep.push(p);
      } else {
        if (p.hook === 'anchor') {
          p.owner.addAnchor(p.pos);
          this.events.push({ type: 'grapple', fighter: p.owner, pos: p.pos.clone(), onFighter: false });
        }
        this.events.push({ type: 'projectileEnd', projectile: p });
      }
    }
    this.projectiles = keep;
  }

  applyHit(att: Fighter, tgt: Fighter, props: HitProps, dir: Vector3, point: Vector3, projectile: boolean): HitResult {
    const toAttacker = dir.clone().multiplyScalar(-1);
    const facing = tgt.forward().dot(toAttacker) > 0.1;
    // An umbrella only stops shots; melee goes straight through it.
    const guarded = tgt.guarding && tgt.state === 'free' && facing;

    const counter = tgt.counterActive();
    if (counter) {
      // Iai counter: vanish and reappear behind the attacker, who is frozen for a moment.
      const dist = att.pos.distanceTo(tgt.pos);
      if (dist < 14) {
        const behind = att.forward().multiplyScalar(-1.4);
        tgt.pos.set(att.pos.x + behind.x, Math.max(att.pos.y, tgt.pos.y > 0 ? att.pos.y : 0), att.pos.z + behind.z);
        tgt.prevPos.copy(tgt.pos);
        tgt.vel.set(0, 0, 0);
        const to = att.pos.clone().sub(tgt.pos);
        tgt.yaw = Math.atan2(-to.x, -to.z);
        tgt.pitch = 0;
        tgt.yawOverride = tgt.yaw;
        if (!(att.action?.def.armor && att.state === 'action')) {
          att.vel.set(0, att.vel.y, 0);
          att.setState('hitstun', 26);
        }
      }
      tgt.startAction(counter.follow);
      tgt.invuln = Math.max(tgt.invuln, 12);
      tgt.gainUlt(10);
      this.hitstop = Math.max(this.hitstop, 12);
      this.events.push({ type: 'counter', attacker: att, target: tgt, pos: point });
      return 'counter';
    }
    if (!projectile && tgt.reflectActive() && facing && !tgt.def.canopy) {
      // Umbrella parry vs melee: blocked cleanly and the attacker bounces off.
      if (!(att.action?.def.armor && att.state === 'action')) att.receiveHit(dir.clone().multiplyScalar(-1), 9, 4, 26, 0.5);
      tgt.gainUlt(8);
      this.hitstop = Math.max(this.hitstop, 9);
      this.events.push({ type: 'parry', attacker: att, target: tgt, pos: point, reflected: false });
      return 'parry';
    }
    // Lower HP -> bigger launches, so ring-outs become a threat late in the round.
    const hpScale = 1 + (1 - tgt.hp / tgt.def.maxHp) * 1.2;

    if (guarded && tgt.isJustGuard()) {
      // Just guard: no chip damage, guard refills a bit, and a melee attacker is bounced away.
      tgt.guardHp = Math.min(GUARD_MAX, tgt.guardHp + 20);
      tgt.gainUlt(8);
      tgt.lastHitDir.copy(dir);
      tgt.lastHitStrength = 0.2;
      tgt.hitCounter++;
      const near = att.pos.distanceTo(tgt.pos) < 4.5;
      const pushed = near && att.isAlive() && !att.isInvulnerable() && !(att.action?.def.armor && att.state === 'action');
      if (pushed) att.receiveHit(dir.clone().multiplyScalar(-1), 8, 4, 24, 0.5);
      this.hitstop = Math.max(this.hitstop, 10);
      this.events.push({ type: 'justGuard', attacker: att, target: tgt, pos: point, pushed });
      return 'justGuard';
    }

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
      return 'guard';
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
    return 'hit';
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

function canGrapple(f: Fighter) {
  return f.isAlive() && (f.state === 'free' || f.state === 'action' || f.state === 'dash');
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
