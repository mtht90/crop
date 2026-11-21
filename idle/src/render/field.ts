// The main-screen field: a real-time auto battle. The hero hunts roaming monsters, the kill gauge
// fills, the area boss appears; win → next stage, lose → keep farming this stage.
// Everything drawn here is an external image (see src/data/assets.ts): the battle background, the
// Librarium monsters, CraftPix effect sprite sheets / coins / crystals and Cozy UI pieces for bars.
import { ALLY_BY_ID, elementFactor, type EnemyDef, type Element } from '../data/monsters';
import { SKILL_BY_ID, skillLvMul, type SkillDef } from '../data/items';
import { areaDef, areaIndex, bossTime, enemyStats, fmt, isAreaBoss, killsNeeded, loopOf, parseGuardianKey, guardianSlotsUnlocked, type EnemyKind } from '../game/core';
import * as L from '../game/logic';
import { game } from '../game/store';
import { playMusic, sfx } from '../game/audio';
import { bgGround, bgUrl, fxSheet, hueShift, hueShifted, image, img, info, itemUrl, nine, preload, preloadFx, preloadUrls, silhouette, uiUrl } from './sprites';

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
  h: number;
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
  el: Element;
  kind: 'arrow' | 'spell';
  t: number;
}

/** a sprite-sheet animation playing once (or looping) at a spot */
interface Anim {
  fx: string;
  x: number;
  y: number;
  size: number; // display width
  t: number;
  dur: number;
  flip?: boolean;
  squash?: number; // vertical scale (ground rings)
  alpha?: number;
  rot?: number;
  loop?: number; // seconds to keep looping
  ground?: boolean; // drawn under the actors
  follow?: 'hero';
}
/** a small moving image (coin, star, smoke wisp) */
interface Bit {
  kind: 'coin' | 'star' | 'wisp' | 'orb' | 'gem';
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  home?: { x: number; y: number };
  t: number;
}
interface Txt {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
  label?: boolean; // skill name on a Cozy pill
}

export interface Banner {
  kind: 'boss' | 'areaBoss' | 'clear' | 'fail' | 'area' | 'down';
  title: string;
  sub: string;
  t: number;
}

const HERO_SPEED = 120;
const SLASH_FX: Record<Element, string> = { fire: 'slash_fire', water: 'slash_water', wind: 'slash_wind', earth: 'slash_earth', light: 'slash_light', dark: 'slash_dark' };
const INK = '#5a3328';
const OUTLINE = '#4a2418';

export class Field {
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  W = 400;
  H = 360;
  u = 1;
  dpr = 1;
  bgKey = '';
  phase: Phase = 'field';
  phaseT = 0;
  mobs: Mob[] = [];
  boss: Mob | null = null;
  bossTimer = 0;
  projs: Proj[] = [];
  anims: Anim[] = [];
  bits: Bit[] = [];
  texts: Txt[] = [];
  banner: Banner | null = null;
  shake = 0;
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
    auraEl: 'light' as Element,
    auraTick: 0,
    skillCd: [3, 5, 7] as number[],
    target: null as Mob | null,
    casting: 0,
    lastChar: '',
  };
  coinTarget = { x: 30, y: -20 };
  orbTarget = { x: 360, y: -20 };
  running = false;
  private raf = 0;
  private last = 0;
  private resizeObs: ResizeObserver;
  onHud: (() => void) | null = null;
  private timers: { at: number; fn: () => void }[] = [];

  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.g = cv.getContext('2d')!;
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(cv);
    this.resize();
    this.resetHero(true);
    this.preloadArea();
    preloadFx();
    preloadUrls(['SquareButton2_white.png', 'SquareButton2_red.png', 'SquareButton2_green.png', 'SquareButton2_blue.png', 'RoundButton2_white.png'].map(uiUrl));
    preloadUrls(['star', 'gem', 'orb', 'el_fire', 'el_water', 'el_wind', 'el_earth', 'el_light', 'el_dark'].map(itemUrl));
  }

  /** run fn after `delay` seconds of field time (respects game speed) */
  later(delay: number, fn: () => void) {
    this.timers.push({ at: this.time + delay, fn });
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
    const h = this.hero;
    h.x = clamp(h.x, 30, this.W - 30);
    h.y = clamp(h.y, this.minY(), this.maxY());
  }

  // background placement (cover-fit, anchored to the bottom)
  bgRect() {
    const s = Math.max(this.W / 1600, this.H / 900);
    const dw = 1600 * s,
      dh = 900 * s;
    return { x: (this.W - dw) / 2, y: this.H - dh, w: dw, h: dh };
  }
  top() {
    const r = this.bgRect();
    return Math.max(this.H * 0.2, r.y + r.h * bgGround(areaIndex(game.save.g)));
  }
  minY() {
    return this.top() + 26 * this.u;
  }
  maxY() {
    return this.H - 30 * this.u;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      for (let i = 0; i < game.save.settings.speed; i++) this.update(dt);
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
    preloadUrls([bgUrl(areaIndex(game.save.g)), bgUrl(areaIndex(game.save.g) + 1)]);
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
      h.y = (this.minY() + this.maxY()) / 2;
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
      this.fx('puff', h.x, h.y - 30 * this.u, 120);
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

  newMob(def: EnemyDef, kind: EnemyKind, x: number, y: number): Mob {
    const st = enemyStats(game.save.g, kind);
    const sz = this.dispSize(def.sprite, kind);
    const v = kind === 'mob' ? 0.9 + Math.random() * 0.2 : 1;
    return {
      def,
      kind,
      x,
      y,
      hp: st.hp * v,
      maxHp: st.hp * v,
      atk: st.atk,
      interval: st.interval * (kind === 'mob' ? 0.9 + Math.random() * 0.2 : 1),
      cd: kind === 'mob' ? 1 + Math.random() : 1.6,
      h: sz.h,
      w: sz.w,
      face: 1,
      t: Math.random() * 10,
      spawnT: 0,
      flash: 0,
      kbx: 0,
      kby: 0,
      frozen: 0,
      aggro: kind !== 'mob',
      wx: x,
      wy: y,
      wait: Math.random() * 2,
      dying: 0,
      lunge: 0,
      slamT: 5,
      slamX: 0,
      slamY: 0,
      slamCharge: 0,
    };
  }

  spawnMob() {
    const area = areaDef(game.save.g);
    const def = area.mobs[Math.floor(Math.random() * area.mobs.length)];
    let x = 0,
      y = 0;
    for (let i = 0; i < 10; i++) {
      x = 30 + Math.random() * (this.W - 60);
      y = this.minY() + Math.random() * (this.maxY() - this.minY());
      if (Math.hypot(x - this.hero.x, y - this.hero.y) > 120 * this.u) break;
    }
    const m = this.newMob(def, 'mob', x, y);
    m.face = x > this.hero.x ? 1 : -1;
    this.mobs.push(m);
    this.fx('puff', x, y - 20 * this.u, 90 * this.u, 0.5);
  }

  spawnBoss() {
    const s = game.save;
    const area = areaDef(s.g);
    const kind: EnemyKind = isAreaBoss(s.g) ? 'boss' : 'elite';
    const def = kind === 'boss' ? area.boss : area.elites[(s.g % 10) % area.elites.length];
    const sz = this.dispSize(def.sprite, kind);
    const y = Math.min(this.maxY(), Math.max((this.minY() + this.maxY()) / 2 + 30 * this.u, 112 + sz.h));
    this.boss = this.newMob(def, kind, this.W * 0.72, y);
    this.bossTimer = bossTime(s.g);
    this.fx('puff', this.boss.x, y - sz.h * 0.4, sz.w * 1.4, 0.6);
    this.shake = 10;
  }

  // ---------- phases ----------
  setPhase(p: Phase, t: number) {
    this.phase = p;
    this.phaseT = t;
    playMusic(p === 'boss' || p === 'bossIntro' ? 'boss' : 'field');
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
    this.banner = { kind: kind === 'boss' ? 'areaBoss' : 'boss', title: kind === 'boss' ? 'AREA BOSS' : 'STAGE BOSS', sub: def.name, t: 0 };
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

    if (this.phaseT > 0) {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.endPhase();
    }

    h.atkBuffT = Math.max(0, h.atkBuffT - dt);
    h.spdBuffT = Math.max(0, h.spdBuffT - dt);
    h.lunge = Math.max(0, h.lunge - dt);
    h.hurt = Math.max(0, h.hurt - dt);
    h.casting = Math.max(0, h.casting - dt);
    if (this.phase !== 'down' && h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * hs.regen * dt);
    if (h.atkBuffT > 0 || h.spdBuffT > 0) {
      h.auraTick -= dt;
      if (h.auraTick <= 0) {
        h.auraTick = 0.9;
        this.anims.push({ fx: 'nova_' + h.auraEl, x: h.x, y: h.y, size: 120 * this.u, t: 0, dur: 0.9, squash: 0.45, alpha: 0.55, ground: true, follow: 'hero' });
      }
    }

    if (this.phase === 'field') {
      this.spawnCd -= dt;
      const alive = this.mobs.filter((m) => !m.dying).length;
      if (alive < this.mobTarget() && this.spawnCd <= 0) {
        this.spawnMob();
        this.spawnCd = 0.45 + Math.random() * 0.4;
      }
      if (L.shouldAutoChallenge(game.save)) this.challengeBoss();
    }

    if (this.phase === 'boss' && this.boss) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) this.bossFail('時間切れ…');
    }

    if ((this.phase === 'field' || this.phase === 'boss') && h.hp > 0) this.heroBrain(dt);
    else if (this.phase === 'bossIntro') {
      this.moveHero(this.W * 0.3, (this.minY() + this.maxY()) / 2 + 30 * this.u, dt);
      h.face = 1;
    }

    for (const m of this.mobs) this.mobBrain(m, dt);
    if (this.boss) this.mobBrain(this.boss, dt);
    this.mobs = this.mobs.filter((m) => m.dying < 1);
    if (this.boss && this.boss.dying >= 1.4) this.boss = null;

    for (const p of this.projs) this.updateProj(p, dt);
    this.projs = this.projs.filter((p) => p.speed > 0);

    for (const a of this.anims) {
      a.t += dt;
      if (a.follow === 'hero') {
        a.x = h.x;
        a.y = h.y;
      }
    }
    this.anims = this.anims.filter((a) => a.t < (a.loop ?? a.dur));
    for (const b of this.bits) {
      b.life -= dt;
      b.t += dt;
      if (b.home && b.life < b.max * 0.6) {
        b.vx += (b.home.x - b.x) * dt * 7;
        b.vy += (b.home.y - b.y) * dt * 7;
        b.vx *= 0.9;
        b.vy *= 0.9;
      } else b.vy += b.g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.15, dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.bits.length > 260) this.bits.splice(0, this.bits.length - 260);
    if (this.anims.length > 140) this.anims.splice(0, this.anims.length - 140);
    if (this.texts.length > 60) this.texts.splice(0, this.texts.length - 60);
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
          this.banner = { kind: 'area', title: a.name + (lp ? ' ' + (['Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ'][lp - 1] ?? '+' + lp) : ''), sub: `AREA ${Math.floor(s.g / 10) + 1} · ${a.sub}`, t: 0 };
          this.hero.y = clamp(this.hero.y, this.minY(), this.maxY());
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
        this.fx('heal', this.hero.x, this.hero.y - 40 * this.u, 130 * this.u);
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
    this.banner = { kind: 'fail', title: 'RETREAT', sub: reason + '  このステージを周回して力を蓄えます', t: 0 };
    sfx.lose();
    this.setPhase('defeat', 2.4);
  }

  moveHero(tx: number, ty: number, dt: number, speedMul = 1) {
    const h = this.hero;
    const dx = tx - h.x;
    const dy = ty - h.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return;
    const k = Math.min(1, (HERO_SPEED * this.u * speedMul * dt) / d);
    h.x += dx * k;
    h.y += dy * k;
    if (Math.abs(dx) > 4) h.face = dx > 0 ? 1 : -1;
    h.x = clamp(h.x, 20, this.W - 20);
    h.y = clamp(h.y, this.minY(), this.maxY());
  }

  heroBrain(dt: number) {
    const h = this.hero;
    const hs = game.hero;
    const role = hs.ally.role;
    const range = hs.range * this.u;
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
    this.trySkills(dt, live);
    if (!t) {
      this.moveHero(this.W * 0.45, (this.minY() + this.maxY()) / 2, dt, 0.4);
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
      this.moveHero(h.x - dx * 0.5, h.y - dy * 0.5, dt, 0.7);
      h.face = dx > 0 ? 1 : -1;
    } else h.face = dx > 0 ? 1 : -1;
    h.cd -= dt;
    if (dist <= reach * 1.05 && h.cd <= 0) {
      h.cd = hs.interval / (1 + (h.spdBuffT > 0 ? h.spdBuff : 0));
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
    const u = this.u;
    switch (hs.ally.role) {
      case 'blade':
      case 'guard': {
        h.lunge = 0.18;
        const d = Math.hypot(t.x - h.x, t.y - h.y) || 1;
        h.lungeDir = { x: (t.x - h.x) / d, y: (t.y - h.y) / d };
        this.damage(t, 1, { kb: hs.ally.role === 'guard' ? 26 : 10 });
        const cleave = hs.ally.role === 'blade' ? 0.35 : 0.2;
        for (const m of this.mobs) {
          if (m === t || m.dying) continue;
          if (Math.hypot(m.x - t.x, m.y - t.y) < 55 * u) this.damage(m, cleave, { kb: 6, quiet: true });
        }
        this.anims.push({ fx: SLASH_FX[el], x: t.x, y: t.y - t.h * 0.45, size: 150 * u, t: 0, dur: 0.3, flip: h.face < 0 });
        break;
      }
      case 'archer':
        h.lunge = 0.1;
        h.lungeDir = { x: -h.face, y: 0 };
        this.projs.push({ x: h.x + h.face * 20 * u, y: h.y - 40 * u, tx: t.x, ty: t.y - t.h * 0.45, target: t, speed: 620 * u, dmgMul: 1, splash: 0, el, kind: 'arrow', t: 0 });
        sfx.shoot();
        break;
      case 'mage':
        h.casting = 0.25;
        this.projs.push({ x: h.x + h.face * 16 * u, y: h.y - 58 * u, tx: t.x, ty: t.y - t.h * 0.45, target: t, speed: 330 * u, dmgMul: 1, splash: 70 * u, el, kind: 'spell', t: 0 });
        sfx.shoot();
        break;
    }
  }

  updateProj(p: Proj, dt: number) {
    p.t += dt;
    if (p.target && !p.target.dying) {
      p.tx = p.target.x;
      p.ty = p.target.y - p.target.h * 0.45;
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
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
        this.fx('nova_' + p.el, p.tx, p.ty + 14 * this.u, p.splash * 2.2, 0.45, { squash: 0.5 });
      } else if (p.target && !p.target.dying) this.damage(p.target, p.dmgMul, { kb: 6 });
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
    const color = crit ? '#ffd34d' : ef > 1 ? '#ffb070' : ef < 1 ? '#c9d3e0' : '#ffffff';
    if (!o.quiet || crit) this.text(m.x + (Math.random() - 0.5) * 20, m.y - m.h - 4, fmt(dmg) + (crit ? '!' : ''), color, crit || ef > 1 ? 20 : 15);
    if (crit) {
      sfx.crit();
      this.fx('crit', m.x, m.y - m.h * 0.5, 110 * this.u, 0.4);
    } else {
      if (!o.quiet) sfx.hit();
      this.fx('hit', m.x + (Math.random() - 0.5) * 14, m.y - m.h * 0.5, 60 * this.u, 0.3);
    }
    if (m.hp <= 0) this.kill(m);
    return dmg;
  }

  kill(m: Mob) {
    m.hp = 0;
    m.dying = 0.001;
    sfx.kill();
    this.fx('smoke', m.x, m.y - m.h * 0.35, Math.max(80 * this.u, m.w * 1.1), 0.6, { alpha: 0.85 });
    for (let i = 0; i < 6; i++) this.bits.push({ kind: 'wisp', x: m.x + (Math.random() - 0.5) * m.w * 0.6, y: m.y - Math.random() * m.h, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 50, g: -10, life: 0.9 + Math.random() * 0.5, max: 1.4, size: 14 + Math.random() * 10, t: 0 });
    const s = game.save;
    if (this.hero.target === m) this.hero.target = null;
    if (m.kind === 'mob') {
      const rew = L.rewardKill(s, game.hero, 'mob', Math.random);
      this.coins(m.x, m.y - m.h * 0.5, 3, rew.coins);
      if (rew.orb) this.orbDrop(m.x, m.y - m.h * 0.5);
      if (rew.gems) this.bits.push({ kind: 'gem', x: m.x, y: m.y - m.h, vx: 0, vy: -90, g: 0, life: 1.3, max: 1.3, size: 22, t: 0, home: { x: this.coinTarget.x + 120, y: this.coinTarget.y } });
      game.changed();
    } else {
      const rew = L.rewardKill(s, game.hero, m.kind, Math.random);
      this.coins(m.x, m.y - m.h * 0.5, 16, rew.coins);
      if (rew.orb) this.orbDrop(m.x, m.y - m.h * 0.5);
      this.shake = 16;
      sfx.boom();
      sfx.win();
      this.fx('blast', m.x, m.y, m.w * 2.2, 0.8);
      this.fx('crit', m.x, m.y - m.h * 0.5, m.w * 1.6, 0.6);
      for (let i = 0; i < 18; i++) this.star(m.x, m.y - m.h * 0.5, 320);
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
    }
    h.hp -= dmg;
    h.hurt = 0.15;
    if (dmg > 0) {
      this.text(h.x + (Math.random() - 0.5) * 16, h.y - 90 * this.u, fmt(dmg), '#ff8a7a', 14);
      sfx.hurt();
    }
    if (src.kind !== 'mob') this.shake = Math.max(this.shake, 5);
    if (h.hp <= 0) {
      h.hp = 0;
      this.fx('smoke', h.x, h.y - 30 * this.u, 110 * this.u, 0.6);
      if (this.phase === 'boss') this.bossFail('力尽きた…');
      else {
        this.banner = { kind: 'down', title: 'REST', sub: 'ひと休み… すぐに起き上がります', t: 0 };
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
    m.x += m.kbx * dt;
    m.y += m.kby * dt;
    m.kbx *= Math.pow(0.002, dt);
    m.kby *= Math.pow(0.002, dt);
    const isBoss = m.kind !== 'mob';
    m.x = clamp(m.x, 20 + (isBoss ? m.w * 0.3 : 0), this.W - 20 - (isBoss ? m.w * 0.3 : 0));
    m.y = clamp(m.y, isBoss ? Math.min(this.maxY(), Math.max(this.minY(), 112 + m.h)) : this.minY(), this.maxY());
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
    const contact = (isBoss ? m.w * 0.42 : 34 * this.u) + 14 * this.u;
    const sp = (isBoss ? 50 : m.aggro ? 62 : 22) * this.u;

    if (isBoss && this.phase === 'boss') {
      m.slamT -= dt;
      if (m.slamCharge > 0) {
        m.slamCharge -= dt;
        if (m.slamCharge <= 0) {
          m.lunge = 0.3;
          this.shake = 12;
          sfx.boom();
          this.fx('blast', m.slamX, m.slamY + 10 * this.u, 230 * this.u, 0.7);
          if (Math.hypot(h.x - m.slamX, (h.y - m.slamY) * 1.4) < 95 * this.u) this.heroHurt(m.atk * 2, m);
        }
        return;
      }
      if (m.slamT <= 0 && heroAlive) {
        m.slamT = 8;
        m.slamCharge = 1.1;
        m.slamX = h.x;
        m.slamY = h.y;
        this.anims.push({ fx: 'ring', x: h.x, y: h.y, size: 230 * this.u, t: 0, dur: 0.55, squash: 0.55, loop: 1.1, ground: true });
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
      m.wait -= dt;
      if (m.wait <= 0) {
        const wdx = m.wx - m.x;
        const wdy = m.wy - m.y;
        const wd = Math.hypot(wdx, wdy);
        if (wd < 4) {
          m.wait = 1 + Math.random() * 2.5;
          m.wx = clamp(m.x + (Math.random() - 0.5) * 160, 30, this.W - 30);
          m.wy = clamp(m.y + (Math.random() - 0.5) * 90, this.minY(), this.maxY());
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
      if (!this.skillUseful(def, live)) continue;
      h.skillCd[i] = def.cd;
      this.castSkill(def, s.skills[id]?.lv ?? 1, live);
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
    const u = this.u;
    const el = def.el;
    h.casting = 0.35;
    sfx.skill();
    this.texts.push({ x: h.x, y: h.y - 118 * u, vy: -16, life: 1.3, max: 1.3, text: def.name, color: INK, size: 14, label: true });
    const nearest = () => live.filter((x) => !x.dying).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0] ?? null;
    switch (def.kind) {
      case 'strike': {
        const t = h.target ?? nearest();
        if (!t) break;
        h.lunge = 0.25;
        this.anims.push({ fx: SLASH_FX[el], x: t.x, y: t.y - t.h * 0.45, size: 230 * u, t: 0, dur: 0.35, flip: h.face < 0 });
        this.damage(t, def.power * m, { kb: 30, skill: true, el });
        this.shake = 6;
        break;
      }
      case 'nova': {
        const R = (def.radius ?? 100) * u;
        this.fx('nova_' + el, h.x, h.y, R * 2.4, 0.55, { squash: 0.55, ground: true });
        this.fx('crit', h.x, h.y - 40 * u, 140 * u, 0.4);
        for (const t of [...live]) if (Math.hypot(t.x - h.x, (t.y - h.y) * 1.3) < R + t.w * 0.3) this.damage(t, def.power * m, { kb: 24, skill: true, el });
        if (def.heal) this.heal(def.heal * m);
        this.shake = 7;
        break;
      }
      case 'bolt': {
        const n = def.hits ?? 1;
        for (let i = 0; i < n; i++) {
          this.later(i * 0.07, () => {
            const pool = this.boss && !this.boss.dying ? [this.boss] : this.mobs.filter((x) => !x.dying && x.spawnT > 0.3);
            if (!pool.length) return;
            const t = pool[Math.floor(Math.random() * pool.length)];
            this.fx(el === 'light' ? 'lightning' : SLASH_FX[el], t.x, t.y - t.h * 0.5, 130 * u, 0.3, { rot: Math.random() * 6.28 });
            if (el === 'light') this.fx('spark', t.x, t.y - t.h * 0.3, 90 * u, 0.4);
            this.damage(t, def.power * m, { kb: 8, skill: true, el, quiet: n > 6 });
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
        this.fx('dome', h.x, h.y - 30 * u, 150 * u, 0.6);
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
        h.auraEl = el;
        h.auraTick = 0;
        this.fx('nova_' + el, h.x, h.y, 200 * u, 0.5, { squash: 0.5, ground: true });
        break;
      case 'freeze': {
        const R = (def.radius ?? 100) * u;
        this.fx('frost', h.x, h.y - 20 * u, Math.min(R * 2.2, this.W * 1.2), 0.6);
        for (const t of [...live]) {
          if (Math.hypot(t.x - h.x, (t.y - h.y) * 1.3) < R + t.w * 0.3) {
            t.frozen = (def.dur ?? 2) * (t.kind === 'mob' ? 1 : 0.5);
            this.damage(t, def.power * m, { skill: true, el });
            this.fx('frost', t.x, t.y - t.h * 0.5, t.w * 1.4, 0.5);
          }
        }
        if (def.atkBuff) {
          h.atkBuff = def.atkBuff * m;
          h.atkBuffT = def.dur ?? 4;
          h.auraEl = el;
          h.auraTick = 0;
        }
        break;
      }
      case 'drain': {
        const t = h.target ?? nearest();
        if (!t) break;
        h.lunge = 0.25;
        this.anims.push({ fx: SLASH_FX[el], x: t.x, y: t.y - t.h * 0.45, size: 210 * u, t: 0, dur: 0.35, flip: h.face < 0 });
        const d = this.damage(t, def.power * m, { kb: 14, skill: true, el });
        this.heal(0, d * (def.heal ?? 0));
        for (let i = 0; i < 8; i++) this.bits.push({ kind: 'wisp', x: t.x, y: t.y - t.h * 0.5, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, g: 0, life: 0.7, max: 0.7, size: 16, t: 0, home: { x: h.x, y: h.y - 40 * u } });
        break;
      }
      case 'meteor': {
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
        const sx = tx + 160 * u,
          sy = -40;
        this.projs.push({ x: sx, y: sy, tx, ty, target: null, speed: Math.hypot(tx - sx, ty - sy) / 0.5, dmgMul: 0, splash: 0, el: el === 'light' ? 'light' : 'fire', kind: 'spell', t: 0 });
        this.later(0.5, () => {
          const R = (def.radius ?? 90) * u;
          this.fx('blast', tx, ty + 10 * u, R * 3, 0.7);
          this.fx('crit', tx, ty - 20 * u, R * 1.6, 0.4);
          this.shake = 14;
          sfx.boom();
          const pool = this.boss && !this.boss.dying ? [this.boss] : this.mobs;
          for (const t of [...pool]) if (!t.dying && Math.hypot(t.x - tx, (t.y - ty) * 1.3) < R + t.w * 0.3) this.damage(t, def.power * m, { kb: 30, skill: true, el });
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
    this.text(h.x, h.y - 96 * this.u, '+' + fmt(amt), '#7dffa0', 15);
    this.fx('heal', h.x, h.y - 30 * this.u, 140 * this.u, 0.7);
  }

  // ---------- fx helpers ----------
  fx(name: string, x: number, y: number, size: number, dur = 0.5, o: Partial<Anim> = {}) {
    this.anims.push({ fx: name, x, y, size, t: 0, dur, ...o });
  }
  star(x: number, y: number, sp: number) {
    const a = Math.random() * Math.PI * 2;
    const v = sp * (0.4 + Math.random() * 0.6) * this.u;
    this.bits.push({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 260, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 10 + Math.random() * 8, t: 0 });
  }
  text(x: number, y: number, text: string, color: string, size: number) {
    this.texts.push({ x, y, vy: -60, life: 0.85, max: 0.85, text, color, size });
  }
  coins(x: number, y: number, n: number, value: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const v = 90 + Math.random() * 80;
      this.bits.push({ kind: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, life: 1.1 + Math.random() * 0.3, max: 1.4, size: 16, t: Math.random(), home: this.coinTarget });
    }
    if (n >= 3) this.text(x + 14, y - 10, '+' + fmt(value), '#ffe27a', 12);
    sfx.coin();
  }
  orbDrop(x: number, y: number) {
    sfx.orb();
    this.bits.push({ kind: 'orb', x, y, vx: (Math.random() - 0.5) * 80, vy: -140, g: 0, life: 1.3, max: 1.3, size: 26, t: 0, home: this.orbTarget });
    game.toast('霊珠を手に入れた！', 'rare');
  }

  // ---------- draw ----------
  draw() {
    const g = this.g;
    const { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    g.save();
    g.translate(sx, sy);
    const ai = areaIndex(game.save.g);
    const lp = loopOf(game.save.g);
    const bg = lp ? hueShifted(bgUrl(ai), lp * 47) : image(bgUrl(ai));
    if (bg) {
      const r = this.bgRect();
      g.drawImage(bg, r.x - 6, r.y - 6, r.w + 12, r.h + 12);
    }

    for (const a of this.anims) if (a.ground) this.drawAnim(a);

    const ents: { y: number; f: () => void }[] = [];
    for (const m of this.mobs) ents.push({ y: m.y, f: () => this.drawMob(m) });
    if (this.boss) {
      const b = this.boss;
      ents.push({ y: b.y, f: () => this.drawMob(b) });
    }
    ents.push({ y: this.hero.y, f: () => this.drawHero() });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.f());

    for (const p of this.projs) this.drawProj(p);
    for (const a of this.anims) if (!a.ground) this.drawAnim(a);
    for (const b of this.bits) this.drawBit(b);
    for (const t of this.texts) this.drawText(t);
    g.restore();
  }

  drawAnim(a: Anim) {
    const sh = fxSheet(a.fx);
    if (!sh) return;
    const { n, w, h } = sh.info;
    const f = Math.min(n - 1, Math.floor(((a.t % a.dur) / a.dur) * n));
    const dw = a.size;
    const dh = (a.size * h) / w;
    const g = this.g;
    g.save();
    g.globalAlpha = a.alpha ?? 1;
    g.translate(a.x, a.y);
    if (a.rot) g.rotate(a.rot);
    g.scale(a.flip ? -1 : 1, a.squash ?? 1);
    g.drawImage(sh.im, f * w, 0, w, h, -dw / 2, -dh / 2, dw, dh);
    g.restore();
  }

  drawBit(b: Bit) {
    const g = this.g;
    const k = Math.max(0, b.life / b.max);
    g.save();
    g.globalAlpha = b.kind === 'wisp' ? k * 0.7 : Math.min(1, k * 2);
    if (b.kind === 'coin') {
      const sh = fxSheet('coin');
      if (sh) {
        const f = Math.floor(b.t * 18) % sh.info.n;
        g.drawImage(sh.im, f * sh.info.w, 0, sh.info.w, sh.info.h, b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
      }
    } else if (b.kind === 'wisp') {
      const sh = fxSheet('smoke');
      if (sh) g.drawImage(sh.im, 0, 0, sh.info.w, sh.info.h, b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
    } else {
      const im = image(itemUrl(b.kind));
      if (im) {
        g.translate(b.x, b.y);
        if (b.kind === 'star') g.rotate(b.t * 6);
        g.drawImage(im, -b.size / 2, -b.size / 2, b.size, b.size);
      }
    }
    g.restore();
  }

  drawText(t: Txt) {
    const g = this.g;
    const k = Math.max(0, t.life / t.max);
    g.save();
    g.globalAlpha = Math.min(1, k * 2.5);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (t.label) {
      // skill name on a Cozy pill
      g.font = `800 ${t.size}px "M PLUS Rounded 1c", sans-serif`;
      const w = g.measureText(t.text).width + 30;
      const h = t.size + 16;
      const pill = image(uiUrl('RoundButton2_white.png'));
      if (pill) nine(g, pill, t.x - w / 2, t.y - h / 2, w, h, [40, 80, 60, 80], [6, 12, 9, 12]);
      g.fillStyle = t.color;
      g.fillText(t.text, t.x, t.y - 1);
    } else {
      // Bungee (fill) + Bungee Outline layered: an outlined number made only from the two fonts
      const age = 1 - k;
      const sc = age < 0.12 ? 0.6 + (age / 0.12) * 0.6 : 1.2 - Math.min(0.2, (age - 0.12) * 0.6);
      g.translate(t.x, t.y);
      g.scale(sc, sc);
      g.font = `${t.size}px "Bungee", sans-serif`;
      g.fillStyle = t.color;
      g.fillText(t.text, 0, 0);
      g.font = `${t.size}px "Bungee Outline", sans-serif`;
      g.fillStyle = OUTLINE;
      g.fillText(t.text, 0, 0);
    }
    g.restore();
  }

  drawSprite(stem: string, x: number, y: number, w: number, h: number, flip: boolean, o: { alpha?: number; flash?: number; frozen?: boolean; squash?: number; hue?: number; glow?: string } = {}) {
    const g = this.g;
    const im = o.hue ? hueShift(stem, o.hue) : img(stem);
    if (!im) return;
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

  /** a small Cozy-UI bar (track = white button, fill = colored button) */
  bar(x: number, y: number, w: number, h: number, frac: number, fill: string) {
    const track = image(uiUrl('SquareButton2_white.png'));
    const f = image(uiUrl(fill));
    const s: [number, number, number, number] = [40, 42, 58, 42];
    const d: [number, number, number, number] = [2.5, 3, 3.5, 3];
    if (track) nine(this.g, track, x, y, w, h, s, d);
    const fw = w * clamp(frac, 0, 1);
    if (f && fw > 4) nine(this.g, f, x, y, fw, h, s, d);
  }

  drawMob(m: Mob) {
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
    if (!m.dying && !m.frozen) squash = Math.sin(m.t * (m.aggro ? 12 : 6)) * (m.kind === 'mob' ? 0.04 : 0.025);
    let x = m.x;
    if (m.lunge > 0) x += -m.face * Math.sin((m.lunge / 0.18) * Math.PI) * 10 * this.u;
    this.drawSprite(m.def.sprite, x, y, m.w * scale, m.h * scale, m.face === -1, { alpha, flash: m.flash, frozen: m.frozen > 0, squash, glow: m.kind === 'boss' ? 'rgba(255,90,60,0.9)' : undefined });
    if (!m.dying && m.kind === 'mob' && m.spawnT > 0.35) {
      const bw = 34 * this.u;
      if (m.hp < m.maxHp) this.bar(m.x - bw / 2 + 6, m.y - m.h - 10, bw, 8, m.hp / m.maxHp, 'SquareButton2_red.png');
      const el = image(itemUrl('el_' + m.def.el));
      if (el) this.g.drawImage(el, m.x - bw / 2 - 9, m.y - m.h - 13, 13, 13);
    }
  }

  drawHero() {
    const h = this.hero;
    const hs = game.hero;
    const u = this.u;
    const sz = this.dispSize(hs.ally.sprite, 'hero');
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
      if (Math.random() < 0.04) this.bits.push({ kind: 'wisp', x: gx + (Math.random() - 0.5) * 20, y: gy - Math.random() * gsz.h, vx: 0, vy: -20, g: 0, life: 0.8, max: 0.8, size: 10, t: 0 });
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
    this.drawSprite(hs.ally.sprite, x, y, sz.w, sz.h, h.face === 1, { alpha, flash: h.hurt, squash, glow: h.casting > 0 ? 'rgba(255,240,180,0.95)' : undefined });
    if (h.shield > 0) {
      const sh = fxSheet('bubble');
      if (sh) {
        const g = this.g;
        const f = Math.floor(this.time * 10) % sh.info.n;
        const d = Math.max(sz.w, sz.h) * 1.25;
        g.save();
        g.globalAlpha = 0.55;
        g.drawImage(sh.im, f * sh.info.w, 0, sh.info.w, sh.info.h, h.x - d / 2, h.y - sz.h * 0.5 - d / 2, d, d);
        g.restore();
      }
    }
    const bw = 46 * u;
    this.bar(h.x - bw / 2, h.y + 4, bw, 9, h.hp / h.maxHp, 'SquareButton2_green.png');
    if (h.shield > 0) this.bar(h.x - bw / 2, h.y + 12, bw * Math.min(1, h.shield / h.maxHp), 6, 1, 'SquareButton2_blue.png');
  }

  drawProj(p: Proj) {
    const sh = fxSheet((p.kind === 'arrow' ? 'arrow_' : 'spell_') + p.el);
    if (!sh) return;
    const g = this.g;
    const { n, w, h } = sh.info;
    const f = Math.floor(p.t * 16) % n;
    const a = Math.atan2(p.ty - p.y, p.tx - p.x);
    const dw = (p.kind === 'arrow' ? 64 : p.dmgMul === 0 ? 150 : 76) * this.u;
    const dh = (dw * h) / w;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(a + Math.PI); // the CraftPix projectiles point left
    g.drawImage(sh.im, f * w, 0, w, h, -dw / 2, -dh / 2, dw, dh);
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
