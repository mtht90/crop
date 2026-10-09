// =====================================================================
//  パチンコの液晶 (1024×720 Canvas)
//   数字図柄 3 列の変動、リーチ (ノーマル / SP / SPSP / 全回転)、ステップアップ予告、擬似連、
//   カットイン、保留アイコン (先読みの色)、大当たりラウンド、ST / 時短のステージ
// =====================================================================
const W = 1024, H = 720;
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const HOLD = { white: '#e8e8f0', blue: '#3aa0ff', green: '#4dff7a', red: '#ff3b4b', gold: '#ffd23f', rainbow: null };
const CUT = { blue: ['#3aa0ff', '#0a3cc0'], green: ['#5dff7a', '#0a8a2a'], red: ['#ff4a4a', '#9a0010'], gold: ['#fff07a', '#d08a00'] };

export class PScreen {
  constructor(canvas, images, font) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.img = images;
    this.font = font;
    this.now = 0;
    this.v = null;          // 変動中
    this.vt = 0;            // 変動開始時刻
    this.digits = [7, 3, 5];// 表示中の停止図柄
    this.holds = { heso: [], denchu: [] };
    this.mode = 'normal';
    this.modeLeft = 0;
    this.round = null;
    this.banner = null;     // { text, color, t0, dur }
    this.flash = 0;
    this.rightArrow = false;
  }

  // ---------------- 外部 API ----------------
  startVariation(v) { this.v = v; this.vt = this.now; this.stopped = [false, false, false]; }
  endVariation() { if (this.v) this.digits = this.v.digits; this.v = null; }
  show(text, color = '#fff', dur = 2) { this.banner = { text, color, t0: this.now, dur }; }

  // 変動の進み具合から各列の状態を求める
  // 停止順は 左 → 右 → 中。リーチは右が止まって左右がそろったとき
  layout(v, t) {
    const T = v.time;
    const pseudo = v.gijiren || 0;
    const seg = T / (pseudo + 1);                  // 擬似連 1 回ぶんの長さ
    const k = Math.floor(t / seg);                 // 何回目の変動か
    const lt = t - k * seg;
    const last = k >= pseudo;
    const stopL = Math.min(seg * 0.35, 2.2), stopR = stopL + Math.min(seg * 0.15, 0.9);
    const st = { k, lt, last, stopL: lt > stopL, stopR: lt > stopR, stopC: last && t >= T - 0.05, reach: false, reachT: 0 };
    if (!last) st.stopC = lt > seg - 0.25;         // 擬似連: 中も一瞬止まって再変動
    st.reach = last && v.reach && st.stopR;
    st.reachT = lt - stopR;
    return st;
  }

  draw(t) {
    this.now = t;
    const x = this.x;
    const v = this.v;
    // ---- 背景 (状態でステージが変わる)
    const stage = this.round ? 'round' : v && v.reach && this.layout(v, t - this.vt).reach && v.reach !== 'normal' ? 'sp' : this.mode;
    const bgs = { normal: ['#2a3aa8', '#070720'], st: ['#7a1aa8', '#14031f'], jitan: ['#0a7a5a', '#02140f'], sp: ['#a8102a', '#1a0208'], round: ['#d07a00', '#2a1000'] };
    const [c0, c1] = bgs[stage] || bgs.normal;
    const g = x.createRadialGradient(W / 2, H * 0.45, 30, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.translate(W / 2, H * 0.45); x.rotate(t * (stage === 'normal' ? 0.05 : 0.4));
    for (let i = 0; i < 24; i += 2) { x.rotate(Math.PI / 6); x.fillStyle = 'rgba(255,230,160,0.07)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(1100, -100); x.lineTo(1100, 100); x.fill(); }
    x.restore();
    if (this.round) this.drawRound(t);
    else {
      // ピエロ (通常時は左下で待機、リーチ中は応援)
      const im = this.img.clown;
      if (im) {
        const hh = stage === 'sp' ? 330 : 240;
        const ww = im.width * (hh / im.height);
        x.save(); x.globalAlpha = stage === 'sp' ? 0.35 : 0.9;
        x.drawImage(im, stage === 'sp' ? W / 2 - ww / 2 : 30, H - hh - 70 + Math.sin(t * 2.5) * 6, ww, hh);
        x.restore();
      }
      this.drawDigits(t);
      if (v) this.drawPreviews(t);
    }
    this.drawHud(t);
    if (this.banner) {
      const b = this.banner, bt = t - b.t0;
      if (bt > b.dur) this.banner = null;
      else {
        const a = Math.min(1, bt * 5) * Math.min(1, (b.dur - bt) * 4);
        const pop = 1 + (1 - ease(bt / 0.3)) * 0.5;
        x.save(); x.globalAlpha = a; x.translate(W / 2, H * 0.42); x.scale(pop, pop);
        this.text(b.text, 0, 0, 120, b.color === 'rainbow' ? this.rainbow(t) : b.color);
        x.restore();
      }
    }
    if (this.flash > 0) { x.fillStyle = `rgba(255,255,255,${this.flash})`; x.fillRect(0, 0, W, H); this.flash = Math.max(0, this.flash - 0.04); }
  }

  // 数字図柄 3 列
  drawDigits(t) {
    const x = this.x;
    const v = this.v;
    const st = v ? this.layout(v, t - this.vt) : null;
    const colX = [W * 0.25, W * 0.75, W * 0.5];     // 左・右・中の表示位置 (停止順に並べ替え済み)
    const cy = H * 0.42, cell = 230;
    const order = [0, 2, 1];                           // digits の添字 [左, 中, 右] → 停止順 [左, 右, 中]
    const zenkai = v && v.reach === 'zenkaiten' && st.stopR;
    for (let c = 0; c < 3; c++) {
      const di = order[c];
      const stopped = !v || (c === 0 ? st.stopL : c === 1 ? st.stopR : st.stopC);
      let num, off = 0;
      if (zenkai && st.last) {
        // 全回転: 3 列そろったまま回る
        const sp = Math.max(0.6, 8 - st.reachT * 0.6);
        const pos = (t * sp) % 9;
        num = 1 + Math.floor(pos);
        off = (pos % 1) * cell;
        if (st.stopC) { num = v.digits[di]; off = 0; }
      } else if (stopped) {
        num = v ? (st.last ? v.digits[di] : this.pseudoDigit(v, st.k, di)) : this.digits[di];
      } else {
        // 回転中 (リーチ後の中列はスロー)
        const slow = c === 2 && st.reach ? Math.max(0.9, 7 - st.reachT * (v.reach === 'normal' ? 0.6 : 0.35)) : 12;
        const pos = (t * slow + c * 3.3) % 9;
        num = 1 + Math.floor(pos);
        off = (pos % 1) * cell;
      }
      const hot = v && st.reach && (c !== 2 || st.stopC);
      for (let k = -1; k <= 1; k++) {
        const n = ((num - 1 + k + 9) % 9) + 1;
        const yy = cy + k * cell - off + (k === 0 ? 0 : 0);
        if (yy < -cell || yy > H + cell) continue;
        x.save();
        x.globalAlpha = k === 0 ? 1 : 0.35;
        this.digit(n, colX[c], yy, k === 0 && stopped ? 1 : 0.92, hot, t);
        x.restore();
      }
    }
    if (st && st.reach) {
      const label = { normal: 'リーチ', sp: 'SPリーチ', spsp: 'SPSPリーチ', zenkaiten: '全回転!!' }[v.reach];
      const a = Math.min(1, st.reachT * 4);
      x.save(); x.globalAlpha = a;
      this.text(label, W / 2, H * 0.12, v.reach === 'normal' ? 70 : 84, v.reach === 'zenkaiten' ? this.rainbow(t) : v.reach === 'spsp' ? '#ffd23f' : '#fff');
      x.restore();
    }
  }

  // 擬似連の途中で止まる出目 (左右だけそろわない)
  pseudoDigit(v, k, di) {
    const base = (v.digits[0] + k * 2) % 9 + 1;
    return di === 1 ? (base % 9) + 1 : di === 2 ? ((base + 4) % 9) + 1 : base;
  }

  digit(n, cx, cy, s, hot, t) {
    const x = this.x;
    x.save(); x.translate(cx, cy); x.scale(s, s);
    const odd = n % 2 === 1;
    x.font = `400 210px ${this.font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    if (hot) { x.shadowColor = '#ffe14d'; x.shadowBlur = 40; }
    x.lineWidth = 26; x.strokeStyle = '#140018'; x.strokeText(String(n), 0, 8);
    x.shadowBlur = 0;
    const g = x.createLinearGradient(0, -100, 0, 100);
    if (odd) { g.addColorStop(0, '#ff9a8a'); g.addColorStop(0.5, '#e3001b'); g.addColorStop(1, '#6a0010'); }
    else { g.addColorStop(0, '#9ad8ff'); g.addColorStop(0.5, '#0a5cff'); g.addColorStop(1, '#03205e'); }
    x.fillStyle = g; x.fillText(String(n), 0, 8);
    x.restore();
  }

  // 変動中の予告 (ステップアップ・擬似連の NEXT・カットイン)
  drawPreviews(t) {
    const x = this.x, v = this.v;
    const vt = t - this.vt;
    const st = this.layout(v, vt);
    // ステップアップ: 変動開始から 0.5 秒ごとに 1 段
    if (v.stepUp > 0 && vt < v.stepUp * 0.55 + 0.6) {
      const step = Math.min(v.stepUp, 1 + Math.floor(vt / 0.55));
      const col = ['#3aa0ff', '#4dff7a', '#ff3b4b', '#ffd23f', null][step - 1];
      x.save(); x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, H * 0.3, W, 180);
      this.text(`STEP ${step}`, W / 2, H * 0.3 + 90, 110, col || this.rainbow(t));
      x.restore();
    }
    // 擬似連の NEXT
    if (st.k > 0 && st.lt < 1.0) {
      x.save(); x.globalAlpha = 1 - st.lt;
      this.text(`NEXT ×${st.k + 1}`, W / 2, H * 0.7, 100, st.k >= 3 ? this.rainbow(t) : '#ffd23f');
      x.restore();
    }
    // カットイン (SP 以上のリーチの途中)
    if (v.cutin && v.cutin !== 'none' && st.reach && st.reachT > 3 && st.reachT < 4.6) {
      const k = ease((st.reachT - 3) / 0.25);
      const c = CUT[v.cutin];
      x.save(); x.translate((1 - k) * -W, 0);
      const gr = x.createLinearGradient(0, H * 0.35, 0, H * 0.65); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
      x.fillStyle = gr; x.beginPath(); x.moveTo(0, H * 0.33); x.lineTo(W, H * 0.38); x.lineTo(W, H * 0.62); x.lineTo(0, H * 0.67); x.fill();
      this.text(v.cutin === 'gold' ? '激アツ!!' : v.cutin === 'red' ? 'チャンス!' : 'CHANCE', W / 2, H / 2, 120, '#fff');
      x.restore();
    }
  }

  drawRound(t) {
    const r = this.round;
    const x = this.x;
    this.text(r.done ? '' : `ROUND ${Math.min(r.n, r.rounds)} / ${r.rounds}`, W / 2, H * 0.18, 90, '#fff');
    this.text(`${r.paid}`, W / 2, H * 0.45, 170, '#ffe14d', '#140018', 'DSEG7');
    this.text('玉', W * 0.8, H * 0.5, 70, '#fff');
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(W * 0.2, H * 0.62, W * 0.6, 26);
    x.fillStyle = this.rainbow(t); x.fillRect(W * 0.2, H * 0.62, W * 0.6 * Math.min(1, r.count / 10), 26);
    this.text(`${r.chain} 連目`, W / 2, H * 0.74, 64, '#fff');
    this.text('右打ち →', W / 2, H * 0.86, 60, '#ffd23f');
  }

  // 下部: 保留アイコン、状態表示、右打ち指示
  drawHud(t) {
    const x = this.x;
    const all = [...this.holds.denchu, ...this.holds.heso];
    for (let i = 0; i < 4; i++) {
      const h = all[i];
      const cx = W * 0.32 + i * 80, cy = H - 40;
      x.beginPath(); x.arc(cx, cy, 24, 0, Math.PI * 2);
      if (h) {
        const col = HOLD[h.color];
        x.fillStyle = col || `hsl(${(t * 300 + i * 40) % 360},100%,60%)`;
        x.shadowColor = x.fillStyle; x.shadowBlur = h.color === 'white' ? 0 : 18;
        x.fill(); x.shadowBlur = 0;
      } else { x.strokeStyle = 'rgba(255,255,255,0.3)'; x.lineWidth = 3; x.stroke(); }
    }
    if (this.mode === 'st' || this.mode === 'jitan') {
      this.text(this.mode === 'st' ? `ST 残り ${this.modeLeft} 回` : `時短 残り ${this.modeLeft} 回`, W * 0.78, H - 40, 46, this.mode === 'st' ? '#ff7ad8' : '#7affc0');
    }
    if (this.rightArrow && !this.round) {
      const a = 0.6 + 0.4 * Math.sin(t * 8);
      x.save(); x.globalAlpha = a; this.text('右打ち →', W * 0.84, 60, 54, '#ffd23f'); x.restore();
    }
  }

  text(str, cx, cy, size, fill, stroke = '#140018', font = this.font) {
    const x = this.x;
    x.font = `${font === 'DSEG7' ? 700 : 400} ${size}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = size * 0.16; x.strokeStyle = stroke; x.strokeText(str, cx, cy);
    x.fillStyle = fill; x.fillText(str, cx, cy);
  }

  rainbow(t) {
    const g = this.x.createLinearGradient(0, 0, W, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + t * 240) % 360},100%,60%)`);
    return g;
  }
}
