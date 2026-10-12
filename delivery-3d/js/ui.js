// 画面表示：HUD・メーター・ナビ・会話・業務端末・メニュー・業務報告
import { T, routePath, speedLimitAt } from './town.js';
import { TIME, WINDOWS, RESIDENTS, FLAG_LABEL, UPGRADES } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const fmt = (m) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
export const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const resident = (id) => RESIDENTS.find(r => r.id === id);

let api = null; // game.js から渡される { G, ctx(), P, carried, nextStop, stopLots, cargoIssues, hasUp, slotName, ... }
export function bindUI(a) { api = a; }

// ---------------- アイコン（線画） ----------------
const ICON = {
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  box: '<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  key: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// ---------------- 通知 ----------------
const TOAST_ICON = { good: '✓', bad: '!', info: 'i', call: '☎', '': '·' };
const TOAST_TITLE = { good: '完了', bad: '注意', info: 'お知らせ', call: '電話', '': '' };
export function toast(msg, kind = '', ms = 4200) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<span class="ti">${TOAST_ICON[kind] || '·'}</span><div>${TOAST_TITLE[kind] ? `<div class="tt">${TOAST_TITLE[kind]}</div>` : ''}${msg}</div>`;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 450);
}

// ---------------- 会話（数字キーで選べる） ----------------
let dlgChoices = [];
export function dialog({ title, role, text, choices = [], grid }) {
  const G = api.G;
  G.overlay = 'dialog';
  document.exitPointerLock && document.exitPointerLock();
  dlgChoices = choices;
  const el = $('#dialog');
  el.innerHTML = `<div class="dlg" role="dialog" aria-label="${esc(title)}">
    <div class="dlg-head"><span class="dlg-name">${esc(title)}</span>${role ? `<span class="dlg-role">${esc(role)}</span>` : ''}</div>
    <div class="dlg-text">${esc(text).replace(/\n/g, '<br>')}</div>
    ${grid ? `<div class="dlg-grid">${grid.map((c, i) => `<button class="btn" data-g="${i}">${esc(c.label)}</button>`).join('')}</div>` : ''}
    <div class="dlg-choices">${choices.map((c, i) => `<button class="choice" data-c="${i}" ${c.disabled ? 'disabled' : ''}><kbd>${i + 1}</kbd><span>${esc(c.label)}</span>${c.cost ? `<span class="cost">${esc(c.cost)}</span>` : ''}</button>`).join('')}</div></div>`;
  el.classList.add('show');
  $$('[data-c]', el).forEach(b => b.onclick = () => { api.sfx('click', 0.3); choices[+b.dataset.c].use(); });
  $$('[data-g]', el).forEach(b => b.onclick = () => { api.sfx('click', 0.3); grid[+b.dataset.g].use(); });
  const first = $('.choice:not([disabled])', el); if (first) first.focus({ preventScroll: true });
}
export function dialogKey(code) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!m) return false;
  const c = dlgChoices[+m[1] - 1];
  if (c && !c.disabled) { api.sfx('click', 0.3); c.use(); }
  return true;
}
export function closeDialog() {
  $('#dialog').classList.remove('show');
  dlgChoices = [];
  if (api.G.overlay === 'dialog') api.G.overlay = null;
  api.requestLock();
}

// ---------------- 伝票 ----------------
export function slipHtml(p) {
  const w = WINDOWS[p.window];
  const r = p.rid ? resident(p.rid) : null;
  const flags = p.flags.map(f => `<span class="tag ${FLAG_LABEL[f].cls}">${FLAG_LABEL[f].label}</span>`).join('');
  const cool = p.flags.includes('cool');
  return `<div class="slip">
    <div class="slip-h ${cool ? 'cool' : ''}">${cool ? 'クール便' : '宅配便'}　お届け伝票<span>${p.no}</span></div>
    <div class="slip-b">
      <div class="slip-k">お届け先</div>
      <div class="slip-name">${esc(p.name)} 様</div>
      <div class="slip-addr ${p.misrouted ? 'warn' : ''}">${esc(p.addr)}</div>
      <div class="slip-row"><span class="tag time">${w.label}</span><span class="tag">${p.size}サイズ</span>${flags}</div>
      <div class="slip-row small">品名：${esc(p.item)}　／　ご依頼主：${esc(p.sender)}</div>
      <div class="slip-row small">${p.okihai ? `置き配：<b>可</b>（${p.okihai}）` : `置き配：<b>不可</b>　${esc(p.okihaiReason || '')}`}</div>
      ${r && api.hasUp('notify') ? `<div class="slip-row small">在宅しやすい時間：${homeHint(r)}</div>` : ''}
      ${p.damaged && p.damageNoticed ? '<div class="slip-row warn">中身が破損しているかもしれない</div>' : ''}
    </div>
  </div>`;
}
export function homeHint(r) {
  if (r.awayRate >= 0.8) return 'ほぼ在宅';
  return r.home.filter(h => h[2] >= 0.8).map(([a, b]) => (a <= 0 ? '' : fmt(a * 60)) + '〜' + (b >= 24 ? '' : fmt(b * 60))).join('・') || '不定';
}

// ---------------- HUD ----------------
let slipKey = '';
export function updateHud() {
  const G = api.G, d = G.day, ctx = api.ctx(), van = ctx.van;
  const hud = $('#hud');
  hud.classList.toggle('hidden-ui', !d || G.mode === 'title' || G.mode === 'ui' || G.overlay === 'menu' || G.overlay === 'report');
  if (!d) return;
  // 時計
  $('#hud-time').textContent = fmt(d.time);
  $('#hud-time').classList.toggle('over', d.time >= TIME.SHIFT_END);
  $('#hud-day').textContent = `${G.save.day}日目　${d.weather}`;
  const left = TIME.SHIFT_END - d.time;
  $('#hud-shift').textContent = left > 0 ? `定時まで ${fmt(left)}` : `残業 ${fmt(-left)}`;
  $('#hud-clock-note').textContent = d.clock ? (G.waiting ? '待機中（時間を早送り）' : '') : '出発前　時計は止まっています';
  // 仕事の帯
  const job = jobText();
  $('#job-label').textContent = job.label; $('#job-main').innerHTML = job.main; $('#job-meta').innerHTML = job.meta;
  // 件数
  const done = d.parcels.filter(p => p.status === 'delivered').length;
  const total = d.parcels.filter(p => !p.misrouted).length;
  const carry = d.parcels.filter(p => p.status === 'carry').length;
  const redel = d.parcels.filter(p => p.status === 'redeliver').length;
  $('#hud-count').innerHTML = `<span class="chip green">配達<b>${done}/${total}</b></span>${carry ? `<span class="chip amber">持ち戻り<b>${carry}</b></span>` : ''}${redel ? `<span class="chip">再配達<b>${redel}</b></span>` : ''}${d.stats.fines ? `<span class="chip red">反則金<b>${yen(d.stats.fines)}</b></span>` : ''}`;
  // 歩いているとき
  const walk = G.mode === 'walk';
  const f = G.focus;
  $('#crosshair').classList.toggle('show', walk);
  $('#crosshair').classList.toggle('hot', walk && !!(f && f.label));
  const pr = $('#prompt');
  if (walk && f && f.label) { $('#prompt-text').textContent = f.label; pr.classList.add('show'); } else pr.classList.remove('show');
  const look = walk && f && f.parcel ? f.parcel : (walk && G.carrying.length ? api.carried()[G.carrying.length - 1] : null);
  const key = look ? look.id + look.status + look.okihai + look.window + (look.damageNoticed ? 1 : 0) : '';
  if (key !== slipKey) { slipKey = key; $('#slip-preview').innerHTML = look ? slipHtml(look) : ''; }
  $('#slip-preview').classList.toggle('show', !!look);
  hud.classList.toggle('slip-open', !!look);
  const ci = $('#carry-info');
  if (walk && G.carrying.length) {
    ci.innerHTML = `<div class="carry-card panel"><div class="ct">手に持っている荷物</div>${api.carried().map(p => `<div class="cn">${esc(p.name)} 様</div><div class="cm">${esc(p.item)}　${p.size}サイズ</div>`).join('')}</div>`;
    ci.classList.add('show');
  } else ci.classList.remove('show');
  // 運転しているとき
  const drive = G.mode === 'drive';
  $('#cluster').classList.toggle('show', drive);
  $('#limit-sign').classList.toggle('show', drive);
  $('#navpanel').classList.toggle('show', drive || walk);
  $('#steer-ind').classList.toggle('show', drive && !!G.save.settings.mouseSteer);
  if (drive) {
    const lim = speedLimitAt(van.x, van.z);
    $('#limit-val').textContent = lim;
    $('#limit-sign').classList.toggle('over', van.kmh > lim + 5);
    drawGauge(van);
    const doors = van.hatchT > 0.5 || van.slideT > 0.5;
    const ind = [
      ['◀', 'g', van.blinkOn && (van.signal === 1 || van.hazard)], ['▶', 'g', van.blinkOn && (van.signal === -1 || van.hazard)],
      ['ライト', 'b', van.lightsOn], ['P ブレーキ', 'r', van.parkingBrake], ['クルーズ', 'a', !!van.cruise], ['ドア開', 'r', doors],
    ];
    $('#cluster-ind').innerHTML = ind.map(([t, c, on]) => `<span class="ind ${c} ${on ? 'on' : ''}">${t}</span>`).join('');
    $('#steer-ind i').style.left = `${50 + (G.mouseSteer || 0) * 50}%`;
  }
  $('#backcam-label').style.display = drive && api.hasUp('camera') && van.speed < -0.05 ? 'block' : 'none';
  // 操作のヒント
  const kh = $('#keyhint');
  kh.style.display = walk && !G.carrying.length && !(f && f.label) ? 'flex' : 'none';
  if (walk) kh.innerHTML = '<span><kbd>Tab</kbd>業務端末</span><span><kbd>F</kbd>車に乗る</span><span><kbd>Esc</kbd>メニュー</span>';
}

function jobText() {
  const G = api.G, d = G.day;
  if (!d.departed) {
    const unchecked = d.parcels.filter(p => !p.checked).length;
    const onTable = d.parcels.filter(p => p.status === 'depot' && p.loc && p.loc.type === 'world').length;
    if (unchecked) return { label: '出発準備', main: '作業台の荷物の伝票を確認する', meta: `<span>未確認 ${unchecked}個</span><span>わかば町の荷物は「仕分け戻し」へ</span>` };
    if (onTable || G.carrying.length) return { label: '出発準備', main: '荷物を車に積み込む', meta: `<span>残り ${onTable + G.carrying.length}個</span><span>業務端末（Tab）で配達順を決められます</span>` };
    return { label: '出発準備', main: 'ドアを閉めて出発する', meta: '<span>運転席の近くで F</span>' };
  }
  if (d.ended) return { label: '', main: '', meta: '' };
  const next = api.nextStop();
  if (!next) return { label: '帰庫', main: '営業所に戻って日報を書く', meta: '<span>事務机で E</span>' };
  const lot = T.lots[next];
  const ps = d.parcels.filter(p => p.lotId === next && ['loaded', 'redeliver', 'carry'].includes(p.status));
  const w = ps.find(p => p.window !== 'none');
  const who = ps.length ? `${esc(ps[0].name)} 様${ps.length > 1 ? ` ほか${ps.length - 1}個` : ''}` : '';
  return {
    label: `次の配達　${(d.route.indexOf(next) + 1) || '・'}`,
    main: `${esc(lot.name || lot.surname + 'さん宅')}　<span style="font-weight:500;color:var(--tx-2)">${who}</span>`,
    meta: `<span>${lot.address}</span>${w ? `<span class="tag time">${WINDOWS[w.window].label}</span>` : ''}${api.navDist != null ? `<span class="num">${(api.navDist / 1000).toFixed(1)} km</span>` : ''}`,
  };
}

// ---------------- メーター（HUD） ----------------
function drawGauge(van) {
  const c = $('#gauge'), g = c.getContext('2d'), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const cx = 128, cy = 128, R = 98;
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
  const kmh = van.kmh;
  g.lineCap = 'butt';
  g.lineWidth = 10; g.strokeStyle = 'rgba(206,220,232,.10)'; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  g.strokeStyle = '#f2a93b'; g.beginPath(); g.arc(cx, cy, R, a0, a0 + (a1 - a0) * Math.min(1, kmh / 120)); g.stroke();
  const lim = speedLimitAt(van.x, van.z);
  const la = a0 + (a1 - a0) * (lim / 120);
  g.lineWidth = 3; g.strokeStyle = '#e8584f'; g.beginPath(); g.arc(cx, cy, R + 9, la - 0.02, la + 0.02); g.stroke();
  g.fillStyle = '#6c7782'; g.font = '600 13px "Barlow Semi Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= 120; v += 20) {
    const a = a0 + (a1 - a0) * (v / 120);
    g.fillText(String(v), cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
  }
  g.fillStyle = '#e8ecef'; g.font = '600 64px "Barlow Semi Condensed", sans-serif';
  g.fillText(String(Math.round(kmh)), cx, cy - 4);
  g.fillStyle = '#a2acb5'; g.font = '500 15px "Barlow Semi Condensed", sans-serif'; g.fillText('km/h', cx, cy + 34);
  // 回転計（横棒）とシフト
  const bx = 262, by = 64, bw = 180, bh = 14;
  g.textAlign = 'left'; g.fillStyle = '#6c7782'; g.font = '600 12px "Barlow Semi Condensed", sans-serif'; g.fillText('×1000 r/min', bx, by - 14);
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const on = van.rpm / 7000 > i / segs;
    g.fillStyle = on ? (i >= 12 ? '#e8584f' : i >= 10 ? '#f2a93b' : '#e8ecef') : 'rgba(206,220,232,.12)';
    g.fillRect(bx + i * (bw / segs), by, bw / segs - 3, bh);
  }
  g.fillStyle = '#6c7782'; g.font = '600 11px "Barlow Semi Condensed", sans-serif';
  for (let k = 0; k <= 7; k++) g.fillText(String(k), bx + (bw / 7) * k - (k === 7 ? 6 : 0), by + bh + 12);
  g.fillStyle = '#f2a93b'; g.font = '700 58px "Barlow Semi Condensed", sans-serif'; g.textBaseline = 'alphabetic';
  g.fillText(van.gearLabel, bx, by + 96);
  g.fillStyle = '#6c7782'; g.font = '600 15px "Barlow Semi Condensed", sans-serif';
  g.fillText(['P', 'R', 'N', 'D'].map(x => x === van.gear ? `[${x}]` : x).join('  '), bx + 70, by + 92);
  if (van.cruise) { g.fillStyle = '#f2a93b'; g.font = '600 14px "Zen Kaku Gothic New", sans-serif'; g.fillText(`クルーズ ${Math.round(van.cruise * 3.6)} km/h`, bx, by + 128); }
  if (van.pbWarn > 0) { g.fillStyle = '#e8584f'; g.font = '700 14px "Zen Kaku Gothic New", sans-serif'; g.fillText('サイドブレーキ解除：Space', bx, by + 148); }
}

// ---------------- 地図の下絵（範囲を決めて描き、使い回す） ----------------
const inBox = (pts, x0, z0, x1, z1) => { const p = pts[0]; return p[0] > x0 - 300 && p[0] < x1 + 300 && p[1] > z0 - 300 && p[1] < z1 + 300; };
function makeBase(x0, z0, x1, z1, k) {
  const c = document.createElement('canvas'); c.width = Math.ceil((x1 - x0) * k); c.height = Math.ceil((z1 - z0) * k);
  const g = c.getContext('2d');
  g.fillStyle = '#121920'; g.fillRect(0, 0, c.width, c.height);
  g.scale(k, k); g.translate(-x0, -z0);
  const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); };
  const AC = { farmland: '#1c2a1d', grass: '#18261c', park: '#1a2c1e', meadow: '#18261c', heath: '#18261c', wood: '#16261a', forest: '#16261a', parking: '#1d2228', retail: '#211f22', commercial: '#211f22', construction: '#221f1a', water: '#1a3346' };
  for (const a of T.areas) if (AC[a.k] && inBox(a.pts, x0, z0, x1, z1)) poly(a.pts, AC[a.k]);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const w of T.water) { if (!inBox(w.pts, x0, z0, x1, z1)) continue; g.strokeStyle = '#24506e'; g.lineWidth = w.w + 1; g.beginPath(); w.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
  for (const b of T.buildingsMap || []) if (inBox(b, x0, z0, x1, z1)) poly(b, '#26303a');
  poly(T.depot.poly, '#1f3328');
  for (const pass of [0, 1]) for (const e of T.edges) {
    if (!inBox(e.pts, x0, z0, x1, z1) && !inBox([e.pts[e.pts.length - 1]], x0, z0, x1, z1)) continue;
    g.strokeStyle = pass ? (e.rank >= 3 ? '#5f6e7c' : '#45515d') : '#0d1216';
    g.lineWidth = e.w + (pass ? 0 : 1.6);
    g.beginPath(); e.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
  }
  return { c, x0, z0, x1, z1 };
}
// タブレットの地図：担当区域ぜんぶ
let TAB_BASE = null;
function tabletBase() { if (!TAB_BASE) TAB_BASE = makeBase(MAP_VIEW.x0, MAP_VIEW.z0, MAP_VIEW.x1, MAP_VIEW.z1, 1.4); return TAB_BASE; }
// ナビ：いる場所のまわりだけを細かく描き、離れたら描き直す
let NAV_BASE = null;
function drawBase(g, x, z) {
  if (!NAV_BASE || Math.abs(x - (NAV_BASE.x0 + 450)) > 220 || Math.abs(z - (NAV_BASE.z0 + 450)) > 220) NAV_BASE = makeBase(x - 450, z - 450, x + 450, z + 450, 2);
  const b = NAV_BASE; g.drawImage(b.c, b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
}

// ---------------- ナビ（進行方向が上） ----------------
export function drawNav(c, opts = {}) {
  const G = api.G, ctx = api.ctx();
  const g = c.getContext('2d'), W = c.width, H = c.height;
  const S = opts.scale || 1.25;
  const drive = G.mode === 'drive';
  const pl = drive ? { x: ctx.van.x, z: ctx.van.z } : { x: ctx.player.x, z: ctx.player.z };
  const fwd = drive ? ctx.van.forward : { x: -Math.sin(ctx.player.yaw), z: -Math.cos(ctx.player.yaw) };
  const ang = Math.atan2(fwd.x, -fwd.z);
  const cy = H * 0.66;
  g.save();
  g.fillStyle = '#10161b'; g.fillRect(0, 0, W, H);
  g.translate(W / 2, cy); g.rotate(-ang); g.scale(S, S); g.translate(-pl.x, -pl.z);
  drawBase(g, pl.x, pl.z);
  // 信号の位置
  g.fillStyle = 'rgba(232,88,79,.9)';
  for (const s of T.signals) { g.beginPath(); g.arc(s.x, s.z, 2.2, 0, 7); g.fill(); }
  const next = api.nextStop();
  const nav = api.navPath;
  if (nav && nav.points.length) {
    g.strokeStyle = '#5aa9e6'; g.lineWidth = 4.5 / S * 1.25; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(pl.x, pl.z); for (const p of nav.points) g.lineTo(p.x, p.z);
    const end = T.lots[next] && (T.lots[next].points.intercom || T.lots[next].points.front);
    if (end) g.lineTo(end.x, end.z);
    g.stroke();
  }
  for (const id of api.stopLots()) {
    const lot = T.lots[id];
    const idx = G.day.route.indexOf(id);
    const done = G.day.parcels.filter(p => p.lotId === id).every(p => p.status === 'delivered');
    g.save(); g.translate(lot.cx, lot.cz); g.rotate(ang);
    g.fillStyle = done ? '#4fbf7f' : id === next ? '#f2a93b' : '#a2acb5';
    g.beginPath(); g.arc(0, 0, id === next ? 6.5 : 5, 0, 7); g.fill();
    g.fillStyle = '#10161b'; g.font = '700 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(done ? '✓' : idx >= 0 ? String(idx + 1) : '', 0, 0.5);
    g.restore();
  }
  const dc = T.depot.center;
  g.save(); g.translate(dc.x, dc.z); g.rotate(ang); g.fillStyle = '#4fbf7f'; g.fillRect(-5, -5, 10, 10); g.fillStyle = '#10161b'; g.font = '700 7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('営', 0, 0.5); g.restore();
  g.restore();
  // 自車
  g.fillStyle = '#f2a93b'; g.strokeStyle = '#10161b'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(W / 2, cy - 10); g.lineTo(W / 2 + 7, cy + 7); g.lineTo(W / 2, cy + 3); g.lineTo(W / 2 - 7, cy + 7); g.closePath(); g.fill(); g.stroke();
  // 方位
  g.save(); g.translate(W - 16, 16); g.rotate(-ang); g.fillStyle = '#e8584f'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 0, -1); g.restore();
}

export function updateNavFoot() {
  const G = api.G;
  const nav = api.navPath;
  const next = api.nextStop();
  $('#nav-dist').textContent = nav && isFinite(nav.length) ? `${Math.round(nav.length)} m` : '';
  if (!G.day || !next || !nav) { $('#nav-info').innerHTML = ''; return; }
  const lot = T.lots[next];
  const eta = G.day.time + nav.length / 9 / 60 * TIME.SCALE;
  $('#nav-info').innerHTML = `<span>${esc(lot.name || lot.surname + 'さん宅')}</span><span>到着予想 <b>${api.hasUp('navi') ? fmt(eta) : '--:--'}</b></span>`;
}

// ---------------- 業務端末 ----------------
const TABS = [['list', '配達リスト', 'list'], ['map', '地図・ルート', 'map'], ['cargo', '荷台', 'box'], ['work', '業務', 'clock'], ['settings', '設定', 'gear'], ['help', '操作方法', 'key']];
export function openTablet(tab) {
  const G = api.G;
  G.overlay = 'tablet';
  G.tab = tab || G.tab || 'list';
  document.exitPointerLock && document.exitPointerLock();
  renderTablet();
  $('#tablet').classList.add('show');
}
export function closeTablet() { $('#tablet').classList.remove('show'); api.G.overlay = null; api.requestLock(); }

const STATUS = { depot: '未積載', loaded: '積載中', delivered: '配達済', carry: '持ち戻り', redeliver: '再配達依頼', aside: '仕分け戻し', left: '積み残し', asideWrong: '仕分け戻し' };
export function renderTablet() {
  const G = api.G, d = G.day, ctx = api.ctx();
  const el = $('#tablet');
  const title = TABS.find(t => t[0] === G.tab)[1];
  let body = '', sub = '';
  if (G.tab === 'list') {
    sub = `${d.parcels.length}個　配達済 ${d.parcels.filter(p => p.status === 'delivered').length}`;
    const order = (p) => { const i = d.route.indexOf(p.lotId); return p.status === 'delivered' ? 900 : i < 0 ? 500 : i; };
    body = `<div class="plist">${d.parcels.slice().sort((a, b) => order(a) - order(b)).map(p => {
      const i = d.route.indexOf(p.lotId);
      const loc = p.loc && p.loc.type === 'slot' ? api.slotName(ctx.van.slots.find(s => s.id === p.loc.slot)) : p.loc && p.loc.type === 'cooler' ? '保冷ボックス' : p.loc && p.loc.type === 'hand' ? '手に持っている' : '';
      const flags = p.flags.map(f => `<span class="tag ${FLAG_LABEL[f].cls}">${FLAG_LABEL[f].label}</span>`).join('');
      return `<div class="prow ${p.status}"><div class="ord">${i >= 0 ? i + 1 : '–'}</div>
        <div><div class="pn">${esc(p.name)} 様</div><div class="pa">${esc(p.addr)}</div></div>
        <div><div class="pi">${esc(p.item)}　${p.size}</div><div class="ptags"><span class="tag time">${WINDOWS[p.window].label}</span>${flags}</div></div>
        <div class="ploc">${loc ? esc(loc) : (p.okihai ? `置き配可（${p.okihai}）` : '置き配不可')}</div>
        <div><span class="st ${p.status}">${STATUS[p.status] || p.status}</span></div></div>`;
    }).join('')}</div>`;
  } else if (G.tab === 'map') {
    sub = '地図の配達先をクリックすると配達順に追加／解除';
    body = `<div class="tb-map"><canvas id="tb-canvas" width="900" height="620"></canvas>
      <div><h4 style="margin:0 0 4px">配達順</h4><p class="muted">上から順にナビが案内します。</p>
      <ol class="route">${d.route.map((id, i) => {
        const lot = T.lots[id]; const ps = d.parcels.filter(p => p.lotId === id && p.status !== 'delivered');
        const w = ps.map(p => WINDOWS[p.window].short).filter(x => x !== '指定なし').join(' ');
        return `<li><span class="n">${i + 1}</span><span>${esc(lot.name || lot.surname + 'さん宅')}${w ? `<div class="w">${w}</div>` : ''}</span><span class="b"><button data-up="${i}" aria-label="前へ">▲</button><button data-del="${i}" aria-label="外す">✕</button></span></li>`;
      }).join('') || '<li class="muted" style="display:block">まだ決まっていません</li>'}</ol>
      <button class="btn small" id="tb-clear">配達順をクリア</button></div></div>`;
  } else if (G.tab === 'cargo') {
    sub = '上から見た荷台。右が車の前';
    const van = ctx.van;
    const cell = (side, depth, level) => {
      if (side === 'L' && depth === 2 && level === 'floor') return `<div class="cg cooler"><b>保冷ボックス</b><br><small>${van.cooler.items.map(id => esc(api.P(id).name.split(' ')[0])).join('・') || '空'}　${van.cooler.items.length}/${van.cooler.capacity}</small></div>`;
      const s = van.slots.find(x => x.side === side && x.depth === depth && x.level === level);
      const p = s.parcel ? api.P(s.parcel) : null;
      const warn = p && ((level === 'shelf' && (p.weight >= 3 || p.flags.includes('fragile') || p.flags.includes('upright'))) || p.flags.includes('cool'));
      const idx = p ? d.route.indexOf(p.lotId) : -1;
      return `<div class="cg ${p ? 'full' : ''} ${warn ? 'warn' : ''}">${p ? `<b>${esc(p.name.split(' ')[0])}</b><br><small>${esc(p.item)}</small>${idx >= 0 ? `<i>${idx + 1}</i>` : ''}` : '<small class="muted">空き</small>'}</div>`;
    };
    body = `<div class="cargo"><p class="muted" style="margin:0">リアハッチからは「後ろ」、左のスライドドアからは「前・中央」がすぐ取り出せます。遠い場所は荷台に乗り込むので時間がかかります。</p>
      ${['shelf', 'floor'].map(level => `<div><h4>${level === 'shelf' ? '棚（上段）' : '床（下段）'}</h4><div class="cg-grid"><span></span><span class="cg-h">後ろ（ハッチ側）</span><span class="cg-h">中央</span><span class="cg-h">前（運転席側）</span>
        ${['L', 'R'].map(side => `<span class="cg-side">${side === 'L' ? '左（歩道側）' : '右'}</span>${[0, 1, 2].map(dep => cell(side, dep, level)).join('')}`).join('')}</div></div>`).join('')}
      <ul class="issues">${api.cargoIssues().map(t => `<li>${esc(t)}</li>`).join('') || '<li class="ok">積み方に問題はありません</li>'}</ul></div>`;
  } else if (G.tab === 'work') {
    const parked = Math.abs(ctx.van.speed) < 0.3;
    sub = `${G.save.day}日目`;
    const done = d.parcels.filter(p => p.status === 'delivered').length;
    body = `<div class="form">
      <div class="stats" style="margin:0"><div><span>現在</span><b>${fmt(d.time)}</b></div><div><span>定時</span><b>${fmt(TIME.SHIFT_END)}</b></div><div><span>配達済</span><b>${done}/${d.parcels.filter(p => !p.misrouted).length}</b></div></div>
      <p class="muted" style="margin:0">時間指定より早く着いたときは、車を停めて待機できます。運転中は停車して T キーを押し続けても時間が早く進みます。</p>
      <div style="display:flex;gap:8px"><button class="btn" data-wait="10" ${!d.clock || !parked ? 'disabled' : ''}>10分待つ</button><button class="btn" data-wait="30" ${!d.clock || !parked ? 'disabled' : ''}>30分待つ</button></div>
      ${!d.clock ? '<p class="muted" style="margin:0">出発すると時計が動き出します。</p>' : ''}
    </div>`;
  } else if (G.tab === 'settings') {
    sub = '操作と表示';
    body = settingsHtml();
  } else {
    sub = 'キーボードとマウス';
    body = helpHtml();
  }
  el.innerHTML = `<div class="term" role="dialog" aria-label="業務端末">
    <nav class="tb-nav"><div class="tb-brand"><b>あおば運輸</b><span>業務端末</span></div>
      ${TABS.map(([k, l, ic]) => `<button data-tab="${k}" class="${G.tab === k ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}
      <span class="sp"></span><div class="clock">${fmt(d.time)}</div></nav>
    <div class="tb-main"><div class="tb-top"><h2>${title}</h2><span class="sub">${sub}</span><span class="sp"></span><button class="btn small" id="tb-close">閉じる <kbd>Tab</kbd></button></div>
      <div class="tb-body">${body}</div></div></div>`;
  $$('[data-tab]', el).forEach(b => b.onclick = () => { G.tab = b.dataset.tab; api.sfx('click', 0.3); renderTablet(); });
  $('#tb-close', el).onclick = closeTablet;
  if (G.tab === 'map') {
    drawTabletMap();
    const cv = $('#tb-canvas');
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const w = mapToWorld((e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height);
      // 当たりの半径は画面上で約 20px（地図の縮尺に合わせる）
      let best = null, bd = 20 * (cv.width / r.width) / mapScale();
      for (const id of api.stopLots()) { const l = T.lots[id]; const dd = Math.hypot(l.cx - w.x, l.cz - w.z); if (dd < bd) { bd = dd; best = id; } }
      if (best) { const i = d.route.indexOf(best); if (i >= 0) d.route.splice(i, 1); else d.route.push(best); api.sfx('select', 0.3); renderTablet(); }
    };
    $$('[data-up]', el).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [d.route[i - 1], d.route[i]] = [d.route[i], d.route[i - 1]]; renderTablet(); } });
    $$('[data-del]', el).forEach(b => b.onclick = () => { d.route.splice(+b.dataset.del, 1); renderTablet(); });
    $('#tb-clear').onclick = () => { d.route = []; renderTablet(); };
  }
  $$('[data-wait]', el).forEach(b => b.onclick = () => { api.waitMinutes(+b.dataset.wait); renderTablet(); });
  bindSettings(el, renderTablet);
}

const MAP_VIEW = { x0: -440, z0: -380, x1: 440, z1: 380 };
// 担当区域（配達先と営業所を囲む範囲）を地図の範囲にする
export function setMapView() {
  const pts = Object.values(T.lots).filter(l => l.residents && l.residents.length).map(l => [l.cx, l.cz]).concat([[T.depot.center.x, T.depot.center.z]]);
  let x0 = Math.min(...pts.map(p => p[0])) - 140, x1 = Math.max(...pts.map(p => p[0])) + 140, z0 = Math.min(...pts.map(p => p[1])) - 140, z1 = Math.max(...pts.map(p => p[1])) + 140;
  const want = 900 / 620, w = x1 - x0, h = z1 - z0;
  if (w / h < want) { const add = (h * want - w) / 2; x0 -= add; x1 += add; } else { const add = (w / want - h) / 2; z0 -= add; z1 += add; }
  Object.assign(MAP_VIEW, { x0, z0, x1, z1 }); TAB_BASE = null;
}
const mapScale = (W = 900, H = 620) => Math.min(W / (MAP_VIEW.x1 - MAP_VIEW.x0), H / (MAP_VIEW.z1 - MAP_VIEW.z0));
const worldToMap = (x, z) => { const s = mapScale(); return { x: (x - MAP_VIEW.x0) * s, y: (z - MAP_VIEW.z0) * s }; };
const mapToWorld = (mx, my) => { const s = mapScale(); return { x: mx / s + MAP_VIEW.x0, z: my / s + MAP_VIEW.z0 }; };
function drawTabletMap() {
  const G = api.G, d = G.day, ctx = api.ctx();
  const c = $('#tb-canvas'), g = c.getContext('2d');
  g.fillStyle = '#121920'; g.fillRect(0, 0, c.width, c.height);
  { const a = worldToMap(MAP_VIEW.x0, MAP_VIEW.z0), b = worldToMap(MAP_VIEW.x1, MAP_VIEW.z1); g.drawImage(tabletBase().c, a.x, a.y, b.x - a.x, b.y - a.y); }
  g.fillStyle = 'rgba(232,88,79,.9)';
  for (const s of T.signals) { const p = worldToMap(s.x, s.z); g.beginPath(); g.arc(p.x, p.y, 3, 0, 7); g.fill(); }
  let prev = T.depot.front;
  g.strokeStyle = 'rgba(90,169,230,.85)'; g.lineWidth = 3; g.setLineDash([7, 5]);
  for (const id of d.route) {
    const lot = T.lots[id];
    const to = lot.points.front || { x: lot.cx, z: lot.cz };
    const path = routePath(prev, to).points;
    g.beginPath(); path.forEach((p, i) => { const m = worldToMap(p.x, p.z); if (i) g.lineTo(m.x, m.y); else g.moveTo(m.x, m.y); }); g.stroke();
    prev = to;
  }
  g.setLineDash([]);
  const me = worldToMap(G.mode === 'drive' ? ctx.van.x : ctx.player.x, G.mode === 'drive' ? ctx.van.z : ctx.player.z);
  g.fillStyle = '#f2a93b'; g.beginPath(); g.arc(me.x, me.y, 6, 0, 7); g.fill();
  for (const id of api.stopLots()) {
    const lot = T.lots[id], m = worldToMap(lot.cx, lot.cz);
    const idx = d.route.indexOf(id);
    const ps = d.parcels.filter(p => p.lotId === id);
    const done = ps.every(p => p.status === 'delivered');
    g.fillStyle = done ? '#4fbf7f' : ps.some(p => p.status === 'redeliver') ? '#b48ce0' : ps.some(p => p.status === 'carry') ? '#f2a93b' : '#e8ecef';
    g.beginPath(); g.arc(m.x, m.y, 11, 0, 7); g.fill();
    g.fillStyle = '#10161b'; g.font = '700 12px "Barlow Semi Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(done ? '✓' : idx >= 0 ? String(idx + 1) : '+', m.x, m.y + 1);
    const ws = ps.filter(p => p.window !== 'none' && p.status !== 'delivered').map(p => WINDOWS[p.window].short);
    g.fillStyle = '#c9d1d8'; g.font = '500 12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left';
    g.fillText((lot.name || lot.surname) + (ws.length ? `  ${ws.join(' ')}` : ''), m.x + 15, m.y + 1);
  }
  const off = worldToMap(T.depot.center.x, T.depot.center.z); g.fillStyle = '#4fbf7f'; g.fillRect(off.x - 10, off.y - 10, 20, 20); g.fillStyle = '#10161b'; g.textAlign = 'center'; g.font = '700 12px "Zen Kaku Gothic New", sans-serif'; g.fillText('営', off.x, off.y + 1);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

// ---------------- 設定・操作方法 ----------------
function settingsHtml() {
  const s = api.G.save.settings;
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<div class="form">
    <label class="field"><span>マウス感度</span><input type="range" id="set-sens" min="0.3" max="2.2" step="0.1" value="${s.sens}"></label>
    <div class="field"><span>ハンドル操作</span>${seg('mouseSteer', [['false', 'キーボード'], ['true', 'マウス']])}</div>
    <label class="field"><span>マウスハンドルの感度</span><input type="range" id="set-msteer" min="0.3" max="2" step="0.1" value="${s.mouseSteerSens}"></label>
    <label class="field"><span>効果音の音量</span><input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.vol}"></label>
    <label class="field"><span>エンジン音の音量</span><input type="range" id="set-evol" min="0" max="1" step="0.05" value="${s.engineVol}"></label>
    <div class="field"><span>画質</span>${seg('quality', [['high', '高'], ['low', '軽量']])}</div>
    <div class="field"><span>ドアミラー</span>${seg('mirrors', [['true', '映す'], ['false', '映さない']])}</div>
    <p class="muted" style="margin:0">マウスハンドルでは、マウスを左右に動かすとハンドルが回ります。右ボタンを押している間は見回しになります。</p>
  </div>`;
}
function bindSettings(el, rerender) {
  const s = api.G.save.settings;
  const on = (id, key) => { const i = $(id, el); if (i) i.oninput = () => { s[key] = +i.value; api.applySettings(); }; };
  on('#set-sens', 'sens'); on('#set-msteer', 'mouseSteerSens'); on('#set-vol', 'vol'); on('#set-evol', 'engineVol');
  $$('[data-set]', el).forEach(b => b.onclick = () => {
    const v = b.dataset.val; s[b.dataset.set] = v === 'true' ? true : v === 'false' ? false : v;
    api.applySettings(); api.sfx('click', 0.3); rerender();
  });
}
function helpHtml() {
  if (document.body.classList.contains('touch')) {
    const t = [
      ['歩く', '左下のスティック（倒した分だけ速く）　「走る」で小走り'],
      ['見回す', 'ボタンのない場所を指でドラッグ'],
      ['調べる・持つ・積む・置く', '画面中央で狙って「操作」、または出てきた案内をタップ'],
      ['車に乗る・降りる', '運転席のドアの近くで「乗る」／運転中は「降りる」'],
      ['アクセル・ブレーキ', '右下のペダル（下の方を押すほど強く踏む）。止まってからブレーキを押し続けるとバック'],
      ['ハンドル', '左下のスティックを左右に'],
      ['サイドブレーキ・ウインカー', '「サイド」「◀」「▶」「ハザード」「ホーン」'],
      ['視点', '「視点」で 運転席 → 後ろから → ボンネット'],
      ['業務端末・メニュー', '右上の「端末」「メニュー」'],
    ];
    return `<table class="keys">${t.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table><p class="muted">スマホは画面を横向きにして遊んでください。重いときは設定で「画質：軽量」に。</p>`;
  }
  const rows = [
    ['歩く', '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>　走る <kbd>Shift</kbd>　見回す マウス'],
    ['調べる・持つ・積む・置く', '画面中央で狙って <kbd>E</kbd>'],
    ['車に乗る・降りる', '<kbd>F</kbd>'],
    ['アクセル・ブレーキ', '<kbd>W</kbd> <kbd>S</kbd>（止まってからもう一度 <kbd>S</kbd> でバック）'],
    ['ハンドル', '<kbd>A</kbd> <kbd>D</kbd>（設定でマウス操作に切り替え）'],
    ['サイドブレーキ', '<kbd>Space</kbd>（乗ったときはかかっています）'],
    ['ウインカー・ハザード', '<kbd>Q</kbd> 左　<kbd>E</kbd> 右　<kbd>G</kbd> ハザード（曲がり終わると自動で戻る）'],
    ['ライト・クラクション', '<kbd>L</kbd>　<kbd>H</kbd>'],
    ['クルーズコントロール', '<kbd>C</kbd>（ブレーキで解除）'],
    ['視点', '<kbd>1</kbd> 運転席　<kbd>2</kbd> 後ろから　<kbd>3</kbd> ボンネット　<kbd>V</kbd> 切り替え'],
    ['待機（停車中）', '<kbd>T</kbd> を押し続ける'],
    ['業務端末', '<kbd>Tab</kbd>'],
    ['メニュー', '<kbd>Esc</kbd>'],
    ['会話の選択肢', '<kbd>1</kbd>〜<kbd>9</kbd> またはクリック'],
  ];
  return `<table class="keys">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
}

// ---------------- メインメニュー・一時停止 ----------------
export function showMenu(kind, side) {
  const G = api.G;
  G.overlay = 'menu';
  G.menuKind = kind;
  document.exitPointerLock && document.exitPointerLock();
  const saved = api.peekSave();
  const el = $('#menu');
  const items = kind === 'title'
    ? [saved ? ['continue', `続きから`, `${saved.day}日目`, true] : ['new', '仕事をはじめる', '1日目', true], ...(saved ? [['new', 'はじめから', '']] : []), ['settings', '設定', ''], ['help', '操作方法', ''], ['credits', '素材とクレジット', '']]
    : [['resume', '仕事にもどる', '', true], ['settings', '設定', ''], ['help', '操作方法', ''], ['title', 'タイトルへ', '進行は自動保存済み']];
  let sideHtml = '';
  if (side === 'settings') sideHtml = `<h3>設定</h3>${settingsHtml()}`;
  else if (side === 'help') sideHtml = `<h3>操作方法</h3>${helpHtml()}`;
  else if (side === 'credits') sideHtml = `<h3>素材とクレジット</h3>${creditsHtml()}`;
  else if (side === 'confirm-new') sideHtml = `<h3>はじめから遊びますか？</h3><div class="confirm"><p class="muted" style="margin:0">今の進行（${saved ? saved.day : 1}日目・所持金 ${saved ? yen(saved.money) : ''}）は消えます。</p><div class="row"><button class="btn primary" id="cf-yes">はじめからにする</button><button class="btn" id="cf-no">やめる</button></div></div>`;
  el.innerHTML = `<div class="mm">
      <div class="mm-brand"><span class="mark">あ</span>あおば運輸　あおば町営業所</div>
      <h1>あおば町 宅配日誌</h1>
      <p class="tag-line">${kind === 'title' ? '地方の町の新人ドライバーとして、荷物を確かめ、軽バンに積み、町を走って届ける。' : '一時停止中'}</p>
      ${kind === 'title' && saved ? `<div class="save">${saved.day}日目　Lv${saved.level}　${yen(saved.money)}</div>` : ''}
      ${items.map(([k, l, s, primary]) => `<button class="mi ${primary ? 'primary' : ''} ${side === k ? 'on' : ''}" data-m="${k}"><span>${l}</span>${s ? `<small>${s}</small>` : ''}</button>`).join('')}
      <div class="mm-foot">${kind === 'title' ? (document.body.classList.contains('touch') ? 'タッチ操作で遊べます。左下のスティックで移動、画面のドラッグで見回し。' : 'キーボードとマウスで遊びます。画面をクリックするとマウスで見回せます（Esc で解除）。') : ''}</div>
    </div>
    <div class="mm-side">${sideHtml ? `<div class="panel">${sideHtml}</div>` : ''}</div>`;
  el.classList.add('show');
  $$('[data-m]', el).forEach(b => b.onclick = () => {
    api.sfx('click', 0.3);
    const k = b.dataset.m;
    if (k === 'continue') { closeMenu(); api.startGame(false); }
    else if (k === 'new') { if (saved) showMenu(kind, 'confirm-new'); else { closeMenu(); api.startGame(true); } }
    else if (k === 'resume') { closeMenu(); api.requestLock(); }
    else if (k === 'title') { closeMenu(); api.toTitle(); }
    else showMenu(kind, side === k ? null : k);
  });
  const y = $('#cf-yes', el); if (y) y.onclick = () => { closeMenu(); api.startGame(true); };
  const n = $('#cf-no', el); if (n) n.onclick = () => showMenu(kind);
  bindSettings(el, () => showMenu(kind, side));
  const first = $('.mi', el); if (first) first.focus({ preventScroll: true });
}
export function closeMenu() { $('#menu').classList.remove('show'); if (api.G.overlay === 'menu') api.G.overlay = null; }
function creditsHtml() {
  return `<table class="keys">
    <tr><td>3D素材（地面・建物の質感、段ボール、室外機など）・空</td><td><a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a>（CC0）</td></tr>
    <tr><td>人物・犬・動き</td><td><a href="https://github.com/microsoft/Microsoft-Rocketbox" target="_blank" rel="noopener">Microsoft Rocketbox</a>（MIT）</td></tr>
    <tr><td>町の道路・建物の配置（実在する地方都市の郊外がもと。名前は架空）</td><td>地図データ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>（ODbL）</td></tr>
    <tr><td>効果音</td><td><a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a>（CC0）</td></tr>
    <tr><td>3D描画</td><td><a href="https://threejs.org" target="_blank" rel="noopener">three.js</a>（MIT）</td></tr>
    <tr><td>フォント</td><td>Zen Kaku Gothic New・Barlow Semi Condensed（OFL）</td></tr></table>
    <p class="muted">家・車・電柱などの形はプログラムで組み立て、実写の質感を貼っています。</p>`;
}

// ---------------- 業務報告 ----------------
export function showReport() {
  const G = api.G, d = G.day, s = G.save, R = d.result;
  G.overlay = 'report'; G.mode = 'ui';
  document.exitPointerLock && document.exitPointerLock();
  const comment = { S: '見事な段取りでした。', A: 'とても良い仕事でした。', B: 'まずまずの一日でした。', C: '少し慌ただしい一日でした。', D: '大変な一日でした。明日は落ち着いていきましょう。' }[R.rank];
  const el = $('#report');
  el.innerHTML = `<div class="rep" role="dialog" aria-label="業務報告">
    <div class="rep-head"><div class="rank">${R.rank}</div><div><div class="muted">${s.day}日目　業務報告　帰着 ${fmt(d.time)}</div><h2>${comment}</h2><div class="rank-sub">評価点 ${R.score} / ${R.max}　経験値 +${R.exp}　Lv${s.level}${R.levelUp ? '（レベルアップ：明日から荷物が増えます）' : ''}</div></div>
      <span class="sp"></span><div class="rep-pay"><div class="muted">本日の支給額</div><div class="big">${yen(R.net)}</div><div class="muted">所持金 ${yen(s.money)}</div></div></div>
    <div class="rep-grid">
      <div class="rep-col">
        <h3>配達の結果</h3>
        <div class="stats">
          <div><span>配達完了</span><b>${R.delivered.length}/${R.real.length}</b></div>
          <div><span>時間指定どおり</span><b>${R.winOk.length}/${R.windowed.length}</b></div>
          <div><span>持ち戻り</span><b>${R.notDelivered.length}</b></div>
          <div><span>誤配</span><b>${d.stats.misdelivery}</b></div>
          <div><span>破損</span><b>${d.stats.damaged}</b></div>
          <div><span>交通違反</span><b>${d.stats.violations.filter(v => v.fine).length}</b></div>
        </div>
        <h3>評価の内訳</h3>
        <table class="score">${R.rows.map(r => `<tr class="${r.kind}"><td>${esc(r.label)}</td><td>${r.pts > 0 ? '+' : ''}${r.pts}</td></tr>`).join('')}<tr class="total"><td>合計</td><td>${R.score}</td></tr></table>
      </div>
      <div class="rep-col">
        <h3>給与明細</h3>
        <table class="score">
          <tr><td>基本日給</td><td>${yen(6000)}</td></tr>
          <tr><td>配達手当（${R.delivered.length}個）</td><td>${yen(R.delivered.length * 250)}</td></tr>
          <tr><td>時間指定手当（${R.winOk.length}個）</td><td>${yen(R.winOk.length * 150)}</td></tr>
          <tr><td>評価手当（${R.rank}）</td><td>${yen(R.bonus)}</td></tr>
          ${R.overtime ? `<tr><td>残業手当（${Math.round(R.overtime)}分）</td><td>${yen(R.overtime * 20)}</td></tr>` : ''}
          ${d.stats.fines ? `<tr class="minus"><td>反則金・修理代</td><td>−${yen(d.stats.fines)}</td></tr>` : ''}
          <tr class="total"><td>支給額</td><td>${yen(R.net)}</td></tr>
        </table>
        <h3 style="margin-top:18px">今日、町で聞いた言葉</h3>
        <div class="voices">${d.memories.map(m => { const r = resident(m.rid); return `<div class="voice"><b>${esc(r.name)}　${esc(r.role)}</b>「${esc(m.line)}」</div>`; }).join('') || '<p class="muted">今日は手渡しで話せた人がいませんでした。</p>'}</div>
      </div>
    </div>
    <div class="rep-col" style="border-top:1px solid var(--line);padding-bottom:6px"><h3>装備をそろえる</h3></div>
    <div class="shop">${UPGRADES.map(u => `<div class="shop-item ${api.hasUp(u.id) ? 'owned' : ''}"><h4>${u.name}<span>${api.hasUp(u.id) ? '購入済み' : yen(u.price)}</span></h4><p>${u.desc}</p>${api.hasUp(u.id) ? '' : `<button class="btn small ${s.money >= u.price ? 'primary' : ''}" data-buy="${u.id}" ${s.money < u.price ? 'disabled' : ''}>購入する</button>`}</div>`).join('')}</div>
    <div class="rep-foot"><button class="btn" id="rp-title">タイトルへ</button><button class="btn primary" id="rp-next">${s.day + 1}日目の仕事へ</button></div>
  </div>`;
  el.classList.add('show');
  $$('[data-buy]', el).forEach(b => b.onclick = () => { if (api.buy(b.dataset.buy)) showReport(); });
  $('#rp-next').onclick = () => { el.classList.remove('show'); api.nextDay(); };
  $('#rp-title').onclick = () => { el.classList.remove('show'); api.toTitle(); };
}
