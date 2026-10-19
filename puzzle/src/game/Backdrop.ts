import { Container, Graphics, Rectangle, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { tex } from '../core/Loader';
import { App } from '../core/App';

let dotTex: Texture | null = null;
function dotTexture(): Texture {
  if (dotTex) return dotTex;
  const g = new Graphics();
  g.circle(30, 30, 9).fill({ color: 0xffffff, alpha: 0.12 });
  g.circle(0, 0, 5).fill({ color: 0xffffff, alpha: 0.08 });
  g.circle(60, 60, 5).fill({ color: 0xffffff, alpha: 0.08 });
  dotTex = App.pixi.renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, 60, 60) });
  return dotTex;
}

/** Parallax sky + scenery backdrop with drifting clouds. */
export class Backdrop extends Container {
  private bg: Sprite;
  private clouds: { s: Sprite; v: number }[] = [];
  private w = 720;
  readonly shade = new Graphics();

  constructor(bgName: string) {
    super();
    this.bg = new Sprite(tex(`bg:${bgName}`));
    this.bg.anchor.set(0.5, 1);
    this.addChild(this.bg);
    const names = ['cloud1', 'cloud3', 'cloud5', 'cloud7'];
    for (let i = 0; i < 5; i++) {
      const s = new Sprite(tex(`deco:${names[i % names.length]}`));
      s.anchor.set(0.5);
      s.alpha = 0.85;
      s.scale.set(0.35 + Math.random() * 0.35);
      this.clouds.push({ s, v: 8 + Math.random() * 16 });
      this.addChild(s);
    }
    this.addChild(this.shade);
  }

  layout(w: number, h: number): void {
    this.w = w;
    const s = Math.max(w / this.bg.texture.width, (h * 1.35) / this.bg.texture.height);
    this.bg.scale.set(s);
    // keep the horizon around the bottom third of the stage
    this.bg.position.set(w / 2, h + this.bg.texture.height * s * 0.18);
    this.clouds.forEach((c, i) => {
      c.s.x = (i / this.clouds.length) * w + Math.random() * 80;
      c.s.y = 60 + (i % 3) * 55 + Math.random() * 20;
    });
    this.shade.clear();
    this.shade.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0 });
  }

  update(dt: number, speed = 1): void {
    for (const c of this.clouds) {
      c.s.x += c.v * dt * speed;
      if (c.s.x - c.s.width / 2 > this.w) c.s.x = -c.s.width / 2;
    }
  }
}

/** Fullscreen soft gradient background used by menus. */
export class MenuBackground extends Container {
  private g = new Graphics();
  private pattern: TilingSprite;
  private t = 0;
  constructor(private c1 = 0x7a4dff, private c2 = 0xff6fb5) {
    super();
    this.addChild(this.g);
    this.pattern = new TilingSprite({ texture: dotTexture(), width: 100, height: 100 });
    this.addChild(this.pattern);
  }
  layout(w: number, h: number): void {
    this.g.clear();
    this.g.rect(0, 0, w, h).fill({ color: this.c1 });
    // vertical gradient via stacked bands (cheap and smooth enough at this size)
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      this.g.rect(0, (h * i) / bands, w, h / bands + 1).fill({ color: lerpColor(this.c1, this.c2, k) });
    }
    this.pattern.width = w;
    this.pattern.height = h;
  }
  update(dt: number): void {
    this.t += dt;
    this.pattern.tilePosition.x = this.t * 12;
    this.pattern.tilePosition.y = this.t * 18;
  }
}

export function lerpColor(a: number, b: number, k: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
}
