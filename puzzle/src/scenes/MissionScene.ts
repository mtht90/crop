import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, fmt, grad, popIn, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { ACHIEVEMENTS, DAILY_BONUS, canClaim, claim, claimDailyBonus, dailyBonusReady, dailyMissions, isClaimed, progress, rewardText, type Mission } from '../data/missions';
import { HomeScene } from './HomeScene';
import { CARDS, LINES, cardComplete, claimBingo, currentCard, nextCard, pendingLines, squareDone } from '../data/bingo';
import { tex } from '../core/Loader';
import { CoinCounter, ScrollBox, rewardPopup, menuBar } from './common';

type Tab = 'daily' | 'challenge' | 'bingo';

export class MissionScene extends Scene {
  private bg = new MenuBackground(0xff8a3d, 0xff4f8f, 4);
  private col = new Container();
  private coins = new CoinCounter('left');
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
    const names: Record<Tab, string> = { daily: 'デイリー', challenge: 'チャレンジ', bingo: 'ビンゴ' };
    (['daily', 'challenge', 'bingo'] as Tab[]).forEach((t, i) => {
      const b = new Button({ w: 214, h: 80, label: names[t], color: 'grey', size: 30, onTap: () => this.show(t) });
      b.position.set(126 + i * 234, ty);
      if (t === 'bingo' && pendingLines().length) {
        const dot = new Graphics().circle(0, 0, 14).fill(0xff3b5c).stroke({ width: 3, color: 0xffffff });
        dot.position.set(92, -30);
        b.addChild(dot);
      }
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
    if (t === 'bingo') return this.showBingo();
    let y = 20;
    // claim everything ready on this tab at once
    const ready = t === 'daily'
      ? dailyMissions().filter((m) => canClaim(m, true)).length + (dailyBonusReady() ? 1 : 0)
      : ACHIEVEMENTS.filter((m) => canClaim(m, false)).length;
    if (ready > 0) {
      const all = new Button({ w: 440, h: 84, label: `まとめてうけとる（${ready}）`, color: 'yellow', size: 30, onTap: () => this.claimAll(t) });
      all.position.set(0, y + 44);
      c.addChild(all);
      popIn(all, 0, 0.7);
      y += 104;
    }
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

  /** The current bingo card: 3x3 squares, stamps for finished ones, ribbons for paid lines. */
  private showBingo(): void {
    const c = this.list.content;
    const card = currentCard();
    const b = Save.data.bingo;
    if (!card) {
      const t = txt('ぜんぶのビンゴカードを\nクリアしました！', { size: 36, stroke: 0x2a1630, strokeWidth: 8, align: 'center', lineHeight: 50 });
      t.y = 140;
      c.addChild(t);
      this.list.contentH = 300;
      return;
    }
    let y = 20;
    const head = txt(`ビンゴカード ${b.card + 1} / ${CARDS.length}`, { size: 34, font: 'dela', stroke: 0x2a1630, strokeWidth: 8 });
    head.y = y + 20;
    const sub = txt(`1列そろうごとに ${rewardText(card.line)}\nぜんぶそろうと ${rewardText(card.full)}`, { size: 21, color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 6, align: 'center', lineHeight: 30 });
    sub.y = y + 76;
    c.addChild(head, sub);
    y += 120;
    const S = 204;
    const G = 10;
    const cx = (i: number) => ((i % 3) - 1) * (S + G);
    const gridTop = y;
    const cy = (i: number) => gridTop + S / 2 + Math.floor(i / 3) * (S + G);
    const stamps: (() => void)[] = [];
    card.squares.forEach((sq, i) => {
      const done = squareDone(i);
      const cell = new Container();
      cell.position.set(cx(i), cy(i));
      const g = new Graphics();
      g.roundRect(-S / 2, -S / 2 + 5, S, S, 24).fill({ color: 0x000000, alpha: 0.2 });
      g.roundRect(-S / 2, -S / 2, S, S, 24).fill(done ? grad([[0, '#fff1f8'], [1, '#ffd0e8']]) : 0xfdf7ff);
      g.roundRect(-S / 2, -S / 2, S, S, 24).stroke({ width: 4, color: done ? 0xff4f8f : 0x8a6cff });
      const num = txt(String(i + 1), { size: 20, font: 'dela', color: 0xffffff });
      const nb = new Graphics().circle(0, 0, 18).fill(0x8a6cff);
      nb.position.set(-S / 2 + 26, -S / 2 + 26);
      num.position.set(nb.x, nb.y - 1);
      const t = txt(sq.text, { size: 21, color: 0x4a2f7a, wrap: S - 24, align: 'center', lineHeight: 28 });
      t.y = -6;
      const v = Math.min(sq.goal, b.prog[i]);
      const p = txt(`${sq.once ? 'ベスト ' : ''}${fmt(v)} / ${fmt(sq.goal)}`, { size: 17, color: 0x8a6cff });
      p.y = S / 2 - 26;
      if (p.width > S - 20) p.scale.set((S - 20) / p.width);
      cell.addChild(g, nb, num, t, p);
      if (done) {
        const st = new Container();
        const ring = new Graphics().circle(0, 0, 62).stroke({ width: 8, color: 0xff4f8f, alpha: 0.85 });
        const star = new Sprite(tex('ui:star'));
        star.anchor.set(0.5);
        star.scale.set(70 / Math.max(1, star.texture.width));
        st.addChild(ring, star);
        st.rotation = -0.2;
        cell.addChild(st);
        if (!b.seen[i]) {
          st.visible = false;
          stamps.push(() => {
            st.visible = true;
            gsap.fromTo(st.scale, { x: 2.4, y: 2.4 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
            Sound.play('hitHeavy', { vol: 0.5, rate: 1.4 });
          });
          b.seen[i] = true;
        }
      }
      c.addChild(cell);
    });
    // ribbons across lines already paid out
    const ribbons = new Graphics();
    c.addChild(ribbons);
    const drawRibbon = (li: number) => {
      const [a, , z] = LINES[li];
      ribbons.moveTo(cx(a), cy(a)).lineTo(cx(z), cy(z)).stroke({ width: 26, color: 0xffd23f, alpha: 0.55, cap: 'round' });
    };
    for (const li of b.lines) drawRibbon(li);
    y += 3 * (S + G) + 10;
    // new stamps land one after another, then new lines pay out
    const pending = pendingLines();
    stamps.forEach((f, k) => gsap.delayedCall(0.3 + k * 0.25, f));
    const after = 0.4 + stamps.length * 0.25;
    if (pending.length) {
      gsap.delayedCall(after, () => {
        for (const li of pending) drawRibbon(li);
        const res = claimBingo();
        Sound.play('powerUp2', { vol: 0.8 });
        Sound.sparkle();
        this.coins.refresh();
        this.onChange();
        rewardPopup(this.col, res.full ? 'ビンゴカード コンプリート！' : `ビンゴ！ ×${res.lines}`, this.total(res.got), () => this.show('bingo'));
      });
    } else Save.write();
    if (cardComplete() && !pending.length) {
      const more = b.card + 1 < CARDS.length;
      const nb = new Button({ w: 420, h: 90, label: more ? 'つぎのカードへ！' : 'さいごのカードクリア！', color: 'pink', size: 30, onTap: () => {
        if (!more) return;
        nextCard();
        this.show('bingo');
      } });
      nb.y = y + 50;
      c.addChild(nb);
      nb.breathe();
      y += 110;
    }
    this.list.contentH = y + 20;
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

  private claimAll(t: Tab): void {
    const got: string[] = [];
    if (t === 'daily') {
      for (const m of dailyMissions()) got.push(...claim(m, true));
      got.push(...claimDailyBonus());
    } else for (const m of ACHIEVEMENTS) got.push(...claim(m, false));
    this.afterClaim(this.total(got));
  }

  /** Adds up repeated coin/ticket lines ("3000コイン" twice → "6,000コイン"). */
  private total(got: string[]): string[] {
    const sum = new Map<string, number>();
    const other: string[] = [];
    for (const g of got) {
      const coin = g.match(/^(\d+)コイン$/);
      const tk = g.match(/^(.+)×(\d+)$/);
      if (coin) sum.set('コイン', (sum.get('コイン') ?? 0) + Number(coin[1]));
      else if (tk) sum.set(tk[1], (sum.get(tk[1]) ?? 0) + Number(tk[2]));
      else other.push(g);
    }
    return [...[...sum].map(([k, v]) => (k === 'コイン' ? `${fmt(v)}コイン` : `${k}×${v}`)), ...other];
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
