// スワイプ入力。石をつかんで、くるくる回して(カーブ)、上へはじいて投げる。
// 回転は「回した量 × 回す速さ」で溜まり、回すのを止めると抜けていく。溜めすぎると回しすぎ。
const TAU = Math.PI * 2;
const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

// 回転の溜まり方
export const SPIN_MAX = 1.5; // これ以上は溜まらない(1 を超えると回しすぎ)
export const SPIN_MIN = 0.12; // これ未満はカーブしない
const GRACE = 0.12; // 回すのを止めてから抜け始めるまでの猶予(秒)
const HALF_LIFE = 0.45; // 止めているとこの秒数で半分に抜ける

/** 回した角度 d(rad) を溜める。速く回すほど1周あたりの溜まりが多い。 */
function addTurn(s, d, now) {
  s.charge = decayed(s, now);
  const dt = Math.max(0.008, (now - s.anchor.t) / 1000);
  const rate = Math.abs(d) / dt; // rad/s(2周/秒 ≒ 12.6)
  // 速く回すほど溜まるが頭打ち。溜まるほど重くなる(抵抗)
  const speedK = Math.min(1.3, Math.max(0.35, rate / 14));
  const resist = s.charge < 1 ? 1 - 0.5 * s.charge : 0.5;
  const gain = (Math.abs(d) / TAU) * 0.17 * speedK * resist;
  const sign = Math.sign(d);
  if (s.dir === 0 || sign === s.dir) {
    s.dir = sign;
    s.charge = Math.min(SPIN_MAX, s.charge + gain);
  } else {
    // 逆向きに回すと打ち消し合う
    s.charge -= gain * 1.5;
    if (s.charge < 0) {
      s.charge = -s.charge;
      s.dir = sign;
    }
  }
  s.lastTurnAt = now;
}

function decayed(s, now) {
  if (!s.charge) return 0;
  const idle = Math.max(0, (now - s.lastTurnAt) / 1000 - GRACE);
  return s.charge * Math.pow(0.5, idle / HALF_LIFE);
}

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
      x: e.clientX,
      y: e.clientY,
      anchor: { x: e.clientX, y: e.clientY, t: performance.now() },
      lastAngle: null,
      charge: 0, // 溜まった回転 0..MAX(1を超えると回しすぎ)
      dir: 0, // +1 = 時計回り(右へカーブ) / -1 = 反時計回り
      lastTurnAt: 0,
      /** 時刻 now での回転(止めていた時間ぶん抜けた値) */
      spinAt(now) {
        return { charge: decayed(this, now), dir: this.dir };
      },
    };
    h.onGrab(s);
  }

  function move(e) {
    if (!s || e.pointerId !== s.id) return;
    e.preventDefault();
    const now = performance.now();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const t = ev.timeStamp > 0 ? Math.min(ev.timeStamp, now) : now;
      s.pts.push({ x: ev.clientX, y: ev.clientY, t });
      const dx = ev.clientX - s.anchor.x;
      const dy = ev.clientY - s.anchor.y;
      if (dx * dx + dy * dy > 64) {
        const ang = Math.atan2(dy, dx);
        if (s.lastAngle !== null) {
          const d = wrap(ang - s.lastAngle);
          // 急な折り返し(ほぼ逆向き)や、ほぼ直線の動きは回転とみなさない
          if (Math.abs(d) < 1.6 && Math.abs(d) > 0.05) addTurn(s, d, t);
        }
        s.lastAngle = ang;
        s.anchor = { x: ev.clientX, y: ev.clientY, t };
      }
    }
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
    const spinNow = decayed(cur, now);
    // はじき方のまっすぐさ(0..1): 最後の動きの直線距離 ÷ 実際に動いた道のり
    let path = 0;
    let startIdx = pts.indexOf(first);
    for (let i = startIdx + 1; i < pts.length; i++) path += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const chord = Math.hypot(last.x - first.x, last.y - first.y);
    const straight = path > 1 ? chord / path : 1;
    if (up > 0.9 && !stale) {
      h.onThrow({
        up,
        side,
        x: cur.x,
        y: cur.y,
        straight,
        // 回転が弱すぎるときは回していない扱い
        spin: spinNow >= SPIN_MIN ? spinNow : 0,
        spinDir: spinNow >= SPIN_MIN ? cur.dir : 0,
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
