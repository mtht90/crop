import * as THREE from 'three';

/**
 * 実寸ベースのボックス投影UV。どんな形状でもテクスチャの密度(m単位)が揃う。
 * 面法線の支配軸で投影平面を決める（per-face）。aoMap 用に uv をそのまま流用する。
 */
export function boxProjectUV(geometry, tile = 2, offset = new THREE.Vector3()) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      const px = p.x + offset.x, py = p.y + offset.y, pz = p.z + offset.z;
      let u, v;
      if (ay >= ax && ay >= az) { u = px; v = pz; }
      else if (ax >= az) { u = pz * Math.sign(n.x || 1); v = py; }
      else { u = -px * Math.sign(n.z || 1); v = py; }
      uv[(i + k) * 2] = u / tile;
      uv[(i + k) * 2 + 1] = v / tile;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const FALLBACK = {
  rock: 0x6f6a62, sandrock: 0x8a7a62, wood: 0x7b6650, bluewood: 0x4c6a86, shutter: 0x7d8a86, fabric: 0x3f5f8a,
  rust: 0x8a5a3a, brick: 0x8c4a3a, iron: 0x80868a, grate: 0x6a5a4a, concrete: 0x8f8e8a, snow: 0xe8edf2, ice: 0xbfe6ff, marble: 0xe6e0d6,
  plaster: 0xb8ab94, roofiron: 0x7a5a44, gravel: 0x777068, freight: 0x8a4a34, greenmetal: 0x5d6e58, metalplate: 0x8a8c8e, factorywall: 0x8d8478,
  tilewall: 0xd8d6d0, terrazzo: 0xb8b2a8, plywood: 0xa88a64, rebar: 0x8a8884, paintedmetal: 0xb59a40, asphalt: 0x3e3e40, marbletile: 0xd8d2c8,
  whiteplaster: 0xe2ded6, bluemetal: 0x50708a, woodfloor: 0x8a6440, carpet: 0x6a5a58, facade: 0x9a948a, rooftile: 0x9a5a3e, spacemetal: 0x9a9ea4,
  cable: 0x2b2826,
};

// 全マテリアル共通：ワールド座標のノイズで汚れと色ムラを重ねる（同じテクスチャの繰り返しを崩す）
const GRIME = { uGrime: { value: null } };
export function setGrimeTexture(tex) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; GRIME.uGrime.value = tex; }
const BLANK = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1); BLANK.needsUpdate = true;
GRIME.uGrime.value = BLANK;

function addGrime(m, amount) {
  m.userData.grime = { value: amount };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = GRIME.uGrime;
    sh.uniforms.uGrimeAmt = m.userData.grime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW; uniform sampler2D uGrime; uniform float uGrimeAmt;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float gA = texture2D(uGrime, vGW.xz * 0.031 + vec2(vGW.y * 0.017)).r;
        float gB = texture2D(uGrime, vGW.zy * 0.093 + vec2(vGW.x * 0.041)).g;
        float gC = texture2D(uGrime, vGW.xy * 0.27).b;
        float grime = mix(0.66, 1.1, smoothstep(0.22, 0.82, gA * 0.55 + gB * 0.3 + gC * 0.15));
        vec3 tint = mix(vec3(1.0), vec3(1.06, 0.98, 0.88), smoothstep(0.4, 0.9, gB));
        diffuseColor.rgb *= mix(vec3(1.0), tint * grime, uGrimeAmt);`);
  };
  m.customProgramCacheKey = () => 'grime';
}

/** PBR マテリアル（Poly Haven の ARM = AO/Roughness/Metal パック）。テクスチャは届いた順に差し込む */
export class MaterialLibrary {
  constructor(loader, sets) {
    this.loader = loader;
    this.sets = sets;
    this.cache = new Map();
    this.loaded = new Map(); // key -> Promise<textures>
  }

  /** テクスチャセットの読み込みを開始（多重呼び出し可） */
  load(key) {
    if (this.loaded.has(key)) return this.loaded.get(key);
    const s = this.sets[key];
    if (!s) return Promise.resolve(null);
    const L = this.loader;
    const p = Promise.all([L.texture(s.map, true), L.texture(s.normal), L.texture(s.arm || s.rough)])
      .then(([map, normal, arm]) => ({ map, normal, arm: s.arm ? arm : null, rough: s.rough ? arm : null }));
    this.loaded.set(key, p);
    return p;
  }

  /** opts: color, roughness, metal(強制金属), emissive, env, normal, grime(0..1), gold, glass */
  get(key, opts = {}) {
    const id = key + JSON.stringify(opts);
    if (this.cache.has(id)) return this.cache.get(id);
    if (opts.glass) {
      const g = new THREE.MeshStandardMaterial({ color: opts.color ?? 0x1c2a33, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.6, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
      this.cache.set(id, g);
      return g;
    }
    const set = this.sets[key];
    if (!set) { // テクスチャを持たない素材（ケーブルなど）
      const plain = new THREE.MeshStandardMaterial({ color: opts.color ?? FALLBACK[key] ?? 0x333333, roughness: opts.roughness ?? 0.55, metalness: opts.metal ? 1 : 0.2, vertexColors: true });
      this.cache.set(id, plain);
      return plain;
    }
    const m = new THREE.MeshStandardMaterial({
      color: opts.color ?? FALLBACK[key] ?? 0xffffff,
      roughness: opts.roughness ?? 0.9,
      metalness: 0,
      envMapIntensity: opts.env ?? 1,
      vertexColors: true,
    });
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    if (key === 'ice') { m.roughness = 0.35; m.metalness = 0.05; m.envMapIntensity = 1.6; }
    addGrime(m, opts.grime ?? (key === 'ice' || key === 'snow' || key === 'marble' ? 0.35 : 0.85));
    this.load(key).then((t) => {
      m.color.set(opts.color ?? (key === 'ice' ? 0xd8f2ff : 0xffffff));
      m.map = t.map; m.normalMap = t.normal;
      m.normalScale.setScalar(opts.normal ?? 1.25);
      if (t.arm) {
        m.aoMap = t.arm; m.aoMapIntensity = 1; m.roughnessMap = t.arm; m.roughness = opts.roughness ?? 1;
        if (set.metal || opts.metal) { m.metalnessMap = set.metal ? t.arm : null; m.metalness = opts.metal ? 1 : 1; }
      } else if (t.rough) m.roughnessMap = t.rough;
      if (opts.gold) { m.color.set(0xffc457); m.metalness = 1; m.roughness = 0.32; m.metalnessMap = null; m.envMapIntensity = 1.5; }
      m.needsUpdate = true;
    }).catch((e) => console.warn(e?.message));
    this.cache.set(id, m);
    return m;
  }

  tile(key) { return this.sets[key]?.tile ?? 1; }
}

/** 頂点カラー：色のばらつき × 接地部分を暗くする疑似AO（下ほど暗い） */
export function bakeColor(geo, tint = 1, { ao = true, aoStrength = 0.42 } = {}) {
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const h = max.y - min.y;
  const col = new Float32Array(pos.count * 3);
  const c = tint instanceof THREE.Color ? tint : new THREE.Color(tint, tint, tint);
  for (let i = 0; i < pos.count; i++) {
    let k = 1;
    if (ao && h > 0.5) {
      const t = (pos.getY(i) - min.y) / h;
      k = 1 - aoStrength * (1 - THREE.MathUtils.smoothstep(t, 0, Math.min(0.45, 1.2 / h)));
    }
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** 旗をはためかせる：標準マテリアルに頂点シェーダーを注入 */
export function makeFlagMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 });
  mat.userData.uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = mat.userData.uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float w = uv.x;
        transformed.z += sin(uv.x * 7.0 - uTime * 6.0) * 0.12 * w + sin(uv.y * 5.0 + uTime * 3.0) * 0.04 * w;
      `);
  };
  return mat;
}

/** 発光ビーム（ビーコン/ゴール用）の加算合成シェーダー */
export function makeBeamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.55 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){
        float fade = pow(1.0 - vUv.y, 1.6);
        float flow = 0.65 + 0.35 * sin(vUv.y * 40.0 - uTime * 4.0);
        float edge = sin(vUv.x * 3.14159 * 2.0) * 0.5 + 0.5;
        gl_FragColor = vec4(uColor * (1.4 + flow), fade * uOpacity * (0.55 + 0.45 * edge));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** ジャンプパッド上面：同心円の波紋が脈打つシェーダー */
export function makePadMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uKick: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uKick; varying vec2 vUv;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float rings = smoothstep(0.55, 1.0, sin(d * 18.0 - uTime * 6.0) * 0.5 + 0.5);
        float rim = smoothstep(0.86, 0.98, d);
        vec3 c = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.85, 0.3), d);
        float a = (rings * 0.8 + rim) * (1.0 - smoothstep(0.98, 1.0, d));
        gl_FragColor = vec4(c * (1.5 + uKick * 3.0), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
