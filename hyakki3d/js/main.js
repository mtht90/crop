// エントリポイント：読み込み・画面遷移・メインループ
import { G, initGame, newRun, step, resize } from './game.js';
import { initInput, input, resetInput } from './input.js';
import { initAudio, preloadAudio, music, setMuted, isMuted } from './audio.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { R } from './r3d/render.js';
import { loadModels } from './r3d/models.js';

const params = new URLSearchParams(location.search);
const debug = {
  t: params.get('t'), lv: params.get('lv'), god: params.has('god'), fps: params.has('debug'),
  speed: Math.max(1, Math.min(8, Number(params.get('speed')) || 1)),
};
const mobile = matchMedia('(pointer: coarse)').matches;
const canvas = document.getElementById('game');
let W = 0, H = 0, dpr = 1, ready = false;

initGame({ debug, mobile });
R.init(canvas, mobile);
FX.attach(R.scene, R.cam, document.getElementById('dmgLayer'), mobile);
initInput(canvas, mobile);
preloadAudio();
document.body.classList.toggle('mobile', mobile);
if (debug.fps) document.getElementById('debug').classList.remove('hidden');

function onResize() {
  W = innerWidth; H = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.75);
  R.resize(W, H, dpr);
  input.stickRadius = Math.max(44, Math.min(W, H) * 0.09);
  resize();
}
addEventListener('resize', onResize);
onResize();

// タイトル画面の背景：陰陽師が佇む夜の野原をゆっくり回り込む
const titleDummy = { x: 0, y: 0, hp: 1, maxHp: 1, r: 12, fx: 0, fy: -1, moving: false, hurtT: 0, walk: 0, yaw: 0 };

const startBtn = document.getElementById('startBtn');
startBtn.disabled = true;
(async () => {
  try {
    const fonts = document.fonts ? Promise.all([
      document.fonts.load('48px "Yuji Boku"', '百鬼祓い'),
      document.fonts.load('16px "Zen Maru Gothic"', '式霊影忍前鬼飛龍'),
      document.fonts.load('16px "Dela Gothic One"', '0123456789連祓'),
    ]).catch(() => {}) : Promise.resolve();
    let a = 0, b = 0;
    const prog = () => { startBtn.textContent = `読込中 ${Math.round((a * 0.7 + b * 0.3) * 100)}%`; };
    await Promise.all([loadModels((k) => { a = k; prog(); }), R.load((k) => { b = k; prog(); })]);
    R.build(G.limits);
    G.onKill = (e) => R.onKill(e);
    await Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
    G.player = titleDummy;
    ready = true;
    startBtn.textContent = '出陣';
    startBtn.disabled = false;
  } catch (err) {
    startBtn.textContent = '読み込み失敗';
    console.error(err);
  }
})();

function start() {
  if (!ready) return;
  initAudio();
  music.start();
  resetInput();
  FX.clear();
  R.resetRun();
  newRun();
}
function setPaused(p) {
  if (p && G.state === 'play') { G.state = 'paused'; UI.showPause(true); resetInput(); }
  else if (!p && G.state === 'paused') { G.state = 'play'; UI.showPause(false); }
}

startBtn.addEventListener('click', start);
document.getElementById('retryBtn').addEventListener('click', start);
document.getElementById('titleBtn').addEventListener('click', toTitle);
document.getElementById('pauseBtn').addEventListener('click', () => setPaused(true));
document.getElementById('resumeBtn').addEventListener('click', () => setPaused(false));
document.getElementById('quitBtn').addEventListener('click', () => { UI.showPause(false); toTitle(); });
function toTitle() {
  G.state = 'title';
  FX.clear();
  R.resetRun();
  G.enemies.length = 0; G.allies.length = 0; G.projs.length = 0; G.gems.length = 0; G.pickups.length = 0; G.bullets.length = 0;
  G.boss = null;
  G.player = titleDummy;
  UI.showTitle();
  music.title();
}
for (const id of ['muteBtn', 'muteBtn2']) {
  const b = document.getElementById(id);
  const sync = () => document.querySelectorAll('.mute').forEach((x) => (x.textContent = isMuted() ? '音：切' : '音：入'));
  b.addEventListener('click', () => { initAudio(); setMuted(!isMuted()); sync(); });
  sync();
}
addEventListener('pointerdown', () => { initAudio(); if (G.state === 'title') music.title(); }, { once: true });
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
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  if (G.state === 'play') { for (let i = 0; i < debug.speed && G.state === 'play'; i++) step(rdt); }
  else {
    FX.update(rdt * (G.state === 'levelup' ? 0.5 : 1));
    if (G.state === 'title') { input.camYaw += rdt * 0.12; G.time += rdt; }
  }
  if (ready) R.render(G, rdt);
  if (debug.fps) {
    fpsAcc += rdt; fpsN++;
    if (fpsAcc > 0.5) {
      const info = R.r.info.render;
      G.debugText = `FPS ${Math.round(fpsN / fpsAcc)} | ${(performance.now() - t0).toFixed(1)}ms | draw ${info.calls} tri ${(info.triangles / 1000).toFixed(0)}k | 敵 ${G.enemies.length} 式神 ${G.allies.length} 粒子 ${FX.count()}`;
      fpsAcc = 0; fpsN = 0;
      document.getElementById('debug').textContent = G.debugText;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__G = G;
window.__UI = UI;
window.__R = R;
