import '@fontsource/dotgothic16/400.css';
import './style.css';
import Phaser from 'phaser';
import { Controller } from './controller';
import { WorldScene } from './render/WorldScene';
import { applySkin } from './ui/skin';

async function boot() {
  // フォントとUIスキンを先に用意する(Phaserの文字もこのフォントで描くため)
  await Promise.all([document.fonts.load('16px "DotGothic16"').catch(() => undefined), applySkin()]);
  const ctl = new Controller();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#47aba9',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [],
    fps: { target: 60 },
    audio: { disableWebAudio: false },
  });
  game.registry.set('ctl', ctl);
  game.scene.add('world', WorldScene, true);
  (window as unknown as { kurashi: Controller }).kurashi = ctl;
}

boot().catch((e) => {
  console.error(e);
  const msg = document.getElementById('load-msg');
  if (msg) msg.textContent = '読み込みに失敗しました。素材が配置されているか確認してください。';
});
