import { Rng } from '../core/Rng';

/** デッキ内の1枚。同名カードを複数枚入れても区別できるよう uid を持つ。 */
export interface CardInstance {
  uid: number;
  cardId: string;
}

export interface DeckConfig {
  initialHand: number;
  handLimit: number;
  drawInterval: number;
}

export type DeckEvent =
  | { type: 'draw'; card: CardInstance }
  | { type: 'shuffle'; count: number };

/**
 * 山札 → 手札 → 捨て札 →（シャッフル）→ 山札 の循環を管理する。Phaser 非依存。
 */
export class DeckSystem {
  drawPile: CardInstance[] = [];
  hand: CardInstance[] = [];
  discard: CardInstance[] = [];
  /** 次のドローまでの残り秒数 */
  drawTimer: number;

  private static nextUid = 1;

  constructor(
    cardIds: readonly string[],
    readonly config: DeckConfig,
    private readonly rng: Rng,
  ) {
    this.drawPile = cardIds.map((cardId) => ({ uid: DeckSystem.nextUid++, cardId }));
    this.drawTimer = config.drawInterval;
  }

  /** 試合開始：山札をシャッフルして初期手札を引く */
  start(): DeckEvent[] {
    this.rng.shuffle(this.drawPile);
    const events: DeckEvent[] = [];
    for (let i = 0; i < this.config.initialHand; i++) {
      events.push(...this.draw());
    }
    this.drawTimer = this.config.drawInterval;
    return events;
  }

  get isHandFull(): boolean {
    return this.hand.length >= this.config.handLimit;
  }

  /** 手札上限に達している間はドローが止まる */
  get isDrawPaused(): boolean {
    return this.isHandFull;
  }

  /** 0〜1：次のドローまでの進み具合（ゲージ表示用） */
  get drawProgress(): number {
    return 1 - Math.max(0, this.drawTimer) / this.config.drawInterval;
  }

  update(dt: number): DeckEvent[] {
    if (this.isHandFull) return [];
    this.drawTimer -= dt;
    if (this.drawTimer > 0) return [];
    const events = this.draw();
    if (events.some((e) => e.type === 'draw')) {
      this.drawTimer += this.config.drawInterval;
      if (this.drawTimer <= 0) this.drawTimer = this.config.drawInterval;
    } else {
      // 山札も捨て札も空：引けるようになるまでゲージ満タンで待機
      this.drawTimer = 0;
    }
    return events;
  }

  /** 1枚引く。山札が空なら捨て札をシャッフルして山札に戻してから引く。 */
  draw(): DeckEvent[] {
    if (this.isHandFull) return [];
    const events: DeckEvent[] = [];
    if (this.drawPile.length === 0) {
      if (this.discard.length === 0) return events;
      this.drawPile = this.rng.shuffle(this.discard);
      this.discard = [];
      events.push({ type: 'shuffle', count: this.drawPile.length });
    }
    const card = this.drawPile.shift()!;
    this.hand.push(card);
    events.push({ type: 'draw', card });
    return events;
  }

  /** 手札のカードを使用して捨て札へ送る。手札に無ければ null。 */
  play(uid: number): CardInstance | null {
    const idx = this.hand.findIndex((c) => c.uid === uid);
    if (idx < 0) return null;
    const [card] = this.hand.splice(idx, 1);
    this.discard.push(card);
    return card;
  }

  findInHand(uid: number): CardInstance | undefined {
    return this.hand.find((c) => c.uid === uid);
  }
}
