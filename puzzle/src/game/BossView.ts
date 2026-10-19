import { Assets, ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { bossAlias, type BossDef, type BossPose } from '../data/bosses';

/** Pre-rendered KayKit skeleton with pose swaps, breathing and springy hit reactions. */
export class BossView extends Container {
  readonly rig = new Container();
  readonly shadow = new Graphics();
  private sprite: Sprite;
  private t = Math.random() * 10;
  private flash = new ColorMatrixFilter();
  private flashT = 0;
  private knock = 0;
  private knockV = 0;
  private squash = 0;
  private squashV = 0;
  private poseT = 0;
  private pose: BossPose = 'idle';
  rage = 0;
  dizzy = false;
  still = false;
  /** Display height in local units. */
  readonly size = 330;

  constructor(public def: BossDef) {
    super();
    this.shadow.ellipse(0, 0, 120, 22).fill({ color: 0x000000, alpha: 0.28 });
    this.sprite = new Sprite(this.tex('idle'));
    this.sprite.anchor.set(0.5, 1);
    const s = this.size / this.sprite.texture.height;
    this.sprite.scale.set(s);
    this.rig.addChild(this.sprite);
    this.addChild(this.shadow, this.rig);
    this.flash.brightness(1, false);
  }

  private tex(p: BossPose): Texture {
    return Assets.get<Texture>(bossAlias(this.def.id, p)) ?? Texture.WHITE;
  }

  get height2(): number {
    return this.size;
  }

  aimPoint(): { x: number; y: number } {
    return { x: (Math.random() - 0.5) * 90, y: -this.size * (0.55 + (Math.random() - 0.5) * 0.3) };
  }

  setPose(p: BossPose, dur = 0): void {
    this.pose = p;
    this.sprite.texture = this.tex(p);
    this.poseT = dur;
  }

  hit(power = 1): void {
    this.flashT = 0.07;
    this.knockV += 260 * power * (Math.random() < 0.5 ? -1 : 1);
    this.squashV -= 3.2 * power;
    if (this.pose !== 'death') this.setPose('hit', 0.28);
  }

  laugh(dur = 1.4): void {
    this.setPose('cheer', dur);
    gsap.to(this.rig, { y: -20, duration: 0.12, yoyo: true, repeat: Math.floor(dur / 0.24), ease: 'sine.inOut' });
  }

  shout(dur = 0.8): void {
    this.setPose('cheer', dur);
    this.squashV += 4;
  }

  die(): void {
    this.setPose('death', 0);
    this.still = true;
  }

  update(dt: number): void {
    this.t += dt * (1 + this.rage * 0.8);
    this.knockV += (-220 * this.knock - 16 * this.knockV) * dt;
    this.knock += this.knockV * dt;
    this.squashV += (-240 * this.squash - 12 * this.squashV) * dt;
    this.squash += this.squashV * dt;
    const bob = this.still ? 0 : Math.sin(this.t * 2.2) * 0.025;
    this.rig.scale.set(1 - this.squash * 0.5 - bob * 0.5, 1 + this.squash + bob);
    this.rig.x = this.knock * 0.12;
    this.rig.rotation = this.knock * 0.0006 + (this.dizzy ? Math.sin(this.t * 5) * 0.06 : 0);
    if (this.poseT > 0) {
      this.poseT -= dt;
      if (this.poseT <= 0 && this.pose !== 'death') this.setPose('idle');
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.brightness(2.4, false);
      this.rig.filters = [this.flash];
    } else if (this.rig.filters && (this.rig.filters as unknown[]).length) {
      this.rig.filters = [];
    }
  }
}
