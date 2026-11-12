(() => {
  'use strict';

  /* =====================================================================
     Utilities
     ===================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (typeof attrs === 'string') node.className = attrs;
    else if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  }
  const mix = (a, b, p) => a + (b - a) * p;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const narrow = matchMedia('(max-width: 859px)');
  const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
    del(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } },
  };
  const hueOf = (id) => {
    let n = 0;
    for (const ch of String(id)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    return 204 + (n % 22); // stay inside the blue family
  };
  const timeOf = (ts) => new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  function shortTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return timeOf(ts);
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return '昨日';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  const initial = (name) => [...(name || '?')][0];
  const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /* =====================================================================
     Spring engine — interruptible springs that keep their velocity
     ===================================================================== */
  const running = new Set();
  let rafId = 0;
  let lastTime = 0;
  class Spring {
    constructor(value, onUpdate, cfg = {}) {
      this.x = value;
      this.v = 0;
      this.target = value;
      this.k = cfg.stiffness ?? 300;
      this.c = cfg.damping ?? 22;
      this.eps = cfg.precision ?? 0.01;
      this.onUpdate = onUpdate;
      this.onRest = null;
    }
    to(target, cfg) {
      if (cfg) {
        if (cfg.stiffness != null) this.k = cfg.stiffness;
        if (cfg.damping != null) this.c = cfg.damping;
      }
      this.target = target;
      if (reducedMotion.matches) {
        this.x = target;
        this.v = 0;
        this.onUpdate(this.x, 0);
        this.rest();
        return this;
      }
      running.add(this);
      if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(frame);
      }
      return this;
    }
    jump(value) {
      running.delete(this);
      this.x = value;
      this.v = 0;
      this.onUpdate(value, 0);
      return this;
    }
    stop() { running.delete(this); }
    rest() {
      running.delete(this);
      const done = this.onRest;
      this.onRest = null;
      if (done) done();
    }
  }
  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.064);
    lastTime = now;
    const steps = Math.max(1, Math.ceil(dt * 120));
    const step = dt / steps;
    for (const s of running) {
      for (let i = 0; i < steps; i++) {
        s.v += (-s.k * (s.x - s.target) - s.c * s.v) * step;
        s.x += s.v * step;
      }
      if (Math.abs(s.v) < s.eps * 10 && Math.abs(s.x - s.target) < s.eps) {
        s.x = s.target;
        s.v = 0;
        s.onUpdate(s.x, 0);
        s.rest();
      } else s.onUpdate(s.x, s.v);
    }
    rafId = running.size ? requestAnimationFrame(frame) : 0;
  }
  function play(cfg, render, done) {
    const s = new Spring(0, render, { precision: 0.001, ...cfg });
    s.onRest = done || null;
    render(0, 0);
    return s.to(1);
  }
  function popIn(node, cfg = { stiffness: 420, damping: 15 }, from = 0) {
    play(cfg, (p) => { node.style.transform = `scale(${mix(from, 1, p).toFixed(4)})`; }, () => { node.style.transform = ''; });
  }
  function shake(node) {
    const s = new Spring(0, (x) => { node.style.translate = x ? `${x.toFixed(2)}px 0` : ''; }, { stiffness: 900, damping: 11, precision: 0.05 });
    s.v = 900;
    s.to(0);
    navigator.vibrate?.([12, 40, 12]);
  }

  const pressSprings = new WeakMap();
  function pressSpring(node) {
    let s = pressSprings.get(node);
    if (!s) {
      s = new Spring(1, (v) => node.style.setProperty('--press', v.toFixed(4)), { precision: 0.001 });
      pressSprings.set(node, s);
    }
    return s;
  }
  let pressed = null;
  document.addEventListener('pointerdown', (e) => {
    const node = e.target.closest?.('[data-press]');
    if (!node) return;
    pressed = node;
    pressSpring(node).to(node.matches('.room-item, .person, .result') ? 0.96 : 0.9, { stiffness: 700, damping: 34 });
  });
  const release = () => {
    if (!pressed) return;
    pressSpring(pressed).to(1, { stiffness: 420, damping: 11 });
    pressed = null;
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  document.addEventListener('scroll', release, true);

  /* =====================================================================
     State & elements
     ===================================================================== */
  const shell = $('#shell');
  const chatPane = $('.chat');
  const roomView = $('#room');
  const scroller = $('#scroller');
  const list = $('#list');
  const input = $('#input');
  const sendBtn = $('#send');
  const toBottom = $('#toBottom');
  const unreadBadge = $('#unread');
  const popover = $('#popover');
  const typingEl = $('#typing');
  const replyBar = $('#replyBar');
  const mineList = $('#mineList');
  const exploreList = $('#exploreList');
  const mentionBox = $('#mentionBox');
  const loadMore = $('#loadMore');

  let uid = store.get('lq.uid');
  if (!uid || uid.length < 16) {
    uid = randomId();
    store.set('lq.uid', uid);
  }

  const state = {
    ws: null,
    connected: false,
    ready: false,
    retry: 0,
    retryTimer: 0,
    name: store.get('lq.name') || '',
    me: null,
    blocks: [],
    vapid: null,
    ice: [],
    reactions: ['💙'],
    rooms: new Map(), // id -> { s, messages, more, online, reads, members, call }
    explore: [],
    tab: 'mine',
    activeId: null,
    pushedRoom: false,
    drafts: new Map(),
    link: null,
    joinThenOpen: null,
    joinPass: null,
    entries: new Map(),
    pending: new Map(),
    reply: null,
    editing: null,
    unread: 0,
    typers: new Map(),
    loadingOlder: false,
  };
  const activeRoom = () => state.rooms.get(state.activeId);

  function avatar(user) {
    const node = h('span', 'avatar', initial(user.name));
    node.style.setProperty('--h', hueOf(user.id));
    node.title = user.name;
    return node;
  }
  function roomAvatar(s) {
    const node = h('span', `room-ava${s.kind === 'dm' ? ' dm' : ''}`, initial(s.name));
    node.style.setProperty('--h', hueOf(s.kind === 'dm' ? s.peer : s.id));
    return node;
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function wsSend(payload) {
    if (!state.connected) return false;
    state.ws.send(JSON.stringify(payload));
    return true;
  }

  const ICONS = {
    lock: '<svg viewBox="0 0 24 24" width="13" height="13"><rect x="5" y="11" width="14" height="10" rx="3" fill="currentColor"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
    globe: '<svg viewBox="0 0 24 24" width="13" height="13"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    mute: '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M6 9a6 6 0 0110.5-4M18 10c0 4.5 2 5.5 2 5.5H8M10 19a2 2 0 004 0M4 4l16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    people: '<svg viewBox="0 0 24 24" width="13" height="13"><circle cx="9" cy="8" r="3.5" fill="currentColor"/><path d="M2.5 20c.5-4 3.2-6 6.5-6s6 2 6.5 6z" fill="currentColor"/><circle cx="17" cy="9" r="2.6" fill="currentColor" opacity=".6"/><path d="M16 14.2c3 .2 5 2 5.5 5.8h-4" fill="currentColor" opacity=".6"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    reply: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 8L5 13l5 5M5 13h9a5 5 0 005-5V6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    smile: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5v.5M15 9.5v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="8" y="8" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bubble: '<svg viewBox="0 0 32 32"><path fill="#fff" d="M16 4C8.8 4 3 9 3 15.2c0 3.4 1.8 6.5 4.6 8.5L6.5 28l5-2.3c1.4.4 2.9.6 4.5.6 7.2 0 13-5 13-11.1S23.2 4 16 4z"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5M5 12v6.5A2.5 2.5 0 007.5 21h9a2.5 2.5 0 002.5-2.5V12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M6.6 3.5l2.6.4 1.3 4-1.9 1.6a12 12 0 005.9 5.9l1.6-1.9 4 1.3.4 2.6c-.2 1.7-1.6 3-3.3 3A15.6 15.6 0 013.5 6.8c0-1.7 1.3-3.1 3.1-3.3z" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5.5v13l10-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="7" y="5" width="3.5" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="3.5" height="14" rx="1.2" fill="currentColor"/></svg>',
  };

  /* =====================================================================
     Theme (system / light / dark) with a circular reveal
     ===================================================================== */
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  function themePref() { return store.get('lq.theme') || 'system'; }
  function applyTheme(pref, origin) {
    store.set('lq.theme', pref);
    const dark = pref === 'dark' || (pref === 'system' && darkMq.matches);
    const next = dark ? 'dark' : 'light';
    if (document.documentElement.dataset.theme === next) return;
    const swap = () => {
      document.documentElement.dataset.theme = next;
      $('meta[name="theme-color"]').content = dark ? '#0a1222' : '#ffffff';
    };
    if (!document.startViewTransition || reducedMotion.matches || !origin) return swap();
    const t = document.startViewTransition(swap);
    t.ready.then(() => {
      const r = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${r}px at ${origin.x}px ${origin.y}px)`] },
        { duration: 560, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {});
  }
  darkMq.addEventListener('change', () => { if (themePref() === 'system') applyTheme('system'); });
  $('meta[name="theme-color"]').content = document.documentElement.dataset.theme === 'dark' ? '#0a1222' : '#ffffff';

  /* =====================================================================
     Mobile navigation — chat slides over the list; drag back from the edge
     ===================================================================== */
  const nav = new Spring(0, (v) => shell.style.setProperty('--nav', v.toFixed(4)), { stiffness: 360, damping: 34, precision: 0.001 });
  function showChatPane() {
    shell.classList.add('in-room');
    nav.onRest = null;
    nav.to(1, { stiffness: 360, damping: 32 });
  }
  function showListPane() {
    nav.onRest = () => { if (nav.target === 0) shell.classList.remove('in-room'); };
    nav.to(0, { stiffness: 360, damping: 34 });
  }
  let edge = null;
  chatPane.addEventListener('pointerdown', (e) => {
    if (!narrow.matches || e.pointerType === 'mouse' || e.clientX > 26 || !state.activeId) return;
    edge = { id: e.pointerId, x: e.clientX, t: performance.now(), vx: 0, dragging: false };
  });
  chatPane.addEventListener('pointermove', (e) => {
    if (!edge || e.pointerId !== edge.id) return;
    const dx = e.clientX - edge.x;
    if (!edge.dragging) {
      if (dx < 8) return;
      edge.dragging = true;
      try { chatPane.setPointerCapture(e.pointerId); } catch { /* gone */ }
      nav.stop();
      closePopover();
    }
    const now = performance.now();
    edge.vx = mix(edge.vx, (e.clientX - (edge.lastX ?? edge.x)) / Math.max(1, now - edge.t), 0.6);
    edge.lastX = e.clientX;
    edge.t = now;
    nav.x = clamp(1 - Math.max(0, dx) / chatPane.clientWidth, 0, 1);
    nav.onUpdate(nav.x);
  });
  function endEdge(e) {
    if (!edge || e.pointerId !== edge.id) return;
    const g = edge;
    edge = null;
    if (!g.dragging) return;
    nav.v = (-g.vx * 1000) / chatPane.clientWidth;
    if (1 - nav.x > 0.38 || g.vx > 0.45) leaveRoomView();
    else nav.to(1);
  }
  chatPane.addEventListener('pointerup', endEdge);
  chatPane.addEventListener('pointercancel', endEdge);
  addEventListener('popstate', () => {
    const id = history.state?.room;
    if (id && state.rooms.has(id)) openRoom(id, { fromHistory: true });
    else if (state.activeId) closeRoom();
  });
  function leaveRoomView() {
    if (state.pushedRoom && history.state?.room) history.back();
    else closeRoom();
  }
  $('#back').addEventListener('click', leaveRoomView);

  /* =====================================================================
     Sidebar
     ===================================================================== */
  const segPill = $('.seg-pill');
  const segSpring = new Spring(0, (x, v) => {
    segPill.style.setProperty('--seg', x.toFixed(4));
    segPill.style.setProperty('--seg-stretch', (1 + Math.min(Math.abs(v || 0) * 0.025, 0.18)).toFixed(4));
  }, { stiffness: 420, damping: 30, precision: 0.001 });

  function setTab(tab) {
    if (state.tab === tab) return;
    state.tab = tab;
    for (const b of document.querySelectorAll('.seg-btn')) b.classList.toggle('on', b.dataset.tab === tab);
    segSpring.to(tab === 'explore' ? 1 : 0);
    const exploring = tab === 'explore';
    mineList.hidden = exploring;
    exploreList.hidden = !exploring;
    $('#mineEmpty').hidden = exploring || state.rooms.size > 0 || !state.ready;
    $('#exploreEmpty').hidden = !exploring || state.explore.length > 0;
    wsSend({ type: 'explore', on: exploring });
    const shown = exploring ? exploreList : mineList;
    [...shown.children].slice(0, 10).forEach((item, i) => {
      item.style.opacity = '0';
      setTimeout(() => play({ stiffness: 380, damping: 24 }, (p) => {
        item.style.transform = `translateX(${mix(exploring ? 24 : -24, 0, p).toFixed(2)}px)`;
        item.style.opacity = clamp(p * 1.6, 0, 1).toFixed(3);
      }, () => { item.style.transform = ''; item.style.opacity = ''; }), i * 22);
    });
  }
  for (const b of document.querySelectorAll('.seg-btn')) b.addEventListener('click', () => setTab(b.dataset.tab));

  const itemNodes = new Map();
  const flipSprings = new WeakMap();
  function flags(s) {
    const box = h('span', 'flags');
    if (s.locked) box.append(h('span', { html: ICONS.lock, title: '合言葉つき' }));
    if (s.isPublic) box.append(h('span', { html: ICONS.globe, title: '公開ルーム' }));
    if (s.muted) box.append(h('span', { html: ICONS.mute, title: '通知オフ' }));
    return box;
  }
  function fillItem(node, s, mode) {
    const prevUnread = Number(node.dataset.unread || 0);
    node.className = `room-item${s.id === state.activeId ? ' active' : ''}${s.unread ? ' has-unread' : ''}${s.muted ? ' muted' : ''}`;
    node.dataset.unread = s.unread;
    let preview;
    let right = null;
    if (mode === 'mine') {
      preview = s.last ? (s.kind === 'dm' ? s.last.text : `${s.last.name}: ${s.last.text}`) : 'まだメッセージはありません';
      if (s.call) right = h('span', { class: 'in-call', html: ICONS.phone, title: '通話中' });
      else if (s.unread) right = h('span', 'count', s.unread > 99 ? '99+' : String(s.unread));
    } else {
      preview = `メンバー ${s.members}人${s.online ? ` ・ ${s.online}人がオンライン` : ''}`;
      right = s.member ? null : h('span', 'join-tag', '参加');
    }
    const top = h('span', 'room-top', h('b', null, s.name), flags(s), h('time', null, shortTime(s.last?.ts)));
    node.replaceChildren(roomAvatar(s), h('span', 'room-main', top, h('span', 'room-sub', h('span', null, preview), right)));
    if (right?.classList.contains('count') && s.unread !== prevUnread) popIn(right, { stiffness: 480, damping: 13 }, prevUnread ? 1.4 : 0);
  }
  function renderList(container, items, mode) {
    const before = new Map();
    for (const child of container.children) before.set(child, child.getBoundingClientRect().top);
    const keep = new Set();
    const fresh = [];
    for (const s of items) {
      const key = `${mode}:${s.id}`;
      let node = itemNodes.get(key);
      if (!node) {
        node = h('button', { type: 'button', 'data-press': true, role: 'listitem' });
        node.dataset.id = s.id;
        itemNodes.set(key, node);
        fresh.push(node);
      }
      fillItem(node, s, mode);
      keep.add(node);
      container.append(node);
    }
    for (const child of [...container.children]) {
      if (!keep.has(child)) {
        itemNodes.delete(`${mode}:${child.dataset.id}`);
        child.remove();
      }
    }
    if (container.hidden) return;
    for (const node of keep) {
      if (!before.has(node)) continue;
      const delta = before.get(node) - node.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      let s = flipSprings.get(node);
      if (!s) {
        s = new Spring(0, (y) => { node.style.translate = y ? `0 ${y.toFixed(2)}px` : ''; }, { stiffness: 340, damping: 28, precision: 0.2 });
        flipSprings.set(node, s);
      }
      s.jump(s.x + delta).to(0);
    }
    if (before.size) {
      for (const node of fresh) {
        play({ stiffness: 360, damping: 20 }, (p) => {
          node.style.transform = `scale(${mix(0.8, 1, p).toFixed(4)})`;
          node.style.opacity = clamp(p * 1.5, 0, 1).toFixed(3);
        }, () => { node.style.transform = ''; node.style.opacity = ''; });
      }
    }
  }
  const sortedMine = () => [...state.rooms.values()].map((r) => r.s).sort((a, b) => (b.last?.ts || b.lastTs) - (a.last?.ts || a.lastTs));
  function renderMine() {
    renderList(mineList, sortedMine(), 'mine');
    $('#mineEmpty').hidden = state.tab !== 'mine' || state.rooms.size > 0 || !state.ready;
    const total = [...state.rooms.values()].reduce((n, r) => n + (r.s.muted ? 0 : r.s.unread), 0);
    $('#mineBadge').textContent = total ? String(Math.min(total, 99)) : '';
    document.title = total ? `(${total}) Lynq` : activeRoom() ? `${activeRoom().s.name} · Lynq` : 'Lynq';
    if (navigator.setAppBadge) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {});
  }
  function renderExplore() {
    renderList(exploreList, state.explore, 'explore');
    $('#exploreEmpty').hidden = state.tab !== 'explore' || state.explore.length > 0;
  }
  mineList.addEventListener('click', (e) => {
    const item = e.target.closest('.room-item');
    if (item) openRoom(item.dataset.id);
  });
  exploreList.addEventListener('click', (e) => {
    const item = e.target.closest('.room-item');
    const s = item && state.explore.find((r) => r.id === item.dataset.id);
    if (!s) return;
    if (state.rooms.has(s.id)) openRoom(s.id);
    else if (s.locked) openJoinSheet(s);
    else {
      state.joinThenOpen = s.id;
      wsSend({ type: 'join', room: s.id });
    }
  });
  $('#emptyLobby').addEventListener('click', () => {
    state.joinThenOpen = 'lobby';
    wsSend({ type: 'join', room: 'lobby' });
  });

  /* =====================================================================
     Opening rooms
     ===================================================================== */
  function openRoom(id, { fromHistory = false } = {}) {
    const room = state.rooms.get(id);
    if (!room) return;
    const switching = state.activeId !== id;
    if (switching && state.activeId) state.drafts.set(state.activeId, input.value);
    closePopover();
    closeTray();
    if (recorder) cancelRecording();
    state.activeId = id;
    $('#emptyPane').hidden = true;
    roomView.hidden = false;
    if (switching) {
      input.value = state.drafts.get(id) || '';
      autosize();
      updateSend();
      setReply(null);
      setEditing(null);
      renderHeader();
      renderTyping();
      renderMessages(room.messages || [], { stagger: true });
      wsSend({ type: 'open', room: id });
      if (room.s.kind === 'group') wsSend({ type: 'members', room: id });
      if (!narrow.matches) {
        play({ stiffness: 340, damping: 26 }, (p) => {
          roomView.style.transform = `translateY(${mix(14, 0, p).toFixed(2)}px)`;
          roomView.style.opacity = clamp(p * 1.4, 0, 1).toFixed(3);
        }, () => { roomView.style.transform = ''; roomView.style.opacity = ''; });
      }
    }
    sendFocus();
    renderMine();
    const url = `/?r=${encodeURIComponent(id)}`;
    if (narrow.matches) {
      if (!fromHistory) {
        if (history.state?.room) history.replaceState({ room: id }, '', url);
        else history.pushState({ room: id }, '', url);
        state.pushedRoom = true;
      }
      showChatPane();
    } else history.replaceState({ room: id }, '', url);
    if (!coarse.matches) input.focus({ preventScroll: true });
  }
  function closeRoom() {
    if (state.activeId) state.drafts.set(state.activeId, input.value);
    closePopover();
    closeTray();
    if (recorder) cancelRecording();
    state.activeId = null;
    state.pushedRoom = false;
    sendFocus();
    if (history.state?.room) history.replaceState(null, '', '/');
    renderMine();
    if (narrow.matches) showListPane();
    else {
      roomView.hidden = true;
      $('#emptyPane').hidden = false;
    }
  }
  function sendFocus() {
    wsSend({ type: 'focus', room: state.activeId, visible: document.visibilityState === 'visible' });
  }

  function renderHeader() {
    const room = activeRoom();
    if (!room) return;
    $('#roomName').textContent = room.s.name;
    const f = flags(room.s);
    f.id = 'roomFlags';
    $('#roomFlags').replaceWith(f);
    renderPresence();
    renderCallBanner();
  }
  function renderPresence() {
    const room = activeRoom();
    if (!room) return;
    const box = $('#avatars');
    const known = new Set([...box.children].map((n) => n.dataset.id));
    box.replaceChildren();
    const online = room.online || [];
    if (room.s.kind === 'group') {
      online.slice(0, 4).forEach((m) => {
        const node = avatar(m);
        node.dataset.id = m.id;
        box.append(node);
        if (!known.has(m.id)) popIn(node);
      });
      if (online.length > 4) box.append(h('span', 'avatar more', `+${online.length - 4}`));
    }
    if (!state.connected) return setStatus('再接続中…', false);
    if (room.s.kind === 'dm') {
      const on = online.some((u) => u.id === room.s.peer);
      setStatus(state.blocks.includes(room.s.peer) ? 'ブロック中' : on ? 'オンライン' : 'オフライン', on);
    } else setStatus(`${online.length}人がオンライン ・ メンバー${room.s.members}人`, true);
  }
  function setStatus(text, on) {
    $('#statusText').textContent = text;
    $('#status').classList.toggle('on', on);
  }

  /* ---------- read state ---------- */
  let readTimer = 0;
  function markRead() {
    clearTimeout(readTimer);
    readTimer = setTimeout(() => {
      const room = activeRoom();
      if (!room || document.visibilityState !== 'visible' || !nearBottom()) return;
      const msgs = room.messages || [];
      const lastTs = msgs.length ? msgs[msgs.length - 1].ts : 0;
      if (!lastTs) return;
      if (room.s.unread || lastTs > (room.readTs || 0)) {
        room.readTs = lastTs;
        room.s.unread = 0;
        if (state.me) room.reads[state.me.id] = lastTs;
        wsSend({ type: 'read', room: room.s.id, ts: lastTs });
        renderMine();
      }
    }, 250);
  }
  document.addEventListener('visibilitychange', () => {
    sendFocus();
    if (document.visibilityState === 'visible') {
      markRead();
      wake();
    }
  });

  /* =====================================================================
     Scrolling
     ===================================================================== */
  const listShift = new Spring(0, (v) => { list.style.translate = v ? `0 ${v.toFixed(2)}px` : ''; }, { stiffness: 340, damping: 30, precision: 0.1 });
  const distanceFromBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight - Math.max(0, listShift.x);
  const nearBottom = () => distanceFromBottom() < 90;
  function setUnread(n) {
    state.unread = n;
    unreadBadge.textContent = n ? String(Math.min(n, 99)) : '';
  }
  function updateToBottom() {
    const away = distanceFromBottom() > 240;
    toBottom.classList.toggle('show', away || state.unread > 0 || !!activeRoom()?.jumped);
    if (state.unread && nearBottom()) setUnread(0);
  }
  let wasNearBottom = true;
  scroller.addEventListener('scroll', () => {
    updateToBottom();
    closePopover();
    wasNearBottom = nearBottom();
    if (wasNearBottom) markRead();
    if (scroller.scrollTop < 300) requestOlder();
  }, { passive: true });
  addEventListener('resize', () => { if (wasNearBottom) scroller.scrollTop = scroller.scrollHeight; });
  const scrollSpring = new Spring(0, (v) => { scroller.scrollTop = v; }, { stiffness: 220, damping: 28, precision: 0.5 });
  toBottom.addEventListener('click', () => {
    setUnread(0);
    const room = activeRoom();
    if (room?.jumped) {
      room.jumped = false;
      wsSend({ type: 'open', room: room.s.id });
      return;
    }
    scrollSpring.x = scroller.scrollTop;
    scrollSpring.v = 0;
    scrollSpring.to(scroller.scrollHeight - scroller.clientHeight);
  });
  for (const type of ['wheel', 'touchstart']) scroller.addEventListener(type, () => scrollSpring.stop(), { passive: true });

  function requestOlder() {
    const room = activeRoom();
    if (!room || !room.more || state.loadingOlder || !room.messages?.length) return;
    state.loadingOlder = true;
    loadMore.hidden = false;
    wsSend({ type: 'older', room: room.s.id, before: room.messages[0].id });
  }

  /* =====================================================================
     Messages
     ===================================================================== */
  const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
  const MENTION_SPLIT = /(@[^\s@]{1,20})/g;
  function fillText(node, text) {
    const myName = state.me ? `@${state.me.name}` : null;
    for (const part of text.split(URL_RE)) {
      if (!part) continue;
      if (/^https?:\/\//.test(part)) {
        node.append(h('a', { href: part, target: '_blank', rel: 'noopener noreferrer' }, part));
        continue;
      }
      for (const bit of part.split(MENTION_SPLIT)) {
        if (!bit) continue;
        if (/^@[^\s@]{1,20}$/.test(bit)) node.append(h('span', `mention${bit === myName ? ' to-me' : ''}`, bit));
        else node.append(bit);
      }
    }
  }
  const blocked = (m) => !m.sys && state.blocks.includes(m.from.id);
  const isMine = (m) => !m.sys && state.me && m.from.id === state.me.id;

  function receiptText(m) {
    const room = activeRoom();
    if (!room || !isMine(m) || m.cid || m.deleted) return '';
    let n = 0;
    for (const [id, ts] of Object.entries(room.reads || {})) if (id !== state.me.id && ts >= m.ts) n++;
    if (!n) return '';
    return room.s.kind === 'dm' ? '既読' : `既読 ${n}`;
  }
  const mediaUrl = (m) => m.localUrl || `/media/${m.media.id}`;
  function quoteEl(r) {
    const q = h('span', 'quote', h('b', null, r.name), r.text);
    q.dataset.target = r.id;
    return q;
  }
  function buildBody(m) {
    if (m.deleted) return h('div', 'bubble deleted', m.deleted === 'admin' ? '管理者がメッセージを削除しました' : 'メッセージの送信を取り消しました');
    if (m.sticker && window.LynqStickers) {
      return h('div', { class: 'sticker-msg', html: LynqStickers.svg(m.sticker), role: 'img', 'aria-label': LynqStickers.label(m.sticker) });
    }
    if (m.media?.kind === 'image') {
      const b = h('div', 'bubble photo');
      if (m.replyTo) b.append(quoteEl(m.replyTo));
      const w = m.media.w || 4;
      const hgt = m.media.h || 3;
      b.style.setProperty('--ar', `${w} / ${hgt}`);
      b.style.setProperty('--w', `${Math.round(260 * Math.max(0.6, Math.min(1, w / hgt)))}px`);
      const img = h('img', { alt: '写真', decoding: 'async' });
      img.addEventListener('load', () => img.classList.add('loaded'));
      img.addEventListener('error', () => img.replaceWith(h('div', 'gone', '画像は保存期間を過ぎました')));
      img.src = mediaUrl(m);
      b.append(img);
      if (m.uploading) b.append(h('span', 'progress', h('i')));
      if (m.text) {
        const cap = h('span', 'caption');
        fillText(cap, m.text);
        b.append(cap);
      }
      return b;
    }
    if (m.media?.kind === 'audio') {
      const b = h('div', 'bubble voice');
      const bars = h('div', 'voice-bars');
      const peaks = m.media.peaks?.length ? m.media.peaks : Array.from({ length: 32 }, () => 30);
      for (const v of peaks) {
        const i = h('i');
        i.style.setProperty('--v', (v / 100).toFixed(2));
        bars.append(i);
      }
      b.append(h('button', { class: 'voice-play', type: 'button', 'aria-label': '再生', html: ICONS.play, 'data-press': true }), bars, h('span', 'voice-time', fmtDur(m.media.dur || 0)));
      return b;
    }
    const b = h('div', 'bubble');
    if (m.replyTo) b.append(quoteEl(m.replyTo));
    fillText(b, m.text);
    return b;
  }
  function buildRow(m, prev) {
    if (m.sys) return h('div', { class: `sys${m.call ? ' call-note' : ''}`, html: m.call ? ICONS.phone : null }, m.text);
    const mine = isMine(m);
    const cont = prev && !prev.sys && !blocked(prev) && prev.from.id === m.from.id && m.ts - prev.ts < 180000;
    const row = h('div', `msg ${mine ? 'me' : 'them'}${cont ? ' cont' : ''}`);
    if (m.id && !m.cid) row.dataset.id = m.id;
    const meta = h('div', 'side-meta');
    if (!m.deleted) {
      const acts = h('div', 'acts');
      for (const [action, icon, label] of [['react', ICONS.smile, 'リアクション'], ['reply', ICONS.reply.replace(/18/g, '16'), '返信']]) {
        acts.append(h('button', { class: 'act', type: 'button', 'data-action': action, 'aria-label': label, html: icon }));
      }
      meta.append(acts);
    }
    meta.append(h('span', 'receipt', receiptText(m)), h('span', 'edited', m.edited ? '編集済み' : ''), h('time', null, timeOf(m.ts)));
    const col = h('div', 'col', h('span', 'name', m.from.name), h('div', 'line', buildBody(m), meta));
    if (m.preview && !m.deleted) {
      const p = m.preview;
      col.append(h('a', { class: 'link-card', href: p.url, target: '_blank', rel: 'noopener noreferrer' },
        p.image ? h('img', { src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null,
        h('div', null, h('small', null, p.site), h('b', null, p.title), p.desc ? h('span', null, p.desc) : null)));
    }
    col.append(h('div', 'reacts'));
    row.append(avatar(m.from), col, h('span', { class: 'swipe-hint', html: ICONS.reply.replace(/18/g, '16') }));
    return row;
  }
  function enter(row, mine, delay = 0) {
    const fromY = mine ? 46 : 16;
    const start = () => play({ stiffness: mine ? 360 : 320, damping: mine ? 19 : 21 }, (p) => {
      row.style.transform = `translateY(${mix(fromY, 0, p).toFixed(2)}px) scale(${mix(0.55, 1, p).toFixed(4)})`;
      row.style.opacity = clamp(p * 1.8, 0, 1).toFixed(3);
    }, () => { row.style.transform = ''; row.style.opacity = ''; });
    if (delay) {
      row.style.opacity = '0';
      setTimeout(start, delay);
    } else start();
    const st = row.querySelector('.sticker-msg');
    if (st) replaySticker(st, delay + 80);
  }
  function replaySticker(st, delay = 0) {
    st.classList.remove('play');
    setTimeout(() => {
      void st.offsetWidth;
      st.classList.add('play');
    }, delay);
  }

  let lastRendered = null;
  function renderMessages(messages, { stagger = false, keepBottom = false, jump = null } = {}) {
    const offset = scroller.scrollHeight - scroller.scrollTop;
    state.entries.clear();
    lastRendered = null;
    list.replaceChildren();
    for (const m of messages) appendRow(m);
    for (const entry of state.pending.values()) {
      if (entry.room === state.activeId) {
        list.append(entry.row);
        lastRendered = entry.data;
      }
    }
    listShift.jump(0);
    loadMore.hidden = true;
    if (keepBottom) scroller.scrollTop = scroller.scrollHeight - offset;
    else scroller.scrollTop = scroller.scrollHeight;
    if (!keepBottom) setUnread(0);
    wasNearBottom = nearBottom();
    updateToBottom();
    if (jump) {
      const target = state.entries.get(jump);
      if (target) {
        target.row.scrollIntoView({ block: 'center' });
        flash(target.row);
      }
    } else if (stagger) {
      [...list.children].slice(-8).forEach((row, i) => enter(row, row.classList.contains('me'), 30 + i * 32));
    }
    if (!keepBottom) markRead();
  }
  function appendRow(m, { pending = false } = {}) {
    if (blocked(m)) return null;
    const row = buildRow(m, lastRendered);
    const entry = { data: m, row, counts: {}, room: state.activeId };
    if (!m.sys) {
      if (pending) {
        row.classList.add('pending');
        state.pending.set(m.cid, entry);
      } else state.entries.set(m.id, entry);
    }
    lastRendered = m;
    list.append(row);
    if (!m.sys) renderReacts(entry, false);
    return entry;
  }
  function addLive(m, opts = {}) {
    const mine = isMine(m);
    const stick = mine || nearBottom();
    const entry = appendRow(m, opts);
    if (!entry) return null;
    const { row } = entry;
    if (stick) {
      const grew = row.offsetHeight + parseFloat(getComputedStyle(row).marginTop);
      scrollSpring.stop();
      scroller.scrollTop = scroller.scrollHeight;
      listShift.jump(listShift.x + grew).to(0);
      if (m.sys) {
        play({ stiffness: 300, damping: 20 }, (p) => {
          row.style.transform = `scale(${mix(0.7, 1, p).toFixed(4)})`;
          row.style.opacity = clamp(p * 1.5, 0, 1).toFixed(3);
        }, () => { row.style.transform = ''; row.style.opacity = ''; });
      } else enter(row, mine);
    } else if (!m.sys) {
      setUnread(state.unread + 1);
      updateToBottom();
    }
    return entry;
  }
  function replaceRow(entry, data) {
    const msgs = activeRoom()?.messages || [];
    const idx = msgs.findIndex((x) => x.id === data.id);
    const row = buildRow(data, idx > 0 ? msgs[idx - 1] : null);
    if (entry.row.classList.contains('pending')) row.classList.add('pending');
    entry.row.replaceWith(row);
    entry.row = row;
    entry.data = data;
    entry.counts = {};
    renderReacts(entry, false);
    play({ stiffness: 420, damping: 22 }, (p) => { row.style.transform = `scale(${mix(0.96, 1, p).toFixed(4)})`; }, () => { row.style.transform = ''; });
  }
  function flash(row) {
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
  }
  function renderReacts(entry, animate = true) {
    const box = $('.reacts', entry.row);
    if (!box) return;
    const reactions = entry.data.reactions || {};
    const before = entry.counts;
    const counts = {};
    box.replaceChildren();
    for (const emoji of state.reactions) {
      const users = reactions[emoji];
      if (!users || !users.length) continue;
      counts[emoji] = users.length;
      const chip = h('button', { class: `chip${users.includes(state.me.id) ? ' mine' : ''}`, type: 'button', 'data-emoji': emoji, 'data-press': true }, emoji, h('span', null, String(users.length)));
      box.append(chip);
      if (animate && before[emoji] !== users.length) popIn(chip, { stiffness: 420, damping: 14 }, before[emoji] ? 1.35 : 0);
    }
    entry.counts = counts;
  }
  function updateReceipts() {
    for (const entry of state.entries.values()) {
      if (!isMine(entry.data)) continue;
      const el = $('.receipt', entry.row);
      const t = receiptText(entry.data);
      if (el && el.textContent !== t) {
        el.textContent = t;
        if (t) popIn(el, { stiffness: 500, damping: 18 }, 0.6);
      }
    }
  }
  function react(id, emoji, burstOn) {
    if (!wsSend({ type: 'react', room: state.activeId, id, emoji })) return toast('接続が切れています');
    if (burstOn) {
      const burst = h('span', 'burst', emoji);
      burstOn.append(burst);
      burst.addEventListener('animationend', () => burst.remove());
      navigator.vibrate?.(8);
    }
  }

  /* ---------- reply / edit bar ---------- */
  function previewOf(m) {
    if (m.sticker) return 'スタンプ';
    if (m.media?.kind === 'image') return m.text || '📷 写真';
    if (m.media?.kind === 'audio') return '🎤 音声メッセージ';
    return m.text;
  }
  function setReply(entry) {
    if (entry) setEditing(null, true);
    state.reply = entry ? { id: entry.data.id, name: entry.data.from.name, text: previewOf(entry.data) } : null;
    if (entry) {
      $('#replyName').textContent = entry.data.from.name;
      $('#replyText').textContent = previewOf(entry.data);
      input.focus({ preventScroll: true });
    }
    replyBar.classList.toggle('show', !!entry);
  }
  function setEditing(entry, silent) {
    if (!entry && !state.editing) return;
    if (entry) {
      state.reply = null;
      state.editing = entry;
      $('#replyName').textContent = 'メッセージを編集';
      $('#replyText').textContent = entry.data.text;
      input.value = entry.data.text;
      autosize();
      updateSend();
      input.focus();
      replyBar.classList.add('show');
    } else {
      state.editing = null;
      if (!silent) {
        input.value = '';
        autosize();
        updateSend();
        replyBar.classList.remove('show');
      }
    }
  }
  $('#replyCancel').addEventListener('click', () => {
    if (state.editing) setEditing(null);
    else setReply(null);
  });

  /* ---------- popover: reactions + actions ---------- */
  let popoverFor = null;
  function closePopover() {
    if (!popoverFor) return;
    popoverFor.row.classList.remove('active');
    popoverFor = null;
    popover.hidden = true;
  }
  function openPopover(entry) {
    closePopover();
    if (entry.data.deleted) return;
    popoverFor = entry;
    entry.row.classList.add('active');
    const m = entry.data;
    const room = activeRoom();
    const items = state.reactions.map((emoji) => h('button', { class: 'emo', type: 'button', 'data-emoji': emoji, 'data-press': true }, emoji));
    const act = (key, icon, label) => h('button', { class: 'act-btn', type: 'button', 'data-act': key, 'data-press': true, html: `${icon}<span>${label}</span>` });
    const actions = [act('reply', ICONS.reply, '返信')];
    if (m.text) actions.push(act('copy', ICONS.copy, 'コピー'));
    if (isMine(m) && m.text && !m.sticker) actions.push(act('edit', ICONS.edit, '編集'));
    if (isMine(m)) actions.push(act('unsend', ICONS.undo, '送信取消'));
    else if (room?.s.admin && room.s.kind === 'group') actions.push(act('unsend', ICONS.trash, '削除'));
    popover.replaceChildren(h('div', 'pop-row', items), h('div', 'pop-row', actions));
    popover.hidden = false;
    const anchor = $('.bubble, .sticker-msg', entry.row) || entry.row;
    const rect = anchor.getBoundingClientRect();
    const w = popover.offsetWidth;
    const ph = popover.offsetHeight;
    const mine = entry.row.classList.contains('me');
    const left = clamp(mine ? rect.right - w : rect.left, 8, innerWidth - w - 8);
    const above = rect.top - ph - 8 > 8;
    const top = above ? rect.top - ph - 8 : Math.min(rect.bottom + 8, innerHeight - ph - 8);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.transformOrigin = `${mine ? '100%' : '0%'} ${above ? '100%' : '0%'}`;
    play({ stiffness: 420, damping: 24 }, (p) => {
      popover.style.transform = `scale(${mix(0.6, 1, p).toFixed(4)})`;
      popover.style.opacity = clamp(p * 2, 0, 1).toFixed(3);
    });
    [...items, ...actions].forEach((btn, i) => {
      btn.style.transform = 'scale(0)';
      setTimeout(() => play({ stiffness: 460, damping: 15 }, (p) => { btn.style.transform = `scale(${p.toFixed(4)})`; }), 30 + i * 22);
    });
  }
  popover.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || !popoverFor) return;
    const entry = popoverFor;
    closePopover();
    if (btn.dataset.emoji) return react(entry.data.id, btn.dataset.emoji, $('.bubble, .sticker-msg', entry.row));
    const a = btn.dataset.act;
    if (a === 'reply') setReply(entry);
    else if (a === 'copy') {
      try {
        await navigator.clipboard.writeText(entry.data.text);
        toast('コピーしました');
      } catch { toast('コピーできませんでした'); }
    } else if (a === 'edit') setEditing(entry);
    else if (a === 'unsend') wsSend({ type: 'unsend', room: state.activeId, id: entry.data.id });
  });
  document.addEventListener('pointerdown', (e) => {
    if (popoverFor && !popover.contains(e.target) && !e.target.closest('.act')) closePopover();
  });

  /* ---------- list interactions ---------- */
  const entryOf = (node) => {
    const row = node.closest?.('.msg[data-id]');
    return row ? state.entries.get(row.dataset.id) : null;
  };
  list.addEventListener('click', (e) => {
    const quote = e.target.closest('.quote');
    if (quote) {
      const target = state.entries.get(quote.dataset.target);
      if (target) {
        target.row.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        flash(target.row);
      } else wsSend({ type: 'jump', room: state.activeId, id: quote.dataset.target });
      return;
    }
    const img = e.target.closest('.bubble.photo img');
    if (img) return openViewer(img);
    const playBtn = e.target.closest('.voice-play, .voice-bars');
    if (playBtn) return toggleVoice(playBtn.closest('.msg'), e);
    const st = e.target.closest('.sticker-msg');
    if (st && !coarse.matches) replaySticker(st);
    const entry = entryOf(e.target);
    if (!entry) return;
    const chip = e.target.closest('.chip');
    if (chip) return react(entry.data.id, chip.dataset.emoji);
    const act = e.target.closest('.act');
    if (!act) return;
    if (act.dataset.action === 'reply') setReply(entry);
    else if (popoverFor === entry) closePopover();
    else openPopover(entry);
  });
  list.addEventListener('dblclick', (e) => {
    const bubble = e.target.closest('.bubble, .sticker-msg');
    const entry = bubble && entryOf(bubble);
    if (!entry || coarse.matches || entry.data.deleted) return;
    getSelection()?.removeAllRanges();
    react(entry.data.id, state.reactions[0], bubble);
  });

  const SWIPE_AT = 58;
  const dragSprings = new WeakMap();
  let gesture = null;
  let lastTap = { id: null, time: 0 };
  function setDrag(row, x) {
    row.style.setProperty('--drag', `${x.toFixed(2)}px`);
    row.style.setProperty('--hint', clamp(x / SWIPE_AT, 0, 1).toFixed(3));
  }
  list.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.clientX < 28) return;
    const entry = entryOf(e.target);
    if (!entry) return;
    gesture = { entry, id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target, dragging: false, armed: false, moved: false, wasOpen: popoverFor === entry };
  });
  list.addEventListener('pointermove', (e) => {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;
    if (!g.dragging) {
      if (dx < 10 || Math.abs(dx) < Math.abs(dy) * 1.5 || g.entry.data.deleted) return;
      g.dragging = true;
      g.x = e.clientX;
      dragSprings.get(g.entry.row)?.stop();
      try { g.entry.row.setPointerCapture(g.id); } catch { /* pointer already gone */ }
      closePopover();
    }
    const raw = Math.max(0, e.clientX - g.x);
    const x = raw < SWIPE_AT + 12 ? raw : SWIPE_AT + 12 + (raw - SWIPE_AT - 12) * 0.22;
    const armed = raw >= SWIPE_AT;
    if (armed !== g.armed) {
      g.armed = armed;
      $('.swipe-hint', g.entry.row).classList.toggle('armed', armed);
      if (armed) navigator.vibrate?.(10);
    }
    g.offset = x;
    setDrag(g.entry.row, x);
  });
  function endGesture(e, cancelled) {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    gesture = null;
    const { row } = g.entry;
    if (g.dragging) {
      let s = dragSprings.get(row);
      if (!s) {
        s = new Spring(0, (v) => setDrag(row, Math.max(0, v)), { precision: 0.1 });
        dragSprings.set(row, s);
      }
      s.x = g.offset || 0;
      s.v = 0;
      s.onRest = () => {
        row.style.removeProperty('--drag');
        row.style.removeProperty('--hint');
        $('.swipe-hint', row).classList.remove('armed');
      };
      s.to(0, { stiffness: 380, damping: 20 });
      if (g.armed && !cancelled) setReply(g.entry);
      return;
    }
    if (cancelled || g.moved) return;
    const bubble = g.target.closest?.('.bubble, .sticker-msg');
    if (!bubble || g.target.closest('a, .quote, img, .voice-play, .voice-bars')) return;
    const now = performance.now();
    if (lastTap.id === g.entry.data.id && now - lastTap.time < 420) {
      lastTap = { id: null, time: 0 };
      closePopover();
      if (!g.entry.data.deleted) react(g.entry.data.id, state.reactions[0], bubble);
    } else {
      lastTap = { id: g.entry.data.id, time: now };
      if (bubble.classList.contains('sticker-msg')) replaySticker(bubble);
      if (!g.wasOpen) openPopover(g.entry);
    }
  }
  list.addEventListener('pointerup', (e) => endGesture(e, false));
  list.addEventListener('pointercancel', (e) => endGesture(e, true));

  /* ---------- voice playback ---------- */
  const audio = new Audio();
  audio.preload = 'none';
  let playing = null;
  function toggleVoice(row, e) {
    const entry = row && state.entries.get(row.dataset.id);
    if (!entry || entry.data.deleted) return;
    const bars = $('.voice-bars', row);
    const btn = $('.voice-play', row);
    const seek = e.target.closest('.voice-bars');
    if (playing?.row !== row) {
      stopVoice();
      audio.src = mediaUrl(entry.data);
      playing = { row, bars, btn, dur: entry.data.media.dur || 0 };
    }
    if (seek && audio.duration) {
      const r = bars.getBoundingClientRect();
      audio.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * audio.duration;
      if (!audio.paused) return;
    }
    if (audio.paused) {
      audio.play().catch(() => toast('再生できませんでした'));
      btn.innerHTML = ICONS.pause;
      popIn(btn, { stiffness: 500, damping: 16 }, 0.8);
    } else {
      audio.pause();
      btn.innerHTML = ICONS.play;
    }
  }
  function stopVoice() {
    if (!playing) return;
    audio.pause();
    playing.btn.innerHTML = ICONS.play;
    for (const i of playing.bars.children) i.classList.remove('on');
    $('.voice-time', playing.row).textContent = fmtDur(playing.dur);
    playing = null;
  }
  audio.addEventListener('timeupdate', () => {
    if (!playing) return;
    const d = Number.isFinite(audio.duration) ? audio.duration : playing.dur;
    const p = d ? audio.currentTime / d : 0;
    const bars = [...playing.bars.children];
    bars.forEach((i, idx) => i.classList.toggle('on', idx / bars.length < p));
    $('.voice-time', playing.row).textContent = fmtDur(audio.currentTime);
  });
  audio.addEventListener('ended', stopVoice);

  /* ---------- image viewer: grows out of the thumbnail, drag down to close ---------- */
  const viewer = $('#viewer');
  const viewerImg = $('#viewerImg');
  let viewerFrom = null;
  const viewerSpring = new Spring(0, (p) => {
    if (!viewerFrom) return;
    const { from, to, drag } = viewerFrom;
    const x = mix(from.left, to.left, p) + drag.x;
    const y = mix(from.top, to.top, p) + drag.y;
    const s = mix(from.width / to.width, 1, p);
    viewerImg.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`;
    viewer.style.setProperty('--vo', clamp(p - Math.abs(drag.y) / 600, 0, 1).toFixed(3));
  }, { stiffness: 300, damping: 28, precision: 0.001 });
  function openViewer(img) {
    if (!img.complete || !img.naturalWidth) return;
    const from = img.getBoundingClientRect();
    const ratio = Math.min(innerWidth / img.naturalWidth, innerHeight / img.naturalHeight, 1.6);
    const w = img.naturalWidth * ratio;
    const hh = img.naturalHeight * ratio;
    viewerImg.src = img.currentSrc || img.src;
    Object.assign(viewerImg.style, { width: `${w}px`, height: `${hh}px`, position: 'absolute', left: '0', top: '0' });
    viewerFrom = { from, to: { left: (innerWidth - w) / 2, top: (innerHeight - hh) / 2, width: w }, drag: { x: 0, y: 0 }, img };
    viewer.hidden = false;
    img.style.visibility = 'hidden';
    viewerSpring.jump(0).to(1, { stiffness: 300, damping: 26 });
  }
  function closeViewer() {
    if (!viewerFrom) return;
    viewerFrom.from = viewerFrom.img.getBoundingClientRect();
    viewerSpring.onRest = () => {
      viewer.hidden = true;
      if (viewerFrom) viewerFrom.img.style.visibility = '';
      viewerFrom = null;
    };
    viewerSpring.to(0, { stiffness: 340, damping: 32 });
  }
  let vg = null;
  viewer.addEventListener('pointerdown', (e) => {
    vg = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), vy: 0, moved: false };
    viewer.setPointerCapture(e.pointerId);
  });
  viewer.addEventListener('pointermove', (e) => {
    if (!vg || e.pointerId !== vg.id || !viewerFrom) return;
    const dy = e.clientY - vg.y;
    const dx = e.clientX - vg.x;
    if (Math.hypot(dx, dy) > 6) vg.moved = true;
    const now = performance.now();
    vg.vy = mix(vg.vy, (dy - viewerFrom.drag.y) / Math.max(1, now - vg.t), 0.5);
    vg.t = now;
    viewerFrom.drag = { x: dx * 0.6, y: dy };
    viewerSpring.onUpdate(viewerSpring.x);
  });
  viewer.addEventListener('pointerup', (e) => {
    if (!vg || e.pointerId !== vg.id || !viewerFrom) return;
    const g = vg;
    vg = null;
    if (!g.moved || Math.abs(viewerFrom.drag.y) > 110 || Math.abs(g.vy) > 0.7) {
      const d = viewerFrom.drag;
      viewerFrom.drag = { x: 0, y: 0 };
      viewerFrom.to = { ...viewerFrom.to, left: viewerFrom.to.left + d.x, top: viewerFrom.to.top + d.y };
      closeViewer();
    } else {
      const start = { ...viewerFrom.drag };
      play({ stiffness: 380, damping: 26 }, (p) => {
        if (!viewerFrom) return;
        viewerFrom.drag = { x: start.x * (1 - p), y: start.y * (1 - p) };
        viewerSpring.onUpdate(viewerSpring.x);
      });
    }
  });

  /* =====================================================================
     Composer: text, mentions, photos, stickers, voice
     ===================================================================== */
  function autosize() {
    const stick = nearBottom();
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 3, 132)}px`;
    if (stick) scroller.scrollTop = scroller.scrollHeight;
  }
  const hasText = () => input.value.trim().length > 0;
  function updateSend() {
    sendBtn.classList.toggle('ready', hasText());
    sendBtn.setAttribute('aria-label', hasText() ? (state.editing ? '保存' : '送信') : '音声メッセージを録音');
  }
  let typingSent = 0;
  let typingRoom = null;
  let typingStop = 0;
  function sendTyping(on) {
    const now = Date.now();
    if (on && typingRoom === state.activeId && now - typingSent < 2000) return;
    if (!on && !typingSent) return;
    if (!wsSend({ type: 'typing', room: on ? state.activeId : typingRoom, on })) return;
    typingSent = on ? now : 0;
    typingRoom = on ? state.activeId : null;
  }
  function sendPayload(extra) {
    const cid = randomId();
    if (!wsSend({ type: 'msg', room: state.activeId, cid, replyTo: state.reply?.id, ...extra })) {
      toast('接続が切れています。再接続中…');
      return null;
    }
    return cid;
  }
  function send() {
    const text = input.value.trim();
    if (!text || !state.activeId) return;
    if (state.editing) {
      const entry = state.editing;
      if (text !== entry.data.text) wsSend({ type: 'edit', room: state.activeId, id: entry.data.id, text });
      setEditing(null);
      return;
    }
    const cid = sendPayload({ text });
    if (!cid) return;
    addLive({ cid, from: state.me, text, ts: Date.now(), reactions: {}, replyTo: state.reply && { ...state.reply, text: [...state.reply.text].slice(0, 80).join('') } }, { pending: true });
    input.value = '';
    state.drafts.delete(state.activeId);
    autosize();
    setReply(null);
    updateSend();
    hideMentions();
    clearTimeout(typingStop);
    sendTyping(false);
    sendBtn.classList.remove('fly');
    void sendBtn.offsetWidth;
    sendBtn.classList.add('fly');
  }
  input.addEventListener('input', () => {
    autosize();
    updateSend();
    updateMentions();
    sendTyping(input.value.length > 0);
    clearTimeout(typingStop);
    typingStop = setTimeout(() => sendTyping(false), 3000);
  });
  input.addEventListener('keydown', (e) => {
    if (!mentionBox.hidden && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key) && !e.isComposing) {
      e.preventDefault();
      return mentionKey(e.key);
    }
    if (e.key === 'Escape' && state.editing) return setEditing(null);
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229 || coarse.matches) return;
    e.preventDefault();
    send();
  });
  input.addEventListener('focus', closeTray);
  sendBtn.addEventListener('pointerdown', (e) => { if (hasText()) e.preventDefault(); });
  sendBtn.addEventListener('click', () => (hasText() ? send() : startRecording()));

  /* ---------- @mentions ---------- */
  let mentionSel = 0;
  let mentionItems = [];
  function updateMentions() {
    const room = activeRoom();
    const before = input.value.slice(0, input.selectionStart);
    const m = /(?:^|\s)@([^\s@]{0,20})$/.exec(before);
    if (!room || room.s.kind !== 'group' || !m || !room.members) return hideMentions();
    const q = m[1].toLowerCase();
    mentionItems = room.members.filter((u) => u.id !== state.me.id && u.name.toLowerCase().includes(q)).slice(0, 6);
    if (!mentionItems.length) return hideMentions();
    mentionSel = 0;
    mentionBox.replaceChildren(...mentionItems.map((u, i) => h('button', { type: 'button', class: i === 0 ? 'sel' : '', onpointerdown: (ev) => ev.preventDefault(), onclick: () => pickMention(i) }, avatar(u), u.name)));
    if (mentionBox.hidden) {
      mentionBox.hidden = false;
      play({ stiffness: 420, damping: 24 }, (p) => {
        mentionBox.style.transform = `translateY(${mix(10, 0, p).toFixed(2)}px) scale(${mix(0.9, 1, p).toFixed(4)})`;
        mentionBox.style.opacity = clamp(p * 1.8, 0, 1).toFixed(3);
      });
    }
  }
  function hideMentions() { mentionBox.hidden = true; }
  function mentionKey(key) {
    if (key === 'Escape') return hideMentions();
    if (key === 'Enter' || key === 'Tab') return pickMention(mentionSel);
    mentionSel = (mentionSel + (key === 'ArrowDown' ? 1 : -1) + mentionItems.length) % mentionItems.length;
    [...mentionBox.children].forEach((b, i) => b.classList.toggle('sel', i === mentionSel));
  }
  function pickMention(i) {
    const u = mentionItems[i];
    if (!u) return;
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos).replace(/@([^\s@]{0,20})$/, `@${u.name} `);
    input.value = before + input.value.slice(pos);
    input.setSelectionRange(before.length, before.length);
    hideMentions();
    autosize();
    updateSend();
    input.focus();
  }

  /* ---------- sticker tray ---------- */
  const tray = $('#stickerTray');
  const stickerGrid = $('#stickerGrid');
  const traySpring = new Spring(0, (v) => { tray.style.height = `${Math.max(0, v).toFixed(1)}px`; }, { stiffness: 380, damping: 32, precision: 0.5 });
  let trayOpen = false;
  function buildStickers() {
    if (stickerGrid.childElementCount || !window.LynqStickers) return;
    for (const id of LynqStickers.ids) {
      stickerGrid.append(h('button', { class: 'sticker-cell', type: 'button', 'data-sticker': id, 'data-press': true, 'aria-label': LynqStickers.label(id), html: LynqStickers.svg(id) }));
    }
  }
  function openTray() {
    buildStickers();
    trayOpen = true;
    $('#stickerBtn').classList.add('on');
    tray.setAttribute('aria-hidden', 'false');
    input.blur();
    traySpring.to(Math.min(272, stickerGrid.scrollHeight + 4));
    [...stickerGrid.children].forEach((c, i) => {
      c.style.transform = 'scale(0.4)';
      c.style.opacity = '0';
      setTimeout(() => play({ stiffness: 420, damping: 16 }, (p) => {
        c.style.transform = `scale(${mix(0.4, 1, p).toFixed(4)})`;
        c.style.opacity = clamp(p * 2, 0, 1).toFixed(3);
      }, () => { c.style.transform = ''; c.style.opacity = ''; }), 20 + i * 18);
    });
  }
  function closeTray() {
    if (!trayOpen) return;
    trayOpen = false;
    $('#stickerBtn').classList.remove('on');
    tray.setAttribute('aria-hidden', 'true');
    traySpring.to(0);
  }
  $('#stickerBtn').addEventListener('click', () => (trayOpen ? closeTray() : openTray()));
  stickerGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.sticker-cell');
    if (!cell || !state.activeId) return;
    const sticker = cell.dataset.sticker;
    const cid = sendPayload({ sticker });
    if (!cid) return;
    replaySticker(cell);
    addLive({ cid, from: state.me, text: '', sticker, ts: Date.now(), reactions: {} }, { pending: true });
    setReply(null);
  });

  /* ---------- photos ---------- */
  const fileInput = $('#fileInput');
  $('#photoBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || !state.activeId) return;
    if (!file.type.startsWith('image/')) return toast('画像ファイルを選んでください');
    try {
      const prepared = await prepareImage(file);
      sendMedia('image', prepared.blob, { w: prepared.w, h: prepared.h });
    } catch {
      toast('画像を読み込めませんでした');
    }
  });
  async function prepareImage(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
    if (!bmp) throw new Error('decode');
    const { width: w0, height: h0 } = bmp;
    if (file.type === 'image/gif' && file.size < 2.8 * 1024 * 1024) return { blob: file, w: w0, h: h0 };
    const scale = Math.min(1, 1600 / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const hh = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hh;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, hh);
    const toBlob = (type, q) => new Promise((res) => canvas.toBlob(res, type, q));
    let blob = await toBlob('image/webp', 0.82);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
    return { blob, w, h: hh };
  }
  function upload(roomId, kind, blob, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/media?room=${encodeURIComponent(roomId)}&kind=${kind}`);
      xhr.setRequestHeader('x-lynq-uid', uid);
      xhr.setRequestHeader('content-type', blob.type.split(';')[0]);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status === 200 && res.id) resolve(res.id);
          else reject(new Error(String(xhr.status)));
        } catch (err) { reject(err); }
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(blob);
    });
  }
  async function sendMedia(kind, blob, meta) {
    const roomId = state.activeId;
    const caption = kind === 'image' ? input.value.trim() : '';
    const local = { cid: randomId(), from: state.me, text: caption, ts: Date.now(), reactions: {}, media: { kind, ...meta }, localUrl: URL.createObjectURL(blob), uploading: true };
    const entry = addLive(local, { pending: true });
    if (caption) {
      input.value = '';
      autosize();
      updateSend();
    }
    const bar = entry?.row.querySelector('.progress');
    try {
      const id = await upload(roomId, kind, blob, (p) => bar?.style.setProperty('--p', p.toFixed(3)));
      bar?.remove();
      state.pending.delete(local.cid);
      const cid = randomId();
      local.cid = cid;
      if (entry) state.pending.set(cid, entry);
      if (!wsSend({ type: 'msg', room: roomId, cid, text: caption, media: { id, ...meta }, replyTo: state.reply?.id })) throw new Error('offline');
      setReply(null);
    } catch (err) {
      state.pending.delete(local.cid);
      entry?.row.remove();
      toast(err.message === '413' ? 'ファイルが大きすぎます（3MBまで）' : '送信できませんでした');
    }
  }

  /* ---------- voice recording ---------- */
  const recBar = $('#recBar');
  const composeRow = $('#composeRow');
  const recWave = $('#recWave');
  let recorder = null;
  function pickMime() {
    if (!window.MediaRecorder) return null;
    for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }
  async function startRecording() {
    if (!state.activeId || recorder) return;
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) return toast('このブラウザは録音に対応していません');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return toast('マイクを使う許可が必要です');
    }
    closeTray();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser();
    an.fftSize = 512;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    recorder = { mr, stream, chunks, ac, an, buf, start: performance.now(), raf: 0, levels: [], cancelled: false };
    recWave.replaceChildren();
    mr.start(250);
    composeRow.hidden = true;
    recBar.hidden = false;
    play({ stiffness: 420, damping: 26 }, (p) => {
      recBar.style.transform = `translateY(${mix(14, 0, p).toFixed(2)}px)`;
      recBar.style.opacity = clamp(p * 2, 0, 1).toFixed(3);
    }, () => { recBar.style.transform = ''; recBar.style.opacity = ''; });
    navigator.vibrate?.(15);
    let lastBar = 0;
    const tick = (now) => {
      if (!recorder) return;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 5);
      recorder.levels.push(level);
      if (now - lastBar > 90) {
        lastBar = now;
        const i = h('i');
        i.style.setProperty('--v', level.toFixed(2));
        recWave.append(i);
        if (recWave.childElementCount > 80) recWave.firstChild.remove();
        popIn(i, { stiffness: 600, damping: 20 }, 0.2);
      }
      const secs = (now - recorder.start) / 1000;
      $('#recTime').textContent = fmtDur(secs);
      if (secs >= 120) return finishRecording();
      recorder.raf = requestAnimationFrame(tick);
    };
    recorder.raf = requestAnimationFrame(tick);
  }
  function stopRecorder() {
    const r = recorder;
    recorder = null;
    cancelAnimationFrame(r.raf);
    r.stream.getTracks().forEach((t) => t.stop());
    r.ac.close().catch(() => {});
    recBar.hidden = true;
    composeRow.hidden = false;
    return r;
  }
  function cancelRecording() {
    if (!recorder) return;
    const r = stopRecorder();
    r.cancelled = true;
    if (r.mr.state !== 'inactive') r.mr.stop();
  }
  function finishRecording() {
    if (!recorder) return;
    const roomId = state.activeId;
    const r = stopRecorder();
    const dur = (performance.now() - r.start) / 1000;
    r.mr.onstop = () => {
      if (r.cancelled) return;
      if (dur < 0.8) return toast('短すぎるため送信しませんでした');
      const type = (r.mr.mimeType || r.chunks[0]?.type || 'audio/webm').split(';')[0];
      const blob = new Blob(r.chunks, { type });
      // Down-sample the live levels into 40 bars, normalised to the loudest moment.
      const n = 40;
      const loudest = Math.max(0.02, ...r.levels);
      const peaks = [];
      for (let i = 0; i < n; i++) {
        const seg = r.levels.slice(Math.floor((i * r.levels.length) / n), Math.floor(((i + 1) * r.levels.length) / n));
        const v = seg.length ? Math.max(...seg) / loudest : 0;
        peaks.push(Math.round(Math.min(1, Math.max(0.08, v ** 0.8)) * 100));
      }
      if (state.activeId !== roomId) return;
      sendMedia('audio', blob, { dur: Math.round(dur), peaks });
    };
    if (r.mr.state !== 'inactive') r.mr.stop();
  }
  $('#recCancel').addEventListener('click', cancelRecording);
  $('#recSend').addEventListener('click', () => finishRecording());

  /* ---------- typing indicator ---------- */
  function renderTyping() {
    const map = state.typers.get(state.activeId);
    const names = map ? [...map.values()].map((t) => t.name) : [];
    if (names.length) $('#typingText').textContent = names.length === 1 ? `${names[0]}が入力中` : `${names.length}人が入力中`;
    typingEl.classList.toggle('show', names.length > 0);
  }
  function setTyper(roomId, id, name, on) {
    let map = state.typers.get(roomId);
    if (!map) state.typers.set(roomId, (map = new Map()));
    const prev = map.get(id);
    if (prev) clearTimeout(prev.timer);
    if (on && !state.blocks.includes(id)) map.set(id, { name, timer: setTimeout(() => setTyper(roomId, id, name, false), 5000) });
    else map.delete(id);
    if (roomId === state.activeId) renderTyping();
  }

  /* =====================================================================
     Calls
     ===================================================================== */
  function renderCallBanner() {
    const room = activeRoom();
    const banner = $('#callBanner');
    const peers = room?.call?.peers || [];
    const inThis = window.LynqCall?.room === state.activeId;
    const show = !!room && peers.length > 0 && !(inThis && !LynqCall.minimized);
    const was = !banner.hidden;
    banner.hidden = !show;
    $('#voiceCallBtn').classList.toggle('live', peers.length > 0);
    if (!show) return;
    $('#callBannerText').textContent = inThis ? '通話中（タップで戻る）' : `通話中 ・ ${peers.map((p) => p.name).slice(0, 3).join('、')}${peers.length > 3 ? ` ほか${peers.length - 3}人` : ''}`;
    $('#callJoin').textContent = inThis ? '戻る' : '参加';
    if (!was) {
      play({ stiffness: 360, damping: 20 }, (p) => {
        banner.style.transform = `translateY(${mix(-12, 0, p).toFixed(2)}px) scale(${mix(0.95, 1, p).toFixed(4)})`;
        banner.style.opacity = clamp(p * 1.6, 0, 1).toFixed(3);
      }, () => { banner.style.transform = ''; banner.style.opacity = ''; });
    }
  }
  function startCall(video) {
    if (!state.activeId) return;
    const room = activeRoom();
    if (room?.s.kind === 'dm' && state.blocks.includes(room.s.peer)) return toast('ブロック中のユーザーとは通話できません');
    LynqCall.join(state.activeId, { video });
  }
  $('#voiceCallBtn').addEventListener('click', () => startCall(false));
  $('#videoCallBtn').addEventListener('click', () => startCall(true));
  $('#callJoin').addEventListener('click', () => (LynqCall.room === state.activeId ? LynqCall.expand() : startCall(false)));
  $('#callBanner').addEventListener('click', (e) => { if (!e.target.closest('button') && LynqCall.room === state.activeId) LynqCall.expand(); });
  window.LynqCall?.init({
    send: wsSend, me: () => state.me, toast, h, Spring, play, mix, clamp, avatar,
    roomName: (id) => state.rooms.get(id)?.s.name || '通話',
    onChange: () => renderCallBanner(),
  });

  /* =====================================================================
     Sheets
     ===================================================================== */
  const sheetLayer = $('#sheetLayer');
  const sheetEl = $('.sheet');
  const sheetBody = $('#sheetBody');
  const scrim = $('.scrim');
  const sheet = { open: false, onClose: null, name: null };
  const sheetSpring = new Spring(0, (v) => sheetLayer.style.setProperty('--sheet', Math.max(0, v).toFixed(4)), { stiffness: 340, damping: 30, precision: 0.001 });
  const sheetDrag = new Spring(0, (y) => {
    sheetEl.style.setProperty('--sheet-drag', `${Math.max(0, y).toFixed(2)}px`);
    scrim.style.opacity = y > 0 ? String(clamp(1 - y / sheetEl.offsetHeight, 0, 1) * Math.min(1, sheetSpring.x)) : '';
  }, { stiffness: 420, damping: 32, precision: 0.2 });
  function openSheet(name, content, onClose = null) {
    const replacing = sheet.open;
    sheet.onClose?.();
    sheet.open = true;
    sheet.name = name;
    sheet.onClose = onClose;
    closePopover();
    sheetBody.replaceChildren(content);
    sheetBody.scrollTop = 0;
    sheetLayer.hidden = false;
    sheetDrag.jump(0);
    sheetSpring.onRest = null;
    if (replacing) {
      play({ stiffness: 380, damping: 26 }, (p) => {
        content.style.transform = `translateY(${mix(16, 0, p).toFixed(2)}px)`;
        content.style.opacity = clamp(p * 1.5, 0, 1).toFixed(3);
      }, () => { content.style.transform = ''; content.style.opacity = ''; });
    } else sheetSpring.to(1, { stiffness: 330, damping: 27 });
    const first = content.querySelector('input');
    if (first && !coarse.matches) setTimeout(() => first.focus(), 60);
  }
  function closeSheet(velocity = 0) {
    if (!sheet.open) return;
    sheet.open = false;
    const done = sheet.onClose;
    sheet.onClose = null;
    sheet.name = null;
    document.activeElement?.blur?.();
    const finishClose = () => {
      if (sheet.open) return;
      sheetLayer.hidden = true;
      sheetSpring.jump(0);
      sheetDrag.jump(0);
      scrim.style.opacity = '';
    };
    if (velocity && narrow.matches) {
      sheetDrag.v = velocity;
      sheetDrag.onRest = finishClose;
      sheetDrag.to(sheetEl.offsetHeight + 40, { stiffness: 260, damping: 30 });
    } else {
      sheetSpring.onRest = finishClose;
      sheetSpring.to(0, { stiffness: 380, damping: 36 });
    }
    done?.();
  }
  scrim.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (viewerFrom) closeViewer();
    else if (sheet.open) closeSheet();
    else {
      closePopover();
      closeTray();
      if (!state.editing) setReply(null);
    }
  });
  let sheetGesture = null;
  sheetEl.addEventListener('pointerdown', (e) => {
    if (!narrow.matches || e.pointerType === 'mouse') return;
    const onGrab = e.target.closest('.grab');
    if (!onGrab && (sheetBody.scrollTop > 0 || e.target.closest('input, textarea, .switch-row, .people, .results, .choice'))) return;
    sheetGesture = { id: e.pointerId, y: e.clientY, last: e.clientY, t: performance.now(), v: 0, dragging: false };
  });
  sheetEl.addEventListener('pointermove', (e) => {
    const g = sheetGesture;
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y;
    if (!g.dragging) {
      if (dy < 6) return;
      g.dragging = true;
      try { sheetEl.setPointerCapture(e.pointerId); } catch { /* gone */ }
      sheetDrag.stop();
    }
    const now = performance.now();
    g.v = mix(g.v, ((e.clientY - g.last) / Math.max(1, now - g.t)) * 1000, 0.6);
    g.last = e.clientY;
    g.t = now;
    sheetDrag.x = dy > 0 ? dy : dy * 0.2;
    sheetDrag.onUpdate(sheetDrag.x);
  });
  function endSheetGesture(e) {
    const g = sheetGesture;
    if (!g || e.pointerId !== g.id) return;
    sheetGesture = null;
    if (!g.dragging) return;
    if (sheetDrag.x > 120 || g.v > 650) closeSheet(Math.max(g.v, 400));
    else {
      sheetDrag.v = g.v;
      sheetDrag.to(0);
    }
  }
  sheetEl.addEventListener('pointerup', endSheetGesture);
  sheetEl.addEventListener('pointercancel', endSheetGesture);

  /* ---------- form helpers ---------- */
  function field(label, attrs, note, cls) {
    const inputEl = h('input', attrs);
    const noteEl = note != null ? h('small', 'field-note', note) : null;
    return { wrap: h('label', `field${cls ? ` ${cls}` : ''}`, label ? h('span', null, label) : null, inputEl, noteEl), input: inputEl, note: noteEl };
  }
  function switchRow(title, desc, on, onChange) {
    const sw = h('span', { class: `switch${on ? ' on' : ''}`, 'aria-hidden': 'true' });
    const row = h('button', { class: 'switch-row', type: 'button', role: 'switch', 'aria-checked': String(on), 'data-press': true }, h('span', 'txt', h('b', null, title), desc ? h('small', null, desc) : null), sw);
    const k = new Spring(on ? 1 : 0, (x, v) => {
      sw.style.setProperty('--k', x.toFixed(4));
      sw.style.setProperty('--stretch', (1 + Math.min(Math.abs(v || 0) * 0.04, 0.3)).toFixed(4));
    }, { stiffness: 520, damping: 24, precision: 0.001 });
    k.onUpdate(k.x, 0);
    row.set = (value, silent) => {
      on = value;
      sw.classList.toggle('on', on);
      row.setAttribute('aria-checked', String(on));
      k.to(on ? 1 : 0);
      if (!silent) onChange?.(on);
    };
    row.addEventListener('click', () => row.set(!on));
    return row;
  }
  function choice(options, value, onChange) {
    const pill = h('span', 'pill');
    const box = h('div', { class: 'choice', role: 'radiogroup' }, pill);
    const btns = options.map(([v, label]) => h('button', { type: 'button', role: 'radio', class: v === value ? 'on' : '', 'data-v': v }, label));
    box.append(...btns);
    pill.style.width = `calc((100% - 8px) / ${btns.length})`;
    const s = new Spring(0, (x, vel) => {
      pill.style.transform = `translateX(${(x * 100).toFixed(2)}%) scaleX(${(1 + Math.min(Math.abs(vel || 0) * 0.02, 0.15)).toFixed(4)})`;
    }, { stiffness: 420, damping: 30, precision: 0.001 });
    s.jump(Math.max(0, options.findIndex(([v]) => v === value)));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      btns.forEach((x) => x.classList.toggle('on', x === b));
      s.to(btns.indexOf(b));
      onChange(b.dataset.v, e);
    });
    return box;
  }
  function confirmButton(label, confirmLabel, action) {
    let armed = false;
    let timer = 0;
    const btn = h('button', { class: 'ghost-btn danger-btn', type: 'button', 'data-press': true }, label);
    btn.addEventListener('click', () => {
      if (armed) {
        clearTimeout(timer);
        action();
        return;
      }
      armed = true;
      btn.textContent = confirmLabel;
      btn.classList.add('confirm');
      popIn(btn, { stiffness: 500, damping: 14 }, 0.92);
      timer = setTimeout(() => {
        armed = false;
        btn.textContent = label;
        btn.classList.remove('confirm');
      }, 3000);
    });
    return btn;
  }

  /* ---------- create room ---------- */
  let createBusy = false;
  function openCreateSheet() {
    const name = field('ルーム名', { maxlength: 30, placeholder: '例: 週末の旅行', enterkeyhint: 'done' });
    const pass = field('合言葉', { maxlength: 32, placeholder: '参加するときに入力してもらう言葉', autocomplete: 'off' }, '');
    const passWrap = h('div', 'reveal', h('div', null, pass.wrap));
    let isPublic = false;
    let usePass = false;
    const submit = h('button', { class: 'primary', type: 'submit', 'data-press': true, disabled: true }, '作成する');
    const check = () => { submit.disabled = !name.input.value.trim() || (usePass && !pass.input.value.trim()); };
    name.input.addEventListener('input', check);
    pass.input.addEventListener('input', check);
    const form = h('form', { autocomplete: 'off' },
      h('h2', null, 'ルームを作る'),
      h('p', 'sub', '作ったあとQRコードで招待できます'),
      name.wrap,
      switchRow('公開ルームにする', '「さがす」に表示され、誰でも見つけられます', false, (on) => { isPublic = on; }),
      switchRow('合言葉をつける', '知っている人だけが参加できます', false, (on) => {
        usePass = on;
        passWrap.classList.toggle('show', on);
        if (on) setTimeout(() => pass.input.focus(), 80);
        check();
      }),
      passWrap,
      submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (submit.disabled || createBusy) return;
      const payload = { type: 'create', name: name.input.value.trim(), isPublic, pass: usePass ? pass.input.value.trim() : '' };
      if (!wsSend(payload)) return toast('接続が切れています');
      createBusy = true;
      state.pendingCreatePass = payload.pass;
      setTimeout(() => { createBusy = false; }, 4000);
    });
    openSheet('create', form);
  }
  $('#createBtn').addEventListener('click', openCreateSheet);

  /* ---------- QR helpers ---------- */
  function qrSvg(text) {
    const qr = qrcode(0, 'H');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const c = (n - 1) / 2;
    const logo = n * 0.13;
    const finder = (r, col) => (r < 7 && col < 7) || (r < 7 && col >= n - 7) || (r >= n - 7 && col < 7);
    let dots = '';
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        if (!qr.isDark(r, col) || finder(r, col)) continue;
        if (Math.abs(r - c) < logo && Math.abs(col - c) < logo) continue;
        const d = Math.hypot(r - c, col - c) * 16;
        dots += `<rect class="qd" style="--d:${d.toFixed(0)}ms" x="${col + 0.08}" y="${r + 0.08}" width=".84" height=".84" rx=".38"/>`;
      }
    }
    let finders = '';
    for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      const d = Math.hypot(y + 3 - c, x + 3 - c) * 16;
      finders += `<g class="qd" style="--d:${d.toFixed(0)}ms"><rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="2" fill="none" stroke="url(#qg)" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="1" fill="url(#qg)"/></g>`;
    }
    return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QRコード"><defs><linearGradient id="qg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b56c9"/><stop offset="1" stop-color="#5c9dff"/></linearGradient></defs><g fill="url(#qg)">${dots}</g>${finders}</svg>`;
  }
  function qrBox(url) {
    const box = h('div', 'qr-wrap');
    box.innerHTML = qrSvg(url);
    box.append(h('span', { class: 'qr-logo', html: ICONS.bubble }));
    return box;
  }
  function copyButton(getText, done = 'コピーしました') {
    const b = h('button', { class: 'pill-btn', type: 'button', 'data-press': true }, 'コピー');
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(getText());
        toast(done);
      } catch { toast('コピーできませんでした'); }
    });
    return b;
  }

  /* ---------- invite ---------- */
  function inviteUrl(id, pass) {
    const url = new URL(`/?r=${encodeURIComponent(id)}`, location.origin);
    if (pass) url.hash = `k=${encodeURIComponent(pass)}`;
    return url.href;
  }
  function openInviteSheet(id) {
    const room = state.rooms.get(id);
    if (!room || room.s.kind !== 'group') return;
    const knownPass = store.get(`lq.pass.${id}`);
    let includePass = false;
    const holder = h('div');
    const linkText = h('code');
    let url = '';
    const render = () => {
      url = inviteUrl(id, includePass ? knownPass : '');
      holder.replaceChildren(qrBox(url));
      linkText.textContent = url;
    };
    render();
    const shareBtn = navigator.share ? h('button', { class: 'ghost-btn', type: 'button', 'data-press': true, html: `${ICONS.share}<span>リンクを共有</span>` }) : null;
    shareBtn?.addEventListener('click', () => navigator.share({ title: room.s.name, text: `「${room.s.name}」に参加しよう`, url }).catch(() => {}));
    let passPart = null;
    if (room.s.locked) {
      passPart = knownPass
        ? switchRow('合言葉もリンクに含める', 'QRを読むだけで参加できるようになります', false, (on) => { includePass = on; render(); })
        : h('p', 'note', 'このルームには合言葉があります。合言葉は別に伝えてください。');
    }
    openSheet('invite', h('div', null,
      h('h2', null, '友だちを招待'),
      h('p', 'sub', `カメラでQRを読み取ると「${room.s.name}」に参加できます`),
      holder,
      h('div', 'link-box', linkText, copyButton(() => url, '招待リンクをコピーしました')),
      passPart,
      shareBtn ? h('div', 'btn-row', shareBtn) : null));
  }

  /* ---------- join ---------- */
  function openJoinSheet(s, prefill = '') {
    const pass = s.locked ? field('合言葉', { maxlength: 32, placeholder: '合言葉を入力', autocomplete: 'off', value: prefill || null }, '') : null;
    const meta = h('div', 'meta-row',
      h('span', { class: 'tag', html: `${ICONS.people}<span>メンバー ${s.members}人</span>` }),
      s.online ? h('span', 'tag', `${s.online}人がオンライン`) : null,
      s.locked ? h('span', { class: 'tag', html: `${ICONS.lock}<span>合言葉つき</span>` }) : null);
    const form = h('form', { autocomplete: 'off' }, h('div', 'sheet-head', roomAvatar(s), h('h2', null, s.name)), meta, pass?.wrap,
      h('button', { class: 'primary', type: 'submit', 'data-press': true }, '参加する'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = pass ? pass.input.value.trim() : '';
      if (pass && !p) {
        shake(pass.wrap);
        return pass.input.focus();
      }
      state.joinThenOpen = s.id;
      state.joinPass = { room: s.id, pass: p };
      if (!wsSend({ type: 'join', room: s.id, pass: p })) toast('接続が切れています');
    });
    openSheet(`join:${s.id}`, form);
  }

  /* ---------- room menu ---------- */
  function openRoomMenu() {
    const room = activeRoom();
    if (!room) return;
    const s = room.s;
    const id = s.id;
    const dm = s.kind === 'dm';
    const notify = switchRow(dm ? 'このトークの通知' : 'このルームの通知', s.muted ? 'オフ（メンションは届きます）' : '新着メッセージを通知します', !s.muted, (on) => {
      wsSend({ type: 'mute', room: id, on: !on });
      notify.querySelector('small').textContent = on ? '新着メッセージを通知します' : 'オフ（メンションは届きます）';
    });
    const btn = (label, fn) => h('button', { class: 'ghost-btn', type: 'button', 'data-press': true, onclick: fn }, label);
    const items = [btn('メッセージを検索', openSearchSheet)];
    if (!dm) items.push(btn('メンバー', openMembersSheet), btn('QRで招待する', () => openInviteSheet(id)));
    else {
      const isBlocked = state.blocks.includes(s.peer);
      items.push(btn(isBlocked ? 'ブロックを解除' : 'ブロックする', () => {
        wsSend({ type: 'block', user: s.peer, on: !isBlocked });
        closeSheet();
        toast(isBlocked ? 'ブロックを解除しました' : 'ブロックしました');
      }));
    }
    items.push(confirmButton(dm ? 'トークから退出' : 'ルームを退出', 'もう一度押すと退出します', () => {
      wsSend({ type: 'leave', room: id });
      closeSheet();
    }));
    if (s.owner && id !== 'lobby' && !dm) {
      items.push(confirmButton('ルームを削除', '全員のルームから消えます。押して削除', () => {
        wsSend({ type: 'delete', room: id });
        closeSheet();
      }));
    }
    const meta = dm ? null : h('div', 'meta-row',
      h('span', { class: 'tag', html: `${s.isPublic ? ICONS.globe : ICONS.link}<span>${s.isPublic ? '公開ルーム' : '招待制'}</span>` }),
      s.locked ? h('span', { class: 'tag', html: `${ICONS.lock}<span>合言葉つき</span>` }) : null,
      h('span', { class: 'tag', html: `${ICONS.people}<span>メンバー ${s.members}人</span>` }));
    openSheet('menu', h('div', null, h('div', 'sheet-head', roomAvatar(s), h('h2', null, s.name)), meta, notify, h('div', 'list-btns', items)));
  }
  $('#menuBtn').addEventListener('click', openRoomMenu);
  $('#roomTitle').addEventListener('click', openRoomMenu);

  /* ---------- search ---------- */
  function openSearchSheet() {
    const room = activeRoom();
    if (!room) return;
    const q = field('', { type: 'search', placeholder: 'キーワードや名前で検索', enterkeyhint: 'search', autocomplete: 'off' });
    const results = h('div', 'results');
    let timer = 0;
    q.input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const v = q.input.value.trim();
        if (!v) return results.replaceChildren();
        wsSend({ type: 'search', room: room.s.id, q: v });
      }, 250);
    });
    results.addEventListener('click', (e) => {
      const r = e.target.closest('.result');
      if (!r) return;
      closeSheet();
      const entry = state.entries.get(r.dataset.id);
      if (entry) {
        entry.row.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        flash(entry.row);
      } else wsSend({ type: 'jump', room: room.s.id, id: r.dataset.id });
    });
    sheet.searchResults = results;
    openSheet('search', h('div', null, h('h2', null, 'メッセージを検索'), h('div', 'search-box', q.wrap), results));
  }
  function renderSearch(msg) {
    const box = sheet.name === 'search' && sheet.searchResults;
    if (!box) return;
    const q = msg.q.toLowerCase();
    if (!msg.results.length) return box.replaceChildren(h('p', 'note', '見つかりませんでした'));
    box.replaceChildren(...msg.results.map((r, i) => {
      const span = h('span');
      const at = r.text.toLowerCase().indexOf(q);
      if (at >= 0) span.append(r.text.slice(0, at), h('mark', null, r.text.slice(at, at + q.length)), r.text.slice(at + q.length));
      else span.append(r.text);
      const el = h('button', { class: 'result', type: 'button', 'data-id': r.id, 'data-press': true }, h('small', null, `${r.name} ・ ${shortTime(r.ts)}`), span);
      el.style.opacity = '0';
      setTimeout(() => play({ stiffness: 380, damping: 24 }, (p) => {
        el.style.transform = `translateY(${mix(10, 0, p).toFixed(2)}px)`;
        el.style.opacity = clamp(p * 1.6, 0, 1).toFixed(3);
      }, () => { el.style.transform = ''; el.style.opacity = ''; }), i * 25);
      return el;
    }));
  }

  /* ---------- members & moderation ---------- */
  function openMembersSheet() {
    const room = activeRoom();
    if (!room) return;
    wsSend({ type: 'members', room: room.s.id });
    sheet.membersBox = h('div', 'people', h('p', 'note', '読み込み中…'));
    openSheet('members', h('div', null, h('h2', null, 'メンバー'), h('p', 'sub', room.s.name), sheet.membersBox));
    renderMembersSheet();
  }
  function renderMembersSheet() {
    const room = activeRoom();
    if (sheet.name !== 'members' || !room?.members) return;
    const roleLabel = { owner: '作成者', admin: '管理者' };
    const parts = room.members.map((u) => {
      const a = avatar(u);
      if (u.online) a.classList.add('on');
      return h('button', { class: 'person', type: 'button', 'data-press': true, onclick: () => openPersonSheet(u) },
        a, h('b', null, u.id === state.me.id ? `${u.name}（あなた）` : u.name),
        u.role !== 'member' ? h('span', `role ${u.role}`, roleLabel[u.role]) : null,
        state.blocks.includes(u.id) ? h('span', 'role', 'ブロック中') : null);
    });
    if (room.banned?.length) {
      parts.push(h('h3', null, '追放したユーザー'));
      for (const u of room.banned) {
        parts.push(h('div', 'person', avatar(u), h('b', null, u.name), h('button', { class: 'pill-btn', type: 'button', 'data-press': true, onclick: () => wsSend({ type: 'unban', room: room.s.id, user: u.id }) }, '解除')));
      }
    }
    sheet.membersBox.replaceChildren(...parts);
  }
  function openPersonSheet(u) {
    const room = activeRoom();
    if (!room || !state.me) return;
    if (u.id === state.me.id) return openProfileSheet();
    const btn = (label, fn) => h('button', { class: 'ghost-btn', type: 'button', 'data-press': true, onclick: fn }, label);
    const isBlocked = state.blocks.includes(u.id);
    const items = [
      btn('メッセージを送る', () => {
        closeSheet();
        wsSend({ type: 'dm', user: u.id });
      }),
      btn(isBlocked ? 'ブロックを解除' : 'ブロックする', () => {
        wsSend({ type: 'block', user: u.id, on: !isBlocked });
        toast(isBlocked ? 'ブロックを解除しました' : 'ブロックしました');
        closeSheet();
      }),
    ];
    if (room.s.owner && u.role !== 'owner') {
      items.push(btn(u.role === 'admin' ? '管理者から外す' : '管理者にする', () => {
        wsSend({ type: 'promote', room: room.s.id, user: u.id, on: u.role !== 'admin' });
        openMembersSheet();
      }));
    }
    if (room.s.admin && u.role !== 'owner' && (u.role !== 'admin' || room.s.owner)) {
      items.push(confirmButton('ルームから退出させる', 'もう一度押すと退出させます', () => {
        wsSend({ type: 'kick', room: room.s.id, user: u.id });
        openMembersSheet();
      }));
      items.push(confirmButton('追放する（再参加できなくなります）', 'もう一度押すと追放します', () => {
        wsSend({ type: 'kick', room: room.s.id, user: u.id, ban: true });
        openMembersSheet();
      }));
    }
    openSheet('person', h('div', null, h('div', 'sheet-head', avatar(u), h('h2', null, u.name)), h('div', 'list-btns', items)));
  }

  /* ---------- profile, settings, transfer ---------- */
  function openProfileSheet() {
    const name = field('ニックネーム', { maxlength: 20, value: state.name, enterkeyhint: 'done' });
    const ps = pushState();
    let pushPart;
    if (ps === 'unsupported') pushPart = h('p', 'note', 'このブラウザはプッシュ通知に対応していません');
    else if (ps === 'install') {
      pushPart = h('div', null, h('p', 'note', 'iPhone / iPad では、ホーム画面に追加したアプリから通知を受け取れます'),
        h('div', 'list-btns', h('button', { class: 'ghost-btn', type: 'button', 'data-press': true, onclick: openInstallSheet }, 'ホーム画面に追加する方法')));
    } else if (ps === 'denied') pushPart = h('p', 'note', '通知がブラウザでブロックされています。サイトの設定から許可してください');
    else {
      pushPart = switchRow('プッシュ通知', 'アプリを閉じていても新着が届きます', ps === 'on', async (on) => {
        if (on) await enablePush();
        else await disablePush();
        const now = pushState();
        if ((now === 'on') !== on) pushPart.set(now === 'on', true);
      });
    }
    const themeBox = choice([['system', '自動'], ['light', 'ライト'], ['dark', 'ダーク']], themePref(), (v, e) => applyTheme(v, { x: e.clientX, y: e.clientY }));
    const form = h('form', { autocomplete: 'off' },
      h('div', 'sheet-head', avatar(state.me || { id: uid, name: state.name }), h('h2', null, 'プロフィール')),
      name.wrap,
      h('button', { class: 'primary', type: 'submit', 'data-press': true }, '名前を保存'),
      h('h3', null, '表示'), themeBox,
      h('h3', null, '通知'), pushPart,
      h('h3', null, '端末'),
      h('div', 'list-btns', h('button', { class: 'ghost-btn', type: 'button', 'data-press': true, onclick: openTransferSheet }, '別の端末に引き継ぐ')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = name.input.value.trim();
      if (!v) return shake(name.wrap);
      state.name = v;
      store.set('lq.name', v);
      wsSend({ type: 'rename', name: v });
      closeSheet();
      toast('保存しました');
    });
    openSheet('profile', form);
  }
  $('#profileBtn').addEventListener('click', openProfileSheet);

  function openTransferSheet() {
    const holder = h('div', null, h('p', 'note', 'コードを発行しています…'));
    sheet.transferBox = holder;
    openSheet('transfer', h('div', null,
      h('h2', null, '別の端末に引き継ぐ'),
      h('p', 'sub', '新しい端末でQRを読み取るか、コードを入力してください'),
      holder,
      h('p', 'note', 'コードは10分間・1回だけ使えます。引き継ぐと、新しい端末でも同じアカウントとルームが使えます。人に見せないでください。')));
    wsSend({ type: 'transfer', uid });
  }
  function renderTransfer(msg) {
    const box = sheet.name === 'transfer' && sheet.transferBox;
    if (!box) return;
    const url = `${location.origin}/?t=${msg.code}`;
    const left = h('p', 'note');
    const tick = () => {
      const s = Math.max(0, Math.round((msg.exp - Date.now()) / 1000));
      left.textContent = s ? `有効期限まで ${fmtDur(s)}` : '期限切れです。もう一度発行してください';
      if (s && sheet.name === 'transfer') setTimeout(tick, 1000);
    };
    tick();
    box.replaceChildren(qrBox(url), h('p', 'big-code', `${msg.code.slice(0, 4)} ${msg.code.slice(4)}`), h('div', 'btn-row', copyButton(() => msg.code)), left);
  }
  function openInstallSheet() {
    openSheet('install', h('div', null,
      h('h2', null, 'ホーム画面に追加'),
      h('p', 'sub', 'iPhone / iPad で通知を受け取るための準備です'),
      h('ol', 'ios-steps',
        h('li', null, 'Safari 下部の 共有ボタン（□に↑）をタップ'),
        h('li', null, '「ホーム画面に追加」を選ぶ'),
        h('li', null, '追加されたアイコンから開いて、通知をオンにする'))));
  }

  /* =====================================================================
     Push notifications
     ===================================================================== */
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('service worker:', err));
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'open' && e.data.room) {
        if (state.rooms.has(e.data.room)) openRoom(e.data.room);
        else handleLink({ room: e.data.room, pass: '' });
      }
    });
  }
  function pushState() {
    if (isIOS && !standalone && !pushSupported) return 'install';
    if (!pushSupported) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'granted' && !store.get('lq.push.off')) return 'on';
    return 'off';
  }
  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
  }
  function bytesToB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function syncPush() {
    if (pushState() !== 'on' || !state.vapid || !state.connected) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const key = sub?.options?.applicationServerKey;
      if (sub && key && bytesToB64(key) !== state.vapid) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.vapid) });
      wsSend({ type: 'push', sub: sub.toJSON() });
    } catch (err) {
      console.warn('push subscribe failed:', err);
    }
  }
  async function enablePush() {
    const ps = pushState();
    if (ps === 'install') return openInstallSheet();
    if (ps === 'unsupported') return toast('このブラウザは通知に対応していません');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      toast(perm === 'denied' ? '通知がブロックされました。ブラウザの設定から許可できます' : '通知はオフのままです');
      return renderNotifyCard();
    }
    store.del('lq.push.off');
    await syncPush();
    toast('通知をオンにしました');
    renderNotifyCard();
  }
  async function disablePush() {
    store.set('lq.push.off', '1');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        wsSend({ type: 'unpush', endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
    } catch { /* nothing to undo */ }
    toast('通知をオフにしました');
    renderNotifyCard();
  }
  const notifyCard = $('#notifyCard');
  function renderNotifyCard() {
    const ps = pushState();
    const show = (ps === 'off' || ps === 'install') && !store.get('lq.notify.dismissed') && !(ps === 'off' && store.get('lq.push.off'));
    if (ps === 'install') {
      $('#notifyTitle').textContent = 'ホーム画面に追加して通知を受け取る';
      $('#notifyBody').textContent = 'iPhoneではアプリとして追加すると通知が届きます';
      $('#notifyOn').textContent = '方法';
    }
    const was = !notifyCard.hidden;
    notifyCard.hidden = !show;
    if (show && !was) {
      play({ stiffness: 300, damping: 18 }, (p) => {
        notifyCard.style.transform = `translateY(${mix(-14, 0, p).toFixed(2)}px) scale(${mix(0.94, 1, p).toFixed(4)})`;
        notifyCard.style.opacity = clamp(p * 1.4, 0, 1).toFixed(3);
      }, () => { notifyCard.style.transform = ''; notifyCard.style.opacity = ''; });
    }
  }
  $('#notifyOn').addEventListener('click', () => enablePush());
  $('#notifyClose').addEventListener('click', () => {
    store.set('lq.notify.dismissed', '1');
    play({ stiffness: 420, damping: 30 }, (p) => {
      notifyCard.style.transform = `scale(${mix(1, 0.9, p).toFixed(4)})`;
      notifyCard.style.opacity = clamp(1 - p, 0, 1).toFixed(3);
    }, () => {
      notifyCard.hidden = true;
      notifyCard.style.transform = '';
      notifyCard.style.opacity = '';
    });
  });

  /* =====================================================================
     Connection
     ===================================================================== */
  function upsertRoom(s) {
    const room = state.rooms.get(s.id);
    if (room) room.s = s;
    else state.rooms.set(s.id, { s, messages: null, more: false, online: [], reads: {}, members: null, call: { peers: [] } });
  }
  function handleLink(link) {
    if (state.rooms.has(link.room)) return openRoom(link.room);
    state.link = link;
    wsSend({ type: 'peek', room: link.room });
  }
  function rebuildActive() {
    const room = activeRoom();
    if (room?.messages) renderMessages(room.messages, { keepBottom: !wasNearBottom });
  }

  const handlers = {
    ready(msg) {
      const first = !state.ready;
      state.ready = true;
      state.me = msg.you;
      state.blocks = msg.blocks || [];
      state.vapid = msg.vapid;
      state.ice = msg.ice || [];
      state.reactions = msg.reactions;
      const ids = new Set(msg.rooms.map((r) => r.id));
      for (const id of [...state.rooms.keys()]) if (!ids.has(id)) state.rooms.delete(id);
      for (const s of msg.rooms) upsertRoom(s);
      renderProfileButton();
      renderMine();
      syncPush();
      renderNotifyCard();
      if (state.tab === 'explore') wsSend({ type: 'explore', on: true });
      if (state.activeId) {
        if (state.rooms.has(state.activeId)) {
          wsSend({ type: 'open', room: state.activeId });
          if (activeRoom().s.kind === 'group') wsSend({ type: 'members', room: state.activeId });
          sendFocus();
          renderHeader();
        } else closeRoom();
      }
      if (first) {
        const params = new URLSearchParams(location.search);
        const r = params.get('r');
        const k = new URLSearchParams(location.hash.slice(1)).get('k') || '';
        if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
        if (r) {
          if (narrow.matches) history.replaceState(null, '', '/');
          handleLink({ room: r, pass: k });
        } else if (!narrow.matches && msg.rooms.length) openRoom(sortedMine()[0].id);
      }
    },
    you(msg) {
      const blocksChanged = JSON.stringify(msg.blocks || []) !== JSON.stringify(state.blocks);
      state.me = msg.you;
      state.blocks = msg.blocks || [];
      renderProfileButton();
      if (blocksChanged) {
        rebuildActive();
        renderPresence();
        renderMembersSheet();
      }
    },
    room(msg) {
      upsertRoom(msg.room);
      renderMine();
      if (msg.room.id === state.activeId) renderHeader();
    },
    created(msg) {
      createBusy = false;
      if (state.pendingCreatePass) store.set(`lq.pass.${msg.room}`, state.pendingCreatePass);
      state.pendingCreatePass = '';
      closeSheet();
      setTab('mine');
      openRoom(msg.room);
      if (!msg.dm) setTimeout(() => openInviteSheet(msg.room), 420);
    },
    joined(msg) {
      if (state.joinPass?.room === msg.room && state.joinPass.pass) store.set(`lq.pass.${msg.room}`, state.joinPass.pass);
      state.joinPass = null;
      if (sheet.name === `join:${msg.room}`) closeSheet();
      if (state.joinThenOpen === msg.room) {
        state.joinThenOpen = null;
        setTab('mine');
        openRoom(msg.room);
      }
    },
    peek(msg) {
      if (!state.link || state.link.room !== msg.id) return;
      const link = state.link;
      state.link = null;
      if (!msg.room) return toast('ルームが見つかりませんでした');
      if (msg.room.member) {
        upsertRoom(msg.room);
        return openRoom(msg.room.id);
      }
      openJoinSheet(msg.room, link.pass);
    },
    history(msg) {
      const room = state.rooms.get(msg.room);
      if (!room) return;
      const prev = room.messages;
      room.messages = msg.messages;
      room.more = msg.more;
      room.online = msg.online;
      room.reads = msg.reads || {};
      room.jumped = !!msg.jump;
      if (msg.summary) room.s = msg.summary;
      if (msg.call) room.call = msg.call;
      if (msg.room !== state.activeId) return;
      renderHeader();
      const same = !msg.jump && prev && prev.length === msg.messages.length && prev.at(-1)?.id === msg.messages.at(-1)?.id && prev[0]?.id === msg.messages[0]?.id;
      if (same) {
        for (const m of msg.messages) {
          const entry = state.entries.get(m.id);
          if (entry && JSON.stringify({ ...entry.data, localUrl: undefined }) !== JSON.stringify(m)) replaceRow(entry, m);
        }
        updateReceipts();
        markRead();
      } else renderMessages(msg.messages, { stagger: !prev, jump: msg.jump });
    },
    older(msg) {
      const room = state.rooms.get(msg.room);
      state.loadingOlder = false;
      loadMore.hidden = true;
      if (!room || !room.messages) return;
      room.more = msg.more;
      const known = new Set(room.messages.map((m) => m.id));
      room.messages = [...msg.messages.filter((m) => !known.has(m.id)), ...room.messages];
      if (msg.room === state.activeId && msg.messages.length) renderMessages(room.messages, { keepBottom: true });
    },
    msg({ room: roomId, message, cid }) {
      const room = state.rooms.get(roomId);
      if (!room) return;
      if (room.messages && !room.jumped) room.messages.push(message);
      const mineMsg = isMine(message);
      if (!message.sys) {
        room.s.last = { name: message.from.name, text: [...previewOf(message)].slice(0, 60).join(''), ts: message.ts };
        if (!mineMsg && !blocked(message) && !(roomId === state.activeId && document.visibilityState === 'visible' && nearBottom())) room.s.unread += 1;
        if (mineMsg && state.me) room.reads[state.me.id] = message.ts;
      }
      room.s.lastTs = message.ts;
      if (roomId === state.activeId) {
        const pending = cid && state.pending.get(cid);
        if (pending) {
          state.pending.delete(cid);
          pending.data = { ...message, localUrl: pending.data.localUrl };
          pending.row.dataset.id = message.id;
          pending.row.classList.remove('pending');
          $('time', pending.row).textContent = timeOf(message.ts);
          state.entries.set(message.id, pending);
          if (lastRendered && lastRendered.cid === cid) lastRendered = message;
        } else if (!room.jumped) {
          if (!message.sys) setTyper(roomId, message.from.id, '', false);
          addLive(message);
        } else if (!message.sys && !mineMsg) {
          setUnread(state.unread + 1);
          updateToBottom();
        }
        markRead();
      } else if (cid) state.pending.delete(cid);
      renderMine();
    },
    update({ room: roomId, message }) {
      const room = state.rooms.get(roomId);
      if (!room) return;
      const idx = room.messages?.findIndex((m) => m.id === message.id) ?? -1;
      if (idx >= 0) room.messages[idx] = message;
      if (roomId !== state.activeId) return;
      const entry = state.entries.get(message.id);
      if (entry) replaceRow(entry, { ...message, localUrl: message.media ? entry.data.localUrl : undefined });
      if (popoverFor?.data.id === message.id) closePopover();
      if (state.editing?.data.id === message.id && message.deleted) setEditing(null);
    },
    react(msg) {
      const room = state.rooms.get(msg.room);
      const m = room?.messages?.find((x) => x.id === msg.id);
      if (m) m.reactions = msg.reactions;
      if (msg.room !== state.activeId) return;
      const entry = state.entries.get(msg.id);
      if (!entry) return;
      entry.data.reactions = msg.reactions;
      renderReacts(entry);
    },
    read(msg) {
      const room = state.rooms.get(msg.room);
      if (!room) return;
      room.reads[msg.user] = msg.ts;
      if (msg.room === state.activeId) updateReceipts();
    },
    typing(msg) { setTyper(msg.room, msg.id, msg.name, msg.on); },
    presence(msg) {
      const room = state.rooms.get(msg.room);
      if (!room) return;
      room.online = msg.online;
      room.s.online = msg.online.length;
      room.s.members = msg.members;
      if (msg.room === state.activeId) renderPresence();
    },
    members(msg) {
      const room = state.rooms.get(msg.room);
      if (!room) return;
      room.members = msg.list;
      room.banned = msg.banned || [];
      if (msg.room === state.activeId) renderMembersSheet();
    },
    search(msg) { if (msg.room === state.activeId) renderSearch(msg); },
    removed(msg) {
      const room = state.rooms.get(msg.room);
      if (!room) return;
      state.rooms.delete(msg.room);
      if (LynqCall.room === msg.room) LynqCall.leave(true);
      if (msg.room === state.activeId) {
        if (narrow.matches && history.state?.room) history.replaceState(null, '', '/');
        closeSheet();
        closeRoom();
      }
      renderMine();
      const text = { deleted: `「${room.s.name}」は削除されました`, kicked: `「${room.s.name}」から退出させられました`, banned: `「${room.s.name}」から追放されました`, left: `「${room.s.name}」から退出しました` };
      toast(text[msg.reason] || text.left);
    },
    explore(msg) {
      state.explore = msg.rooms;
      renderExplore();
    },
    transfer(msg) { renderTransfer(msg); },
    call(msg) {
      const room = state.rooms.get(msg.room);
      if (room) room.call = { peers: msg.peers, startedAt: msg.startedAt };
      LynqCall.handle(msg);
      if (msg.room === state.activeId) renderCallBanner();
    },
    'call-joined': (msg) => LynqCall.handle(msg),
    'call-ended': (msg) => LynqCall.handle(msg),
    signal: (msg) => LynqCall.handle(msg),
    error(msg) {
      if (msg.op === 'join' && msg.code === 'pass') {
        const f = sheetBody.querySelector('.field');
        if (f) {
          f.classList.add('error');
          $('.field-note', f).textContent = '合言葉がちがいます';
          shake(f);
          $('input', f).select();
        }
        return;
      }
      if (msg.op === 'join' && msg.code === 'banned') return toast('このルームには参加できません');
      if (msg.op === 'join' && msg.code === 'notfound') return toast('ルームが見つかりませんでした');
      if (msg.op === 'jump') return toast('そのメッセージは見つかりませんでした');
      if (msg.op === 'open' && msg.code === 'notfound') {
        state.rooms.delete(msg.room);
        if (msg.room === state.activeId) closeRoom();
        return renderMine();
      }
      if (msg.op === 'create') {
        createBusy = false;
        return toast(msg.code === 'full' ? 'ルームが上限に達しています' : msg.code === 'rate' ? '少し時間をおいてください' : '作成できませんでした');
      }
      const pending = msg.cid && state.pending.get(msg.cid);
      if (pending) {
        state.pending.delete(msg.cid);
        pending.row.remove();
        if (!input.value && pending.room === state.activeId && pending.data.text && !pending.data.media) {
          input.value = pending.data.text;
          autosize();
          updateSend();
        }
      }
      if (msg.code === 'blocked') toast('このユーザーにはメッセージを送れません');
      else if (msg.code === 'rate') toast('操作が速すぎます。少し待ってください');
      else if (msg.code === 'media') toast('ファイルを送信できませんでした');
    },
  };

  function connect() {
    clearTimeout(state.retryTimer);
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    state.ws = ws;
    ws.addEventListener('open', () => {
      state.connected = true;
      state.retry = 0;
      ws.send(JSON.stringify({ type: 'hello', uid, name: state.name }));
      updateSend();
    });
    ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      try {
        handlers[msg.type]?.(msg);
      } catch (err) {
        console.error('handler', msg.type, err);
      }
    });
    ws.addEventListener('close', () => {
      if (state.ws !== ws) return;
      state.connected = false;
      updateSend();
      for (const [roomId, map] of state.typers) for (const id of [...map.keys()]) setTyper(roomId, id, '', false);
      if (state.activeId) setStatus('再接続中…', false);
      if (LynqCall.room) LynqCall.leave(true);
      state.retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** state.retry++));
    });
  }
  function wake() {
    if (state.name && !state.connected && state.ws?.readyState !== WebSocket.CONNECTING) connect();
  }
  addEventListener('online', wake);
  function renderProfileButton() {
    $('#profileBtn').replaceChildren(avatar(state.me || { id: uid, name: state.name }));
  }

  /* ---------- redeem a transfer code (before we have an identity) ---------- */
  function redeem(code) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'redeem', code }));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        clearTimeout(timer);
        ws.close();
        if (msg.type === 'redeemed') resolve(msg);
        else reject(new Error(msg.code || 'failed'));
      };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('network')); };
    });
  }
  async function applyTransfer(code) {
    const res = await redeem(code);
    uid = res.uid;
    store.set('lq.uid', uid);
    state.name = res.name;
    store.set('lq.name', res.name);
  }

  /* =====================================================================
     Boot
     ===================================================================== */
  function startShell(animate) {
    $('#onboard').hidden = true;
    shell.hidden = false;
    renderProfileButton();
    renderNotifyCard();
    connect();
    if (!animate) return;
    play({ stiffness: 240, damping: 20 }, (p) => {
      shell.style.transform = `translateY(${mix(60, 0, p).toFixed(2)}px) scale(${mix(0.92, 1, p).toFixed(4)})`;
      shell.style.opacity = clamp(p * 1.4, 0, 1).toFixed(3);
    }, () => { shell.style.transform = ''; shell.style.opacity = ''; });
  }
  function showOnboard() {
    const onboard = $('#onboard');
    const card = $('.card', onboard);
    onboard.hidden = false;
    play({ stiffness: 260, damping: 18 }, (p) => {
      card.style.transform = `translateY(${mix(40, 0, p).toFixed(2)}px) scale(${mix(0.9, 1, p).toFixed(4)})`;
      card.style.opacity = clamp(p * 1.5, 0, 1).toFixed(3);
    }, () => { card.style.transform = ''; card.style.opacity = ''; });
    if (!coarse.matches) $('#onboardName').focus();
    const leave = (then) => play({ stiffness: 320, damping: 26 }, (p) => {
      card.style.transform = `scale(${mix(1, 0.86, p).toFixed(4)})`;
      card.style.opacity = clamp(1 - p * 1.4, 0, 1).toFixed(3);
    }, then);
    $('#onboardForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#onboardName').value.trim();
      if (!name) return shake($('#onboardName').closest('.field'));
      state.name = name;
      store.set('lq.name', name);
      leave(() => startShell(true));
    });
    $('#haveCode').addEventListener('click', () => {
      const code = field('引き継ぎコード', { maxlength: 9, placeholder: 'XXXX XXXX', autocomplete: 'off', autocapitalize: 'characters' }, '', 'code-input');
      const form = h('form', { autocomplete: 'off' },
        h('h2', null, '端末を引き継ぐ'),
        h('p', 'sub', '元の端末の「プロフィール → 別の端末に引き継ぐ」で表示されるコードを入力するか、そのQRを読み取ってください'),
        code.wrap,
        h('button', { class: 'primary', type: 'submit', 'data-press': true }, '引き継ぐ'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await applyTransfer(code.input.value);
          closeSheet();
          toast(`${state.name}さん、おかえりなさい`);
          leave(() => startShell(true));
        } catch {
          code.wrap.classList.add('error');
          code.note.textContent = 'コードが正しくないか、期限が切れています';
          shake(code.wrap);
        }
      });
      openSheet('redeem', form);
    });
  }

  (async () => {
    const t = new URLSearchParams(location.search).get('t');
    if (t) {
      history.replaceState(null, '', '/');
      try {
        await applyTransfer(t);
        toast(`${state.name}さん、引き継ぎが完了しました`);
      } catch {
        toast('引き継ぎコードが正しくないか、期限が切れています');
      }
    }
    if (state.name) startShell(false);
    else showOnboard();
  })();
})();
