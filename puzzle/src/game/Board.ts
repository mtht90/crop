import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { ShockwaveFilter } from 'pixi-filters';
import { ColorMatrixFilter } from 'pixi.js';
import { ART_CX, ART_CY, ART_R, ART_SIZE, COLORS, PIECE_ART_SCALE, PIECE_CELL, bombTexture, obstacleTexture, OBSTACLE_CELL, pieceTexture, statusTexture, type ObstacleArt, type StatusArt } from '../art/PieceArt';
import { fx as fxTex } from './Effects';
import type { CharDef } from '../data/characters';
import type { LineStyle } from '../data/cosmetics';
import { Effects } from './Effects';
import { World, type PBody } from './Physics';
import { Sound, haptic } from '../core/Audio';
import { txt } from '../core/UI';

export type PieceKind = 'normal' | 'big' | 'bomb' | 'mega' | 'rock';
type PieceState = 'live' | 'linked' | 'popping' | 'dead';
/** Boss obstructions stuck on a piece. */
export type PieceStatus = 'ice' | 'bubble' | 'web' | 'slime' | 'curse' | 'skullBomb' | 'chameleon';
/** Statuses that block linking until a neighbor pops. */
const BLOCKING: PieceStatus[] = ['ice', 'web', 'skullBomb'];
/** Statuses that a neighboring pop clears. */
const BREAKABLE: PieceStatus[] = ['ice', 'web', 'skullBomb', 'bubble'];

/** Tunables for the feel of the board. */
export const BOARD_TUNING = {
  radius: 46,
  bigScale: 1.55,
  /** Extra adjacency slack when either piece is big. */
  bigReach: 0.25,
  /** Extra adjacency slack during fever (links reach further). */
  feverReach: 0.5,
  /** Two pieces are "touching" if their centers are within (ra+rb)*adjacency. */
  adjacency: 1.65,
  /** How close the finger must be to a piece center (in radii) to grab it. */
  grab: 1.0,
  /** Extra reach (in radii) when the candidate is adjacent to the chain tail. */
  magnet: 1.34,
  /** Touch circle radius (in piece radii) swept by the finger. */
  touch: 1.27,
  /** End-of-move directional assist reach (in radii). */
  assist: 1.4,
  fill: 0.65,
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
  cursed?: boolean;
}

export type PopCause = 'chain' | 'bomb' | 'fever' | 'skill' | 'rock';

export interface BoardEvents {
  /** Fired once per resolved action with every piece it popped (pieces pop over time after this). */
  /** `tap` marks a pop from a tap skill (weaker per tap than a traced chain). */
  onResolve(pops: PopInfo[], cause: PopCause, meta: { chain: number; color: number; x: number; y: number; tap?: boolean }): number;
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
  /** Tsum-like tumble: tilts while rolling, springs back to its own resting tilt. */
  rot = 0;
  /** Each piece rests at its own angle (and some face the other way) so the pile looks natural. */
  tilt = (Math.random() - 0.5) * 1.5;
  mirror = Math.random() < 0.5;
  rotV = 0;
  hint = false;
  status: PieceStatus | null = null;
  /** Seconds on the status clock (bomb fuse, chameleon flips, slime lifetime). */
  statusT = 0;
  deco: Container | null = null;
  /** Hits a rock still takes. */
  hp = 1;
  /** Which obstacle sprite a rock uses. */
  art: ObstacleArt = 'rock';
  /** Seconds left of being see-through. */
  ghost = 0;
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
    return (this.kind === 'normal' || this.kind === 'big') && this.state === 'live' && !(this.status && BLOCKING.includes(this.status));
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
  /** Skill mode: tapping pops the whole same-color group under the finger. */
  tapPop = false;
  /** Skill mode: every piece the finger crosses pops, whatever its color. */
  tracePop = false;
  frozen = false;
  /** Seconds the pile stays put after a skill clears an area, so the cleared shape can be seen. */
  hold = 0;
  /** Obstruction state (boss attacks). */
  sealColor = -1;
  minExtra = 0;
  reachMod = 0;
  private cover = new Container();
  private coverMask = new Graphics();
  private darkG = new Graphics();
  dark = false;
  /** How many piece colors are in play (the 5→4 item drops one). */
  colors = 5;
  /** Trace line look (cosmetic). */
  lineStyle: LineStyle | null = null;
  private lastTouch = { x: 0, y: 0 };
  private rainbowT = 0;
  private mono: ColorMatrixFilter | null = null;
  /** Fired when a skull bomb's fuse runs out. */
  onSkullBlow?: (x: number, y: number) => void;
  /** Fired when a neighbor's pop frees a stuck piece. */
  onBroken?: () => void;
  private shock: ShockwaveFilter | null = null;
  private maskG = new Graphics();
  readonly r: number;

  constructor(
    public def: CharDef,
    public readonly w: number,
    public readonly h: number,
    private ev: BoardEvents,
    /** Puni Puni-style bowl: w is the diameter; h > w stretches it into a stadium (straight sides). */
    readonly round = false,
  ) {
    this.r = BOARD_TUNING.radius;
    const R = w / 2;
    this.lastTouch = { x: R, y: h * 0.6 };
    this.world = new World({
      gravity: BOARD_TUNING.gravity,
      left: 0,
      right: w,
      bottom: h,
      iterations: 6,
      drag: 0.35,
      friction: 0.12,
      bowl: round ? { x: R, y: R, r: R, hole: (R - this.r) * 0.55, ext: Math.max(0, h - w) } : undefined,
    });
    if (round) this.maskG.roundRect(-2, -2, w + 4, h + 4, R + 2).fill(0xffffff);
    else this.maskG.roundRect(-6, -10, w + 12, h + 16, 30).fill(0xffffff);
    this.view.addChild(this.maskG);
    this.pieceLayer.mask = this.maskG;
    this.coverMask.roundRect(-2, -2, w + 4, h + 4, round ? R + 2 : 30).fill(0xffffff);
    this.cover.mask = this.coverMask;
    this.cover.addChild(this.darkG);
    this.view.addChild(this.fx.view, this.pieceLayer, this.coverMask, this.cover, this.lineLayer, this.overFx.view, this.badge);
    this.badge.addChild(this.badgeBg, this.badgeText);
    this.badge.visible = false;
    const lanes = Math.floor((round ? (R - this.r) * 1.1 : w) / (this.r * 2));
    this.lanes = new Array(lanes).fill(0);
  }

  // --------------------------------------------------------------- pieces
  private targetUnits(): number {
    const area = this.round ? Math.PI * (this.w / 2) ** 2 + this.w * Math.max(0, this.h - this.w) : this.w * this.h;
    // the bowl packs tighter (Puni Puni fills it to the brim)
    const fill = this.round ? BOARD_TUNING.fill * 1.25 : BOARD_TUNING.fill;
    return Math.floor((fill * area) / (Math.PI * this.r * this.r));
  }

  private units(): number {
    let u = 0;
    for (const p of this.pieces) if (p.state !== 'dead') u += p.kind === 'big' ? BOARD_TUNING.bigScale ** 2 * 0.85 : 1;
    return u;
  }

  private pickColor(): number {
    if (Math.random() < 0.7) return Math.floor(Math.random() * this.colors);
    const counts = [0, 0, 0, 0, 0];
    for (const p of this.pieces) if (p.color >= 0 && p.state !== 'dead') counts[p.color]++;
    const weights = counts.slice(0, this.colors).map((c) => 1 / (c + 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < this.colors; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  textureFor(p: Piece): Texture {
    if (p.kind === 'rock') return obstacleTexture(p.art);
    if (p.kind === 'bomb' || p.kind === 'mega') return bombTexture(p.kind === 'mega');
    return pieceTexture(this.def, p.color);
  }

  /** Sets texture, anchor and base scale for the piece's kind. */
  private dress(p: Piece): void {
    p.sprite.texture = this.textureFor(p);
    p.sprite.scale.x = (p.kind === 'normal' || p.kind === 'big') && p.mirror ? -1 : 1;
    if (p.kind === 'rock') {
      p.sprite.anchor.set(0.5);
      p.baseScale = (p.r * 2.3) / OBSTACLE_CELL;
    } else if (p.kind === 'normal' || p.kind === 'big') {
      // strips are centered on each head's center of mass at a common visible size
      p.sprite.anchor.set(0.5, 0.5);
      p.baseScale = (p.r * 2 * PIECE_ART_SCALE) / PIECE_CELL;
    } else {
      p.sprite.anchor.set(ART_CX / ART_SIZE, ART_CY / ART_SIZE);
      p.baseScale = p.r / ART_R;
    }
  }

  addPiece(kind: PieceKind, color: number, x: number, y: number, vy = 0, scale = 1): Piece {
    const base = (kind === 'big' ? this.r * BOARD_TUNING.bigScale : kind === 'mega' ? this.r * 1.2 : this.r) * scale;
    // a little size variance keeps the pile from settling into a grid
    const r = base * (0.96 + Math.random() * 0.08);
    const body = this.world.add(x, y, r * 0.97, kind === 'big' ? 3 : scale > 1 ? scale * scale : 1);
    body.velocity.x = (Math.random() - 0.5) * 36;
    body.velocity.y = vy;
    const p = new Piece(kind, color, body, r);
    p.rot = p.tilt + (Math.random() - 0.5) * 0.6;
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
      const x = this.round ? this.w / 2 + (Math.random() - 0.5) * (this.w / 2 - this.r) * 1.1 : this.r + Math.random() * (this.w - this.r * 2);
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
      const spanX = this.round ? (this.w / 2 - this.r) * 1.1 : this.w;
      const laneW = spanX / this.lanes.length;
      const x = (this.w - spanX) / 2 + laneW * (lane + 0.5) + (Math.random() - 0.5) * laneW * 1.1;
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
    const held = this.hold > 0;
    if (held) this.hold -= dt;
    if (!this.frozen && !held) {
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
    if (!this.frozen) this.statusStep(dt);
    for (const p of this.pieces) this.syncView(p, dt);
    this.rainbowT += dt;
    this.drawDark();
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
    // only real hits squash (a settled pile stays still)
    if (b.impact > 200 && dt > 0) {
      const k = Math.min(b.impact / 1500, 1);
      if (k * 6 > Math.abs(p.squashV) * 0.6) {
        p.axis = Math.atan2(b.ny, b.nx);
        p.squashV -= k * 6;
        p.wobbleV += k * 2 * (b.nx >= 0 ? 1 : -1);
      }
    }
    // springs (soft, under-damped = puni-puni)
    p.squashV += (-320 * p.squash - 16 * p.squashV) * dt;
    p.squash = Math.max(-0.32, Math.min(0.3, p.squash + p.squashV * dt));
    p.wobbleV += (-420 * p.wobble - 14 * p.wobbleV) * dt;
    p.wobble = Math.max(-0.12, Math.min(0.12, p.wobble + p.wobbleV * dt));
    // tumble: rolling spins the piece, a soft spring stands it back up
    p.rotV += (b.velocity.x / p.r) * dt * 0.35;
    p.rotV += ((p.tilt - p.rot) * 14 - p.rotV * 7) * dt;
    p.rot = Math.max(p.tilt - 0.6, Math.min(p.tilt + 0.6, p.rot + p.rotV * dt));
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
      const w = Math.sin(p.pulse * 2.4 + p.id) * 0.005;
      along += w;
      across -= w;
    }
    const s = p.baseScale * p.linkScale;
    p.jelly.rotation = p.axis;
    p.jelly.scale.set(s * along, s * across * (1 + p.wobble));
    p.sprite.rotation = -p.axis + p.rot;
    // when squashed against the floor the piece sinks a little instead of floating
    p.view.position.set(b.position.x, b.position.y - Math.sin(p.axis) * p.squash * p.r * 0.35);
    if (p.deco) p.deco.rotation = (p.rot - p.tilt) * 0.6;
    if (p.ghost > 0) p.ghost -= dt;
    const a = p.ghost > 0 && p.state === 'live' ? 0.06 : 1;
    p.jelly.alpha += (a - p.jelly.alpha) * Math.min(1, dt * 8);
    if (p.kind === 'normal' || p.kind === 'big') {
      const sealed = this.sealColor >= 0 && p.color === this.sealColor;
      p.sprite.tint = sealed ? 0x8c8698 : p.status === 'ice' ? 0x9fdcff : p.status === 'curse' ? 0xc9a0ff : 0xffffff;
    }
  }

  // ---------------------------------------------------------------- input
  private pieceAt(x: number, y: number, reach: number, filter?: (p: Piece) => boolean): Piece | null {
    let best: Piece | null = null;
    let bd = Infinity;
    for (const p of this.pieces) {
      if (p.state === 'dead' || p.state === 'popping') continue;
      if (!this.onBoard(p)) continue;
      if (filter && !filter(p)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= p.r * reach && d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Pieces still dropping in above the bowl can't be touched yet. */
  onBoard(p: Piece): boolean {
    if (!this.round) return true;
    const R = this.w / 2;
    // distance to the stadium's center segment (R,R)-(R,h-R)
    const cy = Math.max(R, Math.min(this.h - R, p.y));
    return Math.hypot(p.x - R, p.y - cy) < R - p.r * 0.35;
  }


  /** Linkable right now (obstructions can seal a whole color). */
  linkOk(p: Piece): boolean {
    return p.linkable && p.color !== this.sealColor;
  }

  get minChain(): number {
    return BOARD_TUNING.minChain + this.minExtra;
  }

  adjacent(a: Piece, b: Piece, slack = BOARD_TUNING.adjacency): boolean {
    slack += this.reachMod;
    // big pieces reach further so they are easy to work into a chain
    if (a.kind === 'big' || b.kind === 'big') slack += BOARD_TUNING.bigReach;
    if (this.fever) slack += BOARD_TUNING.feverReach;
    return Math.hypot(a.x - b.x, a.y - b.y) <= (a.r + b.r) * slack;
  }

  pointerDown(x: number, y: number): void {
    if (!this.inputEnabled) return;
    this.ev.onInteract?.();
    this.clearHint();
    this.lastTouch = { x, y };
    const p = this.pieceAt(x, y, BOARD_TUNING.touch);
    if (!p) return;
    if (p.kind === 'bomb' || p.kind === 'mega') {
      this.explode(p);
      return;
    }
    if (p.kind === 'rock' || !this.linkOk(p)) {
      Sound.play('rock', { vol: 0.5, rate: 1.3 });
      p.poke(7);
      gsap.fromTo(p.view, { x: p.view.x - 6 }, { x: p.view.x, duration: 0.25, ease: 'elastic.out(1.5,0.3)' });
      return;
    }
    if (this.tapPop) {
      this.popGroup(p);
      return;
    }
    if (this.tracePop) {
      this.pointer = { x, y };
      this.traceHit([p]);
      return;
    }
    this.chain = [p];
    this.link(p);
    this.pointer = { x, y };
    this.backArmed = false;
  }

  /**
   * Tsum Tsum-style tracing: every move is a segment; pieces whose touch circle (1.27R) the
   * segment crosses are linked in the order the finger reached them, so a fast swipe never
   * skips one. Backtracking needs the finger to have left the tail first (hysteresis), and the
   * end of a move gets a small directional assist toward the nearest valid piece.
   */
  pointerMove(x: number, y: number): void {
    if (this.tracePop && this.pointer) {
      this.traceMove(x, y);
      return;
    }
    if (!this.pointer || this.chain.length === 0) return;
    const from = this.pointer;
    const dx = x - from.x;
    const dy = y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    this.pointer = { x, y };
    const chain = this.chain;
    const color = chain[0].color;
    // backtrack: arm once the finger is clearly away from the tail, then step back onto the previous piece
    const tail = chain[chain.length - 1];
    if (Math.hypot(x - tail.x, y - tail.y) > tail.r * 0.72) this.backArmed = true;
    if (chain.length >= 2 && this.backArmed) {
      const prev = chain[chain.length - 2];
      const toPrev = Math.hypot(prev.x - x, prev.y - y);
      const dirCos = ((prev.x - tail.x) * dx + (prev.y - tail.y) * dy) / (Math.hypot(prev.x - tail.x, prev.y - tail.y) * len || 1);
      if (toPrev <= prev.r * 0.9 && toPrev < Math.hypot(tail.x - x, tail.y - y) && dirCos >= 0.25) {
        chain.pop();
        this.unlink(tail);
        this.backArmed = false;
        return;
      }
    }
    // swept hits, ordered by where along the segment the finger entered each piece
    const hits: { p: Piece; t: number }[] = [];
    const A = dx * dx + dy * dy;
    for (const p of this.pieces) {
      if (!this.linkOk(p) || p.color !== color || !this.onBoard(p)) continue;
      const rr = p.r * BOARD_TUNING.touch;
      const fx = from.x - p.x;
      const fy = from.y - p.y;
      // solve |from + t*d - p| = rr for the entry t
      const B = 2 * (fx * dx + fy * dy);
      const C = fx * fx + fy * fy - rr * rr;
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      const t0 = (-B - Math.sqrt(disc)) / (2 * A);
      const t1 = (-B + Math.sqrt(disc)) / (2 * A);
      if (t1 < 0 || t0 > 1) continue;
      hits.push({ p, t: Math.max(0, t0) });
    }
    hits.sort((u, v) => u.t - v.t);
    for (const { p } of hits) this.tryLink(p);
    // end-of-move assist: the single nearest valid piece the finger is heading for
    const last = chain[chain.length - 1];
    let best: Piece | null = null;
    let bd = Infinity;
    let tie = false;
    for (const p of this.pieces) {
      if (!this.linkOk(p) || p.color !== color || !this.onBoard(p) || !this.adjacent(p, last)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > p.r * BOARD_TUNING.assist) continue;
      if (Math.abs(d - bd) < 2) tie = true;
      if (d < bd) {
        tie = false;
        bd = d;
        best = p;
      }
    }
    if (best && !tie) {
      const cos = ((best.x - x) * dx + (best.y - y) * dy) / ((bd || 1) * len);
      if (cos >= 0.9 || bd < best.r * 0.5) this.tryLink(best);
    }
  }

  private backArmed = false;

  /** Trace skill: pops everything the finger sweeps over (touch circle along the segment). */
  private traceMove(x: number, y: number): void {
    const from = this.pointer!;
    this.pointer = { x, y };
    const dx = x - from.x;
    const dy = y - from.y;
    const L2 = dx * dx + dy * dy;
    const hit = this.live().filter((p) => {
      if (p.kind === 'bomb' || p.kind === 'mega' || !this.onBoard(p)) return false;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / L2)) : 0;
      return Math.hypot(from.x + dx * t - p.x, from.y + dy * t - p.y) < p.r * 1.3;
    });
    if (hit.length) this.traceHit(hit);
  }

  private traceHit(list: Piece[]): void {
    const victims = list.filter((p) => p.state === 'live' && p.kind !== 'bomb' && p.kind !== 'mega');
    if (!victims.length) return;
    for (const p of victims) p.state = 'popping';
    const infos = victims.map((p) => this.info(p));
    const tok = this.ev.onResolve(infos, 'skill', { chain: victims.length, color: -1, x: victims[0].x, y: victims[0].y });
    victims.forEach((p, i) => this.popPiece(p, i * 0.02, i, 'skill', tok));
  }

  private tryLink(p: Piece): void {
    const last = this.chain[this.chain.length - 1];
    if (p === last || p.state !== 'live' || !this.adjacent(p, last)) return;
    this.chain.push(p);
    this.link(p);
    this.backArmed = false;
  }

  /** Lifts the finger without committing (pointercancel, system gestures). */
  cancelChain(): void {
    const chain = this.chain;
    this.chain = [];
    this.pointer = null;
    this.badge.visible = false;
    for (const p of chain) if (p.state === 'linked') this.unlink(p, true);
    this.ev.onChainChange?.(0, 0, -1);
  }

  pointerUp(): void {
    if (this.tracePop) this.pointer = null;
    if (this.chain.length === 0) return;
    // something else (a skill, a bomb) may have taken pieces out of the chain meanwhile
    const chain = this.chain.filter((p) => p.state === 'linked');
    this.chain = [];
    this.pointer = null;
    this.badge.visible = false;
    if (chain.length === 0) return;
    const eff = chain.reduce((a, p) => a + p.weight, 0);
    if (chain.length >= this.minChain || (eff >= this.minChain && chain.length >= 2)) {
      this.resolveChain(chain);
    } else {
      for (const p of chain) this.unlink(p, true);
      // a plain tap makes the piece hop
      if (chain.length === 1) {
        const p = chain[0];
        p.body.velocity.y -= 520;
        p.body.velocity.x += (Math.random() - 0.5) * 120;
        p.poke(8);
      }
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
    // pops up past its linked size and springs back: the piece answers the finger
    p.linkScale = 1.3;
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
    return { x: p.x, y: p.y, color: p.color, kind: p.kind, weight: p.weight, cursed: p.status === 'curse' };
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
    // one-by-one pops that speed up as they go (first one right away), all done within 0.85s
    // (0.55s in fever) so the bowl refills quickly and the next trace can start sooner
    const n = chain.length;
    const end = Math.min(this.fever ? 0.55 : 0.85, (this.fever ? 0.18 : 0.26) + n * 0.035);
    chain.forEach((p, i) => this.popPiece(p, n > 1 ? end * Math.pow(i / (n - 1), 0.78) : 0, i, 'chain', tok));
    // release punch: a flash where the finger let go and a tap on the hand
    this.overFx.ring(lx, ly, 0xffffff, 0.8 + Math.min(eff, 20) * 0.05, 0.3);
    haptic(eff >= BOARD_TUNING.bombAt ? [12, 40, 18] : 10);
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

  /** Neighbors of popped pieces: rocks take a hit (returned when they break), stuck statuses come off. */
  private rocksNear(popped: Piece[]): Piece[] {
    const out: Piece[] = [];
    for (const r of this.pieces) {
      if (r.state !== 'live' || popped.includes(r)) continue;
      const rock = r.kind === 'rock';
      const stuck = r.status && BREAKABLE.includes(r.status);
      if (!rock && !stuck) continue;
      if (!popped.some((p) => this.adjacent(p, r, 1.25))) continue;
      if (stuck) {
        this.clearStatus(r, true);
        this.onBroken?.();
        continue;
      }
      r.hp--;
      if (r.hp <= 0) out.push(r);
      else {
        r.poke(9);
        this.setDeco(r, 'crack');
        Sound.play('rock', { vol: 0.5, rate: 1.4 });
        this.fx.burst(r.x, r.y, { count: 6, tex: 'smoke_04', tint: 0x9aa0b8, speed: [40, 160], size: [0.1, 0.2], grow: 1.5, gravity: -40, life: [0.3, 0.6] });
      }
    }
    for (const r of out) r.state = 'popping';
    return out;
  }

  /** Visually pops a piece after `delay` and removes it from the world. */
  popPiece(p: Piece, delay: number, index: number, cause: PopCause, token: number): void {
    if (p.state === 'dead') return;
    p.state = 'popping';
    const run = () => {
      if (p.state === 'dead' || p.view.destroyed) return;
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
    const tok = this.ev.onResolve(group.map((p) => this.info(p)), 'fever', { chain: eff, color: start.color, x: start.x, y: start.y, tap: true });
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
        if (seen.has(p) || !this.linkOk(p) || p.color !== start.color || !this.onBoard(p)) continue;
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
      if (done.has(p) || !this.linkOk(p) || !this.onBoard(p)) continue;
      const g = this.groupOf(p);
      g.forEach((q) => done.add(q));
      const w = g.reduce((a, q) => a + q.weight, 0);
      if (w > best.reduce((a, q) => a + q.weight, 0)) best = g;
    }
    return best;
  }

  showHint(): void {
    const g = this.bestGroup();
    if (g.reduce((a, q) => a + q.weight, 0) < this.minChain) return;
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
      .filter((p) => p !== b && p.state === 'live' && Math.hypot(p.x - cx, p.y - cy) <= radius + p.r * 0.5)
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
    // a big skill clear freezes the pile for a beat: the hole keeps the move's shape
    if (cause === 'skill' && victims.length >= 4) this.hold = Math.max(this.hold, 0.9);
    const infos = victims.map((p) => this.info(p));
    const tok = this.ev.onResolve(infos, cause, { chain: victims.length, color: -1, x: ox, y: oy });
    victims.forEach((p, i) => this.popPiece(p, i * Math.min(0.03, 0.6 / Math.max(1, victims.length)), i, cause, tok));
    return infos;
  }

  /** When no group of 3 exists, paints the neighbors of a random piece to its color. */
  unstick(): void {
    const live = this.live().filter((p) => p.kind === 'normal' && this.onBoard(p));
    if (live.length < 4) return;
    const seed = live[Math.floor(Math.random() * live.length)];
    const near = live
      .filter((p) => p !== seed && p.color !== seed.color)
      .sort((a, b) => Math.hypot(a.x - seed.x, a.y - seed.y) - Math.hypot(b.x - seed.x, b.y - seed.y))
      .slice(0, 3);
    this.recolor(near, seed.color);
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

  applyRock(p: Piece, art: ObstacleArt = 'rock', hp = 1): void {
    if (p.state === 'dead') return;
    p.state = 'live';
    if (p.status) this.clearStatus(p, false);
    p.kind = 'rock';
    p.color = -1;
    p.art = art;
    p.hp = hp;
    this.dress(p);
    p.poke(9);
    this.fx.burst(p.x, p.y, { count: 10, tex: 'smoke_04', tint: 0x9aa0b8, speed: [40, 180], size: [0.12, 0.25], grow: 1.6, gravity: -60, life: [0.4, 0.8] });
    Sound.play('rock', { vol: 0.6 });
  }

  // ------------------------------------------------------- obstructions
  /** How each status is dressed: an obstacle sprite (size in piece diameters, offset in radii) or a drawn overlay. */
  private static DECO: Record<PieceStatus | 'crack', { art?: ObstacleArt; draw?: StatusArt; size: number; x?: number; y?: number; alpha?: number }> = {
    ice: { draw: 'ice', art: 'crystal', size: 0.6, x: 0.58, y: -0.58 },
    bubble: { art: 'qbox', size: 1.2 },
    web: { art: 'shackle', size: 1.05, y: 0.1 },
    slime: { art: 'anchor', size: 0.6, x: 0.55, y: 0.55 },
    curse: { draw: 'curse', art: 'skull', size: 0.6, x: 0.58, y: -0.58 },
    skullBomb: { art: 'bomb', size: 1.2 },
    chameleon: { draw: 'chameleon', size: 1 },
    crack: { draw: 'crack', size: 1 },
  };

  private setDeco(p: Piece, kind: PieceStatus | 'crack' | null): void {
    if (p.deco) {
      p.deco.destroy({ children: true });
      p.deco = null;
    }
    if (!kind || p.view.destroyed) return;
    const spec = Board.DECO[kind];
    const d = new Container();
    // a drawn overlay over the whole piece (ice shell, curse aura), then the model as a badge
    if (spec.draw) {
      const under = new Sprite(statusTexture(spec.draw));
      under.anchor.set(0.5);
      under.scale.set(p.r / (ART_R * 1.5));
      d.addChild(under);
    }
    if (spec.art) {
      const sp = new Sprite(obstacleTexture(spec.art));
      sp.anchor.set(0.5);
      sp.scale.set((p.r * 2 * spec.size) / OBSTACLE_CELL);
      sp.position.set((spec.x ?? 0) * p.r, (spec.y ?? 0) * p.r);
      sp.alpha = spec.alpha ?? 1;
      d.addChild(sp);
    }
    if (kind === 'bubble') {
      const q = txt('?', { size: 44, font: 'dela', color: 0xffffff, stroke: 0x1b3d8a, strokeWidth: 8 });
      q.y = 4;
      d.addChild(q);
    }
    p.view.addChild(d);
    p.deco = d;
  }

  /** Puts an obstruction on a live piece. */
  setStatus(p: Piece, st: PieceStatus): void {
    if (p.state === 'dead') return;
    if (p.state === 'linked') this.cancelChain();
    if (p.state !== 'live' && p.state !== 'popping') return;
    p.state = 'live';
    if (p.status) this.clearStatus(p, false);
    p.status = st;
    p.statusT = st === 'skullBomb' ? 10 : st === 'chameleon' ? 1.4 : st === 'slime' ? 12 : 0;
    this.setDeco(p, st);
    if (st === 'web' || st === 'slime') {
      p.body.pinned = true;
      p.body.invMass = 0;
    }
    if (st === 'skullBomb') {
      const t = txt('10', { size: 32, font: 'dela', color: 0xffffff, stroke: 0x2a1630, strokeWidth: 7 });
      t.y = p.r * 0.2;
      p.deco?.addChild(t);
    }
    p.poke(9);
    this.overFx.ring(p.x, p.y, 0xffffff, p.r / 90, 0.3);
  }

  clearStatus(p: Piece, fx: boolean): void {
    const st = p.status;
    if (!st) return;
    p.status = null;
    this.setDeco(p, null);
    if (st === 'web' || st === 'slime') {
      p.body.pinned = false;
      p.body.invMass = p.kind === 'big' ? 1 / 3 : 1;
    }
    if (!fx) return;
    p.poke(-8);
    const tint = st === 'ice' ? 0xbff2ff : st === 'bubble' ? 0xe8dcff : st === 'web' ? 0xffffff : 0x9a8cb8;
    this.overFx.burst(p.x, p.y, { count: 10, tex: 'star_06', tint: [tint, 0xffffff], add: true, gravity: 200, speed: [80, 260], size: [0.06, 0.12], life: [0.3, 0.5] });
    Sound.play(st === 'ice' ? 'glass' : 'pep', { vol: 0.4, rate: 1.3 + Math.random() * 0.3 });
  }

  private statusStep(dt: number): void {
    for (const p of this.pieces) {
      if (!p.status || p.state === 'dead') continue;
      if (p.status === 'curse') continue;
      if (p.status === 'ice' || p.status === 'web' || p.status === 'bubble') continue;
      p.statusT -= dt;
      if (p.status === 'skullBomb') {
        const t = p.deco?.children[1] as import('pixi.js').Text | undefined;
        const sec = String(Math.max(0, Math.ceil(p.statusT)));
        if (t && t.text !== sec) {
          t.text = sec;
          if (p.statusT < 3.5) {
            t.style.fill = 0xff5070;
            p.poke(5);
            Sound.play('tick', { vol: 0.35, rate: 1.6 });
          }
        }
        if (p.statusT <= 0) {
          this.clearStatus(p, false);
          this.onSkullBlow?.(p.x, p.y);
          this.shockwave(p.x, p.y, this.r * 3);
          if (p.state === 'live') this.applyRock(p);
        }
      } else if (p.status === 'chameleon') {
        if (p.statusT <= 0 && p.state === 'live') {
          p.statusT = 1.4;
          p.color = (p.color + 1 + Math.floor(Math.random() * (this.colors - 1))) % this.colors;
          this.dress(p);
          p.poke(-5);
        }
      } else if (p.status === 'slime' && p.statusT <= 0) this.clearStatus(p, true);
    }
  }

  /** Random live pieces for an obstruction to land on. */
  targets(n: number, ok: (p: Piece) => boolean = (p) => p.kind === 'normal' && !p.status): Piece[] {
    const cands = this.live().filter((p) => this.onBoard(p) && ok(p));
    const out: Piece[] = [];
    while (out.length < n && cands.length) out.push(cands.splice(Math.floor(Math.random() * cands.length), 1)[0]);
    return out;
  }

  /** Drops rocks in from the chute (hp = hits needed). */
  dropRocks(n: number, hp = 1, scale = 1, arts: ObstacleArt[] = ['rock']): void {
    for (let i = 0; i < n; i++) {
      gsap.delayedCall(i * 0.12, () => {
        const x = this.w / 2 + (Math.random() - 0.5) * this.w * 0.3;
        const p = this.addPiece('rock', -1, x, -this.r * 2 * scale, 700, scale);
        p.hp = hp;
        p.art = arts[Math.floor(Math.random() * arts.length)];
        this.dress(p);
      });
    }
  }

  /** Every normal piece gets a new random color. */
  shuffleColors(): void {
    if (this.chain.length) this.cancelChain();
    const list = this.live().filter((p) => p.kind === 'normal' || p.kind === 'big');
    list.forEach((p, i) => {
      gsap.delayedCall((i % 12) * 0.03, () => {
        if (p.state !== 'live') return;
        p.color = Math.floor(Math.random() * this.colors);
        this.dress(p);
        p.poke(-6);
      });
    });
  }

  /** Sends every piece flying a little. */
  kick(power: number): void {
    for (const p of this.pieces) {
      if (p.state === 'dead' || p.body.pinned) continue;
      p.body.velocity.x += (Math.random() - 0.5) * power;
      p.body.velocity.y -= power * (0.5 + Math.random() * 0.5);
      p.poke(6);
    }
  }

  setGhosts(n: number, dur: number): void {
    for (const p of this.targets(n, (q) => q.kind === 'normal' || q.kind === 'big')) p.ghost = dur;
  }

  setMono(on: boolean): void {
    if (on && !this.mono) {
      this.mono = new ColorMatrixFilter();
      this.mono.desaturate();
      this.mono.alpha = 0.88;
      this.pieceLayer.filters = [this.mono];
    } else if (!on && this.mono) {
      this.pieceLayer.filters = [];
      this.mono = null;
    }
  }

  /** Ink splats over the bowl; fades them out after `dur`. */
  ink(n: number, dur: number): void {
    for (let i = 0; i < n; i++) {
      const c = new Container();
      const x = this.w * (0.2 + Math.random() * 0.6);
      const y = this.h * (0.25 + Math.random() * 0.6);
      for (let k = 0; k < 6; k++) {
        const s = new Sprite(fxTex('circle_05'));
        s.anchor.set(0.5);
        s.tint = 0x140a1e;
        const sz = k === 0 ? 1.5 : 0.35 + Math.random() * 0.5;
        s.scale.set(sz);
        const a = Math.random() * Math.PI * 2;
        const d = k === 0 ? 0 : 70 + Math.random() * 60;
        s.position.set(Math.cos(a) * d, Math.sin(a) * d);
        c.addChild(s);
      }
      c.position.set(x, y);
      this.cover.addChild(c);
      c.scale.set(0.2);
      gsap.to(c.scale, { x: 1, y: 1, duration: 0.3, delay: i * 0.12, ease: 'back.out(2)' });
      gsap.to(c, { alpha: 0, duration: 0.8, delay: dur, onComplete: () => c.destroy({ children: true }) });
      gsap.delayedCall(i * 0.12, () => Sound.play('drop', { vol: 0.5, rate: 0.6 }));
    }
  }

  private drawDark(): void {
    const g = this.darkG;
    g.clear();
    if (!this.dark) return;
    const tail = this.chain[this.chain.length - 1];
    const fx0 = this.pointer?.x ?? tail?.x ?? this.lastTouch.x;
    const fy0 = this.pointer?.y ?? tail?.y ?? this.lastTouch.y;
    const rr = this.r * 3.4;
    g.rect(-10, -10, this.w + 20, this.h + 20).fill({ color: 0x05020c, alpha: 0.93 });
    g.circle(fx0, fy0, rr).cut();
    g.circle(fx0, fy0, rr).stroke({ width: 18, color: 0x05020c, alpha: 0.5 });
  }

  /** Removes every timed board effect (time up). */
  clearEffects(): void {
    this.dark = false;
    this.setMono(false);
    this.sealColor = -1;
    this.minExtra = 0;
    this.reachMod = 0;
    this.frozen = false;
    this.hold = 0;
    this.world.o.gravityX = 0;
    this.world.o.gravity = BOARD_TUNING.gravity;
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
    // the line heats up and thickens as the chain grows (6 / 10 / 15 / 20)
    const n = chain.length;
    const heat = n >= 20 ? 4 : n >= 15 ? 3 : n >= 10 ? 2 : n >= 6 ? 1 : 0;
    const core = [0xffffff, 0xfff5aa, 0xffe36f, 0xffbd66, 0xff8d78][heat];
    const thick = 1 + heat * 0.12;
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
    const st = this.lineStyle;
    const pick = (v: number | 'piece' | 'rainbow' | undefined, piece: number, i: number) =>
      v === undefined || v === 'piece' ? piece : v === 'rainbow' ? rainbow(i * 40 + this.rainbowT * 240) : v;
    const glow = heat && (!st || st.glow === 'piece') ? core : c.glow;
    const lineCore = st && st.id !== 'basic' ? st.core : core;
    if (pts.length > 1) {
      const rb = st?.body === 'rainbow' || st?.glow === 'rainbow';
      if (rb) {
        // per-segment colors for the rainbow line
        for (let i = 1; i < pts.length; i++) {
          const seg = () => g.moveTo(pts[i - 1].x, pts[i - 1].y).lineTo(pts[i].x, pts[i].y);
          seg();
          g.stroke({ width: 34 * thick, color: pick(st?.glow, glow, i), alpha: 0.4, cap: 'round' });
        }
        path();
        g.stroke({ width: 20 * thick, color: 0x2a1630, alpha: 0.9, cap: 'round', join: 'round' });
        for (let i = 1; i < pts.length; i++) {
          g.moveTo(pts[i - 1].x, pts[i - 1].y).lineTo(pts[i].x, pts[i].y);
          g.stroke({ width: 14 * thick, color: pick(st?.body, c.hex, i), cap: 'round' });
        }
      } else {
        path();
        g.stroke({ width: 34 * thick, color: pick(st?.glow, glow, 0), alpha: 0.35 + heat * 0.06, cap: 'round', join: 'round' });
        path();
        g.stroke({ width: 20 * thick, color: 0x2a1630, alpha: 0.9, cap: 'round', join: 'round' });
        path();
        g.stroke({ width: 14 * thick, color: pick(st?.body, c.hex, 0), cap: 'round', join: 'round' });
      }
      path();
      g.stroke({ width: 5 * thick, color: lineCore, alpha: 0.95, cap: 'round', join: 'round' });
    }
    for (const p of chain) {
      g.circle(p.x, p.y, p.r + 4).stroke({ width: 3, color: lineCore, alpha: 0.85 });
      g.circle(p.x, p.y, 11).fill(0x2a1630);
      g.circle(p.x, p.y, 8).fill(lineCore);
    }
  }

  destroy(): void {
    this.world.clear();
  }
}

/** Hue in degrees → color, for the rainbow trace line. */
function rainbow(h: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => 0.62 - 0.38 * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
