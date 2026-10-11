// あおば町 宅配日誌 — ゲーム本体
'use strict';

// =========================================================
// ユーティリティ
// =========================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const fmt = (m) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
const mins = (m) => `${Math.max(0, Math.round(m))}分`;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let rand = Math.random;
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (a) => a[Math.floor(rand() * a.length)];
const chance = (p) => rand() < p;
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const resident = (id) => DATA.RESIDENTS.find(r => r.id === id);
const hasUp = (id) => !!G.save.upgrades[id];

// =========================================================
// 音
// =========================================================
const SFX = {
  click: 'click_002', select: 'select_001', ok: 'confirmation_001', ok2: 'confirmation_002', err: 'error_004',
  drop: 'drop_002', lift: 'drop_003', open: 'open_001', close: 'close_001', q: 'question_001', tick: 'tick_002',
  bell: 'bong_001', pluck: 'pluck_001', scratch: 'scratch_001',
  morning: 'jingle_morning', result: 'jingle_result', levelup: 'jingle_levelup',
};
const audioCache = {};
function sfx(name, vol = 0.45) {
  if (!G.sound || !SFX[name]) return;
  try {
    const src = 'assets/sfx/' + SFX[name] + '.ogg';
    const a = (audioCache[name] && audioCache[name].paused) ? audioCache[name] : new Audio(src);
    audioCache[name] = a;
    a.volume = vol; a.currentTime = 0;
    a.play().catch(() => {});
  } catch (e) { /* 音が鳴らせない環境でも続行 */ }
}

// =========================================================
// 状態とセーブ
// =========================================================
const SAVE_KEY = 'aoba-delivery-save-v1';
const G = { save: null, day: null, sound: true, ui: {} };

function defaultSave() {
  return { day: 1, money: 0, exp: 0, level: 1, upgrades: {}, visits: {}, totalDelivered: 0, history: [], seed: Math.floor(Math.random() * 1e9) };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.day) return Object.assign(defaultSave(), s);
  } catch (e) { /* 読み込めなければ新規 */ }
  return null;
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* 保存できない環境 */ } }

// =========================================================
// 1日の生成
// =========================================================
let serial = 0;
function trackingNo() { return `${randint(1000, 9999)}-${randint(1000, 9999)}-${randint(1000, 9999)}`; }

function makeParcel(rid, itemName, windowKey, opts = {}) {
  const r = resident(rid);
  const it = DATA.ITEMS.find(i => i.name === itemName) || DATA.ITEMS[0];
  const b = TOWN.building(r.b);
  let okihai = r.okihai;
  if (it.flags.includes('cool') || opts.noOkihai) okihai = null;
  const tooBig = okihai && it.size >= 120 && ['宅配ボックス', 'メーターボックス'].includes(okihai);
  if (tooBig) okihai = null;
  return {
    id: 'P' + (++serial), no: trackingNo(), rid: r.id, bid: r.b, room: r.room || null,
    name: r.name, addr: b.addr + (r.room ? `　${b.name} ${r.room}号室` : ''),
    item: it.name, size: it.size, weight: it.weight, flags: it.flags.slice(),
    window: windowKey, okihai, okihaiReason: tooBig ? `大きくて${r.okihai}に入らないため置き配不可` : opts.noOkihai ? '差出人の指定により置き配不可' : (it.flags.includes('cool') ? 'クール便は置き配できません' : (r.okihai ? '' : '受取人の希望により置き配不可')),
    sender: opts.sender || pick(DATA.SENDERS), senderNoOkihai: !!opts.noOkihai,
    status: 'office', checked: false, misrouted: false, damaged: false, warm: false, loc: null, attempts: 0,
  };
}

function misroutedParcel() {
  const names = ['前田 和子', '藤井 修', '村上 千尋', '坂本 光', '石田 美穂'];
  const it = pick(DATA.ITEMS.filter(i => !i.flags.includes('cool')));
  return {
    id: 'P' + (++serial), no: trackingNo(), rid: null, bid: null, room: null,
    name: pick(names), addr: `わかば町${randint(1, 4)}-${randint(1, 6)}-${randint(1, 12)}`,
    item: it.name, size: it.size, weight: it.weight, flags: it.flags.slice(),
    window: chance(0.5) ? pick(['am', 'w1416', 'w1618']) : 'none', okihai: null, okihaiReason: '',
    sender: pick(DATA.SENDERS), status: 'office', checked: false, misrouted: true, damaged: false, warm: false, loc: null, attempts: 0,
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
  const good = keys.filter(k => { const w = DATA.WINDOWS[k]; return presenceAt(r, (w.from + w.to) / 2) >= 0.6; });
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
    makeParcel('takahashi', '生鮮セット（産地直送）', 'w1820', { sender: 'ハルカゼ食品' }),
    makeParcel('kobayashi', '工具セット', 'w1618'),
    makeParcel('ito', 'ドッグフード', 'none'),
    makeParcel('nakamura', '墨と半紙', 'none'),
  ];
}

function randomParcels(n) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const r = pick(DATA.RESIDENTS);
    const same = out.filter(p => p.rid === r.id).length;
    if (same >= 2 || (same === 1 && chance(0.75))) continue;
    const fav = DATA.FAVORITES[r.id];
    const itemName = fav && chance(0.6) ? pick(fav) : pick(DATA.ITEMS).name;
    const it = DATA.ITEMS.find(i => i.name === itemName);
    const valuable = ['タブレット', '電子レンジ', 'ワイン 2本'].includes(itemName);
    const win = chance(0.5) ? pickWindowFor(r) : 'none';
    out.push(makeParcel(r.id, it.name, win, { noOkihai: valuable && chance(0.5) }));
  }
  // クール便は保冷ボックスの容量まで
  const cap = hasUp('cooler') ? 4 : 2;
  let cool = 0;
  for (const p of out) if (p.flags.includes('cool') && ++cool > cap) { p.flags = p.flags.filter(f => f !== 'cool'); p.okihaiReason = p.okihaiReason === 'クール便は置き配できません' ? '受取人の希望により置き配不可' : p.okihaiReason; }
  return out;
}

function newDay() {
  const s = G.save;
  rand = seeded(s.seed + s.day * 7919);
  serial = 0;
  const parcels = s.day === 1 ? tutorialParcels() : randomParcels(DATA.parcelsForLevel(s.level));
  parcels.push(misroutedParcel());
  shuffle(parcels);
  const segs = TOWN.SEGMENTS;
  const planned = s.day === 1 ? segs.find(x => x.id === 'v3b') : pick(segs);
  const incidentSeg = pick(segs.filter(x => x !== planned));
  const weathers = ['晴れ', '晴れ', 'くもり', 'くもり時々晴れ', '小雨'];
  G.day = {
    phase: 'check', time: DATA.START_TIME, parcels, route: [],
    cargo: { cols: [[], [], [], [], [], []], cooler: [], shelf: [], front: [] },
    planned, incident: { seg: incidentSeg, at: 12 * 60 + 40 + randint(0, 70), fired: false },
    van: { x: 6, y: 5, fx: 6, fy: 5, dir: 'right' },
    log: [], memories: [], calls: [], weather: pick(weathers),
    stats: { misdelivery: 0, damaged: 0, violations: [], issues: [], redeliveryDone: 0 },
    overtimeWarned: false, departed: false, driving: null,
  };
  G.ui = { selected: parcels[0].id, hover: null };
}

// =========================================================
// 荷台（積み込み）
// =========================================================
const COL_CAP = 3;
const units = (p) => (p.size >= 120 ? 2 : 1);
const colUnits = (col) => col.reduce((a, id) => a + units(P(id)), 0);
const P = (id) => G.day.parcels.find(p => p.id === id);
const coolerCap = () => (hasUp('cooler') ? 4 : 2);
const shelfCap = () => (hasUp('shelf') ? 4 : 0);
const COL_NAMES = ['扉側', '2列目', '3列目', '4列目', '5列目', '一番奥'];

function canPlace(p, area, i) {
  const c = G.day.cargo;
  if (area === 'col') return colUnits(c.cols[i]) + units(p) <= COL_CAP;
  if (area === 'cooler') return c.cooler.length < coolerCap() && p.size <= 100;
  if (area === 'shelf') return c.shelf.length < shelfCap() && p.size <= 80;
  return false;
}
function canPlaceReason(p, area, i) {
  if (canPlace(p, area, i)) return '';
  if (area === 'cooler' && p.size > 100) return '保冷ボックスに入るのは100サイズまでです。';
  if (area === 'shelf' && p.size > 80) return '棚に置けるのは80サイズまでです。';
  return 'そこはもういっぱいです。';
}

function place(p, area, i) {
  const c = G.day.cargo;
  if (area === 'col') { c.cols[i].push(p.id); p.loc = { area, i }; }
  else { c[area].push(p.id); p.loc = { area }; }
  p.status = 'loaded';
}
function unplace(p) {
  const c = G.day.cargo;
  if (!p.loc) return;
  if (p.loc.area === 'col') c.cols[p.loc.i] = c.cols[p.loc.i].filter(id => id !== p.id);
  else c[p.loc.area] = c[p.loc.area].filter(id => id !== p.id);
  p.loc = null;
}
function isTop(p) {
  if (!p.loc || p.loc.area !== 'col') return true;
  const col = G.day.cargo.cols[p.loc.i];
  return col[col.length - 1] === p.id;
}
function aboveOf(p) {
  if (!p.loc || p.loc.area !== 'col') return [];
  const col = G.day.cargo.cols[p.loc.i];
  return col.slice(col.indexOf(p.id) + 1).map(P);
}
function stackIndex(p) {
  if (!p.loc || p.loc.area !== 'col') return 0;
  return G.day.cargo.cols[p.loc.i].indexOf(p.id);
}

function retrieveCost(p) {
  if (!p.loc) return 0.5;
  if (p.loc.area === 'front' || p.loc.area === 'shelf') return 0.5;
  if (p.loc.area === 'cooler') return 1;
  const per = hasUp('gloves') ? 1.0 : 1.5;
  return 0.5 + p.loc.i * 0.6 + aboveOf(p).length * per + (p.flags.includes('heavy') && stackIndex(p) > 0 ? 1 : 0);
}

function loadIssues() {
  const out = [];
  for (const p of G.day.parcels) {
    if (p.status !== 'loaded') continue;
    const above = aboveOf(p);
    if ((p.flags.includes('fragile') || p.flags.includes('upright')) && above.length) {
      const heavy = above.some(a => a.weight >= 3);
      out.push({ p, kind: heavy ? 'crush' : 'stack', text: `${p.name}様の「${p.item}」（${p.flags.includes('fragile') ? 'ワレモノ' : '天地無用'}）の上に荷物が載っています${heavy ? '。重い荷物で割れるおそれ！' : '。'}` });
    }
    if (p.flags.includes('heavy') && stackIndex(p) > 0) out.push({ p, kind: 'heavyTop', text: `重量物「${p.item}」が上段にあります。荷崩れの危険があります。` });
    if (p.flags.includes('cool') && p.loc.area !== 'cooler') out.push({ p, kind: 'warm', text: `クール便「${p.item}」が保冷ボックスに入っていません。` });
  }
  return out;
}

// =========================================================
// 地図・ルート
// =========================================================
function knownClosures() {
  const segs = [G.day.planned];
  if (G.day.incident.fired) segs.push(G.day.incident.seg);
  return segs;
}
function closureSet() {
  const s = new Set();
  for (const seg of knownClosures()) TOWN.segmentTiles(seg).forEach(k => s.add(k));
  return s;
}
const OFFICE = () => TOWN.building('office');

// その建物で、まだ届けられる荷物
function pendingAt(bid) {
  return G.day.parcels.filter(p => p.bid === bid && ['loaded', 'carry', 'redeliver', 'office'].includes(p.status) && !(p.status === 'office' && G.day.departed));
}
function deliverableAt(bid) {
  return G.day.parcels.filter(p => p.bid === bid && ['loaded', 'carry', 'redeliver'].includes(p.status));
}
function stopBuildings() {
  const ids = [];
  for (const p of G.day.parcels) {
    if (!p.bid) continue;
    if (G.day.departed ? ['loaded', 'carry', 'redeliver', 'delivered'].includes(p.status) : ['loaded', 'office'].includes(p.status)) {
      if (!ids.includes(p.bid)) ids.push(p.bid);
    }
  }
  return ids;
}

function walkMinutes(b, p) {
  let m = { house: 1, shop: 1, apart: 2, mansion: 3, office: 0 }[b.kind] || 1;
  if (p && p.room && p.room[0] >= '2' && b.kind === 'apart') m += 1;
  if (p && p.size >= 120 && !hasUp('cart')) m += 2;
  else if (p && p.weight >= 3 && !hasUp('cart')) m += 1;
  return m;
}
function estHandling(b, ps) {
  let m = 1;
  ps.forEach((p, i) => { m += retrieveCost(p) + walkMinutes(b, p) * (i > 0 && hasUp('cart') ? 0.5 : 1) + 2; });
  return m;
}

function windowState(p, t) {
  const w = DATA.WINDOWS[p.window];
  if (!w || w.from == null) return 'none';
  if (t < w.from) return 'early';
  if (t > w.to) return 'late';
  return 'ok';
}

function simulateRoute(route, startPos, startTime) {
  let pos = startPos, t = startTime;
  const closures = closureSet();
  const app = hasUp('mapapp');
  const legs = [];
  for (const bid of route) {
    const b = TOWN.building(bid);
    const path = TOWN.findPath(pos, b.stop, { closures, congestion: app, time: t });
    if (!path) { legs.push({ bid, unreachable: true }); continue; }
    const drive = app ? TOWN.pathMinutes(path, t) : (path.length - 1) * DATA.MIN_PER_TILE;
    t += drive;
    const ps = G.day.departed ? deliverableAt(bid) : pendingAt(bid);
    let arrive = t, wait = 0;
    const earliest = Math.min(...ps.map(p => (DATA.WINDOWS[p.window].from ?? 0)));
    if (ps.length && ps.every(p => DATA.WINDOWS[p.window].from != null) && earliest > t) { wait = earliest - t; t = earliest; }
    const states = ps.map(p => windowState(p, t));
    legs.push({ bid, path, arrive, wait, drive, ps, states, tiles: path.length - 1 });
    t += estHandling(b, ps);
    pos = b.stop;
  }
  const back = TOWN.findPath(pos, OFFICE().stop, { closures, congestion: app, time: t });
  const backMin = back ? (app ? TOWN.pathMinutes(back, t) : (back.length - 1) * DATA.MIN_PER_TILE) : 0;
  return { legs, backPath: back, end: t + backMin };
}

// =========================================================
// 画面共通
// =========================================================
function setPhase(ph) {
  G.day.phase = ph;
  render();
}

function updateHud() {
  const s = G.save, d = G.day;
  $('#hud-day').textContent = `${s.day}日目`;
  $('#hud-time').textContent = d ? fmt(d.time) : '--:--';
  $('#hud-money').textContent = yen(s.money);
  $('#hud-level').textContent = s.level;
  const lo = DATA.LEVELS[s.level - 1] || 0, hi = DATA.LEVELS[s.level] || lo + 1000;
  $('#hud-xp').style.width = Math.min(100, (s.exp - lo) / (hi - lo) * 100) + '%';
  $('.hud-item.clock').classList.toggle('overtime', !!d && d.time >= DATA.SHIFT_END);
  const order = ['check', 'load', 'route', 'drive', 'result'];
  const cur = d ? (d.phase === 'shop' ? 'result' : d.phase) : null;
  $$('#steps li').forEach(li => {
    const st = li.dataset.step;
    li.classList.toggle('active', st === cur);
    li.classList.toggle('done', cur && order.indexOf(st) < order.indexOf(cur));
    li.classList.toggle('clickable', !!d && !d.departed && ['check', 'load', 'route'].includes(st) && ['check', 'load', 'route'].includes(cur));
  });
}

function toast(msg, kind = '', ms = 4200) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, ms);
  setTimeout(() => el.remove(), ms + 400);
}

function log(msg, kind = '') {
  G.day.log.unshift({ t: G.day.time, msg, kind });
}

function modal(html, opts = {}) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${opts.narrow ? 'narrow' : ''}">${html}</div>`;
  $('#modal-root').appendChild(back);
  return back.firstElementChild;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function parcelIcon(p) { return p.size <= 60 ? 605 : p.size <= 80 ? 642 : p.size <= 100 ? 606 : 643; }

function tagsHtml(p, opts = {}) {
  const w = DATA.WINDOWS[p.window];
  const t = [];
  t.push(`<span class="tag time">${p.redeliver ? '再配達 ' : ''}${w.label}</span>`);
  t.push(`<span class="tag size">${p.size}サイズ</span>`);
  for (const f of p.flags) t.push(`<span class="tag ${DATA.FLAG_LABEL[f].cls}" title="${DATA.FLAG_LABEL[f].tip}">${DATA.FLAG_LABEL[f].label}</span>`);
  if (!opts.noOkihai) t.push(p.okihai ? `<span class="tag okihai-ok">置き配可：${p.okihai}</span>` : `<span class="tag okihai-ng">置き配不可</span>`);
  if (p.rid && hasUp('notify')) {
    const r = resident(p.rid);
    t.push(`<span class="tag home" title="在宅お知らせサービス">在宅：${homeHint(r)}</span>`);
  }
  if (p.rid && (G.save.visits[p.rid] || 0) >= 2) t.push(`<span class="tag" title="何度も届けている受取人">常連</span>`);
  return t.join('');
}
function homeHint(r) {
  const hs = r.home.filter(h => h[2] >= 0.8).map(([a, b]) => (a <= 0 ? '' : fmt(a * 60)) + '〜' + (b >= 24 ? '' : fmt(b * 60)));
  if (r.awayRate >= 0.8) return 'ほぼ在宅';
  return hs.join('・') || '不定';
}

function paintIcons(root = document) {
  $$('canvas[data-tile]', root).forEach(c => TOWN.drawTileIcon(c, +c.dataset.tile));
  $$('canvas[data-face]', root).forEach(c => {
    const r = c.dataset.face === 'boss' ? { face: [1, 6, [8, 4], [19, 8]] } : resident(c.dataset.face);
    TOWN.drawFace(c, r ? r.face : null);
  });
}

// =========================================================
// 描画ルーター
// =========================================================
function render() {
  updateHud();
  const ph = G.day ? G.day.phase : 'title';
  const scr = $('#screen');
  ({ title: renderTitle, check: renderCheck, load: renderLoad, route: renderRoute, drive: renderDrive, result: renderResult })[ph](scr);
  paintIcons(scr);
}

// ---------------------------------------------------------
// タイトル
// ---------------------------------------------------------
function renderTitle(scr) {
  const saved = loadSave();
  scr.innerHTML = `
  <div class="title-screen">
    <div class="panel title-card">
      <canvas id="title-map"></canvas>
      <div class="tc-body">
        <h1>あおば町 宅配日誌</h1>
        <p>あなたは「あおば運輸」に入ったばかりの新人ドライバー。<br>
        営業所で荷物を受け取り、積み方と回る順番を考えて、あおば町の人たちに届けましょう。</p>
        <p class="muted">荷物確認 → 積み込み → ルート計画 → 配達 → 結果、の5つの手順で1日が進みます。</p>
        <div class="tc-btns">
          ${saved ? `<button class="btn primary big" id="btn-continue">続きから（${saved.day}日目）</button>` : ''}
          <button class="btn ${saved ? '' : 'primary'} big" id="btn-new">${saved ? 'はじめから' : '仕事をはじめる'}</button>
        </div>
      </div>
    </div>
  </div>`;
  const c = $('#title-map');
  c.width = TOWN.W * TOWN.T * TOWN.SCALE; c.height = TOWN.H * TOWN.T * TOWN.SCALE;
  TOWN.render(c.getContext('2d'), { time: 9 * 60, pins: [], van: { fx: 6, fy: 5, dir: 'right' } });
  if (saved) $('#btn-continue').onclick = () => { sfx('click'); G.save = saved; startDay(); };
  $('#btn-new').onclick = () => {
    if (saved && !confirm('セーブデータを消して、はじめからにしますか？')) return;
    sfx('click'); G.save = defaultSave(); writeSave(); startDay();
  };
}

function startDay() {
  newDay();
  render();
  morningBriefing();
}

function morningBriefing() {
  const d = G.day, s = G.save;
  const real = d.parcels.length;
  const notes = [
    `本日の天気は<b>${d.weather}</b>。荷物は<b>${real}個</b>だ。`,
    `<b>${d.planned.name}</b>は道路工事で終日通行止め。地図の赤い区間は通れないぞ。`,
    `昼の12時台と夕方17時台は<b>あおば商店街通り</b>が混む。朝9時台は<b>駅前通り（北）</b>も混みやすい。`,
  ];
  if (s.day === 1) {
    notes.push('初日だから手順を確認しよう。まず<b>荷物確認</b>で伝票を1枚ずつ見ること。たまに<b>担当エリア外</b>の荷物が混ざっているから、見つけたら仕分けに戻してくれ。');
    notes.push('積み込みは<b>先に配る荷物を扉側・上</b>に。ワレモノの上に物を載せない、重い物は下、クール便は保冷ボックスへ。');
  } else {
    const tips = ['時間指定の荷物は、指定時間の少し前に着くように組むと待ち時間が少なくて済む。', '不在だったら置き配の可否を伝票でよく確認するんだぞ。', '同じ苗字の家が並んでいるところは番地をよく確かめること。', '再配達の電話が入ったら、ルートに組み込み直そう。'];
    notes.push(pick(tips));
  }
  const m = modal(`
    <div class="modal-head"><h3>朝礼</h3><span class="mh-sub">${s.day}日目　8:45　あおば町営業所</span></div>
    <div class="modal-body">
      <div class="speech"><canvas width="48" height="48" data-face="boss"></canvas>
        <div><div class="sp-name">所長　大野</div>
        ${s.day === 1 ? 'おはよう、今日からよろしく頼むよ。あおば町はいい町だ。住んでいる人の顔を覚えると、仕事がぐっと楽しくなる。' : 'おはよう。今日も安全運転でいこう。'}</div>
      </div>
      <ul class="issues">${notes.map(n => `<li class="info">${n}</li>`).join('')}</ul>
    </div>
    <div class="modal-foot"><button class="btn primary" id="mb-ok">荷物確認をはじめる</button></div>`, { narrow: true });
  paintIcons(m);
  sfx('morning', 0.35);
  $('#mb-ok').onclick = () => { sfx('click'); closeModal(); };
}

// ---------------------------------------------------------
// 1. 荷物確認
// ---------------------------------------------------------
function renderCheck(scr) {
  const d = G.day;
  const sel = P(G.ui.selected) || d.parcels[0];
  const checked = d.parcels.filter(p => p.checked).length;
  scr.innerHTML = `
  <div class="guide"><img src="assets/icons/information.png" alt="">
    <div><b>手順1：荷物確認</b>　伝票を1枚ずつ見て「確認OK」を押しましょう。宛先が<b>あおば町以外</b>の荷物は「担当エリア外」として仕分けに戻します。
    時間指定・サイズ・取扱注意・置き配の可否は、このあとの積み込みとルート計画で大事になります。</div></div>
  <div class="layout">
    <div class="panel">
      <div class="panel-head"><h2>本日の荷物</h2><span class="muted">${checked} / ${d.parcels.length} 確認済み</span></div>
      <div class="panel-body"><div class="parcel-list">${d.parcels.map(p => parcelCard(p, { check: true })).join('')}</div></div>
      <div class="panel-foot">
        <button class="btn small" id="btn-checkall">残りをまとめて確認</button>
        <span class="spacer"></span>
        <button class="btn primary" id="btn-to-load" ${checked < d.parcels.length ? 'disabled' : ''}>積み込みへ進む →</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>伝票</h2><span class="muted">伝票番号 ${sel.no}</span></div>
      <div class="panel-body">${slipHtml(sel)}</div>
      <div class="panel-foot">
        ${sel.status === 'aside'
          ? `<button class="btn" id="btn-unaside">仕分けに戻すのをやめる</button>`
          : `<button class="btn warn" id="btn-aside">担当エリア外として仕分けに戻す</button>`}
        <button class="btn go" id="btn-checkone">${sel.checked ? '確認済み ✓　次の伝票へ' : '確認OK'}</button>
      </div>
    </div>
  </div>`;
  bindParcelCards(scr, (p) => { G.ui.selected = p.id; sfx('select'); render(); });
  const next = () => {
    const n = d.parcels.find(p => !p.checked);
    if (n) G.ui.selected = n.id;
  };
  $('#btn-checkone').onclick = () => { sel.checked = true; sfx('tick'); next(); render(); };
  const asideBtn = $('#btn-aside');
  if (asideBtn) asideBtn.onclick = () => { sel.status = 'aside'; sel.checked = true; sfx('drop'); next(); render(); toast(`「${esc(sel.name)}様」の荷物を仕分けに戻しました。`, 'info'); };
  const un = $('#btn-unaside');
  if (un) un.onclick = () => { sel.status = 'office'; sfx('click'); render(); };
  $('#btn-checkall').onclick = () => { d.parcels.forEach(p => p.checked = true); sfx('tick'); render(); };
  $('#btn-to-load').onclick = () => { sfx('click'); G.ui.selected = null; setPhase('load'); };
}

function parcelCard(p, opts = {}) {
  const ord = G.day.route.indexOf(p.bid);
  const showOrd = opts.order && ord >= 0;
  const cls = ['parcel', p.checked && opts.check ? 'checked' : '', p.status === 'aside' ? 'aside' : '', G.ui.selected === p.id ? 'selected' : ''].join(' ');
  let side = '';
  if (opts.check) side = p.status === 'aside' ? '<span class="tag warn">エリア外</span>' : `<div class="check-mark ${p.checked ? 'on' : ''}">${p.checked ? '<img src="assets/icons/checkmark.png" alt="">' : ''}</div>`;
  if (opts.load) side = `<span class="tag">${p.size >= 120 ? '2段分' : '1段分'}</span>`;
  return `<div class="${cls}" data-pid="${p.id}">
    ${showOrd ? `<div class="order-badge">${ord + 1}</div>` : ''}
    <canvas width="40" height="40" data-tile="${parcelIcon(p)}"></canvas>
    <div>
      <div class="p-top"><span class="p-name">${esc(p.name)} 様</span></div>
      <div class="p-addr">${esc(p.addr)}</div>
      <div class="p-item">${esc(p.item)}</div>
      <div class="p-tags">${tagsHtml(p, { noOkihai: opts.load })}</div>
    </div>
    <div class="p-side">${side}</div>
  </div>`;
}
function bindParcelCards(root, fn) {
  $$('.parcel', root).forEach(el => el.onclick = () => fn(P(el.dataset.pid)));
}

function slipHtml(p) {
  const w = DATA.WINDOWS[p.window];
  const r = p.rid ? resident(p.rid) : null;
  const b = p.bid ? TOWN.building(p.bid) : null;
  const flags = p.flags.map(f => `<span class="tag ${DATA.FLAG_LABEL[f].cls}">${DATA.FLAG_LABEL[f].label}</span>　<span class="muted">${DATA.FLAG_LABEL[f].tip}</span>`).join('<br>') || '<span class="muted">なし</span>';
  let note = '';
  if (r && r.absentNote && (G.save.visits[r.id] || 0) >= 1) note = `<div class="slip-note">メモ（前回の配達より）：${r.absentNote}</div>`;
  if (hasUp('mapapp') && b && b.hiddenEntrance) note += `<div class="slip-note">まちナビ入口メモ：表の門は開かない。裏の勝手口から。</div>`;
  if (p.status === 'aside') note += `<div class="slip-note alert">この荷物は仕分けに戻します（積み込みません）。</div>`;
  return `<div class="slip">
    <div class="slip-head"><span class="slip-title">宅配便　お届け伝票</span><canvas width="32" height="32" data-tile="${parcelIcon(p)}"></canvas></div>
    <table>
      <tr><th>お届け先</th><td><div class="big">${esc(p.name)} 様</div>${esc(p.addr)}${b ? `<div class="muted">${esc(b.name)}</div>` : ''}</td></tr>
      <tr><th>品名</th><td>${esc(p.item)}<span class="muted">　（ご依頼主：${esc(p.sender)}）</span></td></tr>
      <tr><th>時間指定</th><td><span class="tag time">${w.label}</span></td></tr>
      <tr><th>サイズ</th><td>${p.size}サイズ　<span class="muted">${p.weight >= 3 ? '重い' : p.weight === 2 ? 'ふつう' : '軽い'}</span></td></tr>
      <tr><th>取扱注意</th><td>${flags}</td></tr>
      <tr><th>置き配</th><td>${p.okihai ? `<span class="tag okihai-ok">可</span>　指定場所：<b>${p.okihai}</b>` : `<span class="tag okihai-ng">不可</span>　<span class="muted">${esc(p.okihaiReason || '')}</span>`}</td></tr>
      ${r && hasUp('notify') ? `<tr><th>在宅予定</th><td>${homeHint(r)}</td></tr>` : ''}
    </table>
    ${note}
  </div>`;
}

// ---------------------------------------------------------
// 2. 積み込み
// ---------------------------------------------------------
function renderLoad(scr) {
  const d = G.day;
  const waiting = d.parcels.filter(p => p.status === 'office').sort((a, b) => orderOf(a) - orderOf(b));
  if (!P(G.ui.selected) || P(G.ui.selected).status === 'aside') G.ui.selected = waiting[0] ? waiting[0].id : null;
  const sel = P(G.ui.selected);
  const issues = loadIssues();
  const routeSet = d.route.length > 0;
  scr.innerHTML = `
  <div class="guide"><img src="assets/icons/information.png" alt="">
    <div><b>手順2：積み込み</b>　左の荷物を選んで、荷台の列をクリックすると積めます（列の上に重なります）。
    <b>扉側</b>や<b>上の段</b>ほど早く取り出せます。奥や下の荷物は、上の荷物をどかす手間がかかります。
    ${routeSet ? '番号はルート計画の配達順です。' : '先に<b>ルート計画</b>を立ててから積むと、配達順の番号が表示されます（上の手順タブで行き来できます）。'}</div></div>
  <div class="layout">
    <div class="panel">
      <div class="panel-head"><h2>まだ積んでいない荷物</h2><span class="muted">${waiting.length}個</span></div>
      <div class="panel-body"><div class="parcel-list">${waiting.length ? waiting.map(p => parcelCard(p, { load: true, order: true })).join('') : '<div class="muted">すべて積み込みました。</div>'}</div></div>
      <div class="panel-foot">
        <button class="btn" id="btn-back-check">← 荷物確認</button>
        <span class="spacer"></span>
        <button class="btn primary" id="btn-to-route">ルート計画へ →</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>荷台</h2><span class="muted">${sel ? `選択中：<b>${esc(sel.name)}様</b>（${sel.size}サイズ）→ 置き場所をクリック` : '荷台の一番上の荷物をクリックすると降ろせます'}</span></div>
      ${vanHtml({ interactive: true })}
      <div class="panel-body">
        <ul class="issues">
          ${issues.map(i => `<li>${esc(i.text)}</li>`).join('')}
          ${!issues.length && !waiting.length ? '<li class="ok">積み方に問題はありません。</li>' : ''}
          ${waiting.length ? `<li class="info">まだ${waiting.length}個の荷物が積まれていません。積まずに出発すると、その荷物は配達できません。</li>` : ''}
        </ul>
      </div>
    </div>
  </div>`;
  bindParcelCards(scr, (p) => { G.ui.selected = p.id; sfx('select'); render(); });
  bindVan(scr);
  $('#btn-back-check').onclick = () => { sfx('click'); setPhase('check'); };
  $('#btn-to-route').onclick = () => { sfx('click'); setPhase('route'); };
}
function orderOf(p) { const i = G.day.route.indexOf(p.bid); return i < 0 ? 999 : i; }

function boxHtml(p, opts = {}) {
  const ord = G.day.route.indexOf(p.bid);
  const issue = opts.issues && opts.issues.some(i => i.p === p);
  const flags = p.flags.map(f => `<i>${DATA.FLAG_LABEL[f].label}</i>`).join('');
  const cls = ['box', units(p) === 2 && opts.inCol ? 'u2' : '', p.flags.includes('cool') ? 'cool' : '', issue ? 'problem' : '', G.ui.selected === p.id ? 'selected' : '', opts.hl === p.id ? 'hl' : ''].join(' ');
  const surname = p.name.split(' ')[0];
  return `<div class="${cls}" data-box="${p.id}" title="${esc(p.name)}様 / ${esc(p.item)} / 取り出し 約${retrieveCost(p).toFixed(1)}分">
    ${ord >= 0 ? `<span class="b-ord">${ord + 1}</span>` : ''}
    <span class="b-name">${esc(surname)}</span>
    <span class="b-flags">${flags}</span>
    <span class="b-cost">取出 ${retrieveCost(p).toFixed(1)}分</span>
  </div>`;
}

function vanHtml(opts = {}) {
  const c = G.day.cargo;
  const issues = loadIssues();
  const cols = c.cols.map((col, i) => ({ col, i })).reverse(); // 左が奥、右が扉側
  const unit = 44;
  return `<div class="van-wrap" style="--cols:${c.cols.length};--unit:${unit}px">
    <div class="van-labels"><span></span>${cols.map(({ i }) => `<span>${COL_NAMES[i]}</span>`).join('')}<span></span></div>
    <div class="van">
      <div class="van-cab">運転席</div>
      ${cols.map(({ col, i }) => `<div class="van-col ${colUnits(col) >= COL_CAP ? 'full' : ''}" data-col="${i}">${col.map(id => boxHtml(P(id), { inCol: true, issues, hl: opts.hl })).join('')}</div>`).join('')}
      <div class="van-door">後ろの扉</div>
    </div>
    <div class="van-extras">
      <div class="extra cooler" data-area="cooler"><h4><span>保冷ボックス</span><span class="muted">${c.cooler.length}/${coolerCap()}</span></h4>
        <div class="slots">${c.cooler.map(id => boxHtml(P(id), { issues, hl: opts.hl })).join('')}${'<div class="slot-empty"></div>'.repeat(coolerCap() - c.cooler.length)}</div></div>
      <div class="extra ${shelfCap() ? '' : 'locked'}" data-area="shelf"><h4><span>車内の棚</span><span class="muted">${shelfCap() ? `${c.shelf.length}/${shelfCap()}` : '未購入'}</span></h4>
        ${shelfCap() ? `<div class="slots">${c.shelf.map(id => boxHtml(P(id), { issues, hl: opts.hl })).join('')}${'<div class="slot-empty"></div>'.repeat(shelfCap() - c.shelf.length)}</div>` : '<div class="muted" style="font-size:12px">改善ショップで取り付けると、小さい荷物をすぐ取り出せます。</div>'}</div>
      <div class="extra locked" data-area="front"><h4><span>助手席（持ち戻り）</span><span class="muted">${c.front.length}個</span></h4>
        <div class="slots">${c.front.map(id => boxHtml(P(id), { hl: opts.hl })).join('') || '<div class="muted" style="font-size:12px">不在で持ち戻った荷物はここに置きます。</div>'}</div></div>
    </div>
  </div>`;
}

function bindVan(root) {
  $$('.box', root).forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    const p = P(el.dataset.box);
    if (p.loc && p.loc.area === 'front') return;
    if (!isTop(p)) { sfx('err'); toast('上に載っている荷物を先に降ろしてください。', 'bad'); return; }
    unplace(p); p.status = 'office'; G.ui.selected = p.id; sfx('lift'); render();
  });
  const tryPlace = (area, i) => {
    const p = P(G.ui.selected);
    if (!p || p.status !== 'office') { toast('先に左の一覧から荷物を選んでください。', 'info'); return; }
    if (!canPlace(p, area, i)) { sfx('err'); toast(canPlaceReason(p, area, i), 'bad'); return; }
    place(p, area, i); sfx('drop');
    const nxt = G.day.parcels.filter(q => q.status === 'office').sort((a, b) => orderOf(a) - orderOf(b))[0];
    G.ui.selected = nxt ? nxt.id : null;
    render();
  };
  $$('.van-col', root).forEach(el => el.onclick = () => tryPlace('col', +el.dataset.col));
  $$('.extra[data-area="cooler"], .extra[data-area="shelf"]', root).forEach(el => el.onclick = () => { if (!el.classList.contains('locked')) tryPlace(el.dataset.area); });
}

// ---------------------------------------------------------
// 地図の共通処理
// ---------------------------------------------------------
function mountMap(wrap, onClick) {
  const c = document.createElement('canvas');
  c.id = 'map';
  c.width = TOWN.W * TOWN.T * TOWN.SCALE; c.height = TOWN.H * TOWN.T * TOWN.SCALE;
  wrap.appendChild(c);
  const tip = document.createElement('div');
  tip.className = 'map-tip hidden';
  wrap.appendChild(tip);
  c.onmousemove = (e) => {
    const t = TOWN.tileAt(e.clientX, e.clientY, c);
    const b = TOWN.buildingAt(t.x, t.y);
    if (b !== G.ui.hover) { G.ui.hover = b; drawMap(); }
    if (b) {
      const ps = G.day.parcels.filter(p => p.bid === b.id && p.status !== 'aside');
      const wr = wrap.getBoundingClientRect();
      tip.style.left = (e.clientX - wr.left) + 'px'; tip.style.top = (e.clientY - wr.top) + 'px';
      tip.innerHTML = `<b>${esc(b.name)}</b>${b.addr ? `<br>${b.addr}` : ''}${ps.length ? `<br>荷物 ${ps.length}個：${ps.map(p => statusLabel(p)).join('、')}` : ''}`;
      tip.classList.remove('hidden');
    } else tip.classList.add('hidden');
  };
  c.onmouseleave = () => { tip.classList.add('hidden'); G.ui.hover = null; drawMap(); };
  c.onclick = (e) => {
    const t = TOWN.tileAt(e.clientX, e.clientY, c);
    const b = TOWN.buildingAt(t.x, t.y);
    if (b && onClick) onClick(b);
  };
  G.ui.mapCanvas = c;
  drawMap();
}
function statusLabel(p) {
  return { left: '積み残し', office: '未積載', loaded: '配達待ち', delivered: '配達済', carry: '持ち戻り', redeliver: '再配達依頼', aside: 'エリア外' }[p.status] || p.status;
}

function pinsFor() {
  const d = G.day;
  const pins = [{ b: OFFICE(), label: '営', state: 'office', count: 0 }];
  for (const bid of stopBuildings()) {
    const b = TOWN.building(bid);
    const ps = d.parcels.filter(p => p.bid === bid && p.status !== 'aside');
    const idx = d.route.indexOf(bid);
    let state = 'pending';
    if (ps.every(p => p.status === 'delivered')) state = 'done';
    else if (ps.some(p => p.status === 'redeliver')) state = 'redeliver';
    else if (ps.some(p => p.status === 'carry') && !ps.some(p => p.status === 'loaded')) state = 'returned';
    if (d.driving && d.driving.target === bid) state = 'next';
    pins.push({ b, label: state === 'done' ? '✓' : (idx >= 0 ? String(idx + 1) : '・'), state, count: ps.filter(p => p.status !== 'delivered').length });
  }
  return pins;
}

function drawMap() {
  const c = G.ui.mapCanvas;
  if (!c || !document.body.contains(c)) return;
  const d = G.day;
  const view = {
    time: d.time, showCongestion: hasUp('mapapp'), closedSegments: knownClosures(), pins: pinsFor(), hover: G.ui.hover,
    van: d.van, routePaths: G.ui.routePaths || null,
  };
  TOWN.render(c.getContext('2d'), view);
}

// ---------------------------------------------------------
// 3. ルート計画
// ---------------------------------------------------------
function renderRoute(scr) {
  const d = G.day;
  const stops = stopBuildings();
  d.route = d.route.filter(b => stops.includes(b));
  const sim = simulateRoute(d.route, OFFICE().stop, d.time);
  G.ui.routePaths = sim.legs.map(l => l.path).concat(d.route.length ? [sim.backPath] : []);
  const unrouted = stops.filter(b => !d.route.includes(b));
  const notOnMap = d.parcels.filter(p => p.misrouted && p.status === 'loaded');
  const unloaded = d.parcels.filter(p => p.status === 'office' && p.bid);
  const okCount = sim.legs.reduce((a, l) => a + (l.states || []).filter(s => s === 'ok').length, 0);
  const winCount = sim.legs.reduce((a, l) => a + (l.ps || []).filter(p => p.window !== 'none').length, 0);
  const totalTiles = sim.legs.reduce((a, l) => a + (l.tiles || 0), 0) + (sim.backPath ? sim.backPath.length - 1 : 0);

  scr.innerHTML = `
  <div class="guide"><img src="assets/icons/information.png" alt="">
    <div><b>手順3：ルート計画</b>　地図上の配達先（ピン）を、回りたい順にクリックします。もう一度クリックすると順番から外れます。
    右の一覧で到着予想と時間指定の間に合い具合を確認しましょう。<b>赤い区間は通行止め</b>です。
    ${hasUp('mapapp') ? 'まちナビの渋滞予測（オレンジ）も到着予想に反映されています。' : '<span class="muted">※到着予想に渋滞は含まれていません。</span>'}</div></div>
  <div class="layout wide-left" style="grid-template-columns:minmax(330px,420px) 1fr">
    <div class="panel">
      <div class="panel-head"><h2>配達順</h2><span class="muted">${d.route.length} / ${stops.length} か所</span></div>
      <div class="panel-body">
        <div class="summary-row">
          <div class="stat"><div class="s-label">帰着予想</div><div class="s-val">${d.route.length ? fmt(sim.end) : '--:--'}</div></div>
          <div class="stat"><div class="s-label">時間指定</div><div class="s-val">${okCount} / ${winCount}</div></div>
          <div class="stat"><div class="s-label">走行距離</div><div class="s-val">${(totalTiles * 0.15).toFixed(1)}km</div></div>
        </div>
        <ol class="route-list">${sim.legs.map((l, i) => routeItemHtml(l, i)).join('') || '<li class="muted">まだ順番が決まっていません。地図のピンをクリックしてください。</li>'}</ol>
        ${unrouted.length ? `<div class="muted" style="margin-top:12px">未設定の配達先（クリックで末尾に追加）</div><div class="unrouted">${unrouted.map(bid => `<button class="btn small" data-add="${bid}">${esc(TOWN.building(bid).name)}</button>`).join('')}</div>` : ''}
        <ul class="issues">
          ${notOnMap.length ? `<li>地図上に見つからない配達先の荷物が${notOnMap.length}個積まれています（${notOnMap.map(p => esc(p.addr)).join('、')}）。</li>` : ''}
          ${unloaded.length ? `<li class="info">まだ積んでいない荷物が${unloaded.length}個あります。</li>` : ''}
          ${sim.legs.some(l => l.unreachable) ? '<li>通行止めで行けない配達先があります。</li>' : ''}
          ${d.route.length && sim.end > DATA.SHIFT_END ? `<li class="info">帰着が定時（${fmt(DATA.SHIFT_END)}）を過ぎる予想です。残業になります。</li>` : ''}
        </ul>
      </div>
      <div class="panel-foot">
        <button class="btn small" id="btn-clear">順番をクリア</button>
        <button class="btn small" id="btn-load-back">← 積み込み</button>
        <span class="spacer"></span>
        <button class="btn go big" id="btn-depart">出発する</button>
      </div>
    </div>
    <div class="panel map-panel">
      <div class="panel-head"><h2>あおば町　地図</h2><span class="muted">ピンをクリックして順番を決める</span></div>
      <div class="map-canvas-wrap" id="map-wrap"></div>
      ${legendHtml()}
    </div>
  </div>`;
  mountMap($('#map-wrap'), (b) => {
    if (!stops.includes(b.id)) { toast(`${esc(b.name)}：今日の荷物はありません。`, 'info', 2000); return; }
    const i = d.route.indexOf(b.id);
    if (i >= 0) d.route.splice(i, 1); else d.route.push(b.id);
    sfx('select'); render();
  });
  $$('[data-add]', scr).forEach(el => el.onclick = () => { d.route.push(el.dataset.add); sfx('select'); render(); });
  $$('[data-up]', scr).forEach(el => el.onclick = () => { const i = +el.dataset.up; if (i > 0) { [d.route[i - 1], d.route[i]] = [d.route[i], d.route[i - 1]]; sfx('click'); render(); } });
  $$('[data-down]', scr).forEach(el => el.onclick = () => { const i = +el.dataset.down; if (i < d.route.length - 1) { [d.route[i + 1], d.route[i]] = [d.route[i], d.route[i + 1]]; sfx('click'); render(); } });
  $$('[data-del]', scr).forEach(el => el.onclick = () => { d.route.splice(+el.dataset.del, 1); sfx('click'); render(); });
  $('#btn-clear').onclick = () => { d.route = []; sfx('click'); render(); };
  $('#btn-load-back').onclick = () => { sfx('click'); setPhase('load'); };
  $('#btn-depart').onclick = () => confirmDepart(unrouted, unloaded);
}

function legendHtml() {
  return `<div class="map-legend">
    <span><span class="dot" style="background:#5b5f66"></span>営業所</span>
    <span><span class="dot" style="background:#2d4a66"></span>配達先</span>
    <span><span class="dot" style="background:#2e6eaa"></span>次の行き先</span>
    <span><span class="dot" style="background:#3f7d5a"></span>配達済み</span>
    <span><span class="dot" style="background:#c27a2c"></span>持ち戻り</span>
    <span><span class="dot" style="background:#8a5aa8"></span>再配達依頼</span>
    <span><span class="dot" style="background:#b05a4c"></span>通行止め</span>
    ${hasUp('mapapp') ? '<span><span class="dot" style="background:#d6a03c"></span>渋滞（予測）</span>' : ''}
  </div>`;
}

function routeItemHtml(l, i) {
  const b = TOWN.building(l.bid);
  if (l.unreachable) return `<li class="route-item"><span class="num">${i + 1}</span><div>${esc(b.name)}<div class="r-sub">通行止めで到達できません</div></div><div class="r-btns"><button data-del="${i}">✕</button></div></li>`;
  const chips = l.ps.map((p, j) => {
    const st = l.states[j];
    const w = DATA.WINDOWS[p.window];
    if (st === 'none') return '';
    return `<span class="tag ${st === 'ok' ? 'ok' : st === 'late' ? 'bad' : 'warn'}">${w.short} ${st === 'ok' ? '◎' : st === 'late' ? '遅れ' : '早着'}</span>`;
  }).join(' ');
  return `<li class="route-item">
    <span class="num">${i + 1}</span>
    <div><div>${esc(b.name)}${l.ps.length > 1 ? `<span class="muted">（${l.ps.length}個）</span>` : ''}</div>
      <div class="r-sub">${esc(b.addr || '')}　${chips}</div></div>
    <div class="eta">${fmt(l.arrive)}着${l.wait ? `<div class="r-sub">待機 ${mins(l.wait)}</div>` : ''}
      <div class="r-btns"><button data-up="${i}" title="前へ">▲</button><button data-down="${i}" title="後ろへ">▼</button><button data-del="${i}" title="外す">✕</button></div></div>
  </li>`;
}

function confirmDepart(unrouted, unloaded) {
  const d = G.day;
  const warn = [];
  if (unloaded.length) warn.push(`積んでいない荷物が${unloaded.length}個あります。営業所に残ります。`);
  if (unrouted.length) warn.push(`配達順に入っていない配達先が${unrouted.length}か所あります（あとで地図から行き先を選べます）。`);
  const issues = loadIssues();
  if (issues.length) warn.push(`積み方の注意が${issues.length}件あります。`);
  if (!d.route.length && !unrouted.length) warn.push('配達先がひとつもありません。');
  const go = () => { closeModal(); depart(); };
  if (!warn.length) { go(); return; }
  modal(`<div class="modal-head"><h3>出発前の確認</h3></div>
    <div class="modal-body"><ul class="issues">${warn.map(w => `<li class="info">${w}</li>`).join('')}</ul><p class="muted">このまま出発しますか？</p></div>
    <div class="modal-foot"><button class="btn" id="dp-no">戻る</button><button class="btn go" id="dp-yes">出発する</button></div>`, { narrow: true });
  $('#dp-no').onclick = () => { sfx('close'); closeModal(); };
  $('#dp-yes').onclick = go;
}

function depart() {
  const d = G.day;
  // 出発時点の積み方で破損・荷崩れ・温度を判定
  for (const i of loadIssues()) {
    if (i.kind === 'crush') i.p.damaged = true;
    if (i.kind === 'stack') d.stats.issues.push(`ワレモノ「${i.p.item}」の上に荷物を積んだ`);
    if (i.kind === 'heavyTop') d.stats.issues.push(`重量物「${i.p.item}」を上段に積んだ`);
    if (i.kind === 'warm') i.p.warm = true;
  }
  d.departed = true;
  for (const p of d.parcels) if (p.status === 'office') p.status = p.misrouted ? 'aside' : 'left';
  sfx('ok2');
  log('営業所を出発しました。', 'info');
  d.phase = 'drive';
  G.ui.routePaths = null;
  render();
}

// ---------------------------------------------------------
// 4. 配達（運転）
// ---------------------------------------------------------
function remainingStops() {
  const d = G.day;
  const pend = new Set(d.parcels.filter(p => p.bid && ['loaded', 'carry', 'redeliver'].includes(p.status)).map(p => p.bid));
  const ordered = d.route.filter(b => pend.has(b));
  for (const b of pend) if (!ordered.includes(b)) ordered.push(b);
  // 未訪問（loaded/redeliver あり）を優先、持ち戻りのみは後ろ
  const active = ordered.filter(b => deliverableAt(b).some(p => p.status !== 'carry'));
  const carryOnly = ordered.filter(b => !active.includes(b));
  return { active, carryOnly };
}

function renderDrive(scr) {
  const d = G.day;
  const total = d.parcels.filter(p => p.bid && ['loaded', 'carry', 'redeliver', 'delivered'].includes(p.status)).length;
  const done = d.parcels.filter(p => p.status === 'delivered').length;
  const { active, carryOnly } = remainingStops();
  const next = active[0] || null;
  const nb = next ? TOWN.building(next) : null;
  const nps = next ? deliverableAt(next) : [];
  const driving = d.driving;
  const tb = driving ? (driving.target === 'office' ? OFFICE() : TOWN.building(driving.target)) : null;

  // 次の行き先までの経路と、その先の予定を地図に表示
  if (!driving) {
    const sim = simulateRoute(active.slice(0, 4), { x: d.van.x, y: d.van.y }, d.time);
    G.ui.routePaths = sim.legs.map(l => l.path);
  }

  scr.innerHTML = `
  <div class="layout">
    <div class="drive-side">
      <div class="panel next-card">
        ${driving ? `
          <div class="nc-label">移動中</div>
          <div class="nc-name">${esc(tb.name)}へ向かっています</div>
          <div class="nc-meta">${driving.target === 'office' ? '営業所に戻ります' : esc(tb.addr || '')}</div>
          <div class="nc-btns"><button class="btn" id="btn-fast">${G.ui.fast ? '通常の速さ' : '早送り ▶▶'}</button></div>
        ` : next ? `
          <div class="nc-label">次の配達先（予定順）</div>
          <div class="nc-name">${esc(nb.name)}</div>
          <div class="nc-meta">${esc(nb.addr)}　${nps.map(p => `<span class="tag time">${DATA.WINDOWS[p.window].label}</span>`).join(' ')}</div>
          <div class="nc-btns">
            <button class="btn primary big" id="btn-go-next">${esc(nb.name)}へ向かう</button>
          </div>
          <p class="muted" style="margin:8px 0 0">別の配達先へ行くときは、地図のピンをクリックします。</p>
        ` : `
          <div class="nc-label">配達状況</div>
          <div class="nc-name">${carryOnly.length ? '予定の配達先はすべて回りました' : 'すべての荷物を届けました！'}</div>
          <div class="nc-meta">${carryOnly.length ? '持ち戻りの荷物は、もう一度訪ねるか、営業所に持ち帰りましょう。' : 'お疲れさまでした。営業所に戻りましょう。'}</div>
        `}
        ${!driving ? `<div class="nc-btns" style="margin-top:10px"><button class="btn ${next ? '' : 'go big'}" id="btn-return">営業所へ戻る${next ? '（配達を終える）' : ''}</button></div>` : ''}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>配達状況</h2><span class="muted">${done} / ${total} 個</span></div>
        <div class="panel-body">
          <div class="progress"><div style="width:${total ? done / total * 100 : 0}%"></div></div>
          <ol class="route-list" style="margin-top:10px">${driveListHtml()}</ol>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>業務記録</h2></div>
        <div class="log">${d.log.map(l => `<div class="${l.kind}"><b>${fmt(l.t)}</b>${l.msg}</div>`).join('')}</div>
      </div>
    </div>
    <div class="panel map-panel">
      <div class="panel-head"><h2>あおば町　地図</h2><span class="muted">${d.time >= DATA.SHIFT_END ? '<span class="tag warn">残業中</span>' : `定時 ${fmt(DATA.SHIFT_END)}`}</span></div>
      <div class="map-canvas-wrap" id="map-wrap"></div>
      ${legendHtml()}
      <div class="panel-body" style="padding-top:0">
        <details><summary class="muted" style="cursor:pointer">荷台の様子を見る</summary>${vanHtml({})}</details>
      </div>
    </div>
  </div>`;
  mountMap($('#map-wrap'), (b) => {
    if (b.id === 'office') { askReturn(); return; }
    if (!deliverableAt(b.id).length) { toast(`${esc(b.name)}：届ける荷物はありません。`, 'info', 2000); return; }
    driveTo(b.id);
  });
  const goNext = $('#btn-go-next');
  if (goNext) goNext.onclick = () => driveTo(next);
  const ret = $('#btn-return');
  if (ret) ret.onclick = askReturn;
  const fast = $('#btn-fast');
  if (fast) fast.onclick = () => { G.ui.fast = !G.ui.fast; sfx('click'); fast.textContent = G.ui.fast ? '通常の速さ' : '早送り ▶▶'; };
}

function driveListHtml() {
  const d = G.day;
  const ids = [];
  d.route.forEach(b => { if (!ids.includes(b)) ids.push(b); });
  d.parcels.forEach(p => { if (p.bid && ['loaded', 'carry', 'redeliver', 'delivered'].includes(p.status) && !ids.includes(p.bid)) ids.push(p.bid); });
  return ids.filter(bid => d.parcels.some(p => p.bid === bid && ['loaded', 'carry', 'redeliver', 'delivered'].includes(p.status))).map((bid, i) => {
    const b = TOWN.building(bid);
    const ps = d.parcels.filter(p => p.bid === bid && ['loaded', 'carry', 'redeliver', 'delivered'].includes(p.status));
    const allDone = ps.every(p => p.status === 'delivered');
    const cur = d.driving && d.driving.target === bid;
    const tags = ps.map(p => {
      if (p.status === 'delivered') return `<span class="tag ok">${p.method === 'okihai' ? '置き配' : p.method === 'box' ? '宅配ボックス' : '手渡し'}</span>`;
      if (p.status === 'carry') return '<span class="tag warn">持ち戻り</span>';
      if (p.status === 'redeliver') return `<span class="tag home">再配達 ${DATA.WINDOWS[p.window].short}</span>`;
      return DATA.WINDOWS[p.window].from != null ? `<span class="tag time">${DATA.WINDOWS[p.window].short}</span>` : '';
    }).join(' ');
    return `<li class="route-item ${allDone ? 'done' : ''} ${cur ? 'current' : ''}"><span class="num">${allDone ? '✓' : d.route.indexOf(bid) >= 0 ? d.route.indexOf(bid) + 1 : '・'}</span>
      <div><div>${esc(b.name)}</div><div class="r-sub">${tags}</div></div><div></div></li>`;
  }).join('');
}

function askReturn() {
  const left = G.day.parcels.filter(p => ['loaded', 'carry', 'redeliver'].includes(p.status));
  if (!left.length) { driveTo('office'); return; }
  modal(`<div class="modal-head"><h3>営業所へ戻りますか？</h3></div>
    <div class="modal-body"><p>まだ届けていない荷物が<b>${left.length}個</b>あります。戻るとその荷物は「持ち戻り」になり、今日の配達は終了します。</p></div>
    <div class="modal-foot"><button class="btn" id="rt-no">配達を続ける</button><button class="btn warn" id="rt-yes">営業所へ戻る</button></div>`, { narrow: true });
  $('#rt-no').onclick = () => { sfx('close'); closeModal(); };
  $('#rt-yes').onclick = () => { closeModal(); driveTo('office'); };
}

function driveTo(target) {
  const d = G.day;
  const b = target === 'office' ? OFFICE() : TOWN.building(target);
  const from = { x: d.van.x, y: d.van.y };
  const path = TOWN.findPath(from, b.stop, { closures: closureSet(), congestion: hasUp('mapapp'), time: d.time });
  if (!path) { sfx('err'); toast('通行止めで、そこへ行く道が見つかりません。', 'bad'); return; }
  sfx('click');
  d.driving = { target, path, i: 0 };
  log(`${b.name}へ向かいます。`);
  G.ui.routePaths = [path];
  render();
  stepDrive();
}

function stepDrive() {
  const d = G.day;
  const dr = d.driving;
  if (!dr) return;
  if (dr.i >= dr.path.length - 1) { arrive(); return; }
  const a = dr.path[dr.i], b = dr.path[dr.i + 1];
  const mult = TOWN.CONGESTION.reduce((m, z) => (z.test(b.x, b.y) && z.times.some(([s, e]) => d.time >= s && d.time < e)) ? m * z.mult : m, 1);
  const dt = DATA.MIN_PER_TILE * mult;
  const dur = (G.ui.fast ? 22 : 75) * Math.min(mult, 2);
  d.van.dir = b.x > a.x ? 'right' : b.x < a.x ? 'left' : b.y > a.y ? 'down' : 'up';
  const t0 = performance.now(), time0 = d.time;
  const anim = (now) => {
    if (G.day !== d || d.driving !== dr) return;
    const k = Math.min(1, (now - t0) / dur);
    d.van.fx = a.x + (b.x - a.x) * k; d.van.fy = a.y + (b.y - a.y) * k;
    d.time = time0 + dt * k;
    drawMap(); updateHud();
    if (k < 1) { requestAnimationFrame(anim); return; }
    d.van.x = b.x; d.van.y = b.y;
    dr.i++;
    G.ui.routePaths = [dr.path.slice(dr.i)];
    if (mult > 1 && !dr.jamLogged) { dr.jamLogged = true; log('渋滞に巻き込まれています…', 'bad'); }
    if (checkEvents()) return; // 経路が変わった場合などは checkEvents 内で再開
    stepDrive();
  };
  requestAnimationFrame(anim);
}

// 時間経過で起きる出来事。経路を変えた場合は true
function checkEvents() {
  const d = G.day;
  let rerouted = false;
  if (!d.incident.fired && d.time >= d.incident.at) {
    d.incident.fired = true;
    sfx('err');
    const msg = `無線：<b>${d.incident.seg.name}</b>で事故のため通行止めになりました。`;
    toast(msg, 'bad', 6000);
    log(msg, 'bad');
    if (d.driving) {
      const blocked = new Set(TOWN.segmentTiles(d.incident.seg));
      const ahead = d.driving.path.slice(d.driving.i + 1);
      if (ahead.some(pt => blocked.has(pt.x + ',' + pt.y))) {
        const tgt = d.driving.target === 'office' ? OFFICE() : TOWN.building(d.driving.target);
        const np = TOWN.findPath({ x: d.van.x, y: d.van.y }, tgt.stop, { closures: closureSet(), congestion: hasUp('mapapp'), time: d.time });
        if (np) { d.driving.path = np; d.driving.i = 0; log('迂回ルートに切り替えました。', 'info'); }
        rerouted = true;
      }
    }
    if (!d.driving) render();
  }
  for (const c of d.calls) {
    if (c.fired || d.time < c.at) continue;
    c.fired = true;
    const p = P(c.pid);
    if (p.status !== 'carry') continue;
    p.status = 'redeliver'; p.window = c.window; p.redeliver = true;
    if (!d.route.includes(p.bid)) d.route.push(p.bid);
    sfx('q');
    const msg = `電話：${esc(p.name)}様から再配達の依頼。<b>${DATA.WINDOWS[c.window].label}</b>にお願いします、とのこと。`;
    toast(msg, 'call', 7000);
    log(msg, 'info');
    if (!d.driving) render();
  }
  if (!d.overtimeWarned && d.time >= DATA.SHIFT_END) {
    d.overtimeWarned = true;
    toast('定時の19:00を過ぎました。ここからは残業です。', 'info');
    log('定時を過ぎました。', 'info');
  }
  if (d.time >= DATA.HARD_END && !d.forceReturn && !(d.driving && d.driving.target === 'office')) {
    toast('21:00になりました。営業所に戻ります。', 'bad', 6000);
    log('21:00 業務終了のため帰庫します。', 'bad');
    closeModal();
    stowInHand();
    d.forceReturn = true;
    d.driving = null;
    setTimeout(() => driveTo('office'), 50);
    return true;
  }
  if (rerouted) { stepDrive(); return true; }
  return false;
}

function advance(m) {
  G.day.time += m;
  updateHud();
  return checkEvents();
}

function arrive() {
  const d = G.day;
  const target = d.driving.target;
  d.driving = null;
  d.van.fx = d.van.x; d.van.fy = d.van.y;
  G.ui.routePaths = null;
  if (target === 'office') { finishDay(); return; }
  sfx('pluck');
  log(`${TOWN.building(target).name}に到着。`);
  render();
  openStop(target);
}

// ---------------------------------------------------------
// 配達先での対応
// ---------------------------------------------------------
function openStop(bid) {
  G.ui.stop = { bid, pid: null, step: 'overview', situationDone: false, wrongHouse: false };
  renderStop();
}

function renderStop() {
  const d = G.day, st = G.ui.stop;
  if (d.forceReturn) { closeModal(); return; }
  const b = TOWN.building(st.bid);
  const ps = d.parcels.filter(p => p.bid === st.bid && ['loaded', 'carry', 'redeliver', 'delivered'].includes(p.status));
  const p = st.pid ? P(st.pid) : null;
  let body = '', foot = '';

  if (st.step === 'overview') {
    body = `<p class="narration">${sceneIntro(b)}</p>
      <div class="stop-parcels">${ps.map(q => {
        const done = q.status === 'delivered';
        const tried = q.status === 'carry' && q.visitedThisStop;
        const ws = windowState(q, d.time);
        return `<div class="stop-parcel ${done ? 'done' : tried ? 'ret' : ''}">
          <div><b>${esc(q.name)} 様</b>${q.room ? `（${q.room}号室）` : ''}　${esc(q.item)}<div>${tagsHtml(q)}</div>
          ${!done && ws === 'early' ? `<div class="muted">指定時間より早く着きました（${DATA.WINDOWS[q.window].label}）。</div>` : ''}
          ${!done && ws === 'late' ? `<div class="muted" style="color:var(--red)">指定時間を過ぎています。</div>` : ''}</div>
          <div>${done ? '<span class="tag ok">完了</span>' : tried ? '<span class="tag warn">不在</span>' : `<button class="btn primary small" data-handle="${q.id}">対応する</button>`}</div>
        </div>`;
      }).join('')}</div>`;
    const early = ps.filter(q => q.status !== 'delivered' && windowState(q, d.time) === 'early');
    if (early.length) {
      const until = Math.min(...early.map(q => DATA.WINDOWS[q.window].from));
      foot += `<button class="btn" id="st-wait">${fmt(until)}まで待つ（${mins(until - d.time)}）</button>`;
    }
    foot += `<button class="btn go" id="st-leave">車に戻る</button>`;
  } else if (st.step === 'retrieve') {
    const where = p.loc ? (p.loc.area === 'col' ? `荷台の<b>${COL_NAMES[p.loc.i]}</b>・${['下段', '中段', '上段'][Math.min(2, stackIndex(p))]}` : { cooler: '<b>保冷ボックス</b>', shelf: '<b>車内の棚</b>', front: '<b>助手席</b>' }[p.loc.area]) : '';
    const above = aboveOf(p);
    body = `<p class="narration">${esc(p.name)}様の荷物「${esc(p.item)}」は ${where} にあります。${above.length ? `上に<b>${above.length}個</b>の荷物が載っているので、どかしてから取り出します。` : ''}</p>
      ${vanHtml({ hl: p.id })}`;
    foot = `<button class="btn" id="st-back">戻る</button><button class="btn primary" id="st-retrieve">荷物を取り出す（約${mins(retrieveCost(p))}）</button>`;
  } else if (st.step === 'situation') {
    const s = situationData(st.situation, b, p);
    body = `<p class="narration">${s.text}</p><div class="choices">${s.choices.map((c, i) => `<button class="btn ${i === 0 && c.recommended ? 'primary' : ''}" data-choice="${i}" ${c.disabled ? 'disabled' : ''}><span>${c.label}</span><span class="cost">${c.cost}</span></button>`).join('')}</div>`;
  } else if (st.step === 'ring') {
    body = `<p class="narration">${b.kind === 'mansion' ? `エントランスのインターホンで <b>${p.room}</b> を呼び出す。` : '呼び鈴を押した。'}</p>
      <div class="choices"><button class="btn primary" id="st-ring"><span>${b.kind === 'mansion' ? '呼び出す' : 'ピンポーン'}</span><span class="cost">1分</span></button></div>`;
  } else if (st.step === 'handover') {
    const who = st.wrongHouse ? resident(st.wrongHouse) : resident(p.rid);
    body = `<div class="speech"><canvas width="48" height="48" data-face="${who.id}"></canvas><div><div class="sp-name">${esc(who.name)}（${esc(who.role)}）</div>${esc(st.greeting)}</div></div>
      <p class="narration">${st.meeting ? '' : `受取人に荷物を渡して、受領のサインをもらおう。`}</p>
      <div class="choices">
        ${st.meeting ? `<button class="btn primary" data-act="box"><span>宅配ボックスに入れる</span><span class="cost">1分</span></button>`
          : `<button class="btn primary" data-act="hand"><span>手渡しする（サインをもらう）</span><span class="cost">1分</span></button>`}
        ${p.bid === 'sato_k' || p.bid === 'sato_m' ? `<button class="btn" data-act="confirm"><span>「${esc(p.name)}様ですね？」と念のため確認する</span><span class="cost">0.5分</span></button>` : ''}
      </div>`;
  } else if (st.step === 'absent') {
    body = `<p class="narration">${st.absentText}</p>
      <div class="choices">
        <button class="btn" data-act="again" ${st.retried ? 'disabled' : ''}><span>もう一度鳴らして少し待つ</span><span class="cost">2分</span></button>
        <button class="btn" data-act="phone" ${st.phoned || !resident(p.rid).phone ? 'disabled' : ''}><span>伝票の番号に電話する${resident(p.rid).phone ? '' : '（番号の記載なし）'}</span><span class="cost">2分</span></button>
        <button class="btn" data-act="okihai"><span>置き配する</span><span class="cost">1分</span></button>
        <button class="btn warn" data-act="slip"><span>不在票を入れて持ち戻る</span><span class="cost">1分</span></button>
      </div>
      <div class="slip" style="margin-top:12px">${miniSlip(p)}</div>`;
  } else if (st.step === 'okihai') {
    body = `<p class="narration">どこに置きますか？ 伝票の指定を確認しましょう。</p>
      <div class="slip">${miniSlip(p)}</div>
      <div class="choices">${DATA.OKIHAI_PLACES.map(pl => `<button class="btn" data-place="${pl}"><span>${pl}に置く</span><span class="cost">1分</span></button>`).join('')}</div>`;
    foot = `<button class="btn" id="st-back-absent">やめる</button>`;
  } else if (st.step === 'done') {
    body = `<p class="narration">${st.doneText}</p>`;
    foot = `<button class="btn primary" id="st-next">OK</button>`;
  }

  const m = modal(`
    <div class="modal-head">
      <div><h3>${esc(b.name)}</h3><div class="mh-sub">${esc(b.addr || '')}　現在 ${fmt(d.time)}</div></div>
    </div>
    <div class="modal-body"><div class="scene ${st.step === 'retrieve' ? 'full' : ''}"><div class="scene-pic"><canvas id="scene-cv"></canvas></div><div class="scene-text">${body}</div></div></div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}`);
  TOWN.drawScene($('#scene-cv'), b);
  paintIcons(m);
  bindStop(m, b, p);
}

function miniSlip(p) {
  return `<table><tr><th>お届け先</th><td>${esc(p.name)} 様 ${p.room ? p.room + '号室' : ''}</td></tr>
    <tr><th>置き配</th><td>${p.okihai ? `<span class="tag okihai-ok">可</span>　指定場所：<b>${p.okihai}</b>` : `<span class="tag okihai-ng">不可</span>　<span class="muted">${esc(p.okihaiReason || '')}</span>`}</td></tr>
    <tr><th>取扱注意</th><td>${p.flags.map(f => `<span class="tag ${DATA.FLAG_LABEL[f].cls}">${DATA.FLAG_LABEL[f].label}</span>`).join(' ') || 'なし'}</td></tr></table>`;
}

function sceneIntro(b) {
  const t = {
    house: '一戸建ての前に車を停めた。',
    shop: 'お店の前に車を停めた。',
    apart: '2階建てのアパートの前に車を停めた。',
    mansion: 'オートロックのマンションの前に車を停めた。',
  }[b.kind] || '車を停めた。';
  return t + 'ハザードランプをつけて、荷物を確認しよう。';
}

function situationFor(b) {
  if (b.id === 'kobayashi') return 'hidden';
  if (b.id === 'ito') return 'dog';
  if (b.id === 'sato_k' || b.id === 'sato_m') return 'samename';
  if (b.kind === 'apart' && chance(0.5)) return 'entrance';
  if ((b.kind === 'house') && chance(0.25)) return 'bell';
  return null;
}

function situationData(kind, b, p) {
  const app = hasUp('mapapp');
  const visits = G.save.visits[p.rid] || 0;
  switch (kind) {
    case 'hidden': return {
      text: '表の門はしっかり閉まっていて、インターホンも見当たらない。入口はどこだろう…？',
      choices: [
        app ? { label: 'まちナビの入口メモを見る', cost: '0.5分', recommended: true, run: () => ({ t: 0.5, msg: 'メモによると「裏の勝手口から」。勝手口へまわった。' }) } : null,
        { label: '建物のまわりを歩いて、別の入口を探す', cost: '約4分', run: () => ({ t: 4, msg: '裏手に勝手口とチャイムを見つけた。' }) },
        { label: '門を何度か叩いて呼んでみる', cost: '約2分〜', run: () => ({ t: 6, msg: '反応がない…。結局、建物を一周して裏の勝手口を見つけた。' }) },
      ].filter(Boolean),
    };
    case 'dog': return {
      text: visits >= 2 ? '柴犬のコタロウがしっぽを振って出迎えてくれた。' : '門の向こうで柴犬が激しく吠えている！',
      choices: visits >= 2
        ? [{ label: 'コタロウに挨拶して玄関へ', cost: '0.5分', recommended: true, run: () => ({ t: 0.5, msg: 'コタロウはおとなしく見送ってくれた。' }) }]
        : [
          { label: 'しゃがんで落ち着いて声をかけてから進む', cost: '1分', recommended: true, run: () => ({ t: 1, msg: '犬は少し落ち着いた。ゆっくり玄関まで進んだ。' }) },
          { label: '急いで玄関まで駆け寄る', cost: '0分', run: () => {
            const fr = p.flags.includes('fragile') || p.flags.includes('upright');
            if (fr) { p.damaged = true; return { t: 0, msg: '飛びかかられそうになって荷物を落としてしまった！ 中で嫌な音が…。', bad: true }; }
            G.day.stats.issues.push('犬に驚いて荷物を落とした');
            return { t: 0, msg: '飛びかかられそうになって荷物を落としてしまった。中身は無事のようだが…。', bad: true };
          } },
        ],
    };
    case 'samename': return {
      text: '「佐藤」の表札。…隣の家の表札も「佐藤」だ。どちらの家だろう？',
      choices: [
        { label: '伝票の番地と、門柱の住居表示を照らし合わせる', cost: '0.5分', recommended: true, run: () => ({ t: 0.5, msg: `住居表示は「${b.addr}」。伝票と一致した。` }) },
        { label: '表札の名字だけで判断して呼び鈴を押す', cost: '0分', run: () => {
          if (chance(0.5)) G.ui.stop.wrongHouse = p.bid === 'sato_k' ? 'sato_m' : 'sato_k';
          return { t: 0, msg: '「佐藤」と書いてある家の呼び鈴を押すことにした。' };
        } },
      ],
    };
    case 'entrance': return {
      text: 'アパートの入口が建物の両側にある。どちらの階段から行けばいいだろう？',
      choices: [
        { label: '集合ポストの部屋番号の並びを確認する', cost: '1分', recommended: true, run: () => ({ t: 1, msg: `${p.room}号室は右側の階段だとわかった。` }) },
        { label: '近いほうの階段を上ってみる', cost: '0分〜', run: () => chance(0.5) ? { t: 0, msg: '運よく正しい階段だった。' } : { t: 4, msg: '反対側だった…。階段を降りて、まわり直した。' } },
      ],
    };
    case 'bell': return {
      text: '玄関に呼び鈴が見当たらない。',
      choices: [
        { label: '玄関まわりをよく探す', cost: '1.5分', recommended: true, run: () => ({ t: 1.5, msg: '植木鉢の陰にインターホンを見つけた。' }) },
        { label: 'ドアをノックする', cost: '1分', run: () => chance(0.6) ? { t: 1, msg: '中から足音が聞こえた。' } : { t: 2.5, msg: 'ノックでは気づかれない。結局インターホンを探して、植木鉢の陰に見つけた。' } },
      ],
    };
  }
  return { text: '', choices: [] };
}

function bindStop(m, b, p) {
  const d = G.day, st = G.ui.stop;
  const on = (sel, fn) => { const el = $(sel, m); if (el) el.onclick = fn; };
  $$('[data-handle]', m).forEach(el => el.onclick = () => {
    st.pid = el.dataset.handle; sfx('click');
    const q = P(st.pid);
    st.step = q.inHand ? nextAfterRetrieve(b) : 'retrieve';
    renderStop();
  });
  on('#st-leave', () => {
    sfx('close'); closeModal();
    stowInHand();
    render();
  });
  on('#st-wait', () => {
    const early = d.parcels.filter(q => q.bid === b.id && q.status !== 'delivered' && windowState(q, d.time) === 'early');
    const until = Math.min(...early.map(q => DATA.WINDOWS[q.window].from));
    log(`${fmt(until)}まで車内で待機。`);
    if (advance(until - d.time)) return;
    sfx('tick'); renderStop();
  });
  on('#st-back', () => { st.step = 'overview'; st.pid = null; renderStop(); });
  on('#st-retrieve', () => {
    const cost = retrieveCost(p);
    const fromCol = p.loc && p.loc.area === 'col';
    unplace(p);
    p.inHand = true;
    sfx('lift');
    if (advance(cost)) return;
    if (fromCol) G.day.stats.retrieveMin = (G.day.stats.retrieveMin || 0) + cost;
    if (p.damaged) toast('箱を持ち上げると、中でカチャッと音がした…。', 'bad');
    st.step = nextAfterRetrieve(b);
    renderStop();
  });
  $$('[data-choice]', m).forEach(el => el.onclick = () => {
    const s = situationData(st.situation, b, p);
    const c = s.choices[+el.dataset.choice];
    const r = c.run();
    st.situationDone = true;
    sfx(r.bad ? 'err' : 'click');
    log(r.msg, r.bad ? 'bad' : '');
    if (advance(r.t + walkMinutes(b, p))) return;
    toast(r.msg, r.bad ? 'bad' : '', 3500);
    st.step = 'ring';
    renderStop();
  });
  on('#st-ring', () => {
    sfx('bell');
    if (advance(1)) return;
    ring(b, p);
    renderStop();
  });
  $$('[data-act]', m).forEach(el => el.onclick = () => {
    const act = el.dataset.act;
    if (act === 'hand') { deliver(p, 'hand'); return; }
    if (act === 'box') { deliver(p, 'box', p.okihai || '宅配ボックス', true); return; }
    if (act === 'confirm') {
      if (advance(0.5)) return;
      if (st.wrongHouse) {
        const w = resident(st.wrongHouse);
        st.wrongHouse = false;
        sfx('q');
        toast(`「いえ、うちは${esc(w.name)}です。${esc(p.name)}さんはお隣ですよ」──隣の家だった！`, 'info', 5000);
        log('隣の佐藤さんの家と間違えていた。確認して正しい家へ。', 'info');
        if (advance(2)) return;
        st.step = 'ring'; renderStop(); return;
      }
      toast('「はい、そうです」本人だと確認できた。', 'good', 2500);
      sfx('tick'); renderStop(); return;
    }
    if (act === 'again') {
      st.retried = true;
      if (advance(2)) return;
      if (chance(0.3)) {
        st.greeting = 'すみません、お風呂に入ってて！'; sfx('ok2');
        st.step = 'handover';
      } else { st.absentText = 'やはり反応がない。'; sfx('click'); }
      renderStop(); return;
    }
    if (act === 'phone') {
      st.phoned = true; sfx('q');
      if (advance(2)) return;
      const r = resident(p.rid);
      const roll = rand();
      if (roll < 0.25) {
        toast(`📞「あと5分で戻ります！」`, 'call', 3000);
        log(`${p.name}様に電話。5分待って手渡しへ。`);
        if (advance(5)) return;
        st.greeting = 'お待たせしてすみません！'; st.step = 'handover';
      } else if (roll < 0.45 && r.okihai && !p.flags.includes('cool') && !p.senderNoOkihai) {
        toast(`📞「${r.okihai}に置いておいてください」`, 'call', 3500);
        log(`${p.name}様に電話。${r.okihai}への置き配を頼まれた。`);
        p.okihai = r.okihai; p.phoneOk = true;
        st.absentText = `電話で「${r.okihai}に置いてください」と頼まれた。`;
      } else {
        st.absentText = '電話は留守番電話につながった。';
        log(`${p.name}様に電話したが、つながらなかった。`);
      }
      renderStop(); return;
    }
    if (act === 'okihai') { st.step = 'okihai'; sfx('click'); renderStop(); return; }
    if (act === 'slip') { carryBack(p); return; }
  });
  $$('[data-place]', m).forEach(el => el.onclick = () => deliver(p, 'okihai', el.dataset.place));
  on('#st-back-absent', () => { st.step = 'absent'; renderStop(); });
  on('#st-next', () => {
    st.step = 'overview'; st.pid = null; st.wrongHouse = false; st.retried = false; st.phoned = false; st.meeting = false;
    const rest = deliverableAt(b.id).filter(q => !q.visitedThisStop);
    if (!rest.length) {
      closeModal();
      d.parcels.forEach(q => { q.visitedThisStop = false; });
      render();
      return;
    }
    renderStop();
  });
}

// 手に持ったまま車に戻った荷物は助手席へ
function stowInHand() {
  for (const q of G.day.parcels) {
    q.visitedThisStop = false;
    if (q.inHand && q.status !== 'delivered') {
      q.inHand = false;
      if (!q.loc) { G.day.cargo.front.push(q.id); q.loc = { area: 'front' }; }
    }
  }
}

function nextAfterRetrieve(b) {
  const st = G.ui.stop;
  if (!st.situationDone) {
    st.situation = situationFor(b);
    if (st.situation) return 'situation';
  }
  st.situationDone = true;
  const p = P(st.pid);
  advance(walkMinutes(b, p) * (st.walked && hasUp('cart') ? 0.5 : 1)); // 強制帰庫になった場合は renderStop 側で閉じる
  st.walked = true;
  return 'ring';
}

function ring(b, p) {
  const d = G.day, st = G.ui.stop;
  const r = resident(st.wrongHouse || p.rid);
  let prob = presenceAt(r, d.time);
  if (!st.wrongHouse) {
    const ws = windowState(p, d.time);
    if (ws === 'ok') prob = Math.max(prob, p.redeliver ? 0.97 : 0.93);
    if (r.sleeper && d.time < 13 * 60) prob *= 0.5;
  } else prob = 1;
  const home = rand() < prob;
  if (home) {
    const v = G.save.visits[r.id] || 0;
    st.greeting = r.lines[v === 0 ? 0 : v < 3 ? 1 : 2];
    st.meeting = !st.wrongHouse && r.meeting && p.okihai && chance(0.5);
    if (st.meeting) st.greeting = r.lines[0];
    else if (r.meeting) st.greeting = r.lines[v < 3 ? 1 : 2];
    st.step = 'handover';
    sfx('ok2');
  } else {
    st.absentText = b.kind === 'mansion' ? 'インターホンに応答がない。' : (r.sleeper && d.time < 13 * 60 ? '反応がない。中で人の気配はするが…寝ているのかもしれない。' : '応答がない。留守のようだ。');
    if (b.kind === 'mansion' && p.okihai === '宅配ボックス') st.absentText += 'エントランスに宅配ボックスがある。';
    st.step = 'absent';
    sfx('click');
  }
}

function deliver(p, method, place, authorized) {
  const d = G.day, st = G.ui.stop;
  const r = resident(p.rid);
  if (advance(1)) return;
  p.status = 'delivered'; p.inHand = false; p.visitedThisStop = true;
  p.method = method === 'box' ? 'box' : method; p.deliveredAt = d.time; p.place = place || null;
  p.windowResult = windowState(p, d.time);
  const notes = [];
  let good = true;
  if (st.wrongHouse) {
    p.misdelivered = true; d.stats.misdelivery++;
    st.wrongHouse = false;
    good = false;
  }
  if (method === 'okihai' && !authorized) {
    if (p.flags.includes('cool')) { d.stats.violations.push(`クール便「${p.item}」を置き配した`); notes.push('クール便は置き配できません。'); good = false; }
    else if (!p.okihai) { d.stats.violations.push(`置き配不可の荷物（${p.name}様）を置き配した`); notes.push('この荷物は置き配不可でした…。'); good = false; }
    else if (place !== p.okihai) { d.stats.issues.push(`${p.name}様の荷物を指定と違う場所（${place}）に置き配した`); notes.push(`指定は「${p.okihai}」でした。`); good = false; }
  }
  if (p.warm) { d.stats.violations.push(`クール便「${p.item}」を保冷せずに運んだ`); notes.push('保冷していなかったため、品質が心配だ…。'); good = false; }
  if (p.damaged) { d.stats.damaged++; notes.push('中身が破損していた…。'); good = false; }
  if (p.redeliver) d.stats.redeliveryDone++;

  let txt = '';
  if (method === 'hand') {
    txt = `${esc(p.name)}様に手渡ししました。`;
    if (!p.misdelivered) {
      d.memories.push({ rid: r.id, line: st.greeting });
      G.save.visits[r.id] = (G.save.visits[r.id] || 0) + 1;
    }
  } else if (method === 'box') {
    txt = `宅配ボックスに入れ、${esc(p.name)}様に通知しました。`;
    G.save.visits[r.id] = (G.save.visits[r.id] || 0) + 1;
  } else {
    txt = `${esc(place)}に置き配し、写真を撮って記録しました。`;
    G.save.visits[r.id] = (G.save.visits[r.id] || 0) + 0.5;
  }
  const w = DATA.WINDOWS[p.window];
  if (w.from != null) txt += p.windowResult === 'ok' ? `<br><span class="tag ok">時間指定（${w.label}）OK</span>` : `<br><span class="tag bad">時間指定（${w.label}）に${p.windowResult === 'early' ? '早すぎました' : '間に合いませんでした'}</span>`;
  if (notes.length) txt += `<br><span style="color:var(--red)">${notes.join('<br>')}</span>`;
  sfx(good ? 'ok' : 'err');
  log(`${p.name}様：${method === 'hand' ? '手渡し' : method === 'box' ? '宅配ボックス' : '置き配（' + place + '）'}で配達完了。`, good ? 'good' : 'bad');
  st.doneText = txt;
  st.step = 'done';
  renderStop();
}

function carryBack(p) {
  const d = G.day, st = G.ui.stop;
  if (advance(1)) return;
  p.status = 'carry'; p.inHand = false; p.visitedThisStop = true; p.attempts++;
  G.day.cargo.front.push(p.id); p.loc = { area: 'front' };
  const r = resident(p.rid);
  // 不在票を見た受取人から、再配達の電話が来ることがある
  if (r.phone && chance(0.6)) {
    const at = d.time + randint(30, 100);
    const opts = ['w1416', 'w1618', 'w1820'].filter(k => DATA.WINDOWS[k].from >= at + 20 && presenceAt(r, DATA.WINDOWS[k].from + 30) >= 0.5);
    if (opts.length && at < DATA.SHIFT_END) d.calls.push({ pid: p.id, at, window: opts[0] });
  }
  sfx('drop');
  log(`${p.name}様は不在。不在票を投函して持ち戻り。`, 'bad');
  st.doneText = `不在票に、伝票番号と再配達の連絡先を書いて投函しました。荷物は<b>助手席</b>に置きました。<br><span class="muted">受取人から再配達の電話が来るかもしれません。</span>`;
  st.step = 'done';
  renderStop();
}

// ---------------------------------------------------------
// 5. 結果
// ---------------------------------------------------------
function finishDay() {
  const d = G.day, s = G.save;
  sfx('result', 0.4);
  const real = d.parcels.filter(p => !p.misrouted);
  const delivered = real.filter(p => p.status === 'delivered');
  const windowed = real.filter(p => p.window !== 'none' || p.redeliver);
  const winOk = delivered.filter(p => p.windowResult === 'ok' || (p.window === 'none' && p.redeliver));
  const notDelivered = real.filter(p => p.status !== 'delivered');
  const caught = d.parcels.filter(p => p.misrouted && p.status === 'aside').length;
  const missed = d.parcels.filter(p => p.misrouted && p.status !== 'aside').length;
  const wrongAside = real.filter(p => p.status === 'aside').length;
  const overtime = Math.max(0, d.time - DATA.SHIFT_END);
  const st = d.stats;

  const rows = [];
  const add = (label, n, per, kind) => { if (n) rows.push({ label, n, pts: n * per, kind }); };
  add(`配達完了 ${delivered.length}個`, delivered.length, 10, 'plus');
  add(`時間指定どおり ${winOk.length}個`, winOk.length, 6, 'plus');
  add(`エリア外の荷物を発見`, caught, 10, 'plus');
  add(`時間指定に合わなかった`, windowed.filter(p => p.status === 'delivered' && p.windowResult !== 'ok').length, -10, 'minus');
  add(`持ち戻り・未配達`, notDelivered.filter(p => p.status !== 'aside').length, -6, 'minus');
  add(`誤配`, st.misdelivery, -30, 'minus');
  add(`荷物の破損`, st.damaged, -20, 'minus');
  add(`規定違反（置き配・保冷）`, st.violations.length, -20, 'minus');
  add(`取扱いの注意`, st.issues.length, -5, 'minus');
  add(`エリア外の荷物を積んだまま`, missed, -8, 'minus');
  add(`担当の荷物を仕分けに戻した`, wrongAside, -15, 'minus');
  const otPts = -Math.floor(overtime / 10);
  if (otPts) rows.push({ label: `残業 ${Math.round(overtime)}分`, n: 1, pts: otPts, kind: 'minus' });
  const score = rows.reduce((a, r) => a + r.pts, 0);
  const max = real.length * 16 + 10;
  const ratio = score / max;
  const rank = ratio >= 0.85 ? 'S' : ratio >= 0.7 ? 'A' : ratio >= 0.5 ? 'B' : ratio >= 0.3 ? 'C' : 'D';
  const rankBonus = { S: 3000, A: 2000, B: 1000, C: 0, D: 0 }[rank];
  const wage = 6000 + delivered.length * 250 + winOk.length * 150 + rankBonus + Math.round(overtime * 20);
  const exp = Math.max(0, delivered.length * 10 + winOk.length * 5 + caught * 10 + { S: 50, A: 30, B: 15, C: 5, D: 0 }[rank]);
  const prevLevel = s.level;
  s.money += wage; s.exp += exp; s.totalDelivered += delivered.length;
  while (s.level < DATA.LEVELS.length && s.exp >= DATA.LEVELS[s.level]) s.level++;
  s.history.push({ day: s.day, rank, score, delivered: delivered.length, total: real.length, wage });
  writeSave();
  d.result = { rows, score, max, rank, wage, exp, levelUp: s.level > prevLevel, delivered, real, winOk, windowed, notDelivered, caught, missed, overtime, st };
  d.phase = 'result';
  render();
  if (d.result.levelUp) setTimeout(() => { sfx('levelup', 0.4); toast(`レベルアップ！ Lv${s.level}になりました。明日から荷物が少し増えます。`, 'good', 6000); }, 600);
}

function renderResult(scr) {
  const d = G.day, s = G.save, R = d.result;
  const comment = { S: '完璧な段取り！ 町の人も安心して荷物を待てますね。', A: 'とても良い仕事でした。', B: 'まずまずの一日。段取りを工夫すればもっと良くなります。', C: '少し慌ただしい一日でした。積み方とルートを見直してみましょう。', D: '大変な一日でした。明日は落ち着いていきましょう。' }[R.rank];
  const memories = d.memories.map(m => {
    const r = resident(m.rid);
    return `<div class="speech"><canvas width="48" height="48" data-face="${r.id}"></canvas><div><div class="sp-name">${esc(r.name)}（${esc(r.role)}）</div>${esc(m.line)}</div></div>`;
  }).join('');
  const notes = [...R.st.violations.map(v => `<li>${esc(v)}</li>`), ...R.st.issues.map(v => `<li class="info">${esc(v)}</li>`),
    ...R.real.filter(p => p.misdelivered).map(p => `<li>誤配：${esc(p.name)}様の荷物を隣の家に届けてしまった（後日、回収と謝罪に）</li>`)];

  scr.innerHTML = `
  <div class="guide"><img src="assets/icons/trophy.png" alt=""><div><b>手順5：今日の結果</b>　${s.day}日目の仕事、お疲れさまでした。給料で道具をそろえて、明日の仕事を楽にしましょう。</div></div>
  <div class="result-grid">
    <div class="panel">
      <div class="panel-head"><h2>業務評価</h2><span class="muted">帰着 ${fmt(d.time)}</span></div>
      <div class="panel-body">
        <div class="rank-wrap"><div class="rank">${R.rank}</div><div class="rank-comment">${comment}<div class="muted">スコア ${R.score} / ${R.max}</div></div></div>
        <div class="summary-row" style="margin-top:14px">
          <div class="stat"><div class="s-label">配達完了</div><div class="s-val">${R.delivered.length} / ${R.real.length}</div></div>
          <div class="stat"><div class="s-label">時間指定</div><div class="s-val">${R.winOk.length} / ${R.windowed.length}</div></div>
          <div class="stat"><div class="s-label">持ち戻り</div><div class="s-val">${R.notDelivered.filter(p => p.status !== 'aside').length}</div></div>
          <div class="stat"><div class="s-label">誤配</div><div class="s-val">${R.st.misdelivery}</div></div>
          <div class="stat"><div class="s-label">破損</div><div class="s-val">${R.st.damaged}</div></div>
        </div>
        <table class="score">${R.rows.map(r => `<tr class="${r.kind}"><td>${r.label}</td><td>${r.pts > 0 ? '+' : ''}${r.pts}</td></tr>`).join('')}
          <tr class="total"><td>合計</td><td>${R.score}</td></tr></table>
        ${notes.length ? `<ul class="issues">${notes.join('')}</ul>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>給料と経験</h2><span class="muted">所持金 ${yen(s.money)}</span></div>
      <div class="panel-body">
        <table class="score">
          <tr class="plus"><td>基本日給</td><td>${yen(6000)}</td></tr>
          <tr class="plus"><td>配達手当（${R.delivered.length}個）</td><td>${yen(R.delivered.length * 250)}</td></tr>
          <tr class="plus"><td>時間指定手当（${R.winOk.length}個）</td><td>${yen(R.winOk.length * 150)}</td></tr>
          <tr class="plus"><td>評価ボーナス（${R.rank}）</td><td>${yen({ S: 3000, A: 2000, B: 1000, C: 0, D: 0 }[R.rank])}</td></tr>
          ${R.overtime ? `<tr class="plus"><td>残業手当（${Math.round(R.overtime)}分）</td><td>${yen(R.overtime * 20)}</td></tr>` : ''}
          <tr class="total"><td>本日の給料</td><td>${yen(R.wage)}</td></tr>
        </table>
        <p>経験値 <b>+${R.exp}</b>　（Lv${s.level}${R.levelUp ? '　<span class="tag ok">レベルアップ！</span>' : ''}）</p>
        <h3 style="font-size:15px;margin:16px 0 6px">今日、町で聞いた言葉</h3>
        <div class="memories">${memories || '<p class="muted">今日は手渡しで話せた人がいませんでした。</p>'}</div>
      </div>
    </div>
  </div>
  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h2>改善ショップ</h2><span class="muted">給料を使って、仕事道具をそろえよう</span></div>
    <div class="panel-body"><div class="shop">${DATA.UPGRADES.map(u => {
      const owned = hasUp(u.id);
      return `<div class="shop-item ${owned ? 'owned' : ''}"><h4><span>${u.name}</span><span class="price">${owned ? '購入済み' : yen(u.price)}</span></h4>
        <p>${u.desc}</p><div class="row"><span class="tag">${u.effect}</span><span class="spacer"></span>
        ${owned ? '' : `<button class="btn small primary" data-buy="${u.id}" ${s.money < u.price ? 'disabled' : ''}>買う</button>`}</div></div>`;
    }).join('')}</div></div>
    <div class="panel-foot"><button class="btn" id="btn-title">タイトルへ</button><button class="btn go big" id="btn-nextday">${s.day + 1}日目へ進む →</button></div>
  </div>`;
  $$('[data-buy]', scr).forEach(el => el.onclick = () => {
    const u = DATA.UPGRADES.find(x => x.id === el.dataset.buy);
    if (s.money < u.price) return;
    s.money -= u.price; s.upgrades[u.id] = true; writeSave();
    sfx('ok'); toast(`「${u.name}」を手に入れました。`, 'good');
    render();
  });
  $('#btn-nextday').onclick = () => { sfx('click'); s.day++; writeSave(); startDay(); };
  $('#btn-title').onclick = () => { sfx('click'); G.day = null; render(); };
}

// =========================================================
// 起動
// =========================================================
function init() {
  try { G.sound = localStorage.getItem('aoba-sound') !== 'off'; } catch (e) { /* 既定はオン */ }
  const sb = $('#btn-sound');
  const syncSound = () => { $('img', sb).src = `assets/icons/${G.sound ? 'audioOn' : 'audioOff'}.png`; };
  syncSound();
  sb.onclick = () => { G.sound = !G.sound; try { localStorage.setItem('aoba-sound', G.sound ? 'on' : 'off'); } catch (e) { /* 無視 */ } syncSound(); sfx('click'); };
  $$('#steps li').forEach(li => li.onclick = () => {
    if (!li.classList.contains('clickable')) return;
    sfx('click'); setPhase(li.dataset.step);
  });
  G.save = loadSave() || defaultSave();
  TOWN.load().then(() => {
    TOWN.drawTileIcon($('#brand-icon'), 605);
    render();
  }).catch(() => {
    $('#screen').innerHTML = '<div class="panel panel-body">画像素材を読み込めませんでした。index.html と同じフォルダに assets フォルダがあるか確認してください。</div>';
  });
}
document.addEventListener('DOMContentLoaded', init);
