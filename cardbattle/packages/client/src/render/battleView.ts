import * as THREE from 'three/webgpu';
import { UNIT, type BattleSimulation, type Entity, type Projectile, type SimEvent } from '@cardbattle/sim';
import { assets } from '../assets/assets';
import { audio } from '../audio';
import { lerp, simToWorld } from './coords';
import type { Fx } from './fx';
import { createCannon, createTower, createUnitModel, TEAM_COLORS, type ModelInstance, type Team } from './models';
import type { Stage } from './stage';
import type { HpBar, WorldUi } from './worldUi';

export { TEAM_COLORS };

interface EntityView {
  id: number;
  root: THREE.Group;
  body: THREE.Group;
  model: ModelInstance | null;
  materials: THREE.MeshStandardMaterial[];
  bar: HpBar | null;
  height: number;
  flash: number;
  knock: THREE.Vector3;
  punch: number;
  lastAttack: number;
  moving: boolean;
  anim: 'idle' | 'move' | 'attack' | 'death' | '';
  team: Team;
  flying: boolean;
}

interface Dying {
  view: EntityView;
  time: number;
}

interface ProjectileView {
  obj: THREE.Object3D;
  arc: number;
  trail: string | null;
  color: THREE.Color;
  trailTimer: number;
}

/**
 * シミュレーションの状態を読み、毎フレーム描画に反映する（読み取り専用）。
 * 素材があれば Quaternius のモデル・アニメーション、無ければ仮の図形で表示する。
 */
export class BattleView {
  readonly root = new THREE.Group();
  private readonly views = new Map<number, EntityView>();
  private readonly dying: Dying[] = [];
  private readonly projectiles = new Map<number, ProjectileView>();
  private readonly pendingMarkers: { mesh: THREE.Mesh; executeTick: number; startTick: number }[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly geo = {
    capsule: new THREE.CapsuleGeometry(1, 1, 6, 16),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
    cone: new THREE.ConeGeometry(1, 1, 16),
    disc: new THREE.CircleGeometry(1, 32),
    ring: new THREE.RingGeometry(0.78, 1, 40),
    arrow: new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6),
  };
  private readonly shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false });
  private readonly teamRingMats: Record<Team, THREE.MeshBasicMaterial> = {
    ally: new THREE.MeshBasicMaterial({ color: TEAM_COLORS.ally, transparent: true, opacity: 0.75, depthWrite: false }),
    enemy: new THREE.MeshBasicMaterial({ color: TEAM_COLORS.enemy, transparent: true, opacity: 0.75, depthWrite: false }),
  };

  constructor(
    private readonly sim: BattleSimulation,
    private readonly localPlayer: number,
    private readonly stage: Stage,
    private readonly ui: WorldUi,
    private readonly fx: Fx,
  ) {}

  private team(owner: number): Team {
    return owner === this.localPlayer ? 'ally' : 'enemy';
  }

  // ------------------------------------------------------------ 見た目の生成

  private createView(e: Entity): EntityView {
    const team = this.team(e.owner);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const r = e.radius / UNIT;
    let model: ModelInstance | null = null;

    if (e.kind === 'tower') model = createTower(e.tower === 'king' ? 'king' : 'princess', team, r);
    else if (e.kind === 'building') model = createCannon(team, r);
    else if (e.card) model = createUnitModel(e.card.id, team);

    let materials: THREE.MeshStandardMaterial[];
    let height: number;
    if (model) {
      body.add(model.root);
      materials = model.materials;
      height = model.height;
    } else {
      ({ materials, height } = this.placeholder(e, team, body));
    }

    if (e.kind !== 'tower') {
      // 足元の陣営リング（遠目でも敵味方が分かるように）
      const ring = new THREE.Mesh(this.geo.ring, this.teamRingMats[team]);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      ring.scale.setScalar(Math.max(0.35, r * 1.05));
      ring.renderOrder = 1;
      root.add(ring);
    }
    if (e.flying) {
      body.position.y = 2;
      const shadow = new THREE.Mesh(this.geo.disc, this.shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.03;
      shadow.scale.setScalar(r * 1.2);
      root.add(shadow);
      height += 2;
    }
    // 自陣のユニットは相手側（奥）を向いて出てくる
    body.rotation.y = e.owner === this.localPlayer ? Math.PI : 0;

    const view: EntityView = {
      id: e.id,
      root,
      body,
      model,
      materials,
      bar: this.ui.createBar(team, e.kind === 'tower' ? 'tower' : 'unit'),
      height,
      flash: 0,
      knock: new THREE.Vector3(),
      punch: 0,
      lastAttack: e.lastAttackTick,
      moving: false,
      anim: 'idle',
      team,
      flying: e.flying,
    };
    simToWorld(e.pos.x, e.pos.y, 0, root.position);
    this.root.add(root);
    this.views.set(e.id, view);
    return view;
  }

  /** 素材がないときの仮の図形 */
  private placeholder(e: Entity, team: Team, body: THREE.Group): { materials: THREE.MeshStandardMaterial[]; height: number } {
    const mats: THREE.MeshStandardMaterial[] = [];
    const mat = (c: THREE.ColorRepresentation) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
      mats.push(m);
      return m;
    };
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = x.receiveShadow = true;
      return x;
    };
    const r = e.radius / UNIT;
    if (e.kind === 'tower') {
      const base = mesh(this.geo.cyl, mat('#b7b1a6'));
      base.scale.set(r * 0.85, 3.2, r * 0.85);
      base.position.y = 1.6;
      const roof = mesh(this.geo.cone, mat(TEAM_COLORS[team]));
      roof.scale.set(r, 1.4, r);
      roof.position.y = 3.9;
      body.add(base, roof);
      return { materials: mats, height: 5 };
    }
    if (e.kind === 'building') {
      const base = mesh(this.geo.box, mat('#8a8178'));
      base.scale.set(r * 1.8, 0.7, r * 1.8);
      base.position.y = 0.35;
      body.add(base);
      return { materials: mats, height: 1.6 };
    }
    const h = Math.max(0.5, r * 2.2);
    const torso = mesh(this.geo.capsule, mat(TEAM_COLORS[team]));
    torso.scale.set(r * 0.8, h * 0.45, r * 0.8);
    torso.position.y = h * 0.45 + r * 0.8;
    body.add(torso);
    return { materials: mats, height: h + r * 2 };
  }

  private disposeView(v: EntityView): void {
    this.root.remove(v.root);
    for (const m of v.materials) m.dispose();
    v.bar?.dispose();
    v.model?.mixer?.stopAllAction();
    this.views.delete(v.id);
  }

  private playAnim(v: EntityView, name: 'idle' | 'move' | 'attack' | 'death', timeScale = 1): void {
    const actions = v.model?.actions;
    if (!actions) return;
    const next = actions[name];
    if (!next) return;
    if (v.anim === name && name !== 'attack') {
      next.timeScale = timeScale;
      return;
    }
    const prev = v.anim ? actions[v.anim] : undefined;
    next.reset();
    next.timeScale = timeScale;
    next.play();
    if (prev && prev !== next) next.crossFadeFrom(prev, name === 'attack' ? 0.08 : 0.2, false);
    v.anim = name;
  }

  // ------------------------------------------------------------ イベント

  handleEvents(events: readonly SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'commandAccepted': {
          const mesh = new THREE.Mesh(
            this.geo.ring,
            new THREE.MeshBasicMaterial({ color: TEAM_COLORS[this.team(ev.owner)], transparent: true, opacity: 0.9, depthWrite: false }),
          );
          mesh.rotation.x = -Math.PI / 2;
          simToWorld(ev.pos.x, ev.pos.y, 0.07, mesh.position);
          const r = ev.card.type === 'spell' ? ev.card.spellRadius / UNIT : Math.max(0.6, ev.card.radius / UNIT + (ev.card.count > 1 ? 0.8 : 0));
          mesh.scale.setScalar(r);
          this.root.add(mesh);
          this.pendingMarkers.push({ mesh, executeTick: ev.executeTick, startTick: ev.tick });
          break;
        }
        case 'entitySpawned': {
          const v = this.views.get(ev.id) ?? this.createView(this.sim.getEntity(ev.id)!);
          v.body.scale.setScalar(0.01);
          simToWorld(ev.pos.x, ev.pos.y, 0, this.tmp);
          // 着地のエフェクトと効果音
          this.fx.ring(this.tmp, '#fff4d6', 0.3, 1.8, 0.4);
          this.fx.burst(this.tmp.setY(0.2), '#d9c49a', { texture: 'dirt', count: 3, speed: 2.5, size: 0.9, life: 0.5, additive: false, up: 0.4 });
          audio.play('deploy', 0.7, 90);
          break;
        }
        case 'attack': {
          const src = this.sim.getEntity(ev.id);
          if (src?.kind === 'tower') audio.play('tower_shot', 0.25, 120);
          break;
        }
        case 'damaged': {
          const v = this.views.get(ev.id);
          if (!v) break;
          v.flash = 1;
          const src = this.sim.getEntity(ev.sourceId);
          const e = this.sim.getEntity(ev.id);
          if (src && e && e.kind === 'troop') {
            // 攻撃元から離れる方向へ軽くノックバック（見た目だけ）
            const dx = e.pos.x - src.pos.x;
            const dy = e.pos.y - src.pos.y;
            const len = Math.hypot(dx, dy) || 1;
            v.knock.set((dx / len) * 0.2, 0, (-dy / len) * 0.2);
          }
          simToWorld(ev.pos.x, ev.pos.y, v.height * 0.6, this.tmp);
          this.fx.burst(this.tmp, '#fff1c4', { texture: 'star', count: 2, speed: 2, size: 0.55, life: 0.25, gravity: 0 });
          simToWorld(ev.pos.x, ev.pos.y, v.height + 0.3, this.tmp);
          this.ui.popup(this.tmp, String(ev.amount), this.team(ev.owner) === 'ally' ? 'hurt' : '');
          if (src && src.kind === 'troop' && src.projectileSpeed === 0) audio.play(`hit_${1 + Math.floor(Math.random() * 3)}`, 0.5, 50);
          break;
        }
        case 'entityDied': {
          const v = this.views.get(ev.id);
          simToWorld(ev.pos.x, ev.pos.y, 0.6, this.tmp);
          if (ev.kind === 'tower') {
            this.fx.burst(this.tmp.clone().setY(2), '#c9bfae', { texture: 'smoke', count: 14, speed: 4, size: 2.4, endSize: 1.6, life: 1.6, gravity: -0.5, additive: false });
            this.fx.burst(this.tmp, '#ffcf7a', { texture: 'spark', count: 16, speed: 9, size: 1, life: 0.9 });
            this.fx.burst(this.tmp, '#8d8172', { texture: 'dirt', count: 12, speed: 7, size: 1.2, life: 1.2, gravity: 14, additive: false });
            this.fx.ring(this.tmp.clone().setY(0), '#ffffff', 1, 7, 0.7);
            this.stage.addShake(1.2);
            audio.play('tower_break', 1, 0);
            audio.play('tower_break2', 0.8, 0);
            if (v) {
              // 壊れたタワーは崩れた土台だけ残す
              v.body.scale.set(1, 0.22, 1);
              v.flash = 0;
              for (const m of v.materials) {
                m.emissive.setRGB(0, 0, 0);
                m.color.multiplyScalar(0.45);
              }
              v.bar?.dispose();
              v.bar = null;
            }
          } else {
            this.fx.burst(this.tmp, '#ffffff', { texture: 'smoke', count: 4, speed: 1.5, size: 1.1, life: 0.7, gravity: -1, additive: false, alpha: 0.8 });
            audio.play('death', 0.45, 60);
            if (v) {
              v.bar?.dispose();
              v.bar = null;
              this.views.delete(v.id);
              if (v.model?.actions?.death) {
                this.playAnim(v, 'death', 1.4);
                this.dying.push({ view: v, time: 0 });
              } else this.disposeView(v);
            }
          }
          break;
        }
        case 'spellImpact': {
          simToWorld(ev.pos.x, ev.pos.y, 0, this.tmp);
          const r = ev.radius / UNIT;
          const at = this.tmp.clone();
          if (ev.card.spellTravelSpeed > 0) {
            this.fx.ring(at, '#ff8a3d', r * 0.3, r, 0.45, true, 0.6);
            this.fx.flash(at.clone().setY(0.8), 'light', '#ffb060', r * 2.6, 0.3);
            this.fx.burst(at.clone().setY(0.5), '#ff7a2a', { texture: 'fire', count: 18, speed: 6, size: 1.4, life: 0.7, gravity: -1 });
            this.fx.burst(at.clone().setY(0.5), '#5a4a40', { texture: 'smoke', count: 8, speed: 3, size: 2, life: 1.2, gravity: -1.5, additive: false });
            this.stage.addShake(0.5);
            audio.play('fireball', 0.9, 0);
          } else {
            this.fx.ring(at, '#9fd8ff', r * 0.4, r, 0.35, true, 0.5);
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI * 2;
              this.fx.flash(at.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.4, 2.2, Math.sin(a) * r * 0.4)), 'lightning', '#cfefff', 4.5, 0.22, 1);
            }
            this.fx.flash(at.clone().setY(0.6), 'light', '#bfe8ff', r * 2.2, 0.25);
            this.fx.burst(at.clone().setY(0.4), '#d6f2ff', { texture: 'spark', count: 12, speed: 5, size: 0.9, life: 0.4 });
            this.stage.addShake(0.3);
            audio.play('lightning', 0.9, 0);
          }
          break;
        }
        case 'projectileHit': {
          simToWorld(ev.pos.x, ev.pos.y, 0.9, this.tmp);
          this.fx.burst(this.tmp, '#ffe2a8', { texture: 'star', count: 2, speed: 1.5, size: 0.4, life: 0.2, gravity: 0 });
          audio.play('arrow', 0.35, 60);
          break;
        }
        case 'crownScored':
          audio.play('crown', 0.9, 0);
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------ 毎フレーム

  update(dt: number, alpha: number): void {
    const sim = this.sim;
    const seen = new Set<number>();
    for (const e of sim.entities) {
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        if (e.hp <= 0) continue;
        v = this.createView(e);
      }
      if (e.kind === 'tower' && e.hp <= 0) continue;

      simToWorld(lerp(e.prevPos.x, e.pos.x, alpha), lerp(e.prevPos.y, e.pos.y, alpha), 0, v.root.position);
      v.knock.multiplyScalar(Math.exp(-dt * 14));
      v.root.position.add(v.knock);
      v.moving = e.pos.x !== e.prevPos.x || e.pos.y !== e.prevPos.y;

      // 向き：攻撃中は目標、移動中は進行方向
      if (e.kind === 'troop') {
        const target = sim.getEntity(e.targetId);
        let dx = 0;
        let dy = 0;
        if (target && (e.attacking || !v.moving)) {
          dx = target.pos.x - e.pos.x;
          dy = target.pos.y - e.pos.y;
        } else if (v.moving) {
          dx = e.pos.x - e.prevPos.x;
          dy = e.pos.y - e.prevPos.y;
        }
        if (dx !== 0 || dy !== 0) {
          const want = Math.atan2(dx, -dy);
          let diff = want - v.body.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          v.body.rotation.y += diff * Math.min(1, dt * 10);
        }
      }

      // 出撃待ちの間は少し小さく半透明に、出撃時にポンと大きくなる
      const deploying = e.deployTimer > 0;
      if (e.kind !== 'tower') {
        const s = v.body.scale.x;
        const targetScale = deploying ? 0.8 : 1;
        v.body.scale.setScalar(s + (targetScale - s) * Math.min(1, dt * (deploying ? 6 : 14)));
      }

      // アニメーション：攻撃した瞬間に攻撃モーション、それ以外は移動か待機
      if (e.lastAttackTick !== v.lastAttack) {
        v.lastAttack = e.lastAttackTick;
        v.punch = 1;
        const clip = v.model?.actions?.attack?.getClip();
        const hitSeconds = e.hitTicks / 20;
        const speed = clip ? Math.max(1, clip.duration / Math.max(0.3, hitSeconds * 0.9)) : 1;
        this.playAnim(v, 'attack', speed);
      } else if (v.anim !== 'attack' || !v.model?.actions?.attack?.isRunning()) {
        this.playAnim(v, v.moving && !deploying ? 'move' : 'idle', v.moving ? Math.max(0.6, e.speed / 50) : 1);
      }
      v.model?.mixer?.update(dt);

      v.punch = Math.max(0, v.punch - dt * 6);
      if (!v.model && e.kind === 'troop') {
        const p = Math.sin(v.punch * Math.PI) * 0.25;
        v.body.position.x = p * Math.sin(v.body.rotation.y);
        v.body.position.z = p * Math.cos(v.body.rotation.y);
      }
      if (v.flying) v.body.position.y = 2 + Math.sin(performance.now() / 320 + e.id) * 0.12;

      // ヒット時に一瞬白く光る
      v.flash = Math.max(0, v.flash - dt * 9);
      for (const m of v.materials) {
        m.emissive.setRGB(v.flash * 0.9, v.flash * 0.9, v.flash * 0.9);
        if (m.transparent !== deploying) {
          m.transparent = deploying;
          m.needsUpdate = true;
        }
        m.opacity = deploying ? 0.6 : 1;
      }

      // HPバー：タワーは常に、ユニットはダメージを受けたときだけ
      this.tmp.copy(v.root.position).setY(v.height + 0.35);
      v.bar?.el.classList.toggle('idle', e.tower === 'king' && !e.active);
      v.bar?.update(this.tmp, e.hp, e.maxHp, e.kind === 'tower' || e.hp < e.maxHp);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) this.disposeView(v);

    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.time += dt;
      d.view.model?.mixer?.update(dt);
      if (d.time > 1.1) d.view.root.position.y -= dt * 1.2; // 地面に沈んで消える
      if (d.time > 1.8) {
        this.root.remove(d.view.root);
        for (const m of d.view.materials) m.dispose();
        this.dying.splice(i, 1);
      }
    }

    this.updateProjectiles(dt, alpha);
    this.updateMarkers();
  }

  private updateProjectiles(dt: number, alpha: number): void {
    const seen = new Set<number>();
    for (const p of this.sim.projectiles) {
      seen.add(p.id);
      const v = this.projectiles.get(p.id) ?? this.createProjectile(p);
      const x = lerp(p.prevPos.x, p.pos.x, alpha);
      const y = lerp(p.prevPos.y, p.pos.y, alpha);
      const total = Math.hypot(p.targetPos.x - p.origin.x, p.targetPos.y - p.origin.y) || 1;
      const done = 1 - Math.min(1, Math.hypot(p.targetPos.x - x, p.targetPos.y - y) / total);
      const h = 1.2 + Math.sin(done * Math.PI) * v.arc;
      const prev = this.tmp2.copy(v.obj.position);
      simToWorld(x, y, h, v.obj.position);
      if (v.obj instanceof THREE.Mesh) {
        // 矢は進行方向を向ける
        const dir = this.tmp.subVectors(v.obj.position, prev);
        if (dir.lengthSq() > 1e-6) v.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      }
      if (v.trail) {
        v.trailTimer -= dt;
        if (v.trailTimer <= 0) {
          v.trailTimer = 0.03;
          this.fx.burst(v.obj.position, v.color, { texture: v.trail, count: 1, speed: 0.3, size: p.spell ? 1.3 : 0.6, life: 0.35, gravity: -1 });
        }
      }
    }
    for (const [id, v] of this.projectiles) {
      if (seen.has(id)) continue;
      this.root.remove(v.obj);
      this.projectiles.delete(id);
    }
  }

  private createProjectile(p: Projectile): ProjectileView {
    let obj: THREE.Object3D;
    let arc = 0.6;
    let trail: string | null = null;
    let color = new THREE.Color('#ffffff');
    const glow = (name: string, c: string, size: number) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: assets.texture(name) ?? null, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      s.scale.setScalar(size);
      return s;
    };
    if (p.spell) {
      obj = glow('fire', '#ff8a3d', 1.6);
      arc = 6;
      trail = 'flame';
      color = new THREE.Color('#ff6a20');
    } else if (p.splash > 0) {
      obj = glow('fire', '#ffb347', 0.9);
      trail = 'fire';
      color = new THREE.Color('#ff9a30');
    } else {
      obj = new THREE.Mesh(this.geo.arrow, new THREE.MeshStandardMaterial({ color: '#7b5232', emissive: '#3a2410' }));
      arc = p.fromTower ? 1.4 : 0.7;
    }
    this.root.add(obj);
    const v = { obj, arc, trail, color, trailTimer: 0 };
    this.projectiles.set(p.id, v);
    return v;
  }

  private updateMarkers(): void {
    for (let i = this.pendingMarkers.length - 1; i >= 0; i--) {
      const m = this.pendingMarkers[i];
      const span = Math.max(1, m.executeTick - m.startTick);
      const t = (this.sim.tick - m.startTick) / span;
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t * 0.5);
      m.mesh.rotation.z += 0.08;
      if (this.sim.tick >= m.executeTick) {
        this.root.remove(m.mesh);
        (m.mesh.material as THREE.Material).dispose();
        this.pendingMarkers.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const v of [...this.views.values()]) this.disposeView(v);
    for (const d of this.dying) this.root.remove(d.view.root);
    this.dying.length = 0;
    for (const v of this.projectiles.values()) this.root.remove(v.obj);
    this.projectiles.clear();
    for (const m of this.pendingMarkers) this.root.remove(m.mesh);
    this.pendingMarkers.length = 0;
  }
}
