import { render } from 'preact';
import '@fontsource/zen-kaku-gothic-new/500.css';
import '@fontsource/zen-kaku-gothic-new/700.css';
import '@fontsource/shippori-mincho-b1/800.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/bungee/400.css';
import '@fontsource/bungee-outline/400.css';
import './styles.css';
import { game } from './game/store';
import * as L from './game/logic';
import { loadManifest } from './render/sprites';
import { App } from './ui/App';

async function boot() {
  await loadManifest();
  game.load();
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 16px "Zen Kaku Gothic New"'), document.fonts.load('800 16px "Shippori Mincho B1"'), document.fonts.load('700 16px "Cinzel"'), document.fonts.load('16px "Bungee"'), document.fonts.load('16px "Bungee Outline"')]),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch {
    /* ignore */
  }
  document.getElementById('boot')?.remove();
  render(<App />, document.getElementById('root')!);
  (window as any).__game = game;

  // background bookkeeping: auto-train, daily reset
  setInterval(() => {
    const s = game.save;
    L.rollDaily(s);
    if (s.settings.autoTrain && L.autoTrain(s) > 0) game.recalc();
    s.stats.played += 1;
  }, 1000);
}
boot();
