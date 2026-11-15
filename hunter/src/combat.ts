import * as THREE from 'three';
import type { CoreId, HitboxDef, WeaponId } from './data';
import { CORES } from './data';
import type { World } from './world';
import type { FX } from './fx';
import type { Player } from './player';
import { audio } from './audio';
import { assets } from './assets';

export interface Hitbox {
  def: HitboxDef;
  bone: THREE.Object3D;
  pos: THREE.Vector3;
  r: number;
  active: boolean;
}

export interface HitInfo {
  dmg: number;
  kind: 'body' | 'weak' | 'part';
  part?: string;
  core?: CoreId;
  partMul: number;
  weakMul: number;
  point: THREE.Vector3;
  dir: THREE.Vector3;
  weapon?: WeaponId;
  splash?: boolean;
}
export interface HitResult {
  dealt: number;
  kind: 'body' | 'weak' | 'part' | 'armor' | 'immune';
  killed: boolean;
  broke?: string;
}

export interface Target {
  alive: boolean;
  hitboxes: Hitbox[];
  center: THREE.Vector3;
  boundR: number;
  isBoss?: boolean;
  receiveHit(h: HitInfo): HitResult;
}

export interface CombatEvents {
  onPlayerHit(res: HitResult, h: HitInfo, t: Target): void;
}

type Owner = 'player' | 'enemy';
export interface ProjOpts {
  owner: Owner;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  gravity?: number;
  dmg: number;
  weakMul?: number;
  partMul?: number;
  core?: CoreId;
  weapon?: WeaponId;
  visual: 'bullet' | 'arrow' | 'seed' | 'bolt' | 'web' | 'pellet';
  color?: number;
  life?: number;
  enemyEffect?: 'explode' | 'slow' | 'poison';
  radius?: number;
}

class Projectile {
  o: ProjOpts;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  pierce = 0;
  bounce = 0;
  hit = new Set<Target>();
  obj: THREE.Object3D;
  dead = false;
  trailT = 0;
  constructor(o: ProjOpts, obj: THREE.Object3D) {
    this.o = o;
    this.pos = o.pos.clone();
    this.vel = o.vel.clone();
    this.life = o.life ?? 3;
    this.obj = obj;
    if (o.core === 'fang') this.pierce = 3;
    if (o.core === 'shell') this.bounce = 3;
  }
}

export class Combat {
  scene: THREE.Scene;
  world: World;
  fx: FX;
  player: Player;
  projs: Projectile[] = [];
  targets: Target[] = [];
  events: CombatEvents;
  arrowSrc?: THREE.Object3D;
  spriteMats = new Map<string, THREE.SpriteMaterial>();

  constructor(scene: THREE.Scene, world: World, fx: FX, player: Player, events: CombatEvents) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.player = player;
    this.events = events;
    // 矢のモデルは弓のリグから流用（外部素材）
    const bow = assets.model('fp_bow').scene;
    const f = bow.getObjectByName('fleche_1') ?? bow.getObjectByName('fleche');
    if (f) {
      const src = f as THREE.Mesh;
      const geo = src.geometry.clone();
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const size = bb.getSize(new THREE.Vector3());
      // 最長軸を -Z に揃える
      const axis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
      const c = bb.getCenter(new THREE.Vector3());
      geo.translate(-c.x, -c.y, -c.z);
      if (axis === 'x') geo.rotateY(Math.PI / 2);
      if (axis === 'y') geo.rotateX(Math.PI / 2);
      const len = Math.max(size.x, size.y, size.z);
      geo.scale(0.9 / len, 0.9 / len, 0.9 / len);
      const m = new THREE.Mesh(geo, (src.material as THREE.Material).clone());
      this.arrowSrc = m;
    }
  }

  private spriteMat(key: string, tex: 'x1' | 'sparkle' | 'corona' | 'star' | 'flarefour', color: number) {
    const k = key + color;
    let m = this.spriteMats.get(k);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: assets.texture(tex), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      this.spriteMats.set(k, m);
    }
    return m;
  }

  spawn(o: ProjOpts) {
    let obj: THREE.Object3D;
    const color = o.color ?? (o.core ? CORES[o.core].color : 0xffe0a0);
    if ((o.visual === 'arrow' || o.visual === 'bolt') && this.arrowSrc) {
      obj = this.arrowSrc.clone();
      if (o.visual === 'bolt') obj.scale.setScalar(0.8);
      if (o.core) {
        const glow = new THREE.Sprite(this.spriteMat('ag', 'sparkle', color));
        glow.scale.setScalar(0.6);
        glow.position.z = -0.4;
        obj.add(glow);
      }
    } else {
      const tex = o.visual === 'seed' ? 'corona' : o.visual === 'web' ? 'sparkle' : 'x1';
      const s = new THREE.Sprite(this.spriteMat(o.visual, tex, color));
      const size = o.visual === 'seed' ? 0.9 : o.visual === 'web' ? 0.8 : o.visual === 'pellet' ? 0.22 : o.core ? 0.42 : 0.3;
      s.scale.setScalar(size);
      obj = s;
    }
    obj.position.copy(o.pos);
    this.scene.add(obj);
    const p = new Projectile(o, obj);
    this.projs.push(p);
    return p;
  }

  update(dt: number) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= dt;
      if (p.life <= 0 || p.dead) {
        this.remove(i);
        continue;
      }
      // 追尾呪弾
      if (p.o.core === 'curse' && p.o.owner === 'player') this.steer(p, dt);
      p.vel.y -= (p.o.gravity ?? 0) * dt;
      a.copy(p.pos);
      b.copy(p.pos).addScaledVector(p.vel, dt);

      let consumed = false;
      if (p.o.owner === 'player') {
        // 対象との当たり
        const hit = this.raycastTargets(a, b, p);
        // 地形・障害物
        const env = this.envHit(a, b);
        if (hit && (!env || hit.t <= env.t)) {
          b.copy(a).lerp(b, hit.t);
          consumed = this.onTargetHit(p, hit.target, hit.hb, b.clone());
        } else if (env) {
          b.copy(a).lerp(b, env.t);
          consumed = this.onEnvHit(p, b.clone(), env.normal);
        }
      } else {
        // 敵弾 → プレイヤー
        const ep = this.player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
        const d = distPointSeg(ep, a, b);
        const rr = (p.o.radius ?? 0.3) + 0.55;
        if (d < rr && !this.player.dead) {
          this.enemyHitPlayer(p, b);
          consumed = true;
        } else {
          const env = this.envHit(a, b);
          if (env) {
            b.copy(a).lerp(b, env.t);
            if (p.o.enemyEffect === 'explode') this.enemyExplode(p, b);
            else this.fx.impact(b, env.normal, 'ground');
            consumed = true;
          }
        }
      }
      p.pos.copy(b);
      p.obj.position.copy(p.pos);
      if (p.obj.type !== 'Sprite' && p.vel.lengthSq() > 0.01) {
        p.obj.lookAt(p.pos.clone().sub(p.vel));
      }
      // 軌跡
      p.trailT -= dt;
      if (p.trailT <= 0 && (p.o.core || p.o.visual === 'seed')) {
        p.trailT = 0.025;
        const c = p.o.core ? CORES[p.o.core].color : 0xff9040;
        this.fx.spawn('sparkle', p.pos, { life: 0.25, size: p.o.visual === 'seed' ? 0.5 : 0.25, size1: 0.02, color: c });
      }
      if (consumed) {
        p.dead = true;
      }
    }
  }

  private remove(i: number) {
    const p = this.projs[i];
    this.scene.remove(p.obj);
    this.projs.splice(i, 1);
  }

  clear() {
    for (let i = this.projs.length - 1; i >= 0; i--) this.remove(i);
  }

  private steer(p: Projectile, dt: number) {
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    const dir = p.vel.clone().normalize();
    for (const t of this.targets) {
      if (!t.alive || p.hit.has(t)) continue;
      for (const hb of t.hitboxes) {
        if (!hb.active || hb.def.kind !== 'weak') continue;
        const to = hb.pos.clone().sub(p.pos);
        const d = to.length();
        if (d > 30) continue;
        const cos = to.normalize().dot(dir);
        if (cos < 0.4) continue;
        const score = d * (1.5 - cos);
        if (score < bestScore) {
          bestScore = score;
          best = hb.pos;
        }
      }
    }
    if (best) {
      const speed = p.vel.length();
      const want = best.clone().sub(p.pos).normalize().multiplyScalar(speed);
      p.vel.lerp(want, Math.min(1, dt * 7)).setLength(speed);
    }
  }

  private raycastTargets(a: THREE.Vector3, b: THREE.Vector3, p: Projectile) {
    let best: { t: number; target: Target; hb: Hitbox } | null = null;
    const seg = b.clone().sub(a);
    const segLen = seg.length();
    for (const t of this.targets) {
      if (!t.alive || p.hit.has(t)) continue;
      if (distPointSeg(t.center, a, b) > t.boundR + 0.5) continue;
      // 弱点を優先するため、弱点の当たり判定を少し大きく評価
      for (const hb of t.hitboxes) {
        if (!hb.active) continue;
        const r = hb.r * (p.o.visual === 'pellet' ? 1.1 : 1.0);
        const tt = segSphere(a, seg, segLen, hb.pos, r);
        if (tt === null) continue;
        const bias = hb.def.kind === 'weak' ? -0.02 : hb.def.kind === 'part' ? -0.01 : 0;
        if (!best || tt + bias < best.t) best = { t: Math.max(0, tt), target: t, hb };
      }
    }
    return best;
  }

  private envHit(a: THREE.Vector3, b: THREE.Vector3): { t: number; normal: THREE.Vector3 } | null {
    let best: { t: number; normal: THREE.Vector3 } | null = null;
    const hb = this.world.heightAt(b.x, b.z);
    if (b.y <= hb) {
      const ha = this.world.heightAt(a.x, a.z);
      const da = a.y - ha;
      const db = b.y - hb;
      const t = da > 0 ? da / (da - db) : 0;
      best = { t, normal: this.world.normalAt(b.x, b.z) };
    }
    const c = this.world.segmentHitsCollider(a, b);
    if (c && (!best || c.t < best.t)) best = c;
    return best;
  }

  private onTargetHit(p: Projectile, t: Target, hb: Hitbox, point: THREE.Vector3): boolean {
    const core = p.o.core;
    const dir = p.vel.clone().normalize();
    p.hit.add(t);
    const info: HitInfo = {
      dmg: p.o.dmg,
      kind: hb.def.kind,
      part: hb.def.part,
      core,
      partMul: p.o.partMul ?? 1,
      weakMul: p.o.weakMul ?? 2,
      point,
      dir,
      weapon: p.o.weapon,
    };
    const res = t.receiveHit(info);
    this.events.onPlayerHit(res, info, t);
    const fxKind = res.kind === 'weak' ? 'weak' : res.kind === 'armor' || res.kind === 'part' ? 'armor' : 'flesh';
    this.fx.impact(point, dir.clone().negate(), fxKind, core ? CORES[core].color : undefined);
    if (core === 'blast') {
      this.explode(point, 3.4, p.o.dmg * 0.8, p, t);
      return true;
    }
    if (core === 'blood' && res.dealt > 0) this.player.heal(res.dealt * 0.2);
    if (core === 'fang' && p.pierce > 0) {
      p.pierce--;
      p.pos.copy(point).addScaledVector(dir, 0.2);
      return false;
    }
    if (core === 'shell' && p.bounce > 0) {
      // 近くの別の敵へ跳弾
      let best: THREE.Vector3 | null = null;
      let bd = 16;
      for (const o of this.targets) {
        if (!o.alive || p.hit.has(o)) continue;
        for (const h of o.hitboxes) {
          if (!h.active || h.def.kind !== 'weak') continue;
          const d = h.pos.distanceTo(point);
          if (d < bd) {
            bd = d;
            best = h.pos;
          }
        }
      }
      if (best) {
        p.bounce--;
        p.pos.copy(point);
        p.vel.copy(best.clone().sub(point).normalize().multiplyScalar(p.vel.length()));
        audio.play('bounce', { vol: 0.35, pos: point, rate: 1.6 });
        return false;
      }
    }
    if (p.o.visual === 'arrow') audio.play('arrow_hit', { vol: 0.6, pos: point });
    return true;
  }

  private onEnvHit(p: Projectile, point: THREE.Vector3, normal: THREE.Vector3): boolean {
    if (p.o.core === 'blast') {
      this.explode(point, 3.4, p.o.dmg * 0.8, p, null);
      return true;
    }
    if (p.o.core === 'shell' && p.bounce > 0) {
      p.bounce--;
      p.vel.reflect(normal).multiplyScalar(0.85);
      p.pos.copy(point).addScaledVector(normal, 0.05);
      this.fx.spawn('star', point, { life: 0.12, size: 0.5, size1: 0.1, color: CORES.shell.color });
      audio.play('bounce', { vol: 0.3, pos: point, rate: 1.8 });
      return false;
    }
    this.fx.impact(point, normal, 'ground');
    return true;
  }

  /** プレイヤー側の爆発（爆炎弾） */
  explode(point: THREE.Vector3, radius: number, dmg: number, p: Projectile | null, direct: Target | null) {
    this.fx.explosion(point, radius, 0xff8a30);
    audio.play('explosion_small', { vol: 0.8, pos: point });
    audio.play('fire_burst', { vol: 0.5, pos: point });
    for (const t of this.targets) {
      if (!t.alive) continue;
      // 範囲内で一番近い当たり判定へ
      let best: Hitbox | null = null;
      let bd = Infinity;
      for (const hb of t.hitboxes) {
        if (!hb.active) continue;
        const d = hb.pos.distanceTo(point) - hb.r;
        if (d < bd) {
          bd = d;
          best = hb;
        }
      }
      if (!best || bd > radius) continue;
      const fall = 1 - Math.max(0, bd) / radius;
      const info: HitInfo = {
        dmg: dmg * (0.4 + 0.6 * fall) * (t === direct ? 0.6 : 1),
        kind: best.def.kind === 'weak' ? 'body' : best.def.kind,
        part: best.def.part,
        core: 'blast',
        partMul: (p?.o.partMul ?? 1) * 2.2,
        weakMul: 1,
        point: best.pos.clone(),
        dir: best.pos.clone().sub(point).normalize(),
        weapon: p?.o.weapon,
        splash: true,
      };
      const res = t.receiveHit(info);
      this.events.onPlayerHit(res, info, t);
    }
    const pd = this.player.pos.distanceTo(point);
    if (pd < 1.2) this.player.shake = Math.min(1.5, this.player.shake + 0.4);
  }

  private enemyHitPlayer(p: Projectile, at: THREE.Vector3) {
    if (p.o.enemyEffect === 'explode') {
      this.enemyExplode(p, at);
      return;
    }
    const ok = this.player.damage(p.o.dmg, p.pos.clone().sub(p.vel));
    if (ok) {
      if (p.o.enemyEffect === 'slow') this.player.slow = Math.max(this.player.slow, 3);
      if (p.o.enemyEffect === 'poison') this.player.poison = Math.max(this.player.poison, 4);
    }
  }

  private enemyExplode(p: Projectile, at: THREE.Vector3) {
    this.fx.explosion(at, 3, 0xff7020);
    audio.play('explosion_small', { vol: 0.7, pos: at });
    const d = this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)).distanceTo(at);
    if (d < 3.2) this.player.damage(p.o.dmg * (1 - d / 4.5), at);
  }
}

export function segSphere(a: THREE.Vector3, seg: THREE.Vector3, segLen: number, c: THREE.Vector3, r: number): number | null {
  if (segLen < 1e-6) return null;
  const d = seg.clone().divideScalar(segLen);
  const m = a.clone().sub(c);
  const b = m.dot(d);
  const cc = m.lengthSq() - r * r;
  if (cc > 0 && b > 0) return null;
  const disc = b * b - cc;
  if (disc < 0) return null;
  let t = -b - Math.sqrt(disc);
  if (t < 0) t = 0;
  if (t > segLen) return null;
  return t / segLen;
}

export function distPointSeg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-8, ab.lengthSq()), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}
