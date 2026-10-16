import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

const $ = (id) => document.getElementById(id);

// =====================================================================
// 調整用パラメータ
// =====================================================================
const DT = 1 / 120; // 物理の固定タイムステップ

const CABINET = { half: 1.6, height: 3.4, wall: 0.08 };
// 投入口（手前左の角）
const CHUTE = { minX: -1.6, maxX: -0.85, minZ: 0.85, maxZ: 1.6, guardH: 0.3, depth: 1.2 };
const HOME = { x: (CHUTE.minX + CHUTE.maxX) / 2, z: (CHUTE.minZ + CHUTE.maxZ) / 2 };

const CLAW = {
  topY: 2.75,          // 待機時のハブ（爪の付け根）の高さ
  hingeR: 0.15,        // ハブ中心から爪の付け根までの距離
  armLen: 0.5,         // 爪の長さ
  armW: 0.05,
  armD: 0.1,
  tipLen: 0.17,        // 爪先（内側に曲がった部分）の長さ
  tipTilt: 0.35,       // 爪先の反り（rad）
  restAngle: 0.12,     // 待機時の開き
  openAngle: 0.78,     // 全開
  closedAngle: -0.06,  // 全閉（爪先同士が中央で重なる）
  squeeze: 0.05,       // 景品に触れてから追加で締める角度
  loosenAngle: 0.45,   // アームが弱まったときに爪が緩む最大角度
  moveSpeed: 1.1,
  dropSpeed: 0.95,
  liftSpeed: 0.75,
  returnSpeed: 1.0,
  openSpeed: 2.2,
  closeSpeed: 1.3,
  moveLimit: 1.3,
};

// 掴みやすさのプリセット
//   strength        : アームの保持力（%）。保持力[N] = 3 + strength/100 * 22
//   requiredFingers : 何本の爪が触れていれば「掴んだ」とみなすか
//   weakChance      : 上昇しきった後にアームが弱まる確率
//   weakFactor      : 弱まったときの保持力の倍率
//   extraPush       : 景品に触れてからさらに沈み込む距離
const PRESETS = {
  easy:   { strength: 90, requiredFingers: 1, weakChance: 0.0,  weakFactor: 0.7,  extraPush: 0.32,
            note: '爪1本でも掴めて、保持力も強め。運搬中に弱まりません。' },
  normal: { strength: 60, requiredFingers: 2, weakChance: 0.35, weakFactor: 0.3, extraPush: 0.24,
            note: '爪2本以上で掴み判定。たまに上でアームが弱まり、重い景品は落ちることも。' },
  hard:   { strength: 40, requiredFingers: 2, weakChance: 0.7,  weakFactor: 0.22, extraPush: 0.16,
            note: '本物のゲーセン寄り。重心を見極めて、引っ掛けや押し込みも狙おう。' },
};

const settings = {
  difficulty: 'normal',
  ...PRESETS.normal,
  guide: true,
  sound: true,
};

/** 現在の保持力（N）。物理エンジンの拘束は1ステップあたりの力積で制限されるため DT を掛けて使う */
function gripForceN() {
  return 3 + (settings.strength / 100) * 22;
}

// =====================================================================
// 物理ワールド
// =====================================================================
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.solver.iterations = 20;
world.solver.tolerance = 1e-4;
world.allowSleep = false;

const GROUP = { ENV: 1, PRIZE: 2, CLAW: 4 };
const MAT = {
  env: new CANNON.Material('env'),
  prize: new CANNON.Material('prize'),
  claw: new CANNON.Material('claw'),
};
world.defaultContactMaterial.friction = 0.4;
world.addContactMaterial(new CANNON.ContactMaterial(MAT.prize, MAT.env, { friction: 0.45, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(MAT.prize, MAT.prize, { friction: 0.4, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(MAT.prize, MAT.claw, {
  friction: 0.9,
  restitution: 0,
  contactEquationStiffness: 5e6,
  contactEquationRelaxation: 4,
}));

// =====================================================================
// 描画
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1033);
scene.fog = new THREE.Fog(0x1a1033, 12, 30);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 3.5;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 1.35, 0);

scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x332244, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2.5, 7, 3.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -2.5;
sun.shadow.camera.right = 2.5;
sun.shadow.camera.top = 2.5;
sun.shadow.camera.bottom = -2.5;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 15;
sun.shadow.bias = -0.0005;
scene.add(sun);
const pinkLight = new THREE.PointLight(0xff4fa3, 6, 8);
pinkLight.position.set(-2.5, 2.5, 2.5);
scene.add(pinkLight);
const cyanLight = new THREE.PointLight(0x46e0ff, 6, 8);
cyanLight.position.set(2.5, 2.5, 2.5);
scene.add(cyanLight);

// ---------------------------------------------------------------------
// テクスチャ生成ヘルパー
// ---------------------------------------------------------------------
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const floorTex = canvasTexture(256, 256, (g, w, h) => {
  const n = 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#f6d6ff' : '#ffffff';
      g.fillRect((i * w) / n, (j * h) / n, w / n, h / n);
    }
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(1.25, 1.25);

const backTex = canvasTexture(512, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#3b1d7a');
  grad.addColorStop(1, '#ff6fb5');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`;
    const x = Math.random() * w;
    const y = Math.random() * h * 0.7;
    const r = 1 + Math.random() * 3;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillText('★ PRIZE ★', w / 2, h * 0.32);
});

const marqueeTex = canvasTexture(1024, 192, (g, w, h) => {
  g.fillStyle = '#1b0b33';
  g.fillRect(0, 0, w, h);
  g.font = 'bold 110px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ff4fa3';
  g.shadowBlur = 30;
  g.fillStyle = '#ffe6f4';
  g.fillText('CLAW CATCHER', w / 2, h / 2 + 6);
});

function stripeTexture(colors) {
  return canvasTexture(256, 128, (g, w, h) => {
    const n = colors.length;
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i];
      g.fillRect((i * w) / n, 0, w / n + 1, h);
    }
  });
}

function giftTexture(base, ribbon) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = ribbon;
    g.fillRect(w * 0.42, 0, w * 0.16, h);
    g.fillRect(0, h * 0.42, w, h * 0.16);
  });
}

function canTexture(base, label) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(0, h * 0.35, w, h * 0.3);
    g.fillStyle = base;
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) g.fillText(label, (w / 2) * i + w / 4, h / 2);
  });
}

// =====================================================================
// 筐体
// =====================================================================
const M = {
  frame: new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.35, metalness: 0.2 }),
  frameDark: new THREE.MeshStandardMaterial({ color: 0x2a1650, roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xd8dce6, roughness: 0.25, metalness: 0.9 }),
  floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xbfe8ff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0,
    depthWrite: false, side: THREE.DoubleSide,
  }),
  acrylic: new THREE.MeshPhysicalMaterial({
    color: 0xfff27a, transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false,
  }),
  hole: new THREE.MeshStandardMaterial({ color: 0x0b0716, roughness: 1 }),
  back: new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9 }),
  marquee: new THREE.MeshBasicMaterial({ map: marqueeTex }),
  light: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
};

function addStaticBox(hx, hy, hz, x, y, z, material, opts = {}) {
  const body = new CANNON.Body({
    type: CANNON.Body.STATIC,
    material: MAT.env,
    collisionFilterGroup: GROUP.ENV,
    collisionFilterMask: GROUP.PRIZE,
  });
  body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
  body.position.set(x, y, z);
  world.addBody(body);
  if (material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = opts.receiveShadow ?? true;
    mesh.castShadow = opts.castShadow ?? false;
    if (opts.renderOrder !== undefined) mesh.renderOrder = opts.renderOrder;
    scene.add(mesh);
  }
  return body;
}

function addVisualBox(w, h, d, x, y, z, material, cast = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildCabinet() {
  const H = CABINET.half;
  const T = 0.1; // 床の厚み(半分)

  // --- 床（投入口の部分だけ穴が開いている） ---
  // 物理: 2枚の箱で穴を除いた領域を覆う
  addStaticBox((H - CHUTE.maxX) / 2, T, H, (CHUTE.maxX + H) / 2, -T, 0, null);
  addStaticBox((CHUTE.maxX + H) / 2, T, (CHUTE.minZ + H) / 2, (-H + CHUTE.maxX) / 2, -T, (-H + CHUTE.minZ) / 2, null);
  // 描画: 穴あきのシェイプ
  const shape = new THREE.Shape();
  shape.moveTo(-H, -H);
  shape.lineTo(H, -H);
  shape.lineTo(H, H);
  shape.lineTo(-H, H);
  shape.lineTo(-H, -H);
  // shape の y は -z に対応する（x軸まわりに -90° 回転するため）
  const hole = new THREE.Path();
  hole.moveTo(CHUTE.minX, -CHUTE.maxZ);
  hole.lineTo(CHUTE.minX, -CHUTE.minZ);
  hole.lineTo(CHUTE.maxX, -CHUTE.minZ);
  hole.lineTo(CHUTE.maxX, -CHUTE.maxZ);
  hole.lineTo(CHUTE.minX, -CHUTE.maxZ);
  shape.holes.push(hole);
  const floorGeo = new THREE.ShapeGeometry(shape);
  const floorMesh = new THREE.Mesh(floorGeo, M.floor);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);
  // 床の側面（厚み）
  addVisualBox(H * 2, T * 2 - 0.01, H * 2, 0, -T - 0.006, 0, M.frameDark).scale.set(0.999, 1, 0.999);

  // --- 投入口のガード（透明アクリル） ---
  const gt = 0.02;
  addStaticBox(gt, CHUTE.guardH / 2, (H - CHUTE.minZ) / 2, CHUTE.maxX, CHUTE.guardH / 2, (CHUTE.minZ + H) / 2, M.acrylic, { renderOrder: 2 });
  addStaticBox((CHUTE.maxX + H) / 2, CHUTE.guardH / 2, gt, (-H + CHUTE.maxX) / 2, CHUTE.guardH / 2, CHUTE.minZ, M.acrylic, { renderOrder: 2 });
  // ガード上端の縁取り
  addVisualBox(0.03, 0.03, H - CHUTE.minZ, CHUTE.maxX, CHUTE.guardH, (CHUTE.minZ + H) / 2, M.frame);
  addVisualBox(CHUTE.maxX + H, 0.03, 0.03, (-H + CHUTE.maxX) / 2, CHUTE.guardH, CHUTE.minZ, M.frame);

  // --- 投入口のシャフト ---
  const sw = 0.04;
  const sy = -CHUTE.depth / 2 - 0.1;
  const sh = CHUTE.depth / 2;
  const cx = (CHUTE.minX + CHUTE.maxX) / 2;
  const cz = (CHUTE.minZ + CHUTE.maxZ) / 2;
  const hw = (CHUTE.maxX - CHUTE.minX) / 2;
  const hd = (CHUTE.maxZ - CHUTE.minZ) / 2;
  addStaticBox(sw, sh, hd, CHUTE.minX - sw, sy, cz, M.hole);
  addStaticBox(sw, sh, hd, CHUTE.maxX + sw, sy, cz, M.hole);
  addStaticBox(hw, sh, sw, cx, sy, CHUTE.minZ - sw, M.hole);
  addStaticBox(hw, sh, sw, cx, sy, CHUTE.maxZ + sw, M.hole);
  addStaticBox(hw, 0.05, hd, cx, -CHUTE.depth - 0.15, cz, M.hole);

  // --- 外壁（ガラス） ---
  const W = CABINET.wall / 2;
  const ch = CABINET.height / 2;
  addStaticBox(H + W * 2, ch, W, 0, ch, H + W, M.glass, { receiveShadow: false, renderOrder: 3 });   // 手前
  addStaticBox(W, ch, H, -H - W, ch, 0, M.glass, { receiveShadow: false, renderOrder: 3 });          // 左
  addStaticBox(W, ch, H, H + W, ch, 0, M.glass, { receiveShadow: false, renderOrder: 3 });           // 右
  addStaticBox(H + W * 2, ch, W, 0, ch, -H - W, M.back);                                               // 奥
  // 天井（景品が飛び出さないように）
  addStaticBox(H + W * 2, W, H + W * 2, 0, CABINET.height + W, 0, null);

  // --- フレーム ---
  const post = 0.12;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addVisualBox(post, CABINET.height + 0.2, post, sx * (H + W), CABINET.height / 2 - 0.1, sz * (H + W), M.frame, true);
    }
  }
  // 上部の箱（マーキー）
  const topY = CABINET.height + 0.3;
  addVisualBox(H * 2 + 0.36, 0.6, H * 2 + 0.36, 0, topY, 0, M.frame);
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 0.2, 0.42), M.marquee);
  marquee.position.set(0, topY, H + 0.19);
  scene.add(marquee);
  // 天井の照明
  for (const lx of [-0.8, 0.8]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, H * 1.8), M.light);
    strip.position.set(lx, CABINET.height - 0.01, 0);
    scene.add(strip);
  }

  // --- 下部の筐体（側面パネルのみ。上面は床が覆う） ---
  const baseH = 1.3;
  const by = -0.2 - baseH / 2;
  const bo = H + 0.1;
  addVisualBox(bo * 2, baseH, 0.04, 0, by, bo, M.frame);
  addVisualBox(bo * 2, baseH, 0.04, 0, by, -bo, M.frame);
  addVisualBox(0.04, baseH, bo * 2, bo, by, 0, M.frame);
  addVisualBox(0.04, baseH, bo * 2, -bo, by, 0, M.frame);
  // 景品取り出し口
  addVisualBox(0.6, 0.4, 0.02, cx, -0.75, bo + 0.02, M.hole);
  addVisualBox(0.66, 0.04, 0.04, cx, -0.53, bo + 0.03, M.metal);

  // 投入口を示す床の矢印マーク
  const arrowTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#ffde59';
    g.beginPath();
    g.moveTo(w * 0.2, h * 0.8);
    g.lineTo(w * 0.8, h * 0.2);
    g.lineTo(w * 0.8, h * 0.55);
    g.moveTo(w * 0.8, h * 0.2);
    g.lineTo(w * 0.45, h * 0.2);
    g.lineWidth = 14;
    g.strokeStyle = '#ffde59';
    g.lineCap = 'round';
    g.stroke();
  });
  const arrow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  arrow.rotation.x = -Math.PI / 2;
  arrow.rotation.z = Math.PI / 2;
  arrow.position.set(CHUTE.maxX + 0.25, 0.003, CHUTE.minZ - 0.25);
  scene.add(arrow);

  // 床の周囲の装飾
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(12, 48),
    new THREE.MeshStandardMaterial({ color: 0x24164a, roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);
}
buildCabinet();

// =====================================================================
// クレーン（アーム）
// =====================================================================
const claw = {
  x: HOME.x,
  z: HOME.z,
  y: CLAW.topY,
  angles: [CLAW.restAngle, CLAW.restAngle, CLAW.restAngle],
  squeeze: [0, 0, 0],
  grabAngles: [0, 0, 0],
  blocked: [false, false, false],
  state: 'ready',
  t: 0,
  firstContactY: null,
  gripScale: 1,
  weakTarget: 1,
  wasWeak: false,
};

const FINGER_THETA = [0, 1, 2].map((i) => Math.PI / 2 + (i * Math.PI * 2) / 3);
const tipDir = { x: -Math.cos(CLAW.tipTilt), y: Math.sin(CLAW.tipTilt) };
const tipCenter = new CANNON.Vec3(
  tipDir.x * CLAW.tipLen / 2,
  -CLAW.armLen + tipDir.y * CLAW.tipLen / 2,
  0,
);
const tipQuat = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -CLAW.tipTilt);

function makeClawBody(id) {
  const body = new CANNON.Body({
    type: CANNON.Body.KINEMATIC,
    material: MAT.claw,
    collisionFilterGroup: GROUP.CLAW,
    collisionFilterMask: GROUP.PRIZE,
  });
  body.userData = { claw: id };
  return body;
}

// ハブ
const hubBody = makeClawBody('hub');
hubBody.addShape(new CANNON.Cylinder(0.19, 0.19, 0.16, 16), new CANNON.Vec3(0, 0.06, 0));
hubBody.position.set(claw.x, claw.y, claw.z);
world.addBody(hubBody);

const hubMesh = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.16, 32), M.metal);
  body.position.y = 0.06;
  body.castShadow = true;
  hubMesh.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, 0.1, 32), M.frame);
  cap.position.y = 0.19;
  cap.castShadow = true;
  hubMesh.add(cap);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 8), new THREE.MeshBasicMaterial({ color: 0x46e0ff }));
  lamp.position.y = 0.25;
  hubMesh.add(lamp);
  hubMesh.userData.lamp = lamp;
}
scene.add(hubMesh);

// 爪
const fingerBodies = [];
const fingerMeshes = [];
for (let i = 0; i < 3; i++) {
  const body = makeClawBody(i);
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(CLAW.armW / 2, CLAW.armLen / 2, CLAW.armD / 2)),
    new CANNON.Vec3(0, -CLAW.armLen / 2, 0),
  );
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(CLAW.tipLen / 2, CLAW.armW / 2, CLAW.armD / 2)),
    tipCenter,
    tipQuat,
  );
  world.addBody(body);
  fingerBodies.push(body);

  const g = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(CLAW.armW, CLAW.armLen, CLAW.armD), M.metal);
  arm.position.y = -CLAW.armLen / 2;
  arm.castShadow = true;
  g.add(arm);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(CLAW.tipLen, CLAW.armW, CLAW.armD), M.frame);
  tip.position.set(tipCenter.x, tipCenter.y, tipCenter.z);
  tip.quaternion.set(tipQuat.x, tipQuat.y, tipQuat.z, tipQuat.w);
  tip.castShadow = true;
  g.add(tip);
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 8), M.frame);
  g.add(knuckle);
  scene.add(g);
  fingerMeshes.push(g);
}

// ガントリー（描画のみ）
const railY = CABINET.height - 0.08;
const gantry = new THREE.Group();
for (const sx of [-1, 1]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, CABINET.half * 2), M.metal);
  rail.position.set(sx * (CABINET.half - 0.05), railY, 0);
  scene.add(rail);
}
const bridge = new THREE.Mesh(new THREE.BoxGeometry(CABINET.half * 2, 0.07, 0.1), M.metal);
bridge.position.y = railY - 0.06;
gantry.add(bridge);
const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.2), M.frame);
carriage.position.y = railY - 0.14;
carriage.castShadow = true;
gantry.add(carriage);
scene.add(gantry);
const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 8), M.frameDark);
scene.add(cable);

// 降下ガイド（レーザー）
const guideLine = new THREE.Mesh(
  new THREE.CylinderGeometry(0.006, 0.006, 1, 6),
  new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.55, depthWrite: false }),
);
scene.add(guideLine);
const guideRing = new THREE.Mesh(
  new THREE.RingGeometry(0.05, 0.075, 32),
  new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
);
guideRing.rotation.x = -Math.PI / 2;
scene.add(guideRing);

// 姿勢計算
const _qy = new CANNON.Quaternion();
const _qz = new CANNON.Quaternion();
const _v = new CANNON.Vec3();
const AXIS_Y = new CANNON.Vec3(0, 1, 0);
const AXIS_Z = new CANNON.Vec3(0, 0, 1);

function fingerPose(i, outPos, outQuat) {
  _qy.setFromAxisAngle(AXIS_Y, FINGER_THETA[i]);
  _qz.setFromAxisAngle(AXIS_Z, claw.angles[i]);
  _qy.mult(_qz, outQuat);
  _qy.vmult(_v.set(CLAW.hingeR, 0, 0), outPos);
  outPos.x += claw.x;
  outPos.y += claw.y;
  outPos.z += claw.z;
}

/** 指定した開き角で、爪先がハブより何m下にあるか */
function tipDepth(angle) {
  const armBottom = CLAW.armLen * Math.cos(angle);
  // 爪先の向きを開き角ぶん回転させたときの y 成分
  const ty = tipDir.x * Math.sin(angle) + tipDir.y * Math.cos(angle);
  return Math.max(armBottom, armBottom - ty * CLAW.tipLen) + CLAW.armW / 2;
}

// キネマティック物体を目標姿勢へ「速度で」動かす（接触に正しく反映させるため）
const _qinv = new CANNON.Quaternion();
const _qd = new CANNON.Quaternion();
function driveKinematic(body, pos, quat, dt) {
  body.velocity.set((pos.x - body.position.x) / dt, (pos.y - body.position.y) / dt, (pos.z - body.position.z) / dt);
  body.quaternion.conjugate(_qinv);
  quat.mult(_qinv, _qd);
  if (_qd.w < 0) {
    _qd.x = -_qd.x; _qd.y = -_qd.y; _qd.z = -_qd.z; _qd.w = -_qd.w;
  }
  const w = Math.min(1, _qd.w);
  const s = Math.sqrt(1 - w * w);
  if (s < 1e-6) {
    body.angularVelocity.set(0, 0, 0);
  } else {
    const angle = 2 * Math.acos(w);
    const k = angle / s / dt;
    body.angularVelocity.set(_qd.x * k, _qd.y * k, _qd.z * k);
  }
}

const hubTarget = new CANNON.Vec3();
const hubQuat = new CANNON.Quaternion();
const fingerTargets = [0, 1, 2].map(() => ({ pos: new CANNON.Vec3(), quat: new CANNON.Quaternion() }));

function computeClawTargets() {
  hubTarget.set(claw.x, claw.y, claw.z);
  for (let i = 0; i < 3; i++) fingerPose(i, fingerTargets[i].pos, fingerTargets[i].quat);
}

function driveClaw(dt) {
  computeClawTargets();
  driveKinematic(hubBody, hubTarget, hubQuat, dt);
  for (let i = 0; i < 3; i++) driveKinematic(fingerBodies[i], fingerTargets[i].pos, fingerTargets[i].quat, dt);
}

function snapClaw() {
  hubBody.position.copy(hubTarget);
  hubBody.quaternion.copy(hubQuat);
  for (let i = 0; i < 3; i++) {
    fingerBodies[i].position.copy(fingerTargets[i].pos);
    fingerBodies[i].quaternion.copy(fingerTargets[i].quat);
  }
}

// 初期姿勢へ配置
computeClawTargets();
snapClaw();

// =====================================================================
// 景品
// =====================================================================
const prizes = [];

const PALETTE = ['#ff5d8f', '#ffb84d', '#ffe156', '#6ee7a8', '#5ec8ff', '#a98bff', '#ff8a5c'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
}

function sphereMesh(r, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const PRIZE_TYPES = {
  ball: {
    name: 'ビーチボール',
    mass: 0.3,
    build(body, group) {
      body.addShape(new CANNON.Sphere(0.2));
      const cols = [pick(PALETTE), '#ffffff', pick(PALETTE), '#ffffff', pick(PALETTE), '#ffffff'];
      group.add(sphereMesh(0.2, new THREE.MeshStandardMaterial({ map: stripeTexture(cols), roughness: 0.35 })));
    },
  },
  box: {
    name: 'お菓子の箱',
    mass: 0.4,
    build(body, group) {
      const hx = 0.19, hy = 0.12, hz = 0.14;
      body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
        new THREE.MeshStandardMaterial({ map: giftTexture(pick(PALETTE), '#ffffff'), roughness: 0.5 }),
      );
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    },
  },
  can: {
    name: 'ジュース缶',
    mass: 0.45,
    build(body, group) {
      const r = 0.12, h = 0.34;
      body.addShape(new CANNON.Cylinder(r, r, h, 16));
      const color = pick(PALETTE);
      const side = new THREE.MeshStandardMaterial({ map: canTexture(color, 'JUICE'), roughness: 0.3, metalness: 0.4 });
      const top = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.9 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), [side, top, top]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    },
  },
  bear: {
    name: 'クマのぬいぐるみ',
    mass: 0.55,
    build(body, group) {
      body.addShape(new CANNON.Sphere(0.2), new CANNON.Vec3(0, -0.06, 0));
      body.addShape(new CANNON.Sphere(0.15), new CANNON.Vec3(0, 0.24, 0));
      const fur = std(pick(['#b07a4f', '#d9a066', '#f2c6d8', '#ffffff']), { roughness: 0.95 });
      const dark = std('#2b1a12', { roughness: 0.5 });
      const light = std('#fbe7d0', { roughness: 0.9 });
      group.add(sphereMesh(0.2, fur, 0, -0.06, 0));
      group.add(sphereMesh(0.15, fur, 0, 0.24, 0));
      group.add(sphereMesh(0.055, fur, -0.11, 0.36, 0));
      group.add(sphereMesh(0.055, fur, 0.11, 0.36, 0));
      group.add(sphereMesh(0.06, light, 0, 0.21, 0.12));
      group.add(sphereMesh(0.022, dark, 0, 0.23, 0.175));
      group.add(sphereMesh(0.02, dark, -0.055, 0.28, 0.125));
      group.add(sphereMesh(0.02, dark, 0.055, 0.28, 0.125));
      group.add(sphereMesh(0.065, fur, -0.17, 0.0, 0.05));
      group.add(sphereMesh(0.065, fur, 0.17, 0.0, 0.05));
      group.add(sphereMesh(0.07, fur, -0.1, -0.2, 0.1));
      group.add(sphereMesh(0.07, fur, 0.1, -0.2, 0.1));
      // リボン
      const ribbon = std(pick(['#ff4fa3', '#46e0ff', '#ffde59']));
      group.add(sphereMesh(0.035, ribbon, 0, 0.1, 0.13));
    },
  },
  duck: {
    name: 'アヒル',
    mass: 0.35,
    build(body, group) {
      body.addShape(new CANNON.Sphere(0.17));
      body.addShape(new CANNON.Sphere(0.11), new CANNON.Vec3(0.07, 0.19, 0));
      const yellow = std('#ffd93b', { roughness: 0.4 });
      group.add(sphereMesh(0.17, yellow));
      group.add(sphereMesh(0.11, yellow, 0.07, 0.19, 0));
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 12), yellow);
      tail.position.set(-0.17, 0.06, 0);
      tail.rotation.z = Math.PI / 2 + 0.6;
      group.add(tail);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 12), std('#ff8a2b'));
      beak.position.set(0.2, 0.17, 0);
      beak.rotation.z = -Math.PI / 2;
      group.add(beak);
      const eye = std('#111111');
      group.add(sphereMesh(0.018, eye, 0.13, 0.24, 0.07));
      group.add(sphereMesh(0.018, eye, 0.13, 0.24, -0.07));
    },
  },
};
const PRIZE_KINDS = Object.keys(PRIZE_TYPES);
const PRIZE_COUNT = 14;

function createPrize(kind, x, y, z) {
  const type = PRIZE_TYPES[kind];
  const body = new CANNON.Body({
    mass: type.mass,
    material: MAT.prize,
    collisionFilterGroup: GROUP.PRIZE,
    collisionFilterMask: GROUP.ENV | GROUP.PRIZE | GROUP.CLAW,
    linearDamping: 0.05,
    angularDamping: 0.15,
  });
  const group = new THREE.Group();
  type.build(body, group);
  body.position.set(x, y, z);
  body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  world.addBody(body);
  scene.add(group);
  const prize = {
    kind,
    name: type.name,
    body,
    mesh: group,
    touch: [-1e9, -1e9, -1e9],
    collected: false,
    collectedAt: 0,
  };
  body.userData = { prize };
  prizes.push(prize);
  return prize;
}

function removePrize(prize) {
  releasePrize(prize);
  world.removeBody(prize.body);
  scene.remove(prize.mesh);
  prize.mesh.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
    }
  });
  const idx = prizes.indexOf(prize);
  if (idx >= 0) prizes.splice(idx, 1);
}

function inChuteArea(x, z, margin = 0) {
  return x < CHUTE.maxX + margin && z > CHUTE.minZ - margin;
}

function randomSpawnPoint() {
  for (let i = 0; i < 50; i++) {
    const x = (Math.random() * 2 - 1) * 1.3;
    const z = (Math.random() * 2 - 1) * 1.3;
    if (!inChuteArea(x, z, 0.35)) return { x, z };
  }
  return { x: 0.5, z: -0.5 };
}

function refillPrizes() {
  for (const p of [...prizes]) removePrize(p);
  for (let i = 0; i < PRIZE_COUNT; i++) {
    const { x, z } = randomSpawnPoint();
    createPrize(PRIZE_KINDS[i % PRIZE_KINDS.length], x, 0.5 + i * 0.28, z);
  }
  updateHud();
}

// =====================================================================
// 掴み判定（アシスト）
// =====================================================================
const held = []; // { prize, constraint, pivot }

function attachPrize(prize) {
  const pivot = new CANNON.Vec3();
  hubBody.pointToLocalFrame(prize.body.position, pivot);
  const constraint = new CANNON.PointToPointConstraint(hubBody, pivot, prize.body, new CANNON.Vec3(0, 0, 0), gripForceN() * DT);
  world.addConstraint(constraint);
  prize.body.angularDamping = 0.7;
  prize.body.linearDamping = 0.3;
  held.push({ prize, constraint, pivot });
}

function releasePrize(prize) {
  const i = held.findIndex((h) => h.prize === prize);
  if (i < 0) return;
  world.removeConstraint(held[i].constraint);
  prize.body.angularDamping = 0.15;
  prize.body.linearDamping = 0.05;
  held.splice(i, 1);
}

function releaseAll() {
  for (const h of [...held]) releasePrize(h.prize);
}

function tryAttach() {
  const now = simTime;
  const candidates = [];
  for (const p of prizes) {
    if (p.collected) continue;
    const fingers = p.touch.filter((t) => now - t < 0.35).length;
    if (fingers < settings.requiredFingers) continue;
    const dx = p.body.position.x - claw.x;
    const dz = p.body.position.z - claw.z;
    const d = Math.hypot(dx, dz);
    // 爪1本で判定する場合は、ある程度アームの真下にあるものだけ
    const maxD = fingers >= 2 ? 0.5 : 0.38;
    if (d > maxD) continue;
    if (p.body.position.y > claw.y) continue;
    candidates.push({ p, fingers, d });
  }
  candidates.sort((a, b) => b.fingers - a.fingers || a.d - b.d);
  for (const c of candidates.slice(0, 2)) attachPrize(c.p);
  return candidates.length > 0;
}

const _pw = new CANNON.Vec3();
function updateHeld() {
  const impulse = gripForceN() * claw.gripScale * DT;
  for (const h of [...held]) {
    for (const eq of h.constraint.equations) {
      eq.maxForce = impulse;
      eq.minForce = -impulse;
    }
    // 保持力が負けて景品がずり落ちたら離す
    hubBody.pointToWorldFrame(h.pivot, _pw);
    if (_pw.distanceTo(h.prize.body.position) > 0.14) releasePrize(h.prize);
  }
}

// =====================================================================
// 接触の監視
// =====================================================================
const fingerTouch = [false, false, false];
let hubTouch = false;
let clawTouch = false;

function scanContacts() {
  fingerTouch.fill(false);
  hubTouch = false;
  clawTouch = false;
  for (const c of world.contacts) {
    const a = c.bi.userData;
    const b = c.bj.userData;
    if (!a || !b) continue;
    let clawId, prize;
    if (a.claw !== undefined && b.prize) {
      clawId = a.claw;
      prize = b.prize;
    } else if (b.claw !== undefined && a.prize) {
      clawId = b.claw;
      prize = a.prize;
    } else continue;
    clawTouch = true;
    if (clawId === 'hub') hubTouch = true;
    else {
      fingerTouch[clawId] = true;
      prize.touch[clawId] = simTime;
    }
  }
}

// =====================================================================
// 入力
// =====================================================================
const keys = new Set();
const vdirs = new Set();
let dropPressed = false;

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
    if (e.code !== 'Space' && !KEYMAP[e.code]) return;
    e.target.blur();
  }
  initAudio();
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) dropPressed = true;
    return;
  }
  if (e.code === 'KeyC' && !e.repeat) {
    setView(currentView === 'front' ? 'side' : 'front');
    return;
  }
  const dir = KEYMAP[e.code];
  if (dir) {
    e.preventDefault();
    keys.add(dir);
  }
});
window.addEventListener('keyup', (e) => {
  const dir = KEYMAP[e.code];
  if (dir) keys.delete(dir);
});
window.addEventListener('blur', () => {
  keys.clear();
  vdirs.clear();
  document.querySelectorAll('#pad button').forEach((b) => b.classList.remove('active'));
});

document.querySelectorAll('#pad button').forEach((btn) => {
  const dir = btn.dataset.dir;
  const on = (e) => {
    e.preventDefault();
    initAudio();
    btn.setPointerCapture?.(e.pointerId);
    vdirs.add(dir);
    btn.classList.add('active');
  };
  const off = () => {
    vdirs.delete(dir);
    btn.classList.remove('active');
  };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('lostpointercapture', off);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

const dropBtn = $('drop');
dropBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  dropPressed = true;
  dropBtn.classList.add('active');
});
const dropOff = () => dropBtn.classList.remove('active');
dropBtn.addEventListener('pointerup', dropOff);
dropBtn.addEventListener('pointerleave', dropOff);
dropBtn.addEventListener('contextmenu', (e) => e.preventDefault());

const _fwd = new THREE.Vector3();
/** 入力をカメラ基準のワールド移動方向に変換（レールに沿うよう軸にスナップ） */
function getMoveInput() {
  const has = (d) => keys.has(d) || vdirs.has(d);
  const ix = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
  const iy = (has('up') ? 1 : 0) - (has('down') ? 1 : 0);
  if (!ix && !iy) return null;
  camera.getWorldDirection(_fwd);
  let fx, fz;
  if (Math.abs(_fwd.x) > Math.abs(_fwd.z)) {
    fx = Math.sign(_fwd.x); fz = 0;
  } else {
    fx = 0; fz = Math.sign(_fwd.z);
  }
  // 右方向 = 前方向を右に90°回したもの
  const rx = -fz, rz = fx;
  return { x: rx * ix + fx * iy, z: rz * ix + fz * iy };
}

// =====================================================================
// ゲーム進行（ステートマシン）
// =====================================================================
const stats = { plays: 0, wins: 0, collection: {} };
let simTime = 0;
let refillTimer = -1;

const STATUS_TEXT = {
  ready: '移動してスペース（DROP）で降下',
  opening: 'アームオープン！',
  descending: '降下中…（もう一度押すと止まる）',
  closing: 'キャッチ！',
  grabbing: 'キャッチ！',
  lifting: '上昇中…',
  topPause: '上昇中…',
  returning: '投入口へ移動中…',
  releasing: 'リリース！',
  resetting: '',
};

function setState(s) {
  claw.state = s;
  claw.t = 0;
  if (STATUS_TEXT[s]) $('status').textContent = STATUS_TEXT[s];
}

/** 全ての爪を目標角度へ近づける。全て到達したら true */
function approachAngles(target, step) {
  let done = true;
  for (let i = 0; i < 3; i++) {
    const a = claw.angles[i];
    if (Math.abs(target - a) <= step) claw.angles[i] = target;
    else {
      claw.angles[i] = a + Math.sign(target - a) * step;
      done = false;
    }
  }
  return done;
}

function moveToward(tx, tz, speed, dt) {
  const dx = tx - claw.x;
  const dz = tz - claw.z;
  const d = Math.hypot(dx, dz);
  const step = speed * dt;
  if (d <= step) {
    claw.x = tx;
    claw.z = tz;
    return true;
  }
  claw.x += (dx / d) * step;
  claw.z += (dz / d) * step;
  return false;
}

let moveSoundCooldown = 0;

function updateLogic(dt) {
  claw.t += dt;
  const drop = dropPressed;
  dropPressed = false;

  switch (claw.state) {
    case 'ready': {
      const mv = getMoveInput();
      if (mv) {
        const L = CLAW.moveLimit;
        claw.x = THREE.MathUtils.clamp(claw.x + mv.x * CLAW.moveSpeed * dt, -L, L);
        claw.z = THREE.MathUtils.clamp(claw.z + mv.z * CLAW.moveSpeed * dt, -L, L);
        moveSoundCooldown -= dt;
        if (moveSoundCooldown <= 0) {
          sfx.tick();
          moveSoundCooldown = 0.12;
        }
      }
      approachAngles(CLAW.restAngle, CLAW.openSpeed * dt);
      if (drop) {
        stats.plays++;
        updateHud();
        sfx.drop();
        setState('opening');
      }
      break;
    }
    case 'opening':
      if (approachAngles(CLAW.openAngle, CLAW.openSpeed * dt)) {
        claw.firstContactY = null;
        setState('descending');
      }
      break;
    case 'descending': {
      claw.y -= CLAW.dropSpeed * dt;
      if (clawTouch && claw.firstContactY === null) claw.firstContactY = claw.y;
      let stop = drop || hubTouch;
      const minY = tipDepth(CLAW.openAngle) + 0.02;
      if (claw.y <= minY) {
        claw.y = minY;
        stop = true;
      }
      if (claw.firstContactY !== null && claw.firstContactY - claw.y >= settings.extraPush) stop = true;
      if (stop) {
        claw.blocked.fill(false);
        claw.squeeze.fill(0);
        sfx.close();
        setState('closing');
      }
      break;
    }
    case 'closing': {
      let done = true;
      for (let i = 0; i < 3; i++) {
        if (claw.blocked[i]) continue;
        let rate = CLAW.closeSpeed;
        if (fingerTouch[i]) {
          // 景品に触れたら少しだけ締め込んで止まる
          rate *= 0.35;
          claw.squeeze[i] += rate * dt;
          if (claw.squeeze[i] >= CLAW.squeeze) claw.blocked[i] = true;
        }
        claw.angles[i] = Math.max(CLAW.closedAngle, claw.angles[i] - rate * dt);
        if (claw.angles[i] <= CLAW.closedAngle) claw.blocked[i] = true;
        if (!claw.blocked[i]) done = false;
      }
      if (done || claw.t > 1.6) setState('grabbing');
      break;
    }
    case 'grabbing':
      if (claw.t > 0.25) {
        if (tryAttach()) sfx.grab();
        setState('lifting');
      }
      break;
    case 'lifting':
      claw.y += CLAW.liftSpeed * dt;
      if (claw.y >= CLAW.topY) {
        claw.y = CLAW.topY;
        claw.grabAngles = [...claw.angles];
        claw.wasWeak = Math.random() < settings.weakChance;
        claw.weakTarget = claw.wasWeak ? settings.weakFactor : 1;
        setState('topPause');
      }
      break;
    case 'topPause':
      // 弱まる場合はガクッと保持力が落ち、爪も少し緩んで開く
      claw.gripScale += (claw.weakTarget - claw.gripScale) * Math.min(1, dt * 8);
      if (claw.wasWeak) {
        const loosen = (1 - settings.weakFactor) * CLAW.loosenAngle;
        for (let i = 0; i < 3; i++) {
          claw.angles[i] = Math.min(claw.grabAngles[i] + loosen, claw.angles[i] + CLAW.openSpeed * 0.25 * dt);
        }
      }
      if (claw.t > 0.5) setState('returning');
      break;
    case 'returning':
      if (moveToward(HOME.x, HOME.z, CLAW.returnSpeed, dt)) setState('releasing');
      break;
    case 'releasing':
      approachAngles(CLAW.openAngle, CLAW.openSpeed * dt);
      if (claw.t > 0.15 && held.length) releaseAll();
      if (claw.t > 1.0) setState('resetting');
      break;
    case 'resetting':
      if (approachAngles(CLAW.restAngle, CLAW.openSpeed * dt) && claw.t > 0.3) {
        claw.gripScale = 1;
        setState('ready');
      }
      break;
  }
}

function checkPrizes() {
  for (const p of [...prizes]) {
    const pos = p.body.position;
    if (!p.collected) {
      if (pos.y < -0.3 && inChuteArea(pos.x, pos.z, 0.05)) collectPrize(p);
      else if (pos.y < -3 || !Number.isFinite(pos.y)) {
        // 万一すり抜けたら戻す
        const s = randomSpawnPoint();
        p.body.position.set(s.x, 1.5, s.z);
        p.body.velocity.set(0, 0, 0);
        p.body.angularVelocity.set(0, 0, 0);
      }
    } else if (simTime - p.collectedAt > 1.5) {
      removePrize(p);
      updateHud();
    }
  }
  if (refillTimer > 0) {
    refillTimer -= DT;
    if (refillTimer <= 0) refillPrizes();
  }
}

function collectPrize(p) {
  p.collected = true;
  p.collectedAt = simTime;
  releasePrize(p);
  stats.wins++;
  stats.collection[p.name] = (stats.collection[p.name] || 0) + 1;
  showPopup(p.name);
  sfx.win();
  updateHud();
  if (prizes.filter((q) => !q.collected).length === 0) refillTimer = 2.5;
}

// =====================================================================
// HUD
// =====================================================================
function updateHud() {
  $('plays').textContent = stats.plays;
  $('wins').textContent = stats.wins;
  $('remain').textContent = prizes.filter((p) => !p.collected).length;
  const entries = Object.entries(stats.collection);
  $('collection').style.display = entries.length ? 'block' : 'none';
  $('collectionItems').innerHTML = entries
    .map(([name, n]) => `<span class="item">${name} ×${n}</span>`)
    .join('');
}

let popupTimer = 0;
function showPopup(name) {
  const el = $('popup');
  el.innerHTML = `GET!<small>${name}</small>`;
  el.classList.add('show');
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// --- 設定パネル ---
$('settingsToggle').addEventListener('click', () => $('settings').classList.toggle('open'));

function syncSettingsUi() {
  $('difficulty').value = settings.difficulty;
  $('difficultyNote').textContent = PRESETS[settings.difficulty]?.note ?? 'カスタム設定';
  $('strength').value = settings.strength;
  $('strengthValue').textContent = settings.strength;
  $('fingers').value = settings.requiredFingers;
  $('fingersValue').textContent = settings.requiredFingers;
  $('weak').value = Math.round(settings.weakChance * 100);
  $('weakValue').textContent = Math.round(settings.weakChance * 100);
  $('guide').checked = settings.guide;
  $('sound').checked = settings.sound;
}

$('difficulty').addEventListener('change', (e) => {
  const preset = PRESETS[e.target.value];
  Object.assign(settings, preset, { difficulty: e.target.value });
  settings.guide = e.target.value !== 'hard';
  syncSettingsUi();
});
$('strength').addEventListener('input', (e) => {
  settings.strength = Number(e.target.value);
  $('strengthValue').textContent = settings.strength;
});
$('fingers').addEventListener('input', (e) => {
  settings.requiredFingers = Number(e.target.value);
  $('fingersValue').textContent = settings.requiredFingers;
});
$('weak').addEventListener('input', (e) => {
  settings.weakChance = Number(e.target.value) / 100;
  $('weakValue').textContent = e.target.value;
});
$('guide').addEventListener('change', (e) => { settings.guide = e.target.checked; });
$('sound').addEventListener('change', (e) => { settings.sound = e.target.checked; });
$('refill').addEventListener('click', (e) => {
  e.target.blur();
  releaseAll();
  refillPrizes();
});
$('resetScore').addEventListener('click', (e) => {
  e.target.blur();
  stats.plays = 0;
  stats.wins = 0;
  stats.collection = {};
  updateHud();
});

// --- 視点 ---
let currentView = 'front';
const VIEWS = {
  front: new THREE.Vector3(0, 0.42, 1).normalize(),
  side: new THREE.Vector3(1, 0.42, 0.15).normalize(),
};
function setView(name) {
  currentView = name;
  const aspect = window.innerWidth / window.innerHeight;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hTan = Math.tan(vfov / 2) * aspect;
  const dist = Math.max(6.8, 2.2 / hTan + 2.0);
  camera.position.copy(controls.target).addScaledVector(VIEWS[name], dist);
  camera.lookAt(controls.target);
}
$('viewFront').addEventListener('click', (e) => { e.target.blur(); setView('front'); });
$('viewSide').addEventListener('click', (e) => { e.target.blur(); setView('side'); });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  setView(currentView);
});

// =====================================================================
// 効果音（WebAudio で生成）
// =====================================================================
let actx = null;
function initAudio() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx) actx = new Ctx();
}
function tone(freq, dur, { type = 'square', vol = 0.04, slide = 0, delay = 0 } = {}) {
  if (!actx || !settings.sound) return;
  const t0 = actx.currentTime + delay;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(actx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
const sfx = {
  tick: () => tone(220, 0.05, { type: 'triangle', vol: 0.015 }),
  drop: () => tone(660, 0.25, { slide: -300, vol: 0.04 }),
  close: () => tone(300, 0.15, { type: 'sawtooth', vol: 0.03, slide: -80 }),
  grab: () => tone(880, 0.12, { type: 'triangle', vol: 0.05 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.05, delay: i * 0.09 })),
};

// =====================================================================
// メインループ
// =====================================================================
function physicsStep(dt) {
  updateLogic(dt);
  driveClaw(dt);
  world.step(dt);
  snapClaw();
  scanContacts();
  updateHeld();
  checkPrizes();
  simTime += dt;
}

function syncVisuals() {
  for (const p of prizes) {
    p.mesh.position.copy(p.body.position);
    p.mesh.quaternion.copy(p.body.quaternion);
  }
  hubMesh.position.set(claw.x, claw.y, claw.z);
  for (let i = 0; i < 3; i++) {
    fingerMeshes[i].position.copy(fingerBodies[i].position);
    fingerMeshes[i].quaternion.copy(fingerBodies[i].quaternion);
  }
  gantry.position.z = claw.z;
  carriage.position.x = claw.x;
  const cableTop = railY - 0.2;
  const cableBottom = claw.y + 0.24;
  cable.position.set(claw.x, (cableTop + cableBottom) / 2, claw.z);
  cable.scale.y = Math.max(0.01, cableTop - cableBottom);

  const showGuide = settings.guide && (claw.state === 'ready' || claw.state === 'opening' || claw.state === 'descending');
  guideLine.visible = guideRing.visible = showGuide;
  if (showGuide) {
    const top = claw.y - 0.05;
    guideLine.position.set(claw.x, top / 2, claw.z);
    guideLine.scale.y = Math.max(0.01, top);
    guideRing.position.set(claw.x, 0.004, claw.z);
  }
  // 状態ランプ: 待機中は水色、掴んでいる間はピンク
  hubMesh.userData.lamp.material.color.set(held.length ? 0xff4fa3 : claw.state === 'ready' ? 0x46e0ff : 0xffde59);
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += elapsed;
  let n = 0;
  while (acc >= DT && n < 10) {
    physicsStep(DT);
    acc -= DT;
    n++;
  }
  if (n === 10) acc = 0;
  syncVisuals();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// =====================================================================
// 起動
// =====================================================================
refillPrizes();
// 景品を落ち着かせる
for (let i = 0; i < 240; i++) physicsStep(DT);
syncSettingsUi();
setView('front');
updateHud();
$('loading').remove();
requestAnimationFrame(frame);

// デバッグ・自動テスト用
window.__crane = {
  claw, prizes, settings, stats, held, world,
  drop: () => { dropPressed = true; },
  step: (n = 1) => { for (let i = 0; i < n; i++) physicsStep(DT); },
};
