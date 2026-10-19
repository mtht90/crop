import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { ShockwaveFilter } from 'pixi-filters';
import { ART_CX, ART_CY, ART_R, ART_SIZE, COLORS, PIECE_ART_SCALE, PIECE_CELL, bombTexture, pieceTexture, rockTexture } from '../art/PieceArt';
import type { CharDef } from '../data/characters';
import { Effects } from './Effects';
import { World, type PBody } from './Physics';
import { Sound, haptic } from '../core/Audio';
import { txt } from '../core/UI';

export type PieceKind = 'normal' | 'big' | 'bomb' | 'mega' | 'rock';
type PieceState = 'live' | 'linked' | 'popping' | 'dead';

/** Tunables for the feel of the board. */
export const BOARD_TUNING = {
  radius: 47,
  bigScale: 1.55,
  /** Two pieces are "touching" if their centers are within (ra+rb)*adjacency. */
  adjacency: 1.3,
  /** How close the finger must be to a piece center (in radii) to grab it. */
  grab: 1.0,
  /** Extra reach (in radii) when the candidate is adjacent to the chain tail. */
  magnet: 1.22,
  fill: 0.76,
  minChain: 3,
  bombAt: 7,
  megaAt: 12,
  bigChance: 0.045,
  gravity: 2600,
};

export interface PopInfo {
  x: number;
  y: number;
  color: number;
  kind: PieceKind;
  /** Damage weight: big pieces are worth more. */
  weight: number;
}

export type PopCause = 'chain' | 'bomb' | 'fever' | 'skill' | 'rock';

export interface BoardEvents {
  /** Fired once per resolved action with every piece it popped (pieces pop over time after this). */
  onResolve(pops: PopInfo[], cause: PopCause, meta: { chain: number; color: number; x: number; y: number }): number;
  /** Fired for every single piece as it visibly pops. `token` is what onResolve returned. */
  onPiecePop(p: PopInfo, index: number, cause: PopCause, token: number): void;
  onChainChange?(len: number, effective: number, color: number): void;
  /** Called when a chain is released short. */
  onCancel?(): void;
  onInteract?(): void;
}

let nextId = 1;

export class Piece {
  readonly id = nextId++;
  /** Positioned at the body center. */
  readonly view = new Container();
  /** Rotated to the deformation axis and scaled along it (directional jelly squash). */
  readonly jelly = new Container();
  readonly sprite = new Sprite();
  state: PieceState = 'live';
  /** Deformation along `axis`: <0 compressed, >0 stretched. */
  squash = 0;
  squashV = 0;
  axis = Math.PI / 2;
  /** Secondary wobble so the piece keeps jiggling after a hit. */
  wobble = 0;
  wobbleV = 0;
  /** Tsum-like tumble: tilts while rolling, springs back upright. */
  rot = 0;
  rotV = 0;
  hint = false;
  pulse = Math.random() * 10;
  /** Extra scale driven by link state. */
  linkScale = 1;
  baseScale = 1;
  appear = 0;
  constructor(
    public kind: PieceKind,
    public color: number,
    public body: PBody,
    public r: number,
  ) {
    this.view.addChild(this.jelly);
    this.jelly.addChild(this.sprite);
  }
  /** Pushes the jelly: dir = direction the force comes from (radians), amount in "squash units". */
  poke(amount: number, dir = Math.PI / 2): void {
    this.axis = dir;
    this.squashV -= amount;
    this.wobbleV += amount * 0.6 * (Math.random() < 0.5 ? -1 : 1);
  }
  get x(): number {
    return this.body.position.x;
  }
  get y(): number {
    return this.body.position.y;
  }
  get linkable(): boolean {
    return (this.kind === 'normal' || this.kind === 'big') && this.state === 'live';
  }
  get weight(): number {
    return this.kind === 'big' ? 3 : 1;
  }
}

export class Board {
  readonly view = new Container();
  readonly pieceLayer = new Container();
  readonly lineLayer = new Graphics();
  readonly fx = new Effects();
  readonly overFx = new Effects();
  readonly badge = new Container();
  private badgeText = txt('0', { size: 34, font: 'dela', stroke: 0x2a1630, strokeWidth: 7 });
  private badgeBg = new Graphics();
  private badgeColor = -1;
  readonly world: World;
  pieces: Piece[] = [];
  chain: Piece[] = [];
  private pointer: { x: number; y: number } | null = null;
  private acc = 0;
  private spawnTimer = 0;
  private lanes: number[] = [];
  /** When false, input is ignored (countdown, time up, cut-ins). */
  inputEnabled = false;
  fever = false;
  frozen = false;
  private shock: ShockwaveFilter | null = null;
  private maskG = new Graphics();
  readonly r: number;

  constructor(
    public def: CharDef,
    public readonly w: number,
    public readonly h: number,
    private ev: BoardEvents,
  ) {
    this.r = BOARD_TUNING.radius;
    this.world = new World({ gravity: BOARD_TUNING.gravity, left: 0, right: w, bottom: h, iterations: 6, drag: 0.35, friction: 0.12 });
    this.maskG.roundRect(-6, -10, w + 12, h + 16, 30).fill(0xffffff);
    this.view.addChild(this.maskG);
    this.pieceLayer.mask = this.maskG;
    this.view.addChild(this.fx.view, this.pieceLayer, this.lineLayer, this.overFx.view, this.badge);
    this.badge.addChild(this.badgeBg, this.badgeText);
    this.badge.visible = false;
    const lanes = Math.floor(w / (this.r * 2));
    this.lanes = new Array(lanes).fill(0);
  }

  // --------------------------------------------------------------- pieces
  private targetUnits(): number {
    const area = this.w * this.h;
    return Math.floor((BOARD_TUNING.fill * area) / (Math.PI * this.r * this.r));
  }

  private units(): number {
    let u = 0;
    for (const p of this.pieces) if (p.state !== 'dead') u += p.kind === 'big' ? BOARD_TUNING.bigScale ** 2 * 0.85 : 1;
    return u;
  }

  private pickColor(): number {
    if (Math.random() < 0.7) return Math.floor(Math.random() * 5);
    const counts = [0, 0, 0, 0, 0];
    for (const p of this.pieces) if (p.color >= 0 && p.state !== 'dead') counts[p.color]++;
    const weights = counts.map((c) => 1 / (c + 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < 5; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  textureFor(p: Piece): Texture {
    if (p.kind === 'rock') return rockTexture();
    if (p.kind === 'bomb' || p.kind === 'mega') return bombTexture(p.kind === 'mega');
    return pieceTexture(this.def, p.color);
  }

  /** Sets texture, anchor and base scale for the piece's kind. */
  private dress(p: Piece): void {
    p.sprite.texture = this.textureFor(p);
    if (p.kind === 'normal' || p.kind === 'big') {
      p.sprite.anchor.set(0.5, 0.52);
      p.baseScale = (p.r * 2 * PIECE_ART_SCALE) / PIECE_CELL;
    } else {
      p.sprite.anchor.set(ART_CX / ART_SIZE, ART_CY / ART_SIZE);
      p.baseScale = p.r / ART_R;
    }
  }

  addPiece(kind: PieceKind, color: number, x: number, y: number, vy = 0): Piece {
    const base = kind === 'big' ? this.r * BOARD_TUNING.bigScale : kind === 'mega' ? this.r * 1.2 : this.r;
    // a little size variance keeps the pile from settling into a grid
    const r = base * (0.96 + Math.random() * 0.08);
    const body = this.world.add(x, y, r * 0.97, kind === 'big' ? 3 : 1);
    body.velocity.x = (Math.random() - 0.5) * 36;
    body.velocity.y = vy;
    const p = new Piece(kind, color, body, r);
    p.rot = (Math.random() - 0.5) * 0.6;
    this.dress(p);
    this.pieceLayer.addChild(p.view);
    this.pieces.push(p);
    this.syncView(p, 0);
    return p;
  }

  /** Fills the board from above. Used at start. */
  fillInitial(): void {
    const n = this.targetUnits();
    const cols = this.lanes.length;
    for (let i = 0; i < n; i++) {
      // scattered drop: random x, loosely stacked heights, so the pile settles organically
      const x = this.r + Math.random() * (this.w - this.r * 2);
      const y = -this.r - (i / cols) * this.r * 2.2 - Math.random() * this.r * 1.5;
      this.addPiece('normal', this.pickColor(), x, y, 300 + Math.random() * 200);
    }
  }

  private spawnStep(dt: number): void {
    // decay lane cursors as pieces fall away
    for (let i = 0; i < this.lanes.length; i++) this.lanes[i] = Math.max(0, this.lanes[i] - dt * 9);
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const missing = this.targetUnits() - this.units();
    if (missing < 0.9) return;
    // spawn a few at once in the emptiest lanes
    const batch = Math.min(this.lanes.length, Math.ceil(missing));
    for (let k = 0; k < batch && this.targetUnits() - this.units() >= 0.9; k++) {
      let lane = 0;
      for (let i = 1; i < this.lanes.length; i++) if (this.lanes[i] < this.lanes[lane]) lane = i;
      // prefer lanes over the lowest stacks so the refill is even
      const laneW = this.w / this.lanes.length;
      const x = laneW * (lane + 0.5) + (Math.random() - 0.5) * laneW * 1.1;
      const y = -this.r * 1.2 - this.lanes[lane] * this.r * 2.1;
      this.lanes[lane] += 1;
      const big = Math.random() < BOARD_TUNING.bigChance * (this.fever ? 2.5 : 1);
      this.addPiece(big ? 'big' : 'normal', this.pickColor(), Math.max(this.r, Math.min(this.w - this.r, x)), y, 540);
    }
    this.spawnTimer = 0.03;
  }

  private kill(p: Piece): void {
    if (p.state === 'dead') return;
    p.state = 'dead';
    this.world.remove(p.body);
    this.pieces = this.pieces.filter((q) => q !== p);
  }

  // --------------------------------------------------------------- update
  update(dt: number): void {
    if (!this.frozen) {
      this.acc += dt;
      const step = 1 / 120;
      let n = 0;
      while (this.acc >= step && n < 4) {
        this.world.step(step);
        this.acc -= step;
        n++;
      }
      if (n === 4) this.acc = 0;
      this.spawnStep(dt);
    }
    for (const p of this.pieces) this.syncView(p, dt);
    this.drawChain();
    this.fx.update(dt);
    this.overFx.update(dt);
    if (this.shock) {
      this.shock.time += dt * 1.6;
      if (this.shock.time > 1.2) {
        this.view.filters = [];
        this.shock = null;
      }
    }
  }

  private syncView(p: Piece, dt: number): void {
    const b = p.body;
    // jelly: every contact pushes the piece in along the contact normal
    if (b.impact > 90 && dt > 0) {
      const k = Math.min(b.impact / 900, 1.2);
      if (k * 9 > Math.abs(p.squashV) * 0.6) {
        p.axis = Math.atan2(b.ny, b.nx);
        p.squashV -= k * 9;
        p.wobbleV += k * 5 * (b.nx >= 0 ? 1 : -1);
      }
    }
    // springs (soft, under-damped = puni-puni)
    p.squashV += (-300 * p.squash - 9 * p.squashV) * dt;
    p.squash = Math.max(-0.32, Math.min(0.3, p.squash + p.squashV * dt));
    p.wobbleV += (-420 * p.wobble - 7 * p.wobbleV) * dt;
    p.wobble = Math.max(-0.12, Math.min(0.12, p.wobble + p.wobbleV * dt));
    // tumble: rolling spins the piece, a soft spring stands it back up
    p.rotV += (b.velocity.x / p.r) * dt * 0.9;
    p.rotV += (-p.rot * 14 - p.rotV * 4.5) * dt;
    p.rot = Math.max(-0.55, Math.min(0.55, p.rot + p.rotV * dt));
    p.pulse += dt;
    const targetLink = p.state === 'linked' ? 1.14 : p.hint ? 1.05 + Math.sin(p.pulse * 8) * 0.05 : 1;
    p.linkScale += (targetLink - p.linkScale) * Math.min(1, dt * 18);
    p.appear = Math.min(1, p.appear + dt * 6);
    let along = 1 + p.squash;
    let across = 1 - p.squash * 0.75;
    if (p.state === 'linked') {
      const w = Math.sin(p.pulse * 18) * 0.04;
      along += w;
      across -= w;
    } else if (p.kind === 'bomb' || p.kind === 'mega') {
      const w = Math.sin(p.pulse * 10) * 0.04;
      along += w;
      across += w;
    } else {
      // idle breathing keeps the board alive
      const w = Math.sin(p.pulse * 2.4 + p.id) * 0.015;
      along += w;
      across -= w;
    }
    const s = p.baseScale * p.linkScale;
    p.jelly.rotation = p.axis;
    p.jelly.scale.set(s * along, s * across * (1 + p.wobble));
    p.sprite.rotation = -p.axis + p.rot;
    // when squashed against the floor the piece sinks a little instead of floating
    p.view.position.set(b.position.x, b.position.y - Math.sin(p.axis) * p.squash * p.r * 0.35);
  }

  // ---------------------------------------------------------------- input
  private pieceAt(x: number, y: number, reach: number, filter?: (p: Piece) => boolean): Piece | null {
    let best: Piece | null = null;
    let bd = Infinity;
    for (const p of this.pieces) {
      if (p.state === 'dead' || p.state === 'popping') continue;
      if (filter && !filter(p)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= p.r * reach && d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  adjacent(a: Piece, b: Piece, slack = BOARD_TUNING.adjacency): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) <= (a.r + b.r) * slack;
  }

  pointerDown(x: number, y: number): void {
    if (!this.inputEnabled) return;
    this.ev.onInteract?.();
    this.clearHint();
    const p = this.pieceAt(x, y, BOARD_TUNING.grab * 1.05);
    if (!p) return;
    if (p.kind === 'bomb' || p.kind === 'mega') {
      this.explode(p);
      return;
    }
    if (p.kind === 'rock') {
      Sound.play('rock', { vol: 0.5, rate: 1.3 });
      p.poke(7);
      gsap.fromTo(p.view, { x: p.view.x - 6 }, { x: p.view.x, duration: 0.25, ease: 'elastic.out(1.5,0.3)' });
      return;
    }
    if (this.fever) {
      this.popGroup(p);
      return;
    }
    this.chain = [p];
    this.link(p);
    this.pointer = { x, y };
  }

  pointerMove(x: number, y: number): void {
    if (!this.pointer || this.chain.length === 0) return;
    const from = this.pointer;
    const dist = Math.hypot(x - from.x, y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (this.r * 0.3)));
    for (let i = 1; i <= steps; i++) {
      const sx = from.x + ((x - from.x) * i) / steps;
      const sy = from.y + ((y - from.y) * i) / steps;
      this.probe(sx, sy);
    }
    this.pointer = { x, y };
  }

  private probe(x: number, y: number): void {
    const chain = this.chain;
    const last = chain[chain.length - 1];
    // backtrack onto the previous piece
    if (chain.length >= 2) {
      const prev = chain[chain.length - 2];
      if (Math.hypot(prev.x - x, prev.y - y) <= prev.r * 0.78) {
        chain.pop();
        this.unlink(last);
        return;
      }
    }
    const color = chain[0].color;
    const cand =
      this.pieceAt(x, y, BOARD_TUNING.grab * 0.92, (p) => p.linkable && p.color === color) ??
      this.pieceAt(x, y, BOARD_TUNING.magnet, (p) => p.linkable && p.color === color && this.adjacent(p, last));
    if (!cand || cand === last) return;
    if (!this.adjacent(cand, last)) return;
    chain.push(cand);
    this.link(cand);
  }

  pointerUp(): void {
    if (this.chain.length === 0) return;
    const chain = this.chain;
    this.chain = [];
    this.pointer = null;
    this.badge.visible = false;
    const eff = chain.reduce((a, p) => a + p.weight, 0);
    if (chain.length >= BOARD_TUNING.minChain || (eff >= BOARD_TUNING.minChain && chain.length >= 2)) {
      this.resolveChain(chain);
    } else {
      for (const p of chain) this.unlink(p, true);
      Sound.play('soft', { vol: 0.35, rate: 1.4 });
      this.ev.onCancel?.();
      this.ev.onChainChange?.(0, 0, -1);
    }
  }

  /** Releases the current chain (e.g. at time up). */
  forceRelease(): void {
    this.pointerUp();
  }

  private link(p: Piece): void {
    p.state = 'linked';
    p.poke(-6);
    const i = this.chain.length - 1;
    Sound.link(i, (p.x / this.w - 0.5) * 0.6);
    haptic(5);
    this.overFx.burst(p.x, p.y, { count: 5, speed: [80, 200], size: [0.05, 0.09], tex: 'star_06', tint: 0xffffff, add: true, gravity: 0, life: [0.25, 0.4] });
    this.overFx.ring(p.x, p.y, COLORS[p.color].glow, p.r / 120, 0.3);
    const eff = this.chain.reduce((a, q) => a + q.weight, 0);
    this.ev.onChainChange?.(this.chain.length, eff, p.color);
    if (eff >= BOARD_TUNING.bombAt && eff - p.weight < BOARD_TUNING.bombAt) Sound.play('pep', { vol: 0.6, rate: 1.2 });
    if (eff >= BOARD_TUNING.megaAt && eff - p.weight < BOARD_TUNING.megaAt) Sound.play('pep', { vol: 0.7, rate: 1.5 });
  }

  private unlink(p: Piece, quiet = false): void {
    if (p.state === 'linked') p.state = 'live';
    p.poke(4);
    if (!quiet) {
      Sound.unlink();
      const eff = this.chain.reduce((a, q) => a + q.weight, 0);
      this.ev.onChainChange?.(this.chain.length, eff, this.chain[0]?.color ?? -1);
    }
  }

  // ------------------------------------------------------------ resolving
  private info(p: Piece): PopInfo {
    return { x: p.x, y: p.y, color: p.color, kind: p.kind, weight: p.weight };
  }

  private resolveChain(chain: Piece[]): void {
    const eff = chain.reduce((a, p) => a + p.weight, 0);
    const last = chain[chain.length - 1];
    const lx = last.x;
    const ly = last.y;
    const color = chain[0].color;
    const infos = chain.map((p) => this.info(p));
    const rocks = this.rocksNear(chain);
    const tok = this.ev.onResolve(infos, 'chain', { chain: eff, color, x: lx, y: ly });
    const stagger = Math.max(0.018, Math.min(0.05, 0.3 / chain.length));
    chain.forEach((p, i) => this.popPiece(p, i * stagger, i, 'chain', tok));
    const end = chain.length * stagger;
    if (rocks.length) {
      gsap.delayedCall(end, () => {
        const rt = this.ev.onResolve(rocks.map((r) => this.info(r)), 'rock', { chain: 0, color: -1, x: lx, y: ly });
        rocks.forEach((r, i) => this.popPiece(r, i * 0.04, i, 'rock', rt));
      });
    }
    if (eff >= BOARD_TUNING.bombAt) {
      const mega = eff >= BOARD_TUNING.megaAt;
      gsap.delayedCall(end + 0.05, () => this.spawnBomb(lx, ly, mega));
    }
  }

  spawnBomb(x: number, y: number, mega: boolean): Piece {
    const b = this.addPiece(mega ? 'mega' : 'bomb', -1, x, y, 0);
    b.view.scale.set(0.2);
    gsap.to(b.view.scale, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1.2,0.4)' });
    this.overFx.ring(x, y, 0xfff2a0, 1.2, 0.45);
    this.overFx.burst(x, y, { count: 14, tex: 'star_06', tint: [0xffffff, 0xffe680], add: true, gravity: 0, speed: [120, 380], size: [0.06, 0.14] });
    Sound.play('powerUp2', { vol: 0.6, rate: mega ? 0.9 : 1.15 });
    Sound.sparkle();
    return b;
  }

  private rocksNear(popped: Piece[]): Piece[] {
    const out: Piece[] = [];
    for (const r of this.pieces) {
      if (r.kind !== 'rock' || r.state !== 'live') continue;
      if (popped.some((p) => this.adjacent(p, r, 1.25))) out.push(r);
    }
    for (const r of out) r.state = 'popping';
    return out;
  }

  /** Visually pops a piece after `delay` and removes it from the world. */
  popPiece(p: Piece, delay: number, index: number, cause: PopCause, token: number): void {
    p.state = 'popping';
    const run = () => {
      const info = this.info(p);
      this.kill(p);
      const big = p.kind === 'big';
      const tint = p.color >= 0 ? COLORS[p.color].hex : p.kind === 'rock' ? 0x9aa0b8 : 0x555a70;
      const glow = p.color >= 0 ? COLORS[p.color].glow : 0xffffff;
      // squish-then-burst
      gsap.killTweensOf(p.view.scale);
      gsap.to(p.view.scale, { x: 1.35, y: 1.35, duration: 0.08, ease: 'power2.out' });
      gsap.to(p.view, {
        alpha: 0,
        duration: 0.12,
        delay: 0.05,
        onComplete: () => {
          p.view.destroy({ children: true });
        },
      });
      const size = p.r / 47;
      this.fx.burst(info.x, info.y, { count: big ? 16 : 9, speed: [160, 460 * size], size: [0.07 * size, 0.15 * size], tint: [tint, glow, 0xffffff], gravity: 900, life: [0.35, 0.65] });
      this.overFx.burst(info.x, info.y, { count: big ? 8 : 4, tex: 'star_06', speed: [60, 260], size: [0.08, 0.16], tint: 0xffffff, add: true, gravity: 0, life: [0.25, 0.45] });
      this.overFx.ring(info.x, info.y, glow, size * 0.55, 0.32);
      if (p.kind === 'rock') {
        Sound.play('rock', { vol: 0.55, rate: 0.9 + Math.random() * 0.3 });
        this.fx.burst(info.x, info.y, { count: 10, tex: 'smoke_04', tint: 0xb0b4c8, speed: [40, 160], size: [0.12, 0.25], grow: 1.6, gravity: -50, life: [0.4, 0.8] });
      } else if (cause !== 'bomb' || index % 2 === 0) {
        Sound.pop(index, big ? 1.8 : 1, (info.x / this.w - 0.5) * 0.7);
      }
      if (index % 3 === 0) haptic(4);
      this.ev.onPiecePop(info, index, cause, token);
    };
    if (delay <= 0) run();
    else gsap.delayedCall(delay, run);
  }

  /** Fever tap: pops the whole connected group under the finger, even singles. */
  private popGroup(start: Piece): void {
    const group = this.groupOf(start);
    for (const p of group) p.state = 'popping';
    const eff = group.reduce((a, p) => a + p.weight, 0);
    const rocks = this.rocksNear(group);
    const tok = this.ev.onResolve(group.map((p) => this.info(p)), 'fever', { chain: eff, color: start.color, x: start.x, y: start.y });
    group.forEach((p, i) => this.popPiece(p, i * 0.025, i, 'fever', tok));
    if (rocks.length) {
      const rt = this.ev.onResolve(rocks.map((r) => this.info(r)), 'rock', { chain: 0, color: -1, x: start.x, y: start.y });
      rocks.forEach((r, i) => this.popPiece(r, 0.1 + i * 0.04, i, 'rock', rt));
    }
  }

  groupOf(start: Piece): Piece[] {
    const seen = new Set<Piece>([start]);
    const q = [start];
    while (q.length) {
      const cur = q.shift()!;
      for (const p of this.pieces) {
        if (seen.has(p) || !p.linkable || p.color !== start.color) continue;
        if (this.adjacent(cur, p)) {
          seen.add(p);
          q.push(p);
        }
      }
    }
    return [...seen];
  }

  /** Largest connected same-color group (used for hints). */
  bestGroup(): Piece[] {
    const done = new Set<Piece>();
    let best: Piece[] = [];
    for (const p of this.pieces) {
      if (done.has(p) || !p.linkable) continue;
      const g = this.groupOf(p);
      g.forEach((q) => done.add(q));
      const w = g.reduce((a, q) => a + q.weight, 0);
      if (w > best.reduce((a, q) => a + q.weight, 0)) best = g;
    }
    return best;
  }

  showHint(): void {
    const g = this.bestGroup();
    if (g.reduce((a, q) => a + q.weight, 0) < BOARD_TUNING.minChain) return;
    for (const p of g) p.hint = true;
  }

  clearHint(): void {
    for (const p of this.pieces) p.hint = false;
  }

  explode(b: Piece): void {
    if (b.state !== 'live') return;
    b.state = 'popping';
    const mega = b.kind === 'mega';
    const radius = this.r * (mega ? 5.6 : 3.9);
    const cx = b.x;
    const cy = b.y;
    const victims = this.pieces
      .filter((p) => p !== b && (p.state === 'live' || p.state === 'linked') && Math.hypot(p.x - cx, p.y - cy) <= radius + p.r * 0.5)
      .sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy));
    const chained = victims.filter((p) => p.kind === 'bomb' || p.kind === 'mega');
    const popped = victims.filter((p) => !(p.kind === 'bomb' || p.kind === 'mega'));
    for (const p of popped) p.state = 'popping';
    const tok = this.ev.onResolve(popped.map((p) => this.info(p)), 'bomb', { chain: popped.length, color: -1, x: cx, y: cy });
    this.kill(b);
    gsap.to(b.view.scale, { x: 1.8, y: 1.8, duration: 0.1 });
    gsap.to(b.view, { alpha: 0, duration: 0.12, onComplete: () => b.view.destroy({ children: true }) });
    Sound.explosion(mega);
    Sound.play('hitHeavy', { vol: 0.6, rate: 0.8 });
    haptic(mega ? [30, 30, 40] : 30);
    this.overFx.burst(cx, cy, { count: 1, tex: 'light_01', size: [0.4, 0.4], grow: mega ? 7 : 5, speed: [0, 0], gravity: 0, add: true, tint: 0xfff0b0, life: [0.4, 0.4] });
    this.overFx.burst(cx, cy, { count: mega ? 30 : 20, tex: 'flame_04', tint: [0xff8a1f, 0xffd23f, 0xff4d6a], speed: [200, 700], size: [0.15, 0.32], grow: 1.5, add: true, gravity: -100, life: [0.3, 0.6] });
    this.fx.burst(cx, cy, { count: 16, tex: 'smoke_04', tint: 0x6a5a7a, speed: [80, 320], size: [0.2, 0.4], grow: 1.8, gravity: -40, life: [0.5, 0.9], alpha: 0.7 });
    this.shockwave(cx, cy, radius);
    // push surrounding pieces outward for a physical kick
    for (const p of this.pieces) {
      if (p.state === 'dead') continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < radius * 1.8) {
        p.body.velocity.x += (dx / d) * 540;
        p.body.velocity.y += (dy / d) * 540 - 240;
      }
    }
    popped.forEach((p) => {
      const d = Math.hypot(p.x - cx, p.y - cy);
      this.popPiece(p, (d / radius) * 0.18, Math.floor(d / this.r), 'bomb', tok);
    });
    chained.forEach((p, i) => gsap.delayedCall(0.12 + i * 0.1, () => this.explode(p)));
  }

  shockwave(x: number, y: number, radius: number): void {
    this.shock = new ShockwaveFilter({ center: { x, y }, amplitude: 22, wavelength: 140, speed: 900, brightness: 1.15, radius: radius * 2.2, time: 0 });
    this.view.filters = [this.shock];
  }

  // ------------------------------------------------- helpers for skills etc
  live(): Piece[] {
    return this.pieces.filter((p) => p.state === 'live');
  }

  colorCounts(): number[] {
    const c = [0, 0, 0, 0, 0];
    for (const p of this.live()) if (p.color >= 0) c[p.color] += p.weight;
    return c;
  }

  /** Pops pieces matching a predicate with a wave from (ox,oy). */
  popWhere(pred: (p: Piece) => boolean, ox: number, oy: number, cause: PopCause = 'skill'): PopInfo[] {
    const victims = this.live()
      .filter((p) => p.kind !== 'bomb' && p.kind !== 'mega' && pred(p))
      .sort((p, q) => Math.hypot(p.x - ox, p.y - oy) - Math.hypot(q.x - ox, q.y - oy));
    for (const p of victims) p.state = 'popping';
    const infos = victims.map((p) => this.info(p));
    const tok = this.ev.onResolve(infos, cause, { chain: victims.length, color: -1, x: ox, y: oy });
    victims.forEach((p, i) => this.popPiece(p, i * Math.min(0.03, 0.6 / Math.max(1, victims.length)), i, cause, tok));
    return infos;
  }

  recolor(list: Piece[], color: number): void {
    list.forEach((p, i) => {
      gsap.delayedCall(i * 0.05, () => {
        if (p.state === 'dead') return;
        p.color = color;
        this.dress(p);
        p.poke(-7);
        this.overFx.ring(p.x, p.y, COLORS[color].glow, 0.6, 0.35);
        this.overFx.burst(p.x, p.y, { count: 6, tex: 'star_06', tint: 0xffffff, add: true, gravity: 0, speed: [60, 200], size: [0.06, 0.12] });
        Sound.link(i);
      });
    });
  }

  makeBig(list: Piece[]): void {
    list.forEach((p, i) => {
      gsap.delayedCall(i * 0.08, () => {
        if (p.state !== 'live') return;
        const { x, y } = p;
        const color = p.color;
        this.kill(p);
        p.view.destroy({ children: true });
        const b = this.addPiece('big', color, x, y - 10, 0);
        b.view.scale.set(0.5);
        gsap.to(b.view.scale, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1.2,0.4)' });
        this.overFx.ring(x, y, COLORS[color].glow, 1, 0.4);
        Sound.play('powerUp2', { vol: 0.4, rate: 1 + i * 0.08 });
      });
    });
  }

  /** Turns random pieces into rocks (boss attack). Returns the targets. */
  petrify(n: number): Piece[] {
    const cands = this.live().filter((p) => p.kind === 'normal');
    const out: Piece[] = [];
    while (out.length < n && cands.length) out.push(cands.splice(Math.floor(Math.random() * cands.length), 1)[0]);
    for (const p of out) p.state = 'popping'; // reserved until the projectile lands
    return out;
  }

  applyRock(p: Piece): void {
    if (p.state === 'dead') return;
    p.state = 'live';
    p.kind = 'rock';
    p.color = -1;
    this.dress(p);
    p.poke(9);
    this.fx.burst(p.x, p.y, { count: 10, tex: 'smoke_04', tint: 0x9aa0b8, speed: [40, 180], size: [0.12, 0.25], grow: 1.6, gravity: -60, life: [0.4, 0.8] });
    Sound.play('rock', { vol: 0.6 });
  }

  /** Badge that follows the finger showing the chain length. */
  updateBadge(): void {
    const n = this.chain.length;
    if (n === 0) {
      this.badge.visible = false;
      this.badgeColor = -1;
      return;
    }
    const eff = this.chain.reduce((a, p) => a + p.weight, 0);
    const last = this.chain[n - 1];
    this.badge.visible = true;
    this.badge.position.set(Math.max(40, Math.min(this.w - 40, last.x)), last.y - last.r - 34);
    const ready = eff >= BOARD_TUNING.bombAt;
    if (this.badgeText.text !== String(eff)) {
      this.badgeText.text = String(eff);
      this.badge.scale.set(1.35);
      gsap.to(this.badge.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    }
    const col = eff >= BOARD_TUNING.megaAt ? 0xff4d6a : ready ? 0xffc71f : COLORS[this.chain[0].color].hex;
    if (col === this.badgeColor) return;
    this.badgeColor = col;
    const g = this.badgeBg;
    g.clear();
    g.circle(0, 0, 32).fill(0x2a1630);
    g.circle(0, -2, 29).fill(col);
    g.circle(0, -2, 29).stroke({ width: 4, color: 0xffffff });
  }

  private drawChain(): void {
    const g = this.lineLayer;
    g.clear();
    this.updateBadge();
    const chain = this.chain;
    if (chain.length === 0) return;
    const c = COLORS[chain[0].color];
    const pts = chain.map((p) => ({ x: p.x, y: p.y }));
    if (this.pointer) {
      const last = pts[pts.length - 1];
      const d = Math.hypot(this.pointer.x - last.x, this.pointer.y - last.y);
      if (d > this.r * 0.5) {
        const k = Math.min(1, (this.r * 1.6) / d);
        pts.push({ x: last.x + (this.pointer.x - last.x) * k, y: last.y + (this.pointer.y - last.y) * k });
      }
    }
    const path = () => {
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    };
    if (pts.length > 1) {
      path();
      g.stroke({ width: 34, color: c.glow, alpha: 0.35, cap: 'round', join: 'round' });
      path();
      g.stroke({ width: 20, color: 0x2a1630, alpha: 0.9, cap: 'round', join: 'round' });
      path();
      g.stroke({ width: 14, color: c.hex, cap: 'round', join: 'round' });
      path();
      g.stroke({ width: 5, color: 0xffffff, alpha: 0.9, cap: 'round', join: 'round' });
    }
    for (const p of chain) {
      g.circle(p.x, p.y, 11).fill(0x2a1630);
      g.circle(p.x, p.y, 8).fill(0xffffff);
    }
  }

  destroy(): void {
    this.world.clear();
  }
}
