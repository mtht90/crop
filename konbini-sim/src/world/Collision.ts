import * as THREE from 'three';

/** Axis-aligned rectangle on the floor plane (x/z). */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Blocks NPC navigation too (false for e.g. things only the player bumps into). */
  nav?: boolean;
  tag?: string;
}

/** 2D floor-plan collision used by the player and NPC steering. */
export class Collision {
  rects: Rect[] = [];

  add(r: Rect): Rect {
    this.rects.push(r);
    return r;
  }

  addBox(cx: number, cz: number, w: number, d: number, tag?: string, nav = true): Rect {
    return this.add({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, tag, nav });
  }

  remove(r: Rect): void {
    const i = this.rects.indexOf(r);
    if (i >= 0) this.rects.splice(i, 1);
  }

  /** Push a circle out of all rects. Returns corrected position. */
  resolve(pos: THREE.Vector3, radius: number, ignore?: (r: Rect) => boolean): THREE.Vector3 {
    for (let iter = 0; iter < 3; iter++) {
      for (const r of this.rects) {
        if (ignore?.(r)) continue;
        const cx = Math.max(r.minX, Math.min(pos.x, r.maxX));
        const cz = Math.max(r.minZ, Math.min(pos.z, r.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * radius;
            pos.z = cz + (dz / d) * radius;
          } else {
            // centre inside rect: push out along the smallest axis
            const left = pos.x - r.minX;
            const right = r.maxX - pos.x;
            const top = pos.z - r.minZ;
            const bottom = r.maxZ - pos.z;
            const m = Math.min(left, right, top, bottom);
            if (m === left) pos.x = r.minX - radius;
            else if (m === right) pos.x = r.maxX + radius;
            else if (m === top) pos.z = r.minZ - radius;
            else pos.z = r.maxZ + radius;
          }
        }
      }
    }
    return pos;
  }

  pointBlocked(x: number, z: number, inflate: number): boolean {
    for (const r of this.rects) {
      if (r.nav === false) continue;
      if (x > r.minX - inflate && x < r.maxX + inflate && z > r.minZ - inflate && z < r.maxZ + inflate) return true;
    }
    return false;
  }
}
