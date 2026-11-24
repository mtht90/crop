import './ui/style.css';
import { loadAssets } from './core/assets';
import { audio } from './core/audio';
import { Engine } from './render/engine';
import { buildField } from './render/field';
import { Hud } from './ui/hud';
import { Match } from './game/match';
import { loadingScreen, pauseMenu, resultScreen, setupScreen, titleScreen } from './ui/screens';

async function main() {
  const app = document.getElementById('app')!;
  const engine = new Engine(app);
  const loading = loadingScreen(app);
  const assets = await loadAssets((p) => loading.set(p));
  buildField(engine.scene, assets, engine.renderer);
  await document.fonts.ready;
  loading.done();
  engine.start();

  // タイトル背景：球場をゆっくり回る
  let t = 0;
  let orbit = true;
  engine.onUpdate((dt) => {
    if (!orbit) return;
    t += dt * 0.05;
    engine.fixedVFov = 50;
    engine.fitFov();
    engine.camera.position.set(Math.sin(t) * 26, 9 + Math.sin(t * 0.7) * 2, 6 + Math.cos(t) * 10);
    engine.camera.lookAt(0, 1, -14);
  });

  const hud = new Hud(app);
  hud.show(false);
  await titleScreen(app);
  audio.bgm('title');
  audio.ambience(true);
  for (;;) {
    orbit = true;
    hud.show(false);
    const cfg = await setupScreen(app);
    const away = cfg.user === 'away' ? cfg.team : cfg.opp;
    const home = cfg.user === 'home' ? cfg.team : cfg.opp;
    orbit = false;
    hud.show(true);
    audio.bgm('game');
    const autoplay = new URLSearchParams(location.search).has('auto');
    const match = new Match(engine, assets, hud, { away, home, user: cfg.user, innings: cfg.innings, difficulty: cfg.difficulty, autoplay });
    let quit = false;
    hud.pauseBtn.onclick = async () => {
      engine.paused = true;
      audio.play('ui_ok');
      const r = await pauseMenu(app);
      engine.paused = false;
      if (r === 'quit') {
        quit = true;
        match.dispose();
      }
    };
    const st = await match.run();
    hud.show(false);
    if (quit) {
      audio.bgm('title');
      continue;
    }
    match.dispose();
    orbit = true;
    const r = await resultScreen(app, st, cfg.user);
    audio.bgm('title');
    if (r === 'title') {
      await titleScreen(app);
    }
  }
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;padding:16px;white-space:pre-wrap">${String(e?.stack || e)}</pre>`);
});
