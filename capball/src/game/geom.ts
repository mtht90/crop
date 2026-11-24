// 公式キャップ野球の球場（日本キャップ野球協会の規則・解説をもとにした寸法。単位メートル）
// 本塁が原点、センター方向が -Z、一塁側が +X。走塁はなく、塁は仮想。
import * as THREE from 'three';

/** 投球距離（打席からマウンドまで） */
export const PITCH_DIST = 9.22;
export const MOUND_Z = -PITCH_DIST;
/** フェンス：両翼13m・センター16m、高さ70〜80cm */
export const FENCE_LINE = 13;
export const FENCE_CENTER = 16;
export const FENCE_H = 0.75;
/** アウトゾーン：本塁・両ファウルライン上8mの点・マウンドを結ぶ五角形 */
export const OUT_ZONE_LINE = 8;
/** パスボールライン：バッターボックス終端（z=0.9）から後ろへ1.8m */
export const PASSBALL_Z = 0.9 + 1.8;

export const ZONE = { x0: -0.3, x1: 0.3, y0: 0.32, y1: 1.02 }; // ストライクゾーン（野球と同じ考え方）

/** 打球の角度（センター 0、ライト側 +） */
export function sprayAngle(x: number, z: number) {
  return Math.atan2(x, -z);
}
export const isFairAngle = (theta: number) => Math.abs(theta) <= Math.PI / 4 + 1e-3;

/** 角度ごとのフェンスまでの距離（両翼13m → センター16m） */
export function fenceDist(theta: number) {
  const a = Math.min(Math.abs(theta), Math.PI / 4) / (Math.PI / 4);
  return FENCE_CENTER + (FENCE_LINE - FENCE_CENTER) * a * a;
}

const L = OUT_ZONE_LINE / Math.SQRT2;
/** アウトゾーンの五角形（XZ） */
export const OUT_ZONE: [number, number][] = [
  [0, 0],
  [L, -L],
  [0, MOUND_Z],
  [-L, -L],
];

/** 点がアウトゾーン（ヒットゾーンより手前）にあるか */
export function inOutZone(x: number, z: number) {
  // 凸四角形（本塁・一塁側8m点・マウンド・三塁側8m点）の内側判定
  let inside = true;
  for (let i = 0; i < OUT_ZONE.length; i++) {
    const [ax, az] = OUT_ZONE[i];
    const [bx, bz] = OUT_ZONE[(i + 1) % OUT_ZONE.length];
    const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (cross > 1e-6) inside = false;
  }
  return inside;
}

/** 守備位置（投手・捕手・内野手2人。指名打者は守らない） */
export const POSITIONS = {
  P: new THREE.Vector3(0, 0, MOUND_Z),
  C: new THREE.Vector3(0, 0, 1.5),
  IF1: new THREE.Vector3(-5.6, 0, -10.6),
  IF2: new THREE.Vector3(5.6, 0, -10.6),
};
