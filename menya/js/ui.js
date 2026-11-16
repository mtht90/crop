/* 麺屋インク — 画面描画 */
(function () {
  const D = window.MENYA_DATA, S = window.MENYA_SIM, ICONS = window.MENYA_ICONS;
  const A = (window.MENYA = { g: null, C: null, ui: { tab: 'shop', sel: 'jutaku', pick: null, forStore: null, tech: null, hold: false } });
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

  const TABS = [
    { id: 'shop', name: '店舗', icon: 'storefront' },
    { id: 'menu', name: 'メニュー', icon: 'bowl-steam' },
    { id: 'hr', name: '人材', icon: 'chef-hat' },
    { id: 'mkt', name: '宣伝', icon: 'megaphone' },
    { id: 'lab', name: '研究', icon: 'microscope' },
    { id: 'fin', name: '財務', icon: 'chart-line-up' },
  ];

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
      A.ui.sel = t.dataset.d; A.ui.tab = 'shop'; UI.sfx('tab'); UI.render();
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
    const html = tile(m.icon, done ? 'ink' : 'blue', 34) + `<div class="m-mid"><div class="m-lab"><span>${D.MISSION_LABEL[m.kind]}</span><span>${show(Math.min(Math.max(v, 0), m.n))} / ${show(m.n)}</span></div>` +
      `<div class="bar"><i class="${done ? 'g' : ''}" style="width:${pct(v / m.n)}"></i></div></div>` +
      `<div class="m-rew">${done ? '受け取る ' : ''}${m.cash ? ic('coins') + yen(m.cash * M) : m.rp ? ic('lightbulb') + '+' + m.rp : ic('star-four')}</div>`;
    el.hidden = false; el.classList.toggle('done', done);
    if (html !== lastHud) { el.innerHTML = html; lastHud = html; }
  };

  // ================= タブ =================
  function renderTabs() {
    const g = A.g;
    const dots = {
      lab: D.TECH.some((t) => S.techState(g, t) === 'open' && g.rp >= t.rp),
      fin: S.starsOnExit(g) > 0 || S.canIPO(g),
    };
    $('tabs').innerHTML = TABS.map((t) => `<button data-a="tab" data-id="${t.id}" class="${A.ui.tab === t.id ? 'on' : ''}">${ic(t.icon)}${t.name}${dots[t.id] ? '<i class="dot"></i>' : ''}</button>`).join('');
  }

  const buy = (cost, cls) => (A.g.cash >= cost ? cls || '' : (cls || '') + ' cant');
  const repColor = (r) => (r >= 3.8 ? 'g' : r >= 2.8 ? 'y' : 'r');
  const dark = (d) => mixHex(d.hue, '#18233f', 0.62);

  // ---------- 店舗 ----------
  function vShop() {
    const g = A.g, C = A.C, d = D.DISTRICT[A.ui.sel], ds = g.dist[d.id], info = C.dist[d.id], city = S.city(g);
    let h = `<div class="strip">` + D.DISTRICTS.map((x) => {
      const n = g.stores.filter((s) => s.d === x.id).length, open = g.dist[x.id].open;
      return `<button data-a="sel" data-id="${x.id}" class="${x.id === d.id ? 'on' : ''}${open ? '' : ' lock'}" aria-label="${x.name}" style="--c:${open ? dark(x) : '#8a92a8'};--b:${open ? x.hue : '#e6e9f0'}">${ic(open ? x.icon : 'lock')}${n ? `<em>${n}</em>` : ''}</button>`;
    }).join('') + `</div>`;

    const prefs = D.ITEMS.filter((i) => i.id !== 'ramen').map((i) => {
      const p = S.districtPref(g, d, i.id);
      return p >= 1.2 ? `<span style="color:${i.hue}">${ic(i.icon)}${ic('caret-up')}</span>` : p <= 0.8 ? `<span class="dn">${ic(i.icon)}${ic('caret-down')}</span>` : '';
    }).join('');
    const sh = ds.share;
    h += `<div class="card dhead"><span class="tile" style="--c:${dark(d)};--s:58px;background:${d.hue}">${ic(d.icon, 'ti')}</span>
      <div class="grow">
        <div class="h">${d.name}</div>
        <div class="stats">
          <span>人通り</span><div class="bar"><i style="width:${pct(info.traffic / 2200)}"></i></div>
          <span>所得</span><div class="bar"><i class="y" style="width:${pct(d.w * city.w / 2.2)}"></i></div>
          <span>家賃</span><div class="bar"><i class="r" style="width:${pct(d.rent / 120000)}"></i></div>
          <span>競合</span><div class="bar"><i class="r" style="width:${pct(info.rival / 6)}"></i></div>
        </div>
      </div>
      <div class="donutbox">
        <svg class="donut" viewBox="0 0 62 62"><circle cx="31" cy="31" r="24" fill="none" stroke="var(--line)" stroke-width="8"/>
        <circle cx="31" cy="31" r="24" fill="none" stroke="var(--share)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(sh * 150.8).toFixed(1)} 151" transform="rotate(-90 31 31)"/>
        <text x="31" y="35.5">${Math.round(sh * 100)}%</text></svg>
        <div class="sub">シェア</div>
      </div></div>`;
    if (prefs) h += `<div class="prefs"><span class="sub">売れ筋</span>${prefs}</div>`;

    if (!ds.open) {
      const c = S.unlockCost(g, d);
      return h + `<div class="card lockcard">${tile('lock', 'ink', 56)}
        <button class="btn ${buy(c)}" data-a="unlock" data-id="${d.id}">${ic('key')}エリア進出 <span class="cost">${yen(c)}</span></button></div>`;
    }
    const stores = g.stores.filter((s) => s.d === d.id);
    for (const st of stores) {
      const r = C.stores[st.id];
      const track = Math.max(r.cap, r.demand, 1), over = Math.max(0, r.demand - r.cap);
      const seatMax = st.seat >= D.SEATS.length - 1, decMax = st.decor >= 5;
      const sc = S.seatCost(g, st), dc = S.decorCost(g, st);
      const needSeat = !seatMax && r.demand > r.seatCap * 0.97, needStaff = st.staff < S.maxStaff(st) && r.demand > r.staffCap * 0.97 && r.staffCap < r.seatCap;
      h += `<div class="card store">
        <div class="top">${tile('storefront', repHex(st.rep), 46)}
          <div class="grow">
            <div class="stars">${ic('star')}${st.rep.toFixed(1)}<div class="bar grow"><i class="${repColor(st.rep)}" style="width:${pct(st.rep / 5)}"></i></div></div>
            <div class="cust">${ic('users')}<div class="bar"><i class="g" style="width:${pct(r.served / track)}"></i>${over > 0 ? `<u style="left:${pct(r.cap / track)};right:0"></u>` : ''}</div>${Math.round(r.served)}/${Math.round(r.cap)}</div>
          </div>
          <div class="profit ${r.profit < 0 ? 'bad' : 'good'}">${syen(r.profit)}<small>/日</small></div>
          <button class="x" data-a="close" data-id="${st.id}" aria-label="閉店">${ic('x')}</button>
        </div>
        <div class="ctl">
          ${seatMax ? `<span class="btn max sm">${ic('armchair')}${D.SEATS[st.seat]}席 MAX</span>` : `<button class="btn sm ${buy(sc, needSeat ? 'pulse' : '')}" data-a="seat" data-id="${st.id}">${ic('armchair')}<span>${D.SEATS[st.seat]}→${D.SEATS[st.seat + 1]}席</span><span class="cost">${yen(sc)}</span></button>`}
          ${decMax ? `<span class="btn max sm">${ic('potted-plant')}内装 MAX</span>` : `<button class="btn sm ${buy(dc)}" data-a="decor" data-id="${st.id}">${ic('potted-plant')}<span>内装<span class="lv"> Lv${st.decor}</span></span><span class="cost">${yen(dc)}</span></button>`}
          <div class="stepper"><button data-a="staff-" data-id="${st.id}" aria-label="スタッフを減らす">${ic('minus')}</button><b>${ic('chef-hat')}${st.staff}</b><button class="${needStaff ? 'pulse' : ''}" data-a="staff+" data-id="${st.id}" aria-label="スタッフを増やす">${ic('plus')}</button></div>
          <button class="mgrbtn" data-a="mgr" data-id="${st.id}">${st.mgr ? face(st.mgr.face, 30) + st.mgr.name : ic('user-circle-plus') + '<span class="sub">店長を置く</span>'}</button>
        </div></div>`;
    }
    if (stores.length < 3) {
      const c = S.storeCost(g, d, stores.length);
      h += `<div class="card empty">${tile('storefront', 'ink', 40)}
        <button class="btn ${buy(c, g.stores.length === 0 ? 'pulse' : '')}" data-a="open" data-id="${d.id}">${ic('hammer')}出店 <span class="cost">${yen(c)}</span></button></div>`;
    }
    return h;
  }

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
    return { price: yen(m.price), margin, face: `<span style="color:${f[1]}">${ic(f[0])}</span>`, sold: Math.round(oi.sold), uc, hint };
  }
  const hintHtml = (h) => (h > 0 ? `<span class="good">${ic('caret-up')}</span>` : h < 0 ? `<span class="bad">${ic('caret-down')}</span>` : A.g.tech.pos ? `<span class="good">${ic('check-circle')}</span>` : '');
  function vMenu() {
    const g = A.g;
    let h = '';
    for (const it of D.ITEMS) {
      const m = g.menu[it.id];
      if (!m.on) { h += `<div class="card item off">${tile(it.icon, 'ink', 44)}<div class="grow"><div class="h">${it.name}</div></div><span class="sub">${ic('lock')}研究 ${ic('lightbulb')}${D.TECHS[it.id].rp}</span></div>`; continue; }
      const L = itemLive(it.id);
      h += `<div class="card item on">
        <div class="top">${tile(it.icon, it.hue, 50)}<div class="grow"><div class="h">${it.name}</div><div class="sub">原価 <span id="uc-${it.id}">${yen(L.uc)}</span>・<span id="sd-${it.id}">${L.sold}</span>食/日</div></div>
          <span class="face" id="fc-${it.id}">${L.face}</span></div>
        <div class="row"><div class="price" id="pv-${it.id}">${L.price}</div><span class="hint" id="hn-${it.id}">${hintHtml(L.hint)}</span>
          <div class="grow"><input type="range" id="pr-${it.id}" data-item="${it.id}" min="${Math.round(it.ref * 0.4 / 10) * 10}" max="${Math.round(it.ref * 2.8 / 10) * 10}" step="10" value="${m.price}" aria-label="${it.name}の価格"></div></div>
        <div class="row"><span class="sub">素材</span><div class="grade">${[1, 2, 3, 4, 5].map((n) => `<button data-a="grade" data-id="${it.id}" data-n="${n}" class="${n <= m.grade ? 'on' : ''}" aria-label="素材ランク${n}">${ic('star')}</button>`).join('')}</div>
          <div class="grow meter"><span>利益率</span><div class="bar"><i id="mb-${it.id}" class="${L.margin > 0.5 ? 'g' : L.margin > 0.25 ? 'y' : 'r'}" style="width:${pct(L.margin)}"></i></div><span id="mg-${it.id}">${Math.round(L.margin * 100)}%</span></div></div>
      </div>`;
    }
    return h;
  }
  UI.menuLive = function () {
    for (const it of D.ITEMS) {
      if (!A.g.menu[it.id].on || !$('pv-' + it.id)) continue;
      const L = itemLive(it.id);
      $('pv-' + it.id).textContent = L.price; $('uc-' + it.id).textContent = yen(L.uc); $('sd-' + it.id).textContent = L.sold;
      $('fc-' + it.id).innerHTML = L.face; $('hn-' + it.id).innerHTML = hintHtml(L.hint);
      const mb = $('mb-' + it.id); mb.style.width = pct(L.margin); mb.className = L.margin > 0.5 ? 'g' : L.margin > 0.25 ? 'y' : 'r';
      $('mg-' + it.id).textContent = Math.round(L.margin * 100) + '%';
    }
  };

  // ---------- 人材 ----------
  function pips(m) {
    return `<div class="pips">` + D.MGR_STATS.map((s) => `<span class="${m[s.id] ? '' : 'z'}" title="${s.name}">${ic(s.icon)}${m[s.id]}</span>`).join('') + `</div>`;
  }
  function vHR() {
    const g = A.g, u = A.ui;
    const target = u.forStore && g.stores.find((s) => s.id === u.forStore);
    const picked = u.pick != null && g.cands[u.pick];
    let h = `<div class="row"><div class="h grow">店長候補</div><span class="sub">${ic('hourglass')}あと${Math.max(0, 20 - (Math.round(g.day) - g.candDay))}日</span>
      <button class="btn sm ghost ${buy(S.rerollCost(g))}" data-a="reroll">${ic('arrows-clockwise')}<span class="cost">${yen(S.rerollCost(g))}</span></button></div>`;
    h += `<div class="cands">` + g.cands.map((m, i) => {
      if (!m) return `<div class="cand gone">${tile('check-circle', 'good', 54)}<div class="nm">採用済</div></div>`;
      const fee = S.hireFee(g, m);
      return `<button class="cand r${m.rar}${u.pick === i ? ' on' : ''}" data-a="pick" data-id="${i}"><span class="rar">${['N', 'R', 'SR'][m.rar]}</span>${face(m.face, 58)}<div class="nm">${m.name}</div>${pips(m)}
        <div class="sub">給料 ${yen(m.salary * S.costF(g))}/日</div><span class="fee ${g.cash >= fee ? '' : 'bad'}">${yen(fee)}</span></button>`;
    }).join('') + `</div>`;
    h += `<div class="legend">${D.MGR_STATS.map((s) => `<span>${ic(s.icon)}${s.name}</span>`).join('')}</div>`;
    if (!g.stores.length) return h + `<div class="card sub" style="text-align:center">店舗を出すと店長を配属できます</div>`;
    h += `<div class="h">${picked ? '配属先をえらぶ' : '店舗と店長'}</div>`;
    for (const st of g.stores) {
      const d = D.DISTRICT[st.d];
      h += `<div class="card roster${target === st ? ' target' : ''}"><span class="tile" style="--c:${dark(d)};--s:38px;background:${d.hue}">${ic(d.icon, 'ti')}</span>
        ${st.mgr ? face(st.mgr.face, 38) : tile('user-circle-plus', 'ink', 38)}
        <div class="grow">${st.mgr ? `<b>${st.mgr.name}</b><div class="pips wide">${D.MGR_STATS.map((s) => `<span class="${st.mgr[s.id] ? '' : 'z'}">${ic(s.icon)}${st.mgr[s.id]}</span>`).join('')}</div>` : `<span class="sub">${d.name}・店長なし</span>`}</div>
        ${picked ? `<button class="btn sm ${buy(S.hireFee(g, picked))}" data-a="assign" data-id="${st.id}">${st.mgr ? '交代' : '配属'}</button>` : ''}</div>`;
    }
    return h;
  }

  // ---------- 宣伝 ----------
  function vMkt() {
    const g = A.g, M = S.costF(g), n = Math.sqrt(Math.max(1, g.stores.length)), t = S.brandTarget(g);
    const c = 2 * Math.PI * 48;
    let h = `<div class="card row"><svg class="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="none" stroke="var(--line)" stroke-width="13"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--yolk)" opacity=".55" stroke-width="13" stroke-dasharray="${(t / 100 * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)" stroke-linecap="round"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--noren)" stroke-width="13" stroke-dasharray="${(g.brand / 100 * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)" stroke-linecap="round"/>
      <text x="60" y="71">${Math.round(g.brand)}</text></svg>
      <div class="grow"><div class="h">知名度</div><div class="sub">目標 ${Math.round(t)}・高いほど客が増える</div>
      <div class="row" style="margin-top:8px"><span class="sub">宣伝費</span><b class="num">${yen(A.C.mkt)}/日</b></div></div></div>`;
    for (const ch of D.MARKETING) {
      const locked = ch.tech && !g.tech[ch.tech], on = !!g.mkt[ch.id];
      h += `<div class="card chan">${tile(ch.icon, on ? 'blue' : 'ink', 46)}<div class="grow"><div class="h">${ch.name}</div><div class="sub">${yen(ch.cost * M * n)}/日</div></div>
        <span class="tag">${ic('megaphone')}+${ch.brand}</span>
        ${locked ? `<span class="sub">${ic('lock')}研究</span>` : `<button class="sw ${on ? 'on' : ''}" data-a="mkt" data-id="${ch.id}" role="switch" aria-checked="${on}" aria-label="${ch.name}"></button>`}</div>`;
    }
    return h;
  }

  // ---------- 研究 ----------
  function vLab() {
    const g = A.g, next = D.LAB[g.lab + 1], kc = S.kaizenCost(g);
    let h = `<div class="card row">${tile('microscope', 'violet', 50)}
      <div class="grow"><div class="h">研究所</div><div class="levels">${D.LAB.slice(1).map((_, i) => `<i class="${i < g.lab ? 'on' : ''}"></i>`).join('')}</div>
        <div class="sub">${ic('lightbulb')}+${num(S.labRate(g))}/日・${yen(A.C.lab)}/日${next ? ` → ${yen(next.cost * S.costF(g))}` : ''}</div></div>
      <div class="stepper"><button data-a="lab-" aria-label="研究所を縮小">${ic('minus')}</button><button class="${g.lab === 0 ? 'pulse' : ''}" data-a="lab+" aria-label="研究所を拡大">${ic('plus')}</button></div></div>`;
    h += `<div class="row"><div class="h grow">研究ツリー</div><span class="rpbig">${ic('lightbulb')}<b class="big">${num(Math.floor(g.rp))}</b></span></div><div class="tech">`;
    for (const t of D.TECH) {
      const st = S.techState(g, t), can = st === 'open' && g.rp >= t.rp;
      h += `<button class="${st}${can ? ' can' : ''}${A.ui.tech === t.id ? ' sel' : ''}" data-a="tech" data-id="${t.id}">${tile(t.icon, st === 'done' ? 'good' : st === 'locked' ? 'ink' : 'violet', 40)}<span class="nm">${t.name}</span>
        <span class="rp">${st === 'done' ? ic('check-circle') : ic('lightbulb') + t.rp}</span></button>`;
    }
    h += `</div>`;
    const t = A.ui.tech && D.TECHS[A.ui.tech];
    if (t) {
      const st = S.techState(g, t);
      h += `<div class="card row techinfo">${tile(t.icon, 'violet', 44)}<div class="grow"><div class="h">${t.name}</div><div class="sub">${t.fx}</div></div>
        ${st === 'done' ? `<span class="btn max sm">${ic('check-circle')}済</span>` : st === 'locked' ? `<span class="sub">${ic('lock')}${D.TECHS[t.req].name}</span>` : `<button class="btn ${g.rp >= t.rp ? '' : 'cant'}" data-a="research" data-id="${t.id}">${ic('lightbulb')}<span class="cost">${t.rp}</span></button>`}</div>`;
    }
    h += `<div class="card row">${tile('sparkle', 'yolk', 44)}<div class="grow"><div class="h">味の改良 <span class="lv">Lv${g.kaizen || 0}</span></div><div class="sub">売上 +3%（くり返し）</div></div>
      <button class="btn ${g.rp >= kc ? '' : 'cant'}" data-a="kaizen">${ic('lightbulb')}<span class="cost">${num(kc)}</span></button></div>`;
    return h;
  }

  // ---------- 財務 ----------
  function vFin() {
    const g = A.g, C = A.C, val = S.valuation(g), M = S.mult(g);
    let h = `<div class="card"><div class="row"><div class="grow"><div class="sub">企業価値</div><div class="big">${yen(val)}</div></div>${tile('briefcase', 'blue', 44)}</div>
      <canvas class="chart" id="chart" width="600" height="220"></canvas><div class="sub" style="text-align:right">日次利益・直近60日</div></div>`;
    const rows = [['売上', C.rev, 'g'], ['原価', -C.cogs, 'r'], ['家賃', -C.rent, 'r'], ['人件費', -(C.wage + C.mgr), 'r'], ['宣伝', -C.mkt, 'r'], ['研究', -C.lab, 'r'], ['本部費', -C.hq, 'r'], ['利息', -C.interest, 'r'], ['配当', -C.div, 'r']];
    const mx = Math.max(C.rev, C.cogs, C.rent, C.wage + C.mgr, 1);
    h += `<div class="card pl">` + rows.filter((r) => Math.abs(r[1]) > 0.5 || r[0] === '売上').map((r) => `<span>${r[0]}</span><div class="bar"><i class="${r[2]}" style="width:${pct(Math.abs(r[1]) / mx)}"></i></div><span class="amt">${yen(Math.abs(r[1]))}</span>`).join('') +
      `<div class="tot"><span>利益/日</span><span class="${C.profit < 0 ? 'bad' : 'good'}">${syen(C.profit)}</span></div></div>`;
    const lm = S.loanMax(g), step = Math.max(1e6 * M, Math.round(lm / 4 / 1e5) * 1e5);
    h += `<div class="card"><div class="row">${tile('bank', 'blue', 42)}<div class="grow"><div class="h">融資</div><div class="sub">${yen(g.loan)} / ${yen(lm)}・利息 ${yen(g.loan * 0.0008)}/日</div>
      <div class="bar" style="margin-top:4px"><i class="r" style="width:${pct(g.loan / lm)}"></i></div></div></div>
      <div class="row" style="margin-top:8px"><button class="btn grow ${g.loan < lm - 1 ? '' : 'cant'}" data-a="borrow" data-n="${step}">借りる +${yen(step)}</button><button class="btn ghost grow ${g.loan > 0 && g.cash > 0 ? '' : 'cant'}" data-a="repay" data-n="${step}">返す</button></div></div>`;
    const ipoGoal = D.IPO_VALUE * M;
    h += `<div class="card row">${tile('bell-ringing', 'yolk', 42)}<div class="grow"><div class="h">株式上場</div>` +
      (g.ipo ? `<div class="sub">上場済・利益の10%を配当・のれん +25%</div></div><span class="btn max sm">${ic('check-circle')}済</span>` :
        `<div class="sub">企業価値の25%を調達（以後 配当10%）</div><div class="bar" style="margin-top:4px"><i style="width:${pct(val / ipoGoal)}"></i></div></div>
        <button class="btn ${S.canIPO(g) ? 'pulse' : 'cant'}" data-a="ipo">上場</button>`) + `</div>`;
    const goal = S.exitGoal(g), stars = S.starsOnExit(g), nextCity = D.CITIES[Math.min(g.meta.city + 1, D.CITIES.length - 1)];
    h += `<div class="card exit"><div class="row"><span class="tile" style="--c:#fff;--s:54px;background:rgba(255,255,255,.16)">${ic(nextCity.icon, 'ti')}</span><div class="grow"><div class="h">${nextCity.name}へ進出</div>
      <div class="sub">会社を売却して新天地へ。のれんは永続</div>
      <div class="bar" style="margin-top:6px"><i class="y" style="width:${pct(val / goal)}"></i></div><div class="sub">${yen(val)} / ${yen(goal)}</div></div></div>
      <button class="btn ${stars ? 'pulse' : 'cant'}" data-a="exit" style="width:100%;margin-top:8px">${ic('airplane-takeoff')}進出する　${ic('star-four')}+${stars}</button></div>`;
    h += `<div class="card"><div class="row" style="margin-bottom:8px"><div class="h grow">のれんの力</div><span class="rpbig" style="color:var(--yolk-deep)">${ic('star-four')}<b class="big">${g.meta.stars}</b></span></div><div class="perks">` +
      D.PERKS.map((p) => {
        const lv = S.perk(g, p.id), c = S.perkCost(g, p), mxd = lv >= p.max;
        return `<button data-a="perk" data-id="${p.id}" class="${!mxd && g.meta.stars >= c ? '' : 'cant'}">${tile(p.icon, 'yolk', 38)}<span>${p.name} ${p.fx}</span><span class="lv num">Lv${lv}</span><span class="c">${mxd ? 'MAX' : ic('star-four') + c}</span></button>`;
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

  const VIEWS = { shop: vShop, menu: vMenu, hr: vHR, mkt: vMkt, lab: vLab, fin: vFin };

  UI.render = function () {
    renderTabs();
    $('view').innerHTML = VIEWS[A.ui.tab]();
    if (A.ui.tab === 'fin') drawChart();
    UI.renderMap(); UI.hud(); UI.hudSlow();
  };
  // 日次の再描画（操作中は見送る）
  UI.renderDay = function () {
    UI.hudSlow();
    if (A.ui.hold) return;
    if (A.ui.tab === 'menu') { UI.menuLive(); renderTabs(); UI.renderMap(); return; }
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
