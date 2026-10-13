// 背景：夜空・月・地面・木々（チャンク配置で無限に続く）・石灯籠・鳥居・蛍・桜の花びら
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ENV = 'assets/env/';
const CELL = 14;          // チャンク一辺(m)
const RANGE = 3;          // プレイヤー周囲 ±RANGE チャンクを配置

// 種類ごとの出現（1 チャンクあたりの平均個数・縮尺・木かどうか）
const PROPS = [
  { f: 'CherryBlossom_1', n: 0.12, s: [0.35, 0.45], big: true },
  { f: 'CherryBlossom_3', n: 0.06, s: [0.35, 0.42], big: true },
  { f: 'DeadTree_1', n: 0.18, s: [0.45, 0.65], big: true },
  { f: 'DeadTree_3', n: 0.12, s: [0.4, 0.55], big: true },
  { f: 'Pine_2', n: 0.14, s: [0.5, 0.7], big: true },
  { f: 'TwistedTree_2', n: 0.06, s: [0.35, 0.45], big: true },
  { f: 'Rock_Big_1', n: 0.2, s: [0.3, 0.5], big: true },
  { f: 'Rock_Medium_1', n: 0.45, s: [0.25, 0.45] },
  { f: 'Rock_Medium_3', n: 0.35, s: [0.25, 0.45] },
  { f: 'Pebble_Round_2', n: 1.0, s: [0.6, 1.2] },
  { f: 'Bush_Common', n: 0.8, s: [0.35, 0.55] },
  { f: 'Bush_Large', n: 0.25, s: [0.3, 0.45] },
  { f: 'Fern_1', n: 1.2, s: [0.35, 0.6] },
  { f: 'Grass_Wispy_Tall', n: 6, s: [0.3, 0.55] },
  { f: 'Grass_Common_Short', n: 9, s: [0.35, 0.6] },
  { f: 'Mushroom_RedCap', n: 0.5, s: [0.3, 0.5] },
  { f: 'Flower_3_Group', n: 1.4, s: [0.3, 0.45] },
  { f: 'Plant_1', n: 0.8, s: [0.35, 0.55] },
];

function hash(x, y, k) {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// カメラとプレイヤーの間にある木・岩をディザで透かす（後ろの戦況が見えるように）
export const XRAY = { cam: new THREE.Vector3(), player: new THREE.Vector3() };
function xray(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCam = { value: XRAY.cam };
    sh.uniforms.uPl = { value: XRAY.player };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vXw;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvXw = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uCam; uniform vec3 uPl; varying vec3 vXw;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec3 ab = uPl - uCam; float h = clamp(dot(vXw - uCam, ab) / dot(ab, ab), 0.0, 1.0);
        float d = length(vXw - (uCam + ab * h));
        if (h < 0.97 && d < 3.2) {
          float th = smoothstep(3.2, 1.2, d) * 0.85;
          vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
          float dither = (q.x * 4.0 + q.y + mod(q.x + q.y, 2.0) * 8.0) / 16.0;
          if (dither < th) discard;
        }`);
  };
}

export class World {
  constructor(scene, mobile) {
    this.scene = scene;
    this.mobile = mobile;
    this.cx = null; this.cy = null;
    this.sets = [];
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    let done = 0;
    await Promise.all(PROPS.map(async (p) => {
      const g = await loader.loadAsync(ENV + p.f + '.json');
      g.scene.updateMatrixWorld(true);
      p.parts = [];
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.material.side = THREE.DoubleSide;
          if (p.big) xray(o.material);
          p.parts.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() });
        }
      });
      onProgress && onProgress(++done / PROPS.length);
    }));
    this.build();
  }

  build() {
    const sc = this.scene;
    const cells = (RANGE * 2 + 1) ** 2;
    // 空：上は藍、地平は紫がかった赤
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){ float h = normalize(vP).y;
          vec3 top = vec3(0.02,0.03,0.09), mid = vec3(0.07,0.05,0.17), hor = vec3(0.16,0.07,0.15);
          vec3 c = mix(hor, mid, smoothstep(-0.02, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.7, h));
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.renderOrder = -10;
    this.sky = sky;
    sc.add(sky);
    // 星
    const sp = [];
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 + 0.12;
      sp.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
    sc.add(this.stars);
    // 月（ブルームで光る）
    const moon = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ color: 0xffe8b0, fog: false }));
    moon.position.set(-150, 150, -260);
    moon.lookAt(0, 0, 0);
    this.moon = moon;
    sc.add(moon);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(48, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.0; gl_FragColor = vec4(vec3(1.0,0.8,0.5)*pow(1.0-d,3.0)*0.5, 1.0); }',
    }));
    halo.position.copy(moon.position).multiplyScalar(1.01);
    halo.lookAt(0, 0, 0);
    this.halo = halo;
    sc.add(halo);

    // 地面：草地の色むら＋土の道筋をノイズで（ワールド座標基準なので継ぎ目なし）
    const gmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    gmat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*n2(p); p *= 2.03; a *= 0.5; } return s; }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float g = fbm(vW.xz * 0.15);
          float d = fbm(vW.xz * 0.05 + 7.0);
          vec3 grass = mix(vec3(0.10,0.20,0.10), vec3(0.20,0.33,0.14), g);
          grass = mix(grass, vec3(0.16,0.22,0.12), n2(vW.xz * 1.7) * 0.4);
          vec3 dirt = mix(vec3(0.22,0.17,0.12), vec3(0.30,0.24,0.16), g);
          float path = smoothstep(0.52, 0.56, d) * (1.0 - smoothstep(0.60, 0.64, d));
          diffuseColor.rgb = mix(grass, dirt, path * 0.85);`);
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), gmat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    sc.add(ground);

    // 小物のインスタンス
    for (const p of PROPS) {
      const cap = Math.ceil(p.n * cells * 2.2) + 4;
      p.ims = p.parts.map((part) => {
        const im = new THREE.InstancedMesh(part.geo, part.mat, cap);
        im.count = 0;
        im.castShadow = !!p.big && !this.mobile;
        im.receiveShadow = true;
        im.frustumCulled = false;
        sc.add(im);
        return im;
      });
    }
    // 石灯籠（手続き的に組む。火袋が発光してブルームで灯る）
    this.lanterns = this.makeLantern(cells);
    this.torii = this.makeTorii(cells);

    // 蛍と花びら
    const N = this.mobile ? 60 : 140;
    this.ff = { n: N, pos: new Float32Array(N * 3), ph: new Float32Array(N) };
    for (let i = 0; i < N; i++) { this.ff.ph[i] = Math.random() * 100; }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.ff.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.ffPts = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xc8ff7a, size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ffPts.frustumCulled = false;
    sc.add(this.ffPts);
    const PN = this.mobile ? 40 : 80;
    const pg = new THREE.PlaneGeometry(0.07, 0.05);
    this.petals = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffb7d0, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), PN);
    this.petals.frustumCulled = false;
    this.petalSt = Array.from({ length: PN }, () => ({ x: (Math.random() - 0.5) * 40, y: Math.random() * 10, z: (Math.random() - 0.5) * 40, r: Math.random() * 6, s: 0.5 + Math.random() }));
    sc.add(this.petals);
  }

  makeLantern(cells) {
    const stone = new THREE.MeshStandardMaterial({ color: 0x8d8d96, roughness: 0.95 });
    const fire = new THREE.MeshBasicMaterial({ color: 0xffb25a });
    const parts = [
      [new THREE.CylinderGeometry(0.32, 0.38, 0.18, 6), stone, 0.09],
      [new THREE.CylinderGeometry(0.1, 0.12, 0.7, 6), stone, 0.53],
      [new THREE.CylinderGeometry(0.28, 0.22, 0.12, 6), stone, 0.94],
      [new THREE.BoxGeometry(0.3, 0.28, 0.3), fire, 1.14],
      [new THREE.ConeGeometry(0.45, 0.32, 6), stone, 1.44],
      [new THREE.SphereGeometry(0.08, 8, 6), stone, 1.64],
    ];
    const cap = Math.ceil(cells * 0.35) + 4;
    return parts.map(([g, m, y]) => {
      g.translate(0, y, 0);
      const im = new THREE.InstancedMesh(g, m, cap);
      im.count = 0; im.castShadow = !this.mobile; im.frustumCulled = false;
      this.scene.add(im);
      return im;
    });
  }

  makeTorii(cells) {
    const red = new THREE.MeshStandardMaterial({ color: 0xc8283a, roughness: 0.6, emissive: 0x2a0408 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.7 });
    const parts = [
      [new THREE.CylinderGeometry(0.18, 0.2, 4.2, 10).translate(-1.6, 2.1, 0), red],
      [new THREE.CylinderGeometry(0.18, 0.2, 4.2, 10).translate(1.6, 2.1, 0), red],
      [new THREE.BoxGeometry(4.2, 0.28, 0.32).translate(0, 3.4, 0), red],
      [new THREE.BoxGeometry(5.2, 0.32, 0.45).translate(0, 4.25, 0), black],
      [new THREE.BoxGeometry(0.3, 0.6, 0.2).translate(0, 3.8, 0), red],
    ];
    const cap = Math.ceil(cells * 0.1) + 3;
    return parts.map(([g, m]) => {
      const im = new THREE.InstancedMesh(g, m, cap);
      im.count = 0; im.castShadow = !this.mobile; im.frustumCulled = false;
      this.scene.add(im);
      return im;
    });
  }

  // プレイヤーのチャンクが変わったら配置し直す
  update(px, pz, t, dt, camera) {
    this.ground.position.set(Math.round(px / 50) * 50, 0, Math.round(pz / 50) * 50);
    this.sky.position.set(px, 0, pz);
    this.stars.position.set(px, 0, pz);
    this.moon.position.set(px - 150, 150, pz - 260);
    this.halo.position.set(px - 151.5, 151.5, pz - 262.6);
    const cx = Math.floor(px / CELL), cy = Math.floor(pz / CELL);
    if (cx !== this.cx || cy !== this.cy) { this.cx = cx; this.cy = cy; this.place(cx, cy); }

    // 蛍：プレイヤーの周囲をふわふわ
    const f = this.ff;
    for (let i = 0; i < f.n; i++) {
      const ph = f.ph[i] + t * 0.3;
      const ang = ph * 1.7 + i, rad = 4 + (i % 9) * 2.2;
      f.pos[i * 3] = px + Math.cos(ang * 0.31) * rad + Math.sin(ph * 2.3) * 0.8;
      f.pos[i * 3 + 1] = 0.6 + (i % 5) * 0.35 + Math.sin(ph * 3.1) * 0.25;
      f.pos[i * 3 + 2] = pz + Math.sin(ang * 0.27) * rad + Math.cos(ph * 1.9) * 0.8;
    }
    this.ffPts.geometry.attributes.position.needsUpdate = true;
    this.ffPts.material.opacity = 0.6 + Math.sin(t * 2) * 0.3;
    // 花びら
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    this.petalSt.forEach((p, i) => {
      p.y -= dt * 0.7 * p.s; p.x += dt * 0.6; p.r += dt * 2 * p.s;
      if (p.y < 0) { p.y = 8 + Math.random() * 3; p.x = (Math.random() - 0.5) * 40; p.z = (Math.random() - 0.5) * 40; }
      e.set(p.r, p.r * 0.7, p.r * 0.3); q.setFromEuler(e);
      v.set(px + ((p.x + 200) % 40) - 20, p.y, pz + p.z);
      m.compose(v, q, one);
      this.petals.setMatrixAt(i, m);
    });
    this.petals.instanceMatrix.needsUpdate = true;
  }

  place(cx, cy) {
    const m = new THREE.Matrix4(), base = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const p of PROPS) p.k = 0;
    let lk = 0, tk = 0;
    for (let gy = cy - RANGE; gy <= cy + RANGE; gy++) for (let gx = cx - RANGE; gx <= cx + RANGE; gx++) {
      // 原点付近（開始地点）は木を置かない
      const nearStart = Math.abs(gx) <= 0 && Math.abs(gy) <= 0;
      PROPS.forEach((p, pi) => {
        let n = Math.floor(p.n + hash(gx, gy, pi * 7 + 1));
        if (p.big && nearStart) n = 0;
        for (let k = 0; k < n; k++) {
          const x = (gx + hash(gx, gy, pi * 31 + k * 3 + 2)) * CELL, z = (gy + hash(gx, gy, pi * 31 + k * 3 + 3)) * CELL;
          const sc = p.s[0] + (p.s[1] - p.s[0]) * hash(gx, gy, pi * 13 + k);
          q.setFromAxisAngle(up, hash(gx, gy, pi * 17 + k) * Math.PI * 2);
          base.compose(v.set(x, 0, z), q, s.set(sc, sc, sc));
          for (let j = 0; j < p.parts.length; j++) {
            const im = p.ims[j];
            if (p.k >= im.instanceMatrix.count) break;
            m.multiplyMatrices(base, p.parts[j].m);
            im.setMatrixAt(p.k, m);
          }
          p.k++;
        }
      });
      if (hash(gx, gy, 999) < 0.3) {
        const x = (gx + 0.5 + (hash(gx, gy, 998) - 0.5) * 0.6) * CELL, z = (gy + 0.5 + (hash(gx, gy, 997) - 0.5) * 0.6) * CELL;
        q.setFromAxisAngle(up, hash(gx, gy, 996) * 6.28);
        base.compose(v.set(x, 0, z), q, s.set(1.3, 1.3, 1.3));
        for (const im of this.lanterns) if (lk < im.instanceMatrix.count) im.setMatrixAt(lk, base);
        lk++;
      }
      if (hash(gx, gy, 555) < 0.07 && !nearStart) {
        const x = (gx + 0.5) * CELL, z = (gy + 0.5) * CELL;
        q.setFromAxisAngle(up, Math.floor(hash(gx, gy, 554) * 4) * Math.PI / 2);
        base.compose(v.set(x, 0, z), q, s.set(1.4, 1.4, 1.4));
        for (const im of this.torii) if (tk < im.instanceMatrix.count) im.setMatrixAt(tk, base);
        tk++;
      }
    }
    for (const p of PROPS) for (const im of p.ims) { im.count = Math.min(p.k, im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; }
    for (const im of this.lanterns) { im.count = Math.min(lk, im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; }
    for (const im of this.torii) { im.count = Math.min(tk, im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; }
  }
}
