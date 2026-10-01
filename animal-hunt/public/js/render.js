// Canvas 2D の描画。ワールド座標はタイル単位で、カメラ変換で画面へ。
import { TILE, mulberry32 } from '/shared/map.js';
import { castRay } from '/shared/physics.js';
import { VISION } from '/shared/constants.js';
import { SURVIVOR_ANIMALS, HUNTER_ANIMAL } from '/shared/animals.js';

const SP = 40; // 静的レイヤーの 1 タイルあたりピクセル

const COLORS = {
  grass: '#9ad98b',
  grassDark: '#86cc79',
  hedge: '#3f8f57',
  hedgeTop: '#5fb072',
  hedgeShadow: 'rgba(30,60,40,0.35)',
  treeDark: '#2f7a48',
  treeLight: '#55b36d',
  trunk: '#8a5a3b',
  wood: '#b07a4f',
  woodLight: '#d39b67',
  woodDark: '#7a4f30',
};

export function animalLook(animal) {
  if (animal === 'wolf') return HUNTER_ANIMAL;
  return SURVIVOR_ANIMALS[animal] || SURVIVOR_ANIMALS.rabbit;
}

// ==================== どうぶつ ====================
// (x, y) はタイル座標, R は見た目の半径 (タイル)
export function drawAnimal(ctx, x, y, R, animal, o = {}) {
  const look = animalLook(animal);
  const t = o.t || 0;
  const facing = o.angle ?? Math.PI / 2;
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const back = fy < -0.55; // 背中を向けている
  const bob = o.moving ? Math.abs(Math.sin(t * 11)) * R * 0.12 : Math.sin(t * 2) * R * 0.02;
  const squash = o.sneak ? 0.82 : 1;
  ctx.save();
  ctx.translate(x, y);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;

  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, R * 0.55, R * 0.75, R * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  if (o.downed) {
    ctx.rotate((Math.PI / 2) * (fx >= 0 ? 1 : -1));
    ctx.translate(0, -R * 0.1);
  }
  ctx.translate(0, -bob);
  ctx.scale(fx < -0.1 ? -1 : 1, squash);

  const body = look.color;
  const accent = look.accent;
  const outline = 'rgba(60,40,30,0.55)';
  ctx.lineWidth = R * 0.07;
  ctx.strokeStyle = outline;

  // しっぽ
  if (animal === 'wolf') {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(-R * 0.75, R * 0.15, R * 0.42, R * 0.18, -0.6 + Math.sin(t * 6) * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (animal === 'cat') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = R * 0.14;
    ctx.beginPath();
    ctx.moveTo(-R * 0.5, R * 0.3);
    ctx.quadraticCurveTo(-R * 1.0, R * 0.1 + Math.sin(t * 4) * R * 0.15, -R * 0.8, -R * 0.35);
    ctx.stroke();
    ctx.lineWidth = R * 0.07;
    ctx.strokeStyle = outline;
  } else if (animal === 'tanuki') {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(-R * 0.65, R * 0.25, R * 0.32, R * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (animal === 'rabbit') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-R * 0.55, R * 0.3, R * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  // 胴体
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, R * 0.25, R * 0.62, R * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (animal === 'penguin' && !back) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(R * 0.05, R * 0.3, R * 0.4, R * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 耳 (頭の後ろ)
  const hx = 0;
  const hy = -R * 0.38;
  const hr = R * 0.52;
  ctx.fillStyle = body;
  if (animal === 'rabbit') {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(hx + s * hr * 0.4, hy - hr * 0.8);
      ctx.rotate(s * 0.18 + (o.moving ? Math.sin(t * 11 + s) * 0.1 : 0));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, -hr * 0.45, hr * 0.26, hr * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, -hr * 0.4, hr * 0.12, hr * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (animal === 'cat' || animal === 'wolf') {
    for (const s of [-1, 1]) {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(hx + s * hr * 0.25, hy - hr * 0.7);
      ctx.lineTo(hx + s * hr * 0.95, hy - hr * (animal === 'wolf' ? 1.45 : 1.25));
      ctx.lineTo(hx + s * hr * 0.95, hy - hr * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = animal === 'wolf' ? '#c7b8c9' : '#f6c7a1';
      ctx.beginPath();
      ctx.moveTo(hx + s * hr * 0.45, hy - hr * 0.65);
      ctx.lineTo(hx + s * hr * 0.85, hy - hr * (animal === 'wolf' ? 1.2 : 1.05));
      ctx.lineTo(hx + s * hr * 0.85, hy - hr * 0.45);
      ctx.closePath();
      ctx.fill();
    }
  } else if (animal === 'tanuki') {
    for (const s of [-1, 1]) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(hx + s * hr * 0.7, hy - hr * 0.75, hr * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // 頭
  ctx.fillStyle = animal === 'penguin' ? body : body;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (!back) {
    const ex = Math.abs(fx) * hr * 0.18;
    const ey = Math.max(-0.2, fy) * hr * 0.12;
    // 顔のパーツ
    if (animal === 'penguin') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(hx + ex, hy + hr * 0.15 + ey, hr * 0.7, hr * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (animal === 'tanuki') {
      ctx.fillStyle = accent;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(hx + ex + s * hr * 0.38, hy + ey + hr * 0.05, hr * 0.3, hr * 0.22, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#efe2cf';
      ctx.beginPath();
      ctx.ellipse(hx + ex, hy + hr * 0.42 + ey, hr * 0.32, hr * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (animal === 'wolf') {
      ctx.fillStyle = '#d9d4e0';
      ctx.beginPath();
      ctx.ellipse(hx + ex * 1.3, hy + hr * 0.38 + ey, hr * 0.45, hr * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (animal === 'cat') {
      ctx.fillStyle = '#fff3e0';
      ctx.beginPath();
      ctx.ellipse(hx + ex, hy + hr * 0.4 + ey, hr * 0.38, hr * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 目
    const eyeY = hy + ey - hr * 0.02;
    const closed = o.downed || o.stunned;
    for (const s of [-1, 1]) {
      const exx = hx + ex + s * hr * 0.36;
      if (closed) {
        ctx.strokeStyle = '#2b2118';
        ctx.lineWidth = R * 0.07;
        ctx.beginPath();
        ctx.moveTo(exx - hr * 0.12, eyeY - hr * 0.08);
        ctx.lineTo(exx + hr * 0.12, eyeY + hr * 0.08);
        ctx.moveTo(exx + hr * 0.12, eyeY - hr * 0.08);
        ctx.lineTo(exx - hr * 0.12, eyeY + hr * 0.08);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#2b2118';
        ctx.beginPath();
        ctx.ellipse(exx, eyeY, hr * 0.11, hr * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(exx + hr * 0.04, eyeY - hr * 0.06, hr * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      if (animal === 'wolf' && !closed) {
        // ちょっとだけ悪そうな眉
        ctx.strokeStyle = '#3d4250';
        ctx.lineWidth = R * 0.06;
        ctx.beginPath();
        ctx.moveTo(exx - s * hr * 0.18, eyeY - hr * 0.3);
        ctx.lineTo(exx + s * hr * 0.12, eyeY - hr * 0.2);
        ctx.stroke();
      }
    }
    // ほっぺ
    if (animal !== 'wolf') {
      ctx.fillStyle = 'rgba(255,120,150,0.45)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(hx + ex + s * hr * 0.62, hy + ey + hr * 0.3, hr * 0.15, hr * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 鼻・くちばし
    if (animal === 'penguin') {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(hx + ex - hr * 0.14, hy + ey + hr * 0.22);
      ctx.lineTo(hx + ex + hr * 0.14, hy + ey + hr * 0.22);
      ctx.lineTo(hx + ex, hy + ey + hr * 0.4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = animal === 'rabbit' ? '#f48fb1' : '#3b2b22';
      ctx.beginPath();
      ctx.ellipse(hx + ex * 1.2, hy + ey + hr * 0.28, hr * 0.09, hr * 0.065, 0, 0, Math.PI * 2);
      ctx.fill();
      if (animal === 'wolf') {
        // 牙
        ctx.fillStyle = '#fff';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(hx + ex * 1.2 + s * hr * 0.12, hy + ey + hr * 0.42);
          ctx.lineTo(hx + ex * 1.2 + s * hr * 0.06, hy + ey + hr * 0.58);
          ctx.lineTo(hx + ex * 1.2 + s * hr * 0.02, hy + ey + hr * 0.42);
          ctx.fill();
        }
      }
    }
  }

  // ばんそうこう (負傷)
  if (o.injured) {
    ctx.save();
    ctx.translate(hx + hr * 0.45, hy - hr * 0.55);
    ctx.rotate(0.6);
    ctx.fillStyle = '#ffe0b2';
    ctx.strokeStyle = '#d7a86e';
    ctx.lineWidth = R * 0.04;
    ctx.beginPath();
    ctx.roundRect(-hr * 0.35, -hr * 0.12, hr * 0.7, hr * 0.24, hr * 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // ぴよぴよ
  if (o.stunned || o.downed) {
    ctx.save();
    ctx.translate(x, y - R * 1.35);
    ctx.fillStyle = '#ffd54f';
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * Math.PI * 2) / 3;
      drawStar(ctx, Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.2, R * 0.14);
    }
    ctx.restore();
  }
}

function drawStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// ロビー用の小さな肖像
export function drawPortrait(canvas, animal) {
  const c = canvas.getContext('2d');
  const s = canvas.width;
  c.clearRect(0, 0, s, s);
  c.save();
  c.scale(s, s);
  drawAnimal(c, 0.5, 0.62, 0.3, animal, { angle: Math.PI / 2 });
  c.restore();
}

// ==================== 静的レイヤー ====================
export function buildStaticLayer(map) {
  const cv = document.createElement('canvas');
  cv.width = map.w * SP;
  cv.height = map.h * SP;
  const c = cv.getContext('2d');
  const rng = mulberry32(map.seed ?? 1);
  const at = (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? TILE.WALL : map.tiles[y * map.w + x]);

  c.fillStyle = COLORS.grass;
  c.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if ((x + y) % 2 === 0) {
        c.fillStyle = COLORS.grassDark;
        c.globalAlpha = 0.35;
        c.fillRect(x * SP, y * SP, SP, SP);
        c.globalAlpha = 1;
      }
    }
  }
  // 草むらの模様
  for (let i = 0; i < map.w * map.h * 0.5; i++) {
    const x = rng() * map.w;
    const y = rng() * map.h;
    c.strokeStyle = rng() < 0.5 ? '#7cc36f' : '#b2e5a4';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x * SP, y * SP);
    c.lineTo(x * SP + 2, y * SP - 6);
    c.moveTo(x * SP + 4, y * SP);
    c.lineTo(x * SP + 5, y * SP - 5);
    c.stroke();
  }
  // お花・きのこ
  const flowerColors = ['#ffffff', '#ffd6e0', '#fff3a3', '#d7c4ff', '#ffb3c7'];
  for (let i = 0; i < map.w * map.h * 0.06; i++) {
    const tx = Math.floor(rng() * map.w);
    const ty = Math.floor(rng() * map.h);
    if (at(tx, ty) !== TILE.FLOOR) continue;
    const x = (tx + 0.2 + rng() * 0.6) * SP;
    const y = (ty + 0.2 + rng() * 0.6) * SP;
    if (rng() < 0.85) {
      c.fillStyle = flowerColors[Math.floor(rng() * flowerColors.length)];
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5;
        c.beginPath();
        c.arc(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, 2.6, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#ffcf40';
      c.beginPath();
      c.arc(x, y, 2, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillStyle = '#f2e6d0';
      c.fillRect(x - 1.5, y - 2, 3, 6);
      c.fillStyle = '#e85d75';
      c.beginPath();
      c.arc(x, y - 2, 5, Math.PI, 0);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(x - 2, y - 4, 1.2, 0, Math.PI * 2);
      c.arc(x + 2, y - 3, 1, 0, Math.PI * 2);
      c.fill();
    }
  }

  // 生け垣 (壁): 影 → 本体 → ハイライトの順
  const isHedge = (x, y) => {
    const t = at(x, y);
    return t === TILE.WALL;
  };
  c.fillStyle = COLORS.hedgeShadow;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (isHedge(x, y)) c.fillRect(x * SP + 4, y * SP + 8, SP, SP);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!isHedge(x, y)) continue;
      const px = x * SP;
      const py = y * SP;
      c.fillStyle = COLORS.hedge;
      const l = isHedge(x - 1, y) ? 0 : 5;
      const r = isHedge(x + 1, y) ? 0 : 5;
      const t = isHedge(x, y - 1) ? 0 : 5;
      const b = isHedge(x, y + 1) ? 0 : 5;
      c.beginPath();
      c.roundRect(px + l * 0.4, py + t * 0.4, SP - (l + r) * 0.4, SP - (t + b) * 0.4, [
        Math.min(l, t) * 2,
        Math.min(r, t) * 2,
        Math.min(r, b) * 2,
        Math.min(l, b) * 2,
      ]);
      c.fill();
      // もこもこ
      c.fillStyle = COLORS.hedgeTop;
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc(px + 8 + k * 12, py + 12 + ((x * 7 + y * 3 + k) % 3) * 4, 6, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  // 窓 (低い木の柵)
  for (const w of map.windows) {
    const px = w.x * SP;
    const py = w.y * SP;
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.fillRect(px, py + SP * 0.55, SP, SP * 0.3);
    c.fillStyle = COLORS.woodLight;
    c.strokeStyle = COLORS.woodDark;
    c.lineWidth = 2;
    if (w.axis === 'v') {
      // 通り抜けは上下 → 柵は横向き
      for (const yy of [0.35, 0.6]) {
        c.fillRect(px - 2, py + SP * yy, SP + 4, 5);
        c.strokeRect(px - 2, py + SP * yy, SP + 4, 5);
      }
      for (const xx of [0.15, 0.5, 0.85]) {
        c.fillRect(px + SP * xx - 3, py + SP * 0.25, 6, SP * 0.5);
        c.strokeRect(px + SP * xx - 3, py + SP * 0.25, 6, SP * 0.5);
      }
    } else {
      for (const xx of [0.35, 0.6]) {
        c.fillRect(px + SP * xx, py - 2, 5, SP + 4);
        c.strokeRect(px + SP * xx, py - 2, 5, SP + 4);
      }
      for (const yy of [0.15, 0.5, 0.85]) {
        c.fillRect(px + SP * 0.25, py + SP * yy - 3, SP * 0.5, 6);
        c.strokeRect(px + SP * 0.25, py + SP * yy - 3, SP * 0.5, 6);
      }
    }
  }

  // 木 (下から順に描いて重なりを自然に)
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (at(x, y) !== TILE.TREE) continue;
      const cx = (x + 0.5) * SP;
      const cy = (y + 0.5) * SP;
      c.fillStyle = 'rgba(20,60,30,0.3)';
      c.beginPath();
      c.ellipse(cx + 4, cy + 12, SP * 0.55, SP * 0.3, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = COLORS.trunk;
      c.fillRect(cx - 5, cy, 10, SP * 0.42);
      c.fillStyle = COLORS.treeDark;
      c.beginPath();
      c.arc(cx, cy - 4, SP * 0.56, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = COLORS.treeLight;
      c.beginPath();
      c.arc(cx - 6, cy - 10, SP * 0.32, 0, Math.PI * 2);
      c.arc(cx + 7, cy - 6, SP * 0.26, 0, Math.PI * 2);
      c.fill();
      if (rng() < 0.3) {
        c.fillStyle = '#ff6b6b';
        c.beginPath();
        c.arc(cx + 8, cy - 14, 3, 0, Math.PI * 2);
        c.arc(cx - 9, cy + 2, 3, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  return cv;
}

// ==================== 動的オブジェクト ====================
export function drawPallet(ctx, p, state) {
  const cx = p.x + 0.5;
  const cy = p.y + 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  if (p.axis === 'h') ctx.rotate(Math.PI / 2);
  // ここから: 通路は上下 (axis v)、倒れた丸太は横向き
  if (state === 'up') {
    // 脇に立てかけた丸太
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-0.45, -0.05, 0.18, 0.5);
    ctx.fillStyle = COLORS.wood;
    ctx.strokeStyle = COLORS.woodDark;
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.roundRect(-0.48, -0.45, 0.2, 0.85, 0.08);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.woodLight;
    ctx.beginPath();
    ctx.ellipse(-0.38, -0.42, 0.09, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (state === 'down') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-0.55, 0.05, 1.1, 0.3);
    ctx.fillStyle = COLORS.wood;
    ctx.strokeStyle = COLORS.woodDark;
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.roundRect(-0.58, -0.2, 1.16, 0.4, 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.woodLight;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 0.56, 0, 0.07, 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = COLORS.woodDark;
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.05);
    ctx.lineTo(0.2, -0.05);
    ctx.moveTo(-0.1, 0.08);
    ctx.lineTo(0.35, 0.08);
    ctx.stroke();
  } else {
    ctx.fillStyle = COLORS.woodDark;
    for (const [x, y, a] of [
      [-0.3, 0.1, 0.4],
      [0.15, -0.15, -0.6],
      [0.3, 0.2, 1.2],
    ]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillRect(-0.15, -0.04, 0.3, 0.08);
      ctx.restore();
    }
  }
  ctx.restore();
}

export function drawGen(ctx, g, s, t, showProgress) {
  const cx = g.x + 0.5;
  const cy = g.y + 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0.05, 0.38, 0.5, 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  const shake = s.r ? Math.sin(t * 40) * 0.03 : 0;
  ctx.translate(shake, 0);
  // 箱
  ctx.fillStyle = s.done ? '#ffe9a8' : '#f8c8d8';
  ctx.strokeStyle = '#8a5a3b';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.roundRect(-0.42, -0.12, 0.84, 0.5, 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e48aa8';
  ctx.fillRect(-0.42, 0.08, 0.84, 0.07);
  // ふた
  ctx.save();
  ctx.translate(-0.42, -0.12);
  ctx.rotate(s.done ? -0.9 : -0.1 - (s.w ? Math.abs(Math.sin(t * 6)) * 0.15 : 0));
  ctx.fillStyle = s.done ? '#ffd166' : '#f6a6c1';
  ctx.beginPath();
  ctx.roundRect(0, -0.12, 0.84, 0.14, 0.05);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // ハンドル
  const ha = t * (s.w ? 6 : 0);
  ctx.strokeStyle = '#8a5a3b';
  ctx.beginPath();
  ctx.moveTo(0.42, 0.12);
  ctx.lineTo(0.55, 0.12);
  ctx.lineTo(0.55 + Math.cos(ha) * 0.12, 0.12 + Math.sin(ha) * 0.12);
  ctx.stroke();
  // 中のバレリーナ (完成時)
  if (s.done) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -0.28 + Math.sin(t * 3) * 0.03, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8fab';
    ctx.beginPath();
    ctx.moveTo(-0.14, -0.08);
    ctx.lineTo(0.14, -0.08);
    ctx.lineTo(0, -0.24);
    ctx.fill();
  }
  // 進捗リング
  if (showProgress && !s.done && s.p > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.arc(0, 0.1, 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = s.r ? '#e5534b' : '#ffcf40';
    ctx.beginPath();
    ctx.arc(0, 0.1, 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.p);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawCage(ctx, c, s) {
  const cx = c.x + 0.5;
  const cy = c.y + 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  if (s.b) {
    ctx.rotate(1.3);
    ctx.globalAlpha = 0.6;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 0.42, 0.48, 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c99a2e';
  ctx.beginPath();
  ctx.ellipse(0, 0.38, 0.45, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 鳥かごの柵は中の動物の手前に描く
export function drawCageFront(ctx, c, s) {
  const cx = c.x + 0.5;
  const cy = c.y + 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  if (s.b) {
    ctx.rotate(1.3);
    ctx.globalAlpha = 0.6;
  }
  ctx.strokeStyle = s.o ? '#f0b429' : '#d4a537';
  ctx.lineWidth = 0.05;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 0.18, 0.38);
    ctx.quadraticCurveTo(i * 0.22, -0.55, 0, -0.62);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0.0, 0.42, 0.08, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -0.72, 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (s.o && !s.b) {
    // 残り時間リング
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = s.st === 2 ? '#e5534b' : '#ffcf40';
    ctx.lineWidth = 0.07;
    const frac = Math.max(0, Math.min(1, s.t / 45));
    ctx.beginPath();
    ctx.arc(0, -0.05, 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawLocker(ctx, l) {
  const cx = l.x + 0.5;
  const cy = l.y + 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0.05, 0.35, 0.5, 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8d6142';
  ctx.strokeStyle = '#5d3b25';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.roundRect(-0.42, -0.3, 0.84, 0.66, 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#d6a77a';
  ctx.beginPath();
  ctx.ellipse(0, -0.3, 0.42, 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#a77c55';
  ctx.beginPath();
  ctx.ellipse(0, -0.3, 0.25, 0.09, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#2a1a10';
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.16, 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // 葉っぱ
  ctx.fillStyle = '#5fb072';
  ctx.beginPath();
  ctx.ellipse(0.3, -0.38, 0.12, 0.06, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawGate(ctx, gate, s, t) {
  const [[x0, y0]] = gate.tiles;
  ctx.save();
  ctx.translate(x0 + 0.5, y0 + 1);
  // 柱
  for (const sy of [-1, 1]) {
    ctx.fillStyle = '#b8b2c8';
    ctx.strokeStyle = '#6d6680';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.roundRect(-0.35, sy * 1.0 - 0.3, 0.7, 0.6, 0.1);
    ctx.fill();
    ctx.stroke();
    // ランプ
    ctx.fillStyle = s.pw ? (s.o ? '#7ee081' : '#ffd166') : '#5b5670';
    ctx.beginPath();
    ctx.arc(0, sy * 1.0, 0.13, 0, Math.PI * 2);
    ctx.fill();
    if (s.pw) {
      ctx.fillStyle = s.o ? 'rgba(126,224,129,0.25)' : 'rgba(255,209,102,0.3)';
      ctx.beginPath();
      ctx.arc(0, sy * 1.0, 0.35 + Math.sin(t * 5) * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (!s.o) {
    ctx.strokeStyle = '#7c6f9c';
    ctx.lineWidth = 0.08;
    const lift = s.p * 0.9;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.25, i * 0.25 - lift * 0);
      ctx.lineTo(0.25, i * 0.25);
      ctx.stroke();
    }
    ctx.globalAlpha = 1 - lift;
    ctx.strokeStyle = '#a99cc9';
    ctx.beginPath();
    ctx.moveTo(0, -0.7);
    ctx.lineTo(0, 0.7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    // 出口の光
    const grad = ctx.createLinearGradient(gate.side === 'left' ? 0.5 : -0.5, 0, gate.side === 'left' ? -0.6 : 0.6, 0);
    grad.addColorStop(0, 'rgba(255,255,220,0)');
    grad.addColorStop(1, 'rgba(255,255,220,0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(-0.6, -0.7, 1.2, 1.4);
  }
  ctx.restore();
}

export function drawHatch(ctx, h, t) {
  const cx = h.x + 0.5;
  const cy = h.y + 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#6b4f3a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.48, 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = h.open ? '#140d08' : '#8a6a50';
  ctx.beginPath();
  ctx.ellipse(0, 0.02, 0.36, 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  if (h.open) {
    ctx.fillStyle = '#fff6b0';
    for (let i = 0; i < 4; i++) {
      const a = t * 2 + i * 1.6;
      drawStar(ctx, Math.cos(a) * 0.55, Math.sin(a) * 0.35 - 0.1, 0.07);
    }
  }
  ctx.restore();
}

// ==================== 視界 (霧) ====================
// 光線を壁の中まで少し伸ばして、見えている壁の表面を明るくする
const WALL_LIT = 0.55;
export function visibilityPolygon(px, py, angle, isHunter, blocksSight) {
  const pts = [];
  if (isHunter) {
    const fov = VISION.hunterFov;
    const n = 90;
    pts.push({ x: px, y: py });
    for (let i = 0; i <= n; i++) {
      const a = angle - fov / 2 + (fov * i) / n;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const d = Math.min(VISION.hunterRadius, castRay(px, py, dx, dy, VISION.hunterRadius, blocksSight) + WALL_LIT);
      pts.push({ x: px + dx * d, y: py + dy * d });
    }
    const near = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const d = castRay(px, py, dx, dy, VISION.hunterNear, blocksSight);
      near.push({ x: px + dx * d, y: py + dy * d });
    }
    return [pts, near];
  }
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const d = Math.min(VISION.survivorRadius, castRay(px, py, dx, dy, VISION.survivorRadius, blocksSight) + WALL_LIT);
    pts.push({ x: px + dx * d, y: py + dy * d });
  }
  return [pts];
}

