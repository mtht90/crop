import './style.css';
import { App } from './app';
import { AnimViewer } from './viewer';
import { loadAssets } from './render/assets';

const root = document.getElementById('app')!;
if (location.hash.startsWith('#calib')) void import('./dev/calib').then((m) => m.calib(root));
else if (location.hash.startsWith('#sheet')) void import('./dev/sheet').then((m) => m.sheet(root));
else void boot();

async function boot() {
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = '<div class="logo">STAR ARENA</div><div class="bar"><i></i></div>';
  root.appendChild(loading);
  const bar = loading.querySelector('i')!;
  try {
    await loadAssets((p) => (bar.style.width = `${Math.round(p * 100)}%`));
  } catch (e) {
    loading.innerHTML = `<div class="panel">素材の読み込みに失敗しました。ページを再読み込みしてください。<br><small>${String(e)}</small></div>`;
    return;
  }
  loading.remove();
  if (new URLSearchParams(location.search).has('viewer') || location.hash === '#viewer') new AnimViewer(root);
  else {
    const app = new App(root);
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
  }
}
