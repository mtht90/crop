import { hasTag, isSpell, toLocal, toWorld, type BotProfile, type CardStats } from './data';
import { clamp, dist, Rng, sqrDist, UNIT, type Vec } from './math';
import type { BattleSimulation, DeployCommand, Entity, PlayerState, TowerSlot } from './sim';

interface Threat {
  primary: Entity;
  totalHp: number;
  swarmCount: number;
  hasAir: boolean;
  hasTank: boolean;
  buildingsOnly: boolean;
  defenderHp: number;
}

/**
 * ルールベースの簡単な BOT。人間と同じ DeployCommand を出すだけで、シミュレーションを直接いじらない。
 * - 自陣に敵が入ったら、反応時間のあとでカウンターになるカードを出す
 * - 敵がいなくてマナが十分たまったら攻めに出る
 * カウンターの判断はカードのタグと性能で行い、カードIDは直接見ない。
 */
export class BotBrain {
  private readonly rng: Rng;
  private threatSeenTick = -1;
  private nextThinkTick = 0;

  constructor(
    readonly player: number,
    readonly profile: BotProfile,
    seed: number,
  ) {
    this.rng = new Rng(seed * 7919 + player * 104729 + 1);
  }

  think(sim: BattleSimulation): DeployCommand | null {
    if (sim.isOver) return null;
    const threat = this.findThreat(sim);
    if (threat) {
      if (this.threatSeenTick < 0) this.threatSeenTick = sim.tick;
    } else this.threatSeenTick = -1;

    if (sim.tick < this.nextThinkTick) return null;
    this.nextThinkTick = sim.tick + this.profile.thinkIntervalTicks;
    const me = sim.players[this.player];
    const mana = sim.mana(this.player);

    if (this.profile.finishTowersWithSpells) {
      const c = this.tryFinishTower(sim, me, mana);
      if (c) return c;
    }
    if (threat) {
      if (sim.tick - this.threatSeenTick < this.profile.reactionTicks) return null;
      // すでに十分な味方が守っていれば追加しない
      if (threat.defenderHp >= (threat.totalHp * 6) / 10 && !threat.hasAir) return null;
      return this.tryCounter(sim, me, mana, threat);
    }
    if (mana >= this.profile.pushMana) return this.tryPush(sim, me, mana);
    if (this.profile.supportPushes) return this.trySupport(sim, me, mana);
    return null;
  }

  // ------------------------------------------------------------ 状況判断

  private local(sim: BattleSimulation, w: Vec): Vec {
    return toLocal(sim.rules, this.player, w);
  }

  private world(sim: BattleSimulation, l: Vec): Vec {
    return toWorld(sim.rules, this.player, l);
  }

  private findThreat(sim: BattleSimulation): Threat | null {
    const limitY = sim.rules.riverEnd + UNIT; // 橋を渡り始めた敵も脅威
    let primary: Entity | null = null;
    let bestY = Infinity;
    let totalHp = 0;
    let swarmCount = 0;
    let hasAir = false;
    for (const e of sim.entities) {
      if (e.hp <= 0 || e.owner === this.player || e.kind !== 'troop' || !e.card) continue;
      const lp = this.local(sim, e.pos);
      if (lp.y > limitY) continue;
      totalHp += e.hp;
      if (hasTag(e.card, 'swarm')) swarmCount++;
      if (e.flying) hasAir = true;
      if (lp.y < bestY) {
        bestY = lp.y;
        primary = e;
      }
    }
    if (!primary) return null;
    let hasTank = !!primary.card && hasTag(primary.card, 'tank');
    let defenderHp = 0;
    for (const e of sim.entities) {
      if (e.hp <= 0 || e.kind === 'tower') continue;
      if (e.owner !== this.player && e.card && hasTag(e.card, 'tank') && near(e, primary, 4000)) hasTank = true;
      if (e.owner === this.player && near(e, primary, 5000)) defenderHp += e.hp;
    }
    return { primary, totalHp, swarmCount, hasAir, hasTank, buildingsOnly: primary.buildingsOnly, defenderHp };
  }

  // ------------------------------------------------------------ 守り

  private tryCounter(sim: BattleSimulation, me: PlayerState, mana: number, t: Threat): DeployCommand | null {
    const affordable = me.hand.filter((c) => c.cost <= mana);
    if (affordable.length === 0) return null;
    let best: CardStats | null = null;
    let bestScore = 0;
    for (const c of affordable) {
      const s = this.scoreCounter(sim, c, t);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (this.rng.chance(this.profile.randomCardPermille)) best = affordable[this.rng.range(affordable.length)];
    if (!best) return null;
    return this.issue(sim, best, this.counterPosition(sim, best, t));
  }

  private scoreCounter(sim: BattleSimulation, c: CardStats, t: Threat): number {
    if (isSpell(c)) {
      const value = this.spellValue(sim, c, t.primary.pos);
      const small = c.damage < 400;
      if (small && t.swarmCount >= 3) return 90;
      if (!small && value >= this.profile.fireballValueHp) return 70 + Math.floor(value / 100);
      return 0;
    }
    let s = 20 - c.cost * 2;
    if (t.hasAir) s += c.hitsAir ? 50 : -30;
    if (t.swarmCount >= 3) {
      if (hasTag(c, 'antiSwarm') || hasTag(c, 'splash')) s += 45;
      if (hasTag(c, 'swarm')) s -= 15;
    }
    if (t.buildingsOnly) {
      if (c.type === 'building') s += 45;
      if (hasTag(c, 'swarm')) s += 30;
      if (hasTag(c, 'melee')) s += 10;
    } else if (t.hasTank) {
      if (hasTag(c, 'swarm')) s += 25;
      if (hasTag(c, 'melee')) s += 10;
    } else {
      if (hasTag(c, 'melee') && hasTag(c, 'tank')) s += 20;
      if (hasTag(c, 'ranged')) s += 12;
    }
    if (hasTag(c, 'winCondition')) s -= 40; // 攻めの要は守りに使わない
    return s;
  }

  private spellValue(sim: BattleSimulation, spell: CardStats, at: Vec): number {
    let value = 0;
    for (const e of sim.entities) {
      if (e.hp <= 0 || e.owner === this.player) continue;
      if (dist(at, e.pos) - e.radius > spell.spellRadius) continue;
      value += Math.min(e.kind === 'tower' ? spell.crownTowerDamage : spell.damage, e.hp);
    }
    return value;
  }

  private counterPosition(sim: BattleSimulation, c: CardStats, t: Threat): Vec {
    const r = sim.rules;
    const lp = this.local(sim, t.primary.pos);
    if (isSpell(c)) {
      // 少し先を読んで、自陣側にずらして撃つ
      return this.world(sim, { x: lp.x, y: lp.y - t.primary.speed * 6 });
    }
    let local: Vec;
    if (c.type === 'building') {
      // 建物は中央寄りに置いて、建物狙いのユニットを引きつける
      const x = lp.x < r.width / 2 ? r.width / 2 - UNIT / 2 : r.width / 2 + UNIT / 2;
      local = { x, y: r.riverStart - 4 * UNIT };
    } else {
      const back = hasTag(c, 'ranged') || (c.hitsAir && c.range > 2000) ? 4500 : 2000;
      local = { x: lp.x, y: Math.min(lp.y, r.riverStart) - back };
    }
    return this.world(sim, this.clampOwn(sim, this.jitter(local)));
  }

  // ------------------------------------------------------------ 攻め

  private tryPush(sim: BattleSimulation, me: PlayerState, mana: number): DeployCommand | null {
    const r = sim.rules;
    const laneX = r.bridgeX[this.weakerLane(sim)];
    const ok = (c: CardStats) => c.cost <= mana && !isSpell(c);
    let pick =
      me.hand.find((c) => ok(c) && hasTag(c, 'winCondition')) ??
      me.hand.find((c) => ok(c) && hasTag(c, 'tank')) ??
      null;
    if (!pick) {
      // 安いユニットでサイクルを回す
      for (const c of me.hand) if (ok(c) && c.type === 'troop' && (!pick || c.cost < pick.cost)) pick = c;
    }
    if (!pick) return null;
    // 重いユニットは後ろから、軽いユニットは橋の手前から
    const y = hasTag(pick, 'tank') ? UNIT / 2 : r.riverStart - UNIT / 2;
    return this.issue(sim, pick, this.world(sim, this.clampOwn(sim, this.jitter({ x: laneX, y }))));
  }

  /** 味方のタンクが前進していれば、その後ろに遠距離・空中ユニットを足す */
  private trySupport(sim: BattleSimulation, me: PlayerState, mana: number): DeployCommand | null {
    if (mana < 4) return null;
    let tank: Entity | null = null;
    for (const e of sim.entities) {
      if (e.hp <= 0 || e.owner !== this.player || e.kind !== 'troop' || !e.card) continue;
      if (hasTag(e.card, 'tank') && (!tank || e.hp > tank.hp)) tank = e;
    }
    if (!tank) return null;
    const lp = this.local(sim, tank.pos);
    if (lp.y > sim.rules.riverStart) return null;
    const pick = me.hand.find((c) => c.cost <= mana && c.type === 'troop' && (hasTag(c, 'ranged') || hasTag(c, 'air')));
    if (!pick) return null;
    return this.issue(sim, pick, this.world(sim, this.clampOwn(sim, this.jitter({ x: lp.x, y: lp.y - 1500 }))));
  }

  /** 呪文で削り切れるタワーがあれば撃つ */
  private tryFinishTower(sim: BattleSimulation, me: PlayerState, mana: number): DeployCommand | null {
    const slots: TowerSlot[] = ['left', 'right', 'king'];
    for (const c of me.hand) {
      if (!isSpell(c) || c.cost > mana) continue;
      for (const s of slots) {
        const t = sim.getTower(1 - this.player, s);
        if (t && t.hp > 0 && t.hp <= c.crownTowerDamage) return this.issue(sim, c, t.pos);
      }
    }
    return null;
  }

  private weakerLane(sim: BattleSimulation): 0 | 1 {
    const enemy = 1 - this.player;
    const l = sim.getTower(enemy, 'left');
    const r = sim.getTower(enemy, 'right');
    const lh = l && l.hp > 0 ? l.hp : 0;
    const rh = r && r.hp > 0 ? r.hp : 0;
    if (lh === rh) return this.rng.range(2) as 0 | 1;
    return lh < rh ? 0 : 1; // 左右はワールド座標で共通
  }

  private jitter(p: Vec): Vec {
    const j = this.profile.jitter;
    if (j <= 0) return p;
    return { x: p.x + this.rng.between(-j, j), y: p.y + this.rng.between(-j, j) };
  }

  private clampOwn(sim: BattleSimulation, l: Vec): Vec {
    const r = sim.rules;
    return { x: clamp(l.x, 500, r.width - 500), y: clamp(l.y, 500, r.riverStart - 500) };
  }

  private issue(sim: BattleSimulation, card: CardStats, pos: Vec): DeployCommand | null {
    const cmd: DeployCommand = { player: this.player, cardId: card.id, pos, issueTick: sim.tick };
    if (sim.isValidPlacement(this.player, card, pos)) return cmd;
    // 置けなければ自陣の近い場所を探す
    const r = sim.rules;
    const local = this.local(sim, pos);
    for (let step = 1; step <= 6; step++) {
      const ly = Math.min(local.y, r.riverStart - 500) - step * UNIT;
      if (ly < 500) break;
      for (let dx = 0; dx <= 2; dx++) {
        for (const sx of [1, -1]) {
          const cand = this.world(sim, { x: local.x + sx * dx * UNIT, y: ly });
          if (sim.isValidPlacement(this.player, card, cand)) return { ...cmd, pos: cand };
        }
      }
    }
    return null;
  }
}

const near = (a: Entity, b: Entity, d: number): boolean => a.hp > 0 && sqrDist(a.pos, b.pos) <= d * d;
