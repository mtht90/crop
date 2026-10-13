// 外部素材（Ninja Adventure Asset Pack / CC0）の読み込みと描画ヘルパ。
// layout:
//   dir4  … 列=向き(下,上,左,右) × 行=歩行フレーム のシート
//   strip … 横一列のアニメーション
//   single… 1枚絵
const A = 'assets/';

export const SPR = {
  // ---- プレイヤー・式神 ----
  player:      { src: 'chars/player.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 2.4 },
  kami:        { src: 'chars/kami.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 1.9 },
  karasu:      { src: 'chars/karasu.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 2.1 },
  byakko:      { src: 'chars/byakko.png', layout: 'strip', fw: 17, fh: 15, n: 2, scale: 2.2, faceLeft: true },
  zenki:       { src: 'chars/zenki.png', layout: 'strip', fw: 96, fh: 48, n: 6, scale: 1.25 },
  zenkiAtk:    { src: 'chars/zenki_attack.png', layout: 'strip', fw: 96, fh: 96, n: 4, scale: 1.25 },
  // ---- 妖怪 ----
  onibi:       { src: 'yokai/onibi.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 1.9 },
  kooni:       { src: 'yokai/kooni.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 2.1 },
  hitotsume:   { src: 'yokai/hitotsume.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 2.3 },
  kappa:       { src: 'yokai/kappa.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 2.2 },
  chochin:     { src: 'yokai/chochin.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 2.3 },
  gashadokuro: { src: 'yokai/gashadokuro.png', layout: 'dir4', fw: 16, fh: 16, n: 4, scale: 2.6 },
  oni:         { src: 'yokai/oni.png', layout: 'strip', fw: 50, fh: 50, n: 6, scale: 2 },
  tengu:       { src: 'yokai/tengu_walk.png', layout: 'strip', fw: 82, fh: 82, n: 10, scale: 2.7 },
  tenguAtk:    { src: 'yokai/tengu_attack.png', layout: 'strip', fw: 82, fh: 82, n: 15, scale: 2.7 },
  tenguHit:    { src: 'yokai/tengu_hit.png', layout: 'strip', fw: 82, fh: 82, n: 8, scale: 2.7 },
  // ---- 弾・エフェクト ----
  ofuda:       { src: 'items/scroll.png', layout: 'single', fw: 14, fh: 14, n: 1, scale: 1.4 },
  arrow:       { src: 'fx/arrow.png', layout: 'single', fw: 13, fh: 5, n: 1, scale: 2.6 },
  feather:     { src: 'fx/kunai.png', layout: 'single', fw: 14, fh: 5, n: 1, scale: 1.8 },
  fireball:    { src: 'fx/fireball.png', layout: 'strip', fw: 16, fh: 16, n: 4, scale: 1.7 },
  energy:      { src: 'fx/energyball.png', layout: 'strip', fw: 16, fh: 16, n: 4, scale: 1.6 },
  foxfire:     { src: 'fx/spirit_blue.png', layout: 'strip', fw: 32, fh: 32, n: 5, scale: 1.3 },
  smoke:       { src: 'fx/smoke.png', layout: 'strip', fw: 32, fh: 32, n: 6, scale: 1.3 },
  explosion:   { src: 'fx/explosion.png', layout: 'strip', fw: 40, fh: 40, n: 9, scale: 2 },
  thunder:     { src: 'fx/thunder.png', layout: 'strip', fw: 20, fh: 28, n: 8, scale: 3 },
  boost:       { src: 'fx/boost.png', layout: 'strip', fw: 53, fh: 35, n: 8, scale: 3 },
  circle:      { src: 'fx/circle.png', layout: 'strip', fw: 32, fh: 32, n: 4, scale: 1 },
  circleSpark: { src: 'fx/circle_spark.png', layout: 'strip', fw: 32, fh: 32, n: 6, scale: 2 },
  aura:        { src: 'fx/aura.png', layout: 'strip', fw: 25, fh: 24, n: 5, scale: 1 },
  cut:         { src: 'fx/cut.png', layout: 'strip', fw: 32, fh: 32, n: 4, scale: 1.2 },
  spark:       { src: 'fx/spark.png', layout: 'strip', fw: 10, fh: 8, n: 7, scale: 1 },
  leaf:        { src: 'fx/leaf_pink.png', layout: 'strip', fw: 12, fh: 7, n: 6, scale: 2 },
  // ---- アイテム ----
  gem0:        { src: 'items/gem_green.png', layout: 'single', fw: 15, fh: 15, n: 1, scale: 0.8 },
  gem1:        { src: 'items/gem_yellow.png', layout: 'single', fw: 15, fh: 15, n: 1, scale: 1 },
  gem2:        { src: 'items/gem_red.png', layout: 'single', fw: 15, fh: 15, n: 1, scale: 1.2 },
  gem3:        { src: 'items/gem_purple.png', layout: 'single', fw: 15, fh: 15, n: 1, scale: 1.5 },
  heal:        { src: 'items/onigiri.png', layout: 'single', fw: 16, fh: 16, n: 1, scale: 2 },
  magnet:      { src: 'items/gourd.png', layout: 'single', fw: 0, fh: 0, n: 1, scale: 2 },
  bomb:        { src: 'items/scroll_thunder.png', layout: 'single', fw: 16, fh: 16, n: 1, scale: 2.2 },
  chest:       { src: 'items/chest.png', layout: 'strip', fw: 16, fh: 16, n: 2, scale: 2.4 },
  face:        { src: 'chars/player_face.png', layout: 'single', fw: 38, fh: 38, n: 1, scale: 1 },
  tenguFace:   { src: 'yokai/tengu_face.png', layout: 'single', fw: 38, fh: 38, n: 1, scale: 1 },
};

// パーティクル用：火花スプライトを色付けしたもの
export const PALETTE = ['#ffd35a', '#ff5a3d', '#7fd7ff', '#ffffff', '#c77dff', '#7dffb0', '#ff3d6e', '#ffe9b0', '#6fa8ff'];
export const SPARKS = [];

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('素材の読み込みに失敗: ' + url));
    im.src = url;
  });
}

function toCanvas(im) {
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  c.getContext('2d').drawImage(im, 0, 0);
  return c;
}
function tinted(src, color, mode = 'source-atop', alpha = 1) {
  const c = toCanvas(src);
  const g = c.getContext('2d');
  g.globalCompositeOperation = mode;
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export async function loadAssets(onProgress) {
  const keys = Object.keys(SPR);
  let done = 0;
  await Promise.all(keys.map(async (k) => {
    const s = SPR[k];
    const im = await loadImage(A + s.src);
    s.img = toCanvas(im);
    if (!s.fw) { s.fw = im.width; s.fh = im.height; }
    s.white = tinted(s.img, '#ffffff');
    s.w = s.fw * s.scale;
    s.h = s.fh * s.scale;
    onProgress && onProgress(++done / keys.length);
  }));
  for (const col of PALETTE) SPARKS.push(tinted(SPR.spark.img, col, 'source-atop', 0.65));
}

// 方向インデックス（dir4 の列）：0=下 1=上 2=左 3=右
export function dirOf(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 2 : 3;
  return dy < 0 ? 1 : 0;
}

// (x, y) を中心に描画。opts: frame, dir, flash, scale, flip, sx, sy, img
export function draw(ctx, s, x, y, frame = 0, dir = 0, flash = false, k = 1, flip = false, sx = 1, sy = 1) {
  const f = ((frame % s.n) + s.n) % s.n;
  let ox = 0, oy = 0;
  if (s.layout === 'dir4') { ox = dir * s.fw; oy = f * s.fh; }
  else if (s.layout === 'strip') ox = f * s.fw;
  const w = s.w * k * sx, h = s.h * k * sy;
  const img = flash ? s.white : s.img;
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, ox, oy, s.fw, s.fh, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(img, ox, oy, s.fw, s.fh, x - w / 2, y - h / 2, w, h);
  }
}

// 回転つき描画（弾など）
export function drawRot(ctx, s, x, y, rot, frame = 0, k = 1) {
  const f = ((frame % s.n) + s.n) % s.n;
  const ox = s.layout === 'strip' ? f * s.fw : 0;
  const w = s.w * k, h = s.h * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(s.img, ox, 0, s.fw, s.fh, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// UI 用：スプライトの1フレームを小さなキャンバスに描いて返す
export function iconCanvas(key, size = 48, frame = 0, dir = 0) {
  const s = SPR[key];
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const k = Math.min(size / s.fw, size / s.fh);
  const sc = { ...s, w: s.fw * k, h: s.fh * k };
  draw(g, sc, size / 2, size / 2, frame, dir);
  return c;
}

// ---- 地面：タイルセットから 1024x1024（ワールド単位）の夜の野原を組み立てる ----
export function buildGround() {
  const T = 32, N = 32;
  const c = document.createElement('canvas');
  c.width = T * N; c.height = T * N;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const floor = SPR._floor, nature = SPR._nature;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const grass = [[11, 12], [11, 12], [11, 12], [12, 12], [13, 12], [14, 12], [15, 12]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [tx, ty] = grass[(rnd() * grass.length) | 0];
    g.drawImage(floor, tx * 16, ty * 16, 16, 16, x * T, y * T, T, T);
  }
  // 草むら・花・石・竹
  const decor = [[0, 10], [1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [7, 10], [0, 11], [1, 11], [3, 11], [6, 11], [4, 11], [5, 11], [4, 13], [4, 8]];
  for (let i = 0; i < 70; i++) {
    const [tx, ty] = decor[(rnd() * decor.length) | 0];
    g.drawImage(nature, tx * 16, ty * 16, 16, 16, (rnd() * N | 0) * T, (rnd() * N | 0) * T, T, T);
  }
  for (let i = 0; i < 3; i++) {
    const x = (rnd() * N | 0) * T, y = (rnd() * (N - 3) | 0) * T;
    g.drawImage(nature, 11 * 16, 8 * 16, 16, 48, x, y, T, T * 3);
    g.drawImage(nature, 11 * 16, 8 * 16, 16, 48, x + T * 0.7, y + T * 0.6, T, T * 3);
  }
  // 夜の色調
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#6a76bc';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export async function loadTiles() {
  SPR._floor = toCanvas(await loadImage(A + 'tiles/floor.png'));
  SPR._nature = toCanvas(await loadImage(A + 'tiles/nature.png'));
}
