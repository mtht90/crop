// ゲーム本体：状態・更新・描画
import {
  VIEW_MIN, RUN, LIMITS, PLAYER, ENEMIES, SPAWN, EVENTS, ELITE, DROPS, SKILLS, SLOTS,
  PICK_WEIGHT, START_SKILLS, hpScale, speedScale, xpNeed,
} from './config.js';
import { Grid } from './grid.js';
import { SPR, draw, drawRot, dirOf } from './sprites.js';
import { FX } from './fx.js';
import { sfx, music } from './audio.js';
import { input, pollInput } from './input.js';
import { SKILL_IMPL, ALLY_IMPL, drawSkillsGround, drawSkillsGlow } from './skills.js';
import { UI } from './ui.js';

const TAU = Math.PI * 2;

export const G = {
  state: 'title',
  frame: 0,
  time: 0,
  player: null,
  enemies: [], allies: [], blockers: [], projs: [], bullets: [], gems: [], pickups: [],
  skills: [],
  st: {},
  level: 1, xp: 0, xpNext: 5, pending: 0,
  kills: 0, streak: 0, streakT: 0, maxAllies: 0, dmgDealt: 0, gemChain: 0, gemT: 0,
  cam: { x: 0, y: 0 },
  shake: 0, flash: 0, hurtFlash: 0, redPulse: 0,
  slowT: 0, hitstop: 0,
  view: { w: 0, h: 0, zoom: 1, halfDiag: 0, x0: 0, y0: 0, x1: 0, y1: 0 },
  boss: null, eventIdx: 0, nextElite: ELITE.first, spawnAcc: 0, marches: [],
  ending: null,
  limits: { ...LIMITS },
  egrid: null, agrid: null,
  debug: {},
  milestoneIdx: 0,
};

const MILESTONES = [100, 300, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000];
const epool = [], apool = [], ppool = [], gpool = [];
let uidSeq = 1;

export function initGame(opts) {
  G.debug = opts.debug || {};
  if (opts.mobile) {
    G.limits.enemies = 1100;
    G.limits.particles = 1400;
    G.limits.texts = 80;
    G.limits.allies = 280;
  }
  G.egrid = new Grid(40, 90, 90, G.limits.enemies + 200);
  G.agrid = new Grid(40, 90, 90, G.limits.allies + 50);
  FX.init(G.limits.particles, G.limits.texts);
}

// ================================================================ ラン開始
export function newRun() {
  for (const e of G.enemies) epool.push(e);
  for (const a of G.allies) apool.push(a);
  for (const p of G.projs) ppool.push(p);
  for (const g of G.gems) gpool.push(g);
  G.enemies.length = 0; G.allies.length = 0; G.projs.length = 0; G.bullets.length = 0;
  G.gems.length = 0; G.pickups.length = 0; G.blockers.length = 0; G.marches.length = 0;
  FX.clear();
  G.player = {
    x: 0, y: 0, hp: PLAYER.hp, maxHp: PLAYER.hp, r: PLAYER.r,
    fx: 1, fy: 0, moving: false, hurtT: 0, walk: 0, dir: 0,
  };
  G.cam.x = 0; G.cam.y = 0;
  G.time = Number(G.debug.t) || 0;
  G.frame = 0;
  G.skills = [];
  G.level = 1; G.xp = 0; G.xpNext = xpNeed(1); G.pending = 0;
  G.kills = 0; G.streak = 0; G.streakT = 0; G.maxAllies = 0; G.dmgDealt = 0;
  G.shake = G.flash = G.hurtFlash = G.redPulse = G.slowT = G.hitstop = 0;
  G.boss = null; G.ending = null; G.spawnAcc = 0; G.milestoneIdx = 0;
  G.eventIdx = 0;
  while (G.eventIdx < EVENTS.length && EVENTS[G.eventIdx].t < G.time) G.eventIdx++;
  G.nextElite = ELITE.first;
  while (G.nextElite < G.time) G.nextElite += ELITE.every;
  for (const id of START_SKILLS) addOrUpgrade(id);
  const extra = Number(G.debug.lv) || 0;          // デバッグ: ランダムにレベルを上げた状態で開始
  for (let i = 0; i < extra; i++) {
    const o = rollOptions().filter((x) => !x.startsWith('_'));
    if (o.length) addOrUpgrade(o[(Math.random() * o.length) | 0]);
    G.level++;
  }
  G.xpNext = xpNeed(G.level);
  G.state = 'play';
  UI.showHUD();
  UI.refreshSkills(G);
  UI.bossBar(false);
  music.intensity = 0;
}

// ================================================================ スキル管理
export function skillLv(id) {
  for (const s of G.skills) if (s.id === id) return s.lv;
  return 0;
}

export function addOrUpgrade(id) {
  if (id === '_heal') { healPlayer(G.player.maxHp); return; }
  if (id === '_purge') { purge(); return; }
  let s = G.skills.find((k) => k.id === id);
  if (!s) {
    s = { id, def: SKILLS[id], lv: 1, t: 0.3 };
    G.skills.push(s);
  } else if (s.lv < s.def.levels.length) {
    s.lv++;
  }
  recalcStats();
  UI.refreshSkills(G);
}

function recalcStats() {
  const st = G.st;
  st.dmgMul = 1 + 0.12 * skillLv('reiryoku');
  st.cdMul = 1 - 0.07 * skillLv('sokuei');
  st.speedMul = 1 + 0.08 * skillLv('idaten');
  st.pickup = PLAYER.pickup * (1 + 0.3 * skillLv('kyukon'));
  st.xpMul = 1 + 0.05 * skillLv('kyukon');
  const sk = skillLv('shikiko');
  st.shikiDmg = 1 + 0.12 * sk;
  st.shikiDur = 1 + 0.1 * sk;
  st.shikiCount = Math.floor(sk / 2);
  const c = skillLv('chomei');
  st.regen = 0.4 * c;
  const P = G.player;
  if (P) {
    const newMax = PLAYER.hp + 20 * c;
    if (newMax > P.maxHp) P.hp += newMax - P.maxHp;
    P.maxHp = newMax;
  }
}

export function rollOptions() {
  let act = 0, pas = 0;
  for (const s of G.skills) s.def.type === 'passive' ? pas++ : act++;
  const cand = [];
  for (const id in SKILLS) {
    const def = SKILLS[id];
    const owned = G.skills.find((s) => s.id === id);
    if (owned) {
      if (owned.lv < def.levels.length) cand.push({ id, w: PICK_WEIGHT.upgrade });
    } else if (def.type === 'passive' ? pas < SLOTS.passive : act < SLOTS.active) {
      cand.push({ id, w: PICK_WEIGHT[def.type] });
    }
  }
  const out = [];
  while (out.length < 3 && cand.length) {
    let sum = 0;
    for (const c of cand) sum += c.w;
    let r = Math.random() * sum, k = 0;
    while (k < cand.length - 1 && (r -= cand[k].w) > 0) k++;
    out.push(cand[k].id);
    cand.splice(k, 1);
  }
  if (out.length < 3) out.push('_heal');
  if (out.length < 3) out.push('_purge');
  return out;
}

// ================================================================ 生成
function newEnemy() {
  return {
    uid: 0, alive: false, def: null, type: '', spr: null, x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0,
    r: 0, speed: 0, dmg: 0, xp: 0, mass: 1, flash: 0, slowT: 0, march: false, mdx: 0, mdy: 0,
    wob: 0, hopT: 0, last: new Float32Array(8), elite: false, boss: false, ai: null, dir: 0, at: 0,
  };
}

export function spawnEnemy(type, x, y, force = false) {
  if (!force && G.enemies.length >= G.limits.enemies) return null;
  const d = ENEMIES[type];
  const e = epool.pop() || newEnemy();
  e.uid = uidSeq++; e.alive = true; e.def = d; e.type = type; e.spr = SPR[type];
  e.x = x; e.y = y; e.vx = 0; e.vy = 0;
  e.maxHp = e.hp = d.boss ? d.hp : d.hp * hpScale(G.time);
  e.r = d.r; e.dmg = d.dmg; e.xp = d.xp; e.mass = d.mass;
  e.speed = d.speed * speedScale(G.time) * (0.88 + Math.random() * 0.24);
  e.flash = 0; e.slowT = 0; e.march = false; e.wob = Math.random() * TAU; e.hopT = Math.random();
  e.last.fill(-99);
  e.elite = !!d.elite; e.boss = !!d.boss; e.ai = null; e.dir = 0; e.at = Math.random() * 4;
  G.enemies.push(e);
  return e;
}

export function spawnAlly(type, x, y, L) {
  if (G.allies.length >= G.limits.allies) return null;
  const a = apool.pop() || {};
  const st = G.st;
  a.alive = true; a.type = type; a.spr = SPR[type];
  a.x = x; a.y = y; a.vx = 0; a.vy = 0;
  a.dmg = (L.dmg || 0) * st.shikiDmg;
  a.life = a.maxLife = L.dur * st.shikiDur;
  a.hp = a.maxHp = L.hp || 1e9;
  a.target = null; a.tuid = 0; a.retT = Math.random() * 0.2;
  a.atkT = Math.random() * 0.3; a.spawnT = 0; a.squash = 0;
  a.ang = Math.random() * TAU; a.idx = (Math.random() * 1000) | 0; a.dir = 0; a.at = Math.random() * 4; a.atk = 0;
  a.aoe = L.aoe || 0; a.fire = L.fire || 0;
  a.blocks = type === 'kami' || type === 'zenki';
  const impl = ALLY_IMPL[type];
  a.r = impl.r; a.speed = impl.speed;
  G.allies.push(a);
  return a;
}

export function spawnProj(kind, x, y, vx, vy, dmg, pierce, life, r, opt = {}) {
  if (G.projs.length >= G.limits.projectiles) return null;
  const p = ppool.pop() || { hits: [] };
  p.alive = true; p.kind = kind; p.spr = SPR[kind];
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.dmg = dmg; p.pierce = pierce; p.life = life; p.r = r;
  p.hits.length = 0;
  p.target = opt.target || null; p.tuid = p.target ? p.target.uid : 0;
  p.turn = opt.turn || 0; p.spin = opt.spin || 0; p.rot = Math.atan2(vy, vx);
  p.face = !!opt.face; p.kb = opt.kb ?? 60; p.ally = !!opt.ally;
  G.projs.push(p);
  return p;
}

function spawnBullet(x, y, vx, vy, dmg) {
  if (G.bullets.length >= G.limits.enemyBullets) return;
  G.bullets.push({ x, y, vx, vy, dmg, r: 9, life: 4 });
}

function dropGem(x, y, v) {
  if (v <= 0) return;
  if (G.gems.length >= G.limits.gems) {
    const g = G.gems[(Math.random() * G.gems.length) | 0];
    g.v += v;
    g.tier = gemTier(g.v);
    return;
  }
  const g = gpool.pop() || {};
  g.alive = true; g.x = x; g.y = y; g.v = v; g.tier = gemTier(v); g.mag = false; g.spd = 0;
  G.gems.push(g);
}
function gemTier(v) { return v >= 20 ? 3 : v >= 5 ? 2 : v >= 2 ? 1 : 0; }

function dropPickup(kind, x, y) {
  G.pickups.push({ kind, x, y, alive: true, t: 0, mag: false, spd: 0 });
}

// ================================================================ ダメージ
export function hurtEnemy(e, base, nx, ny, kb, ally = false) {
  if (!e.alive) return;
  let dmg = base * G.st.dmgMul;
  const crit = Math.random() < PLAYER.crit;
  if (crit) dmg *= PLAYER.critMul;
  dmg = Math.max(1, Math.round(dmg * (0.9 + Math.random() * 0.2)));
  e.hp -= dmg;
  e.flash = 0.1;
  if (kb && !e.boss) {
    const k = kb / e.mass;
    e.vx += nx * k; e.vy += ny * k;
  }
  G.dmgDealt += dmg;
  if (crit) FX.text(e.x, e.y - e.r, dmg + '!', '#ffd35a', 22);
  else FX.text(e.x, e.y - e.r, '' + dmg, ally ? '#bfe6ff' : '#ffffff', e.boss ? 18 : 14);
  sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

export function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false;
  if (e.boss) { bossDefeated(e); return; }
  G.kills++;
  G.streak++;
  G.streakT = 2.2;
  if (G.milestoneIdx < MILESTONES.length && G.kills >= MILESTONES[G.milestoneIdx]) {
    UI.banner(`${MILESTONES[G.milestoneIdx].toLocaleString()} 体 祓い!`, 'gold');
    G.milestoneIdx++;
    sfx.chest();
  }
  const col = e.def.color;
  if (e.elite) {
    FX.burst(e.x, e.y, 50, col, 320, 12, 0.8);
    FX.burst(e.x, e.y, 30, 0, 220, 9, 0.9);
    FX.anim('explosion', e.x, e.y, { scale: 2.2, force: true });
    addShake(0.35);
    G.hitstop = 0.06;
    sfx.slam();
    dropPickup('chest', e.x, e.y);
  } else {
    FX.burst(e.x, e.y, 5, col, 150, 9, 0.4);
    FX.anim('smoke', e.x, e.y, { scale: 0.9 + e.r / 30, dur: 0.32 });
    const r = Math.random();
    if (r < DROPS.bomb) dropPickup('bomb', e.x, e.y);
    else if (r < DROPS.bomb + DROPS.magnet) dropPickup('magnet', e.x, e.y);
    else if (r < DROPS.bomb + DROPS.magnet + DROPS.heal) dropPickup('heal', e.x, e.y);
  }
  dropGem(e.x, e.y, e.xp);
  sfx.kill();
}

function hurtPlayer(dmg) {
  const P = G.player;
  if (P.hurtT > 0 || G.state !== 'play' || G.ending || G.debug.god) return;
  P.hp -= dmg;
  P.hurtT = PLAYER.hurtCd;
  G.hurtFlash = 0.4;
  addShake(0.3);
  sfx.hurt();
  FX.text(P.x, P.y - 26, '-' + dmg, '#ff4a5a', 18);
  if (P.hp <= 0) {
    P.hp = 0;
    endRun(false);
  }
}

function healPlayer(v) {
  const P = G.player;
  P.hp = Math.min(P.maxHp, P.hp + v);
  FX.burst(P.x, P.y, 24, 5, 160, 8, 0.7);
  FX.anim('boost', P.x, P.y - 6, { scale: 1, follow: P, add: true, force: true });
  sfx.heal();
}

export function addShake(v) { G.shake = Math.min(1, G.shake + v); }

// 大祓：画面内の妖怪を一掃（ボスには割合ダメージ）
function purge() {
  const v = G.view;
  G.flash = 0.9;
  addShake(0.7);
  G.hitstop = 0.08;
  sfx.boom();
  FX.ring(G.player.x, G.player.y, 20, Math.max(v.w, v.h) * 0.7, 0.8, '#ffe9b0', 14);
  FX.anim('explosion', G.player.x, G.player.y, { scale: 6, force: true, dur: 0.7, alpha: 0.9 });
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (e.boss) { hurtEnemy(e, e.maxHp * 0.04 / G.st.dmgMul, 0, 0, 0); continue; }
    if (e.x > v.x0 && e.x < v.x1 && e.y > v.y0 && e.y < v.y1) killEnemy(e);
  }
  UI.banner('大祓', 'white');
}

function openChest() {
  const roll = Math.random();
  const n = roll < 0.05 ? 3 : roll < 0.3 ? 2 : 1;
  const names = [];
  for (let i = 0; i < n; i++) {
    const up = G.skills.filter((s) => s.lv < s.def.levels.length);
    if (!up.length) { healPlayer(G.player.maxHp); names.push('霊薬'); continue; }
    const s = up[(Math.random() * up.length) | 0];
    addOrUpgrade(s.id);
    names.push(`${s.def.name} Lv${s.lv}`);
  }
  const P = G.player;
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const s = 200 + Math.random() * 380;
    FX.particle(P.x, P.y, Math.cos(a) * s, Math.sin(a) * s, 0.9 + Math.random() * 0.5, 7 + Math.random() * 5, Math.random() < 0.7 ? 0 : 7, 2);
  }
  FX.ring(P.x, P.y, 10, 160, 0.6, '#ffd35a', 8);
  G.slowT = 0.5;
  sfx.chest();
  UI.banner(`宝箱! ${names.join(' / ')}`, n >= 3 ? 'rainbow' : 'gold');
}

// ================================================================ 位置
let RX = 0, RY = 0;
// 画面の外周（少し外側）にランダム位置。60% は進行方向側
function edgePos(margin = 50) {
  const P = G.player, v = G.view;
  let a;
  if (P.moving && Math.random() < 0.6) a = Math.atan2(P.fy, P.fx) + (Math.random() - 0.5) * Math.PI * 0.9;
  else a = Math.random() * TAU;
  const c = Math.cos(a), s = Math.sin(a);
  const hw = v.w / 2 + margin, hh = v.h / 2 + margin;
  const t = Math.min(hw / Math.max(1e-3, Math.abs(c)), hh / Math.max(1e-3, Math.abs(s)));
  RX = P.x + c * t; RY = P.y + s * t;
}

const mixCache = new WeakMap();
function pickMix(mix) {
  let m = mixCache.get(mix);
  if (!m) {
    m = { ids: Object.keys(mix), ws: Object.values(mix) };
    m.sum = m.ws.reduce((a, b) => a + b, 0);
    mixCache.set(mix, m);
  }
  let r = Math.random() * m.sum;
  for (let i = 0; i < m.ids.length; i++) if ((r -= m.ws[i]) <= 0) return m.ids[i];
  return m.ids[0];
}

// ================================================================ 出現管理
function updateDirector(dt) {
  const t = G.time;
  if (G.ending) return;
  let i = 0;
  while (i < SPAWN.length - 1 && SPAWN[i + 1].t <= t) i++;
  const a = SPAWN[i], b = SPAWN[i + 1];
  const rate = b ? a.rate + (b.rate - a.rate) * ((t - a.t) / (b.t - a.t)) : a.rate;
  G.spawnAcc += rate * dt;
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    edgePos();
    spawnEnemy(pickMix(a.mix), RX, RY);
  }

  if (t >= G.nextElite) {
    G.nextElite += ELITE.every;
    const n = 1 + Math.floor(t / 300);
    for (let k = 0; k < n; k++) { edgePos(80); spawnEnemy('oni', RX, RY, true); }
    UI.banner('赤鬼 出現 ─ 宝箱を落とす', 'small');
  }

  while (G.eventIdx < EVENTS.length && t >= EVENTS[G.eventIdx].t) startEvent(EVENTS[G.eventIdx++]);

  const P = G.player, v = G.view;
  for (let k = G.marches.length - 1; k >= 0; k--) {
    const m = G.marches[k];
    m.acc += m.rate * dt;
    while (m.acc >= 1 && m.left > 0) {
      m.acc -= 1; m.left--;
      const d = m.dirs[m.left % m.dirs.length];
      const dist = Math.hypot(v.w, v.h) / 2 + 60 + Math.random() * 50;
      const off = (Math.random() - 0.5) * 560;
      const e = spawnEnemy(pickMix(m.mix), P.x + d.c * dist - d.s * off, P.y + d.s * dist + d.c * off, true);
      if (e) { e.march = true; e.mdx = -d.c; e.mdy = -d.s; e.speed *= 1.15; }
    }
    if (m.left <= 0) G.marches.splice(k, 1);
  }

  if (t >= RUN.winAt && !G.ending) beginEnding(true);
}

function startEvent(ev) {
  const P = G.player, v = G.view;
  if (ev.type === 'ring') {
    const R = Math.min(v.w, v.h) / 2 + 70;
    for (let i = 0; i < ev.count; i++) {
      const a = (i / ev.count) * TAU;
      spawnEnemy(ev.enemy, P.x + Math.cos(a) * R, P.y + Math.sin(a) * R, true);
    }
    if (ev.banner) UI.banner(ev.banner, 'red');
    sfx.alarm();
    G.redPulse = 1;
  } else if (ev.type === 'march') {
    const dirs = [];
    const base = Math.random() * TAU;
    for (let i = 0; i < ev.dirs; i++) {
      const a = base + (i / ev.dirs) * TAU;
      dirs.push({ c: Math.cos(a), s: Math.sin(a) });
    }
    G.marches.push({ mix: ev.mix, left: ev.count, rate: ev.count / ev.dur, acc: 0, dirs });
    UI.banner(ev.banner || '百鬼夜行', ev.big ? 'huge' : 'red');
    sfx.alarm();
    G.redPulse = 1.5;
    if (ev.big) { addShake(0.5); music.intensity = 1; }
    else music.intensity = Math.max(music.intensity, 0.5);
  } else if (ev.type === 'boss') {
    edgePos(120);
    const e = spawnEnemy('tengu', RX, RY, true);
    e.ai = { state: 'walk', t: 3, dx: 0, dy: 0, n: 0, shot: 0 };
    G.boss = e;
    UI.banner(ev.banner, 'huge');
    UI.bossBar(true, 1);
    sfx.alarm();
    addShake(0.6);
    G.redPulse = 2;
    music.boss();
  }
}

// ================================================================ ボス AI
function updateBoss(e, dt) {
  const P = G.player, ai = e.ai;
  const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
  ai.t -= dt;
  e.at += dt * 12;
  if (e.flash > 0) e.flash -= dt;
  switch (ai.state) {
    case 'walk': {
      const sp = d > 500 ? e.speed * 2.5 : e.speed;
      e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
      if (ai.t <= 0) {
        const r = Math.random();
        if (r < 0.4) { ai.state = 'tele'; ai.t = 0.8; ai.dx = dx / d; ai.dy = dy / d; }
        else if (r < 0.75) { ai.state = 'barrage'; ai.t = 0; ai.n = 4; }
        else {
          ai.state = 'walk'; ai.t = 3;
          FX.seal(e.x, e.y, 120, 1.2);
          for (let i = 0; i < 22; i++) {
            const a = (i / 22) * TAU, R = 260;
            spawnEnemy(i & 1 ? 'onibi' : 'kooni', P.x + Math.cos(a) * R, P.y + Math.sin(a) * R, true);
          }
          sfx.alarm();
        }
      }
      break;
    }
    case 'tele':
      ai.dx = ai.dx * 0.9 + (dx / d) * 0.1; ai.dy = ai.dy * 0.9 + (dy / d) * 0.1;
      if (ai.t <= 0) { ai.state = 'charge'; ai.t = 0.6; sfx.slam(); addShake(0.2); }
      break;
    case 'charge': {
      const l = Math.hypot(ai.dx, ai.dy) || 1;
      e.x += ai.dx / l * 620 * dt; e.y += ai.dy / l * 620 * dt;
      if (G.frame % 2 === 0) FX.burst(e.x, e.y + 30, 2, 1, 80, 14, 0.5);
      if (ai.t <= 0) { ai.state = 'walk'; ai.t = 2.4; }
      break;
    }
    case 'barrage':
      if (ai.t <= 0) {
        const n = 18, off = ai.n * 0.17;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU;
          spawnBullet(e.x, e.y, Math.cos(a) * 190, Math.sin(a) * 190, 16);
        }
        FX.ring(e.x, e.y, 30, 90, 0.3, '#ff7a3a', 6);
        sfx.shoot();
        ai.n--; ai.t = 0.38;
        if (ai.n <= 0) { ai.state = 'walk'; ai.t = 2.6; }
      }
      break;
  }
  // 接触：プレイヤーと式神
  if (d < e.r + P.r) hurtPlayer(e.dmg);
  const q = G.agrid.query(e.x, e.y, e.r + 30);
  for (let k = 0; k < q; k++) {
    const a = G.blockers[G.agrid.out[k]];
    if (!a || !a.alive) continue;
    const ox = a.x - e.x, oy = a.y - e.y, rr = e.r + a.r;
    if (ox * ox + oy * oy < rr * rr) { a.hp -= 260 * dt; a.x += ox * 0.1; a.y += oy * 0.1; }
  }
}

function bossDefeated(e) {
  G.boss = null;
  UI.bossBar(false);
  FX.burst(e.x, e.y, 120, 1, 520, 16, 1.4);
  FX.burst(e.x, e.y, 80, 0, 380, 12, 1.2);
  FX.ring(e.x, e.y, 20, 400, 1.0, '#ffd35a', 16);
  G.flash = 1;
  G.hitstop = 0.25;
  addShake(1);
  sfx.boom();
  UI.banner('大天狗 討伐!', 'huge');
  FX.anim('explosion', e.x, e.y, { scale: 6, force: true, dur: 1.0 });
  beginEnding(true, e);
}

// 勝利演出：スローモーションで画面の妖怪を一掃して結果画面へ
function beginEnding(win, at) {
  if (G.ending) return;
  G.ending = { t: 0, win, purged: false, x: at ? at.x : G.player.x, y: at ? at.y : G.player.y };
  G.marches.length = 0;
  if (win && !at) { UI.banner('夜明け ─ 百鬼夜行を退けた!', 'huge'); sfx.boom(); G.flash = 0.8; }
}

function updateEnding(rdt) {
  const en = G.ending;
  en.t += rdt;
  G.slowT = 0.3;
  if (!en.purged && en.t > 0.5) {
    en.purged = true;
    for (const e of G.enemies) if (e.alive && !e.boss) killEnemy(e);
    for (const g of G.gems) g.mag = true;
    G.flash = Math.max(G.flash, 0.6);
  }
  if (Math.random() < rdt * 10) {
    const v = G.view;
    const x = v.x0 + Math.random() * (v.x1 - v.x0), y = v.y0 + Math.random() * (v.y1 - v.y0);
    FX.burst(x, y, 20, (Math.random() * 3) | 0, 300, 10, 0.8);
    FX.ring(x, y, 10, 90, 0.5, '#ffd35a', 5);
  }
  if (en.t > 3.2) endRun(en.win);
}

function endRun(win) {
  G.state = 'result';
  if (win) sfx.win(); else sfx.gameover();
  music.title();
  UI.showResult(win, {
    time: G.time, kills: G.kills, level: G.level, maxAllies: G.maxAllies, dmg: G.dmgDealt,
  });
}

// ================================================================ 更新
export function step(rdt) {
  G.frame++;
  if (G.ending) updateEnding(rdt);
  if (G.slowT > 0) G.slowT -= rdt;
  const scale = G.slowT > 0 ? 0.35 : 1;
  let dt = rdt * scale;
  if (G.hitstop > 0) { G.hitstop -= rdt; dt = 0; }

  FX.update(dt > 0 ? dt : rdt * 0.2);
  G.shake = Math.max(0, G.shake - rdt * 1.8);
  G.flash = Math.max(0, G.flash - rdt * 2.2);
  G.hurtFlash = Math.max(0, G.hurtFlash - rdt * 1.5);
  G.redPulse = Math.max(0, G.redPulse - rdt * 0.6);
  if (dt <= 0) return;

  G.time += dt;
  updatePlayer(dt);

  const P = G.player;
  G.egrid.build(G.enemies, G.enemies.length, P.x, P.y);
  const bl = G.blockers;
  bl.length = 0;
  for (const a of G.allies) if (a.alive && a.blocks) bl.push(a);
  G.agrid.build(bl, bl.length, P.x, P.y);

  updateDirector(dt);
  for (const s of G.skills) {
    const impl = SKILL_IMPL[s.id];
    if (impl) impl.update(s, s.def.levels[s.lv - 1], dt);
  }
  updateAllies(dt);
  updateProjectiles(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateGems(dt);
  updatePickups(dt);

  compact(G.enemies, epool);
  compact(G.allies, apool);
  compact(G.projs, ppool);
  compact(G.gems, gpool);
  compact(G.pickups, null);
  G.maxAllies = Math.max(G.maxAllies, G.allies.length);

  if (G.streakT > 0) { G.streakT -= dt; if (G.streakT <= 0) G.streak = 0; }

  if (G.pending > 0 && G.state === 'play' && !G.ending) startLevelUp();
  UI.updateHUD(G);
}

function compact(arr, pool) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (o.alive) arr[j++] = o;
    else if (pool) pool.push(o);
  }
  arr.length = j;
}

function updatePlayer(dt) {
  pollInput();
  const P = G.player;
  const sp = PLAYER.speed * G.st.speedMul;
  P.moving = input.x !== 0 || input.y !== 0;
  if (P.moving) {
    const l = Math.hypot(input.x, input.y);
    P.fx = input.x / l; P.fy = input.y / l;
    P.walk += dt * 8 * l;
    P.dir = dirOf(input.x, input.y);
  }
  P.x += input.x * sp * dt;
  P.y += input.y * sp * dt;
  if (P.hurtT > 0) P.hurtT -= dt;
  if (G.st.regen && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + G.st.regen * dt);
}

const CONTACT_DPS = 0.9;   // 式神が妖怪に接触されたときに受けるダメージ係数
function updateEnemies(dt) {
  const P = G.player, en = G.enemies, n = en.length, v = G.view;
  const eg = G.egrid, ag = G.agrid, bl = G.blockers, out = eg.out, aout = ag.out;
  const kd = Math.exp(-7 * dt);
  const relocate = Math.hypot(v.w, v.h) / 2 + 380;
  const relocate2 = relocate * relocate;
  const despawn2 = (relocate + 400) ** 2;
  const parity = G.frame & 1;
  for (let i = 0; i < n; i++) {
    const e = en[i];
    if (!e.alive) continue;
    if (e.boss) { updateBoss(e, dt); continue; }
    const dx = P.x - e.x, dy = P.y - e.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) || 1;
    let mx, my;
    if (e.march) {
      mx = e.mdx; my = e.mdy;
      if (d < 170) { mx = mx * 0.35 + dx / d * 0.65; my = my * 0.35 + dy / d * 0.65; }
    } else { mx = dx / d; my = dy / d; }
    let sp = e.speed;
    if (e.slowT > 0) { e.slowT -= dt; sp *= 0.5; }
    if (e.def.hop) { e.hopT += dt * 2.2; sp *= (e.hopT % 1) < 0.5 ? 1.8 : 0.2; }
    e.x += (mx * sp + e.vx) * dt;
    e.y += (my * sp + e.vy) * dt;
    e.dir = dirOf(mx, my);
    e.at += dt * (3 + sp / 25);
    e.vx *= kd; e.vy *= kd;
    if (e.flash > 0) e.flash -= dt;

    // 妖怪同士の押し合い（負荷軽減のため1フレームおきに半分ずつ）
    if ((e.uid & 1) === parity) {
      const q = eg.query(e.x, e.y, e.r + 14);
      let pxs = 0, pys = 0, cnt = 0;
      for (let k = 0; k < q && cnt < 8; k++) {
        const o = en[out[k]];
        if (o === e || !o.alive) continue;
        const ox = e.x - o.x, oy = e.y - o.y, rr = (e.r + o.r) * 0.85;
        const dd = ox * ox + oy * oy;
        if (dd < rr * rr && dd > 0.0001) {
          const dist = Math.sqrt(dd);
          const f = ((rr - dist) / dist) * (o.mass / (o.mass + e.mass));
          pxs += ox * f; pys += oy * f; cnt++;
        }
      }
      e.x += pxs * 0.7; e.y += pys * 0.7;
    }

    // 式神（紙人形・前鬼）が壁になって進行を止める
    if (bl.length) {
      const q = ag.query(e.x, e.y, e.r + 26, aout);
      for (let k = 0; k < q; k++) {
        const a = bl[aout[k]];
        if (!a.alive) continue;
        const ox = e.x - a.x, oy = e.y - a.y, rr = e.r + a.r;
        const dd = ox * ox + oy * oy;
        if (dd < rr * rr) {
          const dist = Math.sqrt(dd) || 0.01;
          const push = (rr - dist) * (e.elite ? 0.4 : 0.9);
          e.x += ox / dist * push; e.y += oy / dist * push;
          a.hp -= e.dmg * CONTACT_DPS * dt;
        }
      }
    }

    if (d < e.r + P.r) hurtPlayer(e.dmg);

    if (e.march) {
      if (d2 > despawn2) e.alive = false;
    } else if (d2 > relocate2) {
      edgePos(40);
      e.x = RX; e.y = RY; e.vx = e.vy = 0;
    }
  }
}

function updateAllies(dt) {
  for (const a of G.allies) {
    if (!a.alive) continue;
    a.life -= dt;
    a.spawnT += dt;
    if (a.squash > 0) a.squash -= dt;
    if (a.atk > 0) a.atk -= dt;
    if (a.life <= 0 || a.hp <= 0) {
      a.alive = false;
      FX.burst(a.x, a.y, a.type === 'zenki' ? 26 : 6, a.type === 'karasu' ? 4 : 3, 130, 6, 0.45);
      continue;
    }
    ALLY_IMPL[a.type].update(a, dt);
  }
}

function updateProjectiles(dt) {
  const eg = G.egrid, en = G.enemies, out = eg.out2;
  const boss = G.boss;
  for (const p of G.projs) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; continue; }
    const t = p.target;
    if (p.turn && t) {
      if (!t.alive || t.uid !== p.tuid) p.target = null;
      else {
        const want = Math.atan2(t.y - p.y, t.x - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        let da = want - cur;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const lim = p.turn * dt;
        const na = cur + Math.max(-lim, Math.min(lim, da));
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot = p.spin ? p.rot + p.spin * dt : Math.atan2(p.vy, p.vx);
    const q = eg.query(p.x, p.y, p.r + 26, out);
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const nx = p.vx / sp, ny = p.vy / sp;
    for (let k = 0; k < q; k++) {
      const e = en[out[k]];
      if (!e.alive || e.boss) continue;
      const ox = e.x - p.x, oy = e.y - p.y, rr = e.r + p.r;
      if (ox * ox + oy * oy > rr * rr) continue;
      if (p.hits.includes(e.uid)) continue;
      p.hits.push(e.uid);
      hurtEnemy(e, p.dmg, nx, ny, p.kb, p.ally);
      if (--p.pierce <= 0) { p.alive = false; break; }
    }
    if (p.alive && boss && boss.alive && !p.hits.includes(boss.uid)) {
      const ox = boss.x - p.x, oy = boss.y - p.y, rr = boss.r + p.r;
      if (ox * ox + oy * oy < rr * rr) {
        p.hits.push(boss.uid);
        hurtEnemy(boss, p.dmg, nx, ny, 0, p.ally);
        if (--p.pierce <= 0) p.alive = false;
      }
    }
    if (!p.alive) FX.burst(p.x, p.y, 3, p.kind === 'arrow' ? 1 : 0, 90, 5, 0.25);
  }
}

function updateBullets(dt) {
  const P = G.player, b = G.bullets, ag = G.agrid, bl = G.blockers;
  for (let i = b.length - 1; i >= 0; i--) {
    const u = b[i];
    u.life -= dt;
    u.x += u.vx * dt; u.y += u.vy * dt;
    let dead = u.life <= 0;
    const dx = P.x - u.x, dy = P.y - u.y, rr = P.r + u.r;
    if (!dead && dx * dx + dy * dy < rr * rr) { hurtPlayer(u.dmg); dead = true; }
    if (!dead && bl.length) {
      const q = ag.query(u.x, u.y, u.r + 26);
      for (let k = 0; k < q; k++) {
        const a = bl[ag.out[k]];
        if (!a.alive) continue;
        const ox = a.x - u.x, oy = a.y - u.y, r2 = a.r + u.r;
        if (ox * ox + oy * oy < r2 * r2) { a.hp -= u.dmg * 2; dead = true; break; }
      }
    }
    if (dead) { b[i] = b[b.length - 1]; b.pop(); }
  }
}

function updateGems(dt) {
  const P = G.player;
  const pr = G.st.pickup, pr2 = pr * pr;
  if (G.gemT > 0) { G.gemT -= dt; if (G.gemT <= 0) G.gemChain = 0; }
  for (const g of G.gems) {
    const dx = P.x - g.x, dy = P.y - g.y, d2 = dx * dx + dy * dy;
    if (!g.mag) {
      if (d2 < pr2) { g.mag = true; g.spd = -160; }
      else continue;
    }
    g.spd = Math.min(g.spd + 1500 * dt, 1100);
    const d = Math.sqrt(d2) || 1;
    const m = Math.min(d, g.spd * dt);
    g.x += dx / d * m; g.y += dy / d * m;
    if (d < P.r + 8) {
      g.alive = false;
      gainXp(g.v);
    }
  }
}

function gainXp(v) {
  G.xp += v * G.st.xpMul;
  G.gemChain = Math.min(G.gemChain + 1, 40);
  G.gemT = 0.35;
  sfx.gem(Math.floor(G.gemChain / 3));
  while (G.xp >= G.xpNext) {
    G.xp -= G.xpNext;
    G.level++;
    G.xpNext = xpNeed(G.level);
    G.pending++;
  }
}

function updatePickups(dt) {
  const P = G.player, pr = G.st.pickup;
  for (const k of G.pickups) {
    k.t += dt;
    const dx = P.x - k.x, dy = P.y - k.y, d = Math.hypot(dx, dy) || 1;
    if (!k.mag && d < pr) { k.mag = true; k.spd = -120; }
    if (k.mag) {
      k.spd = Math.min(k.spd + 1200 * dt, 900);
      const m = Math.min(d, k.spd * dt);
      k.x += dx / d * m; k.y += dy / d * m;
    }
    if (d < P.r + 12) {
      k.alive = false;
      if (k.kind === 'heal') healPlayer(P.maxHp * 0.4);
      else if (k.kind === 'magnet') {
        for (const g of G.gems) { if (!g.mag) { g.mag = true; g.spd = -200; } }
        FX.ring(P.x, P.y, 10, 300, 0.6, '#7dffb0', 6);
        UI.banner('魂寄せ', 'green');
        sfx.summon();
      } else if (k.kind === 'bomb') purge();
      else if (k.kind === 'chest') openChest();
    }
  }
}

// ================================================================ レベルアップ
function startLevelUp() {
  G.pending--;
  G.state = 'levelup';
  const P = G.player;
  // 霊波：周囲の妖怪を吹き飛ばして一息つかせる
  for (const e of G.enemies) {
    if (!e.alive || e.boss) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
    if (d < 220) { e.vx += dx / d * 520 / e.mass; e.vy += dy / d * 520 / e.mass; }
  }
  FX.ring(P.x, P.y, 10, 220, 0.7, '#ffe9b0', 10);
  FX.ring(P.x, P.y, 10, 150, 0.5, '#ffd35a', 5);
  FX.burst(P.x, P.y, 50, 0, 340, 10, 0.9);
  FX.seal(P.x, P.y, 120, 0.9, null, true);
  FX.anim('boost', P.x, P.y - 10, { scale: 1.4, follow: P, add: true, force: true, dur: 0.6 });
  G.flash = 0.35;
  sfx.level();
  UI.showLevelUp(G, rollOptions(), (id) => {
    addOrUpgrade(id);
    sfx.select();
    G.state = 'play';
    G.slowT = 0.25;
  });
}

// ================================================================ 描画
let ground = null, vignette = null;
export function setGround(c) { ground = c; }

export function resize(W, H) {
  const v = G.view;
  v.zoom = Math.min(W, H) / VIEW_MIN;
  v.w = W / v.zoom;
  v.h = H / v.zoom;
  v.halfDiag = Math.hypot(v.w, v.h) / 2;
  vignette = document.createElement('canvas');
  vignette.width = 256; vignette.height = 256;
  const g = vignette.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 60, 128, 128, 182);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(5,0,15,0.78)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
}

export function render(ctx, W, H, dpr) {
  const v = G.view, P = G.player;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0c1a';
  ctx.fillRect(0, 0, W, H);
  if (!P) return;

  // カメラ（少し遅れて追従＋揺れ）
  G.cam.x += (P.x - G.cam.x) * 0.18;
  G.cam.y += (P.y - G.cam.y) * 0.18;
  const sh = G.shake * G.shake * 14;
  const cx = G.cam.x + (Math.random() - 0.5) * sh;
  const cy = G.cam.y + (Math.random() - 0.5) * sh;
  const z = v.zoom;
  v.x0 = cx - v.w / 2 - 30; v.x1 = cx + v.w / 2 + 30;
  v.y0 = cy - v.h / 2 - 40; v.y1 = cy + v.h / 2 + 40;
  // ドット絵がにじまないよう、平行移動は画面ピクセル単位に丸める
  const tx = Math.round(dpr * (W / 2 - cx * z)), ty = Math.round(dpr * (H / 2 - cy * z));
  ctx.setTransform(dpr * z, 0, 0, dpr * z, tx, ty);

  // 地面
  if (ground) {
    const T = ground.width;
    const tx0 = Math.floor(v.x0 / T), tx1 = Math.floor(v.x1 / T);
    const ty0 = Math.floor(v.y0 / T), ty1 = Math.floor(v.y1 / T);
    for (let gy = ty0; gy <= ty1; gy++) for (let gx = tx0; gx <= tx1; gx++) ctx.drawImage(ground, gx * T, gy * T, T + 0.5, T + 0.5);
  }

  FX.drawAnims(ctx, v, true);
  drawSkillsGround(ctx);

  const t = G.time;
  // 経験値（魂の欠片）
  for (const g of G.gems) {
    if (g.x < v.x0 || g.x > v.x1 || g.y < v.y0 || g.y > v.y1) continue;
    draw(ctx, SPR['gem' + g.tier], g.x, g.y + Math.sin(t * 4 + g.x) * 1.5);
  }
  for (const k of G.pickups) {
    const b = Math.sin(k.t * 5) * 3;
    draw(ctx, SPR[k.kind], k.x, k.y + b, 0);
  }

  // ボスの突進予告
  const boss = G.boss;
  if (boss && boss.ai && boss.ai.state === 'tele') {
    const l = Math.hypot(boss.ai.dx, boss.ai.dy) || 1;
    ctx.globalAlpha = 0.22 + 0.22 * Math.sin(G.time * 40);
    ctx.strokeStyle = '#ff2a2a';
    ctx.lineWidth = boss.r * 1.6;
    ctx.beginPath();
    ctx.moveTo(boss.x, boss.y);
    ctx.lineTo(boss.x + boss.ai.dx / l * 380, boss.y + boss.ai.dy / l * 380);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 影（足元）
  ctx.fillStyle = 'rgba(0,0,10,0.35)';
  ctx.beginPath();
  for (const e of G.enemies) {
    if (!e.alive || e.x < v.x0 || e.x > v.x1 || e.y < v.y0 || e.y > v.y1) continue;
    const r = e.r * 0.9;
    ctx.moveTo(e.x + r, e.y + e.r * 0.8);
    ctx.ellipse(e.x, e.y + e.r * 0.8, r, r * 0.35, 0, 0, TAU);
  }
  ctx.fill();

  // 妖怪
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const s = e.spr;
    if (e.x < v.x0 - s.w || e.x > v.x1 + s.w || e.y < v.y0 - s.h || e.y > v.y1 + s.h) continue;
    if (e.boss) { drawBoss(ctx, e); continue; }
    let lift = 0, sy = 1;
    if (e.def.hop) { const h = e.hopT % 1; lift = h < 0.5 ? Math.sin(h * 2 * Math.PI) * 7 : 0; sy = h < 0.5 ? 1.08 : 0.94; }
    draw(ctx, s, e.x, e.y - lift, e.at | 0, e.dir, e.flash > 0, 1, false, 1, sy);
    if (e.elite && e.hp < e.maxHp) {
      ctx.fillStyle = '#120a12'; ctx.fillRect(e.x - 20, e.y + e.r + 6, 40, 5);
      ctx.fillStyle = '#ff5a3d'; ctx.fillRect(e.x - 19, e.y + e.r + 7, 38 * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  // 式神
  for (const a of G.allies) {
    if (!a.alive) continue;
    const s = a.spr;
    if (a.x < v.x0 - s.w || a.x > v.x1 + s.w || a.y < v.y0 - s.h || a.y > v.y1 + s.h) continue;
    const pop = a.spawnT < 0.2 ? 0.3 + a.spawnT * 3.5 : 1;
    const fly = a.type === 'karasu' ? -14 + Math.sin(t * 6 + a.idx) * 3 : 0;
    ctx.globalAlpha = a.life < 1.5 ? (Math.sin(a.life * 30) > 0 ? 0.95 : 0.4) : 1;
    if (a.type === 'zenki') {
      const atk = a.atk > 0;
      const sp = atk ? SPR.zenkiAtk : s;
      const f = atk ? Math.floor((1 - a.atk / 0.36) * sp.n) : a.at | 0;
      draw(ctx, sp, a.x, a.y - (atk ? 18 : 0), f, 0, false, pop, a.flip);
    } else if (a.type === 'byakko') {
      draw(ctx, s, a.x, a.y, a.at | 0, 0, false, pop, a.vx > 0);
    } else {
      draw(ctx, s, a.x, a.y + fly, a.at | 0, a.dir, false, pop);
    }
  }
  ctx.globalAlpha = 1;

  // プレイヤー
  {
    ctx.fillStyle = 'rgba(0,0,10,0.4)';
    ctx.beginPath(); ctx.ellipse(P.x, P.y + 15, 12, 4, 0, 0, TAU); ctx.fill();
    const blink = P.hurtT > 0 && Math.sin(t * 60) > 0;
    draw(ctx, SPR.player, P.x, P.y - 2, P.moving ? (P.walk | 0) : 0, P.dir, blink);
    const hw = 34;
    ctx.fillStyle = '#120a12';
    ctx.fillRect(P.x - hw / 2 - 1, P.y + 21, hw + 2, 6);
    ctx.fillStyle = P.hp / P.maxHp < 0.3 ? '#ff3d4e' : '#e8344a';
    ctx.fillRect(P.x - hw / 2, P.y + 22, hw * (P.hp / P.maxHp), 4);
  }

  // 弾
  for (const p of G.projs) {
    if (!p.alive) continue;
    if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
    drawRot(ctx, p.spr, p.x, p.y, p.rot, 0);
  }
  ctx.globalCompositeOperation = 'lighter';
  const fb = SPR.fireball, ff = (t * 12) | 0;
  for (const u of G.bullets) drawRot(ctx, fb, u.x, u.y, Math.atan2(u.vy, u.vx), ff);
  drawSkillsGlow(ctx);
  ctx.globalCompositeOperation = 'source-over';
  FX.drawAnims(ctx, v, false);
  FX.drawGlow(ctx, v);
  FX.drawTexts(ctx, v);

  // ---- スクリーン座標 ----
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if (vignette) ctx.drawImage(vignette, -W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
  const red = Math.max(G.hurtFlash * 0.5, G.redPulse > 0 ? (Math.sin(G.time * 10) * 0.5 + 0.5) * Math.min(1, G.redPulse) * 0.22 : 0,
    P.hp / P.maxHp < 0.25 ? 0.12 + Math.sin(G.time * 6) * 0.06 : 0);
  if (red > 0.01) {
    ctx.fillStyle = `rgba(200,0,30,${red})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (G.flash > 0.01) {
    ctx.fillStyle = `rgba(255,250,235,${Math.min(0.85, G.flash)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // 仮想スティック
  const st = input.stick;
  if (st.active && G.state === 'play') {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#ffe9b0';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(st.ox, st.oy, input.stickRadius, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#e8344a';
    const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), m = Math.min(d, input.stickRadius);
    ctx.beginPath(); ctx.arc(st.ox + (d ? dx / d * m : 0), st.oy + (d ? dy / d * m : 0), 22, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawBoss(ctx, e) {
  const ai = e.ai || {};
  let s = SPR.tengu, f = e.at | 0;
  if (e.flash > 0.05) { s = SPR.tenguHit; f = ((G.time * 16) | 0); }
  else if (ai.state === 'tele' || ai.state === 'barrage') { s = SPR.tenguAtk; f = 4 + (((G.time * 10) | 0) % 6); }
  ctx.fillStyle = 'rgba(0,0,10,0.4)';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + 70, 56, 14, 0, 0, TAU); ctx.fill();
  draw(ctx, s, e.x, e.y, f, 0, false);
}
