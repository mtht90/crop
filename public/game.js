import * as THREE from 'three';

// --- Input abstraction ---------------------------------------------------
// getAim() returns the current aim point as normalized device coordinates
// {x, y} in [-1, 1]. consumeFire() returns true once per fire request and
// then resets it. A future PhoneInput implementation (driven over
// WebSocket) can be swapped in without touching the rest of the game.
class InputSource {
  getAim() {
    throw new Error('getAim() not implemented');
  }
  consumeFire() {
    throw new Error('consumeFire() not implemented');
  }
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

// --- Constants ------------------------------------------------------------
const GAME_TIME = 90;
const GRAVITY = 9.8;
const BULLET_SPEED = 32;
const BULLET_RADIUS = 0.15;
const TARGET_RADIUS = 1.1;
const TARGET_POSITIONS = [-8, -4, 0, 4, 8].map((x) => new THREE.Vector3(x, 1.6, -24));

// --- Scene setup ------------------------------------------------------------
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

// --- Game state --------------------------------------------------------
const input = new MouseInput(renderer.domElement);
const raycaster = new THREE.Raycaster();
const bullets = [];
let targets = [];
let score = 0;
let timeLeft = GAME_TIME;
let state = 'playing'; // 'playing' | 'result'

const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const crosshairEl = document.getElementById('crosshair');
const resultEl = document.getElementById('result');
const finalScoreEl = document.getElementById('finalScore');

function spawnTargets() {
  for (const t of targets) scene.remove(t);
  targets = TARGET_POSITIONS.map((pos) => createTarget(pos));
}

function clearBullets() {
  for (const b of bullets) scene.remove(b.mesh);
  bullets.length = 0;
}

function startGame() {
  score = 0;
  timeLeft = GAME_TIME;
  state = 'playing';
  clearBullets();
  spawnTargets();
  resultEl.style.display = 'none';
  updateHud();
}

function updateHud() {
  scoreEl.textContent = `SCORE: ${score}`;
  timeEl.textContent = `TIME: ${Math.ceil(timeLeft)}`;
}

function endGame() {
  state = 'result';
  finalScoreEl.textContent = `SCORE: ${score}`;
  resultEl.style.display = 'flex';
}

function fireBullet(aim) {
  raycaster.setFromCamera(aim, camera);
  const velocity = raycaster.ray.direction.clone().multiplyScalar(BULLET_SPEED);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(BULLET_RADIUS, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffdd33, emissive: 0x996600 })
  );
  mesh.position.copy(camera.position);
  scene.add(mesh);
  bullets.push({ mesh, velocity, age: 0 });
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.velocity.y -= GRAVITY * dt;
    b.mesh.position.addScaledVector(b.velocity, dt);
    b.age += dt;

    for (let j = targets.length - 1; j >= 0; j--) {
      const target = targets[j];
      if (b.mesh.position.distanceTo(target.position) < TARGET_RADIUS) {
        scene.remove(target);
        targets.splice(j, 1);
        score += 100;
        updateHud();
        scene.remove(b.mesh);
        bullets.splice(i, 1);
        break;
      }
    }

    if (bullets[i] === b && (b.age > 5 || b.mesh.position.y < -10)) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

function updateCrosshair(aim) {
  const x = ((aim.x + 1) / 2) * window.innerWidth;
  const y = ((1 - aim.y) / 2) * window.innerHeight;
  crosshairEl.style.left = `${x}px`;
  crosshairEl.style.top = `${y}px`;
}

// --- Main loop ------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const aim = input.getAim();
  updateCrosshair(aim);

  if (state === 'playing') {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHud();
      endGame();
    } else {
      updateHud();
    }

    if (input.consumeFire()) {
      fireBullet(aim);
    }
    updateBullets(dt);
  } else if (state === 'result') {
    if (input.consumeFire()) {
      startGame();
    }
  }

  renderer.render(scene, camera);
}

startGame();
animate();
