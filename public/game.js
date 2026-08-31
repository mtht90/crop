import * as THREE from 'three';
import * as CANNON from 'cannon-es';

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
const GAME_TIME = 90;
const GRAVITY = 2.2; // was 9.8 - lowered so shots reach the back targets almost straight
const BULLET_SPEED = 55; // was 32 - raised for the same reason
const BULLET_RADIUS = 0.15;
const TARGET_RADIUS = 1.1;
const TARGET_POSITIONS = [-8, -4, 0, 4, 8].map((x) => new THREE.Vector3(x, 1.6, -24));
const PLAYER_COLORS = { 1: 0xff3b3b, 2: 0x3ba7ff };

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

// --- Target bullseye texture -----------------------------------------------
function createTargetTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rings = [
    [size / 2, '#ffffff'],
    [size / 2.5, '#ff2d2d'],
    [size / 2.5 - 30, '#ffffff'],
    [size / 2.5 - 60, '#ff2d2d'],
    [size / 2.5 - 90, '#ffffff'],
  ];
  for (const [radius, color] of rings) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}
const targetTexture = createTargetTexture();

function createTarget(position) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(TARGET_RADIUS, 32),
    new THREE.MeshBasicMaterial({ map: targetTexture, side: THREE.DoubleSide })
  );
  mesh.position.copy(position);
  scene.add(mesh);
  return mesh;
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

  // Runs the fall -> hold -> rise sequence and invokes `callback` once the
  // curtain is fully closed (screen covered), so the caller can change what's
  // behind it before the curtain rises again to reveal it.
  show(callback) {
    if (this.busy) return;
    this.busy = true;
    this.callback = callback;
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
      }
    }
  }
}

const curtain = new CurtainController(scene);

// --- Input, HUD elements ----------------------------------------------------
const input = debugMode ? new MouseInput(renderer.domElement) : new RemoteInput();
const raycaster = new THREE.Raycaster();

const bullets = [];
let targets = [];
const scores = { 1: 0, 2: 0 };
let timeLeft = GAME_TIME;
let state = 'intro'; // 'intro' | 'playing' | 'result'

const p1ScoreEl = document.getElementById('p1ScoreValue');
const p2ScoreEl = document.getElementById('p2ScoreValue');
const timeEl = document.getElementById('timeValue');
const resultEl = document.getElementById('result');
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

function spawnTargets() {
  for (const t of targets) scene.remove(t);
  targets = TARGET_POSITIONS.map((pos) => createTarget(pos));
}

function clearBullets() {
  for (const b of bullets) scene.remove(b.mesh);
  bullets.length = 0;
}

function updateHud() {
  p1ScoreEl.textContent = String(scores[1]);
  p2ScoreEl.textContent = String(scores[2]);
  const t = Math.ceil(timeLeft);
  timeEl.textContent = String(t);
  timeEl.classList.toggle('low', t <= 15);
}

function startGame() {
  scores[1] = 0;
  scores[2] = 0;
  timeLeft = GAME_TIME;
  state = 'playing';
  clearBullets();
  spawnTargets();
  resultEl.style.display = 'none';
  updateHud();
}

function endGame() {
  state = 'result';
  document.querySelector('#finalP1 .value').textContent = String(scores[1]);
  document.querySelector('#finalP2 .value').textContent = String(scores[2]);
  resultEl.style.display = 'flex';
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
    for (let j = targets.length - 1; j >= 0; j--) {
      const target = targets[j];
      if (b.mesh.position.distanceTo(target.position) < TARGET_RADIUS) {
        scene.remove(target);
        targets.splice(j, 1);
        scores[b.player] = (scores[b.player] ?? 0) + 100;
        updateHud();
        scene.remove(b.mesh);
        bullets.splice(i, 1);
        consumed = true;
        break;
      }
    }

    if (!consumed && (b.age > 5 || b.mesh.position.y < -10)) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

// --- Main loop ---------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  curtain.update(dt);

  const connectedPlayers = input.getConnectedPlayers();
  updateWaitingScreen(connectedPlayers);
  updateCrosshairs(connectedPlayers);

  const gameplayActive = state === 'playing' && !curtain.busy && connectedPlayers.length > 0;

  if (gameplayActive) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHud();
      curtain.show(() => endGame());
    } else {
      updateHud();
    }

    for (const player of connectedPlayers) {
      if (input.consumeFire(player)) {
        fireBullet(player, input.getAim(player));
      }
    }
    updateBullets(dt);
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
