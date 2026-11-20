import * as THREE from 'three';
import { startLoading, Models, Library } from './assets';
import { Input } from './input';
import { Body } from './body';
import { Player } from './player';
import { Track, Shared, baseSpeed } from './world/track';
import { KIT_FACTORIES, BiomeKit } from './world/biomes';
import { BiomeAtmosphere } from './world/types';
import { Post, SpeedLines, Sky } from './fx';
import { Audio } from './audio';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('game') as HTMLCanvasElement;

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const START_DIST = Number(new URLSearchParams(location.search).get('start') || 0);
const LOWQ = new URLSearchParams(location.search).has('lowq');
renderer.setPixelRatio(LOWQ ? 0.5 : matchMedia('(pointer: coarse)').matches ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb7c9dc, 0.004);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.04, 3000);
scene.add(camera);

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(matchMedia('(pointer: coarse)').matches ? 1024 : 2048);
const sc = sun.shadow.camera;
sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 300;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const sky = new Sky();
scene.add(sky.mesh);
const post = new Post(renderer, scene, camera);
const lines = new SpeedLines();
scene.add(lines.group);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const input = new Input(canvas);
input.setupTouch($('touch'));
const audio = new Audio();

// ---------------------------------------------------------------------------
// game state
// ---------------------------------------------------------------------------
type Mode = 'loading' | 'title' | 'intro' | 'play' | 'paused' | 'dying' | 'over';
let mode: Mode = 'loading';
let lib: Library;
let kits: BiomeKit[];
let track: Track;
let body: Body;
let player: Player;
const envMaps: Record<string, THREE.Texture> = {};
let pmrem: THREE.PMREMGenerator;
function envFor(key: string) {
  if (!envMaps[key] && lib.hdr[key]) envMaps[key] = pmrem.fromEquirectangular(lib.hdr[key]).texture;
  return envMaps[key] ?? null;
}

let score = 0, mult = 1, comboT = 0;
let timeScale = 1;
let modeT = 0;
let elapsed = 0;
let lookYaw = 0, lookPitch = 0, idleLook = 0;
let landDip = 0, landDipV = 0;
let shock = 0;
let rollT = -1;
let fovKick = 0;
let flash = 0;
let lastBiomeShown = -1;
let best = Number(safeGet('vr-best') || 0);
$('best').textContent = String(best);

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

// HUD
const hud = { dist: $('dist'), score: $('score'), mult: $('mult'), speed: $('speed'), speedFill: $('speed-fill'), flowFill: $('flow-fill'), flow: document.querySelector('.flow') as HTMLElement, popups: $('popups'), vignette: $('vignette') };

function popup(text: string, pts = 0, opts: { big?: boolean; warn?: boolean } = {}) {
  const el = document.createElement('div');
  el.className = 'popup' + (opts.big ? ' big' : '') + (opts.warn ? ' warn' : '');
  el.innerHTML = text + (pts > 0 ? `<span class="pts">+${Math.round(pts)}</span>` : '');
  const n = hud.popups.children.length;
  el.style.top = `${-n * 34}px`;
  hud.popups.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function showBanner(biome: number) {
  const k = kits[biome % kits.length];
  $('bb-sector').textContent = `SECTOR ${String(biome + 1).padStart(2, '0')}`;
  $('bb-name').textContent = k.name;
  $('bb-jp').textContent = k.jp;
  const b = $('biome-banner');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
(async function boot() {
  const loading = startLoading((p) => { ($('ld-fill') as HTMLElement).style.width = `${Math.round(p * 100)}%`; });
  lib = loading.lib;
  const t0 = performance.now();
  const timer = setInterval(() => {
    const st = loading.status();
    const sec = Math.round((performance.now() - t0) / 1000);
    if (sec < 6) return;
    $('ld-text').textContent = `LOADING ${sec}s — 待機中: ${st.pending.join(', ') || 'なし'}` + (st.failed.length ? ` / 失敗: ${st.failed.join(', ')}` : '');
  }, 1000);
  try { await loading.core; } catch (e) {
    $('ld-text').textContent = '読み込みに失敗しました。再読み込みしてください (' + String((e as any)?.message ?? e).slice(0, 80) + ')';
    clearInterval(timer); console.error(e); return;
  }
  clearInterval(timer);
  const st = loading.status();
  if (st.failed.length) console.warn('failed assets', st.failed);
  $('ld-text').textContent = 'PREPARING… (音声デコード)';
  await Promise.race([audio.load(lib.audio), new Promise((r) => setTimeout(r, 8000))]);
  $('ld-text').textContent = 'PREPARING… (ステージ生成)';
  await new Promise((r) => setTimeout(r, 30));
  pmrem = new THREE.PMREMGenerator(renderer);

  const models = new Models(lib);
  kits = new Array(KIT_FACTORIES.length);
  kits[0] = KIT_FACTORIES[0](lib);
  // remaining stages stream in while playing
  loading.onBiomeReady = (i) => { kits[i] = KIT_FACTORIES[i](lib); };
  loading.onAudio = (name, buf) => { audio.load({ [name]: buf }); };
  track = new Track(models, kits, new Shared());
  scene.add(track.root);
  body = new Body(lib.runner, lib.runnerExtra);
  scene.add(body.root);
  body.onFootstep = () => {
    if (player.grounded || player.state === 'wallrun') audio.footstep(currentKit().footstep, speed01());
  };
  player = new Player(getEvents());

  newRun();
  mode = 'title';
  body.setHeadVisible(true);
  body.play('idle', 0);
  $('loading').classList.add('hidden');
  $('start').classList.remove('hidden');
  renderer.compile(scene, camera);
})();

function currentKit() { return kits[Math.max(0, biomeAt(player.pos.z)) % kits.length]; }
function speed01() { return THREE.MathUtils.clamp((player.speed - 12) / 38, 0, 1); }
function dist() { return track.originDist - player.pos.z; }

function newRun() {
  track.reset();
  track.originDist = START_DIST;
  track.update(0, 750);
  player.reset(0, 0, 0);
  score = 0; mult = 1; comboT = 0; lookYaw = 0; lookPitch = 0; landDip = 0; landDipV = 0; rollT = -1; lastBiomeShown = -1;
  body.root.position.copy(player.pos);
  lines.resetMotes();
  applyAtmosphere(kits[0].atmo, kits[0].atmo, 0, true);
}

// ---------------------------------------------------------------------------
// player events → feedback
// ---------------------------------------------------------------------------
const events = {
  style(name: string, pts: number, opts: { big?: boolean; warn?: boolean } = {}) {
    if (pts > 0) {
      mult = Math.min(5, mult + 0.15);
      comboT = 3.5;
      score += pts * mult;
      player.flow = Math.min(1, player.flow + (player.overdrive > 0 ? 0 : pts / 2200));
    }
    popup(name, pts * mult, opts);
  },
  jump(kind: string) {
    audio.play('sfx_other_03.mp3', { vol: 0.25, rate: kind === 'wall' ? 1.4 : 1.1 });
    if (kind === 'wall') { shock = 0.4; audio.play('sfx_slam_05.mp3', { vol: 0.3, rate: 1.5 }); }
    body.play('jumpStart', 0.08);
  },
  land(impact: number, kind: string) {
    landDipV -= Math.min(impact, 30) * (kind === 'roll' ? 0.02 : 0.035);
    if (kind === 'hard') { shock = 1; audio.play('sfx_slam_02.mp3', { vol: 0.8 }); hud.vignette.style.opacity = '0.8'; }
    else audio.play('sfx_slam_05.mp3', { vol: Math.min(0.6, impact / 30), rate: 1.2 });
    audio.footstep(currentKit().footstep, 1);
    if (kind === 'roll') { body.play('roll', 0.05); rollT = 0; audio.play('sfx_noise_01.mp3', { vol: 0.4, rate: 1.3 }); }
    else if (impact > 13) { body.play('land', 0.05); body.actions.get('land')!.timeScale = 1.7; }
  },
  vault() { body.play('vault', 0.06); audio.play('sfx_hit_03.mp3', { vol: 0.3, rate: 1.3 }); landDipV += 0.6; },
  slideStart() { audio.play('sfx_noise_01.mp3', { vol: 0.3 }); },
  wallStart() { audio.play('sfx_slam_05.mp3', { vol: 0.35, rate: 1.6 }); },
  boost() { fovKick = 12; flash = 0.25; audio.play('sfx_weird_02.mp3', { vol: 0.4, rate: 1.4 }); },
  orb() { score += 10 * mult; audio.play('sfx_bell_02.mp3', { vol: 0.12, rate: 1.6 + Math.random() * 0.4 }); },
  ring() { flash = 0.4; fovKick = 10; audio.play('sfx_glass_02.mp3', { vol: 0.5, rate: 1.2 }); },
  smash() { shock = 0.8; flash = 0.15; audio.play('sfx_explosion.mp3', { vol: 0.5, rate: 1.3 }); },
  die(reason: 'crash' | 'fall') {
    mode = 'dying'; modeT = 0; timeScale = 0.3;
    if (reason === 'crash') { shock = 2; flash = 0.6; audio.play('sfx_hit_03.mp3', { vol: 1 }); audio.play('sfx_slam_02.mp3', { vol: 0.9, rate: 0.8 }); body.play('dead', 0.05); }
    else { audio.play('sfx_weird_02.mp3', { vol: 0.5, rate: 0.5 }); body.play('fallDead', 0.2); }
    $('over-reason').textContent = reason === 'crash' ? 'WIPEOUT' : 'FREEFALL';
    deathCam.from.copy(camera.position);
    deathCam.fromQ.copy(camera.quaternion);
  },
};
function getEvents() { return events; }
const deathCam = { from: new THREE.Vector3(), fromQ: new THREE.Quaternion() };

// ---------------------------------------------------------------------------
// atmosphere
// ---------------------------------------------------------------------------
function biomeAt(z: number) {
  let b = 0;
  for (const m of track.marks) if (z <= m.z + 0.01) b = m.biome;
  return b;
}
const _c = new THREE.Color();
function applyAtmosphere(a: BiomeAtmosphere, b: BiomeAtmosphere, t: number, snap = false) {
  const fog = scene.fog as THREE.FogExp2;
  fog.color.copy(a.fog).lerp(b.fog, t);
  fog.density = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, t);
  scene.background = fog.color;
  sun.color.copy(a.sunColor).lerp(b.sunColor, t);
  sun.intensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
  const dir = a.sunDir.clone().lerp(b.sunDir, t).normalize();
  sun.userData.dir = dir;
  scene.environment = envFor(t < 0.5 ? a.sky : b.sky);
  scene.environmentIntensity = THREE.MathUtils.lerp(a.envIntensity, b.envIntensity, t);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(a.exposure, b.exposure, t);
  post.bloom.strength = THREE.MathUtils.lerp(a.bloom, b.bloom, t);
  post.bloom.threshold = THREE.MathUtils.lerp(a.bloomThreshold, b.bloomThreshold, t);
  const u = sky.mat.uniforms;
  u.texA.value = lib.sky[a.sky]; u.texB.value = lib.sky[b.sky]; u.mixAB.value = t;
  u.intA.value = a.skyIntensity; u.intB.value = b.skyIntensity;
  u.fogColor.value.copy(fog.color);
  _c.copy(a.speedTint).lerp(b.speedTint, t);
  if (snap) { /* nothing extra */ }
}

function updateAtmosphere(pz: number) {
  const marks = track.marks;
  let cur = 0, next: { z: number; biome: number } | null = null;
  for (const m of marks) { if (pz <= m.z + 0.01) cur = m.biome; else if (!next) next = m; }
  const A = kits[cur % kits.length].atmo;
  if (next) {
    const d = pz - next.z;
    const t = THREE.MathUtils.smoothstep(1 - d / 180, 0, 1);
    applyAtmosphere(A, kits[next.biome % kits.length].atmo, t);
  } else applyAtmosphere(A, A, 0);
  if (cur !== lastBiomeShown && mode === 'play') { lastBiomeShown = cur; showBanner(cur); }
}

// ---------------------------------------------------------------------------
// UI buttons
// ---------------------------------------------------------------------------
$('start').addEventListener('click', () => startRun());
$('retry').addEventListener('click', () => retry());
$('resume').addEventListener('click', () => { input.lock(); });
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && (mode === 'over' || mode === 'dying')) retry();
  if (e.code === 'KeyM') audio.toggleMute();
  if (e.code === 'Enter' && mode === 'title' && !$('start').classList.contains('hidden')) startRun();
});
input.onLockChange = (locked) => {
  if (!locked && (mode === 'play' || mode === 'intro')) { mode = 'paused'; $('pause').classList.remove('hidden'); }
  else if (locked && mode === 'paused') { mode = 'play'; $('pause').classList.add('hidden'); }
};

function startRun() {
  if (mode !== 'title') return;
  audio.resume(); audio.startLoops();
  input.lock();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  mode = 'intro'; modeT = 0; timeScale = 1;
  body.play('run', 0.3);
  player.speed = 6;
}

function retry() {
  $('over').classList.add('hidden');
  newRun();
  mode = 'title';
  startRunFromRetry();
}
function startRunFromRetry() {
  mode = 'title';
  startRun();
}

function gameOver() {
  mode = 'over';
  input.unlock();
  const d = Math.floor(dist());
  $('r-dist').textContent = `${d} m`;
  $('r-top').textContent = `${Math.round(player.topSpeed * 3.6)} km/h`;
  $('r-score').textContent = String(Math.round(score + d));
  const bi = biomeAt(player.pos.z);
  $('r-sector').textContent = `${String(bi + 1).padStart(2, '0')} ${kits[bi % kits.length].name}`;
  const nb = d > best;
  $('r-best').classList.toggle('hidden', !nb);
  if (nb) { best = d; safeSet('vr-best', String(d)); $('best').textContent = String(d); }
  $('over').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const eye = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const qTmp = new THREE.Quaternion();
const eTmp = new THREE.Euler(0, 0, 0, 'YXZ');
let camY = 0;

let simOnly = false;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(clock.getDelta(), 1 / 25);
  if (mode === 'loading') return;
  if (mode === 'paused') { audio.update(0, false, 0.3, true); post.composer.render(); return; }
  if (simOnly) return;
  tick(rawDt);
  post.composer.render();
}

function tick(rawDt: number) {
  const dt = rawDt * timeScale;
  elapsed += dt;
  modeT += rawDt;

  // ---- simulation
  const vb = baseSpeed(dist());
  if (mode === 'play' || mode === 'intro' || mode === 'dying') {
    if (mode === 'intro' && modeT > 0.9) { mode = 'play'; }
    player.update(dt, input, track, vb);
    // floating origin
    if (player.pos.z < -1200) {
      const s = 1200;
      track.shift(s); track.originDist += s;
      player.pos.z += s; camera.position.z += s; deathCam.from.z += s;
      lines.resetMotes();
    }
    track.update(player.pos.z);
  }
  for (const ch of track.chunks) for (const a of ch.animators) a(elapsed, dt);

  // ---- mouse look
  if ((input.locked || input.touch) && (mode === 'play' || mode === 'intro')) {
    lookYaw -= input.mouseDX * 0.0022;
    lookPitch -= input.mouseDY * 0.0022;
    lookYaw = THREE.MathUtils.clamp(lookYaw, -1.4, 1.4);
    lookPitch = THREE.MathUtils.clamp(lookPitch, -1.35, 1.2);
    if (Math.abs(input.mouseDX) + Math.abs(input.mouseDY) > 0) idleLook = 0; else idleLook += rawDt;
    if (idleLook > 0.6) { lookYaw = THREE.MathUtils.damp(lookYaw, 0, 1.5, rawDt); }
  }

  // ---- body
  body.root.position.copy(player.pos);
  if (player.alive) {
    const cur = body.currentName;
    if (player.state === 'slide') { if (cur !== 'roll') body.play('slide', 0.1); }
    else if (player.state === 'wallrun') body.play('wallrun', 0.12);
    else if (player.state === 'run') { if (cur !== 'land' && cur !== 'roll' && (mode !== 'title')) body.play('run', 0.15); }
    else if (player.state === 'air') { if (cur !== 'jumpStart' && cur !== 'vault' && cur !== 'air' && cur !== 'roll') body.play('air', 0.2); }
  }
  body.update(dt, player.speed, player.vx, player.state === 'wallrun' ? player.wallSide : 0);

  // ---- combo / multiplier
  comboT -= dt;
  if (comboT <= 0) mult = THREE.MathUtils.damp(mult, 1, 2, dt);

  // ---- camera
  body.eye(eye);
  // push eye slightly forward so the neck never covers the view
  const down = Math.max(0, -lookPitch);
  eye.z -= 0.13 - down * 0.2; eye.y += 0.06;
  landDipV += (-landDip * 180 - landDipV * 16) * rawDt;
  landDip += landDipV * rawDt;
  shock = Math.max(0, shock - rawDt * 2.5);
  const s01 = speed01();
  const shakeAmp = (0.0015 + s01 * s01 * 0.006) + shock * 0.02 + (player.overdrive > 0 ? 0.004 : 0);
  const t = elapsed;
  const shakeX = (Math.sin(t * 37.1) + Math.sin(t * 23.7 + 1.3)) * shakeAmp;
  const shakeY = (Math.sin(t * 41.3 + 0.7) + Math.sin(t * 29.1 + 2.1)) * shakeAmp;
  if (rollT >= 0) { rollT += rawDt / 0.62; if (rollT >= 1) rollT = -1; }
  const rollPitch = rollT >= 0 ? -Math.PI * 2 * THREE.MathUtils.smootherstep(rollT, 0, 1) : 0;

  if (mode === 'title') {
    const a = elapsed * 0.25;
    camera.position.set(player.pos.x + Math.sin(a) * 3.2, player.pos.y + 1.5, player.pos.z + Math.cos(a) * 3.2);
    camTarget.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
    camera.lookAt(camTarget);
    camera.fov = 55;
    body.setHeadVisible(true);
  } else if (mode === 'dying' || mode === 'over') {
    body.setHeadVisible(true);
    const k = THREE.MathUtils.smootherstep(Math.min(1, modeT / 0.9), 0, 1);
    if (player.deathReason === 'fall') camTarget.set(player.pos.x + 2, player.lastGroundY + 3, player.pos.z + 6);
    else camTarget.set(player.pos.x + 2.6, player.pos.y + 2.2, player.pos.z + 5.5);
    camera.position.copy(deathCam.from).lerp(camTarget, k);
    const look = new THREE.Vector3(player.pos.x, player.pos.y + 0.9, player.pos.z);
    const m = new THREE.Matrix4().lookAt(camera.position, look, new THREE.Vector3(0, 1, 0));
    qTmp.setFromRotationMatrix(m);
    camera.quaternion.copy(deathCam.fromQ).slerp(qTmp, k);
    timeScale = THREE.MathUtils.damp(timeScale, mode === 'over' ? 0.15 : 0.35, 3, rawDt);
    if (mode === 'dying' && modeT > 1.6) gameOver();
  } else {
    body.setHeadVisible(false);
    camY = THREE.MathUtils.damp(camY || eye.y, eye.y, 22, rawDt);
    const fp = new THREE.Vector3(eye.x + shakeX, camY + landDip + shakeY, eye.z);
    const roll = (player.state === 'wallrun' ? player.wallSide * 0.2 : 0) - player.vx * 0.006;
    eTmp.set(lookPitch + rollPitch + shakeY * 2, lookYaw + shakeX * 2, 0);
    const fpQ = new THREE.Quaternion().setFromEuler(eTmp);
    const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), camRoll = THREE.MathUtils.damp(camRoll, roll, 8, rawDt));
    fpQ.multiply(rq);
    if (mode === 'intro') {
      const k = THREE.MathUtils.smootherstep(Math.min(1, modeT / 0.9), 0, 1);
      camera.position.lerp(fp, k);
      camera.quaternion.slerp(fpQ, k);
    } else {
      camera.position.copy(fp);
      camera.quaternion.copy(fpQ);
    }
    const targetFov = 74 + s01 * 30 + fovKick + (player.overdrive > 0 ? 8 : 0) + (player.state === 'slide' ? 4 : 0);
    camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 4, rawDt);
  }
  if ((window as any).__tp) {
    const o = (window as any).__tp as number[];
    body.setHeadVisible(true); body.update(0, player.speed, 0, 0);
    camera.position.set(player.pos.x + o[0], player.pos.y + o[1], player.pos.z + o[2]);
    camera.lookAt(player.pos.x, player.pos.y + 0.9, player.pos.z); camera.fov = 50;
  }
  fovKick = THREE.MathUtils.damp(fovKick, 0, 3, rawDt);
  camera.updateProjectionMatrix();

  // ---- atmosphere / lights
  updateAtmosphere(player.pos.z);
  const sdir = (sun.userData.dir as THREE.Vector3) ?? new THREE.Vector3(0.5, 0.8, 0.3);
  const focus = new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z - 25);
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(sdir, 120);
  sky.mesh.position.copy(camera.position);

  // ---- speed FX
  const intensity = THREE.MathUtils.clamp((player.speed - 16) / 26, 0, 1) + (player.overdrive > 0 ? 0.4 : 0);
  lines.update(dt, camera.position, player.speed * (mode === 'title' ? 0 : 1), mode === 'play' || mode === 'intro' ? intensity : 0, _c);
  const u = post.speed.uniforms;
  const active = mode === 'play' || mode === 'intro';
  u.strength.value = THREE.MathUtils.damp(u.strength.value, active ? intensity * 0.55 + (fovKick > 1 ? 0.25 : 0) : 0, 6, rawDt);
  u.aberration.value = THREE.MathUtils.damp(u.aberration.value, active ? intensity * 0.8 + shock * 1.5 : 0, 6, rawDt);
  u.vignette.value = 0.35 + (active ? intensity * 0.25 : 0);
  u.tint.value.copy(player.overdrive > 0 ? new THREE.Color(1.0, 0.45, 0.7) : _c);
  u.tintAmt.value = THREE.MathUtils.damp(u.tintAmt.value, player.overdrive > 0 ? 0.9 : intensity * 0.25, 4, rawDt);
  flash = Math.max(0, flash - rawDt * 2.2);
  u.flash.value = flash * 0.5;
  hud.vignette.style.opacity = String(Math.max(0, Number(hud.vignette.style.opacity || 0) - rawDt * 1.5));

  // ---- audio
  audio.update(mode === 'title' ? 0.05 : s01, player.state === 'slide' && player.alive, mode === 'title' ? 0.35 : mode === 'over' ? 0.25 : 1, mode === 'dying' || mode === 'over');

  // ---- HUD
  if (mode === 'play' || mode === 'intro' || mode === 'dying') {
    hud.dist.textContent = String(Math.max(0, Math.floor(dist())));
    hud.speed.textContent = String(Math.round(player.speed * 3.6));
    (hud.speedFill as HTMLElement).style.width = `${Math.min(100, (player.speed * 3.6) / 2)}%`;
    hud.score.textContent = String(Math.round(score + Math.max(0, dist())));
    hud.mult.textContent = `x${mult.toFixed(1)}`;
    (hud.flowFill as HTMLElement).style.width = `${player.flow * 100}%`;
    hud.flow.classList.toggle('full', player.flow >= 1 && player.overdrive <= 0);
    hud.flow.classList.toggle('active', player.overdrive > 0);
  }

  input.endFrame();
}
let camRoll = 0;
requestAnimationFrame(frame);

// debug handle
(window as any).__THREE = THREE;
(window as any).__game = { get lib() { return lib; }, get player() { return player; }, get track() { return track; }, get body() { return body; }, camera, scene, renderer, get mode() { return mode; }, set mode(v: Mode) { mode = v; }, startRun, input,
  /** debug: advance simulation without rendering */
  simFn(sec: number, fn: (p: Player, t: Track, input: Input) => void) { simOnly = true; const n = Math.round(sec * 60); for (let i = 0; i < n && mode !== 'over'; i++) { fn(player, track, input); tick(1 / 60); } simOnly = false; return { mode, pos: player.pos.clone(), speed: player.speed, state: player.state, dist: dist(), reason: player.deathReason, hit: (player as any).lastHit }; },
  look(y: number, p: number) { lookYaw = y; lookPitch = p; idleLook = -1e9; },
  sim(sec: number, keys: string[] = []) { simOnly = true; for (const k of keys) input.keys.add(k); const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { for (const k of keys) if (i === 0) input.pressed.add(k); tick(1 / 60); } for (const k of keys) input.keys.delete(k); simOnly = false; return { mode, pos: player.pos.clone(), speed: player.speed, state: player.state, dist: dist() }; },
};
