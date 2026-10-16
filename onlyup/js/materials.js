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
  rust: 0x8a5a3a, brick: 0x8c4a3a, iron: 0x80868a, grate: 0x6a5a4a, concrete: 0x8f8e8a, snow: 0xe8edf2, ice: 0xbfe6ff, marble: 0xe6e0d6, cable: 0x2b2826,
};

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
    const L = this.loader;
    const p = Promise.all([L.texture(s.map, true), L.texture(s.normal), L.texture(s.arm || s.rough)])
      .then(([map, normal, arm]) => ({ map, normal, arm: s.arm ? arm : null, rough: s.rough ? arm : null }));
    this.loaded.set(key, p);
    return p;
  }

  get(key, opts = {}) {
    const id = key + JSON.stringify(opts);
    if (this.cache.has(id)) return this.cache.get(id);
    const set = this.sets[key];
    if (!set) { // テクスチャを持たない素材（ケーブルなど）
      const plain = new THREE.MeshStandardMaterial({ color: FALLBACK[key] ?? opts.color ?? 0x333333, roughness: 0.55, metalness: 0.2 });
      this.cache.set(id, plain);
      return plain;
    }
    const m = new THREE.MeshStandardMaterial({
      color: opts.color ?? FALLBACK[key] ?? 0xffffff,
      roughness: opts.roughness ?? 0.9,
      metalness: 0,
      envMapIntensity: opts.env ?? 1,
    });
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    if (key === 'ice') { m.roughness = 0.35; m.metalness = 0.05; m.envMapIntensity = 1.6; }
    this.load(key).then((t) => {
      m.color.set(opts.color ?? (key === 'ice' ? 0xd8f2ff : 0xffffff));
      m.map = t.map; m.normalMap = t.normal;
      m.normalScale.setScalar(opts.normal ?? 1);
      if (t.arm) {
        m.aoMap = t.arm; m.aoMapIntensity = 0.9; m.roughnessMap = t.arm; m.roughness = opts.roughness ?? 1;
        if (set.metal) { m.metalnessMap = t.arm; m.metalness = 1; }
      } else if (t.rough) m.roughnessMap = t.rough;
      m.needsUpdate = true;
    }).catch((e) => console.warn(e.message));
    this.cache.set(id, m);
    return m;
  }

  tile(key) { return this.sets[key]?.tile ?? 1; }
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
