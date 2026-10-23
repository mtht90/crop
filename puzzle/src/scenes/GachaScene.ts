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
import { RARITY_INFO, shortDate, type Rarity } from '../data/characters';
import { COST_SINGLE, COST_TEN, MAXED_COINS, PITY, charRates, gachaPool, limitedNow, pull, type PullResult } from '../data/gacha';
import { HomeScene } from './HomeScene';
import { urAura } from '../game/Aura';
import { CoinCounter } from './common';

/** The one capsule look used for every pull. */
const CAP: Rarity = 'R';
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
    this.coins = new CoinCounter('left');
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
    // a limited character takes the whole plaque while it's out
    const limited = limitedNow();
    const tl = txt(limited.length ? '期間限定！' : 'にじいろ',  { size: 24, font: 'dela', stroke: 0x5a0a2a, strokeWidth: 5 });
    tl.position.copyFrom(tag.position);
    tl.rotation = tag.rotation;
    p.addChild(board);
    if (limited.length) {
      const info = txt(`${shortDate(limited[0].limitedUntil!)}まで\n出現率アップ中！`, { size: 24, color: 0xd81b60, align: 'center', lineHeight: 32 });
      info.position.set(170, 0);
      p.addChild(info);
    }
    const ssr = limited.length ? limited : gachaPool().filter((c) => c.rarity === 'SSR');
    const step = Math.min(180, 470 / Math.max(1, ssr.length - 1));
    const x0 = limited.length ? -90 : 0;
    // a lone limited character is shown bigger
    const big = limited.length === 1 ? 1.2 : 1;
    ssr.forEach((c, i) => {
      const x = x0 + (i - (ssr.length - 1) / 2) * step;
      const halo = new Graphics().circle(0, 0, 66 * big).fill(grad([[0, '#fff6c0'], [1, '#ffb020']]));
      halo.circle(0, 0, 66 * big).stroke({ width: 5, color: 0xffffff });
      halo.position.set(x, 2);
      const art = new Sprite(bigTexture(c));
      art.anchor.set(0.5, 0.55);
      art.scale.set((130 * big) / Math.max(1, art.texture.width));
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
    const rates = new Button({ w: 150, h: 58, label: '提供割合', color: 'purple', size: 22, onTap: () => this.showRates() });
    rates.position.set(620, App.safeTop + 160);
    this.buttons = [one, ten, rates];
    this.ui.addChild(one, ten, rates);
    this.refreshTicket();
  }

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
    // the 3D machine draws above the 2D layer, so it steps aside while the list is open
    this.m3?.show(false);
    dim.on('pointertap', () => {
      ov.destroy({ children: true });
      this.m3?.show(true);
    });
    const box = new Container();
    box.position.set(360, App.H / 2);
    const h = 1120;
    box.scale.set(Math.min(1, (App.H - 40) / h));
    box.addChild(panel(660, h, { color: 0xfdf7ff }));
    box.eventMode = 'static';
    const t = txt('提供割合', { size: 44, font: 'dela', color: 0x4a2f7a });
    t.y = -h / 2 + 60;
    box.addChild(t);
    // every character's chance per pull, two columns
    const list = charRates();
    const rows = Math.ceil(list.length / 2);
    const lh = Math.min(34, (h - 230) / rows);
    list.forEach(({ def, rate }, i) => {
      const col = i < rows ? 0 : 1;
      const y = -h / 2 + 120 + (i % rows) * lh;
      const nm = txt(`[${def.ur ? 'UR' : def.rarity}] ${def.name}`, { size: 18, color: 0x4a2f7a, anchor: [0, 0.5] });
      nm.position.set(-300 + col * 310, y);
      if (nm.width > 190) nm.scale.set(190 / nm.width);
      const v = txt(`${(rate * 100).toFixed(2)}%`, { size: 18, color: 0x7a6a9a, anchor: [1, 0.5] });
      v.position.set(-20 + col * 310, y);
      box.addChild(nm, v);
    });
    const n = txt(`10連はSR以上が1体以上確定\nSSRは${PITY}回引くまでに必ず1体出ます`, { size: 18, color: 0x7a6a9a, align: 'center', lineHeight: 28 });
    n.y = h / 2 - 66;
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
    // tease: the capsule sometimes shows a lower rarity first and upgrades on opening
    // every capsule looks the same: the odds differ per character but nothing on screen tells them apart
    const tease: Rarity = CAP;
    await this.crank();
    if (n === 1) {
      if (this.m3) await this.dispense3D(tease);
      await this.capsuleOpen(CAP, tease);
      await this.reveal(results[0]);
    } else await this.capsules(results);
    this.clearStage();
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
    const r = RARITY_INFO.SR;
    const rays = this.raysFor('SR');
    rays.alpha = 0.7;
    c.addChild(rays);
    const glow = new Graphics().circle(0, 0, 230).fill({ color: r.color, alpha: 0.35 });
    c.addChild(glow);
    if (res.def.ur) {
      const aura = urAura(240);
      aura.y = -30;
      c.addChild(aura);
    }
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
    const ri = RARITY_INFO[res.def.rarity];
    const rb = new Container();
    const rbg = new Graphics().roundRect(-70, -30, 140, 60, 30).fill(res.def.ur ? 0xffb020 : ri.color);
    rbg.roundRect(-70, -30, 140, 60, 30).stroke({ width: 5, color: 0xffffff });
    rb.addChild(rbg, txt(res.def.ur ? 'UR' : res.def.rarity, { size: 38, font: 'dela', stroke: 0x2a1630, strokeWidth: 7 }));
    rb.position.set(0, 220);
    c.addChild(rb);
    popIn(rb, 0.3);
    const name = txt(res.def.name, { size: 64, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    name.y = 300;
    c.addChild(name);
    popIn(name, 0.4);
    const sk = txt(`必殺技「${res.def.skill.name}」\n${res.def.skill.desc}${res.def.passive ? `\nパッシブ★${res.def.passive.name}` : ''}`, { size: 24, color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 6, align: 'center', lineHeight: 34 });
    sk.y = 380;
    c.addChild(sk);
    popIn(sk, 0.55);
    const badgeText = res.isNew ? 'NEW!' : res.skillUp ? `スキルLv.${res.skill}！` : res.maxed ? `MAX！コイン+${MAXED_COINS}` : `限界突破 +${res.plus}！`;
    if (res.maxed && !again) {
      Save.data.coins += MAXED_COINS;
      Save.write();
      this.coins.refresh();
    }
    const badge = txt(badgeText, { size: 40, font: 'dela', color: res.isNew ? 0xff4f8f : 0x36a2ff, stroke: 0xffffff, strokeWidth: 10 });
    badge.position.set(150, -200);
    badge.rotation = 0.2;
    c.addChild(badge);
    popIn(badge, 0.6);
    gsap.delayedCall(0.6, () => Sound.play(res.isNew ? 'jLevel' : 'powerUp', { vol: 0.6 }));
    Sound.play(res.isNew ? 'jSR' : 'jR', { vol: 0.6 });
    if (res.isNew) {
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

  /** Where capsules come out of the machine (stage coordinates). */
  private chutePos(): { x: number; y: number } {
    if (this.m3) {
      const c = this.m3.chutePoint();
      const d = App.toDesign(c.x, c.y);
      return { x: d.x - App.colX, y: d.y };
    }
    const ms = this.machine.scale.x;
    return { x: this.machine.x + (MACHINE.chute[0] - MACHINE.dome[0]) * ms, y: this.machine.y + (MACHINE.chute[1] - MACHINE.dome[1]) * ms };
  }

  /**
   * 10 pulls, Puni Puni style: ten capsules spill out and hang in a zigzag (1-2-1-2-1-2-1) in front of
   * the machine, each saying タップ!. Tapping one cracks it open; new characters and the UR get the full
   * reveal. すべてあける opens the rest in a row. A summary closes the round.
   */
  private async capsules(results: PullResult[]): Promise<void> {
    const layer = this.stageLayer;
    // the 3D machine draws above the 2D layer: swap it for a still copy so the capsules can sit in front
    let still: Sprite | null = null;
    if (this.m3) {
      const r = this.m3.canvas.getBoundingClientRect();
      const a0 = App.toDesign(r.left, r.top);
      const a1 = App.toDesign(r.right, r.bottom);
      still = new Sprite(Texture.from(this.m3.snapshot()));
      still.position.set(a0.x - App.colX, a0.y);
      still.width = a1.x - a0.x;
      still.height = a1.y - a0.y;
      layer.addChild(still);
      this.m3.show(false);
    }
    const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.45 });
    dim.alpha = 0;
    layer.addChild(dim);
    gsap.to(dim, { alpha: 1, duration: 0.5, delay: 0.2 });
    this.lastDim = dim;
    const c = new Container();
    layer.addChild(c);
    const top = App.safeTop + 150;
    const rowGap = (App.H - App.safeBottom - 200 - top) / 6;
    const slots: { x: number; y: number }[] = [];
    for (let row = 0; row < 7; row++) {
      if (row % 2 === 0) slots.push({ x: 360, y: top + row * rowGap });
      else slots.push({ x: 160, y: top + row * rowGap }, { x: 560, y: top + row * rowGap });
    }
    const from = this.chutePos();
    const balls: Container[] = [];
    const opened = results.map(() => false);
    let left = results.length;
    let news = 0;
    let busy = false;
    let auto = false;
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    const all = new Button({ w: 230, h: 76, label: 'すべてあける', color: 'yellow', size: 28, onTap: () => void openAll() });
    all.position.set(580, App.safeTop + 60);
    all.alpha = 0;
    c.addChild(all);
    results.forEach((_r, i) => {
      const ball = new Container();
      const sp = new Sprite(gtex(`cap_${CAP}`));
      sp.anchor.set(0.5);
      sp.scale.set(128 / sp.texture.width);
      const tap = txt('タップ!', { size: 40, font: 'dela', color: 0xff3b5c, stroke: 0xffffff, strokeWidth: 9 });
      tap.rotation = -0.12;
      ball.addChild(sp, tap);
      ball.position.set(from.x, from.y);
      ball.scale.set(0.3);
      c.addChild(ball);
      balls.push(ball);
      // after the machine rumbles, each capsule pops out of the chute, arcs up and bounces into its spot
      const d = 1.3 + i * 0.26;
      ball.alpha = 0;
      const peak = Math.max(App.safeTop + 40, Math.min(from.y, slots[i].y) - 150 - Math.random() * 60);
      gsap.set(ball, { alpha: 1, delay: d });
      gsap.to(ball, { x: slots[i].x, duration: 0.75, delay: d, ease: 'power1.out' });
      gsap.to(ball, { y: peak, duration: 0.3, delay: d, ease: 'power2.out' });
      gsap.to(ball, { y: slots[i].y, duration: 0.45, delay: d + 0.3, ease: 'bounce.out' });
      gsap.to(ball, { rotation: (Math.random() < 0.5 ? -1 : 1) * Math.PI * 2, duration: 0.75, delay: d, ease: 'power1.out' });
      gsap.to(ball.scale, { x: 1, y: 1, duration: 0.5, delay: d, ease: 'back.out(1.6)' });
      gsap.delayedCall(d, () => {
        Sound.play('drop', { vol: 0.5, rate: 0.9 + Math.random() * 0.3 });
        Sound.play('pep', { vol: 0.3, rate: 1 + i * 0.05 });
        this.fx.burst(from.x, from.y, { count: 8, tex: 'star_06', tint: [0xffffff, 0xfff27a], add: true, speed: [100, 300], size: [0.06, 0.12], life: [0.3, 0.5] });
      });
      gsap.delayedCall(d + 0.75, () => Sound.play('soft', { vol: 0.35 }));
      gsap.to(tap.scale, { x: 1.12, y: 1.12, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: Math.random() * 0.4 });
      gsap.to(ball, { y: `+=${6}`, duration: 1 + Math.random() * 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: d + 0.8 });
      ball.eventMode = 'static';
      ball.cursor = 'pointer';
      ball.on('pointertap', () => void open(i));
    });
    // the machine rumbles and shakes before anything comes out
    const shaker = still ?? this.machine;
    const sx = shaker.x;
    Sound.play('diceShake', { vol: 0.9 });
    for (let k = 0; k < 6; k++) gsap.delayedCall(k * 0.18, () => Sound.play('switch', { vol: 0.5, rate: 0.7 + k * 0.08 }));
    gsap.to(shaker, { x: sx + 8, duration: 0.05, yoyo: true, repeat: 21, ease: 'sine.inOut', onComplete: () => void (shaker.x = sx) });
    gsap.delayedCall(1.15, () => {
      this.flash(0xffffff, 0.25);
      haptic([20, 30, 20]);
    });
    gsap.to(all, { alpha: 1, duration: 0.3, delay: 1.3 + results.length * 0.26 + 0.6 });

    const open = async (i: number, quick = false): Promise<void> => {
      if (opened[i] || (busy && !quick)) return;
      opened[i] = true;
      busy = true;
      const res = results[i];
      const ball = balls[i];
      gsap.killTweensOf(ball);
      ball.y = slots[i].y;
      ball.eventMode = 'none';
      if (res.isNew) news++;
      // a little rattle, then it cracks open
      Sound.snare(0.3);
      haptic(10);
      await new Promise<void>((r) => gsap.fromTo(ball, { rotation: -0.25 }, { rotation: 0, duration: quick ? 0.12 : 0.25, ease: 'elastic.out(1.6,0.3)', onComplete: r }));
      ball.removeChildren().forEach((ch2) => ch2.destroy());
      if (res.def.ur) ball.addChild(urAura(78));
      const halo = new Graphics().circle(0, 0, 60).fill({ color: 0xffffff, alpha: 0.18 });
      ball.addChild(halo);
      const art = new Sprite(bigTexture(res.def));
      art.anchor.set(0.5, 0.55);
      const k = 112 / Math.max(1, art.texture.width);
      art.scale.set(0);
      ball.addChild(art);
      gsap.to(art.scale, { x: k, y: k, duration: 0.35, ease: 'back.out(2.5)' });
      const nm = txt(res.def.name, { size: 22, stroke: 0x2a1630, strokeWidth: 6 });
      nm.y = 64;
      if (nm.width > 200) nm.scale.set(200 / nm.width);
      ball.addChild(nm);
      if (res.isNew || res.skillUp || res.plusUp) {
        const b = txt(res.isNew ? 'NEW' : res.skillUp ? `SL${res.skill}` : `+${res.plus}`, { size: res.isNew ? 26 : 22, font: 'dela', color: res.isNew ? 0xff4f8f : 0x36a2ff, stroke: 0xffffff, strokeWidth: 6 });
        b.position.set(52, -46);
        b.rotation = 0.3;
        ball.addChild(b);
      }
      if (res.maxed) Save.data.coins += MAXED_COINS;
      Sound.explosion(false);
      Sound.play(res.isNew ? 'jSR' : 'packOpen', { vol: 0.6 });
      this.fx.burst(ball.x, ball.y, { count: 22, tex: 'star_06', tint: [...CAP_COLORS[CAP], 0xffffff], add: true, speed: [150, 480], size: [0.07, 0.18] });
      left--;
      // new characters and the UR come out big
      if (res.def.ur || (res.isNew && !auto)) {
        await wait(0.35);
        c.visible = false;
        await this.reveal(res, true);
        c.visible = true;
      } else await wait(quick ? 0.12 : 0.25);
      busy = false;
      if (left === 0) finish();
    };
    const openAll = async (): Promise<void> => {
      if (auto) return;
      auto = true;
      all.visible = false;
      while (busy) await wait(0.05);
      for (let i = 0; i < results.length; i++) if (!opened[i]) await open(i, true);
    };
    await done;
    all.destroy();
    Save.write();
    this.coins.refresh();
    const sum = txt(`NEW ${news}体`, { size: 34, color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 8 });
    sum.position.set(360, App.safeTop + 60);
    c.addChild(sum);
    popIn(sum);
    const ok = new Button({ w: 300, h: 100, label: 'OK', color: 'pink', size: 40, onTap: () => {} });
    ok.position.set(360, App.H - App.safeBottom - 90);
    c.addChild(ok);
    popIn(ok);
    this.skipAll = false;
    await new Promise<void>((resolve) => {
      ok.removeAllListeners('pointerup');
      ok.on('pointerup', () => {
        Sound.play('ui_tap');
        resolve();
      });
      balls.forEach((ball, i) => {
        ball.eventMode = 'static';
        ball.on('pointertap', async () => {
          c.visible = false;
          await this.reveal(results[i], true);
          c.visible = true;
        });
      });
    });
    await new Promise<void>((r) => gsap.to(c, { alpha: 0, duration: 0.25, onComplete: r }));
    c.destroy({ children: true });
    still?.destroy({ texture: true });
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

