import { render } from 'preact';
import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import './styles.css';
import { game } from './game/store';
import * as L from './game/logic';
import { loadManifest } from './render/sprites';
import { App } from './ui/App';

async function boot() {
  await loadManifest();
  game.load();
  try {
    await Promise.race([document.fonts.load('800 16px "M PLUS Rounded 1c"'), new Promise((r) => setTimeout(r, 1500))]);
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
