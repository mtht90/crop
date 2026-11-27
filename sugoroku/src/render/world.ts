// 3D の世界：浮島の盤面、建物、駒、サイコロ、演出。素材はすべて KayKit（public/models/）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as CANNON from 'cannon-es';
import { GROUPS, PLAYER_KEYS, TILES } from '../data/defs.ts';
import type { StageDef, TileState } from '../game/types.ts';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();
const animCache = new Map<string, Promise<THREE.AnimationClip[]>>();
/** 公開版（claude.ai のページ）では data: URL の読み込みが禁止されているため、
 *  モデルを GLB の base64 を包んだ .json として配信し、ここで復元して読み込む */
const HOSTED = (window as unknown as { MODEL_JSON?: boolean }).MODEL_JSON === true;
async function loadGltf(path: string) {
  if (!HOSTED) return loader.loadAsync(`./models/${path}`);
  const url = `./models/${path.replace(/\.(gltf|glb)$/, '.json')}`;
  const { glb } = (await (await fetch(url)).json()) as { glb: string };
  const bin = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
  return loader.parseAsync(bin.buffer, url.slice(0, url.lastIndexOf('/') + 1));
}
const fbxLoader = new FBXLoader();
async function loadFbx(path: string): Promise<THREE.Group> {
  if (!HOSTED) return fbxLoader.loadAsync(`./models/${path}`);
  const url = `./models/${path.replace(/\.fbx$/, '.json')}`;
  const { fbx } = (await (await fetch(url)).json()) as { fbx: string };
  const bin = Uint8Array.from(atob(fbx), (c) => c.charCodeAt(0));
  return fbxLoader.parse(bin.buffer, url.slice(0, url.lastIndexOf('/') + 1));
}
/** 同じテクスチャ・同じ材質を全モデルで使い回す（スマホのGPUメモリ不足で真っ黒になるのを防ぐ） */
const sharedTextures = new Map<string, THREE.Texture>();
const sharedMaterials = new Map<string, THREE.Material>();
THREE.Cache.enabled = true; // 同じ画像ファイルは1回だけ読み込む（画像オブジェクトも同じになる）
const imageIds = new WeakMap<object, string>();
function textureKey(t: THREE.Texture) {
  const img = t.image as { src?: string } | undefined;
  if (img?.src) return img.src;
  if (img && typeof img === 'object') {
    if (!imageIds.has(img)) imageIds.set(img, THREE.MathUtils.generateUUID());
    return imageIds.get(img)!;
  }
  return t.uuid;
}
function shareMaterial(mat: THREE.MeshStandardMaterial): THREE.Material {
  if (Array.isArray(mat)) return mat;
  let mapKey = '';
  if (mat.map) {
    mapKey = textureKey(mat.map);
    const shared = sharedTextures.get(mapKey);
    if (shared && shared !== mat.map) {
      mat.map.dispose();
      mat.map = shared;
    } else sharedTextures.set(mapKey, mat.map);
  }
  const key = `${mat.type}|${mat.name}|${mapKey}|${mat.color?.getHexString()}|${mat.roughness}|${mat.metalness}|${mat.transparent}`;
  const found = sharedMaterials.get(key);
  if (found) {
    if (found !== mat) mat.dispose();
    return found;
  }
  sharedMaterials.set(key, mat);
  return mat;
}
export function loadModel(path: string): Promise<THREE.Group> {
  if (!cache.has(path)) {
    cache.set(
      path,
      loadGltf(path).then((g) => {
        g.scene.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            m.material = shareMaterial(m.material as THREE.MeshStandardMaterial);
          }
        });
        return g.scene;
      }),
    );
  }
  return cache.get(path)!;
}
function loadClips(path: string) {
  if (!animCache.has(path)) animCache.set(path, loadGltf(path).then((g) => g.animations));
  return animCache.get(path)!;
}
async function inst(path: string) {
  return (await loadModel(path)).clone(true);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const easeOutBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// 六角座標（頂点が上下にある向き）
const DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const hexDist = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;
const PATH_R = 5;
const ARENA_HEX: [number, number] = [-1, 2]; // 王城の手前の広場

/** 土地レベルごとの建物。2段階目はマスごとの特色ある建物にする */
const SIGNATURE: Record<number, string> = {
  2: 'building_windmill', 4: 'building_watermill', 6: 'building_lumbermill', 11: 'building_tavern', 16: 'building_blacksmith',
  18: 'building_mine', 19: 'building_barracks', 21: 'building_archeryrange', 26: 'building_church', 28: 'building_market',
};
function buildingModel(i: number, level: number, owner: number): string | null {
  const c = PLAYER_KEYS[owner];
  if (level <= 0) return null;
  if (level === 1) return `hex/building_home_A_${c}.gltf`;
  if (level === 2) return `hex/${SIGNATURE[i] ?? 'building_home_B'}_${c}.gltf`;
  if (level === 3) return `hex/building_tower_A_${c}.gltf`;
  return `hex/building_castle_${c}.gltf`;
}
const SPECIAL_MODEL: Record<string, string> = {
  start: 'hex/wall_straight_gate.gltf',
  tavern: 'hex/tent.gltf',
  dungeon: 'hex/building_destroyed.gltf',
  jackpot: '',
  cathedral: 'hex/building_church_blue.gltf',
  portal: 'hex/building_tower_B_blue.gltf',
  shrine: 'hex/building_well_blue.gltf',
  event: 'hex/building_stage_A.gltf',
  tax: 'hex/building_tower_catapult_red.gltf',
};

interface Piece {
  root: THREE.Object3D;
  hero: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
  pos: number;
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  labels: HTMLDivElement;
  private clock = new THREE.Clock();
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private island = new THREE.Group();
  private tileTop = 0;
  private s = 1; // 六角の大きさ（中心から頂点）
  pathPos: THREE.Vector3[] = [];
  plotPos: THREE.Vector3[] = [];
  private pathHex: [number, number][] = [];
  private extras: THREE.Object3D[][] = [];
  private tileKey: string[] = [];
  private highlight: THREE.Mesh[] = [];
  private hexGeo: THREE.BufferGeometry | null = null;
  private pieces: Piece[] = [];
  private tweens: ((dt: number) => boolean)[] = [];
  private focus = new THREE.Vector3();
  private focusGoal = new THREE.Vector3();
  private camOffset = new THREE.Vector3(0, 26, 24);
  private userOrbiting = 0;
  private ambientFx: THREE.Points | null = null;
  private labelEls: HTMLDivElement[] = [];
  private shake = 0;
  speed = 1;
  quality: 'high' | 'low' = 'high';
  onTileClick: ((i: number) => void) | null = null;
  onTileHover: ((i: number | null, x: number, y: number) => void) | null = null;
  private raycaster = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  diceModel = 'D6_A';
  private dice: THREE.Object3D[] = [];

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    host.appendChild(this.renderer.domElement);
    this.labels = document.createElement('div');
    this.labels.className = 'labels';
    host.appendChild(this.labels);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = 1.25;
    this.controls.minPolarAngle = 0.35;
    this.controls.addEventListener('start', () => (this.userOrbiting = 4));
    this.camera.position.copy(this.camOffset);
    this.controls.target.set(0, 0, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    this.hemi = new THREE.HemisphereLight('#e4f2ff', '#5d7a45', 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d8', 1.7);
    this.sun.position.set(-18, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.island);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      this.renderer.setSize(w, h);
      const aspect = w / h;
      this.camera.aspect = aspect;
      // 盤面（半径約14）が画面に収まる距離を求める。縦長の画面では画角を広げて引く
      this.camera.fov = aspect < 1 ? 50 : 40;
      const v = THREE.MathUtils.degToRad(this.camera.fov / 2);
      const hz = Math.atan(Math.tan(v) * aspect);
      const R = 14;
      const dist = Math.max(R / Math.tan(hz), (R * 0.82) / Math.tan(v)) * (aspect < 1 ? 1.0 : 1.02);
      this.camOffset.set(0, 26, 24).normalize().multiplyScalar(dist);
      this.controls.maxDistance = dist * 1.6;
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(host);
    resize();

    const ndc = (e: PointerEvent) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    let down: { x: number; y: number } | null = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      const i = this.pick(ndc(e));
      if (i !== null) this.onTileClick?.(i);
      else this.onTileHover?.(null, 0, 0);
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const i = this.pick(ndc(e));
      this.onTileHover?.(i, e.clientX, e.clientY);
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private pick(v: THREE.Vector2): number | null {
    this.raycaster.setFromCamera(v, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    if (!hit) return null;
    let o: THREE.Object3D | null = hit.object;
    while (o && o.userData.tile === undefined) o = o.parent;
    return o ? (o.userData.tile as number) : null;
  }

  private axial(q: number, r: number) {
    return new THREE.Vector3(this.s * Math.sqrt(3) * (q + r / 2), 0, this.s * 1.5 * r);
  }
  private ring(radius: number): [number, number][] {
    const out: [number, number][] = [];
    let q = DIRS[4][0] * radius;
    let r = DIRS[4][1] * radius;
    for (let side = 0; side < 6; side++) {
      for (let k = 0; k < radius; k++) {
        out.push([q, r]);
        q += DIRS[side][0];
        r += DIRS[side][1];
      }
    }
    return out;
  }

  // ---------- 盤面を作る ----------
  async build(stage: StageDef) {
    this.island.clear();
    this.pickables = [];
    this.labels.innerHTML = '';
    this.labelEls = [];
    const pal = stage.palette;
    const sky = document.createElement('canvas');
    sky.width = 2;
    sky.height = 256;
    const g = sky.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, pal.skyTop);
    grad.addColorStop(1, pal.skyBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(sky);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    this.scene.fog = new THREE.Fog(pal.fog, 70, 150);
    this.hemi.color.set(pal.ambient);
    this.sun.color.set(pal.sun);
    const dark = stage.id === 'volcano';
    this.hemi.intensity = dark ? 0.55 : 0.75;
    this.sun.intensity = dark ? 1.4 : 1.7;

    const probe = await loadModel('hex/hex_grass.gltf');
    const box = new THREE.Box3().setFromObject(probe);
    const size = box.getSize(new THREE.Vector3());
    this.s = size.z / 2;
    this.tileTop = box.max.y;
    this.hexGeo = (probe.children[0] as THREE.Mesh).geometry;

    this.pathHex = this.ring(PATH_R);
    const pathSet = new Set(this.pathHex.map(([q, r]) => `${q},${r}`));
    const plots: [number, number][] = this.pathHex.map(([q, r]) => {
      const here = this.axial(q, r);
      let best: [number, number] = [q, r];
      let bestDot = -Infinity;
      for (const [dq, dr] of DIRS) {
        const n: [number, number] = [q + dq, r + dr];
        if (hexDist(...n) !== PATH_R + 1) continue;
        const dot = this.axial(...n).sub(here).normalize().dot(here.clone().normalize());
        if (dot > bestDot + 1e-6) {
          bestDot = dot;
          best = n;
        }
      }
      return best;
    });
    const plotSet = new Set(plots.map(([q, r]) => `${q},${r}`));
    this.pathPos = this.pathHex.map(([q, r]) => this.axial(q, r).setY(this.tileTop + 0.15));
    this.plotPos = plots.map(([q, r]) => this.axial(q, r).setY(this.tileTop));

    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const jobs: Promise<void>[] = [];
    const add = (path: string, pos: THREE.Vector3, rot = 0, scale = 1, parent: THREE.Object3D = this.island) =>
      jobs.push(
        inst(path).then((o) => {
          o.position.copy(pos);
          o.rotation.y = rot;
          o.scale.setScalar(scale);
          parent.add(o);
        }),
      );
    const snow = stage.id === 'snow';
    const treeA = snow ? 'hex/trees_B_medium.gltf' : 'hex/trees_A_medium.gltf';
    for (let q = -8; q <= 8; q++) {
      for (let r = -8; r <= 8; r++) {
        const d = hexDist(q, r);
        if (d > 7) continue;
        const key = `${q},${r}`;
        if (pathSet.has(key)) continue;
        const p = this.axial(q, r);
        const top = p.clone().setY(this.tileTop);
        const arena = hexDist(q - ARENA_HEX[0], r - ARENA_HEX[1]) <= 1; // サイコロを振る広場
        const isWater = d === 2 && (q + 2 * r) % 3 !== 0 && !arena;
        add(isWater ? 'hex/hex_water.gltf' : 'hex/hex_grass.gltf', p);
        if (d === 7) add('hex/hex_grass_bottom.gltf', p.clone().setY(-size.y * 0.98));
        if (plotSet.has(key) || d <= 1 || isWater || arena) continue;
        const roll = rnd();
        if (d === 2 || d === 3) {
          if (roll < 0.3) add(treeA, top, rnd() * 6);
          else if (roll < 0.45) add('hex/hills_B_trees.gltf', top, rnd() * 6);
          else if (roll < 0.58) add('hex/mountain_A_grass_trees.gltf', top, rnd() * 6);
        } else if (d === 4) {
          if (roll < 0.18) add('hex/tree_single_A.gltf', top, rnd() * 6);
          else if (roll < 0.26) add('hex/rock_single_B.gltf', top, rnd() * 6);
        } else if (d >= 6) {
          if (roll < 0.3) add('hex/trees_B_large.gltf', top, rnd() * 6);
          else if (roll < 0.42) add('hex/mountain_B_grass_trees.gltf', top, rnd() * 6);
          else if (roll < 0.5) add('hex/rock_single_C.gltf', top, rnd() * 6);
        }
      }
    }
    // 雲
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + rnd();
      const R = 28 + rnd() * 10;
      add(rnd() < 0.5 ? 'hex/cloud_big.gltf' : 'hex/cloud_small.gltf', new THREE.Vector3(Math.cos(a) * R, -4 + rnd() * 7, Math.sin(a) * R), rnd() * 6, 2 + rnd() * 2);
    }

    // 道（30マス）
    const deg = (from: THREE.Vector3, to: THREE.Vector3) => (Math.round((Math.atan2(-(to.z - from.z), to.x - from.x) * 180) / Math.PI / 60) * 60 + 360) % 360;
    this.extras = TILES.map(() => []);
    this.tileKey = TILES.map(() => '');
    this.highlight = [];
    this.pathPos.forEach((p, i) => {
      const prev = this.pathPos[(i + 29) % 30];
      const next = this.pathPos[(i + 1) % 30];
      const a1 = deg(p, prev);
      const a2 = deg(p, next);
      let model = 'hex/hex_road_A.gltf';
      let rot = a1;
      if ((a2 - a1 + 360) % 360 !== 180) {
        model = 'hex/hex_road_B.gltf';
        rot = (a1 - 180 + 360) % 360;
        if ((60 + rot) % 360 !== a2) rot = (a2 - 180 + 360) % 360;
      }
      const holder = new THREE.Group();
      holder.userData.tile = i;
      this.island.add(holder);
      this.pickables.push(holder);
      jobs.push(
        inst(model).then((o) => {
          o.position.set(p.x, 0.15, p.z);
          o.rotation.y = (rot * Math.PI) / 180;
          holder.add(o);
        }),
      );
      // 土地側も選べるようにする
      const plotHolder = new THREE.Group();
      plotHolder.userData.tile = i;
      this.island.add(plotHolder);
      this.pickables.push(plotHolder);
      plotHolder.position.copy(this.plotPos[i]);
      plotHolder.userData.plot = true;
      this.extras[i].push(plotHolder);
      // 選択用の光る六角
      const hl = new THREE.Mesh(this.hexGeo!, new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true, opacity: 0, depthWrite: false }));
      hl.position.set(p.x, 0.17, p.z);
      hl.scale.set(0.96, 1.02, 0.96);
      hl.visible = false;
      this.island.add(hl);
      this.highlight.push(hl);

      const def = TILES[i];
      const face = Math.atan2(p.x - this.plotPos[i].x, p.z - this.plotPos[i].z);
      if (def.kind !== 'prop') {
        if (def.kind === 'jackpot') {
          for (let n = 0; n < 7; n++) add('bits/coin_10_gold.gltf', this.plotPos[i].clone().add(new THREE.Vector3((rnd() - 0.5) * 1.1, 0, (rnd() - 0.5) * 1.1)), rnd() * 6, 0.9);
          add('hex/bucket_water.gltf', this.plotPos[i].clone().add(new THREE.Vector3(0.4, 0, -0.3)), 0, 1.2);
        } else {
          add(SPECIAL_MODEL[def.kind], this.plotPos[i], face, def.kind === 'start' ? 0.9 : 1);
          if (def.kind === 'tavern') {
            add('hex/barrel.gltf', this.plotPos[i].clone().add(new THREE.Vector3(0.55, 0, 0.35)), 0, 1.2);
            add('hex/crate_A_small.gltf', this.plotPos[i].clone().add(new THREE.Vector3(-0.5, 0, 0.4)), 0.4, 1.2);
          }
        }
      }
      this.makeLabel(i);
    });
    await Promise.all(jobs);
    await this.buildCenter();
    this.makeAmbient(stage);
    this.focus.set(0, 0, 0);
    this.focusGoal.set(0, 0, 0);
  }

  private makeAmbient(stage: StageDef) {
    if (this.ambientFx) this.scene.remove(this.ambientFx);
    const n = 260;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos[k * 3] = (Math.random() - 0.5) * 50;
      pos[k * 3 + 1] = Math.random() * 20;
      pos[k * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = { pollen: '#fff6b0', snow: '#ffffff', ember: '#ff9a4a', stars: '#fff0ff' }[stage.palette.particle];
    const mat = new THREE.PointsMaterial({ color, size: stage.palette.particle === 'snow' ? 0.18 : 0.1, transparent: true, opacity: 0.8, depthWrite: false });
    this.ambientFx = new THREE.Points(geo, mat);
    this.ambientFx.userData.kind = stage.palette.particle;
    this.scene.add(this.ambientFx);
  }

  private makeLabel(i: number) {
    const def = TILES[i];
    const el = document.createElement('div');
    el.className = `tile-label kind-${def.kind}`;
    if (def.kind === 'prop') el.style.setProperty('--group', GROUPS[def.group!].color);
    el.dataset.tile = String(i);
    this.labels.appendChild(el);
    this.labelEls[i] = el;
  }
  /** ラベルの中身（UI側が決める） */
  setLabel(i: number, html: string, cls = '') {
    const el = this.labelEls[i];
    if (!el) return;
    el.innerHTML = html;
    el.classList.toggle('owned', cls.includes('owned'));
    el.classList.toggle('hot', cls.includes('hot'));
    el.classList.toggle('dragon', cls.includes('dragon'));
    el.classList.toggle('festival', cls.includes('festival'));
    for (let k = 0; k < 4; k++) el.classList.toggle(`owner-${k}`, cls.includes(`owner-${k}`));
  }

  // ---------- 建物 ----------
  async setTile(i: number, t: TileState, animate: boolean) {
    const key = `${t.owner}:${t.level}:${t.festival > 0}:${t.dragon > 0}`;
    if (this.tileKey[i] === key) return;
    const prevLevel = Number(this.tileKey[i].split(':')[1] ?? 0);
    this.tileKey[i] = key;
    const holder = this.extras[i][0];
    holder.clear();
    const def = TILES[i];
    if (def.kind !== 'prop') return;
    const face = Math.atan2(this.pathPos[i].x - this.plotPos[i].x, this.pathPos[i].z - this.plotPos[i].z);
    const parts: THREE.Object3D[] = [];
    if (t.owner === null) {
      parts.push(await inst('hex/building_dirt.gltf'));
    } else {
      const model = buildingModel(i, t.level, t.owner);
      if (model) parts.push(await inst(model));
      else {
        const dirt = await inst('hex/building_dirt.gltf');
        parts.push(dirt);
      }
      const flag = await inst(`hex/flag_${PLAYER_KEYS[t.owner]}.gltf`);
      flag.position.set(0.62, 0, 0.3);
      flag.scale.setScalar(0.9);
      parts.push(flag);
      if (t.festival > 0) {
        for (let k = 0; k < 4; k++) {
          const f = await inst(`hex/flag_${PLAYER_KEYS[k]}.gltf`);
          const a = (k / 4) * Math.PI * 2 + 0.4;
          f.position.set(Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78);
          f.scale.setScalar(0.7);
          parts.push(f);
        }
      }
    }
    const group = new THREE.Group();
    group.rotation.y = face;
    for (const p of parts) group.add(p);
    if (t.dragon > 0) {
      group.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.material = (m.material as THREE.MeshStandardMaterial).clone();
          (m.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.45);
          (m.material as THREE.MeshStandardMaterial).emissive = new THREE.Color('#5a1200');
        }
      });
    }
    holder.add(group);
    if (animate) {
      const grow = t.level >= prevLevel;
      const dur = 0.6;
      let k = 0;
      group.scale.setScalar(0.01);
      this.tweens.push((dt) => {
        k = Math.min(1, k + dt / dur);
        group.scale.setScalar(Math.max(0.01, grow ? easeOutBack(k) : 1 - (1 - k) * 0.3));
        return k < 1;
      });
      if (t.level > prevLevel) this.burst(this.plotPos[i].clone().setY(this.tileTop + 0.5), 14, t.owner ?? 0);
    }
  }

  // ---------- 駒 ----------
  async addPieces(models: string[]) {
    for (const p of this.pieces) this.scene.remove(p.root);
    this.pieces = [];
    const general = await loadClips('adv/Rig_Medium_General.glb');
    const move = await loadClips('adv/Rig_Medium_MovementBasic.glb');
    const clips = [...general, ...move];
    for (let k = 0; k < models.length; k++) {
      const src = await loadModel(`adv/${models[k]}.glb`);
      const hero = skeletonClone(src);
      hero.scale.setScalar(0.82);
      hero.position.y = 0.12;
      const stand = await inst(`bits/playerstand_${PLAYER_KEYS[k]}.gltf`);
      stand.scale.setScalar(1.5);
      const root = new THREE.Group();
      root.add(stand, hero);
      this.scene.add(root);
      const mixer = new THREE.AnimationMixer(hero);
      const actions: Record<string, THREE.AnimationAction> = {};
      for (const c of clips) actions[c.name] = mixer.clipAction(c);
      const piece: Piece = { root, hero, mixer, actions, current: null, pos: 0 };
      this.pieces.push(piece);
      this.playAnim(k, 'Idle_A');
      mixer.setTime(k * 0.5);
    }
    this.layoutPieces();
  }
  setPieceVisible(k: number, v: boolean) {
    if (this.pieces[k]) this.pieces[k].root.visible = v;
  }
  playAnim(k: number, name: string, once = false) {
    const p = this.pieces[k];
    const a = p?.actions[name];
    if (!a) return;
    if (p.current === a && !once) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    if (p.current) p.current.crossFadeTo(a, 0.15, false);
    a.play();
    p.current = a;
    if (once) {
      const onDone = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== a) return;
        p.mixer.removeEventListener('finished', onDone);
        this.playAnim(k, 'Idle_A');
      };
      p.mixer.addEventListener('finished', onDone);
    }
  }
  /** 同じマスに複数いるときは少しずらして並べる */
  private slot(k: number) {
    const here = this.pieces.filter((p, j) => p.root.visible && p.pos === this.pieces[k].pos && j <= k).length - 1;
    const total = this.pieces.filter((p) => p.root.visible && p.pos === this.pieces[k].pos).length;
    const base = this.pathPos[this.pieces[k].pos].clone();
    if (total <= 1) return base;
    const a = (here / total) * Math.PI * 2;
    return base.add(new THREE.Vector3(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45));
  }
  layoutPieces(except = -1) {
    this.pieces.forEach((p, k) => {
      if (k === except) return;
      const to = this.slot(k);
      p.root.position.copy(to);
      this.faceAlong(k);
    });
  }
  private faceAlong(k: number) {
    const p = this.pieces[k];
    const next = this.pathPos[(p.pos + 1) % 30];
    p.hero.rotation.y = Math.atan2(next.x - p.root.position.x, next.z - p.root.position.z);
  }
  setPiecePos(k: number, pos: number) {
    this.pieces[k].pos = pos;
    this.layoutPieces();
  }
  /** 1マスずつ跳ねながら進む */
  async movePiece(k: number, path: number[], onStep?: (i: number) => void) {
    const p = this.pieces[k];
    const hop = 0.34 / this.speed;
    this.playAnim(k, 'Jump_Idle');
    for (const i of path) {
      const from = p.root.position.clone();
      p.pos = i;
      const to = this.pathPos[i].clone();
      p.hero.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      await this.animate(hop, (t) => {
        const e = easeInOut(t);
        p.root.position.lerpVectors(from, to, e);
        p.root.position.y = from.y + Math.sin(Math.PI * t) * 0.9;
      });
      onStep?.(i);
      this.focusOn(to, false);
    }
    this.playAnim(k, 'Idle_A');
    this.layoutPieces();
  }
  async warpPiece(k: number, to: number) {
    const p = this.pieces[k];
    const from = p.root.position.clone();
    await this.animate(0.35 / this.speed, (t) => {
      p.root.position.y = from.y + t * 6;
      p.root.scale.setScalar(1 - t * 0.7);
    });
    p.pos = to;
    const dest = this.pathPos[to].clone();
    p.root.position.set(dest.x, dest.y + 6, dest.z);
    this.focusOn(dest, true);
    await this.animate(0.4 / this.speed, (t) => {
      p.root.position.y = dest.y + (1 - t) * 6;
      p.root.scale.setScalar(0.3 + t * 0.7);
    });
    p.root.scale.setScalar(1);
    this.layoutPieces();
  }
  pieceWorld(k: number) {
    return this.pieces[k].root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
  }

  // ---------- サイコロ ----------
  /** 物理演算で転がし、指定の目が上になるように見せる */
  async rollDice(values: number[]) {
    for (const d of this.dice) this.scene.remove(d);
    this.dice = [];
    const SCALE = 1.7;
    const half = 0.375 * SCALE;
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) });
    world.allowSleep = true;
    const mat = new CANNON.Material('m');
    world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.25, restitution: 0.35 }));
    const ground = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.y = this.tileTop;
    world.addBody(ground);
    const R = 1.9;
    const A = this.arena;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const wall = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Box(new CANNON.Vec3(2.5, 4, 0.2)) });
      wall.position.set(A.x + Math.cos(a) * R, this.tileTop + 4, A.z + Math.sin(a) * R);
      wall.quaternion.setFromEuler(0, -a + Math.PI / 2, 0);
      world.addBody(wall);
    }
    const bodies = values.map((_, k) => {
      const b = new CANNON.Body({ mass: 1, material: mat, shape: new CANNON.Box(new CANNON.Vec3(half, half, half)), sleepSpeedLimit: 0.15 });
      const side = k - (values.length - 1) / 2;
      b.position.set(A.x - 0.9 + side * 0.8, this.tileTop + 3 + k * 0.4, A.z + 1.2);
      b.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.velocity.set(2.5 + Math.random() * 2, 2 + Math.random(), -3.5 - Math.random() * 2);
      b.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
      world.addBody(b);
      return b;
    });
    const frames: { p: THREE.Vector3; q: THREE.Quaternion }[][] = values.map(() => []);
    const hits: number[] = [];
    let prevVel = bodies.map(() => 0);
    for (let step = 0; step < 60 * 5; step++) {
      world.step(1 / 60);
      bodies.forEach((b, k) => {
        frames[k].push({ p: new THREE.Vector3(b.position.x, b.position.y, b.position.z), q: new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w) });
        const v = b.velocity.length();
        if (prevVel[k] - v > 3) hits.push(step);
        prevVel[k] = v;
      });
      if (step > 40 && bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING)) break;
    }
    // 最後に上を向いた面を、狙った目の面に差し替える回転を求める
    const FACE: Record<number, THREE.Vector3> = {
      2: new THREE.Vector3(1, 0, 0), 5: new THREE.Vector3(-1, 0, 0), 6: new THREE.Vector3(0, 1, 0),
      1: new THREE.Vector3(0, -1, 0), 3: new THREE.Vector3(0, 0, 1), 4: new THREE.Vector3(0, 0, -1),
    };
    const meshes = await Promise.all(values.map(() => inst(`bits/${this.diceModel}.gltf`)));
    const fixes = values.map((v, k) => {
      const last = frames[k][frames[k].length - 1].q;
      const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(last.clone().invert());
      // 一番近い軸に丸める
      const axes = Object.values(FACE);
      const axis = axes.reduce((a, b) => (b.dot(upLocal) > a.dot(upLocal) ? b : a), axes[0]);
      return new THREE.Quaternion().setFromUnitVectors(FACE[v], axis);
    });
    meshes.forEach((m) => {
      m.scale.setScalar(SCALE);
      this.scene.add(m);
      this.dice.push(m);
    });
    const total = Math.max(...frames.map((f) => f.length));
    const dur = (total / 60) * (this.speed > 1 ? 0.7 : 1);
    let hitIdx = 0;
    await this.animate(dur, (t) => {
      const f = Math.min(total - 1, Math.floor(t * (total - 1)));
      while (hitIdx < hits.length && hits[hitIdx] <= f) {
        this.onDiceHit?.();
        hitIdx++;
      }
      meshes.forEach((m, k) => {
        const fr = frames[k][Math.min(f, frames[k].length - 1)];
        m.position.copy(fr.p);
        m.quaternion.copy(fr.q).multiply(fixes[k]);
      });
    });
  }
  onDiceHit: (() => void) | null = null;
  clearDice() {
    for (const d of this.dice) this.scene.remove(d);
    this.dice = [];
  }

  // ---------- 演出 ----------
  /** 金貨が from から to へ飛ぶ */
  async coins(from: THREE.Vector3, to: THREE.Vector3, n: number) {
    const src = await loadModel('bits/coin_gold.gltf');
    const list: THREE.Object3D[] = [];
    const dur = 0.7 / Math.min(this.speed, 2);
    const jobs: Promise<void>[] = [];
    for (let k = 0; k < n; k++) {
      const c = src.clone(true);
      c.scale.setScalar(2.2);
      this.scene.add(c);
      list.push(c);
      const delay = (k * 0.05) / this.speed;
      const spread = new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
      const a = from.clone().add(spread);
      const b = to.clone().add(spread.multiplyScalar(0.3));
      c.position.copy(a);
      c.visible = false;
      jobs.push(
        sleep(delay * 1000).then(() =>
          this.animate(dur, (t) => {
            c.visible = true;
            const e = easeInOut(t);
            c.position.lerpVectors(a, b, e);
            c.position.y += Math.sin(Math.PI * t) * 3;
            c.rotation.x = t * 12;
            c.rotation.y = t * 6;
          }).then(() => {
            this.scene.remove(c);
          }),
        ),
      );
    }
    await Promise.all(jobs);
  }
  /** 色付きの小さな立方体をはじけさせる（紙吹雪） */
  async burst(at: THREE.Vector3, n: number, owner = -1) {
    const colors = owner >= 0 ? [PLAYER_KEYS[owner], 'gold'] : ['red', 'blue', 'green', 'yellow', 'gold'];
    const srcs = await Promise.all(colors.map((c) => loadModel(`bits/cube_${c}.gltf`)));
    for (let k = 0; k < n; k++) {
      const c = srcs[k % srcs.length].clone(true);
      c.scale.setScalar(0.25 + Math.random() * 0.25);
      c.position.copy(at);
      this.scene.add(c);
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 5 + Math.random() * 5, (Math.random() - 0.5) * 6);
      const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      let life = 1.4;
      this.tweens.push((dt) => {
        life -= dt;
        v.y -= 14 * dt;
        c.position.addScaledVector(v, dt);
        c.rotation.x += spin.x * dt;
        c.rotation.y += spin.y * dt;
        if (life < 0.4) c.scale.multiplyScalar(0.9);
        if (life <= 0) this.scene.remove(c);
        return life > 0;
      });
    }
  }
  confetti() {
    for (let k = 0; k < 4; k++) this.burst(new THREE.Vector3((Math.random() - 0.5) * 14, 6, (Math.random() - 0.5) * 10), 26);
  }
  shakeCamera(amount = 0.4) {
    this.shake = Math.max(this.shake, amount);
  }

  // ---------- 選択 ----------
  setSelectable(tiles: number[] | null) {
    this.highlight.forEach((h, i) => {
      const on = !!tiles && tiles.includes(i);
      h.visible = on;
    });
    this.labelEls.forEach((el, i) => el?.classList.toggle('selectable', !!tiles && tiles.includes(i)));
  }

  // ---------- カメラ ----------
  focusOn(p: THREE.Vector3, snap = false) {
    this.focusGoal.copy(p).setY(0).multiplyScalar(0.55);
    if (snap) this.focus.copy(this.focusGoal);
  }
  overview() {
    this.focusGoal.set(0, 0, 0);
  }

  // ---------- ループ ----------
  animate(duration: number, fn: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let t = 0;
      fn(0);
      this.tweens.push((dt) => {
        t += dt / Math.max(0.001, duration);
        fn(Math.min(1, t));
        if (t >= 1) resolve();
        return t < 1;
      });
    });
  }

  private frame() {
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    const tdt = Math.min(0.25, raw); // 演出の時間は実時間に合わせる（遅い端末でも長引かない）
    this.tweens = this.tweens.filter((f) => f(tdt));
    for (const p of this.pieces) p.mixer.update(dt);
    this.updateDragon(dt);
    // 選択中のマスを点滅させる
    const pulse = 0.35 + Math.sin(performance.now() / 180) * 0.2;
    for (const h of this.highlight) if (h.visible) (h.material as THREE.MeshBasicMaterial).opacity = pulse;
    if (this.ambientFx) {
      const pos = this.ambientFx.geometry.attributes.position as THREE.BufferAttribute;
      const kind = this.ambientFx.userData.kind;
      for (let k = 0; k < pos.count; k++) {
        let y = pos.getY(k) + (kind === 'snow' ? -1.2 : kind === 'ember' ? 0.9 : 0.15) * dt;
        if (y < -2) y = 18;
        if (y > 20) y = -1;
        pos.setY(k, y);
        pos.setX(k, pos.getX(k) + Math.sin(performance.now() / 1500 + k) * 0.004);
      }
      pos.needsUpdate = true;
    }
    // カメラ：注目点に寄せる（ユーザーが回したら少し待つ）
    if (this.userOrbiting > 0) this.userOrbiting -= dt;
    this.focus.lerp(this.focusGoal, 1 - Math.pow(0.02, dt));
    if (this.userOrbiting <= 0) {
      const goal = this.focus.clone().add(this.camOffset);
      this.camera.position.lerp(goal, 1 - Math.pow(0.08, dt));
      this.controls.target.lerp(this.focus, 1 - Math.pow(0.02, dt));
    }
    this.controls.update();
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  private updateLabels() {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    this.labelEls.forEach((el, i) => {
      if (!el) return;
      v.copy(this.plotPos[i]).setY(this.tileTop + 1.9);
      v.project(this.camera);
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      el.style.display = v.z < 1 ? '' : 'none';
    });
  }
  /** 3D 座標を画面座標へ */
  toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  tileWorld(i: number) {
    return this.plotPos[i].clone().setY(this.tileTop + 1);
  }
  get centerWorld() {
    return new THREE.Vector3(0, this.tileTop + 1, 0);
  }
  get arena() {
    return this.axial(...ARENA_HEX).setY(this.tileTop);
  }
  get arenaWorld() {
    return this.arena.setY(this.tileTop + 1);
  }

  // ---------- 中央の舞台：王城・財宝・竜 ----------
  private castle = new THREE.Group();
  private castleKey = '';
  private treasure = new THREE.Group();
  private treasureCount = -1;
  private dragon: { root: THREE.Object3D; mixer: THREE.AnimationMixer; fly?: THREE.AnimationAction; attack?: THREE.AnimationAction; busy: boolean; angle: number } | null = null;

  private async buildCenter() {
    this.castleKey = '';
    this.treasureCount = -1;
    this.castle = new THREE.Group();
    this.treasure = new THREE.Group();
    this.island.add(this.castle, this.treasure);
    await this.setLeader(null);
    if (!this.dragon) void this.loadDragon();
  }
  /** 王城は首位のプレイヤーの色に染まる（null なら建設中） */
  async setLeader(owner: number | null) {
    const key = owner === null ? 'none' : PLAYER_KEYS[owner];
    if (key === this.castleKey) return;
    this.castleKey = key;
    const model = owner === null ? 'hex/building_stage_C.gltf' : `hex/building_castle_${key}.gltf`;
    const o = await inst(model);
    if (this.castleKey !== key) return;
    o.scale.setScalar(owner === null ? 1.1 : 1.45);
    o.position.set(0, this.tileTop, 0);
    o.rotation.y = Math.PI / 6;
    this.castle.clear();
    this.castle.add(o);
    if (owner !== null) {
      for (let k = 0; k < 6; k++) {
        const f = await inst(`hex/flag_${key}.gltf`);
        const a = (k / 6) * Math.PI * 2 + 0.3;
        f.position.set(Math.cos(a) * 1.6, this.tileTop, Math.sin(a) * 1.6);
        this.castle.add(f);
      }
      let k = 0;
      o.scale.setScalar(0.01);
      this.tweens.push((dt) => {
        k = Math.min(1, k + dt / 0.7);
        o.scale.setScalar(Math.max(0.01, 1.45 * easeOutBack(k)));
        return k < 1;
      });
      this.burst(new THREE.Vector3(0, this.tileTop + 2.5, 0), 18, owner);
    }
  }
  /** 黄金の泉に貯まった額に応じて、王城の前に財宝を積む */
  async setTreasure(amount: number) {
    const n = Math.max(1, Math.min(14, Math.round(amount / 120)));
    if (n === this.treasureCount) return;
    const grow = n > this.treasureCount;
    this.treasureCount = n;
    const src = await loadModel('bits/coin_10_gold.gltf');
    this.treasure.clear();
    for (let k = 0; k < n; k++) {
      const c = src.clone(true);
      const a = k * 2.399;
      const r = 1.0 + (k % 5) * 0.12;
      c.position.set(Math.cos(a) * r, this.tileTop + Math.floor(k / 5) * 0.12, 1.15 + Math.sin(a) * 0.35);
      c.rotation.y = a;
      c.scale.setScalar(1.2);
      this.treasure.add(c);
    }
    if (grow && n > 1) this.burst(new THREE.Vector3(0, this.tileTop + 0.8, 1.2), 6, -1);
  }
  get treasureWorld() {
    return new THREE.Vector3(0, this.tileTop + 0.8, 1.2);
  }

  private async loadDragon() {
    try {
      const fbx = await loadFbx('monsters/Dragon.fbx');
      fbx.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(fbx, true);
      const size = box.getSize(new THREE.Vector3());
      const holder = new THREE.Group();
      fbx.scale.multiplyScalar(3.2 / Math.max(size.x, size.y, size.z));
      fbx.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.frustumCulled = false; // スキンメッシュの境界がずれて消えるのを防ぐ
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        // 配布元のプレビュー画像と同じ配色にする（FBX の色は暗く書き出されている）
        const PALETTE: Record<string, string> = { Main: '#8c2233', Wings: '#3b2630', Belly: '#e8b54a', Claws: '#2a2224', Eyes: '#151515' };
        m.material = mats.map((src) => new THREE.MeshStandardMaterial({ color: PALETTE[src.name] ?? '#8c2233', roughness: 0.7, metalness: 0, side: THREE.DoubleSide }));
        if (mats.length === 1) m.material = (m.material as THREE.Material[])[0];
      });
      holder.add(fbx);
      this.scene.add(holder);
      const mixer = new THREE.AnimationMixer(fbx);
      const clips = (fbx as THREE.Object3D & { animations: THREE.AnimationClip[] }).animations;
      const find = (re: RegExp) => clips.find((c) => re.test(c.name));
      const fly = find(/fly/i) ?? find(/idle/i) ?? clips[0];
      const attack = find(/attack|bite|breath/i) ?? fly;
      const flyA = fly ? mixer.clipAction(fly) : undefined;
      flyA?.play();
      if (this.dragon) this.scene.remove(this.dragon.root);
      this.dragon = { root: holder, mixer, fly: flyA, attack: attack ? mixer.clipAction(attack) : undefined, busy: false, angle: 0 };
    } catch (e) {
      console.warn('竜を読み込めませんでした', e);
    }
  }
  private updateDragon(dt: number) {
    const d = this.dragon;
    if (!d) return;
    d.mixer.update(dt);
    if (d.busy) return;
    d.angle += dt * 0.45;
    const r = 3.3;
    const p = new THREE.Vector3(Math.cos(d.angle) * r, this.tileTop + 4.2 + Math.sin(d.angle * 2) * 0.3, Math.sin(d.angle) * r);
    d.root.position.lerp(p, 1 - Math.pow(0.05, dt));
    d.root.rotation.y = -d.angle; // 進行方向を向く
  }
  /** 竜が土地へ飛んでいき、襲いかかって戻る */
  async dragonStrike(tile: number) {
    const d = this.dragon;
    const target = this.plotPos[tile].clone().setY(this.tileTop + 2.2);
    this.focusOn(target);
    if (!d) {
      this.shakeCamera(0.6);
      return;
    }
    d.busy = true;
    const from = d.root.position.clone();
    const dir = target.clone().sub(from);
    d.root.rotation.y = Math.atan2(dir.x, dir.z);
    await this.animate(0.9 / this.speed, (t) => {
      const e = easeInOut(t);
      d.root.position.lerpVectors(from, target, e);
      d.root.position.y += Math.sin(Math.PI * t) * 2.5;
    });
    if (d.attack && d.attack !== d.fly) {
      d.fly?.fadeOut(0.1);
      d.attack.reset().setLoop(THREE.LoopRepeat, 2).fadeIn(0.1).play();
    }
    this.shakeCamera(0.7);
    this.burst(this.plotPos[tile].clone().setY(this.tileTop + 0.6), 16, -1);
    await sleep(700 / this.speed);
    if (d.attack && d.attack !== d.fly) {
      d.attack.fadeOut(0.2);
      d.fly?.reset().fadeIn(0.2).play();
    }
    const back = target.clone();
    void this.animate(1.2, (t) => {
      d.root.position.lerpVectors(back, new THREE.Vector3(Math.cos(d.angle) * 3.3, this.tileTop + 4.2, Math.sin(d.angle) * 3.3), easeInOut(t));
    }).then(() => (d.busy = false));
  }
}

/** キャラの3Dモデルから肖像画（PNG の data URL）を作る */
export async function heroPortraits(models: Record<string, string>): Promise<Record<string, string>> {
  const size = 256;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a6a', 1.3));
  const key = new THREE.DirectionalLight('#fff2dc', 1.6);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  cam.position.set(0.6, 1.55, 4.2);
  cam.lookAt(0, 1.15, 0);
  const clips = await loadClips('adv/Rig_Medium_General.glb');
  const idle = clips.find((c) => c.name === 'Idle_A');
  const out: Record<string, string> = {};
  for (const [id, model] of Object.entries(models)) {
    const hero = skeletonClone(await loadModel(`adv/${model}.glb`));
    hero.rotation.y = 0.35;
    scene.add(hero);
    if (idle) {
      const m = new THREE.AnimationMixer(hero);
      m.clipAction(idle).play();
      m.update(0.4);
    }
    // KayKit のキャラは高さ約2.5。胸から上を写す
    cam.position.set(0.7, 1.75, 4.6);
    cam.lookAt(0, 1.55, 0);
    r.render(scene, cam);
    out[id] = r.domElement.toDataURL('image/png');
    scene.remove(hero);
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
