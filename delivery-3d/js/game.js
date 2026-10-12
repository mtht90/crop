// ゲーム進行：荷物・営業所・積み込み・配達先でのやりとり・運転のルール・時間・画面表示
import * as THREE from 'three';
import { A, model, textTexture, JP_FONT } from './assets.js';
import { T, routePath, speedLimitAt, updateLights, resolveCircle, edgeAt, edgesNear, setDetail } from './town.js';
import { updateSignals } from './traffic.js';
import { Person, spawnDog, hasPeople } from './people.js';
import { bindUI, toast, dialog, dialogKey, closeDialog, slipHtml, updateHud, drawNav, updateNavFoot, openTablet, closeTablet, renderTablet, showMenu, closeMenu, showReport } from './ui.js';
import { TIME, WINDOWS, OKIHAI_PLACES, RESIDENTS, ITEMS, FAVORITES, SENDERS, FLAG_LABEL, BOX_DIMS, UPGRADES, LEVELS, parcelsForLevel } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const fmt = (m) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const resident = (id) => RESIDENTS.find(r => r.id === id);

let rand = Math.random;
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pick = (a) => a[Math.floor(rand() * a.length)];
const chance = (p) => rand() < p;
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));

// =========================================================
// 音
// =========================================================
const SFX = {
  click: 'click_002', select: 'select_001', ok: 'confirmation_001', ok2: 'confirmation_002', err: 'error_004', q: 'question_001',
  bell: 'bong_001', pick: 'impactPlank_medium_000', put: 'impactPunch_medium_000', door: 'impactMetal_heavy_000', hatch: 'impactPlate_medium_000',
  crash: 'impactMetal_heavy_000', glass: 'impactGlass_medium_000', step0: 'footstep_concrete_000', step1: 'footstep_concrete_001', step2: 'footstep_concrete_002', step3: 'footstep_concrete_003',
  morning: 'jingle_morning', result: 'jingle_result', levelup: 'jingle_levelup', tick: 'tick_002',
};
const audioPool = {};
let soundOn = true;
export function sfx(name, vol = 0.5) {
  if (!soundOn || !SFX[name]) return;
  try {
    const a = new Audio('assets/sfx/' + SFX[name] + '.ogg');
    a.volume = Math.min(1, vol * (G.save ? G.save.settings.vol : 0.7) * 1.4); a.play().catch(() => {});
    audioPool[name] = a;
  } catch (e) { /* 音が出せない環境 */ }
}
// エンジン音（WebAudio で合成：3気筒の爆発音の周波数＋吸気の音）
const engine = { ctx: null };
function startEngine() {
  if (engine.ctx || !window.AudioContext) return;
  try {
    const c = engine.ctx = new AudioContext();
    const master = engine.master = c.createGain(); master.gain.value = 0; master.connect(c.destination);
    const filt = engine.filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500; filt.Q.value = 0.8; filt.connect(master);
    engine.o1 = c.createOscillator(); engine.o1.type = 'sawtooth';
    engine.o2 = c.createOscillator(); engine.o2.type = 'square';
    engine.o3 = c.createOscillator(); engine.o3.type = 'triangle';
    const g1 = c.createGain(); g1.gain.value = 0.55; const g2 = c.createGain(); g2.gain.value = 0.22; const g3 = c.createGain(); g3.gain.value = 0.5;
    engine.o1.connect(g1).connect(filt); engine.o2.connect(g2).connect(filt); engine.o3.connect(g3).connect(filt);
    // 吸気・ロードノイズ
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const nf = engine.nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.7;
    const ng = engine.ng = c.createGain(); ng.gain.value = 0;
    noise.connect(nf).connect(ng).connect(master);
    engine.o1.start(); engine.o2.start(); engine.o3.start(); noise.start();
  } catch (e) { engine.ctx = null; }
}
function updateEngine(on, rpm, throttle, speed) {
  if (!engine.ctx) return;
  const t = engine.ctx.currentTime;
  const f = Math.max(10, rpm / 60 * 1.5);
  engine.o1.frequency.setTargetAtTime(f, t, 0.04);
  engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
  engine.o3.frequency.setTargetAtTime(f * 2, t, 0.04);
  engine.filt.frequency.setTargetAtTime(260 + throttle * 900 + rpm * 0.08, t, 0.06);
  const vol = (G.save ? G.save.settings.engineVol : 0.6) * (soundOn ? 1 : 0);
  engine.master.gain.setTargetAtTime(on && rpm > 100 ? (0.05 + throttle * 0.05) * vol : 0, t, 0.12);
  engine.ng.gain.setTargetAtTime(on ? (Math.min(1, Math.abs(speed) / 20) * 0.05 + throttle * 0.02) * vol : 0, t, 0.2);
}
function horn() {
  startEngine();
  const c = engine.ctx; if (!c) return;
  const g = c.createGain(); g.gain.value = 0.0001; g.connect(c.destination);
  const vol = 0.09 * (G.save ? G.save.settings.vol : 0.7);
  g.gain.setTargetAtTime(vol, c.currentTime, 0.01); g.gain.setTargetAtTime(0.0001, c.currentTime + 0.35, 0.04);
  for (const fr of [415, 520]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = fr; const lp = c.createBiquadFilter(); lp.frequency.value = 1800; o.connect(lp).connect(g); o.start(); o.stop(c.currentTime + 0.6); }
}

// =========================================================
// 状態
// =========================================================
const SAVE_KEY = 'aoba3d-save-v1';
// タッチの端末（スマホ・タブレット）は、最初から軽量の画質にする
const touchDevice = () => { try { return matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches; } catch (e) { return false; } };
const defaultSettings = () => ({ sens: 1, mouseSteer: false, mouseSteerSens: 1, vol: 0.7, engineVol: 0.6, quality: touchDevice() ? 'low' : 'high', mirrors: !touchDevice() });
const defaultSave = () => ({ day: 1, money: 0, exp: 0, level: 1, upgrades: {}, visits: {}, history: [], seed: Math.floor(Math.random() * 1e9), settings: defaultSettings() });
const SETTINGS_KEY = 'aoba3d-settings-v1';
function loadSettings() {
  try { return Object.assign(defaultSettings(), JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch (e) { return defaultSettings(); }
}
function writeSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.save.settings)); } catch (e) { /* 保存不可 */ } }
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.day) { const o = Object.assign(defaultSave(), s); o.settings = loadSettings(); return o; }
  } catch (e) { /* 新規 */ }
  return null;
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* 保存不可 */ } }
const hasUp = (id) => !!G.save.upgrades[id];

export const G = {
  day: null, mode: 'title', view: 'cab', overlay: null, keys: {}, carrying: [],
  timers: [], realT: 0, look: { yaw: 0, pitch: 0 }, prompt: null, focus: null, mouseSteer: 0, waiting: false,
  save: defaultSave(),
};
let ctx = null; // { scene, camera, van, player, traffic, renderer, sun, hemi }

// =========================================================
// 荷物
// =========================================================
let serial = 0;
const trackingNo = () => `${randint(1000, 9999)}-${randint(1000, 9999)}-${randint(1000, 9999)}`;
function makeParcel(rid, itemName, windowKey, opts = {}) {
  const r = resident(rid);
  const it = ITEMS.find(i => i.name === itemName) || ITEMS[0];
  const lot = T.lots[r.lot];
  let okihai = r.okihai, reason = '';
  if (it.flags.includes('cool')) { okihai = null; reason = 'クール便は置き配できません'; }
  else if (opts.noOkihai) { okihai = null; reason = '差出人の指定により置き配不可'; }
  else if (okihai && it.size >= 120 && ['宅配ボックス', 'メーターボックス'].includes(okihai)) { reason = `大きくて${okihai}に入らないため置き配不可`; okihai = null; }
  else if (!okihai) reason = '受取人の希望により置き配不可';
  return {
    id: 'P' + (++serial), no: trackingNo(), rid, lotId: r.lot, room: r.room || null, name: r.name,
    addr: lot.address + (r.room ? `　${lot.name} ${r.room}号室` : ''), item: it.name, size: it.size, weight: it.weight, flags: it.flags.slice(),
    window: windowKey, okihai, okihaiReason: reason, sender: opts.sender || pick(SENDERS), senderNoOkihai: !!opts.noOkihai,
    status: 'depot', misrouted: false, damaged: false, warm: false, loc: null, mesh: null,
  };
}
function misroutedParcel() {
  const it = pick(ITEMS.filter(i => !i.flags.includes('cool')));
  return {
    id: 'P' + (++serial), no: trackingNo(), rid: null, lotId: null, room: null, name: pick(['前田 和子', '藤井 修', '村上 千尋', '坂本 光']),
    addr: `わかば町${randint(1, 4)}-${randint(1, 6)}-${randint(1, 12)}`, item: it.name, size: it.size, weight: it.weight, flags: it.flags.slice(),
    window: 'none', okihai: null, okihaiReason: '', sender: pick(SENDERS), status: 'depot', misrouted: true, damaged: false, warm: false, loc: null, mesh: null,
  };
}
function presenceAt(r, t) {
  const h = t / 60;
  let p = r.awayRate;
  for (const [a, b, pp] of r.home) if (h >= a && h < b) p = pp;
  return p;
}
function pickWindowFor(r) {
  const keys = ['am', 'w1214', 'w1416', 'w1618', 'w1820'];
  const good = keys.filter(k => presenceAt(r, (WINDOWS[k].from + WINDOWS[k].to) / 2) >= 0.6);
  return good.length ? pick(good) : 'none';
}
function tutorialParcels() {
  return [
    makeParcel('tanaka', 'ふるさとの野菜', 'am', { sender: '実家より' }),
    makeParcel('komorebi', 'コーヒー豆', 'none'),
    makeParcel('yamamoto', 'ゲームソフト', 'w1416'),
    makeParcel('suzuki', 'オムツ（箱）', 'none'),
    makeParcel('sato_k', '書籍', 'none', { sender: 'ミドリ書店オンライン' }),
    makeParcel('yoshida', 'お米 10kg', 'am'),
    makeParcel('hanamaru', '鉢植え', 'w1214'),
    makeParcel('takahashi', '生鮮セット（産地直送）', 'w1618', { sender: 'ハルカゼ食品' }),
    makeParcel('kobayashi', '工具セット', 'none'),
    makeParcel('nakamura', '墨と半紙', 'none'),
  ];
}
function randomParcels(n) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const r = pick(RESIDENTS);
    const same = out.filter(p => p.rid === r.id).length;
    if (same >= 2 || (same === 1 && chance(0.75))) continue;
    const fav = FAVORITES[r.id];
    const name = fav && chance(0.6) ? pick(fav) : pick(ITEMS).name;
    const valuable = ['タブレット', '電子レンジ', 'ワイン 2本'].includes(name);
    out.push(makeParcel(r.id, name, chance(0.5) ? pickWindowFor(r) : 'none', { noOkihai: valuable && chance(0.5) }));
  }
  const cap = hasUp('cooler') ? 4 : 2;
  let cool = 0;
  for (const p of out) if (p.flags.includes('cool') && ++cool > cap) p.flags = p.flags.filter(f => f !== 'cool');
  return out;
}

const _boxTemplate = { geo: null };
function parcelMesh(p) {
  const [w, h, d] = BOX_DIMS[p.size];
  const g = new THREE.Group();
  const b = model('cardboard_box_01');
  b.scale.set(w / 0.39, h / 0.34, d / 0.52);
  g.add(b);
  // 伝票ラベル
  const tex = textTexture(256, 160, (c, W, H) => {
    c.fillStyle = '#fbfbf6'; c.fillRect(0, 0, W, H);
    c.fillStyle = p.flags.includes('cool') ? '#2f7fb0' : '#2f7d4f'; c.fillRect(0, 0, W, 30);
    c.fillStyle = '#fff'; c.font = `bold 20px ${JP_FONT}`; c.textBaseline = 'middle'; c.fillText(p.flags.includes('cool') ? 'クール便' : 'あおば運輸', 10, 16);
    c.fillStyle = '#222'; c.font = `bold 42px ${JP_FONT}`; c.fillText(p.name.split(' ')[0] + ' 様', 10, 66);
    c.font = `20px ${JP_FONT}`; c.fillStyle = '#444';
    c.fillText(p.addr.length > 13 ? p.addr.slice(0, 13) + '…' : p.addr, 10, 104);
    c.fillText(WINDOWS[p.window].label, 10, 134);
    let x = W - 8;
    for (const f of p.flags) {
      const col = f === 'cool' ? '#2f7fb0' : f === 'heavy' ? '#6a5a40' : '#c8281e';
      c.fillStyle = col; const t = FLAG_LABEL[f].label; c.font = `bold 18px ${JP_FONT}`;
      const tw = c.measureText(t).width + 10; x -= tw; c.fillRect(x, 120, tw - 4, 28); c.fillStyle = '#fff'; c.fillText(t, x + 3, 135); x -= 2;
    }
  });
  const lw = Math.min(0.24, w * 0.8), lh = lw * 0.625;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  label.rotation.x = -Math.PI / 2; label.position.set(0, h + 0.003, 0);
  g.add(label);
  if (p.flags.includes('fragile') || p.flags.includes('upright')) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.14, w * 0.4), 0.06), new THREE.MeshStandardMaterial({ color: 0xc8281e, roughness: 0.6 }));
    st.position.set(0, h * 0.6, d / 2 + 0.003); g.add(st);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.parcel = p;
  p.dims = [w, h, d];
  return g;
}

// 荷物をどこかへ置く（メッシュの親を付け替える）
function attachParcel(p, loc) {
  const van = ctx.van;
  p.loc = loc;
  const m = p.mesh;
  if (m.parent) m.parent.remove(m);
  m.visible = true;
  m.rotation.set(0, 0, 0);
  if (loc.type === 'slot') {
    const slot = van.slots.find(s => s.id === loc.slot);
    slot.parcel = p.id;
    m.position.copy(van.slotLocal(slot)); m.rotation.y = Math.PI / 2;
    van.body.add(m);
  } else if (loc.type === 'cooler') {
    const i = van.cooler.items.length;
    van.cooler.items.push(p.id);
    m.position.set(0.4 + (i % 2 ? 0.12 : -0.12), 0.56 + Math.floor(i / 2) * 0.2, -0.03 + (i % 2 ? 0.1 : -0.1));
    m.scale.setScalar(0.7);
    van.body.add(m);
  } else if (loc.type === 'hand') {
    const k = G.carrying.indexOf(p.id);
    m.position.set(0.02, -0.5 + k * 0.06 + (k ? G.carrying.slice(0, k).reduce((a, id) => a + P(id).dims[1], 0) : 0), -0.62);
    m.rotation.y = 0.1;
    ctx.camera.add(m);
  } else if (loc.type === 'world') {
    m.position.copy(loc.pos); m.rotation.y = loc.rotY || 0;
    ctx.scene.add(m);
    if (loc.hidden) m.visible = false;
  }
  if (loc.type !== 'cooler') m.scale.setScalar(1);
}
function detachFromVan(p) {
  const van = ctx.van;
  for (const s of van.slots) if (s.parcel === p.id) s.parcel = null;
  van.cooler.items = van.cooler.items.filter(id => id !== p.id);
  // 保冷ボックスの並びを詰める
  const items = van.cooler.items.slice(); van.cooler.items = [];
  for (const id of items) attachParcel(P(id), { type: 'cooler' });
}
const P = (id) => G.day.parcels.find(p => p.id === id);
function carried() { return G.carrying.map(P); }
function carryMax() { return hasUp('cart') ? 3 : 1; }
function relayoutHand() { G.carrying.forEach(id => attachParcel(P(id), { type: 'hand' })); }

// =========================================================
// 1日の開始
// =========================================================
function newDay() {
  const s = G.save;
  rand = seeded(s.seed + s.day * 7919);
  serial = 0;
  // 前日の荷物を片付ける
  if (G.day) for (const p of G.day.parcels) if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
  const parcels = s.day === 1 ? tutorialParcels() : randomParcels(parcelsForLevel(s.level));
  parcels.splice(randint(0, parcels.length), 0, misroutedParcel());
  const weathers = ['晴れ', '晴れ', 'くもり', '晴れ時々くもり'];
  G.day = {
    parcels, route: [], time: TIME.START - 30, clock: false, departed: false, ended: false,
    stats: { misdelivery: 0, damaged: 0, violations: [], issues: [], fines: 0, redeliveryDone: 0, crashes: 0 },
    calls: [], memories: [], visits: {}, weather: pick(weathers), overtimeWarned: false, lastViolation: {},
  };
  G.carrying = [];
  const van = ctx.van;
  for (const sl of van.slots) sl.parcel = null;
  van.cooler.items = []; van.cooler.capacity = hasUp('cooler') ? 4 : 2;
  const sp = T.depot.vanSpawn;
  van.setPose(sp.x, sp.z, sp.heading);
  van.hatchOpen = true; van.slideOpen = false; van.lightsOn = false; van.signal = 0; van.hazard = false;
  van.gear = 'P'; van.parkingBrake = true; van.engineOn = false; van.cruise = 0; van.rpm = 0;
  // 作業台に並べる
  const spots = [];
  // 作業台は営業所の向きに合わせて回っている
  for (const t of T.depot.tables) for (const dz of [-0.28, 0.28]) for (const dx of [-1.0, 0, 1.0]) {
    const c = Math.cos(t.rot), s = Math.sin(t.rot);
    spots.push({ x: t.x + dx * c + dz * s, z: t.z - dx * s + dz * c, y: t.y, rot: t.rot });
  }
  parcels.forEach((p, i) => {
    p.mesh = parcelMesh(p);
    const sp2 = spots[i % spots.length];
    attachParcel(p, { type: 'world', pos: new THREE.Vector3(sp2.x, sp2.y, sp2.z), rotY: (sp2.rot || 0) + (i % 3 - 1) * 0.15, where: 'table' });
  });
  const ps = T.depot.playerSpawn;
  ctx.player.x = ps.x; ctx.player.z = ps.z; ctx.player.y = 0; ctx.player.yaw = ps.yaw; ctx.player.pitch = -0.35; ctx.player.zone = null;
  G.mode = 'walk';
  for (const lot of T.lotList) { lot.visit = null; for (const d of lot.doors) d.target = 0; }
  drawWhiteboard();
}

function drawWhiteboard() {
  const d = G.day, s = G.save;
  const tex = textTexture(1024, 512, (c, w, h) => {
    c.fillStyle = '#fbfbfb'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1d3f74'; c.font = `bold 52px ${JP_FONT}`; c.fillText(`${s.day}日目　朝礼メモ`, 40, 80);
    c.fillStyle = '#222'; c.font = `34px ${JP_FONT}`;
    const lines = [
      `天気：${d.weather}　　荷物：${d.parcels.length}個`,
      '・伝票の住所を確認！　わかば町の荷物は「仕分け戻し」へ',
      '・先に配る荷物は扉の近くに。重い物は床、クールは保冷箱',
      '・国道は50km/h、生活道路は30km/h。信号と一時停止を守る',
      '・ドアを閉めてから発進すること',
      `・定時は${fmt(TIME.SHIFT_END)}。終わったら日報を書いて提出`,
    ];
    lines.forEach((l, i) => c.fillText(l, 40, 160 + i * 56));
    c.fillStyle = '#c8281e'; c.font = `bold 34px ${JP_FONT}`; c.fillText('安全第一', 820, 80);
  });
  T.depot.whiteboard.material.map = tex; T.depot.whiteboard.material.needsUpdate = true;
}

// =========================================================
// 当たり判定のための候補（見ているものに E で働きかける）
// =========================================================
function unitKey(lotId, room) { return lotId + (room ? '#' + room : ''); }
function unitResident(lotId, room) {
  return RESIDENTS.find(r => r.lot === lotId && (r.room || null) === (room || null)) || null;
}
function pendingFor(lotId, room) {
  return G.day.parcels.filter(p => p.lotId === lotId && (p.room || null) === (room || null) && ['loaded', 'redeliver', 'carry', 'hand'].includes(p.status));
}

function candidates() {
  const out = [];
  const pl = ctx.player, van = ctx.van, d = G.day;
  const near = (pos, r = 6) => !!pos && Math.hypot(pos.x - pl.x, pos.z - pl.z) < r && Math.abs(pos.y - (pl.y + 1)) < 2.5;
  const full = G.carrying.length >= carryMax();

  // 置いてある荷物
  for (const p of d.parcels) {
    if (!p.loc || p.loc.type !== 'world' || p.loc.hidden || p.status === 'delivered') continue;
    const pos = p.mesh.position.clone(); pos.y += p.dims[1] / 2;
    if (!near(pos)) continue;
    out.push({ pos, parcel: p, label: full ? null : `持つ：${p.name}様（${p.item}）`, use: () => pickUp(p) });
  }
  // 車
  const vd = Math.hypot(van.x - pl.x, van.z - pl.z);
  if (vd < 6 && pl.y < 0.5) {
    const rear = van.worldPoint(0, -1.75), side = van.worldPoint(0.76, -0.25);
    out.push({ pos: new THREE.Vector3(rear.x, 1.3, rear.z), dist: 2.2, label: van.hatchOpen ? 'リアハッチを閉める' : 'リアハッチを開ける', use: () => { van.hatchOpen = !van.hatchOpen; sfx('hatch', 0.4); }, low: true });
    out.push({ pos: new THREE.Vector3(side.x, 1.3, side.z), dist: 2.2, label: van.slideOpen ? 'スライドドアを閉める' : 'スライドドアを開ける', use: () => { van.slideOpen = !van.slideOpen; sfx('door', 0.3); }, low: true });
    const dd = van.driverDoor();
    out.push({ pos: new THREE.Vector3(dd.x, 1.3, dd.z), dist: 2.0, label: '運転席に乗る（F）', use: enterVan, low: true });
    const acc = van.access(pl.x, pl.z);
    if (acc.rear || acc.side) {
      for (const slot of van.slots) {
        const cost = van.reachCost(slot, acc, hasUp('gloves'));
        if (!isFinite(cost)) continue;
        const pos = van.slotWorld(slot); pos.y += 0.15;
        const where = slotName(slot);
        if (slot.parcel) {
          const p = P(slot.parcel);
          out.push({ pos, dist: 3.2, parcel: p, label: full ? null : `取り出す：${p.name}様（${where}${cost ? `・+${cost}分` : ''}）`, use: () => takeFromVan(p, cost) });
        } else if (G.carrying.length) {
          const p = carried()[G.carrying.length - 1];
          if (van.canHold(slot, p)) out.push({ pos, dist: 3.2, ghost: { slot, p }, label: `ここに積む（${where}${cost ? `・+${cost}分` : ''}）`, use: () => putInVan(p, { type: 'slot', slot: slot.id }, cost) });
        }
      }
      const cost = van.reachCost('cooler', acc, hasUp('gloves'));
      if (isFinite(cost)) {
        const pos = van.coolerWorld(0); pos.y += 0.1;
        if (G.carrying.length) {
          const p = carried()[G.carrying.length - 1];
          if (p.size <= 100 && van.cooler.items.length < van.cooler.capacity) out.push({ pos, dist: 3.2, label: `保冷ボックスに入れる${cost ? `（+${cost}分）` : ''}`, use: () => putInVan(p, { type: 'cooler' }, cost) });
        }
        for (const id of van.cooler.items) {
          const p = P(id);
          out.push({ pos: p.mesh.getWorldPosition(new THREE.Vector3()), dist: 3.2, parcel: p, label: full ? null : `保冷ボックスから出す：${p.name}様`, use: () => takeFromVan(p, cost) });
        }
      }
    }
  }
  // 営業所
  if (Math.hypot(pl.x - T.depot.crate.x, pl.z - T.depot.crate.z) < 4 && G.carrying.length) {
    out.push({ pos: T.depot.crate, label: '仕分け戻しのカゴに置く', use: () => { const p = carried()[G.carrying.length - 1]; dropToCrate(p); } });
  }
  if (Math.hypot(pl.x - T.depot.desk.x, pl.z - T.depot.desk.z) < 4) {
    out.push({ pos: T.depot.desk, label: d.departed ? '日報を書いて今日の業務を終える' : '今日の荷物の一覧を見る（Tab）', use: () => d.departed ? confirmEndDay() : openTablet('list') });
  }
  // 区画
  for (const lot of T.lotList) {
    if (Math.hypot(lot.cx - pl.x, lot.cz - pl.z) > 30) continue;
    addLotCandidates(lot, out, near);
  }
  return out;
}

function slotName(slot) {
  return `${slot.side === 'L' ? '左' : '右'}・${['後ろ', '中央', '前'][slot.depth]}・${slot.level === 'shelf' ? '棚' : '床'}`;
}

function addLotCandidates(lot, out, near) {
  const v = lot.visit;
  const pts = lot.points;
  const units = lot.rooms ? lot.rooms.map(r => ({ room: r.room, intercom: r.intercom, door: r.door, porch: r.porch, meter: r.meter })) : [{ room: null, intercom: pts.intercom, door: pts.door, porch: pts.porch }];
  if (lot.kind === 'mansion') {
    if (pts.intercom && near(pts.intercom)) out.push({ pos: pts.intercom, label: 'オートロックの操作盤で部屋を呼び出す', use: () => mansionPanel(lot) });
  } else if (['house', 'farmhouse', 'shop', 'conbini', 'apart'].includes(lot.kind)) {
    for (const u of units) {
      if (!u.intercom || !near(u.intercom)) continue;
      const lbl = lot.kind === 'shop' || lot.kind === 'conbini' ? `お店に声をかける（${lot.name}）` : u.room ? `${u.room}号室のインターホンを押す` : `インターホンを押す（表札：${lot.surname}）`;
      out.push({ pos: u.intercom, label: lbl, use: () => ring(lot, u.room) });
    }
  }
  if (pts.frontGate && near(pts.frontGate)) out.push({ pos: pts.frontGate, label: '門を調べる', use: () => toast('門は内側から閉まっている。インターホンも見当たらない…。入口はほかにあるのかもしれない。', 'info') });
  if (lot.kind === 'apart') {
    if (near(pts.stairs) && ctx.player.y < 0.5) out.push({ pos: pts.stairs, label: '階段で2階へ上がる', use: () => apartStairs(lot, true) });
    if (near(pts.stairsTop) && ctx.player.y > 0.5) out.push({ pos: pts.stairsTop, label: '階段で1階へ降りる', use: () => apartStairs(lot, false) });
  }
  if (!v) return;
  const unit = units.find(u => u.room === v.room) || units[0];
  const hand = carried();
  if (v.stage === 'home' && v.handPos && near(v.handPos)) {
    out.push({ pos: v.handPos, label: hand.length ? `荷物を渡す（${v.speaker.name}さん）` : `${v.speaker.name}さんが待っている（荷物を持ってこよう）`, use: () => hand.length ? handOver(lot, v) : toast('先に車から荷物を取り出してこよう。', 'info') });
  }
  if (v.stage === 'absent' && hand.length) {
    const p = hand[hand.length - 1];
    const spots = [];
    if (unit.porch) spots.push(['玄関前', unit.porch]);
    if (pts.box && (!lot.rooms)) spots.push(['宅配ボックス', pts.box]);
    if (unit.meter) spots.push(['メーターボックス', unit.meter]);
    if (pts.shed) spots.push(['物置', pts.shed]);
    for (const [name, pos] of spots) if (near(pos)) out.push({ pos, label: `${name}に置き配する`, use: () => okihai(lot, v, p, name, pos) });
  }
  if ((v.stage === 'absent' || v.stage === 'slip') && pts.mailbox && near(pts.mailbox)) {
    out.push({ pos: pts.mailbox, label: v.stage === 'slip' ? '（不在票は投函済み）' : '不在票を書いて郵便受けに入れる', use: () => v.stage === 'slip' ? null : leaveSlip(lot, v) });
  }
}

function pickFocus() {
  if (G.mode !== 'walk') { G.focus = null; return; }
  const eye = ctx.player.eye, dir = ctx.player.dir;
  let best = null, bestScore = -1;
  for (const c of candidates()) {
    const to = c.pos.clone().sub(eye);
    const dist = to.length();
    if (dist > (c.dist || 2.4)) continue;
    const cos = to.normalize().dot(dir);
    const need = dist < 1.0 ? 0.55 : 0.88;
    if (cos < need) continue;
    const score = cos - dist * 0.04;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  G.focus = best;
}

// =========================================================
// 荷物の操作
// =========================================================
function pickUp(p) {
  if (G.carrying.length >= carryMax()) { toast('これ以上は持てません。', 'bad'); return; }
  if (G.carrying.length && carried()[0].lotId !== p.lotId && !p.misrouted) { toast('台車には同じ配達先の荷物だけを載せましょう。', 'info'); return; }
  p.checked = true;
  if (p.status === 'aside') p.status = 'depot';
  G.carrying.push(p.id);
  attachParcel(p, { type: 'hand' });
  sfx('pick', 0.4);
  if (!G.day.departed) {
    const all = G.day.parcels.every(q => q.checked);
    if (all && !G.day.allCheckedToast) { G.day.allCheckedToast = true; }
  }
}
function takeFromVan(p, cost) {
  if (G.carrying.length >= carryMax()) { toast('これ以上は持てません。', 'bad'); return; }
  if (G.carrying.length && carried()[0].lotId !== p.lotId) { toast('台車には同じ配達先の荷物だけを載せましょう。', 'info'); return; }
  detachFromVan(p);
  G.carrying.push(p.id);
  attachParcel(p, { type: 'hand' });
  if (p.status === 'loaded' || p.status === 'redeliver' || p.status === 'carry') p.prevStatus = p.status;
  sfx('pick', 0.4);
  if (cost > 0) busy(cost, cost >= 1 ? '荷台に乗り込んで取り出しています…' : '身を乗り出して取り出しています…');
  if (p.damaged && !p.damageNoticed) { p.damageNoticed = true; setTimeout(() => toast('箱を持ち上げると、中でカチャッと音がした…。', 'bad'), 400); }
}
function putInVan(p, loc, cost) {
  G.carrying = G.carrying.filter(id => id !== p.id);
  attachParcel(p, loc);
  relayoutHand();
  if (p.status === 'depot' || p.status === 'aside') p.status = 'loaded';
  else if (p.prevStatus) p.status = p.prevStatus;
  sfx('put', 0.45);
  if (cost > 0) busy(cost, '荷物を奥に積んでいます…');
}
function dropToCrate(p) {
  G.carrying = G.carrying.filter(id => id !== p.id);
  const n = G.day.parcels.filter(q => q.status === 'aside').length;
  attachParcel(p, { type: 'world', pos: new THREE.Vector3(T.depot.crate.x - 0.35 + (n % 2) * 0.7, 0.55, T.depot.crate.z), where: 'crate' });
  p.status = 'aside';
  relayoutHand();
  sfx('put', 0.4);
  toast(p.misrouted ? `「${esc(p.addr)}」はエリア外。仕分けに戻しました。` : '仕分け戻しのカゴに置きました（この荷物は配達されません）。', p.misrouted ? 'good' : 'info');
}

// 作業に時間がかかる（画面を少し暗くして、時計を進める）
function busy(min, text) {
  if (G.day.clock) G.day.time += min;
  const f = $('#fade'); f.textContent = text || ''; f.classList.add('on');
  G.busyUntil = G.realT + 0.7;
  setTimeout(() => f.classList.remove('on'), 700);
}

// =========================================================
// 配達先でのやりとり
// =========================================================
function windowState(p, t) {
  const w = WINDOWS[p.window];
  if (!w || w.from == null) return 'none';
  if (t < w.from) return 'early';
  if (t > w.to) return 'late';
  return 'ok';
}

function ring(lot, room, retry = false) {
  const d = G.day;
  if (lot.visit && lot.visit.stage === 'calling') return;
  if (lot.visit) removeVisitor(lot.visit);
  sfx('bell', 0.5);
  lot.visit = { stage: 'calling', room, lotId: lot.id, retry };
  G.timers.push({ t: G.realT + 1.6, fn: () => answer(lot, room) });
  d.time += 0.5;
}

// 在宅かどうかは「30分ごとの時間帯」で決まる。押し直しても留守が在宅に変わることはない
function hash01(str) {
  let h = 2166136261 ^ (G.save.seed || 1);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function presence(lot, room, t) {
  const r = unitResident(lot.id, room);
  const shop = lot.kind === 'shop' || lot.kind === 'conbini';
  const block = Math.floor(t / 30);
  const until = G.day.homeUntil && G.day.homeUntil[unitKey(lot.id, room)];
  if (until && t < until) return { home: true, closed: false, sure: true };
  const u = hash01(`${G.save.day}|${unitKey(lot.id, room)}|${block}`);
  if (!r) return { home: shop ? true : u < 0.5, closed: false };
  // 店は営業時間外なら閉まっている
  if (r.business) {
    const open = r.home.some(([a, b]) => t / 60 >= a && t / 60 < b);
    if (!open) return { home: false, closed: true };
  }
  let prob = presenceAt(r, t);
  const mine = pendingFor(lot.id, room);
  // 時間指定の時間内は在宅していることが多く、再配達の約束の時間内は必ずいる
  if (mine.some(p => p.redeliver && windowState(p, t) === 'ok')) prob = 1;
  else if (mine.some(p => windowState(p, t) === 'ok')) prob = Math.max(prob, 0.93);
  return { home: u < prob, closed: false };
}

function answer(lot, room) {
  const d = G.day, v = lot.visit;
  if (!v) return;
  const r = unitResident(lot.id, room);
  const shop = lot.kind === 'shop' || lot.kind === 'conbini';
  const pr = presence(lot, room, d.time);
  let home = pr.home;
  // 在宅でも1回目は聞こえていないことがある（寝ている・手が離せない）
  let missed = false;
  if (home && !pr.sure && !v.retry && !shop && !(r && r.business)) {
    const missRate = r && r.sleeper && d.time < 13 * 60 ? 0.6 : 0.12;
    if (hash01(`${G.save.day}|miss|${unitKey(lot.id, room)}|${Math.floor(d.time / 30)}`) < missRate) { home = false; missed = true; }
  }
  const speaker = r ? { name: r.name, role: r.role, rid: r.id, surname: r.name.split(' ')[0] }
    : { name: shop ? `${lot.name}の店員` : (lot.rooms ? `${room}号室の住人` : `${lot.surname}さん`), role: '', rid: null, surname: shop ? '' : lot.surname };
  if (pr.closed) {
    v.speaker = speaker; v.stage = 'absent';
    sfx('tick', 0.3);
    dialog({ title: lot.name || speaker.name, text: `入口に「準備中」の札がかかっている。\n（営業時間：${r.home.map(([a, b]) => `${fmt(a * 60)}〜${fmt(b * 60)}`).join('、')}）`,
      choices: [{ label: '閉じる', use: closeDialog }] });
    return;
  }
  v.speaker = speaker;
  if (!home) {
    v.stage = 'absent';
    sfx('tick', 0.3);
    dialog({
      title: room ? `${room}号室` : (lot.kind === 'shop' ? lot.name : `${lot.surname}さん宅`),
      text: lot.kind === 'mansion' ? 'インターホンに応答がない。' : (missed ? '反応がない。中で人の気配はするが…聞こえていないのかもしれない。' : v.retry ? 'やはり応答がない。留守のようだ。' : '応答がない。留守のようだ。'),
      choices: [
        { label: 'もう一度押して少し待つ（2分）', use: () => { d.time += 1.5; closeDialog(); ring(lot, room, true); }, disabled: v.retry },
        { label: r && r.phone ? '伝票の番号に電話する（2分）' : '伝票に電話番号がない', disabled: !r || !r.phone || v.phoned, use: () => phoneCall(lot, v, r) },
        { label: '置き配か不在票で対応する（閉じる）', use: () => { closeDialog(); toast('置き配するなら指定の場所に荷物を置く。できないなら郵便受けに不在票を。', 'info', 6000); } },
      ],
    });
    return;
  }
  // 在宅
  const visits = r ? (G.save.visits[r.id] || 0) : 0;
  let line;
  if (r) {
    line = r.lines[visits === 0 ? 0 : visits < 3 ? 1 : 2];
    if (r.meeting && pendingFor(lot.id, room).some(p => p.okihai) && hash01(`${G.save.day}|meet|${Math.floor(d.time / 60)}`) < 0.5) {
      v.meeting = true; line = r.lines[0];
    } else if (r.meeting) line = r.lines[visits < 3 ? 1 : 2];
  } else if (shop) line = 'はい、いらっしゃいませ…あ、配達ですか？';
  else line = pick(['はい？', 'はーい、どちら様ですか？', 'はい、なんでしょう？']);
  v.line = line;
  markHome(lot, room, 30);
  sfx('ok2', 0.4);
  if (v.meeting) {
    v.stage = 'absent'; v.authorized = true;
    dialog({ title: speaker.name, text: line, choices: [{ label: 'わかりました（宅配ボックスに入れる）', use: closeDialog }] });
    return;
  }
  v.stage = 'home';
  setTimeout(() => { if (lot.visit === v && v.stage === 'home') spawnVisitor(lot, v); }, lot.kind === 'mansion' ? 600 : 1200);
  if (lot.kind === 'mansion') {
    v.handPos = lot.points.intercom;
    d.time += 2;
    dialog({ title: speaker.name, text: `${line}\n（エントランスまで降りてきてくれた）`, choices: [{ label: '操作盤の前で渡す', use: closeDialog }] });
  } else {
    const unit = lot.rooms ? lot.rooms.find(x => x.room === room) : null;
    v.handPos = unit ? unit.door : lot.points.door;
    if (!lot.rooms && lot.doors[0]) lot.doors[0].target = 1;
    dialog({ title: speaker.name, role: speaker.role, text: line, choices: [{ label: lot.kind === 'shop' || lot.kind === 'conbini' ? '店の入口で渡す' : '玄関へ向かう', use: closeDialog }] });
  }
  v.expires = G.realT + 240;
}

function phoneCall(lot, v, r) {
  const d = G.day;
  v.phoned = true;
  d.time += 2;
  sfx('q', 0.4);
  const roll = rand();
  const mine = pendingFor(lot.id, v.room);
  if (roll < 0.25) {
    d.time += 5;
    v.stage = 'home';
    v.line = 'お待たせしてすみません！ 近くまで戻ってきていました。';
    v.handPos = lot.rooms ? lot.rooms.find(x => x.room === v.room).door : (lot.kind === 'mansion' ? lot.points.intercom : lot.points.door);
    if (!lot.rooms && lot.doors[0]) lot.doors[0].target = 1;
    v.expires = G.realT + 240;
    v.speaker = v.speaker || { name: r.name, role: r.role, rid: r.id, surname: r.name.split(' ')[0] };
    markHome(lot, v.room, 90);
    spawnVisitor(lot, v);
    dialog({ title: '電話', text: '「あと5分で戻ります！」\n（5分待って、受取人が戻ってきた）', choices: [{ label: lot.kind === 'mansion' ? 'エントランスで渡す' : '玄関で渡す', use: closeDialog }] });
  } else if (roll < 0.45 && r.okihai && mine.some(p => !p.flags.includes('cool') && !p.senderNoOkihai)) {
    for (const p of mine) if (!p.flags.includes('cool') && !p.senderNoOkihai) { p.okihai = r.okihai; p.phoneOk = true; }
    dialog({ title: '電話', text: `「すみません、${r.okihai}に置いておいてください」`, choices: [{ label: 'わかりました', use: closeDialog }] });
  } else {
    dialog({ title: '電話', text: '留守番電話につながった。', choices: [{ label: '電話を切る', use: closeDialog }] });
  }
}

function mansionPanel(lot) {
  const rooms = [];
  for (let f = 5; f >= 1; f--) for (let r = 1; r <= 4; r++) rooms.push(`${f}0${r}`);
  dialog({
    title: 'グランあおば　オートロック',
    text: '呼び出す部屋番号を押してください。',
    grid: rooms.map(rm => ({ label: rm, use: () => { closeDialog(); ring(lot, rm); } })),
    choices: [{ label: 'やめる', use: closeDialog }],
  });
}

function apartStairs(lot, up) {
  const pl = ctx.player;
  const f = $('#fade'); f.textContent = up ? '階段を上がっています…' : '階段を降りています…'; f.classList.add('on');
  setTimeout(() => {
    if (up) {
      const p = lot.points.stairsTop; pl.x = p.x; pl.z = p.z; pl.y = 3.0;
      pl.zone = lot.corridorZone;
    } else {
      const p = lot.points.stairs; pl.x = p.x; pl.z = p.z; pl.y = 0; pl.zone = null;
    }
    if (G.day.clock) G.day.time += 0.5;
    f.classList.remove('on');
  }, 500);
  sfx('step0', 0.4);
}

function handOver(lot, v) {
  const d = G.day;
  const hand = carried();
  const sp = v.speaker;
  const sameName = (p) => p.name.split(' ')[0] === sp.surname;
  dialog({
    title: sp.name, role: sp.role, text: `「${v.line}」`,
    choices: [
      { label: `荷物を渡してサインをもらう（${hand.length}個）`, use: () => { closeDialog(); doHandOver(lot, v, hand); } },
      { label: `「${hand[0].name}様ですね？」と確認する`, use: () => {
        d.time += 0.3;
        if (sp.rid && hand.every(p => p.rid === sp.rid)) { dialog({ title: sp.name, text: '「はい、そうです」', choices: [{ label: '荷物を渡してサインをもらう', use: () => { closeDialog(); doHandOver(lot, v, hand); } }] }); return; }
        const wrong = hand.find(p => !p.rid || p.rid !== sp.rid);
        dialog({ title: sp.name, text: sameName(wrong) ? `「いえ、うちは${sp.name}です。${wrong.name}さんならお隣ですよ」` : `「${wrong.name}さん？ うちじゃないですね」`,
          choices: [{ label: '失礼しました（家をまちがえていた）', use: () => { closeDialog(); endVisit(lot); } }] });
      } },
      { label: 'やめる', use: closeDialog },
    ],
  });
}

function doHandOver(lot, v, hand) {
  const d = G.day, sp = v.speaker;
  for (const p of hand) {
    if (p.rid && p.rid === sp.rid) { deliver(p, 'hand', lot); continue; }
    if (!p.misrouted && p.name.split(' ')[0] === sp.surname && sp.surname) { p.misdelivered = true; d.stats.misdelivery++; deliver(p, 'hand', lot, true); continue; }
    toast(`「${esc(p.name)}さん宛てですか？ うちじゃないですよ」`, 'bad');
  }
  if (sp.rid && hand.some(p => p.rid === sp.rid)) {
    d.memories.push({ rid: sp.rid, line: v.line });
    G.save.visits[sp.rid] = (G.save.visits[sp.rid] || 0) + 1;
  }
  relayoutHand();
  d.time += 1;
  sfx('ok', 0.5);
  markHome(lot, v.room, 60);
  const rest = pendingFor(lot.id, v.room).filter(p => p.rid && p.rid === sp.rid && !G.carrying.includes(p.id));
  if (rest.length) {
    // 同じ宛先の荷物がまだ車にある：玄関で待っていてもらう
    v.line = 'あら、まだあるの？ ここで待ってますね。';
    v.expires = G.realT + 240;
    toast(`${esc(sp.name)}さん宛ての荷物がまだ${rest.length}個あります。車から持ってきましょう。`, 'info', 5000);
    return;
  }
  if (v.person) v.person.play('wave');
  v.stage = 'done';
  setTimeout(() => { if (lot.visit === v) endVisit(lot); }, 3200);
}

function deliver(p, method, lot, silent) {
  const d = G.day;
  G.carrying = G.carrying.filter(id => id !== p.id);
  p.status = 'delivered'; p.method = method; p.deliveredAt = d.time;
  p.windowResult = windowState(p, d.time);
  if (p.redeliver) d.stats.redeliveryDone++;
  if (p.damaged) d.stats.damaged++;
  if (p.warm) d.stats.violations.push({ text: `クール便「${p.item}」を保冷せずに運んだ`, pts: 20 });
  if (method === 'hand') { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); }
  const w = WINDOWS[p.window];
  let msg = `${esc(p.name)}様：${method === 'hand' ? '手渡し' : '置き配'}で配達完了`;
  if (w.from != null) msg += p.windowResult === 'ok' ? '（時間指定OK）' : p.windowResult === 'early' ? '（指定時間より早い）' : '（指定時間に遅れた）';
  if (!silent) toast(msg, p.windowResult === 'late' || p.windowResult === 'early' ? 'info' : 'good');
}

function okihai(lot, v, p, place, pos) {
  const d = G.day;
  const notes = [];
  if (!v.authorized) {
    if (p.flags.includes('cool')) { d.stats.violations.push({ text: `クール便「${p.item}」を置き配した`, pts: 20 }); notes.push('クール便は置き配できません'); }
    else if (!p.okihai) { d.stats.violations.push({ text: `置き配不可の荷物（${p.name}様）を置き配した`, pts: 20 }); notes.push('この荷物は置き配不可でした'); }
    else if (place !== p.okihai) { d.stats.issues.push({ text: `${p.name}様の荷物を指定と違う場所（${place}）に置いた`, pts: 5 }); notes.push(`指定は「${p.okihai}」でした`); }
  }
  if (p.lotId !== lot.id || (p.room || null) !== (v.room || null)) { p.misdelivered = true; d.stats.misdelivery++; }
  const hidden = place !== '玄関前';
  G.carrying = G.carrying.filter(id => id !== p.id);
  attachParcel(p, { type: 'world', pos: new THREE.Vector3(pos.x, pos.y > 2 ? 3.02 : 0.03, pos.z), rotY: rand(), hidden, where: 'okihai' });
  relayoutHand();
  deliver(p, 'okihai', lot, true);
  G.save.visits[p.rid] = (G.save.visits[p.rid] || 0) + 0.5;
  d.time += 1;
  sfx(notes.length ? 'err' : 'ok', 0.5);
  toast(`${place}に置き配し、写真を撮って記録しました。${notes.length ? '<br>' + notes.join('<br>') : ''}`, notes.length ? 'bad' : 'good', 5000);
}

function leaveSlip(lot, v) {
  const d = G.day;
  const mine = pendingFor(lot.id, v.room).filter(p => p.status !== 'delivered');
  if (!mine.length) { toast('この家宛ての荷物は残っていません。', 'info'); return; }
  v.stage = 'slip';
  d.time += 1.5;
  sfx('put', 0.3);
  const r = unitResident(lot.id, v.room);
  for (const p of mine) {
    p.status = 'carry'; p.prevStatus = 'carry'; p.attempts = (p.attempts || 0) + 1;
    if (r && r.phone && chance(0.6)) {
      const at = d.time + randint(30, 100);
      const opts = ['w1416', 'w1618', 'w1820'].filter(k => WINDOWS[k].from >= at + 20 && presenceAt(r, WINDOWS[k].from + 30) >= 0.5);
      if (opts.length && at < TIME.SHIFT_END) d.calls.push({ pid: p.id, at, window: opts[0] });
    }
  }
  toast('不在票を郵便受けに入れました。荷物は車に戻しておこう。', 'info', 5000);
}

function markHome(lot, room, min) {
  const d = G.day;
  d.homeUntil = d.homeUntil || {};
  d.homeUntil[unitKey(lot.id, room)] = Math.max(d.homeUntil[unitKey(lot.id, room)] || 0, d.time + min);
}
function endVisit(lot) {
  if (lot.visit) removeVisitor(lot.visit);
  lot.visit = null;
  for (const dd of lot.doors) dd.target = 0;
}

// =========================================================
// 運転
// =========================================================
function enterVan() {
  if (G.carrying.length) { toast('荷物を持ったままでは乗れません。荷台に積むか、置いてから乗りましょう。', 'info'); return; }
  const van = ctx.van;
  G.mode = 'drive';
  G.look = { yaw: 0, pitch: -0.15 };
  G.mouseSteer = 0;
  sfx('door', 0.35);
  startEngine();
  van.engineOn = true; if (van.gear === 'P') van.gear = 'N';
  if (!G.day.departed && !G.day.driveHint) {
    G.day.driveHint = true;
    toast('<kbd>Space</kbd> でサイドブレーキを解除して、<kbd>W</kbd> で発進します。', 'info', 7000);
  }
}
function exitVan() {
  const van = ctx.van;
  if (Math.abs(van.speed) > 0.5) { toast('止まってから降りましょう。', 'info'); return; }
  van.speed = 0; van.gear = 'P'; van.parkingBrake = true; van.engineOn = false; van.cruise = 0;
  const pl = ctx.player;
  let p = van.driverDoor();
  pl.x = p.x; pl.z = p.z; pl.y = 0; pl.zone = null;
  pl.yaw = van.heading + Math.PI; pl.pitch = -0.1;
  // 壁にめり込むなら反対側から降りる
  const q = { x: pl.x, z: pl.z };
  if (resolveCircle(q, 0.3) > 0.2) { p = van.passengerSide(); pl.x = p.x; pl.z = p.z; }
  G.mode = 'walk';
  updateEngine(false, 0, 0, 0);
  sfx('door', 0.35);
}

function driveInput() {
  const k = G.keys;
  return {
    // Shift を押しながらだと半分だけ踏む
    throttle: (k.KeyW || k.ArrowUp) ? (k.ShiftLeft || k.ShiftRight ? 0.45 : 1) : (k._thr || 0),
    brake: (k.KeyS || k.ArrowDown) ? 1 : (k._brk || 0),
    steer: ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0) || (k._steer || 0),
    mouseSteer: G.save.settings.mouseSteer ? G.mouseSteer : null,
  };
}

const prevFront = { x: 0, z: 0 };
function checkDriving(dt) {
  const d = G.day, van = ctx.van;
  if (!d.departed) return;
  const f = van.forward;
  const front = { x: van.x + f.x * 1.7, z: van.z + f.z * 1.7 };
  const kmh = van.kmh;
  // 速度超過
  const lim = speedLimitAt(van.x, van.z);
  if (kmh > lim + 10) {
    d.speeding = (d.speeding || 0) + dt;
    if (d.speeding > 2 && G.realT - (d.lastViolation.speed || -99) > 20) {
      d.lastViolation.speed = G.realT;
      violation(`速度超過（${Math.round(kmh)}km/h／制限${lim}km/h）`, 3000, 5);
    }
  } else d.speeding = 0;
  // 信号無視：赤信号のときに停止線を越えた
  for (const s of T.signals) for (const ap of s.approaches) {
    if (s.state[ap.group] !== 'r') continue;
    const dx = front.x - ap.stop.x, dz = front.z - ap.stop.z, px = prevFront.x - ap.stop.x, pz = prevFront.z - ap.stop.z;
    const now = dx * ap.d[0] + dz * ap.d[1], before = px * ap.d[0] + pz * ap.d[1];
    const lat = dx * ap.d[1] - dz * ap.d[0]; // 左が正
    if (before < 0 && now >= 0 && lat > (ap.e.ow ? -ap.half - 0.5 : -0.5) && lat < ap.half + 0.5) violation('信号無視', 5000, 10);
  }
  prevFront.x = front.x; prevFront.z = front.z;
  // 衝突
  if (van.lastImpact > 1.6 && G.realT - (d.lastViolation.crash || -99) > 3) {
    d.lastViolation.crash = G.realT;
    d.stats.crashes++;
    sfx('crash', Math.min(0.8, van.lastImpact / 8));
    violation(`接触事故（${Math.round(van.lastImpact * 3.6)}km/h）`, 2000 + Math.round(van.lastImpact * 600), 10);
    if (van.lastImpact > 4) shakeCargo('ぶつかった衝撃で');
  }
  // 急ブレーキで棚の荷物が落ちる
  if (van.accel < -6.5 && van.speed > 7) shakeCargo('急ブレーキで', true);
  // ドアを開けたまま走る
  if ((van.hatchT > 0.5 || van.slideT > 0.5) && kmh > 12) {
    d.openDrive = (d.openDrive || 0) + dt;
    if (d.openDrive > 1 && !d.openWarned) { d.openWarned = true; toast('ドアが開いたままです！', 'bad'); sfx('err', 0.5); }
    if (d.openDrive > 4 && van.hatchT > 0.5) {
      const slot = van.slots.find(s => s.parcel && s.depth === 0);
      if (slot) {
        const p = P(slot.parcel); detachFromVan(p);
        const rp = van.worldPoint(0, -2.4);
        p.damaged = true; p.status = p.status === 'loaded' ? 'loaded' : p.status;
        attachParcel(p, { type: 'world', pos: new THREE.Vector3(rp.x, 0.02, rp.z), rotY: rand() * 3, where: 'road' });
        violation(`荷物を道路に落とした（${p.name}様）`, 0, 10);
        sfx('crash', 0.5);
      }
      d.openDrive = 2;
    }
  } else { d.openDrive = 0; d.openWarned = false; }
}

function shakeCargo(why, brakeOnly) {
  const van = ctx.van, d = G.day;
  if (d.lastShake && G.realT - d.lastShake < 2) return;
  d.lastShake = G.realT;
  for (const s of van.slots) {
    if (!s.parcel) continue;
    const p = P(s.parcel);
    const fragile = p.flags.includes('fragile') || p.flags.includes('upright');
    if (s.level === 'shelf' && (p.weight >= 3 || fragile)) {
      if (!p.damaged) { p.damaged = true; toast(`${why}棚の「${esc(p.item)}」が落ちた…！`, 'bad'); sfx('glass', 0.5); }
    } else if (!brakeOnly && fragile && !p.damaged && chance(0.5)) { p.damaged = true; toast(`${why}「${esc(p.item)}」が割れたかもしれない…`, 'bad'); }
  }
}

function violation(text, fine, pts) {
  const d = G.day;
  d.stats.violations.push({ text, fine, pts });
  d.stats.fines += fine;
  sfx('err', 0.5);
  toast(`違反：${text}${fine ? `　反則金 ${yen(fine)}` : ''}`, 'bad', 4500);
}

function checkDeparture() {
  const d = G.day, van = ctx.van;
  if (!d.departed && !T.depot.contains(van.x, van.z) && Math.abs(van.speed) > 0.1) {
    d.departed = true;
    d.clock = true;
    d.time = Math.max(d.time, TIME.START);
    // 積み込みの判定
    for (const p of d.parcels) {
      if (p.status === 'depot' || p.status === 'aside') {
        if (p.loc && p.loc.type === 'hand') continue;
        p.status = p.misrouted ? 'aside' : (p.status === 'aside' ? 'asideWrong' : 'left');
      }
    }
    for (const s of van.slots) {
      if (!s.parcel) continue;
      const p = P(s.parcel);
      if (p.flags.includes('cool')) p.warm = true;
      if (s.level === 'shelf' && p.weight >= 3) d.stats.issues.push({ text: `重量物「${p.item}」を棚の上に積んだ`, pts: 5 });
    }
    const left = d.parcels.filter(p => p.status === 'left').length;
    toast(`営業所を出発しました（${fmt(d.time)}）。${left ? `<br>積み忘れの荷物が${left}個あります。` : ''}`, left ? 'info' : 'good', 5000);
    sfx('ok2', 0.4);
  }
}

// =========================================================
// 時間
// =========================================================
function updateTime(dt) {
  const d = G.day;
  if (!d.clock || G.overlay) return;
  let scale = TIME.SCALE;
  G.waiting = !!(G.keys.KeyT && G.mode === 'drive' && Math.abs(ctx.van.speed) < 0.3);
  if (G.waiting) scale *= 20;
  d.time += dt * scale / 60;
  for (const c of d.calls) {
    if (c.fired || d.time < c.at) continue;
    c.fired = true;
    const p = P(c.pid);
    if (!p || p.status !== 'carry') continue;
    p.status = 'redeliver'; p.prevStatus = 'redeliver'; p.window = c.window; p.redeliver = true;
    if (!d.route.includes(p.lotId)) d.route.push(p.lotId);
    sfx('q', 0.5);
    toast(`📞 ${esc(p.name)}様から再配達の依頼：${WINDOWS[c.window].label}`, 'call', 7000);
  }
  if (!d.overtimeWarned && d.time >= TIME.SHIFT_END) { d.overtimeWarned = true; toast('定時の19:00を過ぎました。ここからは残業です。', 'info', 5000); }
  if (d.time >= TIME.HARD_END && !d.hardWarned) { d.hardWarned = true; toast('21:00です。営業所に戻って日報を書きましょう。', 'bad', 8000); }
  if (d.time >= TIME.HARD_END + 45) { toast('業務時間を大きく過ぎたため、今日の業務を終了します。', 'bad'); finishDay(); }
}

// =========================================================
// 表示まわりで使う関数
// =========================================================
export function requestLock() {
  if (G.overlay || G.mode === 'title' || G.mode === 'ui') return;
  const c = ctx.renderer.domElement;
  try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 失敗しても続行 */ }
}
function nextStop() {
  const d = G.day;
  const pend = new Set(d.parcels.filter(p => p.lotId && ['loaded', 'redeliver'].includes(p.status) || (p.lotId && p.loc && p.loc.type === 'hand' && p.status !== 'delivered')).map(p => p.lotId));
  for (const id of d.route) if (pend.has(id)) return id;
  return [...pend][0] || null;
}
function stopLots() {
  const ids = [];
  for (const p of G.day.parcels) if (p.lotId && !['left', 'aside', 'asideWrong'].includes(p.status) && !ids.includes(p.lotId)) ids.push(p.lotId);
  return ids;
}
function cargoIssues() {
  const van = ctx.van, out = [];
  for (const s of van.slots) {
    if (!s.parcel) continue;
    const p = P(s.parcel);
    if (s.level === 'shelf' && p.weight >= 3) out.push(`重量物「${p.item}」が棚の上にあります（急ブレーキで落ちます）`);
    if (s.level === 'shelf' && (p.flags.includes('fragile') || p.flags.includes('upright'))) out.push(`ワレモノ「${p.item}」が棚の上にあります（急ブレーキで落ちます）`);
    if (p.flags.includes('cool')) out.push(`クール便「${p.item}」が保冷ボックスに入っていません`);
  }
  return out;
}

// ナビの経路（少し間隔をあけて計算する）
const UI = {};
let navTimer = 0;
function updateNav(dt) {
  navTimer -= dt;
  if (navTimer > 0) return;
  navTimer = 0.35;
  const d = G.day;
  const from = G.mode === 'drive' ? { x: ctx.van.x, z: ctx.van.z } : { x: ctx.player.x, z: ctx.player.z };
  const next = nextStop();
  let to = null;
  if (next) { const lot = T.lots[next]; to = lot.points.front || { x: lot.cx, z: lot.cz }; }
  else if (d.departed && !d.ended) to = T.depot.front;
  UI.navPath = to ? routePath(from, to) : null;
  UI.navDist = UI.navPath && isFinite(UI.navPath.length) ? UI.navPath.length : null;
  drawNav($('#minimap'));
  if (G.mode === 'drive' && G.view === 'cab') { drawNav(ctx.van.navCanvas, { scale: 1.05 }); ctx.van.navTex.needsUpdate = true; }
  updateNavFoot();
}

function waitMinutes(m) {
  if (!G.day.clock) return;
  G.day.time += m;
  sfx('tick', 0.4);
  updateTime(0);
}

// =========================================================
// 1日の終わり
// =========================================================
function confirmEndDay() {
  const left = G.day.parcels.filter(p => ['loaded', 'redeliver', 'carry', 'hand'].includes(p.status));
  dialog({
    title: '日報', text: left.length ? `まだ届けていない荷物が${left.length}個あります。持ち戻りとして日報を書きますか？` : '今日の業務を終えて、日報を書きますか？',
    choices: [{ label: '日報を書く', use: () => { closeDialog(); finishDay(); } }, { label: 'まだ仕事を続ける', use: closeDialog }],
  });
}

function finishDay() {
  const d = G.day, s = G.save;
  if (d.ended) return;
  d.ended = true; d.clock = false;
  sfx('result', 0.4);
  const real = d.parcels.filter(p => !p.misrouted);
  const delivered = real.filter(p => p.status === 'delivered');
  const windowed = real.filter(p => p.window !== 'none');
  const winOk = delivered.filter(p => p.windowResult === 'ok');
  const notDelivered = real.filter(p => p.status !== 'delivered' && p.status !== 'asideWrong');
  const caught = d.parcels.filter(p => p.misrouted && p.status === 'aside').length;
  const missed = d.parcels.filter(p => p.misrouted && p.status !== 'aside').length;
  const wrongAside = real.filter(p => p.status === 'asideWrong').length;
  const overtime = Math.max(0, d.time - TIME.SHIFT_END);
  const rows = [];
  const add = (label, n, per, kind) => { if (n) rows.push({ label, pts: n * per, kind }); };
  add(`配達完了 ${delivered.length}個`, delivered.length, 10, 'plus');
  add(`時間指定どおり ${winOk.length}個`, winOk.length, 6, 'plus');
  add('エリア外の荷物を発見', caught, 10, 'plus');
  add('時間指定に合わなかった', delivered.filter(p => p.window !== 'none' && p.windowResult !== 'ok').length, -10, 'minus');
  add('持ち戻り・未配達', notDelivered.length, -6, 'minus');
  add('誤配', d.stats.misdelivery, -30, 'minus');
  add('荷物の破損', d.stats.damaged, -20, 'minus');
  for (const v of d.stats.violations) rows.push({ label: v.text, pts: -v.pts, kind: 'minus' });
  for (const v of d.stats.issues) rows.push({ label: v.text, pts: -v.pts, kind: 'minus' });
  add('エリア外の荷物を積んだまま', missed, -8, 'minus');
  add('担当の荷物を仕分けに戻した', wrongAside, -15, 'minus');
  if (overtime > 0) rows.push({ label: `残業 ${Math.round(overtime)}分`, pts: -Math.floor(overtime / 10), kind: 'minus' });
  const score = rows.reduce((a, r) => a + r.pts, 0);
  const max = real.length * 16 + 10;
  const ratio = score / max;
  const rank = ratio >= 0.85 ? 'S' : ratio >= 0.7 ? 'A' : ratio >= 0.5 ? 'B' : ratio >= 0.3 ? 'C' : 'D';
  const bonus = { S: 3000, A: 2000, B: 1000, C: 0, D: 0 }[rank];
  const wage = 6000 + delivered.length * 250 + winOk.length * 150 + bonus + Math.round(overtime * 20);
  const net = wage - d.stats.fines;
  const exp = Math.max(0, delivered.length * 10 + winOk.length * 5 + caught * 10 + { S: 50, A: 30, B: 15, C: 5, D: 0 }[rank]);
  const prevLv = s.level;
  s.money += net; s.exp += exp;
  while (s.level < LEVELS.length && s.exp >= LEVELS[s.level]) s.level++;
  s.history.push({ day: s.day, rank, score, delivered: delivered.length, total: real.length, wage: net });
  writeSave();
  d.result = { rows, score, max, rank, wage, net, exp, levelUp: s.level > prevLv, delivered, real, winOk, windowed, notDelivered, overtime, bonus };
  clearPeople();
  showReport();
  if (d.result.levelUp) setTimeout(() => sfx('levelup', 0.4), 800);
}

// =========================================================
// タイトル・1日の開始
// =========================================================
export function toTitle() {
  G.mode = 'title';
  clearPeople();
  updateEngine(false, 0, 0, 0);
  showMenu('title');
}
function startGame(fresh) {
  const settings = G.save.settings;
  G.save = fresh ? defaultSave() : (loadSave() || defaultSave());
  G.save.settings = settings;
  writeSave();
  applySettings();
  startDay();
}
function nextDay() { G.save.day++; writeSave(); startDay(); }
function buy(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || G.save.money < u.price || hasUp(id)) return false;
  G.save.money -= u.price; G.save.upgrades[id] = true; writeSave(); sfx('ok');
  return true;
}

function startDay() {
  G.overlay = null;
  newDay();
  spawnDayPeople();
  sfx('morning', 0.35);
  const d = G.day, s = G.save;
  if (boss) boss.play('talk');
  dialog({
    title: '所長　大野', role: '朝礼',
    text: (s.day === 1 ? '今日からよろしく頼むよ。この町は道が狭いから、焦らずにな。\n' : 'おはよう。今日も安全運転でいこう。\n') +
      `今日の荷物は${d.parcels.length}個、天気は${d.weather}だ。\n` +
      (s.day === 1 ? '作業台の荷物の伝票をよく見て、車に積んでくれ。わかば町宛ての荷物が紛れていたら、そこの「仕分け戻し」のカゴへ。積み終わったら、業務端末（Tab）で回る順番を決めて出発だ。' : 'ホワイトボードの注意事項も見ておいてくれ。'),
    choices: [{ label: '行ってきます', use: () => { if (boss) boss.play('idle'); closeDialog(); } }],
  });
}

// =========================================================
// 人（住民・所長・通行人・犬）
// =========================================================
const AVATAR_OF = {
  tanaka: ['Business_Female_03'], sato_k: ['Business_Male_02'], sato_m: ['Female_Adult_03'], komorebi: ['Male_Adult_09'],
  yamamoto: ['Male_Adult_10'], okada: ['Medical_Female_01'], suzuki: ['Female_Adult_05'], ito: ['Male_Adult_03', 0x8c9aa8],
  takahashi: ['Female_Adult_11'], ishii: ['Business_Male_02', 0x9aa0a8], yoshida: ['Male_Adult_03'], hanamaru: ['Female_Adult_03', 0xa8c79a],
  watanabe: ['Male_Adult_09', 0x9aa8b8], kato: ['Male_Adult_10', 0xb0a090], kobayashi: ['Gardener_Male_01'], matsumoto: ['Chef_Female_01'],
  nakamura: ['Business_Female_03', 0xc0b0b8], ogawa: ['Male_Adult_10', 0x8fa8c8],
};
const GENERIC = ['Female_Adult_05', 'Male_Adult_09', 'Business_Female_03', 'Male_Adult_03', 'Female_Adult_11', 'Business_Male_02'];
let boss = null;
const walkers = [];
let dog = null;

function spawnVisitor(lot, v) {
  if (!hasPeople() || !v.handPos) return;
  const pick2 = v.speaker.rid ? AVATAR_OF[v.speaker.rid] : [GENERIC[Math.floor(Math.random() * GENERIC.length)]];
  const per = new Person(ctx.scene, pick2[0], { tint: pick2[1] });
  let x, z, face;
  const unit = lot.rooms ? lot.rooms.find(r => r.room === v.room) : null;
  if (lot.doorN && !unit && lot.kind !== 'mansion') {
    // 玄関の前（扉から 0.55m）に、外を向いて立つ
    // 開いた扉（蝶番の側）にかからないよう、少し取っ手の側に寄る
    const n = lot.doorN, dd = lot.doorD || [0, 0];
    x = v.handPos.x - n[0] * 0.6 + dd[0] * 0.22; z = v.handPos.z - n[1] * 0.6 + dd[1] * 0.22; face = Math.atan2(n[0], n[1]);
  } else {
    const c = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    const off = lot.kind === 'mansion' ? { x: 1.1, z: 1.4 } : { x: 0, z: 0.55 };
    x = v.handPos.x + off.x * c + off.z * sn; z = v.handPos.z - off.x * sn + off.z * c; face = lot.rot + Math.PI;
  }
  const y = v.handPos.y > 2 ? 3.0 : (lot.kind === 'house' || lot.kind === 'farmhouse' ? 0.4 : 0.02);
  per.place(x, y, z, face);
  v.person = per;
}
function removeVisitor(v) { if (v && v.person) { v.person.dispose(); v.person = null; } }

function spawnDayPeople() {
  clearPeople();
  if (!hasPeople()) return;
  boss = new Person(ctx.scene, 'Business_Male_07');
  boss.place(T.depot.boss.x, 0.03, T.depot.boss.z, T.depot.boss.rotY);
  // 生活道路を歩く人（道の左端を歩き、交差点で行き先を選ぶ）
  const names = ['Female_Adult_05', 'Male_Adult_09', 'Female_Adult_11', 'Male_Adult_03', 'Business_Female_03', 'Female_Adult_03', 'Gardener_Male_01'];
  const c = T.depot.center;
  const streets = edgesNear(c.x, c.z, 200).filter(e => e.rank >= 1 && e.rank <= 2 && e.len > 25);
  names.forEach((nm, i) => {
    const per = new Person(ctx.scene, nm, { tint: [0x9fb0c0, null, 0xc9b8a0, 0xa0b090, null, 0xb0a0a8, null][i] });
    const e = streets[(i * 37 + 11) % streets.length];
    const w = { per, e, s: e.len * (0.2 + (i % 5) * 0.15), dir: i % 2 ? 1 : -1, speed: 1.1 + (i % 3) * 0.12, wait: 0, x: 0, z: 0 };
    per.play('walk', 0);
    walkers.push(w);
  });
  const ito = T.lots['3-B1-2'];
  if (ito) {
    dog = spawnDog(ctx.scene);
    if (dog) {
      const p = new THREE.Vector3(-2.2, 0, 1.6).applyMatrix4(ito.base);
      dog.position.set(p.x, 0, p.z);
      dog.rotation.y = ito.rot + Math.PI + 0.5;
    }
  }
}
function clearPeople() {
  if (boss) { boss.dispose(); boss = null; }
  for (const w of walkers) w.per.dispose();
  walkers.length = 0;
  if (dog) { dog.removeFromParent(); dog = null; }
  for (const lot of T.lotList) if (lot.visit) removeVisitor(lot.visit);
}

function updatePeople(dt, moving) {
  if (boss) boss.update(dt);
  const van = ctx.van;
  const me = G.mode === 'drive' ? van : ctx.player;
  for (const w of walkers) {
    if (!moving) { w.per.update(dt); continue; }
    // 遠く離れた人は、近くの道に移す
    if (Math.hypot(w.x - me.x, w.z - me.z) > 260) {
      const list = edgesNear(me.x, me.z, 200).filter(e => e.rank >= 1 && e.rank <= 2 && e.len > 25);
      const e = list[Math.floor(Math.random() * list.length)];
      if (e) { const p = edgeAt(e, e.len / 2).p; if (Math.hypot(p[0] - me.x, p[1] - me.z) > 70) { w.e = e; w.s = e.len / 2; w.x = p[0]; w.z = p[1]; } }
    }
    const at = edgeAt(w.e, w.s);
    const d = w.dir > 0 ? at.d : [-at.d[0], -at.d[1]];
    const left = [d[1], -d[0]];
    w.x = at.p[0] + left[0] * (w.e.w / 2 - 0.35); w.z = at.p[1] + left[1] * (w.e.w / 2 - 0.35);
    // 車が近づいてきたら立ち止まる
    const vx = van.x - w.x, vz = van.z - w.z, vd = Math.hypot(vx, vz);
    const ahead = (vx * d[0] + vz * d[1]) > 0;
    const danger = vd < 7 && Math.abs(van.speed) > 0.5 && ahead;
    if (w.wait > 0) w.wait -= dt;
    if (danger || w.wait > 0) { if (w.per.kind !== 'idle') w.per.play('idle'); }
    else {
      if (w.per.kind !== 'walk') w.per.play('walk');
      w.s += w.dir * w.speed * dt;
      if (w.s > w.e.len || w.s < 0) {
        const node = T.nodes[w.s > w.e.len ? w.e.b : w.e.a];
        const opts = node.ends.filter(x => x.e !== w.e && x.e.rank <= 2);
        if (opts.length) { const o = opts[Math.floor(Math.random() * opts.length)]; w.e = o.e; w.dir = o.end === 'a' ? 1 : -1; w.s = o.end === 'a' ? 0 : o.e.len; }
        else { w.dir = -w.dir; w.s = Math.max(0, Math.min(w.e.len, w.s)); }
      }
    }
    // 車との接触
    if (vd < 1.6 && Math.abs(van.speed) > 1.5 && G.mode === 'drive' && G.realT - (w.hitT || -99) > 4) {
      w.hitT = G.realT; w.wait = 4;
      violation('歩行者との接触事故', 10000, 30);
      sfx('crash', 0.6);
    }
    w.per.place(w.x, 0.02, w.z, Math.atan2(d[0], d[1]));
    w.per.update(dt);
  }
  for (const lot of T.lotList) {
    const v = lot.visit;
    if (!v || !v.person) continue;
    v.person.update(dt);
    // 近づいたら話しかけるしぐさ
    const pd = Math.hypot(ctx.player.x - v.person.group.position.x, ctx.player.z - v.person.group.position.z);
    if (v.stage === 'home' && v.person.kind === 'idle' && pd < 2.6 && G.overlay === 'dialog') v.person.play('talk');
    if (v.stage === 'home' && v.person.kind === 'talk' && G.overlay !== 'dialog') v.person.play('idle');
  }
}

// =========================================================
// 設定
// =========================================================
function applySettings() {
  const st = G.save.settings;
  const r = ctx.renderer;
  r.setPixelRatio(Math.min(window.devicePixelRatio, st.quality === 'low' ? 1 : 1.5));
  r.setSize(window.innerWidth, window.innerHeight);
  r.shadowMap.enabled = true;
  ctx.sun.shadow.mapSize.set(st.quality === 'low' ? 1024 : 2048, st.quality === 'low' ? 1024 : 2048);
  if (ctx.sun.shadow.map) { ctx.sun.shadow.map.dispose(); ctx.sun.shadow.map = null; }
  setDetail(st.quality === 'low' ? 'low' : 'high');
  writeSettings();
}

// =========================================================
// 入力
// =========================================================
export function onKey(code, down) {
  G.keys[code] = down;
  if (!down || G.mode === 'title' || G.mode === 'ui') return;
  if (G.overlay === 'dialog') { dialogKey(code); return; }
  if (code === 'Tab') { if (G.overlay === 'tablet') closeTablet(); else if (!G.overlay) openTablet(); return; }
  if (code === 'Escape') {
    if (G.overlay === 'tablet') closeTablet();
    else if (G.overlay === 'menu') { closeMenu(); requestLock(); }
    else if (!G.overlay) showMenu('pause');
    return;
  }
  if (G.overlay) return;
  const van = ctx.van;
  if (G.mode === 'walk') {
    if (code === 'KeyE' && G.focus && G.focus.label && G.focus.use) G.focus.use();
    if (code === 'KeyF') {
      const dd = van.driverDoor();
      if (Math.hypot(dd.x - ctx.player.x, dd.z - ctx.player.z) < 2.2) enterVan();
      else toast('運転席のドアの近くで F を押すと乗れます。', 'info', 2500);
    }
  } else if (G.mode === 'drive') {
    if (code === 'KeyF') exitVan();
    if (code === 'Digit1') G.view = 'cab';
    if (code === 'Digit2') G.view = 'chase';
    if (code === 'Digit3') G.view = 'hood';
    if (code === 'KeyV') G.view = { cab: 'chase', chase: 'hood', hood: 'cab' }[G.view];
    if (code === 'KeyQ') { van.setSignal(1); sfx('tick', 0.25); }
    if (code === 'KeyE') { van.setSignal(-1); sfx('tick', 0.25); }
    if (code === 'KeyG') van.hazard = !van.hazard;
    if (code === 'KeyL') van.lightsOn = !van.lightsOn;
    if (code === 'KeyH') horn();
    if (code === 'KeyK') { van.wiperMode = (van.wiperMode + 1) % 3; sfx('click', 0.25); toast(['ワイパー：切', 'ワイパー：間欠', 'ワイパー：連続'][van.wiperMode], 'info', 1500); }
    if (code === 'Space') { van.parkingBrake = !van.parkingBrake; van.pbWarn = 0; sfx('click', 0.3); }
    if (code === 'KeyC') {
      if (van.cruise) { van.cruise = 0; toast('クルーズコントロールを解除しました。', 'info', 2000); }
      else if (van.gear === 'D' && van.kmh > 15) { van.cruise = van.speed; toast(`クルーズコントロール：${Math.round(van.kmh)} km/h で走行します。`, 'info', 2500); }
    }
  }
}
export function onMouse(dx, dy, buttons = 0) {
  if (G.overlay || !G.day || G.mode === 'title' || G.mode === 'ui') return;
  const st = G.save.settings;
  if (G.mode === 'walk') ctx.player.look(dx, dy, st.sens);
  else if (G.mode === 'drive') {
    if (st.mouseSteer && !(buttons & 2)) {
      G.mouseSteer = THREE.MathUtils.clamp(G.mouseSteer - dx * 0.0019 * st.mouseSteerSens, -1, 1);
    } else {
      G.look.yaw = THREE.MathUtils.clamp(G.look.yaw - dx * 0.002 * st.sens, -2.2, 2.2);
      G.look.pitch = THREE.MathUtils.clamp(G.look.pitch - dy * 0.002 * st.sens, -0.7, 0.5);
    }
  }
}
// マウスの固定が外れたら一時停止メニュー
export function onPointerUnlock() {
  if (!G.overlay && G.day && (G.mode === 'walk' || G.mode === 'drive')) showMenu('pause');
}

// =========================================================
// 毎フレームの更新
// =========================================================
const marker = { mesh: null };
export function initGame(c) {
  ctx = c;
  ctx.player.onStep = () => sfx('step' + Math.floor(Math.random() * 4), 0.18);
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0xf2a93b, emissive: 0xb86f10, emissiveIntensity: 0.7, roughness: 0.4 }));
  m.rotation.x = Math.PI;
  ctx.scene.add(m); marker.mesh = m;
  Object.assign(UI, {
    G, ctx: () => ctx, P, carried, nextStop, stopLots, cargoIssues, hasUp, slotName, sfx, requestLock, waitMinutes,
    applySettings, peekSave: loadSave, startGame, toTitle, nextDay, buy,
  });
  bindUI(UI);
  // 遠ざかって敷地が片付けられるときは、玄関先のやりとりも終える
  T.onLotUnload = (lot) => { if (lot.visit) endVisit(lot); };
  G.save.settings = loadSettings();
  applySettings();
  // 動作確認用
  G.dbg = { candidates, pickUp, putInVan, takeFromVan, dropToCrate, ring, handOver, okihai, leaveSlip, finishDay, enterVan, exitVan, P, nextStop, cargoIssues, spawnVisitor, presence, answer };
  toTitle();
}

let titleT = 0;
export function update(dt) {
  G.realT += dt;
  const d = G.day;
  const van = ctx.van;
  const cam = ctx.camera;
  if (G.mode === 'title' || !d) {
    // タイトル画面：町の上をゆっくり回るカメラ
    titleT += dt * 0.03;
    const oc = T.depot.center;
    const cx = oc.x + Math.cos(titleT) * 70, cz = oc.z + Math.sin(titleT) * 55;
    cam.position.set(cx, 24, cz);
    cam.lookAt(oc.x + Math.cos(titleT + 0.9) * 20, 2, oc.z + Math.sin(titleT + 0.9) * 15);
    ctx.traffic.update(dt, van, 0);
    updateSignals(G.realT);
    if (G.dbgCam) { cam.position.copy(G.dbgCam.pos); cam.up.set(0, 1, 0); cam.lookAt(G.dbgCam.look); }
    updateHud();
    return;
  }
  for (const t of G.timers.slice()) if (G.realT >= t.t) { G.timers.splice(G.timers.indexOf(t), 1); t.fn(); }
  const paused = !!G.overlay;
  if (!paused) {
    if (G.mode === 'drive') {
      van.update(dt, driveInput(), ctx.traffic.cars);
      if (van.blinkTick && van.blinkOn) sfx('tick', 0.12);
      if (van.pbWarn > 0) van.pbWarn = Math.max(0, van.pbWarn - dt * 0.4);
      if (G.day.time >= 17.6 * 60 && !van.lightsOn && !d.autoLight) { d.autoLight = true; van.lightsOn = true; toast('暗くなってきたのでライトをつけました（L）。', 'info'); }
      if (Math.abs(G.mouseSteer) > 0 && !G.save.settings.mouseSteer) G.mouseSteer = 0;
      checkDeparture();
      checkDriving(dt);
      van.drawMeter(fmt(d.time));
    } else {
      van.update(dt, { throttle: 0, brake: 0, steer: 0 }, []);
      ctx.player.update(dt, G.keys, van, G.carrying.some(id => P(id).weight >= 3) && !hasUp('cart') ? 0.75 : 1);
    }
    ctx.traffic.update(dt, van, updateLights(d.time / 60));
    updateTime(dt);
    for (const lot of T.lotList) {
      for (const dd of lot.doors) {
        dd.open += (dd.target - dd.open) * Math.min(1, dt * 3);
        dd.obj.rotation.y = (dd.base ?? lot.rot) + dd.sign * dd.open * 1.3;
      }
      if (lot.visit && lot.visit.expires && G.realT > lot.visit.expires && lot.visit.stage === 'home') endVisit(lot);
    }
  }
  // 会話中も人のアニメーションは止めない
  if (G.overlay !== 'menu') updatePeople(dt, !paused);
  updateSignals(G.realT);
  // カメラ（運転手の腕は運転席視点のときだけ見せる）
  van.driver.visible = G.mode === 'drive' && G.view === 'cab';
  const fov = G.mode === 'drive' && G.view === 'cab' ? 58 : 72;
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  if (G.mode === 'drive') {
    if (G.view === 'cab') {
      cam.position.copy(van.cabEye());
      if (!G.save.settings.mouseSteer && !G.keys.mouseRight) { G.look.yaw *= Math.max(0, 1 - dt * 0.6); }
      // 車体の傾きに合わせて視点も傾く
      cam.rotation.set(G.look.pitch - van.body.rotation.x, van.heading + Math.PI + G.look.yaw, -van.body.rotation.z, 'YXZ');
    } else if (G.view === 'hood') {
      const p = van.worldPoint(0, 1.35);
      cam.position.set(p.x, 1.55, p.z);
      cam.rotation.set(-0.04, van.heading + Math.PI + G.look.yaw * 0.3, 0, 'YXZ');
    } else {
      G.look.yaw *= Math.max(0, 1 - dt * 0.8);
      const ang = van.heading + G.look.yaw;
      const fx = Math.sin(ang), fz = Math.cos(ang);
      const back = van.speed < -0.3 ? -1 : 1;
      const target = new THREE.Vector3(van.x - fx * 7.2 * back, 3.1, van.z - fz * 7.2 * back);
      cam.position.lerp(target, Math.min(1, dt * 4));
      const f = van.forward;
      cam.lookAt(van.x + f.x * 2 * back, 1.2, van.z + f.z * 2 * back);
    }
    updateEngine(true, van.rpm, van.thr, van.speed);
  } else if (G.mode === 'walk') { ctx.player.apply(); updateEngine(false, 0, 0, 0); }
  // 目的地の目印
  const next = nextStop();
  if (next && d.departed) {
    const lot = T.lots[next];
    const ps = d.parcels.filter(p => p.lotId === next && p.status !== 'delivered');
    const unit = lot.rooms && ps[0] ? lot.rooms.find(r => r.room === ps[0].room) : null;
    const pt = unit ? unit.intercom : (lot.points.intercom || lot.points.front);
    marker.mesh.visible = true;
    marker.mesh.position.set(pt.x, (pt.y > 2 ? 3 : 0) + 2.9 + Math.sin(G.realT * 2.2) * 0.12, pt.z);
    marker.mesh.rotation.y = G.realT * 1.2;
  } else marker.mesh.visible = false;
  pickFocus();
  updateNav(dt);
  // 動作確認用のカメラ
  if (G.dbgCam) { cam.position.copy(G.dbgCam.pos); cam.up.set(0, 1, 0); cam.lookAt(G.dbgCam.look); }
  updateHud();
}

export { G as GAME };
