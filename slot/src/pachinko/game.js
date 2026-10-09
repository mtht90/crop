// =====================================================================
//  パチンコ本体 (盤面・物理・抽選・液晶・音・振動をつなぐ)
//   スロットと同じ renderer / audio / 財布を共有し、別の Scene とカメラで描く
// =====================================================================
import * as THREE from 'three';
import { PCONFIG } from './config.js';
import { PachinkoLogic } from './logic.js';
import { BallWorld, buildLayout } from './physics.js';
import { PBoard, BOARD_Y } from './board.js';
import { PScreen } from './screen.js';

export class PachinkoGame {
  constructor({ cfg, assets, audio, haptics, shaker, machine, toast, onChange }) {
    this.cfg = cfg;
    this.P = PCONFIG;
    this.audio = audio;
    this.haptics = haptics;
    this.shaker = shaker;
    this.machine = machine;
    this.toast = toast;
    this.onChange = onChange || (() => {});
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05020a);
    this.scene.environment = assets.env || null;
    this.scene.environmentIntensity = cfg.render.envIntensity * 0.55;
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 40);
    this.base = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    this.layout = buildLayout();
    this.world = new BallWorld(this.P, this.layout);
    this.logic = new PachinkoLogic(this.P);
    this.board = new PBoard(cfg, assets, this.layout);
    this.scene.add(this.board.group);
    this.screen = new PScreen(this.board.lcdCanvas, assets.images, cfg.assets.jpFonts.display);
    // 照明
    this.scene.add(new THREE.HemisphereLight(0x8a7cff, 0x200810, 0.25));
    const key = new THREE.SpotLight(0xfff0e0, 3, 6, 0.6, 0.6, 1.5);
    key.position.set(0.5, 2.6, 1.8); key.target.position.set(0, 1.2, 0);
    this.scene.add(key, key.target);
    this.glow = new THREE.PointLight(0xffd0e8, 0.1, 1.2, 2);
    this.glow.position.set(0, BOARD_Y, 0.3);
    this.scene.add(this.glow);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x3a0a18, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    // 隣の台 (暗いクローン。玉は飛ばない)
    for (const x of [-0.68, 0.68]) {
      const n = this.board.group.clone(true);
      // 液晶と看板は自台と連動しないよう、その時点の絵を写した静止画にする
      const still = (tex) => { const c = document.createElement('canvas'); c.width = tex.image.width; c.height = tex.image.height; c.getContext('2d').drawImage(tex.image, 0, 0); const s = new THREE.CanvasTexture(c); s.colorSpace = THREE.SRGBColorSpace; return s; };
      this.screen.draw(Math.random() * 10);
      this.board.drawTray(Math.floor(Math.random() * 3000), 0.5, true);
      const lcdStill = still(this.board.lcdTex), signStill = still(this.board.signTex), trayStill = still(this.board.trayTex), dataStill = still(this.board.dataTex);
      n.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        if (o.isInstancedMesh && o.geometry.type === 'SphereGeometry') { o.visible = false; return; }
        const m = o.material.clone();
        if (m.map === this.board.lcdTex) m.map = lcdStill;
        if (m.map === this.board.trayTex) m.map = trayStill;
        if (m.map === this.board.dataTex) m.map = dataStill;
        if (m.map === this.board.signTex) { m.map = signStill; if (m.emissiveMap) m.emissiveMap = signStill; }
        if (m.color) m.color.multiplyScalar(0.22);
        if ('emissiveIntensity' in m) m.emissiveIntensity *= 0.12;
        o.material = m;
      });
      n.position.x = x;
      this.scene.add(n);
      // さらに手前に半透明の暗幕を置いて、隣の台の存在感を消す
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false }));
      veil.position.set(x, 1.3, 0.3);
      veil.renderOrder = 10;
      this.scene.add(veil);
    }
    // 状態
    this.firing = false;
    this.power = this.P.launch.power;
    this.fireT = 0;
    this.denchuT = 0;      // 電チュー開放の残り秒
    this.vEnd = 0;
    this.attackerPause = 0;
    this.pinT = 0;
    this.t = 0;
    this.lastReach = false;
    this.lastK = 0;
    this.restore();
    this.screen.mode = this.logic.mode;
    this.fit();
    this.refreshTray();
  }

  get balls() { return this.machine.balls || 0; }
  set balls(v) { this.machine.balls = v; }

  // ---------------- お金 ----------------
  lend() {
    const M = this.cfg.money;
    if (this.machine.wallet < M.lendYen) { this.toast('所持金がありません', 'warn'); return false; }
    this.machine.wallet -= M.lendYen;
    this.machine.invested += M.lendYen;
    this.balls += M.lendBalls;
    this.audio.play('bill', { gain: 0.8 });
    for (let i = 0; i < 6; i++) this.audio.play('p_pocket', { delay: 0.2 + i * 0.05, gain: 0.4, rate: 1.2 + Math.random() * 0.3 });
    this.haptics.vibrate('lend');
    this.toast(`千円札 → ${M.lendBalls} 玉`);
    this.refreshTray();
    this.onChange();
    return true;
  }

  // ---------------- 入力 ----------------
  setFiring(on) {
    if (on && this.balls <= 0) { this.toast('玉がありません — 貸し玉ボタンで千円を入れてください', 'warn'); this.board.lights.flash = 1; return; }
    this.firing = on;
    this.audio.play('button', { gain: 0.5, rate: on ? 1.1 : 0.9 });
    this.refreshTray();
  }

  setPower(p) { this.power = Math.max(0, Math.min(1, p)); this.refreshTray(); }

  push() {
    this.board.pushBtn.userData.press = 1;
    this.haptics.vibrate('button');
    if (this.board.lights.pushPrompt) {
      this.board.lights.pushPrompt = false;
      this.screen.flash = 0.9;
      this.audio.play('title_hit', { gain: 1 });
      this.audio.gyuin(1, { gain: 0.8 });
      this.haptics.vibrate([60, 30, 120]);
      this.shaker.add(0.4);
    } else this.audio.play('button', { gain: 0.6 });
  }

  // ---------------- 毎フレーム ----------------
  update(dt) {
    this.t += dt;
    const t = this.t;
    const L = this.logic;
    // 発射 (1 分 100 発)
    if (this.firing) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT += 60 / this.P.launch.perMin;
        if (this.balls > 0) {
          this.balls--;
          L.stats.ballsIn++;
          this.world.launch(this.power + (Math.random() - 0.5) * 0.02);
          this.audio.play('p_launch', { gain: 0.25, rate: 0.9 + Math.random() * 0.2 });
          if (this.balls % 25 === 0) this.refreshTray();
        } else { this.firing = false; this.refreshTray(); this.toast('玉がなくなりました', 'warn'); }
      }
    }
    // 役物の開閉
    this.denchuT = Math.max(0, this.denchuT - dt);
    this.world.open.denchu = this.denchuT > 0;
    this.attackerPause = Math.max(0, this.attackerPause - dt);
    this.world.open.attacker = !!L.round && this.attackerPause <= 0;
    this.world.step(dt);
    for (const e of this.world.events) this.onEvent(e);
    this.world.events.length = 0;
    // ラウンド
    if (L.round) {
      if (this.attackerPause <= 0 && L.tickRound(dt)) this.afterRound();
    } else if (!L.current) {
      const v = L.nextVariation();
      if (v) this.startVariation(v);
    } else if (t >= this.vEnd) {
      this.endVariation();
    } else this.duringVariation();
    // 液晶と盤面
    this.screen.holds = L.holds;
    this.screen.mode = L.mode;
    this.screen.modeLeft = L.modeLeft;
    this.screen.round = L.round ? { ...L.round } : this.screen.round?.done ? this.screen.round : null;
    this.screen.rightArrow = L.support || !!L.round;
    this._lcdT = (this._lcdT || 0) + dt;
    if (this._lcdT > 1 / 30) { this._lcdT = 0; this.screen.draw(t); this.board.lcdTex.needsUpdate = true; }
    const bl = this.board.lights;
    bl.frameMode = L.round ? 'round' : L.mode === 'st' ? 'rainbow' : 'idle';
    bl.frameHue = L.mode === 'jitan' ? 0.4 : 0.9;
    bl.firing = this.firing;
    this.board.update(dt, t, this.world, this.power);
    this.glow.intensity = 0.05 + bl.flash * 0.8 + (L.round ? 0.25 : 0);
    // カメラ
    this.base.target.set(0, this.ty, 0);
    this.base.pos.set(0, this.ty + 0.05, this.dist);
    this.shaker.apply(this.camera, this.base, dt);
  }

  onEvent(e) {
    const P = this.P, L = this.logic;
    const pay = (n) => { this.balls += n; L.stats.ballsOut += n; if (n >= 10 || Math.random() < 0.3) this.refreshTray(); };
    if (e.type === 'pin') {
      this.pinT -= 1;
      if (this.pinT <= 0 && Math.random() < 0.35) { this.pinT = 2; this.audio.play('p_pin', { gain: Math.min(0.2, e.v * 0.15), rate: 1.2 + Math.random() * 0.6 }); }
    } else if (e.type === 'heso' || e.type === 'denchu') {
      pay(e.type === 'heso' ? P.payout.heso : P.payout.denchu);
      const h = L.enter(e.type);
      this.audio.play('p_pocket', { gain: 0.6, rate: e.type === 'heso' ? 1 : 1.2 });
      if (h) {
        this.haptics.vibrate([12]);
        if (h.color !== 'white') {
          this.audio.play(h.color === 'rainbow' || h.color === 'gold' ? 'flash' : 'yokoku', { gain: 0.6, rate: 1.1 });
          if (h.color === 'gold' || h.color === 'rainbow') { this.haptics.vibrate([40, 30, 80]); this.board.lights.flash = 1; }
        }
      }
    } else if (e.type === 'attacker') {
      pay(P.payout.attacker);
      this.audio.play('p_attacker', { gain: 0.7, rate: 1 + Math.random() * 0.2 });
      this.audio.play('medal_pay', { gain: 0.25, rate: 1.4 });
      if (L.attackerIn()) this.afterRound();
    } else if (e.type === 'general') {
      pay(P.payout.general);
      this.audio.play('p_pocket', { gain: 0.4, rate: 1.4 });
    } else if (e.type === 'gate') {
      // 普図: 当たれば電チューが開く (電サポ中は長く・高確率)
      const F = P.spec.futsu;
      if (this.denchuT <= 0 && Math.random() < (L.support ? F.support : F.normal)) {
        this.denchuT = L.support ? F.openSupport : F.openNormal;
        this.audio.play('tick', { gain: 0.5, rate: 1.6 });
      }
    } else if (e.type === 'foul') {
      this.balls++;
    }
  }

  // ---------------- 変動 ----------------
  startVariation(v) {
    this.vEnd = this.t + v.time;
    this.screen.startVariation(v);
    this.lastReach = false;
    this.lastK = 0;
    this.lastStep = 0;
    this.cutinDone = false;
    this.board.lights.pushPrompt = false;
    if (v.stepUp > 0) this.audio.play('cutin', { gain: 0.6 });
  }

  duringVariation() {
    const v = this.logic.current;
    const st = this.screen.layout(v, this.t - this.screen.vt);
    // ステップアップの段ごとに音
    const vt = this.t - this.screen.vt;
    const step = v.stepUp > 0 ? Math.min(v.stepUp, 1 + Math.floor(vt / 0.55)) : 0;
    if (step > this.lastStep) { this.lastStep = step; this.audio.play('window', { gain: 0.7, rate: 0.9 + step * 0.1 }); this.haptics.vibrate([15 * step]); }
    // 擬似連
    if (st.k > this.lastK) { this.lastK = st.k; this.audio.play('flash', { gain: 0.8, rate: 0.9 + st.k * 0.1 }); this.haptics.vibrate([50, 30, 50]); this.shaker.add(0.2); }
    // リーチ発展
    if (st.reach && !this.lastReach) {
      this.lastReach = true;
      this.audio.play('reach', { gain: 0.9 });
      this.haptics.vibrate('reach');
      this.board.lights.flash = 1;
      if (v.reach !== 'normal') this.audio.bgm('sp1', { gain: 0.8 });
      if (v.reach === 'zenkaiten') { this.audio.gyuin(3, { gain: 1 }); this.haptics.vibrate('premium'); }
      if (v.reach === 'spsp') this.board.lights.pushPrompt = true;
    }
    if (st.reach && v.cutin !== 'none' && st.reachT > 3 && !this.cutinDone) {
      this.cutinDone = true;
      this.audio.play('cutin', { gain: 0.9 });
      if (v.cutin === 'gold') { this.audio.play('flash', { gain: 1 }); this.haptics.vibrate([80, 40, 80]); }
    }
  }

  endVariation() {
    const L = this.logic;
    const v = L.current;
    this.screen.endVariation();
    this.board.lights.pushPrompt = false;
    const res = L.endVariation();
    if (v.reach && v.reach !== 'normal') this.audio.bgm(L.support ? 'sp1' : 'p_normal', { gain: this.cfg.audio.normalBgm });
    if (res?.round) {
      // 大当たり
      this.audio.stopBgm(0.1);
      this.audio.play('fanfare_big', { gain: 1.2 });
      this.audio.play('rumble', { gain: 0.9 });
      this.haptics.vibrate('bonusStart');
      this.shaker.add(0.8);
      this.board.lights.flash = 1;
      this.screen.flash = 1;
      this.screen.show(res.round.chain > 1 ? `${res.round.chain} 連!!` : '大当たり!!', 'rainbow', 2.2);
      this.attackerPause = 2.2;
      setTimeout(() => this.audio.bgm('big', { gain: 0.9 }), 1500);
      this.toast(`${res.round.rounds}R 大当たり`, 'hot');
    } else if (res?.modeEnd) {
      this.screen.show(res.modeEnd === 'st' ? 'ST 終了' : '時短 終了', '#aaa', 2);
      this.audio.play('lose', { gain: 0.5 });
      this.audio.bgm('p_normal', { gain: this.cfg.audio.normalBgm });
    } else if (v.reach) {
      this.audio.play('lose', { gain: 0.35, rate: 1.1 });
    }
    this.save();
    this.refreshData();
    this.onChange();
  }

  afterRound() {
    const L = this.logic;
    this.attackerPause = 1.2;
    this.audio.play('bell', { gain: 0.7 });
    const r = this.screen.round = L.round ? { ...L.round } : this.lastRound;
    if (!L.round) {
      // 全ラウンド終了 → ST / 時短
      const st = L.mode === 'st';
      this.screen.round = null;
      this.screen.show(st ? 'ST 突入!!' : '時短 100 回', st ? 'rainbow' : '#7affc0', 2.6);
      this.audio.play(st ? 'fanfare_reg' : 'bonus_end', { gain: 1 });
      if (st) { this.audio.gyuin(2, { gain: 0.8 }); this.haptics.vibrate('bonusStart'); }
      this.audio.bgm(st ? 'sp1' : 'p_normal', { gain: st ? 0.9 : this.cfg.audio.normalBgm });
      this.save();
    }
    this.lastRound = r;
    this.onChange();
  }

  refreshTray() {
    this.board.drawTray(this.balls, this.power, this.firing);
    this.board.setTrayBalls(this.balls);
    this.refreshData();
  }

  // 台上のデータ表示機
  refreshData() {
    const S = this.logic.stats;
    const k = S.ballsIn / this.cfg.money.lendBalls;
    this.board.drawData({ ...S, perK: k > 0.5 ? S.heso / k : 0 }, this.t);
  }

  // カメラ: 縦画面は盤面と上皿・ハンドルが収まるように
  fit() {
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const tanH = Math.tan(THREE.MathUtils.degToRad(17));
    const portrait = aspect < 0.9;
    const halfH = portrait ? 0.62 : 0.72, halfW = portrait ? 0.32 : 0.5; // 台上のデータ表示機から下皿まで
    this.dist = Math.max(halfH / tanH, halfW / (tanH * aspect));
    this.ty = portrait ? 1.38 : 1.4;
  }

  save() { this.machine.pach = this.logic.serialize(); }
  restore() { if (this.machine.pach) this.logic.restore(this.machine.pach); }

  bgmName() { return this.logic.round ? 'big' : this.logic.mode === 'st' ? 'sp1' : 'p_normal'; }

  pick(e) {
    const v = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    return ray.intersectObjects(this.board.pickables, false)[0]?.object.userData.action;
  }
}
