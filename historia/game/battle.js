// HISTORIA battle screen: FLIP card motion, drag & drop, particle/sprite FX, paced engine animations
(function () {
  'use strict';
  const { Game, CARDS, C, top, TYPE_JA, STATUS_JA, KIND_JA } = window.HE;
  const { cardHTML, backHTML, ic, esc } = window.HCARD;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const TCOL = { buyu: '#ff6a3d', chiryaku: '#5b8dff', seiji: '#ffcf4a', kagaku: '#3ff0d0', shiso: '#c27dff', tanken: '#4ac8ff', gekokujo: '#a77bff', geijutsu: '#ff7ab8', mushoku: '#ffffff' };
  const SPRITE = { fire: [100, 150, 16], flame: [100, 200, 8], water: [72, 72, 7], ice: [95, 95, 9], grass: [72, 72, 8], lightning: [200, 360, 4], lightning2: [200, 360, 4], psychic: [96, 96, 7], dark: [72, 72, 6], darkburst: [100, 100, 5], impact: [100, 100, 8], heal: [72, 72, 8], holy: [150, 670, 7], flare: [72, 72, 13], smoke: [72, 72, 11], staff: [50, 50, 7] };
  const TYPE_SPRITE = { buyu: 'impact', chiryaku: 'psychic', seiji: 'holy', kagaku: 'lightning', shiso: 'psychic', tanken: 'water', gekokujo: 'darkburst', geijutsu: 'flare', mushoku: 'impact' };
  const STIMG = { poison: 'poison', burn: 'burn', sleep: 'sleep', para: 'para', conf: 'conf' };

  let B = null; // battle state
  let api = null; // {stage, sfx, music, scale(), level, speed, onEnd}
  const dur = ms => ms / (B ? B.speed : 1);
  const wait = ms => sleep(dur(ms));

  // ===================== particles =====================
  class FX {
    constructor(cv) { this.cv = cv; this.c = cv.getContext('2d'); this.ps = []; this.raf = 0; this.tick = this.tick.bind(this); }
    add(p) { this.ps.push(Object.assign({ age: 0, life: .8, vx: 0, vy: 0, g: 0, drag: .98, size: 6, rot: 0, vr: 0, add: true }, p)); if (!this.raf) this.raf = requestAnimationFrame(this.tick); }
    burst(x, y, color, n, opt) {
      opt = opt || {};
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (opt.speed || 420) * (.35 + Math.random() * .8);
        this.add({ kind: opt.kind || 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0), g: opt.g == null ? 520 : opt.g, life: (opt.life || .7) * (.6 + Math.random() * .7), size: (opt.size || 5) * (.6 + Math.random() * .9), color, rot: Math.random() * 6, vr: (Math.random() - .5) * 14, drag: opt.drag || .96 });
      }
    }
    ring(x, y, color, r, life, w) { this.add({ kind: 'ring', x, y, size: r, color, life: life || .5, w: w || 6 }); }
    flash(x, y, color, r, life) { this.add({ kind: 'flash', x, y, size: r, color, life: life || .3 }); }
    slash(x, y, color, len, ang) { this.add({ kind: 'slash', x, y, size: len, rot: ang, color, life: .28 }); }
    bolt(x1, y1, x2, y2, color) { this.add({ kind: 'bolt', x: x1, y: y1, x2, y2, color, life: .25, seed: Math.random() }); }
    tick(t) {
      const c = this.c, dt = 1 / 60; c.clearRect(0, 0, 1600, 900);
      this.ps = this.ps.filter(p => (p.age += dt) < p.life);
      for (const p of this.ps) {
        const k = p.age / p.life, a = 1 - k;
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        c.save(); c.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; c.translate(p.x, p.y);
        switch (p.kind) {
          case 'spark': { const r = p.size * (1 - k * .5); const gr = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.4); gr.addColorStop(0, '#fff'); gr.addColorStop(.25, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = gr; c.beginPath(); c.arc(0, 0, r * 2.4, 0, 7); c.fill(); break; }
          case 'shard': { c.globalAlpha = a; c.rotate(p.rot); c.fillStyle = p.color; c.fillRect(-p.size, -p.size / 3, p.size * 2, p.size * .66); break; }
          case 'petal': { c.globalCompositeOperation = 'source-over'; c.globalAlpha = a; c.rotate(p.rot); c.fillStyle = p.color; c.beginPath(); c.ellipse(0, 0, p.size, p.size * .45 * (.3 + .7 * Math.abs(Math.sin(p.age * 8))), 0, 0, 7); c.fill(); break; }
          case 'smoke': { c.globalCompositeOperation = 'source-over'; const r = p.size * (1 + k * 2); const gr = c.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a * .5; c.fillStyle = gr; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); break; }
          case 'ring': { c.globalAlpha = a; c.strokeStyle = p.color; c.lineWidth = p.w * a; c.beginPath(); c.arc(0, 0, p.size * (.3 + k), 0, 7); c.stroke(); break; }
          case 'flash': { const r = p.size * (.6 + k * .6); const gr = c.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.3, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = gr; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); break; }
          case 'slash': { c.rotate(p.rot); c.globalAlpha = a; const L = p.size * (.4 + k * .8); const gr = c.createLinearGradient(-L, 0, L, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.strokeStyle = gr; c.lineWidth = 9 * a + 2; c.shadowColor = p.color; c.shadowBlur = 24; c.beginPath(); c.moveTo(-L, 0); c.lineTo(L, 0); c.stroke(); break; }
          case 'bolt': { c.globalAlpha = a; c.strokeStyle = '#eaffff'; c.shadowColor = p.color; c.shadowBlur = 20; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); const n = 7; for (let i = 1; i <= n; i++) { const f = i / n; c.lineTo((p.x2 - p.x) * f + (i < n ? (Math.random() - .5) * 60 : 0), (p.y2 - p.y) * f); } c.stroke(); break; }
        }
        c.restore();
      }
      this.raf = this.ps.length ? requestAnimationFrame(this.tick) : 0;
      if (!this.raf) c.clearRect(0, 0, 1600, 900);
    }
  }
  function impact(x, y, type, big) {
    const f = B.fx, col = TCOL[type] || '#fff', s = big ? 1.5 : 1;
    f.flash(x, y, col, 170 * s, .35); f.ring(x, y, col, 150 * s, .5, 8);
    switch (type) {
      case 'buyu': f.slash(x, y, col, 150 * s, -.6); setTimeout(() => f.slash(x, y, col, 150 * s, .7), 70); f.burst(x, y, '#ffb36b', 36, { kind: 'spark' }); f.burst(x, y, '#ffd9a0', 14, { kind: 'shard', size: 7 }); break;
      case 'chiryaku': f.burst(x, y, col, 40, { speed: 380, g: 0 }); setTimeout(() => f.ring(x, y, '#bcd0ff', 210 * s, .5, 5), 90); break;
      case 'seiji': f.burst(x, y, '#ffe9a0', 46, { g: 300, up: 200 }); f.burst(x, y, '#ffcf4a', 16, { kind: 'shard', size: 6 }); break;
      case 'kagaku': for (let i = 0; i < 4; i++) setTimeout(() => { f.bolt(x + (Math.random() - .5) * 220, y - 360, x + (Math.random() - .5) * 40, y, col); f.flash(x, y, '#fff', 120, .15); }, i * 60); f.burst(x, y, col, 34); break;
      case 'shiso': f.burst(x, y, col, 34, { g: -80, speed: 260 }); for (let i = 1; i <= 3; i++) setTimeout(() => f.ring(x, y, col, 90 * i * s, .5, 4), i * 80); break;
      case 'tanken': f.burst(x, y, '#9fe0ff', 46, { g: 700, up: 220 }); setTimeout(() => f.ring(x, y, '#c4ecff', 200 * s, .55, 4), 80); break;
      case 'gekokujo': f.burst(x, y, '#3a2850', 12, { kind: 'smoke', size: 50, speed: 120, g: -40, life: 1.1 }); f.burst(x, y, col, 30, { speed: 360 }); f.slash(x, y, '#d0b0ff', 170 * s, .9); break;
      case 'geijutsu': f.burst(x, y, '#ffb0d6', 30, { kind: 'petal', size: 9, g: 120, life: 1.2, speed: 300 }); f.burst(x, y, col, 20); break;
      default: f.burst(x, y, '#fff', 30);
    }
    sprite(TYPE_SPRITE[type] || 'impact', x, y, big ? 1.6 : 1.2, 520);
  }
  function sprite(name, x, y, scale, ms) {
    const d = SPRITE[name]; if (!d) return; const [w, h, n] = d; const W = w * scale, H = h * scale;
    const el = document.createElement('div'); el.className = 'fx-sprite';
    Object.assign(el.style, { left: x - W / 2 + 'px', top: y - H / 2 + 'px', width: W + 'px', height: H + 'px', backgroundImage: `url(fx/${name}.png)`, backgroundSize: `${W * n}px ${H}px` });
    $('#fxl').appendChild(el);
    el.animate([{ backgroundPosition: '0 0' }, { backgroundPosition: `${-W * n}px 0` }], { duration: dur(ms), easing: `steps(${n})`, fill: 'forwards' });
    setTimeout(() => el.remove(), dur(ms) + 40);
  }
  function shake(power) {
    const el = $('#board'); if (!el) return; const n = 7 * (power || 1);
    el.animate([{ transform: 'none' }, { transform: `translate(${-n}px,${n * .6}px)` }, { transform: `translate(${n}px,${-n * .4}px)` }, { transform: `translate(${-n * .6}px,${n * .3}px)` }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
  }

  // ===================== geometry =====================
  function rectStage(el) { const s = api.stage.getBoundingClientRect(), k = s.width / 1600, r = el.getBoundingClientRect(); return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k }; }
  const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const slotEl = uid => $(`[data-k="s${uid}"]`);
  function slotCenter(uid) { const el = slotEl(uid); return el ? center(rectStage(el)) : { x: 800, y: 450 }; }
  function floater(x, y, html, cls, ms) {
    const el = document.createElement('div'); el.className = 'floater ' + (cls || ''); el.innerHTML = html; el.style.left = x + 'px'; el.style.top = y + 'px';
    $('#fxl').appendChild(el); setTimeout(() => el.remove(), dur(ms || 1200)); return el;
  }

  // ===================== render (with FLIP) =====================
  function snapshot() { const m = {}; for (const el of $$('[data-k]', $('#board'))) m[el.dataset.k] = rectStage(el); return m; }
  function render(opts) {
    if (!B) return; const prev = snapshot();
    $('#board').innerHTML = boardHTML();
    fitNames();
    bind();
    if (opts && opts.noFlip) return;
    for (const el of $$('[data-k]', $('#board'))) {
      const now = rectStage(el); let from = prev[el.dataset.k];
      if (!from && el.dataset.alt) for (const a of el.dataset.alt.split(' ')) if (prev[a]) { from = prev[a]; break; }
      if (!from && el.dataset.from) { const p = $(`[data-pile="${el.dataset.from}"]`); if (p) from = rectStage(p); }
      if (!from) continue;
      const dx = from.x - now.x, dy = from.y - now.y, sx = from.w / Math.max(1, now.w);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < .02) continue;
      el.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sx})`, transformOrigin: 'top left', zIndex: 30 }, { transform: 'none', transformOrigin: 'top left', zIndex: 30 }], { duration: dur(430), easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
  }
  function fitNames() { requestAnimationFrame(() => $$('.card .name', $('#battle')).forEach(n => { if (n.dataset.fit) return; n.dataset.fit = 1; let f = parseFloat(getComputedStyle(n).fontSize), i = 0; while (n.scrollWidth > n.clientWidth + 1 && i++ < 25) { f *= .93; n.style.fontSize = f + 'px'; } })); }

  function slotHTML(g, s, side, where) {
    const c = top(s), max = g.maxHp(s), left = Math.max(0, max - s.damage), pct = left / max;
    const t = B.ui.targets && B.ui.targets.includes(s.uid) ? ' target' : '';
    const ready = side === 'me' && where === 'active' && g.cur === 0 && !B.ui.busy && c.atks.some((a, i) => g.canAttack(0, i)) ? ' ready' : '';
    return `<div class="slot ${side} ${where}${t}${ready}" data-k="s${s.uid}" data-alt="c${s.stack[0].uid} c${s.stack[s.stack.length - 1].uid}" data-slot="${s.uid}">
      <div class="sfx">${cardHTML(c.id)}</div>
      <div class="ens">${s.energy.map(e => ic(C(e).type)).join('')}</div>
      <div class="sts">${Object.keys(s.status).map(k => `<img src="ui/${STIMG[k]}.jpg" title="${STATUS_JA[k]}" alt="${STATUS_JA[k]}">`).join('')}${s.guard ? '<img src="ui/guard.jpg" title="ダメージ軽減" alt="">' : ''}</div>
      ${s.tool ? `<div class="tool" style="background-image:url(art/${C(s.tool).art})" title="${esc(C(s.tool).name)}"></div>` : ''}
      <div class="hpbar ${pct <= .3 ? 'low' : pct <= .6 ? 'mid' : ''}"><i style="width:${pct * 100}%"></i><span>${left}<small>&nbsp;/ ${max}</small></span></div></div>`;
  }
  function boardHTML() {
    const g = B.g, me = g.P(0), cpu = g.P(1), ui = B.ui;
    const myTurn = g.cur === 0 && !ui.busy && g.winner == null && !ui.pending;
    const playable = myTurn ? g.playable(0) : [];
    B.playable = playable;
    const okUid = new Set(playable.map(a => a.card.uid));
    const bench = (p, side, y) => `<div class="benchrow ${side}" style="top:${y}px" data-drop="${side === 'me' ? 'bench' : ''}">${[0, 1, 2, 3, 4].map(i => p.bench[i] ? `<div class="bwrap">${slotHTML(g, p.bench[i], side, 'bench')}</div>` : '<div class="bwrap empty"></div>').join('')}</div>`;
    const prizes = (p, y) => `<div class="prizes" style="top:${y}px">${p.prizes.map(c => `<div class="pz" data-k="c${c.uid}">${backHTML()}</div>`).join('')}${Array(6 - p.prizes.length).fill('<div class="pz gone"></div>').join('')}</div>`;
    const pile = (p, y) => `<div class="piles" style="top:${y}px">
      <div class="pile" data-trash="${p.i}">${p.discard.length ? `<div data-k="c${p.discard[p.discard.length - 1].uid}">${cardHTML(p.discard[p.discard.length - 1].id)}</div>` : '<div class="empty"></div>'}<b>トラッシュ ${p.discard.length}</b></div>
      <div class="pile" data-pile="deck${p.i}">${p.deck.length ? backHTML() : '<div class="empty"></div>'}<b>山札 ${p.deck.length}</b></div></div>`;
    const lead = d => (d.cards.map(id => CARDS[id]).find(c => c.kind === 'person') || {}).art || 'H01-001.jpg';
    const n = me.hand.length, spread = Math.min(70, 520 / Math.max(1, n));
    const hand = me.hand.map((c, i) => { const o = i - (n - 1) / 2; return `<div class="hc ${okUid.has(c.uid) ? 'ok' : myTurn ? 'no' : ''} ${ui.sel === c.uid ? 'sel' : ''}" data-hand="${c.uid}" data-k="c${c.uid}" data-from="deck0" style="left:${o * spread}px;rotate:${o * 3}deg;translate:0 ${Math.abs(o) * Math.abs(o) * 1.6}px;z-index:${i + 1}">${cardHTML(c.id)}</div>`; }).join('');
    const on = cpu.hand.length, ospread = Math.min(26, 220 / Math.max(1, on));
    const ohand = cpu.hand.map((c, i) => { const o = i - (on - 1) / 2; return `<div class="ohc" data-k="c${c.uid}" data-from="deck1" style="left:${o * ospread}px;rotate:${-o * 3}deg">${backHTML()}</div>`; }).join('');
    const playing = [me, cpu].map(p => p.playing ? `<div class="playing ${p.i === 0 ? 'me' : 'opp'}" data-k="c${p.playing.uid}">${cardHTML(p.playing.id)}</div>` : '').join('');
    const canEnd = myTurn && !ui.targets;
    const idle = canEnd && !playable.length && !(me.active && C(top(me.active).id).atks.some((a, i) => g.canAttack(0, i)));
    return `<div class="line"></div><div class="playzone" data-drop="play"></div>
      <div class="who opp ${g.cur === 1 ? 'cur' : ''}"><div class="face" style="background-image:url(art/${lead(B.decks[1])})"></div><div><b>${esc(cpu.name)}</b><small>手札 ${cpu.hand.length} ・ 山札 ${cpu.deck.length}</small></div>${g.cur === 1 && g.winner == null ? '<i class="think"><span></span><span></span><span></span></i>' : ''}</div>
      <div class="ohand">${ohand}</div>
      <div class="plab" style="top:118px">サイド<b>${cpu.prizes.length}</b></div>${prizes(cpu, 150)}
      <div class="plab" style="top:520px">サイド<b>${me.prizes.length}</b></div>${prizes(me, 552)}
      <div class="who me ${g.cur === 0 ? 'cur' : ''}"><div class="face" style="background-image:url(art/${lead(B.decks[0])})"></div><div><b>あなた</b><small>手札 ${me.hand.length} ・ 山札 ${me.deck.length}</small></div></div>
      ${bench(cpu, 'opp', 6)}
      <div class="ped opp"></div><div class="ped me"></div>
      ${cpu.active ? `<div class="awrap opp">${slotHTML(g, cpu.active, 'opp', 'active')}</div>` : ''}
      ${me.active ? `<div class="awrap me">${slotHTML(g, me.active, 'me', 'active')}</div>` : ''}
      ${bench(me, 'me', 664)}
      ${g.stadium ? `<div class="stadium" data-zoom="${g.stadium.card.id}" data-k="c${g.stadium.card.uid}">${cardHTML(g.stadium.card.id)}<b>スタジアム</b></div>` : ''}
      ${pile(cpu, 96)}${pile(me, 602)}
      <div class="turnbox ${g.cur === 0 ? 'mine' : ''}"><small>TURN ${g.turn}</small><b>${g.winner != null ? '終了' : g.cur === 0 ? 'あなたの番' : '相手の番'}</b>
        <div class="flags"><span class="${me.energyPlayed ? '' : 'on'}">${ic('mushoku')}エネルギー</span><span class="${me.supporterPlayed || g.turn === 1 ? '' : 'on'}">サポート</span><span class="${me.retreated ? '' : 'on'}">にげる</span></div></div>
      <button class="btn sm endturn ${idle ? 'glow' : ''}" id="endturn" ${canEnd ? '' : 'disabled'}>ターン終了</button>
      <div class="topbtns"><button class="rbtn" id="spd" title="演出の速さ" style="--i:var(--i-tanken)"><em>${B.speed}x</em></button><button class="rbtn" id="logb" title="バトルログ" style="--i:var(--i-shiso)"></button><button class="rbtn" id="quit" title="降参" style="--i:var(--i-gekokujo)"></button></div>
      <div class="hand">${hand}</div>
      ${playing}
      ${ui.menu ? menuHTML(g) : ''}
      ${ui.zoom ? zoomHTML(g) : ''}
      ${ui.hint ? `<div class="hint">${esc(ui.hint)}</div>` : ''}
      ${B.log ? `<div class="log panel">${g.log.slice(-90).map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
      ${ui.modal || ''}`;
  }
  function menuHTML(g) {
    const s = g.P(0).active; if (!s) return '';
    const c = top(s);
    const why = g.turn === 1 ? '先攻の最初の番はワザが使えない' : s.status.sleep ? 'ねむりで動けない' : s.status.para ? 'マヒで動けない' : '';
    const atks = c.atks.map((a, i) => { const ok = g.canAttack(0, i); const text = window.HE.attackText(a); return `<button class="amenu-atk ${ok ? '' : 'off'}" data-atk="${i}" ${ok ? '' : 'disabled'}><span class="cost">${a.cost.map(t => ic(t)).join('')}</span><span class="nm">${esc(a.name)}<small>${esc(text)}</small></span><b>${a.dmg || ''}</b></button>`; }).join('');
    return `<div class="amenu"><div class="amenu-h">${esc(c.name)}</div>${atks}${why ? `<div class="amenu-why">${why}</div>` : ''}
      <div class="amenu-row"><button class="btn dark xs" data-retreat="1" ${g.canRetreat(0) ? '' : 'disabled'}>にげる ${g.retreatCost(s) ? Array(g.retreatCost(s)).fill(ic('mushoku')).join('') : '0'}</button><button class="btn dark xs" data-mclose="1">閉じる</button></div></div>`;
  }
  function zoomHTML(g) {
    const z = B.ui.zoom; let acts = '';
    if (z.hand != null) {
      const a = B.playable.filter(x => x.card.uid === z.hand);
      const label = { bench: 'ベンチに出す', evolve: '進化させる', energy: 'エネルギーをつける', trainer: '使う', tool: 'つける', stadium: '場に出す' };
      acts = a.length ? a.map(x => `<button class="btn" data-act="${x.type}">${label[x.type]}</button>`).join('') + '<div class="note">ドラッグして置くこともできます</div>' : `<div class="note">${g.cur !== 0 ? '相手の番です' : notUsable(g, z.id)}</div>`;
    }
    return `<div class="zoom">${cardHTML(z.id)}<div class="acts">${acts}<button class="btn dark xs" data-zclose="1">閉じる</button></div></div>`;
  }
  function notUsable(g, id) {
    const c = CARDS[id], me = g.P(0);
    if (c.kind === 'energy') return me.energyPlayed ? 'この番はもうエネルギーをつけた' : '';
    if (c.kind === 'support') return g.turn === 1 ? '先攻の最初の番はサポートが使えない' : me.supporterPlayed ? 'この番はもうサポートを使った' : 'いまは使えない';
    if (c.kind === 'person' && c.stage > 0) return g.turn <= 2 ? 'おたがいの最初の番は進化できない' : '進化できる人物がいない（出したばかりの人物も進化できない）';
    if (c.kind === 'person') return 'ベンチがいっぱい';
    return 'いまは使えない';
  }

  // ===================== input =====================
  function bind() {
    const g = B.g, root = $('#board');
    $$('[data-hand]', root).forEach(h => h.addEventListener('pointerdown', e => startDrag(e, h)));
    $$('[data-slot]', root).forEach(s => s.addEventListener('click', e => {
      e.stopPropagation(); const uid = +s.dataset.slot;
      if (B.ui.targets && B.ui.targets.includes(uid)) { const f = B.ui.onTarget; B.ui.targets = null; B.ui.hint = null; api.sfx('select', .5); f(uid); return; }
      if (B.ui.targets) return;
      const me = g.P(0);
      if (me.active && me.active.uid === uid && g.cur === 0 && !B.ui.busy && !B.ui.pending) { api.sfx('select', .4); B.ui.menu = true; B.ui.zoom = null; B.ui.sel = null; render({ noFlip: true }); return; }
      const all = [...g.allSlots(g.P(0)), ...g.allSlots(g.P(1))]; const sl = all.find(x => x.uid === uid); if (!sl) return;
      api.sfx('select', .3); B.ui.zoom = { id: top(sl).id }; B.ui.menu = false; render({ noFlip: true });
    }));
    $$('[data-zoom]', root).forEach(s => s.onclick = () => { B.ui.zoom = { id: s.dataset.zoom }; render({ noFlip: true }); });
    $$('[data-trash]', root).forEach(t => t.onclick = () => { const p = g.P(+t.dataset.trash); if (!p.discard.length) return; B.ui.modal = `<div class="modal" data-mclose="1"><div class="panel"><div class="q">トラッシュ（${p.discard.length}枚）</div><div class="opts">${p.discard.map(c => `<div class="opt">${cardHTML(c.id)}</div>`).join('')}</div><button class="btn dark sm" data-mclose="1">閉じる</button></div></div>`; render({ noFlip: true }); });
    $$('[data-mclose]', root).forEach(m => m.onclick = e => { if (e.target === m || m.tagName === 'BUTTON') { B.ui.modal = null; B.ui.menu = false; render({ noFlip: true }); } });
    $$('[data-zclose]', root).forEach(b => b.onclick = () => { B.ui.zoom = null; B.ui.sel = null; render({ noFlip: true }); });
    $$('[data-act]', root).forEach(b => b.onclick = () => doAct(b.dataset.act, B.ui.sel));
    $$('[data-atk]', root).forEach(b => b.onclick = () => humanAction(() => g.attack(0, +b.dataset.atk)));
    const rb = $('[data-retreat]', root); if (rb) rb.onclick = () => humanAction(() => g.retreat(0), true);
    $('#endturn', root).onclick = () => humanAction(() => g.endTurn());
    $('#logb', root).onclick = () => { B.log = !B.log; render({ noFlip: true }); };
    $('#spd', root).onclick = () => { B.speed = B.speed === 1 ? 1.6 : B.speed === 1.6 ? 2.5 : 1; api.setSpeed(B.speed); render({ noFlip: true }); };
    $('#quit', root).onclick = () => { B.ui.modal = `<div class="modal"><div class="panel"><div class="q">降参しますか？</div><div style="display:flex;gap:16px"><button class="btn red sm" id="qyes">降参する</button><button class="btn dark sm" data-mclose="1">続ける</button></div></div></div>`; render({ noFlip: true }); $('#qyes').onclick = () => { B.ui.modal = null; g.concede(0); }; };
    if (B.after) { const f = B.after; B.after = null; f(root); }
  }
  async function humanAction(fn, keepTurn) {
    B.ui.menu = false; B.ui.zoom = null; B.ui.sel = null; B.ui.busy = true; render({ noFlip: true });
    await fn(); B.ui.busy = false; render();
    await cpuLoop();
  }
  // ---- drag & drop from hand ----
  function dropTargetsFor(uid) {
    const acts = B.playable.filter(a => a.card.uid === uid); const out = [];
    for (const a of acts) {
      if (a.type === 'bench') out.push({ type: 'bench', el: $('.benchrow.me') });
      else if (a.type === 'trainer' || a.type === 'stadium') out.push({ type: a.type, el: $('.playzone') });
      else for (const t of a.targets) out.push({ type: a.type, el: slotEl(t.uid), slot: t.uid });
    }
    return out.filter(x => x.el);
  }
  function startDrag(e, h) {
    if (B.ui.busy || B.ui.pending || B.g.cur !== 0 || B.ui.targets) { tapHand(+h.dataset.hand); return; }
    e.preventDefault(); const uid = +h.dataset.hand; const sx = e.clientX, sy = e.clientY; let ghost = null, targets = null, hot = null;
    const k = rectStage($('#stage')).w ? api.stage.getBoundingClientRect().width / 1600 : 1;
    const move = ev => {
      const dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
      if (!ghost) {
        if (Math.hypot(dx, dy) < 12) return;
        targets = dropTargetsFor(uid);
        const r = rectStage(h); ghost = document.createElement('div'); ghost.className = 'ghost'; ghost.innerHTML = cardHTML(B.g.P(0).hand.find(c => c.uid === uid).id);
        ghost.style.left = r.x + 'px'; ghost.style.top = r.y + 'px'; ghost._x = r.x; ghost._y = r.y; $('#fxl').appendChild(ghost); h.classList.add('lifted');
        targets.forEach(t => t.el.classList.add('drop-ok')); if (!targets.length) { ghost.classList.add('cant'); }
        B.ui.zoom = null; api.sfx('select', .3);
      }
      ghost.style.transform = `translate(${dx}px,${dy}px) rotate(${Math.max(-12, Math.min(12, dx / 30))}deg) scale(1.08)`;
      const px = (ev.clientX - api.stage.getBoundingClientRect().left) / k, py = (ev.clientY - api.stage.getBoundingClientRect().top) / k;
      let best = null; for (const t of targets) { const r = rectStage(t.el); const pad = t.type === 'bench' || t.type === 'trainer' || t.type === 'stadium' ? 20 : 30; if (px > r.x - pad && px < r.x + r.w + pad && py > r.y - pad && py < r.y + r.h + pad) best = t; }
      if (best !== hot) { if (hot) hot.el.classList.remove('drop-hot'); hot = best; if (hot) { hot.el.classList.add('drop-hot'); api.sfx('select', .15); } }
    };
    const up = async () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!ghost) { tapHand(uid); return; }
      (targets || []).forEach(t => t.el.classList.remove('drop-ok', 'drop-hot'));
      if (hot) {
        ghost.remove(); h.classList.remove('lifted');
        await humanAction(async () => {
          const g = B.g;
          if (hot.type === 'bench') await g.playBasic(0, uid);
          else if (hot.type === 'evolve') await g.evolve(0, uid, hot.slot);
          else if (hot.type === 'energy') await g.attachEnergy(0, uid, hot.slot);
          else if (hot.type === 'tool') await g.attachTool(0, uid, hot.slot);
          else if (hot.type === 'stadium') await g.playStadium(0, uid);
          else if (hot.type === 'trainer') await g.playTrainer(0, uid);
        }, true);
      } else {
        const a = ghost.animate([{ transform: ghost.style.transform }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
        a.onfinish = () => { ghost.remove(); h.classList.remove('lifted'); };
        if (!targets.length) { api.toast(notUsable(B.g, B.g.P(0).hand.find(c => c.uid === uid).id) || 'いまは出せません'); }
      }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function tapHand(uid) {
    const c = B.g.P(0).hand.find(x => x.uid === uid); if (!c) return;
    if (B.ui.pending) return;
    api.sfx('select', .35); B.ui.sel = uid; B.ui.zoom = { id: c.id, hand: uid }; B.ui.menu = false; render({ noFlip: true });
  }
  async function doAct(type, uid) {
    const g = B.g; const a = B.playable.find(x => x.type === type && x.card.uid === uid); if (!a) return;
    const pick = (targets, hint) => new Promise(res => { B.ui.targets = targets.map(t => t.uid); B.ui.hint = hint; B.ui.onTarget = res; B.ui.zoom = null; render({ noFlip: true }); });
    let t = null;
    if (type === 'evolve') t = a.targets.length === 1 ? a.targets[0].uid : await pick(a.targets, '進化させる人物を選んでください');
    if (type === 'energy') t = await pick(a.targets, 'エネルギーをつける人物を選んでください');
    if (type === 'tool') t = await pick(a.targets, 'どうぐをつける人物を選んでください');
    await humanAction(async () => {
      if (type === 'bench') await g.playBasic(0, uid);
      else if (type === 'evolve') await g.evolve(0, uid, t);
      else if (type === 'energy') await g.attachEnergy(0, uid, t);
      else if (type === 'tool') await g.attachTool(0, uid, t);
      else if (type === 'stadium') await g.playStadium(0, uid);
      else if (type === 'trainer') await g.playTrainer(0, uid);
    }, true);
  }
  // ---- engine questions for the human ----
  function humanAsk(req) {
    return new Promise(resolve => {
      const opts = req.options || []; if (!opts.length) return resolve(null);
      const finish = v => { B.ui.modal = null; B.ui.pending = false; B.ui.targets = null; B.ui.hint = null; render({ noFlip: true }); resolve(v); };
      B.ui.pending = true; B.ui.menu = false; B.ui.zoom = null;
      if (opts[0].slot) { B.ui.targets = opts.map(o => o.value); B.ui.hint = req.prompt; B.ui.onTarget = v => finish(v); render({ noFlip: true }); return; }
      B.ui.modal = `<div class="modal"><div class="panel"><div class="q">${esc(req.prompt)}</div><div class="opts">${opts.map((o, i) => `<div class="opt" data-o="${i}">${cardHTML(o.card ? (o.card.id || o.card) : 'E-buyu')}</div>`).join('')}</div>${req.optional ? `<button class="btn dark sm" data-skip="1">${/setup/.test(req.kind) ? '準備完了' : '選ばない'}</button>` : ''}</div></div>`;
      B.after = el => { $$('[data-o]', el).forEach(d => d.onclick = () => { api.sfx('select', .4); finish(opts[+d.dataset.o].value); }); const sk = $('[data-skip]', el); if (sk) sk.onclick = () => finish(null); };
      render({ noFlip: true });
    });
  }

  // ===================== animations driven by the engine =====================
  async function fx(type, d) {
    if (!B || B.dead) return;
    const g = B.g;
    switch (type) {
      case 'draw': render(); if (d.pi === 0) api.sfx('select', .25); await wait(d.n > 2 ? 520 : 320); break;
      case 'place': {
        render(); await wait(260); const p = slotCenter(d.slot); B.fx.ring(p.x, p.y, '#ffe6a0', 120, .45, 5); B.fx.burst(p.x, p.y + 40, '#ffe6a0', 18, { speed: 260, g: 200 }); slam(d.slot); api.sfx('mace', .4); await wait(260); break;
      }
      case 'evolve': {
        const p = slotCenter(d.slot); B.fx.flash(p.x, p.y, '#ffffff', 220, .5); api.sfx('magic-holy-2', .6);
        for (let i = 0; i < 3; i++) setTimeout(() => B.fx.ring(p.x, p.y, '#fff2c0', 120 + i * 50, .5, 5), i * 90);
        B.fx.burst(p.x, p.y + 60, '#fff2c0', 40, { g: -260, speed: 160, life: 1 }); render(); callout(p.x, p.y - 90, '進化！', 'evo'); await wait(780); break;
      }
      case 'energy': {
        const to = slotCenter(d.slot); const from = d.pi === 0 ? { x: 800, y: 860 } : { x: 800, y: 40 };
        await orb(from, to, TCOL[d.type]); B.fx.burst(to.x, to.y, TCOL[d.type], 22, { speed: 240, g: 0 }); B.fx.ring(to.x, to.y, TCOL[d.type], 90, .4, 4); api.sfx('magic-missile-2', .35); render(); await wait(200); break;
      }
      case 'tool': { render(); const p = slotCenter(d.slot); B.fx.burst(p.x, p.y, '#d7b8ff', 20, { g: 0, speed: 200 }); api.sfx('select', .4); await wait(300); break; }
      case 'stadium': { render(); api.sfx('horn-1', .35); banner(`スタジアム「${CARDS[d.id].name}」`, 'stadium'); await wait(1000); break; }
      case 'trainer': { render(); api.sfx('ink', .5); await wait(d.pi === 0 ? 650 : 1000); break; }
      case 'switch': render(); api.sfx('select', .35); await wait(450); break;
      case 'heal': { const p = slotCenter(d.slot); sprite('heal', p.x, p.y, 1.6, 520); B.fx.burst(p.x, p.y + 30, '#7dffb4', 22, { g: -200, speed: 120, life: .9 }); floater(p.x, p.y - 40, `+${d.n || ''}`, 'heal', 1100); api.sfx('heal', .5); render(); await wait(520); break; }
      case 'attack': {
        render({ noFlip: true });
        const atk = slotEl(d.slot); const tgt = d.target ? slotCenter(d.target) : { x: 800, y: d.pi === 0 ? 290 : 560 };
        attackBand(d.name, d.type, d.pi); api.sfx('horn-3', .25); await wait(620);
        if (atk) { const dir = d.pi === 0 ? -1 : 1; atk.animate([{ transform: 'none' }, { transform: `translateY(${-dir * 18}px) scale(.96)`, offset: .35 }, { transform: `translateY(${dir * 90}px) scale(1.1)`, offset: .7 }, { transform: 'none' }], { duration: dur(420), easing: 'ease-in-out' }); }
        await wait(260); api.sfx(ATK_SFX[d.type] || 'sword-1', .7); impact(tgt.x, tgt.y, d.type, false); shake(1); await wait(260); break;
      }
      case 'damage': {
        const el = slotEl(d.slot); const p = slotCenter(d.slot);
        if (el) el.animate([{ filter: 'brightness(3) saturate(0)' }, { filter: 'none' }], { duration: dur(280) });
        floater(p.x, p.y - 30, `-${d.n}`, 'dmg' + (d.n >= 100 ? ' big' : '') + (d.weak ? ' weak' : ''), 1300);
        if (!d.fromAttack) { B.fx.burst(p.x, p.y, '#ff8a6a', 14, { speed: 200 }); }
        if (d.weak) { callout(p.x, p.y + 60, '弱点！', 'weak'); shake(1.6); }
        api.sfx(d.n >= 80 ? 'explosion' : 'human-hit-1', .55);
        render({ noFlip: true }); await wait(700); break;
      }
      case 'status': { const p = slotCenter(d.slot); render({ noFlip: true }); callout(p.x, p.y - 60, STATUS_JA[d.st] + '！', 'cond ' + d.st); api.sfx(d.st === 'poison' ? 'poison' : d.st === 'burn' ? 'fire' : d.st === 'sleep' ? 'slowed' : d.st === 'para' ? 'lightning' : 'magic-faeriefire', .5); await wait(700); break; }
      case 'coin': await coin(d.heads, d.label); break;
      case 'ko': {
        const el = slotEl(d.slot); const p = slotCenter(d.slot);
        callout(p.x, p.y, '退場！', 'ko'); api.sfx('wail-sml', .6); shake(1.4);
        B.fx.burst(p.x, p.y, '#ffffff', 30, { kind: 'shard', size: 9, speed: 380 }); B.fx.burst(p.x, p.y, '#333', 8, { kind: 'smoke', size: 60, speed: 80, g: -30, life: 1 });
        if (el) el.animate([{ opacity: 1, transform: 'none', filter: 'none' }, { opacity: 1, transform: 'scale(1.06)', filter: 'grayscale(1) brightness(1.6)', offset: .3 }, { opacity: 0, transform: 'translateY(40px) scale(.8) rotate(-6deg)', filter: 'grayscale(1) brightness(.4)' }], { duration: dur(800), easing: 'ease-in', fill: 'forwards' });
        await wait(820); render({ noFlip: true }); break;
      }
      case 'prize': render(); api.sfx('gold', .5); await wait(520); break;
      case 'turn': { render({ noFlip: true }); if (d.turn > 0) { banner(d.pi === 0 ? 'あなたの番' : '相手の番', d.pi === 0 ? 'mine' : 'theirs'); api.sfx(d.pi === 0 ? 'bell' : 'select', .4); await wait(1050); } break; }
    }
  }
  const ATK_SFX = { buyu: 'sword-1', chiryaku: 'magic-missile-2', seiji: 'magic-holy-1', kagaku: 'lightning', shiso: 'magic-dark', tanken: 'water-blast', gekokujo: 'magic-dark-big', geijutsu: 'magic-faeriefire' };
  function slam(uid) { const el = slotEl(uid); if (el) el.animate([{ transform: 'translateY(-60px) scale(1.25)', opacity: .2 }, { transform: 'translateY(0) scale(.94)', opacity: 1, offset: .7 }, { transform: 'none' }], { duration: dur(320), easing: 'cubic-bezier(.5,0,.6,1)' }); shake(.5); }
  function callout(x, y, text, cls) { floater(x, y, `<b>${text}</b>`, 'callout ' + cls, 1100); }
  function banner(text, cls) { const el = document.createElement('div'); el.className = 'tbanner ' + (cls || ''); el.innerHTML = `<i></i><b>${text}</b>`; $('#fxl').appendChild(el); el.style.setProperty('--d', dur(1100) + 'ms'); setTimeout(() => el.remove(), dur(1150)); }
  function attackBand(name, type, pi) { const el = document.createElement('div'); el.className = 'aband ' + (pi === 0 ? 'me' : 'opp'); el.style.setProperty('--tc', TCOL[type]); el.style.setProperty('--d', dur(1200) + 'ms'); el.innerHTML = `<span class="t">${TYPE_JA[type]}</span><b>${esc(name)}</b>`; $('#fxl').appendChild(el); setTimeout(() => el.remove(), dur(1250)); }
  async function orb(from, to, color) {
    const el = document.createElement('div'); el.className = 'orb'; el.style.setProperty('--c', color); $('#fxl').appendChild(el);
    const mx = (from.x + to.x) / 2 + (Math.random() - .5) * 200, my = Math.min(from.y, to.y) - 80;
    const a = el.animate([{ left: from.x + 'px', top: from.y + 'px', transform: 'scale(.6)' }, { left: mx + 'px', top: my + 'px', transform: 'scale(1.2)', offset: .5 }, { left: to.x + 'px', top: to.y + 'px', transform: 'scale(.8)' }], { duration: dur(420), easing: 'ease-in', fill: 'forwards' });
    const trail = setInterval(() => { const r = rectStage(el); B.fx.add({ kind: 'spark', x: r.x + r.w / 2, y: r.y + r.h / 2, size: 6, color, life: .35 }); }, 24);
    await a.finished.catch(() => {}); clearInterval(trail); el.remove();
  }
  async function coin(heads, label) {
    const el = document.createElement('div'); el.className = 'coin3d'; el.innerHTML = `<div class="cface ${heads ? 'h' : 't'}"><i class="f">表</i><i class="b">裏</i></div><div class="clabel">${esc(label || 'コイン')}</div>`; $('#fxl').appendChild(el);
    api.sfx('gold', .35);
    const spins = 5 + (heads ? 0 : .5);
    el.querySelector('.cface').animate([{ transform: 'translateY(0) rotateX(0)' }, { transform: `translateY(-160px) rotateX(${spins * 180}deg)`, offset: .5 }, { transform: `translateY(0) rotateX(${spins * 360}deg)` }], { duration: dur(900), easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
    await wait(950); el.classList.add('done'); el.querySelector('.clabel').textContent = heads ? '表！' : '裏…'; api.sfx(heads ? 'fanfare-short' : 'miss-1', .3);
    await wait(650); el.remove();
  }

  // ===================== flow =====================
  async function cpuLoop() {
    const g = B.g;
    while (B && g.winner == null && g.cur === 1) {
      B.ui.busy = true; render({ noFlip: true }); await wait(500);
      await window.HAI.playTurn(g, 1, B.level, async () => { await wait(260); });
    }
    if (B) { B.ui.busy = false; render({ noFlip: true }); }
  }
  function start(myDeck, cpuDeck, opts) {
    api = opts; const stage = api.stage;
    stage.innerHTML = `<div class="scr" id="battle"><div class="bbg"></div><div id="board"></div><canvas id="fxc" width="1600" height="900"></canvas><div id="fxl"></div><div class="vig"></div></div>`;
    B = { decks: [myDeck, cpuDeck], level: opts.level, speed: opts.speed || 1, ui: { busy: true }, log: false, fx: new FX($('#fxc')) };
    const cpuAsk = window.HAI.makeAsk(opts.level);
    const g = new Game([myDeck.cards, cpuDeck.cards], {
      names: ['あなた', 'CPU（' + cpuDeck.name + '）'],
      ask: (pi, req) => pi === 1 ? cpuAsk(g, pi, req) : humanAsk(req),
      onEvent: (t, d) => { if (t === 'gameOver') setTimeout(() => over(d.winner), dur(900)); if (t === 'log' && B && B.log) {} },
      fx: (t, d) => fx(t, d),
    });
    B.g = g; render({ noFlip: true });
    (async () => {
      await g.setup(); render(); banner(g.cur === 0 ? 'あなたの先攻' : '相手の先攻', g.cur === 0 ? 'mine' : 'theirs'); await wait(1200);
      await g.startTurn(); B.ui.busy = false; render({ noFlip: true }); await cpuLoop();
    })();
  }
  function over(w) {
    if (!B || B.over) return; B.over = true;
    const r = api.onEnd(w === 0);
    B.ui.modal = `<div class="over"><div class="panel"><div class="res logo" style="filter:${w === 0 ? '' : 'grayscale(1)'}">${w === 0 ? 'VICTORY' : 'DEFEAT'}</div><div style="font-size:22px;font-weight:800">${r.text}</div>
      <div style="display:flex;gap:16px"><button class="btn" id="again">もう一度</button><button class="btn dark" id="tohome">ホームへ</button></div></div></div>`;
    render({ noFlip: true });
    if (w === 0) { for (let i = 0; i < 6; i++) setTimeout(() => B && B.fx.burst(300 + Math.random() * 1000, 200 + Math.random() * 300, ['#ffd27a', '#fff', '#ff9ad5', '#9fd8ff'][i % 4], 40, { g: 300 }), i * 220); }
    $('#again').onclick = () => { const d = B.decks; B.dead = true; B = null; api.again(d); };
    $('#tohome').onclick = () => { B.dead = true; B = null; api.home(); };
  }
  window.HBATTLE = { start };
})();
