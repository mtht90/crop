import { AnimatedSprite, Container } from 'pixi.js';
import { strip } from './assets';

export const FPS10 = 10 / 60;

/** スプライトアニメの切り替えを楽にする基本クラス。足元が position になる。 */
export class Actor extends Container {
  spr: AnimatedSprite;
  current = '';
  facing = 1;

  constructor(key: string, anchorY = 0.7, frameW?: number) {
    super();
    this.spr = new AnimatedSprite(strip(key, frameW));
    this.spr.anchor.set(0.5, anchorY);
    this.spr.animationSpeed = FPS10;
    this.spr.play();
    this.current = key;
    this.addChild(this.spr);
  }

  play(key: string, opts: { loop?: boolean; speed?: number; onDone?: () => void; frameW?: number } = {}) {
    if (this.current === key && opts.loop !== false) return;
    this.current = key;
    this.spr.textures = strip(key, opts.frameW);
    this.spr.loop = opts.loop !== false;
    this.spr.animationSpeed = opts.speed ?? FPS10;
    this.spr.onComplete = opts.onDone;
    this.spr.gotoAndPlay(0);
  }

  face(dx: number) {
    if (Math.abs(dx) < 0.5) return;
    this.facing = dx < 0 ? -1 : 1;
    this.spr.scale.x = Math.abs(this.spr.scale.x) * this.facing;
  }

  /** 目的地へ等速移動。到着したら true */
  moveTo(tx: number, ty: number, speed: number, dt: number): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      this.position.set(tx, ty);
      return true;
    }
    const step = Math.min(d, speed * dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.face(dx);
    return false;
  }
}

export type PawnJob = 'miner' | 'lumberjack' | 'hunter' | 'builder';

export interface PawnWorld {
  workSpot(job: PawnJob, pawn: Pawn): { x: number; y: number; face: number; target?: unknown } | null;
  dropSpot(job: PawnJob): { x: number; y: number };
  delivered(job: PawnJob, x: number, y: number): void;
  wander(): { x: number; y: number };
}

const TOOL: Record<PawnJob, string> = { miner: 'pickaxe', lumberjack: 'axe', hunter: 'knife', builder: 'hammer' };
const CARRY: Record<PawnJob, string> = { miner: 'gold', lumberjack: 'wood', hunter: 'meat', builder: 'hammer' };
const WORK_TIME: Record<PawnJob, number> = { miner: 2.4, lumberjack: 2.8, hunter: 2.0, builder: 4.5 };

type PawnState = 'toWork' | 'work' | 'toDrop' | 'idle';

export class Pawn extends Actor {
  job: PawnJob;
  state: PawnState = 'idle';
  timer = 0;
  tx = 0;
  ty = 0;
  workFace = 1;
  target: unknown = null;
  speed = 70 + Math.random() * 25;
  private w: PawnWorld;

  constructor(job: PawnJob, w: PawnWorld) {
    super(`units/blue/pawn_idle_${TOOL[job]}`);
    this.job = job;
    this.w = w;
    this.spr.scale.set(0.85);
    this.timer = Math.random() * 1.5;
    this.spr.gotoAndPlay((Math.random() * 6) | 0);
  }

  update(dt: number) {
    const job = this.job;
    switch (this.state) {
      case 'idle': {
        this.timer -= dt;
        this.play(`units/blue/pawn_idle_${TOOL[job]}`);
        if (this.timer <= 0) {
          const spot = this.w.workSpot(job, this);
          if (spot) {
            this.tx = spot.x;
            this.ty = spot.y;
            this.workFace = spot.face;
            this.target = spot.target;
            this.state = 'toWork';
          } else {
            const p = this.w.wander();
            this.tx = p.x;
            this.ty = p.y;
            this.state = 'toWork';
            this.target = 'wander';
          }
        }
        break;
      }
      case 'toWork': {
        this.play(`units/blue/pawn_run_${TOOL[job]}`);
        if (this.moveTo(this.tx, this.ty, this.speed, dt)) {
          if (this.target === 'wander') {
            this.state = 'idle';
            this.timer = 1 + Math.random() * 2;
          } else {
            this.state = 'work';
            this.timer = WORK_TIME[job] * (0.85 + Math.random() * 0.3);
            this.face(this.workFace);
          }
        }
        break;
      }
      case 'work': {
        this.play(`units/blue/pawn_interact_${TOOL[job]}`);
        this.timer -= dt;
        if (this.timer <= 0) {
          if (job === 'builder') {
            this.state = 'idle';
            this.timer = 0.3 + Math.random();
          } else {
            const d = this.w.dropSpot(job);
            this.tx = d.x + (Math.random() - 0.5) * 30;
            this.ty = d.y + (Math.random() - 0.5) * 16;
            this.state = 'toDrop';
          }
        }
        break;
      }
      case 'toDrop': {
        this.play(`units/blue/pawn_run_${CARRY[job]}`);
        if (this.moveTo(this.tx, this.ty, this.speed * 0.9, dt)) {
          this.w.delivered(job, this.x, this.y);
          this.state = 'idle';
          this.timer = 0.15 + Math.random() * 0.4;
        }
        break;
      }
    }
  }
}

export class Sheep extends Actor {
  home: { x: number; y: number; r: number };
  private t = Math.random() * 3;
  private mode: 'idle' | 'move' | 'graze' = 'idle';
  private tx = 0;
  private ty = 0;

  constructor(home: { x: number; y: number; r: number }) {
    super('res/sheep_idle', 0.65);
    this.home = home;
    this.spr.scale.set(0.9);
  }

  update(dt: number) {
    this.t -= dt;
    if (this.mode === 'move') {
      this.play('res/sheep_move');
      if (this.moveTo(this.tx, this.ty, 28, dt)) {
        this.mode = 'idle';
        this.t = 1 + Math.random() * 2;
      }
      return;
    }
    if (this.t <= 0) {
      const r = Math.random();
      if (r < 0.4) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * this.home.r;
        this.tx = this.home.x + Math.cos(a) * d;
        this.ty = this.home.y + Math.sin(a) * d * 0.6;
        this.mode = 'move';
      } else if (r < 0.75) {
        this.mode = 'graze';
        this.play('res/sheep_grass', { loop: false, onDone: () => { this.mode = 'idle'; this.t = 0.5; } });
        this.t = 99;
      } else {
        this.mode = 'idle';
        this.play('res/sheep_idle');
        this.t = 1.5 + Math.random() * 2;
      }
    }
    if (this.mode === 'idle') this.play('res/sheep_idle');
  }
}

export type UnitKind = 'warrior' | 'lancer' | 'archer' | 'monk';

/** 戦闘・待機用の兵士。槍兵だけ 320px のコマ。 */
export class Soldier extends Actor {
  kind: UnitKind;
  color: string;
  constructor(kind: UnitKind, color: string) {
    const fw = kind === 'lancer' ? 320 : 192;
    super(`units/${color}/${kind}_idle`, kind === 'lancer' ? 0.615 : 0.71, fw);
    this.kind = kind;
    this.color = color;
    this.spr.scale.set(kind === 'lancer' ? 0.72 : 0.8);
    this.spr.gotoAndPlay((Math.random() * 6) | 0);
  }
  anim(name: 'idle' | 'run' | 'attack') {
    const fw = this.kind === 'lancer' ? 320 : 192;
    const map: Record<UnitKind, Record<string, string>> = {
      warrior: { idle: 'warrior_idle', run: 'warrior_run', attack: Math.random() < 0.5 ? 'warrior_attack1' : 'warrior_attack2' },
      lancer: { idle: 'lancer_idle', run: 'lancer_run', attack: 'lancer_right_attack' },
      archer: { idle: 'archer_idle', run: 'archer_run', attack: 'archer_shoot' },
      monk: { idle: 'monk_idle', run: 'monk_run', attack: 'monk_heal' },
    };
    this.play(`units/${this.color}/${map[this.kind][name]}`, { frameW: fw });
  }
}
