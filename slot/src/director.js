// =====================================================================
//  演出ディレクター (ジャグラー型: 告知ランプのみ)
//   ボーナス成立ゲームで「先ペカ (レバーON)」か「後ペカ (第3停止ボタンを離した瞬間)」。
//   ペカッ → 一瞬の静寂 → ブイーン (重低音 + 長い振動) → 光の波紋 → 7 を揃えてファンファーレ
// =====================================================================
import * as THREE from 'three';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Director {
  constructor(ctx) {
    Object.assign(this, ctx); // cfg, cab, audio, haptics, shaker, coins, sparks, machine, rig, bloom
    this.debugForce = { notice: 'auto', premium: false };
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
    this.plan = plan;
    return plan;
  }

  async onLever() {
    const L = this.cab.lights;
    L.mode = this.machine.mode !== 'normal' ? 'rainbow' : (this.machine.noticed ? 'rainbow' : 'idle');
    L.ledMode = 'chase';
    if (this.plan?.notice === 'lever') this.peka();
  }

  onStop() {}

  // 第3停止ボタンを離した瞬間 (後ペカ)
  onThirdRelease() {
    if (this.plan?.notice === 'release' && !this.plan.lit) this.peka();
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
    this.audio.play('peka', { gain: 1.0, rate: 1.25 });
    this.haptics.vibrate('peka');
    this.bloomKick(0.9);
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
    L.artMode = 'notice';
    this.sparks.emit(new THREE.Vector3(-0.375, 1.3, 0.34), premium ? 260 : 140, { color: premium ? null : '#ff7fd0', speed: 1.8, life: 1.4 });
    if (premium) {
      this.audio.gyuin(3, { gain: 1.0 });
      setTimeout(() => this.cab.ripple(0xffffff), 400);
      setTimeout(() => this.cab.ripple(0xffffff), 800);
    }
    this.onNotice?.(premium);
    setTimeout(() => { L.ledMode = 'chase'; this.rig.zoom = 0; }, 1400);
    setTimeout(() => { if (this.machine.mode === 'normal') L.artMode = 'idle'; }, 2500);
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
      await wait(65);
    }
  }

  // 7 が揃った瞬間
  async bonusStart(type, res) {
    const L = this.cab.lights;
    const big = type === 'BIG';
    if (!this.plan?.lit) { L.lampTarget = 1; L.lampFlash = 1; this.cab.ripple(); } // 告知前に揃えた (ブラインド)
    this.cab.flashLines(res.wins.filter((w) => w.line >= 0).map((w) => w.line), 3);
    this.cab.reelFlash('strobe', 2.6);
    L.reelRainbow = 1;
    this.audio.stopBgm(0.1);
    this.audio.play('reel_stop', { gain: 1.2, rate: 0.7 });
    this.audio.play('rumble', { gain: 1 });
    this.audio.play(big ? 'fanfare_big' : 'fanfare_reg', { gain: 1.3, delay: 0.15 });
    this.haptics.vibrate('bonusStart');
    this.shaker.add(0.9);
    this.bloomKick(1.6);
    this.cab.bonusLabel = big ? 'BIG BONUS' : 'REG BONUS';
    L.artMode = 'bonus';
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
    L.artMode = 'idle';
    this.onBonusEnd?.(info);
    await wait(1200);
  }

  // フリーズは使わない (ジャグラー型)。ただしデバッグ用に呼ばれても安全に
  async freeze() {}

  bloomKick(v) { this.bloom.kick = Math.max(this.bloom.kick, v); }
}
