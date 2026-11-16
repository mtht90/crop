import { AnimatedSprite, Container, Sprite } from 'pixi.js';
import { strip, tex, tile } from './assets';

export const T = 64;

export interface IslandDef {
  id: string;
  origin: [number, number]; // tile coords of map[0][0]
  tilemap: number; // 1..5 grass colour
  map: string[]; // '.' water, 'g' ground, 'H' plateau
}

/**
 * 自動タイル。上下左右の隣接から 4x4 ブロック内の位置を決める。
 * 列: 0=左端 1=中 2=右端 3=幅1 / 行: 0=上端 1=中 2=下端 3=高さ1
 */
function autoIndex(n: boolean, s: boolean, w: boolean, e: boolean): [number, number] {
  const col = w && e ? 1 : !w && e ? 0 : w && !e ? 2 : 3;
  const row = n && s ? 1 : !n && s ? 0 : n && !s ? 2 : 3;
  return [col, row];
}

export class Island {
  def: IslandDef;
  foam = new Container();
  ground = new Container();
  high = new Container();
  w: number;
  h: number;
  private grid: string[];

  constructor(def: IslandDef) {
    this.def = def;
    this.grid = def.map;
    this.h = def.map.length;
    this.w = Math.max(...def.map.map((r) => r.length));
    this.build();
  }

  at(x: number, y: number): string {
    if (y < 0 || y >= this.h) return '.';
    return this.grid[y][x] ?? '.';
  }
  land(x: number, y: number) {
    return this.at(x, y) !== '.';
  }
  isHigh(x: number, y: number) {
    return this.at(x, y) === 'H';
  }
  /** ワールド座標（px）でのタイル左上 */
  px(x: number, y: number): [number, number] {
    return [(this.def.origin[0] + x) * T, (this.def.origin[1] + y) * T];
  }
  get bounds() {
    const [x, y] = this.px(0, 0);
    return { x, y, w: this.w * T, h: this.h * T };
  }

  private build() {
    const key = `terrain/tilemap${this.def.tilemap}`;
    const foamFrames = strip('terrain/foam');
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.land(x, y)) continue;
        const [px, py] = this.px(x, y);
        // foam under shoreline tiles
        let shore = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!this.land(x + dx, y + dy)) shore = true;
        if (shore) {
          const f = new AnimatedSprite(foamFrames);
          f.anchor.set(0.5);
          f.position.set(px + T / 2, py + T / 2);
          f.animationSpeed = 0.14;
          f.gotoAndPlay(((x * 7 + y * 13) % 16));
          this.foam.addChild(f);
        }
        const [c, r] = autoIndex(this.land(x, y - 1), this.land(x, y + 1), this.land(x - 1, y), this.land(x + 1, y));
        const s = new Sprite(tile(key, c, r));
        s.position.set(px, py);
        this.ground.addChild(s);
      }
    }
    // plateau: shadow, top and cliff
    const shadows = new Container();
    const tops = new Container();
    const cliffs = new Container();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.isHigh(x, y)) continue;
        const [px, py] = this.px(x, y);
        const sh = new Sprite(tex('terrain/shadow'));
        sh.anchor.set(0.5);
        sh.position.set(px + T / 2, py + T / 2 + T);
        sh.alpha = 0.55;
        shadows.addChild(sh);
        const [c, r] = autoIndex(this.isHigh(x, y - 1), this.isHigh(x, y + 1), this.isHigh(x - 1, y), this.isHigh(x + 1, y));
        const top = new Sprite(tile(key, 5 + c, r));
        top.position.set(px, py);
        tops.addChild(top);
        if (!this.isHigh(x, y + 1)) {
          const w = this.isHigh(x - 1, y) && !this.isHigh(x - 1, y + 1);
          const e = this.isHigh(x + 1, y) && !this.isHigh(x + 1, y + 1);
          const cc = w && e ? 1 : !w && e ? 0 : w && !e ? 2 : 3;
          const onWater = !this.land(x, y + 1);
          const cl = new Sprite(tile(key, 5 + cc, onWater ? 5 : 4));
          cl.position.set(px, py + T);
          cliffs.addChild(cl);
        }
      }
    }
    this.high.addChild(shadows, tops, cliffs);
  }
}

// ---------------------------------------------------------------- 島の設計

export const MAIN_ISLAND: IslandDef = {
  id: 'main',
  origin: [0, 0],
  tilemap: 1,
  map: [
    '....gggggggggggg......',
    '..ggggggggggggggggg...',
    '.gggggggHHHHHHHgggggg.',
    '.ggggggHHHHHHHHHggggg.',
    'gggggggHHHHHHHHHgggggg',
    'gggggggggggggggggggggg',
    'gggggggggggggggggggggg',
    '.ggggggggggggggggggggg',
    '.gggggggggggggggggggg.',
    '..ggggggggggggggggggg.',
    '...ggggggggggggggggg..',
    '....ggggggggggggggg...',
    '.......ggggggggg......',
  ],
};

export const RIVAL_ISLANDS: Record<string, IslandDef> = {
  red: {
    id: 'red', origin: [-14, 2], tilemap: 3,
    map: [
      '..ggggggg..',
      '.ggggggggg.',
      'ggggHHHgggg',
      'gggHHHHHggg',
      'ggggggggggg',
      '.ggggggggg.',
      '..gggggg...',
    ],
  },
  purple: {
    id: 'purple', origin: [6, -11], tilemap: 5,
    map: [
      '...ggggg...',
      '.ggggggggg.',
      'gggHHHHgggg',
      'gggHHHHHggg',
      'ggggggggggg',
      '.ggggggggg.',
      '...gggg....',
    ],
  },
  yellow: {
    id: 'yellow', origin: [26, 2], tilemap: 2,
    map: [
      '..gggggg...',
      '.gggggggggg',
      'ggggHHHgggg',
      'gggHHHHHggg',
      'ggggggggggg',
      '.gggggggg..',
      '...ggggg...',
    ],
  },
  black: {
    id: 'black', origin: [6, 17], tilemap: 4,
    map: [
      '...gggggg..',
      '.ggggggggg.',
      'gggHHHHgggg',
      'ggHHHHHHggg',
      'ggggggggggg',
      '.ggggggggg.',
      '..gggggg...',
    ],
  },
};

/** 拠点（建物）の配置: タイル座標（島の原点からの相対、足元中心） */
export const RIVAL_FORTS: { sprite: string; x: number; y: number }[] = [
  { sprite: 'house2', x: 1.6, y: 5.6 },
  { sprite: 'tower', x: 9.2, y: 4.6 },
  { sprite: 'house3', x: 8.4, y: 6.4 },
  { sprite: 'barracks', x: 1.6, y: 3.7 },
  { sprite: 'castle', x: 5.6, y: 3.85 },
];
