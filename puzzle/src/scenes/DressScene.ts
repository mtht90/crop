import { Assets, Container, Graphics, type Texture } from 'pixi.js';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, coinIcon, fmt, grad, panel, popIn, txt } from '../core/UI';
import { tex } from '../core/Loader';
import { MenuBackground } from '../game/Backdrop';
import { COLORS } from '../art/PieceArt';
import {
  FRAMES, LINES, PRICE, WALLPAPERS, buyLook, equip, equipped, loadWallpapers, ownsLook, wallpaperAlias,
  type Frame, type LineStyle, type LookKind, type Star, type Wallpaper,
} from '../data/cosmetics';
import { unlockHint } from '../data/missions';
import { HomeScene } from './HomeScene';
import { CoinCounter, ScrollBox, menuBar } from './common';

type Item = Wallpaper | Frame | LineStyle;
const TABS: [LookKind, string][] = [['wallpaper', 'かべがみ'], ['frame', 'フレーム'], ['line', 'ライン']];

/** Wallpapers, board frames and trace lines: won through missions or bought with coins. */
export class DressScene extends Scene {
  private bg = new MenuBackground(0x36c2a0, 0x3a7bff, 2);
  private col = new Container();
  private coins = new CoinCounter('left');
  private list!: ScrollBox;
  private tab: LookKind = 'wallpaper';
  private tabs = {} as Record<LookKind, Button>;

  async preload(): Promise<void> {
    await loadWallpapers(WALLPAPERS.map((w) => w.id));
  }

  enter(): void {
    this.view.addChild(this.bg, this.col);
    Sound.music('home', 0.8);
    const top = App.safeTop + 16;
    menuBar(this.col, 150);
    const title = txt('きせかえ', { size: 52, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    title.position.set(360, top + 46);
    const back = new Button({ w: 150, h: 76, label: 'もどる', color: 'grey', size: 28, sound: 'ui_back', onTap: () => Scenes.go(() => new HomeScene()) });
    back.position.set(100, top + 46);
    this.coins.position.set(500, top + 118);
    this.col.addChild(title, back, this.coins);
    const ty = top + 190;
    TABS.forEach(([k, label], i) => {
      const b = new Button({ w: 210, h: 76, label, color: 'grey', size: 28, onTap: () => this.show(k) });
      b.position.set(130 + i * 230, ty);
      this.tabs[k] = b;
      this.col.addChild(b);
    });
    const y0 = ty + 56;
    this.list = new ScrollBox(720, App.H - y0 - App.safeBottom - 10);
    this.list.position.set(360, y0);
    this.col.addChild(this.list);
    this.show('wallpaper');
  }

  private show(t: LookKind): void {
    this.tab = t;
    for (const [k, b] of Object.entries(this.tabs)) b.alpha = k === t ? 1 : 0.55;
    const c = this.list.content;
    const keepY = c.y;
    for (const ch of c.removeChildren()) ch.destroy({ children: true });
    const items: Item[] = t === 'wallpaper' ? WALLPAPERS : t === 'frame' ? FRAMES : LINES;
    items.forEach((it, i) => {
      const tile = this.tile(t, it);
      tile.position.set(-220 + (i % 3) * 220, 30 + Math.floor(i / 3) * 300 + 140);
      c.addChild(tile);
    });
    this.list.contentH = 30 + Math.ceil(items.length / 3) * 300;
    c.y = keepY;
  }

  private rimTexture(fr: Frame): Texture | null {
    if (!fr.rim.tex) return null;
    return fr.rim.tex.startsWith('wp:') ? Assets.get<Texture>(wallpaperAlias(fr.rim.tex.slice(3))) : tex(fr.rim.tex);
  }

  /** A little bowl: the wallpaper inside the frame, and for lines a short sample trace. */
  private preview(wp: Wallpaper, fr: Frame, line: LineStyle | null, r: number): Container {
    const c = new Container();
    const g = new Graphics();
    const rim = this.rimTexture(fr);
    g.circle(0, 4, r + 16).fill({ color: 0x000000, alpha: 0.3 });
    if (rim) g.circle(0, 0, r + 16).fill({ texture: rim, textureSpace: 'local' });
    else g.circle(0, 0, r + 16).fill(grad(fr.rim.stops!));
    g.circle(0, 0, r + 16).stroke({ width: 4, color: fr.line });
    g.circle(0, 0, r + 6).stroke({ width: 6, color: fr.edge });
    if (wp.img) {
      g.circle(0, 0, r).fill({ texture: Assets.get<Texture>(wallpaperAlias(wp.id)), textureSpace: 'local' });
      g.circle(0, 0, r).fill({ color: 0x0a0618, alpha: 0.2 });
    } else g.circle(0, 0, r).fill(grad([[0, '#2c4a2a'], [1, '#132416']]));
    c.addChild(g);
    if (line) {
      const pts = [[-42, 22], [-14, -18], [16, 14], [44, -22]];
      const l = new Graphics();
      const col = (v: LineStyle['body'], i: number) => (v === 'piece' ? COLORS[0].hex : v === 'rainbow' ? COLORS[i % 5].hex : v);
      for (let i = 1; i < pts.length; i++) {
        l.moveTo(pts[i - 1][0], pts[i - 1][1]).lineTo(pts[i][0], pts[i][1]);
        l.stroke({ width: 18, color: col(line.glow, i), alpha: 0.45, cap: 'round' });
      }
      for (let i = 1; i < pts.length; i++) {
        l.moveTo(pts[i - 1][0], pts[i - 1][1]).lineTo(pts[i][0], pts[i][1]);
        l.stroke({ width: 9, color: col(line.body, i + 2), cap: 'round' });
      }
      l.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) l.lineTo(x, y);
      l.stroke({ width: 3, color: line.core, cap: 'round', join: 'round' });
      for (const [x, y] of pts) l.circle(x, y, 6).fill(line.core);
      c.addChild(l);
    }
    return c;
  }

  private tile(t: LookKind, it: Item): Container {
    const owned = ownsLook(t, it.id);
    const on = equipped(t) === it.id;
    const c = new Container();
    const bg = new Graphics();
    bg.roundRect(-100, -134, 200, 284, 26).fill({ color: 0x000000, alpha: 0.2 });
    bg.roundRect(-100, -140, 200, 284, 26).fill(on ? grad([[0, '#fff6c8'], [1, '#ffe08a']]) : 0xfdf7ff);
    bg.roundRect(-100, -140, 200, 284, 26).stroke({ width: on ? 6 : 4, color: on ? 0xff9a00 : 0x8a6cff });
    c.addChild(bg);
    const look = Save.data.look;
    const wp = t === 'wallpaper' ? (it as Wallpaper) : WALLPAPERS.find((w) => w.id === look.wallpaper) ?? WALLPAPERS[0];
    const fr = t === 'frame' ? (it as Frame) : FRAMES.find((f) => f.id === look.frame) ?? FRAMES[0];
    const pv = this.preview(wp, fr, t === 'line' ? (it as LineStyle) : null, 64);
    pv.y = -52;
    c.addChild(pv);
    if (it.star > 0) {
      const st = txt('★'.repeat(it.star), { size: 22, color: 0xffb020, stroke: 0x6a3a00, strokeWidth: 4 });
      st.position.set(0, -126);
      c.addChild(st);
    }
    const nm = txt(it.name, { size: 24, color: 0x4a2f7a });
    nm.y = 50;
    if (nm.width > 184) nm.scale.set(184 / nm.width);
    c.addChild(nm);
    if (on) {
      const ok = txt('そうびちゅう', { size: 22, color: 0xff6a00 });
      ok.y = 96;
      c.addChild(ok);
    } else if (owned) {
      const hint = txt('タップでそうび', { size: 20, color: 0x8a6cff });
      hint.y = 96;
      c.addChild(hint);
    } else {
      // price tag (missions can also unlock some for free)
      const price = new Container();
      const pg = new Graphics().roundRect(-80, -20, 160, 40, 20).fill(Save.data.coins >= PRICE[it.star] ? 0xff4f8f : 0x9a8cb8);
      const ci = coinIcon(12);
      ci.x = -58;
      const pt = txt(fmt(PRICE[it.star]), { size: 22, anchor: [0, 0.5], stroke: 0x2a1630, strokeWidth: 4 });
      pt.x = -40;
      price.addChild(pg, ci, pt);
      price.y = 92;
      c.addChild(price);
      const hint = unlockHint(t === 'line' ? 'frame' : t, it.id);
      if (hint && t !== 'line') {
        const ht = txt(`or ${hint}`, { size: 15, color: 0x8a6cff, wrap: 180 });
        ht.y = 126;
        if (ht.height > 30) ht.scale.set(30 / ht.height);
        c.addChild(ht);
      }
    }
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => {
      if (owned) {
        equip(t, it.id);
        Sound.play('ui_ok');
        return this.show(this.tab);
      }
      this.confirmBuy(t, it);
    });
    return c;
  }

  private confirmBuy(t: LookKind, it: Item): void {
    const price = PRICE[it.star as Star];
    const ov = new Container();
    const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.6 });
    dim.eventMode = 'static';
    const box = new Container();
    box.position.set(360, App.H * 0.45);
    const enough = Save.data.coins >= price;
    const q = txt(`「${it.name}」を\n${fmt(price)}コインでかう？`, { size: 32, color: 0x4a2f7a, lineHeight: 46 });
    q.y = -70;
    const have = txt(`もっているコイン ${fmt(Save.data.coins)}`, { size: 22, color: enough ? 0x8a6cff : 0xd81b60 });
    have.y = 10;
    const close = () => ov.destroy({ children: true });
    const yes = new Button({
      w: 220, h: 86, label: enough ? 'かう' : 'たりない', color: enough ? 'pink' : 'grey', size: 32, onTap: () => {
        if (!buyLook(t, it.id, it.star)) return Sound.play('ui_error');
        equip(t, it.id);
        Sound.play('powerUp2', { vol: 0.7 });
        Sound.sparkle();
        this.coins.refresh();
        close();
        this.show(this.tab);
      },
    });
    yes.position.set(-120, 100);
    const no = new Button({ w: 200, h: 80, label: 'やめる', color: 'grey', size: 28, sound: 'ui_back', onTap: close });
    no.position.set(120, 100);
    box.addChild(panel(560, 330), q, have, yes, no);
    ov.addChild(dim, box);
    this.col.addChild(ov);
    popIn(box, 0, 0.6);
  }

  resize(): void {
    this.bg.layout(App.W, App.H);
    this.col.x = App.colX;
  }

  update(dt: number): void {
    this.bg.update(dt);
    this.list?.update();
  }
}
