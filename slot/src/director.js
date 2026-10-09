// =====================================================================
//  演出ディレクター
//   ボーナス成立ゲームで「先ペカ (レバーON)」か「後ペカ (第3停止ボタンを離した瞬間)」に液晶が LUCKY!! で光る。
//   後ペカ・ガセのゲームでは液晶の予告がレバーON から停止ごとに昇格する。
//   ペカッ → 一瞬の静寂 → ブイーン (重低音 + 長い振動) → 光の波紋 → 7 を揃えてファンファーレ
// =====================================================================
import * as THREE from 'three';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Director {
  constructor(ctx) {
    Object.assign(this, ctx); // cfg, cab, audio, haptics, shaker, coins, sparks, machine, rig, bloom
    this.debugForce = { notice: 'auto', premium: false, preview: 'auto' };
    this.plan = null;
  }

  // ------------------------------------------------------------
  //  ゲーム開始時: ボーナス成立なら告知タイミングを抽選
  // ------------------------------------------------------------
  planGame(flag) {
    const N = this.cfg.notice;
    const plan = { notice: null, premium: false, lit: false };
    if (flag.bonus && !this.machine.noticed && this.machine.mode === 'normal') {
      plan.notice = Math.random() * (N.lever + N.release) < N.lever ? 'lever' : 'release';
      if (this.debugForce.notice !== 'auto') plan.notice = this.debugForce.notice;
      plan.premium = this.debugForce.premium || Math.random() < N.premium;
    }
    plan.preview = this.pickPreview(flag, plan);
    this.plan = plan;
    return plan;
  }

  // 予告の抽選
  pickPreview(flag, plan) {
    const Y = this.cfg.yokoku;
    if (this.machine.mode !== 'normal' || this.machine.noticed || plan.notice === 'lever') return null;
    const hit = plan.notice === 'release';
    const f = this.debugForce.preview;
    if (f === 'none') return null;
    const rate = hit ? Y.rateHit : flag.small === 'CHERRY' ? Y.rateCherry : Y.rateMiss;
    if (f === 'auto' && Math.random() >= rate) return null;
    const col = hit ? 0 : 1;
    const pick = (table) => {
      const ent = Object.entries(table).filter(([, w]) => w[col] > 0);
      let r = Math.random() * ent.reduce((a, [, w]) => a + w[col], 0);
      for (const [k, w] of ent) { r -= w[col]; if (r < 0) return k; }
      return ent[0][0];
    };
    const type = f !== 'auto' ? f : pick(Y.types);
    const color = pick(Y.cutinColor);
    const sevens = hit ? 3 : (Math.random() * (Y.missSevens[0] + Y.missSevens[1]) < Y.missSevens[0] ? 1 : 2);
    return { type, color, sevens, hit };
  }

  async onLever() {
    const L = this.cab.lights;
    L.mode = this.machine.mode !== 'normal' ? 'rainbow' : (this.machine.noticed ? 'rainbow' : 'idle');
    L.ledMode = 'chase';
    const pv = this.plan?.preview;
    if (pv) {
      this.cab.screen.preview(pv);
      if (pv.type === 'blackout') { this.audio.play('freeze', { gain: 0.8 }); this.haptics.vibrate([60]); L.mode = 'off'; }
      else this.audio.play('yokoku', { gain: 0.8 });
    }
    if (this.plan?.notice === 'lever') this.peka();
  }

  // 第 n 停止: 予告の昇格
  onStop(n) {
    const pv = this.plan?.preview;
    if (!pv || this.plan.lit) return;
    const scr = this.cab.screen;
    scr.step(n);
    const a = this.audio;
    if (pv.type === 'cutin') {
      const c = scr.colorAt(n);
      a.play('cutin', { gain: 0.9, rate: 0.9 + ['blue', 'green', 'red', 'gold', 'rainbow'].indexOf(c) * 0.08 });
      if (c === 'gold' || c === 'rainbow') { a.play('flash', { gain: 0.8 }); this.haptics.vibrate([30, 30, 60]); }
    } else if (pv.type === 'seven') {
      if (n <= pv.sevens) { a.play('title_hit', { gain: 0.9, rate: 0.9 + n * 0.12 }); this.haptics.vibrate([25 * n]); }
      if (n <= pv.sevens && n >= 2) this.shaker.add(0.15 * n);
    } else if (pv.type === 'face') {
      a.play('window', { gain: 0.8, rate: 0.9 + n * 0.1 });
    } else if (pv.type === 'balls') {
      a.play('tick', { gain: 0.7, rate: 1 + n * 0.25 });
    } else if (pv.type === 'blackout') {
      a.play('charge', { gain: 0.5 + n * 0.15, rate: 0.8 + n * 0.1 });
      this.haptics.vibrate([20]);
    }
  }

  // 第3停止ボタンを離した瞬間: 後ペカ、または予告のはずれ
  onThirdRelease() {
    if (this.plan?.notice === 'release' && !this.plan.lit) { this.peka(); return; }
    this.previewFail();
  }

  previewFail() {
    const pv = this.plan?.preview;
    if (!pv || pv.failed) return;
    pv.failed = true;
    this.cab.screen.fail();
    const L = this.cab.lights;
    if (L.mode === 'off') L.mode = 'idle';
    if (pv.type !== 'balls') this.audio.play('lose', { gain: 0.45 });
  }

  // ------------------------------------------------------------
  //  ペカッ
  // ------------------------------------------------------------
  async peka() {
    const p = this.plan || {};
    if (p.lit) return;
    p.lit = true;
    this.machine.noticed = true;
    const L = this.cab.lights;
    const premium = !!p.premium;
    // 一瞬の静寂 → 点灯
    this.audio.duck(0.0, 900);
    await wait(this.cfg.notice.silenceMs);
    L.lampTarget = 1;
    L.lampFlash = 1;
    L.lampPremium = premium;
    this.cab.screen.set('lit', { premium });
    this.audio.play('peka', { gain: 1.0, rate: 1.25 });
    this.haptics.vibrate('peka');
    this.bloomKick(0.5);
    this.cab.ripple(premium ? 0xffffff : 0xff5fc0);
    this.rig.zoom = 0.12;
    await wait(130);
    // ブイーン: 低い唸りがせり上がる + 長い振動
    const b = this.audio.play('buiin', { gain: 1.2, rate: 0.55 });
    b?.rate(1.15);
    setTimeout(() => b?.stop(0.6), 1500);
    this.audio.play('rumble', { gain: 0.9 });
    this.haptics.vibrate(premium ? 'premium' : 'buiin');
    this.shaker.add(0.55);
    this.cab.reelFlash('wave', 0.9);
    L.rainbow = 1;
    L.mode = 'rainbow';
    L.ledMode = 'flash';
    this.sparks.emit(new THREE.Vector3(0, 1.775, 0.34), premium ? 260 : 140, { color: premium ? null : '#ff7fd0', speed: 1.8, life: 1.4 });
    if (premium) {
      this.audio.gyuin(3, { gain: 1.0 });
      setTimeout(() => this.cab.ripple(0xffffff), 400);
      setTimeout(() => this.cab.ripple(0xffffff), 800);
    }
    this.onNotice?.(premium);
    setTimeout(() => { L.ledMode = 'chase'; this.rig.zoom = 0; }, 1400);
  }

  // ------------------------------------------------------------
  //  精算
  // ------------------------------------------------------------
  async onSettle(res) {
    const L = this.cab.lights;
    this.rig.zoom = 0;
    L.backlightTarget = [1, 1, 1];
    // 後ペカのボタン離しを取り逃した場合の保険
    if (this.plan?.notice === 'release' && !this.plan.lit && !res.bonusStart) await this.peka();
    if (!this.plan?.lit) this.previewFail();
    if (this.machine.mode !== 'normal' && this.cab.screen.scene === 'bonus') this.cab.screen.bonus.paid = this.machine.bonusPaid - res.pay;
    if (res.bonusStart) { await this.bonusStart(res.bonusStart, res); return; }
    if (res.wins.length) this.cab.flashLines(res.wins.filter((w) => w.line >= 0).map((w) => w.line), 1.2);
    if (res.replay) this.audio.play('replay', { gain: 0.7 });
    if (res.pay > 0) {
      const name = res.roleNames.find((n) => n !== 'REPLAY');
      if (name === 'BELL' || name === 'CLOWN') { this.audio.play('small_win', { gain: 1 }); this.cab.reelFlash('blink', 0.8); this.haptics.vibrate([40, 30, 40]); }
      else if (name === 'CHERRY') this.audio.play('small_win', { gain: 0.7, rate: 1.1 });
      else this.audio.play('small_win', { gain: 0.5, rate: 1.25 });
      await this.payout(res.pay);
    }
    if (res.bonusEnd) await this.bonusEnd(res.bonusEnd);
  }

  async payout(n) {
    const origin = new THREE.Vector3(0, 0.875, this.cab.tray.z0 + 0.03);
    for (let i = 0; i < n; i++) {
      this.coins.spawn(1, origin, 0.5);
      this.audio.play('tick', { gain: 0.42, rate: 1.6 });
      if (i % 3 === 0) this.audio.play('medal_pay', { gain: 0.3, rate: 1 + Math.random() * 0.15 });
      if (i % 4 === 0) this.haptics.vibrate('payout');
      this.onPayTick?.(i + 1);
      if (this.cab.screen.scene === 'bonus') this.cab.screen.bonus.paid++;
      await wait(65);
    }
  }

  // 7 が揃った瞬間
  async bonusStart(type, res) {
    const L = this.cab.lights;
    const big = type === 'BIG';
    if (!this.plan?.lit) { L.lampFlash = 1; this.cab.ripple(); } // 告知前に揃えた (ブラインド)
    this.cab.screen.set('bonus', { type, max: this.cfg.bonus[type].maxPay });
    this.cab.screen.bonus.paid = this.machine.bonusPaid;
    this.cab.flashLines(res.wins.filter((w) => w.line >= 0).map((w) => w.line), 3);
    this.cab.reelFlash('strobe', 2.6);
    L.reelRainbow = 1;
    this.audio.stopBgm(0.1);
    this.audio.play('reel_stop', { gain: 1.2, rate: 0.7 });
    this.audio.play('rumble', { gain: 1 });
    this.audio.play(big ? 'fanfare_big' : 'fanfare_reg', { gain: 1.3, delay: 0.15 });
    this.haptics.vibrate('bonusStart');
    this.shaker.add(0.9);
    this.bloomKick(1.0);
    L.mode = 'rainbow';
    L.ledMode = 'flash';
    this.onBonusStart?.(type);
    // メダルの噴水
    for (let k = 0; k < (big ? 6 : 3); k++) {
      setTimeout(() => {
        this.coins.burst(big ? 26 : 14, new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.0, 0.45));
        this.sparks.emit(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.3 + Math.random() * 0.5, 0.35), 80, { speed: 1.8, life: 1.4 });
        this.audio.play('medal_out', { gain: 0.6, rate: 0.9 + k * 0.08 });
      }, 200 + k * 330);
    }
    this.rig.zoom = -0.12;
    await wait(1400);
    L.lampTarget = 0; // 揃えたらランプは消える
    L.lampPremium = false;
    await wait(1100);
    this.rig.zoom = 0;
    L.ledMode = 'chase';
    L.reelRainbow = 0;
    this.audio.bgm(this.cfg.bonus[type].bgm);
  }

  async bonusEnd(info) {
    const L = this.cab.lights;
    this.audio.stopBgm(0.4);
    this.audio.play('bonus_end', { gain: 1 });
    this.haptics.vibrate([80, 40, 80]);
    this.bloomKick(0.6);
    L.rainbow = 0;
    L.mode = 'idle';
    this.cab.screen.set('result', { type: info.type, paid: info.paid });
    this.onBonusEnd?.(info);
    await wait(1200);
  }

  // フリーズは使わない (ジャグラー型)。ただしデバッグ用に呼ばれても安全に
  async freeze() {}

  bloomKick(v) { this.bloom.kick = Math.max(this.bloom.kick, v); }
}
