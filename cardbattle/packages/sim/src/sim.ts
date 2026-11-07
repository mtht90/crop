import {
  isSpell,
  laneOf,
  toLocal,
  toWorld,
  type CardStats,
  type Rules,
  type TowerStats,
} from './data';
import {
  clamp,
  dist,
  idiv,
  isqrt,
  moveTowards,
  Rng,
  sqrDist,
  StateHasher,
  TICK_MS,
  UNIT,
  vecEq,
  withLength,
  type Vec,
} from './math';

// ---------------------------------------------------------------- 型

export type EntityKind = 'troop' | 'building' | 'tower';
export type TowerSlot = 'king' | 'left' | 'right';
export type Phase = 'regulation' | 'overtime' | 'ended';
export type EndReason = 'none' | 'kingDestroyed' | 'crowns' | 'suddenDeath' | 'towerHp' | 'draw' | 'forfeit';
export type Announcement = 'doubleMana' | 'overtime' | 'tripleMana';

/** アリーナ上のユニット・建物・タワー。描画側は読み取りだけ行う。 */
export interface Entity {
  id: number;
  owner: number;
  kind: EntityKind;
  tower: TowerSlot | null;
  card: CardStats | null; // タワーは null
  pos: Vec;
  prevPos: Vec; // 描画の補間用
  hp: number;
  maxHp: number;
  radius: number;
  mass: number;
  flying: boolean;
  damage: number;
  hitTicks: number;
  firstHitTicks: number;
  range: number;
  sight: number;
  speed: number;
  splashRadius: number;
  projectileSpeed: number;
  hitsAir: boolean;
  hitsGround: boolean;
  buildingsOnly: boolean;
  targetId: number;
  attacking: boolean;
  attackTimer: number;
  deployTimer: number;
  stunTimer: number;
  lifetimeTicks: number;
  decayRemainder: number;
  active: boolean; // キングタワーの休止状態
  lastAttackTick: number;
  lastDamagedTick: number;
  spawnTick: number;
  /** ルーンの力で強化されたユニット */
  empowered: boolean;
}

export interface Projectile {
  id: number;
  owner: number;
  sourceId: number;
  targetId: number;
  pos: Vec;
  prevPos: Vec;
  origin: Vec;
  targetPos: Vec;
  speed: number;
  damage: number;
  towerDamage: number;
  splash: number;
  hitsAir: boolean;
  hitsGround: boolean;
  spell: CardStats | null;
  fromTower: boolean;
  done: boolean;
}

/** クライアントが送る唯一の入力：カードID・配置位置・ティック番号。 */
export interface DeployCommand {
  player: number;
  cardId: string;
  pos: Vec;
  issueTick: number;
}

/** ホストが検証して受理したコマンド。全員に配られ、リプレイにも記録される。 */
export interface AcceptedCommand {
  acceptTick: number;
  executeTick: number;
  command: DeployCommand;
}

export type RejectReason = 'none' | 'matchOver' | 'unknownPlayer' | 'cardNotInHand' | 'notEnoughMana' | 'invalidPlacement';

export type SimEvent =
  | { type: 'commandAccepted'; tick: number; owner: number; pos: Vec; card: CardStats; executeTick: number; empowered: boolean }
  | { type: 'runeSpawned'; tick: number; pos: Vec }
  | { type: 'runeClaimed'; tick: number; owner: number; pos: Vec; by: number }
  | { type: 'entitySpawned'; tick: number; id: number; owner: number; pos: Vec; card: CardStats }
  | { type: 'entityDied'; tick: number; id: number; owner: number; pos: Vec; kind: EntityKind }
  | { type: 'damaged'; tick: number; id: number; sourceId: number; owner: number; amount: number; pos: Vec }
  | { type: 'attack'; tick: number; id: number; targetId: number; owner: number }
  | { type: 'projectileLaunched'; tick: number; id: number; sourceId: number; owner: number }
  | { type: 'projectileHit'; tick: number; id: number; owner: number; pos: Vec }
  | { type: 'spellCast'; tick: number; owner: number; pos: Vec; card: CardStats }
  | { type: 'spellImpact'; tick: number; owner: number; pos: Vec; card: CardStats; radius: number }
  | { type: 'knockback'; tick: number; id: number; from: Vec }
  | { type: 'towerDestroyed'; tick: number; id: number; owner: number; slot: TowerSlot; pos: Vec }
  | { type: 'crownScored'; tick: number; owner: number; crowns: number; pos: Vec }
  | { type: 'kingActivated'; tick: number; id: number; owner: number }
  | { type: 'announcement'; tick: number; kind: Announcement }
  | { type: 'matchEnded'; tick: number; winner: number; reason: EndReason };

export interface PlayerState {
  index: number;
  name: string;
  hand: CardStats[];
  /** 先頭が「次のカード」。使ったカードは末尾に回る */
  queue: CardStats[];
  manaUnits: number;
  crowns: number;
  towers: Record<TowerSlot, number>;
  /** ルーンの力を持っている（次に出すカードが強化される） */
  runeCharged: boolean;
}

/** 橋の上に現れるルーン */
export interface Rune {
  pos: Vec;
  spawnTick: number;
}

interface PendingDeploy {
  executeTick: number;
  player: number;
  card: CardStats;
  pos: Vec;
  empowered: boolean;
}

const TOWER_SLOTS: TowerSlot[] = ['king', 'left', 'right'];

// ---------------------------------------------------------------- シミュレーション

/**
 * 固定ティック（20tick/秒）の対戦シミュレーション。DOM・描画には一切依存しない。
 * 同じ (ルール, デッキ, シード, 受理済みコマンド列) を与えれば必ず同じ結果になる。
 *
 * 1tick の流れ：
 *   1. ホストが tryAccept でコマンドを受理（コスト消費・手札循環。実行は commandDelay 後）
 *   2. step() … 配置実行 → マナ回復 → 行動 → 押し合い → 弾 → 時間判定
 */
export class BattleSimulation {
  tick = 0;
  phase: Phase = 'regulation';
  winner = -1;
  endReason: EndReason = 'none';
  readonly players: [PlayerState, PlayerState];
  readonly entities: Entity[] = [];
  readonly projectiles: Projectile[] = [];
  /** 直近の step / tryAccept で発生したイベント */
  readonly events: SimEvent[] = [];
  readonly acceptedLog: AcceptedCommand[] = [];
  private readonly pending: PendingDeploy[] = [];
  /** 今アリーナにあるルーン（無ければ null） */
  rune: Rune | null = null;
  /** 次にルーンが現れる tick（0 = 出現しないルール） */
  nextRuneTick = 0;
  private readonly rng: Rng;
  private nextId = 1;
  private readonly byId = new Map<number, Entity>();

  constructor(
    readonly rules: Rules,
    deck0: CardStats[],
    deck1: CardStats[],
    readonly seed: number,
    names: [string, string] = ['Player', 'Opponent'],
  ) {
    this.rng = new Rng(seed);
    this.players = [this.createPlayer(0, names[0], deck0), this.createPlayer(1, names[1], deck1)];
    for (const p of this.players) this.spawnTowers(p);
    this.nextRuneTick = rules.runeFirstTick;
  }

  get isOver(): boolean {
    return this.phase === 'ended';
  }

  // ------------------------------------------------------------ 初期化

  private createPlayer(index: number, name: string, deck: CardStats[]): PlayerState {
    if (deck.length !== this.rules.deckSize) throw new Error(`deck must contain ${this.rules.deckSize} cards`);
    const shuffled = deck.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.rng.range(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return {
      index,
      name,
      hand: shuffled.slice(0, this.rules.handSize),
      queue: shuffled.slice(this.rules.handSize),
      manaUnits: this.rules.startMana * this.rules.manaUnit,
      crowns: 0,
      towers: { king: -1, left: -1, right: -1 },
      runeCharged: false,
    };
  }

  private spawnTowers(p: PlayerState): void {
    const r = this.rules;
    p.towers.king = this.spawnTower(p.index, 'king', r.king, r.king.localPos).id;
    p.towers.left = this.spawnTower(p.index, 'left', r.princess, r.princess.localPos).id;
    p.towers.right = this.spawnTower(p.index, 'right', r.princess, { x: r.width - r.princess.localPos.x, y: r.princess.localPos.y }).id;
  }

  private spawnTower(owner: number, slot: TowerSlot, t: TowerStats, local: Vec): Entity {
    const pos = toWorld(this.rules, owner, local);
    const e: Entity = {
      id: this.nextId++,
      owner,
      kind: 'tower',
      tower: slot,
      card: null,
      pos,
      prevPos: { ...pos },
      hp: t.hitpoints,
      maxHp: t.hitpoints,
      radius: t.halfSize,
      mass: 0,
      flying: false,
      damage: t.damage,
      hitTicks: t.hitTicks,
      firstHitTicks: idiv(t.hitTicks, 2) + 1,
      range: t.range,
      sight: t.range,
      speed: 0,
      splashRadius: 0,
      projectileSpeed: t.projectileSpeed,
      hitsAir: true,
      hitsGround: true,
      buildingsOnly: false,
      targetId: -1,
      attacking: false,
      attackTimer: 0,
      deployTimer: 0,
      stunTimer: 0,
      lifetimeTicks: 0,
      decayRemainder: 0,
      active: slot !== 'king', // キングは休止状態から始まる
      lastAttackTick: -1000,
      lastDamagedTick: -1000,
      spawnTick: 0,
      empowered: false,
    };
    this.addEntity(e);
    return e;
  }

  private addEntity(e: Entity): void {
    this.entities.push(e);
    this.byId.set(e.id, e);
  }

  // ------------------------------------------------------------ 参照

  getEntity(id: number): Entity | undefined {
    return this.byId.get(id);
  }

  getTower(player: number, slot: TowerSlot): Entity | undefined {
    return this.byId.get(this.players[player].towers[slot]);
  }

  isTowerAlive(player: number, slot: TowerSlot): boolean {
    const t = this.getTower(player, slot);
    return !!t && t.hp > 0;
  }

  mana(player: number): number {
    return idiv(this.players[player].manaUnits, this.rules.manaUnit);
  }

  /** 小数込みのマナ（描画用） */
  manaExact(player: number): number {
    return this.players[player].manaUnits / this.rules.manaUnit;
  }

  private get overtimeTicksLeft(): number {
    return this.rules.regulationTicks + this.rules.overtimeTicks - this.tick;
  }

  get manaMultiplier(): number {
    if (this.phase === 'regulation') return this.rules.regulationTicks - this.tick <= this.rules.doubleManaLastTicks ? 2 : 1;
    if (this.phase === 'overtime') return this.overtimeTicksLeft <= this.rules.tripleManaLastTicks ? 3 : this.rules.overtimeBaseMultiplier;
    return 0;
  }

  /** 現在のフェーズの残りtick */
  get ticksRemaining(): number {
    if (this.phase === 'regulation') return Math.max(0, this.rules.regulationTicks - this.tick);
    if (this.phase === 'overtime') return Math.max(0, this.overtimeTicksLeft);
    return 0;
  }

  get pendingDeploys(): readonly PendingDeploy[] {
    return this.pending;
  }

  // ------------------------------------------------------------ 配置

  /** ユニット・建物はタイルの中心に吸着。呪文はアリーナ内に収めるだけ。 */
  snapPosition(card: CardStats, pos: Vec): Vec {
    const r = this.rules;
    if (isSpell(card)) return { x: clamp(pos.x, 0, r.width), y: clamp(pos.y, 0, r.height) };
    const tx = clamp(Math.floor(pos.x / UNIT), 0, r.width / UNIT - 1);
    const ty = clamp(Math.floor(pos.y / UNIT), 0, r.height / UNIT - 1);
    return { x: tx * UNIT + UNIT / 2, y: ty * UNIT + UNIT / 2 };
  }

  /** 配置可能か（スナップ後の座標で判定）。描画側の配置範囲表示にも使う。 */
  isValidPlacement(player: number, card: CardStats, worldPos: Vec): boolean {
    const r = this.rules;
    if (worldPos.x < 0 || worldPos.y < 0 || worldPos.x > r.width || worldPos.y > r.height) return false;
    if (isSpell(card)) return true; // 呪文はどこにでも撃てる

    const pos = this.snapPosition(card, worldPos);
    const local = toLocal(r, player, pos);
    let inZone: boolean;
    if (local.y < r.riverStart) inZone = true;
    else if (local.y > r.riverEnd && local.y < r.riverEnd + r.pocketDepth) {
      // 相手のサイドタワーを壊したレーンだけ、相手陣地の手前まで広がる
      inZone = !this.isTowerAlive(1 - player, laneOf(r, local.x) === 0 ? 'left' : 'right');
    } else inZone = false;
    if (!inZone) return false;

    for (const e of this.entities) {
      if (e.hp <= 0 || e.kind !== 'tower') continue;
      if (Math.abs(pos.x - e.pos.x) < e.radius && Math.abs(pos.y - e.pos.y) < e.radius) return false; // タワーの上
    }
    return true;
  }

  validate(cmd: DeployCommand): RejectReason {
    if (this.isOver) return 'matchOver';
    if (cmd.player !== 0 && cmd.player !== 1) return 'unknownPlayer';
    const p = this.players[cmd.player];
    const slot = p.hand.findIndex((c) => c.id === cmd.cardId);
    if (slot < 0) return 'cardNotInHand';
    const card = p.hand[slot];
    if (this.mana(cmd.player) < card.cost) return 'notEnoughMana';
    if (!this.isValidPlacement(cmd.player, card, cmd.pos)) return 'invalidPlacement';
    return 'none';
  }

  /**
   * ホスト側の検証と受理。受理するとマナを消費し手札を回し、commandDelay 後の実行を予約する。
   * step() の前に呼ぶ（リプレイでも同じ順序で呼ばれる）。
   */
  tryAccept(cmd: DeployCommand): RejectReason {
    const reason = this.validate(cmd);
    if (reason !== 'none') return reason;
    const p = this.players[cmd.player];
    const slot = p.hand.findIndex((c) => c.id === cmd.cardId);
    const card = p.hand[slot];
    p.manaUnits -= card.cost * this.rules.manaUnit;
    // 使ったカードはデッキの一番後ろへ。次のカードが手札の同じ位置に入る
    p.hand[slot] = p.queue.shift()!;
    p.queue.push(card);

    const pos = this.snapPosition(card, cmd.pos);
    const executeTick = this.tick + this.rules.commandDelayTicks;
    // ルーンの力は、次に出したカード1枚に使われる
    const empowered = p.runeCharged;
    p.runeCharged = false;
    this.pending.push({ executeTick, player: cmd.player, card, pos, empowered });
    this.acceptedLog.push({ acceptTick: this.tick, executeTick, command: { ...cmd, pos: { ...cmd.pos } } });
    this.events.push({ type: 'commandAccepted', tick: this.tick, owner: cmd.player, pos, card, executeTick, empowered });
    return 'none';
  }

  // ------------------------------------------------------------ 進行

  clearEvents(): void {
    this.events.length = 0;
  }

  step(): void {
    if (this.isOver) return;
    for (const e of this.entities) e.prevPos = { x: e.pos.x, y: e.pos.y };
    for (const p of this.projectiles) p.prevPos = { x: p.pos.x, y: p.pos.y };

    this.executePending();
    this.regenMana();

    const n = this.entities.length;
    for (let i = 0; i < n; i++) {
      const e = this.entities[i];
      if (e.hp <= 0) continue;
      if (e.kind === 'troop') this.updateTroop(e);
      else this.updateStructure(e);
      if (this.isOver) return;
    }

    this.resolveCollisions();
    this.updateRune();
    this.updateProjectiles();
    if (this.isOver) return;

    this.removeDead();
    this.tick++;
    this.updateClock();
  }

  private removeDead(): void {
    let w = 0;
    for (const e of this.entities) {
      if (e.hp > 0 || e.kind === 'tower') this.entities[w++] = e;
      else this.byId.delete(e.id);
    }
    this.entities.length = w;
    let pw = 0;
    for (const p of this.projectiles) if (!p.done) this.projectiles[pw++] = p;
    this.projectiles.length = pw;
  }

  private executePending(): void {
    const due = this.pending.filter((p) => p.executeTick <= this.tick);
    if (due.length === 0) return;
    for (const p of due) {
      if (isSpell(p.card)) this.castSpell(p.player, p.card, p.pos, p.empowered);
      else this.spawnCard(p.player, p.card, p.pos, p.empowered);
    }
    const keep = this.pending.filter((p) => p.executeTick > this.tick);
    this.pending.length = 0;
    this.pending.push(...keep);
  }

  private regenMana(): void {
    const add = TICK_MS * this.manaMultiplier;
    const max = this.rules.maxMana * this.rules.manaUnit;
    for (const p of this.players) p.manaUnits = Math.min(max, p.manaUnits + add);
  }

  private updateClock(): void {
    const r = this.rules;
    if (this.phase === 'regulation') {
      if (r.regulationTicks - this.tick === r.doubleManaLastTicks)
        this.events.push({ type: 'announcement', tick: this.tick, kind: 'doubleMana' });
      if (this.tick >= r.regulationTicks) {
        const [c0, c1] = [this.players[0].crowns, this.players[1].crowns];
        if (c0 !== c1) this.endMatch(c0 > c1 ? 0 : 1, 'crowns');
        else {
          this.phase = 'overtime';
          this.events.push({ type: 'announcement', tick: this.tick, kind: 'overtime' });
        }
      }
    } else if (this.phase === 'overtime') {
      if (r.tripleManaLastTicks > 0 && this.overtimeTicksLeft === r.tripleManaLastTicks)
        this.events.push({ type: 'announcement', tick: this.tick, kind: 'tripleMana' });
      if (this.overtimeTicksLeft <= 0) {
        // 延長でも決まらなければ、一番HPが低いタワー同士を比べてHPが高い方の勝ち
        const m0 = this.lowestTowerHp(0);
        const m1 = this.lowestTowerHp(1);
        if (m0 === m1) this.endMatch(-1, 'draw');
        else this.endMatch(m0 > m1 ? 0 : 1, 'towerHp');
      }
    }
  }

  lowestTowerHp(player: number): number {
    let min = Infinity;
    for (const s of TOWER_SLOTS) {
      const t = this.getTower(player, s);
      if (t && t.hp > 0 && t.hp < min) min = t.hp;
    }
    return min === Infinity ? 0 : min;
  }

  /** 切断負けなど外部要因で終わらせる */
  forfeit(loser: number): void {
    this.endMatch(1 - loser, 'forfeit');
  }

  private endMatch(winner: number, reason: EndReason): void {
    if (this.isOver) return;
    this.winner = winner;
    this.endReason = reason;
    this.phase = 'ended';
    this.events.push({ type: 'matchEnded', tick: this.tick, winner, reason });
  }

  // ------------------------------------------------------------ ルーン

  /**
   * ルーン：決まった間隔でどちらかの橋の中央に現れ、最初に触れたユニットの陣営が力を得る。
   * どちらの橋に出るかはシード由来の乱数で決まる（リプレイ・オンラインでも同じになる）。
   */
  private updateRune(): void {
    const r = this.rules;
    if (r.runeIntervalTicks <= 0 || this.nextRuneTick <= 0) return;
    if (!this.rune && this.tick >= this.nextRuneTick) {
      const bx = r.bridgeX[this.rng.range(r.bridgeX.length)];
      this.rune = { pos: { x: bx, y: idiv(r.riverStart + r.riverEnd, 2) }, spawnTick: this.tick };
      this.events.push({ type: 'runeSpawned', tick: this.tick, pos: { ...this.rune.pos } });
    }
    if (!this.rune) return;
    for (const e of this.entities) {
      if (e.hp <= 0 || e.kind !== 'troop' || e.deployTimer > 0) continue;
      const reach = r.runeRadius + e.radius;
      if (sqrDist(e.pos, this.rune.pos) > reach * reach) continue;
      this.players[e.owner].runeCharged = true;
      this.events.push({ type: 'runeClaimed', tick: this.tick, owner: e.owner, pos: { ...this.rune.pos }, by: e.id });
      this.rune = null;
      this.nextRuneTick = this.tick + r.runeIntervalTicks;
      return;
    }
  }

  // ------------------------------------------------------------ 生成

  private spawnCard(owner: number, card: CardStats, center: Vec, empowered = false): void {
    const r = this.rules;
    const n = card.count;
    let cols = 1;
    while (cols * cols < n) cols++;
    const rows = idiv(n + cols - 1, cols);
    const sign = owner === 0 ? 1 : -1;
    let idx = 0;
    for (let row = 0; row < rows && idx < n; row++) {
      const inRow = Math.min(cols, n - idx);
      for (let c = 0; c < inRow; c++, idx++) {
        const ox = n === 1 ? 0 : idiv((2 * c - (inRow - 1)) * card.spawnSpacing, 2);
        const oy = n === 1 ? 0 : sign * idiv((2 * row - (rows - 1)) * card.spawnSpacing, 2);
        this.spawnUnit(
          owner,
          card,
          {
            x: clamp(center.x + ox, card.radius, r.width - card.radius),
            y: clamp(center.y + oy, card.radius, r.height - card.radius),
          },
          empowered,
        );
      }
    }
  }

  private spawnUnit(owner: number, card: CardStats, pos: Vec, empowered = false): Entity {
    const building = card.type === 'building';
    const boost = (v: number) => (empowered ? idiv(v * (100 + this.rules.runeEmpowerPercent), 100) : v);
    const e: Entity = {
      id: this.nextId++,
      owner,
      kind: building ? 'building' : 'troop',
      tower: null,
      card,
      pos,
      prevPos: { ...pos },
      hp: boost(card.hitpoints),
      maxHp: boost(card.hitpoints),
      radius: card.radius,
      mass: building ? 0 : card.mass,
      flying: card.flying,
      damage: boost(card.damage),
      hitTicks: card.hitTicks,
      firstHitTicks: card.firstHitTicks,
      range: card.range,
      sight: Math.max(card.sight, card.range),
      speed: card.speed,
      splashRadius: card.splashRadius,
      projectileSpeed: card.projectileSpeed,
      hitsAir: card.hitsAir,
      hitsGround: card.hitsGround,
      buildingsOnly: card.buildingsOnly,
      targetId: -1,
      attacking: false,
      attackTimer: 0,
      deployTimer: card.deployTicks,
      stunTimer: 0,
      lifetimeTicks: card.lifetimeTicks,
      decayRemainder: 0,
      active: true,
      lastAttackTick: -1000,
      lastDamagedTick: -1000,
      spawnTick: this.tick,
      empowered,
    };
    this.addEntity(e);
    this.events.push({ type: 'entitySpawned', tick: this.tick, id: e.id, owner, pos: { ...pos }, card });
    return e;
  }

  private castSpell(owner: number, card: CardStats, target: Vec, empowered = false): void {
    this.events.push({ type: 'spellCast', tick: this.tick, owner, pos: target, card });
    const pct = empowered ? 100 + this.rules.runeEmpowerPercent : 100;
    if (card.spellTravelSpeed <= 0) {
      this.spellImpact(owner, card, target, pct);
      return;
    }
    const king = this.getTower(owner, 'king');
    const origin = king ? { ...king.pos } : toWorld(this.rules, owner, this.rules.king.localPos);
    const p: Projectile = {
      id: this.nextId++,
      owner,
      sourceId: -1,
      targetId: -1,
      pos: { ...origin },
      prevPos: { ...origin },
      origin,
      targetPos: { ...target },
      speed: card.spellTravelSpeed,
      damage: idiv(card.damage * pct, 100),
      towerDamage: idiv(card.crownTowerDamage * pct, 100),
      splash: card.spellRadius,
      hitsAir: true,
      hitsGround: true,
      spell: card,
      fromTower: false,
      done: false,
    };
    this.projectiles.push(p);
    this.events.push({ type: 'projectileLaunched', tick: this.tick, id: p.id, sourceId: -1, owner });
  }

  private spellImpact(owner: number, card: CardStats, at: Vec, pct = 100, damage?: number, towerDamage?: number): void {
    this.events.push({ type: 'spellImpact', tick: this.tick, owner, pos: { ...at }, card, radius: card.spellRadius });
    const d = damage ?? idiv(card.damage * pct, 100);
    const td = towerDamage ?? idiv(card.crownTowerDamage * pct, 100);
    this.areaDamage(owner, -1, at, card.spellRadius, d, td, true, true, card.stunTicks, card.knockback);
  }

  // ------------------------------------------------------------ 行動

  private updateTroop(e: Entity): void {
    if (e.deployTimer > 0) {
      e.deployTimer--; // 出撃待ち：動かない（無敵ではない）
      return;
    }
    if (e.stunTimer > 0) {
      e.stunTimer--;
      return;
    }

    let target: Entity | undefined;
    if (e.attacking) {
      // 攻撃を始めた相手は、倒すか射程外に出るまで狙い続ける
      const t = this.getEntity(e.targetId);
      if (t && t.hp > 0 && this.inRange(e, t)) target = t;
      else e.attacking = false;
    }

    if (!e.attacking) {
      const t = this.findTarget(e) ?? this.defaultBuildingTarget(e);
      e.targetId = t?.id ?? -1;
      if (!t) return;
      if (this.inRange(e, t)) {
        e.attacking = true;
        e.attackTimer = e.firstHitTicks;
        target = t;
      } else {
        const wp = this.avoidObstacles(e, this.nextWaypoint(e, t.pos), t.id);
        e.pos = moveTowards(e.pos, wp, e.speed);
        return;
      }
    }
    this.tickAttack(e, target!);
  }

  private updateStructure(e: Entity): void {
    if (e.kind === 'building') {
      if (e.deployTimer > 0) {
        e.deployTimer--;
        return;
      }
      if (e.lifetimeTicks > 0) {
        // 建物は寿命に合わせて少しずつHPが減る
        e.decayRemainder += e.maxHp;
        const loss = idiv(e.decayRemainder, e.lifetimeTicks);
        e.decayRemainder -= loss * e.lifetimeTicks;
        if (loss > 0) {
          e.hp -= loss;
          if (e.hp <= 0) {
            this.kill(e, -1);
            return;
          }
        }
      }
    } else if (!e.active) return; // 休止中のキングタワー

    if (e.stunTimer > 0) {
      e.stunTimer--;
      return;
    }

    let target: Entity | undefined;
    if (e.attacking) {
      const t = this.getEntity(e.targetId);
      if (t && t.hp > 0 && this.inRange(e, t)) target = t;
      else e.attacking = false;
    }
    if (!e.attacking) {
      const t = this.findTarget(e);
      e.targetId = t?.id ?? -1;
      if (!t || !this.inRange(e, t)) return;
      e.attacking = true;
      e.attackTimer = e.firstHitTicks;
      target = t;
    }
    this.tickAttack(e, target!);
  }

  private tickAttack(e: Entity, target: Entity): void {
    e.attackTimer--;
    if (e.attackTimer > 0) return;
    e.attackTimer = e.hitTicks;
    e.lastAttackTick = this.tick;
    this.events.push({ type: 'attack', tick: this.tick, id: e.id, targetId: target.id, owner: e.owner });

    if (e.projectileSpeed > 0) {
      const p: Projectile = {
        id: this.nextId++,
        owner: e.owner,
        sourceId: e.id,
        targetId: target.id,
        pos: { ...e.pos },
        prevPos: { ...e.pos },
        origin: { ...e.pos },
        targetPos: { ...target.pos },
        speed: e.projectileSpeed,
        damage: e.damage,
        towerDamage: e.damage,
        splash: e.splashRadius,
        hitsAir: e.hitsAir,
        hitsGround: e.hitsGround,
        spell: null,
        fromTower: e.kind === 'tower',
        done: false,
      };
      this.projectiles.push(p);
      this.events.push({ type: 'projectileLaunched', tick: this.tick, id: p.id, sourceId: e.id, owner: e.owner });
    } else if (e.splashRadius > 0) {
      this.areaDamage(e.owner, e.id, target.pos, e.splashRadius, e.damage, e.damage, e.hitsAir, e.hitsGround, 0, 0);
    } else {
      this.applyDamage(target, e.damage, e.id);
    }
  }

  private canTarget(e: Entity, o: Entity): boolean {
    if (o.hp <= 0 || o.owner === e.owner) return false;
    if (o.flying ? !e.hitsAir : !e.hitsGround) return false;
    if (e.buildingsOnly && o.kind === 'troop') return false;
    return true;
  }

  /** 体の縁どうしの距離 */
  private edgeDistance(a: Entity, b: Entity): number {
    return Math.max(0, dist(a.pos, b.pos) - a.radius - b.radius);
  }

  private inRange(e: Entity, t: Entity): boolean {
    return this.edgeDistance(e, t) <= e.range;
  }

  /** 視界（索敵範囲）内で一番近い攻撃可能な敵 */
  private findTarget(e: Entity): Entity | undefined {
    let best: Entity | undefined;
    let bestD = Infinity;
    for (const o of this.entities) {
      if (!this.canTarget(e, o)) continue;
      const d = this.edgeDistance(e, o);
      if (d > e.sight) continue;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /** 同じレーンの一番近い敵の建物（サイドタワー → キングタワー） */
  private defaultBuildingTarget(e: Entity): Entity | undefined {
    const enemy = 1 - e.owner;
    const princess = this.getTower(enemy, laneOf(this.rules, e.pos.x) === 0 ? 'left' : 'right');
    if (princess && this.canTarget(e, princess)) return princess;
    const king = this.getTower(enemy, 'king');
    if (king && this.canTarget(e, king)) return king;
    return undefined;
  }

  /** -1 = 下側, 0 = 川（境界を含む）, 1 = 上側 */
  private sideOf(y: number): number {
    if (y < this.rules.riverStart) return -1;
    if (y > this.rules.riverEnd) return 1;
    return 0;
  }

  /** 地上ユニットは橋を通って目標へ向かう */
  private nextWaypoint(e: Entity, target: Vec): Vec {
    if (e.flying) return target;
    const us = this.sideOf(e.pos.y);
    const them = this.sideOf(target.y);
    if (us === them && us !== 0) return target;
    const bx = this.nearestBridge(e.pos.x);
    if (us !== 0) return { x: bx, y: us < 0 ? this.rules.riverStart : this.rules.riverEnd }; // 橋の入口へ
    if (them === 0) return target;
    const over = UNIT / 2; // 橋の上：目標側の岸の少し先へ
    return { x: bx, y: them > 0 ? this.rules.riverEnd + over : this.rules.riverStart - over };
  }

  /**
   * 進路上に建物・タワー（目標以外）があれば、その横をすり抜ける点に向かう。
   * 一番手前の障害物だけを見る簡易的な回避で、毎tick計算し直すので回り込むように動く。
   */
  private avoidObstacles(e: Entity, wp: Vec, targetId: number): Vec {
    if (e.flying) return wp;
    const dx = wp.x - e.pos.x;
    const dy = wp.y - e.pos.y;
    const len = isqrt(dx * dx + dy * dy);
    if (len === 0) return wp;
    let best: Entity | null = null;
    let bestT = Infinity;
    let bestCross = 0;
    for (const o of this.entities) {
      if (o.hp <= 0 || o.kind === 'troop' || o.id === targetId) continue;
      const ox = o.pos.x - e.pos.x;
      const oy = o.pos.y - e.pos.y;
      const clearance = o.radius + e.radius;
      const t = idiv(ox * dx + oy * dy, len); // 進行方向への射影
      if (t <= 0 || t >= len + clearance) continue;
      const cross = dx * oy - dy * ox;
      if (idiv(Math.abs(cross), len) >= clearance) continue;
      if (t < bestT) {
        bestT = t;
        best = o;
        bestCross = cross;
      }
    }
    if (!best) return wp;
    // 障害物が進行方向の左にあれば右へ、右にあれば左へ（真正面ならアリーナの中央側へ）
    let side = bestCross > 0 ? -1 : bestCross < 0 ? 1 : 0;
    if (side === 0) side = (best.pos.x < this.rules.width / 2 ? 1 : -1) * (dy >= 0 ? -1 : 1);
    const nx = idiv(-dy * side * UNIT, len);
    const ny = idiv(dx * side * UNIT, len);
    const r = best.radius + e.radius + 300;
    return { x: best.pos.x + idiv(nx * r, UNIT), y: best.pos.y + idiv(ny * r, UNIT) };
  }

  private nearestBridge(x: number): number {
    let best = this.rules.bridgeX[0];
    for (const b of this.rules.bridgeX) if (Math.abs(b - x) < Math.abs(best - x)) best = b;
    return best;
  }

  // ------------------------------------------------------------ 押し合い

  private resolveCollisions(): void {
    const list = this.entities;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (b.hp <= 0 || a.flying !== b.flying) continue;
        const aStatic = a.kind !== 'troop';
        const bStatic = b.kind !== 'troop';
        if (aStatic && bStatic) continue;
        const minD = a.radius + b.radius;
        const d2 = sqrDist(a.pos, b.pos);
        if (d2 >= minD * minD) continue;

        const real = isqrt(d2);
        let dx = b.pos.x - a.pos.x;
        let dy = b.pos.y - a.pos.y;
        let d = real;
        if (d === 0) {
          // 完全に重なっていたらIDで決まる方向に離す
          if (((a.id + b.id) & 1) === 0) [dx, dy] = [UNIT, 0];
          else [dx, dy] = [0, UNIT];
          d = UNIT;
        }
        const overlap = minD - real;
        let moveA: number;
        let moveB: number;
        if (aStatic) [moveA, moveB] = [0, overlap];
        else if (bStatic) [moveA, moveB] = [overlap, 0];
        else {
          // 軽い方がよく押される（動く量は相手の重さに比例）
          moveA = idiv(overlap * b.mass, a.mass + b.mass);
          moveB = overlap - moveA;
        }
        if (moveA > 0) a.pos = { x: a.pos.x - idiv(dx * moveA, d), y: a.pos.y - idiv(dy * moveA, d) };
        if (moveB > 0) b.pos = { x: b.pos.x + idiv(dx * moveB, d), y: b.pos.y + idiv(dy * moveB, d) };
      }
    }
    for (const e of list) if (e.hp > 0 && e.kind === 'troop') this.constrainToArena(e);
  }

  private constrainToArena(e: Entity): void {
    const r = this.rules;
    let x = clamp(e.pos.x, e.radius, r.width - e.radius);
    let y = clamp(e.pos.y, e.radius, r.height - e.radius);
    if (!e.flying && y > r.riverStart && y < r.riverEnd) {
      const bx = this.nearestBridge(x);
      const half = Math.max(0, r.bridgeHalfWidth - e.radius);
      if (Math.abs(x - bx) > half) {
        const wasInRiver = e.prevPos.y > r.riverStart && e.prevPos.y < r.riverEnd;
        if (wasInRiver) x = clamp(x, bx - half, bx + half); // 橋から落ちない
        else y = e.prevPos.y <= r.riverStart ? r.riverStart : r.riverEnd; // 川には入れない
      }
    }
    e.pos = { x, y };
  }

  // ------------------------------------------------------------ 弾

  private updateProjectiles(): void {
    const n = this.projectiles.length;
    for (let i = 0; i < n; i++) {
      const p = this.projectiles[i];
      if (p.done) continue;
      const target = p.targetId > 0 ? this.getEntity(p.targetId) : undefined;
      if (target && target.hp > 0) p.targetPos = { ...target.pos };
      p.pos = moveTowards(p.pos, p.targetPos, p.speed);
      if (!vecEq(p.pos, p.targetPos)) continue;

      p.done = true;
      this.events.push({ type: 'projectileHit', tick: this.tick, id: p.id, owner: p.owner, pos: { ...p.pos } });
      if (p.spell) this.spellImpact(p.owner, p.spell, p.pos, 100, p.damage, p.towerDamage);
      else if (p.splash > 0) this.areaDamage(p.owner, p.sourceId, p.pos, p.splash, p.damage, p.towerDamage, p.hitsAir, p.hitsGround, 0, 0);
      else if (target && target.hp > 0) this.applyDamage(target, p.damage, p.sourceId);
      if (this.isOver) return;
    }
  }

  // ------------------------------------------------------------ ダメージ

  private areaDamage(
    owner: number,
    sourceId: number,
    center: Vec,
    radius: number,
    damage: number,
    towerDamage: number,
    air: boolean,
    ground: boolean,
    stunTicks: number,
    knockback: number,
  ): void {
    const n = this.entities.length;
    for (let i = 0; i < n; i++) {
      const o = this.entities[i];
      if (o.hp <= 0 || o.owner === owner) continue;
      if (o.flying ? !air : !ground) continue;
      if (dist(center, o.pos) - o.radius > radius) continue;
      if (stunTicks > 0) {
        o.stunTimer = Math.max(o.stunTimer, stunTicks);
        o.attackTimer = o.firstHitTicks; // 溜めをリセット
      }
      if (knockback > 0 && o.kind === 'troop') {
        const from = { ...o.pos };
        let dir = { x: o.pos.x - center.x, y: o.pos.y - center.y };
        if (dir.x === 0 && dir.y === 0) dir = { x: 0, y: o.owner === 0 ? -1 : 1 };
        const push = withLength(dir, knockback);
        o.prevPos = { ...o.pos };
        o.pos = { x: o.pos.x + push.x, y: o.pos.y + push.y };
        this.constrainToArena(o);
        this.events.push({ type: 'knockback', tick: this.tick, id: o.id, from });
      }
      this.applyDamage(o, o.kind === 'tower' ? towerDamage : damage, sourceId);
      if (this.isOver) return;
    }
  }

  private applyDamage(target: Entity, amount: number, sourceId: number): void {
    if (target.hp <= 0 || amount <= 0) return;
    target.hp -= amount;
    target.lastDamagedTick = this.tick;
    this.events.push({ type: 'damaged', tick: this.tick, id: target.id, sourceId, owner: target.owner, amount, pos: { ...target.pos } });
    if (target.tower === 'king' && !target.active) this.activateKing(target);
    if (target.hp <= 0) this.kill(target, sourceId);
  }

  private activateKing(king: Entity): void {
    if (king.active || king.hp <= 0) return;
    king.active = true;
    this.events.push({ type: 'kingActivated', tick: this.tick, id: king.id, owner: king.owner });
  }

  private kill(e: Entity, _sourceId: number): void {
    e.hp = 0;
    this.events.push({ type: 'entityDied', tick: this.tick, id: e.id, owner: e.owner, pos: { ...e.pos }, kind: e.kind });
    if (e.kind !== 'tower' || !e.tower) return;

    this.events.push({ type: 'towerDestroyed', tick: this.tick, id: e.id, owner: e.owner, slot: e.tower, pos: { ...e.pos } });
    const scorer = this.players[1 - e.owner];
    if (e.tower === 'king') {
      scorer.crowns = 3;
      this.events.push({ type: 'crownScored', tick: this.tick, owner: scorer.index, crowns: 3, pos: { ...e.pos } });
      this.endMatch(scorer.index, 'kingDestroyed');
      return;
    }
    scorer.crowns = Math.min(3, scorer.crowns + 1);
    this.events.push({ type: 'crownScored', tick: this.tick, owner: scorer.index, crowns: scorer.crowns, pos: { ...e.pos } });
    const king = this.getTower(e.owner, 'king');
    if (king) this.activateKing(king);
    if (this.phase === 'overtime') this.endMatch(scorer.index, 'suddenDeath'); // サドンデス
  }

  // ------------------------------------------------------------ 検証用

  /** 状態のハッシュ。リプレイ・オンライン同期ずれの検出に使う */
  stateHash(): string {
    const h = new StateHasher();
    h.mix(this.tick);
    h.mixString(this.phase);
    h.mix(this.winner);
    h.mix(this.rune ? this.rune.pos.x : -1);
    h.mix(this.nextRuneTick);
    for (const p of this.players) {
      h.mix(p.manaUnits);
      h.mix(p.crowns);
      h.mix(p.runeCharged ? 1 : 0);
      for (const c of p.hand) h.mixString(c.id);
    }
    for (const e of this.entities) {
      h.mix(e.id);
      h.mix(e.pos.x);
      h.mix(e.pos.y);
      h.mix(e.hp);
      h.mix(e.targetId);
      h.mix(e.attackTimer);
    }
    for (const p of this.projectiles) {
      h.mix(p.id);
      h.mix(p.pos.x);
      h.mix(p.pos.y);
    }
    return h.digest();
  }
}

