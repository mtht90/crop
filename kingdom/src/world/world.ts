import { AnimatedSprite, Application, Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent } from 'pixi.js';
import { RIVALS, type BuildingId } from '../core/data';
import type { Battle, Game } from '../core/sim';
import type { Construction } from '../core/state';
import { Actor, FPS10, Pawn, Sheep, Soldier, type PawnJob, type PawnWorld, type UnitKind } from './actors';
import { strip, tex } from './assets';
import { Fx, goldChunks } from './fx';
import { Island, MAIN_ISLAND, RIVAL_FORTS, RIVAL_ISLANDS, T } from './island';

type P = { x: number; y: number };
const tp = (x: number, y: number): P => ({ x: x * T, y: y * T });

// 主島のレイアウト（タイル座標、足元）
const LAYOUT = {
  castle: tp(11.5, 4.75),
  mine: tp(18.4, 7.8),
  piles: { gold: tp(13.4, 6.2), wood: tp(9.5, 6.15), meat: tp(14.7, 6.35) },
  trees: [tp(1.4, 5.6), tp(2.9, 5.2), tp(1.0, 7.0), tp(2.4, 6.9), tp(3.8, 7.6), tp(1.9, 8.6), tp(3.3, 9.2), tp(2.7, 9.95), tp(0.9, 4.6)],
  meadow: { x: 11.2 * T, y: 8.7 * T, r: 1.2 * T },
  slots: {
    house: [tp(6.3, 8.3), tp(8.3, 8.45), tp(14.3, 8.5), tp(16.3, 9.5), tp(5.4, 10.4), tp(7.4, 10.6), tp(13.5, 10.5), tp(15.4, 11.1),
      tp(9.0, 11.7), tp(13.7, 12.3), tp(6.5, 11.95), tp(17.4, 11.0)],
    tower: [tp(1.5, 3.6), tp(20.5, 5.6), tp(3.7, 11.0), tp(19.7, 9.4)],
    barracks: [tp(4.3, 3.0)],
    archery: [tp(18.0, 3.3)],
    monastery: [tp(11.3, 12.75)],
    castle: [],
  } as Record<BuildingId, P[]>,
  castleTowers: [tp(8.2, 4.4), tp(14.9, 4.4), tp(8.9, 2.9), tp(14.1, 2.9)],
  bushes: [tp(5.4, 5.3), tp(17.4, 1.9), tp(20.6, 7.9), tp(1.3, 8.1), tp(6.2, 1.4), tp(10.2, 7.4), tp(16.6, 6.9)],
  rocks: [tp(4.6, 6.6), tp(17.2, 5.2), tp(8.6, 6.8), tp(20.6, 7.2), tp(3.0, 2.2)],
};

const BUILDING_ANCHOR: Record<string, number> = {
  castle: 0.97, house1: 0.9, house2: 0.9, house3: 0.9, tower: 0.9, barracks: 0.957, archery: 0.94, monastery: 0.97,
};
const STONE_ANCHOR = [0, 0.62, 0.64, 0.69, 0.72, 0.75, 0.77];
const VISIBLE_CAP: Record<PawnJob, number> = { miner: 10, lumberjack: 8, hunter: 6, builder: 6 };

export interface WorldCallbacks {
  onMineClick: (x: number, y: number) => void;
  onGolden: () => void;
  onDuck: () => void;
  sfx: (key: string, opts?: { vol?: number; rate?: number }) => void;
}

interface ConstructionView {
  c: Construction;
  spr: Sprite;
  mask: Graphics;
  pos: P;
  puff: number;
}

export class World implements PawnWorld {
  app = new Application();
  cam = new Container();
  layers = {
    sea: new Container(),
    foam: new Container(),
    ground: new Container(),
    high: new Container(),
    entities: new Container(),
    fx: new Container(),
    clouds: new Container(),
  };
  fx = new Fx();
  main!: Island;
  rivals = new Map<string, Island>();
  game: Game;
  cb: WorldCallbacks;

  private mine!: Container;
  private stone!: Sprite;
  private mineShine!: AnimatedSprite;
  private stoneTier = 0;
  private mineSquash = 0;
  private trees: { a: Actor; p: P; busy: number }[] = [];
  private pawns: Pawn[] = [];
  private sheep: Sheep[] = [];
  private placedViews = new Map<string, Sprite>();
  private castle!: Sprite;
  private castleTowers: Sprite[] = [];
  private cons = new Map<number, ConstructionView>();
  private forts = new Map<string, Sprite[]>();
  private guards = new Map<string, Soldier[]>();
  private golden: { id: number; spr: AnimatedSprite; glow: Sprite; t: number } | null = null;
  private duck: { spr: AnimatedSprite; t: number; dir: number; y0: number } | null = null;
  private clouds: Sprite[] = [];
  private battleScene: { c: Container; ours: Soldier[]; theirs: Soldier[]; b: Battle; t: number; arrows: { s: Sprite; vx: number; vy: number; life: number }[] } | null = null;
  private camTarget: { x: number; y: number; z: number } | null = null;
  private drag: { id: number; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
  private pinch: { d: number; z: number } | null = null;
  private pointers = new Map<number, P>();
  private time = 0;
  private deliveredAcc: Record<string, number> = { miner: 0, lumberjack: 0, hunter: 0 };
  insetRight = 0;
  insetBottom = 0;
  insetTop = 0;

  constructor(game: Game, cb: WorldCallbacks) {
    this.game = game;
    this.cb = cb;
  }

  async init(host: HTMLElement) {
    await this.app.init({
      resizeTo: host,
      background: '#47aba9',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    const L = this.layers;
    this.cam.addChild(L.sea, L.foam, L.ground, L.high, L.entities, L.fx, this.fx.layer, this.fx.top, L.clouds);
    L.entities.sortableChildren = true;
    this.app.stage.addChild(this.cam);

    this.main = new Island(MAIN_ISLAND);
    this.addIsland(this.main);
    for (const r of RIVALS) {
      const isl = new Island(RIVAL_ISLANDS[r.id]);
      this.rivals.set(r.id, isl);
      this.addIsland(isl);
    }
    this.buildStatic();
    this.buildRivals();
    this.buildSea();
    this.buildClouds();
    this.setupInput();
    this.syncAll();
    this.focusMain(true);
    this.app.ticker.add((t) => this.update(Math.min(0.05, t.deltaMS / 1000)));
    window.addEventListener('resize', () => this.focusMain(true));
  }

  private addIsland(isl: Island) {
    this.layers.foam.addChild(isl.foam);
    this.layers.ground.addChild(isl.ground);
    this.layers.high.addChild(isl.high);
  }

  private ent<T2 extends Container>(o: T2, x: number, y: number): T2 {
    o.position.set(x, y);
    o.zIndex = y;
    this.layers.entities.addChild(o);
    return o;
  }

  // ------------------------------------------------------------ static scenery
  private buildStatic() {
    // castle
    this.castle = this.ent(new Sprite(tex('buildings/blue/castle')), LAYOUT.castle.x, LAYOUT.castle.y);
    this.castle.anchor.set(0.5, BUILDING_ANCHOR.castle);
    // trees
    LAYOUT.trees.forEach((p, i) => {
      const n = (i % 4) + 1;
      const a = new Actor(`res/tree${n}`, n <= 2 ? 0.93 : 0.88, 192);
      a.spr.animationSpeed = FPS10 * 0.8;
      a.spr.gotoAndPlay(i % 6);
      a.spr.scale.set(0.85 + ((i * 37) % 10) / 50);
      this.ent(a, p.x, p.y);
      this.trees.push({ a, p, busy: 0 });
    });
    for (const [i, p] of LAYOUT.bushes.entries()) {
      const b = new AnimatedSprite(strip(`deco/bush${(i % 4) + 1}`));
      b.anchor.set(0.5, 0.62);
      b.animationSpeed = FPS10 * 0.7;
      b.gotoAndPlay(i % 8);
      b.scale.set(0.8);
      this.ent(b, p.x, p.y);
    }
    for (const [i, p] of LAYOUT.rocks.entries()) {
      const r = new Sprite(tex(`deco/rock${(i % 4) + 1}`));
      r.anchor.set(0.5, 0.75);
      this.ent(r, p.x, p.y);
    }
    // stockpiles
    for (const [k, p] of Object.entries(LAYOUT.piles)) {
      const s = new Sprite(tex(k === 'gold' ? 'res/gold' : `res/${k}`));
      s.anchor.set(0.5, k === 'gold' ? 0.58 : 0.7);
      s.scale.set(k === 'gold' ? 1.1 : 1.0);
      this.ent(s, p.x, p.y);
    }
    // gold mine (clickable)
    this.mine = this.ent(new Container(), LAYOUT.mine.x, LAYOUT.mine.y);
    this.stone = new Sprite(tex('res/goldstone3'));
    this.mine.addChild(this.stone);
    this.mine.eventMode = 'static';
    this.mine.cursor = 'pointer';
    this.mine.hitArea = new Rectangle(-62, -80, 124, 100);
    this.mineShine = new AnimatedSprite(strip('res/goldstone3_hl'));
    this.mineShine.loop = false;
    this.mineShine.animationSpeed = 0.4;
    this.mineShine.visible = false;
    this.mineShine.onComplete = () => (this.mineShine.visible = false);
    this.mine.addChild(this.mineShine);
    this.mine.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      const p = this.cam.toLocal(e.global);
      this.cb.onMineClick(p.x, p.y);
    });
    this.updateStoneTier();
    // sheep
    for (let i = 0; i < 3; i++) this.addSheep();
  }

  private addSheep() {
    const m = LAYOUT.meadow;
    const s = new Sheep(m);
    this.ent(s, m.x + (Math.random() - 0.5) * m.r, m.y + (Math.random() - 0.5) * m.r * 0.5);
    this.sheep.push(s);
  }

  private buildRivals() {
    for (const r of RIVALS) {
      const isl = this.rivals.get(r.id)!;
      const sprites: Sprite[] = [];
      RIVAL_FORTS.forEach((f) => {
        const [ox, oy] = isl.px(0, 0);
        const s = this.ent(new Sprite(tex(`buildings/${r.color}/${f.sprite}`)), ox + f.x * T, oy + f.y * T);
        s.anchor.set(0.5, BUILDING_ANCHOR[f.sprite]);
        if (f.sprite === 'castle') s.scale.set(0.8);
        sprites.push(s);
      });
      this.forts.set(r.id, sprites);
      const guards: Soldier[] = [];
      const [ox, oy] = isl.px(0, 0);
      const spots = [[3.6, 5.0], [6.6, 5.2], [5.0, 6.0], [7.6, 4.5], [4.2, 4.6]];
      spots.forEach(([x, y], i) => {
        const kind: UnitKind = (['warrior', 'archer', 'lancer', 'warrior', 'archer'] as UnitKind[])[i];
        const g = this.ent(new Soldier(kind, r.color), ox + x * T, oy + y * T);
        g.face(-1);
        guards.push(g);
      });
      this.guards.set(r.id, guards);
    }
  }

  private buildSea() {
    // animated rocks in the water around the islands
    const spots = [[-1.5, 3.2], [23.0, 1.0], [23.4, 9.5], [-0.8, 11.0], [5.0, 13.6], [17.5, 13.0], [11.0, -1.0], [-2.5, 7.5], [24.5, 5.5],
      [2.0, -0.8], [20.2, -0.6], [-6.0, 0.5], [30, 10], [14, 16], [0, 16.5], [-10, 11], [22, -6], [33, 0]];
    spots.forEach(([x, y], i) => {
      const a = new AnimatedSprite(strip(`deco/waterrock${(i % 4) + 1}`));
      a.anchor.set(0.5);
      a.animationSpeed = FPS10;
      a.gotoAndPlay(i % 16);
      a.position.set(x * T, y * T);
      a.scale.set(1.2);
      this.layers.sea.addChild(a);
    });
  }

  private buildClouds() {
    for (let i = 0; i < 6; i++) {
      const c = new Sprite(tex(`deco/cloud${(i % 8) + 1}`));
      c.anchor.set(0.5);
      c.alpha = 0.92;
      c.position.set(-1200 + i * 650 + Math.random() * 300, -700 + Math.random() * 2400);
      this.layers.clouds.addChild(c);
      this.clouds.push(c);
    }
  }

  // ------------------------------------------------------------ PawnWorld
  workSpot(job: PawnJob, pawn: Pawn) {
    if (job === 'miner') {
      const i = this.pawns.filter((p) => p.job === 'miner').indexOf(pawn);
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      return { x: LAYOUT.mine.x + side * (78 + (row % 2) * 22), y: LAYOUT.mine.y - 18 + row * 13, face: -side };
    }
    if (job === 'lumberjack') {
      const free = this.trees.filter((t) => t.busy < 2);
      const t = free[(Math.random() * free.length) | 0] ?? this.trees[0];
      t.busy++;
      const side = Math.random() < 0.5 ? -1 : 1;
      return { x: t.p.x + side * 52, y: t.p.y + 4, face: -side, target: t };
    }
    if (job === 'hunter') {
      const s = this.sheep[(Math.random() * this.sheep.length) | 0];
      return { x: s.x - 46, y: s.y + 2, face: 1, target: s };
    }
    // builder
    const sites = [...this.cons.values()];
    if (sites.length) {
      const v = sites[(Math.random() * sites.length) | 0];
      const side = Math.random() < 0.5 ? -1 : 1;
      return { x: v.pos.x + side * (50 + Math.random() * 30), y: v.pos.y + 8, face: -side };
    }
    const placed = [...this.placedViews.values()];
    if (placed.length && Math.random() < 0.7) {
      const s = placed[(Math.random() * placed.length) | 0];
      const side = Math.random() < 0.5 ? -1 : 1;
      return { x: s.x + side * 48, y: s.y + 6, face: -side };
    }
    return null;
  }

  dropSpot(job: PawnJob) {
    return job === 'miner' ? LAYOUT.piles.gold : job === 'lumberjack' ? LAYOUT.piles.wood : LAYOUT.piles.meat;
  }

  delivered(job: PawnJob, x: number, y: number) {
    if (job === 'builder') return;
    const n = this.game.s.jobs[job];
    const vis = Math.max(1, Math.min(n, VISIBLE_CAP[job]));
    const cycle = job === 'miner' ? 6 : job === 'lumberjack' ? 8 : 7;
    const v = this.game.d.jobRate[job] * cycle * (n / vis) * (this.game.frenzy ? 7 : 1);
    this.deliveredAcc[job] += 1;
    if (this.deliveredAcc[job] % Math.max(1, Math.ceil(vis / 4)) === 0) {
      this.fx.float(x, y - 70, '+' + fmtShort(v), job === 'miner' ? 'small' : job === 'lumberjack' ? 'wood' : 'meat', 0.9);
    }
    if (job === 'lumberjack') {
      for (const t of this.trees) t.busy = Math.max(0, t.busy - 0.5);
    }
  }

  wander() {
    return { x: (9.4 + Math.random() * 5) * T, y: (6.4 + Math.random() * 1.6) * T };
  }

  // ------------------------------------------------------------ sync with game state
  syncAll() {
    this.syncPawns();
    this.syncBuildings();
    this.syncForts(false);
    this.updateStoneTier();
  }

  syncPawns() {
    const s = this.game.s;
    for (const job of ['miner', 'lumberjack', 'hunter', 'builder'] as PawnJob[]) {
      const want = Math.min(VISIBLE_CAP[job], s.jobs[job]);
      const have = this.pawns.filter((p) => p.job === job);
      for (let i = have.length; i < want; i++) {
        const p = new Pawn(job, this);
        const d = this.dropSpot(job === 'builder' ? 'miner' : job);
        this.ent(p, d.x + (Math.random() - 0.5) * 80, d.y + 20 + Math.random() * 30);
        this.fx.oneShot('fx/dust_01', p.x, p.y - 10, 1, 0.35, this.layers.fx);
        this.pawns.push(p);
      }
      for (let i = want; i < have.length; i++) {
        const p = have[i];
        this.pawns.splice(this.pawns.indexOf(p), 1);
        p.destroy();
      }
    }
    const wantSheep = Math.min(9, 3 + Math.floor(s.jobs.hunter / 2));
    while (this.sheep.length < wantSheep) this.addSheep();
  }

  syncBuildings() {
    const s = this.game.s;
    // placed buildings
    const keep = new Set<string>();
    for (const p of s.placed) {
      const key = `${p.building}:${p.slot}`;
      keep.add(key);
      if (this.placedViews.has(key)) continue;
      const pos = LAYOUT.slots[p.building][p.slot];
      if (!pos) continue;
      const spriteName = p.building === 'house' ? `house${(p.variant % 3) + 1}` : p.building;
      const spr = this.ent(new Sprite(tex(`buildings/blue/${spriteName}`)), pos.x, pos.y);
      spr.anchor.set(0.5, BUILDING_ANCHOR[spriteName]);
      if (p.building === 'monastery') spr.scale.set(0.9);
      this.placedViews.set(key, spr);
    }
    for (const [k, v] of this.placedViews) {
      if (!keep.has(k)) {
        v.destroy();
        this.placedViews.delete(k);
      }
    }
    // castle level: scale + towers on the plateau
    const lvl = s.buildings.castle;
    this.castle.scale.set(1 + lvl * 0.05);
    for (let i = 0; i < 4; i++) {
      const want = lvl >= i + 2;
      if (want && !this.castleTowers[i]) {
        const p = LAYOUT.castleTowers[i];
        const t = this.ent(new Sprite(tex('buildings/blue/tower')), p.x, p.y);
        t.anchor.set(0.5, 0.9);
        t.scale.set(0.72);
        this.castleTowers[i] = t;
      } else if (!want && this.castleTowers[i]) {
        this.castleTowers[i].destroy();
        delete this.castleTowers[i];
      }
    }
    // constructions
    const live = new Set(s.constructions.map((c) => c.id));
    for (const c of s.constructions) if (!this.cons.has(c.id)) this.addConstruction(c);
    for (const [id, v] of this.cons) {
      if (!live.has(id)) {
        v.spr.destroy();
        v.mask.destroy();
        this.cons.delete(id);
      }
    }
  }

  private addConstruction(c: Construction) {
    let pos: P;
    let name: string;
    if (c.building === 'castle') {
      pos = { x: LAYOUT.castle.x, y: LAYOUT.castle.y + 2 };
      name = 'castle';
    } else {
      pos = LAYOUT.slots[c.building][c.slot];
      name = c.building === 'house' ? `house${((c.slot * 7 + 3) % 3) + 1}` : c.building;
    }
    const spr = this.ent(new Sprite(tex(`buildings/blue/${name}`)), pos.x, pos.y);
    spr.anchor.set(0.5, BUILDING_ANCHOR[name]);
    if (c.building === 'castle') {
      spr.scale.set(1 + (this.game.s.buildings.castle + 1) * 0.05);
      spr.zIndex = pos.y + 1;
    }
    const mask = new Graphics();
    this.layers.entities.addChild(mask);
    spr.mask = mask;
    spr.tint = 0xd8c8a8;
    this.cons.set(c.id, { c, spr, mask, pos, puff: 0 });
    this.fx.oneShot('fx/dust_02', pos.x, pos.y - 10, 1.4, 0.3, this.layers.fx);
  }

  onBuildDone(c: Construction) {
    this.syncBuildings();
    const pos = c.building === 'castle' ? LAYOUT.castle : LAYOUT.slots[c.building][c.slot];
    if (!pos) return;
    for (let i = 0; i < 4; i++) {
      this.fx.oneShot('fx/dust_02', pos.x + (i - 1.5) * 40, pos.y - 10 - (i % 2) * 20, 1.2, 0.3, this.layers.fx);
    }
    const key = `${c.building}:${c.slot}`;
    const spr = c.building === 'castle' ? this.castle : this.placedViews.get(key);
    if (spr) this.bounce(spr);
  }

  private bounces: { s: Container; t: number; base: number }[] = [];
  private bounce(s: Container) {
    this.bounces.push({ s, t: 0, base: s.scale.y });
  }

  updateStoneTier() {
    const n = ['click_1', 'click_2', 'click_3', 'click_4', 'click_5'].filter((id) => this.game.hasResearch(id)).length;
    const tier = [3, 4, 4, 5, 5, 6][n];
    if (tier === this.stoneTier) return;
    this.stoneTier = tier;
    this.stone.texture = tex(`res/goldstone${tier}`);
    this.stone.anchor.set(0.5, STONE_ANCHOR[tier]);
    this.mine.scale.set(1.7);
    this.mineShine.textures = strip(`res/goldstone${tier}_hl`);
    this.mineShine.anchor.set(0.5, STONE_ANCHOR[tier]);
  }

  syncForts(animate: boolean, rivalId?: string) {
    for (const r of RIVALS) {
      const n = this.game.s.forts[r.id];
      const sprites = this.forts.get(r.id)!;
      sprites.forEach((s, i) => {
        const owned = i < n;
        const key = `buildings/${owned ? 'blue' : r.color}/${RIVAL_FORTS[i].sprite}`;
        if (s.texture !== tex(key)) {
          s.texture = tex(key);
          if (animate && r.id === rivalId) {
            this.fx.oneShot('fx/explosion_02', s.x, s.y - 60, 1.3, 0.35, this.layers.fx);
            this.bounce(s);
          }
        }
      });
      const guards = this.guards.get(r.id)!;
      guards.forEach((g, i) => (g.visible = i >= n));
    }
  }

  // ------------------------------------------------------------ click feedback
  mineHit(crit: boolean, auto: boolean, text: string) {
    const top = this.mine.y - 60 * this.mine.scale.y;
    this.mineSquash = auto ? 0.5 : 1;
    if (!auto || Math.random() < 0.3) {
      this.mineShine.visible = true;
      this.mineShine.gotoAndPlay(0);
    }
    this.fx.burst(this.mine.x, top + 30, auto ? 1 : crit ? 10 : 3, goldChunks(), crit ? 1.3 : 1);
    if (!auto || Math.random() < 0.4) {
      this.fx.float(this.mine.x + (auto ? 40 : 0), top - 10, (crit ? '会心！ +' : '+') + text, crit ? 'crit' : 'gold', auto ? 0.7 : 1);
    }
    if (crit) this.fx.oneShot('fx/dust_02', this.mine.x + (Math.random() - 0.5) * 50, this.mine.y - 12, 0.9, 0.4, this.layers.fx);
    else if (!auto) this.fx.oneShot('fx/dust_01', this.mine.x + (Math.random() - 0.5) * 60, this.mine.y - 20, 1.0, 0.4, this.layers.fx);
  }

  /** 金鉱石のスクリーン座標（UIの熱気ゲージ配置用） */
  mineScreen(): P {
    const p = this.cam.toGlobal({ x: this.mine.x, y: this.mine.y + 26 });
    return { x: p.x, y: p.y };
  }

  // ------------------------------------------------------------ golden & duck
  spawnGolden(id: number, rx: number, ry: number) {
    this.removeGolden();
    // pick a land tile on main island, away from the plateau
    let x = 0, y = 0;
    for (let i = 0; i < 40; i++) {
      const tx = Math.floor(2 + rx * 18 + i * 3.7) % 20 + 1;
      const ty = 6 + (Math.floor(ry * 5 + i * 1.3) % 5);
      if (this.main.land(tx, ty) && !this.main.isHigh(tx, ty) && this.main.land(tx, ty + 1)) {
        x = (tx + 0.5) * T;
        y = (ty + 0.6) * T;
        break;
      }
    }
    const glow = new Sprite(tex('res/gold'));
    glow.anchor.set(0.5);
    glow.tint = 0xfff2a0;
    glow.alpha = 0.6;
    glow.scale.set(2.2);
    glow.blendMode = 'add';
    const spr = new AnimatedSprite(strip('res/gold_hl'));
    spr.anchor.set(0.5, 0.6);
    spr.animationSpeed = 0.25;
    spr.play();
    spr.scale.set(1.8);
    const c = this.ent(new Container(), x, y);
    c.addChild(glow, spr);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.hitArea = new Rectangle(-60, -80, 120, 110);
    c.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.cb.onGolden();
    });
    this.golden = { id, spr, glow, t: 0 };
    this.fx.oneShot('fx/dust_02', x, y, 1.2, 0.3, this.layers.fx);
  }
  collectGoldenFx(text: string) {
    if (!this.golden) return;
    const c = this.golden.spr.parent!;
    this.fx.burst(c.x, c.y - 30, 16, goldChunks(), 1.4);
    this.fx.float(c.x, c.y - 90, text, 'crit', 1);
    this.fx.oneShot('fx/explosion_01', c.x, c.y - 30, 1, 0.35, this.layers.fx);
    this.removeGolden();
  }
  removeGolden() {
    if (!this.golden) return;
    this.golden.spr.parent?.destroy({ children: true });
    this.golden = null;
  }

  spawnDuck() {
    if (this.duck) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y0 = (13.4 + Math.random() * 0.8) * T;
    const spr = new AnimatedSprite(strip('deco/duck', 32));
    spr.animationSpeed = 0.08;
    spr.play();
    spr.anchor.set(0.5);
    spr.scale.set(1.6 * dir, 1.6);
    spr.position.set(dir > 0 ? -3 * T : 25 * T, y0);
    spr.eventMode = 'static';
    spr.cursor = 'pointer';
    spr.hitArea = new Rectangle(-24, -24, 48, 48);
    spr.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (!this.duck) return;
      this.fx.oneShot('fx/water_splash', spr.x, spr.y, 1, 0.35, this.layers.fx);
      this.fx.float(spr.x, spr.y - 50, 'ぐわっ！', 'crit', 0.9);
      this.cb.onDuck();
      spr.destroy();
      this.duck = null;
    });
    this.layers.fx.addChild(spr);
    this.duck = { spr, t: 0, dir, y0 };
  }

  // ------------------------------------------------------------ battle
  startBattle(b: Battle) {
    const isl = this.rivals.get(b.rival.id)!;
    this.focusRival(b.rival.id);
    const c = new Container();
    const [ox, oy] = isl.px(0, 0);
    const ours: Soldier[] = [];
    const s = this.game.s.units;
    const total = s.warrior + s.lancer + s.archer + s.monk;
    const kinds: UnitKind[] = [];
    const n = Math.min(8, Math.max(2, Math.ceil(total / 5)));
    for (const k of ['warrior', 'lancer', 'archer', 'monk'] as UnitKind[]) {
      const share = total ? Math.round((s[k] / total) * n) : 0;
      for (let i = 0; i < share && kinds.length < n; i++) kinds.push(k);
    }
    if (!kinds.length) kinds.push('warrior');
    kinds.forEach((k, i) => {
      const u = new Soldier(k, 'blue');
      const row = i % 3;
      this.ent(u, ox + (0.4 + Math.floor(i / 3) * 0.6) * T, oy + (4.2 + row * 0.8) * T);
      u.anim('run');
      u.face(1);
      this.fx.oneShot('fx/water_splash', u.x, u.y - 10, 0.8, 0.35, this.layers.fx);
      ours.push(u);
    });
    const theirs: Soldier[] = [];
    const ek: UnitKind[] = ['warrior', 'warrior', 'lancer', 'archer', 'warrior', 'archer'];
    ek.slice(0, 3 + b.fort).forEach((k, i) => {
      const u = new Soldier(k, b.rival.color);
      const row = i % 3;
      this.ent(u, ox + (9.4 - Math.floor(i / 3) * 0.6) * T, oy + (4.2 + row * 0.8) * T);
      u.anim('run');
      u.face(-1);
      theirs.push(u);
    });
    this.layers.entities.addChild(c);
    this.battleScene = { c, ours, theirs, b, t: 0, arrows: [] };
    this.cb.sfx('unsheathe');
  }

  private updateBattle(dt: number) {
    const sc = this.battleScene;
    if (!sc) return;
    sc.t += dt;
    const isl = this.rivals.get(sc.b.rival.id)!;
    const [ox] = isl.px(0, 0);
    const meetX = ox + 5 * T;
    const all = [...sc.ours, ...sc.theirs];
    const end = sc.b.duration;
    for (const u of all) {
      if (!u.visible) continue;
      const ourSide = sc.ours.includes(u);
      const ranged = u.kind === 'archer' || u.kind === 'monk';
      const stop = meetX + (ourSide ? -1 : 1) * (ranged ? 2.4 * T : 0.45 * T + (u.y % 20));
      if (sc.t < end - 0.6) {
        const arrived = u.moveTo(stop, u.y, 120, dt);
        if (arrived) {
          u.face(ourSide ? 1 : -1);
          u.anim('attack');
          if (u.kind === 'archer' && Math.random() < dt * 0.9) this.shootArrow(u, ourSide);
          if (u.kind !== 'archer' && u.kind !== 'monk' && Math.random() < dt * 0.7) {
            this.cb.sfx(Math.random() < 0.5 ? 'clash' : `swing${1 + ((Math.random() * 3) | 0)}`, { vol: 0.5, rate: 0.9 + Math.random() * 0.2 });
            if (Math.random() < 0.4) this.fx.oneShot('fx/dust_01', u.x + (ourSide ? 30 : -30), u.y - 10, 0.9, 0.4, this.layers.fx);
          }
        } else u.anim('run');
      }
    }
    // resolution
    if (sc.t >= end - 0.6 && !(sc as { resolved?: boolean }).resolved) {
      (sc as { resolved?: boolean }).resolved = true;
      const losers = sc.b.win ? sc.theirs : sc.ours;
      for (const u of losers) {
        this.fx.oneShot('fx/explosion_01', u.x, u.y - 30, 0.8, 0.4, this.layers.fx);
        u.visible = false;
      }
      const winners = sc.b.win ? sc.ours : sc.theirs;
      for (const u of winners) u.anim('idle');
    }
    for (let i = sc.arrows.length - 1; i >= 0; i--) {
      const a = sc.arrows[i];
      a.life -= dt;
      a.vy += 500 * dt;
      a.s.x += a.vx * dt;
      a.s.y += a.vy * dt;
      a.s.rotation = Math.atan2(a.vy, a.vx);
      if (a.life <= 0) {
        a.s.destroy();
        sc.arrows.splice(i, 1);
      }
    }
  }

  private shootArrow(u: Soldier, ourSide: boolean) {
    const sc = this.battleScene!;
    const s = new Sprite(tex(`units/${u.color}/archer_arrow`));
    s.anchor.set(0.5);
    s.scale.set(0.8);
    s.position.set(u.x, u.y - 50);
    this.layers.fx.addChild(s);
    const vx = (ourSide ? 1 : -1) * (380 + Math.random() * 80);
    sc.arrows.push({ s, vx, vy: -260, life: 1.0 });
    this.cb.sfx('bow', { vol: 0.4, rate: 0.95 + Math.random() * 0.1 });
  }

  endBattle(b: Battle) {
    this.syncForts(true, b.rival.id);
    const sc = this.battleScene;
    setTimeout(() => {
      if (sc && this.battleScene === sc) {
        for (const u of [...sc.ours, ...sc.theirs]) u.destroy();
        for (const a of sc.arrows) a.s.destroy();
        sc.c.destroy();
        this.battleScene = null;
      }
    }, 2500);
  }

  clearBattle() {
    if (!this.battleScene) return;
    for (const u of [...this.battleScene.ours, ...this.battleScene.theirs]) u.destroy();
    this.battleScene.c.destroy();
    this.battleScene = null;
  }

  /** 王位継承などで状態が丸ごと変わったとき */
  resetViews() {
    for (const v of this.placedViews.values()) v.destroy();
    this.placedViews.clear();
    for (const v of this.cons.values()) { v.spr.destroy(); v.mask.destroy(); }
    this.cons.clear();
    for (const p of this.pawns) p.destroy();
    this.pawns = [];
    for (const t of this.castleTowers) t?.destroy();
    this.castleTowers = [];
    this.removeGolden();
    this.clearBattle();
    this.stoneTier = 0;
    this.syncAll();
    this.syncForts(false);
  }

  // ------------------------------------------------------------ camera
  private viewSize() {
    const w = this.app.screen.width - this.insetRight;
    const h = this.app.screen.height - this.insetBottom - this.insetTop;
    return { w: Math.max(200, w), h: Math.max(200, h) };
  }
  private fit(bx: number, by: number, bw: number, bh: number, pad = 1.1) {
    const v = this.viewSize();
    const z = Math.min(v.w / (bw * pad), v.h / (bh * pad));
    return { x: bx + bw / 2, y: by + bh / 2, z: Math.min(1.25, Math.max(0.22, z)) };
  }
  focusMain(instant = false) {
    const b = this.main.bounds;
    const narrow = this.viewSize().w < 600;
    // 縦長の画面では、城・町・金鉱石が収まる範囲に寄せる
    const f = narrow ? this.fit(5 * T, 1 * T, 16.5 * T, 12 * T, 1.0) : this.fit(b.x, b.y - 40, b.w, b.h + 40, 1.04);
    this.setCam(f, instant);
  }
  focusRival(id: string, instant = false) {
    const b = this.rivals.get(id)!.bounds;
    const f = this.fit(b.x, b.y - 60, b.w, b.h + 60, 1.3);
    this.setCam(f, instant);
  }
  focusWorld() {
    const f = this.fit(-14 * T, -11 * T, 51 * T, 35 * T, 1.0);
    this.setCam(f, false);
  }
  private setCam(f: { x: number; y: number; z: number }, instant: boolean) {
    if (instant) {
      this.camTarget = null;
      this.applyCam(f.x, f.y, f.z);
    } else this.camTarget = f;
  }
  private camState() {
    const v = this.viewSize();
    const z = this.cam.scale.x;
    return { x: (v.w / 2 - this.cam.x) / z, y: (v.h / 2 + this.insetTop - this.cam.y) / z, z };
  }
  private applyCam(x: number, y: number, z: number) {
    const v = this.viewSize();
    z = Math.min(1.8, Math.max(0.22, z));
    // clamp to world bounds
    x = Math.min(38 * T, Math.max(-16 * T, x));
    y = Math.min(25 * T, Math.max(-12 * T, y));
    this.cam.scale.set(z);
    this.cam.position.set(v.w / 2 - x * z, v.h / 2 + this.insetTop - y * z);
  }

  private setupInput() {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.scale.x };
        this.drag = null;
      } else {
        this.drag = { id: e.pointerId, sx: e.global.x, sy: e.global.y, cx: this.cam.x, cy: this.cam.y, moved: false };
      }
      this.camTarget = null;
    });
    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.zoomAt(mid.x, mid.y, (this.pinch.z * d) / this.pinch.d);
        return;
      }
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = e.global.x - this.drag.sx;
        const dy = e.global.y - this.drag.sy;
        if (Math.hypot(dx, dy) > 6) this.drag.moved = true;
        if (this.drag.moved) {
          this.cam.position.set(this.drag.cx + dx, this.drag.cy + dy);
          const c = this.camState();
          this.applyCam(c.x, c.y, c.z);
        }
      }
    });
    const up = (e: FederatedPointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    stage.on('pointerup', up);
    stage.on('pointerupoutside', up);
    this.app.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.app.canvas.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.cam.scale.x * Math.pow(1.0015, -e.deltaY));
    }, { passive: false });
  }

  private zoomAt(sx: number, sy: number, z: number) {
    z = Math.min(1.8, Math.max(0.22, z));
    const wx = (sx - this.cam.x) / this.cam.scale.x;
    const wy = (sy - this.cam.y) / this.cam.scale.y;
    this.cam.scale.set(z);
    this.cam.position.set(sx - wx * z, sy - wy * z);
    this.camTarget = null;
  }

  // ------------------------------------------------------------ frame
  update(dt: number) {
    this.time += dt;
    // camera tween
    if (this.camTarget) {
      const c = this.camState();
      const k = 1 - Math.pow(0.002, dt);
      const nx = c.x + (this.camTarget.x - c.x) * k;
      const ny = c.y + (this.camTarget.y - c.y) * k;
      const nz = c.z + (this.camTarget.z - c.z) * k;
      this.applyCam(nx, ny, nz);
      if (Math.abs(nx - this.camTarget.x) < 1 && Math.abs(nz - this.camTarget.z) < 0.002) this.camTarget = null;
    }
    for (const p of this.pawns) {
      p.update(dt);
      p.zIndex = p.y;
    }
    for (const s of this.sheep) {
      s.update(dt);
      s.zIndex = s.y;
    }
    // mine squash
    if (this.mineSquash > 0) {
      this.mineSquash = Math.max(0, this.mineSquash - dt * 7);
      const k = Math.sin(this.mineSquash * Math.PI) * 0.09;
      this.mine.scale.set(1.7 * (1 + k), 1.7 * (1 - k));
    }
    // constructions
    for (const v of this.cons.values()) {
      const h = v.spr.height;
      const top = v.pos.y - h * v.spr.anchor.y;
      const shown = h * Math.min(1, Math.max(0.04, v.c.progress));
      v.mask.clear().rect(v.pos.x - v.spr.width / 2 - 4, top + h - shown, v.spr.width + 8, shown).fill(0xffffff);
      v.spr.alpha = 0.75 + 0.25 * v.c.progress;
      v.puff -= dt;
      if (v.puff <= 0) {
        v.puff = 0.6 + Math.random() * 0.8;
        this.fx.oneShot('fx/dust_01', v.pos.x + (Math.random() - 0.5) * v.spr.width * 0.7, top + h - shown + 10, 0.9, 0.35, this.layers.fx);
      }
    }
    // bounce
    for (let i = this.bounces.length - 1; i >= 0; i--) {
      const b = this.bounces[i];
      b.t += dt;
      const k = Math.exp(-b.t * 6) * Math.sin(b.t * 22) * 0.12;
      b.s.scale.y = b.base * (1 + k);
      if (b.t > 1) {
        b.s.scale.y = b.base;
        this.bounces.splice(i, 1);
      }
    }
    // golden pulse
    if (this.golden) {
      this.golden.t += dt;
      const g = this.golden;
      g.glow.alpha = 0.45 + Math.sin(g.t * 5) * 0.2;
      g.glow.scale.set(2.0 + Math.sin(g.t * 3) * 0.25);
      g.spr.parent!.y += Math.sin(g.t * 3) * 0.15;
    }
    // duck
    if (this.duck) {
      const d = this.duck;
      d.t += dt;
      d.spr.x += d.dir * 38 * dt;
      d.spr.y = d.y0 + Math.sin(d.t * 2.4) * 4;
      d.spr.rotation = Math.sin(d.t * 2.4) * 0.08;
      if (d.spr.x > 27 * T || d.spr.x < -5 * T) {
        d.spr.destroy();
        this.duck = null;
      }
    }
    // clouds drift; they only show when zoomed out so they never hide the action
    const ca = Math.min(0.92, Math.max(0, (0.75 - this.cam.scale.x) * 3));
    this.layers.clouds.alpha = ca;
    this.layers.clouds.visible = ca > 0.01;
    for (const c of this.clouds) {
      c.x += 9 * dt;
      if (c.x > 40 * T) {
        c.x = -20 * T;
        c.y = (-10 + Math.random() * 34) * T;
      }
    }
    this.updateBattle(dt);
    this.fx.update(dt);
  }
}

function fmtShort(v: number) {
  if (v < 10) return v.toFixed(1);
  if (v < 1e4) return Math.floor(v).toLocaleString('ja-JP');
  const u = ['', '万', '億', '兆', '京', '垓'];
  const e = Math.min(u.length - 1, Math.floor(Math.log10(v) / 4));
  const x = v / Math.pow(10, e * 4);
  return (x < 10 ? x.toFixed(1) : Math.floor(x).toString()) + u[e];
}
