// =====================================================================
//  演出ディレクター: 物語シナリオ (story.js) → フリーズ → テンパイ → 告知 → ボーナス
//  筐体側 (ランプ・ネオン・振動・メダル) の演出と、液晶の物語をつなぐ
// =====================================================================
import * as THREE from 'three';
import { screenFlash, screenRainbow } from './fx.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));


export class Director {
  constructor(ctx) {
    Object.assign(this, ctx); // cfg, cab, lcd, audio, haptics, shaker, coins, sparks, machine, rig, bloom, story
    this.debugForce = { freeze: false };
  }

  // ------------------------------------------------------------
  // ゲーム開始時の演出計画 (物語シナリオに委譲)
  // ------------------------------------------------------------
  plan(flag) {
    const cur = this.story.plan(flag);
    if (this.debugForce.freeze && flag.newBonus) cur.type = 'freeze';
    const plan = { cur, stopLed: '#3cf' };
    const rank = { blue: '#3cf', green: '#3cf', red: '#ffd400', gold: '#ff2a2a', rainbow: 'rainbow' };
    if (['battle', 'final', 'chest'].includes(cur.type)) plan.stopLed = rank[cur.color] === '#3cf' ? '#ffd400' : rank[cur.color];
    else if (cur.color === 'gold' || cur.color === 'rainbow') plan.stopLed = rank[cur.color];
    if (flag.bonus && !this.machine.noticed && Math.random() < 0.08) plan.stopLed = 'rainbow';
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
    const t = plan.cur.type;
    if (['battle', 'final', 'chest'].includes(t)) { L.mode = 'chance'; L.ledMode = t === 'final' ? 'flash' : 'rise'; }
    // 実機の「遅れ」: レバー音が変わり、リール始動が一瞬遅れる (ボーナス期待)
    const pending = flag.bonus && !this.machine.noticed && this.machine.mode === 'normal';
    if (this.machine.mode === 'normal' && Math.random() < (pending ? 0.12 : 0.004)) {
      this.audio.play('lever', { rate: 0.6, gain: 1.1 });
      this.audio.play('glitch', { gain: 0.4, rate: 0.7 });
      this.haptics.vibrate([60]);
      L.backlightTarget = [0.15, 0.15, 0.15];
      await wait(750);
      L.backlightTarget = [1, 1, 1];
    }
    await this.story.lever();
  }

  onStop(n) { this.story.stop(n); }

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
    const tp = this.machine.logic.tenpai(stops);
    const seven = tp.find((t) => 'RB'.includes(t.need) || t.need === 'A');
    if (!seven || this.machine.mode !== 'normal') return false;
    const L = this.cab.lights;
    const open = seven.open;
    this.audio.play('reach', { gain: 1.1 });
    this.lcd.play('band', { level: 'emergency', dur: 2.4 });
    this.lcd.play('text', { text: 'テンパイ', font: `900 120px ${this.cfg.assets.jpFonts.gothic}`, color: '#fff', glow: '#ff2a55', stroke: '#5a0018', dur: 2.4, shake: 8 });
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
  // 告知 (BONUS ランプ点灯)
  // ------------------------------------------------------------
  async notice(label = '', fromFreeze = false) {
    if (this.machine.noticed && !fromFreeze) return;
    this.machine.noticed = true;
    const L = this.cab.lights;
    // ペカッ → ギュインギュインギュイン + 虹
    L.lampTarget = 1;
    L.rainbow = 1;
    L.reelRainbow = 1;
    L.ledMode = 'flash';
    this.cab.reelFlash('strobe', 1.2);
    this.audio.duck(0.15, 2200);
    this.audio.play('flash', { gain: 1.2 });
    this.audio.gyuin(3, { gain: 1.15 });
    this.audio.play('bell', { gain: 0.45, delay: 1.1 });
    this.haptics.vibrate('notice');
    this.shaker.add(0.6);
    this.bloomKick(1.4);
    screenRainbow(1400);
    this.sparks.emit(new THREE.Vector3(-0.377, 1.37, 0.33), 160, { speed: 1.8, life: 1.4 });
    this.lcd.play('rainbow', { dur: 1.6 });
    this.lcd.play('icons', { icon: 'star', dur: 1.6, count: 30 });
    this.lcd.play('text', { text: 'BONUS 確定', font: `800 120px ${this.cfg.assets.jpFonts.mincho}`, rainbow: true, dur: 2.6, stroke: '#20002a', sub: label, shake: 6 });
    this.lcd.prompt = '7 を狙え';
    setTimeout(() => { L.ledMode = 'chase'; L.reelRainbow = 0; }, 1700);
    await wait(1100);
  }

  // PUSH ボタン待ち (押すか一定時間で自動)。level 2 = 虹色ボタン
  waitPush(level = 1, timeout = 6000) {
    const L = this.cab.lights;
    L.pushLed = level;
    this.lcd.play('push', { dur: 99, hold: true, level });
    this.audio.play('computer', { gain: 0.5 });
    this.haptics.vibrate('push');
    return new Promise((ok) => {
      const done = () => {
        clearTimeout(timer);
        this.pushResolve = null;
        L.pushLed = 0;
        this.lcd.kill('push');
        ok();
      };
      const timer = setTimeout(done, timeout);
      this.pushResolve = () => {
        this.audio.play('title_hit', { gain: 0.9, rate: 1.2 });
        this.haptics.vibrate('pushHit');
        this.shaker.add(0.35);
        done();
      };
    });
  }

  pressPush() {
    if (this.pushResolve) { this.pushResolve(); return true; }
    return false;
  }

  // ------------------------------------------------------------
  // 精算後の演出
  // ------------------------------------------------------------
  async onSettle(res, flag) {
    const L = this.cab.lights;
    this.rig.zoom = 0;
    this.reachActive = false;
    L.backlightTarget = [1, 1, 1];
    const win = await this.story.result(res);
    if (res.bonusStart) { await this.bonusStart(res.bonusStart); return; }
    if (res.wins.length) this.cab.flashLines(res.wins.filter((w) => w.line >= 0).map((w) => w.line));
    if (win && flag.bonus && !this.machine.noticed) await this.notice(this.story.cur.type === 'freeze' ? 'FREEZE' : '');
    if (res.replay) {
      this.audio.play('replay', { gain: 0.8 });
      this.lcd.play('win', { text: 'リプレイ', color: '#5fb0ff', dur: 1.0 });
    }
    if (res.pay > 0) {
      const name = res.roleNames.find((n) => n !== 'REPLAY');
      const label = { BELL: 'ベル', BONUS_BELL: 'ベル', SUIKA: 'スイカ', CHERRY: 'チェリー' }[name] || name;
      const col = { SUIKA: '#3bff7a', CHERRY: '#ff4a6a' }[name] || '#ffe14d';
      this.lcd.play('win', { text: `${label}  ${res.pay}枚`, color: col, dur: 1.2 });
      if (name === 'SUIKA' || name === 'CHERRY') { this.audio.play('small_win', { gain: 0.9 }); this.cab.reelFlash('blink', 0.6); }
      else this.audio.play('small_win', { gain: 0.6, rate: 1.2 });
      await this.payout(res.pay);
    }
    if (res.bonusEnd) await this.bonusEnd(res.bonusEnd);
  }

  async payout(n) {
    const origin = new THREE.Vector3(0, 0.875, this.cab.tray.z0 + 0.03);
    // 実機と同じく 1 枚ずつカウントアップ (払い出し音 + 7セグ PAY 表示)
    for (let i = 0; i < n; i++) {
      this.coins.spawn(1, origin, 0.5);
      this.audio.play('tick', { gain: 0.45, rate: 1.6 });
      if (i % 3 === 0) this.audio.play('medal_pay', { gain: 0.3, rate: 1 + Math.random() * 0.15 });
      if (i % 4 === 0) this.haptics.vibrate('payout');
      this.onPayTick?.(i + 1);
      await wait(70);
    }
  }

  async bonusStart(type) {
    const L = this.cab.lights;
    const big = type === 'BIG';
    L.lampTarget = 0;
    L.rainbow = 1;
    L.mode = 'rainbow';
    L.ledMode = 'flash';
    L.reelRainbow = 1;
    this.cab.reelFlash('strobe', 2.6);
    this.audio.stopBgm(0.1);
    this.audio.gyuin(big ? 4 : 2, { gain: 1.2, gap: 0.3 });
    this.audio.play(big ? 'fanfare_big' : 'fanfare_reg', { gain: 1.25, delay: big ? 1.2 : 0.6 });
    this.audio.play('shatter', { gain: 0.5, rate: 1.4 });
    screenRainbow(2200);
    this.haptics.vibrate('bonusStart');
    this.shaker.add(1.0);
    this.bloomKick(1.8);
    screenFlash('#ffffff', 500, 1);
    this.cab.flashLines([0, 1, 2, 3, 4], 3);
    this.lcd.clear();
    this.lcd.play('flash', { dur: 0.6 });
    this.lcd.play('icons', { icon: big ? 'gem' : 'bolt', dur: 2.6, count: 40 });
    this.story.bonusScene(true);
    this.lcd.play('title', { lines: big
      ? [{ text: '宝島', size: 150, y: 250 }, { text: '上陸!!', size: 170, y: 440, color: '#ffd84a' }]
      : [{ text: 'お宝', size: 170, y: 300 }, { text: '発見', size: 120, y: 450 }], dur: 1.4, sub: big ? 'BIG BONUS' : 'REGULAR BONUS', style: 'parchment' });
    setTimeout(() => this.lcd.play('text', { text: big ? 'BIG BONUS' : 'REG BONUS', rainbow: big, color: '#7fc4ff', size: 110, dur: 1.6, shake: 10 }), 1500);
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
    L.reelRainbow = 0;
    this.audio.bgm(this.cfg.bonus[type].bgm);
  }

  async bonusEnd(info) {
    const L = this.cab.lights;
    this.audio.stopBgm(0.4);
    this.audio.play('bonus_end', { gain: 1 });
    this.lcd.base = 'stage';
    this.story.bonusScene(false);
    this.lcd.play('title', { lines: [{ text: '出航', size: 190, y: 290 }, { text: `獲得 ${info.paid} 枚`, size: 54, y: 400, squash: 1 }], dur: 2.2, sub: `${info.type} BONUS  ${info.games} GAMES`, style: 'parchment' });
    this.haptics.vibrate([80, 40, 80]);
    this.bloomKick(0.8);
    L.rainbow = 0;
    L.mode = 'idle';
    this.lcd.prompt = '';
    await wait(1500);
  }

  bloomKick(v) { this.bloom.kick = Math.max(this.bloom.kick, v); }
}
