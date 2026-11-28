// バトルの CPU。止めを刺せるなら城へ、そうでなければ得な交換をしながら盤面を取る。
import { CARDS } from '../data/defs.ts';
import type { BAction, Battle, BattleController, Target, Unit } from './battle.ts';

const unitValue = (u: Unit) => u.atk * 1.2 + u.hp + (u.kw.includes('guard') ? 1 : 0) + (u.shield ? 1.5 : 0) + (u.kw.includes('ranged') ? 1 : 0) + (CARDS[u.card].fx?.some((f) => f.kind === 'siege') ? 3 : 0);
const cardValue = (id: string) => {
  const c = CARDS[id];
  if (c.type === 'unit') return (c.atk ?? 0) * 1.2 + (c.hp ?? 0) + (c.kw?.length ?? 0) + (c.fx?.length ?? 0) * 1.5;
  return c.cost * 2;
};

export class BattleAI implements BattleController {
  skill: number;
  constructor(skill = 0.7) {
    this.skill = skill;
  }

  private slip(b: Battle) {
    return b.rng.chance((1 - this.skill) * 0.25);
  }

  async act(b: Battle, side: 0 | 1): Promise<BAction> {
    const me = b.sides[side];
    const foe = b.other(side);
    const them = b.sides[foe];

    // 1) 止めを刺せるか（城を殴れる兵＋城に撃てる呪文）
    const faceAttackers = me.field.filter((u) => b.attackTargets(u).some((t) => t.kind === 'face'));
    let reach = faceAttackers.reduce((a, u) => a + u.atk + (me.hero === 'barbarian' ? 1 : 0), 0);
    let mana = me.mana;
    const burn = me.hand
      .map((c, i) => ({ c, i, d: this.faceDamage(b, side, c) }))
      .filter((x) => x.d > 0)
      .sort((x, y) => y.d / Math.max(1, CARDS[y.c].cost) - x.d / Math.max(1, CARDS[x.c].cost));
    const usable: typeof burn = [];
    for (const x of burn) {
      if (CARDS[x.c].cost <= mana && b.canPlay(side, x.i)) {
        mana -= CARDS[x.c].cost;
        reach += x.d;
        usable.push(x);
      }
    }
    if (reach >= them.hp) {
      if (faceAttackers.length) return { type: 'attack', uid: faceAttackers[0].uid, target: { kind: 'face', side: foe } };
      if (usable.length) return { type: 'play', hand: usable[0].i, target: { kind: 'face', side: foe } };
    }

    // 2) カードを出す（価値の高いものから）
    const plays = me.hand
      .map((c, i) => ({ c, i }))
      .filter((x) => b.canPlay(side, x.i))
      .map((x) => ({ ...x, ...this.evalPlay(b, side, x.c) }))
      .filter((x) => x.v > 0)
      .sort((x, y) => y.v - x.v || CARDS[y.c].cost - CARDS[x.c].cost);
    if (plays.length && !this.slip(b)) return { type: 'play', hand: plays[0].i, target: plays[0].target };

    // 3) 攻撃
    const ready = me.field.filter((u) => b.attackTargets(u).length).sort((x, y) => y.atk - x.atk);
    for (const u of ready) {
      const t = this.chooseAttack(b, u);
      if (t) return { type: 'attack', uid: u.uid, target: t };
    }
    if (plays.length) return { type: 'play', hand: plays[0].i, target: plays[0].target };
    return { type: 'end' };
  }

  private faceDamage(b: Battle, side: 0 | 1, card: string) {
    const c = CARDS[card];
    let d = 0;
    for (const f of c.fx ?? []) if (f.kind === 'damage' && f.target !== 'enemyUnit') d += c.type === 'spell' ? b.spellDamage(side, f.n) : f.n;
    if (c.type === 'unit' && c.kw?.includes('rush')) d += c.atk ?? 0;
    return d;
  }

  /** カードを出す価値と対象 */
  private evalPlay(b: Battle, side: 0 | 1, card: string): { v: number; target?: Target } {
    const c = CARDS[card];
    const me = b.sides[side];
    const foe = b.other(side);
    const them = b.sides[foe];
    const f = c.fx?.[0];
    if (c.type === 'unit') {
      let v = cardValue(card) + c.cost;
      let target: Target | undefined;
      if (f && f.kind === 'damage' && f.target !== 'enemyFace') {
        const best = this.bestDamageTarget(b, side, f.n, f.target === 'enemyAny', false);
        target = best.target;
        v += best.v;
      }
      return { v, target };
    }
    if (!f) return { v: 0 };
    switch (f.kind) {
      case 'damage': {
        if (f.target === 'enemyFace') return { v: 2 };
        const best = this.bestDamageTarget(b, side, f.n, f.target === 'enemyAny', true);
        // 隕石は城にも当たる
        const extra = c.fx!.slice(1).reduce((a, g) => a + (g.kind === 'damage' ? g.n : 0), 0);
        return { v: best.v + extra, target: best.target };
      }
      case 'aoe': {
        const n = b.spellDamage(side, f.n);
        const kills = them.field.filter((u) => !u.shield && u.hp <= n);
        const v = kills.reduce((a, u) => a + unitValue(u), 0) + them.field.length - c.cost * 1.5;
        return { v: kills.length >= 2 || v > 8 ? v : 0 };
      }
      case 'heal': {
        const lost = me.maxHp - me.hp;
        return { v: lost >= f.n ? f.n + (me.hp < 8 ? 6 : 0) : 0 };
      }
      case 'buff': {
        const ts = me.field.filter((u) => u.ready || u.kw.includes('guard'));
        if (!ts.length) return { v: 0 };
        const t = ts.sort((x, y) => unitValue(y) - unitValue(x))[0];
        return { v: 4 + f.atk + f.hp, target: { kind: 'unit', uid: t.uid } };
      }
      case 'buffAll':
        return { v: me.field.length * 2 };
      case 'draw':
        return { v: me.hand.length <= 3 ? 6 : 2 };
      case 'summon':
        return { v: 5 };
      default:
        return { v: 1 };
    }
  }

  /** ダメージの一番いい使い道 */
  private bestDamageTarget(b: Battle, side: 0 | 1, base: number, face: boolean, spell: boolean): { v: number; target?: Target } {
    const foe = b.other(side);
    const n = spell ? b.spellDamage(side, base) : base;
    let best: { v: number; target?: Target } = { v: face ? n * 0.8 : 0, target: face ? { kind: 'face', side: foe } : undefined };
    for (const u of b.sides[foe].field) {
      let v: number;
      if (u.shield) v = 1.5;
      else if (u.hp <= n) v = unitValue(u) + 2;
      else v = n * 0.5;
      if (v > best.v) best = { v, target: { kind: 'unit', uid: u.uid } };
    }
    return best;
  }

  private chooseAttack(b: Battle, u: Unit): Target | null {
    const ts = b.attackTargets(u);
    if (!ts.length) return null;
    const foe = b.other(u.side);
    const ranged = u.kw.includes('ranged');
    let best: Target | null = null;
    let bv = -Infinity;
    for (const t of ts) {
      let v: number;
      if (t.kind === 'face') {
        v = u.atk * 1.1 + (b.sides[foe].hp <= 10 ? 3 : 0);
      } else {
        const e = b.unit(t.uid)!;
        const kills = !e.shield && e.hp <= u.atk;
        const dies = !ranged && !u.shield && e.atk >= u.hp;
        v = (kills ? unitValue(e) + 1 : e.shield ? 1 : 0) - (dies ? unitValue(u) : 0);
        if (e.kw.includes('guard')) v += 1;
        if (!kills && !e.shield && dies) v -= 3;
      }
      if (this.slip(b)) v += b.rng.int(-3, 3);
      if (v > bv) {
        bv = v;
        best = t;
      }
    }
    // 守護がいて、どれも損な攻撃なら見送る（ただし守護しか殴れない時は少しでも削る）
    if (best && best.kind === 'unit' && bv < -2) return null;
    return best;
  }
}
