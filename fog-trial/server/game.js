// 権威サーバー側のゲームシミュレーション。
// ネットワークから切り離した純粋なロジックなので、テストからも直接動かせる。

import {
  TICK_DT,
  RADIUS,
  SPEED,
  VISION,
  KILLER,
  SURVIVOR,
  GEN,
  SKILL,
  ENDGAME,
  INTERACT_RANGE,
  HEALTH,
  BTN,
  MAX_SURVIVORS,
} from '../shared/constants.js';
import { generateMap, mulberry32 } from '../shared/map.js';
import { CollisionGrid, moveCircle, resolveCircle, inputDir, canSee, angleDiff, lineOfSight } from '../shared/physics.js';
import { perk, SURVIVOR_CHARACTERS } from '../shared/characters.js';

const ACTIVE_STATES = new Set([HEALTH.HEALTHY, HEALTH.INJURED, HEALTH.DOWNED, HEALTH.CARRIED, HEALTH.CAGED]);
// 移動できない (サーバーが位置を決める) アクション
const LOCKING = new Set([
  'vault',
  'pallet_drop',
  'pallet_vault',
  'locker_enter',
  'locker_exit',
  'unhook',
  'pickup',
  'hook',
  'break_pallet',
  'kick_gen',
  'search_locker',
  'close_hatch',
  'stunned',
  'hatch_jump',
]);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (p) => ({ x: p.x + 0.5, y: p.y + 0.5 });

export class Game {
  /**
   * @param {{id:string,name:string,role:'killer'|'survivor',character?:string,bot?:boolean}[]} roster
   */
  constructor(roster, opts = {}) {
    this.seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.rng = mulberry32(this.seed ^ 0x5bd1e995);
    this.map = generateMap(this.seed);
    this.grid = new CollisionGrid(this.map);
    this.time = 0;
    this.tick = 0;
    this.over = false;
    this.result = null;
    this.events = []; // { to: 'all'|'killer'|'survivors'|id, ... }
    this.prints = []; // 足あと・毛玉 (キラーだけが見える)
    this.noises = []; // 物音の通知 (キラー向け)
    this.reveals = []; // 咆哮によるオーラ表示
    this.nextSkillId = 1;

    this.pallets = this.map.pallets.map((p) => ({ ...p, state: 'up' }));
    this.windows = this.map.windows.map((w) => ({ ...w }));
    this.gens = this.map.gens.map((g) => ({ ...g, progress: 0, done: false, regressing: false, workers: 0, lastNoise: 0 }));
    this.cages = this.map.cages.map((c) => ({ ...c, occupant: null, broken: false }));
    this.lockers = this.map.lockers.map((l) => ({ ...l, occupant: null }));
    this.gates = this.map.gates.map((g) => ({ ...g, powered: false, progress: 0, open: false }));
    this.hatch = null; // { x, y, open }
    this.collapse = null; // { endsAt }

    this.players = new Map();
    let si = 0;
    const survivorCount = roster.filter((r) => r.role === 'survivor').length;
    this.gensRequired = Math.max(2, Math.min(GEN.count - 3, survivorCount));
    for (const r of roster) {
      const isKiller = r.role === 'killer';
      const spawn = isKiller ? this.map.spawns.killer : this.map.spawns.survivors[si++ % MAX_SURVIVORS];
      const p = {
        id: r.id,
        name: r.name,
        role: r.role,
        character: isKiller ? 'skeleton' : r.character || 'barbarian',
        bot: !!r.bot,
        x: spawn.x,
        y: spawn.y,
        angle: isKiller ? 0 : Math.atan2(this.map.spawns.killer.y - spawn.y, this.map.spawns.killer.x - spawn.x) + Math.PI,
        vx: 0,
        vy: 0,
        inputs: [],
        lastSeq: 0,
        buttons: 0,
        prevButtons: 0,
        action: null,
        stats: { gens: 0, heals: 0, rescues: 0, hits: 0, hooks: 0, stuns: 0, escapes: 0 },
      };
      if (isKiller) {
        Object.assign(p, {
          carrying: null,
          dashCd: 0,
          howlCd: 10,
          charge: 0,
        });
      } else {
        Object.assign(p, {
          health: HEALTH.HEALTHY,
          hookCount: 0,
          hookStage: 0,
          hookTimer: 0,
          selfUnhookLeft: SURVIVOR.selfUnhookAttempts,
          healProgress: 0,
          bleed: SURVIVOR.bleedout,
          hasteUntil: 0,
          enduranceUntil: 0,
          wiggle: 0,
          wiggleLast: 0,
          hidden: null,
          cage: null,
          skill: null,
          stallUntil: 0,
          interactLock: false,
          printT: 0,
          furT: 0,
          groanT: 0,
          outcome: null,
        });
      }
      this.players.set(p.id, p);
    }
    this.event('all', { kind: 'toast', text: `発電機を ${this.gensRequired} 台修理して脱出せよ`, tone: 'info' });
  }

  get killer() {
    for (const p of this.players.values()) if (p.role === 'killer') return p;
    return null;
  }

  survivors() {
    return [...this.players.values()].filter((p) => p.role === 'survivor');
  }

  activeSurvivors() {
    return this.survivors().filter((p) => ACTIVE_STATES.has(p.health));
  }

  gensDone() {
    return this.gens.filter((g) => g.done).length;
  }

  event(to, e) {
    this.events.push({ to, t: this.time, ...e });
  }

  noise(x, y, kind) {
    this.noises.push({ x, y, kind, t: this.time });
  }

  queueInput(id, cmd) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.inputs.length > 8) p.inputs.shift();
    p.inputs.push(cmd);
  }

  // ==================== メインループ ====================
  update() {
    if (this.over) return;
    const dt = TICK_DT;
    this.time += dt;
    this.tick++;

    for (const p of this.players.values()) {
      // 遅延で溜まった入力は 1 tick に最大 3 つまで処理して追いつく
      const n = Math.min(p.inputs.length, p.inputs.length > 2 ? 3 : 1);
      if (n === 0) {
        this.stepPlayer(p, { seq: p.lastSeq, buttons: p.buttons & ~(BTN.ACTION | BTN.ATTACK | BTN.HOWL), aim: p.angle, idle: true }, dt);
      }
      for (let i = 0; i < n; i++) {
        const cmd = p.inputs.shift();
        this.stepPlayer(p, cmd, dt);
        p.lastSeq = cmd.seq;
      }
    }

    this.updateGens(dt);
    this.updateSurvivorTimers(dt);
    this.updateKillerTimers(dt);
    this.updateEndgame(dt);

    const cutoff = this.time - SURVIVOR.furLife;
    if (this.prints.length && this.prints[0].t < cutoff) this.prints = this.prints.filter((pr) => pr.t >= this.time - pr.life);
    this.noises = this.noises.filter((n) => this.time - n.t < 3);
    this.reveals = this.reveals.filter((r) => r.until > this.time);
    this.checkEnd();
  }

  stepPlayer(p, cmd, dt) {
    const pressed = cmd.buttons & ~p.buttons;
    p.prevButtons = p.buttons;
    p.buttons = cmd.idle ? p.buttons & ~(BTN.ACTION | BTN.ATTACK | BTN.HOWL) : cmd.buttons;
    const edge = cmd.idle ? 0 : pressed | (cmd.pressed || 0);
    if (typeof cmd.aim === 'number' && Number.isFinite(cmd.aim)) p.aim = cmd.aim;
    // 入力が届かなかった tick は動かさない (クライアント予測とずれないように)
    p.idle = !!cmd.idle;
    // ボットはアナログ入力 (正規化済みの移動ベクトル) を使える
    p.move = null;
    if (cmd.move && Number.isFinite(cmd.move.x) && Number.isFinite(cmd.move.y)) {
      const l = Math.hypot(cmd.move.x, cmd.move.y);
      if (l > 0.01) p.move = { x: cmd.move.x / l, y: cmd.move.y / l };
    }
    if (p.role === 'killer') this.stepKiller(p, cmd, edge, dt);
    else this.stepSurvivor(p, cmd, edge, dt);
  }

  // ==================== サバイバー ====================
  survivorSpeed(p) {
    if (p.health === HEALTH.DOWNED) return SPEED.survivorCrawl;
    let s = p.buttons & BTN.SNEAK ? SPEED.survivorSneak * perk(p.character, 'sneak') : SPEED.survivorRun;
    if (p.hasteUntil > this.time) s *= SPEED.hasteMul;
    return s;
  }

  stepSurvivor(p, cmd, edge, dt) {
    const h = p.health;
    if (h === HEALTH.ESCAPED || h === HEALTH.DEAD) return;

    if (h === HEALTH.CARRIED) {
      // 左右交互入力でもがく
      if (edge & BTN.LEFT && p.wiggleLast !== -1) {
        p.wiggle += SURVIVOR.wiggleStep;
        p.wiggleLast = -1;
      } else if (edge & BTN.RIGHT && p.wiggleLast !== 1) {
        p.wiggle += SURVIVOR.wiggleStep;
        p.wiggleLast = 1;
      }
      return;
    }

    if (h === HEALTH.CAGED) {
      if (edge & BTN.ACTION && p.hookStage === 1 && p.selfUnhookLeft > 0 && !p.action) {
        p.selfUnhookLeft--;
        if (this.rng() < SURVIVOR.selfUnhookChance) {
          this.event('all', { kind: 'toast', text: `${p.name} が自力でフックから脱出した!`, tone: 'good' });
          this.releaseFromCage(p, null);
        } else {
          p.hookTimer -= SURVIVOR.hookStage1 * SURVIVOR.selfUnhookPenalty;
          this.event(p.id, { kind: 'toast', text: '脱出に失敗した…', tone: 'bad' });
        }
      }
      return;
    }

    if (p.hidden !== null && !p.action) {
      // ロッカー内。E か移動キーで出る
      if (edge & (BTN.INTERACT | BTN.ACTION)) this.startLockerExit(p);
      return;
    }

    if (p.action && LOCKING.has(p.action.type)) {
      this.advanceLockedAction(p);
      return;
    }

    if (p.aim !== undefined) p.angle = p.aim;

    // E は一度離すまで次の作業を始めない (被弾・完了直後に勝手に再開しないように)
    if (!(p.buttons & BTN.INTERACT)) p.interactLock = false;

    if (h !== HEALTH.DOWNED) {
      if (edge & BTN.INTERACT && this.tryInstantInteract(p)) return;
      // 継続アクション (E 長押し)
      if (p.buttons & BTN.INTERACT && !p.interactLock) {
        if (this.continueInteract(p, dt)) {
          p.vx = p.vy = 0;
          return;
        }
      } else if (p.action) {
        this.cancelAction(p);
      }
      if (edge & BTN.ACTION && this.trySurvivorAction(p)) return;
    } else if (p.action) {
      this.cancelAction(p);
    }

    const dir = p.idle ? { x: 0, y: 0 } : p.move || inputDir(p.buttons);
    const speed = this.survivorSpeed(p);
    p.vx = dir.x * speed;
    p.vy = dir.y * speed;
    moveCircle(p, p.vx, p.vy, dt, RADIUS.survivor, this.grid.isSolid);

    // 足あと (しのび足だと残らない)
    const moving = dir.x !== 0 || dir.y !== 0;
    if (moving && h !== HEALTH.DOWNED && !(p.buttons & BTN.SNEAK)) {
      p.printT -= dt;
      if (p.printT <= 0) {
        p.printT = SURVIVOR.printInterval / perk(p.character, 'prints');
        this.prints.push({ x: p.x, y: p.y, a: Math.atan2(p.vy, p.vx), t: this.time, life: SURVIVOR.printLife, kind: 'paw' });
      }
    }
  }

  trySurvivorAction(p) {
    // 板を倒す
    const pallet = this.nearestPallet(p, 'up', 1.15);
    if (pallet) {
      this.startAction(p, 'pallet_drop', SURVIVOR.palletDrop, { pallet: pallet.id });
      this.dropPallet(p, pallet);
      return true;
    }
    // 倒れた板を乗り越える
    const down = this.nearestPallet(p, 'down', 1.1);
    if (down) {
      const to = this.otherSide(p, down);
      if (to) {
        this.startAction(p, 'pallet_vault', SURVIVOR.palletVault * perk(p.character, 'vault'), { from: { x: p.x, y: p.y }, to });
        this.noise(down.x + 0.5, down.y + 0.5, 'vault');
        return true;
      }
    }
    // 窓を越える
    const win = this.nearestWindow(p, 1.15);
    if (win) {
      const to = this.otherSide(p, win);
      if (to) {
        const fast = !(p.buttons & BTN.SNEAK);
        const dur = (fast ? SURVIVOR.vaultFast : SURVIVOR.vaultSlow) * perk(p.character, 'vault');
        this.startAction(p, 'vault', dur, { from: { x: p.x, y: p.y }, to });
        if (fast) this.noise(win.x + 0.5, win.y + 0.5, 'vault');
        return true;
      }
    }
    return false;
  }

  tryInstantInteract(p) {
    // ハッチに飛び込む
    if (this.hatch && this.hatch.open && dist(p, center(this.hatch)) < INTERACT_RANGE) {
      this.startAction(p, 'hatch_jump', 0.6, {});
      return true;
    }
    // ロッカーに隠れる
    const locker = this.lockers.find((l) => !l.occupant && dist(p, center(l)) < INTERACT_RANGE);
    const other = locker && this.findInteractTarget(p);
    if (locker && (!other || other.type === 'heal_self')) {
      const fast = !(p.buttons & BTN.SNEAK);
      this.startAction(p, 'locker_enter', SURVIVOR.lockerEnter * (fast ? 0.6 : 1), { locker: locker.id });
      locker.occupant = p.id;
      if (fast) this.noise(locker.x + 0.5, locker.y + 0.5, 'locker');
      return true;
    }
    return false;
  }

  // E 長押しで続けるもの: 救出 > 治療 > ゲート > 発電機 > 自己治療
  findInteractTarget(p) {
    for (const c of this.cages) {
      if (c.occupant && dist(p, center(c)) < INTERACT_RANGE + 0.2) return { type: 'unhook', cage: c };
    }
    let healTarget = null;
    let hd = INTERACT_RANGE + 0.3;
    for (const o of this.survivors()) {
      if (o === p || o.hidden !== null) continue;
      if (o.health !== HEALTH.INJURED && o.health !== HEALTH.DOWNED) continue;
      const d = dist(p, o);
      if (d < hd) {
        hd = d;
        healTarget = o;
      }
    }
    if (healTarget) return { type: 'heal', target: healTarget };
    for (const g of this.gates) {
      if (g.powered && !g.open && dist(p, { x: g.x, y: g.y }) < INTERACT_RANGE + 1.2) return { type: 'gate', gate: g };
    }
    for (const g of this.gens) {
      if (!g.done && dist(p, center(g)) < INTERACT_RANGE) return { type: 'repair', gen: g };
    }
    if (p.health === HEALTH.INJURED) return { type: 'heal_self' };
    return null;
  }

  continueInteract(p, dt) {
    const target = this.findInteractTarget(p);
    if (!target) {
      if (p.action) this.cancelAction(p);
      return false;
    }
    if (target.type === 'unhook') {
      const dur = SURVIVOR.unhookTime * perk(p.character, 'unhook');
      this.startAction(p, 'unhook', dur, { cage: target.cage.id });
      return true;
    }
    const same =
      p.action &&
      p.action.type === target.type &&
      p.action.gen === target.gen?.id &&
      p.action.target === target.target?.id &&
      p.action.gate === target.gate?.id;
    if (!same) {
      this.cancelAction(p);
      p.action = {
        type: target.type,
        start: this.time,
        gen: target.gen?.id,
        target: target.target?.id,
        gate: target.gate?.id,
      };
      if (target.gen) p.angle = Math.atan2(target.gen.y + 0.5 - p.y, target.gen.x + 0.5 - p.x);
      if (target.target) p.angle = Math.atan2(target.target.y - p.y, target.target.x - p.x);
    }
    if (this.time < p.stallUntil) return true;

    switch (target.type) {
      case 'repair': {
        target.gen.workers++;
        this.maybeSkillCheck(p, dt, 'gen');
        break;
      }
      case 'heal': {
        const o = target.target;
        const rate = (1 / SURVIVOR.healOther) * perk(p.character, 'heal');
        o.healProgress += rate * dt;
        this.maybeSkillCheck(p, dt, 'heal');
        if (o.healProgress >= 1) {
          o.healProgress = 0;
          const wasDowned = o.health === HEALTH.DOWNED;
          o.health = wasDowned ? HEALTH.INJURED : HEALTH.HEALTHY;
          if (wasDowned) o.bleed = SURVIVOR.bleedout;
          p.stats.heals++;
          this.event(o.id, { kind: 'toast', text: `${p.name} に${wasDowned ? '起こして' : '治して'}もらった!`, tone: 'good' });
          this.event(p.id, { kind: 'toast', text: `${o.name} を${wasDowned ? '起こした' : '治した'}`, tone: 'good' });
          this.cancelAction(p);
          p.interactLock = true;
        }
        break;
      }
      case 'heal_self': {
        p.healProgress += (1 / SURVIVOR.healSelf) * dt;
        this.maybeSkillCheck(p, dt, 'heal');
        if (p.healProgress >= 1) {
          p.healProgress = 0;
          p.health = HEALTH.HEALTHY;
          this.event(p.id, { kind: 'toast', text: '自己治療が完了した', tone: 'good' });
          this.cancelAction(p);
          p.interactLock = true;
        }
        break;
      }
      case 'gate': {
        const g = target.gate;
        g.progress += dt / SURVIVOR.gateOpen;
        if (g.progress >= 1) {
          g.open = true;
          g.progress = 1;
          for (const [x, y] of g.tiles) {
            this.grid.setSolid(x, y, false);
            this.grid.setSight(x, y, false);
          }
          this.event('all', { kind: 'toast', text: '脱出ゲートが開いた!', tone: 'good' });
          this.event('all', { kind: 'sound', sound: 'gate' });
          this.startCollapse();
          this.cancelAction(p);
          p.interactLock = true;
        }
        break;
      }
    }
    return true;
  }

  maybeSkillCheck(p, dt, source) {
    if (p.skill) {
      // 応答が無いまま期限切れ → 失敗扱い
      if (this.time > p.skill.deadline + 0.5) this.resolveSkill(p, p.skill.id, 'miss');
      return;
    }
    if (this.rng() < GEN.skillCheckChancePerSec * dt) {
      const zoneStart = 0.3 + this.rng() * 0.55;
      p.skill = {
        id: this.nextSkillId++,
        source,
        zoneStart,
        good: SKILL.goodSize,
        great: SKILL.greatSize,
        spin: SKILL.spinTime,
        warn: SKILL.warnTime,
        deadline: this.time + SKILL.warnTime + SKILL.spinTime + 0.6,
      };
      this.event(p.id, { kind: 'skill', skill: p.skill });
    }
  }

  // クライアントが判定したスキルチェックの結果を受け取る
  resolveSkill(p, id, result) {
    if (!p.skill || p.skill.id !== id) return;
    const source = p.skill.source;
    p.skill = null;
    if (!['great', 'good', 'miss'].includes(result)) result = 'miss';
    if (p.health === HEALTH.CAGED) {
      if (result === 'miss') {
        this.event('all', { kind: 'toast', text: `${p.name} は抵抗しきれなかった…`, tone: 'bad' });
        this.kill(p);
      }
      return;
    }
    const a = p.action;
    if (!a) return;
    if (a.type === 'repair') {
      const g = this.gens[a.gen];
      if (result === 'great') g.progress = Math.min(0.999, g.progress + GEN.greatBonus);
      if (result === 'miss') {
        g.progress = Math.max(0, g.progress - GEN.missPenalty);
        p.stallUntil = this.time + GEN.missStall;
        this.noise(g.x + 0.5, g.y + 0.5, 'gen_fail');
        this.event('all', { kind: 'sound', sound: 'boing', x: g.x + 0.5, y: g.y + 0.5 });
      }
    } else if ((a.type === 'heal' || a.type === 'heal_self') && result === 'miss') {
      const o = a.type === 'heal' ? this.players.get(a.target) : p;
      if (o) o.healProgress = Math.max(0, o.healProgress - 0.1);
      p.stallUntil = this.time + GEN.missStall;
      this.noise(p.x, p.y, 'heal_fail');
    } else if (a.type === 'heal' && result === 'great') {
      const o = this.players.get(a.target);
      if (o) o.healProgress += 0.03;
    }
    this.event(p.id, { kind: 'skill_result', result, source });
  }

  startLockerExit(p) {
    const l = this.lockers[p.hidden];
    const out = this.freeSpotNear(l.x + 0.5, l.y + 0.5, p.angle);
    this.startAction(p, 'locker_exit', SURVIVOR.lockerExit, { from: { x: p.x, y: p.y }, to: out, locker: l.id });
  }

  // ==================== キラー ====================
  killerSpeed(p) {
    const a = p.action;
    if (a) {
      if (a.type === 'lunge') return SPEED.killer * SPEED.lungeMul;
      if (a.type === 'miss') return SPEED.killer * 0.45;
      if (a.type === 'wipe') return SPEED.killer * 0.3;
      if (a.type === 'charge') return SPEED.killerCharge;
      if (a.type === 'dash') return SPEED.killerDash;
    }
    return p.carrying ? SPEED.killerCarry : SPEED.killer;
  }

  stepKiller(p, cmd, edge, dt) {
    const a = p.action;
    if (a && LOCKING.has(a.type)) {
      this.advanceLockedAction(p);
      return;
    }
    if (p.aim !== undefined) {
      if (a && a.type === 'dash') {
        // 突進中は急には曲がれない
        const d = angleDiff(p.aim, p.angle);
        const maxTurn = KILLER.dashTurnRate * dt;
        p.angle += Math.max(-maxTurn, Math.min(maxTurn, d));
      } else {
        p.angle = p.aim;
      }
    }

    // 時間経過で終わるアクション
    if (a && a.end !== undefined && this.time >= a.end) {
      if (a.type === 'lunge') this.startTimed(p, 'miss', KILLER.missRecover);
      else if (a.type === 'dash') this.startTimed(p, 'miss', KILLER.missRecover);
      else p.action = null;
    }

    const cur = p.action;
    const busy = cur && ['lunge', 'miss', 'wipe', 'dash', 'charge'].includes(cur.type);

    if (!busy && !p.carrying) {
      if (edge & BTN.ATTACK) {
        this.startTimed(p, 'lunge', KILLER.lungeTime);
        this.event('all', { kind: 'sound', sound: 'swoosh', x: p.x, y: p.y });
      } else if (p.buttons & BTN.POWER && p.dashCd <= 0) {
        p.action = { type: 'charge', start: this.time };
      }
    }
    if (cur && cur.type === 'charge') {
      if (!(p.buttons & BTN.POWER)) {
        if (this.time - cur.start >= KILLER.chargeTime) {
          this.startTimed(p, 'dash', KILLER.dashTime);
          p.dashCd = KILLER.dashCooldown;
          this.event('all', { kind: 'sound', sound: 'dash', x: p.x, y: p.y });
        } else {
          p.action = null;
        }
      }
    }

    if (edge & BTN.HOWL && p.howlCd <= 0) this.howl(p);

    if (!busy && (edge & BTN.ACTION || edge & BTN.INTERACT)) {
      if (this.tryKillerInteract(p)) return;
    }

    // 移動
    let vx;
    let vy;
    const act = p.action;
    const speed = this.killerSpeed(p);
    if (act && (act.type === 'lunge' || act.type === 'dash')) {
      vx = Math.cos(p.angle) * speed;
      vy = Math.sin(p.angle) * speed;
    } else {
      const dir = p.idle ? { x: 0, y: 0 } : p.move || inputDir(p.buttons);
      vx = dir.x * speed;
      vy = dir.y * speed;
    }
    p.vx = vx;
    p.vy = vy;
    const push = moveCircle(p, vx, vy, dt, RADIUS.killer, this.grid.isSolid);

    if (act && act.type === 'dash') {
      const blocked = -(push.x * vx + push.y * vy) / (speed || 1);
      if (this.checkHit(p)) return;
      if (blocked > speed * dt * 0.45) {
        this.startTimed(p, 'stunned', KILLER.dashWallStun);
        this.event('all', { kind: 'sound', sound: 'bonk', x: p.x, y: p.y });
        this.event(p.id, { kind: 'toast', text: '壁に激突した!', tone: 'bad' });
      }
    } else if (act && act.type === 'lunge') {
      this.checkHit(p);
    }
  }

  checkHit(p) {
    for (const s of this.survivors()) {
      if (s.health !== HEALTH.HEALTHY && s.health !== HEALTH.INJURED) continue;
      if (s.hidden !== null) continue;
      if (s.action && ['locker_enter', 'locker_exit', 'hatch_jump'].includes(s.action.type)) continue;
      const d = dist(p, s);
      if (d > KILLER.hitRange + RADIUS.survivor) continue;
      const ang = Math.atan2(s.y - p.y, s.x - p.x);
      if (d > 0.5 && Math.abs(angleDiff(ang, p.angle)) > KILLER.hitArc / 2) continue;
      if (!lineOfSight(p.x, p.y, s.x, s.y, this.grid.isSolid) && d > 0.6) continue;
      this.damage(s, p);
      this.startTimed(p, 'wipe', KILLER.hitWipe);
      return true;
    }
    return false;
  }

  damage(s, killer) {
    const wasVaulting = s.action && (s.action.type === 'vault' || s.action.type === 'pallet_vault');
    if (s.enduranceUntil > this.time) {
      s.enduranceUntil = 0;
      s.hasteUntil = this.time + SURVIVOR.hasteTime * perk(s.character, 'haste');
      this.event('all', { kind: 'sound', sound: 'hit', x: s.x, y: s.y });
      this.event(s.id, { kind: 'toast', text: '与えられた猶予が攻撃を防いだ!', tone: 'good' });
      return;
    }
    killer.stats.hits++;
    if (wasVaulting) {
      // 窓越え中に殴られたら元の位置に戻される
      s.x = s.action.from.x;
      s.y = s.action.from.y;
    }
    this.cancelAction(s);
    s.interactLock = true;
    if (s.health === HEALTH.HEALTHY) {
      s.health = HEALTH.INJURED;
      s.healProgress = 0;
      s.hasteUntil = this.time + SURVIVOR.hasteTime * perk(s.character, 'haste');
      this.event('all', { kind: 'sound', sound: 'hit', x: s.x, y: s.y });
      this.event(s.id, { kind: 'toast', text: '攻撃を受けた! 走って逃げろ', tone: 'bad' });
    } else {
      s.health = HEALTH.DOWNED;
      s.healProgress = 0;
      s.bleed = SURVIVOR.bleedout;
      s.hasteUntil = 0;
      this.event('all', { kind: 'sound', sound: 'down', x: s.x, y: s.y });
      this.event('survivors', { kind: 'toast', text: `${s.name} がダウンした!`, tone: 'bad' });
      this.event(killer.id, { kind: 'toast', text: `${s.name} をダウンさせた`, tone: 'good' });
    }
  }

  tryKillerInteract(p) {
    if (p.carrying) {
      const cage = this.cages.find((c) => !c.occupant && !c.broken && dist(p, center(c)) < INTERACT_RANGE + 0.4);
      if (cage) {
        this.startAction(p, 'hook', KILLER.hookTime, { cage: cage.id });
        p.angle = Math.atan2(cage.y + 0.5 - p.y, cage.x + 0.5 - p.x);
        return true;
      }
      return false;
    }
    // ダウンしたサバイバーを担ぐ
    const downed = this.survivors().find((s) => s.health === HEALTH.DOWNED && dist(p, s) < INTERACT_RANGE + 0.2);
    if (downed) {
      this.startAction(p, 'pickup', KILLER.pickupTime, { target: downed.id });
      this.cancelAction(downed);
      return true;
    }
    if (this.hatch && this.hatch.open && dist(p, center(this.hatch)) < INTERACT_RANGE + 0.3) {
      this.startAction(p, 'close_hatch', KILLER.closeHatchTime, {});
      return true;
    }
    const pallet = this.nearestPallet(p, 'down', 1.3);
    if (pallet) {
      this.startAction(p, 'break_pallet', KILLER.breakPalletTime, { pallet: pallet.id });
      return true;
    }
    const win = this.nearestWindow(p, 1.2);
    if (win) {
      const to = this.otherSide(p, win);
      if (to) {
        this.startAction(p, 'vault', KILLER.vaultTime, { from: { x: p.x, y: p.y }, to });
        return true;
      }
    }
    const locker = this.lockers.find((l) => dist(p, center(l)) < INTERACT_RANGE + 0.2);
    if (locker) {
      this.startAction(p, 'search_locker', KILLER.searchLockerTime, { locker: locker.id });
      return true;
    }
    const gen = this.gens.find((g) => !g.done && !g.regressing && g.progress > 0 && dist(p, center(g)) < INTERACT_RANGE + 0.2);
    if (gen) {
      this.startAction(p, 'kick_gen', KILLER.kickGenTime, { gen: gen.id });
      return true;
    }
    return false;
  }

  howl(p) {
    p.howlCd = KILLER.howlCooldown;
    this.event('all', { kind: 'sound', sound: 'howl', x: p.x, y: p.y });
    this.event('survivors', { kind: 'toast', text: '咆哮が響いた… 走っている者は位置を暴かれる!', tone: 'bad' });
    let n = 0;
    for (const s of this.survivors()) {
      if (s.health !== HEALTH.HEALTHY && s.health !== HEALTH.INJURED) continue;
      if (s.hidden !== null || s.buttons & BTN.SNEAK) continue;
      if (dist(p, s) > KILLER.howlRadius) continue;
      const moving = Math.hypot(s.vx, s.vy) > 0.5 || (s.action && s.action.type === 'repair');
      if (!moving) continue;
      this.reveals.push({ id: s.id, until: this.time + KILLER.howlReveal });
      n++;
    }
    this.event(p.id, { kind: 'toast', text: n ? `${n} 人の気配を捉えた!` : '誰の気配もない…', tone: n ? 'good' : 'info' });
  }

  // ==================== 共通アクション ====================
  startAction(p, type, dur, extra) {
    p.action = { type, start: this.time, end: this.time + dur, dur, ...extra };
    p.vx = p.vy = 0;
  }

  startTimed(p, type, dur) {
    p.action = { type, start: this.time, end: this.time + dur, dur };
  }

  cancelAction(p) {
    const a = p.action;
    if (p.skill && p.health !== HEALTH.CAGED) {
      p.skill = null;
      this.event(p.id, { kind: 'skill_cancel' });
    }
    if (!a) return;
    if (a.type === 'locker_enter' && a.locker !== undefined) {
      const l = this.lockers[a.locker];
      if (l.occupant === p.id) l.occupant = null;
    }
    p.action = null;
  }

  advanceLockedAction(p) {
    const a = p.action;
    const t = Math.min(1, (this.time - a.start) / a.dur);
    if (a.from && a.to) {
      p.x = a.from.x + (a.to.x - a.from.x) * t;
      p.y = a.from.y + (a.to.y - a.from.y) * t;
    }
    if (a.type === 'pickup') {
      const s = this.players.get(a.target);
      if (!s || s.health !== HEALTH.DOWNED) {
        p.action = null;
        return;
      }
    }
    if (a.type === 'unhook') {
      const c = this.cages[a.cage];
      if (!c.occupant) {
        p.action = null;
        return;
      }
    }
    if (this.time < a.end) return;
    p.action = null;
    this.finishAction(p, a);
  }

  finishAction(p, a) {
    switch (a.type) {
      case 'vault':
      case 'pallet_vault':
        resolveCircle(p, p.role === 'killer' ? RADIUS.killer : RADIUS.survivor, this.grid.isSolid);
        break;
      case 'locker_enter':
        p.hidden = a.locker;
        p.x = this.lockers[a.locker].x + 0.5;
        p.y = this.lockers[a.locker].y + 0.5;
        break;
      case 'locker_exit':
        this.lockers[a.locker].occupant = null;
        p.hidden = null;
        p.x = a.to.x;
        p.y = a.to.y;
        resolveCircle(p, RADIUS.survivor, this.grid.isSolid);
        break;
      case 'hatch_jump':
        this.escape(p, 'ハッチ');
        break;
      case 'unhook': {
        const c = this.cages[a.cage];
        const s = c.occupant && this.players.get(c.occupant);
        if (s) {
          p.stats.rescues++;
          this.releaseFromCage(s, p);
        }
        break;
      }
      case 'pickup': {
        const s = this.players.get(a.target);
        if (s && s.health === HEALTH.DOWNED) this.carry(p, s);
        break;
      }
      case 'hook': {
        const s = p.carrying && this.players.get(p.carrying);
        const c = this.cages[a.cage];
        if (s && !c.occupant) this.cageSurvivor(p, s, c);
        break;
      }
      case 'break_pallet': {
        const pl = this.pallets[a.pallet];
        pl.state = 'broken';
        this.grid.setSolid(pl.x, pl.y, false);
        this.event('all', { kind: 'sound', sound: 'crack', x: pl.x + 0.5, y: pl.y + 0.5 });
        break;
      }
      case 'kick_gen': {
        const g = this.gens[a.gen];
        g.progress = Math.max(0, g.progress - GEN.kickRegressInstant);
        g.regressing = true;
        this.event('all', { kind: 'sound', sound: 'kick', x: g.x + 0.5, y: g.y + 0.5 });
        break;
      }
      case 'search_locker': {
        const l = this.lockers[a.locker];
        this.event('all', { kind: 'sound', sound: 'rustle', x: l.x + 0.5, y: l.y + 0.5 });
        const s = l.occupant && this.players.get(l.occupant);
        if (s && s.hidden === l.id) {
          l.occupant = null;
          s.hidden = null;
          this.event('all', { kind: 'toast', text: `${s.name} がロッカーから引きずり出された!`, tone: 'bad' });
          this.carry(p, s);
        } else if (s && s.action && s.action.type === 'locker_enter') {
          // 入る途中で見つかった
          this.cancelAction(s);
          l.occupant = null;
          this.carry(p, s);
        } else {
          this.event(p.id, { kind: 'toast', text: '空だ', tone: 'info' });
        }
        break;
      }
      case 'close_hatch':
        if (this.hatch) {
          this.hatch.open = false;
          this.event('all', { kind: 'toast', text: 'ハッチが閉じられた! 脱出ゲートに通電した', tone: 'bad' });
          this.powerGates();
          this.startCollapse();
        }
        break;
      case 'stunned':
      case 'pallet_drop':
        break;
    }
  }

  carry(h, s) {
    s.health = HEALTH.CARRIED;
    s.wiggle = 0;
    s.wiggleLast = 0;
    s.skill = null;
    this.cancelAction(s);
    h.carrying = s.id;
    s.x = h.x;
    s.y = h.y;
    this.event('all', { kind: 'sound', sound: 'pickup', x: h.x, y: h.y });
    this.event(s.id, { kind: 'toast', text: '担がれた! 左右を交互に連打してもがけ!', tone: 'bad' });
  }

  dropCarried(h, reason) {
    const s = h.carrying && this.players.get(h.carrying);
    h.carrying = null;
    if (!s) return;
    const spot = this.freeSpotNear(h.x, h.y, h.angle + Math.PI);
    s.x = spot.x;
    s.y = spot.y;
    s.health = reason === 'wiggle' || reason === 'stun' ? HEALTH.INJURED : HEALTH.DOWNED;
    s.hasteUntil = this.time + SURVIVOR.hasteTime;
    s.wiggle = 0;
    this.event('all', { kind: 'toast', text: `${s.name} が逃げ出した!`, tone: 'good' });
  }

  cageSurvivor(h, s, c) {
    h.carrying = null;
    h.stats.hooks++;
    c.occupant = s.id;
    s.cage = c.id;
    s.x = c.x + 0.5;
    s.y = c.y + 0.5;
    s.health = HEALTH.CAGED;
    s.hookCount++;
    this.event('all', { kind: 'sound', sound: 'cage', x: s.x, y: s.y });
    if (s.hookCount >= 3) {
      this.event('all', { kind: 'toast', text: `${s.name} は3度目のフック… エンティティに捧げられた`, tone: 'bad' });
      this.kill(s);
      return;
    }
    s.hookStage = s.hookCount;
    s.hookTimer = s.hookStage === 1 ? SURVIVOR.hookStage1 : SURVIVOR.hookStage2;
    this.event('survivors', { kind: 'toast', text: `${s.name} がフックに吊るされた! 救出に向かえ`, tone: 'bad' });
  }

  releaseFromCage(s, rescuer) {
    const c = this.cages[s.cage];
    c.occupant = null;
    s.cage = null;
    s.health = HEALTH.INJURED;
    s.healProgress = 0;
    s.skill = null;
    s.hookStage = 0;
    s.selfUnhookLeft = SURVIVOR.selfUnhookAttempts;
    const spot = this.freeSpotNear(c.x + 0.5, c.y + 0.5, rescuer ? Math.atan2(rescuer.y - c.y - 0.5, rescuer.x - c.x - 0.5) : 0);
    s.x = spot.x;
    s.y = spot.y;
    s.hasteUntil = this.time + SURVIVOR.hasteTime;
    s.enduranceUntil = this.time + SURVIVOR.enduranceTime;
    this.event('all', { kind: 'sound', sound: 'unhook', x: s.x, y: s.y });
    if (rescuer) {
      this.event('all', { kind: 'toast', text: `${rescuer.name} が ${s.name} を救出した!`, tone: 'good' });
    }
  }

  kill(s) {
    if (s.cage !== null) {
      const c = this.cages[s.cage];
      c.occupant = null;
      c.broken = true;
      s.cage = null;
    }
    const h = this.killer;
    if (h && h.carrying === s.id) h.carrying = null;
    s.health = HEALTH.DEAD;
    s.outcome = 'dead';
    s.skill = null;
    s.action = null;
    this.event('all', { kind: 'sound', sound: 'sacrifice', x: s.x, y: s.y });
    this.event('all', { kind: 'sacrifice', x: s.x, y: s.y, character: s.character });
  }

  escape(s, via) {
    s.health = HEALTH.ESCAPED;
    s.outcome = 'escaped';
    s.stats.escapes++;
    s.action = null;
    s.skill = null;
    this.event('all', { kind: 'toast', text: `${s.name} が${via}から脱出した!`, tone: 'good' });
    this.event('all', { kind: 'sound', sound: 'escape' });
  }

  dropPallet(p, pallet) {
    pallet.state = 'down';
    this.grid.setSolid(pallet.x, pallet.y, true);
    this.event('all', { kind: 'sound', sound: 'pallet', x: pallet.x + 0.5, y: pallet.y + 0.5 });
    this.noise(pallet.x + 0.5, pallet.y + 0.5, 'pallet');
    // キラーが下にいたら気絶
    const h = this.killer;
    if (!h) return;
    const cx = pallet.x + 0.5;
    const cy = pallet.y + 0.5;
    const along = pallet.axis === 'v' ? Math.abs(h.y - cy) : Math.abs(h.x - cx);
    const across = pallet.axis === 'v' ? Math.abs(h.x - cx) : Math.abs(h.y - cy);
    if (along < 0.5 + RADIUS.killer && across < 0.6 && !(h.action && h.action.type === 'stunned')) {
      p.stats.stuns++;
      this.stunKiller(h, KILLER.palletStun, '板が直撃した!');
    }
    // 板の上に重なった者は押し出す
    for (const o of this.players.values()) {
      if (o.health === HEALTH.CARRIED || o.health === HEALTH.CAGED || o.hidden !== null) continue;
      if (o.action && o.action.from) continue;
      const r = o.role === 'killer' ? RADIUS.killer : RADIUS.survivor;
      resolveCircle(o, r, this.grid.isSolid);
    }
  }

  stunKiller(h, dur, text) {
    if (h.carrying) this.dropCarried(h, 'stun');
    this.startAction(h, 'stunned', dur, {});
    this.event('all', { kind: 'sound', sound: 'stun', x: h.x, y: h.y });
    this.event(h.id, { kind: 'toast', text, tone: 'bad' });
  }

  // ==================== 定期処理 ====================
  updateGens(dt) {
    for (const g of this.gens) {
      if (g.done) {
        g.workers = 0;
        continue;
      }
      const workers = this.survivors().filter((s) => s.action && s.action.type === 'repair' && s.action.gen === g.id && this.time >= s.stallUntil);
      if (workers.length) {
        g.regressing = false;
        const eff = Math.max(0.4, 1 - GEN.coopPenalty * (workers.length - 1));
        let rate = 0;
        for (const w of workers) rate += perk(w.character, 'repair');
        g.progress += (rate * eff * dt) / GEN.baseTime;
      } else if (g.regressing) {
        g.progress = Math.max(0, g.progress - GEN.regressPerSec * dt);
        if (g.progress <= 0) g.regressing = false;
      }
      g.workers = workers.length;
      if (g.progress >= 1) {
        g.progress = 1;
        g.done = true;
        g.regressing = false;
        for (const w of workers) {
          w.stats.gens++;
          this.cancelAction(w);
          w.interactLock = true;
        }
        this.noise(g.x + 0.5, g.y + 0.5, 'gen_done');
        const left = Math.max(0, this.gensRequired - this.gensDone());
        this.event('all', { kind: 'sound', sound: 'gen_done', x: g.x + 0.5, y: g.y + 0.5 });
        this.event('all', { kind: 'gen_done', gen: g.id });
        if (left > 0) this.event('all', { kind: 'toast', text: `発電機が修理された! 残り ${left} 台`, tone: 'good' });
        if (left === 0 && !this.gates[0].powered) {
          this.event('all', { kind: 'toast', text: 'すべての発電機が修理された! 脱出ゲートを開けろ', tone: 'good' });
          this.powerGates();
        }
      }
    }
  }

  powerGates() {
    for (const g of this.gates) g.powered = true;
    for (const g of this.gens) {
      if (!g.done) g.regressing = false;
    }
    this.event('all', { kind: 'sound', sound: 'power' });
  }

  startCollapse() {
    if (this.collapse) return;
    this.collapse = { endsAt: this.time + ENDGAME.collapseTime };
    this.event('all', { kind: 'toast', text: `エンドゲーム崩壊! 残り ${ENDGAME.collapseTime} 秒`, tone: 'bad' });
  }

  updateSurvivorTimers(dt) {
    const h = this.killer;
    for (const s of this.survivors()) {
      switch (s.health) {
        case HEALTH.DOWNED:
          if (!this.survivors().some((o) => o.action && o.action.type === 'heal' && o.action.target === s.id)) {
            s.bleed -= dt;
          }
          if (s.bleed <= 0) {
            this.event('all', { kind: 'toast', text: `${s.name} は失血死した…`, tone: 'bad' });
            this.kill(s);
          }
          break;
        case HEALTH.CARRIED:
          if (h) {
            s.x = h.x;
            s.y = h.y;
          }
          s.wiggle = Math.max(0, s.wiggle - SURVIVOR.wiggleDecay * dt);
          if (s.wiggle >= 1 && h) {
            h.carrying = s.id;
            this.dropCarried(h, 'wiggle');
            this.startAction(h, 'stunned', KILLER.wiggleStun, {});
          }
          break;
        case HEALTH.CAGED: {
          // 誰かが救出中なら時間は進まない
          const beingRescued = this.survivors().some((o) => o.action && o.action.type === 'unhook' && o.action.cage === s.cage);
          if (!beingRescued) s.hookTimer -= dt;
          if (s.hookTimer <= 0) {
            if (s.hookStage === 1) {
              s.hookStage = 2;
              s.hookTimer = SURVIVOR.hookStage2;
              this.event('all', { kind: 'toast', text: `${s.name} がエンティティに抵抗している!`, tone: 'bad' });
            } else {
              this.event('all', { kind: 'toast', text: `${s.name} は生贄に捧げられた…`, tone: 'bad' });
              this.kill(s);
            }
          } else if (s.hookStage === 2) {
            this.maybeSkillCheck(s, dt * 1.6, 'struggle');
          }
          break;
        }
        case HEALTH.INJURED: {
          if (s.hidden !== null) break;
          s.furT -= dt;
          if (s.furT <= 0) {
            s.furT = SURVIVOR.furInterval;
            this.prints.push({
              x: s.x + (this.rng() - 0.5) * 0.4,
              y: s.y + (this.rng() - 0.5) * 0.4,
              t: this.time,
              life: SURVIVOR.furLife,
              kind: 'fur',
            });
          }
          s.groanT -= dt;
          if (s.groanT <= 0 && h && dist(s, h) < SURVIVOR.groanRange) {
            s.groanT = SURVIVOR.groanInterval * (0.8 + this.rng() * 0.4);
            if (!(s.buttons & BTN.SNEAK) || this.rng() < 0.5) {
              this.noise(s.x + (this.rng() - 0.5) * 2, s.y + (this.rng() - 0.5) * 2, 'groan');
            }
          }
          break;
        }
      }
      // ハッチ・ゲートからの脱出判定
      if ((s.health === HEALTH.HEALTHY || s.health === HEALTH.INJURED) && s.hidden === null) {
        for (const g of this.gates) {
          if (!g.open) continue;
          const gx = g.side === 'left' ? 0.9 : this.map.w - 0.9;
          if ((g.side === 'left' ? s.x < gx : s.x > gx) && Math.abs(s.y - g.y) < 1.2) this.escape(s, '脱出ゲート');
        }
      }
    }
  }

  updateKillerTimers(dt) {
    const h = this.killer;
    if (!h) return;
    h.dashCd = Math.max(0, h.dashCd - dt);
    h.howlCd = Math.max(0, h.howlCd - dt);
    if (h.carrying) {
      const s = this.players.get(h.carrying);
      if (!s || s.health !== HEALTH.CARRIED) h.carrying = null;
    }
  }

  updateEndgame() {
    const active = this.activeSurvivors();
    // 最後の 1 人になったらハッチが現れる
    if (!this.hatch && active.length === 1 && this.survivors().length > 1 && !this.gates.some((g) => g.open)) {
      const s = active[0];
      let best = this.map.hatchSpots[0];
      let bd = -1;
      for (const spot of this.map.hatchSpots) {
        const d = dist(spot, this.killer || s);
        if (d > bd) {
          bd = d;
          best = spot;
        }
      }
      this.hatch = { x: best.x, y: best.y, open: true };
      this.event('all', { kind: 'toast', text: 'ハッチが開いた!', tone: 'info' });
      this.event('all', { kind: 'sound', sound: 'hatch' });
    }
    if (this.collapse && this.time >= this.collapse.endsAt) {
      for (const s of this.activeSurvivors()) {
        this.event('all', { kind: 'toast', text: `崩壊が完了した… ${s.name} はエンティティに捕らわれた`, tone: 'bad' });
        this.kill(s);
      }
    }
  }

  checkEnd() {
    const sv = this.survivors();
    if (!sv.length) return;
    if (this.activeSurvivors().length > 0 && this.killer) return;
    this.over = true;
    const escaped = sv.filter((s) => s.health === HEALTH.ESCAPED).length;
    const dead = sv.length - escaped;
    let winner;
    if (!this.killer) winner = 'survivors';
    else if (dead * 2 > sv.length) winner = 'killer';
    else if (dead * 2 === sv.length) winner = 'draw';
    else winner = 'survivors';
    this.result = {
      winner,
      escaped,
      dead,
      duration: Math.round(this.time),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        character: p.character,
        bot: p.bot,
        outcome: p.role === 'killer' ? null : p.outcome || 'dead',
        stats: p.stats,
      })),
    };
    this.event('all', { kind: 'over', result: this.result });
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.role === 'killer') {
      if (p.carrying) this.dropCarried(p, 'stun');
      this.players.delete(id);
      this.event('all', { kind: 'toast', text: 'キラーが切断した…', tone: 'info' });
    } else {
      if (ACTIVE_STATES.has(p.health)) this.kill(p);
      p.outcome = p.outcome || 'dead';
    }
  }

  // ==================== 補助 ====================
  nearestPallet(p, state, range) {
    let best = null;
    let bd = range;
    for (const pl of this.pallets) {
      if (pl.state !== state) continue;
      const d = dist(p, center(pl));
      if (d < bd) {
        bd = d;
        best = pl;
      }
    }
    return best;
  }

  nearestWindow(p, range) {
    let best = null;
    let bd = range;
    for (const w of this.windows) {
      const d = dist(p, center(w));
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  }

  // 窓・板の反対側の座標
  otherSide(p, obj) {
    const cx = obj.x + 0.5;
    const cy = obj.y + 0.5;
    if (obj.axis === 'v') {
      const side = p.y < cy ? 1 : -1;
      return { x: cx, y: cy + side * 1.0 };
    }
    const side = p.x < cx ? 1 : -1;
    return { x: cx + side * 1.0, y: cy };
  }

  freeSpotNear(x, y, preferAngle = 0) {
    for (let r = 0.9; r < 3; r += 0.4) {
      for (let k = 0; k < 8; k++) {
        const a = preferAngle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const tx = Math.floor(px);
        const ty = Math.floor(py);
        if (!this.grid.isSolid(tx, ty) && lineOfSight(x, y, px, py, this.grid.isSolid)) {
          const pos = { x: px, y: py };
          resolveCircle(pos, RADIUS.survivor, this.grid.isSolid);
          if (!this.grid.isSolid(Math.floor(pos.x), Math.floor(pos.y))) return pos;
        }
      }
    }
    return { x, y };
  }

  visionOf(p) {
    if (p.role === 'killer') return { cone: true, radius: VISION.killerRadius, fov: VISION.killerFov, near: VISION.killerNear };
    return { cone: false, radius: VISION.survivorRadius };
  }

  canSee(viewer, target) {
    return canSee(viewer, target, this.visionOf(viewer), this.grid.blocksSight);
  }

  // ==================== スナップショット ====================
  // 各プレイヤーには「見えているもの」しか送らない (霧の中の情報は漏らさない)
  snapshotFor(id) {
    const me = this.players.get(id);
    if (!me) return null;
    const isKiller = me.role === 'killer';
    const h = this.killer;
    const players = [];
    for (const o of this.players.values()) {
      if (o.id === id) continue;
      if (o.role === 'survivor' && (o.health === HEALTH.ESCAPED || o.health === HEALTH.DEAD)) continue;
      let visible;
      let aura = false;
      if (o.role === 'survivor' && o.hidden !== null) visible = false;
      else if (isKiller) {
        visible = this.canSee(me, o) || o.health === HEALTH.CARRIED || o.health === HEALTH.CAGED;
        if (!visible && this.reveals.some((r) => r.id === o.id)) {
          visible = true;
          aura = true;
        }
      } else if (o.role === 'survivor') {
        visible = this.canSee(me, o);
        // 仲間がピンチのときはオーラで見える
        if (!visible && [HEALTH.DOWNED, HEALTH.CAGED, HEALTH.CARRIED].includes(o.health)) {
          visible = true;
          aura = true;
        }
      } else {
        // サバイバーから見たキラー。担がれている・かごの中なら当然見える
        visible = me.health === HEALTH.CARRIED || this.canSee(me, o);
      }
      if (!visible) continue;
      players.push(this.publicPlayer(o, aura));
    }

    const you = this.privatePlayer(me);

    let heartbeat = 0;
    if (!isKiller && h && ACTIVE_STATES.has(me.health)) {
      const d = dist(me, h);
      if (d < VISION.terrorRadius) heartbeat = 1 - d / VISION.terrorRadius;
    }

    const snap = {
      type: 'snap',
      time: +this.time.toFixed(3),
      tick: this.tick,
      you,
      players,
      gens: this.gens.map((g) => {
        const showProgress = !isKiller || this.canSee(me, center(g));
        return {
          id: g.id,
          p: showProgress ? +g.progress.toFixed(3) : g.done ? 1 : -1,
          done: g.done,
          w: !isKiller || showProgress ? g.workers : 0,
          r: g.regressing,
        };
      }),
      pallets: this.pallets.map((p) => p.state),
      cages: this.cages.map((c) => {
        const s = c.occupant && this.players.get(c.occupant);
        return { o: c.occupant, b: c.broken, st: s ? s.hookStage : 0, t: s ? +s.hookTimer.toFixed(1) : 0 };
      }),
      gates: this.gates.map((g) => ({ pw: g.powered, p: +g.progress.toFixed(3), o: g.open })),
      hatch: this.hatch,
      collapse: this.collapse ? +(this.collapse.endsAt - this.time).toFixed(1) : null,
      gensDone: this.gensDone(),
      gensRequired: this.gensRequired,
      team: this.survivors().map((s) => ({
        id: s.id,
        name: s.name,
        character: s.character,
        h: s.health,
        hk: s.hookCount,
        st: s.hookStage,
        bot: s.bot,
      })),
      heartbeat: +heartbeat.toFixed(2),
    };
    if (isKiller) {
      snap.prints = this.prints
        .filter((pr) => this.time - pr.t < pr.life && dist(pr, me) < 20)
        .map((pr) => ({
          x: +pr.x.toFixed(2),
          y: +pr.y.toFixed(2),
          a: pr.a ? +pr.a.toFixed(2) : 0,
          age: +(this.time - pr.t).toFixed(2),
          life: pr.life,
          k: pr.kind,
        }));
      snap.noises = this.noises.map((n) => ({ x: +n.x.toFixed(1), y: +n.y.toFixed(1), k: n.kind, age: +(this.time - n.t).toFixed(2) }));
    } else {
      // サバイバーには「直った」通知だけ
      snap.noises = this.noises.filter((n) => n.kind === 'gen_done').map((n) => ({ x: n.x, y: n.y, k: n.kind, age: +(this.time - n.t).toFixed(2) }));
    }
    return snap;
  }

  publicPlayer(o, aura) {
    const out = {
      id: o.id,
      name: o.name,
      role: o.role,
      character: o.character,
      x: +o.x.toFixed(3),
      y: +o.y.toFixed(3),
      a: +o.angle.toFixed(3),
      act: o.action ? o.action.type : null,
      mv: Math.hypot(o.vx, o.vy) > 0.1,
    };
    if (aura) out.aura = true;
    if (o.role === 'survivor') {
      out.h = o.health;
      out.sn = !!(o.buttons & BTN.SNEAK);
      if (o.action && o.action.end) out.ap = +Math.min(1, (this.time - o.action.start) / o.action.dur).toFixed(2);
      if (o.health === HEALTH.CARRIED) out.wg = +o.wiggle.toFixed(2);
    } else {
      out.carry = o.carrying;
    }
    return out;
  }

  privatePlayer(me) {
    const a = me.action;
    const you = {
      id: me.id,
      role: me.role,
      character: me.character,
      name: me.name,
      x: +me.x.toFixed(3),
      y: +me.y.toFixed(3),
      a: +me.angle.toFixed(3),
      seq: me.lastSeq,
      act: a ? a.type : null,
      ap: a && a.end ? +Math.min(1, (this.time - a.start) / a.dur).toFixed(3) : null,
      locked: !!(a && LOCKING.has(a.type)),
    };
    if (me.role === 'killer') {
      you.speed = this.killerSpeed(me);
      you.carry = me.carrying;
      you.dashCd = +me.dashCd.toFixed(1);
      you.howlCd = +me.howlCd.toFixed(1);
      you.charge = a && a.type === 'charge' ? Math.min(1, (this.time - a.start) / KILLER.chargeTime) : 0;
      you.forced = !!(a && (a.type === 'lunge' || a.type === 'dash'));
    } else {
      you.h = me.health;
      you.speed = this.survivorSpeed(me);
      you.sneakMul = perk(me.character, 'sneak');
      you.haste = me.hasteUntil > this.time;
      you.endurance = me.enduranceUntil > this.time;
      you.hidden = me.hidden;
      you.heal = +me.healProgress.toFixed(3);
      you.bleed = Math.round(me.bleed);
      you.wiggle = +me.wiggle.toFixed(2);
      you.hookStage = me.hookStage;
      you.hookTimer = +me.hookTimer.toFixed(1);
      you.hookCount = me.hookCount;
      you.selfUnhook = me.selfUnhookLeft;
      you.stalled = this.time < me.stallUntil;
      if (a && a.type === 'heal') {
        const o = this.players.get(a.target);
        you.healTarget = o ? +o.healProgress.toFixed(3) : 0;
      }
      if (a && a.type === 'gate') you.gateProgress = +this.gates[a.gate].progress.toFixed(3);
      if (a && a.type === 'repair') you.genProgress = +this.gens[a.gen].progress.toFixed(3);
      you.locked =
        you.locked ||
        me.hidden !== null ||
        [HEALTH.CARRIED, HEALTH.CAGED, HEALTH.ESCAPED, HEALTH.DEAD].includes(me.health) ||
        (a && ['repair', 'heal', 'heal_self', 'gate'].includes(a.type));
    }
    return you;
  }

  // ボットやテストが参照する、マップの静的情報
  staticInfo() {
    return {
      seed: this.seed,
      map: {
        w: this.map.w,
        h: this.map.h,
        tiles: this.map.tiles,
        pallets: this.map.pallets,
        windows: this.map.windows,
        gens: this.map.gens,
        cages: this.map.cages,
        lockers: this.map.lockers,
        gates: this.map.gates,
      },
      characters: SURVIVOR_CHARACTERS,
    };
  }
}
