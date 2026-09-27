import * as THREE from 'three';
import { assets } from '../core/assets';
import { itemDef, type ItemDef } from '../data/items';
import type { ItemState } from '../game/state';
import { CanvasTex, JP_FONT, fitText, roundRect } from '../world/canvasTex';
import { yen } from '../core/util';

/** 細長い品は台の上で寝かせて置く */
const LAY_IDS = new Set(['sword1', 'sword2', 'dagger', 'axe', 'staff', 'wand', 'knife', 'quiver', 'crossbow']);

export function buildItemModel(def: ItemDef, variant = 0): THREE.Group {
  const g = new THREE.Group();
  const inst = assets.instance(def.model, { size: def.size, fit: def.fit });
  if (LAY_IDS.has(def.id)) {
    inst.rotation.z = Math.PI / 2;
    inst.rotation.y = 0.3;
  }
  if (def.rotY) inst.rotation.y += def.rotY;
  g.add(inst);
  // 回転後に接地し直す
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inst, true);
  const c = box.getCenter(new THREE.Vector3());
  inst.position.x -= c.x;
  inst.position.z -= c.z;
  inst.position.y -= box.min.y;
  if (def.lift) inst.position.y += def.lift;
  // マテリアルバリアント (スニーカーの色違いなど)
  const gltf = assets.get(def.model);
  const variants = gltf.userData?.variants as string[] | undefined;
  const fn = (gltf as any).functions?.selectVariant;
  if (variants?.length && fn) {
    try { fn(inst, variants[variant % variants.length]); } catch { /* 共有マテリアルなので失敗しても表示は可能 */ }
  }
  g.userData.size = box.getSize(new THREE.Vector3());
  return g;
}

/** 店内に置かれた商品 1 点の見た目 (モデル + 値札 + 当たり判定) */
export class ItemView {
  readonly root = new THREE.Group();
  readonly model: THREE.Group;
  readonly hit: THREE.Mesh;
  readonly def: ItemDef;
  private tag: THREE.Mesh | null = null;
  private tagTex: CanvasTex | null = null;
  private lastPrice: number | null | undefined = undefined;
  size: THREE.Vector3;

  constructor(public state: ItemState) {
    this.def = itemDef(state.defId);
    this.model = buildItemModel(this.def, state.variant);
    this.root.add(this.model);
    this.size = this.model.userData.size.clone();
    const hs = this.size.clone().max(new THREE.Vector3(0.12, 0.12, 0.12));
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(hs.x, hs.y, hs.z), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = hs.y / 2;
    this.hit.userData.target = { type: 'item', view: this };
    this.root.add(this.hit);
    this.root.userData.itemUid = state.uid;
  }

  /** 値札の表示を状態に合わせて更新 */
  refreshTag(show: boolean) {
    const price = show ? this.state.price : undefined;
    if (price === this.lastPrice) return;
    this.lastPrice = price;
    if (!show) { if (this.tag) this.tag.visible = false; return; }
    if (!this.tag) {
      this.tagTex = new CanvasTex(192, 88);
      const mat = new THREE.MeshStandardMaterial({ map: this.tagTex.texture, emissive: '#ffffff', emissiveMap: this.tagTex.texture, emissiveIntensity: 0.25, transparent: true, roughness: 0.7 });
      this.tag = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.078), mat);
      this.tag.rotation.x = -0.35;
      const floor = this.def.sizeClass === 'L' || this.def.sizeClass === 'XL';
      this.tag.position.set(0, floor ? Math.min(0.55, this.size.y + 0.08) : 0.045, this.size.z / 2 + (floor ? 0.1 : 0.06));
      if (floor) this.tag.scale.setScalar(1.6);
      this.root.add(this.tag);
    }
    this.tag.visible = true;
    const p = this.state.price;
    this.tagTex!.draw((ctx, w, h) => {
      roundRect(ctx, 4, 4, w - 8, h - 8, 12);
      ctx.fillStyle = p ? '#fff6c9' : '#ffd0d0';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = p ? '#d2a520' : '#d04848';
      ctx.stroke();
      ctx.fillStyle = p ? '#3b2a05' : '#a01818';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = p ? yen(p) : '値札なし';
      fitText(ctx, text, w - 26, p ? 48 : 36);
      ctx.fillText(text, w / 2, h / 2 + 3);
    });
  }

  dispose() {
    this.hit.geometry.dispose();
    this.tagTex?.texture.dispose();
    (this.tag?.material as THREE.Material | undefined)?.dispose();
    this.tag?.geometry.dispose();
  }
}

export { JP_FONT };
