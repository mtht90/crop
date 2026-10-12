// 起動・描画ループ・入力・時刻による光の変化
import * as THREE from 'three';
import { A, loadAll } from './assets.js';
import { buildTown, loadTownData, T, updateWorld, preloadAround, setDetail } from './town.js';
import { Van } from './van.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { G, initGame, update, onKey, onMouse, requestLock, onPointerUnlock } from './game.js';
import { setMapView } from './ui.js';
import { loadPeople } from './people.js';
import { initTouch, IS_TOUCH } from './touch.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 6500);
scene.add(camera);
const backCam = new THREE.PerspectiveCamera(100, 16 / 9, 0.1, 80);

const sun = new THREE.DirectionalLight(0xfff1e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55; sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x5a5a48, 0.35);
scene.add(hemi);
scene.fog = new THREE.Fog(0xc9d6e2, 250, 3000);

function setLoading(p, label) {
  document.getElementById('load-bar').style.width = Math.round(p * 100) + '%';
  document.getElementById('load-label').textContent = label || '';
}

async function boot() {
  try {
    await Promise.race([Promise.all([document.fonts.load('700 40px "Zen Kaku Gothic New"'), document.fonts.load('600 40px "Barlow Semi Condensed"')]), new Promise(r => setTimeout(r, 2500))]);
  } catch (e) { /* フォントがなくても続行 */ }
  await loadTownData((p) => setLoading(p * 0.1, '地図データ'));
  await loadAll(renderer, (p, l) => setLoading(p * 0.7, '町の素材 ' + l));
  await loadPeople((p) => setLoading(0.7 + p * 0.22, '町の人たち'));
  scene.environment = A.envMap;
  scene.background = A.sky;
  setLoading(0.95, '町を組み立てています…');
  await new Promise(r => setTimeout(r, 30));
  buildTown(scene);
  setMapView();
  setDetail(IS_TOUCH ? 'low' : 'high');
  await preloadAround(T.depot.center.x, T.depot.center.z, (p) => setLoading(0.95 + p * 0.05, '町を組み立てています… ' + Math.round(p * 100) + '%'));
  const van = new Van(scene);
  const player = new Player(camera);
  const traffic = new Traffic(scene);
  initGame({ scene, camera, van, player, traffic, renderer, sun, hemi });
  initTouch();
  document.getElementById('loading').classList.add('done');
  window.__aoba = { G, T, van, player, camera, scene, renderer, THREE }; // 動作確認用
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    // 作る範囲の中心はカメラ（運転中は少し先読み）
    const ahead = G.mode === 'drive' ? van.speed * 2.5 : 0;
    const fx = camera.position.x + van.forward.x * ahead, fz = camera.position.z + van.forward.z * ahead;
    updateWorld(fx, fz, 6);
    applyDaylight(van, player);
    render(van);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// 時刻に合わせて太陽・空・霧を変える
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function applyDaylight(van, player) {
  const t = G.day ? G.day.time / 60 : 10;
  const k = THREE.MathUtils.clamp((t - 6) / 13, 0, 1); // 6時〜19時
  const elev = Math.sin(k * Math.PI) * 1.05 + 0.02;      // 太陽の高さ
  const az = -Math.PI * 0.5 + k * Math.PI;                // 東から西へ
  const dusk = THREE.MathUtils.clamp((t - 16.5) / 2.5, 0, 1);
  const night = THREE.MathUtils.clamp((t - 18.6) / 1.2, 0, 1);
  const focus = G.mode === 'drive' ? new THREE.Vector3(van.x, 0, van.z) : new THREE.Vector3(player.x, 0, player.z);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.max(0.08, Math.sin(elev)), -Math.cos(az) * Math.cos(elev) * 0.6 + 0.4).normalize();
  sun.position.copy(focus).addScaledVector(dir, 120);
  sun.target.position.copy(focus);
  sun.intensity = THREE.MathUtils.lerp(2.7, 0.9, dusk) * (1 - night * 0.92);
  sun.color.copy(_c1.set(0xfff1e0).lerp(_c2.set(0xff9a55), dusk));
  hemi.intensity = THREE.MathUtils.lerp(0.35, 0.18, night);
  scene.environmentIntensity = THREE.MathUtils.lerp(1, 0.35, dusk) * (1 - night * 0.75);
  scene.backgroundIntensity = THREE.MathUtils.lerp(1, 0.45, dusk) * (1 - night * 0.82);
  scene.fog.color.copy(_c1.set(0xc9d6e2).lerp(_c2.set(0xd8a37e), dusk * (1 - night)).lerp(_c2.set(0x1b2230), night));
}

let frame = 0;
function render(van) {
  frame++;
  // ドアミラー（運転席視点のときだけ、2フレームに1回）
  if (G.mode === 'drive' && G.view === 'cab' && G.save.settings.mirrors && frame % 2 === 0) van.renderMirrors(renderer, scene);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
  // バックカメラ
  if (G.save && G.save.upgrades.camera && G.mode === 'drive' && van.speed < -0.05) {
    const w = Math.round(window.innerWidth * 0.26), h = Math.round(w * 9 / 16);
    const x = Math.round((window.innerWidth - w) / 2), y = 14;
    const p = van.worldPoint(0, -1.65);
    backCam.position.set(p.x, 1.25, p.z);
    const q = van.worldPoint(0, -6);
    backCam.lookAt(q.x, 0, q.z);
    backCam.aspect = w / h; backCam.updateProjectionMatrix();
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
    renderer.render(scene, backCam);
    renderer.setScissorTest(false);
  }
}

// ---------------- 入力 ----------------
const block = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ']);
window.addEventListener('keydown', (e) => {
  if (block.has(e.code)) e.preventDefault();
  if (e.repeat) { G.keys[e.code] = true; return; }
  onKey(e.code, true);
});
window.addEventListener('keyup', (e) => { onKey(e.code, false); });
window.addEventListener('blur', () => { for (const k of Object.keys(G.keys)) G.keys[k] = false; });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) onMouse(e.movementX, e.movementY, e.buttons);
});
canvas.addEventListener('mousedown', (e) => { if (e.button === 2) G.keys.mouseRight = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 2) G.keys.mouseRight = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('click', () => { if (!G.overlay && !IS_TOUCH) requestLock(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) setTimeout(onPointerUnlock, 60);
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

boot().catch((e) => {
  console.error(e);
  document.getElementById('load-label').textContent = '読み込みに失敗しました：' + e.message + '（ローカルサーバーで開いているか確認してください）';
});
