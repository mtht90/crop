// モデル読み込みと「焼き込みアニメーション」
// 大群は SkinnedMesh を何百体も動かすと重いので、歩行などのアニメを数フレーム分の静的ジオメトリに焼き込み、
// フレームごとの InstancedMesh で描く（描画呼び出し = 種類 × フレーム数 で一定）。
import * as THREE from 'three';
import { loadGLTF } from './gltf.js';
import { XRAY } from './world.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const DIR = 'assets/models/';

// height: 目標の高さ(m)。clipsFrom: アニメを借りるファイル（KayKit は同じリグ）
export const MODELS = {
  // ---- 妖怪 ----
  bat:       { file: 'bat', height: 0.9, walk: 'Bat_Flying', frames: 8, lift: 0.9 },
  skMinion:  { file: 'sk_minion', height: 1.55, walk: 'Walking_D_Skeletons', frames: 8 },
  slime:     { file: 'slime', height: 1.0, walk: 'Slime_Walk', frames: 8 },
  frog:      { file: 'frog', height: 0.95, walk: 'Frog_Jump', frames: 8 },
  rat:       { file: 'rat', height: 0.75, walk: 'Rat_Run', frames: 8 },
  skRogue:   { file: 'sk_rogue', clipsFrom: 'sk_minion', height: 1.75, walk: 'Running_C', frames: 8 },
  spiderBig: { file: 'spider', height: 1.9, walk: 'Spider_Walk', frames: 8 },
  // ---- 中ボス ----
  orochi:    { file: 'snake', height: 3.4, walk: 'Snake_Walk', frames: 8 },
  mukuro:    { file: 'sk_mage', clipsFrom: 'sk_minion', height: 4.4, walk: 'Walking_D_Skeletons', frames: 8 },
  // ---- 式神（霊体として描く） ----
  kami:   { file: 'ally_hooded', clipsFrom: 'player', height: 1.15, walk: 'Running_B', atk: 'Dualwield_Melee_Attack_Slice', frames: 8, spectral: '#6fe0ff' },
  byakko: { file: 'ally_rogue', clipsFrom: 'player', height: 1.6, walk: 'Running_A', atk: 'Dualwield_Melee_Attack_Chop', frames: 8, spectral: '#c08bff' },
  zenki:  { file: 'ally_barbarian', clipsFrom: 'player', height: 2.1, walk: 'Running_A', atk: '2H_Melee_Attack_Chop', frames: 8, spectral: '#ffc04a' },
  karasu: { file: 'dragon', height: 1.1, walk: 'Dragon_Flying', atk: 'Dragon_Attack', frames: 8, spectral: '#ff7a3d', lift: 2.4 },
};

const gltfs = {};

export async function loadModels(onProgress) {
  const files = new Set(['player', 'sk_warrior', 'ally_knight']);
  for (const m of Object.values(MODELS)) { files.add(m.file); if (m.clipsFrom) files.add(m.clipsFrom); }
  let done = 0;
  await Promise.all([...files].map(async (f) => {
    gltfs[f] = await loadGLTF(DIR + f + '.json');
    onProgress && onProgress(++done / files.size);
  }));
  return gltfs;
}
export function getGLTF(name) { return gltfs[name]; }

function clipOf(m, name) {
  const src = gltfs[m.clipsFrom || m.file];
  return src.animations.find((a) => a.name === name) || src.animations[0];
}

// 1 フレーム分の姿勢を、全メッシュを結合した 1 つの BufferGeometry に焼き込む
function bakeFrame(root, meshes, scale, yOffset) {
  root.updateMatrixWorld(true);
  const pos = [], uv = [], col = [], emis = [], idx = [];
  const v = new THREE.Vector3();
  let base = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const n = g.attributes.position.count;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const c = mat.color || new THREE.Color(1, 1, 1);
    const glow = /glow/i.test(mat.name) ? 1 : 0;
    const guv = g.attributes.uv;
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      pos.push(v.x * scale, v.y * scale - yOffset, v.z * scale);
      if (guv) uv.push(guv.getX(i), guv.getY(i)); else uv.push(0, 0);
      col.push(c.r, c.g, c.b);
      emis.push(glow);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < n; i++) idx.push(i + base);
    base += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aEmis', new THREE.Float32BufferAttribute(emis, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// 指定クリップを frames 枚に焼き込む
function bakeClip(m, clipName, frames) {
  const root = SkeletonUtils.clone(gltfs[m.file].scene);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
  const mixer = new THREE.AnimationMixer(root);
  const clip = clipOf(m, clipName);
  const action = mixer.clipAction(clip);
  action.play();
  // 1 枚目で大きさを測って目標の高さに合わせる
  if (!m._scale) {
    mixer.setTime(0);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const mesh of meshes) {
      const n = mesh.geometry.attributes.position.count;
      for (let i = 0; i < n; i += 3) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); box.expandByPoint(v); }
    }
    m._scale = m.height / Math.max(0.01, box.max.y - box.min.y);
    m._y = box.min.y * m._scale;
  }
  const geos = [];
  for (let f = 0; f < frames; f++) {
    mixer.setTime((clip.duration * f) / frames);
    geos.push(bakeFrame(root, meshes, m._scale, m._y));
  }
  const map = meshes.map((x) => (Array.isArray(x.material) ? x.material[0] : x.material).map).find(Boolean) || null;
  return { geos, map };
}

// 単位（敵・式神）用のマテリアル。被弾フラッシュ・発光部位・霊体（縁の発光と半透明）に対応
export function unitMaterial({ map, spectral }) {
  const mat = new THREE.MeshStandardMaterial({
    map, vertexColors: !map, roughness: 0.75, metalness: 0,
    transparent: !!spectral, depthWrite: !spectral,
  });
  const spec = spectral ? new THREE.Color(spectral) : null;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSpec = { value: spec || new THREE.Color(0, 0, 0) };
    sh.uniforms.uSpecOn = { value: spectral ? 1 : 0 };
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uCam = { value: XRAY.cam };
    sh.uniforms.uPl = { value: XRAY.player };
    mat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEmis;\nattribute float iFlash;\nvarying float vEmis;\nvarying float vFlash;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmis = aEmis;\nvFlash = iFlash;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSpec;\nuniform float uSpecOn;\nuniform float uTime;\nuniform vec3 uCam;\nuniform vec3 uPl;\nvarying float vEmis;\nvarying float vFlash;\nvarying vec3 vWPos;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);
        totalEmissiveRadiance += vec3(1.0, 0.3, 0.2) * vEmis * 1.4;
        if (uSpecOn < 0.5) totalEmissiveRadiance += vec3(0.30, 0.42, 0.85) * rim * 0.55 + diffuseColor.rgb * 0.08;
        totalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * vFlash * 0.75;
        if (uSpecOn > 0.5) {
          float band = 0.5 + 0.5 * sin(vWPos.y * 9.0 - uTime * 6.0);
          totalEmissiveRadiance += uSpec * (0.12 + rim * 1.6 + band * 0.15);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSpec * 0.6, 0.5);
          diffuseColor.a *= 0.55 + rim * 0.45;
        }
        // 陰陽師を隠さない：カメラと陰陽師を結ぶ線の上にいる体は透かす。式神は陰陽師の周りでも薄くなる
        vec3 ab = uPl - uCam; float h = dot(vWPos - uCam, ab) / dot(ab, ab);
        float occ = h < 0.97 ? smoothstep(1.8, 0.6, length(vWPos - (uCam + ab * clamp(h, 0.0, 1.0)))) : 0.0;
        if (uSpecOn > 0.5) {
          float f = max(occ, smoothstep(2.6, 1.0, length(vWPos.xz - uPl.xz)) * 0.8);
          diffuseColor.a *= 1.0 - f * 0.85;
        } else if (occ > 0.0) {
          vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
          if ((q.x * 4.0 + q.y + mod(q.x + q.y, 2.0) * 8.0) / 16.0 < occ * 0.7) discard;
        }`);
  };
  return mat;
}

// 種類ごとのインスタンス描画セット
export class UnitSet {
  constructor(scene, key, capacity) {
    const m = MODELS[key];
    this.m = m;
    this.lift = m.lift || 0;
    const walk = bakeClip(m, m.walk, m.frames);
    this.mat = unitMaterial({ map: walk.map, spectral: m.spectral });
    this.walk = walk.geos.map((g) => this.mesh(scene, g, capacity));
    this.atk = m.atk ? bakeClip(m, m.atk, 6).geos.map((g) => this.mesh(scene, g, Math.ceil(capacity / 2))) : null;
  }
  mesh(scene, geo, cap) {
    const flash = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    flash.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iFlash', flash);
    const im = new THREE.InstancedMesh(geo, this.mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    im.userData.cap = cap;
    im.userData.n = 0;
    scene.add(im);
    return im;
  }
  begin() {
    for (const im of this.walk) im.userData.n = 0;
    if (this.atk) for (const im of this.atk) im.userData.n = 0;
  }
  // phase: 0..1 のアニメ位相
  push(matrix, phase, flash, attack = -1) {
    const set = attack >= 0 && this.atk ? this.atk : this.walk;
    const p = attack >= 0 && this.atk ? attack : phase;
    const f = Math.min(set.length - 1, Math.floor((((p % 1) + 1) % 1) * set.length));
    const im = set[f];
    const i = im.userData.n;
    if (i >= im.userData.cap) return;
    im.setMatrixAt(i, matrix);
    im.geometry.attributes.iFlash.array[i] = flash;
    im.userData.n = i + 1;
  }
  end(time) {
    const all = this.atk ? this.walk.concat(this.atk) : this.walk;
    for (const im of all) {
      im.count = im.userData.n;
      if (im.count) {
        im.instanceMatrix.needsUpdate = true;
        im.geometry.attributes.iFlash.needsUpdate = true;
      }
    }
    if (this.mat.userData.shader) this.mat.userData.shader.uniforms.uTime.value = time;
  }
}

// スキン付きのまま動かすキャラクター（プレイヤー・ボス）
export class Rig {
  constructor(file, clipsFile, height, hide = []) {
    const src = gltfs[file];
    this.root = SkeletonUtils.clone(src.scene);
    this.root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (hide.includes(o.name)) o.visible = false; }
    });
    const box = new THREE.Box3().setFromObject(this.root);
    const s = height / Math.max(0.01, box.max.y - box.min.y);
    this.inner = this.root;
    this.root = new THREE.Group();
    this.inner.scale.setScalar(s);
    this.inner.position.y = -box.min.y * s;
    this.root.add(this.inner);
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.clips = {};
    for (const c of gltfs[clipsFile].animations) this.clips[c.name] = c;
    this.cur = null;
  }
  play(name, { fade = 0.15, once = false, speed = 1 } = {}) {
    const clip = this.clips[name];
    if (!clip) return;
    const a = this.mixer.clipAction(clip);
    if (this.cur === a && !once) return;
    a.reset();
    a.setEffectiveTimeScale(speed);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    a.play();
    this.cur = a;
  }
  update(dt) { this.mixer.update(dt); }
  // 敵や木の陰に入っても位置が分かるよう、遮られた部分だけを光る影絵で描く。
  // 本体より先（renderOrder が小さい）に描くので、本体自身の重なりでは光らない
  silhouette(color) {
    const mat = new THREE.MeshBasicMaterial({
      color, opacity: 0.75, blending: THREE.AdditiveBlending, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false,
    });
    const list = [];
    this.root.traverse((o) => { if (o.isMesh && o.visible) list.push(o); });
    for (const o of list) {
      o.renderOrder = 10;
      // 帽子・杖などは骨に付いた普通のメッシュなので、そのまま複製して同じ骨へ付ける
      const s = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
      if (o.isSkinnedMesh) s.bind(o.skeleton, o.bindMatrix);
      s.position.copy(o.position); s.quaternion.copy(o.quaternion); s.scale.copy(o.scale);
      s.renderOrder = 9; s.frustumCulled = false;
      o.parent.add(s);
    }
    return mat;
  }
  // 発光・フラッシュ用に全マテリアルへアクセス
  materials() {
    const out = [];
    this.root.traverse((o) => { if (o.isMesh) out.push(o.material); });
    return out;
  }
}
