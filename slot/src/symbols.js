// 図柄の Canvas 描画 (リール帯・LCD・配当表で共用)
const DISPLAY = 'Bungee, Impact, sans-serif';

export function drawSymbol(ctx, key, cx, cy, size, images, pixel = false) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.imageSmoothingEnabled = !pixel;
  const img = (n) => images[n];
  const drawImg = (im, s = 0.82) => {
    const k = (size * s) / Math.max(im.width, im.height);
    const w = im.width * k, h = im.height * k;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = size * 0.05;
    ctx.shadowOffsetY = size * 0.025;
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
  };
  const usePixel = pixel && img(nameOf(key));
  if (usePixel) {
    drawImg(img(nameOf(key)), 0.86);
  } else if (key === 'R') {
    seven(ctx, size, true);
  } else if (key === 'A') {
    bar(ctx, size);
  } else if (key === 'P') {
    replay(ctx, size, img('replay'));
  } else {
    const im = img(nameOf(key));
    if (im) drawImg(im, key === 'G' ? 0.84 : key === 'J' ? 0.8 : 0.78);
  }
  ctx.restore();
}

function nameOf(k) {
  return { R: 'red7', A: 'bar', G: 'grape', L: 'bell', J: 'clown', C: 'cherry', P: 'replay' }[k];
}

function seven(ctx, size, red) {
  ctx.font = `${size * 0.95}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
  if (red) { g.addColorStop(0, '#ff7a6b'); g.addColorStop(0.45, '#e3001b'); g.addColorStop(1, '#7a0010'); }
  else { g.addColorStop(0, '#8fd3ff'); g.addColorStop(0.45, '#0a5cff'); g.addColorStop(1, '#03205e'); }
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = size * 0.06;
  ctx.shadowOffsetY = size * 0.03;
  ctx.lineWidth = size * 0.11;
  ctx.strokeStyle = '#1a1206';
  ctx.strokeText('7', 0, size * 0.04);
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = size * 0.06;
  const gold = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
  gold.addColorStop(0, '#fff6c0'); gold.addColorStop(0.5, '#e8b432'); gold.addColorStop(1, '#8a5a00');
  ctx.strokeStyle = gold;
  ctx.strokeText('7', 0, size * 0.04);
  ctx.fillStyle = g;
  ctx.fillText('7', 0, size * 0.04);
  // ハイライト
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-size / 2, -size / 2, size, size * 0.38);
  ctx.globalCompositeOperation = 'source-over';
}

function bar(ctx, size) {
  const w = size * 0.92, h = size * 0.46;
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.18);
  ctx.fillStyle = '#121212';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = size * 0.05;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = size * 0.04;
  const gold = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  gold.addColorStop(0, '#fff3b0'); gold.addColorStop(0.5, '#d9a21b'); gold.addColorStop(1, '#7c4d00');
  ctx.strokeStyle = gold;
  ctx.stroke();
  ctx.font = `${size * 0.36}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = gold;
  ctx.fillText('BAR', 0, size * 0.02);
}

function replay(ctx, size, icon) {
  if (icon) {
    const s = size * 0.42;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(icon, -s / 2, -size * 0.36, s, s);
    ctx.globalAlpha = 1;
  }
  ctx.font = `${size * 0.25}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('REPLAY', 0, size * 0.22);
  ctx.fillStyle = '#1565ff';
  ctx.fillText('REPLAY', 0, size * 0.22);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// リール帯テクスチャ: index i を下から上へ (上段 = i+1) 並べる → canvas 上端が最大 index
export function makeReelCanvas(strip, images, pixel) {
  const cell = 192, w = 400, n = strip.length;
  const c = document.createElement('canvas');
  c.width = w; c.height = cell * n;
  const ctx = c.getContext('2d');
  // 帯の地色 (乳白色のリールシート)
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#bdb8ab'); g.addColorStop(0.5, '#ece7da'); g.addColorStop(1, '#bdb8ab');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, c.height);
  for (let i = 0; i < n; i++) {
    const row = n - 1 - i;
    const cy = row * cell + cell / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, row * cell, w, 2);
    drawSymbol(ctx, strip[i], w / 2, cy, cell * 0.98, images, pixel);
  }
  return c;
}
