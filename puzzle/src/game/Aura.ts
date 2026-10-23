import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { starPath } from '../scenes/common';

/**
 * The UR aura: a breathing golden glow, slowly turning rays and sparkles drifting up.
 * Shown behind a UR character everywhere except the puzzle board.
 */
export function urAura(radius: number): Container {
  const c = new Container();
  const glow = new Graphics();
  for (let i = 5; i >= 1; i--) glow.circle(0, 0, radius * (0.55 + i * 0.12)).fill({ color: 0xffd23f, alpha: 0.07 });
  glow.blendMode = 'add';
  const rays = new Graphics();
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = (Math.PI / n) * 0.45;
    rays.moveTo(0, 0).lineTo(Math.cos(a - w) * radius * 1.25, Math.sin(a - w) * radius * 1.25).lineTo(Math.cos(a + w) * radius * 1.25, Math.sin(a + w) * radius * 1.25).closePath();
  }
  rays.fill({ color: 0xfff2a0, alpha: 0.22 });
  rays.blendMode = 'add';
  const sparks = new Container();
  c.addChild(glow, rays, sparks);
  const tweens: gsap.core.Tween[] = [];
  tweens.push(gsap.to(rays, { rotation: Math.PI * 2, duration: 14, repeat: -1, ease: 'none' }));
  tweens.push(gsap.to(glow.scale, { x: 1.08, y: 1.08, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  for (let i = 0; i < 10; i++) {
    const s = starPath(new Graphics(), radius * 0.06).fill(i % 2 ? 0xfff27a : 0xffffff);
    s.blendMode = 'add';
    sparks.addChild(s);
    const reset = (): void => {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.35 + Math.random() * 0.6);
      s.position.set(Math.cos(a) * d, Math.sin(a) * d * 0.8 + radius * 0.3);
      s.alpha = 0;
      s.scale.set(0.5 + Math.random() * 0.8);
    };
    reset();
    tweens.push(gsap.to(s, { y: `-=${radius * 0.7}`, alpha: 1, duration: 1.6, delay: i * 0.17, repeat: -1, ease: 'sine.out', onRepeat: reset, yoyo: false }));
  }
  c.on('destroyed', () => tweens.forEach((t) => t.kill()));
  return c;
}
