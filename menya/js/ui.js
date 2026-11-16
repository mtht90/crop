/* 麺屋インク — 画面描画 */
(function () {
  const D = window.MENYA_DATA, S = window.MENYA_SIM, ICONS = window.MENYA_ICONS;
  const A = (window.MENYA = { g: null, C: null, ui: { sheet: null, map: false, shop: null, sel: 'jutaku', pick: null, forStore: null, tech: null, hold: false } });
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pct = (v) => clamp(v * 100, 0, 100).toFixed(1) + '%';

  // ---- アイコン（Phosphor duotone をインラインSVGで） ----
  const ic = (n, cls) => `<svg class="${cls || 'ic'}" viewBox="0 0 256 256" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const COL = { blue: '#23408e', yolk: '#c98200', good: '#0f9a63', bad: '#e5484d', violet: '#6b4fd8', pink: '#d6409f', ink: '#5a6480', orange: '#f76b15' };
  const tile = (n, color, size) => `<span class="tile" style="--c:${COL[color] || color};--s:${size || 44}px">${ic(n, 'ti')}</span>`;
  const face = (i, size) => `<img class="av" src="assets/avatars/m${i}.svg" alt="" style="--s:${size || 40}px">`;

  function cmp(n) {
    const a = Math.abs(n);
    for (const [v, s] of [[1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']]) {
      if (a >= v) { const x = a / v; return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + s; }
    }
    return Math.round(a).toLocaleString('ja-JP');
  }
  const yen = (n) => (n < -0.5 ? '−' : '') + '¥' + cmp(n);
  const syen = (n) => (n < -0.5 ? '−' : '+') + '¥' + cmp(n);
  const num = (n) => (n >= 1e4 ? cmp(n) : n >= 100 ? Math.round(n).toLocaleString('ja-JP') : (Math.round(n * 10) / 10).toString());
  const UI = { cmp, yen, syen, ic, tile, num, A, $ };

  // ================= マップ（地図アプリ風ベクター） =================
  const SLOT_X = [-58, 0, 58], SLOT_Y = 62;
  const SEASON = [
    { ic: 'flower-tulip', tree: '#f3a9c6', park: '#d9eecb' },
    { ic: 'sun', tree: '#6fbf5b', park: '#cdeab9' },
    { ic: 'leaf', tree: '#eb9a3f', park: '#e3e6bd' },
    { ic: 'snowflake', tree: '#b9d3cc', park: '#e6efec' },
  ];
  const TREES = [[40, 322, 11], [70, 340, 9], [105, 326, 12], [955, 70, 12], [925, 95, 9], [250, 590, 12], [222, 612, 9], [305, 618, 10], [540, 585, 11], [600, 600, 13], [570, 625, 9], [972, 345, 10], [45, 70, 11], [240, 80, 10], [835, 345, 10], [480, 612, 9], [30, 615, 12], [640, 590, 9]];
  const mixHex = (a, b, t) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const x = p(a), y = p(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const mic = (n, x, y, size, color) => `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 256 256" fill="${color}">${ICONS[n]}</svg>`;

  // 区画ごとの建物ブロック（シード固定の疑似乱数で毎回同じ街並み）
  const BLOCKS = {};
  D.DISTRICTS.forEach((d, di) => {
    let seed = 7 + di * 131;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const list = [];
    for (let gy = -2; gy <= 2; gy++) for (let gx = -2; gx <= 2; gx++) {
      const cx = gx * 40, cy = gy * 40 + 4;
      if (Math.hypot(cx, cy) > 98 || rnd() < 0.08) continue;
      const tone = rnd();
      if (rnd() < 0.3) { list.push([cx - 16, cy - 16, 14, 32, tone]); list.push([cx + 2, cy - 16, 14, 32, rnd()]); }
      else if (rnd() < 0.25) { list.push([cx - 16, cy - 16, 32, 14, tone]); list.push([cx - 16, cy + 2, 32, 14, rnd()]); }
      else list.push([cx - 16, cy - 16, 32, 32, tone]);
    }
    BLOCKS[d.id] = list;
  });

  function mover(shape, path, dur, begin, auto) {
    return `<g><animateMotion dur="${dur}s" begin="${-begin}s" repeatCount="indefinite" path="${path}"${auto ? ' rotate="auto"' : ''}/>${shape}</g>`;
  }
  const carShape = (c) => `<rect x="-10" y="-5.5" width="20" height="11" rx="4" fill="${c}"/><rect x="-3" y="-4" width="8" height="8" rx="2" fill="#fff" opacity=".55"/>`;

  UI.buildMap = function () {
    const s = [];
    s.push(`<rect x="-800" y="-600" width="2600" height="1900" fill="#eef1ea"/>`);
    s.push(`<g id="parks"><ellipse cx="70" cy="330" rx="120" ry="34"/><rect x="190" y="560" width="150" height="90" rx="26"/><rect x="455" y="560" width="220" height="90" rx="26"/><ellipse cx="945" cy="80" rx="70" ry="52"/><rect x="800" y="322" width="190" height="44" rx="20"/><rect x="10" y="50" width="70" height="46" rx="18"/><rect x="215" y="56" width="52" height="46" rx="18"/></g>`);
    s.push(`<path d="M1800 380 L1000 400 C950 418 962 476 980 520 C1000 590 900 640 790 660 L740 1300 L1800 1300Z" fill="#b7ddf3"/>`);
    const river = 'M560 -600 V-10 C578 120 522 210 536 302 C550 400 522 520 560 670 V1300';
    s.push(`<path d="${river}" fill="none" stroke="#b7ddf3" stroke-width="34" stroke-linecap="round"/><path d="${river}" fill="none" stroke="#d6ecfa" stroke-width="3" stroke-dasharray="14 22" stroke-linecap="round"/>`);
    s.push(`<path d="M-800 38 H1800" stroke="#9aa3b8" stroke-width="7"/><path d="M-800 38 H1800" stroke="#eef1ea" stroke-width="3" stroke-dasharray="9 9"/>`);
    const roads = ['M-800 302 H1800', 'M292 38 V1300', 'M780 38 V1300', 'M-800 -150 H1800', 'M292 -600 V38', 'M780 -600 V38', 'M-120 -600 V1300', 'M1150 -600 V396'];
    for (const r of roads) s.push(`<path d="${r}" stroke="#d3d9e4" stroke-width="30" stroke-linecap="round"/>`);
    for (const r of roads) s.push(`<path d="${r}" stroke="#ffffff" stroke-width="25" stroke-linecap="round"/>`);
    for (const r of roads) s.push(`<path d="${r}" stroke="#e3e7ef" stroke-width="2" stroke-dasharray="10 12"/>`);
    s.push(`<g id="trees">${TREES.map(([x, y, r]) => `<circle cx="${x + 2}" cy="${y + 3}" r="${r}" fill="rgba(24,35,63,.12)"/><circle class="tr" cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`);
    s.push(`<g id="dists"></g>`);
    s.push(`<g id="traffic">` +
      mover(`<rect x="-46" y="-6" width="28" height="12" rx="4" fill="#23408e"/><rect x="-15" y="-6" width="28" height="12" rx="4" fill="#23408e"/><rect x="16" y="-6" width="30" height="12" rx="6" fill="#3a63c9"/>`, 'M-800 38 H1800', 26, 0) +
      mover(carShape('#e5484d'), 'M1800 296 H-800', 55, 0) + mover(carShape('#ffc531'), 'M-800 308 H1800', 62, 3) +
      mover(carShape('#0f9a63'), 'M1800 296 H-800', 70, 21) + mover(carShape('#6b4fd8'), 'M-800 308 H1800', 48, 30) +
      mover(carShape('#5a6480'), 'M286 1300 V50', 44, 2, true) + mover(carShape('#f76b15'), 'M298 50 V1300', 50, 9, true) +
      `<g id="scooters" hidden>` + mover(carShape('#e5484d'), 'M774 1300 V50', 34, 0, true) + mover(carShape('#e5484d'), 'M786 50 V1300', 38, 5, true) + mover(carShape('#e5484d'), 'M-800 308 H1800', 40, 8) + `</g></g>`);
    s.push(`<g id="pops"></g>`);
    s.push(`<g class="cloud"><ellipse cx="0" cy="120" rx="110" ry="30" fill="#fff" opacity=".45"/><ellipse cx="-420" cy="470" rx="140" ry="34" fill="#fff" opacity=".35"/></g>`);
    s.push(`<rect class="weather" x="-800" y="-600" width="2600" height="1900" fill="#31456f"/>`);
    $('map').innerHTML = s.join('');
    $('map').addEventListener('click', (e) => {
      const t = e.target.closest('.dist'); if (!t) return;
      A.ui.sel = t.dataset.d; A.ui.map = false; A.ui.sheet = null; UI.clearWalkers(); UI.sfx('tab'); UI.render();
    });
  };

  const repHex = (r) => (r >= 3.8 ? '#0f9a63' : r >= 2.8 ? '#e79a00' : '#e5484d');
  UI.renderMap = function () {
    const g = A.g;
    const h = D.DISTRICTS.map((d) => {
      const ds = g.dist[d.id], stores = g.stores.filter((s) => s.d === d.id), open = ds.open;
      const base = open ? d.hue : '#dfe3ea', dark = open ? mixHex(d.hue, '#18233f', 0.62) : '#8a92a8';
      let inner = `<circle class="hit" r="104" fill="${base}" opacity="${A.ui.sel === d.id ? 0.5 : 0.22}"/>`;
      for (const [x, y, w, hh, tone] of BLOCKS[d.id]) {
        inner += `<rect x="${x + 2}" y="${y + 3}" width="${w}" height="${hh}" rx="5" fill="rgba(24,35,63,.14)"/><rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="5" fill="${mixHex(base, '#ffffff', 0.15 + tone * 0.5)}"/>`;
      }
      if (A.ui.sel === d.id) inner += `<circle r="104" fill="none" stroke="${dark}" stroke-width="4" stroke-dasharray="3 9" stroke-linecap="round"/>`;
      // バッジ
      inner += `<circle cx="0" cy="-22" r="33" fill="rgba(24,35,63,.16)" transform="translate(2,4)"/><circle cx="0" cy="-22" r="33" fill="#fff"/>`;
      if (open && stores.length) inner += `<circle class="share" cx="0" cy="-22" r="33" transform="rotate(-90 0 -22)" stroke-dasharray="${(ds.share * 207).toFixed(0)} 208"/>`;
      inner += mic(open ? d.icon : 'lock', 0, -22, 40, dark);
      if (open) {
        for (let i = 0; i < 3; i++) {
          const st = stores[i], x = SLOT_X[i];
          if (st) {
            const k = 1 + st.seat * 0.07;
            inner += `<g class="pin" transform="translate(${x},${SLOT_Y})"><ellipse cx="0" cy="1" rx="10" ry="4" fill="rgba(24,35,63,.25)"/><g transform="scale(${k})" style="animation-delay:${-i * 0.7}s" class="pinb">` +
              `<path d="M0 0 C-7 -10 -19 -15 -19 -29 A19 19 0 0 1 19 -29 C19 -15 7 -10 0 0Z" fill="${repHex(st.rep)}" stroke="#fff" stroke-width="3"/>${mic('bowl-steam', 0, -29, 25, '#fff')}</g></g>`;
          } else if (i === stores.length) inner += `<circle class="pad" cx="${x}" cy="${SLOT_Y - 20}" r="16"/><path d="M${x - 7} ${SLOT_Y - 20}h14M${x} ${SLOT_Y - 27}v14" stroke="#23408e" stroke-width="3.5" stroke-linecap="round"/>`;
        }
      } else {
        inner += `<rect x="-64" y="28" width="128" height="34" rx="17" fill="#18233f"/><text class="dcost" x="0" y="53">${yen(S.unlockCost(g, d))}</text>`;
      }
      inner += `<text class="dname" x="0" y="-66" fill="${dark}">${d.name}</text>`;
      return `<g class="dist${open ? '' : ' locked'}" data-d="${d.id}" transform="translate(${d.x},${d.y})">${inner}</g>`;
    });
    $('dists').innerHTML = h.join('');
    const se = SEASON[season()];
    $('trees').style.setProperty('--tree', se.tree);
    $('parks').setAttribute('fill', se.park);
    $('scooters').toggleAttribute('hidden', !g.tech.delivery);
    const ev = g.event && D.EVENT[g.event.id];
    $('map').classList.toggle('badweather', !!ev && (ev.id === 'typhoon' || ev.id === 'rain'));
  };

  UI.pops = function (C) {
    if (document.hidden) return;
    const g = A.g, layer = $('pops');
    let n = 0;
    for (const st of g.stores) {
      const r = C.stores[st.id]; if (!r || n++ > 14) continue;
      const d = D.DISTRICT[st.d], i = g.stores.filter((s) => s.d === st.d).indexOf(st);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', 'pop' + (r.profit < 0 ? ' neg' : ''));
      t.setAttribute('x', d.x + SLOT_X[i]); t.setAttribute('y', d.y + SLOT_Y - 56 - (i % 2) * 24);
      t.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
      t.textContent = syen(r.profit);
      layer.appendChild(t);
      setTimeout(() => t.remove(), 1900);
    }
  };

  function season() { return Math.floor((((Math.floor(A.g.day / 30) + 3) % 12) + 10) % 12 / 3); }
  function dateStr() { const m = Math.floor(A.g.day / 30) + 3; return `${Math.floor(m / 12) + 1}年${(m % 12) + 1}月`; }

  // ================= HUD =================
  UI.hud = function () {
    const g = A.g, C = A.C;
    $('cash').textContent = yen(g.cash);
    $('cash').classList.toggle('neg', g.cash < 0);
    const r = $('rate'); r.textContent = syen(C.profit) + '/日'; r.classList.toggle('neg', C.profit < 0);
  };
  let lastHud = '';
  UI.hudSlow = function () {
    const g = A.g;
    $('brand').textContent = Math.round(g.brand);
    $('date').textContent = dateStr();
    $('seasonIc').innerHTML = ic(SEASON[season()].ic);
    $('speedBtn').innerHTML = g.speed === 0 ? ic('pause') : g.speed === 1 ? ic('play') : ic('fast-forward') + (g.speed > 2 ? '<b>4</b>' : '');
    $('speedBtn').classList.toggle('paused', !g.speed);
    const city = S.city(g);
    $('cityChip').innerHTML = ic(city.icon) + city.name + (g.meta.stars || g.meta.city ? ` <small>${ic('star-four')}${g.meta.stars}</small>` : '');
    const ec = $('eventChip');
    if (g.event) {
      const e = D.EVENT[g.event.id];
      ec.hidden = false; ec.className = 'chip ev ' + (e.good ? 'goodev' : 'badev');
      ec.innerHTML = ic(e.icon) + e.name + (g.event.d ? `・${D.DISTRICT[g.event.d].name}` : '') + ` <small>${g.event.left}日</small>`;
    } else ec.hidden = true;
    // ミッション
    const m = D.MISSIONS[g.mission], el = $('mission');
    if (!m) { el.hidden = true; return; }
    const v = S.missionValue(g, m, A.C), done = v >= m.n, M = S.mult(g);
    const money = m.kind === 'profit' || m.kind === 'value';
    const show = (x) => (money ? yen(x * M) : m.kind === 'rep' ? x.toFixed(1) : m.kind === 'share' ? Math.round(x) + '%' : Math.floor(x));
    const html = tile(m.icon, done ? 'ink' : 'blue', 34) + `<div class="m-mid"><div class="m-lab"><span></span><span>${show(Math.min(Math.max(v, 0), m.n))} / ${show(m.n)}</span></div>` +
      `<div class="bar"><i class="${done ? 'g' : ''}" style="width:${pct(v / m.n)}"></i></div></div>` +
      `<div class="m-rew">${done ? ic('check-circle') : ''}${m.cash ? ic('coins') + yen(m.cash * M) : m.rp ? ic('lightbulb') + '+' + m.rp : ic('star-four')}</div>`;
    el.hidden = false; el.classList.toggle('done', done);
    if (html !== lastHud) { el.innerHTML = html; lastHud = html; }
  };

  // ================= ドック（アイコンだけ） =================
  const DOCK = [
    { id: 'map', icon: 'map-trifold' }, { id: 'menu', icon: 'bowl-steam' }, { id: 'hr', icon: 'identification-badge' },
    { id: 'mkt', icon: 'megaphone' }, { id: 'lab', icon: 'microscope' }, { id: 'fin', icon: 'chart-line-up' },
  ];
  const SHEET_ICON = { menu: 'bowl-steam', hr: 'identification-badge', mkt: 'megaphone', lab: 'microscope', fin: 'chart-line-up' };
  function renderDock() {
    const g = A.g, u = A.ui;
    const dots = {
      lab: D.TECH.some((t) => S.techState(g, t) === 'open' && g.rp >= t.rp),
      fin: S.starsOnExit(g) > 0 || S.canIPO(g),
    };
    $('dock').innerHTML = DOCK.map((t) => `<button data-a="dock" data-id="${t.id}" class="${(t.id === 'map' ? u.map : u.sheet === t.id) ? 'on' : ''}${t.id === 'map' ? ' maponly' : ''}" aria-label="${t.id}">${ic(t.icon)}${dots[t.id] ? '<i class="dot"></i>' : ''}</button>`).join('');
  }

  const buy = (cost, cls) => (A.g.cash >= cost ? cls || '' : (cls || '') + ' cant');
  const dark = (d) => mixHex(d.hue, '#18233f', 0.62);
  const pipsN = (n, max, cls) => `<span class="lvp ${cls || ''}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const gauge = (icon, v, color, title) => `<span class="gauge" title="${title}" style="--c:${color}">${ic(icon)}${pipsN(Math.round(clamp(v, 0, 1) * 5), 5)}</span>`;

  // ================= 通りのシーン =================
  // 店の外観。階数=席レベル、提灯=内装、窓の点=席の埋まり具合、看板=評判
  function shopSvg(st, r, sel) {
    const F = 1 + Math.floor(st.seat / 2), top = 170 - 48 - (F - 1) * 34, occ = clamp(r.served / Math.max(1, r.seatCap), 0, 1);
    let s = `<svg class="bld${sel ? ' sel' : ''}" viewBox="0 ${top - 8} 120 ${208 - top}" aria-hidden="true">`;
    s += `<ellipse cx="60" cy="197" rx="54" ry="5" fill="rgba(24,35,63,.14)"/>`;
    s += `<rect x="12" y="${top + 27}" width="96" height="${170 - top}" rx="7" fill="#fff"/><rect x="92" y="${top + 27}" width="16" height="${170 - top}" rx="7" fill="#e9edf5"/>`;
    for (let f = 1; f < F; f++) {
      const y = 197 - 48 - f * 34 + 7;
      for (let i = 0; i < 3; i++) s += `<rect x="${21 + i * 28}" y="${y}" width="20" height="19" rx="4" fill="${occ > 0.25 + i * 0.25 ? '#ffe08a' : '#d6e2f7'}"/>`;
    }
    // 1階: 暖簾・ドア・席
    const by = 197 - 48;
    s += `<rect x="12" y="${by}" width="96" height="7" fill="#18233f" opacity=".08"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="${17 + i * 17.6}" y="${by + 3}" width="15.5" height="15" rx="3" fill="#e5484d"/>`;
    s += `<rect x="47" y="${by + 20}" width="26" height="28" rx="4" fill="#18233f"/>`;
    for (let i = 0; i < 8; i++) {
      const x = i < 4 ? 20 + (i % 2) * 12 : 88 + (i % 2) * 12 - 0, y = by + 26 + Math.floor((i % 4) / 2) * 12;
      s += `<circle cx="${x}" cy="${y}" r="4" fill="${i / 8 < occ ? '#0f9a63' : '#d9e0ee'}"/>`;
    }
    // 屋根・提灯・看板
    s += `<rect x="6" y="${top + 19}" width="108" height="11" rx="5" fill="#23408e"/>`;
    for (let i = 0; i < st.decor; i++) s += `<circle cx="${20 + i * 20}" cy="${top + 35}" r="4.5" fill="#ffc531" stroke="#c98200" stroke-width="1.5"/>`;
    s += `<circle cx="60" cy="${top + 16}" r="17" fill="#fff" stroke="#23408e" stroke-width="4"/>${mic('bowl-steam', 60, top + 16, 22, '#e5484d')}`;
    if (st.mgr) s += `<circle cx="100" cy="${top + 8}" r="13" fill="#fff"/><image href="assets/avatars/m${st.mgr.face}.svg" x="89" y="${top - 3}" width="22" height="22" clip-path="circle(50%)"/>`;
    return s + `</svg>`;
  }
  function rivalSvg(strength) {
    const F = clamp(Math.round(strength / 1.3), 1, 4), top = 170 - 48 - (F - 1) * 34;
    let s = `<svg class="bld rival" viewBox="0 ${top - 8} 120 ${208 - top}" aria-hidden="true"><ellipse cx="60" cy="197" rx="54" ry="5" fill="rgba(24,35,63,.12)"/>`;
    s += `<rect x="12" y="${top + 27}" width="96" height="${170 - top}" rx="7" fill="#c9cfdd"/>`;
    for (let f = 0; f < F; f++) for (let i = 0; i < 3; i++) s += `<rect x="${21 + i * 28}" y="${197 - 48 - f * 34 + 8}" width="20" height="${f ? 19 : 34}" rx="4" fill="#aeb6c8"/>`;
    s += `<rect x="6" y="${top + 19}" width="108" height="11" rx="5" fill="#8a92a8"/><circle cx="60" cy="${top + 16}" r="17" fill="#fff" stroke="#8a92a8" stroke-width="4"/>${mic('sword', 60, top + 16, 20, '#8a92a8')}</svg>`;
    return s;
  }
  const SKY = {};
  function skyline(d) {
    if (SKY[d.id]) return SKY[d.id];
    let seed = 99 + d.x * 7 + d.y, s = '';
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tall = clamp(d.T / 2000, 0.25, 1);
    for (let x = 0; x < 400;) { const w = 18 + rnd() * 30, h = 20 + rnd() * 120 * tall; s += `<rect x="${x.toFixed(0)}" y="${(160 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="4"/>`; x += w + 3; }
    return (SKY[d.id] = `<svg class="skyline" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">${s}</svg>`);
  }

  function renderScene() {
    const g = A.g, C = A.C, u = A.ui, d = D.DISTRICT[u.sel], ds = g.dist[d.id], info = C.dist[d.id], city = S.city(g);
    const stores = g.stores.filter((s) => s.d === d.id);
    if (!stores.some((s) => s.id === u.shop)) u.shop = stores.length ? stores[0].id : null;
    const sel = stores.find((s) => s.id === u.shop);
    $('scene').style.setProperty('--dh', d.hue);

    let h = `<div class="strip">` + D.DISTRICTS.map((x) => {
      const n = g.stores.filter((s) => s.d === x.id).length, open = g.dist[x.id].open;
      return `<button data-a="sel" data-id="${x.id}" class="${x.id === d.id ? 'on' : ''}" aria-label="${x.name}" style="--c:${open ? dark(x) : '#8a92a8'};--b:${open ? x.hue : '#e6e9f0'}">${ic(open ? x.icon : 'lock')}${n ? `<em>${n}</em>` : ''}</button>`;
    }).join('') + `</div>`;
    const prefs = D.ITEMS.filter((i) => i.id !== 'ramen' && S.districtPref(g, d, i.id) >= 1.2).map((i) => `<span style="color:${i.hue}" title="${i.name}がよく売れる">${ic(i.icon)}</span>`).join('');
    h += `<div class="dinfo">${gauge('users', info.traffic / 2000, '#23408e', '人通り')}${gauge('currency-jpy', (d.w * city.w - 0.5) / 1.6, '#c98200', '所得')}${gauge('key', d.rent / 110000, '#e5484d', '家賃')}${gauge('sword', info.rival / 5, '#5a6480', '競合')}
      ${prefs ? `<span class="likes" title="売れ筋">${ic('heart')}${prefs}</span>` : ''}
      <svg class="donut" viewBox="0 0 62 62" role="img" aria-label="シェア"><circle cx="31" cy="31" r="24" fill="#fff" stroke="var(--line)" stroke-width="8"/>
        <circle cx="31" cy="31" r="24" fill="none" stroke="var(--share)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(ds.share * 150.8).toFixed(1)} 151" transform="rotate(-90 31 31)"/><text x="31" y="36">${Math.round(ds.share * 100)}</text></svg></div>`;
    h += skyline(d) + `<div class="landmark" style="color:${dark(d)}">${ic(d.icon)}</div>`;

    h += `<div class="lots">`;
    if (!ds.open) {
      const c = S.unlockCost(g, d);
      h += `<div class="gate">${tile('lock', 'ink', 72)}<button class="btn ${buy(c)}" data-a="unlock" data-id="${d.id}">${ic('key')}<span class="cost">${yen(c)}</span></button></div>`;
    } else {
      for (let i = 0; i < 3; i++) {
        const st = stores[i];
        if (st) {
          const r = C.stores[st.id], crowd = r.demand > r.cap ? clamp(r.demand / r.cap - 1, 0, 1) : 0;
          h += `<button class="lot${st.id === u.shop ? ' on' : ''}" data-a="shop" data-id="${st.id}" data-lot="${st.id}" aria-label="店舗${i + 1}">
            <span class="plate" style="background:${repHex(st.rep)}">${ic('star')}${st.rep.toFixed(1)}</span>
            ${crowd > 0 ? `<span class="queue" title="満席で客を逃している">${ic('users')}${'<i></i>'.repeat(Math.ceil(crowd * 3))}</span>` : ''}
            ${shopSvg(st, r, st.id === u.shop)}<span class="pf ${r.profit < 0 ? 'bad' : 'good'}">${syen(r.profit)}</span></button>`;
        } else if (i === stores.length) {
          const c = S.storeCost(g, d, i);
          h += `<div class="lot vacant"><div class="plot"></div><button class="btn sm ${buy(c, g.stores.length === 0 ? 'pulse' : '')}" data-a="open" data-id="${d.id}">${ic('hammer')}<span class="cost">${yen(c)}</span></button></div>`;
        } else h += `<div class="lot vacant far"><div class="plot"></div></div>`;
      }
      h += `<div class="lot rivallot" data-lot="rival" title="競合店">${rivalSvg(info.rival)}<span class="pf">${Math.round((1 - info.share) * 100)}%</span></div>`;
    }
    h += `</div><div class="walkway"></div><div class="road"></div>`;

    // 選択中の店の操作トレイ
    h += `<div class="tray">`;
    if (sel) {
      const r = C.stores[sel.id], seatMax = sel.seat >= D.SEATS.length - 1, decMax = sel.decor >= 5;
      const sc = S.seatCost(g, sel), dc = S.decorCost(g, sel);
      const needSeat = !seatMax && r.demand > r.seatCap * 0.97, needStaff = sel.staff < S.maxStaff(sel) && r.demand > r.staffCap * 0.97 && r.staffCap < r.seatCap;
      const track = Math.max(r.cap, r.demand, 1);
      h += `<div class="load" title="客数 / 受け入れ可能数">${ic('users')}<div class="bar"><i class="g" style="width:${pct(r.served / track)}"></i>${r.demand > r.cap ? `<u style="left:${pct(r.cap / track)};right:0"></u>` : ''}</div><b>${Math.round(r.served)}</b><button class="x" data-a="close" data-id="${sel.id}" aria-label="閉店">${ic('trash')}</button></div>
        <div class="acts">
        <button class="tb ${seatMax ? 'max' : buy(sc, needSeat ? 'pulse' : '')}" data-a="seat" data-id="${sel.id}" title="席を増やす">${ic('armchair')}<b>${D.SEATS[sel.seat]}</b>${seatMax ? pipsN(5, 5) : `<span class="cost">${yen(sc)}</span>`}</button>
        <button class="tb ${decMax ? 'max' : buy(dc)}" data-a="decor" data-id="${sel.id}" title="内装（評判と客単価が上がる）">${ic('potted-plant')}${pipsN(sel.decor, 5)}${decMax ? '' : `<span class="cost">${yen(dc)}</span>`}</button>
        <div class="tb staff" title="スタッフ数">${ic('chef-hat')}<b>${sel.staff}</b><span class="pm"><button data-a="staff-" data-id="${sel.id}" aria-label="スタッフを減らす">${ic('minus')}</button><button class="${needStaff ? 'pulse' : ''}" data-a="staff+" data-id="${sel.id}" aria-label="スタッフを増やす">${ic('plus')}</button></span></div>
        <button class="tb" data-a="mgr" data-id="${sel.id}" title="店長">${sel.mgr ? face(sel.mgr.face, 34) + `<span class="pips one">${D.MGR_STATS.map((s) => (sel.mgr[s.id] ? ic(s.icon) : '')).join('')}</span>` : ic('user-circle-plus') + `<span class="cost">${ic('plus')}</span>`}</button></div>`;
    }
    h += `</div>`;
    $('sceneIn').innerHTML = h;
    measureDoors();
  }

  // ---------- 歩く客（見た目だけ。数は実際の客数に比例） ----------
  const walkers = [];
  let doors = [], spawnAcc = 0, sceneW = 390;
  function measureDoors() {
    doors = [];
    const sc = $('scene'); sceneW = sc.clientWidth || 390;
    sc.querySelectorAll('[data-lot]').forEach((el) => {
      const id = el.dataset.lot, r = id === 'rival' ? null : A.C.stores[id];
      const rivalFlow = A.C.dist[A.ui.sel].traffic * (1 - A.C.dist[A.ui.sel].share);
      doors.push({ x: el.offsetLeft + el.offsetWidth / 2, w: id === 'rival' ? rivalFlow : r ? r.served : 0, mood: id === 'rival' ? null : r, st: id });
    });
  }
  function moodIcon(r) {
    const g = A.g, st = g.stores.find((s) => s.id === +r.id);
    const v = st ? st.rep : 3;
    return v >= 4.2 ? ['smiley-wink', COL.good] : v >= 3.4 ? ['smiley', COL.good] : v >= 2.7 ? ['smiley-meh', COL.yolk] : v >= 2 ? ['smiley-sad', COL.orange] : ['smiley-angry', COL.bad];
  }
  function spawn(out, door) {
    const el = document.createElement('div'); el.className = 'wk';
    const fromLeft = Math.random() < 0.5, hue = Math.floor(Math.random() * 360);
    let emo = '';
    if (out && door.st !== 'rival') { const m = moodIcon({ id: door.st }); emo = `<span class="emo" style="color:${m[1]}">${ic(m[0])}</span>`; }
    el.innerHTML = `${emo}<img src="assets/avatars/m${Math.floor(Math.random() * D.FACE_COUNT)}.svg" alt=""><i style="background:hsl(${hue} 55% 62%)"></i>`;
    const w = { el, x: out ? door.x : fromLeft ? -24 : sceneW + 24, tx: out ? (fromLeft ? -30 : sceneW + 30) : door.x + (Math.random() - 0.5) * 8, y: Math.random() * 22, v: 34 + Math.random() * 22, out, door };
    $('walk').appendChild(el); walkers.push(w);
  }
  UI.tick = function (dt) {
    if (document.hidden || !doors.length) return;
    const total = doors.reduce((a, d) => a + d.w, 0);
    spawnAcc += dt * clamp(total / 320, 0.25, 3);
    while (spawnAcc >= 1 && walkers.length < 20) {
      spawnAcc -= 1;
      let pick = Math.random() * total, door = doors[0];
      for (const d of doors) { pick -= d.w; if (pick <= 0) { door = d; break; } }
      if (total > 0) spawn(false, door);
    }
    if (spawnAcc > 2) spawnAcc = 2;
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i], dir = Math.sign(w.tx - w.x);
      w.x += dir * w.v * dt;
      const done = dir === 0 || (dir > 0 ? w.x >= w.tx : w.x <= w.tx);
      w.el.style.transform = `translate(${w.x.toFixed(1)}px,${(-w.y).toFixed(0)}px) scaleX(${dir < 0 ? -1 : 1})`;
      if (done) {
        w.el.remove(); walkers.splice(i, 1);
        if (!w.out && Math.random() < 0.55 && doors.includes(w.door)) spawn(true, w.door);
      }
    }
  };
  UI.clearWalkers = function () { walkers.forEach((w) => w.el.remove()); walkers.length = 0; };

  // ================= シート（必要なときだけ開く） =================
  // ---------- メニュー ----------
  function faceFor(v) {
    return v >= 1.2 ? ['smiley-wink', COL.good] : v >= 1.0 ? ['smiley', COL.good] : v >= 0.85 ? ['smiley-meh', COL.yolk] : v >= 0.7 ? ['smiley-sad', COL.orange] : ['smiley-angry', COL.bad];
  }
  function itemLive(id) {
    const g = A.g, C = A.C, m = g.menu[id], it = D.ITEM[id], oi = C.items[id];
    const uc = S.unitCost(g, id), margin = (m.price - uc) / m.price;
    const v = oi.n > 0 ? oi.vsum / oi.n : S.quality(g, id) * it.ref / m.price;
    const hint = g.tech.pos && g.stores.length ? S.priceHint(g, id) : 0;
    const f = faceFor(v);
    return { price: yen(m.price), margin, face: `<span style="color:${f[1]}">${ic(f[0])}</span>`, sold: Math.round(oi.sold), hint };
  }
  const hintHtml = (h) => (h > 0 ? `<span class="good">${ic('caret-up')}</span>` : h < 0 ? `<span class="bad">${ic('caret-down')}</span>` : A.g.tech.pos ? `<span class="good">${ic('check-circle')}</span>` : '');
  function vMenu() {
    const g = A.g;
    let h = '', locked = '';
    for (const it of D.ITEMS) {
      const m = g.menu[it.id];
      if (!m.on) { locked += `<span class="lk" title="${it.name}（研究で解禁）">${tile(it.icon, 'ink', 42)}<small>${ic('lightbulb')}${D.TECHS[it.id].rp}</small></span>`; continue; }
      const L = itemLive(it.id);
      h += `<div class="card item" title="${it.name}">
        <div class="ileft">${tile(it.icon, it.hue, 54)}<span class="face" id="fc-${it.id}" title="客の満足度">${L.face}</span></div>
        <div class="grow">
          <div class="row"><div class="price" id="pv-${it.id}">${L.price}</div><span class="hint" id="hn-${it.id}">${hintHtml(L.hint)}</span><span class="grow"></span><span class="sold" title="1日の販売数">${ic('users')}<b id="sd-${it.id}">${L.sold}</b></span></div>
          <input type="range" id="pr-${it.id}" data-item="${it.id}" min="${Math.round(it.ref * 0.4 / 10) * 10}" max="${Math.round(it.ref * 2.8 / 10) * 10}" step="10" value="${m.price}" aria-label="${it.name}の価格">
          <div class="row"><div class="grade" title="素材のランク">${[1, 2, 3, 4, 5].map((n) => `<button data-a="grade" data-id="${it.id}" data-n="${n}" class="${n <= m.grade ? 'on' : ''}" aria-label="素材ランク${n}">${ic('star')}</button>`).join('')}</div>
            <div class="grow meter" title="利益率">${ic('coins')}<div class="bar"><i id="mb-${it.id}" class="${L.margin > 0.5 ? 'g' : L.margin > 0.25 ? 'y' : 'r'}" style="width:${pct(L.margin)}"></i></div><span id="mg-${it.id}">${Math.round(L.margin * 100)}%</span></div></div>
        </div></div>`;
    }
    if (locked) h += `<div class="lockrow">${ic('lock')}${locked}</div>`;
    return h;
  }
  UI.menuLive = function () {
    for (const it of D.ITEMS) {
      if (!A.g.menu[it.id].on || !$('pv-' + it.id)) continue;
      const L = itemLive(it.id);
      $('pv-' + it.id).textContent = L.price; $('sd-' + it.id).textContent = L.sold;
      $('fc-' + it.id).innerHTML = L.face; $('hn-' + it.id).innerHTML = hintHtml(L.hint);
      const mb = $('mb-' + it.id); mb.style.width = pct(L.margin); mb.className = L.margin > 0.5 ? 'g' : L.margin > 0.25 ? 'y' : 'r';
      $('mg-' + it.id).textContent = Math.round(L.margin * 100) + '%';
    }
  };

  // ---------- 人材 ----------
  const pips = (m, cls) => `<div class="pips ${cls || ''}">` + D.MGR_STATS.map((s) => `<span class="${m[s.id] ? '' : 'z'}" title="${s.name}">${ic(s.icon)}${m[s.id]}</span>`).join('') + `</div>`;
  function vHR() {
    const g = A.g, u = A.ui;
    const target = u.forStore && g.stores.find((s) => s.id === u.forStore);
    const picked = u.pick != null && g.cands[u.pick];
    let h = `<div class="cands">` + g.cands.map((m, i) => {
      if (!m) return `<div class="cand gone">${tile('check-circle', 'good', 54)}</div>`;
      const fee = S.hireFee(g, m);
      return `<button class="cand r${m.rar}${u.pick === i ? ' on' : ''}" data-a="pick" data-id="${i}" aria-label="${m.name}"><span class="rar">${['N', 'R', 'SR'][m.rar]}</span>${face(m.face, 62)}${pips(m)}
        <span class="fee ${g.cash >= fee ? '' : 'bad'}">${yen(fee)}</span></button>`;
    }).join('') + `</div>`;
    h += `<div class="row"><div class="legend grow">${D.MGR_STATS.map((s) => `<span>${ic(s.icon)}${s.name}</span>`).join('')}</div>
      <button class="btn sm ghost ${buy(S.rerollCost(g))}" data-a="reroll" title="候補を入れ替える">${ic('arrows-clockwise')}<span class="cost">${yen(S.rerollCost(g))}</span></button></div>`;
    if (!g.stores.length) return h;
    h += `<div class="rgrid">`;
    for (const st of g.stores) {
      const d = D.DISTRICT[st.d];
      h += `<button class="rcell${target === st ? ' target' : ''}${picked ? ' can' : ''}" ${picked ? `data-a="assign" data-id="${st.id}"` : `data-a="goshop" data-id="${st.id}"`} aria-label="${d.name}の店">
        <span class="tile" style="--c:${dark(d)};--s:30px;background:${d.hue}">${ic(d.icon, 'ti')}</span>${st.mgr ? face(st.mgr.face, 38) + pips(st.mgr, 'one') : tile(picked ? 'plus' : 'user-circle-plus', picked ? 'blue' : 'ink', 38)}</button>`;
    }
    return h + `</div>`;
  }

  // ---------- 宣伝 ----------
  function vMkt() {
    const g = A.g, M = S.costF(g), n = Math.sqrt(Math.max(1, g.stores.length)), t = S.brandTarget(g);
    const c = 2 * Math.PI * 48;
    let h = `<div class="mktop"><svg class="ring" viewBox="0 0 120 120" role="img" aria-label="知名度"><circle cx="60" cy="60" r="48" fill="#fff" stroke="var(--line)" stroke-width="13"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--yolk)" opacity=".6" stroke-width="13" stroke-dasharray="${(t / 100 * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)" stroke-linecap="round"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--noren)" stroke-width="13" stroke-dasharray="${(g.brand / 100 * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)" stroke-linecap="round"/>
      <text x="60" y="71">${Math.round(g.brand)}</text></svg>
      <div class="chans">`;
    for (const ch of D.MARKETING) {
      const locked = ch.tech && !g.tech[ch.tech], on = !!g.mkt[ch.id];
      h += `<button class="chan${on ? ' on' : ''}${locked ? ' locked' : ''}" ${locked ? '' : `data-a="mkt" data-id="${ch.id}"`} role="switch" aria-checked="${on}" aria-label="${ch.name}" title="${ch.name}">
        ${tile(locked ? 'lock' : ch.icon, on ? 'blue' : 'ink', 44)}<b>+${ch.brand}</b><span class="cost">${yen(ch.cost * M * n)}</span><i class="sw ${on ? 'on' : ''}"></i></button>`;
    }
    return h + `</div></div>`;
  }

  // ---------- 研究 ----------
  function vLab() {
    const g = A.g, kc = S.kaizenCost(g);
    let h = `<div class="card row labtop">
      <div class="grow">${pipsN(g.lab, 5, 'violet')}<div class="sub">${ic('lightbulb')}+${num(S.labRate(g))}　${ic('coins')}${yen(A.C.lab)}</div></div>
      <div class="stepper"><button data-a="lab-" aria-label="研究所を縮小">${ic('minus')}</button><button class="${g.lab === 0 ? 'pulse' : ''}" data-a="lab+" aria-label="研究所を拡大">${ic('plus')}</button></div>
      <span class="rpbig">${ic('lightbulb')}<b class="big">${num(Math.floor(g.rp))}</b></span></div><div class="tech">`;
    for (const t of D.TECH) {
      const st = S.techState(g, t), can = st === 'open' && g.rp >= t.rp;
      h += `<button class="${st}${can ? ' can' : ''}${A.ui.tech === t.id ? ' sel' : ''}" data-a="tech" data-id="${t.id}" aria-label="${t.name}">${tile(t.icon, st === 'done' ? 'good' : st === 'locked' ? 'ink' : 'violet', 40)}
        <span class="rp">${st === 'done' ? ic('check-circle') : st === 'locked' ? ic('lock') : ic('lightbulb') + t.rp}</span></button>`;
    }
    h += `<button class="${g.rp >= kc ? 'can' : ''}${A.ui.tech === 'kaizen' ? ' sel' : ''}" data-a="tech" data-id="kaizen" aria-label="味の改良">${tile('sparkle', 'yolk', 40)}<span class="rp">${ic('lightbulb')}${num(kc)}</span></button></div>`;
    const tid = A.ui.tech;
    if (tid === 'kaizen') {
      h += `<div class="card row techinfo">${tile('sparkle', 'yolk', 44)}<div class="grow"><div class="h">味の改良 Lv${g.kaizen || 0}</div><div class="sub">売上 +3%</div></div>
        <button class="btn ${g.rp >= kc ? '' : 'cant'}" data-a="kaizen">${ic('lightbulb')}<span class="cost">${num(kc)}</span></button></div>`;
    } else if (tid && D.TECHS[tid]) {
      const t = D.TECHS[tid], st = S.techState(g, t);
      h += `<div class="card row techinfo">${tile(t.icon, 'violet', 44)}<div class="grow"><div class="h">${t.name}</div><div class="sub">${t.fx}</div></div>
        ${st === 'done' ? tile('check-circle', 'good', 38) : st === 'locked' ? `<span class="sub">${ic('lock')}${D.TECHS[t.req].name}</span>` : `<button class="btn ${g.rp >= t.rp ? '' : 'cant'}" data-a="research" data-id="${t.id}">${ic('lightbulb')}<span class="cost">${t.rp}</span></button>`}</div>`;
    }
    return h;
  }

  // ---------- 財務 ----------
  const PL = [['cogs', 'bowl-steam', '#f08c00', '原価'], ['rent', 'key', '#e5484d', '家賃'], ['staff', 'chef-hat', '#d6409f', '人件費'], ['mkt', 'megaphone', '#23408e', '宣伝'], ['lab', 'microscope', '#6b4fd8', '研究'], ['other', 'bank', '#5a6480', '本部・利息・配当']];
  function vFin() {
    const g = A.g, C = A.C, val = S.valuation(g), M = S.mult(g);
    const v = { cogs: C.cogs, rent: C.rent, staff: C.wage + C.mgr, mkt: C.mkt, lab: C.lab, other: C.hq + C.interest + C.div };
    const cost = Object.values(v).reduce((a, b) => a + b, 0), base = Math.max(C.rev, cost, 1);
    let h = `<div class="card"><div class="row">${tile('briefcase', 'blue', 40)}<div class="big grow" title="企業価値">${yen(val)}</div><b class="num ${C.profit < 0 ? 'bad' : 'good'}">${syen(C.profit)}</b></div>
      <canvas class="chart" id="chart" width="600" height="200"></canvas>
      <div class="stack" title="売上の内訳">${PL.map((p) => (v[p[0]] > 0 ? `<i style="width:${pct(v[p[0]] / base)};background:${p[2]}"></i>` : '')).join('')}${C.profit > 0 ? `<i style="width:${pct(C.profit / base)};background:var(--good)"></i>` : ''}</div>
      <div class="plgrid">${PL.filter((p) => v[p[0]] > 0.5).map((p) => `<span title="${p[3]}" style="color:${p[2]}">${ic(p[1])}<b>${yen(v[p[0]])}</b></span>`).join('')}</div></div>`;
    const lm = S.loanMax(g), step = Math.max(1e6 * M, Math.round(lm / 4 / 1e5) * 1e5);
    const ipoGoal = D.IPO_VALUE * M, goal = S.exitGoal(g), stars = S.starsOnExit(g), nextCity = D.CITIES[Math.min(g.meta.city + 1, D.CITIES.length - 1)];
    h += `<div class="fgrid">
      <div class="card fcell" title="融資（利息 0.08%/日）">${tile('bank', 'blue', 38)}<b class="num">${yen(g.loan)}</b><div class="bar"><i class="r" style="width:${pct(g.loan / lm)}"></i></div>
        <div class="row"><button class="btn sm grow ${g.loan < lm - 1 ? '' : 'cant'}" data-a="borrow" data-n="${step}" aria-label="借りる">${ic('plus')}</button><button class="btn sm ghost grow ${g.loan > 0 && g.cash > 0 ? '' : 'cant'}" data-a="repay" data-n="${step}" aria-label="返す">${ic('minus')}</button></div></div>
      <div class="card fcell" title="株式上場（企業価値の25%を調達、以後 配当10%）">${tile('bell-ringing', 'yolk', 38)}${g.ipo ? `<b class="num good">${ic('check-circle')}</b><div class="bar"><i class="g" style="width:100%"></i></div>` : `<b class="num">+${yen(val * 0.25)}</b><div class="bar"><i style="width:${pct(val / ipoGoal)}"></i></div>
        <button class="btn sm ${S.canIPO(g) ? 'pulse' : 'cant'}" data-a="ipo" aria-label="上場する">${ic('bell-ringing')}</button>`}</div>
      <div class="card fcell exit" title="${nextCity.name}へ進出（会社を売却してのれんを得る）"><span class="tile" style="--c:#fff;--s:38px;background:rgba(255,255,255,.18)">${ic(nextCity.icon, 'ti')}</span><b class="num">${ic('star-four')}+${stars}</b><div class="bar"><i class="y" style="width:${pct(val / goal)}"></i></div>
        <button class="btn sm ${stars ? 'pulse' : 'cant'}" data-a="exit" aria-label="進出する">${ic('airplane-takeoff')}</button></div></div>`;
    h += `<div class="row"><span class="rpbig" style="color:var(--yolk-deep)">${ic('star-four')}<b class="big">${g.meta.stars}</b></span><div class="perks grow">` +
      D.PERKS.map((p) => {
        const lv = S.perk(g, p.id), c = S.perkCost(g, p), mxd = lv >= p.max;
        return `<button data-a="perk" data-id="${p.id}" class="${!mxd && g.meta.stars >= c ? '' : 'cant'}" title="${p.name} ${p.fx}">${tile(p.icon, 'yolk', 34)}<b>${p.fx}</b><span class="c">${lv ? 'Lv' + lv + ' ' : ''}${mxd ? '' : ic('star-four') + c}</span></button>`;
      }).join('') + `</div></div>`;
    h += `<div class="row" style="justify-content:center"><button class="link" data-a="credits">クレジット</button><button class="link" data-a="reset">データを消す</button></div>`;
    return h;
  }
  function drawChart() {
    const cv = $('chart'); if (!cv) return;
    const hist = A.g.hist.slice(-60), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const good = css.getPropertyValue('--good').trim(), bad = css.getPropertyValue('--bad').trim(), line = css.getPropertyValue('--line').trim();
    const mx = Math.max(1, ...hist.map((x) => x.p)), mn = Math.min(0, ...hist.map((x) => x.p));
    const y = (v) => 12 + (H - 24) * (1 - (v - mn) / (mx - mn));
    ctx.strokeStyle = line; ctx.lineWidth = 2;
    for (let i = 0; i <= 3; i++) { const yy = 12 + (H - 24) * i / 3; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
    const bw = W / 60;
    hist.forEach((x, i) => {
      const x0 = (60 - hist.length + i) * bw, y0 = y(0), y1 = y(x.p);
      ctx.fillStyle = x.p >= 0 ? good : bad;
      ctx.beginPath(); ctx.roundRect(x0 + 1.5, Math.min(y0, y1), bw - 3, Math.max(2, Math.abs(y1 - y0)), 3); ctx.fill();
    });
    ctx.strokeStyle = css.getPropertyValue('--ink').trim(); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(W, y(0)); ctx.stroke();
  }

  const VIEWS = { menu: vMenu, hr: vHR, mkt: vMkt, lab: vLab, fin: vFin };
  function renderSheet() {
    const u = A.ui, sh = $('sheet');
    sh.hidden = !u.sheet;
    if (!u.sheet) return;
    $('sheetIc').innerHTML = tile(SHEET_ICON[u.sheet], 'blue', 34);
    $('view').innerHTML = VIEWS[u.sheet]();
    if (u.sheet === 'fin') drawChart();
  }

  UI.render = function () {
    renderDock(); renderScene(); renderSheet();
    $('mapWrap').classList.toggle('open', !!A.ui.map);
    UI.renderMap(); UI.hud(); UI.hudSlow();
  };
  // 日次の再描画（操作中は見送る）
  UI.renderDay = function () {
    UI.hudSlow();
    if (A.ui.hold) return;
    if (A.ui.sheet === 'menu') { UI.menuLive(); renderDock(); renderScene(); UI.renderMap(); return; }
    const v = $('view'), sc = v.scrollTop;
    UI.render(); v.scrollTop = sc;
  };

  // ================= トースト / モーダル =================
  UI.toast = function (icon, text) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = ic(icon) + `<span>${text}</span>`;
    $('toasts').appendChild(t); setTimeout(() => t.remove(), 3300);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  };
  UI.modal = function (o) {
    const m = $('modal');
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${o.icon ? tile(o.icon, o.color || 'blue', 84) : ''}<div class="h" style="font-size:20px">${o.title}</div>${o.body || ''}
      <div class="acts">${o.acts.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${a.label}</button>`).join('')}</div></div>`;
    m.hidden = false;
    m.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b && e.target !== m) return;
      m.hidden = true; UI.sfx('click');
      if (b && o.acts[b.dataset.i].fn) o.acts[b.dataset.i].fn();
    };
  };

  window.MENYA_UI = UI;
})();
