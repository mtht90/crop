import Phaser from 'phaser';
import type { Combatant } from '../entities/Combatant';
import type { CardDef } from '../core/types';
import { addText, COLORS, CSS } from './theme';
import { TILE, toScreen } from './layout';

const BUFF_ICON: Record<string, string> = {
  attack: 'icon_attack',
  haste: 'icon_haste',
  shield: 'icon_shield',
};
const BUFF_COLOR: Record<string, number> = {
  attack: 0xff6040,
  haste: 0x60e0ff,
  shield: 0xf0f0ff,
};

/** ユニット／建物の見た目。毎フレーム Combatant の状態から更新する。 */
export class UnitView {
  readonly root: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly ring: Phaser.GameObjects.Ellipse;
  private readonly aura: Phaser.GameObjects.Ellipse;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly icons: Phaser.GameObjects.Image[] = [];
  highlight: Phaser.GameObjects.Ellipse;
  private flashUntil = 0;
  private readonly lift: number;
  private readonly baseScale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly c: Combatant,
    card: CardDef,
  ) {
    const p = toScreen(c.x, c.y);
    this.root = scene.add.container(p.x, p.y);
    const rpx = c.radius * TILE;
    this.lift = c.isFlying ? 18 : 0;
    this.baseScale = card.displayScale;
    this.shadow = scene.add.ellipse(0, rpx * 0.5, rpx * 2.1, rpx * 0.9, 0x000000, 0.35);
    this.ring = scene.add.ellipse(0, rpx * 0.45, rpx * 2.2, rpx * 1.0).setStrokeStyle(2, c.team === 0 ? COLORS.player : COLORS.cpu, 0.95);
    this.aura = scene.add.ellipse(0, -this.lift, rpx * 3, rpx * 3, 0xffffff, 0).setVisible(false);
    this.highlight = scene.add.ellipse(0, rpx * 0.45, rpx * 3, rpx * 1.6).setStrokeStyle(3, COLORS.gold, 1).setVisible(false);
    this.sprite = scene.add.image(0, -this.lift - 4, card.spriteKey).setScale(this.baseScale);
    if (c.team === 1) this.sprite.setFlipX(true);
    this.bars = scene.add.graphics();
    this.root.add([this.shadow, this.ring, this.highlight, this.aura, this.sprite, this.bars]);
    for (let i = 0; i < 3; i++) {
      const icon = scene.add.image(0, 0, 'icon_attack').setScale(1).setVisible(false);
      this.icons.push(icon);
      this.root.add(icon);
    }
    // 出現演出
    this.sprite.setScale(0.1);
    scene.tweens.add({ targets: this.sprite, scale: this.baseScale, duration: 260, ease: 'Back.Out' });
  }

  flash(): void {
    this.flashUntil = this.scene.time.now + 90;
  }

  update(time: number): void {
    const c = this.c;
    const p = toScreen(c.x, c.y);
    this.root.setPosition(p.x, p.y);
    this.root.setDepth(p.y + (c.isFlying ? 2000 : 0));

    const deploying = c.deployTimer > 0;
    let bob = 0;
    if (c.isFlying) bob = Math.sin(time / 180 + c.id) * 3;
    else if (c.moving) bob = -Math.abs(Math.sin(time / 90 + c.id)) * 3;
    let lunge = 0;
    const since = c.kind === 'unit' ? time / 1000 : 999;
    void since;
    this.sprite.y = -this.lift - 4 + bob + lunge;
    this.sprite.setFlipX(c.facing < 0);
    this.sprite.setAlpha(deploying ? 0.45 + 0.25 * Math.sin(time / 60) : 1);
    if (this.scene.time.now < this.flashUntil) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.sprite.clearTint();

    // 攻撃した瞬間に少し大きくする
    const atkAge = (this.scene.registry.get('worldTime') as number) - c.attackedAt;
    const punch = atkAge >= 0 && atkAge < 0.15 ? 1 + 0.18 * (1 - atkAge / 0.15) : 1;
    if (!this.scene.tweens.isTweening(this.sprite)) this.sprite.setScale(this.baseScale * punch);

    // バフのオーラとアイコン
    const kinds = c.buffs.buffs.map((b) => b.kind).filter((k) => k in BUFF_ICON);
    if (c.shield > 0 && !kinds.includes('shield')) kinds.push('shield');
    if (kinds.length) {
      const k = kinds[Math.floor(time / 500) % kinds.length];
      this.aura.setVisible(true).setFillStyle(BUFF_COLOR[k], 0.18 + 0.1 * Math.sin(time / 120));
    } else this.aura.setVisible(false);
    const rpx = c.radius * TILE;
    const topY = -this.lift - 10 - 8 * this.baseScale;
    this.icons.forEach((icon, i) => {
      const k = kinds[i];
      if (!k) {
        icon.setVisible(false);
        return;
      }
      icon.setTexture(BUFF_ICON[k]).setVisible(true).setPosition(-((kinds.length - 1) * 9) + i * 18, topY - 12);
    });

    // HP（＋シールド）バー
    this.bars.clear();
    const w = Math.max(26, rpx * 2.4);
    const h = 5;
    const y = topY;
    this.bars.fillStyle(0x000000, 0.7).fillRect(-w / 2 - 1, y - 1, w + 2, h + 2);
    this.bars.fillStyle(c.team === 0 ? COLORS.player : COLORS.cpu).fillRect(-w / 2, y, w * (c.hp / c.maxHp), h);
    if (c.shield > 0) {
      this.bars.fillStyle(0xe8f4ff).fillRect(-w / 2, y - 4, w * Math.min(1, c.shield / c.maxHp), 3);
    }
    if (c.lifetime !== Infinity) {
      this.bars.fillStyle(0xffd34d).fillRect(-w / 2, y + h + 1, w * (c.lifetime / c.lifetimeMax), 2);
    }
  }

  destroy(): void {
    this.root.destroy();
  }
}

/** 塔の見た目（城タイルを組み合わせる） */
export class TowerView {
  readonly root: Phaser.GameObjects.Container;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly sleep: Phaser.GameObjects.Text;
  private readonly flag: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Container;
  private destroyed = false;
  private flashUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly c: Combatant,
    size: number,
  ) {
    const p = toScreen(c.x, c.y);
    this.root = scene.add.container(p.x, p.y).setDepth(p.y);
    this.body = scene.add.container(0, 0);
    const n = size;
    const half = (n * TILE) / 2;
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        const vr = r === 0 ? 't' : r === n - 1 ? 'b' : '';
        const vc = col === 0 ? 'l' : col === n - 1 ? 'r' : '';
        let k = vr + vc;
        if (!k) k = 'c';
        const img = scene.add.image(-half + col * TILE + TILE / 2, -half + r * TILE + TILE / 2, `tile_castle_${k}`).setScale(TILE / 16);
        this.body.add(img);
      }
    }
    const teamColor = c.team === 0 ? COLORS.player : COLORS.cpu;
    const border = scene.add.rectangle(0, 0, n * TILE + 4, n * TILE + 4).setStrokeStyle(3, teamColor, 0.9);
    this.body.add(border);
    this.flag = scene.add.image(0, -half + 10, c.team === 0 ? 'tile_flag_blue' : 'tile_flag_red').setScale(c.towerType === 'king' ? 3 : 2.4).setOrigin(0.3, 0.9);
    this.body.add(this.flag);
    if (c.towerType === 'king') {
      const crown = addText(scene, 0, 8, '王', 30, c.team === 0 ? CSS.player : CSS.cpu);
      this.body.add(crown);
    }
    this.sleep = addText(scene, half - 6, -half + 6, 'Zz', 20, '#d8e8ff').setVisible(c.towerType === 'king');
    this.bars = scene.add.graphics();
    this.hpText = addText(scene, 0, 0, '', 15, '#ffffff');
    this.root.add([this.body, this.sleep, this.bars, this.hpText]);
    scene.tweens.add({ targets: this.flag, scaleX: this.flag.scaleX * 0.85, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  flash(): void {
    this.flashUntil = this.scene.time.now + 80;
  }

  update(time: number): void {
    const c = this.c;
    if (!c.alive) {
      if (!this.destroyed) this.showRubble();
      return;
    }
    const flashing = this.scene.time.now < this.flashUntil;
    for (const o of this.body.list) {
      if (o instanceof Phaser.GameObjects.Image) {
        if (flashing) o.setTint(0xffd0d0);
        else o.clearTint();
      }
    }
    this.sleep.setVisible(c.towerType === 'king' && !c.active);
    if (this.sleep.visible) this.sleep.y = -c.radius * TILE + Math.sin(time / 300) * 4;
    const w = c.towerType === 'king' ? 110 : 84;
    const y = c.team === 0 ? c.radius * TILE + 16 : -c.radius * TILE - 22;
    this.bars.clear();
    this.bars.fillStyle(0x000000, 0.75).fillRect(-w / 2 - 2, y - 2, w + 4, 12);
    this.bars.fillStyle(c.team === 0 ? COLORS.player : COLORS.cpu).fillRect(-w / 2, y, w * (c.hp / c.maxHp), 8);
    this.hpText.setPosition(0, y + 4).setText(String(Math.ceil(c.hp)));
  }

  private showRubble(): void {
    this.destroyed = true;
    this.flag.setVisible(false);
    this.sleep.setVisible(false);
    this.bars.clear();
    this.hpText.setVisible(false);
    for (const o of this.body.list) {
      if (o instanceof Phaser.GameObjects.Image) o.setTint(0x555555).setAlpha(0.7);
      if (o instanceof Phaser.GameObjects.Text) o.setAlpha(0.3);
    }
    this.scene.tweens.add({ targets: this.body, scaleY: 0.6, y: 14, duration: 400, ease: 'Quad.In' });
  }
}
