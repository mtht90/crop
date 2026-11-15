import * as THREE from 'three';
import { Creature, type Ctx, type PartState } from './creature';
import { BOSS } from './data';
import type { HitInfo } from './combat';
import { audio } from './audio';

type BState = 'dormant' | 'intro' | 'chase' | 'slam' | 'sweep' | 'whirl' | 'leapUp' | 'leapAir' | 'leapDown' | 'summon' | 'stagger' | 'dead';

interface Wave { c: THREE.Vector3; r: number; speed: number; max: number; hit: boolean; dmg: number }

export class Boss extends Creature {
  displayName = BOSS.name;
  state: BState = 'dormant';
  stateT = 0;
  hitDone = false;
  attackCd = 2;
  summonCd = 14;
  enraged = false;
  waves: Wave[] = [];
  leapTarget = new THREE.Vector3();
  leapFrom = new THREE.Vector3();
  marker?: THREE.Mesh;
  lastAttack = '';
  started = false;
  onStart?: () => void;
  onAnnounce?: (msg: string) => void;
  spawnMinion?: (pos: THREE.Vector3) => void;
  minionCount = () => 0;
  deathT = 0;

  constructor(ctx: Ctx, pos: THREE.Vector3) {
    super(ctx, BOSS.model, BOSS.scale, BOSS.hp, BOSS.radius);
    this.isBoss = true;
    this.root.position.copy(pos);
    this.root.position.y = ctx.world.heightAt(pos.x, pos.z);
    this.yaw = 0; // 入口（+Z）を向く
    this.setupHitboxes(BOSS.hitboxes);
    this.setupParts(BOSS.parts);
    // 当たり判定の半径はスケール0.95基準で定義している
    for (const hb of this.hitboxes) hb.r *= BOSS.scale / 0.95;
    // 胸甲が壊れると露出する肋骨の弱点（最初は無効）
    const ex = BOSS.exposed[0];
    const bone = this.model.getObjectByName(ex.bone)!;
    this.hitboxes.push({ def: ex, bone, pos: new THREE.Vector3(), r: (ex.r * BOSS.scale) / 0.95, active: false });
    this.play('intro_doigt_idle');
  }

  get pos() {
    return this.root.position;
  }

  get speedMul() {
    let s = this.enraged ? 1.2 : 1;
    if (!this.partIntact('armor')) s *= 1.3;
    return s;
  }

  setState(s: BState) {
    this.state = s;
    this.stateT = 0;
    this.hitDone = false;
  }

  startFight() {
    if (this.started) return;
    this.started = true;
    this.setState('intro');
    this.play('intro_doigt_idle', { restart: true });
    audio.play('boss_roar', { vol: 1 });
    this.ctx.player.shake = 1.2;
    this.onStart?.();
  }

  update(dt: number) {
    this.stateT += dt;
    const { player, world, fx } = this.ctx;
    const pp = player.pos;
    const toP = new THREE.Vector3(pp.x - this.pos.x, 0, pp.z - this.pos.z);
    const dist = toP.length();
    const ts = (this.slowT > 0 ? 0.75 : 1) * this.speedMul;
    const intactHammer = this.partIntact('hammer');
    this.attackCd -= dt * ts * (this.enraged ? 1.4 : 1);
    this.summonCd -= dt;

    // 衝撃波
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.speed * dt;
      const pd = Math.hypot(pp.x - w.c.x, pp.z - w.c.z);
      const grounded = pp.y - world.heightAt(pp.x, pp.z) < 0.35;
      if (!w.hit && Math.abs(pd - w.r) < 0.9 && grounded) {
        w.hit = true;
        player.damage(w.dmg, w.c);
      }
      if (w.r > w.max) this.waves.splice(i, 1);
    }

    switch (this.state) {
      case 'dormant':
        if (world.inArena(pp.x, pp.z, -4) && !player.dead) this.startFight();
        break;
      case 'intro':
        this.faceTo(pp, dt, 2);
        if (this.stateT > 2.6) this.setState('chase');
        break;
      case 'dead':
        this.deathT += dt;
        if (this.deathT < 2.4) {
          if (Math.random() < dt * 8) {
            const p = this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 4, (Math.random() - 0.5) * 3));
            fx.explosion(p, 1.5, 0x80b0ff);
            if (Math.random() < 0.4) audio.play('explosion_small', { vol: 0.6, pos: p });
          }
        } else {
          this.root.position.y -= dt * 1.2;
          if (this.deathT > 6) this.root.visible = false;
        }
        this.updateCommon(dt);
        return;
      case 'chase': {
        if (player.dead) {
          this.play('idle');
          break;
        }
        this.faceTo(pp, dt, 3 * ts);
        if (this.attackCd <= 0) {
          this.chooseAttack(dist, intactHammer);
          break;
        }
        if (dist > 6.5) {
          this.pos.addScaledVector(toP.normalize(), BOSS.speed * ts * dt);
          this.play('walk', { speed: ts * 1.1 });
        } else this.play('idle');
        break;
      }
      case 'slam': {
        if (this.stateT < 1.2) this.faceTo(pp, dt, 2.5);
        const prog = this.progress();
        if (!this.hitDone && prog >= 0.55) {
          this.hitDone = true;
          const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const at = this.pos.clone().addScaledVector(fwd, intactHammer ? 5.5 : 3.6);
          at.y = world.heightAt(at.x, at.z);
          this.impact(at, intactHammer ? 4.6 : 3.2, intactHammer ? 30 : 20);
          if (intactHammer) this.wave(at, 18, 13, 18);
        }
        if (this.finished()) this.endAttack();
        break;
      }
      case 'sweep': {
        const prog = this.progress();
        if (prog < 0.25) this.faceTo(pp, dt, 3);
        if (!this.hitDone && prog >= 0.3) {
          this.hitDone = true;
          const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const reach = intactHammer ? 8 : 5.5;
          const to = pp.clone().sub(this.pos).setY(0);
          if (to.length() < reach && to.normalize().dot(fwd) > -0.1) {
            player.damage(intactHammer ? 24 : 16, this.pos.clone());
            player.knock.addScaledVector(to, 10);
          }
          audio.play('heavy_swing', { vol: 1, pos: this.center, rate: 0.6 });
        }
        if (this.finished()) this.endAttack();
        break;
      }
      case 'whirl': {
        const prog = this.progress();
        const spin = prog > 0.33 && prog < 0.78;
        if (spin) {
          const sp = (intactHammer ? 5.5 : 7.5) * ts;
          this.pos.addScaledVector(toP.normalize(), sp * dt);
          if (this.stateT % 0.45 < dt) {
            audio.play('whirlwind', { vol: 0.7, pos: this.center, rate: 1.2 });
            if (dist < (intactHammer ? 4.6 : 3.6)) player.damage(intactHammer ? 14 : 11, this.pos.clone());
          }
          if (Math.random() < dt * 30) fx.spawn('impact', this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0.3, (Math.random() - 0.5) * 6)), { life: 0.5, size: 1.5, size1: 2.5, additive: false, sheet: true, color: 0x8a8070 });
        } else if (prog < 0.33) this.faceTo(pp, dt, 3);
        if (this.finished()) this.endAttack();
        break;
      }
      case 'leapUp': {
        if (this.stateT < 0.5) this.faceTo(pp, dt, 4);
        if (this.finished()) {
          this.setState('leapAir');
          this.play('JESUS_idle', { fade: 0.05 });
          this.leapFrom.copy(this.pos);
          this.leapTarget.copy(pp);
          this.showMarker(this.leapTarget, intactHammer ? 6.5 : 4.5);
        }
        break;
      }
      case 'leapAir': {
        const dur = 0.9;
        // 着地点は少しだけ追尾
        this.leapTarget.lerp(new THREE.Vector3(pp.x, 0, pp.z), dt * 1.5);
        this.marker?.position.set(this.leapTarget.x, world.heightAt(this.leapTarget.x, this.leapTarget.z) + 0.2, this.leapTarget.z);
        const t = Math.min(1, this.stateT / dur);
        this.pos.x = THREE.MathUtils.lerp(this.leapFrom.x, this.leapTarget.x, t);
        this.pos.z = THREE.MathUtils.lerp(this.leapFrom.z, this.leapTarget.z, t);
        this.faceTo(this.leapTarget, dt, 4);
        if (t >= 1) {
          this.setState('leapDown');
          this.play('JESUS_reception', { loop: false, restart: true, fade: 0.05 });
        }
        break;
      }
      case 'leapDown': {
        if (!this.hitDone && this.progress() > 0.12) {
          this.hitDone = true;
          this.hideMarker();
          const at = this.pos.clone();
          at.y = world.heightAt(at.x, at.z);
          this.impact(at, intactHammer ? 6.5 : 4.5, intactHammer ? 34 : 24);
          if (intactHammer) this.wave(at, 16, 15, 16);
        }
        if (this.finished()) this.endAttack();
        break;
      }
      case 'summon': {
        if (!this.hitDone && this.progress() > 0.55) {
          this.hitDone = true;
          const n = this.enraged ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const a = this.yaw + (i - (n - 1) / 2) * 1.1 + Math.PI;
            const p = this.pos.clone().add(new THREE.Vector3(Math.sin(a) * 9, 0, Math.cos(a) * 9));
            world.constrain(p, 1, true);
            this.spawnMinion?.(p);
            fx.coreBurst(p.clone().add(new THREE.Vector3(0, 1, 0)), 0xb070ff);
          }
          audio.play('charge', { vol: 0.6, pos: this.center, rate: 1.5 });
        }
        if (this.finished()) this.endAttack();
        break;
      }
      case 'stagger':
        if (this.finished()) this.endAttack(0.6);
        break;
    }
    world.constrain(this.pos, this.radius, true);
    this.pos.y = world.heightAt(this.pos.x, this.pos.z);
    // プレイヤーを押し出す
    const pd = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
    if (pd < this.radius + 0.5 && pd > 1e-3 && this.state !== 'leapAir') {
      pp.x = this.pos.x + ((pp.x - this.pos.x) / pd) * (this.radius + 0.5);
      pp.z = this.pos.z + ((pp.z - this.pos.z) / pd) * (this.radius + 0.5);
    }
    this.updateCommon(dt);
    this.updateFlash(dt);
  }

  chooseAttack(dist: number, intactHammer: boolean) {
    const opts: [string, number][] = [];
    if (this.summonCd <= 0 && this.minionCount() < 2) opts.push(['summon', 3]);
    if (dist < 6.5) {
      opts.push(['sweep', 3], ['slam', 2]);
    } else if (dist < 16) {
      opts.push(['whirl', intactHammer ? 2 : 3], ['slam', intactHammer ? 3 : 1], ['leap', 1]);
    } else {
      opts.push(['leap', 3], ['whirl', 1]);
    }
    // 同じ技の連続を避ける
    const filtered = opts.filter(([k]) => k !== this.lastAttack);
    const pool = filtered.length ? filtered : opts;
    let sum = pool.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * sum;
    let pick = pool[0][0];
    for (const [k, w] of pool) {
      r -= w;
      if (r <= 0) {
        pick = k;
        break;
      }
    }
    this.lastAttack = pick;
    const ts = (this.slowT > 0 ? 0.75 : 1) * (this.enraged ? 1.15 : 1);
    switch (pick) {
      case 'slam':
        this.setState('slam');
        this.play('attaque_sol', { loop: false, restart: true, speed: 1.15 * ts });
        audio.play('boss_grunt', { vol: 0.7, pos: this.center });
        break;
      case 'sweep':
        this.setState('sweep');
        this.play('repousse', { loop: false, restart: true, speed: 1.1 * ts });
        break;
      case 'whirl':
        this.setState('whirl');
        this.play('tourbilol_complet', { loop: false, restart: true, speed: 1.15 * ts });
        audio.play('boss_growl', { vol: 0.7, pos: this.center });
        break;
      case 'leap':
        this.setState('leapUp');
        this.play('JESUS_saut', { loop: false, restart: true, speed: 1.0 * ts });
        audio.play('boss_grunt', { vol: 0.8, pos: this.center, rate: 1.1 });
        break;
      case 'summon':
        this.setState('summon');
        this.summonCd = this.enraged ? 18 : 24;
        this.play('invocation_squelette', { loop: false, restart: true, speed: ts });
        audio.play('boss_roar', { vol: 0.6, pos: this.center, rate: 1.2 });
        break;
    }
  }

  endAttack(extra = 0) {
    this.setState('chase');
    this.attackCd = 1.4 + Math.random() * 1.2 + extra;
  }

  impact(at: THREE.Vector3, radius: number, dmg: number) {
    const { player, fx } = this.ctx;
    fx.explosion(at.clone().add(new THREE.Vector3(0, 0.3, 0)), radius * 0.7, 0xc0a080);
    audio.play('ground_slam', { vol: 1, pos: at });
    audio.play('explosion', { vol: 0.6, pos: at, rate: 0.8 });
    const d = Math.hypot(player.pos.x - at.x, player.pos.z - at.z);
    const air = player.pos.y - this.ctx.world.heightAt(player.pos.x, player.pos.z) > 0.8;
    if (d < radius && !air) player.damage(dmg * (1 - (d / radius) * 0.4), at);
    player.shake = Math.min(2, player.shake + Math.max(0, 1.4 - d / 18));
  }

  wave(at: THREE.Vector3, max: number, speed: number, dmg: number) {
    this.waves.push({ c: at.clone(), r: 1, speed, max, hit: false, dmg });
    this.ctx.fx.ring(at, max, max / speed, 0xffc890);
  }

  showMarker(p: THREE.Vector3, r: number) {
    this.hideMarker();
    const fx = this.ctx.fx;
    const m = fx.ring(p, r, 99, 0xff4030);
    // 縮尺固定・寿命は手動で管理
    const dec = fx.decals.find((x) => x.mesh === m)!;
    dec.size0 = dec.size1 = r * 2.2;
    this.marker = m;
  }
  hideMarker() {
    if (!this.marker) return;
    const fx = this.ctx.fx;
    const dec = fx.decals.find((x) => x.mesh === this.marker);
    if (dec) dec.life = dec.max;
    this.marker = undefined;
  }

  onDamaged(dmg: number, h: HitInfo, broke: boolean) {
    if (!this.started) this.startFight();
    if (!this.enraged && this.hp < this.maxHp * 0.45) {
      this.enraged = true;
      audio.play('boss_roar', { vol: 1, rate: 0.9 });
      this.ctx.player.shake = 1;
      this.onAnnounce?.('骸鍛王が怒り狂っている！');
    }
    const canStagger = ['chase', 'sweep', 'slam', 'whirl'].includes(this.state);
    if ((broke || this.hurtAccum > this.maxHp * 0.12) && canStagger && this.flinchCd <= 0) {
      this.hurtAccum = 0;
      this.flinchCd = 7;
      this.setState('stagger');
      this.play('hit', { loop: false, restart: true, speed: 1.1 });
      audio.play('boss_grunt', { vol: 0.9, pos: this.center, rate: 0.9 });
    }
    void dmg;
    void h;
  }

  breakPart(p: PartState) {
    super.breakPart(p);
    if (p.def.id === 'armor') {
      const ex = this.hitboxes.find((x) => x.def === BOSS.exposed[0]);
      if (ex) ex.active = true;
      this.onAnnounce?.('胸甲を破壊！ 肋骨の奥の炉心が露出した（弱点）。動きが速くなる！');
    }
    if (p.def.id === 'hammer') {
      this.onAnnounce?.('槌頭を破壊！ 衝撃波が出なくなり、攻撃範囲が縮んだ。');
    }
  }

  onDeath() {
    this.setState('dead');
    this.hideMarker();
    this.waves = [];
    this.play('hit', { loop: false, restart: true, speed: 0.5 });
    audio.play('boss_roar', { vol: 1, rate: 0.7 });
    for (const hb of this.hitboxes) hb.active = false;
  }
}
