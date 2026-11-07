import * as THREE from 'three/webgpu';
import { UNIT, type BattleSimulation, type Entity, type Projectile, type SimEvent } from '@cardbattle/sim';
import { lerp, simToWorld } from './coords';
import type { Fx } from './fx';
import type { Stage } from './stage';
import type { HpBar, WorldUi } from './worldUi';

/** 陣営の色（マテリアルの色替え）：自分＝青、相手＝赤 */
export const TEAM_COLORS = { ally: new THREE.Color('#3f7ee8'), enemy: new THREE.Color('#e04848') };

interface EntityView {
  id: number;
  root: THREE.Group;
  body: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  baseColors: THREE.Color[];
  bar: HpBar;
  height: number;
  flash: number;
  knock: THREE.Vector3;
  punch: number;
  lastAttack: number;
  shadow?: THREE.Mesh;
}

interface ProjectileView {
  mesh: THREE.Mesh;
  arc: number;
}

/**
 * シミュレーションの状態を読み、毎フレーム描画に反映する（読み取り専用）。
 * ユニットの見た目は仮の図形。素材が届いたら Quaternius のモデルに差し替える。
 */
export class BattleView {
  readonly root = new THREE.Group();
  private readonly views = new Map<number, EntityView>();
  private readonly projectiles = new Map<number, ProjectileView>();
  private readonly pendingMarkers: { mesh: THREE.Mesh; executeTick: number; startTick: number }[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly geo = {
    capsule: new THREE.CapsuleGeometry(1, 1, 6, 16),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
    cone: new THREE.ConeGeometry(1, 1, 16),
    shadow: new THREE.CircleGeometry(1, 24),
    marker: new THREE.RingGeometry(0.7, 1, 40),
  };
  private readonly shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false });

  /** タワー破壊・クラウン獲得などの通知（HUD 側の演出用） */
  onTowerDestroyed?: (owner: number) => void;

  constructor(
    private readonly sim: BattleSimulation,
    private readonly localPlayer: number,
    private readonly stage: Stage,
    private readonly ui: WorldUi,
    private readonly fx: Fx,
  ) {}

  private team(owner: number): 'ally' | 'enemy' {
    return owner === this.localPlayer ? 'ally' : 'enemy';
  }

  // ------------------------------------------------------------ 見た目の生成

  private material(color: THREE.ColorRepresentation, list: THREE.MeshStandardMaterial[], roughness = 0.6): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
    list.push(m);
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private createView(e: Entity): EntityView {
    const team = this.team(e.owner);
    const teamColor = TEAM_COLORS[team];
    const mats: THREE.MeshStandardMaterial[] = [];
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const r = e.radius / UNIT;
    let height = 1.2;

    if (e.kind === 'tower') {
      const stone = this.material('#b7b1a6', mats, 0.9);
      const trim = this.material(teamColor, mats, 0.5);
      if (e.tower === 'king') {
        const base = this.mesh(this.geo.box, stone);
        base.scale.set(r * 2 * 0.95, 2.6, r * 2 * 0.95);
        base.position.y = 1.3;
        const top = this.mesh(this.geo.box, trim);
        top.scale.set(r * 2 * 0.7, 0.9, r * 2 * 0.7);
        top.position.y = 3.05;
        const crown = this.mesh(this.geo.cone, this.material('#f2c94c', mats, 0.3));
        crown.scale.set(0.6, 0.9, 0.6);
        crown.position.y = 3.95;
        body.add(base, top, crown);
        height = 4.8;
      } else {
        const base = this.mesh(this.geo.cyl, stone);
        base.scale.set(r * 0.85, 3.2, r * 0.85);
        base.position.y = 1.6;
        const top = this.mesh(this.geo.cyl, trim);
        top.scale.set(r * 0.95, 0.6, r * 0.95);
        top.position.y = 3.4;
        const roof = this.mesh(this.geo.cone, trim);
        roof.scale.set(r * 0.9, 1.2, r * 0.9);
        roof.position.y = 4.3;
        body.add(base, top, roof);
        height = 5.2;
      }
    } else if (e.kind === 'building') {
      const base = this.mesh(this.geo.box, this.material('#8a8178', mats, 0.9));
      base.scale.set(r * 1.8, 0.7, r * 1.8);
      base.position.y = 0.35;
      const barrel = this.mesh(this.geo.cyl, this.material('#3a3a44', mats, 0.4));
      barrel.scale.set(0.28, 1.3, 0.28);
      barrel.rotation.x = Math.PI / 2 - 0.35;
      barrel.position.set(0, 1.0, 0);
      const band = this.mesh(this.geo.cyl, this.material(teamColor, mats));
      band.scale.set(r * 0.7, 0.25, r * 0.7);
      band.position.y = 0.8;
      body.add(base, band, barrel);
      height = 1.8;
    } else {
      const card = e.card!;
      const tint = teamColor.clone();
      if (card.tags.has('swarm')) tint.lerp(new THREE.Color('#eeeeee'), 0.55);
      if (card.tags.has('tank') && card.buildingsOnly) tint.lerp(new THREE.Color('#8b7d6b'), 0.5);
      const mat = this.material(tint, mats);
      if (e.flying) {
        const torso = this.mesh(this.geo.sphere, mat);
        torso.scale.set(r * 1.1, r * 0.8, r * 1.4);
        const wingMat = this.material(tint.clone().multiplyScalar(0.75), mats);
        for (const s of [-1, 1]) {
          const wing = this.mesh(this.geo.box, wingMat);
          wing.scale.set(r * 1.8, 0.08, r * 0.9);
          wing.position.set(s * r * 1.3, 0.1, 0);
          wing.rotation.z = s * 0.25;
          torso.add(wing);
        }
        body.add(torso);
        body.position.y = 2.2;
        const shadow = new THREE.Mesh(this.geo.shadow, this.shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.04;
        shadow.scale.setScalar(r * 1.1);
        root.add(shadow);
        height = 3.1;
      } else {
        const h = Math.max(0.5, r * 2.2);
        const torso = this.mesh(this.geo.capsule, mat);
        torso.scale.set(r * 0.8, h * 0.45, r * 0.8);
        torso.position.y = h * 0.45 + r * 0.8;
        const head = this.mesh(this.geo.sphere, this.material('#f1d2b6', mats, 0.8));
        head.scale.setScalar(r * 0.55);
        head.position.y = torso.position.y + h * 0.45 + r * 0.6;
        // 向きが分かるように前方に小さな武器
        const weapon = this.mesh(this.geo.box, this.material(card.tags.has('ranged') ? '#7b5232' : '#c9ccd4', mats, 0.4));
        weapon.scale.set(0.08, 0.08, r * 1.4);
        weapon.position.set(r * 0.7, torso.position.y, r * 0.6);
        body.add(torso, head, weapon);
        height = head.position.y + r + 0.4;
      }
    }

    const bar = this.ui.createBar(team, e.kind === 'tower' ? 'tower' : 'unit');
    const view: EntityView = {
      id: e.id,
      root,
      body,
      materials: mats,
      baseColors: mats.map((m) => m.color.clone()),
      bar,
      height,
      flash: 0,
      knock: new THREE.Vector3(),
      punch: 0,
      lastAttack: e.lastAttackTick,
    };
    simToWorld(e.pos.x, e.pos.y, 0, root.position);
    this.root.add(root);
    this.views.set(e.id, view);
    return view;
  }

  private disposeView(v: EntityView): void {
    this.root.remove(v.root);
    for (const m of v.materials) m.dispose();
    v.bar.dispose();
    this.views.delete(v.id);
  }

  // ------------------------------------------------------------ イベント

  handleEvents(events: readonly SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'commandAccepted': {
          const mesh = new THREE.Mesh(
            this.geo.marker,
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
          this.fx.ring(this.tmp, '#ffffff', 0.3, 1.6, 0.35);
          this.fx.burst(this.tmp, '#cbb68f', 6, 2.5, 0.12, 0.4);
          break;
        }
        case 'damaged': {
          const v = this.views.get(ev.id);
          if (v) {
            v.flash = 1;
            // 攻撃元から離れる方向へ軽くノックバック（見た目だけ）
            const src = this.sim.getEntity(ev.sourceId);
            const e = this.sim.getEntity(ev.id);
            if (src && e && e.kind === 'troop') {
              const dx = e.pos.x - src.pos.x;
              const dy = e.pos.y - src.pos.y;
              const len = Math.hypot(dx, dy) || 1;
              v.knock.set((dx / len) * 0.18, 0, (-dy / len) * 0.18);
            }
            simToWorld(ev.pos.x, ev.pos.y, v.height * 0.8, this.tmp);
            this.ui.popup(this.tmp, String(ev.amount), this.team(ev.owner) === 'ally' ? 'hurt' : '');
          }
          break;
        }
        case 'entityDied': {
          const v = this.views.get(ev.id);
          simToWorld(ev.pos.x, ev.pos.y, 0.5, this.tmp);
          if (ev.kind === 'tower') {
            this.fx.burst(this.tmp.setY(2), '#b7b1a6', 40, 9, 0.38, 1.4, 16);
            this.fx.burst(this.tmp, TEAM_COLORS[this.team(ev.owner)], 16, 7, 0.3, 1.2, 16);
            this.fx.ring(this.tmp.setY(0), '#ffffff', 1, 6, 0.6);
            this.stage.addShake(1.1);
            if (v) {
              // 壊れたタワーは崩れた土台だけ残す
              v.body.scale.set(1, 0.18, 1);
              v.flash = 0;
              for (const m of v.materials) {
                m.emissive.setRGB(0, 0, 0);
                m.color.multiplyScalar(0.45);
              }
              v.bar.dispose();
            }
          } else {
            this.fx.burst(this.tmp, v ? v.baseColors[0] : '#999999', 10, 3.5, 0.16, 0.6);
            if (v) this.disposeView(v);
          }
          break;
        }
        case 'towerDestroyed':
          this.onTowerDestroyed?.(ev.owner);
          break;
        case 'spellImpact': {
          simToWorld(ev.pos.x, ev.pos.y, 0, this.tmp);
          const r = ev.radius / UNIT;
          const isFire = ev.card.spellTravelSpeed > 0;
          this.fx.ring(this.tmp, isFire ? '#ff8a3d' : '#9fd8ff', r * 0.3, r, 0.45, true);
          this.fx.ring(this.tmp, '#ffffff', r * 0.6, r * 1.05, 0.35);
          this.fx.burst(this.tmp, isFire ? '#ff6a2a' : '#c8ecff', 18, isFire ? 6 : 4, 0.18, 0.6);
          this.stage.addShake(isFire ? 0.45 : 0.25);
          break;
        }
        case 'projectileHit': {
          simToWorld(ev.pos.x, ev.pos.y, 0.8, this.tmp);
          this.fx.burst(this.tmp, '#ffe2a8', 4, 2, 0.08, 0.25, 6);
          break;
        }
        case 'kingActivated':
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
      const v = this.views.get(e.id) ?? this.createView(e);
      if (e.kind === 'tower' && e.hp <= 0) continue;

      simToWorld(lerp(e.prevPos.x, e.pos.x, alpha), lerp(e.prevPos.y, e.pos.y, alpha), 0, v.root.position);
      v.knock.multiplyScalar(Math.exp(-dt * 14));
      v.root.position.add(v.knock);

      // 向き：目標の方向
      const target = sim.getEntity(e.targetId);
      if (target && e.kind !== 'tower') {
        const dx = target.pos.x - e.pos.x;
        const dy = target.pos.y - e.pos.y;
        if (dx !== 0 || dy !== 0) {
          const want = Math.atan2(dx, -dy) + Math.PI;
          let diff = want - v.body.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          v.body.rotation.y += diff * Math.min(1, dt * 12);
        }
      }

      // 出撃待ちの間は小さく・半透明に、出撃時にポンと大きくなる
      const deploying = e.deployTimer > 0;
      const s = v.body.scale.x;
      const targetScale = deploying ? 0.75 : 1;
      if (e.kind !== 'tower') {
        const ns = s + (targetScale - s) * Math.min(1, dt * (deploying ? 6 : 14));
        v.body.scale.setScalar(ns);
      }

      // 攻撃した瞬間に少し前に踏み込む
      if (e.lastAttackTick !== v.lastAttack) {
        v.lastAttack = e.lastAttackTick;
        v.punch = 1;
      }
      v.punch = Math.max(0, v.punch - dt * 6);
      if (e.kind === 'troop') {
        const p = Math.sin(v.punch * Math.PI) * 0.25;
        v.body.position.z = -p * Math.cos(v.body.rotation.y);
        v.body.position.x = -p * Math.sin(v.body.rotation.y);
        if (e.flying) v.body.position.y = 2.2 + Math.sin(performance.now() / 300 + e.id) * 0.12;
      }

      // ヒット時に一瞬白く光る
      v.flash = Math.max(0, v.flash - dt * 9);
      for (let i = 0; i < v.materials.length; i++) {
        const m = v.materials[i];
        m.emissive.setRGB(v.flash, v.flash, v.flash);
        m.transparent = deploying;
        m.opacity = deploying ? 0.55 : 1;
      }

      // HPバー：タワーは常に、ユニットはダメージを受けたときだけ
      const damaged = e.hp < e.maxHp;
      const isKingIdle = e.tower === 'king' && !e.active;
      this.tmp.copy(v.root.position).setY(v.height + (e.flying ? 0.2 : 0));
      v.bar.el.classList.toggle('idle', isKingIdle);
      v.bar.update(this.tmp, e.hp, e.maxHp, e.kind === 'tower' || damaged);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) this.disposeView(v);

    this.updateProjectiles(alpha);
    this.updateMarkers();
  }

  private updateProjectiles(alpha: number): void {
    const seen = new Set<number>();
    for (const p of this.sim.projectiles) {
      seen.add(p.id);
      let v = this.projectiles.get(p.id);
      if (!v) v = this.createProjectile(p);
      const x = lerp(p.prevPos.x, p.pos.x, alpha);
      const y = lerp(p.prevPos.y, p.pos.y, alpha);
      // 発射地点から目標までの進み具合で、放物線の高さをつける
      const total = Math.hypot(p.targetPos.x - p.origin.x, p.targetPos.y - p.origin.y) || 1;
      const done = 1 - Math.min(1, Math.hypot(p.targetPos.x - x, p.targetPos.y - y) / total);
      const h = 1.2 + Math.sin(done * Math.PI) * v.arc;
      simToWorld(x, y, h, v.mesh.position);
    }
    for (const [id, v] of this.projectiles) {
      if (seen.has(id)) continue;
      this.root.remove(v.mesh);
      (v.mesh.material as THREE.Material).dispose();
      this.projectiles.delete(id);
    }
  }

  private createProjectile(p: Projectile): ProjectileView {
    let mesh: THREE.Mesh;
    let arc = 0.5;
    if (p.spell) {
      mesh = new THREE.Mesh(this.geo.sphere, new THREE.MeshStandardMaterial({ color: '#ff7a2a', emissive: '#ff5a10', emissiveIntensity: 2 }));
      mesh.scale.setScalar(0.55);
      arc = 6;
    } else if (p.splash > 0) {
      mesh = new THREE.Mesh(this.geo.sphere, new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff8a00', emissiveIntensity: 1.5 }));
      mesh.scale.setScalar(0.3);
      arc = 0.6;
    } else {
      mesh = new THREE.Mesh(this.geo.sphere, new THREE.MeshStandardMaterial({ color: '#fff4cc', emissive: '#ffe08a', emissiveIntensity: 1 }));
      mesh.scale.setScalar(p.fromTower ? 0.18 : 0.13);
      arc = p.fromTower ? 1.2 : 0.6;
    }
    mesh.castShadow = true;
    this.root.add(mesh);
    const v = { mesh, arc };
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
    for (const v of this.projectiles.values()) this.root.remove(v.mesh);
    this.projectiles.clear();
    for (const m of this.pendingMarkers) this.root.remove(m.mesh);
    this.pendingMarkers.length = 0;
  }
}
