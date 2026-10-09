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
import { Haptics, Shaker, Coins, Sparks } from './fx.js';
import { Director } from './director.js';
import { Neighbor } from './neighbors.js';
import { PachinkoGame } from './pachinko/game.js';
import { hapticTrigger } from '../assets/lib/ios-haptics/ios-haptics.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cfg = CONFIG;
// URL ハッシュのトークン (#lite / #debug / #zoom / 組み合わせは #debug-lite)
const HASH = new Set(location.hash.slice(1).split(/[-_.]/).filter(Boolean));
if (HASH.has('lite')) { cfg.render.hall = false; cfg.render.neighbors = false; cfg.render.pixelRatioMax = 1; }
const TOUCH = matchMedia('(hover: none)').matches;
if (TOUCH) { cfg.render.pixelRatioMax = Math.min(cfg.render.pixelRatioMax, 1.5); cfg.render.neighbors = cfg.render.neighbors && 'near'; cfg.render.mobile = true; }
const $ = (id) => document.getElementById(id);
const STORE = 'slot.juggler.v1';

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
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
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
const rig = { cx: 0, zoom: 0, z: 0, px: 0, py: 0, tx: 0, ty: 0, base: { pos: new THREE.Vector3(), target: new THREE.Vector3() } };
function fitCamera() {
  const c = cfg.render.camera;
  const aspect = innerWidth / innerHeight;
  const tanH = Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
  const portrait = aspect < 0.9;
  const halfH = portrait ? 0.74 : 0.9, halfW = portrait ? (cfg.render.neighbors ? cfg.render.portraitHalfW : 0.57) : 0.8; // 台上のデータカウンターまで収める
  rig.cx = portrait && !cfg.render.neighbors ? 0.07 : 0; // 縦画面は右の千円入れ機まで収める
  const d = Math.max(halfH / tanH, halfW / (tanH * aspect));
  const ty = portrait ? 1.8 : c.target[1] + 0.52; // 縦画面は HUD の下にカウンターが来るように
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
  rig.base.target.set(rig.cx, focusY, 0);
  rig.base.pos.set(rig.cx + rig.px * par, focusY + 0.12 + rig.py * par * 0.6, d);
  shaker.apply(camera, rig.base, dt);
}

// ------------------------------------------------------------------
// boot
// ------------------------------------------------------------------
let cab, coins, sparks, director;
let bootAssets = null;
// スロット / パチンコの切り替え
let mode = 'slot';
let pgame = null;
const curBgm = () => (mode === 'pachinko' ? [pgame.bgmName(), cfg.audio.normalBgm] : machine.mode !== 'normal' ? [cfg.bonus[machine.mode].bgm, 1] : ['normal', cfg.audio.normalBgm]);
function playBgm() { const [n, g] = curBgm(); audio.bgm(n, { gain: g }); }
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

  bootAssets = assets;
  cab = new Cabinet(cfg, assets, machine.logic);
  scene.add(cab.group);
  buildRoom(assets);
  coins = new Coins(scene, assets.models.coin, cab.tray);
  sparks = new Sparks(scene);
  director = new Director({ cfg, cab, audio, haptics, shaker, coins, sparks, machine, rig, bloom });
  director.onPayTick = (n) => { payShown = n; refreshHud(); };
  director.onBonusStart = (type) => { cab.setCounter({ ...machine.stats, graph: machine.stats.graph }, type); };
  // 告知済み・ボーナス中で再開したときの状態復元
  if (machine.carried && machine.noticed) { cab.lights.lampTarget = 1; cab.lights.rainbow = 1; cab.screen.set('lit'); }
  if (machine.mode !== 'normal') {
    cab.lights.mode = 'rainbow';
    cab.screen.set('bonus', { type: machine.mode, max: cfg.bonus[machine.mode].maxPay });
    cab.screen.bonus.paid = machine.bonusPaid;
  }
  if (HASH.has('zoom')) rig.zoom = 0.6;
  fitCamera();
  refreshHud();
  setupDebug();
  $('loading').classList.add('ready');
  $('startbtn').onclick = () => {
    $('loading').classList.add('gone');
    haptics.vibrate([30]);
    audio.resume().then(() => playBgm()).catch((e) => console.warn('audio resume', e));
  };
  renderer.setAnimationLoop(frame);
  try { if (localStorage.getItem(STORE + '.mode') === 'pachinko') switchMode('pachinko'); } catch { /* noop */ }
  window.__slot = { THREE, cab, machine, director, scene, camera, rig, cfg, cashout, lend, switchMode, get pgame() { return pgame; }, get mode() { return mode; }, force: (f) => { forcedFlag = f; }, get state() { return state; } };
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
  if (cfg.render.neighbors === false && !assets.hall.length) return;
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
  const reelMats = new Set(cab.reels.map((r) => r.mat));
  const dim = (m) => {
    if (!dimMats.has(m)) {
      const c = m.clone();
      if (c.color) c.color.multiplyScalar(0.3);
      if ('emissiveIntensity' in c) c.emissiveIntensity = Math.min(c.emissiveIntensity, 0.1);
      if (reelMats.has(m)) c.emissiveIntensity = 0.5;
      dimMats.set(m, c);
    }
    return dimMats.get(m);
  };
  const gap = cfg.render.neighborGap; // 台どうしの間隔 (中心間 m)
  for (const x of cfg.render.neighbors === false ? [] : cfg.render.neighbors === 'near' ? [-gap, gap] : [-gap, gap, -gap * 2, gap * 2]) {
    const n = cab.group.clone(true);
    n.traverse((o) => {
      if (o.isLight) o.visible = false;
      if (o.isMesh || o.isPoints) o.material = Array.isArray(o.material) ? o.material.map(dim) : dim(o.material);
      if (o.isInstancedMesh) o.visible = false;
      o.userData = {};
    });
    n.position.x = x;
    scene.add(n);
    neighbors.push(new Neighbor({ cab, clone: n, x, cfg, audio }));
    // 手前に半透明の暗幕を置いて、隣の台の存在感を薄くする
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.88, depthWrite: false }));
    veil.position.set(x, 1.4, 0.75);
    veil.renderOrder = 10;
    scene.add(veil);
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

const yen = (v) => `${v < 0 ? '-' : ''}¥${Math.abs(v).toLocaleString('ja-JP')}`;

function refreshHud() {
  const s = machine.stats;
  const bal = machine.balance();
  $('h-wallet').textContent = yen(machine.wallet);
  $('h-invest').textContent = yen(machine.invested);
  $('h-medals').textContent = machine.medals;
  $('h-cash').textContent = yen(machine.cashValue());
  $('h-bal').textContent = (bal >= 0 ? '+' : '') + yen(bal).replace('¥', '¥');
  $('h-bal').className = bal >= 0 ? 'pos' : 'neg';
  $('hud').classList.toggle('broke', machine.wallet < cfg.money.lendYen && machine.medals < cfg.bet && machine.mode === 'normal');
  if (cab) {
    cab.setSegments(Math.min(machine.medals, 99999), payShown, s.sinceBonus);
    cab.setCounter(s);
    const need = machine.medals < cfg.bet && !machine.replayPending && machine.credit < cfg.bet && machine.mode === 'normal';
    cab.setChanger(machine.wallet, need && machine.canLend());
  }
  let needLend = machine.medals < cfg.bet && !machine.replayPending && machine.credit < cfg.bet && machine.mode === 'normal';
  if (mode === 'pachinko') {
    $('h-medals').textContent = machine.balls;
    needLend = machine.balls <= 0 && !pgame?.world.balls.length;
  }
  $('h-medals-k').textContent = mode === 'pachinko' ? '持ち玉' : '持ちメダル';
  $('h-medals-u').textContent = mode === 'pachinko' ? '玉 =' : '枚 =';
  $('btn-lend').innerHTML = mode === 'pachinko' ? `千円入れる <small>+${cfg.money.lendBalls}玉</small>` : `千円入れる <small>+${cfg.money.lendMedals}枚</small>`;
  $('btn-lend').disabled = !machine.canLend();
  $('hud').classList.toggle('need', needLend && machine.canLend());
}

// 画面上部の短い通知
function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `on ${kind}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, 1800);
}

// 千円でメダルを借りる (台間サンド)
function lend() {
  if (!cab || state === 'settling') return false;
  if (!machine.lend()) { toast('所持金が足りません', 'warn'); audio.play('lose', { gain: 0.6 }); return false; }
  audio.play('bill', { gain: 0.9 });
  for (let i = 0; i < 8; i++) audio.play('medal_in', { delay: 0.25 + i * 0.07, gain: 0.45, rate: 0.95 + Math.random() * 0.2 });
  haptics.vibrate('lend');
  toast(`千円札 → メダル ${cfg.money.lendMedals} 枚`, '');
  refreshHud();
  save();
  return true;
}

function doBet() {
  if (state !== 'idle' || machine.credit >= cfg.bet) return false;
  if (!machine.canBet()) {
    // メダル切れ: サンドの貸出ボタンが点滅して催促する
    toast(machine.canLend() ? 'メダルがありません — 右の貸出機で千円を入れてください' : '所持金がありません。換金して終了しましょう', 'warn');
    refreshHud();
    return false;
  }
  const wasReplay = machine.replayPending;
  machine.bet();
  cab.lights.betLed = false;
  payShown = 0;
  if (!wasReplay) {
    for (let i = 0; i < 3; i++) audio.play('medal_in', { delay: i * 0.06, gain: 0.5, rate: 1.05 + i * 0.05 });
  }
  audio.play('maxbet', { gain: 0.8 });
  cab.betPress = 1;
  haptics.vibrate('button');
  refreshHud();
  return true;
}

// 換金して終了 → 戦績を表示して次の日へ
function cashout() {
  if (state !== 'idle' || machine.mode !== 'normal') { toast('ボーナス中・回転中は換金できません', 'warn'); return; }
  if (pgame && (pgame.logic.round || pgame.world.balls.length || pgame.logic.current)) { toast('大当たり中・玉が動いている間・変動中は換金できません', 'warn'); return; }
  if (pgame) { pgame.firing = false; }
  if (machine.credit > 0) { machine.medals += machine.credit; machine.credit = 0; }
  const r = machine.cashout();
  const tot = machine.records.reduce((a, x) => a + x.balance, 0);
  $('m-title').textContent = r.balance >= 0 ? '勝ち' : '負け';
  $('m-title').className = r.balance >= 0 ? 'pos' : 'neg';
  $('m-body').innerHTML = `
    <dl>
      <dt>投資</dt><dd>${yen(r.invested)}</dd>
      <dt>換金 (${r.medals} 枚${r.balls ? ` + ${r.balls} 玉` : ''})</dt><dd>${yen(r.cash)}</dd>
      <dt>収支</dt><dd class="${r.balance >= 0 ? 'pos' : 'neg'}">${r.balance >= 0 ? '+' : ''}${yen(r.balance)}</dd>
      <dt>回転数</dt><dd>${r.games} G</dd>
      <dt>BIG / REG</dt><dd>${r.big} / ${r.reg}</dd>
      <dt>本日の設定</dt><dd class="setting">設定 ${r.setting}</dd>
      <dt>通算収支 (${machine.records.length} 日)</dt><dd class="${tot >= 0 ? 'pos' : 'neg'}">${tot >= 0 ? '+' : ''}${yen(tot)}</dd>
    </dl>`;
  $('modal').hidden = false;
  audio.stopBgm(0.2);
  audio.play(r.balance >= 0 ? 'bonus_end' : 'lose', { gain: 0.8 });
  const L = cab.lights;
  L.lampTarget = 0; L.lampPremium = false; L.rainbow = 0; L.mode = 'idle'; cab.screen.set('idle');
  if (pgame) { pgame.logic.reset(); pgame.save(); pgame.refreshTray(); }
  payShown = 0;
  save();
  refreshHud();
}

let stateSince = performance.now();
function setState(v) { state = v; stateSince = performance.now(); }

async function pullLever() {
  if (state !== 'idle') return;
  // 実機どおり、MAX BET を押してからでないとレバーは効かない (リプレイ時だけ自動でベット済み)
  if (machine.credit < cfg.bet) {
    if (!machine.replayPending || !doBet()) {
      cab.lights.betNudge = 1;
      if (!machine.canBet()) doBet(); // メダル切れの案内を出す
      return;
    }
  }
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
    if (remain > 0) await sleep(remain);
    lastStart = performance.now();

    flag = machine.start(forcedFlag);
    forcedFlag = null;
    if (gui) { guiState.force = 'none'; gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
    plan = director.planGame(flag);
    stops = [null, null, null];
    awaitRelease = false;
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
    cab.lights.stopLed = ['#3cf', '#3cf', '#3cf'];
    cab.lights.stopLedOn = [true, true, true];
  }, cfg.reels.spinUpMs);
}

let lastStopAt = 0;
let awaitRelease = false;
function releaseStop() { if (awaitRelease) { awaitRelease = false; director.onThirdRelease(); } }
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
  if (stoppedNow === 3) awaitRelease = true; // 後ペカは第3停止ボタンを“離した”瞬間
  cab.stopReel(i, target, () => {
    // ここは描画ループ内で呼ばれる。例外でループを止めないよう必ず握る
    lastStopAt = performance.now();
    try {
      audio.play('reel_stop', { gain: 1.0, rate: 0.92 + Math.random() * 0.12 });
      shaker.punch(0, -0.0035, 0);
      director.onStop(stoppedNow);
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
    refreshHud();
    await director.onSettle(res, flag);
  } catch (e) { report(e); }
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
  else if (a === 'lend') { cab.lendBtn.position.z = 0.098; setTimeout(() => { cab.lendBtn.position.z = 0.105; }, 120); lend(); }
  else if (a.startsWith('stop')) pressStop(+a[4]);
}
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyG') { toggleGui(); return; }
  if (e.code === 'Tab') { e.preventDefault(); switchMode(mode === 'slot' ? 'pachinko' : 'slot'); return; }
  if (mode === 'pachinko') { pachKey(e); return; }
  if (e.code === 'KeyM') { act('lend'); return; }
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
  if (mode === 'pachinko') { pachDown(e); return; }
  const a = pick(e);
  if (!a) return;
  if (a === 'lever') {
    leverDrag = { id: e.pointerId, y0: e.clientY, t0: performance.now(), fired: false };
    return;
  }
  act(a);
});
addEventListener('pointermove', (e) => {
  if (handleDrag && e.pointerId === handleDrag.id) {
    const dy = handleDrag.y0 - e.clientY;
    if (Math.abs(dy) > 6) handleDrag.moved = true;
    if (handleDrag.moved) pgame.setPower(handleDrag.p0 + dy / 220);
    return;
  }
  if (!leverDrag || e.pointerId !== leverDrag.id) return;
  const d = Math.max(0, Math.min(1, (e.clientY - leverDrag.y0) / 70));
  cab.lever.drag = d;
  if (d > 0.65 && !leverDrag.fired) { leverDrag.fired = true; pullLever(); }
});
const endLever = (e) => {
  if (handleDrag && e.pointerId === handleDrag.id) {
    if (!handleDrag.moved) pgame.setFiring(!pgame.firing); // タップで発射 ON/OFF
    else if (!pgame.firing) pgame.setFiring(true);         // 回したら発射も始める
    handleDrag = null;
    return;
  }
  if (!leverDrag || e.pointerId !== leverDrag.id) return;
  if (!leverDrag.fired) pullLever(); // タップでも引ける
  cab.lever.drag = 0;
  leverDrag = null;
};
addEventListener('pointerup', endLever);
addEventListener('pointerup', releaseStop);
addEventListener('keyup', (e) => { if ((keyMap[e.code] || '').startsWith('stop')) releaseStop(); });
addEventListener('pointercancel', endLever);
addEventListener('pointermove', (e) => {
  rig.tx = (e.clientX / innerWidth) * 2 - 1;
  rig.ty = -((e.clientY / innerHeight) * 2 - 1);
});
// ---------------- パチンコの操作 ----------------
let handleDrag = null;
function pachDown(e) {
  const a = pgame.pick(e);
  if (a === 'handle') handleDrag = { id: e.pointerId, y0: e.clientY, p0: pgame.power, moved: false };
  else if (a === 'push') pgame.push();
  else if (a === 'plend') pgame.lend();
}
function pachKey(e) {
  const k = e.code;
  if (k === 'Space' || k === 'Enter') { e.preventDefault(); pgame.setFiring(!pgame.firing); }
  else if (k === 'ArrowUp') { e.preventDefault(); pgame.setPower(pgame.power + 0.03); }
  else if (k === 'ArrowDown') { e.preventDefault(); pgame.setPower(pgame.power - 0.03); }
  else if (k === 'ArrowRight') { e.preventDefault(); pgame.setPower(0.97); }   // 右打ち
  else if (k === 'ArrowLeft') { e.preventDefault(); pgame.setPower(0.48); }    // 左打ち
  else if (k === 'KeyP' || k === 'KeyB') pgame.push();
  else if (k === 'KeyM') pgame.lend();
}

// スロット ⇄ パチンコ (暗転して島を移る)
let switching = false;
const helpSlot = document.getElementById('help')?.textContent || '';
async function switchMode(to) {
  if (switching || to === mode || !bootAssets) return;
  if (to === 'pachinko' && (state !== 'idle' || machine.mode !== 'normal' || (machine.carried && machine.noticed))) { toast('ボーナス中・回転中・告知中は移動できません', 'warn'); return; }
  if (to === 'slot' && pgame && (pgame.logic.round || pgame.world.balls.length)) { toast('大当たり中・玉が動いている間は移動できません', 'warn'); return; }
  switching = true;
  const fade = $('fade');
  fade.classList.add('on');
  audio.stopBgm(0.3);
  await sleep(350);
  try {
    if (to === 'pachinko' && !pgame) pgame = new PachinkoGame({ cfg, assets: bootAssets, audio, haptics, shaker, machine, toast, onChange: () => { refreshHud(); save(); } });
    if (pgame) pgame.firing = false;
    mode = to;
    renderPass.scene = to === 'pachinko' ? pgame.scene : scene;
    renderPass.camera = to === 'pachinko' ? pgame.camera : camera;
    $('btn-mode').textContent = to === 'pachinko' ? 'スロット' : 'パチンコ';
    document.body.dataset.mode = to;
    $('help').textContent = to === 'pachinko'
      ? 'ハンドルをタップで発射 / 上下になぞって強さ  ·  キー: Space 発射  ↑↓ 強さ  → 右打ち  ← 左打ち  P PUSH  M 千円  Tab スロットへ'
      : helpSlot;
    try { localStorage.setItem(STORE + '.mode', to); } catch { /* noop */ }
    refreshHud();
    playBgm();
  } catch (e) { report(e); }
  await sleep(100);
  fade.classList.remove('on');
  switching = false;
}

addEventListener('resize', () => {
  pgame?.fit();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloomPass.resolution.set(innerWidth / 2, innerHeight / 2);
  fitCamera();
});
$('btn-sound').onclick = () => {
  audio.enabled = !audio.enabled;
  if (!audio.enabled) audio.stopBgm(0.1); else playBgm();
  $('btn-sound').classList.toggle('off', !audio.enabled);
};
$('btn-vib').onclick = () => {
  cfg.effects.haptics = !cfg.effects.haptics;
  $('btn-vib').classList.toggle('off', !cfg.effects.haptics);
};
$('btn-gear').onclick = () => toggleGui();
$('btn-reload').onclick = () => location.reload();
$('btn-cash').onclick = () => cashout();
$('btn-lend').onclick = (e) => { e.currentTarget.blur(); if (mode === 'pachinko') pgame.lend(); else lend(); };
$('btn-mode').onclick = (e) => { e.currentTarget.blur(); switchMode(mode === 'slot' ? 'pachinko' : 'slot'); };
$('m-next').onclick = () => { $('modal').hidden = true; playBgm(); toast(`新しい日 — 所持金 ${yen(machine.wallet)}`); };

// ------------------------------------------------------------------
// デバッグ / チューニングパネル (lil-gui)
// ------------------------------------------------------------------
let gui = null;
const guiState = { force: 'none' };
async function setupDebug() {
  void 0;
  if (HASH.has('debug')) await toggleGui();
}
async function toggleGui() {
  if (gui) { gui.domElement.style.display = gui.domElement.style.display === 'none' ? '' : 'none'; return; }
  const { GUI } = await import('../assets/lib/lil-gui/lil-gui.esm.min.js');
  gui = new GUI({ title: 'SLOT — TUNING' });
  const g1 = gui.addFolder('抽選');
  g1.add(cfg, 'setting', [1, 2, 3, 4, 5, 6]).name('設定 (本日・隠し)').onChange((v) => { machine.daySetting = +v; });
  g1.add(guiState, 'force', ['none', 'BIG', 'REG', 'CHERRY+BIG', 'CHERRY+REG', 'GRAPE', 'BELL', 'CLOWN', 'REPLAY', 'CHERRY', 'NONE']).name('次G 強制フラグ')
    .onChange((v) => { forcedFlag = v === 'none' ? null : v; });
  g1.add(cfg.play, 'assistAlignAfterNotice').name('告知後 目押しアシスト');
  g1.add(cfg.reels, 'maxSlip', 0, 4, 1).name('最大滑りコマ').onChange(() => { machine.logic._ctx = new Map(); });
  const g2 = gui.addFolder('演出');
  g2.add(director.debugForce, 'notice', ['auto', 'lever', 'release']).name('告知 (先ペカ/後ペカ)');
  g2.add(director.debugForce, 'premium').name('プレミア点灯');
  g2.add(director.debugForce, 'preview', ['auto', 'none', 'balls', 'face', 'cutin', 'seven', 'blackout']).name('予告 (強制)');
  g2.add(cfg.notice, 'premium', 0, 1, 0.01).name('プレミア率');
  g2.add(cfg.notice, 'silenceMs', 0, 600, 10).name('点灯前の静寂 ms');
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
  g5.add({ add: () => { machine.wallet += 10000; refreshHud(); } }, 'add').name('所持金 +1万円');
  g5.add(cfg.money, 'lendMedals', 40, 50, 1).name('千円あたり枚数');
  g5.add(cfg.money, 'exchangeYen', 15, 20, 0.1).name('換金 円/枚');
  g1.open(); g2.open();
}

// ------------------------------------------------------------------
// loop
// ------------------------------------------------------------------
const clock = new THREE.Clock();
let frameErr = 0;
// 隣の台 (オートプレイ。自台とは連動しない)
const neighbors = [];
function updateNeighbors(dt) {
  // 画面外の隣台が当たっていたら、その側の画面端をほんのり光らせる
  const edge = { l: 0, r: 0 };
  for (const n of neighbors) if (n.active) edge[n.x < 0 ? 'l' : 'r'] = n.mode === 'lit' ? 1 : 0.6;
  for (const k of ['l', 'r']) {
    const el = $('edge-' + k);
    if (el) el.style.opacity = edge[k] ? String(edge[k] * (0.55 + 0.45 * Math.sin(performance.now() / 160))) : '0';
  }
  for (const n of neighbors) n.update(dt);
}

function frame() {
  try { frameBody(); } catch (e) { if (frameErr++ < 3) report(e); }
}
function frameBody() {
  const dt = Math.min(0.05, clock.getDelta());
  if (mode === 'pachinko' && pgame) {
    pgame.update(dt);
    bloom.kick = Math.max(0, bloom.kick - dt * 1.4);
    // 盤面は明るい面が多いので、ブルームは控えめに
    bloomPass.strength = cfg.effects.bloom.strength * 0.45 + bloom.kick * 0.3;
    bloomPass.threshold = Math.max(cfg.effects.bloom.threshold, 0.88);
    composer.render();
    return;
  }
  cab.update(dt);
  coins.update(dt);
  sparks.update(dt);
  bloom.kick = Math.max(0, bloom.kick - dt * 1.4);
  bloomPass.strength = cfg.effects.bloom.strength + bloom.kick * 0.45;
  bloomPass.threshold = cfg.effects.bloom.threshold;
  if (cab.lights.rainbow > 0 && machine.mode === 'normal' && !machine.carried) cab.lights.rainbow = 0;
  cab.screen.status.zone = machine.mode === 'normal' && !machine.noticed ? machine.zone : 0;
  cab.screen.status.chain = machine.chain;
  updateNeighbors(dt);
  updateRig(dt);
  composer.render();
}

boot().catch((e) => {
  console.error(e);
  $('loadmsg').textContent = '読み込みに失敗しました: ' + e.message;
});
