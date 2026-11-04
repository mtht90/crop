import Phaser from 'phaser';
import { DECKS, cardById } from '../data';
import type { CardDef } from '../core/types';
import { Button } from '../ui/Button';
import { CardView } from '../ui/CardView';
import { addPanel, addText, COLORS, CSS, GAME_W } from '../ui/theme';

const TARGET_LABEL: Record<CardDef['targetType'], string> = {
  ground: '地上',
  air: '空中',
  both: '地上・空中',
  buildings: '建物のみ',
};

/** デッキ確認：12 枚の一覧。カードをタップすると詳細を表示 */
export class DeckViewScene extends Phaser.Scene {
  private detail: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('DeckView');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.detail = null;
    addText(this, GAME_W / 2, 60, `デッキ（${DECKS.player.length}枚）`, 40, CSS.gold);
    addText(this, GAME_W / 2, 108, 'タップで詳細', 18, CSS.dim);
    DECKS.player.forEach((id, i) => {
      const card = cardById(id);
      const col = i % 4;
      const row = Math.floor(i / 4);
      const v = new CardView(this, 135 + col * 150, 250 + row * 200, card, -1, 120, 176);
      v.setInteractive({ useHandCursor: true }).on('pointerup', () => this.showDetail(card));
    });
    new Button(this, GAME_W / 2, 1180, 'もどる', () => this.scene.start('Title'), { width: 300, height: 76, size: 28 });
  }

  private showDetail(card: CardDef): void {
    this.detail?.destroy();
    const c = this.add.container(0, 0).setDepth(100);
    const panel = addPanel(this, GAME_W / 2, 1000, 660, 230, 'ui_panel_blue');
    const lines: string[] = [card.description];
    if (card.type === 'unit' || card.type === 'building') {
      lines.push(`HP ${card.hp} / 攻撃 ${card.damage} / 間隔 ${card.attackInterval}秒 / 射程 ${card.range}`);
      lines.push(`狙う対象：${TARGET_LABEL[card.targetType]}${card.splashRadius ? ' / 範囲攻撃' : ''}${card.isFlying ? ' / 飛行' : ''}${card.count > 1 ? ` / ${card.count}体` : ''}`);
      if (card.lifetime) lines.push(`寿命 ${card.lifetime}秒`);
    } else if (card.type === 'spell') {
      lines.push(`ダメージ ${card.damage} / 範囲 ${card.splashRadius}（塔へのダメージは減少）`);
    } else {
      lines.push('場にいる味方ユニット1体へドラッグして使う');
    }
    c.add([
      panel,
      addText(this, GAME_W / 2, 920, `${card.name}（コスト ${card.cost}）`, 26, '#ffffff'),
      addText(this, GAME_W / 2, 1010, lines.join('\n'), 18, CSS.text, { align: 'center', wordWrap: { width: 620 }, lineSpacing: 6 }),
    ]);
    this.detail = c;
  }
}
