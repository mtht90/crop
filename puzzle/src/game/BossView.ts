import { Assets, ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import type { BossDef, PartRole } from '../data/bosses';

interface Part {
  role: PartRole;
  s: Sprite;
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
}

export function monsterTex(name: string): Texture {
  return Assets.get<Texture>(`mon:${name}`) ?? Texture.WHITE;
}

/** A rigged Kenney monster: idle bob, swinging arms, blinking, hit reactions. */
export class BossView extends Container {
  readonly rig = new Container();
  readonly shadow = new Graphics();
  private parts: Part[] = [];
  private t = Math.random() * 10;
  private blinkT = 2;
  private flash = new ColorMatrixFilter();
  private flashT = 0;
  private knock = 0;
  private knockV = 0;
  private squash = 0;
  private squashV = 0;
  private mouth?: Part;
  private mouthBase?: Texture;
  private mouthT = 0;
  /** 0 = calm, 1 = angry (faster idle). */
  rage = 0;
  dizzy = false;
  /** Disable idle motion (e.g. during the defeat animation). */
  still = false;

  constructor(public def: BossDef) {
    super();
    this.shadow.ellipse(0, 0, 150, 26).fill({ color: 0x000000, alpha: 0.25 });
    this.addChild(this.shadow, this.rig);
    this.rig.scale.set(def.scale);
    const order: PartRole[] = ['legL', 'legR', 'armL', 'armR', 'back', 'body', 'eye', 'front', 'mouth'];
    const sorted = [...def.parts].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    for (const p of sorted) {
      const s = new Sprite(monsterTex(p.tex));
      const limb = p.role.startsWith('arm') || p.role.startsWith('leg');
      // anchor is in texture space, so a mirrored limb still pivots on the same shoulder/hip point
      s.anchor.set(p.ax ?? 0.5, p.ay ?? (limb ? 0.08 : 0.5));
      const sc = p.scale ?? 1;
      const part: Part = { role: p.role, s, x: p.x, y: p.y, rot: (p.rot ?? 0) * (p.flip ? -1 : 1), sx: sc * (p.flip ? -1 : 1), sy: sc };
      s.position.set(p.x, p.y);
      s.rotation = part.rot;
      s.scale.set(part.sx, part.sy);
      this.rig.addChild(s);
      this.parts.push(part);
      if (p.role === 'mouth') {
        this.mouth = part;
        this.mouthBase = s.texture;
      }
    }
    // feet rest on y = 0 of this container
    const b = this.rig.getLocalBounds();
    this.rig.pivot.y = b.y + b.height;
    this.shadow.y = 4;
    this.flash.brightness(1, false);
  }

  get height2(): number {
    return this.rig.height;
  }

  /** Point on the body (in this container's coordinates) that projectiles aim for. */
  aimPoint(): { x: number; y: number } {
    const h = this.rig.height;
    return { x: (Math.random() - 0.5) * this.rig.width * 0.35, y: -h * (0.45 + (Math.random() - 0.5) * 0.25) };
  }

  hit(power = 1): void {
    this.flashT = 0.07;
    this.knockV += 260 * power * (Math.random() < 0.5 ? -1 : 1);
    this.squashV -= 3.2 * power;
    this.setMouth(this.def.mouthHurt, 0.35);
  }

  laugh(dur = 1.4): void {
    this.setMouth(this.def.mouthLaugh, dur);
    gsap.to(this.rig, { y: -20, duration: 0.12, yoyo: true, repeat: Math.floor(dur / 0.24), ease: 'sine.inOut' });
  }

  shout(dur = 0.8): void {
    this.setMouth(this.def.mouthHurt, dur);
    this.squashV += 4;
  }

  private setMouth(tex: string, dur: number): void {
    if (!this.mouth) return;
    this.mouth.s.texture = monsterTex(tex);
    this.mouthT = dur;
  }

  update(dt: number): void {
    this.t += dt * (1 + this.rage * 0.8);
    const t = this.t;
    // springs
    this.knockV += (-220 * this.knock - 16 * this.knockV) * dt;
    this.knock += this.knockV * dt;
    this.squashV += (-240 * this.squash - 12 * this.squashV) * dt;
    this.squash += this.squashV * dt;
    const bob = this.still ? 0 : Math.sin(t * 2.2) * 0.025;
    this.rig.scale.set(this.def.scale * (1 - this.squash * 0.5 - bob * 0.5), this.def.scale * (1 + this.squash + bob));
    this.rig.x = this.knock * 0.12;
    this.rig.rotation = this.knock * 0.0006 + (this.dizzy ? Math.sin(t * 5) * 0.05 : 0);
    for (const p of this.parts) {
      const side = p.role.endsWith('L') ? 1 : -1;
      if (this.still) continue;
      if (p.role === 'armL' || p.role === 'armR') {
        p.s.rotation = p.rot + side * (Math.sin(t * 3 + (side > 0 ? 0 : 1.2)) * 0.16 + this.rage * Math.sin(t * 12) * 0.08);
      } else if (p.role === 'legL' || p.role === 'legR') {
        p.s.rotation = p.rot + Math.sin(t * 2.2 + (side > 0 ? 0 : Math.PI)) * 0.03;
      } else if (p.role === 'back') {
        p.s.rotation = p.rot + Math.sin(t * 2.6 + p.x) * 0.06;
      }
    }
    // blink
    this.blinkT -= dt;
    const blink = this.blinkT < 0.1 && this.blinkT > 0;
    if (this.blinkT <= 0) this.blinkT = 2 + Math.random() * 3;
    for (const p of this.parts) if (p.role === 'eye') p.s.scale.y = p.sy * (blink ? 0.12 : 1);
    if (this.mouthT > 0) {
      this.mouthT -= dt;
      if (this.mouthT <= 0 && this.mouth && this.mouthBase) this.mouth.s.texture = this.mouthBase;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.brightness(2.6, false);
      this.rig.filters = [this.flash];
    } else if (this.rig.filters && (this.rig.filters as unknown[]).length) {
      this.rig.filters = [];
    }
  }
}
