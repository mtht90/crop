import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import './style.css';

import { AudioManager } from './audio.ts';
import { BASE } from './assets.ts';
import { BOARD, GAME } from './config.ts';
import { CREDITS } from './credits.ts';
import { Game } from './game.ts';
import { initPhysics, PusherPhysics } from './physics.ts';
import { PusherScene } from './scene.ts';
import { SlotScreen } from './slot.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function main(): Promise<void> {
  const loadBar = $('load-bar');
  const setProgress = (p: number) => (loadBar.style.width = `${Math.round(p * 100)}%`);

  await Promise.all([
    document.fonts.load('900 40px Orbitron'),
    document.fonts.load('700 40px Orbitron'),
  ]).catch(() => undefined);

  const audio = new AudioManager(BASE);
  const slot = new SlotScreen();
  const view = new PusherScene($('app'));
  await Promise.all([initPhysics(), slot.load(BASE), view.build(slot.canvas, (p) => setProgress(p * 0.9))]);

  $('load-text').textContent = '盤面を準備中…';
  await new Promise((r) => setTimeout(r, 30));
  const physics = new PusherPhysics();
  const game = new Game(physics, slot, audio, view);
  const resumed = game.start();
  // テスト用フック（?debug を付けたときだけ）
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __pusher: { game, physics, slot, view } });
  setProgress(1);

  // --- HUD ---
  const creditEl = $('credit');
  const jpEl = $('jackpot');
  let lastCredit = -1;
  let lastJp = -1;
  const refreshHud = () => {
    if (game.credit !== lastCredit) {
      creditEl.textContent = String(game.credit);
      if (game.credit > lastCredit && lastCredit >= 0) {
        creditEl.classList.remove('bump');
        void creditEl.offsetWidth;
        creditEl.classList.add('bump');
      }
      lastCredit = game.credit;
    }
    if (slot.jackpot !== lastJp) {
      jpEl.textContent = String(slot.jackpot);
      lastJp = slot.jackpot;
    }
  };
  game.onChange = refreshHud;

  const toasts = $('toasts');
  game.onToast = (text, kind = 'info') => {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    toasts.appendChild(el);
    while (toasts.children.length > 3) toasts.firstChild?.remove();
    setTimeout(() => el.remove(), 2700);
  };

  // --- 入力 ---
  let firing = false;
  let fireTimer = 0;
  let auto = false;
  const app = $('app');
  const setAim = (clientX: number, clientY: number) => {
    const nx = (clientX / window.innerWidth) * 2 - 1;
    const ny = (clientY / window.innerHeight) * 2 - 1;
    game.launcherX = Math.max(-BOARD.launcherRange, Math.min(BOARD.launcherRange, nx * BOARD.launcherRange * 1.25));
    view.parallax.set(nx * 0.3, -ny * 0.2);
  };
  app.addEventListener('pointermove', (e) => setAim(e.clientX, e.clientY));
  app.addEventListener('pointerdown', (e) => {
    setAim(e.clientX, e.clientY);
    // マウスはクリックで投入、タッチはドラッグで照準のみ（ボタンで投入）
    if (e.pointerType === 'mouse') {
      firing = true;
      fireTimer = 0;
    }
  });
  window.addEventListener('pointerup', () => (firing = false));
  window.addEventListener('blur', () => (firing = false));

  const insertBtn = $('btn-insert');
  insertBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    firing = true;
    fireTimer = 0;
    insertBtn.classList.add('pressed');
  });
  const releaseInsert = () => {
    firing = false;
    insertBtn.classList.remove('pressed');
  };
  insertBtn.addEventListener('pointerup', releaseInsert);
  insertBtn.addEventListener('pointerleave', releaseInsert);

  const autoBtn = $('btn-auto');
  const setAuto = (v: boolean) => {
    auto = v;
    autoBtn.classList.toggle('on', v);
    autoBtn.querySelector('small')!.textContent = v ? 'ON' : 'OFF';
  };
  autoBtn.addEventListener('click', () => setAuto(!auto));

  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        firing = true;
        fireTimer = 0;
      }
    }
    if (e.code === 'KeyB') setAuto(!auto);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') firing = false;
    keys.delete(e.code);
  });

  // --- メニュー ---
  const soundBtn = $('btn-sound');
  soundBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    soundBtn.textContent = audio.muted ? '🔇' : '🔊';
  });
  const info = $('info');
  $('credits-list').innerHTML = CREDITS.map(
    (c) =>
      `<div><b>${c.what}</b>：「${c.title}」 by ${c.author} — <span class="lic">${c.license}</span><br><a href="${c.url}" target="_blank" rel="noopener">${c.url}</a></div>`,
  ).join('');
  const openInfo = () => {
    const s = game.stats;
    $('stats').innerHTML = `
      <div>投入 <b>${s.inserted}</b></div>
      <div>獲得 <b>${s.won}</b></div>
      <div>JP回数 <b>${s.jackpots}</b></div>
      <div>最高クレジット <b>${s.bestCredit}</b></div>`;
    info.classList.remove('hidden');
    firing = false;
  };
  $('btn-info').addEventListener('click', openInfo);
  $('btn-close').addEventListener('click', () => info.classList.add('hidden'));
  $('btn-reset').addEventListener('click', () => {
    if (confirm(`データを消して最初（${GAME.startCredit}枚）からやり直しますか？`)) {
      game.reset();
      info.classList.add('hidden');
      game.onToast?.('リセットしました', 'info');
    }
  });
  window.addEventListener('pagehide', () => game.save());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.save();
  });

  // --- スタート ---
  $('load-text').textContent = resumed ? 'セーブデータから再開します' : `所持メダル ${GAME.startCredit} 枚でスタート！`;
  const startBtn = $('btn-start');
  startBtn.classList.remove('hidden');
  startBtn.addEventListener(
    'click',
    async () => {
      $('loading').classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('controls').classList.remove('hidden');
      await audio.unlock();
      audio.play('start', { volume: 0.7 });
    },
    { once: true },
  );

  // --- ループ ---
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (keys.has('ArrowLeft') || keys.has('KeyA')) game.launcherX = Math.max(-BOARD.launcherRange, game.launcherX - dt * 8);
    if (keys.has('ArrowRight') || keys.has('KeyD')) game.launcherX = Math.min(BOARD.launcherRange, game.launcherX + dt * 8);

    if ((firing || auto) && info.classList.contains('hidden')) {
      fireTimer -= dt;
      if (fireTimer <= 0) {
        if (game.insert()) fireTimer = GAME.autoFireInterval;
        else fireTimer = 0.05;
        if (auto && game.credit <= 0) setAuto(false);
      }
    }

    physics.update(dt);
    game.update(dt);
    view.setLauncherX(game.launcherX);
    const dirty = slot.draw();
    view.render(dt, physics, dirty);
    refreshHud();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  refreshHud();
}

main().catch((e) => {
  console.error(e);
  const t = document.getElementById('load-text');
  if (t) t.textContent = `読み込みに失敗しました: ${e instanceof Error ? e.message : e}`;
});
