// すべて外部ホストの素材（CC0中心）。ローカルには一切アセットを置かない。
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PH = 'https://dl.polyhaven.org/file/ph-assets';
const THREE_EX = 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples';
const UISFX = 'https://cdn.jsdelivr.net/npm/uisfx@0.4.0/sounds';

const phTex = (id) => ({
  map: `${PH}/Textures/jpg/1k/${id}/${id}_diff_1k.jpg`,
  normal: `${PH}/Textures/jpg/1k/${id}/${id}_nor_gl_1k.jpg`,
  arm: `${PH}/Textures/jpg/1k/${id}/${id}_arm_1k.jpg`,
});

// tile = テクスチャ1枚が覆う実寸(m)
export const TEXTURE_SETS = {
  rock: { ...phTex('rock_wall_10'), tile: 3.2 },
  sandrock: { ...phTex('coast_sand_rocks_02'), tile: 4 },
  wood: { ...phTex('weathered_planks'), tile: 2.2 },
  rust: { ...phTex('rusty_metal_02'), tile: 2.5, metal: true },
  iron: { ...phTex('corrugated_iron_02'), tile: 2.4, metal: true },
  concrete: { ...phTex('concrete_wall_008'), tile: 3 },
  brick: { ...phTex('red_brick_03'), tile: 2.2 },
  snow: { ...phTex('snow_02'), tile: 3 },
  marble: { ...phTex('marble_01'), tile: 3 },
  ice: {
    map: `${THREE_EX}/textures/ambientcg/Ice002_1K-JPG_Color.jpg`,
    normal: `${THREE_EX}/textures/ambientcg/Ice002_1K-JPG_NormalGL.jpg`,
    rough: `${THREE_EX}/textures/ambientcg/Ice002_1K-JPG_Roughness.jpg`,
    tile: 3,
  },
};

export const URLS = {
  hdr: (res) => `${PH}/HDRIs/hdr/${res}/kloofendal_48d_partly_cloudy_puresky_${res}.hdr`,
  robot: `${THREE_EX}/models/gltf/RobotExpressive/RobotExpressive.glb`,
  waterNormals: `${THREE_EX}/textures/waternormals.jpg`,
  smoke: `${THREE_EX}/textures/opengameart/smoke1.png`,
  spark: `${THREE_EX}/textures/sprites/spark1.png`,
  flare0: `${THREE_EX}/textures/lensflare/lensflare0.png`,
  flare3: `${THREE_EX}/textures/lensflare/lensflare3.png`,
};

export const SOUNDS = {
  bgm: [`${THREE_EX}/sounds/Project_Utopia.ogg`, `${THREE_EX}/sounds/Project_Utopia.mp3`],
  jump: [`${UISFX}/rubber/press.ogg`, `${UISFX}/rubber/press.mp3`],
  land: [`${UISFX}/organic/drop.ogg`, `${UISFX}/organic/drop.mp3`],
  step: [`${UISFX}/soft/press.ogg`, `${UISFX}/soft/press.mp3`],
  bounce: [`${UISFX}/rubber/release.ogg`, `${UISFX}/rubber/release.mp3`],
  checkpoint: [`${UISFX}/arcade/checkpoint.ogg`, `${UISFX}/arcade/checkpoint.mp3`],
  zone: [`${UISFX}/cinematic/level-up.ogg`, `${UISFX}/cinematic/level-up.mp3`],
  fall: [`${UISFX}/cinematic/error.ogg`, `${UISFX}/cinematic/error.mp3`],
  splash: [`${UISFX}/glass/collapse.ogg`, `${UISFX}/glass/collapse.mp3`],
  crumble: [`${UISFX}/mechanical/collapse.ogg`, `${UISFX}/mechanical/collapse.mp3`],
  hit: [`${UISFX}/mechanical/blocked.ogg`, `${UISFX}/mechanical/blocked.mp3`],
  goal: [`${UISFX}/arcade/achievement.ogg`, `${UISFX}/arcade/achievement.mp3`],
  click: [`${UISFX}/minimal/select.ogg`, `${UISFX}/minimal/select.mp3`],
  hover: [`${UISFX}/minimal/hover.ogg`, `${UISFX}/minimal/hover.mp3`],
  doublejump: [`${UISFX}/scifi/swipe.ogg`, `${UISFX}/scifi/swipe.mp3`],
};

export async function loadAssets(renderer, { hdrRes = '1k', onProgress } = {}) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => onProgress?.(loaded / total, url);

  const texLoader = new THREE.TextureLoader(manager);
  texLoader.setCrossOrigin('anonymous');
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const loadTex = (url, srgb = false) => new Promise((resolve, reject) => {
    texLoader.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, maxAniso);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, () => reject(new Error('テクスチャ取得失敗: ' + url)));
  });

  const textures = {};
  const texJobs = Object.entries(TEXTURE_SETS).map(async ([key, set]) => {
    const [map, normal, arm] = await Promise.all([
      loadTex(set.map, true),
      loadTex(set.normal),
      loadTex(set.arm || set.rough),
    ]);
    textures[key] = { map, normal, arm: set.arm ? arm : null, rough: set.rough ? arm : null, tile: set.tile, metal: !!set.metal };
  });

  const misc = {};
  const miscJobs = [
    loadTex(URLS.waterNormals).then((t) => (misc.waterNormals = t)),
    loadTex(URLS.smoke, true).then((t) => (misc.smoke = t)),
    loadTex(URLS.spark, true).then((t) => (misc.spark = t)),
    loadTex(URLS.flare0, true).then((t) => (misc.flare0 = t)),
    loadTex(URLS.flare3, true).then((t) => (misc.flare3 = t)),
  ];

  const hdrJob = new Promise((resolve, reject) => {
    const l = new RGBELoader(manager);
    l.setDataType(THREE.FloatType); // 太陽位置の解析のため Float で受け取る
    l.load(URLS.hdr(hdrRes), resolve, undefined, () => reject(new Error('HDRI取得失敗')));
  });

  const gltfJob = new Promise((resolve, reject) => {
    new GLTFLoader(manager).load(URLS.robot, resolve, undefined, () => reject(new Error('キャラクターモデル取得失敗')));
  });

  const [hdr, gltf] = await Promise.all([hdrJob, gltfJob, ...texJobs, ...miscJobs]);
  return { textures, misc, hdr, gltf };
}

/**
 * HDRI の輝度を走査して太陽の方向と地平線の色を推定する。
 * これで平行光源・水面反射・フォグ色が空と一致する。
 */
export function analyzeHDR(hdr) {
  const { data, width, height } = hdr.image;
  const ch = data.length / (width * height);
  let best = -1, bx = 0, by = 0;
  const horizon = new THREE.Color(0, 0, 0);
  let hn = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * ch;
      const lum = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (lum > best) { best = lum; bx = x; by = y; }
      if (Math.abs(y - height * 0.5) < height * 0.02) {
        horizon.r += data[i]; horizon.g += data[i + 1]; horizon.b += data[i + 2]; hn++;
      }
    }
  }
  horizon.multiplyScalar(1 / hn);
  // equirect → 方向（three.js の equirectUv の逆変換）
  const u = (bx + 0.5) / width;
  const v = hdr.flipY ? 1 - (by + 0.5) / height : (by + 0.5) / height;
  const lon = (u - 0.5) * Math.PI * 2;
  let lat = (v - 0.5) * Math.PI;
  lat = THREE.MathUtils.clamp(lat, THREE.MathUtils.degToRad(28), THREE.MathUtils.degToRad(70));
  const sunDir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize();
  return { sunDir, horizon };
}
