import { Container, Graphics, Sprite } from 'pixi.js';
import { pieceTexture, obstacleTexture } from '../art/PieceArt';
import type { CharDef } from '../data/characters';
import type { Board } from './Board';

/**
 * Versus: a small live copy of the opponent's bowl.
 * Snapshots are flat arrays [x, y, code, ...] with x/y scaled to 0..255 across the board and
 * code = color (0-4) for a normal piece, 10+color for a big one, 20 bomb, 21 mega bomb, 22 rock,
 * 30+color for a piece under an obstruction status.
 */
export function boardSnapshot(b: Board): number[] {
  const out: number[] = [];
  for (const p of b.live()) {
    if (!b.onBoard(p)) continue;
    const x = Math.max(0, Math.min(255, Math.round((p.x / b.w) * 255)));
    const y = Math.max(0, Math.min(255, Math.round((p.y / b.h) * 255)));
    let code = p.color;
    if (p.kind === 'big') code = 10 + p.color;
    else if (p.kind === 'bomb') code = 20;
    else if (p.kind === 'mega') code = 21;
    else if (p.kind === 'rock') code = 22;
    else if (p.status) code = 30 + p.color;
    out.push(x, y, code);
  }
  return out;
}

export class MiniBoard extends Container {
  private bowl = new Graphics();
  private glow = new Graphics();
  private layer = new Container();
  private sprites: Sprite[] = [];
  private targets: { x: number; y: number }[] = [];
  private fever = false;
  constructor(
    private def: CharDef,
    private D: number,
    /** Board height / width of the real board (the bowl is a stadium when > 1). */
    private aspect: number,
    pieceR: number,
    boardW: number,
  ) {
    super();
    const H = D * aspect;
    this.bowl.roundRect(-D / 2, 0, D, H, D / 2).fill({ color: 0x2a3a24, alpha: 0.92 }).stroke({ width: 5, color: 0xb88a3a });
    const m = new Graphics().roundRect(-D / 2, 0, D, H, D / 2).fill(0xffffff);
    this.layer.mask = m;
    this.addChild(this.glow, this.bowl, this.layer, m);
    // piece images carry padding around the head, so draw them a bit larger than the body
    this.pieceSize = ((pieceR * 2) / boardW) * D * 1.4;
  }
  private pieceSize: number;

  /** Takes a new snapshot; sprites glide toward it. */
  set(snap: number[], fever: boolean): void {
    const n = Math.floor(snap.length / 3);
    const H = this.D * this.aspect;
    while (this.sprites.length < n) {
      const s = new Sprite();
      s.anchor.set(0.5);
      this.layer.addChild(s);
      this.sprites.push(s);
      this.targets.push({ x: 0, y: 0 });
    }
    this.sprites.forEach((s, i) => {
      if (i >= n) {
        s.visible = false;
        return;
      }
      const x = (snap[i * 3] / 255 - 0.5) * this.D;
      const y = (snap[i * 3 + 1] / 255) * H;
      const code = snap[i * 3 + 2];
      const fresh = !s.visible;
      s.visible = true;
      this.targets[i] = { x, y };
      if (fresh) s.position.set(x, y);
      let scale = 1;
      s.alpha = 1;
      s.tint = 0xffffff;
      if (code >= 30) {
        s.texture = pieceTexture(this.def, code - 30);
        s.alpha = 0.55;
      } else if (code === 22) s.texture = obstacleTexture('rock');
      else if (code >= 20) {
        s.texture = obstacleTexture('bomb');
        if (code === 21) scale = 1.4;
      } else if (code >= 10) {
        s.texture = pieceTexture(this.def, code - 10);
        scale = 1.5;
      } else s.texture = pieceTexture(this.def, code);
      s.scale.set((this.pieceSize * scale) / Math.max(1, s.texture.width));
    });
    if (fever !== this.fever) {
      this.fever = fever;
      this.glow.clear();
      if (fever) this.glow.roundRect(-this.D / 2 - 8, -8, this.D + 16, H + 16, this.D / 2 + 8).fill({ color: 0xff4fd8, alpha: 0.6 });
    }
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 10);
    this.sprites.forEach((s, i) => {
      if (!s.visible) return;
      s.x += (this.targets[i].x - s.x) * k;
      s.y += (this.targets[i].y - s.y) * k;
    });
  }
}
