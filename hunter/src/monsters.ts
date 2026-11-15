import * as THREE from 'three';
import { Creature, type Ctx, type PartState } from './creature';
import { MONSTERS, type MonsterDef, type MonsterId } from './data';
import type { HitInfo } from './combat';
import { audio } from './audio';

type State = 'idle' | 'wander' | 'chase' | 'attack' | 'hurt' | 'dead' | 'hide' | 'burrow' | 'under' | 'emerge' | 'spawn' | 'spit';

export class Monster extends Creature {
  def: MonsterDef;
  state: State = 'idle';
  stateT = 0;
  attackCd = 1;
  hitDone = false;
  home: THREE.Vector3;
  wanderTarget = new THREE.Vector3();
  specialCd = 3;
  flyPhase = Math.random() * 10;
  minion = false;
  displayName: string;
  lungeVel = new THREE.Vector3();
  baseY = 0;

  constructor(ctx: Ctx, id: MonsterId, pos: THREE.Vector3, opts: { minion?: boolean } = {}) {
    const def = MONSTERS[id];
    super(ctx, def.model, def.scale, def.hp, def.radius);
    this.def = def;
    this.displayName = `${def.name}〈${def.title}〉`;
    this.root.position.copy(pos);
    this.root.position.y = ctx.world.heightAt(pos.x, pos.z) + (def.flying ?? 0);
    this.home = pos.clone();
    this.yaw = Math.random() * Math.PI * 2;
    this.setupHitboxes(def.hitboxes);
    this.setupParts(def.parts);
    this.minion = !!opts.minion;
    if (this.minion) this.aggro = true;
    if (def.anims.spawn && this.minion) {
      this.state = 'spawn';
      this.play(def.anims.spawn, { loop: false });
    } else this.play(def.anims.idle);
    this.mixer.update(Math.random() * 2);
  }

  get pos() {
    return this.root.position;
  }

  immuneFactor() {
    return this.state === 'hide' ? 0.12 : this.state === 'under' ? 0 : 1;
  }

  setState(s: State) {
    this.state = s;
    this.stateT = 0;
    this.hitDone = false;
  }

  update(dt: number) {
    this.stateT += dt;
    const { world, player } = this.ctx;
    const d = this.def;
    const pp = player.pos;
    const toP = new THREE.Vector3(pp.x - this.pos.x, 0, pp.z - this.pos.z);
    const dist = toP.length();
    const ts = this.slowT > 0 ? 0.6 : 1;
    this.attackCd -= dt * ts;
    this.specialCd -= dt * ts;

    if (this.state === 'dead') {
      this.deadT += dt;
      if (this.deadT > 3.5) {
        this.root.position.y -= dt * 0.6;
        if (this.deadT > 6) this.removeMe = true;
      } else if (d.flying) {
        // 墜落
        const gh = world.heightAt(this.pos.x, this.pos.z);
        this.root.position.y = Math.max(gh, this.root.position.y - dt * 6);
      }
      this.updateCommon(dt);
      this.updateFlash(dt);
      return;
    }

    if (!this.aggro && dist < d.aggro && !player.dead) {
      this.aggro = true;
      this.sfx(d.sfx.attack ?? d.sfx.pain, 0.5, 0.9);
      // 群れにも伝播
      for (const c of this.ctx.creatures) if (c !== this && c.alive && c.root.position.distanceTo(this.pos) < 14) c.aggro = true;
    }
    if (player.dead) this.aggro = false;

    let moveSpeed = 0;
    let moveDir = new THREE.Vector3();
    switch (this.state) {
      case 'spawn':
        if (this.finished()) this.setState('chase');
        break;
      case 'idle':
      case 'wander': {
        if (this.aggro) {
          this.setState('chase');
          break;
        }
        if (d.speed > 0) {
          if (this.state === 'idle' && this.stateT > 2 + Math.random() * 3) {
            this.wanderTarget.set(this.home.x + (Math.random() - 0.5) * 10, 0, this.home.z + (Math.random() - 0.5) * 10);
            this.setState('wander');
          }
          if (this.state === 'wander') {
            const w = this.wanderTarget.clone().sub(this.pos).setY(0);
            if (w.length() < 1 || this.stateT > 6) this.setState('idle');
            else {
              moveDir = w.normalize();
              moveSpeed = d.speed * 0.3;
            }
          }
        }
        this.play(moveSpeed > 0 ? d.anims.move : d.anims.idle, { speed: moveSpeed > 0 ? 0.6 : 1 });
        break;
      }
      case 'chase': {
        if (!this.aggro) {
          this.setState('idle');
          break;
        }
        this.faceTo(pp, dt, 6);
        const ranged = this.isRanged();
        // 特殊行動
        if (this.trySpecial(dist)) break;
        if (ranged) {
          const pref = d.id === 'plant' ? 0 : 14;
          if (d.speed > 0) {
            if (dist > pref + 4) {
              moveDir = toP.clone().normalize();
              moveSpeed = d.speed;
            } else if (dist < pref - 5) {
              moveDir = toP.clone().normalize().negate();
              moveSpeed = d.speed * 0.8;
            } else {
              moveDir = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(Math.sin(this.flyPhase * 0.7) > 0 ? 1 : -1);
              moveSpeed = d.speed * 0.5;
            }
          }
          if (dist < d.attackRange && this.attackCd <= 0) this.startAttack();
        } else {
          if (dist > d.attackRange * 0.85) {
            moveDir = toP.clone().normalize();
            moveSpeed = d.speed;
          }
          if (dist < d.attackRange && this.attackCd <= 0) this.startAttack();
        }
        if (this.state === 'chase') this.play(moveSpeed > 0 ? d.anims.move : d.anims.idle, { speed: moveSpeed > 0 ? Math.max(0.7, moveSpeed / d.speed) : 1 });
        break;
      }
      case 'attack': {
        this.faceTo(pp, dt, this.def.id === 'wolf' && this.progress() > 0.3 ? 1 : 5);
        const prog = this.progress();
        if (this.def.id === 'wolf' && prog > 0.3 && prog < 0.5) {
          moveDir = toP.clone().normalize();
          moveSpeed = 9;
        }
        if (!this.hitDone && prog >= d.attackHit) {
          this.hitDone = true;
          this.attackHitNow(dist);
        }
        if (this.finished() || prog > 0.98) {
          this.setState('chase');
        }
        break;
      }
      case 'hurt':
        if (this.finished() || this.stateT > 0.8) this.setState('chase');
        break;
      case 'hide':
        this.play(this.stateT < 0.7 ? d.anims.hide! : d.anims.hideIdle!, { loop: this.stateT >= 0.7, fade: 0.1 });
        if (this.stateT > 3) {
          this.setState('chase');
        }
        break;
      case 'burrow':
        if (this.finished()) {
          this.setState('under');
          this.model.visible = false;
        }
        break;
      case 'under': {
        moveDir = toP.clone().normalize();
        moveSpeed = dist > 1 ? 10 : 0;
        if (Math.random() < dt * 20) this.ctx.fx.spawn('impact', this.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), { life: 0.4, size: 1, size1: 1.6, additive: false, sheet: true, color: 0x6a5a40 });
        if (this.stateT > 1.6 || dist < 1.2) {
          this.setState('emerge');
          this.model.visible = true;
          this.play(d.anims.emerge!, { loop: false, fade: 0.01, restart: true });
          audio.play('ground_slam', { vol: 0.6, pos: this.pos, rate: 1.4 });
        }
        break;
      }
      case 'emerge':
        if (!this.hitDone && this.progress() > 0.3) {
          this.hitDone = true;
          if (dist < 2.8) player.damage(d.damage * 1.3, this.pos.clone());
          this.ctx.fx.explosion(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 2.4, 0x907050);
        }
        if (this.finished()) this.setState('chase');
        break;
      case 'spit':
        this.faceTo(pp, dt, 6);
        if (!this.hitDone && this.progress() > 0.5) {
          this.hitDone = true;
          this.shootAt(pp.clone().add(new THREE.Vector3(0, 1, 0)), 22, 'web', 'slow', 4, 0xf0f0ff);
        }
        if (this.finished()) this.setState('chase');
        break;
    }

    // 移動
    if (moveSpeed > 0) {
      const sp = moveSpeed * ts;
      this.pos.addScaledVector(moveDir, sp * dt);
      if (this.state !== 'attack') this.faceTo(this.pos.clone().add(moveDir), dt, 8);
    }
    // 群れの押し合い
    for (const c of this.ctx.creatures) {
      if (c === this || !c.alive) continue;
      const o = c.root.position;
      const dx = this.pos.x - o.x;
      const dz = this.pos.z - o.z;
      const dd = Math.hypot(dx, dz);
      const min = this.radius + c.radius;
      if (dd < min && dd > 1e-3) {
        const push = (min - dd) * 0.5;
        this.pos.x += (dx / dd) * push;
        this.pos.z += (dz / dd) * push;
      }
    }
    // プレイヤーと重ならない
    const pd = Math.hypot(this.pos.x - pp.x, this.pos.z - pp.z);
    if (pd < this.radius + 0.4 && pd > 1e-3 && this.state !== 'under') {
      this.pos.x = pp.x + ((this.pos.x - pp.x) / pd) * (this.radius + 0.4);
      this.pos.z = pp.z + ((this.pos.z - pp.z) / pd) * (this.radius + 0.4);
    }
    world.constrain(this.pos, this.radius * 0.6, this.minion);
    const gh = world.heightAt(this.pos.x, this.pos.z);
    if (d.flying) {
      this.flyPhase += dt;
      let alt = d.flying + Math.sin(this.flyPhase * 2.3) * 0.4;
      if (this.state === 'attack') alt = THREE.MathUtils.lerp(alt, 1.3, Math.sin(Math.min(1, this.progress()) * Math.PI));
      this.root.position.y = THREE.MathUtils.damp(this.root.position.y, gh + alt, 4, dt);
      if (d.id === 'bat' && this.aggro) {
        this.pos.x += Math.sin(this.flyPhase * 3.1) * dt * 2.5;
        this.pos.z += Math.cos(this.flyPhase * 2.7) * dt * 2.5;
      }
    } else {
      this.root.position.y = gh;
    }
    this.updateCommon(dt);
    this.updateFlash(dt);
  }

  isRanged() {
    const id = this.def.id;
    if (id === 'skeleton') return this.partIntact('bow');
    return id === 'plant';
  }

  trySpecial(dist: number) {
    const d = this.def;
    if (this.specialCd > 0) return false;
    if (d.id === 'crab' && this.partIntact('cart')) {
      if (dist > 9 && dist < 26) {
        this.specialCd = 9;
        this.setState('burrow');
        this.play(d.anims.burrow!, { loop: false, restart: true });
        audio.play('ground_slam', { vol: 0.4, pos: this.pos, rate: 1.6 });
        return true;
      }
    }
    if (d.id === 'spider' && dist > 6 && dist < 18) {
      this.specialCd = 4.5;
      this.setState('spit');
      this.play(d.anims.attack, { loop: false, restart: true });
      return true;
    }
    return false;
  }

  startAttack() {
    const d = this.def;
    this.setState('attack');
    const sp = d.id === 'wolf' ? 1.4 : d.id === 'rat' ? 1.3 : 1;
    this.play(d.anims.attack, { loop: false, restart: true, speed: sp, fade: 0.1 });
    this.attackCd = d.attackCd + Math.random() * 0.6;
    if (d.sfx.attack) this.sfx(d.sfx.attack, 0.6);
  }

  attackHitNow(dist: number) {
    const d = this.def;
    const { player } = this.ctx;
    if (d.id === 'plant') {
      this.lob(player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)));
      return;
    }
    if (d.id === 'skeleton' && this.partIntact('bow')) {
      const aim = player.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
      aim.addScaledVector(player.vel, dist / 40);
      this.shootAt(aim, 40, 'bolt', undefined, d.damage, 0xb070ff);
      audio.play('bow_shoot', { vol: 0.6, pos: this.pos, rate: 0.7 });
      return;
    }
    // 近接
    const reach = d.attackRange * 1.25 + 0.3;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const to = player.pos.clone().sub(this.pos).setY(0);
    const facing = to.normalize().dot(fwd) > 0.3;
    if (dist < reach && facing) {
      let dmg = d.damage;
      if (d.id === 'skeleton') dmg *= 1.2;
      const ok = player.damage(dmg, this.pos.clone());
      if (ok) {
        if (d.id === 'wasp' && this.partIntact('sting')) player.poison = Math.max(player.poison, 5);
        if (d.id === 'bat') this.hp = Math.min(this.maxHp, this.hp + dmg);
        audio.play('heavy_swing', { vol: 0.4, rate: 1.4 });
      }
    }
  }

  shootAt(target: THREE.Vector3, speed: number, visual: 'bolt' | 'web', effect: 'slow' | undefined, dmg: number, color: number) {
    const from = this.center.clone().add(new THREE.Vector3(0, 0.2, 0));
    const v = target.clone().sub(from).normalize().multiplyScalar(speed);
    this.ctx.combat.spawn({ owner: 'enemy', pos: from, vel: v, dmg, visual, enemyEffect: effect, color, life: 3, radius: visual === 'web' ? 0.6 : 0.25 });
  }

  /** 爆嚢花：放物線で種を撃つ */
  lob(target: THREE.Vector3) {
    const from = this.center.clone().add(new THREE.Vector3(0, 1.2, 0));
    const g = 14;
    const flat = new THREE.Vector3(target.x - from.x, 0, target.z - from.z);
    const dist = flat.length();
    const t = THREE.MathUtils.clamp(dist / 14, 0.7, 1.8);
    const vy = (target.y - from.y + 0.5 * g * t * t) / t;
    const v = flat.normalize().multiplyScalar(dist / t).setY(vy);
    this.ctx.combat.spawn({ owner: 'enemy', pos: from, vel: v, gravity: g, dmg: this.def.damage, visual: 'seed', enemyEffect: 'explode', color: 0xff8a20, life: 4, radius: 0.5 });
    audio.play('boss_projectile', { vol: 0.5, pos: from, rate: 1.3 });
  }

  onDamaged(dmg: number, h: HitInfo, broke: boolean) {
    const d = this.def;
    if (Math.random() < 0.35) this.sfx(d.sfx.pain, 0.55);
    // 坑殻蟹：トロッコが残っていれば殻にこもる
    if (d.id === 'crab' && this.partIntact('cart') && this.state !== 'hide' && this.state !== 'under' && this.state !== 'burrow' && this.hp < this.maxHp * 0.75 && this.flinchCd <= 0 && Math.random() < 0.4) {
      this.setState('hide');
      this.flinchCd = 6;
      this.play(d.anims.hide!, { loop: false, restart: true });
      return;
    }
    const big = broke || this.hurtAccum > this.maxHp * 0.35 || h.kind === 'weak';
    if (big && this.flinchCd <= 0 && d.anims.hit && this.state !== 'under' && this.state !== 'burrow') {
      this.flinchCd = broke ? 0.5 : 2.2;
      this.hurtAccum = 0;
      this.setState('hurt');
      this.play(d.anims.hit, { loop: false, restart: true, speed: 1.3 });
    }
  }

  onDeath() {
    this.setState('dead');
    this.model.visible = true;
    this.play(this.def.anims.death, { loop: false, restart: true, fade: 0.08 });
    this.sfx(this.def.sfx.death, 0.85);
    for (const hb of this.hitboxes) hb.active = false;
  }

  onPartBroken(_p: PartState) {}
}
