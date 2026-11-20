import './style.css';
import { Game } from './game';
import { loadSkin } from './ui/skin';
import { UI } from './ui/ui';

// アーティファクト版では Google Fonts から読む（index は scripts/make-artifact.mjs が作る）
if (!import.meta.env.VITE_ARTIFACT) void import('./fonts');

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
