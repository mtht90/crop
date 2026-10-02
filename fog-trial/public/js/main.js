// クライアント本体: 画面遷移・通信・入力・予測・描画ループ・HUD
import { BTN, HEALTH, TICK_DT, INTERP_DELAY, RADIUS, SPEED, INTERACT_RANGE, KILLER as KILLER_CFG } from '../shared/constants.js';
import { CollisionGrid, moveCircle, inputDir, angleDiff } from '../shared/physics.js';
import { SURVIVOR_CHARACTERS, KILLER_CHARACTER, CHARACTER_IDS } from '../shared/characters.js';
import { World3D } from './world3d.js';
import { TouchControls } from './touch.js';
import { visibilityPolygons } from './vision.js';
import { unlockAudio, play, playAt, startAmbience, setVolume, setChase, setLoop, stopLoops } from './audio.js';

const $ = (id) => document.getElementById(id);
const hud = $('hud');
const ctx = hud.getContext('2d');

// ==================== 設定 ====================
const SETTINGS_KEY = 'fog-settings';
const settings = { brightness: 0.5, volume: 0.7, camera: 1, quality: 'auto' };
try {
  Object.assign(settings, JSON.parse(safeGet(SETTINGS_KEY) || '{}'));
} catch {
  /* 壊れた設定は無視 */
}
function resolvedSettings() {
  const quality = settings.quality === 'auto' ? (matchMedia('(pointer: coarse)').matches ? 'medium' : 'high') : settings.quality;
  return { ...settings, quality };
}

const world = new World3D($('world'), resolvedSettings());
const touch = new TouchControls();
setVolume(settings.volume);

const S = { ws: null, you: null, lobby: null, screen: 'title', game: null, assetsReady: false };
const isKillerRole = (r) => r === 'killer' || r === 'hunter';

const TIPS = [
  'サバイバー: 心音が聞こえたらキラーが近い。修理を続けるか、離れるかの判断が生死を分ける。',
  'サバイバー: しゃがむと足跡が残らず、咆哮でも位置がばれない。',
  'サバイバー: 板は倒すと二度と使えない。キラーが真下に来るまで引きつけて気絶を狙おう。',
  'サバイバー: スキルチェックの失敗は大きな物音になり、キラーに位置を知られる。',
  'サバイバー: 救出直後は「与えられた猶予」で一度だけ攻撃を防げる。',
  'キラー: 視界は前方だけ。赤い足跡と血痕を追いかけて見失わないようにしよう。',
  'キラー: 担いでいる間に板を当てられると落としてしまう。板の近くでは注意。',
  'キラー: 発電機を蹴ると進捗が少しずつ戻る。修理の多い発電機を見回ろう。',
  'キラー: 突進は壁に当たると怯む。まっすぐな道で使おう。',
  'ロッカーに隠れた相手は見えない。足跡が途切れた場所の近くを捜索しよう。',
];

// 素材はタイトル画面の間に読み込んでおく
const assetsPromise = world
  .load((p) => {
    $('loading-text').textContent = `素材を読み込み中… ${Math.round(p * 100)}%`;
  })
  .then(() => {
    S.assetsReady = true;
    world.buildMenu();
    if (world.failed.length) toast(`一部の素材 (${world.failed.length} 個) を読み込めなかったため、簡易表示にしています`, 'bad');
  })
  .catch((e) => {
    console.error(e);
    toast('素材の読み込みに失敗しました。ページを再読み込みしてください', 'bad');
  });

function newGameState(msg) {
  const map = { ...msg.map, seed: msg.seed };
  return {
    map,
    grid: new CollisionGrid(map),
    role: isKillerRole(msg.role) ? 'killer' : 'survivor',
    snap: null,
    me: null,
    pred: null,
    smooth: { x: 0, y: 0 },
    pending: [],
    seq: 0,
    others: new Map(),
    timeOffset: null,
    palletStates: map.pallets.map(() => 'up'),
    gatesOpen: map.gates.map(() => false),
    skill: null,
    skillFlash: null,
    lastHeartbeat: 0,
    aim: 0,
    stepT: 0,
    gone: new Set(),
  };
}

// ==================== 通信 ====================
// サーバーが無い環境 (静的ホスティング) ではブラウザ内でサーバーを動かすオフライン版になる
const OFFLINE = window.FOG_OFFLINE === true || new URLSearchParams(location.search).has('offline');

async function connect() {
  if (OFFLINE) {
    const { createLocalSocket } = await import('./local-server.js');
    S.ws = createLocalSocket(onMessage);
    for (const el of document.querySelectorAll('.online-only')) el.classList.add('hidden');
    for (const el of document.querySelectorAll('.offline-only')) el.classList.remove('hidden');
    return;
  }
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
    endGame();
    S.lobby = null;
    show('title');
    setTimeout(connect, 1500);
  };
}

function send(msg) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(msg));
}

async function onMessage(msg) {
  switch (msg.type) {
    case 'joined':
      S.you = msg.you;
      if (!OFFLINE) history.replaceState(null, '', `?room=${msg.room}`);
      break;
    case 'lobby':
      S.lobby = msg;
      renderLobby();
      if (msg.state === 'lobby' && !S.game && S.screen !== 'results') show('lobby');
      break;
    case 'start': {
      S.you = msg.you;
      const G = newGameState(msg);
      S.game = G;
      show('game');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      $('loading-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
      $('loading').classList.remove('hidden');
      if (!S.assetsReady) await assetsPromise;
      if (S.game !== G) return;
      try {
        world.buildMap(G.map);
      } catch (e) {
        console.error(e);
        toast('マップの作成に失敗しました', 'bad');
      }
      $('loading').classList.add('hidden');
      $('btn-pause').classList.remove('hidden');
      G.ready = true;
      touch.enableIfTouch();
      touch.show(G.role);
      startAmbience();
      toast(G.role === 'killer' ? 'あなたはキラー。サバイバーを全員フックに吊るせ' : 'あなたはサバイバー。発電機を修理して脱出せよ', 'info');
      // 役割ごとに初回だけ操作説明を出す
      const seenKey = `fog-guide-${G.role}`;
      if (!safeGet(seenKey)) {
        safeSet(seenKey, '1');
        toggleHelp();
      } else if (!touch.enabled) toast('H キーで操作説明', 'info');
      break;
    }
    case 'snap':
      onSnap(msg);
      break;
    case 'over':
      showResults(msg.result);
      endGame();
      break;
    case 'error':
      toast(msg.text, 'bad');
      break;
    case 'left':
      endGame();
      S.lobby = null;
      if (!OFFLINE) history.replaceState(null, '', location.pathname);
      show('title');
      break;
  }
}

function endGame() {
  S.game = null;
  touch.hide();
  stopLoops();
  $('btn-pause').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('loading').classList.add('hidden');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, hud.width, hud.height);
}

// ==================== 画面 ====================
function show(name) {
  S.screen = name;
  for (const id of ['title', 'lobby', 'results']) $(id).classList.toggle('hidden', id !== name);
  $('help').classList.add('hidden');
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

const nameInput = $('name');
nameInput.value = safeGet('fog-name') || '';
function myName() {
  const n = nameInput.value.trim() || '名無し';
  safeSet('fog-name', n);
  return n;
}

const level = () => Number($('solo-level').value);
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
  send({ type: 'quick', role: 'survivor', name: myName(), level: level(), character: safeGet('fog-character') || 'knight' });
};
$('btn-solo-killer').onclick = () => {
  unlockAudio();
  send({ type: 'quick', role: 'killer', name: myName(), level: level() });
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
$('role-killer').onclick = () => send({ type: 'setRole', role: 'killer' });
$('btn-copy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${S.lobby.room}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('招待リンクをコピーしました', 'good');
  } catch {
    toast(url, 'info');
  }
};
$('btn-back').onclick = () => show(S.lobby ? 'lobby' : 'title');

function charInfo(p) {
  return isKillerRole(p.role) ? KILLER_CHARACTER : SURVIVOR_CHARACTERS[p.character] || SURVIVOR_CHARACTERS.knight;
}

function renderLobby() {
  const L = S.lobby;
  if (!L) return;
  $('lobby-code').textContent = OFFLINE ? 'ローカル' : L.room;
  const isHost = L.hostId === S.you;
  const me = L.players.find((p) => p.id === S.you);
  const ul = $('lobby-players');
  ul.innerHTML = '';
  const sorted = [...L.players].sort((a, b) => (isKillerRole(a.role) ? -1 : 0) - (isKillerRole(b.role) ? -1 : 0));
  for (const p of sorted) {
    const li = document.createElement('li');
    if (p.id === S.you) li.classList.add('me');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = charInfo(p).color;
    li.appendChild(dot);
    const name = document.createElement('span');
    name.className = 'pname';
    name.textContent = p.name + (p.id === S.you ? ' (あなた)' : '');
    li.appendChild(name);
    const tag = document.createElement('span');
    tag.className = 'tag' + (isKillerRole(p.role) ? ' killer' : '');
    tag.textContent = isKillerRole(p.role) ? 'キラー' : charInfo(p).name;
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
  $('role-killer').classList.toggle('active', isKillerRole(me?.role));
  const killers = L.players.filter((p) => isKillerRole(p.role)).length;
  const survivors = L.players.filter((p) => p.role === 'survivor').length;
  $('lobby-hint').textContent = isHost
    ? killers !== 1
      ? 'キラーを 1 人決めてください (ボット可)'
      : survivors < 1
        ? 'サバイバーが必要です'
        : `準備完了 (サバイバー ${survivors} / キラー ${killers})`
    : 'ホストの開始を待っています…';

  const focus = me ? (isKillerRole(me.role) ? 'killer' : me.character) : null;
  if (focus && focus !== S.menuFocus) {
    S.menuFocus = focus;
    if (S.assetsReady) world.menuFocus(focus);
  }

  const picker = $('character-picker');
  picker.innerHTML = '';
  $('character-title').classList.toggle('hidden', me?.role !== 'survivor');
  if (me?.role === 'survivor') {
    for (const id of CHARACTER_IDS) {
      const a = SURVIVOR_CHARACTERS[id];
      const card = document.createElement('button');
      card.className = 'char-card' + (me.character === id ? ' active' : '');
      card.innerHTML = `<span class="cname" style="color:${a.color}">${a.name}</span><span class="perk">${a.perk}</span>`;
      card.onclick = () => {
        safeSet('fog-character', id);
        send({ type: 'setCharacter', character: id });
      };
      picker.appendChild(card);
    }
  } else {
    picker.innerHTML = `<p class="small">${KILLER_CHARACTER.name}: 視界は前方だけ。足跡・血痕・物音を頼りに追い詰める。<br>突進 (溜めて離す) と咆哮が使える。</p>`;
  }
}

function showResults(r) {
  show('results');
  const me = r.players.find((p) => p.id === S.you);
  const title = $('result-title');
  const meKiller = me && isKillerRole(me.role);
  if (r.winner === 'draw') title.textContent = '引き分け';
  else if (me && ((meKiller && (r.winner === 'killer' || r.winner === 'hunter')) || (!meKiller && r.winner === 'survivors')))
    title.textContent = '勝利';
  else title.textContent = '敗北';
  const wname = r.winner === 'survivors' ? 'サバイバー' : r.winner === 'draw' ? '' : 'キラー';
  $('result-sub').textContent =
    `${wname ? wname + 'の勝ち — ' : ''}脱出 ${r.escaped} / 生贄 ${r.dead} (${Math.floor(r.duration / 60)}分${r.duration % 60}秒)`;
  const rows = r.players
    .sort((a, b) => (isKillerRole(a.role) ? -1 : 1) - (isKillerRole(b.role) ? -1 : 1))
    .map((p) => {
      const st = p.stats;
      const killer = isKillerRole(p.role);
      const out = killer ? '—' : p.outcome === 'escaped' ? '脱出' : '生贄';
      const detail = killer ? `攻撃 ${st.hits} / フック ${st.hooks}` : `修理 ${st.gens} / 治療 ${st.heals} / 救出 ${st.rescues} / 気絶 ${st.stuns}`;
      return `<tr><td>${escapeHtml(p.name)}${p.bot ? ' [BOT]' : ''}</td><td>${charInfo(p).name}</td><td class="out-${p.outcome || ''}">${out}</td><td>${detail}</td><td class="score">${score(p, r).toLocaleString()}</td></tr>`;
    })
    .join('');
  $('result-table').innerHTML = `<tr><th>名前</th><th>キャラ</th><th>結果</th><th>記録</th><th>スコア</th></tr>${rows}`;
}

// 試合の貢献度 (DbD のブラッドポイント相当)
function score(p, r) {
  const st = p.stats;
  if (isKillerRole(p.role)) return st.hits * 300 + st.hooks * 1000 + r.dead * 2500;
  return st.gens * 1250 + st.heals * 600 + st.rescues * 1500 + st.stuns * 800 + (p.outcome === 'escaped' ? 5000 : 0);
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
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => el.classList.add('fade'), 4200);
  setTimeout(() => el.remove(), 4800);
}

// ==================== 入力 ====================
const keys = new Set();
let pressedBits = 0;
const mouse = { x: innerWidth / 2, y: innerHeight / 3, left: false, right: false, used: false };
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
  KeyC: BTN.SNEAK,
  KeyE: BTN.INTERACT,
  KeyF: BTN.INTERACT,
  Space: BTN.ACTION,
  KeyQ: BTN.HOWL,
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (!$('settings').classList.contains('hidden')) closeSettings();
    else if (S.game && S.game.ready) togglePause();
    return;
  }
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
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const worldCanvas = $('world');
worldCanvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.used = true;
});
worldCanvas.addEventListener('mousedown', (e) => {
  unlockAudio();
  if (S.game && S.game.skill && e.button === 0) {
    hitSkill();
    return;
  }
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
worldCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// タッチのボタンでスキルチェックやもがきを処理する
touch.onButton = (id) => {
  const G = S.game;
  if (!G || !G.me) return false;
  if (G.skill && (id === 'interact' || id === 'action' || id === 'attack')) {
    hitSkill();
    return true;
  }
  if (G.me.h === HEALTH.CARRIED && id === 'interact') {
    // 左右交互入力の代わりに連打でもがく
    G.wiggleSide = G.wiggleSide === BTN.LEFT ? BTN.RIGHT : BTN.LEFT;
    pressedBits |= G.wiggleSide;
    return true;
  }
  if (G.me.h === HEALTH.CAGED && id === 'interact') {
    pressedBits |= BTN.ACTION;
    return true;
  }
  return false;
};
// スキルチェック中は画面のどこをタップしても判定
hud.parentElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && S.game && S.game.skill && e.target === worldCanvas) hitSkill();
});

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
  const killer = S.game && S.game.role === 'killer';
  const T = touch.enabled;
  let body;
  if (killer) {
    body = T
      ? `<b>キラーの操作</b><br>左側をドラッグ: 移動 (向きも変わる)<br><b>攻撃</b>: 近くのサバイバーに自動で狙いを合わせる<br><b>突進</b>: 長押しで溜めて離すと突進<br><b>咆哮</b>: 走っているサバイバーの位置を暴く<br><b>アクション</b>: 担ぐ・フックに吊るす・板の破壊・窓枠越え・発電機の破壊・ロッカー捜索`
      : `<b>キラーの操作</b><br><kbd>WASD</kbd> 移動 / マウスで向き<br><kbd>左クリック</kbd> 攻撃<br><kbd>右クリック</kbd> 長押し→離す: 突進<br><kbd>Q</kbd> 咆哮 (走っている者を暴く)<br><kbd>Space</kbd> 担ぐ・フックに吊るす・板破壊・窓枠越え・発電機破壊・ロッカー捜索・ハッチを閉じる<br><kbd>Esc</kbd> メニュー`;
    body += '<br><br>目標: サバイバーを攻撃してダウンさせ、赤い印のフックに吊るす。赤い足跡と血痕が手がかり。';
  } else {
    body = T
      ? `<b>サバイバーの操作</b><br>左側をドラッグ: 移動<br><b>大ボタン</b>: 長押しで発電機の修理・治療・救出。押すとロッカーに隠れる<br><b>板/窓枠</b>: 板を倒す・窓枠を越える<br><b>しゃがむ</b>: 足跡を残さず静かに動く<br>スキルチェックは画面をタップ`
      : `<b>サバイバーの操作</b><br><kbd>WASD</kbd> 移動 / <kbd>Shift</kbd> しゃがみ<br><kbd>E</kbd> 長押し: 修理・治療・救出・ゲート / 押す: ロッカー・ハッチ<br><kbd>Space</kbd> 板を倒す・窓枠を越える・スキルチェック<br>担がれたら <kbd>A</kbd><kbd>D</kbd> 交互連打<br><kbd>Esc</kbd> メニュー`;
    body += '<br><br>目標: 黄色い歯車の発電機を修理して脱出ゲートに通電させ、脱出する。心音が聞こえたらキラーが近い。';
  }
  h.innerHTML = `${body}<div class="row"><button id="help-close" class="primary">はじめる</button></div>`;
  h.classList.remove('hidden');
  $('help-close').onclick = () => h.classList.add('hidden');
}
// ==================== ポーズ・設定 ====================
function togglePause(force) {
  const el = $('pause');
  const open = force ?? el.classList.contains('hidden');
  el.classList.toggle('hidden', !open);
  $('leave-confirm').classList.add('hidden');
  keys.clear();
}
$('btn-pause').onclick = () => togglePause(true);
$('pause-resume').onclick = () => togglePause(false);
$('pause-help').onclick = () => {
  togglePause(false);
  toggleHelp();
};
$('pause-settings').onclick = () => {
  $('pause').classList.add('hidden');
  openSettings();
};
$('pause-leave').onclick = () => $('leave-confirm').classList.remove('hidden');
$('leave-no').onclick = () => $('leave-confirm').classList.add('hidden');
$('leave-yes').onclick = () => {
  togglePause(false);
  send({ type: 'leave' });
};
$('btn-settings-title').onclick = () => openSettings();

function openSettings() {
  $('set-brightness').value = settings.brightness;
  $('set-volume').value = settings.volume;
  $('set-camera').value = settings.camera;
  $('set-quality').value = settings.quality;
  $('settings').classList.remove('hidden');
}
function closeSettings() {
  $('settings').classList.add('hidden');
  // 試合中にポーズから開いた場合はポーズに戻る
  if (S.game && S.game.ready) togglePause(true);
}
function saveSettings() {
  settings.brightness = Number($('set-brightness').value);
  settings.volume = Number($('set-volume').value);
  settings.camera = Number($('set-camera').value);
  settings.quality = $('set-quality').value;
  safeSet(SETTINGS_KEY, JSON.stringify(settings));
  setVolume(settings.volume);
  world.applySettings(resolvedSettings());
}
for (const id of ['set-brightness', 'set-volume', 'set-camera', 'set-quality']) $(id).addEventListener('input', saveSettings);
$('settings-close').onclick = closeSettings;

// 30Hz で入力を送信し、同時に自分の移動を予測する
setInterval(() => {
  const G = S.game;
  if (!G || !G.me || !G.ready) return;
  const t = touch.enabled ? touch.take() : { held: 0, pressed: 0, move: null };
  let buttons = heldBits() | t.held;
  const pressed = pressedBits | t.pressed;
  pressedBits = 0;
  const move = t.move ? { x: +t.move.x.toFixed(3), y: +t.move.y.toFixed(3) } : null;
  updateAim(G, move, pressed);
  // 担がれ中のスティック操作は左右入力として扱う
  if (move && G.me.h === HEALTH.CARRIED) buttons |= move.x < 0 ? BTN.LEFT : BTN.RIGHT;
  const cmd = { seq: ++G.seq, buttons, pressed, aim: +G.aim.toFixed(3) };
  if (move && G.me.h !== HEALTH.CARRIED) cmd.move = move;
  send({ type: 'input', ...cmd });
  G.pending.push(cmd);
  if (G.pending.length > 90) G.pending.shift();
  if (G.pred && canPredict(G)) applyMove(G, G.pred, cmd);
}, TICK_DT * 1000);

function updateAim(G, move, pressed) {
  const self = renderSelfPos(G);
  if (touch.enabled && !mouse.used) {
    if (move) G.aim = Math.atan2(move.y, move.x);
    // キラーの攻撃は近くのサバイバーへ少しだけ吸い付く
    if (G.role === 'killer' && pressed & (BTN.ATTACK | BTN.POWER)) {
      let best = null;
      let bd = 3.2;
      for (const [, o] of G.others) {
        const d = o.data;
        if (!o.visible || d.role !== 'survivor' || d.aura || ![HEALTH.HEALTHY, HEALTH.INJURED].includes(d.h)) continue;
        const dist = Math.hypot(d.x - self.x, d.y - self.y);
        const a = Math.atan2(d.y - self.y, d.x - self.x);
        if (dist < bd && Math.abs(angleDiff(a, G.aim)) < 1.2) {
          bd = dist;
          best = a;
        }
      }
      if (best !== null) G.aim = best;
    }
    return;
  }
  const p = world.screenToGround(mouse.x, mouse.y);
  if (p) G.aim = Math.atan2(p.y - self.y, p.x - self.x);
}

function canPredict(G) {
  return G.me && !G.me.locked;
}

// サーバーと同じ移動計算 (shared/physics.js) を手元でも実行する
function applyMove(G, pos, cmd) {
  const me = G.me;
  let speed;
  let dir;
  const analog = cmd.move
    ? { x: cmd.move.x / (Math.hypot(cmd.move.x, cmd.move.y) || 1), y: cmd.move.y / (Math.hypot(cmd.move.x, cmd.move.y) || 1) }
    : null;
  if (G.role === 'killer') {
    speed = me.speed;
    if (me.forced) dir = { x: Math.cos(cmd.aim), y: Math.sin(cmd.aim) };
    else dir = analog || inputDir(cmd.buttons);
  } else {
    if (me.h === HEALTH.DOWNED) speed = SPEED.survivorCrawl;
    else speed = cmd.buttons & BTN.SNEAK ? SPEED.survivorSneak * (me.sneakMul || 1) : SPEED.survivorRun;
    if (me.haste) speed *= SPEED.hasteMul;
    dir = analog || inputDir(cmd.buttons);
    if (cmd.buttons & BTN.INTERACT && G.interactBusy) dir = { x: 0, y: 0 };
  }
  moveCircle(pos, dir.x * speed, dir.y * speed, TICK_DT, G.role === 'killer' ? RADIUS.killer : RADIUS.survivor, G.grid.isSolid);
}

// ==================== スナップショット ====================
function onSnap(snap) {
  const G = S.game;
  if (!G) return;
  const now = performance.now() / 1000;
  const off = snap.time - now;
  G.timeOffset = G.timeOffset === null ? off : G.timeOffset + (off - G.timeOffset) * 0.05;
  if (off > G.timeOffset + 0.25 || off < G.timeOffset - 0.5) G.timeOffset = off;

  G.snap = snap;
  const me = snap.you;
  G.me = me;

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
    if (Math.hypot(ex, ey) > 2) G.smooth.x = G.smooth.y = 0;
    else {
      G.smooth.x = ex;
      G.smooth.y = ey;
    }
    G.pred = replay;
  }

  const seen = new Set();
  for (const p of snap.players) {
    seen.add(p.id);
    let o = G.others.get(p.id);
    if (!o) {
      o = { buf: [] };
      G.others.set(p.id, o);
    }
    if (o.lastTick !== undefined && snap.tick - o.lastTick > 6) o.buf = [];
    o.buf.push({ t: snap.time, x: p.x, y: p.y, a: p.a });
    if (o.buf.length > 20) o.buf.shift();
    o.data = p;
    o.lastTick = snap.tick;
  }
  for (const [id, o] of G.others) o.visible = seen.has(id);
  for (const t of snap.team) if (t.h === HEALTH.DEAD || t.h === HEALTH.ESCAPED) G.gone.add(t.id);

  for (const e of snap.events || []) onEvent(G, e);
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
      if (['hit', 'stun', 'pallet', 'bonk'].includes(e.sound) && me && e.x !== undefined && Math.hypot(e.x - me.x, e.y - me.y) < 6)
        world.shake = 0.25;
      if (G.ready && e.x !== undefined) {
        const fx = { hit: 'blood', down: 'blood', crack: 'dust', kick: 'sparks', stun: 'stun', bonk: 'stun', gen_done: 'gold' }[e.sound];
        if (fx) world.burst(fx, e.x, e.y);
      }
      // 自分が攻撃されたら画面を赤く
      if ((e.sound === 'hit' || e.sound === 'down') && me && e.x !== undefined && Math.hypot(e.x - me.x, e.y - me.y) < 0.8 && G.role === 'survivor')
        G.hurtFlash = performance.now() / 1000;
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
    case 'sacrifice':
      if (G.ready) world.sacrifice(e.x, e.y);
      break;
  }
}

// ==================== スキルチェック ====================
function skillNeedle(G) {
  const s = G.skill;
  return (performance.now() / 1000 - s.startedAt - s.warn) / s.spin;
}

function hitSkill() {
  const G = S.game;
  const s = G && G.skill;
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
    send({ type: 'skill', id: s.id, result: 'miss' });
    G.skill = null;
  }
}

// ==================== 描画ループ ====================
let dpr = 1;
function resizeHud() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  hud.width = Math.floor(innerWidth * dpr);
  hud.height = Math.floor(innerHeight * dpr);
}
window.addEventListener('resize', resizeHud);
resizeHud();

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
      return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, a: a.a + angleDiff(c.a, a.a) * k };
    }
  }
  return b[b.length - 1];
}

function renderSelfPos(G) {
  if (G.pred && G.me && !G.me.locked) return { x: G.pred.x + G.smooth.x, y: G.pred.y + G.smooth.y };
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
  if (!G || !G.snap || !G.ready) {
    if (S.assetsReady && $('loading').classList.contains('hidden')) world.renderMenu(dt, now / 1000);
    return;
  }
  const k = Math.min(1, dt * 10);
  G.smooth.x -= G.smooth.x * k;
  G.smooth.y -= G.smooth.y * k;
  updateSkill(G);
  drawFrame(G, dt, now / 1000);
}
requestAnimationFrame(frame);

function drawFrame(G, dt, T) {
  const snap = G.snap;
  const me = G.me;
  const isKiller = G.role === 'killer';
  const self = renderSelfPos(G);
  const alive = !me.h || ![HEALTH.DEAD, HEALTH.ESCAPED].includes(me.h);
  const moving = me.locked ? false : Math.hypot(G.pred ? G.pred.x - (G.lastSelf?.x ?? 0) : 0, G.pred ? G.pred.y - (G.lastSelf?.y ?? 0) : 0) > 0.002;
  G.lastSelf = G.pred ? { ...G.pred } : null;

  // 足音
  if (moving && alive && !(heldBits() & BTN.SNEAK) && !(touch.toggles & BTN.SNEAK)) {
    G.stepT -= dt;
    if (G.stepT <= 0) {
      G.stepT = isKiller ? 0.42 : 0.32;
      play('footstep', isKiller ? 0.5 : 0.35);
    }
  }

  // 視界
  const eye = me.hidden != null || me.h === HEALTH.CAGED || me.h === HEALTH.CARRIED ? { x: me.x, y: me.y } : self;
  const facing = me.locked || me.forced ? me.a : G.aim;
  const polys = visibilityPolygons(eye.x, eye.y, facing, isKiller, G.grid.blocksSight, me.hidden != null ? 3 : 0);
  world.setVision(polys, alive);

  // 表示するキャラクター
  const rt = renderTime(G);
  const list = [];
  for (const [id, o] of G.others) {
    if (!o.visible) continue;
    const d = o.data;
    const pos = d.h === HEALTH.CAGED ? { x: d.x, y: d.y, a: 0 } : sampleOther(o, rt);
    if (!pos) continue;
    list.push({ id, d, x: pos.x, y: pos.y, a: pos.a });
  }
  if (alive && me.hidden == null) {
    const d = { ...me, role: G.role, character: me.character, mv: moving, sn: !!((heldBits() | touch.toggles) & BTN.SNEAK) };
    list.push({ id: me.id, self: true, d, x: self.x, y: self.y, a: me.locked || me.forced ? me.a : G.aim });
  }

  world.render({ dt, T, self, list, snap, isKiller, selfAlive: alive, gone: G.gone });
  updateTension(G, list, self, alive);
  drawHud(G, list, T);
  updateTouchButtons(G);
}

// 追跡中の緊張感と、修理済み発電機のうなり
function updateTension(G, list, self, alive) {
  let chase = 0;
  if (alive) {
    if (G.role === 'survivor') {
      const k = list.find((e) => isKillerRole(e.d.role) && !e.d.aura);
      if (k) chase = Math.max(0, 1 - Math.hypot(k.x - self.x, k.y - self.y) / 10);
      chase = Math.max(chase, G.snap.heartbeat * 0.5);
    } else {
      for (const e of list) {
        if (e.self || e.d.aura || e.d.role !== 'survivor' || ![HEALTH.HEALTHY, HEALTH.INJURED].includes(e.d.h)) continue;
        chase = Math.max(chase, 1 - Math.hypot(e.x - self.x, e.y - self.y) / 10);
      }
    }
  }
  setChase(chase);
  let near = Infinity;
  G.map.gens.forEach((g, i) => {
    if (G.snap.gens[i].done) near = Math.min(near, Math.hypot(g.x + 0.5 - self.x, g.y + 0.5 - self.y));
  });
  setLoop('gen_hum', Math.max(0, 1 - near / 9) * 0.35);
}

function updateTouchButtons(G) {
  if (!touch.enabled) return;
  const me = G.me;
  if (G.role === 'killer') {
    touch.setCooldown('power', me.dashCd > 0);
    touch.setCooldown('howl', me.howlCd > 0);
  } else {
    const label =
      me.h === HEALTH.CARRIED
        ? 'もがく\n(連打)'
        : me.h === HEALTH.CAGED
          ? '自力脱出'
          : G.skill
            ? 'スキル\nチェック'
            : (contextVerb(G) ?? '修理/治療\n(長押し)');
    touch.setLabel('interact', label);
  }
}

// ==================== HUD ====================
function outlinedText(text, x, y, color, width = 3) {
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function bar(x, y, w, h, v, color, bg = 'rgba(0,0,0,0.55)') {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
}

function panel(x, y, w, h, color = 'rgba(10,11,16,0.72)') {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

const HEALTH_LABEL = {
  healthy: '健康',
  injured: '負傷',
  downed: 'ダウン',
  carried: '担がれ中',
  caged: 'フック',
  escaped: '脱出',
  dead: '生贄',
};
const HEALTH_COLOR = {
  healthy: '#9be39f',
  injured: '#f0a046',
  downed: '#e5534b',
  carried: '#e5534b',
  caged: '#e5534b',
  escaped: '#7cc7ff',
  dead: '#777',
};

function drawHud(G, list, T) {
  const W = innerWidth;
  const H = innerHeight;
  const snap = G.snap;
  const me = G.me;
  const isKiller = G.role === 'killer';
  const small = W < 700;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // 画面の縁を暗くして視線を中央に集める
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // 被弾時の赤いフラッシュ
  if (G.hurtFlash) {
    const k = 1 - (performance.now() / 1000 - G.hurtFlash) / 0.6;
    if (k > 0) {
      ctx.fillStyle = `rgba(170,0,10,${0.35 * k})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // 心音 (恐怖範囲)
  if (!isKiller && snap.heartbeat > 0) {
    const hb = snap.heartbeat;
    const period = 1.1 - hb * 0.65;
    if (T - G.lastHeartbeat > period) {
      G.lastHeartbeat = T;
      play('heartbeat', 0.35 + hb * 0.65);
    }
    const pulse = Math.max(0, 1 - (T - G.lastHeartbeat) / 0.35);
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(160,0,10,0)');
    grad.addColorStop(1, `rgba(160,0,10,${0.18 + hb * 0.4 + pulse * 0.15 * hb})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // 名前と行動バー
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px sans-serif';
  for (const e of list) {
    if (e.self || e.d.h === HEALTH.CARRIED) continue;
    const killer = isKillerRole(e.d.role);
    const p = world.project(e.x, e.y, killer ? 2.3 : 1.75);
    if (!p.front) continue;
    outlinedText(e.d.name, p.x, p.y, killer ? '#ff8a8a' : e.d.aura ? '#ffd23f' : '#fff');
    if (e.d.ap !== undefined && e.d.act && !e.d.aura) bar(p.x - 18, p.y + 4, 36, 4, e.d.ap, '#e8c45a');
  }

  // 発電機のオーラ (全員に位置だけ見える。サバイバーは進捗も)
  G.map.gens.forEach((g, i) => {
    const s = snap.gens[i];
    if (s.done) return;
    const p = world.project(g.x + 0.5, g.y + 0.5, 1.6);
    if (!p.front) return;
    ctx.strokeStyle = 'rgba(255,215,90,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    if (s.p > 0) {
      ctx.strokeStyle = s.r ? '#ff4b4b' : '#ffd25a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.p);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,215,90,0.9)';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('⚙', p.x, p.y + 4);
  });
  // キラーは空いているフックの位置がわかる
  if (isKiller) {
    G.map.cages.forEach((c, i) => {
      if (snap.cages[i].b || snap.cages[i].o) return;
      const p = world.project(c.x + 0.5, c.y + 0.5, 1.8);
      if (!p.front) return;
      ctx.strokeStyle = me.carry ? 'rgba(255,60,60,0.95)' : 'rgba(255,60,60,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y - 8);
      ctx.lineTo(p.x + 6, p.y - 8);
      ctx.lineTo(p.x, p.y + 6);
      ctx.closePath();
      ctx.stroke();
    });
  }
  // 物音の通知 (キラー) / 発電機完了
  for (const n of snap.noises || []) {
    const a = Math.max(0, 1 - n.age / 3);
    const p = world.project(n.x, n.y, 0.8);
    if (!p.front) continue;
    const r = 10 + n.age * 18;
    ctx.strokeStyle = n.k === 'gen_done' ? `rgba(255,220,120,${a})` : n.k === 'groan' ? `rgba(255,90,90,${a})` : `rgba(255,190,60,${a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // ハッチ・通電したゲート
  if (snap.hatch && snap.hatch.open) {
    const p = world.project(snap.hatch.x + 0.5, snap.hatch.y + 0.5, 0.3);
    if (p.front) {
      ctx.strokeStyle = 'rgba(170,230,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14 + Math.sin(T * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  G.map.gates.forEach((g, i) => {
    if (!snap.gates[i].pw) return;
    const p = world.project(g.x, g.y, 2.4);
    if (!p.front) return;
    ctx.fillStyle = snap.gates[i].o ? '#7dff9a' : '#ffd25a';
    ctx.font = 'bold 13px sans-serif';
    outlinedText(snap.gates[i].o ? 'EXIT' : `ゲート ${Math.round(snap.gates[i].p * 100)}%`, p.x, p.y, snap.gates[i].o ? '#7dff9a' : '#ffd25a');
  });

  // 上部: 残り発電機 (DbD と同じく発電機アイコン + 数字)
  const left = Math.max(0, snap.gensRequired - snap.gensDone);
  const top = touch.enabled ? 10 : 12;
  const cxTop = W / 2;
  panel(cxTop - 70, top, 140, 40, 'rgba(8,9,13,0.7)');
  drawGenIcon(cxTop - 38, top + 20, 13, snap.gates[0].pw ? '#ffd25a' : '#e8e3d9');
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px sans-serif';
  outlinedText(snap.gates[0].pw ? '通電' : String(left), cxTop - 18, top + 28, snap.gates[0].pw ? '#ffd25a' : '#f2ede4');
  if (snap.collapse !== null) {
    const urgent = snap.collapse < 30;
    panel(cxTop - 110, top + 46, 220, 28, urgent ? 'rgba(120,0,0,0.85)' : 'rgba(70,0,0,0.75)');
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    outlinedText(`エンドゲーム崩壊 ${Math.ceil(snap.collapse)}`, cxTop, top + 66, urgent && Math.floor(T * 2) % 2 ? '#fff' : '#ff8080');
  }

  // 左側: サバイバーの状態アイコン (狭い画面ではアイコンだけ)
  const compact = W < 520;
  const rowH = compact ? 40 : small ? 40 : 46;
  let y = compact ? 62 : small ? 10 : 14;
  const x0 = touch.enabled ? 10 : 14;
  for (const t of snap.team) {
    const col = (SURVIVOR_CHARACTERS[t.character] || SURVIVOR_CHARACTERS.knight).color;
    const mine = t.id === S.you;
    if (compact) {
      drawStatusIcon(x0 + 16, y + 14, 12, t.h, col, T);
      for (let i = 0; i < t.hk; i++) {
        ctx.fillStyle = '#d63a3f';
        ctx.fillRect(x0 + 34, y + 6 + i * 9, 4, 6);
      }
      y += rowH - 4;
      continue;
    }
    panel(x0, y, small ? 150 : 186, rowH - 6, mine ? 'rgba(90,16,22,0.78)' : 'rgba(8,9,13,0.66)');
    drawStatusIcon(x0 + 20, y + (rowH - 6) / 2, small ? 12 : 14, t.h, col, T);
    ctx.textAlign = 'left';
    ctx.font = `bold ${small ? 11 : 13}px sans-serif`;
    ctx.fillStyle = t.h === 'dead' ? '#777' : '#eee';
    ctx.fillText(t.name.slice(0, 9) + (t.bot ? ' ·BOT' : ''), x0 + 40, y + (small ? 15 : 18));
    ctx.font = `${small ? 10 : 11}px sans-serif`;
    ctx.fillStyle = HEALTH_COLOR[t.h];
    ctx.fillText(HEALTH_LABEL[t.h] + (t.h === 'caged' ? ` (段階 ${t.st})` : ''), x0 + 40, y + (small ? 29 : 34));
    // フック回数のピン
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i < t.hk ? '#d63a3f' : 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo((small ? 150 : 186) + x0 - 14 - i * 12, y + 10);
      ctx.lineTo((small ? 150 : 186) + x0 - 8 - i * 12, y + 22);
      ctx.lineTo((small ? 150 : 186) + x0 - 20 - i * 12, y + 22);
      ctx.closePath();
      ctx.fill();
    }
    y += rowH;
  }

  // 下部: ヒントと進捗
  const cx = W / 2;
  let by = H - (touch.enabled ? 210 : 40);
  const hint = contextHint(G);
  if (hint) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px sans-serif';
    const w = ctx.measureText(hint).width + 28;
    panel(cx - w / 2, by - 21, w, 30);
    outlinedText(hint, cx, by, '#f2ede4');
    by -= 42;
  }
  const prog = actionProgress(G);
  if (prog) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px sans-serif';
    outlinedText(prog.label, cx, by - 4, '#fff');
    bar(cx - 120, by + 2, 240, 10, prog.v, prog.color || '#e8c45a');
  }

  if (isKiller && !touch.enabled) {
    const items = [
      { key: '右クリック', name: '突進', cd: me.dashCd, max: KILLER_CFG.dashCooldown },
      { key: 'Q', name: '咆哮', cd: me.howlCd, max: KILLER_CFG.howlCooldown },
    ];
    items.forEach((it, i) => {
      const x = W - 190;
      const yy = H - 100 + i * 44;
      panel(x, yy, 176, 38);
      ctx.textAlign = 'left';
      ctx.fillStyle = it.cd > 0 ? '#888' : '#eee';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`${it.name} [${it.key}]`, x + 10, yy + 16);
      bar(x + 10, yy + 24, 156, 6, 1 - it.cd / it.max, it.cd > 0 ? '#666' : '#d63a3f');
    });
  } else if (!isKiller) {
    const badges = [];
    if (me.haste) badges.push('スプリント');
    if (me.endurance) badges.push('与えられた猶予');
    if (me.h === HEALTH.DOWNED) badges.push(`失血 ${me.bleed} 秒`);
    badges.forEach((b, i) => {
      const x = touch.enabled ? 10 : W - 160;
      const yy = touch.enabled ? 170 + i * 34 : H - 56 - i * 36;
      panel(x, yy, 146, 28);
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px sans-serif';
      outlinedText(b, x + 73, yy + 19, '#f2ede4');
    });
  }

  if (me.h === HEALTH.CARRIED) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    outlinedText(touch.enabled ? 'もがくボタンを連打!' : 'A と D を交互に連打してもがけ!', cx, H / 2 + 90, '#fff');
    bar(cx - 150, H / 2 + 102, 300, 12, me.wiggle, '#7ee081');
  }
  if (me.h === HEALTH.CAGED) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    const txt =
      me.hookStage === 1
        ? `救助を待て… (${touch.enabled ? '自力脱出ボタン' : 'Space'}: 自力脱出 残り ${me.selfUnhook} 回・成功率 4%)`
        : '抵抗中! スキルチェックに失敗すると生贄に…';
    outlinedText(txt, cx, H / 2 + 90, '#fff');
    bar(cx - 150, H / 2 + 102, 300, 10, me.hookTimer / 45, me.hookStage === 2 ? '#e5534b' : '#e8c45a');
  }
  if (me.h === HEALTH.DEAD || me.h === HEALTH.ESCAPED) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px sans-serif';
    outlinedText(
      me.h === HEALTH.DEAD ? '生贄に捧げられた… 観戦中' : '脱出成功! 仲間を見守ろう',
      cx,
      H / 2 - 60,
      me.h === HEALTH.DEAD ? '#ff8080' : '#9be39f',
    );
  }
  drawSkill(G, W, H);
}

// 発電機のアイコン (歯車)
function drawGenIcon(x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r * 0.78 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(8,9,13,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// サバイバーの状態アイコン (健康・負傷・ダウン・担がれ・フック・生贄・脱出)
function drawStatusIcon(x, y, r, h, color, T) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  // 外枠
  ctx.strokeStyle = h === 'dead' ? '#555' : color;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const fg = { healthy: '#e8e3d9', injured: '#f0a046', downed: '#e5534b', carried: '#e5534b', caged: '#e5534b', escaped: '#7cc7ff', dead: '#666' }[h];
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  if (h === 'dead') {
    // ドクロ
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.3, r * 0.2, r * 0.6, r * 0.35);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-r * 0.2, -r * 0.15, r * 0.14, 0, Math.PI * 2);
    ctx.arc(r * 0.2, -r * 0.15, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  } else if (h === 'caged') {
    // フック
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7);
    ctx.lineTo(0, r * 0.1);
    ctx.arc(-r * 0.3, r * 0.1, r * 0.3, 0, Math.PI, false);
    ctx.stroke();
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(T * 6);
    ctx.beginPath();
    ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (h === 'escaped') {
    // 扉
    ctx.strokeRect(-r * 0.45, -r * 0.6, r * 0.9, r * 1.2);
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, 0);
    ctx.lineTo(r * 0.55, 0);
    ctx.moveTo(r * 0.3, -r * 0.25);
    ctx.lineTo(r * 0.55, 0);
    ctx.lineTo(r * 0.3, r * 0.25);
    ctx.stroke();
  } else if (h === 'downed' || h === 'carried') {
    // 倒れた人
    ctx.beginPath();
    ctx.arc(-r * 0.5, r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.25, r * 0.05, r * 0.85, r * 0.22);
  } else {
    // 立っている人 (負傷は血のしずく付き)
    ctx.beginPath();
    ctx.arc(0, -r * 0.4, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, r * 0.6);
    ctx.lineTo(-r * 0.25, -r * 0.1);
    ctx.lineTo(r * 0.25, -r * 0.1);
    ctx.lineTo(r * 0.35, r * 0.6);
    ctx.closePath();
    ctx.fill();
    if (h === 'injured') {
      ctx.fillStyle = '#d63a3f';
      ctx.beginPath();
      ctx.arc(r * 0.55, r * 0.35, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function actionProgress(G) {
  const me = G.me;
  const a = me.act;
  if (!a) return null;
  const labels = {
    repair: '発電機を修理中',
    heal: '治療中',
    heal_self: '自己治療中',
    gate: '脱出ゲートを開放中',
    unhook: '救出中',
    pickup: '担ぎ上げ中',
    hook: 'フックに吊るしている',
    break_pallet: '板を破壊中',
    kick_gen: '発電機を破壊中',
    search_locker: 'ロッカーを捜索中',
    close_hatch: 'ハッチを閉じている',
    stunned: '怯み中',
    vault: '乗り越え中',
    pallet_vault: '乗り越え中',
    locker_enter: 'ロッカーに入っている',
    locker_exit: 'ロッカーから出ている',
    hatch_jump: 'ハッチに飛び込む',
  };
  const label = labels[a];
  if (!label) return null;
  let v = me.ap ?? 0;
  if (a === 'repair') v = me.genProgress ?? 0;
  if (a === 'heal') v = me.healTarget ?? 0;
  if (a === 'heal_self') v = me.heal ?? 0;
  if (a === 'gate') v = me.gateProgress ?? 0;
  return { label: me.stalled ? 'スキルチェック失敗!' : label, v, color: me.stalled ? '#e5534b' : undefined };
}

// タッチの大ボタンに表示する動詞
function contextVerb(G) {
  const h = contextHint(G);
  if (!h || !h.includes(':')) return null;
  const [key, verb] = h.split(': ');
  return key.startsWith('E') ? verb.replace(/ \(.*\)/, '') : null;
}

function contextHint(G) {
  const me = G.me;
  const snap = G.snap;
  const pos = { x: me.x, y: me.y };
  const near = (o, r = INTERACT_RANGE) => Math.hypot(o.x + 0.5 - pos.x, o.y + 0.5 - pos.y) < r;
  const T = touch.enabled;
  const SP = T ? 'アクション' : 'Space';
  if (me.locked && me.hidden == null) return null;
  if (G.role === 'killer') {
    if (me.carry) {
      const cage = G.map.cages.find((c, i) => !snap.cages[i].o && !snap.cages[i].b && near(c, INTERACT_RANGE + 0.4));
      return cage ? `${SP}: フックに吊るす` : '赤い印のフックへ運べ';
    }
    for (const [, o] of G.others) {
      if (o.visible && o.data.h === HEALTH.DOWNED && Math.hypot(o.data.x - pos.x, o.data.y - pos.y) < INTERACT_RANGE + 0.2) return `${SP}: 担ぐ`;
    }
    if (snap.hatch && snap.hatch.open && near(snap.hatch, INTERACT_RANGE + 0.3)) return `${SP}: ハッチを閉じる`;
    if (G.map.pallets.some((p, i) => snap.pallets[i] === 'down' && near(p, 1.3))) return `${SP}: 板を破壊`;
    if (G.map.windows.some((w) => near(w, 1.2))) return `${SP}: 窓枠を越える`;
    if (G.map.lockers.some((l) => near(l, INTERACT_RANGE + 0.2))) return `${SP}: ロッカーを捜索`;
    if (G.map.gens.some((g, i) => !snap.gens[i].done && !snap.gens[i].r && snap.gens[i].p > 0 && near(g, INTERACT_RANGE + 0.2)))
      return `${SP}: 発電機を破壊`;
    return null;
  }
  const E = T ? 'E' : 'E 長押し';
  if (me.h === HEALTH.DOWNED) return 'ダウン中… 仲間の治療を待て (這って移動できる)';
  if (me.hidden != null) return `${T ? 'E' : 'E'}: ロッカーから出る`;
  if ([HEALTH.CARRIED, HEALTH.CAGED, HEALTH.DEAD, HEALTH.ESCAPED].includes(me.h)) return null;
  if (snap.hatch && snap.hatch.open && near(snap.hatch)) return 'E: ハッチに飛び込む';
  if (G.map.cages.some((c, i) => snap.cages[i].o && near(c, INTERACT_RANGE + 0.2))) return `${E}: 救出`;
  for (const [, o] of G.others) {
    const d = o.data;
    if (!o.visible || d.role !== 'survivor') continue;
    if ((d.h === HEALTH.INJURED || d.h === HEALTH.DOWNED) && Math.hypot(d.x - pos.x, d.y - pos.y) < INTERACT_RANGE + 0.3)
      return `${E}: ${d.name} を治療`;
  }
  if (G.map.pallets.some((p, i) => snap.pallets[i] === 'up' && near(p, 1.15))) return `${SP}: 板を倒す`;
  if (G.map.pallets.some((p, i) => snap.pallets[i] === 'down' && near(p, 1.1))) return `${SP}: 板を乗り越える`;
  if (G.map.windows.some((w) => near(w, 1.15))) return `${SP}: 窓枠を越える (しゃがむと静か)`;
  if (G.map.gates.some((g, i) => snap.gates[i].pw && !snap.gates[i].o && Math.hypot(g.x - pos.x, g.y - pos.y) < INTERACT_RANGE + 1.2))
    return `${E}: 脱出ゲートを開く`;
  if (G.map.gens.some((g, i) => !snap.gens[i].done && near(g))) return `${E}: 発電機を修理`;
  if (G.map.lockers.some((l) => near(l))) return 'E: ロッカーに隠れる';
  if (me.h === HEALTH.INJURED) return `${E}: 自己治療`;
  return null;
}

function drawSkill(G, W, H) {
  const s = G.skill;
  const cx = W / 2;
  const cy = H / 2 + (touch.enabled ? 40 : 110);
  const R = 52;
  if (G.skillFlash && performance.now() / 1000 - G.skillFlash.at < 0.6) {
    const f = G.skillFlash;
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px sans-serif';
    outlinedText(
      f.result === 'great' ? 'GREAT' : f.result === 'good' ? 'GOOD' : 'FAILED',
      cx,
      cy - R - 14,
      f.result === 'miss' ? '#ff6b6b' : '#ffd166',
    );
  }
  if (!s) return;
  const n = skillNeedle(G);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, R + 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  const A = (f) => -Math.PI / 2 + f * Math.PI * 2;
  ctx.lineWidth = 11;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(0, 0, R, A(s.zoneStart), A(s.zoneStart + s.good));
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.arc(0, 0, R, A(s.zoneStart), A(s.zoneStart + s.great));
  ctx.stroke();
  if (n >= 0) {
    ctx.strokeStyle = '#e5282f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(A(n)) * (R + 8), Math.sin(A(n)) * (R + 8));
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(touch.enabled ? 'TAP' : 'SPACE', 0, 5);
  ctx.restore();
}

// 最初の操作で音を有効にして環境音を流す (ブラウザは操作前の再生を禁止している)
window.addEventListener(
  'pointerdown',
  () => {
    unlockAudio();
    startAmbience();
  },
  { once: true },
);

// ?debug を付けると開発者ツールから状態を触れる
if (new URLSearchParams(location.search).has('debug')) window.__fog = { S, onMessage, world };

connect();
