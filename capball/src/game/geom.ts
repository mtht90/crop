// 球場の寸法（メートル）。本塁が原点、センター方向が -Z、一塁側が +X。
import * as THREE from 'three';

export const BASE_DIST = 14;
export const MOUND_Z = -10.2;
const h = BASE_DIST / Math.SQRT2;
export const BASES = [
  new THREE.Vector3(0, 0, 0), // 本塁
  new THREE.Vector3(h, 0, -h), // 一塁
  new THREE.Vector3(0, 0, -2 * h), // 二塁
  new THREE.Vector3(-h, 0, -h), // 三塁
];
export const ZONE = { x0: -0.3, x1: 0.3, y0: 0.32, y1: 1.02 }; // ストライクゾーン（本塁上の平面 z=0）
export const FENCE_H = 2.4;
/** 角度（センター方向 0、一塁側 +）ごとのフェンスまでの距離 */
export function fenceDist(theta: number) {
  return 31 + 8 * Math.cos(Math.min(Math.abs(theta), Math.PI / 4) * 2);
}
/** 位置からの打球角度（センター 0、ライト側 +） */
export function sprayAngle(x: number, z: number) {
  return Math.atan2(x, -z);
}
export const isFairAngle = (theta: number) => Math.abs(theta) <= Math.PI / 4 + 1e-3;
export const POSITIONS: Record<string, THREE.Vector3> = {
  P: new THREE.Vector3(0, 0, MOUND_Z),
  C: new THREE.Vector3(0, 0, 1.3),
  '1B': new THREE.Vector3(h + 0.8, 0, -h - 2.2),
  '2B': new THREE.Vector3(4.4, 0, -2 * h + 2.0),
  SS: new THREE.Vector3(-4.6, 0, -2 * h + 2.2),
  '3B': new THREE.Vector3(-h - 0.6, 0, -h - 1.8),
  LF: new THREE.Vector3(-14, 0, -27),
  CF: new THREE.Vector3(0, 0, -32),
  RF: new THREE.Vector3(14, 0, -27),
};
