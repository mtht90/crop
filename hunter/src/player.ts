import * as THREE from 'three';
import { input } from './input';
import type { World } from './world';
import { audio } from './audio';
import { save } from './save';

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  eye = 1.65;
  radius = 0.45;
  hp = 150;
  maxHp = 150;
  stamina = 100;
  maxStamina = 100;
  onGround = true;
  dodgeT = 0;
  dodgeCd = 0;
  dodgeDir = new THREE.Vector3();
  iframes = 0;
  sprinting = false;
  moving = false;
  poison = 0; // 残り秒
  slow = 0;
  dead = false;
  hurtFlash = 0;
  shake = 0;
  stepT = 0;
  recoil = 0;
  adsAmount = 0;
  knock = new THREE.Vector3();
  camera: THREE.PerspectiveCamera;
  world: World;
  regenDelay = 0;
  onHurt?: (dmg: number, dir: THREE.Vector3 | null) => void;

  constructor(camera: THREE.PerspectiveCamera, world: World) {
    this.camera = camera;
    this.world = world;
  }

  spawn(p: THREE.Vector3, yaw = 0) {
    this.pos.copy(p);
    this.pos.y = this.world.heightAt(p.x, p.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.dead = false;
    this.poison = this.slow = 0;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  eyePos(out = new THREE.Vector3()) {
    return out.copy(this.pos).add(new THREE.Vector3(0, this.eye, 0));
  }

  update(dt: number, ads: boolean) {
    if (this.dead) return;
    const sens = 0.0022 * save.sensitivity * (ads ? 0.6 : 1);
    this.yaw -= input.mouseDX * sens;
    this.pitch -= input.mouseDY * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);

    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3();
    if (input.down('KeyW')) wish.add(f);
    if (input.down('KeyS')) wish.sub(f);
    if (input.down('KeyD')) wish.add(r);
    if (input.down('KeyA')) wish.sub(r);
    this.moving = wish.lengthSq() > 0;
    if (this.moving) wish.normalize();

    this.sprinting = this.moving && input.down('ShiftLeft') && !ads && this.stamina > 1 && input.down('KeyW');
    let speed = this.sprinting ? 8.2 : ads ? 3.2 : 5.4;
    if (this.slow > 0) speed *= 0.6;

    // 回避ステップ（無敵時間あり）
    this.dodgeCd -= dt;
    if (input.hit('KeyC') && this.dodgeCd <= 0 && this.stamina >= 22 && this.onGround) {
      this.dodgeT = 0.28;
      this.iframes = 0.32;
      this.dodgeCd = 0.55;
      this.stamina -= 22;
      this.dodgeDir.copy(this.moving ? wish : f.clone().negate());
      audio.play('dodge', { vol: 0.45, rate: 1.4 });
      this.regenDelay = 0.8;
    }
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.vel.x = this.dodgeDir.x * 15;
      this.vel.z = this.dodgeDir.z * 15;
    } else {
      const accel = this.onGround ? 14 : 3;
      this.vel.x = THREE.MathUtils.damp(this.vel.x, wish.x * speed, accel, dt);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, wish.z * speed, accel, dt);
    }
    this.iframes -= dt;

    if (this.sprinting) {
      this.stamina -= 16 * dt;
      this.regenDelay = 0.6;
    } else {
      this.regenDelay -= dt;
      if (this.regenDelay <= 0) this.stamina = Math.min(this.maxStamina, this.stamina + 30 * dt);
    }

    if (input.hit('Space') && this.onGround && this.stamina > 8) {
      this.vel.y = 6.2;
      this.onGround = false;
      this.stamina -= 8;
    }
    this.vel.y -= 18 * dt;
    // ノックバック
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-6 * dt));

    this.pos.addScaledVector(this.vel, dt);
    const gh = this.world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) {
      if (!this.onGround && this.vel.y < -8) audio.play('step2', { vol: 0.6 });
      this.pos.y = gh;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > gh + 0.25) {
      this.onGround = false;
    } else if (this.onGround) {
      this.pos.y = gh;
    }
    this.world.constrain(this.pos, this.radius);

    // 足音
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) {
        this.stepT = 2.3;
        audio.play(Math.random() < 0.5 ? 'step1' : 'step2', { vol: 0.25 });
      }
    }

    // 状態異常
    if (this.poison > 0) {
      this.poison -= dt;
      this.damage(4 * dt, null, true);
    }
    if (this.slow > 0) this.slow -= dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 12, dt);

    // カメラ
    const ep = this.eyePos();
    const bob = this.onGround ? Math.sin(performance.now() / 1000 * (this.sprinting ? 14 : 9)) * Math.min(1, hs / 5) * 0.035 : 0;
    this.camera.position.copy(ep).add(new THREE.Vector3(0, bob, 0));
    const sx = (Math.random() - 0.5) * this.shake * 0.08;
    const sy = (Math.random() - 0.5) * this.shake * 0.08;
    this.camera.rotation.set(this.pitch + this.recoil * 0.05 + sy, this.yaw + sx, 0, 'YXZ');
    const fov = THREE.MathUtils.lerp(this.sprinting ? 82 : 75, 52, this.adsAmount);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 10, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  damage(dmg: number, from: THREE.Vector3 | null, silent = false) {
    if (this.dead) return false;
    if (!silent && this.iframes > 0) return false;
    this.hp -= dmg;
    this.regenDelay = Math.max(this.regenDelay, 0.3);
    if (!silent) {
      this.hurtFlash = Math.min(1, this.hurtFlash + 0.35 + dmg / 40);
      this.shake = Math.min(1.5, this.shake + dmg / 18);
      if (from) {
        const d = this.pos.clone().sub(from).setY(0).normalize();
        this.knock.addScaledVector(d, Math.min(14, dmg * 0.5));
      }
      this.onHurt?.(dmg, from);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return true;
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }
}
