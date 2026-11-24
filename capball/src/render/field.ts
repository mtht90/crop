import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { BASES, FENCE_H, fenceDist, MOUND_Z, BASE_DIST } from '../game/geom';
import { addOutline, toToon, toonGradient } from './toon';

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = 1) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

/** 空き地のグラウンド（土・ライン・まばらな芝） */
function groundTexture() {
  const S = 2048, R = 52; // 104m 四方を 2048px に
  const toPx = (x: number, z: number) => [(x / R) * (S / 2) + S / 2, (z / R) * (S / 2) + S / 2];
  return canvasTex(S, S, (c) => {
    c.fillStyle = '#c9a77c';
    c.fillRect(0, 0, S, S);
    // 土のムラ
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 40;
      c.fillStyle = `rgba(${rnd() < 0.5 ? '150,115,80' : '225,200,160'},${0.05 + rnd() * 0.08})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    // 外野のまばらな草
    for (let i = 0; i < 900; i++) {
      const a = (rnd() - 0.5) * Math.PI * 0.62, d = 20 + rnd() * 26;
      const [x, y] = toPx(Math.sin(a) * d, -Math.cos(a) * d);
      c.fillStyle = `rgba(${110 + rnd() * 30},${150 + rnd() * 30},${70 + rnd() * 20},${0.25 + rnd() * 0.35})`;
      c.beginPath(); c.ellipse(x, y, 8 + rnd() * 26, 5 + rnd() * 16, rnd() * 3, 0, Math.PI * 2); c.fill();
    }
    // 内野（踏み固められた明るい土）
    c.fillStyle = 'rgba(236,206,160,0.55)';
    c.beginPath();
    const [hx, hy] = toPx(0, 0);
    c.moveTo(hx, hy);
    for (let i = 0; i <= 32; i++) {
      const a = -Math.PI / 4 + (Math.PI / 2) * (i / 32);
      const [x, y] = toPx(Math.sin(a) * 20.5, -Math.cos(a) * 20.5);
      c.lineTo(x, y);
    }
    c.closePath(); c.fill();
    // マウンド
    const [mx, my] = toPx(0, MOUND_Z);
    c.fillStyle = 'rgba(205,160,110,0.9)';
    c.beginPath(); c.arc(mx, my, 1.6 * (S / 2 / R), 0, Math.PI * 2); c.fill();
    // 本塁まわり
    c.beginPath(); c.arc(hx, hy, 2.6 * (S / 2 / R), 0, Math.PI * 2); c.fill();
    // ライン（石灰）
    c.strokeStyle = 'rgba(255,255,250,0.92)';
    c.lineWidth = 0.09 * (S / 2 / R);
    c.lineCap = 'round';
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(hx, hy);
      const [x, y] = toPx(s * 40, -40); c.lineTo(x, y); c.stroke();
    }
    // バッターボックス
    const box = (cx: number) => {
      const [x0, y0] = toPx(cx - 0.45, -0.9), [x1, y1] = toPx(cx + 0.45, 0.9);
      c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    };
    box(-0.85); box(0.85);
    // キャッチャーボックス
    const [cx0, cy0] = toPx(-0.5, 0.9), [cx1, cy1] = toPx(0.5, 2.4);
    c.beginPath(); c.moveTo(cx0, cy0); c.lineTo(cx0, cy1); c.lineTo(cx1, cy1); c.lineTo(cx1, cy0); c.stroke();
    // ベースライン（走路）をうっすら
    c.strokeStyle = 'rgba(160,120,80,0.35)';
    c.lineWidth = 0.9 * (S / 2 / R);
    c.beginPath();
    for (const b of [...BASES, BASES[0]]) { const [x, y] = toPx(b.x, b.z); c.lineTo(x, y); }
    c.stroke();
  });
}

function chainLinkTexture() {
  return canvasTex(128, 128, (c) => {
    c.clearRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(205,215,220,0.95)';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(128, 128); c.moveTo(128, 0); c.lineTo(0, 128);
    c.moveTo(-64, 64); c.lineTo(64, 192); c.moveTo(64, -64); c.lineTo(192, 64);
    c.moveTo(192, 64); c.lineTo(64, 192); c.moveTo(64, -64); c.lineTo(-64, 64);
    c.stroke();
  });
}

export interface Field {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
}

export function buildField(scene: THREE.Scene, assets: Assets, renderer: THREE.WebGLRenderer): Field {
  const group = new THREE.Group();
  scene.add(group);

  // 空（Poly Haven の HDRI）と環境光
  const pmrem = new THREE.PMREMGenerator(renderer);
  assets.envHdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(assets.envHdr).texture;
  assets.sky.mapping = THREE.EquirectangularReflectionMapping;
  assets.sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = assets.sky;
  scene.backgroundIntensity = 1.0;
  scene.backgroundRotation.set(0, 2.2, 0);
  scene.environmentIntensity = 0.6;
  scene.fog = new THREE.Fog('#d6e6f2', 80, 210);

  const hemi = new THREE.HemisphereLight('#e8f3ff', '#8a6d4a', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dd', 2.6);
  sun.position.set(-18, 30, 14);
  sun.target.position.set(0, 0, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -28; sc.right = 28; sc.top = 30; sc.bottom = -26; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(104, 104),
    new THREE.MeshToonMaterial({ map: groundTexture(), gradientMap: toonGradient() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  // 外側のアスファルト
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshToonMaterial({ color: '#6f7377', gradientMap: toonGradient() }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = -0.02;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // ベース
  const baseMat = new THREE.MeshToonMaterial({ color: '#fbfbf6', gradientMap: toonGradient() });
  for (let i = 1; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), baseMat);
    b.position.copy(BASES[i]).setY(0.03);
    b.rotation.y = Math.PI / 4;
    b.castShadow = b.receiveShadow = true;
    addOutline(b, 0.01);
    group.add(b);
  }
  const plateShape = new THREE.Shape([
    new THREE.Vector2(-0.22, 0), new THREE.Vector2(0.22, 0), new THREE.Vector2(0.22, 0.22),
    new THREE.Vector2(0, 0.44), new THREE.Vector2(-0.22, 0.22),
  ]);
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(plateShape, { depth: 0.03, bevelEnabled: false }), baseMat);
  plate.rotation.x = Math.PI / 2;
  plate.position.set(0, 0.031, -0.22);
  plate.receiveShadow = true;
  group.add(plate);
  // マウンドの板
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.15), baseMat);
  rubber.position.set(0, 0.03, MOUND_Z);
  group.add(rubber);

  // フェンス（金網）
  const linkTex = chainLinkTexture();
  linkTex.wrapS = linkTex.wrapT = THREE.RepeatWrapping;
  const N = 48;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI / 4 - 0.12 + ((Math.PI / 2 + 0.24) * i) / N;
    const d = fenceDist(th);
    pts.push(new THREE.Vector3(Math.sin(th) * d, 0, -Math.cos(th) * d));
  }
  // バックネット側まで延長
  const back = [new THREE.Vector3(-26, 0, 14), new THREE.Vector3(-8, 0, 14), new THREE.Vector3(8, 0, 14), new THREE.Vector3(26, 0, 14)];
  const fenceLine = [back[0], ...pts, back[3]];
  const fenceGeo = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [];
  let acc = 0;
  for (let i = 0; i < fenceLine.length - 1; i++) {
    const a = fenceLine[i], b = fenceLine[i + 1];
    const len = a.distanceTo(b);
    const hh = FENCE_H;
    pos.push(a.x, 0, a.z, b.x, 0, b.z, b.x, hh, b.z, a.x, 0, a.z, b.x, hh, b.z, a.x, hh, a.z);
    const u0 = acc / 0.35, u1 = (acc + len) / 0.35, v1 = hh / 0.35;
    uv.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1);
    acc += len;
  }
  fenceGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fenceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  fenceGeo.computeVertexNormals();
  const fence = new THREE.Mesh(fenceGeo, new THREE.MeshBasicMaterial({ map: linkTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3, color: '#dfe6ea' }));
  group.add(fence);
  // バックネット（高い）
  const netGeo = new THREE.PlaneGeometry(16, 6);
  const netTex = linkTex.clone();
  netTex.repeat.set(16 / 0.35, 6 / 0.35);
  netTex.needsUpdate = true;
  const net = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: '#dfe6ea' }));
  net.position.set(0, 3, 14);
  group.add(net);
  // 支柱と上端のパイプ
  const postMat = new THREE.MeshToonMaterial({ color: '#8b9aa3', gradientMap: toonGradient() });
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, FENCE_H, 6);
  for (let i = 0; i < fenceLine.length; i += 2) {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.copy(fenceLine[i]).setY(FENCE_H / 2);
    group.add(p);
  }
  const railCurve = new THREE.CatmullRomCurve3(fenceLine.map((p) => p.clone().setY(FENCE_H)));
  const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 160, 0.05, 6, false), postMat);
  group.add(rail);
  for (const x of [-8, 8]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 6), postMat);
    p.position.set(x, 3, 14);
    group.add(p);
  }

  // 街並み（KayKit City Builder Bits）
  const parts = new Map<string, THREE.Object3D>();
  for (const c of assets.city.scene.children) parts.set(c.name, c);
  const cityMats = new Map<THREE.Material, THREE.Material>();
  const place = (name: string, x: number, z: number, rotY: number, scale = 3.2, outline = true) => {
    const src = parts.get(name);
    if (!src) return null;
    const o = src.clone(true);
    o.position.set(x, 0, z);
    o.rotation.y = rotY;
    o.scale.setScalar(scale);
    const meshes: THREE.Mesh[] = [];
    o.traverse((m) => { if ((m as THREE.Mesh).isMesh) meshes.push(m as THREE.Mesh); });
    meshes.forEach((mesh) => {
      const mat = mesh.material as THREE.Material;
      if (!cityMats.has(mat)) cityMats.set(mat, toToon(mat));
      mesh.material = cityMats.get(mat)!;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (outline) addOutline(mesh, 0.012 / scale * 3.2);
    });
    group.add(o);
    return o;
  };
  // 外野の向こうに建物を弧状に並べる
  const blds = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
  let bi = 0;
  for (let th = -1.25; th <= 1.25; th += 0.21) {
    const d = fenceDist(Math.max(-Math.PI / 4, Math.min(Math.PI / 4, th))) + 13 + (bi % 3) * 2.5;
    const x = Math.sin(th) * d, z = -Math.cos(th) * d;
    place(blds[(bi * 5 + 3) % blds.length], x, z, -th, 3.6 + (bi % 2) * 0.4);
    bi++;
  }
  // 本塁後方・側方の建物
  for (const [x, z, r, n] of [[-30, 20, 0.4, 'building_C'], [-14, 22, 0, 'building_F'], [2, 23, 0, 'building_A'], [17, 22, 0, 'building_H'], [31, 18, -0.4, 'building_B'], [-40, -4, Math.PI / 2, 'building_E'], [40, -4, -Math.PI / 2, 'building_G']] as const) {
    place(n, x, z, r + Math.PI, 3.6);
  }
  place('watertower', -46, -58, 0.3, 4.5);
  // 遠景：町を一周ぐるりと（輪郭線なしで軽く）
  let k = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const r = 66 + (k % 3) * 7;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r - 6;
    place(blds[(k * 3 + 1) % blds.length], x, z, -a, 4 + (k % 4) * 0.5, false);
    k++;
  }
  for (let a = 0.1; a < Math.PI * 2; a += 0.35) place('watertower', Math.sin(a) * 88, -Math.cos(a) * 88 - 6, a, 5, false);
  // フェンス沿いの小物
  for (let th = -0.7; th <= 0.7; th += 0.35) {
    const d = fenceDist(th) + 3.2;
    place('streetlight', Math.sin(th) * d, -Math.cos(th) * d, -th + Math.PI, 3.2);
  }
  for (let th = -0.85; th <= 0.85; th += 0.17) {
    const d = fenceDist(th) + 1.2;
    place('bush', Math.sin(th) * d + Math.sin(th * 7) * 0.6, -Math.cos(th) * d, th * 3, 2.4 + Math.abs(Math.sin(th * 9)) * 0.8, false);
  }
  place('bench', -15, 8, Math.PI / 2 + 0.6, 3);
  place('bench', 15, 8, -Math.PI / 2 - 0.6, 3);
  place('trash_A', -18.5, 1, 0.5, 3);
  place('trash_B', 18.8, 1.4, -0.3, 3);
  place('box_A', 21, -2, 0.4, 3);
  place('firehydrant', -21, -3, 0, 3);
  place('car_sedan', -24, 12, 0.2, 3.2);
  place('car_hatchback', 25, 11, -0.3, 3.2);
  place('dumpster', 34, -16, -1.2, 3.2);
  place('car_taxi', -36, -22, 1.3, 3.2);

  return { group, sun };
}

export const FIELD_CONSTANTS = { BASE_DIST };
