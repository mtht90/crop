import * as THREE from 'three';
import type { AudioEngine } from '../audio/audio';

/** 釣りの見せ場で FishingController が出す合図 */
export type Cue =
  | { kind: 'hookset'; at: THREE.Vector3; big: boolean }
  | { kind: 'jump'; at: THREE.Vector3; big: boolean }
  | { kind: 'surge'; power: number }
  | { kind: 'shadow'; at: THREE.Vector3 }
  | { kind: 'land'; at: THREE.Vector3; big: boolean; legend?: boolean }
  | { kind: 'legend'; on: boolean }
  | { kind: 'lost' };

function smooth(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/**
 * 映画的な演出：時間の流れ（スロー）、注目点のまわりのぼけ、竿先への寄り、
 * 切れそうな時の色の抜けと心音、伝説の魚の時の暗転。文字は一切出さない
 */
export class Cinema {
  /** シミュレーションに掛ける時間の倍率 */
  timeScale = 1;
  /** 竿先への寄り 0..1（RodView と画角に使う） */
  closeup = 0;
  /** 画角の倍率 */
  fovMul = 1;
  /** カメラが追う点（ジャンプした魚など）と、その強さ */
  readonly look = new THREE.Vector3();
  lookWeight = 0;
  /** 注目点のまわりのぼけの強さ 0..1 と、注目点の画面上の位置（0..1、左下原点） */
  dofAmount = 0;
  readonly dofFocus = new THREE.Vector2(0.5, 0.5);
  /** 画面の明るさの倍率（伝説の魚で暗くなる） */
  exposureMul = 1;

  private slowLevel = 1;
  private slowHold = 0;
  private slowRelease = 0.5;
  private slowT = 0;
  private focusAt: THREE.Vector3 | null = null;
  private focusT = 0;
  private focusDur = 1;
  private focusPower = 0;
  private closeT = 0;
  private lookT = 0;
  private legend = 0;
  private legendOn = false;
  private lostT = 0;
  private shine = 0;
  private beat = 0;
  private vignette: HTMLDivElement;
  private tmp = new THREE.Vector3();

  constructor(
    ui: HTMLElement,
    private canvas: HTMLCanvasElement,
    private audio: AudioEngine,
  ) {
    this.vignette = document.createElement('div');
    this.vignette.className = 'cine-vignette';
    ui.prepend(this.vignette);
  }

  /** 時間を scale 倍に落とし、hold 秒（実時間）保ってから release 秒で戻す */
  private slow(scale: number, hold: number, release = 0.5): void {
    if (scale > this.slowLevel && this.slowT < this.slowHold) return;
    this.slowLevel = scale;
    this.slowHold = hold;
    this.slowRelease = release;
    this.slowT = 0;
  }

  private focus(at: THREE.Vector3, dur: number, power = 1): void {
    this.focusAt = at;
    this.focusT = 0;
    this.focusDur = dur;
    this.focusPower = power;
  }

  cue(c: Cue): void {
    switch (c.kind) {
      case 'hookset':
        // アワセが決まった一瞬：時間が伸び、着水点のまわりがぼけ、周りの音が引く
        this.slow(c.big ? 0.18 : 0.28, c.big ? 0.55 : 0.35, 0.55);
        this.focus(c.at.clone(), c.big ? 1.6 : 1.1, 1);
        this.audio.whoosh(c.big ? 1 : 0.6);
        break;
      case 'jump':
        // 跳んだ魚をスローで追う
        this.slow(c.big ? 0.22 : 0.32, c.big ? 0.9 : 0.6, 0.6);
        this.focus(c.at, 1.6, 0.8);
        this.look.copy(c.at);
        this.lookT = 1.6;
        this.audio.whoosh(0.5);
        break;
      case 'surge':
        // 強い突っ込み：竿先に寄る
        this.closeT = Math.max(this.closeT, 0.5 + 0.5 * Math.min(1, c.power));
        break;
      case 'shadow':
        // 大物の影に気づく「間」：低い音と一瞬の静止
        this.slow(0.4, 0.5, 0.8);
        this.focus(c.at.clone(), 1.8, 0.9);
        this.audio.boom(0.9);
        break;
      case 'land':
        // 伝説の魚を抜き上げた瞬間、雲が切れて光が差す
        if (c.legend) this.shine = 1;
        if (c.big) {
          this.slow(0.25, 1.0, 0.8);
          this.focus(c.at, 1.8, 0.7);
          this.audio.whoosh(0.8);
        }
        break;
      case 'legend':
        this.legendOn = c.on;
        if (c.on) this.audio.boom(1.2);
        break;
      case 'lost':
        this.lostT = 1.2;
        break;
    }
  }

  /** 毎フレーム（実時間 dt）。danger = 糸の切れそうな度合い 0..1 */
  update(dt: number, camera: THREE.Camera, danger: number, active: boolean, feel: number): void {
    // スロー：保持 → なめらかに戻す
    this.slowT += dt;
    if (this.slowT < this.slowHold) this.timeScale += (this.slowLevel - this.timeScale) * Math.min(1, dt * 25);
    else {
      const k = smooth((this.slowT - this.slowHold) / this.slowRelease);
      this.timeScale = this.slowLevel + (1 - this.slowLevel) * k;
      if (k >= 1) this.slowLevel = 1;
    }
    if (!active) {
      this.timeScale = 1;
      this.slowLevel = 1;
      this.focusAt = null;
      this.legendOn = false;
      this.closeT = 0;
      this.lookT = 0;
    }
    // ぼけ
    this.focusT += dt;
    let dofK = 0;
    if (this.focusAt) {
      const t = this.focusT / this.focusDur;
      dofK = this.focusPower * (t < 0.12 ? smooth(t / 0.12) : 1 - smooth((t - 0.45) / 0.55)) * feel;
      if (t >= 1) this.focusAt = null;
    }
    this.dofAmount = this.focusAt ? dofK * 0.65 : 0;
    if (this.focusAt && dofK > 0.01) {
      const p = this.tmp.copy(this.focusAt).project(camera);
      this.dofFocus.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    }

    // 竿先の寄り
    this.closeT = Math.max(0, this.closeT - dt);
    const closeTarget = this.closeT > 0 ? 1 : 0;
    this.closeup += (closeTarget - this.closeup) * Math.min(1, dt * (closeTarget ? 7 : 2.5));
    // 魚を追う
    this.lookT = Math.max(0, this.lookT - dt);
    if (this.lookT > 0 && this.focusAt) this.look.copy(this.focusAt);
    this.lookWeight += ((this.lookT > 0 ? 1 : 0) - this.lookWeight) * Math.min(1, dt * 5);

    // 伝説の魚：空が暗くなり、低い持続音
    this.legend += ((this.legendOn ? 1 : 0) - this.legend) * Math.min(1, dt * 0.6);
    this.shine = Math.max(0, this.shine - dt * 0.25);
    this.exposureMul = (1 - 0.38 * this.legend) * (1 + 0.45 * smooth(this.shine * 1.5) * this.shine);
    this.audio.setDrone(this.legend);

    // 切れそうな時：色が抜け、縁が暗くなり、心音
    this.lostT = Math.max(0, this.lostT - dt);
    const d = active ? Math.max(0, Math.min(1, (danger - 0.25) / 0.75)) * feel : 0;
    const lost = smooth(this.lostT / 1.2) * 0.6;
    const desat = Math.max(d * 0.75, lost);
    const slowDim = (1 - this.timeScale) * 0.35;
    this.fovMul = 1 - 0.2 * this.closeup * feel - 0.06 * (1 - this.timeScale) * feel;
    this.canvas.style.filter = desat > 0.01 || slowDim > 0.01 ? `saturate(${(1 - desat * 0.85).toFixed(3)}) contrast(${(1 + desat * 0.12 + slowDim * 0.2).toFixed(3)})` : '';
    this.vignette.style.opacity = String(Math.min(1, d * 0.85 + lost * 0.6 + slowDim + this.legend * 0.5));
    this.audio.setDuck(1 - Math.min(0.85, (1 - this.timeScale) * 1.2 + d * 0.5));
    if (d > 0.15) {
      this.beat -= dt;
      if (this.beat <= 0) {
        this.audio.heartbeat(0.4 + d * 0.6);
        this.beat = 1.05 - d * 0.5;
      }
    } else this.beat = 0;
  }
}
