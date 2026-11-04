import Phaser from 'phaser';
import type { DeckSystem } from '../systems/DeckSystem';
import type { ManaSystem } from '../systems/ManaSystem';
import type { MatchTimer } from '../systems/MatchTimer';
import { cardById } from '../data';
import { addPanel, addText, COLORS, CSS, GAME_W } from './theme';
import { CARD_H, CARD_Y, DISCARD_X, DRAW_PILE_X, MANA_Y } from './layout';
import { CardView } from './CardView';

/** マナバー：10 区切り、小数で滑らかに伸びる */
export class ManaBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly x0 = 120;
  private readonly w = 560;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(5000);
    scene.add.image(this.x0 - 30, MANA_Y, 'ui_gem_cost').setTint(COLORS.mana).setScale(1.25).setDepth(5001);
    this.text = addText(scene, this.x0 - 30, MANA_Y - 1, '5', 24, '#ffffff').setDepth(5002);
  }

  update(mana: ManaSystem, double: boolean, time: number): void {
    const g = this.g;
    const max = mana.config.max;
    const h = 20;
    g.clear();
    g.fillStyle(0x000000, 0.8).fillRoundedRect(this.x0 - 3, MANA_Y - h / 2 - 3, this.w + 6, h + 6, 6);
    g.fillStyle(COLORS.manaDark).fillRect(this.x0, MANA_Y - h / 2, this.w, h);
    const color = double ? (Math.floor(time / 250) % 2 ? 0xff9cf0 : COLORS.mana) : COLORS.mana;
    g.fillStyle(color).fillRect(this.x0, MANA_Y - h / 2, (this.w * mana.value) / max, h);
    g.fillStyle(0xffffff, 0.25).fillRect(this.x0, MANA_Y - h / 2, (this.w * mana.value) / max, 5);
    g.lineStyle(2, 0x000000, 0.7);
    for (let i = 1; i < max; i++) {
      const x = this.x0 + (this.w * i) / max;
      g.lineBetween(x, MANA_Y - h / 2, x, MANA_Y + h / 2);
    }
    this.text.setText(String(Math.floor(mana.value)));
  }
}

/** 山札（残り枚数＋ドローゲージ） */
export class DrawPileView {
  readonly x = DRAW_PILE_X;
  readonly y = CARD_Y;
  private readonly count: Phaser.GameObjects.Text;
  private readonly gauge: Phaser.GameObjects.Graphics;
  private readonly paused: Phaser.GameObjects.Text;
  private readonly stack: Phaser.GameObjects.NineSlice[] = [];

  constructor(scene: Phaser.Scene) {
    for (let i = 2; i >= 0; i--) {
      this.stack.push(addPanel(scene, this.x + i * 2, this.y - i * 3, 62, 92, 'ui_panel_card_back').setDepth(5000));
    }
    addText(scene, this.x, this.y - CARD_H / 2 - 4, '山札', 16, CSS.dim).setDepth(5003);
    this.count = addText(scene, this.x, this.y - 6, '0', 28, '#ffffff').setDepth(5003);
    this.gauge = scene.add.graphics().setDepth(5003);
    this.paused = addText(scene, this.x, this.y + 26, '上限', 14, CSS.bad).setDepth(5003);
  }

  update(deck: DeckSystem): void {
    this.count.setText(String(deck.drawPile.length));
    this.stack.forEach((s, i) => s.setVisible(deck.drawPile.length > 2 - i || i === 2));
    const g = this.gauge;
    g.clear();
    const w = 58;
    const y = this.y + CARD_H / 2 - 6;
    g.fillStyle(0x000000, 0.8).fillRect(this.x - w / 2 - 2, y - 2, w + 4, 10);
    g.fillStyle(deck.isDrawPaused ? 0x777777 : COLORS.gold).fillRect(this.x - w / 2, y, w * deck.drawProgress, 6);
    this.paused.setVisible(deck.isDrawPaused);
  }
}

/** 捨て札（枚数表示、タップで中身を一覧） */
export class DiscardPileView {
  readonly x = DISCARD_X;
  readonly y = CARD_Y;
  private readonly count: Phaser.GameObjects.Text;
  private readonly top: Phaser.GameObjects.Image;
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly getDeck: () => DeckSystem,
  ) {
    const panel = addPanel(scene, this.x, this.y, 62, 92, 'ui_panel_dark').setDepth(5000);
    addText(scene, this.x, this.y - CARD_H / 2 - 4, '捨て札', 16, CSS.dim).setDepth(5003);
    this.top = scene.add.image(this.x, this.y - 12, 'icon_attack').setScale(2).setAlpha(0.6).setDepth(5001).setVisible(false);
    this.count = addText(scene, this.x, this.y + 26, '0', 24, '#ffffff').setDepth(5003);
    panel.setInteractive({ useHandCursor: true }).on('pointerup', () => this.toggleList());
  }

  update(deck: DeckSystem): void {
    this.count.setText(String(deck.discard.length));
    const last = deck.discard[deck.discard.length - 1];
    if (last) this.top.setTexture(cardById(last.cardId).cardArtKey).setVisible(true);
    else this.top.setVisible(false);
  }

  get isOpen(): boolean {
    return !!this.overlay;
  }

  toggleList(): void {
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
      return;
    }
    const s = this.scene;
    const deck = this.getDeck();
    const c = s.add.container(0, 0).setDepth(9000);
    const shade = s.add.rectangle(GAME_W / 2, 640, GAME_W, 1280, 0x000000, 0.7).setInteractive();
    shade.on('pointerup', () => this.toggleList());
    const panel = addPanel(s, GAME_W / 2, 560, 640, 620, 'ui_panel_blue');
    const title = addText(s, GAME_W / 2, 290, `捨て札（${deck.discard.length}枚）`, 28);
    const hint = addText(s, GAME_W / 2, 840, '山札が尽きると、これらがシャッフルされて山札に戻る', 16, CSS.dim);
    c.add([shade, panel, title, hint]);
    if (!deck.discard.length) c.add(addText(s, GAME_W / 2, 560, 'まだありません', 22, CSS.dim));
    deck.discard.forEach((inst, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const v = new CardView(s, 140 + col * 110, 400 + row * 140, cardById(inst.cardId), inst.uid, 96, 130);
      c.add(v);
    });
    this.overlay = c;
  }
}

/** 残り時間・撃破数・CPU 手札枚数 */
export class InfoHud {
  private readonly timer: Phaser.GameObjects.Text;
  private readonly phase: Phaser.GameObjects.Text;
  private readonly crowns: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly cpuHand: Phaser.GameObjects.Text;
  private readonly cpuMana: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const d = 5000;
    addPanel(scene, 684, 70, 70, 96, 'ui_panel_dark').setDepth(d);
    this.phase = addText(scene, 684, 40, '残り', 14, CSS.dim).setDepth(d + 1);
    this.timer = addText(scene, 684, 70, '3:00', 22, '#ffffff').setDepth(d + 1);
    addText(scene, 684, 100, '撃破', 13, CSS.dim).setDepth(d + 1);

    addPanel(scene, 36, 70, 66, 96, 'ui_panel_dark').setDepth(d);
    addText(scene, 36, 36, 'CPU', 15, CSS.cpu).setDepth(d + 1);
    addText(scene, 36, 60, '手札', 13, CSS.dim).setDepth(d + 1);
    this.cpuHand = addText(scene, 36, 82, '4', 22, '#ffffff').setDepth(d + 1);
    this.cpuMana = addText(scene, 36, 106, '', 13, CSS.mana).setDepth(d + 1);

    this.crowns = [
      addText(scene, 36, 990, '★0', 22, CSS.player).setDepth(d + 1),
      addText(scene, 684, 140, '★0', 22, CSS.cpu).setDepth(d + 1),
    ];
    addText(scene, 36, 962, 'あなた', 14, CSS.player).setDepth(d + 1);
  }

  update(timer: MatchTimer, crowns: [number, number], cpuHand: number, time: number): void {
    const r = Math.max(0, Math.ceil(timer.remaining));
    const m = Math.floor(r / 60);
    const s = r % 60;
    this.timer.setText(`${m}:${s.toString().padStart(2, '0')}`);
    const urgent = timer.phase === 'overtime' || r <= 10;
    this.timer.setColor(urgent && Math.floor(time / 300) % 2 ? CSS.bad : '#ffffff');
    this.phase.setText(timer.phase === 'overtime' ? '延長' : '残り');
    this.crowns[0].setText(`★${crowns[0]}`);
    this.crowns[1].setText(`★${crowns[1]}`);
    this.cpuHand.setText(String(cpuHand));
    this.cpuMana.setText(timer.isDoubleMana ? 'マナ×2' : '');
  }
}
