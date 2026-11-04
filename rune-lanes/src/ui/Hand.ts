import Phaser from 'phaser';
import type { CardDef, Team } from '../core/types';
import type { BattleWorld, PlayFailure } from '../systems/BattleWorld';
import { ARENA_H, ARENA_W } from '../systems/Arena';
import { formationOffsets } from '../entities/Unit';
import { cardById } from '../data';
import { CardView } from './CardView';
import type { UnitView } from './EntityViews';
import { COLORS } from './theme';
import { ARENA_X, ARENA_Y, CARD_Y, DISCARD_X, DRAW_PILE_X, HUD_Y, TILE, isOverArena, slotX, toScreen, toWorld } from './layout';

export interface HandDeps {
  world: BattleWorld;
  team: Team;
  unitViews: () => Map<number, UnitView>;
  onPlayed: (card: CardDef, x: number, y: number, targetId: number | null) => void;
  onFail: (reason: PlayFailure, card: CardDef) => void;
}

/** 手札の表示とドラッグ＆ドロップ操作 */
export class Hand {
  private readonly views = new Map<number, CardView>();
  private readonly ghost: Phaser.GameObjects.Container;
  private readonly ghostGfx: Phaser.GameObjects.Graphics;
  private readonly zone: Phaser.GameObjects.Graphics;
  private ghostSprites: Phaser.GameObjects.Image[] = [];
  private dragging: CardView | null = null;
  private hoverTarget: number | null = null;
  private dropPoint: { x: number; y: number } | null = null;
  enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: HandDeps,
  ) {
    this.zone = scene.add.graphics().setDepth(2900).setVisible(false);
    this.ghostGfx = scene.add.graphics();
    this.ghost = scene.add.container(0, 0, [this.ghostGfx]).setDepth(4000).setVisible(false);

    scene.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (obj instanceof CardView && this.enabled) this.beginDrag(obj);
    });
    scene.input.on('drag', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (obj === this.dragging) this.moveDrag(p);
    });
    scene.input.on('dragend', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (obj === this.dragging) this.endDrag();
    });
  }

  private get deck() {
    return this.deps.world.players[this.deps.team].deck;
  }

  private get mana() {
    return this.deps.world.players[this.deps.team].mana;
  }

  /** 手札の中身と表示を同期（新しいカードは山札から飛んでくる） */
  sync(): void {
    const hand = this.deck.hand;
    const uids = new Set(hand.map((c) => c.uid));
    for (const [uid, v] of this.views) {
      if (!uids.has(uid) && v !== this.dragging) {
        v.destroy();
        this.views.delete(uid);
      }
    }
    hand.forEach((inst, i) => {
      let v = this.views.get(inst.uid);
      if (!v) {
        v = new CardView(this.scene, DRAW_PILE_X, CARD_Y, cardById(inst.cardId), inst.uid);
        v.setDepth(5100).setScale(0.6).setAlpha(0.4);
        v.setInteractive({ draggable: true, useHandCursor: true });
        this.scene.input.setDraggable(v);
        this.views.set(inst.uid, v);
        this.scene.tweens.add({ targets: v, x: slotX(i), y: CARD_Y, scale: 1, alpha: 1, duration: 280, ease: 'Cubic.Out' });
      } else if (!v.dragging && (v.homeX !== slotX(i))) {
        this.scene.tweens.add({ targets: v, x: slotX(i), y: CARD_Y, duration: 180, ease: 'Cubic.Out' });
      }
      v.homeX = slotX(i);
      v.homeY = CARD_Y;
    });
  }

  update(time: number): void {
    for (const v of this.views.values()) v.setShortfall(this.mana.shortfall(v.card.cost));
    if (this.dragging && this.dragging.card.type === 'support') {
      for (const [id, uv] of this.deps.unitViews()) {
        const ok = this.deps.world.isSupportTarget(this.deps.team, uv.c);
        uv.highlight.setVisible(ok);
        if (ok) {
          const hovered = id === this.hoverTarget;
          uv.highlight.setStrokeStyle(hovered ? 4 : 2, hovered ? COLORS.gold : 0xffffff, hovered ? 1 : 0.5 + 0.3 * Math.sin(time / 120));
        }
      }
    }
  }

  private beginDrag(v: CardView): void {
    this.dragging = v;
    v.dragging = true;
    v.setDepth(6000);
    this.scene.tweens.killTweensOf(v);
    const card = v.card;
    // ゴースト（配置予定のユニット）
    for (const s of this.ghostSprites) s.destroy();
    this.ghostSprites = [];
    if (card.type === 'unit' || card.type === 'building') {
      for (const off of formationOffsets(card.count)) {
        const img = this.scene.add.image(off.dx * TILE, off.dy * TILE - (card.isFlying ? 18 : 4), card.spriteKey).setScale(card.displayScale).setAlpha(0.65);
        this.ghostSprites.push(img);
        this.ghost.add(img);
      }
      this.drawZone();
    }
  }

  /** 配置できない範囲を赤く塗る */
  private drawZone(): void {
    const g = this.zone;
    g.clear();
    g.fillStyle(COLORS.bad, 0.22);
    for (let ty = 0; ty < ARENA_H; ty++) {
      for (let tx = 0; tx < ARENA_W; tx++) {
        if (!this.deps.world.canDeployAt(this.deps.team, tx + 0.5, ty + 0.5)) g.fillRect(ARENA_X + tx * TILE, ARENA_Y + ty * TILE, TILE, TILE);
      }
    }
    g.setVisible(true);
  }

  private moveDrag(p: Phaser.Input.Pointer): void {
    const v = this.dragging!;
    const card = v.card;
    v.setPosition(p.x, p.y);
    const over = isOverArena(p.x, p.y) && p.y < HUD_Y - 4;
    this.dropPoint = null;
    this.hoverTarget = null;
    if (!over) {
      v.setAlpha(1).setScale(1);
      this.ghost.setVisible(false);
      return;
    }
    const w = toWorld(p.x, p.y);
    const g = this.ghostGfx;
    g.clear();
    if (card.type === 'support') {
      v.setAlpha(0.85).setScale(0.55);
      this.ghost.setVisible(false);
      this.hoverTarget = this.findSupportTarget(w.x, w.y);
      if (this.hoverTarget !== null) this.dropPoint = w;
      return;
    }
    v.setAlpha(0).setScale(0.5);
    const snap = { x: Math.round(w.x * 2) / 2, y: Math.round(w.y * 2) / 2 };
    const ok = this.deps.world.checkPlay(this.deps.team, v.uid, snap.x, snap.y).ok || this.isOnlyManaShort(v, snap);
    const sp = toScreen(snap.x, snap.y);
    this.ghost.setPosition(sp.x, sp.y).setVisible(true);
    const color = ok ? 0xffffff : COLORS.bad;
    if (card.type === 'spell') {
      g.fillStyle(0xff7030, 0.22).fillCircle(0, 0, card.splashRadius * TILE);
      g.lineStyle(3, ok ? 0xffa040 : COLORS.bad, 0.9).strokeCircle(0, 0, card.splashRadius * TILE);
    } else {
      const r = (card.range + card.radius) * TILE;
      g.lineStyle(2, color, 0.55).strokeCircle(0, 0, r);
      g.fillStyle(color, 0.08).fillCircle(0, 0, r);
    }
    for (const s of this.ghostSprites) {
      if (ok) s.clearTint();
      else s.setTint(COLORS.bad).setTintMode(Phaser.TintModes.FILL);
    }
    if (ok) this.dropPoint = snap;
  }

  /** マナ以外の条件は満たしているか（マナ不足時も位置の見た目は通常にする） */
  private isOnlyManaShort(v: CardView, pt: { x: number; y: number }): boolean {
    if (this.mana.canAfford(v.card.cost)) return false;
    if (v.card.type === 'spell') return true;
    return this.deps.world.canDeployAt(this.deps.team, pt.x, pt.y);
  }

  private findSupportTarget(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = 1.4;
    for (const [id, uv] of this.deps.unitViews()) {
      const c = uv.c;
      if (!this.deps.world.isSupportTarget(this.deps.team, c)) continue;
      const cy = c.isFlying ? c.y - 0.6 : c.y - 0.15;
      const d = Math.hypot(c.x - x, cy - y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private endDrag(): void {
    const v = this.dragging!;
    this.dragging = null;
    v.dragging = false;
    this.ghost.setVisible(false);
    this.zone.setVisible(false);
    for (const uv of this.deps.unitViews().values()) uv.highlight.setVisible(false);
    const card = v.card;
    const pt = this.dropPoint;
    const target = this.hoverTarget;
    this.dropPoint = null;
    this.hoverTarget = null;
    if (pt) {
      const res = this.deps.world.playCard(this.deps.team, v.uid, pt.x, pt.y, card.type === 'support' ? target : null);
      if (res.ok) {
        this.views.delete(v.uid);
        v.setAlpha(1);
        const sp = card.type === 'support' || card.type === 'spell' ? { x: v.x, y: v.y } : toScreen(pt.x, pt.y);
        v.setPosition(sp.x, sp.y).setScale(0.5);
        this.scene.tweens.add({
          targets: v,
          x: DISCARD_X,
          y: CARD_Y,
          scale: 0.55,
          alpha: 0.2,
          duration: 380,
          ease: 'Cubic.In',
          onComplete: () => v.destroy(),
        });
        this.deps.onPlayed(card, pt.x, pt.y, target);
        this.sync();
        return;
      }
      this.deps.onFail(res.reason, card);
    }
    // キャンセル：手札に戻す
    v.setAlpha(1).setDepth(5100);
    this.scene.tweens.add({ targets: v, x: v.homeX, y: v.homeY, scale: 1, duration: 160, ease: 'Cubic.Out' });
  }
}
