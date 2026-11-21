// Procedurally painted field backgrounds, one per area theme. Flat colors + soft shading + brown
// outlines so they sit next to the hand-drawn Librarium monsters and the Cozy UI pieces.
import type { AreaTheme } from '../data/monsters';

const OUT = 'rgba(92,52,38,0.55)';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 2) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    gg = (n >> 8) & 255,
    b = n & 255;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  r = f(r);
  gg = f(gg);
  b = f(b);
  return `rgb(${r},${gg},${b})`;
}

export function paintBackground(theme: AreaTheme, W: number, H: number, seed: number, hue = 0): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  const r = rng(seed);
  const horizon = H * 0.2;

  g.fillStyle = theme.ground[1];
  g.fillRect(0, 0, W, H);
  // sky band
  const sky = g.createLinearGradient(0, 0, 0, horizon + 10);
  sky.addColorStop(0, shade(theme.sky, 0.25));
  sky.addColorStop(1, theme.sky);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, horizon + 12);

  // distant silhouettes
  drawHorizon(g, theme, W, horizon, r);

  // ground
  const gr = g.createLinearGradient(0, horizon, 0, H);
  gr.addColorStop(0, shade(theme.ground[0], 0.08));
  gr.addColorStop(1, theme.ground[1]);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, horizon + 6);
  for (let x = 0; x <= W + 24; x += 24) g.lineTo(x, horizon + 4 + Math.sin(x * 0.03 + seed) * 4);
  g.lineTo(W + 24, H);
  g.lineTo(0, H);
  g.closePath();
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 2.5;
  g.beginPath();
  for (let x = 0; x <= W + 24; x += 24) {
    const y = horizon + 4 + Math.sin(x * 0.03 + seed) * 4;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();

  // soft ground patches
  for (let i = 0; i < 14; i++) {
    const x = r() * W;
    const y = horizon + 20 + r() * (H - horizon - 20);
    const s = 30 + r() * 70;
    blob(g, x, y, s, s * 0.35, shade(theme.ground[r() < 0.5 ? 0 : 1], r() < 0.5 ? -0.07 : 0.07));
  }

  // decorations by theme
  const decoN = Math.round((W * H) / 9000);
  const items: { y: number; draw: () => void }[] = [];
  for (let i = 0; i < decoN; i++) {
    const x = r() * W;
    const y = horizon + 18 + Math.pow(r(), 0.8) * (H - horizon - 18);
    const sc = 0.6 + ((y - horizon) / (H - horizon)) * 0.7;
    const k = r();
    items.push({ y, draw: () => deco(g, theme, x, y, sc, k, r) });
  }
  items.sort((a, b) => a.y - b.y).forEach((d) => d.draw());

  // vignette
  const vg = g.createRadialGradient(W / 2, H * 0.6, Math.min(W, H) * 0.35, W / 2, H * 0.6, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(40,20,10,0.28)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  if (hue) {
    const c2 = document.createElement('canvas');
    c2.width = cv.width;
    c2.height = cv.height;
    const g2 = c2.getContext('2d')!;
    g2.filter = `hue-rotate(${hue}deg)`;
    g2.drawImage(cv, 0, 0);
    return c2;
  }
  return cv;
}

function drawHorizon(g: CanvasRenderingContext2D, t: AreaTheme, W: number, hz: number, r: () => number) {
  const far = shade(t.ground[1], -0.25);
  const mid = shade(t.ground[0], -0.12);
  g.lineWidth = 2;
  g.strokeStyle = OUT;
  const layer = (color: string, base: number, amp: number, kind: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, hz + 10);
    let x = 0;
    while (x <= W + 40) {
      const w = 30 + r() * 50;
      const h = amp * (0.5 + r() * 0.6);
      if (kind === 'tree') {
        g.lineTo(x, base);
        g.quadraticCurveTo(x + w * 0.1, base - h, x + w * 0.5, base - h * 1.05);
        g.quadraticCurveTo(x + w * 0.9, base - h, x + w, base);
      } else if (kind === 'spike') {
        g.lineTo(x, base);
        g.lineTo(x + w * 0.5, base - h * 1.4);
        g.lineTo(x + w, base);
      } else if (kind === 'tower') {
        g.lineTo(x, base);
        g.lineTo(x, base - h);
        g.lineTo(x + w * 0.2, base - h);
        g.lineTo(x + w * 0.2, base - h * 1.3);
        g.lineTo(x + w * 0.45, base - h * 1.3);
        g.lineTo(x + w * 0.45, base - h * 0.8);
        g.lineTo(x + w, base - h * 0.8);
        g.lineTo(x + w, base);
      } else if (kind === 'wave') {
        g.lineTo(x, base);
        g.quadraticCurveTo(x + w * 0.5, base - h * 0.25, x + w, base);
      } else {
        g.lineTo(x, base);
        g.quadraticCurveTo(x + w * 0.5, base - h, x + w, base);
      }
      x += w;
    }
    g.lineTo(W + 40, hz + 10);
    g.closePath();
    g.fill();
    g.stroke();
  };
  const kind: Record<AreaTheme['deco'], [string, string]> = {
    grass: ['tree', 'tree'],
    rock: ['spike', 'hill'],
    beach: ['wave', 'wave'],
    lava: ['spike', 'spike'],
    sand: ['hill', 'hill'],
    snow: ['spike', 'hill'],
    hive: ['hill', 'tree'],
    gear: ['tower', 'tower'],
    swamp: ['tree', 'hill'],
    peak: ['spike', 'spike'],
    castle: ['tower', 'spike'],
    void: ['spike', 'hill'],
  };
  const [k1, k2] = kind[t.deco];
  if (t.deco === 'beach') {
    g.fillStyle = '#5fb3c9';
    g.fillRect(0, hz * 0.55, W, hz * 0.5);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 8; i++) g.fillRect(r() * W, hz * 0.6 + r() * hz * 0.3, 20 + r() * 30, 2);
  }
  layer(far, hz - 2, hz * 0.55, k1);
  layer(mid, hz + 8, hz * 0.32, k2);
  if (t.deco === 'lava' || t.deco === 'void') {
    g.fillStyle = t.accent + '55';
    g.fillRect(0, hz - 6, W, 10);
  }
}

function deco(g: CanvasRenderingContext2D, t: AreaTheme, x: number, y: number, s: number, k: number, r: () => number) {
  const acc = t.accent;
  const dark = shade(t.ground[1], -0.22);
  const light = shade(t.ground[0], 0.18);
  switch (t.deco) {
    case 'grass':
      if (k < 0.55) tuft(g, x, y, s, shade(acc, 0.1), acc);
      else if (k < 0.8) flower(g, x, y, s, ['#ffffff', '#ffd1dc', '#ffe27a', '#b9d8ff'][Math.floor(r() * 4)]);
      else rock(g, x, y, s * 0.7, '#b8b2a4');
      break;
    case 'rock':
      if (k < 0.5) rock(g, x, y, s, k < 0.25 ? '#c9b48b' : '#a89878');
      else tuft(g, x, y, s * 0.8, '#9cab5b', '#7d8c45');
      break;
    case 'beach':
      if (k < 0.3) shell(g, x, y, s, '#ffd9c7');
      else if (k < 0.55) blob(g, x, y, 10 * s, 3 * s, light);
      else if (k < 0.7) starfish(g, x, y, s);
      else rock(g, x, y, s * 0.6, '#c8b9a0');
      break;
    case 'lava':
      if (k < 0.35) {
        blob(g, x, y, 22 * s, 7 * s, '#ff8a3d', OUT);
        blob(g, x - 4 * s, y - 1, 10 * s, 3 * s, '#ffd36b');
      } else rock(g, x, y, s, k < 0.7 ? '#5a3329' : '#6d4136');
      break;
    case 'sand':
      if (k < 0.3) cactus(g, x, y, s);
      else if (k < 0.6) blob(g, x, y, 16 * s, 4 * s, light);
      else rock(g, x, y, s * 0.8, '#d8b276');
      break;
    case 'snow':
      if (k < 0.45) blob(g, x, y, 18 * s, 6 * s, '#ffffff', 'rgba(120,160,190,0.6)');
      else if (k < 0.75) crystal(g, x, y, s, '#bfe3f7');
      else rock(g, x, y, s * 0.7, '#a9bfcc');
      break;
    case 'hive':
      if (k < 0.4) hexCell(g, x, y, s, '#e8be56');
      else if (k < 0.7) rock(g, x, y, s * 0.8, '#7a6440');
      else tuft(g, x, y, s * 0.7, '#a2a05a', '#808043');
      break;
    case 'gear':
      if (k < 0.45) gear(g, x, y, s, k < 0.2 ? '#d4a84a' : '#a69a8a');
      else if (k < 0.7) blob(g, x, y, 14 * s, 4 * s, dark);
      else rock(g, x, y, s * 0.7, '#8e7f6c');
      break;
    case 'swamp':
      if (k < 0.4) {
        blob(g, x, y, 24 * s, 7 * s, '#4d6b5a', OUT);
        blob(g, x - 6 * s, y - 2, 8 * s, 2 * s, '#7fa08a');
      } else if (k < 0.7) mushroom(g, x, y, s, '#9b6fc9');
      else tuft(g, x, y, s, '#6f8a45', '#556c33');
      break;
    case 'peak':
      if (k < 0.55) rock(g, x, y, s * 1.1, k < 0.3 ? '#9c978d' : '#b9b3a8');
      else if (k < 0.75) bone(g, x, y, s);
      else tuft(g, x, y, s * 0.7, '#8d9a6a', '#6e7a50');
      break;
    case 'castle':
      if (k < 0.4) tile(g, x, y, s, '#6b6180');
      else if (k < 0.6) candle(g, x, y, s);
      else rock(g, x, y, s * 0.8, '#57506a');
      break;
    case 'void':
      if (k < 0.45) {
        blob(g, x, y, 14 * s, 5 * s, '#ff5fa2', OUT);
        blob(g, x, y - 1, 6 * s, 2 * s, '#ffd0e6');
      } else if (k < 0.75) crystal(g, x, y, s, '#7c5bc4');
      else rock(g, x, y, s * 0.7, '#2a2238');
      break;
  }
}

function tuft(g: CanvasRenderingContext2D, x: number, y: number, s: number, c1: string, c2: string) {
  g.lineWidth = 1.8;
  g.strokeStyle = OUT;
  for (let i = -2; i <= 2; i++) {
    g.fillStyle = i % 2 ? c2 : c1;
    g.beginPath();
    g.moveTo(x + i * 3.5 * s - 3 * s, y);
    g.quadraticCurveTo(x + i * 4 * s, y - (12 - Math.abs(i) * 2.5) * s, x + i * 5 * s + 1 * s, y - (14 - Math.abs(i) * 3) * s);
    g.quadraticCurveTo(x + i * 3.5 * s + 2 * s, y - 5 * s, x + i * 3.5 * s + 3 * s, y);
    g.closePath();
    g.fill();
    g.stroke();
  }
}
function flower(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.strokeStyle = '#4f7d36';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - 9 * s);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    blob(g, x + Math.cos(a) * 3.2 * s, y - 10 * s + Math.sin(a) * 3.2 * s, 2.6 * s, 2.6 * s, c, OUT, 1);
  }
  blob(g, x, y - 10 * s, 2 * s, 2 * s, '#ffcf3d');
}
function rock(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.beginPath();
  g.moveTo(x - 12 * s, y);
  g.quadraticCurveTo(x - 13 * s, y - 9 * s, x - 3 * s, y - 11 * s);
  g.quadraticCurveTo(x + 9 * s, y - 12 * s, x + 12 * s, y);
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = OUT;
  g.stroke();
  blob(g, x - 3 * s, y - 7 * s, 4 * s, 2 * s, 'rgba(255,255,255,0.3)');
}
function shell(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.beginPath();
  g.moveTo(x - 6 * s, y);
  g.quadraticCurveTo(x, y - 12 * s, x + 6 * s, y);
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 1.5;
  g.stroke();
}
function starfish(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = (i % 2 ? 2.5 : 6.5) * s;
    g.lineTo(x + Math.cos(a) * rr, y - 4 * s + Math.sin(a) * rr * 0.6);
  }
  g.closePath();
  g.fillStyle = '#f38a6b';
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 1.5;
  g.stroke();
}
function cactus(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = '#7aa64a';
  g.strokeStyle = OUT;
  g.lineWidth = 1.8;
  const rr = (x0: number, y0: number, w: number, h: number) => {
    g.beginPath();
    g.roundRect(x0, y0, w, h, w / 2);
    g.fill();
    g.stroke();
  };
  rr(x - 3 * s, y - 20 * s, 6 * s, 20 * s);
  rr(x - 9 * s, y - 14 * s, 4.5 * s, 9 * s);
  rr(x + 4.5 * s, y - 16 * s, 4.5 * s, 9 * s);
}
function crystal(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.beginPath();
  g.moveTo(x - 5 * s, y);
  g.lineTo(x - 3 * s, y - 14 * s);
  g.lineTo(x + 1 * s, y - 19 * s);
  g.lineTo(x + 5 * s, y - 12 * s);
  g.lineTo(x + 5 * s, y);
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 1.8;
  g.stroke();
  g.beginPath();
  g.moveTo(x - 1 * s, y - 2 * s);
  g.lineTo(x + 0.5 * s, y - 15 * s);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.stroke();
}
function hexCell(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.lineTo(x + Math.cos(a) * 9 * s, y - 4 * s + Math.sin(a) * 5 * s);
  }
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 1.8;
  g.stroke();
}
function gear(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.beginPath();
  const n = 8;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = (i % 2 ? 9 : 11.5) * s;
    g.lineTo(x + Math.cos(a) * rr, y - 3 * s + Math.sin(a) * rr * 0.45);
  }
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 1.8;
  g.stroke();
  blob(g, x, y - 3 * s, 3.5 * s, 1.6 * s, shade(c, -0.3));
}
function mushroom(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.fillStyle = '#efe3c8';
  g.strokeStyle = OUT;
  g.lineWidth = 1.6;
  g.beginPath();
  g.roundRect(x - 2.5 * s, y - 9 * s, 5 * s, 9 * s, 2 * s);
  g.fill();
  g.stroke();
  g.beginPath();
  g.ellipse(x, y - 9 * s, 8 * s, 5 * s, 0, Math.PI, 0);
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.stroke();
  blob(g, x - 3 * s, y - 11 * s, 1.5 * s, 1.5 * s, '#fff');
}
function bone(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.strokeStyle = OUT;
  g.lineWidth = 4 * s + 2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 8 * s, y - 2 * s);
  g.lineTo(x + 8 * s, y - 4 * s);
  g.stroke();
  g.strokeStyle = '#efe6d2';
  g.lineWidth = 4 * s;
  g.stroke();
  g.lineCap = 'butt';
}
function tile(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.beginPath();
  g.moveTo(x - 14 * s, y);
  g.lineTo(x - 8 * s, y - 7 * s);
  g.lineTo(x + 14 * s, y - 7 * s);
  g.lineTo(x + 8 * s, y);
  g.closePath();
  g.fillStyle = c;
  g.fill();
  g.strokeStyle = 'rgba(30,20,40,0.5)';
  g.lineWidth = 1.5;
  g.stroke();
}
function candle(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = '#e9dfc9';
  g.strokeStyle = OUT;
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(x - 2.5 * s, y - 12 * s, 5 * s, 12 * s, 1.5);
  g.fill();
  g.stroke();
  const fl = g.createRadialGradient(x, y - 15 * s, 0, x, y - 15 * s, 10 * s);
  fl.addColorStop(0, 'rgba(255,220,120,0.9)');
  fl.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = fl;
  g.beginPath();
  g.arc(x, y - 15 * s, 10 * s, 0, Math.PI * 2);
  g.fill();
  blob(g, x, y - 15 * s, 1.8 * s, 3 * s, '#ffcf5a');
}
