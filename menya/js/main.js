/* 麺屋インク — 入力・ゲームループ・セーブ・サウンド */
(function () {
  const D = window.MENYA_DATA, S = window.MENYA_SIM, UI = window.MENYA_UI, A = window.MENYA, $ = UI.$;
  const KEY = 'menya-inc-save-v1', OPT = 'menya-inc-opt-v1';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境でも遊べる */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };

  // ---------- サウンド ----------
  const opt = Object.assign({ sound: true }, store.get(OPT) || {});
  const sfxBuf = {}, bgm = [];
  let bgmIdx = 0, audioReady = false;
  ['click', 'tab', 'slide', 'buy', 'coin', 'page'].forEach((n) => { const a = new Audio(`assets/audio/${n}.mp3`); a.preload = 'auto'; a.volume = n === 'coin' ? 0.35 : 0.5; sfxBuf[n] = a; });
  UI.sfx = function (n) {
    if (!opt.sound || !audioReady) return;
    try { const a = sfxBuf[n].cloneNode(); a.volume = sfxBuf[n].volume; a.play().catch(() => {}); } catch (e) { /* noop */ }
  };
  function playBgm() {
    if (!opt.sound || !audioReady) return;
    if (!bgm.length) ['bgm1', 'bgm2'].forEach((n) => { const a = new Audio(`assets/audio/${n}.mp3`); a.volume = 0.22; a.addEventListener('ended', () => { bgmIdx = (bgmIdx + 1) % bgm.length; playBgm(); }); bgm.push(a); });
    bgm[bgmIdx].play().catch(() => {});
  }
  function syncSound() {
    $('soundBtn').innerHTML = UI.ic(opt.sound ? 'speaker-high' : 'speaker-slash');
    $('soundBtn').classList.toggle('off', !opt.sound);
    if (opt.sound) playBgm(); else bgm.forEach((a) => a.pause());
  }
  document.addEventListener('pointerdown', () => { if (!audioReady) { audioReady = true; playBgm(); } }, { capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { bgm.forEach((a) => a.pause()); save(); } else if (opt.sound) playBgm(); });

  // ---------- セーブ ----------
  function save() { if (A.g) { A.g.seen = Date.now(); store.set(KEY, A.g); } }
  function load(raw) {
    const g = raw && raw.v === 1 && raw.menu && raw.dist ? raw : null;
    if (!g) return S.newGame();
    const fresh = S.newGame(g.meta);
    for (const k in fresh) if (!(k in g)) g[k] = fresh[k];
    for (const it of D.ITEMS) if (!g.menu[it.id]) g.menu[it.id] = fresh.menu[it.id];
    for (const d of D.DISTRICTS) if (!g.dist[d.id]) g.dist[d.id] = fresh.dist[d.id];
    return g;
  }
  const recalc = () => { A.C = S.compute(A.g); };

  // ---------- 操作 ----------
  const storeById = (id) => A.g.stores.find((s) => s.id === +id);
  function act(a, el) {
    const g = A.g, u = A.ui, id = el.dataset.id;
    let ok = true, snd = 'click';
    switch (a) {
      case 'dock': if (id === 'map') { u.map = !u.map; u.sheet = null; } else { u.sheet = u.sheet === id ? null : id; u.map = false; } snd = 'tab'; if (u.sheet !== 'hr') { u.pick = null; u.forStore = null; } break;
      case 'sheetx': u.sheet = null; u.pick = null; u.forStore = null; snd = 'tab'; break;
      case 'mapx': u.map = false; snd = 'tab'; break;
      case 'sel': u.sel = id; u.shop = null; UI.clearWalkers(); snd = 'tab'; break;
      case 'shop': u.shop = +id; snd = 'tab'; break;
      case 'goshop': { const st = storeById(id); u.sel = st.d; u.shop = st.id; u.sheet = null; UI.clearWalkers(); snd = 'tab'; break; }
      case 'unlock': ok = S.unlockDistrict(g, id); snd = 'buy'; if (ok) UI.toast('key', D.DISTRICT[id].name + 'に進出'); break;
      case 'open': { const st = S.openStore(g, id); ok = !!st; snd = 'buy'; if (ok) { u.shop = st.id; UI.toast('storefront', '新店オープン'); } break; }
      case 'close': {
        const st = storeById(id);
        UI.modal({ icon: 'storefront', color: 'bad', title: '閉店しますか？', body: `<div class="sub">投資額の30%（${UI.yen(st.inv * 0.3)}）が戻ります</div>`,
          acts: [{ label: 'やめる', cls: 'ghost' }, { label: '閉店する', fn: () => { S.closeStore(g, st.id); recalc(); UI.render(); } }] });
        return;
      }
      case 'seat': ok = S.upSeat(g, storeById(id)); snd = 'buy'; break;
      case 'decor': ok = S.upDecor(g, storeById(id)); snd = 'buy'; break;
      case 'staff+': { const st = storeById(id); ok = st.staff < S.maxStaff(st); S.setStaff(g, st, st.staff + 1); break; }
      case 'staff-': { const st = storeById(id); ok = st.staff > 1; S.setStaff(g, st, st.staff - 1); break; }
      case 'mgr': u.sheet = 'hr'; u.forStore = +id; u.pick = null; snd = 'tab'; break;
      case 'grade': g.menu[id].grade = +el.dataset.n; break;
      case 'pick': {
        const i = +id, target = u.forStore && storeById(u.forStore);
        if (target && g.cands[i]) { ok = S.hire(g, i, target); snd = 'buy'; if (ok) { UI.toast('identification-badge', target.mgr.name + ' が店長に'); u.forStore = null; u.pick = null; } }
        else u.pick = u.pick === i ? null : i;
        break;
      }
      case 'assign': { const st = storeById(id); ok = S.hire(g, u.pick, st); snd = 'buy'; if (ok) { UI.toast('identification-badge', st.mgr.name + ' が店長に'); u.pick = null; } break; }
      case 'reroll': ok = S.reroll(g); u.pick = null; snd = 'page'; break;
      case 'mkt': g.mkt[id] = !g.mkt[id]; snd = 'slide'; break;
      case 'lab+': ok = g.lab < D.LAB.length - 1; S.setLab(g, g.lab + 1); break;
      case 'lab-': ok = g.lab > 0; S.setLab(g, g.lab - 1); break;
      case 'tech': u.tech = id; snd = 'tab'; break;
      case 'research': ok = S.research(g, id); snd = 'coin'; if (ok) UI.toast(D.TECHS[id].icon, D.TECHS[id].name + ' 完成'); break;
      case 'kaizen': ok = S.doKaizen(g); snd = 'coin'; break;
      case 'borrow': ok = S.borrow(g, +el.dataset.n); snd = 'buy'; break;
      case 'repay': ok = S.repay(g, +el.dataset.n); snd = 'buy'; break;
      case 'ipo': {
        if (!S.canIPO(g)) { ok = false; break; }
        UI.modal({ icon: 'bell-ringing', color: 'yolk', title: '株式を上場', body: `<div class="gain">+${UI.yen(S.valuation(g) * 0.25)}</div><div class="sub">以後、利益の10%を配当として支払います</div>`,
          acts: [{ label: 'やめる', cls: 'ghost' }, { label: '上場する', fn: () => { S.doIPO(g); UI.sfx('coin'); recalc(); UI.render(); } }] });
        return;
      }
      case 'exit': {
        const n = S.starsOnExit(g); if (!n) { ok = false; break; }
        const next = D.CITIES[Math.min(g.meta.city + 1, D.CITIES.length - 1)];
        UI.modal({ icon: next.icon, title: next.name + 'へ進出', body: `<div class="gain" style="color:var(--yolk-deep)">${UI.ic('star-four')} +${n}</div><div class="sub">店舗・資金・研究はリセット。のれんと「のれんの力」は残ります</div>`,
          acts: [{ label: 'まだ続ける', cls: 'ghost' }, { label: '進出する', fn: () => { A.g = S.exit(g); u.sel = 'jutaku'; u.sheet = null; u.shop = u.pick = u.forStore = u.tech = null; UI.clearWalkers(); UI.sfx('coin'); recalc(); save(); UI.render(); UI.toast('airplane-takeoff', next.name + 'で再出発'); } }] });
        return;
      }
      case 'perk': ok = S.buyPerk(g, id); snd = 'coin'; break;
      case 'credits': credits(); return;
      case 'reset':
        UI.modal({ icon: 'trash', color: 'bad', title: 'データを消しますか？', body: '<div class="sub">最初からやり直します。元に戻せません</div>',
          acts: [{ label: 'やめる', cls: 'ghost' }, { label: '消す', fn: () => { store.del(KEY); A.g = S.newGame(); u.sel = 'jutaku'; u.sheet = null; u.shop = null; UI.clearWalkers(); recalc(); UI.render(); } }] });
        return;
      default: return;
    }
    UI.sfx(ok ? snd : 'tab');
    recalc(); UI.render();
  }

  function credits() {
    UI.modal({ title: 'クレジット', body: `<ul class="credits">
      <li>BGM: "Bossa Antigua" / "Lobby Time" — Kevin MacLeod (incompetech.com), CC BY 4.0</li>
      <li>効果音: UI Sound Effects Library — Little Robot Sound Factory, CC BY 3.0</li>
      <li>効果音: Inventory Sound Effects — artisticdude, CC BY 3.0</li>
      <li>効果音: Picked Coin Echo 2 — abd (opengameart.org), CC BY 3.0</li>
      <li>アイコン: Phosphor Icons, MIT License</li>
      <li>ポートレート: Micah by Micah Lanier (DiceBear), CC BY 4.0</li>
      <li>フォント: Dela Gothic One / M PLUS Rounded 1c, SIL OFL 1.1</li></ul>`, acts: [{ label: 'とじる' }] });
  }

  // ---------- 入力 ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (el && !$('modal').contains(el)) act(el.dataset.a, el);
  });
  $('view').addEventListener('input', (e) => {
    const id = e.target.dataset.item; if (!id) return;
    A.g.menu[id].price = +e.target.value; recalc(); UI.menuLive(); UI.hud();
  });
  $('side').addEventListener('pointerdown', () => { A.ui.hold = true; });
  window.addEventListener('resize', () => UI.render());
  window.addEventListener('pointerup', () => { setTimeout(() => { A.ui.hold = false; }, 60); });
  window.addEventListener('pointercancel', () => { A.ui.hold = false; });
  $('speedBtn').addEventListener('click', () => { const g = A.g; g.speed = g.speed === 1 ? 2 : g.speed === 2 ? 4 : g.speed === 4 ? 0 : 1; UI.sfx('click'); UI.hudSlow(); });
  $('soundBtn').addEventListener('click', () => { opt.sound = !opt.sound; store.set(OPT, opt); syncSound(); UI.sfx('click'); });
  $('mission').addEventListener('click', () => {
    const r = S.claimMission(A.g, A.C);
    if (r) { UI.sfx('coin'); UI.toast('seal-check', '達成！' + (r.cash ? ' +' + UI.yen(r.cash) : r.rp ? ' ひらめき +' + r.rp : '')); recalc(); UI.render(); }
    else { // 未達成なら関係するタブへ案内
      const m = D.MISSIONS[A.g.mission]; if (!m) return;
      A.ui.sheet = { profit: 'menu', rep: 'menu', brand: 'mkt', lab: 'lab', tech: 'lab', items: 'lab', mgr: 'hr', value: 'fin' }[m.kind] || null;
      if (m.kind === 'districts') A.ui.map = true;
      UI.sfx('tab'); UI.render();
    }
  });

  // ---------- 放置 ----------
  function welcomeBack(r) {
    if (!r || (r.cash < 1 && r.rp < 0.1)) return;
    const h = Math.floor(r.sec / 3600), m = Math.floor(r.sec % 3600 / 60);
    UI.modal({ icon: 'moon', title: 'おかえりなさい', body: `<div class="sub">${h ? h + '時間' : ''}${m}分のあいだ店は営業していました${r.capped ? '（上限まで）' : ''}</div>
      <div class="gain">+${UI.yen(r.cash)}</div>${r.rp >= 1 ? `<div class="sub">${UI.ic('lightbulb')} +${Math.floor(r.rp)}</div>` : ''}<div class="sub">放置効率 ${Math.round(r.eff * 100)}%</div>`,
      acts: [{ label: '受け取る', fn: () => UI.sfx('coin') }] });
  }

  // ---------- ループ ----------
  let last = performance.now(), saveT = 0;
  function frame(now) {
    const g = A.g;
    let dt = (now - last) / 1000; last = now;
    if (dt > 30) { // 長い中断は放置収益として扱う
      g.seen = Date.now() - dt * 1000;
      welcomeBack(S.offline(g, Date.now())); recalc(); UI.render();
    } else if (g.speed > 0 && dt > 0) {
      const evs = S.advance(g, Math.min(dt, 1) / D.DAY_SEC * g.speed, A.C);
      let day = false;
      for (const ev of evs) {
        if (ev.type === 'day') { day = true; UI.pops(ev.C); }
        else if (ev.type === 'event') { const e = D.EVENT[ev.id]; UI.toast(e.icon, e.name + (ev.d ? '（' + D.DISTRICT[ev.d].name + '）' : '')); UI.sfx('page'); }
        else if (ev.type === 'cands') UI.toast('identification-badge', '新しい店長候補');
      }
      if (day) { recalc(); UI.renderDay(); }
      UI.hud();
    }
    if (dt < 1) UI.tick(dt * (g.speed || 0.0001));
    saveT += dt; if (saveT > 8) { saveT = 0; save(); }
    requestAnimationFrame(frame);
  }

  // ---------- 起動 ----------
  function start(hot) {
    A.g = load(hot && hot.save ? hot.save : store.get(KEY));
    recalc();
    document.querySelector('.mapx').innerHTML = UI.ic('x'); document.querySelector('#sheet .x').innerHTML = UI.ic('x');
    $('coinIc').innerHTML = UI.ic('currency-jpy'); $('brandIc').innerHTML = UI.ic('megaphone');
    UI.buildMap(); syncSound(); UI.render();
    const off = S.offline(A.g, Date.now());
    if (off) { recalc(); UI.render(); welcomeBack(off); }
    else if (!A.g.stores.length && A.g.day < 1 && !A.g.meta.city) {
      UI.modal({ icon: 'bowl-steam', color: '#e5484d', title: '麺屋インク', body: '<div class="sub">一杯のラーメン屋から、世界チェーンへ。<br>値付け・出店・人材・宣伝・研究を決めるのはあなたです。</div>', acts: [{ label: '開業する' }] });
    }
    last = performance.now();
    requestAnimationFrame(frame);
    window.addEventListener('pagehide', save);
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ save: A.g }));
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();
