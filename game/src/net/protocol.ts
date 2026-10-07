import type { Intent } from '../combat/types';

/**
 * Wire protocol for online play. Everything a peer needs to stay in lockstep
 * is small: who is playing, the shared seed/stage, and one input per frame.
 * Messages are plain JSON-able objects so any transport (WebRTC data channel,
 * WebSocket relay, or the local bot) can carry them unchanged.
 */
export interface PlayerProfile {
  name: string;
  rating: number;
  character: string;
  /** Region tag shown in the lobby (cosmetic). */
  region: string;
}

export type NetMessage =
  /** Sent by both sides on connect. */
  | { t: 'hello'; profile: PlayerProfile }
  /** Host decides the match setup; both sides then build the same Match. */
  | { t: 'start'; seed: number; stage: string; hostChar: string; guestChar: string }
  /** One input for one simulation frame (already scheduled with the input delay). */
  | { t: 'input'; frame: number; data: PackedIntent }
  | { t: 'ping'; id: number; sent: number }
  | { t: 'pong'; id: number; sent: number }
  /** Both peers must agree to rematch. */
  | { t: 'rematch' }
  | { t: 'leave' };

/** [buttons bitmask, moveX, moveZ, yaw, pitch] with fixed precision. */
export type PackedIntent = [number, number, number, number, number];

const BUTTONS = ['attack', 'attackPressed', 'guard', 'jumpPressed', 'jump', 'dashPressed', 'skillPressed', 'ultPressed', 'reloadPressed'] as const;
const Q_MOVE = 127;
const Q_ANGLE = 10000;

export function packIntent(i: Intent): PackedIntent {
  let bits = 0;
  BUTTONS.forEach((b, k) => {
    if (i[b]) bits |= 1 << k;
  });
  return [bits, Math.round(i.moveX * Q_MOVE), Math.round(i.moveZ * Q_MOVE), Math.round(i.yaw * Q_ANGLE), Math.round(i.pitch * Q_ANGLE)];
}

export function unpackIntent(p: PackedIntent): Intent {
  const [bits, mx, mz, yaw, pitch] = p;
  const i = { moveX: mx / Q_MOVE, moveZ: mz / Q_MOVE, yaw: yaw / Q_ANGLE, pitch: pitch / Q_ANGLE } as Intent;
  BUTTONS.forEach((b, k) => {
    i[b] = (bits & (1 << k)) !== 0;
  });
  return i;
}
