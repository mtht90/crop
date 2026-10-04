import * as THREE from 'three';
import { CROPS, type CropId, MAX_FARM_RING } from '../game/data';
import { type Hex, hexDistance, hexKey, hexToWorld, HEX_SIZE, spiral, worldToHex } from '../game/hex';
import { growthRatio, isRipe } from '../game/logic';
import { FARM_HEXES, type GameState } from '../game/state';
import { firstMesh, instance } from './assets';

/** 畑の外に置く建物（北側＝画面奥にまとめる） */
const BUILDINGS: { hex: Hex; model: string; rot: number; role?: 'home' | 'market' | 'windmill' }[] = [
  { hex: { q: 1, r: -7 }, model: 'hex/building_home_A_yellow.gltf', rot: 0, role: 'home' },
  { hex: { q: 5, r: -7 }, model: 'hex/building_market_yellow.gltf', rot: 0, role: 'market' },
  { hex: { q: -4, r: -3 }, model: 'hex/building_windmill_yellow.gltf', rot: Math.PI / 6, role: 'windmill' },
  { hex: { q: -2, r: -5 }, model: 'hex/building_well_yellow.gltf', rot: 0 },
];
const PROPS: { hex: Hex; model: string; offset: [number, number]; rot: number }[] = [
  { hex: { q: 1, r: -7 }, model: 'hex/wheelbarrow.gltf', offset: [0.75, 0.6], rot: 0.8 },
  { hex: { q: 5, r: -7 }, model: 'hex/sack.gltf', offset: [-0.7, 0.7], rot: 0.3 },
  { hex: { q: 5, r: -7 }, model: 'hex/crate_A_big.gltf', offset: [0.75, 0.65], rot: 0.2 },
  { hex: { q: -2, r: -5 }, model: 'hex/barrel.gltf', offset: [0.6, 0.55], rot: 0 },
];
const TREE_MODELS = [
  'hex/trees_A_medium.gltf',
  'hex/trees_B_large.gltf',
  'hex/tree_single_A.gltf',
  'hex/tree_single_B.gltf',
  'hex/rock_single_A.gltf',
];
const GROUND_RING = 10;
const WATER_RING = 13;
const CROPS_PER_PLOT = 3;

/** 再現性のある乱数（毎回同じ位置に木が生える） */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

interface PlotView {
  root: THREE.Group;
  crops: THREE.Object3D[];
  cropId: CropId | null;
  glow: THREE.Mesh;
}

export type PickResult =
  | { kind: 'plot'; index: number }
  | { kind: 'expand' }
  | { kind: 'market' }
  | { kind: 'none' };

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
  homePosition = new THREE.Vector3();

  private farmIndex = new Map<string, number>();
  private plotViews: PlotView[] = [];
  private cropTemplates = new Map<CropId, THREE.Object3D>();
  private dirtTemplate!: THREE.Object3D;
  private hover: THREE.Mesh;
  private nextPlot: THREE.Mesh;
  private market?: THREE.Object3D;
  private windmillFan?: THREE.Object3D;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private camDist = 16;
  private camDistTarget = 16;
  private zoom = 1;
  private elapsed = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.fog = new THREE.Fog(0xbfe3f2, 45, 110);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa070, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
    sun.shadow.camera.right = sun.shadow.camera.top = 24;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    FARM_HEXES.forEach((h, i) => this.farmIndex.set(hexKey(h), i));

    this.hover = this.hexOutline(0xffffff, 0.9);
    this.nextPlot = this.hexOutline(0xffd75e, 0.9);
    this.scene.add(this.hover, this.nextPlot);
  }

  async load(): Promise<void> {
    await Promise.all([this.buildGround(), this.buildScenery()]);
    this.dirtTemplate = await instance('hex/building_dirt.gltf');
    for (const id of Object.keys(CROPS) as CropId[]) {
      this.cropTemplates.set(id, await instance(CROPS[id].model));
    }
  }

  // ---- 地形と景色 --------------------------------------------------------

  private async buildGround() {
    const place = async (model: string, hexes: Hex[], y: number, tint?: number) => {
      const src = await firstMesh(model);
      const material = (src.material as THREE.MeshStandardMaterial).clone();
      if (tint !== undefined) material.color.set(tint);
      const mesh = new THREE.InstancedMesh(src.geometry, material, hexes.length);
      const m = new THREE.Matrix4();
      hexes.forEach((h, i) => {
        const w = hexToWorld(h);
        mesh.setMatrixAt(i, m.makeTranslation(w.x, y, w.z));
      });
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    const all = spiral(WATER_RING);
    const land = all.filter((h) => hexDistance(h, { q: 0, r: 0 }) <= GROUND_RING);
    const water = all.filter((h) => hexDistance(h, { q: 0, r: 0 }) > GROUND_RING);
    await Promise.all([place('hex/hex_grass.gltf', land, 0, 0xc4e3a6), place('hex/hex_water.gltf', water, -0.12)]);
  }

  private async buildScenery() {
    const occupied = new Set(BUILDINGS.map((b) => hexKey(b.hex)));
    for (const b of BUILDINGS) {
      const obj = await instance(b.model);
      const w = hexToWorld(b.hex);
      obj.position.set(w.x, 0, w.z);
      obj.rotation.y = b.rot;
      this.scene.add(obj);
      if (b.role === 'home') this.homePosition.set(w.x, 0, w.z + 1.1);
      if (b.role === 'market') this.market = obj;
      if (b.role === 'windmill') this.windmillFan = obj.getObjectByName('building_windmill_top_fan_yellow');
    }
    for (const p of PROPS) {
      const obj = await instance(p.model);
      const w = hexToWorld(p.hex);
      obj.position.set(w.x + p.offset[0], 0, w.z + p.offset[1]);
      obj.rotation.y = p.rot;
      obj.scale.setScalar(0.6);
      this.scene.add(obj);
    }

    // 畑の外周に木と岩をまばらに置く（建物の周りと手前側は空ける）
    const rand = seeded(7);
    for (const h of spiral(GROUND_RING)) {
      const d = hexDistance(h, { q: 0, r: 0 });
      if (d <= MAX_FARM_RING + 1 || occupied.has(hexKey(h))) continue;
      const nearBuilding = BUILDINGS.some((b) => hexDistance(b.hex, h) <= 1);
      if (nearBuilding || rand() > (d >= 9 ? 0.75 : 0.35)) continue;
      const w = hexToWorld(h);
      const obj = await instance(TREE_MODELS[Math.floor(rand() * TREE_MODELS.length)]);
      obj.position.set(w.x + (rand() - 0.5) * 0.6, 0, w.z + (rand() - 0.5) * 0.6);
      obj.rotation.y = rand() * Math.PI * 2;
      this.scene.add(obj);
    }

  }

  private hexOutline(color: number, opacity: number): THREE.Mesh {
    const geo = new THREE.RingGeometry(HEX_SIZE * 0.86, HEX_SIZE * 0.98, 6, 1, Math.PI / 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.renderOrder = 2;
    return mesh;
  }

  // ---- 畑の表示を状態に合わせる ----------------------------------------

  plotPosition(index: number): THREE.Vector3 {
    const w = hexToWorld(FARM_HEXES[index]);
    return new THREE.Vector3(w.x, 0, w.z);
  }

  private ensurePlotViews(count: number) {
    while (this.plotViews.length < count) {
      const i = this.plotViews.length;
      const root = new THREE.Group();
      root.position.copy(this.plotPosition(i));
      root.add(this.dirtTemplate.clone(true));
      const glow = this.hexOutline(0xfff3a3, 0.0);
      glow.position.y = 0.08;
      root.add(glow);
      this.scene.add(root);
      this.plotViews.push({ root, crops: [], cropId: null, glow });
    }
  }

  private setCrop(view: PlotView, crop: CropId | null) {
    for (const c of view.crops) view.root.remove(c);
    view.crops = [];
    view.cropId = crop;
    if (!crop) return;
    const template = this.cropTemplates.get(crop)!;
    for (let k = 0; k < CROPS_PER_PLOT; k++) {
      const c = template.clone(true);
      const a = Math.PI / 2 + (k * Math.PI * 2) / CROPS_PER_PLOT;
      c.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
      c.rotation.y = k * 2.1 + view.root.position.x;
      view.root.add(c);
      view.crops.push(c);
    }
  }

  update(dt: number, s: GameState) {
    this.elapsed += dt;
    this.ensurePlotViews(s.plots.length);

    s.plots.forEach((p, i) => {
      const view = this.plotViews[i];
      if (view.cropId !== p.crop) this.setCrop(view, p.crop);
      if (!p.crop) {
        view.glow.visible = false;
        return;
      }
      const def = CROPS[p.crop];
      const ripe = isRipe(p);
      const grow = 0.2 + 0.8 * growthRatio(p);
      view.crops.forEach((c, k) => {
        const bob = ripe ? Math.abs(Math.sin(this.elapsed * 3 + i + k)) * 0.05 : 0;
        const scale = def.scale * grow * (ripe ? 1.06 : 1);
        c.scale.setScalar(scale);
        c.position.y = -def.sink * (scale / def.scale) + bob;
      });
      view.glow.visible = ripe;
      (view.glow.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.elapsed * 4) * 0.25;
    });

    // 次に買える区画を点滅させる
    if (s.plots.length < FARM_HEXES.length) {
      this.nextPlot.visible = true;
      this.nextPlot.position.copy(this.plotPosition(s.plots.length)).setY(0.02);
      (this.nextPlot.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.elapsed * 3) * 0.25;
    } else {
      this.nextPlot.visible = false;
    }

    if (this.windmillFan) this.windmillFan.rotation.z += dt * 0.8;

    // 畑が広がるとカメラが引く
    const farmRing = hexDistance(FARM_HEXES[s.plots.length - 1], { q: 0, r: 0 });
    this.camDistTarget = (19 + farmRing * 3.2) * this.zoom;
    this.camDist += (this.camDistTarget - this.camDist) * Math.min(1, dt * 3);
    const target = new THREE.Vector3(0, 0, -2.4);
    this.camera.position.set(target.x, target.y + this.camDist * 0.82, target.z + this.camDist * 0.62);
    this.camera.lookAt(target);

    this.renderer.render(this.scene, this.camera);
  }

  zoomBy(delta: number) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * (delta > 0 ? 1.1 : 1 / 1.1), 0.55, 1.6);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  // ---- クリック判定 ------------------------------------------------------

  private toNdc(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  pick(clientX: number, clientY: number, s: GameState): PickResult {
    this.raycaster.setFromCamera(this.toNdc(clientX, clientY), this.camera);
    if (this.market && this.raycaster.intersectObject(this.market, true).length) return { kind: 'market' };
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return { kind: 'none' };
    const index = this.farmIndex.get(hexKey(worldToHex(hit.x, hit.z)));
    if (index === undefined) return { kind: 'none' };
    if (index < s.plots.length) return { kind: 'plot', index };
    if (index === s.plots.length) return { kind: 'expand' };
    return { kind: 'none' };
  }

  setHover(index: number | null) {
    this.hover.visible = index !== null;
    if (index !== null) this.hover.position.copy(this.plotPosition(index)).setY(0.1);
  }

  /** 3D座標を画面上のピクセル位置に変換（収穫時の浮き文字用） */
  toScreen(pos: THREE.Vector3): { x: number; y: number } {
    const v = pos.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }
}
