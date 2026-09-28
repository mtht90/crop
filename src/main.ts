import './style.css';
import { setNotation } from './core/format';
import { Game } from './core/game';
import { loadFromStorage } from './core/save';
import { applyOffline } from './logic/offline';
import { scheduleNextComet } from './logic/comets';
import { mountApp, showOfflineReport } from './ui/app';

const saved = loadFromStorage();
const game = new Game(saved ?? undefined);
setNotation(game.s.settings.notation);
if (!saved) scheduleNextComet(game);

const report = saved ? applyOffline(game) : null;
const root = document.getElementById('app');
if (root) {
  mountApp(root, game);
  if (report) showOfflineReport(game, report);
}

// デバッグ用 (ブラウザのコンソールから参照できる)
(window as unknown as { game: Game }).game = game;
