// スワイプ入力。石をつかんで、くるくる回して(カーブ)、上へはじいて投げる。
const TAU = Math.PI * 2;
const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

/**
 * @param {HTMLElement} el
 * @param {object} h
 * @param {(x:number,y:number)=>boolean} h.canGrab 指を置いた位置で石をつかめるか
 * @param {(s:object)=>void} h.onGrab
 * @param {(s:object)=>void} h.onDrag
 * @param {(t:object)=>void} h.onThrow
 * @param {()=>void} h.onCancel
 */
export function createSwipeInput(el, h) {
  let s = null;

  function down(e) {
    if (s || !h.canGrab(e.clientX, e.clientY)) return;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    s = {
      id: e.pointerId,
      pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }],
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      anchor: { x: e.clientX, y: e.clientY },
      lastAngle: null,
      turn: 0, // 曲がった角度の合計(rad)
      spin: 0, // 0..1 回転の強さ
      spinDir: 0,
      spinning: false,
    };
    h.onGrab(s);
  }

  function move(e) {
    if (!s || e.pointerId !== s.id) return;
    e.preventDefault();
    const now = performance.now();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      s.pts.push({ x: ev.clientX, y: ev.clientY, t: now });
      const dx = ev.clientX - s.anchor.x;
      const dy = ev.clientY - s.anchor.y;
      if (dx * dx + dy * dy > 64) {
        const ang = Math.atan2(dy, dx);
        if (s.lastAngle !== null) {
          const d = wrap(ang - s.lastAngle);
          // 急な折り返し(ほぼ逆向き)は回転とみなさない
          if (Math.abs(d) < 1.6) s.turn += d;
        }
        s.lastAngle = ang;
        s.anchor = { x: ev.clientX, y: ev.clientY };
      }
    }
    // 回した量が 1.25 周を超えたらカーブ投げ
    const loops = Math.abs(s.turn) / TAU;
    if (!s.spinning && loops >= 1.25) {
      s.spinning = true;
      s.spinDir = Math.sign(s.turn);
    }
    if (s.spinning) s.spin = Math.min(1, 0.55 + (loops - 1.25) * 0.3);
    s.x = e.clientX;
    s.y = e.clientY;
    if (s.pts.length > 400) s.pts.splice(0, s.pts.length - 400);
    h.onDrag(s);
  }

  function up(e) {
    if (!s || e.pointerId !== s.id) return;
    e.preventDefault();
    const cur = s;
    s = null;
    const now = performance.now();
    // 最後の 90ms の動きから、はじいた速さと向きを出す
    const pts = cur.pts;
    const last = pts[pts.length - 1];
    let first = last;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (now - pts[i].t > 90) break;
      first = pts[i];
    }
    const dt = Math.max(16, last.t - first.t);
    const vx = (last.x - first.x) / dt; // px/ms
    const vy = (last.y - first.y) / dt;
    const H = window.innerHeight;
    const up = (-vy * 1000) / H; // 画面の高さ/秒
    const side = (vx * 1000) / H;
    const stale = now - last.t > 140; // 指を止めてから離した
    if (up > 0.9 && !stale) {
      h.onThrow({
        up,
        side,
        x: cur.x,
        y: cur.y,
        spin: cur.spinning ? cur.spin : 0,
        spinDir: cur.spinning ? cur.spinDir : 0,
      });
    } else {
      h.onCancel(cur);
    }
  }

  el.addEventListener('pointerdown', down, { passive: false });
  el.addEventListener('pointermove', move, { passive: false });
  el.addEventListener('pointerup', up, { passive: false });
  el.addEventListener('pointercancel', (e) => {
    if (s && e.pointerId === s.id) {
      const cur = s;
      s = null;
      h.onCancel(cur);
    }
  });
  return {
    get active() {
      return !!s;
    },
  };
}
