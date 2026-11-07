import * as THREE from 'three/webgpu';
import { UNIT, type Vec } from '@cardbattle/sim';

/** アリーナのサイズ（タイル）。シミュレーションのルールから設定される */
export const arena = { width: 18, height: 32 };

export function setArenaSize(widthMilli: number, heightMilli: number): void {
  arena.width = widthMilli / UNIT;
  arena.height = heightMilli / UNIT;
}

/**
 * シミュレーション座標（ミリタイル、y=0 が自陣の奥）→ three.js のワールド座標。
 * アリーナの中心を原点にし、自陣が手前（+Z）になるように置く。
 */
export function simToWorld(x: number, y: number, height = 0, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x / UNIT - arena.width / 2, height, arena.height / 2 - y / UNIT);
}

export function worldToSim(v: THREE.Vector3): Vec {
  return { x: Math.round((v.x + arena.width / 2) * UNIT), y: Math.round((arena.height / 2 - v.z) * UNIT) };
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
