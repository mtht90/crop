/* カードTD — 戦闘(シミュレーションと描画) */
(function (CTD) {
  'use strict';

  const R = CTD.RULES;
  const W = 1280, H = 720;
  const GROUND = 470;          // 背景の地面ライン
  const FEET0 = 482, FEET1 = 534; // 足元の y 範囲(奥〜手前)
  const FLY = 96;              // 飛行ユニットの高さ
  const X0 = 150, XS = 0.98;   // ワールド x → 画面 x
  const CASTLE_Y = 528;
  const UNIT_SCALE = 1.15;
  CTD.LAYOUT = { W, H, GROUND, FEET0, FEET1, FLY, X0, XS };

  const sx = (x) => X0 + x * XS;
  const fy = (d) => FEET0 + d * (FEET1 - FEET0);
  CTD.worldToScreenX = sx;
  CTD.screenToWorldX = (px) => (px - X0) / XS;
  CTD.screenToDepth = (py) => Math.max(0, Math.min(1, (py - FEET0) / (FEET1 - FEET0)));

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function radius(def) { return def.large ? 20 : def.flying ? 9 : 11; }

  class Side {
    constructor(idx, deck, castleHp) {
      this.idx = idx;
      this.dir = idx === 0 ? 1 : -1;
      this.mana = R.startMana;
      this.draw = shuffle(deck.slice());
      this.discard = [];
      this.hand = [];
      for (let i = 0; i < R.handSize; i++) this.hand.push({ id: this.draw.pop(), cd: 0, cdMax: 0 });
      this.castle = { hp: castleHp, max: castleHp, hitT: 0, arrowCd: 1 };
      this.manaAcc = 0;
      this.plays = 0;
      this.manaSpent = 0;
    }
    get next() { return this.draw.length ? this.draw[this.draw.length - 1] : (this.discard.length ? '?' : null); }
    zone() { return this.idx === 0 ? R.playerZone : R.enemyZone; }
  }

  class Battle {
    constructor(stage, playerDeck, opts = {}) {
      this.stage = stage;
      this.world = CTD.WORLDS.find(w => w.id === stage.world);
      this.opts = opts;
      const ehp = Math.round(R.castleHp * (stage.enemyHp || 1));
      this.sides = [new Side(0, playerDeck, R.castleHp), new Side(1, stage.deck, ehp)];
      this.units = [];
      this.projectiles = [];
      this.fx = [];
      this.texts = [];
      this.time = 0;            // 試合経過(秒)
      this.ready = 3.2;         // 開始前カウントダウン
      this.over = null;
      this.t = 0;               // 演出用の時間
      this.shake = 0;
      this.uid = 1;
      this.events = [];         // UI へ渡す出来事
      this.speed = 1;
      this.drag = null;         // { id, x, depth, valid }
    }

    // ---- 操作 ----
    canPlay(sideIdx, slot) {
      const s = this.sides[sideIdx];
      const h = s.hand[slot];
      if (!h || !h.id || this.over || this.ready > 0) return false;
      return h.cd <= 0 && s.mana >= CTD.CARDS[h.id].cost;
    }
    validSpot(sideIdx, x) {
      const z = this.sides[sideIdx].zone();
      return x >= z[0] && x <= z[1];
    }
    play(sideIdx, slot, x, depth) {
      if (!this.canPlay(sideIdx, slot)) return false;
      const s = this.sides[sideIdx];
      const z = s.zone();
      x = Math.max(z[0], Math.min(z[1], x));
      depth = Math.max(0, Math.min(1, depth));
      const h = s.hand[slot];
      const def = CTD.CARDS[h.id];
      s.mana -= def.cost;
      s.manaSpent += def.cost;
      s.plays++;
      for (let i = 0; i < def.count; i++) {
        const off = i * 16;
        this.spawn(def, sideIdx, x - s.dir * off, Math.max(0, Math.min(1, depth + (i ? 0.35 : 0) * (depth > 0.5 ? -1 : 1))));
      }
      this.fxRing(x, depth, s.idx === 0 ? '#5aa0ff' : '#ff6a5a', 40, 0.4);
      this.sprite('bluetop', x, depth, CTD.CARDS[h.id].flying ? FLY : 0, 120, 0.6, { bottom: true });
      CTD.sfx && CTD.sfx('deploy');
      // 補充とクールダウン
      s.discard.push(h.id);
      if (!s.draw.length) { s.draw = shuffle(s.discard); s.discard = []; }
      const cd = def.cost * R.cooldownPerCost;
      s.hand[slot] = { id: s.draw.pop(), cd, cdMax: cd };
      this.events.push({ type: 'play', side: sideIdx, id: def.id });
      return true;
    }

    spawn(def, sideIdx, x, depth) {
      const u = {
        uid: this.uid++, def, id: def.id, side: sideIdx, dir: this.sides[sideIdx].dir,
        x, depth, hp: def.hp, maxHp: def.hp,
        atkCd: 0.25, anim: -1, animDur: 0.5, pending: null,
        walk: Math.random() * 6, moving: false,
        slowT: 0, stunT: 0, flash: 0, healT: 0, healCd: def.heal ? def.heal.interval : 0,
        haste: 1, might: 1, state: 'spawn', spawnT: 0.35, deadT: 0, revived: false, charged: !def.charge,
        dmgDealt: 0,
      };
      this.units.push(u);
      return u;
    }

    // ---- 更新 ----
    update(dt) {
      dt *= this.speed;
      this.t += dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
      if (this.ready > 0) {
        const before = Math.ceil(this.ready);
        this.ready -= dt;
        if (Math.ceil(this.ready) !== before) this.events.push({ type: 'count', n: Math.max(0, Math.ceil(this.ready)) });
        this.updateFx(dt);
        return;
      }
      if (this.over) { this.updateFx(dt); this.updateUnits(dt * 0.25, true); return; }
      // 小さく刻んで安定させる
      let rest = dt;
      while (rest > 0) {
        const step = Math.min(rest, 1 / 60);
        this.step(step);
        rest -= step;
        if (this.over) break;
      }
      this.updateFx(dt);
    }

    step(dt) {
      const prevMin = Math.floor(this.time / 30);
      this.time += dt;
      if (Math.floor(this.time / 30) !== prevMin) {
        const m = this.time;
        if (Math.abs(m - 60) < 0.05 || Math.abs(m - 120) < 0.05 || Math.abs(m - 150) < 0.05) this.events.push({ type: 'surge', interval: CTD.regenInterval(m) });
      }
      // マナ
      const iv = CTD.regenInterval(this.time);
      for (const s of this.sides) {
        if (s.mana < R.maxMana) s.mana = Math.min(R.maxMana, s.mana + dt / iv);
        for (const h of s.hand) if (h.cd > 0) h.cd = Math.max(0, h.cd - dt);
        if (s.castle.hitT > 0) s.castle.hitT = Math.max(0, s.castle.hitT - dt);
      }
      this.updateCastles(dt);
      this.updateUnits(dt, false);
      this.updateProjectiles(dt);
      // 勝敗
      const [p, e] = this.sides;
      if (e.castle.hp <= 0 || p.castle.hp <= 0) {
        this.finish(e.castle.hp <= 0 && p.castle.hp > 0 ? 'win' : p.castle.hp <= 0 && e.castle.hp > 0 ? 'lose' : 'draw', true);
      } else if (this.time >= R.matchTime) {
        const pr = p.castle.hp / p.castle.max, er = e.castle.hp / e.castle.max;
        // 城の HP は割合で比べる(ステージごとに相手の最大HPが違うため)
        this.finish(Math.abs(pr - er) < 1e-6 ? 'draw' : pr > er ? 'win' : 'lose', false);
      }
    }

    finish(result, destroyed) {
      const p = this.sides[0];
      this.over = {
        result, destroyed,
        time: Math.min(this.time, R.matchTime),
        hpRatio: Math.max(0, p.castle.hp) / p.castle.max,
        enemyRatio: Math.max(0, this.sides[1].castle.hp) / this.sides[1].castle.max,
      };
      if (destroyed) {
        const loser = result === 'win' ? 1 : 0;
        const cx = loser === 1 ? R.laneLength - 20 : 20;
        for (let i = 0; i < 8; i++) setTimeout(() => this.explosion(cx + (Math.random() - 0.5) * 120, Math.random()), i * 120);
        this.shake = 1.2;
      }
      this.events.push({ type: 'over', ...this.over });
    }

    enemiesOf(u) { return this.units.filter(e => e.side !== u.side && (e.state === 'walk' || e.state === 'attack')); }

    alliesOf(u) { return this.units.filter(e => e.side === u.side && e.state !== 'dead' && e.state !== 'reviving'); }

    updateCastles(dt) {
      const ca = R.castleArrow;
      for (const s of this.sides) {
        s.castle.arrowCd -= dt;
        if (s.castle.arrowCd > 0) continue;
        const face = s.idx === 0 ? 0 : R.laneLength;
        let best = null, bd = Infinity;
        for (const u of this.units) {
          if (u.side === s.idx || (u.state !== 'walk' && u.state !== 'attack')) continue;
          const d = Math.abs(u.x - face);
          if (d <= ca.range && d < bd) { bd = d; best = u; }
        }
        if (best) {
          s.castle.arrowCd = ca.interval;
          this.projectiles.push(this.makeProj({
            kind: 'arrow', side: s.idx, x: face - s.dir * 20, z: 230, depth: 0.2,
            target: best, dmg: ca.dmg, def: { id: 'castle' }, might: 1, speed: 520,
          }));
          CTD.sfx && CTD.sfx('arrow', 0.4);
        } else s.castle.arrowCd = 0.2;
      }
    }

    updateUnits(dt, frozen) {
      // オーラ(攻撃速度・攻撃力)
      for (const u of this.units) { u.haste = 1; u.might = 1; }
      for (const a of this.units) {
        if (!a.def.aura || (a.state !== 'walk' && a.state !== 'attack')) continue;
        for (const b of this.units) {
          if (b.side !== a.side || b === a || b.state === 'dead') continue;
          if (Math.abs(b.x - a.x) <= a.def.aura.radius) {
            if (a.def.aura.kind === 'haste') b.haste = Math.max(b.haste, 1 + a.def.aura.value);
            else b.might = Math.max(b.might, 1 + a.def.aura.value);
          }
        }
      }

      for (const u of this.units) {
        u.flash = Math.max(0, u.flash - dt * 5);
        u.healT = Math.max(0, u.healT - dt * 2);
        if (u.state === 'dead') { u.deadT += dt; continue; }
        if (u.state === 'spawn') {
          u.spawnT -= dt;
          if (u.spawnT <= 0) u.state = 'walk';
          continue;
        }
        if (u.state === 'reviving') {
          u.reviveT -= dt;
          if (u.reviveT <= 0) {
            u.state = 'walk'; u.hp = u.maxHp * u.def.revive; u.flash = 1;
            this.sparkle(u, '#b0f0ff', 10);
          }
          continue;
        }
        if (frozen) { u.moving = false; continue; }
        const def = u.def;
        const slowMul = u.slowT > 0 ? (u.slowMul || 0.45) : 1;
        if (u.slowT > 0) u.slowT -= dt;
        if (u.stunT > 0) { u.stunT -= dt; u.moving = false; continue; }

        // 回復
        if (def.heal) {
          u.healCd -= dt;
          if (u.healCd <= 0) {
            let best = null, br = 1;
            for (const a of this.units) {
              if (a.side !== u.side || (a.state !== 'walk' && a.state !== 'attack')) continue;
              if (Math.abs(a.x - u.x) > def.heal.radius) continue;
              const r = a.hp / a.maxHp;
              if (r < br - 0.001) { br = r; best = a; }
            }
            if (best) {
              best.hp = Math.min(best.maxHp, best.hp + def.heal.amount);
              u.healT = 1;
              this.sprite('bluetop', best.x, best.depth, best.def.flying ? FLY : 0, 90, 0.55, { bottom: true });
              this.text(best.x, best.depth, this.unitTop(best), '+' + def.heal.amount, '#7dff8a', 13);
              u.healCd = def.heal.interval;
            } else u.healCd = 0.3;
          }
        }

        // 攻撃アニメ中
        u.atkCd -= dt * u.haste * slowMul;
        if (u.anim >= 0) {
          const prev = u.anim;
          u.anim += dt / u.animDur * u.haste * slowMul;
          const hitAt = def.ranged ? 0.7 : 0.55;
          if (prev < hitAt && u.anim >= hitAt) this.resolveHit(u);
          if (u.anim >= 1) u.anim = -1;
          u.moving = false;
          continue;
        }

        // 目標を探す
        const tgt = this.findTarget(u);
        const castleD = u.dir > 0 ? R.laneLength - u.x : u.x;
        const reach = def.range + (tgt ? radius(tgt.u.def) : 0);
        let attacking = null;
        if (tgt && tgt.fd <= reach) attacking = { unit: tgt.u };
        else if (castleD <= def.range + 6) attacking = { castle: 1 - u.side };

        if (attacking) {
          u.state = 'attack';
          u.moving = false;
          if (u.atkCd <= 0) {
            u.pending = attacking;
            u.anim = 0;
            u.animDur = Math.min(0.6, def.int * 0.85);
            u.atkCd = def.int;
          }
        } else {
          u.state = 'walk';
          u.moving = true;
          const sp = (u.charged ? def.speed : def.charge.speed) * slowMul;
          u.x += u.dir * sp * dt;
          u.walk += dt * slowMul * (u.charged ? 1 : 1.6);
          if (u.dir > 0) u.x = Math.min(u.x, R.laneLength - 4);
          else u.x = Math.max(u.x, 4);
        }
      }
      // 退場
      this.units = this.units.filter(u => !(u.state === 'dead' && u.deadT > 1.15));
    }

    findTarget(u) {
      const def = u.def;
      if (def.castleOnly) return null;
      const foes = this.enemiesOf(u);
      let assassinMode = false;
      if (def.assassin) {
        assassinMode = foes.some(e => e.def.ranged && !e.def.flying && (e.x - u.x) * u.dir > -10 && (e.x - u.x) * u.dir < 480);
      }
      let best = null, bd = Infinity;
      for (const e of foes) {
        if (e.def.flying && !def.hitsAir) continue;
        if (assassinMode && !(e.def.ranged && !e.def.flying)) continue;
        const d = (e.x - u.x) * u.dir;
        if (d < -24) continue;
        if (d < bd) { bd = d; best = e; }
      }
      return best ? { u: best, fd: Math.max(0, bd) } : null;
    }

    resolveHit(u) {
      const p = u.pending;
      u.pending = null;
      if (!p) return;
      const def = u.def;
      if (p.castle !== undefined) {
        if (def.ranged) {
          const face = p.castle === 0 ? 0 : R.laneLength;
          this.projectiles.push(this.makeProj({ kind: def.ranged, side: u.side, x: u.x + u.dir * 10, z: this.handZ(u), depth: u.depth, castle: p.castle, tx: face, dmg: def.atk, def, might: u.might, speed: 420 }));
          CTD.sfx && CTD.sfx(def.ranged === 'arrow' ? 'arrow' : def.ranged === 'rock' ? 'rock' : 'magic');
        } else {
          this.hitCastle(p.castle, def.atk * u.might * (def.castleMul || 1), u);
          this.slash(u);
        }
        return;
      }
      const t = p.unit;
      if (def.ranged) {
        const targets = [t];
        if (def.multi > 1) {
          const others = this.enemiesOf(u).filter(e => e !== t && (!e.def.flying || def.hitsAir) && Math.abs(e.x - u.x) <= def.range + 30)
            .sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x));
          for (let i = 1; i < def.multi; i++) targets.push(others[i - 1] || t);
        }
        targets.forEach((tg, i) => {
          this.projectiles.push(this.makeProj({ kind: def.ranged, side: u.side, x: u.x + u.dir * 10, z: this.handZ(u) + i * 6, depth: u.depth, target: tg, dmg: def.atk, def, might: u.might, speed: def.ranged === 'arrow' ? 480 : 360 }));
        });
        CTD.sfx && CTD.sfx(def.ranged === 'arrow' ? 'arrow' : def.ranged === 'rock' ? 'rock' : 'magic');
        return;
      }
      // 近接
      if (t.state !== 'walk' && t.state !== 'attack') return;
      if (Math.abs(t.x - u.x) > def.range + radius(t.def) + 24) return;
      if (def.splash) {
        for (const e of this.enemiesOf(u)) {
          if (e.def.flying) continue;
          if (Math.abs(e.x - t.x) <= def.splash) this.damage(e, def.atk * u.might * (e === t ? 1 : 0.7), def, u.side, false);
        }
        this.fxRing(t.x, t.depth, '#ffd27a', def.splash, 0.35);
        this.sprite('swordfire', t.x, t.depth, 30, def.splash * 2, 0.45, { flip: u.dir < 0 });
        this.shake = Math.max(this.shake, 0.25);
        CTD.sfx && CTD.sfx('smash');
      } else {
        this.damage(t, def.atk * u.might, def, u.side, false);
        CTD.sfx && CTD.sfx(def.large ? 'smash' : 'hit');
      }
      if (!u.charged && def.charge) {
        u.charged = true;
        if (!t.def.large && t.state !== 'dead') {
          t.x += u.dir * def.charge.push;
          t.x = Math.max(4, Math.min(R.laneLength - 4, t.x));
          t.stunT = def.charge.stun;
          t.anim = -1; t.pending = null;
        }
        this.fxRing(t.x, t.depth, '#ffffff', 50, 0.3);
        this.shake = Math.max(this.shake, 0.3);
      }
      this.slash(u);
    }

    damage(t, amount, srcDef, srcSide, ranged) {
      if (t.state === 'dead' || t.state === 'reviving') return;
      let d = amount;
      if (srcDef.vsLarge && t.def.large) d *= srcDef.vsLarge;
      if (srcDef.vsAir && t.def.flying) d *= srcDef.vsAir;
      if (ranged && t.def.rangedResist) d *= t.def.rangedResist;
      d = Math.round(d);
      t.hp -= d;
      t.flash = 1;
      const big = (srcDef.vsLarge && t.def.large) || (srcDef.vsAir && t.def.flying);
      this.text(t.x, t.depth, this.unitTop(t), String(d), big ? '#ffd23a' : (t.side === 0 ? '#ff9a8a' : '#ffffff'), big ? 17 : 13);
      if (t.hp <= 0) this.kill(t, srcSide);
    }

    kill(t, killerSide) {
      if (t.def.revive && !t.revived) {
        t.revived = true;
        t.state = 'reviving';
        t.reviveT = 1.3;
        t.hp = 0;
        t.anim = -1; t.pending = null;
        this.sprite('energy', t.x, t.depth, 20, 70, 0.6, { alpha: 0.7 });
        return;
      }
      t.state = 'dead';
      t.deadT = 0;
      t.anim = -1;
      this.sprite(t.def.large ? 'blackboom' : 'energy', t.x, t.depth, (t.def.flying ? FLY : 0) + 20, t.def.large ? 130 : 80, 0.8, { add: !t.def.large, alpha: 0.8 });
      CTD.sfx && CTD.sfx(t.def.large ? 'bigdeath' : 'death');
      if (killerSide !== undefined && killerSide !== t.side) {
        const bonus = Math.floor(t.def.cost / R.killBonusDiv);
        if (bonus > 0) {
          const s = this.sides[killerSide];
          s.mana = Math.min(R.maxMana, s.mana + bonus);
          if (killerSide === 0) {
            this.text(t.x, t.depth, this.unitTop(t) + 18, `+${bonus} マナ`, '#c49bff', 15);
            this.events.push({ type: 'bonus', n: bonus });
          }
        }
      }
    }

    hitCastle(sideIdx, amount, srcUnit) {
      const s = this.sides[sideIdx];
      amount = Math.round(amount);
      s.castle.hp = Math.max(0, s.castle.hp - amount);
      s.castle.hitT = 0.3;
      this.fx.push({ kind: 'cboom', x: (sideIdx === 0 ? -30 : R.laneLength + 30) + (Math.random() - 0.5) * 60, depth: 0.3, z: 40 + Math.random() * 140, size: amount >= 100 ? 110 : 70, life: 0.45, t: 0 });
      const x = sideIdx === 0 ? 10 : R.laneLength - 10;
      this.text(x + (sideIdx === 0 ? 20 : -20), 0.2, 150, String(amount), sideIdx === 0 ? '#ff6a5a' : '#ffe08a', amount >= 100 ? 22 : 16);
      if (sideIdx === 0) this.events.push({ type: 'castleHit' });
      this.shake = Math.max(this.shake, amount >= 100 ? 0.5 : 0.15);
      CTD.sfx && CTD.sfx('castle');
    }

    makeProj(o) {
      const p = Object.assign({ t: 0, sx: o.x, sz: o.z, arc: 0, alive: true }, o);
      const tx = o.target ? o.target.x : o.tx;
      p.dist0 = Math.max(30, Math.abs(tx - o.x));
      p.arc = (o.kind === 'arrow' || o.kind === 'bolt') ? Math.min(80, p.dist0 * 0.22) : 10;
      p.dur = p.dist0 / o.speed;
      return p;
    }

    updateProjectiles(dt) {
      for (const p of this.projectiles) {
        if (!p.alive) continue;
        const tg = p.target;
        let tx, tz;
        if (tg) {
          if (tg.state !== 'dead') { p.lx = tg.x; p.lz = this.unitMidZ(tg); p.ld = tg.depth; }
          tx = p.lx; tz = p.lz;
        } else { tx = p.tx; tz = 120; }
        p.t += dt / p.dur;
        const k = Math.min(1, p.t);
        const prevX = p.x, prevZ = p.z;
        p.x = p.sx + (tx - p.sx) * k;
        p.z = p.sz + (tz - p.sz) * k + Math.sin(k * Math.PI) * p.arc;
        if (tg && p.ld !== undefined) p.depth += (p.ld - p.depth) * Math.min(1, dt * 6);
        p.ang = Math.atan2(-(p.z - prevZ), (p.x - prevX) || 0.001);

        if (k >= 1) {
          p.alive = false;
          this.impact(p);
        }
      }
      this.projectiles = this.projectiles.filter(p => p.alive);
    }

    impact(p) {
      const def = p.def;
      if (p.castle !== undefined) {
        this.hitCastle(p.castle, p.dmg * p.might * (def.castleMul || 1));
        return;
      }
      const tg = p.target;
      if (def.splash) {
        const cx = tg ? (tg.state !== 'dead' ? tg.x : p.lx) : p.x;
        for (const e of this.units) {
          if (e.side === p.side || (e.state !== 'walk' && e.state !== 'attack')) continue;
          if (Math.abs(e.x - cx) <= def.splash) {
            this.damage(e, p.dmg * p.might, def, p.side, true);
            if (def.slow) { e.slowT = def.slow.time; e.slowMul = def.slow.mul; }
          }
        }
        this.fxRing(cx, p.depth, p.kind === 'frost' ? '#8ef0ff' : '#ff9a3a', def.splash, 0.45);
        if (p.kind === 'frost') { this.sprite('energy', cx, p.depth, 30, def.splash * 1.8, 0.7); this.sprite('rain', cx, p.depth, 4, def.splash * 1.6, 0.9, { alpha: 0.9 }); }
        else { this.sprite('firesign', cx, p.depth, 20, def.splash * 2.2, 0.7); this.sprite('flames', cx, p.depth, 0, def.splash * 1.4, 0.6, { bottom: true }); }
        CTD.sfx && CTD.sfx(p.kind === 'frost' ? 'frost' : 'boom');
        return;
      }
      if (tg && (tg.state === 'walk' || tg.state === 'attack')) {
        this.damage(tg, p.dmg * p.might, def, p.side, true);
        CTD.sfx && CTD.sfx('arrowhit', 0.5);
      }
      if (p.kind === 'rock') { this.burst(p.x, p.depth, p.z, '#b08a5a', 8); this.sprite('energy', p.x, p.depth, p.z, 60, 0.5, { alpha: 0.6 }); }
      else if (p.kind === 'leaf') this.sprite('lightning', p.x, p.depth, p.z, 50, 0.4);
    }

    // ---- 位置のヘルパー ----
    unitMidZ(u) { return (u.def.flying ? FLY : 0) + CTD.unitHeight(u.id) * UNIT_SCALE * 0.5; }
    unitTop(u) { return (u.def.flying ? FLY : 0) + CTD.unitHeight(u.id) * UNIT_SCALE + 6; }
    handZ(u) { return (u.def.flying ? FLY : 0) + CTD.unitHeight(u.id) * UNIT_SCALE * 0.62; }

    // ---- 演出 ----
    text(x, depth, z, str, color, size) {
      this.texts.push({ x: x + (Math.random() - 0.5) * 14, depth, z, str, color, size, t: 0 });
    }
    sprite(name, x, depth, z, size, life, opts = {}) { this.fx.push({ kind: 'sprite', name, x, depth, z, size, life, t: 0, opts }); }
    fxRing(x, depth, color, r, life) { this.fx.push({ kind: 'ring', x, depth, color, r, life, t: 0 }); }
    dust(x, depth, n) {
      for (let i = 0; i < n; i++) this.fx.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 30, depth, z: 2, vx: (Math.random() - 0.5) * 60, vz: 20 + Math.random() * 40, r: 4 + Math.random() * 6, life: 0.6 + Math.random() * 0.3, t: 0 });
    }
    sparkle(u, color, n) {
      for (let i = 0; i < n; i++) this.fx.push({ kind: 'spark', x: u.x + (Math.random() - 0.5) * 24, depth: u.depth, z: this.unitMidZ(u) + (Math.random() - 0.5) * 30, vx: 0, vz: 30 + Math.random() * 30, color, r: 2.5, life: 0.8, t: 0 });
    }
    burst(x, depth, z, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
        this.fx.push({ kind: 'spark', x, depth, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, color, r: 2 + Math.random() * 2.5, life: 0.4 + Math.random() * 0.3, t: 0, grav: 1 });
      }
    }
    trail(p) {
      const c = { fire: '#ffb04a', frost: '#aef4ff', leaf: '#9cff8a', spark: '#e6b8ff' }[p.kind] || '#fff';
      this.fx.push({ kind: 'spark', x: p.x, depth: p.depth, z: p.z, vx: 0, vz: 0, color: c, r: 2.5, life: 0.3, t: 0 });
    }
    slash(u) {
      this.fx.push({ kind: 'slash', x: u.x + u.dir * (u.def.range * 0.6 + 8), depth: u.depth, z: this.unitMidZ(u), dir: u.dir, big: u.def.large, life: 0.18, t: 0 });
    }
    explosion(x, depth) {
      this.fx.push({ kind: 'cboom', x, depth, z: 60 + Math.random() * 160, size: 150, life: 0.6, t: 0 });
      this.sprite('blackboom', x, depth, 80 + Math.random() * 120, 200, 1.2, { add: false, alpha: 0.85 });
      CTD.sfx && CTD.sfx('boom');
    }
    updateFx(dt) {
      for (const f of this.fx) {
        f.t += dt;
        if (f.kind === 'dust' || f.kind === 'spark') {
          f.x += (f.vx || 0) * dt; f.z += (f.vz || 0) * dt;
          if (f.grav) f.vz -= 220 * dt;
          if (f.kind === 'dust') f.vz *= 0.92;
        }
      }
      this.fx = this.fx.filter(f => f.t < f.life);
      for (const tx of this.texts) { tx.t += dt; tx.z += dt * 30; }
      this.texts = this.texts.filter(tx => tx.t < 0.9);
    }

    // ---- 描画 ----
    render(ctx) {
      ctx.save();
      if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 10, (Math.random() - 0.5) * this.shake * 8);
      CTD.drawBackground(ctx, this.world.bg, W, H);
      CTD.drawAmbient(ctx, this.world.bg, W, GROUND, this.t);

      // 中央線と出撃ゾーン
      const cxs = sx(R.center);
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cxs, FEET0 - 26); ctx.lineTo(cxs, FEET1 + 22); ctx.stroke();
      ctx.restore();
      if (this.drag) {
        const z = R.playerZone;
        const pulse = 0.18 + 0.08 * Math.sin(this.t * 6);
        ctx.fillStyle = `rgba(80,160,255,${pulse})`;
        ctx.fillRect(sx(z[0]), FEET0 - 30, sx(z[1]) - sx(z[0]), FEET1 - FEET0 + 56);
        ctx.strokeStyle = 'rgba(120,190,255,0.9)'; ctx.lineWidth = 2;
        ctx.strokeRect(sx(z[0]), FEET0 - 30, sx(z[1]) - sx(z[0]), FEET1 - FEET0 + 56);
        ctx.fillStyle = 'rgba(255,80,80,0.12)';
        ctx.fillRect(sx(z[1]), FEET0 - 30, sx(R.laneLength) - sx(z[1]), FEET1 - FEET0 + 56);
      }

      // 城
      const [p, e] = this.sides;
      CTD.drawCastle(ctx, 64, CASTLE_Y, 1, p.castle.hp / p.castle.max, this.t, p.castle.hitT);
      CTD.drawCastle(ctx, W - 64, CASTLE_Y, -1, e.castle.hp / e.castle.max, this.t, e.castle.hitT);

      // 地上の演出(リング)
      for (const f of this.fx) {
        if (f.kind !== 'ring') continue;
        const k = f.t / f.life;
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(sx(f.x), fy(f.depth), f.r * XS * (0.4 + k * 0.6), f.r * 0.28 * (0.4 + k * 0.6), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // ユニット(奥から手前、飛行は最後)
      const list = this.units.slice().sort((a, b) => (a.def.flying - b.def.flying) || (a.depth - b.depth));
      for (const u of list) this.drawShadow(ctx, u);
      for (const u of list) this.drawUnit(ctx, u);

      // ドラッグ中のゴースト
      if (this.drag && this.drag.id) {
        const d = this.drag;
        const def = CTD.CARDS[d.id];
        ctx.save();
        ctx.globalAlpha = 0.55;
        const gx = sx(d.x), gy = fy(d.depth) - (def.flying ? FLY : 0);
        ctx.translate(gx, gy);
        ctx.scale(UNIT_SCALE, UNIT_SCALE);
        CTD.drawUnit(ctx, d.id, { anim: 'idle', t: this.t });
        ctx.restore();
        ctx.strokeStyle = d.valid ? '#7ac0ff' : '#ff5a5a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(gx, fy(d.depth), 22, 7, 0, 0, Math.PI * 2); ctx.stroke();
        if (def.range > 60) {
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(gx, fy(d.depth)); ctx.lineTo(gx + def.range * XS, fy(d.depth)); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (!d.valid) {
          ctx.fillStyle = '#ff5a5a';
          ctx.font = 'bold 16px "M PLUS Rounded 1c", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('自陣にしか出せない', gx, fy(d.depth) - 90);
        }
      }

      // 弾
      for (const pr of this.projectiles) this.drawProj(ctx, pr);

      // 粒子
      for (const f of this.fx) {
        if (f.kind === 'ring') continue;
        const k = f.t / f.life;
        const x = sx(f.x), y = fy(f.depth) - (f.z || 0);
        if (f.kind === 'dust') {
          ctx.fillStyle = `rgba(220,200,170,${0.55 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(x, y, f.r * (1 + k), 0, Math.PI * 2); ctx.fill();
        } else if (f.kind === 'spark') {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(x, y, f.r, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        } else if (f.kind === 'sprite') {
          CTD.drawFx(ctx, f.name, x, y, k, f.size, f.opts);
        } else if (f.kind === 'cboom') {
          const fr = Math.min(4, Math.floor(k * 5));
          const im = CTD.IMG['c:p' + (54 + fr)];
          if (im) { const sz = f.size * (0.7 + k * 0.5); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; ctx.drawImage(im, x - sz / 2, y - sz / 2, sz, sz); ctx.globalAlpha = 1; }
        } else if (f.kind === 'slash') {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(f.dir, 1);
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = f.big ? 5 : 3;
          ctx.beginPath(); ctx.arc(-6, 0, f.big ? 30 : 18, -1.1, 0.9); ctx.stroke();
          ctx.restore();
        }
      }

      // ダメージ数字
      ctx.textAlign = 'center';
      for (const tx of this.texts) {
        const k = tx.t / 0.9;
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.font = `900 ${tx.size}px "M PLUS Rounded 1c", sans-serif`;
        const x = sx(tx.x), y = fy(tx.depth) - tx.z;
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(20,16,30,0.9)';
        ctx.strokeText(tx.str, x, y);
        ctx.fillStyle = tx.color;
        ctx.fillText(tx.str, x, y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    drawShadow(ctx, u) {
      const x = sx(u.x), y = fy(u.depth);
      const r = u.def.large ? 26 : u.def.flying ? 10 : 15;
      const a = u.state === 'dead' ? Math.max(0, 1 - u.deadT) : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y + 1, r, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      // 足元の陣営マーク
      if (u.state !== 'dead') {
        ctx.strokeStyle = u.side === 0 ? '#3a8cff' : '#ff4a3a';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y + 1, r + 3, (r + 3) * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawUnit(ctx, u) {
      const x = sx(u.x);
      let y = fy(u.depth);
      const def = u.def;
      if (def.flying) y -= FLY + Math.sin(this.t * 3 + u.uid) * 4;
      ctx.save();
      ctx.translate(x, y);
      let alpha = 1;
      if (u.state === 'spawn') {
        const k = 1 - u.spawnT / 0.35;
        alpha = k;
        ctx.translate(0, -(1 - k) * 20);
      }
      if (u.state === 'dead') {
        alpha = u.deadT < 0.75 ? 1 : Math.max(0, 1 - (u.deadT - 0.75) / 0.35);
      }
      if (u.state === 'reviving') {
        const k = Math.max(0, 1 - u.reviveT / 1.3);
        ctx.rotate(-u.dir * (1 - k) * 1.3);
        alpha = 0.6 + 0.4 * k;
      }
      ctx.globalAlpha = alpha;
      ctx.scale(u.dir * UNIT_SCALE, UNIT_SCALE);
      if (u.stunT > 0) ctx.rotate(-0.12);
      let pose;
      if (u.state === 'dead') pose = { anim: 'die', p: Math.min(1, u.deadT / 0.7) };
      else if (u.anim >= 0) pose = { anim: 'attack', p: u.anim };
      else if (u.moving) pose = { anim: 'walk', t: u.walk, rate: def.speed / 42 };
      else pose = { anim: 'idle', t: this.t + u.uid * 0.37 };
      if (u.flash > 0 && CTD.supportsFilter) ctx.filter = `brightness(${1 + u.flash * 1.4})`;
      CTD.drawUnit(ctx, u.id, pose);
      ctx.filter = 'none';
      ctx.restore();
      ctx.globalAlpha = 1;

      // 状態異常
      if (u.slowT > 0 && u.state !== 'dead') {
        ctx.fillStyle = 'rgba(140,230,255,0.35)';
        ctx.beginPath(); ctx.ellipse(x, fy(u.depth), 20, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (u.stunT > 0) {
        for (let i = 0; i < 3; i++) {
          const a = this.t * 6 + i * 2.1;
          ctx.fillStyle = '#ffe36a';
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 12, y - CTD.unitHeight(u.id) - 4 + Math.sin(a) * 3, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (u.haste > 1 || u.might > 1) {
        ctx.fillStyle = u.might > 1 ? 'rgba(255,120,80,0.8)' : 'rgba(200,160,255,0.8)';
        const yy = y - CTD.unitHeight(u.id) - 16;
        ctx.beginPath(); ctx.moveTo(x - 4, yy); ctx.lineTo(x, yy - 6); ctx.lineTo(x + 4, yy); ctx.closePath(); ctx.fill();
      }
      // HP バー
      if (u.state === 'walk' || u.state === 'attack' || u.state === 'spawn') {
        const w = def.large ? 46 : 30;
        const by = y - CTD.unitHeight(u.id) * UNIT_SCALE - 8;
        const r = Math.max(0, u.hp / u.maxHp);
        ctx.fillStyle = 'rgba(15,12,25,0.8)';
        CTD.rrect(ctx, x - w / 2 - 1.5, by - 1.5, w + 3, 7, 3); ctx.fill();
        ctx.fillStyle = u.side === 0 ? '#3d93ff' : '#ff4f43';
        if (r > 0) { CTD.rrect(ctx, x - w / 2, by, w * r, 4, 2); ctx.fill(); }
      }
    }

    drawProj(ctx, p) {
      const x = sx(p.x), y = fy(p.depth) - p.z;
      ctx.save();
      ctx.translate(x, y);
      if (p.kind === 'arrow' || p.kind === 'bolt') {
        ctx.rotate(p.ang || 0);
        const L = p.kind === 'bolt' ? 16 : 20;
        ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = p.kind === 'bolt' ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.fillStyle = '#e8eef4';
        ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = p.side === 0 ? '#7ab8ff' : '#ff8a7a';
        ctx.fillRect(-L, -2.5, 5, 5);
      } else if (p.kind === 'rock') {
        const im = CTD.IMG['c:p29'];
        ctx.rotate(p.t * 12 * (p.side === 0 ? 1 : -1));
        if (im) ctx.drawImage(im, -13, -13, 26, 26);
      } else if (p.kind === 'fire') {
        CTD.drawFx(ctx, 'fireball', 0, 0, 0.3 + (p.t % 0.25), 70, { rot: p.ang, flip: p.side !== 0 && false });
      } else if (p.kind === 'frost') {
        CTD.drawFx(ctx, 'lightning', 0, 0, p.t, 44, { loop: true, fps: 24 });
      } else if (p.kind === 'leaf') {
        CTD.drawFx(ctx, 'lightning', 0, 0, p.t, 30, { loop: true, fps: 24, alpha: 0.8 });
      } else {
        const c = { fire: ['#fff3b0', '#ff7a1a'], frost: ['#ffffff', '#4ad8ff'], leaf: ['#eaffd0', '#4ad84a'], spark: ['#ffffff', '#b07aff'] }[p.kind] || ['#fff', '#aaa'];
        const r = p.kind === 'fire' || p.kind === 'frost' ? 9 : 6;
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 1.8);
        g.addColorStop(0, c[0]); g.addColorStop(0.45, c[1]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  CTD.Battle = Battle;
  // Safari の古い版は ctx.filter 非対応
  try {
    const t = document.createElement('canvas').getContext('2d');
    t.filter = 'brightness(2)';
    CTD.supportsFilter = t.filter === 'brightness(2)';
  } catch (e) { CTD.supportsFilter = false; }
})(window.CTD);
