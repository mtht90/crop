import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { addPanel, addText, COLORS, CSS, GAME_W } from '../ui/theme';
import { Sound } from '../ui/Sound';
import type { ResultData } from './BattleScene';

const REASON: Record<string, string> = {
  king: '王の塔を撃破',
  crowns: '撃破数の差',
  overtime: '延長戦で先に撃破',
  hp: '塔の残りHPの差',
  draw: '完全に互角',
};

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: ResultData): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const win = data.outcome.winner === 0;
    const lose = data.outcome.winner === 1;
    Sound.playBgm(this, win ? 'bgm_win' : 'bgm_lose', false, 0.6);

    addPanel(this, GAME_W / 2, 520, 600, 560, 'ui_panel_blue');
    const title = addText(this, GAME_W / 2, 330, win ? '勝利！' : lose ? '敗北…' : '引き分け', 80, win ? CSS.gold : lose ? CSS.bad : '#ffffff');
    title.setScale(0.4);
    this.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.Out' });
    addText(this, GAME_W / 2, 420, REASON[data.outcome.reason] ?? '', 24, CSS.dim);

    addText(this, GAME_W / 2 - 140, 510, 'あなた', 26, CSS.player);
    addText(this, GAME_W / 2 + 140, 510, 'CPU', 26, CSS.cpu);
    addText(this, GAME_W / 2 - 140, 580, `★ ${data.crowns[0]}`, 52, CSS.gold);
    addText(this, GAME_W / 2 + 140, 580, `★ ${data.crowns[1]}`, 52, CSS.gold);
    addText(this, GAME_W / 2, 580, '-', 40, '#ffffff');
    addText(this, GAME_W / 2, 680, `撃破数（難易度：${data.difficulty === 'easy' ? 'やさしい' : 'ふつう'}）`, 20, CSS.dim);

    new Button(this, GAME_W / 2, 880, 'もう一度', () => {
      Sound.stopBgm();
      this.scene.start('Battle', { difficulty: data.difficulty });
    }, { width: 420, height: 88, size: 34 });
    new Button(this, GAME_W / 2, 1000, 'タイトルへ', () => {
      Sound.stopBgm();
      this.scene.start('Title');
    }, { width: 420, height: 76, size: 28, panel: 'ui_panel_blue', color: '#ffffff' });
  }
}
