// 人物（Microsoft Rocketbox のアバター）と犬：読み込み・着せ替え・アニメーション
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTFB64 } from './b64.js';

// name: フォルダ名, g: 性別（アニメーションの種類）, h: 身長(m)
export const AVATARS = {
  Business_Female_03: { g: 'f', h: 1.55 },
  Female_Adult_03: { g: 'f', h: 1.6 },
  Female_Adult_05: { g: 'f', h: 1.58 },
  Female_Adult_11: { g: 'f', h: 1.6 },
  Medical_Female_01: { g: 'f', h: 1.58 },
  Chef_Female_01: { g: 'f', h: 1.6, noOpa: true },
  Business_Male_02: { g: 'm', h: 1.72 },
  Male_Adult_09: { g: 'm', h: 1.74 },
  Male_Adult_10: { g: 'm', h: 1.7 },
  Male_Adult_03: { g: 'm', h: 1.66 },
  Gardener_Male_01: { g: 'm', h: 1.68 },
  Business_Male_07: { g: 'm', h: 1.7, noOpa: true },
};
const ANIM_NAMES = ['idle_neutral_01', 'gestic_talk_neutral_01', 'wave_01', 'walk_neutral_01'];
const SHORT = { idle_neutral_01: 'idle', gestic_talk_neutral_01: 'talk', wave_01: 'wave', walk_neutral_01: 'walk' };

const loaded = {}; // name → THREE.Object3D（ひな形）
const clips = { m: {}, f: {} };
let dogProto = null;

const texLoader = new THREE.TextureLoader();
function tex(path, srgb) {
  return new Promise((res) => texLoader.load(path, (t) => {
    t.flipY = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    res(t);
  }, undefined, () => res(null)));
}

const gltfLoader = new GLTFLoader();
function loadGLB(url) { return loadGLTFB64(gltfLoader, url + '.txt'); }

// 身長に合わせて縮尺をそろえ、足元を原点に
function normalize(root, height) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const h = box.max.y - box.min.y;
  const s = height / h;
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  root.position.y -= b2.min.y;
  return s;
}

async function prepareAvatar(name) {
  const base = `assets/people/${name}/`;
  const [g, body, bodyN, head, headN, opa] = await Promise.all([
    loadGLB(base + 'model.glb'), tex(base + 'body.jpg', true), tex(base + 'body_n.jpg'), tex(base + 'head.jpg', true), tex(base + 'head_n.jpg'), AVATARS[name].noOpa ? Promise.resolve(null) : tex(base + 'opacity.png', true),
  ]);
  const root = g.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      const n = (m.name || '').toLowerCase();
      if (n.includes('opacity')) {
        return new THREE.MeshStandardMaterial({ map: opa, alphaTest: 0.35, transparent: false, side: THREE.DoubleSide, roughness: 0.8 });
      }
      const isHead = n.includes('head');
      return new THREE.MeshStandardMaterial({
        map: isHead ? head : body, normalMap: isHead ? headN : bodyN, roughness: isHead ? 0.62 : 0.85, metalness: 0,
      });
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  const holder = new THREE.Group();
  holder.add(root);
  normalize(holder, AVATARS[name].h);
  loaded[name] = holder;
}

async function prepareClips() {
  for (const g of ['m', 'f']) {
    for (const a of ANIM_NAMES) {
      const gl = await loadGLB(`assets/people/anim/${g}_${a}.glb`);
      const clip = gl.animations[0];
      if (!clip) continue;
      // 歩きは移動量を消してその場で歩かせる（移動はプログラムで行う）
      if (a.startsWith('walk')) clip.tracks = clip.tracks.filter(t => !/^Bip01\.position/.test(t.name));
      clip.tracks = clip.tracks.filter(t => !/Footsteps|MotionExtraction/.test(t.name));
      clip.name = SHORT[a];
      clips[g][SHORT[a]] = clip;
    }
  }
}

async function prepareDog() {
  const base = 'assets/people/Dog_Beagle_01/';
  const [g, body, bodyN] = await Promise.all([loadGLB(base + 'model.glb'), tex(base + 'body.jpg', true), tex(base + 'body_n.jpg')]);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    o.material = new THREE.MeshStandardMaterial({ map: body, normalMap: bodyN, roughness: 0.9 });
  });
  const holder = new THREE.Group(); holder.add(g.scene);
  normalize(holder, 0.42);
  dogProto = holder;
}

export async function loadPeople(onProgress) {
  const names = Object.keys(AVATARS);
  let n = 0;
  const step = () => onProgress && onProgress(++n / (names.length + 2));
  await Promise.all(names.map(nm => prepareAvatar(nm).then(step).catch((e) => { console.warn('avatar', nm, e); step(); })));
  await prepareClips().catch(e => console.warn('clips', e)); step();
  await prepareDog().catch(e => console.warn('dog', e)); step();
}

// 人を1人置く。play('idle'|'talk'|'wave'|'walk')
export class Person {
  constructor(scene, name, opts = {}) {
    const proto = loaded[name] || loaded[Object.keys(loaded)[0]];
    this.name = name;
    this.gender = AVATARS[name] ? AVATARS[name].g : 'm';
    this.group = proto ? skClone(proto) : new THREE.Group();
    if (opts.tint) this.group.traverse(o => {
      if (o.isMesh && o.material && o.material.map && !o.material.alphaTest) {
        // 頭以外（服）を少し色替え
        if (o.material.roughness > 0.7) { o.material = o.material.clone(); o.material.color = new THREE.Color(opts.tint); }
      }
    });
    scene.add(this.group);
    this.mixer = new THREE.AnimationMixer(this.group);
    this.actions = {};
    this.current = null;
    this.play('idle', 0);
  }
  play(kind, fade = 0.35) {
    const clip = clips[this.gender][kind];
    if (!clip) return;
    let a = this.actions[kind];
    if (!a) { a = this.mixer.clipAction(clip); this.actions[kind] = a; }
    if (this.current === a) return;
    a.reset().play();
    if (kind === 'wave') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; }
    if (this.current && fade > 0) this.current.crossFadeTo(a, fade, false);
    else if (this.current) this.current.stop();
    this.current = a;
    this.kind = kind;
    if (kind === 'wave') {
      const back = () => { this.mixer.removeEventListener('finished', back); if (this.kind === 'wave') this.play('idle'); };
      this.mixer.addEventListener('finished', back);
    }
  }
  place(x, y, z, rotY) { this.group.position.set(x, y, z); this.group.rotation.y = rotY; }
  update(dt) { this.mixer.update(dt); }
  dispose() { this.group.removeFromParent(); this.mixer.stopAllAction(); }
}

export function spawnDog(scene) {
  if (!dogProto) return null;
  const d = skClone(dogProto);
  scene.add(d);
  return d;
}

export const hasPeople = () => Object.keys(loaded).length > 0;
