import type { Balance, CardDef, SupportKind, Team } from '../core/types';
import { enemyOf } from '../core/types';
import { Rng } from '../core/Rng';
import type { Combatant } from '../entities/Combatant';
import { isStructure } from '../entities/Combatant';
import { createTower } from '../entities/Tower';
import { createUnitFromCard, formationOffsets } from '../entities/Unit';
import type { Projectile } from '../entities/Projectile';
import { DeckSystem, type DeckEvent } from './DeckSystem';
import { ManaSystem } from './ManaSystem';
import { MatchTimer, type MatchOutcome } from './MatchTimer';
import { applySupport, computeStats, updateBuffs } from './BuffSystem';
import { dealDamage, splashTargets } from './Combat';
import { canTarget, findLaneTower, findNearestTarget, isInRange } from './Targeting';
import { clampToTerrain, separate, stepToward } from './Movement';
import { TOWER_SLOTS, isDeployable, isInsideArena, nextWaypoint, type Lane } from './Arena';

export type WorldEvent =
  | { type: 'spawn'; id: number }
  | { type: 'deploy'; team: Team; cardId: string; x: number; y: number }
  | { type: 'attack'; id: number; targetId: number; sfx: string | null }
  | { type: 'projectile'; id: number }
  | { type: 'damage'; id: number; amount: number; x: number; y: number; toShield: number }
  | { type: 'heal'; id: number; amount: number; x: number; y: number }
  | { type: 'support'; id: number; kind: SupportKind; cardId: string }
  | { type: 'death'; id: number; x: number; y: number; kind: Combatant['kind'] }
  | { type: 'tower_destroyed'; id: number; team: Team; towerType: 'king' | 'guard' }
  | { type: 'king_awake'; team: Team }
  | { type: 'impact'; x: number; y: number; radius: number; isSpell: boolean; sfx: string | null }
  | { type: 'deck'; team: Team; event: DeckEvent }
  | { type: 'overtime' }
  | { type: 'double_mana' }
  | { type: 'match_end'; outcome: MatchOutcome };

export type PlayFailure = 'not_in_hand' | 'mana' | 'position' | 'target' | 'not_running';
export type PlayResult = { ok: true } | { ok: false; reason: PlayFailure };

export interface PlayerState {
  team: Team;
  mana: ManaSystem;
  deck: DeckSystem;
  crowns: number;
}

export interface WorldOptions {
  cards: readonly CardDef[];
  balance: Balance;
  decks: [readonly string[], readonly string[]];
  seed?: number;
}

/**
 * バトルの全ロジック（Phaser 非依存）。固定タイムステップで update(dt) を呼ぶ。
 */
export class BattleWorld {
  readonly cards = new Map<string, CardDef>();
  readonly balance: Balance;
  readonly rng: Rng;
  readonly players: [PlayerState, PlayerState];
  readonly timer: MatchTimer;
  combatants: Combatant[] = [];
  projectiles: Projectile[] = [];
  events: WorldEvent[] = [];
  time = 0;
  started = false;
  private nextId = 1;
  private wasDoubleMana = false;

  constructor(opts: WorldOptions) {
    for (const c of opts.cards) this.cards.set(c.id, c);
    this.balance = opts.balance;
    this.rng = new Rng(opts.seed ?? Date.now());
    const deckCfg = opts.balance.deck;
    this.players = [0, 1].map((team) => ({
      team: team as Team,
      mana: new ManaSystem(opts.balance.mana),
      deck: new DeckSystem(opts.decks[team], deckCfg, new Rng(this.rng.int(2 ** 31))),
      crowns: 0,
    })) as [PlayerState, PlayerState];
    this.timer = new MatchTimer(opts.balance.match);
    for (const slot of TOWER_SLOTS) {
      const b = slot.type === 'king' ? opts.balance.towers.king : opts.balance.towers.guard;
      this.combatants.push(createTower(this.nextId++, slot, b));
    }
  }

  /** 試合開始：両者の初期手札をドロー */
  start(): void {
    if (this.started) return;
    this.started = true;
    for (const p of this.players) {
      for (const e of p.deck.start()) this.events.push({ type: 'deck', team: p.team, event: e });
    }
  }

  get isRunning(): boolean {
    return this.started && this.timer.phase !== 'ended';
  }

  card(id: string): CardDef {
    const c = this.cards.get(id);
    if (!c) throw new Error(`unknown card ${id}`);
    return c;
  }

  byId(id: number | null): Combatant | undefined {
    if (id === null) return undefined;
    return this.combatants.find((c) => c.id === id);
  }

  towers(team: Team): Combatant[] {
    return this.combatants.filter((c) => c.kind === 'tower' && c.team === team);
  }

  /** そのチームが相手の守護塔を壊したレーン（配置範囲の拡張に使う） */
  destroyedEnemyLanes(team: Team): Lane[] {
    return this.towers(enemyOf(team))
      .filter((t) => t.towerType === 'guard' && !t.alive)
      .map((t) => t.lane as Lane);
  }

  canDeployAt(team: Team, x: number, y: number): boolean {
    return isDeployable(team, x, y, this.destroyedEnemyLanes(team));
  }

  /** サポートカードの対象にできるか */
  isSupportTarget(team: Team, c: Combatant | undefined): c is Combatant {
    return !!c && c.alive && c.team === team && c.kind === 'unit';
  }

  hpRatio(team: Team): number {
    let hp = 0;
    let max = 0;
    for (const t of this.towers(team)) {
      hp += t.hp;
      max += t.maxHp;
    }
    return max > 0 ? hp / max : 0;
  }

  /** 使用可否のチェックのみ（マナ・手札は変化しない） */
  checkPlay(team: Team, uid: number, x: number, y: number, targetId: number | null = null): PlayResult {
    if (!this.isRunning) return { ok: false, reason: 'not_running' };
    const p = this.players[team];
    const inst = p.deck.findInHand(uid);
    if (!inst) return { ok: false, reason: 'not_in_hand' };
    const card = this.card(inst.cardId);
    if (!p.mana.canAfford(card.cost)) return { ok: false, reason: 'mana' };
    switch (card.type) {
      case 'unit':
      case 'building':
        if (!this.canDeployAt(team, x, y)) return { ok: false, reason: 'position' };
        break;
      case 'spell':
        if (!isInsideArena(x, y)) return { ok: false, reason: 'position' };
        break;
      case 'support':
        if (!this.isSupportTarget(team, this.byId(targetId))) return { ok: false, reason: 'target' };
        break;
    }
    return { ok: true };
  }

  /** カードを使用する。成功したらマナを消費し、カードは捨て札へ。 */
  playCard(team: Team, uid: number, x: number, y: number, targetId: number | null = null): PlayResult {
    const check = this.checkPlay(team, uid, x, y, targetId);
    if (!check.ok) return check;
    const p = this.players[team];
    const card = this.card(p.deck.findInHand(uid)!.cardId);
    p.mana.spend(card.cost);
    p.deck.play(uid);
    switch (card.type) {
      case 'unit':
      case 'building':
        this.spawnCard(team, card, x, y);
        break;
      case 'spell':
        this.castSpell(team, card, x, y);
        break;
      case 'support':
        this.applySupportCard(team, card, this.byId(targetId)!);
        break;
    }
    return { ok: true };
  }

  private spawnCard(team: Team, card: CardDef, x: number, y: number): void {
    this.events.push({ type: 'deploy', team, cardId: card.id, x, y });
    for (const off of formationOffsets(card.count)) {
      const u = createUnitFromCard(this.nextId++, card, team, x + off.dx, y + off.dy);
      clampToTerrain(u);
      this.combatants.push(u);
      this.events.push({ type: 'spawn', id: u.id });
    }
  }

  private castSpell(team: Team, card: CardDef, x: number, y: number): void {
    const king = this.towers(team).find((t) => t.towerType === 'king')!;
    const proj: Projectile = {
      id: this.nextId++,
      team,
      sourceId: king.id,
      x: king.x,
      y: king.y,
      tx: x,
      ty: y,
      targetId: null,
      speed: card.projectileSpeed,
      damage: card.damage,
      splashRadius: card.splashRadius,
      targetType: card.targetType,
      texture: card.projectile ?? 'fx_flame',
      towerDamageRatio: this.balance.spell.towerDamageRatio,
      isSpell: true,
      hitSfx: card.sfx.hit ?? null,
      alive: true,
    };
    this.projectiles.push(proj);
    this.events.push({ type: 'deploy', team, cardId: card.id, x, y });
    this.events.push({ type: 'projectile', id: proj.id });
  }

  private applySupportCard(team: Team, card: CardDef, target: Combatant): void {
    const eff = card.supportEffect!;
    const amount = applySupport(target, eff, this.balance.buff.stacking);
    this.events.push({ type: 'deploy', team, cardId: card.id, x: target.x, y: target.y });
    this.events.push({ type: 'support', id: target.id, kind: eff.kind, cardId: card.id });
    if (eff.kind === 'heal') this.events.push({ type: 'heal', id: target.id, amount, x: target.x, y: target.y });
  }

  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** 固定タイムステップ1回分 */
  update(dt: number): void {
    if (!this.isRunning) return;
    this.time += dt;

    const outcome = this.timer.update(dt, {
      crowns: [this.players[0].crowns, this.players[1].crowns],
      hpRatio: [this.hpRatio(0), this.hpRatio(1)],
    });
    if (this.timer.phase === 'overtime' && !this.overtimeAnnounced) {
      this.overtimeAnnounced = true;
      this.events.push({ type: 'overtime' });
    }
    if (outcome) {
      this.events.push({ type: 'match_end', outcome });
      return;
    }
    const dbl = this.timer.isDoubleMana;
    if (dbl && !this.wasDoubleMana) this.events.push({ type: 'double_mana' });
    this.wasDoubleMana = dbl;

    for (const p of this.players) {
      p.mana.multiplier = dbl ? this.balance.mana.doubleMultiplier : 1;
      p.mana.update(dt);
      for (const e of p.deck.update(dt)) this.events.push({ type: 'deck', team: p.team, event: e });
    }

    for (const c of this.combatants) this.updateCombatant(c, dt);
    this.updateProjectiles(dt);

    const movers = this.combatants.filter((c) => c.kind === 'unit' && c.alive);
    const structures = this.combatants.filter((c) => isStructure(c) && c.alive);
    separate(movers, structures);
    for (const u of movers) clampToTerrain(u);

    this.resolveDeaths();
  }

  private overtimeAnnounced = false;

  private updateCombatant(c: Combatant, dt: number): void {
    if (!c.alive) return;
    if (c.deployTimer > 0) {
      c.deployTimer = Math.max(0, c.deployTimer - dt);
      return;
    }
    updateBuffs(c, dt);
    if (c.lifetime !== Infinity) {
      c.lifetime -= dt;
      if (c.lifetime <= 0) {
        c.hp = 0;
        c.alive = false;
        return;
      }
    }
    if (c.kind === 'tower' && !c.active) return;

    const stats = computeStats(c.base, c.buffs);
    c.attackCooldown = Math.max(0, c.attackCooldown - dt);

    let target = this.byId(c.targetId);
    const keep = target && target.alive && canTarget(c.base.targetType, target) && isInRange(c, target, c.base.range + 0.25);
    if (!keep) {
      target = findNearestTarget(c, this.combatants, c.base.sightRange) ?? undefined;
      if (!target && c.kind === 'unit') target = findLaneTower(c, this.combatants) ?? undefined;
    }
    c.targetId = target?.id ?? null;
    c.moving = false;
    if (!target) return;

    if (isInRange(c, target, c.base.range)) {
      if (target.x !== c.x) c.facing = target.x < c.x ? -1 : 1;
      if (c.attackCooldown <= 0) {
        this.attack(c, target, stats.damage);
        c.attackCooldown = stats.attackInterval;
      }
    } else if (c.kind === 'unit') {
      const wp = nextWaypoint(c.x, c.y, target.x, target.y, c.isFlying);
      const px = c.x;
      stepToward(c, wp.x, wp.y, stats.moveSpeed * dt);
      if (Math.abs(c.x - px) > 1e-4) c.facing = c.x < px ? -1 : 1;
      c.moving = true;
    }
  }

  private attack(c: Combatant, target: Combatant, damage: number): void {
    c.attackedAt = this.time;
    const sfx = c.cardId ? (this.card(c.cardId).sfx.attack ?? null) : c.towerType === 'king' ? 'se_cannon' : 'se_arrow';
    this.events.push({ type: 'attack', id: c.id, targetId: target.id, sfx });
    if (c.base.projectile) {
      const proj: Projectile = {
        id: this.nextId++,
        team: c.team,
        sourceId: c.id,
        x: c.x,
        y: c.y,
        tx: target.x,
        ty: target.y,
        targetId: target.id,
        speed: c.base.projectileSpeed,
        damage,
        splashRadius: c.base.splashRadius,
        targetType: c.base.targetType,
        texture: c.base.projectile,
        towerDamageRatio: 1,
        isSpell: false,
        hitSfx: null,
        alive: true,
      };
      this.projectiles.push(proj);
      this.events.push({ type: 'projectile', id: proj.id });
    } else {
      this.applyHit(c.team, target, target.x, target.y, damage, c.base.splashRadius, c.base.targetType, 1);
    }
  }

  private applyHit(
    team: Team,
    target: Combatant | undefined,
    x: number,
    y: number,
    damage: number,
    splash: number,
    targetType: Combatant['base']['targetType'],
    towerRatio: number,
  ): void {
    const victims = splash > 0 ? splashTargets(x, y, splash, enemyOf(team), targetType, this.combatants) : target && target.alive ? [target] : [];
    for (const v of victims) {
      const amount = v.kind === 'tower' ? damage * towerRatio : damage;
      const r = dealDamage(v, amount);
      if (r.total > 0) {
        this.events.push({ type: 'damage', id: v.id, amount: r.total, x: v.x, y: v.y, toShield: r.toShield });
        if (v.kind === 'tower' && v.towerType === 'king' && !v.active) this.wakeKing(v.team);
      }
    }
  }

  private wakeKing(team: Team): void {
    const king = this.towers(team).find((t) => t.towerType === 'king');
    if (king && king.alive && !king.active) {
      king.active = true;
      this.events.push({ type: 'king_awake', team });
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const target = this.byId(p.targetId);
      if (target && target.alive) {
        p.tx = target.x;
        p.ty = target.y;
      }
      if (stepToward(p, p.tx, p.ty, p.speed * dt)) {
        p.alive = false;
        this.applyHit(p.team, target, p.tx, p.ty, p.damage, p.splashRadius, p.targetType, p.towerDamageRatio);
        if (p.splashRadius > 0 || p.isSpell) {
          this.events.push({ type: 'impact', x: p.tx, y: p.ty, radius: p.splashRadius, isSpell: p.isSpell, sfx: p.hitSfx });
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private resolveDeaths(): void {
    const survivors: Combatant[] = [];
    for (const c of this.combatants) {
      if (c.alive) {
        survivors.push(c);
        continue;
      }
      if (c.kind === 'tower') {
        // 壊れた塔は瓦礫として残す（一度だけ処理）
        if (c.hp <= 0 && c.active !== null && !this.destroyedTowers.has(c.id)) {
          this.destroyedTowers.add(c.id);
          const attacker = this.players[enemyOf(c.team)];
          attacker.crowns = c.towerType === 'king' ? 3 : Math.min(3, attacker.crowns + 1);
          this.events.push({ type: 'death', id: c.id, x: c.x, y: c.y, kind: c.kind });
          this.events.push({ type: 'tower_destroyed', id: c.id, team: c.team, towerType: c.towerType! });
          if (c.towerType === 'guard') this.wakeKing(c.team);
        }
        survivors.push(c);
        continue;
      }
      this.events.push({ type: 'death', id: c.id, x: c.x, y: c.y, kind: c.kind });
    }
    this.combatants = survivors;
  }

  private destroyedTowers = new Set<number>();
}
