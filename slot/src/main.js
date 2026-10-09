import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { Machine } from './machine.js';
import { AudioEngine } from './audio.js';
import { loadAssets } from './assets.js';
import { Cabinet, DIM } from './cabinet.js';
import { Lcd } from './lcd.js';
import { Haptics, Shaker, Coins, Sparks } from './fx.js';
import { Director } from './director.js';
import { Story } from './story.js';
import { LcdStage } from './lcd3d.js';
import { hapticTrigger } from '../assets/lib/ios-haptics/ios-haptics.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cfg = CONFIG;
// URL ハッシュのトークン (#lite / #debug / #zoom / 組み合わせは #debug-lite)
const HASH = new Set(location.hash.slice(1).split(/[-_.]/).filter(Boolean));
if (HASH.has('lite')) { cfg.render.hall = false; cfg.render.neighbors = false; cfg.render.pixelRatioMax = 1; }
const TOUCH = matchMedia('(hover: none)').matches;
if (TOUCH) { cfg.render.pixelRatioMax = Math.min(cfg.render.pixelRatioMax, 1.5); cfg.render.neighbors = cfg.render.neighbors && 'near'; cfg.render.mobile = true; }
const $ = (id) => document.getElementById(id);
const STORE = 'slot.v2';

// ------------------------------------------------------------------
// renderer / scene
// ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.render.pixelRatioMax));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = cfg.render.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);
hapticTrigger($('app'));
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  report(new Error('描画が中断されました (メモリ不足の可能性)。画面右上の ↻ で再読み込みしてください'));
  $('btn-reload').hidden = false;
}); // iPhone: 筐体のボタンを押した瞬間に本体が“コツッ”と鳴る

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07030d);
scene.fog = new THREE.FogExp2(0x07030d, 0.11);
const camera = new THREE.PerspectiveCamera(cfg.render.camera.fov, innerWidth / innerHeight, 0.05, 60);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), cfg.effects.bloom.strength, cfg.effects.bloom.radius, cfg.effects.bloom.threshold);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
const bloom = { kick: 0 };

const audio = new AudioEngine(cfg);
const haptics = new Haptics(cfg);
const shaker = new Shaker(cfg);
const machine = new Machine(cfg);
if (cfg.play.persist) { try { const s = localStorage.getItem(STORE); if (s) machine.restore(s); } catch { /* storage blocked */ } }
// アーティファクトのビューアで再公開されたときに持ちメダル等を引き継ぐ
if (window.claude?.hot?.data?.machine) machine.restore(window.claude.hot.data.machine);
window.claude?.hot?.snapshot?.(() => ({ machine: machine.serialize() }));

// カメラリグ (画面比に合わせて筐体をフィット + ポインタ視差 + 演出ズーム)
const rig = { zoom: 0, z: 0, px: 0, py: 0, tx: 0, ty: 0, base: { pos: new THREE.Vector3(), target: new THREE.Vector3() } };
function fitCamera() {
  const c = cfg.render.camera;
  const aspect = innerWidth / innerHeight;
  const tanH = Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
  const portrait = aspect < 0.9;
  const halfH = portrait ? 0.7 : 0.82, halfW = portrait ? 0.47 : 0.75;
  const d = Math.max(halfH / tanH, halfW / (tanH * aspect));
  const ty = portrait ? 1.42 : c.target[1] + 0.24;
  rig.touch = matchMedia('(hover: none)').matches;

  rig.dist = d;
  rig.ty0 = ty;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
function updateRig(dt) {
  rig.z += (rig.zoom - rig.z) * Math.min(1, dt * 4);
  rig.px += (rig.tx - rig.px) * Math.min(1, dt * 3);
  rig.py += (rig.ty - rig.py) * Math.min(1, dt * 3);
  const par = cfg.render.camera.parallax;
  const d = rig.dist * (1 - rig.z * 0.45);
  const focusY = THREE.MathUtils.lerp(rig.ty0, DIM.reelY, Math.max(0, rig.z));
  rig.base.target.set(0, focusY, 0);
  rig.base.pos.set(rig.px * par, focusY + 0.12 + rig.py * par * 0.6, d);
  shaker.apply(camera, rig.base, dt);
}

// ------------------------------------------------------------------
// boot
// ------------------------------------------------------------------
let cab, lcd, coins, sparks, director, story, stage;
const loadBar = $('loadbar');
async function boot() {
  let pA = 0, pB = 0;
  const prog = () => { loadBar.style.width = `${Math.round((pA * 0.7 + pB * 0.3) * 100)}%`; };
  const [assets] = await Promise.all([
    loadAssets(cfg, renderer, (p) => { pA = p; prog(); }),
    audio.load({ ...cfg.assets.sfx, ...cfg.assets.bgm }, (p) => { pB = p; prog(); }),
  ]);
  scene.environment = assets.env || null;
  scene.environmentIntensity = cfg.render.envIntensity;

  cab = new Cabinet(cfg, assets, machine.logic);
  scene.add(cab.group);
  buildRoom(assets);
  stage = new LcdStage(renderer, cfg, assets.story);
  cab.setLcdStage(stage.texture);
  lcd = new Lcd(cab.lcdCanvas, cab.lcdTex, assets.images, cfg);
  coins = new Coins(scene, assets.models.coin, cab.tray);
  sparks = new Sparks(scene);
  director = new Director({ cfg, cab, lcd, audio, haptics, shaker, coins, sparks, machine, rig, bloom });
  story = new Story({ cfg, lcd, stage, audio, haptics, shaker, machine, director });
  director.story = story;
  director.onPayTick = (n) => { payShown = n; refreshHud(); };
  if (machine.carried && machine.noticed) { cab.lights.lampTarget = 1; cab.lights.rainbow = 1; }
  if (machine.mode !== 'normal') { lcd.base = 'bonus'; cab.lights.mode = 'rainbow'; story.bonusScene(true); }
  if (machine.carried && machine.noticed) lcd.prompt = '7 を狙え';
  if (HASH.has('zoom')) rig.zoom = 0.6;
  fitCamera();
  refreshHud();
  setupDebug();
  $('loading').classList.add('ready');
  $('startbtn').onclick = () => {
    $('loading').classList.add('gone');
    haptics.vibrate([30]);
    audio.resume().then(() => {
      audio.play('ocean', { loop: true, gain: 0.12 }); // 波音 (環境音)
      if (machine.mode !== 'normal') audio.bgm(cfg.bonus[machine.mode].bgm);
    }).catch((e) => console.warn('audio resume', e));
  };
  renderer.setAnimationLoop(frame);
  window.__slot = { THREE, cab, lcd, machine, director, story, stage, scene, camera, rig, cfg, force: (f) => { forcedFlag = f; }, get state() { return state; } };
}

function buildRoom(assets) {
  // 床 (Carpet016 をワインレッドに染めた絨毯)
  const T = assets.textures.carpet || {};
  const rep = (t) => { if (!t) return t; const c = t.clone(); c.repeat.set(14, 14); c.needsUpdate = true; return c; };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({
    color: 0x5a1024, map: rep(T.map), normalMap: rep(T.normalMap), roughnessMap: rep(T.roughnessMap), roughness: 1,
  }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // 照明
  scene.add(new THREE.HemisphereLight(0x8a7cff, 0x200810, 0.12));
  const key = new THREE.SpotLight(0xfff0e0, 3.2, 7, 0.5, 0.6, 1.5);
  key.position.set(0.6, 3.6, 2.4);
  key.target.position.set(0, 1.3, 0);
  scene.add(key, key.target);
  const rim = new THREE.SpotLight(0x5a7dff, 2.5, 6, 0.5, 0.8, 1.5);
  rim.position.set(-2.4, 2.8, -0.6);
  rim.target.position.set(0, 1.4, 0);
  scene.add(rim, rim.target);
  if (!assets.hall.length) return;
  // 島 (台下カウンター)
  const leather = cab.m.leather;
  const island = new THREE.Mesh(new RoundedBoxGeometry(7.2, DIM.bodyBottom, 0.8, 4, 0.02), leather);
  island.position.set(0, DIM.bodyBottom / 2, -0.08);
  scene.add(island);
  const counter = new THREE.Mesh(new RoundedBoxGeometry(7.2, 0.03, 0.86, 3, 0.01), cab.m.darkMetal);
  counter.position.set(0, DIM.bodyBottom - 0.01, -0.06);
  scene.add(counter);
  // 隣台: 自台のクローンを暗く (照明演出は自台のみ)
  const dimMats = new Map();
  const lcdSnap = document.createElement('canvas');
  lcdSnap.width = cab.lcdCanvas.width; lcdSnap.height = cab.lcdCanvas.height;
  const snapTex = new THREE.CanvasTexture(lcdSnap);
  snapTex.colorSpace = THREE.SRGBColorSpace;
  const reelMats = new Set(cab.reels.map((r) => r.mat));
  const dim = (m) => {
    if (!dimMats.has(m)) {
      const c = m.clone();
      if (m.map === cab.lcdTex) c.map = snapTex;
      if (c.color) c.color.multiplyScalar(0.4);
      if ('emissiveIntensity' in c) c.emissiveIntensity = Math.min(c.emissiveIntensity, 0.22);
      if (reelMats.has(m)) c.emissiveIntensity = 0.5;
      dimMats.set(m, c);
    }
    return dimMats.get(m);
  };
  // 隣台の液晶は待機画面の静止画
  setTimeout(() => { lcdSnap.getContext('2d').drawImage(cab.lcdCanvas, 0, 0); snapTex.needsUpdate = true; }, 300);
  for (const x of cfg.render.neighbors === false ? [] : cfg.render.neighbors === 'near' ? [-0.98, 0.98] : [-0.98, 0.98, -1.96, 1.96]) {
    const n = cab.group.clone(true);
    n.traverse((o) => {
      if (o.isLight) o.visible = false;
      if (o.isMesh && reelMats.has(o.material)) o.rotation.x = Math.floor(Math.random() * 21) * (Math.PI * 2 / 21) + Math.PI * 2 / 42;
      if (o.isMesh || o.isPoints) o.material = Array.isArray(o.material) ? o.material.map(dim) : dim(o.material);
      if (o.isInstancedMesh) o.visible = false;
      o.userData = {};
    });
    n.position.x = x;
    scene.add(n);
  }
  if (!assets.hall.length) return;
  // 奥のアーケードホール (Kenney Mini Arcade)
  const colors = [0xff2fa0, 0x2fd0ff, 0xffc02f, 0x8a2fff];
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let i = -3; i <= 3; i++) {
      const src = assets.hall[k++ % assets.hall.length];
      const m = src.clone();
      m.scale.setScalar(2.3);
      m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.5); } });
      m.position.set(i * 1.6 + (row % 2) * 0.6, 0, -3.2 - row * 2.6);
      m.rotation.y = (row % 2 ? Math.PI : 0) + (Math.random() - 0.5) * 0.2;
      scene.add(m);
    }
    const l = new THREE.PointLight(colors[row % colors.length], 2.2, 7, 2);
    l.position.set((row - 1) * 2.5, 2.6, -3.5 - row * 2.5);
    scene.add(l);
  }
}

// ------------------------------------------------------------------
// ゲーム進行
// ------------------------------------------------------------------
let state = 'idle'; // idle | wait | busy | spinning | settling
let stops = [null, null, null];
let flag = null, plan = null;
let lastStart = -1e9;
let spinSnd = null;
let payShown = 0;
let forcedFlag = null;

function save() {
  if (!cfg.play.persist) return;
  try { localStorage.setItem(STORE, machine.serialize()); } catch { /* storage blocked */ }
}

function refreshHud() {
  const s = machine.stats;
  const diff = machine.medals - cfg.play.startMedals - (s.lent || 0);
  $('h-medals').textContent = machine.medals;
  $('h-diff').textContent = (diff >= 0 ? '+' : '') + diff;
  $('h-diff').className = diff >= 0 ? 'pos' : 'neg';
  $('h-games').textContent = s.sinceBonus;
  $('h-big').textContent = s.big;
  $('h-reg').textContent = s.reg;
  $('h-total').textContent = s.games;
  if (lcd) Object.assign(lcd.info, { games: s.games, big: s.big, reg: s.reg, since: s.sinceBonus, medals: machine.medals, diff });
  if (lcd && lcd.bonus && machine.mode !== 'normal') Object.assign(lcd.bonus, { paid: machine.bonusPaid, games: machine.bonusGames });
  if (cab) cab.setSegments(Math.min(machine.medals, 99999), payShown, s.sinceBonus);
}

function doBet() {
  if (state !== 'idle' || machine.credit >= cfg.bet) return false;
  if (!machine.canBet()) {
    // 貸出 (フリープレイ)
    machine.medals += cfg.play.lendAmount;
    machine.stats.lent = (machine.stats.lent || 0) + cfg.play.lendAmount;
    lcd.play('win', { text: `メダル貸出 +${cfg.play.lendAmount}`, color: '#9fd8ff', dur: 1.4 });
    audio.play('medal_out', { gain: 0.7 });
  }
  const wasReplay = machine.replayPending;
  machine.bet();
  cab.lights.betLed = false;
  payShown = 0;
  if (!wasReplay) {
    for (let i = 0; i < 3; i++) audio.play('medal_in', { delay: i * 0.06, gain: 0.5, rate: 1.05 + i * 0.05 });
  }
  audio.play('button', { gain: 0.6 });
  haptics.vibrate('button');
  refreshHud();
  return true;
}

let stateSince = performance.now();
function setState(v) { state = v; stateSince = performance.now(); }

async function pullLever() {
  if (state !== 'idle') return;
  if (machine.credit < cfg.bet && !doBet()) return;
  setState('busy');
  try {
    cab.lever.held = true;
    audio.play('lever', { gain: 0.9 });
    audio.play('lever_click', { gain: 0.6 });
    haptics.vibrate('lever');
    shaker.punch(0, -0.004, 0);
    setTimeout(() => { cab.lever.held = false; }, 140);
    // ウェイト (1G 最短時間)
    const remain = cfg.reels.minGameMs - (performance.now() - lastStart);
    if (remain > 0) { lcd.play('win', { text: 'WAIT', color: '#888', dur: remain / 1000 }); await sleep(remain); }
    lastStart = performance.now();

    flag = machine.start(forcedFlag);
    forcedFlag = null;
    if (gui) { guiState.force = 'none'; gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
    plan = director.plan(flag);
    stops = [null, null, null];
    if (machine.mode !== 'normal' && lcd.bonus) lcd.bonus.games = machine.bonusGames + 1;
    if (machine.mode !== 'normal' && !lcd.bonus) lcd.bonus = { type: machine.mode, paid: 0, max: cfg.bonus[machine.mode].maxPay, games: 1 };
    try { await director.onLever(flag, plan); } catch (e) { report(e); }
  } catch (e) {
    report(e);
    if (!flag) { setState('idle'); return; }
  }
  cab.startReels();
  spinSnd = audio.play('reel_spin', { loop: true, gain: 0.22 });
  setState('spinning');
  refreshHud();
  setTimeout(() => {
    cab.lights.stopLed = [plan?.stopLed || '#3cf', plan?.stopLed || '#3cf', plan?.stopLed || '#3cf'];
    cab.lights.stopLedOn = [true, true, true];
  }, cfg.reels.spinUpMs);
}

let lastStopAt = 0;
function pressStop(i) {
  if (state !== 'spinning' || stops[i] != null || !cab.canStop(i)) return;
  const press = cab.pressPos(i);
  const target = machine.decideStop(i, press, stops);
  stops[i] = target;
  const b = cab.stopButtons[i];
  b.down = true;
  setTimeout(() => { b.down = false; }, 130);
  cab.lights.stopLedOn[i] = false;
  audio.play('button', { gain: 0.7, rate: 0.95 + i * 0.05 });
  haptics.vibrate('stop');
  const stoppedNow = stops.filter((s) => s != null).length;
  cab.stopReel(i, target, () => {
    // ここは描画ループ内で呼ばれる。例外でループを止めないよう必ず握る
    lastStopAt = performance.now();
    try {
      audio.play('reel_stop', { gain: 1.0, rate: 0.92 + Math.random() * 0.12 });
      shaker.punch(0, -0.0035, 0);
      director.onStop(stoppedNow);
      if (stoppedNow === 2) director.onSecondStop(stops, flag);
    } catch (e) { report(e); }
    if (stoppedNow === 3) settle();
  });
}

async function settle() {
  if (state === 'settling') return;
  setState('settling');
  spinSnd?.stop(0.08);
  spinSnd = null;
  let res = null;
  try {
    res = machine.settle(stops);
    if (res.bonusStart) {
      lcd.bonus = { type: res.bonusStart, paid: 0, max: cfg.bonus[res.bonusStart].maxPay, games: 0 };
    }
    refreshHud();
    await director.onSettle(res, flag);
  } catch (e) { report(e); }
  if (res?.bonusEnd) lcd.bonus = null;
  save();
  refreshHud();
  setState('idle');
  cab.lights.betLed = true;
  if (machine.replayPending || cfg.play.autoBet) doBet();
}

// 進行が止まったときの保険 (例外・取りこぼしたコールバック)
setInterval(() => {
  if (!cab) return;
  const now = performance.now();
  if (state === 'spinning' && stops.every((v) => v != null) && cab.reels.every((r) => r.state === 'stopped') && now - lastStopAt > 2500) settle();
  if ((state === 'busy' || state === 'settling') && now - stateSince > 30000) {
    report(new Error(`進行が ${state} のまま止まったため復帰しました`));
    director.pushResolve?.();
    cab.lights.pushLed = 0;
    lcd.kill('push');
    setState('idle');
    cab.lights.betLed = true;
  }
}, 1000);

// 画面にエラーを表示 (不具合報告用。スクリーンショットで内容が分かるように)
function report(e) {
  console.error(e);
  const el = $('err');
  if (!el) return;
  const msg = (e && (e.message || e.reason?.message || String(e))) || 'unknown';
  el.textContent = `⚠ ${msg}`.slice(0, 180);
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 8000);
}
addEventListener('error', (e) => report(e.error || e.message));
addEventListener('unhandledrejection', (e) => report(e.reason));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------
// 入力
// ------------------------------------------------------------------
const keyMap = {
  Space: 'lever', Enter: 'lever', ArrowUp: 'lever', KeyS: 'lever',
  KeyB: 'bet', ShiftLeft: 'bet', ShiftRight: 'bet',
  Digit1: 'stop0', Digit2: 'stop1', Digit3: 'stop2',
  KeyZ: 'stop0', KeyX: 'stop1', KeyC: 'stop2',
  KeyJ: 'stop0', KeyK: 'stop1', KeyL: 'stop2',
  ArrowLeft: 'stop0', ArrowDown: 'stop1', ArrowRight: 'stop2',
};
function act(a) {
  if (!cab || !$('loading').classList.contains('gone')) return;
  if (a === 'lever') pullLever();
  else if (a === 'bet') doBet();
  else if (a === 'push') { if (director.pressPush()) { cab.push.down = true; setTimeout(() => { cab.push.down = false; }, 140); } }
  else if (a.startsWith('stop')) pressStop(+a[4]);
}
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyG') { toggleGui(); return; }
  if (e.code === 'KeyP' || ((e.code === 'Space' || e.code === 'Enter') && director?.pushResolve)) { e.preventDefault(); act('push'); return; }
  const a = keyMap[e.code];
  if (a) { e.preventDefault(); act(a); }
});

// 筐体のボタン・レバーを直接タップ / クリック。レバーは下へドラッグしても引ける
const ray = new THREE.Raycaster();
const pick = (e) => {
  const v = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(v, camera);
  return ray.intersectObjects(cab.pickables, false)[0]?.object.userData.action;
};
let leverDrag = null;
const appEl = $('app');
appEl.addEventListener('pointerdown', (e) => {
  if (!cab) return;
  const a = pick(e);
  if (!a) return;
  if (a === 'lever') {
    leverDrag = { id: e.pointerId, y0: e.clientY, t0: performance.now(), fired: false };
    return;
  }
  act(a);
});
addEventListener('pointermove', (e) => {
  if (!leverDrag || e.pointerId !== leverDrag.id) return;
  const d = Math.max(0, Math.min(1, (e.clientY - leverDrag.y0) / 70));
  cab.lever.drag = d;
  if (d > 0.65 && !leverDrag.fired) { leverDrag.fired = true; pullLever(); }
});
const endLever = (e) => {
  if (!leverDrag || e.pointerId !== leverDrag.id) return;
  if (!leverDrag.fired) pullLever(); // タップでも引ける
  cab.lever.drag = 0;
  leverDrag = null;
};
addEventListener('pointerup', endLever);
addEventListener('pointercancel', endLever);
addEventListener('pointermove', (e) => {
  rig.tx = (e.clientX / innerWidth) * 2 - 1;
  rig.ty = -((e.clientY / innerHeight) * 2 - 1);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloomPass.resolution.set(innerWidth / 2, innerHeight / 2);
  fitCamera();
});
$('btn-sound').onclick = () => {
  audio.enabled = !audio.enabled;
  if (!audio.enabled) audio.stopBgm(0.1); else if (machine.mode !== 'normal') audio.bgm(cfg.bonus[machine.mode].bgm);
  $('btn-sound').classList.toggle('off', !audio.enabled);
};
$('btn-vib').onclick = () => {
  cfg.effects.haptics = !cfg.effects.haptics;
  $('btn-vib').classList.toggle('off', !cfg.effects.haptics);
};
$('btn-gear').onclick = () => toggleGui();
$('btn-reload').onclick = () => location.reload();

// ------------------------------------------------------------------
// デバッグ / チューニングパネル (lil-gui)
// ------------------------------------------------------------------
let gui = null;
const guiState = { force: 'none' };
async function setupDebug() {
  if (HASH.has('debug')) await toggleGui();
}
async function toggleGui() {
  if (gui) { gui.domElement.style.display = gui.domElement.style.display === 'none' ? '' : 'none'; return; }
  const { GUI } = await import('../assets/lib/lil-gui/lil-gui.esm.min.js');
  gui = new GUI({ title: 'SLOT — TUNING' });
  const g1 = gui.addFolder('抽選');
  g1.add(cfg, 'setting', [1, 2, 3, 4, 5, 6]).name('設定');
  g1.add(guiState, 'force', ['none', 'BIG', 'REG', 'CHERRY+BIG', 'SUIKA+BIG', 'CHERRY+REG', 'BELL', 'REPLAY', 'SUIKA', 'CHERRY', 'NONE']).name('次G 強制フラグ')
    .onChange((v) => { forcedFlag = v === 'none' ? null : v; });
  g1.add(cfg.play, 'assistAlignAfterNotice').name('告知後 目押しアシスト');
  g1.add(cfg.reels, 'maxSlip', 0, 4, 1).name('最大滑りコマ').onChange(() => { machine.logic._ctx = new Map(); });
  const g2 = gui.addFolder('演出');
  g2.add(story, 'force', ['auto', 'none', 'cutin', 'barrels', 'chest', 'battle', 'final', 'map', 'freeze', 'zone']).name('シナリオ 強制');
  g2.add(director.debugForce, 'freeze').name('ボーナス時 必ずフリーズ');
  g2.add(cfg.story, 'revival', 0, 1, 0.01).name('逆転 発生率');
  g2.add(cfg.effects, 'reachSlowFactor', 0.1, 1, 0.05).name('テンパイ時 減速');
  g2.add(cfg.effects, 'haptics').name('振動');
  const g3 = gui.addFolder('リール');
  g3.add(cfg.reels, 'rpm', 30, 140, 1);
  g3.add(cfg.reels, 'bounce', 0, 0.5, 0.01).name('停止バウンド');
  g3.add(cfg.reels, 'bounceMs', 60, 600, 10);
  g3.add(cfg.reels, 'minGameMs', 0, 4100, 100).name('ウェイト ms');
  g3.add(cfg.reels, 'backlight', 0.2, 3, 0.05).name('バックライト');
  const g4 = gui.addFolder('レンダリング / 音');
  g4.add(cfg.effects.bloom, 'strength', 0, 2, 0.01).name('bloom');
  g4.add(cfg.effects.bloom, 'threshold', 0, 1, 0.01).name('bloom 閾値');
  g4.add(cfg.render, 'exposure', 0.3, 2, 0.01).onChange((v) => { renderer.toneMappingExposure = v; });
  g4.add(cfg.render, 'envIntensity', 0, 3, 0.05).name('HDRI 反射').onChange((v) => { scene.environmentIntensity = v; });
  for (const k of ['master', 'sfx', 'bgm']) g4.add(cfg.audio, k, 0, 1, 0.01).onChange(() => audio.setVolumes(cfg.audio));
  const g5 = gui.addFolder('データ');
  g5.add({ reset: () => { try { localStorage.removeItem(STORE); } catch { /* noop */ } location.reload(); } }, 'reset').name('データリセット');
  g5.add({ add: () => { machine.medals += 1000; refreshHud(); } }, 'add').name('+1000 枚');
  g1.open(); g2.open();
}

// ------------------------------------------------------------------
// loop
// ------------------------------------------------------------------
const clock = new THREE.Clock();
let frameErr = 0;
function frame() {
  try { frameBody(); } catch (e) { if (frameErr++ < 3) report(e); }
}
function frameBody() {
  const dt = Math.min(0.05, clock.getDelta());
  cab.update(dt);
  lcd.update(dt);
  stage.update(dt);
  stage.render();
  coins.update(dt);
  sparks.update(dt);
  bloom.kick = Math.max(0, bloom.kick - dt * 1.4);
  bloomPass.strength = cfg.effects.bloom.strength + bloom.kick * 0.45;
  bloomPass.threshold = cfg.effects.bloom.threshold;
  if (cab.lights.rainbow > 0 && machine.mode === 'normal' && !machine.carried) cab.lights.rainbow = 0;
  updateRig(dt);
  composer.render();
}

boot().catch((e) => {
  console.error(e);
  $('loadmsg').textContent = '読み込みに失敗しました: ' + e.message;
});
