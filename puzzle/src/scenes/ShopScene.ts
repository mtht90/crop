import { Container, Graphics, Sprite } from 'pixi.js';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Sound } from '../core/Audio';
import { Button, fmt, grad, popIn, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { tex } from '../core/Loader';
import { PACKS, type Pack } from '../data/shop';
import { Shop, buy, claimPurchases } from '../core/Shop';
import { HomeScene } from './HomeScene';
import { CoinCounter, ScrollBox, menuBar, rewardPopup } from './common';

/** Coins and lives for real money (Stripe Checkout). */
export class ShopScene extends Scene {
  private bg = new MenuBackground(0x36a2ff, 0x7a4dff, 2);
  private col = new Container();
  private coins = new CoinCounter('left');
  private list!: ScrollBox;
  private busy = false;

  enter(): void {
    this.view.addChild(this.bg, this.col);
    Sound.music('home', 0.8);
    const top = App.safeTop + 16;
    menuBar(this.col, 150);
    const title = txt('ショップ', { size: 52, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    title.position.set(360, top + 46);
    const back = new Button({ w: 150, h: 76, label: 'もどる', color: 'grey', size: 28, sound: 'ui_back', onTap: () => Scenes.go(() => new HomeScene()) });
    back.position.set(100, top + 46);
    this.coins.position.set(500, top + 120);
    this.col.addChild(title, back, this.coins);
    const y0 = top + 160;
    this.list = new ScrollBox(720, App.H - y0 - App.safeBottom - 10);
    this.list.position.set(360, y0);
    this.col.addChild(this.list);
    this.fill();
    // collect anything paid for (also right after coming back from Stripe)
    void claimPurchases().then((r) => {
      if (!r || !r.count || this.view.destroyed) return;
      this.coins.refresh();
      rewardPopup(this.col, 'ご購入ありがとうございます！', [...(r.coins ? [`${fmt(r.coins)}コイン`] : []), ...(r.lives ? [`ライフ×${r.lives}`] : [])]);
    });
  }

  private fill(): void {
    const c = this.list.content;
    let y = 10;
    if (Shop.test) {
      const t = txt('テストモード（本物の支払いは発生しません）', { size: 22, color: 0xffffff, stroke: 0xd81b60, strokeWidth: 6 });
      t.y = y + 16;
      c.addChild(t);
      y += 44;
    }
    for (const p of PACKS) y = this.row(p, y);
    const note = txt('購入したコイン・ライフはこの端末で受け取ります。\n機種変更のときは「データのひきつぎ」をつかってね。', { size: 20, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 5, align: 'center', lineHeight: 30 });
    note.y = y + 40;
    const legal = new Button({ w: 420, h: 66, label: '特定商取引法に基づく表記', color: 'grey', size: 22, onTap: () => window.open('./legal.html', '_blank') });
    legal.y = y + 120;
    c.addChild(note, legal);
    this.list.contentH = y + 180;
  }

  private row(p: Pack, y: number): number {
    const h = 120;
    const r = new Container();
    r.position.set(0, y + h / 2);
    const g = new Graphics();
    g.roundRect(-320, -h / 2 + 5, 640, h - 10, 26).fill({ color: 0x000000, alpha: 0.2 });
    g.roundRect(-320, -h / 2, 640, h - 10, 26).fill(grad([[0, '#ffffff'], [1, '#efe6ff']]));
    g.roundRect(-320, -h / 2, 640, h - 10, 26).stroke({ width: 4, color: p.lives ? 0xff4f8f : 0xffb020 });
    const icon = new Sprite(tex(p.lives ? 'ui:heart' : 'ui:coins'));
    icon.anchor.set(0.5);
    icon.scale.set(72 / Math.max(1, icon.texture.width));
    icon.position.set(-262, -6);
    const nm = txt(p.name, { size: 30, color: 0x4a2f7a, anchor: [0, 0.5] });
    nm.position.set(-205, -6);
    const b = new Button({ w: 170, h: 80, label: `¥${fmt(p.jpy)}`, color: 'pink', size: 30, onTap: () => this.purchase(p) });
    b.position.set(220, -6);
    r.addChild(g, icon, nm, b);
    this.list.content.addChild(r);
    popIn(r, Math.min(0.4, y / 3000), 0.85);
    return y + h;
  }

  private async purchase(p: Pack): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    Sound.play('ui_tap');
    const err = await buy(p.id);
    this.busy = false;
    if (err && !this.view.destroyed) rewardPopup(this.col, 'ショップ', [err]);
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

/** Shop entry: a small "+" next to the coin or life counter (only while the shop is on). */
export function shopPlus(onTap: () => void): Container {
  const c = new Container();
  c.addChild(new Graphics().circle(0, 0, 20).fill(0x36d06a).stroke({ width: 3, color: 0xffffff }), txt('+', { size: 30, color: 0xffffff }));
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.on('pointertap', onTap);
  return c;
}
