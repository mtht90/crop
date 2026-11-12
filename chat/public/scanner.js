/* In-app QR scanner. Uses the native BarcodeDetector when available and jsQR otherwise. */
(() => {
  'use strict';

  let ctx = null; // { h, play, mix, clamp, Spring, toast }
  let ui = null;

  const ICON = {
    close: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    torch: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 3h8l-1.5 5h-5zM9.5 8h5v13h-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 12v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    image: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="5" width="18" height="14" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 17l5-4.5 3.5 3 3-2.5L21 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  };

  let detector = null;
  async function getDetector() {
    if (detector !== null) return detector;
    detector = false;
    try {
      if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        detector = new BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch { /* fall back to jsQR */ }
    return detector;
  }

  // Returns { text, points: [{x,y} x4] in source pixel coordinates } or null.
  async function decode(source, w, h, canvas) {
    const native = await getDetector();
    if (native) {
      try {
        const [hit] = await native.detect(source);
        if (hit) return { text: hit.rawValue, points: hit.cornerPoints };
      } catch { /* try jsQR */ }
    }
    if (!window.jsQR) return null;
    const scale = Math.min(1, 720 / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    canvas.width = cw;
    canvas.height = ch;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, cw, ch);
    const img = g.getImageData(0, 0, cw, ch);
    const hit = jsQR(img.data, cw, ch, { inversionAttempts: 'attemptBoth' });
    if (!hit) return null;
    const l = hit.location;
    return { text: hit.data, points: [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner].map((p) => ({ x: p.x / scale, y: p.y / scale })) };
  }

  function open({ onResult, hint = 'QRコードを枠に合わせてください' } = {}) {
    close(true);
    const { h } = ctx;
    const video = h('video', { autoplay: true, playsinline: true, muted: true });
    video.muted = true;
    const frame = h('div', 'scan-frame', h('i'), h('i'), h('i'), h('i'), h('span', 'scan-laser'));
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    hit.setAttribute('class', 'scan-hit');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    hit.append(poly);
    poly.style.display = 'none';
    const torch = h('button', { class: 'call-icon', type: 'button', 'data-press': true, 'aria-label': 'ライト', html: ICON.torch, hidden: true });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const root = h('div', { class: 'scan', role: 'dialog', 'aria-label': 'QRコードを読み取る' },
      video, h('div', 'scan-shade', frame), hit,
      h('div', 'scan-head', h('button', { class: 'call-icon', type: 'button', 'data-press': true, 'aria-label': '閉じる', html: ICON.close, onclick: () => close() }), torch),
      h('p', 'scan-hint', hint),
      h('div', 'scan-foot', h('button', { type: 'button', 'data-press': true, html: `${ICON.image}<span>画像から読み取る</span>`, onclick: () => file.click() })),
      file);
    document.body.append(root);
    ui = { root, video, frame, hit, poly, torch, stream: null, raf: 0, busy: false, done: false, onResult, canvas: document.createElement('canvas'), last: 0 };

    ctx.play({ stiffness: 280, damping: 26 }, (p) => {
      root.style.opacity = ctx.clamp(p * 1.6, 0, 1).toFixed(3);
      frame.style.setProperty('--breathe', ctx.mix(1.25, 1, p).toFixed(4));
    }, () => { root.style.opacity = ''; });

    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      try {
        const bmp = await createImageBitmap(f);
        const res = await decode(bmp, bmp.width, bmp.height, ui.canvas);
        if (res) finish(res.text, null);
        else ctx.toast('画像からQRコードが見つかりませんでした');
      } catch {
        ctx.toast('画像を読み込めませんでした');
      }
    });
    start();
  }

  async function start() {
    const u = ui;
    if (!navigator.mediaDevices?.getUserMedia) return showError('このブラウザではカメラを使えません。「画像から読み取る」をお使いください。');
    try {
      u.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch {
      return showError('カメラを使う許可が必要です。ブラウザの設定で許可するか、「画像から読み取る」をお使いください。');
    }
    if (ui !== u) return u.stream.getTracks().forEach((t) => t.stop());
    u.video.srcObject = u.stream;
    await u.video.play().catch(() => {});
    const track = u.stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    if (caps.torch) {
      let on = false;
      u.torch.hidden = false;
      u.torch.addEventListener('click', async () => {
        on = !on;
        try {
          await track.applyConstraints({ advanced: [{ torch: on }] });
          u.torch.classList.toggle('on', on);
        } catch { /* not supported after all */ }
      });
    }
    loop();
  }

  function showError(text) {
    if (!ui) return;
    ui.root.querySelector('.scan-shade').replaceWith(ctx.h('div', 'scan-error', text));
    ui.root.querySelector('.scan-hint')?.remove();
  }

  async function loop(now = 0) {
    const u = ui;
    if (!u || u.done) return;
    u.raf = requestAnimationFrame(loop);
    if (u.busy || now - u.last < 110 || u.video.readyState < 2) return;
    u.busy = true;
    u.last = now;
    try {
      const res = await decode(u.video, u.video.videoWidth, u.video.videoHeight, u.canvas);
      if (res && ui === u && !u.done) finish(res.text, res.points);
    } finally {
      u.busy = false;
    }
  }

  // Map points from video pixels to screen pixels (object-fit: cover).
  function toScreen(pts) {
    const v = ui.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const r = v.getBoundingClientRect();
    const s = Math.max(r.width / vw, r.height / vh);
    const ox = (r.width - vw * s) / 2;
    const oy = (r.height - vh * s) / 2;
    return pts.map((p) => ({ x: ox + p.x * s, y: oy + p.y * s }));
  }

  function finish(text, points) {
    const u = ui;
    u.done = true;
    cancelAnimationFrame(u.raf);
    u.root.classList.add('found');
    navigator.vibrate?.(30);
    const deliver = () => {
      close();
      u.onResult?.(text);
    };
    if (!points) return deliver();
    // Morph the scan frame into the detected code's outline with a spring.
    const fr = u.frame.getBoundingClientRect();
    const from = [{ x: fr.left, y: fr.top }, { x: fr.right, y: fr.top }, { x: fr.right, y: fr.bottom }, { x: fr.left, y: fr.bottom }];
    const to = toScreen(points);
    u.poly.style.display = '';
    u.frame.style.opacity = '0';
    ctx.play({ stiffness: 300, damping: 18 }, (p) => {
      const pts = from.map((a, i) => `${ctx.mix(a.x, to[i].x, p).toFixed(1)},${ctx.mix(a.y, to[i].y, p).toFixed(1)}`);
      u.poly.setAttribute('points', pts.join(' '));
    });
    setTimeout(deliver, 520);
  }

  function close(immediate) {
    const u = ui;
    if (!u) return;
    ui = null;
    u.done = true;
    cancelAnimationFrame(u.raf);
    u.stream?.getTracks().forEach((t) => t.stop());
    if (immediate) return u.root.remove();
    ctx.play({ stiffness: 360, damping: 32 }, (p) => {
      u.root.style.opacity = ctx.clamp(1 - p * 1.4, 0, 1).toFixed(3);
      u.root.style.transform = `scale(${ctx.mix(1, 1.04, p).toFixed(4)})`;
    }, () => u.root.remove());
  }

  window.LynqScan = { init(c) { ctx = c; }, open, close, get open_() { return !!ui; } };
})();
