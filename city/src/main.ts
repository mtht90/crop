import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import './style.css';
import { Game } from './game';
import { loadSkin } from './ui/skin';
import { UI } from './ui/ui';

async function boot() {
  const app = document.getElementById('app')!;
  const loading = document.getElementById('loading');
  await loadSkin();
  const game = new Game(document.getElementById('city')!);
  new UI(game, app);
  await game.start();
  loading?.remove();
  // デバッグ用（コンソールから状態を見られる）
  (window as unknown as { game: Game }).game = game;
}

void boot();
