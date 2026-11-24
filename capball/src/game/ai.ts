import * as THREE from 'three';
import { PITCHES, type Difficulty, type PitchKind, type Player } from './data';
import { ZONE } from './geom';
import type { GameState } from './rules';
import type { PitchPath } from './pitch';
import { inZone, type SwingMode } from './batting';

const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export interface CpuPitch { kind: PitchKind; level: number; aim: THREE.Vector2; speedNorm: number; bend: number; timingErr: number }

/** CPU 投手：カウントに応じて球種とコースを決める */
export function cpuChoosePitch(s: GameState, pitcher: Player, diff: Difficulty): CpuPitch {
  const reps: [PitchKind, number][] = [['straight', 0], ...(pitcher.pitches ?? [])];
  const ahead = s.strikes > s.balls;
  const behind = s.balls >= 2 && s.balls > s.strikes;
  const w = reps.map(([k, lv]) => (k === 'straight' ? (behind ? 3 : ahead ? 1.2 : 2) : (ahead ? 1.6 : 1) * (0.6 + lv / 7)));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  let i = 0;
  while (r > w[i]) r -= w[i++];
  const [kind, level] = reps[Math.min(i, reps.length - 1)];
  // コース：基本は四隅、追い込んだらボール球も
  const cx = (ZONE.x0 + ZONE.x1) / 2, cy = (ZONE.y0 + ZONE.y1) / 2;
  const hw = (ZONE.x1 - ZONE.x0) / 2, hh = (ZONE.y1 - ZONE.y0) / 2;
  let ax = cx + (Math.random() < 0.5 ? -1 : 1) * hw * (0.55 + Math.random() * 0.35);
  let ay = cy + (Math.random() < 0.55 ? -1 : 1) * hh * (0.45 + Math.random() * 0.4);
  if (s.strikes === 2 && s.balls < 3 && Math.random() < 0.45) {
    // 誘い球
    const def = PITCHES[kind];
    if (def.by < -0.05) ay = ZONE.y0 - 0.08;
    else ax += Math.sign(ax - cx || 1) * 0.16;
  }
  if (behind && Math.random() < 0.5) {
    ax = cx + (ax - cx) * 0.4;
    ay = cy + (ay - cy) * 0.4;
  }
  return { kind, level, aim: new THREE.Vector2(ax, ay), speedNorm: 0.75 + Math.random() * 0.25, bend: 0, timingErr: Math.abs(gauss()) * 0.12 * (1.6 - diff.cpuControl) };
}

export interface CpuSwingPlan { swing: boolean; at: number; cursor: THREE.Vector2; mode: SwingMode }

/** CPU 打者：投球を見て、振るか・どこに・いつ振るかを決める */
export function cpuPlanSwing(s: GameState, batter: Player, path: PitchPath, diff: Difficulty, swingLead: number): CpuSwingPlan {
  const skill = diff.cpuBatSkill * (0.75 + batter.meet / 400);
  const lv = path.params.level * path.params.breakMul;
  const end = path.plate;
  // 読みの誤差（変化が大きいほど読み違える）
  const err = (1 - skill) * 0.2 + lv * 0.012 * (1 - skill) + (path.params.kind === 'knuckle' ? 0.05 : 0);
  const perceived = new THREE.Vector2(end.x + gauss() * err, end.y + gauss() * err * 0.8);
  const inZ = inZone(perceived.x, perceived.y, 0.02);
  const eye = diff.cpuEye * (0.8 + batter.meet / 500);
  let pSwing = inZ ? 0.78 + 0.15 * skill : (1 - eye) * 0.55;
  if (s.strikes === 2) pSwing = inZ ? 0.95 : pSwing * 1.6;
  if (s.balls === 3 && s.strikes < 2) pSwing *= inZ ? 0.9 : 0.4;
  if (s.balls >= 2 && s.strikes === 0 && !inZ) pSwing *= 0.5;
  const swing = Math.random() < pSwing;
  const tErr = gauss() * (0.03 + (1 - skill) * 0.065 + (path.params.speedKmh > 145 ? 0.008 : 0));
  const at = path.duration - swingLead + tErr;
  const cursor = perceived.clone().add(new THREE.Vector2(gauss() * 0.03 * (1 - skill), gauss() * 0.03 * (1 - skill)));
  let mode: SwingMode = 'meet';
  if (batter.power >= 75 && s.strikes < 2 && Math.random() < 0.35) mode = 'power';
  if (s.outs < 2 && s.bases[0] && !s.bases[2] && batter.power < 45 && Math.random() < 0.25) mode = 'bunt';
  return { swing, at, cursor, mode };
}
