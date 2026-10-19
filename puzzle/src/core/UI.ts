import { Container, FillGradient, Graphics, NineSliceSprite, Sprite, Text, TextStyle, Texture, type TextStyleOptions } from 'pixi.js';
import { tex } from './Loader';
import gsap from 'gsap';
import { Sound, haptic } from './Audio';

export const FONT_ROUND = 'Memokatchi, "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", sans-serif';
export const FONT_DELA = FONT_ROUND;

export interface TxtOpts {
  size: number;
  color?: number | string;
  font?: 'round' | 'dela';
  weight?: '500' | '800';
  stroke?: number | string;
  strokeWidth?: number;
  shadow?: boolean;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
  lineHeight?: number;
  anchor?: [number, number];
  letterSpacing?: number;
}

export function txt(text: string, o: TxtOpts): Text {
  const style: TextStyleOptions = {
    fontFamily: o.font === 'dela' ? FONT_DELA : FONT_ROUND,
    fontWeight: o.font === 'dela' ? '400' : (o.weight ?? '800'),
    fontSize: o.size,
    fill: o.color ?? 0xffffff,
    align: o.align ?? 'center',
    letterSpacing: o.letterSpacing ?? 0,
    padding: 8,
  };
  if (o.stroke !== undefined) style.stroke = { color: o.stroke, width: o.strokeWidth ?? Math.max(3, o.size * 0.16), join: 'round' };
  if (o.shadow) style.dropShadow = { color: 0x000000, alpha: 0.35, blur: 2, distance: Math.max(2, o.size * 0.08), angle: Math.PI / 2 };
  if (o.wrap) {
    style.wordWrap = true;
    style.wordWrapWidth = o.wrap;
    style.breakWords = true;
  }
  if (o.lineHeight) style.lineHeight = o.lineHeight;
  const t = new Text({ text, style: new TextStyle(style), resolution: 2 });
  const [ax, ay] = o.anchor ?? [0.5, 0.5];
  t.anchor.set(ax, ay);
  return t;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

export type BtnColor = 'pink' | 'yellow' | 'blue' | 'green' | 'purple' | 'grey' | 'orange';
const BTN: Record<BtnColor, [string, string, string, number]> = {
  // light, base, depth, outline
  pink: ['#ff9ec4', '#ff4f8f', '#c21f63', 0x8a0f43],
  yellow: ['#fff3a0', '#ffc61a', '#d98a00', 0x8a5200],
  blue: ['#a6e3ff', '#2fa3ff', '#165fc4', 0x0b3a7a],
  green: ['#b9f7a6', '#3ccf5a', '#1a8a33', 0x0e5220],
  purple: ['#dcb8ff', '#9b55ff', '#6020c2', 0x3a0f7a],
  grey: ['#e8ecf5', '#a7b0c4', '#6c7590', 0x3d4357],
  orange: ['#ffd29a', '#ff8a1f', '#c95400', 0x7a3000],
};

const gradCache = new Map<string, FillGradient>();
/** Shared per stop list: each gradient owns a texture, so don't rebuild it per screen. */
export function grad(stops: [number, string][], vertical = true): FillGradient {
  const key = `${vertical}|${stops.join(';')}`;
  let g = gradCache.get(key);
  if (!g) gradCache.set(key, (g = makeGrad(stops, vertical)));
  return g;
}

function makeGrad(stops: [number, string][], vertical: boolean): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: vertical ? { x: 0, y: 1 } : { x: 1, y: 0 },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
}

export function drawPill(g: Graphics, w: number, h: number, color: BtnColor, r = Math.min(h / 2, 34), depth = 8): void {
  const [light, base, dark, line] = BTN[color];
  g.clear();
  g.roundRect(-w / 2, -h / 2 + depth, w, h, r).fill({ color: 0x000000, alpha: 0.25 });
  g.roundRect(-w / 2, -h / 2 + depth * 0.6, w, h, r).fill(dark);
  g.roundRect(-w / 2, -h / 2, w, h, r).fill(grad([[0, light], [0.5, base], [1, base]]));
  g.roundRect(-w / 2 + 8, -h / 2 + 5, w - 16, h * 0.42, Math.max(4, r - 6)).fill({ color: 0xffffff, alpha: 0.32 });
  g.roundRect(-w / 2, -h / 2, w, h + depth * 0.6, r).stroke({ width: 4, color: line });
}

export interface ButtonOpts {
  w: number;
  h: number;
  label?: string;
  sub?: string;
  color?: BtnColor;
  size?: number;
  icon?: Texture;
  iconScale?: number;
  sound?: string | null;
  onTap: () => void;
}

const SKIN: Record<BtnColor, [string, number, number]> = {
  // jungle texture, nine-slice inset, label stroke
  pink: ['btn_pink', 44, 0x5a0a2a],
  orange: ['btn_red', 60, 0x5a0a0a],
  yellow: ['btn_yellow', 44, 0x6a3a00],
  green: ['btn_green', 44, 0x1e3a08],
  blue: ['btn_blue', 44, 0x0a2a5a],
  purple: ['btn_purple', 44, 0x2a0a5a],
  grey: ['plank', 34, 0x2a1608],
};

/** Jungle GUI (CraftPix) button art stretched with a nine-slice. */
function buttonSkin(w: number, h: number, color: BtnColor): Container {
  const [name, inset] = SKIN[color];
  const s = new NineSliceSprite({ texture: tex(`jungle:${name}`), leftWidth: inset, rightWidth: inset, topHeight: inset, bottomHeight: inset });
  s.width = w;
  s.height = h + 8;
  s.position.set(-w / 2, -h / 2);
  return s;
}

/** Button with squash feedback on press. */
export class Button extends Container {
  readonly bg = new Container();
  readonly face = new Container();
  caption?: Text;
  subText?: Text;
  setSub(t: string): void {
    if (this.subText && !this.subText.destroyed) this.subText.text = t;
  }
  private _enabled = true;
  private pressed = false;

  constructor(o: ButtonOpts) {
    super();
    this.addChild(this.face);
    this.face.addChild(this.bg);
    this.bg.addChild(buttonSkin(o.w, o.h, o.color ?? 'pink'));
    let lx = 0;
    if (o.icon) {
      const ic = new Sprite(o.icon);
      ic.anchor.set(0.5);
      const s = (o.iconScale ?? 0.55) * (o.h / ic.texture.height);
      ic.scale.set(s);
      ic.x = o.label ? -o.w / 2 + o.h * 0.55 : 0;
      ic.y = -2;
      this.face.addChild(ic);
      if (o.label) lx = o.h * 0.25;
    }
    if (o.label) {
      const line = SKIN[o.color ?? 'pink'][2];
      this.caption = txt(o.label, { size: o.size ?? Math.min(40, o.h * 0.4), stroke: line, strokeWidth: 6 });
      this.caption.x = lx;
      this.caption.y = o.sub ? -o.h * 0.14 : -2;
      this.face.addChild(this.caption);
      if (o.sub) {
        const s = txt(o.sub, { size: (o.size ?? 36) * 0.5, stroke: line, strokeWidth: 4 });
        s.x = lx;
        s.y = o.h * 0.25;
        this.face.addChild(s);
        this.subText = s;
      }
    }
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= o.w / 2 + 6 && y >= -o.h / 2 - 6 && y <= o.h / 2 + 12 };
    this.on('pointerdown', () => {
      if (!this._enabled || this.face.destroyed) return;
      this.pressed = true;
      gsap.to(this.face.scale, { x: 1.06, y: 0.9, duration: 0.08, ease: 'power2.out' });
      gsap.to(this.face, { y: 5, duration: 0.08 });
      haptic(6);
    });
    const release = (fire: boolean) => {
      if (!this.pressed || this.face.destroyed) return;
      this.pressed = false;
      gsap.to(this.face.scale, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' });
      gsap.to(this.face, { y: 0, duration: 0.3, ease: 'back.out(3)' });
      if (fire) {
        if (o.sound !== null) Sound.play(o.sound ?? 'ui_tap', { vol: 0.8 });
        o.onTap();
      }
    };
    this.on('pointerup', () => release(true));
    this.on('pointerupoutside', () => release(false));
    this.on('pointerleave', () => release(false));
  }

  set enabled(v: boolean) {
    this._enabled = v;
    this.face.alpha = v ? 1 : 0.5;
    this.cursor = v ? 'pointer' : 'default';
  }
  get enabled(): boolean {
    return this._enabled;
  }

  /** Gentle idle bounce to draw the eye to the primary action. */
  breathe(): this {
    gsap.to(this.face.scale, { x: 1.04, y: 0.97, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    return this;
  }
}

/** Rounded translucent panel. */
export function panel(w: number, h: number, opts: { color?: number; alpha?: number; line?: number; r?: number } = {}): Graphics {
  const g = new Graphics();
  const r = opts.r ?? 28;
  g.roundRect(-w / 2, -h / 2 + 8, w, h, r).fill({ color: 0x000000, alpha: 0.25 });
  g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: opts.color ?? 0xffffff, alpha: opts.alpha ?? 1 });
  g.roundRect(-w / 2, -h / 2, w, h, r).stroke({ width: 5, color: opts.line ?? 0x4a2f7a });
  return g;
}

/** Pop-in animation for newly shown UI. */
export function popIn(o: Container, delay = 0, from = 0.4): gsap.core.Tween {
  o.scale.set(from);
  o.alpha = 0;
  gsap.to(o, { alpha: 1, duration: 0.15, delay });
  return gsap.to(o.scale, { x: 1, y: 1, duration: 0.55, delay, ease: 'elastic.out(1, 0.55)' });
}

/** Coin icon drawn with graphics so it scales crisply. */
export function coinIcon(r = 18): Graphics {
  const g = new Graphics();
  g.circle(0, 2, r).fill(0xb86e00);
  g.circle(0, 0, r).fill(grad([[0, '#fff2a0'], [0.5, '#ffc81f'], [1, '#e89a00']]));
  g.circle(0, 0, r).stroke({ width: Math.max(2, r * 0.14), color: 0x8a4f00 });
  g.circle(0, 0, r * 0.62).stroke({ width: Math.max(1.5, r * 0.1), color: 0xd98a00 });
  g.roundRect(-r * 0.12, -r * 0.38, r * 0.24, r * 0.76, r * 0.1).fill(0xd98a00);
  g.ellipse(-r * 0.35, -r * 0.4, r * 0.25, r * 0.14).fill({ color: 0xffffff, alpha: 0.7 });
  return g;
}

/** A Jungle GUI round icon button (the art already includes the button body). */
export function iconButton(name: string, size: number, onTap: () => void): Container {
  const c = new Container();
  const s = new Sprite(tex(`jungle:${name}`));
  s.anchor.set(0.5);
  s.scale.set(size / s.texture.width);
  c.addChild(s);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.on('pointerdown', () => gsap.to(s.scale, { x: (size / s.texture.width) * 1.08, y: (size / s.texture.width) * 0.9, duration: 0.08 }));
  const up = () => gsap.to(s.scale, { x: size / s.texture.width, y: size / s.texture.width, duration: 0.45, ease: 'elastic.out(1.2,0.4)' });
  c.on('pointerupoutside', up);
  c.on('pointerup', () => {
    up();
    Sound.play('ui_tap', { vol: 0.8 });
    haptic(6);
    onTap();
  });
  return c;
}
