import Phaser from 'phaser';
import type { Difficulty } from '../core/types';
import { Button } from '../ui/Button';
import { addText, COLORS, CSS, GAME_W } from '../ui/theme';
import { Sound } from '../ui/Sound';
import { buildArenaBackground } from '../ui/ArenaView';

const DIFF_LABEL: Record<Difficulty, string> = { easy: 'やさしい', normal: 'ふつう' };

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    buildArenaBackground(this).setAlpha(0.35);
    const difficulty = (): Difficulty => (this.registry.get('difficulty') as Difficulty) ?? 'normal';

    addText(this, GAME_W / 2, 200, 'ルーン・レーンズ', 64, CSS.gold);
    addText(this, GAME_W / 2, 268, 'RUNE LANES', 28, CSS.dim);
    addText(this, GAME_W / 2, 320, '山札を回し、塔を落とせ', 22, CSS.text);

    // 飾りのユニット
    const deco = ['unit_heavy_knight', 'unit_swordsman', 'unit_mage', 'unit_archer', 'unit_wyvern', 'unit_goblin'];
    deco.forEach((k, i) => {
      const img = this.add.image(120 + i * 96, 420, k).setScale(3.4);
      this.tweens.add({ targets: img, y: 410, duration: 500 + i * 60, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    });

    new Button(this, GAME_W / 2, 560, 'バトル開始', () => {
      Sound.stopBgm();
      this.scene.start('Battle', { difficulty: difficulty() });
    }, { width: 420, height: 92, size: 36 });

    const diffBtn = new Button(this, GAME_W / 2, 680, `難易度：${DIFF_LABEL[difficulty()]}`, () => {
      const next: Difficulty = difficulty() === 'normal' ? 'easy' : 'normal';
      this.registry.set('difficulty', next);
      diffBtn.setText(`難易度：${DIFF_LABEL[next]}`);
    }, { width: 420, height: 72, size: 28, panel: 'ui_panel_blue', color: '#ffffff' });

    new Button(this, GAME_W / 2, 780, 'デッキ確認', () => this.scene.start('DeckView'), { width: 420, height: 72, size: 28, panel: 'ui_panel_blue', color: '#ffffff' });
    new Button(this, GAME_W / 2, 880, 'クレジット', () => this.scene.start('Credits'), { width: 420, height: 72, size: 28, panel: 'ui_panel_blue', color: '#ffffff' });
    const soundBtn = new Button(this, GAME_W / 2, 980, `サウンド：${Sound.enabled ? 'ON' : 'OFF'}`, () => {
      Sound.setEnabled(this.game, !Sound.enabled);
      soundBtn.setText(`サウンド：${Sound.enabled ? 'ON' : 'OFF'}`);
      if (Sound.enabled) Sound.playBgm(this, 'bgm_title');
    }, { width: 420, height: 72, size: 28, panel: 'ui_panel_blue', color: '#ffffff' });

    addText(this, GAME_W / 2, 1120, 'カードを戦場へドラッグして配置', 18, CSS.dim);
    addText(this, GAME_W / 2, 1150, 'サポートカードは味方ユニットへドラッグ', 18, CSS.dim);
    if (this.sound.locked) addText(this, GAME_W / 2, 1200, '（画面をタップすると音が鳴ります）', 16, CSS.dim);

    Sound.playBgm(this, 'bgm_title');
  }
}
