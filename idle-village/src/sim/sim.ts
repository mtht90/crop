// 村のシミュレーション本体。Phaserに依存しないので、留守中の早送りにもそのまま使える。
// ここで決めているのは「本能」と「体の動き」だけ。何をしたいかは Intention としてAIから受け取る。
import { BUILDINGS, DAY_LEN, MAP_H, MAP_W, NIGHT_START, SEASONS, SEASON_LEN, SEED_PERSONALITIES, TILE, UPGRADES, YEAR_LEN, upgradeCost } from './config';
import { generateIsland } from './mapgen';
import { CHAT_PAIRS, murmur } from './murmurs';
import { Grid, findPath } from './path';
import type {
  Action,
  Building,
  BuildingKind,
  BuildingRole,
  ChronicleEntry,
  Conversation,
  GameState,
  Project,
  Pt,
  Raider,
  ResKind,
  Sheep,
  SimEvent,
  Task,
  TaskType,
  UpgradeKey,
  Villager,
} from './types';
import { clamp, dist, makeIslandName, makeName, mulberry32, pick, rand, randInt } from './util';

export const SAVE_VERSION = 2;
const SKILLS: (ResKind | 'build')[] = ['wood', 'meat', 'gold', 'build'];

const cx = (t: number) => t * TILE + TILE / 2;
const tileOf = (p: number) => Math.floor(p / TILE);

export class Sim {
  s: GameState;
  grid: Grid;
  events: SimEvent[] = [];
  /** AIが使えるか(使えないときは習慣とルールで動く) */
  aiEnabled = false;
  private gridDirty = true;
  private landArr: Uint8Array;
  private slowTimer = 0;
  private buildTimer = 0;
  muted = false;

  constructor(state: GameState) {
    this.s = state;
    for (const v of state.villagers) {
      v.speech ??= '';
      v.mutters ??= [];
    }
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
      res: { wood: 10, meat: 10, gold: 0 },
      points: 0,
      totalPoints: 0,
      upgrades: opts?.upgrades ?? { work: 0, walk: 0, nature: 0, housing: 0, family: 0, strength: 0 },
      era: 'はじまりのころ',
      customs: [],
      map: { w: MAP_W, h: MAP_H, land: Array.from(gen.land).join('') },
      villagers: [],
      trees: gen.trees.map((t) => ({ id: nextId++, tx: t.tx, ty: t.ty, variant: t.variant, growth: Math.random() < 0.8 ? 1 : 0.5, hits: 0, reservedBy: null, shake: 0 })),
      sheep: [],
      golds: gen.golds.map((g) => ({ id: nextId++, tx: g.tx, ty: g.ty, variant: g.variant, amount: 6, reservedBy: null, shake: 0 })),
      buildings: [],
      projects: [],
      raiders: [],
      arrows: [],
      decos: gen.decos,
      conversations: [],
      pendingTalks: [],
      chronicle: [],
      nextId: 0,
      nextRaidAt: 60 * 25,
      raidEndAt: null,
      festivalUntil: 0,
      departed: false,
      savedAt: Date.now(),
      stats: { births: 0, deaths: 0, raidsRepelled: 0, built: 0, talks: 0 },
    };
    for (const sp of gen.sheep) {
      s.sheep.push({ id: nextId++, x: cx(sp.tx), y: cx(sp.ty), path: [], timer: Math.random() * 3, anim: 'idle', facingLeft: Math.random() < 0.5, reservedBy: null });
    }
    const c = gen.center;
    const house: Building = {
      id: nextId++,
      kind: 'house',
      variant: 1,
      name: 'はじまりの小屋',
      role: 'home',
      purpose: '流れ着いた者たちが最初に建てた、雨風をしのぐ小屋',
      proposer: '',
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
    const near = (tx: number, ty: number) => tx >= house.tx - 1 && tx <= house.tx + 2 && ty >= house.ty - 1 && ty <= house.ty + 2;
    s.trees = s.trees.filter((t) => !near(t.tx, t.ty));
    s.golds = s.golds.filter((g) => !near(g.tx, g.ty));
    s.buildings.push(house);
    s.nextId = nextId;
    const sim = new Sim(s);
    const used = new Set<string>();
    const sexes = [false, true, Math.random() < 0.5];
    const pers = [...SEED_PERSONALITIES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 3; i++) {
      const v = sim.makeVillager({ female: sexes[i], age: 1.2 + Math.random() * 1.2, x: cx(c.x + i - 1), y: cx(c.y + 1) + 10, used });
      v.personality = pers[i];
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
      lifespan: 5.5 + Math.random() * 2.5,
      role: o.age < 1 ? 'child' : 'pawn',
      personality: pick(SEED_PERSONALITIES),
      speech: '',
      mutters: [],
      skill: pick(SKILLS),
      avatar: randInt(1, 25),
      x: o.x,
      y: o.y,
      path: [],
      task: null,
      intention: null,
      thinking: false,
      memories: [],
      relations: {},
      partnerId: null,
      carrying: null,
      energy: 0.8 + Math.random() * 0.2,
      hunger: Math.random() * 0.3,
      loneliness: Math.random() * 0.4,
      hp: 20,
      maxHp: 20,
      knockedOut: 0,
      hidden: false,
      homeId: null,
      facingLeft: Math.random() < 0.5,
      anim: 'idle',
      bubble: null,
      nextMurmur: this.s.time + 5 + Math.random() * 20,
      attackCd: 0,
      parents: o.parents ?? [],
      born: this.s.time - o.age * YEAR_LEN,
      deeds: 0,
      named: false,
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
  get timeLabel() {
    return `${this.year}年目 ${SEASONS[this.season]}`;
  }
  get population() {
    return this.s.villagers.length;
  }
  homeCapacity(b: Building) {
    return b.done && b.role === 'home' ? BUILDINGS[b.kind].capacity + (b.kind === 'house' ? this.s.upgrades.housing : 0) : 0;
  }
  get capacity() {
    let c = 0;
    for (const b of this.s.buildings) c += this.homeCapacity(b);
    return c;
  }
  get pointMul() {
    return 1 + 0.25 * this.s.memories;
  }
  get natureMul() {
    return 1 + 0.15 * this.s.upgrades.nature;
  }
  get strengthMul() {
    return (1 + 0.15 * this.s.upgrades.strength) * (this.hasRole('training') ? 1.25 : 1);
  }
  get seasonGrowth() {
    return [1.5, 1.2, 0.8, 0][this.season];
  }
  isLand(tx: number, ty: number) {
    return tx >= 0 && ty >= 0 && tx < this.s.map.w && ty < this.s.map.h && this.landArr[ty * this.s.map.w + tx] === 1;
  }
  hasRole(role: BuildingRole) {
    return this.s.buildings.some((b) => b.done && b.role === role);
  }
  byName(name: string | undefined): Villager | undefined {
    if (!name) return undefined;
    return this.s.villagers.find((v) => v.name === name) ?? this.s.villagers.find((v) => name.includes(v.name));
  }

  // ───────────── 記録 ─────────────
  addChronicle(text: string, kind: ChronicleEntry['kind']) {
    this.s.chronicle.push({ t: this.s.time, label: this.timeLabel, text, kind });
    if (this.s.chronicle.length > 500) this.s.chronicle.splice(0, this.s.chronicle.length - 500);
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
  say(v: Villager, text: string, dur = 4) {
    v.bubble = { text, until: this.s.time + dur };
  }
  remember(v: Villager, text: string) {
    if (!text) return;
    if (v.memories.slice(0, 4).some((m) => m.endsWith(`:${text}`))) return;
    v.memories.unshift(`${this.timeLabel}:${text}`);
    if (v.memories.length > 10) v.memories.length = 10;
  }
  relation(a: Villager, b: Villager) {
    return (a.relations[b.id] ??= { score: 0 });
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
  get center(): Pt {
    const b = this.s.buildings[0];
    return b ? { x: b.tx + 1, y: b.ty + 2 } : { x: this.s.map.w >> 1, y: this.s.map.h >> 1 };
  }

  // ───────────── メインループ ─────────────
  step(dt: number) {
    const s = this.s;
    s.time += dt;
    s.dayTime = (s.dayTime + dt) % DAY_LEN;
    const si = Math.floor(s.time / SEASON_LEN);
    if (si > s.seasonIndex) {
      s.seasonIndex = si;
      this.emit({ type: 'season', seasonIndex: si });
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
    this.updateConversations();
    for (const t of s.trees) if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
    for (const g of s.golds) if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
  }

  private slowUpdate(dt: number) {
    const s = this.s;
    const growth = (dt / 200) * this.natureMul * this.seasonGrowth;
    for (const t of s.trees) if (t.growth < 1) t.growth = Math.min(1, t.growth + growth);
    if (s.trees.length < 120 && rand() < dt * 0.02 * this.natureMul * this.seasonGrowth) this.spawnTree();
    const sheepCap = 8 + Math.floor(this.population / 3) * 2;
    if (s.sheep.length >= 2 && s.sheep.length < sheepCap && rand() < dt * 0.035 * this.natureMul * (this.season === 3 ? 0.4 : 1)) {
      const p = pick(s.sheep);
      const t = this.randomWalkableNear(tileOf(p.x), tileOf(p.y), 1);
      if (t) {
        s.sheep.push({ id: s.nextId++, x: cx(t.x), y: cx(t.y), path: [], timer: 2, anim: 'idle', facingLeft: rand() < 0.5, reservedBy: null });
        this.emit({ type: 'poof', x: cx(t.x), y: cx(t.y) });
      }
    }
    if (s.sheep.length < 2 && rand() < dt * 0.01) this.spawnWanderingSheep();
    if (s.golds.length < 3 + Math.floor(this.population / 8) && rand() < dt * 0.006 * this.natureMul) this.spawnGold();
    this.tryBirth(dt);
    this.assignHomes();
    if (!this.aiEnabled) this.habitRoles();
    this.buildTimer += dt;
    if (this.buildTimer > 3) {
      this.buildTimer = 0;
      if (!this.aiEnabled) this.habitProjects();
      this.planConstruction();
    }
    if (!this.raidActive && this.population >= 7 && s.time >= s.nextRaidAt) {
      this.startRaid();
      s.nextRaidAt = s.time + 60 * (15 + rand() * 12);
    }
    if (this.raidActive && s.raidEndAt !== null && s.time > s.raidEndAt) for (const r of s.raiders) r.fleeing = true;
    const gathering = s.villagers.filter((v) => v.task?.type === 'festival' && v.task.phase === 'act').length;
    if (gathering >= 3) this.addPoints(dt * 0.4 * gathering);
  }

  // ───────────── 生態系 ─────────────
  private freeTile(tx: number, ty: number) {
    if (!this.isLand(tx, ty) || this.occupied(tx, ty)) return false;
    for (const b of this.s.buildings) if (tx >= b.tx - 1 && tx <= b.tx + b.w && ty >= b.ty - b.h && ty <= b.ty + 2) return false;
    return true;
  }
  private landAround(tx: number, ty: number) {
    if (this.gridDirty) this.rebuildGrid();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !this.grid.ok(tx + dx, ty + dy)) return false;
    return true;
  }
  private spawnTree() {
    const s = this.s;
    const base = s.trees.length ? pick(s.trees) : null;
    for (let i = 0; i < 10; i++) {
      const tx = base ? base.tx + randInt(-3, 3) : randInt(2, s.map.w - 3);
      const ty = base ? base.ty + randInt(-3, 3) : randInt(2, s.map.h - 3);
      if (!this.freeTile(tx, ty) || !this.landAround(tx, ty)) continue;
      if (s.villagers.some((v) => tileOf(v.x) === tx && tileOf(v.y) === ty)) continue;
      s.trees.push({ id: s.nextId++, tx, ty, variant: randInt(1, 4), growth: 0.36, hits: 0, reservedBy: null, shake: 0 });
      this.markDirty();
      return;
    }
  }
  spawnGold(near?: Pt) {
    const s = this.s;
    const g0 = s.golds.length ? pick(s.golds) : null;
    const base = near ?? (g0 ? { x: g0.tx, y: g0.ty } : null);
    for (let i = 0; i < 20; i++) {
      const tx = base ? base.x + randInt(-3, 3) : randInt(2, s.map.w - 3);
      const ty = base ? base.y + randInt(-3, 3) : randInt(2, s.map.h - 3);
      if (!this.freeTile(tx, ty) || !this.landAround(tx, ty)) continue;
      if (s.villagers.some((v) => tileOf(v.x) === tx && tileOf(v.y) === ty)) continue;
      s.golds.push({ id: s.nextId++, tx, ty, variant: randInt(1, 6), amount: 6, reservedBy: null, shake: 0 });
      this.emit({ type: 'poof', x: cx(tx), y: cx(ty) });
      this.markDirty();
      return true;
    }
    return false;
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

  // ───────────── 人口(本能:つがい・子育て) ─────────────
  /** つがいの成立。AIが関係に「恋人」「夫婦」などとつけたとき、または強い好意が互いにあるとき */
  updatePartners() {
    const vs = this.s.villagers;
    for (const a of vs) if (a.partnerId !== null && !vs.some((x) => x.id === a.partnerId)) a.partnerId = null;
    const love = (r?: { label?: string; score: number }) => !!r && (/(恋|夫|妻|伴侶|婚|愛)/.test(r.label ?? '') || r.score >= 85);
    for (const a of vs) {
      if (a.partnerId !== null || a.role === 'child') continue;
      for (const b of vs) {
        if (b === a || b.partnerId !== null || b.role === 'child' || b.female === a.female) continue;
        if (love(a.relations[b.id]) && love(b.relations[a.id])) {
          a.partnerId = b.id;
          b.partnerId = a.id;
          this.addChronicle(`${a.name}と${b.name}は、ともに生きることを誓った。`, 'misc');
          this.addPoints(10, a.x, a.y - 60);
          break;
        }
      }
    }
  }

  private tryBirth(dt: number) {
    const s = this.s;
    if (Math.floor(s.time) % 5 === 0) this.updatePartners();
    if (this.population >= this.capacity || s.res.meat < 4) return;
    const couples = s.villagers.filter((v) => v.female && v.partnerId !== null && v.age < v.lifespan - 0.6 && v.role !== 'child');
    if (!couples.length) {
      const adults = s.villagers.filter((v) => v.role !== 'child');
      const f = adults.some((v) => v.female);
      const m = adults.some((v) => !v.female);
      if ((!f || !m) && rand() < dt * 0.004) this.immigrant(!f);
      if (!this.aiEnabled && f && m && rand() < dt * 0.01) {
        const fs = adults.filter((v) => v.female && v.partnerId === null);
        const ms = adults.filter((v) => !v.female && v.partnerId === null);
        if (fs.length && ms.length) {
          const a = pick(fs);
          const b = pick(ms);
          this.relation(a, b).score = 90;
          this.relation(b, a).score = 90;
        }
      }
      return;
    }
    const rate = 0.006 * (1 + 0.2 * s.upgrades.family);
    if (rand() > dt * rate * Math.min(2, couples.length)) return;
    const mom = pick(couples);
    const dad = s.villagers.find((v) => v.id === mom.partnerId);
    if (!dad) return;
    const home = s.buildings.find((b) => b.id === mom.homeId) ?? s.buildings.find((b) => b.done && b.role === 'home');
    const pos = home ? { x: cx(this.entryOf(home).x), y: cx(this.entryOf(home).y) } : { x: mom.x, y: mom.y };
    const baby = this.makeVillager({ female: rand() < 0.5, age: 0, x: pos.x, y: pos.y, parents: [dad.name, mom.name] });
    baby.homeId = home?.id ?? null;
    if (this.aiEnabled) baby.personality = '';
    s.villagers.push(baby);
    s.res.meat -= 4;
    s.stats.births++;
    this.addChronicle(`${dad.name}と${mom.name}のあいだに子が生まれた。`, 'birth');
    this.addPoints(15, pos.x, pos.y - 40);
    this.emit({ type: 'birth', id: baby.id });
    this.remember(mom, '子どもが生まれた');
    this.remember(dad, '子どもが生まれた');
  }

  private immigrant(female: boolean) {
    const shore = this.shoreTiles();
    if (!shore.length) return;
    const t = pick(shore);
    const v = this.makeVillager({ female, age: 1.1 + rand() * 1.5, x: cx(t.x), y: cx(t.y) });
    if (this.aiEnabled) v.personality = '';
    this.s.villagers.push(v);
    this.emit({ type: 'splash', x: v.x, y: v.y });
    this.addChronicle(`海の向こうから${v.name}が小舟でやってきた。`, 'misc');
  }

  private die(v: Villager) {
    const s = this.s;
    this.releaseTask(v);
    s.villagers = s.villagers.filter((x) => x !== v);
    for (const o of s.villagers) {
      if (o.partnerId === v.id) o.partnerId = null;
      const r = o.relations[v.id];
      if (r && r.score > 30) this.remember(o, `${v.name}が亡くなった`);
      delete o.relations[v.id];
    }
    s.stats.deaths++;
    const last = v.memories[0]?.split(':').slice(1).join(':');
    this.addChronicle(`${v.name}が${Math.floor(v.age)}歳で天に召された。${last ? `最後の記憶は「${last}」。` : ''}`, 'death');
    this.emit({ type: 'death', id: v.id, x: v.x, y: v.y });
  }

  private assignHomes() {
    const s = this.s;
    const homes = s.buildings.filter((b) => this.homeCapacity(b) > 0);
    const cap = new Map<number, number>();
    for (const h of homes) cap.set(h.id, this.homeCapacity(h));
    for (const v of s.villagers) if (v.homeId !== null && cap.has(v.homeId)) cap.set(v.homeId, cap.get(v.homeId)! - 1);
    for (const v of s.villagers) {
      if (v.homeId !== null && cap.has(v.homeId)) continue;
      const partner = s.villagers.find((x) => x.id === v.partnerId);
      const ph = partner?.homeId;
      const h = (ph != null && (cap.get(ph) ?? 0) > 0 ? homes.find((b) => b.id === ph) : undefined) ?? homes.find((b) => cap.get(b.id)! > 0);
      if (h) {
        v.homeId = h.id;
        cap.set(h.id, cap.get(h.id)! - 1);
      }
    }
  }

  /** AIがいないときだけ:見張りや鍛錬の場があれば守り手を立てる */
  private habitRoles() {
    const s = this.s;
    const warriors = s.villagers.filter((v) => v.role === 'warrior' || v.role === 'archer').length;
    if ((this.hasRole('training') || this.hasRole('watch')) && warriors < 2) {
      const c = s.villagers.find((v) => v.role === 'pawn' && v.age > 1.5);
      if (c && s.villagers.filter((v) => v.role === 'pawn').length > 5) this.setLook(c, 'warrior', '村を守ると決めた');
    }
  }

  setLook(v: Villager, role: 'pawn' | 'warrior' | 'archer' | 'monk', why?: string) {
    if (v.role === 'child' || v.role === role) return;
    this.releaseTask(v);
    v.role = role;
    v.maxHp = role === 'warrior' ? 40 : role === 'archer' ? 26 : 20;
    v.hp = v.maxHp;
    v.carrying = null;
    const label = { pawn: '村人', warrior: '戦士', archer: '弓使い', monk: '僧侶' }[role];
    this.addChronicle(`${v.name}は${label}として生きることにした。${why ? `(${why})` : ''}`, 'misc');
  }

  // ───────────── 建設 ─────────────
  canAfford(kind: BuildingKind) {
    const c = BUILDINGS[kind].cost;
    return (c.wood ?? 0) <= this.s.res.wood && (c.gold ?? 0) <= this.s.res.gold;
  }
  get sites() {
    return this.s.buildings.filter((b) => !b.done);
  }

  /** AIがいないときだけ:手狭になったら家を計画する */
  private habitProjects() {
    const s = this.s;
    if (s.projects.length || this.sites.length) return;
    if (this.population >= this.capacity - 1) {
      this.addProject({ name: `${s.buildings.filter((b) => b.kind === 'house').length + 1}番目の家`, kind: 'house', role: 'home', purpose: '家族が増えたので', proposer: '' });
    }
  }

  addProject(p: Omit<Project, 'id' | 'proposedAt'>) {
    const s = this.s;
    if (s.projects.length >= 4) return null;
    if (s.projects.some((x) => x.name === p.name) || s.buildings.some((b) => b.name === p.name)) return null;
    if (p.kind === 'castle' && (s.buildings.some((b) => b.kind === 'castle') || s.projects.some((x) => x.kind === 'castle'))) return null;
    const proj: Project = { ...p, id: s.nextId++, proposedAt: s.time };
    s.projects.push(proj);
    this.addChronicle(`${p.proposer ? `${p.proposer}の発案で、` : ''}「${p.name}」を建てる計画が持ち上がった。${p.purpose ? `(${p.purpose})` : ''}`, 'build');
    this.emit({ type: 'culture' });
    return proj;
  }

  private planConstruction() {
    const s = this.s;
    const maxSites = this.population >= 10 ? 2 : 1;
    if (this.sites.length >= maxSites) return;
    const proj = s.projects.find((p) => this.canAfford(p.kind));
    if (!proj) return;
    const spot = this.findSite(proj.kind);
    if (!spot) {
      if (s.time - proj.proposedAt > 600) s.projects = s.projects.filter((p) => p !== proj);
      return;
    }
    const def = BUILDINGS[proj.kind];
    for (const [k, v] of Object.entries(def.cost)) s.res[k as ResKind] -= v ?? 0;
    const b: Building = {
      id: s.nextId++,
      kind: proj.kind,
      variant: proj.kind === 'house' ? randInt(1, 3) : 1,
      name: proj.name,
      role: proj.role,
      purpose: proj.purpose,
      proposer: proj.proposer,
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
    s.projects = s.projects.filter((p) => p !== proj);
    const cleared = s.trees.filter((t) => t.tx >= b.tx && t.tx < b.tx + b.w && t.ty > b.ty - b.h && t.ty <= b.ty + 1);
    for (const t of cleared) this.emit({ type: 'poof', x: cx(t.tx), y: cx(t.ty), big: true });
    if (cleared.length) {
      s.trees = s.trees.filter((t) => !cleared.includes(t));
      s.res.wood += cleared.length * 2;
    }
    s.buildings.push(b);
    this.rebuildGrid();
    const inside = (x: number, y: number) => {
      const tx = tileOf(x);
      const ty = tileOf(y);
      return tx >= b.tx && tx < b.tx + b.w && ty > b.ty - b.h && ty <= b.ty;
    };
    for (const e of [...s.villagers, ...s.sheep]) {
      if (!inside(e.x, e.y)) continue;
      const out = this.nearestWalkable(tileOf(e.x), tileOf(e.y));
      if (out) {
        e.x = cx(out.x);
        e.y = cx(out.y);
        e.path = [];
      }
    }
    this.addChronicle(`「${b.name}」の建設が始まった。`, 'build');
    this.emit({ type: 'siteStart', id: b.id });
  }

  findSite(kind: BuildingKind): Pt | null {
    return this.findSiteInner(kind, false) ?? this.findSiteInner(kind, true);
  }
  private findSiteInner(kind: BuildingKind, allowTrees: boolean): Pt | null {
    const s = this.s;
    const def = BUILDINGS[kind];
    const center = this.center;
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
  private siteOk(tx: number, ty: number, w: number, h: number, allowTrees: boolean) {
    for (let y = ty - h; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + w; x++) if (!this.isLand(x, y)) return false;
    for (let y = ty - h + 1; y <= ty + 1; y++) for (let x = tx; x < tx + w; x++) if (!this.grid.ok(x, y) && !(allowTrees && this.treeAt(x, y))) return false;
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
    this.addChronicle(`「${b.name}」が完成した。`, 'build');
    this.addPoints(BUILDINGS[b.kind].points, cx(b.tx) + ((b.w - 1) * TILE) / 2, cx(b.ty) - 120);
    this.emit({ type: 'built', id: b.id });
    for (const v of s.villagers) if (v.task?.targetId === b.id) this.remember(v, `「${b.name}」を建て終えた`);
    if (b.kind === 'castle') {
      s.departed = true;
      this.addChronicle('壮麗な城がそびえ立った。この島の物語は、ひとつの区切りを迎えた。', 'stage');
    }
  }

  // ───────────── 村人 ─────────────
  workMul(v: Villager) {
    let m = 1 + 0.12 * this.s.upgrades.work;
    m *= 1 + 0.1 * Math.min(2, this.s.buildings.filter((b) => b.done && b.role === 'workshop').length);
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
      for (const list of [this.s.trees, this.s.sheep, this.s.golds] as { id: number; reservedBy: number | null }[][]) {
        const o = list.find((x) => x.id === t.targetId && x.reservedBy === v.id);
        if (o) o.reservedBy = null;
      }
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
    return (
      this.nearestBuilding(v, (b) => b.done && b.role === 'storage') ??
      this.nearestBuilding(v, (b) => b.done && (b.role === 'home' || b.kind === 'castle')) ??
      this.s.buildings[0] ??
      null
    );
  }
  homeOf(v: Villager) {
    return this.s.buildings.find((b) => b.id === v.homeId && b.done) ?? this.nearestBuilding(v, (b) => b.done && b.role === 'home') ?? this.s.buildings[0];
  }

  /** AIに考えてもらう必要がある村人 */
  needsThought(v: Villager) {
    if (v.thinking) return false;
    if (!v.named) return true;
    return !v.intention || v.intention.source === 'habit' || this.s.time >= v.intention.until;
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
      v.intention = null;
      this.addChronicle(`${v.name}が大人になった。`, 'misc');
      this.addPoints(5, v.x, v.y - 40);
    }
    if (v.bubble && s.time > v.bubble.until) v.bubble = null;
    if (v.attackCd > 0) v.attackCd -= dt;

    if (v.knockedOut > 0) {
      v.knockedOut -= dt;
      v.anim = 'down';
      if (v.knockedOut <= 0) {
        v.knockedOut = 0;
        v.hp = v.maxHp;
        this.remember(v, '盗賊に倒されたが、なんとか起き上がった');
      }
      return;
    }

    // 本能のメーター
    if (!v.hidden) v.energy = clamp(v.energy - dt / 115, 0, 1);
    else if (v.task?.type === 'sleep') v.energy = clamp(v.energy + dt / 20, 0, 1);
    v.hunger = clamp(v.hunger + dt / 330, 0, 1);
    if (v.task?.type !== 'chat') v.loneliness = clamp(v.loneliness + dt / 400, 0, 1);

    // 本能:危険から逃げる(守り手の姿を選んだ者は戦う)
    const fighter = v.role === 'warrior' || v.role === 'archer';
    if (this.raidActive) {
      if (fighter) {
        if (v.task?.type !== 'fight') {
          this.releaseTask(v);
          v.task = { type: 'fight', phase: 'go', timer: 0 };
        }
      } else if (v.role === 'monk') {
        if (v.task?.type !== 'heal' && v.task?.type !== 'hide') this.releaseTask(v);
      } else if (v.task?.type !== 'hide') {
        this.releaseTask(v);
        const b = this.nearestBuilding(v, (b) => b.done && b.kind !== 'tower');
        if (b && this.setTask(v, 'hide', [this.entryOf(b)], { targetId: b.id }) && rand() < 0.3) this.say(v, murmur(v, { night: false, raid: true }) ?? '', 2.5);
      }
    } else if (v.task?.type === 'fight' || v.task?.type === 'hide') {
      this.releaseTask(v);
    }
    // 本能:夜は眠る
    if (this.isNight && !this.raidActive && v.task?.type !== 'sleep' && v.task?.type !== 'chat') {
      if (!v.task || (v.task.type !== 'deliver' && v.task.type !== 'wander')) {
        this.releaseTask(v);
        this.goSleep(v);
      }
    }
    if (v.task?.type === 'sleep' && v.hidden && !this.isNight && v.energy > 0.9) this.releaseTask(v);

    if (!v.task) this.chooseTask(v);
    if (v.task) this.runTask(v, dt);

    // 心の声(AIの考え)をときどき口にする
    if (!v.hidden && s.time > v.nextMurmur) {
      v.nextMurmur = s.time + (v.mutters.length ? 14 + rand() * 18 : 30 + rand() * 50);
      if (!v.bubble) {
        const t = v.mutters.length ? v.mutters.shift()! : this.aiEnabled ? null : murmur(v, { night: this.isNight, raid: this.raidActive });
        if (t) this.say(v, t);
      }
    }
  }

  private goSleep(v: Villager) {
    const home =
      (v.role === 'monk' && this.nearestBuilding(v, (b) => b.done && b.role === 'worship')) ||
      this.s.buildings.find((b) => b.id === v.homeId && b.done) ||
      this.nearestBuilding(v, (b) => b.done && b.kind !== 'tower');
    if (!home || !this.setTask(v, 'sleep', [this.entryOf(home)], { targetId: home.id })) v.task = { type: 'wander', phase: 'act', timer: 0 };
  }

  /** 本能 → 会話の約束 → 意図(AI) → 習慣 の順に、次にすることを決める */
  private chooseTask(v: Villager) {
    const s = this.s;
    if (v.carrying) {
      this.deliver(v);
      return;
    }
    if (v.hunger > 0.7 && s.res.meat > 0) {
      const d = this.dropoffFor(v);
      if (d && this.setTask(v, 'eat', [this.entryOf(d)], { targetId: d.id })) return;
    }
    if (v.hunger > 0.85 && s.res.meat <= 0 && v.role !== 'child' && this.startAction(v, 'hunt')) return;
    if (v.energy < 0.12) {
      this.goSleep(v);
      if (v.task) return;
    }
    const conv = s.conversations.find((c) => !c.started && (c.a === v.id || c.b === v.id));
    if (conv && this.startConversation(v, conv)) return;

    if (v.intention && v.intention.source === 'ai' && s.time < v.intention.until) {
      if (this.startAction(v, v.intention.action, v.intention.target)) return;
      v.intention = { ...v.intention, until: s.time };
    }
    this.habit(v);
  }

  private habit(v: Villager) {
    const s = this.s;
    if (!v.intention || s.time >= v.intention.until || v.intention.source !== 'habit') {
      let action: Action = 'wander';
      if (v.role === 'child') action = 'play';
      else if (v.role === 'warrior' || v.role === 'archer') action = 'guard';
      else if (v.role === 'monk') action = this.hasRole('worship') ? 'pray' : 'wander';
      else {
        const opts: [Action, number][] = [
          ['chop', s.res.wood < 60 ? 1.4 : 0.4],
          ['hunt', s.res.meat < this.population * 3 ? 1.6 : 0.3],
          ['mine', s.golds.length ? (s.res.gold < 40 ? 1 : 0.3) : 0],
          ['build', this.sites.length || s.projects.length ? 2.2 : 0],
          ['repair', s.buildings.some((b) => b.done && b.hp < b.maxHp) ? 2 : 0],
          ['wander', 0.3],
          ['talk', v.loneliness > 0.6 ? 1 : 0.1],
        ];
        const skill = { wood: 'chop', meat: 'hunt', gold: 'mine', build: 'build' }[v.skill];
        for (const o of opts) if (o[0] === skill) o[1] *= 1.6;
        const total = opts.reduce((a, o) => a + o[1], 0);
        let r = rand() * total;
        for (const o of opts) {
          r -= o[1];
          if (r <= 0) {
            action = o[0];
            break;
          }
        }
      }
      v.intention = { action, thought: '', until: s.time + (this.aiEnabled ? 20 : 60 + rand() * 60), source: 'habit' };
    }
    if (!this.startAction(v, v.intention.action, v.intention.target)) {
      if (!this.startAction(v, 'wander')) v.task = { type: 'wander', phase: 'act', timer: 1 + rand() * 2 };
    }
  }

  /** 体でできる動作を、具体的な作業に落とし込む */
  startAction(v: Villager, action: Action, target?: string): boolean {
    const s = this.s;
    switch (action) {
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
      case 'hunt': {
        const cands = s.sheep.filter((x) => x.reservedBy === null);
        if (cands.length <= 2) return false;
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
      case 'build': {
        const builders = (id: number) => s.villagers.filter((x) => x.task?.targetId === id && x.task.type === 'build').length;
        const site = s.buildings.find((b) => !b.done && !!target && b.name === target && builders(b.id) < 5) ?? s.buildings.find((b) => !b.done && builders(b.id) < 5);
        if (site) return this.setTask(v, 'build', this.buildingGoals(site), { targetId: site.id });
        const proj = s.projects.find((p) => p.name === target) ?? s.projects[0];
        if (proj) {
          const c = BUILDINGS[proj.kind].cost;
          if ((c.gold ?? 0) > s.res.gold && this.startAction(v, 'mine')) return true;
          return this.startAction(v, 'chop');
        }
        return false;
      }
      case 'repair': {
        const b = s.buildings.find((x) => x.done && x.hp < x.maxHp);
        return !!b && this.setTask(v, 'repair', this.buildingGoals(b), { targetId: b.id });
      }
      case 'talk': {
        const partner = this.byName(target);
        const other = partner && partner !== v ? partner : s.villagers.find((x) => x !== v && !x.hidden && x.role !== 'child' && dist(x.x, x.y, v.x, v.y) < TILE * 8);
        if (!other) return false;
        const pair = (c: { a: number; b: number }) => (c.a === v.id && c.b === other.id) || (c.a === other.id && c.b === v.id);
        const already =
          s.pendingTalks.some(pair) ||
          s.conversations.some((c) => !c.started && (c.a === v.id || c.b === v.id)) ||
          s.conversations.some((c) => pair(c) && s.time - c.t < 240);
        if (!already) {
          if (this.aiEnabled) s.pendingTalks.push({ a: v.id, b: other.id, topic: v.intention?.thought ?? '' });
          else this.quickChat(v, other);
        }
        if (other.hidden) return false;
        return this.setTask(v, 'wander', this.adjacentGoals(tileOf(other.x), tileOf(other.y)));
      }
      case 'rest': {
        const home = this.homeOf(v);
        return !!home && this.setTask(v, 'sleep', [this.entryOf(home)], { targetId: home.id });
      }
      case 'explore': {
        const c = this.center;
        const far = this.shoreTiles().filter((p) => Math.hypot(p.x - c.x, p.y - c.y) > 8);
        const t = far.length ? pick(far) : null;
        return !!t && this.setTask(v, 'guard', [t], { targetId: -2 });
      }
      case 'guard': {
        const post = this.nearestBuilding(v, (b) => b.done && (b.role === 'watch' || b.role === 'training'));
        const t = post ? this.randomWalkableNear(post.tx + 1, post.ty + 2, 3) : this.randomWalkableNear(tileOf(v.x), tileOf(v.y), 5);
        return !!t && this.setTask(v, 'guard', [t]);
      }
      case 'gather': {
        const place = s.buildings.find((b) => b.done && !!target && b.name === target) ?? this.nearestBuilding(v, (b) => b.done && b.role === 'gathering');
        const p = place ? { x: place.tx + Math.floor(place.w / 2), y: place.ty + 2 } : this.center;
        const t = this.randomWalkableNear(p.x, p.y, 3);
        return !!t && this.setTask(v, 'festival', [t]);
      }
      case 'pray': {
        const place = this.nearestBuilding(v, (b) => b.done && b.role === 'worship');
        if (place) return this.setTask(v, 'pray', [this.entryOf(place)], { targetId: place.id });
        const t = this.randomWalkableNear(this.center.x, this.center.y, 4);
        return !!t && this.setTask(v, 'pray', [t], { targetId: -1 });
      }
      case 'play': {
        const home = this.homeOf(v);
        const t = home ? this.randomWalkableNear(home.tx + 1, home.ty + 1, 4) : null;
        return !!t && this.setTask(v, 'play', [t]);
      }
      case 'wander':
      default: {
        const t = this.randomWalkableNear(tileOf(v.x), tileOf(v.y), 4);
        return !!t && this.setTask(v, 'wander', [t]);
      }
    }
  }

  /** AIがいないときの、ありきたりな会話 */
  private quickChat(a: Villager, b: Villager) {
    const pair = pick(CHAT_PAIRS);
    this.addConversation(a, b, '', [
      { speaker: a.name, text: pair[0] },
      { speaker: b.name, text: pair[1] },
    ]);
    this.relation(a, b).score = clamp(this.relation(a, b).score + 5, -100, 100);
    this.relation(b, a).score = clamp(this.relation(b, a).score + 5, -100, 100);
  }

  addConversation(a: Villager, b: Villager, topic: string, lines: { speaker: string; text: string }[]) {
    const s = this.s;
    const c: Conversation = { id: s.nextId++, a: a.id, b: b.id, topic, lines, t: s.time, label: this.timeLabel, played: 0, started: false };
    s.conversations = s.conversations.filter((x) => x.started || !((x.a === a.id || x.b === a.id) && (x.a === b.id || x.b === b.id)));
    s.conversations.push(c);
    if (s.conversations.length > 60) s.conversations.splice(0, s.conversations.length - 60);
    s.stats.talks++;
    return c;
  }

  private startConversation(v: Villager, c: Conversation): boolean {
    const other = this.s.villagers.find((x) => x.id === (c.a === v.id ? c.b : c.a));
    if (!other) {
      c.started = true;
      c.played = c.lines.length;
      return false;
    }
    if (other.hidden || other.knockedOut > 0) return false;
    if (c.a === v.id) return this.setTask(v, 'chat', this.adjacentGoals(tileOf(other.x), tileOf(other.y)), { targetId: c.id });
    this.releaseTask(v);
    v.task = { type: 'chat', phase: 'act', timer: 0, targetId: c.id };
    return true;
  }

  private updateConversations() {
    const s = this.s;
    for (const c of s.conversations) {
      if (c.played >= c.lines.length) continue;
      if (!c.started && s.time - c.t > 150) {
        c.started = true;
        c.played = c.lines.length;
        continue;
      }
      if (!c.started) continue;
      const a = s.villagers.find((x) => x.id === c.a);
      const b = s.villagers.find((x) => x.id === c.b);
      if (!a || !b) {
        c.played = c.lines.length;
        continue;
      }
      const lineDur = 3.4;
      const idx = Math.floor((s.time - c.t) / lineDur);
      while (c.played <= idx && c.played < c.lines.length) {
        const line = c.lines[c.played];
        const sp = line.speaker === a.name ? a : line.speaker === b.name ? b : c.played % 2 === 0 ? a : b;
        sp.bubble = { text: line.text, until: s.time + lineDur + 0.4, talk: true };
        const other = sp === a ? b : a;
        sp.facingLeft = other.x < sp.x;
        c.played++;
        this.emit({ type: 'talkLine', convId: c.id });
      }
      if (c.played >= c.lines.length) {
        for (const v of [a, b]) {
          v.loneliness = 0;
          if (v.task?.type === 'chat') v.task = null;
          // 話したかったことは済んだので、次を考えてもらう
          if (v.intention?.action === 'talk') v.intention.until = s.time;
        }
        this.addPoints(3, (a.x + b.x) / 2, Math.min(a.y, b.y) - 70);
        this.emit({ type: 'talkEnd', convId: c.id });
      }
    }
  }

  private runTask(v: Villager, dt: number) {
    const s = this.s;
    const t = v.task!;
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
      const arrived = this.moveAlong(v, this.walkSpeed(v), dt);
      v.anim = v.carrying ? `run_${v.carrying}` : 'run';
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
        const mul = wm * (v.skill === 'build' ? 1.3 : 1);
        if (t.type === 'build') {
          b.progress += (dt * mul) / BUILDINGS[b.kind].work;
          if (b.progress >= 1) {
            this.completeBuilding(b);
            v.task = null;
          }
        } else b.hp = Math.min(b.maxHp, b.hp + dt * 6 * mul);
        if (t.timer > 25) {
          v.task = null;
          v.deeds++;
        }
        return;
      }
      case 'deliver':
        v.task = null;
        return;
      case 'eat':
        v.anim = 'idle';
        if (t.timer > 1.5) {
          if (s.res.meat > 0) {
            s.res.meat -= 1;
            v.hunger = 0;
          }
          this.releaseTask(v);
        }
        return;
      case 'sleep':
        v.anim = 'idle';
        if (!this.isNight && t.timer > 20 && v.energy > 0.8) this.releaseTask(v);
        return;
      case 'hide':
        v.anim = 'idle';
        return;
      case 'pray':
        v.anim = 'idle';
        if (t.timer > 8) {
          this.addPoints(t.targetId === -1 ? 1 : 3, v.x, v.y - 60);
          this.releaseTask(v);
        }
        return;
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
          this.remember(target, `${v.name}に手当てしてもらった`);
          this.relation(target, v).score = clamp(this.relation(target, v).score + 15, -100, 100);
          v.task = null;
        }
        return;
      }
      case 'chat': {
        v.anim = 'idle';
        const c = s.conversations.find((x) => x.id === t.targetId);
        if (!c || c.played >= c.lines.length || (!c.started && t.timer > 40)) {
          v.task = null;
          return;
        }
        const other = s.villagers.find((x) => x.id === (c.a === v.id ? c.b : c.a));
        if (other) v.facingLeft = other.x < v.x;
        return;
      }
      case 'festival':
        v.anim = Math.floor(t.timer * 2) % 3 === 0 ? 'run' : 'idle';
        if (t.timer > 6 + rand() * 4) v.task = null;
        return;
      case 'guard':
        v.anim = v.role === 'warrior' && t.timer > 1 && t.timer < 3 ? 'guard' : 'idle';
        if (t.timer > 6 + rand() * 4) {
          if (t.targetId === -2 && rand() < 0.25) this.discover(v);
          v.task = null;
        }
        return;
      case 'fight':
        this.runFight(v, dt);
        return;
      default:
        v.anim = 'idle';
        if (t.timer > 2 + rand() * 3) v.task = null;
    }
  }

  private discover(v: Villager) {
    const r = rand();
    if (r < 0.4 && this.spawnGold({ x: tileOf(v.x), y: tileOf(v.y) })) {
      this.remember(v, '島のはずれで金の鉱脈を見つけた');
      this.addChronicle(`${v.name}が島のはずれで金の鉱脈を見つけた。`, 'misc');
      this.say(v, '金だ!こんなところに!');
    } else if (r < 0.7) {
      this.s.sheep.push({ id: this.s.nextId++, x: v.x + 30, y: v.y, path: [], timer: 2, anim: 'idle', facingLeft: true, reservedBy: null });
      this.remember(v, '探検中にはぐれ羊を見つけて連れ帰った');
      this.say(v, '迷子の羊を見つけた!');
    } else this.remember(v, '島のはずれで海を眺めた。向こうに何があるのだろう');
    this.addPoints(4, v.x, v.y - 60);
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
    if ((t.type === 'sleep' || t.type === 'hide' || t.type === 'pray') && (t.targetId ?? -1) >= 0) {
      const b = s.buildings.find((x) => x.id === t.targetId);
      if (b) this.hideIn(v, b);
      return;
    }
    if (t.type === 'chat') {
      const c = s.conversations.find((x) => x.id === t.targetId);
      if (!c) {
        v.task = null;
        return;
      }
      const other = s.villagers.find((x) => x.id === (c.a === v.id ? c.b : c.a));
      if (other && !other.hidden && dist(v.x, v.y, other.x, other.y) < TILE * 2.5) {
        c.started = true;
        c.t = s.time;
        c.played = 0;
        if (other.task?.type !== 'chat') {
          this.releaseTask(other);
          other.task = { type: 'chat', phase: 'act', timer: 0, targetId: c.id };
        }
      } else v.task = null;
    }
  }

  private deliver(v: Villager) {
    const d = this.dropoffFor(v);
    if (!d || !this.setTask(v, 'deliver', [this.entryOf(d)])) {
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
        v.path = this.pathTo(v, this.adjacentGoals(tileOf(best.x), tileOf(best.y))) ?? [];
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
      if (!b.done || b.role !== 'watch' || (b.kind !== 'tower' && b.kind !== 'castle')) continue;
      b.attackCd -= dt;
      if (b.attackCd > 0) continue;
      const bx = cx(b.tx) + ((b.w - 1) * TILE) / 2;
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
    const c = this.center;
    const far = shore
      .map((p) => ({ p, d: Math.hypot(p.x - c.x, p.y - c.y) }))
      .sort((a, b) => b.d - a.d)
      .slice(0, Math.max(1, Math.floor(shore.length * 0.3)));
    const origin = pick(far).p;
    const count = Math.min(2 + Math.floor(this.population / 6) + Math.floor(this.year / 3), 9);
    for (let i = 0; i < count; i++) {
      const t = this.randomWalkableNear(origin.x, origin.y, 2) ?? origin;
      const hp = 22 + this.population + this.year * 2;
      s.raiders.push({ id: s.nextId++, x: cx(t.x), y: cx(t.y), path: [], hp, maxHp: hp, dmg: 3 + Math.floor(this.population / 8), targetKind: null, targetId: null, attackCd: 1 + rand(), anim: 'idle', facingLeft: false, repath: 0, fleeing: false });
      this.emit({ type: 'splash', x: cx(t.x), y: cx(t.y) });
    }
    s.raidEndAt = s.time + 150;
    this.addChronicle(`海から${count}人の盗賊団が上陸した!`, 'raid');
    for (const v of s.villagers) this.remember(v, '盗賊団が島に上陸した');
    this.emit({ type: 'raidStart' });
  }

  private endRaid(won: boolean) {
    const s = this.s;
    s.raidEndAt = null;
    if (won) {
      s.stats.raidsRepelled++;
      this.addChronicle('盗賊団を追い払った。', 'raid');
      for (const v of s.villagers) if (v.role === 'warrior' || v.role === 'archer') this.remember(v, '盗賊団と戦い、追い払った');
      this.addPoints(20);
    } else this.addChronicle('盗賊団は好き放題に暴れたあと、去っていった。', 'raid');
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
      r.path = this.pathTo(r, target.goals) ?? [];
    }
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
            const k = pick(['wood', 'meat', 'gold'] as ResKind[]);
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

  depart(): GameState {
    const ups = { ...this.s.upgrades };
    for (const k of Object.keys(ups) as UpgradeKey[]) ups[k] = Math.floor(ups[k] / 2);
    return Sim.newGame({ memories: this.s.memories + 1, islandNo: this.s.islandNo + 1, upgrades: ups });
  }

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
