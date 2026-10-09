// =====================================================================
//  演出ディレクター: 予告 → フリーズ → テンパイ → 告知 → ボーナス
//  演出の“抽選”はフラグに応じて CONFIG.effects のテーブルから行う
// =====================================================================
import * as THREE from 'three';
import { screenFlash } from './fx.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pickWeighted(table, rng = Math.random) {
  const tot = Object.values(table).reduce((a, b) => a + b, 0);
  let r = rng() * tot;
  for (const [k, w] of Object.entries(table)) { r -= w; if (r < 0) return k; }
  return Object.keys(table)[0];
}

export class Director {
  constructor(ctx) {
    Object.assign(this, ctx); // cfg, cab, lcd, audio, haptics, shaker, coins, sparks, machine, rig, bloom
    this.debugForce = { yokoku: 'auto', freeze: false, notice: 'auto' };
    this.pendingNotice = false;
  }

  // ------------------------------------------------------------
  // ゲーム開始時の演出計画
  // ------------------------------------------------------------
  plan(flag) {
    const E = this.cfg.effects;
    const plan = { yokoku: 'none', freeze: false, notice: null, stopLed: '#3cf', reach: false };
    const isBonusGame = !!flag.bonus && !this.machine.noticed;
    let tableKey = 'NONE';
    if (flag.newBonus) tableKey = 'BONUS';
    else if (flag.small && E.yokoku[flag.small]) tableKey = flag.small;
    plan.yokoku = this.machine.mode === 'normal' ? pickWeighted(E.yokoku[tableKey]) : 'none';
    if (flag.newBonus && Math.random() < (E.freeze[flag.newBonus] || 0)) plan.freeze = true;
    if (isBonusGame) {
      // 持ち越し中 (告知前) は lever / thirdStop のどちらかで必ず告知
      plan.notice = flag.newBonus ? pickWeighted(E.notice) : (Math.random() < 0.5 ? 'lever' : 'thirdStop');
    }
    // デバッグ強制
    if (this.debugForce.yokoku !== 'auto' && this.machine.mode === 'normal') plan.yokoku = this.debugForce.yokoku;
    if (this.debugForce.freeze && flag.newBonus) { plan.freeze = true; }
    if (this.debugForce.notice !== 'auto' && isBonusGame) plan.notice = this.debugForce.notice;
    if (plan.freeze) plan.notice = 'freeze';
    // ストップボタン LED 色 (虹は確定)
    plan.stopLed = { none: '#3cf', weak: '#3cf', mid: '#ffd400', strong: '#ff2a2a' }[plan.yokoku];
    if (flag.bonus && Math.random() < 0.12) plan.stopLed = 'rainbow';
    this.current = plan;
    return plan;
  }

  // ------------------------------------------------------------
  // レバーON
  // ------------------------------------------------------------
  async onLever(flag, plan) {
    const L = this.cab.lights;
    L.mode = this.machine.mode !== 'normal' ? 'rainbow' : 'idle';
    L.ledMode = 'chase';
    L.flicker = 0;
    if (this.pendingNotice && flag.bonus && !this.machine.noticed) {
      this.pendingNotice = false;
      await this.notice('遅れ告知');
    }
    if (plan.freeze) { await this.freeze(flag); return; }
    await this.yokoku(plan.yokoku);
    if (plan.notice === 'lever') await this.notice('先告知');
  }

  async yokoku(level) {
    const L = this.cab.lights;
    switch (level) {
      case 'weak':
        this.audio.play('yokoku', { gain: 0.8 });
        this.lcd.play('flash', { color: '#2a7bff', dur: 0.4, alpha: 0.7 });
        this.lcd.play('text', { text: '?', size: 160, color: '#7fc4ff', dur: 1.0 });
        this.haptics.vibrate('yokokuWeak');
        break;
      case 'mid':
        this.audio.play('yokoku', { rate: 0.9 });
        this.audio.play('charge', { gain: 0.6, delay: 0.05 });
        this.lcd.play('stripes', { color: '#ffd400', dur: 1.8 });
        this.lcd.play('text', { text: 'CHANCE!', color: '#ffe14d', stroke: '#3a2400', size: 120, dur: 1.8 });
        L.mode = 'chance';
        this.haptics.vibrate('yokokuMid');
        this.shaker.add(0.25);
        this.bloomKick(0.4);
        break;
      case 'strong':
        this.audio.duck(0.2, 1500);
        this.audio.play('charge', { rate: 0.8 });
        this.audio.play('reach', { delay: 0.25 });
        this.lcd.play('flash', { color: '#ff0000', dur: 0.5 });
        this.lcd.play('flames', { dur: 2.2 });
        this.lcd.play('text', { text: '激アツ!!', color: '#ff2a2a', glow: '#ff6a00', stroke: '#fff2c0', size: 150, dur: 2.2, shake: 18 });
        L.mode = 'chance'; L.ledMode = 'flash';
        screenFlash('#ff2040', 300, 0.35);
        this.haptics.vibrate('yokokuStrong');
        this.shaker.add(0.6);
        this.bloomKick(0.9);
        this.rig.zoom = 0.25;
        setTimeout(() => { this.rig.zoom = 0; }, 900);
        await wait(250);
        break;
      default:
    }
  }

  // ------------------------------------------------------------
  // フリーズ: 暗転 → 割れ → 逆回転 → 7揃い停止 → 確定
  // ------------------------------------------------------------
  async freeze(flag) {
    const L = this.cab.lights;
    const cab = this.cab;
    this.audio.duck(0.0, 6000);
    L.mode = 'off';
    L.backlightTarget = [0, 0, 0];
    this.lcd.blackout = 1;
    this.audio.play('freeze', { gain: 1.2 });
    this.haptics.vibrate('freeze');
    this.shaker.add(1.0);
    this.rig.zoom = 0.45;
    await wait(1500);
    this.audio.play('shatter', { gain: 1.1 });
    this.lcd.blackout = 0;
    this.lcd.play('crack', { dur: 2.6 });
    this.lcd.play('flash', { color: '#ffffff', dur: 0.35 });
    screenFlash('#ffffff', 350, 0.9);
    this.shaker.add(0.8);
    this.bloomKick(1.4);
    await wait(700);
    // 逆回転
    L.backlightTarget = [0.7, 0.7, 0.7];
    L.flicker = 1;
    const ch = this.audio.play('charge', { loop: true, gain: 0.7, rate: 0.6 });
    for (let i = 0; i < 3; i++) cab.forceSpin(i, 0.14, -1);
    await wait(1700);
    ch?.stop(0.2);
    L.flicker = 0;
    // 7 を中段へ 1 リールずつ
    const pos = this.machine.logic.bonusStopPositions(flag.bonus);
    for (let i = 0; i < 3; i++) {
      const r = cab.reels[i];
      r.state = 'stopped'; r.s = pos[i]; r.bounceT = 0;
      L.backlightTarget[i] = 2.2;
      this.audio.play('reel_stop', { rate: 0.7, gain: 1.4 });
      this.audio.play('lever', { rate: 0.6, gain: 0.8 });
      this.haptics.vibrate([80]);
      this.shaker.punch(0, -0.012, 0);
      this.sparks.emit(new THREE.Vector3((i - 1) * 0.2, 1.37, 0.32), 40, { color: flag.bonus === 'BIG' ? '#ff3040' : '#3080ff', speed: 1.4 });
      await wait(520);
    }
    this.rig.zoom = 0;
    await this.notice('FREEZE', true);
    await wait(900);
    L.backlightTarget = [1, 1, 1];
    L.mode = 'rainbow';
  }

  // ------------------------------------------------------------
  // 2 リール停止時: テンパイ (=ボーナス確定のリーチ目)
  // ------------------------------------------------------------
  onSecondStop(stops, flag) {
    const tp = this.machine.logic.tenpai(stops).filter((t) => t.combo[0] === t.combo[1] || t.combo[1] === t.combo[0]);
    const seven = tp.find((t) => 'RB'.includes(t.need) || t.need === 'A');
    if (!seven || this.machine.mode !== 'normal') return false;
    const L = this.cab.lights;
    const open = seven.open;
    this.audio.play('reach', { gain: 1.1 });
    this.lcd.play('stripes', { color: '#ff2a55', dur: 2.4, exclusive: true });
    this.lcd.play('text', { text: 'REACH!', color: '#fff', glow: '#ff2a55', stroke: '#5a0018', size: 130, dur: 2.4, shake: 8 });
    this.haptics.vibrate('reach');
    L.ledMode = 'rise';
    L.backlightTarget = [0.25, 0.25, 0.25];
    L.backlightTarget[open] = 1.8;
    this.cab.reels[open].speedMul = this.cfg.effects.reachSlowFactor;
    this.cab.lights.stopLed[open] = 'rainbow';
    this.shaker.add(0.3);
    this.rig.zoom = 0.3;
    this.reachActive = true;
    return true;
  }

  // ------------------------------------------------------------
  // 告知 (DOPA ランプ点灯)
  // ------------------------------------------------------------
  async notice(label = '', fromFreeze = false) {
    if (this.machine.noticed && !fromFreeze) return;
    this.machine.noticed = true;
    const L = this.cab.lights;
    L.lampTarget = 1;
    this.audio.duck(0.3, 1600);
    this.audio.play('flash', { gain: 1.2 });
    this.audio.play('bell', { gain: 0.5, delay: 0.08 });
    this.haptics.vibrate('notice');
    this.shaker.add(0.45);
    this.bloomKick(1.1);
    screenFlash('#ff3fa8', 420, 0.55);
    this.sparks.emit(new THREE.Vector3(-0.377, 1.37, 0.33), 120, { color: '#ff5fc0', speed: 1.6, life: 1.3 });
    this.lcd.play('rainbow', { dur: 1.6 });
    this.lcd.play('icons', { icon: 'star', dur: 1.6, count: 30 });
    this.lcd.play('text', { text: 'BONUS確定!!', rainbow: true, size: 116, dur: 2.4, stroke: '#20002a', sub: label });
    this.lcd.prompt = '7を狙え!!';
    L.ledMode = 'flash';
    L.rainbow = 1;
    setTimeout(() => { L.ledMode = 'chase'; }, 1600);
    await wait(400);
  }

  // ------------------------------------------------------------
  // 精算後の演出
  // ------------------------------------------------------------
  async onSettle(res, flag, plan) {
    const L = this.cab.lights;
    this.rig.zoom = 0;
    this.reachActive = false;
    L.backlightTarget = [1, 1, 1];
    if (res.bonusStart) { await this.bonusStart(res.bonusStart); return; }
    if (res.wins.length) this.cab.flashLines(res.wins.filter((w) => w.line >= 0).map((w) => w.line));
    // 告知 (第3停止)
    if (flag.bonus && !this.machine.noticed && this.machine.mode === 'normal') {
      if (plan.notice === 'thirdStop') await this.notice('');
      else if (plan.notice === 'nextLever') this.pendingNotice = true;
    }
    if (res.replay) {
      this.audio.play('replay', { gain: 0.8 });
      this.lcd.play('win', { text: 'REPLAY', color: '#5fb0ff', dur: 1.0 });
    }
    if (res.pay > 0) {
      const name = res.roleNames.find((n) => n !== 'REPLAY');
      const label = { BELL: 'BELL', BONUS_BELL: 'BELL', SUIKA: 'SUIKA', CHERRY: 'CHERRY' }[name] || name;
      const col = { SUIKA: '#3bff7a', CHERRY: '#ff4a6a' }[name] || '#ffe14d';
      this.lcd.play('win', { text: `${label}  ${res.pay}枚`, color: col, dur: 1.2 });
      if (name === 'SUIKA' || name === 'CHERRY') this.audio.play('small_win', { gain: 0.9 });
      else this.audio.play('small_win', { gain: 0.6, rate: 1.2 });
      await this.payout(res.pay);
    }
    if (res.bonusEnd) await this.bonusEnd(res.bonusEnd);
  }

  async payout(n) {
    const origin = new THREE.Vector3(0, 0.875, this.cab.tray.z0 + 0.03);
    for (let i = 0; i < n; i++) {
      this.coins.spawn(1, origin, 0.5);
      if (i % 2 === 0) this.audio.play('medal_pay', { gain: 0.35, rate: 1 + Math.random() * 0.15 });
      this.haptics.vibrate('payout');
      this.onPayTick?.(i + 1);
      await wait(55);
    }
  }

  async bonusStart(type) {
    const L = this.cab.lights;
    const big = type === 'BIG';
    this.pendingNotice = false;
    L.lampTarget = 0;
    L.rainbow = 1;
    L.mode = 'rainbow';
    L.ledMode = 'flash';
    this.audio.stopBgm(0.1);
    this.audio.play(big ? 'fanfare_big' : 'fanfare_reg', { gain: 1.2 });
    this.audio.play('shatter', { gain: 0.5, rate: 1.4 });
    this.haptics.vibrate('bonusStart');
    this.shaker.add(1.0);
    this.bloomKick(1.8);
    screenFlash('#ffffff', 500, 1);
    this.cab.flashLines([0, 1, 2, 3, 4], 3);
    this.lcd.clear();
    this.lcd.play('flash', { dur: 0.6 });
    this.lcd.play('rainbow', { dur: 3 });
    this.lcd.play('icons', { icon: big ? 'gem' : 'bolt', dur: 2.6, count: 40 });
    this.lcd.play('text', { text: big ? 'BIG BONUS!!' : 'REG BONUS!', rainbow: big, color: '#7fc4ff', size: 120, dur: 3.0, shake: 10 });
    for (let k = 0; k < 4; k++) {
      setTimeout(() => {
        this.coins.burst(big ? 24 : 12, new THREE.Vector3(0, 1.0, 0.45));
        this.sparks.emit(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 0.5, 0.35), 90, { speed: 1.8, life: 1.4 });
        this.audio.play('medal_out', { gain: 0.6, rate: 0.9 + k * 0.1 });
      }, k * 420);
    }
    this.rig.zoom = -0.15;
    await wait(2600);
    this.rig.zoom = 0;
    this.lcd.base = 'bonus';
    this.lcd.prompt = '';
    L.ledMode = 'chase';
    this.audio.bgm(this.cfg.bonus[type].bgm);
  }

  async bonusEnd(info) {
    const L = this.cab.lights;
    this.audio.stopBgm(0.4);
    this.audio.play('bonus_end', { gain: 1 });
    this.lcd.base = 'idle';
    this.lcd.play('rainbow', { dur: 2.5 });
    this.lcd.play('text', { text: `${info.paid}枚 GET!!`, rainbow: true, size: 120, dur: 3.2, sub: `${info.type} ${info.games}G` });
    this.haptics.vibrate([80, 40, 80]);
    this.bloomKick(0.8);
    L.rainbow = 0;
    L.mode = 'idle';
    this.lcd.prompt = 'PULL THE LEVER';
    await wait(1500);
  }

  bloomKick(v) { this.bloom.kick = Math.max(this.bloom.kick, v); }
}
