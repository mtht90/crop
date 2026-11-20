import * as THREE from 'three';
import { CITY, VIEW } from '../config/city';
import { BUILDING_VISUALS, DECOR_VISUALS, GROUND_VISUALS, HQ_VISUAL, ROAD_VISUALS, type BuildingVisual } from '../config/buildings';
import type { CityLayout, Lot } from '../core/layout';
import { ICON_DATA } from '../generated/icons';
import { CityControls } from './controls';
import { GLOW_MATERIALS, ModelLibrary } from './models';

/** 区画の状態を示す半透明の目印（UI上の印。建物の絵ではない） */
export type LotMark = 'none' | 'buyable' | 'owned' | 'selected';
const MARK_COLORS: Record<Exclude<LotMark, 'none'>, THREE.Color> = {
  buyable: new THREE.Color('#d8ff9a'),
  owned: new THREE.Color('#7cc4ff'),
  selected: new THREE.Color('#ffd23f'),
};

/** 区画に表示したいもの（ゲームの状態から作る） */
export interface LotView {
  ground: 'open' | 'locked';
  mark: LotMark;
  building: { visual: BuildingVisual; color: string | null } | null;
  badge: { icon: string; color: string } | null;
}

interface Slot {
  model: string;
  index: number;
}

/** 3Dの街。描画は「変化があったときだけ」行い、止まっている間は電池を使わない。 */
export class CityView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera();
  readonly controls: CityControls;
  readonly models: ModelLibrary;
  onLotTap: (lot: Lot | null) => void = () => {};

  private readonly markMesh: THREE.InstancedMesh;
  private readonly marks: LotMark[];
  private selected: number | null = null;
  private dirty = true;
  private readonly buildingSlots = new Map<number, Slot & { sig: string }>();
  private readonly groundSlots = new Map<number, Slot>();
  private readonly badgeMeshes = new Map<string, THREE.InstancedMesh>();
  private readonly badgeSlots = new Map<number, { icon: string; index: number; sig: string }>();
  private readonly badgeFree = new Map<string, number[]>();
  private readonly badgeCount = new Map<string, number>();
  private readonly badgeHeights = new Map<number, number>();
  private readonly sun = new THREE.DirectionalLight('#ffffff', 2.2);
  private readonly hemi = new THREE.HemisphereLight('#dfefff', '#56614f', 1.2);
  private readonly raycaster = new THREE.Raycaster();
  private lastLightKey = '';
  private glowLevel = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly layout: CityLayout,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, VIEW.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'city-canvas';

    this.scene.background = new THREE.Color('#bfe3f5');
    this.scene.add(this.hemi);
    this.sun.position.set(30, 60, 20);
    this.scene.add(this.sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.width + 60, layout.depth + 60).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#8fae7a' }),
    );
    ground.position.y = -0.3;
    this.scene.add(ground);

    const tile = new THREE.PlaneGeometry(CITY.lotSize * 0.9, CITY.lotSize * 0.9).rotateX(-Math.PI / 2);
    this.markMesh = new THREE.InstancedMesh(
      tile,
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }),
      layout.lots.length,
    );
    this.marks = layout.lots.map(() => 'none');
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const lot of layout.lots) {
      this.markMesh.setMatrixAt(lot.id, zero);
      this.markMesh.setColorAt(lot.id, new THREE.Color('#ffffff'));
    }
    this.scene.add(this.markMesh);

    this.models = new ModelLibrary(this.scene);
    this.controls = new CityControls(this.camera, host);
    this.controls.bounds = { x: layout.width / 2, z: layout.depth / 2 };
    this.controls.onChange = () => {
      this.orientBadges();
      this.invalidate();
    };
    this.controls.onTap = (x, y) => this.pick(x, y);
    this.controls.apply();

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    document.addEventListener('visibilitychange', () => this.invalidate());
    this.loop();
  }

  invalidate() {
    this.dirty = true;
  }

  private resize() {
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight, false);
    this.controls.resize();
    this.invalidate();
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    if (!this.dirty || document.hidden) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };

  /** 道路と、街の外側の木を並べる */
  async buildStatic() {
    const [straight, cross, tee, corner] = await Promise.all([
      this.models.pool(ROAD_VISUALS.straight.model),
      this.models.pool(ROAD_VISUALS.cross.model),
      this.models.pool(ROAD_VISUALS.tee.model),
      this.models.pool(ROAD_VISUALS.corner.model),
    ]);
    for (const r of this.layout.roads) straight?.add(ModelLibrary.placeMatrix(ROAD_VISUALS.straight, r.x, r.z, r.axis === 'x' ? 0 : Math.PI / 2));
    for (const c of this.layout.crossings) {
      if (c.edgeX !== 0 && c.edgeZ !== 0) {
        const rot = c.edgeX < 0 ? (c.edgeZ < 0 ? Math.PI / 2 : Math.PI) : (c.edgeZ < 0 ? 0 : -Math.PI / 2);
        corner?.add(ModelLibrary.placeMatrix(ROAD_VISUALS.corner, c.x, c.z, rot));
      } else if (c.edgeX !== 0 || c.edgeZ !== 0) {
        const rot = c.edgeZ < 0 ? 0 : c.edgeZ > 0 ? Math.PI : c.edgeX < 0 ? Math.PI / 2 : -Math.PI / 2;
        tee?.add(ModelLibrary.placeMatrix(ROAD_VISUALS.tee, c.x, c.z, rot));
      } else {
        cross?.add(ModelLibrary.placeMatrix(ROAD_VISUALS.cross, c.x, c.z));
      }
    }
    const trees = await Promise.all(DECOR_VISUALS.trees.map((t) => this.models.pool(t.model)));
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const w = this.layout.width / 2;
    const d = this.layout.depth / 2;
    for (let i = 0; i < 90; i++) {
      const side = Math.floor(rnd() * 4);
      const along = (rnd() * 2 - 1) * (side < 2 ? w + 3 : d + 3);
      const out = 0.8 + rnd() * 3.5;
      const x = side < 2 ? along : (side === 2 ? -1 : 1) * (w + out);
      const z = side < 2 ? (side === 0 ? -1 : 1) * (d + out) : along;
      const t = trees[Math.floor(rnd() * trees.length)];
      t?.add(ModelLibrary.placeMatrix({ model: '', scale: 1.2 + rnd() * 0.8 }, x, z, rnd() * Math.PI * 2, -0.3));
    }
    this.invalidate();
  }

  /** ゲームの状態を3Dに反映する（変わったところだけ） */
  async sync(views: LotView[], hqLot: number) {
    const jobs: Promise<void>[] = [];
    for (let id = 0; id < views.length; id++) {
      const v = views[id];
      if (this.marks[id] !== v.mark) {
        this.marks[id] = v.mark;
        this.paintMark(id);
      }
      jobs.push(this.setGround(id, v.ground));
      const b = id === hqLot ? { visual: HQ_VISUAL, color: null as string | null } : v.building;
      jobs.push(this.setBuilding(id, b));
      this.setBadge(id, v.badge);
    }
    await Promise.all(jobs);
    this.applyGlow();
    this.invalidate();
  }

  private async setGround(id: number, kind: 'open' | 'locked') {
    const v = GROUND_VISUALS[kind];
    const cur = this.groundSlots.get(id);
    if (cur?.model === v.model) return;
    const entry = { model: v.model, index: -1 };
    this.groundSlots.set(id, entry);
    if (cur && cur.index >= 0) (await this.models.pool(cur.model))?.remove(cur.index);
    const pool = await this.models.pool(v.model);
    if (!pool || this.groundSlots.get(id) !== entry) return;
    const lot = this.layout.lots[id];
    entry.index = pool.add(ModelLibrary.placeMatrix(v, lot.x, lot.z));
  }

  private async setBuilding(id: number, b: LotView['building']) {
    const sig = b ? `${b.visual.model}|${b.color ?? ''}` : '';
    const cur = this.buildingSlots.get(id);
    if ((cur?.sig ?? '') === sig) return;
    this.buildingSlots.delete(id);
    if (cur && cur.index >= 0) (await this.models.pool(cur.model))?.remove(cur.index);
    if (!b) {
      this.badgeHeights.delete(id);
      this.refreshBadge(id);
      return;
    }
    const entry = { model: b.visual.model, index: -1, sig };
    this.buildingSlots.set(id, entry);
    const pool = await this.models.pool(b.visual.model);
    if (!pool || this.buildingSlots.get(id) !== entry) return;
    const lot = this.layout.lots[id];
    entry.index = pool.add(ModelLibrary.placeMatrix(b.visual, lot.x, lot.z, lot.facing));
    pool.setTint(entry.index, b.color ? new THREE.Color(b.color) : null);
    this.badgeHeights.set(id, pool.height * (b.visual.scale ?? 1) * CITY.lotSize);
    this.refreshBadge(id);
  }

  // ---- 看板（業種アイコン。会社の色の丸） ----
  private badgeMesh(icon: string): THREE.InstancedMesh {
    let m = this.badgeMeshes.get(icon);
    if (m) return m;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    const data = ICON_DATA[icon];
    if (data) {
      g.save();
      g.translate(26, 26);
      g.scale(76 / 512, 76 / 512);
      g.fillStyle = '#1d2733';
      g.fill(new Path2D(data.d));
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
    m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.4, 0.4), mat, 128);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = 10;
    this.scene.add(m);
    this.badgeMeshes.set(icon, m);
    return m;
  }

  private setBadge(id: number, badge: LotView['badge']) {
    const sig = badge ? `${badge.icon}|${badge.color}` : '';
    const cur = this.badgeSlots.get(id);
    if ((cur?.sig ?? '') === sig) return;
    if (cur) {
      const m = this.badgeMesh(cur.icon);
      m.setMatrixAt(cur.index, new THREE.Matrix4().makeScale(0, 0, 0));
      m.instanceMatrix.needsUpdate = true;
      if (!this.badgeFree.has(cur.icon)) this.badgeFree.set(cur.icon, []);
      this.badgeFree.get(cur.icon)!.push(cur.index);
      this.badgeSlots.delete(id);
    }
    if (!badge) return;
    const m = this.badgeMesh(badge.icon);
    let index = this.badgeFree.get(badge.icon)?.pop();
    if (index === undefined) {
      index = this.badgeCount.get(badge.icon) ?? 0;
      this.badgeCount.set(badge.icon, index + 1);
      m.count = index + 1;
    }
    m.setColorAt(index, new THREE.Color(badge.color));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.badgeSlots.set(id, { icon: badge.icon, index, sig });
    this.placeBadge(id, badge.icon, index);
  }

  private refreshBadge(id: number) {
    const b = this.badgeSlots.get(id);
    if (b) this.placeBadge(id, b.icon, b.index);
  }

  private placeBadge(id: number, icon: string, index: number) {
    const m = this.badgeMesh(icon);
    const lot = this.layout.lots[id];
    const h = (this.badgeHeights.get(id) ?? 0.05) + 0.3;
    m.setMatrixAt(index, new THREE.Matrix4().compose(new THREE.Vector3(lot.x, h, lot.z), this.camera.quaternion, new THREE.Vector3(1, 1, 1)));
    m.instanceMatrix.needsUpdate = true;
    m.boundingSphere = null;
  }

  private orientBadges() {
    for (const [id, b] of this.badgeSlots) this.placeBadge(id, b.icon, b.index);
  }

  // ---- 区画の目印 ----
  private paintMark(id: number) {
    const mark = id === this.selected ? 'selected' : this.marks[id];
    const lot = this.layout.lots[id];
    const m = new THREE.Matrix4();
    if (mark !== 'none') {
      m.makeTranslation(lot.x, 0.02, lot.z);
      this.markMesh.setColorAt(id, MARK_COLORS[mark]);
      this.markMesh.instanceColor!.needsUpdate = true;
    } else {
      m.makeScale(0, 0, 0);
    }
    this.markMesh.setMatrixAt(id, m);
    this.markMesh.instanceMatrix.needsUpdate = true;
    this.markMesh.boundingSphere = null;
    this.invalidate();
  }

  select(id: number | null) {
    const prev = this.selected;
    this.selected = id;
    if (prev !== null) this.paintMark(prev);
    if (id !== null) this.paintMark(id);
  }

  /** カメラをその区画に寄せる */
  focusLot(id: number) {
    const lot = this.layout.lots[id];
    this.controls.target.set(lot.x, 0, lot.z);
    this.controls.apply();
    this.orientBadges();
    this.invalidate();
  }

  // ---- 昼と夜 ----
  /** hour: 0〜24 の小数 */
  setTimeOfDay(hour: number) {
    const t = ((hour - 6) / 12) * Math.PI;
    const sunUp = Math.sin(t);
    const day = Math.max(0, Math.min(1, sunUp * 1.6 + 0.15));
    const key = (Math.round(day * 40) / 40).toFixed(3);
    if (key === this.lastLightKey) return;
    this.lastLightKey = key;
    const dusk = 1 - Math.abs(sunUp);
    const sky = new THREE.Color('#1b2340').lerp(new THREE.Color('#bfe3f5'), day);
    if (day > 0.15 && day < 0.8) sky.lerp(new THREE.Color('#f2b88a'), 0.25 * dusk);
    this.scene.background = sky;
    this.sun.intensity = 0.25 + 2.1 * day;
    this.sun.color = new THREE.Color('#ffd7a8').lerp(new THREE.Color('#ffffff'), day);
    this.sun.position.set(Math.cos(t) * 50, 20 + Math.max(0, sunUp) * 50, 25);
    this.hemi.intensity = 0.45 + 0.85 * day;
    this.hemi.color = new THREE.Color('#6f7fb8').lerp(new THREE.Color('#dfefff'), day);
    this.glowLevel = Math.max(0, 1 - day * 1.4);
    this.applyGlow();
    this.invalidate();
  }

  private applyGlow() {
    for (const pool of this.models.pools.values()) {
      for (const mat of pool.materials) {
        if (!GLOW_MATERIALS.test(mat.name)) continue;
        const sm = mat as THREE.MeshStandardMaterial;
        if (!sm.emissive) continue;
        if (!sm.userData.glowBase) sm.userData.glowBase = sm.color.clone();
        sm.emissive.copy(mat.name === 'window' ? new THREE.Color('#ffd27a') : (sm.userData.glowBase as THREE.Color));
        sm.emissiveIntensity = this.glowLevel * (mat.name === 'window' ? 0.9 : 1.2);
      }
    }
  }

  // ---- タップ ----
  private pick(cx: number, cy: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, false);
    let point: THREE.Vector3 | null = null;
    for (const h of hits) {
      if (!(h.object instanceof THREE.InstancedMesh) || h.object === this.markMesh) continue;
      if (h.instanceId === undefined) continue;
      const m = new THREE.Matrix4();
      h.object.getMatrixAt(h.instanceId, m);
      point = new THREE.Vector3().setFromMatrixPosition(m);
      break;
    }
    if (!point) {
      point = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) point = null;
    }
    this.onLotTap(point ? this.lotAt(point.x, point.z) : null);
  }

  private lotAt(x: number, z: number): Lot | null {
    const h = CITY.lotSize / 2;
    for (const lot of this.layout.lots) {
      if (Math.abs(x - lot.x) <= h && Math.abs(z - lot.z) <= h) return lot;
    }
    return null;
  }
}

export function visualFor(industry: keyof typeof BUILDING_VISUALS, level: number): BuildingVisual | null {
  const list = BUILDING_VISUALS[industry];
  return list[Math.min(level, list.length) - 1] ?? null;
}
