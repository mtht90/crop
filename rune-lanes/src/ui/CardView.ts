import Phaser from 'phaser';
import type { CardDef } from '../core/types';
import { addPanel, addText, CSS, COLORS } from './theme';
import { CARD_H, CARD_W } from './layout';

const TYPE_LABEL: Record<CardDef['type'], string> = {
  unit: '兵',
  spell: '呪',
  building: '建',
  support: '援',
};

const TYPE_COLOR: Record<CardDef['type'], number> = {
  unit: 0x6c8cff,
  spell: 0xff8a3d,
  building: 0x9aa4ad,
  support: 0x5fd17a,
};

/** 手札・デッキ確認で使うカード1枚の見た目 */
export class CardView extends Phaser.GameObjects.Container {
  readonly card: CardDef;
  readonly uid: number;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly needText: Phaser.GameObjects.Text;
  private readonly art: Phaser.GameObjects.Image;
  homeX = 0;
  homeY = 0;
  dragging = false;

  constructor(scene: Phaser.Scene, x: number, y: number, card: CardDef, uid = -1, w = CARD_W, h = CARD_H) {
    super(scene, x, y);
    this.card = card;
    this.uid = uid;
    const s = w / CARD_W;
    const panel = addPanel(scene, 0, 0, w, h, 'ui_panel_card');
    const band = scene.add.rectangle(0, -h / 2 + 14 * s, w - 14 * s, 10 * s, TYPE_COLOR[card.type], 0.85);
    this.art = scene.add.image(0, -8 * s, card.cardArtKey).setScale(3 * s);
    if (card.count > 1) {
      // 群れカードは体数ぶん並べて見せる
      this.art.setScale(2.4 * s).setX(-10 * s);
    }
    const extra = card.count > 1 ? scene.add.image(12 * s, -2 * s, card.cardArtKey).setScale(2.4 * s) : null;
    const name = addText(scene, 0, h / 2 - 26 * s, card.name, Math.round(15 * s), CSS.dark, { strokeThickness: 0 });
    if (name.width > w - 8) name.setScale((w - 8) / name.width);
    const typeTag = addText(scene, w / 2 - 14 * s, -h / 2 + 15 * s, TYPE_LABEL[card.type], Math.round(13 * s), '#ffffff');
    const gem = scene.add.image(-w / 2 + 14 * s, -h / 2 + 14 * s, 'ui_gem_cost').setScale(0.95 * s).setTint(COLORS.mana);
    const cost = addText(scene, gem.x, gem.y - 1, String(card.cost), Math.round(20 * s), '#ffffff');
    const countTag = card.count > 1 ? addText(scene, w / 2 - 14 * s, h / 2 - 46 * s, `×${card.count}`, Math.round(13 * s), CSS.dark, { strokeThickness: 0 }) : null;
    this.dim = scene.add.rectangle(0, 0, w - 6, h - 6, 0x000000, 0.55).setVisible(false);
    this.needText = addText(scene, 0, -4 * s, '', Math.round(16 * s), CSS.mana).setVisible(false);
    this.add([panel, band, this.art, ...(extra ? [extra] : []), name, typeTag, gem, cost, ...(countTag ? [countTag] : []), this.dim, this.needText]);
    this.setSize(w, h);
    scene.add.existing(this);
  }

  /** マナ不足の表示（あと何マナで使えるか） */
  setShortfall(short: number): void {
    const lack = short > 0.001;
    this.dim.setVisible(lack);
    this.needText.setVisible(lack);
    if (lack) this.needText.setText(`あと${Math.ceil(short)}`);
  }
}
