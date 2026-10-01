// Three.js による 3D 描画。ゲーム座標 (x, y) は Three の (x, z) に対応し、1 タイル = 1 ユニット。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { TILE, mulberry32 } from '../shared/map.js';
import { HEALTH } from '../shared/constants.js';
import { SURVIVOR_CHARACTERS, KILLER_CHARACTER } from '../shared/characters.js';

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
  'wall_broken',
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
  'floor_dirt',
  'barrel',
  'crates',
  'rock',
];

const WALL_H = 1.7; // 壁の高さ (タイル)
const DARK = 0.13; // 視界外の明るさ

// ==================== 視界マスク (全マテリアル共通) ====================
// 視界ポリゴンを上から見た 2D キャンバスに描き、シェーダーでワールド座標から参照して暗くする
const visUniforms = {
  uVisTex: { value: null },
  uMapSize: { value: new THREE.Vector2(64, 44) },
  uDark: { value: DARK },
  uPlayer: { value: new THREE.Vector2(-100, -100) },
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
        '#include <common>\nvarying vec3 vVisWorld;\nuniform sampler2D uVisTex;\nuniform vec2 uMapSize;\nuniform float uDark;\nuniform vec2 uPlayer;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        #ifdef CUTAWAY
          vec2 cutD = vVisWorld.xz - uPlayer;
          if (vVisWorld.y > 0.3 && cutD.y > -0.3 && cutD.y < 3.5 && abs(cutD.x) < 1.4 + cutD.y * 0.35) {
            if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
          }
        #endif`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float visV = texture2D(uVisTex, vVisWorld.xz / uMapSize).r;
        gl_FragColor.rgb *= mix(uDark, 1.0, visV);`,
      );
  };
  mat.customProgramCacheKey = () => (cutaway ? 'vis-cut' : 'vis');
  mat.needsUpdate = true;
}

function patchObject(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(patchMaterial);
    }
  });
}

// ==================== キャラクター ====================
const SURVIVOR_SCALE = 0.58;
const KILLER_SCALE = 0.72;

class CharacterView {
  constructor(gltf, { killer, axe }) {
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.scale.setScalar(killer ? KILLER_SCALE : SURVIVOR_SCALE);
    this.root.add(this.model);
    this.killer = killer;
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    if (axe) {
      const hand = this.model.getObjectByName('handslot.r');
      if (hand) hand.add(axe.clone());
    }
    patchObject(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
    this.current = null;
    this.currentName = '';
    this.auraOn = false;
    this.origMats = new Map();
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
        o.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthTest: false });
        o.renderOrder = 10;
      } else if (this.origMats.has(o)) {
        o.material = this.origMats.get(o);
        o.renderOrder = 0;
      }
    });
  }

  update(dt) {
    this.mixer.update(dt);
  }
}

// ==================== ワールド ====================
export class World3D {
  constructor(canvas) {
    this.canvas = canvas;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090e);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.models = new Map();
    this.characters = new Map();
    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.zoom = 1;

    // 月明かり
    this.scene.add(new THREE.HemisphereLight(0x8a9cc8, 0x1a1410, 0.9));
    const moon = new THREE.DirectionalLight(0xb8c8ff, 1.6);
    moon.castShadow = true;
    moon.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = moon.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 60;
    moon.shadow.bias = -0.0008;
    this.scene.add(moon);
    this.scene.add(moon.target);
    this.moon = moon;
    // 自分の周りの灯り
    this.selfLight = new THREE.PointLight(0xffc98a, 6, 7, 1.6);
    this.scene.add(this.selfLight);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    let done = 0;
    await Promise.all(
      MODEL_NAMES.map(async (name) => {
        const gltf = await loader.loadAsync(`assets/models/${name}.glb`);
        this.models.set(name, gltf);
        done++;
        onProgress?.(done / MODEL_NAMES.length);
      }),
    );
  }

  model(name) {
    const g = this.models.get(name);
    const m = g.scene.clone(true);
    m.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    patchObject(m);
    return m;
  }

  // 同じモデルを大量に置くものはインスタンス描画にする
  instanced(name, transforms, { shadow = true, tint = null, cutaway = true } = {}) {
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
      patchMaterial(material, cutaway);
      this.mapGroup.add(im);
    });
  }

  clearMap() {
    if (this.mapGroup) this.scene.remove(this.mapGroup);
    for (const c of this.characters.values()) this.scene.remove(c.root);
    this.characters.clear();
  }

  buildMap(map) {
    this.clearMap();
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
    this.visCtx = this.visCanvas.getContext('2d');
    this.visTex = new THREE.CanvasTexture(this.visCanvas);
    this.visTex.flipY = false;
    this.visTex.minFilter = THREE.LinearFilter;
    this.visTex.magFilter = THREE.LinearFilter;
    visUniforms.uVisTex.value = this.visTex;
    visUniforms.uMapSize.value.set(map.w, map.h);

    // 地面
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x25301f, roughness: 1 });
    patchMaterial(groundMat);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.w + 60, map.h + 60), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(map.w / 2, 0, map.h / 2);
    ground.receiveShadow = true;
    group.add(ground);
    const dirt = [];
    for (let i = 0; i < 90; i++) {
      const x = rng() * map.w;
      const y = rng() * map.h;
      dirt.push(T(x, 0.005 + i * 0.0003, y, rng() * Math.PI, 0.3 + rng() * 0.35, 0.05));
    }
    this.instanced('floor_dirt', dirt, { shadow: false, tint: 0x5a4a3a, cutaway: false });

    // 壁: 横方向の連続をまとめて 1 枚の壁に。残りは縦方向
    const isWall = (x, y) => at(x, y) === TILE.WALL;
    const covered = new Set();
    const walls = [];
    for (let y = 0; y < map.h; y++) {
      let x = 0;
      while (x < map.w) {
        if (!isWall(x, y)) {
          x++;
          continue;
        }
        let x2 = x;
        while (x2 + 1 < map.w && isWall(x2 + 1, y)) x2++;
        const len = x2 - x + 1;
        if (len >= 2) {
          walls.push(T(x + len / 2, 0, y + 0.5, 0, len / 4, WALL_H / 4, 1));
          for (let k = x; k <= x2; k++) covered.add(`${k},${y}`);
        }
        x = x2 + 1;
      }
    }
    for (let x = 0; x < map.w; x++) {
      let y = 0;
      while (y < map.h) {
        if (!isWall(x, y) || covered.has(`${x},${y}`)) {
          y++;
          continue;
        }
        let y2 = y;
        while (y2 + 1 < map.h && isWall(x, y2 + 1) && !covered.has(`${x},${y2 + 1}`)) y2++;
        const len = y2 - y + 1;
        walls.push(T(x + 0.5, 0, y + len / 2, Math.PI / 2, len / 4, WALL_H / 4, 1));
        y = y2 + 1;
      }
    }
    this.instanced('wall', walls);

    // 窓枠
    const windows = map.windows.map((w) => T(w.x + 0.5, 0, w.y + 0.5, w.axis === 'v' ? 0 : Math.PI / 2, 0.25, WALL_H / 4, 1));
    this.instanced('wall_window', windows);

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
    for (let i = 0; i < 260; i++) {
      const side = Math.floor(rng() * 4);
      const depth = 1.2 + rng() * 9;
      let x;
      let y;
      if (side === 0) [x, y] = [rng() * (map.w + 16) - 8, -depth];
      else if (side === 1) [x, y] = [rng() * (map.w + 16) - 8, map.h + depth];
      else if (side === 2) [x, y] = [-depth, rng() * map.h];
      else [x, y] = [map.w + depth, rng() * map.h];
      const name = ['tree_pine_a', 'tree_pine_b', 'tree_pine_c', 'tree_dead_a'][Math.floor(rng() * 4)];
      put(name, T(x, 0, y, rng() * 6.28, 0.35 + rng() * 0.2));
    }
    // 床の小物 (当たり判定なし)
    const decor = ['pumpkin_small', 'candles', 'skull_candle', 'bones', 'ribcage', 'gravemarker', 'rock', 'pumpkin'];
    const decorScale = {
      pumpkin_small: 0.35,
      candles: 0.5,
      skull_candle: 0.35,
      bones: 0.5,
      ribcage: 0.4,
      gravemarker: 0.45,
      rock: 0.8,
      pumpkin: 0.3,
    };
    const blocked = new Set();
    for (const list of [map.gens, map.cages, map.lockers, map.pallets, map.windows]) for (const o of list) blocked.add(`${o.x},${o.y}`);
    for (let i = 0; i < 160; i++) {
      const x = Math.floor(rng() * map.w);
      const y = Math.floor(rng() * map.h);
      if (at(x, y) !== TILE.FLOOR || blocked.has(`${x},${y}`)) continue;
      const name = decor[Math.floor(rng() * decor.length)];
      put(name, T(x + 0.2 + rng() * 0.6, 0, y + 0.2 + rng() * 0.6, rng() * 6.28, decorScale[name]));
    }
    for (const [name, list] of byModel) this.instanced(name, list);

    // 動的オブジェクト
    this.gens = map.gens.map((g) => {
      const m = this.model('generator');
      m.scale.setScalar(0.62);
      m.position.set(g.x + 0.5, 0, g.y + 0.5);
      m.rotation.y = rng() * Math.PI * 2;
      group.add(m);
      const light = new THREE.PointLight(0xffd27a, 0, 6, 1.5);
      light.position.set(g.x + 0.5, 1.6, g.y + 0.5);
      group.add(light);
      return { m, light, base: m.position.clone() };
    });
    this.hooks = map.cages.map((c) => {
      const m = this.model('hook');
      m.scale.setScalar(0.5);
      m.position.set(c.x + 0.5, 0, c.y + 0.5);
      m.rotation.y = (Math.floor(rng() * 4) * Math.PI) / 2;
      group.add(m);
      // 吊るされる位置 (腕の先)
      const hang = new THREE.Vector3(0, 0, 0.62).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y).add(m.position);
      return { m, hang, ry: m.rotation.y };
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
      return { pivot, m, state: null };
    });
    this.gates = map.gates.map((g) => {
      const [x0, y0] = g.tiles[0];
      const m = this.model('exit_gate');
      m.scale.setScalar(0.48);
      m.position.set(x0 + 0.5, 0, y0 + 1);
      m.rotation.y = Math.PI / 2;
      group.add(m);
      const light = new THREE.PointLight(0xff3b30, 0, 7, 1.5);
      light.position.set(x0 + (g.side === 'left' ? 1.2 : -0.2), 2.2, y0 + 1);
      group.add(light);
      return { m, light, side: g.side, x0, y0 };
    });
    this.hatchGroup = new THREE.Group();
    group.add(this.hatchGroup);
    this.hatchState = null;

    // スクラッチマーク (キラー専用・霧の影響を受けない)
    const streak = new THREE.PlaneGeometry(0.42, 0.05);
    streak.rotateX(-Math.PI / 2);
    this.prints = new THREE.InstancedMesh(
      streak,
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.85, depthWrite: false }),
      600,
    );
    this.prints.count = 0;
    this.prints.renderOrder = 5;
    group.add(this.prints);
    const blob = new THREE.CircleGeometry(0.08, 8);
    blob.rotateX(-Math.PI / 2);
    this.blood = new THREE.InstancedMesh(
      blob,
      new THREE.MeshBasicMaterial({ color: 0x8a0d12, transparent: true, opacity: 0.9, depthWrite: false }),
      200,
    );
    this.blood.count = 0;
    group.add(this.blood);

    // キラーの「赤い視線」
    const stainGeo = new THREE.CircleGeometry(3.2, 24, -0.45, 0.9);
    stainGeo.rotateX(-Math.PI / 2);
    this.stain = new THREE.Mesh(
      stainGeo,
      new THREE.MeshBasicMaterial({ color: 0xff1020, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.stain.visible = false;
    group.add(this.stain);

    this.effects = [];
    this.shake = 0;
  }

  // 視界マスクを更新
  setVision(polys, alive) {
    const c = this.visCtx;
    const s = this.visScale;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.visCanvas.width, this.visCanvas.height);
    if (!alive) {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, this.visCanvas.width, this.visCanvas.height);
    } else {
      c.setTransform(s, 0, 0, s, 0, 0);
      for (const p of polys) {
        const o = p.pts[0];
        const ex = p.pts.length && p.eye ? p.eye : null;
        const cx = ex ? ex.x : o.x;
        const cy = ex ? ex.y : o.y;
        const g = c.createRadialGradient(cx, cy, p.radius * 0.5, cx, cy, p.radius);
        const v = Math.round(255 * p.strength);
        g.addColorStop(0, `rgb(${v},${v},${v})`);
        g.addColorStop(1, 'rgb(0,0,0)');
        c.fillStyle = g;
        c.globalCompositeOperation = 'lighten';
        c.beginPath();
        p.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
        c.closePath();
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
    this.visTex.needsUpdate = true;
  }

  // ==================== 毎フレームの同期 ====================
  syncObjects(snap, T) {
    snap.gens.forEach((s, i) => {
      const g = this.gens[i];
      g.light.intensity = s.done ? 9 : 0;
      // 修理中は小刻みに揺れる / 破壊後の後退中は大きく揺れる
      const shake = s.r ? 0.04 : s.w ? 0.015 : 0;
      g.m.position.x = g.base.x + Math.sin(T * 47 + i) * shake;
      g.m.position.z = g.base.z + Math.cos(T * 39 + i) * shake;
    });
    snap.pallets.forEach((st, i) => {
      const p = this.pallets[i];
      if (p.state === st) return;
      p.state = st;
      p.m.visible = st !== 'broken';
      if (st === 'up') {
        // 通路の脇に立てかける
        p.m.rotation.set(0, 0, Math.PI / 2 - 0.12);
        p.m.position.set(0.5, 0.5, 0);
      } else if (st === 'down') {
        // 通路をふさぐように倒れる
        p.m.rotation.set(-0.5, 0, 0);
        p.m.position.set(0, 0.22, 0.12);
      }
    });
    snap.cages.forEach((s, i) => {
      const h = this.hooks[i];
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
      g.light.intensity = s.pw ? 10 : 0;
      // 開いたゲートは沈んでいく
      const target = s.o ? -2.3 : -s.p * 0.3;
      g.m.position.y += (target - g.m.position.y) * 0.08;
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
          const l = new THREE.PointLight(0xaee8ff, 6, 4, 1.5);
          l.position.set(snap.hatch.x + 0.5, 0.6, snap.hatch.y + 0.5);
          this.hatchGroup.add(l);
        }
      }
    }
  }

  // ハンター (キラー) 用の痕跡
  syncPrints(prints) {
    let n = 0;
    let b = 0;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const pr of prints || []) {
      const life = Math.max(0, 1 - pr.age / pr.life);
      if (pr.k === 'paw') {
        // 爪痕のような 3 本線
        for (let k = -1; k <= 1 && n < 600; k++) {
          const a = pr.a + 0.6 + k * 0.25;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
          v.set(pr.x + k * 0.07, 0.03, pr.y + k * 0.05);
          sc.set(0.4 + life * 0.6, 1, 1);
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

  ensureCharacter(id, character, killer) {
    let c = this.characters.get(id);
    if (c) return c;
    const modelName = killer ? KILLER_CHARACTER.model : (SURVIVOR_CHARACTERS[character] || SURVIVOR_CHARACTERS.knight).model;
    const axe = killer ? this.models.get('killer_axe').scene : null;
    c = new CharacterView(this.models.get(modelName), { killer, axe });
    this.scene.add(c.root);
    this.characters.set(id, c);
    return c;
  }

  // 1 人分の見た目を更新
  syncCharacter(e, ctx) {
    const d = e.d;
    const killer = d.role === 'hunter' || d.role === 'killer';
    const c = this.ensureCharacter(e.id, d.character, killer);
    c.seen = true;
    c.root.visible = true;
    let x = e.x;
    let y = e.y;
    let height = 0;
    let rotX = 0;
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
      if (h === HEALTH.DOWNED) [clip, speed] = ['Lie_Idle', 1];
      else if (h === HEALTH.CARRIED) {
        const k = ctx.carrier;
        if (k) {
          x = k.x;
          y = k.y;
          face = k.a + Math.PI / 2;
        }
        height = 1.05;
        clip = 'Lie_Idle';
        rotX = 0;
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
    }
    c.play(clip, { once, speed });
    c.root.position.set(x, height, y);
    c.root.rotation.set(rotX, Math.PI / 2 - face, 0);
    // 担がれている人は肩の上で横向きに
    if (d.h === HEALTH.CARRIED) {
      c.model.rotation.set(0, 0, -Math.PI / 2);
      c.model.position.set(0.3, 0, 0);
    } else {
      c.model.rotation.set(0, 0, 0);
      c.model.position.set(0, 0, 0);
    }
    c.setAura(d.aura ? (ctx.isKiller ? 0xff3030 : 0xffd23f) : null);
    return c;
  }

  // 生贄演出
  sacrifice(x, y) {
    const geo = new THREE.ConeGeometry(0.15, 2.6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a0306, transparent: true, opacity: 0.95 });
    const spikes = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(geo, mat);
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.5, 1.2, Math.sin(a) * 0.5);
      s.rotation.z = Math.cos(a) * 0.5;
      s.rotation.x = -Math.sin(a) * 0.5;
      spikes.add(s);
    }
    spikes.position.set(x, -2.6, y);
    const light = new THREE.PointLight(0xff2020, 25, 6, 1.5);
    light.position.set(x, 1.5, y);
    this.scene.add(spikes, light);
    this.effects.push({ obj: spikes, light, age: 0, life: 3.5 });
  }

  updateEffects(dt) {
    for (const e of this.effects) {
      e.age += dt;
      const t = e.age / e.life;
      e.obj.position.y = t < 0.3 ? -2.6 + (t / 0.3) * 2.6 : t > 0.8 ? -((t - 0.8) / 0.2) * 2.6 : 0;
      e.light.intensity = 25 * (1 - t);
    }
    for (const e of this.effects.filter((x) => x.age >= x.life)) this.scene.remove(e.obj, e.light);
    this.effects = this.effects.filter((x) => x.age < x.life);
  }

  // ==================== カメラ・投影 ====================
  updateCamera(x, y, dt) {
    const portrait = innerHeight > innerWidth;
    const dist = (portrait ? 1.3 : 0.82) * this.zoom;
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

  // 画面座標 → 地面 (高さ 0.6) 上の点
  screenToGround(sx, sy) {
    const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, p)) return null;
    return { x: p.x, y: p.z };
  }

  render(frame) {
    const { dt, T, self, list, snap, isKiller, selfAlive } = frame;
    this.syncObjects(snap, T);
    this.syncPrints(isKiller ? snap.prints : null);
    for (const c of this.characters.values()) c.seen = false;
    const carrier = list.find((e) => e.d.role === 'hunter' || e.d.role === 'killer');
    for (const e of list) {
      const hook = e.d.h === HEALTH.CAGED ? this.hookFor(snap, e.id) : null;
      this.syncCharacter(e, { carrier, hook, isKiller });
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
    this.selfLight.position.set(self.x, 1.6, self.y);
    visUniforms.uPlayer.value.set(self.x, self.y);
    this.selfLight.intensity = selfAlive ? 6 : 0;
    this.updateEffects(dt);
    this.updateCamera(self.x, self.y, dt);
    this.renderer.render(this.scene, this.camera);
  }

  hookFor(snap, id) {
    const i = snap.cages.findIndex((c) => c.o === id);
    return i >= 0 ? this.hooks[i] : null;
  }
}
