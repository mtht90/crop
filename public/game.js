import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Asset manifest ----------------------------------------------------
// Every path below is expected to be dropped in under public/assets/ (see
// the project notes for exactly which Kenney/Poly Pizza file goes where).
// Nothing here is required to exist: every loader below falls back to a
// procedural placeholder when a file 404s, so the game runs fine before
// the real assets show up and picks them up automatically once they do.
const ASSETS = {
  uiPanel: 'assets/kenney-ui/panel-wood.png',
  particleStar: 'assets/kenney-particles/star.png',
  crosshair: 'assets/kenney-crosshair/crosshair.png',
  models: {
    toyCar: 'assets/models/toy-car/car.glb',
    prototypeProp: 'assets/models/prototype/prop.glb',
    food: 'assets/models/food/can.glb',
    holidayStar: 'assets/models/holiday/star.glb',
    furnitureCrate: 'assets/models/furniture/crate.glb',
    booth: 'assets/models/booth/booth.glb',
  },
  sfx: {
    uiClick: 'assets/sfx/ui/click.mp3',
    uiConfirm: 'assets/sfx/ui2/confirm.mp3',
    hit: 'assets/sfx/hit/coin.mp3',
    fanfare: 'assets/sfx/jingle/fanfare.mp3',
  },
};

function playSfx(key, volume = 0.6) {
  const src = ASSETS.sfx[key];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = volume;
  audio.play().catch(() => {}); // missing file / autoplay policy - fail silently
}

// --- Input abstraction ---------------------------------------------------
// getAim(player) returns that player's aim as normalized device coordinates
// {x, y} in [-1, 1]. consumeFire(player) reports a fire request once, then
// resets it. getConnectedPlayers() lists which player numbers currently
// have live input. MouseInput simulates a single always-connected player 1
// for local development; RemoteInput is driven by phone controllers over
// WebSocket.
class InputSource {
  getConnectedPlayers() { throw new Error('getConnectedPlayers() not implemented'); }
  getAim(_player) { throw new Error('getAim() not implemented'); }
  consumeFire(_player) { throw new Error('consumeFire() not implemented'); }
}

class MouseInput extends InputSource {
  constructor(domElement) {
    super();
    this.aim = { x: 0, y: 0 };
    this.fireRequested = false;

    domElement.addEventListener('mousemove', (e) => {
      this.aim.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.aim.y = -((e.clientY / window.innerHeight) * 2 - 1);
    });

    domElement.addEventListener('mousedown', () => {
      this.fireRequested = true;
    });
  }

  getConnectedPlayers() {
    return [1];
  }

  getAim() {
    return { x: this.aim.x, y: this.aim.y };
  }

  consumeFire() {
    if (this.fireRequested) {
      this.fireRequested = false;
      return true;
    }
    return false;
  }
}

class RemoteInput extends InputSource {
  constructor() {
    super();
    this.players = new Map(); // player number -> { aim:{x,y}, fireRequested }
    this._connect();
  }

  _ensure(player) {
    if (!this.players.has(player)) {
      this.players.set(player, { aim: { x: 0, y: 0 }, fireRequested: false });
    }
    return this.players.get(player);
  }

  _connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);

    this.ws.addEventListener('open', () => {
      this.ws.send(JSON.stringify({ type: 'hello', role: 'game' }));
    });

    this.ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'players':
          for (const player of msg.connected) this._ensure(player);
          break;
        case 'player-connected':
          this._ensure(msg.player);
          break;
        case 'player-disconnected':
          this.players.delete(msg.player);
          break;
        case 'aim': {
          const p = this._ensure(msg.player);
          p.aim.x = msg.x;
          p.aim.y = msg.y;
          break;
        }
        case 'fire':
          this._ensure(msg.player).fireRequested = true;
          break;
      }
    });

    this.ws.addEventListener('close', () => {
      this.players.clear();
    });
  }

  getConnectedPlayers() {
    return [...this.players.keys()].sort();
  }

  getAim(player) {
    const p = this.players.get(player);
    return p ? { x: p.aim.x, y: p.aim.y } : { x: 0, y: 0 };
  }

  consumeFire(player) {
    const p = this.players.get(player);
    if (p && p.fireRequested) {
      p.fireRequested = false;
      return true;
    }
    return false;
  }
}

// ---- Tunable gameplay constants ------------------------------------------
const GRAVITY = 2.2; // was 9.8 - lowered so shots reach the back targets almost straight
const BULLET_SPEED = 55; // was 32 - raised for the same reason
const BULLET_RADIUS = 0.15;
const PLAYER_COLORS = { 1: 0xff3b3b, 2: 0x3ba7ff };
const TARGET_RESPAWN_DELAY = 1.4; // seconds a slot waits, empty, before its next target appears
const TARGET_POP_DURATION = 0.5; // seconds a hit target spends flying apart before it's gone
const HIT_PARTICLE_LIFETIME = 0.7;
const COMBO_HITS_PER_STEP = 3;
const COMBO_MULTIPLIER_STEP = 1.5;
const STAGE_DEFAULT_DURATION = 30;
const RANKING_KEY = 'festival-shooting-rankings';
const RANKING_SIZE = 10;

// ---- Curtain transition constants ----------------------------------------
const CURTAIN_SEGMENTS_X = 40;
const CURTAIN_SEGMENTS_Y = 25;
const CURTAIN_WIDTH = 7;
const CURTAIN_HEIGHT = 6;
const CURTAIN_TOP_Y = 4.6; // world y of the pinned top edge, in front of the camera
const CURTAIN_Z = 4; // camera sits at z=5 looking toward -z, so this is ~1 unit in front
const CURTAIN_PARTICLE_MASS = 0.08;
const CURTAIN_GRAVITY = -18;
const CURTAIN_WIND_STRENGTH = 1.6;
const CURTAIN_FALL_DURATION = 1.3;
const CURTAIN_HOLD_DURATION = 0.5;
const CURTAIN_RISE_DURATION = 0.9;
// Drop a real velvet/curtain image at this path later; until it exists the
// procedural fallback texture below is used instead.
const CURTAIN_TEXTURE_URL = 'assets/curtain-velvet.jpg';

const params = new URLSearchParams(location.search);
const debugMode = params.get('debug') === '1';

// --- Scene setup -------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 60);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 1.6, 5);
camera.lookAt(0, 1.6, -24);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 20, 10);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x3a7d3a })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// --- glTF model loading (booth / crates / target props) --------------------
// Every model is optional: preloadModel caches null on a load failure so
// instantiateModel() (used for per-target props) just returns null and
// callers fall back to their own placeholder, and one-off decorations
// (booth, crates, ...) simply skip adding themselves.
const gltfLoader = new GLTFLoader();
const modelCache = new Map();

function preloadModel(key, url, onReady, onError) {
  gltfLoader.load(
    url,
    (gltf) => {
      modelCache.set(key, gltf.scene);
      if (onReady) onReady(gltf.scene);
    },
    undefined,
    () => {
      modelCache.set(key, null);
      if (onError) onError();
    }
  );
}

function instantiateModel(key) {
  const template = modelCache.get(key);
  return template ? template.clone(true) : null;
}

function forEachMaterial(object3d, fn) {
  object3d.traverse((child) => {
    if (!child.isMesh) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      fn(material);
    }
  });
}

function addSceneDecoration() {
  // Carnival booth backdrop.
  preloadModel('booth', ASSETS.models.booth, (booth) => {
    booth.position.set(0, 0, -27);
    booth.scale.setScalar(6);
    scene.add(booth);
  });

  // Small hanging star accents borrowed from the Holiday Kit.
  preloadModel('holidayStar', ASSETS.models.holidayStar, (template) => {
    for (const x of [-6, 6]) {
      const star = template.clone(true);
      star.position.set(x, 5.4, -20);
      star.scale.setScalar(0.8);
      scene.add(star);
    }
  });

  // Prototype-kit prop dressing the shooting counter.
  preloadModel('prototypeProp', ASSETS.models.prototypeProp, (template) => {
    const prop = template.clone(true);
    prop.position.set(0, 0.9, 3.4);
    scene.add(prop);
  });

  // Furniture-kit crates in the foreground for depth; if the model never
  // loads, plain wooden boxes stand in so the scene still has that depth.
  const cratePositions = [
    [-11, 0.6, -6],
    [11, 0.6, -6],
    [-13, 0.6, -14],
    [13, 0.6, -14],
  ];
  preloadModel(
    'furnitureCrate',
    ASSETS.models.furnitureCrate,
    (template) => {
      for (const [x, y, z] of cratePositions) {
        const crate = template.clone(true);
        crate.position.set(x, y, z);
        crate.rotation.y = Math.random() * Math.PI;
        scene.add(crate);
      }
    },
    () => {
      const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      const material = new THREE.MeshStandardMaterial({ color: 0x7a4a26 });
      for (const [x, y, z] of cratePositions) {
        const crate = new THREE.Mesh(geometry, material);
        crate.position.set(x, y, z);
        crate.rotation.y = Math.random() * Math.PI;
        scene.add(crate);
      }
    }
  );
}
addSceneDecoration();

// Target-prop models (toy car / food can) preloaded once and cloned per spawn.
preloadModel('toyCar', ASSETS.models.toyCar);
preloadModel('food', ASSETS.models.food);

// Particle Pack star texture for hit sparkles; falls back to the plain
// octahedron shapes in spawnHitParticles() if it never loads.
let starTexture = null;
new THREE.TextureLoader().load(
  ASSETS.particleStar,
  (texture) => { starTexture = texture; },
  undefined,
  () => {}
);

// Crosshair Pack icon; the CSS circle+dot crosshair stays in place until
// this confirms the image is actually there.
let crosshairImageReady = false;
{
  const probe = new Image();
  probe.onload = () => {
    crosshairImageReady = true;
    document.documentElement.style.setProperty('--crosshair-image', `url('${ASSETS.crosshair}')`);
  };
  probe.onerror = () => {};
  probe.src = ASSETS.crosshair;
}

// --- Target textures ---------------------------------------------------------
function createRingTexture(colors) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  colors.forEach((color, i) => {
    const radius = (size / 2) * (1 - i / colors.length);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
  return new THREE.CanvasTexture(canvas);
}

function createDudTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b6b6b';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b1a12';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.28, size * 0.28);
  ctx.lineTo(size * 0.72, size * 0.72);
  ctx.moveTo(size * 0.72, size * 0.28);
  ctx.lineTo(size * 0.28, size * 0.72);
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,240,190,1)');
  gradient.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
const glowTexture = createGlowTexture();

// --- Target types --------------------------------------------------------
// A single place to define every kind of target: its score, hit-box size,
// movement (null = static, otherwise a left-right sine sweep), rarity
// weight for random respawns, and how it looks. Add a new entry here and
// list its id in a stage's `pool` to bring it into play.
const TARGET_TYPES = {
  normal: {
    id: 'normal',
    score: 100,
    radius: 1.1,
    glow: false,
    spawnWeight: 10,
    movement: null,
    particleColor: 0xff5a5a,
    createTexture: () => createRingTexture(['#ffffff', '#ff2d2d', '#ffffff', '#ff2d2d', '#ffffff']),
  },
  moving: {
    id: 'moving',
    score: 300,
    radius: 1.0,
    glow: false,
    spawnWeight: 6,
    movement: { amplitude: 2.6, speed: 1.6 },
    particleColor: 0x4aa8ff,
    createTexture: () => createRingTexture(['#eaf6ff', '#2f8fd1', '#eaf6ff', '#2f8fd1']),
  },
  small: {
    id: 'small',
    score: 500,
    radius: 0.55,
    glow: false,
    spawnWeight: 4,
    movement: null,
    particleColor: 0x4be07a,
    modelKey: 'toyCar', // a little toy car standing in for the "small" target
    modelScale: 1.1,
    createTexture: () => createRingTexture(['#eafbea', '#22a35a', '#eafbea']),
  },
  bonus: {
    id: 'bonus',
    score: 1000,
    radius: 0.9,
    glow: true,
    spawnWeight: 1,
    movement: { amplitude: 9, speed: 0.35 },
    particleColor: 0xffd76a,
    createTexture: () => createRingTexture(['#fff6d0', '#ffcf4d', '#fff1b0', '#d9a441']),
  },
  dud: {
    id: 'dud',
    score: -200,
    radius: 1.1,
    glow: false,
    spawnWeight: 5,
    movement: null,
    particleColor: 0x777777,
    modelKey: 'food', // a beat-up can standing in for the "junk" target
    modelScale: 1.3,
    createTexture: () => createDudTexture(),
  },
};

// --- Stages ----------------------------------------------------------------
// Each stage sets the backdrop and its five target slots (position + which
// type starts there). Once a slot's target is cleared it respawns as a
// random type drawn from `pool` (weighted by TARGET_TYPES[...].spawnWeight),
// so the initial layout is really just the opening hand for that stage.
const STAGES = [
  {
    name: 'ステージ1 ひろば',
    background: 0x87ceeb,
    groundColor: 0x3a7d3a,
    pool: ['normal', 'moving'],
    layout: [
      { x: -8, type: 'normal' },
      { x: -4, type: 'normal' },
      { x: 0, type: 'moving' },
      { x: 4, type: 'normal' },
      { x: 8, type: 'normal' },
    ],
  },
  {
    name: 'ステージ2 ゆうぐれ',
    background: 0xff9a5a,
    groundColor: 0x8a5a2e,
    pool: ['normal', 'moving', 'small', 'dud'],
    layout: [
      { x: -9, type: 'moving' },
      { x: -4.5, type: 'small' },
      { x: 0, type: 'dud' },
      { x: 4.5, type: 'moving' },
      { x: 9, type: 'small' },
    ],
  },
  {
    name: 'ステージ3 よぞら',
    background: 0x231146,
    groundColor: 0x2b2033,
    pool: ['moving', 'small', 'dud', 'bonus'],
    layout: [
      { x: -9, type: 'small' },
      { x: -4.5, type: 'dud' },
      { x: 0, type: 'bonus' },
      { x: 4.5, type: 'dud' },
      { x: 9, type: 'small' },
    ],
  },
];

function pickWeightedType(pool) {
  const entries = pool.map((key) => TARGET_TYPES[key]);
  const total = entries.reduce((sum, t) => sum + t.spawnWeight, 0);
  let r = Math.random() * total;
  for (const type of entries) {
    if (r < type.spawnWeight) return type.id;
    r -= type.spawnWeight;
  }
  return entries[entries.length - 1].id;
}

// --- Curtain transition (mass-spring cloth via cannon-es) -------------------
function createFallbackCurtainTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, '#7c1a1a');
  base.addColorStop(0.5, '#b3241f');
  base.addColorStop(1, '#7c1a1a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const foldCount = 14;
  for (let i = 0; i < foldCount; i++) {
    const x = (i / foldCount) * size;
    const w = size / foldCount;
    const shade = ctx.createLinearGradient(x, 0, x + w, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.28)');
    shade.addColorStop(0.5, 'rgba(255,220,180,0.14)');
    shade.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = shade;
    ctx.fillRect(x, 0, w, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(CURTAIN_SEGMENTS_X / 8, CURTAIN_SEGMENTS_Y / 8);
  return texture;
}

function createCurtainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    map: createFallbackCurtainTexture(),
    side: THREE.DoubleSide,
    roughness: 0.85,
  });

  // If a real texture shows up at CURTAIN_TEXTURE_URL, swap it in; until
  // then (or if it 404s) the procedural fallback above stays in place.
  new THREE.TextureLoader().load(
    CURTAIN_TEXTURE_URL,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(CURTAIN_SEGMENTS_X / 8, CURTAIN_SEGMENTS_Y / 8);
      material.map = texture;
      material.needsUpdate = true;
    },
    undefined,
    () => {}
  );

  return material;
}

class CurtainController {
  constructor(sceneRef) {
    this.phase = 'idle'; // idle | falling | holding | rising
    this.timer = 0;
    this.busy = false;
    this.callback = null;

    this.cols = CURTAIN_SEGMENTS_X + 1;
    this.rows = CURTAIN_SEGMENTS_Y + 1;
    this.restX = CURTAIN_WIDTH / CURTAIN_SEGMENTS_X;
    this.restY = CURTAIN_HEIGHT / CURTAIN_SEGMENTS_Y;

    this.world = new CANNON.World();
    this.world.gravity.set(0, CURTAIN_GRAVITY, 0);
    this.world.solver.iterations = 12;

    this.particles = [];
    for (let j = 0; j < this.rows; j++) {
      const row = [];
      for (let i = 0; i < this.cols; i++) {
        const [x, y, z] = this._bunchedPosition(i, j);
        const body = new CANNON.Body({
          mass: j === 0 ? 0 : CURTAIN_PARTICLE_MASS,
          shape: new CANNON.Particle(),
          position: new CANNON.Vec3(x, y, z),
          linearDamping: 0.6,
        });
        this.world.addBody(body);
        row.push(body);
      }
      this.particles.push(row);
    }

    const connect = (i1, j1, i2, j2) => {
      const b1 = this.particles[j1][i1];
      const b2 = this.particles[j2][i2];
      const dist = b1.position.distanceTo(b2.position) || 0.001;
      this.world.addConstraint(new CANNON.DistanceConstraint(b1, b2, dist));
    };

    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        if (i < this.cols - 1) connect(i, j, i + 1, j);
        if (j < this.rows - 1) connect(i, j, i, j + 1);
      }
    }

    this.geometry = new THREE.PlaneGeometry(
      CURTAIN_WIDTH,
      CURTAIN_HEIGHT,
      CURTAIN_SEGMENTS_X,
      CURTAIN_SEGMENTS_Y
    );
    this.material = createCurtainMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    sceneRef.add(this.mesh);

    this._syncMesh();
  }

  // Vertically compressed pose the cloth sits in while idle/parked, and the
  // pose it starts from right before being released to fall.
  _bunchedPosition(i, j) {
    const x = -CURTAIN_WIDTH / 2 + i * this.restX;
    const y = CURTAIN_TOP_Y - j * 0.015;
    const z = CURTAIN_Z;
    return [x, y, z];
  }

  _resetToBunched() {
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const body = this.particles[j][i];
        const [x, y, z] = this._bunchedPosition(i, j);
        body.position.set(x, y, z);
        body.velocity.set(0, 0, 0);
        body.force.set(0, 0, 0);
      }
    }
  }

  // Matches THREE.PlaneGeometry's own vertex order: rows top (j=0) to
  // bottom, each row left to right.
  _syncMesh() {
    const pos = this.geometry.attributes.position;
    let idx = 0;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const body = this.particles[j][i];
        pos.setXYZ(idx, body.position.x, body.position.y, body.position.z);
        idx++;
      }
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  // Runs the fall -> hold -> rise sequence. `onCovered` fires once the
  // curtain is fully closed (screen covered), so the caller can change
  // what's behind it before the curtain rises again to reveal it.
  // `onRevealed` (optional) fires once it has fully risen again - e.g. for
  // a round-clear fanfare timed to when the next stage actually appears.
  show(onCovered, onRevealed) {
    if (this.busy) return;
    this.busy = true;
    this.callback = onCovered;
    this.onRevealed = onRevealed;
    this._resetToBunched();
    this.mesh.visible = true;
    this.phase = 'falling';
    this.timer = 0;
  }

  update(dt) {
    if (this.phase === 'idle') return;
    this.timer += dt;

    if (this.phase === 'falling' || this.phase === 'holding') {
      const t = performance.now() / 1000;
      for (let j = 1; j < this.rows; j++) {
        for (let i = 0; i < this.cols; i++) {
          const body = this.particles[j][i];
          const wind = CURTAIN_WIND_STRENGTH * Math.sin(t * 1.3 + i * 0.35 + j * 0.12);
          body.force.x += wind;
          body.force.z += wind * 0.6;
        }
      }
      this.world.step(1 / 60, dt, 5);
      this._syncMesh();

      if (this.phase === 'falling' && this.timer >= CURTAIN_FALL_DURATION) {
        this.phase = 'holding';
        this.timer = 0;
        if (this.callback) {
          const cb = this.callback;
          this.callback = null;
          cb();
        }
      } else if (this.phase === 'holding' && this.timer >= CURTAIN_HOLD_DURATION) {
        this.phase = 'rising';
        this.timer = 0;
        this._riseFrom = this.particles.map((row) => row.map((b) => b.position.clone()));
      }
      return;
    }

    if (this.phase === 'rising') {
      const t = Math.min(this.timer / CURTAIN_RISE_DURATION, 1);
      const ease = t * t * (3 - 2 * t); // smoothstep: fabric reeling up toward the top
      for (let j = 0; j < this.rows; j++) {
        for (let i = 0; i < this.cols; i++) {
          const body = this.particles[j][i];
          const from = this._riseFrom[j][i];
          const [, targetY] = this._bunchedPosition(i, j);
          body.position.set(from.x, from.y + (targetY - from.y) * ease, from.z);
          body.velocity.set(0, 0, 0);
        }
      }
      this._syncMesh();

      if (t >= 1) {
        this.phase = 'idle';
        this.mesh.visible = false;
        this.busy = false;
        if (this.onRevealed) {
          const revealed = this.onRevealed;
          this.onRevealed = null;
          revealed();
        }
      }
    }
  }
}

const curtain = new CurtainController(scene);

// --- Input, HUD elements ----------------------------------------------------
const input = debugMode ? new MouseInput(renderer.domElement) : new RemoteInput();
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

const bullets = [];
let slots = [];
const scores = { 1: 0, 2: 0 };
const combo = {
  1: { hits: 0, multiplier: 1 },
  2: { hits: 0, multiplier: 1 },
};
let currentStageIndex = 0;
let stageTimeLeft = STAGE_DEFAULT_DURATION;
let state = 'intro'; // 'intro' | 'playing' | 'result'

const p1ScoreEl = document.getElementById('p1ScoreValue');
const p2ScoreEl = document.getElementById('p2ScoreValue');
const p1ComboEl = document.getElementById('p1Combo');
const p2ComboEl = document.getElementById('p2Combo');
const timeEl = document.getElementById('timeValue');
const stageLabelEl = document.getElementById('stageLabel');
const resultEl = document.getElementById('result');
const winnerLineEl = document.getElementById('winnerLine');
const rankingListEl = document.getElementById('rankingList');
const waitingEl = document.getElementById('waiting');
const qrHolder = document.getElementById('qrHolder');
const p1Slot = document.getElementById('p1Slot');
const p2Slot = document.getElementById('p2Slot');

const crosshairs = new Map(); // player -> DOM element

function createCrosshair(player) {
  const el = document.createElement('div');
  el.className = 'crosshair';
  el.style.setProperty('--color', player === 1 ? 'var(--p1-color)' : 'var(--p2-color)');
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = `P${player}`;
  el.appendChild(tag);
  document.body.appendChild(el);
  return el;
}

function updateCrosshairs(connectedPlayers) {
  for (const player of connectedPlayers) {
    if (!crosshairs.has(player)) {
      crosshairs.set(player, createCrosshair(player));
    }
    const aim = input.getAim(player);
    const el = crosshairs.get(player);
    el.style.left = `${((aim.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - aim.y) / 2) * window.innerHeight}px`;
    el.classList.toggle('has-image', crosshairImageReady);
  }
  for (const [player, el] of crosshairs) {
    if (!connectedPlayers.includes(player)) {
      el.remove();
      crosshairs.delete(player);
    }
  }
}

let qrRendered = false;
function ensureQrRendered() {
  if (qrRendered || debugMode || !window.QRCode) return;
  const url = `${location.protocol}//${location.host}/controller.html`;
  new window.QRCode(qrHolder, {
    text: url,
    width: 200,
    height: 200,
    colorDark: '#2b1a12',
    colorLight: '#fff6e3',
  });
  qrRendered = true;
}

function updateWaitingScreen(connectedPlayers) {
  if (debugMode) {
    waitingEl.style.display = 'none';
    return;
  }
  waitingEl.style.display = connectedPlayers.length === 0 ? 'flex' : 'none';
  p1Slot.classList.toggle('online', connectedPlayers.includes(1));
  p2Slot.classList.toggle('online', connectedPlayers.includes(2));
}

// --- Target slots (one per stage layout entry) ------------------------------
function buildSlotsForStage(stage) {
  return stage.layout.map((entry, index) => ({
    index,
    basePosition: new THREE.Vector3(entry.x, 1.6, -24),
    phase: index * 1.7,
    typeKey: null,
    state: 'empty', // 'active' | 'popping' | 'waiting'
    mesh: null,
    glowMesh: null,
    popAge: 0,
    popVelocity: null,
    popSpin: null,
    waitTimer: 0,
    initialType: entry.type,
  }));
}

function spawnSlotTarget(slot, typeKey) {
  const type = TARGET_TYPES[typeKey];
  slot.typeKey = typeKey;
  slot.state = 'active';

  const modelTemplate = type.modelKey ? instantiateModel(type.modelKey) : null;
  let mesh;
  if (modelTemplate) {
    mesh = modelTemplate;
    forEachMaterial(mesh, (m) => { m.transparent = true; });
    slot.isModel = true;
    slot.baseScale = type.modelScale ?? 1;
  } else {
    mesh = new THREE.Mesh(
      new THREE.CircleGeometry(type.radius, 32),
      new THREE.MeshBasicMaterial({ map: type.createTexture(), side: THREE.DoubleSide, transparent: true })
    );
    slot.isModel = false;
    slot.baseScale = 1;
  }
  mesh.scale.setScalar(slot.baseScale);
  mesh.position.copy(slot.basePosition);
  scene.add(mesh);
  slot.mesh = mesh;

  if (type.glow) {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(type.radius * 4, type.radius * 4, 1);
    glow.position.copy(slot.basePosition);
    scene.add(glow);
    slot.glowMesh = glow;
  } else {
    slot.glowMesh = null;
  }
}

function popSlot(slot) {
  slot.state = 'popping';
  slot.popAge = 0;
  slot.popVelocity = new THREE.Vector3((Math.random() - 0.5) * 3, 4 + Math.random() * 2, (Math.random() - 0.5) * 2);
  slot.popSpin = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  if (slot.glowMesh) {
    scene.remove(slot.glowMesh);
    slot.glowMesh = null;
  }
}

function updateSlots(dt, elapsed) {
  const stage = STAGES[currentStageIndex];
  for (const slot of slots) {
    if (slot.state === 'active') {
      const type = TARGET_TYPES[slot.typeKey];
      if (type.movement) {
        const offset = Math.sin(elapsed * type.movement.speed + slot.phase) * type.movement.amplitude;
        slot.mesh.position.x = slot.basePosition.x + offset;
      }
      if (type.glow) {
        slot.mesh.rotation.z += dt * 0.6;
        if (slot.glowMesh) {
          const pulse = 1 + 0.15 * Math.sin(elapsed * 4 + slot.phase);
          slot.glowMesh.scale.set(type.radius * 4 * pulse, type.radius * 4 * pulse, 1);
          slot.glowMesh.position.copy(slot.mesh.position);
        }
      }
      if (slot.isModel) {
        slot.mesh.rotation.y += dt * 0.6; // slow spin so 3D props read as "shootable"
      }
    } else if (slot.state === 'popping') {
      slot.popAge += dt;
      slot.popVelocity.y -= 9.8 * dt;
      slot.mesh.position.addScaledVector(slot.popVelocity, dt);
      slot.mesh.rotation.x += slot.popSpin.x * dt;
      slot.mesh.rotation.y += slot.popSpin.y * dt;
      const t = Math.min(slot.popAge / TARGET_POP_DURATION, 1);
      const scale = slot.baseScale * Math.max(0.001, 1 - t);
      slot.mesh.scale.setScalar(scale);
      if (slot.isModel) {
        forEachMaterial(slot.mesh, (m) => { m.opacity = 1 - t; });
      } else {
        slot.mesh.material.opacity = 1 - t;
      }
      if (t >= 1) {
        scene.remove(slot.mesh);
        slot.mesh = null;
        slot.state = 'waiting';
        slot.waitTimer = TARGET_RESPAWN_DELAY;
      }
    } else if (slot.state === 'waiting') {
      slot.waitTimer -= dt;
      if (slot.waitTimer <= 0) {
        spawnSlotTarget(slot, pickWeightedType(stage.pool));
      }
    }
  }
}

function clearSlots() {
  for (const slot of slots) {
    if (slot.mesh) scene.remove(slot.mesh);
    if (slot.glowMesh) scene.remove(slot.glowMesh);
  }
  slots = [];
}

// --- Hit feedback: particles + floating score popup -------------------------
const hitParticles = [];
const sparkleGeometry = new THREE.OctahedronGeometry(0.14);
const dustGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);

function spawnHitParticles(position, type) {
  const isDud = type.score < 0;
  // Positive hits use the Particle Pack star sprite once it's loaded (falls
  // back to the plain spinning octahedron shards otherwise); a dud always
  // puffs plain gray dust instead of a "celebratory" star.
  const useStarSprite = !isDud && starTexture;
  const count = isDud ? 8 : 14;
  for (let i = 0; i < count; i++) {
    let mesh;
    if (useStarSprite) {
      mesh = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: starTexture, color: type.particleColor, transparent: true })
      );
      mesh.scale.setScalar(0.5);
    } else {
      mesh = new THREE.Mesh(
        isDud ? dustGeometry : sparkleGeometry,
        new THREE.MeshBasicMaterial({ color: type.particleColor, transparent: true })
      );
    }
    mesh.position.copy(position);
    const angle = Math.random() * Math.PI * 2;
    const speed = isDud ? 1.2 + Math.random() : 2.5 + Math.random() * 3;
    const velocity = new THREE.Vector3(
      Math.cos(angle) * speed,
      (isDud ? 1 : 3) + Math.random() * 2,
      Math.sin(angle) * speed * 0.5
    );
    scene.add(mesh);
    hitParticles.push({ mesh, velocity, age: 0, isSprite: useStarSprite });
  }
}

function updateHitParticles(dt) {
  for (let i = hitParticles.length - 1; i >= 0; i--) {
    const p = hitParticles[i];
    p.velocity.y -= 9.8 * dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    if (p.isSprite) {
      p.mesh.material.rotation += dt * 5;
    } else {
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 5;
    }
    p.age += dt;
    p.mesh.material.opacity = Math.max(0, 1 - p.age / HIT_PARTICLE_LIFETIME);
    if (p.age >= HIT_PARTICLE_LIFETIME) {
      scene.remove(p.mesh);
      hitParticles.splice(i, 1);
    }
  }
}

function spawnScorePopup(worldPosition, amount) {
  const ndc = worldPosition.clone().project(camera);
  const x = ((ndc.x + 1) / 2) * window.innerWidth;
  const y = ((1 - ndc.y) / 2) * window.innerHeight;
  const el = document.createElement('div');
  el.className = `score-popup ${amount >= 0 ? 'positive' : 'negative'}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.textContent = `${amount >= 0 ? '+' : ''}${amount}`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// --- Ranking (localStorage) --------------------------------------------------
function loadRankings() {
  try {
    const raw = localStorage.getItem(RANKING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRanking(p1, p2) {
  const rankings = loadRankings();
  rankings.push({ p1, p2, total: p1 + p2 });
  rankings.sort((a, b) => b.total - a.total);
  rankings.length = Math.min(rankings.length, RANKING_SIZE);
  try {
    localStorage.setItem(RANKING_KEY, JSON.stringify(rankings));
  } catch {
    // localStorage unavailable (private mode / quota) - ranking just won't persist
  }
  return rankings;
}

function renderRanking(rankings) {
  rankingListEl.innerHTML = '';
  for (const entry of rankings) {
    const li = document.createElement('li');
    li.textContent = `P1 ${entry.p1} / P2 ${entry.p2}（計 ${entry.total}）`;
    rankingListEl.appendChild(li);
  }
}

// --- Game flow ---------------------------------------------------------------
function formatMultiplier(m) {
  return m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function updateHud() {
  p1ScoreEl.textContent = String(scores[1]);
  p2ScoreEl.textContent = String(scores[2]);
  p1ComboEl.textContent = combo[1].multiplier > 1 ? `COMBO ×${formatMultiplier(combo[1].multiplier)}` : '';
  p2ComboEl.textContent = combo[2].multiplier > 1 ? `COMBO ×${formatMultiplier(combo[2].multiplier)}` : '';
  stageLabelEl.textContent = `STAGE ${currentStageIndex + 1}/${STAGES.length}`;
  const t = Math.max(Math.ceil(stageTimeLeft), 0);
  timeEl.textContent = String(t);
  timeEl.classList.toggle('low', t <= 10);
}

function loadStage(index) {
  currentStageIndex = index;
  const stage = STAGES[index];
  scene.background.setHex(stage.background);
  scene.fog.color.setHex(stage.background);
  ground.material.color.setHex(stage.groundColor ?? 0x3a7d3a);

  clearBullets();
  clearSlots();
  slots = buildSlotsForStage(stage);
  for (const slot of slots) spawnSlotTarget(slot, slot.initialType);

  stageTimeLeft = stage.duration ?? STAGE_DEFAULT_DURATION;
  updateHud();
}

function advanceStage() {
  const next = currentStageIndex + 1;
  if (next < STAGES.length) {
    loadStage(next);
  } else {
    finishGame();
  }
}

function clearBullets() {
  for (const b of bullets) scene.remove(b.mesh);
  bullets.length = 0;
}

function startGame() {
  scores[1] = 0;
  scores[2] = 0;
  combo[1] = { hits: 0, multiplier: 1 };
  combo[2] = { hits: 0, multiplier: 1 };
  state = 'playing';
  resultEl.style.display = 'none';
  loadStage(0);
}

function finishGame() {
  state = 'result';
  clearBullets();
  clearSlots();

  winnerLineEl.textContent =
    scores[1] === scores[2] ? 'DRAW' : scores[1] > scores[2] ? 'PLAYER 1 WIN!' : 'PLAYER 2 WIN!';
  document.querySelector('#finalP1 .value').textContent = String(scores[1]);
  document.querySelector('#finalP2 .value').textContent = String(scores[2]);
  renderRanking(saveRanking(scores[1], scores[2]));

  resultEl.style.display = 'flex';
}

function handleHit(slot, player) {
  const type = TARGET_TYPES[slot.typeKey];
  let awarded;
  if (type.score < 0) {
    awarded = type.score; // flat penalty - a bad hit shouldn't be reduced by a good combo
    combo[player] = { hits: 0, multiplier: 1 };
  } else {
    const c = combo[player];
    c.hits += 1;
    if (c.hits % COMBO_HITS_PER_STEP === 0) c.multiplier *= COMBO_MULTIPLIER_STEP;
    awarded = Math.round(type.score * c.multiplier);
  }
  scores[player] += awarded;
  updateHud();
  spawnScorePopup(slot.mesh.position, awarded);
  spawnHitParticles(slot.mesh.position, type);
  if (type.score >= 0) playSfx('hit'); // a "cha-ching" would feel wrong on a penalty hit
  popSlot(slot);
}

function fireBullet(player, aim) {
  raycaster.setFromCamera(aim, camera);
  const velocity = raycaster.ray.direction.clone().multiplyScalar(BULLET_SPEED);
  const color = PLAYER_COLORS[player] ?? 0xffdd33;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(BULLET_RADIUS, 12, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
  );
  mesh.position.copy(camera.position);
  scene.add(mesh);
  bullets.push({ mesh, velocity, age: 0, player });
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.velocity.y -= GRAVITY * dt;
    b.mesh.position.addScaledVector(b.velocity, dt);
    b.age += dt;

    let consumed = false;
    for (const slot of slots) {
      if (slot.state !== 'active') continue;
      const type = TARGET_TYPES[slot.typeKey];
      if (b.mesh.position.distanceTo(slot.mesh.position) < type.radius) {
        handleHit(slot, b.player);
        scene.remove(b.mesh);
        bullets.splice(i, 1);
        consumed = true;
        break;
      }
    }

    if (!consumed && (b.age > 5 || b.mesh.position.y < -10)) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      combo[b.player] = { hits: 0, multiplier: 1 }; // a clean miss breaks the combo too
    }
  }
}

// --- Main loop ---------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  curtain.update(dt);

  const connectedPlayers = input.getConnectedPlayers();
  updateWaitingScreen(connectedPlayers);
  updateCrosshairs(connectedPlayers);
  updateHitParticles(dt);

  const gameplayActive = state === 'playing' && !curtain.busy && connectedPlayers.length > 0;

  if (gameplayActive) {
    stageTimeLeft -= dt;
    if (stageTimeLeft <= 0) {
      stageTimeLeft = 0;
      updateHud();
      curtain.show(
        () => advanceStage(),
        () => playSfx('fanfare', 0.7) // plays once the next stage (or the final result) is actually revealed
      );
    } else {
      updateHud();
    }

    for (const player of connectedPlayers) {
      if (input.consumeFire(player)) {
        fireBullet(player, input.getAim(player));
      }
    }
    updateBullets(dt);
    updateSlots(dt, clock.getElapsedTime());
  } else if (state === 'result' && !curtain.busy) {
    for (const player of connectedPlayers) {
      if (input.consumeFire(player)) {
        curtain.show(() => startGame());
        break;
      }
    }
  }

  renderer.render(scene, camera);
}

ensureQrRendered();
curtain.show(() => startGame());
animate();
