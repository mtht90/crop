import * as THREE from 'three';
import type { Engine } from '../core/engine';
import type { GameModel } from '../game/model';
import type { FixtureState, ItemState } from '../game/state';
import { ItemView } from '../entities/itemView';
import { FixtureView, type SlotRuntime } from './fixtureView';
import { ShopBuilding, type Collider } from './shop';
import { BUILD_ZONES_BASE, BUILD_ZONE_EXPANSION, RESERVED, SPOTS, inRect, rectsOverlap, type Rect } from './layout';
import type { FixtureKind } from '../data/fixtures';

/** 店内の什器・商品の配置を管理し、GameState と 3D 表示を同期する */
export class World {
  readonly building: ShopBuilding;
  readonly fixtures: FixtureView[] = [];
  readonly itemViews = new Map<string, ItemView>();
  private interactCache: THREE.Object3D[] | null = null;

  constructor(readonly engine: Engine, readonly model: GameModel) {
    this.building = new ShopBuilding(engine.scene, model.state.shopName);
  }

  get scene() { return this.engine.scene; }
  get nav() { return this.building.nav; }

  async build() {
    await this.building.build();
    const s = this.model.state;
    if (!s.fixtures.length) this.createDefaultLayout();
    for (const f of s.fixtures) this.spawnFixture(f);
    this.building.setExpanded(this.model.has('expand'));
    // 商品の配置を復元
    for (const it of s.items) {
      if (it.loc.type === 'fixture') {
        const slot = this.slot(it.loc.fixture, it.loc.slot);
        if (slot && !slot.item) this.attachItem(it, slot);
        else it.loc = { type: 'stock' };
      } else if (it.loc.type === 'bench') {
        const slot = this.benchSlot();
        if (slot && !slot.item) this.attachItem(it, slot);
        else it.loc = { type: 'stock' };
      }
    }
    this.rebuildNav();
  }

  private createDefaultLayout() {
    const add = (f: Omit<FixtureState, 'uid'>) => this.model.addFixture(f);
    const r = SPOTS.registerCounter;
    add({ defId: 'register', x: r.x, z: r.z, rot: r.rot, locked: true });
    const a = SPOTS.appraisalCounter;
    add({ defId: 'appraisal', x: a.x, z: a.z, rot: a.rot, locked: true });
    const w = SPOTS.workbench;
    add({ defId: 'workbench', x: w.x, z: w.z, rot: w.rot, locked: true });
    const st = SPOTS.stock;
    add({ defId: 'stock', x: st.x, z: st.z, rot: st.rot, locked: true });
    add({ defId: 'wall_shelf', x: -0.9, z: -5.5, rot: 0 });
    add({ defId: 'wall_shelf', x: 0.75, z: -5.5, rot: 0 });
    add({ defId: 'display_table', x: 0.6, z: -2.1, rot: 0 });
    add({ defId: 'floor_display', x: 5.7, z: -4.9, rot: 0 });
    add({ defId: 'plant_decor', x: -6.9, z: 5.4, rot: 0 });
  }

  spawnFixture(f: FixtureState): FixtureView {
    const v = new FixtureView(f);
    this.scene.add(v.root);
    this.fixtures.push(v);
    this.interactCache = null;
    return v;
  }

  removeFixture(v: FixtureView) {
    this.scene.remove(v.root);
    v.dispose();
    this.fixtures.splice(this.fixtures.indexOf(v), 1);
    this.model.state.fixtures = this.model.state.fixtures.filter((f) => f.uid !== v.state.uid);
    this.interactCache = null;
  }

  fixture(uid: string) { return this.fixtures.find((f) => f.state.uid === uid); }
  fixturesOf(kind: FixtureKind) { return this.fixtures.filter((f) => f.def.kind === kind); }
  first(kind: FixtureKind) { return this.fixtures.find((f) => f.def.kind === kind)!; }
  slot(fixtureUid: string, slotId: string) { return this.fixture(fixtureUid)?.slots.get(slotId); }
  benchSlot() { return this.first('workbench')?.slots.get('bench'); }
  counterSlot() { return this.first('appraisal')?.slots.get('mat'); }

  // ───── 商品 ─────
  view(uid: string) { return this.itemViews.get(uid); }

  private ensureView(it: ItemState): ItemView {
    let v = this.itemViews.get(it.uid);
    if (!v) {
      v = new ItemView(it);
      this.itemViews.set(it.uid, v);
      this.interactCache = null;
    }
    return v;
  }

  /** 商品を枠に置く (状態も更新) */
  attachItem(it: ItemState, slot: SlotRuntime): ItemView {
    const v = this.ensureView(it);
    v.root.removeFromParent();
    v.root.position.set(0, 0, 0);
    v.root.rotation.set(0, 0, 0);
    v.root.scale.setScalar(1);
    slot.anchor.add(v.root);
    slot.item = v;
    const kind = slot.fixture.def.kind;
    if (kind === 'workbench') it.loc = { type: 'bench' };
    else if (kind === 'appraisal') it.loc = { type: 'counter' };
    else it.loc = { type: 'fixture', fixture: slot.fixture.state.uid, slot: slot.def.id };
    v.refreshTag(kind === 'display');
    this.interactCache = null;
    return v;
  }

  /** 枠から外す (View は残し、呼び出し側で扱う) */
  detachItem(uid: string): ItemView | undefined {
    const v = this.itemViews.get(uid);
    if (!v) return;
    for (const f of this.fixtures) for (const s of f.slots.values()) if (s.item === v) s.item = null;
    v.root.removeFromParent();
    this.interactCache = null;
    return v;
  }

  /** View を破棄 (売れた・在庫に戻したなど) */
  destroyView(uid: string) {
    const v = this.detachItem(uid);
    if (v) { v.dispose(); this.itemViews.delete(uid); }
  }

  slotOf(uid: string): SlotRuntime | undefined {
    for (const f of this.fixtures) for (const s of f.slots.values()) if (s.item?.state.uid === uid) return s;
  }

  /** 陳列中 (値札付き) の商品枠一覧 */
  displayedSlots(): SlotRuntime[] {
    const out: SlotRuntime[] = [];
    for (const f of this.fixtures) if (f.def.kind === 'display') for (const s of f.slots.values()) if (s.item) out.push(s);
    return out;
  }

  // ───── 当たり判定 / 経路 ─────
  colliders(): Collider[] {
    const out = [...this.building.colliders];
    for (const f of this.fixtures) {
      if (f.def.id === 'floor_display') continue;
      out.push({ ...f.footprint(0.02), tag: 'fixture' });
    }
    return out;
  }

  rebuildNav() {
    const nav = this.nav;
    nav.resetDynamic();
    for (const f of this.fixtures) {
      const r = f.footprint(f.def.id === 'floor_display' ? 0.05 : 0.3);
      nav.markRect(r.x0, r.z0, r.x1, r.z1, 1, 'dyn');
    }
  }

  interactables(): THREE.Object3D[] {
    if (!this.interactCache) {
      const list: THREE.Object3D[] = [];
      for (const f of this.fixtures) list.push(...f.hitObjects());
      for (const v of this.itemViews.values()) if (v.root.parent) list.push(v.hit);
      this.building.openSign.traverse((o) => { if (o.userData.target) list.push(o); });
      const reg = this.first('register');
      if (reg?.extra.laptop && !reg.extra.laptopHit) {
        const hit = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.35), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = 0.15;
        hit.userData.target = { type: 'terminal' };
        reg.extra.laptop.add(hit);
        reg.extra.laptopHit = hit;
      }
      if (reg?.extra.laptopHit) list.push(reg.extra.laptopHit);
      this.interactCache = list;
    }
    return this.interactCache;
  }

  invalidateInteractables() { this.interactCache = null; }

  /** 什器を置けるか (建築モード) */
  canPlaceFixture(r: Rect, ignore?: FixtureView): boolean {
    const zones = [...BUILD_ZONES_BASE, ...(this.model.has('expand') ? [BUILD_ZONE_EXPANSION] : [])];
    const corners: [number, number][] = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]];
    if (!corners.every(([x, z]) => zones.some((zn) => inRect(zn, x, z)))) return false;
    if (RESERVED.some((q) => rectsOverlap(q, r))) return false;
    for (const f of this.fixtures) {
      if (f === ignore) continue;
      if (rectsOverlap(f.footprint(0.05), r)) return false;
    }
    return true;
  }

  update(dt: number, agents: THREE.Vector3[]) {
    this.building.update(dt, agents);
  }
}
