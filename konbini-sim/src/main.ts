import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-jp/900.css';
import '@fontsource/dela-gothic-one/400.css';
import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Assets } from './core/Assets';
import { Audio } from './core/Audio';
import { UI } from './ui/UI';
import { Game } from './game/Game';
import { prepareProductArt } from './world/ProductVisuals';

declare global {
  interface Window {
    __game?: Game;
    __engine?: Engine;
    DONE?: boolean;
    SHOT?: string;
    INFO?: unknown;
  }
}

async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const ui = new UI(document.getElementById('ui')!);
  const loading = ui.loading();
  const engine = new Engine(canvas);
  const assets = new Assets();
  const audio = new Audio();
  const params = new URLSearchParams(location.search);
  await assets.loadAll((p, l) => loading.set(p * 0.9, l));
  loading.set(0.92, '商品パッケージを印刷中…');
  await prepareProductArt();
  loading.set(0.96, 'サウンドを準備中…');
  await audio.decode(assets);
  const game = new Game(engine, assets, audio, ui);
  window.__game = game;
  window.__engine = engine;
  loading.done();

  // Title: slow dolly shot of the shop at dusk
  game.state.minute = 18.6 * 60;
  let t = 0;
  const titleCam = (dt: number) => {
    if (game.mode !== 'title') return;
    t += dt;
    const a = -0.35 + Math.sin(t * 0.05) * 0.25;
    engine.camera.position.set(Math.sin(a) * 15 - 1, 2.1 + Math.sin(t * 0.1) * 0.2, 5 + Math.cos(a) * 11);
    engine.camera.lookAt(-0.5, 1.7, 3.5);
  };
  engine.onUpdate(titleCam, 10);
  engine.start();

  const start = (cont: boolean) => {
    closeTitle();
    audio.resume();
    const fade = document.createElement('div');
    fade.className = 'fade-black on';
    ui.root.append(fade);
    setTimeout(() => {
      if (!(cont && game.continueGame())) game.newGame();
      setTimeout(() => {
        fade.classList.remove('on');
        setTimeout(() => fade.remove(), 900);
      }, 200);
    }, 700);
  };
  let closeTitle = () => {};
  const showTitle = () => {
    closeTitle = ui.title({
      hasSave: game.hasSave(),
      onNew: () => start(false),
      onContinue: () => start(true),
      onHelp: () => { closeTitle(); game.menus.help(showTitle); },
      onSettings: () => { closeTitle(); game.menus.settings(showTitle); },
    });
  };

  // Automated test hooks: ?test=new starts a new game immediately.
  if (params.get('test')) {
    engine.stop();
    game.headless = true;
    const w = window as unknown as Record<string, unknown>;
    w.__sim = (sec: number, dt = 1 / 30) => {
      for (let x = 0; x < sec; x += dt) engine.simulate(dt);
    };
    w.__shot = (q = 0.85) => {
      engine.composer.render(0.016);
      return canvas.toDataURL('image/jpeg', q);
    };
    if (params.get('test') === 'new') game.newGame();
    window.DONE = true;
  } else showTitle();
  void THREE;
}

boot().catch((e) => {
  console.error(e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:20px;color:#f88;white-space:pre-wrap;z-index:9';
  el.textContent = `起動に失敗しました\n${e?.stack ?? e}`;
  document.body.append(el);
});
