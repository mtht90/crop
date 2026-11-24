import * as THREE from 'three';
import type { Player } from './data';
import { ZONE } from './geom';

export type SwingMode = 'meet' | 'power' | 'bunt';

/** バットがゾーンに届くまでの時間（スイング開始からミートまで） */
export const SWING_LEAD = 0.13;

/** ミートカーソルの半径（ゾーン座標・メートル） */
export function cursorSize(p: Player, mode: SwingMode, assist = 1) {
  const base = 0.1 + (p.meet / 100) * 0.1;
  const k = mode === 'power' ? 0.62 : mode === 'bunt' ? 1.15 : 1;
  return { rx: base * k * assist * 1.25, ry: base * k * assist };
}

export interface ContactInput {
  batter: Player;
  mode: SwingMode;
  cursor: THREE.Vector2; // カーソル中心（本塁上の x,y）
  timing: number; // ミートの瞬間 - キャップの本塁到達（秒、負=早い）
  ball: THREE.Vector2; // 本塁到達時のキャップ位置
  speedKmh: number;
  assist?: number;
}

export type ContactResult =
  | { kind: 'miss' }
  | { kind: 'foulTip' }
  | { kind: 'hit'; velocity: THREE.Vector3; quality: number; exitKmh: number; launchDeg: number; sprayDeg: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** カーソルとキャップの位置関係・タイミングから打球を決める */
export function resolveContact(c: ContactInput): ContactResult {
  const { rx, ry } = cursorSize(c.batter, c.mode, c.assist ?? 1);
  const dx = (c.ball.x - c.cursor.x) / rx;
  const dy = (c.ball.y - c.cursor.y) / ry;
  const r = Math.hypot(dx, dy);
  const window = c.mode === 'bunt' ? 0.22 : 0.1 + (c.batter.meet / 100) * 0.05;
  const tn = c.timing / window; // -1..1 が当たる範囲
  if (r > 1.0 || Math.abs(tn) > 1.0) {
    if (r < 1.15 && Math.abs(tn) < 1.1) return { kind: 'foulTip' };
    return { kind: 'miss' };
  }
  // 芯の近さ
  const center = 1 - Math.min(1, r);
  const timingQ = 1 - Math.min(1, Math.abs(tn)) ** 1.6;
  const quality = Math.max(0, 0.15 + 0.85 * center) * (0.35 + 0.65 * timingQ);
  const isL = c.batter.bats === 'L';

  if (c.mode === 'bunt') {
    const sp = rand(3.5, 6) * (0.6 + 0.4 * center);
    const spray = THREE.MathUtils.degToRad(tn * 28 * (isL ? -1 : 1) + dx * 10);
    const launch = THREE.MathUtils.degToRad(-8 - dy * 12);
    const v = new THREE.Vector3(Math.sin(spray) * Math.cos(launch), Math.sin(launch), -Math.cos(spray) * Math.cos(launch)).multiplyScalar(sp);
    return { kind: 'hit', velocity: v, quality, exitKmh: sp * 3.6, launchDeg: THREE.MathUtils.radToDeg(launch), sprayDeg: THREE.MathUtils.radToDeg(spray) };
  }

  // 打球角度: キャップがカーソル中心より上 → バットが下を叩く → 打ち上がる
  let launch = 10 + dy * 30 + rand(-5, 5);
  if (quality < 0.35) launch += Math.sign(dy || 1) * rand(10, 30);
  launch = THREE.MathUtils.clamp(launch, -35, 78);
  // 方向: 早いと引っ張り、遅いと流し
  const pullSign = isL ? 1 : -1; // 右打者の引っ張りは三塁側（-x）
  const spray = pullSign * -tn * 58 + dx * 10 + rand(-8, 8); // 早い(tn<0) → 引っ張り
  // 力
  const powerK = 0.55 + (c.batter.power / 100) * 0.55;
  const modeK = c.mode === 'power' ? 1.26 : 1;
  const pitchK = 0.88 + (c.speedKmh / 100) * 0.12;
  let exit = 19.5 * powerK * modeK * pitchK * (0.45 + 0.55 * quality);
  exit *= rand(0.94, 1.05);
  if (Math.abs(launch) > 55) exit *= 0.75;
  const L = THREE.MathUtils.degToRad(launch), S = THREE.MathUtils.degToRad(spray);
  const v = new THREE.Vector3(Math.sin(S) * Math.cos(L), Math.sin(L), -Math.cos(S) * Math.cos(L)).multiplyScalar(exit);
  return { kind: 'hit', velocity: v, quality, exitKmh: Math.round(exit * 3.6), launchDeg: launch, sprayDeg: spray };
}

export function inZone(x: number, y: number, margin = 0.04) {
  return x >= ZONE.x0 - margin && x <= ZONE.x1 + margin && y >= ZONE.y0 - margin && y <= ZONE.y1 + margin;
}
