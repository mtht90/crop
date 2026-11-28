// 武器の挙動。すべて自動で発動する。
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { TAU, rand, pick } from '../core/util.js';

export function newWeapon(id) {
  return { id, lv: 1, t: rand(0.1, 0.5), phase: 0, hits: new Map(), queue: [], extra: {} };
}

// 武器の実効値(レベル・パッシブ・秘宝込み)
export function weaponStats(w, s, g) {
  const d = WEAPONS[w.id];
  const st = { ...d.base };
  if (d.lv) for (let i = 0; i < w.lv - 1 && i < d.lv.length; i++) {
    const L = d.lv[i];
    if (L.dmg) st.dmg += L.dmg;
    if (L.amount) st.amount += L.amount;
    if (L.cd) st.cd *= L.cd;
    if (L.area) st.area *= L.area;
    if (L.pierce) st.pierce += L.pierce;
    if (L.dur) st.dur *= L.dur;
    if (L.speed) st.speed *= L.speed;
  }
  st.dmg *= s.might * g.dmgMul;
  st.cd *= s.cooldown * g.cdMul;
  st.area *= s.area;
  st.dur *= s.duration;
  st.amount += s.amount;
  st.speed *= s.speedMul;
  return st;
}

export function levelText(id, lv) {
  const d = WEAPONS[id];
  if (lv <= 1 || !d.lv) return d.desc;
  const L = d.lv[lv - 2];
  const t = [];
  if (L.dmg) t.push(`ダメージ +${L.dmg}`);
  if (L.amount) t.push(`弾数 +${L.amount}`);
  if (L.cd) t.push(`攻撃間隔 -${Math.round((1 - L.cd) * 100)}%`);
  if (L.area) t.push(`範囲 +${Math.round((L.area - 1) * 100)}%`);
  if (L.pierce) t.push(`貫通 +${L.pierce}`);
  if (L.dur) t.push(`持続 +${Math.round((L.dur - 1) * 100)}%`);
  if (L.speed) t.push(`速度 +${Math.round((L.speed - 1) * 100)}%`);
  return t.join('、');
}

const tmpArr = [];
function nearestEnemies(g, x, z, r, n) {
  const c = g.grid.query(x, z, r, tmpArr);
  const out = [];
  for (const e of c) {
    if (e.dead) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d > r * r) continue;
    out.push([d, e]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.slice(0, n).map((a) => a[1]);
}
function randomEnemy(g, x, z, r) {
  const c = g.grid.query(x, z, r, tmpArr);
  for (let k = 0; k < 6 && c.length; k++) {
    const e = c[(Math.random() * c.length) | 0];
    if (!e.dead && (e.x - x) ** 2 + (e.z - z) ** 2 < r * r) return e;
  }
  return null;
}
function densest(g, x, z, r) {
  let best = null, bestN = -1;
  const c = g.grid.query(x, z, r, tmpArr).slice();
  for (let k = 0; k < Math.min(24, c.length); k++) {
    const e = c[(Math.random() * c.length) | 0];
    if (e.dead) continue;
    const n = g.grid.query(e.x, e.z, 3, tmpArr).length;
    if (n > bestN) { bestN = n; best = e; }
  }
  return best;
}

export function updateWeapon(g, w, dt) {
  const p = g.player;
  const s = weaponStats(w, g.stats, g);
  const d = WEAPONS[w.id];
  w.t -= dt;
  // 時間差発射の処理
  for (let i = w.queue.length - 1; i >= 0; i--) {
    const q = w.queue[i];
    q.t -= dt;
    if (q.t <= 0) { q.fn(); w.queue.splice(i, 1); }
  }
  switch (w.id) {
    case 'bolt': case 'starfall': {
      if (w.t > 0) break;
      w.t = s.cd;
      if (w.id === 'bolt') {
        const targets = nearestEnemies(g, p.x, p.z, 16, s.amount);
        if (!targets.length) { w.t = 0.15; break; }
        for (let i = 0; i < s.amount; i++) {
          const tg = targets[i % targets.length];
          w.queue.push({ t: i * 0.06, fn: () => {
            const a = Math.atan2(tg.z - p.z, tg.x - p.x) + rand(-0.15, 0.15);
            g.spawnProj({ kind: 'bolt', src: w.id, x: p.x, y: 1.0, z: p.z, vx: Math.cos(a) * s.speed, vz: Math.sin(a) * s.speed, dmg: s.dmg, pierce: s.pierce, life: s.dur, r: 0.45 * s.area, homing: tg, turn: 8, scale: s.area });
            g.audio.play('shoot');
          } });
        }
      } else {
        for (let i = 0; i < s.amount; i++) {
          w.queue.push({ t: i * 0.05, fn: () => {
            const tg = randomEnemy(g, p.x, p.z, 17);
            const tx = tg ? tg.x : p.x + rand(-10, 10), tz = tg ? tg.z : p.z + rand(-10, 10);
            g.spawnProj({ kind: 'star', src: w.id, x: tx - 4, y: 14, z: tz - 4, vx: 4 / 0.32, vy: -14 / 0.32, vz: 4 / 0.32, dmg: s.dmg, pierce: 999, life: 0.32, r: 0, sky: true, boom: 1.7 * s.area, scale: 1.3 });
          } });
        }
        g.audio.play('shoot', { pitch: 1.4 });
      }
      break;
    }
    case 'blades': case 'bladestorm': {
      const storm = w.id === 'bladestorm';
      if (!w.extra.active && w.t <= 0) { w.extra.active = true; w.extra.time = s.dur; g.audio.play('blade'); }
      if (w.extra.active) {
        w.extra.time -= dt;
        if (!storm && w.extra.time <= 0) { w.extra.active = false; w.t = s.cd; w.hits.clear(); break; }
        w.phase += dt * 3.4 * s.speed;
        const R = 2.7 * s.area;
        const blades = [];
        for (let i = 0; i < s.amount; i++) {
          const a = w.phase + (i / s.amount) * TAU;
          const bx = p.x + Math.cos(a) * R, bz = p.z + Math.sin(a) * R;
          blades.push([bx, bz, a]);
          g.hitArea(bx, bz, 0.95 * s.area, s.dmg, w, 0.4, { kx: Math.cos(a), kz: Math.sin(a), kb: 5 });
          if (storm && (i + Math.floor(w.phase * 3)) % 9 === 0) g.fx.emit(bx, 1, bz, 1, '#ffffff', { speed: 2, up: 1, size: 0.15, life: 0.3, grav: 0 });
        }
        g.drawBlades(blades, s.area * (storm ? 1.25 : 1));
        if (Math.random() < dt * 4) g.audio.play('blade');
      }
      break;
    }
    case 'lightning': case 'tempest': {
      if (w.t > 0) break;
      w.t = s.cd;
      let any = false;
      for (let i = 0; i < s.amount; i++) {
        w.queue.push({ t: i * 0.07, fn: () => {
          const tg = randomEnemy(g, p.x, p.z, 15);
          if (!tg) return;
          g.lightning(tg, s.dmg, s.pierce, w, w.id === 'tempest' ? 1.4 : 1);
        } });
        any = true;
      }
      if (!any) w.t = 0.2;
      break;
    }
    case 'arrows': case 'thousand': {
      if (w.t > 0) break;
      w.t = s.cd;
      const all = w.id === 'thousand';
      const base = all ? w.phase : Math.atan2(p.fz, p.fx);
      if (all) w.phase += 0.37;
      for (let i = 0; i < s.amount; i++) {
        const a = all ? base + (i / s.amount) * TAU : base + (i - (s.amount - 1) / 2) * 0.13;
        g.spawnProj({ kind: 'arrow', src: w.id, x: p.x, y: 1.0, z: p.z, vx: Math.cos(a) * s.speed, vz: Math.sin(a) * s.speed, dmg: s.dmg, pierce: s.pierce, life: s.dur * 0.8, r: 0.5 * s.area, scale: s.area, kb: 3 });
      }
      g.audio.play('arrow');
      break;
    }
    case 'aura': case 'sanctum': {
      const R = 2.6 * s.area;
      g.setAura(R, w.id === 'sanctum' ? '#fff2b0' : '#ffe08a');
      if (w.t > 0) break;
      w.t = s.cd;
      g.hitArea(p.x, p.z, R, s.dmg, w, 0, { radial: true, kb: 4 * g.stats.knock, noSound: true });
      break;
    }
    case 'firebomb': case 'inferno': {
      if (w.t > 0) break;
      w.t = s.cd;
      for (let i = 0; i < s.amount; i++) {
        w.queue.push({ t: i * 0.12, fn: () => {
          const tg = randomEnemy(g, p.x, p.z, 12);
          const tx = tg ? tg.x + rand(-1, 1) : p.x + rand(-7, 7), tz = tg ? tg.z + rand(-1, 1) : p.z + rand(-7, 7);
          const T = 0.55;
          g.spawnProj({ kind: 'flask', src: w.id, x: p.x, y: 1.2, z: p.z, vx: (tx - p.x) / T, vy: 9, vz: (tz - p.z) / T, grav: 9 / (T / 2), dmg: s.dmg, pierce: 999, life: T, r: 0, lob: true, zone: { r: 2.1 * s.area, dur: s.dur, dps: s.dmg, color: w.id === 'inferno' ? '#ff4a10' : '#ff8a3c' }, scale: 1.2 });
          g.audio.play('throw');
        } });
      }
      if (w.id === 'inferno') g.addZone(p.x, p.z, 2.4 * s.area, s.dur * 0.6, s.dmg, w, '#ff4a10');
      break;
    }
    case 'frost': case 'zero': {
      if (w.t > 0) break;
      w.t = s.cd;
      const R = (w.id === 'zero' ? 8 : 5.5) * s.area;
      g.rings.spawn('ring', p.x, p.z, { color: '#aef4ff', r0: 0.5, r1: R, life: 0.45, opacity: 1 });
      g.rings.spawn('disc', p.x, p.z, { color: '#5fd8ff', r0: 0.5, r1: R, life: 0.35, opacity: 0.35 });
      g.fx.emit(p.x, 0.6, p.z, 30, '#d8fbff', { speed: R * 2.2, up: 2, size: 0.2, life: 0.5, grav: 2, glow: 1.6 });
      g.hitArea(p.x, p.z, R, s.dmg, w, 0, { radial: true, kb: 3, freeze: s.dur, noSound: true, shatter: w.id === 'zero' });
      g.audio.play('nova');
      break;
    }
    case 'boomerang': case 'cyclone': {
      if (w.t > 0) break;
      w.t = s.cd;
      const tg = nearestEnemies(g, p.x, p.z, 14, 1)[0];
      const base = tg ? Math.atan2(tg.z - p.z, tg.x - p.x) : Math.atan2(p.fz, p.fx);
      for (let i = 0; i < s.amount; i++) {
        const a = base + (i - (s.amount - 1) / 2) * (w.id === 'cyclone' ? TAU / s.amount : 0.5);
        g.spawnProj({ kind: 'boomerang', src: w.id, x: p.x, y: 1.0, z: p.z, vx: Math.cos(a) * s.speed, vz: Math.sin(a) * s.speed, dmg: s.dmg, pierce: 999, life: 4, r: 0.9 * s.area, boomer: true, out: 0.55, scale: s.area * (w.id === 'cyclone' ? 1.4 : 1), kb: 2, rehit: 0.5 });
      }
      g.audio.play('throw');
      break;
    }
    case 'meteor': case 'doomstar': {
      if (w.t > 0) break;
      w.t = s.cd;
      for (let i = 0; i < s.amount; i++) {
        w.queue.push({ t: i * 0.25, fn: () => {
          const tg = densest(g, p.x, p.z, 16);
          const tx = tg ? tg.x : p.x + rand(-8, 8), tz = tg ? tg.z : p.z + rand(-8, 8);
          const R = 3.4 * s.area;
          g.rings.spawn('ring', tx, tz, { color: '#ff3a1a', r0: R, r1: R * 0.95, life: 0.6, opacity: 0.9, ease: 'lin' });
          g.rings.spawn('disc', tx, tz, { color: '#ff3a1a', r0: 0.2, r1: R, life: 0.6, opacity: 0.25, ease: 'lin' });
          g.spawnProj({ kind: 'meteor', src: w.id, x: tx + 6, y: 22, z: tz - 6, vx: -6 / 0.6, vy: -22 / 0.6, vz: 6 / 0.6, dmg: s.dmg, pierce: 999, life: 0.6, r: 0, sky: true, boom: R, big: true, scale: s.area * (w.id === 'doomstar' ? 1.5 : 1) });
          g.audio.play('meteor');
        } });
      }
      break;
    }
  }
}
