import { Container, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { App } from './App';
import { COLORS } from '../art/PieceArt';

export abstract class Scene {
  readonly view = new Container();
  /** Owns every GSAP animation started while this scene is current. */
  readonly anims = gsap.context(() => {});
  /** Called after the scene is added to the stage. */
  abstract enter(): void;
  /** Per-frame update, dt in seconds. */
  update(_dt: number): void {}
  /** Re-layout after a viewport change. */
  resize(): void {}
  exit(): void {}
  /** Loads what the scene needs; runs while the transition covers the screen. */
  async preload(): Promise<void> {}
}

class SceneManagerImpl {
  current: Scene | null = null;
  private layer = new Container();
  private wipe = new Container();
  private busy = false;
  private pruneT = 3;

  init(): void {
    App.root.addChild(this.layer);
    App.root.addChild(this.wipe);
    App.onResize(() => this.current?.resize());
    App.pixi.ticker.add((t) => {
      const dt = Math.min(t.deltaMS / 1000, 1 / 20);
      this.current?.update(dt);
      // the scene's context remembers every tween it ever made; drop the finished ones now and then
      this.pruneT -= dt;
      if (this.pruneT <= 0 && this.current) {
        this.pruneT = 3;
        const ctx = this.current.anims as unknown as { data: { totalProgress?: () => number }[] };
        ctx.data = ctx.data.filter((d) => typeof d.totalProgress !== 'function' || d.totalProgress() < 1);
      }
    });
  }

  /** Bubble-wipe transition into a new scene. */
  go(make: () => Scene, instant = false): void {
    if (this.busy) return;
    this.busy = true;
    void this.transition(make, instant || !this.current);
  }

  private tween(state: { p: number }, to: number, duration: number, ease: string): Promise<void> {
    return new Promise((resolve) => {
      ownTween = true;
      gsap.to(state, { p: to, duration, ease, onUpdate: () => this.drawWipe(state.p), onComplete: () => resolve() });
      ownTween = false;
      // never let a paused/stalled timeline leave the screen covered
      window.setTimeout(resolve, duration * 1000 + 1500);
    });
  }

  private async transition(make: () => Scene, instant: boolean): Promise<void> {
    const state = { p: 0 };
    // the outgoing scene must not take taps while the wipe covers it
    this.layer.interactiveChildren = false;
    try {
      gsap.globalTimeline.resume();
      if (!instant) await this.tween(state, 1, 0.38, 'power2.in');
      state.p = 1;
      this.drawWipe(1);
      const next = make();
      await next.preload();
      this.swap(next);
    } catch (e) {
      reportError(e);
    } finally {
      if (!instant) await this.tween(state, 0, 0.42, 'power2.out');
      this.drawWipe(0);
      this.layer.interactiveChildren = true;
      this.busy = false;
    }
  }

  private swap(next: Scene): void {
    if (this.current) {
      const prev = this.current;
      this.current = null;
      try {
        prev.exit();
      } catch (e) {
        reportError(e);
      }
      this.layer.removeChild(prev.view);
      // tweens still running on destroyed objects throw inside GSAP's ticker and
      // stall every animation (including this wipe), so kill them first
      prev.anims.kill();
      killTweensIn(prev.view);
      prev.view.destroy({ children: true });
    }
    this.current = next;
    this.layer.addChild(next.view);
    next.enter();
    next.resize();
  }

  private dots: Sprite[] = [];
  private dotsFor = '';

  /** Bubble wipe built from pre-made sprites: only scales change per frame. */
  private drawWipe(p: number): void {
    const step = 110;
    const key = `${Math.round(App.W)}x${Math.round(App.H)}`;
    if (key !== this.dotsFor) {
      this.dotsFor = key;
      this.wipe.removeChildren().forEach((c) => c.destroy());
      this.dots = [];
      const cols = Math.ceil(App.W / step) + 2;
      const rows = Math.ceil(App.H / (step * 0.866)) + 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const s = new Sprite(dotTexture());
          s.anchor.set(0.5);
          s.position.set(c * step + (r % 2 ? step / 2 : 0) - step / 2, r * step * 0.866 - step / 2);
          s.tint = COLORS[(r * 3 + c) % 5].hex;
          this.dots.push(s);
          this.wipe.addChild(s);
        }
      }
    }
    this.wipe.visible = p > 0;
    if (p <= 0) return;
    for (const s of this.dots) {
      // stagger from top-left so it reads as a wave
      const d = (s.x / App.W) * 0.35 + (s.y / App.H) * 0.45;
      const local = Math.min(1, Math.max(0, p * 1.8 - d));
      s.scale.set((local * step * 0.82 * 2) / 128);
    }
  }
}

function killTweensIn(root: Container): void {
  const stack: Container[] = [root];
  while (stack.length) {
    const c = stack.pop()!;
    gsap.killTweensOf([c, c.position, c.scale, c.pivot, c.skew]);
    if ('style' in c && c.style) gsap.killTweensOf(c.style);
    if (c.filters) for (const f of [c.filters].flat()) gsap.killTweensOf(f);
    for (const ch of c.children) stack.push(ch as Container);
  }
}

// Destroying a display object also kills tweens aimed at it or its transform points;
// otherwise a delayed tween would start on a destroyed object and throw in GSAP's ticker.
const origDestroy = Container.prototype.destroy;
Container.prototype.destroy = function (this: Container, options?: Parameters<Container['destroy']>[0]) {
  if (!this.destroyed) gsap.killTweensOf([this, this.position, this.scale, this.pivot, this.skew]);
  origDestroy.call(this, options);
};

// Last line of defense: a tween that throws (e.g. it starts on an object destroyed in
// the meantime) is killed quietly. Uncaught, it would throw on every tick and stall
// every animation queued after it, which is what froze the screen.
const TweenProto = gsap.core.Tween.prototype as unknown as { render: (...a: unknown[]) => unknown; kill: () => void };
const origRender = TweenProto.render;
TweenProto.render = function (this: typeof TweenProto, ...a: unknown[]) {
  try {
    return origRender.apply(this, a);
  } catch (e) {
    this.kill();
    if (import.meta.env.DEV) console.warn('tween killed after error', e, (this as unknown as { __st?: string }).__st);
    return this;
  }
};

// Route tweens and delayed calls into the current scene's context so a scene
// switch can kill them all, including callbacks scheduled from pointer handlers.
let ownTween = false;
for (const k of ['to', 'from', 'fromTo', 'set', 'delayedCall', 'timeline'] as const) {
  const orig = (gsap[k] as (...a: unknown[]) => unknown).bind(gsap);
  (gsap as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => {
    const ctx = ownTween ? null : Scenes.current?.anims;
    return ctx ? ctx.add(() => orig(...a)) : orig(...a);
  };
}

let dotTex: Texture | null = null;
function dotTexture(): Texture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(64, 64, 63, 0, Math.PI * 2);
  g.fill();
  dotTex = Texture.from(c);
  return dotTex;
}

export const Scenes = new SceneManagerImpl();

/** Shows uncaught errors on screen so a frozen device can be diagnosed from a screenshot. */
export function reportError(e: unknown): void {
  console.error(e);
  const msg = e instanceof Error ? `${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(1, 3).join('\n')}` : String(e);
  let el = document.getElementById('err');
  if (!el) {
    el = document.createElement('div');
    el.id = 'err';
    el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:9;padding:8px 10px;border-radius:10px;background:rgba(40,0,10,.85);color:#ffd0d8;font:11px/1.4 monospace;white-space:pre-wrap;pointer-events:auto';
    el.onclick = () => el?.remove();
    document.body.appendChild(el);
  }
  el.textContent = `エラー（タップで閉じる）\n${msg}`;
}
