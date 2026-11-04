import type { Combatant } from '../entities/Combatant';
import { ARENA_H, ARENA_W, BRIDGES, RIVER_BOTTOM, RIVER_TOP, MID_Y } from './Arena';

/** (tx, ty) へ最大 speed*dt だけ進む。到達したら true。 */
export function stepToward(c: { x: number; y: number }, tx: number, ty: number, dist: number): boolean {
  const dx = tx - c.x;
  const dy = ty - c.y;
  const d = Math.hypot(dx, dy);
  if (d <= dist || d < 1e-6) {
    c.x = tx;
    c.y = ty;
    return true;
  }
  c.x += (dx / d) * dist;
  c.y += (dy / d) * dist;
  return false;
}

/** ユニット同士を軽く押し合って重ならないようにする（質量比で押し出す） */
export function separate(units: Combatant[], structures: readonly Combatant[]): void {
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (!b.alive || a.isFlying !== b.isFlying) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.001;
      const overlap = (min - d) * 0.5;
      const nx = d2 === 0 ? 1 : dx / d;
      const ny = d2 === 0 ? 0 : dy / d;
      const wa = b.mass / (a.mass + b.mass);
      const wb = a.mass / (a.mass + b.mass);
      a.x -= nx * overlap * wa;
      a.y -= ny * overlap * wa;
      b.x += nx * overlap * wb;
      b.y += ny * overlap * wb;
    }
  }
  // 塔・建物からは押し出す（地上ユニットのみ）
  for (const u of units) {
    if (!u.alive || u.isFlying) continue;
    for (const s of structures) {
      if (!s.alive) continue;
      const dx = u.x - s.x;
      const dy = u.y - s.y;
      const min = u.radius + s.radius;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const nx = d < 1e-6 ? 0 : dx / d;
      const ny = d < 1e-6 ? (u.team === 0 ? 1 : -1) : dy / d;
      u.x = s.x + nx * min;
      u.y = s.y + ny * min;
    }
  }
}

/** アリーナ外・川（橋以外）に出ないよう補正する */
export function clampToTerrain(u: Combatant): void {
  u.x = Math.max(u.radius, Math.min(ARENA_W - u.radius, u.x));
  u.y = Math.max(u.radius, Math.min(ARENA_H - u.radius, u.y));
  if (u.isFlying) return;
  if (u.y > RIVER_TOP && u.y < RIVER_BOTTOM) {
    const bridge = BRIDGES.find((b) => Math.abs(u.x - b.x) <= b.halfWidth);
    if (bridge) {
      // 橋の欄干の内側に収める
      const lo = bridge.x - bridge.halfWidth + u.radius * 0.5;
      const hi = bridge.x + bridge.halfWidth - u.radius * 0.5;
      u.x = Math.max(lo, Math.min(hi, u.x));
    } else {
      u.y = u.y < MID_Y ? RIVER_TOP : RIVER_BOTTOM;
    }
  }
}
