// 仮スプライトを Canvas で生成する。外部素材は config.js の ASSETS で差し替え可能。
// すべての SPR[name] は { img, white, w, h } を持ち、w/h はワールド上の描画サイズ。
const S = 2; // 高解像度で描いておき縮小描画（ズーム時もぼやけにくい）

export const SPR = {};
export const DOTS = [];   // パーティクル用の発光ドット（色インデックス）
export const PALETTE = ['#ffd35a', '#ff5a3d', '#7fd7ff', '#ffffff', '#c77dff', '#7dffb0', '#ff3d6e', '#ffe9b0', '#6fa8ff'];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

function whiteOf(src) {
  const c = canvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function make(name, w, h, draw, opts = {}) {
  const c = canvas(w * S, h * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  g.translate(w / 2, h / 2);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g, w, h);
  SPR[name] = { img: c, white: opts.noWhite ? c : whiteOf(c), w, h };
}

// ---- 描画ヘルパ ----
function circ(g, x, y, r, fill, stroke, lw = 1.5) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function ell(g, x, y, rx, ry, fill) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}
function poly(g, pts, fill, stroke, lw = 1.5) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function eye(g, x, y, r, iris = '#111') {
  circ(g, x, y, r, '#fff');
  circ(g, x, y + r * 0.15, r * 0.55, iris);
}
function shadow(g, y, rx) { ell(g, 0, y, rx, rx * 0.32, 'rgba(0,0,0,0.38)'); }
function glow(g, r, inner, outer) {
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, outer);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(-r, -r, r * 2, r * 2);
}

export function buildSprites() {
  // ---- プレイヤー（陰陽師）----
  make('player', 40, 50, (g) => {
    shadow(g, 21, 13);
    poly(g, [-11, 5, 11, 5, 14, 20, -14, 20], '#4b2f7a', '#1a0f2e');           // 袴
    poly(g, [-18, -2, -10, -6, -9, 10, -18, 9], '#e8e4d8', '#1a0f2e');         // 左袖
    poly(g, [18, -2, 10, -6, 9, 10, 18, 9], '#e8e4d8', '#1a0f2e');             // 右袖
    poly(g, [-11, -6, 11, -6, 12, 9, -12, 9], '#f6f3ea', '#1a0f2e');           // 狩衣
    poly(g, [-3, -6, 3, -6, 0, 3], '#c9c2b0');
    circ(g, -5, 2, 2.2, '#d23a3a'); circ(g, 5, 2, 2.2, '#d23a3a');           // 菊綴
    circ(g, 0, -12, 7.5, '#f6dcc0', '#1a0f2e');                               // 顔
    g.strokeStyle = '#1a0f2e'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-4.5, -12); g.lineTo(-1.8, -11.5); g.moveTo(4.5, -12); g.lineTo(1.8, -11.5); g.stroke();
    poly(g, [-6, -17, 6, -17, 4, -26, -1, -24.5, -5, -21], '#15121c', '#000');  // 烏帽子
    g.strokeStyle = '#d23a3a'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-6, -16); g.lineTo(-8, -8); g.moveTo(6, -16); g.lineTo(8, -8); g.stroke();
  });

  // ---- 妖怪 ----
  make('onibi', 24, 28, (g) => {
    glow(g, 14, 'rgba(160,230,255,0.9)', 'rgba(80,150,255,0.35)');
    g.beginPath();
    g.moveTo(0, -12);
    g.bezierCurveTo(6, -4, 9, 2, 7, 6);
    g.bezierCurveTo(5, 11, -5, 11, -7, 6);
    g.bezierCurveTo(-9, 2, -6, -4, 0, -12);
    g.fillStyle = '#7fd7ff'; g.fill();
    circ(g, 0, 4, 4.5, '#e9fbff');
    circ(g, -2.4, 3, 1.4, '#123'); circ(g, 2.4, 3, 1.4, '#123');
  });

  make('kooni', 30, 32, (g) => {
    shadow(g, 13, 10);
    poly(g, [-7, -9, -4, -16, -2, -9], '#f1e9d0', '#3a0a0a', 1);
    poly(g, [7, -9, 4, -16, 2, -9], '#f1e9d0', '#3a0a0a', 1);
    circ(g, 0, 1, 11.5, '#d8423a', '#3a0a0a');
    ell(g, 0, 7, 7, 4, '#e2a43a');
    eye(g, -4, -1, 2.8, '#e9b000'); eye(g, 4, -1, 2.8, '#e9b000');
    g.strokeStyle = '#3a0a0a'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-7, -5); g.lineTo(-2, -3.5); g.moveTo(7, -5); g.lineTo(2, -3.5); g.stroke();
    poly(g, [-3, 4, -1.5, 7, 0, 4], '#fff'); poly(g, [3, 4, 1.5, 7, 0, 4], '#fff');
  });

  make('hitotsume', 32, 36, (g) => {
    shadow(g, 15, 10);
    poly(g, [-9, 3, 9, 3, 11, 14, -11, 14], '#2f5a9e', '#0c1830');
    circ(g, 0, -4, 11, '#f0cfa8', '#3a2414');
    eye(g, 0, -4, 6.2, '#b0161d');
    g.strokeStyle = '#3a2414'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 3, 3, 0.2, Math.PI - 0.2); g.stroke();
    ell(g, 0, 4.6, 1.6, 2.4, '#e05a73');
  });

  make('karakasa', 32, 38, (g) => {
    shadow(g, 17, 8);
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 4); g.lineTo(0, 15); g.stroke();
    g.beginPath(); g.moveTo(-3, 15); g.lineTo(3, 15); g.stroke();
    g.beginPath();
    g.moveTo(-14, 6); g.quadraticCurveTo(-12, -14, 0, -17); g.quadraticCurveTo(12, -14, 14, 6);
    g.quadraticCurveTo(7, 3, 0, 6); g.quadraticCurveTo(-7, 3, -14, 6);
    g.fillStyle = '#8d3fbf'; g.fill(); g.strokeStyle = '#2a0c3a'; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
    for (const x of [-8, 0, 8]) { g.beginPath(); g.moveTo(0, -16); g.lineTo(x, 5); g.stroke(); }
    eye(g, 0, -5, 4.6, '#111');
    poly(g, [-2, 1, 2, 1, 1, 9, -1, 8], '#e0384c');
  });

  make('gashadokuro', 38, 40, (g) => {
    shadow(g, 17, 13);
    circ(g, 0, -3, 14, '#ece6d6', '#3b3628', 2);
    ell(g, 0, 10, 9, 5, '#ece6d6');
    ell(g, -5.5, -4, 4.2, 4.8, '#1b1712'); ell(g, 5.5, -4, 4.2, 4.8, '#1b1712');
    circ(g, -5.5, -3.5, 1.4, '#ff4a3a'); circ(g, 5.5, -3.5, 1.4, '#ff4a3a');
    poly(g, [0, 2, -2, 6, 2, 6], '#1b1712');
    g.strokeStyle = '#3b3628'; g.lineWidth = 1.2;
    for (let x = -6; x <= 6; x += 3) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 12.5); g.stroke(); }
  });

  make('oni', 58, 62, (g) => {
    shadow(g, 26, 20);
    glow(g, 30, 'rgba(255,190,80,0.0)', 'rgba(255,150,40,0.18)');
    poly(g, [-12, -14, -16, -28, -6, -16], '#f4e9c8', '#2a0505');
    poly(g, [12, -14, 16, -28, 6, -16], '#f4e9c8', '#2a0505');
    circ(g, 0, 2, 21, '#c7261f', '#2a0505', 2);
    poly(g, [-15, 12, 15, 12, 13, 21, -13, 21], '#f1b63a', '#2a0505');
    g.strokeStyle = '#2a0505'; g.lineWidth = 2;
    for (const x of [-8, 0, 8]) { g.beginPath(); g.moveTo(x - 2, 13); g.lineTo(x + 2, 20); g.stroke(); }
    eye(g, -7, -3, 4.5, '#ffcc00'); eye(g, 7, -3, 4.5, '#ffcc00');
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-13, -10); g.lineTo(-3, -6); g.moveTo(13, -10); g.lineTo(3, -6); g.stroke();
    poly(g, [-8, 5, 8, 5, 6, 9, -6, 9], '#2a0505');
    poly(g, [-6, 5, -4, 10, -2, 5], '#fff'); poly(g, [6, 5, 4, 10, 2, 5], '#fff');
  });

  make('shuten', 130, 136, (g) => {
    shadow(g, 58, 46);
    glow(g, 66, 'rgba(255,80,60,0.0)', 'rgba(255,60,40,0.25)');
    // 白髪のたてがみ
    g.fillStyle = '#efe7ea';
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.9 + (i / 13) * 1.2);
      g.beginPath(); g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30 - 6);
      g.lineTo(Math.cos(a - 0.15) * 58, Math.sin(a - 0.15) * 58 - 6);
      g.lineTo(Math.cos(a + 0.15) * 50, Math.sin(a + 0.15) * 50 - 6); g.fill();
    }
    poly(g, [-26, -30, -36, -64, -14, -36], '#ffe17a', '#2a0505', 2);
    poly(g, [26, -30, 36, -64, 14, -36], '#ffe17a', '#2a0505', 2);
    poly(g, [-34, 16, 34, 16, 42, 56, -42, 56], '#2d1a4a', '#0b0612', 2);      // 着物
    poly(g, [-8, 16, 8, 16, 0, 40], '#d4a13a');
    circ(g, 0, -4, 38, '#d5302a', '#2a0505', 3);
    eye(g, -14, -10, 8, '#ffd400'); eye(g, 14, -10, 8, '#ffd400');
    g.strokeStyle = '#2a0505'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-26, -24); g.lineTo(-6, -16); g.moveTo(26, -24); g.lineTo(6, -16); g.stroke();
    poly(g, [-16, 10, 16, 10, 12, 20, -12, 20], '#2a0505');
    poly(g, [-12, 10, -9, 22, -6, 10], '#fff'); poly(g, [12, 10, 9, 22, 6, 10], '#fff');
    // 瓢箪
    circ(g, 44, 28, 8, '#d9a441', '#3a2205'); circ(g, 44, 16, 5.5, '#d9a441', '#3a2205');
  });

  // ---- 式神 ----
  make('kami', 24, 30, (g) => {
    glow(g, 15, 'rgba(255,255,255,0.0)', 'rgba(200,230,255,0.25)');
    g.beginPath();
    g.moveTo(0, -13); g.arc(0, -8, 5, -Math.PI / 2, Math.PI * 1.5);
    g.fillStyle = '#fbfaf4'; g.fill();
    poly(g, [-4, -3, 4, -3, 10, 0, 9, 3, 4, 2, 6, 13, 1, 13, 0, 7, -1, 13, -6, 13, -4, 2, -9, 3, -10, 0], '#fbfaf4', '#9aa3b5', 1);
    circ(g, 0, 2, 2.2, '#d23a3a');
    g.strokeStyle = '#333'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-2.2, -8.5); g.lineTo(-0.8, -8.5); g.moveTo(2.2, -8.5); g.lineTo(0.8, -8.5); g.stroke();
  });

  make('byakko', 36, 34, (g) => {
    glow(g, 18, 'rgba(255,255,255,0)', 'rgba(255,240,200,0.3)');
    g.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {   // 尾
      g.beginPath(); g.moveTo(s * 6, 8); g.quadraticCurveTo(s * 18, 10, s * 15, -4); g.quadraticCurveTo(s * 12, 4, s * 4, 4); g.fill();
    }
    poly(g, [-11, -5, -9, -16, -3, -8], '#fff', '#a33', 1);
    poly(g, [11, -5, 9, -16, 3, -8], '#fff', '#a33', 1);
    poly(g, [-11, -6, 11, -6, 4, 9, 0, 11, -4, 9], '#ffffff', '#c9b9a8', 1);
    poly(g, [-7, -3, -2, -1, -6, 0], '#d1202a'); poly(g, [7, -3, 2, -1, 6, 0], '#d1202a');
    circ(g, 0, 9.5, 1.6, '#222');
    poly(g, [0, -8, -1.5, -4, 0, -2, 1.5, -4], '#d1202a');
  });

  make('zenki', 52, 58, (g) => {
    shadow(g, 25, 18);
    g.strokeStyle = 'rgba(255,220,120,0.9)'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(0, -6, 25, 0, Math.PI * 2); g.stroke();                 // 光輪
    poly(g, [-9, -14, -11, -26, -3, -16], '#ffe17a', '#0a1a3a');
    poly(g, [9, -14, 11, -26, 3, -16], '#ffe17a', '#0a1a3a');
    circ(g, 0, 2, 19, '#3c6fd6', '#0a1a3a', 2);
    poly(g, [-14, 10, 14, 10, 12, 20, -12, 20], '#ffffff', '#0a1a3a');
    eye(g, -6, -3, 4, '#ffd400'); eye(g, 6, -3, 4, '#ffd400');
    g.strokeStyle = '#0a1a3a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-11, -9); g.lineTo(-2, -6); g.moveTo(11, -9); g.lineTo(2, -6); g.stroke();
    poly(g, [-7, 4, 7, 4, 5, 8, -5, 8], '#0a1a3a');
    // 金棒
    g.strokeStyle = '#d9b44a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(18, 14); g.lineTo(24, -16); g.stroke();
  });

  make('karasu', 40, 30, (g) => {
    g.fillStyle = '#17141d';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * 5, -2); g.lineTo(s * 20, -10); g.lineTo(s * 17, -2); g.lineTo(s * 19, 4); g.lineTo(s * 6, 6); g.fill();
    }
    poly(g, [-7, 0, 7, 0, 6, 12, -6, 12], '#2b2236', '#000');
    circ(g, 0, -4, 7, '#d23a2a', '#2a0505');
    poly(g, [-2, -3, 2, -3, 0, 8], '#b0201a', '#2a0505', 1);                        // 長い鼻
    eye(g, -3.2, -6, 1.8, '#000'); eye(g, 3.2, -6, 1.8, '#000');
    poly(g, [-4, -11, 4, -11, 0, -15], '#111');
  });

  // ---- 弾・エフェクト ----
  make('ofuda', 10, 20, (g) => {
    glow(g, 10, 'rgba(255,230,140,0.8)', 'rgba(255,200,80,0.25)');
    poly(g, [-4, -9, 4, -9, 4, 9, -4, 9], '#fff7df', '#b58b2a', 1);
    g.strokeStyle = '#c3202a'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 6); g.moveTo(-2.5, -3); g.lineTo(2.5, -3); g.moveTo(-2, 2); g.lineTo(2, 4); g.stroke();
  });
  make('arrow', 40, 10, (g) => {
    glow(g, 14, 'rgba(255,200,150,0.5)', 'rgba(255,120,60,0.15)');
    g.strokeStyle = '#ffe1b8'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-17, 0); g.lineTo(14, 0); g.stroke();
    poly(g, [19, 0, 12, -3.5, 12, 3.5], '#fff');
    poly(g, [-17, 0, -12, -4, -9, -4, -13, 0, -9, 4, -12, 4], '#d23a3a');
  });
  make('feather', 16, 8, (g) => {
    g.beginPath(); g.ellipse(0, 0, 7, 2.6, 0, 0, Math.PI * 2); g.fillStyle = '#251c33'; g.fill();
    g.strokeStyle = '#ff7a4a'; g.lineWidth = 1; g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
  });
  make('foxfire', 30, 30, (g) => {
    glow(g, 15, 'rgba(230,250,255,1)', 'rgba(90,170,255,0.6)');
    circ(g, 0, 0, 4.5, '#f4feff');
  }, { noWhite: true });
  make('fireball', 26, 26, (g) => {
    glow(g, 13, 'rgba(255,240,180,1)', 'rgba(255,90,30,0.7)');
    circ(g, 0, 0, 4, '#fff6d0');
  }, { noWhite: true });

  // 経験値（人魂）
  const gemCols = [['#bff4ff', '#36b6ff'], ['#d6ffd0', '#38d86a'], ['#ffd6d6', '#ff3a4a'], ['#f2d6ff', '#a64dff']];
  gemCols.forEach(([a, b], i) => {
    const r = 6 + i * 2;
    make('gem' + i, r * 2 + 4, r * 2 + 4, (g) => {
      glow(g, r + 2, a, b);
      circ(g, 0, 0, r * 0.38, '#ffffff');
    }, { noWhite: true });
  });

  // アイテム
  make('heal', 26, 26, (g) => {
    glow(g, 13, 'rgba(255,255,255,0.0)', 'rgba(255,255,255,0.25)');
    poly(g, [0, -10, 10, 8, -10, 8], '#ffffff', '#999', 1);
    poly(g, [-6, 2, 6, 2, 8, 8, -8, 8], '#14231a');
  });
  make('magnet', 26, 26, (g) => {
    glow(g, 13, 'rgba(120,255,180,0.0)', 'rgba(120,255,180,0.35)');
    g.beginPath(); g.arc(1, -2, 7, -Math.PI * 0.2, Math.PI * 1.1); g.quadraticCurveTo(-8, 10, 4, 10);
    g.quadraticCurveTo(0, 4, 6, 2); g.closePath(); g.fillStyle = '#2fd47a'; g.fill(); g.strokeStyle = '#0a3a20'; g.lineWidth = 1.2; g.stroke();
    circ(g, 1, -3, 2, '#0a3a20');
  });
  make('bomb', 26, 32, (g) => {
    glow(g, 16, 'rgba(255,240,150,0.0)', 'rgba(255,220,90,0.45)');
    poly(g, [-8, -13, 8, -13, 8, 13, -8, 13], '#ffe066', '#7a5000', 1.5);
    g.fillStyle = '#b3141c'; g.font = 'bold 13px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('浄', 0, 0);
  });
  make('chest', 34, 28, (g) => {
    glow(g, 17, 'rgba(255,220,120,0.0)', 'rgba(255,200,80,0.45)');
    poly(g, [-13, -4, 13, -4, 13, 11, -13, 11], '#8a1414', '#2a0505', 1.5);
    poly(g, [-14, -11, 14, -11, 14, -3, -14, -3], '#a81c1c', '#2a0505', 1.5);
    g.strokeStyle = '#ffcf4a'; g.lineWidth = 2;
    g.strokeRect(-13, -11, 26, 22);
    circ(g, 0, -2, 3, '#ffcf4a');
  });

  // 五芒星の魔法陣（召喚・結界用）
  for (const [name, col] of [['seal', '255,214,110'], ['sealBlue', '140,210,255'], ['sealRed', '255,90,80']]) {
    make(name, 128, 128, (g) => {
      g.strokeStyle = `rgba(${col},0.95)`;
      g.lineWidth = 2.2;
      g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(0, 0, 52, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
        const x = Math.cos(a) * 50, y = Math.sin(a) * 50;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.fillStyle = `rgba(${col},0.10)`;
      g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        circ(g, Math.cos(a) * 56, Math.sin(a) * 56, 1.6, `rgba(${col},1)`);
      }
    }, { noWhite: true });
  }

  // パーティクル用の発光ドット
  for (const col of PALETTE) {
    const c = canvas(32, 32);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.25, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    DOTS.push(c);
  }
}

// 地面タイル（512x512 ワールド単位）
export function buildGroundTile() {
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#1a1c28';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${60 + rnd() * 40},${70 + rnd() * 40},${90 + rnd() * 40},${0.05 + rnd() * 0.08})`;
    const r = 1 + rnd() * 3;
    g.fillRect(rnd() * size, rnd() * size, r, r);
  }
  for (let i = 0; i < 70; i++) {           // 草
    const x = rnd() * size, y = rnd() * size;
    g.strokeStyle = `rgba(70,110,80,${0.25 + rnd() * 0.25})`;
    g.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) {
      g.beginPath(); g.moveTo(x + k * 2, y); g.lineTo(x + k * 2 + (rnd() - 0.5) * 6, y - 5 - rnd() * 6); g.stroke();
    }
  }
  for (let i = 0; i < 16; i++) {           // 石
    const x = rnd() * size, y = rnd() * size, r = 4 + rnd() * 9;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(x + 2, y + 3, r, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(${90 + rnd() * 30},${90 + rnd() * 30},${110 + rnd() * 30},0.55)`;
    g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill();
  }
  // 石畳の名残
  g.strokeStyle = 'rgba(140,150,190,0.06)';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const x = rnd() * size, y = rnd() * size;
    g.strokeRect(x, y, 40 + rnd() * 30, 30 + rnd() * 20);
  }
  return c;
}

// 外部素材での差し替え。読み込み完了次第、同じ SPR オブジェクトを書き換える
export function applyAssetOverrides(map) {
  for (const [name, url] of Object.entries(map)) {
    const spr = SPR[name];
    if (!spr) { console.warn('unknown sprite', name); continue; }
    const im = new Image();
    im.onload = () => {
      const c = canvas(spr.w * S, spr.h * S);
      const g = c.getContext('2d');
      const k = Math.min(c.width / im.width, c.height / im.height);
      const w = im.width * k, h = im.height * k;
      g.drawImage(im, (c.width - w) / 2, (c.height - h) / 2, w, h);
      spr.img = c;
      spr.white = whiteOf(c);
    };
    im.onerror = () => console.warn('asset load failed', url);
    im.src = url;
  }
}
