// =====================================================================
//  隣の台 (オートプレイ)
//   自台のクローンだが、液晶・データカウンター・7 セグ・千円入れ機は独自の Canvas に差し替え、
//   リールも自分のタイミングで回す。自台とは連動しない。
//   当たりは合算 1/168 前後で、告知 → ボーナス → 連チャンゾーンまで一通り進む。
// =====================================================================
import * as THREE from 'three';
import { Screen } from './screen.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class Neighbor {
  constructor({ cab, clone, x, cfg, audio }) {
    this.cab = cab;
    this.cfg = cfg;
    this.audio = audio;
    this.x = x;
    // 元の台と同じ順でたどって、差し替える部品を見つける
    const orig = [], cl = [];
    cab.group.traverse((o) => orig.push(o));
    clone.traverse((o) => cl.push(o));
    const reelMeshes = cab.reels.map((r) => r.mesh);
    this.reels = [];
    const font = cfg.assets.jpFonts.display;
    // 液晶
    const lc = document.createElement('canvas'); lc.width = 512; lc.height = 256;
    const big = document.createElement('canvas'); big.width = 1024; big.height = 512;
    this.screenCanvas = big;
    this.screen = new Screen(big, cab.assets.images, font);
    this.screen.grapePay = cfg.roles.GRAPE.pay;
    this.lcdCanvas = lc;
    this.lcdTex = new THREE.CanvasTexture(lc); this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    // データカウンター
    this.counterCanvas = document.createElement('canvas'); this.counterCanvas.width = 768; this.counterCanvas.height = 320;
    this.counterTex = new THREE.CanvasTexture(this.counterCanvas); this.counterTex.colorSpace = THREE.SRGBColorSpace;
    // 7 セグ (クレジット / 払い出し / ゲーム数)
    this.segCanvas = document.createElement('canvas'); this.segCanvas.width = 512; this.segCanvas.height = 96;
    this.segTex = new THREE.CanvasTexture(this.segCanvas); this.segTex.colorSpace = THREE.SRGBColorSpace;
    // 千円入れ機
    this.changerCanvas = document.createElement('canvas'); this.changerCanvas.width = 256; this.changerCanvas.height = 512;
    this.changerTex = new THREE.CanvasTexture(this.changerCanvas); this.changerTex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < orig.length; i++) {
      const o = orig[i], c = cl[i];
      if (!c || !o.isMesh) continue;
      const map = o.material && o.material.map;
      if (map && map === cab.artTex) c.material = new THREE.MeshStandardMaterial({ map: this.lcdTex, emissiveMap: this.lcdTex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.3 });
      else if (map && map === cab.counterTex) c.material = new THREE.MeshBasicMaterial({ map: this.counterTex, toneMapped: false, color: 0xbbbbbb });
      else if (map && map === cab.segTex) c.material = new THREE.MeshBasicMaterial({ map: this.segTex, toneMapped: false, color: 0xbbbbbb });
      else if (map && map === cab.changerTex) c.material = new THREE.MeshBasicMaterial({ map: this.changerTex, toneMapped: false, color: 0x999999 });
      const ri = reelMeshes.indexOf(o);
      if (ri >= 0) this.reels[ri] = { mesh: c, s: Math.floor(Math.random() * 21), state: 'stopped', target: 0, v: 0 };
    }
    this.N = cab.logic.N;
    // 台の状態
    this.stats = { games: 0, big: 0, reg: 0, sinceBonus: Math.floor(rnd(0, 300)), graph: [0], normalGames: 0, grape: 0, cherry: 0, maxHamari: 0, history: [] };
    this.stats.games = this.stats.sinceBonus + Math.floor(rnd(0, 2000));
    this.stats.normalGames = this.stats.games;
    this.stats.big = Math.floor(this.stats.games / 290 * rnd(0.5, 1.5));
    this.stats.reg = Math.floor(this.stats.games / 450 * rnd(0.5, 1.5));
    this.stats.grape = Math.floor(this.stats.normalGames / rnd(7.1, 7.9));
    this.stats.cherry = Math.floor(this.stats.normalGames / rnd(32, 40));
    let d = 0;
    for (let i = 0; i < 30; i++) { d += rnd(-140, 120); this.stats.graph.push(Math.round(d)); }
    this.mode = 'normal';       // normal | lit | BIG | REG
    this.bonusLeft = 0;
    this.zone = 0;
    this.chain = 0;
    this.phase = 'wait';        // wait | spin
    this.t = rnd(0, 6);
    this.wait = rnd(1, 6);
    this.stopAt = [];
    this.drawT = 0;
    this.drawCounter();
    this.drawSeg(0);
    this.drawChanger();
  }

  get active() { return this.mode !== 'normal'; }

  // ---------------- 1 ゲーム ----------------
  startGame() {
    this.phase = 'spin';
    this.t = 0;
    const fast = this.mode === 'BIG' || this.mode === 'REG';
    this.stopAt = [rnd(0.7, 1.1), rnd(1.3, 1.8), rnd(1.9, 2.5)].map((v) => v * (fast ? 0.8 : 1));
    this.reels.forEach((r) => { r.state = 'spin'; });
    this.stopped = 0;
    this.result = this.draw();
    const scr = this.screen;
    if (this.mode === 'normal') {
      this.stats.games++; this.stats.normalGames++; this.stats.sinceBonus++;
      this.stats.maxHamari = Math.max(this.stats.maxHamari, this.stats.sinceBonus);
      if (this.zone > 0) this.zone--;
      if (this.result.bonus && this.result.notice === 'lever') this.light();
      else if (Math.random() < (this.result.bonus ? 0.5 : 0.04) && scr.scene === 'idle') {
        scr.preview({ type: ['balls', 'face', 'cutin', 'seven'][Math.floor(Math.random() * 4)], color: this.result.bonus ? 'red' : 'blue', sevens: this.result.bonus ? 3 : 1, hit: !!this.result.bonus });
      }
    } else if (this.mode !== 'lit') {
      this.stats.games++;
    }
  }

  draw() {
    if (this.mode === 'BIG' || this.mode === 'REG') return { pay: Math.random() < 0.7 ? 15 : 0 };
    if (this.mode === 'lit') return { align: Math.random() < 0.7 };
    const r = Math.random();
    const bonusP = 1 / 168;
    if (r < bonusP) return { bonus: Math.random() < 0.62 ? 'BIG' : 'REG', notice: Math.random() < 0.25 ? 'lever' : 'release' };
    if (r < bonusP + 1 / 7.5) return { grape: true };
    if (r < bonusP + 1 / 7.5 + 1 / 36) return { cherry: true };
    return {};
  }

  light() {
    this.mode = 'lit';
    this.pending = this.result.bonus;
    this.screen.set('lit', { premium: Math.random() < 0.1 });
    this.audio.play('peka', { gain: 0.1, rate: 1.15 + Math.random() * 0.1 });
  }

  endGame() {
    this.phase = 'wait';
    this.t = 0;
    const res = this.result;
    const scr = this.screen;
    let pay = 0;
    if (this.mode === 'normal') {
      if (res.bonus) this.light();
      else {
        if (scr.pv) scr.fail();
        if (res.grape) { this.stats.grape++; pay = this.cfg.roles.GRAPE.pay; }
        if (res.cherry) { this.stats.cherry++; pay = this.cfg.roles.CHERRY.pay; }
      }
      this.wait = Math.random() < 0.06 ? rnd(8, 20) : rnd(0.8, 2.2); // ときどき手を止める
    } else if (this.mode === 'lit') {
      if (res.align) {
        const type = this.pending;
        this.mode = type;
        this.stats[type === 'BIG' ? 'big' : 'reg']++;
        this.chain = this.stats.sinceBonus <= 100 && this.chain > 0 ? this.chain + 1 : 1;
        this.stats.sinceBonus = 0;
        this.bonusMax = this.cfg.bonus[type].maxPay;
        this.bonusPaid = 0;
        scr.set('bonus', { type, max: this.bonusMax, chain: this.chain });
        this.audio.play(type === 'BIG' ? 'fanfare_big' : 'fanfare_reg', { gain: 0.08 });
      }
      this.wait = rnd(1.5, 3);
    } else {
      pay = res.pay;
      this.bonusPaid += pay;
      scr.bonus.paid = this.bonusPaid;
      if (this.bonusPaid >= this.bonusMax) {
        scr.set('result', { type: this.mode, paid: this.bonusPaid, chain: this.chain, total: this.bonusPaid });
        this.mode = 'normal';
        this.zone = this.cfg.chain?.zoneGames || 100;
      }
      this.wait = rnd(0.5, 1.2);
    }
    const g = this.stats.graph;
    if (this.stats.games % 10 === 0) g.push((g[g.length - 1] || 0) + pay * 10 - 30);
    if (g.length > 200) g.splice(1, 1);
    this.drawSeg(pay);
    this.drawCounter();
  }

  update(dt) {
    this.t += dt;
    if (this.phase === 'wait' && this.t > this.wait) this.startGame();
    if (this.phase === 'spin') {
      for (let i = 0; i < 3; i++) {
        const r = this.reels[i];
        if (!r) continue;
        if (r.state === 'spin') {
          r.s += dt * 21 * 1.3;
          if (this.t > this.stopAt[i]) {
            r.state = 'stopped';
            r.s = Math.ceil(r.s) % this.N;
            this.stopped++;
            this.screen.step(this.stopped);
            if (this.stopped === 3) this.endGame();
          }
        }
      }
    }
    for (const r of this.reels) if (r) r.mesh.rotation.x = (r.s + 0.5) * (Math.PI * 2 / this.N) - Math.PI;
    // 液晶 (12fps で描いて縮小コピー)
    this.drawT += dt;
    if (this.drawT > 1 / 12) {
      this.drawT = 0;
      this.screen.status.zone = this.mode === 'normal' ? this.zone : 0;
      this.screen.status.chain = this.chain;
      this.screen.draw(performance.now() / 1000);
      this.lcdCanvas.getContext('2d').drawImage(this.screenCanvas, 0, 0, 512, 256);
      this.lcdTex.needsUpdate = true;
    }
  }

  drawCounter() {
    // 自台のカウンター描画をそのまま使う
    this.cab.setCounter.call({ counterCanvas: this.counterCanvas, counterTex: this.counterTex, cfg: this.cfg }, { ...this.stats, since: this.stats.sinceBonus });
  }

  drawSeg(pay) {
    const x = this.segCanvas.getContext('2d');
    x.fillStyle = '#100204'; x.fillRect(0, 0, 512, 96);
    x.font = '700 64px DSEG7'; x.textAlign = 'right';
    const draw = (v, cx, d) => {
      x.fillStyle = 'rgba(255,40,40,0.12)'; x.fillText('8'.repeat(d), cx, 78);
      x.fillStyle = '#ff2a2a'; x.fillText(String(v), cx, 78);
    };
    draw(Math.floor(rnd(30, 500)), 190, 3); draw(pay || '', 330, 2); draw(this.stats.sinceBonus % 1000, 500, 3);
    this.segTex.needsUpdate = true;
  }

  drawChanger() {
    const x = this.changerCanvas.getContext('2d');
    x.fillStyle = '#05070c'; x.fillRect(0, 0, 256, 512);
    x.font = `400 26px ${this.cfg.assets.jpFonts.display}`; x.fillStyle = '#9fd8ff'; x.textAlign = 'center';
    x.fillText('残高', 128, 60);
    x.font = '700 44px DSEG7'; x.fillStyle = '#3bff8a'; x.fillText(String(Math.floor(rnd(0, 20)) * 1000), 128, 120);
    this.changerTex.needsUpdate = true;
  }
}
