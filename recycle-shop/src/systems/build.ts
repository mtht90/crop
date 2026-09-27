import * as THREE from 'three';
import { audio } from '../core/audio';
import { events, toast } from '../core/events';
import { input } from '../core/input';
import { yen } from '../core/util';
import { fixtureDef } from '../data/fixtures';
import { FixtureView, buildFixtureVisual } from '../world/fixtureView';
import { rect } from '../world/layout';
import type { Game } from '../game/game';

/** 什器の購入配置・移動モード */
export class BuildMode {
  active = false;
  private defId = '';
  private rot = 0;
  private ghost: THREE.Group | null = null;
  private moving: FixtureView | null = null;
  private okMat = new THREE.MeshStandardMaterial({ color: '#58e08a', transparent: true, opacity: 0.45, emissive: '#1d6b3a', depthWrite: false });
  private ngMat = new THREE.MeshStandardMaterial({ color: '#ff5b5b', transparent: true, opacity: 0.45, emissive: '#6b1d1d', depthWrite: false });
  private valid = false;
  private pos = new THREE.Vector3();
  private banner: HTMLDivElement;

  constructor(private g: Game) {
    this.banner = document.createElement('div');
    this.banner.className = 'build-banner hidden';
    g.ui.root.appendChild(this.banner);
  }

  startNew(defId: string) {
    const def = fixtureDef(defId);
    if (!this.g.model.canAfford(def.price)) { toast('お金が足りません', 'bad'); return; }
    this.begin(defId, 0, null);
  }

  startMove(f: FixtureView) {
    if (f.state.locked) return;
    this.begin(f.def.id, f.state.rot, f);
    f.root.visible = false;
  }

  private begin(defId: string, rot: number, moving: FixtureView | null) {
    this.cancel();
    this.active = true;
    this.defId = defId;
    this.rot = rot;
    this.moving = moving;
    const { group } = buildFixtureVisual(fixtureDef(defId));
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = this.okMat; m.castShadow = false; m.raycast = () => {}; }
      if ((o as THREE.Light).isLight) o.visible = false;
    });
    this.ghost = group;
    this.g.engine.scene.add(group);
    const def = fixtureDef(defId);
    this.banner.innerHTML = `<b>${moving ? '移動' : '配置'}: ${def.name}</b>${moving ? '' : ` (${yen(def.price)})`} ・ <kbd>R</kbd> 回転 ・ <kbd>クリック</kbd> 決定 ・ <kbd>Esc</kbd> / <kbd>右クリック</kbd> キャンセル`;
    this.banner.classList.remove('hidden');
    this.g.interaction.reset();
  }

  cancel() {
    if (this.ghost) this.g.engine.scene.remove(this.ghost);
    this.ghost = null;
    if (this.moving) this.moving.root.visible = true;
    this.moving = null;
    this.active = false;
    this.banner.classList.add('hidden');
  }

  private footprint() {
    const def = fixtureDef(this.defId);
    const w = this.rot % 2 ? def.d : def.w;
    const d = this.rot % 2 ? def.w : def.d;
    return rect(this.pos.x - w / 2, this.pos.z - d / 2, this.pos.x + w / 2, this.pos.z + d / 2);
  }

  update() {
    if (!this.active || !this.ghost) return;
    if (input.rawPressed('Escape') || input.wasPressed('Mouse2')) { this.cancel(); return; }
    if (input.wasPressed('KeyR')) { this.rot = (this.rot + 1) % 4; audio.play('rotate', { volume: 0.5 }); }
    // 視線と床の交点
    const cam = this.g.engine.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const t = dir.y < -0.05 ? -cam.position.y / dir.y : 4;
    const hit = cam.position.clone().addScaledVector(dir, Math.min(t, 7));
    const snap = 0.25;
    this.pos.set(Math.round(hit.x / snap) * snap, 0, Math.round(hit.z / snap) * snap);
    this.ghost.position.copy(this.pos);
    this.ghost.rotation.y = this.rot * (Math.PI / 2);
    const fp = this.footprint();
    const p = this.g.player.pos;
    const onPlayer = p.x > fp.x0 - 0.3 && p.x < fp.x1 + 0.3 && p.z > fp.z0 - 0.3 && p.z < fp.z1 + 0.3;
    this.valid = this.g.world.canPlaceFixture(fp, this.moving ?? undefined) && !onPlayer;
    const mat = this.valid ? this.okMat : this.ngMat;
    this.ghost.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = mat; });
    if (input.wasPressed('Mouse0')) {
      if (!this.valid) { audio.errorBuzz(); toast(onPlayer ? '自分の立っている場所には置けません' : 'ここには置けません (売り場の空いている場所へ)', 'warn'); return; }
      this.confirm();
    }
  }

  private confirm() {
    const g = this.g;
    const def = fixtureDef(this.defId);
    if (this.moving) {
      const f = this.moving;
      f.state.x = this.pos.x;
      f.state.z = this.pos.z;
      f.state.rot = this.rot;
      f.root.position.set(this.pos.x, 0, this.pos.z);
      f.root.rotation.y = this.rot * (Math.PI / 2);
      f.root.visible = true;
      this.moving = null;
    } else {
      if (!g.model.canAfford(def.price)) { toast('お金が足りません', 'bad'); this.cancel(); return; }
      g.model.addMoney(-def.price, `什器購入: ${def.name}`);
      g.model.state.today.expenses += def.price;
      const fs = g.model.addFixture({ defId: this.defId, x: this.pos.x, z: this.pos.z, rot: this.rot });
      g.world.spawnFixture(fs);
      events.emit('fixture:bought', { id: this.defId });
    }
    audio.play('place', { volume: 0.9 });
    g.world.rebuildNav();
    g.world.invalidateInteractables();
    this.cancel();
  }
}
