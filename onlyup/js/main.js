import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import gsap from 'gsap';
import GUI from 'lil-gui';
import Stats from 'three/addons/libs/stats.module.js';
import { loadAssets } from './assets.js';
import { MaterialLibrary } from './materials.js';
import { Level, ZONES } from './level.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Save, fmtTime } from './save.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches;
const DIFF_NAME = { easy: 'かんたん', normal: 'ふつう', hard: 'ONLY UP' };
const ZONE_TINT = [[1, 1, 1], [1.03, 1.0, 0.95], [1.05, 0.98, 0.92], [0.98, 0.98, 1.02], [0.94, 0.99, 1.08], [1.06, 1.02, 0.95]]
  .map((a) => new THREE.Vector3(...a));

const settings = Object.assign({
  quality: isTouch ? 'low' : 'high', dynamicRes: true, bloom: true, fov: 62,
  mouseSens: 1, touchSens: 1, invertY: false, master: 0.8, bgm: 0.45, sfx: 0.8, showFps: false,
}, Save.settings() || {});

let state = 'loading';
let renderer, scene, camera, world, level, player, rig, input, fx, audio, stats, mats;
let simTime = 0, saveTimer = 0, flash = 0, wakeLock = null, hadLock = false;
const game = { difficulty: 'normal', checkpoint: 0, time: 0, falls: 0, best: 0, zoneSeen: 0, height: 0 };

// ------------------------------------------------------------------ boot
function setProgress(p, text) {
  $('loadBar').style.width = `${Math.round(p * 100)}%`;
  if (text) $('loadText').textContent = text;
}

async function boot() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('app').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.1, 4000);

  setProgress(0.02, '物理エンジン Rapier (WebAssembly) を初期化中…');
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // 重力はキャラクター側で計算

  setProgress(0.05, 'Poly Haven から PBR テクスチャと HDRI を取得中…');
  const assets = await loadAssets(renderer, {
    hdrRes: settings.quality === 'high' ? '2k' : '1k',
    onProgress: (p) => setProgress(0.05 + p * 0.8, `外部アセットを読み込み中… ${Math.round(p * 100)}%`),
  });

  setProgress(0.88, 'ステージを生成中…');
  await new Promise((r) => setTimeout(r, 0));
  mats = new MaterialLibrary(assets.textures);
  level = new Level({ RAPIER, world, scene, mats, misc: assets.misc });
  level.build();
  level.onCrumble = () => audio.play('crumble', { volume: 0.6 });
  world.step();

  fx = new FX(renderer, scene, camera, assets, settings.quality);
  player = new Player({ RAPIER, world, scene, gltf: assets.gltf, level, events: playerEvents });
  player.spawn(level.checkpoints[0].spawn);
  rig = new CameraRig(camera, RAPIER, world, player.collider);
  input = new Input(renderer.domElement, { touch: isTouch });
  input.onPause = () => (state === 'playing' ? pause() : state === 'paused' ? resume() : null);
  input.onRespawn = () => { if (state === 'playing') toCheckpoint(); };
  input.onGamepad = (id) => toast(`🎮 ゲームパッド接続: ${id.slice(0, 28)}`);
  audio = new Audio();

  applySettings();
  setupUI();
  buildAltBar();

  setProgress(0.95, 'シェーダーをコンパイル中…');
  try { await renderer.compileAsync(scene, camera); } catch { /* 非対応環境 */ }
  setProgress(1, '準備完了');

  addEventListener('resize', () => fx.resize());
  requestAnimationFrame(frame);
  await gsap.to('#loading', { opacity: 0, duration: 0.6, delay: 0.2 });
  $('loading').hidden = true;
  showTitle();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ------------------------------------------------------------------ player events → 演出
const playerEvents = {
  onJump(double) {
    audio.play(double ? 'doublejump' : 'jump', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
    const p = player.position; p.y -= 0.9;
    fx.puff(p, double ? 6 : 3, 0.6, double ? 0x9fe8ff : 0xd8c8b0);
  },
  onLand(drop, ground) {
    if (state !== 'playing') return;
    if (drop > 1.0) {
      audio.play('land', { volume: Math.min(1, 0.25 + drop * 0.06), rate: 1.1 - Math.min(0.3, drop * 0.02) });
      const p = player.position; p.y -= 0.9;
      fx.puff(p, Math.min(14, 3 + Math.floor(drop)), Math.min(2, 0.6 + drop * 0.08), ground?.surface === 'ice' || ground?.spec.mat === 'snow' ? 0xf2f6ff : 0xd8c8b0);
    }
    if (drop > 4) input.rumble(Math.min(1, drop / 20), 0.4, 140);
    if (drop > 8) {
      game.falls++;
      rig.shake = Math.min(1.2, drop / 25);
      audio.play('fall', { volume: 0.6 });
      toast(`${drop.toFixed(0)} m 落下…`);
    }
  },
  onStep() { audio.play('step', { volume: 0.12, rate: 0.85 + Math.random() * 0.3, throttle: 0.15 }); },
  onBounce(p) {
    audio.play('bounce', { volume: 0.8 });
    fx.burst(player.position, 18, 0x66e0ff, 6);
    input.rumble(0.6, 0.6, 160);
    if (p.pad) gsap.to(p.pad.material.uniforms.uKick, { value: 0, duration: 0.6 });
  },
  onHit() {
    audio.play('hit', { volume: 0.9 });
    rig.shake = 0.8;
    input.rumble(1, 0.8, 220);
  },
};

// ------------------------------------------------------------------ loop
let last = performance.now();
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  stats?.begin();

  const inp = input.poll(dt);
  if (state === 'playing') {
    const steps = Math.ceil(dt / STEP - 1e-6) || 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      simTime += h;
      level.update(simTime, h);
      world.timestep = h;
      world.step();
      player.step(h, i === 0 ? inp : { ...inp, jumpPressed: false }, rig.yaw, simTime);
    }
    game.time += dt;
    gameLogic(dt);
  } else if (state !== 'paused') {
    simTime += dt;
    level.update(simTime, dt);
    world.timestep = dt;
    world.step();
    if (state === 'clear') player.step(dt, { move: { x: 0, y: 0 }, sprint: false, jumpHeld: false, jumpPressed: false }, rig.yaw, simTime);
  }

  player.updateVisual(state === 'paused' ? 0 : dt);
  let speedFx = 0;
  if (state === 'title') {
    const a = simTime * 0.05;
    camera.position.set(Math.cos(a) * 62, 26 + Math.sin(simTime * 0.13) * 8, Math.sin(a) * 62);
    camera.lookAt(0, 34, 0);
    camera.fov = settings.fov; camera.updateProjectionMatrix();
  } else {
    speedFx = rig.update(state === 'paused' ? 0 : dt, inp.look, player.root.position, { vy: player.vy, sprint: inp.sprint && player.hSpeed > 5 });
  }
  level.updateVisuals(simTime, camera);
  flash = Math.max(0, flash - dt * 2.5);
  fx.update(dt, state === 'title' ? new THREE.Vector3(0, 20, 0) : player.root.position, {
    speed: speedFx, flash, tint: ZONE_TINT[level.zoneAt(game.height)] || ZONE_TINT[0],
  });
  fx.adaptResolution(dt);
  fx.render();
  if (state === 'playing') updateHUD();
  stats?.end();
}

function gameLogic(dt) {
  const pos = player.position;
  const feet = pos.y - 0.9;
  game.height = Math.max(0, feet - level.startTop);
  if (game.height > game.best) game.best = game.height;

  // ゾーン到達
  const z = level.zoneAt(game.height);
  if (z > game.zoneSeen && player.grounded) {
    game.zoneSeen = z;
    banner(ZONES[z].en, ZONES[z].name);
    audio.play('zone', { volume: 0.7 });
  }

  // チェックポイント
  if (game.difficulty !== 'hard' && player.grounded) {
    for (const cp of level.checkpoints) {
      if (cp.active || !cp) continue;
      const dx = pos.x - cp.platform.base.x, dz = pos.z - cp.platform.base.z;
      if (Math.hypot(dx, dz) < cp.r + 0.5 && Math.abs(feet - cp.top) < 1.5) {
        cp.activate();
        game.checkpoint = Math.max(game.checkpoint, cp.index);
        audio.play('checkpoint', { volume: 0.8 });
        fx.burst(new THREE.Vector3(cp.platform.base.x, cp.top + 2, cp.platform.base.z), 40, 0x7dff9a, 7);
        toast('✔ チェックポイント更新');
        input.rumble(0.3, 0.6, 120);
        persist();
      }
    }
  }

  // ゴール
  const g = level.goal;
  if (player.grounded && feet > g.top - 0.6 && Math.hypot(pos.x - g.pos.x, pos.z - g.pos.z) < g.r) return clearGame();

  // 海へ落下
  if (pos.y < -1.5 && !player.frozen) {
    audio.play('splash', { volume: 0.9 });
    game.falls++;
    const cp = game.difficulty === 'hard' ? level.checkpoints[0] : level.checkpoints[game.checkpoint];
    respawn(cp.spawn, game.difficulty === 'hard' ? '海に落ちた… 最初から' : '海に落ちた… チェックポイントへ');
    return;
  }
  // かんたん：自動救助
  if (game.difficulty === 'easy' && !player.frozen && !player.grounded && player.lastSafe.y - pos.y > 22) {
    respawn(player.lastSafe.clone(), '救助しました');
  }

  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 3; persist(); }
}

function respawn(at, msg) {
  if (player.frozen) return;
  player.frozen = true;
  flash = 0.9;
  if (msg) toast(msg);
  gsap.fromTo('#fade', { opacity: 0 }, { opacity: 0.85, duration: 0.18, yoyo: true, repeat: 1 });
  setTimeout(() => {
    player.spawn(at);
    rig.snap(player.position);
    player.frozen = false;
  }, 200);
}

function toCheckpoint() {
  if (game.difficulty === 'hard') return toast('ONLY UP モードでは戻れません');
  respawn(level.checkpoints[game.checkpoint].spawn, 'チェックポイントへ戻りました');
}

function persist() {
  if (state !== 'playing' && state !== 'paused') return;
  const s = player.lastSafe;
  Save.store({ difficulty: game.difficulty, checkpoint: game.checkpoint, time: game.time, falls: game.falls, best: game.best, zoneSeen: game.zoneSeen, pos: [s.x, s.y, s.z], yaw: rig.yaw });
  Save.bestHeight(game.best);
}

// ------------------------------------------------------------------ flow
function resetCheckpoints(upTo) {
  level.checkpoints.forEach((cp, i) => {
    if (i === 0) return;
    if (i <= upTo) cp.activate();
    else {
      cp.active = false;
      cp.flagMat.color.set(0xd9483b);
      cp.beamMat.uniforms.uColor.value.set(0xff7a3a);
      cp.beamMat.uniforms.uOpacity.value = 0.4;
    }
  });
}

function startGame(fromSave) {
  audio.play('click');
  level.reset();
  player.stopDance();
  const sv = fromSave ? Save.load() : null;
  if (sv) {
    Object.assign(game, { difficulty: sv.difficulty, checkpoint: sv.checkpoint, time: sv.time, falls: sv.falls, best: sv.best, zoneSeen: sv.zoneSeen ?? 0, height: 0 });
    player.spawn(new THREE.Vector3(...sv.pos));
    rig.yaw = sv.yaw ?? rig.yaw;
  } else {
    const diff = document.querySelector('input[name=diff]:checked')?.value || 'normal';
    Object.assign(game, { difficulty: diff, checkpoint: 0, time: 0, falls: 0, best: 0, zoneSeen: 0, height: 0 });
    player.spawn(level.checkpoints[0].spawn, 0);
    rig.yaw = Math.PI; rig.pitch = 0.3;
    Save.clear();
  }
  resetCheckpoints(game.difficulty === 'hard' ? 0 : game.checkpoint);
  player.difficulty = game.difficulty;
  rig.snap(player.position);
  $('tRespawn').hidden = game.difficulty === 'hard';
  $('btnToCheckpoint').hidden = game.difficulty === 'hard';

  gsap.to('#title', { opacity: 0, duration: 0.4, onComplete: () => { $('title').hidden = true; } });
  $('hud').hidden = false;
  $('touch').hidden = !isTouch;
  state = 'playing';
  input.enabled = true;
  input.lockPointer();
  audio.startBgm();
  requestWakeLock();
  if (!sv) setTimeout(() => banner(ZONES[0].en, ZONES[0].name), 400);
  if (isTouch) goFullscreen();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  input.enabled = false;
  input.unlockPointer();
  persist();
  audio.duckBgm(true);
  showModal('pause');
}
function resume() {
  hideModal('pause');
  state = 'playing';
  input.enabled = true;
  input.lockPointer();
  audio.duckBgm(false);
}

function quitToTitle() {
  persist();
  hideModal('pause'); hideModal('clear');
  state = 'title';
  input.enabled = false;
  input.unlockPointer();
  $('hud').hidden = true; $('touch').hidden = true; $('lockHint').hidden = true;
  showTitle();
}

function clearGame() {
  state = 'clear';
  input.enabled = false;
  input.unlockPointer();
  player.dance();
  audio.play('goal', { volume: 1 });
  const g = level.goal;
  for (let i = 0; i < 4; i++) setTimeout(() => fx.burst(new THREE.Vector3(g.pos.x, g.top + 4.5, g.pos.z), 50, [0xffd27d, 0x7dffea, 0xff9ad5, 0xffffff][i], 11), i * 300);
  const isRecord = Save.storeRecord(game.difficulty, game.time, game.falls);
  Save.bestHeight(level.totalHeight);
  Save.clear();
  $('clearStats').innerHTML = `
    難易度 ${DIFF_NAME[game.difficulty]}<br>
    タイム <b>${fmtTime(game.time)}</b>${isRecord ? ' 🏆 自己ベスト！' : ''}<br>
    落下回数 <b>${game.falls}</b> 回 ・ 標高 <b>${level.totalHeight.toFixed(0)}</b> m`;
  setTimeout(() => showModal('clear'), 2200);
}

// ------------------------------------------------------------------ UI
function showTitle() {
  $('title').hidden = false;
  gsap.fromTo('#title', { opacity: 0 }, { opacity: 1, duration: 0.6 });
  gsap.fromTo('#title .logo, #title .tagline, #title .diff, #title .menu', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out' });
  const sv = Save.load();
  $('btnContinue').hidden = !sv;
  if (sv) {
    $('continueInfo').textContent = `${DIFF_NAME[sv.difficulty]} ・ 最高 ${Math.floor(sv.best)} m ・ ${fmtTime(sv.time)}`;
    const r = document.querySelector(`input[name=diff][value=${sv.difficulty}]`); if (r) r.checked = true;
  }
  const rec = Save.records();
  const parts = Object.entries(DIFF_NAME).filter(([k]) => rec[k]).map(([k, n]) => `${n} ${fmtTime(rec[k].time)}`);
  $('records').textContent = [rec.bestHeight ? `最高到達 ${Math.floor(rec.bestHeight)} m` : '', parts.length ? `クリアタイム: ${parts.join(' / ')}` : '']
    .filter(Boolean).join('　・　') || `頂上まで ${level.totalHeight.toFixed(0)} m`;
  state = 'title';
}

function showModal(id) {
  $(id).hidden = false;
  gsap.fromTo(`#${id} .panel`, { y: 30, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' });
}
function hideModal(id) { $(id).hidden = true; }

function banner(sub, main) {
  $('bannerSub').textContent = sub;
  $('bannerMain').textContent = main;
  gsap.timeline()
    .fromTo('#banner', { opacity: 0, y: 20, letterSpacing: '0.6em' }, { opacity: 1, y: 0, letterSpacing: '0.12em', duration: 0.9, ease: 'power3.out' })
    .to('#banner', { opacity: 0, y: -10, duration: 0.8, delay: 2.2 });
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  gsap.killTweensOf(t);
  gsap.timeline().fromTo(t, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25 }).to(t, { opacity: 0, duration: 0.4, delay: 1.6 });
}

function buildAltBar() {
  const host = $('altZones');
  host.innerHTML = '';
  level.zoneStarts.forEach((h, i) => {
    const d = document.createElement('div');
    d.style.bottom = `${(h / level.totalHeight) * 100}%`;
    d.innerHTML = `<span>${ZONES[i].name}</span>`;
    host.appendChild(d);
  });
}

const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHUD() {
  setText('hudHeight', game.height.toFixed(1));
  setText('hudBest', Math.floor(game.best).toString());
  setText('hudZone', ZONES[level.zoneAt(game.height)].name);
  setText('hudTime', fmtTime(game.time));
  setText('hudFalls', String(game.falls));
  const tot = level.totalHeight;
  $('altMe').style.bottom = `${Math.min(100, (game.height / tot) * 100)}%`;
  $('altBest').style.bottom = `${Math.min(100, (game.best / tot) * 100)}%`;
  $('lockHint').hidden = isTouch || !!document.pointerLockElement;
}

function setupUI() {
  $('btnNew').onclick = () => {
    if (Save.load() && !confirm('現在の進行状況は失われます。はじめからにしますか？')) return;
    startGame(false);
  };
  $('btnContinue').onclick = () => startGame(true);
  $('btnPause').onclick = () => pause();
  $('btnResume').onclick = () => resume();
  $('btnToCheckpoint').onclick = () => { resume(); toCheckpoint(); };
  $('btnQuit').onclick = () => quitToTitle();
  $('btnAgain').onclick = () => { hideModal('clear'); startGame(false); };
  $('btnClearTitle').onclick = () => quitToTitle();
  $('btnFullscreen').onclick = () => goFullscreen();
  $('btnSettings').onclick = () => showModal('settings');
  $('btnPauseSettings').onclick = () => showModal('settings');
  $('btnHelp').onclick = () => showModal('help');
  $('btnCredits').onclick = () => showModal('credits');
  document.querySelectorAll('.modal .close').forEach((b) => (b.onclick = () => { audio.play('click'); hideModal(b.closest('.modal').id); }));
  $('btnShare').onclick = async () => {
    const text = `SKYWARD — 天空登攀を${DIFF_NAME[game.difficulty]}で登頂！ タイム ${fmtTime(game.time)} / 落下 ${game.falls}回`;
    try {
      if (navigator.share) await navigator.share({ title: 'SKYWARD', text, url: location.href });
      else { await navigator.clipboard.writeText(`${text} ${location.href}`); toast('クリップボードにコピーしました'); }
    } catch { /* キャンセル */ }
  };
  document.querySelectorAll('.btn, .diff label').forEach((b) => b.addEventListener('pointerenter', () => audio.play('hover', { volume: 0.25, throttle: 0.04 })));
  document.querySelectorAll('input[name=diff]').forEach((r) => r.addEventListener('change', () => audio.play('click', { volume: 0.6 })));

  renderer.domElement.addEventListener('click', () => { if (state === 'playing') input.lockPointer(); });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) hadLock = true;
    else if (hadLock && state === 'playing') { hadLock = false; pause(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (state === 'playing') pause(); persist(); }
    else if (state === 'playing' || state === 'paused') requestWakeLock();
  });
  addEventListener('beforeunload', persist);

  // --- 設定 (lil-gui) ---
  const gui = new GUI({ container: $('guiHost'), title: '設定', width: 400 });
  const gfx = gui.addFolder('グラフィック');
  gfx.add(settings, 'quality', { 低: 'low', 中: 'medium', 高: 'high' }).name('画質').onChange(applySettings);
  gfx.add(settings, 'dynamicRes').name('解像度の自動調整').onChange(applySettings);
  gfx.add(settings, 'bloom').name('ブルーム').onChange(applySettings);
  gfx.add(settings, 'fov', 50, 85, 1).name('視野角').onChange(applySettings);
  gfx.add(settings, 'showFps').name('FPS表示').onChange(applySettings);
  const ctl = gui.addFolder('操作');
  ctl.add(settings, 'mouseSens', 0.2, 3, 0.05).name('マウス/パッド感度').onChange(applySettings);
  ctl.add(settings, 'touchSens', 0.2, 3, 0.05).name('タッチ感度').onChange(applySettings);
  ctl.add(settings, 'invertY').name('上下反転').onChange(applySettings);
  const snd = gui.addFolder('サウンド');
  snd.add(settings, 'master', 0, 1, 0.01).name('全体').onChange(applySettings);
  snd.add(settings, 'bgm', 0, 1, 0.01).name('BGM').onChange(applySettings);
  snd.add(settings, 'sfx', 0, 1, 0.01).name('効果音').onChange(applySettings);
  gui.add({ reset: () => { if (confirm('セーブデータと記録を消去しますか？')) { localStorage.clear(); location.reload(); } } }, 'reset').name('データ消去');
}

function applySettings() {
  Save.storeSettings(settings);
  if (fx.qualityName !== settings.quality) fx.setQuality(settings.quality);
  fx.dynamicRes = settings.dynamicRes;
  if (!settings.dynamicRes && fx.resScale !== 1) { fx.resScale = 1; fx.resize(); }
  fx.bloomOn = settings.bloom;
  fx.bloom.enabled = settings.bloom && fx.q.bloom;
  rig.baseFov = settings.fov;
  rig.invertY = settings.invertY;
  input.mouseSens = settings.mouseSens;
  input.touchSens = settings.touchSens;
  audio.setVolumes({ master: settings.master, bgm: settings.bgm, sfx: settings.sfx });
  if (settings.showFps && !stats) { stats = new Stats(); stats.dom.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:30;'; document.body.appendChild(stats.dom); }
  if (stats) stats.dom.hidden = !settings.showFps;
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !document.hidden) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
}
async function goFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch { /* iOS 等は非対応 */ }
}

boot().catch((e) => {
  console.error(e);
  $('loadError').hidden = false;
  $('loadError').textContent = `読み込みに失敗しました。\n${e.message}\nネットワーク接続を確認して再読み込みしてください。`;
});

// デバッグ用
window.__skyward = {
  get game() { return game; }, get level() { return level; }, get player() { return player; }, get state() { return state; }, get rig() { return rig; },
  startGame,
  /** テスト用：描画せずに物理だけ進める */
  stepSim(n = 60, inp = {}) {
    const i0 = { move: { x: 0, y: 0 }, sprint: false, jumpHeld: false, jumpPressed: false, look: { x: 0, y: 0, zoom: 0 }, ...inp };
    for (let i = 0; i < n; i++) {
      simTime += STEP; level.update(simTime, STEP); world.timestep = STEP; world.step();
      player.step(STEP, i === 0 ? i0 : { ...i0, jumpPressed: false }, rig.yaw, simTime);
      gameLogic(STEP);
    }
  },
};
