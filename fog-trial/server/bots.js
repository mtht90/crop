// ボット AI。人数が足りないときの穴埋めと、ソロ練習用。
// ボットは人間と同じ「入力コマンド」を生成し、同じ視界ルールで判断する
// (霧の中のサバイバーを透視したりはしない)。

import { BTN, HEALTH, KILLER, INTERACT_RANGE, VISION } from '../shared/constants.js';
import { makeCostFn, findPath } from './pathfinding.js';
import { lineOfSight } from '../shared/physics.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (o) => ({ x: o.x + 0.5, y: o.y + 0.5 });

// ボットの強さ (0: よわい, 1: ふつう, 2: つよい)
export const BOT_LEVELS = {
  killer: [
    { reaction: 1.1, tracking: 2, attackRange: 1.7, dashChance: 0.01, howl: false },
    { reaction: 0.7, tracking: 4, attackRange: 2.0, dashChance: 0.025, howl: true },
    { reaction: 0.35, tracking: 6, attackRange: 2.2, dashChance: 0.05, howl: true },
  ],
  survivor: [{ skill: 0.65 }, { skill: 0.8 }, { skill: 0.93 }],
};

class BaseBrain {
  constructor(game, id, rng, level = 1) {
    this.game = game;
    this.level = BOT_LEVELS[this.role][Math.max(0, Math.min(2, level))];
    this.id = id;
    this.rng = rng;
    this.cost = makeCostFn(game, this.role);
    this.path = null;
    this.goalKey = null;
    this.pathAt = -1;
    this.lastPos = null;
    this.stuckT = 0;
    this.nudge = null;
    this.prevButtons = 0;
  }

  get me() {
    return this.game.players.get(this.id);
  }

  // 目的地 (タイル座標) へ経路を引き、次に進む方向を返す
  steer(goal, key) {
    const g = this.game;
    const me = this.me;
    const tx = Math.floor(me.x);
    const ty = Math.floor(me.y);
    if (key !== this.goalKey || !this.path || g.time - this.pathAt > 0.6) {
      this.path = findPath(g, this.cost, tx, ty, goal.x, goal.y);
      this.goalKey = key;
      this.pathAt = g.time;
    }
    const path = this.path;
    if (!path || !path.length) return null;
    // 通過済みのマスを捨てる
    while (path.length > 1) {
      const n = path[0];
      if (Math.floor(me.x) === n.x && Math.floor(me.y) === n.y) path.shift();
      else if (Math.hypot(n.x + 0.5 - me.x, n.y + 0.5 - me.y) < 0.35) path.shift();
      else break;
    }
    const next = path[0];
    const sp = this.cost.special(next.x, next.y);
    let target = center(next);
    // 少し先が直接見えるなら、そちらへ向かって滑らかに
    if (!sp && path.length > 1) {
      const n2 = path[1];
      const sp2 = this.cost.special(n2.x, n2.y);
      if (!sp2 && this.clearLine(me, center(n2))) target = center(n2);
    }
    return { dx: target.x - me.x, dy: target.y - me.y, special: sp, next };
  }

  clearLine(a, b) {
    const r = 0.36;
    const isSolid = this.game.grid.isSolid;
    // 両端を半径ぶん横にずらした 2 本の線で判定 (角に引っかからないか)
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * r;
    const ny = (dx / l) * r;
    return lineOfSight(a.x + nx, a.y + ny, b.x + nx, b.y + ny, isSolid) && lineOfSight(a.x - nx, a.y - ny, b.x - nx, b.y - ny, isSolid);
  }

  checkStuck(moving) {
    const me = this.me;
    const g = this.game;
    if (!this.lastPos || dist(me, this.lastPos) > 0.4) {
      this.lastPos = { x: me.x, y: me.y };
      this.stuckT = g.time;
    }
    if (moving && g.time - this.stuckT > 1.4) {
      const a = this.rng() * Math.PI * 2;
      this.nudge = { x: Math.cos(a), y: Math.sin(a), until: g.time + 0.4 };
      this.path = null;
      this.stuckT = g.time;
    }
    if (this.nudge && this.nudge.until > g.time) return this.nudge;
    return null;
  }

  // 押しっぱなしのボタンから「押した瞬間」を作る
  finish(buttons, move, aim) {
    const pressed = buttons & ~this.prevButtons;
    this.prevButtons = buttons;
    return { buttons, pressed, move, aim };
  }

  onEvent() {}
}

// ============================================================
export class SurvivorBrain extends BaseBrain {
  get role() {
    return 'survivor';
  }

  constructor(game, id, rng, level) {
    super(game, id, rng, level);
    this.seenKiller = null; // { x, y, t }
    this.genTarget = null;
    this.fleeGoal = null;
    this.fleeAt = -1;
    this.wiggleAt = 0;
    this.wiggleSide = 1;
    this.lastDanger = -99;
    this.pendingSkill = null;
    this.hideCheckAt = 0;
    this.selfUnhookAt = 0;
    this.skillLevel = this.level.skill + (rng() - 0.5) * 0.08;
    this.floor = [];
    for (let y = 1; y < game.map.h - 1; y++) {
      for (let x = 1; x < game.map.w - 1; x++) if (!game.grid.isSolid(x, y)) this.floor.push({ x, y });
    }
  }

  onEvent(e) {
    if (e.kind === 'skill') {
      const s = e.skill;
      const r = this.rng();
      let result = 'good';
      if (r > this.skillLevel) result = 'miss';
      else if (r < 0.15) result = 'great';
      this.pendingSkill = { id: s.id, result, at: this.game.time + s.warn + s.spin * (0.3 + this.rng() * 0.5) };
    }
  }

  think() {
    const g = this.game;
    const me = this.me;
    if (!me) return null;
    const h = g.killer;

    if (this.pendingSkill && g.time >= this.pendingSkill.at) {
      g.resolveSkill(me, this.pendingSkill.id, this.pendingSkill.result);
      this.pendingSkill = null;
    }

    if (me.health === HEALTH.ESCAPED || me.health === HEALTH.DEAD) return null;

    if (me.health === HEALTH.CARRIED) {
      if (g.time >= this.wiggleAt) {
        this.wiggleAt = g.time + 0.12 + this.rng() * 0.1;
        this.wiggleSide = -this.wiggleSide;
        const b = this.wiggleSide > 0 ? BTN.RIGHT : BTN.LEFT;
        return { buttons: b, pressed: b };
      }
      return { buttons: 0, pressed: 0 };
    }

    if (me.health === HEALTH.CAGED) {
      // 仲間が誰も助けに来られないときだけ自力脱出を試みる
      const helpers = g.survivors().filter((s) => s !== me && (s.health === HEALTH.HEALTHY || s.health === HEALTH.INJURED));
      if (!helpers.length && me.hookStage === 1 && g.time > this.selfUnhookAt) {
        this.selfUnhookAt = g.time + 4;
        return { buttons: BTN.ACTION, pressed: BTN.ACTION };
      }
      return { buttons: 0, pressed: 0 };
    }

    // 知覚
    if (h && g.canSee(me, h)) this.seenKiller = { x: h.x, y: h.y, t: g.time, a: h.angle };
    const seenRecently = this.seenKiller && g.time - this.seenKiller.t < 2;
    const heartbeat = h ? Math.max(0, 1 - dist(me, h) / VISION.terrorRadius) : 0;
    const danger = seenRecently && dist(me, this.seenKiller) < (me.health === HEALTH.INJURED ? 10 : 8);
    if (danger) this.lastDanger = g.time;

    if (me.hidden !== null) {
      if (!me.action && heartbeat === 0 && g.time - this.lastDanger > 6) return this.finish(BTN.INTERACT, null, me.angle);
      return this.finish(0, null, me.angle);
    }
    if (me.action && ['vault', 'pallet_vault', 'pallet_drop', 'locker_enter', 'locker_exit', 'unhook', 'hatch_jump'].includes(me.action.type)) {
      return this.finish(0, null, me.angle);
    }

    if (me.health === HEALTH.DOWNED) {
      const away = this.seenKiller ? this.pickFlee() : null;
      if (away) return this.moveTo(away, 'crawl', 0);
      return this.finish(0, null, me.angle);
    }

    // 開いたゲートがあれば一直線に
    const openGate = g.gates.find((gt) => gt.open);
    if (openGate) {
      const [gx, gy] = openGate.tiles[0];
      return this.moveTo({ x: gx, y: gy }, 'exit' + openGate.id, 0);
    }

    if (danger) {
      // 追われている: 近くに板があれば倒す
      const dropped = this.tryPallet();
      if (dropped) return dropped;
      // 心音が大きく、まだ見つかっていなければロッカーに隠れる手も
      if (g.time > this.hideCheckAt) {
        this.hideCheckAt = g.time + 2;
        const locker = g.lockers.find((l) => !l.occupant && dist(me, center(l)) < 3);
        if (locker && h && !g.canSee(h, me) && this.rng() < 0.3) {
          if (dist(me, center(locker)) < INTERACT_RANGE) return this.finish(BTN.INTERACT, null, me.angle);
          return this.moveTo(locker, 'locker' + locker.id, 0);
        }
      }
      const goal = this.pickFlee();
      if (goal) return this.moveTo(goal, 'flee', 0);
    }

    const safe = g.time - this.lastDanger > 5;

    // 最後の 1 人ならハッチ
    if (g.hatch && g.hatch.open) {
      if (dist(me, center(g.hatch)) < INTERACT_RANGE) return this.finish(this.prevButtons & BTN.INTERACT ? 0 : BTN.INTERACT, null, me.angle);
      return this.moveTo(g.hatch, 'hatch', 0);
    }

    // フックの仲間を救出
    for (const c of g.cages) {
      if (!c.occupant) continue;
      const killerNear = this.seenKiller && g.time - this.seenKiller.t < 6 && dist(this.seenKiller, center(c)) < 6;
      if (killerNear) continue;
      if (dist(me, center(c)) < INTERACT_RANGE + 0.1) return this.finish(BTN.INTERACT, null, me.angle);
      return this.moveTo(c, 'cage' + c.id, 0);
    }

    // ダウンした仲間を起こす
    if (safe) {
      const downed = g
        .survivors()
        .find((s) => s !== me && s.health === HEALTH.DOWNED && dist(me, s) < 25 && !(h && dist(h, s) < 6 && g.canSee(me, h)));
      if (downed) {
        if (dist(me, downed) < INTERACT_RANGE) return this.finish(BTN.INTERACT, null, me.angle);
        return this.moveTo({ x: Math.floor(downed.x), y: Math.floor(downed.y) }, 'heal' + downed.id, 0);
      }
    }

    // ゲートに電気が来ていれば開けに行く
    if (g.gates[0].powered) {
      let best = null;
      for (const gt of g.gates) if (!best || dist(me, gt) < dist(me, best)) best = gt;
      const front = { x: best.side === 'left' ? 1 : g.map.w - 2, y: Math.floor(best.y) };
      if (dist(me, { x: best.x, y: best.y }) < INTERACT_RANGE + 1.0) return this.finish(BTN.INTERACT, null, me.angle);
      return this.moveTo(front, 'gate' + best.id, 0);
    }

    // 安全なら傷をなめて治す
    if (me.health === HEALTH.INJURED && safe && g.time - this.lastDanger > 10 && heartbeat === 0) {
      return this.finish(BTN.INTERACT, null, me.angle);
    }

    // 発電機修理
    const gen = this.pickGen();
    if (gen) {
      if (dist(me, center(gen)) < INTERACT_RANGE - 0.05) {
        // 心音が近づいたら手を離して様子を見る
        if (heartbeat > 0.55 && !seenRecently) return this.finish(BTN.SNEAK, null, me.angle);
        return this.finish(BTN.INTERACT, null, me.angle);
      }
      return this.moveTo(gen, 'gen' + gen.id, heartbeat > 0.4 ? BTN.SNEAK : 0);
    }
    return this.finish(0, null, me.angle);
  }

  moveTo(goal, key, extra) {
    const me = this.me;
    if (Math.floor(me.x) === Math.floor(goal.x) && Math.floor(me.y) === Math.floor(goal.y)) {
      const c = { x: Math.floor(goal.x) + 0.5, y: Math.floor(goal.y) + 0.5 };
      if (dist(me, c) < 0.3) return this.finish(extra, null, me.angle);
      return this.finish(extra, { x: c.x - me.x, y: c.y - me.y }, me.angle);
    }
    const s = this.steer({ x: Math.floor(goal.x), y: Math.floor(goal.y) }, key);
    if (!s) return this.finish(extra, null, me.angle);
    let buttons = extra;
    let move = { x: s.dx, y: s.dy };
    const nudge = this.checkStuck(true);
    if (nudge) move = nudge;
    if (s.special) {
      const c = center(s.next);
      const near = Math.hypot(c.x - me.x, c.y - me.y) < 1.1;
      if (near && (s.special.kind === 'window' || s.special.obj.state === 'down')) buttons |= BTN.ACTION;
    }
    const aim = Math.atan2(move.y, move.x);
    // ACTION は押した瞬間しか効かないので、押しっぱなしにならないよう毎回離す
    const out = this.finish(buttons, move, aim);
    if (buttons & BTN.ACTION) this.prevButtons &= ~BTN.ACTION;
    return out;
  }

  tryPallet() {
    const g = this.game;
    const me = this.me;
    const h = g.killer;
    if (!h || !this.seenKiller || g.time - this.seenKiller.t > 0.5) return null;
    for (const p of g.pallets) {
      if (p.state !== 'up') continue;
      const c = center(p);
      if (dist(me, c) > 1.15) continue;
      const mine = p.axis === 'v' ? me.y - c.y : me.x - c.x;
      const his = p.axis === 'v' ? h.y - c.y : h.x - c.x;
      const close = dist(h, c) < 3.2;
      if (close && (Math.sign(mine) !== Math.sign(his) || Math.abs(his) < 0.6) && Math.abs(mine) > 0.3) {
        const out = this.finish(BTN.ACTION, null, me.angle);
        this.prevButtons &= ~BTN.ACTION;
        return out;
      }
    }
    return null;
  }

  // 追われているとき: 近くの板・窓の「向こう側」を目指す (ループの基本)
  pickLoop() {
    const g = this.game;
    const me = this.me;
    const hz = this.seenKiller;
    let best = null;
    let bestScore = -Infinity;
    const toH = Math.atan2(hz.y - me.y, hz.x - me.x);
    const consider = (obj, bonus, offset) => {
      const c = center(obj);
      const dm = dist(me, c);
      if (dm > 7) return;
      const dh = dist(hz, c);
      const axisMe = obj.axis === 'v' ? me.y - c.y : me.x - c.x;
      const axisH = obj.axis === 'v' ? hz.y - c.y : hz.x - c.x;
      const sameSide = Math.sign(axisMe) === Math.sign(axisH) || Math.abs(axisH) < 0.4;
      // キラーと同じ側にいるなら、十分先回りできるときだけ抜ける
      if (sameSide && dh < dm + 1.5) return;
      if (!sameSide && dh < 1.2) return;
      // キラーに向かって走らない
      const ang = Math.atan2(c.y - me.y, c.x - me.x);
      let da = Math.abs(ang - toH);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (sameSide && da < Math.PI / 3 && dm > 1.5) return;
      const side = Math.abs(axisH) > 0.3 ? -Math.sign(axisH) : -Math.sign(axisMe || 1);
      const far = obj.axis === 'v' ? { x: obj.x, y: obj.y + side * offset } : { x: obj.x + side * offset, y: obj.y };
      if (g.grid.isSolid(far.x, far.y)) return;
      const score = bonus - dm * 0.6 + (dh - dm) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = { x: far.x, y: far.y, via: obj };
      }
    };
    for (const p of g.pallets) {
      if (p.state === 'up') consider(p, 3, 1);
      else if (p.state === 'down') consider(p, 2, 2);
    }
    for (const w of g.windows) consider(w, 1.5, 2);
    return best;
  }

  pickFlee() {
    const g = this.game;
    const me = this.me;
    const hz = this.seenKiller;
    if (!hz) return null;
    if (this.fleeGoal && g.time - this.fleeAt < 0.9 && dist(me, center(this.fleeGoal)) > 1.2) return this.fleeGoal;
    if (me.health !== HEALTH.DOWNED && dist(me, hz) < 8) {
      const loop = this.pickLoop();
      if (loop) {
        this.fleeGoal = loop;
        this.fleeAt = g.time;
        return loop;
      }
    }
    let best = null;
    let bestScore = -Infinity;
    const toH = Math.atan2(hz.y - me.y, hz.x - me.x);
    for (let i = 0; i < 40; i++) {
      const c = this.floor[Math.floor(this.rng() * this.floor.length)];
      const cc = center(c);
      const dm = dist(me, cc);
      if (dm < 3 || dm > 14) continue;
      const ang = Math.atan2(cc.y - me.y, cc.x - me.x);
      let da = Math.abs(ang - toH);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < Math.PI / 3) continue; // キラーの方向へは逃げない
      let score = dist(hz, cc) * 1.2 - dm * 0.3 + da;
      // 板や窓の近くは追いかけっこに有利
      for (const p of g.pallets) if (p.state === 'up' && dist(cc, center(p)) < 2.5) score += 3;
      for (const w of g.windows) if (dist(cc, center(w)) < 2.5) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    this.fleeGoal = best;
    this.fleeAt = g.time;
    return best;
  }

  pickGen() {
    const g = this.game;
    const me = this.me;
    if (this.genTarget && !g.gens[this.genTarget.id].done) {
      const danger = this.seenKiller && g.time - this.seenKiller.t < 15 && dist(this.seenKiller, center(this.genTarget)) < 7;
      if (!danger) return this.genTarget;
    }
    let best = null;
    let bestScore = Infinity;
    for (const gen of g.gens) {
      if (gen.done) continue;
      let score = dist(me, center(gen)) - gen.progress * 12;
      if (this.seenKiller && g.time - this.seenKiller.t < 20 && dist(this.seenKiller, center(gen)) < 8) score += 25;
      if (gen.workers >= 2) score += 10;
      if (score < bestScore) {
        bestScore = score;
        best = gen;
      }
    }
    this.genTarget = best;
    return best;
  }
}

// ============================================================
export class KillerBrain extends BaseBrain {
  get role() {
    return 'killer';
  }

  constructor(game, id, rng, level) {
    super(game, id, rng, level);
    this.target = null; // { id, x, y, t }
    this.patrol = null;
    this.patrolAt = -99;
    this.lastChase = 0;
    this.dashState = null;
    this.searched = new Map();
    this.investigate = null;
    this.downedMemory = new Map(); // id -> {x,y,t}
    this.firstSeen = new Map();
    this.reaction = this.level.reaction;
  }

  think() {
    const g = this.game;
    const me = this.me;
    if (!me) return null;
    const a = me.action;
    if (a && ['vault', 'pickup', 'hook', 'break_pallet', 'kick_gen', 'search_locker', 'close_hatch', 'stunned'].includes(a.type)) {
      this.dashState = null;
      return this.finish(0, null, me.angle);
    }

    // 運搬中: 一番近い空きフックへ
    if (me.carrying) {
      let best = null;
      for (const c of g.cages) {
        if (c.occupant || c.broken) continue;
        if (!best || dist(me, center(c)) < dist(me, center(best))) best = c;
      }
      if (!best) return this.finish(0, null, me.angle);
      if (dist(me, center(best)) < INTERACT_RANGE + 0.3) return this.press(BTN.ACTION, me.angle);
      return this.moveTo(best, 'cage' + best.id);
    }

    // 見えているサバイバー
    const visible = [];
    for (const s of g.survivors()) {
      if (s.hidden !== null) continue;
      if (![HEALTH.HEALTHY, HEALTH.INJURED, HEALTH.DOWNED].includes(s.health)) continue;
      if (g.canSee(me, s) || g.reveals.some((r) => r.id === s.id)) visible.push(s);
    }
    for (const s of visible) if (s.health === HEALTH.DOWNED) this.downedMemory.set(s.id, { x: s.x, y: s.y, t: g.time });
    for (const [id, m] of this.downedMemory) {
      const s = g.players.get(id);
      if (!s || s.health !== HEALTH.DOWNED || g.time - m.t > 30) this.downedMemory.delete(id);
    }

    // 反応速度: 視界に入ってから少し経たないと追いかけ始めない
    for (const s of visible) if (!this.firstSeen.has(s.id)) this.firstSeen.set(s.id, g.time);
    for (const id of [...this.firstSeen.keys()]) if (!visible.some((s) => s.id === id)) this.firstSeen.delete(id);
    const reacted = (s) => g.time - this.firstSeen.get(s.id) >= this.reaction || (this.target && this.target.id === s.id) || dist(me, s) < 3;
    const standing = visible.filter((s) => s.health !== HEALTH.DOWNED && reacted(s));
    standing.sort((x, y) => dist(me, x) - dist(me, y));
    let chase = standing[0];
    if (this.target && !chase) {
      // 見失った直後は最後に見た場所へ
      if (g.time - this.target.t > 6) this.target = null;
    }

    // 近くにダウンがいて、立っている相手が遠ければ担ぎに行く
    const downedNear = [...this.downedMemory.entries()].map(([id, m]) => ({ id, ...m })).sort((x, y) => dist(me, x) - dist(me, y))[0];
    if (downedNear && (!chase || dist(me, chase) > 5)) {
      if (dist(me, downedNear) < INTERACT_RANGE + 0.1) {
        const s = g.players.get(downedNear.id);
        return this.press(BTN.ACTION, Math.atan2(s.y - me.y, s.x - me.x));
      }
      return this.moveTo({ x: downedNear.x, y: downedNear.y }, 'downed' + downedNear.id);
    }

    if (chase) {
      this.target = { id: chase.id, x: chase.x, y: chase.y, t: g.time };
      this.lastChase = g.time;
      return this.chase(chase);
    }

    // 突進チャージ中なら一旦解除
    this.dashState = null;

    if (this.target) {
      const tgt = this.target;
      const ts = g.players.get(tgt.id);
      if (dist(me, tgt) > 1.2) return this.moveTo(tgt, 'last' + tgt.id, Math.atan2(tgt.y - me.y, tgt.x - me.x));
      // 最後に見た場所に着いた: 足あとを追うか、ロッカーを調べる
      const lockers = g.lockers.filter((l) => dist(tgt, center(l)) < 4 && (this.searched.get(l.id) || 0) < g.time - 20);
      if (ts && ts.hidden !== null && lockers.length && this.rng() < 0.7) {
        const l = lockers.sort((x, y) => dist(me, center(x)) - dist(me, center(y)))[0];
        this.searched.set(l.id, g.time);
        this.investigate = { x: l.x, y: l.y, locker: l.id, t: g.time };
      }
      this.target = null;
    }

    // 足あと・物音を追跡
    if (!this.investigate || g.time - this.investigate.t > 8) {
      const clue = this.freshestClue();
      if (clue) this.investigate = { ...clue, t: g.time };
    }
    if (this.investigate) {
      const inv = this.investigate;
      if (inv.locker !== undefined) {
        const l = g.lockers[inv.locker];
        if (dist(me, center(l)) < INTERACT_RANGE + 0.1) {
          this.investigate = null;
          return this.press(BTN.ACTION, Math.atan2(l.y + 0.5 - me.y, l.x + 0.5 - me.x));
        }
        return this.moveTo(l, 'locker' + l.id);
      }
      if (dist(me, inv) < 1.5) this.investigate = null;
      else return this.moveTo(inv, 'inv' + Math.floor(inv.x) + ',' + Math.floor(inv.y));
    }

    // 咆哮で探す
    if (this.level.howl && me.howlCd <= 0 && g.time - this.lastChase > 8) return this.press(BTN.HOWL, me.angle);

    // ハッチが見えたら閉じる
    if (g.hatch && g.hatch.open && dist(me, center(g.hatch)) < 10) {
      if (dist(me, center(g.hatch)) < INTERACT_RANGE + 0.2) return this.press(BTN.ACTION, me.angle);
      return this.moveTo(g.hatch, 'hatch');
    }

    return this.doPatrol();
  }

  freshestClue() {
    const g = this.game;
    const me = this.me;
    let best = null;
    for (const n of g.noises) {
      if (g.time - n.t > 2.5 || n.kind === 'gen_done') continue;
      if (!best || n.t > best.t) best = { x: n.x, y: n.y, t: n.t };
    }
    if (best) return best;
    for (const pr of g.prints) {
      if (g.time - pr.t > this.level.tracking || dist(me, pr) > 12) continue;
      if (!best || pr.t > best.t) best = { x: pr.x, y: pr.y, t: pr.t };
    }
    return best;
  }

  doPatrol() {
    const g = this.game;
    const me = this.me;
    if (!this.patrol || g.time - this.patrolAt > 25 || dist(me, this.patrol) < 1.4) {
      if (this.patrol && this.patrol.gen !== undefined) {
        const gen = g.gens[this.patrol.gen];
        // 修理が進んでいたら蹴る
        if (dist(me, center(gen)) < INTERACT_RANGE + 0.1 && !gen.done && !gen.regressing && gen.progress > 0.12) {
          this.patrol = null;
          return this.press(BTN.ACTION, Math.atan2(gen.y + 0.5 - me.y, gen.x + 0.5 - me.x));
        }
      }
      let options;
      if (g.gates[0].powered) options = g.gates.map((gt) => ({ x: gt.side === 'left' ? 2 : g.map.w - 3, y: Math.floor(gt.y) }));
      else options = g.gens.filter((gen) => !gen.done).map((gen) => ({ x: gen.x, y: gen.y, gen: gen.id }));
      if (!options.length) options = g.cages.map((c) => ({ x: c.x, y: c.y }));
      // 近すぎず遠すぎない場所を選ぶ (ランダム性あり)
      options.sort((x, y) => dist(me, x) + this.rng() * 18 - (dist(me, y) + this.rng() * 18));
      this.patrol = options.find((o) => dist(me, o) > 2) || options[0];
      this.patrolAt = g.time;
    }
    return this.moveTo(this.patrol, 'patrol' + this.patrol.x + ',' + this.patrol.y);
  }

  chase(s) {
    const g = this.game;
    const me = this.me;
    const d = dist(me, s);
    const aimAt = Math.atan2(s.y + s.vy * 0.15 - me.y, s.x + s.vx * 0.15 - me.x);
    const los = lineOfSight(me.x, me.y, s.x, s.y, g.grid.isSolid);
    const act = me.action ? me.action.type : null;

    // 突進
    if (this.dashState) {
      if (this.dashState.release <= g.time || !los) {
        this.dashState = null;
        return this.finish(0, { x: Math.cos(aimAt), y: Math.sin(aimAt) }, aimAt);
      }
      return this.finish(BTN.POWER, null, aimAt);
    }
    if (!act && los && d > 4 && d < 8 && me.dashCd <= 0 && this.rng() < this.level.dashChance) {
      this.dashState = { release: g.time + KILLER.chargeTime + 0.05 };
      return this.finish(BTN.POWER, null, aimAt);
    }

    if (!act && los && d < this.level.attackRange) return this.press(BTN.ATTACK, aimAt);
    if (act === 'lunge' || act === 'dash') return this.finish(0, null, aimAt);
    if (los && d < 5 && this.clearLine(me, s)) {
      return this.finish(0, { x: s.x - me.x, y: s.y - me.y }, aimAt);
    }
    return this.moveTo({ x: s.x, y: s.y }, 'chase' + s.id + Math.floor(s.x) + ',' + Math.floor(s.y), aimAt);
  }

  press(btn, aim) {
    const out = this.finish(btn, null, aim);
    this.prevButtons &= ~btn;
    return out;
  }

  moveTo(goal, key, aimOverride) {
    const me = this.me;
    const s = this.steer({ x: Math.floor(goal.x), y: Math.floor(goal.y) }, key);
    if (!s) return this.finish(0, null, me.angle);
    let move = { x: s.dx, y: s.dy };
    const nudge = this.checkStuck(true);
    if (nudge) move = nudge;
    let buttons = 0;
    if (s.special) {
      const c = center(s.next);
      const near = Math.hypot(c.x - me.x, c.y - me.y) < 1.2;
      if (near && (s.special.kind === 'window' || s.special.obj.state === 'down')) buttons |= BTN.ACTION;
    }
    const aim = aimOverride ?? Math.atan2(move.y, move.x);
    const out = this.finish(buttons, move, aim);
    this.prevButtons &= ~BTN.ACTION;
    return out;
  }
}

export function createBrain(game, player, rng, level = 1) {
  return player.role === 'killer' ? new KillerBrain(game, player.id, rng, level) : new SurvivorBrain(game, player.id, rng, level);
}
