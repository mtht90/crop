import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import './styles/base.css';
import './styles/ui.css';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const uiRoot = document.getElementById('ui')!;

async function main() {
  if (params.has('gallery')) {
    const m = await import('./debug-gallery');
    return m.runGallery(app, params.get('gallery') || 'items');
  }
  const loader = document.createElement('div');
  loader.className = 'loader';
  loader.innerHTML = `<div class="ld-logo">♻ RECYCLE SHOP SIMULATOR</div><div class="ld-title">リサイクルショップ・シミュレーター</div><div class="ld-bar"><i></i></div><div class="ld-label">素材を読み込んでいます…</div>`;
  document.body.appendChild(loader);
  const bar = loader.querySelector('i') as HTMLElement;
  const label = loader.querySelector('.ld-label') as HTMLElement;
  const { Game } = await import('./game/game');
  const game = new Game(app, uiRoot);
  (window as any).__game = game;
  try {
    await game.boot((p, l) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      label.textContent = `素材を読み込んでいます… ${Math.round(p * 100)}%  ${l.split('/').pop()}`;
    });
  } catch (e) {
    label.textContent = `読み込みに失敗しました: ${(e as Error).message}`;
    throw e;
  }
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 700);
  (window as any).__ready = true;
}

main();
