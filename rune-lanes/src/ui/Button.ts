import Phaser from 'phaser';
import { addPanel, addText, CSS } from './theme';
import { Sound } from './Sound';

export interface ButtonOptions {
  width?: number;
  height?: number;
  size?: number;
  panel?: string;
  color?: string;
}

/** ピクセル UI パネルを使ったボタン */
export class Button extends Phaser.GameObjects.Container {
  readonly label: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.NineSlice;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: ButtonOptions = {}) {
    super(scene, x, y);
    const w = opts.width ?? 360;
    const h = opts.height ?? 76;
    this.bg = addPanel(scene, 0, 0, w, h, opts.panel ?? 'ui_panel_card');
    this.label = addText(scene, 0, -2, text, opts.size ?? 30, opts.color ?? CSS.dark, { strokeThickness: 0 });
    this.add([this.bg, this.label]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      this.setScale(0.95);
    });
    this.on('pointerout', () => this.setScale(1));
    this.on('pointerup', () => {
      this.setScale(1);
      Sound.se(scene, 'se_button', 0.6);
      onClick();
    });
    scene.add.existing(this);
  }

  setText(t: string): this {
    this.label.setText(t);
    return this;
  }
}
