import { Container, Graphics } from 'pixi.js';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, fmt, grad, popIn, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { ACHIEVEMENTS, DAILY_BONUS, canClaim, claim, claimDailyBonus, dailyBonusReady, dailyMissions, isClaimed, progress, rewardText, type Mission } from '../data/missions';
import { HomeScene } from './HomeScene';
import { CoinCounter, ScrollBox, rewardPopup, menuBar } from './common';

type Tab = 'daily' | 'challenge';

export class MissionScene extends Scene {
  private bg = new MenuBackground(0xff8a3d, 0xff4f8f, 4);
  private col = new Container();
  private coins = new CoinCounter();
  private list!: ScrollBox;
  private tab: Tab = 'daily';
  private tabs: Record<Tab, Button> = {} as Record<Tab, Button>;

  enter(): void {
    this.view.addChild(this.bg, this.col);
    Sound.music('home', 0.8);
    const top = App.safeTop + 16;
    menuBar(this.col, 150);
    const title = txt('ミッション', { size: 52, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    title.position.set(360, top + 46);
    const back = new Button({ w: 150, h: 76, label: 'もどる', color: 'grey', size: 28, sound: 'ui_back', onTap: () => Scenes.go(() => new HomeScene()) });
    back.position.set(100, top + 46);
    this.coins.position.set(500, top + 120);
    const tk = txt(`チケット ${Save.data.tickets}`, { size: 24, stroke: 0x2a1630, strokeWidth: 6, anchor: [0, 0.5] });
    tk.position.set(40, top + 118);
    this.col.addChild(title, back, this.coins, tk);
    const ty = top + 190;
    (['daily', 'challenge'] as Tab[]).forEach((t, i) => {
      const b = new Button({ w: 300, h: 80, label: t === 'daily' ? 'デイリー' : 'チャレンジ', color: 'grey', size: 32, onTap: () => this.show(t) });
      b.position.set(195 + i * 330, ty);
      this.tabs[t] = b;
      this.col.addChild(b);
    });
    const y0 = ty + 60;
    this.list = new ScrollBox(720, App.H - y0 - App.safeBottom - 10);
    this.list.position.set(360, y0);
    this.col.addChild(this.list);
    this.show('daily');
    // refresh the tickets label after claims
    this.onChange = () => (tk.text = `チケット ${Save.data.tickets}`);
  }

  private onChange = (): void => {};

  private show(t: Tab): void {
    this.tab = t;
    for (const [k, b] of Object.entries(this.tabs)) b.alpha = k === t ? 1 : 0.55;
    const c = this.list.content;
    for (const ch of c.removeChildren()) ch.destroy({ children: true });
    c.y = 0;
    let y = 20;
    if (t === 'daily') {
      const head = txt('まいにち3つ。ぜんぶクリアでボーナス！', { size: 24, stroke: 0x2a1630, strokeWidth: 6 });
      head.position.set(0, y + 10);
      c.addChild(head);
      y += 50;
      for (const m of dailyMissions()) y = this.row(m, true, y);
      y = this.bonusRow(y);
    } else {
      // collectable first, then unfinished, then done
      const order = (m: Mission) => (canClaim(m, false) ? 0 : isClaimed(m, false) ? 2 : 1);
      const list = [...ACHIEVEMENTS].sort((a, b) => order(a) - order(b));
      for (const m of list) y = this.row(m, false, y);
    }
    this.list.contentH = y;
  }

  private row(m: Mission, daily: boolean, y: number): number {
    const h = 132;
    const r = new Container();
    r.position.set(0, y + h / 2);
    const done = isClaimed(m, daily);
    const ready = canClaim(m, daily);
    const g = new Graphics();
    g.roundRect(-330, -h / 2 + 5, 660, h - 10, 26).fill({ color: 0x000000, alpha: 0.2 });
    g.roundRect(-330, -h / 2, 660, h - 10, 26).fill(done ? 0xd8d0e8 : ready ? grad([[0, '#fff6c8'], [1, '#ffe08a']]) : 0xfdf7ff);
    g.roundRect(-330, -h / 2, 660, h - 10, 26).stroke({ width: 4, color: ready ? 0xff9a00 : 0x8a6cff });
    const tt = txt(m.text, { size: 28, color: 0x4a2f7a, anchor: [0, 0.5] });
    tt.position.set(-305, -h / 2 + 30);
    const rw = txt(`ほうしゅう：${rewardText(m.reward)}`, { size: 20, color: 0xd81b60, anchor: [0, 0.5] });
    rw.position.set(-305, -h / 2 + 64);
    if (rw.width > 420) rw.scale.set(420 / rw.width);
    // boss missions count bosses beaten, one less than the level reached
    const off = m.stat === 'bossLv' ? 1 : 0;
    const v = Math.min(m.goal, progress(m, daily));
    const bar = new Graphics();
    bar.roundRect(-305, -h / 2 + 86, 420, 18, 9).fill(0xe2d8f4);
    bar.roundRect(-305, -h / 2 + 86, Math.max(18, (420 * v) / m.goal), 18, 9).fill(ready || done ? 0xffb020 : 0x8a6cff);
    const pv = txt(`${fmt(v - off)} / ${fmt(m.goal - off)}`, { size: 18, color: 0x4a2f7a, anchor: [1, 0.5] });
    pv.position.set(115, -h / 2 + 95);
    r.addChild(g, tt, rw, bar, pv);
    if (done) {
      const d = txt('クリア！', { size: 30, font: 'dela', color: 0x9a8cb8 });
      d.position.set(230, -6);
      r.addChild(d);
    } else {
      const b = new Button({
        w: 170, h: 80, label: 'うけとる', color: ready ? 'pink' : 'grey', size: 28, onTap: () => {
          if (!ready) return Sound.play('ui_error');
          const got = claim(m, daily);
          this.afterClaim(got);
        },
      });
      b.position.set(230, -8);
      if (!ready) b.alpha = 0.6;
      r.addChild(b);
    }
    this.list.content.addChild(r);
    popIn(r, Math.min(0.4, y / 3000), 0.85);
    return y + h;
  }

  private bonusRow(y: number): number {
    const r = new Container();
    r.position.set(0, y + 70);
    const ready = dailyBonusReady();
    const done = Save.data.daily.bonus;
    const g = new Graphics();
    g.roundRect(-330, -60, 660, 120, 26).fill(grad([[0, '#ff9ad0'], [1, '#ff4f8f']]));
    g.roundRect(-330, -60, 660, 120, 26).stroke({ width: 5, color: 0xffffff });
    const t = txt(`ぜんぶクリアボーナス：${rewardText(DAILY_BONUS)}`, { size: 26, stroke: 0x7a1048, strokeWidth: 6, anchor: [0, 0.5] });
    t.position.set(-305, 0);
    r.addChild(g, t);
    if (done) {
      const d = txt('GET！', { size: 32, font: 'dela', color: 0xffffff });
      d.position.set(250, 0);
      r.addChild(d);
    } else {
      const b = new Button({ w: 150, h: 76, label: 'うけとる', color: ready ? 'yellow' : 'grey', size: 26, onTap: () => (ready ? this.afterClaim(claimDailyBonus()) : Sound.play('ui_error')) });
      b.position.set(240, -4);
      if (!ready) b.alpha = 0.6;
      r.addChild(b);
    }
    this.list.content.addChild(r);
    return y + 150;
  }

  private afterClaim(got: string[]): void {
    if (!got.length) return;
    this.coins.refresh();
    this.onChange();
    rewardPopup(this.col, 'ゲット！', got, () => this.show(this.tab));
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
