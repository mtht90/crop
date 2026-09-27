import * as THREE from 'three';
import { audio } from '../core/audio';
import { events, toast } from '../core/events';
import { input } from '../core/input';
import { SIZE_LABEL, SIZE_ORDER, itemDef } from '../data/items';
import type { ItemView } from '../entities/itemView';
import type { FixtureView, SlotRuntime } from '../world/fixtureView';
import type { Game } from '../game/game';
import type { PromptLine } from '../ui/hud';

type Target =
  | { type: 'item'; view: ItemView }
  | { type: 'slot'; slot: SlotRuntime }
  | { type: 'fixture'; fixture: FixtureView }
  | { type: 'openSign' }
  | { type: 'terminal' };

const REACH = 3.0;

/** 視線の先の対象を判定し、持つ・置く・使うを処理する */
export class Interaction {
  held: ItemView | null = null;
  private holder = new THREE.Group();
  private ray = new THREE.Raycaster();
  target: Target | null = null;
  private hitPoint = new THREE.Vector3();
  private slotMarker: THREE.Mesh;
  private markerOk = new THREE.MeshBasicMaterial({ color: '#63e38a', transparent: true, opacity: 0.35, depthWrite: false });
  private markerNg = new THREE.MeshBasicMaterial({ color: '#ff6a6a', transparent: true, opacity: 0.35, depthWrite: false });

  constructor(private g: Game) {
    g.engine.camera.add(this.holder);
    this.holder.position.set(0.32, -0.3, -0.62);
    this.slotMarker = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), this.markerOk);
    this.slotMarker.visible = false;
    this.slotMarker.renderOrder = 3;
    g.engine.scene.add(this.slotMarker);
    this.ray.far = REACH;
  }

  get heldItem() { return this.held?.state ?? null; }

  // ───── 持つ / 置く ─────
  pickUp(view: ItemView) {
    if (this.held) return;
    this.g.world.detachItem(view.state.uid);
    view.state.loc = { type: 'held' };
    this.attachToHand(view);
    audio.play('pickup', { volume: 0.7 });
  }

  /** 在庫から取り出して持つ */
  takeFromStock(uid: string) {
    const it = this.g.model.item(uid);
    if (!it || this.held) return;
    const v = this.g.world.attachItem(it, this.tempSlot());
    this.g.world.detachItem(uid);
    it.loc = { type: 'held' };
    this.attachToHand(v);
    audio.play('pickup', { volume: 0.7 });
  }

  /** attachItem に渡すためだけのダミー枠 */
  private tempSlot(): SlotRuntime {
    const anchor = new THREE.Object3D();
    return { def: { id: 'tmp', pos: [0, 0, 0], size: 'XL' }, fixture: { def: { kind: 'stock' }, state: { uid: 'tmp' } } as any, anchor, hit: new THREE.Mesh(), item: null };
  }

  private attachToHand(view: ItemView) {
    this.held = view;
    view.root.removeFromParent();
    const s = view.size;
    const k = 0.34 / Math.max(s.x, s.y, s.z, 0.1);
    view.root.scale.setScalar(k);
    view.root.position.set(0, -s.y * k * 0.35, 0);
    view.root.rotation.set(0.15, -0.5, 0);
    view.refreshTag(false);
    view.root.traverse((o) => { o.castShadow = false; });
    this.holder.add(view.root);
    this.g.world.invalidateInteractables();
  }

  placeHeld(slot: SlotRuntime): boolean {
    const v = this.held;
    if (!v) return false;
    if (!slot.fixture.canAccept(slot.def.id, v.def.sizeClass)) return false;
    this.holder.remove(v.root);
    v.root.traverse((o) => { o.castShadow = true; });
    this.held = null;
    this.g.world.attachItem(v.state, slot);
    audio.play(Math.random() < 0.5 ? 'place' : 'place2', { volume: 0.7 });
    events.emit('item:placed', { itemUid: v.state.uid });
    return true;
  }

  stashHeld() {
    const v = this.held;
    if (!v) return;
    this.holder.remove(v.root);
    this.held = null;
    v.state.loc = { type: 'stock' };
    this.g.world.destroyView(v.state.uid);
    audio.play('remove', { volume: 0.6 });
    toast(`${v.def.name} を在庫に戻しました`, 'info', 'cardboard-box');
  }

  // ───── 毎フレーム ─────
  update() {
    const g = this.g;
    this.slotMarker.visible = false;
    if (g.ui.modalOpen || g.build.active) { g.hud.setPrompt([]); g.hud.setInfo(null); this.setOutline([]); return; }
    this.ray.setFromCamera(new THREE.Vector2(0, 0), g.engine.camera);
    const hits = this.ray.intersectObjects(g.world.interactables(), false);
    this.target = null;
    for (const h of hits) {
      const t = h.object.userData.target as Target | undefined;
      if (!t) continue;
      if (this.held) {
        if (t.type === 'item') continue;
        if (t.type === 'slot' && t.slot.item) continue;
      } else if (t.type === 'slot') continue;
      this.target = t;
      this.hitPoint.copy(h.point);
      break;
    }
    const lines = this.promptFor(this.target);
    g.hud.setPrompt(lines);
    g.hud.setHeld(this.heldItem);
    const info = this.target?.type === 'item' ? this.target.view.state : null;
    g.hud.setInfo(info);
    this.outlineTarget();
    this.handleInput();
  }

  private setOutline(objs: THREE.Object3D[], color?: string) { this.g.engine.setOutline(objs, color); }

  private outlineTarget() {
    const t = this.target;
    if (!t) return this.setOutline([]);
    if (t.type === 'item') return this.setOutline([t.view.model]);
    if (t.type === 'fixture') {
      const vis = t.fixture.root.children[0];
      return this.setOutline(vis ? [vis] : []);
    }
    if (t.type === 'openSign') return this.setOutline([this.g.world.building.openSign]);
    if (t.type === 'terminal') return this.setOutline([this.g.world.first('register').extra.laptop]);
    if (t.type === 'slot') {
      const ok = this.held ? t.slot.fixture.canAccept(t.slot.def.id, this.held.def.sizeClass) : false;
      this.showSlot(t.slot, ok);
      return this.setOutline([]);
    }
  }

  private showSlot(slot: SlotRuntime, ok: boolean) {
    const size = slot.fixture.slotCellSize(slot.def);
    this.slotMarker.material = ok ? this.markerOk : this.markerNg;
    this.slotMarker.scale.set(size.x, 1, size.z);
    slot.hit.getWorldPosition(this.slotMarker.position);
    this.slotMarker.position.y -= 0.05;
    this.slotMarker.rotation.y = slot.fixture.root.rotation.y;
    this.slotMarker.visible = true;
  }

  /** 什器を見ているときに、当たった位置に近い空き枠 */
  private nearestSlot(f: FixtureView): SlotRuntime | null {
    if (!this.held) return null;
    let best: SlotRuntime | null = null;
    let bd = Infinity;
    for (const s of f.slots.values()) {
      if (!f.canAccept(s.def.id, this.held.def.sizeClass)) continue;
      const d = s.hit.getWorldPosition(new THREE.Vector3()).distanceTo(this.hitPoint);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  private promptFor(t: Target | null): PromptLine[] {
    const g = this.g;
    const held = this.held;
    const out: PromptLine[] = [];
    if (held) out.push({ key: 'Q', text: '在庫に戻す' });
    if (!t) return out;
    switch (t.type) {
      case 'item': {
        const loc = t.view.state.loc;
        const onCounter = loc.type === 'counter';
        const customerOwned = onCounter && g.customers.appraisalCustomer()?.sellItem?.uid === t.view.state.uid;
        if (customerOwned) { out.unshift({ key: 'E', text: '査定をはじめる' }); break; }
        out.unshift({ key: 'クリック', text: '手に取る' });
        if (loc.type === 'fixture') out.unshift({ key: 'F', text: t.view.state.price ? '値札を変更' : '値札をつける' });
        if (loc.type === 'bench') out.unshift({ key: 'E', text: '清掃・修理する' });
        break;
      }
      case 'slot': {
        if (!held) break;
        const ok = t.slot.fixture.canAccept(t.slot.def.id, held.def.sizeClass);
        out.unshift(ok ? { key: 'クリック', text: 'ここに置く' } : { key: '', text: this.whyNot(t.slot, held), disabled: true });
        break;
      }
      case 'fixture': {
        const f = t.fixture;
        const k = f.def.kind;
        if (held) {
          if (k === 'stock') out.unshift({ key: 'クリック', text: '在庫置き場にしまう' });
          else if (k === 'display' || k === 'workbench') {
            const s = this.nearestSlot(f);
            if (s) { out.unshift({ key: 'クリック', text: k === 'workbench' ? '作業台に置く' : `${f.def.name}に置く` }); this.showSlot(s, true); }
            else out.unshift({ key: '', text: this.fixtureFullReason(f, held), disabled: true });
          }
        } else {
          if (k === 'stock') out.unshift({ key: 'E', text: `在庫を見る (${g.model.stockItems().length}点)` });
          if (k === 'register') {
            const c = g.customers.buyQueue[0];
            out.unshift(c && c.state === 'checkout' ? { key: 'E', text: `レジ打ち (${c.name})` } : { key: '', text: 'レジ (お客さん待ち)', disabled: true });
          }
          if (k === 'appraisal') {
            const c = g.customers.appraisalCustomer();
            out.unshift(c ? { key: 'E', text: `査定する (${c.name})` } : { key: '', text: '買取カウンター (持ち込み待ち)', disabled: true });
          }
          if (k === 'workbench') {
            const s = f.slots.get('bench');
            out.unshift(s?.item ? { key: 'E', text: '清掃・修理する' } : { key: '', text: '作業台 (商品を置くと清掃・修理できる)', disabled: true });
          }
          if (f.def.buyable) out.push({ key: 'G', text: '什器を移動' });
        }
        break;
      }
      case 'openSign': {
        const ph = g.model.state.phase;
        out.unshift(ph === 'prep' ? { key: 'E', text: '開店する' } : ph === 'open' ? { key: 'E', text: '早めに閉店する' } : { key: '', text: '本日は閉店', disabled: true });
        break;
      }
      case 'terminal':
        out.unshift({ key: 'E', text: '店舗PCを使う' });
        break;
    }
    return out;
  }

  private whyNot(slot: SlotRuntime, v: ItemView) {
    if (slot.item) return '他の商品がある';
    if (SIZE_ORDER[v.def.sizeClass] > SIZE_ORDER[slot.def.size]) return `${SIZE_LABEL[v.def.sizeClass]}は置けない (この枠は${SIZE_LABEL[slot.def.size]}まで)`;
    if (slot.fixture.def.id === 'floor_display') return '床展示は大型商品専用';
    return 'ここには置けない';
  }

  private fixtureFullReason(f: FixtureView, v: ItemView) {
    const maxSize = Math.max(...f.def.slots.map((s) => SIZE_ORDER[s.size]));
    if (SIZE_ORDER[v.def.sizeClass] > maxSize) return `${SIZE_LABEL[v.def.sizeClass]}の商品は置けない`;
    if (f.def.id === 'floor_display' && SIZE_ORDER[v.def.sizeClass] < SIZE_ORDER.L) return '床展示は大型商品専用';
    return '空きがない';
  }

  private handleInput() {
    const g = this.g;
    const t = this.target;
    const click = input.wasPressed('Mouse0');
    const use = input.wasPressed('KeyE');
    if (input.wasPressed('KeyQ') && this.held) { this.stashHeld(); return; }
    if (input.wasPressed('Tab')) { g.openTerminal(); return; }
    if (!t) return;
    switch (t.type) {
      case 'item': {
        const st = t.view.state;
        const customerOwned = st.loc.type === 'counter' && g.customers.appraisalCustomer()?.sellItem?.uid === st.uid;
        if (customerOwned) { if (use || click) g.appraisal.open(); return; }
        if (click) this.pickUp(t.view);
        else if (input.wasPressed('KeyF') && st.loc.type === 'fixture') g.priceUI.open(st);
        else if (use && st.loc.type === 'bench') g.workshop.open();
        else if (use && st.loc.type === 'fixture') g.priceUI.open(st);
        break;
      }
      case 'slot':
        if (click && this.held && !this.placeHeld(t.slot)) { audio.errorBuzz(); }
        break;
      case 'fixture': {
        const f = t.fixture;
        const k = f.def.kind;
        if (this.held && click) {
          if (k === 'stock') this.stashHeld();
          else if (k === 'display' || k === 'workbench') {
            const s = this.nearestSlot(f);
            if (s) this.placeHeld(s);
            else audio.errorBuzz();
          }
          return;
        }
        if (use) {
          if (k === 'stock') g.stockUI.open();
          else if (k === 'register') g.checkout.openIfReady();
          else if (k === 'appraisal') g.appraisal.open();
          else if (k === 'workbench') g.workshop.open();
        }
        if (input.wasPressed('KeyG') && f.def.buyable && !this.held) g.build.startMove(f);
        break;
      }
      case 'openSign':
        if (use || click) g.toggleOpen();
        break;
      case 'terminal':
        if (use || click) g.openTerminal();
        break;
    }
  }

  /** 読み込み直後など: 手に持っている物がある状態を在庫へ */
  reset() {
    if (this.held) this.stashHeld();
  }

  itemName(uid: string) { return itemDef(this.g.model.item(uid)!.defId).name; }
}
