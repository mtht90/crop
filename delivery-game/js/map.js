// 街の地図：タイル生成・描画・経路探索
'use strict';

const TOWN = (() => {
  const W = DATA.MAP_W, H = DATA.MAP_H, T = 16, SCALE = 2;
  const SHEET_COLS = 37;

  // Kenney Roguelike Modern City のタイル番号
  const TILE = {
    grass: [888, 888, 888, 889],
    sidewalk: [703, 703, 704, 703, 705],
    plaza: 746,
    path: 744,
    asphalt: 714,
    crossV: 823, // 縦道路を横切る横断歩道
    crossH: 826, // 横道路を横切る横断歩道
    roof: { red: 4, gray: 12, light: 20, beige: 28 },
    wall: { red: 187, gray: 191, beige: 195, glass: 236 },
    window: { red: 617, gray: 728, beige: 617, glass: 0 },
    door: { red: 1019, gray: 1022, beige: 1025, glass: 874 },
    awning: { green: 467, orange: 471 },
    treeTop: [401, 403, 402], treeBottom: [438, 440, 439],
    bush: [512, 514, 513],
    cone: 717,
    barrier: 246,
    bench: 572,
    box: 605,
  };
  // 車のスプライト（シート上のピクセル矩形）
  const CAR = {
    orangeSideL: [503, 392, 36, 24], orangeSideR: [549, 392, 36, 24],
    orangeFront: [501, 418, 22, 29], orangeBack: [533, 418, 22, 29],
    greenSide: [503, 264, 36, 24], graySide: [549, 328, 36, 24],
    greenFront: [501, 290, 22, 29], grayBack: [533, 354, 22, 29],
  };

  const ROW_LAYOUT = {
    // roofTop: 通常の屋根の上端, tallTop: 背の高い建物の屋根上端, facade: 正面の行, yard: 前庭, road: 正面の道路（停車する車線）
    n: { roofTop: 0, tallTop: 0, facade: 2, yard: 3, road: 5 },
    1: { roofTop: 9, tallTop: 8, facade: 11, yard: 12, road: 14 },
    2: { roofTop: 18, tallTop: 17, facade: 20, yard: 21, road: 23 },
  };
  const BLOCKS_X = [[3, 11], [14, 22], [25, 32]];
  const BLOCKS_Y = [[7, 13], [16, 22]];

  let sheet = null, chars = null;
  const ground = [];   // [y][x] tile id
  const deco = [];     // {tile, x, y} 追加で描く装飾
  const roadMask = []; // [y][x] bool
  let staticCanvas = null;

  function rnd(seed) { // 決定的な疑似乱数（地図の見た目用）
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function isRoad(x, y) { return y >= 0 && y < H && x >= 0 && x < W && roadMask[y][x]; }

  function buildLayout() {
    const r = rnd(42);
    for (let y = 0; y < H; y++) {
      ground[y] = []; roadMask[y] = [];
      for (let x = 0; x < W; x++) {
        ground[y][x] = TILE.grass[Math.floor(r() * TILE.grass.length)];
        roadMask[y][x] = false;
      }
    }
    // 道路
    for (const ry of DATA.ROADS_H) for (let x = 1; x <= 34; x++) for (const y of [ry, ry + 1]) roadMask[y][x] = true;
    for (const rx of DATA.ROADS_V) for (let y = 5; y <= 24; y++) for (const x of [rx, rx + 1]) roadMask[y][x] = true;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (roadMask[y][x]) ground[y][x] = TILE.asphalt;

    // 歩道（ブロックの外周）
    const sw = () => TILE.sidewalk[Math.floor(r() * TILE.sidewalk.length)];
    for (const [bx0, bx1] of BLOCKS_X) {
      for (const [by0, by1] of BLOCKS_Y) {
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
          if (x === bx0 || x === bx1 || y === by0 || y === by1) ground[y][x] = sw();
        }
      }
      for (let x = bx0; x <= bx1; x++) ground[4][x] = sw();
    }
    // 横断歩道（交差点の手前）
    for (const ry of DATA.ROADS_H) for (const rx of DATA.ROADS_V) {
      for (const y of [ry, ry + 1]) {
        if (rx - 1 >= 1 && roadMask[y][rx - 1]) ground[y][rx - 1] = TILE.crossH;
        if (rx + 2 <= 34 && roadMask[y][rx + 2]) ground[y][rx + 2] = TILE.crossH;
      }
      for (const x of [rx, rx + 1]) {
        if (ry - 1 >= 5 && roadMask[ry - 1][x]) ground[ry - 1][x] = TILE.crossV;
        if (ry + 2 <= 24 && roadMask[ry + 2][x]) ground[ry + 2][x] = TILE.crossV;
      }
    }

    // 建物
    for (const b of DATA.BUILDINGS) {
      const L = ROW_LAYOUT[b.row];
      b.roofY = b.tall ? L.tallTop : L.roofTop;
      b.facadeY = L.facade;
      b.doorX = b.x + Math.floor((b.w - 1) / 2);
      b.stop = { x: b.doorX, y: L.road };
      b.rect = { x: b.x, y: b.roofY, w: b.w, h: L.yard - b.roofY + 1 };
      if (b.kind === 'park') { buildPark(b, r); continue; }
      // 前庭の小道
      ground[L.yard][b.doorX] = TILE.path;
      if (b.kind === 'office') {
        for (let x = b.x; x < b.x + b.w; x++) ground[L.yard][x] = TILE.plaza;
      }
      // 裏庭の木
      if (b.row !== 'n' && !b.tall && r() < 0.8) {
        const t = Math.floor(r() * 3);
        deco.push({ tile: TILE.bush[t], x: b.x + Math.floor(r() * b.w), y: b.roofY - 1 });
      }
      // 前庭の植え込み
      if (b.w >= 3 && b.kind === 'house') deco.push({ tile: TILE.bush[Math.floor(r() * 3)], x: b.x + b.w - 1, y: L.yard });
    }
    // 北側エリアの並木
    for (const x of [1, 11, 12, 33, 34]) { deco.push({ tile: TILE.treeTop[0], x, y: 2 }); deco.push({ tile: TILE.treeBottom[0], x, y: 3 }); }
    // 下端の並木
    for (let x = 2; x < 34; x += 4) { deco.push({ tile: TILE.bush[x % 3], x, y: 25 }); }
  }

  function buildPark(b, r) {
    for (let y = 0; y <= 3; y++) for (let x = b.x; x < b.x + b.w; x++) ground[y][x] = TILE.grass[0];
    for (let x = b.x; x < b.x + b.w; x++) ground[3][x] = TILE.path;
    for (let y = 0; y <= 3; y++) ground[y][b.x + 3] = TILE.path;
    const trees = [[b.x, 0], [b.x + 1, 0], [b.x + 5, 0], [b.x + 7, 0], [b.x + 6, 1]];
    trees.forEach(([x, y], i) => { deco.push({ tile: TILE.treeTop[i % 3], x, y }); deco.push({ tile: TILE.treeBottom[i % 3], x, y: y + 1 }); });
    deco.push({ tile: TILE.bush[0], x: b.x + 2, y: 2 });
    deco.push({ tile: TILE.bench, x: b.x + 4, y: 2 });
  }

  // ---- 描画 ----
  function drawTile(ctx, id, x, y) {
    if (!id && id !== 0) return;
    const sx = (id % SHEET_COLS) * T, sy = Math.floor(id / SHEET_COLS) * T;
    ctx.drawImage(sheet, sx, sy, T, T, x * T, y * T, T, T);
  }
  function drawSprite(ctx, rect, px, py, flip) {
    const [sx, sy, w, h] = rect;
    ctx.save();
    if (flip) { ctx.translate(px + w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(px + w / 2), 0); }
    ctx.drawImage(sheet, sx, sy, w, h, Math.round(px), Math.round(py), w, h);
    ctx.restore();
  }

  function renderStatic() {
    staticCanvas = document.createElement('canvas');
    staticCanvas.width = W * T; staticCanvas.height = H * T;
    const ctx = staticCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) drawTile(ctx, ground[y][x], x, y);
    // 道路の中央線
    ctx.fillStyle = 'rgba(240,240,232,0.85)';
    for (const ry of DATA.ROADS_H) {
      for (let x = 1; x <= 34; x++) {
        if (DATA.ROADS_V.some(v => x >= v - 1 && x <= v + 2)) continue;
        ctx.fillRect(x * T + 3, (ry + 1) * T - 1, 9, 2);
      }
    }
    for (const rx of DATA.ROADS_V) {
      for (let y = 5; y <= 24; y++) {
        if (DATA.ROADS_H.some(h => y >= h - 1 && y <= h + 2)) continue;
        ctx.fillRect((rx + 1) * T - 1, y * T + 3, 2, 9);
      }
    }
    // 建物
    for (const b of DATA.BUILDINGS) {
      if (b.kind === 'park') continue;
      const roof = TILE.roof[b.roof], wall = TILE.wall[b.wall];
      for (let y = b.roofY; y < b.facadeY; y++) for (let x = b.x; x < b.x + b.w; x++) drawTile(ctx, roof, x, y);
      // 屋根の縁取り
      ctx.strokeStyle = 'rgba(40,36,32,0.55)'; ctx.lineWidth = 1;
      ctx.strokeRect(b.x * T + 0.5, b.roofY * T + 0.5, b.w * T - 1, (b.facadeY - b.roofY) * T - 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(b.x * T + 1, b.roofY * T + 1, b.w * T - 2, 2);
      for (let x = b.x; x < b.x + b.w; x++) {
        drawTile(ctx, wall, x, b.facadeY);
        if (x === b.doorX) drawTile(ctx, TILE.door[b.wall], x, b.facadeY);
        else if (TILE.window[b.wall]) drawTile(ctx, TILE.window[b.wall], x, b.facadeY);
      }
      if (b.awning) for (let x = b.x; x < b.x + b.w; x++) if (x !== b.doorX) drawTile(ctx, TILE.awning[b.awning], x, b.facadeY);
      // 正面の影
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(b.x * T, (b.facadeY + 1) * T, b.w * T, 2);
    }
    for (const d of deco) drawTile(ctx, d.tile, d.x, d.y);
    // 営業所の駐車車両
    const off = DATA.BUILDINGS.find(b => b.id === 'office');
    drawSprite(ctx, CAR.graySide, (off.x + off.w) * T + 2, 2 * T + 4, false);
  }

  // ---- 経路探索（道路マスのダイクストラ法） ----
  // opts: { closures:Set("x,y"), time:分, congestion:bool }
  function tileCost(x, y, opts) {
    let c = 1;
    if (opts.congestion && opts.time != null) {
      for (const z of CONGESTION) {
        if (z.test(x, y) && z.times.some(([a, b]) => opts.time >= a && opts.time < b)) c *= z.mult;
      }
    }
    return c;
  }
  // 左側通行：進行方向に対して逆側の車線は少しコストを上げる
  function laneCost(fx, fy, tx, ty) {
    const dx = tx - fx, dy = ty - fy;
    const hRoad = DATA.ROADS_H.find(r => ty === r || ty === r + 1);
    const vRoad = DATA.ROADS_V.find(r => tx === r || tx === r + 1);
    if (dx !== 0 && hRoad != null && vRoad == null) {
      const top = ty === hRoad;
      if ((dx > 0 && !top) || (dx < 0 && top)) return 0.35;
    }
    if (dy !== 0 && vRoad != null && hRoad == null) {
      const left = tx === vRoad;
      if ((dy < 0 && !left) || (dy > 0 && left)) return 0.35;
    }
    return 0;
  }

  function findPath(from, to, opts = {}) {
    const closures = opts.closures || new Set();
    const key = (x, y) => y * W + x;
    const dist = new Map(), prev = new Map();
    const start = key(from.x, from.y), goal = key(to.x, to.y);
    dist.set(start, 0);
    const open = [[0, from.x, from.y]];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, x, y] = open.splice(bi, 1)[0];
      const k = key(x, y);
      if (d > (dist.get(k) ?? Infinity)) continue;
      if (k === goal) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!isRoad(nx, ny) || closures.has(nx + ',' + ny)) continue;
        // 時刻による渋滞は、その地点に着く頃の時刻で概算
        const t = opts.time != null ? opts.time + d * DATA.MIN_PER_TILE : null;
        const nd = d + tileCost(nx, ny, { ...opts, time: t }) + laneCost(x, y, nx, ny);
        const nk = key(nx, ny);
        if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, k); open.push([nd, nx, ny]); }
      }
    }
    if (!dist.has(goal)) return null;
    const path = [];
    let k = goal;
    while (k !== undefined) { path.push({ x: k % W, y: Math.floor(k / W) }); k = prev.get(k); }
    path.reverse();
    return path;
  }

  // 経路の所要時間（分）。渋滞は実際の時刻で計算。
  function pathMinutes(path, startTime) {
    let t = 0;
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      t += DATA.MIN_PER_TILE * tileCost(p.x, p.y, { congestion: true, time: startTime + t });
    }
    return t;
  }

  // ---- 渋滞・通行止め ----
  const CONGESTION = [
    { name: 'あおば商店街通り', test: (x, y) => (y === 14 || y === 15) && x >= 14 && x <= 22, times: [[12 * 60, 13 * 60], [17 * 60, 18 * 60 + 30]], mult: 3 },
    { name: '駅前通り（北）', test: (x, y) => (x === 12 || x === 13) && y >= 5 && y <= 13, times: [[8 * 60 + 30, 9 * 60 + 40], [17 * 60 + 30, 18 * 60 + 30]], mult: 2.5 },
  ];
  // 停車地点を含まない縦道路の区間
  const SEGMENTS = [
    { id: 'v1a', name: '西通り（1丁目北）', rx: 1, y0: 7, y1: 13 },
    { id: 'v1b', name: '西通り（1丁目南）', rx: 1, y0: 16, y1: 22 },
    { id: 'v2a', name: '駅前通り（中央）', rx: 12, y0: 7, y1: 13 },
    { id: 'v2b', name: '駅前通り（南）', rx: 12, y0: 16, y1: 22 },
    { id: 'v3a', name: '桜通り（北）', rx: 23, y0: 7, y1: 13 },
    { id: 'v3b', name: '桜通り（南）', rx: 23, y0: 16, y1: 22 },
    { id: 'v4a', name: '東通り（北）', rx: 33, y0: 7, y1: 13 },
    { id: 'v4b', name: '東通り（南）', rx: 33, y0: 16, y1: 22 },
  ];
  function segmentTiles(seg) {
    const out = [];
    for (let y = seg.y0; y <= seg.y1; y++) for (const x of [seg.rx, seg.rx + 1]) out.push(x + ',' + y);
    return out;
  }

  // ---- 実行時描画 ----
  function render(ctx, view) {
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.drawImage(staticCanvas, 0, 0);

    // 渋滞
    if (view.showCongestion) {
      for (const z of CONGESTION) {
        const active = z.times.some(([a, b]) => view.time >= a && view.time < b);
        const soon = z.times.some(([a, b]) => view.time < a && a - view.time <= 60);
        if (!active && !soon && !view.showAllCongestion) continue;
        ctx.fillStyle = active ? 'rgba(214,120,40,0.42)' : 'rgba(214,170,60,0.25)';
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (roadMask[y][x] && z.test(x, y)) ctx.fillRect(x * T, y * T, T, T);
      }
    }
    // 通行止め
    for (const seg of view.closedSegments || []) {
      ctx.fillStyle = 'rgba(160,60,50,0.28)';
      ctx.fillRect(seg.rx * T, seg.y0 * T, 2 * T, (seg.y1 - seg.y0 + 1) * T);
      drawTile(ctx, TILE.barrier, seg.rx, seg.y0); drawTile(ctx, TILE.barrier, seg.rx + 1, seg.y0);
      drawTile(ctx, TILE.barrier, seg.rx, seg.y1); drawTile(ctx, TILE.barrier, seg.rx + 1, seg.y1);
      drawTile(ctx, TILE.cone, seg.rx, Math.floor((seg.y0 + seg.y1) / 2));
      drawTile(ctx, TILE.cone, seg.rx + 1, Math.floor((seg.y0 + seg.y1) / 2) + 1);
    }
    // 計画ルート
    if (view.routePaths) {
      view.routePaths.forEach((p, i) => {
        if (!p) return;
        ctx.strokeStyle = i === 0 ? 'rgba(46,110,170,0.95)' : 'rgba(46,110,170,0.45)';
        ctx.lineWidth = i === 0 ? 3 : 2;
        ctx.setLineDash(i === 0 ? [] : [4, 3]);
        ctx.beginPath();
        p.forEach((pt, j) => {
          const px = pt.x * T + T / 2, py = pt.y * T + T / 2;
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    // 配達先ピン
    for (const pin of view.pins || []) drawPin(ctx, pin);
    // 選択中の建物
    if (view.hover) {
      const b = view.hover;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(b.rect.x * T - 1, b.rect.y * T - 1, b.rect.w * T + 2, b.rect.h * T + 2);
    }
    // 自分の車
    if (view.van) drawVan(ctx, view.van);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawPin(ctx, pin) {
    const b = pin.b;
    const cx = (b.doorX + 0.5) * T, cy = b.roofY * T - 2 + (b.roofY === 0 ? 14 : 0);
    const colors = { pending: '#2d4a66', next: '#2e6eaa', done: '#3f7d5a', returned: '#c27a2c', late: '#a8453a', office: '#5b5f66', redeliver: '#8a5aa8' };
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 9, 4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors[pin.state] || colors.pending;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 7, Math.PI, 0);
    ctx.lineTo(cx, cy + 9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px "Zen Maru Gothic", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pin.label, cx, cy - 1.5);
    if (pin.count > 1) {
      ctx.fillStyle = '#f2efe6';
      ctx.beginPath(); ctx.arc(cx + 7, cy - 8, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2d4a66'; ctx.font = 'bold 7px sans-serif';
      ctx.fillText('×' + pin.count, cx + 7, cy - 7.5);
    }
  }

  function drawVan(ctx, van) {
    const px = van.fx * T + T / 2, py = van.fy * T + T / 2;
    let rect, flip = false;
    if (van.dir === 'left') rect = CAR.orangeSideL;
    else if (van.dir === 'right') { rect = CAR.orangeSideL; flip = true; }
    else if (van.dir === 'up') rect = CAR.orangeBack;
    else rect = CAR.orangeFront;
    const [, , w, h] = rect;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(px, py + h / 2 - 3, w / 2 - 2, 3, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, rect, px - w / 2, py - h / 2 - 2, flip);
  }

  // ---- 似顔絵（Kenney Roguelike Characters を重ねて合成） ----
  function drawFace(canvas, face) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = canvas.width / 16;
    const part = (c, r) => ctx.drawImage(chars, c * 17, r * 17, 16, 16, 0, 0, 16 * s, 16 * s);
    if (!face) { part(0, 0); return; }
    const [skin, pants, shirt, hair] = face;
    part(0, skin);
    part(3, pants);
    part(shirt[0], shirt[1]);
    if (hair) part(hair[0], hair[1]);
  }

  function tileAt(px, py, canvas) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((px - rect.left) / rect.width * W);
    const y = Math.floor((py - rect.top) / rect.height * H);
    return { x, y };
  }
  function buildingAt(x, y) {
    return DATA.BUILDINGS.find(b => b.kind !== 'park' && x >= b.rect.x && x < b.rect.x + b.rect.w && y >= b.rect.y - 1 && y < b.rect.y + b.rect.h);
  }

  function drawTileIcon(canvas, id) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sheet, (id % SHEET_COLS) * T, Math.floor(id / SHEET_COLS) * T, T, T, 0, 0, canvas.width, canvas.height);
  }

  // 建物まわりを拡大した「現場の様子」
  function drawScene(canvas, b) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const L = ROW_LAYOUT[b.row];
    const x0 = Math.max(0, b.x - 1), y0 = Math.max(0, b.roofY - 1);
    const w = Math.min(W - x0, b.w + 2), h = Math.min(H - y0, L.road + 2 - y0);
    canvas.width = w * T * 3; canvas.height = h * T * 3;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staticCanvas, x0 * T, y0 * T, w * T, h * T, 0, 0, canvas.width, canvas.height);
    // 停車中の自分の車
    ctx.save(); ctx.scale(3, 3);
    drawSprite(ctx, CAR.orangeSideL, (b.stop.x - x0) * T - 10, (b.stop.y - y0) * T - 6, true);
    ctx.restore();
  }

  function load() {
    return Promise.all([
      new Promise((res, rej) => { sheet = new Image(); sheet.onload = res; sheet.onerror = rej; sheet.src = 'assets/img/city_tiles.png'; }),
      new Promise((res, rej) => { chars = new Image(); chars.onload = res; chars.onerror = rej; chars.src = 'assets/img/characters.png'; }),
    ]).then(() => { buildLayout(); renderStatic(); });
  }

  return {
    W, H, T, SCALE, TILE, CONGESTION, SEGMENTS, load, render, findPath, pathMinutes, segmentTiles,
    drawFace, drawScene, tileAt, buildingAt, drawTileIcon, building: id => DATA.BUILDINGS.find(b => b.id === id),
  };
})();
