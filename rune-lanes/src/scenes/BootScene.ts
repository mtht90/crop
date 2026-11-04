import Phaser from 'phaser';
import { MANIFEST } from '../data';
import { addText, COLORS, CSS, GAME_H, GAME_W } from '../ui/theme';
import { Sound } from '../ui/Sound';

/**
 * assets-manifest.json に従って素材を読み込む。
 * 読み込めなかった画像はプレースホルダーを生成するので、後からファイルを置けば自動で差し替わる。
 */
export class BootScene extends Phaser.Scene {
  private missing: string[] = [];

  constructor() {
    super('Boot');
  }

  preload(): void {
    document.getElementById('boot-msg')?.remove();
    this.cameras.main.setBackgroundColor(COLORS.bg);
    addText(this, GAME_W / 2, GAME_H / 2 - 80, 'ルーン・レーンズ', 48, CSS.gold);
    const barW = 480;
    const frame = this.add.rectangle(GAME_W / 2, GAME_H / 2, barW + 8, 36, 0x000000).setStrokeStyle(3, 0xf4efe0);
    const bar = this.add.rectangle(frame.x - barW / 2, GAME_H / 2, 1, 28, COLORS.gold).setOrigin(0, 0.5);
    const pct = addText(this, GAME_W / 2, GAME_H / 2 + 50, '0%', 22, CSS.dim);
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => {
      bar.width = Math.max(1, barW * v);
      pct.setText(`${Math.round(v * 100)}%`);
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.missing.push(file.key);
    });

    for (const img of MANIFEST.images) this.load.image(img.key, img.path);
    for (const s of MANIFEST.spritesheets) {
      this.load.spritesheet(s.key, s.path, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    }
    for (const a of MANIFEST.audio) this.load.audio(a.key, a.path);
  }

  create(): void {
    this.makePlaceholders();
    // 16px ドット絵はにじまないよう最近傍補間
    for (const key of this.textures.getTextureKeys()) {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    if (this.textures.exists('fx_explosion') && !this.anims.exists('explode')) {
      this.anims.create({
        key: 'explode',
        frames: this.anims.generateFrameNumbers('fx_explosion', { start: 0, end: 15 }),
        frameRate: 30,
        hideOnComplete: true,
      });
    }
    if (this.missing.length) console.warn('[assets] 読み込めなかった素材（プレースホルダーで代用）:', this.missing);
    Sound.apply(this.game);
    this.scene.start('Title');
  }

  private makePlaceholders(): void {
    for (const img of [...MANIFEST.images, ...MANIFEST.spritesheets]) {
      if (this.textures.exists(img.key) && !this.missing.includes(img.key)) continue;
      if (this.textures.exists(img.key)) this.textures.remove(img.key);
      let h = 0;
      for (const ch of img.key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const color = Phaser.Display.Color.HSVToRGB((h % 360) / 360, 0.5, 0.85) as Phaser.Types.Display.ColorObject;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b));
      g.fillRect(0, 0, 16, 16);
      g.lineStyle(1, 0x000000);
      g.strokeRect(0.5, 0.5, 15, 15);
      g.generateTexture(img.key, 16, 16);
      g.destroy();
    }
  }
}
