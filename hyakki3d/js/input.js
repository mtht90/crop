// 入力：移動（WASD/矢印・左側ドラッグ）とカメラ旋回（マウスドラッグ・Q/E・スマホは右側ドラッグ）
// 出力の input.x / input.y はカメラ基準で回転済みのワールド方向（x→X, y→Z）
const keys = new Set();
export const input = {
  x: 0, y: 0,
  camYaw: 0,
  camDragging: false,
  stick: { active: false, ox: 0, oy: 0, x: 0, y: 0, id: -1 },
  look: { id: -1, lx: 0 },
  stickRadius: 56,
  onKey: null,
  sens: 0.006,
};

export function initInput(canvas, mobile) {
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (input.onKey) input.onKey(e);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); release(); });

  const st = input.stick, lk = input.look;
  canvas.addEventListener('pointerdown', (e) => {
    const touch = e.pointerType === 'touch';
    // タッチ：左半分＝移動スティック、右半分＝カメラ。マウス：ドラッグでカメラ
    if (touch && e.clientX < innerWidth * 0.5 && !st.active) {
      st.active = true; st.id = e.pointerId;
      st.ox = st.x = e.clientX; st.oy = st.y = e.clientY;
    } else if (lk.id === -1) {
      lk.id = e.pointerId; lk.lx = e.clientX; input.camDragging = true;
    }
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === st.id) {
      st.x = e.clientX; st.y = e.clientY;
      const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), R = input.stickRadius * 1.4;
      if (d > R) { st.ox = st.x - dx / d * R; st.oy = st.y - dy / d * R; }
    } else if (e.pointerId === lk.id) {
      input.camYaw -= (e.clientX - lk.lx) * input.sens * (e.pointerType === 'touch' ? 1.3 : 1);
      lk.lx = e.clientX;
    }
    e.preventDefault();
  });
  const end = (e) => {
    if (e.pointerId === st.id) { st.active = false; st.id = -1; }
    if (e.pointerId === lk.id) { lk.id = -1; input.camDragging = false; }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function release() {
  input.stick.active = false; input.stick.id = -1;
  input.look.id = -1; input.camDragging = false;
}

export function pollInput(dt = 1 / 60) {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (keys.has('KeyQ')) input.camYaw += dt * 2.2;
  if (keys.has('KeyE')) input.camYaw -= dt * 2.2;
  const st = input.stick;
  if (st.active) {
    const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy);
    if (d > 6) {
      const m = Math.min(1, (d - 6) / (input.stickRadius - 6));
      x += dx / d * m; y += dy / d * m;
    }
  }
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  // カメラの向きに合わせて回転（画面の上 = カメラの前方）
  const c = Math.cos(input.camYaw), s = Math.sin(input.camYaw);
  input.x = c * x + s * y;
  input.y = -s * x + c * y;
}

export function resetInput() { keys.clear(); release(); input.x = input.y = 0; }
