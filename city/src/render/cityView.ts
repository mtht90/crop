import * as THREE from 'three';
import { CITY, VIEW } from '../config/city';
import { BUILDING_VISUALS, ROAD_VISUALS, type IndustryId } from '../config/buildings';
import type { CityLayout, Lot } from '../core/layout';
import { CityControls } from './controls';
import { ModelLibrary } from './models';

/** 区画の状態ごとの床の色（UI上の目印。建物の絵ではない） */
const LOT_COLORS = {
  locked: new THREE.Color('#9aa59a'),
  buyable: new THREE.Color('#b9d98f'),
  owned: new THREE.Color('#7cc4ff'),
  selected: new THREE.Color('#ffd166'),
};
export type LotState = 'locked' | 'buyable' | 'owned';

/**
 * 3Dの街。描画は「変化があったときだけ」行い、止まっている間は電池を使わない。
 */
export class CityView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera();
  readonly controls: CityControls;
  readonly models: ModelLibrary;
  onLotTap: (lot: Lot | null) => void = () => {};

  private readonly lotMesh: THREE.InstancedMesh;
  private readonly lotStates: LotState[];
  private selected: number | null = null;
  private dirty = true;
  private readonly buildingSlots = new Map<number, { model: string; index: number }>();
  private readonly sun = new THREE.DirectionalLight('#ffffff', 2.2);
  private readonly hemi = new THREE.HemisphereLight('#dfefff', '#56614f', 1.2);
  private readonly raycaster = new THREE.Raycaster();
  /** 1回描画したら次の変化まで止める。continuous にしている間は毎フレーム描く */
  continuous = false;

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

    // 地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.width + 40, layout.depth + 40).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#8fae7a' }),
    );
    ground.position.y = -0.02;
    this.scene.add(ground);

    // 区画の床（1回の描画でまとめて描く）
    const tile = new THREE.PlaneGeometry(CITY.lotSize * 0.94, CITY.lotSize * 0.94).rotateX(-Math.PI / 2);
    this.lotMesh = new THREE.InstancedMesh(tile, new THREE.MeshLambertMaterial({ color: '#ffffff' }), layout.lots.length);
    this.lotStates = layout.lots.map(() => 'locked');
    const m = new THREE.Matrix4();
    for (const lot of layout.lots) {
      m.makeTranslation(lot.x, 0.01, lot.z);
      this.lotMesh.setMatrixAt(lot.id, m);
      this.lotMesh.setColorAt(lot.id, LOT_COLORS.locked);
    }
    this.scene.add(this.lotMesh);

    this.models = new ModelLibrary(this.scene);
    this.controls = new CityControls(this.camera, host);
    this.controls.bounds = { x: layout.width / 2, z: layout.depth / 2 };
    this.controls.onChange = () => this.invalidate();
    this.controls.onTap = (x, y) => this.pick(x, y);
    this.controls.apply();

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.loop();
  }

  /** 次のフレームで1回描画する */
  invalidate() {
    this.dirty = true;
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.controls.resize();
    this.invalidate();
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    if (!this.dirty && !this.continuous) return;
    if (document.hidden) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };

  /** 道路を並べる。素材が無ければ平らな帯で代用（開発用の仮表示） */
  async buildRoads() {
    const w = CITY.roadWidth;
    const straight = await this.models.pool(ROAD_VISUALS.straight.model);
    const cross = await this.models.pool(ROAD_VISUALS.cross.model);
    if (straight && cross) {
      for (const r of this.layout.roads) {
        // 道路タイルは幅 w の正方形として並べる
        const n = Math.round(r.length / w);
        for (let i = 0; i < n; i++) {
          const off = -r.length / 2 + w / 2 + i * w;
          const x = r.axis === 'x' ? r.x + off : r.x;
          const z = r.axis === 'z' ? r.z + off : r.z;
          straight.add(ModelLibrary.placeMatrix(straight, ROAD_VISUALS.straight, x, z, w, r.axis === 'x' ? Math.PI / 2 : 0));
        }
      }
      for (const c of this.layout.crossings) cross.add(ModelLibrary.placeMatrix(cross, ROAD_VISUALS.cross, c.x, c.z, w));
    } else {
      const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const strips = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#5d6168' }),
        this.layout.roads.length + this.layout.crossings.length);
      const m = new THREE.Matrix4();
      let i = 0;
      for (const r of this.layout.roads) {
        const sx = r.axis === 'x' ? r.length : w;
        const sz = r.axis === 'z' ? r.length : w;
        m.compose(new THREE.Vector3(r.x, 0.005, r.z), new THREE.Quaternion(), new THREE.Vector3(sx, 1, sz));
        strips.setMatrixAt(i++, m);
      }
      for (const c of this.layout.crossings) {
        m.compose(new THREE.Vector3(c.x, 0.005, c.z), new THREE.Quaternion(), new THREE.Vector3(w, 1, w));
        strips.setMatrixAt(i++, m);
      }
      this.scene.add(strips);
    }
    this.invalidate();
  }

  setLotState(id: number, state: LotState) {
    this.lotStates[id] = state;
    this.paintLot(id);
  }

  private paintLot(id: number) {
    const c = id === this.selected ? LOT_COLORS.selected : LOT_COLORS[this.lotStates[id]];
    this.lotMesh.setColorAt(id, c);
    this.lotMesh.instanceColor!.needsUpdate = true;
    this.invalidate();
  }

  select(id: number | null) {
    const prev = this.selected;
    this.selected = id;
    if (prev !== null) this.paintLot(prev);
    if (id !== null) this.paintLot(id);
  }

  /** 区画に建物を置く（同じ区画に既にあれば建て替え）。素材が無ければ false */
  async setBuilding(lotId: number, industry: IndustryId, level: number): Promise<boolean> {
    const list = BUILDING_VISUALS[industry];
    const v = list[Math.min(level, list.length) - 1];
    this.clearBuilding(lotId);
    if (!v) return false;
    const pool = await this.models.pool(v.model);
    if (!pool) return false;
    const lot = this.layout.lots[lotId];
    // 道路側を向ける（簡易：区画の位置から一番近い道路の方向）
    const rot = Math.round(Math.atan2(lot.x, lot.z) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI;
    const index = pool.add(ModelLibrary.placeMatrix(pool, v, lot.x, lot.z, CITY.lotSize * 0.8, rot));
    this.buildingSlots.set(lotId, { model: v.model, index });
    this.invalidate();
    return true;
  }

  clearBuilding(lotId: number) {
    const s = this.buildingSlots.get(lotId);
    if (!s) return;
    void this.models.pool(s.model).then((p) => p?.remove(s.index));
    this.buildingSlots.delete(lotId);
    this.invalidate();
  }

  /** タップした位置の区画を探す（地面との交点から区画を求めるので、建物の形に左右されない） */
  private pick(cx: number, cy: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // まず建物との交差を試し、当たればその区画、外れたら地面上の点で判定
    const hits = this.raycaster.intersectObjects(this.scene.children, false);
    let point: THREE.Vector3 | null = null;
    for (const h of hits) {
      if (h.object instanceof THREE.InstancedMesh && h.object !== this.lotMesh) {
        point = h.point;
        // 建物の場合は、その建物のインスタンス位置を使う
        if (h.instanceId !== undefined) {
          const m = new THREE.Matrix4();
          h.object.getMatrixAt(h.instanceId, m);
          point = new THREE.Vector3().setFromMatrixPosition(m);
        }
        break;
      }
    }
    if (!point) {
      point = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) point = null;
    }
    const lot = point ? this.lotAt(point.x, point.z) : null;
    this.onLotTap(lot);
  }

  private lotAt(x: number, z: number): Lot | null {
    const h = CITY.lotSize / 2;
    for (const lot of this.layout.lots) {
      if (Math.abs(x - lot.x) <= h && Math.abs(z - lot.z) <= h) return lot;
    }
    return null;
  }
}
