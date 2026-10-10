// =====================================================================
//  DARKNIGHT の演出ディレクター
//   通常時: 背景 (モード示唆)・ステップアップ・カットイン・敵出現・暗転 → 前兆の最終ゲームで突入告知
//   CZ「DARK GATE」10G: 勝利期待度ゲージ → バトル 3G (最終ゲームは PUSH ボタンが飛び出す)
//   AT「DARKNIGHT RUSH」: 押し順ナビ (液晶の数字 + ストップボタンの色)、上乗せ、LIMIT BREAK、リザルト
//   光と音の爆発 = 筐体 LED 虹色 + 看板 + 波紋 + 火花 + ブルーム + 揺れ + 振動 + ボイス
// =====================================================================
import * as THREE from 'three';
import { Director } from '../director.js';
import { ENEMIES } from './stage.js';
import { STAGE_NAMES } from './screen.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pickW = (table) => {
  const ent = Object.entries(table);
  let r = Math.random() * ent.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of ent) { r -= w; if (r < 0) return k; }
  return ent[0][0];
};
const REEL = { L: 0, C: 1, R: 2 };
const RARE = ['W_CHERRY', 'S_CHERRY', 'SUIKA', 'CHANCE'];
const CUTIN_TEXT = { blue: '…気配がする', green: '来るぞ', red: '闇を斬り裂け!', gold: '我が剣に懸けて!!', rainbow: 'DARKNIGHT' };
const BAND_HEX = { blue: 0x2a7aff, green: 0x2aff7a, red: 0xff1f3a, gold: 0xffc21a, purple: 0xa040ff, rainbow: 0xffffff };

export class DarkDirector extends Director {
  constructor(ctx) {
    super(ctx);
    this.stage = this.cab.stage;
    this.scr = this.cab.screen;
    this.debugForce = { preview: 'auto', push: 'auto' };
    this.czGauge = 0;
    this.awaitingPush = null;
    this.pendingAdd = 0;
  }

  get A() { return this.machine.at; }

  // 状態ごとの BGM
  bgmFor() {
    const s = this.A.state;
    if (s === 'at' || s === 'lb') return ['dk_at', 1];
    if (s === 'cz' || s === 'battle') return ['dk_battle', 0.9];
    return ['dk_normal', this.cfg.audio.normalBgm];
  }
  playBgm(fade = 0.8) { const [n, g] = this.bgmFor(); this.audio.bgm(n, { gain: g, fade }); }

  // 起動・再開時に画面と舞台を状態に合わせる
  restoreScene() {
    const A = this.A;
    this.stage.setStage(A.stage || 0);
    if (A.state === 'at' || A.state === 'lb') { this.stage.rush(); this.cab.lights.neonHue = 0.98; }
    else if (A.state === 'battle') this.stage.encounter(1);
    else this.stage.walk();
    this.syncStatus();
  }

  syncStatus() {
    const A = this.A, S = this.scr.status;
    Object.assign(S, { state: A.state === 'zen' ? 'normal' : A.state, atLeft: A.atLeft, net: A.net, lbLeft: A.lbLeft, czLeft: A.czLeft, czGauge: this.czGauge, stage: A.stage, battleLeft: A.battleLeft, total: A.total });
  }

  // ------------------------------------------------------------
  //  ゲーム開始: 予告の組み立て
  // ------------------------------------------------------------
  planGame(flag) {
    const A = this.A;
    const plan = { preview: null, push: null, reveal: null, events: flag.ev || [] };
    const rare = RARE.includes(flag.small);
    const st = flag.atState;
    if (st === 'zen' && A.zenLeft === 1) plan.reveal = A.next; // 前兆の最終ゲーム → 突入告知
    if (st === 'battle' && A.battleLeft === 1) plan.final = true;
    if (st === 'normal' || st === 'zen') {
      const zen = st === 'zen';
      const hot = plan.reveal;
      const f = this.debugForce.preview;
      const rate = hot ? 1 : zen ? 0.55 : rare ? 0.35 : 0.06;
      if (f !== 'none' && (f !== 'auto' || Math.random() < rate)) {
        const type = f !== 'auto' ? f : pickW(hot ? { step: 35, cutin: 25, enemy: 20, blackout: 20 } : zen ? { step: 40, cutin: 25, enemy: 30, blackout: 5 } : { step: 55, cutin: 30, enemy: 14, blackout: 1 });
        const band = pickW(hot === 'at' ? { red: 20, gold: 50, rainbow: 30 } : hot ? { green: 15, red: 50, gold: 35 } : zen ? { blue: 30, green: 40, red: 25, gold: 5 } : { blue: 70, green: 22, red: 7, gold: 1 });
        const level = hot ? 4 + (Math.random() < 0.5 ? 1 : 0) : zen ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * (rare ? 4 : 3));
        plan.preview = { type, band, level, hot: !!hot };
      }
      if (hot) plan.push = hot === 'at' ? 'rainbow' : 'gold';
      else if (plan.preview?.type === 'blackout' || (plan.preview && plan.preview.band === 'gold')) plan.push = 'red'; // ガセ PUSH
    }
    if (plan.final) {
      const win = A.czWin;
      plan.push = win ? (Math.random() < 0.35 ? 'rainbow' : 'gold') : (Math.random() < 0.45 ? 'red' : null);
    }
    if (this.debugForce.push !== 'auto' && (st === 'normal' || st === 'zen')) plan.push = this.debugForce.push === 'none' ? null : this.debugForce.push;
    this.plan = plan;
    return plan;
  }

  async onLever(flag, plan) {
    const A = this.A, L = this.cab.lights, scr = this.scr;
    this.flag = flag;
    this.stopped = [];
    this.syncStatus();
    L.ledMode = 'chase';
    for (const e of plan.events) {
      if (e.type === 'stage') { this.stage.setStage(e.stage); scr.telop(`ステージチェンジ — ${STAGE_NAMES[e.stage]}`, { color: '#e0c8ff' }); this.audio.play('window', { gain: 0.6 }); }
      if (e.type === 'ceiling') { scr.banner('天井到達', { band: 'gold', size: 110, sub: 'DARKNIGHT RUSH 確定' }); this.audio.play('alarm', { gain: 0.8 }); }
      if (e.type === 'lbStart') await this.limitBreak();
      if (e.type === 'add') this.pendingAdd += e.g;
      if (e.type === 'czUp') { this.czGauge = Math.min(1, this.czGauge + 0.25); this.audio.play('charge', { gain: 0.7, rate: 1.3 }); scr.flash('#a040ff', 0.5); }
    }
    const st = flag.atState;
    // 予告
    const pv = plan.preview;
    if (pv) {
      if (pv.type === 'step') { scr.setStep(1, pv.level === 1 ? pv.band : 'blue'); this.audio.play('yokoku', { gain: 0.7 }); }
      else if (pv.type === 'enemy') {
        const idx = pv.hot ? (Math.random() < 0.5 ? 2 : 3) : Math.random() < 0.6 ? 0 : 1;
        this.stage.encounter(idx);
        this.stage.scene_ = 'walk';
        scr.telop(`${ENEMIES[idx].name} の気配…`, { color: ENEMIES[idx].color });
        this.audio.play('dk_draw', { gain: 0.9 });
      } else if (pv.type === 'blackout') {
        this.cab.lcdBright = 0.12; L.mode = 'off';
        this.audio.play('freeze', { gain: 0.8 }); this.haptics.vibrate([60]);
      } else if (pv.type === 'cutin') this.audio.play('yokoku', { gain: 0.5, rate: 0.85 });
    }
    // CZ 中: 毎ゲームゲージが伸びる (勝つ CZ ほど伸びやすい)
    if (st === 'cz') {
      const target = (A.czWin ? 0.55 + Math.random() * 0.45 : 0.2 + Math.random() * 0.55) * (1 - A.czLeft / this.cfg.at.czGames + 0.1);
      this.czGauge = Math.min(1, Math.max(this.czGauge, target));
      if (RARE.includes(flag.small)) { scr.flash('#ffd23f', 0.6); this.audio.play('flash', { gain: 0.8 }); }
      L.mode = 'chance';
    }
    // バトル中: 攻防
    if (st === 'battle') {
      if (plan.final) { scr.banner('FINAL', { band: 'red', size: 140, dur: 1.2 }); this.audio.play('v_final', { gain: 1.1 }); L.mode = 'chance'; }
      else if (Math.random() < 0.5) { this.stage.knightAttack(); setTimeout(() => this.audio.play('dk_slash', { gain: 1 }), 300); }
      else { this.stage.enemyAttack(false); setTimeout(() => this.audio.play('dk_chop', { gain: 0.9 }), 400); }
    }
    // AT 中: 押し順ナビ・7 を狙え
    if (st === 'at' || st === 'lb') {
      if (flag.small === 'SEVEN') {
        scr.banner('7を狙え!!', { band: 'rainbow', size: 120, dur: 2.2 });
        this.audio.play('v_ready', { gain: 1 });
      } else if (flag.naviShow) {
        scr.navi(flag.naviShow, []);
        this.audio.play('computer', { gain: 0.5, rate: 1.4 });
      }
    }
    this.syncStatus();
  }

  // スピンが定速になったらストップボタンを点ける
  spinLeds() {
    const L = this.cab.lights;
    const f = this.flag;
    L.stopLedOn = [true, true, true];
    if (f?.naviShow) this.naviLeds();
    else if (f?.small === 'SEVEN') L.stopLed = ['rainbow', 'rainbow', 'rainbow'];
    else L.stopLed = this.A.state === 'cz' || this.A.state === 'battle' ? ['#c040ff', '#c040ff', '#c040ff'] : ['#3cf', '#3cf', '#3cf'];
  }

  // 次に押すボタンだけ黄色く点滅、ほかは赤 (押すな)
  naviLeds() {
    const L = this.cab.lights, f = this.flag;
    const next = REEL[f.naviShow[this.stopped.length]];
    for (let i = 0; i < 3; i++) {
      if (this.stopped.includes(i)) continue;
      L.stopLed[i] = i === next ? '#ffe040' : '#ff1020';
      L.stopLedOn[i] = i === next ? true : 0.3;
    }
  }

  onStop(n, reel) {
    const scr = this.scr, pv = this.plan?.preview, f = this.flag;
    if (reel != null) this.stopped.push(reel);
    if (f?.naviShow) { scr.navi(f.naviShow, this.stopped); if (n < 3) this.naviLeds(); }
    if (pv && !pv.failed) {
      if (pv.type === 'step') {
        const lv = Math.min(pv.level, n + 1);
        if (lv > (scr.step?.level || 0)) {
          scr.setStep(lv, lv === pv.level ? pv.band : lv >= 3 ? 'green' : 'blue');
          this.audio.play('cutin', { gain: 0.8, rate: 0.85 + lv * 0.08 });
          if (lv >= 4) { this.haptics.vibrate([30, 30, 60]); this.shaker.add(0.15); }
        }
      } else if (pv.type === 'cutin' && n === 3) {
        scr.cutin(CUTIN_TEXT[pv.band], pv.band);
        this.audio.play('cutin', { gain: 1, rate: 0.9 + ['blue', 'green', 'red', 'gold', 'rainbow'].indexOf(pv.band) * 0.08 });
        if (pv.band === 'gold' || pv.band === 'rainbow') { this.audio.play('flash', { gain: 0.9 }); this.haptics.vibrate([30, 30, 80]); this.cab.dropGimmick(1200); }
      } else if (pv.type === 'blackout') {
        this.audio.play('charge', { gain: 0.5 + n * 0.15, rate: 0.8 + n * 0.1 });
        this.haptics.vibrate([20]);
      } else if (pv.type === 'enemy' && n === 2) {
        this.audio.play('dk_metal', { gain: 0.6 });
      }
    }
    if (n === 3 && this.plan?.push) this.cab.popPush(BAND_HEX[this.plan.push] || 0xff2040, this.plan.push === 'rainbow');
  }

  onThirdRelease() {}

  // ------------------------------------------------------------
  //  PUSH ボタン
  // ------------------------------------------------------------
  waitPush(ms = 6000) {
    return new Promise((ok) => {
      const done = () => { clearTimeout(this.pushTimer); this.awaitingPush = null; this.scr.clearKind('telop'); ok(); };
      this.awaitingPush = done;
      this.pushTimer = setTimeout(done, ms);
      this.scr.telop('PUSH ボタンを押せ!!', { color: '#ffd23f', dur: ms / 1000 });
      this.audio.play('dk_pop', { gain: 1 });
      this.audio.play('alarm', { gain: 0.35, rate: 1.4 });
    });
  }

  push() {
    if (!this.awaitingPush) return false;
    this.cab.pressPush();
    this.audio.play('dk_push', { gain: 1.2 });
    this.audio.play('button', { gain: 0.8, rate: 0.7 });
    this.haptics.vibrate([40]);
    this.awaitingPush();
    return true;
  }

  // ------------------------------------------------------------
  //  光と音の爆発
  // ------------------------------------------------------------
  explode(level = 1, color = null) {
    const L = this.cab.lights;
    L.mode = 'rainbow'; L.ledMode = 'flash'; L.rainbow = 1; L.reelRainbow = 1;
    this.cab.lcdBright = 1;
    this.cab.ripple(color ?? 0xffffff);
    setTimeout(() => this.cab.ripple(0xa040ff), 250);
    this.cab.reelFlash('strobe', 1.6 + level);
    this.cab.dropGimmick(1800 + level * 600);
    this.scr.flash('#ffffff', 1);
    this.stage.flash(0xffffff, 1.5);
    this.stage.shake = 0.3;
    this.bloomKick(1.2);
    this.shaker.add(0.6 + level * 0.3);
    this.haptics.vibrate('bonusStart');
    this.audio.duck(0.2, 1800);
    this.audio.play('explosion', { gain: 1.1 });
    this.audio.gyuin(2 + level, { gain: 1.1 });
    this.audio.play('rumble', { gain: 1 });
    for (let k = 0; k < 3 + level * 2; k++) {
      setTimeout(() => this.sparks.emit(new THREE.Vector3((Math.random() - 0.5) * 0.7, this.cab.D.lcdY + (Math.random() - 0.5) * 0.3, 0.36), 90, { speed: 2, life: 1.5 }), k * 200);
    }
    const el = document.getElementById('rainbow');
    if (el) { el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
    setTimeout(() => { L.ledMode = 'chase'; L.reelRainbow = 0; L.rainbow = 0; L.mode = this.A.state === 'normal' || this.A.state === 'zen' ? 'idle' : 'rainbow'; }, 2400 + level * 400);
  }

  async limitBreak() {
    const scr = this.scr;
    this.audio.stopBgm(0.1);
    this.cab.lcdBright = 0.1;
    this.audio.play('freeze', { gain: 1 });
    this.haptics.vibrate('freeze');
    await wait(900);
    this.explode(3);
    scr.banner('LIMIT BREAK', { band: 'rainbow', size: 130, sub: '上乗せ特化ゾーン', dur: 2.6 });
    this.audio.play('v_combo', { gain: 1.2, delay: 0.3 });
    this.stage.rush();
    await wait(1600);
    this.audio.bgm('dk_at', { gain: 1, fade: 0.3 });
  }

  // ------------------------------------------------------------
  //  精算
  // ------------------------------------------------------------
  async onSettle(res, flag) {
    const scr = this.scr, L = this.cab.lights, A = this.A;
    this.rig.zoom = 0;
    L.backlightTarget = [1, 1, 1];
    scr.clearNavi();
    const pv = this.plan?.preview;
    const events = res.at || [];
    const has = (t) => events.find((e) => e.type === t);
    // PUSH (前兆の最終ゲーム / バトルの最終ゲーム / ガセ)
    if (this.plan?.push) {
      await this.waitPush();
      this.cab.retractPush();
    }
    // 予告の決着
    if (pv && !this.plan.reveal) {
      pv.failed = true;
      scr.clearStep();
      if (pv.type === 'enemy') this.stage.walk();
      if (pv.type === 'blackout') { this.cab.lcdBright = 1; L.mode = 'idle'; }
      if (this.plan.push) { scr.popup('…', '#8090a0', { size: 120 }); this.audio.play('lose', { gain: 0.5 }); }
    }
    scr.clearStep();
    if (res.wins.length) this.cab.flashLines(res.wins.filter((w) => w.line >= 0).map((w) => w.line), 1.2);
    // 小役・レア役のリアクション
    this.roleFx(res, flag);
    // 状態遷移
    if (has('czStart')) await this.czStart();
    const bs = has('battleStart');
    if (bs) await this.battleStart(bs.win);
    if (has('battleLose')) await this.battleLose();
    if (has('battleWin')) await this.battleWin();
    const ats = has('atStart');
    if (ats) await this.atStart(ats.games, !has('battleWin'));
    if (has('seven')) await this.sevenDone(res.roleNames.includes('SEVEN'));
    if (this.pendingAdd && (A.state === 'at' || A.state === 'lb')) await this.showAdd();
    if (has('lbEnd')) { scr.telop('LIMIT BREAK 終了', { color: '#ffd23f' }); this.audio.play('bonus_end', { gain: 0.7 }); }
    if (res.replay) this.audio.play('replay', { gain: 0.7 });
    if (res.pay > 0) await this.payout(res.pay);
    const end = has('atEnd');
    if (end) await this.atEnd(end);
    this.syncStatus();
  }

  roleFx(res, flag) {
    const scr = this.scr;
    const s = flag.small;
    if (res.roleNames.includes('BELL')) { this.audio.play('bell', { gain: 0.8 }); this.cab.reelFlash('blink', 0.6); }
    if (!RARE.includes(s)) return;
    if (s === 'W_CHERRY') { this.audio.play('small_win', { gain: 0.7, rate: 1.1 }); scr.flash('#ff6080', 0.3); }
    else if (s === 'S_CHERRY') { this.audio.play('flash', { gain: 1 }); this.audio.gyuin(1, { gain: 0.8 }); scr.flash('#ff2040', 0.7); this.cab.reelFlash('strobe', 1); this.haptics.vibrate([60, 40, 120]); scr.telop('強チェリー!!', { color: '#ff6080' }); }
    else if (s === 'SUIKA') { this.audio.play('small_win', { gain: 0.9, rate: 0.9 }); scr.flash('#40ff80', 0.4); this.cab.reelFlash('wave', 0.8); }
    else if (s === 'CHANCE') { this.audio.play('title_hit', { gain: 0.9 }); scr.flash('#ffd23f', 0.6); this.cab.reelFlash('strobe', 1); scr.telop('チャンス目!', { color: '#ffd23f' }); this.haptics.vibrate([40, 30, 40]); }
  }

  async czStart() {
    const scr = this.scr;
    this.czGauge = 0.05;
    if (this.plan?.reveal === 'cz') this.explode(1, 0xa040ff);
    this.audio.stopBgm(0.2);
    scr.banner('DARK GATE', { band: 'purple', size: 130, sub: 'チャンスゾーン突入', dur: 2.4 });
    this.audio.play('v_prepare', { gain: 1.1, delay: 0.4 });
    this.stage.setStage(3);
    this.stage.walk();
    this.cab.lights.mode = 'chance';
    this.cab.lights.neonHue = 0.78;
    await wait(1800);
    this.audio.bgm('dk_battle', { gain: 0.9, fade: 0.4 });
  }

  async battleStart(win) {
    const scr = this.scr;
    // 敵の強さで期待度を示す (コウモリ > スライム > スケルトン、ドラゴンは勝ち濃厚)
    const idx = +(win ? pickW({ 0: 40, 1: 33, 2: 20, 3: 7 }) : pickW({ 0: 15, 1: 35, 2: 50 }));
    this.enemyIdx = idx;
    this.stage.encounter(idx);
    Object.assign(scr.status, { enemyName: ENEMIES[idx].name, enemyColor: ENEMIES[idx].color });
    scr.banner('BATTLE', { band: idx === 3 ? 'gold' : 'red', size: 140, sub: `VS ${ENEMIES[idx].name}`, dur: 2.2 });
    this.audio.play('v_fight', { gain: 1.2, delay: 0.5 });
    this.audio.play('dk_draw', { gain: 1 });
    this.shaker.add(0.3);
    await wait(1500);
  }

  async battleWin() {
    const scr = this.scr;
    this.stage.knightAttack(true);
    setTimeout(() => this.audio.play('dk_slash2', { gain: 1.2 }), 350);
    await wait(700);
    this.explode(2, 0xffd23f);
    scr.banner('WIN!!', { band: 'gold', size: 160, dur: 2 });
    this.audio.play('v_win', { gain: 1.2 });
    await wait(1600);
  }

  async battleLose() {
    const scr = this.scr;
    this.stage.enemyAttack(true);
    setTimeout(() => this.audio.play('dk_chop', { gain: 1.1 }), 400);
    await wait(900);
    scr.banner('LOSE…', { band: 'blue', size: 120, dur: 1.8 });
    this.audio.play('v_lose', { gain: 1 });
    this.audio.stopBgm(1.2);
    await wait(2000);
    this.stage.walk();
    this.stage.setStage(this.A.stage || 0);
    this.cab.lights.mode = 'idle';
    this.playBgm(2);
  }

  async atStart(games, direct) {
    const scr = this.scr;
    if (direct) this.explode(3, 0xff2040);
    this.audio.stopBgm(0.1);
    scr.banner('DARKNIGHT RUSH', { band: 'rainbow', size: 104, sub: `${games}G スタート`, dur: 3 });
    this.audio.play('fanfare_big', { gain: 1.2 });
    this.audio.play('v_begin', { gain: 1.1, delay: 1.2 });
    this.cab.lights.neonHue = 0.98;
    this.stage.rush();
    this.onBonusStart?.('AT');
    await wait(2600);
    this.audio.bgm('dk_at', { gain: 1, fade: 0.4 });
  }

  async sevenDone(aligned) {
    if (aligned) { this.explode(1, 0xff2040); this.scr.banner('RUSH START', { band: 'red', size: 120, dur: 1.6 }); this.audio.play('v_ready', { gain: 1 }); await wait(1000); }
  }

  async showAdd() {
    const g = this.pendingAdd;
    this.pendingAdd = 0;
    const big = g >= 50;
    this.scr.popup(`+${g}G`, big ? '#ff4a5a' : '#ffd23f', { size: big ? 190 : 150 });
    this.audio.gyuin(big ? 3 : 1, { gain: 1 });
    this.audio.play('title_hit', { gain: 1, rate: big ? 0.8 : 1.1 });
    this.haptics.vibrate([50, 30, 120]);
    this.bloomKick(0.6);
    this.cab.ripple(0xffd23f);
    if (big) { this.explode(2, 0xff4a5a); this.audio.play('v_multi', { gain: 1.1 }); }
    await wait(big ? 1400 : 700);
  }

  async atEnd(e) {
    const scr = this.scr;
    this.audio.stopBgm(0.6);
    scr.showResult(e);
    this.stage.walk();
    if (e.full) { this.explode(3); this.audio.play('v_flawless', { gain: 1.2 }); }
    else this.audio.play('v_over', { gain: 1 });
    this.audio.play('bonus_end', { gain: 0.9 });
    this.cab.lights.neonHue = 0.78;
    this.cab.lights.mode = 'idle';
    this.onBonusEnd?.(e);
    await wait(3200);
    scr.clearResult();
    this.stage.setStage(this.A.stage || 0);
    this.playBgm(2);
  }
}
