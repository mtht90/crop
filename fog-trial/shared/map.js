// シード付きのマップ生成。サーバーで生成し、そのままクライアントへ送る。
// DbD の「ループ」(窓・パレットを使った追いかけっこポイント) をテンプレートで配置し、
// その間に発電機 (発電機)・フック (フック)・ロッカー (ロッカー) を散らす。

import { MAP_W, MAP_H, GEN } from './constants.js';

export const TILE = { FLOOR: 0, WALL: 1, WINDOW: 2, TREE: 3, GATE: 4 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// '#' 柵, 'W' 窓, 'P' 板 (パレット), 'T' 木, 'L' ロッカー, '.' 必ず床, ' ' 何もしない
const TEMPLATES = [
  {
    name: 'shack',
    rows: ['.........', '.###W###.', '.#.....#.', '.P.....#.', '.#.....W.', '.#..L..#.', '.###.###.', '.........'],
    weight: 1,
    max: 1,
  },
  {
    name: 'jungle',
    rows: ['.........', '.######..', '.#....#..', '.#....W..', '.#....#..', '.#.......', '.##P###..', '.........'],
    weight: 3,
  },
  {
    name: 'longwall',
    rows: ['...........', '.####W####.', '...........'],
    weight: 3,
  },
  {
    name: 'palletgap',
    rows: ['.......', '.##P##.', '.##.##.', '.......'],
    weight: 3,
  },
  {
    name: 'lwall',
    rows: ['........', '.#####..', '.#......', '.#......', '.P......', '.#......', '........'],
    weight: 3,
  },
  {
    name: 'treepallet',
    rows: ['.......', '.TT.TT.', '.TTPTT.', '.......'],
    weight: 2,
  },
  {
    name: 'sandwich',
    rows: ['.........', '.###W###.', '.........', '.##P##...', '.........'],
    weight: 2,
  },
  {
    name: 'grove',
    rows: ['      ', '.TT.T.', '.T....', '....T.', '      '],
    weight: 2,
  },
];

function rotate(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const out = [];
  for (let x = 0; x < w; x++) {
    let line = '';
    for (let y = h - 1; y >= 0; y--) line += rows[y][x];
    out.push(line);
  }
  return out;
}

function mirror(rows) {
  return rows.map((r) => r.split('').reverse().join(''));
}

function pickWeighted(rng, items) {
  const total = items.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of items) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

export function generateMap(seed = (Math.random() * 1e9) | 0) {
  const rng = mulberry32(seed);
  const W = MAP_W;
  const H = MAP_H;
  const tiles = new Array(W * H).fill(TILE.FLOOR);
  const used = new Array(W * H).fill(0); // テンプレートの占有領域
  const idx = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  for (let x = 0; x < W; x++) {
    tiles[idx(x, 0)] = TILE.WALL;
    tiles[idx(x, H - 1)] = TILE.WALL;
  }
  for (let y = 0; y < H; y++) {
    tiles[idx(0, y)] = TILE.WALL;
    tiles[idx(W - 1, y)] = TILE.WALL;
  }

  // 出口ゲートは左右の外周に 1 つずつ。前の空間は空けておく。
  const gates = [];
  for (const side of ['left', 'right']) {
    const gy = 8 + Math.floor(rng() * (H - 18));
    const gx = side === 'left' ? 0 : W - 1;
    const gateTiles = [
      [gx, gy],
      [gx, gy + 1],
    ];
    for (const [x, y] of gateTiles) tiles[idx(x, y)] = TILE.GATE;
    for (let y = gy - 2; y <= gy + 3; y++) {
      for (let k = 1; k <= 4; k++) {
        const x = side === 'left' ? k : W - 1 - k;
        if (inside(x, y)) used[idx(x, y)] = 2;
      }
    }
    gates.push({ id: gates.length, side, tiles: gateTiles, x: gx + 0.5, y: gy + 1 });
  }

  // スポーン予定地付近 (中央) も少し空ける
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) used[idx(x, y)] = 2;

  const counts = {};
  let placed = 0;
  for (let attempt = 0; attempt < 900 && placed < 26; attempt++) {
    const tpl = pickWeighted(rng, TEMPLATES);
    if (tpl.max && (counts[tpl.name] || 0) >= tpl.max) continue;
    let rows = tpl.rows;
    const rot = Math.floor(rng() * 4);
    for (let i = 0; i < rot; i++) rows = rotate(rows);
    if (rng() < 0.5) rows = mirror(rows);
    const th = rows.length;
    const tw = rows[0].length;
    const ox = 1 + Math.floor(rng() * (W - tw - 1));
    const oy = 1 + Math.floor(rng() * (H - th - 1));
    let ok = true;
    for (let y = 0; y < th && ok; y++) {
      for (let x = 0; x < tw; x++) {
        if (rows[y][x] === ' ') continue;
        const gx = ox + x;
        const gy = oy + y;
        if (gx < 1 || gy < 1 || gx >= W - 1 || gy >= H - 1 || used[idx(gx, gy)]) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const c = rows[y][x];
        if (c === ' ') continue;
        const i = idx(ox + x, oy + y);
        used[i] = 1;
        if (c === '#') tiles[i] = TILE.WALL;
        else if (c === 'T') tiles[i] = TILE.TREE;
        else if (c === 'W') tiles[i] = TILE.WINDOW;
        else if (c === 'P') tiles[i] = 'P';
        else if (c === 'L') tiles[i] = 'L';
        else tiles[i] = TILE.FLOOR;
      }
    }
    counts[tpl.name] = (counts[tpl.name] || 0) + 1;
    placed++;
  }

  // 散らばった木
  for (let i = 0; i < 70; i++) {
    const x = 2 + Math.floor(rng() * (W - 4));
    const y = 2 + Math.floor(rng() * (H - 4));
    if (!used[idx(x, y)] && tiles[idx(x, y)] === TILE.FLOOR) {
      tiles[idx(x, y)] = TILE.TREE;
      used[idx(x, y)] = 1;
    }
  }

  const isWallish = (x, y) => !inside(x, y) || tiles[idx(x, y)] === TILE.WALL || tiles[idx(x, y)] === TILE.TREE;

  // 窓と板の向きを決める。両側が壁でなければ無効化。
  const pallets = [];
  const windows = [];
  const lockers = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[idx(x, y)];
      if (t === TILE.WINDOW || t === 'P') {
        let axis = null; // 通り抜ける方向
        if (isWallish(x - 1, y) && isWallish(x + 1, y) && !isWallish(x, y - 1) && !isWallish(x, y + 1)) axis = 'v';
        else if (isWallish(x, y - 1) && isWallish(x, y + 1) && !isWallish(x - 1, y) && !isWallish(x + 1, y)) axis = 'h';
        if (t === TILE.WINDOW) {
          if (axis) windows.push({ x, y, axis });
          else tiles[idx(x, y)] = TILE.WALL;
        } else {
          tiles[idx(x, y)] = TILE.FLOOR;
          if (axis) pallets.push({ id: pallets.length, x, y, axis });
        }
      } else if (t === 'L') {
        tiles[idx(x, y)] = TILE.FLOOR;
        lockers.push({ id: lockers.length, x, y });
      }
    }
  }

  // 到達できない床を埋める (窓・板は通れるものとして扱う)
  const passable = (x, y) => inside(x, y) && (tiles[idx(x, y)] === TILE.FLOOR || tiles[idx(x, y)] === TILE.WINDOW);
  const seen = new Uint8Array(W * H);
  const queue = [[cx, cy]];
  seen[idx(cx, cy)] = 1;
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (passable(nx, ny) && !seen[idx(nx, ny)]) {
        seen[idx(nx, ny)] = 1;
        queue.push([nx, ny]);
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    if ((tiles[i] === TILE.FLOOR || tiles[i] === TILE.WINDOW) && !seen[i]) tiles[i] = TILE.TREE;
  }
  const palletsOk = pallets.filter((p) => seen[idx(p.x, p.y)]);
  const lockersOk = lockers.filter((l) => seen[idx(l.x, l.y)]);
  const windowsOk = windows.filter((w) => seen[idx(w.x, w.y)]);

  // 小物 (固体) を置ける場所: 周囲 8 マスがすべて床で、窓・板の隣でもない
  const special = new Set([...palletsOk, ...windowsOk, ...lockersOk].map((p) => idx(p.x, p.y)));
  const occupied = new Set(special);
  const isOpen = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny) || tiles[idx(nx, ny)] !== TILE.FLOOR || occupied.has(idx(nx, ny))) return false;
      }
    }
    return seen[idx(x, y)] && used[idx(x, y)] !== 2;
  };
  const candidates = () => {
    const out = [];
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (isOpen(x, y)) out.push({ x, y });
    return out;
  };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // 最遠点サンプリングで散らばるように配置
  function spread(n, minDistTo, avoid = []) {
    const chosen = [];
    for (let k = 0; k < n; k++) {
      const cands = candidates();
      if (!cands.length) break;
      let best = null;
      let bestScore = -Infinity;
      const sample = Math.min(cands.length, 160);
      for (let s = 0; s < sample; s++) {
        const c = cands[Math.floor(rng() * cands.length)];
        let dMin = 40;
        for (const o of chosen) dMin = Math.min(dMin, dist(o, c));
        let aMin = 40;
        for (const o of avoid) aMin = Math.min(aMin, dist(o, c));
        if (aMin < minDistTo) continue;
        const score = dMin + rng() * 2;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (!best) best = cands[Math.floor(rng() * cands.length)];
      chosen.push(best);
      occupied.add(idx(best.x, best.y));
    }
    return chosen;
  }

  const gateFront = gates.map((g) => ({ x: g.side === 'left' ? 2 : W - 3, y: g.y }));
  const gens = spread(GEN.count, 7, gateFront).map((p, i) => ({ id: i, x: p.x, y: p.y }));
  const cages = spread(10, 3, gens).map((p, i) => ({ id: i, x: p.x, y: p.y }));
  const extraLockers = spread(7, 3, [...gens, ...cages]);
  for (const p of extraLockers) lockersOk.push({ id: lockersOk.length, x: p.x, y: p.y });
  const hatchSpots = spread(3, 6, [...gens, ...gateFront]).map((p) => ({ x: p.x, y: p.y }));
  // ハッチ候補は固体ではないので占有を解除
  for (const h of hatchSpots) occupied.delete(idx(h.x, h.y));

  // スポーン: キラーは中央付近、サバイバーは四隅寄り
  const floorTiles = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (tiles[idx(x, y)] === TILE.FLOOR && seen[idx(x, y)] && !occupied.has(idx(x, y))) floorTiles.push({ x, y });
    }
  }
  const nearest = (tx, ty) => {
    let best = floorTiles[0];
    let bd = Infinity;
    for (const f of floorTiles) {
      const d = Math.hypot(f.x - tx, f.y - ty);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return { x: best.x + 0.5, y: best.y + 0.5 };
  };
  const killerSpawn = nearest(cx, cy);
  const corners = [
    [6, 6],
    [W - 7, 6],
    [6, H - 7],
    [W - 7, H - 7],
  ];
  const survivorSpawns = corners.map(([x, y]) => nearest(x, y));

  return {
    seed,
    w: W,
    h: H,
    tiles,
    pallets: palletsOk.map((p, i) => ({ ...p, id: i })),
    windows: windowsOk,
    gens,
    cages,
    lockers: lockersOk.map((l, i) => ({ ...l, id: i })),
    gates,
    hatchSpots,
    spawns: { killer: killerSpawn, survivors: survivorSpawns },
  };
}
