// 入力：キーボード（WASD/矢印）＋ タッチ/マウスのフローティング仮想スティック
const keys = new Set();
export const input = {
  x: 0, y: 0,            // -1..1 の移動ベクトル
  stick: { active: false, ox: 0, oy: 0, x: 0, y: 0, id: -1 }, // 画面座標(CSS px)
  stickRadius: 56,
  onPause: null,
  onKey: null,
};

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (input.onKey) input.onKey(e);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); release(); });

  const st = input.stick;
  canvas.addEventListener('pointerdown', (e) => {
    if (st.active) return;
    st.active = true; st.id = e.pointerId;
    st.ox = st.x = e.clientX; st.oy = st.y = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!st.active || e.pointerId !== st.id) return;
    st.x = e.clientX; st.y = e.clientY;
    // スティックを指に追従させる（離れすぎたら原点を引っ張る）
    const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), R = input.stickRadius * 1.4;
    if (d > R) { st.ox = st.x - dx / d * R; st.oy = st.y - dy / d * R; }
    e.preventDefault();
  });
  const end = (e) => { if (e.pointerId === st.id) release(); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function release() { const st = input.stick; st.active = false; st.id = -1; }

export function pollInput() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  const st = input.stick;
  if (st.active) {
    const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy);
    const dead = 6;
    if (d > dead) {
      const m = Math.min(1, (d - dead) / (input.stickRadius - dead));
      x += dx / d * m; y += dy / d * m;
    }
  }
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  input.x = x; input.y = y;
}

export function resetInput() { keys.clear(); release(); input.x = input.y = 0; }
