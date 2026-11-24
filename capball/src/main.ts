import './ui/style.css';
import { loadAssets, type Assets } from './core/assets';
import { Character } from './render/character';
import { TEAMS } from './game/data';
import { audio } from './core/audio';
import { Engine } from './render/engine';
import { buildField } from './render/field';
import { Hud } from './ui/hud';
import { Match } from './game/match';
import { loadingScreen, pauseMenu, resultScreen, setupScreen, titleScreen } from './ui/screens';

async function main() {
  const app = document.getElementById('app')!;
  const engine = new Engine(app);
  engine.start();

  // タイトルを先に出し、裏で素材を読み込む
  let setProgress: (p: number) => void = () => {};
  const assetsP = loadAssets((p) => setProgress(p * 0.85));
  let warm: Promise<void> = Promise.resolve();
  const ready = assetsP.then(async (assets) => {
    buildField(engine.scene, assets, engine.renderer);
    setProgress(1);
    // 選手のユニフォーム塗り替えとシェーダーの準備は、タイトル・設定画面の裏で進める
    warm = new Promise((r) => setTimeout(r, 600)).then(() => warmUp(engine, assets));
    return assets;
  });
  const title = titleScreen(app, ready, (cb) => (setProgress = cb));
  const assets = await ready;

  // タイトル背景：球場をゆっくり回る
  let t = 0;
  let orbit = true;
  engine.onUpdate((dt) => {
    if (!orbit) return;
    t += dt * 0.05;
    engine.fixedVFov = 50;
    engine.fitFov();
    engine.camera.position.set(Math.sin(t) * 20, 7 + Math.sin(t * 0.7) * 1.5, 4 + Math.cos(t) * 8);
    engine.camera.lookAt(0, 1, -8);
  });

  const hud = new Hud(app);
  hud.show(false);
  await title;
  audio.bgm('title');
  audio.ambience(true);
  for (;;) {
    orbit = true;
    hud.show(false);
    const cfg = await setupScreen(app);
    let warmed = false;
    warm.then(() => (warmed = true));
    await new Promise((r) => setTimeout(r, 0));
    if (!warmed) {
      const l = loadingScreen(app);
      l.set(0.9);
      await warm;
      l.done();
    }
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

/** 両チーム・両ユニフォームの選手を一度作って描き、テクスチャとシェーダーを用意しておく */
async function warmUp(engine: Engine, assets: Assets) {
  const tmp: Character[] = [];
  for (const team of TEAMS) {
    for (const uni of [team.uniform, team.awayUniform]) {
      for (const p of [...team.players, ...team.bench]) {
        const c = new Character(assets.models[p.model], p.model, uni, assets.anims);
        c.attachBat(assets.bat.scene);
        c.root.position.set(0, -50, 0);
        engine.scene.add(c.root);
        tmp.push(c);
        await new Promise((r) => setTimeout(r, 16));
      }
    }
  }
  try {
    await engine.renderer.compileAsync(engine.scene, engine.camera);
  } catch {
    engine.renderer.compile(engine.scene, engine.camera);
  }
  for (const c of tmp) engine.scene.remove(c.root);
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;padding:16px;white-space:pre-wrap">${String(e?.stack || e)}</pre>`);
});
