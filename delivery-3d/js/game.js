// ゲーム進行：荷物・営業所・積み込み・配達先でのやりとり・運転のルール・時間・画面表示
import * as THREE from 'three';
import { A, model, textTexture, JP_FONT } from './assets.js';
import { T, NAT_Z, NAT_HALF, routePath, speedLimitAt, updateLights, resolveCircle } from './town.js';
import { updateSignals } from './traffic.js';
import { TIME, WINDOWS, OKIHAI_PLACES, RESIDENTS, ITEMS, FAVORITES, SENDERS, FLAG_LABEL, BOX_DIMS, UPGRADES, LEVELS, parcelsForLevel } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
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
    a.volume = vol; a.play().catch(() => {});
    audioPool[name] = a;
  } catch (e) { /* 音が出せない環境 */ }
}
// エンジン音（WebAudio で合成）
const engine = { ctx: null, osc: null, osc2: null, gain: null, filt: null };
function startEngine() {
  if (engine.ctx || !window.AudioContext) return;
  try {
    const c = engine.ctx = new AudioContext();
    engine.osc = c.createOscillator(); engine.osc.type = 'sawtooth';
    engine.osc2 = c.createOscillator(); engine.osc2.type = 'square';
    engine.filt = c.createBiquadFilter(); engine.filt.type = 'lowpass'; engine.filt.frequency.value = 380;
    engine.gain = c.createGain(); engine.gain.gain.value = 0;
    engine.osc.connect(engine.filt); engine.osc2.connect(engine.filt); engine.filt.connect(engine.gain); engine.gain.connect(c.destination);
    engine.osc.start(); engine.osc2.start();
  } catch (e) { engine.ctx = null; }
}
function updateEngine(running, speed, throttle) {
  if (!engine.ctx) return;
  const v = Math.abs(speed);
  const gear = v < 4 ? v / 4 : v < 9 ? (v - 4) / 5 : v < 15 ? (v - 9) / 6 : (v - 15) / 12;
  const rpm = 0.25 + Math.min(1, gear) * 0.6 + throttle * 0.15;
  const f = 32 + rpm * 70;
  const t = engine.ctx.currentTime;
  engine.osc.frequency.setTargetAtTime(f, t, 0.05);
  engine.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  engine.gain.gain.setTargetAtTime(running && soundOn ? 0.035 + throttle * 0.03 : 0, t, 0.1);
}

// =========================================================
// 状態
// =========================================================
const SAVE_KEY = 'aoba3d-save-v1';
const defaultSave = () => ({ day: 1, money: 0, exp: 0, level: 1, upgrades: {}, visits: {}, history: [], seed: Math.floor(Math.random() * 1e9), sens: 1 });
function loadSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.day) return Object.assign(defaultSave(), s); } catch (e) { /* 新規 */ } return null; }
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* 保存不可 */ } }
const hasUp = (id) => !!G.save.upgrades[id];

export const G = {
  save: null, day: null, mode: 'title', view: 'cab', overlay: null, keys: {}, carrying: [],
  timers: [], realT: 0, look: { yaw: 0, pitch: 0 }, prompt: null, focus: null,
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
  // 作業台に並べる
  const spots = [];
  for (const t of T.depot.tables) for (const dz of [-0.28, 0.28]) for (const dx of [-1.0, 0, 1.0]) spots.push({ x: t.x + dx, z: t.z + dz, y: t.y });
  parcels.forEach((p, i) => {
    p.mesh = parcelMesh(p);
    const sp2 = spots[i % spots.length];
    attachParcel(p, { type: 'world', pos: new THREE.Vector3(sp2.x, sp2.y, sp2.z), rotY: (i % 3 - 1) * 0.15, where: 'table' });
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
  const near = (pos, r = 6) => Math.hypot(pos.x - pl.x, pos.z - pl.z) < r && Math.abs(pos.y - (pl.y + 1)) < 2.5;
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
  sfx('bell', 0.5);
  lot.visit = { stage: 'calling', room, lotId: lot.id, retry };
  G.timers.push({ t: G.realT + 1.6, fn: () => answer(lot, room) });
  d.time += 0.5;
}

function answer(lot, room) {
  const d = G.day, v = lot.visit;
  if (!v) return;
  const r = unitResident(lot.id, room);
  const shop = lot.kind === 'shop' || lot.kind === 'conbini';
  let speaker, home;
  if (r) {
    let prob = presenceAt(r, d.time);
    const mine = pendingFor(lot.id, room);
    if (mine.some(p => windowState(p, d.time) === 'ok')) prob = Math.max(prob, mine.some(p => p.redeliver) ? 0.97 : 0.93);
    if (r.sleeper && d.time < 13 * 60) prob *= 0.5;
    if (v.retry) prob *= 0.35;
    home = rand() < prob;
    speaker = { name: r.name, role: r.role, rid: r.id, surname: r.name.split(' ')[0] };
  } else {
    home = shop ? true : rand() < 0.5;
    speaker = { name: shop ? `${lot.name}の店員` : (lot.rooms ? `${room}号室の住人` : `${lot.surname}さん`), role: '', rid: null, surname: shop ? '' : lot.surname };
  }
  v.speaker = speaker;
  if (!home) {
    v.stage = 'absent';
    sfx('tick', 0.3);
    dialog({
      title: room ? `${room}号室` : (lot.kind === 'shop' ? lot.name : `${lot.surname}さん宅`),
      text: lot.kind === 'mansion' ? 'インターホンに応答がない。' : (r && r.sleeper && d.time < 13 * 60 ? '反応がない。中で人の気配はするが…寝ているのかもしれない。' : '応答がない。留守のようだ。'),
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
    if (r.meeting && pendingFor(lot.id, room).some(p => p.okihai) && chance(0.5)) {
      v.meeting = true; line = r.lines[0];
    } else if (r.meeting) line = r.lines[visits < 3 ? 1 : 2];
  } else if (shop) line = 'はい、いらっしゃいませ…あ、配達ですか？';
  else line = pick(['はい？', 'はーい、どちら様ですか？', 'はい、なんでしょう？']);
  v.line = line;
  sfx('ok2', 0.4);
  if (v.meeting) {
    v.stage = 'absent'; v.authorized = true;
    dialog({ title: speaker.name, text: line, choices: [{ label: 'わかりました（宅配ボックスに入れる）', use: closeDialog }] });
    return;
  }
  v.stage = 'home';
  if (lot.kind === 'mansion') {
    v.handPos = lot.points.intercom;
    d.time += 2;
    dialog({ title: speaker.name, text: `${line}\n（エントランスまで降りてきてくれた）`, choices: [{ label: '操作盤の前で渡す', use: closeDialog }] });
  } else {
    const unit = lot.rooms ? lot.rooms.find(x => x.room === room) : null;
    v.handPos = unit ? unit.door : lot.points.door;
    if (!lot.rooms && lot.doors[0]) lot.doors[0].target = 1;
    dialog({ title: speaker.name, text: line, choices: [{ label: lot.kind === 'shop' || lot.kind === 'conbini' ? '店の入口で渡す' : '玄関へ向かう', use: closeDialog }] });
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
    dialog({ title: '電話', text: '「あと5分で戻ります！」\n（5分待って、受取人が戻ってきた）', choices: [{ label: '玄関で渡す', use: closeDialog }] });
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
      const a = lot.corridor.a, b = lot.corridor.b;
      pl.zone = { x0: Math.min(a.x, b.x) + 0.3, x1: Math.max(a.x, b.x) - 0.3, z0: Math.min(a.z, b.z) + 0.3, z1: Math.max(a.z, b.z) - 0.3 };
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
    title: sp.name, text: `「${v.line}」`,
    choices: [
      { label: `荷物を渡してサインをもらう（${hand.length}個）`, use: () => { closeDialog(); doHandOver(lot, v, hand); } },
      { label: `「${hand[0].name}様ですね？」と確認する`, use: () => {
        d.time += 0.3;
        if (sp.rid && hand.every(p => p.rid === sp.rid)) { dialog({ title: sp.name, text: '「はい、そうです」', choices: [{ label: '荷物を渡してサインをもらう', use: () => { closeDialog(); doHandOver(lot, v, hand); } }] }); return; }
        const wrong = hand.find(p => p.rid !== sp.rid);
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
    if (p.rid === sp.rid) { deliver(p, 'hand', lot); continue; }
    if (p.name.split(' ')[0] === sp.surname && sp.surname) { p.misdelivered = true; d.stats.misdelivery++; deliver(p, 'hand', lot, true); continue; }
    toast(`「${esc(p.name)}さん宛てですか？ うちじゃないですよ」`, 'bad');
  }
  if (sp.rid && hand.some(p => p.rid === sp.rid)) {
    d.memories.push({ rid: sp.rid, line: v.line });
    G.save.visits[sp.rid] = (G.save.visits[sp.rid] || 0) + 1;
  }
  relayoutHand();
  d.time += 1;
  sfx('ok', 0.5);
  setTimeout(() => endVisit(lot), 1500);
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

function endVisit(lot) {
  lot.visit = null;
  for (const dd of lot.doors) dd.target = 0;
}

// =========================================================
// 運転
// =========================================================
function enterVan() {
  if (G.carrying.length) { toast('荷物を持ったままでは乗れません。荷台に積むか、置いてから乗りましょう。', 'info'); return; }
  G.mode = 'drive';
  G.look = { yaw: 0, pitch: -0.05 };
  sfx('door', 0.35);
  startEngine();
  if (!G.day.departed) toast('W/S でアクセル・ブレーキ、A/D でハンドル。C で視点切り替え。', 'info', 5000);
}
function exitVan() {
  const van = ctx.van;
  if (Math.abs(van.speed) > 0.5) { toast('止まってから降りましょう。', 'info'); return; }
  const pl = ctx.player;
  let p = van.driverDoor();
  pl.x = p.x; pl.z = p.z; pl.y = 0; pl.zone = null;
  pl.yaw = van.heading + Math.PI; pl.pitch = -0.1;
  // 壁にめり込むなら反対側から降りる
  const q = { x: pl.x, z: pl.z };
  if (resolveCircle(q, 0.3) > 0.2) { p = van.passengerSide(); pl.x = p.x; pl.z = p.z; }
  G.mode = 'walk';
  updateEngine(false, 0, 0);
  sfx('door', 0.35);
}

function driveInput() {
  const k = G.keys;
  return {
    throttle: (k.KeyW || k.ArrowUp) ? 1 : 0,
    brake: (k.KeyS || k.ArrowDown) ? 1 : 0,
    steer: ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0),
    handbrake: !!k.Space,
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
  // 信号無視
  for (const s of T.signals) {
    const lines = [
      { ax: 'x', at: s.x - 10, dir: 1, z0: NAT_Z - NAT_HALF, z1: NAT_Z, col: s.state.ew },
      { ax: 'x', at: s.x + 4.5, dir: -1, z0: NAT_Z, z1: NAT_Z + NAT_HALF, col: s.state.ew },
      { ax: 'z', at: 150.5, dir: 1, x0: s.x - 3, x1: s.x + 3, col: s.state.ns },
    ];
    for (const L of lines) {
      if (L.col !== 'r') continue;
      if (L.ax === 'x') {
        if (front.z < L.z0 || front.z > L.z1) continue;
        if ((prevFront.x - L.at) * L.dir < 0 && (front.x - L.at) * L.dir >= 0) violation('信号無視', 5000, 10);
      } else {
        if (front.x < L.x0 || front.x > L.x1) continue;
        if ((prevFront.z - L.at) * L.dir < 0 && (front.z - L.at) * L.dir >= 0) violation('信号無視', 5000, 10);
      }
    }
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
  if (!d.departed && van.z < T.depot.gateZ && Math.abs(van.speed) > 0.1) {
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
  if (G.keys.KeyT && G.mode === 'drive' && Math.abs(ctx.van.speed) < 0.3) scale *= 20;
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
// 表示
// =========================================================
export function toast(msg, kind = '', ms = 4000) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

function dialog({ title, text, choices = [], grid }) {
  G.overlay = 'dialog';
  document.exitPointerLock && document.exitPointerLock();
  const el = $('#dialog');
  el.innerHTML = `<div class="dlg"><div class="dlg-title">${esc(title)}</div><div class="dlg-text">${esc(text).replace(/\n/g, '<br>')}</div>
    ${grid ? `<div class="dlg-grid">${grid.map((c, i) => `<button class="btn" data-g="${i}">${esc(c.label)}</button>`).join('')}</div>` : ''}
    <div class="dlg-choices">${choices.map((c, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-c="${i}" ${c.disabled ? 'disabled' : ''}>${esc(c.label)}</button>`).join('')}</div></div>`;
  el.classList.add('show');
  $$('[data-c]', el).forEach(b => b.onclick = () => { sfx('click', 0.3); choices[+b.dataset.c].use(); });
  $$('[data-g]', el).forEach(b => b.onclick = () => { sfx('click', 0.3); grid[+b.dataset.g].use(); });
}
function closeDialog() {
  $('#dialog').classList.remove('show');
  if (G.overlay === 'dialog') G.overlay = null;
  requestLock();
}
export function requestLock() {
  if (G.overlay || G.mode === 'title') return;
  const c = ctx.renderer.domElement;
  try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 失敗しても続行 */ }
}

function slipHtml(p) {
  const w = WINDOWS[p.window];
  const r = p.rid ? resident(p.rid) : null;
  const flags = p.flags.map(f => `<span class="tag ${FLAG_LABEL[f].cls}">${FLAG_LABEL[f].label}</span>`).join(' ');
  return `<div class="slip">
    <div class="slip-h">お届け伝票 <span>${p.no}</span></div>
    <div class="slip-name">${esc(p.name)} 様</div>
    <div class="slip-addr ${p.misrouted ? 'warn' : ''}">${esc(p.addr)}</div>
    <div class="slip-row"><span class="tag time">${w.label}</span> <span class="tag">${p.size}サイズ</span> ${flags}</div>
    <div class="slip-row small">品名：${esc(p.item)}　ご依頼主：${esc(p.sender)}</div>
    <div class="slip-row small">${p.okihai ? `置き配：<b>可（${p.okihai}）</b>` : `置き配：<b>不可</b> ${esc(p.okihaiReason || '')}`}</div>
    ${r && hasUp('notify') ? `<div class="slip-row small">在宅予定：${homeHint(r)}</div>` : ''}
    ${p.damaged && p.damageNoticed ? '<div class="slip-row small warn">中身が破損しているかもしれない</div>' : ''}
  </div>`;
}
function homeHint(r) {
  if (r.awayRate >= 0.8) return 'ほぼ在宅';
  return r.home.filter(h => h[2] >= 0.8).map(([a, b]) => (a <= 0 ? '' : fmt(a * 60)) + '〜' + (b >= 24 ? '' : fmt(b * 60))).join('・') || '不定';
}

let hudCache = '';
function updateHud() {
  const d = G.day, van = ctx.van;
  $('#hud-time').textContent = fmt(d.time);
  $('#hud-time').classList.toggle('over', d.time >= TIME.SHIFT_END);
  $('#hud-clock-note').textContent = d.clock ? (G.keys.KeyT && G.mode === 'drive' && Math.abs(van.speed) < 0.3 ? '待機中 ▶▶' : '') : '出発前（時計は止まっています）';
  $('#hud-day').textContent = `${G.save.day}日目`;
  const done = d.parcels.filter(p => p.status === 'delivered').length;
  const total = d.parcels.filter(p => !p.misrouted).length;
  $('#hud-progress').textContent = `配達 ${done} / ${total}`;
  // 目標
  $('#hud-goal').innerHTML = goalText();
  // 操作のヒント
  const f = G.focus;
  const pr = $('#prompt');
  if (G.mode === 'walk' && f && f.label) { pr.innerHTML = `<kbd>E</kbd> ${esc(f.label)}`; pr.classList.add('show'); }
  else pr.classList.remove('show');
  // 伝票のプレビュー
  const sp = $('#slip-preview');
  const look = G.mode === 'walk' && f && f.parcel ? f.parcel : (G.mode === 'walk' && G.carrying.length ? carried()[G.carrying.length - 1] : null);
  const key = look ? look.id + look.status + look.okihai + look.window : '';
  if (key !== hudCache) { hudCache = key; sp.innerHTML = look ? slipHtml(look) : ''; sp.classList.toggle('show', !!look); }
  // スピードメーター
  const sd = $('#speedo');
  if (G.mode === 'drive') {
    sd.classList.add('show');
    const lim = speedLimitAt(van.x, van.z);
    $('#spd').textContent = Math.round(van.kmh);
    $('#spd-lim').textContent = lim;
    sd.classList.toggle('over', van.kmh > lim + 5);
    $('#spd-ind').innerHTML = `${van.speed < -0.1 ? '<span class="r">R</span>' : ''}${van.blinkOn && (van.signal < 0 || van.hazard) ? '<span class="bl">◀</span>' : ''}${van.blinkOn && (van.signal > 0 || van.hazard) ? '<span class="bl">▶</span>' : ''}${van.lightsOn ? '<span class="li">ライト</span>' : ''}${(van.hatchT > 0.5 || van.slideT > 0.5) ? '<span class="dw">ドア開</span>' : ''}`;
  } else sd.classList.remove('show');
  $('#crosshair').classList.toggle('show', G.mode === 'walk');
}

function goalText() {
  const d = G.day;
  if (!d.departed) {
    const unchecked = d.parcels.filter(p => !p.checked).length;
    const onTable = d.parcels.filter(p => p.status === 'depot' && p.loc && p.loc.type === 'world').length;
    if (unchecked) return `作業台の荷物を確認して、車に積み込もう（未確認 ${unchecked}個）`;
    if (onTable || G.carrying.length) return `荷物を車に積み込もう（残り ${onTable + G.carrying.length}個）。Tab でルートを決められる`;
    return 'ドアを閉めて、運転席に乗って（F）出発しよう';
  }
  if (d.ended) return '';
  const next = nextStop();
  if (!next) return '全部回った。営業所に戻って、事務机で日報を書こう';
  const lot = T.lots[next];
  const ps = pendingFor(next, null).concat(lot.rooms ? d.parcels.filter(p => p.lotId === next && p.room && ['loaded', 'redeliver', 'carry', 'hand'].includes(p.status)) : []);
  const w = ps.find(p => p.window !== 'none');
  return `次：${esc(lot.name || lot.surname + 'さん宅')}（${lot.address}）${w ? `　<span class="tag time">${WINDOWS[w.window].label}</span>` : ''}`;
}

function nextStop() {
  const d = G.day;
  const pend = new Set(d.parcels.filter(p => p.lotId && ['loaded', 'redeliver', 'hand'].includes(p.status)).map(p => p.lotId));
  for (const id of d.route) if (pend.has(id)) return id;
  return [...pend][0] || null;
}

// ミニマップ
function drawMinimap() {
  const c = $('#minimap'), g = c.getContext('2d');
  const W = c.width, H = c.height, S = 1.15;
  const pl = G.mode === 'drive' ? { x: ctx.van.x, z: ctx.van.z } : { x: ctx.player.x, z: ctx.player.z };
  const fwd = G.mode === 'drive' ? ctx.van.forward : { x: -Math.sin(ctx.player.yaw), z: -Math.cos(ctx.player.yaw) };
  const ang = Math.atan2(fwd.x, -fwd.z);
  g.save();
  g.fillStyle = '#c9cfbf'; g.fillRect(0, 0, W, H);
  g.translate(W / 2, H * 0.62); g.rotate(-ang); g.scale(S, S); g.translate(-pl.x, -pl.z);
  g.fillStyle = '#e6e2d8';
  for (const lot of T.lotList) g.fillRect(lot.cx - lot.w / 2 + 0.5, lot.cz - lot.d / 2 + 0.5, lot.w - 1, lot.d - 1);
  const dp = T.depot.area; g.fillStyle = '#d8dce2'; g.fillRect(dp.x0, dp.z0, dp.x1 - dp.x0, dp.z1 - dp.z0);
  for (const r of T.roads) { g.fillStyle = r.kind === 'national' ? '#5d6470' : '#7b818b'; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); }
  // ルート
  const next = nextStop();
  const nav = next && hasUp('navi') ? routePath(pl, T.lots[next].points.front || { x: T.lots[next].cx, z: T.lots[next].cz }) : null;
  if (nav) {
    const path = nav.points;
    g.strokeStyle = '#2e9be0'; g.lineWidth = 3.2; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pl.x, pl.z); for (const p of path) g.lineTo(p.x, p.z); g.stroke();
  }
  // 配達先
  const stops = stopLots();
  for (const id of stops) {
    const lot = T.lots[id];
    const idx = G.day.route.indexOf(id);
    const done = G.day.parcels.filter(p => p.lotId === id).every(p => p.status === 'delivered');
    g.save(); g.translate(lot.cx, lot.cz); g.rotate(ang);
    g.fillStyle = done ? '#3f7d5a' : id === next ? '#2e6eaa' : '#2d4a66';
    g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(done ? '✓' : idx >= 0 ? String(idx + 1) : '・', 0, 0.5);
    g.restore();
  }
  g.save(); g.translate(-68, 200); g.rotate(ang); g.fillStyle = '#5b5f66'; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('営', 0, 0.5); g.restore();
  g.restore();
  // 自分
  g.fillStyle = '#e8762c'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(W / 2, H * 0.62 - 9); g.lineTo(W / 2 + 6, H * 0.62 + 6); g.lineTo(W / 2, H * 0.62 + 3); g.lineTo(W / 2 - 6, H * 0.62 + 6); g.closePath(); g.fill(); g.stroke();
  // 北の向き
  g.save(); g.translate(W - 16, 16); g.rotate(-ang); g.fillStyle = '#c8281e'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 0, -1); g.restore();
  if (nav) {
    const len = nav.length;
    const eta = G.day.time + len / 8.5 / 60 * TIME.SCALE;
    g.fillStyle = 'rgba(20,28,36,.75)'; g.fillRect(0, H - 22, W, 22);
    g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.textAlign = 'left'; g.fillText(`あと ${Math.round(len)}m　到着予想 ${fmt(eta)}`, 8, H - 7);
  }
}

function stopLots() {
  const ids = [];
  for (const p of G.day.parcels) if (p.lotId && !['left', 'aside', 'asideWrong'].includes(p.status) && !ids.includes(p.lotId)) ids.push(p.lotId);
  return ids;
}

// =========================================================
// タブレット
// =========================================================
function openTablet(tab = 'list') {
  G.overlay = 'tablet';
  G.tab = tab;
  document.exitPointerLock && document.exitPointerLock();
  renderTablet();
  $('#tablet').classList.add('show');
}
function closeTablet() { $('#tablet').classList.remove('show'); G.overlay = null; requestLock(); }

function renderTablet() {
  const d = G.day, el = $('#tablet');
  const tabs = [['list', '伝票一覧'], ['map', '地図・ルート'], ['cargo', '荷台'], ['work', '業務']];
  let body = '';
  if (G.tab === 'list') {
    body = `<div class="tb-list">${d.parcels.map(p => {
      const st = { depot: p.checked ? '確認済み・未積載' : '未確認', loaded: '積載中', hand: '手に持っている', delivered: '配達済み', carry: '持ち戻り', redeliver: '再配達依頼', aside: '仕分け戻し', left: '積み残し', asideWrong: '仕分け戻し' }[p.status] || p.status;
      return `<div class="tb-item ${p.status}">${slipHtml(p)}<div class="tb-st">${st}${p.loc && p.loc.type === 'slot' ? `<br><small>${slotName(ctx.van.slots.find(s => s.id === p.loc.slot))}</small>` : p.loc && p.loc.type === 'cooler' ? '<br><small>保冷ボックス</small>' : ''}</div></div>`;
    }).join('')}</div>`;
  } else if (G.tab === 'map') {
    body = `<div class="tb-map"><canvas id="tb-canvas" width="900" height="640"></canvas>
      <div class="tb-route"><h4>配達順</h4><p class="muted">地図の配達先をクリックして順番を決めます。</p><ol>${d.route.map((id, i) => {
        const lot = T.lots[id]; const ps = d.parcels.filter(p => p.lotId === id && p.status !== 'delivered');
        return `<li><span>${i + 1}. ${esc(lot.name || lot.surname + 'さん宅')}</span><span class="muted">${ps.map(p => WINDOWS[p.window].short).filter(x => x !== '指定なし').join(' ')}</span><span><button data-up="${i}">▲</button><button data-del="${i}">✕</button></span></li>`;
      }).join('')}</ol>
      <button class="btn" id="tb-clear">順番をクリア</button></div></div>`;
  } else if (G.tab === 'cargo') {
    const van = ctx.van;
    const cell = (side, depth, level) => {
      if (side === 'L' && depth === 2 && level === 'floor') {
        return `<div class="cg cooler">保冷ボックス<br>${van.cooler.items.map(id => esc(P(id).name.split(' ')[0])).join('、') || '空'}（${van.cooler.items.length}/${van.cooler.capacity}）</div>`;
      }
      const s = van.slots.find(x => x.side === side && x.depth === depth && x.level === level);
      const p = s.parcel ? P(s.parcel) : null;
      const warn = p && ((p.weight >= 3 || p.flags.includes('fragile') || p.flags.includes('upright')) && level === 'shelf' || p.flags.includes('cool'));
      return `<div class="cg ${p ? 'full' : ''} ${warn ? 'warn' : ''}">${p ? `<b>${esc(p.name.split(' ')[0])}</b><br><small>${esc(p.item)}</small>${d.route.indexOf(p.lotId) >= 0 ? `<i>${d.route.indexOf(p.lotId) + 1}</i>` : ''}` : '<small>空き</small>'}</div>`;
    };
    body = `<div class="tb-cargo"><p class="muted">上から見た荷台（右が車の前）。後ろのハッチからは「後ろ」、左のスライドドアからは「前・中央」が取り出しやすい。</p>
      ${['shelf', 'floor'].map(level => `<h4>${level === 'shelf' ? '棚（上段）' : '床（下段）'}</h4><div class="cg-grid"><div class="cg-row cg-headrow"><div></div><div>後ろ（ハッチ側）</div><div>中央</div><div>前（運転席側）</div></div>${['L', 'R'].map(side => `<div class="cg-row"><div class="cg-side">${side === 'L' ? '左（歩道側）' : '右'}</div>${[0, 1, 2].map(dep => cell(side, dep, level)).join('')}</div>`).join('')}</div>`).join('')}
      <ul class="issues">${cargoIssues().map(t => `<li>${esc(t)}</li>`).join('') || '<li class="ok">積み方に問題はありません。</li>'}</ul></div>`;
  } else {
    const parked = Math.abs(ctx.van.speed) < 0.3;
    body = `<div class="tb-work">
      <p>現在 <b>${fmt(d.time)}</b>　定時 ${fmt(TIME.SHIFT_END)}</p>
      <p class="muted">時間指定より早く着いたときは、車の中で待機できます（運転中に T キーを押し続けても時間が早く進みます）。</p>
      <div class="row"><button class="btn" data-wait="10" ${!d.clock || !parked ? 'disabled' : ''}>10分待つ</button><button class="btn" data-wait="30" ${!d.clock || !parked ? 'disabled' : ''}>30分待つ</button></div>
      <h4>操作</h4>
      <table class="keys">
        <tr><td>歩く</td><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>　走る <kbd>Shift</kbd>　見回す マウス</td></tr>
        <tr><td>調べる・持つ・置く</td><td><kbd>E</kbd>（画面中央で狙う）</td></tr>
        <tr><td>乗る・降りる</td><td><kbd>F</kbd></td></tr>
        <tr><td>運転</td><td><kbd>W</kbd> アクセル　<kbd>S</kbd> ブレーキ／バック　<kbd>A</kbd><kbd>D</kbd> ハンドル　<kbd>Space</kbd> サイドブレーキ</td></tr>
        <tr><td>運転中</td><td><kbd>C</kbd> 視点　<kbd>Q</kbd><kbd>E</kbd> ウインカー　<kbd>H</kbd> ハザード　<kbd>L</kbd> ライト　<kbd>T</kbd>（停車中）待機</td></tr>
        <tr><td>タブレット</td><td><kbd>Tab</kbd>　一時停止 <kbd>Esc</kbd></td></tr>
      </table>
      <div class="row"><label>マウス感度 <input type="range" id="sens" min="0.3" max="2" step="0.1" value="${G.save.sens}"></label>
      <label><input type="checkbox" id="snd" ${soundOn ? 'checked' : ''}> 音</label></div>
    </div>`;
  }
  el.innerHTML = `<div class="tablet"><div class="tb-head">${tabs.map(([k, l]) => `<button class="tb-tab ${G.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}<span class="spacer"></span><span class="muted">${fmt(d.time)}</span><button class="btn" id="tb-close">閉じる（Tab）</button></div><div class="tb-body">${body}</div></div>`;
  $$('[data-tab]', el).forEach(b => b.onclick = () => { G.tab = b.dataset.tab; sfx('click', 0.3); renderTablet(); });
  $('#tb-close', el).onclick = closeTablet;
  if (G.tab === 'map') {
    drawTabletMap();
    const cv = $('#tb-canvas');
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width * cv.width, my = (e.clientY - r.top) / r.height * cv.height;
      const w = mapToWorld(mx, my);
      let best = null, bd = 12;
      for (const id of stopLots()) { const l = T.lots[id]; const dd = Math.hypot(l.cx - w.x, l.cz - w.z); if (dd < bd) { bd = dd; best = id; } }
      if (best) { const i = d.route.indexOf(best); if (i >= 0) d.route.splice(i, 1); else d.route.push(best); sfx('select', 0.3); renderTablet(); }
    };
    $$('[data-up]', el).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [d.route[i - 1], d.route[i]] = [d.route[i], d.route[i - 1]]; renderTablet(); } });
    $$('[data-del]', el).forEach(b => b.onclick = () => { d.route.splice(+b.dataset.del, 1); renderTablet(); });
    $('#tb-clear').onclick = () => { d.route = []; renderTablet(); };
  }
  $$('[data-wait]', el).forEach(b => b.onclick = () => { d.time += +b.dataset.wait; updateTime(0); sfx('tick', 0.4); renderTablet(); });
  const sens = $('#sens'); if (sens) sens.oninput = () => { G.save.sens = +sens.value; writeSave(); };
  const snd = $('#snd'); if (snd) snd.onchange = () => { soundOn = snd.checked; };
}

const MAP_VIEW = { x0: -140, z0: -20, x1: 260, z1: 240 };
function worldToMap(x, z, W = 900, H = 640) { const s = Math.min(W / (MAP_VIEW.x1 - MAP_VIEW.x0), H / (MAP_VIEW.z1 - MAP_VIEW.z0)); return { x: (x - MAP_VIEW.x0) * s, y: (z - MAP_VIEW.z0) * s, s }; }
function mapToWorld(mx, my, W = 900, H = 640) { const s = Math.min(W / (MAP_VIEW.x1 - MAP_VIEW.x0), H / (MAP_VIEW.z1 - MAP_VIEW.z0)); return { x: mx / s + MAP_VIEW.x0, z: my / s + MAP_VIEW.z0 }; }
function drawTabletMap() {
  const c = $('#tb-canvas'), g = c.getContext('2d'), d = G.day;
  g.fillStyle = '#cfd6c4'; g.fillRect(0, 0, c.width, c.height);
  const rect = (x0, z0, x1, z1, col) => { const a = worldToMap(x0, z0), b = worldToMap(x1, z1); g.fillStyle = col; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); };
  for (const lot of T.lotList) rect(lot.cx - lot.w / 2 + 0.5, lot.cz - lot.d / 2 + 0.5, lot.cx + lot.w / 2 - 0.5, lot.cz + lot.d / 2 - 0.5, lot.kind === 'shop' || lot.kind === 'conbini' ? '#e9dcc8' : '#ecebe6');
  const dp = T.depot.area; rect(dp.x0, dp.z0, dp.x1, dp.z1, '#d8dce2');
  for (const r of T.roads) rect(r.x0, r.z0, r.x1, r.z1, r.kind === 'national' ? '#5d6470' : '#8a9099');
  g.fillStyle = '#334'; g.font = 'bold 13px sans-serif';
  const lbl = worldToMap(-120, NAT_Z - 7); g.fillText('国道', lbl.x, lbl.y);
  // ルート線
  let prev = { x: -60, z: 190 };
  g.strokeStyle = 'rgba(46,110,170,.8)'; g.lineWidth = 3; g.setLineDash([6, 4]);
  for (const id of d.route) {
    const lot = T.lots[id];
    const path = routePath(prev, lot.points.front || { x: lot.cx, z: lot.cz }).points;
    g.beginPath(); path.forEach((p, i) => { const m = worldToMap(p.x, p.z); if (i) g.lineTo(m.x, m.y); else g.moveTo(m.x, m.y); }); g.stroke();
    prev = lot.points.front || { x: lot.cx, z: lot.cz };
  }
  g.setLineDash([]);
  // 自分の位置
  const me = worldToMap(G.mode === 'drive' ? ctx.van.x : ctx.player.x, G.mode === 'drive' ? ctx.van.z : ctx.player.z);
  g.fillStyle = '#e8762c'; g.beginPath(); g.arc(me.x, me.y, 6, 0, 7); g.fill();
  // 配達先
  for (const id of stopLots()) {
    const lot = T.lots[id], m = worldToMap(lot.cx, lot.cz);
    const idx = d.route.indexOf(id);
    const ps = d.parcels.filter(p => p.lotId === id);
    const done = ps.every(p => p.status === 'delivered');
    g.fillStyle = done ? '#3f7d5a' : ps.some(p => p.status === 'redeliver') ? '#8a5aa8' : ps.some(p => p.status === 'carry') ? '#c27a2c' : '#2d4a66';
    g.beginPath(); g.arc(m.x, m.y, 11, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(done ? '✓' : idx >= 0 ? String(idx + 1) : '・', m.x, m.y + 1);
    const ws = ps.filter(p => p.window !== 'none' && p.status !== 'delivered').map(p => WINDOWS[p.window].short);
    g.fillStyle = '#223'; g.font = '11px sans-serif'; g.textAlign = 'left';
    g.fillText((lot.name || lot.surname) + (ws.length ? ` ${ws.join(' ')}` : ''), m.x + 13, m.y + 1);
  }
  const off = worldToMap(-68, 200); g.fillStyle = '#5b5f66'; g.beginPath(); g.arc(off.x, off.y, 11, 0, 7); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('営', off.x, off.y + 1);
  g.textAlign = 'left';
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
  showResult();
}

function showResult() {
  const d = G.day, s = G.save, R = d.result;
  G.overlay = 'result'; G.mode = 'ui';
  document.exitPointerLock && document.exitPointerLock();
  updateEngine(false, 0, 0);
  const comment = { S: '完璧な段取り！', A: 'とても良い仕事でした。', B: 'まずまずの一日。', C: '少し慌ただしい一日でした。', D: '大変な一日でした。明日は落ち着いていきましょう。' }[R.rank];
  const el = $('#screen');
  el.innerHTML = `<div class="screen-card wide">
    <h2>${s.day}日目の業務報告</h2>
    <div class="res-grid">
      <div>
        <div class="rank-row"><div class="rank">${R.rank}</div><div>${comment}<div class="muted">スコア ${R.score} / ${R.max}　帰着 ${fmt(d.time)}</div></div></div>
        <div class="stats">
          <div><span>配達完了</span><b>${R.delivered.length}/${R.real.length}</b></div>
          <div><span>時間指定</span><b>${R.winOk.length}/${R.windowed.length}</b></div>
          <div><span>持ち戻り</span><b>${R.notDelivered.length}</b></div>
          <div><span>誤配</span><b>${d.stats.misdelivery}</b></div>
          <div><span>破損</span><b>${d.stats.damaged}</b></div>
          <div><span>違反</span><b>${d.stats.violations.length}</b></div>
        </div>
        <table class="score">${R.rows.map(r => `<tr class="${r.kind}"><td>${esc(r.label)}</td><td>${r.pts > 0 ? '+' : ''}${r.pts}</td></tr>`).join('')}<tr class="total"><td>合計</td><td>${R.score}</td></tr></table>
      </div>
      <div>
        <table class="score">
          <tr><td>基本日給</td><td>${yen(6000)}</td></tr>
          <tr><td>配達手当（${R.delivered.length}個）</td><td>${yen(R.delivered.length * 250)}</td></tr>
          <tr><td>時間指定手当（${R.winOk.length}個）</td><td>${yen(R.winOk.length * 150)}</td></tr>
          <tr><td>評価ボーナス（${R.rank}）</td><td>${yen(R.bonus)}</td></tr>
          ${R.overtime ? `<tr><td>残業手当</td><td>${yen(R.overtime * 20)}</td></tr>` : ''}
          ${d.stats.fines ? `<tr class="minus"><td>反則金・修理代</td><td>-${yen(d.stats.fines)}</td></tr>` : ''}
          <tr class="total"><td>受け取り</td><td>${yen(R.net)}</td></tr>
        </table>
        <p>経験値 +${R.exp}（Lv${s.level}${R.levelUp ? '　レベルアップ！ 明日から荷物が増えます' : ''}）　所持金 ${yen(s.money)}</p>
        <h4>今日、町で聞いた言葉</h4>
        <div class="memories">${d.memories.map(m => { const r = resident(m.rid); return `<div class="memo"><b>${esc(r.name)}</b><span class="muted">（${esc(r.role)}）</span><br>「${esc(m.line)}」</div>`; }).join('') || '<p class="muted">今日は手渡しで話せた人がいませんでした。</p>'}</div>
      </div>
    </div>
    <h3>改善ショップ</h3>
    <div class="shop">${UPGRADES.map(u => `<div class="shop-item ${hasUp(u.id) ? 'owned' : ''}"><h4>${u.name}<span>${hasUp(u.id) ? '購入済み' : yen(u.price)}</span></h4><p>${u.desc}</p>${hasUp(u.id) ? '' : `<button class="btn primary small" data-buy="${u.id}" ${s.money < u.price ? 'disabled' : ''}>買う</button>`}</div>`).join('')}</div>
    <div class="row end"><button class="btn" id="to-title">タイトルへ</button><button class="btn go big" id="next-day">${s.day + 1}日目へ</button></div>
  </div>`;
  el.classList.add('show');
  $$('[data-buy]', el).forEach(b => b.onclick = () => { const u = UPGRADES.find(x => x.id === b.dataset.buy); if (s.money < u.price) return; s.money -= u.price; s.upgrades[u.id] = true; writeSave(); sfx('ok'); showResult(); });
  $('#next-day').onclick = () => { s.day++; writeSave(); el.classList.remove('show'); startDay(); };
  $('#to-title').onclick = () => { el.classList.remove('show'); showTitle(); };
  if (R.levelUp) setTimeout(() => sfx('levelup', 0.4), 800);
}

// =========================================================
// タイトル・朝礼
// =========================================================
export function showTitle() {
  G.mode = 'title'; G.overlay = 'title';
  ctx.camera.position.set(-28.2, 1.75, 146);
  ctx.camera.lookAt(-31, 2.4, 96);
  const saved = loadSave();
  const el = $('#screen');
  el.innerHTML = `<div class="screen-card title">
    <div class="kicker">宅配ドライバー・シミュレーター</div>
    <h1>あおば町 宅配日誌</h1>
    <p>地方の町「あおば町」の営業所に配属された新人ドライバーとして、荷物を確認し、軽バンに積み込み、町を走って届けよう。</p>
    <div class="row"><button class="btn go big" id="t-start">${saved ? `続きから（${saved.day}日目）` : '仕事をはじめる'}</button>${saved ? '<button class="btn" id="t-new">はじめから</button>' : ''}</div>
    <table class="keys">
      <tr><td>歩く・見回す</td><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ＋ マウス、走る <kbd>Shift</kbd></td></tr>
      <tr><td>調べる・持つ・置く</td><td><kbd>E</kbd></td></tr>
      <tr><td>車に乗る・降りる</td><td><kbd>F</kbd></td></tr>
      <tr><td>運転</td><td><kbd>W</kbd> アクセル <kbd>S</kbd> ブレーキ <kbd>A</kbd><kbd>D</kbd> ハンドル <kbd>Space</kbd> サイドブレーキ <kbd>C</kbd> 視点</td></tr>
      <tr><td>タブレット（伝票・地図・荷台）</td><td><kbd>Tab</kbd></td></tr>
    </table>
    <p class="muted small">画面をクリックするとマウスで視点を動かせます（Esc で解除）。</p>
  </div>`;
  el.classList.add('show');
  $('#t-start').onclick = () => { G.save = saved || defaultSave(); writeSave(); el.classList.remove('show'); startDay(); };
  const n = $('#t-new'); if (n) n.onclick = () => { if (!confirm('セーブデータを消して、はじめからにしますか？')) return; G.save = defaultSave(); writeSave(); el.classList.remove('show'); startDay(); };
}

function startDay() {
  G.overlay = null;
  newDay();
  sfx('morning', 0.35);
  const d = G.day, s = G.save;
  dialog({
    title: `朝礼　${s.day}日目`,
    text: (s.day === 1 ? '所長の大野だ。今日からよろしく頼むよ。\n' : 'おはよう。今日も安全運転でいこう。\n') +
      `今日の荷物は${d.parcels.length}個、天気は${d.weather}。\n\n` +
      '① 作業台の荷物を見て伝票を確認（E で持つ）。わかば町の荷物は「仕分け戻し」のカゴへ。\n' +
      '② 車の後ろ（リアハッチ）か左のスライドドアから、荷台の棚や床に積む。先に配る物は扉の近く、重い物とワレモノは床、クール便は保冷ボックス。\n' +
      '③ Tab のタブレットで配達順を決めて、運転席（F）から出発。\n' +
      '④ 配達先ではインターホンを押して、出てきた人に手渡し。留守なら置き配か不在票。',
    choices: [{ label: '仕事をはじめる', use: closeDialog }],
  });
}

// =========================================================
// 入力
// =========================================================
export function onKey(code, down) {
  G.keys[code] = down;
  if (!down || !G.day || G.mode === 'title' || G.mode === 'ui') return;
  if (code === 'Tab') { if (G.overlay === 'tablet') closeTablet(); else if (!G.overlay) openTablet(G.tab || 'list'); return; }
  if (G.overlay) return;
  const van = ctx.van;
  if (G.mode === 'walk') {
    if (code === 'KeyE' && G.focus && G.focus.label && G.focus.use) { G.focus.use(); }
    if (code === 'KeyF') {
      const dd = van.driverDoor();
      if (Math.hypot(dd.x - ctx.player.x, dd.z - ctx.player.z) < 2.2) enterVan();
    }
  } else if (G.mode === 'drive') {
    if (code === 'KeyF') exitVan();
    if (code === 'KeyC') G.view = G.view === 'cab' ? 'chase' : 'cab';
    if (code === 'KeyQ') { van.signal = van.signal === 1 ? 0 : 1; sfx('tick', 0.3); }
    if (code === 'KeyE') { van.signal = van.signal === -1 ? 0 : -1; sfx('tick', 0.3); }
    if (code === 'KeyH') van.hazard = !van.hazard;
    if (code === 'KeyL') van.lightsOn = !van.lightsOn;
  }
}
export function onMouse(dx, dy) {
  if (G.overlay || !G.day) return;
  const sens = G.save ? G.save.sens : 1;
  if (G.mode === 'walk') ctx.player.look(dx, dy, sens);
  else if (G.mode === 'drive') {
    G.look.yaw = THREE.MathUtils.clamp(G.look.yaw - dx * 0.002 * sens, -1.9, 1.9);
    G.look.pitch = THREE.MathUtils.clamp(G.look.pitch - dy * 0.002 * sens, -0.7, 0.5);
  }
}

// =========================================================
// 毎フレームの更新
// =========================================================
const marker = { mesh: null };
export function initGame(c) {
  ctx = c;
  // 動作確認用（ブラウザのコンソールから呼べる）
  G.dbg = { candidates, pickUp, putInVan, takeFromVan, dropToCrate, ring, handOver, okihai, leaveSlip, finishDay, enterVan, exitVan, P, nextStop, cargoIssues };
  ctx.player.onStep = () => sfx('step' + Math.floor(Math.random() * 4), 0.18);
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: 0x3fbf6a, emissive: 0x1f7f3a, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }));
  m.scale.y = 1.6;
  ctx.scene.add(m); marker.mesh = m;
  showTitle();
}

export function update(dt) {
  G.realT += dt;
  const d = G.day;
  if (!d) return;
  const van = ctx.van;
  for (const t of G.timers.slice()) if (G.realT >= t.t) { G.timers.splice(G.timers.indexOf(t), 1); t.fn(); }
  const paused = !!G.overlay;
  if (!paused) {
    if (G.mode === 'drive') {
      van.update(dt, driveInput(), ctx.traffic.cars);
      if (G.day.time >= 17.5 * 60 && !van.lightsOn && !d.autoLight) { d.autoLight = true; van.lightsOn = true; }
      checkDeparture();
      checkDriving(dt);
      van.drawMeter();
    } else {
      van.update(dt, { throttle: 0, brake: 0, steer: 0, handbrake: true }, []);
      ctx.player.update(dt, G.keys, van, G.carrying.some(id => P(id).weight >= 3) && !hasUp('cart') ? 0.75 : 1);
    }
    ctx.traffic.update(dt, van, updateLights(d.time / 60));
    updateTime(dt);
    // 玄関のドア
    for (const lot of T.lotList) {
      for (const dd of lot.doors) {
        dd.open += (dd.target - dd.open) * Math.min(1, dt * 3);
        dd.obj.rotation.y = lot.rot + dd.sign * dd.open * 1.3;
      }
      if (lot.visit && lot.visit.expires && G.realT > lot.visit.expires && lot.visit.stage === 'home') { lot.visit = null; for (const dd of lot.doors) dd.target = 0; }
    }
  }
  updateSignals(G.realT);
  // カメラ
  if (G.mode === 'drive') {
    const cam = ctx.camera;
    if (G.view === 'cab') {
      cam.position.copy(van.cabEye());
      // 車の前は +z、カメラは -z を向くので heading + π
      cam.rotation.set(G.look.pitch, van.heading + Math.PI + G.look.yaw, 0, 'YXZ');
    } else {
      const f = van.forward;
      const ang = van.heading + G.look.yaw;
      const fx = Math.sin(ang), fz = Math.cos(ang);
      const target = new THREE.Vector3(van.x - fx * 7.5, 3.3, van.z - fz * 7.5);
      cam.position.lerp(target, Math.min(1, dt * 5));
      cam.lookAt(van.x + f.x * 2, 1.2, van.z + f.z * 2);
    }
    updateEngine(true, van.speed, driveInput().throttle);
  } else if (G.mode === 'walk') ctx.player.apply();
  // 目的地のマーカー
  const next = nextStop();
  if (next && d.departed) {
    const lot = T.lots[next];
    const pt = lot.points.intercom || lot.points.front;
    marker.mesh.visible = true;
    marker.mesh.position.set(pt.x, (pt.y > 2 ? 3 : 0) + 3.2 + Math.sin(G.realT * 2) * 0.15, pt.z);
    marker.mesh.rotation.y = G.realT;
  } else marker.mesh.visible = false;
  pickFocus();
  updateHud();
  drawMinimap();
}

export { closeTablet, openTablet };
