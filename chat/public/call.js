/* Lynq calls: peer-to-peer WebRTC mesh with "perfect negotiation". The server only relays signals. */
(() => {
  'use strict';

  let ctx = null; // { send, me, roomName, toast, h, Spring, play, avatar, mix, clamp, onChange }
  const call = {
    room: null,
    ice: [],
    stream: null,
    peers: new Map(), // id -> peer
    roster: new Map(), // id -> { name, cam, mic }
    mic: true,
    cam: false,
    facing: 'user',
    startedAt: 0,
    minimized: false,
  };
  let ui = null;
  let wakeLock = null;
  let audioCtx = null;

  const ICON = {
    mic: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M4 4l16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    cam: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="6" width="13" height="12" rx="3" fill="currentColor"/><path d="M16 10.5l5-3v9l-5-3z" fill="currentColor"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="6" width="13" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 10.5l5-3v9l-5-3zM3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flip: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 9a8 8 0 0114-3l2 2M20 15a8 8 0 01-14 3l-2-2M20 4v4h-4M4 20v-4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    end: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 14.5c5-5 13-5 18 0l-2.4 2.6-3.8-1.4V13a10 10 0 00-5.6 0v2.7l-3.8 1.4z" fill="currentColor"/></svg>',
    min: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ---------- media ---------- */

  async function getMedia(video) {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const vid = { facingMode: call.facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: video ? vid : false });
    } catch (err) {
      if (video) {
        ctx.toast('カメラを使えないため音声のみで参加します');
        return navigator.mediaDevices.getUserMedia({ audio, video: false });
      }
      throw err;
    }
  }

  function sendState() {
    ctx.send({ type: 'call', room: call.room, action: 'state', cam: call.cam, mic: call.mic });
  }

  /* ---------- peers ---------- */

  function signal(to, data) {
    ctx.send({ type: 'signal', room: call.room, to, data });
  }

  function createPeer(id, name) {
    const pc = new RTCPeerConnection({ iceServers: call.ice });
    const peer = { id, name, pc, polite: ctx.me().id > id, makingOffer: false, ignoreOffer: false, stream: new MediaStream(), tile: null };
    call.peers.set(id, peer);
    for (const track of call.stream.getTracks()) pc.addTrack(track, call.stream);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        signal(id, { description: pc.localDescription });
      } catch (err) {
        console.warn('negotiation', err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) signal(id, { candidate }); };
    pc.ontrack = ({ track }) => {
      peer.stream.addTrack(track);
      track.onunmute = () => renderTiles();
      renderTiles();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      renderTiles();
    };
    renderTiles();
    return peer;
  }

  function dropPeer(id) {
    const peer = call.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    call.peers.delete(id);
    renderTiles();
  }

  async function onSignal(msg) {
    if (msg.room !== call.room || !call.stream) return;
    const { from, data } = msg;
    if (data.bye) return dropPeer(from);
    const peer = call.peers.get(from) || createPeer(from, msg.name);
    const { pc } = peer;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          signal(from, { description: pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.warn('signal', err);
    }
  }

  /* ---------- join / leave ---------- */

  async function join(room, { video = false } = {}) {
    if (call.room === room) return expand();
    if (call.room) await leave();
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return ctx.toast('このブラウザは通話に対応していません');
    try {
      call.stream = await getMedia(video);
    } catch {
      return ctx.toast('マイクを使う許可が必要です');
    }
    call.room = room;
    call.cam = call.stream.getVideoTracks().length > 0;
    call.mic = true;
    call.startedAt = Date.now();
    call.minimized = false;
    buildUi();
    ctx.send({ type: 'call', room, action: 'join', cam: call.cam, mic: true });
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
    ctx.onChange();
  }

  async function leave(silent) {
    if (!call.room) return;
    if (!silent) ctx.send({ type: 'call', room: call.room, action: 'leave' });
    for (const id of [...call.peers.keys()]) dropPeer(id);
    call.stream?.getTracks().forEach((t) => t.stop());
    call.stream = null;
    call.room = null;
    call.roster.clear();
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    destroyUi();
    ctx.onChange();
  }

  function onJoined(msg) {
    if (msg.room !== call.room) return;
    call.ice = msg.ice || [];
    // The newcomer reaches out to everyone already in the call.
    for (const p of msg.peers) if (!call.peers.has(p.id)) createPeer(p.id, p.name);
  }

  function onRoster(roomId, peers, startedAt) {
    if (roomId !== call.room) return;
    call.roster = new Map(peers.map((p) => [p.id, p]));
    if (startedAt) call.startedAt = startedAt;
    for (const id of [...call.peers.keys()]) if (!call.roster.has(id)) dropPeer(id);
    renderTiles();
  }

  /* ---------- controls ---------- */

  function toggleMic() {
    call.mic = !call.mic;
    call.stream.getAudioTracks().forEach((t) => { t.enabled = call.mic; });
    sendState();
    renderControls();
    renderTiles();
  }

  async function toggleCam() {
    const current = call.stream.getVideoTracks()[0];
    if (current) {
      call.cam = !call.cam;
      current.enabled = call.cam;
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: call.facing, width: { ideal: 640 }, height: { ideal: 480 } } });
        const track = s.getVideoTracks()[0];
        call.stream.addTrack(track);
        for (const p of call.peers.values()) p.pc.addTrack(track, call.stream); // triggers renegotiation
        call.cam = true;
      } catch {
        return ctx.toast('カメラを使えませんでした');
      }
    }
    sendState();
    renderControls();
    renderTiles();
  }

  async function flipCam() {
    const old = call.stream.getVideoTracks()[0];
    if (!old) return;
    call.facing = call.facing === 'user' ? 'environment' : 'user';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: call.facing, width: { ideal: 640 }, height: { ideal: 480 } } });
      const track = s.getVideoTracks()[0];
      track.enabled = call.cam;
      for (const p of call.peers.values()) {
        const sender = p.pc.getSenders().find((x) => x.track === old);
        await sender?.replaceTrack(track);
      }
      call.stream.removeTrack(old);
      old.stop();
      call.stream.addTrack(track);
      renderTiles();
    } catch {
      call.facing = call.facing === 'user' ? 'environment' : 'user';
      ctx.toast('カメラを切り替えられませんでした');
    }
  }

  /* ---------- UI ---------- */

  const { h } = { h: (...a) => ctx.h(...a) };

  function buildUi() {
    destroyUi();
    const grid = h('div', 'call-grid');
    const self = h('div', 'call-self');
    const title = h('b', null, ctx.roomName(call.room));
    const timer = h('span', 'call-timer', '00:00');
    const controls = h('div', 'call-controls');
    const root = h('div', { class: 'call', role: 'dialog', 'aria-label': '通話' },
      h('header', 'call-head',
        h('button', { class: 'call-icon', type: 'button', 'data-press': true, 'aria-label': '小さくする', html: ICON.min, onclick: minimize }),
        h('div', 'call-title', title, timer)),
      grid, self, controls);
    const bubble = h('button', { class: 'call-bubble', type: 'button', 'aria-label': '通話に戻る', hidden: true },
      h('span', 'call-bubble-ring'), h('span', 'call-bubble-body', h('span', { html: ICON.mic }), h('span', 'call-bubble-time', '00:00')));
    document.body.append(root, bubble);
    ui = { root, grid, self, timer, controls, bubble, tiles: new Map(), meters: new Map(), timerId: 0, raf: 0 };

    makeDraggable(self, { snap: true });
    makeDraggable(bubble, { snap: true, onTap: expand });

    ui.timerId = setInterval(() => {
      const s = Math.floor((Date.now() - call.startedAt) / 1000);
      const t = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      ui.timer.textContent = t;
      ui.bubble.querySelector('.call-bubble-time').textContent = t;
    }, 1000);

    renderControls();
    renderTiles();
    ctx.play({ stiffness: 260, damping: 24 }, (p) => {
      root.style.transform = `translateY(${ctx.mix(40, 0, p).toFixed(2)}px) scale(${ctx.mix(0.94, 1, p).toFixed(4)})`;
      root.style.opacity = ctx.clamp(p * 1.5, 0, 1).toFixed(3);
    }, () => { root.style.transform = ''; root.style.opacity = ''; });
    meterLoop();
  }

  function destroyUi() {
    if (!ui) return;
    clearInterval(ui.timerId);
    cancelAnimationFrame(ui.raf);
    ui.root.remove();
    ui.bubble.remove();
    ui = null;
  }

  function renderControls() {
    if (!ui) return;
    const btn = (cls, html, label, onclick, on) => h('button', { class: `call-btn ${cls}${on === false ? ' off' : ''}`, type: 'button', 'data-press': true, 'aria-label': label, html, onclick });
    const hasMultiCam = call.cam && /Android|iPhone|iPad/.test(navigator.userAgent);
    ui.controls.replaceChildren(...[
      btn('', call.mic ? ICON.mic : ICON.micOff, call.mic ? 'ミュート' : 'ミュート解除', toggleMic, call.mic),
      btn('', call.cam ? ICON.cam : ICON.camOff, call.cam ? 'カメラをオフ' : 'カメラをオン', toggleCam, call.cam),
      hasMultiCam ? btn('', ICON.flip, 'カメラを切り替え', flipCam) : null,
      btn('end', ICON.end, '通話を終了', () => leave()),
    ].filter(Boolean));
  }

  function videoEl(stream, muted) {
    const v = h('video', { autoplay: true, playsinline: true });
    v.muted = muted;
    v.srcObject = stream;
    v.play?.().catch(() => {});
    return v;
  }

  function renderTiles() {
    if (!ui) return;
    const me = ctx.me();
    // self preview
    const selfHasVideo = call.cam && call.stream?.getVideoTracks().length;
    if (ui.self.dataset.mode !== (selfHasVideo ? 'v' : 'a')) {
      ui.self.dataset.mode = selfHasVideo ? 'v' : 'a';
      ui.self.replaceChildren(selfHasVideo ? videoEl(call.stream, true) : ctx.avatar(me));
      ui.self.classList.toggle('mirror', call.facing === 'user');
    }
    ui.self.classList.toggle('muted', !call.mic);

    const ids = [...new Set([...call.roster.keys(), ...call.peers.keys()])].filter((id) => id !== me.id);
    const before = new Map([...ui.tiles].map(([id, t]) => [id, t.getBoundingClientRect()]));
    for (const [id, tile] of ui.tiles) {
      if (!ids.includes(id)) {
        tile.remove();
        ui.tiles.delete(id);
        ui.meters.delete(id);
      }
    }
    for (const id of ids) {
      const info = call.roster.get(id) || { id, name: call.peers.get(id)?.name || '…', cam: false, mic: true };
      const peer = call.peers.get(id);
      let tile = ui.tiles.get(id);
      if (!tile) {
        tile = h('div', 'call-tile');
        tile.dataset.id = id;
        ui.tiles.set(id, tile);
        ui.grid.append(tile);
        ctx.play({ stiffness: 320, damping: 20 }, (p) => {
          tile.style.transform = `scale(${ctx.mix(0.6, 1, p).toFixed(4)})`;
          tile.style.opacity = ctx.clamp(p * 1.6, 0, 1).toFixed(3);
        }, () => { tile.style.transform = ''; tile.style.opacity = ''; });
      }
      const showVideo = info.cam && peer && peer.stream.getVideoTracks().length > 0;
      const mode = `${showVideo ? 'v' : 'a'}`;
      if (tile.dataset.mode !== mode || !tile.querySelector('.call-media')) {
        tile.dataset.mode = mode;
        // Keep audio playing through a media element even when the camera is off.
        const mediaEl = peer ? videoEl(peer.stream, false) : h('span');
        mediaEl.classList.add('call-media');
        tile.replaceChildren(...[mediaEl, showVideo ? null : h('div', 'call-avatar', ctx.avatar(info)), h('span', 'call-name', info.name)].filter(Boolean));
        if (peer && !ui.meters.has(id)) attachMeter(id, peer.stream);
      }
      const state = peer ? peer.pc.connectionState : 'new';
      tile.classList.toggle('connecting', state !== 'connected');
      tile.classList.toggle('muted', info.mic === false);
    }
    ui.grid.dataset.count = String(Math.min(ids.length, 4));
    ui.grid.classList.toggle('waiting', ids.length === 0);
    if (!ids.length && !ui.grid.querySelector('.call-wait')) {
      ui.grid.append(h('div', 'call-wait', h('span', 'call-wait-rings', h('i'), h('i'), ctx.avatar(me)), h('p', null, 'みんなの参加を待っています…')));
    } else if (ids.length) ui.grid.querySelector('.call-wait')?.remove();

    // FLIP the tiles into their new grid positions.
    for (const [id, tile] of ui.tiles) {
      const prev = before.get(id);
      if (!prev) continue;
      const now = tile.getBoundingClientRect();
      const dx = prev.left - now.left;
      const dy = prev.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      ctx.play({ stiffness: 300, damping: 26 }, (p) => {
        tile.style.translate = `${ctx.mix(dx, 0, p).toFixed(2)}px ${ctx.mix(dy, 0, p).toFixed(2)}px`;
      }, () => { tile.style.translate = ''; });
    }
  }

  // Light up whoever is speaking.
  function attachMeter(id, stream) {
    if (!stream.getAudioTracks().length && !stream.onaddtrack) {
      stream.onaddtrack = () => { if (!ui?.meters.has(id)) attachMeter(id, stream); };
      return;
    }
    try {
      audioCtx = audioCtx || new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      ui.meters.set(id, { an, buf: new Uint8Array(an.fftSize), level: 0 });
    } catch { /* metering is optional */ }
  }
  function meterLoop() {
    if (!ui) return;
    for (const [id, m] of ui.meters) {
      m.an.getByteTimeDomainData(m.buf);
      let sum = 0;
      for (const v of m.buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / m.buf.length);
      m.level = Math.max(rms * 6, m.level * 0.86);
      ui.tiles.get(id)?.style.setProperty('--level', Math.min(1, m.level).toFixed(3));
    }
    ui.raf = requestAnimationFrame(meterLoop);
  }

  function minimize() {
    if (!ui) return;
    call.minimized = true;
    const { root, bubble } = ui;
    ctx.play({ stiffness: 340, damping: 30 }, (p) => {
      root.style.transform = `translateY(${ctx.mix(0, 60, p).toFixed(2)}px) scale(${ctx.mix(1, 0.85, p).toFixed(4)})`;
      root.style.opacity = ctx.clamp(1 - p * 1.4, 0, 1).toFixed(3);
    }, () => {
      root.hidden = true;
      root.style.transform = '';
      root.style.opacity = '';
    });
    bubble.hidden = false;
    ctx.play({ stiffness: 420, damping: 15 }, (p) => { bubble.style.scale = p.toFixed(4); }, () => { bubble.style.scale = ''; });
    ctx.onChange();
  }
  function expand() {
    if (!ui) return;
    call.minimized = false;
    ui.bubble.hidden = true;
    ui.root.hidden = false;
    ctx.play({ stiffness: 300, damping: 26 }, (p) => {
      ui.root.style.transform = `scale(${ctx.mix(0.9, 1, p).toFixed(4)})`;
      ui.root.style.opacity = ctx.clamp(p * 1.6, 0, 1).toFixed(3);
    }, () => { ui.root.style.transform = ''; ui.root.style.opacity = ''; });
    ctx.onChange();
  }

  // Drag with momentum; snaps to the nearest corner on release.
  function makeDraggable(el, { onTap } = {}) {
    let pos = null;
    const sx = new ctx.Spring(0, (x) => { el.style.setProperty('--x', `${x.toFixed(1)}px`); }, { stiffness: 320, damping: 26, precision: 0.3 });
    const sy = new ctx.Spring(0, (y) => { el.style.setProperty('--y', `${y.toFixed(1)}px`); }, { stiffness: 320, damping: 26, precision: 0.3 });
    let g = null;
    el.addEventListener('pointerdown', (e) => {
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: sx.x, oy: sy.y, vx: 0, vy: 0, t: performance.now(), moved: false };
      sx.stop();
      sy.stop();
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      const now = performance.now();
      const dt = Math.max(1, now - g.t);
      g.vx = ctx.mix(g.vx, (sx.x - (g.lx ?? sx.x)) / dt, 0.5);
      g.vy = ctx.mix(g.vy, (sy.y - (g.ly ?? sy.y)) / dt, 0.5);
      g.lx = sx.x;
      g.ly = sy.y;
      g.t = now;
      sx.x = g.ox + dx;
      sy.y = g.oy + dy;
      sx.onUpdate(sx.x);
      sy.onUpdate(sy.y);
    });
    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const moved = g.moved;
      const { vx, vy } = g;
      g = null;
      if (!moved) {
        onTap?.();
        return;
      }
      // Where would momentum carry it? Snap to that corner.
      const r = el.getBoundingClientRect();
      const base = { left: r.left - sx.x, top: r.top - sy.y };
      const px = r.left + vx * 180;
      const py = r.top + vy * 180;
      const m = 14;
      const left = px + r.width / 2 < innerWidth / 2 ? m : innerWidth - r.width - m;
      const top = ctx.clamp(py, m + 50, innerHeight - r.height - m - 110);
      sx.v = vx * 1000;
      sy.v = vy * 1000;
      sx.to(left - base.left);
      sy.to((py + r.height / 2 < innerHeight / 2 ? m + 60 : top) - base.top);
      pos = { left, top };
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return () => pos;
  }

  window.LynqCall = {
    init(c) { ctx = c; },
    join,
    leave,
    expand,
    get room() { return call.room; },
    get minimized() { return call.minimized; },
    handle(msg) {
      if (msg.type === 'call-joined') onJoined(msg);
      else if (msg.type === 'signal') onSignal(msg);
      else if (msg.type === 'call') onRoster(msg.room, msg.peers, msg.startedAt);
      else if (msg.type === 'call-ended' && msg.room === call.room) {
        ctx.toast('別の端末で通話に参加しました');
        leave(true);
      }
    },
  };
})();
