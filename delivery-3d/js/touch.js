// スマートフォン・タブレット用のタッチ操作
// 左下：スティック（歩く・ハンドル）、画面のドラッグ：見回す、右下：ボタンとペダル
// キーボードと同じ入口（onKey / G.keys）に流し込むので、ゲーム側の処理はそのまま使える
import { G, onKey, onMouse } from './game.js';

export const IS_TOUCH = (() => {
  try { return matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches); } catch (e) { return false; }
})();

if (IS_TOUCH) document.body.classList.add('touch');

const press = (code) => { onKey(code, true); setTimeout(() => onKey(code, false), 60); };

export function initTouch() {
  if (!IS_TOUCH) return;
  document.body.classList.add('touch');
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="t-top">
      <button data-tap="Tab">端末</button>
      <button data-tap="Escape">メニュー</button>
    </div>
    <div class="t-stick" id="t-stick"><div class="t-base"></div><div class="t-knob" id="t-knob"></div></div>
    <div class="t-pad t-walk">
      <button class="t-big" data-tap="KeyE" id="t-act">操作</button>
      <button data-tap="KeyF">乗る</button>
      <button data-toggle="ShiftLeft" id="t-run">走る</button>
    </div>
    <div class="t-pad t-drive">
      <div class="t-row">
        <button data-tap="KeyQ">◀</button>
        <button data-tap="KeyH">ホーン</button>
        <button data-tap="KeyE">▶</button>
      </div>
      <div class="t-row">
        <button data-tap="KeyF">降りる</button>
        <button data-tap="KeyV">視点</button>
        <button data-tap="Space">サイド</button>
        <button data-tap="KeyG">ハザード</button>
      </div>
      <div class="t-pedals">
        <button class="t-pedal t-brake" data-hold="_brk">ブレーキ</button>
        <button class="t-pedal t-acc" data-hold="_thr">アクセル</button>
      </div>
    </div>`;
  document.getElementById('hud').appendChild(root);

  // ボタン
  for (const b of root.querySelectorAll('[data-tap]')) {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); press(b.dataset.tap); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('on'); }, { passive: false });
  }
  for (const b of root.querySelectorAll('[data-toggle]')) {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); const k = b.dataset.toggle; G.keys[k] = !G.keys[k]; b.classList.toggle('on', !!G.keys[k]); }, { passive: false });
  }
  // ペダル：押している間だけ。指を少し下にずらすと強く踏む
  for (const b of root.querySelectorAll('[data-hold]')) {
    const k = b.dataset.hold;
    const set = (e) => { const t = e.targetTouches[0]; if (!t) return; const r = b.getBoundingClientRect(); G.keys[k] = Math.max(0.35, Math.min(1, (t.clientY - r.top) / r.height * 1.3)); };
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); set(e); }, { passive: false });
    b.addEventListener('touchmove', (e) => { e.preventDefault(); set(e); }, { passive: false });
    const up = (e) => { e.preventDefault(); b.classList.remove('on'); G.keys[k] = 0; };
    b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
  }
  // 画面に出る「E 〜する」の案内も、触ると実行
  const prompt = document.getElementById('prompt');
  prompt.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); press('KeyE'); }, { passive: false });

  // スティック
  const stick = document.getElementById('t-stick'), knob = document.getElementById('t-knob');
  let sid = null, sx = 0, sy = 0;
  const R = 52;
  const moveStick = (x, y) => {
    let dx = x - sx, dy = y - sy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    G.keys._mx = dx / R; G.keys._my = dy / R;
    G.keys._steer = -dx / R;
  };
  const resetStick = () => { sid = null; knob.style.transform = ''; G.keys._mx = 0; G.keys._my = 0; G.keys._steer = 0; };
  stick.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    const t = e.changedTouches[0]; sid = t.identifier;
    const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    moveStick(t.clientX, t.clientY);
  }, { passive: false });
  stick.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === sid) moveStick(t.clientX, t.clientY); }, { passive: false });
  stick.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === sid) resetStick(); });
  stick.addEventListener('touchcancel', resetStick);

  // 見回し：ボタン以外の場所をドラッグ
  const canvas = document.getElementById('c');
  const looks = new Map();
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of e.changedTouches) looks.set(t.identifier, { x: t.clientX, y: t.clientY }); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = looks.get(t.identifier); if (!p) continue;
      const dx = (t.clientX - p.x) * 2.4, dy = (t.clientY - p.y) * 2.4;
      p.x = t.clientX; p.y = t.clientY;
      onMouse(dx, dy, 2); // 運転中は「見回し」として扱う
    }
  }, { passive: false });
  const endLook = (e) => { for (const t of e.changedTouches) looks.delete(t.identifier); };
  canvas.addEventListener('touchend', endLook); canvas.addEventListener('touchcancel', endLook);

  // 歩き／運転でボタンを切り替える
  const sync = () => {
    root.dataset.mode = G.overlay ? 'ui' : G.mode;
    requestAnimationFrame(sync);
  };
  sync();
}
