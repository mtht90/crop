// ゲーム本体：状態・更新・描画
import {
  RUN, LIMITS, PLAYER, ENEMIES, SPAWN, EVENTS, ELITE, DROPS, SKILLS, SLOTS,
  PICK_WEIGHT, hpScale, speedScale, xpNeed, CHARACTERS, EVOLUTIONS, MODES,
} from './config.js';
import { Grid } from './grid.js';
import { FX } from './fx.js';
import { sfx, music } from './audio.js';
import { input, pollInput } from './input.js';
import { SKILL_IMPL, ALLY_IMPL } from './skills.js';
import { UI } from './ui.js';
import { Progress } from './progress.js';

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
    G.limits.enemies = 500;
    G.limits.particles = 1400;
    G.limits.texts = 80;
    G.limits.allies = 280;
  }
  G.egrid = new Grid(40, 90, 90, G.limits.enemies + 200);
  G.agrid = new Grid(40, 90, 90, G.limits.allies + 50);
  FX.init(G.limits.particles, G.limits.texts);
}

// ================================================================ ラン開始
export function newRun(char = CHARACTERS[0], mode = MODES[0]) {
  G.char = char;
  G.mode = mode;
  G.adapt = 1; G.adaptT = 0; G.lastHurt = -99;
  G.mids = []; G.midBoss = null; G.enraged = false;
  G.ult = 0; G.ultT = 0; G.ultKind = null; G.ultTick = 0; G.ultReady = false;
  G.evolved = new Set();
  G.chests = 0;
  G.critFxT = 0;
  G.streakMark = 0;
  for (const e of G.enemies) epool.push(e);
  for (const a of G.allies) apool.push(a);
  for (const p of G.projs) ppool.push(p);
  for (const g of G.gems) gpool.push(g);
  G.enemies.length = 0; G.allies.length = 0; G.projs.length = 0; G.bullets.length = 0;
  G.gems.length = 0; G.pickups.length = 0; G.blockers.length = 0; G.marches.length = 0;
  FX.clear();
  G.player = {
    x: 0, y: 0, hp: PLAYER.hp, maxHp: PLAYER.hp, r: PLAYER.r,
    fx: 0, fy: -1, moving: false, hurtT: 0, walk: 0, yaw: Math.PI,
  };
  G.cam.x = 0; G.cam.y = 0;
  G.time = Number(G.debug.t) || 0;
  G.sched = G.time * mode.k;
  G.frame = 0;
  G.skills = [];
  G.level = 1; G.xp = 0; G.xpNext = xpNeed(1); G.pending = 0;
  G.kills = 0; G.streak = 0; G.streakT = 0; G.maxAllies = 0; G.dmgDealt = 0;
  G.shake = G.flash = G.hurtFlash = G.redPulse = G.slowT = G.hitstop = 0;
  G.boss = null; G.ending = null; G.spawnAcc = 0; G.milestoneIdx = 0;
  G.eventIdx = 0;
  while (G.eventIdx < EVENTS.length && EVENTS[G.eventIdx].t < G.sched) G.eventIdx++;
  G.nextElite = ELITE.first;
  while (G.nextElite < G.sched) G.nextElite += ELITE.every;
  if (!cheat()) Progress.startRun();
  for (const id of char.start) addOrUpgrade(id);
  const extra = Number(G.debug.lv) || 0;          // デバッグ: ランダムにレベルを上げた状態で開始
  for (let i = 0; i < extra; i++) {
    const o = rollOptions().filter((x) => !x.startsWith('_'));
    if (o.length) addOrUpgrade(o[(Math.random() * o.length) | 0]);
    G.level++;
  }
  G.xpNext = xpNeed(G.level);
  // 短期決戦は育つ時間が短いので、開始直後にまとめて術を選ばせる
  if (mode.bonus) { G.level += mode.bonus; G.pending += mode.bonus; G.xpNext = xpNeed(G.level); }
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
  st.dmgMul = 1 + 0.09 * skillLv('reiryoku');
  st.cdMul = 1 - 0.06 * skillLv('sokuei');
  st.speedMul = 1 + 0.08 * skillLv('idaten');
  st.pickup = PLAYER.pickup * (1 + 0.3 * skillLv('kyukon'));
  st.xpMul = 1 + 0.05 * skillLv('kyukon');
  const sk = skillLv('shikiko');
  st.shikiDmg = 1 + 0.09 * sk;
  st.shikiDur = 1 + 0.08 * sk;
  st.shikiCount = Math.floor(sk / 2);
  const md = (G.char && G.char.mods) || {};
  if (md.cd) st.cdMul *= md.cd;
  if (md.shikiDur) st.shikiDur *= md.shikiDur;
  if (md.speed) st.speedMul *= md.speed;
  if (md.shikiCount) st.shikiCount += md.shikiCount;
  st.crit = PLAYER.crit + (md.crit || 0);
  st.critMul = PLAYER.critMul + (md.critMul || 0);
  st.taken = md.taken || 1;
  st.heal = md.heal || 1;
  st.drain = md.drain || 0;
  if (md.dmg) st.dmgMul *= md.dmg;
  const c = skillLv('chomei');
  st.regen = 0.4 * c + (md.regen || 0);
  const P = G.player;
  if (P) {
    const newMax = PLAYER.hp + 20 * c + (md.hp || 0);
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
    if (def.base || G.evolved.has(id)) continue;   // 進化した術は宝箱でのみ
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
  e.uid = uidSeq++; e.alive = true; e.def = d; e.type = type; e.spr = null;
  e.x = x; e.y = y; e.vx = 0; e.vy = 0;
  e.maxHp = e.hp = d.boss || d.mid ? d.hp : d.hp * hpScale(G.sched) * G.adapt * G.mode.hp;
  e.r = d.r; e.dmg = (d.boss || d.mid ? d.dmg : d.dmg * G.adapt ** 0.35) * (G.mode.dmg || 1); e.xp = d.xp; e.mass = d.mass;
  e.speed = d.speed * speedScale(G.sched) * (d.mid ? 1 : 0.88 + Math.random() * 0.24);
  e.flash = 0; e.slowT = 0; e.march = false; e.wob = Math.random() * TAU; e.hopT = Math.random();
  e.last.fill(-99);
  e.elite = !!d.elite; e.boss = !!d.boss; e.mid = !!d.mid; e.ai = null; e.dir = 0; e.at = Math.random() * 4;
  G.enemies.push(e);
  return e;
}

export function spawnAlly(type, x, y, L) {
  if (G.allies.length >= G.limits.allies) return null;
  const a = apool.pop() || {};
  const st = G.st;
  a.alive = true; a.type = type; a.spr = null;
  a.x = x; a.y = y; a.vx = 0; a.vy = 0;
  a.dmg = (L.dmg || 0) * st.shikiDmg;
  a.life = a.maxLife = L.dur * st.shikiDur;
  a.hp = a.maxHp = L.hp || 1e9;
  a.target = null; a.tuid = 0; a.retT = Math.random() * 0.2;
  a.atkT = Math.random() * 0.3; a.spawnT = 0; a.squash = 0;
  a.ang = Math.random() * TAU; a.idx = (Math.random() * 1000) | 0; a.dir = 0; a.at = Math.random() * 4; a.atk = 0;
  a.aoe = L.aoe || 0; a.fire = L.fire || 0; a.boom = L.boom || 0;
  a.blocks = type === 'kami' || type === 'zenki';
  const impl = ALLY_IMPL[type];
  a.r = impl.r; a.speed = impl.speed;
  G.allies.push(a);
  return a;
}

export function spawnProj(kind, x, y, vx, vy, dmg, pierce, life, r, opt = {}) {
  if (G.projs.length >= G.limits.projectiles) return null;
  const p = ppool.pop() || { hits: [] };
  p.alive = true; p.kind = kind; p.spr = null;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.dmg = dmg; p.pierce = pierce; p.life = life; p.r = r;
  p.hits.length = 0;
  p.target = opt.target || null; p.tuid = p.target ? p.target.uid : 0;
  p.turn = opt.turn || 0; p.spin = opt.spin || 0; p.rot = Math.atan2(vy, vx);
  p.face = !!opt.face; p.kb = opt.kb ?? 60; p.ally = !!opt.ally; p.boom = opt.boom || 0; p.big = !!opt.big;
  G.projs.push(p);
  return p;
}

function spawnBullet(x, y, vx, vy, dmg) {
  if (G.bullets.length >= G.limits.enemyBullets) return;
  G.bullets.push({ x, y, vx, vy, dmg: dmg * (G.mode.dmg || 1), r: 9, life: 4 });
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
  let dmg = base * G.st.dmgMul * (G.ultKind === 'youka' ? 2 : 1);
  const crit = Math.random() < G.st.crit;
  if (crit) dmg *= G.st.critMul;
  dmg = Math.max(1, Math.round(dmg * (0.9 + Math.random() * 0.2)));
  e.hp -= dmg;
  e.flash = 0.1;
  if (kb && !e.boss && !e.mid) {
    const k = kb / e.mass;
    e.vx += nx * k; e.vy += ny * k;
  }
  G.dmgDealt += dmg;
  if (crit) {
    FX.text(e.x, e.y - e.r, dmg + '!', '#ffd35a', 22);
    if (G.critFxT <= G.time) { G.critFxT = G.time + 0.12; FX.ring(e.x, e.y, 4, 40, 0.18, '#ffffff', 5); FX.burst(e.x, e.y, 5, 3, 260, 6, 0.25, 1.0); }
  }
  // 群れが濃い終盤は、式神の通常ダメージ数字を出さず、自分の数字も間引いて画面を空ける
  else if (!G.dense || (!ally && Math.random() < 0.4) || e.boss || e.mid) FX.text(e.x, e.y - e.r, '' + dmg, ally ? '#bfe6ff' : '#ffffff', e.boss ? 18 : 14);
  sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

export function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false;
  if (e.boss) { bossDefeated(e); return; }
  if (e.mid) { midDefeated(e); return; }
  if (G.onKill) G.onKill(e);
  G.kills++;
  if (!cheat()) Progress.addKill(e.type);
  const P = G.player;
  if (G.st.drain || G.ultKind === 'youka') P.hp = Math.min(P.maxHp, P.hp + G.st.drain + (G.ultKind === 'youka' ? 1.2 : 0));
  // 奥義のゲージは祓うほど貯まる
  if (!G.ultKind && G.ult < 1) {
    G.ult = Math.min(1, G.ult + 1 / 160);
    if (G.ult >= 1) { UI.banner(`奥義「${G.char.ult.name}」 準備完了 ─ スペース`, 'gold'); sfx.chest(); }
  }
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
  if (G.ultKind === 'kongo' || G.ultKind === 'kagenui') return;
  dmg = Math.max(1, Math.round(dmg * G.st.taken));
  G.lastHurt = G.time;
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
  P.hp = Math.min(P.maxHp, P.hp + v * (G.st.heal || 1));
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
    if (e.boss || e.mid) { hurtEnemy(e, e.maxHp * 0.04 / G.st.dmgMul, 0, 0, 0); continue; }
    if (e.x > v.x0 && e.x < v.x1 && e.y > v.y0 && e.y < v.y1) killEnemy(e);
  }
  UI.banner('大祓', 'white');
}

// 進化できる組み合わせ（最大 Lv の術 ＋ 補助）を探す
// デバッグ開始（途中の時刻・レベルから始める）では解放の記録を付けない
const cheat = () => !!(G.debug.t || G.debug.lv || G.debug.god || G.debug.nr || G.debug.speed > 1);

function findEvolution() {
  for (const ev of EVOLUTIONS) {
    const base = G.skills.find((k) => k.id === ev.from);
    if (base && base.lv >= base.def.levels.length && skillLv(ev.need) > 0) return ev;
  }
  return null;
}

function evolve(ev) {
  const s = G.skills.find((k) => k.id === ev.from);
  if (!s) return;
  s.id = ev.to; s.def = SKILLS[ev.to]; s.lv = 1; s.t = 0.2;
  G.evolved.add(ev.from);
  if (!cheat()) Progress.addEvo(ev.to);
  recalcStats();
  UI.refreshSkills(G);
}

// 宝箱：ルーレット演出（UI 側）を出し、閉じたら再開。中身はここで確定・適用する
function openChest(big = false) {
  const roll = Math.random();
  const n = big ? (roll < 0.35 ? 5 : 3) : roll < 0.07 ? 5 : roll < 0.32 ? 3 : 1;
  const rewards = [];
  const ev = findEvolution();
  if (ev) {
    rewards.push({ id: ev.to, evo: true, name: SKILLS[ev.to].name, sub: `${SKILLS[ev.from].name} ＋ ${SKILLS[ev.need].name}` });
    evolve(ev);
  }
  while (rewards.length < n) {
    const up = G.skills.filter((s) => s.lv < s.def.levels.length);
    if (!up.length) { healPlayer(G.player.maxHp * 0.5); rewards.push({ id: '_heal', name: '霊薬', sub: 'HP 回復' }); continue; }
    const s2 = up[(Math.random() * up.length) | 0];
    addOrUpgrade(s2.id);
    rewards.push({ id: s2.id, name: s2.def.name, sub: s2.lv >= s2.def.levels.length ? 'MAX' : `Lv ${s2.lv}` });
  }
  G.chests++;
  if (!cheat()) Progress.addChest();
  const P = G.player;
  FX.pillar(P.x, P.y, 60, 1.4, '#ffd35a', P);
  FX.ring(P.x, P.y, 10, 260, 0.8, '#ffd35a', 10);
  FX.burst(P.x, P.y, 60, 0, 520, 10, 1.2, 0.6);
  G.flash = 0.5;
  G.fovKick = 1;
  sfx.chest();
  G.state = 'chest';
  UI.showChest(rewards, () => {
    G.state = 'play';
    G.slowT = 0.5;
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * TAU, sp = 200 + Math.random() * 500;
      FX.particle(P.x, P.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.9 + Math.random() * 0.6, 8 + Math.random() * 6, Math.random() < 0.6 ? 0 : 7, 2);
    }
    FX.ring(P.x, P.y, 20, 400, 0.7, '#ffe9b0', 12);
    if (ev) { purgeNear(320); UI.banner(`進化！ ${SKILLS[ev.to].name}`, 'rainbow'); addShake(0.6); sfx.boom(); }
  });
}

// 進化の瞬間：周囲の雑魚を吹き飛ばして祓う
function purgeNear(R) {
  const P = G.player;
  for (const e of G.enemies) {
    if (!e.alive || e.boss || e.mid) continue;
    const dx = e.x - P.x, dy = e.y - P.y;
    if (dx * dx + dy * dy < R * R) killEnemy(e);
  }
}

// ================================================================ 奥義（退魔師ごとの固有技。ゲージが満ちたらスペース／ボタン）
export function castUlt() {
  if (G.state !== 'play' || G.ending || G.ult < 1 || G.ultKind) return;
  const P = G.player, u = G.char.ult, pow = 1 + G.level * 0.06;
  G.ult = 0;
  if (!cheat()) Progress.addUlt();
  G.flash = 0.3; G.fovKick = 1.2; G.hitstop = 0.08; addShake(0.5);
  FX.seal(P.x, P.y, 160, 1.2, null, true);
  UI.banner(`奥義 ${u.name}`, 'rainbow');
  sfx.boom();
  switch (u.id) {
    case 'hyakki': {
      const L = { hp: 40 * pow, dmg: 14 * pow, dur: 14 };
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        spawnAlly('kami', P.x + Math.cos(a) * 70, P.y + Math.sin(a) * 70, L);
      }
      purgeNear(220);
      FX.ring(P.x, P.y, 20, 300, 0.8, '#8fe3ff', 12);
      sfx.summon();
      break;
    }
    case 'harae':
      healPlayer(P.maxHp * 0.35);
      G.bullets.length = 0;
      purge();
      break;
    case 'kagenui': G.ultKind = 'kagenui'; G.ultT = 3; G.ultTick = 0; break;
    case 'kongo': G.ultKind = 'kongo'; G.ultT = 6; G.ultTick = 0; break;
    case 'youka': G.ultKind = 'youka'; G.ultT = 8; FX.ring(P.x, P.y, 20, 260, 0.7, '#b05cff', 12); break;
    case 'issen': {
      // 向いている方向へ長さ 1100・幅 170 の帯を一太刀で斬る
      const fx = P.fx, fy = P.fy, L = 1100, W = 85, dmg = 220 * pow;
      for (const e of G.enemies) {
        if (!e.alive) continue;
        const ox = e.x - P.x, oy = e.y - P.y;
        const along = ox * fx + oy * fy, side = Math.abs(-ox * fy + oy * fx);
        if (along < -40 || along > L || side > W + e.r) continue;
        if (e.boss || e.mid) hurtEnemy(e, e.maxHp * 0.06 / G.st.dmgMul + dmg, fx, fy, 0);
        else hurtEnemy(e, dmg, fx, fy, 400);
      }
      for (let k = 0; k < 7; k++) FX.slash(P.x + fx * (k + 1) * 140, P.y + fy * (k + 1) * 140, 110, Math.atan2(fy, fx), '#ffd9a0', 0.3);
      for (let k = 0; k < 40; k++) {
        const t = Math.random() * L;
        FX.particle(P.x + fx * t, P.y + fy * t, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 0.6, 9, 0, 2);
      }
      G.hitstop = 0.18; addShake(0.9); G.flash = 0.45;
      break;
    }
  }
}

function updateUlt(dt) {
  if (!G.ultKind) return;
  const P = G.player, pow = 1 + G.level * 0.06;
  G.ultT -= dt;
  G.ultTick -= dt;
  if (G.ultKind === 'kagenui' && G.ultTick <= 0) {
    // 近い順に 4 体を斬る
    G.ultTick = 0.08;
    const near = [];
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - P.x, e.y - P.y);
      if (d < 280) near.push([d, e]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(4, near.length); i++) {
      const e = near[i][1];
      const a = Math.random() * TAU;
      FX.slash(e.x, e.y, 46, a, '#d2a8ff', 0.16);
      hurtEnemy(e, 34 * pow, Math.cos(a), Math.sin(a), 180);
    }
    FX.burst(P.x, P.y, 3, 4, 120, 6, 0.3);
  } else if (G.ultKind === 'kongo' && G.ultTick <= 0) {
    G.ultTick = 0.5;
    FX.ring(P.x, P.y, 20, 220, 0.4, '#ffd35a', 10);
    addShake(0.2); sfx.slam();
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
      if (d < 220 + e.r) hurtEnemy(e, 26 * pow, dx / d, dy / d, 420);
    }
  } else if (G.ultKind === 'youka' && G.frame % 3 === 0) {
    FX.burst(P.x, P.y, 2, 4, 90, 7, 0.4);
  }
  if (G.ultT <= 0) G.ultKind = null;
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
  if (G.ending) return;
  G.sched += dt * G.mode.k;
  const t = G.sched;
  let i = 0;
  while (i < SPAWN.length - 1 && SPAWN[i + 1].t <= t) i++;
  const a = SPAWN[i], b = SPAWN[i + 1];
  let rate = b ? a.rate + (b.rate - a.rate) * ((t - a.t) / (b.t - a.t)) : a.rate;
  if (G.enraged) rate = Math.max(rate, 60);
  updateAdapt(dt);
  // 時計を詰めたモードは育つ時間が短いので、湧く量を √k で割って釣り合わせる
  rate *= (0.7 + 0.3 * G.adapt) / Math.sqrt(G.mode.k);
  if (G.midBoss) rate *= 0.5;   // 中ボス戦は雑魚を減らして一騎打ちに寄せる
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
    UI.banner('土蜘蛛 出現 ─ 宝箱を落とす', 'small');
  }

  while (G.eventIdx < EVENTS.length && t >= EVENTS[G.eventIdx].t) {
    const ev = EVENTS[G.eventIdx++];
    // 中ボス戦の最中に来る包囲・行列は見送る（詰めたモードで重なって理不尽になるのを防ぐ）
    if (G.midBoss && (ev.type === 'ring' || ev.type === 'march')) continue;
    startEvent(ev);
  }

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

  // 制限時間を過ぎてもボスが残っていれば激昂。時間切れでの勝利はない
  if (G.time >= G.mode.len && !G.enraged) {
    G.enraged = true;
    UI.banner('夜明けは来ない ─ がしゃどくろ 激昂', 'huge');
    sfx.alarm(); addShake(0.6); G.redPulse = 2;
    if (G.boss) { G.boss.speed *= 1.6; G.boss.dmg *= 1.6; }
  }
}

// 敵の強さを自分の強さに合わせる：しばらく無傷なら硬く・強く・多くし、押し込まれて体力が減ると緩める。
// 上限は時間とともに上がる（序盤から急に硬くはならない）
function updateAdapt(dt) {
  G.adaptT += dt;
  if (G.adaptT < 1) return;
  G.adaptT = 0;
  const P = G.player, calm = G.time - G.lastHurt;
  const cap = 1 + Math.max(0, G.sched - 120) / 220;
  if (calm > 8 && !G.midBoss) G.adapt += 0.03;
  else if (calm < 2 && P.hp < P.maxHp * 0.7) G.adapt -= 0.1;
  G.adapt = Math.max(0.7, Math.min(cap, G.adapt));
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
  } else if (ev.type === 'mid') {
    edgePos(120);
    const e = spawnEnemy(ev.enemy, RX, RY, true);
    e.maxHp = e.hp = e.def.hp * (0.7 + 0.3 * G.adapt) * (G.mode.k > 2 ? 0.6 : 1);
    e.ai = { state: 'walk', t: 2.5, dx: 0, dy: 0, n: 0, a: 0 };
    G.midBoss = e;
    UI.banner(ev.banner, 'huge');
    UI.bossBar(true, 1, e.def.name);
    sfx.alarm();
    addShake(0.5);
    G.redPulse = 1.5;
    music.intensity = 1;
  } else if (ev.type === 'boss') {
    edgePos(120);
    const e = spawnEnemy('tengu', RX, RY, true);
    // 自分の強さ（追従係数）に合わせて硬くする。短期決戦は育つ時間が短いぶん控えめ
    e.maxHp = e.hp = e.def.hp * (0.6 + 0.4 * G.adapt) * (G.mode.k > 2 ? 0.6 : 1);
    e.ai = { state: 'walk', t: 3, dx: 0, dy: 0, n: 0, shot: 0 };
    G.boss = e;
    UI.banner(ev.banner, 'huge');
    UI.bossBar(true, 1, e.def.name);
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
  ai.t -= dt * (ai.rage ? 1.5 : 1);
  e.at += dt * 12;
  if (e.flash > 0) e.flash -= dt;
  if (!ai.rage && e.hp < e.maxHp * 0.5) {
    ai.rage = true;
    UI.banner('がしゃどくろ 怒り狂う', 'red');
    FX.ring(e.x, e.y, 30, 300, 0.7, '#ff3040', 12); sfx.alarm(); addShake(0.5); G.redPulse = 1.5;
  }
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
        const n = ai.rage ? 26 : 18, off = ai.n * 0.17, bs = ai.rage ? 230 : 190;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * TAU;
          spawnBullet(e.x, e.y, Math.cos(a) * bs, Math.sin(a) * bs, 16);
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

// ================================================================ 中ボス AI
// 大蛇：突進（地面に予告）と毒液の扇撃ち。骸法師：渦巻く呪弾・瞬間移動・骸骨兵の召喚
function updateMid(e, dt) {
  const P = G.player, ai = e.ai;
  const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
  ai.t -= dt * (ai.rage ? 1.6 : 1);
  e.at += dt * 8;
  if (e.flash > 0) e.flash -= dt;
  const snake = e.type === 'orochi';
  // 体力が半分を切ると怒る：行動が速く、攻撃が濃くなる
  if (!ai.rage && e.hp < e.maxHp * 0.5) {
    ai.rage = true;
    e.speed *= 1.3;
    UI.banner(`${e.def.name} 怒り狂う`, 'red');
    FX.ring(e.x, e.y, 30, 260, 0.6, '#ff3040', 10); sfx.alarm(); addShake(0.4); G.redPulse = 1.2;
  }
  switch (ai.state) {
    case 'walk': {
      const sp = d > 520 ? e.speed * 2.5 : e.speed;
      e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
      e.yaw = Math.atan2(dx, dy);
      if (ai.t <= 0) {
        const r = Math.random();
        if (snake) {
          if (r < 0.5) { ai.state = 'tele'; ai.t = 0.9; ai.dx = dx / d; ai.dy = dy / d; }
          else { ai.state = 'spit'; ai.t = 0; ai.n = ai.rage ? 5 : 3; }
        } else if (r < 0.4) { ai.state = 'spiral'; ai.t = 2.6; ai.a = Math.random() * TAU; ai.shot = 0; }
        else if (r < 0.7) {
          ai.state = 'walk'; ai.t = 2.2;
          FX.seal(e.x, e.y, 90, 0.6);
          const a = Math.random() * TAU;
          e.x = P.x + Math.cos(a) * 300; e.y = P.y + Math.sin(a) * 300;
          FX.seal(e.x, e.y, 90, 0.8); FX.burst(e.x, e.y, 30, 3, 260, 10, 0.6); sfx.summon();
        } else {
          ai.state = 'walk'; ai.t = 2.6;
          FX.seal(e.x, e.y, 120, 1.0);
          const n = ai.rage ? 26 : 16;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            spawnEnemy(ai.rage ? 'gashadokuro' : 'kooni', P.x + Math.cos(a) * 250, P.y + Math.sin(a) * 250, true);
          }
          sfx.alarm();
        }
      }
      break;
    }
    case 'tele':
      ai.dx = ai.dx * 0.9 + (dx / d) * 0.1; ai.dy = ai.dy * 0.9 + (dy / d) * 0.1;
      e.yaw = Math.atan2(ai.dx, ai.dy);
      if (ai.t <= 0) { ai.state = 'charge'; ai.t = 0.65; ai.n = ai.rage && ai.n !== -1 ? 1 : 0; sfx.slam(); addShake(0.2); }
      break;
    case 'charge': {
      const l = Math.hypot(ai.dx, ai.dy) || 1;
      e.x += ai.dx / l * 520 * dt; e.y += ai.dy / l * 520 * dt;
      if (G.frame % 2 === 0) FX.burst(e.x, e.y, 2, 6, 80, 12, 0.5);
      if (ai.t <= 0) {
        // 怒り中は二段突進：もう一度狙い直して突っ込む
        if (ai.n === 1) { ai.state = 'tele'; ai.t = 0.5; ai.n = -1; ai.dx = dx / d; ai.dy = dy / d; }
        else { ai.state = 'walk'; ai.t = 2.2; ai.n = 0; }
      }
      break;
    }
    case 'spit':
      e.yaw = Math.atan2(dx, dy);
      if (ai.t <= 0) {
        const base = Math.atan2(dy, dx);
        for (let i = -2; i <= 2; i++) {
          const a = base + i * 0.2;
          spawnBullet(e.x, e.y, Math.cos(a) * 220, Math.sin(a) * 220, 12);
        }
        FX.ring(e.x, e.y, 20, 70, 0.3, '#9dff6a', 5);
        sfx.shoot();
        ai.n--; ai.t = 0.5;
        if (ai.n <= 0) { ai.state = 'walk'; ai.t = 2.4; }
      }
      break;
    case 'spiral':
      ai.shot -= dt;
      if (ai.shot <= 0) {
        ai.shot = 0.09; ai.a += 0.33;
        const arms = ai.rage ? 5 : 3;
        for (let k = 0; k < arms; k++) {
          const a = ai.a + (k / arms) * TAU;
          spawnBullet(e.x, e.y, Math.cos(a) * 170, Math.sin(a) * 170, 13);
        }
      }
      if (ai.t <= 0) { ai.state = 'walk'; ai.t = 2.0; }
      break;
  }
  if (d < e.r + P.r) hurtPlayer(e.dmg);
  const q = G.agrid.query(e.x, e.y, e.r + 30);
  for (let k = 0; k < q; k++) {
    const a = G.blockers[G.agrid.out[k]];
    if (!a || !a.alive) continue;
    const ox = a.x - e.x, oy = a.y - e.y, rr = e.r + a.r;
    if (ox * ox + oy * oy < rr * rr) { a.hp -= 160 * dt; a.x += ox * 0.1; a.y += oy * 0.1; }
  }
}

function midDefeated(e) {
  if (G.midBoss === e) { G.midBoss = null; UI.bossBar(false); }
  G.mids.push(e.type);
  if (!cheat()) Progress.addMid(e.type);
  if (G.onKill) G.onKill(e);
  G.kills++;
  FX.burst(e.x, e.y, 90, e.def.color, 460, 14, 1.2);
  FX.ring(e.x, e.y, 20, 320, 0.8, '#ffd35a', 12);
  FX.anim('explosion', e.x, e.y, { scale: 4, force: true, dur: 0.8 });
  G.flash = 0.7; G.hitstop = 0.15; addShake(0.8);
  sfx.boom();
  UI.banner(`${e.def.name} 討伐! ─ 大宝箱`, 'huge');
  dropGem(e.x, e.y, e.xp);
  G.pickups.push({ kind: 'chest', big: true, x: e.x, y: e.y, alive: true, t: 0, mag: false, spd: 0 });
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
  UI.banner('がしゃどくろ 討伐!', 'huge');
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
  const res = cheat() ? { chars: [], achs: [] } : Progress.check({ mode: G.mode.id, char: G.char.id, time: G.time, kills: G.kills, win, mids: G.mids, final: true });
  const fresh = res.chars;
  if (win) sfx.win(); else sfx.gameover();
  music.title();
  UI.showResult(win, {
    time: G.time, kills: G.kills, level: G.level, maxAllies: G.maxAllies, dmg: G.dmgDealt, unlocked: fresh, achs: res.achs,
    mode: G.mode, char: G.char, best: Progress.get().best[`${G.mode.id}:${G.char.id}`],
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
  updateView();

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
  G.dense = G.enemies.length > 220;

  if (G.streakT > 0) { G.streakT -= dt; if (G.streakT <= 0) G.streak = 0; }
  // 連続撃破の節目で周囲に衝撃波
  if (G.streak >= 50 && Math.floor(G.streak / 50) > (G.streakMark || 0)) {
    G.streakMark = Math.floor(G.streak / 50);
    FX.ring(P.x, P.y, 10, 200, 0.5, '#ffd35a', 6);
    sfx.gem(30);
  } else if (G.streak < 50) G.streakMark = 0;
  if (G.frame % 90 === 0 && !cheat()) {
    const r = Progress.check({ mode: G.mode.id, char: G.char.id, time: G.time, kills: G.kills, mids: G.mids });
    for (const c of r.chars) UI.banner(`退魔師 解放：${c.job} ${c.name}`, 'rainbow');
    for (const a of r.achs) UI.banner(`実績：${a.name}`, 'gold');
  }
  if (G.midBoss && !G.boss) UI.bossBar(true, G.midBoss.hp / G.midBoss.maxHp, G.midBoss.def.name);
  updateUlt(dt);

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
  const sp = PLAYER.speed * G.st.speedMul * (G.ultKind === 'kagenui' ? 1.8 : G.ultKind === 'youka' ? 1.3 : 1);
  P.moving = input.x !== 0 || input.y !== 0;
  if (P.moving) {
    const l = Math.hypot(input.x, input.y);
    P.fx = input.x / l; P.fy = input.y / l;
    P.walk += dt * 8 * l;
    P.yaw = Math.atan2(input.x, input.y);
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
    if (e.mid) { updateMid(e, dt); continue; }
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
    e.yaw = Math.atan2(mx, my);
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
      hitFx(p, e);
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

// 弾が当たった瞬間の演出（種類ごと）と炸裂
function hitFx(p, e) {
  if (p.kind === 'ofuda') { FX.burst(e.x, e.y, 4, 0, 220, 6, 0.3, 1.0); }
  else if (p.kind === 'arrow') { FX.burst(e.x, e.y, 3, 7, 300, 5, 0.25, 1.0); FX.slash(e.x, e.y, 22, Math.atan2(p.vy, p.vx), '#ffe9c0', 0.14); }
  else FX.burst(e.x, e.y, 4, 1, 200, 7, 0.3, 1.4);
  if (p.boom) {
    const R = p.boom;
    FX.anim('explosion', e.x, e.y, { scale: R / 60 });
    const q = G.egrid.query(e.x, e.y, R + 26, G.egrid.out2);
    for (let k = 0; k < q; k++) {
      const o = G.enemies[G.egrid.out2[k]];
      if (!o || !o.alive || o === e || o.boss) continue;
      const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (d < R + o.r) hurtEnemy(o, p.dmg * 0.6, dx / d, dy / d, 120, p.ally);
    }
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
  G.xp += v * G.st.xpMul * G.mode.xp;
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
      else if (k.kind === 'chest') openChest(!!k.big);
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
    if (!e.alive || e.boss || e.mid) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
    if (d < 220) { e.vx += dx / d * 520 / e.mass; e.vy += dy / d * 520 / e.mass; }
  }
  FX.ring(P.x, P.y, 10, 220, 0.7, '#ffe9b0', 10);
  FX.ring(P.x, P.y, 10, 150, 0.5, '#ffd35a', 5);
  FX.burst(P.x, P.y, 50, 0, 340, 10, 0.9);
  FX.seal(P.x, P.y, 120, 0.9, null, true);
  G.fovKick = 1;
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

// ================================================================ 視界（3D：プレイヤー中心の正方形をワールドの「画面」とみなす）
export const VIEW_R = 640;   // 出現・画面内判定に使う半径（ワールド単位。40 単位 = 1m）
export function resize() {
  const v = G.view;
  v.w = v.h = VIEW_R * 2;
  v.halfDiag = Math.hypot(v.w, v.h) / 2;
}
export function updateView() {
  const v = G.view, P = G.player;
  if (!P) return;
  v.x0 = P.x - VIEW_R; v.x1 = P.x + VIEW_R;
  v.y0 = P.y - VIEW_R; v.y1 = P.y + VIEW_R;
}
