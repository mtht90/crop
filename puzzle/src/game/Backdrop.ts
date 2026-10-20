import { Assets, Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
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

/** Fairy-Tale (CraftPix) parallax: background plus 7 layers, 7 = farthest, 1 = nearest. */
export class FairyBackdrop extends Container {
  private layers: Sprite[] = [];
  private t = 0;
  private w = 720;
  constructor(set: number) {
    super();
    for (const l of ['background', 7, 6, 5, 4, 3, 2, 1]) {
      const s = new Sprite(tex(`fairy:${set}_${l}`));
      s.anchor.set(0.5, 1);
      this.layers.push(s);
      this.addChild(s);
    }
  }
  layout(w: number, h: number): void {
    this.w = w;
    for (const s of this.layers) {
      const k = Math.max((w * 1.08) / s.texture.width, (h * 1.05) / s.texture.height);
      s.scale.set(k);
      s.position.set(w / 2, h + 6);
    }
  }
  update(dt: number, speed = 1): void {
    this.t += dt * speed;
    this.layers.forEach((s, i) => {
      // nearer layers sway further for a gentle sense of depth
      s.x = this.w / 2 + Math.sin(this.t * 0.25) * i * 2.2;
    });
  }
}

/**
 * Menu background: a Fairy-Tale scene (same art family as the battle stage) under a soft
 * colored shade, with a slowly drifting dot pattern. `c1`/`c2` tint the shade per screen.
 */
export class MenuBackground extends Container {
  private g = new Graphics();
  private pic: Sprite;
  private pattern: TilingSprite;
  private t = 0;
  constructor(private c1 = 0x7a4dff, private c2 = 0xff6fb5, set = 1) {
    super();
    this.pic = new Sprite(Assets.get<Texture>(`menubg:${set}`) ?? Texture.EMPTY);
    this.pic.anchor.set(0.5);
    this.addChild(this.pic, this.g);
    this.pattern = new TilingSprite({ texture: dotTexture(), width: 100, height: 100 });
    this.pattern.alpha = 0.35;
    this.addChild(this.pattern);
  }
  layout(w: number, h: number): void {
    // cover
    const tw = this.pic.texture.width || 1;
    const th = this.pic.texture.height || 1;
    this.pic.scale.set(Math.max(w / tw, h / th));
    this.pic.position.set(w / 2, h / 2);
    this.g.clear();
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      this.g.rect(0, (h * i) / bands, w, h / bands + 1).fill({ color: lerpColor(this.c1, this.c2, k), alpha: 0.55 });
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
