import { AnimatedSprite, Container, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import { strip, tex } from './assets';

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  max: number;
  gravity: number;
  ground: number;
  bounced: boolean;
}

interface Floater {
  t: Text;
  vy: number;
  life: number;
  max: number;
  scale: number;
}

const STYLES = {
  gold: new TextStyle({ fontFamily: 'Dela Gothic One', fontSize: 30, fill: '#ffe066', stroke: { color: '#4a2a12', width: 7, join: 'round' },
    dropShadow: { color: '#000000', alpha: 0.35, blur: 0, distance: 3, angle: Math.PI / 2 } }),
  crit: new TextStyle({ fontFamily: 'Dela Gothic One', fontSize: 44, fill: '#ff8a3d', stroke: { color: '#3b1206', width: 9, join: 'round' },
    dropShadow: { color: '#000000', alpha: 0.4, blur: 0, distance: 4, angle: Math.PI / 2 } }),
  small: new TextStyle({ fontFamily: 'Dela Gothic One', fontSize: 20, fill: '#fff4cf', stroke: { color: '#3a2a1a', width: 5, join: 'round' } }),
  wood: new TextStyle({ fontFamily: 'Dela Gothic One', fontSize: 20, fill: '#f2c38b', stroke: { color: '#3a2412', width: 5, join: 'round' } }),
  meat: new TextStyle({ fontFamily: 'Dela Gothic One', fontSize: 20, fill: '#ffb3a8', stroke: { color: '#3a1512', width: 5, join: 'round' } }),
  banner: new TextStyle({ fontFamily: 'Dela Gothic One', fontSize: 40, fill: '#fff8e0', stroke: { color: '#2b1d10', width: 9, join: 'round' },
    dropShadow: { color: '#000000', alpha: 0.4, blur: 0, distance: 4, angle: Math.PI / 2 } }),
};
export type FloatStyle = keyof typeof STYLES;

export class Fx {
  layer = new Container();
  top = new Container();
  private parts: Particle[] = [];
  private floats: Floater[] = [];
  private textPool: Text[] = [];

  /** 金のかけらが弧を描いて飛び散る */
  burst(x: number, y: number, n: number, textures: Texture[], power = 1) {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(textures[(Math.random() * textures.length) | 0]);
      s.anchor.set(0.5);
      s.scale.set(0.35 + Math.random() * 0.25);
      s.position.set(x, y);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = (260 + Math.random() * 260) * power;
      this.layer.addChild(s);
      this.parts.push({ s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vr: (Math.random() - 0.5) * 12, life: 0, max: 0.9 + Math.random() * 0.4,
        gravity: 1500, ground: y + 20 + Math.random() * 40, bounced: false });
    }
  }

  /** 1回だけ再生するアニメーション（土煙・爆発など） */
  oneShot(key: string, x: number, y: number, scale = 1, speed = 0.3, parent?: Container) {
    const a = new AnimatedSprite(strip(key));
    a.anchor.set(0.5);
    a.position.set(x, y);
    a.scale.set(scale);
    a.loop = false;
    a.animationSpeed = speed;
    a.onComplete = () => a.destroy();
    (parent ?? this.layer).addChild(a);
    a.play();
    return a;
  }

  float(x: number, y: number, text: string, style: FloatStyle = 'gold', scale = 1) {
    const t = this.textPool.pop() ?? new Text({ text: '', style: STYLES[style] });
    t.style = STYLES[style];
    t.text = text;
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() - 0.5) * 30, y);
    t.alpha = 1;
    t.scale.set(scale * 0.4);
    t.visible = true;
    this.top.addChild(t);
    this.floats.push({ t, vy: -90 - Math.random() * 30, life: 0, max: style === 'crit' ? 1.4 : 1.05, scale });
  }

  update(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      p.vy += p.gravity * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.vr * dt;
      if (!p.bounced && p.vy > 0 && p.s.y > p.ground) {
        p.bounced = true;
        p.vy *= -0.35;
        p.vx *= 0.5;
        p.vr *= 0.4;
      }
      if (p.life > p.max * 0.7) p.s.alpha = Math.max(0, 1 - (p.life - p.max * 0.7) / (p.max * 0.3));
      if (p.life >= p.max) {
        p.s.destroy();
        this.parts.splice(i, 1);
      }
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life += dt;
      const k = f.life / f.max;
      // pop in, rise, fade
      const pop = f.life < 0.12 ? 0.4 + (f.life / 0.12) * 0.8 : f.life < 0.22 ? 1.2 - ((f.life - 0.12) / 0.1) * 0.2 : 1;
      f.t.scale.set(pop * f.scale);
      f.t.y += f.vy * dt;
      f.vy *= 1 - dt * 2.2;
      f.t.alpha = k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35);
      if (f.life >= f.max) {
        f.t.visible = false;
        f.t.removeFromParent();
        this.textPool.push(f.t);
        this.floats.splice(i, 1);
      }
    }
  }
}

export function goldChunks(): Texture[] {
  return [tex('res/goldstone1'), tex('res/goldstone2'), tex('res/gold')];
}
