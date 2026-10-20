import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Sound, haptic } from '../core/Audio';
import { Button, coinIcon, fmt, grad, panel, popIn, txt } from '../core/UI';
import { MenuBackground } from '../game/Backdrop';
import { Effects } from '../game/Effects';
import { num, installBitmapFonts } from '../game/Hud';
import { bigTexture } from '../art/PieceArt';
import { CHAR_BY_ID, MAX_LV, expToNext } from '../data/characters';
import { BattleScene } from './BattleScene';
import { HomeScene } from './HomeScene';
import { openPrep } from './common';
import { bossForLevel } from '../data/bosses';

export interface BattleResult {
  score: number;
  hp: number;
  defeated: boolean;
  bossLv: number;
  rematch?: boolean;
  exp: number;
  expBefore: number;
  expAfter: number;
  coinParts: { play: number; score: number; boss: number; item: boolean };
  lvBefore: number;
  lvAfter: number;
  skillTickets: number;
  coinBonus: number;
  bossName: string;
  maxCombo: number;
  maxChain: number;
  fevers: number;
  skills: number;
  coins: number;
  newBest: boolean;
  prevBest: number;
  charId: string;
}

/** Rank by absolute score: E <10万, D <50万, C <100万, B <200万, A <400万, S above. */
function rankOf(r: BattleResult): { rank: string; color: number } {
  const v = r.score;
  if (v >= 4_000_000) return { rank: 'S', color: 0xff4fd8 };
  if (v >= 2_000_000) return { rank: 'A', color: 0xffb020 };
  if (v >= 1_000_000) return { rank: 'B', color: 0x4fc3ff };
  if (v >= 500_000) return { rank: 'C', color: 0x5fd068 };
  if (v >= 100_000) return { rank: 'D', color: 0x9aa7b8 };
  return { rank: 'E', color: 0x7a7f90 };
}

export class ResultScene extends Scene {
  private bg: MenuBackground;
  private col = new Container();
  private fx = new Effects();
  private skip = false;

  constructor(private r: BattleResult) {
    super();
    installBitmapFonts();
    this.bg = r.defeated ? new MenuBackground(0xff7a59, 0xffc94d, 2) : new MenuBackground(0x3d3a8a, 0x6a4dbf, 4);
  }

  enter(): void {
    this.view.addChild(this.bg, this.col);
    this.col.addChild(this.fx.view);
    Sound.music('result', 0.8);
    void this.run();
    this.view.eventMode = 'static';
    this.view.on('pointerdown', () => (this.skip = true));
  }

  resize(): void {
    this.bg.layout(App.W, App.H);
    this.col.x = App.colX;
  }

  update(dt: number): void {
    this.bg.update(dt);
    this.fx.update(dt);
  }

  private wait(s: number): Promise<void> {
    if (this.skip) return Promise.resolve();
    return new Promise((res) => gsap.delayedCall(s, res));
  }

  private async run(): Promise<void> {
    const r = this.r;
    const H = App.H;
    const top = App.safeTop + 20;
    // header
    const head = txt(r.defeated ? '討伐成功！' : '討伐失敗…', { size: 80, font: 'dela', color: r.defeated ? 0xfff27a : 0xd8dcff, stroke: 0x2a1630, strokeWidth: 14, shadow: true });
    head.position.set(360, top + 70);
    this.col.addChild(head);
    popIn(head);
    const sub = txt(`Lv.${r.bossLv} ${r.bossName}`, { size: 30, stroke: 0x2a1630, strokeWidth: 7 });
    sub.position.set(360, top + 140);
    this.col.addChild(sub);
    // character
    const ch = CHAR_BY_ID[r.charId];
    const chara = new Sprite(bigTexture(ch));
    chara.anchor.set(0.5, 0.6);
    chara.scale.set(0.67);
    chara.position.set(600, top + 110);
    this.col.addChild(chara);
    gsap.to(chara, { y: chara.y - 18, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    // panel
    const pY = top + 180;
    const pH = Math.min(720, H - pY - 240);
    const box = new Container();
    box.position.set(360, pY + pH / 2);
    box.addChild(panel(640, pH, { color: 0xfdf7ff }));
    this.col.addChild(box);
    popIn(box, 0.1, 0.8);
    await this.wait(0.4);
    // score count-up
    const sl = txt('SCORE', { size: 30, font: 'dela', color: 0x8a6cff });
    sl.y = -pH / 2 + 50;
    box.addChild(sl);
    const score = num('0', 90, 'NumGold');
    score.y = -pH / 2 + 125;
    box.addChild(score);
    await this.countUp(score, r.score, 1.4);
    haptic(20);
    gsap.fromTo(score.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1,0.4)' });
    Sound.play('bell', { vol: 0.6 });
    const line = txt(`討伐ライン ${fmt(r.hp)}`, { size: 24, color: 0x6a5a8a });
    line.y = -pH / 2 + 185;
    box.addChild(line);
    if (r.newBest) {
      const nb = txt('NEW RECORD!', { size: 34, font: 'dela', color: 0xff4f8f, stroke: 0xffffff, strokeWidth: 8 });
      nb.position.set(190, -pH / 2 + 185);
      nb.rotation = 0.15;
      box.addChild(nb);
      popIn(nb);
      Sound.play('jLevel', { vol: 0.7 });
      this.fx.burst(360 + 170, box.y - pH / 2 + 185, { count: 20, tex: 'star_06', tint: [0xff4f8f, 0xffd23f, 0xffffff], add: true, speed: [100, 400], size: [0.08, 0.16] });
    }
    await this.wait(0.3);
    // stats
    const stats: [string, string][] = [
      ['最大コンボ', `${r.maxCombo}`],
      ['最大チェイン', `${r.maxChain}`],
      ['フィーバー', `${r.fevers} 回`],
      ['必殺技', `${r.skills} 回`],
    ];
    stats.forEach(([k, v], i) => {
      const y = -pH / 2 + 250 + i * 54;
      const row = new Container();
      row.y = y;
      const bg = new Graphics().roundRect(-280, -22, 400, 44, 22).fill({ color: 0x8a6cff, alpha: 0.12 });
      const kt = txt(k, { size: 26, color: 0x4a2f7a, anchor: [0, 0.5] });
      kt.x = -260;
      const vt = txt(v, { size: 28, font: 'dela', color: 0x4a2f7a, anchor: [1, 0.5] });
      vt.x = 100;
      row.addChild(bg, kt, vt);
      box.addChild(row);
      popIn(row, i * 0.06, 0.6);
    });
    // rank stamp
    const { rank, color } = rankOf(r);
    const stamp = new Container();
    const sg = new Graphics();
    sg.circle(0, 0, 92).fill(grad([[0, '#ffffff'], [1, '#efe6ff']]));
    sg.circle(0, 0, 92).stroke({ width: 10, color });
    sg.circle(0, 0, 76).stroke({ width: 3, color, alpha: 0.6 });
    const rt = txt(rank, { size: 120, font: 'dela', color, stroke: 0x2a1630, strokeWidth: 10 });
    rt.y = -4;
    const rl = txt('RANK', { size: 20, font: 'dela', color: 0x4a2f7a });
    rl.y = 62;
    stamp.addChild(sg, rt, rl);
    stamp.position.set(200, -pH / 2 + 340);
    stamp.rotation = -0.2;
    box.addChild(stamp);
    await this.wait(0.35);
    stamp.scale.set(3);
    stamp.alpha = 0;
    gsap.to(stamp, { alpha: 1, duration: 0.1 });
    gsap.to(stamp.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(1.5)' });
    gsap.delayedCall(0.18, () => {
      Sound.play('hitHeavy', { vol: 0.7 });
      Sound.play(rank === 'S' ? 'jSSR' : rank === 'A' ? 'jSR' : 'jR', { vol: 0.6 });
      haptic(30);
      this.fx.burst(360 + 200, box.y - pH / 2 + 340, { count: 24, tex: 'star_06', tint: [color, 0xffffff], add: true, speed: [200, 500], size: [0.08, 0.18] });
    });
    await this.wait(0.6);
    // character EXP: a gauge that fills (and wraps on every level-up)
    const expRow = new Container();
    expRow.y = pH / 2 - 205;
    const et = txt(`${ch.name}  EXP +${r.exp}`, { size: 24, color: 0x4a2f7a, anchor: [0, 0.5] });
    et.position.set(-260, -18);
    const lt = txt(`Lv.${r.lvBefore}`, { size: 28, font: 'dela', color: 0x8a6cff, anchor: [1, 0.5] });
    lt.position.set(260, -18);
    const gBg = new Graphics().roundRect(-260, 6, 520, 20, 10).fill(0xe2d0b0);
    const gFill = new Graphics();
    expRow.addChild(et, lt, gBg, gFill);
    box.addChild(expRow);
    popIn(expRow);
    const cap = MAX_LV[ch.rarity];
    const drawExp = (k: number) => {
      gFill.clear();
      if (k > 0.001) gFill.roundRect(-260, 6, Math.max(20, 520 * Math.min(1, k)), 20, 10).fill(0x8a6cff);
    };
    let lv = r.lvBefore;
    let from = r.expBefore / expToNext(lv);
    drawExp(from);
    await this.wait(0.2);
    // one sweep per level gained, then the remainder
    while (lv < r.lvAfter) {
      await this.tween(from, 1, 0.35, drawExp);
      lv++;
      from = 0;
      lt.text = `Lv.${lv}`;
      lt.style.fill = 0xff4f8f;
      gsap.fromTo(lt.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
      Sound.play('jLevel', { vol: 0.7 });
      const lu = txt('LEVEL UP!', { size: 34, font: 'dela', color: 0xff4f8f, stroke: 0xffffff, strokeWidth: 8 });
      lu.position.set(60, -60);
      expRow.addChild(lu);
      popIn(lu);
      gsap.to(lu, { y: -100, alpha: 0, duration: 0.6, delay: 0.5, onComplete: () => lu.destroy() });
      this.fx.burst(360 + 200, box.y + expRow.y, { count: 16, tex: 'star_06', tint: [0xff4f8f, 0xffffff], add: true, speed: [100, 400], size: [0.08, 0.16] });
    }
    if (lv < cap) await this.tween(from, r.expAfter / expToNext(lv), 0.3, drawExp);
    else drawExp(1);
    await this.wait(0.2);
    // coins
    const coinRow = new Container();
    coinRow.y = pH / 2 - 132;
    const cbg = new Graphics().roundRect(-260, -38, 520, 76, 38).fill(grad([[0, '#fff3c4'], [1, '#ffd77a']]));
    cbg.roundRect(-260, -38, 520, 76, 38).stroke({ width: 4, color: 0xd98a00 });
    const ci = coinIcon(26);
    ci.x = -200;
    const ct = txt('かくとくコイン', { size: 26, color: 0x8a4f00, anchor: [0, 0.5] });
    ct.x = -160;
    const cv = num('+0', 46, 'NumGold');
    cv.anchor.set(1, 0.5);
    cv.x = 240;
    coinRow.addChild(cbg, ci, ct, cv);
    box.addChild(coinRow);
    popIn(coinRow);
    await this.countUp(cv, r.coins, 0.8, '+', true);
    const cp = r.coinParts;
    const parts = [`プレイ ${fmt(cp.play)}`, `スコア ${fmt(cp.score)}`];
    if (cp.boss) parts.push(`ボス ${fmt(cp.boss)}`);
    const brk = txt(parts.join(' ＋ ') + (cp.item ? '  (コインアップ×1.3)' : ''), { size: 18, color: 0x8a4f00 });
    brk.y = coinRow.y + 50;
    box.addChild(brk);
    popIn(brk);
    if (r.skillTickets) this.dropPopup(`スキルチケット×${r.skillTickets}`, 'とってもレア！');
    if (r.defeated) {
      const next = bossForLevel(r.bossLv + 1);
      const msg = r.rematch ? 'さいせんクリア！' : `つぎのボス：Lv.${r.bossLv + 1} ${next.name}`;
      const nt = txt(msg, { size: 24, color: 0x4a2f7a });
      if (nt.width > 600) nt.scale.set(600 / nt.width);
      nt.y = pH / 2 - 36;
      box.addChild(nt);
      popIn(nt);
      for (let i = 0; i < 3; i++) gsap.delayedCall(i * 0.3, () => this.confetti());
    } else {
      const tip = txt('コンボを切らさずにつなぐとダメージアップ！', { size: 22, color: 0x6a5a8a });
      tip.y = pH / 2 - 36;
      box.addChild(tip);
    }
    // buttons
    const by = H - App.safeBottom - 110;
    const again = new Button({ w: 320, h: 104, label: 'もう一回', color: 'pink', onTap: () => openPrep(this.col, (items) => Scenes.go(() => new BattleScene(items))) });
    again.position.set(200, by);
    const home = new Button({ w: 250, h: 92, label: 'ホーム', color: 'blue', sound: 'ui_back', onTap: () => Scenes.go(() => new HomeScene()) });
    home.position.set(540, by);
    this.col.addChild(again, home);
    popIn(again, 0.05);
    popIn(home, 0.12);
    again.breathe();
  }

  private countUp(t: { text: string }, target: number, dur: number, prefix = '', coins = false): Promise<void> {
    return new Promise((res) => {
      if (this.skip) {
        t.text = prefix + fmt(target);
        res();
        return;
      }
      const o = { v: 0 };
      let last = -1;
      gsap.to(o, {
        v: target,
        duration: dur,
        ease: 'power2.out',
        onUpdate: () => {
          t.text = prefix + fmt(o.v);
          const step = Math.floor(o.v / Math.max(1, target / 24));
          if (step !== last) {
            last = step;
            if (coins) Sound.coin(step);
            else Sound.countTick(o.v / Math.max(1, target));
          }
        },
        onComplete: () => res(),
      });
    });
  }

  /** Tweens a number and calls `fn` with it; resolves at the end. */
  private tween(from: number, to: number, dur: number, fn: (v: number) => void): Promise<void> {
    return new Promise((res) => {
      const o = { v: from };
      gsap.to(o, { v: to, duration: dur, ease: 'power1.inOut', onUpdate: () => fn(o.v), onComplete: () => res() });
    });
  }

  /** Big "you got something" stamp for rare drops. */
  private dropPopup(title: string, sub: string): void {
    const c = new Container();
    c.position.set(360, App.H * 0.42);
    const g = new Graphics().roundRect(-260, -90, 520, 180, 30).fill(grad([[0, '#fff6c8'], [1, '#ffc94d']])).stroke({ width: 8, color: 0xffffff });
    const t = txt(title, { size: 44, font: 'dela', color: 0xd81b60, stroke: 0xffffff, strokeWidth: 8 });
    t.y = -16;
    const st = txt(sub, { size: 24, color: 0x8a4f00 });
    st.y = 44;
    c.addChild(g, t, st);
    this.col.addChild(c);
    c.scale.set(0);
    gsap.to(c.scale, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2)' });
    gsap.to(c, { alpha: 0, duration: 0.4, delay: 2.4, onComplete: () => c.destroy({ children: true }) });
    Sound.play('jSSR', { vol: 0.7 });
    Sound.sparkle();
    for (let i = 0; i < 2; i++) gsap.delayedCall(i * 0.3, () => this.confetti());
  }

  private confetti(): void {
    const colors = [0xff4d6a, 0x36a2ff, 0x3fd35c, 0xffc71f, 0xa65cff];
    this.fx.burst(360, -20, { count: 40, tex: 'circle_05', tint: colors, speed: [100, 500], size: [0.04, 0.08], grow: 1, gravity: 700, drag: 1.2, life: [1.4, 2.2], dir: Math.PI / 2, spread: 2.6 });
    Sound.play('chips', { vol: 0.4 });
  }
}
