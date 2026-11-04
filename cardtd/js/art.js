/* カードTD — 素材の読み込みと描画(絵はすべて assets/ の素材パック由来) */
(function (CTD) {
  'use strict';

  const TAU = Math.PI * 2;
  const BASE = 'assets/';
  const IMG = {};
  CTD.IMG = IMG;

  function loadImage(key, src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { IMG[key] = im; resolve(); };
      im.onerror = () => { console.warn('画像を読み込めない:', src); resolve(); };
      im.src = BASE + src;
    });
  }

  // すべての画像を読み込む。onProgress(0..1)
  CTD.loadAssets = function (onProgress) {
    const list = [];
    for (const id of Object.keys(CTD.ASSET_META.units)) {
      list.push(['u:' + id, 'units/' + id + '.webp']);
      list.push(['p:' + id, 'portraits/' + id + '.webp']);
    }
    for (const k of ['meadow', 'forest', 'elven', 'menu']) list.push(['bg:' + k, 'bg/' + k + '.webp']);
    for (const k of ['player', 'enemy', 'p29', 'p30', 'p31', 'p32', 'p54', 'p55', 'p56', 'p57', 'p58']) list.push(['c:' + k, 'castle/' + k + '.webp']);
    for (const k of Object.keys(CTD.ASSET_META.fx)) list.push(['fx:' + k, 'fx/' + k + '.webp']);
    for (const k of ['frame_common', 'frame_rare', 'frame_epic', 'ring', 'ribbon', 'gem_common', 'gem_rare', 'gem_epic', 'cost', 'back', 'booster', 'booster_art']) list.push(['card:' + k, 'cards/' + k + '.webp']);
    for (const k of ['panel', 'panel_dark', 'circle', 'shield', 'i_settings', 'i_pause', 'i_play', 'i_close', 'i_check', 'i_crown', 'i_heart', 'i_star', 'i_back', 'i_ff']) list.push(['ui:' + k, 'ui/' + k + '.webp']);
    let done = 0;
    return Promise.all(list.map(([k, src]) => loadImage(k, src).then(() => { done++; onProgress && onProgress(done / list.length); })));
  };

  CTD.assetURL = (path) => BASE + path;
  CTD.portraitURL = (id) => BASE + 'portraits/' + id + '.webp';

  // ---- ユニット ----
  const FPS = { idle: 8, walk: 11, attack: 0, die: 0 };

  CTD.unitHeight = function (id) {
    const m = CTD.ASSET_META.units[id];
    return m ? m.height : 70;
  };

  // pose: { anim: 'idle'|'walk'|'attack'|'die', t: 経過秒, p: 0..1(攻撃・死亡の進み) }
  CTD.drawUnit = function (ctx, id, pose) {
    const m = CTD.ASSET_META.units[id];
    const im = IMG['u:' + id];
    if (!m || !im) return;
    let anim = pose.anim || 'idle';
    if (!m.anims[anim]) anim = 'idle';
    const a = m.anims[anim];
    let f;
    if (anim === 'attack' || anim === 'die') f = Math.min(a.n - 1, Math.floor((pose.p || 0) * a.n));
    else f = Math.floor((pose.t || 0) * FPS[anim] * (pose.rate || 1)) % a.n;
    const [cw, ch] = m.cell;
    const s = 1 / m.res;
    ctx.drawImage(im, f * cw, a.row * ch, cw, ch, -m.anchor[0] * s, -m.anchor[1] * s, cw * s, ch * s);
  };

  // ---- エフェクト(2D Spell Effects) ----
  // k: 0..1 の進み。loop=true なら k は秒
  CTD.drawFx = function (ctx, name, x, y, k, size, opts = {}) {
    const m = CTD.ASSET_META.fx[name];
    const im = IMG['fx:' + name];
    if (!m || !im) return;
    const f = opts.loop ? Math.floor(k * (opts.fps || 20)) % m.n : Math.min(m.n - 1, Math.floor(k * m.n));
    const sc = size / Math.max(m.w, m.h);
    ctx.save();
    ctx.translate(x, y);
    if (opts.rot) ctx.rotate(opts.rot);
    if (opts.flip) ctx.scale(-1, 1);
    if (opts.add !== false) ctx.globalCompositeOperation = 'lighter';
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    ctx.drawImage(im, f * m.w, 0, m.w, m.h, -m.w * sc / 2, -m.h * sc * (opts.bottom ? 1 : 0.5), m.w * sc, m.h * sc);
    ctx.restore();
  };

  // ---- 城(Free Stone Tower Game Assets を重ねたもの) ----
  CTD.drawCastle = function (ctx, x, gy, side, ratio, t, hitT) {
    const im = IMG[side > 0 ? 'c:player' : 'c:enemy'];
    if (!im) return;
    const shakeX = hitT > 0 ? Math.sin(t * 90) * hitT * 6 : 0;
    const w = 176;
    const h = im.height * (w / im.width);
    ctx.save();
    ctx.translate(x + shakeX, gy);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 2, w * 0.48, 16, 0, 0, TAU); ctx.fill();
    // 傾き: 壊れかけると少し傾く
    if (ratio < 0.33) ctx.rotate(side * 0.03);
    ctx.drawImage(im, -w / 2, -h + 8, w, h);
    // ダメージで石が欠ける
    if (ratio < 0.66 && IMG['c:p30']) ctx.drawImage(IMG['c:p30'], -w * 0.42, -24, 40, 30);
    if (ratio < 0.33 && IMG['c:p31']) ctx.drawImage(IMG['c:p31'], w * 0.12, -20, 46, 30);
    // 陣営の旗
    const col = side > 0 ? '#3a8cff' : '#ff4a3a';
    const top = -h + 4;
    const wave = Math.sin(t * 4);
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, top + 30); ctx.lineTo(0, top - 34); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, top - 34);
    ctx.quadraticCurveTo(side * 18, top - 40 + wave * 3, side * 38, top - 30 + wave * 4);
    ctx.lineTo(0, top - 14);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = '#1c1a24'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    return h;
  };

  // ---- 背景 ----
  CTD.drawBackground = function (ctx, kind, W, H) {
    const im = IMG['bg:' + kind];
    if (im) ctx.drawImage(im, 0, 0, W, H);
    else { ctx.fillStyle = '#3a5a3a'; ctx.fillRect(0, 0, W, H); }
  };

  // 動く背景の粒(ホタル・きらめき)
  CTD.drawAmbient = function (ctx, kind, W, groundY, t) {
    if (kind === 'forest') {
      for (let i = 0; i < 22; i++) {
        const x = (i * 97 + Math.sin(t * 0.5 + i) * 40) % W;
        const y = groundY - 60 - (i * 37 % 260) + Math.sin(t * 0.8 + i * 2) * 14;
        const a = 0.25 + 0.5 * Math.max(0, Math.sin(t * 2 + i));
        ctx.fillStyle = `rgba(230,255,150,${a})`;
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
      }
    } else if (kind === 'elven') {
      for (let i = 0; i < 24; i++) {
        const x = (i * 83 + t * 6) % W;
        const y = (groundY - 40) - ((t * 12 + i * 61) % (groundY - 80));
        const a = 0.2 + 0.4 * Math.max(0, Math.sin(t * 3 + i));
        ctx.fillStyle = `rgba(255,250,200,${a})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  };

  // 角丸の矩形(UI 用)
  CTD.rrect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
})(window.CTD);
