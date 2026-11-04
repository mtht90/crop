import Phaser from 'phaser';

export const GAME_W = 720;
export const GAME_H = 1280;
export const FONT = 'DotGothic16, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

export const COLORS = {
  bg: 0x14202b,
  player: 0x4aa8ff,
  cpu: 0xff5a5a,
  gold: 0xffd34d,
  mana: 0xd26bff,
  manaDark: 0x3a1f52,
  ok: 0x7dff8a,
  bad: 0xff4444,
  white: 0xffffff,
  shadow: 0x000000,
};

export const CSS = {
  text: '#f4efe0',
  dim: '#9fb3c2',
  gold: '#ffd34d',
  player: '#7cc4ff',
  cpu: '#ff8a8a',
  mana: '#e7a6ff',
  bad: '#ff7070',
  dark: '#2b1d10',
};

export function textStyle(size: number, color: string = CSS.text, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: '#10161c',
    strokeThickness: Math.max(2, Math.round(size / 6)),
    ...extra,
  };
}

export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color: string = CSS.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, textStyle(size, color, extra)).setOrigin(0.5);
}

/** 32px のパネル画像を9スライスで任意サイズに */
export function addPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = 'ui_panel_card'): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(x, y, key, undefined, w, h, 10, 10, 10, 10);
}
