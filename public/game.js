import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- Asset manifest ----------------------------------------------------
// Every path below is expected to be dropped in under public/assets/ (see
// the project notes for exactly which Kenney file goes where). Nothing
// here is required to exist: every loader below falls back to a
// procedural placeholder when a file 404s, so the game runs fine before
// the real assets show up and picks them up automatically once they do.
// Everything in the scene - targets, crates, background dressing - is a
// flat image on a camera-facing plane (a "picture-book" 2.5D stage, not a
// 3D diorama), so only 2D art (PNG) is ever loaded here, never a glTF
// model. Target plate textures follow their own convention instead of
// living in this object: assets/textures/<themeKey>/target-<type>.png
// (see targetTexturePath()/preloadTargetTexture() near TARGET_TYPES
// below).
const ASSETS = {
  particleStar: 'assets/kenney-particles/PNG (Transparent)/star_01.png',
  crosshair: 'assets/kenney-crosshair/PNG/Glow/crosshair-000.png',
  decorations: {
    // Foreground crate - Kenney Furniture Kit ships a real flat side-view
    // sprite for this, so no procedural fallback is needed.
    crate: 'assets/kenney-furniture/Side/cardboardBoxClosed.png',
    // Stage 1 (farm) - Kenney Foliage Pack (flat flower/grass cutouts).
    // No tree/fence art was downloaded, so those two stay procedural
    // (see drawTreeBillboard()/drawFenceBillboard() near loadThemeDecorations()).
    foliageFlower: 'assets/kenney-foliage/PNG/Default size/foliagePack_001.png',
    foliageGrass: 'assets/kenney-foliage/PNG/Default size/foliagePack_020.png',
    // Stage 2 (dinosaur) - the desert pack's rock tile doubles as volcanic
    // rubble; no flat volcano art exists so that stays procedural.
    rock: 'assets/kenney-sketch-desert/Tiles/rocks_S.png',
    // Stage 3 (western) - Kenney Sketch Desert ships isometric tile art
    // rather than true side-view sprites, so these read a little
    // top-down/angled as flat cutouts, but they're the real downloaded
    // art and stand in fine at a distance.
    desertBuilding: 'assets/kenney-sketch-desert/Tiles/building_dark_center_windows_S.png',
    desertTent: 'assets/kenney-sketch-desert/Tiles/dome_S.png',
    desertPalm: 'assets/kenney-sketch-desert/Tiles/tree_S.png',
  },
  sfx: {
    uiClick: 'assets/sfx/ui/Audio/click_001.ogg',
    uiConfirm: 'assets/sfx/ui/Audio/confirmation_001.ogg',
    // Casino Audio has no literal "coin" sound (it's a cards/chips/dice
    // pack) - a chip-lay clink is the closest short, punchy stand-in.
    hit: 'assets/sfx/hit/Audio/chip-lay-1.ogg',
    fanfare: 'assets/sfx/jingle/Audio/8-Bit jingles/jingles_NES00.ogg',
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

// ---- Feature flags ---------------------------------------------------------
// The trigger target / chain trigger / conveyor phase / mid-run bonus stage
// were an earlier, busier direction. The code for all of them is still
// here (and still correct) but is switched off by default in favor of a
// simpler, calmer game; flip any of these back to true to bring one back.
const FEATURE_TRIGGER_TARGET = false;
const FEATURE_CHAIN_TRIGGER = false;
const FEATURE_CONVEYOR = false;
const FEATURE_BONUS_STAGE = false;

// ---- Tunable gameplay constants ------------------------------------------
const GRAVITY = 2.2; // was 9.8 - lowered so shots reach the back targets almost straight
const BULLET_SPEED = 55; // was 32 - raised for the same reason
const BULLET_RADIUS = 0.15;
// Ammo is unlimited by design (like the real attraction's laser guns): there
// is no ammo counter anywhere in the code, fireBullet() never checks or
// decrements one. Deliberately not called out in the UI either - it's just
// how the game works, not a feature to announce.
const PLAYER_COLORS = { 1: 0xff3b3b, 2: 0x3ba7ff };
const TARGET_RESPAWN_DELAY = 1.4; // seconds a slot waits, empty, before its next target appears
const TRIGGER_RESPAWN_DELAY = 10; // the pinned trigger slot waits much longer so it can't be spammed
const TARGET_POP_DURATION = 0.5; // seconds a hit target spends flying apart before it's gone
const HIT_PARTICLE_LIFETIME = 0.7;
const COMBO_HITS_PER_STEP = 3;
const COMBO_MULTIPLIER_STEP = 1.5;
const STAGE_DEFAULT_DURATION = 30;
const RANKING_KEY = 'festival-shooting-rankings';
const RANKING_SIZE = 10;

// -- Trigger target -> bonus wave -------------------------------------------
const BONUS_WAVE_DURATION = 6; // seconds the trigger-activated wave keeps spawning targets
const BONUS_WAVE_SPAWN_INTERVAL = 0.4;
const BONUS_WAVE_MAX_CONCURRENT = 10;

// -- Chain trigger: two adjacent slots hit in quick succession --------------
const CHAIN_WINDOW = 1.2; // seconds allowed between the two hits

// -- Conveyor phase: a row of targets flowing toward the camera -------------
const CONVEYOR_PHASE_DURATION = 14;
const CONVEYOR_SPAWN_INTERVAL = 1.1;
const CONVEYOR_SPEED = 4.5;
const CONVEYOR_MISS_Z = 6.5; // past this it's swept behind the camera - counts as a miss
const CONVEYOR_HIT_GAP_RESET = 2.5; // no hit for this long -> tier resets
const CONVEYOR_HIT_RADIUS = 0.9;
const CONVEYOR_LANES = [-3, 0, 3];
const CONVEYOR_TIERS = [
  { score: 500, colors: ['#eafbea', '#22a35a'] },
  { score: 1000, colors: ['#eaf6ff', '#2f8fd1'] },
  { score: 2000, colors: ['#fff6d0', '#d9a441'] },
  { score: 5000, colors: ['#fff0f5', '#e8432f'] },
];

// -- Bonus stage (between stages) & the final "last bonus" rush -------------
const BONUS_STAGE_THRESHOLD = 3000; // points gained in a stage to unlock the bonus stage after it
const BONUS_STAGE_DURATION = 8;
const FINISH_PHASE_DURATION = 12;

// -- Animation "juice": pop-in/squash/shake/flash, all built on ease-out-back
// rather than linear so everything reads as bouncy rather than mechanical.
const SPAWN_POP_DURATION = 0.32; // target pop-in: scale 0 -> baseScale, overshooting
const SQUASH_DURATION = 0.09; // brief squash right at the hit moment, before flying apart
const SQUASH_SCALE_XZ = 1.35;
const SQUASH_SCALE_Y = 0.55;
const CAMERA_SHAKE_HIT = 0.35; // trauma added per normal hit
const CAMERA_SHAKE_TRIGGER = 0.6; // bigger shake for the trigger/bonus-wave activation
const CAMERA_SHAKE_DECAY = 4.5; // trauma lost per second
const CAMERA_SHAKE_MAX_OFFSET = { x: 0.09, y: 0.09, z: 0.04 };
const HIT_FLASH_OPACITY = 0.22;
const HIT_FLASH_DURATION_MS = 130;
const TRIGGER_FLASH_OPACITY = 0.85;
const TRIGGER_FLASH_DURATION_MS = 260;
const BONUS_WAVE_BURST_COUNT = 7; // extra staggered "pop-pop-pop" targets right as the wave starts
const BONUS_WAVE_BURST_STAGGER = [0.05, 0.1]; // seconds between each, randomized in this range
const CURTAIN_BOUNCE_IMPULSE = 1.3; // upward velocity kick when the curtain finishes falling
const COMBO_POP_MILESTONE = COMBO_HITS_PER_STEP; // pop the corner badge on every multiplier step

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutElastic(t) {
  const c4 = (2 * Math.PI) / 3;
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

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
// A "picture-book" 2.5D stage rather than a 3D diorama: everything the
// player sees (sky, targets, crates, background dressing) is a flat image,
// only ever varying in which camera-facing plane it sits on and how far
// back that plane is. The sky is a vertical-gradient canvas texture
// (createSkyGradientTexture(), re-drawn per stage in loadStage()) standing
// in for a painted backdrop image, since no such image was downloaded.
function hexToCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function mixHexColor(hex, targetHex, amount) {
  const c = new THREE.Color(hex).lerp(new THREE.Color(targetHex), amount);
  return c.getHex();
}

function createSkyGradientTexture(topHex, bottomHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, hexToCss(topHex));
  gradient.addColorStop(1, hexToCss(bottomHex));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

const scene = new THREE.Scene();
scene.background = createSkyGradientTexture(0x8fd3f4, mixHexColor(0x8fd3f4, 0xffffff, 0.55));
scene.fog = new THREE.Fog(0x87ceeb, 20, 60);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
const CAMERA_BASE_POS = new THREE.Vector3(0, 1.6, 5);
camera.position.copy(CAMERA_BASE_POS);
camera.lookAt(0, 1.6, -24);

// Hit shake: nudges camera.position off CAMERA_BASE_POS each frame while
// `shakeTrauma` decays back to 0; the camera's rotation (fixed by the
// lookAt above) is never touched, so this reads as a light jolt rather
// than a spin.
let shakeTrauma = 0;
function addCameraShake(amount) {
  shakeTrauma = Math.min(1, shakeTrauma + amount);
}
function updateCameraShake(dt) {
  if (shakeTrauma <= 0) {
    if (!camera.position.equals(CAMERA_BASE_POS)) camera.position.copy(CAMERA_BASE_POS);
    return;
  }
  const s = shakeTrauma * shakeTrauma; // eased falloff
  camera.position.set(
    CAMERA_BASE_POS.x + (Math.random() - 0.5) * 2 * CAMERA_SHAKE_MAX_OFFSET.x * s,
    CAMERA_BASE_POS.y + (Math.random() - 0.5) * 2 * CAMERA_SHAKE_MAX_OFFSET.y * s,
    CAMERA_BASE_POS.z + (Math.random() - 0.5) * 2 * CAMERA_SHAKE_MAX_OFFSET.z * s
  );
  shakeTrauma = Math.max(0, shakeTrauma - CAMERA_SHAKE_DECAY * dt);
}

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
  new THREE.MeshBasicMaterial({ color: 0x3a7d3a }) // unlit flat color, matching the flat-cutout stage
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// --- Flat billboard helpers --------------------------------------------
// Every prop in the scene - targets, crates, background dressing - is a
// single PlaneGeometry with an image texture, sized to the image's own
// aspect ratio and turned to face the camera once when it's placed. That's
// the entire "3D" trick here: a flat cutout standing on a stage, not a
// modeled object, matching the picture-book look of the reference template.
const textureLoader = new THREE.TextureLoader();

function loadBillboardTexture(url, onReady, onError) {
  textureLoader.load(url, onReady, undefined, () => { if (onError) onError(); });
}

function createBillboardMesh(texture, height) {
  const img = texture.image;
  const aspect = img && img.width ? img.width / img.height : 1;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(height * aspect, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
  );
}

// lookAt needs the mesh's final position already set (it faces the plane
// from wherever it currently sits toward the camera), so this is always
// called after position.set(...)/position.copy(...), never before.
function faceBillboardAtCamera(mesh) {
  mesh.lookAt(camera.position);
}

function forEachMaterial(object3d, fn) {
  object3d.traverse((child) => {
    if (!child.isMesh) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      fn(material);
    }
  });
}

function setObjectOpacity(obj, opacity) {
  forEachMaterial(obj.mesh, (m) => { m.opacity = opacity; });
}

// Pop-in: scale 0 -> baseScale with a spring/overshoot, used whenever a
// target (fixed slot, wave/chain-bonus, ...) first appears. Called every
// frame while active; once spawnAge passes SPAWN_POP_DURATION it's a no-op.
function updateSpawnPop(obj, dt) {
  if (obj.spawnAge === undefined) obj.spawnAge = 0;
  if (obj.spawnAge >= SPAWN_POP_DURATION) return;
  obj.spawnAge += dt;
  const t = Math.min(obj.spawnAge / SPAWN_POP_DURATION, 1);
  obj.mesh.scale.setScalar(Math.max(0, obj.baseScale * easeOutBack(t)));
}

// Hit reaction: a brief squash-and-stretch bulge right at the moment of
// impact (obj.popPhase === 'squash'), then the target flies apart, spins,
// shrinks, and fades (obj.popPhase === 'flying'). Shared by fixed slots and
// wave/chain-bonus targets. Returns true once the object is fully gone
// (mesh already removed from the scene) so the caller can drop its entry.
function updatePoppingVisual(obj, dt) {
  obj.popAge += dt;

  if (obj.popPhase === 'squash') {
    const t = Math.min(obj.popAge / SQUASH_DURATION, 1);
    const bulge = Math.sin(t * Math.PI); // 0 -> 1 -> 0
    const sx = obj.baseScale * (1 + bulge * (SQUASH_SCALE_XZ - 1));
    const sy = obj.baseScale * (1 - bulge * (1 - SQUASH_SCALE_Y));
    obj.mesh.scale.set(sx, sy, sx);
    if (t >= 1) {
      obj.popPhase = 'flying';
      obj.popAge = 0;
    }
    return false;
  }

  obj.popVelocity.y -= 9.8 * dt;
  obj.mesh.position.addScaledVector(obj.popVelocity, dt);
  obj.mesh.rotation.x += obj.popSpin.x * dt;
  obj.mesh.rotation.y += obj.popSpin.y * dt;
  const t = Math.min(obj.popAge / TARGET_POP_DURATION, 1);
  const scale = obj.baseScale * (1 - t * t); // ease-in shrink - snappier than linear
  obj.mesh.scale.setScalar(Math.max(0.001, scale));
  setObjectOpacity(obj, 1 - t);
  if (t >= 1) {
    scene.remove(obj.mesh);
    return true;
  }
  return false;
}

function addSceneDecoration() {
  // Foreground crates - a real flat side-view sprite from the Furniture
  // Kit; a plain colored plane stands in if it never loads.
  const cratePositions = [
    [-11, 0.8, -6],
    [11, 0.8, -6],
    [-13, 0.8, -14],
    [13, 0.8, -14],
  ];
  loadBillboardTexture(
    ASSETS.decorations.crate,
    (texture) => {
      for (const [x, y, z] of cratePositions) {
        const crate = createBillboardMesh(texture, 1.6);
        crate.position.set(x, y, z);
        faceBillboardAtCamera(crate);
        scene.add(crate);
      }
    },
    () => {
      const geometry = new THREE.PlaneGeometry(1.6, 1.6);
      const material = new THREE.MeshBasicMaterial({ color: 0x7a4a26 });
      for (const [x, y, z] of cratePositions) {
        const crate = new THREE.Mesh(geometry, material);
        crate.position.set(x, y, z);
        faceBillboardAtCamera(crate);
        scene.add(crate);
      }
    }
  );
}
addSceneDecoration();

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

function createTriggerTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffe100';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a5e00';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#7a5e00';
  ctx.font = 'bold 160px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', size / 2, size / 2 + 12);
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

// --- Target billboard (flat cutout, replaces the old 3D puck) --------------
// A single camera-facing plane per target: a colored "backing card" (like a
// real shooting-gallery target's painted disc) with the type's own artwork
// composited on top - a real per-stage-theme PNG at
// assets/textures/<themeKey>/target-<type>.png if one has loaded, else the
// type's own procedural createTexture() ring. Composited into one canvas so
// each target is still just one plane/material, same as every other prop.
const TARGET_BACKING_COLOR = 0x5a3a20;
const targetTextureOverrides = {}; // "themeKey:typeKey" -> loaded THREE.Texture, once confirmed to exist

function targetTexturePath(themeKey, typeKey) {
  return `assets/textures/${themeKey}/target-${typeKey}.png`;
}

function preloadTargetTexture(themeKey, typeKey) {
  const cacheKey = `${themeKey}:${typeKey}`;
  new THREE.TextureLoader().load(
    targetTexturePath(themeKey, typeKey),
    (texture) => { targetTextureOverrides[cacheKey] = texture; },
    undefined,
    () => {} // no file there yet - createTexture()'s procedural fallback keeps being used
  );
}

function createBackedTexture(sourceImage, backingColor) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hexToCss(backingColor ?? TARGET_BACKING_COLOR);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b1a12';
  ctx.lineWidth = 6;
  ctx.stroke();
  const inset = size * 0.15;
  const box = size - inset * 2;
  const iw = sourceImage.width || box;
  const ih = sourceImage.height || box;
  const fit = Math.min(box / iw, box / ih); // contain, not stretch - keeps the art's own aspect ratio
  const dw = iw * fit;
  const dh = ih * fit;
  ctx.drawImage(sourceImage, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return new THREE.CanvasTexture(canvas);
}

function createTargetBillboard(type, typeKey, themeKey, backingColor) {
  const sourceTexture = targetTextureOverrides[`${themeKey}:${typeKey}`] || type.createTexture();
  const texture = createBackedTexture(sourceTexture.image, backingColor);
  return createBillboardMesh(texture, type.radius * 2); // caller positions it, then calls faceBillboardAtCamera()
}

// --- Target types --------------------------------------------------------
// A single place to define every kind of target: its score, hit-box size,
// movement (null = static, otherwise a left-right sine sweep), rarity
// weight for random respawns, and how it looks. Add a new entry here and
// list its id in a stage's `pool` to bring it into play.
// Scores sit on a 100/500/1000/2000/5000 ladder (dud's -200 penalty is a
// separate concern, not part of that ladder).
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
    score: 500, // was 300, folded into the 500 tier
    radius: 1.0,
    glow: false,
    spawnWeight: 6,
    movement: { amplitude: 2.6, speed: 1.6 },
    particleColor: 0x4aa8ff,
    createTexture: () => createRingTexture(['#eaf6ff', '#2f8fd1', '#eaf6ff', '#2f8fd1']),
  },
  small: {
    id: 'small',
    score: 1000, // was 500
    radius: 0.55,
    glow: false,
    spawnWeight: 4,
    movement: null,
    particleColor: 0x4be07a,
    createTexture: () => createRingTexture(['#eafbea', '#22a35a', '#eafbea']),
  },
  bonus: {
    id: 'bonus',
    score: 2000, // was 1000; also the score used by wave/chain-bonus targets
    radius: 0.9,
    glow: true,
    spawnWeight: 1,
    movement: { amplitude: 9, speed: 0.35 },
    particleColor: 0xffd76a,
    createTexture: () => createRingTexture(['#fff6d0', '#ffcf4d', '#fff1b0', '#d9a441']),
  },
  // The top of the ladder. Never listed in a stage's `pool` - it only ever
  // appears via that stage's one pinned trigger slot (see STAGES below).
  trigger: {
    id: 'trigger',
    score: 5000,
    radius: 1.0,
    glow: true,
    spawnWeight: 0,
    movement: null,
    particleColor: 0xfff066,
    createTexture: () => createTriggerTexture(),
  },
  dud: {
    id: 'dud',
    score: -200,
    radius: 1.1,
    glow: false,
    spawnWeight: 5,
    movement: null,
    particleColor: 0x777777,
    createTexture: () => createDudTexture(),
  },
};

for (const themeKey of ['farm', 'dinosaur', 'western']) {
  for (const typeKey of Object.keys(TARGET_TYPES)) preloadTargetTexture(themeKey, typeKey);
}

// --- Stages ----------------------------------------------------------------
// Each stage sets the backdrop and its five target slots (position + which
// type starts there). Once a slot's target is cleared it respawns as a
// random type drawn from `pool` (weighted by TARGET_TYPES[...].spawnWeight),
// so the initial layout is really just the opening hand for that stage.
// A 6th, `pinned` slot would always respawn as the trigger target instead of
// drawing from the pool (see buildSlotsForStage()) - kept in the data below
// for every stage, but never actually built while FEATURE_TRIGGER_TARGET
// is off.
//
// Slots sit on two depth lanes in a staggered (千鳥) arrangement rather than
// one flat row: the upper/far lane's 3 targets and the lower/near lane's 2
// targets interleave along x, and perspective alone (the z difference, plus
// a touch of y rise) makes the far lane read as smaller/higher and farther
// away, sold further by the shelf risers (addTargetShelves() below).
const LANE_UPPER = { y: 3.1, z: -27 }; // far row - smaller/higher via perspective
const LANE_LOWER = { y: 1.1, z: -15 }; // near row - larger/lower
const TRIGGER_LANE_Z = (LANE_UPPER.z + LANE_LOWER.z) / 2;

// Per-stage theme: everything about how a stage *looks* (sky/ground/frame
// colors, the target billboard's backing-card color, and the background
// dressing) lives here on the stage entry itself - TARGET_TYPES
// (score/hitbox/movement/rarity) is never touched.
const STAGES = [
  {
    name: 'ステージ1 ひろば',
    themeKey: 'farm',
    background: 0x8fd3f4, // bright pastoral sky-blue
    groundColor: 0x4caf50,
    frameColor: '#c9975a', // light rustic farm-fence brown
    frameColorDark: '#8a6236',
    rimColor: 0x8a6236,
    pool: ['normal', 'moving'],
    layout: [
      { x: -6, ...LANE_UPPER, type: 'normal' },
      { x: 0, ...LANE_UPPER, type: 'normal' },
      { x: 6, ...LANE_UPPER, type: 'normal' },
      { x: -3, ...LANE_LOWER, type: 'normal' },
      { x: 3, ...LANE_LOWER, type: 'moving' },
      { x: 0, y: 4.4, z: TRIGGER_LANE_Z, type: 'trigger', pinned: true },
    ],
  },
  {
    name: 'ステージ2 かざん',
    themeKey: 'dinosaur',
    background: 0xff7a3c, // orange-to-red volcanic sky
    groundColor: 0x6b4a3a,
    frameColor: '#4a3a35', // darkened lava-rock tone
    frameColorDark: '#2c211d',
    rimColor: 0x2c211d,
    pool: ['normal', 'moving', 'small', 'dud'],
    layout: [
      { x: -6, ...LANE_UPPER, type: 'moving' },
      { x: 0, ...LANE_UPPER, type: 'small' },
      { x: 6, ...LANE_UPPER, type: 'dud' },
      { x: -3, ...LANE_LOWER, type: 'small' },
      { x: 3, ...LANE_LOWER, type: 'moving' },
      { x: 0, y: 4.4, z: TRIGGER_LANE_Z, type: 'trigger', pinned: true },
    ],
  },
  {
    name: 'ステージ3 せいぶ',
    themeKey: 'western',
    background: 0xe8935a, // dusk/desert-colored sky
    groundColor: 0xc2996a,
    frameColor: '#d8b781', // sun-bleached wood
    frameColorDark: '#a8794a',
    rimColor: 0xa8794a,
    pool: ['moving', 'small', 'dud', 'bonus'],
    layout: [
      { x: -6, ...LANE_UPPER, type: 'small' },
      { x: 0, ...LANE_UPPER, type: 'bonus' },
      { x: 6, ...LANE_UPPER, type: 'small' },
      { x: -3, ...LANE_LOWER, type: 'dud' },
      { x: 3, ...LANE_LOWER, type: 'dud' },
      { x: 0, y: 4.4, z: TRIGGER_LANE_Z, type: 'trigger', pinned: true },
    ],
  },
];

// Wooden riser under each depth lane so its targets read as mounted on a
// shelf rather than floating in mid-air. One riser per lane, sized to the x
// range that lane's targets actually use; the target's own radius pokes up
// above it.
function addTargetShelves() {
  const shelfDepth = 1.4;
  const shelfHeight = 0.5;
  const material = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });
  for (const [lane, shelfWidth] of [[LANE_UPPER, 16], [LANE_LOWER, 10]]) {
    const geometry = new THREE.BoxGeometry(shelfWidth, shelfHeight, shelfDepth);
    const shelf = new THREE.Mesh(geometry, material);
    shelf.position.set(0, lane.y - 1.1, lane.z);
    scene.add(shelf);
  }
}
addTargetShelves();

// --- Per-stage background decoration ---------------------------------------
// Each stage's themed dressing (trees/fence for the farm, a volcano/rocks
// for the dinosaur stage, buildings/tent/palm for the western stage),
// swapped in from loadStage() while the curtain is down. Real Kenney art is
// used where it exists (foliage sprites, desert tiles, the furniture-kit
// crate); everything else is a small procedural canvas billboard, same
// spirit as TARGET_TYPES' own procedural ring textures. decorationLoadToken
// guards the image-loaded ones against a slow load from a stage the player
// has already left landing in the new one.
let decorationObjects = [];
let decorationLoadToken = 0;

function clearStageDecorations() {
  for (const obj of decorationObjects) scene.remove(obj);
  decorationObjects = [];
}

function addDecorationFallbackPlane(x, y, z, height, color) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height, height), new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(x, y, z);
  faceBillboardAtCamera(mesh);
  scene.add(mesh);
  decorationObjects.push(mesh);
}

// Real downloaded art (async load, needs the staleness guard + a fallback).
function placeImageDecoration(url, positions, height, fallbackColor, token) {
  loadBillboardTexture(
    url,
    (texture) => {
      if (token !== decorationLoadToken) return;
      for (const [x, y, z] of positions) {
        const mesh = createBillboardMesh(texture, height);
        mesh.position.set(x, y, z);
        faceBillboardAtCamera(mesh);
        scene.add(mesh);
        decorationObjects.push(mesh);
      }
    },
    () => {
      if (token !== decorationLoadToken) return;
      for (const [x, y, z] of positions) addDecorationFallbackPlane(x, y, z, height, fallbackColor);
    }
  );
}

// Procedural canvas art (already in hand, no load/fallback/staleness to guard).
function placeProceduralDecoration(texture, positions, height) {
  for (const [x, y, z] of positions) {
    const mesh = createBillboardMesh(texture, height);
    mesh.position.set(x, y, z);
    faceBillboardAtCamera(mesh);
    scene.add(mesh);
    decorationObjects.push(mesh);
  }
}

// A round two-tone canopy over a trunk - stands in for the farm's missing
// tree art (Nature Kit was excluded from this asset drop).
function createTreeTexture() {
  const w = 160;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(w / 2 - 14, h * 0.55, 28, h * 0.45);
  ctx.fillStyle = '#3f8f3f';
  for (const [cx, cy, r] of [[w / 2, h * 0.35, w * 0.34], [w * 0.28, h * 0.46, w * 0.24], [w * 0.72, h * 0.46, w * 0.24]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

// A two-rail wood fence segment - stands in for the same missing pack.
function createFenceTexture() {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b4226';
  for (let x = 8; x < w; x += 48) ctx.fillRect(x, h * 0.15, 12, h * 0.8);
  ctx.strokeStyle = '#8a6236';
  ctx.lineWidth = 12;
  for (const y of [h * 0.35, h * 0.72]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

// A triangular peak with a glowing lava crack - stands in for the missing
// flat volcano art (only a 3D model was ever downloaded for it).
function createVolcanoTexture() {
  const w = 256;
  const h = 200;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5a3a35';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.05);
  ctx.lineTo(w * 0.92, h * 0.95);
  ctx.lineTo(w * 0.08, h * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ff6a2e';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.12);
  ctx.lineTo(w * 0.45, h * 0.42);
  ctx.lineTo(w * 0.55, h * 0.62);
  ctx.lineTo(w * 0.48, h * 0.9);
  ctx.stroke();
  ctx.fillStyle = '#ffcf6a';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.08, 14, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function loadThemeDecorations(themeKey, token) {
  if (themeKey === 'farm') {
    placeProceduralDecoration(createTreeTexture(), [[-17, 2.6, -30], [17, 2.6, -30], [-19, 2.2, -20], [19, 2.2, -20]], 5.2);
    placeProceduralDecoration(createFenceTexture(), [[-9, 0.9, -33], [9, 0.9, -33]], 1.8);
    placeImageDecoration(ASSETS.decorations.foliageFlower, [[-4, 0.35, -30], [4, 0.35, -30], [-14, 0.35, -24]], 0.9, 0x4a9a4a, token);
    placeImageDecoration(ASSETS.decorations.foliageGrass, [[-2, 0.3, -28], [2, 0.3, -28], [12, 0.3, -22]], 0.7, 0x4a9a4a, token);
  } else if (themeKey === 'dinosaur') {
    placeProceduralDecoration(createVolcanoTexture(), [[0, 5, -42]], 14);
    placeImageDecoration(ASSETS.decorations.rock, [[-10, 0.7, -18], [10, 0.7, -18], [-14, 0.7, -30], [14, 0.7, -30]], 1.4, 0x6b6b6b, token);
  } else if (themeKey === 'western') {
    placeImageDecoration(ASSETS.decorations.desertBuilding, [[-15, 3, -34], [15, 3, -34]], 6, 0xc9a06a, token);
    placeImageDecoration(ASSETS.decorations.desertTent, [[-9, 1.4, -33], [9, 1.4, -33]], 2.8, 0xb8895a, token);
    placeImageDecoration(ASSETS.decorations.desertPalm, [[-19, 2.6, -22], [19, 2.6, -22]], 5.2, 0x4a7a3a, token);
  }
}

// The frame's wood-plank color is set via CSS custom properties so
// index.html's #frameLeft/#frameRight/#frameBottom bars and the #hud top
// band all repaint together on a stage change.
function applyStageFrameTheme(stage) {
  document.documentElement.style.setProperty('--frame-color', stage.frameColor);
  document.documentElement.style.setProperty('--frame-color-dark', stage.frameColorDark);
}

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

    // Rest length must be the cloth's intended hanging spacing (restX/restY),
    // not the distance measured at construction time: bodies start in the
    // vertically-compressed "bunched" pose (see _bunchedPosition), so
    // measuring from there would permanently lock every vertical constraint
    // to ~0.015 units and the curtain could never hang more than a sliver.
    const connect = (i1, j1, i2, j2, restLength) => {
      const b1 = this.particles[j1][i1];
      const b2 = this.particles[j2][i2];
      this.world.addConstraint(new CANNON.DistanceConstraint(b1, b2, restLength));
    };

    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        if (i < this.cols - 1) connect(i, j, i + 1, j, this.restX);
        if (j < this.rows - 1) connect(i, j, i, j + 1, this.restY);
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
        // A light upward kick right as it finishes falling, so the cloth
        // visibly bounces and settles during the hold instead of just
        // stopping dead.
        for (let j = 1; j < this.rows; j++) {
          for (let i = 0; i < this.cols; i++) {
            this.particles[j][i].velocity.y += CURTAIN_BOUNCE_IMPULSE;
          }
        }
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
// `mode` is only meaningful while state === 'playing': 'stage' is the normal
// per-stage loop, 'bonusStage' and 'finish' are the target-rush interludes
// (see startTargetRush()) that pause the stage timer/slots/conveyor.
let mode = 'stage'; // 'stage' | 'bonusStage' | 'finish'
const stageStartScore = { 1: 0, 2: 0 }; // snapshot at loadStage(), used to gate the bonus stage

// Chain trigger: two adjacent fixed slots hit by the same player within
// CHAIN_WINDOW seconds spawn an extra 2000pt target between them.
const lastSlotHit = { 1: null, 2: null }; // { slot, time } | null

// Trigger-wave / bonus-stage / last-bonus rush - one shared mechanic driven
// by startTargetRush()/endTargetRush(), just with different durations and
// completion callbacks.
let waveActive = false;
let waveTimer = 0;
let waveSpawnTimer = 0;
let waveEndCallback = null;
let waveTargets = []; // { mesh, state: 'active' | 'popping', popAge, popVelocity, popSpin }

// Tiny scheduler for staggered spawns (the trigger's "pon-pon-pon" burst)
// without reaching for setTimeout, so it stays paused along with everything
// else whenever gameplay isn't active.
let pendingSpawns = []; // { timer, fn }
function schedulePendingSpawn(delay, fn) {
  pendingSpawns.push({ timer: delay, fn });
}
function updatePendingSpawns(dt) {
  for (let i = pendingSpawns.length - 1; i >= 0; i--) {
    pendingSpawns[i].timer -= dt;
    if (pendingSpawns[i].timer <= 0) {
      pendingSpawns[i].fn();
      pendingSpawns.splice(i, 1);
    }
  }
}

// Conveyor phase: a row of targets flowing toward the camera in the back
// half of each stage.
let conveyorPhaseActive = false;
let conveyorPhaseTriggered = false;
let conveyorPhaseTimer = 0;
let conveyorSpawnTimer = 0;
let conveyorTier = 0;
let conveyorLastHitTime = 0;
let conveyorLaneIndex = 0;
let conveyorTargets = []; // { mesh, tierIndex }

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
const eventBannerEl = document.getElementById('eventBanner');
const hitFlashEl = document.getElementById('hitFlash');
const comboPopEls = { 1: document.getElementById('p1ComboPop'), 2: document.getElementById('p2ComboPop') };
const scorePanelEls = [
  document.getElementById('p1Score'),
  document.getElementById('timePanel'),
  document.getElementById('p2Score'),
];

function showEventBanner(text) {
  eventBannerEl.textContent = text;
  eventBannerEl.classList.remove('show');
  void eventBannerEl.offsetWidth; // restart the CSS animation
  eventBannerEl.classList.add('show');
}

// A quick full-screen white flash. Driven by an inline transition (rather
// than a fixed-duration CSS class) so hit flashes and the bigger trigger
// flash can use different durations without needing two animations.
function flashScreen(opacity, durationMs) {
  hitFlashEl.style.transition = 'none';
  hitFlashEl.style.opacity = String(opacity);
  requestAnimationFrame(() => {
    hitFlashEl.style.transition = `opacity ${durationMs}ms ease-out`;
    hitFlashEl.style.opacity = '0';
  });
}

function showComboPop(player, hits, multiplier) {
  const el = comboPopEls[player];
  if (!el) return;
  el.textContent = `P${player} COMBO ×${formatMultiplier(multiplier)}!`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function popScorePanels() {
  for (const el of scorePanelEls) {
    el.classList.remove('panel-pop');
    void el.offsetWidth;
    el.classList.add('panel-pop');
  }
}

function playStageClearFanfare() {
  playSfx('fanfare', 0.7);
  popScorePanels();
}

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
// location.host is the address the PC operator's own browser used (often
// "localhost:3000"), which a phone on the LAN can't reach - ask the server
// for its actual LAN-facing IP (same one printed in the console at startup)
// and build the QR URL from that instead. Falls back to location.host if
// the request fails for any reason.
async function ensureQrRendered() {
  if (qrRendered || debugMode || !window.QRCode) return;
  qrRendered = true;
  let host = location.host;
  try {
    const res = await fetch('/api/lan-ip');
    const { ip, port } = await res.json();
    host = `${ip}:${port}`;
  } catch {
    // keep location.host fallback
  }
  const url = `${location.protocol}//${host}/controller.html`;
  new window.QRCode(qrHolder, {
    text: url,
    width: 200,
    height: 200,
    colorDark: '#2b1a12',
    colorLight: '#fff6e3',
  });
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
// Regular slots get sequential indices (0..4) used for chain-trigger
// adjacency; a `pinned` slot (the trigger target) always gets index -1 so
// it can never accidentally register as "adjacent" to a regular slot, and
// always respawns as its own initialType rather than a pool draw. Pinned
// (trigger) entries are dropped entirely here when FEATURE_TRIGGER_TARGET
// is off, so the stage data can keep listing them without them ever
// actually appearing.
function buildSlotsForStage(stage) {
  let poolIndex = 0;
  return stage.layout
    .filter((entry) => FEATURE_TRIGGER_TARGET || !entry.pinned)
    .map((entry) => {
      const pinned = !!entry.pinned;
      const index = pinned ? -1 : poolIndex++;
      return {
        index,
        pinned,
        basePosition: new THREE.Vector3(entry.x, entry.y ?? 1.6, entry.z ?? -24),
        phase: index * 1.7 + (pinned ? 3.1 : 0),
        typeKey: null,
        state: 'empty', // 'active' | 'popping' | 'waiting'
        mesh: null,
        glowMesh: null,
        popAge: 0,
        popVelocity: null,
        popSpin: null,
        waitTimer: 0,
        initialType: entry.type,
      };
    });
}

function spawnSlotTarget(slot, typeKey) {
  const type = TARGET_TYPES[typeKey];
  const stage = STAGES[currentStageIndex];
  slot.typeKey = typeKey;
  slot.state = 'active';

  const mesh = createTargetBillboard(type, typeKey, stage.themeKey, stage.rimColor);
  slot.baseScale = 1;
  mesh.scale.setScalar(0); // pops in via updateSpawnPop below
  mesh.position.copy(slot.basePosition);
  faceBillboardAtCamera(mesh);
  scene.add(mesh);
  slot.mesh = mesh;
  slot.spawnAge = 0;

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
  slot.popPhase = 'squash';
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
      updateSpawnPop(slot, dt);
      if (type.movement) {
        const offset = Math.sin(elapsed * type.movement.speed + slot.phase) * type.movement.amplitude;
        slot.mesh.position.x = slot.basePosition.x + offset;
        faceBillboardAtCamera(slot.mesh); // stay camera-facing as it slides sideways
      }
      if (type.glow) {
        slot.mesh.rotation.z += dt * 0.6; // local Z is roughly "toward camera" post-lookAt, so this reads as an in-plane spin
        if (slot.glowMesh) {
          const pulse = 1 + 0.15 * Math.sin(elapsed * 4 + slot.phase);
          slot.glowMesh.scale.set(type.radius * 4 * pulse, type.radius * 4 * pulse, 1);
          slot.glowMesh.position.copy(slot.mesh.position);
        }
      }
    } else if (slot.state === 'popping') {
      if (updatePoppingVisual(slot, dt)) {
        slot.mesh = null;
        slot.state = 'waiting';
        slot.waitTimer = slot.pinned ? TRIGGER_RESPAWN_DELAY : TARGET_RESPAWN_DELAY;
      }
    } else if (slot.state === 'waiting') {
      slot.waitTimer -= dt;
      if (slot.waitTimer <= 0) {
        spawnSlotTarget(slot, slot.pinned ? slot.initialType : pickWeightedType(stage.pool));
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

// --- Target rush (shared by the trigger's bonus wave, the bonus stage, and
// the final "last bonus" phase) -----------------------------------------
// All three are "a bunch of 2000pt targets keep appearing for N seconds" -
// they only differ in how long that lasts and what happens once it's over.
function spawnBonusTargetAt(x, y, z) {
  const type = TARGET_TYPES.bonus;
  const stage = STAGES[currentStageIndex];
  const mesh = createTargetBillboard(type, 'bonus', stage.themeKey, stage.rimColor);
  mesh.scale.setScalar(0); // pops in via updateSpawnPop below
  mesh.position.set(x, y, z);
  faceBillboardAtCamera(mesh);
  scene.add(mesh);
  waveTargets.push({
    mesh,
    state: 'active',
    baseScale: 1,
    spawnAge: 0,
    popPhase: null,
    popAge: 0,
    popVelocity: null,
    popSpin: null,
  });
}

function spawnWaveTarget() {
  const x = (Math.random() - 0.5) * 20;
  const y = 1.2 + Math.random() * 3.2;
  const z = -20 - Math.random() * 8;
  spawnBonusTargetAt(x, y, z);
}

function startTargetRush(duration, onEnd) {
  waveActive = true;
  waveTimer = duration;
  waveSpawnTimer = 0;
  waveEndCallback = onEnd || null;
}

function endTargetRush() {
  waveActive = false;
  pendingSpawns = [];
  for (const w of waveTargets) scene.remove(w.mesh);
  waveTargets = [];
  const cb = waveEndCallback;
  waveEndCallback = null;
  if (cb) cb();
}

function popWaveTarget(waveTarget) {
  waveTarget.state = 'popping';
  waveTarget.popPhase = 'squash';
  waveTarget.popAge = 0;
  waveTarget.popVelocity = new THREE.Vector3((Math.random() - 0.5) * 3, 4 + Math.random() * 2, (Math.random() - 0.5) * 2);
  waveTarget.popSpin = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
}

function updateTargetRush(dt) {
  updatePendingSpawns(dt);

  if (waveActive) {
    waveTimer -= dt;
    waveSpawnTimer -= dt;
    const activeCount = waveTargets.reduce((n, w) => n + (w.state === 'active' ? 1 : 0), 0);
    if (waveSpawnTimer <= 0 && activeCount < BONUS_WAVE_MAX_CONCURRENT) {
      spawnWaveTarget();
      waveSpawnTimer = BONUS_WAVE_SPAWN_INTERVAL;
    }
    if (waveTimer <= 0) {
      endTargetRush();
    }
  }

  for (let i = waveTargets.length - 1; i >= 0; i--) {
    const w = waveTargets[i];
    if (w.state === 'active') {
      updateSpawnPop(w, dt);
      w.mesh.rotation.z += dt * 0.8;
    } else if (updatePoppingVisual(w, dt)) {
      waveTargets.splice(i, 1);
    }
  }
}

function handleWaveHit(waveTarget, player) {
  awardHit(TARGET_TYPES.bonus, player, waveTarget.mesh.position);
  popWaveTarget(waveTarget);
}

// --- Chain trigger: two adjacent slots, same player, in quick succession ---
function checkChainTrigger(slot, player) {
  const now = clock.getElapsedTime();
  const last = lastSlotHit[player];
  if (last && last.slot !== slot && Math.abs(last.slot.index - slot.index) === 1 && now - last.time <= CHAIN_WINDOW) {
    const mid = slot.basePosition.clone().lerp(last.slot.basePosition, 0.5);
    mid.y += 0.6;
    spawnBonusTargetAt(mid.x, mid.y, mid.z);
    showEventBanner('CHAIN BONUS!');
    lastSlotHit[player] = null;
  } else {
    lastSlotHit[player] = { slot, time: now };
  }
}

// --- Conveyor phase: a row of targets flowing toward the camera -----------
function maybeStartConveyorPhase() {
  if (!FEATURE_CONVEYOR || conveyorPhaseTriggered) return;
  const stage = STAGES[currentStageIndex];
  const duration = stage.duration ?? STAGE_DEFAULT_DURATION;
  if (stageTimeLeft <= duration / 2) {
    conveyorPhaseTriggered = true;
    conveyorPhaseActive = true;
    conveyorPhaseTimer = CONVEYOR_PHASE_DURATION;
    conveyorSpawnTimer = 0;
    conveyorTier = 0;
    conveyorLastHitTime = clock.getElapsedTime();
    showEventBanner('CONVEYOR RUSH!');
  }
}

function spawnConveyorTarget() {
  const tier = CONVEYOR_TIERS[conveyorTier];
  const lane = CONVEYOR_LANES[conveyorLaneIndex % CONVEYOR_LANES.length];
  conveyorLaneIndex++;
  const stage = STAGES[currentStageIndex];
  const texture = createBackedTexture(createRingTexture(tier.colors).image, stage.rimColor);
  const mesh = createBillboardMesh(texture, 1.6);
  mesh.scale.setScalar(0); // pops in via updateSpawnPop below
  mesh.position.set(lane, 1.8, -30);
  faceBillboardAtCamera(mesh);
  scene.add(mesh);
  conveyorTargets.push({ mesh, tierIndex: conveyorTier, baseScale: 1, spawnAge: 0 });
}

function handleConveyorHit(target, player) {
  const tier = CONVEYOR_TIERS[target.tierIndex];
  awardHit({ score: tier.score, particleColor: 0xffe27a }, player, target.mesh.position);
  scene.remove(target.mesh);
  conveyorTargets.splice(conveyorTargets.indexOf(target), 1);
  conveyorLastHitTime = clock.getElapsedTime();
  conveyorTier = Math.min(conveyorTier + 1, CONVEYOR_TIERS.length - 1);
}

function updateConveyor(dt, elapsed) {
  if (conveyorPhaseActive) {
    conveyorPhaseTimer -= dt;
    conveyorSpawnTimer -= dt;
    if (conveyorSpawnTimer <= 0) {
      spawnConveyorTarget();
      conveyorSpawnTimer = CONVEYOR_SPAWN_INTERVAL;
    }
    if (elapsed - conveyorLastHitTime > CONVEYOR_HIT_GAP_RESET) {
      conveyorTier = 0;
    }
    if (conveyorPhaseTimer <= 0) {
      conveyorPhaseActive = false;
    }
  }

  for (let i = conveyorTargets.length - 1; i >= 0; i--) {
    const c = conveyorTargets[i];
    updateSpawnPop(c, dt);
    c.mesh.position.z += CONVEYOR_SPEED * dt;
    c.mesh.rotation.y += dt * 2;
    if (c.mesh.position.z > CONVEYOR_MISS_Z) {
      scene.remove(c.mesh);
      conveyorTargets.splice(i, 1);
      conveyorTier = 0; // missed one - streak resets
    }
  }
}

function clearConveyor() {
  for (const c of conveyorTargets) scene.remove(c.mesh);
  conveyorTargets = [];
  conveyorPhaseActive = false;
  conveyorPhaseTriggered = false;
  conveyorTier = 0;
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

  if (mode === 'bonusStage' || mode === 'finish') {
    stageLabelEl.textContent = mode === 'bonusStage' ? 'BONUS STAGE!' : 'LAST BONUS!';
    const t = Math.max(Math.ceil(waveTimer), 0);
    timeEl.textContent = String(t);
    timeEl.classList.toggle('low', t <= 3);
  } else {
    stageLabelEl.textContent = `STAGE ${currentStageIndex + 1}/${STAGES.length}`;
    const t = Math.max(Math.ceil(stageTimeLeft), 0);
    timeEl.textContent = String(t);
    timeEl.classList.toggle('low', t <= 10);
  }
}

function loadStage(index) {
  mode = 'stage';
  currentStageIndex = index;
  const stage = STAGES[index];
  scene.background?.dispose?.();
  scene.background = createSkyGradientTexture(stage.background, mixHexColor(stage.background, 0xffffff, 0.55));
  scene.fog.color.setHex(stage.background);
  ground.material.color.setHex(stage.groundColor ?? 0x3a7d3a);
  applyStageFrameTheme(stage);

  decorationLoadToken++;
  clearStageDecorations();
  loadThemeDecorations(stage.themeKey, decorationLoadToken);

  clearBullets();
  clearSlots();
  clearConveyor();
  lastSlotHit[1] = null;
  lastSlotHit[2] = null;
  slots = buildSlotsForStage(stage);
  for (const slot of slots) spawnSlotTarget(slot, slot.initialType);

  stageTimeLeft = stage.duration ?? STAGE_DEFAULT_DURATION;
  stageStartScore[1] = scores[1];
  stageStartScore[2] = scores[2];
  updateHud();
}

// Between stages: if the stage just cleared earned enough points, detour
// through a short bonus-stage rush before the next stage's curtain reveal.
// After the last stage, always go to the (also rush-based) finish phase.
function advanceStage() {
  const gain = scores[1] - stageStartScore[1] + (scores[2] - stageStartScore[2]);
  const next = currentStageIndex + 1;

  if (next >= STAGES.length) {
    enterFinishPhase();
    return;
  }
  if (FEATURE_BONUS_STAGE && gain >= BONUS_STAGE_THRESHOLD) {
    enterBonusStage(next);
  } else {
    loadStage(next);
  }
}

function enterBonusStage(nextIndex) {
  mode = 'bonusStage';
  clearBullets();
  clearSlots();
  clearConveyor();
  showEventBanner('BONUS STAGE!');
  startTargetRush(BONUS_STAGE_DURATION, () => {
    curtain.show(
      () => loadStage(nextIndex),
      () => playStageClearFanfare()
    );
  });
}

function enterFinishPhase() {
  mode = 'finish';
  clearBullets();
  clearSlots();
  clearConveyor();
  showEventBanner('LAST BONUS!');
  startTargetRush(FINISH_PHASE_DURATION, () => {
    curtain.show(() => finishGame());
  });
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
  endTargetRush();
  waveActive = false;
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

// Shared scoring path for every kind of hit (fixed slots, wave/chain-bonus
// targets, conveyor targets): applies the combo multiplier (flat penalty
// for a negative-score type instead, which also resets the combo), then
// the common popup/particles/sfx feedback. Returns the points awarded.
function awardHit(type, player, position) {
  let awarded;
  if (type.score < 0) {
    awarded = type.score;
    combo[player] = { hits: 0, multiplier: 1 };
  } else {
    const c = combo[player];
    c.hits += 1;
    if (c.hits % COMBO_HITS_PER_STEP === 0) {
      c.multiplier *= COMBO_MULTIPLIER_STEP;
      if (c.hits % COMBO_POP_MILESTONE === 0) showComboPop(player, c.hits, c.multiplier);
    }
    awarded = Math.round(type.score * c.multiplier);
  }
  scores[player] += awarded;
  updateHud();
  spawnScorePopup(position, awarded);
  spawnHitParticles(position, type);
  addCameraShake(CAMERA_SHAKE_HIT);
  flashScreen(HIT_FLASH_OPACITY, HIT_FLASH_DURATION_MS);
  if (type.score >= 0) playSfx('hit'); // a "cha-ching" would feel wrong on a penalty hit
  return awarded;
}

function handleHit(slot, player) {
  const type = TARGET_TYPES[slot.typeKey];
  awardHit(type, player, slot.mesh.position);

  if (FEATURE_TRIGGER_TARGET && slot.typeKey === 'trigger') {
    showEventBanner('BONUS WAVE!');
    flashScreen(TRIGGER_FLASH_OPACITY, TRIGGER_FLASH_DURATION_MS);
    addCameraShake(CAMERA_SHAKE_TRIGGER);
    startTargetRush(BONUS_WAVE_DURATION);
    // A quick "pon, pon, pon" burst of extra targets, staggered a beat
    // apart, layered on top of the wave's own steady spawn timer.
    for (let i = 0; i < BONUS_WAVE_BURST_COUNT; i++) {
      const [lo, hi] = BONUS_WAVE_BURST_STAGGER;
      schedulePendingSpawn(i * (lo + Math.random() * (hi - lo)), () => spawnWaveTarget());
    }
  } else if (FEATURE_CHAIN_TRIGGER && type.score > 0) {
    checkChainTrigger(slot, player);
  }

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

// Checks the fixed slots, the wave/chain-bonus targets, and the conveyor
// targets (in that order) for a hit at this bullet position, and resolves
// scoring/effects for whichever one it hits first. Returns true if it hit
// something.
function resolveBulletHit(position, player) {
  for (const slot of slots) {
    if (slot.state !== 'active') continue;
    const type = TARGET_TYPES[slot.typeKey];
    if (position.distanceTo(slot.mesh.position) < type.radius) {
      handleHit(slot, player);
      return true;
    }
  }
  for (const w of waveTargets) {
    if (w.state !== 'active') continue;
    if (position.distanceTo(w.mesh.position) < TARGET_TYPES.bonus.radius) {
      handleWaveHit(w, player);
      return true;
    }
  }
  for (const c of conveyorTargets) {
    if (position.distanceTo(c.mesh.position) < CONVEYOR_HIT_RADIUS) {
      handleConveyorHit(c, player);
      return true;
    }
  }
  return false;
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.velocity.y -= GRAVITY * dt;
    b.mesh.position.addScaledVector(b.velocity, dt);
    b.age += dt;

    const consumed = resolveBulletHit(b.mesh.position, b.player);
    if (consumed) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    } else if (b.age > 5 || b.mesh.position.y < -10) {
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
  updateCameraShake(dt);

  const connectedPlayers = input.getConnectedPlayers();
  updateWaitingScreen(connectedPlayers);
  updateCrosshairs(connectedPlayers);
  updateHitParticles(dt);

  const gameplayActive = state === 'playing' && !curtain.busy && connectedPlayers.length > 0;

  if (gameplayActive) {
    const elapsed = clock.getElapsedTime();

    // Firing, bullets, and the target-rush mechanic run in every mode
    // (normal stage play, the bonus stage, and the final last-bonus phase).
    for (const player of connectedPlayers) {
      if (input.consumeFire(player)) {
        fireBullet(player, input.getAim(player));
      }
    }
    updateBullets(dt);
    updateTargetRush(dt);

    if (mode === 'stage') {
      stageTimeLeft -= dt;
      if (stageTimeLeft <= 0) {
        stageTimeLeft = 0;
        updateHud();
        curtain.show(
          () => advanceStage(),
          () => playStageClearFanfare() // plays once the next stage (or the final result) is actually revealed
        );
      } else {
        updateHud();
      }

      updateSlots(dt, elapsed);
      maybeStartConveyorPhase();
      updateConveyor(dt, elapsed);
    } else {
      updateHud();
    }
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
