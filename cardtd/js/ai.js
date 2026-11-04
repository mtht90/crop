/* カードTD — CPU の思考(プレイヤーと同じルール・同じ手札の仕組みで動く) */
(function (CTD) {
  'use strict';

  const R = CTD.RULES;
  const lerp = (a, b, k) => a + (b - a) * k;

  class CpuAI {
    constructor(battle, sideIdx, skill) {
      this.b = battle;
      this.idx = sideIdx;
      this.skill = Math.max(0, Math.min(1, skill));
      this.cd = 1.5 + Math.random();
      this.saveFor = this.pickSaveTarget();
    }

    pickSaveTarget() {
      // 賢いほどマナを貯めてまとめて攻める
      const k = this.skill;
      return Math.round(lerp(4, 9, k) + (Math.random() - 0.5) * 2);
    }

    side() { return this.b.sides[this.idx]; }

    update(dt) {
      const b = this.b;
      if (b.ready > 0 || b.over) return;
      this.cd -= dt * b.speed;
      if (this.cd > 0) return;
      this.cd = lerp(3.2, 0.45, this.skill) + Math.random() * lerp(1.6, 0.3, this.skill);
      this.think();
    }

    think() {
      const b = this.b, s = this.side();
      const dir = s.dir; // CPU は -1(左へ進む)
      const mine = (x) => (this.idx === 1 ? x : R.laneLength - x); // 自分の城からの近さに変換用
      const foes = b.units.filter(u => u.side !== this.idx && u.state !== 'dead' && u.state !== 'reviving');
      const allies = b.units.filter(u => u.side === this.idx && u.state !== 'dead');
      const slots = s.hand.map((h, i) => ({ i, h, def: CTD.CARDS[h.id] })).filter(o => o.h.cd <= 0);
      const playable = slots.filter(o => o.def.cost <= s.mana);

      // 序盤のステージは同時に出す兵の数を絞る(ルールは同じ。CPU の遠慮だけ)
      const cap = b.stage.maxUnits;
      if (cap && allies.reduce((a, u) => a + 1 / u.def.count, 0) >= cap) return;
      // 弱いCPUはぼんやりする
      if (Math.random() < Math.pow(1 - this.skill, 1.5) * 0.6) return;

      // 脅威 = 自陣に近づいている敵(CPU 側から見て中央線を越えそう)
      const threats = foes.filter(u => mine(u.x) > 340 || (u.def.castleOnly && mine(u.x) > 200));
      const threatCost = threats.reduce((a, u) => a + u.def.cost * (u.hp / u.maxHp) / u.def.count, 0);
      const front = threats.length ? threats.reduce((a, u) => (mine(u.x) > mine(a.x) ? u : a)) : null;
      const defenders = allies.filter(u => !front || Math.abs(u.x - front.x) < 260);
      const defCost = defenders.reduce((a, u) => a + u.def.cost * (u.hp / u.maxHp) / u.def.count, 0);

      if (front && threatCost > defCost * 0.75) {
        if (!playable.length) return;
        const pick = this.bestCounter(playable, threats);
        if (!pick) return;
        let x;
        const fx = front.x;
        const z = s.zone();
        if (pick.def.ranged) x = fx - dir * pick.def.range * 0.75;
        else if (pick.def.castleOnly) x = z[1] - 10; // 飛行で攻め返す
        else x = fx - dir * 70;
        x = Math.max(z[0] + 10, Math.min(z[1] - 4, x));
        this.play(pick.i, x);
        return;
      }

      // 攻め: マナを貯めてから、壁 → 支援の順に出す
      const pushers = allies.filter(u => !u.def.flying || !u.def.castleOnly);
      const lead = pushers.length ? pushers.reduce((a, u) => (mine(u.x) < mine(a.x) ? u : a)) : null;
      const z = s.zone();
      if (lead && mine(lead.x) < 650 && playable.length) {
        // 前線を支援:遠距離・支援を後ろに
        const sup = this.bestSupport(playable, lead, foes);
        if (sup && s.mana >= Math.min(R.maxMana, sup.def.cost + lerp(0, 2, this.skill))) {
          const x = Math.max(z[0] + 10, Math.min(z[1] - 4, lead.x - dir * (sup.def.ranged ? 60 : 30)));
          this.play(sup.i, x);
          return;
        }
      }
      if (s.mana < Math.min(R.maxMana - 0.2, this.saveFor)) return;
      if (!playable.length) return;
      const opener = this.bestOpener(playable);
      if (!opener) return;
      // 後ろ(城の近く)から出してマナを稼ぎつつ押し上げる
      const back = this.idx === 1 ? z[1] - 10 - Math.random() * 40 : z[0] + 10 + Math.random() * 40;
      this.play(opener.i, opener.def.castleOnly ? z[0] + 20 : back);
      this.saveFor = this.pickSaveTarget();
    }

    play(slot, x) {
      const depth = 0.15 + Math.random() * 0.7;
      this.b.play(this.idx, slot, x, depth);
    }

    noise(scale) { return (Math.random() - 0.5) * scale * (1 - this.skill); }

    bestCounter(cards, threats) {
      const air = threats.filter(u => u.def.flying).length;
      const ground = threats.length - air;
      const swarm = threats.filter(u => !u.def.large && u.def.hp < 300).length;
      const large = threats.filter(u => u.def.large).length;
      const ranged = threats.filter(u => u.def.ranged && !u.def.flying).length;
      let best = null, bs = -Infinity;
      for (const c of cards) {
        const d = c.def;
        let s = d.hp / 220 + (d.atk / d.int) / 18;
        if (air) s += d.hitsAir ? 4 + air * 1.5 + (d.vsAir ? 3 : 0) : -3 * air / Math.max(1, threats.length);
        if (!ground && !d.hitsAir) s -= 12;
        if (swarm >= 3 && d.splash) s += 6;
        if (large && d.vsLarge) s += 7;
        if (large && d.atk / d.int > 45) s += 2;
        if (ranged && d.assassin) s += 4;
        if (d.castleOnly) s -= 9;
        if (d.heal || d.aura) s -= 2;
        s -= d.cost * 0.25;
        s += this.noise(8);
        if (s > bs) { bs = s; best = c; }
      }
      return best;
    }

    bestSupport(cards, lead, foes) {
      let best = null, bs = 0;
      const airFoes = foes.some(u => u.def.flying);
      for (const c of cards) {
        const d = c.def;
        let s = 0;
        if (d.ranged) s += 3;
        if (d.heal) s += 3;
        if (d.aura) s += 4;
        if (airFoes && d.hitsAir) s += 2;
        if (d.large || d.hp > 600) s -= 2;
        s += this.noise(6);
        if (s > bs) { bs = s; best = c; }
      }
      return best;
    }

    bestOpener(cards) {
      let best = null, bs = -Infinity;
      for (const c of cards) {
        const d = c.def;
        let s = d.hp / 200;
        if (d.large) s += 3;
        if (d.castleOnly) s += this.skill * 2.5;
        if (d.ranged && !d.flying) s -= 1;
        s += this.noise(10);
        if (s > bs) { bs = s; best = c; }
      }
      return best;
    }
  }

  CTD.CpuAI = CpuAI;
})(window.CTD);
