import Phaser from 'phaser';
import { Rng } from '../core/Rng';
import { ARENA_H, ARENA_W, BRIDGES, RIVER_BOTTOM, RIVER_TOP, TOWER_SLOTS } from '../systems/Arena';
import { ARENA_X, ARENA_Y, HUD_Y, TILE } from './layout';
import { GAME_W } from './theme';

/** 地形（芝・川・橋・装飾）を1枚のテクスチャに焼き込んで表示する */
export function buildArenaBackground(scene: Phaser.Scene): Phaser.GameObjects.Image {
  const key = 'arena_bg';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const W = GAME_W;
  const H = HUD_Y;
  const dt = scene.textures.addDynamicTexture(key, W, H)!;
  const rng = new Rng(20240611);
  const s = TILE / 16;
  const stamp = (k: string, px: number, py: number, extra: Phaser.Types.Textures.StampConfig = {}) => {
    if (!scene.textures.exists(k)) return;
    dt.stamp(k, undefined, px, py, { originX: 0, originY: 0, scale: s, ...extra });
  };

  // 画面全体（左右の余白も含む）を芝で埋める
  const cols = Math.ceil(W / TILE);
  const rows = Math.ceil(H / TILE) + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = rng.next();
      const k = v < 0.82 ? 'tile_grass_0' : v < 0.94 ? 'tile_grass_1' : 'tile_grass_2';
      stamp(k, c * TILE, r * TILE - (TILE - (ARENA_Y % TILE)));
    }
  }
  // 余白は少し暗くして森にする
  dt.fill(0x0b1a10, 0.35, 0, 0, ARENA_X, H);
  dt.fill(0x0b1a10, 0.35, ARENA_X + ARENA_W * TILE, 0, W - ARENA_X - ARENA_W * TILE, H);
  for (let r = 0; r < rows; r++) {
    for (const baseX of [0, ARENA_X + ARENA_W * TILE]) {
      for (let c = 0; c < 2; c++) {
        if (rng.next() < 0.55) {
          const k = rng.pick(['tile_tree_pine', 'tile_tree_round', 'tile_bush', 'tile_tree_pine']);
          stamp(k, baseX + c * (TILE + 4) + rng.range(-4, 4), r * TILE + rng.range(-6, 6));
        }
      }
    }
  }

  const ax = (x: number) => ARENA_X + x * TILE;
  const ay = (y: number) => ARENA_Y + y * TILE;

  // 塔の土台まわりと通り道を土にする
  for (const t of TOWER_SLOTS) {
    const h = t.size / 2 + 0.5;
    for (let yy = Math.floor(t.y - h); yy < Math.ceil(t.y + h); yy++) {
      for (let xx = Math.floor(t.x - h); xx < Math.ceil(t.x + h); xx++) {
        if (xx >= 0 && xx < ARENA_W && yy >= 0 && yy < ARENA_H) stamp('tile_dirt', ax(xx), ay(yy), { alpha: 0.9 });
      }
    }
  }
  for (const b of BRIDGES) {
    const x0 = Math.round(b.x - 0.5);
    for (let yy = 7; yy < 25; yy++) {
      if (yy >= RIVER_TOP && yy < RIVER_BOTTOM) continue;
      stamp('tile_dirt', ax(x0), ay(yy), { alpha: 0.55 });
    }
  }

  // 川（上下の岸＋水面）
  for (let c = 0; c < ARENA_W; c++) {
    stamp('tile_shore_top', ax(c), ay(RIVER_TOP - 1));
    stamp(c % 3 === 0 ? 'tile_water_alt' : 'tile_water', ax(c), ay(RIVER_TOP));
    stamp(c % 4 === 1 ? 'tile_water_alt' : 'tile_water', ax(c), ay(RIVER_TOP + 1));
    stamp('tile_shore_bottom', ax(c), ay(RIVER_BOTTOM));
  }
  // 橋（板の通路＋欄干）
  for (const b of BRIDGES) {
    const left = b.x - b.halfWidth;
    for (let yy = RIVER_TOP - 1; yy <= RIVER_BOTTOM; yy++) {
      for (let i = 0; i < b.halfWidth * 2; i++) stamp('tile_dirt', ax(left + i), ay(yy));
      stamp('tile_fence_v', ax(left) - TILE * 0.45, ay(yy));
      stamp('tile_fence_v', ax(left + b.halfWidth * 2) - TILE * 0.55, ay(yy));
    }
  }

  // 装飾（キノコ・茂み）を陣地内に少し
  for (let i = 0; i < 22; i++) {
    const x = rng.range(0.5, ARENA_W - 1.5);
    const y = rng.range(0.5, ARENA_H - 1.5);
    if (y > RIVER_TOP - 1.5 && y < RIVER_BOTTOM + 1.5) continue;
    if (TOWER_SLOTS.some((t) => Math.abs(t.x - x) < t.size / 2 + 1.2 && Math.abs(t.y - y) < t.size / 2 + 1.2)) continue;
    if (BRIDGES.some((b) => Math.abs(b.x - x) < 1.4)) continue;
    stamp(rng.next() < 0.5 ? 'tile_mushroom' : 'tile_bush', ax(x), ay(y), { alpha: 0.9, scale: s * 0.8 });
  }

  // 中央線（自陣の境目の目安）
  dt.fill(0x000000, 0.25, ax(0), ay(0) - 2, ARENA_W * TILE, 2);
  dt.fill(0x000000, 0.25, ax(0), ay(ARENA_H), ARENA_W * TILE, 2);
  dt.render();
  return scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-1000);
}
