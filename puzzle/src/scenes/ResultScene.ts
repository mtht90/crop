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
import { CHAR_BY_ID } from '../data/characters';
import { BattleScene } from './BattleScene';
import { HomeScene } from './HomeScene';
import { bossForLevel } from '../data/bosses';

export interface BattleResult {
  score: number;
  hp: number;
  defeated: boolean;
  bossLv: number;
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

function rankOf(r: BattleResult): { rank: string; color: number } {
  const k = r.score / r.hp;
  if (k >= 2.6) return { rank: 'S', color: 0xff4fd8 };
  if (k >= 1.9) return { rank: 'A', color: 0xffb020 };
  if (k >= 1.35) return { rank: 'B', color: 0x4fc3ff };
  return { rank: 'C', color: 0x9aa7b8 };
}

export class ResultScene extends Scene {
  private bg: MenuBackground;
  private col = new Container();
  private fx = new Effects();
  private skip = false;

  constructor(private r: BattleResult) {
    super();
    installBitmapFonts();
    this.bg = r.defeated ? new MenuBackground(0xff7a59, 0xffc94d) : new MenuBackground(0x3d3a8a, 0x6a4dbf);
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
    // coins
    const coinRow = new Container();
    coinRow.y = pH / 2 - 120;
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
    if (r.defeated) {
      const next = bossForLevel(r.bossLv + 1);
      const nt = txt(`つぎのボス：Lv.${r.bossLv + 1} ${next.name}`, { size: 26, color: 0x4a2f7a });
      nt.y = pH / 2 - 45;
      box.addChild(nt);
      popIn(nt);
      for (let i = 0; i < 3; i++) gsap.delayedCall(i * 0.3, () => this.confetti());
    } else {
      const tip = txt('コンボを切らさずにつなぐとダメージアップ！', { size: 22, color: 0x6a5a8a });
      tip.y = pH / 2 - 45;
      box.addChild(tip);
    }
    // buttons
    const by = H - App.safeBottom - 110;
    const again = new Button({ w: 320, h: 104, label: 'もう一回', color: 'pink', onTap: () => Scenes.go(() => new BattleScene()) });
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

  private confetti(): void {
    const colors = [0xff4d6a, 0x36a2ff, 0x3fd35c, 0xffc71f, 0xa65cff];
    this.fx.burst(360, -20, { count: 40, tex: 'circle_05', tint: colors, speed: [100, 500], size: [0.04, 0.08], grow: 1, gravity: 700, drag: 1.2, life: [1.4, 2.2], dir: Math.PI / 2, spread: 2.6 });
    Sound.play('chips', { vol: 0.4 });
  }
}
