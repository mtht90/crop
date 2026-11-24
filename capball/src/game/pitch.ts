import * as THREE from 'three';
import { PITCHES, breakVector, type PitchKind } from './data';

/** 投球の速さの見え方（実寸の何倍の時間をかけるか）。スマホで目で追える速さにする */
export const PITCH_TIME_SCALE = 1.45;

export interface PitchParams {
  kind: PitchKind;
  level: number; // 変化量 1〜7
  speedKmh: number;
  release: THREE.Vector3;
  target: THREE.Vector3; // 本塁上 z=0 で狙う位置（制球のぶれ込み）
  breakMul: number; // スワイプの回転で増減する変化量の倍率
  extraBx: number; // スワイプの曲げで加わる横変化
  /** 変化の向き（-1=左/三塁側、+1=右/一塁側）。はじいた方向で決まる */
  side: number;
  seed: number;
  /**
   * true: target は「投げ出した方向」の先の点。キャップはそこへ向かって飛び出し、回転の分だけ曲がった先に着く
   * false/なし: target は最後に着く点（CPU の配球用）
   */
  aimIsLine?: boolean;
}

/** キャップの軌道。終点が target に一致するように変化を織り込む */
export class PitchPath {
  readonly duration: number;
  private bend: THREE.Vector3;
  private arc: number;
  private late: number;
  private wobble: number;
  private start: THREE.Vector3;
  private aimEnd: THREE.Vector3;
  readonly params: PitchParams;

  constructor(p: PitchParams) {
    this.params = p;
    const def = PITCHES[p.kind];
    const dist = p.release.distanceTo(p.target);
    this.duration = (dist / (p.speedKmh / 3.6)) * PITCH_TIME_SCALE;
    const lv = p.level * p.breakMul;
    const bv = breakVector(p.kind, lv, p.side);
    this.bend = new THREE.Vector3(bv.x + p.extraBx, bv.y, 0);
    this.arc = def.arc * (0.7 + 0.3 * (1 - p.speedKmh / 110));
    this.late = def.late;
    this.wobble = p.kind === 'knuckle' ? 0.05 + 0.025 * p.level : 0;
    this.start = p.release.clone();
    this.aimEnd = p.aimIsLine ? p.target.clone() : p.target.clone().sub(this.bend);
    this.end = this.aimEnd.clone().add(this.bend);
    this.end.z = 0;
  }

  private f(s: number) {
    return Math.pow(s, 1.4 + this.late * 3.6);
  }

  /** 経過時間 t の位置（t>duration では本塁後方へ直進） */
  pos(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (t > this.duration) {
      const end: THREE.Vector3 = this.pos(this.duration, new THREE.Vector3());
      const prev: THREE.Vector3 = this.pos(this.duration - 0.01, new THREE.Vector3());
      return out.copy(end).add(end.clone().sub(prev).multiplyScalar((t - this.duration) / 0.01));
    }
    const s = Math.max(0, t / this.duration);
    out.lerpVectors(this.start, this.aimEnd, s);
    out.y += this.arc * 4 * s * (1 - s);
    out.addScaledVector(this.bend, this.f(s));
    if (this.wobble) {
      const ph = this.params.seed * 6.28;
      out.x += Math.sin(s * Math.PI * 3.2 + ph) * this.wobble * s * (1 - s * 0.6);
      out.y += Math.sin(s * Math.PI * 2.3 + ph * 1.7) * this.wobble * 0.6 * s;
    }
    return out;
  }

  /** 本塁通過点 */
  private end: THREE.Vector3;
  /** 本塁を通過する点 */
  get plate() {
    return this.end;
  }

  /** 打者が軌道を読める段階での推定着地点（変化が大きく遅いほど読みづらい） */
  earlyRead(sAt: number) {
    const s = sAt;
    const p = new THREE.Vector3().lerpVectors(this.start, this.aimEnd, 1);
    p.addScaledVector(this.bend, this.f(s));
    return p;
  }
}
