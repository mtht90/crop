import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { App } from './App';
import { COLORS } from '../art/PieceArt';

export abstract class Scene {
  readonly view = new Container();
  /** Called after the scene is added to the stage. */
  abstract enter(): void;
  /** Per-frame update, dt in seconds. */
  update(_dt: number): void {}
  /** Re-layout after a viewport change. */
  resize(): void {}
  exit(): void {}
}

class SceneManagerImpl {
  current: Scene | null = null;
  private layer = new Container();
  private wipe = new Graphics();
  private busy = false;

  init(): void {
    App.root.addChild(this.layer);
    App.root.addChild(this.wipe);
    App.onResize(() => this.current?.resize());
    App.pixi.ticker.add((t) => {
      const dt = Math.min(t.deltaMS / 1000, 1 / 20);
      this.current?.update(dt);
    });
  }

  /** Bubble-wipe transition into a new scene. */
  go(make: () => Scene, instant = false): void {
    if (this.busy) return;
    if (instant || !this.current) {
      this.swap(make());
      return;
    }
    this.busy = true;
    const state = { p: 0 };
    const draw = () => this.drawWipe(state.p);
    gsap.to(state, {
      p: 1,
      duration: 0.42,
      ease: 'power2.in',
      onUpdate: draw,
      onComplete: () => {
        this.swap(make());
        gsap.to(state, {
          p: 0,
          duration: 0.48,
          delay: 0.05,
          ease: 'power2.out',
          onUpdate: draw,
          onComplete: () => {
            this.wipe.clear();
            this.busy = false;
          },
        });
      },
    });
  }

  private swap(next: Scene): void {
    if (this.current) {
      this.current.exit();
      this.layer.removeChild(this.current.view);
      this.current.view.destroy({ children: true });
    }
    this.current = next;
    this.layer.addChild(next.view);
    next.enter();
    next.resize();
  }

  private drawWipe(p: number): void {
    const g = this.wipe;
    g.clear();
    if (p <= 0) return;
    const step = 110;
    const cols = Math.ceil(App.W / step) + 2;
    const rows = Math.ceil(App.H / (step * 0.866)) + 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * step + (r % 2 ? step / 2 : 0) - step / 2;
        const y = r * step * 0.866 - step / 2;
        // stagger from top-left so it reads as a wave
        const d = (x / App.W) * 0.35 + (y / App.H) * 0.45;
        const local = Math.min(1, Math.max(0, (p * 1.8 - d) / 1.0));
        if (local <= 0) continue;
        const color = COLORS[(r * 3 + c) % 5].hex;
        g.circle(x, y, local * step * 0.82).fill(color);
      }
    }
  }
}

export const Scenes = new SceneManagerImpl();
