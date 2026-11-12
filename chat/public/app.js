(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const mix = (a, b, p) => a + (b - a) * p;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');

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
        this.onUpdate(this.x);
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
      this.x = value;
      this.onUpdate(value);
      return this;
    }
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
    const h = dt / steps;
    for (const s of running) {
      for (let i = 0; i < steps; i++) {
        s.v += (-s.k * (s.x - s.target) - s.c * s.v) * h;
        s.x += s.v * h;
      }
      if (Math.abs(s.v) < s.eps * 10 && Math.abs(s.x - s.target) < s.eps) {
        s.x = s.target;
        s.v = 0;
        s.onUpdate(s.x);
        s.rest();
      } else {
        s.onUpdate(s.x);
      }
    }
    rafId = running.size ? requestAnimationFrame(frame) : 0;
  }

  // One-shot 0→1 spring; `render` receives progress that may overshoot 1.
  function play(cfg, render, done) {
    const s = new Spring(0, render, { precision: 0.001, ...cfg });
    s.onRest = done || null;
    render(0);
    return s.to(1);
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
    pressSpring(node).to(0.9, { stiffness: 700, damping: 34 });
  });
  const release = () => {
    if (!pressed) return;
    pressSpring(pressed).to(1, { stiffness: 420, damping: 11 });
    pressed = null;
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);

  /* =====================================================================
     State & elements
     ===================================================================== */
  const joinView = $('#join');
  const joinForm = $('#joinForm');
  const nameInput = $('#nameInput');
  const roomInput = $('#roomInput');
  const app = $('#app');
  const scroller = $('#scroller');
  const list = $('#list');
  const input = $('#input');
  const sendBtn = $('#send');
  const toBottom = $('#toBottom');
  const unreadBadge = $('#unread');
  const popover = $('#popover');
  const toastEl = $('#toast');
  const typingEl = $('#typing');
  const replyBar = $('#replyBar');

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
  };
  const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let uid = store.get('inachat.uid');
  if (!uid) {
    uid = randomId();
    store.set('inachat.uid', uid);
  }

  const state = {
    ws: null,
    connected: false,
    joined: false,
    firstWelcome: true,
    retry: 0,
    retryTimer: 0,
    name: '',
    room: '',
    me: null,
    reactions: ['💙'],
    entries: new Map(), // message id -> { data, row }
    pending: new Map(), // client id -> entry
    last: null,
    reply: null,
    unread: 0,
    typers: new Map(),
  };

  const hueOf = (id) => {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return 200 + (h % 36); // stay inside the blue family
  };
  const timeOf = (ts) => new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  function avatar(user) {
    const node = el('span', 'avatar', [...user.name][0] || '?');
    node.style.setProperty('--h', hueOf(user.id));
    node.title = user.name;
    return node;
  }

  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

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
    if (!away && state.unread && nearBottom()) setUnread(0);
  }
  scroller.addEventListener('scroll', () => { updateToBottom(); closePopover(); }, { passive: true });

  const scrollSpring = new Spring(0, (v) => { scroller.scrollTop = v; }, { stiffness: 220, damping: 28, precision: 0.5 });
  toBottom.addEventListener('click', () => {
    setUnread(0);
    scrollSpring.x = scroller.scrollTop;
    scrollSpring.v = 0;
    scrollSpring.to(scroller.scrollHeight - scroller.clientHeight);
  });
  // A manual scroll always wins over the scroll animation.
  for (const type of ['wheel', 'touchstart']) {
    scroller.addEventListener(type, () => running.delete(scrollSpring), { passive: true });
  }

  /* =====================================================================
     Messages
     ===================================================================== */
  const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
  function fillText(node, text) {
    for (const part of text.split(URL_RE)) {
      if (!part) continue;
      if (/^https?:\/\//.test(part)) {
        const a = el('a', null, part);
        a.href = part;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        node.append(a);
      } else {
        node.append(part);
      }
    }
  }

  const ICON_REPLY = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M10 8L5 13l5 5M5 13h9a5 5 0 005-5V6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_SMILE = '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5v.5M15 9.5v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function buildRow(m) {
    const mine = m.from.id === state.me.id;
    const prev = state.last;
    const cont = prev && prev.from.id === m.from.id && m.ts - prev.ts < 180000;
    const row = el('div', `msg ${mine ? 'me' : 'them'}${cont ? ' cont' : ''}`);
    if (m.id) row.dataset.id = m.id;

    const col = el('div', 'col');
    col.append(el('span', 'name', m.from.name));
    const bubble = el('div', 'bubble');
    if (m.replyTo) {
      const quote = el('span', 'quote');
      quote.dataset.target = m.replyTo.id;
      quote.append(el('b', null, m.replyTo.name), m.replyTo.text);
      bubble.append(quote);
    }
    fillText(bubble, m.text);
    const side = el('div', 'side');
    side.append(el('time', null, timeOf(m.ts)));
    for (const [action, icon, label] of [['react', ICON_SMILE, 'リアクション'], ['reply', ICON_REPLY, '返信']]) {
      const btn = el('button', 'act');
      btn.type = 'button';
      btn.dataset.action = action;
      btn.setAttribute('aria-label', label);
      btn.innerHTML = icon;
      side.append(btn);
    }

    const hint = el('span', 'swipe-hint');
    hint.innerHTML = ICON_REPLY;
    const line = el('div', 'line');
    line.append(bubble, side);
    col.append(line, el('div', 'reacts'));
    row.append(avatar(m.from), col, hint);
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
      () => {
        row.style.transform = '';
        row.style.opacity = '';
      },
    );
    if (delay) {
      row.style.opacity = '0';
      setTimeout(start, delay);
    } else {
      start();
    }
  }

  function addMessage(m, { animate = true, pending = false } = {}) {
    const mine = m.from.id === state.me.id;
    const stick = mine || nearBottom();
    const row = buildRow(m);
    const entry = { data: m, row, counts: {} };
    if (pending) {
      row.classList.add('pending');
      state.pending.set(m.cid, entry);
    } else {
      state.entries.set(m.id, entry);
    }
    state.last = m;
    list.append(row);
    renderReacts(entry, false);

    if (!animate) return entry;
    if (stick) {
      const grew = row.offsetHeight + parseFloat(getComputedStyle(row).marginTop);
      running.delete(scrollSpring);
      scroller.scrollTop = scroller.scrollHeight;
      listShift.jump(listShift.x + grew).to(0);
      enter(row, mine);
    } else {
      setUnread(state.unread + 1);
      updateToBottom();
    }
    return entry;
  }

  function addSystem(text) {
    const stick = nearBottom();
    const node = el('div', 'sys', text);
    list.append(node);
    state.last = null;
    if (stick) {
      const grew = node.offsetHeight + 18;
      scroller.scrollTop = scroller.scrollHeight;
      listShift.jump(listShift.x + grew).to(0);
    }
    play({ stiffness: 300, damping: 20 }, (p) => {
      node.style.transform = `scale(${mix(0.7, 1, p).toFixed(4)})`;
      node.style.opacity = clamp(p * 1.5, 0, 1).toFixed(3);
    }, () => { node.style.transform = ''; node.style.opacity = ''; });
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
      const chip = el('button', `chip${users.includes(state.me.id) ? ' mine' : ''}`);
      chip.type = 'button';
      chip.dataset.emoji = emoji;
      chip.dataset.press = '';
      chip.append(emoji, el('span', null, String(users.length)));
      box.append(chip);
      if (animate && before[emoji] !== users.length) {
        const from = before[emoji] ? 1.35 : 0;
        play({ stiffness: 420, damping: 14 }, (p) => { chip.style.transform = `scale(${mix(from, 1, p).toFixed(4)})`; },
          () => { chip.style.transform = ''; });
      }
    }
    entry.counts = counts;
  }

  function react(id, emoji, burstOn) {
    if (!state.connected) return toast('接続が切れています');
    state.ws.send(JSON.stringify({ type: 'react', id, emoji }));
    if (burstOn) {
      const burst = el('span', 'burst', emoji);
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
    popover.replaceChildren();
    const items = [];
    for (const emoji of state.reactions) {
      const btn = el('button', null, emoji);
      btn.type = 'button';
      btn.dataset.emoji = emoji;
      btn.dataset.press = '';
      items.push(btn);
    }
    const reply = el('button');
    reply.type = 'button';
    reply.dataset.reply = '';
    reply.dataset.press = '';
    reply.setAttribute('aria-label', '返信');
    reply.innerHTML = ICON_REPLY.replace(/16/g, '20');
    popover.append(...items, el('span', 'sep'), reply);
    items.push(reply);
    popover.hidden = false;

    const rect = $('.bubble', entry.row).getBoundingClientRect();
    const w = popover.offsetWidth;
    const h = popover.offsetHeight;
    const mine = entry.row.classList.contains('me');
    const left = clamp(mine ? rect.right - w : rect.left, 8, innerWidth - w - 8);
    const above = rect.top - h - 8 > 8;
    const top = above ? rect.top - h - 8 : Math.min(rect.bottom + 8, innerHeight - h - 8);
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePopover(); setReply(null); } });

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
    if (e.pointerType === 'mouse') return;
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
      running.delete(dragSprings.get(g.entry.row));
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
  let typingStop = 0;
  function sendTyping(on) {
    if (!state.connected) return;
    const now = Date.now();
    if (on && now - typingSent < 2000) return;
    if (!on && !typingSent) return;
    typingSent = on ? now : 0;
    state.ws.send(JSON.stringify({ type: 'typing', on }));
  }

  function send() {
    const text = input.value.trim();
    if (!text) return;
    if (!state.connected) return toast('接続が切れています。再接続中…');
    const cid = randomId();
    state.ws.send(JSON.stringify({ type: 'msg', text, cid, replyTo: state.reply?.id }));
    addMessage({
      cid, from: state.me, text, ts: Date.now(), reactions: {},
      replyTo: state.reply && { ...state.reply, text: [...state.reply.text].slice(0, 80).join('') },
    }, { pending: true });
    input.value = '';
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
    const names = [...state.typers.values()].map((t) => t.name);
    if (names.length) {
      $('#typingText').textContent = names.length === 1 ? `${names[0]}が入力中` : `${names.length}人が入力中`;
    }
    typingEl.classList.toggle('show', names.length > 0);
  }
  function setTyper(id, name, on) {
    const prev = state.typers.get(id);
    if (prev) clearTimeout(prev.timer);
    if (on) state.typers.set(id, { name, timer: setTimeout(() => setTyper(id, name, false), 5000) });
    else state.typers.delete(id);
    renderTyping();
  }

  /* =====================================================================
     Connection
     ===================================================================== */
  function setStatus(text, online) {
    $('#statusText').textContent = text;
    $('#status').classList.toggle('on', online);
  }

  function renderMembers(members) {
    const box = $('#avatars');
    const known = new Set([...box.children].map((n) => n.dataset.id));
    box.replaceChildren();
    members.slice(0, 4).forEach((m) => {
      const node = avatar(m);
      node.dataset.id = m.id;
      box.append(node);
      if (!known.has(m.id)) {
        play({ stiffness: 400, damping: 15 }, (p) => { node.style.transform = `scale(${p.toFixed(4)})`; },
          () => { node.style.transform = ''; });
      }
    });
    if (members.length > 4) box.append(el('span', 'avatar more', `+${members.length - 4}`));
    setStatus(`${members.length}人がオンライン`, true);
  }

  const handlers = {
    welcome(msg) {
      state.me = msg.you;
      state.reactions = msg.reactions;
      state.entries.clear();
      state.pending.clear();
      state.last = null;
      list.replaceChildren();
      for (const m of msg.history) addMessage(m, { animate: false });
      scroller.scrollTop = scroller.scrollHeight;
      setUnread(0);
      updateToBottom();
      renderMembers(msg.members);
      if (state.firstWelcome) {
        state.firstWelcome = false;
        const rows = [...list.children].slice(-8);
        rows.forEach((row, i) => enter(row, row.classList.contains('me'), 40 + i * 35));
        if (!msg.history.length) addSystem(`「${msg.room}」へようこそ。リンクを共有して誰かを呼びましょう`);
      }
    },
    msg({ message, cid }) {
      const pending = cid && state.pending.get(cid);
      if (pending) {
        state.pending.delete(cid);
        pending.data = message;
        pending.row.dataset.id = message.id;
        pending.row.classList.remove('pending');
        $('time', pending.row).textContent = timeOf(message.ts);
        state.entries.set(message.id, pending);
        if (state.last && state.last.cid === cid) state.last = message;
        return;
      }
      setTyper(message.from.id, '', false);
      addMessage(message);
    },
    react(msg) {
      const entry = state.entries.get(msg.id);
      if (!entry) return;
      entry.data.reactions = msg.reactions;
      renderReacts(entry);
    },
    typing(msg) {
      setTyper(msg.id, msg.name, msg.on);
    },
    members(msg) {
      renderMembers(msg.members);
      if (msg.joined) addSystem(`${msg.joined.name}さんが入室しました`);
      if (msg.left) addSystem(`${msg.left.name}さんが退室しました`);
    },
    error(msg) {
      if (msg.code !== 'rate') return;
      toast('送信が速すぎます。少し待ってください');
      const pending = state.pending.get(msg.cid);
      if (pending) {
        state.pending.delete(msg.cid);
        pending.row.remove();
        if (!input.value) {
          input.value = pending.data.text;
          autosize();
          updateSend();
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
      ws.send(JSON.stringify({ type: 'join', name: state.name, room: state.room, uid }));
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
      for (const id of [...state.typers.keys()]) setTyper(id, '', false);
      if (!state.joined) return;
      setStatus('再接続中…', false);
      state.retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** state.retry++));
    });
  }
  // Reconnect right away when the tab comes back or the network returns.
  const wake = () => {
    if (state.joined && !state.connected && state.ws?.readyState !== WebSocket.CONNECTING) connect();
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  addEventListener('online', wake);

  /* =====================================================================
     Join / leave
     ===================================================================== */
  const params = new URLSearchParams(location.search);
  nameInput.value = store.get('inachat.name') || '';
  roomInput.value = params.get('room') || '';
  (nameInput.value ? roomInput : nameInput).focus();

  const card = $('.card');
  play({ stiffness: 260, damping: 18 }, (p) => {
    card.style.transform = `translateY(${mix(40, 0, p).toFixed(2)}px) scale(${mix(0.9, 1, p).toFixed(4)})`;
    card.style.opacity = clamp(p * 1.5, 0, 1).toFixed(3);
  }, () => { card.style.transform = ''; card.style.opacity = ''; });

  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return nameInput.focus();
    state.name = name;
    state.room = (roomInput.value.trim() || 'lobby').toLowerCase();
    state.joined = true;
    state.firstWelcome = true;
    store.set('inachat.name', name);
    history.replaceState(null, '', `?room=${encodeURIComponent(state.room)}`);
    $('#roomName').textContent = state.room;
    document.title = `${state.room} · inachat`;
    setStatus('接続中…', false);
    list.replaceChildren();
    connect();

    play({ stiffness: 320, damping: 26 }, (p) => {
      card.style.transform = `scale(${mix(1, 0.86, p).toFixed(4)})`;
      card.style.opacity = clamp(1 - p * 1.4, 0, 1).toFixed(3);
    }, () => {
      joinView.hidden = true;
      card.style.transform = '';
      card.style.opacity = '';
    });
    app.hidden = false;
    play({ stiffness: 240, damping: 20 }, (p) => {
      app.style.transform = `translateY(${mix(60, 0, p).toFixed(2)}px) scale(${mix(0.92, 1, p).toFixed(4)})`;
      app.style.opacity = clamp(p * 1.4, 0, 1).toFixed(3);
    }, () => { app.style.transform = ''; app.style.opacity = ''; });
    if (!coarse.matches) input.focus();
  });

  $('#leave').addEventListener('click', () => {
    state.joined = false;
    clearTimeout(state.retryTimer);
    state.ws?.close();
    closePopover();
    setReply(null);
    app.hidden = true;
    joinView.hidden = false;
    document.title = 'inachat';
    play({ stiffness: 280, damping: 19 }, (p) => {
      card.style.transform = `scale(${mix(0.88, 1, p).toFixed(4)})`;
      card.style.opacity = clamp(p * 1.5, 0, 1).toFixed(3);
    }, () => { card.style.transform = ''; card.style.opacity = ''; });
  });

  $('#share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('招待リンクをコピーしました');
    } catch {
      toast(location.href);
    }
  });

  // Keep the latest message in view when the on-screen keyboard resizes the viewport.
  let wasNearBottom = true;
  scroller.addEventListener('scroll', () => { wasNearBottom = nearBottom(); }, { passive: true });
  addEventListener('resize', () => { if (wasNearBottom) scroller.scrollTop = scroller.scrollHeight; });
})();
