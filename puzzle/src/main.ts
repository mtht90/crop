import { Container, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import { App } from './core/App';
import { Scenes } from './core/Scene';
import { Sound } from './core/Audio';
import { loadAll } from './core/Loader';
import { FONT_ROUND } from './core/UI';
import { installBitmapFonts } from './game/Hud';
import { TitleScene } from './scenes/TitleScene';
import { HomeScene } from './scenes/HomeScene';
import { BattleScene } from './scenes/BattleScene';
import { GachaScene } from './scenes/GachaScene';
import { CharaScene } from './scenes/CharaScene';

async function loadFonts(): Promise<void> {
  const sample = 'ぷにっとバトル討伐0123456789ABC';
  try {
    await Promise.all([
      document.fonts.load(`800 32px Rounded`, sample),
      document.fonts.load(`500 32px Rounded`, sample),
      document.fonts.load(`32px Dela`, sample),
    ]);
  } catch {
    /* fall back to system fonts */
  }
}

async function boot(): Promise<void> {
  gsap.ticker.lagSmoothing(200, 33);
  await loadFonts();
  await App.init();

  // simple in-canvas loading bar
  const loading = new Container();
  const bar = new Graphics();
  const label = new Text({ text: 'LOADING', style: { fontFamily: FONT_ROUND, fontWeight: '800', fontSize: 30, fill: 0xffffff } });
  label.anchor.set(0.5);
  loading.addChild(bar, label);
  App.root.addChild(loading);
  const draw = (p: number) => {
    loading.position.set(App.W / 2, App.H / 2);
    bar.clear();
    bar.roundRect(-200, 40, 400, 24, 12).fill({ color: 0xffffff, alpha: 0.2 });
    bar.roundRect(-200, 40, 400 * p, 24, 12).fill(0xff7ab8);
    label.text = `LOADING ${Math.round(p * 100)}%`;
  };
  draw(0);
  const boot = document.getElementById('boot');
  if (boot) boot.style.opacity = '0';
  await loadAll(draw);
  installBitmapFonts();
  loading.destroy({ children: true });
  boot?.remove();

  // first gesture anywhere unlocks audio
  const unlock = () => Sound.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  // prevent iOS double-tap zoom / pinch
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  Scenes.init();
  const start = new URLSearchParams(location.search).get('scene');
  const scenes: Record<string, () => import('./core/Scene').Scene> = {
    home: () => new HomeScene(),
    battle: () => new BattleScene(),
    gacha: () => new GachaScene(),
    chara: () => new CharaScene(),
  };
  Scenes.go(scenes[start ?? ''] ?? (() => new TitleScene()), true);
  // handle for automated playtests
  (window as unknown as { __game: unknown }).__game = { Scenes, App };
}

void boot();
