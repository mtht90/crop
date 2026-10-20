import { Assets, Container, FillGradient, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound, haptic } from '../core/Audio';
import { Button, grad, panel, popIn, txt } from '../core/UI';
import { FairyBackdrop } from '../game/Backdrop';
import { jungle, jungleSlice } from '../game/Hud';
import { loadFairy, unloadFairy } from '../core/Loader';
import { Effects } from '../game/Effects';
import { World, type PBody } from '../game/Physics';
import { bigTexture, loadCharacterArt } from '../art/PieceArt';
import { CHARACTERS, RARITY_INFO, type Rarity } from '../data/characters';
import { COST_SINGLE, COST_TEN, PITY, pull, rarityRank, type PullResult } from '../data/gacha';
import { HomeScene } from './HomeScene';
import { CoinCounter, stars } from './common';

const CAP_COLORS: Record<Rarity, number[]> = {
  N: [0x8fd0ff],
  R: [0x36a2ff],
  SR: [0xffc71f],
  SSR: [0xff4d6a, 0xffc71f, 0x3fd35c, 0x36a2ff, 0xa65cff],
};

function rainbow(): FillGradient {
  return grad([[0, '#ff4d6a'], [0.25, '#ffc71f'], [0.5, '#3fd35c'], [0.75, '#36a2ff'], [1, '#a65cff']], false);
}

const BG_SET = 2;
type M3 = import('../gacha/Machine3D').Machine3D;

/** Pre-rendered 3D gumball machine ("gumball machine" by myles_683, CC BY 4.0), layered so capsules sit inside the glass. */
const MACHINE = {
  size: [555, 960],
  dome: [278, 305],
  domeR: 225,
  crank: [202.0, 653.0],
  chute: [193, 873],
};
const MACHINE_PARTS = ['back', 'glass', 'body', 'crank', 'cap_N', 'cap_R', 'cap_SR', 'cap_SSR'];
const gtex = (n: string): Texture => Assets.get<Texture>(`gacha:${n}`) ?? Texture.WHITE;

export class GachaScene extends Scene {
  private bg!: FairyBackdrop;
  private shade = new Graphics();
  private col = new Container();
  private rays = new Graphics();
  private fx = new Effects();
  private machine = new Container();
  private dome = new Container();
  private handle = new Container();
  private pickup = new Container();
  private pickArts: Sprite[] = [];
  private caps: { g: Sprite; b: PBody; a: number }[] = [];
  private world = new World({ gravity: 1800, left: -1e4, right: 1e4, bottom: 1e4, iterations: 4, drag: 0.6, circle: { x: 0, y: 0, r: MACHINE.domeR * 0.93 } });
  private shaking = 0;
  private coins!: CoinCounter;
  private ticketLabel!: ReturnType<typeof txt>;
  private ui = new Container();
  private stageLayer = new Container();
  private busy = false;
  private t = 0;
  private sparkT = 0;
  private tapResolver: (() => void) | null = null;
  private skipAll = false;
  private lastDim: Graphics | null = null;
  /** Real-time 3D machine (null → 2D layered fallback). */
  private m3: M3 | null = null;
  private m3Rect = { x: 0, y: 0, w: 0, h: 0 };

  async preload(): Promise<void> {
    for (const n of MACHINE_PARTS) if (!Assets.resolver.hasKey(`gacha:${n}`)) Assets.add({ alias: `gacha:${n}`, src: `./assets/gacha/${n}.webp` });
    await Promise.all([loadFairy(BG_SET), Assets.load(MACHINE_PARTS.map((n) => `gacha:${n}`))]);
    try {
      const { Machine3D } = await import('../gacha/Machine3D');
      this.m3 = await Machine3D.create('./assets/gacha3d/machine.json');
    } catch {
      this.m3 = null;
    }
    this.bg = new FairyBackdrop(BG_SET);
  }

  enter(): void {
    this.view.addChild(this.bg, this.shade, this.col);
    Sound.music('gacha', 0.8);
    const top = App.safeTop;
    this.col.addChild(this.rays, this.pickup, this.machine, this.fx.view, this.ui, this.stageLayer);
    // header: wooden bar with back, coins and tickets
    const bar = jungle('topbar');
    bar.anchor.set(0.5, 0);
    bar.width = App.W + 40;
    bar.height = top + 112;
    bar.position.set(360, -6);
    this.ui.addChild(bar);
    const back = jungle('prev');
    back.anchor.set(0.5);
    back.scale.set(70 / back.texture.width);
    back.position.set(56, top + 52);
    back.eventMode = 'static';
    back.cursor = 'pointer';
    back.on('pointertap', () => {
      if (this.busy) return;
      Sound.play('ui_back');
      this.m3?.show(false);
      Scenes.go(() => new HomeScene());
    });
    this.coins = new CoinCounter();
    this.coins.position.set(490, top + 54);
    const tk = new Graphics();
    tk.roundRect(-20, -26, 150, 52, 26).fill({ color: 0x2a1630, alpha: 0.85 });
    tk.roundRect(-4, -16, 44, 28, 6).fill(0xff7ab8).stroke({ width: 3, color: 0xffffff });
    tk.circle(18, -2, 6).fill(0xffffff);
    tk.position.set(150, top + 50);
    this.ticketLabel = txt(`×${Save.data.tickets}`, { size: 30, stroke: 0x2a1630, strokeWidth: 6, anchor: [0, 0.5] });
    this.ticketLabel.position.set(198, top + 47);
    this.ui.addChild(back, this.coins, tk, this.ticketLabel);
    const title = txt('ぷにガチャ', { size: 70, font: 'dela', color: 0xfff27a, stroke: 0x6a2a00, strokeWidth: 14, shadow: true });
    title.position.set(360, top + 160);
    gsap.to(title.scale, { x: 1.05, y: 1.05, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.ui.addChild(title);
    this.buildPickup(top + 296);
    this.buildMachine(top + 470);
    this.buildButtons();
    this.stageLayer.eventMode = 'static';
    this.stageLayer.on('pointertap', () => {
      const r = this.tapResolver;
      this.tapResolver = null;
      r?.();
    });
  }

  /** "PICK UP" plaque showing the SSR lineup. */
  private buildPickup(y: number): void {
    const p = this.pickup;
    p.position.set(360, y);
    const board = jungleSlice('paper', 600, 170, 60);
    board.position.set(-300, -85);
    const tag = new Graphics().roundRect(-110, -22, 220, 44, 22).fill(grad([[0, '#ff7ab8'], [1, '#d81b60']]));
    tag.roundRect(-110, -22, 220, 44, 22).stroke({ width: 4, color: 0xffffff });
    tag.position.set(-170, -84);
    tag.rotation = -0.06;
    const tl = txt('PICK UP SSR', { size: 24, font: 'dela', stroke: 0x5a0a2a, strokeWidth: 5 });
    tl.position.copyFrom(tag.position);
    tl.rotation = tag.rotation;
    p.addChild(board);
    const ssr = CHARACTERS.filter((c) => c.rarity === 'SSR');
    ssr.forEach((c, i) => {
      const x = (i - (ssr.length - 1) / 2) * 180;
      const halo = new Graphics().circle(0, 0, 66).fill(grad([[0, '#fff6c0'], [1, '#ffb020']]));
      halo.circle(0, 0, 66).stroke({ width: 5, color: 0xffffff });
      halo.position.set(x, 2);
      const art = new Sprite(bigTexture(c));
      art.anchor.set(0.5, 0.55);
      art.scale.set(130 / Math.max(1, art.texture.width));
      art.position.set(x, 2);
      const nm = txt(c.name, { size: 20, stroke: 0x2a1630, strokeWidth: 5 });
      nm.position.set(x, 70);
      p.addChild(halo, art, nm);
      this.pickArts.push(art);
    });
    p.addChild(tag, tl);
  }

  private buildMachine(y0: number): void {
    const [W, H] = MACHINE.size;
    const [dx, dy] = MACHINE.dome;
    // stop above the ticket button
    const space = App.H - App.safeBottom - 320 - y0;
    const s = Math.min(0.9, space / H);
    this.machine.scale.set(s);
    // machine origin = dome center
    this.machine.position.set(360, y0 + dy * s);
    // golden rays behind
    this.rays.position.set(360, this.machine.y);
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * Math.PI * 2;
      const a1 = a0 + Math.PI / 18;
      this.rays.moveTo(0, 0).lineTo(Math.cos(a0) * 1000, Math.sin(a0) * 1000).lineTo(Math.cos(a1) * 1000, Math.sin(a1) * 1000).closePath().fill({ color: 0xfff0a0, alpha: 0.1 });
    }
    this.rays.blendMode = 'add';
    const layer = (n: string) => {
      const sp = new Sprite(gtex(n));
      sp.anchor.set(dx / W, dy / H);
      return sp;
    };
    const shadow = new Graphics().ellipse(0, H - dy - 30, W * 0.46, 40).fill({ color: 0x000000, alpha: 0.35 });
    const crank = new Sprite(gtex('crank'));
    crank.anchor.set(0.5);
    this.handle.addChild(crank);
    this.handle.position.set(MACHINE.crank[0] - dx, MACHINE.crank[1] - dy);
    // name plate on the base, next to the crank
    const plate = new Container();
    const pg = new Graphics();
    pg.roundRect(-92, -34, 184, 68, 34).fill(grad([[0, '#fff3b0'], [1, '#ffb020']]));
    pg.roundRect(-92, -34, 184, 68, 34).stroke({ width: 6, color: 0x8a4f00 });
    const pt = txt('GACHA', { size: 38, font: 'dela', color: 0xd81b60, stroke: 0xffffff, strokeWidth: 6 });
    plate.addChild(pg, pt);
    plate.position.set(MACHINE.crank[0] - dx + 150, MACHINE.crank[1] - dy - 40);
    plate.rotation = -0.04;
    const star = new Graphics().poly(starPts(30)).fill(0xffd23f).stroke({ width: 5, color: 0x8a4f00 });
    star.position.set(plate.x + 10, plate.y + 90);
    if (this.m3) {
      // 3D machine lives on its own canvas over this area; keep the container for layout only
      this.m3Rect = { x: 60, y: y0 - 40, w: 600, h: App.H - App.safeBottom - 300 - (y0 - 40) };
      gsap.delayedCall(0.45, () => this.m3?.show(true));
      return;
    }
    this.machine.addChild(shadow, layer('back'), this.dome, layer('glass'), layer('body'), plate, star, this.handle);
    // capsules physics inside the dome
    const mixes: Rarity[] = ['N', 'N', 'N', 'R', 'R', 'R', 'SR', 'SR', 'SSR'];
    const r = MACHINE.domeR * 0.15;
    for (let i = 0; i < 18; i++) {
      const b = this.world.add((Math.random() - 0.5) * MACHINE.domeR, (Math.random() - 0.5) * MACHINE.domeR, r);
      const g = new Sprite(gtex(`cap_${mixes[i % mixes.length]}`));
      g.anchor.set(0.5);
      g.scale.set((r * 2.25) / g.texture.width);
      this.dome.addChild(g);
      this.caps.push({ g, b, a: Math.random() * 6 });
    }
    // settle the pile before the first frame
    for (let i = 0; i < 360; i++) this.world.step(1 / 120);
    for (const c of this.caps) c.g.position.set(c.b.position.x, c.b.position.y);
  }

  private buttons: Button[] = [];
  private ticketBtn: Button | null = null;
  private buildButtons(): void {
    const by = App.H - App.safeBottom - 100;
    const one = new Button({ w: 300, h: 116, label: '1回', sub: `${COST_SINGLE} コイン`, color: 'yellow', size: 44, sound: 'ui_ok', onTap: () => void this.doPull(1) });
    one.position.set(196, by);
    const ten = new Button({ w: 320, h: 116, label: '10連', sub: `${COST_TEN} コイン`, color: 'pink', size: 44, sound: 'ui_ok', onTap: () => void this.doPull(10) });
    ten.position.set(530, by);
    ten.breathe();
    const note = txt('10連はSR以上1体確定！', { size: 22, color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 6 });
    note.position.set(530, by - 78);
    const pity = txt(`SSR確定まで あと${PITY - Save.data.pity}回`, { size: 20, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 5 });
    pity.position.set(196, by - 78);
    const rates = new Button({ w: 150, h: 58, label: '提供割合', color: 'purple', size: 22, onTap: () => this.showRates() });
    rates.position.set(620, App.safeTop + 160);
    this.buttons = [one, ten, rates];
    this.ui.addChild(one, ten, note, pity, rates);
    this.pityLabel = pity;
    this.refreshTicket();
  }
  private pityLabel!: ReturnType<typeof txt>;

  /** A free-ticket button floats above the coin buttons while tickets remain. */
  private refreshTicket(): void {
    this.ticketLabel.text = `×${Save.data.tickets}`;
    if (Save.data.tickets > 0 && !this.ticketBtn) {
      const b = new Button({ w: 380, h: 104, label: 'チケットで1回', sub: `のこり ${Save.data.tickets}枚`, color: 'green', size: 38, sound: 'ui_ok', onTap: () => void this.doPull(1, true) });
      b.position.set(360, App.H - App.safeBottom - 250);
      b.breathe();
      this.ui.addChild(b);
      this.buttons.push(b);
      this.ticketBtn = b;
    } else if (Save.data.tickets <= 0 && this.ticketBtn) {
      this.buttons = this.buttons.filter((x) => x !== this.ticketBtn);
      this.ticketBtn.destroy({ children: true });
      this.ticketBtn = null;
    }
  }

  private showRates(): void {
    const ov = new Container();
    const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.6 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => ov.destroy({ children: true }));
    const box = new Container();
    box.position.set(360, App.H / 2);
    box.addChild(panel(520, 520, { color: 0xfdf7ff }));
    const t = txt('提供割合', { size: 44, font: 'dela', color: 0x4a2f7a });
    t.y = -200;
    box.addChild(t);
    (['SSR', 'SR', 'R', 'N'] as Rarity[]).forEach((r, i) => {
      const y = -110 + i * 75;
      const b = new Graphics().roundRect(-60, -24, 120, 48, 24).fill(RARITY_INFO[r].color);
      b.x = -120;
      b.y = y;
      const l = txt(r, { size: 28, font: 'dela', stroke: 0x2a1630, strokeWidth: 5 });
      l.position.set(-120, y);
      const v = txt(`${(RARITY_INFO[r].rate * 100).toFixed(0)}%`, { size: 36, font: 'dela', color: 0x4a2f7a });
      v.position.set(100, y);
      box.addChild(b, l, v);
    });
    const n = txt(`${PITY}回以内にSSR確定`, { size: 24, color: 0x7a6a9a });
    n.y = 200;
    box.addChild(n);
    ov.addChild(dim, box);
    this.ui.addChild(ov);
    popIn(box);
  }

  private setUi(on: boolean): void {
    for (const b of this.buttons) b.enabled = on;
    gsap.to(this.ui, { alpha: on ? 1 : 0, duration: 0.25 });
    // keep the machine visible while it cranks, then hide everything behind the reveal
    gsap.to([this.pickup, this.rays], { alpha: on ? 1 : 0, duration: 0.25 });
  }

  private async doPull(n: number, ticket = false): Promise<void> {
    if (this.busy) return;
    const cost = ticket ? 0 : n === 10 ? COST_TEN : COST_SINGLE;
    if (ticket && Save.data.tickets <= 0) return;
    if (Save.data.coins < cost) {
      Sound.play('ui_error', { vol: 0.7 });
      haptic([10, 30, 10]);
      const t = txt('コインが足りないよ！バトルでかせごう', { size: 28, color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 7 });
      t.position.set(360, App.H - App.safeBottom - 220);
      this.col.addChild(t);
      popIn(t);
      gsap.to(t, { alpha: 0, delay: 1.4, duration: 0.3, onComplete: () => t.destroy() });
      return;
    }
    this.busy = true;
    this.skipAll = false;
    Save.data.coins -= cost;
    if (ticket) Save.data.tickets--;
    const results = pull(n);
    // the reveal shows the full-size art of whatever came out
    await loadCharacterArt(results.map((r) => r.def.id), { portraits: true });
    this.coins.refresh();
    this.setUi(false);
    Sound.play('coins', { vol: 0.8 });
    const best = results.reduce((a, r) => (rarityRank(r.def.rarity) > rarityRank(a) ? r.def.rarity : a), 'N' as Rarity);
    // tease: the capsule sometimes shows a lower rarity first and upgrades on opening
    const tease: Rarity = best === 'SSR' ? (Math.random() < 0.5 ? 'SR' : 'SSR') : best === 'SR' && Math.random() < 0.35 ? 'R' : best;
    await this.crank();
    if (this.m3) await this.dispense3D(tease);
    await this.capsuleOpen(best, tease);
    if (n === 1) await this.reveal(results[0]);
    else await this.grid(results);
    this.clearStage();
    this.pityLabel.text = `SSR確定まで あと${PITY - Save.data.pity}回`;
    this.refreshTicket();
    this.setUi(true);
    this.busy = false;
  }

  private tap(timeout = 0): Promise<void> {
    if (this.skipAll) return Promise.resolve();
    return new Promise((res) => {
      this.tapResolver = res;
      if (timeout > 0) gsap.delayedCall(timeout, () => {
        if (this.tapResolver === res) {
          this.tapResolver = null;
          res();
        }
      });
    });
  }

  private crank(): Promise<void> {
    if (this.m3) {
      Sound.play('diceShake', { vol: 0.8 });
      for (let i = 0; i < 8; i++) gsap.delayedCall(i * 0.13, () => Sound.play('switch', { vol: 0.5, rate: 0.8 + i * 0.05 }));
      return this.m3.turnCrank(1.1);
    }
    return new Promise((res) => {
      this.shaking = 1.3;
      Sound.play('diceShake', { vol: 0.8 });
      for (let i = 0; i < 8; i++) gsap.delayedCall(i * 0.13, () => Sound.play('switch', { vol: 0.5, rate: 0.8 + i * 0.05 }));
      gsap.to(this.handle, { rotation: Math.PI * 4, duration: 1.1, ease: 'power2.inOut' });
      gsap.to(this.machine.scale, { x: this.machine.scale.x * 1.03, y: this.machine.scale.y * 0.97, duration: 0.1, yoyo: true, repeat: 9 });
      gsap.delayedCall(1.2, () => {
        this.handle.rotation = 0;
        res();
      });
    });
  }

  /** Camera pushes in while the capsule rolls out of the chute toward the player. */
  private async dispense3D(tease: Rarity): Promise<void> {
    const m3 = this.m3!;
    const z = { k: 0 };
    gsap.to(z, { k: 1, duration: 0.9, ease: 'power2.inOut', onUpdate: () => m3.setDolly(z.k) });
    Sound.play('drop', { vol: 0.8 });
    gsap.delayedCall(0.55, () => Sound.play('soft', { vol: 0.7 }));
    await m3.dispense(tease as 'N' | 'R' | 'SR' | 'SSR');
    await wait(0.15);
  }

  private async capsuleOpen(best: Rarity, tease: Rarity): Promise<void> {
    const layer = this.stageLayer;
    const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.88 });
    dim.alpha = 0;
    layer.addChild(dim);
    gsap.to(dim, { alpha: 1, duration: 0.4 });
    const capC = new Container();
    const g = new Sprite(gtex(`cap_${tease}`));
    g.anchor.set(0.5);
    g.scale.set(190 / g.texture.width);
    capC.addChild(g);
    const ms = this.machine.scale.x;
    capC.position.set(this.machine.x + (MACHINE.chute[0] - MACHINE.dome[0]) * ms, this.machine.y + (MACHINE.chute[1] - MACHINE.dome[1]) * ms);
    capC.scale.set(0.35);
    if (this.m3) {
      // continue exactly where the 3D capsule came to rest, then hand over to the 2D reveal
      const c = this.m3.chutePoint();
      const d = App.toDesign(c.x, c.y);
      capC.position.set(d.x - App.colX, d.y);
      capC.scale.set(0.6);
      this.m3.show(false);
    }
    layer.addChild(capC);
    Sound.play('drop', { vol: 0.8 });
    // pop out of the chute and bounce to center
    const cy = App.H * 0.45;
    await new Promise<void>((r) => {
      const tl = gsap.timeline({ onComplete: r });
      tl.to(capC, { y: capC.y + 40, duration: 0.2, ease: 'power2.in' });
      tl.to(capC, { x: 360, duration: 0.5, ease: 'power2.out' });
      tl.to(capC.scale, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2)' });
      tl.to(capC, { y: cy, duration: 0.5, ease: 'bounce.out' }, '<');
      tl.add(() => Sound.play('soft', { vol: 0.6 }), '-=0.3');
    });
    const hint = txt('タップしてあける！', { size: 32, stroke: 0x2a1630, strokeWidth: 8 });
    hint.position.set(360, cy + 170);
    layer.addChild(hint);
    gsap.to(hint, { alpha: 0.3, duration: 0.5, yoyo: true, repeat: -1 });
    const wob = gsap.to(capC, { rotation: 0.08, duration: 0.18, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    await this.tap(6);
    hint.destroy();
    wob.kill();
    // shake build-up
    for (let i = 0; i < 3; i++) {
      Sound.snare(0.3 + i * 0.15);
      haptic(10);
      await new Promise<void>((r) => gsap.fromTo(capC, { rotation: -0.25 }, { rotation: 0, duration: 0.22, ease: 'elastic.out(1.6,0.3)', onComplete: r }));
      await wait(0.06);
    }
    if (tease !== best) {
      // the upgrade!
      Sound.riser(0.7);
      for (let i = 0; i < 8; i++) {
        gsap.delayedCall(i * 0.07, () => Sound.snare(0.2 + i * 0.05));
      }
      await new Promise<void>((r) => gsap.to(capC, { x: 360 + 8, duration: 0.035, yoyo: true, repeat: 16, onComplete: r }));
      capC.x = 360;
      this.flash(0xffffff, 0.5);
      g.texture = gtex(`cap_${best}`);
      Sound.play('zap', { vol: 0.8 });
      Sound.chord(7);
      haptic([30, 30, 60]);
      this.fx.burst(360, cy, { count: 40, tex: 'star_06', tint: CAP_COLORS[best], add: true, speed: [300, 800], size: [0.1, 0.25] });
      const up = txt('激アツ！！', { size: 70, font: 'dela', color: 0xff4fd8, stroke: 0xffffff, strokeWidth: 12 });
      up.position.set(360, cy - 180);
      layer.addChild(up);
      popIn(up);
      gsap.to(up, { alpha: 0, delay: 0.9, duration: 0.3, onComplete: () => up.destroy() });
      await wait(0.9);
    }
    // burst open
    const raysC = this.raysFor(best);
    raysC.position.set(360, cy);
    layer.addChildAt(raysC, 1);
    Sound.explosion(false);
    Sound.play(best === 'SSR' ? 'jSSR' : best === 'SR' ? 'jSR' : 'packOpen', { vol: 0.8 });
    this.flash(CAP_COLORS[best][0], 0.4);
    const topHalf = new Graphics();
    const botHalf = new Graphics();
    const r = 90;
    const topFill = best === 'SSR' ? rainbow() : CAP_COLORS[best][0];
    topHalf.arc(0, 0, r, Math.PI, 0).lineTo(-r, 0).fill(topFill).stroke({ width: 7, color: 0x2a1630 });
    botHalf.arc(0, 0, r, 0, Math.PI).lineTo(r, 0).fill(0xf6f2ff).stroke({ width: 7, color: 0x2a1630 });
    topHalf.position.set(360, cy);
    botHalf.position.set(360, cy);
    layer.addChild(topHalf, botHalf);
    capC.destroy({ children: true });
    gsap.to(topHalf, { y: cy - 500, rotation: -2, alpha: 0, duration: 0.7, ease: 'power2.out' });
    gsap.to(botHalf, { y: cy + 500, rotation: 1.5, alpha: 0, duration: 0.7, ease: 'power2.out', onComplete: () => (topHalf.destroy(), botHalf.destroy()) });
    this.fx.burst(360, cy, { count: 50, tex: 'star_06', tint: [...CAP_COLORS[best], 0xffffff], add: true, speed: [300, 1000], size: [0.08, 0.24], gravity: 400, life: [0.6, 1.2] });
    gsap.to(raysC, { alpha: 0, delay: 0.6, duration: 0.6, onComplete: () => raysC.destroy() });
    await wait(0.35);
    gsap.to(dim, { alpha: 1, duration: 0.3 });
    gsap.to(this.machine, { alpha: 0, duration: 0.3 });
    this.lastDim = dim;
  }

  private raysFor(r: Rarity): Container {
    const c = new Container();
    const g = new Graphics();
    const colors = CAP_COLORS[r];
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * Math.PI * 2;
      const a1 = a0 + Math.PI / 20;
      g.moveTo(0, 0).lineTo(Math.cos(a0) * 1200, Math.sin(a0) * 1200).lineTo(Math.cos(a1) * 1200, Math.sin(a1) * 1200).closePath().fill({ color: colors[i % colors.length], alpha: 0.35 });
    }
    g.blendMode = 'add';
    c.addChild(g);
    gsap.to(g, { rotation: Math.PI, duration: 8, ease: 'none', repeat: -1 });
    return c;
  }

  private flash(color: number, dur: number): void {
    const f = new Graphics().rect(-App.colX, 0, App.W, App.H).fill(color);
    f.blendMode = 'add';
    this.stageLayer.addChild(f);
    gsap.to(f, { alpha: 0, duration: dur, onComplete: () => f.destroy() });
  }

  /** `again`: re-opened from the 10-pull grid (rewards were already paid there). */
  private async reveal(res: PullResult, again = false): Promise<void> {
    const layer = this.stageLayer;
    const c = new Container();
    const cy = App.H * 0.42;
    c.position.set(360, cy);
    layer.addChild(c);
    const r = RARITY_INFO[res.def.rarity];
    const rays = this.raysFor(res.def.rarity);
    rays.alpha = 0.7;
    c.addChild(rays);
    const glow = new Graphics().circle(0, 0, 230).fill({ color: r.color, alpha: 0.35 });
    c.addChild(glow);
    const art = new Sprite(bigTexture(res.def));
    art.anchor.set(0.5, 0.6);
    art.scale.set(0);
    c.addChild(art);
    gsap.to(art.scale, { x: 1.4, y: 1.4, duration: 0.7, ease: 'elastic.out(1.1,0.45)' });
    gsap.delayedCall(0.8, () => {
    });
    gsap.to(art, { y: -20, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 0.7 });
    Sound.play('powerUp2', { vol: 0.7 });
    haptic(20);
    const rb = new Container();
    const rbg = new Graphics().roundRect(-70, -30, 140, 60, 30).fill(r.color);
    rbg.roundRect(-70, -30, 140, 60, 30).stroke({ width: 5, color: 0xffffff });
    rb.addChild(rbg, txt(res.def.rarity, { size: 38, font: 'dela', stroke: 0x2a1630, strokeWidth: 7 }));
    rb.position.set(0, 220);
    c.addChild(rb);
    popIn(rb, 0.3);
    const st = stars(0, 50, r.stars);
    st.y = 285;
    c.addChild(st);
    for (let i = 0; i < r.stars; i++) {
      gsap.delayedCall(0.45 + i * 0.18, () => {
        const sg = st.children[i] as Graphics;
        sg.clear();
        sg.tint = 0xffffff;
        const g2 = sg;
        g2.poly(starPts(25)).fill(0xffd23f).stroke({ width: 4, color: 0x6a3a00 });
        g2.scale.set(1.8);
        gsap.to(g2.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
        Sound.play('bell', { vol: 0.35, rate: 1 + i * 0.15 });
        Sound.link(i * 3 + 4);
      });
    }
    const name = txt(res.def.name, { size: 64, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    name.y = 360;
    c.addChild(name);
    popIn(name, 0.4);
    const sk = txt(`必殺技「${res.def.skill.name}」\n${res.def.skill.desc}${res.def.passive ? `\nパッシブ★${res.def.passive.name}` : ''}`, { size: 24, color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 6, align: 'center', lineHeight: 34 });
    sk.y = 432;
    c.addChild(sk);
    popIn(sk, 0.55);
    const badgeText = res.isNew ? 'NEW!' : res.maxed ? 'MAX！コイン+50' : `限界突破 +${res.plus}！`;
    if (res.maxed && !again) {
      Save.data.coins += 50;
      Save.write();
      this.coins.refresh();
    }
    const badge = txt(badgeText, { size: 40, font: 'dela', color: res.isNew ? 0xff4f8f : 0x36a2ff, stroke: 0xffffff, strokeWidth: 10 });
    badge.position.set(150, -200);
    badge.rotation = 0.2;
    c.addChild(badge);
    popIn(badge, 0.6);
    gsap.delayedCall(0.6, () => Sound.play(res.isNew ? 'jLevel' : 'powerUp', { vol: 0.6 }));
    Sound.play(res.def.rarity === 'SSR' ? 'jSSR' : res.def.rarity === 'SR' ? 'jSR' : res.def.rarity === 'R' ? 'jR' : 'jN', { vol: 0.6 });
    if (rarityRank(res.def.rarity) >= 2) {
      for (let i = 0; i < 5; i++) gsap.delayedCall(i * 0.25, () => this.fx.burst(360 + (Math.random() - 0.5) * 500, cy + (Math.random() - 0.5) * 400, { count: 14, tex: 'star_06', tint: [r.color, 0xffffff], add: true, speed: [100, 400], size: [0.08, 0.2] }));
    }
    await wait(1.0);
    const next = txt('タップでつぎへ', { size: 26, stroke: 0x2a1630, strokeWidth: 6 });
    next.y = 510;
    c.addChild(next);
    gsap.to(next, { alpha: 0.3, duration: 0.5, yoyo: true, repeat: -1 });
    await this.tap();
    await new Promise<void>((res2) => gsap.to(c, { alpha: 0, duration: 0.25, onComplete: res2 }));
    c.destroy({ children: true });
  }

  private async grid(results: PullResult[]): Promise<void> {
    const layer = this.stageLayer;
    const c = new Container();
    layer.addChild(c);
    const cw = 124;
    const ch = 170;
    const gap = 12;
    const y0 = App.H * 0.3;
    const cards: Container[] = [];
    const skip = new Button({ w: 160, h: 66, label: 'スキップ', color: 'grey', size: 26, onTap: () => (this.skipAll = true) });
    skip.position.set(600, App.safeTop + 60);
    c.addChild(skip);
    results.forEach((_res, i) => {
      const card = new Container();
      const x = 360 + ((i % 5) - 2) * (cw + gap);
      const y = y0 + Math.floor(i / 5) * (ch + gap + 40);
      card.position.set(360, App.H + 200);
      const back = new Graphics();
      back.roundRect(-cw / 2, -ch / 2, cw, ch, 18).fill(grad([[0, '#8a5cff'], [1, '#4a2a9a']]));
      back.roundRect(-cw / 2, -ch / 2, cw, ch, 18).stroke({ width: 5, color: 0xffffff });
      back.circle(0, 0, 30).fill({ color: 0xffffff, alpha: 0.2 });
      card.addChild(back);
      c.addChild(card);
      cards.push(card);
      gsap.to(card, { x, y, duration: 0.35, delay: i * 0.06, ease: 'power3.out' });
      gsap.delayedCall(i * 0.06, () => Sound.play('cardSlide', { vol: 0.5, rate: 0.9 + Math.random() * 0.3 }));
    });
    await wait(this.skipAll ? 0 : 0.9);
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const card = cards[i];
      const r = RARITY_INFO[res.def.rarity];
      const high = rarityRank(res.def.rarity) >= 2;
      if (high && !this.skipAll) await wait(0.25);
      await new Promise<void>((done) => {
        gsap.to(card.scale, {
          x: 0, duration: this.skipAll ? 0.02 : 0.1, onComplete: () => {
            card.removeChildren().forEach((ch2) => ch2.destroy());
            const f = new Graphics();
            f.roundRect(-cw / 2, -ch / 2, cw, ch, 18).fill(grad([[0, '#ffffff'], [1, '#efe6ff']]));
            f.roundRect(-cw / 2, -ch / 2, cw, ch, 18).stroke({ width: 6, color: r.color });
            if (res.def.rarity === 'SSR') f.roundRect(-cw / 2 + 6, -ch / 2 + 6, cw - 12, ch - 12, 14).stroke({ width: 3, color: 0xffc71f });
            card.addChild(f);
            const sp = new Sprite(bigTexture(res.def));
            sp.anchor.set(0.5, 0.55);
            sp.scale.set(96 / Math.max(1, sp.texture.width));
            sp.y = -12;
            card.addChild(sp);
            const rl = txt(res.def.rarity, { size: 22, font: 'dela', color: r.color, stroke: 0x2a1630, strokeWidth: 5 });
            rl.position.set(0, -ch / 2 + 18);
            const nm = txt(res.def.name, { size: 20, color: 0x4a2f7a });
            nm.y = ch / 2 - 22;
            card.addChild(rl, nm);
            if (res.isNew || res.plusUp) {
              const b = txt(res.isNew ? 'NEW' : `+${res.plus}`, { size: 20, font: 'dela', color: res.isNew ? 0xff4f8f : 0x36a2ff, stroke: 0xffffff, strokeWidth: 5 });
              b.position.set(cw / 2 - 18, -ch / 2 + 4);
              b.rotation = 0.3;
              card.addChild(b);
            }
            if (res.maxed) Save.data.coins += 50;
            gsap.to(card.scale, { x: 1, duration: this.skipAll ? 0.02 : 0.15, ease: 'back.out(2)', onComplete: done });
            if (!this.skipAll) {
              Sound.play('cardFan', { vol: 0.5 });
              if (high) {
                Sound.play(res.def.rarity === 'SSR' ? 'jSSR' : 'jSR', { vol: 0.6 });
                haptic(25);
                this.fx.burst(card.x, card.y, { count: 20, tex: 'star_06', tint: [r.color, 0xffffff], add: true, speed: [150, 450], size: [0.08, 0.18] });
                gsap.fromTo(card.scale, { y: 1.3 }, { y: 1, duration: 0.5, ease: 'elastic.out(1.2,0.4)' });
              } else Sound.link(i);
            }
          },
        });
      });
      if (!this.skipAll) await wait(high ? 0.35 : 0.08);
    }
    Save.write();
    this.coins.refresh();
    skip.destroy();
    // spotlight the best SSR with a full reveal
    const ssr = results.find((r) => r.def.rarity === 'SSR');
    const ok = new Button({ w: 300, h: 100, label: 'OK', color: 'pink', size: 40, onTap: () => {} });
    ok.position.set(360, App.H - App.safeBottom - 120);
    c.addChild(ok);
    popIn(ok);
    this.skipAll = false;
    if (ssr) {
      const hint = txt('SSRをタップでくわしく見る', { size: 24, stroke: 0x2a1630, strokeWidth: 6, color: 0xfff27a });
      hint.position.set(360, App.H - App.safeBottom - 210);
      c.addChild(hint);
    }
    await new Promise<void>((done) => {
      ok.removeAllListeners('pointerup');
      ok.on('pointerup', () => {
        Sound.play('ui_tap');
        done();
      });
      cards.forEach((card, i) => {
        if (results[i].def.rarity !== 'SSR') return;
        card.eventMode = 'static';
        card.cursor = 'pointer';
        card.on('pointertap', async () => {
          c.visible = false;
          await this.reveal(results[i], true);
          c.visible = true;
        });
      });
    });
    await new Promise<void>((done) => gsap.to(c, { alpha: 0, duration: 0.25, onComplete: done }));
    c.destroy({ children: true });
  }

  private clearStage(): void {
    const dim = this.lastDim;
    this.lastDim = null;
    if (dim && !dim.destroyed) gsap.to(dim, { alpha: 0, duration: 0.3, onComplete: () => dim.destroy() });
    if (this.m3) {
      this.m3.resetDispensed();
      this.m3.setDolly(0);
      this.m3.show(true);
    }
    gsap.to(this.machine, { alpha: 1, duration: 0.3 });
  }

  resize(): void {
    if (this.m3) {
      const r = App.pixi.canvas.getBoundingClientRect();
      const k = App.scale;
      const m = this.m3Rect;
      this.m3.setRect(r.left + (App.colX + m.x) * k, r.top + m.y * k, m.w * k, m.h * k);
    }
    this.bg.layout(App.W, App.H);
    this.shade.clear().rect(0, 0, App.W, App.H).fill(grad([[0, 'rgba(30,10,60,0.55)'], [0.5, 'rgba(40,10,70,0.25)'], [1, 'rgba(20,6,40,0.75)']]));
    this.col.x = App.colX;
  }

  update(dt: number): void {
    this.t += dt;
    this.bg.update(dt);
    this.fx.update(dt);
    this.m3?.update(dt);
    this.rays.rotation += dt * 0.15;
    this.pickArts.forEach((a, i) => (a.y = 2 + Math.sin(this.t * 2.4 + i * 1.3) * 6));
    // drifting sparkles
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.25;
      this.fx.burst(Math.random() * 720, App.H * (0.3 + Math.random() * 0.6), { count: 1, tex: 'star_06', tint: [0xfff27a, 0xffffff, 0xff9ad8], add: true, speed: [10, 40], size: [0.05, 0.1], gravity: -30, life: [0.8, 1.6] });
    }
    if (this.shaking > 0) {
      this.shaking -= dt;
      for (const c of this.caps) {
        c.b.velocity.x += (Math.random() - 0.5) * 9000 * dt;
        c.b.velocity.y -= Math.random() * 11000 * dt;
      }
    }
    const h = Math.min(dt, 1 / 30) / 2;
    this.world.step(h);
    this.world.step(h);
    for (const c of this.caps) {
      c.a += (c.b.velocity.x / c.b.r) * dt;
      c.g.position.set(c.b.position.x, c.b.position.y);
      c.g.rotation = c.a;
    }
  }

  exit(): void {
    this.m3?.destroy();
    this.m3 = null;
    this.world.clear();
    void unloadFairy(BG_SET);
  }
}

function starPts(r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return pts;
}

function wait(s: number): Promise<void> {
  return new Promise((r) => gsap.delayedCall(s, r));
}

