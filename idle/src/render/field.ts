// The main-screen field: a real-time auto battle. The hero hunts roaming monsters, the kill gauge
// fills, the area boss appears; win → next stage, lose → keep farming this stage.
import { ALLY_BY_ID, elementFactor, ELEMENT_INFO, type EnemyDef, type Element } from '../data/monsters';
import { SKILL_BY_ID, skillLvMul, type SkillDef } from '../data/items';
import { areaDef, bossTime, enemyStats, fmt, isAreaBoss, killsNeeded, loopOf, parseGuardianKey, guardianSlotsUnlocked, type EnemyKind } from '../game/core';
import * as L from '../game/logic';
import { game } from '../game/store';
import { sfx } from '../game/audio';
import { paintBackground } from './background';
import { hueShift, img, info, preload, silhouette } from './sprites';

type Phase = 'field' | 'bossIntro' | 'boss' | 'victory' | 'defeat' | 'down' | 'areaIntro';

interface Mob {
  def: EnemyDef;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  interval: number;
  cd: number;
  h: number; // display height
  w: number;
  face: 1 | -1;
  t: number;
  spawnT: number;
  flash: number;
  kbx: number;
  kby: number;
  frozen: number;
  aggro: boolean;
  wx: number;
  wy: number;
  wait: number;
  dying: number;
  lunge: number;
  slamT: number;
  slamX: number;
  slamY: number;
  slamCharge: number;
}

interface Proj {
  x: number;
  y: number;
  tx: number;
  ty: number;
  target: Mob | null;
  speed: number;
  dmgMul: number;
  splash: number;
  color: string;
  kind: 'arrow' | 'orb' | 'bolt';
  trail: { x: number; y: number }[];
  skill?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'dot' | 'star' | 'coin' | 'wisp' | 'shard' | 'ring' | 'slash' | 'text' | 'bolt' | 'meteor' | 'telegraph';
  text?: string;
  r?: number;
  a?: number;
  extra?: number;
  big?: boolean;
  tx?: number;
  ty?: number;
}

export interface Banner {
  kind: 'boss' | 'areaBoss' | 'clear' | 'fail' | 'area' | 'down';
  title: string;
  sub: string;
  t: number;
}

const HERO_SPEED = 120;

export class Field {
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  W = 400;
  H = 360;
  u = 1;
  dpr = 1;
  bg: HTMLCanvasElement | null = null;
  bgKey = '';
  phase: Phase = 'field';
  phaseT = 0;
  mobs: Mob[] = [];
  boss: Mob | null = null;
  bossTimer = 0;
  projs: Proj[] = [];
  parts: Particle[] = [];
  banner: Banner | null = null;
  shake = 0;
  flash = 0;
  flashColor = '#fff';
  spawnCd = 0;
  time = 0;
  hero = {
    x: 120,
    y: 250,
    hp: 1,
    maxHp: 1,
    shield: 0,
    cd: 0,
    face: 1 as 1 | -1,
    lunge: 0,
    lungeDir: { x: 1, y: 0 },
    hurt: 0,
    atkBuff: 0,
    atkBuffT: 0,
    spdBuff: 0,
    spdBuffT: 0,
    skillCd: [3, 5, 7] as number[],
    target: null as Mob | null,
    casting: 0,
    auraColor: '',
    regenAcc: 0,
    downT: 0,
    lastChar: '',
  };
  coinTarget = { x: 30, y: -20 };
  running = false;
  private raf = 0;
  private last = 0;
  private resizeObs: ResizeObserver;
  onHud: (() => void) | null = null;
  private timers: { at: number; fn: () => void }[] = [];

  /** run fn after `delay` seconds of field time (respects game speed) */
  later(delay: number, fn: () => void) {
    this.timers.push({ at: this.time + delay, fn });
  }

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.g = cv.getContext('2d')!;
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(cv);
    this.resize();
    this.resetHero(true);
    this.preloadArea();
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(200, r.width);
    this.H = Math.max(200, r.height);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.u = Math.min(this.H / 380, this.W / 360);
    this.bgKey = '';
    const h = this.hero;
    h.x = Math.min(Math.max(h.x, 30), this.W - 30);
    h.y = Math.min(Math.max(h.y, this.minY()), this.H - 26 * this.u);
  }

  top() {
    return this.H * 0.26;
  }
  /** highest y (feet) an actor may stand at, so tall sprites don't cover the HUD */
  minY() {
    return this.top() + 46 * this.u;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      const speed = game.save.settings.speed;
      const steps = speed;
      for (let i = 0; i < steps; i++) this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  preloadArea() {
    const a = areaDef(game.save.g);
    const active = ALLY_BY_ID[game.save.active];
    const stems = [...a.mobs.map((m) => m.sprite), ...a.elites.map((m) => m.sprite), a.boss.sprite, active.sprite];
    for (const k of game.save.guardianSlots) if (k) stems.push(ALLY_BY_ID[parseGuardianKey(k).id].sprite);
    preload(stems);
    // preload next area too
    const next = areaDef(game.save.g + 10);
    preload([...next.mobs.map((m) => m.sprite).slice(0, 4)]);
  }

  // ---------- helpers ----------
  dispSize(stem: string, kind: EnemyKind | 'hero' | 'guardian') {
    const inf = info(stem);
    const nat = Math.sqrt(inf.ow * inf.oh);
    let h: number;
    let maxW: number;
    switch (kind) {
      case 'mob':
        h = clamp(nat * 0.34, 54, 92);
        maxW = 120;
        break;
      case 'elite':
        h = clamp(nat * 0.42, 100, 140);
        maxW = 190;
        break;
      case 'boss':
        h = clamp(nat * 0.4, 150, 200);
        maxW = 250;
        break;
      case 'guardian':
        h = clamp(nat * 0.24, 44, 62);
        maxW = 90;
        break;
      default:
        h = clamp(nat * 0.36, 74, 104);
        maxW = 130;
    }
    let w = (h * inf.w) / inf.h;
    if (w > maxW) {
      h *= maxW / w;
      w = maxW;
    }
    return { w: w * this.u, h: h * this.u };
  }

  resetHero(full: boolean) {
    const hs = game.hero;
    const h = this.hero;
    h.maxHp = hs.hp;
    if (full) {
      h.hp = hs.hp;
      h.x = this.W * 0.3;
      h.y = this.top() + (this.H - this.top()) * 0.55;
      h.skillCd = [2.5, 4.5, 6.5];
      h.shield = 0;
      h.atkBuffT = 0;
      h.spdBuffT = 0;
    }
    h.lastChar = game.save.active;
  }

  syncHero() {
    const hs = game.hero;
    const h = this.hero;
    if (h.lastChar !== game.save.active) {
      h.lastChar = game.save.active;
      this.puff(h.x, h.y - 30 * this.u, '#ffffff', 16);
      preload([hs.ally.sprite]);
    }
    if (Math.abs(h.maxHp - hs.hp) > 1e-9) {
      const ratio = h.hp / h.maxHp;
      h.maxHp = hs.hp;
      h.hp = Math.min(hs.hp, Math.max(h.hp, ratio * hs.hp));
    }
  }

  mobTarget() {
    const area = areaDef(game.save.g);
    return Math.min(8, 5 + Math.floor((game.save.g % 10) / 3)) + (area.mobs.length > 11 ? 1 : 0);
  }

  spawnMob() {
    const s = game.save;
    const area = areaDef(s.g);
    const def = area.mobs[Math.floor(Math.random() * area.mobs.length)];
    const st = enemyStats(s.g, 'mob');
    const sz = this.dispSize(def.sprite, 'mob');
    let x = 0,
      y = 0;
    for (let i = 0; i < 10; i++) {
      x = 30 + Math.random() * (this.W - 60);
      y = this.minY() + Math.random() * (this.H - 26 * this.u - this.minY());
      if (Math.hypot(x - this.hero.x, y - this.hero.y) > 120 * this.u) break;
    }
    const var_ = 0.9 + Math.random() * 0.2;
    const m: Mob = {
      def,
      kind: 'mob',
      x,
      y,
      hp: st.hp * var_,
      maxHp: st.hp * var_,
      atk: st.atk,
      interval: st.interval * (0.9 + Math.random() * 0.2),
      cd: 1 + Math.random(),
      h: sz.h,
      w: sz.w,
      face: x > this.hero.x ? 1 : -1,
      t: Math.random() * 10,
      spawnT: 0,
      flash: 0,
      kbx: 0,
      kby: 0,
      frozen: 0,
      aggro: false,
      wx: x,
      wy: y,
      wait: Math.random() * 2,
      dying: 0,
      lunge: 0,
      slamT: 0,
      slamX: 0,
      slamY: 0,
      slamCharge: 0,
    };
    this.mobs.push(m);
    this.puff(x, y, 'rgba(255,255,255,0.8)', 8);
  }

  spawnBoss() {
    const s = game.save;
    const area = areaDef(s.g);
    const kind: EnemyKind = isAreaBoss(s.g) ? 'boss' : 'elite';
    const def = kind === 'boss' ? area.boss : area.elites[(s.g % 10) % area.elites.length];
    const st = enemyStats(s.g, kind);
    const sz = this.dispSize(def.sprite, kind);
    const x = this.W * 0.72;
    const y = Math.min(this.H - 26 * this.u, Math.max(this.top() + (this.H - this.top()) * 0.66, 112 + sz.h));
    this.boss = {
      def,
      kind,
      x,
      y,
      hp: st.hp,
      maxHp: st.hp,
      atk: st.atk,
      interval: st.interval,
      cd: 1.6,
      h: sz.h,
      w: sz.w,
      face: 1,
      t: 0,
      spawnT: 0,
      flash: 0,
      kbx: 0,
      kby: 0,
      frozen: 0,
      aggro: true,
      wx: x,
      wy: y,
      wait: 0,
      dying: 0,
      lunge: 0,
      slamT: 5,
      slamX: 0,
      slamY: 0,
      slamCharge: 0,
    };
    this.bossTimer = bossTime(s.g);
    this.puff(x, y, 'rgba(60,20,60,0.6)', 24);
    this.shake = 10;
  }

  // ---------- phases ----------
  setPhase(p: Phase, t: number) {
    this.phase = p;
    this.phaseT = t;
    this.onHud?.();
  }

  challengeBoss() {
    if (this.phase !== 'field') return;
    const s = game.save;
    if (s.kills < killsNeeded(s.g)) return;
    const area = areaDef(s.g);
    const kind = isAreaBoss(s.g) ? 'boss' : 'elite';
    const def = kind === 'boss' ? area.boss : area.elites[(s.g % 10) % area.elites.length];
    preload([def.sprite]);
    for (const m of this.mobs) if (!m.dying) m.dying = 0.001;
    this.banner = {
      kind: kind === 'boss' ? 'areaBoss' : 'boss',
      title: kind === 'boss' ? 'AREA BOSS' : 'STAGE BOSS',
      sub: def.name,
      t: 0,
    };
    sfx.bossIntro();
    this.setPhase('bossIntro', 1.8);
  }

  // ---------- update ----------
  update(dt: number) {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }
    this.syncHero();
    const h = this.hero;
    const hs = game.hero;
    if (this.banner) this.banner.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 3);

    // phase timers
    if (this.phaseT > 0) {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.endPhase();
    }

    // buffs & regen
    h.atkBuffT = Math.max(0, h.atkBuffT - dt);
    h.spdBuffT = Math.max(0, h.spdBuffT - dt);
    h.lunge = Math.max(0, h.lunge - dt);
    h.hurt = Math.max(0, h.hurt - dt);
    h.casting = Math.max(0, h.casting - dt);
    if (this.phase !== 'down' && h.hp > 0) {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * hs.regen * dt);
    }

    // spawn
    if (this.phase === 'field') {
      this.spawnCd -= dt;
      const alive = this.mobs.filter((m) => !m.dying).length;
      if (alive < this.mobTarget() && this.spawnCd <= 0) {
        this.spawnMob();
        this.spawnCd = 0.45 + Math.random() * 0.4;
      }
      if (L.shouldAutoChallenge(game.save)) this.challengeBoss();
    }

    // boss timer
    if (this.phase === 'boss' && this.boss) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) this.bossFail('時間切れ…');
    }

    // hero brain
    if ((this.phase === 'field' || this.phase === 'boss') && h.hp > 0) this.heroBrain(dt);
    else if (this.phase === 'bossIntro') {
      // walk to the left-middle to face the boss
      const tx = this.W * 0.3;
      const ty = this.top() + (this.H - this.top()) * 0.62;
      this.moveHero(tx, ty, dt);
      h.face = 1;
    }

    // mobs
    for (const m of this.mobs) this.mobBrain(m, dt);
    if (this.boss) this.mobBrain(this.boss, dt);
    this.mobs = this.mobs.filter((m) => m.dying < 1);
    if (this.boss && this.boss.dying >= 1.4) this.boss = null;

    // projectiles
    for (const p of this.projs) this.updateProj(p, dt);
    this.projs = this.projs.filter((p) => p.speed > 0);

    // particles
    for (const p of this.parts) {
      p.life -= dt;
      if (p.kind === 'coin' && p.life < p.max * 0.55) {
        // home toward coin counter
        const tx = p.tx ?? this.coinTarget.x;
        const ty = p.ty ?? this.coinTarget.y;
        p.vx += (tx - p.x) * dt * 6;
        p.vy += (ty - p.y) * dt * 6;
        p.vx *= 0.9;
        p.vy *= 0.9;
      } else {
        p.vy += p.g * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
  }

  endPhase() {
    const s = game.save;
    switch (this.phase) {
      case 'bossIntro':
        this.mobs = [];
        this.spawnBoss();
        this.banner = null;
        this.setPhase('boss', 0);
        break;
      case 'victory': {
        const prevArea = Math.floor(s.g / 10);
        const res = game.act((sv) => L.winBoss(sv));
        if (res.gems) game.toast(`初回撃破ボーナス  霊晶 +${res.gems}`, 'good');
        if (res.newSlot) game.toast('守護霊の枠が増えた！', 'rare');
        const newArea = Math.floor(s.g / 10) !== prevArea;
        game.emit({ t: 'stage', g: s.g, newArea });
        this.boss = null;
        this.mobs = [];
        this.preloadArea();
        if (newArea) {
          const a = areaDef(s.g);
          const lp = loopOf(s.g);
          this.banner = { kind: 'area', title: a.name + (lp ? ` ${'Ⅱ Ⅲ Ⅳ Ⅴ Ⅵ Ⅶ Ⅷ Ⅸ'.split(' ')[lp - 1] ?? '+' + lp}` : ''), sub: `AREA ${Math.floor(s.g / 10) + 1} · ${a.sub}`, t: 0 };
          this.bgKey = '';
          this.setPhase('areaIntro', 2.4);
        } else {
          this.banner = null;
          this.setPhase('field', 0);
        }
        break;
      }
      case 'defeat':
        this.boss = null;
        this.banner = null;
        game.act((sv) => L.loseBoss(sv));
        this.hero.hp = this.hero.maxHp;
        this.setPhase('field', 0);
        break;
      case 'down':
        this.hero.hp = this.hero.maxHp;
        this.hero.shield = 0;
        this.banner = null;
        this.puff(this.hero.x, this.hero.y - 30, '#fff7c2', 14);
        this.setPhase('field', 0);
        break;
      case 'areaIntro':
        this.banner = null;
        this.setPhase('field', 0);
        break;
    }
  }

  bossFail(reason: string) {
    if (this.phase !== 'boss') return;
    this.banner = { kind: 'fail', title: '撤退…', sub: reason + '  このステージを周回して力を蓄えます', t: 0 };
    sfx.lose();
    this.setPhase('defeat', 2.4);
  }

  moveHero(tx: number, ty: number, dt: number, speedMul = 1) {
    const h = this.hero;
    const dx = tx - h.x;
    const dy = ty - h.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return;
    const sp = HERO_SPEED * this.u * speedMul * dt;
    const k = Math.min(1, sp / d);
    h.x += dx * k;
    h.y += dy * k;
    if (Math.abs(dx) > 4) h.face = dx > 0 ? 1 : -1;
    h.x = clamp(h.x, 20, this.W - 20);
    h.y = clamp(h.y, this.minY(), this.H - 26 * this.u);
  }

  heroBrain(dt: number) {
    const h = this.hero;
    const hs = game.hero;
    const role = hs.ally.role;
    const range = hs.range * this.u;
    // pick target
    const live = this.boss && !this.boss.dying ? [this.boss] : this.mobs.filter((m) => !m.dying && m.spawnT > 0.25);
    if (!h.target || h.target.dying || !live.includes(h.target)) {
      let best: Mob | null = null;
      let bd = Infinity;
      for (const m of live) {
        const d = Math.hypot(m.x - h.x, m.y - h.y) - (m.aggro ? 40 : 0);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      h.target = best;
    }
    const t = h.target;

    // skills
    this.trySkills(dt, live);

    if (!t) {
      // idle wander toward center
      this.moveHero(this.W * 0.45, this.top() + (this.H - this.top()) * 0.55, dt, 0.4);
      return;
    }
    const dx = t.x - h.x;
    const dy = t.y - h.y;
    const dist = Math.hypot(dx, dy * 1.4);
    const reach = range + t.w * 0.25;
    if (dist > reach) {
      const k = (dist - reach * 0.85) / dist;
      this.moveHero(h.x + dx * k, h.y + dy * k, dt);
    } else if ((role === 'archer' || role === 'mage') && dist < reach * 0.45 && t.kind === 'mob') {
      // kite away a bit
      this.moveHero(h.x - dx * 0.5, h.y - dy * 0.5, dt, 0.7);
      h.face = dx > 0 ? 1 : -1;
    } else {
      h.face = dx > 0 ? 1 : -1;
    }
    h.cd -= dt;
    if (dist <= reach * 1.05 && h.cd <= 0) {
      const spd = 1 + (h.spdBuffT > 0 ? h.spdBuff : 0);
      h.cd = hs.interval / spd;
      this.heroAttack(t);
    }
  }

  atkNow() {
    const h = this.hero;
    return game.hero.atk * (1 + (h.atkBuffT > 0 ? h.atkBuff : 0));
  }

  heroAttack(t: Mob) {
    const h = this.hero;
    const hs = game.hero;
    const el = hs.ally.el;
    const color = ELEMENT_INFO[el].color;
    switch (hs.ally.role) {
      case 'blade':
      case 'guard': {
        h.lunge = 0.18;
        const d = Math.hypot(t.x - h.x, t.y - h.y) || 1;
        h.lungeDir = { x: (t.x - h.x) / d, y: (t.y - h.y) / d };
        this.damage(t, 1, { kb: hs.ally.role === 'guard' ? 26 : 10 });
        // cleave
        const cleave = hs.ally.role === 'blade' ? 0.35 : 0.2;
        for (const m of this.mobs) {
          if (m === t || m.dying) continue;
          if (Math.hypot(m.x - t.x, m.y - t.y) < 55 * this.u) this.damage(m, cleave, { kb: 6, quiet: true });
        }
        this.slash(t.x, t.y - t.h * 0.45, h.face, color);
        break;
      }
      case 'archer':
        h.lunge = 0.1;
        h.lungeDir = { x: -h.face, y: 0 };
        this.projs.push({ x: h.x + h.face * 20 * this.u, y: h.y - 40 * this.u, tx: t.x, ty: t.y - t.h * 0.45, target: t, speed: 620 * this.u, dmgMul: 1, splash: 0, color, kind: 'arrow', trail: [] });
        sfx.shoot();
        break;
      case 'mage':
        h.casting = 0.25;
        this.projs.push({ x: h.x + h.face * 16 * this.u, y: h.y - 58 * this.u, tx: t.x, ty: t.y - t.h * 0.45, target: t, speed: 330 * this.u, dmgMul: 1, splash: 70 * this.u, color, kind: 'orb', trail: [] });
        sfx.shoot();
        break;
    }
  }

  updateProj(p: Proj, dt: number) {
    if (p.target && !p.target.dying) {
      p.tx = p.target.x;
      p.ty = p.target.y - p.target.h * 0.45;
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 8) p.trail.shift();
    if (d <= step) {
      p.speed = 0;
      if (p.splash > 0) {
        const pool = this.boss ? [this.boss] : this.mobs;
        for (const m of pool) {
          if (m.dying) continue;
          const dd = Math.hypot(m.x - p.tx, m.y - p.ty - m.h * 0.45);
          if (m === p.target) this.damage(m, p.dmgMul, { kb: 8 });
          else if (dd < p.splash) this.damage(m, p.dmgMul * 0.6, { kb: 8, quiet: true });
        }
        this.burst(p.tx, p.ty, p.color, 12, 120);
        this.ring(p.tx, p.ty + 10, p.color, p.splash);
      } else if (p.target && !p.target.dying) {
        this.damage(p.target, p.dmgMul, { kb: 6 });
      }
      return;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
  }

  damage(m: Mob, mul: number, o: { kb?: number; quiet?: boolean; skill?: boolean; el?: Element; noCrit?: boolean } = {}) {
    if (m.dying || m.spawnT < 0.1) return 0;
    const hs = game.hero;
    const el = o.el ?? hs.ally.el;
    const ef = elementFactor(el, m.def.el);
    const crit = !o.noCrit && Math.random() < hs.crit;
    let dmg = this.atkNow() * mul * ef * (crit ? hs.critDmg : 1) * (0.92 + Math.random() * 0.16);
    if (o.skill) dmg *= hs.skillDmg;
    if (m.kind !== 'mob') dmg *= hs.boss;
    m.hp -= dmg;
    m.flash = 0.12;
    m.aggro = true;
    if (o.kb) {
      const dx = m.x - this.hero.x;
      const dy = m.y - this.hero.y;
      const d = Math.hypot(dx, dy) || 1;
      const kb = m.kind === 'mob' ? o.kb : o.kb * 0.15;
      m.kbx += (dx / d) * kb * this.u * 6;
      m.kby += (dy / d) * kb * this.u * 3;
    }
    if (!o.quiet || crit) {
      this.text(m.x + (Math.random() - 0.5) * 20, m.y - m.h - 4, fmt(dmg) + (crit ? '!' : ''), crit ? '#ffcf3d' : '#ffffff', crit, ef > 1 ? '弱点' : ef < 1 ? '耐性' : undefined);
    }
    if (crit) {
      sfx.crit();
      this.burst(m.x, m.y - m.h * 0.5, '#ffe58a', 6, 160);
    } else if (!o.quiet) sfx.hit();
    this.burst(m.x, m.y - m.h * 0.5, '#ffffff', 3, 90);
    if (m.hp <= 0) this.kill(m);
    return dmg;
  }

  kill(m: Mob) {
    m.hp = 0;
    m.dying = 0.001;
    sfx.kill();
    // spirit wisps
    for (let i = 0; i < 10; i++) {
      this.parts.push({ x: m.x + (Math.random() - 0.5) * m.w * 0.6, y: m.y - Math.random() * m.h, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 50, g: -10, life: 1 + Math.random() * 0.6, max: 1.6, size: 3 + Math.random() * 4, color: '#d7f5ff', kind: 'wisp' });
    }
    const s = game.save;
    if (this.hero.target === m) this.hero.target = null;
    if (m.kind === 'mob') {
      const rew = L.rewardKill(s, game.hero, 'mob', Math.random);
      this.coins(m.x, m.y - m.h * 0.5, 3, rew.coins);
      if (rew.orb) this.orbDrop(m.x, m.y - m.h * 0.5);
      if (rew.gems) {
        this.text(m.x, m.y - m.h - 18, '霊晶+' + rew.gems, '#8fe3ff', true);
      }
      game.changed();
    } else {
      // boss down
      const rew = L.rewardKill(s, game.hero, m.kind, Math.random);
      this.coins(m.x, m.y - m.h * 0.5, 16, rew.coins);
      if (rew.orb) this.orbDrop(m.x, m.y - m.h * 0.5);
      this.shake = 16;
      this.flash = 1;
      this.flashColor = '#fff6d0';
      sfx.boom();
      sfx.win();
      for (let i = 0; i < 40; i++) this.burst(m.x, m.y - m.h * 0.5, ['#ffe58a', '#ffffff', '#ffb36b'][i % 3], 1, 320);
      this.banner = { kind: 'clear', title: 'STAGE CLEAR!', sub: `${m.def.name} を討伐した`, t: 0 };
      this.setPhase('victory', 2.2);
    }
  }

  heroHurt(amount: number, src: Mob) {
    const h = this.hero;
    const hs = game.hero;
    if (h.hp <= 0) return;
    let dmg = amount * (1 - hs.reduce) * (0.9 + Math.random() * 0.2);
    if (h.shield > 0) {
      const ab = Math.min(h.shield, dmg);
      h.shield -= ab;
      dmg -= ab;
      if (ab > 0) this.burst(h.x, h.y - 40 * this.u, '#9fdcff', 3, 60);
    }
    h.hp -= dmg;
    h.hurt = 0.15;
    if (dmg > 0) {
      this.text(h.x + (Math.random() - 0.5) * 16, h.y - 90 * this.u, fmt(dmg), '#ff8a7a', false);
      sfx.hurt();
    }
    if (src.kind !== 'mob') this.shake = Math.max(this.shake, 5);
    if (h.hp <= 0) {
      h.hp = 0;
      this.puff(h.x, h.y - 30 * this.u, 'rgba(255,255,255,0.8)', 14);
      if (this.phase === 'boss') this.bossFail('力尽きた…');
      else {
        this.banner = { kind: 'down', title: 'ひと休み…', sub: 'すぐに起き上がります', t: 0 };
        this.setPhase('down', 2.6);
        for (const m of this.mobs) m.aggro = false;
      }
    }
  }

  mobBrain(m: Mob, dt: number) {
    m.t += dt;
    m.spawnT += dt;
    m.flash = Math.max(0, m.flash - dt);
    m.lunge = Math.max(0, m.lunge - dt);
    if (m.dying) {
      m.dying += dt * 1.6;
      return;
    }
    // knockback
    m.x += m.kbx * dt;
    m.y += m.kby * dt;
    m.kbx *= Math.pow(0.002, dt);
    m.kby *= Math.pow(0.002, dt);
    m.x = clamp(m.x, 20 + (m.kind === 'mob' ? 0 : m.w * 0.3), this.W - 20 - (m.kind === 'mob' ? 0 : m.w * 0.3));
    m.y = clamp(m.y, m.kind === 'mob' ? this.minY() : Math.min(this.H - 26 * this.u, Math.max(this.minY(), 112 + m.h)), this.H - 26 * this.u);
    if (m.frozen > 0) {
      m.frozen -= dt;
      return;
    }
    if (m.spawnT < 0.4) return;
    const h = this.hero;
    const dx = h.x - m.x;
    const dy = h.y - m.y;
    const dist = Math.hypot(dx, dy * 1.4);
    const heroAlive = h.hp > 0 && this.phase !== 'down';
    if (heroAlive && dist < 130 * this.u && this.phase === 'field') m.aggro = true;
    const isBoss = m.kind !== 'mob';
    const contact = (isBoss ? m.w * 0.42 : 34 * this.u) + 14 * this.u;
    const sp = (isBoss ? 50 : m.aggro ? 62 : 22) * this.u;

    if (isBoss && this.phase === 'boss') {
      // slam attack with telegraph
      m.slamT -= dt;
      if (m.slamCharge > 0) {
        m.slamCharge -= dt;
        if (m.slamCharge <= 0) {
          m.lunge = 0.3;
          this.shake = 12;
          sfx.boom();
          this.ring(m.slamX, m.slamY, '#ff6b5b', 95 * this.u);
          this.burst(m.slamX, m.slamY - 6, '#c9a27a', 18, 200);
          if (Math.hypot(h.x - m.slamX, (h.y - m.slamY) * 1.4) < 95 * this.u) this.heroHurt(m.atk * 2, m);
        }
        return;
      }
      if (m.slamT <= 0 && heroAlive) {
        m.slamT = 8;
        m.slamCharge = 1.1;
        m.slamX = h.x;
        m.slamY = h.y;
        this.parts.push({ x: h.x, y: h.y, vx: 0, vy: 0, g: 0, life: 1.1, max: 1.1, size: 95 * this.u, color: '#ff4d3d', kind: 'telegraph' });
        return;
      }
    }

    if (m.aggro && heroAlive && (this.phase === 'field' || this.phase === 'boss')) {
      if (dist > contact) {
        m.x += (dx / dist) * sp * dt;
        m.y += (dy / dist) * sp * dt * 0.8;
      }
      m.face = dx > 0 ? -1 : 1;
      m.cd -= dt;
      if (dist <= contact * 1.15 && m.cd <= 0) {
        m.cd = m.interval;
        m.lunge = 0.18;
        this.heroHurt(m.atk, m);
      }
    } else {
      // wander
      m.wait -= dt;
      if (m.wait <= 0) {
        const wdx = m.wx - m.x;
        const wdy = m.wy - m.y;
        const wd = Math.hypot(wdx, wdy);
        if (wd < 4) {
          m.wait = 1 + Math.random() * 2.5;
          m.wx = clamp(m.x + (Math.random() - 0.5) * 160, 30, this.W - 30);
          m.wy = clamp(m.y + (Math.random() - 0.5) * 90, this.minY(), this.H - 26 * this.u);
        } else {
          m.x += (wdx / wd) * sp * dt;
          m.y += (wdy / wd) * sp * dt;
          m.face = wdx > 0 ? -1 : 1;
        }
      }
    }
  }

  // ---------- skills ----------
  trySkills(dt: number, live: Mob[]) {
    const s = game.save;
    const h = this.hero;
    const hs = game.hero;
    if (h.casting > 0) return;
    for (let i = 0; i < hs.skillSlots; i++) {
      const id = s.skillSlots[i];
      if (!id) continue;
      h.skillCd[i] -= dt;
      if (h.skillCd[i] > 0) continue;
      const def = SKILL_BY_ID[id];
      const lv = s.skills[id]?.lv ?? 1;
      if (!this.skillUseful(def, live)) continue;
      h.skillCd[i] = def.cd;
      this.castSkill(def, lv, live);
      return;
    }
  }

  skillUseful(def: SkillDef, live: Mob[]) {
    const h = this.hero;
    const near = live.filter((m) => Math.hypot(m.x - h.x, m.y - h.y) < 200 * this.u);
    switch (def.kind) {
      case 'heal':
        return h.hp < h.maxHp * 0.7;
      case 'shield':
        return near.length > 0 && h.shield < h.maxHp * 0.05;
      case 'buff':
        return near.length > 0;
      case 'nova':
      case 'freeze':
        return live.some((m) => Math.hypot(m.x - h.x, m.y - h.y) < (def.radius ?? 100) * this.u * 0.9);
      default:
        return near.length > 0;
    }
  }

  castSkill(def: SkillDef, lv: number, live: Mob[]) {
    const h = this.hero;
    const m = skillLvMul(lv);
    const color = ELEMENT_INFO[def.el].color;
    const u = this.u;
    h.casting = 0.35;
    sfx.skill();
    this.text(h.x, h.y - 112 * u, def.name, color, true, undefined, true);
    this.ring(h.x, h.y, color, 50 * u);
    const nearest = () => {
      let b: Mob | null = null;
      let bd = Infinity;
      for (const x of live) {
        const d = Math.hypot(x.x - h.x, x.y - h.y);
        if (d < bd && !x.dying) {
          bd = d;
          b = x;
        }
      }
      return b;
    };
    switch (def.kind) {
      case 'strike': {
        const t = h.target ?? nearest();
        if (!t) break;
        h.lunge = 0.25;
        this.slash(t.x, t.y - t.h * 0.45, h.face, color, 1.8);
        this.damage(t, def.power * m, { kb: 30, skill: true, el: def.el });
        this.shake = 6;
        break;
      }
      case 'nova': {
        const R = (def.radius ?? 100) * u;
        this.ring(h.x, h.y, color, R, 0.5);
        this.burst(h.x, h.y - 30 * u, color, 26, 260);
        for (const t of [...live]) if (Math.hypot(t.x - h.x, (t.y - h.y) * 1.3) < R + t.w * 0.3) this.damage(t, def.power * m, { kb: 24, skill: true, el: def.el });
        if (def.heal) this.heal(def.heal * m);
        this.shake = 7;
        break;
      }
      case 'bolt': {
        const n = def.hits ?? 1;
        for (let i = 0; i < n; i++) {
          this.later(i * 0.07, () => {
            const pool = (this.boss && !this.boss.dying ? [this.boss] : this.mobs.filter((x) => !x.dying && x.spawnT > 0.3));
            if (!pool.length) return;
            const t = pool[Math.floor(Math.random() * pool.length)];
            this.parts.push({ x: t.x, y: t.y - t.h * 0.5, vx: 0, vy: 0, g: 0, life: 0.22, max: 0.22, size: 1, color, kind: 'bolt', tx: t.x + (Math.random() - 0.5) * 30, ty: -10 });
            this.damage(t, def.power * m, { kb: 8, skill: true, el: def.el, quiet: n > 6 });
          });
        }
        break;
      }
      case 'heal':
        this.heal((def.heal ?? 0) * m);
        if (def.shield) h.shield += h.maxHp * def.shield * m;
        break;
      case 'shield':
        h.shield += h.maxHp * (def.shield ?? 0) * m;
        this.ring(h.x, h.y, '#9fdcff', 60 * u, 0.6);
        break;
      case 'buff':
        if (def.atkBuff) {
          h.atkBuff = def.atkBuff * m;
          h.atkBuffT = def.dur ?? 6;
        }
        if (def.spdBuff) {
          h.spdBuff = def.spdBuff * m;
          h.spdBuffT = def.dur ?? 6;
        }
        h.auraColor = color;
        this.burst(h.x, h.y - 40 * u, color, 16, 140);
        break;
      case 'freeze': {
        const R = (def.radius ?? 100) * u;
        this.ring(h.x, h.y, '#bfe9ff', Math.min(R, this.W), 0.6);
        for (const t of [...live]) {
          if (Math.hypot(t.x - h.x, (t.y - h.y) * 1.3) < R + t.w * 0.3) {
            t.frozen = (def.dur ?? 2) * (t.kind === 'mob' ? 1 : 0.5);
            this.damage(t, def.power * m, { skill: true, el: def.el });
            this.burst(t.x, t.y - t.h * 0.5, '#d8f3ff', 8, 120);
          }
        }
        if (def.atkBuff) {
          h.atkBuff = def.atkBuff * m;
          h.atkBuffT = def.dur ?? 4;
          h.auraColor = color;
        }
        if (def.radius && def.radius > 500) {
          this.flash = 0.6;
          this.flashColor = '#c9b6ff';
        }
        break;
      }
      case 'drain': {
        const t = h.target ?? nearest();
        if (!t) break;
        h.lunge = 0.25;
        this.slash(t.x, t.y - t.h * 0.45, h.face, color, 1.6);
        const d = this.damage(t, def.power * m, { kb: 14, skill: true, el: def.el });
        this.heal(0, d * (def.heal ?? 0));
        for (let i = 0; i < 12; i++) this.parts.push({ x: t.x, y: t.y - t.h * 0.5, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, g: 0, life: 0.7, max: 0.7, size: 4, color: '#c58bff', kind: 'coin', tx: h.x, ty: h.y - 40 * u });
        break;
      }
      case 'meteor': {
        // aim at densest spot
        let best = live[0];
        let bc = -1;
        for (const a of live) {
          const c = live.filter((b) => Math.hypot(a.x - b.x, a.y - b.y) < (def.radius ?? 90) * u).length;
          if (c > bc) {
            bc = c;
            best = a;
          }
        }
        if (!best) break;
        const tx = best.x,
          ty = best.y;
        this.parts.push({ x: tx - 160 * u, y: -40, vx: (160 * u) / 0.5, vy: (ty + 40) / 0.5, g: 0, life: 0.5, max: 0.5, size: 22 * u, color, kind: 'meteor' });
        this.later(0.5, () => {
          const R = (def.radius ?? 90) * u;
          this.ring(tx, ty, color, R, 0.6);
          this.burst(tx, ty - 10, color, 30, 300);
          this.burst(tx, ty - 10, '#fff3c4', 14, 200);
          this.shake = 14;
          sfx.boom();
          const pool = this.boss && !this.boss.dying ? [this.boss] : this.mobs;
          for (const t of [...pool]) if (!t.dying && Math.hypot(t.x - tx, (t.y - ty) * 1.3) < R + t.w * 0.3) this.damage(t, def.power * m, { kb: 30, skill: true, el: def.el });
        });
        break;
      }
    }
  }

  heal(frac: number, flat = 0) {
    const h = this.hero;
    const amt = h.maxHp * frac + flat;
    if (amt <= 0) return;
    h.hp = Math.min(h.maxHp, h.hp + amt);
    sfx.heal();
    this.text(h.x, h.y - 96 * this.u, '+' + fmt(amt), '#7dffa0', false);
    for (let i = 0; i < 10; i++) this.parts.push({ x: h.x + (Math.random() - 0.5) * 40, y: h.y - Math.random() * 60, vx: 0, vy: -40 - Math.random() * 40, g: 0, life: 0.9, max: 0.9, size: 4, color: '#9dffb8', kind: 'star' });
  }

  // ---------- fx ----------
  burst(x: number, y: number, color: string, n: number, sp: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = sp * (0.4 + Math.random() * 0.6) * this.u;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 260, life: 0.35 + Math.random() * 0.3, max: 0.6, size: 2 + Math.random() * 3, color, kind: Math.random() < 0.3 ? 'star' : 'dot' });
    }
  }
  puff(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({ x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 4, vx: Math.cos(a) * 50, vy: Math.sin(a) * 20 - 20, g: -20, life: 0.5 + Math.random() * 0.3, max: 0.8, size: 6 + Math.random() * 6, color, kind: 'wisp' });
    }
  }
  ring(x: number, y: number, color: string, r: number, life = 0.4) {
    this.parts.push({ x, y, vx: 0, vy: 0, g: 0, life, max: life, size: r, color, kind: 'ring' });
  }
  slash(x: number, y: number, face: number, color: string, scale = 1) {
    this.parts.push({ x, y, vx: 0, vy: 0, g: 0, life: 0.2, max: 0.2, size: 34 * this.u * scale, color, kind: 'slash', a: face, extra: Math.random() * 0.6 - 0.3 });
  }
  text(x: number, y: number, text: string, color: string, big: boolean, tag?: string, skill = false) {
    this.parts.push({ x, y, vx: (Math.random() - 0.5) * 20, vy: skill ? -18 : -55, g: skill ? 0 : 60, life: skill ? 1.2 : 0.85, max: skill ? 1.2 : 0.85, size: skill ? 17 : big ? 18 : 13, color, kind: 'text', text: tag ? `${text}` : text, big, extra: skill ? 1 : 0, r: tag === '弱点' ? 1 : tag === '耐性' ? -1 : 0 });
  }
  coins(x: number, y: number, n: number, value: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const v = 90 + Math.random() * 80;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, life: 1.1 + Math.random() * 0.3, max: 1.4, size: 4.5, color: '#ffd23f', kind: 'coin' });
    }
    if (n >= 3) this.text(x + 14, y - 10, '+' + fmt(value), '#ffe27a', false);
    sfx.coin();
  }
  orbDrop(x: number, y: number) {
    sfx.orb();
    for (let i = 0; i < 3; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: -120, g: 0, life: 1.2, max: 1.2, size: 9, color: '#b98cff', kind: 'coin', tx: this.W - 40, ty: -20 });
    game.toast('霊珠を手に入れた！', 'rare');
  }

  // ---------- draw ----------
  draw() {
    const g = this.g;
    const { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const key = `${areaDef(game.save.g).name}|${Math.round(W)}x${Math.round(H)}|${loopOf(game.save.g)}`;
    if (key !== this.bgKey) {
      this.bgKey = key;
      this.bg = paintBackground(areaDef(game.save.g).theme, W, H, Math.floor(game.save.g / 10) * 7 + 3, loopOf(game.save.g) * 47);
    }
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    g.save();
    g.translate(sx, sy);
    if (this.bg) g.drawImage(this.bg, -4, -4, W + 8, H + 8);

    // ground fx (rings, telegraphs)
    for (const p of this.parts) if (p.kind === 'ring' || p.kind === 'telegraph') this.drawPart(p);

    // entities by depth
    const ents: { y: number; f: () => void }[] = [];
    for (const m of this.mobs) ents.push({ y: m.y, f: () => this.drawMob(m) });
    if (this.boss) {
      const b = this.boss;
      ents.push({ y: b.y, f: () => this.drawMob(b) });
    }
    ents.push({ y: this.hero.y, f: () => this.drawHero() });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.f());

    for (const p of this.projs) this.drawProj(p);
    for (const p of this.parts) if (p.kind !== 'ring' && p.kind !== 'telegraph' && p.kind !== 'text') this.drawPart(p);
    for (const p of this.parts) if (p.kind === 'text') this.drawPart(p);
    g.restore();

    if (this.flash > 0) {
      g.globalAlpha = Math.min(0.7, this.flash * 0.6);
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (this.phase === 'down' || (this.phase === 'defeat' && this.hero.hp <= 0)) {
      g.fillStyle = 'rgba(40,20,30,0.25)';
      g.fillRect(0, 0, W, H);
    }
  }

  drawSprite(stem: string, x: number, y: number, w: number, h: number, flip: boolean, o: { alpha?: number; flash?: number; frozen?: boolean; squash?: number; hue?: number; glow?: string } = {}) {
    const g = this.g;
    const im = o.hue ? hueShift(stem, o.hue) : img(stem);
    if (!im) {
      // placeholder blob while loading
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.beginPath();
      g.ellipse(x, y - 4, w * 0.3, 6, 0, 0, Math.PI * 2);
      g.fill();
      return;
    }
    const sq = o.squash ?? 0;
    const dw = w * (1 + sq * 0.5);
    const dh = h * (1 - sq);
    g.save();
    g.globalAlpha = o.alpha ?? 1;
    g.translate(x, y);
    if (flip) g.scale(-1, 1);
    if (o.glow) {
      const sil = silhouette(stem, o.glow);
      if (sil) {
        g.globalAlpha = (o.alpha ?? 1) * 0.5;
        for (const [ox, oy] of [
          [-3, 0],
          [3, 0],
          [0, -3],
          [0, 2],
        ])
          g.drawImage(sil, -dw / 2 + ox, -dh + oy, dw, dh);
        g.globalAlpha = o.alpha ?? 1;
      }
    }
    g.drawImage(im, -dw / 2, -dh, dw, dh);
    if (o.flash && o.flash > 0) {
      const sil = silhouette(stem, '#ffffff');
      if (sil) {
        g.globalAlpha = Math.min(1, o.flash * 8) * (o.alpha ?? 1);
        g.drawImage(sil, -dw / 2, -dh, dw, dh);
      }
    }
    if (o.frozen) {
      const sil = silhouette(stem, '#8fd8ff');
      if (sil) {
        g.globalAlpha = 0.5 * (o.alpha ?? 1);
        g.drawImage(sil, -dw / 2, -dh, dw, dh);
      }
    }
    g.restore();
  }

  drawMob(m: Mob) {
    const g = this.g;
    let alpha = 1;
    let y = m.y;
    let squash = 0;
    let scale = 1;
    if (m.spawnT < 0.35) {
      const k = m.spawnT / 0.35;
      scale = 0.4 + 0.6 * easeOutBack(k);
      alpha = k;
    }
    if (m.dying) {
      alpha = Math.max(0, 1 - m.dying);
      y -= m.dying * 16;
    }
    // walk bob: squash anchored to the ground so the baked shadow stays put
    if (!m.dying && !m.frozen) squash = Math.sin(m.t * (m.aggro ? 12 : 6)) * (m.kind === 'mob' ? 0.04 : 0.025);
    let x = m.x;
    if (m.lunge > 0) x += -m.face * Math.sin((m.lunge / 0.18) * Math.PI) * 10 * this.u;
    const w = m.w * scale,
      h = m.h * scale;
    this.drawSprite(m.def.sprite, x, y, w, h, m.face === -1, { alpha, flash: m.flash, frozen: m.frozen > 0, squash, glow: m.kind === 'boss' ? 'rgba(255,90,60,0.9)' : undefined });
    // hp bar
    if (!m.dying && m.kind === 'mob' && m.hp < m.maxHp) {
      const bw = 34 * this.u;
      const bx = m.x - bw / 2;
      const by = m.y - m.h - 8;
      g.fillStyle = 'rgba(60,30,20,0.75)';
      roundRect(g, bx - 1.5, by - 1.5, bw + 3, 7, 3.5);
      g.fill();
      g.fillStyle = '#ff6b5b';
      roundRect(g, bx, by, bw * Math.max(0, m.hp / m.maxHp), 4, 2);
      g.fill();
    }
    // element pip
    if (!m.dying && m.kind === 'mob' && m.spawnT > 0.35) {
      g.fillStyle = ELEMENT_INFO[m.def.el].color;
      g.strokeStyle = 'rgba(80,40,30,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(m.x - 21 * this.u, m.y - m.h - 5, 3.2, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  drawHero() {
    const g = this.g;
    const h = this.hero;
    const hs = game.hero;
    const u = this.u;
    const sz = this.dispSize(hs.ally.sprite, 'hero');
    // guardians float behind
    const s = game.save;
    const slots = guardianSlotsUnlocked(s.maxG);
    const gs = s.guardianSlots.slice(0, slots).filter(Boolean) as string[];
    gs.slice(0, 3).forEach((k, i) => {
      const { id, shiny } = parseGuardianKey(k);
      const def = ALLY_BY_ID[id];
      const gsz = this.dispSize(def.sprite, 'guardian');
      const off = [
        [-38, -62],
        [-62, -30],
        [-14, -86],
      ][i];
      const bob = Math.sin(this.time * 2 + i * 2) * 4;
      const gx = h.x + off[0] * u * h.face;
      const gy = h.y + off[1] * u + bob;
      this.drawSprite(def.sprite, gx, gy, gsz.w, gsz.h, h.face === 1, { alpha: 0.45, hue: shiny ? 150 : 0, glow: shiny ? 'rgba(255,240,150,0.9)' : 'rgba(190,240,255,0.9)' });
      if (Math.random() < 0.05) this.parts.push({ x: gx + (Math.random() - 0.5) * 20, y: gy - Math.random() * gsz.h, vx: 0, vy: -20, g: 0, life: 0.8, max: 0.8, size: 2.5, color: shiny ? '#fff2a8' : '#d7f5ff', kind: 'wisp' });
    });

    let x = h.x;
    let y = h.y;
    let alpha = 1;
    if (this.phase === 'down' || h.hp <= 0) alpha = 0.35 + Math.sin(this.time * 10) * 0.1;
    if (h.lunge > 0) {
      const k = Math.sin((h.lunge / 0.18) * Math.PI);
      x += h.lungeDir.x * k * 16 * u;
      y += h.lungeDir.y * k * 6 * u;
    }
    const moving = this.phase === 'field' || this.phase === 'boss';
    const squash = moving ? Math.sin(this.time * 9) * 0.03 : Math.sin(this.time * 3) * 0.015;
    // aura
    if (h.atkBuffT > 0 || h.spdBuffT > 0) {
      const c = h.auraColor || '#ffd36b';
      const grd = g.createRadialGradient(h.x, h.y - sz.h * 0.4, 4, h.x, h.y - sz.h * 0.4, sz.h * 0.7);
      grd.addColorStop(0, c + '66');
      grd.addColorStop(1, c + '00');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(h.x, h.y - sz.h * 0.4, sz.w * 0.7, sz.h * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      if (Math.random() < 0.3) this.parts.push({ x: h.x + (Math.random() - 0.5) * sz.w, y: h.y - Math.random() * 10, vx: 0, vy: -60, g: 0, life: 0.6, max: 0.6, size: 3, color: c, kind: 'wisp' });
    }
    this.drawSprite(hs.ally.sprite, x, y, sz.w, sz.h, h.face === 1, { alpha, flash: h.hurt, squash, glow: h.casting > 0 ? ELEMENT_INFO[hs.ally.el].color : undefined });
    // shield bubble
    if (h.shield > 0) {
      g.save();
      g.globalAlpha = 0.35 + Math.sin(this.time * 6) * 0.08;
      g.strokeStyle = '#9fdcff';
      g.fillStyle = 'rgba(160,220,255,0.18)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(h.x, h.y - sz.h * 0.45, sz.w * 0.62, sz.h * 0.62, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
    }
    // hp bar under hero
    const bw = 46 * u;
    const bx = h.x - bw / 2;
    const by = h.y + 6;
    g.fillStyle = 'rgba(60,30,20,0.8)';
    roundRect(g, bx - 2, by - 2, bw + 4, 9, 4.5);
    g.fill();
    g.fillStyle = '#5fd36a';
    roundRect(g, bx, by, bw * Math.max(0, h.hp / h.maxHp), 5, 2.5);
    g.fill();
    if (h.shield > 0) {
      g.fillStyle = '#9fdcff';
      roundRect(g, bx, by, bw * Math.min(1, h.shield / h.maxHp), 2.5, 1.2);
      g.fill();
    }
  }

  drawProj(p: Proj) {
    const g = this.g;
    g.save();
    if (p.kind === 'arrow') {
      const a = Math.atan2(p.ty - p.y, p.tx - p.x);
      g.translate(p.x, p.y);
      g.rotate(a);
      g.strokeStyle = 'rgba(80,40,30,0.9)';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-16, 0);
      g.lineTo(6, 0);
      g.stroke();
      g.strokeStyle = p.color;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(10, 0);
      g.lineTo(3, -4);
      g.lineTo(3, 4);
      g.closePath();
      g.fill();
    } else {
      p.trail.forEach((t, i) => {
        g.globalAlpha = (i / p.trail.length) * 0.5;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(t.x, t.y, 3 + i * 0.7, 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
      const grd = g.createRadialGradient(p.x, p.y, 1, p.x, p.y, 14);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.35, p.color);
      grd.addColorStop(1, p.color + '00');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(p.x, p.y, 14, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  drawPart(p: Particle) {
    const g = this.g;
    const k = Math.max(0, p.life / p.max);
    g.save();
    switch (p.kind) {
      case 'dot':
        g.globalAlpha = k;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
        break;
      case 'star':
        g.globalAlpha = k;
        g.fillStyle = p.color;
        star(g, p.x, p.y, p.size * 1.6, p.size * 0.6);
        break;
      case 'wisp': {
        g.globalAlpha = k * 0.8;
        const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grd.addColorStop(0, p.color);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'coin':
        g.globalAlpha = Math.min(1, k * 2);
        g.fillStyle = p.color;
        g.strokeStyle = 'rgba(120,70,20,0.9)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(p.x, p.y, p.size * Math.abs(Math.cos(p.life * 10)) + 1, p.size, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        break;
      case 'ring': {
        const r = p.size * (1 - k * k * 0.8);
        g.globalAlpha = k;
        g.strokeStyle = p.color;
        g.lineWidth = 4 * k + 1;
        g.beginPath();
        g.ellipse(p.x, p.y, r, r * 0.42, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = k * 0.25;
        g.fillStyle = p.color;
        g.fill();
        break;
      }
      case 'telegraph': {
        const t = 1 - k;
        g.globalAlpha = 0.25 + Math.sin(t * 30) * 0.1;
        g.fillStyle = p.color;
        g.beginPath();
        g.ellipse(p.x, p.y, p.size, p.size * 0.42, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.9;
        g.strokeStyle = p.color;
        g.lineWidth = 3;
        g.stroke();
        g.beginPath();
        g.ellipse(p.x, p.y, p.size * t, p.size * 0.42 * t, 0, 0, Math.PI * 2);
        g.stroke();
        break;
      }
      case 'slash': {
        const t = 1 - k;
        g.translate(p.x, p.y);
        g.scale(p.a ?? 1, 1);
        g.rotate(p.extra ?? 0);
        g.globalAlpha = k;
        g.lineCap = 'round';
        g.strokeStyle = '#ffffff';
        g.lineWidth = 7 * k + 1;
        g.beginPath();
        g.arc(-p.size * 0.3, 0, p.size, -1.2 + t * 0.4, 0.9 + t * 0.4);
        g.stroke();
        g.strokeStyle = p.color;
        g.lineWidth = 3 * k + 1;
        g.stroke();
        break;
      }
      case 'bolt': {
        g.globalAlpha = k;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 5;
        g.lineJoin = 'round';
        g.beginPath();
        const x0 = p.tx ?? p.x;
        const y0 = p.ty ?? 0;
        g.moveTo(x0, y0);
        const segs = 7;
        for (let i = 1; i <= segs; i++) {
          const f = i / segs;
          g.lineTo(x0 + (p.x - x0) * f + (i < segs ? (Math.random() - 0.5) * 22 : 0), y0 + (p.y - y0) * f);
        }
        g.stroke();
        g.strokeStyle = p.color;
        g.lineWidth = 2.5;
        g.stroke();
        break;
      }
      case 'meteor': {
        const grd = g.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.size);
        grd.addColorStop(0, '#fffbe0');
        grd.addColorStop(0.4, p.color);
        grd.addColorStop(1, p.color + '00');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.5;
        g.strokeStyle = p.color;
        g.lineWidth = p.size * 0.8;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.12, p.y - p.vy * 0.12);
        g.stroke();
        break;
      }
      case 'text': {
        const t = 1 - k;
        const sc = p.extra ? 1 : t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (t - 0.12) * 0.6);
        g.globalAlpha = Math.min(1, k * 2.5);
        g.translate(p.x, p.y);
        g.scale(sc, sc);
        g.font = `800 ${p.size}px "M PLUS Rounded 1c", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = p.extra ? 5 : 4;
        g.strokeStyle = 'rgba(70,35,25,0.95)';
        g.strokeText(p.text!, 0, 0);
        g.fillStyle = p.color;
        g.fillText(p.text!, 0, 0);
        if (p.r) {
          g.font = `800 10px "M PLUS Rounded 1c", sans-serif`;
          g.lineWidth = 3;
          const lbl = p.r > 0 ? '弱点' : '耐性';
          g.strokeText(lbl, 0, -p.size * 0.85);
          g.fillStyle = p.r > 0 ? '#ffb347' : '#b6c3d4';
          g.fillText(lbl, 0, -p.size * 0.85);
        }
        break;
      }
    }
    g.restore();
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), h, Math.min(r, h / 2, Math.max(0, w) / 2));
}
function star(g: CanvasRenderingContext2D, x: number, y: number, R: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
