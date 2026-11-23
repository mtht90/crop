import * as THREE from 'three';
import { loadWorld } from './world.js';
import { createFx, COLORS } from './fx.js';
import { createAudio } from './audio.js';
import { createSwipeInput } from './input.js';
import { createStone, stepStone, distanceFromStart, horizontalSpeed, scoreThrow, curveMultiplier } from './physics.js';

const THROWS_PER_ROUND = 5;
const RING_PERIOD = 1.45; // 判定リングが縮む周期 (秒)
const CAM_IDLE = { pos: new THREE.Vector3(0, 1.75, 1.6), look: new THREE.Vector3(0, -0.6, -16) };
const HAND = new THREE.Vector3(0, -0.3, -1.0); // カメラから見た手元の石の位置

const $ = (id) => document.getElementById(id);
const ui = {
  score: $('score'),
  bestVal: $('bestVal'),
  stones: $('stones'),
  live: $('live'),
  skipCount: $('skipCount'),
  distVal: $('distVal'),
  judge: $('judge'),
  feed: $('feed'),
  hint: $('hint'),
  hintMain: $('hintMain'),
  hintSub: $('hintSub'),
  titleSheet: $('titleSheet'),
  startBtn: $('startBtn'),
  loadBar: $('loadBar'),
  resultSheet: $('resultSheet'),
  resultTitle: $('resultTitle'),
  resultRows: $('resultRows'),
  nextBtn: $('nextBtn'),
  finalSheet: $('finalSheet'),
  finalRows: $('finalRows'),
  rankTitle: $('rankTitle'),
  againBtn: $('againBtn'),
  mute: $('mute'),
};

// ---------- 記録 ----------
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('skip-stone:' + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('skip-stone:' + k, JSON.stringify(v));
    } catch {}
  },
};
const best = { total: store.get('bestTotal', 0), skips: store.get('bestSkips', 0), dist: store.get('bestDist', 0) };
ui.bestVal.textContent = best.total.toLocaleString();

// ---------- レンダラー ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 6000);
camera.position.copy(CAM_IDLE.pos);
const camLook = CAM_IDLE.look.clone();
camera.lookAt(camLook);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 縦長では縦の画角を広げ、横幅が狭くなりすぎないようにする
  camera.fov = camera.aspect < 0.8 ? 64 : camera.aspect < 1.2 ? 56 : 46;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const audio = createAudio();
ui.mute.textContent = audio.muted ? '音 OFF' : '音 ON';
ui.mute.setAttribute('aria-pressed', String(audio.muted));
ui.mute.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  ui.mute.textContent = audio.muted ? '音 OFF' : '音 ON';
  ui.mute.setAttribute('aria-pressed', String(audio.muted));
});

// ---------- 読み込み ----------
const fontsReady = Promise.race([
  Promise.all([document.fonts.load('800 40px "Baloo 2"'), document.fonts.load('800 20px "M PLUS Rounded 1c"')]).catch(() => {}),
  new Promise((r) => setTimeout(r, 2500)),
]);
await fontsReady;
const world = await loadWorld(renderer, (p) => (ui.loadBar.style.width = `${Math.round(p * 100)}%`)).catch((e) => {
  console.error(e);
  ui.startBtn.textContent = '読み込みに失敗しました。再読み込みしてください';
  throw e;
});
ui.loadBar.style.width = '100%';
const { scene } = world;
const fx = createFx(scene);

// ---------- 石 ----------
function makeStoneGeometry(seed) {
  const g = new THREE.SphereGeometry(1, 48, 24);
  const p = g.attributes.position;
  const a = seed * 7.13;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = 1 + 0.07 * Math.sin(3 * x + a) * Math.sin(2.2 * z + a * 0.7) + 0.04 * Math.sin(5 * z + 2 * x + a);
    // 上下は平らに近づける
    const flat = 1 - 0.18 * Math.pow(Math.abs(y), 3);
    p.setXYZ(i, x * r, y * r * flat, z * r);
  }
  g.computeVertexNormals();
  return g;
}
const STONE_TINTS = [0xd6d0c6, 0xbdb6ac, 0xe0ccb0, 0xb4bac0, 0xcdbba6];
const stoneRoot = new THREE.Group();
const stoneTilt = new THREE.Group();
const stoneSpin = new THREE.Group();
const stoneMesh = new THREE.Mesh(makeStoneGeometry(1), world.stoneMaterial);
stoneMesh.scale.set(0.072, 0.022, 0.058);
stoneSpin.add(stoneMesh);
stoneTilt.add(stoneSpin);
stoneRoot.add(stoneTilt);
scene.add(stoneRoot);

// ---------- ゲームの状態 ----------
const game = {
  state: 'title', // title | aim | flying | sunk | result | final
  throwNo: 0,
  total: 0,
  results: [],
  streak: 0,
  timeScale: 1,
  slowmo: 0,
};
let sim = null; // 物理の石
let throwInfo = null; // 今回の投げ(判定など)
let grab = null; // 指でつかんでいる情報
let ringClock = 0;
let aimSettle = 0;
const handPos = HAND.clone();
const handTarget = HAND.clone();
let spinVisual = 0;
let sinkTimer = 0;
const heading = new THREE.Vector3(0, 0, -1);
const camGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();

function renderPips() {
  ui.stones.innerHTML = '';
  for (let i = 0; i < THROWS_PER_ROUND; i++) {
    const p = document.createElement('span');
    p.className = 'pip' + (i < game.throwNo - (game.state === 'aim' ? 1 : 0) ? ' used' : '') + (i === game.throwNo - 1 && game.state === 'aim' ? ' now' : '');
    ui.stones.appendChild(p);
  }
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function newThrow() {
  game.throwNo += 1;
  game.state = 'aim';
  aimSettle = 0;
  sim = null;
  grab = null;
  spinVisual = 0;
  handTarget.copy(HAND);
  handPos.copy(HAND).add(new THREE.Vector3(0, -0.5, 0));
  stoneMesh.geometry.dispose();
  stoneMesh.geometry = makeStoneGeometry(game.throwNo + Math.random() * 10);
  world.stoneMaterial.color.setHex(STONE_TINTS[(game.throwNo + Math.floor(Math.random() * 5)) % STONE_TINTS.length]);
  stoneRoot.visible = true;
  stoneMesh.material.opacity = 1;
  fx.clearTrail();

  // 判定リング: 毎回少し違う場所に出る
  const tz = 0.6 - rand(8.5, 12.5);
  const tx = rand(-1.6, 1.6);
  fx.setTarget(tx, tz, 2.3);
  ringClock = 0;

  // 光の輪(ボーナス)
  const rings = [];
  const count = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    rings.push({ x: rand(-6, 6), z: -rand(18 + i * 14, 30 + i * 16), r: rand(1.5, 2.0) });
  }
  fx.setBonusRings(rings);

  ui.hint.hidden = false;
  setHint();
  ui.live.classList.remove('on');
  renderPips();
}

function setHint() {
  ui.hintMain.textContent = '石を上へはじいて投げる';
  ui.hintSub.textContent = 'リングが小さい瞬間を狙う・くるくる回すとカーブ';
}

function gradeFromRing(k) {
  if (k <= 0.36) return { judge: 'excellent', q: 0.9 + (0.36 - k) / 0.36 * 0.1 };
  if (k <= 0.66) return { judge: 'great', q: 0.62 + (0.66 - k) / 0.3 * 0.23 };
  return { judge: 'nice', q: 0.3 + (1 - k) / 0.34 * 0.25 };
}
const ringK = () => 1 - 0.88 * ((ringClock % RING_PERIOD) / RING_PERIOD);

// ---------- 入力 ----------
const tmpV = new THREE.Vector3();
function screenToHand(x, y) {
  const ndcX = (x / window.innerWidth) * 2 - 1;
  const ndcY = -(y / window.innerHeight) * 2 + 1;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = -HAND.z;
  return new THREE.Vector3(ndcX * tanV * camera.aspect * d, ndcY * tanV * d, HAND.z);
}

createSwipeInput(canvas, {
  canGrab(x, y) {
    return game.state === 'aim' && aimSettle > 0.6 && y > window.innerHeight * 0.45;
  },
  onGrab(s) {
    grab = s;
    const p = screenToHand(s.x, s.y - 36);
    handTarget.copy(p);
  },
  onDrag(s) {
    const p = screenToHand(s.x, s.y - 36);
    handTarget.copy(p);
  },
  onCancel() {
    grab = null;
    handTarget.copy(HAND);
  },
  onThrow(t) {
    grab = null;
    launch(t);
  },
});

function launch(t) {
  const k = ringK();
  const g = gradeFromRing(k);
  // はじく速さ → 初速(だんだん頭打ちになるように)
  const speed = 6 + 20 * (1 - Math.exp(-(t.up - 0.9) / 2.6));
  const xOff = (t.x / window.innerWidth - 0.5) * 0.25;
  const yaw = THREE.MathUtils.clamp(Math.atan2(t.side, t.up) * 0.55 + xOff, -0.6, 0.6);

  const start = new THREE.Vector3();
  stoneMesh.getWorldPosition(start);
  start.y = Math.max(1.15, start.y);
  sim = createStone({
    pos: { x: start.x, y: start.y, z: start.z },
    speed,
    yaw,
    quality: g.q,
    spin: t.spin,
    spinDir: t.spinDir,
  });
  throwInfo = {
    judge: g.judge,
    ringK: k,
    curve: t.spin > 0,
    curveMul: curveMultiplier(t.spin),
    over: t.spin > 1,
    spinDir: t.spinDir,
    firstDone: false,
    inRing: false,
    rings: 0,
    power: (speed - 6) / 20,
  };
  fx.targetState.frozen = true;
  game.state = 'flying';
  heading.set(Math.sin(yaw), 0, -Math.cos(yaw));
  ui.hint.hidden = true;
  ui.live.classList.add('on');
  ui.skipCount.textContent = '0';
  ui.distVal.textContent = '0.0';
  audio.throw(throwInfo.power);
  spinVisual = 22 + speed;
}

// ---------- 演出 ----------
function showJudge(text, cls) {
  ui.judge.className = 'ui';
  void ui.judge.offsetWidth;
  ui.judge.textContent = text;
  ui.judge.className = `ui show ${cls}`;
}
function chip(text, cls = '') {
  const c = document.createElement('div');
  c.className = `chip ${cls}`;
  c.textContent = text;
  ui.feed.appendChild(c);
  setTimeout(() => c.remove(), 2500);
}
function vibrate(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
const JUDGE_LABEL = { nice: 'Nice!', great: 'Great!', excellent: 'Excellent!' };

function onContact(e) {
  const at = e.at;
  const pan = THREE.MathUtils.clamp((at.x - camera.position.x) / 8, -0.8, 0.8);
  const dir = new THREE.Vector3(sim.vel.x, 0, sim.vel.z).normalize();

  if (!throwInfo.firstDone) {
    throwInfo.firstDone = true;
    const tp = fx.target.position;
    const inRing = Math.hypot(at.x - tp.x, at.z - tp.z) <= fx.targetState.radius;
    throwInfo.inRing = inRing && e.type === 'skip';
    if (e.type === 'sink') {
      showJudge('ドボン…', 'miss');
      fx.hideTarget();
    } else if (inRing) {
      const j = throwInfo.judge;
      showJudge(JUDGE_LABEL[j], j);
      fx.flashTarget(COLORS[j]);
      audio.judge(j);
      if (j === 'excellent') {
        game.slowmo = 0.55;
        fx.sparkle(at, COLORS.excellent, 60, 2.5);
        vibrate(30);
      }
    } else {
      fx.hideTarget();
      chip('リングの外');
    }
    if (throwInfo.curve && e.type === 'skip') chip(`カーブ ×${throwInfo.curveMul.toFixed(2)}`, 'mint');
  }

  if (e.type === 'skip') {
    ui.skipCount.textContent = String(e.index);
    ui.skipCount.classList.remove('bump');
    void ui.skipCount.offsetWidth;
    ui.skipCount.classList.add('bump');
    fx.skipSplash(at, dir, Math.min(1, e.impact / 5) + Math.min(0.6, e.speed / 30));
    audio.skip(e.index, e.speed, pan);
    if (e.index % 5 === 0) vibrate(12);
    else vibrate(5);
    const b = fx.hitBonus(at);
    if (b) {
      throwInfo.rings += 1;
      audio.bonus();
      chip('光の輪 +250', 'gold');
      vibrate(25);
    }
  } else {
    fx.sinkSplash(at, e.reason === 'steep' ? 1.3 : 0.8);
    audio.sink(e.reason === 'steep');
    game.state = 'sunk';
    sinkTimer = 0;
    if (e.reason === 'tumble' && sim.skips > 0) chip('バランスを崩した');
  }
}

function finishThrow() {
  const skips = sim.skips;
  const distance = distanceFromStart(sim, sim.lastContact || sim.pos);
  const judge = throwInfo.inRing ? throwInfo.judge : null;
  game.streak = judge === 'excellent' ? game.streak + 1 : 0;
  const s = scoreThrow({ skips, distance, judge, curveMul: skips > 0 ? throwInfo.curveMul : 1, rings: throwInfo.rings, streak: game.streak });
  game.total += s.total;
  game.results.push({ skips, distance, judge, score: s.total });
  ui.score.textContent = game.total.toLocaleString();

  const rows = [];
  rows.push(row('スキップ', `${skips} 回`, `+${s.skipPts}`));
  rows.push(row('飛距離', `${distance.toFixed(1)} m`, `+${s.distPts}`));
  if (throwInfo.rings) rows.push(row('光の輪', `${throwInfo.rings} 個`, `+${s.ringPts}`));
  rows.push(row('判定', judge ? JUDGE_LABEL[judge].replace('!', '') : 'リング外', `×${s.judgeMul.toFixed(1)}`, true));
  if (s.curveMul > 1) rows.push(row('カーブ', '', `×${s.curveMul.toFixed(2)}`, true));
  if (s.streakMul > 1) rows.push(row(`連続Excellent ${game.streak}`, '', `×${s.streakMul.toFixed(1)}`, true));
  rows.push(`<div class="row total"><span>得点</span><b>+${s.total.toLocaleString()}</b></div>`);
  ui.resultRows.innerHTML = rows.join('');
  ui.resultTitle.textContent = `第${game.throwNo}投`;
  ui.nextBtn.textContent = game.throwNo >= THROWS_PER_ROUND ? '結果を見る' : '次の石へ';
  ui.resultSheet.classList.add('open');
  game.state = 'result';
  setTimeout(() => ui.nextBtn.focus({ preventScroll: true }), 450);
}
function row(label, value, pts, mul = false) {
  return `<div class="row${mul ? ' mul' : ''}"><span>${label}${value ? `　${value}` : ''}</span><b>${pts}</b></div>`;
}

function rankFor(total) {
  if (total < 3000) return '見習いの石投げ';
  if (total < 7000) return '水切り好き';
  if (total < 12000) return '湖の常連';
  if (total < 18000) return '水切り名人';
  return '湖の伝説';
}

function showFinal() {
  game.state = 'final';
  const maxSkips = Math.max(...game.results.map((r) => r.skips));
  const maxDist = Math.max(...game.results.map((r) => r.distance));
  const newTotal = game.total > best.total;
  const newSkips = maxSkips > best.skips;
  const newDist = maxDist > best.dist;
  if (newTotal) best.total = game.total;
  if (newSkips) best.skips = maxSkips;
  if (newDist) best.dist = maxDist;
  store.set('bestTotal', best.total);
  store.set('bestSkips', best.skips);
  store.set('bestDist', Math.round(best.dist * 10) / 10);
  ui.bestVal.textContent = best.total.toLocaleString();
  const rec = (b) => (b ? ' <span class="newrec">新記録</span>' : '');
  ui.rankTitle.textContent = rankFor(game.total);
  ui.finalRows.innerHTML = [
    `<div class="row"><span>最多スキップ${rec(newSkips)}</span><b>${maxSkips} 回</b></div>`,
    `<div class="row"><span>最長飛距離${rec(newDist)}</span><b>${maxDist.toFixed(1)} m</b></div>`,
    `<div class="row"><span>自己ベスト</span><b>${best.total.toLocaleString()}</b></div>`,
    `<div class="row total"><span>合計${rec(newTotal)}</span><b>${game.total.toLocaleString()}</b></div>`,
  ].join('');
  ui.finalSheet.classList.add('open');
  setTimeout(() => ui.againBtn.focus({ preventScroll: true }), 450);
}

ui.nextBtn.addEventListener('click', () => {
  ui.resultSheet.classList.remove('open');
  ui.live.classList.remove('on');
  if (game.throwNo >= THROWS_PER_ROUND) showFinal();
  else newThrow();
});
ui.againBtn.addEventListener('click', () => {
  ui.finalSheet.classList.remove('open');
  game.throwNo = 0;
  game.total = 0;
  game.results = [];
  game.streak = 0;
  ui.score.textContent = '0';
  newThrow();
});
ui.startBtn.disabled = false;
ui.startBtn.textContent = 'はじめる';
ui.startBtn.addEventListener('click', async () => {
  audio.unlock();
  ui.titleSheet.classList.remove('open');
  newThrow();
});

// テスト用: ?debug を付けると外から投げられる
if (new URLSearchParams(location.search).has('debug')) {
  window.__skip = { launch, game, get ringK() { return ringK(); } };
}

// ---------- ループ ----------
const clock = new THREE.Clock();
let elapsed = 0;
const tmpQ = new THREE.Vector3();
const SUB = 1 / 240;
let acc = 0;

function updateAim(dt) {
  aimSettle += dt;
  ringClock += dt;
  const k = ringK();
  const g = gradeFromRing(k);
  fx.setInner(k, COLORS[g.judge]);

  // 手元の石: 指に追従、離していればゆらゆら
  handPos.lerp(handTarget, 1 - Math.exp(-dt * (grab ? 22 : 8)));
  const bob = grab ? 0 : Math.sin(elapsed * 2.2) * 0.008;
  tmpQ.copy(handPos);
  tmpQ.y += bob;
  stoneRoot.position.copy(camera.localToWorld(tmpQ.clone()));
  stoneRoot.quaternion.copy(camera.quaternion);
  // 溜まった回転は石の回る速さだけで見せる。回しすぎると石が暴れる
  const sp = grab ? grab.spinAt(performance.now()) : { charge: 0, dir: 1 };
  const over = Math.max(0, sp.charge - 1);
  const shake = over * 0.35;
  stoneTilt.rotation.set(
    0.85 + Math.sin(elapsed * 31) * shake,
    0,
    (grab ? 0 : Math.sin(elapsed * 1.3) * 0.08) + Math.sin(elapsed * 27 + 1) * shake,
  );
  spinVisual += ((grab ? sp.charge * 38 : 0.6) - spinVisual) * Math.min(1, dt * 10);
  stoneSpin.rotation.y += spinVisual * dt * (sp.dir || 1) * -1;
}

function updateFlight(dt) {
  acc += dt;
  while (acc >= SUB) {
    acc -= SUB;
    for (const e of stepStone(sim, SUB)) onContact(e);
    if (game.state !== 'flying') break;
  }
  const p = sim.pos;
  stoneRoot.position.set(p.x, Math.max(p.y, 0.012), p.z);
  const vh = horizontalSpeed(sim);
  if (vh > 0.1) {
    stoneRoot.rotation.set(0, Math.atan2(-sim.vel.x, -sim.vel.z), 0);
    heading.lerp(tmpV.set(sim.vel.x / vh, 0, sim.vel.z / vh), 1 - Math.exp(-dt * 3)).normalize();
  }
  stoneRoot.quaternion.setFromEuler(stoneRoot.rotation);
  const wob = sim.wobble;
  stoneTilt.rotation.set(0.33 + Math.sin(elapsed * 11) * wob * 0.25, 0, Math.sin(elapsed * 9) * wob * 0.45);
  spinVisual = 10 + vh * 2.2 * (0.4 + 0.6 * sim.spin);
  stoneSpin.rotation.y += spinVisual * dt * (sim.spinDir || 1) * -1;
  fx.updateTrail(camera, stoneRoot.position);
  ui.distVal.textContent = distanceFromStart(sim).toFixed(1);
}

function updateSunk(dt) {
  sinkTimer += dt;
  // ゆっくり沈んで見えなくなる
  const p = sim.lastContact || sim.pos;
  stoneRoot.position.set(p.x, -sinkTimer * 0.6, p.z);
  stoneRoot.visible = sinkTimer < 0.5;
  fx.updateTrail(camera, null);
  if (sinkTimer > 1.5 && game.state === 'sunk') finishThrow();
}

function updateCamera(dt) {
  const st = game.state;
  let kPos = 3;
  let kLook = 4;
  if (st === 'flying' || st === 'sunk' || st === 'result') {
    const p = st === 'flying' ? stoneRoot.position : sim.lastContact || sim.pos;
    const back = st === 'flying' ? 5.4 : 8.5;
    const up = st === 'flying' ? 2.1 : 3.4;
    camGoal.copy(p).addScaledVector(heading, -back);
    camGoal.y = Math.max(1.3, up + p.y * 0.4);
    lookGoal.copy(p).addScaledVector(heading, st === 'flying' ? 7 : 1.5);
    lookGoal.y = 0;
    kPos = st === 'flying' ? 2.6 : 1.2;
    kLook = st === 'flying' ? 5 : 2;
  } else {
    camGoal.copy(CAM_IDLE.pos);
    lookGoal.copy(CAM_IDLE.look);
    if (st === 'title' || st === 'final') {
      // タイトル中はゆっくり景色を眺める
      camGoal.x += Math.sin(elapsed * 0.15) * 0.6;
      lookGoal.x += Math.sin(elapsed * 0.11) * 4;
      lookGoal.y += 1.2;
    }
  }
  camera.position.lerp(camGoal, 1 - Math.exp(-dt * kPos));
  camLook.lerp(lookGoal, 1 - Math.exp(-dt * kLook));
  camera.lookAt(camLook);
}

function frame() {
  const realDt = Math.min(clock.getDelta(), 0.05);
  if (game.slowmo > 0) {
    game.slowmo -= realDt;
    game.timeScale = 0.3;
  } else {
    game.timeScale += (1 - game.timeScale) * Math.min(1, realDt * 5);
  }
  const dt = realDt * game.timeScale;
  elapsed += dt;

  updateCamera(realDt);
  if (game.state === 'aim') updateAim(realDt);
  else if (game.state === 'flying') updateFlight(dt);
  else if (game.state === 'sunk' || game.state === 'result') updateSunk(dt);
  if (game.state === 'title' || game.state === 'final') stoneRoot.visible = false;

  world.update(elapsed, dt);
  fx.update(dt, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 画面を消したときに音を止める
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clock.getDelta();
});
