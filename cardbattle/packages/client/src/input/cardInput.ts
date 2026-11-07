import type { CardStats, MatchSession } from '@cardbattle/sim';
import type { ArenaView } from '../render/arenaView';
import { worldToSim } from '../render/coords';
import type { Stage } from '../render/stage';
import type { Hud } from '../ui/hud';

/**
 * カードの操作。マウスでもタッチでも同じ（Pointer Events）。
 * - 手札からアリーナへドラッグして離すと配置
 * - カードをタップして選び、アリーナをタップしても配置できる
 * ドラッグ中は配置できない範囲を赤く、射程・呪文の範囲を円で表示する。
 */
export class CardInput {
  selected = -1;
  dragging = -1;
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private moved = false;
  private overArena = false;
  private lastSim: { x: number; y: number } | null = null;
  private readonly floating: HTMLDivElement;
  private readonly abort = new AbortController();
  onPlaced?: (card: CardStats) => void;
  onInvalid?: () => void;
  onSelect?: () => void;

  constructor(
    private readonly session: MatchSession,
    private readonly stage: Stage,
    private readonly arena: ArenaView,
    private readonly hud: Hud,
    private readonly gameEl: HTMLElement,
  ) {
    this.floating = document.createElement('div');
    this.floating.className = 'card floating';
    this.floating.style.display = 'none';
    gameEl.appendChild(this.floating);

    const opts = { signal: this.abort.signal };
    for (const slot of hud.slots) {
      slot.el.addEventListener('pointerdown', (e) => this.onCardDown(e, Number(slot.el.dataset.slot)), opts);
    }
    window.addEventListener('pointermove', (e) => this.onMove(e), opts);
    window.addEventListener('pointerup', (e) => this.onUp(e), opts);
    window.addEventListener('pointercancel', () => this.cancel(), opts);
    stage.canvas.addEventListener('pointerdown', (e) => this.onArenaTap(e), opts);
    window.addEventListener(
      'keydown',
      (e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) this.select(n - 1);
        if (e.key === 'Escape') this.select(-1);
      },
      opts,
    );
  }

  private get sim() {
    return this.session.simulation;
  }

  private card(slot: number): CardStats | undefined {
    return this.sim.players[this.session.localPlayer].hand[slot];
  }

  private select(slot: number): void {
    this.selected = this.selected === slot ? -1 : slot;
    if (this.selected >= 0) this.onSelect?.();
    const c = this.selected >= 0 ? this.card(this.selected) : undefined;
    if (c) this.arena.showPlacement(this.session.localPlayer, c);
    else this.arena.hideCursor();
  }

  private onCardDown(e: PointerEvent, slot: number): void {
    if (this.sim.isOver) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.dragging = slot;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.moved = false;
    this.overArena = false;
    const card = this.card(slot);
    if (!card) return;
    this.floating.innerHTML = this.hud.slots[slot].el.innerHTML;
    this.floating.dataset.rarity = card.rarity;
    this.floating.dataset.type = card.type;
    this.positionFloating(e.clientX, e.clientY);
    this.arena.showPlacement(this.session.localPlayer, card);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || this.dragging < 0) return;
    const card = this.card(this.dragging);
    if (!card) return;
    if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 8) this.moved = true;
    if (!this.moved) return;

    const rect = this.gameEl.getBoundingClientRect();
    const handTop = rect.bottom - this.hud.bottomFraction() * rect.height;
    this.overArena = e.clientY < handTop - 10;
    // カードは少し拡大して指についてくる。アリーナ上ではゴーストに切り替わる
    this.floating.style.display = this.overArena ? 'none' : '';
    this.positionFloating(e.clientX, e.clientY);
    if (this.overArena) this.updateCursor(card, e.clientX, e.clientY - this.fingerOffset(e));
    else {
      this.lastSim = null;
      this.arena.hideCursor();
      this.arena.showPlacement(this.session.localPlayer, card);
    }
  }

  /** タッチ操作では指で隠れないように少し上を指す */
  private fingerOffset(e: PointerEvent): number {
    return e.pointerType === 'touch' ? 40 : 0;
  }

  private updateCursor(card: CardStats, cx: number, cy: number): void {
    const hit = this.stage.pickGround(cx, cy);
    if (!hit) return;
    const raw = worldToSim(hit);
    const snapped = this.sim.snapPosition(card, raw);
    const valid = this.sim.isValidPlacement(this.session.localPlayer, card, raw);
    this.lastSim = raw;
    this.arena.showCursor(card, snapped.x, snapped.y, valid);
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || this.dragging < 0) return;
    const slot = this.dragging;
    const card = this.card(slot);
    this.dragging = -1;
    this.pointerId = -1;
    this.floating.style.display = 'none';
    if (!this.moved) {
      // タップ：カードを選ぶ
      this.select(slot);
      return;
    }
    if (card && this.overArena && this.lastSim) this.place(card, this.lastSim);
    this.arena.hideCursor();
    this.selected = -1;
    this.lastSim = null;
  }

  private onArenaTap(e: PointerEvent): void {
    if (this.selected < 0 || this.dragging >= 0) return;
    const card = this.card(this.selected);
    const hit = this.stage.pickGround(e.clientX, e.clientY);
    if (!card || !hit) return;
    this.place(card, worldToSim(hit));
    this.selected = -1;
    this.arena.hideCursor();
  }

  private place(card: CardStats, pos: { x: number; y: number }): void {
    const sim = this.sim;
    const p = this.session.localPlayer;
    if (!sim.isValidPlacement(p, card, pos) || sim.mana(p) < card.cost) {
      this.onInvalid?.();
      return;
    }
    this.session.submit({ cardId: card.id, pos });
    this.onPlaced?.(card);
  }

  private positionFloating(x: number, y: number): void {
    const rect = this.gameEl.getBoundingClientRect();
    this.floating.style.transform = `translate3d(${x - rect.left}px, ${y - rect.top}px, 0) translate(-50%, -60%) scale(1.15)`;
  }

  cancel(): void {
    this.dragging = -1;
    this.pointerId = -1;
    this.selected = -1;
    this.floating.style.display = 'none';
    this.arena.hideCursor();
  }

  dispose(): void {
    this.abort.abort();
    this.floating.remove();
  }
}
