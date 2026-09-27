import * as THREE from 'three';
import { assets } from '../core/assets';
import { fixtureDef, type FixtureDef, type SlotDef } from '../data/fixtures';
import { SIZE_ORDER, type SizeClass } from '../data/items';
import type { FixtureState } from '../game/state';
import type { ItemView } from '../entities/itemView';
import { CanvasTex, JP_FONT, fitText, roundRect } from './canvasTex';
import { K, rect, type Rect } from './layout';

export interface SlotRuntime {
  def: SlotDef;
  fixture: FixtureView;
  anchor: THREE.Object3D;
  hit: THREE.Mesh;
  item: ItemView | null;
}

const WOOD = new THREE.MeshStandardMaterial({ color: '#b87a4b', roughness: 0.75 });
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.8 });
const METAL = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.35, metalness: 0.8 });
const GLASS = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, transmission: 0.92, thickness: 0.02, ior: 1.45, transparent: true, opacity: 0.35, depthWrite: false });
const DARK = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.4, metalness: 0.3 });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 什器の見た目 (外部モデル + 一部の補助形状) */
export function buildFixtureVisual(def: FixtureDef): { group: THREE.Group; extra: Record<string, any> } {
  const g = new THREE.Group();
  const extra: Record<string, any> = {};
  switch (def.id) {
    case 'wall_shelf': {
      // KayKit の棚板 3 段 + 側板・背板
      const sideH = 1.9;
      g.add(box(0.05, sideH, def.d, WOOD_DARK, -def.w / 2 + 0.025, 0, 0));
      g.add(box(0.05, sideH, def.d, WOOD_DARK, def.w / 2 - 0.025, 0, 0));
      g.add(box(def.w, sideH, 0.04, WOOD, 0, 0, -def.d / 2 + 0.02));
      g.add(box(def.w, 0.12, def.d, WOOD_DARK, 0, 0, 0));
      for (const top of [0.5, 1.05, 1.6]) {
        const plank = assets.instance('env/shelf_B_large.glb', { scale: K * 0.98 });
        const sz = plank.userData.localSize as THREE.Vector3;
        plank.position.set(0, top - sz.y, -def.d / 2 + 0.04 + sz.z / 2);
        g.add(plank);
      }
      g.add(box(def.w, 0.04, def.d, WOOD_DARK, 0, sideH - 0.04, 0));
      break;
    }
    case 'display_table': {
      const t = assets.instance('env/kd_table_long_tablecloth.glb', { scale: K });
      t.rotation.y = Math.PI / 2;
      g.add(t);
      break;
    }
    case 'showcase': {
      const c = assets.instance('items/cabinet_medium.glb', { scale: K });
      g.add(c);
      const glass = box(def.w - 0.04, 0.46, def.d - 0.04, GLASS, 0, 0.75, 0);
      glass.castShadow = false;
      glass.raycast = () => {};
      glass.renderOrder = 2;
      g.add(glass);
      // 金属フレーム
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.03, 0.46, 0.03, METAL, x * (def.w / 2 - 0.03), 0.75, z * (def.d / 2 - 0.03)));
      g.add(box(def.w - 0.02, 0.03, def.d - 0.02, METAL, 0, 1.2, 0));
      const light = new THREE.PointLight('#fff2d6', 1.2, 1.4, 2);
      light.position.set(0, 1.12, 0);
      g.add(light);
      break;
    }
    case 'floor_display': {
      const r = assets.instance('env/rug_rectangle_stripes_A.glb', { scale: K });
      g.add(r);
      break;
    }
    case 'register': {
      for (const x of [-0.75, 0.75]) {
        const c = assets.instance('env/kitchencounter_straight_A.glb', { scale: K });
        c.rotation.y = Math.PI;
        c.position.x = x;
        g.add(c);
      }
      const reg = buildRegisterMachine();
      reg.group.position.set(-0.55, 0.75, -0.1);
      g.add(reg.group);
      extra.display = reg.display;
      extra.drawer = reg.drawer;
      const pc = buildLaptop();
      pc.group.position.set(0.95, 0.75, -0.05);
      pc.group.rotation.y = Math.PI + 0.35;
      g.add(pc.group);
      extra.laptop = pc.group;
      extra.screen = pc.screen;
      break;
    }
    case 'appraisal': {
      const c = assets.instance('env/kitchencounter_straight_B.glb', { scale: K });
      c.rotation.y = Math.PI;
      g.add(c);
      const mat = assets.instance('env/rug_rectangle_A.glb', { scale: 0.26 });
      mat.position.set(0, 0.755, 0.1);
      g.add(mat);
      const board = assets.instance('env/menu.glb', { scale: 0.55 });
      board.position.set(0.6, 0.755, 0.2);
      board.rotation.y = -0.4;
      g.add(board);
      const tex = new CanvasTex(256, 128);
      tex.draw((ctx, w, h) => {
        ctx.fillStyle = '#1f3d2b'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitText(ctx, '買取受付', w - 20, 64);
        ctx.fillText('買取受付', w / 2, h / 2);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshStandardMaterial({ map: tex.texture, emissive: '#fff', emissiveMap: tex.texture, emissiveIntensity: 0.5 }));
      sign.position.set(0, 1.35, 0.35);
      g.add(sign);
      const pole = box(0.03, 0.6, 0.03, METAL, 0, 0.75, 0.35);
      g.add(pole);
      break;
    }
    case 'workbench': {
      const t = assets.instance('env/kitchentable_A_large.glb', { scale: K });
      t.scale.set(1, 1.07, 0.73);
      g.add(t);
      const towel = assets.instance('env/papertowel.glb', { scale: 0.45 });
      towel.position.set(0.95, 0.8, -0.35);
      g.add(towel);
      const rail = assets.instance('env/towelrail.glb', { scale: 0.6 });
      rail.position.set(-0.6, 1.2, -0.52);
      g.add(rail);
      const lamp = new THREE.PointLight('#fff3dd', 3, 3, 2);
      lamp.position.set(0, 1.9, 0);
      g.add(lamp);
      break;
    }
    case 'stock': {
      const c = assets.instance('env/kd_crates_stacked.glb', { scale: 0.62 });
      c.position.set(-0.1, 0, -0.1);
      g.add(c);
      const b = assets.instance('env/Box_A.glb', { scale: 1.1 });
      b.position.set(0.45, 0, 0.5);
      g.add(b);
      const b2 = assets.instance('env/Box_B.glb', { scale: 1.1 });
      b2.position.set(-0.45, 0, 0.55);
      b2.rotation.y = 0.4;
      g.add(b2);
      const tex = new CanvasTex(256, 96);
      tex.draw((ctx, w, h) => {
        roundRect(ctx, 4, 4, w - 8, h - 8, 10); ctx.fillStyle = '#f4e3b5'; ctx.fill();
        ctx.fillStyle = '#5a3a12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitText(ctx, '在庫置き場', w - 20, 52); ctx.fillText('在庫置き場', w / 2, h / 2 + 2);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshStandardMaterial({ map: tex.texture }));
      sign.position.set(0, 1.45, 0.3);
      g.add(sign);
      break;
    }
    case 'plant_decor': {
      g.add(assets.instance('env/cactus_medium_B.glb', { size: 0.8 }));
      break;
    }
    case 'bench_decor': {
      g.add(assets.instance('env/couch.glb', { scale: K }));
      break;
    }
    case 'drink_cooler': {
      g.add(assets.instance('env/khr_CommercialRefrigerator.glb', { size: 2.1, fit: 'y' }));
      break;
    }
  }
  return { group: g, extra };
}

function buildRegisterMachine() {
  const group = new THREE.Group();
  group.add(box(0.42, 0.12, 0.36, DARK, 0, 0, 0));
  const drawer = box(0.4, 0.07, 0.3, METAL, 0, 0.01, 0.03);
  group.add(drawer);
  group.add(box(0.36, 0.05, 0.2, DARK, 0, 0.12, 0.04));
  const pole = box(0.04, 0.2, 0.04, DARK, 0, 0.12, -0.12);
  group.add(pole);
  const tex = new CanvasTex(256, 96);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshStandardMaterial({ map: tex.texture, emissive: '#fff', emissiveMap: tex.texture, emissiveIntensity: 1 }));
  display.position.set(0, 0.36, -0.12);
  const back = display.clone();
  back.rotation.y = Math.PI;
  back.position.z -= 0.005;
  display.position.z += 0.005;
  const frame = box(0.33, 0.13, 0.02, DARK, 0, 0.295, -0.12);
  group.add(frame, display, back);
  const setText = (text: string) => tex.draw((ctx, w, h) => {
    ctx.fillStyle = '#0d1f14'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#6dff9a'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = `700 58px ${JP_FONT}`;
    ctx.fillText(text, w - 14, h / 2 + 2);
  });
  setText('¥0');
  return { group, display: setText, drawer };
}

function buildLaptop() {
  const group = new THREE.Group();
  group.add(box(0.38, 0.02, 0.26, METAL, 0, 0, 0));
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.02, -0.12);
  hinge.rotation.x = -0.25;
  const lid = box(0.38, 0.25, 0.012, METAL, 0, 0, 0);
  hinge.add(lid);
  const tex = new CanvasTex(256, 168);
  tex.draw((ctx, w, h) => {
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#1b4a7a'); grd.addColorStop(1, '#11243d');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `800 26px ${JP_FONT}`;
    ctx.fillText('SHOP PC', w / 2, h / 2 - 8);
    ctx.font = `500 16px ${JP_FONT}`; ctx.fillText('相場・発注・設備', w / 2, h / 2 + 20);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.22), new THREE.MeshStandardMaterial({ map: tex.texture, emissive: '#fff', emissiveMap: tex.texture, emissiveIntensity: 0.9 }));
  screen.position.set(0, 0.125, 0.008);
  hinge.add(screen);
  group.add(hinge);
  return { group, screen };
}

/** 配置済みの什器 1 台 */
export class FixtureView {
  readonly root = new THREE.Group();
  readonly def: FixtureDef;
  readonly hit: THREE.Mesh;
  readonly slots = new Map<string, SlotRuntime>();
  readonly extra: Record<string, any>;

  constructor(public state: FixtureState) {
    this.def = fixtureDef(state.defId);
    const { group, extra } = buildFixtureVisual(this.def);
    this.extra = extra;
    this.root.add(group);
    this.root.position.set(state.x, 0, state.z);
    // 購入什器は 90° 単位 (0..3)、固定設備はラジアン
    this.root.rotation.y = this.def.buyable ? state.rot * (Math.PI / 2) : state.rot;
    const h = Math.max(this.def.h, 0.3);
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(this.def.w, h, this.def.d), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = h / 2;
    this.hit.userData.target = { type: 'fixture', fixture: this };
    this.root.add(this.hit);
    for (const sd of this.def.slots) {
      const anchor = new THREE.Object3D();
      anchor.position.set(...sd.pos);
      if (sd.rotY) anchor.rotation.y = sd.rotY;
      this.root.add(anchor);
      const cell = this.slotCellSize(sd);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(cell.x, 0.12, cell.z), new THREE.MeshBasicMaterial({ visible: false }));
      sh.position.set(sd.pos[0], sd.pos[1] + 0.06, sd.pos[2]);
      const rt: SlotRuntime = { def: sd, fixture: this, anchor, hit: sh, item: null };
      sh.userData.target = { type: 'slot', slot: rt };
      this.root.add(sh);
      this.slots.set(sd.id, rt);
    }
    this.root.userData.fixtureUid = state.uid;
  }

  slotCellSize(sd: SlotDef): THREE.Vector3 {
    const same = this.def.slots.filter((s) => s.pos[1] === sd.pos[1] && s.pos[2] === sd.pos[2] && !s.overlaps);
    const n = Math.max(1, same.length);
    if (sd.size === 'XL') return new THREE.Vector3(this.def.w * 0.95, 0, this.def.d * 0.9);
    if (sd.overlaps) return new THREE.Vector3(this.def.w / 2 * 0.95, 0, this.def.d * 0.9);
    const rows = new Set(this.def.slots.map((s) => s.pos[2])).size;
    return new THREE.Vector3((this.def.w / n) * 0.95, 0, Math.min(this.def.d / Math.max(1, rows) * 0.95, 0.5));
  }

  /** 枠が空いていて、サイズが合うか */
  canAccept(slotId: string, size: SizeClass): boolean {
    const s = this.slots.get(slotId);
    if (!s || s.item) return false;
    if (SIZE_ORDER[size] > SIZE_ORDER[s.def.size]) return false;
    // 大きい枠に小物を置くのは床展示以外 OK。床展示は L 以上のみ
    if (this.def.id === 'floor_display' && SIZE_ORDER[size] < SIZE_ORDER.L) return false;
    for (const o of s.def.overlaps ?? []) if (this.slots.get(o)?.item) return false;
    return true;
  }

  /** 平面上の占有範囲 (ワールド座標) */
  footprint(pad = 0): Rect {
    const rot = this.root.rotation.y;
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    const hw = (this.def.w * c + this.def.d * s) / 2 + pad;
    const hd = (this.def.w * s + this.def.d * c) / 2 + pad;
    return rect(this.root.position.x - hw, this.root.position.z - hd, this.root.position.x + hw, this.root.position.z + hd);
  }

  /** 客が商品を眺める立ち位置 (ワールド) */
  viewPoint(slot?: SlotRuntime): THREE.Vector3 {
    const local = new THREE.Vector3(slot ? slot.def.pos[0] : 0, 0, this.def.d / 2 + (this.def.viewOffset ?? 0.9) - this.def.d / 2 * 0.2);
    return this.root.localToWorld(local).setY(0);
  }

  hitObjects(): THREE.Object3D[] {
    return [this.hit, ...[...this.slots.values()].map((s) => s.hit)];
  }

  dispose() {
    this.hit.geometry.dispose();
    for (const s of this.slots.values()) s.hit.geometry.dispose();
  }
}
