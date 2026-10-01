// クライアント本体: 画面遷移・通信・入力・予測・描画ループ
import { BTN, HEALTH, TICK_DT, INTERP_DELAY, RADIUS, SPEED, VISION, INTERACT_RANGE } from '/shared/constants.js';
import { CollisionGrid, moveCircle, inputDir } from '/shared/physics.js';
import { SURVIVOR_ANIMALS, ANIMAL_IDS } from '/shared/animals.js';
import {
  drawAnimal,
  drawPortrait,
  buildStaticLayer,
  drawPallet,
  drawGen,
  drawCage,
  drawCageFront,
  drawLocker,
  drawGate,
  drawHatch,
  visibilityPolygon,
  animalLook,
} from './render.js';
import { unlockAudio, play, playAt } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');

// ==================== 状態 ====================
const S = {
  ws: null,
  you: null, // 自分の id
  lobby: null,
  screen: 'title',
  // ゲーム中
  game: null,
};

function newGameState(msg) {
  const map = { ...msg.map, seed: msg.seed };
  const grid = new CollisionGrid(map);
  return {
    map,
    grid,
    role: msg.role,
    layer: buildStaticLayer(map),
    snap: null,
    prevSnap: null,
    me: null,
    pred: null, // 予測位置
    smooth: { x: 0, y: 0 }, // 予測補正を滑らかにするオフセット
    pending: [],
    seq: 0,
    others: new Map(), // id -> { buf: [], last }
    timeOffset: null,
    palletStates: map.pallets.map(() => 'up'),
    gatesOpen: map.gates.map(() => false),
    skill: null,
    skillFlash: null,
    particles: [],
    heartbeatAt: 0,
    lastHeartbeat: 0,
    started: performance.now(),
    gensDoneFx: new Set(),
  };
}

// ==================== 通信 ====================
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  S.ws = ws;
  $('conn').classList.remove('hidden');
  ws.onopen = () => {
    $('conn').classList.add('hidden');
    const params = new URLSearchParams(location.search);
    if (params.get('room') && !S.lobby) $('room-code').value = params.get('room').toUpperCase();
  };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    $('conn').textContent = '接続が切れました。再接続中…';
    $('conn').classList.remove('hidden');
    S.game = null;
    S.lobby = null;
    show('title');
    setTimeout(connect, 1500);
  };
}

function send(msg) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(msg));
}

function onMessage(msg) {
  switch (msg.type) {
    case 'joined':
      S.you = msg.you;
      history.replaceState(null, '', `?room=${msg.room}`);
      break;
    case 'lobby':
      S.lobby = msg;
      renderLobby();
      if (msg.state === 'lobby' && !S.game && S.screen !== 'results') show('lobby');
      break;
    case 'start':
      S.you = msg.you;
      S.game = newGameState(msg);
      show('game');
      // タイトル画面の入力欄にフォーカスが残るとキー入力を奪われる
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      toast(
        msg.role === 'hunter' ? '🐺 あなたはハンター! サバイバーを捕まえて鳥かごへ' : '🐰 あなたはサバイバー! オルゴールを直して脱出しよう',
        'info',
      );
      toast('H キーで操作説明', 'info');
      break;
    case 'snap':
      onSnap(msg);
      break;
    case 'over':
      showResults(msg.result);
      S.game = null;
      break;
    case 'error':
      toast(msg.text, 'bad');
      break;
    case 'left':
      S.lobby = null;
      history.replaceState(null, '', location.pathname);
      show('title');
      break;
  }
}

// ==================== 画面 ====================
function show(name) {
  S.screen = name;
  for (const id of ['title', 'lobby', 'results']) $(id).classList.toggle('hidden', id !== name);
  $('help').classList.add('hidden');
}

const nameInput = $('name');
nameInput.value = safeGet('mofu-name') || '';
function myName() {
  const n = nameInput.value.trim() || 'どうぶつ';
  safeSet('mofu-name', n);
  return n;
}
function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* プライベートモード等 */
  }
}

$('btn-create').onclick = () => {
  unlockAudio();
  send({ type: 'create', name: myName() });
};
$('btn-join').onclick = () => {
  unlockAudio();
  send({ type: 'join', room: $('room-code').value.trim().toUpperCase(), name: myName() });
};
$('room-code').addEventListener('keydown', (e) => e.key === 'Enter' && $('btn-join').click());
$('btn-solo-survivor').onclick = () => {
  unlockAudio();
  send({ type: 'quick', role: 'survivor', name: myName(), level: Number($('solo-level').value), animal: safeGet('mofu-animal') || 'rabbit' });
};
$('btn-solo-hunter').onclick = () => {
  unlockAudio();
  send({ type: 'quick', role: 'hunter', name: myName(), level: Number($('solo-level').value) });
};
$('btn-leave').onclick = () => send({ type: 'leave' });
$('btn-start').onclick = () => {
  unlockAudio();
  send({ type: 'start' });
};
$('btn-fill').onclick = () => send({ type: 'fillBots' });
for (const b of document.querySelectorAll('[data-bot]')) b.onclick = () => send({ type: 'addBot', role: b.dataset.bot });
$('lobby-level').onchange = (e) => send({ type: 'setBotLevel', level: Number(e.target.value) });
$('role-survivor').onclick = () => send({ type: 'setRole', role: 'survivor' });
$('role-hunter').onclick = () => send({ type: 'setRole', role: 'hunter' });
$('btn-copy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${S.lobby.room}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('招待リンクをコピーしました', 'good');
  } catch {
    toast(url, 'info');
  }
};
$('btn-back').onclick = () => {
  show(S.lobby ? 'lobby' : 'title');
};

function renderLobby() {
  const L = S.lobby;
  if (!L) return;
  $('lobby-code').textContent = L.room;
  const isHost = L.hostId === S.you;
  const me = L.players.find((p) => p.id === S.you);
  const ul = $('lobby-players');
  ul.innerHTML = '';
  const sorted = [...L.players].sort((a, b) => (a.role === 'hunter' ? -1 : 0) - (b.role === 'hunter' ? -1 : 0));
  for (const p of sorted) {
    const li = document.createElement('li');
    if (p.id === S.you) li.classList.add('me');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 40;
    drawPortrait(cv, p.animal);
    li.appendChild(cv);
    const name = document.createElement('span');
    name.className = 'pname';
    name.textContent = p.name + (p.id === S.you ? ' (あなた)' : '');
    li.appendChild(name);
    const tag = document.createElement('span');
    tag.className = 'tag' + (p.role === 'hunter' ? ' hunter' : '');
    tag.textContent = p.role === 'hunter' ? 'ハンター' : animalLook(p.animal).name;
    li.appendChild(tag);
    if (p.bot) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = 'BOT';
      li.appendChild(t);
      if (isHost) {
        const rm = document.createElement('button');
        rm.textContent = '×';
        rm.onclick = () => send({ type: 'removeBot', id: p.id });
        li.appendChild(rm);
      }
    }
    if (p.id === L.hostId) {
      const t = document.createElement('span');
      t.className = 'tag host';
      t.textContent = 'ホスト';
      li.appendChild(t);
    }
    ul.appendChild(li);
  }
  $('host-controls').classList.toggle('hidden', !isHost);
  $('btn-start').classList.toggle('hidden', !isHost);
  $('lobby-level').value = String(L.botLevel ?? 1);
  $('role-survivor').classList.toggle('active', me?.role === 'survivor');
  $('role-hunter').classList.toggle('active', me?.role === 'hunter');
  const hunters = L.players.filter((p) => p.role === 'hunter').length;
  const survivors = L.players.filter((p) => p.role === 'survivor').length;
  $('lobby-hint').textContent = isHost
    ? hunters !== 1
      ? 'ハンターを 1 匹決めてください (ボット可)'
      : survivors < 1
        ? 'サバイバーが必要です'
        : `準備OK! (サバイバー ${survivors} / ハンター ${hunters})`
    : 'ホストの開始を待っています…';

  const picker = $('animal-picker');
  picker.innerHTML = '';
  $('animal-title').classList.toggle('hidden', me?.role !== 'survivor');
  if (me?.role === 'survivor') {
    for (const id of ANIMAL_IDS) {
      const a = SURVIVOR_ANIMALS[id];
      const card = document.createElement('button');
      card.className = 'animal-card' + (me.animal === id ? ' active' : '');
      const cv = document.createElement('canvas');
      cv.width = cv.height = 56;
      drawPortrait(cv, id);
      card.appendChild(cv);
      const n = document.createElement('span');
      n.className = 'aname';
      n.textContent = a.name;
      card.appendChild(n);
      const pk = document.createElement('span');
      pk.className = 'perk';
      pk.textContent = a.perk;
      card.appendChild(pk);
      card.onclick = () => {
        safeSet('mofu-animal', id);
        send({ type: 'setAnimal', animal: id });
      };
      picker.appendChild(card);
    }
  } else {
    picker.innerHTML =
      '<p class="small">オオカミ: 一人称の狭い視界。足あと・物音を手がかりに追いつめよう。<br>突進 (右クリック) と遠吠え (Q) が使える。</p>';
  }
}

function showResults(r) {
  show('results');
  const me = r.players.find((p) => p.id === S.you);
  const title = $('result-title');
  if (r.winner === 'draw') title.textContent = '🤝 ひきわけ';
  else if (me && ((me.role === 'hunter' && r.winner === 'hunter') || (me.role === 'survivor' && r.winner === 'survivors')))
    title.textContent = '🎉 勝利!';
  else title.textContent = '😢 敗北…';
  $('result-sub').textContent =
    `${r.winner === 'hunter' ? 'ハンター' : r.winner === 'survivors' ? 'サバイバー' : '両チーム'}の${r.winner === 'draw' ? '引き分け' : '勝ち'} — 脱出 ${r.escaped} / 風船 ${r.dead} (${Math.floor(r.duration / 60)}分${r.duration % 60}秒)`;
  const rows = r.players
    .sort((a, b) => (a.role === 'hunter' ? -1 : 1) - (b.role === 'hunter' ? -1 : 1))
    .map((p) => {
      const st = p.stats;
      const out = p.role === 'hunter' ? '—' : p.outcome === 'escaped' ? '脱出' : '風船';
      const detail =
        p.role === 'hunter'
          ? `かみつき ${st.hits} / 鳥かご ${st.hooks}`
          : `修理 ${st.gens} / 治療 ${st.heals} / 救出 ${st.rescues} / 気絶 ${st.stuns}`;
      return `<tr><td>${escapeHtml(p.name)}${p.bot ? ' 🤖' : ''}</td><td>${p.role === 'hunter' ? 'オオカミ' : animalLook(p.animal).name}</td><td class="out-${p.outcome || ''}">${out}</td><td>${detail}</td></tr>`;
    })
    .join('');
  $('result-table').innerHTML = `<tr><th>なまえ</th><th>どうぶつ</th><th>結果</th><th>きろく</th></tr>${rows}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function toast(text, tone = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = text;
  const box = $('toasts');
  box.appendChild(el);
  while (box.children.length > 6) box.firstChild.remove();
  setTimeout(() => el.classList.add('fade'), 4200);
  setTimeout(() => el.remove(), 4800);
}

// ==================== 入力 ====================
const keys = new Set();
let pressedBits = 0;
let mouse = { x: 0, y: 0, left: false, right: false };
const KEYMAP = {
  KeyW: BTN.UP,
  ArrowUp: BTN.UP,
  KeyS: BTN.DOWN,
  ArrowDown: BTN.DOWN,
  KeyA: BTN.LEFT,
  ArrowLeft: BTN.LEFT,
  KeyD: BTN.RIGHT,
  ArrowRight: BTN.RIGHT,
  ShiftLeft: BTN.SNEAK,
  ShiftRight: BTN.SNEAK,
  KeyE: BTN.INTERACT,
  KeyF: BTN.INTERACT,
  Space: BTN.ACTION,
  KeyQ: BTN.HOWL,
};

window.addEventListener('keydown', (e) => {
  if (S.screen !== 'game') return;
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyH') {
    toggleHelp();
    return;
  }
  const bit = KEYMAP[e.code];
  if (bit) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Space' && S.game && S.game.skill) {
    hitSkill();
    return;
  }
  if (bit) {
    keys.add(e.code);
    pressedBits |= bit;
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
canvas.addEventListener('mousedown', (e) => {
  unlockAudio();
  if (e.button === 0) {
    mouse.left = true;
    pressedBits |= BTN.ATTACK;
  }
  if (e.button === 2) {
    mouse.right = true;
    pressedBits |= BTN.POWER;
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function heldBits() {
  let b = 0;
  for (const k of keys) b |= KEYMAP[k] || 0;
  if (mouse.left) b |= BTN.ATTACK;
  if (mouse.right) b |= BTN.POWER;
  return b;
}

function toggleHelp() {
  const h = $('help');
  if (!h.classList.contains('hidden')) {
    h.classList.add('hidden');
    return;
  }
  const hunter = S.game && S.game.role === 'hunter';
  h.innerHTML = hunter
    ? `<b>🐺 ハンター操作</b><br><kbd>WASD</kbd> 移動 / マウスで向き<br><kbd>左クリック</kbd> かみつき<br><kbd>右クリック</kbd> 長押し→離す: 突進<br><kbd>Q</kbd> 遠吠え (走っている子をあぶり出す)<br><kbd>Space</kbd> 担ぐ・鳥かごへ・丸太破壊・窓越え・オルゴールを蹴る・うろを調べる・ハッチを閉じる<br><kbd>H</kbd> この説明を閉じる`
    : `<b>🐰 サバイバー操作</b><br><kbd>WASD</kbd> 移動 / <kbd>Shift</kbd> しのび足<br><kbd>E</kbd> 長押し: 修理・治療・救出・ゲート / 押す: 木のうろに隠れる・ハッチ<br><kbd>Space</kbd> 丸太を倒す・窓を越える・スキルチェック<br>担がれたら <kbd>A</kbd><kbd>D</kbd> 交互連打<br><kbd>H</kbd> この説明を閉じる`;
  h.classList.remove('hidden');
}

// 30Hz で入力を送信し、同時に自分の移動を予測する
setInterval(() => {
  const G = S.game;
  if (!G || !G.me) return;
  const buttons = heldBits();
  const cmd = { seq: ++G.seq, buttons, pressed: pressedBits, aim: aimAngle() };
  pressedBits = 0;
  send({ type: 'input', ...cmd });
  G.pending.push(cmd);
  if (G.pending.length > 90) G.pending.shift();
  if (G.pred && canPredict(G)) applyMove(G, G.pred, cmd);
}, TICK_DT * 1000);

function aimAngle() {
  const G = S.game;
  if (!G || !G.cam) return 0;
  const p = renderSelfPos(G);
  const sx = (p.x - G.cam.x) * G.cam.scale + innerWidth / 2;
  const sy = (p.y - G.cam.y) * G.cam.scale + innerHeight / 2;
  return Math.atan2(mouse.y - sy, mouse.x - sx);
}

function canPredict(G) {
  const me = G.me;
  return me && !me.locked;
}

// サーバーと同じ移動計算 (shared/physics.js) を手元でも実行する
function applyMove(G, pos, cmd) {
  const me = G.me;
  let speed;
  let dir;
  if (G.role === 'hunter') {
    speed = me.speed;
    if (me.forced) dir = { x: Math.cos(cmd.aim), y: Math.sin(cmd.aim) };
    else dir = inputDir(cmd.buttons);
  } else {
    if (me.h === HEALTH.DOWNED) speed = SPEED.survivorCrawl;
    else speed = cmd.buttons & BTN.SNEAK ? SPEED.survivorSneak * (me.sneakMul || 1) : SPEED.survivorRun;
    if (me.haste) speed *= SPEED.hasteMul;
    dir = inputDir(cmd.buttons);
    if (cmd.buttons & BTN.INTERACT && G.interactBusy) dir = { x: 0, y: 0 };
  }
  moveCircle(pos, dir.x * speed, dir.y * speed, TICK_DT, G.role === 'hunter' ? RADIUS.hunter : RADIUS.survivor, G.grid.isSolid);
}

// ==================== スナップショット ====================
function onSnap(snap) {
  const G = S.game;
  if (!G) return;
  const now = performance.now() / 1000;
  const off = snap.time - now;
  G.timeOffset = G.timeOffset === null ? off : G.timeOffset + (off - G.timeOffset) * 0.05;
  if (off > G.timeOffset + 0.25 || off < G.timeOffset - 0.5) G.timeOffset = off;

  G.prevSnap = G.snap;
  G.snap = snap;
  const me = snap.you;
  G.me = me;

  // 動的な当たり判定 (丸太・ゲート)
  snap.pallets.forEach((st, i) => {
    if (st !== G.palletStates[i]) {
      const p = G.map.pallets[i];
      G.grid.setSolid(p.x, p.y, st === 'down');
      G.palletStates[i] = st;
    }
  });
  snap.gates.forEach((gs, i) => {
    if (gs.o && !G.gatesOpen[i]) {
      for (const [x, y] of G.map.gates[i].tiles) {
        G.grid.setSolid(x, y, false);
        G.grid.setSight(x, y, false);
      }
      G.gatesOpen[i] = true;
    }
  });

  // 予測の巻き戻しと再適用 (リコンシリエーション)
  G.pending = G.pending.filter((c) => c.seq > me.seq);
  G.interactBusy = !!(me.act && ['repair', 'heal', 'heal_self', 'gate'].includes(me.act));
  const server = { x: me.x, y: me.y };
  if (!G.pred || me.locked) {
    G.pred = server;
    G.smooth.x = G.smooth.y = 0;
  } else {
    const replay = { ...server };
    for (const c of G.pending) applyMove(G, replay, c);
    const ex = G.pred.x + G.smooth.x - replay.x;
    const ey = G.pred.y + G.smooth.y - replay.y;
    if (Math.hypot(ex, ey) > 2) {
      G.smooth.x = G.smooth.y = 0;
    } else {
      G.smooth.x = ex;
      G.smooth.y = ey;
    }
    G.pred = replay;
  }

  // 他プレイヤーの補間バッファ
  const seen = new Set();
  for (const p of snap.players) {
    seen.add(p.id);
    let o = G.others.get(p.id);
    if (!o) {
      o = { buf: [] };
      G.others.set(p.id, o);
    }
    // 長く見えていなかったら補間をリセット (霧から急に現れる)
    if (o.lastTick !== undefined && snap.tick - o.lastTick > 6) o.buf = [];
    o.buf.push({ t: snap.time, x: p.x, y: p.y, a: p.a });
    if (o.buf.length > 20) o.buf.shift();
    o.data = p;
    o.lastTick = snap.tick;
  }
  for (const [id, o] of G.others) o.visible = seen.has(id);

  for (const e of snap.events || []) onEvent(G, e);
  G.lastSnapAt = now;
}

function onEvent(G, e) {
  const me = G.me;
  switch (e.kind) {
    case 'toast':
      toast(e.text, e.tone);
      break;
    case 'sound':
      if (e.x !== undefined && me) playAt(e.sound, e.x, e.y, me.x, me.y, 22);
      else play(e.sound);
      break;
    case 'skill':
      G.skill = { ...e.skill, startedAt: performance.now() / 1000, warned: false };
      break;
    case 'skill_cancel':
      G.skill = null;
      break;
    case 'skill_result':
      play('skill_' + e.result);
      G.skillFlash = { result: e.result, at: performance.now() / 1000 };
      break;
    case 'gen_done': {
      const g = G.map.gens[e.gen];
      for (let i = 0; i < 12; i++) G.particles.push(noteParticle(g.x + 0.5, g.y + 0.3));
      break;
    }
    case 'balloon':
      G.particles.push({
        kind: 'balloon',
        x: e.x,
        y: e.y,
        vy: -1.2,
        life: 6,
        age: 0,
        animal: e.animal,
        color: ['#ff8fab', '#8fd3ff', '#ffd166', '#b8f2a1'][Math.floor(Math.random() * 4)],
      });
      break;
  }
}

function noteParticle(x, y) {
  return {
    kind: 'note',
    x,
    y,
    vx: (Math.random() - 0.5) * 1.2,
    vy: -0.8 - Math.random() * 0.8,
    life: 1.6 + Math.random(),
    age: 0,
    color: ['#ff8fab', '#ffd166', '#8fd3ff', '#c3a6ff'][Math.floor(Math.random() * 4)],
  };
}

// ==================== スキルチェック ====================
// 針の位置 (0..1, 上から時計回り)。予兆音のあと 1 周する
function skillNeedle(G) {
  const s = G.skill;
  const t = performance.now() / 1000 - s.startedAt - s.warn;
  return t / s.spin;
}

function hitSkill() {
  const G = S.game;
  const s = G.skill;
  if (!s) return;
  const n = skillNeedle(G);
  let result = 'miss';
  if (n >= s.zoneStart && n <= s.zoneStart + s.great) result = 'great';
  else if (n >= s.zoneStart && n <= s.zoneStart + s.good) result = 'good';
  send({ type: 'skill', id: s.id, result });
  G.skill = null;
}

function updateSkill(G) {
  const s = G.skill;
  if (!s) return;
  const t = performance.now() / 1000 - s.startedAt;
  if (!s.warned) {
    s.warned = true;
    play('skill_warn');
  }
  if (t > s.warn + s.spin + 0.05) {
    // 一周しても押さなかった
    send({ type: 'skill', id: s.id, result: 'miss' });
    G.skill = null;
  }
}

// ==================== 描画 ====================
let dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d');

function renderTime(G) {
  return performance.now() / 1000 + (G.timeOffset || 0) - INTERP_DELAY;
}

function sampleOther(o, t) {
  const b = o.buf;
  if (!b.length) return null;
  if (t <= b[0].t) return b[0];
  for (let i = b.length - 1; i >= 0; i--) {
    if (b[i].t <= t) {
      const a = b[i];
      const c = b[i + 1];
      if (!c) return a;
      const k = (t - a.t) / (c.t - a.t || 1);
      let da = c.a - a.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, a: a.a + da * k };
    }
  }
  return b[b.length - 1];
}

function renderSelfPos(G) {
  if (G.pred && G.me && !G.me.locked) return { x: G.pred.x + G.smooth.x, y: G.pred.y + G.smooth.y };
  // ロック中はサーバー位置を滑らかに追う
  const target = G.me ? { x: G.me.x, y: G.me.y } : { x: 0, y: 0 };
  if (!G.selfLerp) G.selfLerp = { ...target };
  G.selfLerp.x += (target.x - G.selfLerp.x) * 0.25;
  G.selfLerp.y += (target.y - G.selfLerp.y) * 0.25;
  return G.selfLerp;
}

let lastFrame = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const G = S.game;
  if (!G || !G.snap) {
    if (S.screen === 'game') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1c2333';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }
  // 予測補正オフセットを減衰
  const k = Math.min(1, dt * 10);
  G.smooth.x -= G.smooth.x * k;
  G.smooth.y -= G.smooth.y * k;
  updateSkill(G);
  draw(G, dt, now / 1000);
}
requestAnimationFrame(frame);

function draw(G, dt, T) {
  const W = innerWidth;
  const H = innerHeight;
  const snap = G.snap;
  const me = G.me;
  const isHunter = G.role === 'hunter';
  const self = renderSelfPos(G);
  const scale = Math.max(28, Math.min(W / 26, H / 16));
  const cam = (G.cam = { x: self.x, y: self.y, scale });
  const alive = !me.h || ![HEALTH.DEAD, HEALTH.ESCAPED].includes(me.h);

  // ワールド座標 (タイル) → 画面
  const worldTf = () => ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - cam.x * scale), dpr * (H / 2 - cam.y * scale));
  const toScreen = (x, y) => ({ x: (x - cam.x) * scale + W / 2, y: (y - cam.y) * scale + H / 2 });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2d5a3d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  worldTf();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(G.layer, 0, 0, G.map.w, G.map.h);

  const viewL = cam.x - W / 2 / scale - 2;
  const viewR = cam.x + W / 2 / scale + 2;
  const viewT = cam.y - H / 2 / scale - 2;
  const viewB = cam.y + H / 2 / scale + 2;
  const inView = (x, y) => x > viewL && x < viewR && y > viewT && y < viewB;

  // ハンター専用の手がかり (霧の下)
  if (isHunter && snap.prints) {
    for (const pr of snap.prints) {
      if (!inView(pr.x, pr.y)) continue;
      const a = Math.max(0, 1 - pr.age / pr.life);
      if (pr.k === 'paw') {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(pr.a + Math.PI / 2);
        ctx.fillStyle = `rgba(220,40,60,${0.75 * a})`;
        ctx.beginPath();
        ctx.ellipse(0, 0.04, 0.07, 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const [tx, ty] of [
          [-0.07, -0.06],
          [0, -0.09],
          [0.07, -0.06],
        ]) {
          ctx.beginPath();
          ctx.arc(tx, ty, 0.028, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // 動的オブジェクト
  G.map.pallets.forEach((p, i) => inView(p.x, p.y) && drawPallet(ctx, p, snap.pallets[i]));
  G.map.lockers.forEach((l) => inView(l.x, l.y) && drawLocker(ctx, l));
  G.map.gates.forEach((g, i) => drawGate(ctx, g, snap.gates[i], T));
  if (snap.hatch) drawHatch(ctx, snap.hatch, T);
  G.map.gens.forEach((g, i) => inView(g.x, g.y) && drawGen(ctx, g, snap.gens[i], T, snap.gens[i].p >= 0));
  G.map.cages.forEach((c, i) => inView(c.x, c.y) && drawCage(ctx, c, snap.cages[i]));

  // プレイヤー (y 順に描いて奥行きを出す)
  const rt = renderTime(G);
  const drawList = [];
  for (const [id, o] of G.others) {
    if (!o.visible) continue;
    const d = o.data;
    if (d.h === HEALTH.CARRIED) continue; // ハンターの上に描く
    const pos = d.h === HEALTH.CAGED ? { x: d.x, y: d.y, a: Math.PI / 2 } : sampleOther(o, rt);
    if (!pos) continue;
    drawList.push({ id, d, x: pos.x, y: pos.y, a: pos.a });
  }
  if (alive && me.hidden == null) {
    drawList.push({
      id: me.id,
      self: true,
      d: { ...me, h: me.h, act: me.act, mv: keys.size > 0, role: G.role },
      x: self.x,
      y: self.y,
      a: me.locked || me.forced ? me.a : aimAngle(),
    });
  }
  drawList.sort((a, b) => a.y - b.y);

  // サバイバーから見えるハンターの「赤い視線」
  if (!isHunter) {
    for (const e of drawList) {
      if (e.d.role !== 'hunter' || e.d.aura) continue;
      const grad = ctx.createRadialGradient(e.x, e.y, 0.2, e.x, e.y, 3.2);
      grad.addColorStop(0, 'rgba(255,60,80,0.35)');
      grad.addColorStop(1, 'rgba(255,60,80,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.arc(e.x, e.y, 3.2, e.a - 0.45, e.a + 0.45);
      ctx.closePath();
      ctx.fill();
    }
  }

  const carriedBy = new Map();
  for (const [, o] of G.others) if (o.visible && o.data.h === HEALTH.CARRIED) carriedBy.set(o.data.id, o.data);
  if (me.h === HEALTH.CARRIED) carriedBy.set(me.id, { ...me, animal: me.animal });

  for (const e of drawList) {
    const d = e.d;
    if (d.aura) continue;
    const hunter = d.role === 'hunter';
    const R = hunter ? 0.62 : 0.44;
    const stunned = hunter && d.act === 'stunned';
    const alpha = d.h === HEALTH.CAGED ? 0.95 : 1;
    drawAnimal(ctx, e.x, e.y, R, d.animal, {
      t: T + (e.id.charCodeAt(1) || 0),
      angle: e.a,
      moving: d.mv,
      injured: d.h === HEALTH.INJURED,
      downed: d.h === HEALTH.DOWNED,
      sneak: d.sn || (e.self && keys.has('ShiftLeft')),
      stunned,
      alpha,
    });
    if (hunter && (d.carry || (e.self && me.carry))) {
      const cid = d.carry || me.carry;
      const c = carriedBy.get(cid);
      const animal = c ? c.animal : 'rabbit';
      drawAnimal(ctx, e.x, e.y - 0.75, 0.38, animal, { t: T, angle: Math.PI / 2, downed: true });
    }
    // 突進チャージ
    if (hunter && e.self && me.charge > 0) {
      ctx.strokeStyle = `rgba(255,80,80,${0.4 + me.charge * 0.5})`;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.a) * (1 + me.charge * 3), e.y + Math.sin(e.a) * (1 + me.charge * 3));
      ctx.stroke();
    }
  }
  G.map.cages.forEach((c, i) => inView(c.x, c.y) && drawCageFront(ctx, c, snap.cages[i]));

  // パーティクル
  for (const p of G.particles) {
    p.age += dt;
    p.x += (p.vx || 0) * dt;
    p.y += p.vy * dt;
    const a = Math.max(0, 1 - p.age / p.life);
    if (p.kind === 'note') {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.font = '0.5px sans-serif';
      ctx.fillText('♪', p.x, p.y);
      ctx.restore();
    } else if (p.kind === 'balloon') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 0.9);
      ctx.lineTo(p.x, p.y - 0.2);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 1.3, 0.38, 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      drawAnimal(ctx, p.x + Math.sin(p.age * 3) * 0.1, p.y, 0.34, p.animal, { t: T, angle: Math.PI / 2 });
      ctx.restore();
    }
  }
  G.particles = G.particles.filter((p) => p.age < p.life);

  // ===== 霧 =====
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (fogCanvas.width !== canvas.width || fogCanvas.height !== canvas.height) {
    fogCanvas.width = canvas.width;
    fogCanvas.height = canvas.height;
  }
  fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.clearRect(0, 0, W, H);
  fogCtx.fillStyle = isHunter ? 'rgba(12,10,26,0.9)' : 'rgba(14,20,40,0.84)';
  fogCtx.fillRect(0, 0, W, H);
  if (alive) {
    fogCtx.globalCompositeOperation = 'destination-out';
    const eye = me.hidden != null || me.h === HEALTH.CAGED || me.h === HEALTH.CARRIED ? { x: me.x, y: me.y } : self;
    const facing = me.locked || me.forced ? me.a : aimAngle();
    const polys = visibilityPolygon(eye.x, eye.y, facing, isHunter, G.grid.blocksSight);
    const sp = toScreen(eye.x, eye.y);
    const radius = (isHunter ? VISION.hunterRadius : me.hidden != null ? 3 : VISION.survivorRadius) * scale;
    const grad = fogCtx.createRadialGradient(sp.x, sp.y, radius * 0.55, sp.x, sp.y, radius);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    fogCtx.fillStyle = grad;
    polys.forEach((poly, idx) => {
      if (idx === 1) {
        const r2 = VISION.hunterNear * scale;
        const g2 = fogCtx.createRadialGradient(sp.x, sp.y, r2 * 0.4, sp.x, sp.y, r2);
        g2.addColorStop(0, 'rgba(0,0,0,0.85)');
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        fogCtx.fillStyle = g2;
      }
      fogCtx.beginPath();
      poly.forEach((p, i) => {
        const s = toScreen(p.x, p.y);
        if (i) fogCtx.lineTo(s.x, s.y);
        else fogCtx.moveTo(s.x, s.y);
      });
      fogCtx.closePath();
      fogCtx.fill();
    });
  } else {
    fogCtx.clearRect(0, 0, W, H);
  }
  ctx.drawImage(fogCanvas, 0, 0, W, H);

  // ===== オーラ (霧の上) =====
  worldTf();
  ctx.lineWidth = 0.06;
  // オルゴールは全員に見える
  G.map.gens.forEach((g, i) => {
    const s = snap.gens[i];
    ctx.strokeStyle = s.done ? 'rgba(255,215,100,0.25)' : 'rgba(255,230,140,0.55)';
    ctx.beginPath();
    ctx.roundRect(g.x + 0.05, g.y + 0.25, 0.9, 0.6, 0.1);
    ctx.stroke();
  });
  if (isHunter) {
    G.map.cages.forEach((c, i) => {
      if (snap.cages[i].b) return;
      ctx.strokeStyle = 'rgba(255,90,90,0.45)';
      ctx.beginPath();
      ctx.arc(c.x + 0.5, c.y + 0.3, 0.45, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  // ゲート
  G.map.gates.forEach((g, i) => {
    if (!snap.gates[i].pw) return;
    ctx.strokeStyle = 'rgba(255,240,150,0.8)';
    ctx.beginPath();
    ctx.roundRect(g.tiles[0][0] + 0.1, g.tiles[0][1] + 0.05, 0.8, 1.9, 0.2);
    ctx.stroke();
  });
  if (snap.hatch && snap.hatch.open) {
    ctx.strokeStyle = 'rgba(255,240,150,0.9)';
    ctx.beginPath();
    ctx.arc(snap.hatch.x + 0.5, snap.hatch.y + 0.5, 0.55 + Math.sin(T * 4) * 0.05, 0, Math.PI * 2);
    ctx.stroke();
  }
  // オーラ表示のプレイヤー (仲間のピンチ、遠吠え)
  for (const e of drawList) {
    if (!e.d.aura) continue;
    const col = isHunter ? '255,80,80' : '255,210,90';
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = `rgba(${col},0.95)`;
    ctx.fillStyle = `rgba(${col},0.25)`;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(e.x, e.y - 0.2, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawAnimal(ctx, e.x, e.y, 0.44, e.d.animal, { t: T, angle: Math.PI / 2, downed: e.d.h === HEALTH.DOWNED, alpha: 0.55 });
  }
  if (!isHunter) {
    // 鳥かごに入れられた仲間は霧越しでも見える
    G.map.cages.forEach((c, i) => {
      if (!snap.cages[i].o) return;
      ctx.strokeStyle = `rgba(255,${snap.cages[i].st === 2 ? 80 : 200},90,0.9)`;
      ctx.beginPath();
      ctx.arc(c.x + 0.5, c.y, 0.8, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  // 物音 (ハンター)
  if (snap.noises) {
    for (const n of snap.noises) {
      const a = Math.max(0, 1 - n.age / 3);
      const r = 0.4 + n.age * 0.8;
      ctx.strokeStyle = n.k === 'gen_done' ? `rgba(255,220,120,${a})` : n.k === 'groan' ? `rgba(255,130,170,${a})` : `rgba(255,190,60,${a})`;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // 毛玉 (負傷サバイバーの痕跡) はハンターだけが霧越しに見える
  if (isHunter && snap.prints) {
    for (const pr of snap.prints) {
      if (pr.k !== 'fur' || !inView(pr.x, pr.y)) continue;
      const a = Math.max(0, 1 - pr.age / pr.life);
      ctx.fillStyle = `rgba(255,170,200,${0.8 * a})`;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(pr.x + Math.cos(i * 2.1) * 0.06, pr.y + Math.sin(i * 2.1) * 0.06, 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ===== 画面空間 (名前・HUD) =====
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px sans-serif';
  for (const e of drawList) {
    if (e.self) continue;
    const s = toScreen(e.x, e.y - (e.d.role === 'hunter' ? 1.25 : 1.05));
    outlinedText(e.d.name, s.x, s.y, e.d.role === 'hunter' ? '#ffb4b4' : '#fff');
    if (e.d.ap !== undefined && e.d.act && !e.d.aura) {
      bar(s.x - 18, s.y + 4, 36, 4, e.d.ap, '#ffd166');
    }
  }

  drawHud(G, W, H, T);
}

function outlinedText(text, x, y, color) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function bar(x, y, w, h, v, color, bg = 'rgba(0,0,0,0.5)') {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, w * Math.max(0, Math.min(1, v))), h, h / 2);
  ctx.fill();
}

const HEALTH_LABEL = {
  healthy: '元気',
  injured: '負傷',
  downed: 'ダウン',
  carried: '担がれ中',
  caged: '鳥かご',
  escaped: '脱出',
  dead: '風船',
};

function drawHud(G, W, H, T) {
  const snap = G.snap;
  const me = G.me;
  const isHunter = G.role === 'hunter';

  // 心音 (サバイバー)
  if (!isHunter && snap.heartbeat > 0) {
    const hb = snap.heartbeat;
    const period = 1.1 - hb * 0.65;
    if (T - G.lastHeartbeat > period) {
      G.lastHeartbeat = T;
      play('heartbeat', 0.3 + hb * 0.7);
    }
    const pulse = Math.max(0, 1 - (T - G.lastHeartbeat) / 0.35);
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, 'rgba(255,0,40,0)');
    grad.addColorStop(1, `rgba(255,0,40,${0.15 + hb * 0.35 + pulse * 0.15 * hb})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // 上部: オルゴール残数
  const left = Math.max(0, snap.gensRequired - snap.gensDone);
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px sans-serif';
  const gateTxt = snap.gates[0].pw ? 'ゲートに電気が通った!' : `のこりオルゴール ${left} 台`;
  roundPanel(W / 2 - 130, 10, 260, 40);
  ctx.fillStyle = '#5a4030';
  ctx.fillText(`♪ ${gateTxt}`, W / 2, 36);
  if (snap.collapse !== null) {
    roundPanel(W / 2 - 90, 56, 180, 32, '#ffdddd');
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`🌅 夜明けまで ${Math.ceil(snap.collapse)} 秒`, W / 2, 78);
  }

  // 左上: チーム状況
  ctx.textAlign = 'left';
  let y = 14;
  for (const t of snap.team) {
    roundPanel(10, y, 200, 44, t.id === S.you ? '#fff0f4' : undefined);
    ctx.save();
    ctx.beginPath();
    ctx.rect(14, y + 2, 40, 40);
    ctx.clip();
    ctx.translate(34, y + 28);
    ctx.scale(36, 36);
    const gone = t.h === 'dead' || t.h === 'escaped';
    drawAnimal(ctx, 0, 0, 0.42, t.animal, { angle: Math.PI / 2, downed: t.h === 'downed', injured: t.h === 'injured', alpha: gone ? 0.35 : 1 });
    ctx.restore();
    ctx.fillStyle = '#3b3024';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(t.name.slice(0, 9) + (t.bot ? ' 🤖' : ''), 58, y + 18);
    ctx.font = '12px sans-serif';
    const col = {
      healthy: '#2e7d32',
      injured: '#e67e22',
      downed: '#c0392b',
      carried: '#c0392b',
      caged: '#c0392b',
      escaped: '#2e86de',
      dead: '#7f8c8d',
    }[t.h];
    ctx.fillStyle = col;
    ctx.fillText(HEALTH_LABEL[t.h] + (t.h === 'caged' ? ` (段階 ${t.st})` : ''), 58, y + 35);
    // 鳥かご回数
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i < t.hk ? '#e5534b' : 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.arc(188 - i * 12, y + 22, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    y += 50;
  }

  // 下部: 行動のヒントと進捗
  const hint = contextHint(G);
  const cx = W / 2;
  let by = H - 40;
  if (hint) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    const w = ctx.measureText(hint).width + 30;
    roundPanel(cx - w / 2, by - 22, w, 32);
    ctx.fillStyle = '#3b3024';
    ctx.fillText(hint, cx, by);
    by -= 44;
  }
  const prog = actionProgress(G);
  if (prog) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px sans-serif';
    outlinedText(prog.label, cx, by - 4, '#fff');
    bar(cx - 120, by + 2, 240, 12, prog.v, prog.color || '#ffd166');
  }

  if (isHunter) {
    // クールダウン
    const items = [
      { key: '右クリック', name: '突進', cd: me.dashCd, max: 9 },
      { key: 'Q', name: '遠吠え', cd: me.howlCd, max: 50 },
    ];
    items.forEach((it, i) => {
      const x = W - 190;
      const yy = H - 110 + i * 48;
      roundPanel(x, yy, 176, 40);
      ctx.textAlign = 'left';
      ctx.fillStyle = it.cd > 0 ? '#999' : '#3b3024';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${it.name} [${it.key}]`, x + 10, yy + 18);
      bar(x + 10, yy + 25, 156, 8, 1 - it.cd / it.max, it.cd > 0 ? '#bbb' : '#e5534b');
    });
  } else {
    // 被弾後の状態
    const badges = [];
    if (me.haste) badges.push('💨 ダッシュ');
    if (me.endurance) badges.push('🍀 お守り');
    if (me.h === HEALTH.DOWNED) badges.push(`💧 出血 ${me.bleed}s`);
    badges.forEach((b, i) => {
      roundPanel(W - 150, H - 60 - i * 40, 136, 32);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3b3024';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(b, W - 82, H - 39 - i * 40);
    });
  }

  // 担がれ中: もがきゲージ
  if (me.h === HEALTH.CARRIED) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px sans-serif';
    outlinedText('A と D を交互に連打してもがけ!', cx, H / 2 + 90, '#fff');
    bar(cx - 150, H / 2 + 104, 300, 16, me.wiggle, '#7ee081');
  }
  if (me.h === HEALTH.CAGED) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    const txt =
      me.hookStage === 1
        ? `仲間の助けを待とう… (Space: 自力脱出 のこり ${me.selfUnhook} 回・成功率 4%)`
        : 'もがき中! スキルチェックに失敗すると風船に…';
    outlinedText(txt, cx, H / 2 + 90, '#fff');
    bar(cx - 150, H / 2 + 104, 300, 14, me.hookTimer / 45, me.hookStage === 2 ? '#e5534b' : '#ffd166');
  }
  if (me.h === HEALTH.DEAD || me.h === HEALTH.ESCAPED) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px sans-serif';
    outlinedText(me.h === HEALTH.DEAD ? '🎈 風船で飛ばされた… 観戦中' : '🌈 脱出成功! 仲間を見守ろう', cx, H / 2 - 60, '#fff');
  }

  drawSkill(G, W, H);
}

function roundPanel(x, y, w, h, color = 'rgba(255,250,242,0.92)') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
}

function actionProgress(G) {
  const me = G.me;
  const a = me.act;
  if (!a) return null;
  const labels = {
    repair: 'オルゴール修理中',
    heal: '治療中',
    heal_self: 'ぺろぺろ治療中',
    gate: 'ゲートを開けている',
    unhook: '救出中',
    pickup: '担いでいる',
    hook: '鳥かごへ',
    break_pallet: '丸太を壊している',
    kick_gen: 'オルゴールを蹴っている',
    search_locker: 'うろを調べている',
    close_hatch: 'ハッチを閉じている',
    stunned: '気絶中!',
    vault: '乗り越え中',
    pallet_vault: '乗り越え中',
    locker_enter: '隠れている',
    locker_exit: '出ている',
    hatch_jump: '飛び込む!',
    wipe: '…',
  };
  const label = labels[a];
  if (!label) return null;
  let v = me.ap ?? 0;
  if (a === 'repair') v = me.genProgress ?? 0;
  if (a === 'heal') v = me.healTarget ?? 0;
  if (a === 'heal_self') v = me.heal ?? 0;
  if (a === 'gate') v = me.gateProgress ?? 0;
  return { label: me.stalled ? 'しっぱい! 手がすべった…' : label, v, color: me.stalled ? '#e5534b' : undefined };
}

// 近くにあるものから、押せるボタンのヒントを作る
function contextHint(G) {
  const me = G.me;
  const snap = G.snap;
  const pos = { x: me.x, y: me.y };
  const near = (o, r = INTERACT_RANGE) => Math.hypot(o.x + 0.5 - pos.x, o.y + 0.5 - pos.y) < r;
  if (me.locked && me.hidden == null) return null;
  if (G.role === 'hunter') {
    if (me.carry) {
      const cage = G.map.cages.find((c, i) => !snap.cages[i].o && !snap.cages[i].b && near(c, INTERACT_RANGE + 0.4));
      return cage ? 'Space: 鳥かごに入れる' : '空いている鳥かご (赤いオーラ) へ運ぼう';
    }
    for (const [, o] of G.others) {
      if (o.visible && o.data.h === HEALTH.DOWNED && Math.hypot(o.data.x - pos.x, o.data.y - pos.y) < INTERACT_RANGE + 0.2) return 'Space: 担ぐ';
    }
    if (snap.hatch && snap.hatch.open && near(snap.hatch, INTERACT_RANGE + 0.3)) return 'Space: ハッチを閉じる';
    if (G.map.pallets.some((p, i) => snap.pallets[i] === 'down' && near(p, 1.3))) return 'Space: 丸太を壊す';
    if (G.map.windows.some((w) => near(w, 1.2))) return 'Space: 柵を乗り越える';
    if (G.map.lockers.some((l) => near(l, INTERACT_RANGE + 0.2))) return 'Space: 木のうろを調べる';
    if (G.map.gens.some((g, i) => !snap.gens[i].done && !snap.gens[i].r && snap.gens[i].p > 0 && near(g, INTERACT_RANGE + 0.2)))
      return 'Space: オルゴールを蹴る (巻き戻す)';
    return null;
  }
  if (me.h === HEALTH.DOWNED) return 'ダウン中… 仲間に起こしてもらおう (這って移動できる)';
  if (me.hidden != null) return 'E: 木のうろから出る';
  if ([HEALTH.CARRIED, HEALTH.CAGED, HEALTH.DEAD, HEALTH.ESCAPED].includes(me.h)) return null;
  if (snap.hatch && snap.hatch.open && near(snap.hatch)) return 'E: ハッチに飛び込む!';
  if (G.map.cages.some((c, i) => snap.cages[i].o && near(c, INTERACT_RANGE + 0.2))) return 'E 長押し: 仲間を救出';
  for (const [, o] of G.others) {
    const d = o.data;
    if (!o.visible || d.role !== 'survivor') continue;
    if ((d.h === HEALTH.INJURED || d.h === HEALTH.DOWNED) && Math.hypot(d.x - pos.x, d.y - pos.y) < INTERACT_RANGE + 0.3)
      return `E 長押し: ${d.name} を${d.h === HEALTH.DOWNED ? '起こす' : '治療'}`;
  }
  const pallet = G.map.pallets.find((p, i) => snap.pallets[i] === 'up' && near(p, 1.15));
  if (pallet) return 'Space: 丸太を倒す!';
  if (G.map.pallets.some((p, i) => snap.pallets[i] === 'down' && near(p, 1.1))) return 'Space: 丸太を乗り越える';
  if (G.map.windows.some((w) => near(w, 1.15))) return 'Space: 柵を乗り越える (Shift で静かに)';
  if (G.map.gates.some((g, i) => snap.gates[i].pw && !snap.gates[i].o && Math.hypot(g.x - pos.x, g.y - pos.y) < INTERACT_RANGE + 1.2))
    return 'E 長押し: ゲートを開ける';
  if (G.map.gens.some((g, i) => !snap.gens[i].done && near(g))) return 'E 長押し: オルゴールを修理';
  if (G.map.lockers.some((l) => near(l))) return 'E: 木のうろに隠れる';
  if (me.h === HEALTH.INJURED) return 'E 長押し: 傷をなめて治す';
  return null;
}

function drawSkill(G, W, H) {
  const s = G.skill;
  const cx = W / 2;
  const cy = H / 2 + 110;
  const R = 52;
  if (G.skillFlash && performance.now() / 1000 - G.skillFlash.at < 0.6) {
    const f = G.skillFlash;
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px sans-serif';
    outlinedText(
      f.result === 'great' ? 'グレート!!' : f.result === 'good' ? 'グッド!' : 'しっぱい…',
      cx,
      cy - R - 14,
      f.result === 'miss' ? '#ff6b6b' : '#ffd166',
    );
  }
  if (!s) return;
  const n = skillNeedle(G);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(20,20,30,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, R + 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  const a0 = -Math.PI / 2;
  const A = (f) => a0 + f * Math.PI * 2;
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, R, A(s.zoneStart), A(s.zoneStart + s.good));
  ctx.stroke();
  ctx.strokeStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, 0, R, A(s.zoneStart), A(s.zoneStart + s.great));
  ctx.stroke();
  if (n >= 0) {
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(A(n)) * (R + 8), Math.sin(A(n)) * (R + 8));
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Space!', 0, 5);
  ctx.restore();
}

// ?debug を付けると開発者ツールから状態を触れる
if (new URLSearchParams(location.search).has('debug')) window.__mofu = { S, onMessage };

connect();
