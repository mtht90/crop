// 島の描画。シミュレーションの状態を毎フレーム読み取って見た目に反映する。
import Phaser from 'phaser';
import { DAY_LEN, NIGHT_START, TILE } from '../sim/config';
import type { Sim } from '../sim/sim';
import type { Building, Raider, SimEvent, Villager } from '../sim/types';
import { ORIGIN_Y, createAnims, preloadAll } from './assets';
import { AudioMgr } from './audio';
import type { Controller } from '../controller';

const FONT = '"DotGothic16", sans-serif';
const SEASON_TILES = [1, 3, 4, 5]; // 春夏秋冬の草の色
const DEPTH = { foam: -30, wrock: -25, ground: -20, groundDeco: -10, cloud: 60000, night: 70000, glow: 70001, bubble: 75000, ui: 80000 };

interface Bubble {
  c: Phaser.GameObjects.Container;
  text: string;
}

export class WorldScene extends Phaser.Scene {
  ctl!: Controller;
  get sim(): Sim {
    return this.ctl.sim;
  }
  private ground!: Phaser.Tilemaps.TilemapLayer;
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private groundSeason = -1;
  private staticLayer: Phaser.GameObjects.GameObject[] = [];
  private villagerSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private bubbles = new Map<number, Bubble>();
  private treeSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private stumpSprites = new Map<number, Phaser.GameObjects.Image>();
  private goldSprites = new Map<number, Phaser.GameObjects.Image>();
  private sheepSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private buildingSprites = new Map<number, { img: Phaser.GameObjects.Image; ghost: Phaser.GameObjects.Image; fires: Phaser.GameObjects.Sprite[]; glow: Phaser.GameObjects.Image }>();
  private raiderSprites = new Map<number, { s: Phaser.GameObjects.Sprite; bar: Phaser.GameObjects.Graphics }>();
  private arrowSprites = new Map<number, Phaser.GameObjects.Image>();
  private clouds: Phaser.GameObjects.Image[] = [];
  private night!: Phaser.GameObjects.Rectangle;
  private selRing!: Phaser.GameObjects.Ellipse;
  private nameTag!: Phaser.GameObjects.Text;
  private snow!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private weatherZone = new Phaser.Geom.Rectangle(0, 0, 100, 100);
  selectedId: number | null = null;
  following = false;
  private dragStart: { x: number; y: number; sx: number; sy: number } | null = null;
  private dragMoved = false;
  private pinchDist = 0;

  constructor() {
    super('world');
  }

  preload() {
    this.ctl = this.registry.get('ctl');
    preloadAll(this);
    this.load.image('ui_paper', 'assets/tiny-swords/UI Elements/UI Elements/Papers/RegularPaper.png');
    AudioMgr.preload(this);
    const bar = document.getElementById('load-bar');
    this.load.on('progress', (p: number) => {
      if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    });
  }

  create() {
    createAnims(this);
    this.makeTextures();
    this.buildStatic();
    this.cameras.main.setBackgroundColor('#47aba9');
    this.cameras.main.setRoundPixels(true);
    const s = this.sim.s;
    const W = s.map.w * TILE;
    const H = s.map.h * TILE;
    this.cameras.main.setBounds(-TILE * 4, -TILE * 4, W + TILE * 8, H + TILE * 8);
    const home = s.buildings[0];
    if (home) this.cameras.main.centerOn((home.tx + 1) * TILE, home.ty * TILE);
    this.cameras.main.setZoom(window.innerWidth < 700 ? 0.7 : 1);

    this.night = this.add.rectangle(-TILE * 8, -TILE * 8, W + TILE * 16, H + TILE * 16, 0xffffff).setOrigin(0).setDepth(DEPTH.night);
    this.night.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.selRing = this.add.ellipse(0, 0, 54, 20).setStrokeStyle(3, 0xfff3a0, 0.95).setVisible(false);
    this.nameTag = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: '#fff8e0', stroke: '#2b1d12', strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(DEPTH.bubble + 1)
      .setVisible(false);

    // 雲
    for (let i = 0; i < 5; i++) {
      const c = this.add
        .image(Math.random() * W, Math.random() * H, `cloud${1 + (i % 5)}`)
        .setDepth(DEPTH.cloud)
        .setAlpha(0.55)
        .setScale(0.8 + Math.random() * 0.5);
      this.clouds.push(c);
    }
    // 雪と雨
    this.snow = this.add.particles(0, 0, 'px', {
      emitZone: { type: 'random', source: this.weatherZone, quantity: 0 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      lifespan: 9000,
      speedY: { min: 18, max: 40 },
      speedX: { min: -12, max: 12 },
      scale: { min: 0.6, max: 1.4 },
      alpha: { start: 0.9, end: 0.2 },
      quantity: 2,
      frequency: 60,
      emitting: false,
    });
    this.snow.setDepth(DEPTH.cloud - 1);
    this.rain = this.add.particles(0, 0, 'rain', {
      emitZone: { type: 'random', source: this.weatherZone, quantity: 0 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      lifespan: 900,
      speedY: { min: 700, max: 900 },
      speedX: -120,
      rotate: 8,
      alpha: { start: 0.55, end: 0.25 },
      quantity: 4,
      frequency: 16,
      emitting: false,
    });
    this.rain.setDepth(DEPTH.cloud - 1);

    this.setupInput();
    this.scale.on('resize', () => this.cameras.main.setSize(this.scale.width, this.scale.height));
    this.ctl.onSceneReady(this);
  }

  private makeTextures() {
    // 吹き出し用:Tiny Swords の紙を9分割の1枚絵に詰め直す
    const src = this.textures.get('ui_paper').getSourceImage() as HTMLImageElement;
    const pc = this.textures.createCanvas('paper9', 192, 192)!;
    const pctx = pc.getContext();
    pctx.imageSmoothingEnabled = false;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) pctx.drawImage(src, c * 128, r * 128, 64, 64, c * 64, r * 64, 64, 64);
    pc.refresh();
    // 雪粒・雨粒・窓明かり
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(3, 3, 3);
    g.generateTexture('px', 6, 6);
    g.clear();
    g.fillStyle(0xd8f0ff, 1).fillRect(0, 0, 2, 14);
    g.generateTexture('rain', 2, 14);
    g.destroy();
    const c = this.textures.createCanvas('glow', 128, 128)!;
    const ctx = c.getContext();
    const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,214,140,0.9)');
    grd.addColorStop(0.4, 'rgba(255,170,80,0.35)');
    grd.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    c.refresh();
  }

  // ───────────── 地形と装飾 ─────────────
  buildStatic() {
    for (const o of this.staticLayer) o.destroy();
    this.staticLayer = [];
    this.tilemap?.destroy();
    const s = this.sim.s;
    const { w, h } = s.map;
    this.tilemap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: w, height: h });
    const sets = [1, 2, 3, 4, 5].map((i) => this.tilemap.addTilesetImage(`tiles${i}`, `tiles${i}`, TILE, TILE, 0, 0, (i - 1) * 54)!);
    this.ground = this.tilemap.createBlankLayer('ground', sets)!.setDepth(DEPTH.ground);
    this.groundSeason = -1;
    this.paintGround(SEASON_TILES[this.sim.season]);

    // 波打ち際の泡
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!this.sim.isLand(x, y)) continue;
        let edge = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!this.sim.isLand(x + dx, y + dy)) edge = true;
        if (!edge) continue;
        const f = this.add.sprite(x * TILE + TILE / 2, y * TILE + TILE / 2, 'foam').setDepth(DEPTH.foam);
        f.play({ key: 'foam', startFrame: Math.floor(Math.random() * 16) });
        this.staticLayer.push(f);
      }
    for (const d of s.decos) {
      let o: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
      if (d.kind === 'bush') {
        o = this.add.sprite(d.x, d.y, `bush${d.variant}`).setOrigin(0.5, ORIGIN_Y.bush).setDepth(d.y);
        (o as Phaser.GameObjects.Sprite).play({ key: `bush${d.variant}`, startFrame: Math.floor(Math.random() * 8) });
      } else if (d.kind === 'rock') {
        o = this.add.image(d.x, d.y, `rock${d.variant}`).setDepth(DEPTH.groundDeco);
      } else if (d.kind === 'waterRock') {
        o = this.add.sprite(d.x, d.y, `wrock${d.variant}`).setDepth(DEPTH.wrock);
        (o as Phaser.GameObjects.Sprite).play({ key: `wrock${d.variant}`, startFrame: Math.floor(Math.random() * 16) });
      } else {
        o = this.add.sprite(d.x, d.y, 'duck').setDepth(DEPTH.wrock).setScale(1.5);
        (o as Phaser.GameObjects.Sprite).play('duck');
        this.tweens.add({ targets: o, y: d.y + 6, x: d.x + 30, duration: 4000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      this.staticLayer.push(o);
    }
  }

  private paintGround(set: number) {
    if (this.groundSeason === set) return;
    this.groundSeason = set;
    const s = this.sim.s;
    const { w, h } = s.map;
    const L = (x: number, y: number) => this.sim.isLand(x, y);
    const off = (set - 1) * 54;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!L(x, y)) {
          this.ground.removeTileAt(x, y);
          continue;
        }
        const W = L(x - 1, y);
        const E = L(x + 1, y);
        const N = L(x, y - 1);
        const S = L(x, y + 1);
        const col = W && E ? 1 : !W && E ? 0 : W && !E ? 2 : 3;
        const row = N && S ? 1 : !N && S ? 0 : N && !S ? 2 : 3;
        this.ground.putTileAt(off + row * 9 + col, x, y);
      }
  }

  /** 新しい島になったときに作り直す */
  resetWorld() {
    for (const m of [this.villagerSprites, this.treeSprites, this.stumpSprites, this.goldSprites, this.sheepSprites, this.arrowSprites] as Map<number, Phaser.GameObjects.GameObject>[]) {
      for (const o of m.values()) o.destroy();
      m.clear();
    }
    for (const b of this.bubbles.values()) b.c.destroy();
    this.bubbles.clear();
    for (const b of this.buildingSprites.values()) {
      b.img.destroy();
      b.ghost.destroy();
      b.glow.destroy();
      b.fires.forEach((f) => f.destroy());
    }
    this.buildingSprites.clear();
    for (const r of this.raiderSprites.values()) {
      r.s.destroy();
      r.bar.destroy();
    }
    this.raiderSprites.clear();
    this.selectedId = null;
    this.buildStatic();
    const s = this.sim.s;
    const W = s.map.w * TILE;
    const H = s.map.h * TILE;
    this.night.setPosition(-TILE * 8, -TILE * 8).setSize(W + TILE * 16, H + TILE * 16);
    const home = s.buildings[0];
    if (home) this.cameras.main.centerOn((home.tx + 1) * TILE, home.ty * TILE);
  }

  // ───────────── 入力 ─────────────
  private setupInput() {
    const cam = this.cameras.main;
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        this.pinchDist = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
        this.dragStart = null;
        return;
      }
      this.dragStart = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY };
      this.dragMoved = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        const d = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
        if (this.pinchDist > 0) this.setZoom(cam.zoom * (d / this.pinchDist));
        this.pinchDist = d;
        return;
      }
      if (!this.dragStart || !p.isDown) return;
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        this.dragMoved = true;
        this.following = false;
      }
      cam.scrollX = this.dragStart.sx - dx / cam.zoom;
      cam.scrollY = this.dragStart.sy - dy / cam.zoom;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.dragStart && !this.dragMoved) this.pickAt(p.worldX, p.worldY);
      this.dragStart = null;
      this.pinchDist = 0;
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      this.setZoom(cam.zoom * (dy > 0 ? 0.88 : 1.14));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    const keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    this.events.on('update', (_t: number, delta: number) => {
      if (!keys) return;
      const sp = (delta / 1000) * 600 / cam.zoom;
      if (keys.A.isDown || keys.LEFT.isDown) cam.scrollX -= sp;
      if (keys.D.isDown || keys.RIGHT.isDown) cam.scrollX += sp;
      if (keys.W.isDown || keys.UP.isDown) cam.scrollY -= sp;
      if (keys.S.isDown || keys.DOWN.isDown) cam.scrollY += sp;
    });
  }

  setZoom(z: number) {
    this.cameras.main.setZoom(Phaser.Math.Clamp(z, 0.4, 2.2));
  }

  private pickAt(wx: number, wy: number) {
    let best: Villager | null = null;
    let bd = 48;
    for (const v of this.sim.s.villagers) {
      if (v.hidden) continue;
      const d = Phaser.Math.Distance.Between(wx, wy, v.x, v.y - 30);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    this.select(best?.id ?? null);
  }

  select(id: number | null, follow = false) {
    this.selectedId = id;
    this.following = follow && id !== null;
    this.ctl.ui.showVillager(id);
  }

  focusOn(x: number, y: number) {
    this.cameras.main.pan(x, y, 600, 'Sine.easeInOut');
  }

  // ───────────── 毎フレーム ─────────────
  update(_time: number, delta: number) {
    this.ctl.tick(delta);
    const sim = this.sim;
    this.paintGround(SEASON_TILES[sim.season]);
    this.syncTrees();
    this.syncGolds();
    this.syncSheep();
    this.syncBuildings();
    this.syncVillagers();
    this.syncRaiders();
    this.syncArrows();
    this.handleEvents(sim.events);
    sim.events = [];
    this.updateAmbience(delta);
  }

  private syncTrees() {
    const seen = new Set<number>();
    for (const t of this.sim.s.trees) {
      seen.add(t.id);
      const x = t.tx * TILE + TILE / 2;
      const y = (t.ty + 1) * TILE - 6;
      const big = t.variant <= 2;
      let spr = this.treeSprites.get(t.id);
      if (!spr) {
        spr = this.add.sprite(x, y, `tree${t.variant}`).setOrigin(0.5, big ? ORIGIN_Y.tree12 : ORIGIN_Y.tree34);
        spr.play({ key: `tree${t.variant}`, startFrame: Math.floor(Math.random() * 8) });
        this.treeSprites.set(t.id, spr);
      }
      let stump = this.stumpSprites.get(t.id);
      if (!stump) {
        stump = this.add.image(x, y, `stump${t.variant}`).setOrigin(0.5, big ? ORIGIN_Y.stump12 : ORIGIN_Y.stump34);
        this.stumpSprites.set(t.id, stump);
      }
      const grown = t.growth >= 0.35;
      stump.setVisible(!grown || t.growth < 0.6).setDepth(y - 1);
      spr.setVisible(grown);
      if (grown) {
        const k = t.growth >= 1 ? 1 : 0.35 + ((t.growth - 0.35) / 0.65) * 0.55;
        spr.setScale(k);
        spr.x = x + (t.shake > 0 ? Math.sin(t.shake * 60) * 3 : 0);
        spr.setDepth(y);
      }
    }
    for (const [id, spr] of this.treeSprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.treeSprites.delete(id);
        this.stumpSprites.get(id)?.destroy();
        this.stumpSprites.delete(id);
      }
    }
  }

  private syncGolds() {
    const seen = new Set<number>();
    for (const g of this.sim.s.golds) {
      seen.add(g.id);
      let spr = this.goldSprites.get(g.id);
      const x = g.tx * TILE + TILE / 2;
      const y = (g.ty + 1) * TILE - 14;
      if (!spr) {
        spr = this.add.image(x, y, `gold${g.variant}`).setOrigin(0.5, ORIGIN_Y.gold).setDepth(y);
        this.goldSprites.set(g.id, spr);
      }
      spr.x = x + (g.shake > 0 ? Math.sin(g.shake * 80) * 2 : 0);
      spr.setScale(0.75 + Math.min(g.amount, 6) * 0.04);
    }
    for (const [id, spr] of this.goldSprites)
      if (!seen.has(id)) {
        spr.destroy();
        this.goldSprites.delete(id);
      }
  }

  private syncSheep() {
    const seen = new Set<number>();
    for (const sh of this.sim.s.sheep) {
      seen.add(sh.id);
      let spr = this.sheepSprites.get(sh.id);
      if (!spr) {
        spr = this.add.sprite(sh.x, sh.y, 'sheep_idle').setOrigin(0.5, ORIGIN_Y.sheep);
        this.sheepSprites.set(sh.id, spr);
      }
      spr.setPosition(sh.x, sh.y).setDepth(sh.y).setFlipX(sh.facingLeft);
      const key = `sheep_${sh.anim}`;
      if (spr.anims.currentAnim?.key !== key) spr.play(key);
    }
    for (const [id, spr] of this.sheepSprites)
      if (!seen.has(id)) {
        spr.destroy();
        this.sheepSprites.delete(id);
      }
  }

  private buildingTex(b: Building) {
    return b.kind === 'house' ? `b_house${b.variant}` : `b_${b.kind}`;
  }

  private syncBuildings() {
    const seen = new Set<number>();
    const nightK = this.nightFactor();
    for (const b of this.sim.s.buildings) {
      seen.add(b.id);
      const tex = this.buildingTex(b);
      const x = b.tx * TILE + (b.w * TILE) / 2;
      const y = (b.ty + 1) * TILE;
      let o = this.buildingSprites.get(b.id);
      if (!o) {
        const img = this.add.image(x, y, tex).setOrigin(0.5, ORIGIN_Y[tex]).setDepth(y);
        const ghost = this.add.image(x, y, tex).setOrigin(0.5, ORIGIN_Y[tex]).setDepth(y - 1).setAlpha(0.3);
        const glow = this.add.image(x, y - 40, 'glow').setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(b.w * 0.9, 1.2).setAlpha(0);
        o = { img, ghost, fires: [], glow };
        this.buildingSprites.set(b.id, o);
      }
      const frame = this.textures.getFrame(tex);
      if (!b.done) {
        // 建設中:下から積み上がっていく
        const H = frame.height;
        const visible = Math.max(2, Math.floor(H * ORIGIN_Y[tex] * Math.min(1, b.progress)));
        const top = Math.floor(H * ORIGIN_Y[tex]) - visible;
        o.img.setCrop(0, top, frame.width, H - top);
        o.ghost.setVisible(true);
      } else {
        o.img.setCrop();
        o.ghost.setVisible(false);
      }
      // 損傷に応じて炎
      const want = b.done ? (b.hp < b.maxHp * 0.25 ? 3 : b.hp < b.maxHp * 0.5 ? 2 : b.hp < b.maxHp * 0.8 ? 1 : 0) : 0;
      while (o.fires.length < want) {
        const i = o.fires.length;
        const fx = x + (i - 1) * (b.w * 18) + Phaser.Math.Between(-8, 8);
        const fy = y - frame.height * ORIGIN_Y[tex] * (0.45 + Math.random() * 0.3);
        const f = this.add.sprite(fx, fy, `fx_fire${1 + (i % 3)}`).setOrigin(0.5, 1).setDepth(y + 1).setScale(1.3);
        f.play(`fx_fire${1 + (i % 3)}`);
        o.fires.push(f);
      }
      while (o.fires.length > want) o.fires.pop()!.destroy();
      // 夜の窓明かり
      const lit = b.done && b.kind !== 'tower' && (b.occupants.length > 0 || b.kind === 'castle' || b.kind === 'monastery');
      o.glow.setAlpha(lit ? nightK * 0.75 : 0);
    }
    for (const [id, o] of this.buildingSprites)
      if (!seen.has(id)) {
        o.img.destroy();
        o.ghost.destroy();
        o.glow.destroy();
        o.fires.forEach((f) => f.destroy());
        this.buildingSprites.delete(id);
      }
  }

  private villagerAnim(v: Villager): string {
    const t = v.task;
    switch (v.role) {
      case 'warrior':
        return { attack: 'warrior_attack', guard: 'warrior_guard', run: 'warrior_run' }[v.anim] ?? 'warrior_idle';
      case 'archer':
        return { shoot: 'archer_shoot', run: 'archer_run' }[v.anim] ?? 'archer_idle';
      case 'monk':
        return { heal: 'monk_heal', run: 'monk_run' }[v.anim] ?? 'monk_idle';
    }
    if (v.anim === 'chop') return 'pawn_chop';
    if (v.anim === 'mine') return 'pawn_mine';
    if (v.anim === 'hammer') return 'pawn_hammer';
    if (v.anim === 'knife') return 'pawn_knife';
    if (v.anim.startsWith('run')) {
      if (v.carrying) return `pawn_run_${v.carrying}`;
      if (t?.phase === 'go') {
        if (t.type === 'chop') return 'pawn_run_axe';
        if (t.type === 'mine') return 'pawn_run_pickaxe';
        if (t.type === 'build' || t.type === 'repair') return 'pawn_run_hammer';
        if (t.type === 'harvest') return 'pawn_run_knife';
      }
      return 'pawn_run';
    }
    if (v.carrying) return `pawn_idle_${v.carrying}`;
    return 'pawn_idle';
  }

  private syncVillagers() {
    const seen = new Set<number>();
    const time = this.sim.s.time;
    for (const v of this.sim.s.villagers) {
      seen.add(v.id);
      let spr = this.villagerSprites.get(v.id);
      if (!spr) {
        spr = this.add.sprite(v.x, v.y, 'pawn_idle').setOrigin(0.5, ORIGIN_Y.unit);
        this.villagerSprites.set(v.id, spr);
      }
      spr.setVisible(!v.hidden);
      if (v.hidden) {
        this.bubbles.get(v.id)?.c.setVisible(false);
        continue;
      }
      const key = this.villagerAnim(v);
      if (spr.anims.currentAnim?.key !== key) spr.play(key);
      const child = v.role === 'child';
      let yOff = 0;
      if (v.task?.type === 'festival' || (child && v.task?.type === 'play' && v.task.phase === 'act')) yOff = -Math.abs(Math.sin(time * 6 + v.id)) * 10;
      spr.setPosition(v.x, v.y + yOff).setDepth(v.y).setFlipX(v.facingLeft).setScale(child ? 0.72 : 1);
      if (v.knockedOut > 0) {
        spr.setAngle(v.facingLeft ? -80 : 80).setAlpha(0.75);
        spr.anims.pause();
      } else {
        if (spr.angle !== 0) spr.setAngle(0).setAlpha(1);
        if (spr.anims.isPaused) spr.anims.resume();
      }
      this.syncBubble(v, spr);
    }
    for (const [id, spr] of this.villagerSprites)
      if (!seen.has(id)) {
        spr.destroy();
        this.villagerSprites.delete(id);
        this.bubbles.get(id)?.c.destroy();
        this.bubbles.delete(id);
        if (this.selectedId === id) this.select(null);
      }
    // 選択中の村人
    const sel = this.selectedId !== null ? this.sim.s.villagers.find((v) => v.id === this.selectedId) : null;
    if (sel && !sel.hidden) {
      this.selRing.setVisible(true).setPosition(sel.x, sel.y + 2).setDepth(sel.y - 1);
      this.nameTag.setVisible(!sel.bubble).setText(sel.name).setPosition(sel.x, sel.y - (sel.role === 'child' ? 60 : 78));
      if (this.following) this.cameras.main.centerOn(sel.x, sel.y - 30);
    } else {
      this.selRing.setVisible(false);
      this.nameTag.setVisible(false);
    }
  }

  private syncBubble(v: Villager, spr: Phaser.GameObjects.Sprite) {
    const cur = this.bubbles.get(v.id);
    if (!v.bubble && v.thinking && !v.hidden) {
      // AIが考え中
      v = { ...v, bubble: { text: '…', until: 0 } };
    }
    if (!v.bubble) {
      if (cur) {
        cur.c.destroy();
        this.bubbles.delete(v.id);
      }
      return;
    }
    const headY = v.y - (v.role === 'child' ? 58 : 76);
    const bub = v.bubble;
    if (cur && cur.text === bub.text) {
      cur.c.setPosition(spr.x, headY).setVisible(true).setDepth(DEPTH.bubble + v.y / 10000);
      return;
    }
    cur?.c.destroy();
    const talk = !!bub.talk;
    const text = this.add
      .text(0, 0, bub.text, { fontFamily: FONT, fontSize: '15px', color: talk ? '#3a2a1a' : '#2f5f7f', align: 'center', wordWrap: { width: 200, useAdvancedWrap: true } })
      .setOrigin(0.5, 1)
      .setResolution(2);
    // Tiny Swords の紙(縮小して使う)
    const k = 0.42;
    const w = Math.max(text.width + 26, 44);
    const h = text.height + 22;
    const paper = this.add.nineslice(0, -8, 'paper9', undefined, w / k, h / k, 64, 64, 64, 64).setOrigin(0.5, 1).setScale(k);
    if (!talk) paper.setAlpha(0.88);
    const g = this.add.graphics();
    g.fillStyle(0xeee1c6, talk ? 1 : 0.88).fillTriangle(-6, -13, 6, -13, 0, -1);
    text.setPosition(0, -17);
    const c = this.add.container(spr.x, headY, [g, paper, text]).setDepth(DEPTH.bubble);
    c.setScale(0.6);
    this.tweens.add({ targets: c, scale: 1, duration: 180, ease: 'Back.out' });
    this.bubbles.set(v.id, { c, text: bub.text });
  }

  private syncRaiders() {
    const seen = new Set<number>();
    for (const r of this.sim.s.raiders) {
      seen.add(r.id);
      let o = this.raiderSprites.get(r.id);
      if (!o) {
        const s = this.add.sprite(r.x, r.y, 'raider_warrior_idle').setOrigin(0.5, ORIGIN_Y.unit);
        const bar = this.add.graphics();
        o = { s, bar };
        this.raiderSprites.set(r.id, o);
      }
      const key = `raider_warrior_${r.anim === 'attack' ? 'attack' : r.anim === 'run' ? 'run' : 'idle'}`;
      if (o.s.anims.currentAnim?.key !== key) o.s.play(key);
      o.s.setPosition(r.x, r.y).setDepth(r.y).setFlipX(r.facingLeft);
      this.drawHpBar(o.bar, r);
    }
    for (const [id, o] of this.raiderSprites)
      if (!seen.has(id)) {
        o.s.destroy();
        o.bar.destroy();
        this.raiderSprites.delete(id);
      }
  }

  private drawHpBar(g: Phaser.GameObjects.Graphics, r: Raider) {
    g.clear();
    if (r.hp >= r.maxHp) return;
    const w = 44;
    g.fillStyle(0x2b1d12, 0.8).fillRect(r.x - w / 2 - 1, r.y - 84, w + 2, 7);
    g.fillStyle(0xe04848, 1).fillRect(r.x - w / 2, r.y - 83, w * Math.max(0, r.hp / r.maxHp), 5);
    g.setDepth(DEPTH.bubble - 1);
  }

  private syncArrows() {
    const seen = new Set<number>();
    for (const a of this.sim.s.arrows) {
      seen.add(a.id);
      let spr = this.arrowSprites.get(a.id);
      if (!spr) {
        spr = this.add.image(a.x, a.y, 'arrow').setDepth(DEPTH.bubble - 2);
        this.arrowSprites.set(a.id, spr);
      }
      const k = Math.min(1, a.t / a.dur);
      const arc = Math.sin(Math.PI * k) * Math.min(120, Phaser.Math.Distance.Between(a.sx, a.sy, a.tx, a.ty) * 0.25);
      const k2 = Math.min(1, k + 0.02);
      const nx = a.sx + (a.tx - a.sx) * k2;
      const ny = a.sy + (a.ty - a.sy) * k2 - Math.sin(Math.PI * k2) * Math.min(120, Phaser.Math.Distance.Between(a.sx, a.sy, a.tx, a.ty) * 0.25);
      const y = a.y - arc;
      spr.setPosition(a.x, y).setRotation(Math.atan2(ny - y, nx - a.x));
    }
    for (const [id, spr] of this.arrowSprites)
      if (!seen.has(id)) {
        spr.destroy();
        this.arrowSprites.delete(id);
      }
  }

  // ───────────── 演出 ─────────────
  private fx(key: string, x: number, y: number, scale = 1, depth?: number, originY = 0.5) {
    const s = this.add.sprite(x, y, key).setScale(scale).setOrigin(0.5, originY).setDepth(depth ?? y + 2);
    s.play(key);
    s.once('animationcomplete', () => s.destroy());
    return s;
  }

  floatText(x: number, y: number, text: string, color = '#fff3b0', icon?: string) {
    const items: Phaser.GameObjects.GameObject[] = [];
    const t = this.add
      .text(icon ? 12 : 0, 0, text, { fontFamily: FONT, fontSize: '18px', color, stroke: '#2b1d12', strokeThickness: 4 })
      .setOrigin(0.5)
      .setResolution(2);
    items.push(t);
    if (icon) items.unshift(this.add.image(-t.width / 2 - 6, 0, icon).setScale(0.45));
    const c = this.add.container(x, y, items).setDepth(DEPTH.bubble + 5);
    this.tweens.add({ targets: c, y: y - 46, alpha: 0, duration: 1400, ease: 'Cubic.out', onComplete: () => c.destroy() });
  }

  private onScreen(x: number, y: number) {
    return this.cameras.main.worldView.contains(x, y) || this.cameras.main.worldView.contains(x, y - 100);
  }

  private handleEvents(events: SimEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'chop':
          if (this.onScreen(e.x, e.y)) {
            this.fx('fx_dust', e.x + Phaser.Math.Between(-14, 14), e.y + 20, 0.7);
            this.ctl.audio.play('chop', 0.25);
          }
          break;
        case 'treeFall': {
          const spr = this.treeSprites.get(e.treeId);
          if (spr && this.onScreen(spr.x, spr.y)) {
            const ghost = this.add.sprite(spr.x, spr.y, spr.texture.key, spr.frame.name).setOrigin(spr.originX, spr.originY).setDepth(spr.depth + 1);
            this.tweens.add({ targets: ghost, angle: Math.random() < 0.5 ? -88 : 88, alpha: 0, duration: 650, ease: 'Quad.in', onComplete: () => ghost.destroy() });
            this.fx('fx_dust2', spr.x, spr.y - 10, 1.4);
            this.ctl.audio.play('fall', 0.3);
          }
          break;
        }
        case 'mine':
          if (this.onScreen(e.x, e.y)) {
            this.fx('fx_dust', e.x + Phaser.Math.Between(-10, 10), e.y + 10, 0.6);
            this.ctl.audio.play('mine', 0.2);
          }
          break;
        case 'hammer':
          if (this.onScreen(e.x, e.y)) {
            this.fx('fx_dust', e.x, e.y, 0.5);
            this.ctl.audio.play('hammer', 0.18);
          }
          break;
        case 'deliver':
          if (this.onScreen(e.x, e.y)) {
            this.floatText(e.x, e.y, `+${e.amount}`, '#fff3b0', `res_${e.kind}`);
            this.ctl.audio.play('coin', 0.15);
          }
          break;
        case 'points':
          if (this.onScreen(e.x, e.y) && e.amount >= 3) this.floatText(e.x, e.y, `✦${Math.round(e.amount)}`, '#bfe8ff');
          break;
        case 'poof':
          if (this.onScreen(e.x, e.y)) this.fx('fx_dust2', e.x, e.y, e.big ? 1.6 : 1);
          break;
        case 'splash':
          this.fx('fx_splash', e.x, e.y, 0.8);
          if (this.onScreen(e.x, e.y)) this.ctl.audio.play('splash', 0.3);
          break;
        case 'hit':
          if (this.onScreen(e.x, e.y)) {
            const s = this.fx('fx_dust', e.x, e.y, 0.6, DEPTH.bubble - 3);
            s.setTint(0xffe0a0);
            this.ctl.audio.play('hit', 0.25);
          }
          break;
        case 'heal':
          this.fx('fx_heal', e.x, e.y - 30, 1, e.y + 5);
          this.ctl.audio.play('heal', 0.3);
          break;
        case 'built': {
          const b = this.sim.s.buildings.find((x) => x.id === e.id);
          if (b) {
            const x = b.tx * TILE + (b.w * TILE) / 2;
            const y = (b.ty + 1) * TILE;
            for (let i = 0; i < b.w + 1; i++) this.time.delayedCall(i * 80, () => this.fx('fx_dust2', x + (i - b.w / 2) * 48, y - 10, 1.5));
            this.floatText(x, y - 150, `${b.name}が完成!`, '#ffe680');
            const img = this.buildingSprites.get(b.id)?.img;
            if (img) this.tweens.add({ targets: img, scaleY: { from: 0.92, to: 1 }, scaleX: { from: 1.06, to: 1 }, duration: 380, ease: 'Back.out' });
            this.ctl.audio.play('built', 0.5);
          }
          break;
        }
        case 'siteStart': {
          const b = this.sim.s.buildings.find((x) => x.id === e.id);
          if (b) this.fx('fx_dust2', b.tx * TILE + (b.w * TILE) / 2, (b.ty + 1) * TILE - 20, 1.6);
          break;
        }
        case 'birth': {
          const v = this.sim.s.villagers.find((x) => x.id === e.id);
          if (v) this.floatText(v.x, v.y - 70, '♥ 誕生', '#ffb6c8');
          this.ctl.audio.play('birth', 0.35);
          break;
        }
        case 'death':
          this.floatText(e.x, e.y - 70, '✧', '#e8e0ff');
          this.fx('fx_dust2', e.x, e.y, 1.2);
          break;
        case 'raidStart':
          this.ctl.audio.play('horn', 0.5);
          this.cameras.main.shake(400, 0.004);
          break;
      }
      this.ctl.onSimEvent(e);
    }
  }

  nightFactor(): number {
    const t = this.sim.s.dayTime / DAY_LEN;
    const dusk = NIGHT_START - 0.08;
    if (t < 0.05) return 1 - t / 0.05;
    if (t < dusk) return 0;
    if (t < NIGHT_START) return (t - dusk) / 0.08;
    if (t > 0.97) return (1 - t) / 0.03;
    return 1;
  }

  private updateAmbience(delta: number) {
    const sim = this.sim;
    const n = this.nightFactor();
    const seasonTint = [0xfffcf4, 0xffffff, 0xfff0dc, 0xeef4ff][sim.season];
    const day = Phaser.Display.Color.ValueToColor(seasonTint);
    const nightC = Phaser.Display.Color.ValueToColor(0x6070b4);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(day, nightC, 100, n * 100);
    this.night.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
    // 雲
    const cam = this.cameras.main;
    const W = sim.s.map.w * TILE;
    for (const cl of this.clouds) {
      cl.x += (delta / 1000) * 10 * this.ctl.speed;
      if (cl.x > W + 400) {
        cl.x = -400;
        cl.y = Math.random() * sim.s.map.h * TILE;
      }
      cl.setAlpha(0.5 * (1 - n * 0.6));
    }
    // 天気
    const view = cam.worldView;
    const winter = sim.season === 3;
    const rainy = !winter && sim.season <= 1 && hash(sim.s.seasonIndex + sim.s.seed) % 3 === 0 && (sim.s.time % 300) > 120 && (sim.s.time % 300) < 220;
    this.snow.emitting = winter;
    this.rain.emitting = rainy;
    this.weatherZone.setTo(view.x - 150, view.y - 120, view.width + 300, view.height * 0.6);
  }
}

function hash(n: number) {
  let x = n | 0;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  return ((x >>> 16) ^ x) >>> 0;
}
