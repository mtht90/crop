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
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
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

  /* =====================================================================
     Spring engine — every spring is interruptible and keeps its velocity,
     so gestures and incoming events can retarget motion mid-flight.
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
      } else {
        s.onUpdate(s.x, s.v);
      }
    }
    rafId = running.size ? requestAnimationFrame(frame) : 0;
  }

  // One-shot 0→1 spring; `render` receives progress that may overshoot 1.
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

  /* ---------- press feedback on anything with [data-press] ---------- */
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
    pressSpring(node).to(node.classList.contains('room-item') ? 0.96 : 0.9, { stiffness: 700, damping: 34 });
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

  let uid = store.get('ic.uid');
  if (!uid || uid.length < 16) {
    uid = randomId();
    store.set('ic.uid', uid);
  }

  const state = {
    ws: null,
    connected: false,
    ready: false,
    retry: 0,
    retryTimer: 0,
    name: store.get('ic.name') || '',
    me: null,
    vapid: null,
    reactions: ['💙'],
    rooms: new Map(), // id -> { s: summary, messages: [] | null, online: [] }
    explore: [],
    tab: 'mine',
    activeId: null,
    pushedRoom: false,
    drafts: new Map(),
    link: null, // { room, pass } from an invite URL
    joinThenOpen: null,
    // active room view
    entries: new Map(),
    pending: new Map(),
    last: null,
    reply: null,
    unread: 0,
    typers: new Map(), // roomId -> Map(userId -> { name, timer })
  };

  function avatar(user) {
    const node = h('span', 'avatar', initial(user.name));
    node.style.setProperty('--h', hueOf(user.id));
    node.title = user.name;
    return node;
  }
  function roomAvatar(s) {
    const node = h('span', 'room-ava', initial(s.name));
    node.style.setProperty('--h', hueOf(s.id));
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
    reply: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M10 8L5 13l5 5M5 13h9a5 5 0 005-5V6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    smile: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5v.5M15 9.5v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    bubble: '<svg viewBox="0 0 32 32"><path fill="#fff" d="M16 4C8.8 4 3 9 3 15.2c0 3.4 1.8 6.5 4.6 8.5L6.5 28l5-2.3c1.4.4 2.9.6 4.5.6 7.2 0 13-5 13-11.1S23.2 4 16 4z"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5M5 12v6.5A2.5 2.5 0 007.5 21h9a2.5 2.5 0 002.5-2.5V12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* =====================================================================
     Mobile navigation — the chat pane slides over the list with a spring
     and can be dragged back from the left edge.
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
    const dt = Math.max(1, now - edge.t);
    edge.vx = mix(edge.vx, (e.clientX - (edge.lastX ?? edge.x)) / dt, 0.6);
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
    const w = chatPane.clientWidth;
    nav.v = (-g.vx * 1000) / w;
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
     Sidebar — joined rooms, public rooms, segmented control
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

  const itemNodes = new Map(); // `${mode}:${id}` -> element
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
      preview = s.last ? `${s.last.name}: ${s.last.text}` : 'まだメッセージはありません';
      if (s.unread) right = h('span', 'count', s.unread > 99 ? '99+' : String(s.unread));
    } else {
      preview = `メンバー ${s.members}人`;
      if (s.online) preview += ` ・ ${s.online}人がオンライン`;
      right = s.member ? null : h('span', 'join-tag', '参加');
    }
    const top = h('span', 'room-top', h('b', null, s.name), flags(s), h('time', null, shortTime(s.last?.ts)));
    node.replaceChildren(roomAvatar(s), h('span', 'room-main', top, h('span', 'room-sub', h('span', null, preview), right)));
    if (right && right.classList.contains('count') && s.unread !== prevUnread) popIn(right, { stiffness: 480, damping: 13 }, prevUnread ? 1.4 : 0);
  }

  function renderList(container, items, mode) {
    const before = new Map();
    for (const child of container.children) before.set(child, child.getBoundingClientRect().top);
    const keep = new Set();
    const fresh = [];
    items.forEach((s) => {
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
      container.append(node); // re-append in sorted order
    });
    for (const child of [...container.children]) {
      if (!keep.has(child)) {
        itemNodes.delete(`${mode}:${child.dataset.id}`);
        child.remove();
      }
    }
    if (container.hidden) return;
    // FLIP: slide items from where they were to where they are now.
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

  function sortedMine() {
    return [...state.rooms.values()].map((r) => r.s).sort((a, b) => (b.last?.ts || b.lastTs) - (a.last?.ts || a.lastTs));
  }

  function renderMine() {
    renderList(mineList, sortedMine(), 'mine');
    $('#mineEmpty').hidden = state.tab !== 'mine' || state.rooms.size > 0 || !state.ready;
    const total = [...state.rooms.values()].reduce((n, r) => n + (r.s.muted ? 0 : r.s.unread), 0);
    $('#mineBadge').textContent = total ? String(Math.min(total, 99)) : '';
    document.title = total ? `(${total}) inachat` : state.activeId ? `${state.rooms.get(state.activeId)?.s.name} · inachat` : 'inachat';
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
    if (!item) return;
    const s = state.explore.find((r) => r.id === item.dataset.id);
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
    state.activeId = id;
    $('#emptyPane').hidden = true;
    roomView.hidden = false;

    if (switching) {
      input.value = state.drafts.get(id) || '';
      autosize();
      updateSend();
      setReply(null);
      renderHeader();
      renderTyping();
      renderMessages(room.messages || [], true);
      wsSend({ type: 'open', room: id });
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
    } else {
      history.replaceState({ room: id }, '', url);
    }
    if (!coarse.matches) input.focus({ preventScroll: true });
  }

  function closeRoom() {
    if (state.activeId) state.drafts.set(state.activeId, input.value);
    closePopover();
    state.activeId = null;
    state.pushedRoom = false;
    sendFocus();
    if (history.state?.room) history.replaceState(null, '', '/');
    renderMine();
    if (narrow.matches) {
      showListPane();
    } else {
      roomView.hidden = true;
      $('#emptyPane').hidden = false;
    }
  }

  function sendFocus() {
    wsSend({ type: 'focus', room: state.activeId, visible: document.visibilityState === 'visible' });
  }

  function renderHeader() {
    const room = state.rooms.get(state.activeId);
    if (!room) return;
    $('#roomName').textContent = room.s.name;
    $('#roomFlags').replaceWith(Object.assign(flags(room.s), { id: 'roomFlags' }));
    renderPresence();
  }

  function renderPresence() {
    const room = state.rooms.get(state.activeId);
    if (!room) return;
    const box = $('#avatars');
    const known = new Set([...box.children].map((n) => n.dataset.id));
    box.replaceChildren();
    const online = room.online || [];
    online.slice(0, 4).forEach((m) => {
      const node = avatar(m);
      node.dataset.id = m.id;
      box.append(node);
      if (!known.has(m.id)) popIn(node);
    });
    if (online.length > 4) box.append(h('span', 'avatar more', `+${online.length - 4}`));
    if (!state.connected) setStatus('再接続中…', false);
    else setStatus(`${online.length}人がオンライン ・ メンバー${room.s.members}人`, true);
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
      const room = state.rooms.get(state.activeId);
      if (!room || document.visibilityState !== 'visible' || !nearBottom()) return;
      const msgs = room.messages || [];
      const lastTs = msgs.length ? msgs[msgs.length - 1].ts : 0;
      if (!lastTs) return;
      if (room.s.unread || lastTs > (room.readTs || 0)) {
        room.readTs = lastTs;
        room.s.unread = 0;
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
     Scrolling — the list is shifted with a spring instead of jumping.
     ===================================================================== */
  const listShift = new Spring(0, (v) => { list.style.translate = v ? `0 ${v.toFixed(2)}px` : ''; }, {
    stiffness: 340, damping: 30, precision: 0.1,
  });
  const distanceFromBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight - Math.max(0, listShift.x);
  const nearBottom = () => distanceFromBottom() < 90;

  function setUnread(n) {
    state.unread = n;
    unreadBadge.textContent = n ? String(Math.min(n, 99)) : '';
  }
  function updateToBottom() {
    const away = distanceFromBottom() > 240;
    toBottom.classList.toggle('show', away || state.unread > 0);
    if (state.unread && nearBottom()) setUnread(0);
  }
  let wasNearBottom = true;
  scroller.addEventListener('scroll', () => {
    updateToBottom();
    closePopover();
    wasNearBottom = nearBottom();
    if (wasNearBottom) markRead();
  }, { passive: true });
  addEventListener('resize', () => { if (wasNearBottom) scroller.scrollTop = scroller.scrollHeight; });

  const scrollSpring = new Spring(0, (v) => { scroller.scrollTop = v; }, { stiffness: 220, damping: 28, precision: 0.5 });
  toBottom.addEventListener('click', () => {
    setUnread(0);
    scrollSpring.x = scroller.scrollTop;
    scrollSpring.v = 0;
    scrollSpring.to(scroller.scrollHeight - scroller.clientHeight);
  });
  for (const type of ['wheel', 'touchstart']) {
    scroller.addEventListener(type, () => scrollSpring.stop(), { passive: true });
  }

  /* =====================================================================
     Messages
     ===================================================================== */
  const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
  function fillText(node, text) {
    for (const part of text.split(URL_RE)) {
      if (!part) continue;
      if (/^https?:\/\//.test(part)) node.append(h('a', { href: part, target: '_blank', rel: 'noopener noreferrer' }, part));
      else node.append(part);
    }
  }

  function buildRow(m) {
    if (m.sys) return h('div', 'sys', m.text);
    const mine = m.from.id === state.me.id;
    const prev = state.last;
    const cont = prev && !prev.sys && prev.from.id === m.from.id && m.ts - prev.ts < 180000;
    const row = h('div', `msg ${mine ? 'me' : 'them'}${cont ? ' cont' : ''}`);
    if (m.id) row.dataset.id = m.id;

    const bubble = h('div', 'bubble');
    if (m.replyTo) {
      const quote = h('span', 'quote', h('b', null, m.replyTo.name), m.replyTo.text);
      quote.dataset.target = m.replyTo.id;
      bubble.append(quote);
    }
    fillText(bubble, m.text);

    const side = h('div', 'side-meta', h('time', null, timeOf(m.ts)));
    for (const [action, icon, label] of [['react', ICONS.smile, 'リアクション'], ['reply', ICONS.reply, '返信']]) {
      side.append(h('button', { class: 'act', type: 'button', 'data-action': action, 'aria-label': label, html: icon }));
    }
    const col = h('div', 'col', h('span', 'name', m.from.name), h('div', 'line', bubble, side), h('div', 'reacts'));
    row.append(avatar(m.from), col, h('span', { class: 'swipe-hint', html: ICONS.reply }));
    return row;
  }

  function enter(row, mine, delay = 0) {
    const fromY = mine ? 46 : 16;
    const start = () => play(
      { stiffness: mine ? 360 : 320, damping: mine ? 19 : 21 },
      (p) => {
        row.style.transform = `translateY(${mix(fromY, 0, p).toFixed(2)}px) scale(${mix(0.55, 1, p).toFixed(4)})`;
        row.style.opacity = clamp(p * 1.8, 0, 1).toFixed(3);
      },
      () => { row.style.transform = ''; row.style.opacity = ''; },
    );
    if (delay) {
      row.style.opacity = '0';
      setTimeout(start, delay);
    } else start();
  }

  function renderMessages(messages, stagger) {
    state.entries.clear();
    state.last = null;
    list.replaceChildren();
    setUnread(0);
    for (const m of messages) appendRow(m);
    for (const entry of state.pending.values()) {
      if (entry.room === state.activeId) {
        list.append(entry.row);
        state.last = entry.data;
      }
    }
    listShift.jump(0);
    scroller.scrollTop = scroller.scrollHeight;
    wasNearBottom = true;
    updateToBottom();
    if (stagger) {
      [...list.children].slice(-8).forEach((row, i) => enter(row, row.classList.contains('me'), 30 + i * 32));
    }
    markRead();
  }

  function appendRow(m, { pending = false } = {}) {
    const row = buildRow(m);
    const entry = { data: m, row, counts: {}, room: state.activeId };
    if (!m.sys) {
      if (pending) {
        row.classList.add('pending');
        state.pending.set(m.cid, entry);
      } else state.entries.set(m.id, entry);
    }
    state.last = m;
    list.append(row);
    if (!m.sys) renderReacts(entry, false);
    return entry;
  }

  function addLive(m, opts = {}) {
    const mine = !m.sys && m.from.id === state.me.id;
    const stick = mine || nearBottom();
    const entry = appendRow(m, opts);
    const row = entry.row;
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

  function renderReacts(entry, animate = true) {
    const box = $('.reacts', entry.row);
    const reactions = entry.data.reactions || {};
    const before = entry.counts;
    const counts = {};
    box.replaceChildren();
    for (const emoji of state.reactions) {
      const users = reactions[emoji];
      if (!users || !users.length) continue;
      counts[emoji] = users.length;
      const chip = h('button', { class: `chip${users.includes(state.me.id) ? ' mine' : ''}`, type: 'button', 'data-emoji': emoji, 'data-press': true },
        emoji, h('span', null, String(users.length)));
      box.append(chip);
      if (animate && before[emoji] !== users.length) popIn(chip, { stiffness: 420, damping: 14 }, before[emoji] ? 1.35 : 0);
    }
    entry.counts = counts;
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

  /* ---------- reply ---------- */
  function setReply(entry) {
    state.reply = entry ? { id: entry.data.id, name: entry.data.from.name, text: entry.data.text } : null;
    if (entry) {
      $('#replyName').textContent = entry.data.from.name;
      $('#replyText').textContent = entry.data.text;
      input.focus({ preventScroll: true });
    }
    replyBar.classList.toggle('show', !!entry);
  }
  $('#replyCancel').addEventListener('click', () => setReply(null));

  /* ---------- reaction popover ---------- */
  let popoverFor = null;
  function closePopover() {
    if (!popoverFor) return;
    popoverFor.row.classList.remove('active');
    popoverFor = null;
    popover.hidden = true;
  }
  function openPopover(entry) {
    closePopover();
    popoverFor = entry;
    entry.row.classList.add('active');
    const items = state.reactions.map((emoji) => h('button', { type: 'button', 'data-emoji': emoji, 'data-press': true }, emoji));
    const reply = h('button', { type: 'button', 'data-reply': true, 'data-press': true, 'aria-label': '返信', html: ICONS.reply.replace(/16/g, '20') });
    popover.replaceChildren(...items, h('span', 'sep'), reply);
    items.push(reply);
    popover.hidden = false;

    const rect = $('.bubble', entry.row).getBoundingClientRect();
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
    items.forEach((btn, i) => {
      btn.style.transform = 'scale(0)';
      setTimeout(() => play({ stiffness: 460, damping: 15 }, (p) => { btn.style.transform = `scale(${p.toFixed(4)})`; }), 30 + i * 28);
    });
  }
  popover.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !popoverFor) return;
    const entry = popoverFor;
    closePopover();
    if (btn.dataset.emoji) react(entry.data.id, btn.dataset.emoji, $('.bubble', entry.row));
    else setReply(entry);
  });
  document.addEventListener('pointerdown', (e) => {
    if (popoverFor && !popover.contains(e.target) && !e.target.closest('.act')) closePopover();
  });

  /* ---------- list interactions: buttons, taps, swipe-to-reply ---------- */
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
        target.row.classList.remove('flash');
        void target.row.offsetWidth;
        target.row.classList.add('flash');
      }
      return;
    }
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
    const bubble = e.target.closest('.bubble');
    const entry = bubble && entryOf(bubble);
    if (!entry || coarse.matches) return;
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
    gesture = {
      entry, id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target,
      dragging: false, armed: false, moved: false, wasOpen: popoverFor === entry,
    };
  });
  list.addEventListener('pointermove', (e) => {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;
    if (!g.dragging) {
      if (dx < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      g.dragging = true;
      g.x = e.clientX;
      dragSprings.get(g.entry.row)?.stop();
      try { g.entry.row.setPointerCapture(g.id); } catch { /* pointer already gone */ }
      closePopover();
    }
    const raw = Math.max(0, e.clientX - g.x);
    const x = raw < SWIPE_AT + 12 ? raw : SWIPE_AT + 12 + (raw - SWIPE_AT - 12) * 0.22; // rubber band
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
    const bubble = g.target.closest?.('.bubble');
    if (!bubble || g.target.closest('a, .quote')) return;
    const now = performance.now();
    if (lastTap.id === g.entry.data.id && now - lastTap.time < 420) {
      lastTap = { id: null, time: 0 };
      closePopover();
      react(g.entry.data.id, state.reactions[0], bubble);
    } else {
      lastTap = { id: g.entry.data.id, time: now };
      // The outside-press handler already closed it; a tap on the same bubble just dismisses.
      if (!g.wasOpen) openPopover(g.entry);
    }
  }
  list.addEventListener('pointerup', (e) => endGesture(e, false));
  list.addEventListener('pointercancel', (e) => endGesture(e, true));

  /* =====================================================================
     Composer
     ===================================================================== */
  function autosize() {
    const stick = nearBottom();
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 3, 132)}px`;
    if (stick) scroller.scrollTop = scroller.scrollHeight;
  }
  const canSend = () => state.connected && input.value.trim().length > 0;
  const updateSend = () => sendBtn.classList.toggle('ready', canSend());

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

  function send() {
    const text = input.value.trim();
    if (!text || !state.activeId) return;
    const cid = randomId();
    if (!wsSend({ type: 'msg', room: state.activeId, text, cid, replyTo: state.reply?.id })) {
      return toast('接続が切れています。再接続中…');
    }
    addLive({
      cid, from: state.me, text, ts: Date.now(), reactions: {},
      replyTo: state.reply && { ...state.reply, text: [...state.reply.text].slice(0, 80).join('') },
    }, { pending: true });
    input.value = '';
    state.drafts.delete(state.activeId);
    autosize();
    setReply(null);
    updateSend();
    clearTimeout(typingStop);
    sendTyping(false);
    sendBtn.classList.remove('fly');
    void sendBtn.offsetWidth;
    sendBtn.classList.add('fly');
  }

  input.addEventListener('input', () => {
    autosize();
    updateSend();
    sendTyping(input.value.length > 0);
    clearTimeout(typingStop);
    typingStop = setTimeout(() => sendTyping(false), 3000);
  });
  input.addEventListener('keydown', (e) => {
    // Enter sends on desktop; never while an IME composition is being confirmed.
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229 || coarse.matches) return;
    e.preventDefault();
    send();
  });
  sendBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the keyboard open
  sendBtn.addEventListener('click', send);

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
    if (on) map.set(id, { name, timer: setTimeout(() => setTyper(roomId, id, name, false), 5000) });
    else map.delete(id);
    if (roomId === state.activeId) renderTyping();
  }

  /* =====================================================================
     Sheets — bottom sheet on phones (drag to dismiss), modal on desktop
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
    } else {
      sheetSpring.to(1, { stiffness: 330, damping: 27 });
    }
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
    if (velocity && narrow.matches) {
      // Continue the drag gesture off-screen with its own momentum.
      sheetDrag.v = velocity;
      sheetDrag.onRest = finishClose;
      sheetDrag.to(sheetEl.offsetHeight + 40, { stiffness: 260, damping: 30 });
    } else {
      sheetSpring.onRest = finishClose;
      sheetSpring.to(0, { stiffness: 380, damping: 36 });
    }
    function finishClose() {
      if (sheet.open) return;
      sheetLayer.hidden = true;
      sheetSpring.jump(0);
      sheetDrag.jump(0);
      scrim.style.opacity = '';
    }
    done?.();
  }
  scrim.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (sheet.open) closeSheet();
    else {
      closePopover();
      setReply(null);
    }
  });

  let sheetGesture = null;
  sheetEl.addEventListener('pointerdown', (e) => {
    if (!narrow.matches || e.pointerType === 'mouse') return;
    const onGrab = e.target.closest('.grab');
    if (!onGrab && (sheetBody.scrollTop > 0 || e.target.closest('input, textarea, .switch-row'))) return;
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
  function field(label, attrs, note) {
    const inputEl = h('input', attrs);
    const noteEl = note != null ? h('small', 'field-note', note) : null;
    const wrap = h('label', 'field', h('span', null, label), inputEl, noteEl);
    return { wrap, input: inputEl, note: noteEl };
  }
  function switchRow(title, desc, on, onChange) {
    const sw = h('span', { class: `switch${on ? ' on' : ''}`, 'aria-hidden': 'true' });
    const row = h('button', { class: 'switch-row', type: 'button', role: 'switch', 'aria-checked': String(on), 'data-press': true },
      h('span', 'txt', h('b', null, title), desc ? h('small', null, desc) : null), sw);
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
      submit,
    );
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

  /* ---------- invite (QR) ---------- */
  function inviteUrl(id, pass) {
    const url = new URL(`/?r=${encodeURIComponent(id)}`, location.origin);
    if (pass) url.hash = `k=${encodeURIComponent(pass)}`;
    return url.href;
  }

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
    return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="招待用QRコード"><defs><linearGradient id="qg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b56c9"/><stop offset="1" stop-color="#5c9dff"/></linearGradient></defs><g fill="url(#qg)">${dots}</g>${finders}</svg>`;
  }

  function openInviteSheet(id) {
    const room = state.rooms.get(id);
    if (!room) return;
    const knownPass = store.get(`ic.pass.${id}`);
    let includePass = false;
    const qrBox = h('div', 'qr-wrap');
    const linkText = h('code');
    const render = () => {
      const url = inviteUrl(id, includePass ? knownPass : '');
      qrBox.innerHTML = qrSvg(url);
      qrBox.append(h('span', { class: 'qr-logo', html: ICONS.bubble }));
      linkText.textContent = url;
      return url;
    };
    let url = render();
    const copy = h('button', { class: 'pill-btn', type: 'button', 'data-press': true }, 'コピー');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast('招待リンクをコピーしました');
      } catch {
        toast('コピーできませんでした');
      }
    });
    const shareBtn = navigator.share
      ? h('button', { class: 'ghost-btn', type: 'button', 'data-press': true, html: `${ICONS.share}<span style="margin-left:6px">リンクを共有</span>` })
      : null;
    shareBtn?.addEventListener('click', () => {
      navigator.share({ title: room.s.name, text: `「${room.s.name}」に参加しよう`, url }).catch(() => {});
    });
    shareBtn?.style.setProperty('display', 'inline-flex');
    shareBtn?.style.setProperty('align-items', 'center');
    shareBtn?.style.setProperty('justify-content', 'center');

    let passPart = null;
    if (room.s.locked) {
      passPart = knownPass
        ? switchRow('合言葉もリンクに含める', 'QRを読むだけで参加できるようになります', false, (on) => {
          includePass = on;
          url = render();
        })
        : h('p', 'note', 'このルームには合言葉があります。合言葉は別に伝えてください。');
    }

    openSheet('invite', h('div', null,
      h('h2', null, '友だちを招待'),
      h('p', 'sub', `カメラでQRを読み取ると「${room.s.name}」に参加できます`),
      qrBox,
      h('div', 'link-box', linkText, copy),
      passPart,
      shareBtn ? h('div', 'btn-row', shareBtn) : null,
    ));
  }
  $('#inviteBtn').addEventListener('click', () => state.activeId && openInviteSheet(state.activeId));

  /* ---------- join (from link or explore) ---------- */
  function openJoinSheet(s, prefill = '') {
    const pass = s.locked ? field('合言葉', { maxlength: 32, placeholder: '合言葉を入力', autocomplete: 'off', value: prefill || null }, '') : null;
    const submit = h('button', { class: 'primary', type: 'submit', 'data-press': true }, '参加する');
    const meta = h('div', 'meta-row',
      h('span', { class: 'tag', html: `${ICONS.people}<span>メンバー ${s.members}人</span>` }),
      s.online ? h('span', 'tag', h('span', 'online-tag', h('i'), `${s.online}人がオンライン`)) : null,
      s.locked ? h('span', { class: 'tag', html: `${ICONS.lock}<span>合言葉つき</span>` }) : null,
    );
    const form = h('form', { autocomplete: 'off' },
      h('div', 'sheet-head', roomAvatar(s), h('h2', null, s.name)),
      meta,
      pass?.wrap,
      submit,
    );
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
    const room = state.rooms.get(state.activeId);
    if (!room) return;
    const s = room.s;
    const id = s.id;
    const meta = h('div', 'meta-row',
      h('span', { class: 'tag', html: `${s.isPublic ? ICONS.globe : ICONS.link}<span>${s.isPublic ? '公開ルーム' : '招待制'}</span>` }),
      s.locked ? h('span', { class: 'tag', html: `${ICONS.lock}<span>合言葉つき</span>` }) : null,
      h('span', { class: 'tag', html: `${ICONS.people}<span>メンバー ${s.members}人</span>` }),
    );
    const notify = switchRow('このルームの通知', s.muted ? 'オフ' : '新着メッセージを通知します', !s.muted, (on) => {
      wsSend({ type: 'mute', room: id, on: !on });
      notify.querySelector('small').textContent = on ? '新着メッセージを通知します' : 'オフ';
    });
    const invite = h('button', { class: 'ghost-btn', type: 'button', 'data-press': true }, 'QRで招待する');
    invite.addEventListener('click', () => openInviteSheet(id));
    const leave = confirmButton('ルームを退出', 'もう一度押すと退出します', () => {
      wsSend({ type: 'leave', room: id });
      closeSheet();
    });
    const del = s.owner && id !== 'lobby'
      ? confirmButton('ルームを削除', '全員のルームから消えます。押して削除', () => {
        wsSend({ type: 'delete', room: id });
        closeSheet();
      })
      : null;
    openSheet('menu', h('div', null,
      h('div', 'sheet-head', roomAvatar(s), h('h2', null, s.name)),
      meta,
      notify,
      h('div', 'list-btns', invite, leave, del),
    ));
  }
  $('#menuBtn').addEventListener('click', openRoomMenu);
  $('#roomTitle').addEventListener('click', openRoomMenu);

  /* ---------- profile & settings ---------- */
  function openProfileSheet() {
    const name = field('ニックネーム', { maxlength: 20, value: state.name, enterkeyhint: 'done' });
    const save = h('button', { class: 'primary', type: 'submit', 'data-press': true }, '保存');
    const ps = pushState();
    let pushPart;
    if (ps === 'unsupported') pushPart = h('p', 'note', 'このブラウザはプッシュ通知に対応していません');
    else if (ps === 'install') {
      const how = h('button', { class: 'ghost-btn', type: 'button', 'data-press': true }, 'ホーム画面に追加する方法');
      how.addEventListener('click', openInstallSheet);
      pushPart = h('div', null, h('p', 'note', 'iPhone / iPad では、ホーム画面に追加したアプリから通知を受け取れます'), h('div', 'list-btns', how));
    } else if (ps === 'denied') pushPart = h('p', 'note', '通知がブラウザでブロックされています。サイトの設定から許可してください');
    else {
      pushPart = switchRow('プッシュ通知', 'アプリを閉じていても新着が届きます', ps === 'on', async (on) => {
        if (on) await enablePush();
        else await disablePush();
        const now = pushState();
        if ((now === 'on') !== on) pushPart.set(now === 'on', true);
      });
    }
    const form = h('form', { autocomplete: 'off' },
      h('div', 'sheet-head', avatar(state.me || { id: uid, name: state.name }), h('h2', null, 'プロフィール')),
      name.wrap,
      pushPart,
      save,
    );
    $('.avatar', form).style.cssText = 'width:64px;height:64px;font-size:26px';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = name.input.value.trim();
      if (!v) return shake(name.wrap);
      state.name = v;
      store.set('ic.name', v);
      wsSend({ type: 'rename', name: v });
      closeSheet();
      toast('保存しました');
    });
    openSheet('profile', form);
  }
  $('#profileBtn').addEventListener('click', openProfileSheet);

  function openInstallSheet() {
    openSheet('install', h('div', null,
      h('h2', null, 'ホーム画面に追加'),
      h('p', 'sub', 'iPhone / iPad で通知を受け取るための準備です'),
      h('ol', 'ios-steps',
        h('li', null, 'Safari 下部の 共有ボタン（□に↑）をタップ'),
        h('li', null, '「ホーム画面に追加」を選ぶ'),
        h('li', null, '追加されたアイコンから開いて、通知をオンにする'),
      ),
    ));
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
    if (Notification.permission === 'granted' && !store.get('ic.push.off')) return 'on';
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
    store.del('ic.push.off');
    await syncPush();
    toast('通知をオンにしました');
    renderNotifyCard();
  }

  async function disablePush() {
    store.set('ic.push.off', '1');
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
    const show = (ps === 'off' || ps === 'install') && !store.get('ic.notify.dismissed') && !(ps === 'off' && store.get('ic.push.off'));
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
    store.set('ic.notify.dismissed', '1');
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
    else state.rooms.set(s.id, { s, messages: null, online: [] });
  }

  function handleLink(link) {
    if (state.rooms.has(link.room)) {
      openRoom(link.room);
      return;
    }
    state.link = link;
    wsSend({ type: 'peek', room: link.room });
  }

  const handlers = {
    ready(msg) {
      const first = !state.ready;
      state.ready = true;
      state.me = msg.you;
      state.vapid = msg.vapid;
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
        } else if (!narrow.matches && msg.rooms.length) {
          openRoom(sortedMine()[0].id);
        }
      }
    },
    you(msg) {
      state.me = msg.you;
      renderProfileButton();
    },
    room(msg) {
      upsertRoom(msg.room);
      renderMine();
      if (msg.room.id === state.activeId) renderHeader();
    },
    created(msg) {
      createBusy = false;
      if (state.pendingCreatePass) store.set(`ic.pass.${msg.room}`, state.pendingCreatePass);
      state.pendingCreatePass = '';
      closeSheet();
      setTab('mine');
      openRoom(msg.room);
      setTimeout(() => openInviteSheet(msg.room), 420);
    },
    joined(msg) {
      if (state.joinPass?.room === msg.room && state.joinPass.pass) store.set(`ic.pass.${msg.room}`, state.joinPass.pass);
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
      room.online = msg.online;
      if (msg.summary) room.s = msg.summary;
      if (msg.room !== state.activeId) return;
      renderHeader();
      const same = prev && prev.length === msg.messages.length && prev.at(-1)?.id === msg.messages.at(-1)?.id;
      if (same) {
        for (const m of msg.messages) {
          const entry = state.entries.get(m.id);
          if (entry) {
            entry.data = m;
            renderReacts(entry, false);
          }
        }
        markRead();
      } else renderMessages(msg.messages, !prev);
    },
    msg({ room: roomId, message, cid }) {
      const room = state.rooms.get(roomId);
      if (!room) return;
      if (room.messages) room.messages.push(message);
      if (!message.sys) {
        room.s.last = { name: message.from.name, text: [...message.text].slice(0, 60).join(''), ts: message.ts };
        if (message.from.id !== state.me.id && !(roomId === state.activeId && document.visibilityState === 'visible' && nearBottom())) {
          room.s.unread += 1;
        }
      }
      room.s.lastTs = message.ts;

      if (roomId === state.activeId) {
        const pending = cid && state.pending.get(cid);
        if (pending) {
          state.pending.delete(cid);
          pending.data = message;
          pending.row.dataset.id = message.id;
          pending.row.classList.remove('pending');
          $('time', pending.row).textContent = timeOf(message.ts);
          state.entries.set(message.id, pending);
          if (state.last && state.last.cid === cid) state.last = message;
        } else {
          if (!message.sys) setTyper(roomId, message.from.id, '', false);
          addLive(message);
        }
        markRead();
      } else if (cid) {
        state.pending.delete(cid);
      }
      renderMine();
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
    typing(msg) {
      setTyper(msg.room, msg.id, msg.name, msg.on);
    },
    presence(msg) {
      const room = state.rooms.get(msg.room);
      if (!room) return;
      room.online = msg.online;
      room.s.online = msg.online.length;
      room.s.members = msg.members;
      if (msg.room === state.activeId) renderPresence();
    },
    removed(msg) {
      const room = state.rooms.get(msg.room);
      if (!room) return;
      state.rooms.delete(msg.room);
      if (msg.room === state.activeId) {
        if (narrow.matches && history.state?.room) history.replaceState(null, '', '/');
        closeRoom();
      }
      renderMine();
      toast(msg.reason === 'deleted' ? `「${room.s.name}」は削除されました` : `「${room.s.name}」から退出しました`);
    },
    explore(msg) {
      state.explore = msg.rooms;
      renderExplore();
    },
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
      if (msg.op === 'join' && msg.code === 'notfound') return toast('ルームが見つかりませんでした');
      if (msg.op === 'open' && msg.code === 'notfound') {
        state.rooms.delete(msg.room);
        if (msg.room === state.activeId) closeRoom();
        return renderMine();
      }
      if (msg.op === 'create') {
        createBusy = false;
        return toast(msg.code === 'full' ? 'ルームが上限に達しています' : msg.code === 'rate' ? '少し時間をおいてください' : '作成できませんでした');
      }
      if (msg.code === 'rate') {
        toast('操作が速すぎます。少し待ってください');
        const pending = msg.cid && state.pending.get(msg.cid);
        if (pending) {
          state.pending.delete(msg.cid);
          pending.row.remove();
          if (!input.value && pending.room === state.activeId) {
            input.value = pending.data.text;
            autosize();
            updateSend();
          }
        }
      }
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
      handlers[msg.type]?.(msg);
    });
    ws.addEventListener('close', () => {
      if (state.ws !== ws) return;
      state.connected = false;
      updateSend();
      for (const [roomId, map] of state.typers) for (const id of [...map.keys()]) setTyper(roomId, id, '', false);
      if (state.activeId) setStatus('再接続中…', false);
      state.retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** state.retry++));
    });
  }
  // Reconnect right away when the tab comes back or the network returns.
  function wake() {
    if (state.name && !state.connected && state.ws?.readyState !== WebSocket.CONNECTING) connect();
  }
  addEventListener('online', wake);

  function renderProfileButton() {
    $('#profileBtn').replaceChildren(avatar(state.me || { id: uid, name: state.name }));
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

  if (state.name) {
    startShell(false);
  } else {
    const onboard = $('#onboard');
    const card = $('.card', onboard);
    onboard.hidden = false;
    play({ stiffness: 260, damping: 18 }, (p) => {
      card.style.transform = `translateY(${mix(40, 0, p).toFixed(2)}px) scale(${mix(0.9, 1, p).toFixed(4)})`;
      card.style.opacity = clamp(p * 1.5, 0, 1).toFixed(3);
    }, () => { card.style.transform = ''; card.style.opacity = ''; });
    $('#onboardName').focus();
    $('#onboardForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#onboardName').value.trim();
      if (!name) return shake($('#onboardName').closest('.field'));
      state.name = name;
      store.set('ic.name', name);
      play({ stiffness: 320, damping: 26 }, (p) => {
        card.style.transform = `scale(${mix(1, 0.86, p).toFixed(4)})`;
        card.style.opacity = clamp(1 - p * 1.4, 0, 1).toFixed(3);
      }, () => startShell(true));
    });
  }
})();
