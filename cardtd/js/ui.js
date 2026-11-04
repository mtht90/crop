/* カードTD — 画面(タイトル・ステージ選択・デッキ・ガチャ・戦闘 HUD)とメインループ */
(function (CTD) {
  'use strict';

  const R = CTD.RULES;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const stage = $('#stage');
  const canvas = $('#field');
  const ctx = canvas.getContext('2d');
  const ui = $('#ui');
  const hud = $('#hud');
  const overlay = $('#overlay');
  const toastBox = $('#toast');

  let scale = 1, offX = 0, offY = 0;
  let screen = 'boot';
  let battle = null, ai = null;
  let menuScene = null;
  let save;

  // ================= 画面サイズ =================
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / 1280, vh / 720);
    offX = (vw - 1280 * scale) / 2;
    offY = (vh - 720 * scale) / 2;
    stage.style.transform = `translate(${offX}px, ${offY}px) scale(${scale})`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = scale * dpr;
    CTD.renderScale = k;
    canvas.width = Math.round(1280 * k);
    canvas.height = Math.round(720 * k);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  function toStage(e) {
    return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale };
  }

  // ================= 共通部品 =================
  function cardHTML(id, o = {}) {
    const c = CTD.CARDS[id];
    const cls = ['card', 'r-' + c.rarity];
    if (o.cls) cls.push(o.cls);
    const flags = [];
    if (c.flying) flags.push('飛行');
    else if (c.large) flags.push('大型');
    return `<div class="${cls.join(' ')}" data-id="${id}"${o.attrs || ''}>
      <img class="frame" src="${CTD.assetURL('cards/frame_' + c.rarity + '.webp')}" alt="" draggable="false">
      <img class="ring" src="${CTD.assetURL('cards/ring.webp')}" alt="" draggable="false">
      <div class="art"><img src="${CTD.portraitURL(id)}" alt="" draggable="false"></div>
      <div class="ribbon"><span>${esc(c.name)}</span></div>
      <div class="cost"><b>${c.cost}</b></div>
      ${flags.length ? `<div class="tag">${flags.join('・')}</div>` : ''}
      ${o.count !== undefined ? `<div class="count">×${o.count}</div>` : ''}
      ${o.isNew ? '<div class="new">NEW</div>' : ''}
      ${o.extra || ''}
    </div>`;
  }

  function icon(name) {
    return `<img class="ico" src="${CTD.assetURL('ui/' + name + '.webp')}" alt="" draggable="false">`;
  }

  function gemPill() {
    return `<span class="pill"><i class="gem"></i><span data-gems>${save.gems}</span></span>`;
  }

  function starsHTML(n, cls = 'stars') {
    return `<span class="${cls}">${[0, 1, 2].map(i => `<span class="s ${i < n ? 'on' : ''}">★</span>`).join('')}</span>`;
  }

  function toast(text, opts = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (opts.tip ? ' tip' : '');
    el.textContent = text;
    toastBox.appendChild(el);
    while (toastBox.children.length > 2) toastBox.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, opts.ms || 3200);
  }

  function modal(html, opts = {}) {
    overlay.innerHTML = `<div class="dim"><div class="panel modal ${opts.cls || ''}">${html}</div></div>`;
    const dim = overlay.firstElementChild;
    if (opts.dismiss) dim.addEventListener('pointerdown', (e) => { if (e.target === dim) closeModal(); });
    return dim.firstElementChild;
  }
  function closeModal() { overlay.innerHTML = ''; }

  function click(el, fn) {
    el.addEventListener('click', (e) => { CTD.sfx('click'); fn(e); });
  }

  function writeSave() { CTD.save.write(); }

  // ================= 起動 =================
  function boot() {
    save = CTD.save.load();
    resize();
    ui.innerHTML = `<div class="loading">
      <div class="load-title">カード<span>TD</span></div>
      <div class="load-bar"><i></i></div>
      <p>素材を読み込み中…</p></div>`;
    const bar = $('.load-bar i');
    CTD.loadAssets((k) => { bar.style.width = Math.round(k * 100) + '%'; }).then(() => {
      menuScene = new MenuScene();
      showHome();
    });
    requestAnimationFrame(loop);
    const unlock = () => { CTD.audioUnlock(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  // ================= メニューの背景(キャラが行進する) =================
  class MenuScene {
    constructor() {
      this.t = 0;
      this.walkers = [];
      this.next = 0;
      this.bg = 'menu';
    }
    update(dt) {
      this.t += dt;
      this.next -= dt;
      if (this.next <= 0) {
        this.next = 1.4 + Math.random() * 1.8;
        const ids = CTD.CARD_ORDER;
        const id = ids[(Math.random() * ids.length) | 0];
        const dir = Math.random() < 0.5 ? 1 : -1;
        const def = CTD.CARDS[id];
        this.walkers.push({ id, dir, x: dir > 0 ? -80 : 1360, y: 600 + Math.random() * 70, sp: def.speed * 1.1, w: Math.random() * 3, fly: def.flying });
        this.walkers.sort((a, b) => a.y - b.y);
      }
      for (const w of this.walkers) { w.x += w.dir * w.sp * dt; w.w += dt; }
      this.walkers = this.walkers.filter(w => w.x > -120 && w.x < 1400);
    }
    render(c) {
      CTD.drawBackground(c, this.bg, 1280, 720);
      const g = c.createLinearGradient(0, 520, 0, 720);
      g.addColorStop(0, 'rgba(20,14,40,0)'); g.addColorStop(1, 'rgba(20,14,40,0.55)');
      c.fillStyle = g; c.fillRect(0, 520, 1280, 200);
      for (const w of this.walkers) {
        c.save();
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.beginPath(); c.ellipse(w.x, w.y, 18, 5, 0, 0, Math.PI * 2); c.fill();
        c.translate(w.x, w.y - (w.fly ? 60 + Math.sin(this.t * 3 + w.y) * 5 : 0));
        c.scale(w.dir, 1);
        CTD.drawUnit(c, w.id, { anim: 'walk', t: w.w, rate: CTD.CARDS[w.id].speed / 42 });
        c.restore();
      }
    }
  }

  // ================= タイトル =================
  function showHome() {
    screen = 'home';
    hud.hidden = true;
    closeModal();
    if (menuScene) menuScene.bg = 'menu';
    CTD.music('menu');
    const next = CTD.STAGES.find(s => !(save.stages[s.id] && save.stages[s.id].cleared)) || CTD.STAGES[CTD.STAGES.length - 1];
    ui.innerHTML = `<div class="home">
      <div class="home-stats">${gemPill()}<span class="pill"><span class="star-ico">★</span>${CTD.save.totalStars()} / ${CTD.STAGES.length * 3}</span></div>
      <div class="home-corner">
        <button class="icon-btn" data-act="fs" title="全画面">⛶</button>
        <button class="icon-btn" data-act="settings" title="設定">${icon('i_settings')}</button>
      </div>
      <div class="logo"><h1>カード<span>TD</span></h1><p>手札から兵士を送り込み、相手の城を落とせ</p></div>
      <div class="home-menu">
        <button class="btn big" data-act="play">出撃 <small>${next.id} ${esc(next.name)}</small></button>
        <button class="btn blue" data-act="stages">ステージ</button>
        <button class="btn blue" data-act="deck">デッキ</button>
        <button class="btn purple" data-act="gacha">ガチャ</button>
      </div>
      <div class="credit">素材: CraftPix(騎士・女戦士・妖精・オーク・トロール・塔・背景)/ Dumivid / Martin Jelinek / Kenney / Tallbeard Studios</div>
    </div>`;
    click($('[data-act=play]'), () => openStageInfo(next));
    click($('[data-act=stages]'), () => showStages(next.world));
    click($('[data-act=deck]'), () => showDeck());
    click($('[data-act=gacha]'), () => showGacha());
    click($('[data-act=settings]'), () => openSettings());
    click($('[data-act=fs]'), () => {
      const d = document.documentElement;
      if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().then(() => { try { window.screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* 非対応 */ } }).catch(() => {});
      else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    });
  }

  function openSettings(inBattle) {
    const s = save.settings;
    const m = modal(`<h2>設定</h2>
      <div class="settings">
        <div class="toggle">効果音<div class="switch ${s.sound ? 'on' : ''}" data-k="sound"></div></div>
        <div class="toggle">BGM<div class="switch ${s.music ? 'on' : ''}" data-k="music"></div></div>
      </div>
      <div class="row">
        ${inBattle ? '<button class="btn gray" data-act="retire">リタイア</button><button class="btn" data-act="close">再開</button>'
        : '<button class="btn gray small" data-act="reset">データを消す</button><button class="btn" data-act="close">閉じる</button>'}
      </div>`, { cls: 'settings-modal', dismiss: !inBattle });
    $$('.switch', m).forEach(sw => click(sw, () => {
      const k = sw.dataset.k;
      s[k] = !s[k];
      sw.classList.toggle('on', s[k]);
      writeSave();
      if (k === 'music') {
        const want = inBattle ? battleTrack() : 'menu';
        CTD.music(null);
        if (s.music) CTD.music(want);
      }
    }));
    click($('[data-act=close]', m), () => { closeModal(); if (inBattle && battle) battle.paused = false; });
    const r = $('[data-act=retire]', m);
    if (r) click(r, () => { closeModal(); endBattle(); showStages(battle ? battle.stage.world : 1); });
    const rs = $('[data-act=reset]', m);
    if (rs) click(rs, () => {
      const c = modal(`<h2>データを消す</h2><p>カード・魔晶石・クリア記録がすべて最初に戻ります。</p>
        <div class="row"><button class="btn gray" data-act="no">やめる</button><button class="btn" data-act="yes">消す</button></div>`);
      click($('[data-act=no]', c), () => openSettings());
      click($('[data-act=yes]', c), () => { CTD.save.reset(); save = CTD.save.data; closeModal(); showHome(); toast('データを消しました'); });
    });
  }

  // ================= ステージ選択 =================
  function showStages(worldId = 1) {
    screen = 'stages';
    hud.hidden = true;
    closeModal();
    const world = CTD.WORLDS.find(w => w.id === worldId);
    if (menuScene) menuScene.bg = world.bg;
    CTD.music('menu');
    const stages = CTD.STAGES.filter(s => s.world === worldId);
    const firstLocked = CTD.STAGES.find(s => !CTD.save.unlocked(s.id));
    const pos = [[180, 250], [410, 130], [640, 250], [870, 130], [1100, 230]];
    ui.innerHTML = `<div class="stages">
      <div class="topbar"><button class="icon-btn" data-act="back">${icon('i_back')}</button><h2>ステージ選択</h2>${gemPill()}</div>
      <div class="world-tabs">${CTD.WORLDS.map(w => {
        const first = CTD.STAGES.find(s => s.world === w.id);
        const locked = !CTD.save.unlocked(first.id);
        const stars = CTD.STAGES.filter(s => s.world === w.id).reduce((a, s) => a + ((save.stages[s.id] || {}).stars || 0), 0);
        return `<button class="world-tab ${w.id === worldId ? 'on' : ''} ${locked ? 'locked' : ''}" data-w="${w.id}">${w.id}. ${esc(w.name)}<small>${locked ? '🔒 前のワールドをクリア' : '★ ' + stars + ' / 15'}</small></button>`;
      }).join('')}</div>
      <div class="stage-path">
        <svg viewBox="0 0 1280 360"><path d="M${pos.map(p => p.join(' ')).join(' L')}" fill="none" stroke="rgba(255,240,200,0.7)" stroke-width="8" stroke-dasharray="4 18" stroke-linecap="round"/></svg>
        ${stages.map((s, i) => {
          const rec = save.stages[s.id] || {};
          const locked = !CTD.save.unlocked(s.id);
          const isNext = !locked && !rec.cleared;
          return `<div class="stage-node ${s.boss ? 'boss' : ''} ${locked ? 'locked' : ''} ${isNext ? 'next' : ''}" style="left:${pos[i][0]}px;top:${pos[i][1]}px" data-s="${s.id}">
            <div class="disc">${locked ? '🔒' : s.id}</div>
            ${starsHTML(rec.stars || 0)}
            <div class="label">${esc(s.name)}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="world-theme">${esc(world.name)}:${esc(world.theme)}</div>
    </div>`;
    click($('[data-act=back]'), showHome);
    $$('.world-tab').forEach(b => click(b, () => {
      if (b.classList.contains('locked')) { toast('前のワールドをクリアすると開きます'); return; }
      showStages(+b.dataset.w);
    }));
    $$('.stage-node').forEach(n => click(n, () => {
      const s = CTD.STAGES.find(x => x.id === n.dataset.s);
      if (n.classList.contains('locked')) { toast('前のステージをクリアすると挑戦できます'); return; }
      openStageInfo(s);
    }));
    void firstLocked;
  }

  function openStageInfo(s) {
    if (!CTD.save.unlocked(s.id)) { showStages(s.world); return; }
    const rec = save.stages[s.id] || {};
    const counts = {};
    for (const id of s.deck) counts[id] = (counts[id] || 0) + 1;
    const deckOk = CTD.save.validDeck(save.deck, save.owned);
    const m = modal(`<div class="stage-info">
      <h2>${s.id} ${esc(s.name)} ${s.boss ? '<span class="boss-tag">BOSS</span>' : ''}</h2>
      ${s.hint ? `<p class="hint">偵察:${esc(s.hint)}</p>` : s.tutorial ? '<p class="hint">チュートリアル:遊び方を覚えよう</p>' : ''}
      <p>相手のデッキ</p>
      <div class="enemy-deck">${Object.entries(counts).sort((a, b) => CTD.CARDS[a[0]].cost - CTD.CARDS[b[0]].cost).map(([id, n]) => cardHTML(id, { count: n })).join('')}</div>
      <div class="info-row">
        <div class="cond">
          <span class="${rec.stars >= 1 ? 'ok' : 'ng'}">勝利する</span>
          <span class="${rec.stars >= 2 ? 'ok' : 'ng'}">自分の城の HP を半分以上残して勝つ</span>
          <span class="${rec.stars >= 3 ? 'ok' : 'ng'}">3分以内に相手の城を壊す</span>
        </div>
        <div class="reward-info">初回クリア <i class="gem"></i>${CTD.ECONOMY.firstClear}<br>新しい星 1つ <i class="gem"></i>${CTD.ECONOMY.perNewStar}<br>再挑戦の勝利 <i class="gem"></i>${CTD.ECONOMY.replayWin}</div>
      </div>
      <div class="row">
        <button class="btn gray" data-act="close">戻る</button>
        <button class="btn blue" data-act="deck">デッキ編成</button>
        <button class="btn big" data-act="go" ${deckOk ? '' : 'disabled'}>出撃!</button>
      </div>
      ${deckOk ? '' : '<p class="warn">デッキを12枚にしてください</p>'}
    </div>`, { dismiss: true });
    click($('[data-act=close]', m), closeModal);
    click($('[data-act=deck]', m), () => showDeck(s));
    click($('[data-act=go]', m), () => { if (deckOk) startBattle(s); });
  }

  // ================= デッキ編成 =================
  let deckSel = null;
  let deckFilter = 'all';
  function showDeck(returnStage) {
    screen = 'deck';
    hud.hidden = true;
    closeModal();
    CTD.music('menu');
    const deck = save.deck.slice().sort((a, b) => CTD.CARDS[a].cost - CTD.CARDS[b].cost || CTD.CARD_ORDER.indexOf(a) - CTD.CARD_ORDER.indexOf(b));
    save.deck = deck;
    const inDeck = {};
    for (const id of deck) inDeck[id] = (inDeck[id] || 0) + 1;
    const avg = deck.length ? (deck.reduce((a, id) => a + CTD.CARDS[id].cost, 0) / deck.length).toFixed(1) : '-';
    const air = deck.filter(id => CTD.CARDS[id].hitsAir).length;
    const big = deck.filter(id => CTD.CARDS[id].vsLarge || CTD.CARDS[id].atk / CTD.CARDS[id].int > 50).length;
    const splash = deck.filter(id => CTD.CARDS[id].splash).length;
    if (!deckSel || !CTD.CARDS[deckSel]) deckSel = deck[0] || CTD.CARD_ORDER[0];
    const filters = [['all', 'すべて'], ['owned', '所持'], ['air', '対空'], ['flying', '飛行'], ['large', '大型']];
    const list = CTD.CARD_ORDER.filter(id => {
      const c = CTD.CARDS[id];
      if (deckFilter === 'owned') return save.owned[id] > 0;
      if (deckFilter === 'air') return c.hitsAir;
      if (deckFilter === 'flying') return c.flying;
      if (deckFilter === 'large') return c.large;
      return true;
    }).sort((a, b) => CTD.CARDS[a].cost - CTD.CARDS[b].cost);

    ui.innerHTML = `<div class="deck-screen">
      <div class="topbar"><button class="icon-btn" data-act="back">${icon('i_back')}</button><h2>デッキ編成</h2>
        <button class="btn small blue" data-act="auto">おまかせ</button>${gemPill()}</div>
      <div class="deck-left">
        <div class="panel deck-box">
          <h3><span>デッキ ${deck.length} / ${R.deckSize}</span>
          <span class="deck-meta">平均コスト <b>${avg}</b> 対空 <b>${air}</b> 対大型 <b>${big}</b> 範囲 <b>${splash}</b></span></h3>
          <div class="deck-grid">${Array.from({ length: R.deckSize }, (_, i) => deck[i] ? cardHTML(deck[i], { attrs: ` data-i="${i}"` }) : '<div class="slot">+</div>').join('')}</div>
        </div>
        <div class="panel detail" id="detail"></div>
      </div>
      <div class="panel coll-box">
        <h3><span>カード一覧(${CTD.CARD_ORDER.filter(id => save.owned[id]).length} / ${CTD.CARD_ORDER.length} 種)</span>
          <span class="coll-tools">${filters.map(([k, n]) => `<button data-f="${k}" class="${deckFilter === k ? 'on' : ''}">${n}</button>`).join('')}</span></h3>
        <div class="coll-grid">${list.map(id => {
          const owned = save.owned[id] || 0;
          const isNew = owned && !save.seen[id];
          return cardHTML(id, { cls: (owned ? '' : 'locked') + (id === deckSel ? ' sel' : ''), count: owned || undefined, isNew, extra: inDeck[id] ? `<div class="inDeck">デッキ ${inDeck[id]}</div>` : '' });
        }).join('')}</div>
      </div>
    </div>`;
    renderDetail(inDeck);
    click($('[data-act=back]'), () => {
      writeSave();
      if (!CTD.save.validDeck(save.deck, save.owned)) toast('デッキが12枚ではないため、このままでは出撃できません', { ms: 3000 });
      if (returnStage) { showStages(returnStage.world); openStageInfo(returnStage); } else showHome();
    });
    click($('[data-act=auto]'), () => { save.deck = autoDeck(); writeSave(); showDeck(returnStage); toast('おすすめのデッキにしました'); });
    $$('.coll-tools button').forEach(b => click(b, () => { deckFilter = b.dataset.f; showDeck(returnStage); }));
    $$('.coll-grid .card').forEach(el => el.addEventListener('click', () => {
      CTD.sfx('page');
      deckSel = el.dataset.id;
      if (!save.seen[deckSel] && save.owned[deckSel]) { save.seen[deckSel] = 1; writeSave(); el.querySelector('.new') && el.querySelector('.new').remove(); }
      $$('.coll-grid .card').forEach(c => c.classList.toggle('sel', c === el));
      renderDetail(inDeck);
    }));
    $$('.deck-grid .card').forEach(el => el.addEventListener('click', () => {
      CTD.sfx('click');
      save.deck.splice(+el.dataset.i, 1);
      writeSave();
      showDeck(returnStage);
    }));

    function renderDetail(inDeckNow) {
      const id = deckSel;
      const c = CTD.CARDS[id];
      const owned = save.owned[id] || 0;
      const n = inDeckNow[id] || 0;
      const canAdd = owned > n && n < R.maxCopies && save.deck.length < R.deckSize;
      const why = !owned ? 'ガチャで手に入る' : n >= R.maxCopies ? '同じカードは3枚まで' : n >= owned ? `所持数(${owned}枚)まで` : save.deck.length >= R.deckSize ? 'デッキがいっぱい' : '';
      const sp = c.speed < 30 ? 'とても遅い' : c.speed < 40 ? '遅い' : c.speed < 55 ? '普通' : c.speed < 70 ? '速い' : 'とても速い';
      const chips = [];
      if (c.flying) chips.push('飛行(近接で攻撃されない)');
      if (c.hitsAir) chips.push('対空');
      if (c.large) chips.push('大型');
      if (c.splash) chips.push('範囲攻撃');
      if (c.count > 1) chips.push(c.count + '体出る');
      if (c.vsLarge) chips.push('大型に ×' + c.vsLarge);
      if (c.vsAir) chips.push('飛行に ×' + c.vsAir);
      if (c.rangedResist) chips.push('遠距離ダメージ ×' + c.rangedResist);
      if (c.castleMul) chips.push('城へ ×' + c.castleMul);
      if (c.heal) chips.push('回復 ' + c.heal.amount + ' / ' + c.heal.interval + '秒');
      if (c.aura) chips.push(c.aura.kind === 'might' ? '周りの攻撃力 +' + Math.round(c.aura.value * 100) + '%' : '周りの攻撃速度 +' + Math.round(c.aura.value * 100) + '%');
      if (c.slow) chips.push('当てた敵を遅くする');
      if (c.charge) chips.push('突進して押し返す');
      if (c.assassin) chips.push('遠距離役を優先');
      $('#detail').innerHTML = `
        <div class="big-art r-${c.rarity}"><img src="${CTD.portraitURL(id)}" alt=""></div>
        <div class="info">
          <h4>${esc(c.name)} <span class="rar" style="background:${CTD.RARITY[c.rarity].color}">${CTD.RARITY[c.rarity].name}</span></h4>
          <div class="desc">${esc(c.role)} — ${esc(c.desc)}</div>
          <div class="statrow">
            <span>コスト <b>${c.cost}</b></span><span>HP <b>${c.hp}</b></span><span>攻撃 <b>${c.atk}</b> / ${c.int}秒</span>
            <span>射程 <b>${c.range > 60 ? '遠 ' + c.range : '近接'}</b></span><span>足 <b>${sp}</b></span><span>待ち <b>${c.cost * R.cooldownPerCost}秒</b></span>
          </div>
          <div class="chips">${chips.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>
          <div class="actions">
            <button class="btn small" data-act="add" ${canAdd ? '' : 'disabled'}>デッキに入れる</button>
            <span class="owned">所持 ${owned}枚 / デッキ ${n}枚 ${why ? '・' + why : ''}</span>
          </div>
          <div class="pack-name">素材: ${esc(c.pack)}</div>
        </div>`;
      const add = $('#detail [data-act=add]');
      add.addEventListener('click', () => {
        if (!canAdd) { CTD.sfx('denied'); return; }
        CTD.sfx('deploy');
        save.deck.push(id);
        writeSave();
        showDeck(returnStage);
      });
    }
  }

  function autoDeck() {
    // 役割のバランスを見て、持っているカードから組む
    const pool = [];
    for (const id of CTD.CARD_ORDER) for (let i = 0; i < Math.min(R.maxCopies, save.owned[id] || 0); i++) pool.push(id);
    const deck = [];
    const take = (pred, n) => {
      const cand = pool.filter(id => pred(CTD.CARDS[id]) && deck.filter(x => x === id).length < R.maxCopies)
        .sort((a, b) => score(CTD.CARDS[b]) - score(CTD.CARDS[a]));
      for (const id of cand) { if (n <= 0 || deck.length >= R.deckSize) break; deck.push(id); pool.splice(pool.indexOf(id), 1); n--; }
    };
    const score = (c) => c.hp / 300 + c.atk / c.int / 30 + (c.rarity === 'epic' ? 2 : c.rarity === 'rare' ? 1 : 0);
    take(c => c.hitsAir, 3);
    take(c => !c.ranged && !c.large && c.cost <= 4, 3);
    take(c => c.vsLarge || c.large, 2);
    take(c => c.splash || c.heal || c.aura, 2);
    take(() => true, R.deckSize);
    return deck;
  }

  // ================= ガチャ =================
  function showGacha() {
    screen = 'gacha';
    hud.hidden = true;
    closeModal();
    CTD.music('menu');
    const E = CTD.ECONOMY;
    const r = CTD.RARITY;
    ui.innerHTML = `<div class="gacha-screen">
      <div class="topbar"><button class="icon-btn" data-act="back">${icon('i_back')}</button><h2>ガチャ</h2>${gemPill()}</div>
      <div class="pack" data-act="open"><img src="${CTD.assetURL('cards/booster_art.webp')}" alt="" draggable="false"></div>
      <div class="gacha-actions">
        <button class="btn big purple" data-act="open" ${save.gems < E.packCost ? 'disabled' : ''}>1パック開ける <i class="gem"></i> ${E.packCost}</button>
      </div>
      <div class="gacha-rates">1パック ${E.packSize}枚。${r.common.name} ${r.common.rate * 100}% ・ ${r.rare.name} ${r.rare.rate * 100}% ・ ${r.epic.name} ${r.epic.rate * 100}%。${E.currency}はステージの初回クリア・星・再挑戦の勝利でもらえる</div>
    </div>`;
    click($('[data-act=back]'), showHome);
    $$('[data-act=open]').forEach(b => b.addEventListener('click', () => openPack()));
  }

  function rollCard() {
    const x = Math.random();
    const rar = x < CTD.RARITY.epic.rate ? 'epic' : x < CTD.RARITY.epic.rate + CTD.RARITY.rare.rate ? 'rare' : 'common';
    const ids = CTD.CARD_ORDER.filter(id => CTD.CARDS[id].rarity === rar);
    return ids[(Math.random() * ids.length) | 0];
  }

  function openPack() {
    const E = CTD.ECONOMY;
    if (save.gems < E.packCost) { CTD.sfx('denied'); toast(`${E.currency}が足りない(ステージをクリアして集めよう)`); return; }
    save.gems -= E.packCost;
    save.stats.packs++;
    const pulls = Array.from({ length: E.packSize }, rollCard);
    const fresh = pulls.map(id => !save.owned[id]);
    for (const id of pulls) save.owned[id] = (save.owned[id] || 0) + 1;
    writeSave();
    $$('[data-gems]').forEach(e => { e.textContent = save.gems; });
    const pack = $('.pack');
    $$('.gacha-actions button').forEach(b => { b.disabled = true; });
    CTD.sfx('open');
    pack.classList.add('shake');
    setTimeout(() => {
      pack.classList.remove('shake');
      pack.classList.add('burst');
      setTimeout(() => revealCards(pulls, fresh), 380);
    }, 800);
  }

  function revealCards(pulls, fresh) {
    const box = $('.gacha-screen');
    $('.pack').remove();
    const wrap = document.createElement('div');
    wrap.className = 'reveal';
    wrap.innerHTML = pulls.map((id, i) => {
      const c = CTD.CARDS[id];
      return `<div class="flip-wrap" style="animation-delay:${i * 0.12}s">
        <div class="flip glow-${c.rarity}" data-i="${i}" style="animation-delay:${i * 0.12}s">
          <div class="face back"><img src="${CTD.assetURL('cards/back.webp')}" alt="" draggable="false"></div>
          <div class="face front">${cardHTML(id, { isNew: fresh[i] })}</div>
        </div>
        <div class="rar-label" style="color:${CTD.RARITY[c.rarity].color}">${CTD.RARITY[c.rarity].name}</div>
      </div>`;
    }).join('');
    box.appendChild(wrap);
    const acts = $('.gacha-actions');
    acts.innerHTML = `<button class="btn gray" data-act="all">全部めくる</button>`;
    let opened = 0;
    const flip = (el) => {
      if (el.classList.contains('open')) return;
      el.classList.add('open');
      el.parentElement.classList.add('open');
      const id = pulls[+el.dataset.i];
      const rar = CTD.CARDS[id].rarity;
      CTD.sfx('flip');
      if (rar !== 'common') setTimeout(() => CTD.sfx('shine'), 200);
      opened++;
      if (opened === pulls.length) finish();
    };
    $$('.flip', wrap).forEach(el => el.addEventListener('click', () => flip(el)));
    click($('[data-act=all]', acts), () => $$('.flip', wrap).forEach((el, i) => setTimeout(() => flip(el), i * 180)));
    function finish() {
      const E = CTD.ECONOMY;
      setTimeout(() => {
        acts.innerHTML = `<button class="btn blue" data-act="deck">デッキへ</button>
          <button class="btn purple" data-act="again" ${save.gems < E.packCost ? 'disabled' : ''}>もう1パック <i class="gem"></i> ${E.packCost}</button>
          <button class="btn gray" data-act="done">閉じる</button>`;
        click($('[data-act=deck]', acts), () => showDeck());
        click($('[data-act=again]', acts), () => { showGacha(); setTimeout(openPack, 50); });
        click($('[data-act=done]', acts), showGacha);
      }, 500);
    }
  }

  // ================= 戦闘 =================
  function battleTrack() {
    if (!battle) return 'battle';
    if (battle.time >= 150) return 'fever';
    return battle.stage.boss ? 'boss' : 'battle';
  }

  let hudRefs = null;
  let selSlot = -1;
  let tutorial = null;

  function startBattle(st) {
    closeModal();
    ui.innerHTML = '';
    screen = 'battle';
    battle = new CTD.Battle(st, save.deck);
    battle.speed = 1;
    ai = new CTD.CpuAI(battle, 1, st.skill);
    selSlot = -1;
    tutorial = st.tutorial ? { list: CTD.TUTORIAL[st.tutorial].map(x => Object.assign({ done: false }, x)), played: false } : null;
    buildHud();
    CTD.music(battleTrack());
    intro(st);
    setTimeout(() => { if (battle && battle.ready > 0) showCount(3); }, 700);
  }

  function endBattle() {
    if (pointerEl) { pointerEl.remove(); pointerEl = null; }
    battle = null;
    ai = null;
    hud.hidden = true;
    hud.innerHTML = '';
    toastBox.innerHTML = '';
  }

  function buildHud() {
    hud.hidden = false;
    hud.innerHTML = `
      <div class="hud-top">
        <div class="castle-hp player"><div class="who">${icon('i_heart')}自分の城</div><div class="hpbar"><i class="lag"></i><i class="fill"></i><span class="num"></span></div></div>
        <div class="hud-center">
          <div class="timer"><span class="t">3:00</span><span class="regen"></span></div>
          <div class="mana-wrap"><div class="mana-num">5</div><div class="mana-bar">${Array.from({ length: R.maxMana }, () => '<div class="mana-seg"><i></i></div>').join('')}</div></div>
        </div>
        <div class="castle-hp enemy"><div class="who">${esc(battle.stage.id)} ${esc(battle.stage.name)} ${icon('i_crown')}</div><div class="hpbar"><i class="lag"></i><i class="fill"></i><span class="num"></span></div></div>
      </div>
      <div class="hud-btns">
        <button class="icon-btn" data-act="pause">${icon('i_pause')}</button>
        <button class="icon-btn" data-act="speed"><span>×1</span></button>
      </div>
      <div class="hand">
        <div class="next-card"><span>つぎ</span><div class="next-slot"></div></div>
        ${Array.from({ length: R.handSize }, (_, i) => `<div class="hand-slot" data-slot="${i}"></div>`).join('')}
      </div>`;
    hudRefs = {
      pHp: $('.castle-hp.player', hud), eHp: $('.castle-hp.enemy', hud),
      timer: $('.timer', hud), t: $('.timer .t', hud), regen: $('.regen', hud),
      manaNum: $('.mana-num', hud), segs: $$('.mana-seg', hud), manaWrap: $('.mana-wrap', hud),
      slots: $$('.hand-slot', hud), next: $('.next-slot', hud),
      cache: { slots: [], next: null, mana: -1 },
    };
    click($('[data-act=pause]', hud), () => { if (!battle || battle.over) return; battle.paused = true; openSettings(true); });
    click($('[data-act=speed]', hud), () => {
      battle.speed = battle.speed === 1 ? 2 : 1;
      $('[data-act=speed] span', hud).textContent = '×' + battle.speed;
    });
    hudRefs.slots.forEach((el, i) => el.addEventListener('pointerdown', (e) => onCardDown(e, i)));
  }

  function updateHud() {
    if (!battle || !hudRefs) return;
    const [p, e] = battle.sides;
    const h = hudRefs;
    setHp(h.pHp, p.castle);
    setHp(h.eHp, e.castle);
    const left = Math.max(0, R.matchTime - battle.time);
    const txt = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    if (h.t.textContent !== txt) h.t.textContent = txt;
    h.timer.classList.toggle('low', left <= 30 && !battle.over && battle.ready <= 0);
    const iv = CTD.regenInterval(battle.time);
    const rtxt = `1マナ / ${iv}秒`;
    if (h.regen.textContent !== rtxt) { h.regen.textContent = rtxt; h.regen.className = 'regen' + (iv <= 3 ? ' x2' : ''); }
    // マナ
    const m = p.mana;
    const mi = Math.floor(m + 1e-6);
    if (h.cache.mana !== mi) {
      if (mi > h.cache.mana && h.cache.mana >= 0) { h.manaNum.classList.remove('pop'); void h.manaNum.offsetWidth; h.manaNum.classList.add('pop'); }
      h.manaNum.textContent = mi;
      h.cache.mana = mi;
    }
    h.manaWrap.classList.toggle('capped', m >= R.maxMana - 1e-6);
    h.segs.forEach((seg, i) => {
      const f = Math.max(0, Math.min(1, m - i));
      seg.firstChild.style.width = (f * 100).toFixed(1) + '%';
      seg.classList.toggle('full', f >= 1);
    });
    // 手札
    p.hand.forEach((slot, i) => {
      const el = h.slots[i];
      const c = CTD.CARDS[slot.id];
      if (h.cache.slots[i] !== slot) {
        h.cache.slots[i] = slot;
        el.innerHTML = cardHTML(slot.id, { extra: '<div class="cdmask"></div><div class="cdtext"></div><div class="manabar"><i></i></div>' });
        el.firstElementChild.classList.add('dealt');
        if (selSlot === i) selSlot = -1;
      }
      const card = el.firstElementChild;
      const cool = slot.cd > 0;
      const noMana = p.mana < c.cost;
      card.classList.toggle('cool', cool);
      card.classList.toggle('nomana', noMana);
      card.classList.toggle('ready', !cool && !noMana);
      card.classList.toggle('sel', selSlot === i);
      $('.cdmask', card).style.height = cool ? (slot.cd / slot.cdMax * 100).toFixed(1) + '%' : '0';
      const ct = cool ? slot.cd.toFixed(slot.cd < 10 ? 1 : 0) : '';
      const cdt = $('.cdtext', card);
      if (cdt.textContent !== ct) cdt.textContent = ct;
      $('.manabar i', card).style.width = noMana ? Math.min(100, p.mana / c.cost * 100).toFixed(0) + '%' : '100%';
      $('.manabar', card).style.display = noMana && !cool ? 'block' : 'none';
    });
    const nx = p.next;
    if (h.cache.next !== nx) {
      h.cache.next = nx;
      h.next.innerHTML = nx && nx !== '?' ? cardHTML(nx) : '';
    }
  }

  function setHp(el, c) {
    const r = Math.max(0, c.hp / c.max);
    const pct = (r * 100).toFixed(1) + '%';
    const fill = el.querySelector('.fill');
    if (fill.style.width !== pct) {
      fill.style.width = pct;
      el.querySelector('.lag').style.width = pct;
      el.querySelector('.num').textContent = `${Math.ceil(Math.max(0, c.hp))} / ${c.max}`;
    }
  }

  // ---- カードの操作(ドラッグ、またはタップで選んで場所をタップ) ----
  let drag = null;
  function onCardDown(e, i) {
    if (!battle || battle.over || battle.paused) return;
    e.preventDefault();
    CTD.audioUnlock();
    const s = battle.sides[0];
    const slot = s.hand[i];
    const c = CTD.CARDS[slot.id];
    if (!battle.canPlay(0, i)) {
      const card = hudRefs.slots[i].firstElementChild;
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      CTD.sfx('denied');
      if (battle.ready > 0) return;
      toast(slot.cd > 0 ? `クールダウン中(あと ${slot.cd.toFixed(1)} 秒)` : `マナが足りない(${c.cost} 必要)`, { ms: 1400 });
      return;
    }
    const p = toStage(e);
    drag = { slot: i, id: slot.id, sx: p.x, sy: p.y, moved: false, pid: e.pointerId, ghost: null };
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) { /* 非対応 */ }
  }

  function updateDragGhost(p) {
    if (!drag.ghost) {
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'drag-card';
      drag.ghost.innerHTML = cardHTML(drag.id);
      stage.appendChild(drag.ghost);
      hudRefs.slots[drag.slot].firstElementChild.classList.add('dragging');
    }
    const overField = p.y < 586;
    drag.ghost.style.left = p.x + 'px';
    drag.ghost.style.top = p.y + 'px';
    drag.ghost.style.opacity = overField ? '0' : '0.95';
    if (overField) {
      const x = CTD.screenToWorldX(p.x);
      battle.drag = { id: drag.id, x: Math.max(0, Math.min(R.laneLength, x)), depth: CTD.screenToDepth(p.y + 30), valid: battle.validSpot(0, x) };
    } else battle.drag = { id: null };
  }

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid || !battle) return;
    const p = toStage(e);
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 10) drag.moved = true;
    if (drag.moved) updateDragGhost(p);
  });

  window.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    const card = hudRefs && hudRefs.slots[d.slot].firstElementChild;
    if (card) card.classList.remove('dragging');
    if (!battle) return;
    const p = toStage(e);
    if (!d.moved) {
      // タップ: 選択を切り替え
      selSlot = selSlot === d.slot ? -1 : d.slot;
      battle.drag = selSlot >= 0 ? { id: null } : null;
      if (selSlot >= 0 && tutorial) toast('出したい場所をタップ', { ms: 1200 });
      return;
    }
    battle.drag = null;
    if (p.y < 586) tryPlay(d.slot, p);
    selSlot = -1;
  });
  window.addEventListener('pointercancel', () => {
    if (drag && drag.ghost) drag.ghost.remove();
    drag = null;
    if (battle) battle.drag = null;
  });

  // 選択中のカードがあるとき、戦場をタップすると出せる
  canvas.addEventListener('pointerdown', (e) => {
    if (!battle || selSlot < 0 || battle.over) return;
    const p = toStage(e);
    if (p.y >= 586 || p.y < 90) return;
    tryPlay(selSlot, p);
    selSlot = -1;
    battle.drag = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!battle || selSlot < 0 || drag) return;
    const p = toStage(e);
    const id = battle.sides[0].hand[selSlot].id;
    const x = CTD.screenToWorldX(p.x);
    battle.drag = p.y < 586 ? { id, x: Math.max(0, Math.min(R.laneLength, x)), depth: CTD.screenToDepth(p.y + 30), valid: battle.validSpot(0, x) } : { id: null };
  });

  function tryPlay(slot, p) {
    const x = CTD.screenToWorldX(p.x);
    if (!battle.validSpot(0, x)) {
      CTD.sfx('denied');
      toast('カードは自陣(中央線より左)にしか出せない', { ms: 1600 });
      return false;
    }
    const id = battle.sides[0].hand[slot].id;
    const from = hudRefs.slots[slot].getBoundingClientRect();
    const ok = battle.play(0, slot, x, CTD.screenToDepth(p.y + 30));
    if (!ok) { CTD.sfx('denied'); return ok; }
    flyCard(id, (from.left + from.width / 2 - offX) / scale, (from.top + from.height / 2 - offY) / scale, p.x, p.y);
    return ok;
  }

  window.addEventListener('keydown', (e) => {
    if (!battle || battle.over) return;
    if (e.key >= '1' && e.key <= '5') { selSlot = +e.key - 1; }
    if (e.key === 'Escape') { selSlot = -1; battle.drag = null; }
    if (e.key === ' ' && !battle.paused) { battle.paused = true; openSettings(true); }
  });

  // ---- 戦闘のイベント ----
  function handleEvents() {
    if (!battle) return;
    const evs = battle.events.splice(0);
    for (const ev of evs) {
      if (ev.type === 'count') showCount(ev.n);
      else if (ev.type === 'surge') {
        CTD.sfx('surge');
        banner(ev.interval <= 3 ? 'ラストスパート!' : 'マナ回復アップ!', `1マナ / ${ev.interval}秒`);
        if (ev.interval <= 3) CTD.music('fever');
      } else if (ev.type === 'castleHit') {
        hudRefs.pHp.classList.remove('hit'); void hudRefs.pHp.offsetWidth; hudRefs.pHp.classList.add('hit');
      } else if (ev.type === 'bonus') CTD.sfx('coins');
      else if (ev.type === 'play' && ev.side === 0 && tutorial) tutorial.played = true;
      else if (ev.type === 'over') {
        toastBox.innerHTML = '';
        if (pointerEl) { pointerEl.remove(); pointerEl = null; }
        selSlot = -1;
        setTimeout(() => showResult(ev), ev.destroyed ? 1600 : 900);
        CTD.music(null);
      }
    }
    // チュートリアル
    if (tutorial && battle.ready <= 0 && !battle.over) {
      for (const tip of tutorial.list) {
        if (tip.done || battle.time < tip.at) continue;
        if (tip.cond === 'firstPlay' && !tutorial.played) continue;
        if (tip.cond === 'enemyLarge' && !battle.units.some(u => u.side === 1 && u.def.large)) continue;
        tip.done = true;
        toast(tip.text, { tip: true, ms: 5200 });
        break;
      }
      updatePointer();
    }
  }

  let pointerEl = null;
  function updatePointer() {
    const need = tutorial && battle && !tutorial.played && battle.ready <= 0 && battle.stage.tutorial === 1;
    if (need && !pointerEl) {
      pointerEl = document.createElement('div');
      pointerEl.className = 'hand-pointer';
      pointerEl.textContent = '👆';
      const slot = hudRefs.slots[0].getBoundingClientRect();
      const fx = (slot.left + slot.width / 2 - offX) / scale - 20, fy = (slot.top - offY) / scale + 30;
      pointerEl.style.setProperty('--fx', fx + 'px'); pointerEl.style.setProperty('--fy', fy + 'px');
      pointerEl.style.setProperty('--tx', CTD.worldToScreenX(320) + 'px'); pointerEl.style.setProperty('--ty', '470px');
      stage.appendChild(pointerEl);
    } else if (!need && pointerEl) { pointerEl.remove(); pointerEl = null; }
  }

  function showCount(n) {
    const old = $('.countdown', stage);
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'countdown';
    el.innerHTML = `<span>${n > 0 ? n : 'START!'}</span>`;
    stage.appendChild(el);
    CTD.sfx(n > 0 ? 'count' : 'go');
    setTimeout(() => el.remove(), 950);
  }

  function flyCard(id, fx, fy, tx, ty) {
    const el = document.createElement('div');
    el.className = 'fly-card';
    el.innerHTML = cardHTML(id);
    el.style.left = fx + 'px'; el.style.top = fy + 'px';
    stage.appendChild(el);
    el.animate([
      { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${tx - fx}px), calc(-50% + ${ty - fy}px)) scale(0.25) rotate(${tx > fx ? 18 : -18}deg)`, opacity: 0.2 },
    ], { duration: 260, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => el.remove();
  }

  function intro(st) {
    const el = document.createElement('div');
    el.className = 'intro';
    const boss = st.boss ? '<em>BOSS</em>' : '';
    el.innerHTML = `<div class="intro-band"><span class="you">あなた</span><b>VS</b><span class="foe">${esc(st.id)} ${esc(st.name)}${boss}</span></div>`;
    stage.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function banner(title, sub) {
    const el = document.createElement('div');
    el.className = 'banner';
    el.innerHTML = `<div>${esc(title)}<small>${esc(sub)}</small></div>`;
    stage.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  // ---- 結果 ----
  function showResult(ev) {
    if (!battle) return;
    const st = battle.stage;
    const E = CTD.ECONOMY;
    const win = ev.result === 'win';
    const conds = [win, win && ev.hpRatio >= 0.5, win && ev.destroyed];
    const stars = conds.filter(Boolean).length;
    const rec = save.stages[st.id] || { stars: 0, cleared: false };
    let gems = 0;
    const lines = [];
    if (win) {
      if (!rec.cleared) { gems += E.firstClear; lines.push(`初回クリア +${E.firstClear}`); }
      else { gems += E.replayWin; lines.push(`勝利 +${E.replayWin}`); }
      const newStars = Math.max(0, stars - (rec.stars || 0));
      if (newStars) { gems += newStars * E.perNewStar; lines.push(`新しい星 ×${newStars} +${newStars * E.perNewStar}`); }
      rec.cleared = true;
      rec.stars = Math.max(rec.stars || 0, stars);
      save.stages[st.id] = rec;
      save.stats.wins++;
    } else save.stats.losses++;
    save.gems += gems;
    writeSave();
    CTD.sfx(win ? 'win' : 'lose');
    const idx = CTD.STAGES.indexOf(st);
    const nextSt = CTD.STAGES[idx + 1];
    const title = win ? '勝利!' : ev.result === 'draw' ? '引き分け' : '敗北…';
    const m = modal(`
      <h2 class="result-title ${win ? 'win' : 'lose'}">${title}</h2>
      <div class="result-stars">${conds.map((c, i) => `<span class="bigstar ${c ? 'on' : ''}" style="animation-delay:${0.3 + i * 0.35}s">★</span>`).join('')}</div>
      <div class="cond">
        <span class="${conds[0] ? 'ok' : 'ng'}">勝利する</span>
        <span class="${conds[1] ? 'ok' : 'ng'}">自分の城の HP を半分以上残す(${Math.round(ev.hpRatio * 100)}%)</span>
        <span class="${conds[2] ? 'ok' : 'ng'}">3分以内に相手の城を壊す</span>
      </div>
      ${gems ? `<div class="reward"><i class="gem"></i> +${gems} <small>(${lines.join('、')})</small></div>` : `<p class="hint">${win ? '' : ev.result === 'draw' ? '城の HP が同じだった(引き分けはクリアにならない)' : 'デッキの相性を見直してみよう(偵察で相手のデッキが見られる)'}</p>`}
      <div class="row">
        <button class="btn gray" data-act="stages">ステージ選択</button>
        <button class="btn blue" data-act="retry">もう一度</button>
        ${win && nextSt ? '<button class="btn" data-act="next">次へ</button>' : ''}
      </div>`, { cls: 'result' });
    stars && conds.forEach((c, i) => c && setTimeout(() => CTD.sfx('star'), 300 + i * 350));
    if (gems) setTimeout(() => CTD.sfx('coins'), 1300);
    click($('[data-act=stages]', m), () => { endBattle(); showStages(st.world); });
    click($('[data-act=retry]', m), () => { endBattle(); startBattle(st); });
    const nx = $('[data-act=next]', m);
    if (nx) click(nx, () => { endBattle(); showStages(nextSt.world); openStageInfo(nextSt); });
  }

  // ================= ループ =================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(CTD.renderScale || 1, 0, 0, CTD.renderScale || 1, 0, 0);
    if (battle) {
      if (!battle.paused) {
        ai.update(dt);
        battle.update(dt);
      }
      battle.render(ctx);
      handleEvents();
      updateHud();
    } else if (menuScene) {
      menuScene.update(dt);
      menuScene.render(ctx);
    } else {
      ctx.fillStyle = '#14112a';
      ctx.fillRect(0, 0, 1280, 720);
    }
    requestAnimationFrame(loop);
  }

  // デバッグ・確認用
  CTD.ui = { startBattle: (id) => startBattle(CTD.STAGES.find(s => s.id === id)), showDeck, showGacha, showStages, showHome, get battle() { return battle; } };

  boot();
})(window.CTD);
