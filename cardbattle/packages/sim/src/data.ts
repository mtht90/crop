import {
  secondsToTicks,
  speedToPerTick,
  tilesToMilli,
  UNIT,
  velocityToPerTick,
  vecFromTiles,
  type Vec,
} from './math';

// ---------------------------------------------------------------- 生データ（JSON）

export type CardType = 'troop' | 'building' | 'spell';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CardTag =
  | 'tank'
  | 'swarm'
  | 'splash'
  | 'antiAir'
  | 'air'
  | 'building'
  | 'spell'
  | 'ranged'
  | 'melee'
  | 'winCondition'
  | 'antiSwarm';

/** data/cards.json の1枚分。単位：タイル・秒・タイル/分。 */
export interface CardData {
  id: string;
  displayName: string;
  type: CardType;
  rarity: Rarity;
  cost: number;
  tags?: CardTag[];
  count?: number;
  spawnSpacing?: number;
  hitpoints?: number;
  damage?: number;
  hitSpeed?: number;
  firstHitDelay?: number;
  range?: number;
  sightRange?: number;
  speed?: number;
  flying?: boolean;
  canHitGround?: boolean;
  canHitAir?: boolean;
  targets?: 'any' | 'buildings';
  collisionRadius?: number;
  mass?: number;
  splashRadius?: number;
  projectileSpeed?: number;
  deployTime?: number;
  lifetime?: number;
  crownTowerDamage?: number;
  spellRadius?: number;
  spellTravelSpeed?: number;
  stunDuration?: number;
  knockback?: number;
}

export interface TowerData {
  hitpoints: number;
  damage: number;
  hitSpeed: number;
  range: number;
  projectileSpeed: number;
  footprintHalfSize: number;
  x: number;
  y: number;
}

export interface RulesData {
  arenaWidth: number;
  arenaHeight: number;
  riverStartY: number;
  riverEndY: number;
  bridgeX: number[];
  bridgeHalfWidth: number;
  pocketDepth: number;
  princessTower: TowerData;
  kingTower: TowerData;
  maxMana: number;
  startMana: number;
  manaRegenSeconds: number;
  doubleManaLastSeconds: number;
  overtimeBaseMultiplier: number;
  tripleManaLastOvertimeSeconds: number;
  regulationSeconds: number;
  overtimeSeconds: number;
  commandDelaySeconds: number;
  handSize: number;
  deckSize: number;
  rune?: { firstSpawnSeconds: number; intervalSeconds: number; pickupRadius: number; empowerPercent: number };
}

export interface BotProfileData {
  id: string;
  displayName: string;
  reactionSeconds: number;
  thinkIntervalSeconds: number;
  pushMana: number;
  randomCardPermille: number;
  placementJitter: number;
  fireballValueHp: number;
  finishTowersWithSpells: boolean;
  supportPushes: boolean;
}

// ---------------------------------------------------------------- 整数化したデータ

export interface CardStats {
  readonly id: string;
  readonly name: string;
  readonly type: CardType;
  readonly rarity: Rarity;
  readonly cost: number;
  readonly tags: ReadonlySet<CardTag>;
  readonly count: number;
  readonly spawnSpacing: number;
  readonly hitpoints: number;
  readonly damage: number;
  readonly hitTicks: number;
  readonly firstHitTicks: number;
  readonly range: number;
  readonly sight: number;
  readonly speed: number;
  readonly flying: boolean;
  readonly hitsGround: boolean;
  readonly hitsAir: boolean;
  readonly buildingsOnly: boolean;
  readonly radius: number;
  readonly mass: number;
  readonly splashRadius: number;
  readonly projectileSpeed: number;
  readonly deployTicks: number;
  readonly lifetimeTicks: number;
  readonly crownTowerDamage: number;
  readonly spellRadius: number;
  readonly spellTravelSpeed: number;
  readonly stunTicks: number;
  readonly knockback: number;
}

export const hasTag = (c: CardStats, t: CardTag): boolean => c.tags.has(t);
export const isSpell = (c: CardStats): boolean => c.type === 'spell';

export function compileCard(d: CardData): CardStats {
  if (!d.id) throw new Error('card id is empty');
  return {
    id: d.id,
    name: d.displayName,
    type: d.type,
    rarity: d.rarity,
    cost: d.cost,
    tags: new Set(d.tags ?? []),
    count: Math.max(1, d.count ?? 1),
    spawnSpacing: tilesToMilli(d.spawnSpacing ?? 0.6),
    hitpoints: d.hitpoints ?? 0,
    damage: d.damage ?? 0,
    hitTicks: Math.max(1, secondsToTicks(d.hitSpeed ?? 1)),
    firstHitTicks: Math.max(1, secondsToTicks(d.firstHitDelay ?? 0.5)),
    range: tilesToMilli(d.range ?? 1),
    sight: tilesToMilli(d.sightRange ?? 5.5),
    speed: speedToPerTick(d.speed ?? 0),
    flying: d.flying ?? false,
    hitsGround: d.canHitGround ?? true,
    hitsAir: d.canHitAir ?? false,
    buildingsOnly: d.targets === 'buildings',
    radius: tilesToMilli(d.collisionRadius ?? 0.5),
    mass: Math.max(1, d.mass ?? 4),
    splashRadius: tilesToMilli(d.splashRadius ?? 0),
    projectileSpeed: velocityToPerTick(d.projectileSpeed ?? 0),
    deployTicks: secondsToTicks(d.deployTime ?? 1),
    lifetimeTicks: secondsToTicks(d.lifetime ?? 0),
    crownTowerDamage: d.crownTowerDamage ?? 0,
    spellRadius: tilesToMilli(d.spellRadius ?? 0),
    spellTravelSpeed: velocityToPerTick(d.spellTravelSpeed ?? 0),
    stunTicks: secondsToTicks(d.stunDuration ?? 0),
    knockback: tilesToMilli(d.knockback ?? 0),
  };
}

export interface TowerStats {
  hitpoints: number;
  damage: number;
  hitTicks: number;
  range: number;
  projectileSpeed: number;
  halfSize: number;
  localPos: Vec;
}

const compileTower = (t: TowerData): TowerStats => ({
  hitpoints: t.hitpoints,
  damage: t.damage,
  hitTicks: Math.max(1, secondsToTicks(t.hitSpeed)),
  range: tilesToMilli(t.range),
  projectileSpeed: velocityToPerTick(t.projectileSpeed),
  halfSize: tilesToMilli(t.footprintHalfSize),
  localPos: vecFromTiles(t.x, t.y),
});

export interface Rules {
  width: number;
  height: number;
  riverStart: number;
  riverEnd: number;
  bridgeX: number[];
  bridgeHalfWidth: number;
  pocketDepth: number;
  princess: TowerStats;
  king: TowerStats;
  maxMana: number;
  startMana: number;
  /** 1マナぶんの量。毎tick TICK_MS × 倍率 ずつ増える */
  manaUnit: number;
  doubleManaLastTicks: number;
  overtimeBaseMultiplier: number;
  tripleManaLastTicks: number;
  regulationTicks: number;
  overtimeTicks: number;
  commandDelayTicks: number;
  handSize: number;
  deckSize: number;
  /** ルール：0 なら出現しない */
  runeFirstTick: number;
  runeIntervalTicks: number;
  runeRadius: number;
  runeEmpowerPercent: number;
}

export function compileRules(r: RulesData): Rules {
  return {
    width: r.arenaWidth * UNIT,
    height: r.arenaHeight * UNIT,
    riverStart: tilesToMilli(r.riverStartY),
    riverEnd: tilesToMilli(r.riverEndY),
    bridgeX: r.bridgeX.map(tilesToMilli),
    bridgeHalfWidth: tilesToMilli(r.bridgeHalfWidth),
    pocketDepth: tilesToMilli(r.pocketDepth),
    princess: compileTower(r.princessTower),
    king: compileTower(r.kingTower),
    maxMana: r.maxMana,
    startMana: r.startMana,
    manaUnit: Math.max(1, Math.round(r.manaRegenSeconds * 1000)),
    doubleManaLastTicks: secondsToTicks(r.doubleManaLastSeconds),
    overtimeBaseMultiplier: r.overtimeBaseMultiplier,
    tripleManaLastTicks: secondsToTicks(r.tripleManaLastOvertimeSeconds),
    regulationTicks: secondsToTicks(r.regulationSeconds),
    overtimeTicks: secondsToTicks(r.overtimeSeconds),
    commandDelayTicks: secondsToTicks(r.commandDelaySeconds),
    handSize: r.handSize,
    deckSize: r.deckSize,
    runeFirstTick: r.rune ? secondsToTicks(r.rune.firstSpawnSeconds) : 0,
    runeIntervalTicks: r.rune ? secondsToTicks(r.rune.intervalSeconds) : 0,
    runeRadius: r.rune ? tilesToMilli(r.rune.pickupRadius) : 0,
    runeEmpowerPercent: r.rune?.empowerPercent ?? 0,
  };
}

/** プレイヤー視点のローカル座標 ⇔ ワールド座標（プレイヤー1は上下反転）。対称なので同じ関数で両方向に使える。 */
export const toWorld = (rules: Rules, player: number, local: Vec): Vec =>
  player === 0 ? { x: local.x, y: local.y } : { x: local.x, y: rules.height - local.y };
export const toLocal = toWorld;
export const laneOf = (rules: Rules, x: number): 0 | 1 => (x < rules.width / 2 ? 0 : 1);

export interface BotProfile {
  id: string;
  name: string;
  reactionTicks: number;
  thinkIntervalTicks: number;
  pushMana: number;
  randomCardPermille: number;
  jitter: number;
  fireballValueHp: number;
  finishTowersWithSpells: boolean;
  supportPushes: boolean;
}

export const compileBot = (d: BotProfileData): BotProfile => ({
  id: d.id,
  name: d.displayName,
  reactionTicks: secondsToTicks(d.reactionSeconds),
  thinkIntervalTicks: Math.max(1, secondsToTicks(d.thinkIntervalSeconds)),
  pushMana: d.pushMana,
  randomCardPermille: d.randomCardPermille,
  jitter: tilesToMilli(d.placementJitter),
  fireballValueHp: d.fireballValueHp,
  finishTowersWithSpells: d.finishTowersWithSpells,
  supportPushes: d.supportPushes,
});

export class CardRegistry {
  private readonly cards = new Map<string, CardStats>();

  constructor(cards: Iterable<CardStats> = []) {
    for (const c of cards) this.add(c);
  }

  add(c: CardStats): void {
    this.cards.set(c.id, c);
  }

  get(id: string): CardStats | undefined {
    return this.cards.get(id);
  }

  require(id: string): CardStats {
    const c = this.cards.get(id);
    if (!c) throw new Error(`unknown card id '${id}'`);
    return c;
  }

  /** 登録順（JSONの並び順）で返す */
  all(): CardStats[] {
    return [...this.cards.values()];
  }
}
