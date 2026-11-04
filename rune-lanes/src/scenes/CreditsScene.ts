import Phaser from 'phaser';
import { MANIFEST } from '../data';
import { Button } from '../ui/Button';
import { addText, COLORS, CSS, GAME_W } from '../ui/theme';

const KIND_LABEL: [string, (id: string) => boolean][] = [
  ['グラフィック', (id) => MANIFEST.images.some((a) => a.source === id) || MANIFEST.spritesheets.some((a) => a.source === id)],
  ['音楽・効果音', (id) => MANIFEST.audio.some((a) => a.source === id)],
  ['フォント', (id) => MANIFEST.fonts.some((a) => a.source === id)],
];

/** 素材クレジット（assets-manifest.json の sources から自動生成。詳細は ASSETS.md） */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    addText(this, GAME_W / 2, 60, 'クレジット', 44, CSS.gold).setScrollFactor(0).setDepth(10);
    const content = this.add.container(0, 0);
    let y = 140;
    content.add(addText(this, GAME_W / 2, y, 'ゲームデザイン・プログラム：Rune Lanes 開発チーム', 18, CSS.dim));
    y += 50;
    for (const [label, test] of KIND_LABEL) {
      const sources = MANIFEST.sources.filter((s) => test(s.id));
      if (!sources.length) continue;
      content.add(addText(this, GAME_W / 2, y, `― ${label} ―`, 26, CSS.gold));
      y += 46;
      for (const s of sources) {
        content.add(addText(this, GAME_W / 2, y, s.name, 22, '#ffffff', { wordWrap: { width: 640 }, align: 'center' }));
        y += 30;
        const lic = s.category === 'B' ? 'ライセンス未記載' : s.license;
        content.add(addText(this, GAME_W / 2, y, `by ${s.author}（${lic}）`, 18, CSS.player));
        y += 26;
        content.add(addText(this, GAME_W / 2, y, s.url, 13, CSS.dim));
        y += 40;
      }
      y += 10;
    }
    content.add(addText(this, GAME_W / 2, y, 'すてきな素材をありがとうございます！', 20, CSS.text));
    y += 60;

    const viewH = 1040;
    const maxScroll = Math.max(0, y - viewH);
    let scroll = 0;
    const shade = this.add.rectangle(GAME_W / 2, 50, GAME_W, 100, COLORS.bg).setDepth(5);
    void shade;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      scroll = Phaser.Math.Clamp(scroll - (p.y - p.prevPosition.y), 0, maxScroll);
      content.y = -scroll;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      scroll = Phaser.Math.Clamp(scroll + dy, 0, maxScroll);
      content.y = -scroll;
    });
    this.add.rectangle(GAME_W / 2, 1180, GAME_W, 200, COLORS.bg).setDepth(5);
    new Button(this, GAME_W / 2, 1180, 'もどる', () => this.scene.start('Title'), { width: 300, height: 76, size: 28 }).setDepth(10);
  }
}
