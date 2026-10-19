import { Assets, Container, Graphics, type Texture } from 'pixi.js';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, grad, popIn, txt } from '../core/UI';
import { tex } from '../core/Loader';
import { MenuBackground } from '../game/Backdrop';
import { FRAMES, WALLPAPERS, loadWallpapers, wallpaperAlias, type Frame, type Wallpaper } from '../data/cosmetics';
import { unlockHint } from '../data/missions';
import { HomeScene } from './HomeScene';
import { ScrollBox } from './common';

type Tab = 'wallpaper' | 'frame';

/** Puzzle wallpapers and board frames unlocked through missions. */
export class DressScene extends Scene {
  private bg = new MenuBackground(0x36c2a0, 0x3a7bff);
  private col = new Container();
  private list!: ScrollBox;
  private tab: Tab = 'wallpaper';
  private tabs: Record<Tab, Button> = {} as Record<Tab, Button>;

  async preload(): Promise<void> {
    await loadWallpapers(WALLPAPERS.map((w) => w.id));
  }

  enter(): void {
    this.view.addChild(this.bg, this.col);
    Sound.music('home', 0.8);
    const top = App.safeTop + 16;
    const title = txt('きせかえ', { size: 52, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    title.position.set(360, top + 46);
    const back = new Button({ w: 150, h: 76, label: 'もどる', color: 'grey', size: 28, sound: 'ui_back', onTap: () => Scenes.go(() => new HomeScene()) });
    back.position.set(100, top + 46);
    this.col.addChild(title, back);
    const ty = top + 140;
    (['wallpaper', 'frame'] as Tab[]).forEach((t, i) => {
      const b = new Button({ w: 300, h: 80, label: t === 'wallpaper' ? 'かべがみ' : 'フレーム', color: 'grey', size: 32, onTap: () => this.show(t) });
      b.position.set(195 + i * 330, ty);
      this.tabs[t] = b;
      this.col.addChild(b);
    });
    const y0 = ty + 60;
    this.list = new ScrollBox(720, App.H - y0 - App.safeBottom - 10);
    this.list.position.set(360, y0);
    this.col.addChild(this.list);
    this.show('wallpaper');
  }

  private show(t: Tab): void {
    this.tab = t;
    for (const [k, b] of Object.entries(this.tabs)) b.alpha = k === t ? 1 : 0.55;
    const c = this.list.content;
    for (const ch of c.removeChildren()) ch.destroy({ children: true });
    c.y = 0;
    const items = t === 'wallpaper' ? WALLPAPERS : FRAMES;
    items.forEach((it, i) => {
      const tile = this.tile(t, it);
      tile.position.set(-220 + (i % 3) * 220, 30 + Math.floor(i / 3) * 300 + 130);
      c.addChild(tile);
      popIn(tile, i * 0.03, 0.8);
    });
  }

  /** A little bowl showing the wallpaper (with the current frame) or the frame (with the current wallpaper). */
  private preview(wp: Wallpaper, fr: Frame, r: number): Container {
    const c = new Container();
    const g = new Graphics();
    const rimTex = fr.rim.tex ? (fr.rim.tex.startsWith('wp:') ? Assets.get<Texture>(wallpaperAlias(fr.rim.tex.slice(3))) : tex(fr.rim.tex)) : null;
    g.circle(0, 4, r + 16).fill({ color: 0x000000, alpha: 0.3 });
    if (rimTex) g.circle(0, 0, r + 16).fill({ texture: rimTex, textureSpace: 'local' });
    else g.circle(0, 0, r + 16).fill(grad(fr.rim.stops!));
    g.circle(0, 0, r + 16).stroke({ width: 4, color: fr.line });
    g.circle(0, 0, r + 6).stroke({ width: 6, color: fr.edge });
    if (wp.img) {
      g.circle(0, 0, r).fill({ texture: Assets.get<Texture>(wallpaperAlias(wp.id)), textureSpace: 'local' });
      g.circle(0, 0, r).fill({ color: 0x0a0618, alpha: 0.2 });
    } else g.circle(0, 0, r).fill(grad([[0, '#2c4a2a'], [1, '#132416']]));
    c.addChild(g);
    return c;
  }

  private tile(t: Tab, it: Wallpaper | Frame): Container {
    const look = Save.data.look;
    const owned = t === 'wallpaper' ? look.wallpapers.includes(it.id) : look.frames.includes(it.id);
    const on = t === 'wallpaper' ? look.wallpaper === it.id : look.frame === it.id;
    const c = new Container();
    const bg = new Graphics();
    bg.roundRect(-100, -130, 200, 280, 26).fill({ color: 0x000000, alpha: 0.2 });
    bg.roundRect(-100, -136, 200, 280, 26).fill(on ? grad([[0, '#fff6c8'], [1, '#ffe08a']]) : 0xfdf7ff);
    bg.roundRect(-100, -136, 200, 280, 26).stroke({ width: on ? 6 : 4, color: on ? 0xff9a00 : 0x8a6cff });
    c.addChild(bg);
    const wp = t === 'wallpaper' ? (it as Wallpaper) : WALLPAPERS.find((w) => w.id === look.wallpaper) ?? WALLPAPERS[0];
    const fr = t === 'frame' ? (it as Frame) : FRAMES.find((f) => f.id === look.frame) ?? FRAMES[0];
    const pv = this.preview(wp, fr, 66);
    pv.y = -40;
    c.addChild(pv);
    const nm = txt(it.name, { size: 24, color: 0x4a2f7a });
    nm.y = 72;
    if (nm.width > 180) nm.scale.set(180 / nm.width);
    c.addChild(nm);
    if (!owned) {
      const lock = new Graphics().roundRect(-100, -136, 200, 280, 26).fill({ color: 0x1a1030, alpha: 0.6 });
      const lt = txt(`ロック中\n${unlockHint(t, it.id)}`, { size: 20, color: 0xffffff, wrap: 170, lineHeight: 28 });
      lt.y = -40;
      c.addChild(lock, lt);
    } else if (on) {
      const ok = txt('そうびちゅう', { size: 22, color: 0xff6a00 });
      ok.y = 112;
      c.addChild(ok);
    } else {
      const hint = txt('タップでそうび', { size: 20, color: 0x8a6cff });
      hint.y = 112;
      c.addChild(hint);
    }
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => {
      if (!owned) return Sound.play('ui_error');
      if (t === 'wallpaper') look.wallpaper = it.id;
      else look.frame = it.id;
      Save.write();
      Sound.play('ui_ok');
      this.show(this.tab);
    });
    return c;
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
