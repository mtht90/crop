import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { FENCE_H, fenceDist, MOUND_Z, OUT_ZONE, PASSBALL_Z } from '../game/geom';
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

/** 空き地のグラウンド（土・アウトゾーン・ヒットゾーン・ライン） */
function groundTexture() {
  const S = 2048, R = 26; // 52m 四方を 2048px に
  const k = S / 2 / R;
  const toPx = (x: number, z: number) => [x * k + S / 2, z * k + S / 2 + 10 * k] as const; // 本塁を少し下寄せ
  return canvasTex(S, S, (c) => {
    c.fillStyle = '#c9a77c';
    c.fillRect(0, 0, S, S);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2200; i++) {
      const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 40;
      c.fillStyle = `rgba(${rnd() < 0.5 ? '150,115,80' : '225,200,160'},${0.05 + rnd() * 0.08})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    const [hx, hy] = toPx(0, 0);
    // フェア区域（扇形）
    const fan = () => {
      c.beginPath();
      c.moveTo(hx, hy);
      for (let i = 0; i <= 48; i++) {
        const a = -Math.PI / 4 + (Math.PI / 2) * (i / 48);
        const d = fenceDist(a);
        const [x, y] = toPx(Math.sin(a) * d, -Math.cos(a) * d);
        c.lineTo(x, y);
      }
      c.closePath();
    };
    // ヒットゾーン（芝）
    fan();
    c.fillStyle = '#86b85a';
    c.fill();
    c.save();
    fan();
    c.clip();
    for (let i = 0; i < 900; i++) {
      const x = hx + (rnd() - 0.5) * 34 * k, y = hy - rnd() * 17 * k;
      c.fillStyle = `rgba(${90 + rnd() * 40},${140 + rnd() * 40},${60 + rnd() * 25},${0.25 + rnd() * 0.35})`;
      c.beginPath(); c.ellipse(x, y, 4 + rnd() * 14, 3 + rnd() * 9, rnd() * 3, 0, Math.PI * 2); c.fill();
    }
    // 芝の刈り目
    for (let i = 0; i < 9; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,40,0,0.05)';
      c.beginPath();
      c.moveTo(hx, hy);
      const a0 = -Math.PI / 4 + (Math.PI / 2) * (i / 9), a1 = -Math.PI / 4 + (Math.PI / 2) * ((i + 1) / 9);
      for (const a of [a0, a1]) { const [x, y] = toPx(Math.sin(a) * 20, -Math.cos(a) * 20); c.lineTo(x, y); }
      c.fill();
    }
    c.restore();
    // アウトゾーン（踏み固めた土）
    c.beginPath();
    OUT_ZONE.forEach(([x, z], i) => { const [px, py] = toPx(x, z); if (i) c.lineTo(px, py); else c.moveTo(px, py); });
    c.closePath();
    c.fillStyle = '#dcb98a';
    c.fill();
    // マウンドと本塁まわり
    const [mx, my] = toPx(0, MOUND_Z);
    c.fillStyle = 'rgba(205,160,110,0.95)';
    c.beginPath(); c.arc(mx, my, 1.0 * k, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(hx, hy + 0.6 * k, 2.0 * k, 0, Math.PI * 2); c.fill();
    // ライン（石灰）
    c.strokeStyle = 'rgba(255,255,250,0.95)';
    c.lineWidth = 0.08 * k;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const sgn of [-1, 1]) {
      c.beginPath(); c.moveTo(hx, hy);
      const [x, y] = toPx(sgn * 13 / Math.SQRT2 * 1.02, -13 / Math.SQRT2 * 1.02); c.lineTo(x, y); c.stroke();
    }
    // アウトゾーンの境界線（両翼8mの点とマウンドを結ぶ）
    c.beginPath();
    for (const i of [1, 2, 3]) { const [px, py] = toPx(OUT_ZONE[i][0], OUT_ZONE[i][1]); if (i === 1) c.moveTo(px, py); else c.lineTo(px, py); }
    c.stroke();
    // バッターボックス・キャッチャーボックス
    const box = (cx: number) => {
      const [x0, y0] = toPx(cx - 0.4, -0.9), [x1, y1] = toPx(cx + 0.4, 0.9);
      c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    };
    box(-0.8); box(0.8);
    const [cx0, cy0] = toPx(-0.5, 0.9), [cx1, cy1] = toPx(0.5, 2.3);
    c.beginPath(); c.moveTo(cx0, cy0); c.lineTo(cx0, cy1); c.lineTo(cx1, cy1); c.lineTo(cx1, cy0); c.stroke();
    // パスボールライン
    c.setLineDash([0.25 * k, 0.18 * k]);
    const [px0, py0] = toPx(-3.2, PASSBALL_Z), [px1] = toPx(3.2, PASSBALL_Z);
    c.beginPath(); c.moveTo(px0, py0); c.lineTo(px1, py0); c.stroke();
    c.setLineDash([]);
    // 文字
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = `bold ${0.55 * k}px "Dela Gothic One", sans-serif`;
    c.textAlign = 'center';
    const [ox, oy] = toPx(0, -5.2);
    c.fillText('OUT ZONE', ox, oy);
    const [tx, ty] = toPx(0, -12.4);
    c.fillText('HIT ZONE', tx, ty);
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
  if (assets.sky) {
    assets.sky.mapping = THREE.EquirectangularReflectionMapping;
    assets.sky.colorSpace = THREE.SRGBColorSpace;
    scene.environment = pmrem.fromEquirectangular(assets.sky).texture;
    scene.background = assets.sky;
  } else scene.background = new THREE.Color('#9cc8ee');
  scene.backgroundIntensity = 1.0;
  scene.backgroundRotation.set(0, 2.2, 0);
  scene.environmentIntensity = 0.6;
  scene.fog = new THREE.Fog('#d6e6f2', 60, 170);

  const hemi = new THREE.HemisphereLight('#e8f3ff', '#8a6d4a', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dd', 2.6);
  sun.position.set(-18, 30, 14);
  sun.target.position.set(0, 0, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -20; sc.right = 20; sc.top = 22; sc.bottom = -18; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 52),
    new THREE.MeshToonMaterial({ map: groundTexture(), gradientMap: toonGradient() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -10;
  ground.receiveShadow = true;
  group.add(ground);
  // 外側のアスファルト
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshToonMaterial({ color: '#6f7377', gradientMap: toonGradient() }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = -0.02;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  const baseMat = new THREE.MeshToonMaterial({ color: '#fbfbf6', gradientMap: toonGradient() });
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

  // フェンス（高さ75cmの板塀。キャップが当たると三塁打・二塁打）
  const N = 40;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI / 4 + ((Math.PI / 2) * i) / N;
    const d = fenceDist(th);
    pts.push(new THREE.Vector3(Math.sin(th) * d, 0, -Math.cos(th) * d));
  }
  const boardMat = new THREE.MeshToonMaterial({ color: '#2f6fd6', gradientMap: toonGradient() });
  const capMat = new THREE.MeshToonMaterial({ color: '#fff6d8', gradientMap: toonGradient() });
  const yellow = new THREE.MeshToonMaterial({ color: '#ffc93c', gradientMap: toonGradient() });
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, FENCE_H, len + 0.02), i % 2 ? boardMat : yellow);
    board.position.copy(mid).setY(FENCE_H / 2);
    board.rotation.y = yaw;
    board.castShadow = board.receiveShadow = true;
    group.add(board);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, len + 0.04), capMat);
    top.position.copy(mid).setY(FENCE_H + 0.03);
    top.rotation.y = yaw;
    group.add(top);
    addOutline(board, 0.01);
  }
  // バックネット（本塁の後方）
  const linkTex = chainLinkTexture();
  linkTex.wrapS = linkTex.wrapT = THREE.RepeatWrapping;
  linkTex.repeat.set(10 / 0.35, 4 / 0.35);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshBasicMaterial({ map: linkTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: '#dfe6ea' }));
  net.position.set(0, 2, 13);
  group.add(net);
  const postMat = new THREE.MeshToonMaterial({ color: '#8b9aa3', gradientMap: toonGradient() });
  for (const x of [-5, 5]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), postMat);
    p.position.set(x, 2, 13);
    group.add(p);
  }

  // 街並み（KayKit City Builder Bits）
  const parts = new Map<string, THREE.Object3D>();
  for (const c of assets.city?.scene.children ?? []) parts.set(c.name, c);
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
  // 空き地を囲む建物
  const blds = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
  let bi = 0;
  for (let th = -1.3; th <= 1.3; th += 0.2) {
    const d = 27 + (bi % 3) * 2.2;
    place(blds[(bi * 5 + 3) % blds.length], Math.sin(th) * d, -Math.cos(th) * d - 3, -th, 3.4 + (bi % 2) * 0.4);
    bi++;
  }
  for (const [x, z, r, n] of [[-20, 15, 0.5, 'building_C'], [-8, 19, 0, 'building_F'], [6, 19, 0, 'building_A'], [19, 16, -0.5, 'building_H'], [-27, 2, Math.PI / 2, 'building_E'], [27, 2, -Math.PI / 2, 'building_G']] as const) {
    place(n, x, z, r + Math.PI, 3.4);
  }
  place('watertower', -30, -40, 0.3, 4.5);
  let k = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    const r = 50 + (k % 3) * 7;
    place(blds[(k * 3 + 1) % blds.length], Math.sin(a) * r, -Math.cos(a) * r - 6, -a, 4 + (k % 4) * 0.5, false);
    k++;
  }
  for (let a = 0.1; a < Math.PI * 2; a += 0.35) place('watertower', Math.sin(a) * 72, -Math.cos(a) * 72 - 6, a, 5, false);
  // フェンス沿いの小物
  for (let th = -0.7; th <= 0.71; th += 0.35) {
    const d = fenceDist(th) + 3.5;
    place('streetlight', Math.sin(th) * d, -Math.cos(th) * d, -th + Math.PI, 3.0);
  }
  for (let th = -0.95; th <= 0.95; th += 0.19) {
    const d = fenceDist(Math.min(Math.abs(th), Math.PI / 4)) + 1.3;
    place('bush', Math.sin(th) * d, -Math.cos(th) * d, th * 3, 2.2 + Math.abs(Math.sin(th * 9)) * 0.7, false);
  }
  place('bench', -9, 6, Math.PI / 2 + 0.6, 2.8);
  place('bench', 9, 6, -Math.PI / 2 - 0.6, 2.8);
  place('trash_A', -11, 3, 0.5, 2.8);
  place('trash_B', 11.5, 3.4, -0.3, 2.8);
  place('box_A', 13, -1, 0.4, 2.8);
  place('firehydrant', -13, -2, 0, 2.8);
  place('car_sedan', -17, 9, 0.2, 3);
  place('car_hatchback', 17, 8, -0.3, 3);

  return { group, sun };
}

