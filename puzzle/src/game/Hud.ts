import { BitmapFont, BitmapText, Container, Graphics, NineSliceSprite, Sprite, Text } from 'pixi.js';
import gsap from 'gsap';
import { FONT_DELA, fmt, grad, txt } from '../core/UI';
import { bigTexture } from '../art/PieceArt';
import type { CharDef } from '../data/characters';
import { tex as jtex } from '../core/Loader';

let fontsReady = false;
/** Bitmap fonts for numbers that change every frame. */
export function installBitmapFonts(): void {
  if (fontsReady) return;
  fontsReady = true;
  const chars = '0123456789,.:+-x×!%COMBOTIMEHPSL ';
  BitmapFont.install({
    name: 'NumWhite',
    style: { fontFamily: FONT_DELA, fontSize: 64, fill: 0xffffff, stroke: { color: 0x2a1630, width: 10, join: 'round' } },
    chars: [chars],
    resolution: 2,
    padding: 6,
  });
  BitmapFont.install({
    name: 'NumGold',
    style: { fontFamily: FONT_DELA, fontSize: 72, fill: grad([[0, '#fffbd0'], [0.5, '#ffd23f'], [1, '#ff9a1f']]), stroke: { color: 0x5a2400, width: 11, join: 'round' } },
    chars: [chars],
    resolution: 2,
    padding: 6,
  });
  BitmapFont.install({
    name: 'NumRed',
    style: { fontFamily: FONT_DELA, fontSize: 72, fill: grad([[0, '#ffe0e6'], [0.5, '#ff5577'], [1, '#d9143f']]), stroke: { color: 0x4a0018, width: 11, join: 'round' } },
    chars: [chars],
    resolution: 2,
    padding: 6,
  });
}

export function num(text: string, size: number, font: 'NumWhite' | 'NumGold' | 'NumRed' = 'NumWhite'): BitmapText {
  const t = new BitmapText({ text, style: { fontFamily: font, fontSize: size } });
  t.anchor.set(0.5);
  return t;
}

// ------------------------------------------------------------------ timer
export class TimerWidget extends Container {
  private ring = new Graphics();
  private digits = num('60', 54);
  private warn = false;
  constructor() {
    super();
    const bg = new Graphics();
    bg.circle(0, 6, 56).fill({ color: 0x000000, alpha: 0.3 });
    bg.circle(0, 0, 56).fill(0x2a1630);
    bg.circle(0, 0, 47).fill(grad([[0, '#5a3fa0'], [1, '#2f1d63']]));
    this.addChild(bg, this.ring, this.digits);
    this.digits.y = 2;
  }
  set(remaining: number, total: number): void {
    const s = Math.ceil(Math.max(0, remaining));
    const t = String(s);
    if (this.digits.text !== t) {
      this.digits.text = t;
      if (s <= 10 && s > 0) {
        this.digits.scale.set(1.45);
        gsap.to(this.digits.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
      }
    }
    const warn = remaining <= 10;
    if (warn !== this.warn) {
      this.warn = warn;
      this.digits.tint = warn ? 0xff6b8a : 0xffffff;
    }
    const p = Math.max(0, remaining / total);
    const g = this.ring;
    g.clear();
    g.arc(0, 0, 51, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p).stroke({ width: 8, color: warn ? 0xff4d6a : 0x7cf0ff, cap: 'round' });
  }
}

// ------------------------------------------------------------------ score
export class ScoreWidget extends Container {
  private value = num('0', 40);
  private shown = 0;
  target = 0;
  constructor(width = 250) {
    super();
    const bg = new Graphics();
    bg.roundRect(-width / 2, -30, width, 66, 33).fill({ color: 0x000000, alpha: 0.3 });
    bg.roundRect(-width / 2, -34, width, 66, 33).fill({ color: 0x2a1630, alpha: 0.85 });
    bg.roundRect(-width / 2, -34, width, 66, 33).stroke({ width: 3, color: 0xffffff, alpha: 0.25 });
    const l = txt('SCORE', { size: 18, color: 0xffd23f, font: 'dela' });
    l.position.set(-width / 2 + 52, -1);
    this.value.anchor.set(1, 0.5);
    this.value.position.set(width / 2 - 22, 0);
    this.addChild(bg, l, this.value);
  }
  update(dt: number): void {
    if (this.shown === this.target) return;
    const diff = this.target - this.shown;
    this.shown += Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 10));
    if (Math.abs(this.target - this.shown) < 1) this.shown = this.target;
    this.value.text = fmt(this.shown);
  }
  bump(): void {
    gsap.fromTo(this.value.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
  }
}

// ----------------------------------------------------------------- hp bar
export class HpBar extends Container {
  private fill = new Graphics();
  private lag = new Graphics();
  private value = num('', 26);
  private shownP = 1;
  private lagP = 1;
  private w: number;
  private h = 26;
  broken = false;
  constructor(name: string, lv: number, w = 420) {
    super();
    this.w = w;
    const bg = new Graphics();
    bg.roundRect(-w / 2 - 6, -this.h / 2 - 6, w + 12, this.h + 12, 18).fill(0x2a1630);
    bg.roundRect(-w / 2, -this.h / 2, w, this.h, 13).fill(0x4a2f5a);
    const title = txt(`Lv.${lv}  ${name}`, { size: 24, stroke: 0x2a1630, strokeWidth: 6 });
    title.anchor.set(0, 1);
    title.position.set(-w / 2, -this.h / 2 - 8);
    this.value.anchor.set(1, 0.5);
    this.value.position.set(w / 2 - 6, 1);
    this.addChild(bg, this.lag, this.fill, this.value, title);
  }
  private drawnP = -1;
  private drawnLag = -1;
  private text = '';
  set(remain: number, max: number): void {
    this.shownP = Math.max(0, remain / max);
    const t = remain > 0 ? fmt(remain) : '0';
    if (t !== this.text) this.value.text = this.text = t;
  }
  update(dt: number): void {
    this.lagP += (this.shownP - this.lagP) * Math.min(1, dt * 3);
    if (Math.abs(this.lagP - this.shownP) < 0.001) this.lagP = this.shownP;
    const w = this.w;
    if (Math.abs(this.lagP - this.drawnLag) > 0.0005) {
      this.drawnLag = this.lagP;
      this.lag.clear();
      if (this.lagP > 0.001) this.lag.roundRect(-w / 2, -this.h / 2, w * this.lagP, this.h, 13).fill(0xffffff);
    }
    if (this.shownP !== this.drawnP) {
      this.drawnP = this.shownP;
      const g = this.fill;
      g.clear();
      if (this.shownP <= 0.001) return;
      const col = this.shownP > 0.5 ? HP_GRADS()[0] : this.shownP > 0.2 ? HP_GRADS()[1] : HP_GRADS()[2];
      g.roundRect(-w / 2, -this.h / 2, w * this.shownP, this.h, 13).fill(col);
      g.roundRect(-w / 2 + 6, -this.h / 2 + 4, Math.max(0, w * this.shownP - 12), 6, 3).fill({ color: 0xffffff, alpha: 0.45 });
    }
  }
}

let hpGrads: ReturnType<typeof grad>[] | null = null;
function HP_GRADS(): ReturnType<typeof grad>[] {
  return (hpGrads ??= [grad([[0, '#9dff8a'], [1, '#2fbf4a']]), grad([[0, '#ffe680'], [1, '#ff9a1f']]), grad([[0, '#ff9aaa'], [1, '#e0204a']])]);
}

// ------------------------------------------------------------ skill button
export class SkillButton extends Container {
  private ring = new Graphics();
  private glow = new Graphics();
  private portrait: Sprite;
  private ready = false;
  private readyLabel: Text;
  private nameLabel: Text;
  private t = 0;
  progress = 0;
  constructor(def: CharDef) {
    super();
    const bg = new Graphics();
    bg.circle(0, 6, 62).fill({ color: 0x000000, alpha: 0.3 });
    bg.circle(0, 0, 62).fill(0x2a1630);
    bg.circle(0, 0, 52).fill(grad([[0, '#ffffff'], [1, '#d7c8ff']]));
    this.portrait = new Sprite(bigTexture(def));
    this.portrait.anchor.set(0.5, 0.5);
    this.portrait.scale.set(96 / Math.max(1, this.portrait.texture.width));
    const mask = new Graphics().circle(0, 0, 51).fill(0xffffff);
    this.portrait.mask = mask;
    this.readyLabel = txt('ボウルの中！', { size: 20, font: 'dela', color: 0xfff27a, stroke: 0x8a1f00, strokeWidth: 6 });
    this.readyLabel.y = 48;
    this.readyLabel.visible = false;
    this.nameLabel = txt(def.skill.name, { size: 18, stroke: 0x2a1630, strokeWidth: 5 });
    this.nameLabel.y = 68;
    if (this.nameLabel.width > 160) this.nameLabel.scale.set(160 / this.nameLabel.width);
    this.nameLabel.x = Math.max(0, this.nameLabel.width / 2 - 70);
    this.glow.circle(0, 0, 90).fill({ color: 0xff4fd8, alpha: 0.15 });
    this.glow.circle(0, 0, 76).fill({ color: 0xfff27a, alpha: 0.35 });
    this.glow.visible = false;
    this.addChild(this.glow, bg, this.portrait, mask, this.ring, this.readyLabel, this.nameLabel);
    // display only: the skill fires from the glowing piece it drops into the bowl
    this.eventMode = 'none';
  }
  get isReady(): boolean {
    return this.ready;
  }
  set(progress: number): void {
    this.progress = Math.min(1, progress);
    const ready = this.progress >= 1;
    if (ready && !this.ready) {
      gsap.fromTo(this.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.6, ease: 'elastic.out(1.2,0.4)' });
    }
    this.ready = ready;
    this.readyLabel.visible = ready;
  }
  private drawnP = -1;
  update(dt: number): void {
    this.t += dt;
    if (this.progress !== this.drawnP) {
      this.drawnP = this.progress;
      const g = this.ring;
      g.clear();
      if (this.progress > 0) g.arc(0, 0, 57, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.progress).stroke({ width: 9, color: this.ready ? 0xfff27a : 0xff4fd8, cap: 'round' });
    }
    this.glow.visible = this.ready;
    if (this.ready) {
      this.glow.scale.set(1 + Math.sin(this.t * 8) * 0.06);
      this.portrait.rotation = Math.sin(this.t * 10) * 0.08;
      this.readyLabel.scale.set(1 + Math.sin(this.t * 10) * 0.08);
    } else {
      this.portrait.rotation = 0;
    }
  }
}

// ------------------------------------------------------------ fever gauge
export class FeverGauge extends Container {
  private fill = new Graphics();
  private shine = new Graphics();
  private title: Text;
  private t = 0;
  value = 0;
  active = false;
  activeP = 0;
  constructor(private w = 440) {
    super();
    const bg = new Graphics();
    bg.roundRect(-w / 2 - 6, -22, w + 12, 44, 22).fill(0x2a1630);
    bg.roundRect(-w / 2, -16, w, 32, 16).fill(0x4a2f5a);
    this.title = txt('FEVER', { size: 26, font: 'dela', stroke: 0x2a1630, strokeWidth: 7, color: 0xffffff });
    this.addChild(bg, this.fill, this.shine, this.title);
  }
  private drawnP = -1;
  private drawnActive = false;
  private static pinkGrad: ReturnType<typeof grad> | null = null;
  private static rainbowGrad: ReturnType<typeof grad> | null = null;
  update(dt: number): void {
    this.t += dt;
    const w = this.w;
    const p = this.active ? this.activeP : Math.min(1, this.value / 100);
    if (Math.abs(p - this.drawnP) > 0.002 || this.active !== this.drawnActive) {
      this.drawnP = p;
      this.drawnActive = this.active;
      const g = this.fill;
      g.clear();
      if (p > 0.005) {
        const fill = this.active
          ? (FeverGauge.rainbowGrad ??= grad([[0, '#ff4d6a'], [0.25, '#ffc71f'], [0.5, '#3fd35c'], [0.75, '#36a2ff'], [1, '#a65cff']], false))
          : (FeverGauge.pinkGrad ??= grad([[0, '#ff4fd8'], [1, '#ffb020']], false));
        g.roundRect(-w / 2, -16, w * p, 32, 16).fill(fill);
        g.roundRect(-w / 2 + 6, -12, Math.max(0, w * p - 12), 8, 4).fill({ color: 0xffffff, alpha: 0.5 });
      }
    }
    // glint sweeping across when full / active
    const glint = this.active || p >= 1;
    this.shine.visible = glint;
    if (glint) {
      if (this.shine.width === 0) this.shine.roundRect(0, -16, 40, 32, 10).fill({ color: 0xffffff, alpha: 0.5 });
      const x = -w / 2 + ((this.t * 400) % (w + 200)) - 100;
      this.shine.x = Math.max(-w / 2, x);
      this.shine.visible = x < -w / 2 + w * p - 40;
    }
    this.title.tint = this.active ? 0xfff27a : 0xffffff;
    this.title.scale.set(this.active ? 1 + Math.sin(this.t * 14) * 0.08 : 1);
  }
}

// ------------------------------------------------------------- combo text
export class ComboLabel extends Container {
  private n = num('0', 64, 'NumGold');
  private word = txt('COMBO', { size: 26, font: 'dela', color: 0xffffff, stroke: 0x5a2400, strokeWidth: 7 });
  private bar = new Graphics();
  private shown = 0;
  constructor() {
    super();
    this.n.anchor.set(1, 0.5);
    this.word.anchor.set(0, 0.5);
    this.word.position.set(6, 6);
    this.addChild(this.n, this.word, this.bar);
    this.alpha = 0;
  }
  set(combo: number, remainP: number): void {
    if (combo !== this.shown) {
      this.shown = combo;
      if (combo >= 2) {
        this.n.text = String(combo);
        this.alpha = 1;
        gsap.killTweensOf(this.scale);
        this.scale.set(1.5);
        gsap.to(this.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
        this.n.style.fontFamily = combo >= 30 ? 'NumRed' : 'NumGold';
      } else if (combo === 0) {
        gsap.to(this, { alpha: 0, duration: 0.25 });
      }
    }
    const g = this.bar;
    g.clear();
    if (combo >= 2) {
      g.roundRect(-110, 38, 220, 8, 4).fill({ color: 0x000000, alpha: 0.4 });
      g.roundRect(-110, 38, 220 * remainP, 8, 4).fill(0xffd23f);
    }
  }
}

// ---------------------------------------------------------------- banners
/** Big slam-in text used for READY/GO/TIME UP etc. */
export function banner(parent: Container, text: string, x: number, y: number, opts: { size?: number; color?: number; stroke?: number; hold?: number; sub?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    const c = new Container();
    c.position.set(x, y);
    const t = txt(text, { size: opts.size ?? 110, font: 'dela', color: opts.color ?? 0xffffff, stroke: opts.stroke ?? 0x2a1630, strokeWidth: 16, shadow: true });
    c.addChild(t);
    if (opts.sub) {
      const s = txt(opts.sub, { size: 34, stroke: 0x2a1630, strokeWidth: 8 });
      s.y = (opts.size ?? 110) * 0.7;
      c.addChild(s);
    }
    parent.addChild(c);
    c.scale.set(3);
    c.alpha = 0;
    const tl = gsap.timeline({
      onComplete: () => {
        c.destroy({ children: true });
        resolve();
      },
    });
    tl.to(c, { alpha: 1, duration: 0.12 }, 0);
    tl.to(c.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.5)' }, 0);
    tl.to(c.scale, { x: 1.06, y: 1.06, duration: opts.hold ?? 0.6, ease: 'sine.inOut' });
    tl.to(c, { alpha: 0, duration: 0.2 });
    tl.to(c.scale, { x: 0.6, y: 1.6, duration: 0.2, ease: 'power2.in' }, '<');
  });
}


// ======================================================= Jungle GUI widgets

export function jungle(name: string): Sprite {
  const s = new Sprite(jtex(`jungle:${name}`));
  s.anchor.set(0.5);
  return s;
}

export function jungleSlice(name: string, w: number, h: number, inset: number): NineSliceSprite {
  const s = new NineSliceSprite({ texture: jtex(`jungle:${name}`), leftWidth: inset, rightWidth: inset, topHeight: inset, bottomHeight: inset });
  s.width = w;
  s.height = h;
  return s;
}

/** Clock icon + remaining seconds. */
export class JTimer extends Container {
  private digits = num('60', 50);
  private clock = jungle('clock');
  private warn = false;
  private frozen = false;
  private stopTag = txt('STOP', { size: 22, color: 0x7fe8ff, stroke: 0x0a2a40, strokeWidth: 6 });
  constructor() {
    super();
    this.stopTag.position.set(-38, 40);
    this.stopTag.visible = false;
    this.addChild(this.stopTag);
    this.clock.scale.set(92 / this.clock.texture.width);
    this.clock.x = -38;
    this.digits.anchor.set(0, 0.5);
    this.digits.x = 4;
    this.addChild(this.clock, this.digits);
  }
  /** Fever stops the clock; shown with an icy tint and a STOP tag. */
  set(remaining: number, frozen = false): void {
    if (frozen !== this.frozen) {
      this.frozen = frozen;
      this.stopTag.visible = frozen;
      this.clock.tint = frozen ? 0x9fe8ff : 0xffffff;
      this.digits.tint = frozen ? 0x9fe8ff : this.warn ? 0xff8aa0 : 0xffffff;
      if (frozen) gsap.fromTo(this.stopTag.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
    }
    const s = Math.ceil(Math.max(0, remaining));
    const t = String(s);
    if (this.digits.text !== t) {
      this.digits.text = t;
      if (s <= 10 && s > 0) {
        this.digits.scale.set(1.4);
        gsap.to(this.digits.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
        gsap.fromTo(this.clock, { rotation: -0.25 }, { rotation: 0, duration: 0.4, ease: 'elastic.out(1.5,0.3)' });
      }
    }
    const warn = remaining <= 10;
    if (warn !== this.warn) {
      this.warn = warn;
      this.digits.tint = this.frozen ? 0x9fe8ff : warn ? 0xff8aa0 : 0xffffff;
    }
  }
}

/** Score on a wooden plank with the defeat line (討伐ライン) underneath. */
export class ScoreLine extends Container {
  private value = num('0', 42);
  private lineText: Text;
  private check = jungle('ok');
  private shown = 0;
  private cleared = false;
  target = 0;
  constructor(private line: number) {
    super();
    const plank = jungleSlice('plank_s', 270, 74, 30);
    plank.position.set(-135, -40);
    const lbl = txt('SCORE', { size: 18, font: 'dela', color: 0xffd23f, stroke: 0x3b2412, strokeWidth: 5 });
    lbl.position.set(-96, -3);
    this.value.anchor.set(1, 0.5);
    this.value.position.set(120, -2);
    this.lineText = txt(`討伐ライン ${fmt(line)}`, { size: 22, color: 0xffffff, stroke: 0x3b2412, strokeWidth: 6, anchor: [1, 0.5] });
    this.lineText.position.set(124, 54);
    this.check.scale.set(40 / this.check.texture.width);
    this.check.position.set(-120, 54);
    this.check.visible = false;
    this.addChild(plank, lbl, this.value, this.lineText, this.check);
  }
  update(dt: number): void {
    if (this.shown !== this.target) {
      const diff = this.target - this.shown;
      this.shown += Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 10));
      if (Math.abs(this.target - this.shown) < 1) this.shown = this.target;
      this.value.text = fmt(this.shown);
    }
    if (!this.cleared && this.shown >= this.line) {
      this.cleared = true;
      this.lineText.text = '討伐ライン突破！';
      this.lineText.style.fill = 0xb6ff6a;
      this.check.visible = true;
      gsap.fromTo(this.check.scale, { x: 0, y: 0 }, { x: 40 / this.check.texture.width, y: 40 / this.check.texture.width, duration: 0.5, ease: 'back.out(3)' });
      gsap.fromTo(this.lineText.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.5, ease: 'back.out(3)' });
    }
  }
  bump(): void {
    gsap.fromTo(this.value.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
  }
}

/** Striped Jungle progress bar used for FEVER. */
export class JFever extends Container {
  private fill: Sprite;
  private maskG = new Graphics();
  private title: Text;
  private t = 0;
  private bw: number;
  value = 0;
  active = false;
  activeP = 0;
  constructor(w = 430) {
    super();
    this.bw = w;
    const bg = jungleSlice('barbg', w + 20, 46, 40);
    bg.position.set(-w / 2 - 10, -23);
    this.fill = new Sprite(jtex('jungle:barfill'));
    this.fill.anchor.set(0, 0.5);
    this.fill.height = 34;
    this.fill.width = w - 6;
    this.fill.x = -w / 2 + 3;
    this.fill.mask = this.maskG;
    this.title = txt('FEVER', { size: 24, font: 'dela', color: 0xffffff, stroke: 0x3b2412, strokeWidth: 7 });
    this.addChild(bg, this.fill, this.maskG, this.title);
  }
  update(dt: number): void {
    this.t += dt;
    const p = this.active ? this.activeP : Math.min(1, this.value / 100);
    const w = this.bw - 6;
    this.maskG.clear();
    if (p > 0.005) this.maskG.roundRect(-this.bw / 2 + 3, -17, w * p, 34, 17).fill(0xffffff);
    this.fill.tint = this.active ? hsl(this.t * 300) : p >= 1 ? 0xfff27a : 0xffffff;
    this.title.scale.set(this.active ? 1 + Math.sin(this.t * 14) * 0.08 : 1);
  }
}

function hsl(h: number): number {
  const l = 0.62;
  const a = Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
