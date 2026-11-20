import * as THREE from 'three';
import { CITY, VIEW } from '../config/city';
import { BUILDING_VISUALS, GROUND_VISUALS, ROAD_VISUALS, type IndustryId } from '../config/buildings';
import type { CityLayout, Lot } from '../core/layout';
import { CityControls } from './controls';
import { ModelLibrary } from './models';

/** 区画の状態を示す半透明の目印（UI上の印。建物の絵ではない）。null は目印なし */
const LOT_COLORS: Record<LotState | 'selected', THREE.Color | null> = {
  locked: null,
  buyable: new THREE.Color('#d8ff9a'),
  owned: new THREE.Color('#5fb4ff'),
  selected: new THREE.Color('#ffd23f'),
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
  private readonly groundSlots = new Map<number, { model: string; index: number }>();
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
    this.renderer.toneMapping = THREE.NoToneMapping;
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
    const tile = new THREE.PlaneGeometry(CITY.lotSize * 0.9, CITY.lotSize * 0.9).rotateX(-Math.PI / 2);
    this.lotMesh = new THREE.InstancedMesh(
      tile,
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }),
      layout.lots.length,
    );
    this.lotStates = layout.lots.map(() => 'locked');
    const m = new THREE.Matrix4();
    for (const lot of layout.lots) {
      m.makeScale(0, 0, 0);
      this.lotMesh.setMatrixAt(lot.id, m);
      this.lotMesh.setColorAt(lot.id, new THREE.Color('#ffffff'));
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

  /** 道路・地面・木を並べる */
  async buildStatic() {
    const [straight, cross, tee, corner] = await Promise.all([
      this.models.pool(ROAD_VISUALS.straight.model),
      this.models.pool(ROAD_VISUALS.cross.model),
      this.models.pool(ROAD_VISUALS.tee.model),
      this.models.pool(ROAD_VISUALS.corner.model),
    ]);
    if (straight) {
      for (const r of this.layout.roads) {
        straight.add(ModelLibrary.placeMatrix(ROAD_VISUALS.straight, r.x, r.z, r.axis === 'x' ? 0 : Math.PI / 2));
      }
    }
    for (const c of this.layout.crossings) {
      if (c.edgeX !== 0 && c.edgeZ !== 0) {
        // 角：素材は -X と +Z をつなぐ向き
        const rot = c.edgeX < 0 ? (c.edgeZ < 0 ? Math.PI / 2 : Math.PI) : (c.edgeZ < 0 ? 0 : -Math.PI / 2);
        corner?.add(ModelLibrary.placeMatrix(ROAD_VISUALS.corner, c.x, c.z, rot));
      } else if (c.edgeX !== 0 || c.edgeZ !== 0) {
        // T字路：素材は X 方向に通り、+Z に枝分かれする向き
        const rot = c.edgeZ < 0 ? 0 : c.edgeZ > 0 ? Math.PI : c.edgeX < 0 ? Math.PI / 2 : -Math.PI / 2;
        tee?.add(ModelLibrary.placeMatrix(ROAD_VISUALS.tee, c.x, c.z, rot));
      } else {
        cross?.add(ModelLibrary.placeMatrix(ROAD_VISUALS.cross, c.x, c.z));
      }
    }
    await Promise.all(this.layout.lots.map((l) => this.paintGround(l.id)));
    this.invalidate();
  }

  /** 区画の地面タイル（まだ買えない区画は別の地面） */
  private async paintGround(id: number) {
    const v = this.lotStates[id] === 'locked' ? GROUND_VISUALS.locked : GROUND_VISUALS.open;
    const cur = this.groundSlots.get(id);
    if (cur?.model === v.model) return;
    if (cur) (await this.models.pool(cur.model))?.remove(cur.index);
    const pool = await this.models.pool(v.model);
    if (!pool) return;
    const lot = this.layout.lots[id];
    this.groundSlots.set(id, { model: v.model, index: pool.add(ModelLibrary.placeMatrix(v, lot.x, lot.z)) });
    this.invalidate();
  }

  setLotState(id: number, state: LotState) {
    this.lotStates[id] = state;
    this.paintLot(id);
    void this.paintGround(id);
  }

  private paintLot(id: number) {
    const c = id === this.selected ? LOT_COLORS.selected : LOT_COLORS[this.lotStates[id]];
    const lot = this.layout.lots[id];
    const m = new THREE.Matrix4();
    if (c) {
      m.makeTranslation(lot.x, 0.01, lot.z);
      this.lotMesh.setColorAt(id, c);
      this.lotMesh.instanceColor!.needsUpdate = true;
    } else {
      m.makeScale(0, 0, 0);
    }
    this.lotMesh.setMatrixAt(id, m);
    this.lotMesh.instanceMatrix.needsUpdate = true;
    this.lotMesh.boundingSphere = null;
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
    const index = pool.add(ModelLibrary.placeMatrix(v, lot.x, lot.z, lot.facing));
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
