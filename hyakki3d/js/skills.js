// スキル（攻撃・召喚）と式神の行動
import { G, hurtEnemy, spawnProj, spawnAlly, addShake } from './game.js';
import { FX } from './fx.js';
import { sfx } from './audio.js';

const TAU = Math.PI * 2;
// 敵ごとの多段ヒット間隔管理スロット（enemy.last[slot]）
const SLOT = { kitsunebi: 0, kekkai: 1, byakko: 2 };

// ---- 近傍探索 ----
const NE = [], ND = [];
// (x,y) から半径 R 以内で近い順に最大 k 体を NE に入れて数を返す
function nearest(x, y, R, k) {
  const eg = G.egrid, en = G.enemies;
  let n = 0;
  for (const r of R > 120 ? [R * 0.4, R] : [R]) {
    const q = eg.query(x, y, r);
    const out = eg.out;
    n = 0;
    for (let i = 0; i < q; i++) {
      const e = en[out[i]];
      if (!e || !e.alive) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d > r * r) continue;
      if (n < k) { NE[n] = e; ND[n] = d; n++; }
      else if (d < ND[k - 1]) { NE[k - 1] = e; ND[k - 1] = d; }
      else continue;
      // 挿入ソート
      for (let j = Math.min(n, k) - 1; j > 0 && ND[j] < ND[j - 1]; j--) {
        const te = NE[j]; NE[j] = NE[j - 1]; NE[j - 1] = te;
        const td = ND[j]; ND[j] = ND[j - 1]; ND[j - 1] = td;
      }
    }
    if (n >= k) break;
  }
  // 中ボス・ボスが射程内にいれば優先して狙う（雑魚の壁に吸われて削れないのを防ぐ）
  for (const b of [G.midBoss, G.boss]) {
    if (!b || !b.alive) continue;
    const dx = b.x - x, dy = b.y - y;
    if (dx * dx + dy * dy > (R + b.r) * (R + b.r)) continue;
    let has = false;
    for (let i = 0; i < n; i++) if (NE[i] === b) has = true;
    if (has) continue;
    if (n < k) NE[n++] = b;
    else if (k > 1 || Math.random() < 0.5) { for (let i = n - 1; i > 0; i--) NE[i] = NE[i - 1]; NE[0] = b; }
  }
  return n;
}

// 半径内の敵に fn を適用（ボスも含む）
function forEachInRadius(x, y, R, fn) {
  const eg = G.egrid, en = G.enemies;
  const q = eg.query(x, y, R + 26, eg.out2);
  const out = eg.out2;
  for (let i = 0; i < q; i++) {
    const e = en[out[i]];
    if (!e || !e.alive || e.boss) continue;
    const dx = e.x - x, dy = e.y - y, rr = R + e.r;
    if (dx * dx + dy * dy < rr * rr) fn(e, dx, dy);
  }
  const b = G.boss;
  if (b && b.alive) {
    const dx = b.x - x, dy = b.y - y, rr = R + b.r;
    if (dx * dx + dy * dy < rr * rr) fn(b, dx, dy);
  }
}

// ================================================================ 攻撃スキル
export const SKILL_IMPL = {
  ofuda: {
    update(s, L, dt) {
      if ((s.t -= dt) > 0) return;
      const P = G.player;
      if (L.omni) {
        // 八方天符：全方位へ一斉に放つ（少しずつ回転）
        s.t = L.cd * G.st.cdMul;
        s.rot = (s.rot || 0) + 0.37;
        for (let i = 0; i < L.count; i++) {
          const a = s.rot + (i / L.count) * TAU;
          spawnProj('ofuda', P.x, P.y - 6, Math.cos(a) * 470, Math.sin(a) * 470, L.dmg, L.pierce, 1.2, 11, { spin: 16, kb: 90, boom: L.boom, big: true });
        }
        FX.ring(P.x, P.y, 10, 90, 0.3, '#ffe9a0', 4);
        sfx.shoot();
        return;
      }
      const n = nearest(P.x, P.y, 420, L.count);
      if (!n) { s.t = 0.1; return; }
      s.t = L.cd * G.st.cdMul;
      for (let i = 0; i < L.count; i++) {
        const tg = NE[i % n];
        const a = Math.atan2(tg.y - P.y, tg.x - P.x) + (i >= n ? (Math.random() - 0.5) * 0.6 : 0);
        spawnProj('ofuda', P.x, P.y - 6, Math.cos(a) * 430, Math.sin(a) * 430, L.dmg, L.pierce, 1.3, 9,
          { target: tg, turn: 7, spin: 14, kb: 70 });
      }
      sfx.shoot();
    },
  },

  kitsunebi: {
    update(s, L, dt) {
      const P = G.player;
      s.ang = (s.ang || 0) + L.spin * dt;
      if (!s.orbs) s.orbs = [];
      while (s.orbs.length < L.count) s.orbs.push({ x: 0, y: 0 });
      s.orbs.length = L.count;
      for (let i = 0; i < L.count; i++) {
        const a = s.ang + (i / L.count) * TAU;
        const o = s.orbs[i];
        const rad = L.radius + (L.breathe ? Math.sin(G.time * 2.2) * L.breathe : 0);
        o.x = P.x + Math.cos(a) * rad;
        o.y = P.y + Math.sin(a) * rad;
        forEachInRadius(o.x, o.y, 14, (e, dx, dy) => {
          if (G.time - e.last[SLOT.kitsunebi] < 0.4) return;
          e.last[SLOT.kitsunebi] = G.time;
          const d = Math.hypot(e.x - P.x, e.y - P.y) || 1;
          hurtEnemy(e, L.dmg, (e.x - P.x) / d, (e.y - P.y) / d, 160);
          FX.burst(e.x, e.y, 6, 2, 220, 7, 0.4, 1.0);
        });
        if (Math.random() < 0.5) FX.particle(o.x, o.y, 0, -20, 0.35, 6, 2, 1);
      }
    },
  },

  raifu: {
    update(s, L, dt) {
      if ((s.t -= dt) > 0) return;
      const v = G.view, en = G.enemies;
      if (!en.length) { s.t = 0.2; return; }
      s.t = L.cd * G.st.cdMul;
      let done = 0;
      for (let tries = 0; tries < L.strikes * 8 && done < L.strikes; tries++) {
        const big = G.boss || G.midBoss;
        const e = (big && Math.random() < 0.35) ? big : en[(Math.random() * en.length) | 0];
        if (!e.alive || e.x < v.x0 + 30 || e.x > v.x1 - 30 || e.y < v.y0 + 40 || e.y > v.y1 - 40) continue;
        strike(e.x, e.y, L);
        done++;
      }
      if (done) { G.castT = 1; sfx.thunder(); addShake(0.12); G.flash = Math.max(G.flash, 0.12); }
    },
  },

  kekkai: {
    update(s, L, dt) {
      s.rot = (s.rot || 0) + dt * 0.8;
      s.pulse = Math.max(0, (s.pulse || 0) - dt * 3);
      if ((s.t -= dt) > 0) return;
      s.t = L.tick;
      s.pulse = 1;
      const P = G.player;
      forEachInRadius(P.x, P.y, L.radius, (e) => {
        e.slowT = 0.5;
        const d = Math.hypot(e.x - P.x, e.y - P.y) || 1;
        hurtEnemy(e, L.dmg, (e.x - P.x) / d, (e.y - P.y) / d, L.push ? 150 : 25);
      });
      if (L.heal && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + L.heal);
    },
  },

  hamaya: {
    update(s, L, dt) {
      if ((s.t -= dt) > 0) return;
      s.t = L.cd * G.st.cdMul;
      const P = G.player;
      const base = Math.atan2(P.fy, P.fx);
      for (let i = 0; i < L.count; i++) {
        const a = base + (i - (L.count - 1) / 2) * (L.spread || 0.16);
        spawnProj('arrow', P.x, P.y - 6, Math.cos(a) * 680, Math.sin(a) * 680, L.dmg, 9999, 1.1, L.big ? 16 : 10, { kb: 110, big: !!L.big });
      }
      sfx.arrow();
    },
  },

  kami: { update: summonUpdate },
  byakko: { update: summonUpdate },
  zenki: { update: summonUpdate },
  karasu: { update: summonUpdate },
};
// 進化した術は元の術の処理を、強化された数値（と追加効果）で使う
Object.assign(SKILL_IMPL, {
  tenpu: SKILL_IMPL.ofuda, kyubi: SKILL_IMPL.kitsunebi, raijin: SKILL_IMPL.raifu, daikekkai: SKILL_IMPL.kekkai, tenkyu: SKILL_IMPL.hamaya,
  hyakki: { update: summonUpdate }, kagebunshin: { update: summonUpdate }, kishin: { update: summonUpdate }, karyu: { update: summonUpdate },
});

function strike(x, y, L, depth = 0) {
  FX.bolt(x, y);
  FX.anim('explosion', x, y, { scale: L.aoe / 90, dur: 0.4, alpha: 0.85 });
  FX.ring(x, y, 6, L.aoe * 1.3, 0.35, '#c9b0ff', 6);
  FX.burst(x, y, 14, 4, 300, 9, 0.5);
  FX.burst(x, y, 6, 3, 200, 7, 0.3);
  const hit = [];
  forEachInRadius(x, y, L.aoe, (e) => {
    const d = Math.hypot(e.x - x, e.y - y) || 1;
    hurtEnemy(e, L.dmg, (e.x - x) / d, (e.y - y) / d, 140);
    hit.push(e);
  });
  // 雷神招来：近くの妖怪へ連鎖する
  if (L.chain && depth === 0) {
    const n = nearest(x, y, 260, L.chain + hit.length + 1);
    let c = 0;
    for (let k = 0; k < n && c < L.chain; k++) {
      const e = NE[k];
      if (!e.alive || hit.includes(e)) continue;
      FX.arc(x, y, e.x, e.y);
      hurtEnemy(e, L.dmg * 0.7, 0, 0, 80);
      FX.burst(e.x, e.y, 8, 4, 260, 8, 0.35, 1.0);
      c++;
    }
  }
}

// ================================================================ 召喚
function summonUpdate(s, L, dt) {
  if ((s.t -= dt) > 0) return;
  s.t = L.cd * G.st.cdMul;
  const P = G.player, def = s.def;
  const cnt = L.count + G.st.shikiCount;
  let made = 0;
  for (let i = 0; i < cnt; i++) {
    const a = (i / cnt) * TAU + Math.random() * 0.3;
    const r = 30 + Math.random() * 40 + cnt * 2.5;
    const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
    const al = spawnAlly(def.ally || s.id, x, y, L);
    if (!al) break;
    made++;
    al.idx = i;
    FX.burst(x, y, 6, (def.ally || s.id) === 'karasu' ? 1 : 2, 160, 7, 0.6, 0.3);
    if ((def.ally || s.id) === 'zenki') {
      FX.anim('explosion', x, y, { scale: 0.9 });
      FX.seal(x, y, 70, 0.9, null, true);
    }
  }
  if (!made) return;
  FX.seal(P.x, P.y, 50 + Math.min(cnt, 16) * 4, 0.7, P);
  FX.ring(P.x, P.y, 10, 100 + cnt * 4, 0.5, '#ffe9b0', 4);
  FX.text(P.x, P.y - 44, `${def.name} ×${made}`, def.color, 20, true);
  FX.pillar(P.x, P.y, 40, 0.6, def.color, P);
  if ((def.ally || s.id) === 'zenki') addShake(0.25);
  G.castT = 1;
  sfx.summon(def.ally || s.id);
}

// 標的の取得（生存確認つき、一定間隔で再探索）
function acquire(a, R, dt) {
  const t = a.target;
  if (t && t.alive && t.uid === a.tuid) {
    a.retT -= dt;
    if (a.retT > 0) return t;
  }
  a.retT = 0.3 + Math.random() * 0.15;
  const n = nearest(a.x, a.y, R, 1);
  // プレイヤーから離れすぎた敵は追わない
  if (n) {
    const e = NE[0], P = G.player;
    const dx = e.x - P.x, dy = e.y - P.y;
    if (dx * dx + dy * dy < 520 * 520) { a.target = e; a.tuid = e.uid; return e; }
  }
  a.target = null;
  return null;
}

function moveTo(a, x, y, sp, dt) {
  const dx = x - a.x, dy = y - a.y, d = Math.hypot(dx, dy) || 1;
  const m = Math.min(d, sp * dt);
  a.x += dx / d * m; a.y += dy / d * m;
  if (m > 0.2) { a.yaw = Math.atan2(dx, dy); a.at += dt * 8; }
  return d;
}

function follow(a, dt, ring) {
  const P = G.player;
  const ang = a.idx * 2.39996 + G.time * 0.6;
  const tx = P.x + Math.cos(ang) * ring, ty = P.y + Math.sin(ang) * ring * 0.8;
  moveTo(a, tx, ty, a.speed * 0.8, dt);
}

// 紙人形どうしの重なりを軽く解消
function separateAllies(a) {
  const ag = G.agrid, bl = G.blockers;
  const q = ag.query(a.x, a.y, a.r * 2, ag.out2);
  let c = 0;
  for (let k = 0; k < q && c < 5; k++) {
    const o = bl[ag.out2[k]];
    if (!o || o === a || !o.alive) continue;
    const dx = a.x - o.x, dy = a.y - o.y, rr = a.r + o.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.0001) {
      const d = Math.sqrt(d2), f = (rr - d) / d * 0.3;
      a.x += dx * f; a.y += dy * f; c++;
    }
  }
}

export const ALLY_IMPL = {
  // 紙人形：大量・脆い・群がって殴る＆壁
  kami: {
    r: 9, speed: 175,
    update(a, dt) {
      const t = acquire(a, 260, dt);
      a.atkT -= dt;
      if (t) {
        const reach = a.r + t.r + 3;
        const d = Math.hypot(t.x - a.x, t.y - a.y);
        if (d > reach) moveTo(a, t.x, t.y, a.speed, dt);
        else if (a.atkT <= 0) {
          a.atkT = 0.45;
          a.atk = 0.36;
          const nx = (t.x - a.x) / (d || 1), ny = (t.y - a.y) / (d || 1);
          hurtEnemy(t, a.dmg, nx, ny, 40, true);
          FX.anim('cut', (a.x + t.x) / 2, (a.y + t.y) / 2, { scale: 0.7, dur: 0.16, rot: Math.atan2(ny, nx) });
          a.squash = 0.08;
        }
      } else follow(a, dt, 50);
      separateAllies(a);
    },
  },

  // 白狐：高速で駆け抜けて貫通ダメージ
  byakko: {
    r: 13, speed: 340,
    update(a, dt) {
      const t = acquire(a, 340, dt);
      const P = G.player;
      let tx, ty;
      if (t) { tx = t.x; ty = t.y; }
      else { const ang = G.time * 2 + a.idx * 2; tx = P.x + Math.cos(ang) * 90; ty = P.y + Math.sin(ang) * 70; }
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dt * 5);
      a.vx += (dx / d * a.speed - a.vx) * k;
      a.vy += (dy / d * a.speed - a.vy) * k;
      a.x += a.vx * dt; a.y += a.vy * dt;
      a.at += dt * 10;
      if (t && d < 18) a.retT = 0;   // 通り抜けたら次の獲物へ
      const sp = Math.hypot(a.vx, a.vy) || 1;
      forEachInRadius(a.x, a.y, a.r, (e) => {
        if (G.time - e.last[SLOT.byakko] < 0.35) return;
        e.last[SLOT.byakko] = G.time;
        hurtEnemy(e, a.dmg, a.vx / sp, a.vy / sp, 90, true);
        FX.burst(e.x, e.y, 3, 3, 160, 6, 0.25);
      });
      if (G.frame % 2 === 0) FX.particle(a.x, a.y + 4, -a.vx * 0.1, -a.vy * 0.1, 0.35, 7, 7, 2);
    },
  },

  // 前鬼：重量級。地面叩きつけで範囲ダメージ＆吹き飛ばし
  zenki: {
    r: 22, speed: 120,
    update(a, dt) {
      const t = acquire(a, 300, dt);
      a.atkT -= dt;
      if (t) {
        const d = Math.hypot(t.x - a.x, t.y - a.y);
        if (d > a.aoe * 0.5) moveTo(a, t.x, t.y, a.speed, dt);
        if (d < a.aoe * 0.8 && a.atkT <= 0) {
          a.atkT = 1.1;
          a.squash = 0.18;
          forEachInRadius(a.x, a.y, a.aoe, (e) => {
            const dd = Math.hypot(e.x - a.x, e.y - a.y) || 1;
            hurtEnemy(e, a.dmg, (e.x - a.x) / dd, (e.y - a.y) / dd, 300, true);
          });
          FX.anim('explosion', a.x, a.y + 10, { scale: a.aoe / 40, dur: 0.45, alpha: 0.85 });
          FX.anim('cut', a.x, a.y, { scale: a.aoe / 22, dur: 0.2, rot: Math.random() * 6 });
          a.atk = 0.36;
          a.flip = t.x < a.x;
          FX.burst(a.x, a.y + 10, 18, 8, 260, 9, 0.5);
          FX.burst(a.x, a.y + 10, 8, 0, 200, 7, 0.4);
          addShake(0.1);
          sfx.slam();
          sfx.slash();
        }
      } else follow(a, dt, 70);
    },
  },

  // 烏天狗：プレイヤーの周囲を飛び、羽を撃つ
  karasu: {
    r: 10, speed: 260,
    update(a, dt) {
      const P = G.player;
      a.ang += dt * 1.3;
      const R = 80 + (a.idx % 3) * 22;
      const tx = P.x + Math.cos(a.ang) * R, ty = P.y + Math.sin(a.ang) * R * 0.7 - 10;
      const k = Math.min(1, dt * 6);
      a.yaw = Math.atan2(tx - a.x, ty - a.y);
      a.at += dt * 8;
      a.x += (tx - a.x) * k; a.y += (ty - a.y) * k;
      a.atkT -= dt;
      if (a.atkT <= 0) {
        const n = nearest(a.x, a.y, 300, 1);
        if (n) {
          const e = NE[0];
          const ang = Math.atan2(e.y - a.y, e.x - a.x);
          a.atk = 0.36;
          spawnProj('feather', a.x, a.y - 12, Math.cos(ang) * 560, Math.sin(ang) * 560, a.dmg, 2, 0.8, 7, { ally: true, kb: 50, boom: a.boom });
          a.atkT = a.fire;
        } else a.atkT = 0.15;
      }
    },
  },
};

