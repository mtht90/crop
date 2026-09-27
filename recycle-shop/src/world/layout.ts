import * as THREE from 'three';

/** KayKit 内装素材の縮尺 (1 unit = 0.75 m) */
export const K = 0.75;
/** KayKit City 素材の縮尺 (ミニチュアなので大きく) */
export const CITY = 4.5;

export const SHOP = { x0: -7.5, x1: 7.5, z0: -6, z1: 6, h: 3.0, wall: 0.375 };
export const EXPANSION = { x0: 7.5, x1: 13.5 };
export const DOOR = { x: 0, z: 6, half: 0.62 };

export interface Rect { x0: number; z0: number; x1: number; z1: number }

export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
export const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export const rectsOverlap = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** スタッフ専用エリア (客は立ち入らない) */
export const STAFF_ZONES: Rect[] = [
  rect(-7.5, -6, -2.0, -2.5), // バックヤード (作業台・在庫)
  rect(-7.5, 0.8, -5.0, 4.4), // 買取カウンター内側
  rect(5.0, 0.6, 7.5, 4.6), // レジカウンター内側
];

/** 什器を置ける売り場 */
export const BUILD_ZONES_BASE: Rect[] = [rect(-1.8, -5.85, 7.3, 0.4)];
export const BUILD_ZONE_EXPANSION: Rect = rect(7.7, -5.85, 13.3, 5.85);
/** 置いてはいけない通路 (レジ待ち列・入口) */
export const RESERVED: Rect[] = [rect(2.7, -2.4, 4.4, 4.6), rect(-2.2, 0.4, 2.2, 6)];

/** 固定位置 */
export const SPOTS = {
  playerSpawn: new THREE.Vector3(0, 0, 3.6),
  outsideLeft: new THREE.Vector3(-16, 0, 7.8),
  outsideRight: new THREE.Vector3(16, 0, 7.8),
  doorOutside: new THREE.Vector3(0, 0, 7.4),
  doorInside: new THREE.Vector3(0, 0, 4.6),
  /** 買取カウンター前の待機列 (先頭がカウンター) */
  sellQueue: [new THREE.Vector3(-3.55, 0, 2.5), new THREE.Vector3(-3.3, 0, 3.6), new THREE.Vector3(-2.6, 0, 4.5), new THREE.Vector3(-1.7, 0, 5.1)],
  /** レジ前の待機列 */
  buyQueue: [new THREE.Vector3(3.55, 0, 2.6), new THREE.Vector3(3.55, 0, 1.5), new THREE.Vector3(3.55, 0, 0.4), new THREE.Vector3(3.55, 0, -0.7), new THREE.Vector3(3.55, 0, -1.8)],
  appraisalCounter: { x: -4.55, z: 2.5, rot: Math.PI / 2 },
  registerCounter: { x: 4.55, z: 2.6, rot: -Math.PI / 2 },
  workbench: { x: -4.1, z: -5.1, rot: 0 },
  stock: { x: -6.55, z: -4.3, rot: Math.PI / 2 },
  openSign: new THREE.Vector3(1.45, 0, 5.2),
};
