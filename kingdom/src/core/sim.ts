import {
  ACHIEVEMENTS, ACH_BONUS, BUILDINGS, CROWN_BONUS, DUCK_CHANCE_PER_MIN, FORT_POWER, FORT_STAGE_BONUS, FRENZY_DURATION, FRENZY_MULT,
  GOLDEN_LIFETIME, GOLDEN_MAX, GOLDEN_MIN, JOBS, PERKS, RESEARCH, RIVALS, UNITS, crownsFor,
  type BuildingDef, type BuildingId, type Cost, type JobDef, type JobId, type Res, type ResearchDef, type RivalDef, type UnitDef, type UnitId,
} from './data';
import { hydrate, newState, type Construction, type GameState } from './state';

export const SLOT_COUNT: Record<BuildingId, number> = { house: 12, tower: 4, barracks: 1, archery: 1, monastery: 1, castle: 0 };
const RESS: Res[] = ['gold', 'wood', 'meat'];

export interface Derived {
  rates: Record<Res, number>; // 毎秒（祭りの倍率込み）
  baseRates: Record<Res, number>; // 祭りの倍率なし
  jobRate: Record<JobId, number>; // 1人あたり/秒（祭りなし）
  clickBase: number; // クリック1回（熱気・会心なし）
  global: number;
  armyPower: number;
  armyMult: number;
  popCap: number;
  pawns: number;
  buildSpeed: number;
  crownBonus: number;
  achBonus: number;
  fortBonus: number;
}

export type GameEvent =
  | { type: 'click'; value: number; crit: boolean; auto: boolean }
  | { type: 'hire'; job: JobId; count: number }
  | { type: 'train'; unit: UnitId; count: number }
  | { type: 'buildStart'; c: Construction }
  | { type: 'buildDone'; c: Construction }
  | { type: 'research'; def: ResearchDef }
  | { type: 'achievement'; id: string }
  | { type: 'goldenSpawn'; id: number; x: number; y: number; life: number }
  | { type: 'goldenCollect'; id: number; kind: 'lump' | 'frenzy'; value: number }
  | { type: 'goldenExpire'; id: number }
  | { type: 'duckSpawn' }
  | { type: 'battleStart'; battle: Battle }
  | { type: 'battleEnd'; battle: Battle }
  | { type: 'prestige'; crowns: number }
  | { type: 'reset' }
  | { type: 'perk'; id: string }
  | { type: 'notEnough' };

export interface Battle {
  rival: RivalDef;
  fort: number; // 0..4
  power: number;
  required: number;
  chance: number;
  win: boolean;
  losses: Record<UnitId, number>;
  reward: Partial<Record<Res, number>>;
  duration: number;
  elapsed: number;
}

export interface OfflineReport {
  seconds: number;
  gains: Record<Res, number>;
  efficiency: number;
  capped: boolean;
}

type Listener = (e: GameEvent) => void;

export function costAt(base: Cost, growth: number, owned: number, count = 1): Cost {
  const out: Cost = {};
  for (const r of RESS) {
    const b = base[r];
    if (!b) continue;
    if (growth === 1) out[r] = b * count;
    else out[r] = (b * Math.pow(growth, owned) * (Math.pow(growth, count) - 1)) / (growth - 1);
  }
  return out;
}

export function maxAffordable(base: Cost, growth: number, owned: number, have: Record<Res, number>, cap = Infinity): number {
  let n = Infinity;
  for (const r of RESS) {
    const b = base[r];
    if (!b) continue;
    const c0 = b * Math.pow(growth, owned);
    const k = growth === 1 ? Math.floor(have[r] / c0) : Math.floor(Math.log((have[r] * (growth - 1)) / c0 + 1) / Math.log(growth));
    n = Math.min(n, k);
  }
  if (!isFinite(n)) n = 0;
  return Math.max(0, Math.min(n, cap));
}

export class Game {
  s: GameState;
  d!: Derived;
  private listeners: Listener[] = [];
  private research = new Set<string>();
  // runtime only
  heat = 0;
  private lastClickAt = -10;
  battle: Battle | null = null;
  golden: { id: number; x: number; y: number; until: number } | null = null;
  private nextGoldenAt = 0;
  private autoClickAcc = 0;
  private achTimer = 0;
  rng: () => number = Math.random;

  constructor(state?: GameState) {
    this.s = state ?? newState();
    this.recompute();
    this.scheduleGolden(true);
  }

  on(fn: Listener) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }
  emit(e: GameEvent) {
    for (const l of this.listeners) l(e);
  }

  hasPerk(id: string) {
    return this.s.perks.includes(id);
  }
  hasResearch(id: string) {
    return this.research.has(id);
  }
  rivalDone(id: string) {
    return (this.s.forts[id] ?? 0) >= 5;
  }
  get fortsTotal() {
    return Object.values(this.s.forts).reduce((a, b) => a + b, 0);
  }
  get frenzy() {
    return this.s.time < this.s.frenzyUntil;
  }

  // ------------------------------------------------------------ derived values
  recompute() {
    const s = this.s;
    this.research = new Set(s.research);
    const jobMult: Record<JobId, number> = { miner: 1, lumberjack: 1, hunter: 1, builder: 1 };
    const synergy: Record<JobId, number> = { miner: 0, lumberjack: 0, hunter: 0, builder: 0 };
    const resMult: Record<Res, number> = { gold: 1, wood: 1, meat: 1 };
    let global = 1, click = 1, clickPct = 0, army = 1, build = 1, popAdd = 0;
    for (const id of s.research) {
      const def = RESEARCH.find((r) => r.id === id);
      if (!def) continue;
      for (const e of def.effects) {
        switch (e.kind) {
          case 'job': jobMult[e.job] *= e.mult; break;
          case 'click': click *= e.mult; break;
          case 'clickPct': clickPct += e.pct; break;
          case 'global': global *= e.mult; break;
          case 'res': resMult[e.res] *= e.mult; break;
          case 'army': army *= e.mult; break;
          case 'build': build *= e.mult; break;
          case 'synergy': synergy[e.job] += e.pct * s.jobs[e.per]; break;
          case 'pop': popAdd += e.add; break;
        }
      }
    }
    const crownRate = this.hasPerk('dynasty') ? 0.15 : CROWN_BONUS;
    const crownBonus = s.crownsTotal * crownRate;
    const achBonus = s.achievements.length * ACH_BONUS;
    const fortBonus = this.fortsTotal * FORT_STAGE_BONUS;
    global *= 1 + crownBonus;
    global *= 1 + achBonus;
    global *= 1 + fortBonus;
    global *= 1 + s.buildings.tower * 0.03;
    global *= s.buildings.monastery ? 1.1 : 1;
    global *= Math.pow(1.5, s.buildings.castle);
    global *= 1 + s.jobs.builder * 0.02;
    if (this.rivalDone('red')) resMult.gold *= 2;
    if (this.rivalDone('purple')) { resMult.wood *= 3; resMult.meat *= 3; }
    if (this.rivalDone('yellow')) click *= 5;
    if (this.hasPerk('big_click')) click *= 5;
    if (this.hasPerk('harvest')) { resMult.wood *= 3; resMult.meat *= 3; }

    const jobRate = {} as Record<JobId, number>;
    const baseRates: Record<Res, number> = { gold: 0, wood: 0, meat: 0 };
    for (const j of JOBS) {
      const per = j.produces ? j.rate * jobMult[j.id] * (1 + synergy[j.id]) * resMult[j.produces] * global : 0;
      jobRate[j.id] = per;
      if (j.produces) baseRates[j.produces] += per * s.jobs[j.id];
    }
    const fm = this.frenzy ? FRENZY_MULT : 1;
    const rates = { gold: baseRates.gold * fm, wood: baseRates.wood * fm, meat: baseRates.meat * fm };

    let armyMult = army * (1 + s.buildings.tower * 0.15) * (1 + s.units.monk * 0.06) * (1 + crownBonus) * (1 + fortBonus * 0.5);
    let power = 0;
    for (const u of UNITS) power += u.power * s.units[u.id];
    power *= armyMult;

    const clickBase = click * resMult.gold * global + baseRates.gold * clickPct;
    let buildSpeed = (1 + s.jobs.builder * 0.3) * build;
    if (this.hasPerk('fast_build')) buildSpeed *= 3;
    const popCap = 3 + s.buildings.house * 4 + s.buildings.castle * 6 + popAdd;
    const pawns = JOBS.reduce((a, j) => a + s.jobs[j.id], 0);
    this.d = { rates, baseRates, jobRate, clickBase, global, armyPower: power, armyMult, popCap, pawns, buildSpeed, crownBonus, achBonus, fortBonus };
  }

  unlockCtx() {
    return { totalGold: this.s.reignGold, jobs: this.s.jobs, buildings: this.s.buildings, research: this.research };
  }

  // ------------------------------------------------------------ economy helpers
  canAfford(c: Cost) {
    return RESS.every((r) => (c[r] ?? 0) <= this.s.res[r] + 1e-9);
  }
  pay(c: Cost) {
    for (const r of RESS) this.s.res[r] -= c[r] ?? 0;
  }
  gain(r: Res, v: number) {
    if (!(v > 0)) return;
    this.s.res[r] += v;
    if (r === 'gold') {
      this.s.reignGold += v;
      this.s.stats.allGold += v;
    }
  }

  // ------------------------------------------------------------ click
  clickValue(crit: boolean) {
    return this.d.clickBase * (1 + this.heat) * (crit ? 7 : 1) * (this.frenzy ? FRENZY_MULT : 1);
  }
  click(auto = false): { value: number; crit: boolean } {
    const crit = !auto && this.rng() < 0.04;
    if (!auto) {
      this.heat = Math.min(1, this.heat + 0.035);
      this.lastClickAt = this.s.time;
      this.s.stats.clicks++;
      if (crit) this.s.stats.crits++;
    }
    const value = this.clickValue(crit);
    this.gain('gold', value);
    this.emit({ type: 'click', value, crit, auto });
    return { value, crit };
  }

  // ------------------------------------------------------------ hiring
  jobCost(j: JobDef, count = 1) {
    return costAt(j.base, j.growth, this.s.jobs[j.id], count);
  }
  jobMax(j: JobDef) {
    const room = Math.max(0, this.d.popCap - this.d.pawns);
    return maxAffordable(j.base, j.growth, this.s.jobs[j.id], this.s.res, room);
  }
  hire(id: JobId, count = 1): boolean {
    const j = JOBS.find((x) => x.id === id)!;
    if (count <= 0 || this.d.pawns + count > this.d.popCap) return this.fail();
    const c = this.jobCost(j, count);
    if (!this.canAfford(c)) return this.fail();
    this.pay(c);
    this.s.jobs[id] += count;
    this.recompute();
    this.emit({ type: 'hire', job: id, count });
    return true;
  }

  fire(id: JobId, count = 1): boolean {
    const n = Math.min(count, this.s.jobs[id]);
    if (n <= 0) return false;
    this.s.jobs[id] -= n;
    this.recompute();
    this.emit({ type: 'hire', job: id, count: -n });
    return true;
  }

  // ------------------------------------------------------------ units
  unitCost(u: UnitDef, count = 1) {
    return costAt(u.base, u.growth, this.s.units[u.id], count);
  }
  unitMax(u: UnitDef) {
    return maxAffordable(u.base, u.growth, this.s.units[u.id], this.s.res);
  }
  train(id: UnitId, count = 1): boolean {
    const u = UNITS.find((x) => x.id === id)!;
    if (!this.s.buildings[u.requires] || count <= 0) return this.fail();
    const c = this.unitCost(u, count);
    if (!this.canAfford(c)) return this.fail();
    this.pay(c);
    this.s.units[id] += count;
    this.recompute();
    this.emit({ type: 'train', unit: id, count });
    return true;
  }

  // ------------------------------------------------------------ buildings
  buildingPending(id: BuildingId) {
    return this.s.constructions.filter((c) => c.building === id).length;
  }
  buildingCost(b: BuildingDef) {
    const n = this.s.buildings[b.id] + this.buildingPending(b.id);
    const c = costAt(b.base, b.growth, n, 1);
    // 最初の2軒は金貨だけで建てられる（木こりがいなくても詰まないように）
    if (b.id === 'house' && n < 2) delete c.wood;
    return c;
  }
  buildingAvailable(b: BuildingDef) {
    return this.s.buildings[b.id] + this.buildingPending(b.id) < b.max;
  }
  build(id: BuildingId): boolean {
    const b = BUILDINGS.find((x) => x.id === id)!;
    if (!this.buildingAvailable(b)) return this.fail();
    const c = this.buildingCost(b);
    if (!this.canAfford(c)) return this.fail();
    this.pay(c);
    let slot = -1;
    if (id !== 'castle') {
      const used = new Set([...this.s.placed.filter((p) => p.building === id).map((p) => p.slot),
        ...this.s.constructions.filter((k) => k.building === id).map((k) => k.slot)]);
      for (let i = 0; i < SLOT_COUNT[id]; i++) if (!used.has(i)) { slot = i; break; }
    }
    const con: Construction = { id: this.s.nextId++, building: id, slot, progress: 0, time: b.time };
    this.s.constructions.push(con);
    this.emit({ type: 'buildStart', c: con });
    return true;
  }
  private finishConstruction(c: Construction) {
    this.s.constructions = this.s.constructions.filter((x) => x !== c);
    this.s.buildings[c.building]++;
    if (c.building !== 'castle') {
      this.s.placed.push({ building: c.building, slot: c.slot, variant: c.building === 'house' ? (c.slot * 7 + 3) % 3 : 0 });
    }
    this.recompute();
    this.emit({ type: 'buildDone', c });
  }

  // ------------------------------------------------------------ research
  researchAvailable(): ResearchDef[] {
    const ctx = this.unlockCtx();
    return RESEARCH.filter((r) => !this.research.has(r.id) && r.unlock(ctx));
  }
  doResearch(id: string): boolean {
    const def = RESEARCH.find((r) => r.id === id);
    if (!def || this.research.has(id) || !def.unlock(this.unlockCtx())) return this.fail();
    if (!this.canAfford(def.cost)) return this.fail();
    this.pay(def.cost);
    this.s.research.push(id);
    this.recompute();
    this.emit({ type: 'research', def });
    return true;
  }

  // ------------------------------------------------------------ expeditions
  fortRequirement(rival: RivalDef, fort: number) {
    const i = RIVALS.indexOf(rival) * 5 + fort;
    return FORT_POWER(i);
  }
  rivalUnlocked(rival: RivalDef) {
    const i = RIVALS.indexOf(rival);
    return i === 0 ? this.s.buildings.barracks > 0 : this.rivalDone(RIVALS[i - 1].id);
  }
  winChance(power: number, required: number) {
    const r = power / required;
    let p = Math.min(1, Math.max(0, (r - 0.5) / 1.0));
    if (this.hasPerk('strategist') && p > 0) p = Math.min(1, p + 0.2);
    return p;
  }
  startBattle(rivalId: string): Battle | null {
    if (this.battle) return null;
    const rival = RIVALS.find((r) => r.id === rivalId)!;
    const fort = this.s.forts[rival.id];
    if (fort >= 5 || !this.rivalUnlocked(rival) || this.d.armyPower <= 0) {
      this.fail();
      return null;
    }
    const required = this.fortRequirement(rival, fort);
    const power = this.d.armyPower;
    const chance = this.winChance(power, required);
    const win = this.rng() < chance;
    const monkShield = Math.min(0.8, this.s.units.monk * 0.04);
    const strat = this.hasPerk('strategist') ? 0.5 : 1;
    const frac = (win ? 0.08 * Math.min(1, required / power) : 0.3) * (1 - monkShield) * strat;
    const losses = {} as Record<UnitId, number>;
    for (const u of UNITS) losses[u.id] = u.id === 'monk' ? 0 : Math.floor(this.s.units[u.id] * frac);
    const reward: Partial<Record<Res, number>> = {};
    if (win) {
      reward.gold = Math.max(required * 40, this.d.baseRates.gold * 240);
      reward.wood = Math.max(required * 10, this.d.baseRates.wood * 240);
      reward.meat = this.d.baseRates.meat * 120;
    }
    this.battle = { rival, fort, power, required, chance, win, losses, reward, duration: 7.5, elapsed: 0 };
    this.emit({ type: 'battleStart', battle: this.battle });
    return this.battle;
  }
  private finishBattle() {
    const b = this.battle!;
    for (const u of UNITS) this.s.units[u.id] = Math.max(0, this.s.units[u.id] - b.losses[u.id]);
    if (b.win) {
      this.s.forts[b.rival.id] = b.fort + 1;
      for (const r of RESS) this.gain(r, b.reward[r] ?? 0);
      this.s.stats.battlesWon++;
    } else {
      this.s.stats.battlesLost++;
    }
    this.battle = null;
    this.recompute();
    this.emit({ type: 'battleEnd', battle: b });
  }

  // ------------------------------------------------------------ golden & duck
  private scheduleGolden(initial = false) {
    const f = this.hasPerk('golden') ? 0.5 : 1;
    const wait = (GOLDEN_MIN + this.rng() * (GOLDEN_MAX - GOLDEN_MIN)) * f;
    this.nextGoldenAt = this.s.time + (initial ? wait * 0.5 : wait);
  }
  collectGolden(): boolean {
    if (!this.golden) return false;
    const g = this.golden;
    this.golden = null;
    this.s.stats.goldens++;
    const m = this.hasPerk('golden') ? 2 : 1;
    const frenzy = this.rng() < 0.4 && this.d.baseRates.gold > 0;
    if (frenzy) {
      this.s.frenzyUntil = this.s.time + FRENZY_DURATION * m;
      this.recompute();
      this.emit({ type: 'goldenCollect', id: g.id, kind: 'frenzy', value: FRENZY_MULT });
    } else {
      const v = Math.max(this.d.baseRates.gold * 90, this.d.clickBase * 40, 50) * m;
      this.gain('gold', v);
      this.emit({ type: 'goldenCollect', id: g.id, kind: 'lump', value: v });
    }
    this.scheduleGolden();
    return true;
  }
  collectDuck(): number {
    this.s.stats.duck++;
    const v = Math.max(this.d.baseRates.gold * 77, 777);
    this.gain('gold', v);
    return v;
  }

  // ------------------------------------------------------------ prestige
  crownsOnPrestige() {
    return crownsFor(this.s.reignGold) * (this.rivalDone('black') ? 2 : 1);
  }
  prestige(): boolean {
    const crowns = this.crownsOnPrestige();
    if (crowns <= 0) return this.fail();
    const old = this.s;
    const fresh = newState();
    fresh.stats = { ...old.stats, prestiges: old.stats.prestiges + 1 };
    fresh.crownsTotal = old.crownsTotal + crowns;
    fresh.crownsSpent = old.crownsSpent;
    fresh.perks = old.perks;
    fresh.achievements = old.achievements;
    fresh.kingName = old.kingName + 1;
    fresh.tutorial = old.tutorial;
    fresh.time = old.time;
    fresh.nextId = old.nextId;
    this.s = fresh;
    this.applyStartPerks();
    this.battle = null;
    this.golden = null;
    this.heat = 0;
    this.recompute();
    this.scheduleGolden(true);
    this.emit({ type: 'prestige', crowns });
    this.emit({ type: 'reset' });
    return true;
  }
  private applyStartPerks() {
    const s = this.s;
    if (this.hasPerk('start_gold')) this.gain('gold', 5000);
    if (this.hasPerk('start_miners')) {
      s.jobs.miner = 5;
      s.jobs.lumberjack = 3;
      s.buildings.house = 2;
      s.placed.push({ building: 'house', slot: 0, variant: 0 }, { building: 'house', slot: 1, variant: 1 });
    }
  }
  buyPerk(id: string): boolean {
    const p = PERKS.find((x) => x.id === id);
    if (!p || this.hasPerk(id) || this.s.crownsTotal - this.s.crownsSpent < p.cost) return this.fail();
    this.s.crownsSpent += p.cost;
    this.s.perks.push(id);
    this.recompute();
    this.emit({ type: 'perk', id });
    return true;
  }

  // ------------------------------------------------------------ achievements
  checkAchievements() {
    const s = this.s;
    const ctx = {
      clicks: s.stats.clicks, crits: s.stats.crits, allGold: s.stats.allGold, pawns: this.d.pawns, buildings: s.buildings,
      armyPower: this.d.armyPower, forts: this.fortsTotal, rivalsDone: RIVALS.filter((r) => this.rivalDone(r.id)).length,
      prestiges: s.stats.prestiges, goldens: s.stats.goldens, duck: s.stats.duck, gps: this.d.rates.gold,
    };
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (!s.achievements.includes(a.id) && a.test(ctx)) {
        s.achievements.push(a.id);
        changed = true;
        this.emit({ type: 'achievement', id: a.id });
      }
    }
    if (changed) this.recompute();
  }

  // ------------------------------------------------------------ tick
  tick(dt: number) {
    const s = this.s;
    const wasFrenzy = this.frenzy;
    s.time += dt;
    s.stats.playTime += dt;
    for (const r of RESS) this.gain(r, this.d.rates[r] * dt);
    if (wasFrenzy !== this.frenzy) this.recompute();

    // heat decay
    if (s.time - this.lastClickAt > 0.8) this.heat = Math.max(0, this.heat - dt * 0.35);

    // construction
    for (const c of [...s.constructions]) {
      c.progress += (dt * this.d.buildSpeed) / c.time;
      if (c.progress >= 1) this.finishConstruction(c);
    }

    // auto click perk
    if (this.hasPerk('auto_click')) {
      this.autoClickAcc += dt * 3;
      while (this.autoClickAcc >= 1) {
        this.autoClickAcc -= 1;
        this.click(true);
      }
    }

    // battle
    if (this.battle) {
      this.battle.elapsed += dt;
      if (this.battle.elapsed >= this.battle.duration) this.finishBattle();
    }

    // golden
    if (this.golden && s.time > this.golden.until) {
      const id = this.golden.id;
      this.golden = null;
      this.emit({ type: 'goldenExpire', id });
      this.scheduleGolden();
    }
    if (!this.golden && s.time >= this.nextGoldenAt && s.reignGold > 100) {
      this.golden = { id: s.nextId++, x: this.rng(), y: this.rng(), until: s.time + GOLDEN_LIFETIME };
      this.emit({ type: 'goldenSpawn', id: this.golden.id, x: this.golden.x, y: this.golden.y, life: GOLDEN_LIFETIME });
    }
    if (this.rng() < (DUCK_CHANCE_PER_MIN / 60) * dt && s.reignGold > 1000) this.emit({ type: 'duckSpawn' });

    this.achTimer += dt;
    if (this.achTimer > 1) {
      this.achTimer = 0;
      this.checkAchievements();
    }
  }

  // ------------------------------------------------------------ offline
  applyOffline(now = Date.now()): OfflineReport | null {
    const elapsed = Math.max(0, (now - this.s.lastSave) / 1000);
    if (elapsed < 30) return null;
    const cap = this.hasPerk('offline') ? 24 * 3600 : 12 * 3600;
    const eff = this.hasPerk('offline') ? 1 : 0.5;
    const secs = Math.min(cap, elapsed);
    const gains: Record<Res, number> = { gold: 0, wood: 0, meat: 0 };
    for (const r of RESS) {
      gains[r] = this.d.baseRates[r] * secs * eff;
      this.gain(r, gains[r]);
    }
    // 建設は放置中も進む
    for (const c of [...this.s.constructions]) {
      c.progress += (secs * this.d.buildSpeed) / c.time;
      if (c.progress >= 1) this.finishConstruction(c);
    }
    this.s.frenzyUntil = 0;
    this.recompute();
    return { seconds: secs, gains, efficiency: eff, capped: elapsed > cap };
  }

  private fail(): false {
    this.emit({ type: 'notEnough' });
    return false;
  }

  load(raw: unknown) {
    this.s = hydrate(raw);
    this.recompute();
    this.scheduleGolden(true);
    this.emit({ type: 'reset' });
  }
}
