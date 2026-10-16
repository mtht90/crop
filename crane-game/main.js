import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as CANNON from 'cannon-es';

const $ = (id) => document.getElementById(id);
const yen = (v) => `¥${Math.round(v).toLocaleString('ja-JP')}`;
const signedYen = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + yen(Math.abs(v));
const clamp = THREE.MathUtils.clamp;

// =====================================================================
// 寸法・定数
// =====================================================================
const DT = 1 / 120;           // 物理の固定ステップ
const H = 1.6;                // プレイエリアの半幅（床は y=0）
const GLASS_H = 3.2;          // ガラスの高さ
const RAIL_Y = GLASS_H - 0.12;
const OUTER = H + 0.2;        // 筐体の外寸（半幅）
const GROUND_Y = -3.0;        // 店の床
const NEIGHBOR_X = OUTER * 2 + 0.25;
const GROUP = { ENV: 1, PRIZE: 2, CLAW: 4 };

// アーム（爪）の形
const CLAW3 = {
  fingers: 3, thetaOffset: Math.PI / 2, hingeR: 0.15, armLen: 0.56, armW: 0.05, armD: 0.1,
  tipLen: 0.17, tipTilt: 0.4, restAngle: 0.1, openAngle: 0.8, closedAngle: -0.06, hubR: 0.2, extraPush: 0.18,
};
const CLAW2 = {
  fingers: 2, thetaOffset: 0, hingeR: 0.18, armLen: 0.62, armW: 0.05, armD: 0.18,
  tipLen: 0.13, tipTilt: 0.25, restAngle: 0.08, openAngle: 0.62, closedAngle: -0.1, hubR: 0.22, extraPush: 0.1,
};

// アームの動き（実機に近い、ゆっくりめの速度）
const MOTION = {
  maxSpeed: 0.55,     // 横移動の最高速度（速度設定100%時）
  accel: 2.2,         // 加速度
  decel: 3.2,         // 減速度
  returnSpeed: 0.75,
  dropSpeed: 0.7,
  liftSpeed: 0.55,
  openSpeed: 1.6,
  closeSpeed: 0.9,
  limit: 1.32,
  swayDamping: 0.9,
};

// お店の方針プリセット
const SHOPS = {
  kind:     { payout: 1500, normalPower: 40, atariPower: 100, looseChance: 60, randomAtari: 30,
              bridgePower: 60, note: '設定金額が低めで、通常時のアームも少し強め。' },
  standard: { payout: 2500, normalPower: 30, atariPower: 100, looseChance: 85, randomAtari: 50,
              bridgePower: 45, note: 'よくあるお店の設定。景品の原価の3〜4倍で当たりが来ます。' },
  stingy:   { payout: 4000, normalPower: 20, atariPower: 90, looseChance: 95, randomAtari: 0,
              bridgePower: 30, note: '設定金額が高く、通常時はほぼ持ち上がりません。' },
};

const DEFAULTS = {
  machine: 'ufo3',
  shop: 'standard',
  ...stripNote(SHOPS.standard),
  staffMode: false,
  control: 'buttons',
  speed: 100,
  inertia: true,
  sway: true,
  guide: false,
  sound: true,
  budget: 3000,
};
function stripNote(o) {
  const { note, ...rest } = o;
  return rest;
}

// =====================================================================
// 保存データ（財布・記録・設定）
// =====================================================================
const SAVE_KEY = 'claw-catcher-v2';
function freshMoney() {
  return { wallet: 3000, credits: { ufo3: [], bridge2: [] }, spent: 0, topUps: 0, wins: [], since: { ufo3: 0, bridge2: 0 } };
}
let saved = null;
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { saved = null; }
const settings = { ...DEFAULTS, ...(saved?.settings || {}) };
const money = Object.assign(freshMoney(), saved?.money || {});
const banks = { ufo3: 0, ...(saved?.banks || {}) };
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ settings, money, banks })); } catch { /* 保存できない環境では何もしない */ }
}

// =====================================================================
// 物理ワールド
// =====================================================================
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.solver.iterations = 16;
world.solver.tolerance = 1e-4;
world.allowSleep = false;

const MAT = {
  env: new CANNON.Material('env'),
  bar: new CANNON.Material('bar'),
  plush: new CANNON.Material('plush'),
  box: new CANNON.Material('box'),
  claw: new CANNON.Material('claw'),
};
world.defaultContactMaterial.friction = 0.4;
const cm = (a, b, friction, restitution = 0.02, extra = {}) =>
  world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution, ...extra }));
const soft = { contactEquationStiffness: 4e6, contactEquationRelaxation: 4 };
cm(MAT.plush, MAT.env, 0.7);
cm(MAT.plush, MAT.plush, 0.6);
cm(MAT.plush, MAT.claw, 0.85, 0, soft);
cm(MAT.box, MAT.env, 0.4);
cm(MAT.box, MAT.bar, 0.32);
cm(MAT.box, MAT.claw, 0.6, 0, soft);

// =====================================================================
// 描画の準備
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0a1c);
scene.fog = new THREE.Fog(0x0d0a1c, 10, 24);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0.85, 0);

// 店内の照明
scene.add(new THREE.HemisphereLight(0xb8b0ff, 0x1a1030, 0.35));
// 筐体内の天井ライト（影を落とす）
const cabLight = new THREE.DirectionalLight(0xffffff, 2.4);
cabLight.position.set(0.4, 8, 1.2);
cabLight.target.position.set(0, 0, 0);
cabLight.castShadow = true;
cabLight.shadow.mapSize.set(2048, 2048);
Object.assign(cabLight.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 3, far: 12 });
cabLight.shadow.bias = -0.0004;
cabLight.shadow.normalBias = 0.02;
scene.add(cabLight, cabLight.target);
// 正面からの補助光（操作パネルを照らす）
const frontLight = new THREE.SpotLight(0xffe8f4, 18, 14, 0.55, 0.6);
frontLight.position.set(0, 3.5, 7);
frontLight.target.position.set(0, -0.6, 1.5);
scene.add(frontLight, frontLight.target);
const neonA = new THREE.PointLight(0xff4fa3, 10, 9);
neonA.position.set(-2.4, 1.5, 3);
const neonB = new THREE.PointLight(0x46e0ff, 10, 9);
neonB.position.set(2.4, 1.5, 3);
scene.add(neonA, neonB);

// ---------------------------------------------------------------------
// テクスチャ（Canvas で生成）
// ---------------------------------------------------------------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  t.userData.canvas = c;
  return t;
}
function rand(a, b) { return a + Math.random() * (b - a); }

function feltTexture(base, dot) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
    g.fillStyle = dot;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cx = (x + (y % 2) * 0.5) * (w / 4) + w / 8;
        const cy = y * (h / 4) + h / 8;
        star(g, cx, cy, 9, 4);
      }
    }
  }, 2.2);
}
function star(g, cx, cy, R, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r : R;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

const carpetTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#17123a';
  g.fillRect(0, 0, w, h);
  const cols = ['#ff4fa3', '#46e0ff', '#ffd23f', '#7c5cff'];
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = cols[i % cols.length];
    g.globalAlpha = 0.55;
    g.lineWidth = 3;
    const x = Math.random() * w;
    const y = Math.random() * h;
    const k = i % 3;
    g.beginPath();
    if (k === 0) g.arc(x, y, rand(6, 16), 0, Math.PI * 2);
    else if (k === 1) { g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.moveTo(x, y - 10); g.lineTo(x, y + 10); }
    else { g.moveTo(x - 12, y + 8); g.lineTo(x, y - 10); g.lineTo(x + 12, y + 8); g.closePath(); }
    g.stroke();
  }
  g.globalAlpha = 1;
}, 6);

function signTexture(title, sub, color) {
  return canvasTex(1024, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1d0f3d');
    grad.addColorStop(1, '#0b0620');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 120px "M PLUS Rounded 1c", sans-serif';
    g.shadowColor = color;
    g.shadowBlur = 36;
    g.fillStyle = '#ffffff';
    g.fillText(title, w / 2, h * 0.42);
    g.shadowBlur = 0;
    g.font = '700 38px "M PLUS Rounded 1c", sans-serif';
    g.fillStyle = color;
    g.fillText(sub, w / 2, h * 0.82);
  });
}

function sidePanelTexture(color, color2, label) {
  return canvasTex(256, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color2);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 14; i++) star(g, rand(0, w), rand(0, h), rand(8, 22), rand(4, 9));
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-Math.PI / 2);
    g.font = '900 64px "M PLUS Rounded 1c", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(label, 0, 0);
    g.restore();
  });
}

function backArtTexture(color) {
  return canvasTex(512, 512, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h * 0.4, 20, w / 2, h * 0.4, w * 0.8);
    grad.addColorStop(0, '#fff6fb');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, '#2a1257');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 6;
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      g.moveTo(w / 2, h * 0.4);
      const a = (i / 18) * Math.PI * 2;
      g.lineTo(w / 2 + Math.cos(a) * w, h * 0.4 + Math.sin(a) * w);
      g.stroke();
    }
    g.font = '900 72px "M PLUS Rounded 1c", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(0,0,0,0.4)';
    g.shadowBlur = 10;
    g.fillText('PRIZE', w / 2, h * 0.3);
    g.font = '700 30px "M PLUS Rounded 1c", sans-serif';
    g.fillText('ゲットしてね！', w / 2, h * 0.42);
  });
}

function stickerTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1240';
    g.textAlign = 'center';
    g.font = '900 40px "M PLUS Rounded 1c", sans-serif';
    g.fillText('1PLAY ¥100', w / 2, 50);
    g.font = '800 30px "M PLUS Rounded 1c", sans-serif';
    g.fillText('¥500で6PLAY', w / 2, 98);
  });
}

// 操作パネルの7セグ風表示
const ledTex = canvasTex(256, 96, () => {});
function drawLed(label, value) {
  const c = ledTex.userData.canvas;
  const g = c.getContext('2d');
  g.fillStyle = '#160404';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ff3b2f';
  g.shadowColor = '#ff3b2f';
  g.shadowBlur = 12;
  g.textAlign = 'center';
  g.font = '20px "DotGothic16", monospace';
  g.fillText(label, c.width / 2, 24);
  g.font = '56px "DotGothic16", monospace';
  g.fillText(String(value).padStart(2, ' '), c.width / 2, 82);
  g.shadowBlur = 0;
  ledTex.needsUpdate = true;
}

// =====================================================================
// 景品の種類
// =====================================================================
const PALETTE = ['#ff6fa8', '#ffb84d', '#7fd8ff', '#b79bff', '#7be0a8', '#ffffff'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function plushMat(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5) });
}
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.35 });
function ball(r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 14), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function seat(body, hx, hz, y) {
  // 座りを安定させる平らな底（ぬいぐるみが転がり続けないように）
  body.addShape(new CANNON.Box(new CANNON.Vec3(hx, 0.04, hz)), new CANNON.Vec3(0, y, 0));
}

const PRIZE_TYPES = {
  bear: {
    name: 'クマのぬいぐるみ', value: 900, mass: 0.6, material: 'plush',
    build(body, g) {
      body.addShape(new CANNON.Sphere(0.24), new CANNON.Vec3(0, -0.02, 0));
      body.addShape(new CANNON.Sphere(0.18), new CANNON.Vec3(0, 0.32, 0));
      seat(body, 0.17, 0.14, -0.22);
      const fur = plushMat(pick(['#a8724a', '#d39b64', '#f2c6d8', '#f5efe6']));
      const muzzle = plushMat('#fbe7d0');
      g.add(ball(0.24, fur, 0, -0.02, 0, 1, 0.95, 0.92));
      g.add(ball(0.18, fur, 0, 0.32, 0));
      g.add(ball(0.065, fur, -0.13, 0.46, 0), ball(0.065, fur, 0.13, 0.46, 0));
      g.add(ball(0.035, muzzle, -0.13, 0.46, 0.04), ball(0.035, muzzle, 0.13, 0.46, 0.04));
      g.add(ball(0.075, muzzle, 0, 0.28, 0.14, 1, 0.8, 0.8));
      g.add(ball(0.026, darkMat, 0, 0.3, 0.205));
      g.add(ball(0.022, darkMat, -0.065, 0.36, 0.155), ball(0.022, darkMat, 0.065, 0.36, 0.155));
      g.add(ball(0.08, fur, -0.21, 0.04, 0.06), ball(0.08, fur, 0.21, 0.04, 0.06));
      g.add(ball(0.085, fur, -0.12, -0.2, 0.13), ball(0.085, fur, 0.12, -0.2, 0.13));
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 24), plushMat(pick(['#ff4fa3', '#46e0ff', '#ffd23f'])));
      ribbon.rotation.x = Math.PI / 2;
      ribbon.position.y = 0.17;
      g.add(ribbon);
    },
  },
  bunny: {
    name: 'ウサギのぬいぐるみ', value: 800, mass: 0.5, material: 'plush',
    build(body, g) {
      body.addShape(new CANNON.Sphere(0.22), new CANNON.Vec3(0, -0.03, 0));
      body.addShape(new CANNON.Sphere(0.17), new CANNON.Vec3(0, 0.28, 0));
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.035, 0.11, 0.025)), new CANNON.Vec3(-0.07, 0.52, 0));
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.035, 0.11, 0.025)), new CANNON.Vec3(0.07, 0.52, 0));
      seat(body, 0.15, 0.13, -0.22);
      const fur = plushMat(pick(['#ffffff', '#ffd6e7', '#e7dcff']));
      const pink = plushMat('#ff9ec4');
      g.add(ball(0.22, fur, 0, -0.03, 0, 1, 0.95, 0.92));
      g.add(ball(0.17, fur, 0, 0.28, 0));
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 6, 12), fur);
        ear.position.set(s * 0.07, 0.52, 0);
        ear.rotation.z = -s * 0.12;
        ear.castShadow = true;
        g.add(ear);
        const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.12, 4, 8), pink);
        inner.position.set(s * 0.07, 0.52, 0.025);
        inner.rotation.z = -s * 0.12;
        g.add(inner);
      }
      g.add(ball(0.021, darkMat, -0.06, 0.31, 0.15), ball(0.021, darkMat, 0.06, 0.31, 0.15));
      g.add(ball(0.02, pink, 0, 0.26, 0.17));
      g.add(ball(0.03, pink, -0.1, 0.24, 0.13, 1, 0.6, 0.5), ball(0.03, pink, 0.1, 0.24, 0.13, 1, 0.6, 0.5));
      g.add(ball(0.08, fur, -0.11, -0.2, 0.12), ball(0.08, fur, 0.11, -0.2, 0.12));
      g.add(ball(0.065, fur, 0, -0.08, -0.22));
    },
  },
  penguin: {
    name: 'ペンギンのぬいぐるみ', value: 700, mass: 0.55, material: 'plush',
    build(body, g) {
      body.addShape(new CANNON.Sphere(0.23), new CANNON.Vec3(0, -0.01, 0));
      body.addShape(new CANNON.Sphere(0.17), new CANNON.Vec3(0, 0.27, 0));
      seat(body, 0.16, 0.14, -0.21);
      const navy = plushMat(pick(['#26305c', '#3a3f4f', '#5a7bd8']));
      const white = plushMat('#f8f8ff');
      const orange = plushMat('#ff9a3c');
      g.add(ball(0.23, navy, 0, -0.01, 0, 1, 1.02, 0.95));
      g.add(ball(0.2, white, 0, -0.03, 0.06, 0.9, 0.95, 0.8));
      g.add(ball(0.17, navy, 0, 0.27, 0));
      g.add(ball(0.12, white, 0, 0.25, 0.07, 1, 0.9, 0.85));
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 12), orange);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.25, 0.2);
      g.add(beak);
      g.add(ball(0.02, darkMat, -0.055, 0.3, 0.16), ball(0.02, darkMat, 0.055, 0.3, 0.16));
      g.add(ball(0.06, orange, -0.08, -0.22, 0.12, 1, 0.45, 1.4), ball(0.06, orange, 0.08, -0.22, 0.12, 1, 0.45, 1.4));
      g.add(ball(0.07, navy, -0.22, 0.02, 0, 0.5, 1.4, 1), ball(0.07, navy, 0.22, 0.02, 0, 0.5, 1.4, 1));
    },
  },
  duck: {
    name: 'アヒルのぬいぐるみ', value: 600, mass: 0.4, material: 'plush',
    build(body, g) {
      body.addShape(new CANNON.Sphere(0.21), new CANNON.Vec3(0, 0, -0.02));
      body.addShape(new CANNON.Sphere(0.14), new CANNON.Vec3(0, 0.24, 0.06));
      seat(body, 0.15, 0.15, -0.19);
      const yellow = plushMat('#ffd93b');
      const orange = plushMat('#ff8a2b');
      g.add(ball(0.21, yellow, 0, 0, -0.02, 1, 0.9, 1.1));
      g.add(ball(0.14, yellow, 0, 0.24, 0.06));
      g.add(ball(0.06, orange, 0, 0.21, 0.2, 1.1, 0.5, 1.2));
      g.add(ball(0.02, darkMat, -0.06, 0.28, 0.17), ball(0.02, darkMat, 0.06, 0.28, 0.17));
      g.add(ball(0.09, yellow, -0.19, 0.03, -0.03, 0.4, 0.8, 1.2), ball(0.09, yellow, 0.19, 0.03, -0.03, 0.4, 0.8, 1.2));
      g.add(ball(0.06, yellow, 0, 0.1, -0.24, 0.8, 0.6, 1));
    },
  },
  figure: {
    name: 'フィギュア（箱入り）', value: 2500, mass: 1.4, material: 'box',
    build(body, g) {
      const hx = 0.65, hy = 0.15, hz = 0.25;
      body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
      const color = pick(['#ff4fa3', '#2fb7ff', '#7c5cff', '#ff8a2b']);
      const front = canvasTex(512, 256, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, color);
        gr.addColorStop(1, '#1b1240');
        c.fillStyle = gr;
        c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(w * 0.36, h * 0.12, w * 0.28, h * 0.76);
        c.fillStyle = color;
        c.beginPath();
        c.arc(w / 2, h * 0.36, 26, 0, Math.PI * 2);
        c.fill();
        c.fillRect(w / 2 - 22, h * 0.48, 44, 70);
        c.fillStyle = '#ffffff';
        c.textAlign = 'center';
        c.font = '900 40px "M PLUS Rounded 1c", sans-serif';
        c.fillText('PRIZE', w * 0.18, h * 0.45);
        c.fillText('FIGURE', w * 0.82, h * 0.45);
        c.fillStyle = '#ffd23f';
        c.font = '900 30px "M PLUS Rounded 1c", sans-serif';
        c.fillText('非売品', w * 0.18, h * 0.75);
        c.fillText('全1種', w * 0.82, h * 0.75);
      });
      const top = canvasTex(512, 256, (c, w, h) => {
        c.fillStyle = color;
        c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.font = '900 64px "M PLUS Rounded 1c", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('PRIZE FIGURE', w / 2, h / 2);
      });
      const side = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
      const mFront = new THREE.MeshStandardMaterial({ map: front, roughness: 0.4 });
      const mTop = new THREE.MeshStandardMaterial({ map: top, roughness: 0.4 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), [side, side, mTop, mTop, mFront, mFront]);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    },
  },
};

// =====================================================================
// 台（筐体＋ステージ）
// =====================================================================
const MACHINES = {
  ufo3: {
    label: '3本爪 ぬいぐるみ', kind: 'probability', claw: CLAW3,
    color: '#ff4fa3', color2: '#7c3cff', accent: '#46e0ff',
    title: 'UFO CATCHER', sub: 'ぬいぐるみ 3本爪', side: 'PLUSH',
    home: { x: -1.22, z: 1.22 },
  },
  bridge2: {
    label: '2本爪 橋渡し', kind: 'skill', claw: CLAW2,
    color: '#2fb7ff', color2: '#1d3c9c', accent: '#ffd23f',
    title: 'BRIDGE GAME', sub: '橋渡し 2本爪 実力機', side: 'FIGURE',
    home: { x: -1.22, z: 1.22 },
  },
};
const CHUTE = { minX: -1.6, maxX: -0.82, minZ: 0.82, maxZ: 1.6, guardH: 0.36 };

const machineRoot = new THREE.Group();   // 現在の台の見た目（隣の台にも複製する）
const prizeRoot = new THREE.Group();
const neighborRoot = new THREE.Group();
scene.add(machineRoot, prizeRoot, neighborRoot);
let stageBodies = [];
let current = null;          // 現在の台の定義
let bulbs = [];              // 電飾 { mesh, phase }
let panelButtons = null;     // 操作パネルの3Dボタン

function addBody(body) {
  world.addBody(body);
  stageBodies.push(body);
  return body;
}
function staticBox(hx, hy, hz, x, y, z, mat, opts = {}) {
  const body = new CANNON.Body({
    type: CANNON.Body.STATIC, material: opts.physMat || MAT.env,
    collisionFilterGroup: GROUP.ENV, collisionFilterMask: GROUP.PRIZE,
  });
  body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
  body.position.set(x, y, z);
  addBody(body);
  if (mat) visBox(hx * 2, hy * 2, hz * 2, x, y, z, mat, opts);
  return body;
}
function visBox(w, h, d, x, y, z, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = !!opts.cast;
  m.receiveShadow = opts.receive ?? true;
  if (opts.renderOrder !== undefined) m.renderOrder = opts.renderOrder;
  if (opts.tint) m.userData.tint = true;
  machineRoot.add(m);
  return m;
}

function buildCabinet(def) {
  const frame = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.3, metalness: 0.25 });
  const frameDark = new THREE.MeshStandardMaterial({ color: 0x1c1338, roughness: 0.5, metalness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe6e8ef, roughness: 0.18, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdff4ff, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0,
    envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide,
  });
  const W = 0.03;

  // --- ガラス（物理あり） ---
  staticBox(H + W * 2, GLASS_H / 2, W, 0, GLASS_H / 2, H + W, glass, { receive: false, renderOrder: 5 });
  staticBox(W, GLASS_H / 2, H, -H - W, GLASS_H / 2, 0, glass, { receive: false, renderOrder: 5 });
  staticBox(W, GLASS_H / 2, H, H + W, GLASS_H / 2, 0, glass, { receive: false, renderOrder: 5 });
  const back = new THREE.MeshStandardMaterial({ map: backArtTexture(def.color), roughness: 0.8 });
  staticBox(H + W * 2, GLASS_H / 2, W, 0, GLASS_H / 2, -H - W, back);
  staticBox(H + W * 2, W, H + W * 2, 0, GLASS_H + W, 0, null);

  // --- 柱とガラスの枠 ---
  const P = 0.1;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      visBox(P, GLASS_H + 0.02, P, sx * (OUTER - P / 2), GLASS_H / 2, sz * (OUTER - P / 2), frame, { cast: true, tint: true });
    }
  }
  // ガラス上下の縁（クロームの細枠）
  for (const y of [0.02, GLASS_H - 0.02]) {
    visBox(OUTER * 2, 0.04, 0.04, 0, y, OUTER - 0.05, chrome);
    visBox(0.04, 0.04, OUTER * 2, -OUTER + 0.05, y, 0, chrome);
    visBox(0.04, 0.04, OUTER * 2, OUTER - 0.05, y, 0, chrome);
  }

  // --- ヘッダー（看板） ---
  const headY = GLASS_H + 0.45;
  visBox(OUTER * 2 + 0.1, 0.9, OUTER * 2 + 0.1, 0, headY, 0, frame, { tint: true });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(OUTER * 2 - 0.2, 0.62),
    new THREE.MeshBasicMaterial({ map: signTexture(def.title, def.sub, def.accent), toneMapped: false }),
  );
  sign.position.set(0, headY, OUTER + 0.056);
  machineRoot.add(sign);
  // 天井の照明パネル
  const lightPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(H * 1.7, H * 1.7),
    new THREE.MeshBasicMaterial({ color: 0xfffaf0, toneMapped: false }),
  );
  lightPanel.rotation.x = Math.PI / 2;
  lightPanel.position.y = GLASS_H - 0.005;
  machineRoot.add(lightPanel);

  // --- 電飾（看板の周りと前の柱） ---
  const bulbGeo = new THREE.SphereGeometry(0.03, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const pts = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const x = -OUTER + 0.08 + (i / n) * (OUTER * 2 - 0.16);
    pts.push([x, headY + 0.38, OUTER + 0.07], [x, headY - 0.38, OUTER + 0.07]);
  }
  for (let i = 0; i < 18; i++) {
    const y = 0.15 + (i / 17) * (GLASS_H - 0.3);
    pts.push([-OUTER + 0.05, y, OUTER + 0.005], [OUTER - 0.05, y, OUTER + 0.005]);
  }
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach((p, i) => {
    m4.makeTranslation(p[0], p[1], p[2]);
    bulbMesh.setMatrixAt(i, m4);
    bulbMesh.setColorAt(i, new THREE.Color(0xffffff));
  });
  bulbMesh.userData.points = pts;
  machineRoot.add(bulbMesh);

  // --- レール（ガントリー） ---
  for (const sx of [-1, 1]) visBox(0.05, 0.05, H * 2, sx * (H - 0.04), RAIL_Y, 0, chrome);

  // --- 下の筐体 ---
  const baseH = -GROUND_Y;
  const baseY = GROUND_Y / 2;
  const sideMat = new THREE.MeshStandardMaterial({ map: sidePanelTexture(def.color, def.color2, def.side), roughness: 0.45 });
  visBox(0.04, baseH, OUTER * 2, -OUTER + 0.02, baseY, 0, sideMat);
  visBox(0.04, baseH, OUTER * 2, OUTER - 0.02, baseY, 0, sideMat);
  visBox(OUTER * 2, baseH, 0.04, 0, baseY, -OUTER + 0.02, frameDark);
  visBox(OUTER * 2, baseH, 0.04, 0, baseY, OUTER - 0.02, frame, { tint: true });
  // 床下の側面パネル（ガラス直下の帯）
  visBox(OUTER * 2 + 0.02, 0.16, OUTER * 2 + 0.02, 0, -0.08, 0, frameDark).scale.set(1, 1, 1);
  // 足元の巾木
  visBox(OUTER * 2 + 0.04, 0.12, OUTER * 2 + 0.04, 0, GROUND_Y + 0.06, 0, frameDark);

  // --- 操作パネル ---
  const panelY = -0.62;
  const panelZ = OUTER + 0.3;
  const panel = new THREE.Group();
  panel.position.set(0, panelY, panelZ);
  panel.rotation.x = 0.28;
  machineRoot.add(panel);
  const panelBox = new THREE.Mesh(new THREE.BoxGeometry(OUTER * 2, 0.16, 0.66), frameDark);
  panelBox.receiveShadow = true;
  panel.add(panelBox);
  const panelTrim = new THREE.Mesh(new THREE.BoxGeometry(OUTER * 2 + 0.02, 0.05, 0.05), frame);
  panelTrim.position.set(0, 0.03, 0.33);
  panelTrim.userData.tint = true;
  panel.add(panelTrim);
  // 前面の支え
  visBox(OUTER * 2, 0.5, 0.6, 0, panelY - 0.32, panelZ - 0.05, frame, { tint: true });
  // ボタン
  const mkButton = (x, color) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.04, 32), chrome);
    base.position.set(x, 0.09, 0.04);
    panel.add(base);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.25 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 32), mat);
    cap.position.set(x, 0.13, 0.04);
    panel.add(cap);
    return { cap, mat };
  };
  panelButtons = { b1: mkButton(0.25, def.color), b2: mkButton(0.7, def.accent) };
  // 数字ラベル
  const numTex = (t) => canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#fff';
    g.font = '900 48px "M PLUS Rounded 1c", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, w / 2, h / 2);
  });
  for (const [x, t] of [[0.25, '1'], [0.7, '2']]) {
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ map: numTex(t), transparent: true }));
    lab.rotation.x = -Math.PI / 2;
    lab.position.set(x, 0.165, 0.04);
    panel.add(lab);
  }
  // クレジット表示
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false }));
  led.rotation.x = -Math.PI / 2;
  led.position.set(-0.45, 0.083, -0.05);
  panel.add(led);
  // 料金ステッカー
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: stickerTexture(), roughness: 0.6 }));
  sticker.rotation.x = -Math.PI / 2;
  sticker.position.set(-1.1, 0.083, 0.02);
  panel.add(sticker);
  // コイン投入口（前面）
  const slotPlate = visBox(0.3, 0.42, 0.03, 1.15, -1.25, OUTER + 0.01, chrome);
  slotPlate.castShadow = false;
  visBox(0.03, 0.12, 0.02, 1.15, -1.15, OUTER + 0.03, frameDark);
  const coinLamp = visBox(0.2, 0.06, 0.02, 1.15, -1.38, OUTER + 0.03, new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false }));
  coinLamp.receiveShadow = false;
  // 景品取り出し口
  const exitX = def.exitX ?? (CHUTE.minX + CHUTE.maxX) / 2;
  visBox(0.72, 0.52, 0.03, exitX, -2.05, OUTER + 0.01, chrome);
  visBox(0.62, 0.42, 0.02, exitX, -2.05, OUTER + 0.025, new THREE.MeshStandardMaterial({ color: 0x07040f, roughness: 1 }));
  const flap = visBox(0.6, 0.4, 0.01, exitX, -2.05, OUTER + 0.04, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false,
  }));
  flap.receiveShadow = false;
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 52, (g, w, h) => {
      g.fillStyle = '#ffd23f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1240';
      g.font = '900 34px "M PLUS Rounded 1c", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('景品取り出し口', w / 2, h / 2 + 2);
    }),
  }));
  exitSign.position.set(exitX, -1.72, OUTER + 0.03);
  machineRoot.add(exitSign);
}

// ---------- ステージ: 3本爪 ぬいぐるみ（投入口つきの床） ----------
function floorWithHole(mat) {
  const shape = new THREE.Shape();
  shape.moveTo(-H, -H);
  shape.lineTo(H, -H);
  shape.lineTo(H, H);
  shape.lineTo(-H, H);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(CHUTE.minX, -CHUTE.maxZ);
  hole.lineTo(CHUTE.minX, -CHUTE.minZ);
  hole.lineTo(CHUTE.maxX, -CHUTE.minZ);
  hole.lineTo(CHUTE.maxX, -CHUTE.maxZ);
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape);
  // UV をワールド座標に合わせる
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + H) / (2 * H), (uv.getY(i) + H) / (2 * H));
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  machineRoot.add(m);
}

function buildPlushStage() {
  const T = 0.08;
  staticBox((H - CHUTE.maxX) / 2, T, H, (CHUTE.maxX + H) / 2, -T, 0, null);
  staticBox((CHUTE.maxX + H) / 2, T, (CHUTE.minZ + H) / 2, (-H + CHUTE.maxX) / 2, -T, (-H + CHUTE.minZ) / 2, null);
  floorWithHole(new THREE.MeshStandardMaterial({ map: feltTexture('#c9b6f2', 'rgba(255,255,255,0.35)'), roughness: 1 }));

  // 投入口のアクリルガード（2面）
  const acrylic = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.02, envMapIntensity: 1.5, depthWrite: false,
  });
  const gt = 0.015;
  const gh = CHUTE.guardH / 2;
  staticBox(gt, gh, (H - CHUTE.minZ) / 2, CHUTE.maxX, gh, (CHUTE.minZ + H) / 2, acrylic, { renderOrder: 4, receive: false });
  staticBox((CHUTE.maxX + H) / 2, gh, gt, (-H + CHUTE.maxX) / 2, gh, CHUTE.minZ, acrylic, { renderOrder: 4, receive: false });
  const trim = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4 });
  visBox(0.035, 0.035, H - CHUTE.minZ, CHUTE.maxX, CHUTE.guardH, (CHUTE.minZ + H) / 2, trim);
  visBox(CHUTE.maxX + H, 0.035, 0.035, (-H + CHUTE.maxX) / 2, CHUTE.guardH, CHUTE.minZ, trim);
  // 落とし口の縁取り
  const holeEdge = new THREE.MeshStandardMaterial({ color: 0x1b1240, roughness: 0.6 });
  visBox(CHUTE.maxX - CHUTE.minX, 0.012, 0.05, (CHUTE.minX + CHUTE.maxX) / 2, 0.006, CHUTE.minZ + 0.025, holeEdge);
  visBox(0.05, 0.012, CHUTE.maxZ - CHUTE.minZ, CHUTE.maxX - 0.025, 0.006, (CHUTE.minZ + CHUTE.maxZ) / 2, holeEdge);

  // シャフト
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0616, roughness: 1 });
  const sh = 0.65;
  const sy = -sh - 0.02;
  const cx = (CHUTE.minX + CHUTE.maxX) / 2;
  const cz = (CHUTE.minZ + CHUTE.maxZ) / 2;
  const hw = (CHUTE.maxX - CHUTE.minX) / 2;
  const hd = (CHUTE.maxZ - CHUTE.minZ) / 2;
  staticBox(0.03, sh, hd, CHUTE.minX - 0.03, sy, cz, dark);
  staticBox(0.03, sh, hd, CHUTE.maxX + 0.03, sy, cz, dark);
  staticBox(hw, sh, 0.03, cx, sy, CHUTE.minZ - 0.03, dark);
  staticBox(hw, sh, 0.03, cx, sy, CHUTE.maxZ + 0.03, dark);
  staticBox(hw, 0.05, hd, cx, -sh * 2 - 0.05, cz, dark);
  // 床の厚み
  visBox(H * 2, 0.16, H * 2, 0, -0.085, 0, new THREE.MeshStandardMaterial({ color: 0x241848 })).scale.set(0.999, 1, 0.999);
}

function plushLayout() {
  const kinds = ['bear', 'bunny', 'penguin', 'duck'];
  let k = Math.floor(Math.random() * 4);
  const next = () => kinds[k++ % kinds.length];
  const spots = [];
  for (const x of [-0.9, -0.3, 0.3, 0.9]) spots.push([x, -1.1]);
  for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) spots.push([x, -0.5]);
  for (const x of [-0.9, -0.3, 0.3, 0.9]) spots.push([x, 0.1]);
  for (const x of [0, 0.6, 1.2]) spots.push([x, 0.7]);
  spots.push([-1.15, 0.42]);     // 落とし口の手前（見せ景品）
  spots.push([-0.52, 1.2]);      // ガードにもたれかかった景品
  for (const [x, z] of spots) {
    createPrize(next(), x + rand(-0.04, 0.04), 0.3, z + rand(-0.04, 0.04), rand(-0.35, 0.35));
  }
  // 2段目（山積み）
  createPrize(next(), -0.6, 0.85, -0.8, rand(-0.3, 0.3));
  createPrize(next(), 0.3, 0.85, -0.8, rand(-0.3, 0.3));
  createPrize(next(), 0.6, 0.85, -0.2, rand(-0.3, 0.3));
}

// ---------- ステージ: 2本爪 橋渡し ----------
const BRIDGE = { barX: 0.31, barY: 0.35, barR: 0.04, pitY: -1.3 };
function buildBridgeStage() {
  const rim = 0.1;
  const rimMat = new THREE.MeshStandardMaterial({ map: canvasTex(256, 32, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#1b1240' : '#ffd23f';
      g.beginPath();
      g.moveTo(i * 16, h);
      g.lineTo(i * 16 + 16, 0);
      g.lineTo(i * 16 + 32, 0);
      g.lineTo(i * 16 + 16, h);
      g.fill();
    }
  }), roughness: 0.6 });
  // 縁（四方）
  staticBox(H, 0.06, rim / 2, 0, -0.06, H - rim / 2, rimMat);
  staticBox(H, 0.06, rim / 2, 0, -0.06, -H + rim / 2, rimMat);
  staticBox(rim / 2, 0.06, H - rim, -H + rim / 2, -0.06, 0, rimMat);
  staticBox(rim / 2, 0.06, H - rim, H - rim / 2, -0.06, 0, rimMat);
  // 穴の底と壁
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x120c2a, roughness: 0.9 });
  const ph = (-BRIDGE.pitY) / 2;
  staticBox(H, 0.05, H, 0, BRIDGE.pitY - 0.05, 0, new THREE.MeshStandardMaterial({ map: feltTexture('#2a1f5c', 'rgba(255,210,63,0.25)'), roughness: 1 }));
  staticBox(H, ph, 0.03, 0, -ph - 0.12, -H + 0.03, pitMat);
  staticBox(H, ph, 0.03, 0, -ph - 0.12, H - 0.03, pitMat);
  staticBox(0.03, ph, H, -H + 0.03, -ph - 0.12, 0, pitMat);
  staticBox(0.03, ph, H, H - 0.03, -ph - 0.12, 0, pitMat);

  // 橋（2本のバー）
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.15, metalness: 1 });
  const len = (H - rim) * 2;
  const qx = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
  for (const sx of [-1, 1]) {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: MAT.bar, collisionFilterGroup: GROUP.ENV, collisionFilterMask: GROUP.PRIZE });
    body.addShape(new CANNON.Cylinder(BRIDGE.barR, BRIDGE.barR, len, 16), new CANNON.Vec3(), qx);
    body.position.set(sx * BRIDGE.barX, BRIDGE.barY, 0);
    addBody(body);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(BRIDGE.barR, BRIDGE.barR, len, 24), chrome);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(sx * BRIDGE.barX, BRIDGE.barY, 0);
    bar.castShadow = bar.receiveShadow = true;
    machineRoot.add(bar);
    // 支柱
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, BRIDGE.barY - BRIDGE.pitY, 12), chrome);
      post.position.set(sx * BRIDGE.barX, (BRIDGE.barY + BRIDGE.pitY) / 2, sz * (H - rim - 0.03));
      machineRoot.add(post);
    }
  }
}
function bridgeLayout() {
  const topY = BRIDGE.barY + BRIDGE.barR + 0.15 + 0.01;
  createPrize('figure', rand(-0.06, 0.06), topY, rand(-0.25, 0.25), rand(-0.06, 0.06));
}

MACHINES.ufo3.buildStage = buildPlushStage;
MACHINES.ufo3.layout = plushLayout;
MACHINES.ufo3.isWin = (p) => p.y < -0.3 && p.x < CHUTE.maxX + 0.05 && p.z > CHUTE.minZ - 0.05;
MACHINES.ufo3.exitX = (CHUTE.minX + CHUTE.maxX) / 2;
MACHINES.bridge2.buildStage = buildBridgeStage;
MACHINES.bridge2.layout = bridgeLayout;
MACHINES.bridge2.isWin = (p) => p.y < -0.2;
MACHINES.bridge2.exitX = -0.8;

// =====================================================================
// 景品
// =====================================================================
const prizes = [];
function createPrize(kind, x, y, z, yaw = 0) {
  const type = PRIZE_TYPES[kind];
  const body = new CANNON.Body({
    mass: type.mass, material: MAT[type.material],
    collisionFilterGroup: GROUP.PRIZE, collisionFilterMask: GROUP.ENV | GROUP.PRIZE | GROUP.CLAW,
    linearDamping: 0.05, angularDamping: type.material === 'plush' ? 0.4 : 0.1,
  });
  const group = new THREE.Group();
  type.build(body, group);
  body.position.set(x, y, z);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
  world.addBody(body);
  prizeRoot.add(group);
  const prize = { kind, name: type.name, value: type.value, body, mesh: group, touch: [-1e9, -1e9, -1e9], won: false, wonAt: 0 };
  body.userData = { prize };
  prizes.push(prize);
  return prize;
}
function disposeObject(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) {
      if (m === darkMat) continue;
      m.map?.dispose();
      m.dispose();
    }
  });
}
function removePrize(p) {
  releasePrize(p);
  world.removeBody(p.body);
  prizeRoot.remove(p.mesh);
  disposeObject(p.mesh);
  prizes.splice(prizes.indexOf(p), 1);
}

// =====================================================================
// アーム
// =====================================================================
const claw = {
  cfg: CLAW3,
  car: { x: 0, z: 0, vx: 0, vz: 0, ax: 0, az: 0 },
  y: 2.5,
  topY: 2.5,
  sway: { x: 0, z: 0, vx: 0, vz: 0 },
  bounce: { y: 0, v: 0 },
  angles: [0, 0, 0],
  squeeze: [0, 0, 0],
  blocked: [false, false, false],
  grabAngles: [0, 0, 0],
  state: 'idle',
  t: 0,
  firstContactY: null,
  gripScale: 1,
  loosening: false,
  hub: null,
  fingers: [],
  hubMesh: null,
  fingerMeshes: [],
  cable: null,
  gantry: null,
  carriage: null,
};
const hubPos = new CANNON.Vec3();
const hubQuat = new CANNON.Quaternion();
let fingerTargets = [];

function tipDir(cfg) { return { x: -Math.cos(cfg.tipTilt), y: Math.sin(cfg.tipTilt) }; }
function tipDepth(cfg, angle) {
  const d = tipDir(cfg);
  const armBottom = cfg.armLen * Math.cos(angle);
  const ty = d.x * Math.sin(angle) + d.y * Math.cos(angle);
  return Math.max(armBottom, armBottom - ty * cfg.tipLen) + cfg.armW / 2;
}

function buildClaw(def) {
  const cfg = def.claw;
  claw.cfg = cfg;
  claw.topY = RAIL_Y - 0.5;
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe9ebf2, roughness: 0.16, metalness: 1 });
  const color = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.3, metalness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

  const mk = (id) => {
    const b = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: MAT.claw, collisionFilterGroup: GROUP.CLAW, collisionFilterMask: GROUP.PRIZE });
    b.userData = { claw: id };
    return b;
  };
  claw.hub = mk('hub');
  claw.hub.addShape(new CANNON.Cylinder(cfg.hubR, cfg.hubR, 0.18, 16), new CANNON.Vec3(0, 0.07, 0));
  addBody(claw.hub);

  // ハブの見た目: 本体＋ドーム＋モーター
  const hubMesh = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(cfg.hubR, cfg.hubR + 0.02, 0.18, 40), chrome);
  housing.position.y = 0.07;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(cfg.hubR + 0.022, cfg.hubR + 0.022, 0.05, 40), color);
  band.position.y = 0.04;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(cfg.hubR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), color);
  dome.position.y = 0.16;
  dome.scale.y = 0.55;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  lamp.position.y = 0.27;
  for (const m of [housing, band, dome]) { m.castShadow = true; hubMesh.add(m); }
  hubMesh.add(lamp);
  hubMesh.userData.lamp = lamp;
  machineRoot.add(hubMesh);
  claw.hubMesh = hubMesh;

  const d = tipDir(cfg);
  const tipCenter = new CANNON.Vec3((d.x * cfg.tipLen) / 2, -cfg.armLen + (d.y * cfg.tipLen) / 2, 0);
  const tipQuat = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -cfg.tipTilt);
  claw.fingers = [];
  claw.fingerMeshes = [];
  fingerTargets = [];
  for (let i = 0; i < cfg.fingers; i++) {
    const b = mk(i);
    b.addShape(new CANNON.Box(new CANNON.Vec3(cfg.armW / 2, cfg.armLen / 2, cfg.armD / 2)), new CANNON.Vec3(0, -cfg.armLen / 2, 0));
    b.addShape(new CANNON.Box(new CANNON.Vec3(cfg.tipLen / 2, cfg.armW / 2, cfg.armD / 2)), tipCenter, tipQuat);
    addBody(b);
    claw.fingers.push(b);
    const g = new THREE.Group();
    // 爪は少し反った形に見せる（上半分と下半分）
    const upper = new THREE.Mesh(new THREE.BoxGeometry(cfg.armW, cfg.armLen * 0.55, cfg.armD), chrome);
    upper.position.y = -cfg.armLen * 0.275;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(cfg.armW * 0.9, cfg.armLen * 0.5, cfg.armD * 0.9), chrome);
    lower.position.y = -cfg.armLen * 0.75;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(cfg.tipLen, cfg.armW * 1.1, cfg.armD), rubber);
    tip.position.set(tipCenter.x, tipCenter.y, tipCenter.z);
    tip.quaternion.set(tipQuat.x, tipQuat.y, tipQuat.z, tipQuat.w);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, cfg.armD + 0.02, 16), color);
    hinge.rotation.x = Math.PI / 2;
    for (const m of [upper, lower, tip, hinge]) { m.castShadow = true; g.add(m); }
    machineRoot.add(g);
    claw.fingerMeshes.push(g);
    fingerTargets.push({ pos: new CANNON.Vec3(), quat: new CANNON.Quaternion() });
  }

  // ガントリー
  const gantry = new THREE.Group();
  const bridgeBar = new THREE.Mesh(new THREE.BoxGeometry(H * 2, 0.07, 0.12), chrome);
  bridgeBar.position.y = RAIL_Y - 0.06;
  gantry.add(bridgeBar);
  const carriage = new THREE.Group();
  const carBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.24), color);
  carBox.castShadow = true;
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 16), new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.6, roughness: 0.4 }));
  motor.rotation.z = Math.PI / 2;
  motor.position.set(0.16, 0.02, 0);
  carriage.add(carBox, motor);
  carriage.position.y = RAIL_Y - 0.16;
  gantry.add(carriage);
  machineRoot.add(gantry);
  claw.gantry = gantry;
  claw.carriage = carriage;
  claw.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  machineRoot.add(claw.cable);

  // 初期位置
  claw.car.x = def.home.x;
  claw.car.z = def.home.z;
  claw.car.vx = claw.car.vz = 0;
  claw.y = claw.topY;
  claw.sway = { x: 0, z: 0, vx: 0, vz: 0 };
  claw.bounce = { y: 0, v: 0 };
  claw.angles = [cfg.restAngle, cfg.restAngle, cfg.restAngle];
  claw.state = 'idle';
  computeClawTargets();
  snapClaw();
}

const _qy = new CANNON.Quaternion();
const _qz = new CANNON.Quaternion();
const _qt = new CANNON.Quaternion();
const _v = new CANNON.Vec3();
const AX_Y = new CANNON.Vec3(0, 1, 0);
const AX_Z = new CANNON.Vec3(0, 0, 1);

function cableLength() { return Math.max(0.3, RAIL_Y - 0.25 - claw.y); }

function computeClawTargets() {
  const cfg = claw.cfg;
  const L = cableLength();
  const sx = Math.sin(claw.sway.x) * L;
  const sz = Math.sin(claw.sway.z) * L;
  hubPos.set(claw.car.x + sx, claw.y + claw.bounce.y, claw.car.z + sz);
  // 振り子の傾き
  hubQuat.setFromEuler(claw.sway.z, 0, -claw.sway.x);
  for (let i = 0; i < cfg.fingers; i++) {
    const theta = cfg.thetaOffset + (i * Math.PI * 2) / cfg.fingers;
    _qy.setFromAxisAngle(AX_Y, theta);
    _qz.setFromAxisAngle(AX_Z, claw.angles[i]);
    _qy.mult(_qz, _qt);
    hubQuat.mult(_qt, fingerTargets[i].quat);
    _qy.vmult(_v.set(cfg.hingeR, 0, 0), _v);
    hubQuat.vmult(_v, _v);
    fingerTargets[i].pos.set(hubPos.x + _v.x, hubPos.y + _v.y, hubPos.z + _v.z);
  }
}

const _qinv = new CANNON.Quaternion();
const _qd = new CANNON.Quaternion();
function driveKinematic(body, pos, quat, dt) {
  body.velocity.set((pos.x - body.position.x) / dt, (pos.y - body.position.y) / dt, (pos.z - body.position.z) / dt);
  body.quaternion.conjugate(_qinv);
  quat.mult(_qinv, _qd);
  if (_qd.w < 0) { _qd.x = -_qd.x; _qd.y = -_qd.y; _qd.z = -_qd.z; _qd.w = -_qd.w; }
  const w = Math.min(1, _qd.w);
  const s = Math.sqrt(1 - w * w);
  if (s < 1e-6) body.angularVelocity.set(0, 0, 0);
  else {
    const k = (2 * Math.acos(w)) / s / dt;
    body.angularVelocity.set(_qd.x * k, _qd.y * k, _qd.z * k);
  }
}
function driveClaw(dt) {
  computeClawTargets();
  driveKinematic(claw.hub, hubPos, hubQuat, dt);
  claw.fingers.forEach((b, i) => driveKinematic(b, fingerTargets[i].pos, fingerTargets[i].quat, dt));
}
function snapClaw() {
  claw.hub.position.copy(hubPos);
  claw.hub.quaternion.copy(hubQuat);
  claw.fingers.forEach((b, i) => {
    b.position.copy(fingerTargets[i].pos);
    b.quaternion.copy(fingerTargets[i].quat);
  });
}

// 横移動（慣性つき）
function driveCarriage(tvx, tvz, dt) {
  const c = claw.car;
  const px = c.vx;
  const pz = c.vz;
  if (settings.inertia) {
    const step = (v, t) => {
      const speedingUp = Math.abs(t) > Math.abs(v) && Math.sign(t || v) === Math.sign(v || t);
      const a = (speedingUp ? MOTION.accel : MOTION.decel) * dt;
      return Math.abs(t - v) <= a ? t : v + Math.sign(t - v) * a;
    };
    c.vx = step(c.vx, tvx);
    c.vz = step(c.vz, tvz);
  } else {
    c.vx = tvx;
    c.vz = tvz;
  }
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  const L = MOTION.limit;
  if (c.x > L || c.x < -L) { c.x = clamp(c.x, -L, L); c.vx = 0; }
  if (c.z > L || c.z < -L) { c.z = clamp(c.z, -L, L); c.vz = 0; }
  c.ax = (c.vx - px) / dt;
  c.az = (c.vz - pz) / dt;
}
function atLimitX() { return claw.car.x >= MOTION.limit - 1e-4; }
function atLimitZ() { return claw.car.z <= -MOTION.limit + 1e-4; }

// 振り子とバウンド
function updateSway(dt) {
  const s = claw.sway;
  if (!settings.sway) { s.x = s.z = s.vx = s.vz = 0; }
  else {
    const L = cableLength();
    const g = 9.82;
    const ax = -(g / L) * Math.sin(s.x) - MOTION.swayDamping * s.vx - (claw.car.ax / L) * Math.cos(s.x);
    const az = -(g / L) * Math.sin(s.z) - MOTION.swayDamping * s.vz - (claw.car.az / L) * Math.cos(s.z);
    s.vx += ax * dt;
    s.vz += az * dt;
    s.x = clamp(s.x + s.vx * dt, -0.3, 0.3);
    s.z = clamp(s.z + s.vz * dt, -0.3, 0.3);
  }
  const b = claw.bounce;
  b.v += (-140 * b.y - 9 * b.v) * dt;
  b.y += b.v * dt;
}

// =====================================================================
// 掴み（確率機の当たり判定とアシスト）
// =====================================================================
const held = [];
let play = null;   // 現在のプレイ { power, required, loose, atari, yen }

function gripN() { return 1 + (play ? play.power : 30) / 100 * 20; }

function attachPrize(p) {
  // 爪先あたりの点で吊る（端を持てば端だけが持ち上がる）
  const depth = tipDepth(claw.cfg, claw.angles[0]) * 0.75;
  const gp = new CANNON.Vec3(claw.hub.position.x, claw.hub.position.y - depth, claw.hub.position.z);
  const pa = new CANNON.Vec3();
  const pb = new CANNON.Vec3();
  claw.hub.pointToLocalFrame(gp, pa);
  p.body.pointToLocalFrame(gp, pb);
  const c = new CANNON.PointToPointConstraint(claw.hub, pa, p.body, pb, gripN() * DT);
  world.addConstraint(c);
  p.body.angularDamping = 0.6;
  held.push({ prize: p, constraint: c, pa, pb });
}
function releasePrize(p) {
  const i = held.findIndex((h) => h.prize === p);
  if (i < 0) return;
  world.removeConstraint(held[i].constraint);
  p.body.angularDamping = p.kind === 'figure' ? 0.1 : 0.4;
  held.splice(i, 1);
}
function releaseAll() { for (const h of [...held]) releasePrize(h.prize); }

function tryAttach() {
  const out = [];
  for (const p of prizes) {
    if (p.won) continue;
    const n = p.touch.filter((t) => simTime - t < 0.4).length;
    if (n < play.required) continue;
    const d = Math.hypot(p.body.position.x - claw.hub.position.x, p.body.position.z - claw.hub.position.z);
    if (d > (p.kind === 'figure' ? 0.9 : n >= 2 ? 0.5 : 0.38)) continue;
    out.push({ p, n, d });
  }
  out.sort((a, b) => b.n - a.n || a.d - b.d);
  for (const c of out.slice(0, 2)) attachPrize(c.p);
  return out.length > 0;
}

const _wa = new CANNON.Vec3();
const _wb = new CANNON.Vec3();
function updateHeld() {
  const imp = gripN() * claw.gripScale * DT;
  for (const h of [...held]) {
    for (const eq of h.constraint.equations) { eq.maxForce = imp; eq.minForce = -imp; }
    claw.hub.pointToWorldFrame(h.pa, _wa);
    h.prize.body.pointToWorldFrame(h.pb, _wb);
    if (_wa.distanceTo(_wb) > 0.14) releasePrize(h.prize);
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
  hubTouch = clawTouch = false;
  for (const c of world.contacts) {
    const a = c.bi.userData;
    const b = c.bj.userData;
    if (!a || !b) continue;
    let id, prize;
    if (a.claw !== undefined && b.prize) { id = a.claw; prize = b.prize; }
    else if (b.claw !== undefined && a.prize) { id = b.claw; prize = a.prize; }
    else continue;
    clawTouch = true;
    if (id === 'hub') hubTouch = true;
    else { fingerTouch[id] = true; prize.touch[id] = simTime; }
  }
}

// =====================================================================
// 入力
// =====================================================================
const input = { b1: false, b2: false, b1Down: false, b2Down: false, dropDown: false, moveDown: false, dirs: new Set(), padDirs: new Set() };
const KEY_DIR = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

function setB(which, down) {
  if (down && !input[which]) input[which + 'Down'] = true;
  input[which] = down;
}

window.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT') {
    if (e.code !== 'Space' && !KEY_DIR[e.code]) return;
    e.target.blur();
  }
  initAudio();
  if (e.repeat) { if (KEY_DIR[e.code] || e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'KeyC') { insertCoin(100); return; }
  if (e.code === 'KeyV') { setView(currentView === 'front' ? 'side' : 'front'); return; }
  if (settings.control === 'buttons') {
    if (['ArrowRight', 'KeyD', 'Digit1', 'Numpad1'].includes(e.code)) { e.preventDefault(); setB('b1', true); }
    if (['ArrowUp', 'KeyW', 'Digit2', 'Numpad2'].includes(e.code)) { e.preventDefault(); setB('b2', true); }
    if (e.code === 'Space') e.preventDefault();
  } else {
    if (e.code === 'Space') { e.preventDefault(); input.dropDown = true; }
    const d = KEY_DIR[e.code];
    if (d) { e.preventDefault(); input.dirs.add(d); input.moveDown = true; }
  }
});
window.addEventListener('keyup', (e) => {
  if (['ArrowRight', 'KeyD', 'Digit1', 'Numpad1'].includes(e.code)) setB('b1', false);
  if (['ArrowUp', 'KeyW', 'Digit2', 'Numpad2'].includes(e.code)) setB('b2', false);
  const d = KEY_DIR[e.code];
  if (d) input.dirs.delete(d);
});
window.addEventListener('blur', () => {
  setB('b1', false);
  setB('b2', false);
  input.dirs.clear();
  input.padDirs.clear();
});

function holdButton(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('held');
    onDown();
  });
  const up = () => { el.classList.remove('held'); onUp(); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
holdButton($('btn1'), () => setB('b1', true), () => setB('b1', false));
holdButton($('btn2'), () => setB('b2', true), () => setB('b2', false));
holdButton($('btnDrop'), () => { input.dropDown = true; }, () => {});
document.querySelectorAll('#pad button').forEach((btn) => {
  holdButton(btn, () => { input.padDirs.add(btn.dataset.dir); input.moveDown = true; }, () => input.padDirs.delete(btn.dataset.dir));
});

const _fwd = new THREE.Vector3();
function leverInput() {
  const has = (d) => input.dirs.has(d) || input.padDirs.has(d);
  const ix = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
  const iy = (has('up') ? 1 : 0) - (has('down') ? 1 : 0);
  if (!ix && !iy) return null;
  camera.getWorldDirection(_fwd);
  let fx = 0, fz = 0;
  if (Math.abs(_fwd.x) > Math.abs(_fwd.z)) fx = Math.sign(_fwd.x); else fz = Math.sign(_fwd.z);
  const x = -fz * ix + fx * iy;
  const z = fx * ix + fz * iy;
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

// =====================================================================
// お金
// =====================================================================
function credits() { return money.credits[settings.machine]; }

function insertCoin(v) {
  initAudio();
  if (money.wallet < v) {
    flashStatus('お金が足りません。財布の「お小遣いを追加」で補充できます', true);
    sfx.error();
    return;
  }
  if (credits().length >= 30) {
    flashStatus('クレジットがいっぱいです', true);
    return;
  }
  money.wallet -= v;
  money.spent += v;
  if (v === 500) for (let i = 0; i < 6; i++) credits().push(500 / 6);
  else credits().push(100);
  sfx.coin();
  if (money.spent > settings.budget && money.spent - v <= settings.budget) {
    flashStatus(`今日の予算 ${yen(settings.budget)} を超えました`, true);
  }
  updateMoneyUI();
  save();
}

function startPlay() {
  const list = credits();
  if (!list.length) {
    flashStatus('100円玉を入れてください（Cキーでも投入できます）', true);
    sfx.error();
    return false;
  }
  const paid = list.shift();
  const m = settings.machine;
  money.since[m] += paid;
  if (current.kind === 'probability') {
    banks[m] += paid;
    const random = settings.randomAtari > 0 && Math.random() < 1 / settings.randomAtari;
    const atari = banks[m] >= settings.payout || random;
    play = atari
      ? { yen: paid, atari: true, power: settings.atariPower, required: 1, loose: false, squeeze: 0.09 }
      : { yen: paid, atari: false, power: settings.normalPower, required: 2, loose: Math.random() < settings.looseChance / 100, squeeze: 0.025 };
  } else {
    play = { yen: paid, atari: false, power: settings.bridgePower, required: 2, loose: false, squeeze: 0.05 };
  }
  sfx.start();
  updateMoneyUI();
  save();
  return true;
}

function onWin(p) {
  const m = settings.machine;
  const cost = money.since[m];
  money.since[m] = 0;
  money.wins.unshift({ name: p.name, value: p.value, cost, machine: m });
  if (money.wins.length > 50) money.wins.length = 50;
  if (current.kind === 'probability') banks[m] = Math.max(0, banks[m] - settings.payout);
  $('popupName').textContent = p.name;
  $('popupCost').textContent = `この景品に使った金額 ${yen(cost)}`;
  const pop = $('popup');
  pop.classList.add('show');
  clearTimeout(onWin.timer);
  onWin.timer = setTimeout(() => pop.classList.remove('show'), 2600);
  sfx.win();
  updateMoneyUI();
  save();
}

// =====================================================================
// 進行（ステートマシン）
// =====================================================================
let simTime = 0;
let replenishTimer = 0;
let statusOverride = { text: '', until: 0, alert: false };

const STATUS = {
  idle: () => (credits().length
    ? (settings.control === 'buttons' ? '① を押している間、アームが右へ動きます' : '移動するとスタート（スペースで降下）')
    : '100円を入れてください'),
  moveX: () => '① 右へ移動中…離すと止まります',
  waitZ: () => `② を押している間、奥へ動きます（残り ${Math.ceil(10 - claw.t)} 秒）`,
  moveZ: () => '② 奥へ移動中…離すとアームが降ります',
  lever: () => `移動して スペース / GO で降下（残り ${Math.ceil(20 - claw.t)} 秒）`,
  settle: () => 'アームが降ります…',
  opening: () => 'アームが降ります…',
  descending: () => 'アームが降ります…',
  closing: () => 'キャッチ！',
  grabbing: () => 'キャッチ！',
  lifting: () => '上昇中…',
  topPause: () => '上昇中…',
  returning: () => '取り出し口へ移動中…',
  releasing: () => 'リリース',
  resetting: () => '',
};

function setState(s) {
  claw.state = s;
  claw.t = 0;
}
function flashStatus(text, alert = false) {
  statusOverride = { text, until: performance.now() + 2600, alert };
}

function approachAngles(target, step) {
  let done = true;
  for (let i = 0; i < claw.cfg.fingers; i++) {
    const a = claw.angles[i];
    if (Math.abs(target - a) <= step) claw.angles[i] = target;
    else { claw.angles[i] = a + Math.sign(target - a) * step; done = false; }
  }
  return done;
}

function updateLogic(dt) {
  claw.t += dt;
  const cfg = claw.cfg;
  const speed = MOTION.maxSpeed * settings.speed / 100;
  let tvx = 0, tvz = 0;

  switch (claw.state) {
    case 'idle':
      approachAngles(cfg.restAngle, MOTION.openSpeed * dt);
      if (settings.control === 'buttons') {
        if (input.b1Down && startPlay()) setState('moveX');
      } else if ((input.dropDown || input.moveDown) && startPlay()) setState('lever');
      break;
    case 'moveX':
      if (input.b1 && !atLimitX()) tvx = speed;
      else { sfx.click(); setState('waitZ'); }
      break;
    case 'waitZ':
      if (input.b2Down) setState('moveZ');
      else if (claw.t > 10) setState('settle');
      break;
    case 'moveZ':
      if (input.b2 && !atLimitZ()) tvz = -speed;
      else { sfx.click(); setState('settle'); }
      break;
    case 'lever': {
      const mv = leverInput();
      if (mv) { tvx = mv.x * speed; tvz = mv.z * speed; }
      if (input.dropDown || claw.t > 20) setState('settle');
      break;
    }
    case 'settle':
      if (claw.t > 0.45 && Math.hypot(claw.car.vx, claw.car.vz) < 0.01) {
        sfx.drop();
        setState('opening');
      }
      break;
    case 'opening':
      if (approachAngles(cfg.openAngle, MOTION.openSpeed * dt)) {
        claw.firstContactY = null;
        setState('descending');
      }
      break;
    case 'descending': {
      claw.y -= MOTION.dropSpeed * dt;
      if (clawTouch && claw.firstContactY === null) claw.firstContactY = claw.y;
      const floorY = current.kind === 'skill' ? BRIDGE.pitY + 0.4 : 0;
      const minY = floorY + tipDepth(cfg, cfg.openAngle) + 0.02;
      let stop = hubTouch;
      if (claw.y <= minY) { claw.y = minY; stop = true; }
      if (claw.firstContactY !== null && claw.firstContactY - claw.y >= cfg.extraPush) stop = true;
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
      for (let i = 0; i < cfg.fingers; i++) {
        if (claw.blocked[i]) continue;
        let rate = MOTION.closeSpeed;
        if (fingerTouch[i]) {
          rate *= 0.35;
          claw.squeeze[i] += rate * dt;
          if (claw.squeeze[i] >= play.squeeze) claw.blocked[i] = true;
        }
        claw.angles[i] = Math.max(cfg.closedAngle, claw.angles[i] - rate * dt);
        if (claw.angles[i] <= cfg.closedAngle) claw.blocked[i] = true;
        if (!claw.blocked[i]) done = false;
      }
      if (done || claw.t > 2.2) setState('grabbing');
      break;
    }
    case 'grabbing':
      if (claw.t > 0.45) {
        if (tryAttach()) sfx.grab();
        claw.gripScale = 1;
        setState('lifting');
      }
      break;
    case 'lifting':
      claw.y += MOTION.liftSpeed * Math.min(1, 0.3 + claw.t * 1.5) * dt;
      if (claw.y >= claw.topY) {
        claw.y = claw.topY;
        claw.grabAngles = [...claw.angles];
        // 上で止まるときの「ガクッ」
        claw.bounce.v = -0.5;
        if (settings.sway) { claw.sway.vx += rand(-0.15, 0.15); claw.sway.vz += rand(-0.15, 0.15); }
        claw.loosening = play.loose;
        sfx.clunk();
        setState('topPause');
      }
      break;
    case 'topPause':
      if (claw.loosening) {
        claw.gripScale += (0.22 - claw.gripScale) * Math.min(1, dt * 6);
        for (let i = 0; i < cfg.fingers; i++) {
          claw.angles[i] = Math.min(claw.grabAngles[i] + 0.32, claw.angles[i] + 0.5 * dt);
        }
      }
      if (claw.t > 0.8) setState('returning');
      break;
    case 'returning': {
      const dx = current.home.x - claw.car.x;
      const dz = current.home.z - claw.car.z;
      const d = Math.hypot(dx, dz);
      const v = Math.min(MOTION.returnSpeed, Math.sqrt(2 * MOTION.decel * d) * 0.9);
      if (d > 0.004) { tvx = (dx / d) * v; tvz = (dz / d) * v; }
      if (d < 0.004 && Math.hypot(claw.car.vx, claw.car.vz) < 0.03) {
        claw.car.x = current.home.x;
        claw.car.z = current.home.z;
        claw.car.vx = claw.car.vz = 0;
        setState('releasing');
      }
      break;
    }
    case 'releasing':
      approachAngles(cfg.openAngle, MOTION.openSpeed * dt);
      if (claw.t > 0.2 && held.length) releaseAll();
      if (claw.t > 1.3) setState('resetting');
      break;
    case 'resetting':
      if (approachAngles(cfg.restAngle, MOTION.openSpeed * dt) && claw.t > 0.4) {
        claw.gripScale = 1;
        claw.loosening = false;
        play = null;
        setState('idle');
        updateMoneyUI();
      }
      break;
  }

  // 移動中・待機中は慣性で滑らかに止まる
  if (['returning', 'moveX', 'moveZ', 'lever'].includes(claw.state) || Math.abs(claw.car.vx) + Math.abs(claw.car.vz) > 0) {
    driveCarriage(tvx, tvz, dt);
  } else {
    claw.car.ax = claw.car.az = 0;
  }
  updateSway(dt);
  input.b1Down = input.b2Down = input.dropDown = input.moveDown = false;
}

function checkPrizes(dt) {
  for (const p of [...prizes]) {
    const pos = p.body.position;
    if (!p.won) {
      if (current.isWin(pos)) {
        p.won = true;
        p.wonAt = simTime;
        releasePrize(p);
        onWin(p);
      } else if (pos.y < -4 || !Number.isFinite(pos.y)) {
        p.body.position.set(0.5, 1.5, -0.5);
        p.body.velocity.setZero();
        p.body.angularVelocity.setZero();
      }
    } else if (simTime - p.wonAt > 2.5) {
      removePrize(p);
    }
  }
  // 店員さんの補充
  replenishTimer -= dt;
  if (replenishTimer <= 0 && claw.state === 'idle') {
    replenishTimer = 1;
    const remaining = prizes.filter((p) => !p.won).length;
    if (settings.machine === 'ufo3' && remaining < 12) {
      const kinds = ['bear', 'bunny', 'penguin', 'duck'];
      createPrize(pick(kinds), rand(-0.6, 1.2), 1.6, rand(-1.1, 0.3), rand(-0.4, 0.4));
      flashStatus('店員さんが景品を補充しました');
    } else if (settings.machine === 'bridge2' && remaining === 0) {
      bridgeLayout();
      flashStatus('新しい景品がセットされました');
    }
  }
}

// =====================================================================
// 台の組み立て・切り替え
// =====================================================================
function buildMachine(id) {
  releaseAll();
  for (const b of stageBodies) world.removeBody(b);
  stageBodies = [];
  for (const p of [...prizes]) removePrize(p);
  disposeObject(machineRoot);
  machineRoot.clear();
  neighborRoot.clear();
  bulbs = [];
  play = null;

  settings.machine = id;
  current = MACHINES[id];
  document.documentElement.style.setProperty('--neon', current.color);
  document.documentElement.style.setProperty('--neon-2', current.accent);
  neonA.color.set(current.color);
  neonB.color.set(current.accent);

  buildCabinet(current);
  current.buildStage();
  buildClaw(current);
  current.layout();
  // 景品を落ち着かせる
  for (let i = 0; i < 300; i++) physicsStep(DT);
  for (const p of prizes) p.touch.fill(-1e9);
  syncVisuals();
  buildNeighbors();
  document.querySelectorAll('#topbar button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.machine === id)));
  updateMoneyUI();
  save();
}

// 景品を材質ごとに1つのメッシュへまとめる（隣の台の描画を軽くする）
function mergedPrizes() {
  const out = new THREE.Group();
  const buckets = new Map();
  prizeRoot.updateMatrixWorld(true);
  prizeRoot.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) {
      const c = o.clone();
      o.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      out.add(c);
      return;
    }
    let geo = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
    geo = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
  });
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (merged) out.add(new THREE.Mesh(merged, mat));
  }
  return out;
}

// 隣に並ぶ台（見た目だけのコピー）
function buildNeighbors() {
  const hues = [0.12, -0.18];
  [-1, 1].forEach((side, i) => {
    const g = new THREE.Group();
    const cab = machineRoot.clone(true);
    g.add(cab, mergedPrizes());
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      if (o.userData.tint) {
        o.material = o.material.clone();
        o.material.color.offsetHSL(hues[i], 0, 0);
      }
      if (o.isInstancedMesh) bulbs.push({ mesh: o, phase: i * 7 + 3 });
    });
    g.position.x = side * NEIGHBOR_X;
    neighborRoot.add(g);
  });
  machineRoot.traverse((o) => { if (o.isInstancedMesh) bulbs.push({ mesh: o, phase: 0 }); });
}

// =====================================================================
// 店内（床と壁）
// =====================================================================
function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = GROUND_Y;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#120d2c';
    g.fillRect(0, 0, w, h);
    g.font = '900 120px "M PLUS Rounded 1c", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff4fa3';
    g.shadowBlur = 40;
    g.fillStyle = '#ffd6ec';
    g.fillText('GAME CENTER', w / 2, h / 2);
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), new THREE.MeshBasicMaterial({ map: wallTex, toneMapped: false }));
  wall.position.set(0, 3.5, -6);
  wall.material.color.setScalar(0.55);
  scene.add(wall);
}

// =====================================================================
// 画面（HUD）
// =====================================================================
function updateMoneyUI() {
  const wins = money.wins;
  const value = wins.reduce((s, w) => s + w.value, 0);
  $('walletYen').textContent = yen(money.wallet);
  $('spentYen').textContent = yen(money.spent);
  $('winCount').textContent = `${wins.length}個`;
  $('winValue').textContent = yen(value);
  $('perWin').textContent = wins.length ? yen(money.spent / wins.length) : '—';
  const bal = value - money.spent;
  const balEl = $('balance');
  balEl.textContent = signedYen(bal);
  balEl.className = bal > 0 ? 'plus' : bal < 0 ? 'minus' : '';
  const ratio = money.spent / settings.budget;
  const bar = $('budgetBar');
  bar.querySelector('i').style.width = `${Math.min(100, ratio * 100)}%`;
  bar.className = `budget${ratio > 1 ? ' over' : ratio > 0.75 ? ' warn' : ''}`;
  $('budgetText').textContent = ratio > 1
    ? `予算 ${yen(settings.budget)} を ${yen(money.spent - settings.budget)} 超えています`
    : `予算 ${yen(settings.budget)} のうち ${yen(money.spent)} 使用`;
  $('history').innerHTML = wins.slice(0, 8)
    .map((w) => `<div><span>${w.name}</span><span>${yen(w.cost)}で獲得</span></div>`).join('');
  $('coin100').disabled = money.wallet < 100;
  $('coin500').disabled = money.wallet < 500;
  updateStaffView();
}

function updateStaffView() {
  const el = $('staffView');
  const show = settings.staffMode && current?.kind === 'probability';
  el.hidden = !show;
  if (!show) return;
  const w = $('wallet');
  el.style.top = `${w.getBoundingClientRect().bottom + 8}px`;
  const bank = banks[settings.machine];
  $('bankText').textContent = `${yen(bank)} / 設定 ${yen(settings.payout)}`;
  const bar = $('bankBar');
  bar.querySelector('i').style.width = `${Math.min(100, (bank / settings.payout) * 100)}%`;
  bar.className = `budget${bank >= settings.payout ? ' ready' : ''}`;
  $('bankNote').textContent = play
    ? (play.atari ? 'このプレイ: 当たり（アーム最大）' : `このプレイ: 通常（パワー${play.power}%${play.loose ? '・上でゆるむ' : ''}）`)
    : bank + 100 >= settings.payout ? '次のプレイで当たりです' : `当たりまであと ${yen(settings.payout - bank)}`;
}

let lastLed = '';
function updateFrameUI() {
  const s = claw.state;
  let label = 'CREDIT';
  let value = credits().length;
  if (s === 'waitZ') { label = 'TIME'; value = Math.max(0, Math.ceil(10 - claw.t)); }
  if (s === 'lever') { label = 'TIME'; value = Math.max(0, Math.ceil(20 - claw.t)); }
  const key = label + value;
  if (key !== lastLed) {
    lastLed = key;
    $('ledLabel').textContent = label;
    $('ledValue').textContent = value;
    drawLed(label, value);
  }
  const now = performance.now();
  const st = $('status');
  const text = now < statusOverride.until ? statusOverride.text : STATUS[s]?.() ?? '';
  if (st.textContent !== text) st.textContent = text;
  st.classList.toggle('alert', now < statusOverride.until && statusOverride.alert);
  st.hidden = !text;

  const b1Lit = s === 'idle' && credits().length > 0 && settings.control === 'buttons';
  const b2Lit = s === 'waitZ';
  $('btn1').classList.toggle('lit', b1Lit);
  $('btn2').classList.toggle('lit', b2Lit);
  $('btnDrop').classList.toggle('lit', s === 'lever' || (s === 'idle' && credits().length > 0));
  if (panelButtons) {
    const blink = 0.5 + 0.5 * Math.sin(now / 160);
    panelButtons.b1.mat.emissiveIntensity = b1Lit ? 0.4 + blink * 1.2 : s === 'moveX' ? 1.6 : 0.12;
    panelButtons.b2.mat.emissiveIntensity = b2Lit ? 0.4 + blink * 1.2 : s === 'moveZ' ? 1.6 : 0.12;
    panelButtons.b1.cap.position.y = input.b1 && s === 'moveX' ? 0.11 : 0.13;
    panelButtons.b2.cap.position.y = input.b2 && s === 'moveZ' ? 0.11 : 0.13;
  }
}

// ---------- 設定パネル ----------
const RANGE_FMT = {
  payout: (v) => yen(v),
  normalPower: (v) => `${v}%`,
  atariPower: (v) => `${v}%`,
  looseChance: (v) => `${v}%`,
  randomAtari: (v) => (v > 0 ? `1/${v}` : 'なし'),
  bridgePower: (v) => `${v}%`,
  speed: (v) => `${v}%`,
  budget: (v) => yen(v),
};
function syncSettingsUI() {
  for (const [k, f] of Object.entries(RANGE_FMT)) {
    $(k).value = settings[k];
    $(`${k}Out`).textContent = f(settings[k]);
  }
  for (const k of ['staffMode', 'inertia', 'sway', 'guide', 'sound']) $(k).checked = settings[k];
  document.querySelectorAll('#shopSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shop === settings.shop)));
  document.querySelectorAll('#controlSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.control === settings.control)));
  $('shopNote').textContent = SHOPS[settings.shop]?.note ?? 'カスタム設定';
  const lever = settings.control === 'lever';
  $('pad').hidden = !lever;
  $('leverActions').hidden = !lever;
  $('btnActions').hidden = lever;
  $('help').innerHTML = lever
    ? 'WASD / 矢印: 移動<br />スペース / GO: 降下<br />C: 100円投入　V: 視点切替'
    : '① 押している間 右へ（→ / D / 1）<br />② 押している間 奥へ（↑ / W / 2）<br />②を離すとアームが降ります<br />C: 100円投入　V: 視点切替';
}
for (const k of Object.keys(RANGE_FMT)) {
  $(k).addEventListener('input', (e) => {
    settings[k] = Number(e.target.value);
    $(`${k}Out`).textContent = RANGE_FMT[k](settings[k]);
    if (['payout', 'normalPower', 'atariPower', 'looseChance', 'randomAtari', 'bridgePower'].includes(k)) {
      settings.shop = 'custom';
      syncSettingsUI();
    }
    updateMoneyUI();
    save();
  });
}
for (const k of ['staffMode', 'inertia', 'sway', 'guide', 'sound']) {
  $(k).addEventListener('change', (e) => { settings[k] = e.target.checked; updateMoneyUI(); save(); });
}
document.querySelectorAll('#shopSeg button').forEach((b) => b.addEventListener('click', () => {
  Object.assign(settings, stripNote(SHOPS[b.dataset.shop]), { shop: b.dataset.shop });
  syncSettingsUI();
  updateMoneyUI();
  save();
}));
document.querySelectorAll('#controlSeg button').forEach((b) => b.addEventListener('click', () => {
  if (claw.state !== 'idle') { flashStatus('プレイが終わってから切り替えてください', true); return; }
  settings.control = b.dataset.control;
  syncSettingsUI();
  save();
}));
document.querySelectorAll('#topbar button').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.machine === settings.machine) return;
  if (claw.state !== 'idle') { flashStatus('プレイが終わってから台を移動してください', true); return; }
  buildMachine(b.dataset.machine);
  setView(currentView);
  flashStatus(`${current.label}の台に移動しました`);
}));
$('settingsBtn').addEventListener('click', () => $('settings').classList.toggle('open'));
$('settingsClose').addEventListener('click', () => $('settings').classList.remove('open'));
$('coin100').addEventListener('click', () => insertCoin(100));
$('coin500').addEventListener('click', () => insertCoin(500));
$('topup').addEventListener('click', () => {
  money.wallet += 1000;
  money.topUps += 1000;
  sfx.coin();
  updateMoneyUI();
  save();
});
$('walletHead').addEventListener('click', () => { $('wallet').classList.toggle('collapsed'); updateStaffView(); });
$('resetAll').addEventListener('click', () => { $('resetConfirm').hidden = false; });
$('resetNo').addEventListener('click', () => { $('resetConfirm').hidden = true; });
$('resetYes').addEventListener('click', () => {
  Object.assign(money, freshMoney());
  banks.ufo3 = 0;
  $('resetConfirm').hidden = true;
  updateMoneyUI();
  save();
  flashStatus('財布と記録をリセットしました');
});

// ---------- 視点 ----------
let currentView = 'front';
const VIEWS = {
  front: new THREE.Vector3(0, 0.36, 1).normalize(),
  side: new THREE.Vector3(1, 0.3, 0.32).normalize(),
};
function setView(name) {
  currentView = name;
  const aspect = window.innerWidth / window.innerHeight;
  const hTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect;
  const dist = name === 'side' ? Math.max(6, 2.0 / hTan + 1.5) : Math.max(9, 2.4 / hTan + 2.6);
  controls.target.set(0, aspect < 0.8 ? 0.5 : 1.0, 0);
  camera.position.copy(controls.target).addScaledVector(VIEWS[name], dist);
  camera.lookAt(controls.target);
}
$('viewFront').addEventListener('click', () => setView('front'));
$('viewSide').addEventListener('click', () => setView('side'));
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  setView(currentView);
  updateStaffView();
});

// =====================================================================
// 効果音（WebAudio で生成）
// =====================================================================
let actx = null;
let motor = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  actx = new Ctx();
  // モーター音（速度に合わせて音量と高さが変わる）
  const osc = actx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 70;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const gain = actx.createGain();
  gain.gain.value = 0;
  osc.connect(lp).connect(gain).connect(actx.destination);
  osc.start();
  motor = { osc, gain };
}
function tone(freq, dur, { type = 'square', vol = 0.04, slide = 0, delay = 0 } = {}) {
  if (!actx || !settings.sound) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
const sfx = {
  coin: () => { tone(1320, 0.08, { type: 'triangle', vol: 0.06 }); tone(1760, 0.18, { type: 'triangle', vol: 0.05, delay: 0.07 }); },
  start: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.09, { vol: 0.035, delay: i * 0.07 })),
  click: () => tone(180, 0.04, { type: 'square', vol: 0.03 }),
  drop: () => tone(520, 0.4, { type: 'triangle', slide: -260, vol: 0.04 }),
  close: () => tone(240, 0.25, { type: 'sawtooth', vol: 0.025, slide: -60 }),
  grab: () => tone(660, 0.08, { type: 'triangle', vol: 0.04 }),
  clunk: () => tone(90, 0.12, { type: 'square', vol: 0.05 }),
  error: () => tone(160, 0.18, { type: 'square', vol: 0.035 }),
  win: () => {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.16, { vol: 0.05, delay: i * 0.1 }));
    [523, 659, 784].forEach((f) => tone(f, 0.7, { type: 'triangle', vol: 0.03, delay: 0.6 }));
  },
};
function updateMotorSound() {
  if (!motor) return;
  const s = claw.state;
  const lateral = Math.hypot(claw.car.vx, claw.car.vz);
  const vertical = s === 'descending' || s === 'lifting' ? 0.5 : 0;
  const level = settings.sound ? Math.min(1, lateral * 2 + vertical) : 0;
  motor.gain.gain.setTargetAtTime(level * 0.035, actx.currentTime, 0.05);
  motor.osc.frequency.setTargetAtTime(60 + level * 50 + (s === 'lifting' ? 25 : 0), actx.currentTime, 0.05);
}

// =====================================================================
// ガイド光
// =====================================================================
const guideLine = new THREE.Mesh(
  new THREE.CylinderGeometry(0.006, 0.006, 1, 6),
  new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
);
scene.add(guideLine);

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
  checkPrizes(dt);
  simTime += dt;
}

const bulbColor = new THREE.Color();
function syncVisuals(time = 0) {
  for (const p of prizes) {
    p.mesh.position.copy(p.body.position);
    p.mesh.quaternion.copy(p.body.quaternion);
  }
  claw.hubMesh.position.copy(claw.hub.position);
  claw.hubMesh.quaternion.copy(claw.hub.quaternion);
  claw.fingerMeshes.forEach((m, i) => {
    m.position.copy(claw.fingers[i].position);
    m.quaternion.copy(claw.fingers[i].quaternion);
  });
  claw.gantry.position.z = claw.car.z;
  claw.carriage.position.x = claw.car.x;
  // ケーブル: キャリッジからハブまで
  const top = new THREE.Vector3(claw.car.x, RAIL_Y - 0.22, claw.car.z);
  const bottom = new THREE.Vector3(claw.hub.position.x, claw.hub.position.y + 0.25, claw.hub.position.z);
  const mid = top.clone().add(bottom).multiplyScalar(0.5);
  claw.cable.position.copy(mid);
  claw.cable.scale.y = Math.max(0.01, top.distanceTo(bottom));
  claw.cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.sub(bottom).normalize());

  const s = claw.state;
  const lamp = claw.hubMesh.userData.lamp.material.color;
  lamp.set(held.length ? 0xff4fa3 : s === 'idle' ? 0x46e0ff : 0xffd23f);

  const showGuide = settings.guide && ['idle', 'moveX', 'waitZ', 'moveZ', 'lever', 'settle', 'opening', 'descending'].includes(s);
  guideLine.visible = showGuide;
  if (showGuide) {
    const floorY = current.kind === 'skill' ? BRIDGE.pitY : 0;
    const topY = claw.hub.position.y - 0.05;
    guideLine.position.set(claw.hub.position.x, (topY + floorY) / 2, claw.hub.position.z);
    guideLine.scale.y = Math.max(0.01, topY - floorY);
  }

  // 電飾（流れるように点滅）
  const idle = s === 'idle';
  for (const b of bulbs) {
    const pts = b.mesh.userData.points;
    if (!pts) continue;
    for (let i = 0; i < pts.length; i++) {
      const k = (Math.floor(time * (idle ? 6 : 14)) + i + b.phase) % 4;
      if (k === 0) bulbColor.set(current.color);
      else if (k === 2) bulbColor.set(current.accent);
      else bulbColor.setRGB(0.25, 0.22, 0.3);
      b.mesh.setColorAt(i, bulbColor);
    }
    b.mesh.instanceColor.needsUpdate = true;
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += elapsed;
  let n = 0;
  while (acc >= DT && n < 8) { physicsStep(DT); acc -= DT; n++; }
  if (n === 8) acc = 0;
  syncVisuals(now / 1000);
  updateFrameUI();
  updateMotorSound();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// =====================================================================
// 起動
// =====================================================================
async function boot() {
  // Canvas に描く文字のためにフォントを待つ（最大1.5秒）
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('900 64px "M PLUS Rounded 1c"'),
        document.fonts.load('20px "DotGothic16"'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* フォントが読めなくても続行 */ }
  buildRoom();
  syncSettingsUI();
  if (window.innerWidth < 760) $('wallet').classList.add('collapsed');
  buildMachine(MACHINES[settings.machine] ? settings.machine : 'ufo3');
  setView('front');
  $('loading').remove();
  requestAnimationFrame(frame);
}
boot();

// デバッグ・自動テスト用
window.__crane = {
  claw, prizes, settings, money, banks, held, world,
  get play() { return play; },
  step: (n = 1) => { for (let i = 0; i < n; i++) physicsStep(DT); },
  press: (which, down) => setB(which, down),
  insertCoin,
  buildMachine,
};
