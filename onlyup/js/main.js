import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import gsap from 'gsap';
import GUI from 'lil-gui';
import Stats from 'three/addons/libs/stats.module.js';
import { AssetLoader, URLS, TEXTURE_SETS } from './assets.js';
import { MaterialLibrary, setGrimeTexture } from './materials.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PropManager } from './props.js';
import { Level, ZONES } from './level.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Save, fmtTime } from './save.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
const IS_ARTIFACT = !!window.SKYWARD_ASSETS;
// ゾーンごとの色調（スラム・線路は暖色、工場・地下鉄は青緑、モールは明るく、天国は白く、宇宙は青く）
const ZONE_TINT = [[1.04, 1.0, 0.94], [1.06, 1.0, 0.92], [0.97, 1.0, 0.98], [0.94, 0.98, 1.04], [1.05, 1.0, 0.93], [1.02, 1.0, 0.97], [1.02, 1.0, 1.02], [1.05, 0.99, 0.96], [1.08, 1.02, 0.9], [0.98, 0.99, 1.03], [1.02, 1.02, 1.03], [0.94, 0.97, 1.1]]
  .map((a) => new THREE.Vector3(...a));

const settings = Object.assign({
  quality: isTouch ? 'low' : 'high', dynamicRes: true, bloom: true, fov: 62,
  mouseSens: 1, touchSens: 1, invertY: false, master: 0.8, bgm: 0.45, sfx: 0.8, showFps: false,
}, Save.settings() || {});

let state = 'loading';
let renderer, scene, camera, world, level, player, rig, input, fx, audio, stats, mats, props, loader;
let simTime = 0, saveTimer = 0, flash = 0, hadLock = false, astronaut = null;
const game = { time: 0, falls: 0, fallMeters: 0, maxFall: 0, best: 0, zoneSeen: 0, height: 0 };

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
  camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.1, 4200);

  setProgress(0.02, '物理エンジン Rapier (WebAssembly) を初期化中…');
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // 重力はキャラクター側で計算

  loader = new AssetLoader(renderer);
  if (isTouch) { loader.maxSize = 512; loader.maxParallel = 4; }
  loader.onProgress = (d, t) => { if (state === 'loading') setProgress(0.05 + 0.85 * (d / t), `外部アセットを読み込み中… ${d} / ${t}`); };

  // 最初に必要なもの（空・水・主人公・下層の素材）
  const misc = {};
  const essential = Promise.all([
    loader.hdr(URLS.hdr),
    loader.gltf(URLS.hero),
    loader.texture(URLS.waterNormals).then((t) => (misc.waterNormals = t)),
    loader.texture(URLS.smoke, true).then((t) => (misc.smoke = t)),
    loader.texture(URLS.noise).then((t) => (misc.noise = t)),
    loader.texture(URLS.spark, true).then((t) => (misc.spark = t)),
    loader.texture(URLS.flare0, true).then((t) => (misc.flare0 = t)),
    loader.texture(URLS.flare3, true).then((t) => (misc.flare3 = t)),
  ]);
  mats = new MaterialLibrary(loader, TEXTURE_SETS);
  const nearTextures = Promise.all(Object.entries(TEXTURE_SETS).filter(([, s]) => s.zone <= 1).map(([k]) => mats.load(k)));

  props = new PropManager({ loader, scene, world, RAPIER });
  level = new Level({ RAPIER, world, scene, mats, props });
  level.build();
  level.onCrumble = () => audio.play('crumble', { volume: 0.6 });
  world.step();

  const [[hdr, hero]] = await Promise.all([essential, nearTextures]);
  setGrimeTexture(misc.noise);
  await props.loadZones(1);

  setProgress(0.92, '空と海を準備中…');
  fx = new FX(renderer, scene, camera, { hdr, misc }, settings.quality);
  fx.setupCloudSea(level.zoneStarts[10] + level.startTop - 6);
  const g0 = level.goal;
  fx.setupBlackHole(new THREE.Vector3(g0.pos.x - 900, g0.top + 380, g0.pos.z - 1500), 1100);
  addAstronaut(hero);
  player = new Player({ RAPIER, world, scene, gltf: hero, level, events: playerEvents });
  player.spawn(level.spawnPoint);
  rig = new CameraRig(camera, RAPIER, world, player.collider);
  input = new Input(renderer.domElement, { touch: isTouch });
  input.onPause = () => (state === 'playing' ? pause() : state === 'paused' ? resume() : null);
  input.onGamepad = (id) => toast(`ゲームパッド接続: ${id.slice(0, 28)}`);
  audio = new Audio();

  applySettings();
  setupUI();
  buildAltBar();

  setProgress(0.96, 'シェーダーをコンパイル中…');
  try { await renderer.compileAsync(scene, camera); } catch { /* 非対応環境 */ }
  setProgress(1, '準備完了');

  addEventListener('resize', () => fx.resize());
  requestAnimationFrame(frame);
  await gsap.to('#loading', { opacity: 0, duration: 0.6, delay: 0.2 });
  $('loading').hidden = true;
  showTitle();
  loadRest();

  if (!IS_ARTIFACT && 'serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/** 上層の素材はプレイ中に裏で読み込む */
async function loadRest() {
  const bg = $('bgLoad');
  const tick = () => {
    const left = loader.total - loader.done;
    bg.hidden = left <= 0;
    bg.textContent = `上層の素材を読み込み中… 残り ${left}`;
  };
  loader.onProgress = tick;
  const keys = Object.entries(TEXTURE_SETS).sort((a, b) => a[1].zone - b[1].zone).map(([k]) => k);
  const texJob = (async () => { for (const k of keys) await mats.load(k).catch(() => {}); })();
  const spaceJob = Promise.all([loader.cubeTexture(URLS.stars), loader.texture(URLS.earth, true), loader.texture(URLS.earthClouds, true)])
    .then(([s, e, c]) => fx.setupSpace(s, e, c)).catch((e) => console.warn(e));
  tick();
  await Promise.all([texJob, props.loadAll(), spaceJob]);
  bg.hidden = true;
}

// ------------------------------------------------------------------ player events → 演出
const playerEvents = {
  onJump() {
    audio.play('jump', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
    const p = player.position; p.y -= 0.9;
    fx.puff(p, 3, 0.6);
  },
  onLand(drop, ground) {
    if (state !== 'playing') return;
    if (drop > 1.0) {
      audio.play('land', { volume: Math.min(1, 0.25 + drop * 0.05), rate: 1.1 - Math.min(0.3, drop * 0.01) });
      const p = player.position; p.y -= 0.9;
      const snowy = ground?.surface === 'ice' || ground?.spec?.mat === 'snow';
      fx.puff(p, Math.min(14, 3 + Math.floor(drop / 2)), Math.min(2.2, 0.6 + drop * 0.05), snowy ? 0xf2f6ff : 0xd8c8b0);
    }
    if (drop > 4) input.rumble(Math.min(1, drop / 30), 0.4, 140);
    if (drop > 10) {
      game.falls++;
      game.fallMeters += drop;
      game.maxFall = Math.max(game.maxFall, drop);
      rig.shake = Math.min(1.4, drop / 30);
      audio.play('fall', { volume: Math.min(1, 0.4 + drop / 80) });
      fallSplash(drop);
    }
  },
  onGrab() {
    audio.play('grab', { volume: 0.5, rate: 0.9 + Math.random() * 0.2 });
    input.rumble(0.15, 0.3, 60);
    hint('climb');
  },
  onClimb() { audio.play('climb', { volume: 0.45, rate: 0.9 + Math.random() * 0.15 }); hideHint('climb'); },
  onStep() { audio.play('step', { volume: 0.12, rate: 0.85 + Math.random() * 0.3, throttle: 0.15 }); },
  onBounce(p) {
    audio.play('bounce', { volume: 0.8 });
    fx.burst(player.position, 18, 0x66e0ff, 6);
    input.rumble(0.6, 0.6, 160);
    if (p.pad) gsap.to(p.pad.material.uniforms.uKick, { value: 0, duration: 0.6 });
  },
  onFan() { audio.play('fan', { volume: 0.6, rate: 0.7, throttle: 1 }); input.rumble(0.2, 0.5, 200); },
  onHit() {
    audio.play('hit', { volume: 0.9 });
    rig.shake = 0.8;
    input.rumble(1, 0.8, 220);
  },
};

// ------------------------------------------------------------------ loop
let last = performance.now();
const STEP = 1 / 60;
const IDLE = { move: { x: 0, y: 0 }, sprint: false, jumpHeld: false, jumpPressed: false, look: { x: 0, y: 0, zoom: 0 } };

function simulate(dt, inp) {
  const steps = Math.ceil(dt / STEP - 1e-6) || 1;
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    simTime += h;
    level.update(simTime, h);
    world.timestep = h;
    world.step();
    player.step(h, i === 0 ? inp : { ...inp, jumpPressed: false }, rig.yaw, simTime);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  stats?.begin();

  const inp = input.poll(dt);
  if (state === 'playing') {
    simulate(dt, inp);
    game.time += dt;
    gameLogic(dt);
  } else if (state === 'clear') {
    simulate(dt, IDLE);
  } else if (state !== 'paused') {
    simTime += dt;
    level.update(simTime, dt);
    world.timestep = dt;
    world.step();
  }

  player.updateVisual(state === 'paused' ? 0 : dt);
  if (astronaut && state !== 'paused') astronaut.mixer.update(dt);
  let speedFx = 0;
  let focusY = player.root.position.y;
  if (state === 'title') {
    const a = simTime * 0.04;
    camera.position.set(Math.cos(a) * 58, 14 + Math.sin(simTime * 0.1) * 4, Math.sin(a) * 58);
    camera.lookAt(0, 90, 0);
    camera.fov = settings.fov + 8; camera.updateProjectionMatrix();
    focusY = 40;
  } else {
    speedFx = rig.update(state === 'paused' ? 0 : dt, inp.look, player.root.position, { vy: player.vy, sprint: inp.sprint && player.hSpeed > 5 });
  }
  level.updateVisuals(simTime, camera, focusY);
  flash = Math.max(0, flash - dt * 2.5);
  fx.update(dt, state === 'title' ? new THREE.Vector3(0, 30, 0) : player.root.position, {
    speed: speedFx, flash, tint: ZONE_TINT[level.zoneAt(game.height)] || ZONE_TINT[0],
  });
  fx.updateAltitude(Math.max(0, camera.position.y - level.startTop), level.zoneStarts[11]);
  fx.adaptResolution(dt);
  fx.render();
  if (state === 'playing') updateHUD();
  stats?.end();
}

function gameLogic(dt) {
  const pos = player.position;
  const feet = pos.y - 0.9;
  game.height = Math.max(0, feet - level.startTop);
  if (game.height > game.best + 0.05) {
    if (Math.floor(game.height / 100) > Math.floor(game.best / 100) && game.best > 1) {
      toast(`標高 ${Math.floor(game.height / 100) * 100} m`);
      audio.play('record', { volume: 0.5 });
    }
    game.best = game.height;
  }

  const z = level.zoneAt(game.height);
  if (z > game.zoneSeen && player.grounded) {
    game.zoneSeen = z;
    banner(ZONES[z].en, ZONES[z].name);
    audio.play('zone', { volume: 0.7 });
  }

  // 落下中は落ちた高さを表示
  const fd = player.fallDist || 0;
  const fm = $('fallMeter');
  if (fd > 12 && !player.grounded) { fm.hidden = false; fm.textContent = `−${fd.toFixed(0)} m`; }
  else if (!fm.hidden) fm.hidden = true;

  const g = level.goal;
  if (player.grounded && feet > g.top - 0.6 && Math.hypot(pos.x - g.pos.x, pos.z - g.pos.z) < g.r) { clearGame(); return; }

  // 海へ落ちたらスタートの岩から（チェックポイントは無い）
  if (pos.y < -1.5 && !player.frozen) {
    audio.play('splash', { volume: 0.9 });
    game.falls++;
    rig.yaw = level.spawnYaw;
    respawn(level.spawnPoint, '海に落ちた… 最初の岩から');
    return;
  }

  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 3; persist(); }
}

function fallSplash(drop) {
  const el = $('fallBig');
  el.textContent = `−${drop.toFixed(0)} m`;
  gsap.killTweensOf(el);
  gsap.timeline()
    .fromTo(el, { opacity: 0, scale: 1.4, x: 0, y: 0 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)' })
    .to(el, { x: 6, duration: 0.05, repeat: 5, yoyo: true })
    .to(el, { opacity: 0, y: 20, duration: 0.8, delay: 1.2 });
  if (drop > 60) toast(`最高 ${Math.floor(game.best)} m から ${drop.toFixed(0)} m 落下…`);
}

/** ゴールで待つ宇宙飛行士（主人公モデルの複製に白い質感） */
function addAstronaut(gltf) {
  const a = cloneSkinned(gltf.scene);
  a.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.color = new THREE.Color(0xf2f2f0); o.material.map = null; o.material.roughness = 0.55; o.material.metalness = 0.1;
      o.castShadow = true; o.frustumCulled = false;
    }
  });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.9, roughness: 0.08, envMapIntensity: 2 }));
  const head = a.getObjectByName('mixamorigHead');
  if (head) { helmet.scale.setScalar(1 / (a.scale.x || 1) / 0.01); helmet.position.y = 10; head.add(helmet); }
  const g = level.goal;
  a.position.copy(g.astronautPos); a.position.y = g.top;
  a.lookAt(g.pos.x, g.top, g.pos.z);
  a.rotation.y += Math.PI;
  scene.add(a);
  const mixer = new THREE.AnimationMixer(a);
  const idle = gltf.animations.find((c) => c.name === 'Idle');
  if (idle) mixer.clipAction(idle).play();
  astronaut = { root: a, mixer };
}

/** 状況に応じた操作ヒント（初回だけ数回まで） */
const HINTS = {
  climb: () => (isTouch ? '▲ / 壁に向かってスティックで よじ登る' : 'W / Space で よじ登る　S で離す'),
  move: () => (isTouch ? '左でスティック・右でカメラ・▲でジャンプ' : 'WASD 移動　Space ジャンプ（長押しで高く）　Shift ダッシュ'),
  ledge: () => '高い段差は 跳んで縁をつかむ',
};
const hintShown = {};
let hintKey = null;
function hint(key) {
  hintShown[key] = (hintShown[key] || 0) + 1;
  if (hintShown[key] > 4) return;
  hintKey = key;
  const el = $('ctxHint');
  el.textContent = HINTS[key]();
  el.hidden = false;
  gsap.killTweensOf(el);
  gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25 });
}
function hideHint(key) {
  if (key && hintKey !== key) return;
  hintKey = null;
  const el = $('ctxHint');
  gsap.to(el, { opacity: 0, duration: 0.3, onComplete: () => { el.hidden = true; } });
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

function persist() {
  if (state !== 'playing' && state !== 'paused') return;
  const s = player.lastSafe;
  Save.store({ time: game.time, falls: game.falls, fallMeters: game.fallMeters, maxFall: game.maxFall, best: game.best, zoneSeen: game.zoneSeen, pos: [s.x, s.y, s.z], yaw: rig.yaw });
  Save.bestHeight(game.best);
}

// ------------------------------------------------------------------ flow
function startGame(fromSave) {
  audio.play('click');
  level.reset();
  player.stopDance();
  const sv = fromSave ? Save.load() : null;
  if (sv?.pos) {
    Object.assign(game, { time: sv.time || 0, falls: sv.falls || 0, fallMeters: sv.fallMeters || 0, maxFall: sv.maxFall || 0, best: sv.best || 0, zoneSeen: sv.zoneSeen ?? 0, height: 0 });
    player.spawn(new THREE.Vector3(...sv.pos));
    rig.yaw = sv.yaw ?? rig.yaw;
  } else {
    Object.assign(game, { time: 0, falls: 0, fallMeters: 0, maxFall: 0, best: 0, zoneSeen: 0, height: 0 });
    player.spawn(level.spawnPoint, level.spawnYaw + Math.PI);
    rig.yaw = level.spawnYaw; rig.pitch = 0.3;
    Save.clear();
  }
  rig.snap(player.position);

  gsap.to('#title', { opacity: 0, duration: 0.4, onComplete: () => { $('title').hidden = true; } });
  $('hud').hidden = false;
  $('touch').hidden = !isTouch;
  state = 'playing';
  input.enabled = true;
  input.lockPointer();
  audio.startBgm();
  requestWakeLock();
  if (!sv) {
    setTimeout(() => banner(ZONES[0].en, ZONES[0].name), 400);
    setTimeout(() => { if (state === 'playing') hint('move'); }, 3800);
    setTimeout(() => { if (hintKey === 'move') hint('ledge'); }, 10000);
    setTimeout(() => { if (hintKey === 'ledge') hideHint('ledge'); }, 16000);
  }
  if (isTouch) goFullscreen();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  input.enabled = false;
  input.unlockPointer();
  persist();
  audio.duckBgm(true);
  $('pauseStats').textContent = `最高 ${Math.floor(game.best)} m ・ 落下 ${game.falls} 回（計 ${Math.round(game.fallMeters)} m）`;
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
  const isRecord = Save.storeRecord('onlyup', game.time, game.falls);
  Save.bestHeight(level.totalHeight);
  Save.clear();
  $('clearStats').innerHTML = `
    タイム <b>${fmtTime(game.time)}</b>${isRecord ? ' ・ 自己ベスト' : ''}<br>
    落下 <b>${game.falls}</b> 回 ・ 落ちた距離 合計 <b>${Math.round(game.fallMeters)}</b> m<br>
    最大の落下 <b>${Math.round(game.maxFall)}</b> m ・ 標高 <b>${level.totalHeight.toFixed(0)}</b> m`;
  setTimeout(() => showModal('clear'), 2200);
}

// ------------------------------------------------------------------ UI
function showTitle() {
  $('title').hidden = false;
  gsap.fromTo('#title', { opacity: 0 }, { opacity: 1, duration: 0.6 });
  gsap.fromTo('#title .logo, #title .tagline, #title .menu', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out' });
  const sv = Save.load();
  $('btnContinue').hidden = !sv?.pos;
  if (sv?.pos) $('continueInfo').textContent = `最高 ${Math.floor(sv.best)} m ・ ${fmtTime(sv.time)} ・ 落下 ${sv.falls} 回`;
  const rec = Save.records();
  const parts = [];
  if (rec.bestHeight) parts.push(`最高到達 ${Math.floor(rec.bestHeight)} m`);
  if (rec.onlyup) parts.push(`クリア最速 ${fmtTime(rec.onlyup.time)}`);
  $('records').textContent = parts.join('　・　') || `頂上まで ${level.totalHeight.toFixed(0)} m。チェックポイントはありません。`;
  state = 'title';
}

function showModal(id) {
  $(id).hidden = false;
  gsap.fromTo(`#${id} .panel`, { y: 30, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' });
}
function hideModal(id) { $(id).hidden = true; }

/** confirm() の代わりのページ内ダイアログ */
function ask(message, okLabel) {
  return new Promise((resolve) => {
    $('confirmText').textContent = message;
    $('confirmOk').textContent = okLabel;
    showModal('confirm');
    const done = (v) => { hideModal('confirm'); $('confirmOk').onclick = $('confirmCancel').onclick = null; resolve(v); };
    $('confirmOk').onclick = () => done(true);
    $('confirmCancel').onclick = () => done(false);
  });
}

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
  gsap.timeline().fromTo(t, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25 }).to(t, { opacity: 0, duration: 0.4, delay: 2 });
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
  $('btnNew').onclick = async () => {
    if (Save.load()?.pos && !(await ask('今の登攀記録は消えます。最初から登り直しますか？', '最初から登る'))) return;
    startGame(false);
  };
  $('btnContinue').onclick = () => startGame(true);
  $('btnPause').onclick = () => pause();
  $('btnResume').onclick = () => resume();
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
    const text = `SKYWARD を登頂！ タイム ${fmtTime(game.time)} / 落下 ${game.falls} 回（合計 ${Math.round(game.fallMeters)} m）`;
    try {
      if (navigator.share) { await navigator.share({ title: 'SKYWARD', text, url: location.href }); return; }
    } catch { /* 非対応・キャンセル */ }
    try { await navigator.clipboard.writeText(text); toast('結果をコピーしました'); }
    catch { $('clearStats').insertAdjacentHTML('beforeend', `<br><small>${text}</small>`); }
  };
  document.querySelectorAll('.btn').forEach((b) => b.addEventListener('pointerenter', () => audio.play('hover', { volume: 0.25, throttle: 0.04 })));

  renderer.domElement.addEventListener('click', () => { if (state === 'playing') input.lockPointer(); });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) hadLock = true;
    else if (hadLock && state === 'playing') { hadLock = false; pause(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (state === 'playing') pause(); persist(); }
    else if (state === 'playing' || state === 'paused') requestWakeLock();
  });
  addEventListener('pagehide', persist);

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
  gui.add({ reset: async () => {
    hideModal('settings');
    if (await ask('セーブデータと記録をすべて消去しますか？', '消去する')) { Save.clear(); Save.clearRecords(); quitToTitle(); toast('消去しました'); }
  } }, 'reset').name('データ消去');
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
  props.range = settings.quality === 'low' ? 70 : settings.quality === 'medium' ? 90 : 110;
  props.shadows = settings.quality !== 'low';
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !document.hidden) await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
}
async function goFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch { /* iOS・アーティファクト内などは非対応 */ }
}

boot().catch((e) => {
  console.error(e);
  $('loadError').hidden = false;
  $('loadError').textContent = `読み込みに失敗しました。\n${e.message}\nネットワーク接続を確認して再読み込みしてください。`;
});

// テスト・デバッグ用
window.__skyward = {
  get game() { return game; }, get level() { return level; }, get player() { return player; }, get state() { return state; }, get rig() { return rig; },
  get props() { return props; }, get loader() { return loader; }, get renderer() { return renderer; },
  startGame,
  stepSim(n = 60, inp = {}) {
    const i0 = { ...IDLE, ...inp };
    for (let i = 0; i < n; i++) {
      simTime += STEP; level.update(simTime, STEP); world.timestep = STEP; world.step();
      player.step(STEP, i === 0 ? i0 : { ...i0, jumpPressed: false }, rig.yaw, simTime);
      if (state === 'playing') gameLogic(STEP);
    }
  },
};
