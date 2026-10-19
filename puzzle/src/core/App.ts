import { Application, Container } from 'pixi.js';

/** Logical design resolution. The visible area always contains at least this much. */
export const BASE_W = 720;
export const BASE_H = 1280;

class AppCore {
  pixi!: Application;
  /** Everything is drawn in design units under this container. */
  readonly root = new Container();
  /** Current visible size in design units (>= BASE_W x BASE_H). */
  W = BASE_W;
  H = BASE_H;
  scale = 1;
  safeTop = 0;
  safeBottom = 0;
  private resizeHandlers = new Set<() => void>();

  async init(): Promise<void> {
    this.pixi = new Application();
    await this.pixi.init({
      resizeTo: window,
      antialias: true,
      backgroundColor: 0x2b1d4f,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    document.body.appendChild(this.pixi.canvas);
    this.pixi.stage.addChild(this.root);
    this.pixi.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layout());
    window.visualViewport?.addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** Horizontal offset of the centered BASE_W-wide content column. */
  get colX(): number {
    return (this.W - BASE_W) / 2;
  }

  layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.scale = Math.min(w / BASE_W, h / BASE_H);
    this.W = w / this.scale;
    this.H = h / this.scale;
    this.root.scale.set(this.scale);
    const safe = document.getElementById('safe')?.getBoundingClientRect();
    this.safeTop = safe ? safe.top / this.scale : 0;
    this.safeBottom = safe ? (h - safe.bottom) / this.scale : 0;
    for (const fn of this.resizeHandlers) fn();
  }

  onResize(fn: () => void): () => void {
    this.resizeHandlers.add(fn);
    return () => this.resizeHandlers.delete(fn);
  }

  /** Converts a DOM client position to design units. */
  toDesign(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.pixi.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.scale, y: (clientY - r.top) / this.scale };
  }
}

export const App = new AppCore();
