import { Container, Graphics } from 'pixi.js';
import { battleTrackLabel, nextBattleTrack } from '../data/music';
import gsap from 'gsap';
import { App } from '../core/App';
import { Save } from '../core/Save';
import { Sound } from '../core/Audio';
import { Button, coinIcon, fmt, panel, popIn, txt } from '../core/UI';
import { num, installBitmapFonts } from '../game/Hud';

/** Coins counter shown at the top of menu screens. */
export class CoinCounter extends Container {
  private digits;
  private shown: number;
  constructor() {
    super();
    installBitmapFonts();
    const bg = new Graphics();
    bg.roundRect(-20, -26, 220, 52, 26).fill({ color: 0x000000, alpha: 0.3 });
    bg.roundRect(-20, -30, 220, 52, 26).fill({ color: 0x2a1630, alpha: 0.85 });
    const c = coinIcon(22);
    c.position.set(8, -4);
    this.shown = Save.data.coins;
    this.digits = num(fmt(this.shown), 32);
    this.digits.anchor.set(1, 0.5);
    this.digits.position.set(186, -4);
    this.addChild(bg, c, this.digits);
  }
  refresh(animate = true): void {
    const target = Save.data.coins;
    if (!animate) {
      this.shown = target;
      this.digits.text = fmt(target);
      return;
    }
    const o = { v: this.shown };
    gsap.to(o, {
      v: target,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        this.digits.text = fmt(o.v);
      },
    });
    this.shown = target;
    gsap.fromTo(this.digits.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
  }
}

/** Settings dialog (sound, haptics, accessibility). */
export function openSettings(parent: Container, onClose?: () => void): void {
  const ov = new Container();
  const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.7 });
  dim.eventMode = 'static';
  ov.addChild(dim);
  const box = new Container();
  box.position.set(360, App.H / 2);
  const p = panel(620, 980, { color: 0xfdf7ff });
  box.addChild(p);
  const title = txt('せってい', { size: 48, font: 'dela', color: 0x4a2f7a });
  title.y = -430;
  box.addChild(title);
  const s = Save.data.settings;
  const rows: [string, () => boolean, () => void][] = [
    ['BGM', () => s.bgm > 0, () => (s.bgm = s.bgm > 0 ? 0 : 0.7)],
    ['効果音', () => s.sfx > 0, () => (s.sfx = s.sfx > 0 ? 0 : 0.9)],
    ['振動', () => s.haptics, () => (s.haptics = !s.haptics)],
    ['色覚サポート', () => s.colorAssist, () => (s.colorAssist = !s.colorAssist)],
    ['必殺技 自動発動', () => s.autoSkill, () => (s.autoSkill = !s.autoSkill)],
  ];
  rows.forEach(([label, get, toggle], i) => {
    const y = -330 + i * 96;
    const l = txt(label, { size: 30, color: 0x4a2f7a, anchor: [0, 0.5] });
    l.position.set(-250, y);
    box.addChild(l);
    let btn: Button;
    const make = () => {
      btn?.destroy({ children: true });
      btn = new Button({
        w: 150, h: 70, label: get() ? 'ON' : 'OFF', color: get() ? 'green' : 'grey', size: 30, onTap: () => {
          toggle();
          Save.write();
          Sound.applyVolumes();
          make();
        },
      });
      btn.position.set(185, y);
      box.addChild(btn);
    };
    make();
  });
  // battle BGM: tap to cycle (おまかせ = random each round); plays a preview
  const prevMusic = Sound.currentMusic();
  const ml = txt('バトルBGM', { size: 30, color: 0x4a2f7a, anchor: [0, 0.5] });
  ml.position.set(-250, 150);
  box.addChild(ml);
  let mb: Button;
  const makeMusic = () => {
    mb?.destroy({ children: true });
    mb = new Button({
      w: 250, h: 70, label: battleTrackLabel(), color: 'blue', size: 26, onTap: () => {
        nextBattleTrack();
        Save.write();
        if (Save.data.settings.battleBgm !== 'auto') Sound.music(Save.data.settings.battleBgm, 0.3);
        makeMusic();
      },
    });
    mb.position.set(135, 150);
    box.addChild(mb);
  };
  makeMusic();
  const credit = txt('キャラ・ボス: KayKit (CC0)  背景・UI: CraftPix\n効果音: 効果音ラボ  音楽: 魔王魂 (CC BY 4.0)\nガチャ筐体: gumball machine / myles_683 (CC BY 4.0)\nフォント: めもかっち / やっちゃん (SIL OFL 1.1)', { size: 20, weight: '500', color: 0x7a6a9a, lineHeight: 30 });
  credit.y = 290;
  box.addChild(credit);
  const close = new Button({
    w: 300, h: 90, label: 'とじる', color: 'pink', sound: 'ui_back', onTap: () => {
      ov.destroy({ children: true });
      if (prevMusic) Sound.music(prevMusic, 0.4);
      onClose?.();
    },
  });
  close.y = 415;
  box.addChild(close);
  ov.addChild(box);
  parent.addChild(ov);
  popIn(box);
  Sound.play('ui_open', { vol: 0.6 });
}


/** Rarity stars row. */
export function stars(n: number, size = 28, total = n): Container {
  const c = new Container();
  for (let i = 0; i < total; i++) {
    const g = new Graphics();
    starPath(g, size / 2);
    g.fill(i < n ? 0xffd23f : 0x6a5a8a);
    g.stroke({ width: 3, color: 0x6a3a00 });
    g.x = (i - (total - 1) / 2) * size * 1.05;
    c.addChild(g);
  }
  return c;
}

export function starPath(g: Graphics, r: number): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return g.poly(pts);
}
