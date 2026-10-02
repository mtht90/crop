// Three.js による 3D 描画。ゲーム座標 (x, y) は Three の (x, z) に対応し、1 タイル = 1 ユニット。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TILE, mulberry32 } from '../shared/map.js';
import { HEALTH } from '../shared/constants.js';
import { SURVIVOR_CHARACTERS, KILLER_CHARACTER } from '../shared/characters.js';
import { Particles, softDotTexture } from './particles.js';

const MODEL_NAMES = [
  'survivor_knight',
  'survivor_barbarian',
  'survivor_mage',
  'survivor_rogue',
  'killer_skeleton',
  'killer_axe',
  'generator',
  'hook',
  'pallet',
  'wall',
  'wall_window',
  'fence',
  'locker',
  'exit_gate',
  'hatch_open',
  'hatch_closed',
  'tree_pine_a',
  'tree_pine_b',
  'tree_pine_c',
  'tree_dead_a',
  'tree_dead_b',
  'grave',
  'gravestone',
  'gravemarker',
  'pumpkin',
  'pumpkin_small',
  'lantern',
  'candles',
  'skull_candle',
  'bones',
  'ribcage',
  'barrel',
  'crates',
  'rock',
  'rocks',
  'bench',
  'grass',
  'grass_small',
];

// 画質プリセット
export const QUALITY = {
  high: { pixelRatio: 2, shadow: 2048, bloom: true, grass: 1100 },
  medium: { pixelRatio: 1.5, shadow: 1024, bloom: false, grass: 650 },
  low: { pixelRatio: 1, shadow: 0, bloom: false, grass: 250 },
};

const WALL_H = 1.7; // 壁の高さ (タイル)

// ==================== 視界マスク (全マテリアル共通) ====================
// 視界ポリゴンを上から見た 2D キャンバスに描き、シェーダーでワールド座標から参照して暗くする
const visUniforms = {
  uVisTex: { value: null },
  uMapSize: { value: new THREE.Vector2(64, 44) },
  uDark: { value: 0.2 },
  uPlayer: { value: new THREE.Vector2(-100, -100) },
  uVisOn: { value: 0 },
};

// cutaway: 壁や木などの静的な障害物は、カメラと自分の間にあると網目状に透ける
function patchMaterial(mat, cutaway = false) {
  if (!mat || mat.userData.visPatched) return;
  mat.userData.visPatched = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, visUniforms);
    if (cutaway) shader.defines = { ...(shader.defines || {}), CUTAWAY: '' };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vVisWorld;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
        vec4 visWP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          visWP = instanceMatrix * visWP;
        #endif
        vVisWorld = (modelMatrix * visWP).xyz;`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vVisWorld;\nuniform sampler2D uVisTex;\nuniform vec2 uMapSize;\nuniform float uDark;\nuniform vec2 uPlayer;\nuniform float uVisOn;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        #ifdef CUTAWAY
          vec2 cutD = vVisWorld.xz - uPlayer;
          if (uVisOn > 0.5 && vVisWorld.y > 0.3 && cutD.y > -0.3 && cutD.y < 3.5 && abs(cutD.x) < 1.4 + cutD.y * 0.35) {
            if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
          }
        #endif`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (uVisOn > 0.5) {
          float visV = texture2D(uVisTex, vVisWorld.xz / uMapSize).r;
          gl_FragColor.rgb *= mix(uDark, 1.0, visV);
        }`,
      );
  };
  mat.customProgramCacheKey = () => (cutaway ? 'vis-cut' : 'vis');
  mat.needsUpdate = true;
}

function patchObject(obj, cutaway = false) {
  obj.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => patchMaterial(m, cutaway));
    }
  });
}

// ==================== 素材の読み込み ====================
// FOG_ASSET_FORMAT = 'b64' のときは、GLB を base64 にした .json を自前でデコードする
// (data: URI の fetch を禁止しているホスティングでも動くように)
async function loadGLTF(loader, name) {
  if (window.FOG_ASSET_FORMAT === 'b64') {
    const res = await fetch(`assets/models/${name}.json`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const { glb } = await res.json();
    const bin = atob(glb);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return loader.parseAsync(bytes.buffer, 'assets/models/');
  }
  return loader.loadAsync(`assets/models/${name}.glb`);
}

// 読み込みに失敗したモデルの代わり (試合が止まらないように)
function placeholder(name) {
  const g = new THREE.Group();
  const tall = name.startsWith('survivor') || name.startsWith('killer');
  const mesh = new THREE.Mesh(
    tall ? new THREE.CapsuleGeometry(0.6, 1.4, 4, 8) : new THREE.BoxGeometry(1.5, 1.5, 1.5),
    new THREE.MeshStandardMaterial({ color: name.startsWith('killer') ? 0xaa2222 : 0x888888 }),
  );
  mesh.position.y = tall ? 1.3 : 0.75;
  g.add(mesh);
  return { scene: g, animations: [] };
}

// 地面のテクスチャ (土と草のまだら)
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#2a3423';
  x.fillRect(0, 0, 512, 512);
  const rng = mulberry32(7);
  const blot = (n, colors, rmin, rmax, alpha) => {
    for (let i = 0; i < n; i++) {
      const px = rng() * 512;
      const py = rng() * 512;
      const r = rmin + rng() * (rmax - rmin);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      const col = colors[Math.floor(rng() * colors.length)];
      g.addColorStop(0, col.replace('A', alpha));
      g.addColorStop(1, col.replace('A', 0));
      x.fillStyle = g;
      // 端でつながるように 9 方向に描く
      for (const dx of [-512, 0, 512]) {
        for (const dy of [-512, 0, 512]) {
          x.save();
          x.translate(dx, dy);
          x.fillRect(px - r, py - r, r * 2, r * 2);
          x.restore();
        }
      }
    }
  };
  blot(60, ['rgba(70,55,38,A)', 'rgba(58,46,33,A)'], 30, 90, 0.55);
  blot(80, ['rgba(52,70,40,A)', 'rgba(36,50,30,A)'], 20, 70, 0.5);
  blot(400, ['rgba(20,24,18,A)', 'rgba(90,96,70,A)'], 2, 7, 0.5);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ==================== キャラクター ====================
const SURVIVOR_SCALE = 0.58;
const KILLER_SCALE = 0.74;

class CharacterView {
  constructor(gltf, { killer, axe, blob }) {
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.scale.setScalar(killer ? KILLER_SCALE : SURVIVOR_SCALE);
    this.root.add(this.model);
    this.killer = killer;
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        // キラーの目を光らせる
        if (killer && /Eyes/.test(o.name)) {
          o.material = o.material.clone();
          o.material.emissive = new THREE.Color(0xff2a1a);
          o.material.emissiveIntensity = 4;
        }
      }
    });
    if (axe) {
      const hand = this.model.getObjectByName('handslot.r');
      if (hand) hand.add(axe.clone());
    }
    if (blob) {
      const b = new THREE.Mesh(blob.geo, blob.mat);
      b.position.y = 0.02;
      b.scale.setScalar(killer ? 1.3 : 1);
      this.root.add(b);
      this.blob = b;
    }
    patchObject(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
    this.current = null;
    this.currentName = '';
    this.auraOn = false;
    this.origMats = new Map();
    this.dripT = 0;
  }

  play(name, { once = false, fade = 0.2, speed = 1 } = {}) {
    if (this.currentName === name) {
      if (this.current) this.current.timeScale = speed;
      return;
    }
    const clip = this.clips.get(name) || this.clips.get('Idle');
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.timeScale = speed;
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.enabled = true;
    if (this.current) action.crossFadeFrom(this.current, fade, false);
    action.play();
    this.current = action;
    this.currentName = name;
  }

  setAura(color) {
    const on = !!color;
    if (on === this.auraOn && (!on || this.auraColor === color)) return;
    this.auraOn = on;
    this.auraColor = color;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        if (!this.origMats.has(o)) this.origMats.set(o, o.material);
        o.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthTest: false });
        o.renderOrder = 10;
      } else if (this.origMats.has(o)) {
        o.material = this.origMats.get(o);
        o.renderOrder = 0;
      }
    });
    if (this.blob) this.blob.visible = !on;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}

// ==================== ワールド ====================
export class World3D {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e16);
    this.scene.fog = new THREE.FogExp2(0x0a0e16, 0.022);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.models = new Map();
    this.failed = [];
    this.characters = new Map();
    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
    this.camTarget = new THREE.Vector3();
    this.effects = [];
    this.shake = 0;

    // 月明かり + 環境光
    this.hemi = new THREE.HemisphereLight(0x9fb2e0, 0x2a2018, 1.25);
    this.scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0xc4d2ff, 2.1);
    const sc = moon.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 60;
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.02;
    this.scene.add(moon, moon.target);
    this.moon = moon;
    // 自分の周りの灯り
    this.selfLight = new THREE.PointLight(0xffd2a0, 5, 7, 1.8);
    this.scene.add(this.selfLight);

    // 影が無い画質用の丸影
    this.blob = {
      geo: new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2),
      mat: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    };

    this.dot = softDotTexture();
    this.glow = new Particles(1500, { additive: true, texture: this.dot, vis: visUniforms });
    this.smoke = new Particles(700, { additive: false, texture: this.dot, vis: visUniforms });
    this.scene.add(this.glow.points, this.smoke.points);

    this.menu = null;
    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
  }

  applySettings(s) {
    this.settings = s;
    const q = QUALITY[s.quality] || QUALITY.medium;
    this.q = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    const shadows = q.shadow > 0;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
    }
    this.moon.castShadow = shadows;
    if (shadows && this.moon.shadow.mapSize.x !== q.shadow) {
      this.moon.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.moon.shadow.map) {
        this.moon.shadow.map.dispose();
        this.moon.shadow.map = null;
      }
    }
    for (const c of this.characters.values()) if (c.blob) c.blob.visible = !shadows && !c.auraOn;
    // 明るさ: 露出と視界外の暗さを同時に調整
    const b = s.brightness ?? 0.5;
    this.renderer.toneMappingExposure = 0.95 + b * 0.9;
    visUniforms.uDark.value = 0.12 + b * 0.22;
    this.zoom = s.camera ?? 1;
    this.setupComposer();
    this.resize();
  }

  setupComposer() {
    if (!this.q.bloom) {
      this.composer = null;
      return;
    }
    const target = this.menu && this.menuActive ? this.menu.scene : this.scene;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(target, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    let done = 0;
    await Promise.all(
      MODEL_NAMES.map(async (name) => {
        try {
          this.models.set(name, await loadGLTF(loader, name));
        } catch (e) {
          console.error('model load failed', name, e);
          this.failed.push(name);
          this.models.set(name, placeholder(name));
        }
        done++;
        onProgress?.(done / MODEL_NAMES.length);
      }),
    );
  }

  model(name, cutaway = false) {
    const m = this.models.get(name).scene.clone(true);
    m.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    patchObject(m, cutaway);
    return m;
  }

  // 同じモデルを大量に置くものはインスタンス描画にする
  instanced(name, transforms, { shadow = true, tint = null, cutaway = true, parent = this.mapGroup } = {}) {
    if (!transforms.length) return;
    const src = this.models.get(name).scene;
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      // 透け処理の有無でシェーダーが変わるので、マテリアルは複製して使う
      const material = o.material.clone();
      if (tint !== null) material.color.set(tint);
      const im = new THREE.InstancedMesh(o.geometry, material, transforms.length);
      const local = o.matrixWorld;
      const m = new THREE.Matrix4();
      transforms.forEach((t, i) => {
        m.multiplyMatrices(t, local);
        im.setMatrixAt(i, m);
      });
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.frustumCulled = false;
      patchMaterial(material, cutaway);
      parent.add(im);
    });
  }

  clearMap() {
    if (this.mapGroup) this.scene.remove(this.mapGroup);
    for (const c of this.characters.values()) this.scene.remove(c.root);
    this.characters.clear();
    for (const e of this.effects) this.scene.remove(e.obj, e.light);
    this.effects = [];
    this.glow.clear();
    this.smoke.clear();
  }

  buildMap(map) {
    this.clearMap();
    this.menuActive = false;
    this.setupComposer();
    visUniforms.uVisOn.value = 1;
    this.map = map;
    const group = (this.mapGroup = new THREE.Group());
    this.scene.add(group);
    const rng = mulberry32((map.seed ?? 1) ^ 0x9e3779b9);
    const at = (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? TILE.WALL : map.tiles[y * map.w + x]);
    const T = (x, y, z, ry = 0, s = 1, sy = s, sz = s) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(s, sy, sz),
      );

    // 視界マスク
    this.visScale = 8;
    this.visCanvas = document.createElement('canvas');
    this.visCanvas.width = map.w * this.visScale;
    this.visCanvas.height = map.h * this.visScale;
    this.visCtx = this.visCanvas.getContext('2d', { willReadFrequently: true });
    this.visTex = new THREE.CanvasTexture(this.visCanvas);
    this.visTex.flipY = false;
    this.visTex.minFilter = THREE.LinearFilter;
    this.visTex.magFilter = THREE.LinearFilter;
    visUniforms.uVisTex.value = this.visTex;
    visUniforms.uMapSize.value.set(map.w, map.h);

    // 地面
    const tex = groundTexture();
    tex.repeat.set((map.w + 60) / 7, (map.h + 60) / 7);
    const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: 0x98a08a });
    patchMaterial(groundMat);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.w + 60, map.h + 60), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(map.w / 2, 0, map.h / 2);
    ground.receiveShadow = true;
    group.add(ground);

    const isWall = (x, y) => at(x, y) === TILE.WALL;
    const isBorder = (x, y) => x === 0 || y === 0 || x === map.w - 1 || y === map.h - 1;

    // 壁: 横方向の連続をまとめて 1 枚の壁に。残りは縦方向。外周はフェンス
    const runs = (pred) => {
      const out = [];
      const covered = new Set();
      for (let y = 0; y < map.h; y++) {
        let x = 0;
        while (x < map.w) {
          if (!pred(x, y)) {
            x++;
            continue;
          }
          let x2 = x;
          while (x2 + 1 < map.w && pred(x2 + 1, y)) x2++;
          const len = x2 - x + 1;
          if (len >= 2) {
            out.push({ x: x + len / 2, y: y + 0.5, len, rot: 0 });
            for (let k = x; k <= x2; k++) covered.add(`${k},${y}`);
          }
          x = x2 + 1;
        }
      }
      for (let x = 0; x < map.w; x++) {
        let y = 0;
        while (y < map.h) {
          if (!pred(x, y) || covered.has(`${x},${y}`)) {
            y++;
            continue;
          }
          let y2 = y;
          while (y2 + 1 < map.h && pred(x, y2 + 1) && !covered.has(`${x},${y2 + 1}`)) y2++;
          const len = y2 - y + 1;
          out.push({ x: x + 0.5, y: y + len / 2, len, rot: Math.PI / 2 });
          y = y2 + 1;
        }
      }
      return out;
    };
    const inner = runs((x, y) => isWall(x, y) && !isBorder(x, y));
    this.instanced(
      'wall',
      inner.map((r) => T(r.x, 0, r.y, r.rot, r.len / 4, WALL_H / 4, 1)),
    );
    // 外周のフェンスは 1 枚が 4 タイル分なので区切って並べる
    const fences = [];
    for (const r of runs((x, y) => isWall(x, y) && isBorder(x, y))) {
      const n = Math.max(1, Math.round(r.len / 4));
      const seg = r.len / n;
      for (let i = 0; i < n; i++) {
        const off = -r.len / 2 + seg * (i + 0.5);
        const px = r.rot === 0 ? r.x + off : r.x;
        const py = r.rot === 0 ? r.y : r.y + off;
        fences.push(T(px, 0, py, r.rot, seg / 4, 0.72, 1.4));
      }
    }
    this.instanced('fence', fences);

    // 窓枠
    this.instanced(
      'wall_window',
      map.windows.map((w) => T(w.x + 0.5, 0, w.y + 0.5, w.axis === 'v' ? 0 : Math.PI / 2, 0.25, WALL_H / 4, 1)),
    );

    // 木・墓などの障害物
    const choices = [
      ['tree_pine_a', 0.32, 4],
      ['tree_pine_b', 0.4, 3],
      ['tree_pine_c', 0.42, 3],
      ['tree_dead_a', 0.45, 2],
      ['tree_dead_b', 0.5, 2],
      ['grave', 0.48, 1],
      ['gravestone', 0.6, 1],
      ['crates', 0.42, 1],
      ['barrel', 0.5, 1],
    ];
    const totalW = choices.reduce((s, c) => s + c[2], 0);
    const pick = () => {
      let r = rng() * totalW;
      for (const c of choices) if ((r -= c[2]) <= 0) return c;
      return choices[0];
    };
    const byModel = new Map();
    const put = (name, m) => {
      if (!byModel.has(name)) byModel.set(name, []);
      byModel.get(name).push(m);
    };
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (at(x, y) !== TILE.TREE) continue;
        const [name, s] = pick();
        put(name, T(x + 0.5, 0, y + 0.5, rng() * Math.PI * 2, s * (0.9 + rng() * 0.2)));
      }
    }
    // マップの外側は森
    for (let i = 0; i < 300; i++) {
      const side = Math.floor(rng() * 4);
      const depth = 1.4 + rng() * 10;
      let x;
      let y;
      if (side === 0) [x, y] = [rng() * (map.w + 20) - 10, -depth];
      else if (side === 1) [x, y] = [rng() * (map.w + 20) - 10, map.h + depth];
      else if (side === 2) [x, y] = [-depth, rng() * map.h];
      else [x, y] = [map.w + depth, rng() * map.h];
      const name = ['tree_pine_a', 'tree_pine_b', 'tree_pine_c', 'tree_dead_a'][Math.floor(rng() * 4)];
      put(name, T(x, 0, y, rng() * 6.28, 0.35 + rng() * 0.22));
    }
    // 床の小物と草 (当たり判定なし)
    const decor = ['pumpkin_small', 'candles', 'skull_candle', 'bones', 'ribcage', 'gravemarker', 'rock', 'pumpkin', 'lantern'];
    const decorScale = {
      pumpkin_small: 0.35,
      candles: 0.5,
      skull_candle: 0.35,
      bones: 0.5,
      ribcage: 0.4,
      gravemarker: 0.45,
      rock: 0.8,
      pumpkin: 0.3,
      lantern: 0.4,
    };
    const blocked = new Set();
    for (const list of [map.gens, map.cages, map.lockers, map.pallets, map.windows]) {
      for (const o of list) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) blocked.add(`${o.x + dx},${o.y + dy}`);
    }
    const lanterns = [];
    for (let i = 0; i < 170; i++) {
      const x = Math.floor(rng() * map.w);
      const y = Math.floor(rng() * map.h);
      if (at(x, y) !== TILE.FLOOR || blocked.has(`${x},${y}`)) continue;
      const name = decor[Math.floor(rng() * decor.length)];
      const px = x + 0.2 + rng() * 0.6;
      const py = y + 0.2 + rng() * 0.6;
      put(name, T(px, 0, py, rng() * 6.28, decorScale[name]));
      if ((name === 'lantern' || name === 'skull_candle') && lanterns.length < 10) lanterns.push({ x: px, y: py });
    }
    const grass = [];
    const grassSmall = [];
    for (let i = 0; i < this.q.grass * 2 && grass.length + grassSmall.length < this.q.grass; i++) {
      const x = rng() * map.w;
      const y = rng() * map.h;
      if (at(Math.floor(x), Math.floor(y)) !== TILE.FLOOR || blocked.has(`${Math.floor(x)},${Math.floor(y)}`)) continue;
      (rng() < 0.5 ? grass : grassSmall).push(T(x, 0, y, rng() * 6.28, 0.7 + rng() * 0.8));
    }
    for (const [name, list] of byModel) this.instanced(name, list);
    this.instanced('grass', grass, { shadow: false, tint: 0x4b6b3a, cutaway: false });
    this.instanced('grass_small', grassSmall, { shadow: false, tint: 0x56743e, cutaway: false });
    // ランタンの灯り (数を絞って負荷を抑える)
    this.flickers = [];
    for (const l of lanterns) {
      const light = new THREE.PointLight(0xffa04a, 4, 4.5, 1.8);
      light.position.set(l.x, 0.6, l.y);
      group.add(light);
      this.flickers.push({ light, base: 4, seed: rng() * 10 });
    }

    // 動的オブジェクト
    const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
    this.gens = map.gens.map((g) => {
      const m = this.model('generator');
      m.scale.setScalar(0.62);
      m.position.set(g.x + 0.5, 0, g.y + 0.5);
      m.rotation.y = rng() * Math.PI * 2;
      group.add(m);
      const light = new THREE.PointLight(0xffd27a, 0, 7, 1.5);
      light.position.set(g.x + 0.5, 1.7, g.y + 0.5);
      group.add(light);
      // 進捗を示す 5 個のランプ
      const bulbs = [];
      for (let i = 0; i < 5; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
        const b = new THREE.Mesh(bulbGeo, mat);
        const a = (i / 5) * Math.PI * 2;
        b.position.set(g.x + 0.5 + Math.cos(a) * 0.32, 1.32, g.y + 0.5 + Math.sin(a) * 0.32);
        group.add(b);
        bulbs.push(b);
      }
      return { m, light, bulbs, base: m.position.clone(), sparkT: 0 };
    });
    this.hooks = map.cages.map((c) => {
      const m = this.model('hook');
      m.scale.setScalar(0.5);
      m.position.set(c.x + 0.5, 0, c.y + 0.5);
      m.rotation.y = (Math.floor(rng() * 4) * Math.PI) / 2;
      group.add(m);
      const hang = new THREE.Vector3(0, 0, 0.62).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y).add(m.position);
      const light = new THREE.PointLight(0xff2a2a, 0, 5, 1.6);
      light.position.set(hang.x, 1.2, hang.z);
      group.add(light);
      return { m, hang, ry: m.rotation.y, light };
    });
    this.lockers = map.lockers.map((l) => {
      const m = this.model('locker');
      m.scale.setScalar(0.42);
      m.rotation.set(-Math.PI / 2, 0, (Math.floor(rng() * 4) * Math.PI) / 2, 'YXZ');
      m.position.set(l.x + 0.5, 1.5 * 0.42, l.y + 0.5);
      group.add(m);
      return { m };
    });
    this.pallets = map.pallets.map((p) => {
      const pivot = new THREE.Group();
      pivot.position.set(p.x + 0.5, 0, p.y + 0.5);
      pivot.rotation.y = p.axis === 'v' ? 0 : Math.PI / 2;
      const m = this.model('pallet');
      m.scale.set(0.5, 0.5, 0.5);
      pivot.add(m);
      group.add(pivot);
      return { pivot, m, state: null, x: p.x + 0.5, y: p.y + 0.5 };
    });
    this.gates = map.gates.map((g) => {
      const [x0, y0] = g.tiles[0];
      const m = this.model('exit_gate');
      m.scale.setScalar(0.48);
      m.position.set(x0 + 0.5, 0, y0 + 1);
      m.rotation.y = Math.PI / 2;
      group.add(m);
      const inward = g.side === 'left' ? 1 : -1;
      const light = new THREE.PointLight(0xff3b30, 0, 8, 1.4);
      light.position.set(x0 + 0.5 + inward * 1.2, 2.2, y0 + 1);
      group.add(light);
      // ゲートのランプ (開放の進捗)
      const bulbs = [];
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x331111 }));
        b.position.set(x0 + 0.5 + inward * 0.45, 2.25, y0 + 1 - 0.35 + i * 0.35);
        group.add(b);
        bulbs.push(b);
      }
      return { m, light, bulbs, side: g.side, x0, y0 };
    });
    this.hatchGroup = new THREE.Group();
    group.add(this.hatchGroup);
    this.hatchState = null;

    // スクラッチマーク (キラー専用・視界の暗さの影響を受けない)
    const streak = new THREE.PlaneGeometry(0.42, 0.05);
    streak.rotateX(-Math.PI / 2);
    this.prints = new THREE.InstancedMesh(
      streak,
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),
      600,
    );
    this.prints.count = 0;
    this.prints.renderOrder = 5;
    this.prints.frustumCulled = false;
    group.add(this.prints);
    const blob = new THREE.CircleGeometry(0.08, 8);
    blob.rotateX(-Math.PI / 2);
    this.blood = new THREE.InstancedMesh(
      blob,
      new THREE.MeshBasicMaterial({ color: 0xa0141a, transparent: true, opacity: 0.9, depthWrite: false }),
      200,
    );
    this.blood.count = 0;
    this.blood.frustumCulled = false;
    group.add(this.blood);

    // キラーの「赤い視線」
    const stainGeo = new THREE.CircleGeometry(3.4, 28, -0.42, 0.84);
    stainGeo.rotateX(-Math.PI / 2);
    this.stain = new THREE.Mesh(
      stainGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff1020,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.stain.visible = false;
    group.add(this.stain);

    // 地面を這う霧
  }

  // ==================== 視界 ====================
  setVision(polys, alive) {
    const c = this.visCtx;
    const s = this.visScale;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = alive ? '#000' : '#fff';
    c.fillRect(0, 0, this.visCanvas.width, this.visCanvas.height);
    if (alive) {
      c.setTransform(s, 0, 0, s, 0, 0);
      c.globalCompositeOperation = 'lighten';
      for (const p of polys) {
        const g = c.createRadialGradient(p.eye.x, p.eye.y, p.radius * 0.5, p.eye.x, p.eye.y, p.radius);
        const v = Math.round(255 * p.strength);
        g.addColorStop(0, `rgb(${v},${v},${v})`);
        g.addColorStop(1, 'rgb(0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        p.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
        c.closePath();
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
    this.visTex.needsUpdate = true;
    this.visData = null;
  }

  // その地点が今見えているか (演出を霧の中で出さないため)
  isVisible(x, y) {
    if (!this.visCtx) return true;
    if (!this.visData) this.visData = this.visCtx.getImageData(0, 0, this.visCanvas.width, this.visCanvas.height).data;
    const px = Math.floor(x * this.visScale);
    const py = Math.floor(y * this.visScale);
    if (px < 0 || py < 0 || px >= this.visCanvas.width || py >= this.visCanvas.height) return false;
    return this.visData[(py * this.visCanvas.width + px) * 4] > 40;
  }

  // ==================== 演出 ====================
  burst(kind, x, y, force = false) {
    if (!force && !this.isVisible(x, y)) return;
    const R = Math.random;
    if (kind === 'blood') {
      for (let i = 0; i < 26; i++) {
        const a = R() * Math.PI * 2;
        const sp = 1 + R() * 2.5;
        this.smoke.emit({
          x,
          y: 0.9,
          z: y,
          vx: Math.cos(a) * sp,
          vy: 1 + R() * 2.5,
          vz: Math.sin(a) * sp,
          life: 0.6 + R() * 0.4,
          size: 0.12 + R() * 0.1,
          color: [0.55, 0.02, 0.04],
          gravity: -9,
          alpha: 0.95,
        });
      }
    } else if (kind === 'dust') {
      for (let i = 0; i < 30; i++) {
        const a = R() * Math.PI * 2;
        const sp = 0.5 + R() * 1.6;
        this.smoke.emit({
          x: x + (R() - 0.5) * 0.6,
          y: 0.2,
          z: y + (R() - 0.5) * 0.6,
          vx: Math.cos(a) * sp,
          vy: 0.3 + R() * 0.8,
          vz: Math.sin(a) * sp,
          life: 0.9 + R() * 0.7,
          size: 0.5 + R() * 0.5,
          color: [0.42, 0.38, 0.32],
          drag: 2.5,
          alpha: 0.45,
          grow: 1.2,
        });
      }
    } else if (kind === 'sparks') {
      for (let i = 0; i < 22; i++) {
        const a = R() * Math.PI * 2;
        const sp = 1 + R() * 3;
        this.glow.emit({
          x,
          y: 1.1,
          z: y,
          vx: Math.cos(a) * sp,
          vy: 1.5 + R() * 3,
          vz: Math.sin(a) * sp,
          life: 0.4 + R() * 0.5,
          size: 0.08 + R() * 0.06,
          color: [1, 0.7, 0.25],
          gravity: -9,
        });
      }
    } else if (kind === 'gold') {
      for (let i = 0; i < 60; i++) {
        const a = R() * Math.PI * 2;
        const sp = 0.4 + R() * 1.5;
        this.glow.emit({
          x,
          y: 1.3,
          z: y,
          vx: Math.cos(a) * sp,
          vy: 1 + R() * 3.5,
          vz: Math.sin(a) * sp,
          life: 1 + R() * 1,
          size: 0.12 + R() * 0.1,
          color: [1, 0.85, 0.4],
          gravity: -2.5,
          drag: 1,
        });
      }
    } else if (kind === 'stun') {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        this.glow.emit({
          x,
          y: 2,
          z: y,
          vx: Math.cos(a) * 1.2,
          vy: 0.4,
          vz: Math.sin(a) * 1.2,
          life: 0.8,
          size: 0.14,
          color: [1, 1, 0.7],
          drag: 1.5,
        });
      }
    }
  }

  // ==================== 毎フレームの同期 ====================
  syncObjects(snap, T, dt, isKiller) {
    snap.gens.forEach((s, i) => {
      const g = this.gens[i];
      const p = s.done ? 1 : Math.max(0, s.p);
      g.light.intensity = s.done ? 10 + Math.sin(T * 9 + i) * 1.5 : 0;
      const lit = s.done ? 5 : s.p >= 0 ? Math.floor(p * 5 + 0.0001) : 0;
      g.bulbs.forEach((b, k) => b.material.color.set(k < lit ? (s.done ? 0xffe28a : 0xffb347) : s.r ? 0x551111 : 0x222222));
      // 修理中は小刻みに揺れて火花が散る。破壊後の後退中は大きく揺れる
      const shake = s.r ? 0.04 : s.w ? 0.015 : 0;
      g.m.position.x = g.base.x + Math.sin(T * 47 + i) * shake;
      g.m.position.z = g.base.z + Math.cos(T * 39 + i) * shake;
      if ((s.w || s.r) && !s.done) {
        g.sparkT -= dt;
        if (g.sparkT <= 0) {
          g.sparkT = 0.25 + Math.random() * 0.5;
          const gx = this.map.gens[i].x + 0.5;
          const gy = this.map.gens[i].y + 0.5;
          if (this.isVisible(gx, gy)) {
            for (let k = 0; k < 5; k++) {
              const a = Math.random() * Math.PI * 2;
              this.glow.emit({
                x: gx + Math.cos(a) * 0.3,
                y: 0.9,
                z: gy + Math.sin(a) * 0.3,
                vx: Math.cos(a) * 1.5,
                vy: 1.5 + Math.random() * 2,
                vz: Math.sin(a) * 1.5,
                life: 0.4,
                size: 0.06,
                color: s.r ? [1, 0.25, 0.15] : [1, 0.75, 0.3],
                gravity: -9,
              });
            }
          }
        }
      }
    });
    snap.pallets.forEach((st, i) => {
      const p = this.pallets[i];
      if (p.state === st) return;
      const first = p.state === null;
      p.state = st;
      p.m.visible = st !== 'broken';
      if (st === 'up') {
        p.m.rotation.set(0, 0, Math.PI / 2 - 0.12);
        p.m.position.set(0.5, 0.5, 0);
      } else if (st === 'down') {
        p.m.rotation.set(-0.5, 0, 0);
        p.m.position.set(0, 0.22, 0.12);
        if (!first) this.burst('dust', p.x, p.y);
      } else if (!first) {
        this.burst('dust', p.x, p.y);
      }
    });
    snap.cages.forEach((s, i) => {
      const h = this.hooks[i];
      h.light.intensity = s.o && !s.b ? (s.st === 2 ? 5 + Math.sin(T * 12) * 2 : 3) : 0;
      if (s.b && !h.broken) {
        h.broken = true;
        h.m.rotation.z = 0.45;
        h.m.traverse((o) => {
          if (o.isMesh) {
            o.material = o.material.clone();
            o.material.color.multiplyScalar(0.4);
          }
        });
      }
    });
    snap.gates.forEach((s, i) => {
      const g = this.gates[i];
      g.light.color.set(s.o ? 0x5dff7a : 0xff3b30);
      g.light.intensity = s.pw ? 12 : 0;
      const lit = s.o ? 3 : Math.floor(s.p * 3 + 0.0001);
      g.bulbs.forEach((b, k) => b.material.color.set(!s.pw ? 0x331111 : s.o ? 0x6dff8a : k < lit ? 0xff5040 : 0x551a1a));
      // 開いたゲートは沈んでいく
      const target = s.o ? -2.3 : -s.p * 0.3;
      g.m.position.y += (target - g.m.position.y) * Math.min(1, dt * 3);
    });
    const hs = snap.hatch ? (snap.hatch.open ? 'open' : 'closed') : null;
    if (hs !== this.hatchState) {
      this.hatchState = hs;
      this.hatchGroup.clear();
      if (hs) {
        const m = this.model(hs === 'open' ? 'hatch_open' : 'hatch_closed');
        m.scale.set(0.25, 0.25, hs === 'open' ? 0.25 : 0.5);
        m.position.set(snap.hatch.x + 0.5, 0.02, snap.hatch.y + 0.5);
        this.hatchGroup.add(m);
        if (hs === 'open') {
          const l = new THREE.PointLight(0x9fdcff, 8, 5, 1.5);
          l.position.set(snap.hatch.x + 0.5, 0.7, snap.hatch.y + 0.5);
          this.hatchGroup.add(l);
        }
      }
    }
    if (hs === 'open' && Math.random() < dt * 12) {
      const hx = snap.hatch.x + 0.5;
      const hy = snap.hatch.y + 0.5;
      this.glow.emit({
        x: hx + (Math.random() - 0.5) * 0.6,
        y: 0.1,
        z: hy + (Math.random() - 0.5) * 0.6,
        vx: 0,
        vy: 0.6 + Math.random(),
        vz: 0,
        life: 1.2,
        size: 0.07,
        color: [0.6, 0.85, 1],
      });
    }
    // ランタンのゆらぎ
    for (const f of this.flickers) f.light.intensity = f.base * (0.8 + 0.2 * Math.sin(T * 13 + f.seed) * Math.sin(T * 7.3 + f.seed * 2));
    void isKiller;
  }

  // キラー用の痕跡
  syncPrints(prints) {
    let n = 0;
    let b = 0;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const pr of prints || []) {
      const life = Math.max(0, 1 - pr.age / pr.life);
      if (pr.k === 'paw') {
        // 爪痕のような 3 本線
        for (let k = -1; k <= 1 && n < 600; k++) {
          q.setFromAxisAngle(up, -(pr.a + 0.6 + k * 0.25));
          v.set(pr.x + k * 0.07, 0.03, pr.y + k * 0.05);
          sc.set(0.3 + life * 0.7, 1, 1);
          m.compose(v, q, sc);
          this.prints.setMatrixAt(n++, m);
        }
      } else if (b < 200) {
        q.identity();
        v.set(pr.x, 0.025, pr.y);
        sc.setScalar(0.4 + life * 0.8);
        m.compose(v, q, sc);
        this.blood.setMatrixAt(b++, m);
      }
    }
    this.prints.count = n;
    this.blood.count = b;
    this.prints.instanceMatrix.needsUpdate = true;
    this.blood.instanceMatrix.needsUpdate = true;
  }

  ensureCharacter(id, character, killer, scene = this.scene, map = this.characters) {
    let c = map.get(id);
    if (c) return c;
    const modelName = killer ? KILLER_CHARACTER.model : (SURVIVOR_CHARACTERS[character] || SURVIVOR_CHARACTERS.knight).model;
    const axe = killer ? this.models.get('killer_axe').scene : null;
    c = new CharacterView(this.models.get(modelName), { killer, axe, blob: this.blob });
    if (c.blob) c.blob.visible = !this.renderer.shadowMap.enabled;
    scene.add(c.root);
    map.set(id, c);
    return c;
  }

  // 1 人分の見た目を更新
  syncCharacter(e, ctx, dt) {
    const d = e.d;
    const killer = d.role === 'hunter' || d.role === 'killer';
    const c = this.ensureCharacter(e.id, d.character, killer);
    c.seen = true;
    c.root.visible = true;
    let x = e.x;
    let y = e.y;
    let height = 0;
    let face = e.a;
    let clip = 'Idle';
    let speed = 1;
    let once = false;
    const act = d.act;
    if (killer) {
      if (act === 'lunge') [clip, once, speed] = ['2H_Melee_Attack_Chop', true, 1.6];
      else if (act === 'wipe' || act === 'miss') clip = d.mv ? 'Walking_A' : '2H_Melee_Idle';
      else if (act === 'stunned') clip = 'Hit_B';
      else if (act === 'pickup' || act === 'hook') clip = 'PickUp';
      else if (act === 'break_pallet' || act === 'kick_gen') [clip, speed] = ['1H_Melee_Attack_Chop', 0.8];
      else if (act === 'search_locker' || act === 'close_hatch') clip = 'Interact';
      else if (act === 'dash') [clip, speed] = ['Running_C', 1.6];
      else if (act === 'charge') clip = 'Block';
      else if (act === 'vault') clip = 'Jump_Full_Short';
      else if (d.mv) clip = d.carry ? 'Walking_D_Skeletons' : 'Running_A';
      else clip = 'Idle_Combat';
    } else {
      const h = d.h;
      if (h === HEALTH.DOWNED) clip = 'Lie_Idle';
      else if (h === HEALTH.CARRIED) {
        const k = ctx.carrier;
        if (k) {
          x = k.x;
          y = k.y;
          face = k.a + Math.PI / 2;
        }
        height = 1.05;
        clip = 'Lie_Idle';
      } else if (h === HEALTH.CAGED) {
        const hook = ctx.hook;
        if (hook) {
          x = hook.hang.x;
          y = hook.hang.z;
          face = Math.PI / 2 - hook.ry + Math.PI;
        }
        height = 0.25;
        clip = 'Unarmed_Idle';
      } else if (act === 'repair' || act === 'heal' || act === 'heal_self' || act === 'gate') clip = 'Interact';
      else if (act === 'unhook' || act === 'pallet_drop') clip = 'Use_Item';
      else if (act === 'vault' || act === 'pallet_vault' || act === 'hatch_jump') [clip, once] = ['Jump_Full_Short', true];
      else if (d.mv) clip = d.sn ? 'Walking_C' : 'Running_A';
      else clip = d.sn ? 'Sit_Floor_Idle' : 'Idle';
      if (h === HEALTH.DOWNED && d.mv) speed = 0.6;
      // 負傷者・ダウンした人からは血が垂れる
      if ((h === HEALTH.INJURED || h === HEALTH.DOWNED) && !d.aura) {
        c.dripT -= dt;
        if (c.dripT <= 0) {
          c.dripT = 0.18 + Math.random() * 0.25;
          this.smoke.emit({
            x: x + (Math.random() - 0.5) * 0.2,
            y: h === HEALTH.DOWNED ? 0.3 : 0.8,
            z: y + (Math.random() - 0.5) * 0.2,
            vx: 0,
            vy: -0.5,
            vz: 0,
            life: 0.5,
            size: 0.06,
            color: [0.5, 0.02, 0.04],
            gravity: -6,
            alpha: 0.9,
          });
        }
      }
    }
    c.play(clip, { once, speed });
    c.root.position.set(x, height, y);
    c.root.rotation.set(0, Math.PI / 2 - face, 0);
    if (d.h === HEALTH.CARRIED) {
      c.model.rotation.set(0, 0, -Math.PI / 2);
      c.model.position.set(0.3, 0, 0);
    } else {
      c.model.rotation.set(0, 0, 0);
      c.model.position.set(0, 0, 0);
    }
    if (c.blob) c.blob.visible = !this.renderer.shadowMap.enabled && height === 0 && !c.auraOn;
    c.setAura(d.aura ? (ctx.isKiller ? 0xff3030 : 0xffd23f) : null);
    return c;
  }

  // 生贄の演出 (エンティティの爪)
  sacrifice(x, y) {
    const geo = new THREE.ConeGeometry(0.15, 2.8, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a0306, roughness: 0.4, emissive: 0x300008 });
    const spikes = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(geo, mat);
      const a = (i / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.55, 1.3, Math.sin(a) * 0.55);
      s.rotation.z = Math.cos(a) * 0.5;
      s.rotation.x = -Math.sin(a) * 0.5;
      spikes.add(s);
    }
    spikes.position.set(x, -2.8, y);
    const light = new THREE.PointLight(0xff2020, 30, 7, 1.5);
    light.position.set(x, 1.6, y);
    this.scene.add(spikes, light);
    this.effects.push({ obj: spikes, light, age: 0, life: 3.5 });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({
        x: x + Math.cos(a) * 0.4,
        y: 0.2,
        z: y + Math.sin(a) * 0.4,
        vx: Math.cos(a) * 0.3,
        vy: 1 + Math.random() * 2,
        vz: Math.sin(a) * 0.3,
        life: 2 + Math.random(),
        size: 0.6 + Math.random() * 0.5,
        color: [0.05, 0.02, 0.03],
        alpha: 0.7,
        grow: 1,
      });
    }
  }

  updateEffects(dt) {
    for (const e of this.effects) {
      e.age += dt;
      const t = e.age / e.life;
      e.obj.position.y = t < 0.3 ? -2.8 + (t / 0.3) * 2.8 : t > 0.8 ? -((t - 0.8) / 0.2) * 2.8 : 0;
      e.light.intensity = 30 * (1 - t);
    }
    for (const e of this.effects.filter((x) => x.age >= x.life)) this.scene.remove(e.obj, e.light);
    this.effects = this.effects.filter((x) => x.age < x.life);
  }

  // ==================== カメラ・投影 ====================
  updateCamera(x, y, dt) {
    const portrait = innerHeight > innerWidth;
    const dist = (portrait ? 1.3 : 0.82) * (this.zoom || 1);
    const target = new THREE.Vector3(x, 0.6, y);
    if (this.camTarget.lengthSq() === 0) this.camTarget.copy(target);
    this.camTarget.lerp(target, Math.min(1, dt * 10));
    const shake = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 2);
    this.camera.position.set(this.camTarget.x + shake, this.camTarget.y + 13.5 * dist, this.camTarget.z + 8.2 * dist);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y, this.camTarget.z);
    this.moon.position.set(this.camTarget.x - 8, 20, this.camTarget.z - 6);
    this.moon.target.position.set(this.camTarget.x, 0, this.camTarget.z);
  }

  project(x, y, h = 0) {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, front: v.z < 1 };
  }

  screenToGround(sx, sy) {
    const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, p)) return null;
    return { x: p.x, y: p.z };
  }

  draw(scene) {
    if (this.composer) {
      this.renderPass.scene = scene;
      this.composer.render();
    } else {
      this.renderer.render(scene, this.camera);
    }
  }

  render(frame) {
    const { dt, T, self, list, snap, isKiller, selfAlive } = frame;
    this.menuActive = false;
    this.syncObjects(snap, T, dt, isKiller);
    this.syncPrints(isKiller ? snap.prints : null);
    for (const c of this.characters.values()) c.seen = false;
    const carrier = list.find((e) => e.d.role === 'hunter' || e.d.role === 'killer');
    for (const e of list) {
      const hook = e.d.h === HEALTH.CAGED ? this.hookFor(snap, e.id) : null;
      this.syncCharacter(e, { carrier, hook, isKiller }, dt);
    }
    for (const [id, c] of this.characters) {
      if (!c.seen) c.root.visible = false;
      c.update(dt);
      if (!c.seen && frame.gone && frame.gone.has(id)) {
        this.scene.remove(c.root);
        this.characters.delete(id);
      }
    }
    // キラーの赤い視線はサバイバー視点でのみ
    this.stain.visible = false;
    if (!isKiller && carrier && !carrier.d.aura) {
      this.stain.visible = true;
      this.stain.position.set(carrier.x, 0.04, carrier.y);
      this.stain.rotation.y = -carrier.a;
    }
    this.selfLight.position.set(self.x, 2.6, self.y + 0.6);
    this.selfLight.intensity = selfAlive ? 5 : 0;
    visUniforms.uPlayer.value.set(self.x, self.y);
    this.updateEffects(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.updateCamera(self.x, self.y, dt);
    this.draw(this.scene);
  }

  hookFor(snap, id) {
    const i = snap.cages.findIndex((c) => c.o === id);
    return i >= 0 ? this.hooks[i] : null;
  }

  // ==================== メニュー背景 (焚き火) ====================
  buildMenu() {
    if (this.menu) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.FogExp2(0x05070c, 0.07);
    scene.add(new THREE.HemisphereLight(0x6a7cb0, 0x1a120c, 0.55));
    const moon = new THREE.DirectionalLight(0x9fb0e8, 0.8);
    moon.position.set(-6, 10, -4);
    scene.add(moon);
    const tex = groundTexture();
    tex.repeat.set(5, 5);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: 0x9aa090 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);
    const fire = new THREE.PointLight(0xff8a3a, 30, 14, 1.6);
    fire.position.set(0, 0.8, 0);
    fire.castShadow = true;
    fire.shadow.mapSize.set(512, 512);
    scene.add(fire);
    const rng = mulberry32(3);
    const group = new THREE.Group();
    scene.add(group);
    const place = (name, x, z, s, ry = rng() * 6.28) => {
      const m = this.models.get(name).scene.clone(true);
      m.position.set(x, 0, z);
      m.scale.setScalar(s);
      m.rotation.y = ry;
      m.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      group.add(m);
      return m;
    };
    // 焚き火を囲む石
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      place('rock', Math.cos(a) * 0.55, Math.sin(a) * 0.55, 1.1);
    }
    place('bones', 0.1, 0, 0.5);
    // 周囲の森と墓
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2;
      const r = 5 + rng() * 9;
      const name = ['tree_pine_a', 'tree_pine_b', 'tree_pine_c', 'tree_dead_a', 'tree_dead_b'][Math.floor(rng() * 5)];
      place(name, Math.cos(a) * r, Math.sin(a) * r, 0.35 + rng() * 0.25);
    }
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const r = 3 + rng() * 2;
      place(['gravestone', 'grave', 'pumpkin', 'lantern', 'gravemarker'][i % 5], Math.cos(a) * r, Math.sin(a) * r, 0.45);
    }
    place('bench', -2.1, 1.2, 0.6, 0.6);
    place('bench', 2.1, 1.25, 0.6, -0.6);
    // 焚き火を囲むサバイバーと、奥に佇むキラー
    const chars = new Map();
    const seats = [
      ['knight', -1.9, 0.6],
      ['barbarian', -0.8, 1.8],
      ['mage', 0.8, 1.8],
      ['rogue', 1.9, 0.6],
    ];
    for (const [id, x, z] of seats) {
      const c = this.ensureCharacter('menu_' + id, id, false, scene, chars);
      c.root.position.set(x, 0, z);
      c.root.rotation.y = Math.atan2(-x, -z);
      c.play('Sit_Floor_Idle');
      c.mixer.update(rng() * 3);
    }
    const k = this.ensureCharacter('menu_killer', null, true, scene, chars);
    k.root.position.set(0.4, 0, -4.6);
    k.root.rotation.y = 0.1;
    k.play('Idle');
    const kl = new THREE.PointLight(0xff2020, 4, 4, 1.5);
    kl.position.set(0.4, 1.6, -3.9);
    scene.add(kl);
    const embers = new Particles(400, { additive: true, texture: this.dot });
    const flames = new Particles(300, { additive: true, texture: this.dot });
    scene.add(embers.points, flames.points);
    this.menu = { scene, fire, chars, embers, flames, angle: 0.6, focus: null };
  }

  menuFocus(id) {
    if (!this.menu) return;
    this.menu.focus = id;
    const c = this.menu.chars.get('menu_' + id);
    if (c && !c.killer) {
      c.play('Cheer', { once: true });
      clearTimeout(c.sitTimer);
      c.sitTimer = setTimeout(() => c.play('Sit_Floor_Idle'), 2200);
    }
  }

  renderMenu(dt, T) {
    if (!this.menu) return;
    if (!this.menuActive) {
      this.menuActive = true;
      visUniforms.uVisOn.value = 0;
      this.setupComposer();
    }
    const M = this.menu;
    M.angle += dt * 0.05;
    const r = innerHeight > innerWidth ? 9 : 7;
    this.camera.position.set(Math.sin(M.angle) * r, 3.1, Math.cos(M.angle) * r);
    this.camera.lookAt(0, 0.9, -0.6);
    M.fire.intensity = 26 + Math.sin(T * 17) * 4 + Math.sin(T * 7.1) * 3;
    for (let i = 0; i < 6; i++) {
      M.flames.emit({
        x: (Math.random() - 0.5) * 0.4,
        y: 0.15,
        z: (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.2,
        vy: 0.9 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 0.2,
        life: 0.6 + Math.random() * 0.4,
        size: 0.45 + Math.random() * 0.25,
        color: [1, 0.45 + Math.random() * 0.2, 0.12],
        grow: -0.6,
      });
    }
    if (Math.random() < 0.4) {
      M.embers.emit({
        x: (Math.random() - 0.5) * 0.3,
        y: 0.4,
        z: (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 1.2 + Math.random() * 1.4,
        vz: (Math.random() - 0.5) * 0.6,
        life: 2 + Math.random() * 1.5,
        size: 0.05 + Math.random() * 0.04,
        color: [1, 0.6, 0.2],
        drag: 0.3,
      });
    }
    M.flames.update(dt);
    M.embers.update(dt);
    for (const c of M.chars.values()) c.update(dt);
    this.draw(M.scene);
  }
}
