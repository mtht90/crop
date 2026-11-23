// 湖の景色: 空(Poly Haven の HDRI)、水面、岸辺、岩、距離ブイ。
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

// 空の画像は HDRI の u = 0.30..0.80 / v = 0..0.5625 を切り出したもの。
// 正面(-Z)が HDRI の u = 0.55 になるように置く。太陽は u=0.60, v=0.47。
export const SKY = { uCenter: 0.55, uSpan: 0.5, vSpan: 0.5625 };
const SUN_LON = (0.6 - SKY.uCenter) * Math.PI * 2; // +で右
const SUN_LAT = (0.5 - 0.47) * Math.PI;
export const SUN_DIR = new THREE.Vector3(
  Math.sin(SUN_LON) * Math.cos(SUN_LAT),
  Math.sin(SUN_LAT),
  -Math.cos(SUN_LON) * Math.cos(SUN_LAT),
).normalize();

const A = (p) => new URL(`../assets/${p}`, import.meta.url).href;

export async function loadWorld(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);
  const tex = new THREE.TextureLoader(manager);
  const loadTex = (p, srgb = false) =>
    new Promise((res, rej) =>
      tex.load(
        A(p),
        (t) => {
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          res(t);
        },
        undefined,
        rej,
      ),
    );

  const loadJson = (p) => new THREE.FileLoader(manager).setResponseType('json').loadAsync(A(p));
  const [skyTex, envTex, waterNormals, stoneMaps, shoreMaps, rockData, rockMaps] = await Promise.all([
    loadTex('sky/sky_dawn.jpg', true),
    loadTex('sky/env_dawn.jpg', true),
    loadTex('tex/waternormals.jpg'),
    Promise.all(['diff', 'nor_gl', 'arm'].map((m, i) => loadTex(`tex/rock_surface_${m}.jpg`, i === 0))),
    Promise.all(['diff', 'nor_gl', 'arm'].map((m, i) => loadTex(`tex/river_small_rocks_${m}.jpg`, i === 0))),
    loadJson('models/rock_07/rock_07.json'),
    Promise.all(['diff', 'nor_gl', 'arm'].map((m, i) => loadTex(`models/rock_07/textures/rock_07_${m}_1k.jpg`, i === 0))),
  ]);

  const scene = new THREE.Scene();

  // ---- 環境光(HDRI のパノラマから作る映り込みと照明) ----
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(envTex);
  envTex.dispose();
  pmrem.dispose();
  scene.environment = envRT.texture;
  // three.js の正距円筒は u=0.25 が -Z。正面を u=0.55 にするため 0.30 周ぶん回す。
  scene.environmentRotation.y = -0.3 * Math.PI * 2;
  scene.environmentIntensity = 1.4;

  // ---- 空 ----
  skyTex.generateMipmaps = false;
  skyTex.minFilter = THREE.LinearFilter;
  skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
  skyTex.anisotropy = 1;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        map: { value: skyTex },
        uCenter: { value: SKY.uCenter },
        uSpan: { value: SKY.uSpan },
        vSpan: { value: SKY.vSpan },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w; // 常に一番奥
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float uCenter, uSpan, vSpan;
        varying vec3 vDir;
        #include <common>
        void main() {
          vec3 d = normalize(vDir);
          float lon = atan(d.x, -d.z);
          float lat = asin(clamp(d.y, -1.0, 1.0));
          float u = uCenter + lon / (2.0 * PI);
          float v = 0.5 - lat / PI;
          vec2 uv = vec2((u - (uCenter - uSpan * 0.5)) / uSpan, 1.0 - v / vSpan);
          vec3 col = texture2D(map, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // ---- 太陽の光 ----
  const sun = new THREE.DirectionalLight(0xffd29a, 2.2);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x9cc4e8, 0x5a4630, 0.35));
  // 逆光で手元が暗くなりすぎないよう、背中側から弱い補助光
  const fill = new THREE.DirectionalLight(0xfff1dc, 1.1);
  fill.position.set(-0.3, 0.8, 1).multiplyScalar(50);
  scene.add(fill);

  // ---- 水面 ----
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
  const water = new Water(new THREE.PlaneGeometry(8000, 8000), {
    textureWidth: isSmall ? 512 : 1024,
    textureHeight: isSmall ? 512 : 1024,
    waterNormals,
    sunDirection: SUN_DIR.clone(),
    sunColor: 0xffe2b0,
    waterColor: 0x0e3640,
    distortionScale: 2.2,
    fog: false,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 3.2;
  // 映り込みを少し抑えて、湖らしい深い色を出す
  water.material.fragmentShader = water.material.fragmentShader
    .replace('vec3( 0.1 ) + reflectionSample * 0.9', 'waterColor * 0.55 + reflectionSample * 0.68')
    .replace('float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );', 'float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 4.0 );');
  water.material.needsUpdate = true;
  scene.add(water);

  // ---- 岸辺(手前の小石の浜) ----
  for (const t of shoreMaps) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(14, 6);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  const shoreGeo = new THREE.PlaneGeometry(70, 26, 140, 52);
  shoreGeo.rotateX(-Math.PI / 2);
  const sp = shoreGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i) - 3; // 中心を少し奥へ
    sp.setZ(i, z);
    sp.setY(i, shoreHeight(x, z));
  }
  shoreGeo.computeVertexNormals();
  const shore = new THREE.Mesh(
    shoreGeo,
    new THREE.MeshStandardMaterial({
      map: shoreMaps[0],
      normalMap: shoreMaps[1],
      aoMap: shoreMaps[2],
      roughnessMap: shoreMaps[2],
      roughness: 1,
      metalness: 0,
      color: 0xd9c2a0,
      normalScale: new THREE.Vector2(1.2, 1.2),
    }),
  );
  scene.add(shore);

  // ---- 岩(Poly Haven rock_07 を JSON に変換したもの) ----
  const rockSrc = new THREE.Mesh(decodeMesh(rockData), new THREE.MeshStandardMaterial({
    map: rockMaps[0],
    normalMap: rockMaps[1],
    aoMap: rockMaps[2],
    roughnessMap: rockMaps[2],
    metalnessMap: rockMaps[2],
    metalness: 0,
    envMapIntensity: 0.8,
  }));
  for (const t of rockMaps) {
    t.flipY = false; // glTF の UV 向き
    t.needsUpdate = true;
  }
  const box = new THREE.Box3().setFromObject(rockSrc);
  const size = box.getSize(new THREE.Vector3());
  const unit = 1 / Math.max(size.x, size.y, size.z);
  const rocks = [
    { x: -3.6, z: -3.2, s: 1.7, ry: 0.6, sink: 0.35 },
    { x: 4.8, z: -5.2, s: 2.6, ry: 2.4, sink: 0.6 },
    { x: -9.5, z: -9, s: 4.2, ry: 1.2, sink: 1.2 },
    { x: 11, z: -12, s: 5.5, ry: 4.0, sink: 1.8 },
    { x: 2.2, z: -2.4, s: 0.7, ry: 5.1, sink: 0.15 },
  ];
  for (const r of rocks) {
    const m = rockSrc.clone(true);
    m.scale.setScalar(unit * r.s);
    m.rotation.y = r.ry;
    m.position.set(r.x, shoreHeight(r.x, r.z) - r.sink - box.min.y * unit * r.s, r.z);
    scene.add(m);
  }

  // ---- 石(投げる石)の材質 ----
  for (const t of stoneMaps) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.3, 1.3);
  }
  const stoneMaterial = new THREE.MeshStandardMaterial({
    map: stoneMaps[0],
    normalMap: stoneMaps[1],
    roughnessMap: stoneMaps[2],
    aoMap: stoneMaps[2],
    roughness: 0.85,
    metalness: 0,
    color: 0xb9b2a8,
    envMapIntensity: 1.1,
  });

  // ---- 距離ブイ ----
  const buoys = makeBuoys(scene);

  return {
    scene,
    water,
    stoneMaterial,
    buoys,
    update(t, dt) {
      water.material.uniforms.time.value += dt * 0.55;
      for (const b of buoys) {
        b.obj.position.y = Math.sin(t * 1.3 + b.phase) * 0.06 - 0.05;
        b.obj.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.06;
        b.obj.rotation.x = Math.cos(t * 1.1 + b.phase) * 0.05;
      }
    },
  };
}

/** base64 で埋め込んだ頂点データから BufferGeometry を作る */
function decodeMesh(d) {
  const bytes = (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bytes(d.position)), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bytes(d.normal)), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bytes(d.uv)), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes(d.index)), 1));
  return g;
}

/** 岸辺の高さ。中央の入り江は手前で水に沈み、左右は奥へ張り出す。 */
export function shoreHeight(x, z) {
  const ax = Math.abs(x);
  const edge = -1.6 + Math.sin(x * 0.55) * 0.5 + Math.sin(x * 1.7 + 1.3) * 0.18;
  const cove = Math.pow(Math.max(0, ax - 5), 1.35) * 0.55; // 左右の岬
  let y = (z - edge + cove) * 0.17;
  y += Math.sin(x * 2.3 + z * 1.7) * 0.03 + Math.sin(x * 5.1 - z * 4.3) * 0.015;
  return Math.max(-1.5, Math.min(y, 0.9 + cove * 0.12));
}

function makeBuoys(scene) {
  const list = [];
  const red = new THREE.MeshStandardMaterial({ color: 0xe0482e, roughness: 0.45 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.5 });
  const body = new THREE.CylinderGeometry(0.28, 0.36, 0.5, 20);
  const cap = new THREE.ConeGeometry(0.28, 0.4, 20);
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8);
  for (const d of [25, 50, 75, 100, 125, 150]) {
    for (const side of [-1]) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, red);
      b.position.y = 0.1;
      const c = new THREE.Mesh(cap, white);
      c.position.y = 0.55;
      const p = new THREE.Mesh(pole, white);
      p.position.y = 1.0;
      g.add(b, c, p);
      const label = makeLabel(`${d}m`);
      label.position.y = 1.85;
      g.add(label);
      const x = side * (5.5 + d * 0.22);
      g.position.set(x, 0, -d);
      const s = 1 + d / 45;
      g.scale.setScalar(s);
      scene.add(g);
      list.push({ obj: g, phase: d * 0.37 + side });
    }
  }
  return list;
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '800 76px "Baloo 2", "M PLUS Rounded 1c", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(13,42,51,0.85)';
  g.strokeText(text, 128, 68);
  g.fillStyle = '#fff8ec';
  g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(1.6, 0.8, 1);
  return s;
}
