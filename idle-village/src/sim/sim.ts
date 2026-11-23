// 村のシミュレーション本体。Phaserに依存しないので、留守中の早送りにもそのまま使える。
import {
  BUILDINGS,
  DAY_LEN,
  MAP_H,
  MAP_W,
  NIGHT_START,
  SEASONS,
  SEASON_LEN,
  STAGE_NAMES,
  STAGE_REQ,
  TILE,
  UPGRADES,
  YEAR_LEN,
  upgradeCost,
} from './config';
import { generateIsland } from './mapgen';
import { CHAT_PAIRS, murmur } from './murmurs';
import { Grid, findPath } from './path';
import { rulePolicy, ruleNextBuild } from './council';
import type {
  Building,
  BuildingKind,
  ChronicleEntry,
  GameState,
  Policy,
  Pt,
  Raider,
  ResKind,
  Role,
  Sheep,
  SimEvent,
  Task,
  TaskType,
  Trait,
  UpgradeKey,
  Villager,
} from './types';
import { clamp, dist, makeIslandName, makeName, mulberry32, pick, rand, randInt } from './util';

export const SAVE_VERSION = 1;
const TRAIT_LIST: Trait[] = ['hard', 'lazy', 'cheer', 'shy', 'pious', 'brave', 'glutton', 'dreamer'];
const SKILLS: (ResKind | 'build')[] = ['wood', 'meat', 'gold', 'build'];

const cx = (t: number) => t * TILE + TILE / 2;
const tileOf = (p: number) => Math.floor(p / TILE);

export class Sim {
  s: GameState;
  grid: Grid;
  events: SimEvent[] = [];
  private gridDirty = true;
  private landArr: Uint8Array;
  private slowTimer = 0;
  private buildTimer = 0;
  muted = false; // 早送り中は演出イベントを出さない

  constructor(state: GameState) {
    this.s = state;
    this.landArr = Uint8Array.from(state.map.land, (c) => (c === '1' ? 1 : 0));
    this.grid = new Grid(state.map.w, state.map.h);
    this.rebuildGrid();
  }

  // ───────────── 新しいゲーム ─────────────
  static newGame(opts?: { memories?: number; islandNo?: number; upgrades?: Record<UpgradeKey, number> }): GameState {
    const seed = (Math.random() * 2 ** 31) | 0;
    const gen = generateIsland(seed);
    const r = mulberry32(seed + 7);
    let nextId = 1;
    const s: GameState = {
      version: SAVE_VERSION,
      seed,
      islandName: makeIslandName(r),
      islandNo: opts?.islandNo ?? 1,
      memories: opts?.memories ?? 0,
      time: 0,
      dayTime: DAY_LEN * 0.08,
      seasonIndex: 0,
      res: { wood: 6, meat: 8, gold: 0 },
      points: 0,
      totalPoints: 0,
      upgrades: opts?.upgrades ?? { work: 0, walk: 0, nature: 0, housing: 0, family: 0, strength: 0 },
      stage: 0,
      map: { w: MAP_W, h: MAP_H, land: Array.from(gen.land).join('') },
      villagers: [],
      trees: gen.trees.map((t) => ({ id: nextId++, tx: t.tx, ty: t.ty, variant: t.variant, growth: Math.random() < 0.8 ? 1 : 0.5, hits: 0, reservedBy: null, shake: 0 })),
      sheep: [],
      golds: gen.golds.map((g) => ({ id: nextId++, tx: g.tx, ty: g.ty, variant: g.variant, amount: 6, reservedBy: null, shake: 0 })),
      buildings: [],
      raiders: [],
      arrows: [],
      decos: gen.decos,
      policy: { weights: { wood: 1.4, meat: 1, gold: 0, build: 1.5 }, nextBuild: 'house', festival: false, lines: [], source: 'rule' },
      chronicle: [],
      nextId: 0,
      nextRaidSeason: 9999,
      raidAt: null,
      raidEndAt: null,
      festivalUntil: 0,
      departed: false,
      savedAt: Date.now(),
      stats: { births: 0, deaths: 0, raidsRepelled: 0, built: 0 },
    };
    for (const sp of gen.sheep) {
      s.sheep.push({ id: nextId++, x: cx(sp.tx), y: cx(sp.ty), path: [], timer: Math.random() * 3, anim: 'idle', facingLeft: Math.random() < 0.5, reservedBy: null });
    }
    // はじまりの家
    const c = gen.center;
    const house: Building = {
      id: nextId++,
      kind: 'house',
      variant: 1,
      tx: c.x - 1,
      ty: c.y,
      w: 2,
      h: 1,
      progress: 1,
      done: true,
      hp: BUILDINGS.house.hp,
      maxHp: BUILDINGS.house.hp,
      occupants: [],
      attackCd: 0,
    };
    // 家の足元と周囲の木や金を取り除く
    const near = (tx: number, ty: number) => tx >= house.tx - 1 && tx <= house.tx + 2 && ty >= house.ty - 1 && ty <= house.ty + 2;
    s.trees = s.trees.filter((t) => !near(t.tx, t.ty));
    s.golds = s.golds.filter((g) => !near(g.tx, g.ty));
    s.buildings.push(house);
    s.nextId = nextId;
    const sim = new Sim(s);
    const used = new Set<string>();
    const sexes = [false, true, Math.random() < 0.5];
    for (let i = 0; i < 3; i++) {
      const v = sim.makeVillager({ female: sexes[i], age: 1.2 + Math.random() * 1.2, x: cx(c.x + i - 1), y: cx(c.y + 1) + 10, used });
      v.homeId = house.id;
      s.villagers.push(v);
    }
    sim.addChronicle(`${s.villagers.map((v) => v.name).join('、')}の3人が${s.islandName}に流れ着いた。`, 'misc');
    return s;
  }

  makeVillager(o: { female: boolean; age: number; x: number; y: number; used?: Set<string>; parents?: string[] }): Villager {
    const used = o.used ?? new Set(this.s.villagers.map((v) => v.name));
    const name = makeName(o.female, used);
    used.add(name);
    return {
      id: this.s.nextId++,
      name,
      female: o.female,
      age: o.age,
      lifespan: 5 + Math.random() * 2.5,
      role: o.age < 1 ? 'child' : 'pawn',
      skill: pick(SKILLS),
      trait: pick(TRAIT_LIST),
      avatar: randInt(1, 25),
      x: o.x,
      y: o.y,
      path: [],
      task: null,
      carrying: null,
      energy: 0.8 + Math.random() * 0.2,
      hunger: Math.random() * 0.3,
      hp: 20,
      maxHp: 20,
      knockedOut: 0,
      hidden: false,
      homeId: null,
      facingLeft: Math.random() < 0.5,
      anim: 'idle',
      bubble: null,
      nextMurmur: this.s.time + 3 + Math.random() * 20,
      attackCd: 0,
      parents: o.parents ?? [],
      born: this.s.time - o.age * YEAR_LEN,
      deeds: 0,
    };
  }

  // ───────────── 便利な値 ─────────────
  get year() {
    return Math.floor(this.s.seasonIndex / 4) + 1;
  }
  get season() {
    return this.s.seasonIndex % 4;
  }
  get isNight() {
    return this.s.dayTime / DAY_LEN >= NIGHT_START;
  }
  get raidActive() {
    return this.s.raiders.length > 0;
  }
  get festivalActive() {
    return this.s.time < this.s.festivalUntil;
  }
  get timeLabel() {
    return `${this.year}年目 ${SEASONS[this.season]}`;
  }
  get population() {
    return this.s.villagers.length;
  }
  get capacity() {
    let c = 0;
    for (const b of this.s.buildings) if (b.done) c += BUILDINGS[b.kind].capacity + (b.kind === 'house' ? this.s.upgrades.housing : 0);
    return c;
  }
  get pointMul() {
    return 1 + 0.25 * this.s.memories;
  }
  get natureMul() {
    return 1 + 0.15 * this.s.upgrades.nature;
  }
  get strengthMul() {
    return 1 + 0.15 * this.s.upgrades.strength;
  }
  get seasonGrowth() {
    return [1.5, 1.2, 0.8, 0][this.season];
  }
  isLand(tx: number, ty: number) {
    return tx >= 0 && ty >= 0 && tx < this.s.map.w && ty < this.s.map.h && this.landArr[ty * this.s.map.w + tx] === 1;
  }
  countBuildings(kind: BuildingKind, doneOnly = true) {
    return this.s.buildings.filter((b) => b.kind === kind && (!doneOnly || b.done)).length;
  }
  hasBuilding(kind: BuildingKind) {
    return this.s.buildings.some((b) => b.kind === kind && b.done);
  }

  // ───────────── 記録 ─────────────
  addChronicle(text: string, kind: ChronicleEntry['kind']) {
    this.s.chronicle.push({ t: this.s.time, label: this.timeLabel, text, kind });
    if (this.s.chronicle.length > 400) this.s.chronicle.splice(0, this.s.chronicle.length - 400);
  }
  emit(e: SimEvent) {
    if (!this.muted) this.events.push(e);
  }
  addPoints(n: number, x?: number, y?: number) {
    const v = n * this.pointMul;
    this.s.points += v;
    this.s.totalPoints += v;
    if (x !== undefined && y !== undefined) this.emit({ type: 'points', x, y, amount: v });
  }
  say(v: Villager, text: string, dur = 3.5) {
    v.bubble = { text, until: this.s.time + dur };
  }

  // ───────────── グリッド ─────────────
  markDirty() {
    this.gridDirty = true;
  }
  rebuildGrid() {
    const { w, h } = this.s.map;
    const walk = this.grid.walk;
    for (let i = 0; i < w * h; i++) walk[i] = this.landArr[i];
    for (const t of this.s.trees) walk[t.ty * w + t.tx] = 0;
    for (const g of this.s.golds) walk[g.ty * w + g.tx] = 0;
    for (const b of this.s.buildings) for (let y = b.ty - b.h + 1; y <= b.ty; y++) for (let x = b.tx; x < b.tx + b.w; x++) walk[y * w + x] = 0;
    this.gridDirty = false;
  }
  private occupied(tx: number, ty: number) {
    return !this.grid.ok(tx, ty);
  }
  adjacentGoals(tx: number, ty: number): Pt[] {
    const out: Pt[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push({ x: tx + dx, y: ty + dy });
    return out;
  }
  buildingGoals(b: Building): Pt[] {
    const out: Pt[] = [];
    for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
      out.push({ x, y: b.ty + 1 });
      out.push({ x, y: b.ty - b.h });
    }
    for (let y = b.ty - b.h + 1; y <= b.ty; y++) {
      out.push({ x: b.tx - 1, y });
      out.push({ x: b.tx + b.w, y });
    }
    return out;
  }
  entryOf(b: Building): Pt {
    return { x: b.tx + Math.floor(b.w / 2), y: b.ty + 1 };
  }
  pathTo(from: { x: number; y: number }, goals: Pt[]): Pt[] | null {
    if (this.gridDirty) this.rebuildGrid();
    let start = { x: tileOf(from.x), y: tileOf(from.y) };
    // 足元が塞がれていたら近くの歩けるタイルから出発
    if (!this.grid.ok(start.x, start.y)) {
      const alt = this.nearestWalkable(start.x, start.y);
      if (alt) start = alt;
    }
    return findPath(this.grid, start, goals);
  }
  nearestWalkable(tx: number, ty: number): Pt | null {
    for (let r = 1; r < 6; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.grid.ok(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
    return null;
  }
  randomWalkableNear(tx: number, ty: number, rad: number): Pt | null {
    for (let i = 0; i < 20; i++) {
      const x = tx + randInt(-rad, rad);
      const y = ty + randInt(-rad, rad);
      if (this.grid.ok(x, y)) return { x, y };
    }
    return null;
  }

  // 経路に沿って進む。到着したら true
  moveAlong(e: { x: number; y: number; path: Pt[]; facingLeft: boolean }, speed: number, dt: number): boolean {
    let budget = speed * dt;
    while (budget > 0 && e.path.length) {
      const p = e.path[0];
      const tx = cx(p.x);
      const ty = cx(p.y);
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) e.facingLeft = dx < 0;
      if (d <= budget) {
        e.x = tx;
        e.y = ty;
        budget -= d;
        e.path.shift();
      } else {
        e.x += (dx / d) * budget;
        e.y += (dy / d) * budget;
        budget = 0;
      }
    }
    return e.path.length === 0;
  }

  // ───────────── メインループ ─────────────
  step(dt: number) {
    const s = this.s;
    s.time += dt;
    s.dayTime = (s.dayTime + dt) % DAY_LEN;
    // 季節の変わり目
    const si = Math.floor(s.time / SEASON_LEN);
    if (si > s.seasonIndex) {
      s.seasonIndex = si;
      this.onSeason();
    }
    this.slowTimer += dt;
    if (this.slowTimer >= 1) {
      this.slowUpdate(this.slowTimer);
      this.slowTimer = 0;
    }
    if (this.gridDirty) this.rebuildGrid();
    for (const v of [...s.villagers]) this.updateVillager(v, dt);
    for (const sh of s.sheep) this.updateSheep(sh, dt);
    for (const r of [...s.raiders]) this.updateRaider(r, dt);
    this.updateArrows(dt);
    this.updateTowers(dt);
    for (const t of s.trees) if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
    for (const g of s.golds) if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
  }

  private slowUpdate(dt: number) {
    const s = this.s;
    // 木の成長
    const growth = (dt / 200) * this.natureMul * this.seasonGrowth;
    for (const t of s.trees) if (t.growth < 1) t.growth = Math.min(1, t.growth + growth);
    // 新しい木
    if (s.trees.length < 120 && rand() < dt * 0.02 * this.natureMul * this.seasonGrowth) this.spawnTree();
    // 羊が増える
    const sheepCap = 8 + s.stage * 4;
    if (s.sheep.length >= 2 && s.sheep.length < sheepCap && rand() < dt * 0.035 * this.natureMul * (this.season === 3 ? 0.4 : 1)) {
      const p = pick(s.sheep);
      const t = this.randomWalkableNear(tileOf(p.x), tileOf(p.y), 1);
      if (t) {
        s.sheep.push({ id: s.nextId++, x: cx(t.x), y: cx(t.y), path: [], timer: 2, anim: 'idle', facingLeft: rand() < 0.5, reservedBy: null });
        this.emit({ type: 'poof', x: cx(t.x), y: cx(t.y) });
      }
    }
    if (s.sheep.length < 2 && rand() < dt * 0.01) this.spawnWanderingSheep();
    // 金鉱石
    if (s.stage >= 1 && s.golds.length < 3 + s.stage && rand() < dt * 0.008 * this.natureMul) this.spawnGold();
    // 出産
    this.tryBirth(dt);
    // 段階
    this.checkStage();
    // 兵士の任命
    this.assignRoles();
    // 家の割り当て
    this.assignHomes();
    // 建設計画
    this.buildTimer += dt;
    if (this.buildTimer > 3) {
      this.buildTimer = 0;
      this.planConstruction();
    }
    // 襲撃
    if (s.raidAt !== null && s.time >= s.raidAt && !this.raidActive) {
      s.raidAt = null;
      this.startRaid();
    }
    if (this.raidActive && s.raidEndAt !== null && s.time > s.raidEndAt) {
      for (const r of s.raiders) r.fleeing = true;
    }
    // 祭り
    if (this.festivalActive) this.addPoints(dt * 1.5);
  }

  private onSeason() {
    const s = this.s;
    this.emit({ type: 'season', seasonIndex: s.seasonIndex });
    // 襲撃の予定
    if (s.stage >= 1 && s.seasonIndex >= s.nextRaidSeason) {
      const defense = this.hasBuilding('tower') || this.hasBuilding('barracks');
      if (defense) {
        s.raidAt = s.time + 40 + rand() * 120;
        s.nextRaidSeason = s.seasonIndex + randInt(2, 3);
      } else s.nextRaidSeason = s.seasonIndex + 1;
    }
    this.runCouncil();
  }

  runCouncil() {
    const p = rulePolicy(this);
    this.applyPolicy(p);
  }

  applyPolicy(p: Policy) {
    const s = this.s;
    s.policy = p;
    if (p.festival && s.stage >= 2 && !this.festivalActive) {
      s.festivalUntil = s.time + 45;
      this.addChronicle(pick(['村をあげての祭りが開かれた。', '広場に歌声が響き、祭りの夜はふけていった。', '収穫を祝う祭りが行われた。']), 'festival');
    }
    // 会議での発言を吹き出しに
    let delay = 0;
    for (const line of p.lines) {
      const v = s.villagers.find((x) => x.name === line.speaker);
      if (v) {
        v.bubble = { text: line.text, until: s.time + 5 + delay };
        v.nextMurmur = s.time + 8 + delay;
        delay += 1.5;
      }
    }
    this.emit({ type: 'council' });
  }

  // ───────────── 生態系 ─────────────
  private freeTile(tx: number, ty: number, margin = 0) {
    if (!this.isLand(tx, ty)) return false;
    for (let dy = -margin; dy <= margin; dy++) for (let dx = -margin; dx <= margin; dx++) if (this.occupied(tx + dx, ty + dy)) return false;
    // 建物の入口前は空けておく
    for (const b of this.s.buildings) {
      if (tx >= b.tx - 1 && tx <= b.tx + b.w && ty >= b.ty - b.h && ty <= b.ty + 2) return false;
    }
    return true;
  }
  private spawnTree() {
    const s = this.s;
    const base = s.trees.length ? pick(s.trees) : null;
    for (let i = 0; i < 10; i++) {
      const tx = base ? base.tx + randInt(-3, 3) : randInt(2, s.map.w - 3);
      const ty = base ? base.ty + randInt(-3, 3) : randInt(2, s.map.h - 3);
      if (!this.freeTile(tx, ty, 0) || !this.landAround(tx, ty)) continue;
      if (this.s.villagers.some((v) => tileOf(v.x) === tx && tileOf(v.y) === ty)) continue;
      s.trees.push({ id: s.nextId++, tx, ty, variant: randInt(1, 4), growth: 0.36, hits: 0, reservedBy: null, shake: 0 });
      this.markDirty();
      return;
    }
  }
  /** 周囲8マスがすべて歩ける陸(木や岩が壁にならないように) */
  private landAround(tx: number, ty: number) {
    if (this.gridDirty) this.rebuildGrid();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !this.grid.ok(tx + dx, ty + dy)) return false;
    return true;
  }
  private spawnGold() {
    const s = this.s;
    const base = s.golds.length ? pick(s.golds) : null;
    for (let i = 0; i < 20; i++) {
      const tx = base ? base.tx + randInt(-3, 3) : randInt(2, s.map.w - 3);
      const ty = base ? base.ty + randInt(-3, 3) : randInt(2, s.map.h - 3);
      if (!this.freeTile(tx, ty, 0) || !this.landAround(tx, ty)) continue;
      if (this.s.villagers.some((v) => tileOf(v.x) === tx && tileOf(v.y) === ty)) continue;
      s.golds.push({ id: s.nextId++, tx, ty, variant: randInt(1, 6), amount: 6, reservedBy: null, shake: 0 });
      this.emit({ type: 'poof', x: cx(tx), y: cx(ty) });
      this.markDirty();
      return;
    }
  }
  private spawnWanderingSheep() {
    const shore = this.shoreTiles();
    if (!shore.length) return;
    const t = pick(shore);
    this.s.sheep.push({ id: this.s.nextId++, x: cx(t.x), y: cx(t.y), path: [], timer: 1, anim: 'idle', facingLeft: false, reservedBy: null });
    this.addChronicle('どこからか迷い羊がやってきた。', 'misc');
  }
  shoreTiles(): Pt[] {
    const out: Pt[] = [];
    const { w, h } = this.s.map;
    if (this.gridDirty) this.rebuildGrid();
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        if (!this.grid.ok(x, y)) continue;
        if (!this.isLand(x + 1, y) || !this.isLand(x - 1, y) || !this.isLand(x, y + 1) || !this.isLand(x, y - 1)) out.push({ x, y });
      }
    return out;
  }

  private updateSheep(sh: Sheep, dt: number) {
    if (sh.reservedBy !== null) {
      sh.anim = 'idle';
      sh.path = [];
      return;
    }
    if (sh.path.length) {
      sh.anim = 'move';
      this.moveAlong(sh, 28, dt);
      return;
    }
    sh.timer -= dt;
    if (sh.timer <= 0) {
      const r = rand();
      if (r < 0.4) {
        const t = this.randomWalkableNear(tileOf(sh.x), tileOf(sh.y), 3);
        const p = t ? this.pathTo(sh, [t]) : null;
        if (p) sh.path = p.slice(0, 6);
        sh.timer = 2 + rand() * 3;
      } else if (r < 0.75) {
        sh.anim = 'grass';
        sh.timer = 1.2 * randInt(1, 3);
      } else {
        sh.anim = 'idle';
        sh.timer = 1 + rand() * 3;
      }
    }
  }

  // ───────────── 人口 ─────────────
  private tryBirth(dt: number) {
    const s = this.s;
    if (this.population >= this.capacity || s.res.meat < 4) return;
    const adults = s.villagers.filter((v) => v.role !== 'child' && v.age < v.lifespan - 0.5);
    const f = adults.filter((v) => v.female);
    const m = adults.filter((v) => !v.female);
    if (!f.length || !m.length) {
      // 片方しかいなければ、ときどき移住者がやってくる
      if (rand() < dt * 0.004) this.immigrant(!f.length);
      return;
    }
    const rate = 0.0045 * (1 + 0.2 * s.upgrades.family) * Math.min(1, (f.length + m.length) / 4 + 0.3);
    if (rand() > dt * rate) return;
    const mom = pick(f);
    const dad = pick(m);
    const home = s.buildings.find((b) => b.id === mom.homeId) ?? s.buildings.find((b) => b.done && (b.kind === 'house' || b.kind === 'castle'));
    const pos = home ? { x: cx(this.entryOf(home).x), y: cx(this.entryOf(home).y) } : { x: mom.x, y: mom.y };
    const baby = this.makeVillager({ female: rand() < 0.5, age: 0, x: pos.x, y: pos.y, parents: [dad.name, mom.name] });
    baby.homeId = home?.id ?? null;
    s.villagers.push(baby);
    s.res.meat -= 4;
    s.stats.births++;
    this.addChronicle(`${dad.name}と${mom.name}のあいだに${baby.name}が生まれた。`, 'birth');
    this.addPoints(15, pos.x, pos.y - 40);
    this.emit({ type: 'birth', id: baby.id });
    this.say(mom, pick(['かわいい子!', '元気に育ってね', 'ようこそ!']));
  }

  private immigrant(female: boolean) {
    const shore = this.shoreTiles();
    if (!shore.length) return;
    const t = pick(shore);
    const v = this.makeVillager({ female, age: 1.1 + rand() * 1.5, x: cx(t.x), y: cx(t.y) });
    this.s.villagers.push(v);
    this.emit({ type: 'splash', x: v.x, y: v.y });
    this.addChronicle(`海の向こうから${v.name}が小舟でやってきて、村に加わった。`, 'misc');
    this.say(v, 'こんにちは!ここに住んでもいい?');
  }

  private die(v: Villager) {
    const s = this.s;
    this.releaseTask(v);
    s.villagers = s.villagers.filter((x) => x !== v);
    s.stats.deaths++;
    const years = Math.floor(v.age);
    const role = v.role === 'pawn' ? '' : { warrior: '戦士', archer: '弓兵', monk: '僧侶', child: '', pawn: '' }[v.role];
    this.addChronicle(`${role ? role + 'の' : ''}${v.name}が${years}歳で天に召された。${v.deeds > 40 ? '村のために誰よりも働いた生涯だった。' : '穏やかな最期だった。'}`, 'death');
    this.emit({ type: 'death', id: v.id, x: v.x, y: v.y });
  }

  private assignHomes() {
    const s = this.s;
    const homes = s.buildings.filter((b) => b.done && (b.kind === 'house' || b.kind === 'castle'));
    const cap = new Map<number, number>();
    for (const h of homes) cap.set(h.id, BUILDINGS[h.kind].capacity + (h.kind === 'house' ? s.upgrades.housing : 0));
    for (const v of s.villagers) if (v.homeId !== null && cap.has(v.homeId)) cap.set(v.homeId, cap.get(v.homeId)! - 1);
    for (const v of s.villagers) {
      if (v.homeId !== null && cap.has(v.homeId)) continue;
      const h = homes.find((b) => cap.get(b.id)! > 0);
      if (h) {
        v.homeId = h.id;
        cap.set(h.id, cap.get(h.id)! - 1);
      }
    }
  }

  private assignRoles() {
    const s = this.s;
    const want: Partial<Record<Role, number>> = {
      warrior: this.hasBuilding('barracks') ? Math.min(1 + s.stage, 3) : 0,
      archer: this.hasBuilding('archery') ? 2 : 0,
      monk: this.hasBuilding('monastery') ? 1 + (s.stage >= 3 ? 1 : 0) : 0,
    };
    const pawns = () => s.villagers.filter((v) => v.role === 'pawn' && v.age < v.lifespan - 0.3 && !v.knockedOut);
    for (const role of ['warrior', 'archer', 'monk'] as Role[]) {
      const have = s.villagers.filter((v) => v.role === role).length;
      if (have >= (want[role] ?? 0)) continue;
      const cand = pawns();
      if (cand.length <= 6) return;
      const pref = role === 'monk' ? 'pious' : 'brave';
      cand.sort((a, b) => Number(b.trait === pref) - Number(a.trait === pref) || b.age - a.age);
      const v = cand[0];
      this.releaseTask(v);
      v.role = role;
      v.maxHp = role === 'warrior' ? 40 : role === 'archer' ? 26 : 22;
      v.hp = v.maxHp;
      v.carrying = null;
      const name = { warrior: '戦士', archer: '弓兵', monk: '僧侶' }[role as 'warrior' | 'archer' | 'monk'];
      this.addChronicle(`${v.name}は${name}になった。`, 'misc');
      this.say(v, role === 'monk' ? '祈りの道を歩みます' : '村はわたしが守る!');
      return;
    }
  }

  // ───────────── 段階・建設 ─────────────
  private checkStage() {
    const s = this.s;
    if (s.stage >= 3) return;
    const req = STAGE_REQ[s.stage + 1] as { pop: number; houses?: number; need?: BuildingKind[] };
    if (this.population < req.pop) return;
    if (req.houses && this.countBuildings('house') < req.houses) return;
    if (req.need && !req.need.every((k) => this.hasBuilding(k))) return;
    s.stage++;
    this.addChronicle(`ここに「${STAGE_NAMES[s.stage]}」の時代が始まった。`, 'stage');
    this.addPoints(50 * s.stage);
    this.emit({ type: 'stage', stage: s.stage });
    if (s.stage === 1) s.nextRaidSeason = s.seasonIndex + 2;
    s.policy.nextBuild = ruleNextBuild(this);
  }

  canBuild(kind: BuildingKind) {
    const def = BUILDINGS[kind];
    return def.stage <= this.s.stage && this.countBuildings(kind, false) < def.limit;
  }
  canAfford(kind: BuildingKind) {
    const c = BUILDINGS[kind].cost;
    return (c.wood ?? 0) <= this.s.res.wood && (c.gold ?? 0) <= this.s.res.gold && (c.meat ?? 0) <= this.s.res.meat;
  }
  get sites() {
    return this.s.buildings.filter((b) => !b.done);
  }

  private planConstruction() {
    const s = this.s;
    const maxSites = this.population >= 10 ? 2 : 1;
    if (this.sites.length >= maxSites) return;
    let kind = s.policy.nextBuild;
    if (!kind || !this.canBuild(kind)) {
      kind = ruleNextBuild(this);
      s.policy.nextBuild = kind;
    }
    if (!kind || !this.canAfford(kind)) return;
    const spot = this.findSite(kind);
    if (!spot) return;
    const def = BUILDINGS[kind];
    for (const [k, v] of Object.entries(def.cost)) s.res[k as ResKind] -= v ?? 0;
    const b: Building = {
      id: s.nextId++,
      kind,
      variant: kind === 'house' ? randInt(1, 3) : 1,
      tx: spot.x,
      ty: spot.y,
      w: def.w,
      h: def.h,
      progress: 0,
      done: false,
      hp: def.hp,
      maxHp: def.hp,
      occupants: [],
      attackCd: 0,
    };
    // 足元の木を切り開く
    const cleared = s.trees.filter((t) => t.tx >= b.tx && t.tx < b.tx + b.w && t.ty > b.ty - b.h && t.ty <= b.ty + 1);
    for (const t of cleared) this.emit({ type: 'poof', x: cx(t.tx), y: cx(t.ty), big: true });
    if (cleared.length) {
      s.trees = s.trees.filter((t) => !cleared.includes(t));
      s.res.wood += cleared.length * 2;
    }
    s.buildings.push(b);
    this.markDirty();
    // 足元にいる村人は外へ
    for (const v of s.villagers) {
      const tx = tileOf(v.x);
      const ty = tileOf(v.y);
      if (tx >= b.tx && tx < b.tx + b.w && ty > b.ty - b.h && ty <= b.ty) {
        this.rebuildGrid();
        const out = this.nearestWalkable(tx, ty);
        if (out) {
          v.x = cx(out.x);
          v.y = cx(out.y);
          v.path = [];
        }
      }
    }
    for (const sh of s.sheep) {
      const tx = tileOf(sh.x);
      const ty = tileOf(sh.y);
      if (tx >= b.tx && tx < b.tx + b.w && ty > b.ty - b.h && ty <= b.ty) {
        this.rebuildGrid();
        const out = this.nearestWalkable(tx, ty);
        if (out) {
          sh.x = cx(out.x);
          sh.y = cx(out.y);
          sh.path = [];
        }
      }
    }
    this.addChronicle(`${def.name}の建設が始まった。`, 'build');
    this.emit({ type: 'siteStart', id: b.id });
    // 次の計画
    s.policy.nextBuild = ruleNextBuild(this);
  }

  findSite(kind: BuildingKind): Pt | null {
    return this.findSiteInner(kind, false) ?? this.findSiteInner(kind, true);
  }
  private findSiteInner(kind: BuildingKind, allowTrees: boolean): Pt | null {
    const s = this.s;
    const def = BUILDINGS[kind];
    const center = s.buildings[0] ? { x: s.buildings[0].tx + 1, y: s.buildings[0].ty } : { x: s.map.w / 2, y: s.map.h / 2 };
    if (this.gridDirty) this.rebuildGrid();
    let best: Pt | null = null;
    let bestScore = Infinity;
    for (let ty = 2; ty < s.map.h - 3; ty++)
      for (let tx = 2; tx < s.map.w - def.w - 2; tx++) {
        const d = Math.hypot(tx + def.w / 2 - center.x, (ty - center.y) * 1.2);
        if (d > 18) continue;
        const score = d + (kind === 'tower' ? -Math.min(d, 8) * 0.6 : 0) + rand() * 1.5;
        if (score >= bestScore) continue;
        if (this.siteOk(tx, ty, def.w, def.h, allowTrees)) {
          best = { x: tx, y: ty };
          bestScore = score;
        }
      }
    return best;
  }
  private treeAt(x: number, y: number) {
    return this.s.trees.some((t) => t.tx === x && t.ty === y);
  }
  private siteOk(tx: number, ty: number, w: number, h: number, allowTrees = false) {
    // 足元:陸で、周囲1マスも陸
    for (let y = ty - h; y <= ty + 1; y++)
      for (let x = tx - 1; x <= tx + w; x++) {
        if (!this.isLand(x, y)) return false;
      }
    // 足元と入口の列は空いている(木は切り開ける)
    for (let y = ty - h + 1; y <= ty + 1; y++)
      for (let x = tx; x < tx + w; x++) if (!this.grid.ok(x, y) && !(allowTrees && this.treeAt(x, y))) return false;
    // ほかの建物と1マス以上離す
    for (const b of this.s.buildings) {
      if (tx - 1 <= b.tx + b.w && tx + w >= b.tx - 1 && ty - h <= b.ty + 1 && ty + 1 >= b.ty - b.h) return false;
    }
    // 建物の上半分(屋根)が他と重ならないよう、上方向にも余白
    for (const b of this.s.buildings) {
      if (tx - 1 <= b.tx + b.w && tx + w >= b.tx - 1 && ty - h - 2 <= b.ty + 1 && ty + 1 >= b.ty - b.h - 2) return false;
    }
    return true;
  }

  private completeBuilding(b: Building) {
    const s = this.s;
    b.done = true;
    b.progress = 1;
    s.stats.built++;
    const def = BUILDINGS[b.kind];
    this.addChronicle(`${def.name}が完成した。`, 'build');
    this.addPoints(def.points, cx(b.tx) + ((b.w - 1) * TILE) / 2, cx(b.ty) - 120);
    this.emit({ type: 'built', id: b.id });
    if (b.kind === 'castle') {
      s.departed = true;
      this.addChronicle('壮麗な城がそびえ立った。この島の物語は、ひとつの区切りを迎えた。', 'stage');
    }
    s.policy.nextBuild = ruleNextBuild(this);
  }

  // ───────────── 村人 ─────────────
  workMul(v: Villager) {
    let m = 1 + 0.12 * this.s.upgrades.work;
    if (v.trait === 'hard') m *= 1.15;
    if (v.trait === 'lazy') m *= 0.85;
    if (v.hunger > 0.95) m *= 0.6;
    return m;
  }
  walkSpeed(v: Villager) {
    let sp = 78 * (1 + 0.1 * this.s.upgrades.walk);
    if (v.role === 'child') sp *= 0.8;
    if (v.hunger > 0.95) sp *= 0.85;
    if (v.age > v.lifespan - 0.6) sp *= 0.75;
    if (this.raidActive && v.role !== 'child') sp *= 1.25;
    return sp;
  }

  releaseTask(v: Villager) {
    const t = v.task;
    if (t?.targetId !== undefined) {
      const tree = this.s.trees.find((x) => x.id === t.targetId && x.reservedBy === v.id);
      if (tree) tree.reservedBy = null;
      const sh = this.s.sheep.find((x) => x.id === t.targetId && x.reservedBy === v.id);
      if (sh) sh.reservedBy = null;
      const g = this.s.golds.find((x) => x.id === t.targetId && x.reservedBy === v.id);
      if (g) g.reservedBy = null;
    }
    if (v.hidden) this.unhide(v);
    v.task = null;
    v.path = [];
  }

  private hideIn(v: Villager, b: Building) {
    v.hidden = true;
    if (!b.occupants.includes(v.id)) b.occupants.push(v.id);
  }
  private unhide(v: Villager) {
    v.hidden = false;
    for (const b of this.s.buildings) b.occupants = b.occupants.filter((id) => id !== v.id);
  }

  private setTask(v: Villager, type: TaskType, goals: Pt[] | null, extra?: Partial<Task>): boolean {
    let path: Pt[] = [];
    if (goals) {
      const p = this.pathTo(v, goals);
      if (!p) return false;
      path = p;
    }
    if (v.hidden) this.unhide(v);
    v.task = { type, phase: 'go', timer: 0, ...extra };
    v.path = path;
    return true;
  }

  private nearestBuilding(v: { x: number; y: number }, pred: (b: Building) => boolean): Building | null {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.s.buildings) {
      if (!pred(b)) continue;
      const e = this.entryOf(b);
      const d = dist(v.x, v.y, cx(e.x), cx(e.y));
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
  dropoffFor(v: { x: number; y: number }) {
    return this.nearestBuilding(v, (b) => b.done && (b.kind === 'house' || b.kind === 'castle'));
  }

  private updateVillager(v: Villager, dt: number) {
    const s = this.s;
    v.age += dt / YEAR_LEN;
    if (v.age >= v.lifespan) {
      this.die(v);
      return;
    }
    if (v.role === 'child' && v.age >= 1) {
      v.role = 'pawn';
      this.addChronicle(`${v.name}が大人になり、${{ wood: '木こり', meat: '羊飼い', gold: '鉱夫', build: '大工' }[v.skill]}の道を歩み始めた。`, 'misc');
      this.addPoints(5, v.x, v.y - 40);
      this.say(v, 'もう一人前だよ!');
    }
    if (v.bubble && s.time > v.bubble.until) v.bubble = null;
    if (v.attackCd > 0) v.attackCd -= dt;

    // 気絶中
    if (v.knockedOut > 0) {
      v.knockedOut -= dt;
      v.anim = 'down';
      if (v.knockedOut <= 0) {
        v.knockedOut = 0;
        v.hp = v.maxHp;
        this.say(v, 'いてて…');
      }
      return;
    }

    if (!v.hidden) {
      v.energy = clamp(v.energy - dt / (v.trait === 'lazy' ? 95 : 115), 0, 1);
    } else if (v.task?.type === 'sleep') v.energy = clamp(v.energy + dt / 20, 0, 1);
    v.hunger = clamp(v.hunger + dt / (v.trait === 'glutton' ? 260 : 360), 0, 1);

    // 割り込み:襲撃・夜
    const soldier = v.role === 'warrior' || v.role === 'archer';
    if (this.raidActive) {
      if (soldier) {
        if (v.task?.type !== 'fight') {
          this.releaseTask(v);
          v.task = { type: 'fight', phase: 'go', timer: 0 };
        }
      } else if (v.role === 'monk') {
        if (v.task?.type !== 'heal' && v.task?.type !== 'hide') this.releaseTask(v);
      } else if (v.task?.type !== 'hide') {
        this.releaseTask(v);
        const b = this.nearestBuilding(v, (b) => b.done && b.kind !== 'tower');
        if (b && this.setTask(v, 'hide', [this.entryOf(b)], { targetId: b.id })) {
          if (rand() < 0.3) this.say(v, murmur(v, { night: false, raid: true, season: this.season }) ?? '', 2.5);
        }
      }
    } else if (v.task?.type === 'fight' || v.task?.type === 'hide') {
      this.releaseTask(v);
    }
    if (this.isNight && !this.raidActive && v.task?.type !== 'sleep' && !this.festivalActive) {
      if (!v.task || (v.task.type !== 'deliver' && v.task.type !== 'wander')) {
        this.releaseTask(v);
        this.goSleep(v);
      }
    }
    if (v.task?.type === 'sleep' && v.hidden && !this.isNight && v.energy > 0.9) {
      this.releaseTask(v);
      if (rand() < 0.25) this.say(v, pick(['おはよう!', 'いい朝だ', 'ふわぁ、よく寝た']));
    }

    if (!v.task) this.chooseTask(v);
    if (v.task) this.runTask(v, dt);

    // つぶやき
    if (!v.hidden && s.time > v.nextMurmur) {
      v.nextMurmur = s.time + 25 + rand() * 50;
      if (!v.bubble) {
        const t = murmur(v, { night: this.isNight, raid: this.raidActive, season: this.season });
        if (t) this.say(v, t);
      }
    }
  }

  private goSleep(v: Villager) {
    const home =
      (v.role === 'warrior' && this.nearestBuilding(v, (b) => b.done && b.kind === 'barracks')) ||
      (v.role === 'archer' && this.nearestBuilding(v, (b) => b.done && b.kind === 'archery')) ||
      (v.role === 'monk' && this.nearestBuilding(v, (b) => b.done && b.kind === 'monastery')) ||
      this.s.buildings.find((b) => b.id === v.homeId && b.done) ||
      this.nearestBuilding(v, (b) => b.done && (b.kind === 'house' || b.kind === 'castle'));
    if (!home || !this.setTask(v, 'sleep', [this.entryOf(home)], { targetId: home.id })) {
      v.task = { type: 'wander', phase: 'act', timer: 0 };
    }
  }

  private chooseTask(v: Villager) {
    const s = this.s;
    // 運んでいる途中の荷物を先に届ける
    if (v.carrying) {
      this.deliver(v);
      return;
    }
    // 空腹
    if (v.hunger > 0.7 && s.res.meat > 0) {
      const d = this.dropoffFor(v);
      if (d && this.setTask(v, 'eat', [this.entryOf(d)], { targetId: d.id })) return;
    }
    // 昼寝
    if (v.energy < 0.12) {
      this.goSleep(v);
      if (v.task) return;
    }
    // 祭り
    if (this.festivalActive) {
      const c = s.buildings[0];
      const t = c ? this.randomWalkableNear(c.tx + 1, c.ty + 2, 3) : null;
      if (t && this.setTask(v, 'festival', [t])) return;
    }
    if (v.role === 'child') {
      const home = s.buildings.find((b) => b.id === v.homeId) ?? s.buildings[0];
      const t = home ? this.randomWalkableNear(home.tx + 1, home.ty + 1, 4) : null;
      if (t && this.setTask(v, 'play', [t])) return;
      v.task = { type: 'wander', phase: 'act', timer: 2 };
      return;
    }
    if (v.role === 'warrior' || v.role === 'archer') {
      const home = this.nearestBuilding(v, (b) => b.done && (b.kind === (v.role === 'warrior' ? 'barracks' : 'archery') || b.kind === 'tower'));
      const t = home ? this.randomWalkableNear(home.tx + 1, home.ty + 2, 3) : this.randomWalkableNear(tileOf(v.x), tileOf(v.y), 4);
      if (t && this.setTask(v, 'guard', [t])) return;
      v.task = { type: 'wander', phase: 'act', timer: 3 };
      return;
    }
    if (v.role === 'monk') {
      const hurt = s.villagers.find((x) => x.knockedOut > 0 && !x.hidden);
      if (hurt && this.setTask(v, 'heal', this.adjacentGoals(tileOf(hurt.x), tileOf(hurt.y)), { targetId: hurt.id })) return;
      const mon = this.nearestBuilding(v, (b) => b.done && b.kind === 'monastery');
      if (mon && rand() < 0.5 && this.setTask(v, 'pray', [this.entryOf(mon)], { targetId: mon.id })) return;
      const t = this.randomWalkableNear(tileOf(v.x), tileOf(v.y), 4);
      if (t && this.setTask(v, 'wander', [t])) return;
      v.task = { type: 'wander', phase: 'act', timer: 3 };
      return;
    }

    // 村人:仕事を選ぶ
    const w = s.policy.weights;
    const options: { type: TaskType; score: number }[] = [];
    const skillBonus = (k: ResKind | 'build') => (v.skill === k ? 1.7 : 1);
    const builders = (id: number) => s.villagers.filter((x) => x.task?.targetId === id && (x.task.type === 'build' || x.task.type === 'repair')).length;
    const site = this.sites.find((b) => builders(b.id) < 4);
    if (site) options.push({ type: 'build', score: 2.2 * w.build * skillBonus('build') });
    const damaged = s.buildings.find((b) => b.done && b.hp < b.maxHp && builders(b.id) < 2);
    if (damaged) options.push({ type: 'repair', score: 2.5 * skillBonus('build') });
    if (s.trees.some((t) => t.growth >= 1 && t.reservedBy === null)) options.push({ type: 'chop', score: w.wood * skillBonus('wood') });
    if (s.sheep.filter((x) => x.reservedBy === null).length > 3) options.push({ type: 'harvest', score: w.meat * skillBonus('meat') });
    if (s.stage >= 1 && s.golds.some((g) => g.reservedBy === null)) options.push({ type: 'mine', score: w.gold * skillBonus('gold') });
    const monastery = this.hasBuilding('monastery');
    if (monastery && v.trait === 'pious') options.push({ type: 'pray', score: 0.5 });
    const idle = v.trait === 'lazy' ? 0.7 : v.trait === 'hard' ? 0.12 : 0.3;
    options.push({ type: 'wander', score: idle });
    options.push({ type: 'chat', score: v.trait === 'cheer' ? 0.35 : v.trait === 'shy' ? 0.03 : 0.15 });

    const total = options.reduce((a, o) => a + Math.max(0, o.score), 0);
    let r = rand() * total;
    let choice = options[options.length - 1];
    for (const o of options) {
      r -= Math.max(0, o.score);
      if (r <= 0) {
        choice = o;
        break;
      }
    }
    if (!this.startJob(v, choice.type, site, damaged)) {
      v.task = { type: 'wander', phase: 'act', timer: 1 + rand() * 2 };
    }
  }

  private startJob(v: Villager, type: TaskType, site?: Building, damaged?: Building): boolean {
    const s = this.s;
    switch (type) {
      case 'build':
        return !!site && this.setTask(v, 'build', this.buildingGoals(site), { targetId: site.id });
      case 'repair':
        return !!damaged && this.setTask(v, 'repair', this.buildingGoals(damaged), { targetId: damaged.id });
      case 'chop': {
        const cands = s.trees.filter((t) => t.growth >= 1 && t.reservedBy === null);
        cands.sort((a, b) => dist(v.x, v.y, cx(a.tx), cx(a.ty)) - dist(v.x, v.y, cx(b.tx), cx(b.ty)));
        for (const t of cands.slice(0, 4)) {
          if (this.setTask(v, 'chop', this.adjacentGoals(t.tx, t.ty), { targetId: t.id, hits: 0 })) {
            t.reservedBy = v.id;
            return true;
          }
        }
        return false;
      }
      case 'harvest': {
        const cands = s.sheep.filter((x) => x.reservedBy === null);
        cands.sort((a, b) => dist(v.x, v.y, a.x, a.y) - dist(v.x, v.y, b.x, b.y));
        for (const sh of cands.slice(0, 3)) {
          if (this.setTask(v, 'harvest', this.adjacentGoals(tileOf(sh.x), tileOf(sh.y)), { targetId: sh.id })) {
            sh.reservedBy = v.id;
            return true;
          }
        }
        return false;
      }
      case 'mine': {
        const cands = s.golds.filter((g) => g.reservedBy === null);
        cands.sort((a, b) => dist(v.x, v.y, cx(a.tx), cx(a.ty)) - dist(v.x, v.y, cx(b.tx), cx(b.ty)));
        for (const g of cands.slice(0, 3)) {
          if (this.setTask(v, 'mine', this.adjacentGoals(g.tx, g.ty), { targetId: g.id, hits: 0 })) {
            g.reservedBy = v.id;
            return true;
          }
        }
        return false;
      }
      case 'pray': {
        const mon = this.nearestBuilding(v, (b) => b.done && b.kind === 'monastery');
        return !!mon && this.setTask(v, 'pray', [this.entryOf(mon)], { targetId: mon.id });
      }
      case 'chat': {
        const partner = s.villagers.find(
          (x) => x !== v && !x.hidden && x.role !== 'child' && x.knockedOut === 0 && (!x.task || x.task.type === 'wander') && dist(x.x, x.y, v.x, v.y) < TILE * 8,
        );
        if (!partner) return false;
        if (!this.setTask(v, 'chat', this.adjacentGoals(tileOf(partner.x), tileOf(partner.y)), { targetId: partner.id })) return false;
        this.releaseTask(partner);
        partner.task = { type: 'chat', phase: 'act', timer: 0, targetId: v.id };
        partner.path = [];
        return true;
      }
      case 'wander': {
        const t = this.randomWalkableNear(tileOf(v.x), tileOf(v.y), 4);
        return !!t && this.setTask(v, 'wander', [t]);
      }
    }
    return false;
  }

  private runTask(v: Villager, dt: number) {
    const s = this.s;
    const t = v.task!;
    const speed = this.walkSpeed(v);
    const carryAnim = v.carrying ? `_${v.carrying}` : '';
    if (t.phase === 'go') {
      if (t.type === 'fight') {
        this.runFight(v, dt);
        return;
      }
      if (t.type === 'heal') {
        const target = s.villagers.find((x) => x.id === t.targetId);
        if (!target || target.knockedOut <= 0) {
          v.task = null;
          return;
        }
      }
      const arrived = this.moveAlong(v, speed, dt);
      v.anim = v.role === 'pawn' || v.role === 'child' ? `run${carryAnim}` : 'run';
      if (t.type === 'festival' || t.type === 'play') v.anim = 'run';
      if (arrived) {
        t.phase = 'act';
        t.timer = 0;
        this.onArrive(v);
      }
      return;
    }
    if (t.phase !== 'act') {
      v.task = null;
      return;
    }
    t.timer += dt;
    const wm = this.workMul(v);
    switch (t.type) {
      case 'chop': {
        const tree = s.trees.find((x) => x.id === t.targetId);
        if (!tree || tree.growth < 1) {
          this.releaseTask(v);
          return;
        }
        v.facingLeft = cx(tree.tx) < v.x;
        v.anim = 'chop';
        const swing = 0.6 / wm;
        if (t.timer >= swing) {
          t.timer -= swing;
          t.hits = (t.hits ?? 0) + 1;
          tree.shake = 0.25;
          this.emit({ type: 'chop', x: cx(tree.tx), y: cx(tree.ty), treeId: tree.id });
          if (t.hits >= 7) {
            tree.growth = 0;
            tree.reservedBy = null;
            this.emit({ type: 'treeFall', treeId: tree.id });
            v.carrying = 'wood';
            this.deliver(v);
          }
        }
        return;
      }
      case 'mine': {
        const g = s.golds.find((x) => x.id === t.targetId);
        if (!g) {
          this.releaseTask(v);
          return;
        }
        v.facingLeft = cx(g.tx) < v.x;
        v.anim = 'mine';
        const swing = 0.6 / wm;
        if (t.timer >= swing) {
          t.timer -= swing;
          t.hits = (t.hits ?? 0) + 1;
          g.shake = 0.2;
          this.emit({ type: 'mine', x: cx(g.tx), y: cx(g.ty), stoneId: g.id });
          if (t.hits >= 6) {
            g.amount--;
            g.reservedBy = null;
            if (g.amount <= 0) {
              s.golds = s.golds.filter((x) => x !== g);
              this.emit({ type: 'poof', x: cx(g.tx), y: cx(g.ty), big: true });
              this.markDirty();
            }
            v.carrying = 'gold';
            this.deliver(v);
          }
        }
        return;
      }
      case 'harvest': {
        const sh = s.sheep.find((x) => x.id === t.targetId);
        if (!sh) {
          this.releaseTask(v);
          return;
        }
        v.facingLeft = sh.x < v.x;
        v.anim = 'knife';
        if (t.timer >= 1.6 / wm) {
          s.sheep = s.sheep.filter((x) => x !== sh);
          this.emit({ type: 'poof', x: sh.x, y: sh.y });
          v.carrying = 'meat';
          this.deliver(v);
        }
        return;
      }
      case 'build':
      case 'repair': {
        const b = s.buildings.find((x) => x.id === t.targetId);
        if (!b || (t.type === 'build' && b.done) || (t.type === 'repair' && b.hp >= b.maxHp)) {
          v.task = null;
          v.deeds++;
          return;
        }
        v.facingLeft = cx(b.tx) + ((b.w - 1) * TILE) / 2 < v.x;
        v.anim = 'hammer';
        if (Math.floor(t.timer / 0.3) !== Math.floor((t.timer - dt) / 0.3) && Math.floor(t.timer / 0.3) % 2 === 0)
          this.emit({ type: 'hammer', x: v.x + (v.facingLeft ? -20 : 20), y: v.y - 10 });
        const mul = wm * (v.skill === 'build' ? 1.4 : 1);
        if (t.type === 'build') {
          b.progress += (dt * mul) / BUILDINGS[b.kind].work;
          if (b.progress >= 1) {
            this.completeBuilding(b);
            v.task = null;
          }
        } else {
          b.hp = Math.min(b.maxHp, b.hp + dt * 6 * mul);
        }
        if (t.timer > 25) {
          v.task = null; // 一区切り
          v.deeds++;
        }
        return;
      }
      case 'deliver': {
        // onArriveで処理済み
        v.task = null;
        return;
      }
      case 'eat': {
        v.anim = 'idle';
        if (t.timer > 1.5) {
          if (s.res.meat > 0) {
            s.res.meat -= 1;
            v.hunger = 0;
            if (rand() < 0.4) this.say(v, pick(['いただきます!', 'おいしい〜', 'ごちそうさま']));
          }
          this.releaseTask(v);
        }
        return;
      }
      case 'sleep': {
        v.anim = 'idle';
        if (!this.isNight && t.timer > 20 && v.energy > 0.8) this.releaseTask(v);
        return;
      }
      case 'hide': {
        v.anim = 'idle';
        return;
      }
      case 'pray': {
        v.anim = 'idle';
        if (t.timer > 8) {
          this.addPoints(3, v.x, v.y - 60);
          this.releaseTask(v);
        }
        return;
      }
      case 'heal': {
        const target = s.villagers.find((x) => x.id === t.targetId);
        if (!target || target.knockedOut <= 0) {
          v.task = null;
          return;
        }
        v.facingLeft = target.x < v.x;
        v.anim = 'heal';
        if (t.timer > 1.1) {
          target.knockedOut = 0;
          target.hp = target.maxHp;
          this.emit({ type: 'heal', x: target.x, y: target.y });
          this.say(target, 'ありがとう!');
          v.task = null;
        }
        return;
      }
      case 'chat': {
        v.anim = 'idle';
        const partner = s.villagers.find((x) => x.id === t.targetId);
        if (!partner || partner.task?.type !== 'chat') {
          v.task = null;
          return;
        }
        v.facingLeft = partner.x < v.x;
        if (t.timer > 10) {
          v.task = null;
          partner.task = null;
        }
        return;
      }
      case 'festival': {
        v.anim = Math.floor(t.timer * 2) % 3 === 0 ? 'run' : 'idle';
        if (t.timer > 3 + rand() * 3) {
          if (rand() < 0.3) this.say(v, murmur(v, { night: false, raid: false, season: this.season }) ?? '♪');
          v.task = null;
        }
        return;
      }
      case 'guard': {
        v.anim = v.role === 'warrior' && t.timer > 1 && t.timer < 3 ? 'guard' : 'idle';
        if (t.timer > 6 + rand() * 4) v.task = null;
        return;
      }
      case 'fight':
        this.runFight(v, dt);
        return;
      default: {
        // wander / play
        v.anim = 'idle';
        if (t.timer > 2 + rand() * 3) v.task = null;
      }
    }
  }

  private onArrive(v: Villager) {
    const s = this.s;
    const t = v.task!;
    if (t.type === 'deliver') {
      const kind = v.carrying;
      if (kind) {
        const amount = kind === 'wood' ? 2 : kind === 'meat' ? 5 : 3;
        s.res[kind] += amount;
        v.deeds++;
        this.emit({ type: 'deliver', x: v.x, y: v.y - 50, kind, amount });
        this.addPoints(kind === 'gold' ? 2 : 1);
      }
      v.carrying = null;
      v.task = null;
      return;
    }
    if (t.type === 'sleep' || t.type === 'hide' || t.type === 'pray') {
      const b = s.buildings.find((x) => x.id === t.targetId);
      if (b) this.hideIn(v, b);
      return;
    }
    if (t.type === 'chat') {
      const partner = s.villagers.find((x) => x.id === t.targetId);
      if (partner && partner.task?.type === 'chat') {
        const pair = pick(CHAT_PAIRS);
        this.say(v, pair[0], 3);
        partner.bubble = { text: pair[1], until: s.time + 5 };
        partner.facingLeft = v.x < partner.x;
        t.timer = 4;
        if (partner.task) partner.task.timer = 0;
        partner.task = { type: 'chat', phase: 'act', timer: 4, targetId: v.id };
      } else v.task = null;
    }
  }

  private deliver(v: Villager) {
    const t = v.task;
    if (t?.targetId !== undefined) {
      // 予約を解除
      const tree = this.s.trees.find((x) => x.id === t.targetId && x.reservedBy === v.id);
      if (tree) tree.reservedBy = null;
    }
    const d = this.dropoffFor(v);
    if (!d || !this.setTask(v, 'deliver', [this.entryOf(d)])) {
      // 届けられないときはその場で納品扱い
      v.task = { type: 'deliver', phase: 'go', timer: 0 };
      v.path = [];
    }
  }

  // ───────────── 戦い ─────────────
  private runFight(v: Villager, dt: number) {
    const s = this.s;
    const t = v.task!;
    let best: Raider | null = null;
    let bd = Infinity;
    for (const r of s.raiders) {
      if (r.fleeing && r.hp <= 0) continue;
      const d = dist(v.x, v.y, r.x, r.y);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (!best) {
      v.task = null;
      return;
    }
    const range = v.role === 'archer' ? 260 : 56;
    if (bd > range) {
      t.timer -= dt;
      if (t.timer <= 0 || !v.path.length) {
        t.timer = 1;
        const p = this.pathTo(v, this.adjacentGoals(tileOf(best.x), tileOf(best.y)));
        v.path = p ?? [];
      }
      this.moveAlong(v, this.walkSpeed(v) * 1.1, dt);
      v.anim = 'run';
      return;
    }
    v.path = [];
    v.facingLeft = best.x < v.x;
    if (v.attackCd <= 0) {
      if (v.role === 'archer') {
        v.anim = 'shoot';
        v.attackCd = 1.4;
        this.fireArrow(v.x, v.y - 40, best, 5 * this.strengthMul);
      } else {
        v.anim = 'attack';
        v.attackCd = 0.8;
        this.damageRaider(best, 7 * this.strengthMul);
      }
    } else if (v.attackCd < (v.role === 'archer' ? 0.6 : 0.4)) v.anim = 'idle';
  }

  fireArrow(x: number, y: number, target: Raider, dmg: number) {
    const s = this.s;
    const d = dist(x, y, target.x, target.y);
    s.arrows.push({ id: s.nextId++, x, y, sx: x, sy: y, tx: target.x, ty: target.y - 20, t: 0, dur: Math.max(0.25, d / 520), targetId: target.id, dmg, hostile: false });
  }

  private updateArrows(dt: number) {
    const s = this.s;
    for (const a of s.arrows) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.x = a.sx + (a.tx - a.sx) * k;
      a.y = a.sy + (a.ty - a.sy) * k;
      if (k >= 1) {
        const r = s.raiders.find((x) => x.id === a.targetId);
        if (r && dist(r.x, r.y - 20, a.tx, a.ty) < 60) this.damageRaider(r, a.dmg);
      }
    }
    s.arrows = s.arrows.filter((a) => a.t < a.dur);
  }

  private updateTowers(dt: number) {
    const s = this.s;
    if (!this.raidActive) return;
    for (const b of s.buildings) {
      if (!b.done || b.kind !== 'tower') continue;
      b.attackCd -= dt;
      if (b.attackCd > 0) continue;
      const bx = cx(b.tx) + TILE / 2;
      const by = cx(b.ty) - 150;
      const r = s.raiders.filter((x) => !x.fleeing && dist(bx, cx(b.ty), x.x, x.y) < 330).sort((a, c) => dist(bx, by, a.x, a.y) - dist(bx, by, c.x, c.y))[0];
      if (r) {
        b.attackCd = 1.6;
        this.fireArrow(bx, by, r, 5 * this.strengthMul);
      }
    }
  }

  private damageRaider(r: Raider, dmg: number) {
    r.hp -= dmg;
    this.emit({ type: 'hit', x: r.x, y: r.y - 30 });
    if (r.hp <= 0) {
      this.s.raiders = this.s.raiders.filter((x) => x !== r);
      this.emit({ type: 'poof', x: r.x, y: r.y, big: true });
      this.addPoints(5, r.x, r.y - 50);
      if (!this.s.raiders.length) this.endRaid(true);
    } else if (r.hp < r.maxHp * 0.3 && !r.fleeing && rand() < 0.5) {
      r.fleeing = true;
      r.path = [];
    }
  }

  startRaid() {
    const s = this.s;
    const shore = this.shoreTiles();
    if (!shore.length) return;
    const c = s.buildings[0];
    const far = shore
      .map((p) => ({ p, d: c ? Math.hypot(p.x - c.tx, p.y - c.ty) : 0 }))
      .sort((a, b) => b.d - a.d)
      .slice(0, Math.max(1, Math.floor(shore.length * 0.3)));
    const origin = pick(far).p;
    const count = Math.min(2 + s.stage + Math.floor(this.year / 2), 10);
    for (let i = 0; i < count; i++) {
      const t = this.randomWalkableNear(origin.x, origin.y, 2) ?? origin;
      const hp = 22 + 8 * s.stage + this.year * 2;
      s.raiders.push({
        id: s.nextId++,
        x: cx(t.x),
        y: cx(t.y),
        path: [],
        hp,
        maxHp: hp,
        dmg: 3 + s.stage,
        targetKind: null,
        targetId: null,
        attackCd: 1 + rand(),
        anim: 'idle',
        facingLeft: false,
        repath: 0,
        fleeing: false,
      });
      this.emit({ type: 'splash', x: cx(t.x), y: cx(t.y) });
    }
    s.raidEndAt = s.time + 150;
    this.addChronicle(`海から${count}人の盗賊団が上陸した!`, 'raid');
    this.emit({ type: 'raidStart' });
  }

  private endRaid(won: boolean) {
    const s = this.s;
    s.raidEndAt = null;
    if (won) {
      s.stats.raidsRepelled++;
      this.addChronicle(pick(['盗賊団を見事に撃退した。', '村人たちは力を合わせ、盗賊を追い払った。', '盗賊団は海の彼方へ逃げ去った。']), 'raid');
      this.addPoints(20);
    } else {
      this.addChronicle('盗賊団は好き放題に暴れたあと、去っていった。', 'raid');
    }
    this.emit({ type: 'raidEnd' });
  }

  private updateRaider(r: Raider, dt: number) {
    const s = this.s;
    r.attackCd -= dt;
    r.repath -= dt;
    if (r.fleeing) {
      if (!r.path.length && r.repath <= 0) {
        r.repath = 2;
        const shore = this.shoreTiles();
        shore.sort((a, b) => dist(r.x, r.y, cx(a.x), cx(a.y)) - dist(r.x, r.y, cx(b.x), cx(b.y)));
        const p = shore[0] ? this.pathTo(r, [shore[0]]) : null;
        r.path = p ?? [];
        if (!p || !p.length) {
          // 岸に着いた
          s.raiders = s.raiders.filter((x) => x !== r);
          this.emit({ type: 'splash', x: r.x, y: r.y });
          if (!s.raiders.length) this.endRaid(s.raidEndAt !== null && s.time <= s.raidEndAt);
          return;
        }
      }
      r.anim = 'run';
      this.moveAlong(r, 85, dt);
      return;
    }
    // 目標選び
    if (r.repath <= 0) {
      r.repath = 1.5;
      let target: { kind: 'building' | 'villager'; id: number; goals: Pt[] } | null = null;
      let bd = Infinity;
      for (const v of s.villagers) {
        if (v.hidden || v.knockedOut > 0) continue;
        const d = dist(r.x, r.y, v.x, v.y);
        const near = v.role === 'warrior' || v.role === 'archer' ? TILE * 5 : TILE * 3.5;
        if (d < near && d < bd) {
          bd = d;
          target = { kind: 'villager', id: v.id, goals: this.adjacentGoals(tileOf(v.x), tileOf(v.y)) };
        }
      }
      if (!target) {
        for (const b of s.buildings) {
          if (!b.done || b.hp <= b.maxHp * 0.15) continue;
          const d = dist(r.x, r.y, cx(b.tx), cx(b.ty));
          if (d < bd) {
            bd = d;
            target = { kind: 'building', id: b.id, goals: this.buildingGoals(b) };
          }
        }
      }
      if (!target) {
        r.fleeing = true;
        return;
      }
      r.targetKind = target.kind;
      r.targetId = target.id;
      const p = this.pathTo(r, target.goals);
      r.path = p ?? [];
    }
    // 攻撃できる距離か
    if (r.targetKind === 'villager') {
      const v = s.villagers.find((x) => x.id === r.targetId);
      if (!v || v.hidden || v.knockedOut > 0) {
        r.repath = 0;
        r.targetId = null;
      } else if (dist(r.x, r.y, v.x, v.y) < 58) {
        r.path = [];
        r.facingLeft = v.x < r.x;
        if (r.attackCd <= 0) {
          r.attackCd = 1.1;
          r.anim = 'attack';
          v.hp -= r.dmg;
          this.emit({ type: 'hit', x: v.x, y: v.y - 30 });
          if (v.hp <= 0) {
            v.knockedOut = 35;
            this.releaseTask(v);
            v.carrying = null;
            this.say(v, 'うわぁ…', 2);
          }
        } else if (r.attackCd < 0.6) r.anim = 'idle';
        return;
      }
    } else if (r.targetKind === 'building') {
      const b = s.buildings.find((x) => x.id === r.targetId);
      if (!b || b.hp <= b.maxHp * 0.15) {
        r.repath = 0;
        r.targetId = null;
      } else if (!r.path.length) {
        const bx = Math.min(Math.max(r.x, b.tx * TILE), (b.tx + b.w) * TILE);
        const by = Math.min(Math.max(r.y, (b.ty - b.h + 1) * TILE), (b.ty + 1) * TILE);
        if (dist(r.x, r.y, bx, by) < 80) {
          r.facingLeft = bx < r.x;
          if (r.attackCd <= 0) {
            r.attackCd = 1.2;
            r.anim = 'attack';
            b.hp = Math.max(1, b.hp - r.dmg * 1.5);
            this.emit({ type: 'hit', x: bx, y: by - 30 });
            // 盗む
            const kinds: ResKind[] = ['wood', 'meat', 'gold'];
            const k = pick(kinds);
            if (s.res[k] > 0) s.res[k] = Math.max(0, s.res[k] - 1);
          } else if (r.attackCd < 0.6) r.anim = 'idle';
          return;
        } else r.repath = 0;
      }
    }
    if (r.path.length) {
      this.moveAlong(r, 62, dt);
      r.anim = 'run';
    } else r.anim = 'idle';
  }

  // ───────────── プレイヤーの操作 ─────────────
  buyUpgrade(key: UpgradeKey): boolean {
    const s = this.s;
    const cost = upgradeCost(key, s.upgrades[key]);
    if (s.points < cost) return false;
    s.points -= cost;
    s.upgrades[key]++;
    this.addChronicle(`天の恵み「${UPGRADES[key].name}」が村に授けられた(${s.upgrades[key]}段)。`, 'misc');
    return true;
  }

  /** 旅立ち:新しい島で始め直す */
  depart(): GameState {
    const s = this.s;
    const ups = { ...s.upgrades };
    for (const k of Object.keys(ups) as UpgradeKey[]) ups[k] = Math.floor(ups[k] / 2);
    return Sim.newGame({ memories: s.memories + 1, islandNo: s.islandNo + 1, upgrades: ups });
  }

  /** 留守中の早送り(演出なし) */
  fastForward(seconds: number, stepDt = 0.25) {
    this.muted = true;
    let t = 0;
    while (t < seconds) {
      this.step(stepDt);
      t += stepDt;
    }
    this.muted = false;
    this.events = [];
  }
}
