// エントリポイント：キャンバス・ループ・画面遷移
import { ASSETS } from './config.js';
import { buildSprites, buildGroundTile, applyAssetOverrides } from './sprites.js';
import { G, initGame, newRun, step, render, resize, setGround } from './game.js';
import { initInput, input, resetInput } from './input.js';
import { initAudio, music, setMuted, isMuted } from './audio.js';
import { FX } from './fx.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);
const debug = {
  t: params.get('t'), lv: params.get('lv'), god: params.has('god'), fps: params.has('debug'),
  speed: Math.max(1, Math.min(8, Number(params.get('speed')) || 1)),
};
const mobile = matchMedia('(pointer: coarse)').matches;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, dpr = 1;

function onResize() {
  W = innerWidth; H = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  input.stickRadius = Math.max(44, Math.min(W, H) * 0.09);
  resize(W, H);
}

buildSprites();
setGround(buildGroundTile());
applyAssetOverrides(ASSETS);
initGame({ debug, mobile });
initInput(canvas);
addEventListener('resize', onResize);
onResize();
document.body.classList.toggle('mobile', mobile);
if (debug.fps) document.getElementById('debug').classList.remove('hidden');

// ---- 画面遷移 ----
function start() {
  initAudio();
  music.start();
  resetInput();
  newRun();
}
function setPaused(p) {
  if (p && G.state === 'play') { G.state = 'paused'; UI.showPause(true); resetInput(); }
  else if (!p && G.state === 'paused') { G.state = 'play'; UI.showPause(false); }
}

document.getElementById('startBtn').addEventListener('click', start);
document.getElementById('retryBtn').addEventListener('click', start);
document.getElementById('titleBtn').addEventListener('click', () => { G.state = 'title'; UI.showTitle(); });
document.getElementById('pauseBtn').addEventListener('click', () => setPaused(true));
document.getElementById('resumeBtn').addEventListener('click', () => setPaused(false));
document.getElementById('quitBtn').addEventListener('click', () => { UI.showPause(false); G.state = 'title'; UI.showTitle(); });
for (const id of ['muteBtn', 'muteBtn2']) {
  const b = document.getElementById(id);
  const sync = () => document.querySelectorAll('.mute').forEach((x) => (x.textContent = isMuted() ? '音: OFF' : '音: ON'));
  b.addEventListener('click', () => { initAudio(); setMuted(!isMuted()); sync(); });
  sync();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

input.onKey = (e) => {
  if (G.state === 'levelup' && UI.levelUpOpen()) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (n !== undefined) UI.pick(n);
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    setPaused(G.state === 'play');
  } else if ((e.code === 'Enter' || e.code === 'Space') && (G.state === 'title' || G.state === 'result')) {
    start();
  }
};

// ---- メインループ ----
let last = performance.now();
let fpsAcc = 0, fpsN = 0;
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  if (G.state === 'play') for (let i = 0; i < debug.speed && G.state === 'play'; i++) step(rdt);
  else if (G.state === 'levelup') FX.update(rdt * 0.5);
  render(ctx, W, H, dpr);
  if (debug.fps) {
    fpsAcc += rdt; fpsN++;
    if (fpsAcc > 0.5) {
      G.debugText = `FPS ${Math.round(fpsN / fpsAcc)} | frame ${(performance.now() - t0).toFixed(1)}ms | 敵 ${G.enemies.length} 式神 ${G.allies.length} 弾 ${G.projs.length} 魂 ${G.gems.length} 粒子 ${FX.count()}`;
      fpsAcc = 0; fpsN = 0;
      if (G.state !== 'play') document.getElementById('debug').textContent = G.debugText;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// テスト・デバッグ用に公開
window.__G = G;
window.__UI = UI;
