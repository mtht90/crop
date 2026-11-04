import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { BattleScene } from './scenes/BattleScene';
import { ResultScene } from './scenes/ResultScene';
import { CreditsScene } from './scenes/CreditsScene';
import { DeckViewScene } from './scenes/DeckViewScene';
import { GAME_H, GAME_W } from './ui/theme';

async function boot(): Promise<void> {
  // Phaser のテキストはフォント読み込み後に描かないと代替フォントになるため待つ
  try {
    await Promise.race([
      document.fonts.load('20px DotGothic16', 'あア亜'),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch {
    /* フォントが無くても続行 */
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#14202b',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 2 },
    scene: [BootScene, TitleScene, BattleScene, ResultScene, CreditsScene, DeckViewScene],
  });
  // デバッグ・自動テスト用の参照
  (window as unknown as { __runeLanes: Phaser.Game }).__runeLanes = game;
}

void boot();
